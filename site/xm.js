// FastTracker 2 modules into stereo PCM, with the subset of FT2 replay the three Supaplex songs use.
const RAMP_MS = 5, AMP = 0.5;

function parse(buffer) {
  const v = new DataView(buffer), u8 = (o) => v.getUint8(o), u16 = (o) => v.getUint16(o, true), u32 = (o) => v.getUint32(o, true);
  const channels = u16(68), np = u16(70), ni = u16(72);
  const song = {
    channels, restart: u16(66), linear: u16(74) & 1, speed: u16(76), bpm: u16(78),
    order: Array.from({ length: u16(64) }, (_, i) => u8(80 + i)), patterns: [], instruments: [],
  };
  let o = 60 + u32(60);
  for (let p = 0; p < np; p++) {
    const rows = u16(o + 5), end = o + u32(o) + u16(o + 7);
    const cells = Array.from({ length: rows * channels }, () => [0, 0, 0, 0, 0]);
    o += u32(o);
    for (let k = 0; o < end; k++) {
      const c = u8(o++), cell = cells[k];
      if (c & 0x80) for (let j = 0; j < 5; j++) { if ((c >> j) & 1) cell[j] = u8(o++); }
      else { cell[0] = c; for (let j = 1; j < 5; j++) cell[j] = u8(o++); }
    }
    song.patterns.push({ rows, cells });
  }
  for (let i = 0; i < ni; i++) {
    const size = u32(o), ns = u16(o + 27), ins = { samples: [], map: [], env: [], flags: 0, fadeout: 0 };
    song.instruments.push(ins);
    if (!ns) { o += size; continue; }
    const shs = u32(o + 29);
    ins.map = Array.from({ length: 96 }, (_, j) => u8(o + 33 + j));
    ins.env = Array.from({ length: Math.min(12, u8(o + 225)) }, (_, j) => [u16(o + 129 + j * 4), u16(o + 131 + j * 4)]);
    Object.assign(ins, { sustain: u8(o + 227), loopStart: u8(o + 228), loopEnd: u8(o + 229), flags: u8(o + 233), fadeout: u16(o + 239) });
    o += size;
    const heads = Array.from({ length: ns }, (_, s) => {
      const h = o + s * shs;
      return { bytes: u32(h), loopStart: u32(h + 4), loopLen: u32(h + 8), vol: u8(h + 12), ft: v.getInt8(h + 13), type: u8(h + 14), pan: u8(h + 15), rel: v.getInt8(h + 16) };
    });
    o += ns * shs;
    for (const h of heads) {
      const wide = h.type & 16, n = wide ? h.bytes >> 1 : h.bytes, raw = new Float32Array(n);
      for (let j = 0, acc = 0; j < n; j++) {
        acc = wide ? ((acc + v.getInt16(o + j * 2, true)) << 16) >> 16 : ((acc + v.getInt8(o + j)) << 24) >> 24;
        raw[j] = acc / (wide ? 32768 : 128);
      }
      o += h.bytes;
      const loopStart = wide ? h.loopStart >> 1 : h.loopStart, loopLen = Math.min(wide ? h.loopLen >> 1 : h.loopLen, n - loopStart);
      const loop = h.type & 3 && loopLen > 0 ? h.type & 3 : 0, end = loop ? loopStart + loopLen : n;
      // One guard sample past the end so interpolation reads what plays next.
      const data = new Float32Array(end + 1);
      data.set(raw.subarray(0, end));
      data[end] = loop === 1 ? raw[loopStart] : loop ? raw[end - 1] : 0;
      ins.samples.push({ data, end, loopStart, loopLen, loop, vol: Math.min(h.vol, 64), pan: h.pan, ft: h.ft, rel: h.rel });
    }
  }
  return song;
}

function envAt(env, x) {
  let j = 0;
  while (j < env.length - 1 && env[j + 1][0] <= x) j++;
  const [x0, y0] = env[j], [x1, y1] = env[j + 1] ?? env[j];
  return x1 > x0 && x < x1 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y0;
}

// Fadeout, volume envelope and default volume into this tick's gain, FT2 order.
function gain(c) {
  const ins = c.ins;
  if (c.keyOff) c.fade = Math.max(0, c.fade - ins.fadeout);
  let g = (c.vol / 64) * (c.fade / 32768);
  if (ins.flags & 1 && ins.env.length) {
    const env = ins.env;
    g *= Math.min(64, Math.max(0, envAt(env, c.envPos))) / 64;
    if (!(ins.flags & 2 && !c.keyOff && c.envPos === env[ins.sustain]?.[0])) {
      c.envPos++;
      if (ins.flags & 4 && c.envPos === env[ins.loopEnd]?.[0]) c.envPos = env[ins.loopStart][0];
    }
  }
  return g;
}

function mix(v, L, R, at, n) {
  const s = v.s, d = s.data;
  for (let k = at; k < at + n; k++) {
    if (v.ramp) {
      v.l += v.dl; v.r += v.dr;
      if (!--v.ramp && v.ghost) return (v.done = true);
    }
    const i = v.pos | 0, x = d[i] + (d[i + 1] - d[i]) * (v.pos - i);
    L[k] += x * v.l; R[k] += x * v.r;
    v.pos += v.step * v.dir;
    if (v.dir > 0 && v.pos >= s.end) {
      if (!s.loop) return (v.done = true);
      if (s.loop === 1) while (v.pos >= s.end) v.pos -= s.loopLen;
      else { v.pos = Math.max(s.loopStart, 2 * (s.end - 1) - v.pos); v.dir = -1; }
    } else if (v.dir < 0 && v.pos < s.loopStart) {
      v.pos = Math.min(s.end - 1, 2 * s.loopStart - v.pos); v.dir = 1;
    }
  }
}

// Renders the whole song once, from order 0 to the end of the order list (or until a pattern jump would loop back), into stereo PCM.
export function render(buffer, rate) {
  const song = parse(buffer), ramp = Math.round((rate * RAMP_MS) / 1000);
  const chans = Array.from({ length: song.channels }, () => ({ ins: null, num: 0, vol: 0, pan: 128, keyOff: false, fade: 32768, envPos: 0, slide: 0, voice: null }));
  const ghosts = [], seen = new Map(), blank = { rows: 64, cells: [] };
  let L = new Float32Array(rate * 60), R = new Float32Array(rate * 60), t = 0, frac = 0, loop = 0;
  let { speed, bpm } = song, ord = 0, row = 0;

  const retire = (c) => {
    if (!c.voice) return;
    Object.assign(c.voice, { ghost: true, ramp, dl: -c.voice.l / ramp, dr: -c.voice.r / ramp });
    ghosts.push(c.voice);
    c.voice = null;
  };
  const trigger = (c, note) => {
    const ins = song.instruments[c.num - 1], s = ins?.samples[ins.map[note - 1]];
    retire(c);
    if (!s) return;
    c.ins = ins;
    c.smp = s;
    const n = note + s.rel, i = (n - 1) * 16 + (s.ft >> 3) + 16;
    if (n < 1 || n >= 120) return;
    const hz = song.linear ? 8363 * 2 ** ((i - 784) / 192) : (8363 * 1712) / Math.round(109568 / 2 ** ((368 + i) / 192));
    c.voice = { s, pos: 0, dir: 1, step: hz / rate, l: 0, r: 0, dl: 0, dr: 0, ramp: 0 };
  };
  const cell = (c, [note, num, vol, fx, param], jump) => {
    if (num) c.num = num;
    if (note === 97) {
      c.keyOff = true;
      if (c.ins && !(c.ins.flags & 1)) c.vol = 0;
    } else if (note) trigger(c, note);
    if (num && note !== 97 && c.smp) Object.assign(c, { vol: c.smp.vol, pan: c.smp.pan, keyOff: false, fade: 32768, envPos: 0 });
    if (vol >= 0x10 && vol <= 0x50) c.vol = vol - 0x10;
    c.fx = fx;
    if (fx === 0xa && param) c.slide = param;
    else if (fx === 0xb) jump.ord = param;
    else if (fx === 0xc) c.vol = Math.min(param, 64);
    else if (fx === 0xd) jump.row = Math.min((param >> 4) * 10 + (param & 15), 64);
    else if (fx === 0xf && param) param < 32 ? (speed = param) : (bpm = param);
  };

  for (;;) {
    const key = ord * 256 + row;
    if (seen.has(key)) { loop = seen.get(key); break; }
    seen.set(key, t);
    const pat = song.patterns[song.order[ord]] ?? blank, jump = {};
    chans.forEach((c, k) => cell(c, pat.cells[row * song.channels + k] ?? [0, 0, 0, 0, 0], jump));
    for (let tick = 0; tick < speed; tick++) {
      const exact = (rate * 2.5) / bpm + frac, n = Math.floor(exact);
      frac = exact - n;
      if (t + n > L.length) {
        const grow = (a) => { const b = new Float32Array(a.length * 2); b.set(a); return b; };
        L = grow(L); R = grow(R);
      }
      for (const c of chans) {
        if (tick && c.fx === 0xa) c.vol = Math.min(64, Math.max(0, c.vol + (c.slide >> 4 || -(c.slide & 15))));
        if (!c.ins) continue;
        const g = gain(c) * AMP, v = c.voice;
        if (!v) continue;
        Object.assign(v, { ramp, dl: (g * Math.sqrt((256 - c.pan) / 256) - v.l) / ramp, dr: (g * Math.sqrt(c.pan / 256) - v.r) / ramp });
      }
      for (const c of chans) if (c.voice) { mix(c.voice, L, R, t, n); if (c.voice.done) c.voice = null; }
      for (const v of ghosts) mix(v, L, R, t, n);
      ghosts.splice(0, ghosts.length, ...ghosts.filter((v) => !v.done));
      t += n;
    }
    if ('ord' in jump || 'row' in jump) { ord = jump.ord ?? ord + 1; row = jump.row ?? 0; }
    else if (++row >= pat.rows) { ord++; row = 0; }
    if (ord >= song.order.length) ord = song.restart < song.order.length ? song.restart : 0;
    if (row >= (song.patterns[song.order[ord]] ?? blank).rows) row = 0;
  }
  return { left: L.slice(0, t), right: R.slice(0, t), loop };
}

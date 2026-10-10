// Learns a font from the text runs drawn on the original screens: glyph shapes, colours and decoration, advances, kerning and spaces.
import { decode, sprites } from './sprites.mjs';

export const HAIR = 0x200a;
const VS = (n) => 0xfe00 + n - 1;
const decoded = new Map();
export const screen = async (id) => decoded.get(id) ?? decoded.set(id, await decode(sprites.find((s) => s.id === id))).get(id);

// A run's canvas: u along the text, v down the glyph rows. rotate 90: text runs top to bottom, glyph tops face right.
export async function canvas(run, h) {
  const { grids: [g] } = await screen(run.screen);
  const at = run.rotate === 90 ? (u, v) => [run.x + h - 1 - v, run.y + u] : (u, v) => [run.x + u, run.y + v];
  return { at, get: (u, v) => { const [x, y] = at(u, v); return g[y]?.[x]; } };
}

const key = (m) => m.join('/');
const mode = (xs) => {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0]?.[0];
};

// Splits the run's ink into chars: column groups (plus manual cuts) when they map 1:1, else backtracking over known masks.
async function place(run, font, known) {
  const { get } = await canvas(run, font.h);
  const W = run.w, H = font.h;
  const ink = Array.from({ length: H }, (_, v) => Array.from({ length: W }, (_, u) => font.ink.includes(get(u, v))));
  const groups = [];
  for (let u = 0; u < W; u++) if (ink.some((r) => r[u])) { const l = groups.at(-1); if (l && l[1] === u - 1) l[1] = u; else groups.push([u, u]); }
  for (const cut of run.cuts ?? []) {
    const i = groups.findIndex(([a, b]) => a < cut && cut <= b);
    if (i < 0) throw new Error(`cut ${cut} outside the ink of "${run.text}"`);
    groups.splice(i, 1, [groups[i][0], cut - 1], [cut, groups[i][1]]);
  }
  const chars = [...run.text].filter((c) => c !== ' ');
  const maskAt = (u0, u1) => ink.map((r) => r.slice(u0, u1 + 1).map((b) => (b ? '#' : '.')).join(''));
  if (groups.length === chars.length) return chars.map((c, i) => ({ c, u: groups[i][0], mask: maskAt(...groups[i]) }));

  const claimed = ink.map((r) => r.map(() => false));
  const fits = (m, u) => m.every((row, v) => [...row].every((b, du) => b !== '#' || ink[v][u + du]));
  const firstFree = () => { for (let u = 0; u < W; u++) for (let v = 0; v < H; v++) if (ink[v][u] && !claimed[v][u]) return u; return W; };
  const claim = (m, u) => {
    const prev = [];
    m.forEach((row, v) => [...row].forEach((b, du) => { if (b === '#') { prev.push([v, u + du, claimed[v][u + du]]); claimed[v][u + du] = true; } }));
    return prev;
  };
  const undo = (prev) => { for (const [v, u, b] of prev) claimed[v][u] = b; };
  const out = [];
  function rec(i, minU) {
    const free = firstFree();
    if (i === chars.length) return free === W;
    if (free === W) return false;
    const c = chars[i], m = known.get(c);
    if (m) {
      for (let u = Math.max(minU, free - m[0].length + 1); u <= free; u++) {
        // The char must fit the ink and cover the leftmost free ink column.
        if (!fits(m, u) || !m.some((row, v) => row[free - u] === '#' && !claimed[v][free])) continue;
        const prev = claim(m, u);
        out.push({ c, u, mask: m });
        if (rec(i + 1, u + 1)) return true;
        out.pop(); undo(prev);
      }
      return false;
    }
    // Unknown char: the free ink of the rest of this column group.
    const [, u1] = groups.find(([a, b]) => a <= free && free <= b);
    const m2 = ink.map((r, v) => r.slice(free, u1 + 1).map((b, du) => (b && !claimed[v][free + du] ? '#' : '.')).join(''));
    const prev = claim(m2, free);
    out.push({ c, u: free, mask: m2, guessed: true });
    if (rec(i + 1, free + 1)) return true;
    out.pop(); undo(prev);
    return false;
  }
  return rec(0, 0) ? out : null;
}

// 1:1 runs teach masks first; a guessed mask is only accepted once nothing else places.
async function learn(font) {
  const known = new Map(), placed = new Map();
  for (let pass = 0; pass < 4; pass++) {
    for (const run of font.runs) {
      if (placed.has(run)) continue;
      const p = await place(run, font, known);
      if (!p || (pass < 3 && p.some((q) => q.guessed))) continue;
      placed.set(run, p);
      for (const q of p) if (!q.guessed && !known.has(q.c)) known.set(q.c, q.mask);
    }
  }
  const missing = font.runs.filter((r) => !placed.has(r)).map((r) => r.text);
  if (missing.length) throw new Error(`${font.family}: cannot place ${missing.join(', ')}`);
  return placed;
}

// A placed char's pixels relative to its ink's left column: ink in its screen colours, plus decoration seen at the font's offsets.
async function look(run, font, p, runInk) {
  const { get } = await canvas(run, font.h);
  const px = new Map();
  p.mask.forEach((row, v) => [...row].forEach((b, du) => { if (b === '#') px.set(`${du},${v}`, get(p.u + du, v)); }));
  for (const k of [...px.keys()]) {
    const [du, v] = k.split(',').map(Number);
    for (const [c, offsets] of Object.entries(font.deco ?? {})) for (const [dx, dy] of offsets) {
      const q = [du + dx, v + dy];
      if (!runInk.has(`${p.u + q[0]},${q[1]}`) && get(p.u + q[0], q[1]) === +c) px.set(q.join(), +c);
    }
  }
  return [...px].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// Glyphs (one per distinct look; extra looks of a char become variation sequences), metrics, kerning, and each run's text with hair spaces.
export async function deriveFont(font) {
  const placed = await learn(font);
  const seq = [];
  for (const run of font.runs) {
    const runInk = new Set(placed.get(run).flatMap((p) => p.mask.flatMap((row, v) => [...row].flatMap((b, du) => (b === '#' ? [`${p.u + du},${v}`] : [])))));
    let i = 0;
    const spaces = [];
    for (const ch of run.text) { if (ch === ' ') spaces[i] = (spaces[i] ?? 0) + 1; else i++; }
    seq.push(await Promise.all(placed.get(run).map(async (p, j) => {
      const pixels = await look(run, font, p, runInk);
      return { ...p, w: p.mask[0].length, spaces: spaces[j] ?? 0, m: `${p.c}|${key(p.mask)}`, l: `${p.c}|${JSON.stringify(pixels)}`, pixels };
    })));
  }

  // Metrics belong to a char's mask; looks of the same mask share them.
  const count = (f) => { const c = new Map(); for (const p of seq.flat()) c.set(f(p), (c.get(f(p)) ?? 0) + 1); return c; };
  const looks = count((p) => p.l), metricOf = new Map(seq.flat().map((p) => [p.l, p.m]));
  const glyphs = [], index = new Map();
  for (const c of [...new Set(seq.flat().map((p) => p.c))]) {
    [...looks].filter(([l]) => l.startsWith(`${c}|`)).sort((a, b) => b[1] - a[1]).forEach(([l], n) => {
      index.set(l, glyphs.length);
      glyphs.push({ c, vs: n ? VS(n) : null, m: metricOf.get(l), w: seq.flat().find((p) => p.l === l).w, pixels: seq.flat().find((p) => p.l === l).pixels });
    });
  }

  const obs = [];
  for (const s of seq) for (let j = 1; j < s.length; j++) obs.push({ a: s[j - 1].m, b: s[j].m, k: s[j].spaces, gap: s[j].u - s[j - 1].u - s[j - 1].w });
  const ms = [...new Set(seq.flat().map((p) => p.m))];
  const R = new Map(ms.map((m) => [m, 0])), L = new Map(ms.map((m) => [m, 0])), kern = new Map(), kernSp = new Map();
  const base = new Map();
  for (const o of obs.filter((o) => !o.k)) base.set(`${o.a}\t${o.b}`, Math.min(base.get(`${o.a}\t${o.b}`) ?? Infinity, o.gap));
  const pairs = [...base].map(([k, gap]) => [...k.split('\t'), gap]);
  for (let it = 0; it < 4; it++) {
    for (const m of ms) { const v = mode(pairs.filter((p) => p[0] === m).map((p) => p[2] - L.get(p[1]))); if (v !== undefined) R.set(m, v); }
    for (const m of ms) { const v = mode(pairs.filter((p) => p[1] === m).map((p) => p[2] - R.get(p[0]))); if (v !== undefined) L.set(m, v); }
  }
  const common = mode([...R].filter(([m]) => pairs.some((p) => p[0] === m)).map(([, v]) => v)) ?? 1;
  for (const m of ms) if (!pairs.some((p) => p[0] === m)) R.set(m, common);
  for (const [a, b, gap] of pairs) if (gap !== R.get(a) + L.get(b)) kern.set(`${a}\t${b}`, gap - R.get(a) - L.get(b));
  const spObs = obs.filter((o) => o.k);
  const S = mode(spObs.filter((o) => o.k === 1).map((o) => o.gap - R.get(o.a) - L.get(o.b))) ?? 4;
  for (const o of spObs) { const n = o.gap - R.get(o.a) - L.get(o.b) - o.k * S; if (n < 0) kernSp.set(o.a, Math.min(kernSp.get(o.a) ?? 0, n)); }

  const texts = seq.map((s, si) => {
    const char = (p) => String.fromCodePoint(p.c.codePointAt(0)) + (glyphs[index.get(p.l)].vs ? String.fromCodePoint(glyphs[index.get(p.l)].vs) : '');
    let text = char(s[0]);
    for (let j = 1; j < s.length; j++) {
      const a = s[j - 1].m, b = s[j].m, { spaces: k } = s[j], gap = s[j].u - s[j - 1].u - s[j - 1].w;
      const hair = k ? gap - R.get(a) - L.get(b) - (kernSp.get(a) ?? 0) - k * S
        : gap === R.get(a) + L.get(b) + (kern.get(`${a}\t${b}`) ?? 0) ? 0 : gap - R.get(a) - L.get(b);
      if (hair < 0) throw new Error(`${font.family}: "${font.runs[si].text}" needs ${hair}px between ${s[j - 1].c} and ${s[j].c}`);
      text += ' '.repeat(k) + String.fromCodePoint(HAIR).repeat(hair) + char(s[j]);
    }
    return { u: s[0].u - L.get(s[0].m), text };
  });

  // Font glyphs: the chars, then space and hair space. Pixels move from ink-relative to the pen origin.
  const out = glyphs.map((g) => ({
    c: g.c, vs: g.vs, advance: L.get(g.m) + g.w + R.get(g.m),
    pixels: g.pixels.map(([k, colour]) => { const [x, y] = k.split(',').map(Number); return [x + L.get(g.m), y, colour]; }),
  }));
  const space = out.push({ c: ' ', advance: S, pixels: [] }) - 1;
  out.push({ c: String.fromCodePoint(HAIR), advance: 1, pixels: [] });
  const kerning = [];
  for (const [ab, v] of kern) {
    const [a, b] = ab.split('\t');
    for (const [i, g] of glyphs.entries()) if (g.m === a) for (const [j, h] of glyphs.entries()) if (h.m === b) kerning.push([i, j, v]);
  }
  for (const [a, v] of kernSp) for (const [i, g] of glyphs.entries()) if (g.m === a) kerning.push([i, space, v]);
  return { glyphs: out, kern: kerning, texts };
}

// Pen layout as a browser shapes it: cmap (with variation sequences), advances, pair kerning between adjacent glyphs.
export function layout({ glyphs, kern }, text) {
  const cps = [...text], ids = [];
  for (let i = 0; i < cps.length; i++) {
    const vs = cps[i + 1]?.codePointAt(0);
    const variant = vs >= 0xfe00 && vs <= 0xfe0f ? glyphs.findIndex((g) => g.c === cps[i] && g.vs === vs) : -1;
    const id = variant >= 0 ? variant : glyphs.findIndex((g) => g.c === cps[i] && !g.vs);
    if (variant >= 0) i++;
    if (id < 0) throw new Error(`no glyph for ${JSON.stringify(cps[i])}`);
    ids.push(id);
  }
  const pairs = new Map(kern.map(([a, b, v]) => [`${a},${b}`, v]));
  const out = [];
  let pen = 0;
  ids.forEach((id, i) => {
    if (i) pen += pairs.get(`${ids[i - 1]},${id}`) ?? 0;
    for (const [x, y, c] of glyphs[id].pixels) out.push([pen + x, y, c]);
    pen += glyphs[id].advance;
  });
  return out;
}

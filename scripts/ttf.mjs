// Minimal TrueType writer for pixel fonts: each glyph pixel is a UNIT square, traced into merged outlines. Optional kern, COLRv0/CPAL and variation sequences.
import { brotliCompressSync, constants } from 'node:zlib';
export const UNIT = 128;
// Seconds since 1904, fixed so rebuilds are byte-identical.
const CREATED = Date.UTC(2026, 9, 10) / 1000 + 2082844800;

// pixels: [x, y] with y counted down from the top row, which sits on the ascent line.
// Boundary edges oriented clockwise (filled side on the right, y up), chained into contours with collinear points dropped.
function trace(pixels, ascent) {
  const set = new Set(pixels.map(([x, y]) => `${x},${y}`));
  const filled = (x, y) => set.has(`${x},${y}`);
  const edges = new Map();
  const add = (x0, y0, x1, y1) => edges.set(`${x0},${y0}`, [...(edges.get(`${x0},${y0}`) ?? []), [x1, y1]]);
  for (const [x, y] of [...set].map((k) => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const top = ascent - y, bottom = ascent - y - 1;
    if (!filled(x, y - 1)) add(x, top, x + 1, top);
    if (!filled(x + 1, y)) add(x + 1, top, x + 1, bottom);
    if (!filled(x, y + 1)) add(x + 1, bottom, x, bottom);
    if (!filled(x - 1, y)) add(x, bottom, x, top);
  }
  const contours = [];
  for (const [start, outs] of edges) {
    while (outs.length) {
      let [x, y] = start.split(',').map(Number), points = [[x, y]];
      let [nx, ny] = outs.pop();
      while (`${nx},${ny}` !== start) {
        const [dx, dy] = [nx - x, ny - y];
        [x, y] = [nx, ny];
        points.push([x, y]);
        const next = edges.get(`${x},${y}`);
        // Diagonally touching pixels share a vertex: turn right so each pixel island stays its own contour.
        const i = next.length > 1 ? next.findIndex(([ax, ay]) => ax - x === dy && ay - y === -dx) : 0;
        [nx, ny] = next.splice(Math.max(i, 0), 1)[0];
      }
      contours.push(points.filter((p, i) => {
        const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
        return (b[0] - a[0]) * (p[1] - a[1]) !== (b[1] - a[1]) * (p[0] - a[0]);
      }));
    }
  }
  return contours.map((c) => c.map(([x, y]) => [x * UNIT, y * UNIT]));
}

function glyf(contours) {
  if (!contours.length) return { data: Buffer.alloc(0), xMin: 0, xMax: 0, yMin: 0, yMax: 0, points: 0 };
  const all = contours.flat();
  const [xs, ys] = [all.map((p) => p[0]), all.map((p) => p[1])];
  const box = { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
  const flags = [], coords = [[], []];
  let prev = [0, 0];
  for (const p of all) {
    const [dx, dy] = [p[0] - prev[0], p[1] - prev[1]];
    flags.push(1 | (dx ? 0 : 0x10) | (dy ? 0 : 0x20));
    if (dx) coords[0].push(dx);
    if (dy) coords[1].push(dy);
    prev = p;
  }
  const b = new Out();
  b.i16(contours.length, box.xMin, box.yMin, box.xMax, box.yMax);
  let end = -1;
  for (const c of contours) b.u16(end += c.length);
  b.u16(0);
  b.u8(...flags);
  b.i16(...coords[0], ...coords[1]);
  return { data: b.pad(), ...box, points: all.length, contours: contours.length };
}

class Out {
  parts = [];
  u8(...v) { for (const n of v) this.parts.push(Buffer.of(n)); return this; }
  u16(...v) { for (const n of v) { const b = Buffer.alloc(2); b.writeUInt16BE(n); this.parts.push(b); } return this; }
  i16(...v) { for (const n of v) { const b = Buffer.alloc(2); b.writeInt16BE(n); this.parts.push(b); } return this; }
  u32(...v) { for (const n of v) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); this.parts.push(b); } return this; }
  raw(buf) { this.parts.push(buf); return this; }
  pad() { const b = Buffer.concat(this.parts); return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]); }
}

const checksum = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 4) s = (s + buf.readUInt32BE(i)) >>> 0; return s; };

function cmap4(map) {
  const cps = [...map.keys()].sort((a, b) => a - b), segments = [];
  for (const cp of cps) {
    const last = segments.at(-1), delta = map.get(cp) - cp;
    if (last && last[1] === cp - 1 && last[2] === delta) last[1] = cp;
    else segments.push([cp, cp, delta]);
  }
  segments.push([0xffff, 0xffff, 1]);
  const n = segments.length, search = 2 ** Math.floor(Math.log2(n));
  return new Out().u16(4, 16 + 8 * n, 0, n * 2, search * 2, Math.log2(search), (n - search) * 2)
    .u16(...segments.map((s) => s[1]), 0, ...segments.map((s) => s[0])).u16(...segments.map((s) => (s[2] + 0x10000) % 0x10000)).u16(...segments.map(() => 0)).pad();
}

// Format 14, non-default variation sequences only: [{ base, vs, glyph }].
function cmap14(variants) {
  const selectors = [...new Set(variants.map((v) => v.vs))].sort((a, b) => a - b);
  const u24 = (out, n) => out.u8(n >> 16, (n >> 8) & 0xff, n & 0xff);
  const head = new Out().u16(14), records = new Out(), tables = new Out();
  let at = 10 + 11 * selectors.length;
  for (const vs of selectors) {
    const maps = variants.filter((v) => v.vs === vs).sort((a, b) => a.base - b.base);
    u24(records, vs).u32(0, at);
    tables.u32(maps.length);
    for (const m of maps) u24(tables, m.base).u16(m.glyph);
    at += 4 + 5 * maps.length;
  }
  return new Out().raw(Buffer.concat(head.parts)).u32(at).u32(selectors.length).raw(Buffer.concat([...records.parts, ...tables.parts])).pad();
}

// glyphs: [{ cps, advance, layers: [{ colour, pixels }] }] in pixels; colour is a CPAL index (0xffff for the text colour), or absent in a plain font.
// kern: [[left, right, px]] by index into glyphs. variants: [{ base, vs, glyph }].
export function ttf(glyphs, { family, copyright, em, ascent, palette = [], kern = [], variants = [] }) {
  const EM = em * UNIT, ASCENT = ascent * UNIT;
  const width = Math.max(...glyphs.map((g) => g.advance));
  const box = [];
  for (let y = 0; y < ascent; y++) for (let x = 0; x < width - 1; x++) if (!y || y === ascent - 1 || !x || x === width - 2) box.push([x, y]);
  const colour = palette.length > 0;
  const outline = (pixels, advance) => ({ ...glyf(trace(pixels, ascent)), advance: advance * UNIT });
  // Glyph 0 is .notdef, then the given glyphs; colour fonts append one glyph per layer. Each base glyph keeps the union of its layers for renderers without COLR.
  const base = [outline(box, width), ...glyphs.map((g) => outline(g.layers.flatMap((l) => l.pixels), g.advance))];
  const layerGlyphs = [], baseRecords = [], layerRecords = [];
  if (colour) glyphs.forEach((g, i) => {
    if (!g.layers.length) return;
    baseRecords.push([i + 1, layerRecords.length, g.layers.length]);
    for (const l of g.layers) {
      layerRecords.push([base.length + layerGlyphs.length, l.colour]);
      layerGlyphs.push(outline(l.pixels, g.advance));
    }
  });
  const all = [...base, ...layerGlyphs];
  const inked = all.filter((g) => g.points);
  const max = (k) => Math.max(...inked.map((g) => g[k]));
  const min = (k) => Math.min(...inked.map((g) => g[k]));

  const loca = new Out();
  let offset = 0;
  for (const g of all) { loca.u32(offset); offset += g.data.length; }
  loca.u32(offset);

  const advances = all.map((g) => g.advance).filter(Boolean);
  const map = new Map(glyphs.flatMap((g, i) => g.cps.map((cp) => [cp, i + 1])));
  const cps = [...map.keys()];
  const head = new Out().u32(0x00010000, 0x00010000, 0, 0x5f0f3cf5).u16(0x000b, EM).u32(0, CREATED, 0, CREATED)
    .i16(min('xMin'), min('yMin'), max('xMax'), max('yMax')).u16(0, 8).i16(2, 1, 0);
  const hhea = new Out().u32(0x00010000).i16(ASCENT, ASCENT - EM, 0).u16(Math.max(...advances))
    .i16(min('xMin'), Math.min(...inked.map((g) => g.advance - g.xMax)), max('xMax'), 1, 0, 0, 0, 0, 0, 0, 0).u16(all.length);
  const maxp = new Out().u32(0x00010000).u16(all.length, max('points'), max('contours'), 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0);
  const os2 = new Out().u16(4).i16(Math.round(advances.reduce((a, b) => a + b) / advances.length)).u16(400, 5, 0)
    .i16(...Array(8).fill(UNIT * 4), UNIT, UNIT * 3, 0).u8(2, 0, 5, 9, 0, 0, 0, 0, 0, 0)
    .u32(1, 0, 0, 0).raw(Buffer.from('NONE')).u16(0x00c0, Math.min(...cps), Math.min(Math.max(...cps), 0xffff))
    .i16(ASCENT, ASCENT - EM, 0).u16(ASCENT, EM - ASCENT).u32(1, 0).i16(max('yMax'), max('yMax')).u16(0, 0x20, 1);
  const hmtx = new Out();
  for (const g of all) hmtx.u16(g.advance).i16(g.xMin);

  // (0,3) and (3,1) share the format 4 subtable; (0,5) is format 14. Records sorted by platform and encoding.
  const four = cmap4(map), fourteen = variants.length ? cmap14(variants.map((v) => ({ ...v, glyph: v.glyph + 1 }))) : Buffer.alloc(0);
  const records = variants.length ? 3 : 2, at4 = 4 + 8 * records + fourteen.length;
  const tables = { cmap: new Out().u16(0, records).u16(0, 3).u32(at4) };
  if (variants.length) tables.cmap.u16(0, 5).u32(4 + 8 * records);
  tables.cmap.u16(3, 1).u32(at4).raw(fourteen).raw(four);

  const id = family.replace(/\s/g, '');
  const strings = [copyright, family, 'Regular', `${id}-Regular`, family, 'Version 1.000', `${id}-Regular`];
  const encoded = strings.map((s) => Buffer.from(s, 'utf16le').swap16());
  const name = new Out().u16(0, strings.length, 6 + 12 * strings.length);
  let at = 0;
  encoded.forEach((e, i) => { name.u16(3, 1, 0x409, i, e.length, at); at += e.length; });
  encoded.forEach((e) => name.raw(e));
  const post = new Out().u32(0x00030000, 0).i16(-UNIT, UNIT).u32(1, 0, 0, 0, 0);

  Object.assign(tables, { 'OS/2': os2, glyf: new Out().raw(Buffer.concat(all.map((g) => g.data))), head, hhea, hmtx, loca, maxp, name, post });
  if (kern.length) {
    const pairs = kern.map(([a, b, px]) => [a + 1, b + 1, px * UNIT]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const search = 2 ** Math.floor(Math.log2(pairs.length));
    tables.kern = new Out().u16(0, 1, 0, 14 + 6 * pairs.length, 1, pairs.length, search * 6, Math.log2(search), (pairs.length - search) * 6);
    for (const [a, b, v] of pairs) tables.kern.u16(a, b).i16(v);
  }
  if (colour) {
    tables.COLR = new Out().u16(0, baseRecords.length).u32(14, 14 + 6 * baseRecords.length).u16(layerRecords.length);
    for (const r of baseRecords) tables.COLR.u16(...r);
    for (const r of layerRecords) tables.COLR.u16(...r);
    tables.CPAL = new Out().u16(0, palette.length, 1, palette.length).u32(14).u16(0);
    for (const hex of palette) tables.CPAL.u8(...[5, 3, 1].map((i) => parseInt(hex.slice(i, i + 2), 16)), 255);
  }

  const sorted = Object.entries(tables).map(([tag, out]) => {
    const unpadded = Buffer.concat(out.parts);
    return { tag, data: out.pad(), length: unpadded.length };
  }).sort((a, b) => (a.tag < b.tag ? -1 : 1));

  const search2 = 2 ** Math.floor(Math.log2(sorted.length));
  const dir = new Out().u32(0x00010000).u16(sorted.length, search2 * 16, Math.log2(search2), (sorted.length - search2) * 16);
  let pos = 12 + 16 * sorted.length, headAt;
  for (const t of sorted) {
    if (t.tag === 'head') headAt = pos;
    dir.raw(Buffer.from(t.tag)).u32(checksum(t.data), pos, t.length);
    pos += t.data.length;
  }
  const font = Buffer.concat([dir.pad(), ...sorted.map((t) => t.data)]);
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headAt + 8);
  return font;
}

// Known-table index for each tag; the rest of the spec's list is unused here.
const WOFF2_TAGS = { cmap: 0, head: 1, hhea: 2, hmtx: 3, maxp: 4, name: 5, 'OS/2': 6, post: 7, glyf: 10, loca: 11, kern: 19, COLR: 34, CPAL: 35 };

const base128 = (n) => {
  const bytes = [n & 0x7f];
  while ((n >>>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
};

// WOFF2 with every table stored as-is (glyf/loca use the spec's null transform, version 3), Brotli in font mode.
export function woff2(font) {
  const tables = Array.from({ length: font.readUInt16BE(4) }, (_, i) => {
    const at = 12 + 16 * i, offset = font.readUInt32BE(at + 8), length = font.readUInt32BE(at + 12);
    return { tag: font.toString('latin1', at, at + 4), data: font.subarray(offset, offset + length) };
  });
  const dir = new Out();
  for (const { tag, data } of tables) dir.u8(WOFF2_TAGS[tag] | (tag === 'glyf' || tag === 'loca' ? 0xc0 : 0), ...base128(data.length));
  const stream = Buffer.concat(tables.map((t) => t.data));
  const compressed = brotliCompressSync(stream, {
    params: { [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT, [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: stream.length },
  });
  const body = Buffer.concat([...dir.parts, compressed]);
  const length = 48 + body.length + ((4 - (body.length % 4)) % 4);
  const header = new Out().raw(Buffer.from('wOF2')).u32(0x00010000, length).u16(tables.length, 0)
    .u32(font.length, compressed.length).u16(1, 0).u32(0, 0, 0, 0, 0);
  return new Out().raw(header.pad()).raw(body).pad();
}

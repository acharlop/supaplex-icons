// Minimal TrueType writer for the bitmap fonts: each glyph pixel is an em/8 square, traced into merged outlines.
import { brotliCompressSync, constants } from 'node:zlib';
export const UNIT = 128;
const EM = 8 * UNIT;
const ASCENT = 7 * UNIT;
// Seconds since 1904, fixed so rebuilds are byte-identical.
const CREATED = Date.UTC(2026, 9, 10) / 1000 + 2082844800;

// Boundary edges oriented clockwise (filled side on the right, y up), chained into contours with collinear points dropped.
function trace(grid) {
  const h = grid.length;
  const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < grid[0].length && grid[y][x] > 0;
  const edges = new Map();
  const add = (x0, y0, x1, y1) => edges.set(`${x0},${y0}`, [...(edges.get(`${x0},${y0}`) ?? []), [x1, y1]]);
  grid.forEach((row, y) => row.forEach((_, x) => {
    if (!filled(x, y)) return;
    const top = h - y, bottom = h - y - 1;
    if (!filled(x, y - 1)) add(x, top, x + 1, top);
    if (!filled(x + 1, y)) add(x + 1, top, x + 1, bottom);
    if (!filled(x, y + 1)) add(x + 1, bottom, x, bottom);
    if (!filled(x - 1, y)) add(x, bottom, x, top);
  }));
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

// grids: glyphs for ASCII 0x20 + i. Lowercase maps onto the uppercase glyphs, as the game only has capitals.
export function ttf(grids, { family, width, copyright }) {
  const advance = width * UNIT;
  const notdef = Array.from({ length: 7 }, (_, y) => Array.from({ length: width - 1 }, (_, x) => +(y === 0 || y === 6 || x === 0 || x === width - 2)));
  const glyphs = [notdef, ...grids].map((g) => glyf(trace(g)));
  const inked = glyphs.filter((g) => g.points);
  const max = (k) => Math.max(...inked.map((g) => g[k]));
  const min = (k) => Math.min(...inked.map((g) => g[k]));

  const loca = new Out();
  let offset = 0;
  for (const g of glyphs) { loca.u32(offset); offset += g.data.length; }
  loca.u32(offset);

  const head = new Out().u32(0x00010000, 0x00010000, 0, 0x5f0f3cf5).u16(0x000b, EM).u32(0, CREATED, 0, CREATED)
    .i16(min('xMin'), min('yMin'), max('xMax'), max('yMax')).u16(0, 8).i16(2, 1, 0);
  const hhea = new Out().u32(0x00010000).i16(ASCENT, ASCENT - EM, 0).u16(advance)
    .i16(min('xMin'), Math.min(...inked.map((g) => advance - g.xMax)), max('xMax'), 1, 0, 0, 0, 0, 0, 0, 0).u16(glyphs.length);
  const maxp = new Out().u32(0x00010000).u16(glyphs.length, max('points'), max('contours'), 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0);
  const os2 = new Out().u16(4).i16(advance).u16(400, 5, 0)
    .i16(...Array(8).fill(UNIT * 4), UNIT, UNIT * 3, 0).u8(2, 0, 5, 9, 0, 0, 0, 0, 0, 0)
    .u32(1, 0, 0, 0).raw(Buffer.from('NONE')).u16(0x00c0, 0x20, 0x7a)
    .i16(ASCENT, ASCENT - EM, 0).u16(ASCENT, EM - ASCENT).u32(1, 0).i16(max('yMax'), max('yMax')).u16(0, 0x20, 1);
  const hmtx = new Out();
  for (const g of glyphs) hmtx.u16(advance).i16(g.xMin);

  // Format 4: 0x20-0x5f in order, a-z onto A-Z, then the required 0xffff terminator.
  const segments = [[0x20, 0x5f, 1 - 0x20], [0x61, 0x7a, 0x41 - 0x20 + 1 - 0x61], [0xffff, 0xffff, 1]];
  const n = segments.length, search = 2 ** Math.floor(Math.log2(n));
  const sub = new Out().u16(4, 16 + 8 * n, 0, n * 2, search * 2, Math.log2(search), (n - search) * 2)
    .u16(...segments.map((s) => s[1]), 0, ...segments.map((s) => s[0])).i16(...segments.map((s) => s[2])).u16(...segments.map(() => 0));
  const cmap = new Out().u16(0, 2).u16(0, 3).u32(20).u16(3, 1).u32(20).raw(sub.pad());

  const id = family.replace(/\s/g, '');
  const strings = [copyright, family, 'Regular', `${id}-Regular`, family, 'Version 1.000', `${id}-Regular`];
  const encoded = strings.map((s) => Buffer.from(s, 'utf16le').swap16());
  const name = new Out().u16(0, strings.length, 6 + 12 * strings.length);
  let at = 0;
  encoded.forEach((e, i) => { name.u16(3, 1, 0x409, i, e.length, at); at += e.length; });
  encoded.forEach((e) => name.raw(e));
  const post = new Out().u32(0x00030000, 0).i16(-UNIT, UNIT).u32(1, 0, 0, 0, 0);

  const tables = Object.entries({
    'OS/2': os2, cmap, glyf: new Out().raw(Buffer.concat(glyphs.map((g) => g.data))), head, hhea, hmtx, loca, maxp, name, post,
  }).map(([tag, out]) => {
    const unpadded = Buffer.concat(out.parts);
    return { tag, data: out.pad(), length: unpadded.length };
  }).sort((a, b) => (a.tag < b.tag ? -1 : 1));

  const search2 = 2 ** Math.floor(Math.log2(tables.length));
  const dir = new Out().u32(0x00010000).u16(tables.length, search2 * 16, Math.log2(search2), (tables.length - search2) * 16);
  let pos = 12 + 16 * tables.length, headAt;
  for (const t of tables) {
    if (t.tag === 'head') headAt = pos;
    dir.raw(Buffer.from(t.tag)).u32(checksum(t.data), pos, t.length);
    pos += t.data.length;
  }
  const font = Buffer.concat([dir.pad(), ...tables.map((t) => t.data)]);
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headAt + 8);
  return font;
}

const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];

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
  for (const { tag, data } of tables) dir.u8(WOFF2_TAGS.indexOf(tag) | (tag === 'glyf' || tag === 'loca' ? 0xc0 : 0), ...base128(data.length));
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

// Renders every pixel SVG frame and every TrueType glyph in headless Chrome at each power-of-two scale up to `exactUpTo` (at least native size) and counts pixels that differ from the original.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { decode, fontFile, framePath, pixel, root, sprites } from './sprites.mjs';

const run = promisify(execFile);
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE_W = 2048, PAGE_H = 4096;
const ids = process.argv.slice(2);
const tmp = await mkdtemp(join(tmpdir(), 'supaplex-verify-'));

// One job per frame (or glyph) per scale, shelf-packed onto screenshot-sized pages.
const jobs = [], diffs = new Map(), faces = [];
const escape = (c) => ({ '<': '&lt;', '&': '&amp;' })[c] ?? c;
for (const sprite of sprites.filter((s) => s.svg && (!ids.length || ids.includes(s.id)))) {
  const { palette, grids } = await decode(sprite);
  const rgb = palette.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const { w, h } = sprite.source;
  const sizes = new Map();
  for (let k = 1; k * w <= Math.max(pixel.exactUpTo, w); k *= 2) sizes.set(k * w, 0);
  diffs.set(sprite.id, sizes);
  grids.forEach((grid, i) => {
    const src = new URL(`svg/pixel/${framePath(sprite, i)}`, root);
    for (const W of sizes.keys()) jobs.push({ id: sprite.id, k: W / w, W, H: (W / w) * h, grid, rgb, tag: (pos) => `<img src="${src}" width="${W}" height="${(W / w) * h}" style="${pos}">` });
  });
  if (sprite.kind !== 'font') continue;
  // Text in the font, one em (7 rows plus a blank descender row) per glyph.
  const { path, family } = fontFile(sprite);
  faces.push(`@font-face{font-family:'${family}';src:url(${new URL(path, root)})}`);
  diffs.set(path, new Map(sizes));
  grids.forEach((grid, i) => {
    const em = [...grid, grid[0].map(() => 0)];
    for (const W of sizes.keys()) {
      const k = W / w;
      const char = escape(String.fromCharCode(0x20 + i));
      jobs.push({ id: path, k, W, H: k * 8, grid: em, rgb, tag: (pos) => `<span style="${pos};font:${k * 8}px/${k * 8}px '${family}';-webkit-font-smoothing:antialiased;color:${palette[1]}">${char}</span>` });
    }
  });
}

const pages = [];
let page, x = 0, y = 0, rowH = 0;
for (const job of jobs.sort((a, b) => b.H - a.H || b.W - a.W)) {
  if (x + job.W > PAGE_W) [x, y, rowH] = [0, y + rowH, 0];
  if (!page || y + job.H > PAGE_H) pages.push(page = { jobs: [], height: 0 }), [x, y, rowH] = [0, 0, 0];
  Object.assign(job, { x, y });
  page.jobs.push(job);
  page.height = Math.max(page.height, y + job.H);
  x += job.W;
  rowH = Math.max(rowH, job.H);
}

async function check(page, n) {
  const html = join(tmp, `page${n}.html`), png = join(tmp, `shot${n}.png`);
  const tags = page.jobs.map((j) => j.tag(`position:absolute;left:${j.x}px;top:${j.y}px`));
  // Black page: transparent background in the SVG must show through as the original black.
  await writeFile(html, `<style>${faces.join('')}</style><body style="margin:0;background:#000">${tags.join('')}`);
  await run(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${PAGE_W},${page.height}`, `--screenshot=${png}`, '--allow-file-access-from-files', `file://${html}`]);
  const { stdout: shot } = await run('ffmpeg', ['-loglevel', 'error', '-i', png, '-vf', `crop=${PAGE_W}:${page.height}:0:0`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { encoding: 'buffer', maxBuffer: PAGE_W * page.height * 3 + 1024 });
  for (const j of page.jobs) {
    let diff = 0;
    for (let py = 0; py < j.H; py++) for (let px = 0; px < j.W; px++) {
      const want = j.rgb[j.grid[Math.floor(py / j.k)][Math.floor(px / j.k)]], i = ((j.y + py) * PAGE_W + j.x + px) * 3;
      if (shot[i] !== want[0] || shot[i + 1] !== want[1] || shot[i + 2] !== want[2]) diff++;
    }
    diffs.get(j.id).set(j.W, diffs.get(j.id).get(j.W) + diff);
  }
}

for (const [n, page] of pages.entries()) await check(page, n);
await rm(tmp, { recursive: true, force: true });

let failed = 0;
for (const [id, sizes] of diffs) {
  failed += [...sizes.values()].filter(Boolean).length;
  console.log(id.padEnd(22), [...sizes].map(([W, diff]) => `${W}px:${diff}`).join('  '));
}
console.log(`${jobs.length} renders on ${pages.length} pages`);
if (failed) {
  console.error(`${failed} sprite size(s) differ from the original`);
  process.exit(1);
}

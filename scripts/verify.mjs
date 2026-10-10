// Renders each pixel SVG in headless Chrome at every whole-number scale up to `exactUpTo` and counts pixels that differ from the original.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAsset } from './assets.mjs';
import { SHEETS, crop, readPalette } from './dat.mjs';

const root = new URL('../', import.meta.url);
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { pixel, sprites } = JSON.parse(await readFile(new URL('sprites.json', root), 'utf8'));
const ids = process.argv.slice(2);
const palette = readPalette(await loadAsset('PALETTES.DAT')).map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
const tmp = await mkdtemp(join(tmpdir(), 'supaplex-verify-'));

let failed = 0;
for (const sprite of sprites.filter((s) => s.svg && (!ids.length || ids.includes(s.id)))) {
  const { file, w, h, frames: [[fx, fy]] } = sprite.source;
  const grid = crop(SHEETS[file](await loadAsset(file)), fx, fy, w, h);
  const results = [];
  for (let k = 1; k * w <= pixel.exactUpTo; k *= 2) {
    const [W, H] = [k * w, k * h];
    const html = join(tmp, 'page.html'), png = join(tmp, 'shot.png');
    // Black page: edge-touching black is transparent in the SVG, so it must show through as the original black.
    await writeFile(html, `<body style="margin:0;background:#000"><img src="${new URL(`svg/pixel/${sprite.id}.svg`, root)}" width="${W}" height="${H}" style="display:block">`);
    execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${Math.max(W, 300)},${Math.max(H, 300)}`, `--screenshot=${png}`, '--allow-file-access-from-files', `file://${html}`], { stdio: 'ignore' });
    const rgb = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', png, '-vf', `crop=${W}:${H}:0:0`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: W * H * 3 + 1024 });
    let diff = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const want = palette[grid[Math.floor(y / k)][Math.floor(x / k)]], i = (y * W + x) * 3;
      if (rgb[i] !== want[0] || rgb[i + 1] !== want[1] || rgb[i + 2] !== want[2]) diff++;
    }
    if (diff) failed++;
    results.push(`${W}px:${diff}`);
  }
  console.log(sprite.id.padEnd(22), results.join('  '));
}

await rm(tmp, { recursive: true, force: true });
if (failed) {
  console.error(`${failed} render(s) differ from the original`);
  process.exit(1);
}

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadAsset } from './assets.mjs';
import { SHEETS, crop, readPalette } from './dat.mjs';
import { clearBackground, filmstripSvg, pixelSvg } from './svg.mjs';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const { pixel, sprites } = JSON.parse(await readFile(new URL('sprites.json', root), 'utf8'));

const palette = readPalette(await loadAsset('PALETTES.DAT'));
const sheets = {};
for (const file of Object.keys(SHEETS)) sheets[file] = SHEETS[file](await loadAsset(file));

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('original/', dist), { recursive: true });

const catalog = [];
for (const sprite of sprites) {
  const { file, w, h, frames } = sprite.source;
  const entry = { id: sprite.id, name: sprite.name, kind: sprite.kind, file, todo: sprite.todo ?? null };

  if (frames) {
    const grids = frames.map(([x, y]) => crop(sheets[file], x, y, w, h));
    await writeFile(new URL(`original/${sprite.id}.svg`, dist), filmstripSvg(grids, palette, sprite.name));
    Object.assign(entry, { w, h, frames: frames.length });

    if (sprite.svg) {
      const svg = pixelSvg(clearBackground(grids[0]), palette, sprite.name, pixel);
      await writeFile(new URL(`svg/pixel/${sprite.id}.svg`, root), svg);
    }
  }

  entry.pixel = existsSync(new URL(`svg/pixel/${sprite.id}.svg`, root));
  entry.smooth = existsSync(new URL(`svg/smooth/${sprite.id}.svg`, root));
  catalog.push(entry);
}

await cp(new URL('site/', root), dist, { recursive: true });
await cp(new URL('svg/', root), new URL('svg/', dist), { recursive: true });
await writeFile(new URL('catalog.json', dist), JSON.stringify(catalog));

const done = catalog.filter((s) => s.pixel && s.smooth).length;
console.log(`Built ${catalog.length} sprites (${done} with both SVGs) into dist/`);

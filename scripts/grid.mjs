// Prints the palette and each sprite's first frame as hex palette indices, one row per line.
import { readFile } from 'node:fs/promises';
import { loadAsset } from './assets.mjs';
import { SHEETS, crop, readPalette } from './dat.mjs';

const { sprites } = JSON.parse(await readFile(new URL('../sprites.json', import.meta.url), 'utf8'));
const ids = process.argv.slice(2);
console.log(readPalette(await loadAsset('PALETTES.DAT')).map((c, i) => `${i.toString(16)}=${c}`).join(' '));

for (const sprite of sprites.filter((s) => ids.includes(s.id))) {
  const { file, w, h, frames } = sprite.source;
  if (!frames) {
    console.log(`\n${sprite.id}: no frames mapped yet`);
    continue;
  }
  const grid = crop(SHEETS[file](await loadAsset(file)), frames[0][0], frames[0][1], w, h);
  console.log(`\n${sprite.id}\n${grid.map((row) => row.map((c) => c.toString(16)).join('')).join('\n')}`);
}

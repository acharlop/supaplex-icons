// sprites.json plus the decoded frames, palette and output paths of each entry.
import { readFile } from 'node:fs/promises';
import { loadAsset } from './assets.mjs';
import { SHEETS, crop, paletteFor } from './dat.mjs';
import { TRANSPARENT, clearBackground } from './svg.mjs';

export const root = new URL('../', import.meta.url);
export const { pixel, sprites } = JSON.parse(await readFile(new URL('sprites.json', root), 'utf8'));

const palettes = await loadAsset('PALETTES.DAT');
const sheets = {};

// Palette and one grid of palette indices per frame; null while the frames are unmapped.
export async function decode(sprite) {
  const { file, w, h, frames } = sprite.source;
  if (!frames) return null;
  sheets[file] ??= SHEETS[file](await loadAsset(file));
  return { palette: paletteFor(file, palettes), grids: frames.map(([x, y]) => crop(sheets[file], x, y, w, h)) };
}

// What the game draws over: edge-touching black around tiles, every unset glyph bit; screens fill the display.
export const BACKGROUND = {
  tile: clearBackground,
  animation: clearBackground,
  font: (grid) => grid.map((row) => row.map((c) => c || TRANSPARENT)),
  screen: (grid) => grid,
};

const glyph = (i) => 0x20 + i;

// Path under svg/pixel/: `<id>.svg` for one frame, else `<id>/<n>.svg` (fonts: `<id>/<ascii hex>.svg`).
export function framePath(sprite, i) {
  if (sprite.source.frames.length === 1) return `${sprite.id}.svg`;
  return `${sprite.id}/${sprite.kind === 'font' ? glyph(i).toString(16) : i}.svg`;
}

export function frameTitle(sprite, i) {
  const n = sprite.source.frames.length;
  if (n === 1) return sprite.name;
  return sprite.kind === 'font' ? `${sprite.name}: ${String.fromCharCode(glyph(i))}` : `${sprite.name}, frame ${i + 1} of ${n}`;
}

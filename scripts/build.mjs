import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { BACKGROUND, decode, fontFiles, framePath, frameTitle, pixel, root, sprites } from './sprites.mjs';
import { buildScreens } from './screens.mjs';
import { filmstripSvg, pixelSvg } from './svg.mjs';
import { ttf, woff2 } from './ttf.mjs';

const dist = new URL('dist/', root);
const out = new URL('svg/pixel/', root);
const fonts = new URL('fonts/', root);
const screens = new URL('screens/', root);

await rm(dist, { recursive: true, force: true });
await rm(out, { recursive: true, force: true });
await rm(fonts, { recursive: true, force: true });
await rm(screens, { recursive: true, force: true });
await mkdir(fonts);
await mkdir(new URL('original/', dist), { recursive: true });

const COPYRIGHT = 'Glyphs from Supaplex (c) 1991 Digital Integration / Dream Factory, freeware. Font conversion MIT.';
const catalog = [];
for (const sprite of sprites) {
  const { file, w, h } = sprite.source;
  const entry = { id: sprite.id, name: sprite.name, kind: sprite.kind, file, todo: sprite.todo ?? null, pixel: null };
  const decoded = await decode(sprite);

  if (decoded) {
    const { palette, grids } = decoded;
    await writeFile(new URL(`original/${sprite.id}.svg`, dist), filmstripSvg(grids, palette, sprite.name));
    Object.assign(entry, { w, h, frames: grids.length });

    if (sprite.svg) {
      const smoothFile = new URL(`svg/smooth/${sprite.id}.svg`, root);
      const smooth = pixel.smooth && grids.length === 1 && existsSync(smoothFile) ? await readFile(smoothFile, 'utf8') : null;
      entry.pixel = [];
      for (const [i, grid] of grids.entries()) {
        const path = framePath(sprite, i), target = new URL(path, out);
        await mkdir(new URL('.', target), { recursive: true });
        await writeFile(target, pixelSvg(BACKGROUND[sprite.kind](grid), palette, frameTitle(sprite, i), pixel, smooth));
        entry.pixel.push(`svg/pixel/${path}`);
      }
      if (sprite.kind === 'font') {
        const { paths: [woff2Path, ttfPath], family } = fontFiles(sprite);
        // Glyph i is ASCII 0x20 + i; lowercase maps onto the capitals, as the game has no others.
        const glyphs = grids.map((grid, i) => ({
          cps: [0x20 + i, ...(i >= 0x21 && i <= 0x3a ? [0x40 + i] : [])], advance: w,
          layers: [{ pixels: grid.flatMap((row, y) => row.flatMap((c, x) => (c ? [[x, y]] : []))) }],
        }));
        const font = ttf(glyphs, { family, copyright: COPYRIGHT, em: 8, ascent: 7 });
        await writeFile(new URL(ttfPath, root), font);
        await writeFile(new URL(woff2Path, root), woff2(font));
        entry.fonts = [woff2Path, ttfPath];
      }
    }
  }

  entry.smooth = existsSync(new URL(`svg/smooth/${sprite.id}.svg`, root));
  catalog.push(entry);
}

const screenSet = await buildScreens(COPYRIGHT);

await cp(new URL('site/', root), dist, { recursive: true });
await cp(new URL('svg/', root), new URL('svg/', dist), { recursive: true });
await cp(fonts, new URL('fonts/', dist), { recursive: true });
await cp(screens, new URL('screens/', dist), { recursive: true });
await writeFile(new URL('screens.json', dist), JSON.stringify(screenSet));
await writeFile(new URL('catalog.json', dist), JSON.stringify(catalog));

const files = catalog.reduce((n, s) => n + (s.pixel?.length ?? 0), 0);
console.log(`Built ${catalog.length} sprites into dist/: ${catalog.filter((s) => s.pixel).length} pixel-exact (${files} SVGs), ${screenSet.pages.length} screen pages, ${screenSet.fonts.length} screen fonts`);

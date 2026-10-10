// Prints each sprite's palette and first frame as hex palette indices, one row per line.
import { decode, sprites } from './sprites.mjs';

const ids = process.argv.slice(2);
for (const sprite of sprites.filter((s) => ids.includes(s.id))) {
  const decoded = await decode(sprite);
  if (!decoded) {
    console.log(`\n${sprite.id}: no frames mapped yet`);
    continue;
  }
  const { palette, grids: [grid] } = decoded;
  console.log(`\n${sprite.id}\n${palette.map((c, i) => `${i.toString(16)}=${c}`).join(' ')}\n${grid.map((row) => row.map((c) => c.toString(16)).join('')).join('\n')}`);
}

export const TRANSPARENT = -1;

// Black that touches the frame edge is background; black enclosed by the sprite (eyes, outlines) stays.
export function clearBackground(grid) {
  const h = grid.length, w = grid[0].length;
  const out = grid.map((row) => [...row]);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || out[y][x] !== 0) continue;
    out[y][x] = TRANSPARENT;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return out;
}

// Scale3x (AdvMAME3x): keeps hard pixel edges but steps diagonals in thirds.
export function scale3x(grid) {
  const h = grid.length, w = grid[0].length;
  const at = (x, y) => grid[Math.min(h - 1, Math.max(0, y))][Math.min(w - 1, Math.max(0, x))];
  const out = Array.from({ length: h * 3 }, () => new Array(w * 3));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [A, B, C, D, E, F, G, H, I] = [at(x - 1, y - 1), at(x, y - 1), at(x + 1, y - 1), at(x - 1, y), at(x, y), at(x + 1, y), at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)];
      const r = new Array(9).fill(E);
      if (B !== H && D !== F) {
        r[0] = D === B ? D : E;
        r[1] = (D === B && E !== C) || (B === F && E !== A) ? B : E;
        r[2] = B === F ? F : E;
        r[3] = (D === B && E !== G) || (D === H && E !== A) ? D : E;
        r[5] = (B === F && E !== I) || (H === F && E !== C) ? F : E;
        r[6] = D === H ? D : E;
        r[7] = (D === H && E !== I) || (H === F && E !== G) ? H : E;
        r[8] = H === F ? F : E;
      }
      for (let k = 0; k < 9; k++) out[y * 3 + Math.floor(k / 3)][x * 3 + (k % 3)] = r[k];
    }
  }
  return out;
}

// One <path> per colour, built from horizontal runs.
function runsToPaths(grid, palette, offsetX = 0) {
  const runs = new Map();
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const color = row[x];
      let end = x;
      while (end < row.length && row[end] === color) end++;
      if (color !== TRANSPARENT) {
        if (!runs.has(color)) runs.set(color, []);
        runs.get(color).push(`M${x + offsetX} ${y}h${end - x}v1h${x - end}z`);
      }
      x = end;
    }
  });
  return [...runs].map(([color, d]) => `<path fill="${palette[color]}" d="${d.join('')}"/>`).join('');
}

export function pixelSvg(grid, palette, title) {
  const w = grid[0].length, h = grid.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><title>${title}</title>${runsToPaths(grid, palette)}</svg>\n`;
}

// All frames side by side, for the catalogue preview.
export function filmstripSvg(frames, palette, title) {
  const w = frames[0][0].length, h = frames[0].length;
  const body = frames.map((grid, i) => runsToPaths(grid, palette, i * w)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * frames.length} ${h}" shape-rendering="crispEdges"><title>${title}</title>${body}</svg>\n`;
}

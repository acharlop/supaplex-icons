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

// Each grid vertex where 3 pixels share a colour and the 4th differs: trim the odd pixel's corner.
function corners(grid, cut) {
  const h = grid.length, w = grid[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? TRANSPARENT : grid[y][x]);
  const out = [];
  for (let vy = 0; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const quad = [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]].map(([x, y]) => ({ x, y, c: at(x, y) }));
      const odd = quad.filter((p) => quad.filter((q) => q.c === p.c).length === 1);
      if (odd.length !== 1) continue;
      const fill = quad.find((p) => p !== odd[0]).c;
      if (quad.filter((p) => p.c === fill).length !== 3) continue;
      const dx = odd[0].x < vx ? -cut : cut, dy = odd[0].y < vy ? -cut : cut;
      out.push({ fill, d: `M${vx} ${vy}h${dx}l${-dx} ${dy}z` });
    }
  }
  return out;
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Exact grid up to `exactUpTo` rendered px (at least native size); above that, the hand-drawn `smooth` SVG if given, else convex corners trimmed by `cornerCut` source px.
export function pixelSvg(grid, palette, title, { exactUpTo, cornerCut }, smooth) {
  const w = grid[0].length, h = grid.length;
  const exactTo = Math.max(exactUpTo, w);
  const exact = `<g class="grid" shape-rendering="crispEdges">${runsToPaths(grid, palette)}</g>`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><title>${escape(title)}</title>`;
  if (smooth) {
    const body = smooth.replace(/^[\s\S]*?<\/title>|<\/svg>\s*$/g, '').replace(/>\s+</g, '><').trim();
    return head
      + `<style>.smooth{display:none}@media (min-width:${exactTo + 1}px){.smooth{display:inline}.grid{display:none}}</style>`
      + `${exact}<g class="smooth">${body}</g></svg>\n`;
  }
  if (!cornerCut) return `${head}${exact}</svg>\n`;
  const cuts = corners(grid, cornerCut);
  const byColor = Map.groupBy(cuts.filter((c) => c.fill !== TRANSPARENT), (c) => c.fill);
  const fills = [...byColor].map(([color, cs]) => `<path fill="${palette[color]}" d="${cs.map((c) => c.d).join('')}"/>`).join('');
  const holes = cuts.filter((c) => c.fill === TRANSPARENT).map((c) => c.d).join('');
  return head
    + `<style>.soft{display:none}@media (min-width:${exactTo + 1}px){.soft{display:inline}.grid{mask:url(#cut)}}</style>`
    + `<mask id="cut"><rect width="${w}" height="${h}" fill="#fff"/><path d="${holes}"/></mask>`
    + `${exact}<g class="soft">${fills}</g></svg>\n`;
}

// All frames side by side, for the catalogue preview.
export function filmstripSvg(frames, palette, title) {
  const w = frames[0][0].length, h = frames[0].length;
  const body = frames.map((grid, i) => runsToPaths(grid, palette, i * w)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * frames.length} ${h}" shape-rendering="crispEdges"><title>${escape(title)}</title>${body}</svg>\n`;
}

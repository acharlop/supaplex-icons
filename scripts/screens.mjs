// Editable screen pages: fonts learned from the screen text, backgrounds with text and icons inpainted, and one HTML page per screen.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { BACKGROUND, decode, framePath, root, sprites } from './sprites.mjs';
import { TRANSPARENT, clearBackground, pixelSvg } from './svg.mjs';
import { canvas, deriveFont, layout, screen } from './glyphs.mjs';
import { ttf, woff2 } from './ttf.mjs';

const out = new URL('screens/', root);
const EXACT = { exactUpTo: 0, cornerCut: 0 };
const GAME_FONTS = { 'font-6': 'Supaplex 6', 'font-8': 'Supaplex 8' };
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Every unknown pixel takes the most common colour among its known 4-neighbours, a ring at a time.
function inpaint(grid, covered) {
  const g = grid.map((row) => [...row]);
  let unknown = [...covered].map((k) => k.split(',').map(Number));
  const known = (x, y) => g[y]?.[x] !== undefined && !covered.has(`${x},${y}`);
  while (unknown.length) {
    const fill = [];
    for (const [x, y] of unknown) {
      const seen = new Map();
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (known(nx, ny)) seen.set(g[ny][nx], (seen.get(g[ny][nx]) ?? 0) + 1);
      if (seen.size) fill.push([x, y, [...seen].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]]);
    }
    if (!fill.length) throw new Error('inpaint: covered pixels with no known neighbour');
    for (const [x, y, c] of fill) { g[y][x] = c; covered.delete(`${x},${y}`); }
    unknown = unknown.filter(([x, y]) => covered.has(`${x},${y}`));
  }
  return g;
}

export async function buildScreens(copyright) {
  const { fonts, screens } = JSON.parse(await readFile(new URL('screens.json', root), 'utf8'));
  await mkdir(out, { recursive: true });
  const covered = new Map(Object.keys(screens).map((id) => [id, new Set()]));
  const text = new Map(), fontList = [];

  for (const [name, f] of Object.entries(fonts)) {
    const runs = Object.entries(screens).flatMap(([id, s]) => (s.text ?? []).filter((r) => r.font === name).map((r) => ({ ...r, screen: id })));
    const derived = await deriveFont({ ...f, runs });
    const { palette } = await screen(runs[0].screen);
    for (const [i, run] of runs.entries()) {
      const { u, text: t } = derived.texts[i];
      const { at, get } = await canvas(run, f.h);
      const drawn = new Map(layout(derived, t).map(([x, y, c]) => [`${x + u},${y}`, c]));
      for (const [k, c] of drawn) {
        const [x, y] = k.split(',').map(Number);
        if (get(x, y) !== c) throw new Error(`${f.family}: "${run.text}" draws ${c} at ${at(x, y)}, screen has ${get(x, y)}`);
        covered.get(run.screen).add(at(x, y).join());
      }
      for (let v = 0; v < f.h; v++) for (let x = 0; x < run.w; x++) {
        if (f.ink.includes(get(x, v)) && !drawn.has(`${x},${v}`)) throw new Error(`${f.family}: "${run.text}" misses ink at ${at(x, v)}`);
      }
      text.set(run, { ...run, ...(run.rotate ? { y: run.y + u } : { x: run.x + u }), text: t, family: f.family, h: f.h });
    }

    const glyphs = derived.glyphs.map((g) => ({
      cps: g.vs ? [] : [g.c.codePointAt(0)], advance: g.advance,
      layers: [...Map.groupBy(g.pixels, (p) => p[2])].sort((a, b) => a[0] - b[0]).map(([colour, px]) => ({ colour, pixels: px.map(([x, y]) => [x, y]) })),
    }));
    const variants = derived.glyphs.flatMap((g, i) => (g.vs ? [{ base: g.c.codePointAt(0), vs: g.vs, glyph: i }] : []));
    const font = ttf(glyphs, { family: f.family, copyright, em: f.h, ascent: f.h, palette, kern: derived.kern, variants });
    const files = ['woff2', 'ttf'].map((ext) => `fonts/supaplex-${name}.${ext}`);
    await writeFile(new URL(files[1], root), font);
    await writeFile(new URL(files[0], root), woff2(font));
    fontList.push({ name, family: f.family, h: f.h, files, samples: [...new Set(runs.map((r) => r.text))] });
  }

  // Icons: sprite frames as placed, or crops of the screen itself; either must match the screen pixel for pixel.
  const icons = new Map();
  for (const [id, s] of Object.entries(screens)) {
    const { grids: [g], palette } = await screen(id);
    icons.set(id, []);
    for (const icon of s.icons ?? []) {
      let grid, src, name;
      if (icon.crop) {
        const [cx, cy, w, h] = icon.crop;
        grid = clearBackground(g.slice(cy, cy + h).map((row) => row.slice(cx, cx + w)));
        src = `${id}-${slug(icon.name)}.svg`;
        name = icon.name;
        await writeFile(new URL(src, out), pixelSvg(grid, palette, name, EXACT));
      } else {
        const sprite = sprites.find((sp) => sp.id === icon.sprite);
        grid = BACKGROUND[sprite.kind]((await decode(sprite)).grids[icon.frame ?? 0]);
        src = `../svg/pixel/${framePath(sprite, icon.frame ?? 0)}`;
        name = sprite.name;
      }
      grid.forEach((row, y) => row.forEach((c, x) => {
        if (c === TRANSPARENT) return;
        if (g[icon.y + y][icon.x + x] !== c) throw new Error(`${id}: ${name} differs from the screen at ${icon.x + x},${icon.y + y}`);
        covered.get(id).add(`${icon.x + x},${icon.y + y}`);
      }));
      icons.get(id).push({ src, name, x: icon.x, y: icon.y, w: grid[0].length, h: grid.length });
    }
  }

  const pages = Object.entries(screens).map(([id, s]) => ({ id, name: s.name }));
  for (const [id, s] of Object.entries(screens)) {
    const { grids: [g], palette } = await screen(id);
    const name = s.name;
    await writeFile(new URL(`${id}.svg`, out), pixelSvg(inpaint(g, covered.get(id)), palette, `${name}, background`, EXACT));
    let intro = '';
    if (s.from) {
      // The split reveals this screen drawn in the first screen's palette, before the palette fades over.
      const from = await screen(s.from);
      await writeFile(new URL(`${s.from}.svg`, out), pixelSvg(from.grids[0], from.palette, name, EXACT));
      await writeFile(new URL(`${id}-dim.svg`, out), pixelSvg(g, from.palette, `${name}, dimmed`, EXACT));
      intro = ` data-from="${s.from}.svg" data-dim="${id}-dim.svg"`;
    }

    const families = new Set();
    const els = [];
    for (const r of [...text.values()].filter((r) => r.screen === id)) {
      families.add(r.family);
      const at = r.rotate ? `left:${r.x + r.h}px;top:${r.y}px;transform:rotate(${r.rotate}deg)` : `left:${r.x}px;top:${r.y}px`;
      els.push(`<div class="t" contenteditable="plaintext-only" spellcheck="false" style="${at};font:${r.h}px/${r.h}px '${r.family}'">${escape(r.text)}</div>`);
    }
    for (const slot of s.slots ?? []) {
      const family = GAME_FONTS[slot.font];
      families.add(family);
      els.push(`<div class="t slot" contenteditable="plaintext-only" spellcheck="false" title="${escape(slot.label)}" style="left:${slot.x}px;top:${slot.y}px;min-width:${slot.w}px;font:8px/8px '${family}';color:${palette[slot.colour]}"></div>`);
    }
    for (const i of icons.get(id)) {
      els.push(`<img class="icon" src="${i.src}" alt="${escape(i.name)}" width="${i.w}" height="${i.h}" draggable="false" style="left:${i.x}px;top:${i.y}px">`);
    }
    const files = (family) => {
      const f = fontList.find((x) => x.family === family);
      const base = f ? `supaplex-${f.name}` : `supaplex-${family.split(' ')[1]}`;
      return `url(../fonts/${base}.woff2) format('woff2'), url(../fonts/${base}.ttf) format('truetype')`;
    };
    const faces = [...families].sort().map((family) => `    @font-face { font-family: '${family}'; src: ${files(family)}; }`).join('\n');
    const nav = pages.map((p) => (p.id === id ? `<a aria-current="page">${escape(p.name)}</a>` : `<a href="${p.id}.html">${escape(p.name)}</a>`)).join(' ');
    const [w, h] = [g[0].length, g.length];
    await writeFile(new URL(`${id}.html`, out), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supaplex screens: ${escape(name)}</title>
  <link rel="icon" href="../svg/pixel/murphy.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="../screen.css">
  <style>
${faces}
  </style>
</head>
<body>
  <header class="bar">
    <h1><a href="../" class="home">Supaplex SVG</a></h1>
    <nav class="pages">${nav}</nav>
    <a href="https://github.com/acharlop/supaplex-icons">GitHub</a>
  </header>
  <main class="screens">
    <div class="frame"><div id="scr" class="scr" style="width:${w}px;height:${h}px"${intro}>
      <img class="bg" src="${id}.svg" alt="" width="${w}" height="${h}">
      ${els.join('\n      ')}
    </div></div>
    <div id="toolbar" class="toolbar"></div>
  </main>
  <script type="module" src="../screen.js"></script>
</body>
</html>
`);
  }
  return { fonts: fontList, pages };
}

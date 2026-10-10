import { EFFECTS, sound } from './sound.js';

const [catalog, { fonts, pages }] = await Promise.all(['catalog.json', 'screens.json'].map(async (f) => (await fetch(f)).json()));
const CAST = ['murphy-yawn', 'infotron-roll-right', 'snik-snak-turn-left', 'electron-spin', 'bug-sparks', 'zonk-roll-right', 'terminal', 'exit', 'orange-disk', 'red-disk', 'yellow-disk', 'port-cross', 'explosion', 'murphy-eat-infotron-right'];
const ABOUT = {
  'title-2': 'The credits, with the split intro from the title screen.',
  menu: 'Players, rankings and the level list, with working buttons.',
  controls: 'The options screen: sound card, music, effects, keyboard or joystick.',
  gfx: 'The gfx-tutor: every tile and what it does.',
  panel: 'The bar under the playfield: player, level, time and infotrons left.',
};
const FRAME_MS = 80;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const byId = new Map(catalog.map((s) => [s.id, s]));

const svgs = catalog.reduce((n, s) => n + s.pixel.length, 0);
$('stats').append(...[
  [catalog.length, 'sprites'], [svgs, 'pixel SVGs'], [2 + fonts.length, 'fonts'], [pages.length, 'editable screens'],
].map(([n, label]) => el('li', {}, el('b', { textContent: n }), el('span', { textContent: label }))));

// Every animated img shares one clock so the cast moves in step.
const animated = [];
function sprite(s, size) {
  const img = el('img', { src: s.pixel[0], alt: '', width: size, height: size, className: 'px' });
  if (s.pixel.length > 1 && !still) {
    s.pixel.forEach((src) => { new Image().src = src; });
    animated.push([img, s.pixel]);
  }
  return img;
}
let tick = 0;
setInterval(() => {
  tick++;
  for (const [img, frames] of animated) img.src = frames[tick % frames.length];
}, FRAME_MS);

const cast = () => el('ul', { ariaHidden: 'true' }, ...CAST.map((id) => byId.get(id)).filter(Boolean)
  .map((s) => el('li', {}, sprite(s, 64), el('span', { textContent: s.name }))));
document.querySelector('.cast').append(cast(), cast());

$('screen-cards').append(...pages.map(({ id, name }) => el('a', { className: 'card', href: `screens/${id}.html` },
  el('img', { className: 'px', src: `svg/pixel/${id}.svg`, alt: '', width: 320, height: byId.get(id)?.h ?? 200, loading: 'lazy' }),
  el('b', { className: 'pix', textContent: name }),
  el('span', { textContent: ABOUT[id] ?? '' }))));

$('tiles').append(...catalog.filter((s) => s.kind === 'tile' || s.kind === 'animation').map((s) => {
  const a = el('a', { href: `sprites.html#s=${s.id}`, title: s.name }, sprite(s, 48));
  a.firstChild.alt = s.name;
  return a;
}));

$('effects').append(...Object.entries(EFFECTS).map(([name, [id, frame, about]]) => el('button', { type: 'button', title: about, onclick: () => sound(name) },
  el('img', { className: 'px', src: byId.get(id).pixel[frame], alt: '', width: 48, height: 48 }), el('span', { className: 'pix', textContent: name }))));

for (const f of fonts) document.fonts.add(new FontFace(f.family, f.files.map((path) => `url(${path})`).join(', ')));
$('typeset').append(
  el('div', { textContent: 'SUPAPLEX 8  ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', style: 'font:16px/16px "Supaplex 8";color:#eeee00' }),
  el('div', { textContent: 'SUPAPLEX 6  THE QUICK BROWN FOX JUMPS OVER THE LAZY ZONK', style: 'font:16px/16px "Supaplex 6";color:#00bb66' }),
  ...fonts.map((f) => el('div', { textContent: f.samples[0], style: `font:${f.h * 2}px/${f.h * 2}px "${f.family}"` })),
);

import { isEmpty, panel } from './supaplex.js';

// The game panel as the page footer: the menu's player, the page as the level, the sprites as infotrons.
const COLOURS = { 6: '#ee1111', 8: '#7799ee' };
const at = (path) => new URL(path, import.meta.url).href;
const hud = document.querySelector('.hud');
const save = JSON.parse(localStorage.getItem('supaplex-save') ?? 'null');
const player = save?.players[save.current];
const name = !player || isEmpty(player) ? 'MURPHY' : player.name;
const level = Number(hud.dataset.level);
const dashes = 21 - hud.dataset.title.length;
const title = `${'-'.repeat(Math.floor(dashes / 2))} ${hud.dataset.title.toUpperCase()} ${'-'.repeat(Math.ceil(dashes / 2))}`;
const sprites = (await (await fetch(at('catalog.json'))).json()).length;
const levels = Object.assign([], { [level - 1]: [title, sprites] });

const link = Object.assign(document.createElement('a'), { href: at('screens/menu.html'), title: 'Main menu' });
link.append(Object.assign(document.createElement('img'), { src: at('screens/panel.svg'), alt: '', width: 320, height: 24 }));
const slots = panel({ name, level }, levels, 0).map(({ x, y }) => {
  const el = document.createElement('div');
  Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
  return el;
});
link.append(...slots);
hud.append(link);

const start = Date.now();
const draw = () => panel({ name, level }, levels, Math.floor((Date.now() - start) / 1000)).forEach(({ colour, text }, i) => {
  slots[i].textContent = text;
  slots[i].style.color = COLOURS[colour];
});
draw();
setInterval(draw, 250);

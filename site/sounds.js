import { EFFECTS, FX, MUSIC, effect, play, save, settings, startMusic, stopMusic } from './sound.js';

const CARDS = { adlib: 'AdLib', blaster: 'S. Blaster', roland: 'Roland', combined: 'Combined', standard: 'Internal standard', samples: 'Internal samples' };
const SETS = { beep: 'Internal standard', sample: 'Internal samples', adlib: 'AdLib', blaster: 'S. Blaster', roland: 'Roland' };
const TRACKS = { beep: 'Internal', adlib: 'AdLib', roland: 'Roland' };
const catalog = new Map((await (await fetch('catalog.json')).json()).map((s) => [s.id, s]));
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const cards = Object.entries(CARDS).map(([card, label]) => el('button', { type: 'button', textContent: label, onclick: () => { save({ card }); mark(); } }));
$('cards').append(...cards);

let track = null;
const tracks = Object.entries(TRACKS).map(([sound, label]) => {
  const button = el('button', { type: 'button', textContent: `▶ ${label}` });
  button.onclick = async () => {
    stopMusic();
    if (track === sound) track = null;
    else {
      track = sound;
      button.textContent = `… ${label}`;
      await startMusic(sound);
    }
    mark();
  };
  return button;
});
$('music').append(...tracks);

const sets = Object.keys(SETS);
$('effects').append(
  el('span'), ...sets.map((set) => el('span', { className: 'set', textContent: SETS[set] })),
  ...Object.entries(EFFECTS).flatMap(([name, [id, frame, about]]) => [
    el('div', { className: 'effect' }, el('img', { className: 'px', src: catalog.get(id).pixel[frame], alt: '', width: 32, height: 32 }), el('span', {}, el('b', { className: 'pix', textContent: name }), el('br'), about)),
    ...sets.map((set) => {
      const button = el('button', { type: 'button', className: 'btn', textContent: '▶', title: `${name}, ${SETS[set]}`, onclick: () => play(effect(name, set)) });
      button.dataset.set = set;
      return button;
    }),
  ]),
);
const effectButtons = [...$('effects').querySelectorAll('button')];

function mark() {
  const { card } = settings();
  cards.forEach((b, i) => b.setAttribute('aria-pressed', Object.keys(CARDS)[i] === card));
  tracks.forEach((b, i) => {
    const sound = Object.keys(TRACKS)[i];
    b.textContent = `${track === sound ? '■' : '▶'} ${TRACKS[sound]}`;
    b.setAttribute('aria-pressed', sound === (track ?? MUSIC[card]));
  });
  effectButtons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.set === FX[card]));
}
mark();

// The game's sound: the card picks the music and effect files (OpenSupaplex audio.c), settings persist across pages.
import { render } from './xm.js';

const KEY = 'supaplex-sound';
// Each effect with the sprite frame that makes it.
export const EFFECTS = {
  base: ['base', 0, 'Murphy eats base'], bug: ['bug-sparks', 7, 'A bug sparks'], exit: ['exit', 0, 'Murphy leaves the level'], explosion: ['explosion', 4, 'Something blows up'],
  fall: ['zonk', 0, 'A zonk or infotron lands'], infotron: ['infotron', 0, 'Murphy eats an infotron'], push: ['murphy-push-right', 0, 'Murphy pushes'],
};
export const MUSIC = { standard: 'beep', samples: 'beep', adlib: 'adlib', blaster: 'adlib', roland: 'roland', combined: 'roland' };
export const FX = { standard: 'beep', samples: 'sample', adlib: 'adlib', blaster: 'blaster', roland: 'roland', combined: 'blaster' };
const dir = new URL('sounds/', import.meta.url);

export const settings = () => ({ card: 'combined', music: true, fx: true, joystick: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') });
export function save(patch) {
  const s = { ...settings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

let ctx = null;
const audio = () => (ctx ??= new AudioContext());
const cache = new Map();
const once = (key, make) => cache.get(key) ?? cache.set(key, make()).get(key);
const fetched = async (name) => (await fetch(new URL(name, dir))).arrayBuffer();

export const effect = (name, sound) => once(`${name}-${sound}`, async () => audio().decodeAudioData(await fetched(`${name}-${sound}.wav`)));
export const song = (sound) => once(`music-${sound}`, async () => {
  const rate = audio().sampleRate, { left, right, loop } = render(await fetched(`music-${sound}.xm`), rate);
  const buffer = audio().createBuffer(2, left.length, rate);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return { buffer, loop: loop / rate };
});

// One effect at a time, as on the PC speaker and the game's single sound channel.
let fx = null;
export async function play(buffer) {
  fx?.stop();
  fx = audio().createBufferSource();
  fx.buffer = await buffer;
  fx.connect(audio().destination);
  fx.start();
  return new Promise((done) => { fx.onended = done; });
}
export const sound = (name) => settings().fx && play(effect(name, FX[settings().card]));

let music = null, wanted = false;
// The card's music if music is on, or a given track regardless.
export async function startMusic(track) {
  wanted = true;
  const { card, music: on } = settings();
  if ((!on && !track) || music) return;
  const playing = music = audio().createBufferSource();
  const { buffer, loop } = await song(track ?? MUSIC[card]);
  if (music !== playing || !wanted) return;
  Object.assign(music, { buffer, loop: true, loopStart: loop, loopEnd: buffer.duration });
  music.connect(audio().destination);
  music.start();
}
export function stopMusic() {
  wanted = false;
  music?.buffer && music.stop();
  music = null;
}

// Browsers only let sound start from a user gesture.
export function musicOnGesture() {
  const start = () => { audio().resume(); startMusic(); };
  addEventListener('pointerdown', start, { once: true, capture: true });
  addEventListener('keydown', start, { once: true, capture: true });
}

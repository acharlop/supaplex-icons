import { BUTTONS, CONGRATULATIONS, CREDITS, LEVELS, autoSelect, emptyPlayer, frame, hit, isEmpty, levelColour, line, optionHit, options, ranked, seed, skips, statistics } from './supaplex.js';
import { musicOnGesture, save, settings, sound, startMusic, stopMusic } from './sound.js';

const { levels, palette } = JSON.parse(document.getElementById('game').textContent);
const params = new URLSearchParams(location.search);
const scr = document.getElementById('scr');
const W = scr.offsetWidth, H = scr.offsetHeight;
// Embeds keep their own save for the tab; verify always starts from the seed.
const store = params.has('bare') ? sessionStorage : localStorage;
const KEY = 'supaplex-save';
const FPS = 70, FADE = 64000 / FPS, SLIDE = 80000 / FPS;
const ARROWS = { 'player-up': ['current', -1], 'player-down': ['current', 1], 'level-up': ['level', -1], 'level-down': ['level', 1], 'ranking-up': ['scroll', -1], 'ranking-down': ['scroll', 1] };

const saved = JSON.parse(store.getItem(KEY) ?? 'null');
const state = saved ? { ...saved, input: null, pressed: null } : seed();
const say = (text, colour) => { state.message = { text: line(text), colour }; };
say('  WELCOME TO SUPAPLEX', 4);
const end = params.get('end');
if (end) {
  say(end === 'demo' ? '      DEMO FAILED' : '     LEVEL FAILED', 4);
  const p = state.players[state.current], t = p.s + p.m * 60 + p.h * 3600 + Number(params.get('time') ?? 0);
  if (end === 'level' && !isEmpty(p)) Object.assign(p, { h: Math.floor(t / 3600), m: Math.floor(t / 60) % 60, s: t % 60 });
  params.delete('end');
  params.delete('time');
  history.replaceState(null, '', params.size ? `?${params}` : location.pathname);
}
const player = () => state.players[state.current];
const clear = () => say('', 8);

function make(tag, props = {}, style = {}) {
  const node = Object.assign(document.createElement(tag), props);
  Object.assign(node.style, style);
  return node;
}
const opaque = (x, y, colour, text) => make('div', { className: 't op', textContent: text }, { left: `${x}px`, top: `${y}px`, color: palette[colour] });

const texts = new Map(), lines = [];
function render() {
  const f = frame(state, levels);
  const seen = new Set();
  for (const { x, y, colour, text } of f.texts) {
    const k = `${x},${y}`;
    seen.add(k);
    const el = texts.get(k);
    if (el) Object.assign(el, { textContent: text }).style.color = palette[colour];
    else texts.set(k, layer.appendChild(opaque(x, y, colour, text)));
  }
  for (const [k, el] of texts) if (!seen.has(k)) { el.remove(); texts.delete(k); }
  f.lines.forEach((l, i) => {
    lines[i] ??= layer.appendChild(make('div', { className: 'line' }, { left: `${l.x}px`, top: `${l.y}px`, width: `${l.w}px`, height: `${l.h}px` }));
    lines[i].style.background = palette[l.colour];
  });
  store.setItem(KEY, JSON.stringify({ ...state, input: null, pressed: null }));
}

const layer = scr.appendChild(make('div', { className: 'game' }));
for (const b of BUTTONS) {
  scr.append(make('div', { className: 'hit', title: b.id.replace('-', ' ') }, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` }));
}

// The game's own pointer: drawn at the screen pixel under the mouse, animating every 4 frames.
const MOUSE = Array.from({ length: 8 }, (_, i) => `../svg/pixel/mouse/${i}.svg`);
MOUSE.forEach((src) => { new Image().src = src; });
const cursor = make('img', { className: 'cursor', alt: '', width: 8, height: 8, hidden: true });
setInterval(() => { cursor.src = MOUSE[Math.floor((performance.now() * FPS) / 4000) % 8]; }, 4000 / FPS);
scr.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const [x, y] = at(e);
  Object.assign(cursor.style, { left: `${x}px`, top: `${y}px` });
  cursor.hidden = false;
  scr.append(cursor);
});
scr.addEventListener('pointerleave', () => { cursor.hidden = true; });

// Screen pixel under the pointer, whatever the zoom.
function at(e) {
  const r = scr.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) * W) / r.width), Math.floor(((e.clientY - r.top) * H) / r.height)];
}

// Overlays: info screens fade through black; gfx and options scroll the menu out to the left, and back from the left on exit.
let overlay = null;
function info(rows) {
  const box = make('div', { className: 'overlay' });
  box.append(make('img', { src: '../svg/pixel/back.svg', alt: '', width: W, height: H }));
  for (const [x, y, text] of rows) box.append(make('div', { className: 't info', textContent: text }, { left: `${x}px`, top: `${y}px` }));
  const black = make('div', { className: 'overlay black' });
  scr.append(box, black);
  box.hidden = true;
  const fade = (from, to) => black.animate({ opacity: [from, to] }, { duration: FADE, fill: 'forwards' }).finished;
  const opened = fade(0, 1).then(() => { box.hidden = false; return fade(1, 0); });
  overlay = { close: () => opened.then(() => fade(0, 1)).then(() => { box.remove(); return fade(1, 0); }).then(() => black.remove()) };
}
function slide(src, instant = false) {
  const box = make('div', { className: 'overlay' });
  box.append(make('img', { src, alt: '', width: W, height: H }));
  const menu = [...scr.children].filter((el) => el !== cursor);
  scr.insertBefore(box, cursor.parentNode ? cursor : null);
  const move = (from, to) => Promise.all([[box, 0], ...menu.map((el) => [el, -W])].map(([el, d]) => el.animate(
    { translate: [`${from + d}px`, `${to + d}px`] }, { duration: SLIDE, easing: 'steps(80)', fill: 'forwards' }).finished));
  const opened = instant ? Promise.resolve() : move(W, 0);
  if (instant) menu.forEach((el) => { el.style.translate = `${-W}px`; });
  overlay = {
    box,
    close: () => opened.then(() => move(0, W)).then(() => {
      box.remove();
      menu.forEach((el) => { el.getAnimations().forEach((a) => a.cancel()); el.style.translate = ''; });
    }),
  };
  return overlay;
}

// The options screen: CONTROLS.DAT with its button text lit or dimmed, and border lines for the choices and the held keys.
const held = new Set();
const KEYS = { ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' };
const crop = ({ x, y, w, h, lit }) => {
  const box = make('div', { className: 'crop' }, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  box.append(make('img', { src: `controls-${lit ? 'lit' : 'dim'}.svg`, alt: '', width: W, height: H }, { left: `${-x}px`, top: `${-y}px` }));
  return box;
};
function optionsScreen(instant) {
  const { box } = slide('../svg/pixel/controls.svg', instant);
  const look = box.appendChild(make('div', { className: 'game' }));
  const draw = () => {
    const direction = [...held].findLast((k) => k !== 'fire') ?? null;
    const o = options(settings(), { direction, fire: held.has('fire') });
    look.replaceChildren(...o.texts.map(crop), ...o.lines.map((l) => make('div', { className: 'line' },
      { left: `${l.x}px`, top: `${l.y}px`, width: `${l.w}px`, height: `${l.h}px`, background: palette[l.colour] })));
  };
  draw();
  overlay.options = { draw, held };
}
const OPTIONS = {
  card(card) {
    stopMusic();
    save({ card });
    sound('explosion');
    startMusic();
  },
  music() {
    const music = !settings().music;
    save({ music });
    music ? startMusic() : stopMusic();
  },
  fx() {
    const fx = !settings().fx;
    save({ fx });
    sound('explosion');
  },
  keyboard: () => save({ joystick: false }),
  joystick: () => save({ joystick: true }),
};
function optionClick(x, y) {
  const id = optionHit(x, y);
  if (id === 'exit') return closeOverlay();
  if (!id) return;
  (OPTIONS[id] ?? OPTIONS.card)(id);
  overlay.options.draw();
}
function closeOverlay() {
  overlay.close();
  overlay = null;
}

// The name line: a hidden input so phones bring up a keyboard.
const input = scr.appendChild(make('input', { className: 'name', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, ariaLabel: 'Player name' }));
input.addEventListener('input', () => {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 8);
  state.input = input.value;
  render();
});
function confirmName() {
  const name = state.input;
  state.input = null;
  input.blur();
  input.value = '';
  if (!name.trim()) return clear();
  if (name === '--------') return say('INVALID NAME', 6);
  const padded = name.trimEnd().padStart(8);
  if (state.players.some((p) => p.name === padded)) return say('PLAYER EXISTS', 6);
  const slot = state.players.findIndex(isEmpty);
  state.players[slot] = { ...emptyPlayer(), name: padded };
  state.current = slot;
  state.level = autoSelect(player());
  clear();
}

let confirm = null;
function ask(text, onOk) {
  say(text, 8);
  confirm = onOk;
}

function go(page, query) {
  const q = new URLSearchParams(query);
  for (const k of ['bare', 'zoom']) if (params.has(k)) q.set(k, params.get(k));
  location.href = `${page}?${q}`;
}

const ACTIONS = {
  new() {
    if (!state.players.some(isEmpty)) return say('PLAYER LIST FULL', 6);
    say('YOUR NAME:', 4);
    state.input = '';
    input.focus();
  },
  delete() {
    if (isEmpty(player())) return say('NO PLAYER SELECTED', 8);
    ask(`DELETE '${player().name}' ???`, () => {
      state.players[state.current] = emptyPlayer();
      state.level = autoSelect(player());
    });
  },
  skip() {
    const p = player();
    if (isEmpty(p)) return say('NO PLAYER SELECTED', 8);
    if (skips(p) >= 3) return say('SKIP NOT POSSIBLE', 6);
    if (levelColour(p, state.level) !== 2) return say('COLORBLIND I GUESS', 4);
    const level = state.level;
    ask(`SKIP LEVEL ${String(level).padStart(3, '0')} ???`, () => { p.levels[level - 1] = 2; state.level = level + 1; });
  },
  statistics() {
    if (isEmpty(player())) return say('NO PLAYER SELECTED', 8);
    info(statistics(player()));
  },
  gfx: () => slide('../svg/pixel/gfx.svg'),
  controls: () => optionsScreen(),
  credits: () => info(CREDITS),
  demo: () => go('panel.html', { demo: 1 + Math.floor(Math.random() * LEVELS) }),
  ok() {
    const p = player();
    if (isEmpty(p)) return say('NO PLAYER SELECTED', 8);
    if (state.level === 113) return autoSelect(p) === 113 ? info(CONGRATULATIONS) : say('COLORBLIND I GUESS', 2);
    if (state.level === 112) return;
    if (levelColour(p, state.level) === 6) return say('COLORBLIND I GUESS', 8);
    go('panel.html', { level: state.level, player: p.name });
  },
  floppy: () => say('  SUPAPLEX LEVEL SET', 4),
  players() { state.scroll = Math.min(19, ranked(state.players).indexOf(state.current)); },
};

function step(id) {
  const [key, d] = ARROWS[id];
  if (key === 'current') {
    state.current = Math.max(0, Math.min(state.players.length - 1, state.current + d));
    state.level = autoSelect(player());
  } else if (key === 'level') state.level = Math.max(1, Math.min(113, state.level + d));
  else state.scroll = Math.max(0, Math.min(19, state.scroll + d));
  render();
}

// Held arrows repeat after 16 frames, one frame sooner each time, down to every frame.
let repeat = null;
function release() {
  clearTimeout(repeat);
  if (state.pressed) { state.pressed = null; render(); }
}
function hold(id) {
  state.pressed = id;
  let wait = 16;
  const tick = () => {
    step(id);
    wait = Math.max(1, wait - 1);
    repeat = setTimeout(tick, (wait * 1000) / FPS);
  };
  tick();
}

scr.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (overlay?.options) closeOverlay();
});
scr.addEventListener('pointerdown', (e) => {
  if (e.button) return;
  e.preventDefault();
  const [x, y] = at(e);
  if (overlay?.options) return optionClick(x, y);
  if (overlay) return closeOverlay();
  if (state.input !== null) return void (confirmName(), render());
  const id = hit(x, y);
  if (confirm) {
    if (id === 'ok') confirm();
    confirm = null;
    clear();
    return render();
  }
  if (!id) return;
  if (ARROWS[id]) {
    scr.setPointerCapture(e.pointerId);
    return hold(id);
  }
  scr.setPointerCapture(e.pointerId);
  ACTIONS[id]();
  render();
});
scr.addEventListener('pointerup', release);
scr.addEventListener('pointercancel', release);
scr.addEventListener('lostpointercapture', release);

// The options screen lights the arrow and fire borders while those keys are held.
const holdKey = (e, down) => {
  const key = e.key === ' ' ? 'fire' : KEYS[e.key];
  if (!key || !overlay?.options) return false;
  e.preventDefault();
  held.delete(key);
  if (down) held.add(key);
  overlay.options.draw();
  return true;
};
document.addEventListener('keyup', (e) => holdKey(e, false));
addEventListener('blur', () => { held.clear(); overlay?.options?.draw(); });
document.addEventListener('keydown', (e) => {
  if (overlay?.options && e.key !== 'Escape') return void holdKey(e, true);
  if (overlay) return closeOverlay();
  if (state.input !== null) {
    if (e.key === 'Enter') { confirmName(); render(); }
    else if (e.key === 'Escape') { state.input = null; input.blur(); input.value = ''; clear(); render(); }
    return;
  }
  if (e.key === ' ' && !confirm && e.target === document.body) {
    e.preventDefault();
    ACTIONS.ok();
    render();
  }
});

render();
if (params.has('options')) optionsScreen(true);
if (!params.has('bare')) musicOnGesture();

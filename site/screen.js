const ZOOMS = [1, 2, 3, 4];
// openCreditsBlock: 13- and 14-px strips of the first screen part over 60 frames at 70 fps, then a 64-frame palette fade.
const SPLIT = { top: 26, height: 148, left: 147, right: 161, leftW: 13, rightW: 14, travel: 121, ms: 60000 / 70, fadeMs: 64000 / 70, holdMs: 1000 };

const params = new URLSearchParams(location.search);
const scr = document.getElementById('scr');
const toolbar = document.getElementById('toolbar');
const W = scr.offsetWidth;
const bare = params.has('bare');
// The largest whole zoom that fits the window, less the page chrome and the panel footer around the screen.
const fit = (x = 0, y = 0) => Math.max(1, Math.floor(Math.min((innerWidth - x) / W, (innerHeight - y) / scr.offsetHeight)));
let zoom = Number(params.get('zoom')) || (bare ? fit() : Math.min(4, fit(40, 280)));
let selected = null;
document.body.classList.toggle('bare', bare);
if (bare && !params.has('zoom')) {
  document.body.classList.add('fit');
  addEventListener('resize', () => setZoom(fit()));
}

function make(tag, props = {}, style = {}) {
  const node = Object.assign(document.createElement(tag), props);
  Object.assign(node.style, style);
  return node;
}
function button(label, onClick) {
  const b = make('button', { type: 'button', textContent: label });
  b.addEventListener('click', onClick);
  return b;
}

function setZoom(k) {
  zoom = k;
  scr.style.zoom = k;
  toolbar.querySelectorAll('[data-zoom]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.zoom) === k));
}

function select(node) {
  selected?.classList.remove('selected');
  selected = node;
  node?.classList.add('selected');
}

// Icons move in whole screen pixels.
function draggable(img) {
  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    select(img);
    img.setPointerCapture(e.pointerId);
    const start = [e.clientX, e.clientY, img.offsetLeft, img.offsetTop];
    const move = (m) => {
      img.style.left = `${start[2] + Math.round((m.clientX - start[0]) / zoom)}px`;
      img.style.top = `${start[3] + Math.round((m.clientY - start[1]) / zoom)}px`;
    };
    img.addEventListener('pointermove', move);
    img.addEventListener('pointerup', () => img.removeEventListener('pointermove', move), { once: true });
  });
}
scr.querySelectorAll('.icon').forEach(draggable);
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.icon, .toolbar')) select(null); });
document.addEventListener('keydown', (e) => {
  if (!selected || e.target.isContentEditable) return;
  const step = e.shiftKey ? 8 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (d) {
    e.preventDefault();
    selected.style.left = `${selected.offsetLeft + d[0]}px`;
    selected.style.top = `${selected.offsetTop + d[1]}px`;
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    selected.remove();
    select(null);
  }
});

// The page as edited; asset URLs resolve against where it was downloaded from.
function download() {
  const doc = document.documentElement.cloneNode(true);
  doc.querySelector('#toolbar').replaceChildren();
  doc.querySelector('.intro')?.remove();
  doc.querySelector('.hud').replaceChildren();
  doc.querySelector('#scr').style.removeProperty('zoom');
  doc.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
  doc.querySelector('body').classList.remove('show-slots', 'bare');
  doc.querySelector('head').prepend(make('base', { href: location.href }));
  const a = make('a', { download: location.pathname.split('/').pop(), href: URL.createObjectURL(new Blob([`<!doctype html>\n${doc.outerHTML}`], { type: 'text/html' })) });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function addIconPicker() {
  const catalog = await (await fetch('../catalog.json')).json();
  const picker = make('select', { ariaLabel: 'Add icon' });
  picker.append(make('option', { value: '', textContent: 'Add icon…' }));
  for (const s of catalog.filter((s) => s.pixel && (s.kind === 'tile' || s.kind === 'animation'))) {
    picker.append(make('option', { value: s.id, textContent: s.name }));
  }
  picker.addEventListener('change', () => {
    const s = catalog.find((x) => x.id === picker.value);
    picker.value = '';
    if (!s) return;
    const img = make('img', { className: 'icon', src: `../${s.pixel[0]}`, alt: s.name, width: s.w, height: s.h, draggable: false },
      { left: `${(W - s.w) >> 1}px`, top: `${(scr.offsetHeight - s.h) >> 1}px` });
    scr.append(img);
    draggable(img);
    select(img);
  });
  return picker;
}

// The intro: the first screen splits down the middle, revealing this one dimmed, which then fades up.
function intro() {
  const layer = make('div', { className: 'intro' });
  const img = (src, x, y) => make('img', { src, alt: '', width: W, height: scr.offsetHeight }, { left: `${-x}px`, top: `${-y}px` });
  const box = (x, w, child) => {
    const d = make('div', {}, { left: `${x}px`, top: `${SPLIT.top}px`, width: `${w}px`, height: `${SPLIT.height}px` });
    d.append(child);
    return d;
  };
  const { from, dim } = scr.dataset;
  const base = img(from, 0, 0), full = img(dim, 0, 0);
  const reveal = box(0, 0, img(dim, 0, SPLIT.top));
  const left = box(0, SPLIT.leftW, img(from, SPLIT.left, SPLIT.top));
  const right = box(0, SPLIT.rightW, img(from, SPLIT.right, SPLIT.top));
  layer.append(base, reveal, left, right, full);
  scr.append(layer);
  const split = (d) => {
    const l = SPLIT.left - d, r = SPLIT.right + d;
    Object.assign(left.style, { left: `${l}px` });
    Object.assign(right.style, { left: `${r}px` });
    Object.assign(reveal.style, { left: `${l + SPLIT.leftW}px`, width: `${r - l - SPLIT.leftW}px` });
    reveal.firstChild.style.left = `${-(l + SPLIT.leftW)}px`;
    full.hidden = true;
    layer.style.opacity = 1;
    layer.hidden = false;
  };
  let frame;
  const play = () => {
    cancelAnimationFrame(frame);
    split(0);
    const t0 = performance.now();
    const tick = (now) => {
      const t = now - t0 - SPLIT.holdMs;
      if (t < SPLIT.ms) split(Math.max(0, Math.ceil((SPLIT.travel * t) / SPLIT.ms)));
      else if (t < SPLIT.ms + SPLIT.fadeMs) {
        full.hidden = false;
        layer.style.opacity = 1 - (t - SPLIT.ms) / SPLIT.fadeMs;
      } else return void (layer.hidden = true);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  return { play, split, end: () => { cancelAnimationFrame(frame); layer.hidden = true; } };
}

toolbar.append(...ZOOMS.map((k) => {
  const b = button(`${k}x`, () => setZoom(k));
  b.dataset.zoom = k;
  return b;
}));
// The menu, and the panel while a level runs, belong to the game rather than the editor.
const playing = scr.dataset.play !== undefined || params.has('level') || params.has('demo');
const slots = button('Show slots', () => slots.setAttribute('aria-pressed', document.body.classList.toggle('show-slots')));
slots.setAttribute('aria-pressed', false);
if (!playing) toolbar.append(slots, button('Download HTML', download));
setZoom(zoom);

if (scr.dataset.from) {
  const anim = intro();
  toolbar.append(button('Replay intro', anim.play));
  const at = params.get('at');
  if (at === 'end') anim.end();
  else if (at !== null) anim.split(Math.min(SPLIT.travel, Math.max(0, Number(at))));
  else if (matchMedia('(prefers-reduced-motion: reduce)').matches) anim.end();
  else document.fonts.ready.then(anim.play);
}

if (playing) toolbar.append(make('p', { className: 'hint muted', textContent: params.has('level') || params.has('demo') ? 'Click or press Escape to give up and go back to the menu.' : 'Click the buttons: they work as in the game. Type a name after new player, then Enter.' }));
else {
  toolbar.append(make('p', { className: 'hint muted', textContent: 'Click text to edit it. Drag icons, or select one and use the arrow keys (shift: 8px) and Delete.' }));
  addIconPicker().then((picker) => toolbar.insertBefore(picker, toolbar.querySelector('.hint')), () => {});
}

const catalog = await (await fetch('catalog.json')).json();
const SIZES = [16, 32, 64, 128, 256];
const KINDS = [['all', 'All'], ['tile', 'Tiles'], ['animation', 'Animations'], ['font', 'Fonts'], ['screen', 'Screens']];
const FRAME_MS = 80;

const params = new URLSearchParams(location.hash.slice(1));
const state = {
  id: params.get('s') ?? 'murphy',
  size: Number(params.get('size')) || 128,
  kind: params.get('kind') ?? 'all',
};
const $ = (id) => document.getElementById(id);
const done = (s) => Boolean(s.pixel);
// Screens and wide frames never shrink below native size.
const widthAt = (sprite, size) => Math.max(size, sprite.w);
let timer;

$('progress').textContent = `${catalog.filter(done).length} / ${catalog.length} pixel-exact`;

function save() {
  history.replaceState(null, '', `#s=${state.id}&size=${state.size}&kind=${state.kind}`);
}

function original(sprite, width, animate = true) {
  const el = document.createElement('div');
  if (!sprite.frames) {
    el.className = 'missing';
    el.textContent = 'Not decoded yet';
    return el;
  }
  const scale = width / sprite.w;
  el.className = 'film';
  el.style.width = `${sprite.w * scale}px`;
  el.style.height = `${sprite.h * scale}px`;
  el.style.backgroundImage = `url(original/${sprite.id}.svg)`;
  el.style.backgroundSize = `${sprite.w * sprite.frames * scale}px 100%`;
  // Font thumbnails show "A"; frame 0 is the blank space glyph.
  if (!animate && sprite.kind === 'font') el.style.backgroundPosition = `${-sprite.w * 33 * scale}px 0`;
  if (animate && sprite.frames > 1) {
    el.style.setProperty('--end', `${-sprite.w * sprite.frames * scale}px`);
    el.style.animation = `film ${sprite.frames * FRAME_MS}ms steps(${sprite.frames}) infinite`;
  }
  return el;
}

function variant(sprite, kind, size) {
  if (!sprite[kind]) {
    const el = document.createElement('div');
    el.className = 'missing';
    el.textContent = 'Not made yet';
    return el;
  }
  const frames = kind === 'pixel' ? sprite.pixel : [`svg/smooth/${sprite.id}.svg`];
  const width = widthAt(sprite, size);
  const img = new Image(width, width * (sprite.h / sprite.w));
  img.src = frames[0];
  img.alt = `${sprite.name}, ${kind}`;
  if (frames.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const src of frames) new Image().src = src;
    let i = 0;
    timer = setInterval(() => { img.src = frames[i = (i + 1) % frames.length]; }, FRAME_MS);
  }
  return img;
}

function renderDetail() {
  const sprite = catalog.find((s) => s.id === state.id) ?? catalog[0];
  clearInterval(timer);
  $('detail-name').textContent = sprite.name;
  $('detail-meta').textContent = [sprite.file, sprite.frames > 1 && `${sprite.frames} frames`, sprite.todo].filter(Boolean).join(' · ');
  $('stage-original').replaceChildren(original(sprite, widthAt(sprite, state.size)));
  for (const kind of ['pixel', 'smooth']) {
    $(`stage-${kind}`).replaceChildren(variant(sprite, kind, state.size));
    const link = $(`dl-${kind}`);
    link.hidden = !sprite[kind];
    link.href = kind === 'pixel' ? sprite.pixel?.[0] ?? '' : `svg/smooth/${sprite.id}.svg`;
    link.textContent = sprite.frames > 1 && kind === 'pixel' ? 'frame 1 svg' : 'svg';
  }
  document.querySelectorAll('.sizes button').forEach((b) => b.setAttribute('aria-pressed', Number(b.value) === state.size));
  document.querySelectorAll('#grid button').forEach((b) => b.setAttribute('aria-current', b.value === sprite.id));
}

function renderGrid() {
  const items = catalog.filter((s) => state.kind === 'all' || s.kind === state.kind);
  $('grid').replaceChildren(...items.map((sprite) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.value = sprite.id;
    const thumb = original(sprite, 48, false);
    thumb.classList.add('thumb');
    const name = document.createElement('span');
    name.textContent = sprite.name;
    const status = document.createElement('span');
    status.className = done(sprite) ? 'status done' : 'status';
    status.textContent = done(sprite) ? 'Pixel-exact' : 'To do';
    button.append(thumb, name, status);
    button.addEventListener('click', () => { state.id = sprite.id; save(); renderDetail(); });
    li.append(button);
    return li;
  }));
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.value === state.kind));
  renderDetail();
}

document.querySelector('.sizes').append(...SIZES.map((size) => {
  const b = document.createElement('button');
  b.value = size;
  b.textContent = `${size}px`;
  b.addEventListener('click', () => { state.size = size; save(); renderDetail(); });
  return b;
}));

document.querySelector('.tabs').append(...KINDS.map(([kind, label]) => {
  const b = document.createElement('button');
  b.value = kind;
  b.role = 'tab';
  b.textContent = `${label} (${kind === 'all' ? catalog.length : catalog.filter((s) => s.kind === kind).length})`;
  b.addEventListener('click', () => { state.kind = kind; save(); renderGrid(); });
  return b;
}));

renderGrid();

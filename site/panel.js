import { panel } from './supaplex.js';

// Started from the menu: the panel fills in and the clock runs until Escape or a click goes back.
const params = new URLSearchParams(location.search);
const level = Number(params.get('level') || params.get('demo'));
if (level) {
  const { levels, palette } = JSON.parse(document.getElementById('game').textContent);
  const scr = document.getElementById('scr');
  const demo = params.has('demo');
  const slots = new Map([...scr.querySelectorAll('.slot')].map((el) => [`${el.style.left},${el.style.top}`, el]));
  const start = Date.now();
  let seconds = 0;
  const draw = () => {
    for (const { x, y, colour, text } of panel({ name: params.get('player'), level, demo }, levels, seconds)) {
      const el = slots.get(`${x}px,${y}px`);
      el.classList.add('op');
      el.textContent = text;
      el.style.color = palette[colour];
    }
  };
  draw();
  const timer = setInterval(() => { seconds = Math.floor((Date.now() - start) / 1000); draw(); }, 250);
  const back = () => {
    clearInterval(timer);
    const q = new URLSearchParams({ end: demo ? 'demo' : 'level', time: seconds });
    for (const k of ['bare', 'zoom']) if (params.has(k)) q.set(k, params.get(k));
    location.href = `menu.html?${q}`;
  };
  scr.addEventListener('pointerdown', back);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
  scr.classList.add('playing');
}

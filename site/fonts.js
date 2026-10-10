const SCALES = [1, 2, 4, 8];
const CHARSET = Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x20 + i)).join('').trim();
const params = new URLSearchParams(location.hash.slice(1));
const state = {
  scale: Number(params.get('x')) || 4,
  text: params.get('t') ?? 'LEVEL 001  WARM UP\nINFOTRONS NEEDED: 004\nPRESS SPACE TO START',
};
const text = document.getElementById('text');
text.value = state.text;

function render() {
  history.replaceState(null, '', `#x=${state.scale}&t=${encodeURIComponent(state.text)}`);
  for (const section of document.querySelectorAll('.font')) {
    section.querySelector('.screen').style.font = `${8 * state.scale}px/${8 * state.scale}px '${section.dataset.family}'`;
    section.querySelector('.sample').textContent = state.text;
    section.querySelector('.charset').textContent = CHARSET;
  }
  for (const sample of document.querySelectorAll('.screen-font .sample')) {
    sample.style.font = `${sample.dataset.h * state.scale}px/${sample.dataset.h * state.scale}px '${sample.dataset.family}'`;
  }
  document.querySelectorAll('#sizes button').forEach((b) => b.setAttribute('aria-pressed', Number(b.value) === state.scale));
}

document.getElementById('sizes').append(...SCALES.map((scale) => {
  const b = document.createElement('button');
  b.value = scale;
  b.textContent = `${8 * scale}px`;
  b.addEventListener('click', () => { state.scale = scale; render(); });
  return b;
}));
text.addEventListener('input', () => { state.text = text.value; render(); });
render();

const { fonts } = await (await fetch('screens.json')).json();
for (const f of fonts) {
  document.fonts.add(new FontFace(f.family, f.files.map((path) => `url(${path})`).join(', ')));
  const section = document.createElement('div');
  section.className = 'screen-font';
  section.innerHTML = `<h3>${f.family} <span class="muted">${f.h}px</span></h3>
    <p>${f.files.map((path) => `<a href="${path}" download>${path.split('.').pop()}</a>`).join(' ')}</p>
    <div class="screen"><div class="sample" contenteditable="plaintext-only" spellcheck="false"></div></div>`;
  Object.assign(section.querySelector('.sample').dataset, { family: f.family, h: f.h });
  section.querySelector('.sample').textContent = f.samples.join('\n');
  document.getElementById('screen-fonts').append(section);
}
render();

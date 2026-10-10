import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Original game data, mirrored by the OpenSupaplex project. Pinned by commit and checksum.
const SOURCE = 'https://raw.githubusercontent.com/sergiou87/open-supaplex/bad56a4e174e628643995284ea55d4c49af3137c/resources/';
const CACHE = new URL('../.cache/', import.meta.url);
const FILES = {
  'FIXED.DAT': 'ba9781a4809690b86248cf08f18e953ae6ec6bcc487f33d21fbca28f0ba845d4',
  'MOVING.DAT': '959b3ea9366421d9404a357abb1e8410959e02fade6b8a853350c0aa35b5b679',
  'PALETTES.DAT': 'ce4eb1f9d70cd667c65651b69aa7e18493ae41f80ef0a41f0fc639003394a94c',
  'PANEL.DAT': 'c235f859e68f8b56780e082b2c0a1a65b281584ab5b5fc3c363a711a0c351a8f',
  'CHARS6.DAT': 'e2a68424f31b21b38ce3ff4ed3a16f993878bd5411c9298f8ab199c44c3cbb74',
  'CHARS8.DAT': '80f48aad089f42dab793802bddf5cbbf46eebd12923e6600cb5ab30e5e0bf997',
  'TITLE.DAT': 'a389ea7af181d55d8080406c9d3a24b72b7ffb9c109e13134b58e85dea94f476',
  'TITLE1.DAT': 'f0399b52cc39b1afc38987fcf81699ba07dcc8370d100bc17fe216c50f9e45a1',
  'TITLE2.DAT': 'ecfa231090b10fcbf5d1ad2e51365d80daae38b154d1575b4ff6b833ea1b2689',
  'MENU.DAT': '1c74bbaf8a99be83dba16b26440c9bba5ffc3190af3abb205753394c4e9b9002',
  'CONTROLS.DAT': 'ece4bfb377f834d3c9cadb609065f277dcc9f2bbfa5df1697395b77cb497f46e',
  'BACK.DAT': '200b1118e798b50aa36962467d214ba595475118c82affe447f132cd90db72ef',
  'GFX.DAT': '2eaf2f24f4a269d3b81307ec60cd1da6b9751f12d3c39396ecfc66d70d790cdc',
  'LEVELS.DAT': 'f41f3ad35b3eca845baceb1e11db61f185b45b38deefb39f67ef6c3dfc33fbb0',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export async function loadAsset(name) {
  const expected = FILES[name];
  if (!expected) throw new Error(`Unknown asset ${name}`);
  const path = new URL(name, CACHE);
  const cached = await readFile(path).catch(() => null);
  if (cached && sha256(cached) === expected) return cached;

  const res = await fetch(SOURCE + name);
  if (!res.ok) throw new Error(`Fetching ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== expected) throw new Error(`Checksum mismatch for ${name}`);
  await mkdir(CACHE, { recursive: true });
  await writeFile(path, buf);
  return buf;
}

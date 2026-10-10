import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Original game data, mirrored by the OpenSupaplex project. Pinned by commit and checksum.
const SOURCE = 'https://raw.githubusercontent.com/sergiou87/open-supaplex/bad56a4e174e628643995284ea55d4c49af3137c/resources/';
const CACHE = new URL('../.cache/', import.meta.url);
const FILES = {
  'FIXED.DAT': 'ba9781a4809690b86248cf08f18e953ae6ec6bcc487f33d21fbca28f0ba845d4',
  'MOVING.DAT': '959b3ea9366421d9404a357abb1e8410959e02fade6b8a853350c0aa35b5b679',
  'PALETTES.DAT': 'ce4eb1f9d70cd667c65651b69aa7e18493ae41f80ef0a41f0fc639003394a94c',
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

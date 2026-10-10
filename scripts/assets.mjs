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
  'audio/base-adlib.wav': 'ac735b076e038652bffccecafe88f9a07de176ab016c5aa46c15a28e215e8009',
  'audio/base-beep.wav': 'dbdaf5021255817e97b001b5455ea2894bf5300bf0f76eb29e42bf86a80e7aa6',
  'audio/base-blaster.wav': '0c2e083a8d9a67d350e63d8323623c9d7b8f0e1cff44b04ec89020dd97226f81',
  'audio/base-roland.wav': '1e2ee464b037b51fba9636e38da7d4391a3c03e5d2942623cf274c64afc84548',
  'audio/base-sample.wav': '758584d2c89853694f26c6f8c670db61d84ce60057432754a0812e51fe0c3a82',
  'audio/bug-adlib.wav': 'bb5dbf50f02a3cf994314a6685a77730b6bd89905d895b12a874623f678cb097',
  'audio/bug-beep.wav': '4a62698f8701a2d7deb311b00f6ed452ac1fe428a1b73ac132d295a4122410ef',
  'audio/bug-blaster.wav': '3330ff3f31bc8915ae7f735764dded90980bf5adb9ed2b542d5ba1e29c397abf',
  'audio/bug-roland.wav': '8b38f04d449fd1fc4ac99631cd7ff7cc595cfd4028851cd35787208b17ae84c2',
  'audio/bug-sample.wav': '9cfda979639375da81c6570f1200e3788e951f53313865ee606cd80e10931654',
  'audio/exit-adlib.wav': 'e7ddcfa091a0ffb84e218f24200fe3d2dbe60c07a42b173346215eff017c26c5',
  'audio/exit-beep.wav': '80b4664df0da830db422a4fa662004b2e0076d1d5de3440a19b3da6143a9638d',
  'audio/exit-blaster.wav': 'ee6d4c8640e247ac0b885f2d53cc40169973b7dc494412f54f086b9f857abcd5',
  'audio/exit-roland.wav': 'a47b0f6b03d2250751a2a88868bbc942b7660ba9305210c2ef6ff5217ce8ff61',
  'audio/exit-sample.wav': 'e991b74466916591289e323771598353fe9a19e7a4cd1ae43af344579aafeefc',
  'audio/explosion-adlib.wav': 'fbc664b7643d3bdd93279aca6fa81a9be130bb25fa4cd347349b93a694068a02',
  'audio/explosion-beep.wav': '7716cdd49238e2f546fce206e8a6e7172614727daec972285f010cf2053b6c54',
  'audio/explosion-blaster.wav': 'd2961705dbfcd98cd00aac594f9d09cffa829daf4569c5efbb3a7271b9e32cc2',
  'audio/explosion-roland.wav': '88f72c0ab152c63175056d665351e7b03d75718e3b9ea1aa059cab2cdac0a5cd',
  'audio/explosion-sample.wav': 'c3dca1259b7994f8779cfb12fe998e734940289bcab507e3a1e18b2ea6ce4e48',
  'audio/fall-adlib.wav': 'bcff6aab34015bd47410ce5fd323ab21a92d8b75767a2357e81018fdbb9469a5',
  'audio/fall-beep.wav': '8d46fe05b3de0ee8319ddb4c5a1d95ebba48d1bd2de474cd179c4efa705519f1',
  'audio/fall-blaster.wav': 'fa97fbdae2e8c4dee3f25e8f8d9345a32f8025967be9cb2d3fd04063b1aec944',
  'audio/fall-roland.wav': '7347bda32330a5d3c5ab2240d884fceb9cde970c4e975ee47305661b253f04bc',
  'audio/fall-sample.wav': '1cc3a87ca758f4e1a41caf98a4594b361b0ca79da398feabd552901932d3befc',
  'audio/infotron-adlib.wav': '73f470f6e70e00d9351035b663b84047615a37f0671867c9296f47d1161ab053',
  'audio/infotron-beep.wav': '3d44dfcbea094ea315f281ff5b879ea65e2d2513f6d6ac57cacd09b98facf42f',
  'audio/infotron-blaster.wav': '5a92131e24662f5c91e2f752db501062420728da1bf3319edb26b6c094332e1b',
  'audio/infotron-roland.wav': '00defe7e4ada45ff3c7423b501d69a935540f816d8202d74243376deebf0f5ec',
  'audio/infotron-sample.wav': '28ec7eb1af3d52440e0e98b0a980df637131e711ef4891d912ad854590b712da',
  'audio/push-adlib.wav': '04dd2d4ed75cebb884ce2e565023ae55e4ab8274b4122ca8a3000c86899aec59',
  'audio/push-beep.wav': '11199ea58416970dad57dcd71dc16d0b625045d9c2118f401f10bb7b7f3d95ab',
  'audio/push-blaster.wav': 'a0bc0a1f963067ca897b349483512df9314a30d82218289f24a8511ba6cc8ae5',
  'audio/push-roland.wav': 'b77b429a8e79d7e2affb4c5d635bd3367d7b216b19986399700f79a800fdd64e',
  'audio/push-sample.wav': '0f9ed556011abe13a0bb01a74b2fd50b47bee1e9d9af911d13fc907a6e00682b',
  'audio/music-adlib.xm': 'c8fb69efca8900dbf9958feeb72e488c05e6ae6c2fcd341f01fdd0a3265b4eca',
  'audio/music-beep.xm': '8518be5f318b5c2cb8b708ef36084846c8ea346519000b46d3f549994783d10a',
  'audio/music-roland.xm': 'fe65ddd6976c4039a318f30f23df24bb19617c4835851c112360dd3a1ced063c',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const AUDIO = Object.keys(FILES).filter((name) => name.startsWith('audio/'));

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
  await mkdir(new URL('.', path), { recursive: true });
  await writeFile(path, buf);
  return buf;
}

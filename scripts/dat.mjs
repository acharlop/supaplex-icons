// Decoders for the original Supaplex data files.

// 16 colours, 4 bytes each (r, g, b, intensity), 4-bit channels.
const toHex = (data) => Array.from({ length: 16 }, (_, c) =>
  '#' + [0, 1, 2].map((i) => (data[c * 4 + i] * 17).toString(16).padStart(2, '0')).join(''));

// PALETTES.DAT holds four: 0 information screens, 1 game, 2 controls, 3 dimmed game.
export const readPalette = (buf, index = 1) => toHex(buf.subarray(index * 64, index * 64 + 64));

// The title screens' palettes are hardcoded in the executable, not in PALETTES.DAT.
const TITLE_PALETTES = {
  'TITLE.DAT': '020305000d0a040c02060602030909030b0803060207070a08060d0906040b01090100040b0100040d01000c0f01000c0f06040c020506080f0c060e0c0c0d0e',
  'TITLE1.DAT': '000000000f0f0f0f080808080a0a0a070a0a0a070b0b0b070e010104090909070808080808080808090000040b00000c08080808050505080606060808080808',
  'TITLE2.DAT': '000000000f0f0f0f060606080a0a0a070a0a0a070b0b0b070e010104090909070103070008080808090000040b00000c00020a01050505080606060808080807',
};
const PALETTE_INDEX = { 'BACK.DAT': 0, 'CONTROLS.DAT': 2 };
const FONT_PALETTE = ['#000000', '#ffffff'];

// The palette each file is shown with in the game.
export function paletteFor(file, palettesBuf) {
  if (file.startsWith('CHARS')) return FONT_PALETTE;
  if (TITLE_PALETTES[file]) return toHex(Buffer.from(TITLE_PALETTES[file], 'hex'));
  return readPalette(palettesBuf, PALETTE_INDEX[file] ?? 1);
}

// `planes` bitplanes (blue, green, red, intensity), each `planeStride` bytes apart within a row.
function decodePlanar(buf, width, height, rowStride, planeStride, planes = 4) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * rowStride + (x >> 3);
      const bit = 7 - (x & 7);
      let color = 0;
      for (let plane = 0; plane < planes; plane++) color |= ((buf[at + plane * planeStride] >> bit) & 1) << plane;
      pixels[y * width + x] = color;
    }
  }
  return { width, height, pixels };
}

const screen = (buf) => decodePlanar(buf, 320, 200, 160, 40);
// 1bpp, 64 glyphs of 7 rows; glyph i is byte i of each 64-byte row, so the sheet puts glyph i at x = i * 8.
const font = (buf) => decodePlanar(buf, 512, 7, 64, 0, 1);

export const SHEETS = {
  'FIXED.DAT': (buf) => decodePlanar(buf, 640, 16, 320, 80),
  'MOVING.DAT': (buf) => decodePlanar(buf, 320, 462, 160, 40),
  'PANEL.DAT': (buf) => decodePlanar(buf, 320, 24, 160, 40),
  'CHARS6.DAT': font,
  'CHARS8.DAT': font,
  'TITLE.DAT': screen,
  'TITLE1.DAT': screen,
  'TITLE2.DAT': screen,
  'MENU.DAT': screen,
  'CONTROLS.DAT': screen,
  'BACK.DAT': screen,
  'GFX.DAT': screen,
};

// Returns rows of palette indices for one frame.
export function crop(sheet, x, y, w, h) {
  return Array.from({ length: h }, (_, row) =>
    Array.from(sheet.pixels.subarray((y + row) * sheet.width + x, (y + row) * sheet.width + x + w)),
  );
}

// LEVELS.DAT: 111 levels of 1536 bytes; the title is 23 bytes at 1446 and the infotrons needed at 1470, 0 meaning every infotron on the map.
export const readLevels = (buf) => Array.from({ length: buf.length / 1536 }, (_, i) => {
  const level = buf.subarray(i * 1536, (i + 1) * 1536);
  return [level.subarray(1446, 1469).toString('latin1'), level[1470] || level.subarray(0, 1440).filter((t) => t === 4).length];
});

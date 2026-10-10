// Decoders for the original Supaplex data files.

// Game palette (PALETTES.DAT entry 1): 16 colours, 4 bytes each, 4-bit RGB channels.
export function readPalette(buf, index = 1) {
  return Array.from({ length: 16 }, (_, c) => {
    const [r, g, b] = buf.subarray(index * 64 + c * 4, index * 64 + c * 4 + 3);
    return '#' + [r, g, b].map((v) => (v * 17).toString(16).padStart(2, '0')).join('');
  });
}

// 4 bitplanes (blue, green, red, intensity), each `planeStride` bytes apart within a row.
function decodePlanar(buf, width, height, rowStride, planeStride) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * rowStride + (x >> 3);
      const bit = 7 - (x & 7);
      let color = 0;
      for (let plane = 0; plane < 4; plane++) color |= ((buf[at + plane * planeStride] >> bit) & 1) << plane;
      pixels[y * width + x] = color;
    }
  }
  return { width, height, pixels };
}

export const SHEETS = {
  'FIXED.DAT': (buf) => decodePlanar(buf, 640, 16, 320, 80),
  'MOVING.DAT': (buf) => decodePlanar(buf, 320, 462, 160, 40),
};

// Returns rows of palette indices for one frame.
export function crop(sheet, x, y, w, h) {
  return Array.from({ length: h }, (_, row) =>
    Array.from(sheet.pixels.subarray((y + row) * sheet.width + x, (y + row) * sheet.width + x + w)),
  );
}

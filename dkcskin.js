// Repaint Donkey Kong Country Kong animation frames with another character's art, in place.
// DKC Kong frames are uncompressed: an 8-byte header, one (x, y) byte pair per character, then 4bpp
// tiles. hdr[0] = 16x16 characters, hdr[1] = 8x8 characters on the top VRAM row, hdr[3] = 8x8 on the
// bottom row. Tile data = row 0 (two top tiles per 16x16 char, then the top-row 8x8s) followed by
// row 1 (two bottom tiles per 16x16 char, then the bottom-row 8x8s). Positions are relative to
// $80,$80 = the Kong's feet. Only existing pixels' tiles are rewritten, so frame sizes and
// pointers never change. Works in Node and the browser.

export const hiromOffset = a => { const b = a >> 16, o = a & 0xFFFF;
  if (b >= 0xC0) return (b - 0xC0) * 0x10000 + o;
  if ((b & 0x7F) < 0x40 && o >= 0x8000) return (b & 0x3F) * 0x10000 + o;
  return -1; };

// Find the frame header in front of a frame's tile data (the address the game DMAs from).
export function findHeader(rom, tileOff) {
  for (let n = 1; n <= 40; n++) {
    const h = tileOff - (8 + 2 * n);
    if (h < 0) break;
    const n16 = rom[h], n8a = rom[h + 1], n8b = rom[h + 3];
    if (n16 + n8a + n8b === n && n16 <= 16 && n8a <= 24 && n8b <= 24) return h;
  }
  return -1;
}

export function parseFrame(rom, h) {
  const n16 = rom[h], n8a = rom[h + 1], n8b = rom[h + 3];
  const chars = [];
  let p = h + 8;
  for (let i = 0; i < n16 + n8a + n8b; i++, p += 2) chars.push({ x: rom[p] - 0x80, y: rom[p + 1] - 0x80, size: i < n16 ? 16 : 8 });
  const tiles = p, row1 = tiles + (2 * n16 + n8a) * 32;
  // file offset of each 8x8 tile, per character, in (tx, ty) order
  chars.forEach((c, i) => {
    if (i < n16) c.tiles = [[0, 0, tiles + i * 64], [8, 0, tiles + i * 64 + 32], [0, 8, row1 + i * 64], [8, 8, row1 + i * 64 + 32]];
    else if (i < n16 + n8a) c.tiles = [[0, 0, tiles + (2 * n16 + (i - n16)) * 32]];
    else c.tiles = [[0, 0, row1 + (2 * n16 + (i - n16 - n8a)) * 32]];
  });
  return { n16, n8a, n8b, chars };
}

const getPix = (rom, t, px, py) => { const s = 7 - px;
  return ((rom[t + py * 2] >> s) & 1) | (((rom[t + py * 2 + 1] >> s) & 1) << 1) | (((rom[t + 16 + py * 2] >> s) & 1) << 2) | (((rom[t + 16 + py * 2 + 1] >> s) & 1) << 3); };
const setPix = (rom, t, px, py, c) => { const m = 1 << (7 - px);
  const set = (o, bit) => { rom[o] = bit ? rom[o] | m : rom[o] & ~m; };
  set(t + py * 2, c & 1); set(t + py * 2 + 1, c & 2); set(t + 16 + py * 2, c & 4); set(t + 16 + py * 2 + 1, c & 8); };

// Bounding box of the frame's visible pixels, relative to the feet.
export function frameBounds(rom, frame) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of frame.chars) for (const [tx, ty, t] of c.tiles) for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++)
    if (getPix(rom, t, px, py)) { const X = c.x + tx + px, Y = c.y + ty + py; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
  return { x0, y0, x1, y1 };
}

// Paint an indexed image into a frame. img = { w, h, data } with its feet at the bottom centre.
// The art is scaled to the frame's original height so it fits the Kong's hit box and tile layout.
export function paintFrame(rom, frame, img) {
  const b = frameBounds(rom, frame);
  if (b.x0 > b.x1) return;
  const targetH = b.y1 - b.y0 + 1;
  const scale = img.h / targetH;
  const feetX = (b.x0 + b.x1) / 2;
  // every tile in the frame's layout gets fully redrawn (pixels outside the art become transparent)
  for (const c of frame.chars) for (const [tx, ty, t] of c.tiles) for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
    const X = c.x + tx + px, Y = c.y + ty + py;
    const sx = Math.floor((X - feetX) * scale + img.w / 2), sy = Math.floor((Y - b.y1) * scale + img.h - 1);
    const col = (sx >= 0 && sx < img.w && sy >= 0 && sy < img.h) ? img.data[sy * img.w + sx] : 0;
    setPix(rom, t, px, py, col);
  }
}

// Write a 15-colour palette (SNES BGR555 words for colours 1..15) over every copy of the old one.
export function replacePalette(rom, oldPalOffsets, colours) {
  for (const o of oldPalOffsets) for (let i = 1; i < 16; i++) { rom[o + i * 2] = colours[i] & 0xFF; rom[o + i * 2 + 1] = colours[i] >> 8; }
}

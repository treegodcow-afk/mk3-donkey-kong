// Mario's sprites straight from the player's Super Mario World ROM. Works in Node and the browser.
// SMW keeps Mario's tiles compressed (GFX32 at $08:BFC0) and unpacks them at boot with $00:B888 into
// WRAM $7E:2000; each frame two 16x16 tiles (head, body) are DMA'd from addresses in that buffer
// (top halves; the bottom halves are $200 further on). We run the unpacker in a small 65816
// interpreter, then a pose is just (head address, body address). Recipes hold only addresses.
import { CPU65816 } from "./cpu65816.js";

export const SMW = { sha1: "6b47bb75d16514b6a476aa0c73a683a2a4c18765", unpack: 0x00B888, buffer: 0x2000 };

const romOffset = (rom, a) => { const b = (a >> 16) & 0x7F, o = a & 0xFFFF; if (o < 0x8000) return -1; return ((b & 0x3F) * 0x8000 + o - 0x8000) % rom.length; };
function makeBus(rom, ram) {
  return {
    read(a) { const b = a >> 16, o = a & 0xFFFF;
      if (b === 0x7E || b === 0x7F) return ram[(b - 0x7E) * 0x10000 + o];
      if ((b & 0x7F) < 0x40 && o < 0x2000) return ram[o];
      if ((b & 0x7F) < 0x40 && o < 0x8000) return 0;
      const r = romOffset(rom, a); return r >= 0 ? rom[r] : 0; },
    write(a, v) { const b = a >> 16, o = a & 0xFFFF;
      if (b === 0x7E || b === 0x7F) ram[(b - 0x7E) * 0x10000 + o] = v;
      else if ((b & 0x7F) < 0x40 && o < 0x2000) ram[o] = v; },
  };
}
let cache = null;
export function marioBuffer(rom) {
  if (cache && cache.rom === rom) return cache.ram;
  const ram = new Uint8Array(0x20000), cpu = new CPU65816(makeBus(rom, ram));
  Object.assign(cpu, { A: 0, X: 0, Y: 0, P: 0x30, S: 0x1F0, DB: 0x00, D: 0, E: 0 });
  cpu.call(0x00, 0xB888, { long: false });
  cache = { rom, ram }; return ram;
}
function tile16(ram, top, out, ox, oy, stride) {   // 16x16 from a top-half address (bottom half at +$200)
  for (let half = 0; half < 2; half++) for (let tx = 0; tx < 2; tx++) {
    const base = top + half * 0x200 + tx * 32;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const s = 7 - x;
      const v = ((ram[base + y * 2] >> s) & 1) | (((ram[base + y * 2 + 1] >> s) & 1) << 1) | (((ram[base + 16 + y * 2] >> s) & 1) << 2) | (((ram[base + 16 + y * 2 + 1] >> s) & 1) << 3);
      out[(oy + half * 8 + y) * stride + ox + tx * 8 + x] = v; }
  }
}
// A pose: [head, body] buffer addresses (or { head, body, dy, extra: [addr, dx, dy] }). SMW draws Mario
// facing left; this returns him facing right, feet at the bottom centre.
export function smwPose(rom, id) {
  if (id.tile !== undefined) {   // one 8x8 tile of a sprite graphics file, e.g. the fireball { file: 0, tile: 0x2C, flip: "h" }
    const px = tile3(smwFile(rom, id.file || 0), id.tile), data = new Uint8Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const sx = (id.flip || "").includes("h") ? 7 - x : x, sy = (id.flip || "").includes("v") ? 7 - y : y; data[y * 8 + x] = px[sy * 8 + sx]; }
    return { w: 8, h: 8, data, fx: 4, fy: 8 };
  }
  const ram = marioBuffer(rom), p = Array.isArray(id) ? { head: id[0], body: id[1] } : id;
  const w = 16, h = 32, data = new Uint8Array(w * h), tmp = new Uint8Array(w * h);
  tile16(ram, p.head, tmp, 0, 0, w); tile16(ram, p.body, tmp, 0, 16, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = tmp[y * w + (w - 1 - x)];
  let x0 = w, x1 = 0, y0 = h, y1 = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const W = x1 - x0 + 1, H = y1 - y0 + 1, out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = data[(y + y0) * w + x + x0];
  return { w: W, h: H, data: out, fx: 8 - x0, fy: H };
}

// Any of SMW's compressed graphics files (pointer tables $00:B992/$B9C4/$B9F6) unpacked with its own
// decompressor ($00:B8DE: source [$8A], destination [$00]). Sprite files are 3bpp (24 bytes a tile).
const files = new Map();
export function smwFile(rom, n) {
  const key = n; if (files.has(key) && files.get(key).rom === rom) return files.get(key).data;
  const data = unpackFile(rom, n); files.set(key, { rom, data }); return data;
}
function unpackFile(rom, n) {
  const at = t => rom[romOffset(rom, t + n)], src = (at(0x00B9F6) << 16) | (at(0x00B9C4) << 8) | at(0x00B992);
  const ram = new Uint8Array(0x20000), cpu = new CPU65816(makeBus(rom, ram));
  ram[0x8A] = src & 0xFF; ram[0x8B] = (src >> 8) & 0xFF; ram[0x8C] = src >> 16; ram[0x00] = 0x00; ram[0x01] = 0x00; ram[0x02] = 0x7F;
  Object.assign(cpu, { A: 0, X: 0, Y: 0, P: 0x30, S: 0x1F0, DB: 0x00, D: 0, E: 0 });
  cpu.call(0x00, 0xB8DE, { long: false });
  return ram.slice(0x10000, 0x18000);
}
// A 3bpp tile of a sprite file as 4bpp-style pixel values (8x8).
export function tile3(file, t) {
  const px = new Uint8Array(64), b = t * 24;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const s = 7 - x;
    px[y * 8 + x] = ((file[b + y * 2] >> s) & 1) | (((file[b + y * 2 + 1] >> s) & 1) << 1) | (((file[b + 16 + y] >> s) & 1) << 2); }
  return px;
}

// A 16-colour palette (32 bytes) from parts: a number is one colour word, [offset, count] copies colours.
export function smwPalette(rom, parts) {
  const out = new Uint8Array(32); let i = 1;
  for (const p of parts) {
    if (typeof p === "number") { out[i * 2] = p & 0xFF; out[i * 2 + 1] = p >> 8; i++; }
    else for (let k = 0; k < p[1]; k++, i++) { out[i * 2] = rom[p[0] + k * 2]; out[i * 2 + 1] = rom[p[0] + k * 2 + 1]; }
  }
  return out;
}

// Render Mortal Kombat 3 fighter frames straight from the player's ROM by running the game's own
// frame builder (sub_C28000 at $82:8000) in a small 65816 interpreter. Works in Node and the browser.
// A "recipe" names the ROM addresses involved (pointers only, no game data):
//   { tileTable, aux62, aux66, frames: { name: [frameAddr24, ...] }, palette: paletteAddr24 }
import { CPU65816 } from "./cpu65816.js";

const romOffset = a => { const b = a >> 16, o = a & 0xFFFF;
  if (b >= 0xC0) return (b - 0xC0) * 0x10000 + o;
  if (b >= 0x40 && b < 0x7E) return (b - 0x40) * 0x10000 + o;
  if ((b & 0x7F) < 0x40 && o >= 0x8000) return (b & 0x3F) * 0x10000 + o;
  return -1; };

export function makeBus(rom, ram) {
  let wmadd = 0, m7a = 0, m7latch = 0, m7b = 0, mpya = 0, mpy = 0;
  const prod = () => m7a * ((m7b << 24) >> 24);
  return {
    read(a) {
      const b = a >> 16, o = a & 0xFFFF;
      if (b === 0x7E || b === 0x7F) return ram[(b - 0x7E) * 0x10000 + o];
      if ((b & 0x7F) < 0x40 && o < 0x2000) return ram[o];
      if ((b & 0x7F) < 0x40 && o >= 0x2100 && o < 0x6000) {
        if (o === 0x2134) return prod() & 0xFF; if (o === 0x2135) return (prod() >> 8) & 0xFF; if (o === 0x2136) return (prod() >> 16) & 0xFF;
        if (o === 0x2180) return ram[(wmadd++) & 0x1FFFF];
        if (o === 0x4216) return mpy & 0xFF; if (o === 0x4217) return (mpy >> 8) & 0xFF;
        return 0;
      }
      const r = romOffset(a); return r >= 0 && r < rom.length ? rom[r] : 0;
    },
    write(a, v) {
      const b = a >> 16, o = a & 0xFFFF;
      if (b === 0x7E || b === 0x7F) { ram[(b - 0x7E) * 0x10000 + o] = v; return; }
      if ((b & 0x7F) < 0x40 && o < 0x2000) { ram[o] = v; return; }
      if ((b & 0x7F) < 0x40) {
        if (o === 0x211B) { m7a = (((v << 8) | m7latch) << 16) >> 16; m7latch = v; }
        else if (o === 0x211C) m7b = v;
        else if (o === 0x2180) ram[(wmadd++) & 0x1FFFF] = v;
        else if (o === 0x2181) wmadd = (wmadd & 0x1FF00) | v;
        else if (o === 0x2182) wmadd = (wmadd & 0x100FF) | (v << 8);
        else if (o === 0x2183) wmadd = (wmadd & 0x0FFFF) | ((v & 1) << 16);
        else if (o === 0x4202) mpya = v; else if (o === 0x4203) mpy = mpya * v;
      }
    },
  };
}

const w16 = (ram, a) => ram[a] | (ram[a + 1] << 8);
const put16 = (ram, a, v) => { ram[a] = v & 0xFF; ram[a + 1] = (v >> 8) & 0xFF; };
const put24 = (ram, a, v) => { put16(ram, a, v & 0xFFFF); ram[a + 2] = (v >> 16) & 0xFF; };

// Returns { pieces:[{x,y,big,hflip,vflip,pixels:Uint8Array(size*size) of colour indices}], bounds }
export function buildFrame(rom, recipe, frameAddr) {
  const ram = new Uint8Array(0x20000);
  const D = 0x1800, obj = 0;
  put16(ram, D + 0x94, obj);
  put24(ram, D + 0x5E, recipe.tileTable);
  put24(ram, D + 0x62, recipe.aux62);
  put24(ram, D + 0x66, recipe.aux66);
  put16(ram, D + 0x26, 0x3600); put16(ram, D + 0x2A, 0x00CB); put16(ram, D + 0x46, 0);
  put16(ram, 0x248A + obj, frameAddr & 0xFFFF); put16(ram, 0x24A2 + obj, (frameAddr >> 16) & 0xFF);
  const cpu = new CPU65816(makeBus(rom, ram));
  Object.assign(cpu, { A: 0, X: 0, Y: 0, P: 0x00, S: 0x1FF0, DB: 0x7E, D, E: 0 });
  cpu.call(0x82, 0x8000, { long: true });
  // piece list written by the builder
  const listBase = ((w16(ram, 0x1AB2 + obj) ^ 0x14F4) + (rom[romOffset(0x85A3C8 + obj)] | rom[romOffset(0x85A3C8 + obj) + 1] << 8)) & 0xFFFF;
  const head = w16(ram, listBase), n16 = head >> 8, n8 = head & 0xFF;
  const tile = (name, out, ox, oy, stride) => {
    const base = 0x7FB6 + name * 32;
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
      const b0 = ram[base + py * 2], b1 = ram[base + py * 2 + 1], b2 = ram[base + 16 + py * 2], b3 = ram[base + 16 + py * 2 + 1], s = 7 - px;
      out[(oy + py) * stride + ox + px] = ((b0 >> s) & 1) | (((b1 >> s) & 1) << 1) | (((b2 >> s) & 1) << 2) | (((b3 >> s) & 1) << 3);
    }
  };
  const pieces = [];
  for (let i = 0; i < n16 + n8; i++) {
    const e = listBase + 2 + i * 6;
    const x = (w16(ram, e) << 16) >> 16, y = (w16(ram, e + 2) << 16) >> 16, attr = w16(ram, e + 4);
    const big = i < n16, size = big ? 16 : 8, name = attr & 0x1FF;
    const px = new Uint8Array(size * size);
    if (big) { tile(name, px, 0, 0, 16); tile(name + 1, px, 8, 0, 16); tile(name + 16, px, 0, 8, 16); tile(name + 17, px, 8, 8, 16); }
    else tile(name, px, 0, 0, 8);
    pieces.push({ x, y, size, hflip: !!(attr & 0x4000), vflip: !!(attr & 0x8000), pixels: px });
  }
  return { pieces, steps: cpu.steps, listBase, n16, n8 };
}

// Composite pieces into an indexed image (0 = transparent). Returns { w, h, ox, oy, data }.
export function compose(frame) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of frame.pieces) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.size); y1 = Math.max(y1, p.y + p.size); }
  const w = x1 - x0, h = y1 - y0, data = new Uint8Array(Math.max(0, w * h));
  for (const p of frame.pieces) for (let yy = 0; yy < p.size; yy++) for (let xx = 0; xx < p.size; xx++) {
    const c = p.pixels[yy * p.size + xx]; if (!c) continue;
    const sx = p.hflip ? p.size - 1 - xx : xx, sy = p.vflip ? p.size - 1 - yy : yy;
    data[(p.y - y0 + sy) * w + (p.x - x0 + sx)] = c;
  }
  return { w, h, ox: x0, oy: y0, data };
}

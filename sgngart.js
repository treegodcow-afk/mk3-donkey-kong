// Arthur's sprites straight from the player's Super Ghouls 'N Ghosts ROM. Works in Node and the browser.
// The game expands its compact sprite maps into WRAM at boot (sub_058000); we run that routine in a
// small 65816 interpreter, then pair each map with the tile block the game DMAs for that frame.
// Recipes hold only addresses and frame numbers, no game data.
import { CPU65816 } from "./cpu65816.js";

export const SGNG = {
  sha1: "f12280b13eea88ca03d700b75cf3c13a0e13f3bc",
  expand: 0x058000,       // map expander (stage index at $028D)
  tables: { steel: 0x00EE66, boxers: 0x00ED70 },   // per-armour tile-frame tables (word ptrs, bank 0)
};

const romOffset = (rom, a) => { const b = a >> 16 & 0x7F, o = a & 0xFFFF;
  if (b < 0x40 && o < 0x8000) return -1;
  return ((b & 0x3F) * 0x8000 + (o & 0x7FFF)) % rom.length; };

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

// WRAM after the game's map expander has run for stage 0.
export function expandMaps(rom) {
  const ram = new Uint8Array(0x20000);
  const cpu = new CPU65816(makeBus(rom, ram));
  Object.assign(cpu, { A: 0, X: 0, Y: 0, P: 0x30, S: 0x1F0, DB: 0x00, D: 0, E: 0 });
  cpu.call(0x05, 0x8000, { long: true });
  return ram;
}

const w16 = (a, o) => a[o] | a[o + 1] << 8;
const s16 = v => (v << 16) >> 16;

// The tile block the game DMAs for tile frame `frame` of an armour table: VRAM words $6000-$7FFF.
export function frameVram(rom, table, frame) {
  const vram = new Uint8Array(0x4000);
  let rec = 0x000000 | w16(rom, romOffset(rom, table) + frame * 2), v = 0x6000;
  for (let guard = 0; guard < 8; guard++) {
    const r = romOffset(rom, rec);
    const src = w16(rom, r) | rom[r + 2] << 16, size = w16(rom, r + 3);
    const s = romOffset(rom, src);
    for (let i = 0; i < size; i++) vram[(v - 0x6000) * 2 + i] = rom[s + i];
    if (rom[r + 5] === 0xFF) break;
    v = (v + w16(rom, r + 5)) & 0xFFFF; rec += 7;
  }
  return vram;
}

// One pose = tile frame + map. Returns { pieces:[{x,y,size,hflip,vflip,pal,pixels}] } with x/y
// relative to Arthur's origin (his feet), facing right.
export function pose(rom, ram, table, frame, mapPtr) {
  const vram = frameVram(rom, table, frame);
  const n = w16(ram, mapPtr), pieces = [];
  const tile = (name, out, ox, oy, stride) => {
    const base = (name & 0x1FF) * 32;
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
      const b0 = vram[base + py * 2], b1 = vram[base + py * 2 + 1], b2 = vram[base + 16 + py * 2], b3 = vram[base + 16 + py * 2 + 1], s = 7 - px;
      out[(oy + py) * stride + ox + px] = ((b0 >> s) & 1) | (((b1 >> s) & 1) << 1) | (((b2 >> s) & 1) << 2) | (((b3 >> s) & 1) << 3);
    }
  };
  for (let i = 0; i < n; i++) {
    const e = mapPtr + 2 + i * 8;
    const x = s16(w16(ram, e)), y = s16(w16(ram, e + 4)), t = w16(ram, e + 6);
    const size = t & 0x2000 ? 16 : 8, name = t & 0xFF;
    const pixels = new Uint8Array(size * size);
    for (let ty = 0; ty < size / 8; ty++) for (let tx = 0; tx < size / 8; tx++) tile(name + tx + ty * 16, pixels, tx * 8, ty * 8, size);
    pieces.push({ x, y, size, hflip: !!(t & 0x4000), vflip: !!(t & 0x8000), pal: (t >> 9) & 7, pixels });
  }
  return { pieces };
}

// Flatten a pose to a w x h index image with the origin at (ox, oy).
export function poseImage(p) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of p.pieces) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.size); y1 = Math.max(y1, q.y + q.size); }
  const w = x1 - x0, h = y1 - y0, img = new Uint8Array(w * h);
  for (const q of [...p.pieces].reverse()) for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) {
    const c = q.pixels[(q.vflip ? q.size - 1 - y : y) * q.size + (q.hflip ? q.size - 1 - x : x)]; if (!c) continue;
    img[(q.y - y0 + y) * w + q.x - x0 + x] = c;
  }
  return { w, h, ox: -x0, oy: -y0, img };
}

// A pose for another game's builder: indexed image with the feet at (fx, fy) = origin column, bottom row.
//   id: [frame, map] (steel armour), [frame, map, table],
//       { tiles: fileOffset, w: tilesAcross, h: tilesDown, rotate } (a block of tiles; rotate = turned to point up),
//       or { base: id, add: id, dx, dy } (two poses combined, add's top-left at dx/dy from base's feet)
let cache = null;
export function sgngPose(rom, id) {
  if (id.base) {
    const b = sgngPose(rom, id.base), a = sgngPose(rom, id.add);
    const ax = b.fx + id.dx, ay = b.fy + id.dy;
    const x0 = Math.min(0, ax), y0 = Math.min(0, ay), x1 = Math.max(b.w, ax + a.w), y1 = Math.max(b.h, ay + a.h);
    const w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const v = a.data[y * a.w + x]; if (v) data[(ay - y0 + y) * w + ax - x0 + x] = v; }
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v = b.data[y * b.w + x]; if (v) data[(y - y0) * w + x - x0] = v; }
    return { w, h, data, fx: b.fx - x0, fy: b.fy - y0 };
  }
  if (!Array.isArray(id) && id.rotate) {   // turned a quarter left: what pointed right points up
    const r = sgngPose(rom, { ...id, rotate: false }), data = new Uint8Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) data[(r.w - 1 - x) * r.h + y] = r.data[y * r.w + x];
    return { w: r.h, h: r.w, data, fx: r.h / 2, fy: r.w };
  }
  if (!Array.isArray(id)) {   // raw 4bpp tiles laid out in a row-major block (e.g. the lance)
    const w = id.w * 8, h = id.h * 8, data = new Uint8Array(w * h);
    for (let ty = 0; ty < id.h; ty++) for (let tx = 0; tx < id.w; tx++) { const t = id.tiles + (ty * id.w + tx) * 32;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const s = 7 - x;
        data[(ty * 8 + y) * w + tx * 8 + x] = ((rom[t + y * 2] >> s) & 1) | (((rom[t + y * 2 + 1] >> s) & 1) << 1) | (((rom[t + 16 + y * 2] >> s) & 1) << 2) | (((rom[t + 16 + y * 2 + 1] >> s) & 1) << 3); } }
    return { w, h, data, fx: w / 2, fy: h };
  }
  if (!cache || cache.rom !== rom) cache = { rom, ram: expandMaps(rom) };
  const [frame, map, table = SGNG.tables.steel] = id;
  const im = poseImage(pose(rom, cache.ram, table, frame, map));
  return { w: im.w, h: im.h, data: im.img, fx: im.ox, fy: im.h };
}

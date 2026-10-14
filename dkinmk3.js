// Build a Mortal Kombat 3 ROM where one fighter (Sub-Zero) is drawn as Donkey Kong.
// Both ROMs come from the player; the recipe holds only addresses and frame numbers.
//
// How it works: MK3 looks up a fighter's graphics through a small descriptor (frame table, tile
// table, ...). The ROM is expanded to 8 MB (ExHiROM; the first 4 MB stay where they were and
// banks $00-$3F keep their code). DK's poses, scaled up and cut into 16x16 pieces, go into the
// new space as uncompressed tiles, with a new frame stream for every Sub-Zero frame number and a
// copy of the descriptor that points at them. Sub-Zero's moves, timing and hit boxes are unchanged.
import { buildFrame, compose } from "./mk3frames.js";
import { hiromOffset, parseFrame } from "./dkcskin.js";

export const DK_RECIPE = {
  dkc: {
    frameTable: 0x3BCC9C,          // file offset; 4 bytes per frame id (addr16, bank, y)
    palette: 0x39B783,             // file offset of DK's sprite palette (colour 0)
    poses: {
      stand:  [0xBC, 0xC0, 0xC4, 0xC8, 0xCC, 0xD0, 0xD4, 0xD8],
      walk:   [0xE0, 0xE8, 0xF0, 0xF8, 0x100, 0x108, 0x110, 0x118, 0x120, 0x128],
      jump:   [0x130, 0x138, 0x140, 0x148, 0x150, 0x158],
      roll:   [0x4B8, 0x4C0, 0x4C8, 0x4D0, 0x4D8, 0x4E0],
      crouch: [0x4EC, 0x5D4],
      attack: [0x614, 0x770, 0x774, 0x778],
      hurt:   [0x40C, 0x410, 0x414, 0x418],
      down:   [0x38C, 0x390],
    },
  },
  mk3: {
    descBanks: 0x85ABAA, descAddrs: 0x85ABDE, setId: 8,   // Sub-Zero's graphics set
    tileTable: 0xFFCDA5, tileEntries: 45, aux62: 0xFFF7C0, aux66: 0xFFF7CF,
    frames: 0xFEFC6A, banks: 0xFEFE64, count: 253,
    palette: 0x3FB07F,             // file offset of Sub-Zero's palette (colour 0)
    ground: 43,                    // feet line in frame coordinates
    maxPieces: 24,                 // 16x16 pieces that fit the fighter's VRAM area
  },
};

const off = a => { const b = a >> 16, o = a & 0xFFFF;
  if (b >= 0xC0) return (b - 0xC0) * 0x10000 + o;
  if (b >= 0x80 && o >= 0x8000) return (b - 0x80) * 0x10000 + o;
  return -1; };
// expansion space: banks $40-$7D, $0000-$7FFF -> file 0x400000 + (bank-0x40)*0x10000 + addr
const exOff = (bank, addr) => 0x400000 + (bank - 0x40) * 0x10000 + addr;

// DK pose as an indexed image with the feet at (fx, fy).
function dkPose(dkc, frameTable, id) {
  const o = frameTable + id, h = hiromOffset((dkc[o + 2] << 16) | dkc[o] | (dkc[o + 1] << 8));
  const f = parseFrame(dkc, h);
  const get = (t, px, py) => { const s = 7 - px;
    return ((dkc[t + py * 2] >> s) & 1) | (((dkc[t + py * 2 + 1] >> s) & 1) << 1) | (((dkc[t + 16 + py * 2] >> s) & 1) << 2) | (((dkc[t + 16 + py * 2 + 1] >> s) & 1) << 3); };
  const px = [];
  for (const c of f.chars) for (const [tx, ty, t] of c.tiles) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = get(t, x, y); if (v) px.push([c.x + tx + x, c.y + ty + y, v]);
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of px) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, hgt = y1 - y0 + 1, data = new Uint8Array(w * hgt);
  for (const [x, y, v] of px) data[(y - y0) * w + (x - x0)] = v;
  return { w, h: hgt, data, fx: (x0 + x1) / 2 - x0, fy: hgt };    // feet: bottom centre
}

function scaled(img, s) {
  const w = Math.max(1, Math.round(img.w * s)), h = Math.max(1, Math.round(img.h * s)), data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = img.data[Math.min(img.h - 1, Math.floor(y / s)) * img.w + Math.min(img.w - 1, Math.floor(x / s))];
  return { w, h, data, fx: Math.round(img.fx * s), fy: h };
}

// 16x16 cells of an image, aligned so the feet sit on a cell corner; empty cells dropped.
function cells(img) {
  const gx = -Math.ceil(img.fx / 16) * 16, gy = -Math.ceil(img.fy / 16) * 16, out = [];
  for (let cy = gy; cy < img.h - img.fy; cy += 16) for (let cx = gx; cx < img.w - img.fx; cx += 16) {
    const px = new Uint8Array(256); let any = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ix = cx + x + img.fx, iy = cy + y + img.fy;
      if (ix >= 0 && ix < img.w && iy >= 0 && iy < img.h) { const v = img.data[iy * img.w + ix]; px[y * 16 + x] = v; if (v) any = true; }
    }
    if (any) out.push({ x: cx, y: cy, px });
  }
  return out;
}

function tileBytes(px, ox, oy) {                       // 8x8 of a 16x16 cell -> SNES 4bpp
  const t = new Uint8Array(32);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = px[(oy + y) * 16 + ox + x], m = 1 << (7 - x);
    if (v & 1) t[y * 2] |= m; if (v & 2) t[y * 2 + 1] |= m; if (v & 4) t[16 + y * 2] |= m; if (v & 8) t[16 + y * 2 + 1] |= m;
  }
  return t;
}

// Which DK pose a Sub-Zero frame becomes, from its outline.
function category(b, ground) {
  const bottom = b.oy + b.h;
  if (b.tiles < 12 || b.w * b.h < 1500) return null;            // projectiles, effects: keep
  if (bottom < ground - 18) return b.w > b.h * 0.9 ? "roll" : "jump";
  if (b.w > b.h * 1.4) return "down";
  if (b.h < 76) return "crouch";
  if (b.w > 54) return "attack";
  return "stand";
}

// Length of an original frame stream (to copy it unchanged).
function streamLength(mk3, addr) {
  const p0 = off(addr); let p = p0 + 2;
  const total = mk3[p0], n16 = mk3[p0 + 1];
  for (let i = 0; i < total; i++) {
    const c = mk3[p++]; if (!(c & 0xF0)) p++; if (!(c & 0x0F)) p++;
    p += i < n16 ? 8 : 2;
  }
  return p - p0;
}

export function expandExHiROM(rom) {
  const ex = new Uint8Array(0x800000);
  ex.set(rom.subarray(0, 0x400000), 0);
  for (let b = 0; b < 0x40; b++) ex.set(rom.subarray(b * 0x10000 + 0x8000, b * 0x10000 + 0x10000), 0x400000 + b * 0x10000 + 0x8000);
  ex[0x40FFD5] = 0x35; ex[0x40FFD7] = 0x0D;
  return ex;
}

export function fixChecksum(rom) {
  for (const c of [0xFFDC, 0x40FFDC]) { rom[c] = 0xFF; rom[c + 1] = 0xFF; rom[c + 2] = 0; rom[c + 3] = 0; }
  let s = 0; for (let i = 0; i < rom.length; i++) s = (s + rom[i]) & 0xFFFF;
  for (const c of [0xFFDC, 0x40FFDC]) { rom[c] = (s ^ 0xFFFF) & 0xFF; rom[c + 1] = (s ^ 0xFFFF) >> 8; rom[c + 2] = s & 0xFF; rom[c + 3] = s >> 8; }
}

// Returns a new 8 MB ROM. stats: { replaced, kept, poses, tiles, scale }
export function buildDkMk3(mk3Rom, dkcRom, recipe = DK_RECIPE) {
  const M = recipe.mk3, D = recipe.dkc;
  const rom = expandExHiROM(mk3Rom);

  // DK poses at one scale that fits every pose in the VRAM budget
  const base = {}; for (const [cat, ids] of Object.entries(D.poses)) base[cat] = ids.map(id => dkPose(dkcRom, D.frameTable, id));
  let scale = 2.2, poses;
  for (; scale > 1; scale -= 0.05) {
    poses = {}; let worst = 0;
    for (const [cat, list] of Object.entries(base)) poses[cat] = list.map(p => { const c = cells(scaled(p, scale)); worst = Math.max(worst, c.length); return c; });
    if (worst <= M.maxPieces) break;
  }

  // tiles: deduplicated, 256 per table entry, entries after Sub-Zero's own
  const tiles = [], tileIndex = new Map();
  const tileWord = t => { const k = t.join(","); let i = tileIndex.get(k); if (i === undefined) { i = tiles.length; tiles.push(t); tileIndex.set(k, i); }
    return (((i & 0xFF) << 8) | ((M.tileEntries + (i >> 8)) * 4)); };
  const poseWords = {};
  for (const [cat, list] of Object.entries(poses)) poseWords[cat] = list.map(cs => cs.map(c => ({ x: c.x, y: c.y,
    w: [tileWord(tileBytes(c.px, 0, 0)), tileWord(tileBytes(c.px, 8, 0)), tileWord(tileBytes(c.px, 0, 8)), tileWord(tileBytes(c.px, 8, 8))] })));
  const entries = Math.ceil(tiles.length / 256);
  if (M.tileEntries + entries > 64) throw new Error("too many DK tiles");

  // layout of the new space: bank $40 = descriptor + tables, $41.. = tile blocks (4 per bank), then streams
  let bank = 0x41, slot = 0;
  const table = new Uint8Array(256);
  table.set(rom.subarray(off(M.tileTable), off(M.tileTable) + M.tileEntries * 4));
  for (let e = 0; e < entries; e++) {
    const a = slot * 0x2000;
    tiles.slice(e * 256, e * 256 + 256).forEach((t, i) => rom.set(t, exOff(bank, a + i * 32)));
    const k = (M.tileEntries + e) * 4; table[k] = a & 0xFF; table[k + 1] = a >> 8; table[k + 2] = bank; table[k + 3] = 0;
    if (++slot === 4) { slot = 0; bank++; }
  }
  if (slot) bank++;

  // a frame stream per Sub-Zero frame number; every group of 64 shares a bank
  const fr = M.frames, frOff = off(fr), btOff = off(M.banks);
  const addrs = new Uint16Array(M.count), banks = [];
  const counters = {}; let replaced = 0, kept = 0;
  for (let g = 0; g * 64 < M.count; g++, bank++) {
    banks.push(bank); let p = 0;
    for (let i = g * 64; i < Math.min(M.count, g * 64 + 64); i++) {
      const orig = (mk3Rom[btOff + (i >> 6)] << 16) | mk3Rom[frOff + i * 2] | (mk3Rom[frOff + i * 2 + 1] << 8);
      let bytes;
      let b = null;
      try { const f = buildFrame(mk3Rom, M, orig), c = compose(f); b = { ...c, tiles: f.n16 * 4 + f.n8 }; } catch { b = null; }
      const cat = b && category(b, M.ground);
      if (!cat) {
        const o = off(orig); bytes = mk3Rom.subarray(o, o + streamLength(mk3Rom, orig)); kept++;
      } else {
        const list = poseWords[cat], n = counters[cat] = (counters[cat] || 0) + 1, pose = list[n % list.length];
        const feetX = Math.round(b.ox + b.w / 2), feetY = cat === "jump" || cat === "roll" ? b.oy + b.h : M.ground;
        const s = [pose.length, pose.length];
        for (const c of pose) { s.push(0, (feetX + c.x) & 0xFF, (feetY + c.y) & 0xFF); for (const w of c.w) s.push(w & 0xFF, w >> 8); }
        bytes = Uint8Array.from(s); replaced++;
      }
      if (p + bytes.length > 0x8000) throw new Error("frame bank full");
      rom.set(bytes, exOff(bank, p)); addrs[i] = p; p += bytes.length;
    }
  }

  // descriptor + tables in bank $40
  const T = 0x40; let q = 0;
  const put = bytes => { const a = q; rom.set(bytes, exOff(T, q)); q += bytes.length; return a; };
  const tableAt = put(table);
  const framesAt = put(new Uint8Array(addrs.buffer));
  const banksAt = put(Uint8Array.from([...banks, 0, 0]));
  const dOff = off((mk3Rom[off(M.descBanks + M.setId)] << 16) | mk3Rom[off(M.descAddrs + M.setId)] | (mk3Rom[off(M.descAddrs + M.setId) + 1] << 8));
  const desc = Uint8Array.from(mk3Rom.subarray(dOff, dOff + 16));
  desc[0] = banksAt & 0xFF; desc[1] = banksAt >> 8;
  desc[2] = tableAt & 0xFF; desc[3] = tableAt >> 8; desc[4] = T;
  desc[5] = framesAt & 0xFF; desc[6] = framesAt >> 8; desc[7] = T;
  const descAt = put(desc);
  const ba = off(M.descBanks + M.setId), aa = off(M.descAddrs + M.setId);
  rom[ba] = T; rom[ba + 1] = 0; rom[aa] = descAt & 0xFF; rom[aa + 1] = descAt >> 8;
  // the same bytes in the bank $00-$3F copy, in case they are read from there
  const mirror = o => { const b = o >> 16, a = o & 0xFFFF; if (a >= 0x8000 && b < 0x40) rom[0x400000 + o] = rom[o]; };
  [ba, ba + 1, aa, aa + 1].forEach(mirror);

  // DK's colours
  for (let i = 1; i < 16; i++) { rom[M.palette + i * 2] = dkcRom[D.palette + i * 2]; rom[M.palette + i * 2 + 1] = dkcRom[D.palette + i * 2 + 1]; mirror(M.palette + i * 2); mirror(M.palette + i * 2 + 1); }

  fixChecksum(rom);
  return { rom, stats: { replaced, kept, tiles: tiles.length, entries, scale: +scale.toFixed(2), banksUsed: bank - 0x40 } };
}

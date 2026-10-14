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
    bananaPalette: 0x3C86F0,       // the bananas' sprite palette (colour 0)
    portraitPose: 0x61C,
    yell: { offset: 0x07B003, rate: 10680 },   // DK's yell when he gets hit (BRR sample, file offset)           // DK facing the camera, for the select-screen portrait
    poses: {
      stand:  [0xBC, 0xC0, 0xC4, 0xC8, 0xCC, 0xD0, 0xD4, 0xD8],
      walk:   [0xE0, 0xE8, 0xF0, 0xF8, 0x100, 0x108, 0x110, 0x118, 0x120, 0x128],
      jump:   [0x130, 0x138, 0x140, 0x148, 0x150, 0x158],
      roll:   [0x4B8, 0x4C0, 0x4C8, 0x4D0, 0x4D8, 0x4E0],
      rolling: [0x4C0, 0x4C4, 0x4C8, 0x4CC, 0x4D0, 0x4D4, 0x4D8, 0x4DC],   // DK's real roll, in order
      crouch: [0x4EC, 0x5D4],
      attack: [0x614, 0x770, 0x774, 0x778],
      punch:  [0x220, 0x224, 0x234, 0x238],
      upper:  [0x618, 0x61C, 0x620],
      slap:   [0x758, 0x75C, 0x760],
      lunge:  [0x774, 0x778, 0x77C, 0x780],
      block:  [0x638],
      win:    [0x61C, 0x620, 0x624, 0x628],
      throw:  [0x224, 0x234],
      banana: [0x1928, 0x192C, 0x1930, 0x1934, 0x1938, 0x193C, 0x1940, 0x1944],   // a spinning banana
      hurt:   [0x40C, 0x410, 0x414, 0x418, 0x41C, 0x420],
      down:   [0x38C, 0x390],
    },
  },
  mk3: {
    descBanks: 0x85ABAA, descAddrs: 0x85ABDE, setId: 8,   // Sub-Zero's graphics set
    tileTable: 0xFFCDA5, tileEntries: 45, aux62: 0xFFF7C0, aux66: 0xFFF7CF,
    frames: 0xFEFC6A, banks: 0xFEFE64, count: 253,
    palette: 0x3FB07F,             // file offset of Sub-Zero's palette (colour 0)
    iceBallPalette: 0x3FB0DF,      // the ice ball's palette (colour 0)
    projectile: [212, 221],        // the ice ball: drawn as a big banana
    bananaHold: 217,               // the frame it holds while flying (animated as a spinning banana)
    poseScale: { banana: 3 },
    // the thrower and the ice ball share the fighter's VRAM area, so both stay smaller then
    // bytes of sprite VRAM a frame may use: the body gets $800 (the next $600 hold blood and
    // projectiles, then the other objects), the ice ball / banana gets $600
    vramBudget: { body: 0x800, banana: 0x600 },
    scale: 1.6, ground: 43, feetX: 6,          // feet position in frame coordinates (from the stance)
    // Sub-Zero frame numbers by move, recorded from play (the rest go by outline)
    moves: [[3, 9, "stand"], [10, 24, "walk"], [25, 25, "stand"], [26, 32, "crouch"], [33, 39, "upper"],
            [40, 44, "slap"], [45, 63, "punch"], [64, 65, "block"], [66, 76, "lunge"], [77, 83, "lunge"],
            [84, 84, "roll"], [85, 85, "jump"], [86, 88, "roll"], [89, 95, "roll"], [96, 123, "hurt"],
            [163, 169, "slap"], [156, 156, "rolling"], [144, 144, "throw"], [140, 142, "win"]],   // 140-142: picked on the select screen
    // Select screen: one 8bpp picture unpacked from $C3:0000 into RAM at $7F:3B00, then copied to
    // VRAM. Sub-Zero's portrait is 4x7 tiles (VRAM tiles $107-$122) = $7F:6CC0 in that buffer.
    select: { unpackCall: 0x02C217, unpacker: 0x86E41A, fillCall: 0x02C238, filler: 0x82C4DC, source: 0xC30000, portraitRam: 0x7F6CC0, w: 32, h: 56,
              // its colours 1-127: 1-47 at $3F9090 + 2c, 48-127 at $3F90F4 + 2(c-48)
              palette: c => (c < 48 ? 0x3F9090 + 2 * c : 0x3F90F4 + 2 * (c - 48)) },
    // Fight name bar: every name is in one strip picture unpacked from $F6:0396 to $7F:5300 (call at
    // $80:FF0A); a table at $80:FF0F gives each name's (first tile, tiles, padding). Sub-Zero is entry
    // 4. DK's name goes in after the last name (which ends at tile 114) and entry 4 points at it.
    names: { unpackCall: 0x00FF0A, buffer: 0x7F5300, table: 0x00FF0F, entry: 4, freeTile: 120 },
    // The "Sub-Zero!" announcer clip: streamed to the sound chip from $D0:73B9 (3-byte prefix, then
    // BRR blocks played at about 6 kHz; the clip ends at block 340)
    voice: { offset: 0x1073B9 + 3, blocks: 341, rate: 6000 },
    // "<NAME> WINS" banner: frame 16 of graphics set 38 is "SUBZERO"; the set's descriptor is copied
    // so frame 16 can point at a DONKEY KONG frame (frames 1-64 share one bank, so their streams are
    // copied along)
    banner: { setId: 38, frame: 16 },
    effectsFrom: 186,              // frames 186+ are ice, sparks, body parts: drawn by MK3 as before
    slide: 156,                    // Sub-Zero's slide: shown as DK's animated roll (see the hook below)
    counter: 0x7E1A0A,             // counts up once per frame
    callSites: [0x06EB05, 0x06EB53],   // file offsets of the two "jsl/jml sub_C28000" after a frame pick
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

// Split cells into sprite pieces: a mostly-full cell stays one 16x16 piece, a cell with only one or
// two 8x8 quarters in use becomes 8x8 pieces (1 tile each instead of 4).
function pieces(img) {
  const big = [], small = [];
  for (const c of cells(img)) {
    const q = [[0, 0], [8, 0], [0, 8], [8, 8]].filter(([qx, qy]) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (c.px[(qy + y) * 16 + qx + x]) return true; return false; });
    if (q.length >= 3) big.push(c); else for (const [qx, qy] of q) small.push({ x: c.x + qx, y: c.y + qy, px: c.px, qx, qy });
  }
  return { big, small };
}

// How far into the fighter's VRAM area a frame with n16 big and n8 small pieces reaches, using the
// game's own placement tables (16x16 steps at $85:A428; 8x8 start $85:A498[n16], steps via $85:A73A).
export function vramEnd(mk3, n16, n8) {
  const r16 = a => mk3[off(a)] | (mk3[off(a) + 1] << 8);
  let end = 0, o = 0;
  for (let k = 0; k < n16; k++) { end = Math.max(end, o + 0x240); o += r16(0x85A428 + k * 2); }
  let p = r16(0x85A498 + n16 * 2); const list = 0x850000 | r16(0x85A73A + n16 * 2);
  for (let k = 0; k < n8; k++) { end = Math.max(end, p + 0x20); p += r16(list + k * 2); }
  return end;
}

function tileBytes(px, ox, oy) {                       // 8x8 of a 16x16 cell -> SNES 4bpp
  const t = new Uint8Array(32);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = px[(oy + y) * 16 + ox + x], m = 1 << (7 - x);
    if (v & 1) t[y * 2] |= m; if (v & 2) t[y * 2 + 1] |= m; if (v & 4) t[16 + y * 2] |= m; if (v & 8) t[16 + y * 2 + 1] |= m;
  }
  return t;
}

// DK's select-screen portrait: his chest-beat pose, head and shoulders, in the select screen's own
// colours, as 8bpp tiles (4 across, 7 down).
export function dkPortrait(mk3, dkc, D, sel) {
  const pose = dkPose(dkc, D.frameTable, D.portraitPose);
  const rgb = w => [(w & 31) << 3, ((w >> 5) & 31) << 3, ((w >> 10) & 31) << 3];
  const dk = []; for (let i = 0; i < 16; i++) dk.push(rgb(dkc[D.palette + i * 2] | (dkc[D.palette + i * 2 + 1] << 8)));
  // colours 128+ are sprite colours that change with the cursor, so only 1-127 are used
  const pal = []; for (let c = 1; c < 128; c++) if (c % 16) { const o = sel.palette(c); pal.push([c, rgb(mk3[o] | (mk3[o + 1] << 8))]); }
  const nearest = ([r, g, b]) => { let best = 1, bd = 1e9; for (const [c, [R, G, B]] of pal) { const d = (r - R) ** 2 * 3 + (g - G) ** 2 * 4 + (b - B) ** 2 * 2; if (d < bd) { bd = d; best = c; } } return best; };
  const bg = nearest([24, 16, 32]), bg2 = nearest([56, 40, 64]);
  // scale the pose so it is 34 px wide, keep the top (head and shoulders), centred
  const s = 34 / pose.w, out = new Uint8Array(sel.w * sel.h);
  for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.w; x++) {
    const sx = Math.floor((x - sel.w / 2) / s + pose.w / 2), sy = Math.floor((y - 6) / s);
    const v = sx >= 0 && sx < pose.w && sy >= 0 && sy < pose.h ? pose.data[sy * pose.w + sx] : 0;
    out[y * sel.w + x] = v ? nearest(dk[v]) : (y > sel.h * 0.6 ? bg2 : bg);
  }
  const tiles = new Uint8Array((sel.w / 8) * (sel.h / 8) * 64);
  for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.w; x++) {
    const t = (y >> 3) * (sel.w / 8) + (x >> 3), c = out[y * sel.w + x], m = 1 << (7 - (x & 7));
    for (let p = 0; p < 8; p++) if (c & (1 << p)) tiles[t * 64 + (p >> 1) * 16 + (y & 7) * 2 + (p & 1)] |= m;
  }
  return tiles;
}

// "DONKEY KONG" for the fight name bar: an 80x8 2bpp strip in the style of MK3's names (slanted,
// colour 3 body, colour 2 left edges, colour 1 shadow). The letters are drawn here, not taken from
// either game.
const GLYPHS = {
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  K: ["#..#.", "#.#..", "##...", "##...", "#.#..", "#..#.", "#...#"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
};
// The big "<NAME> WINS" banner text: same letters, 9 rows tall and doubled in width, colour 1
// fill and colour 2 shadow like the game's banner frames.
export function bannerText(text = "DONKEY KONG") {
  const rows = [0, 1, 1, 2, 3, 4, 5, 5, 6], slant = [2, 2, 2, 1, 1, 1, 0, 0, 0];
  const w = text.replace(/ /g, "").length * 7 + (text.split(" ").length - 1) * 5 + 4, h = 11, data = new Uint8Array(w * h);
  let x = 0;
  for (const ch of text) {
    if (ch === " ") { x += 5; continue; }
    const g = GLYPHS[ch];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) if (g[rows[r]][c] === "#")
      for (const dx of [0, 1]) data[r * w + x + c + dx + slant[r]] = 1;
    x += 7;
  }
  for (let y = h - 2; y >= 0; y--) for (let X = w - 2; X >= 0; X--) if (data[y * w + X] === 1 && !data[(y + 1) * w + X + 1]) data[(y + 1) * w + X + 1] = 2;
  return { w, h, data, fx: Math.round(w / 2), fy: h };
}

export function nameStrip(text = "DONKEY KONG") {
  const W = 80, px = new Uint8Array(W * 8), slant = [2, 2, 1, 1, 1, 0, 0];
  let x = 1;
  for (const ch of text) {
    if (ch === " ") { x += 4; continue; }
    const g = GLYPHS[ch];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === "#") {
      // two pixels thick horizontally, like the game's bold letters
      for (const dx of [0, 1]) { const X = x + c + dx + slant[r]; if (X < W) px[(r + 1) * W + X] = 3; }
    }
    x += 7;
  }
  // left edges darker, shadow to the left and above
  for (let y = 0; y < 8; y++) for (let X = 0; X < W; X++) if (px[y * W + X] === 3 && (X === 0 || px[y * W + X - 1] === 0)) px[y * W + X] = 2;
  for (let y = 0; y < 8; y++) for (let X = 0; X < W; X++) if (px[y * W + X] >= 2) {
    if (X > 0 && px[y * W + X - 1] === 0) px[y * W + X - 1] = 1;
    if (y > 0 && px[(y - 1) * W + X] === 0) px[(y - 1) * W + X] = 1;
  }
  const out = new Uint8Array(160);
  for (let y = 0; y < 8; y++) for (let X = 0; X < W; X++) { const c = px[y * W + X], t = X >> 3, m = 1 << (7 - (X & 7));
    if (c & 1) out[t * 16 + y * 2] |= m; if (c & 2) out[t * 16 + y * 2 + 1] |= m; }
  return out;
}

// SNES BRR sound: decode a sample, and encode 16-bit PCM (each 16-sample block tries every filter
// and shift and keeps the closest).
function brrDecode(buf, off) {
  const out = []; let p1 = 0, p2 = 0;
  for (let o = off; ; o += 9) {
    const hdr = buf[o], range = hdr >> 4, filter = (hdr >> 2) & 3;
    for (let i = 0; i < 16; i++) {
      let n = buf[o + 1 + (i >> 1)]; n = i & 1 ? n & 15 : n >> 4; if (n >= 8) n -= 16;
      const s = clampDecode((range <= 12 ? (n << range) >> 1 : (n < 0 ? -2048 : 0)) + predict(filter, p1, p2));
      p2 = p1; p1 = s; out.push(s);
    }
    if (hdr & 1) break;
  }
  return out;
}
const predict = (f, p1, p2) => f === 0 ? 0 : f === 1 ? p1 + ((-p1) >> 4) : f === 2 ? 2 * p1 + ((-3 * p1) >> 5) - p2 + (p2 >> 4) : 2 * p1 + ((-13 * p1) >> 6) - p2 + ((3 * p2) >> 4);
const clampDecode = s => { s = Math.max(-32768, Math.min(32767, s)); return ((s << 17) >> 16) >> 1; };
function brrEncode(pcm) {
  const out = []; let p1 = 0, p2 = 0;
  for (let b = 0; b * 16 < pcm.length; b++) {
    let best = null;
    for (let filter = b === 0 ? 0 : 0; filter < (b === 0 ? 1 : 4); filter++) for (let range = 0; range <= 12; range++) {
      let q1 = p1, q2 = p2, err = 0; const nib = [];
      for (let i = 0; i < 16; i++) {
        const target = (pcm[b * 16 + i] || 0) >> 1, pred = predict(filter, q1, q2);
        let n = Math.round((target - pred) * 2 / (1 << range)); n = Math.max(-8, Math.min(7, n));
        const s = clampDecode(((n << range) >> 1) + pred); err += (s - target) ** 2; nib.push(n & 15); q2 = q1; q1 = s;
      }
      if (!best || err < best.err) best = { err, filter, range, nib, q1, q2 };
    }
    const blk = [(best.range << 4) | (best.filter << 2)]; for (let i = 0; i < 16; i += 2) blk.push((best.nib[i] << 4) | best.nib[i + 1]);
    out.push(...blk); p1 = best.q1; p2 = best.q2;
  }
  out[out.length - 9] |= 1;   // end
  return Uint8Array.from(out);
}

// DK's yell, resampled to the announcer's rate, as BRR blocks for the "Sub-Zero!" slot.
export function dkVoice(mk3, dkc, D, V) {
  const src = brrDecode(dkc, D.yell.offset).map(x => x * 2);   // decoder output is 15-bit
  const ref = brrDecode(mk3, V.offset).map(x => x * 2);
  const peak = a => a.reduce((m, x) => Math.max(m, Math.abs(x)), 1);
  const gain = Math.min(4, peak(ref) / peak(src));
  const n = Math.floor(src.length * V.rate / D.yell.rate), pcm = [];
  for (let i = 0; i < n; i++) { const t = i * D.yell.rate / V.rate, k = Math.floor(t), f = t - k;   // linear interpolation
    pcm.push(Math.round(((src[k] || 0) * (1 - f) + (src[k + 1] || 0) * f) * gain)); }
  for (let i = 0; i < 32; i++) pcm.push(0);   // a short tail of silence
  const brr = brrEncode(pcm.slice(0, V.blocks * 16));
  return brr;
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

// A frame stream: every piece 16x16, explicit x/y bytes, four tile words.
function stream(pose, feetX, feetY) {
  const s = [pose.length, pose.filter(c => c.big).length];
  for (const c of pose) { s.push(0, (feetX + c.x) & 0xFF, (feetY + c.y) & 0xFF); for (const w of c.w) s.push(w & 0xFF, w >> 8); }
  return Uint8Array.from(s);
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
  // every pose at DK's size (M.scale), shrunk only if that one pose would not fit the VRAM budget
  const scale = M.scale, poses = {};
  for (const [cat, list] of Object.entries(base)) poses[cat] = list.map(p => {
    const budget = M.vramBudget[cat] || M.vramBudget.body;
    for (let s = M.poseScale[cat] || scale; ; s -= 0.05) { const pc = pieces(scaled(p, s)); if (vramEnd(mk3Rom, pc.big.length, pc.small.length) <= budget || s < 0.8) return pc; }
  });

  // tiles: deduplicated, 256 per table entry, entries after Sub-Zero's own
  const tiles = [], tileIndex = new Map();
  const tileWord = t => { const k = t.join(","); let i = tileIndex.get(k); if (i === undefined) { i = tiles.length; tiles.push(t); tileIndex.set(k, i); }
    return (((i & 0xFF) << 8) | ((M.tileEntries + (i >> 8)) * 4)); };
  const poseWords = {};
  for (const [cat, list] of Object.entries(poses)) poseWords[cat] = list.map(pc => [
    ...pc.big.map(c => ({ big: true, x: c.x, y: c.y,
      w: [tileWord(tileBytes(c.px, 0, 0)), tileWord(tileBytes(c.px, 8, 0)), tileWord(tileBytes(c.px, 0, 8)), tileWord(tileBytes(c.px, 8, 8))] })),
    ...pc.small.map(c => ({ big: false, x: c.x, y: c.y, w: [tileWord(tileBytes(c.px, c.qx, c.qy))] }))]);
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
  const counters = {}, placed = {}; let replaced = 0, kept = 0;
  for (let g = 0; g * 64 < M.count; g++, bank++) {
    banks.push(bank); let p = 0;
    for (let i = g * 64; i < Math.min(M.count, g * 64 + 64); i++) {
      const orig = (mk3Rom[btOff + (i >> 6)] << 16) | mk3Rom[frOff + i * 2] | (mk3Rom[frOff + i * 2 + 1] << 8);
      let bytes;
      let b = null;
      try { const f = buildFrame(mk3Rom, M, orig), c = compose(f); b = { ...c, tiles: f.n16 * 4 + f.n8 }; } catch { b = null; }
      const isBanana = b && i + 1 >= M.projectile[0] && i + 1 <= M.projectile[1];
      let cat = isBanana ? "banana" : b && i + 1 < M.effectsFrom && category(b, M.ground);
      const mv = cat && M.moves.find(([lo, hi]) => i + 1 >= lo && i + 1 <= hi);
      if (mv && !isBanana) cat = mv[2] === "hurt" && cat === "down" ? "down" : mv[2];
      if (!cat) {
        const o = off(orig); bytes = mk3Rom.subarray(o, o + streamLength(mk3Rom, orig)); kept++;
      } else {
        const list = poseWords[cat], n = counters[cat] = (counters[cat] || 0) + 1, pose = list[n % list.length];
        const grounded = !["jump", "roll", "hurt", "down"].includes(cat) && b.oy + b.h >= M.ground - 6;
        let feetX = grounded ? M.feetX : Math.round(b.ox + b.w / 2), feetY = Math.min(M.ground, b.oy + b.h);
        if (isBanana) {   // centred on the ice ball, at its leading end
          const top = Math.min(...pose.map(c => c.y));
          feetX = b.ox + b.w - 24; feetY = Math.round(b.oy + b.h / 2 - top / 2);
        }
        placed[i + 1] = { feetX, feetY };
        bytes = stream(pose, feetX, feetY); replaced++;
      }
      if (p + bytes.length > 0x8000) throw new Error("frame bank full");
      rom.set(bytes, exOff(bank, p)); addrs[i] = p; p += bytes.length;
    }
  }

  // Animated frames: while the game holds one of these frames (the slide, the ice ball in flight),
  // a hook swaps in one of eight streams each time the object is drawn (picked by a frame counter)
  // and marks the frame as changed so the game draws it again next frame.
  const animBank = bank++; let ap = 0;
  const anims = [
    { frame: M.slide, poses: poseWords.rolling, at: { feetX: M.feetX, feetY: M.ground } },
    { frame: M.bananaHold, poses: poseWords.banana, at: placed[M.bananaHold] },
    { frame: 142, poses: [...poseWords.win, ...poseWords.win], at: placed[142] },   // chest-beat after being picked
  ].map(a => ({ ...a, addr: addrs[a.frame - 1], bank: banks[(a.frame - 1) >> 6],
    streams: a.poses.slice(0, 8).map(pose => { const st = stream(pose, a.at.feetX, a.at.feetY), at = ap; rom.set(st, exOff(animBank, ap)); ap += st.length; return at; }) }));

  // descriptor + tables in bank $40
  // (bytes changed in the first 4 MB are also copied to the bank $00-$3F copy, in case they are read from there)
  const mirror = o => { const b = o >> 16, a = o & 0xFFFF; if (a >= 0x8000 && b < 0x40) rom[0x400000 + o] = rom[o]; };
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
  const lo = v => v & 0xFF, hi = v => (v >> 8) & 0xFF, cnt = M.counter;
  const hook = [];
  for (const a of anims) {
    const tableAt = put(new Uint8Array(Uint16Array.from(a.streams).buffer));
    hook.push(
      0xBF, 0x8A, 0x24, 0x7E,                     // lda f:$7E248A,x   frame stream address
      0xC9, lo(a.addr), hi(a.addr),               // cmp #frame
      0xD0, 0x31,                                 // bne next
      0xBF, 0xA2, 0x24, 0x7E,                     // lda f:$7E24A2,x
      0x29, 0xFF, 0x00,                           // and #$00FF
      0xC9, a.bank, 0x00,                         // cmp #bank
      0xD0, 0x25,                                 // bne next
      0xAF, lo(cnt), hi(cnt), cnt >> 16,          // lda f:counter
      0x4A,                                       // lsr
      0x29, 0x0E, 0x00,                           // and #$000E   (changes every 2 frames, 8 streams)
      0xDA, 0xAA,                                 // phx / tax
      0xBF, lo(tableAt), hi(tableAt), T,          // lda f:table,x
      0xFA,                                       // plx
      0x9F, 0x8A, 0x24, 0x7E,                     // sta f:$7E248A,x
      0xA9, animBank, 0x00,                       // lda #animBank
      0x9F, 0xA2, 0x24, 0x7E,                     // sta f:$7E24A2,x
      0xA9, 0x00, 0x00,                           // lda #0
      0x9F, 0xBE, 0x52, 0x7E,                     // sta f:$7E52BE,x  -> redraw next frame
      0x5C, 0x00, 0x80, 0x82);                    // jml sub_C28000
  }                                               // next:
  hook.push(0x5C, 0x00, 0x80, 0x82);              // jml sub_C28000
  const hookAt = put(Uint8Array.from(hook));
  for (const site of M.callSites) { if (mk3Rom[site + 1] !== 0x00 || mk3Rom[site + 2] !== 0x80 || mk3Rom[site + 3] !== 0x82) throw new Error("unexpected code at " + site.toString(16)); rom[site + 1] = lo(hookAt); rom[site + 2] = hi(hookAt); rom[site + 3] = T; [1, 2, 3].forEach(k => mirror(site + k)); }
  const ba = off(M.descBanks + M.setId), aa = off(M.descAddrs + M.setId);
  rom[ba] = T; rom[ba + 1] = 0; rom[aa] = descAt & 0xFF; rom[aa + 1] = descAt >> 8;
  [ba, ba + 1, aa, aa + 1].forEach(mirror);

  // select-screen portrait: after the select picture is unpacked into RAM, copy DK's tiles over
  // Sub-Zero's (a wrapper around the unpack call; other pictures pass straight through)
  const S = M.select, portrait = dkPortrait(mk3Rom, dkcRom, D, S), portraitAt = put(portrait);
  const wrap = [
    0xA5, 0x7C, 0x48, 0xA5, 0x7A, 0x48,                         // push the source pointer (bank, low word)
    0x22, lo(S.unpacker), hi(S.unpacker), S.unpacker >> 16,     // jsl unpack
    0xC2, 0x30, 0x48,                                           // rep #$30 / pha (result)
    0xA3, 0x03, 0xC9, lo(S.source), hi(S.source),               // lda 3,s / cmp #source low
    0xD0, 0x1C,                                                 // bne done
    0xA3, 0x05, 0x29, 0xFF, 0x00, 0xC9, S.source >> 16, 0x00,   // lda 5,s / and #$FF / cmp #source bank
    0xD0, 0x12,                                                 // bne done
    0x8B, 0xDA, 0x5A,                                           // phb / phx / phy
    0xA2, lo(portraitAt), hi(portraitAt),                       // ldx #tiles
    0xA0, lo(S.portraitRam), hi(S.portraitRam),                 // ldy #buffer position
    0xA9, lo(portrait.length - 1), hi(portrait.length - 1),     // lda #length-1
    0x54, S.portraitRam >> 16, T,                               // mvn
    0x7A, 0xFA, 0xAB,                                           // ply / plx / plb
    0xA3, 0x01, 0x83, 0x05, 0x68, 0x68, 0x68,                   // done: keep the result, drop the rest
    0x6B,                                                       // rtl
  ];
  const wrapAt = put(Uint8Array.from(wrap));
  { const c = S.unpackCall; if (mk3Rom[c] !== 0x22 || mk3Rom[c + 1] !== lo(S.unpacker)) throw new Error("unexpected code at select unpack");
    rom[c + 1] = lo(wrapAt); rom[c + 2] = hi(wrapAt); rom[c + 3] = T; [1, 2, 3].forEach(k => mirror(c + k)); }

  // The game then runs its own pass over the picture (jsl $82C4DC), which would scramble DK's
  // tiles, so this second wrapper checks (before that pass) whether the buffer holds DK's tiles,
  // and if so copies them in again after it.
  const K = 10 * 64, tag = portraitAt + K, ram = S.portraitRam + K;
  const asm = [], labels = {}, fixups = [];
  const emit = (...b) => asm.push(...b), br = (op, l) => { emit(op, 0); fixups.push([asm.length - 1, l]); }, label = l => { labels[l] = asm.length; };
  emit(0xC2, 0x30, 0x48, 0xDA);                                 // rep #$30 / pha / phx
  emit(0xA9, 0x00, 0x00, 0x48);                                 // flag = 0
  emit(0xAF, lo(ram), hi(ram), ram >> 16, 0xCF, lo(tag), hi(tag), T); br(0xD0, "go");
  emit(0xAF, lo(ram + 2), hi(ram + 2), ram >> 16, 0xCF, lo(tag + 2), hi(tag + 2), T); br(0xD0, "go");
  emit(0xA9, 0x01, 0x00, 0x83, 0x01);                           // flag = 1
  label("go");
  emit(0xA3, 0x03, 0xAA, 0xA3, 0x05);                           // the step's X and A, as passed in
  emit(0x22, lo(S.filler), hi(S.filler), S.filler >> 16);       // jsl the game's step
  emit(0xC2, 0x30, 0x68); br(0xF0, "out");                      // pla flag / beq out
  emit(0x8B, 0xA2, lo(portraitAt), hi(portraitAt), 0xA0, lo(S.portraitRam), hi(S.portraitRam),
       0xA9, lo(portrait.length - 1), hi(portrait.length - 1), 0x54, S.portraitRam >> 16, T, 0xAB);
  label("out");
  emit(0x68, 0x68, 0x6B);                                       // drop X and A / rtl
  for (const [at, l] of fixups) asm[at] = (labels[l] - (at + 1)) & 0xFF;
  const fill = asm;
  const fillAt = put(Uint8Array.from(fill));
  { const c = S.fillCall; if (mk3Rom[c] !== 0x22 || mk3Rom[c + 1] !== lo(S.filler)) throw new Error("unexpected code at select fill");
    rom[c + 1] = lo(fillAt); rom[c + 2] = hi(fillAt); rom[c + 3] = T; [1, 2, 3].forEach(k => mirror(c + k)); }

  // fight name bar
  { const N = M.names, strip = nameStrip(), stripAt = put(strip), dst = N.buffer + N.freeTile * 16;
    const nw = [0x22, lo(S.unpacker), hi(S.unpacker), S.unpacker >> 16,                 // jsl unpack (as before)
      0xC2, 0x30, 0x8B, 0xDA, 0x5A,                                                     // rep #$30 / phb / phx / phy
      0xA2, lo(stripAt), hi(stripAt), 0xA0, lo(dst), hi(dst), 0xA9, strip.length - 1, 0x00,
      0x54, dst >> 16, T, 0x7A, 0xFA, 0xAB, 0x6B];                                     // mvn / ply / plx / plb / rtl
    const nwAt = put(Uint8Array.from(nw)), c = N.unpackCall;
    if (mk3Rom[c] !== 0x22 || mk3Rom[c + 1] !== lo(S.unpacker)) throw new Error("unexpected code at name unpack");
    rom[c + 1] = lo(nwAt); rom[c + 2] = hi(nwAt); rom[c + 3] = T; [1, 2, 3].forEach(k => mirror(c + k));
    const e = N.table + N.entry * 3; rom[e] = N.freeTile; rom[e + 1] = 10; rom[e + 2] = 0; [0, 1, 2].forEach(k => mirror(e + k)); }

  // the announcer says DK's yell instead of "Sub-Zero!" (the clip keeps its length; anything after
  // the new end flag is never played)
  { const v = dkVoice(mk3Rom, dkcRom, D, M.voice); rom.set(v, M.voice.offset); }

  // "DONKEY KONG WINS"
  {
    const B = M.banner, dOff2 = off((mk3Rom[off(M.descBanks + B.setId)] << 16) | mk3Rom[off(M.descAddrs + B.setId)] | (mk3Rom[off(M.descAddrs + B.setId) + 1] << 8));
    const r16 = o => mk3Rom[o] | (mk3Rom[o + 1] << 8);
    const tt = (mk3Rom[dOff2 + 4] << 16) | r16(dOff2 + 2), ftb = mk3Rom[dOff2 + 7];
    const ft = (ftb << 16) | r16(dOff2 + 5), bt = (ftb << 16) | r16(dOff2);
    const count = (bt - ft) >> 1, frameAddr = i => (mk3Rom[off(bt) + (i >> 6)] << 16) | r16(off(ft) + i * 2);
    // tile table entries in use, so DK's letters get a free one
    let maxEntry = 0;
    for (let i = 0; i < count; i++) { const a = frameAddr(i), p0 = off(a); let p = p0 + 2; const total = mk3Rom[p0], n16 = mk3Rom[p0 + 1];
      for (let k = 0; k < total; k++) { const c = mk3Rom[p++]; if (!(c & 0xF0)) p++; if (!(c & 0x0F)) p++; const nw = k < n16 ? 4 : 1;
        for (let j = 0; j < nw; j++) maxEntry = Math.max(maxEntry, (mk3Rom[p + j * 2] & 0xFC) >> 2); p += nw * 2; } }
    const entry = maxEntry + 1; if (entry > 63) throw new Error("banner set has no free tile entry");
    // Keep the original frame's pieces (positions, sizes, order) and give them new tiles painted with
    // DONKEY KONG, squeezed to the original text's width.
    const aux = (mk3Rom[dOff2 + 11] << 16) | r16(dOff2 + 12);   // this set's position tables
    const origAddr = frameAddr(B.frame - 1), orig = buildFrame(mk3Rom, { tileTable: tt, aux62: aux + 1, aux66: aux + 16 }, origAddr);
    const x0 = Math.min(...orig.pieces.map(q => q.x)), x1 = Math.max(...orig.pieces.map(q => q.x + q.size)), y0 = Math.min(...orig.pieces.map(q => q.y));
    const big = bannerText("DONKEY KONG WINS"), W = x1 - x0, img = { w: W, h: big.h, data: new Uint8Array(W * big.h) };
    for (let y = 0; y < big.h; y++) for (let x = 0; x < W; x++) img.data[y * W + x] = big.data[y * big.w + Math.floor(x * big.w / W)];
    const at = (x, y) => (x >= x0 && x < x1 && y >= y0 && y < y0 + img.h) ? img.data[(y - y0) * W + (x - x0)] : 0;
    const btiles = [], word = t => { btiles.push(t); return (((btiles.length - 1) << 8) | (entry * 4)); };
    const tileAt = (px, py) => { const px16 = new Uint8Array(256); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px16[y * 16 + x] = at(px + x, py + y); return tileBytes(px16, 0, 0); };
    const words = orig.pieces.flatMap(q => q.size === 16 ? [word(tileAt(q.x, q.y)), word(tileAt(q.x + 8, q.y)), word(tileAt(q.x, q.y + 8)), word(tileAt(q.x + 8, q.y + 8))] : [word(tileAt(q.x, q.y))]);
    // copy the stream, swapping in the new tile words (flip bits cleared)
    const src = off(origAddr), len = streamLength(mk3Rom, origAddr), copy = Uint8Array.from(mk3Rom.subarray(src, src + len));
    { let p = 2, k = 0; const total = copy[0], n16 = copy[1];
      for (let i = 0; i < total; i++) { const c = copy[p++]; if (!(c & 0xF0)) p++; if (!(c & 0x0F)) p++;
        for (let j = 0; j < (i < n16 ? 4 : 1); j++, k++) { copy[p] = words[k] & 0xFF; copy[p + 1] = words[k] >> 8; p += 2; } } }
    const bBank = bank++; let bp = 0;
    const tilesAt = bp; btiles.forEach(t => { rom.set(t, exOff(bBank, bp)); bp += 32; });
    const table2 = new Uint8Array(256); table2.set(mk3Rom.subarray(off(tt), off(tt) + entry * 4));
    table2[entry * 4] = lo(tilesAt); table2[entry * 4 + 1] = hi(tilesAt); table2[entry * 4 + 2] = bBank; table2[entry * 4 + 3] = 0;
    // frames 1-64 copied into the new bank (frame 16 replaced), the rest keep their bank
    const addrs2 = new Uint16Array(count), banks2 = [];
    for (let g = 0; g * 64 < count; g++) banks2.push(g === 0 ? bBank : mk3Rom[off(bt) + g]);
    for (let i = 0; i < count; i++) {
      if (i >= 64) { addrs2[i] = r16(off(ft) + i * 2); continue; }
      const bytes = i + 1 === B.frame && !B.keepOriginal ? copy : mk3Rom.subarray(off(frameAddr(i)), off(frameAddr(i)) + streamLength(mk3Rom, frameAddr(i)));
      rom.set(bytes, exOff(bBank, bp)); addrs2[i] = bp; bp += bytes.length;
      if (bp > 0x8000) throw new Error("banner bank full");
    }
    const tAt = put(table2), fAt = put(new Uint8Array(addrs2.buffer)), bAt = put(Uint8Array.from([...banks2, 0, 0]));
    const desc2 = Uint8Array.from(mk3Rom.subarray(dOff2, dOff2 + 16));
    desc2[0] = lo(bAt); desc2[1] = hi(bAt); desc2[2] = lo(tAt); desc2[3] = hi(tAt); desc2[4] = T; desc2[5] = lo(fAt); desc2[6] = hi(fAt); desc2[7] = T;
    const d2At = put(desc2), ba2 = off(M.descBanks + B.setId), aa2 = off(M.descAddrs + B.setId);
    rom[ba2] = T; rom[ba2 + 1] = 0; rom[aa2] = lo(d2At); rom[aa2 + 1] = hi(d2At); [ba2, ba2 + 1, aa2, aa2 + 1].forEach(mirror);
  }

  // banana yellow for the ice ball
  for (let i = 1; i < 16; i++) { rom[M.iceBallPalette + i * 2] = dkcRom[D.bananaPalette + i * 2]; rom[M.iceBallPalette + i * 2 + 1] = dkcRom[D.bananaPalette + i * 2 + 1]; mirror(M.iceBallPalette + i * 2); mirror(M.iceBallPalette + i * 2 + 1); }

  // DK's colours
  for (let i = 1; i < 16; i++) { rom[M.palette + i * 2] = dkcRom[D.palette + i * 2]; rom[M.palette + i * 2 + 1] = dkcRom[D.palette + i * 2 + 1]; mirror(M.palette + i * 2); mirror(M.palette + i * 2 + 1); }

  fixChecksum(rom);
  return { rom, stats: { replaced, kept, tiles: tiles.length, entries, scale, banksUsed: bank - 0x40 } };
}

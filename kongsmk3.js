// Build a Mortal Kombat 3 ROM where fighters are replaced by Donkey Kong Country characters:
// Donkey Kong in Sub-Zero's slot and Diddy Kong in Kung Lao's. Both ROMs come from the player; the
// recipes below hold only addresses, frame numbers and frame ids.
//
// How it works: MK3 looks up a fighter's graphics through a small descriptor (frame table, tile
// table, ...). The ROM is expanded to 8 MB (ExHiROM; the first 4 MB stay where they were and
// banks $00-$3F keep their code). Each Kong's poses, scaled up and cut into sprite pieces, go into
// the new space as uncompressed tiles, with a new frame stream for every frame number of the fighter
// it replaces and a copy of the descriptor that points at them. The fighter's moves, timing and hit
// boxes are unchanged; a few hooks animate held frames, add a new move per Kong, and swap the
// portrait, name, announcer clip and win banner.
import { buildFrame, compose } from "./mk3frames.js";
import { hiromOffset, parseFrame } from "./dkcskin.js";
import { sgngPose, SGNG } from "./sgngart.js";
import { smwPose, smwPalette } from "./smwart.js";

export const DKC = {
  frameTable: 0x3BCC9C,            // file offset; 4 bytes per frame id (addr16, bank, y)
  bananaPalette: 0x3C86F0,         // sprite palettes (colour 0, file offsets)
  barrelPalette: 0x39B7C3,
};

export const KONGS = {
  dk: {
    name: "DONKEY KONG", setId: 8,                 // Sub-Zero's graphics set
    fighterId: 4,                                  // Sub-Zero's fighter number ($51D6)
    // Sub-Zero's attack records (bank $83) and the frame each one is checked on, recorded from play
    attacks: [[0xDCDF, 51], [0xDD88, 57], [0xDCEC, 46], [0xDCC5, 72], [0xDD7B, 74], [0xDCD2, 70], [0xDD2D, 39],
              [0xDD06, 34], [0xDD13, 44], [0xDD20, 41], [0xDD6E, 80], [0xDCF9, 167], [0xDD3A, 88], [0xDD47, 86],
              [0xDD54, 87], [0xDD61, 88], [0xE2C2, 60], [0xE2DE, 76], [0xDDA2, 156]],
    palette: 0x3FB07F, kongPalette: 0x39B783,      // MK3 palette replaced / DK's DKC palette
    portraitPose: 0x61C, portraitTile: 0x107,      // select-screen portrait (VRAM tiles $107-$122)
    namesEntry: 4, freeTile: 120,                  // health-bar name strip
    voice: 0x1073B9, yell: { offset: 0x07B003, rate: 10680 },   // announcer clip / DK's yell
    bannerFrame: 16,                               // "SUBZERO WINS" in set 38
    scale: 1.6, ground: 43, feetX: 6,
    // DKC (measured): walk 2 px/frame, run 3, speed eases 1/8 of the way each frame, jump 7 px/frame up,
    // gravity 0.28 while the button is held and 0.44 after, steerable in the air
    physics: { walk: 512, run: 768, ease: 3, vy0: 1792, gHold: 72, gRelease: 112, airControl: true },
    effectsFrom: 186,                              // ice, sparks, body parts: kept
    // Sub-Zero's frame numbers by move (recorded from play, then checked side by side)
    moves: [[3, 9, "stand"], [10, 24, "walk"], [25, 25, "stand"], [26, 32, "crouch"], [33, 34, "crouchAtk"],
            [35, 39, "upper"], [40, 44, "crouchAtk"], [45, 63, "punch"], [64, 65, "block"], [66, 83, "lunge"],
            [84, 84, "roll"], [85, 85, "jump"], [86, 95, "roll"], [96, 120, "hurt"], [121, 123, "roll"],
            [124, 139, "hurt"], [140, 142, "win"], [144, 144, "throw"], [145, 148, "win"], [156, 156, "rolling"],
            [163, 169, "crouchAtk"], [170, 174, "hurt"], [176, 180, "win"]],
    // the ice ball becomes a big spinning banana (its own palette slot gets banana yellow)
    projectile: { frames: [212, 221], pose: "banana", scale: 3, budget: 0x600, lead: true, slot: 0x3FB0DF, slotFrom: "bananaPalette" },
    anims: [[156, "rolling", "stand"], [217, "banana", "placed"], [142, "win2", "placed"]],   // held frames, animated
    special: { frames: [33, 39], pose: "slam" },   // down, down + high punch
    poses: {
      stand:  [0xBC, 0xC0, 0xC4, 0xC8, 0xCC, 0xD0, 0xD4, 0xD8],
      walk:   [0xE0, 0xE8, 0xF0, 0xF8, 0x100, 0x108, 0x110, 0x118, 0x120, 0x128],
      jump:   [0x130, 0x138, 0x140, 0x148, 0x150, 0x158],
      roll:   [0x4B8, 0x4C0, 0x4C8, 0x4D0, 0x4D8, 0x4E0],
      rolling: [0x4C0, 0x4C4, 0x4C8, 0x4CC, 0x4D0, 0x4D4, 0x4D8, 0x4DC],
      crouch: [0x4EC, 0x4B8],
      crouchAtk: [0x270, 0x274, 0x278, 0x27C],   // low swipes: fists to the ground
      attack: [0x614, 0x770, 0x774, 0x778],
      punch:  [0x220, 0x224, 0x234, 0x238],
      upper:  [0x618, 0x61C, 0x620],
      slap:   [0x758, 0x75C, 0x760],
      lunge:  [0x774, 0x778, 0x77C, 0x780],
      block:  [0x638],
      win:    [0x61C, 0x620, 0x624, 0x628],
      win2:   [0x61C, 0x620, 0x624, 0x628, 0x61C, 0x620, 0x624, 0x628],
      throw:  [0x224, 0x234],
      slam:   [0x25C, 0x260, 0x264, 0x270, 0x274, 0x278, 0x27C],
      banana: [0x1928, 0x192C, 0x1930, 0x1934, 0x1938, 0x193C, 0x1940, 0x1944],
      hurt:   [0x40C, 0x410, 0x414, 0x418, 0x41C, 0x420],
      down:   [0x38C, 0x390],
    },
  },
  diddy: {
    name: "DIDDY KONG", setId: 18,                 // Kung Lao's graphics set
    fighterId: 9,
    attacks: [[0xD7D5, 39], [0xD87E, 45], [0xD7E2, 55], [0xD7BB, 60], [0xD871, 62], [0xD7C8, 87], [0xD823, 36],
              [0xD7FC, 27], [0xD809, 31], [0xD816, 29], [0xD864, 72], [0xD7EF, 79], [0xD830, 98], [0xD83D, 90],
              [0xD84A, 99], [0xD857, 98]],
    palette: 0x3FB23F, kongPalette: 0x3C843E,
    portraitPose: 0xFD4, portraitTile: 0x193,      // VRAM tiles $193-$1AE
    namesEntry: 9, freeTile: 130,
    voice: 0x0FE7D3, yell: { offset: 0x07A7F5, rate: 11984 },   // Diddy's cry when he gets hit
    bannerFrame: 21,                               // "KUNG LAO WINS"
    scale: 2.0, ground: 46, feetX: 6,
    physics: { walk: 512, run: 768, ease: 3, vy0: 1792, gHold: 72, gRelease: 112, airControl: true },   // DKC, as DK
    effectsFrom: 223,                              // slashes, animality: kept (the hat in flight is below)
    // Kung Lao's frame numbers by move (recorded from play, then checked side by side)
    moves: [[3, 9, "stand"], [10, 17, "walk"], [18, 25, "crouch"], [26, 31, "crouchAtk"], [32, 36, "upper"],
            [37, 51, "punch"], [52, 53, "block"], [54, 57, "punch"], [58, 68, "kick"], [69, 82, "cartwheel"],
            [83, 87, "kick"], [88, 90, "jump"], [91, 102, "flip"], [103, 120, "hurt"], [121, 142, "flip"],
            [143, 146, "down"], [147, 148, "crouch"], [149, 156, "cartwheel"], [160, 160, "stand"], [161, 161, "flip"],
            [162, 165, "kick"], [166, 179, "stand"], [180, 181, "win"], [182, 185, "stand"], [186, 191, "run"],
            [192, 197, "throw"], [198, 202, "hurt"], [203, 217, "crouchAtk"]],
    // the hat in flight becomes a spinning barrel (the hat's palette slot gets the barrel's colours)
    projectile: { list: [223, 224, 225, 226, 227, 228, 229, 233, 234, 235, 240], pose: "barrel", scale: 1.6, budget: 0x600, slot: 0x3FB29F, slotFrom: "barrelPalette" },
    anims: [[181, "win", "placed"]],
    special: { frames: [32, 36], pose: "cartwheel" },   // down, down + high punch: cartwheel launcher
    poses: {
      stand:  [0x954, 0x958, 0x95C, 0x960, 0x964, 0x968],
      walk:   [0x9D4, 0x9D8, 0x9DC, 0x9E0, 0x9E4, 0x9E8, 0x9EC, 0x9F0],
      jump:   [0x9B4, 0x9B8, 0x9BC, 0x9C0, 0x9C4, 0x9C8],
      cartwheel: [0xA88, 0xA8C, 0xA90, 0xA94, 0xA98, 0xA9C, 0xAA0, 0xAA4],
      roll:   [0xA88, 0xA8C, 0xA90, 0xA94, 0xA98, 0xA9C, 0xAA0, 0xAA4],
      flip:   [0x10D8, 0x10DC, 0x10E0, 0x10E4, 0x10E8, 0x10EC],
      crouch: [0x9F8, 0x9FC, 0xA00, 0xA04],
      crouchAtk: [0xBA0, 0xBA4, 0xBA8, 0xBAC],
      punch:  [0xBA0, 0xBA4, 0xBA8, 0xBAC],
      attack: [0xBA0, 0xBA4, 0xBA8, 0xBAC],
      kick:   [0x1114, 0x1118, 0x111C, 0x1120, 0x1124, 0x1128],
      upper:  [0xF14, 0xF18, 0xF1C, 0xF20],
      block:  [0xA58],
      run:    [0xD54, 0xD58, 0xD5C, 0xD60, 0xD64, 0xD68],
      throw:  [0xF70, 0xF74, 0xF78, 0xF7C],
      win:    [0xBE4, 0xBE8, 0xBEC, 0xBF0, 0xBF4, 0xBF8, 0xBFC, 0xC00],
      hurt:   [0xB54, 0xB58, 0xB5C, 0xB60, 0xB64, 0xB68, 0xB6C, 0xB70],
      down:   [0xAD4, 0xAD8, 0xADC, 0xAE0, 0xAE4, 0xAE8],
      barrel: [0x15C0, 0x15C4, 0x15C8, 0x15CC, 0x15D0, 0x15D4],
    },
    artPalette: { barrel: "barrelPalette" },       // poses drawn in another palette, recoloured
  },
  // Arthur from Super Ghouls 'N Ghosts, in Nightwolf's slot. Pose ids are [tile frame, map] pairs from
  // the SGnG ROM (see sgngart.js); his arrow becomes Arthur's lance.
  arthur: {
    art: "sgng", name: "ARTHUR", setId: 6,          // Nightwolf's graphics set
    fighterId: 3,
    // Nightwolf's own records (the combo records at $E2xx are shared with Sub-Zero and left to DK)
    attacks: [[0xDE06, 52], [0xDEAF, 60], [0xDE13, 47], [0xDDEC, 89], [0xDEA2, 74], [0xDDF9, 71], [0xDE54, 42],
              [0xDE2D, 34], [0xDE3A, 45], [0xDE47, 37], [0xDE95, 78], [0xDE20, 85], [0xDE61, 101], [0xDE6E, 92],
              [0xDE7B, 100], [0xDE88, 101], [0xDEE3, 150]],
    palette: 0x3FDA27, kongPalette: 0x00344F,      // Nightwolf's palette / Arthur's steel armour
    portraitPose: [0x00, 0x26B6], portraitTile: 0xEB,
    vsPose: [0x0A, 0x291E],                         // lance drawn back, ready to throw
    namesEntry: 3, freeTile: 140,
    voice: 0x1011D6, yell: { offset: 0x0357AD, rate: 40250, loopTo: 0, seconds: 0.6 },   // the armour-break crash
    bannerFrame: 15,                                // "NIGHTWOLF WINS"
    scale: 2.8, ground: 46, feetX: 6,
    // Super Ghouls 'N Ghosts (measured): walk 1 px/frame both ways (no running), jump 2.95 px/frame up with
    // gravity 0.125, 1.12 px/frame sideways and no steering once in the air, one double jump of 3.54 up
    physics: { walk: 256, run: 256, ease: 0, vy0: 755, gHold: 32, gRelease: 32, jumpVx: 286, doubleJump: 906, airControl: false },
    effectsFrom: 193,
    moves: [[3, 9, "stand"], [10, 17, "walk"], [18, 18, "stand"], [19, 25, "walk"], [26, 32, "crouch"],
            [33, 37, "crouchAtk"], [38, 42, "upper"], [43, 45, "crouchAtk"], [46, 66, "punch"], [67, 81, "kick"],
            [82, 88, "crouchAtk"], [89, 89, "kick"], [90, 90, "crouch"], [91, 91, "jump"], [92, 92, "kick"],
            [93, 99, "flip"], [100, 101, "kick"], [102, 120, "hurt"], [121, 130, "down"], [131, 132, "crouch"],
            [133, 141, "hurt"], [142, 142, "crouch"], [143, 146, "hurt"], [147, 151, "throwUp"], [152, 153, "magic"],
            [154, 161, "throw"], [162, 167, "hurt"], [168, 169, "charge"], [170, 170, "hurt"], [171, 176, "upper"],
            [177, 180, "hurt"], [181, 181, "down"], [182, 186, "win"], [187, 192, "throw"]],
    // the arrow in flight becomes the lance; the bow that appears in his hand is dropped
    projectile: { list: [211, 212, 213, 214], pose: "lance", scale: 3, budget: 0x600, slot: 0x3FDAA7, slotFrom: 0x021D66 },
    // the hatchet's swing becomes a lance thrown straight up (Arthur's up-throw); same palette slot
    effects: [{ list: [217, 218, 219, 220, 221, 222], pose: "lanceUp", scale: 3 }],
    // the bow in his hand and the shadow copies around the reflect are dropped
    blank: [199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 223, 224, 225, 226],
    anims: [[186, "win", "placed"]],
    special: { frames: [38, 42], pose: "magic" },   // down, down + high punch: magic launcher (custom)
    poses: {
      stand:  [[0x00, 0x26B6]],
      walk:   [[0x01, 0x2300], [0x02, 0x236C], [0x03, 0x23F0], [0x04, 0x2464], [0x05, 0x24C8], [0x06, 0x253C]],
      jump:   [[0x07, 0x25BA], [0x08, 0x2638]],
      flip:   [[0x15, 0x2772], [0x13, 0x27C6], [0x16, 0x3002], [0x17, 0x3046]],
      crouch: [[0x09, 0x272C]],
      crouchAtk: [[0x0C, 0x2A18], [0x0D, 0x2A6C]],
      punch:  [[0x0A, 0x291E], [0x0B, 0x299A]],
      throw:  [[0x0A, 0x291E], [0x0B, 0x299A]],
      kick:   [[0x14, 0x28A0], [0x13, 0x27C6]],
      upper:  [[0x19, 0x3190], [0x1A, 0x31FC]],
      magic:  [[0x19, 0x3190], [0x1A, 0x31FC], [0x1A, 0x326A]],
      block:  [[0x18, 0x309A]],
      hurt:   [[0x16, 0x3002], [0x17, 0x3046]],
      down:   [[0x1B, 0x2AC2]],                   // armour knocked off
      win:    [[0x12, 0x2F8C]],
      lance:  [{ tiles: 0x07BF00, w: 4, h: 1 }],
      lanceUp: [{ tiles: 0x07BF00, w: 4, h: 1, rotate: true }],
      // custom: up-throw (arm raised with the lance over his head) and the lance charge (running, lance levelled)
      throwUp: [[0x19, 0x3190], { base: [0x1A, 0x31FC], add: { tiles: 0x07BF00, w: 4, h: 1, rotate: true }, dx: -13, dy: -58 }],
      charge: [{ base: [0x02, 0x236C], add: { tiles: 0x07BF00, w: 4, h: 1 }, dx: -6, dy: -20 },
               { base: [0x04, 0x2464], add: { tiles: 0x07BF00, w: 4, h: 1 }, dx: -6, dy: -20 }],
    },
  },
  // Mario from Super Mario World, in Liu Kang's slot. Pose ids are [head, body] addresses in SMW's
  // unpacked player graphics (see smwart.js); Liu Kang's fireballs become Mario's fireballs.
  mario: {
    art: "smw", name: "MARIO", setId: 26,           // Liu Kang's graphics set
    fighterId: 13,
    attacks: [],
    palette: 0x3FC2B9,                              // Liu Kang's palette
    // fire Mario: white, black, three shared sprite colours, then his own ten
    kongPalette: [0x7FFF, 0x0000, [0x003282, 3], [0x0032F0, 10]],
    portraitPose: [0x3C00, 0x2000], portraitTile: 0x203,
    vsPose: [0x3D00, 0x20C0],                       // the jump, fist up
    namesEntry: 13, freeTile: 150,
    // the jump sound: SMW's square-wave sample swept up in pitch, as the game plays it
    voice: 0x0FF6F4, yell: { offset: 0x078058, loopTo: 64, rate: 32000, seconds: 0.3,
      pitches: [0xF18, 0x102F, 0x10C2, 0x10F8, 0x116A, 0x11DC, 0x1251, 0x12C6, 0x1347, 0x1386, 0x1404, 0x148B, 0x1524] },
    bannerFrame: 25,                                // "LIU KANG WINS"
    scale: 3, ground: 46, feetX: 6,
    // SMW (measured, 1/16 px a frame there): walk 20, run 36, speed changes 1.5 a frame (1 when letting
    // go), jump 82 up, gravity 3 while the button is held and 6 after, falls at most 70, steerable in the
    // air. Landing on the opponent's head (a stomp) hurts badly and bounces him back up.
    physics: { walk: 320, run: 576, accel: 24, decel: 16, vy0: 1312, gHold: 48, gRelease: 96, maxFall: 1120, airControl: true,
               stomp: { damage: 40, rangeX: 44, above: [60, 104] } },
    effectsFrom: 197,
    moves: [[3, 4, "throw"], [5, 7, "kick"], [8, 12, "kick"], [13, 14, "stand"], [15, 16, "crouch"], [17, 25, "crouchAtk"],
            [26, 28, "crouch"], [29, 38, "flip"], [39, 39, "kick"], [40, 40, "upper"], [41, 42, "kick"], [43, 47, "down"],
            [48, 49, "block"], [50, 56, "kick"], [57, 61, "punch"], [62, 63, "throw"], [64, 65, "jump"], [66, 74, "kick"],
            [75, 81, "hurt"], [82, 83, "down"], [84, 85, "kick"], [86, 91, "punch"], [92, 93, "throw"], [94, 99, "walk"],
            [100, 105, "throw"], [106, 112, "kick"], [113, 119, "stand"], [120, 135, "hurt"], [136, 142, "down"],
            [143, 144, "crouch"], [145, 149, "upper"], [150, 162, "win"], [163, 169, "walk"], [170, 175, "hurt"],
            [176, 180, "stand"], [181, 189, "down"], [190, 196, "crouchAtk"]],
    // Liu Kang's fireball in flight becomes Mario's fireball (its palette slot gets the fireball's colours)
    // a Mario mirror match: player 2 is fire Luigi (Liu Kang's second colour set)
    altPalette: { slot: 0x3FC2D9, from: [0x7FFF, 0x0000, [0x003282, 3], [0x003304, 10]] },
    projectile: { list: [197, 198, 199, 200, 201, 202], pose: "fireball", scale: 4, budget: 0x600, slot: 0x3FC319,
                  slotFrom: [0x7FFF, 0x0000, [0x00329A, 5]] },
    anims: [[162, "win", "placed"]],
    special: { frames: [145, 149], pose: "upper" }, // down, down + high punch: jumping uppercut
    poses: {
      stand:  [[0x3C00, 0x2000]],
      walk:   [[0x3C00, 0x2000], [0x3C00, 0x2040], [0x3C00, 0x2080], [0x3C00, 0x2040]],
      jump:   [[0x3D00, 0x20C0], [0x51C0, 0x5480]],
      flip:   [[0x4100, 0x21C0], [0x3C00, 0x2000], [0x4400, 0x2400], [0x3C00, 0x2040]],   // spin jump
      crouch: [[0x5140, 0x2180]],
      crouchAtk: [[0x5140, 0x2180], [0x3C00, 0x2CC0]],
      punch:  [[0x44C0, 0x48C0], [0x3C00, 0x2000]],
      throw:  [[0x44C0, 0x48C0]],
      kick:   [[0x3C00, 0x2CC0]],
      upper:  [[0x3D00, 0x20C0]],
      block:  [[0x4000, 0x2100]],
      hurt:   [[0x4000, 0x2100], [0x51C0, 0x5480]],
      down:   [[0x6500, 0x6540]],
      win:    [[0x4100, 0x21C0], [0x3D00, 0x20C0]],
      fireball: [{ tile: 0x2C }, { tile: 0x2C, flip: "h" }, { tile: 0x2C, flip: "hv" }, { tile: 0x2C, flip: "v" }],
    },
  },
};

// MK3 addresses shared by every fighter
export const MK3 = {
  descBanks: 0x85ABAA, descAddrs: 0x85ABDE,       // descriptor bank / address per graphics set
  counter: 0x7E1A0A,                              // counts up once per frame
  callSites: [0x06EB05, 0x06EB53],                // "jsl/jml sub_C28000" after a frame pick
  // sprite VRAM a body frame may use (the next $600 hold blood and projectiles)
  bodyBudget: 0x800,
  // Select screen: one 8bpp picture unpacked from $C3:0000 into RAM at $7F:3B00; VRAM tile $10C is
  // at $7F:6E00 and the rest follow in order. Colours 1-127 of the picture are fixed.
  select: { unpackCall: 0x02C217, unpacker: 0x86E41A, fillCall: 0x02C238, filler: 0x82C4DC, source: 0xC30000,
            towerCall: 0x0592DA, towerShift: 0x6300 - 0x3B00,
            // portraits use colours 48-127 only: the tower shows the same picture with those colours moved
            // up by 80 (its colours below 48 are different)
            tileRam: t => 0x7F6E00 + (t - 0x10C) * 64, w: 32, h: 56,
            palette: c => (c < 48 ? null : 0x3F90F4 + 2 * (c - 48)) },
  // Fight name bar: every name is in one strip picture unpacked from $F6:0396 to $7F:5300 (call at
  // $80:FF0A); a table at $80:FF0F gives each name's (first tile, tiles, padding).
  names: { unpackCall: 0x00FF0A, buffer: 0x7F5300, table: 0x00FF0F },
  // Announcer clips stream from ROM (3-byte prefix, then BRR blocks at about 6 kHz)
  voice: { prefix: 3, rate: 6000, table: [0x150F00, 0x151400] },
  // "<NAME> WINS" banners are frames of graphics set 38
  bannerSet: 38,
  bannerDy: 44,   // explicit piece positions in a banner frame land this much higher on screen than its own pieces
  // Attack boxes: 13-byte records in bank $83 (reach, top, width, height as words in game units of
  // 25/16 pixel; top counts from 60 px above the frame origin; then damage/reaction bytes), found via
  // a per-fighter list at $83:D22B. The whole area is copied to bank $7D (whose upper half is only a
  // mirror of bank $3D) and the one routine that sets the bank ($83:D221) points there, so the Kongs'
  // records can be rewritten without touching anyone else's.
  attackData: { bankByte: 0x03D222, copyFrom: 0x03C000, length: 0x4000, newBank: 0x7D, unit: 25 / 16, yBase: 60 },
  // Movement: each frame $83:FC73 adds an object's velocity (x $3B46, y $3BFE; 1/256 px per frame, y down)
  // to its position (x $3CB6.$3D6E, y $3E26.$3EDE), objects indexed by Y (P1 0, P2 2). Walking sets
  // x velocity to +-832 forward / +-576 back, running +-2048; a jump starts with y velocity -2560 and
  // gravity adds 128 per frame. The hook at $83:FC78 (two STZs) rewrites a guest's velocities there.
  physics: { site: 0x03FC78, vx: 0x3B46, vy: 0x3BFE, x: 0x3CB6, y: 0x3E26, health: [0x3634, 0x37F6], ceiling: 20, set: 0x5206, held: 0x35D0, press: 0x35D4, ram: 0xFFA0,
             jumpVy: -2560 + 128, gravity: 128, walk: [832, 576], run: 2048, peak: 96 },   // (gravity, $3F96, is added before the hook)
  // Select screen squares: fighter number (cursor square) -> character at $84:E3D7 (number 7, the "?",
  // is $FF = random); the portrait tile of each square.
  roster: { table: 0x04E3D7, cells: [[0, 0x1E7], [1, 0x13F], [2, 0xCF], [3, 0x97], [4, 0x203], [5, 0xB3], [6, 0x123], [7, 0],
                                     [8, 0x107], [9, 0x177], [10, 0x15B], [11, 0xEB], [12, 0x1CB], [13, 0x193], [14, 0x1AF]] },
  // "Battle" screen pictures: per fighter (names entry) a bank ($80:F414), packed 6bpp tiles ($80:F432), packed
  // 32x32 tile map ($80:F450), raw 64-colour palette ($80:F46E) and tile count ($80:F3F6). Each is unpacked by
  // $86:E41A from three call sites; those go through a wrapper that copies data stored unpacked (in banks below
  // $80, i.e. ours) and hands everything else to the unpacker. The picture fills at most 16 x 22 tiles.
  vs: { bank: 0x00F414, tiles: 0x00F432, map: 0x00F450, pal: 0x00F46E, count: 0x00F3F6,
        calls: [0x00EBF5, 0x00EC1F, 0x00ECC3], unpacker: 0x86E41A, cols: 16, rows: 22 },
  // New moves: down, down + high punch runs the fighter's uppercut with the Kong's own frames
  special: { padCall: 0x00888E, pads: 0x878000, newPress: 0x7E35D4, animStart: 0x06BCF7, animInit: 0x86DC30,
             uppercutAnim: 0x0B, window: 30, ram: 0x7EFFC0 },
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
export function kongPortrait(mk3, pose, dk, sel) {
  const rgb = w => [(w & 31) << 3, ((w >> 5) & 31) << 3, ((w >> 10) & 31) << 3];
  // colours 128+ are sprite colours that change with the cursor, so only 1-127 are used
  const pal = []; for (let c = 1; c < 128; c++) if (c % 16) { const o = sel.palette(c); if (o != null) pal.push([c, rgb(mk3[o] | (mk3[o + 1] << 8))]); }
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
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
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
export function kongVoice(mk3, dkc, yell, V) {
  let src = brrDecode(dkc, yell.offset).map(x => x * 2);   // decoder output is 15-bit
  if (yell.pitches) {   // a looping sample played at a pitch that changes every frame (60 a second)
    const out = [], loop = yell.loopTo || 0, n = Math.round(yell.seconds * yell.rate); let ph = 0;
    for (let i = 0; i < n; i++) {
      const f = Math.min(yell.pitches.length - 1, Math.floor(i * 60 / yell.rate));
      ph += yell.pitches[f] / 4096 * 32000 / yell.rate;
      while (ph >= src.length) ph -= src.length - loop;
      out.push(Math.round(src[Math.floor(ph)] * Math.min(1, 1.6 * (1 - i / n))));
    }
    src = out;
  } else if (yell.seconds) {   // a short looping sample: play the loop for a while, fading out
    const n = Math.round(yell.seconds * yell.rate), loop = src.slice(yell.loopTo || 0), out = src.slice();
    while (out.length < n) out.push(...loop);
    src = out.slice(0, n).map((x, i) => Math.round(x * Math.min(1, 1.6 * (1 - i / n))));
  }
  const ref = brrDecode(mk3, V.offset).map(x => x * 2);
  const peak = a => a.reduce((m, x) => Math.max(m, Math.abs(x)), 1);
  const gain = Math.min(4, peak(ref) / peak(src));
  const n = Math.floor(src.length * V.rate / yell.rate), pcm = [];
  for (let i = 0; i < n; i++) { const t = i * yell.rate / V.rate, k = Math.floor(t), f = t - k;   // linear interpolation
    pcm.push(Math.round(((src[k] || 0) * (1 - f) + (src[k + 1] || 0) * f) * gain)); }
  // silence to the end: the game streams the clip's whole length, so nothing of the old one may remain
  while (pcm.length < V.blocks * 16) pcm.push(0);
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


const rgbOf = w => [(w & 31) << 3, ((w >> 5) & 31) << 3, ((w >> 10) & 31) << 3];
const paletteAt = (rom, o) => { const p = []; for (let i = 0; i < 16; i++) p.push(rgbOf(rom[o + i * 2] | (rom[o + i * 2 + 1] << 8))); return p; };
// Redraw an indexed image from one palette into the nearest colours of another.
function recolour(img, from, to) {
  const map = from.map((c, i) => { if (!i) return 0; let best = 1, bd = 1e9;
    for (let j = 1; j < 16; j++) { const d = (c[0] - to[j][0]) ** 2 + (c[1] - to[j][1]) ** 2 + (c[2] - to[j][2]) ** 2; if (d < bd) { bd = d; best = j; } } return best; });
  return { ...img, data: img.data.map(v => map[v]) };
}

// Returns a new 8 MB ROM with the given Kongs (keys of KONGS) in place of their fighters.
// The art sources a recipe draws from: Donkey Kong Country (default) or Super Ghouls 'N Ghosts.
// A palette spec is a file offset (16 colours there), a DKC palette name, or (SMW) a list of parts.
function artSource(K, roms) {
  const bytesAt = (rom, o) => Uint8Array.from(rom.subarray(o, o + 32));
  if (K.art === "smw") {
    if (!roms.smw) throw new Error(K.name + " needs the Super Mario World ROM");
    return { rom: roms.smw, pose: id => smwPose(roms.smw, id), pal: v => Array.isArray(v) ? smwPalette(roms.smw, v) : bytesAt(roms.smw, v) };
  }
  if (K.art === "sgng") {
    if (!roms.sgng) throw new Error(K.name + " needs the Super Ghouls 'N Ghosts ROM");
    return { rom: roms.sgng, pose: id => sgngPose(roms.sgng, id), pal: v => bytesAt(roms.sgng, v) };
  }
  if (!roms.dkc) throw new Error(K.name + " needs the Donkey Kong Country ROM");
  return { rom: roms.dkc, pose: id => dkPose(roms.dkc, DKC.frameTable, id), pal: v => bytesAt(roms.dkc, typeof v === "string" ? DKC[v] : v) };
}
const rgbPal = b => { const p = []; for (let i = 0; i < 16; i++) p.push(rgbOf(b[i * 2] | (b[i * 2 + 1] << 8))); return p; };

// Returns a new 8 MB ROM with the given characters (keys of KONGS) in place of their fighters.
// roms: { dkc, sgng } (or just the DKC ROM, as before); characters whose game is missing are skipped.
export function buildKongsMk3(mk3Rom, roms, which = null, kongs = KONGS, opts = {}) {
  if (roms instanceof Uint8Array) roms = { dkc: roms };
  which = (which || Object.keys(kongs)).filter(k => roms[kongs[k].art || "dkc"]);
  const rom = expandExHiROM(mk3Rom);
  const mirror = o => { const b = o >> 16, a = o & 0xFFFF; if (a >= 0x8000 && b < 0x40) rom[0x400000 + o] = rom[o]; };
  const lo = v => v & 0xFF, hi = v => (v >> 8) & 0xFF, L = (v, n = 3) => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF].slice(0, n);
  const r16 = o => mk3Rom[o] | (mk3Rom[o + 1] << 8);
  const T = 0x40; let q = 0, bank = 0x41;
  const put = bytes => { const a = q; rom.set(bytes, exOff(T, q)); q += bytes.length; if (q > 0x8000) throw new Error("table bank full"); return a; };
  const patchCall = (site, target, to) => {
    if (mk3Rom[site] !== 0x22 && mk3Rom[site] !== 0x5C) throw new Error("unexpected code at " + site.toString(16));
    if ((mk3Rom[site + 1] | (mk3Rom[site + 2] << 8) | (mk3Rom[site + 3] << 16)) !== target) throw new Error("unexpected call at " + site.toString(16));
    rom[site + 1] = lo(to); rom[site + 2] = hi(to); rom[site + 3] = T; [1, 2, 3].forEach(k => mirror(site + k));
  };
  const descOf = setId => off((mk3Rom[off(MK3.descBanks + setId)] << 16) | r16(off(MK3.descAddrs + setId)));
  const setDesc = (setId, at) => { const ba = off(MK3.descBanks + setId), aa = off(MK3.descAddrs + setId);
    rom[ba] = T; rom[ba + 1] = 0; rom[aa] = lo(at); rom[aa + 1] = hi(at); [ba, ba + 1, aa, aa + 1].forEach(mirror); };
  const setPalette = (dst, bytes) => { for (let i = 2; i < 32; i++) { rom[dst + i] = bytes[i]; mirror(dst + i); } };
  const stats = {};
  const animEntries = [], specials = [], attackJobs = [];
  let animBank = 0, ap = 0;
  const animPut = bytes => { if (!animBank || ap + bytes.length > 0x8000) { animBank = bank++; ap = 0; } const a = ap; rom.set(bytes, exOff(animBank, ap)); ap += bytes.length; return [animBank, a]; };

  for (const key of which) {
    const K = kongs[key], dOff = descOf(K.setId), A = artSource(K, roms);
    const tt = (mk3Rom[dOff + 4] << 16) | r16(dOff + 2), fbank = mk3Rom[dOff + 7];
    const ft = (fbank << 16) | r16(dOff + 5), bt = (fbank << 16) | r16(dOff);
    const aux = (mk3Rom[dOff + 11] << 16) | r16(dOff + 12), recipe = { tileTable: tt, aux62: aux + 1, aux66: aux + 16 };
    const count = (bt - ft) >> 1, frameAddr = i => (mk3Rom[off(bt) + (i >> 6)] << 16) | r16(off(ft) + i * 2);
    // the fighter's own tile table entries stay; the Kong's go after the last one in use
    let tileEntries = 0;
    for (let i = 0; i < count; i++) { const p0 = off(frameAddr(i)); let p = p0 + 2; const total = mk3Rom[p0], n16 = mk3Rom[p0 + 1];
      for (let k = 0; k < total; k++) { const c = mk3Rom[p++]; if (!(c & 0xF0)) p++; if (!(c & 0x0F)) p++; const nw = k < n16 ? 4 : 1;
        for (let j = 0; j < nw; j++) tileEntries = Math.max(tileEntries, ((mk3Rom[p + j * 2] & 0xFC) >> 2) + 1); p += nw * 2; } }

    // poses: every pose at the Kong's size, shrunk only if that one pose would not fit its VRAM budget
    const kongPal = rgbPal(A.pal(K.kongPalette)), poses = {};
    for (const [cat, ids] of Object.entries(K.poses)) {
      const fx = [K.projectile, ...(K.effects || [])].find(e => e && e.pose === cat);
      const budget = fx ? fx.budget || 0x600 : MK3.bodyBudget;
      const start = fx ? fx.scale : K.scale;
      poses[cat] = ids.map(id => {
        let img = A.pose(id);
        if (K.artPalette && K.artPalette[cat]) img = recolour(img, rgbPal(A.pal(K.artPalette[cat])), kongPal);
        for (let s = start; ; s -= 0.05) { const pc = pieces(scaled(img, s)); if (vramEnd(mk3Rom, pc.big.length, pc.small.length) <= budget || s < 0.8) return pc; }
      });
    }
    // tiles: deduplicated, 256 per table entry
    const tiles = [], tileIndex = new Map();
    const tileWord = t => { const k = t.join(","); let i = tileIndex.get(k); if (i === undefined) { i = tiles.length; tiles.push(t); tileIndex.set(k, i); }
      return (((i & 0xFF) << 8) | ((tileEntries + (i >> 8)) * 4)); };
    // each pose's drawn pixels, relative to its feet (for the hit box)
    const bounds = pc => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const c of pc.big) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (c.px[y * 16 + x]) { x0 = Math.min(x0, c.x + x); x1 = Math.max(x1, c.x + x); y0 = Math.min(y0, c.y + y); y1 = Math.max(y1, c.y + y); }
      for (const c of pc.small) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (c.px[(c.qy + y) * 16 + c.qx + x]) { x0 = Math.min(x0, c.x + x); x1 = Math.max(x1, c.x + x); y0 = Math.min(y0, c.y + y); y1 = Math.max(y1, c.y + y); }
      return { x0, y0, x1, y1 }; };
    const poseBounds = {}; for (const [cat, list] of Object.entries(poses)) poseBounds[cat] = list.map(bounds);
    const poseWords = {};
    for (const [cat, list] of Object.entries(poses)) poseWords[cat] = list.map(pc => [
      ...pc.big.map(c => ({ big: true, x: c.x, y: c.y, w: [tileWord(tileBytes(c.px, 0, 0)), tileWord(tileBytes(c.px, 8, 0)), tileWord(tileBytes(c.px, 0, 8)), tileWord(tileBytes(c.px, 8, 8))] })),
      ...pc.small.map(c => ({ big: false, x: c.x, y: c.y, w: [tileWord(tileBytes(c.px, c.qx, c.qy))] }))]);
    const blankWord = K.blank ? tileWord(new Uint8Array(32)) : 0;   // frames drawn as nothing
    const entries = Math.ceil(tiles.length / 256);
    if (tileEntries + entries > 64) throw new Error(key + ": too many tiles");
    const table = new Uint8Array(256);
    table.set(mk3Rom.subarray(off(tt), off(tt) + tileEntries * 4));
    let slot = 0;
    for (let e = 0; e < entries; e++) {
      const a = slot * 0x2000;
      tiles.slice(e * 256, e * 256 + 256).forEach((t, i) => rom.set(t, exOff(bank, a + i * 32)));
      const k = (tileEntries + e) * 4; table[k] = lo(a); table[k + 1] = hi(a); table[k + 2] = bank; table[k + 3] = 0;
      if (++slot === 4) { slot = 0; bank++; }
    }
    if (slot) bank++;

    // a frame stream per frame number; every group of 64 shares a bank
    // projectile and effect frames: drawn centred where the original was (not a body, no hit box)
    const P = K.projectile, isIn = (e, n) => e && (e.list ? e.list.includes(n) : n >= e.frames[0] && n <= e.frames[1]);
    const fxOf = n => isIn(P, n) ? P : (K.effects || []).find(e => isIn(e, n));
    const addrs = new Uint16Array(count), banks = [], counters = {}, placed = {}, boxes = {};
    let replaced = 0, kept = 0;
    for (let g = 0; g * 64 < count; g++, bank++) {
      banks.push(bank); let p = 0;
      for (let i = g * 64; i < Math.min(count, g * 64 + 64); i++) {
        const n = i + 1, orig = frameAddr(i);
        let b = null;
        try { const f = buildFrame(mk3Rom, recipe, orig), c = compose(f); b = { ...c, tiles: f.n16 * 4 + f.n8 }; } catch { b = null; }
        const fxN = b && fxOf(n), proj = !!fxN;
        let cat = proj ? fxN.pose : b && n < K.effectsFrom && category(b, K.ground);
        const mv = cat && !proj && K.moves.find(([a, z]) => n >= a && n <= z);
        if (mv) cat = mv[2] === "hurt" && cat === "down" ? "down" : mv[2];
        if (cat && !poseWords[cat]) cat = poseWords.attack && cat === "lunge" ? "attack" : "stand";
        let bytes;
        if (K.blank && K.blank.includes(n)) { bytes = stream([{ x: 0, y: 0, w: [blankWord] }], K.feetX, K.ground); replaced++; }
        else if (!cat) { const o = off(orig); bytes = mk3Rom.subarray(o, o + streamLength(mk3Rom, orig)); kept++; }
        else {
          const list = poseWords[cat], k = counters[cat] = (counters[cat] || 0) + 1, pose = list[k % list.length], pb = poseBounds[cat][k % list.length];
          const grounded = !["jump", "roll", "flip", "hurt", "down", "cartwheel"].includes(cat) && b.oy + b.h >= K.ground - 6;
          let feetX = grounded ? K.feetX : Math.round(b.ox + b.w / 2), feetY = Math.min(K.ground, b.oy + b.h);
          if (proj) {   // centred on the projectile (at its leading end for long trails)
            const top = Math.min(...pose.map(c => c.y));
            feetX = fxN.lead ? b.ox + b.w - 24 : Math.round(b.ox + b.w / 2); feetY = Math.round(b.oy + b.h / 2 - top / 2);
          }
          placed[n] = { feetX, feetY };
          if (!proj) boxes[n] = [feetX + pb.x0, feetX + pb.x1 + 1, feetY + pb.y0, feetY + pb.y1 + 1];
          bytes = stream(pose, feetX, feetY); replaced++;
        }
        if (p + bytes.length > 0x8000) throw new Error("frame bank full");
        rom.set(bytes, exOff(bank, p)); addrs[i] = p; p += bytes.length;
      }
    }
    // held frames animated by the hook (8 streams each)
    for (const [frame, cat, where] of K.anims || []) {
      const at = where === "stand" ? { feetX: K.feetX, feetY: K.ground } : placed[frame];
      if (!at || !poseWords[cat]) continue;
      const list = poseWords[cat], streams = []; let sb = 0;
      for (let k = 0; k < 8; k++) { const [bk, a] = animPut(stream(list[k % list.length], at.feetX, at.feetY)); if (sb && bk !== sb) throw new Error("anim bank split"); sb = bk; streams.push(a); }
      animEntries.push({ addr: addrs[frame - 1], bank: banks[(frame - 1) >> 6], streamBank: sb, streams });
    }
    // the new move's frames
    if (K.special && poseWords[K.special.pose]) {
      const list = poseWords[K.special.pose], [a0, a1] = K.special.frames, streams = []; let sb = 0;
      for (let k = 0; k <= a1 - a0; k++) { const [bk, a] = animPut(stream(list[Math.floor(k * list.length / (a1 - a0 + 1))], K.feetX, K.ground)); if (sb && bk !== sb) throw new Error("special bank split"); sb = bk; streams.push(a); }
      specials.push({ setId: K.setId, frames: K.special.frames, streamBank: sb, streams });
    }
    // descriptor copy
    const tableAt = put(table), framesAt = put(new Uint8Array(addrs.buffer)), banksAt = put(Uint8Array.from([...banks, 0, 0]));
    // hit boxes: the game keeps one per frame number (left, right, top, bottom as signed bytes, at
    // descriptor +14 in the bank at +8); the Kong's frames get boxes around their own art. That
    // bank is shared with the fighter's overlay table (+9), which the Kongs don't use.
    const boxAddr = (mk3Rom[dOff + 8] << 16) | r16(dOff + 14), boxTable = Uint8Array.from(mk3Rom.subarray(off(boxAddr), off(boxAddr) + count * 4));
    const sb = v => Math.max(-128, Math.min(127, Math.round(v))) & 0xFF;
    for (const [n, b] of Object.entries(boxes)) boxTable.set(b.map(sb), (n - 1) * 4);
    const boxAt = put(boxTable);
    const desc = Uint8Array.from(mk3Rom.subarray(dOff, dOff + 16));
    desc[8] = T; desc[9] = 0xFF; desc[10] = 0xFF; desc[14] = lo(boxAt); desc[15] = hi(boxAt);
    desc[0] = lo(banksAt); desc[1] = hi(banksAt); desc[2] = lo(tableAt); desc[3] = hi(tableAt); desc[4] = T;
    desc[5] = lo(framesAt); desc[6] = hi(framesAt); desc[7] = T;
    setDesc(K.setId, put(desc));
    // colours
    setPalette(K.palette, A.pal(K.kongPalette));
    if (P && P.slot) setPalette(P.slot, A.pal(P.slotFrom));
    if (K.altPalette) setPalette(K.altPalette.slot, A.pal(K.altPalette.from));
    stats[key] = { replaced, kept, tiles: tiles.length };
    attackJobs.push({ K, recipe, frameAddr, boxes });
  }

  // ---- frame hook: new-move frames, then animated held frames ----
  const SP = MK3.special, LAST = SP.ram, DD = SP.ram + 4, FLAG = SP.ram + 8, cnt = MK3.counter;
  const hook = [], lbl = {}, fix = [];
  // conditional branch to a label, as the opposite branch over a BRL so any distance works
  const br = (op, l) => { hook.push(op ^ 0x20, 3, 0x82, 0, 0); fix.push([hook.length - 2, l]); };
  const toC28000 = () => hook.push(0x5C, 0x00, 0x80, 0x82);
  hook.push(0xBF, ...L(FLAG)); br(0xF0, "anims");                         // lda f:FLAG,x / beq anims
  specials.forEach((s, k) => {
    const tableAt = put(new Uint8Array(Uint16Array.from(s.streams).buffer));
    hook.push(0xC9, k + 1, 0x00); br(0xD0, "sp" + (k + 1));                // cmp #k+1 / bne next special
    hook.push(0xBF, 0x06, 0x52, 0x7E, 0x29, 0xFF, 0x01, 0x38, 0xE9, s.frames[0], 0x00,
              0xC9, s.frames[1] - s.frames[0] + 1, 0x00); br(0xB0, "clear");   // frame - first < count ?
    hook.push(0x0A, 0xDA, 0xAA, 0xBF, lo(tableAt), hi(tableAt), T, 0xFA,
              0x9F, 0x8A, 0x24, 0x7E, 0xA9, s.streamBank, 0x00, 0x9F, 0xA2, 0x24, 0x7E); toC28000();
    lbl["sp" + (k + 1)] = hook.length;
  });
  lbl.clear = hook.length; hook.push(0xA9, 0x00, 0x00, 0x9F, ...L(FLAG));  // not in the move any more
  lbl.anims = hook.length;
  animEntries.forEach((a, k) => {
    const tableAt = put(new Uint8Array(Uint16Array.from(a.streams).buffer));
    hook.push(0xBF, 0x8A, 0x24, 0x7E, 0xC9, lo(a.addr), hi(a.addr)); br(0xD0, "an" + k);
    hook.push(0xBF, 0xA2, 0x24, 0x7E, 0x29, 0xFF, 0x00, 0xC9, a.bank, 0x00); br(0xD0, "an" + k);
    hook.push(0xAF, ...L(cnt), 0x4A, 0x29, 0x0E, 0x00, 0xDA, 0xAA, 0xBF, lo(tableAt), hi(tableAt), T, 0xFA,
              0x9F, 0x8A, 0x24, 0x7E, 0xA9, a.streamBank, 0x00, 0x9F, 0xA2, 0x24, 0x7E,
              0xA9, 0x00, 0x00, 0x9F, 0xBE, 0x52, 0x7E); toC28000();          // redraw next frame
    lbl["an" + k] = hook.length;
  });
  toC28000();
  for (const [at, l] of fix) { const d = lbl[l] - (at + 2); hook[at] = d & 0xFF; hook[at + 1] = (d >> 8) & 0xFF; }
  const hookAt = put(Uint8Array.from(hook));
  for (const site of MK3.callSites) patchCall(site, 0x828000, hookAt);

  // ---- new moves: remember a second Down press; an uppercut started right after it is the move ----
  if (specials.length) {
    const pad = [0x22, ...L(SP.pads), 0x08, 0xC2, 0x30, 0x48, 0xDA, 0xA2, 0x00, 0x00,
      0xBF, ...L(SP.newPress), 0x29, 0x00, 0x04, 0xF0, 0x1E,
      0xAF, ...L(cnt), 0x38, 0xFF, ...L(LAST), 0xC9, SP.window, 0x00, 0xB0, 0x08,
      0xAF, ...L(cnt), 0x9F, ...L(DD),
      0xAF, ...L(cnt), 0x9F, ...L(LAST),
      0xE8, 0xE8, 0xE0, 0x04, 0x00, 0xD0, 0xD2,
      0xFA, 0x68, 0x28, 0x6B];
    patchCall(SP.padCall, SP.pads, put(Uint8Array.from(pad)));
    // animation start: uppercut of a Kong's object, Down tapped twice just before -> flag = move number
    const an = [], al = {}, af = [];
    const abr = (op, l) => { an.push(op, 0); af.push([an.length - 1, l]); };
    an.push(0x08, 0xC2, 0x30, 0x48, 0xDA, 0x8F, 0xD0, 0xFF, 0x7E, 0xC9, SP.uppercutAnim, 0x00); abr(0xD0, "done");   // (last anim id kept at $7EFFD0 for testing)
    an.push(0xA5, 0x2A, 0xC9, 0x04, 0x00); abr(0xB0, "done"); an.push(0xAA);   // fighters only (objects 0 and 2)
    an.push(0xA9, 0x00, 0x00, 0x9F, ...L(FLAG));
    an.push(0xAF, ...L(cnt), 0x38, 0xFF, ...L(DD), 0xC9, SP.window, 0x00); abr(0xB0, "done");
    an.push(0xBF, 0x06, 0x52, 0x7E, 0x29, 0x00, 0xFE);                        // this object's graphics set
    specials.forEach((s, k) => { an.push(0xC9, 0x00, s.setId); abr(0xD0, "s" + k); an.push(0xA9, k + 1, 0x00, 0x9F, ...L(FLAG)); abr(0x80, "done"); al["s" + k] = an.length; });
    al.done = an.length; an.push(0xFA, 0x68, 0x28, 0x22, ...L(SP.animInit), 0x6B);
    for (const [at, l] of af) an[at] = (al[l] - (at + 1)) & 0xFF;
    patchCall(SP.animStart, SP.animInit, put(Uint8Array.from(an)));
  }

  // ---- select-screen portraits: copied over the unpacked picture, and again after the game's pass ----
  const S = MK3.select, ports = which.map(k => { const K = kongs[k], A = artSource(K, roms), tiles = kongPortrait(mk3Rom, A.pose(K.portraitPose), rgbPal(A.pal(K.kongPalette)), S);
    return { tiles, at: put(tiles), ram: S.tileRam(K.portraitTile), K }; });
  // ---- guests only: every square of the select screen picks a guest (the fighter-number -> character
  // table at $84:E3D7), and shows that guest's portrait ----
  if (opts.guestsOnly !== false && ports.length) {
    const R = MK3.roster, own = new Set(ports.map(p => p.K.fighterId)); let k = 0;
    R.cells.forEach(([num, tile]) => {
      const cur = mk3Rom[R.table + num];
      if (own.has(cur)) return;                                   // a guest's own square
      const p = ports[k++ % ports.length];
      rom[R.table + num] = p.K.fighterId; mirror(R.table + num);
      if (tile) ports.push({ tiles: p.tiles, at: p.at, ram: S.tileRam(tile), K: p.K });
    });
  }
  const mvn = p => [0x8B, 0xDA, 0x5A, 0xA2, lo(p.at), hi(p.at), 0xA0, lo(p.ram), hi(p.ram), 0xA9, lo(p.tiles.length - 1), hi(p.tiles.length - 1), 0x54, p.ram >> 16, T, 0x7A, 0xFA, 0xAB];
  {
    const w = [0xA5, 0x7C, 0x48, 0xA5, 0x7A, 0x48, 0x22, ...L(S.unpacker), 0xC2, 0x30, 0x48,
      0xA3, 0x03, 0xC9, lo(S.source), hi(S.source)];
    // every copy in one routine (there can be many squares), called from both places below
    const copyAt = put(Uint8Array.from([...ports.flatMap(mvn), 0x6B])), body = [0x22, lo(copyAt), hi(copyAt), T];
    // guests only: the characters under the starting cursors (squares 0 and 4) come from the table too
    // (otherwise picking without moving gives whoever was left in $51D6/$51D8 from the attract mode)
    const firstBody = opts.guestsOnly !== false
      ? [0xA9, rom[MK3.roster.table], 0x00, 0x8F, ...L(0x7E51D6), 0xA9, rom[MK3.roster.table + 4], 0x00, 0x8F, ...L(0x7E51D8), ...body] : body;
    w.push(0xD0, 0x0A + firstBody.length, 0xA3, 0x05, 0x29, 0xFF, 0x00, 0xC9, S.source >> 16, 0x00, 0xD0, firstBody.length, ...firstBody,
      0xA3, 0x01, 0x83, 0x05, 0x68, 0x68, 0x68, 0x6B);
    if (firstBody.length + 0x0A > 127) throw new Error("portrait copy too long");
    patchCall(S.unpackCall, S.unpacker, put(Uint8Array.from(w)));
    // after the game's own pass over the picture: copy again if the buffer held our tiles before it
    const K0 = 10 * 64, p0 = ports[0], tag = p0.at + K0, ram = p0.ram + K0;
    const f = [0xC2, 0x30, 0x48, 0xDA, 0xA9, 0x00, 0x00, 0x48,
      0xAF, ...L(ram), 0xCF, lo(tag), hi(tag), T, 0xD0, 0x0F,
      0xAF, ...L(ram + 2), 0xCF, lo(tag + 2), hi(tag + 2), T, 0xD0, 0x05,
      0xA9, 0x01, 0x00, 0x83, 0x01,
      0xA3, 0x03, 0xAA, 0xA3, 0x05, 0x22, ...L(S.filler), 0xC2, 0x30, 0x68, 0xF0, body.length, ...body,
      0x68, 0x68, 0x6B];
    patchCall(S.fillCall, S.filler, put(Uint8Array.from(f)));
    // the 1-player tower unpacks the same picture to $7F:6300 and takes its small portraits from it
    const towerCopy = put(Uint8Array.from([...ports.flatMap(p => mvn({ ...p, ram: p.ram + S.towerShift })), 0x6B]));
    patchCall(S.towerCall, S.unpacker, put(Uint8Array.from([0x22, ...L(S.unpacker), 0x08, 0xC2, 0x30, 0x48, 0x22, lo(towerCopy), hi(towerCopy), T, 0x68, 0x28, 0x6B])));
  }

  // ---- fight name bar ----
  {
    const N = MK3.names, strips = which.map(k => { const K = kongs[k], s = nameStrip(K.name); return { at: put(s), len: s.length, dst: N.buffer + K.freeTile * 16, K }; });
    const nw = [0x22, ...L(S.unpacker), 0xC2, 0x30, 0x8B, 0xDA, 0x5A];
    for (const s of strips) nw.push(0xA2, lo(s.at), hi(s.at), 0xA0, lo(s.dst), hi(s.dst), 0xA9, lo(s.len - 1), hi(s.len - 1), 0x54, s.dst >> 16, T);
    nw.push(0x7A, 0xFA, 0xAB, 0x6B);
    patchCall(N.unpackCall, S.unpacker, put(Uint8Array.from(nw)));
    for (const s of strips) { const e = N.table + s.K.namesEntry * 3; rom[e] = s.K.freeTile; rom[e + 1] = 10; rom[e + 2] = 0; [0, 1, 2].forEach(k => mirror(e + k)); }
  }

  // ---- announcer clips ----
  // (each clip's length comes from its record in the clip table: length word, then the 24-bit pointer)
  for (const k of which) {
    const K = kongs[k], ptr = K.voice + 0xC00000, T2 = MK3.voice.table;
    let at = -1; for (let o = T2[0]; o < T2[1]; o++) if (mk3Rom[o] === (ptr & 0xFF) && mk3Rom[o + 1] === ((ptr >> 8) & 0xFF) && mk3Rom[o + 2] === ptr >> 16) { at = o; break; }
    if (at < 0) throw new Error(K.name + ": voice clip not in the clip table");
    const len = mk3Rom[at - 2] | (mk3Rom[at - 1] << 8);
    const V = { ...MK3.voice, offset: K.voice + MK3.voice.prefix, blocks: Math.floor((len - MK3.voice.prefix) / 9) };
    rom.set(kongVoice(mk3Rom, artSource(K, roms).rom, K.yell, V), V.offset);
  }

  // ---- "<NAME> WINS" banners: frames of set 38 repainted, set 38's descriptor copied ----
  {
    const setId = MK3.bannerSet, dOff2 = descOf(setId);
    const tt = (mk3Rom[dOff2 + 4] << 16) | r16(dOff2 + 2), ftb = mk3Rom[dOff2 + 7];
    const ft = (ftb << 16) | r16(dOff2 + 5), bt = (ftb << 16) | r16(dOff2);
    const count = (bt - ft) >> 1, frameAddr = i => (mk3Rom[off(bt) + (i >> 6)] << 16) | r16(off(ft) + i * 2);
    let maxEntry = 0;
    for (let i = 0; i < count; i++) { const p0 = off(frameAddr(i)); let p = p0 + 2; const total = mk3Rom[p0], n16 = mk3Rom[p0 + 1];
      for (let k = 0; k < total; k++) { const c = mk3Rom[p++]; if (!(c & 0xF0)) p++; if (!(c & 0x0F)) p++; const nw = k < n16 ? 4 : 1;
        for (let j = 0; j < nw; j++) maxEntry = Math.max(maxEntry, (mk3Rom[p + j * 2] & 0xFC) >> 2); p += nw * 2; } }
    const entry = maxEntry + 1; if (entry > 63) throw new Error("banner set has no free tile entry");
    const aux = (mk3Rom[dOff2 + 11] << 16) | r16(dOff2 + 12), rc = { tileTable: tt, aux62: aux + 1, aux66: aux + 16 };
    const btiles = [], word = t => { btiles.push(t); return (((btiles.length - 1) << 8) | (entry * 4)); };
    const copies = {};
    for (const k of which) {
      // The guest's own banner: "<NAME> WINS" drawn here, cut into 16x16 pieces and laid out where the
      // original banner sits (its own pieces have gaps where the original words had spaces)
      const K = kongs[k], origAddr = frameAddr(K.bannerFrame - 1), orig = buildFrame(mk3Rom, rc, origAddr);
      const big16 = orig.pieces.filter(p => p.size === 16), x0 = Math.min(...orig.pieces.map(p => p.x)), x1 = Math.max(...orig.pieces.map(p => p.x + p.size));
      const y0 = Math.min(...(big16.length ? big16 : orig.pieces).map(p => p.y));
      const t = bannerText(K.name + " WINS"), left = Math.round((x0 + x1) / 2 - t.w / 2), pcs = [], yb = y0 + MK3.bannerDy;
      // (one 16x16 piece first, then 8x8 ones: the text is only 11 px tall and banners get little sprite
      // memory, and a frame made only of 8x8 pieces is placed differently by the game)
      { const px = new Uint8Array(256);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x < t.w && y < t.h) px[y * 16 + x] = t.data[y * t.w + x];
        pcs.push({ big: true, x: left, y: yb, w: [word(tileBytes(px, 0, 0)), word(tileBytes(px, 8, 0)), word(tileBytes(px, 0, 8)), word(tileBytes(px, 8, 8))] }); }
      for (let cy = 0; cy < t.h; cy += 8) for (let cx = 16; cx < t.w; cx += 8) {
        const px = new Uint8Array(256); let any = false;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const X = cx + x, Y = cy + y; if (X < t.w && Y < t.h) { const v = t.data[Y * t.w + X]; px[y * 16 + x] = v; if (v) any = true; } }
        if (any) pcs.push({ big: false, x: left + cx, y: yb + cy, w: [word(tileBytes(px, 0, 0))] });
      }
      copies[K.bannerFrame] = stream(pcs, 0, 0);
    }
    if (btiles.length > 256) throw new Error("banner tiles");
    const bBank = bank++; let bp = 0;
    btiles.forEach(t => { rom.set(t, exOff(bBank, bp)); bp += 32; });
    const table2 = new Uint8Array(256); table2.set(mk3Rom.subarray(off(tt), off(tt) + entry * 4));
    table2[entry * 4] = 0; table2[entry * 4 + 1] = 0; table2[entry * 4 + 2] = bBank; table2[entry * 4 + 3] = 0;
    const addrs2 = new Uint16Array(count), banks2 = [];
    for (let g = 0; g * 64 < count; g++) banks2.push(g === 0 ? bBank : mk3Rom[off(bt) + g]);
    for (let i = 0; i < count; i++) {
      if (i >= 64) { addrs2[i] = r16(off(ft) + i * 2); continue; }
      const bytes = copies[i + 1] || mk3Rom.subarray(off(frameAddr(i)), off(frameAddr(i)) + streamLength(mk3Rom, frameAddr(i)));
      rom.set(bytes, exOff(bBank, bp)); addrs2[i] = bp; bp += bytes.length;
      if (bp > 0x8000) throw new Error("banner bank full");
    }
    const tAt = put(table2), fAt = put(new Uint8Array(addrs2.buffer)), bAt = put(Uint8Array.from([...banks2, 0, 0]));
    const desc2 = Uint8Array.from(mk3Rom.subarray(dOff2, dOff2 + 16));
    desc2[0] = lo(bAt); desc2[1] = hi(bAt); desc2[2] = lo(tAt); desc2[3] = hi(tAt); desc2[4] = T; desc2[5] = lo(fAt); desc2[6] = hi(fAt); desc2[7] = T;
    setDesc(setId, put(desc2));
  }

  // ---- attack boxes: each Kong's records follow his own fists and feet ----
  {
    const A = MK3.attackData, dst = 0x400000 + (A.newBank - 0x40) * 0x10000 + (A.copyFrom & 0xFFFF);
    rom.set(mk3Rom.subarray(A.copyFrom, A.copyFrom + A.length), dst);
    if (mk3Rom[A.bankByte] !== 0x83) throw new Error("unexpected attack bank code");
    rom[A.bankByte] = A.newBank; mirror(A.bankByte);
    const u = A.unit, s16 = v => (v << 16) >> 16;
    for (const { K, recipe, frameAddr, boxes } of attackJobs) for (const [rec, frame] of K.attacks || []) {
      const kb = boxes[frame]; if (!kb) continue;
      let ob; try { const c = compose(buildFrame(mk3Rom, recipe, frameAddr(frame - 1))); ob = [c.ox, c.ox + c.w, c.oy, c.oy + c.h]; } catch { continue; }
      const o = 0x030000 + rec, w = i => s16(mk3Rom[o + i * 2] | (mk3Rom[o + i * 2 + 1] << 8));
      const [x, y, wd, ht] = [w(0), w(1), w(2), w(3)];
      // reach: the box's far edge moves with the attacker's front edge
      const nx = Math.round(x + (kb[1] - ob[1]) * u);
      // height: same place relative to the body (head height stays head height), scaled to the Kong
      const oh = ob[3] - ob[2], kh = kb[3] - kb[2], f = Math.max(0.6, Math.min(1.5, kh / oh));
      const centre = (y + ht / 2) / u - A.yBase, frac = (centre - ob[2]) / oh;
      const nh = Math.round(ht * f), ny = Math.round((kb[2] + frac * kh + A.yBase) * u - nh / 2);
      const put16 = (i, v) => { const a = dst + (rec - (A.copyFrom & 0xFFFF)) + i * 2; rom[a] = v & 0xFF; rom[a + 1] = (v >> 8) & 0xFF; };
      // a longer reach stretches the box forward and keeps its near edge, so close hits still land
      put16(0, nx); put16(1, ny); put16(2, Math.max(wd, wd + nx - x)); put16(3, nh);
      (stats.attacks = stats.attacks || []).push(`${K.name.split(" ")[0]} ${rec.toString(16)}@${frame}: reach ${x}->${nx} top ${y}->${ny} h ${ht}->${nh}`);
    }
  }

  // ---- movement from each guest's own game ----
  {
    const PH = MK3.physics, R = a => [lo(a), hi(a)];
    const AIR = PH.ram, DJ = PH.ram + 4, VXM = PH.ram + 8, VYM = PH.ram + 12, LVX = PH.ram + 16, LVY = PH.ram + 20, TMP = PH.ram + 24;
    const c = [], lb = {}, fx = [];
    const L2 = name => { lb[name] = c.length; };
    const br = (op, l) => { c.push(op ^ 0x20, 3, 0x82, 0, 0); fx.push([c.length - 2, l]); };   // long conditional
    const bra = l => { c.push(0x82, 0, 0); fx.push([c.length - 2, l]); };
    const ldaY = a => c.push(0xB9, ...R(a)), staY = a => c.push(0x99, ...R(a)), ldaI = v => c.push(0xA9, ...R(v & 0xFFFF));
    const cmpI = v => c.push(0xC9, ...R(v & 0xFFFF)), andI = v => c.push(0x29, ...R(v & 0xFFFF));
    const neg = () => c.push(0x49, 0xFF, 0xFF, 0x1A), asr = n => { for (let i = 0; i < n; i++) c.push(0xC9, 0x00, 0x80, 0x6A); };
    // ease vxm toward the target in A by 1/2^ease (or set it outright), then write it as the velocity
    let uid = 0;
    const easeTo = (P, tag) => {
      if (P.accel) {   // SMW: speed changes by a fixed step a frame (smaller when slowing to a stop)
        const t = "acc" + (uid++) + "_";
        staY(TMP); br(0xD0, t + "go"); ldaI(P.decel || P.accel); bra(t + "st"); L2(t + "go"); ldaI(P.accel); L2(t + "st"); staY(TMP + 2);
        ldaY(VXM); c.push(0x38, 0xF9, ...R(TMP)); br(0xF0, t + "tgt"); br(0x10, t + "above");
        ldaY(VXM); c.push(0x18, 0x79, ...R(TMP + 2)); staY(VXM); c.push(0x38, 0xF9, ...R(TMP)); br(0x30, t + "w"); bra(t + "tgt");
        L2(t + "above"); ldaY(VXM); c.push(0x38, 0xF9, ...R(TMP + 2)); staY(VXM); c.push(0x38, 0xF9, ...R(TMP)); br(0x10, t + "w");
        L2(t + "tgt"); ldaY(TMP); staY(VXM);
        L2(t + "w"); ldaY(VXM); staY(PH.vx); staY(LVX); return;
      }
      if (P.ease) { c.push(0x38, 0xF9, ...R(VXM)); asr(P.ease); c.push(0x18, 0x79, ...R(VXM)); }
      staY(VXM); staY(PH.vx); staY(LVX);
    };
    // direction target from the held pad (left $0200 / right $0100) times speed
    const padTarget = (speed, tag) => {
      ldaY(PH.held); andI(0x0100); br(0xF0, tag + "nr"); ldaI(speed); bra(tag + "td");
      L2(tag + "nr"); ldaY(PH.held); andI(0x0200); br(0xF0, tag + "nl"); ldaI(-speed); bra(tag + "td");
      L2(tag + "nl"); ldaI(0); L2(tag + "td");
    };
    c.push(0x08, 0xC2, 0x30, 0xC0, 0x04, 0x00); br(0xB0, "done");             // php / rep #$30 / cpy #4 / bcs done
    ldaY(PH.set); c.push(0xEB); andI(0xFE);
    const guests = which.map(k => kongs[k]).filter(K => K.physics);
    guests.forEach((K, gi) => { cmpI(K.setId); br(0xF0, "g" + gi); });
    bra("done");
    guests.forEach((K, gi) => {
      const P = K.physics, t = "g" + gi + "_", hs = K.scale;
      const peak = P.vy0 * P.vy0 / (2 * P.gHold) / 256, vs = Math.min(hs, PH.peak / peak);
      const W = Math.round(P.walk * hs), RUN = Math.round(P.run * hs), VY0 = Math.round(P.vy0 * vs);
      const GH = Math.round(P.gHold * vs), GR = Math.round(P.gRelease * vs), JX = Math.round((P.jumpVx || 0) * hs), DJV = Math.round((P.doubleJump || 0) * vs);
      L2("g" + gi);
      // in the air under our control? MK3 must have changed nothing but its own gravity since last frame
      // (its forward jump re-sets the sideways speed every frame, so only the vertical speed is checked)
      ldaY(AIR); br(0xF0, t + "ground");
      ldaY(PH.vy); c.push(0xD9, ...R(LVY)); br(0xD0, t + "abort");
      if (P.doubleJump) {   // a fresh Up press in the air, once
        ldaY(PH.press); andI(0x0800); br(0xF0, t + "nodj"); ldaY(DJ); br(0xD0, t + "nodj");
        ldaI(1); staY(DJ); ldaI(-DJV); staY(VYM); bra(t + "wvy"); L2(t + "nodj");
      }
      // gravity: lighter while Up is held (DKC's higher jump when the button is kept down)
      ldaY(PH.held); andI(0x0800); br(0xF0, t + "rel"); ldaI(GH); bra(t + "gadd"); L2(t + "rel"); ldaI(GR);
      L2(t + "gadd"); c.push(0x18, 0x79, ...R(VYM)); staY(VYM);
      if (P.maxFall) { const MF = Math.round(P.maxFall * vs); ldaY(VYM); c.push(0x38, 0xE9, ...R(MF)); br(0x30, t + "nomf"); ldaI(MF); staY(VYM); L2(t + "nomf"); }
      if (P.stomp) {   // falling onto the opponent's head: big damage, bounce back up (once per jump)
        const S = P.stomp;
        ldaY(VYM); br(0x30, t + "nost"); br(0xF0, t + "nost"); ldaY(DJ); br(0xD0, t + "nost");
        c.push(0x98, 0x49, 0x02, 0x00, 0xAA);                                   // tya / eor #2 / tax: the opponent
        ldaY(PH.x); c.push(0x38, 0xFD, ...R(PH.x)); br(0x10, t + "dxp"); neg(); L2(t + "dxp");
        cmpI(S.rangeX); br(0xB0, t + "nost");
        c.push(0xBD, ...R(PH.y)); c.push(0x38, 0xF9, ...R(PH.y));               // opponent's feet - ours
        c.push(0x38, 0xE9, ...R(S.above[0])); br(0x30, t + "nost"); cmpI(S.above[1] - S.above[0]); br(0xB0, t + "nost");
        // hit: the opponent's health (P1 $3634 / P2 $37F6)
        c.push(0x98); br(0xD0, t + "hp1");
        c.push(0xAD, ...R(PH.health[1]), 0x38, 0xE9, ...R(S.damage)); br(0x10, t + "hp2s"); ldaI(0); L2(t + "hp2s"); c.push(0x8D, ...R(PH.health[1])); bra(t + "hpd");
        L2(t + "hp1"); c.push(0xAD, ...R(PH.health[0]), 0x38, 0xE9, ...R(S.damage)); br(0x10, t + "hp1s"); ldaI(0); L2(t + "hp1s"); c.push(0x8D, ...R(PH.health[0]));
        L2(t + "hpd"); ldaI(1); staY(DJ); ldaI(-Math.round(VY0 * 0.8)); staY(VYM);
        L2(t + "nost");
      }
      // ceiling: still rising with the feet near the top of the screen -> stop rising
      ldaY(PH.y); c.push(0x38, 0xE9, ...R(PH.ceiling)); br(0x10, t + "noceil"); ldaY(VYM); br(0x10, t + "noceil"); ldaI(0); staY(VYM); L2(t + "noceil");
      L2(t + "wvy"); ldaY(VYM); staY(PH.vy); c.push(0x18); c.push(0x69, ...R(PH.gravity)); staY(LVY);
      if (P.airControl) { padTarget(W, t + "a"); easeTo(P); } else { ldaY(VXM); staY(PH.vx); staY(LVX); }
      bra("done");
      L2(t + "abort"); ldaI(0); staY(AIR);
      L2(t + "ground");
      ldaY(PH.vy); cmpI(PH.jumpVy); br(0xD0, t + "walk");
      // jump start
      ldaI(1); staY(AIR); ldaI(0); staY(DJ); ldaI(-VY0); staY(VYM);
      if (P.jumpVx) {   // fixed sideways speed in the direction MK3 jumped
        ldaY(PH.vx); br(0xF0, t + "j0"); br(0x30, t + "jn"); ldaI(JX); bra(t + "js"); L2(t + "jn"); ldaI(-JX); bra(t + "js"); L2(t + "j0"); ldaI(0); L2(t + "js"); staY(VXM);
      } else {          // keep the running speed (momentum); a jump from standing in a direction gets walking speed
        ldaY(VXM); br(0xD0, t + "jk"); ldaY(PH.vx); br(0xF0, t + "jk"); br(0x30, t + "jn"); ldaI(W); bra(t + "js"); L2(t + "jn"); ldaI(-W); L2(t + "js"); staY(VXM); L2(t + "jk");
      }
      bra(t + "wvy2");
      L2(t + "wvy2"); ldaY(VYM); staY(PH.vy); c.push(0x18, 0x69, ...R(PH.gravity)); staY(LVY); ldaY(VXM); staY(PH.vx); staY(LVX); bra("done");
      // walking / running: MK3's speed picks the direction, the guest's game picks the speed
      L2(t + "walk"); ldaY(PH.vx); br(0xF0, t + "stop");
      for (const [mk, sp, tag] of [[PH.walk[0], W, "w0"], [PH.walk[1], W, "w1"], [PH.run, RUN, "r"]]) {
        cmpI(mk); br(0xD0, t + tag + "a"); ldaI(sp); easeTo(P); bra("done");
        L2(t + tag + "a"); cmpI(-mk); br(0xD0, t + tag + "b"); ldaI(-sp); easeTo(P); bra("done"); L2(t + tag + "b");
      }
      // any other speed is MK3's own (knockback, lunges, pushing): leave it, and carry it as momentum
      ldaY(PH.vx); staY(VXM); bra("done");
      // MK3 stopped the fighter: DKC's Kongs slide to a halt (same easing), Arthur stops dead
      L2(t + "stop"); if (P.ease) { ldaI(0); easeTo(P); } else { ldaI(0); staY(VXM); } bra("done");
    });
    L2("done"); c.push(0x28, 0x64, 0x0A, 0x64, 0x0C, 0x6B);                   // plp / stz $0A / stz $0C / rtl
    for (const [at, l] of fx) { const d = lb[l] - (at + 2); c[at] = d & 0xFF; c[at + 1] = (d >> 8) & 0xFF; }
    const at = put(Uint8Array.from(c));
    if ([0x64, 0x0A, 0x64, 0x0C].some((b, i) => mk3Rom[PH.site + i] !== b)) throw new Error("unexpected code at the movement hook");
    rom[PH.site] = 0x22; rom[PH.site + 1] = lo(at); rom[PH.site + 2] = hi(at); rom[PH.site + 3] = T; [0, 1, 2, 3].forEach(i => mirror(PH.site + i));
    stats.physicsBytes = c.length;
  }

  // ---- "Battle" screen pictures ----
  {
    const V = MK3.vs, w16 = o => mk3Rom[o] | (mk3Rom[o + 1] << 8), set16 = (o, v) => { rom[o] = lo(v); rom[o + 1] = hi(v); mirror(o); mirror(o + 1); };
    // wrapper: data in a bank below $80 is ours and stored unpacked (length word, then the bytes)
    const wrap = [0x08, 0xC2, 0x30, 0xA5, 0x7C, 0x29, 0xFF, 0x00, 0xC9, 0x80, 0x00, 0x90, 0x05,
      0x28, 0x5C, ...L(V.unpacker),
      0xA0, 0x00, 0x00, 0xB7, 0x7A, 0x85, 0x8E, 0xA5, 0x7A, 0x18, 0x69, 0x02, 0x00, 0x85, 0x7A,
      0xB7, 0x7A, 0x97, 0x76, 0xC8, 0xC8, 0xC4, 0x8E, 0x90, 0xF6, 0xA5, 0x8E, 0x28, 0x6B];
    const wrapAt = put(Uint8Array.from(wrap));
    for (const site of V.calls) patchCall(site, V.unpacker, wrapAt);
    for (const k of which) {
      const K = kongs[k], A = artSource(K, roms), id = K.namesEntry, count = w16(V.count + id * 2);
      const pal = rgbPal(A.pal(K.kongPalette)), img0 = A.pose(K.vsPose || K.portraitPose);
      // largest size that fits the area and the fighter's tile budget
      let cellsOut = null;
      for (let sc = 8; sc > 0.5; sc -= 0.1) {
        const img = scaled(img0, sc); if (img.w > V.cols * 8 || img.h > V.rows * 8) continue;
        const ox = Math.floor((V.cols * 8 - img.w) / 2), oy = V.rows * 8 - img.h, cells = [];
        for (let cy = 0; cy < V.rows; cy++) for (let cx = 0; cx < V.cols; cx++) {
          const px = new Uint8Array(64); let any = false;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const ix = cx * 8 + x - ox, iy = cy * 8 + y - oy;
            if (ix >= 0 && iy >= 0 && ix < img.w && iy < img.h) { const v = img.data[iy * img.w + ix]; px[y * 8 + x] = v; if (v) any = true; } }
          if (any) cells.push({ cx, cy, px });
        }
        if (cells.length < count) { cellsOut = cells; break; }
      }
      if (!cellsOut) throw new Error(K.name + ": battle picture does not fit");
      // 6bpp tiles (48 bytes: plane pairs 0/1, 2/3, 4/5); tile 0 stays blank, one spare at the end
      const tiles = new Uint8Array((count + 1) * 48), map = new Uint8Array(32 * 32 * 2);
      cellsOut.forEach((c, i) => { const t = i + 1;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = c.px[y * 8 + x], m = 1 << (7 - x);
          for (let pl = 0; pl < 6; pl++) if (v & (1 << pl)) tiles[t * 48 + (pl >> 1) * 16 + y * 2 + (pl & 1)] |= m; }
        map[(c.cy * 32 + c.cx) * 2] = t & 0xFF; map[(c.cy * 32 + c.cx) * 2 + 1] = t >> 8; });
      const palBytes = new Uint8Array(128);
      for (let v = 1; v < 16; v++) { const [r, g, b] = pal[v], c = (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10); palBytes[v * 2] = lo(c); palBytes[v * 2 + 1] = hi(c); }
      const vb = bank++; let vp = 0;
      const vput = (bytes, header) => { const a = vp, d = header ? Uint8Array.from([lo(bytes.length), hi(bytes.length), ...bytes]) : bytes; rom.set(d, exOff(vb, vp)); vp += d.length; return a; };
      const palAt = vput(palBytes, false), mapAt = vput(map, true), tilesAt = vput(tiles, true);
      if (vp > 0x8000) throw new Error("battle picture bank full");
      set16(V.bank + id * 2, vb); set16(V.tiles + id * 2, tilesAt); set16(V.map + id * 2, mapAt); set16(V.pal + id * 2, palAt);
      (stats.vs = stats.vs || []).push(`${K.name}: ${cellsOut.length}/${count} tiles`);
    }
  }

  fixChecksum(rom);
  return { rom, stats: { ...stats, banksUsed: bank - 0x40, tableBytes: q } };
}

// the earlier name, used by the web page
export const buildDkMk3 = (mk3Rom, dkcRom, sgngRom) => buildKongsMk3(mk3Rom, { dkc: dkcRom, sgng: sgngRom });

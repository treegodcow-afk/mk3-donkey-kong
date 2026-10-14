// Minimal 65816 interpreter (native + emulation mode, binary + decimal ADC/SBC) for running a
// game's own routines outside an emulator, e.g. MK3's sprite-frame decoder on the player's ROM.
// The bus is supplied by the caller: read(addr24) -> byte, write(addr24, byte).
// Works in Node and in the browser (no imports).

export class CPU65816 {
  constructor(bus) {
    this.bus = bus;
    this.A = 0; this.X = 0; this.Y = 0; this.S = 0x1FF; this.D = 0; this.DB = 0; this.PB = 0; this.PC = 0;
    this.P = 0x34; this.E = 0; this.steps = 0;
  }
  get m8() { return this.E || (this.P & 0x20) !== 0; }
  get x8() { return this.E || (this.P & 0x10) !== 0; }
  rd(a) { return this.bus.read(a & 0xFFFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFFFF, v & 0xFF); }
  rd16(a) { return this.rd(a) | (this.rd(a + 1) << 8); }
  wr16(a, v) { this.wr(a, v); this.wr(a + 1, v >> 8); }
  // bank-wrapping reads for direct page / stack (bank 0)
  rd0(a) { return this.rd(a & 0xFFFF); }
  rd016(a) { return this.rd0(a) | (this.rd0(a + 1) << 8); }
  fetch() { const v = this.rd((this.PB << 16) | this.PC); this.PC = (this.PC + 1) & 0xFFFF; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }
  fetch24() { const w = this.fetch16(); return w | (this.fetch() << 16); }
  push(v) { this.wr(this.S, v); this.S = this.E ? 0x100 | ((this.S - 1) & 0xFF) : (this.S - 1) & 0xFFFF; }
  pull() { this.S = this.E ? 0x100 | ((this.S + 1) & 0xFF) : (this.S + 1) & 0xFFFF; return this.rd(this.S); }
  push16(v) { this.push(v >> 8); this.push(v); }
  pull16() { const lo = this.pull(); return lo | (this.pull() << 8); }
  setNZ(v, w8) { const msb = w8 ? 0x80 : 0x8000; const mask = w8 ? 0xFF : 0xFFFF; v &= mask;
    this.P = (this.P & ~0x82) | (v === 0 ? 2 : 0) | ((v & msb) ? 0x80 : 0); }
  get C() { return this.P & 1; }
  setFlag(f, on) { this.P = on ? (this.P | f) : (this.P & ~f); }
  fixIndex() { if (this.x8) { this.X &= 0xFF; this.Y &= 0xFF; } if (this.E) { this.P |= 0x30; this.S = 0x100 | (this.S & 0xFF); } }

  // ---- effective addresses (24-bit) ----
  dp(off) { return (this.D + off) & 0xFFFF; }
  ea(mode) {
    switch (mode) {
      case "dp": return this.dp(this.fetch());
      case "dpx": return this.dp(this.fetch() + this.X);
      case "dpy": return this.dp(this.fetch() + this.Y);
      case "dpi": { const p = this.dp(this.fetch()); return (this.DB << 16) | this.rd016(p); }
      case "dpix": { const p = this.dp(this.fetch() + this.X); return (this.DB << 16) | this.rd016(p); }
      case "dpiy": { const p = this.dp(this.fetch()); return (((this.DB << 16) | this.rd016(p)) + this.Y) & 0xFFFFFF; }
      case "dpil": { const p = this.dp(this.fetch()); return this.rd016(p) | (this.rd0(p + 2) << 16); }
      case "dpily": { const p = this.dp(this.fetch()); return ((this.rd016(p) | (this.rd0(p + 2) << 16)) + this.Y) & 0xFFFFFF; }
      case "abs": return (this.DB << 16) | this.fetch16();
      case "absx": return (((this.DB << 16) | this.fetch16()) + this.X) & 0xFFFFFF;
      case "absy": return (((this.DB << 16) | this.fetch16()) + this.Y) & 0xFFFFFF;
      case "absl": return this.fetch24();
      case "abslx": return (this.fetch24() + this.X) & 0xFFFFFF;
      case "sr": return (this.fetch() + this.S) & 0xFFFF;
      case "sriy": { const p = (this.fetch() + this.S) & 0xFFFF; return (((this.DB << 16) | this.rd016(p)) + this.Y) & 0xFFFFFF; }
    }
    throw new Error("ea " + mode);
  }
  // operand value for read-type instructions
  val(mode, w8) {
    if (mode === "imm") return w8 ? this.fetch() : this.fetch16();
    const a = this.ea(mode);
    return w8 ? this.rd(a) : this.rd16(a);
  }
  store(a, v, w8) { if (w8) this.wr(a, v); else this.wr16(a, v); }

  adc(v) {
    const w8 = this.m8, mask = w8 ? 0xFF : 0xFFFF, msb = w8 ? 0x80 : 0x8000;
    let a = this.A & mask, r;
    if (this.P & 8) { // decimal
      let c = this.C; r = 0;
      for (let s = 0; s < (w8 ? 8 : 16); s += 4) {
        let d = ((a >> s) & 15) + ((v >> s) & 15) + c;
        c = d > 9 ? 1 : 0; if (c) d -= 10; r |= (d & 15) << s;
      }
      this.setFlag(1, c);
      this.setFlag(0x40, ((~(a ^ v) & (a ^ r)) & msb) !== 0);
    } else {
      r = a + v + this.C;
      this.setFlag(1, r > mask);
      this.setFlag(0x40, ((~(a ^ v) & (a ^ r)) & msb) !== 0);
      r &= mask;
    }
    this.A = w8 ? (this.A & 0xFF00) | r : r;
    this.setNZ(r, w8);
  }
  sbc(v) {
    const w8 = this.m8, mask = w8 ? 0xFF : 0xFFFF;
    if (this.P & 8) {
      const msb = w8 ? 0x80 : 0x8000; let a = this.A & mask, r = 0, b = 1 - this.C;
      for (let s = 0; s < (w8 ? 8 : 16); s += 4) {
        let d = ((a >> s) & 15) - ((v >> s) & 15) - b;
        b = d < 0 ? 1 : 0; if (b) d += 10; r |= (d & 15) << s;
      }
      this.setFlag(1, !b);
      this.setFlag(0x40, (((a ^ v) & (a ^ r)) & msb) !== 0);
      this.A = w8 ? (this.A & 0xFF00) | r : r; this.setNZ(r, w8);
    } else this.adc(v ^ mask);
  }
  cmp(reg, v, w8) { const mask = w8 ? 0xFF : 0xFFFF; const r = (reg & mask) - v; this.setFlag(1, r >= 0); this.setNZ(r, w8); }
  setA(v) { if (this.m8) { this.A = (this.A & 0xFF00) | (v & 0xFF); } else this.A = v & 0xFFFF; this.setNZ(v, this.m8); }
  rmw(mode, fn) {
    const w8 = this.m8;
    if (mode === "acc") { const r = fn(w8 ? this.A & 0xFF : this.A); this.setA(r); return; }
    const a = this.ea(mode); const r = fn(w8 ? this.rd(a) : this.rd16(a));
    this.store(a, r, w8); this.setNZ(r, w8);
  }
  branch(cond) { const o = this.fetch(); if (cond) this.PC = (this.PC + ((o << 24) >> 24)) & 0xFFFF; }

  step() {
    this.steps++;
    const op = this.fetch();
    const m8 = this.m8, x8 = this.x8, mask = m8 ? 0xFF : 0xFFFF, xmask = x8 ? 0xFF : 0xFFFF;
    const hi = op >> 5, lo = op & 0x1F;
    // ---- group: ORA/AND/EOR/ADC/STA/LDA/CMP/SBC (cc = 01) ----
    if (op !== 0x89 && ((op & 3) === 1 || (op & 0x1F) === 0x12 || (op & 0x1F) === 0x13 || (op & 0x1F) === 0x03 || (op & 0x1F) === 0x07 || (op & 0x1F) === 0x0F || (op & 0x1F) === 0x17 || (op & 0x1F) === 0x1F)) {
      const MODES = { 0x01: "dpix", 0x03: "sr", 0x05: "dp", 0x07: "dpil", 0x09: "imm", 0x0D: "abs", 0x0F: "absl",
        0x11: "dpiy", 0x12: "dpi", 0x13: "sriy", 0x15: "dpx", 0x17: "dpily", 0x19: "absy", 0x1D: "absx", 0x1F: "abslx" };
      const mode = MODES[lo];
      if (mode) {
        const g = hi;
        if (g === 4) { if (mode === "imm") { this.fetch(); if (!m8) this.fetch(); return; } // BIT # is 0x89 (handled below)
          const a = this.ea(mode); this.store(a, this.A, m8); return; }
        const v = this.val(mode, m8);
        switch (g) {
          case 0: this.setA((this.A | v)); return;
          case 1: this.setA((this.A & v) | (m8 ? this.A & 0xFF00 : 0)); return;
          case 2: this.setA((this.A ^ v)); return;
          case 3: this.adc(v); return;
          case 5: this.setA(v); return;
          case 6: this.cmp(this.A, v, m8); return;
          case 7: this.sbc(v); return;
        }
      }
    }
    switch (op) {
      // ---- loads/stores of X/Y/Z ----
      case 0xA2: case 0xA6: case 0xB6: case 0xAE: case 0xBE: {
        const mode = { 0xA2: "imm", 0xA6: "dp", 0xB6: "dpy", 0xAE: "abs", 0xBE: "absy" }[op];
        this.X = this.val(mode, x8) & xmask; this.setNZ(this.X, x8); return; }
      case 0xA0: case 0xA4: case 0xB4: case 0xAC: case 0xBC: {
        const mode = { 0xA0: "imm", 0xA4: "dp", 0xB4: "dpx", 0xAC: "abs", 0xBC: "absx" }[op];
        this.Y = this.val(mode, x8) & xmask; this.setNZ(this.Y, x8); return; }
      case 0x86: case 0x96: case 0x8E: { const a = this.ea({ 0x86: "dp", 0x96: "dpy", 0x8E: "abs" }[op]); this.store(a, this.X, x8); return; }
      case 0x84: case 0x94: case 0x8C: { const a = this.ea({ 0x84: "dp", 0x94: "dpx", 0x8C: "abs" }[op]); this.store(a, this.Y, x8); return; }
      case 0x64: case 0x74: case 0x9C: case 0x9E: { const a = this.ea({ 0x64: "dp", 0x74: "dpx", 0x9C: "abs", 0x9E: "absx" }[op]); this.store(a, 0, m8); return; }
      case 0x89: { const v = m8 ? this.fetch() : this.fetch16(); this.setFlag(2, ((this.A & mask) & v) === 0); return; }
      case 0x24: case 0x34: case 0x2C: case 0x3C: {
        const v = this.val({ 0x24: "dp", 0x34: "dpx", 0x2C: "abs", 0x3C: "absx" }[op], m8);
        this.setFlag(2, ((this.A & mask) & v) === 0); this.setFlag(0x80, v & (m8 ? 0x80 : 0x8000)); this.setFlag(0x40, v & (m8 ? 0x40 : 0x4000)); return; }
      case 0xE0: case 0xE4: case 0xEC: this.cmp(this.X, this.val({ 0xE0: "imm", 0xE4: "dp", 0xEC: "abs" }[op], x8), x8); return;
      case 0xC0: case 0xC4: case 0xCC: this.cmp(this.Y, this.val({ 0xC0: "imm", 0xC4: "dp", 0xCC: "abs" }[op], x8), x8); return;
      // ---- read-modify-write ----
      case 0x0A: case 0x06: case 0x16: case 0x0E: case 0x1E:
        return this.rmw({ 0x0A: "acc", 0x06: "dp", 0x16: "dpx", 0x0E: "abs", 0x1E: "absx" }[op], v => { this.setFlag(1, v & (m8 ? 0x80 : 0x8000)); return (v << 1) & mask; });
      case 0x4A: case 0x46: case 0x56: case 0x4E: case 0x5E:
        return this.rmw({ 0x4A: "acc", 0x46: "dp", 0x56: "dpx", 0x4E: "abs", 0x5E: "absx" }[op], v => { this.setFlag(1, v & 1); return v >> 1; });
      case 0x2A: case 0x26: case 0x36: case 0x2E: case 0x3E:
        return this.rmw({ 0x2A: "acc", 0x26: "dp", 0x36: "dpx", 0x2E: "abs", 0x3E: "absx" }[op], v => { const c = this.C; this.setFlag(1, v & (m8 ? 0x80 : 0x8000)); return ((v << 1) | c) & mask; });
      case 0x6A: case 0x66: case 0x76: case 0x6E: case 0x7E:
        return this.rmw({ 0x6A: "acc", 0x66: "dp", 0x76: "dpx", 0x6E: "abs", 0x7E: "absx" }[op], v => { const c = this.C; this.setFlag(1, v & 1); return (v >> 1) | (c ? (m8 ? 0x80 : 0x8000) : 0); });
      case 0x1A: case 0xE6: case 0xF6: case 0xEE: case 0xFE:
        return this.rmw({ 0x1A: "acc", 0xE6: "dp", 0xF6: "dpx", 0xEE: "abs", 0xFE: "absx" }[op], v => (v + 1) & mask);
      case 0x3A: case 0xC6: case 0xD6: case 0xCE: case 0xDE:
        return this.rmw({ 0x3A: "acc", 0xC6: "dp", 0xD6: "dpx", 0xCE: "abs", 0xDE: "absx" }[op], v => (v - 1) & mask);
      case 0x04: case 0x0C: case 0x14: case 0x1C: { // TSB/TRB
        const mode = (op & 8) ? "abs" : "dp"; const a = this.ea(mode); const v = m8 ? this.rd(a) : this.rd16(a);
        this.setFlag(2, (v & this.A & mask) === 0);
        this.store(a, op < 0x10 ? v | (this.A & mask) : v & ~(this.A & mask), m8); return; }
      // ---- transfers / stack / flags ----
      case 0xAA: this.X = (m8 && !x8 ? this.A : this.A) & xmask; this.setNZ(this.X, x8); return;
      case 0xA8: this.Y = this.A & xmask; this.setNZ(this.Y, x8); return;
      case 0x8A: this.setA(this.X); return;
      case 0x98: this.setA(this.Y); return;
      case 0x9B: this.Y = this.X & xmask; this.setNZ(this.Y, x8); return;
      case 0xBB: this.X = this.Y & xmask; this.setNZ(this.X, x8); return;
      case 0xBA: this.X = this.S & xmask; this.setNZ(this.X, x8); return;
      case 0x9A: this.S = this.E ? 0x100 | (this.X & 0xFF) : this.X; return;
      case 0x5B: this.D = this.A & 0xFFFF; this.setNZ(this.D, false); return;
      case 0x7B: this.A = this.D; this.setNZ(this.A, false); return;
      case 0x1B: this.S = this.E ? 0x100 | (this.A & 0xFF) : this.A & 0xFFFF; return;
      case 0x3B: this.A = this.S; this.setNZ(this.A, false); return;
      case 0xEB: { const a = this.A; this.A = ((a >> 8) | (a << 8)) & 0xFFFF; this.setNZ(this.A & 0xFF, true); return; }
      case 0x48: if (m8) this.push(this.A); else this.push16(this.A); return;
      case 0x68: if (m8) this.setA(this.pull()); else this.setA(this.pull16()); return;
      case 0xDA: if (x8) this.push(this.X); else this.push16(this.X); return;
      case 0xFA: this.X = x8 ? this.pull() : this.pull16(); this.setNZ(this.X, x8); return;
      case 0x5A: if (x8) this.push(this.Y); else this.push16(this.Y); return;
      case 0x7A: this.Y = x8 ? this.pull() : this.pull16(); this.setNZ(this.Y, x8); return;
      case 0x8B: this.push(this.DB); return;
      case 0xAB: this.DB = this.pull(); this.setNZ(this.DB, true); return;
      case 0x0B: this.push16(this.D); return;
      case 0x2B: this.D = this.pull16(); this.setNZ(this.D, false); return;
      case 0x4B: this.push(this.PB); return;
      case 0x08: this.push(this.P); return;
      case 0x28: this.P = this.pull(); this.fixIndex(); return;
      case 0xF4: this.push16(this.fetch16()); return;
      case 0xD4: { const p = this.dp(this.fetch()); this.push16(this.rd016(p)); return; }
      case 0x62: { const o = this.fetch16(); this.push16((this.PC + o) & 0xFFFF); return; }
      case 0xC2: this.P &= ~this.fetch(); this.fixIndex(); return;
      case 0xE2: this.P |= this.fetch(); this.fixIndex(); return;
      case 0x18: this.P &= ~1; return; case 0x38: this.P |= 1; return;
      case 0x58: this.P &= ~4; return; case 0x78: this.P |= 4; return;
      case 0xD8: this.P &= ~8; return; case 0xF8: this.P |= 8; return;
      case 0xB8: this.P &= ~0x40; return;
      case 0xFB: { const c = this.C; this.setFlag(1, this.E); this.E = c; this.fixIndex(); return; }
      case 0xEA: return;
      case 0x42: this.fetch(); return; // WDM
      case 0xE8: this.X = (this.X + 1) & xmask; this.setNZ(this.X, x8); return;
      case 0xC8: this.Y = (this.Y + 1) & xmask; this.setNZ(this.Y, x8); return;
      case 0xCA: this.X = (this.X - 1) & xmask; this.setNZ(this.X, x8); return;
      case 0x88: this.Y = (this.Y - 1) & xmask; this.setNZ(this.Y, x8); return;
      // ---- block moves ----
      case 0x54: case 0x44: {
        const dst = this.fetch(), src = this.fetch(); this.DB = dst;
        this.wr((dst << 16) | this.Y, this.rd((src << 16) | this.X));
        if (op === 0x54) { this.X = (this.X + 1) & xmask; this.Y = (this.Y + 1) & xmask; } else { this.X = (this.X - 1) & xmask; this.Y = (this.Y - 1) & xmask; }
        this.A = (this.A - 1) & 0xFFFF; if (this.A !== 0xFFFF) this.PC = (this.PC - 3) & 0xFFFF; return; }
      // ---- branches / jumps ----
      case 0x10: return this.branch(!(this.P & 0x80)); case 0x30: return this.branch(this.P & 0x80);
      case 0x50: return this.branch(!(this.P & 0x40)); case 0x70: return this.branch(this.P & 0x40);
      case 0x90: return this.branch(!(this.P & 1)); case 0xB0: return this.branch(this.P & 1);
      case 0xD0: return this.branch(!(this.P & 2)); case 0xF0: return this.branch(this.P & 2);
      case 0x80: return this.branch(true);
      case 0x82: { const o = this.fetch16(); this.PC = (this.PC + o) & 0xFFFF; return; }
      case 0x4C: this.PC = this.fetch16(); return;
      case 0x5C: { const a = this.fetch24(); this.PC = a & 0xFFFF; this.PB = a >> 16; return; }
      case 0x6C: { const a = this.fetch16(); this.PC = this.rd016(a); return; }
      case 0x7C: { const a = this.fetch16(); this.PC = this.rd16((this.PB << 16) | ((a + this.X) & 0xFFFF)); return; }
      case 0xDC: { const a = this.fetch16(); this.PC = this.rd016(a); this.PB = this.rd0(a + 2); return; }
      case 0x20: { const a = this.fetch16(); this.push16((this.PC - 1) & 0xFFFF); this.PC = a; return; }
      case 0xFC: { const a = this.fetch16(); this.push16((this.PC - 1) & 0xFFFF); this.PC = this.rd16((this.PB << 16) | ((a + this.X) & 0xFFFF)); return; }
      case 0x22: { const a = this.fetch24(); this.push(this.PB); this.push16((this.PC - 1) & 0xFFFF); this.PC = a & 0xFFFF; this.PB = a >> 16; return; }
      case 0x60: this.PC = (this.pull16() + 1) & 0xFFFF; return;
      case 0x6B: this.PC = (this.pull16() + 1) & 0xFFFF; this.PB = this.pull(); return;
      case 0x40: this.P = this.pull(); this.fixIndex(); this.PC = this.pull16(); if (!this.E) this.PB = this.pull(); return;
    }
    throw new Error(`unimplemented opcode ${op.toString(16)} at ${(((this.PB << 16) | ((this.PC - 1) & 0xFFFF)) >>> 0).toString(16)}`);
  }

  // Call a routine: push a sentinel return address (JSL or JSR style) and run until it comes back.
  call(pb, pc, { long = true, maxSteps = 2000000 } = {}) {
    if (long) { this.push(0x00); this.push16(0xFFEF); } else { this.push16(0xFFEF); }
    this.PB = pb; this.PC = pc;
    const start = this.steps;
    while (!(this.PC === 0xFFF0 && (!long || this.PB === 0x00))) {
      if (this.steps - start > maxSteps) throw new Error("routine did not return");
      this.step();
    }
  }
}

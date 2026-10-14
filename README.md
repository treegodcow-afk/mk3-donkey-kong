# Mortal Kombat 3, with Donkey Kong

A browser page that puts Donkey Kong into *Mortal Kombat 3* (SNES, USA), in Sub-Zero's slot. He fights with Sub-Zero's moves, shown with matching DK poses (punches, uppercuts, lunging kicks, rolls, getting hit). His slide (back + low punch + block + low kick) is DK's real animated barrel roll, and his ice ball (down, forward, low punch) is a big spinning banana from DKC. New move: Ground Slam (down, down + high punch) pounds the floor and launches the opponent.

This repository contains **no game data**: only the web page and JavaScript that knows where things are in each ROM.
You need your own dumps of `Mortal Kombat 3 (USA).sfc` (SHA-1 `58e4e1259a86faaadbc982176e569cb2038dbac5`) and
`Donkey Kong Country (USA) (Rev 1).sfc` (SHA-1 `8ee954e15b7d77a7941b107c8243b27acebdcbc0`).
In your browser, the page reads DK's frames out of your DKC file, scales them up, writes them into an expanded (8 MB) copy of your MK3 file,
and runs it with [snes9x-wasm](https://github.com/wasm-gaming/snes9x-wasm) (snes9x's license allows non-commercial use only).

- **Same keyboard:** player 1 uses the arrows and Z/X/A/S/Q/W, Enter for Start. Player 2 uses I/J/K/L and B/N/G/H/T/Y, 2 for Start.
- **Online:** click "Invite a friend online" and send the link. Your game streams to them and they play as player 2. They don't need the game files.

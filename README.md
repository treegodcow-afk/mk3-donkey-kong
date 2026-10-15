# Mortal Kombat 3, with Donkey Kong, Diddy Kong, Arthur and Mario

A browser page that puts Donkey Kong (in Sub-Zero's slot) and Diddy Kong (in Kung Lao's slot) into *Mortal Kombat 3* (SNES, USA). He fights with Sub-Zero's moves, shown with matching DK poses (punches, uppercuts, lunging kicks, rolls, getting hit). His slide (back + low punch + block + low kick) is DK's real animated barrel roll, and his ice ball (down, forward, low punch) is a big spinning banana from DKC. New move: Ground Slam (down, down + high punch) pounds the floor and launches the opponent.

This repository contains **no game data**: only the web page and JavaScript that knows where things are in each ROM.
You need your own dumps of `Mortal Kombat 3 (USA).sfc` (SHA-1 `58e4e1259a86faaadbc982176e569cb2038dbac5`) and
`Donkey Kong Country (USA) (Rev 1).sfc` (SHA-1 `8ee954e15b7d77a7941b107c8243b27acebdcbc0`) and/or
`Super Ghouls 'N Ghosts (USA).sfc` (SHA-1 `f12280b13eea88ca03d700b75cf3c13a0e13f3bc`).
In your browser, the page reads DK's frames out of your DKC file, scales them up, writes them into an expanded (8 MB) copy of your MK3 file,
(and Arthur's out of your Super Ghouls 'N Ghosts file, if you add it), and runs it with [snes9x-wasm](https://github.com/wasm-gaming/snes9x-wasm) (snes9x's license allows non-commercial use only).

- **Same keyboard:** player 1 uses the arrows and Z/X/A/S/Q/W, Enter for Start. Player 2 uses I/J/K/L and B/N/G/H/T/Y, 2 for Start.
- **Online:** click "Invite a friend online" and send the link. Your game streams to them and they play as player 2. They don't need the game files.

- **Diddy Kong:** cartwheels for sweeps and roundhouses, a barrel throw in place of Kung Lao's hat (back, forward + low punch), and his own launcher: down, down + high punch.

- **Arthur** (Super Ghouls 'N Ghosts, in Nightwolf's slot): lance throws for punches, the double-jump spin for flips, his lance flies in place of Nightwolf's arrow (down, back + low punch), his magic pose for the uppercut and his own launcher (down, down + high punch). Knock him down and his armour comes off; win and he takes his helmet off.

- **Mario** (Super Mario World, in Liu Kang's slot; `Super Mario World (USA).sfc`, SHA-1 `6b47bb75d16514b6a476aa0c73a683a2a4c18765`): SMW's fireballs in place of Liu Kang's, SMW walking/running/jumping physics, and landing on the opponent's head hurts them badly. A Mario mirror match makes player 2 Luigi.

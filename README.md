# Blockfell

An original browser voxel sandbox: explore a generated world, mine, craft, build, farm, trade with villagers and survive the night. All art, sounds, fonts and models are original (drawn and synthesised in code). Not affiliated with Mojang or Microsoft.

**Play:** https://avizent.github.io/blockfell/

- **Computer:** Chrome, Edge, Firefox or Safari. Click the game to capture the mouse; WASD to move, mouse to look, E for the inventory, Esc to pause.
- **iPhone / iPad (iOS 15 or later):** open the link in Safari, hold the device sideways, and use the on-screen controls. Tap **Share › Add to Home Screen** to play full screen with its own icon.

**New in 1.7:** lava (deep caves and buried lava lakes that glow, flow slowly and set you on fire), **Cinderstone** where water meets lava, and hidden **dungeons** with a Monster Cage and loot chests, in worlds created from 1.7 on. **1.6:** boats and fishing; **Continue**; works with **no internet** after the first visit, and the title screen offers **Restart** when a newer version has been published here.

Worlds are saved in the browser you play in. Use **Export World** / **Import World** in the world list to move a world between devices.

**Player's guide:** [How to Play (PDF, 42 pages)](guide/Blockfell-How-to-Play.pdf)

**Source code:** [`source/`](source/) — TypeScript, React, Three.js (WebGL 2), Vite and Web Workers. See [source/README.md](source/README.md) for features, architecture and tests. To build: `cd source && npm install && npm run build:single`.

`index.html` is the complete game in one file (built from the Blockfell source with `npm run build:single`); `sw.js` is the small service worker that keeps an offline copy of it.

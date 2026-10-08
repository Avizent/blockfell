# Blockfell

An original browser voxel sandbox: explore a generated world, mine, craft, build, farm, trade with villagers, survive the night and go down into the fiery Cinderdeep. All art, sounds, fonts and models are original (drawn and synthesised in code). Not affiliated with Mojang or Microsoft.

**Play:** https://avizent.github.io/blockfell/

- **Computer:** Chrome, Edge, Firefox or Safari. Click the game to capture the mouse; WASD to move, mouse to look, E for the inventory, Esc to pause.
- **iPhone / iPad (iOS 15 or later):** open the link in Safari, hold the device sideways, and use the on-screen controls. Tap **Share › Add to Home Screen** to play full screen with its own icon.

**New in 2.0 — the Cinderdeep:** a second world far below, in every world old and new. Lay **8 Cinderstone** in a ring on the ground and light the middle with a torch or a lava bucket: a **Deepgate**. Stand in it for 3 seconds and you come out in the Cinderdeep — great caverns of Ashrock over a **lava sea**, lit by Glowcaps, with no sky, no water and no sleeping. Mine **Ember Ore** (the best fuel; Ember also makes torches and the bright **Ember Lamp**) and rare **Fire Opal**; face the leaping **Cinderling** and the ember-throwing **Smoulderer**; raid the ruined **Ember Shrines**; and make a **Cinder Charm** that halves fire and lava damage. Die down there and you wake up on the surface. Guide section 22. Update every device the same day: a device still on 1.10 can't open a world saved by 2.0 (it tells you so).

**1.10:** saves gained room for more than one landscape per world and many more kinds of block; worlds were updated on first start with the old copy kept (Edit › **Restore Pre-1.10 Copy**). **Cinderstone** can be crafted — 4 stone and 4 coal round an iron ingot — and cut into **Cinderstone Bricks**.

**1.9 — Dropbox sync:** play the same worlds on your Mac and your iPad. Link Blockfell to your Dropbox once on each device (Singleplayer › **Dropbox...**) and every world is kept in Dropbox › Apps › Blockfell; opening a world brings it up to date from whichever device played it last, and a world played on both without a sync in between asks which copy to keep. Works from this web address (not the downloaded file). See section 24 of the guide for the one-time setup.

**1.8 — village life:** every villager has a **name** (look at one for its card); villages remember how you treat them (your **standing**, from Hostile to Honoured, changes prices); fed villages have **children** who grow up and take jobs; a **Village Bell** where the village meets at midday — ring it to send everyone indoors and make nearby monsters glow through walls; the **Mapmaker** sells maps to real ruins, dungeons and villages; villages catch up on the time you were away; villagers shelter from the rain and shut their doors at night. Bells and Mapmakers appear in villages of worlds created from 1.8 on (craft a bell or Map Table for older villages).

**1.7.1:** a **Sound: ON/OFF** switch (Options, the pause menu, or press **M**) and a separate **Music** switch. **1.7:** lava (deep caves and buried lava lakes that glow, flow slowly and set you on fire), **Cinderstone** where water meets lava, and hidden **dungeons** with a Monster Cage and loot chests, in worlds created from 1.7 on. **1.6:** boats and fishing; **Continue**; works with **no internet** after the first visit, and the title screen offers **Restart** when a newer version has been published here.

Worlds are saved in the browser you play in. Use **Dropbox sync** (1.9), or **Export World** / **Import World** in the world list, to move a world between devices.

**Player's guide:** [How to Play (PDF, 50 pages)](guide/Blockfell-How-to-Play.pdf)

**Source code:** [`source/`](source/) — TypeScript, React, Three.js (WebGL 2), Vite and Web Workers. See [source/README.md](source/README.md) for features, architecture and tests. To build: `cd source && npm install && npm run build:single`.

`index.html` is the complete game in one file (built from the Blockfell source with `npm run build:single`); `sw.js` is the small service worker that keeps an offline copy of it.

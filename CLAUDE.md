# Kino der Toten (local modding fork)

The user's fork of luckeyfaraday/kino-der-toten, a Three.js browser
reconstruction of Black Ops Zombies. The upstream developer guide is
`AGENTS.md`. Read it for the upstream layout and test commands.

## Fork setup

- Branch `custom` holds local work. The `upstream` remote is the original repo; update with `git fetch upstream && git merge upstream/main && git lfs pull`.
- Served by the Podman quadlet `~/.config/containers/systemd/kino.container` (image `node:24-alpine`, checkout bind-mounted read-only at `/app`, running `.tools/serve.mjs 5190 --lan`) on **port 5190**. Port 5173, the upstream default, is used by the deskpet electron-vite dev server on this host. The server sends `Cache-Control: no-cache`, so file edits show up on a browser refresh without a restart.
- Git LFS is installed as a user binary at `~/.local/bin/git-lfs` (no system package). The LFS assets are about 1 GB.
- Host Node is 20 and upstream wants 24. `npm test` passes on 20 anyway. The container uses 24.
- No system browser is installed. Browser checks use Playwright's headless Chromium in `~/.cache/ms-playwright` with `--use-angle=swiftshader --enable-unsafe-swiftshader`. The upstream `.tools/test-*.mjs` scripts hard-code Windows Chrome paths, so they won't run as-is. Software WebGL is slow: hide the canvas before UI screenshots, and don't render Kino and another map in one browser at the same time.

## Fork-only architecture

- **Main menu** `export/web/home.{html,css,js}` is served at `/` via `KINO_HOME=home.html` (env var read by `.tools/serve.mjs`, set in the quadlet). Kino itself is `/index.html`. Tabs: Play (map browser from `mods/maps.json`), Loadout (weapon thumbnails rendered from world models, stats, bonuses), Character (3D preview), Mods. `maps.html` just redirects to `./#play`.
- **Profile** `profile.js`: shared localStorage profile (`kino.mods.progression`: xp, level, loadout, character, stats), plus unlock rules read from `mods/progression/progression.json`. The menu and the progression mod both use it.
- **Mod loader** `mod-loader.js`: `ModHost` merges data patches (objects merge, arrays replace, `null` deletes, `{add,remove}`, weapon `"extends"` which also sets `baseId`), calls an optional `prepare(data)` from scripts, wraps session/enemies methods to emit events, then runs `setup(api)`. `host.camera` and `host.hideViewmodel` let a mod take over rendering.
- **Custom zombies maps**: `custom-world.js` (the `CustomWorld` class) builds a world from a glTF plus named markers (`PLAYER_SPAWN, ZSPAWN, WINDOW, DOOR, WALLBUY, PERK, BOX, PAP, POWER, CLAYMORE, TRAP, TRAPZONE, TELEPORT, TPDEST`). It exposes the same interface as upstream `world.js`, so upstream `Enemies`, `MysteryBox` (fed stand-in `data.entities`), `Powerups`, `PerkDrink` and `KinoFeatures` run unchanged. The navmesh is generated in the browser with `vendor/recast-generators.mjs` (a copy of `@recast-navigation/generators` 0.43.1 in the importmap), tiled so door blocking (poly flags) stays local. `zombies.{html,js,css}` is a trimmed copy of `game.js`'s loop (Kino's teleporter, reels and Easter eggs are left out; generic traps and teleporters come from markers: `updateTraps` and `updateTeleporters` in zombies.js, `buildTraps` and `buildTeleporters` in custom-world.js). Machine models face local +Z and markers face local +X, hence `FACE=π/2`.
- **Characters**: `characters.js` (registry `mods/characters/characters.json`; types `mannequin`, `gltf`, `t5`; `ThirdPersonCamera`). `mods/characters/mod.js` adds the character plus third person on T.
- **Upstream files with local edits** (keep them small): `game.js` (mod hooks plus render camera), `audio.js` (`def.baseId??def.id`), `.tools/serve.mjs` (`KINO_HOME`).
- `.tools/make-sandbox-map.py` generates the Sandbox example map (uses every marker). Map thumbnails are in `mods/maps/thumbs/`.
- Full modding docs: `export/web/mods/README.md`.

## Session history

- **2026-09-28**: Cloned into `~/projects/kino-der-toten`, installed git-lfs, and set up the `kino` quadlet on port 5190. Built the mod layer (data patches, weapon `extends`, script events), the progression/loadout mod, example weapons, the map hub, and the custom-map explorer with the sandbox example. Verified in headless Chromium: mods load without errors, kills grant XP, loadout and bonuses apply across a new game, and the sandbox loads with working collision. `npm test` passes (65 tests).
- **2026-09-28 (later)**: Added playable zombies on custom maps (`CustomWorld` plus `zombies.html`), the main menu at `/` (map browser, loadout editor, character select, mods), the characters system with third person, and the shared `profile.js`. Rebuilt Sandbox as a two-room zombies demo. Verified headlessly: zombies spawn, tear boards, climb in, path and attack; the door blocks and then unblocks navigation; machines face the right way; the loadout applies in Kino and custom maps; third person renders in both. The user plans to send real player models later; they go in `mods/characters/models/` and register in `characters.json`.
- **2026-09-28 (traps/teleporters)**: Added trap markers (`TRAP_<name>_<cost>` switch plus `TRAPZONE_<name>` areas as a cylinder or a mesh box; electric or fire; duration, cooldown and power options) and teleporters (`TELEPORT_<name>` pairs link both ways; `TPDEST_<name>_<seconds>` is one-way with an optional return timer and zone unlock). Sandbox gained a doorway electric trap and a one-way teleporter to a sniper tower with a Dragunov wall-buy. Verified headlessly: the trap kills zombies and hurts the player in its zone; the teleport, 20 s return and cooldown all work.

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

## Mod layer (fork-only files)

- `export/web/mod-loader.js`: `ModHost` loads `mods/mods.json`, deep-merges each mod's data patch into `game-data.json` (objects merge, arrays replace, `null` deletes, `{add,remove}` edits arrays, weapons support `"extends"`), wraps session and enemies methods to emit events (`kill`, `roundEnd`, `reset`, `gameOver`, `before*`), then runs the mod scripts.
- `export/web/game.js` has only about 7 small hook lines (import, `mods.load` on data fetch, `mods.start(api)` after load, `emit('start')`, `emit('update')`, `kino.mods`). Keep it that way so upstream merges stay easy.
- `export/web/mods/`: `README.md` (full modding docs and API), `progression/` (XP, levels, loadouts, bonuses; profile kept in localStorage under `kino.mods.progression`), `example-weapons/`, `_template/`, `maps.json` (hub registry), and `maps/sandbox/`.
- `export/web/maps.html` is the hub. `explorer.html` + `explorer.js` form a generic walk/fly viewer for any glTF/GLB map listed in `maps.json`. It builds collision from the triangles, or from `COL_*` meshes if present. Blender metres need `scale: 39.37`.
- `.tools/make-sandbox-map.py` generates the example GLB. `test/mod-loader.test.mjs` covers merge and extends.
- Mods hook Kino only. Moon and the explore-only maps don't load mods. Custom maps are explore-only: zombies on a custom map would need a navmesh plus entity data like `world.js` expects.

## Session history

- **2026-09-28**: Cloned into `~/projects/kino-der-toten`, installed git-lfs, and set up the `kino` quadlet on port 5190. Built the mod layer (data patches, weapon `extends`, script events), the progression/loadout mod, example weapons, the map hub, and the custom-map explorer with the sandbox example. Verified in headless Chromium: mods load without errors, kills grant XP, loadout and bonuses apply across a new game, and the sandbox loads with working collision. `npm test` passes (65 tests).

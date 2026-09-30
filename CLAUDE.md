# Kino der Toten (local modding fork)

The user's fork of luckeyfaraday/kino-der-toten, a Three.js browser reconstruction of Black Ops Zombies. Upstream dev guide: `AGENTS.md`. Modding docs: `export/web/mods/README.md`.

**Detailed notes live in `docs/fork/`. Read the relevant file before changing that system.** They hold the design, exact numbers and gotchas from earlier sessions.

| Area | File |
|---|---|
| Hosting, tunnel, Discord auth, cache headers, test browsers | `setup.md` |
| Main menu, profile, mod loader, settings, keybinds | `core.md` |
| Custom maps (`CustomWorld`, markers, navmesh, traps, teleporters) | `custom-maps.md` |
| Characters, motion model, procedural rig, FP arms, portraits | `characters.md` |
| Lighting mod, baked irradiance volume, beams, sun, viewmodel light | `lighting.md` |
| Map materials, normal maps, HD textures (map + weapons) | `materials.md` |
| Performance measurements and load-time warm-ups | `performance.md` |
| Health, HUD/hit sounds, zombie voices, music, cheat console | `gameplay.md` |
| Movement mod (crouch/prone/slide/mantle), stairs | `movement.md` |
| Moon weapons, Thundergun, weapon-part animation fix, ammo bulbs | `weapons.md` |
| Co-op (WebSocket rooms, protocol, downs/revives, lobby) | `coop.md` |
| Session history log | `history.md` |

## Setup essentials

- Branch `custom` = local work. `upstream` = original repo (`git fetch upstream && git merge upstream/main && git lfs pull`). `origin` = backup fork github.com/darkmedic043/kino-der-toten; push `custom` there after committing.
- Served by the quadlet `kino.container` on **port 5190** (5173 is taken by deskpet) via `.tools/kino-server.mjs`, with the checkout mounted read-only. Edits show on a browser refresh; no restart needed. Public at https://zombies.terminallysleepy.com through the user tunnel `cloudflared-deskpet-memory` (leave the root `cloudflared.service` alone).
- Discord secrets are in `~/.config/kino/discord.env`. Never print or commit them. Player data is in `~/.local/share/kino`.
- git-lfs is at `~/.local/bin/git-lfs` (about 1 GB of assets). Host Node is 20 (`npm test` still passes); the container uses 24.
- No system browser. Use Playwright's Chromium in `~/.cache/ms-playwright`. The upstream `.tools/test-*.mjs` scripts hard-code Windows paths.

## Rules that bite if forgotten

- **Visual checks go on the real GPU** (GTX 1660 Ti): `--use-angle=vulkan --enable-gpu --ignore-gpu-blocklist`. SwiftShader hides beam/bloom artefacts and draws points tiny. Check point sizes by maths.
- **Lighting**: never toggle a light's `.visible` (it recompiles every shader). Pool size is baked into shaders, so only resize it on a quality change. **Rebake** `baked-light.bin.gz` (`.tools/bake-lighting.mjs`) and `sunshafts.json` (`.tools/bake-sunshafts.mjs`) whenever fixtures or light sources change.
- Don't set `needsUpdate` on texture swaps (forces a program rebuild). Compile and upload during loading, not on the first played frame.
- Don't upload every weapon's HD textures up front (it fills VRAM). Preload only targeted ones.
- Colliders pushed onto `world.dynamic` need `.box` unless `window:true`, or `world.setDoors` crashes.
- Don't publish ripped or third-party game assets. The user supplies downloads (yt-dlp is blocked by the classifier).
- When adding a system, add its detail to the matching `docs/fork/*.md` file and a one-line entry to `history.md`. Keep this file short.

## Upstream files with local edits (keep them small)

`enemies.js` (co-op `targetFor` hook), `mystery-box.js` (display cache and warm-up), `animation.js` (weapon-part position tracks relative to bind), `player-controller.js` (step-up keeps speed), `settings.js` (graphics quality), `game.js`/`zombies.js` (`renderer` in the mod api and the `mods.renderWorld` hook), `game.js` (mod hooks, render camera, settings sensitivity/FOV, `installGameMenu`, box warm-up, cheat check on best round), `audio.js` (`def.baseId??def.id`), `.tools/serve.mjs` (`KINO_HOME`). Watch for these when merging upstream.

# Kino der Toten (local modding fork)

The user's fork of luckeyfaraday/kino-der-toten, a Three.js browser reconstruction of Black Ops Zombies. Upstream dev guide: `AGENTS.md`. Modding docs: `export/web/mods/README.md`.

**Detailed notes live in `docs/fork/`. Read the relevant file before changing that system.** They hold the design, exact numbers and gotchas from earlier sessions.

| Area | File |
|---|---|
| Hosting, tunnel, Discord auth, cache headers, test browsers | `setup.md` |
| Main menu, profile, mod loader, settings, keybinds | `core.md` |
| Custom maps (`CustomWorld`, markers, navmesh, traps, teleporters) | `custom-maps.md` |
| Characters, motion model, procedural rig, FP arms, portraits | `characters.md` |
| Lighting mod, baked irradiance volume, beams, sun, viewmodel light, mystery box map bulbs, Moon lighting | `lighting.md` |
| Map materials, normal maps, HD textures (map + weapons) | `materials.md` |
| Performance measurements and load-time warm-ups | `performance.md` |
| Health, HUD/hit sounds, zombie voices, music, cheat console | `gameplay.md` |
| Movement mod (crouch/prone/slide/mantle, BO7 omnimovement, dive, wall jump), first-person motion and mantle hand IK, stairs | `movement.md` |
| Moon weapons, Thundergun, weapon-part animation fix, ammo bulbs | `weapons.md` |
| Co-op (WebSocket rooms, protocol, downs/revives, lobby) | `coop.md` |
| Props: terminal booth (Blender generator, bake, placement mod) | `props.md` |
| Weapon levels, attachments, camos, Gunsmith view, scopes, flamethrower, Pack-a-Punch sound | `weapon-levels.md` |
| Classes, skill trees, Engineer turret | `classes.md` |
| One engine, maps as modules (`engine.js`, `maps/`) | `core.md` (Engine and maps) |
| Session history log | `history.md` |

## Setup essentials

- Branch `custom` = local work. `upstream` = original repo (`git fetch upstream && git merge upstream/main && git lfs pull`). `origin` = backup fork github.com/darkmedic043/kino-der-toten; push `custom` there after committing.
- Served by the quadlet `kino.container` on **port 5190** (5173 is taken by deskpet) via `.tools/kino-server.mjs`, with the checkout mounted read-only. Edits show on a browser refresh; no restart needed. Public at https://zombies.terminallysleepy.com through the user tunnel `cloudflared-deskpet-memory` (leave the root `cloudflared.service` alone).
- Discord secrets are in `~/.config/kino/discord.env`. Never print or commit them. Player data is in `~/.local/share/kino`.
- git-lfs is at `~/.local/bin/git-lfs` (about 1 GB of assets). Host Node is 20 (`npm test` still passes); the container uses 24.
- No system browser. Use Playwright's Chromium in `~/.cache/ms-playwright`. The upstream `.tools/test-*.mjs` scripts hard-code Windows paths.
- BO1 (base game) is installed via Steam; OpenAssetTools is built at `~/.local/opt/OpenAssetTools`. `.tools/build_wonder_weapons.py` builds extra wonder weapons from it into `mods/wonder-weapons/` (git-ignored assets; see `weapons.md`).
- Blender 5.2.2 (portable, `~/.local/bin/blender`) builds the terminal booth: `.tools/build-terminal-booth.py` (about 14 min per variant with the bake).

## Rules that bite if forgotten

- **Visual checks go on the real GPU** (GTX 1660 Ti): `--use-angle=vulkan --enable-gpu --ignore-gpu-blocklist`. SwiftShader hides beam/bloom artefacts and draws points tiny. Check point sizes by maths.
- **Lighting**: never toggle a light's `.visible` (it recompiles every shader). Pool size is baked into shaders, so only resize it on a quality change. **Rebake** `baked-light.bin.gz` (`.tools/bake-lighting.mjs`) and `sunshafts.json` (`.tools/bake-sunshafts.mjs`) whenever fixtures or light sources change.
- Don't set `needsUpdate` on texture swaps (forces a program rebuild). Compile and upload during loading, not on the first played frame.
- Don't upload every weapon's HD textures up front (it fills VRAM). Preload only targeted ones.
- Colliders pushed onto `world.dynamic` need `.box` unless `window:true`, or `world.setDoors` crashes.
- Don't publish ripped or third-party game assets. The user supplies downloads: yt-dlp is blocked for me by the classifier, so give the user a command with the output template quoted (`-o "$HOME/Downloads/name.%(ext)s"`).
- **Mod order matters** (`mods/mods.json`): `weapon-levels` must load before `progression`, or the starting gun is built before attachments apply.
- **Profile saves**: `kino.mods.progression` is shared. Any code that saves a cached copy must take `weaponXp`/`attachments`/`camo` from storage first, or it wipes weapon XP and camo progress.
- **Attachments**: BO1 viewmodels carry every attachment, hidden by `hideTags`. Read availability from the *pristine* `hideTags` (applying attachments un-hides tags). Viewmodels are cached, so re-show bones on equip. Surfaces share one vertex buffer, so iterate a mesh's **index**, and treat a mesh as hidden when its dominant bone chain is scaled ~0. Some Pack-a-Punched guns show extra parts natively (the Commando's dual mag, the PM63's extended mag): compare against the stock base/upgrade `hideTags` before treating a part as attachment-added.
- Materials are shared between copies of a model: per-mesh changes (hiding dot cards) must not be skipped by a per-material "already patched" check, and temporary material changes (Gunsmith pulse) must be restored.
- When adding a system, add its detail to the matching `docs/fork/*.md` file and a one-line entry to `history.md`. Keep this file short.

## Upstream files with local edits (keep them small)

**Architecture (2026-10-02, user decision):** upstream's `game.js`, `moon.js` and `moon-combat.js` (and the fork's `zombies.js`) were replaced by one engine, `engine.js` (play.html?map=<id>), with map modules `maps/kino.js`, `maps/moon.js`, `maps/custom.js`; `index.html`/`zombies.html`/`moon.html` redirect. Upstream changes to those files no longer merge: port them by hand into the engine or the map module. Upstream's Cloudflare staging (`.tools/stage-cloudflare.mjs`) still bundles game.js and is unused here (the fork serves through kino-server + tunnel). The edits listed below that say game.js/zombies.js now live in engine.js.

`enemies.js` (co-op `targetFor` hook), `game.js`/`zombies.js` (`effect()` emits `effect` for the fx mod), `mystery-box.js` (display cache and warm-up), `animation.js` (weapon-part position tracks relative to bind), `player-controller.js` (step-up keeps speed), `settings.js` (graphics quality), `game.js`/`zombies.js` (`renderer` in the mod api and the `mods.renderWorld` hook), `game.js` (mod hooks, render camera, settings sensitivity/FOV, `installGameMenu`, box warm-up, cheat check on best round), `audio.js` (`def.baseId??def.id`), `.tools/serve.mjs` (`KINO_HOME`), `game.js`/`zombies.js` (analog `kino.gamepad.move` added to forward/strafe/sprint for the controller mod), `game.js`/`zombies.js` (hip/pellet spread read `def.hipSpread`/`def.pelletSpread`; sprint on any move direction, not while sliding/diving). Watch for these when merging upstream.

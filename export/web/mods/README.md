# Mods

Local modding layer for this fork. Upstream files are only lightly touched,
so `git pull upstream main` stays easy (see "Updating from upstream" below).
Edit files here, then refresh the browser. Nothing needs rebuilding or
restarting. Mods currently hook into **Kino der Toten** (`index.html`) only.

- `mods.json` lists enabled mod folders, in load order.
- `maps.json` lists the maps shown on the hub page (`/maps.html`).
- `_template/` is a starting point. Copy it, rename it, and add the name to `mods.json`.

## A mod folder

```
mods/my-mod/
  mod.json    {"name", "description", "data": "data.json" (or a list), "script": "mod.js"}
  data.json   optional patch merged into game-data.json
  mod.js      optional ES module; its default export runs after the game loads
```

### Data patches (no code)

A patch is deep-merged into `game-data.json` before the game uses it:

- Objects merge key by key. Arrays and plain values replace. `null` deletes a key.
- An array can be edited with `{"add": [...], "remove": [...]}`, for example `"boxPool": {"add": ["my_gun_zm"]}`.
- A weapon with `"extends": "<existing id>"` copies that weapon (model, animations, sounds and Pack-a-Punch upgrade) and overrides only the fields you give. This is how new weapons are added, since new viewmodels and animations would need the asset pipeline. Override `upgrade` fields the same way (`"upgrade": {"name": "...", "damage": ...}`).
- Useful weapon fields: `name, price, damage, minDamage, range, clipSize, startAmmo, maxAmmo, fireTime` (seconds per shot), `reloadTime, reloadEmptyTime, automatic, fireType` ("Single Shot", "Full Auto", "3-Round Burst"), `pellets, headMultiplier, explosionRadius, explosionInnerDamage, explosionOuterDamage, projectileSpeed`.
- Useful `rules`: `zombie_score_start_1p, zombie_health_start, zombie_health_increase, zombie_max_ai, zombie_powerup_drop_increment, zombie_powerup_drop_max_per_round`.
- The original ids are the keys of `weapons` in `game-data.json` (`m1911_zm`, `ray_gun_zm`, `thundergun_zm`, and so on).

A weapon only shows up in a match through the Mystery Box (`boxPool`), a loadout (progression mod), or a script (`api.session.giveWeapon(id); api.equipView()`). Wall-buys are map entities. To repoint one, change the `zombie_weapon_upgrade` of the matching entry in `api.data.entities` inside a script.

### Scripts

`export default function setup(api)` (it may be async). `api` contains:

| name | what |
|---|---|
| `data` | merged game data |
| `session` | game state: `points, round, health, inventory, perks, power, kills, phase`, plus `addPoints(n)`, `spend(n)`, `giveWeapon(id)` |
| `enemies` | `list`, `spawn(pos, null, kind)`, `hurt(z, dmg)` |
| `world, player, scene, camera, audio, features, mysteryBox, powerups` | engine objects (THREE.js scene and camera) |
| `toast(text, seconds)`, `announce(title, small, seconds)` | on-screen messages |
| `equipView()` | call after changing `session.inventory` or `slot` |
| `getState()`, `reset()`, `damage(n)` | game helpers |
| `host.on(event, fn)` | subscribe; returns an unsubscribe function |
| `mod` | `{id, url, manifest}`; use `new URL('file.json', mod.url)` to load your own files |

Events:

| event | payload | notes |
|---|---|---|
| `ready` | — | all mods set up |
| `start` | — | first round begins (Enter the Theater) |
| `update` | `dt` | every frame while playing |
| `kill` | `{enemy, kind, head, melee}` | `kind` is `zombie`, `dog` or `nova` |
| `roundEnd` | `{round}` | the round just survived |
| `reset` | — | new game; session is already reset, so change `session.inventory` here |
| `gameOver` | `{round, kills}` | |
| `beforeDamage` | `{amount}` | damage to the player; change `amount` to scale it |
| `beforePoints` | `{amount}` | points earned; change `amount` |
| `beforeEnemyDamage` | `{enemy, amount, head, melee, cause}` | change `amount` |

Errors from mods are logged to the browser console and kept in `kino.mods.errors`.
A broken mod is skipped and does not stop the game.

## Included mods

- **progression**: XP, levels, loadouts and bonuses. Tune it in `progression/progression.json` (XP values, level curve, which level unlocks each weapon and bonus). Progress is saved in the browser's localStorage, so each browser or device has its own profile. `kino.progression.reset()` in the console wipes it.
- **example-weapons**: the Golden Python and MP40 Drum, both made with `extends` and added to the Mystery Box.

## Maps

`/maps.html` lists everything in `maps.json`. An entry with `url` links to an
existing page. An entry with `dir` opens in the generic walk/fly explorer
(`explorer.html?map=<id>`):

```json
{ "id": "my-map", "title": "My Map", "mode": "Explore",
  "dir": "mods/maps/my-map/", "model": "my-map.glb",
  "scale": 39.37, "spawn": { "position": [0, 5, 0], "yaw": 0 },
  "background": "#20262b", "exposure": 1.4 }
```

- **From Blender:** File → Export → glTF 2.0 (`.glb`), then put the file in `mods/maps/<id>/`. Blender works in metres and the game in inches, so use `"scale": 39.37`. `spawn.position` is in game units (after scaling), and `yaw` is in degrees.
- **Collision** is built at load time from the map's triangles. For a simpler collision mesh, add meshes named `COL_...`. When any exist, only those collide, and they are hidden.
- `.tools/make-sandbox-map.py` builds the example `sandbox` map and shows the format.

Custom maps are explore-only for now. Zombies gameplay on a map needs a
navmesh, spawn points, barriers and buyables (see how `world.js` reads
`game-data.json` entities). That is the next big step if you want playable
custom maps.

## Updating from upstream

This checkout tracks the original project as the `upstream` remote on the
`custom` branch:

```bash
git fetch upstream && git merge upstream/main   # then: git lfs pull
```

Conflicts can only appear in the few `mods` lines in `export/web/game.js`.

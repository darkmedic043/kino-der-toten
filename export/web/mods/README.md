# Mods, maps and characters

Local modding layer for this fork. Upstream files are touched only in a few
marked lines, so `git merge upstream/main` stays easy (see the last section).
Edit files here and refresh the browser. Nothing needs rebuilding or
restarting.

- `/` is the **main menu** (`home.html`): map browser, loadout, character select and mods list.
- `mods.json` lists enabled mod folders, in load order.
- `maps.json` lists the maps in the menu's map browser.
- `characters/characters.json` lists playable characters.
- `_template/` is a starting point for a new mod.

Mods load in **Kino der Toten** (`index.html`) and on **custom zombies maps**
(`zombies.html`). Moon and the explore-only ports don't load mods.

---

## Maps

### Registry (`maps.json`)

```json
{ "id": "my-map", "title": "My Map", "description": "Shown in the menu.",
  "modes": ["zombies", "explore"], "image": "mods/maps/thumbs/my-map.jpg",
  "dir": "mods/maps/my-map/", "model": "my-map.glb", "scale": 39.37,
  "background": "#20262b", "exposure": 1.0, "fog": 0.0002 }
```

- An entry with `url` links to an existing page, such as the built-in maps.
- An entry with `dir` + `model` is a custom map. `"zombies"` opens `zombies.html?map=<id>`, and `"explore"` opens the walk/fly `explorer.html?map=<id>`.
- `scale`: game units are inches, and Blender exports metres, so use **39.37**.
- `image` is optional. Without one, the menu draws a title card.

### Building a zombies map in Blender

1. Model the level: floors, walls, stairs and props. Everything you can see is solid by default.
2. Optional: give it a simpler collision shell by adding meshes named `COL_...`. When any exist, only they are solid, and they are hidden in game.
3. Add **empties** (Add → Empty → Plain Axes) with the names below. For machines and wall-buys, rotate the empty so its **red X axis points the way the machine should face** (out into the room).
4. File → Export → glTF 2.0 (`.glb`), then save it to `mods/maps/<id>/` and add an entry to `maps.json`.

Blender's `.001` duplicate suffixes are ignored, so you can copy markers
freely. Settings can come from the name (`DOOR_yard_1250`) or from the
object's **Custom Properties**, which glTF exports as "extras" (`cost`, `zone`,
`weapon`, `perk`, `width`, `height`, `electric`, `start`). Custom properties win
when both are present.

| Name | What it does |
|---|---|
| `PLAYER_SPAWN` | Where you start. The red axis sets the facing. |
| `ZSPAWN_<zone>` | Zombie spawn point. Zones start active if named `start` (or unnamed); other zones activate when a door into them opens. |
| `WINDOW_<zone>` | A boarded window. Put it in a wall opening, with a `ZSPAWN` just outside (within 400 units). Zombies spawn outside, tear down 6 boards, then climb in. Players can rebuild the boards for points. Optional properties: `width` (56) and `height` (64). |
| `DOOR_<zone>_<cost>` | A **mesh** (not an empty) that blocks a doorway. Buying it removes it and activates `<zone>`. Default cost 750. The custom property `electric: true` makes it open with the power instead. |
| `WALLBUY_<weapon id>` | Wall weapon, for example `WALLBUY_mp40_zm` or `WALLBUY_m14`. Price comes from the weapon data. Ammo costs half. |
| `PERK_<jugg\|revive\|speedcola\|doubletap>` | Perk machine. Perks other than Quick Revive need the power on. |
| `BOX` / `BOX_start` | Mystery Box location. Add several so it can move. `BOX_start` is where it begins. |
| `PAP` | Pack-a-Punch (needs power). |
| `POWER` | Power switch. **Without one, the power is on from the start.** |
| `CLAYMORE` | Claymore wall-buy (1000). |

The navmesh zombies walk on is generated in the browser from the level's
geometry at load time (a few seconds on big maps). Zombies can climb steps up to
18 units (about 0.45 m) and need 70 units (1.8 m) of headroom. Blocked doors
cut the navmesh until opened.

`.tools/make-sandbox-map.py` builds the **Sandbox** example and uses every
marker. Read it alongside this table.

Not supported on custom maps yet: traps, teleporters, Easter eggs, hellhound
fog, and custom lighting beyond the map entry settings.

---

## Characters

Choose one in the main menu under **Character**. In a game, **T** toggles third
person. Register characters in `characters/characters.json`:

```json
{ "id": "soldier", "name": "Soldier", "description": "…",
  "type": "gltf", "model": "models/soldier.glb", "height": 72, "yaw": 0 }
```

- **`gltf`**: any `.glb`/`.gltf` in `characters/models/`. It is scaled to `height` units (72 is about 1.83 m), or set `scale` instead. Use `yaw` (degrees) if it doesn't face forward. Animation clips whose names contain `idle`, `walk` and `run`/`sprint` play automatically. Rigged models from Mixamo or Blender work well.
- `mannequin`: the built-in placeholder (`color`, `accent`).
- `t5`: a body/head pair from the game data, like the Honor Guard example.
- `hands` (advanced): a replacement first-person arms model. It has to use the T5 viewmodel skeleton, so most characters leave it out and keep the default arms.

---

## Mod folders

```
mods/my-mod/
  mod.json    {"name", "description", "data": "data.json" (or a list), "script": "mod.js"}
  data.json   optional patch merged into game-data.json
  mod.js      optional ES module
```

### Data patches (no code)

A patch is deep-merged into `game-data.json` before the game uses it:

- Objects merge key by key. Arrays and plain values replace. `null` deletes a key.
- An array can be edited with `{"add": [...], "remove": [...]}`, for example `"boxPool": {"add": ["my_gun_zm"]}`.
- A weapon with `"extends": "<existing id>"` copies that weapon (model, animations, sounds and Pack-a-Punch upgrade) and overrides only the fields you give. Override `upgrade` fields the same way (`"upgrade": {"name": "...", "damage": ...}`). On custom maps, the Thundergun and Ray Gun special effects carry over to weapons that extend them (in Kino they stay tied to the original ids).
- Useful weapon fields: `name, price, damage, minDamage, range, clipSize, startAmmo, maxAmmo, fireTime` (seconds per shot), `reloadTime, reloadEmptyTime, automatic, fireType` ("Single Shot", "Full Auto", "3-Round Burst"), `pellets, headMultiplier, explosionRadius, explosionInnerDamage, explosionOuterDamage, projectileSpeed`.
- Useful `rules`: `zombie_score_start_1p, zombie_health_start, zombie_health_increase, zombie_max_ai, zombie_powerup_drop_increment, zombie_powerup_drop_max_per_round`.

Weapons reach a match through the Mystery Box (`boxPool`), wall-buys on
custom maps, loadouts, or scripts.

### Scripts

A script's default export runs after the game loads: `export default function setup(api)`, which may be async.
It can also export `prepare(data)`, which runs before the game builds anything and may return changed data.

| `api.` | what |
|---|---|
| `data` | merged game data |
| `session` | game state: `points, round, health, inventory, perks, power, kills, phase`, plus `addPoints(n)`, `spend(n)`, `giveWeapon(id)` |
| `enemies` | `list`, `spawn(pos, null, kind)`, `hurt(z, dmg)` |
| `world, player, scene, camera, audio, features, mysteryBox, powerups` | engine objects (THREE.js scene and camera) |
| `map` | the `maps.json` entry (custom maps only) |
| `toast(text, s)`, `announce(title, small, s)` | on-screen messages |
| `equipView()` | call after changing `session.inventory` or `slot` |
| `getState()`, `reset()`, `damage(n)` | game helpers |
| `host.on(event, fn)` | subscribe; returns an unsubscribe function |
| `host.camera`, `host.hideViewmodel` | render from another camera, hide the gun (used by third person) |
| `mod` | `{id, url, manifest}`; use `new URL('file.json', mod.url)` to load your own files |

| event | payload | notes |
|---|---|---|
| `ready` | — | all mods set up |
| `start` | — | first round begins |
| `update` | `dt` | every frame while playing |
| `kill` | `{enemy, kind, head, melee}` | `kind`: `zombie`, `dog`, `nova` |
| `roundEnd` | `{round}` | round just survived |
| `reset` | — | new game; change `session.inventory` here |
| `gameOver` | `{round, kills}` | |
| `beforeDamage` | `{amount}` | damage to the player; change `amount` |
| `beforePoints` | `{amount}` | points earned; change `amount` |
| `beforeEnemyDamage` | `{enemy, amount, head, melee, cause}` | change `amount` |

Errors are logged to the console and kept in `kino.mods.errors`. A broken mod
is skipped.

### Included mods

- **progression**: XP, levels, loadouts and bonuses. Tune it in `progression/progression.json`. The profile is in the browser's localStorage (shared by the menu and every map); `kino.progression.reset()` in a game console wipes it.
- **characters**: character model plus the third-person view.
- **example-weapons**: the Golden Python and MP40 Drum.

---

## Updating from upstream

This checkout is the `custom` branch. `upstream` is the original project.

```bash
git fetch upstream && git merge upstream/main && git lfs pull
```

Upstream files with small local edits: `game.js` (mod hooks), `audio.js`
(`baseId` for extended weapons' sounds) and `.tools/serve.mjs` (`KINO_HOME`).
All other fork files are new: `home.*`, `zombies.*`, `custom-world.js`,
`characters.js`, `profile.js`, `mod-loader.js`, `explorer.*`, `mods/` and
`vendor/recast-generators.mjs`.

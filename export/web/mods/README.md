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
| `TRAP_<name>_<cost>` | Trap switch (default 1000). Activates every `TRAPZONE_<name>`. Properties: `kind` (`electric` or `fire`), `duration` (30 s), `cooldown` (90 s, counted from activation), `power` (needs power, default true). Zombies inside die; players inside take damage. |
| `TRAPZONE_<name>` | The trap's area. An **empty** makes a cylinder (`radius` 100, `height` 120). A **mesh** makes a zone the size of its bounding box, and the mesh is hidden. Use several for one trap. |
| `TELEPORT_<name>` | Teleporter pad. **Two pads with the same name** link both ways (you arrive in front of the other pad, facing its red axis). **One pad plus `TPDEST_<name>`** is one-way. Properties: `cost` (0), `cooldown` (20 s for pairs, 90 s one-way), `power` (default true). |
| `TPDEST_<name>_<seconds>` | One-way destination. With a number or a `return` property, you are sent back to the pad after that many seconds, like Kino's projection room. A `zone` property unlocks that zone's spawns when you arrive. |
| `EGG_<group>` | Easter-egg collectible. An empty shows a small glowing rock; a mesh uses your own model. Press F to collect it, or give it `shoot: true` to make it a shoot-to-find item. Finding every item in a group gives a reward, set on any item: `reward: "song"` (the 115 song; the default), `points`, `weapon` (an id), `perk` (`jugg`/`revive`/`speedcola`/`doubletap`) and `message` (the announcement). Mods get an `easterEgg` event. |

**Lighting.** Lights added in Blender (point, spot, sun) export with the
`.glb` and appear in game. Point and spot brightness and range are scaled
along with the map, so they look the same as in Blender. Name a light
`POWERLIGHT_...` (or put it under an object with that name) to keep it off until
the power is on. `background`, `exposure` and `fog` in the map entry set the
mood. Hellhound rounds add their own fog automatically.

**Warnings.** Markers that can't be used (for example, a window with no
`ZSPAWN` nearby, an unknown weapon, or a teleporter without a partner) are
listed in red on the map's start menu, as well as in the browser console.

The navmesh zombies walk on is generated in the browser from the level's
geometry at load time (a few seconds on big maps). Zombies can climb steps up to
18 units (about 0.45 m) and need 70 units (1.8 m) of headroom. Blocked doors
cut the navmesh until opened.

`.tools/make-sandbox-map.py` builds the **Sandbox** example and uses every
marker. Read it alongside this table.

Not supported on custom maps yet: scripted multi-step quests (use a mod
script with the `easterEgg`, `kill` and `update` events for those).

---

## Characters

Choose one in the main menu under **Character**. In a game, **T** toggles third
person. Register characters in `characters/characters.json`:

```json
{ "id": "soldier", "name": "Soldier", "description": "…",
  "type": "gltf", "model": "models/soldier.glb", "height": 72, "yaw": 0 }
```

- **`gltf`**: any `.glb`/`.gltf` in `characters/models/`. It is scaled to `height` units (72 is about 1.83 m), or set `scale` instead. Use `yaw` (degrees) if it doesn't face forward. Animation clips whose names contain `idle`, `walk` and `run`/`sprint` play automatically. Rigged models from Mixamo or Blender work well.
### Importing your own character

1. **Get a rigged model.** Any humanoid works. The easiest route is
   [Mixamo](https://www.mixamo.com) (free):
   - Upload your model, or pick one of theirs, and let it auto-rig.
   - Download the character as **FBX, With Skin**.
   - Download an **Idle**, a **Walking** and a **Running** animation, each as **FBX, Without Skin**, "In Place" ticked.
2. **Combine them in Blender.**
   - File → Import → FBX, first the character and then each animation.
   - In the Action Editor (Dope Sheet → Action Editor), rename the actions to `idle`, `walk` and `run`, and push each one down to an NLA track.
   - Delete the extra imported armatures, so only your character's armature and mesh remain.
3. **Export.** File → Export → glTF 2.0. Set Format to **glTF Binary (.glb)**, and under Animation turn on **Group by NLA Track**. Textures are embedded automatically.
4. **Check it.** Main menu → Character → **Preview a model file**, then pick the `.glb`. It shows the model and lists which clips it matched to idle, walk and run and any missing textures. It also prints the exact `characters.json` entry to use.
5. **Install it.** Copy the `.glb` to `mods/characters/models/`, paste the entry into `characters/characters.json`, and refresh. It now appears in the character list, and in game in third person (T).

**No animations?** A rigged humanoid without clips (common for Sketchfab downloads) is **animated procedurally**. The skeleton is detected from its shape, and the game drives an idle stance (arms lowered from a T-pose), a walk and run with knee bend, a gun-aiming pose in third person, and a swaying tail if the rig has one. Set `"procedural": false` to turn this off.

**Credits.** For a licensed model (CC-BY, for example), add a `credit` object. It is shown on the character card, in the preview caption, and under Mods → Credits:
`"credit": {"title": "…", "author": "…", "authorUrl": "…", "source": "…", "license": "CC-BY-4.0", "licenseUrl": "…"}`.
Keep the model's licence file next to it, and add it to `CREDITS.md` at the repo root.

Clip names only need to *contain* idle, walk or run/sprint (for example
`Armature|Walking` works). A model without animations still works; it just
slides around in a fixed pose. If it faces backwards, add `"yaw": 180`.

- **Held weapon (third person)**: your current weapon is attached to the character's right hand. The hand bone is found automatically (names like `RightHand`, `mixamorig:RightHand` or `hand_r`); set `"handBone"` if it's named something else. If the gun sits wrong, adjust it with `"weapon": {"position": [x, y, z], "rotation": [x, y, z], "scale": 1}` (rotation in degrees, relative to the hand bone). The mannequin raises its arms to aim; animated models keep their own arm animation, so a Mixamo "rifle" idle, walk or run set looks best.
- `mannequin`: the built-in placeholder (`color`, `accent`).
- `t5`: a body/head pair from the game data, like the Honor Guard example.
- **Real first-person arms** (`"fpArms": true`): the character's *own* arms and hands appear in first person. Weapon animations only exist for the game's arm skeleton, so that rig keeps running hidden, and the model's shoulder, elbow, wrist, palm and every finger joint are posed onto it each frame. The wrist is pinned to the grip, and the hands are sized by the palm. The rest of the body is hidden. It works with weapons, reloads, the knife and perk drinks. The rig needs arm bones with "arm" in the name, a hand under the forearm, and finger chains named thumb/index/middle/ring/little (or pinky), which covers Mixamo rigs and most Sketchfab humanoids. The Protogen uses this.
- **First-person arms**: `hands` picks the arm set shown holding your weapon. Arms have to be rigged to the game's viewmodel skeleton, so choose one of the built-in sets: `pow` (bare forearms, Kino's default), `usmc` (gloves plus sleeves) or `pressure_suit` (Moon's suit). You can also give the path to a compatible `.glb`. Recolour the set with `handsTint`, which maps a material-name fragment to a colour (`usmc` has `glovesleeve` and `glove` materials, and `"*"` matches every material). Add `"handsFlat": true` for solid colours with no texture. Example: `"hands": "usmc", "handsTint": {"glovesleeve": "#2f5e8c", "glove": "#6b6960"}`. Check the result in the menu's Character tab with **First person**.

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
| `easterEgg` | `{name}` | an `EGG_` group was completed (custom maps) |
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
- **moon-weapons**: the Zap Guns / Wave Gun (B combines or splits) and the Death Machine from Moon, using the original assets from this project's Moon export, in the Mystery Box.
- **example-weapons**: the Golden Python and MP40 Drum.

---

## Accounts and saving

Progress (XP, loadout, character, settings, best rounds) is saved in the
browser. When a player signs in with Discord from the main menu, it is also
saved on the server in `~/.local/share/kino`, and whichever copy is newer wins
when they sign in on another device. Sign-in only works on the https address
(https://zombies.terminallysleepy.com), which is the redirect registered with
Discord; on the LAN address the game still saves locally and links there.
The server is `.tools/kino-server.mjs`. The Discord client id and secret go in
`~/.config/kino/discord.env` (never in the repo).

## Co-op (up to 4 players)

Host from the main menu (**Host co-op game** on a zombies map), then share the
invite link (pause menu → **Copy invite**) or the 4-letter room code (**Join
co-op** on the Play tab). The host's browser runs the zombies and rounds; the
server (`.tools/kino-server.mjs`, `/api/ws`) only relays messages.

- Zombies chase the nearest standing player; rounds grow with player count.
- Hits from any player count; points and XP go to the shooter.
- Shared: doors, power, window boards, the Mystery Box location (teddy moves
  and fire sales), power-ups (anyone can grab one; everyone gets the effect)
  and trap activations. Weapons, perks, points and Pack-a-Punch stay personal.
- A lethal hit downs you instead (unless you have Quick Revive, which still
  self-revives). A teammate holds F nearby for 3 s (1.5 s with Quick Revive)
  to revive you. After 30 s you bleed out and spectate (Space switches
  player) until the next round. When everyone is down, it's game over.
- If the host pauses or switches tabs, the game keeps running. If the host
  leaves, the longest-connected player becomes the new host.

## Movement

`mods/movement/data.json` sets gravity, jump height, ground/air acceleration,
head bob and landing dip strength. Head bob can be turned off in Settings.

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

# Porting a Black Ops III map and its weapons: the guide

A working order and a set of checks for bringing a Black Ops III zombies map (stock, DLC or a Workshop custom map) into Melon Zombies, with its wonder weapons, lighting, scripts and textures. It is distilled from the two ports done so far, **The Giant** (`zm_factory`, 2026-10-07) and **Der Eisendrache** (`zm_castle`, 2026-10-16 onwards), and from every mistake the user reported on them.

- This file says **what to do and what to check**. The full story of each decision, with numbers, is in `waw-ports.md` (the two "Black Ops III maps" sections and the Der Eisendrache sections at its end), `lighting.md`, `materials.md`, `weapons.md`, `custom-maps.md` and `performance.md`. Section headings below name the place to read.
- Where this guide and the code disagree, the code is right: fix the guide.
- Written 2026-11-14. Items marked **(not verified)** were never tested here.

## 0. Before starting

**What a port is made of**

| Piece | Where it lives | In git? |
|---|---|---|
| Raw dumps and exports | `export_game/bo3/` (`maps/<bsp>/`, `xmodels/`, `xanims/`, `ximages/`, `sounds/`) | No (ripped) |
| Built map: GLB, `tex/`, `sky/`, `light.bin.gz`, `detail.json` | `export/web/mods/maps/<id>/` | No (ripped) |
| Map entry | `export/web/mods/maps.json` | Yes |
| Map mod: look, lights, quests, bosses, traps | `export/web/mods/<id>/` (`mod.js`, `mod.json`, one file per system) | Code yes, asset folders no |
| Weapons | `export/web/mods/bo3-weapons/` (`weapons.json`, `models/`, `animations/`) | Code yes, assets no |
| Builders and checkers | `.tools/` | Yes |

**Rules that apply to every step**

- **Nothing ripped is ever committed or installed by Rind.** Every new output folder with game data gets its own `.gitignore` containing `*`, and nothing in it may match the `OWN` list in `.tools/install-manifest.mjs`. Check with `git status --short` before each commit: a new asset folder must not show up.
- **`export/web` is live.** A file saved there is what players load on their next refresh. Build into a scratch folder or behind a `?flag` first when the user is playing.
- **Memory.** Blender builds, the light bake and ray tools run under `systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G nice -n 15 <cmd>` (the castle's after-rebuild steps and its light bake run with a 6 GB cap), one at a time. Browser tests go through `~/.local/bin/lowpri` and `flock scratch/melon/heavy.lock`, one page at a time.
- **BO3 has to be running for the dump and for Greyhound, and closed for tests.** It holds about 4.4 of the card's 6 GB; a test started beside it loses its WebGL context.
- **The user starts the game.** Ask them to launch BO3 with the launch option `STEAM_COMPAT_LAUNCHER_SERVICE=proton %command%` and load the map (solo match, any round). For a boss or special enemy, ask them to play until one has spawned: its animations are only in memory after that.

**The order that works**

1. Dump the level and its entities (1.1), read the lights from the fastfile (1.4).
2. Export textures, prop models, animations and sounds with Greyhound (1.2, 1.3).
3. Build the map (2) with a first `maps.json` entry, in **explore** mode only.
4. Collision and navmesh until every area is reachable (2.4, 10).
5. Materials: alpha, overlays, missing colours, void planes (3).
6. Lighting: look, lamps, baked volume, sky, grade (4).
7. Map functions from the entities: doors, power, perks, box, Pack-a-Punch, windows, spawns (6). Switch on **zombies** mode.
8. Scripts: zones, traps, teleporters, quests, bosses, one script file at a time (5).
9. Weapons and equipment (7), zombies and sound (8).
10. Performance pass and warm-up (9), then the release checklist (11).

## 1. Getting the data out of the game

### 1.1 The level: `bo3_dump_map.py`

No tool here reads a BO3 fastfile's geometry, so the level comes from the running game's memory (`/proc/<pid>/mem`; needs `kernel.yama.ptrace_scope` 0).

```
python3 -I .tools/bo3_dump_map.py            # the map that is loaded right now
python3 -I .tools/bo3_dump_map.py --scan     # after a game update: find the asset-pool table again
```

- Output in `export_game/bo3/maps/<bsp>/`: `<bsp>.json` (surfaces, materials with every image and its semantic hash, static models with origin, axes and scale), `<bsp>.positions.bin`, `.vdata.bin`, `.indices.bin`, and `<bsp>.ents` (the entity string: every trigger, struct, spawner and script_model).
- The process is picked by its comm `Main`. If it says "asset pool table not found", it matched a Steam launcher or the game was updated: pass `--pid`, or run `--scan` and use the address it prints as `--pools`.
- Check the dump before going on: the surface, vertex and static-model counts should be in the range of the earlier maps (`zm_castle`: 9,330 surfaces, 1.44 M vertices, 33,561 static models, 3,342 entities), and `<bsp>.ents` must contain `info_player_start`.
- **Workshop maps (not verified):** the dump reads whatever map is loaded, so a custom map should dump the same way. Its bsp name is the mod's map name; add it to `MAPCFG` in the builder (2.2).

### 1.2 Textures, models, animations: Greyhound

Details: `weapons.md`, "Black Ops III assets (Greyhound)". Greyhound 1.46 sits at `C:\greyhound` in BO3's Proton prefix and must be started **inside the game's Steam Runtime container** (`steam-runtime-launch-client --bus-name=com.steampowered.App311210 ... wine 'C:\greyhound\Greyhound.exe'`), or it cannot see the game. `scratch/aw2/gh.sh` is a working driver (session script: copy it).

- One batch = kill Greyhound (`pkill -x Greyhound.exe`, never `-f`), relaunch, Load Game, paste a comma-separated name list into the search box (`xclip` + `ctrl+v`), Search, Export All, wait until `TheHoundsLog.txt` stops growing. Its input dies after one export, so relaunch for every batch.
- **Never run Export All on an empty search**: it exports the whole game (7.5 GB).
- `greyhound.json`: `exportmodelimg` off (exporting a model with its images froze it); export images in their own batch by name.
- What to export, in this order:
  1. Every image named in `<bsp>.json`'s materials (the map's own textures).
  2. Every static-model name in `<bsp>.json` and every `model` in `<bsp>.ents`. A long Export All can stop part way: compare the export folder with the list and run the rest again.
  3. The prop models' own textures: read each SEModel's material names and export those (a search by model name also catches `i_mtl_*` images).
  4. fxanim models and their animations (`p7_fxanim_*`): doors, gates, bridges, machines, quest pieces. Scenes spawn pieces that are in neither the static models nor the entities; search the scene's name.
  5. The sky model and its panorama (`skybox_<bsp>`).
  6. Weapons (7), zombies and bosses (8).
- A Workshop map's or pack's own textures export with no file until its xpaks are hard-linked into BO3's `zone/` (7.1).
- Greyhound writes models in **centimetres**. The game and the dump are in inches: everything from an SEModel is scaled by 1/2.54 (the builders do this; a new converter must too).
- Copy what the weapon and equipment builders need into `export_game/bo3/` (`xmodels/<name>/<name>_LOD0.semodel`, `xanims/*.seanim`, `ximages/*.png`); the map builder reads Greyhound's export folder directly (`GH` at the top of `build_bo3_map.py`).

### 1.3 Sound

- A map's banks: `zone/snd/all/<bsp>.all.sabs` (streamed: music) and `<bsp>.all.sabl` (loaded: effects), and `zone/snd/en/<bsp>.en.sabs` for English voice lines. They are FLAC streams.
- `python3 -I .tools/extract_sabl.py <bank.sabl> <out dir> <substring>...` pulls effects by name without Greyhound. Greyhound's Load File opens the `.sabs` banks without the game running (names are hashes there: pick music by length and loudness, and say in the notes when a pick was not checked by ear).
- Convert to Ogg into the mod's `audio/` folder (git-ignored). **The alias table (volume, range, falloff) is not exported**: set ranges by hand and make local sounds local (`sfxAt`, a range check), or a basement machine is heard across the map.
- Ambient emitters are `script_struct`s in the `.ents` (`looper`, `line_emitter`, `random`, `sound_rattle`): `.tools/build_castle_ambience.py` is the example that turns them into a table plus loops.

### 1.4 Lights: `bo3_ff_lights.py`

The primary lights the game baked its lightmaps from are in the map's fastfile, and this is the one thing read from the fastfile directly:

```
python3 -I .tools/bo3_ff_lights.py "<BO3>/zone/<bsp>.ff" export_game/bo3/maps/<bsp>/<bsp>.lights.json
```

Each light has its position, colour, radius, spot cone and a `states` mask (which of the map's lighting states it is on in). The bake uses them (4.3). The Giant was done before this tool existed and has no `lights.json`: run it for every new map.

### 1.5 Scripts

BO3 ships its scripts compiled inside the fastfiles; nothing here extracts or decompiles them, and **no copy of BO3's scripts is kept on disk**.

- Stock and DLC maps: read the decompiled source in the public repository **shiversoftdev/t7-source** (`zm_<map>.gsc`, `zm_<map>_*.gsc`, the shared `_zm_*.gsc`, and the `.csc` client scripts for effects and lighting states). Read each file in full before writing its system; a skim misses the timers.
- Function names in decompiled files are often hashes (`function_ba8e8ad8`). Quote them in a comment next to the code that reimplements them, so the next reader can find the place.
- **Workshop maps**: the mod's own scripts are compiled and not in that repository. Unless the author published the source, every number (radii, damage, timers) is unknown: take what the entity dump and the in-game text give, tune the rest by playing the original, and write in the map's notes which numbers are ours. This is how the Reaper Collection perks were done (`reaper-perks.md`).
- The entity dump is the scripts' other half: it holds the positions and names the scripts refer to (5).

### 1.6 What never comes out, and what to do instead

| Missing | Symptom | What was done |
|---|---|---|
| Brush models (`*67`...): door slabs, debris piles, clip brushes, trigger volumes | Doors with no pieces, invisible walls missing, no zone volume | Stand-in models sized through the collision (`debris_standin`), volumes rebuilt as boxes/cylinders from the script's use of them |
| Models a script spawns at a struct | "The pyramid was way too small", a hole in the floor | Place the model at the struct in the builder as a named node, with collision |
| Pieces spawned by an fxanim scene | "Giant hole", "a whole lot missing here" | Export the scene's models and bundle, build it in the map mod |
| Client effects (fx) | No fire, no glow, no weather | Rebuild with the fork's own effects (`mods/fx`), reusing existing shader text |
| Sound alias table | Every sound global or silent | Ranges by hand (1.3) |
| Material constants (tints, colour scales) | White or grey props, white stair trim | Colour from the material name (3.4) |
| Some images (only a normal map, or nothing) | Lilac-blue sheets, solid white cards, invisible overlays | Drop, hide or paint a stand-in (3.4) |
| Weapon files (damage, speeds, charge times) | - | Numbers from a comparable weapon, tuned by eye, marked as ours |
| Lighting-state switches | - | Bake the normal-play state only (4.3) |

## 2. Building the map

Details: `waw-ports.md`, both "Black Ops III maps" sections. **`build_bo3_map.py` holds both maps' rules: a change for the new map must not change the old ones' output** (keep per-map rules inside `MAPCFG` or behind the bsp name), or the old maps need their whole after-rebuild chain again.

### 2.1 The command

```
systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=1G nice -n 15 \
  blender -b -P .tools/build_bo3_map.py -- <bsp> <map-id> --tex 512 --prop-tex 256
```

- Blender is only there for its Python with numpy. Output: `export/web/mods/maps/<map-id>/<map-id>.glb` and `tex/` (external WebP, names carry their size).
- **Texture sizes are a VRAM decision, not a quality one.** The defaults (`--tex 1024 --normal-tex 512 --prop-tex 512`) put Der Eisendrache at 5.8 of 6 GB and it ran out; `--tex 512 --prop-tex 256` is what both maps ship with. A rebuild with other sizes regenerates every texture. Sharpness comes back through the detail pass (3.5), which spends memory only where a player can see it.
- Axes and units: CoD inches, Z up, to glTF Y up: (x, y, z) -> (x, z, -y), winding flipped. The same conversion is needed for every coordinate copied from a script or the `.ents` (the castle's `bows.js` has `W(x,y,z)` for it).

### 2.2 `MAPCFG`: what the builder must be told

For a new bsp add an entry with `start` (the start zone), `box` (the Mystery Box's first location) and `groups` (zones without a door between them that open together). Find the names in the `.ents`: `player_volume` entities' `targetname`s are the zones, `start_chest`-style names are the box spots.

### 2.3 What the builder makes from the entities

| In the `.ents` | Becomes |
|---|---|
| `info_player_start` | player spawn |
| `spawn_location` / `riser_location` structs | `ZSPAWN` markers, zone from `<zone>_spawners`; only window spawns, risers and points with floor under them are kept |
| `zbarrier_zmcore_basicwoodbarrier*` | windows (marker 48 above and 40 in from the barrier, opening measured through the collision, spawn 100 units out toward the `exterior_goal`) |
| `zbarrier_zmcore_magicbox` (any case) | box locations |
| `zbarrier_*packapunch` | Pack-a-Punch |
| `use_power_switch` | power switch (faces the nearest wall) |
| `zm_perk_machine` structs | perk machines (`machines: "bo3"` in the map entry uses BO3's models, built once by `build_bo3_machines.py`) |
| `weapon_upgrade` structs | wall buys, BO3 weapon -> the fork's nearest (table `WEAPONS`: add any new weapon name, or the wall buy is dropped) |
| `zombie_door`, `zombie_debris` triggers | `DOOR_<zone>_<cost>` groups of their `script_model` pieces, each piece with its `script_vector` as `move`; `electric_door` = opened by power |
| `telepad_*`, `trigger_teleport_pad` | `TELEPORT_*` / `TPDEST_*` |
| trap triggers and their structs | `TRAP_*` / `TRAPZONE_*` |
| lit fixture models, `lights`/`lantern` structs | `<MAP>_LAMP_<n>` markers with `extras.kind` (`fire`, `electric`) |
| script_models with a targetname | `<MAP>_SM_<targetname>` nodes (movable by the mod), solid in `COL_scriptmodels` |

Everything map-specific the mod needs to find is a **named node with the map's prefix** (`GIANT_`, `CASTLE_`). Rules for those names:

- GLTFLoader renames repeated node names (`_1`, `_2`): give every marker a unique name with an index, and match by prefix regex in the mod.
- A node the mod will hide at the start carries `extras.hidden` (custom-world hides it before the static merge).
- Put the prefix in the map entry's `mergeExclude` (`"^CASTLE_"`), or the static merge batches the nodes away and their names with them (three runic circles and four fossil spots vanished this way).
- A zone id is read up to the first underscore: ids drop their underscores, and markers carry `extras.zone`.

### 2.4 Collision

CustomWorld builds collision and the navmesh from `COL_` meshes only; `PCOL_` meshes stop the player and bullets but stay out of the navmesh. The builder decides per prop by name; when a new map brings new prop names, these tables need a look (all near line 211-331 of the builder):

| Table | Meaning | The mistake it prevents |
|---|---|---|
| `NOT_SOLID` | level materials with no collision (decals, glass, foliage) | `blend` was once in it: holes in the ground, navmesh islands, risers under the floor |
| `NO_COLLIDE` | props never solid (wires, signs, snow, debris) | it matches by substring: `chain` also catches "chainlink" (still open), `snow` caught every `*_snow` variant of a solid prop (suffix now stripped) |
| `WALKABLE` | stairs, floors, platforms: own mesh | players fell through steps and catwalks |
| `BOXABLE` | crates, barrels, machines: an oriented box | boxes on frames and arches blocked doorways, so never frame/arch/door/window/gate |
| `FLATBOX`, `CONVEX`, `HULL` | gratings and planks, pads, boulders | walk-through gratings, snagging on boulder meshes |
| `STRUCTURAL` | walls, columns, statues: mesh up to 1,500 triangles | - |
| `CLUTTER` and the size limits | player-only props must be at least 40 high, at most 360 across | "can't move in a lot of spots": too much prop collision cut areas off from the spawns |
| `POSED_CHARACTER` | corpses and posed bodies left out | T-posed corpses standing in rooms |

- Props over 1,500 triangles are decimated (`simplify()`) into `PCOL_props`. In the navmesh layer they added 40 s to the load.
- Stairs get a two-sided ramp quad per flight; the map entry needs `"stairSmoothing": true` and `"player": {"slopeStick": true}` or the player slides down them.
- After every collision change: reach check and mobility check (10.2). The navmesh is cached per player by its collision triangles, so a collision change rebuilds it on its own; a change to the navmesh *settings* needs `NAV_CACHE_VERSION` bumped.
- Fine-tuning without a rebuild: the map entry's `propCollision` (`mesh`/`box` regexes, `minHeight`), audited with `.tools/col-audit.mjs` (`custom-maps.md`).

### 2.5 The map entry (`mods/maps.json`)

Start from Der Eisendrache's entry. Fields a BO3 port needs:

```
"dir": "mods/maps/<id>/", "model": "<id>.glb?v=1", "modes": ["explore"], "scale": 1,
"background": "#...", "fog": 0.0002, "exposure": 1,
"nearbySpawns": true, "stairSmoothing": true, "player": {"slopeStick": true},
"perkYaw": -90, "machines": "bo3",
"mergeStatic": true, "mergeExclude": "^<PREFIX>_", "textureArrays": 256, "batchMeshes": true, "instanceCullPixels": 6
```

- **Bump `?v=` on every rebuild.** Players (and the service cache) keep the old GLB otherwise: the first port's machines stayed huge for everyone until `?v=2`.
- `textureArrays` must match the level texture size the atlas can hold (The Giant 512, Der Eisendrache 256); see 9.

### 2.6 After every rebuild

The map's derived data is matched to the GLB and goes stale with it. Der Eisendrache has `.tools/castle-after-rebuild.sh` for this; a new map needs the same list (copy the script when it has a void-ceiling table):

1. Bump `?v=` in `maps.json`.
2. Void-ceiling table, if the map has one (3.6): `castle-ceilings.mjs status` says whether it still fits.
3. Light volume: `node .tools/bake-map-light.mjs <id>` (delete its `--cache` file first).
4. Detail table: `node .tools/map-detail.mjs <id> --pts <walkable points> --go`.
5. Any map-specific texture fix-ups (The Giant: `node .tools/giant-chalk.mjs`).
6. Light test copy: `node .tools/map-lite.mjs <id> --force`.
7. Compressed copies: `node .tools/build-gz.mjs` (or the GLB is sent uncompressed), and `node .tools/build-ktx2.mjs` if anything under `textures/` changed.
8. `MAP=<id> ... node .tools/map-test.mjs` once (10.3).

## 3. Materials and textures

Details: `materials.md` ("Der Eisendrache: grey sheets...", "overlay layers drawn solid", "Metal look on the BO3 ports", "Map detail pass") and `waw-ports.md` (The Giant's overlay carry-over).

### 3.1 The rule about alpha

**A BO3 colour map's alpha channel is not reliably transparency.** Many keep other data there (tint masks, grout, gloss). Treating every alpha as a cut-out removed 996 prop materials on The Giant (a generator showed only its drip decal). So transparency is decided by *what the material is*, never by "the image has alpha":

| Kind | How it is recognised | How it is drawn |
|---|---|---|
| Cut-out (foliage, fences, chainlink, grates, wires, paper, cloth) | name matches `CUTOUT` in the builder | `alphaMode MASK`, `alphaTest` .4 |
| Blend layer (`_blend`: snow, dirt, moss over stone) | name, and the bsp's **vertex alpha** fades it (vertex RGB is white) | `BLEND` with `COLOR_0`, no depth write, fixed `renderOrder` (1000+), polygon offset -1/-4 |
| Decal | name `decal` | as above, `renderOrder` 2000+, offset -1/-8 |
| Glass | `glass`, `window_pane` | `BLEND`, alpha .28, roughness .15, double-sided, no depth write |
| Water | by hand in the mod's `setupLook` | opacity about .3, tinted, no depth write, drawn after the level |
| Design in alpha on a white image (carvings, chalk, runes) | found by eye | overlay named `<name>_decal`; or rebuild the image with its `_r` reveal mask as alpha (`giant-chalk.mjs`: ffmpeg `alphamerge`) |
| Alpha is data | everything else | **opaque** |

Checks:

- The builder marks overlays by name only and merges equal materials under the first name, so some overlay shells still come out opaque (snow sheets, solid decals). Both maps fix this at load with a list per map: `overlays.js` `overlayLayers(root, {blend, mask, glass, snow, soft})`, called **before** the static merge. A new map needs its own lists; better, teach the builder (the notes say so and it has not been done).
- **How to find them:** make a contact sheet of every map image as colour beside alpha (The Giant: 74 of 293 images carry alpha), then look at each candidate on the GPU before and after. List only what is visibly wrong.
- Overlays need a fixed draw order and a polygon offset. A push along the normal alone loses to depth precision at range ("lots of texture clipping, textures flicker"); 41% of Der Eisendrache's level triangles are overlay layers.
- Prop vertex colours from Greyhound are all 255: a prop's snow layer cannot use vertex alpha (the castle derives it from the world normal).
- The engine draws every material in a single pass, so a transparent double-sided material costs one program, not two; that program must still exist before the warm-up (9).

### 3.2 Materials with no usable colour

| Case | Symptom | Fix |
|---|---|---|
| Built-in maps (`$white_diffuse`, `$gray_color`, `$color_black_NN`), pure-white tint masks | white props, white stair trim | colour from the material name (`TINTS`, `PAINT` in the builder); add names the new map brings |
| "Micro" detail maps (`i_t7_micro_*`, near-white, meant to tile) | flat pale props, blurry boulders | name tint divided by the texture's brightness, then tiled by the detail pass (3.5) |
| Only a normal map was exported (some decals, `*_carved`) | lilac-blue or grey sheets | drop the decal, or build an overlay from the normal map's slope (`carved.js`) |
| No image at all (`core_*` placeholders, effect cards, `_no_e`) | grey slabs, solid white cards | `SKIP` in the builder, or hide in the mod |
| Model with one tiled colour map and nothing else (Pack-a-Punch rocks, the power switch) | "textures seem to be missing" | colour by material name over a tile; darken by normal slope (`ROCK_CARVE`) |
| Art never exported (portraits, rune cards, emissive circles) | blank quads | a painted or shader-drawn stand-in, noted as ours |
| Models without back faces (blast doors) | see-through from behind | a mirrored copy; `DoubleSide` costs a program each |

- **Metal:** BO3 keeps a metal's colour in its specular map with a black diffuse, and the builder exports neither specular nor gloss. `metalLook(world.root)` (`mods/lighting/metal-look.js`) is a stand-in by material name. The real fix, exporting the specular and gloss images in the builder, **has not been done**: it is the first thing to try on a new map, before its materials are tuned around the stand-in.
- A missing texture is found faster from the list than by eye: compare the images named in `<bsp>.json` with what Greyhound wrote, and write the unexported ones into the map's notes (Der Eisendrache has 15).

### 3.3 Void planes and holes

BO3 closes unseen space with black planes (`wc/global_diffuse_black`, `infinite_blackness`, `global_black`). Untextured near-black, the metal stand-in made them mirrors.

- `blackPlanes(root, match, ceilings, props)` gives them one unlit black material (no fog, both sides: their winding is mixed), and gives black *prop parts* a lit flat colour by kind.
- Where a void plane is a room's ceiling, players see a black hole overhead. Der Eisendrache redraws those as stone from a table (`ceilings.js`: `tris`, `patches`, upright `walls`) made by `.tools/castle-ceilings.mjs` from rays cast from every walkable point. The table is signed with the GLB; a rebuild leaves it stale (2.6).
- **Judge holes with rays on the real GLB, never on the light test copy and never from a screenshot alone.** The light copy drops stone (it showed gaps that do not exist), and a blue patch can be a beacon or the next room's light. What looks like sky through a gap can also be an opening the original really has.

### 3.4 Sky

Export `skybox_<bsp>` and its panorama (8192x4096). BO3 stores it dim (Der Eisendrache uses gain 2.7-3.2). Draw it as an equirectangular lookup by view direction on a sphere that follows the camera, unlit, no fog; fade its horizon band into the fog colour. **Do not set it as `scene.background`** (with texture arrays every map material turned white), and do not use BO3's 96-vertex sky box mesh (it warps).

### 3.5 Blurry textures: larger copies first, upscaling last

The build downsizes every texture (2.1), and BO3 props often stretch one small tiling map over a large model. Fixing "some textures are extremely blurry" is three separate tools, in this order:

1. **Tiling** (`map-detail.mjs`, table `tile`): micro maps and library maps on props get a repeat so one tile covers about 32 units. Never on bsp materials (their UVs are already right).
2. **Larger copies from the source** (table `hd`): colour maps under 4 texels a unit on surfaces near where players walk are re-encoded from Greyhound's full-size PNG at 512 or 1024, never above the source size, largest blurry area first, inside a memory budget. This is not upscaling: the pixels are the game's own.

   ```
   node .tools/map-detail.mjs <id> --pts <walkable points json>            # report only
   node .tools/map-detail.mjs <id> --pts <walkable points json> --budget 160 --go
   ```

   The walkable points come from `col-audit.mjs <id> --flood-only --points file.json` (wrapped as `{pts: [...]}`). The mod calls `prepareDetail(dir)` in `prepare()` and `applyDetail(world.root)` in setup; phones, Low graphics and "HD textures off" skip it; `?noDetail` is the A/B switch. Der Eisendrache: 328 tiled materials, 88 larger copies, about 109 MB.
3. **AI upscaling, only when the source itself is too small** (a 256 px source on a wall the player stands next to). It has only been done for Kino's BO1 textures (`.tools/upscale-kino-textures.py`), **not yet on a BO3 port**; the procedure to copy:
   - Real-ESRGAN (`~/.local/opt/realesrgan/realesrgan-ncnn-vulkan -n realesrgan-x4plus -g 0`), under the memory cap, with the browser closed (it uses the same 6 GB card).
   - **Pad each texture with a wrapped border first** (24 source pixels of its own opposite edges), upscale, crop the border off: without it every tiling texture gets a visible seam.
   - Upscale 4x, then resize down to 2x with Lanczos: 4x output is mostly invented detail and four times the memory.
   - **Colour maps only.** Never normal maps, gloss, masks or reveal maps (the network invents structure and breaks the data), and keep the alpha channel as it was (upscale colour, scale alpha plainly).
   - Write the results as *extra* files swapped in at load (the detail table's redirect, or `hd.json` as Kino does), so "HD textures off", phones and the memory budget still work, and count the added megabytes against the card.

Zombie and weapon textures have their own sizes in their builders (zombies: 1024 colour and body normals after "zombie textures are really bad" at 512).

### 3.6 After textures change

`node .tools/build-ktx2.mjs` (tiled maps only join the texture arrays as KTX2) and `node .tools/build-gz.mjs`.

## 4. Lighting

Details: `lighting.md`, "Baked light volume for the BO3 ports", and `waw-ports.md` (undercroft light, lighting states). The lighting rules in `CLAUDE.md` all apply; the ones that hurt BO3 ports most are repeated in 4.5.

### 4.1 What a BO3 map's lighting is here

BO3's lightmaps and probes are not exported. The port rebuilds the light from four things:

1. **The map's look** in the mod's `setupLook`: ambient, hemisphere, key (sun or moon) and fill, retuned every frame; the entry's `background`, `fog`, `exposure`. Read the mood from the game (snowy night, overcast day) and from the sky panorama's horizon colour; fog and background take that colour.
2. **The baked light volume** (4.3): a 3D grid holding lamp light, sky visibility and sun reach, so interiors go dark, lamps light their rooms from any distance and nothing pops.
3. **A small accent pool** of real point lights near the camera (1-4 by quality) for moving highlights. Its size only changes with the quality setting.
4. **The grade**: a `GRADES` entry in `mods/lighting/grade.js` or the map entry's `grade`; tune live with `kino.post.set({...})`.

### 4.2 Lamps

- The builder writes `<MAP>_LAMP_<n>` markers from lit fixture models and light structs (merged within 120-150 units) with `extras.kind` (`fire` flickers warm, `electric` steady). Check their count against the fixtures you can see: a fixture model the builder does not know gets no lamp.
- Which lamps need the power comes from the scripts; the bake keeps "always" and "with the power on" apart (`off`/`on` levels in the tables).

### 4.3 The bake

```
python3 -I .tools/bo3_ff_lights.py "<BO3>/zone/<bsp>.ff" export_game/bo3/maps/<bsp>/<bsp>.lights.json
systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=2G nice -n 15 \
  node .tools/bake-map-light.mjs <id> --out scratch/<dir>/ --cache scratch/<dir>/sky.cache
```

- **Add the map to `MAPS` in `bake-map-light.mjs`** (lamp regex, cell size 40-48, lamp range and levels, sun direction, extra occluder meshes). Its numbers must match the map mod's `LAMP` table.
- **Use the game's own lights** (`real: {file, gain, ...}`): true positions, colours, radii and spot cones. Without the file the bake falls back to the lamp markers plus invented fill lights and says so. `gain` is set once so lit rooms land at a sensible level; `adapt`, `fill` and `outdoor` are the three knobs that fixed "everything is WAY too dark" and "snow shines off really bad, blinding" (an uncapped lamp term outdoors).
- Bake only lights whose `states` mask has bit 0 (normal play). Lights of other states belong to late quest scenes; switching states at runtime would need new shader text on every lit material, so it was decided against.
- A room whose light changes in play (the castle's undercroft: warm until the low-gravity event, then blue) is a `gated` box: its lights go in the powered set with a dim copy in the always set, and the mod drives the power value. Data and uniforms only.
- Bake with `--out` into scratch first and compare on a cropped GPU page before copying over the live files (`light.json`, `light.bin.gz` next to the GLB).
- The bake's sky-visibility value is **not** a measure of how open a place is (.09 at an outdoor spawn, .49 on an open pad): do not reuse it for gameplay or sound.
- Rebake after every map rebuild and after any change in `MAPS`; delete the `--cache` file after a rebuild.

### 4.4 In the map mod

- `await loadMapLight(api, {skyFloor, indoor, sunFloor, strength, powerOff, knee})` **inside `setup()`**, not on `host.pending`: its shader patch must be in place before "Optimizing the map", or "Preparing shaders" runs twice (8-28 s became 2 minutes). The lookup in the shader stays straight-line (no loop, no `if`).
- The gun follows the map's light at the camera (`kino.vmLight`, `kino.mapLight.at(pos)`): a gun too bright or dark on the new map is tuned there, not with the scene lights.
- `?noBake` is the A/B switch.

### 4.5 Rules

- Never add, remove or hide a light during play, and never keep one under a hidden group: the light count is in every lit program's key and everything recompiles ("DE has some freezes" was a PointLight under a hidden group). Make lights at setup and drive their intensity.
- An effect's glow is a sprite or a lighting-pool source, never its own `PointLight` (trap zones, bonfires, hanging quest items: "each costs every pixel here").
- Any change to the shader text of lit materials makes every player's next load fully cold. Prefer uniforms, material properties and data.
- Emissive parts (bulbs, runes, glowing weapons) need the bloom threshold in mind (1.05): tune glow levels on a routed GPU page with the same bloom and tone mapping, not by numbers.
- Not used yet: BO3's lit-fog colour in the `.ents` (`ambientColor`).

## 5. Scripts: from GSC to mod code

Where the scripts come from is in 1.5. How they are turned into the map:

1. **One script file, one system, one mod file.** `zm_<map>_zones.gsc` -> zones, `_tram`/`_flingers`/`_teleporter` -> transport, `_pap_quest`, `_dogs`, `_mechz` -> enemies, `_weap_quest*` -> weapon quests, `_ee*` -> main quest, `_low_grav`, `_rocket_trap`, `_craftables`. Put the script's name in the first comment line of the file and each quest's steps in the header.
2. **Positions come from the `.ents`, behaviour from the script.** Search the `.ents` for the targetnames and `script_noteworthy` values the script uses; copy coordinates in game space and convert with one helper (`W(x,y,z)` = (x, z, -y)).
3. **Copy constants exactly and say where from**: costs, round numbers (dogs first at round 5-6, then every 7-13), timers, radii, kill counts. Convert units (BO3 speeds in mph x 17.6 = inches a second; gravity `bg_lowGravity` 300 of 800 scaled to the fork's 1400).
4. **Zones**: BO3 opens zones by flags and adjacency (`zm_<map>_zones.gsc`). Replace `world.activeZones` with the script's pairs and derived flags; keep the flags in the session so co-op guests agree.
5. **Volumes are missing** (brush triggers): rebuild each as a box or cylinder from the script's use and the places around it, and mark it as rebuilt.
6. **Client scripts (`.csc`)** say which effects and lighting states exist; the effects themselves are rebuilt.
7. **Everything a script does must work for the whole team.** Quest state goes through the map's sync file (`sync.js`: events and state for guests, late joiners included). A guest who joins late must not see a one-off event replay (the clock wall blew up again).
8. Give each system a debug handle (`kino.<map>.<system>.state()`, `force`, `give`, `advance`) and a `?no<System>` switch: tests and bug reports both need them.

What the engine offers so a script port stays out of engine files: `world.addInteraction`, `addShootTarget`, `addScriptedMover(objects, {exact})`, `slideMover`/`enableMover`, `movePap(position, yaw)`, `papLocked`/`papLockedText`, `prePlayer(dt)`, DOOR `scripted`, TELEPORT `locked`, `api.features.flight`, enemy hooks `z.ai(dt, player)` and `z.hit`, `kino.scoreboard.addCollectible`, `host.prompts` (`mods/README.md`, end).

## 6. How the map plays

The marker contract is in `mods/README.md` and `custom-maps.md`; the builder's entity table is 2.3. Checks per function:

| Function | Check |
|---|---|
| Spawn | player starts on the floor, facing into the map; `world.playerFeet` is used for spawn distance so a wall-running or flying player doesn't pull zombies into walls |
| Zombie spawns | zombies come only from windows and risers, never inside walls or on platforms ("spawning everywhere" = unpaired `spawn_location` structs kept); every spawn point paths to the player with all doors open |
| Windows | boards inside the wall line, zombie climbs through, opening width 48-72 |
| Doors and debris | prompt, cost, pieces move and hide, collision gone, the zone opens; two triggers sharing a target are one door; a door with no pieces in the dump is skipped by the builder, so list those and add them in the mod |
| Power | switch model and pose (the off pose can be the `start` clip's first frame, not `idle`), power doors, lamps and perk machines follow |
| Perks | all machines stand upright, face the room (`perkYaw`), right models (`machines: "bo3"`); two on one spot slide apart |
| Mystery Box | every location, start location right, beacon not shining through walls |
| Pack-a-Punch | the map's own machine model and animations if it has one (awaited in setup so it is warmed), its quest lock (`papLocked`), moving locations (`movePap`) |
| Wall buys | every chalk has a weapon in `WEAPONS`; the gun model hangs on the wall and is culled at range |
| Traps | cost, power, zone shape, cooldown; no light per trap zone |
| Teleporters, pads, trams | cost, cooldown, destination, players inside a moving thing move with it and cannot be pushed out through thin walls |
| Moving collision | anything that moves and can be stood on goes through `addScriptedMover`; colliders on `world.dynamic` need `.box` unless `window: true`; call `world.collision.invalidateCache()` after editing collision at runtime |
| Navmesh and movers | the navmesh does not change in play: hold or reroute zombies at doors that shut (`holdZombies`), and give special enemies a fallback when no path exists |
| Out of bounds | a fall out of the map returns the player (`setupBounds`) |
| Explore mode | still works with every quest object present |

Moving or showing anything on a BO3 port (see `CLAUDE.md`, "Der Eisendrache placed props" and "Static freeze"):

- The map's nodes come out of the static optimise with `matrixAutoUpdate` off. Turn it on for the map's own prefix subtrees at setup, and after moving a node call `updateMatrix()` then `updateMatrixWorld(true)`, or it is drawn at its old place.
- Repeated props are instanced or followers in the texture-array batches: move, show and hide through the **node**, never through a mesh's material or visibility. A mod that needs a prop's meshes later puts its node prefix in merge-props' `SKIP`.
- A clone of an instanced prop needs `layers.set(0)` on its meshes (the originals sit on no render layer).

## 7. Wonder weapons, special weapons and equipment

Details: `weapons.md` ("Black Ops III assets (Greyhound) and the Wunderwaffe DG-2", the bows), `advanced-warfare.md` (Workshop packs). Before building one, check it is not already here: `mods/bo3-weapons/weapons.json` (DG-2, Wrath of the Ancients and the four elemental bows, the Advanced Warfare pack), operator weapons (Ragnarok DG-4, Annihilator, rocket shield), `mods/wonder-weapons/` (BO1's), `mods/bo3-equipment/`.

### 7.1 Export

- Export a wonder weapon **from the map that has it**: zombies-only assets are loaded only on a zombies map, and each map only loads its own.
- Per weapon: the view model (`wpn_t7_..._view`), world model (`_world`), projectile, every `vm_<prefix>_*` animation, the images (find their names with `strings <model>.semodel | grep '_images\\'`), the BO3 hands model it is animated with, and its sounds (`strings -n 8 <bank>.sabl | grep -i <name>` finds the bank).
- **Workshop weapon packs**: find the loaded pack through `/proc/<BO3 pid>/fd` (`workshop/content/311210/<id>/`). Greyhound only reads streamed images from xpaks in BO3's own `zone/`, so mod textures "export" with no file: **hard-link** the pack's xpaks into `zone/` (a symlink is not enough), restart Greyhound, export, delete the links. Pack world models can export with no meshes: the build falls back to the viewmodel geometry.
- Copy exports to `export_game/bo3/` only after Greyhound has finished writing (two textures were once copied half-written).

### 7.2 Build: `build_bo3_weapons.py`

`python3 -I .tools/build_bo3_weapons.py` rebuilds every entry of its `MODW` table into `mods/bo3-weapons/` (`models/*.glb`, `animations/*.json`, `weapons.json`). A new weapon is one entry: class, id, name, Pack-a-Punch name (`up`, or `None` when it cannot be upgraded), view and world models, animation prefix, a template weapon to copy stats from (`tpl`) plus overrides, `roles` (which BO3 clip plays as raise, fire, reload, charge...), `ads`, `glow`, `projectile`, `offset`, `drop`, `noBox`.

What the converter already handles, and the check for each:

| Point | Check on the new weapon |
|---|---|
| BO3 first-person rigs are about 2.2x BO1's scale; `tag_weapon_right` becomes `tag_weapon`, finger joints `_1.._3` become `_0.._2` | gun sits in the hands, fingers wrap the grip (BO3 hands rigs end at `_2`: fingertips are read from the glove mesh, `fp-arms.js`) |
| Gun-part translation tracks are offsets from bind, hands tracks are absolute | no part vanishes or flies off during reload or fire (subtracting the bind twice made bulbs and the bolt disappear) |
| A moving gun root is folded into the hand track | the gun moves with the hands in inspect and reload |
| Clip lengths set raise, drop, sprint and reload times; several clips can be joined (`fire` + `pump`), segmented reloads (`reload_in/loop/out`) | timings feel right; an empty reload exists |
| `drop` removes helper geometry, HUD quads, other variants' parts, effect cards with no picture | no solid white cards or boxes on the gun (the bows carried every element's arrows and `_no_e` cards) |
| Glow materials (`extras.bo3glow`); the pattern is in the image's **alpha**, kept as PNG because the WebP path drops it | glow visible, not glaring through bloom |
| Sound notes in the animations (`sndnt#<name>`) map to exported files | reload foley and the fire sound play; a missing alias gets a stand-in and a note |
| World model at `def.worldScale` (1/2.2), 256 px colour only | third person and wall display look right; charms hang at the right size (`charmUnit`) |
| Hip position `viewOffset` | gun framed like its neighbours at the hip and when aiming |

### 7.3 Making it a wonder weapon

The build gives a gun that shoots like its template. What makes it the wonder weapon is a runtime file (the DG-2's chain arcs in `mods/bo3-weapons`, the bows in `mods/der-eisendrache/bows.js`). Checklist:

- **Behaviour from the scripts**, numbers too (chain reach and count, charge times, damage, what the upgraded version changes). BO3's weapon files themselves are not exported: stats that are not in a script are ours, tuned against the original by eye, and marked so.
- **Pack-a-Punch**: an `upgrade` entry, or `up=None` so the machine refuses it (weapons upgraded by a quest instead). The default upgrade is the same model with x1.5 ammo and x2.2 damage: give a wonder weapon its real upgraded behaviour.
- **Mystery Box**: in the box list with its rarity, or `noBox` for quest weapons. One-per-team rules come from the script.
- **Effects**: its own emissive map on cloned materials, electricity/arrows/trails with the fork's effect helpers reusing existing shader text, a sprite glow rather than a light. Effects for other players go through the sync layer.
- **Charge and special inputs**: `chargeAnim`/`chargeLoopAnim`/`chargeCancelAnim` roles; touch players need `mods.holdFire()`; each projectile carries its own charge (a shared slot broke "charge for the upgraded bows").
- **Sounds**: fire layers, loop or hum, charge, impact, from the map's or the weapon's bank.
- **Warm-up**: add its ids in a `warmWeapons(ids)` handler and patch its viewmodel in a `warmWeapon` handler (glow materials are only built at equip otherwise: a freeze the first time the box hands it out). Pools of projectiles or summons are made at load.
- **Menus**: an entry in `mods/progression/progression.json` `weapons` for the loadout picker, the game logo (`games.json`), a weapon picture; Gunsmith kits only if it takes attachments.
- **Operator weapons and shields** (Ragnarok, rocket shield) are their own ViewWeapon defs with craftable parts placed from the `.ents` (`craftables.js`).
- Rerun `node .tools/build-gz.mjs` after the build. Outputs are git-ignored; `weapons.json` under `bo3-weapons` is generated.

## 8. Zombies, bosses, sound, effects

- **Map zombies** (`build_castle_zombies.py` is the pattern): BO3 bodies, heads and gibs in inches with BO1 finger names, rebound so every joint has BO1's rest rotation and the fork's BO1 `ai_zombie_*` clips drive them. Heads are moved into the body's bind space and bound to its bones. Leave out bodies whose textures belong to another map, and all posed corpse models. Gib files share the body's materials by name. Await them in the mod's setup (they compiled at the first spawn once: 2-3 s a program).
- **Bosses and special enemies** (`build_castle_panzer.py`): export after one has spawned. SEAnim convention: rotation keys are absolute local rotations, translation keys are offsets added to the bind position (keep `bindPosition` per bone); root motion is dropped and kept as a speed. Rounds and behaviour from the script; hooks `z.ai`, `z.hit`; a fallback when the navmesh gives no path. Never kill an enemy inside the engine's update loop of the same frame.
- **Eye glow and similar looks** are choices: note when one differs from BO3 (the castle's blue eyes are the user's choice; BO3's are orange).
- **Sound**: one audio file per map mod (`castle-audio.js`: `sfx`, `sfxAt`, one music track); ranges by hand; music picked from the `.sabs` bank; ambience from the `.ents` emitters with only the loudest few loops playing (fewer on touch).
- **Effects**: weather, fire, motes, lightning from the fork's helpers (`mods/fx`), with particle counts cut on Low; a HUD tint or banner needs a `warmHud` state; clone-per-use textures are `initTexture`d once and never disposed.

## 9. Performance and loading

Details: `performance.md`. A BO3 map is 10-30 times the size of the maps the engine was written for; without this pass Der Eisendrache ran at 22 FPS.

- **Frames are bound by draw calls** (16-17 µs each on the user's PC), not triangles. The map entry switches on the levers: `mergeStatic`, `textureArrays` + `batchMeshes`, `instanceCullPixels`. The mod adds prop merging and instancing (`merge-props.js`). Der Eisendrache's worst views went from 2,357 draw calls to about 450; `node .tools/bench-castle.mjs high` is the pattern for a per-area bench.
- **VRAM**: the card has 6 GB and the desktop takes some. Texture sizes (2.1), the detail budget (3.5) and weapon HD textures all share it; `GL_OUT_OF_MEMORY` or a lost context on the user's PC means go smaller.
- **Warm-up**: everything that first appears mid-game (bosses, quest props, effects, HUD states, weapons) is built and compiled during loading: await async loads in setup, `host.warmObjects`, `host.pending` for textures, `warm`/`warmHud`/`warmWeapons` handlers. `[mods] slow setups` in the console lists setups over 250 ms.
- **Load time**: collision triangle count drives the navmesh build (the castle: 3.47 M solid triangles, about 90 s first load, cached after). Keep decorative props out of `COL_`.
- **Downloads**: a `?v=` bump makes every player fetch the map again (Der Eisendrache: 172 MB compressed). Batch rebuilds; don't bump for a mod-only change.
- A/B switches for finding what costs: `?noMerge ?noBatch ?noFreeze ?noArrays ?noMergeProps ?noFollow ?noBake ?noDetail ?noOverlays ?noKtx2`.

## 10. Testing

Memory rules first (`CLAUDE.md`): one browser, one page, through `~/.local/bin/lowpri`, `flock scratch/melon/heavy.lock`, browser closed in a `finally`, BO3 closed, and report the renderer's memory with the results.

1. **Engine smoke test** after any engine or mod-setup edit: `MAP=sandbox flock scratch/melon/heavy.lock ~/.local/bin/lowpri node .tools/warm-check.mjs`.
2. **Collision and reach, offline**: `~/.local/bin/lowpri node .tools/col-audit.mjs <id> --from-spawn` lists markers the player cannot reach; the full pass lists walk-through walls, invisible blockers and floating floors. Then in a page: every spawn point paths to the player with all doors open, and a mobility check (random navmesh points, walk in four directions).
3. **Whole map, logic only**: `node .tools/map-lite.mjs <id>` once per rebuild, then `MAP=<id> [FIRST=1] PLAY=scratch/x.js flock scratch/melon/heavy.lock ~/.local/bin/lowpri node .tools/map-test.mjs` plays a real match on a light copy with a memory watchdog (`FIRST=1` on a map's first run, for the navmesh build). For doors, quests, traps, sounds, co-op (`INIT=.tools/play/coop-init.js` with a guest script). **Not for looks, and not for holes.**
4. **Looks** go on the real GPU (`--use-angle=vulkan --enable-gpu --ignore-gpu-blocklist`) on a cropped piece of the map or a routed test page with the same bloom and tone mapping. A full map at real textures passes 2.5-3.2 GB before it is ready and breaks the memory rule.
5. **Holes and sight lines**: rays on the real GLB (3.3).
6. **Performance**: the per-area bench before and after each change, never two games on the card at once.
7. Then ask the user to play it. Their reports are quoted in the notes with the fix: that list (12) is the real test plan for the next map.

## 11. Release checklist

- [ ] `git status --short` shows no ripped file; new asset folders have a `.gitignore` with `*`; nothing new matches the install manifest's `OWN` list by accident, and own data that players need does match it.
- [ ] `?v=` bumped once for the final GLB; `build-gz.mjs` and `build-ktx2.mjs` run; light volume, detail table and any ceiling table belong to this GLB.
- [ ] Explore and zombies modes both start; warm-check clean; no `[mods] slow setups`, no console errors, no "table is stale" warning.
- [ ] Every door, perk, box spot, wall buy, trap, teleporter and the Pack-a-Punch used once in a test match; power on and off; a full round with zombies from every open zone.
- [ ] Each quest step done through its debug handle and once for real; a guest and a late joiner see the same state.
- [ ] Every weapon the map can hand out is in the warm-up; the wonder weapon fired, charged, upgraded, and seen from third person.
- [ ] No light added, removed or hidden in play; no new shader text on lit materials after the warm-up.
- [ ] Walked the map on the GPU looking for: white or grey sheets, solid decals, black holes overhead, flicker on overlays, missing models at script-spawn spots, T-posed bodies, props drawn at the wrong place after moving.
- [ ] Phone/Low graphics path loads (detail pass skipped, particle counts cut).
- [ ] Notes written: a section in `waw-ports.md` (what is in, what is ours, what is missing), `history.md` line, the wiki's map page, journal steps for its Easter eggs, the map's picture and description in `maps.json`.

## 12. Mistakes already made

| What the user saw | Cause | Fix |
|---|---|---|
| Dump: "asset pool table not found" | wrong process, or a game update moved the table | pick comm `Main`; `--scan` |
| Greyhound exported 7.5 GB | Export All on an empty search | always search first |
| Everything from Greyhound 2.54x too big | SEModels are in centimetres | scale by 1/2.54 |
| Machines still huge after the fix | cached GLB | bump `?v=` |
| WebGL context lost on first load | BO3 still running | close the game before testing |
| Overlays smeared over floors; "stuff like this" (solid snow, solid decals) | blend layers and decals drawn opaque | 3.1 |
| A generator showed only its drip decal | alpha treated as cut-out everywhere | cut-out by name only |
| "Textures flicker, lots of clipping" | overlays without draw order and polygon offset | 3.1 |
| "White blotches around the map", lilac sheets, a pink road | duplicate script models with no colour, normal-only decals, a decal that lost its image | 3.2 |
| White props, white stair trim | built-in colour maps and tint masks | name tints |
| "The water isn't see-through", opaque windows | water and glass materials | 3.1 |
| Flat black metal, or mirror-black planes | no specular export; void planes hit by the metal stand-in | 3.2, 3.3 |
| "Massive holes around the map", "hole still persists" | void planes as ceilings; an opening above a pillar | the ceiling table; rays on the real GLB |
| A gap that was never there | judged on the light test copy | 3.3 |
| "Some textures are extremely blurry" | stretched micro maps, 256 px copies | 3.5 |
| Every map material white | panorama set as `scene.background` | 3.4 |
| "Lighting popping in and out", "light pop-in is insane" | a light pool following the camera | the baked volume |
| "Snow shines off really bad, blinding" | uncapped lamp light outdoors, bloom | `outdoor` cap, bloom 1.0 |
| "Everything is WAY too dark" | a knee that halved every room | the game's own lights, `fill`, `adapt` |
| A room stayed blue whatever the mod did | the colour was in the baked lamp light | a `gated` box in the bake |
| "Preparing shaders" took 2 minutes; "insane lag" | the bake's shader patch arrived late; a loop in the shader | await in setup; straight-line lookup |
| Freezes in play | a light under a hidden group; things compiled at first use | 4.5, 9 |
| Fell through stairs, gratings, teleporter pads | props without collision | `WALKABLE`, `FLATBOX`, `CONVEX` |
| Doorways blocked | box collision on frames and arches | `BOXABLE` only for box-shaped props |
| Slid down stairs | no ramp and no `slopeStick` | 2.4 |
| "Can't move in a lot of spots"; areas cut off from zombies | too much prop collision | size limits, player-only layer |
| Holes in the ground, zombies rising under the floor | `blend` surfaces not solid | removed from `NOT_SOLID` for that map |
| "Spawning everywhere"; zombies inside walls | `spawn_location` structs behind walls | windows and risers only |
| "Zombies spawn in the walls once you wall-run" | spawn distance used the airborne position | `playerFeet` |
| "Giant hole"; "launch pad is missing the shell"; "pyramid way too small" | pieces spawned by a scene or script | 1.6 |
| Only the first gate worked | GLTFLoader renamed repeated node names | prefix regexes, unique names |
| Runic circles and fossils missing | named nodes merged into batches | `mergeExclude` |
| A moved prop drawn at its old place | `matrixAutoUpdate` off under the map root | `updateMatrix()` + `updateMatrixWorld(true)` |
| "Pack is rotated the wrong way" | the machine's yaw is the spot's own | per-location yaw |
| "Symbols are a bit blown up" | effect card scale guessed | measure against the model |
| "The noise isn't global, it should only happen down there" | no alias ranges | range checks |
| T-posed corpses; zombies with backwards feet, drifting heads | posed character models as props; corpse variants as zombies; head bind space | 8 |
| The bows "already presented"; white cards on the bow | bind-pose extras and pictureless effect cards | `drop` list |
| "Charge doesn't work for the upgraded bows" | one shared shot slot | each arrow carries its draw |
| "Bonfires don't seem to work", "extremely hard to see" | a 70-unit glow and a fade distance; arrows fell short | sizes checked on the GPU at play distance |
| A guest saw the wall blow up again | one-off event replayed to a late joiner | state, not events, for late joiners |
| Gondola left with the player inside the wall | single-sided thin panels | deepest-contact capsule test, solid car box |
| Ceilings black after a rebuild | derived tables stale | 2.6 |
| Host out of memory during a scan or build | two heavy jobs at once, or no cap | one at a time, under `systemd-run` |

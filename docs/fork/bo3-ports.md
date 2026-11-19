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
- **Make the first game session the only one.** Gorod Krovi needed three launches because each ask covered one thing. Before telling the user they can close BO3, finish everything that needs the running game: the level dump (1.1), the collision dump (1.1a), the navmesh dump (1.7), the spawn list (2.3a), the Greyhound exports (1.2, 1.3, and 7.1 for the map's weapons), and the reference pictures below. The lights (1.4), sun and grade cube (4.1) come from the fastfile and need no game.
- **Write the wanted-export list as a file before asking** (`scratch/<map>/greyhound-wanted.md`) and check every item against `export_game/bo3/` first: twice the user was asked to start the game for files that were already on disk.
- **Ask for a reference of the real map in that session**: a short unpaused walk through each area, as a video or screenshots, from the user. A session can't capture it itself (X11 capture is black, Spectacle caught the pause menu). Without it the brightness was tuned blind twice (4.3).
- **Shared files.** `build_bo3_map.py`, `build_bo3_weapons.py` and `maps.json` are edited by sessions working on other maps: commit only your own hunks, and agree a rebuild with any session that has a bake or a look pass on the map, because a rebuild makes both stale.
- **Long jobs run as their own unit** (`systemd-run --user --unit=<name> -p MemoryMax=...`, log to a file), not as a child of the session: two audits were lost when the session restarted.
- **Don't hand the map over on trust.** Before the user is told to look: a GPU look check with the look module in, the KTX2 copies and the detail pass built (2.6), and the collision numbers of 2.6 step 10 passing. Say plainly when a build has not been run in a browser.

**The order that works**

1. In one game session: dump the level and its entities (1.1), the collision (1.1a) and the navmesh (1.7), list every spawn location (2.3a), get the reference pictures. Read the lights from the fastfile (1.4).
2. Export textures, prop models, animations and sounds with Greyhound (1.2, 1.3), in the same session.
   - **Inventory before the first build**, from the dump and the scripts, with counts, into the map's notes: script models, scene bundles, corpse and helmet models, doors with no visible pieces, `_smod` fxanim models, the box list and the map's wonder weapons, gobblegum machine spots, flood-water and carpet/rug materials, brushes a script switches on or off. Each of these was found on Gorod Krovi by the user as a missing or broken thing instead.
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
- Check the dump before going on: the surface, vertex and static-model counts should be in the range of the earlier maps (`zm_castle`: 9,330 surfaces, 1.44 M vertices, 33,561 static models, 3,342 entities; `zm_stalingrad`: 13,464 surfaces, 1.37 M vertices, 63,577 static models, 4,748 entities, 382 materials, 1,477 lights), and `<bsp>.ents` must contain `info_player_start`.
- Entity `model` values starting with `*` or `?` (`?1`, `?99`...) are brush models: Gorod Krovi's door triggers are `?N`. Greyhound has nothing for either, so drop both from the export lists (a batch of 130 `?N` names finds 0 assets).
- **Workshop maps (not verified):** the dump reads whatever map is loaded, so a custom map should dump the same way. Its bsp name is the mod's map name; add it to `MAPCFG` in the builder (2.2).

### 1.1a The collision: `bo3_dump_clip.py` and `bo3_clip.py`

The render dump has no collision: no clip brushes (the invisible walls, the ramps over every staircase) and no static-model collision. The game's own is the `clipMap_t` asset (pool 12), dumped from the running game the same way (first done for Gorod Krovi, 2026-11-15):

```
python3 -I .tools/bo3_dump_clip.py                    # the map loaded right now, into export_game/bo3/maps/<bsp>/<bsp>.clip.*
python3 -I .tools/bo3_clip.py <bsp> [--models]        # counts per class (needs numpy: Blender's python)
```

- Output: `<bsp>.clip.json` (counts, materials with contents flags, submodels, static models, the xmodels' collision surfaces, and the record layout of every `.bin`) and the arrays (`planes`, `brushsides`, `brushes`, `brushverts`, `verts`/`tris`/`partitions`/`aabbtrees` = the triangle soup, the brush BSP, `xmodeltris`). zm_stalingrad: 35,180 brushes, 60,533 sides, 28,565 planes, 213,283 soup triangles, 49,464 static models, 267 submodels, 755 materials.
- Layout of `clipMap_t` (verified on the live game): name, isInUse, then count/pointer pairs at 0x10 planes (20 B), 0x20 materials (16 B: name, surfaceFlags, contents), 0x30 brushsides (16 B), 0x40 leafbrushnodes (24 B), 0x50 leafbrushes (u16), 0x60 brushverts, 0x70 uinds, 0x80 numBrushes (u16) / 0x88 brushes (0x70 B: mins, contents 0xC, maxs, numsides 0x1C, sides 0x20, axial contents/flags 0x28/0x40, numverts 0x58, verts 0x60), 0xA8 static models (0x70 B), 0xB8 nodes, 0xC8 leafs (56 B), 0xD8 verts, 0xE8 tris, 0xF8 triEdgeIsWalkable, 0x100 partitions (16 B), 0x110 aabbTrees (32 B), 0x120 cmodels (96 B).
- **Leaf brush lists overrun the count**: the submodels' lists sit after the world's (zm_stalingrad: 35,184 counted, 413 more). The dumper reads up to the furthest end a node points at.
- **Submodels are left out**: their brushes (the last ones: 34,768-35,179 on zm_stalingrad) are zone volumes, `nav_volume_passable` and the script brush models (door and hatch clips, the dragon boss blocker): the doors are the engine's own.
- **A brush is its box cut by its side planes**, which is what the game's traces test. The stored `brushverts` disagree with the planes on some brushes (extra 45-degree cuts) and left 9,582 brushes open: `bo3_clip.py` intersects the planes instead (every three, points inside, corners merged within 0.05). 34,768 world brushes = 465,000 triangles in about 50 s. The soup is stored clockwise (flip it); its contents come from the aabb leaf's material.
- Static models: world = origin + inverse(invScaledAxis) @ local; the xmodel triangles are rebuilt from plane, svec and tvec. A trace checks the instance's contents and the surface's.
- **Contents flags** (the json's `contentsFlags`): 0x1 solid, 0x10 glass, 0x2000 stops bullets, 0x10000 player clip, 0x20000 monster clip; every `clip_*` material also has 0x400000. Players stop at 0x1 | 0x10 | 0x10000, zombies at 0x1 | 0x10 | 0x20000, bullets at 0x1 | 0x2000. 0x2080 (and 0x82080) is drawn detail you walk through: wooden beams, the bridges' metal trim, grates, the bronze ceiling tiles (12,697 brushes on zm_stalingrad). `clip` is 0x430200 and `clip_nosight` 0x431640: player + monster, no bullets.
- `bo3_clip.game_collision()` sorts it all into the engine's classes (2.4): stops player, zombies and bullets = `COL`; player and bullets only = `PCOL`; player but not bullets = `CLIP` (plus `NCOL` when it also stops zombies: the stair ramps are both); zombies only = `NCOL`. Static models by instance height: under 18 left out (stepped over), 18-40 `PCOL`, over 40 `COL`.

- **Self-test a new collision dump before building from it**: for every static-model instance, transform its collision and compare the bounds with the dump's own `absmin`/`absmax`. On Gorod Krovi 21,383 of 49,464 instances failed until the row-vector fix (2.4): every rotated prop collided in the wrong place, and it took a user report to notice.

### 1.2 Textures, models, animations: Greyhound

Details: `weapons.md`, "Black Ops III assets (Greyhound)". Greyhound 1.46 sits at `C:\greyhound` in BO3's Proton prefix and must be started **inside the game's Steam Runtime container** (`steam-runtime-launch-client --bus-name=com.steampowered.App311210 ... wine 'C:\greyhound\Greyhound.exe'`), or it cannot see the game. `scratch/gk/batch.sh` is the working driver (session script: copy it), with a guard: after Search it crops the label at the top right and clicks Export All only if it reads "Assets found" (reference crops `scratch/gk/found{1,2,3}.ref`, one per digit count, because the label is right-aligned). A paste can silently fail and leave the search empty (2026-11-14): `xdotool windowactivate --sync` before the paste fixed it, and the guard catches the rest.

- One batch = kill Greyhound (`pkill -x Greyhound.exe`, never `-f`), relaunch, Load Game, paste a comma-separated name list into the search box (`xclip` + `ctrl+v`), Search, Export All, wait until `TheHoundsLog.txt` stops growing. Its input dies after one export, so relaunch for every batch.
- **Never run Export All on an empty search**: it exports the whole game (7.5 GB).
- Start each list from what is *not* in the export folder yet (`xmodels/<name>/`, `ximages/<name>.png`): Gorod Krovi needed 344 of its 738 map images and 1,391 of its 2,052 model names, everything else was already there from earlier ports. Export folder checks after each list: 0 missing images; 3 models never export (`veh_t7_ref_player_stand` and other editor stand-ins).
- `greyhound.json`: `exportmodelimg` off (exporting a model with its images froze it); export images in their own batch by name.
- What to export, in this order:
  1. Every image named in `<bsp>.json`'s materials (the map's own textures).
  2. Every static-model name in `<bsp>.json` and every `model` in `<bsp>.ents`. A long Export All can stop part way: compare the export folder with the list and run the rest again.
  3. The prop models' own textures: read each SEModel's material names and export those (a search by model name also catches `i_mtl_*` images).
  4. fxanim models and their animations (`p7_fxanim_*`): doors, gates, bridges, machines, quest pieces. Scenes spawn pieces that are in neither the static models nor the entities; search the scene's name.
  5. The sky model and its panorama (`skybox_<bsp>`).
  6. Weapons (7), zombies and bosses (8). Search by family rather than by name: `c_zom_dlc3` gave Gorod Krovi's zombies with gibs and hats, the dragon, the Mangler (`raz`) and the Valkyrie-drone zombie (354 assets with images); `ai_zm_dlc3` and `dlc3_dragon` their animations (the Mangler's are `ai_zm_dlc3_armored_zombie_*`); `sentinel_drone` the drone; `zmb_dlc3` the weapon models. First-person animation prefixes differ per weapon (`vm_zom_raygun_mk3_*`, `vm_dragon_shield_zm_*`; `vm_zmb` finds nothing), and a weapon's are only in memory once a player holds it (the Gauntlet of Siegfried's were missing until the user gave it to themselves with cheats: `give dragon_gauntlet_flamethrower`). **To find a weapon's real animation names**, read them from the map's fastfile: `bo3_ff_lights.py <ff> <out> --zone <file>` keeps the decompressed zone, then `strings -n 8 <zone> | grep '^vm_'` (the Gauntlet's are `vm_z_dragon_gaunt_*` and `vm_z_aint_no_dragon_*`, 49 in all; searching `gauntlet` finds none). The same strings give the weapon names for `give`. Keep the zone off `/tmp` (tmpfs: 670 MB of RAM) and delete it after.
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
| `_smod` fxanim static models (planes circling, swinging things) | The prop is there but frozen | The loop is compiled into the map: a stand-in motion in the map mod |
| Baked lightmaps (only 1x1 probes are readable) | - | The fork's own bake (4.3) |
| Per-surface colour tints | Props of one model all the same shade | Left out, or a tint by node name in the look module |
| Parts the game mirrors at run time (the Mangler's right shoulder pad) | A one-sided boss | Mirror the part in the builder or the mod |
| The wall-buy price table | A wall gun for 50 points | `wallPrices` in the map entry (2.5) |

### 1.7 The AI navmesh: `bo3_dump_navmesh.py`

BO3's zombies walk a Havok AI navmesh (Havok 2014.2.0-r1 packfiles, loaded in place), and its traversals (mantles, jump-ups, staircases) are user edges on it. Our generated navmesh (from `COL_` meshes, 2.4) misses whatever the collision misses and has no traversals, so a BO3 port can take the game's own instead (first done for Gorod Krovi, 2026-11-15).

```
python3 -I .tools/bo3_dump_navmesh.py --web export/web/mods/maps/<id>             # from the running game (same pool table as 1.1)
python3 -I .tools/bo3_dump_navmesh.py --from-raw --map <bsp> --web export/web/mods/maps/<id>   # decode the saved raw copy again
```

- Raw copy first (`export_game/bo3/maps/<bsp>/nav_raw/`: the navmesh asset of pool 97 and its six blobs, the navvolume of pool 98 for flying AI, not decoded), then `<bsp>.navmesh.json` (faces, edges, neighbours, clusters, settings, traversals) and, with `--web`, `bo3-nav.json` in the map folder (git-ignored ripped data; never let `OWN` in install-manifest.mjs match it).
- Layout (blob 3 = `hkaiNavMesh`): faces 16 bytes (`startEdge, startUserEdge, numEdges, numUserEdges, cluster`), edges 20 bytes (`a, b, oppEdge, oppFace` (-1 = boundary)`, flags, cost`), vertices hkVector4 in metres (x 39.37 = inches, game axes, Z up). Faces wind counter-clockwise from above; fan them as `[f0, fk, fk+1]` or Recast sees them face down and builds nothing. Generation settings (blob 0): character height 72, step 18, max slope 36.6 degrees (ours is 48). Erosion radius 0: the mesh runs up to the walls (Havok keeps clearance at query time), so our Recast erosion stays on.
- Traversals (blob 1, 80-byte user-edge pairs): two edge segments, two faces, two `.ents` node indices (the `node_negotiation_begin`/`_end` pair: its `animscript`, `mantle_over_48`, `jump_up_160`...) and a direction (3 = both ways). Gorod Krovi: 120 (mantles 59, jump-ups 57, one staircase). Each becomes a link 20 inside its two faces, both ways, with `over: [.5, start + h]` for `mantle_over_<h>`. The 27 negotiation pairs with no user edge are `air_buy_gate` with the AIRBORNE spawnflag, 45-110 over the mesh: the flying AI's, left out.
- Map entry `"navFile": "bo3-nav.json"` (custom-world.js): the navmesh is built from those floor polygons (no span clipping) instead of the collision, with the usual settings and erosion, and the links become off-mesh connections (`this.traversals`, so `path()` marks hops and enemies.js plays them). Missing file: generated as before. The cache signature covers the triangles and links, so a new dump rebuilds by itself.
- Closed doors still block: `refreshNav()` (from `setDoors`) switches off the polygons under closed doors and every link whose line passes through a closed door (Detour's `queryPolygons` never returns link polygons). `world.navBlock(id, box|null)` blocks a box by name on top of the doors (Gorod Krovi's bridge while raised).
- Gaps to expect: about 2% of Gorod Krovi's mesh area has no collision floor under it (props the clipMap holds that `COL_world` lacks, ledges, the bridge deck); zombies stand on the navmesh there. Spawn closets are separate islands (zombies enter through their windows), and Pavlov's House is reached only by the dragon.

## 2. Building the map

Details: `waw-ports.md`, both "Black Ops III maps" sections. **`build_bo3_map.py` holds both maps' rules: a change for the new map must not change the old ones' output** (keep per-map rules inside `MAPCFG` or behind the bsp name), or the old maps need their whole after-rebuild chain again.

### 2.1 The command

**One build script per map, from the first build**: `.tools/build-<map>.sh` (copy `.tools/build-gorod-krovi.sh`). It holds every flag, runs under the memory cap, and fails when a collision layer (`COL_`, `PCOL_`, `CLIP_`) is missing from the result. Never retype a build line or copy one from prose: Gorod Krovi's v=6 and v=9 were both built from the short command that used to stand here, without `--game-clip`, and both shipped with walkable out-of-bounds areas, props without collision and broken stairs ("old issues have come back").

```
systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=2G nice -n 15 \
  blender -b -P .tools/build_bo3_map.py -- <bsp> <map-id> --tex 512 --prop-tex 256 --game-clip --game-clip-simple 64
```

- That line is what the script contains for a map with a clip dump (1.1a); a map without one leaves the two `--game-clip` flags out and gets its collision from the render triangles (2.4).
- Blender is only there for its Python with numpy. Output: `export/web/mods/maps/<map-id>/<map-id>.glb` and `tex/` (external WebP, names carry their size).
- **Texture sizes are a VRAM decision, not a quality one.** The defaults (`--tex 1024 --normal-tex 512 --prop-tex 512`) put Der Eisendrache at 5.8 of 6 GB and it ran out; `--tex 512 --prop-tex 256` is what both maps ship with. A rebuild with other sizes regenerates every texture. Sharpness comes back through the detail pass (3.5), which spends memory only where a player can see it.
- Axes and units: CoD inches, Z up, to glTF Y up: (x, y, z) -> (x, z, -y), winding flipped. The same conversion is needed for every coordinate copied from a script or the `.ents` (the castle's `bows.js` has `W(x,y,z)` for it).

### 2.2 `MAPCFG`: what the builder must be told

For a new bsp add an entry with `start` (the start zone), `box` (the Mystery Box's first location) and `groups` (zones without a door between them that open together). Find the names in the `.ents`: `player_volume` entities' `targetname`s are the zones, `start_chest`-style names are the box spots.

### 2.3 What the builder makes from the entities

| In the `.ents` | Becomes |
|---|---|
| `info_player_start` | player spawn |
| `spawn_location` / `riser_location` structs | `ZSPAWN` markers, zone from `<zone>_spawners`; only window spawns, risers and points with floor under them are kept (every kind of spawn location and its checks: 2.3a) |
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

### 2.3a Spawn locations: take every one out of the dump, then decide

A BO3 map holds many more spawn locations than the two the builder turns into markers. List all of them straight after the dump, before the first build, and again after every build:

```
python3 -I .tools/bo3_spawns.py <bsp>                                              # the inventory, and what looks wrong
python3 -I .tools/bo3_spawns.py <bsp> --glb export/web/mods/maps/<id>/<id>.glb     # and the built map's markers per zone
```

It reads the `.ents`, prints the counts, a line per zone and a "to look at" list, and writes `<bsp>.spawns.json` beside the dump: every location with its origin and yaw, in the game's units (inches, Z up; the builder's `g()` converts). Keep that file: a later feature (dog rounds, a boss, co-op respawns) takes its points from there with no new dump.

| Kind | In the `.ents` | The Giant / Der Eisendrache / `zm_stalingrad` dump | In the fork today |
|---|---|---|---|
| Map start | `info_player_start` | 1 / 1 / 1 | `PLAYER_SPAWN` (CustomWorld reads one) |
| Co-op starts | four structs, targetname `initial_spawn_points` (the slot in `script_noteworthy` or `script_int` on some maps) | 4 / 4 / 4 | not built; the World at War ports use them for `PLAYER_SPAWN` |
| Respawn points | structs `player_respawn_point`: `script_noteworthy` = the zone, `script_int` = a distance, `target` = four spots, one per player | 9 / 29 / 9 points | not built |
| Zones | `info_volume`s with `script_noteworthy` `player_volume`: targetname = the zone, **`target` = its spawn structs** | 12 zones / 34 / 41 | zone ids of the markers |
| Zombie spawns | zone structs with `spawn_location` | 50 / 70 / 63 | window spawns; walk-in spawns on Der Eisendrache |
| Risers | zone structs with `riser_location` | 8 / 5 / 49 | `ZSPAWN` |
| Dog spawns | `dog_location` | 95 / 121 / 0 | not built |
| Special enemies | `mechz_location`, `sentinel_location`, `raz_location`, `direwolf_location`... one kind per enemy | 0 / 14 in zones, more at the boss arena / 96 | `CASTLE_MECHZ_<n>` nodes for the Panzersoldat |
| Holding spots | `wait_location` | 0 / 47 / 49 | not built; read the map's script for what waits there |
| Entry styles | `custom_spawner_entry <name>` (`crawl`, `boss_riser`) | 0 / 28 / 0 | not built |
| Windows | `zbarrier_zmcore_basicwoodbarrier*`, an `exterior_goal` that targets it, spawn structs with the same `script_string` | 28 / 29 / 46 | `WINDOW` + a `ZSPAWN` outside |
| Outside every zone | spawn structs no volume points at: boss arenas, drop pods, lockdowns, quest steps | 0 / 56 / 81 | by hand, with the script (5) |
| Enemy spawners | `actor_spawner_<map>_<enemy>` | 2 kinds / 6 / 6 | tells which enemies the map has (8) |

Rules:

- **Find a zone's spawn structs through the volume's `target`, never by a name ending.** The Giant and Der Eisendrache name them `<zone>_spawners`; the `zm_stalingrad` dump names them `<zone>_spawn`. `build_bo3_map.py` tests `endswith('_spawners')` in four places (risers, walk-in spawns, window spawns through `zname`, the Panzersoldat points): on a map with another ending it makes no riser or walk-in spawn and prints no error. The tool says so in its "to look at" list; change the builder to follow the targets before the first build.
- `script_noteworthy` can hold several words (`custom_spawner_entry boss_riser`): split it on spaces, do not compare the whole string.
- `script_string` `find_flesh` = the zombie goes straight for the players. Any other value is the name of a window set: the barrier with the same `script_string` is the window that struct feeds, and the `exterior_goal` gives the outward side.
- What becomes a `ZSPAWN`: one per window (80 units out toward the exterior goal, so CustomWorld pairs it: a `WINDOW` needs a `ZSPAWN` within 400), every riser, and, **only on a map with few windows**, the `spawn_location` structs that have floor under them (`floor_below`: collision within 48 under and 60 clear above), marked `extras.walk`. That last branch is written for `zm_castle` alone: a new map of that kind needs its bsp added. Unpaired `spawn_location` structs behind walls are left out on purpose ("spawning everywhere").
- CustomWorld snaps a `ZSPAWN` to the navmesh within 120 (48 for walk-in ones) and throws when a map has none. `strandedSpawns` moves a spawn that cannot walk to the start; `nearbySpawns` keeps spawns to the player's navmesh island.
- Kinds the engine has no marker for go into the GLB as the map's own named nodes with `extras.zone` and `extras.yaw` (`CASTLE_MECHZ_<n>` is the pattern), and the map mod picks among those of the open zones, as the script does.
- A zone with no zombie spawn of its own (the tool lists them) is fed by its neighbours in BO3: check the zone script before adding any.
- Co-op starts and respawn points are not used yet. A map whose start room can be shut off, or that has a boss arena or a one-way drop, needs them: place them as named nodes and respawn a revived or late-joining player at the point of an open zone.

Checks, each build:

1. The tool's "to look at" list is empty, or every line has a written reason.
2. `--glb`: one `PLAYER_SPAWN`; the `WINDOW` count equals the dump's windows; every dump zone with zombie spawns has `ZSPAWN`s under its id or under the group it was merged into (`MAPCFG.groups`).
3. The builder's `markers:` line (`ZSPAWN`, `ZSPAWN_window`, `ZSPAWN_walk`, `WINDOW`) against the tool's totals: a kind at 0 that the dump has is a naming difference, not an empty map.
4. In a match (10): the load log has no `has no ZSPAWN within 400 units; skipped`; every `ZSPAWN` paths to the player with all doors open; zombies of a newly opened zone start coming from it; none appears inside a wall, on a roof or in plain view beside the player; special enemies arrive from their own points.

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
| `POSED_CHARACTER` | corpses and posed bodies left out of the map GLB; they come back posed from `build_posed_bodies.py` (2.7) | T-posed corpses standing in rooms |

- Props over 1,500 triangles are decimated (`simplify()`) into `PCOL_props`. In the navmesh layer they added 40 s to the load.
- Stairs get a two-sided ramp quad per flight; the map entry needs `"stairSmoothing": true` and `"player": {"slopeStick": true}` or the player slides down them.
- After every collision change: the full collision check (10.1): the offline flood first, then reach and mobility in a match. The navmesh is cached per player by its collision triangles, so a collision change rebuilds it on its own; a change to the navmesh *settings* needs `NAV_CACHE_VERSION` bumped.
- **Intro boxes**: a level material that walls in the spawn makes the first flood (`col-audit.mjs --from-spawn --flood-only`) stop at a straight-edged rectangle with almost every marker unreached. Gorod Krovi has `wc/infinite_blackness`, a 2390 x 1300 x 708 black box around the start plaza that the game hides after its intro; it goes in `SKIP` for that map (not drawn, not solid). Find such a surface by the material of the drawn triangles in the wall's plane (2026-11-15).
- Script structs are often not on a floor (the dragon roosts are on decks no one can walk to, Pavlov's landing is 380 units up): put a marker made from one on walked floor next to it, picked from the flood's `--points`.
- **Name rules hit the wrong props**: the prop rules go by model name, so check what each catches on a new map. On Gorod Krovi `WALKABLE` caught the department store's storey facades (`dept_store_facade_1st_floor`...) by the word `floor`; over 6,000 triangles they became their bounding box, a solid 680 x 680 x 196 block that sealed the store (the flood showed a diamond of unreached floor inside the reached street). The build log prints `walkable boxed:` for every prop that rule boxes; read the list. To find which prop a blocking wall belongs to, cast a ray in col-audit (the hit triangle's corners), look for a drawn triangle with the same corners (none = a prop in `COL_world` or a builder ramp), then list the props whose placement and size fit. Gorod Krovi's list also boxed its metal ramp-bridges (54-unit steps: the factory catwalk cut off) and whole staircases in one model (walls; their hull is a ramp). A staircase whose lowest step is broken off needs a ramp quad (BO3 had a clip ramp there). Try a ramp before rebuilding: push its triangles into `cp`/`ci` in a copy of col-audit (just before `const cgeo`) and rerun the flood.
- Fine-tuning without a rebuild: the map entry's `propCollision` (`mesh`/`box` regexes, `minHeight`), audited with `.tools/col-audit.mjs` (`custom-maps.md`).
- **The game's collision instead of the render triangles: `--game-clip`** (opt-in, 2026-11-15; needs the clip dump of 1.1a). `COL_world` then holds the game's world brushes and soup that stop player, zombies and bullets, and three more meshes come with it: `PCOL_gameclip`, `CLIP_gameclip`, `NCOL_gameclip`. The props keep the rules above, except anything with `stair` in its name (the game's clip ramps take over) and the dept-store ramp quad. `--game-clip-models` also replaces the props with the static models' own collision (heavy: 2.3 million triangles on Gorod Krovi, mostly rubble and corpses). Gorod Krovi with `--game-clip`: `COL` 292,000 triangles (the render `COL_world` had 1.15 million), `CLIP` 57,000, `NCOL` 54,000.
- Why (Gorod Krovi comparison, 2026-11-15, inside the player zones): the render collision missed 56% of BO3's exposed clip-brush area by over 12 units, almost all walls (the invisible walls), and 34% of the static models' solid collision. 1.9% of ours had no game collision within 12 units (windows, burnt wood piles, the dragon platform, broken stair hulls, ceiling tiles drawn but not solid). Stairs: BO3 walks the player on a clip ramp over every flight. Our department store flights were within 4 units of it, but the broken flights were 13-66 off, and `stairs_broken_full_piece` and the library's broken stairs up to 192 and 105.
- **`--game-clip-simple N`** (2026-11-15, Gorod Krovi, user: "collision doesn't follow the actual look", "causing the player to fall", "still able to walk through here"). It sits between the prop rules and `--game-clip-models`. Only static models whose game collision is light (at most N triangles: the hand-made boxes and slabs of beams, plates, panels, columns and railings) take the game's collision, classed by instance height like `--game-clip-models`. Instances under `STEP` are left out unless they are wide floor pieces (`LOW_W` 48, and not matching `LOW_CLUTTER`: debris, books, pipes...). The models it takes skip the builder's prop rules. Heavy collision (rubble, corpses, burnt wood) stays with the rules. Gorod Krovi builds with `--game-clip --game-clip-simple 64`. **Version 6 had lost `--game-clip`** from its build command, so it fell back to render collision, which caused that report.
- **Static-model rotation (fixed 2026-11-15)**: CoD multiplies row vectors (`local = (world - origin) @ invScaledAxis`), so `world = origin + local @ inverse(invScaledAxis)` (`smodel_tris`, as `build_waw_map.py` does). Until then `bo3_clip.py` applied the transpose, which turns a rotated model the other way: 21,383 of zm_stalingrad's 49,464 instances had collision off their look. Example: a flat floor plate at the factory roost stood up as a 92-unit wall across the stairs. Check a change by comparing each instance's transformed collision bounds against its `absmin`/`absmax`: after the fix all fit, except for 347 instances with bone-local parts (corpses, the MG42, barbed wire).
- **Auditing a game-clip build**: `col-audit.mjs` loads `CLIP_` too since 2026-11-15, because the player stands on the clip ramps. `--glb file` audits another copy, e.g. the previous version gunzipped from its `.glb.gz`. `--flood-only` has no `collisionCut`, so roost platforms show as unreached; check them with a walk test. The v6 flood's 811,000 points had 396,000 below y -20 (leaks under the map).

- **Doors, in this order** (Gorod Krovi went through all four the wrong way round): (a) place the game's real gate and door models where they are exported, and read the open move from the door's open animation; (b) a buy door whose model is a shell (1.6) becomes floating debris from the map's own rubble, with the invisible pile as collision and path block; (c) a stand-in is the last resort: upright, and its line comes from the door's own clip slab, never from a measured passage (a diagonal doorway or a wall without collision breaks the measurement: "gate twisted through its walls"); (d) list the doors that have no pieces at all and add their blockers in the mod (a hatch that looks shut but is decoration: the real blocker was an invisible brush).
- **Brushes a script switches are solid in the dump.** Anything a script removes at some point (a keep-off volume over a platform, a power door) must be cut with the map entry's `collisionCut` or handled by the mod. Cut only `COL_` meshes.
- **Props the mod places have no collision.** Scene props and script models are not in the clip dump: build a collider from the posed model in the mod (and see 10.1 D).

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

- `zombieWalls: true`: traversals arc over what stands in their way and zombies take no straight shortcut through a wall, door or clip (a map with fences and ledges between its areas).
- `wallPrices: {"<weapon id>": price}`: a BO1 gun that stands in for a BO3 wall gun and is box-only in BO1's data costs 50 points unless it is priced here.
- `opaqueLayers: "<regex of material names>"`: thin opaque layers lying on a floor (carpets, rugs) lose the depth test at range and "fade away when you're far enough"; named here they are drawn as layers. Don't detect them automatically against the collision mesh: that flags whole floors.

### 2.6 After every rebuild

The map's derived data is matched to the GLB and goes stale with it. Der Eisendrache has `.tools/castle-after-rebuild.sh` for this; a new map needs the same list (copy the script when it has a void-ceiling table):

1. Bump `?v=` in `maps.json`.
2. Void-ceiling table, if the map has one (3.6): `castle-ceilings.mjs status` says whether it still fits.
3. Light volume: `node .tools/bake-map-light.mjs <id>` (delete its `--cache` file first).
4. Detail table: `node .tools/map-detail.mjs <id> --pts <walkable points> --go`.
5. Any map-specific texture fix-ups (The Giant: `node .tools/giant-chalk.mjs`).
6. Light test copy: `node .tools/map-lite.mjs <id> --force`.
7. Compressed copies: `node .tools/build-ktx2.mjs mods/maps/<id> --jobs 3` **on every new map and after any texture change**, then `node .tools/build-gz.mjs` (**before looking at anything**: while an old `.glb.gz` exists the server sends that, so the OLD map is what loads; a rebuild once gave a byte-identical picture this way). With `textureArrays` a texture that has no KTX2 copy is shrunk to the array's layer size (256 px on Gorod Krovi): its first build was played without KTX2 copies and the user called every texture "extremely blurry" (2026-11-15).
8. `MAP=<id> ... node .tools/map-test.mjs` once (10.3).
9. Spawn markers against the dump: `python3 -I .tools/bo3_spawns.py <bsp> --glb <the new GLB>` (2.3a).
10. **Collision numbers against the previous version**, before `?v=` goes out: the build log's `game clip:` line, the flood's unreached markers and its points under the map (`col-audit.mjs <id> --flood-only`; Gorod Krovi: 9,532 on a good build, about 396,000 on one built without `--game-clip`), and `stuck-audit.mjs` (0 enterable, 0 mantle traps; 10.1 E). A number that jumps means a flag was lost: stop and rebuild with the map's script.

### 2.7 Bodies in the scenery: `build_posed_bodies.py`

A BO3 map places its dead soldiers as static models of full character rigs, and a static model comes out of the export in its **bind pose**: arms out, legs straight, lying in the snow like a shop dummy (Gorod Krovi has 252, Der Eisendrache 83 plus helmets and loose limbs). The pose each body has in the game is not in anything the dump or Greyhound gives, so the bodies are posed here, after the map build, without touching the map GLB:

- `~/.local/opt/blender/5.2/python/bin/python3.13 -I .tools/build_posed_bodies.py <map-id> [--preview <dir>] [--stiff <out.glb>]` (about 4 s, Blender's python only for numpy). It reads the placements from the level dump (`models`, 1.1), the models and BO3's zombie death clips from Greyhound, and writes `mods/maps/<map-id>/bodies.glb` (ripped: stays in the git-ignored map folder, never in the install manifest's `OWN`). A new map is one entry in its `MAPS` table: the dump name, a regex for the full-body models (`posed`), one for rigid pieces placed as they are (`rigid`: helmets, loose limbs), `tex` (False when the map GLB already has the models' materials, the file then carries no textures) and texture caps.
- **A body on the ground** (its long axis under 0.62 from level) takes the last frame of one of 21 death clips, turned so the body lies along the axis the mapper gave it, face up, face down or on its side as placed, with the torso resting on the ground the stiff body lay on. Only clips that end flat are used (`FLAT`), mirrored copies double the set, and each body takes the least-used pose that no body within 320 units has.
- **A body that stands, leans or hangs** keeps the mapper's transform and goes limp: head, arms, spine and knees give way toward gravity as seen from the model (`limp_pose`).
- The poses are written as plain instanced meshes (no skeleton), one node per model and pose: `body_<model>_<up|down|side|limp><n>`.
- In the map mod, **before** anything that tags or patches the map's meshes: `await posedBodies(api, { url: 'mods/maps/<map-id>/bodies.glb?v=1', stiff: /^prop_<model prefix>/ })` (`posed-bodies.js`). It removes the map's stiff copies when `stiff` is given (Gorod Krovi, whose build keeps them), gives a posed mesh the map's own material of the same name when there is one, and adds the lot under the map root, where the engine batches them like any placed prop: same draw calls as before. `?stiffBodies` loads the map without it (A/B); `kino.posedBodies` = `{bodies, meshes, replaced}`.
- Not needed after a map rebuild (it reads the dump, not the GLB); bump the `?v=` on its URL when the file changes and rerun `build-gz.mjs`.
- Check with `--preview` (a contact sheet of every pose from above and from the side) and in the game on the light copy: the posed bodies should sit on the ground about as often as the stiff ones did (Gorod: 137 of 226 lying bodies within 6 units of the floor, 132 of 232 before; the rest are the mapper's own, on props without collision or half under rubble). The light-copy harness forces every bitmap to 16 px, so a batch that mixes its textures with full-size ones logs `texSubImage3D: source sub-rectangle ... invalid` there: a harness artefact, not a game error.
- **Leave alone** props that are modelled in their pose even though they carry a rig: `p7_ven_charred_body_advanced` (Gorod's 51 burnt bodies, arms drawn up as burnt bodies are), mannequins, bone piles.

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
| Decal shaped by its reveal map (a `decal` material, not `_blend`, with image slot `34d849d5` = `_r`; its colour map is a whole opaque tile, e.g. the concrete cracks use `i_t7_concrete_bare_light_01_c`) | slot `34d849d5` in the dump's material images | the builder's `texture(..., reveal)` writes colour alpha x reveal into `tex-src/` (`$white_diffuse` decals: white, tinted by name). Without it each decal is a solid pale slab (Gorod Krovi 2026-11-16, 23k triangles of cracks; only `zm_stalingrad` uses it so far, the older maps keep their output until someone rebuilds them on purpose) |
| Alpha is data | everything else | **opaque** |

Checks:

- The builder marks overlays by name only and merges equal materials under the first name, so some overlay shells still come out opaque (snow sheets, solid decals). Both maps fix this at load with a list per map: `overlays.js` `overlayLayers(root, {blend, mask, glass, snow, soft})`, called **before** the static merge. A new map needs its own lists; better, teach the builder (the notes say so and it has not been done).
- **How to find them:** make a contact sheet of every map image as colour beside alpha (The Giant: 74 of 293 images carry alpha), then look at each candidate on the GPU before and after. List only what is visibly wrong.
- Overlays need a fixed draw order and a polygon offset. A push along the normal alone loses to depth precision at range ("lots of texture clipping, textures flicker"); 41% of Der Eisendrache's level triangles are overlay layers.
- Prop vertex colours from Greyhound are all 255: a prop's snow layer cannot use vertex alpha (the castle derives it from the world normal).
- The engine draws every material in a single pass, so a transparent double-sided material costs one program, not two; that program must still exist before the warm-up (9).

- **Flood water**: look for water materials in the material list at the inventory, before the user finds an opaque basement.
- **Thin opaque layers** (carpets, rugs) go in the map entry's `opaqueLayers` (2.5).

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

- **Look passes must cover door parts.** A buy door's parts are moved out of the map root at load, so a pass that walks only `world.root` misses them (Gorod Krovi: gates drawn blue from a normal-only decal). The look harness kept doors under the root and hid it: check one door close up in the real game.

### 3.3 Void planes and holes

BO3 closes unseen space with black planes (`wc/global_diffuse_black`, `infinite_blackness`, `global_black`). Untextured near-black, the metal stand-in made them mirrors.

- `blackPlanes(root, match, ceilings, props)` gives them one unlit black material (no fog, both sides: their winding is mixed), and gives black *prop parts* a lit flat colour by kind.
- Where a void plane is a room's ceiling, players see a black hole overhead. Der Eisendrache redraws those as stone from a table (`ceilings.js`: `tris`, `patches`, upright `walls`) made by `.tools/castle-ceilings.mjs` from rays cast from every walkable point. The table is signed with the GLB; a rebuild leaves it stale (2.6).
- **Judge holes with rays on the real GLB, never on the light test copy and never from a screenshot alone.** The light copy drops stone (it showed gaps that do not exist), and a blue patch can be a beacon or the next room's light. What looks like sky through a gap can also be an opening the original really has.

### 3.4 Sky

Export `skybox_<bsp>` and its panorama (8192x4096). BO3 stores it dim (Der Eisendrache uses gain 2.7-3.2). Draw it as an equirectangular lookup by view direction on a sphere that follows the camera, unlit, no fog; fade its horizon band into the fog colour. **Do not set it as `scene.background`** (with texture arrays every map material turned white), and do not use BO3's 96-vertex sky box mesh (it warps).

**Heading.** The panorama's middle column faces heading 307° (BO3 degrees, x toward y), fitted on Der Eisendrache's moon. Add the turn to the lookup's u as Gorod Krovi does (`SKY_TURN = .6028` in `mods/gorod-krovi/look.js`: `u = atan(d.x, -d.z)/2π + .5 + SKY_TURN`), or the sun's glow sits on the wrong side of the map. The glow in the sky art need not be where the sun settings put the sun (Stalingrad: 15° beside it and lower).

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
   - **Take the sun from the game**, not from the sky picture: `python3 -I .tools/bo3_ff_sun.py "<BO3>/zone/<bsp>.ff"` prints its heading, height, colour and the three.js direction. Use that direction for the key light **and** for the bake entry's `sun` (Gorod Krovi's first key came from the opposite side: wrong walls lit, shadows the wrong way).
   - **Take the grade from the game**: `python3 -I .tools/bo3_ff_lut.py "<BO3>/zone/<bsp>.ff" export/web/mods/maps/<id>/lut.png` writes the map's colour cube and says whether it tints. Give the map a `GRADES` entry with `lut: 1` and neutral `black`, `contrast`, tints and saturation (lighting.md); don't invent a split tone the game doesn't have. The fog settings are not readable yet: fog stays by eye.
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
- **Tuning brightness, with targets** (Gorod Krovi was tuned blind twice, once far too dark, once washed out): (a) compare the map's lights with an earlier port's (median radius-weighted intensity) and scale `gain` by the ratio; (b) compare the marker medians in `light.json`; (c) compare frame brightness with the user's reference frames (0) on matching views, `ffmpeg -i frame.png -vf signalstats,metadata=print:file=- -f null -` and read `YAVG` (Gorod Krovi: BO3 54, our washed-out version 85, after the fix 74).
- **Don't cure darkness with the floor.** Raising `fill`, `adapt` or `skyFloor` lights every cell alike and flattens the map. Raise the lamps (`gain`) and the key light, and keep the dark corners dark.
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

- **Where a look may be judged**: on the real GPU, on the full map or a cropped page with the real textures. Never on the light copy (16 px textures), on SwiftShader, in `map-test.mjs` (phone emulation, capped at Medium) or within 2 s of a test teleport (the fx mod's teleport lightning is in the frame).

### 4.6 The sun: shadows and rays

- **An outdoor map gets a real shadowed sun** on the pattern of `mods/gorod-krovi/sun.js`: one static whole-map shadow map, redrawn only when a door opens, the power comes on or the area changes, plus a small per-frame map for what moves. Traps: the sliced shader warm-up asks for every shadow map on each slice, so draw once at `warm` and then only on request; call `kino.instanceCull.cullShadowCasters(true)` and draw between `restore()` and `reapply()`; resting props are `shadowBaked` (CLAUDE.md, Culling and Visibility culler). Register the light with `kino.shafts.add(light, {...})` for ray-marched sun rays (`lighting.md`, Real light shafts).
- **A map that keeps the engine's shadowless key light still gets sun rays**: add it to `MAPS` in `mods/lighting/sun-shafts.js`. That draws the map's depth from the key light once at load (again on a door or the power) and feeds the same shaft pass; nothing lit changes and no shader is added. Solid meshes block the light, cut-out and see-through materials pass it; a mesh that must not block (a sky shell built as map geometry) gets `userData.noSunShafts`. Check the depth picture with `kino.sunShafts.debug()` and tune `kino.sunShafts.entry` live. The depth map covers the play area (spawn, zombie spawns, interactions, box spots), so those must exist before the `warm` event; `kino.sunShafts.stats.area` says `play` when it found them. Keep `strength` low and let `indoor` carry the rays: in open air the pass only adds an even haze (lighting.md, Sun rays on maps without a shadow-casting sun).

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
| Perks | all machines stand upright, face the room (`perkYaw`, which also turns the stand-in power panel since 2026-11-17: it stood edge-on to its lever), right models (`machines: "bo3"`); two on one spot slide apart |
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

- **Interactables go on flood points.** A booth, machine or anything with a prompt is placed on ground the flood (10.1 A) reaches from the spawn, and each one is checked by a walk with the real controls until its prompt shows. "Flush to a wall and level" is not a test: Gorod Krovi's terminals stood out of reach.
- **Teleport destinations.** The Gersch Device, the QED and Anywhere But Here take a random barricade window. On a port whose windows come from BO3 spawn spots most of that list is out of bounds: give the map its own in-bounds list (`world.playerSpots`) and test every spot.
- **Window spawn spots**: check every one. Is the spot on the outside of its window, and does the window sit between two walkable areas?
- **Wall buys**: price BO1 stand-ins in `wallPrices` (2.5).

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

- **Build the map's box wonder weapon with the map**, not when the user asks where it is.
- **Effects come from the client script** (`_c.gsc`/csc of the weapon): read it before writing a wonder weapon's effect. An invented one was rewritten a day later.

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
2. **Collision**: the whole of 10.1, after every build that changes geometry, collision tables or `propCollision`, and again before release.
3. **Whole map, logic only**: `node .tools/map-lite.mjs <id>` once per rebuild, then `MAP=<id> [FIRST=1] PLAY=scratch/x.js flock scratch/melon/heavy.lock ~/.local/bin/lowpri node .tools/map-test.mjs` plays a real match on a light copy with a memory watchdog (`FIRST=1` on a map's first run, for the navmesh build). For doors, quests, traps, sounds, co-op (`INIT=.tools/play/coop-init.js` with a guest script). **Not for looks, and not for holes.**
4. **Looks** go on the real GPU (`--use-angle=vulkan --enable-gpu --ignore-gpu-blocklist`) on a cropped piece of the map or a routed test page with the same bloom and tone mapping. A full map at real textures passes 2.5-3.2 GB before it is ready and breaks the memory rule.
5. **Holes and sight lines**: rays on the real GLB (3.3).
6. **Performance**: the per-area bench before and after each change, never two games on the card at once.
7. Then ask the user to play it. Their reports are quoted in the notes with the fix: that list (12) is the real test plan for the next map.

### 10.1 Collision: the full check

Collision is checked three ways, because each one misses what the others find: an offline flood (what the collision lets a player walk), a match on the light copy (what the game does with it), and a walk with the movement mod (jumps, mantles and wall jumps, which the flood does not model). Write the counts into the map's notes each time, so the next change has a before and after.

**A. Offline: `col-audit.mjs`** (Node, no browser; details in `custom-maps.md`, "Prop collision from the map entry")

```
~/.local/bin/lowpri node .tools/col-audit.mjs <id> --from-spawn --flood-only     # seconds, little memory
~/.local/bin/lowpri node .tools/col-audit.mjs <id> --from-spawn                  # the full pass
~/.local/bin/lowpri node .tools/col-audit.mjs <id> --flood-only --trace x,y,z    # how did the flood get there?
```

The flood walks a 16-unit grid from the spawn with the player's step (18) and drop (110) over the `COL_` and `PCOL_` meshes plus the `propCollision` shapes. It has no doors (door colliders are made at runtime, so it walks the map as if every door were open) and no `CLIP_` meshes (a player clip added against a climb-out does not show in it).

| Result | Meaning | Pass when |
|---|---|---|
| Unreached markers | a perk, box spot, wall buy, door, trap, teleporter, Pack-a-Punch or power switch the player cannot walk to | none, or each one explained (reached by teleporter, tram or a quest only) and written down |
| Points under the map (`--flood-only` counts walked points below y -20; on a map whose floors go lower, read the lowest point it prints instead) | the flood left the playable space: a hole in the floor, a gap between a wall and the terrain, or a prop that works as a step over a wall | none; find the way out with `--trace` |
| `through` | a step the collision allows that passes through something drawn: walk-through walls and props | none on walls and floors; props left walk-through on purpose (wires, small clutter) listed by model |
| `ghost` | a step the collision blocks with nothing drawn within 24 units: invisible walls | none, except the map's real clip brushes rebuilt on purpose |
| `floor` | drawn floor more than 8 units above or below the collision floor: feet sink in, or the player floats | none over 8 on walkable floors; pads and rims over 18 block the way in |

- The lists come by source model and in clusters: fix the model's rule in the builder (2.4) or in `propCollision`, not the single spot.
- Test a `propCollision` rule set before it goes into `maps.json`: `--rules file.json --flood-only`. The unreached markers and the count of points under the map must be the same as with `--no-rules`; if not, the rule leaks. Boxes around jagged or sloped props become steps (boxes on broken wall ends let the flood climb out of The Giant; boxes on rubble made invisible blocks): keep `box` for upright, box-shaped props, and let `minHeight` drop low shapes.
- The full pass holds every drawn triangle near the walked space: about 3 GB for The Giant. Run it under the memory cap and alone. **It has never been run on a map of Der Eisendrache's size** (only its flood has): if it does not fit, run the flood on the whole map and the full pass per area.
- `--points file.json` writes the walked points; the ceiling scan and the detail pass start from them, so a wrong flood also spoils those.

**B. In a match on the light copy** (`map-test.mjs` with a `PLAY` script; the light copy keeps the collision meshes exact)

| Check | How | Pass when |
|---|---|---|
| The load line | read `[custom-world]` lines in the console: collision triangle counts, prop collision instances, navmesh build time | counts match the build's; no navmesh error |
| Zombie reach | from the spawn and from one point in every zone, with all doors open, path every `ZSPAWN` to the player | every spawn reaches every area (Der Eisendrache: all 99) |
| Reach with doors shut | at the start, path from the spawns of the start zone only | zombies reach the player without a door; no spawn is active in a closed zone |
| Mobility | 50 random navmesh points; at each hold forward 0.45 s in four directions | the player moves in at least one direction everywhere ("can't move in a lot of spots") |
| Doors | ray through each doorway before and after buying | blocked before, clear after, pieces gone, zone open |
| Windows | walk the player into each window; send a zombie through | the player is stopped, the zombie climbs in, boards rebuild |
| Stairs and ramps | walk up and down every flight, and stand still on it | no slide, no stop at a step, speed kept |
| Floors that look solid | stand on every grating, catwalk, plank bridge, pad and platform kind | no falling through; none of them drawn more than 8 off the collision |
| Teleporters, pads, trams | use each one, then stand still 2 s | the player lands on a floor inside the map and stays there |
| Moving collision | ride every mover; stand in the way of every door or slab that shuts | the player moves with it and is pushed or crushed, never left inside it or pushed out through a thin wall |
| Bullets | shoot at a solid wall, a solid prop, a fence, glass and foliage with a zombie behind each | walls and solid props stop the shot; fences, glass and foliage do as the original does |
| Special enemies | spawn the boss in the tightest room and the largest | it reaches the player or uses its fallback; its attacks check line of sight (`world.lineClear`) |
| Out of bounds | put the player under the map and into every pit or void the map has | the engine's net (600 under the map's bounds: respawn, "You fell out of the map") catches the fall; a map with pits, chasms or low gravity needs its own watcher that returns the player sooner (Der Eisendrache's `setupBounds`) |

**C. By hand, with the movement mod on** (the user, or a GPU page on a cropped area)

The fork's player can do what BO3's cannot: slide, dive, mantle, wall jump, low gravity. The flood knows none of it.

- Along every outer wall, ledge, roof edge and fence: try to mantle and wall-jump over. Anything that works needs a `CLIP_` mesh (player capsule only) or a higher wall in the collision, and a note.
- Every prop that is solid for the player only (`PCOL_`): zombies and the navmesh ignore it, so check zombies do not visibly walk through large ones on the main routes; a prop zombies must go around belongs in `COL_`.
- Thin single-sided surfaces (panels, railings, car walls): walk into both sides and get squeezed against them by a mover.
- Low doorways, beams and stair ceilings: crouch, slide and jump under them (the step-up lifts as far as the ceiling allows).
- Places where the original has an invisible wall (brush clips are not in the dump): map edges, cliff sides, gaps beside bridges and gondolas. Compare with the original game.

**D. Collision changed at runtime** (code review, each time a mod touches collision)

- A collider pushed onto `world.dynamic` has `.box`, unless it is `window: true` (or `world.setDoors` crashes).
- `world.collision.invalidateCache()` after any edit of the collision geometry (the player's nearby-triangle cache keeps the old shape otherwise); `world.collision.useCache = false` is the A/B switch when a bug looks like a stale cache.
- Anything that moves and can be stood on goes through `addScriptedMover` and is moved every frame, not teleported in steps.
- The navmesh's shape never changes in play: a runtime blocker zombies must respect needs its own hold or reroute, or `world.navBlock(id, box)` to switch off the polygons (and links) under it while it stands (1.7).
- A collision change in the build changes the navmesh cache key by itself; a change to navmesh *settings* needs `NAV_CACHE_VERSION` bumped, or players keep the old mesh.

**E. Stuck spots, slides and the test tools**

- **`stuck-audit.mjs`** next to the flood: `~/.local/bin/lowpri node .tools/stuck-audit.mjs <id> <points.json>` drops the game's own player controller on every walked point and every ledge a jump or mantle reaches, and reports spots it can't leave (`ENTERABLE` = reachable from open ground; mantle traps). Target: 0 and 0. Its limit: runtime colliders (doors, scene props, debris) are not in an offline test. The `mods/unstick` mod is the safety net in play, not the fix.
- **Slide test**: slide and slide-jump over stair edges and ramps in a match (the slide's snap once put the player inside a step).
- **`map-test.mjs`**: `ROUTE=/mods/x/mod.js=scratch/old.js` serves a file of your own in place of the game's, for an old-against-new run of a code change. Gotchas: the player is invulnerable by default and the round must be live for hazards to hurt; fixed sleeps fail because the page runs slower than real time (wait on state); it emulates a phone at Medium; its memory watchdog counts every Chromium on the host, so every session must hold `scratch/melon/heavy.lock`.
- Checking for a leftover browser: `pgrep -f "[m]s-playwright/chrom"` (without the brackets the check matches itself).
- **Ask the user for the position with every collision report**: `kino.debug.getState().player.feet` typed in the console. A screenshot alone cost a whole audit to locate.

## 11. Release checklist

- [ ] `git status --short` shows no ripped file; new asset folders have a `.gitignore` with `*`; nothing new matches the install manifest's `OWN` list by accident, and own data that players need does match it.
- [ ] `?v=` bumped once for the final GLB; `build-gz.mjs` and `build-ktx2.mjs` run; light volume, detail table and any ceiling table belong to this GLB.
- [ ] Explore and zombies modes both start; warm-check clean; no `[mods] slow setups`, no console errors, no "table is stale" warning.
- [ ] Spawn locations (2.3a): `bo3_spawns.py` run on the dump and against the built GLB, nothing left unexplained; `<bsp>.spawns.json` kept; no window skipped for a missing `ZSPAWN`; every zone spawns once opened.
- [ ] Collision (10.1): flood from the spawn with no unreached marker left unexplained and no point under the map; `through`, `ghost` and `floor` lists empty or explained; reach, mobility, stairs, movers and bullets pass in a match; outer walls tried with mantle and wall jump; the counts are in the map's notes.
- [ ] Every door, perk, box spot, wall buy, trap, teleporter and the Pack-a-Punch used once in a test match; power on and off; a full round with zombies from every open zone.
- [ ] Each quest step done through its debug handle and once for real; a guest and a late joiner see the same state.
- [ ] Quests and Easter eggs played start to finish, or listed as untested in the release note.
- [ ] Every looping sound heard in a game, with its range checked on foot.
- [ ] The collision numbers of 2.6 step 10 written into the release note.
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
| "Everything is WAY too dark" | a knee that halved every room | the game's own lights and `gain`; `fill`/`adapt` only a little (they flatten the map, 4.3) |
| Flat, washed-out light | `fill` / `skyFloor` raised to cure darkness | raise lamps, not the floor; measure against reference frames (4.3) |
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
| "Textures are extremely blurry" (Gorod Krovi) | no KTX2 copies: the texture arrays shrank every map texture to 256 px | `build-ktx2.mjs` on the map folder (2.6 step 7) |
| "Doors are missing" (Gorod Krovi) | BO3 fxanim door models (`p7_fxanim_zm_*_door_*_mod`) are shells: joints and one `global_invisible` mesh, the real pieces come from zbarrier assets/scene bundles that weren't exported | builder: `shell_model()` → `crate_pile` (buy doors) or `gate_standin` (sized from `measure_passage`); export the real pieces when known |
| Invisible wall across a street; navmesh cut between two doorways | one door's pieces 1,350-1,400 apart in one box (two triggers sharing a target, or one buy opening two piles) | builder dedupes shared targets (`extras.zones`); engine `doorGroups()`: a blocker and prompt per group of pieces more than 150 apart |
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
| Spawn walled in, 34 of 36 markers unreachable (Gorod Krovi) | the intro's black box (`infinite_blackness`) drawn and solid | `SKIP` it for that map (2.4) |
| Department store sealed (Gorod Krovi): its floors unreached from the street, revive and wall buys inside | facade props matched `WALKABLE` by `floor` and collided as their box | keep facades as they are; read the `walkable boxed:` lines (2.4) |
| "Old issues have come back": stairs broken, out of bounds reachable, props without collision | a rebuild from a command without `--game-clip` (Gorod Krovi v=6, v=9) | the map's build script (2.1); the collision numbers (2.6 step 10) |
| Doors or gates blue, or with blue splatter | a normal-only decal on door parts, which leave the map root | look passes cover door parts (3.2) |
| Gate twisted or through its walls | stand-in measured along a diagonal passage | real gate models; the door's clip slab for the line (2.4) |
| A door that looks shut can be walked through | the hatch is decoration; the real blocker is an invisible brush the builder skipped | blocker in the mod (2.4) |
| Collision floats above a platform | a keep-off brush the script removes | `collisionCut` on `COL_` only (2.4) |
| Everything rotated collides in the wrong place | transpose in `bo3_clip.py` (fixed) | the `absmin`/`absmax` self-test on new dumps (1.1a) |
| Terminals out of reach | placed by wall fit, not by reachability | flood points and a walk-to-prompt test (6) |
| Teleports land out of bounds | the window list is BO3's spawn spots | `world.playerSpots` (6) |
| Player stuck between props | V-shaped gaps; slide snap without a fit check | `stuck-audit.mjs`, `mods/unstick` (10.1 E) |
| Carpets vanish at range | depth precision on thin opaque layers | `opaqueLayers` (2.5) |
| Planes or other props frozen | `_smod` loops are compiled into the map | stand-in motion in the mod (1.6) |
| The rebuilt map looks exactly like the old one | a stale `.glb.gz` is what the server sends | `build-gz.mjs` before looking (2.6 step 7) |
| The user was asked to launch the game three times | each ask covered one export | one session, one checklist (0) |

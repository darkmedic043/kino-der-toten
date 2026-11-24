# BO7 rips (`mods/bo7-rips`, 2026-11-24)

Black Ops 7 guns from the user's own rips, copied to `/mass_drive/RIPS/melon-pipeline` (the rip tool's export plus
its own pipeline). Pilot: the **AK-27** (BO7 codename `kite`, `sat_ar_kite_mp`), end to end: model, arms, 19 clips,
layered shots, reload foley, stats, Pack-a-Punch (Kronos Reaper), Gunsmith attachments. Then the batch (2026-11-24,
user: "clear to port everything over"): 44 guns, ids `bo7_<codename>`. Everything ripped is git-ignored
(`mods/bo7-rips/.gitignore`: `weapons.json models/ animations/ audio/ textures/`); only `mod.js`, `mod.json` and the
build script are committed, and the Rind install manifest takes only those two files (no OWN rule: never add one).
Not to be confused with `mods/bo7-weapons` (BO7-style guns rebuilt in Blender on BO1 skeletons, weapons.md).

## Build

```
systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=2G sg nix-users -c \
  'nix-shell -p "python3.withPackages(ps:[ps.numpy ps.pillow ps.fast-simplification])" --run "python3 -I .tools/build_bo7_rips.py /mass_drive/RIPS/melon-pipeline all"'
```

Writes `mods/bo7-rips/{models,animations,audio,textures}` and `weapons.json` (defs + sound lists). Arguments: codenames
(`kite bear ...`) or `all` (every gun in the generated table); a run adds to the existing weapons.json, so one gun can be
rebuilt alone; `--new` builds only the guns missing from weapons.json, and weapons.json is saved after each gun (a gun that
fails is reported and skipped). `--force` rebuilds the shared attachment models in `models/att/`; `--sounds` rebuilds only the sound lists. About 1 GB of output for all 44.
Run Python with `-I` and keep scripts outside the rips folder (it imports `castlib` from `<pipeline>/scripts`).

## Inputs (in the pipeline dir)

- Models: Cast files in cm, `exports/bo7/models/<name>/<name>_LOD0.cast`. A gun is `sat_vm_<cls>_<gun>_rec` plus
  `_bar`, `_mag`, `_pgrip`, `_stock` (view) or `sat_wm_...` (world). Arms: `viewhands_base_iw8` (a 162-bone full-body
  skeleton with arm meshes only).
- Textures: the pipeline's `out*/data/models.json` maps a material name to `{color, normal, orm}` WebPs in `out*/tex`
  (ORM: R = AO, G = roughness). Resized to 1024 (colour/normal) and 512 (ORM); the world model keeps colour only at 256.
- Clips: `exports/bo7/animations/sat_vm_<cls>_<gun>_<role>.cast` (roles in `ROLES`; `raise_first` etc.).
- Sounds: WAVs under `exports/bo7/sounds/sat/wpn/<cls>/<gun>/` (`plr/fire`, `plr/mech`, `plr/mech/last`, `lfe`); the bank
  `exports/bo7/sndbanks/csv/weapon_sat_<cls>_<gun>_plr.all.csv` (`name,secondary,file`, file relative to `sounds/`
  plus `.wav`) resolves the clips' `AudioOneShot@<alias>` notes.

## How it maps onto the engine

- Units: cm → inches (`CM = 1/2.54`); the AK reads 31.7 in long, so no `worldScale` (BO3 imports need 1/2.2).
- Parts merge into one skinned GLB: each part's root bone joins the receiver bone of the same name.
- Arms: `j_gun` is renamed `tag_weapon` (the engine's attach bone); BO7's own `tag_weapon*` get an `_iw` suffix. Finger
  joints `j_<finger>_<side>_1..4` become `_0.._3`, BO1's names, which `fp-arms.js` needs (it crashed on
  `getWorldPosition of undefined` without them).
- Clips: rotations are local and absolute. Relative translations are rest + offset, so the arms get rest added (the
  engine wants them absolute) and gun parts get rest subtracted (the engine wants offsets from bind). Notes become notifies.
- Hip framing (2026-11-24, user: "models are a bit too far outreached, causing me to see behind the view model"): these
  rigs are framed for IW's viewmodel field of view (FOV 80 on 4:3, about 64° vertical), not BO1's 51°. Drawn at 51° the
  hands sat under the frame, and the old fix, `viewOffset [2,-.5,-7]` (negative z = forward, not back), pushed the gun
  out until the cut ends of the sleeves showed. Now `mod.js` gives every def `viewFov: 64` and `viewOffset [0,0,0]`
  (`VIEW_FOV`, per class `VIEW_OFFSET`; these override the build's `CLS`/`VIEW` values), and its `update` handler sets
  the viewmodel camera to the held gun's `viewFov` (back to the engine's 51° for every other gun, and while a perk bottle,
  an operator weapon, the Rocket Shield or the knuckles are up). Checked on kite, bear, aden, hades, corso, alcor: hip
  and ADS (`scratch/bo7/frame7.js`).
- Sprint: `def.ownSprint` plays the guns' own `walk_to_sprint` / `sprint_loop` / `sprint_to_walk` (animation.js
  `sprintKey`); the motion layer's procedural sprint pose is skipped for them (fp.js; movement.md).
- `reloadTime` = 0.8 × the clip (the mag fills before the clip's tail ends).
- Shell-by-shell guns (a `reload_loop` clip: the M10 Breacher, `corso`) get BO1's segmented reload: `reload_start` /
  `reload_loop` / `reload_end` as `reloadStartAnim` / `reloadAnim` / `reloadEndAnim`, one shell per loop, firing
  interrupts it (rules.js).
- Pump and bolt guns (Single Shot with a `rechamber` clip) play fire + rechamber joined into one clip (`clip(..., then=)`,
  written as `<fire>_rechamber.json`); `fireTime` is at least 0.95 × the joined clip, so the next shot waits for the bolt.

## The gun table (`gun_table()`)

Generated, not hand-written: a codename is a gun when its class is in `CLS`, it is no twin (`TWINS`: the five BO7 guns
already rebuilt in `mods/bo7-weapons`), its receiver model, idle clip and sound bank exist, and the weapon dump calls it
a bullet gun (launchers, the crossbow and exotics are out). Names come from the dump's display names (`NAMES` fills
gaps), PaP names from `UP` (invented, one per gun). Stats: a per-class base (`CLS`: damage, min damage, range, mag
multiplier, spread, PaP damage...) scaled by the gun's fire interval from the dump, `k = clamp((fireTime/ref)^0.7, .75,
1.6)`, so slow guns hit harder. Fire type: `3-Round Burst` when the dump's burst count is 2+, `Full Auto` for AR/SMG/LMG
(and `AUTO_GUNS`), else `Single Shot`. PaP: mag ×1.5, ammo ×1.33, damage per class, headshot +1. `weaponClass` is one of
camo.js's `CLASSES` names (the kite's old 'Assault Rifle' made it a "Special").

## Box and unlocks

`progression.json` has one entry per gun (`scratch/bo7/prog.py`, rerun-safe): rarity and unlock level spread per class
(pistols uncommon from level 2, SMGs 4-32, rifles 6-40 with the AK-27 first, shotguns 9-34, marksman 16-39, LMGs
21-45, snipers 18-48, top ones legendary). Without them every gun would be an always-on common. Entries for guns not
built are skipped (`unlocks()` needs a def), so a checkout without the rips is unchanged.

## Game logo

Weapon pictures show the Black Ops 7 logo: `weapon-levels/games.json` maps the `bo7_` prefix (and the five Blender
rebuilds in `mods/bo7-weapons`) to `games/bo7.webp`, cropped from the image the user sent (git-ignored like the other logos).

## Weapon pictures and the Gunsmith view (fixed 2026-11-24, user: "icons and overall gunsmith icons are busted")

Static views (menu thumbnails, Gunsmith, third person, Mystery Box) pose the gun with its idle clip through
`bo3-weapons/pose.js` `poseIdle` (the defs are `lazyWorld`), which folds the parts the idle frame parks away from the
gun. Two things kept the BO7 spare reload mag (`j_mag2`, about 60 units under the gun) out of that fold, so the
picture framed gun + mag: a tiny gun at the top, the mag as a speck below. (1) The fold grows the gun's body from
`j_gun`/`tag_weapon`/`tag_barrel`, which carry no vertices on these rigs (the receiver hangs on `tag_sling`, the
Velox on `tag_pistol_offset`): with no body bone it now grows from the bones with vertices nearest the root (not the
one with the most: Peacekeeper, REV-46 and Velox spare mags outweigh the receiver). (2) The viewmodels' mag parts
(`b7_base_mag__j_mag2`...) hang on a `j_mag2` that is itself parked: folded parts now collapse onto the root bone's
position, not their parent's. Folded bones carry `userData.poseFolded`, which `syncTagGroups` (mounts.js) leaves alone,
or the Gunsmith re-showed the spare mag next to the real one. Check: `scratch/bo7/thumbrender.mjs` (all 44 as menu
pictures, `WJ=` another weapons.json), `scratch/bo7/smith.mjs` (Gunsmith screenshots).

## Sounds (`mod.js`)

- Each shot is the close shot + a mechanism layer + the low end, mixed by ffmpeg into one ogg (3 variants, plus a last
  shot with the last-round mechanism). `audio.weapon('shot')` is wrapped for these guns: a random variant at
  0.8 × (0.9-1.05) gain and 0.97-1.03 rate; full auto fades the previous shot's tail over 0.1 s.
- `view.onSound` is wrapped: the gun's notes play their foley; every other marker of these guns is swallowed (the
  engine's own lookup would try `end` etc.).
- Buffers decode at setup, not at the first shot.
- Layers come from the gun's bank (`gun_sounds()`), not from folder names, which differ per gun (the hawk keeps its shots
  in `plr/`, the kara has `_shot_single`/`_shot_burst`, some SMGs no `plr/fire`): shot = `wpn_<cls>_<gun>_fire_plr_shot`
  (or the bare `_fire_plr`, or `_shot_single`), mechanism `_mech`, low end `_lfe`, last shot `_last_shot`/`_last` +
  `_last_mech` (else the plain shot + mechanism), hip files only (ADS copies dropped). Until 2026-11-24 five guns (hawk,
  kara, cobra, marmot, orca) had no shot sound and seven no last shot (user: "not all sounds are added").
- `raise_first` markers are only numbered (`fly_plr_<cls>_<gun>_raise_first_01..`) and no bank lists them; the gun's
  folder has one named WAV per marker (`..._raise_first_<action>`), so `RAISE_ORDER` sorts them by where the action falls
  in the motion (start, mvmt, tilt, grab, open, close, end) and hands them out in turn; akimbo/optics/extended-mag/belt
  variants are left out. A guess at the order, but it was 197 silent markers.
- `--sounds` rebuilds only the sound lists (markers read from the built clips, no models): about a minute for all 44.
  4 markers are left without a file (two drops, one swap, one first raise).

## Checked (Sandbox, `scratch/bo7/look.js`, `tune.js`, `tune2.js`)

Box pool and give, idle, fire, reload and reload_empty (30 shots emptied the mag; reload filled it to 30, reserve 270 → 240), ADS centres the irons, 30 shot sounds and 17 foley sounds over an empty
reload, Pack-a-Punch (Kronos Reaper, 45 rounds, the engine's PaP camo since the upgrade keeps the base model), no mod
errors. Renderer peak 1.9-2.0 GB, all Chromium 3.2 GB, flat between steps.

## Attachments (Gunsmith)

BO7 parts are separate models, so the build makes three kinds (`gun_attachments()`):
- **Part swaps** (barrels, mags, grips, stocks): every variant is merged into the view GLB under a head bone
  `b7_<slot>_<kind>` (hidden by `hideTags` until fitted); the stock part sits under `b7_base_<slot>`. A part's own bones
  are `head__bone` and its materials `head~mat`. `def.tagGroups` makes mounts.js `syncTagGroups` hide a slot's stock
  head when a variant of the slot is fitted and follow the head's visibility to its `__` bones; `tagMoves`/`tagRest` move
  the muzzle tag to the fitted barrel's, and `flashFollowsMuzzle` puts the flash there.
- **Mounts** (optics, lasers, muzzles, underbarrels shared between guns): one GLB each in `models/att/`, fitted on the
  receiver's tags (`mounts`).
- **Stat-only** (ammo types, perks of the gun): `statAttachments`.
`attachOrder` sorts the Gunsmith rows (gunsmith.js). The catalogue entries (`b7_*` in `weapon-levels/attachments.json`)
come from `scratch/bo7/catalogue.py <attachments.json> <the gun's gunsmith.json>` (rerun-safe; rerun when a build prints
an id the catalogue lacks).

## Loading and memory (why 44 guns don't load 44 guns)

- **Warm-up**: the engine's `warmWeapons` would load every box gun's view model (about 28 MB each). The mod's
  `warmWeapons` handler drops every BO7 gun not held, keeping one, so the shared programs still compile at load.
- **hd-weapons preload**: that mod loads every box gun's view model while loading the map (so taking one never
  hitches). The 44 BO7 guns plus their PaP copies ran the user's page out of memory at "Loading mods" (JS heap past 2 GB,
  2026-11-24), so `prepare()` marks every def `lazyLoad: true` and hd-weapons leaves lazyLoad box guns out of that
  list; it still uploads a gun when the box rolls it. Sandbox load: 18 s (hd-weapons had been a 19 s setup).
- **Box prefetch**: `mysteryBox.start` is wrapped; while the box spins, the rolled gun's model (and the mounts of the
  player's attachments for it) loads and its textures upload one per frame (`renderer.initTexture`), so taking it costs
  no hitch.
- **World models** are decimated to 10 % (`WORLD_KEEP`, fast-simplification, attributes taken from the nearest merged
  vertex; meshes under 400 faces kept): the AK's 7.8 MB → 0.7 MB. The box loads every world model, so this matters.
- **Quantization** (`quantize_glb`): uint16 indices, uint8 joints and weights, int8 normals (`KHR_mesh_quantization`);
  the AK's view model 41 → 28 MB.

## Camos

BO7 materials sample texture atlases, so a camo through the mesh UVs came out as speckle (PaP) or patches (tiger).
`weapon-levels/camos.json` `wrap.guns` now matches them (`mtl_sat_`, `material_<12 hex>`, the parts' `b7_`), so camos
are projected triplanar in bind-pose gun space like the AW guns (weapon-levels.md), and `wrap.skip` gains
`ammo|_display|_lens|_reticle` so sights and screens stay bare. The textures themselves were audited
(`scratch/bo7/tex-audit.py`): every view material has colour, normal and ORM except `mtl_sat_ar_heron_screen`.

## Prestige camos (2026-11-24, user: "make sure the prestige camos are the ones that are from the game")

Each BO7 gun wears its own three prestige camos from the game (P1, P2, and the Master = BO7's level-250 camo) in place of the
fork's generated `pr1:`/`pr2:`/`pr3:` camos. The ids and rules stay the same (weapon-levels.md Prestige); only the look and the name change.
- **Names**: the fandom wiki refused automated fetches (402), so they come from the codmunity.gg prestige tracker
  (`scratch/bo7/prest/bo7-prestige-camos.tsv`; orders 1 = P1, 2 = P2, 6 = level 250). Typos "Wavelenght" and "Cherised" corrected.
- **Patterns**: the rips have 173 `camo_sat_camo_prestige_NNN_c.webp` with no gun mapping, so each name was matched by eye
  against the game's camo icons (codmunity CDN, scratch only) with a colour-histogram shortlist. The mapping is
  `.tools/bo7-prestige.json` (names + pattern numbers only, committed). Unsure matches: Momiji 153, Shattered 105,
  Burner 151, Rocket Box 189, Moonlit 043, Ravenous 126, and Vivid Wave + Weaponized 115 sharing 014.
- **Plain-colour camos** (Moss, Concrete, Brick, Jasper, Clay, Sand, Plum, Ocean, Leaf, Azalea, Mud, Lavender, Olive, Onyx,
  Sulfur) are the icon's colour with a little grain (`{"flat":"#hex"}`).
- **Colour masks**: a few patterns were ripped as pink/blue masks (Lotus 099, Luna 098) or grey (Hexed 063), or in the wrong colours
  (Overdrive 060, Cyborg 009). An `fx` ffmpeg filter in the json recolours them toward the icon.
- **Missing from the rips**: Abducted (albatross), Shimmer (shepherd), Scallywag (typhon), Arsenal (solomon), Potion (heron).
  They keep the generated animated camo under the game's name (`tex` null).
- **Master animation**: BO7's are layered animated materials. They are approximated with the fork's `|camo-anim` program:
  the pattern drifts and its brightest parts pulse between two colours. The glow mask is the top ~18% of the pattern's own
  brightness (a fixed cut-off gave black masks on dark patterns). The colours come from the json `glow` field, or else the two
  commonest saturated hues among the bright pixels.
- **Build**: `python3 -I .tools/build_bo7_prestige.py` writes `camos/` (163 files, 16 MB) and `prestige.json` (both
  git-ignored: ripped). `mod.js` `prepare` loads `prestige.json` into `PRESTIGE_OWN` (camo.js), so the menu, the game
  and the wiki all see them. To change a match, edit the json, delete the old file under `camos/` (outputs are cached
  by name) and rerun.
- Checked: Gunsmith PRESTIGE tab on the AK-27 (Lotus, Master, drifting) and Echo 12 (Zombies, P1, swatch); Sandbox warm-check clean.

## Look test (full textures, Seven's arms)

The map test shrinks every image to 16 px. `KEEPIMG=webp` keeps images whose blob type matches full size once the PLAY
script sets `window.__keepImg = true` (set it after the load, before giving guns: with it on from the start the load
passed the watchdog). `VW`/`VH` set the viewport, `SET='{"fov":90}'` merges into the settings, `INIT=scratch/bo7/seven-init.js`
plays as Seven (the default character tints arms red):
```
MAP=sandbox KEEPIMG=webp Q=2 PLAY=scratch/bo7/frame7.js INIT=scratch/bo7/seven-init.js DESK=1 RS=1 VW=960 VH=540 \
  SET='{"fov":90}' flock scratch/melon/heavy.lock ~/.local/bin/lowpri node .tools/map-test.mjs
```
Three guns per page: six with full textures passed the watchdog (renderer 2.48 GB); three peak at 2.1-2.2 GB.

## Known limits / next

- Only LOD0 was ripped; world models are decimated copies of it.
- Inspect not looked at yet; left hand stays on the handguard with a foregrip; lasers have no beam.
- Sniper scopes: the guns' default optic is not fitted (irons only) unless the rec carries one.

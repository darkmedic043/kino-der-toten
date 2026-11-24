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
  `sprintKey`); the motion layer's procedural sprint pose is skipped for them (fp.js; movement.md). These clips are
  **additive** in BO7 (2026-11-24, user: "sprint anim is severely broken": the arms snapped to bind and the gun fell
  under the screen): every arm bone and j_gun is keyed at identity and only the clavicles and tag_weapon move, though
  Cast calls the rotations "absolute". The build bakes them onto poses (`clip(base=)`, `sprint_base`): each bone =
  idle frame 0 × the clip's local rotation, positions summed. The loop is a bob around zero over the held sprint pose
  (`sprint_offset_additive`, = walk_to_sprint's last frame = sprint_to_walk's first), so it gets idle × that pose × bob.
  Other BO7 clips named `*_additive` / walk / jog / super sprint work the same way if they are ever used.
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

## Akimbo (2026-11-24, user: "make sure akimbos work as attachments like normal")

The five guns whose Gunsmith lists akimbo (alcor, atlas, orion, timir, bear) get the fork's normal Akimbo attachment:
the build writes a pair def `bo7_<g>_dw` (`akimboOf`, `noBox`, `dualWield`, clip and ammo doubled) and
`weapon-levels/akimbo.js` folds it into the single gun's `def.akimbo`, worn like any other attachment (unlocked by
weapon level; `akimbo` is in `attachOrder`). Each gun has its own trigger (right mouse = left gun), mag (`weapon.magL`)
and clips, as the AW pairs.
- **Clips** (`build_akimbo()`): BO7 has two sets, `sat_vm_<c>_<g>_akimbo_r_*`/`_l_*` (orion, bear) and
  `sat_vm_pi_<g>_r_*`/`_l_*` (alcor, atlas, timir). Each is a whole rig with the other arm hanging off screen, so the R
  clips drop the left arm's bones (`LEFT_ARM` = everything under `j_clavicle_le`) and the L clips keep only the left
  arm, `tag_weapon1` and the left gun's bones (not the hands' own `_le` leg bones, which matched the suffix at first).
  Idle, fire, last shot, reload and empty reload are sided; raise, drop and inspect are the two halves joined into one
  clip (`{side}both_<role>`). No akimbo sprint clips exist, so a pair has `ownSprint` off (mod.js).
- **Left gun**: the same parts rebuilt as `bo7_<g>_left.glb` with every bone suffixed `_le` and `j_gun` renamed
  `j_gun1` (the mixer binds tracks by name, so names must not clash); animation.js hangs it on the hands bone
  `tag_weapon1` (`tag_weapon_left` renamed by `ARM_RENAME`; it sits exactly on the gun in every clip). mounts.js
  `syncTagGroups(gun, def, mirror)` strips `_le` when matching part groups, the weapon-levels mod looks up `_le` bones
  for the left gun's hidden tags, and the muzzle flash falls back to `tag_flash_le`.
- Checked in Sandbox (`scratch/bo7/akimbo.js`, one gun per run; frames in `scratch/bo7/akf/`): orion, bear, alcor.
  Mags split and refill (orion 30/15, bear 60/30, alcor 14/7), each trigger fires its own gun, both reload. Renderer
  1.4 GB for one gun, 2.1 GB for two in one run (load footprint, not growth).

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
- **World models** are decimated to 10 % (`WORLD_KEEP`, fast-simplification; meshes under 400 faces kept): the AK's
  7.8 MB → 0.7 MB. The box loads every world model, so this matters. The mesh is welded first (see World models below).
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

## Winding (fixed 2026-11-24, user: "transparent when you look at them at front")

Cast stores triangles counter-clockwise (every face's winding agrees with its normals: 11,637 of 11,637 on the Coda 9
receiver), but `semodel_to_glb.to_glb` flips each face for SEModel's clockwise CoD winding, so every BO7 model came out inside
out: the near side was culled and the inside of the far side showed through. `build()` now pre-swaps the faces. The models
already built were fixed in place by `scratch/bo7/wind/flip-glbs.mjs` (149 GLBs; it also re-versions the `?v=` md5s in
weapons.json). It is its own inverse, so never run it on a fresh build.

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

## Launchers, crossbow, the last guns and melees (2026-11-24, user: "add in launchers nd crossbow, melee, the missing guns")

- **Clip reuse**: none. The four guns still missing (tasman, mammoth, stoat, terrier) have no clips in the rips and borrow
  none from another gun (no shared `sat_vm_*` prefix, no reference in their dumps); they need exporting from the game.
- **New guns**: eagle (MXR-17), oman (Warden 308), otter (RK-9), serval (Gremlin), fang (AAROW 109), polis (A.R.C. M1),
  crossbow (NX Ravager). Some recs live only in a blueprint folder (`BLUEPRINT`, `model_dir` searches it) or as
  `wpn_<name>` without `_rec` (the AAROW, the Katana). `rec_bones` takes every base part's bones, or muzzle and
  underbarrel tags on the barrel part read as "no tag on this gun" (oman 6 -> 21 mounted parts, eagle 5 -> 20).
  The Warden has only `reload_1..8`: the highest is its reload. eagle has no sprint clips, so `ownSprint` needs
  `sprintLoopAnim` (mod.js).
- **Gremlin** (serval) is always a pair (`pair_only`: no single-gun clips exist), clip 52 = 2 x 26. Its shots are
  named after its old codename (`wpn_sm_orca_fire_plr*`): `SND_NAME` maps codenames to bank names (also the melees).
- **Projectile guns** (`PROJ_CLS` = classes `la` Launcher, `sl` Special; `PROJ` per gun, stock then Pack-a-Punch
  fields): the engine's `projectileSpeed` path (kino-features.js) with BO1's projectile models. AAROW = rocket
  (`projectile_at4`), A.R.C. M1 = grenade (`projectile_m203grenade`, fireTime .5: the dump's .1 was a full-auto rate),
  NX Ravager = bolt that sticks and blows after 1.5 s (`t5_weapon_crossbow_bolt`). Their stock sights are separate
  models (`EXTRA_PARTS`). No Gunsmith kits, no `fire_last_ads` or `reload_empty` clips.
- **Melees** (`MELEES`, `build_melee()`): knife (Tactical Knife), castor (Mace), nashira (Katana), saiph (H311-SAW),
  shockbaton (Flatline MK.II), wasat (Arcblade) as `bo7_me_<g>` defs (`bo7Melee`, `noBox`; mod.js leaves `noBox`
  out of the box pool). Light swing, backhand and heavy are the game's own clips (`meleeAnim`, `backslashAnim`,
  `meleeChargeAnim`). They are melee-slot entries in `mods/melee/melee.json` with `ownClips` (weapons.md Dedicated
  melee), picked in the loadout's melee picker; not in the gun list or the box. Most have no foley in the rips.
- Not done: maru (Executioner's Duet, two blades with separate l_/r_ clips) and the ballistic knife (a projectile
  gun in BO7's files); the wonder weapons and their twins (zeus, atria, carina, nembus, sargas) left out on purpose.

## Gun behaviour (2026-11-24, user: "make sure the guns behave correctly ... the m8a1 should be a 4 round burst, ... echo 12 ... the cbrs requires you to turn the mag every 1/3 of the mag")

- **Bursts**: `fireType` is `<n>-Round Burst` from the dump's burst count (the M8A1's 4), with `burstCount` and
  `burstDelay` (`BURST_DELAY` .12 s). engine.js takes the count from `burstCount` (was hard-wired to 3), the controller's
  trigger feel matches any `Round Burst`. mod.js holds the trigger `fireTime + burstDelay` after a burst's last shot, or
  quick clicks chained bursts.
- **Fire modes the dump leaves empty**: `AUTO_GUNS` (the CODA 9 machine pistol `atlas`, the Akita auto shotgun),
  `SEMI_GUNS` (TR51 Para `emu`: full auto only with its Fallen Angel barrel in the game).
- **Rechamber every few shots** (`RECHAMBER`, mod.js `session.fire` wrapper): the Echo 12 (`husky`, `rechamberEvery 2`:
  a double barrel that pumps after both) and the CBRS-3 (`marmot`, `rechamberParts 3`: the helical mag turns at every
  third). The shot that ends a set holds the trigger for `rechamberTime` and plays `rechamberAnim` (fire_last kick +
  the rechamber clip; `adsRechamberAnim` aimed); counted from the mag, so a reload starts a fresh set. Pump and bolt
  guns keep the rechamber joined onto every fire clip.
- **The CBRS float** (user: "the firing for the cbrs causing the gun to clip and float around"): several fire/raise
  clips (the CBRS-3's, AAROW's, Ryden's, TR51's raise) don't key `j_gun`, which then sat at its bind. `clip()` fills
  only `j_gun` from the idle's first frame (filling every unkeyed bone left the whole rig at its bind; `NOFILL=1` turns
  it off). Joined clips (fire + rechamber) scale the second clip's frames by fps: fire clips are 60 fps, rechambers 30,
  and the rechamber ran at double speed.

## Underbarrels, fire mods, ammo, kits (2026-11-24, user: "make sure all attachments are properly imported, like the echo-12 launcher upgrade, firing mods, underbarrel launchers")

- **Underbarrel launchers** (`b7_ub_gl_std|he|dc|smoke`): only on guns with `sat_vm_<c>_<g>_ubgl_*` clips and a
  `tag_grenade_launcher` (13 ARs; eagle has the clips but no tag: left out, the build prints it). The launcher model
  `sat_vm_ub_gl_01` is merged under head bone `b7_ubgl` (hidden until fitted). The attachment is `underbarrel: "awgl"`,
  the Advanced Warfare alt form (gunsmith.js `energyLauncher`): key 5 switches; `attachAnims[id].alt` carries the
  launcher's own clips (idle/fire/reload/raise/drop/inspect from `ubgl_*`, `to_grenade` = attachInAnim,
  `ubgl_from_grenade` = attachOutAnim), its sounds (`bo7Sounds: bo7_<g>_ubgl`: the vulture's shared ubgl shots + the
  gun's own foley) and the round (`UBGL_KIND`, figures our own; Pack-a-Punch fields in `upgrade`). 1 round, 6 reserve.
  Drill Charge = a bolt that sticks and blows after 1 s; Smoke = its blast is swapped for a smoke cloud
  (`def.smokeLauncher`, bo3-equipment `kino.smokeAt`, co-op relayed).
- **Fire mods** (slot `firemod`, "Fire Mod", gunsmith-view SLOT_ORDER after ammo, no part to show): stat-only from the
  gun's gunsmith slot `firemod` (`b7_firemod_<kind>`: Recoil Springs, Rapid Fire, Lightweight Trigger, Rapid Bolt,
  Quick Charge, Pump Guide Rod, the CBRS-3's Turnkey Rapid Drum = shorter `rechamberTime`).
- **Ammo**: FMJ, High Velocity, Dragon's Breath (`incendiary`: a pellet that hits sets the zombie alight with the
  flamethrower's burn, `kino.flamer.ignite`, 55/s for 3 s), Slug (one pellet, x6 damage, x2.5 range), Short Shells.
- **Kits** (`KITS`): the Echo 12's Backlash Launcher Kit (`b7_kit_backlash`, `def.backlash`): mod.js's fire hook sends
  each shot as one explosive round that sticks and blows 0.15 s later; Pack-a-Punched it bursts on impact. Our own
  figures: the rips have no data for it.
- **Crossbar Grip** (`ub_crossbar_01`) fitted as an underbarrel part on hades, hildr, typhon.
- New `STAT_FIELDS` in gunsmith.js so removing these restores the def.
- Checked in Sandbox (`scratch/bo7/ubgl-test.js`, `ubgl-init.js` plans): Kite with each launcher (switch, fire, reload,
  back; std killed 3, drill 2, smoke 60 impact), Echo 12 Backlash (3 kills), Dragon's Breath (burn ticks after the
  hit), Corso slug (1380 a hit). Renderer peak 1.4-1.7 GB. Spawned zombies rise from 50 under the floor
  (`state 'rising'`): a hitscan test must wait for `state !== 'rising'` or its rays pass over them.

## World models and the HUD icon (fixed 2026-11-24, user: "gun icons are also severely broken", the Velox 5.7 with two slides)

The BO7 HUD dial draws the gun's world model, and so do third person, the Mystery Box and the menu pictures. Three faults:
- **Decimation tore the meshes.** The game splits a vertex at every UV seam and hard edge; decimated as-is, every split was
  an open border, so slides came out with holes, spikes and faces turned the wrong way (the Velox's slide in two pieces,
  drawn one-sided). `simplify()` now welds by position first, but only within one bone's piece: welded across bones (a
  round against its mag), a face spans both and stretches in the pose (the 1911's rounds drew streaks). Each corner of a
  new face takes the normal, UV and weights of the merged original vertex whose own faces lie nearest that face, so
  seams split again on the right side.
- **The idle pose tilted them.** `poseIdle` (bo3-weapons/pose.js) poses a BO3 world model with the viewmodel's idle frame
  because BO3's bind parks parts. A BO7 world model's bind is already the gun at rest (the spare mag inside the gun),
  and the idle frame tilted the 1911's slide. The build writes glTF scene extras `{restPose: true}` (`REST`,
  `quantize_glb(extras)`) on world models; three puts them in the scene's `userData` and `poseIdle` skips such a model.
- **The HUD icon drew the model raw**: no pose, no `hideTags`, so every alternative part showed. `hud-bo7` `gunIcon` now
  calls `poseIdle` and hides `def.hideTags` as `holdWeapon` does.
- **The Katana was empty**: its rec points at `wpn_sat_vm_me_nashira`, an empty folder; `model_dir` now takes a melee
  `_rec` name's folder without the suffix when it exists. Upright models (melees) are laid on their side in the icon.
Check: `scratch/bo7/thumbraw.mjs` (`RAW=1` = bind, no hideTags), `thumbcol.mjs` (one colour per mesh), `icons.js` with `DESK=1`.

## Stock at the hip and the arm's cut end (2026-11-24)

The user's "some guns still show this back part" (M8A1 at the hip) was first read as the stock: BO7's hip poses run the stock
past the cheek, so commit 77ad404 added `def.stockClear` (fp.js: turn the gun down about the support hand at the hip, the least
angle that clears what is within 10 units of the camera) at .14 on all long guns. That pointed most guns up at the hip (user:
"certain guns begin to aim up", the Echo 12), and the blob was still there. **`mod.js` no longer sets `stockClear`**: the mechanism
stays in fp.js, unused (BO7 itself shows the stock in the bottom right corner; reference frames `scratch/bo7/ref/`).
The blob was the **cut end of Venator's upper arm** (operators with their own model, `fpArmsRetarget`): his arm is sized by his
palm and is shorter than BO7's rig arm, whose shoulder sits only about 10 units under the camera, so the elbow half of his upper
arm ended in the bottom left of the frame. Fixed in `fp-arms.js` (characters.md, Upper-arm stretch). The default character hides
it: test arms as Venator (`scratch/bo7/venator-init.js`).

## Special mechanics (2026-11-24)

The user asked for every gun's fire mode, rpm, mag and reload to be checked against BO7's real data. `FIX` in
`build_bo7_rips.py` holds the rates that differ from the dump or the clips (source: CODMunity's launch records):
- `rpm`: Aden 48, Coral 56, Drake 43, Caspian 86, Corso 75, Hades (MK.78) 480 (the dump had Warzone's 652), Hildr 408, Oman 308.
  A bolt or pump clip longer than the shot interval plays faster to fit (`fireClipTime`, animation.js `shoot`).
- `burstDelay`: the pause after a burst, fitted so that n shots plus the pause give the gun's effective rate.
- `rules.js` carries the frame's leftover time into the next shot (`fireOver`/`fireOverL`, at most half a shot), so guns faster than
  the frame rate keep their rpm.

`mod.js` handles:
- **XR-3 Ion** (baltic, `chargeTime .25`, `automatic`): each pull charges, then fires a burst. Held, it fires a burst about every
  0.525 s. Let go mid-charge and the charge starts over. A rising whine plays while it charges.
- **MK.78 Heatshield belt** (`overheat`, kit `b7_mag_heatshield`): every shot adds 1/overheat of the heat. When full, the gun locks
  for `overheatLock` s. It cools 0.25 s after the last shot, at 65% a second. A plain heat bar sits under the crosshair (shown in
  `warmHud`), and a vent hiss plays.
- **Carbon 57 Fabricator Mag** (`fabricator`, kit `b7_mag_fabricator`): no manual reload. A second after the last shot it prints
  reserve rounds back into the magazine, 20 a second.
- **DS20 Mirage** (vulture): its launcher is part of the gun (`BUILTIN_UBGL`, `def.builtInAtts`). It is always fitted, with no unlock
  and no separate launcher model, and the Gunsmith shows it as built in.
- **Akita akimbo** (`AKIMBO_EXTRA`, also the Kogot-7): the dump has no Akimbo unlock for them, but the clips exist, so the pair is
  built anyway. The Akita's pair is belt fed (`beltFed`): every shot feeds a round from the reserve, so it never reloads.

Animation fixes in `animation.js`:
- **Sprint to ADS**: sprint-out is cut short when aiming, after `def.sprintToFire` (default .22 s). Before, the aim and the clip
  drifted apart.

Sight fix in `mounts.js`:
- **Holo sights**: these carry a second body-material surface across the window (BO7 draws it with a holo shader; here it was
  opaque). It is now hidden when it lies inside a lens's box.

Checked: every gun fired a full magazine and reloaded in Sandbox (`scratch/bo7/`).
Left as they are, because they match BO7: the TR51, the Sokol, the A.R.C. M1, the AAROW, and the Gremlin's 52-round magazine.

## Known limits / next

- Only LOD0 was ripped; world models are decimated copies of it.
- Inspect not looked at yet; left hand stays on the handguard with a foregrip; lasers have no beam.
- Sniper scopes: the guns' default optic is not fitted (irons only) unless the rec carries one.

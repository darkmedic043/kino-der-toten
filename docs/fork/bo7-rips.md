# BO7 rips (`mods/bo7-rips`, 2026-11-24)

Black Ops 7 guns from the user's own rips, copied to `/mass_drive/RIPS/melon-pipeline` (the rip tool's export plus
its own pipeline). Pilot: the **AK-27** (BO7 codename `kite`, `sat_ar_kite_mp`), end to end: model, arms, 19 clips,
layered shots, reload foley, stats, Pack-a-Punch (Kronos Reaper). Everything ripped is git-ignored
(`mods/bo7-rips/.gitignore`: `weapons.json models/ animations/ audio/ textures/`); only `mod.js`, `mod.json` and the
build script are committed, and the Rind install manifest takes only those two files (no OWN rule: never add one).
Not to be confused with `mods/bo7-weapons` (BO7-style guns rebuilt in Blender on BO1 skeletons, weapons.md).

## Build

```
systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=2G sg nix-users -c \
  'nix-shell -p "python3.withPackages(ps:[ps.numpy ps.pillow])" --run "python3 -I .tools/build_bo7_rips.py /mass_drive/RIPS/melon-pipeline kite"'
```

Writes `mods/bo7-rips/{models,animations,audio,textures}` and `weapons.json` (defs + sound lists).
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
- Hip framing: the rig's idle holds the gun close with the right hand under the frame (at FOV 80 the hand is on the
  grip as it should be). `def.viewOffset` `[2, -.5, -7]` (right, up, back; gone in ADS) shows both hands. Per gun:
  `view` in `GUN`. Past -8 back, the cut end of the left sleeve shows in the bottom-left corner.
- `reloadTime` = 0.8 × the clip (the mag fills before the clip's tail ends).

## Sounds (`mod.js`)

- Each shot is the close shot + a mechanism layer + the low end, mixed by ffmpeg into one ogg (3 variants, plus a last
  shot with the last-round mechanism). `audio.weapon('shot')` is wrapped for these guns: a random variant at
  0.8 × (0.9-1.05) gain and 0.97-1.03 rate; full auto fades the previous shot's tail over 0.1 s.
- `view.onSound` is wrapped: the gun's notes play their foley; every other marker of these guns is swallowed (the
  engine's own lookup would try `end` etc.).
- Buffers decode at setup, not at the first shot.

## Checked (Sandbox, `scratch/bo7/look.js`, `tune.js`, `tune2.js`)

Box pool and give, idle, fire, reload and reload_empty (30 shots emptied the mag; reload filled it to 30, reserve 270 → 240), ADS centres the irons, 30 shot sounds and 17 foley sounds over an empty
reload, Pack-a-Punch (Kronos Reaper, 45 rounds, the engine's PaP camo since the upgrade keeps the base model), no mod
errors. Renderer peak 1.9-2.0 GB, all Chromium 3.2 GB, flat between steps.

## Known limits / next

- The world model is the full LOD0 (108,604 vertices, 7.8 MB): fine for the pilot (lazy, third person and co-op only), but only LOD0 was ripped, so the batch should decimate it (Blender) or rip the LODs.
- `fly_plr_ar_kite_raise_first_01..07` are not in the bank: the first raise is silent.
- Sprint clips and inspect not looked at yet; no Gunsmith attachments (BO7 parts are separate models: a later step).
- Batch: add entries to `GUN` (class, names, stats, `view`), one gun per class first, then the rest.

# Advanced Warfare weapons (2026-10-23)

User: "add in the cel3, blunderbuss, tac19, bulldog, OHM, xmg, m1 irons, MG turret, MDL, RW1, and the atlas 45". Eleven guns from the BO3 workshop pack 1793220683 (Skye's Advanced Warfare ports, `s1_` assets), exported with Greyhound and built by `.tools/build_bo3_weapons.py` like the other BO3 imports (weapons.md, "Black Ops III assets"). Ids `aw_*`; assets stay git-ignored (`export_game/bo3/`, `mods/bo3-weapons/`).

| Gun | Id | Class | Model | Notes | Box level |
|---|---|---|---|---|---|
| Atlas 45 | `aw_atlas45` | Pistol | `vm_s1_atlas45` | PaP model is the pack's `_rdw_up` | 4 |
| Bulldog | `aw_bulldog` | Shotgun | `vm_s1_bulldog` | semi-auto, 6 rounds | 9 |
| M1 Irons | `aw_m1_irons` | Pistol | `vm_s1_m1_irons` | no `_up` model (PaP keeps the base one); `offset=[-1, 4, 0]` because its idle holds the revolver ~9 units lower than the Atlas 45's (hand off screen at our FOV) | 12 |
| Tac-19 | `aw_tac19` | Shotgun | `vm_s1_tac19` | pump: fire+pump joined, shells one at a time | 14 |
| Atlas 45 Akimbo (now the Atlas 45's **Akimbo** attachment) | `aw_atlas45_dw` | Pistol | `vm_s1_atlas45` + `_ldw` | dual, 24 rounds (PaP Atlas 45 Titans: `_rdw_up` + `_ldw_up`) | 16 |
| Blunderbuss | `aw_blunderbuss` | Shotgun | `vm_s1_blunderbuss` | 4 rounds, 12 pellets | 18 |
| OHM | `aw_ohm` | LMG | `vm_s1_ohm` | key 5 folds it into a pump shotgun (Extras below) | 21 |
| M1 Irons Akimbo (now the M1 Irons' **Akimbo** attachment) | `aw_m1_irons_dw` | Pistol | `vm_s1_m1_irons_rdw` + `_ldw` | dual, 16 rounds, 350 damage (PaP M1 Ironclads); epic | 22 |
| CEL-3 Cauterizer | `aw_cel3` | Shotgun | `vm_s1_cel3` | full auto, own last-shot clips | 25 |
| RW1 | `aw_rw1` | Pistol | `vm_s1_rw1` | single-shot railgun, 2500 damage | 28 |
| MDL | `aw_mdl` | Launcher | `vm_s1_mdl` | China Lake template, 6-round drum, segmented reload | 32 |
| XMG | `aw_xmg` | LMG | `vm_s1_xmg_rdw` + `_ldw` | dual wield, one exo gun per forearm | 36 |
| MG Turret | `aw_sentry` | LMG | `vm_s1_sentry_turret` | `am_s1_sentry_turret_*` clips, 2.5 s deploy as its raise | 45 |

Box levels are the unlock ladder in `mods/progression/progression.json`. Pack-a-Punch uses each gun's own `_up` model (`upModel`/`upWorld` in the build, the upgrade's `model`). Stats are the `aw()` entries in the build script.

## The rest of the pack (2026-11-08)

User: "im gonna import the rest of the AW guns, can you help me". 33 more guns plus 4 akimbo pairs, from the same pack (all of its `s1_` guns except `energy_launcher` and `lever_action`, which have sounds only, no models or clips). Entries are `aw2()`/`aw2_dw()` in the build. `aw2()` picks each role from the clips the gun has:
- `fire` falls back to `ads_fire` (MAHEM and Stinger M7 have no hip fire clip);
- `firstRaise` falls back to `pullout`;
- `reloadEmpty`, `lastShot` and `adsLastShot` are only set when the gun has those clips;
- aim uses `ads_up/down`, or `scope_ads_*` for snipers;
- the SAC3's single-gun clips are `sdw_*`.

A gun with a `vm_s1_<gun>_hip_scope` model wears it on `tag_scope` (`fixed`). That covers Lynx, MORS, SVO, Atlas 20mm and MAHEM; the snipers use the `duplex` scope overlay. Launchers fire their own rocket models (`projectile`). The SN6 has numbered shots (`shot1..3`, `shots=`).

| Gun | Id | Class | Rarity | Box level |
|---|---|---|---|---|
| Classic M1911 (+ Akimbo) | `aw_m1911` | Pistol | uncommon | 3 |
| MP-443 Grach (+ Akimbo) | `aw_mp443` | Pistol | uncommon | 5 |
| MP-40 | `aw_mp40` | SMG | uncommon | 7 |
| Sten | `aw_sten` | SMG | uncommon | 8 |
| M16A4 (burst) | `aw_m16` | Rifle | uncommon | 10 |
| KF5 | `aw_kf5` | SMG | rare | 11 |
| AK-47 | `aw_ak47` | Rifle | rare | 13 |
| STG-44 | `aw_stg44` | Rifle | rare | 15 |
| M1 Garand | `aw_m1garand` | Rifle (semi) | rare | 16 |
| PDW (+ Akimbo) | `aw_pdw` | Pistol (auto) | rare | 17 |
| MP11 | `aw_mp11` | SMG | rare | 19 |
| S-12 | `aw_s12` | Shotgun | rare | 20 |
| MK14 | `aw_mk14` | Rifle (semi) | rare | 22 |
| SN6 | `aw_sn6` | SMG | rare | 23 |
| Bal-27 | `aw_bal27` | Rifle | rare | 24 |
| ASM1 | `aw_asm1` | SMG | rare | 26 |
| AK12 | `aw_ak12` | Rifle | epic | 27 |
| AMR9 | `aw_amr9` | SMG | epic | 29 |
| ARX-160 | `aw_arx160` | Rifle | epic | 30 |
| SAC3 (+ Akimbo) | `aw_sac3` | SMG | epic | 31 |
| HBRa3 | `aw_hbra3` | Rifle | epic | 33 |
| IMR (burst) | `aw_imr` | Rifle | epic | 34 |
| Lynx | `aw_lynx` | Sniper | epic | 35 |
| M160 | `aw_m160` | Rifle (semi) | epic | 37 |
| MAAWS | `aw_maaws` | Launcher | epic | 38 |
| Ameli | `aw_ameli` | LMG | epic | 39 |
| SVO | `aw_svo` | Sniper | epic | 41 |
| Pytaek | `aw_pytaek` | LMG | legendary | 42 |
| Repulsor | `aw_repulsor` | Rifle | legendary | 44 |
| MORS | `aw_mors` | Sniper | legendary | 46 |
| Stinger M7 | `aw_stingerm7` | Launcher | legendary | 47 |
| AE4 | `aw_ae4` | Rifle | legendary | 48 |
| MAHEM | `aw_mahem` | Launcher | legendary | 50 |
| Atlas 20mm | `aw_atlas_20mm` | Sniper | legendary | 50 |

Kits are the shared `aws_*` set (rifles, SMGs, LMGs and the S-12 also get Auto Burst; pistols get Last Word, Concussive and Akimbo; launchers get the MDL's kit). All 34 have an entry in `aw-kits.json` with part mounts placed by the fitter (see Part fitter below); none has unique attachments yet. Every gun is in `.tools/prestige-guns.json` and the camo table was regenerated (adding guns re-spreads the hues within each design).

Not done yet:
- the rifles' underbarrel grenade launcher clips (`to_gl`/`in_gl_*` on the AK12, AK-47, AMR9, HBRa3 and M16A4), which could become an alt like the OHM's;
- the M160's `to_charge` clips;
- the SN6's inspect clip.

**Export.** The 522 missing textures were exported as described below, in four batches. Greyhound was driven with xdotool, which needs `DISPLAY=:1 XAUTHORITY=/run/user/1000/xauth_*` (take the cookie path from BO3's environ). The search box takes a comma list, pasted with xclip. Copy the exports only after Greyhound has finished writing: two MP-443 PaP textures (`i_mp443_loot_op01_skn_01_n`, `i_mp443_loot_op02_skn_01_c`) were copied half-written. They are kept in `scratch/aw2/broken/`, and the MP-443's PaP model is white until they are re-exported. Six shared Pack-a-Punch barrel images were never exported at all (`i_range_fancy_02`, `i_range_fancy_01b`, `i_range_gatling_01`, `i_range_pistol_small_02a`, `i_range_master_muzzle_barrels_01`, `i_caddy_rifle_medium_01`, each `_c/_n/_s`), so those parts are white on the upgraded AMR9, ASM1, Bal-27, Lynx, Mk14, MP-443 and Pytaek; export them with Greyhound and rebuild.

**Tested** on the GPU (Kino, headless, one page per batch under `lowpri`). All 34 guns and the 5 akimbo pairs passed: they raise, fire (bursts for the IMR and M16A4), reload and refill, and Pack-a-Punch to their `_up` models. The akimbo pairs were checked through the real Akimbo attachment. The renderer held at 3.4-4.6 GB, the known baseline, and stayed flat or fell across 17 guns per page. The AW M16 and MP40 are named M16A4 and MP-40 so they don't clash with the BO1 guns in the wiki (`wiki-check` refuses duplicate names) and the box. Reloads: MAAWS and MAHEM take 6.6 s, Ameli 6.9/8.0 s, Pytaek 8.0/8.7 s (the clips' own lengths).

## Exporting

- Find the loaded pack by listing `/proc/<BlackOps3 pid>/fd` for `workshop/content/311210/<id>/` (grepping 150 workshop folders timed out).
- Names: viewmodels `vm_s1_<gun>`, world models `wm_s1_<gun>`, PaP `_up`, dual sets `_ldw`/`_rdw`; clips `am_s1_<gun>_<suffix>` (`idle`, `fire`, `ads_fire`, `reload`, `reload_empty`, `pullout`, `putaway`, `first_raise`, `sprint_in/loop/out`, `ads_up/down`); textures `i_<material>_*` (CEL-3 `i_mp_fusion_shotgun`, Tac-19 `i_uts_19`, XMG `i_exo_weapon`, Atlas 45 `i_titan45`, MG Turret `i_sentry_gun`, OHM `i_lmg_shotgun`, Bulldog `i_maul`).
- **Streamed images**: Greyhound only reads the high-res images streamed from xpaks in BO3's own `zone/` folder, so the pack's images "export" in about 10 ms with no file. Hard-link (a symlink isn't enough) the pack's xpaks into zone while exporting, e.g. `ln <workshop>/zm_mod.xpak "<BO3>/zone/zz_psh_aw_zm_mod.xpak"` (zm_mod held the AW images; core_mod alone didn't), restart Greyhound, export, and **delete the links afterwards** (same filesystem, so they cost no space). Done and removed 2026-10-23.
- **Sounds**: the pack's bank `snd/all/core_mod.all.sabl` (904 sounds). Greyhound Load File with a `Z:\mass_drive\...` path, search `wpn_s1_`, Export All (559 files): `skye_ports/s1_<gun>/{fire,foley}/`, copied to `export_game/bo3/sounds/skye_ports/`. The build reads that folder next to the codolbf one (`SND_ROOTS`, keys `aw/...`).

## Build details

- **Sounds**: fire `wpn_s1_<gun>_shot`; Pack-a-Punched `wpn_s1_<gun>_pap_shot` (`upShots`, played by `mods/bo3-weapons/mod.js`). The pack's notetracks name the sound files directly (`wpn_s1_cel3_open`, no `sndnt#` prefix; `SOUND_NOTES` in the build); numbered variants fall back to `<name>1` (the Tac-19's `shell_in1..4`).
- **Pump and lever guns**: the engine has no rechamber step, so a role can list several clips played back to back (`fire=('fire', 'pump')`; `read_clips` joins the SEAnims, notes included). The Tac-19's fireTime (0.9 s) covers both. Segmented reloads use `reload_in`/`reload_loop`/`reload_out` (Tac-19, MDL).
- **Dual wield (XMG)**: a MODW entry's `left=dict(model, idle, fire, reload)` builds `dualWield`, `leftModel` and `leftAnimations` (`*AnimLeft`), as for BO1's CZ75 DW. The right gun plays the `rdw_*` clips; animation.js lays the left gun's `ldw_*` clips on top (they key only `_le` bones and `tag_weapon_left` → `tag_weapon1`); raise, drop and sprint are the `fdw_*` clips that move both. The left gun's root `tag_weapon_le` is its anchor (dropped from clips like `tag_weapon`). Dual-wield guns don't aim down sights in this engine; shots alternate hands.
- **World models (2026-10-24)**: the pack's `wm_s1_*` exports have no meshes (Greyhound got no streamed surfaces), so every static view (Armory/Loadout thumbnails, Mystery Box, third person) drew nothing. `solid()` in the build falls back to the viewmodel's geometry (`vm_s1_<gun>` written as `wm_s1_<gun>_world.glb`), as the other mod guns do. `poseIdle` (`mods/bo3-weapons/pose.js`) then hides reload-only props that float free of the gun (the M1 Irons' speedloader, the RW1's `tag_bullet`, the Blunderbuss's powder horn, shot and wad): a bone is kept when its vertices touch the gun, directly or through other parts, starting from the root/barrel bones (4 units), or its joint is within 12 units of its parent's vertices (sling segments); the rest fold onto their parent at scale ~0 (`model.userData.looseParts`). Of the other BO3 guns only the SPAS-12's `j_bayonet_extend` is caught (no visible change). The menu thumbnail (`home.js` `thumb()`) now fits the camera to the turned box's 8 corners, so a long barrel turned toward the camera isn't cut off.
- **Tested** 2026-10-23 on the GPU (Kino, headless Chromium): all 11 raise, fire at their rates, reload and refill; the XMG draws both guns (and both `_up` models after PaP), the Atlas 45 swaps to its Titan model, guns without an `_up` model (M1 Irons, MG Turret) wear the PaP camo.
## Extras (2026-10-23, second pass)

User: "build the other stuff please" (everything that was listed as not built).

- **Akimbo pistols** (`aw_atlas45_dw`, `aw_m1_irons_dw`): MODW entries with `left=` like the XMG, built on the `rdw_*`/`ldw_*`/`fdw_*` clips (`DW_ROLES`). `aw()` takes `model=`/`world=` overrides: the Atlas 45's right gun is the plain `vm_s1_atlas45` (`upModel`/`upWorld` the `_rdw_up` pair), and a left `out=` renames the model's bones with the `_le` suffix (`SEM.read_semodel`) when the pack has no separate left export. The M1 Irons has no `rdw_reload_empty` (plain reload is used). **Since 2026-10-23 they are no longer guns of their own**: the build marks them `akimboOf` + `noBox` (`AKIMBO_OF`) and puts `akimbo` in the single guns' `statAttachments`; at load weapon-levels folds each pair into its single gun's Akimbo attachment (`weapon-levels.md`, Akimbo), and `bo3-weapons/mod.js` merges the pair's dual-wield foley notes (`dw_mag_in`, `ldw_pullout`...) into the single gun's sound entry. Their progression entries are gone; their prestige camo rows stay in the table (removing them would re-spread every gun's hues). The Atlas Akimbo's fire clips are softened and sped up (`dualFireKick:.5`, `dualFireTime:.3`, 2026-10-26, user: guns "look floaty"; weapon-levels.md, Akimbo).
- **OHM shotgun mode**: `alt=dict(name, tpl, into, out, stats, roles)` in the entry builds `def.attachment` with `altForm: true` on the same model: its own clip set (`shotty_*`), 6 shells, 8 pellets, semi-auto (PaP 9 shells, 2.2x damage; `up.attachment` is written explicitly). The engine's attachment toggle (key 5) swaps the def and keeps separate ammo; `mods/bo3-weapons/aw.js` sets `view.raiseWith` so the change plays `attachInAnim` (`to_shotty`, on the shotgun rig) or `attachOutAnim` (`out_shotty`, on the LMG rig) in place of the raise. `raiseWith` is a one-off override read at the end of `ViewWeapon.equip` (animation.js). Camo follows the weapon id, so the shotgun form keeps it.
- **XMG lockdown** (`def.lockdown`, clips `lockdownInAnim`/`lockdownOutAnim` from `fdw_to_lockdown`/`fdw_out_lockdown`): aiming folds both guns into the braced pose. The pack has no lockdown idle or fire, so aw.js makes both clips additive (`makeClipAdditive`, both referenced to the fold-in's first frame), holds them paused, and scrubs them by `lock` (0..1 over each clip's length; the Out clip plays while unlocking). Locked down you are rooted (user request, 2026-10-23; was 35% walk speed): while aim is held and `lock` > 0, `moveSpeed`/`sprintSpeed` read 0 (chained getters) and an outermost `player.update` wrap (added on the first frame, outside the movement mod's, whose mantle and slide read the input first) clears move, sprint and jump. Letting go of aim frees you at once while the fold-out plays. `kino.aw.lock` / `kino.aw.frozen` read it. engine.js: `aiming()` = ADS held and the gun isn't dual wield unless it has `lockdown` (camera FOV and view aim use it); `view.shoot` still gets `ads:false` for dual guns since the `ads_fire` clips are right-only.
- **RW1 pierces** (2026-10-24, user request): its slug goes through every zombie in line up to the wall, full damage each (`pierce=99` set on `aw_rw1` and its upgrade in bo3-weapons `prepare`, since weapons.json is build output). Generic: engine.js `def.pierce` = how many more zombies a bullet goes on through (`enemies.rayHit(ray,far,skip)` walks on past the ones hit; the `shot` event and `map.onShot` then get the wall distance). Each pierced hit is a `bullet` hurt, so Arc Rail and Concussive Slugs fire on every one. Tested: four zombies lined up, one shot hit every zombie still on the line for 8750 each.
- **XMG feel (2026-10-24, user: "moving up when there is no recoil, along with the lockdown mode being the same")**: firing climbed both ways. (1) The guns: movement/fp.js gives each dual gun its own soft kick spring, and at 15 shots a second the per-shot kicks piled up, lifting both barrels about 10% of the screen height for as long as the trigger was held (0.25 in lockdown). Fast automatic dual guns now scale each kick by (per-gun interval / 0.35 s)², and the XMG's lockdown takes 70% off on top (`kino.aw.lock`): the barrels now judder about 0.02-0.03 in place (the fire clips' own motion) instead. (2) The camera: the engine's BO1-style kick tilts the camera up 0.86 degrees a shot (0.46 aiming) and never brings it back, about 13 degrees a second on the XMG. New def fields `recoilScale`/`adsRecoilScale` (engine.js `shoot`); the XMG gets .35 and .08 (bo3-weapons `prepare`): 1.5 s of fire now climbs 7.3 degrees at the hip (was 20.7) and 1 degree locked down (was 12). (3) Base lockdown had no fire-rate boost (only Overclock Servos did): fully locked down the XMG now fires 25% faster, Overclock x1.4 on top (aw.js `session.fire` wrap). The rate is quantised to whole frames (`fireLeft` doesn't carry over), so the gain shows a bit smaller at low frame rates.
- **XMG lockdown aim** (2026-11-01, user: "still has them aiming abit high"): the fold-in clip ends with both barrels 13.5 degrees above the view. `movement/fp.js` takes .24 rad of pitch off and lifts the guns 10 units, scaled by `kino.aw.lock`: both `tag_flash` directions now read 0-0.3 degrees, muzzles 13 under the crosshair and 18 either side. Pitch alone sank the guns out of the frame.
- **XMG fires both guns** (2026-10-24): dual guns now fire one gun per trigger with a mag each (weapon-levels.md, Akimbo), but the XMG's aim button is lockdown, so its fire button fires both at once (`firesBoth` in rules.js; each gun's cooldown is fireTime x2, same total rate) and the HUD shows both halves of the 100-round mag.
- **Speed getter fix**: `perks-plus` used to replace `moveSpeed`/`sprintSpeed` with a plain `base *` getter, dropping every earlier mod's getter in the chain (bo3-weapons and bo7-weapons load before it). That silently killed the Siren's Soma-81 and the Havoc's dash bonuses as well as the lockdown slow. It now chains like the others. Measured then: XMG 190 -> 66.5 locked, 190 after.
- **Attachments**: the AW guns use the Gunsmith's generic track; two get models. `reddot` on the OHM (`tag_sight_on`, offset `[-4,0,0]`), RW1 and Tac-19 (no sight tag: `tag_weapon`, offsets `[8,0,10.5]` and `[8,0,15.5]`; the Tac-19's receiver top is z 15.1 and its rear sight 15.5, so at z 12 the dot sat inside it). The part is BO3's `reflex_vmgun` (the pack has no red dot); `mounts.js` now takes an `offset` added after the root-bone inverse. `grip` on the Tac-19: BO3's Man-O-War foregrip (`attach_t7_ar_talon_foregrip_01_view`) on `tag_foregrip` (the gun has the tag but no grip geometry). Fingers end about 4 units from it.
- **Attachment clip sets** (`def.attachAnims[attId]` = `{animations, ...times}`): `attachClips()` in gunsmith.js merges them when the attachment is equipped (the reddot's `pre_reddot_ads_up/down`, the Tac-19's whole `grip_*` set with fire+pump joined). `STAT_FIELDS` now snapshots `animations` and the raise/drop/sprint/reload times so they restore. The weapon-levels equip wrapper drops the cached rig (`view.clipSet`) when the clip set changes. Measured with the dot on: the lens lands within 0.008 of screen centre at full aim on all three guns.
- **Prestige camos**: the 13 AW ids are appended to `.tools/prestige-guns.json` (classes: CEL-3, Blunderbuss, Tac-19, Bulldog shotgun; OHM, XMG, MG Turret lmg; MDL launcher; the pistols and both akimbos pistol), `camo-table.js` regenerated (74 guns, 222 names).
- **Tested** on the GPU: both akimbo pairs and the Titans draw in both hands and fire; the OHM swaps both ways with its fold clips and fires 8 pellets; the PaP OHM becomes "Ohm Overload · Shotgun" (9 shells, 330 damage); lockdown ramps in about 1 s and back; grip and red dots as above. `npm test` passes.
- Not done: lockdown has no fire clip of its own (the hip fire plays under the braced layer).

## Per-gun kits and attachment models (2026-11-01)

Every AW gun now has its own kit, and most attachments have a real model. `mods/bo3-weapons/aw-kits.json` holds, per gun, `kit` (replaces `statAttachments`) and `mounts`; `aw-kits.js` merges it in `prepare` after `weapons.json`, so kits change without rebuilding the guns. Built mounts from `weapons.json` (red dots, grips) survive when listed in the kit. The older lists in `.tools/build_bo3_weapons.py` (`AW_CUSTOM`) are overridden. Attachments dropped from a gun's kit stop applying on old saves (`equipped()` filters them).

**Models:** `.tools/build_aw_attachments.py` (Blender, about 5 min: `PATH=$HOME/.local/bin:$PATH blender -b -P .tools/build_aw_attachments.py` from the repo root) writes `mods/bo3-weapons/parts/aw_attachments.glb`, 41 nodes `part_*` sharing one baked material plus emissive ones (`aw_attachments_emit_*`, `aw_attachments_glass`). Built by us, so it's in the Rind `OWN` list and in git. The script's `export(..., yup=False, spread=120)` keeps Blender axes = gun space and spreads parts apart for the AO bake. Bump the `?v=` in `aw-kits.json` after a rebuild. Material names contain `attachments`, so camos skip them, and avoid `glow|_ret|lens` (glow.js, scopes).

**Mounts** (`weapon-levels/mounts.js`): a mount is `{part, tag, at, rot?, scale?}`. `at` is always gun space (`tag_weapon` at rest: x forward, y left, z up; first person shows the left side and top), whichever bone carries it, so all of a gun's coordinates read the same; `restSpace` converts through the skeleton's inverse binds. Pick the bone by what the part touches: anything on a part that moves on reload must ride that bone (M1 `hinge`, RW1 `tag_barrel`, top rear `tag_loot21`, Atlas `slide`, Bulldog stock `butt1_jnt`, Bulldog barrel `bullet1_jnt`, OHM body parts `tag_range`). Nothing goes on the CEL-3's `jnt_barrel_rot` unless it is 3-fold symmetric about the axis: that bone is the whole front (x 24-50) and turns 120 degrees on every shot, so the lasers and foregrip ride the rear section (`jnt_reload_rot`, `tag_weapon`); the XMG's barrels (`tag_range`) recoil 4.3, so its lasers ride `panel2`. `.tmp-aw`-style fit check: for each mount, the nearest gun vertices' dominant bone must match. Off-hand guns (Atlas and M1 akimbo, the XMG's left arm gun) mount the same parts with y and x rotation mirrored (`{mirror:true}`), and bones looked up with the left models' numbering. Third-person world models don't show parts.

**Off-hand guns:** the left model's bones end in `_le` (`tag_weapon_le`, `tag_clip_le`, `slide_le`; other imported guns number them one up), and `mountParts` tries each name, `{mirror:true}` flips y and the x rotation so a side part is on the outside of both guns. Equip can fire twice while the model loads, so each call takes a run number and an older call stops at its next await; without it upgraded guns carried every part twice (two beams). The OHM's second form shares `mounts` and `mounted` with the first (`attachClips`), or it drops the parts on the next equip.

**Pick the bone in the idle pose:** `at` is converted through the rest pose, so a bone the idle clip moves carries its part off. The OHM's `tag_clip` sits 33 above its rest place in idle and the MDL's `tag_shell` 77 back (their bind poses park the belt and the shell): the OHM's drum rides `magazine`, the MDL's Long Tube `tag_weapon`. Check a new mount by comparing the bone's live position to its rest position with the gun idling. Rest-pose renders also lie about those parts of the gun itself (the OHM's belt hangs in a straight line below the gun there).

**Fit check (2026-11-01, after the first pass looked clean and wasn't):** ortho renders with normal materials let floating parts through. Measure instead: the idle-pose triangles of the gun in gun space, sections at the muzzle, then each mounted part dumped into the same space and drawn as a blueprint over the gun (5 views), plus a contact test (every piece of a part must be within .3 of the gun or of a held piece; a long triangle needs extra samples or the test calls it loose). The rules that came out of it: a muzzle part starts with a collar overlapping the real barrel (x < 0), scaled by barrel radius / .96, origin at the measured tip, never past it; part shapes follow the measured section (the Overcharge sleeve fits the RW1's rectangular head, straps are closed loops of the stock's section); a multi-barrel muzzle gets a part for each barrel (XMG `sil_xmg`, `brake_xmg`, CEL-3 prism plate with three holes), its origin on the cluster's axis; add-ons sit on what they would really connect to (the belt box takes the end of the turret's own feed tube, x 32, y 17, z -9).

**Aim line check:** ADS puts the camera on the gun's sight line (RW1: y 0, z 12.21 in gun space), and the gun's own top reaches almost that high, so a part on top of a pistol sits in the sight. Project every mounted triangle through `viewCamera` at full ADS and test whether one covers the screen centre (triangles behind the camera give false hits). The first RW1 Rail Capacitor did, a block on the top: it's now a pod on each flank, top at z 10.75. Everything else clears the sight; the M1 hunter barrel sits behind the gun's own front sight.

**Part fitter (2026-11-08, `.tools/aw-fit/`):** places the shared parts on a gun by measurement instead of by hand; it did all 34 guns of the second pack. `node .tools/aw-fit/fit.mjs aw_x,aw_y --pap` (under `flock scratch/melon/heavy.lock ~/.local/bin/lowpri`) gives each gun on Kino, injects `page.js` (`window.fit`), and writes `scratch/aw2/fit/out/<id>.json` plus renders: whole-gun ortho views, `zoom-<id>.jpg` (each mount close up from 4 sides), hip, ADS and `-up-` views of the Pack-a-Punched model. `python3 .tools/aw-fit/merge.py <ids>` writes the results into `aw-kits.json` (replacing those guns' entries). Per-gun overrides go in `.tools/aw-fit/opts.json`: `veto` (mounts left out, the attachment stays stat-only), `retag` (bone for a mount), `mounts` (manual), `fixed`, `drop`, and the measurement knobs in `propose()`.
- Measurement: the idle-pose skinned triangles in `tag_weapon`'s live frame, minus collapsed (hidden) triangles and the arms; only the contiguous x-run around 0 counts (by triangle span), which drops spare mags the pose parks behind the gun.
- Muzzle: tip = the front-most x near the flash axis (the Bal-27's `tag_flash` is 20 past its barrel, so the axis search starts at min(flash, gun end) - 20); scale = radius / .96 (pistols at most .85, the silencer's length at most 1.3).
- Handguard front: going back from the tip, the first slice wider than radius + .7. Side laser 9.6 behind that with `rot [90,0,0]` on the outermost side within 1.5 of the band; pistols take it under the frame 9.3 behind the tip, no rotation. Foregrip 6 behind the handguard front on the lowest point within 1.72 of the centreline; stabilizer 9 ahead of the stock's end on its top, widened when the stock is wider than 2.55.
- Bone: the nearest dominant bone, then `at` converted to rest space (so the part follows a slide or stock that moves).
- Checks: contact (every piece within .3 of the gun, or inside a held piece's box + .3; a part that floats up to 3 away moves toward the gun by its gap, 3 tries), the ADS aim line (a blocking part named `""` is a sniper's own fixed scope), and the same parts on the Pack-a-Punched model.
- **`mount.up`**: several Pack-a-Punched models have a shorter barrel (IMR, Lynx, Mk14, Pytaek: the base gun's muzzle part floated up to 30 in front), or their own stock. The fitter refits whatever fails there and merge writes `up:{at,scale,...}` (merged over the mount for the upgrade def by `aw-kits.js`), or `up:false` for no part on the upgraded gun. Bones missing from an upgraded model (`tag_damage`, `tag_range`, `butt0_jnt`, `tag_mobility` on some) also drop the part there: those mounts were retagged to `tag_weapon`.
- Vetoed (stat-only) after review: the foregrips and tracker above, and the stabilizer on the AMR9, ASM1, MP11 and Pytaek (floats on the upgraded stock), ARX-160 (same, even on `tag_weapon`), SN6 (in the ADS sight) and MP-40 (floats over the wire stock). The launchers keep only the stabilizer (the tracker found no rail), the SAC-3 and pistols have 3 mounts, the Stinger 2.
- **Check the bones in the merged kit** (`grep -o '"tag":"[^"]*"' aw-kits.json | sort | uniq -c`): the contact test counts a sling or a magazine as gun, so a foregrip or laser can come out hanging on the strap (`strap0`/`strap2`) or under the mag (`magazine0_jnt`, `tag_clip`). Those were vetoed (Sten, STG-44, MP-40 foregrips, HBRa3 tracker); the Bal-27's tracker (`jnt_slide`) and stabilizer (`tag_clip`) were retagged to `tag_weapon`.
- Memory: one page per batch, renderer 3.2-4.5 GB across 17 guns, flat.

**MG Turret spin (`turret()` in aw.js):** the pack has no spin clip, so `tag_barrel_spin` (child of `tag_weapon`, on the axis at z -6.11, the barrels' whole mesh is skinned to it) turns from the `update` event, which runs after the mixer. `rev` 0..1 rises in .7 s while fire or aim is held (not sprinting or reloading), falls in 1.4 s, and `host.holdFire` (chained with flag `.aw`) blocks the trigger under .85, about .6 s. Full speed is one barrel per shot, 5.5 turns a second (more with Spin-Up Governor); a frame is capped at 50 degrees so the three-way symmetry can't read as turning backwards. The motor whine is synthesised (two oscillators through a low-pass; no sound for it in the pack); each frame re-arms a fall to silence, so a pause can't leave it humming. First person only: the third-person world model doesn't spin.

**Glow:** keep the parts' emission low (1.6-2.5, lens 5): the bloom pass works on anything over 1, and at 24 the RW1's rails threw flares across the screen. Emission lives in the build, so a change means a rebuild and a `?v=` bump in `aw-kits.json`.

**Lasers:** a part with an `*emit_beam_<colour>` material gets a beam from that emitter (two crossed additive strips, 185 long because the view camera ends at 200). `aw.js lasers()` steers beams at the crosshair each frame (`aimLasers`: when the gun points far away, on a reload or sprint, the beam follows the barrel), dims them to .35 aiming, and puts a dot sprite where the crosshair lands (a cheap torso-sphere test instead of `enemies.rayHit`, which poses every head). Tracker = red, Laser Sight = green. The beam material is in `host.warmObjects`.

| Gun | Unique to it |
|---|---|
| Atlas 45 | Titan Slide (35% damage, 20% slower), Kill Chain (chained kills, up to +50% fire rate) |
| M1 Irons | Speedloader Rig, Hunter Barrel, Fan the Hammer (auto), Trick Shot (headshots bounce) |
| RW1 | Recall Coil (3+ through refunds the round), Overcharge Rings (first hit bursts for 50%), Arc Rail, Rail Capacitor |
| Blunderbuss | Double Lock, Bayonet (melee x3), Bell Flare, Ember Load, Chain Shot (pierce 2), Cartridge Box, Grapeshot |
| Tac-19 | Breacher Choke, Side Saddle, Slam Fire (auto) |
| Bulldog | Duckbill, Twin Feed (2 rounds, 80% damage), Shell Strip, Bull Rush (first shot after a sprint x2) |
| OHM | Capacitor Drum, Hot-Swap, Bipod (aim and stand still: 30% faster, half climb), Cross-Feed (kills feed the other form) |
| CEL-3 | Plasma Overdrive fins, Meltdown (fire ramps damage to +50% in 3 s), Prism Focus (first hit splits for 35%) |
| MDL | Grenade Bandolier, Rotary Drive, Long Tube, Cluster Rounds, Incendiary Payload |
| XMG | Bulwark Plating, Overclock Servos, Seismic Brace, Shock Anchor (full lockdown throws a shockwave, 6 s) |
| MG Turret | Ammo Box (belt +100), Gun Shield (40% less damage while firing), Spin-Up Governor (+60% fire held, on top of the barrels' own spin-up), Cooling Jacket. No underbarrel grip, stock or muzzle |

Shared and stats live in `attachments.json`; `gunsmith.js` gained the stats `pelletMul`, `pelletSpreadMul`, `pierce`, `adsRecoilScale`, `blastMul`, `projectileMul`. Effects are in `aw.js` (its header lists them): `session.fire` wrap for per-shot triggers, `enemies.hurt` wrap for hits (`shotZ` = zombies this shot has been through, so first hit and pierce counts work), `spool` = trigger-held 0..1.

## Custom attachments (2026-10-23)

Gunsmith attachments of our own (no model, `tags: []`) at the end of `weapon-levels/attachments.json`: `aws_*` are a shared AW kit, `aw_*` belong to one or a few guns. (Kits now come from `aw-kits.json`, section above.) `AW_CUSTOM` in `.tools/build_bo3_weapons.py` gives each gun its list (added to `statAttachments` after `extmag`; unlocked in catalogue order on each gun's track, levels 2-28). Effects that aren't plain stats live in `mods/bo3-weapons/aw.js`, which reads the equipped list from the base def (`data.weapons[id].attachments`; the OHM's shotgun form has none of its own).

**Why the count looked small:** `gunsmith.js available()` pads every gun with `generic` catalogue entries up to `padTo` (8), so the first 7 customs only replaced pads and every AW gun still showed 8. The kits push them past the pad: XMG 13, OHM 13, Sentry 12, CEL-3 12, Blunderbuss 13, Tac-19 15 (its red dot and grip mounts), Bulldog 13, RW1 10 (one-round gun: mag-slot entries drop), MDL 8, Atlas 45 / M1 Irons and their akimbos 11 (measured with `available()` on the GPU page).

Shared kit (`AW_KIT` on every gun but the MDL; `AW_LONG` adds Foregrip and Stabilizer to all but the pistols and RW1):

| Id | Name | Slot | Effect |
|---|---|---|---|
| `aws_brake` | Muzzle Brake | muzzle | range x1.15, hip spread x0.9 |
| `aws_silencer` | Silencer | muzzle | suppressed, range x0.9 |
| `aws_rifling` | Advanced Rifling | barrel | range x1.3, damage x1.05 |
| `aws_rapid` | Rapid Fire | ammo | fire rate x1.25, hip spread x1.1 |
| `aws_tracker` | Tracker | laser | hits tag the zombie for 4 s (`z.awMark`, a pulsing red glow sprite above the head); tagged zombies take x1.2 from the local player's `enemies.hurt` calls (burn ticks and arcs go through the inner hurt, so not those) |
| `aws_scavenger` | Scavenger Feed | mag | a kill puts 2 rounds back in the mag (up to the clip, not from the reserve) |
| `aws_quickdraw` | Quickdraw | grip | reload x0.85 |
| `aws_foregrip` | Foregrip | under | hip spread x0.7 |
| `aws_stabilizer` | Stabilizer | stock | hip spread x0.8 |
| `aws_autoburst` | Auto Burst | ammo | makes a semi-auto gun automatic (`automatic`, `fireType`), fire rate x0.9 (Blunderbuss, Tac-19, Bulldog, the pistols) |

Per-gun customs:

| Id | Name | Slot | Guns | Effect |
|---|---|---|---|---|
| `aw_bulwark` | Bulwark Plating | stock | XMG | locked down: damage taken x (1 - 0.6 lock) via `beforeDamage`; an amber screen edge (DOM div) fades in with `lock` |
| `aw_overclock` | Overclock Servos | ammo | XMG | fully locked: `session.fire` wrap divides `fireLeft` by 1.4 (40% faster) |
| `aw_seismic` | Seismic Brace | under | XMG | locked down (`braced()`): hits stagger like Concussive Slugs |
| `aw_hotswap` | Hot-Swap Loader | ammo | OHM | after a form swap the new form's mag is topped up from its reserve |
| `aw_capacitor` | Capacitor Drum | mag | OHM | clip x1.667, reload x1.25 |
| `aw_arcrail` | Arc Rail | barrel | RW1 | each bullet hit arcs to the 2 nearest zombies within 260 (line of sight) for half the hit, cause `explosion` (so it doesn't chain) |
| `aw_railcap` | Rail Capacitor | stock | RW1 | damage x1.3, fire rate x0.8 |
| `aw_ignition` | Ignition Coil | ammo | CEL-3, Blunderbuss, Sentry, Tac-19, Bulldog | hits burn for 40% of the hit per second for 3 s (ticks every 0.5 s, cause `flame`; refreshes, keeps the highest rate) with rising embers |
| `aw_incendiary` | Incendiary Payload | ammo | MDL | the same burn at 30% for the MDL's blasts |
| `aw_overdrive` | Plasma Overdrive | barrel | CEL-3 | fire rate x1.25, hip spread x1.2 |
| `aw_grapeshot` | Grapeshot | barrel | Blunderbuss | damage x1.2, range x0.75 |
| `aw_concussive` | Concussive Slugs | ammo | Tac-19, Bulldog, Sentry, RW1, MDL, pistols | hits halve `z.speed` and the rig's mixer timeScale for 2.5 s (ratio-based, so it stacks safely with the XM325's chill) |
| `aw_lastword` | Last Word | ammo | Atlas 45 and M1 Irons (single or Akimbo) | a hit while the mag reads 0 (the last round) deals triple, with a gold spark burst |

The hit effects wrap `enemies.hurt` for the gun's hits: cause `bullet`, or cause `explosion` while the MDL is held and within 4 s of it firing (its grenades go through `features.shoot`, which emits no `shot` event, so aw.js records the time from a `host.fireHooks` entry that returns false). Partners' hits (`host.remoteDamage`) are skipped. FX: arcs are additive lines, embers and tracker tags additive sprites with a soft radial canvas texture (one of each in `host.warmObjects`). Tested on the GPU (2026-10-23): locked XMG with W + Space held moves 0 units, speed 0, a 100 damage hit becomes 40, `fireLeft` 0.065 -> 0.0464, all back after release; Arc Rail 50 to each neighbour; Ignition 40/s for 3 s; Concussive 55 -> 27.5 -> 55; Last Word 300 on the last round; Hot-Swap back to the LMG with 5 in the mag -> 60 (reserve 360 -> 305); Tracker 100 then 120, tag gone after 4.5 s; Scavenger kill with 3 in the mag -> 5; Seismic dazes only once `lock` is 1; Incendiary off before the MDL fires, then 30/s; Auto Burst makes the Tac-19 automatic.
- **Camo on both guns** (2026-11-02): weapon-levels applies the camo to `view.leftGun` too (the XMG's off-hand gun stayed plain).

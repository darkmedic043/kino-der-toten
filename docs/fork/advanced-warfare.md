# Advanced Warfare weapons (2026-10-23)

User: "add in the cel3, blunderbuss, tac19, bulldog, OHM, xmg, m1 irons, MG turret, MDL, RW1, and the atlas 45". Eleven guns from the BO3 workshop pack 1793220683 (Skye's Advanced Warfare ports, `s1_` assets), exported with Greyhound and built by `.tools/build_bo3_weapons.py` like the other BO3 imports (weapons.md, "Black Ops III assets"). Ids `aw_*`; assets stay git-ignored (`export_game/bo3/`, `mods/bo3-weapons/`).

| Gun | Id | Class | Model | Notes | Box level |
|---|---|---|---|---|---|
| Atlas 45 | `aw_atlas45` | Pistol | `vm_s1_atlas45` | PaP model is the pack's `_rdw_up` | 4 |
| Bulldog | `aw_bulldog` | Shotgun | `vm_s1_bulldog` | semi-auto, 6 rounds | 9 |
| M1 Irons | `aw_m1_irons` | Pistol | `vm_s1_m1_irons` | no `_up` model (PaP keeps the base one); `offset=[-1, 4, 0]` because its idle holds the revolver ~9 units lower than the Atlas 45's (hand off screen at our FOV) | 12 |
| Tac-19 | `aw_tac19` | Shotgun | `vm_s1_tac19` | pump: fire+pump joined, shells one at a time | 14 |
| Atlas 45 Akimbo | `aw_atlas45_dw` | Pistol | `vm_s1_atlas45` + `_ldw` | dual, 24 rounds (PaP Atlas 45 Titans: `_rdw_up` + `_ldw_up`) | 16 |
| Blunderbuss | `aw_blunderbuss` | Shotgun | `vm_s1_blunderbuss` | 4 rounds, 12 pellets | 18 |
| OHM | `aw_ohm` | LMG | `vm_s1_ohm` | key 5 folds it into a pump shotgun (Extras below) | 21 |
| M1 Irons Akimbo | `aw_m1_irons_dw` | Pistol | `vm_s1_m1_irons_rdw` + `_ldw` | dual, 16 rounds, 350 damage (PaP M1 Ironclads); epic | 22 |
| CEL-3 Cauterizer | `aw_cel3` | Shotgun | `vm_s1_cel3` | full auto, own last-shot clips | 25 |
| RW1 | `aw_rw1` | Pistol | `vm_s1_rw1` | single-shot railgun, 2500 damage | 28 |
| MDL | `aw_mdl` | Launcher | `vm_s1_mdl` | China Lake template, 6-round drum, segmented reload | 32 |
| XMG | `aw_xmg` | LMG | `vm_s1_xmg_rdw` + `_ldw` | dual wield, one exo gun per forearm | 36 |
| MG Turret | `aw_sentry` | LMG | `vm_s1_sentry_turret` | `am_s1_sentry_turret_*` clips, 2.5 s deploy as its raise | 45 |

Box levels are the unlock ladder in `mods/progression/progression.json`. Pack-a-Punch uses each gun's own `_up` model (`upModel`/`upWorld` in the build, the upgrade's `model`). Stats are the `aw()` entries in the build script.

## Exporting

- Find the loaded pack by listing `/proc/<BlackOps3 pid>/fd` for `workshop/content/311210/<id>/` (grepping 150 workshop folders timed out).
- Names: viewmodels `vm_s1_<gun>`, world models `wm_s1_<gun>`, PaP `_up`, dual sets `_ldw`/`_rdw`; clips `am_s1_<gun>_<suffix>` (`idle`, `fire`, `ads_fire`, `reload`, `reload_empty`, `pullout`, `putaway`, `first_raise`, `sprint_in/loop/out`, `ads_up/down`); textures `i_<material>_*` (CEL-3 `i_mp_fusion_shotgun`, Tac-19 `i_uts_19`, XMG `i_exo_weapon`, Atlas 45 `i_titan45`, MG Turret `i_sentry_gun`, OHM `i_lmg_shotgun`, Bulldog `i_maul`).
- **Streamed images**: Greyhound only reads the high-res images streamed from xpaks in BO3's own `zone/` folder, so the pack's images "export" in about 10 ms with no file. Hard-link (a symlink isn't enough) the pack's xpaks into zone while exporting, e.g. `ln <workshop>/zm_mod.xpak "<BO3>/zone/zz_psh_aw_zm_mod.xpak"` (zm_mod held the AW images; core_mod alone didn't), restart Greyhound, export, and **delete the links afterwards** (same filesystem, so they cost no space). Done and removed 2026-10-23.
- **Sounds**: the pack's bank `snd/all/core_mod.all.sabl` (904 sounds). Greyhound Load File with a `Z:\mass_drive\...` path, search `wpn_s1_`, Export All (559 files): `skye_ports/s1_<gun>/{fire,foley}/`, copied to `export_game/bo3/sounds/skye_ports/`. The build reads that folder next to the codolbf one (`SND_ROOTS`, keys `aw/...`).

## Build details

- **Sounds**: fire `wpn_s1_<gun>_shot`; Pack-a-Punched `wpn_s1_<gun>_pap_shot` (`upShots`, played by `mods/bo3-weapons/mod.js`). The pack's notetracks name the sound files directly (`wpn_s1_cel3_open`, no `sndnt#` prefix; `SOUND_NOTES` in the build); numbered variants fall back to `<name>1` (the Tac-19's `shell_in1..4`).
- **Pump and lever guns**: the engine has no rechamber step, so a role can list several clips played back to back (`fire=('fire', 'pump')`; `read_clips` joins the SEAnims, notes included). The Tac-19's fireTime (0.9 s) covers both. Segmented reloads use `reload_in`/`reload_loop`/`reload_out` (Tac-19, MDL).
- **Dual wield (XMG)**: a MODW entry's `left=dict(model, idle, fire, reload)` builds `dualWield`, `leftModel` and `leftAnimations` (`*AnimLeft`), as for BO1's CZ75 DW. The right gun plays the `rdw_*` clips; animation.js lays the left gun's `ldw_*` clips on top (they key only `_le` bones and `tag_weapon_left` → `tag_weapon1`); raise, drop and sprint are the `fdw_*` clips that move both. The left gun's root `tag_weapon_le` is its anchor (dropped from clips like `tag_weapon`). Dual-wield guns don't aim down sights in this engine; shots alternate hands.
- **Tested** 2026-10-23 on the GPU (Kino, headless Chromium): all 11 raise, fire at their rates, reload and refill; the XMG draws both guns (and both `_up` models after PaP), the Atlas 45 swaps to its Titan model, guns without an `_up` model (M1 Irons, MG Turret) wear the PaP camo.
## Extras (2026-10-23, second pass)

User: "build the other stuff please" (everything that was listed as not built).

- **Akimbo pistols** (`aw_atlas45_dw`, `aw_m1_irons_dw`): MODW entries with `left=` like the XMG, built on the `rdw_*`/`ldw_*`/`fdw_*` clips (`DW_ROLES`). `aw()` takes `model=`/`world=` overrides: the Atlas 45's right gun is the plain `vm_s1_atlas45` (`upModel`/`upWorld` the `_rdw_up` pair), and a left `out=` renames the model's bones with the `_le` suffix (`SEM.read_semodel`) when the pack has no separate left export. The M1 Irons has no `rdw_reload_empty` (plain reload is used).
- **OHM shotgun mode**: `alt=dict(name, tpl, into, out, stats, roles)` in the entry builds `def.attachment` with `altForm: true` on the same model: its own clip set (`shotty_*`), 6 shells, 8 pellets, semi-auto (PaP 9 shells, 2.2x damage; `up.attachment` is written explicitly). The engine's attachment toggle (key 5) swaps the def and keeps separate ammo; `mods/bo3-weapons/aw.js` sets `view.raiseWith` so the change plays `attachInAnim` (`to_shotty`, on the shotgun rig) or `attachOutAnim` (`out_shotty`, on the LMG rig) in place of the raise. `raiseWith` is a one-off override read at the end of `ViewWeapon.equip` (animation.js). Camo follows the weapon id, so the shotgun form keeps it.
- **XMG lockdown** (`def.lockdown`, clips `lockdownInAnim`/`lockdownOutAnim` from `fdw_to_lockdown`/`fdw_out_lockdown`): aiming folds both guns into the braced pose. The pack has no lockdown idle or fire, so aw.js makes both clips additive (`makeClipAdditive`, both referenced to the fold-in's first frame), holds them paused, and scrubs them by `lock` (0..1 over each clip's length; the Out clip plays while unlocking). Locked down, walk and sprint speed drop to 35% (chained `moveSpeed`/`sprintSpeed` getters); `kino.aw.lock` reads it. engine.js: `aiming()` = ADS held and the gun isn't dual wield unless it has `lockdown` (camera FOV and view aim use it); `view.shoot` still gets `ads:false` for dual guns since the `ads_fire` clips are right-only.
- **Speed getter fix**: `perks-plus` used to replace `moveSpeed`/`sprintSpeed` with a plain `base *` getter, dropping every earlier mod's getter in the chain (bo3-weapons and bo7-weapons load before it). That silently killed the Siren's Soma-81 and the Havoc's dash bonuses as well as the lockdown slow. It now chains like the others. Measured: XMG 190 -> 66.5 locked, 190 after.
- **Attachments**: the AW guns use the Gunsmith's generic track; two get models. `reddot` on the OHM (`tag_sight_on`, offset `[-4,0,0]`), RW1 and Tac-19 (no sight tag: `tag_weapon`, offsets `[8,0,10.5]` and `[8,0,15.5]`; the Tac-19's receiver top is z 15.1 and its rear sight 15.5, so at z 12 the dot sat inside it). The part is BO3's `reflex_vmgun` (the pack has no red dot); `mounts.js` now takes an `offset` added after the root-bone inverse. `grip` on the Tac-19: BO3's Man-O-War foregrip (`attach_t7_ar_talon_foregrip_01_view`) on `tag_foregrip` (the gun has the tag but no grip geometry). Fingers end about 4 units from it.
- **Attachment clip sets** (`def.attachAnims[attId]` = `{animations, ...times}`): `attachClips()` in gunsmith.js merges them when the attachment is equipped (the reddot's `pre_reddot_ads_up/down`, the Tac-19's whole `grip_*` set with fire+pump joined). `STAT_FIELDS` now snapshots `animations` and the raise/drop/sprint/reload times so they restore. The weapon-levels equip wrapper drops the cached rig (`view.clipSet`) when the clip set changes. Measured with the dot on: the lens lands within 0.008 of screen centre at full aim on all three guns.
- **Prestige camos**: the 13 AW ids are appended to `.tools/prestige-guns.json` (classes: CEL-3, Blunderbuss, Tac-19, Bulldog shotgun; OHM, XMG, MG Turret lmg; MDL launcher; the pistols and both akimbos pistol), `camo-table.js` regenerated (74 guns, 222 names).
- **Tested** on the GPU: both akimbo pairs and the Titans draw in both hands and fire; the OHM swaps both ways with its fold clips and fires 8 pellets; the PaP OHM becomes "Ohm Overload · Shotgun" (9 shells, 330 damage); lockdown ramps in about 1 s and back; grip and red dots as above. `npm test` passes.
- Not done: lockdown has no fire clip of its own (the hip fire plays under the braced layer), and the AW guns have no Gunsmith attachments beyond the generic stat ones and the two models above.

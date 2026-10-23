# Advanced Warfare weapons (2026-10-23)

User: "add in the cel3, blunderbuss, tac19, bulldog, OHM, xmg, m1 irons, MG turret, MDL, RW1, and the atlas 45". Eleven guns from the BO3 workshop pack 1793220683 (Skye's Advanced Warfare ports, `s1_` assets), exported with Greyhound and built by `.tools/build_bo3_weapons.py` like the other BO3 imports (weapons.md, "Black Ops III assets"). Ids `aw_*`; assets stay git-ignored (`export_game/bo3/`, `mods/bo3-weapons/`).

| Gun | Id | Class | Model | Notes | Box level |
|---|---|---|---|---|---|
| Atlas 45 | `aw_atlas45` | Pistol | `vm_s1_atlas45` | PaP model is the pack's `_rdw_up` | 4 |
| Bulldog | `aw_bulldog` | Shotgun | `vm_s1_bulldog` | semi-auto, 6 rounds | 9 |
| M1 Irons | `aw_m1_irons` | Pistol | `vm_s1_m1_irons` | no `_up` model (PaP keeps the base one); `offset=[-1, 4, 0]` because its idle holds the revolver ~9 units lower than the Atlas 45's (hand off screen at our FOV) | 12 |
| Tac-19 | `aw_tac19` | Shotgun | `vm_s1_tac19` | pump: fire+pump joined, shells one at a time | 14 |
| Blunderbuss | `aw_blunderbuss` | Shotgun | `vm_s1_blunderbuss` | 4 rounds, 12 pellets | 18 |
| OHM | `aw_ohm` | LMG | `vm_s1_ohm` | shotgun mode (`shotty_*` clips) not built | 21 |
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
- **Not built (yet)**: the M1 Irons and Atlas 45 dual sets (`fdw/ldw/rdw` clips and models exist), the OHM's shotgun mode, the XMG's lockdown mode (`fdw_to_lockdown`), the Tac-19's grip variant, the RW1's and OHM's red-dot ADS clips. No attachments or prestige camos for these guns.

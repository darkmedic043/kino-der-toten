# Melon weapons: the Debt Collector, the Hive Launcher, the Grave Bell

Melon Zombies' own weapons (2026-11-05, user: "build 3 weapons from the weapon ideas ... the debt collector, hive launch, and the grave bell (as a melee), build these in blender, and make them look unique and sick, give them unique looks for what they do ... cool and unique attachments for each of them that makes them fun to unlock, maybe some that can transform the weapon in a unique way ... the unique prestige camos ... mark these weapon as 'coming soon' as i will be adding them to the upcoming battlepass"). The ideas come from the Helm note "Weapon ideas" (`4700e71010`).

They are fork originals, modelled in Blender like the BO7 guns (weapons.md, Black Ops 7 weapons: parts in a BO1 donor's `j_gun` space, skinned by `.tools/assemble-grimhawk.mjs`, shared helpers in `.tools/bo7lib.py`), so they ship in Rind installs. The two guns are `mods/melon-weapons` (`debt.js`, `hive.js`); the bell is a melee entry (`mods/melee`).

**Coming soon**: all three carry `soon: true`. Until the user puts them in a battlepass they are never handed out (no Mystery Box, no wall buy, no loadout pick); the loadout and the melee picker show them locked as "Coming soon". `localStorage['kino.dev.soon'] = '1'` lifts that for testing (the same switch as the classes).

## The Debt Collector (`debt_collector_zm`, Pistol, donor: the Python)

A loan shark's revolver. Every hit **banks** its damage on the zombie instead of dealing it; **reloading collects**: the moment the cylinder swings out, every marked zombie takes what it owes at once.

- **Look**: an oversized six-shot revolver in blackened steel and worn brass. Ledger-engraved cylinder whose six chambers are stamped I-VI with a coin slot face; a brass bead **abacus** along the top strap (the tally); a **ticker-tape receipt spool** on the left of the frame; a knuckle-duster trigger guard; a padlock-shaped hammer; a gold-tooth front sight; green-celluloid grips with a brass shield. Gold accents glow faintly while debt is owed.
- **Marks**: a gold coin marker over each indebted zombie with the amount owed. Debt grows with **interest** (+5 % a second, up to +50 %), so marking a crowd and waiting pays. A marked zombie that dies some other way **defaults**: its debt passes to the nearest zombie within 300.
- **Collect**: on the reload's start, each marked zombie within 2,000 takes its debt (a gold flash and a coin burst; headshot hits bank ×2.5). Collected kills pay +20 points. The Gambler class (classes.md) gets a 20 % jackpot (×2) per debt.
- **PaP: Hostile Takeover**: 8 rounds, interest up to +100 %, and a zombie killed by a collection spills its overkill onto the nearest unmarked zombie.
- **Attachments** (`dc_*`, 10, in `attachments.json` after the AW kits; tags hang on new bones, `GUNS.debt` in `assemble-grimhawk.mjs`). Four **transform** the gun:
  - `dc_bailiff` **The Bailiff** (stock): a carbine conversion. A long barrel with a walnut handguard and a wire stock replace the barrel and front sight. Range ×2, damage ×1.3, ADS FOV ×.85, hip spread ×.6, `pierce 1` (each shot bills the zombie behind too). It excludes the barrel and muzzle slots, and the muzzle flash moves 7.2 out along `j_gun` x (`bailiff()`).
  - `dc_roulette` **Double or Nothing** (mag): a roulette-wheel cylinder in place of the ledger. Each collection spins it once: red ×1.6 (11/24), black forgives every debt (11/24), green zero ×4 (1/12). The wheel turns on `tag_dc_roulette` rotation.x and stops on its sector (`spinWheel`).
  - `dc_compound` **Compound Interest Cylinder** (mag): a five-chamber brass drum with a gauge. 5 rounds, and interest compounds at 8 % a second on everything owed, up to +150 % (+300 % PaP).
  - `dc_ticker` **Ticker Tape Laser** (laser): replaces the receipt spool. A gold beam (its own crossed strips from the lens, `LASER_AT`, steered at the crosshair), hip spread ×.7, and a debtor's tag turns red once the collection will kill it.
  - The rest: `dc_loupe` Appraiser's Loupe (reflex, aimed hits bank +25 %, folds the gold-tooth sight via `ironSights`); `dc_brake` Foreclosure Brake (muzzle, range ×1.1, a debtor owing ≥ its health shuffles at half speed); `dc_hook` Repo Hook (underbarrel, a collection drags each surviving debtor up to 150 toward you and staggers it 1 s); `dc_payday` Payday Clip (collections pay 5 % as points, up to 100 a zombie); `dc_spiral` Debt Spiral Barrel (each further hit on a debtor banks 15 % more, up to +75 %; excludes the stock); `dc_shark` Loan Shark Grips (brass-knuckle grips: rounds ×.75 and the cylinder's swing-out and close ×.75 through a `setReloadStage` wrap; a melee on a debtor collects its debt on the spot).
- **Code** (`debt.js`): the fire hook flags the shot, `beforeEnemyDamage` banks every bullet hit of it (`amount = 0`, the hit still scores and flinches); `session.reload` is wrapped so a reload (or R with a full cylinder or no reserve) collects through `enemies.hurt(z, owed, head, false, 'debt')`, and `killCauses: ['debt']` credits the kills to the gun (XP, camos). Insta-Kill skips banking. Tags: a DOM layer `#debt-tags` (LOS-checked every 0.2 s, a `warmHud` state) plus a coin sprite per debtor. Debug: `kino.debt` (`ledger`, `owed(z)`, `collect()`, `last`, `pushes`, `spinWheel`). Sounds: the Python's, plus a synth coin tick and till.
- **Build**: `blender -b -P .tools/build-debt-collector.py -- parts.glb [--render dir]`, then `node .tools/assemble-grimhawk.mjs --gun debt parts.glb mods/melon-weapons/debt_view.glb mods/melon-weapons/debt_world.glb`, then `node .tools/build-gz.mjs`; bump `?v=` in `debt.js`. The cylinders hang off `j_bolt` (`BONE_PARENT`), so they swing out with the crane on the reload.
- **Prestige camos** (`prestige-art.js`, styles after the `dcCoin`/`leaf` helpers): **Promissory** (P1: green banknote guilloche, rosettes, gold seals, red serials), **Gilt Ledger** (P2: a ruled ledger page in gold leaf with red columns and wax seals), **Final Notice** (Master: black with red PAST DUE / FINAL NOTICE stamps and spinning coins; the stamps glow, the coins don't). All tile at 512; check with `scratch/melon/debt/camo.mjs`.
- **Test**: `flock scratch/melon/heavy.lock node scratch/melon/debt/play.mjs` (SwiftShader, sandbox; `RUNS=base,dc_hook,...`): banking, interest, collect, default transfer, every attachment's mechanic, PaP spill, the three camos on the gun, with frames in `scratch/melon/debt/play/`.

## The Hive Launcher (`hive_launcher_zm`, Launcher, donor: the M72 LAW)

Fires a sticky **nest** that releases homing **drones** while it lives. Zombies are drawn to the nest and tear it apart, so where it lands matters.

- **Look**: an industrial apiary launcher. A hexagonal honeycomb drum of glowing amber resin cells, a brass barrel with a hexagonal muzzle, a beekeeper's **smoker bellows** as the stock, glass vials with dormant drones along the side, wax seals and an APIARY stencil, yellow-black hazard bands.
- **Look (as built)**: on the LAW's tube (radius 1.45, the hands are fitted to it): a brass-framed hexagonal comb drum (glowing cells; it turns one cell a shot), a brass barrel with a hex muzzle, a tin smoker fire-pot (half heat-guard hoops under it, slim so it stays out of the ADS view) and a leather bellows stock, a vial rack with dormant drones, an APIARY plate, a hex-nut iron sight.
- **Stats**: clip 3, 18/24 ammo, fire .7 s, reload 2.6 s (2.2 empty), damage 320 a sting, ADS FOV 62, 2000 points. No explosion: the fire hook throws the nest itself (`projectile*` removed from the LAW clone).
- **Nest**: sticks to walls, floors and zombies (the Havoc's sticky logic), 5 hits, lives 12 s, hatches a drone every 0.6 s, 12 drones in all, at most 6 out at once; at most 2 nests (a third replaces the oldest). Zombies within 350 are lured to it (`enemies.lureTarget`), switch to attack within 46 and break it (a lured zombie never attacks the player). Tested: three zombies tear a fresh nest down in about 4 s.
- **Drones**: glowing mechanical bees (procedural, pooled 56), home on the nearest zombie, 3 stings each, then die; with no target they hover at the nest and die 3 s after it's gone.
- **PaP: Murder Hornet**: clip 5, 30/40, damage 900, nests take 10 hits and hatch 16 drones a quarter faster, red drones that explode on their last sting.
- **Attachments** (`hi_*`, 10, in `attachments.json`; tags on new bones, `GUNS.hive` in `assemble-grimhawk.mjs`). Three **transform** the gun:
  - `hi_swarm` **Swarm Drum** (mag, replaces the comb drum): a shot is a burst of three mini nests (3 hits, 3 drones, 6 s), up to six out; clip ×2, reload ×1.2.
  - `hi_keeper` **Personal Hive** (mag, a straw skep replaces the drum; excludes the underbarrel): no nests. While the gun is in hand drones hatch from it and orbit you (up to 8) and sting what comes within 260; a shot sends the whole swarm at what you aim at. Put the gun away and the orbiters go back in.
  - `hi_smoker` **Smoker** (barrel): a cone of smoke dazes the zombies in front for 1.5 s, the nest is lobbed, and every nest already out empties all its drones at once.
  - The rest: `hi_waggle` Waggle Scope (optic, ADS FOV ×.85; aim at a zombie to mark it, every drone goes for it first); `hi_pheromone` Pheromone Laser (nests lure from 700; drones prefer zombies near the pink dot); `hi_killer` Killer Swarm (barrel, drones explode on their last sting); `hi_honey` Honey Trap (zombies within 160 of a nest move 55 % slower); `hi_queen` Queen Cell (each nest's first drone is a queen: twice the size and damage, 6 stings); `hi_propolis` Propolis Shell (nests take 2.5× the hits); `hi_jelly` Royal Jelly (spent drones fly back and heal you 3).
- **Code** (`hive.js`, `prepareHive`/`setupHive`): kills go through `enemies.hurt(..., 'hive')` and `killCauses: ['hive','explosion']` credits them to the gun (XP, camos; tested). Debug: `kino.hive` (`live` nests, `drones`, `fire(ads)`, `active`, `marked`, `aimedZombie`).
- **Build**: `blender -b -P .tools/build-hive-launcher.py -- parts.glb [--render dir] [--quick]` (full bake about 10 min), then `node .tools/assemble-grimhawk.mjs parts.glb mods/melon-weapons/hive_view.glb mods/melon-weapons/hive_world.glb --gun hive`, then `node .tools/build-gz.mjs`; bump `?v=` in `hive.js`.
- **Prestige camos** (`prestige-art.js`, helpers `hexGrid`/`hexPath`): **Honeycomb** (P1: comb cells of honey, wax caps, empty and brood, with drips), **Apiary** (P2: painted hive-box planks with brass rivets, stencils and brass bees), **Hivemind** (Master: dark comb whose lit cells, veins and queen nodes glow). Apiary's stencils and hand holds sit in fixed slots (two words on planks 0-1, one word and a hand hold on planks 2-3), so nothing overlaps. All tile at 512; check with `scratch/melon/hive/camo.mjs`.
- **Test**: `flock scratch/melon/heavy.lock node scratch/melon/hive/play.mjs` (SwiftShader, sandbox, steps game time with `kino.debug.step`; env `RUNS=base,hi_keeper,a+b`, `ROUND`, `PAP=1`, `NEAR=1` spawns the zombies beside the nest; frames in `scratch/melon/hive/<TAG>/`). The sandbox's zombies stall about 70 from the far spawn points, so test breaking with `NEAR=1`. `scratch/melon/hive/look.mjs` grabs idle/ADS/fire/reload frames.

## The Grave Bell (melee `grave_bell`)

A funeral hand-bell. Ringing it sends out a visible shockwave: zombies freeze for a moment and turn toward the sound. Crowd control and a co-op rescue tool.

- **Look**: a cracked, verdigris-bronze funeral bell engraved with a MEMENTO MORI band and skulls, a skull-shaped clapper, a handle of a bound femur wrapped in black leather with coffin nails, hanging chain links.
- **Ring** (tap V with it out): a shockwave (a ground ripple and a spectral ring) stuns zombies within ~300 for ~1.2 s and turns them toward you; zombies on a downed teammate are shoved off.
- **Tolls**: ring again in the resonance window (shown on the bell and the HUD) to stack a toll, up to 3; the third is a **Death Knell** (bigger radius, real damage).
- **Heavy** (right mouse, or aim + V, with the bell out; hold V still draws and holsters as for the knife, so the heavy can't be "hold V"): a two-handed bash, 2.5× a swing's damage, and it rings.
- **Upgrades** through the melee tiers (Pack-a-Punch with it out), like the knife; tier II is **Last Rites**.
- **Model**: `blender -b -P .tools/build-grave-bell.py` (in `flock scratch/melon/heavy.lock`) writes `mods/melee/grave_bell_view.glb` and `grave_bell_world.glb` (then `node .tools/build-gz.mjs`). Bones: `j_gun` → `j_bell` (`j_clapper` with `tag_gb_irontongue`/`tag_gb_wolftone`; `tag_gb_choir`, `tag_gb_crown`, `tag_gb_lantern`, `tag_gb_veil`), `tag_gb_belfry`, `tag_gb_chain`, `tag_gb_ossuary`, `tag_gb_requiem`; every attachment is a part hidden by `hideTags` until fitted (the Gunsmith's usual tag scheme). Materials `gravebell_body`, `gb_glow` (the cracks and engraving, pulsed by the script), `gb_flame`. All own geometry: it is in the Rind install (OWN rule: `mods/melee/grave_bell_*.glb`, `mods/melee/grave-bell.js`).

### Numbers (`melee.json` → `grave_bell.bell`)

Swing 300 damage (×.4 for the light, ×2.5 heavy), swing .5 s (ring at .16), heavy .9 s (ring at .3). Ring: radius 300, stun 1.2 s; resonance window 1.6 s; 3 tolls; the Death Knell: radius 480, stun 2.2 s, `damage × knellMul 3` with falloff to the edge, kill cause `bell` (melee kill credit: `killCauses ["bell","melee"]`, so melee challenges, weapon XP and points count it). Stunned zombies are pinned where they stand (x/z held after `enemies.update`, a lure keeps them from attacking), turned toward the ringer, their animation slowed to .12, with a spectral halo; zombies within 150 of a downed co-op teammate (inside the wave) are shoved 180 away and stunned.

### The melee generalisation (`mods/melee/mod.js`)

A `melee.json` entry can now bring its own held model and behaviour; the knife's entry is unchanged and plays as before.
- `model`/`worldModel`: a GLB held in the right hand (grip from `grip` degrees, `mirror` for the left-handed rig); `pose` builds the held pose from clips (as the knife's).
- `script`: a module whose default export takes `{api,E,C,D,id,isOn,damage,power,play,has}` and returns hooks: `tune(meleeDef)` (D.melee is reset to the base before every swing), `swing(heavy) → {keys, lunge}` (pivot keys about the shoulder; `lunge:false` skips the lunge), `clip(heavy)`, `update(dt)`, `reset()`. `has(tag)` is true when a Gunsmith attachment has un-hidden that tag.
- `swings: 'still'`: the swing clips stay still and the script moves the arm (the bell's ring).
- Every melee is its own weapon def `melee_<key>` (`meleeSlot`, `meleeXp`, `gunsmith`, `noBox`, `soon`, `slotNames`, `killCauses`): weapon XP (weapon-levels counts melee kills only for a def with `meleeXp`), camos and attachments use the gun systems unchanged.
- `soon` (and `localStorage['kino.dev.soon']`) as for the guns: a soon melee in the profile falls back to the default.

### Melee Gunsmith (home.js, gunsmith.js, gunsmith-view.js)

The loadout's MELEE tile has a GUNSMITH chip (`meleeSmith`, `openMeleeGunsmith`) once the melee is unlocked and has attachments; the melee picker shows the same chip on each melee, and a detail panel (name, Pack-a-Punch name, the compact Gunsmith, its prestige slot). The weapon Gunsmith skips `meleeSlot` defs. Slot labels come from `def.slotNames` (the bell: Clapper, Shroud, Crown, Hanging, Rite, Hand, Pommel), falling back to the catalogue's.

### Attachments (`gb_*`, attachments.json; effects in grave-bell.js)

| Slot | Attachment | Effect |
|---|---|---|
| Clapper | Wolf Tone Clapper | every ring deals `wolfMul .5` × a swing across the wave, more up close |
| Clapper | Iron Tongue | stun ×1.7, radius ×.75, a lower toll |
| Shroud | Mourning Veil | radius ×1.4, stun ×.65, a muffled toll |
| Crown | Cracked Crown | 5 tolls, window ×.8 (1.28 s), Knell ×1.5 damage, ×1.2 radius |
| Hanging | **Chained Bell** (transform) | the bell hangs 7 lower on grave chain; reach 170; the heavy becomes a flail spin (`SPIN` keys) that hits everything within 170 (`heavyMul × .8`) before it rings |
| Hanging | **Sexton's Lantern** (transform) | a lantern under the bell; every ring leaves a ghost-light pool (radius 160, 4 s) that holds zombies walking in |
| Rite | Choir of the Dead | each Death Knell kill frees a wisp (speed 520, up to 8) that flies to the nearest zombie and holds it 2 s |
| Rite | Requiem | near a downed teammate: revive speed ×2 (`window.kino.reviveRate`, read by multiplayer/mod.js) and a 4 s ward that shoves zombies off them; solo, a Knell heals you and gives 2 s of invulnerability |
| Hand | Ossuary Grip | swings and rings ×.8 the time, window ×1.3 |
| Pommel | Belfry Spike | a Knell plants a ghost bell in front of you that tolls 3 more times (every 1.2 s, radius 260) |

### Prestige camos (prestige-art.js, `.tools/prestige-guns.json`)

The bell is in prestige-guns.json as `melee_grave_bell` (class `special`), so the Phase 4 prestige covers it like a gun (home.js `prestigeSlot` on the melee detail). Hand-made, in `OWN`: **Verdigris** (I: oxidised bronze with patina blooms, engraved sound rings, MEMENTO ✠ MORI bands with drips), **Gilded Requiem** (II: gold leaf in 64 px squares with seams and crackle, black enamel skulls on a staggered 128 grid, black diamonds), **Death Knell** (Master: black-blue bronze, six groups of spectral blue sound rings with bells at their hearts, tremor lines; the glow mask is drawn from the same random sequence, base-only noise has its own `rng`). All tile at 512. Preview: `node scratch/melon/bell/camo.mjs` (2×2 tiles and the glow).

### Debug and tests

`window.kino.graveBell`: `ring(heavy)`, `state()` (tolls, held, zones, wisps, ghosts, shields, fitted attachments), `held` (the stun map). HUD: toll pips `#gb-tolls` (no blur; warmed by `warmHud`). Test: `CFG=base|b|c|knife node scratch/melon/bell/bell.mjs` (sandbox; `b` = chain, wolf tone, choir, ossuary, veil; `c` = lantern, iron tongue, requiem, belfry, crown; frames in `scratch/melon/bell/t/`).

Known limits: in co-op the stun and shove act on the host's zombies only (zombies are host-authoritative), so a guest's bell rings and shows the wave but does not hold zombies yet; more than 20 stunned zombies share halos.

## Release checklist (when the battlepass hands them out)

- Remove `soon: true` from `debt.js`, `hive.js` and `melee.json`'s `grave_bell` (or keep it and have the pass unlock override it), and give the guns a `progression.json` entry or a pass reward; add them to `boxPool` only if they should roll from the box.
- Where the gate lives: `home.js` `gunSoon` (no Gunsmith), `meleeSoon` (picker locked, a saved soon melee falls back to the default), the box-list filter (`!d.soon`), `weapon-levels/camo.js`. The wiki doesn't load `melon-weapons`, so they have no wiki pages yet.
- Open points from the build (2026-11-05): the bell is held sideways at idle; mid-spin the Chained Bell's left arm still fills the left of the screen; the melee Gunsmith's stats panel shows gun numbers (damage 0, range ∞); the bell's heavy is right mouse or aim+V (hold V draws/holsters, as for the knife); Hive attachments Smoker, Pheromone Laser, Queen Cell, Honey Trap, Killer Swarm, Royal Jelly and Waggle Scope ran without errors but their effects weren't watched in game; the Grave Bell's Choir and Requiem effects weren't seen in a test either.
- Rind: the GLBs are in `install-manifest.mjs` OWN (`mods/melon-weapons/*.glb`, `mods/melee/grave_bell_*.glb`).

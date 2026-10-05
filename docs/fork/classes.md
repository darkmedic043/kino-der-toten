# Classes and skill trees

Added 2026-10-01. `export/web/mods/classes/`.

- **Data** (`classes.json`): XP rules (`kill`, `headshot`, `round`, curve `base·growth^(level-1)`, `maxLevel` 40) and classes. A class has an action skill (`action.base`: cooldown, duration, damage as a fraction of the round's zombie health per shot, rate, range) and three trees. Nodes: `tier` (1–6), `ranks`, `type` (passive by default, `augment`, `capstone`), `icon`, `desc` with `{v}` (per-rank value × rank; `fmt` `s`/`n` for seconds/counts, else percent) and `effects` (stat keys summed per rank).
- **Rules** (`classes.js`, shared by menu and game): one skill point per level (first at level 1). A tier opens after `(tier-1)·tierPoints` points in *that* tree (BL4 style). `canRemove` refuses a refund that would strand points in a higher tier. `actionStats` applies the trees to the action skill.
- **Storage**: its own key `kino.mods.classes` = `{selected, classes:{id:{level,xp,points}}}`, cloud-synced (`cloud.js` TRACKED). Not in the shared profile, so the profile's savers can't overwrite it. In game, xp/level are merged onto storage (points are only edited in the menu): `merged()` keeps the higher level/xp.
- **Menu** (`tree-view.js`, Classes tab in `home.html`/`home.js`): header (level, XP bar, points, respec), action-skill card with live numbers, a detail panel, three tree columns with a filling spine, tier rows with lock thresholds, hex passives with rank pips, diamond augments, a capstone. Left click adds, right click refunds.
- **Game** (`mod.js`): XP from the `kill` event (turret kills included) and each round. Passives: `player.armor`/`armorTurret`/`bulwark` (beforeDamage), `blastResist` (damage within 0.15 s of a nearby explosion effect), `points` (beforePoints), `melee`/`explosive`/`chainBlast` (beforeEnemyDamage), `reload` (wraps `session.reload`), `grenades` (per round). Key: the `ability` bind (default Z, `settings.js` ACTIONS).
- **Sentry Turret**: BO1's `weapon_zombie_auto_turret` (skinned: clone with SkeletonUtils; barrel `tag_flash` points down +X, tracers start at that bone). Placed 70 units ahead on the ground, tracks the nearest visible zombie, damage per shot = `zombieHealth(round)·damage + 20`, tracers, +50 points per turret kill. Augments: slow (`turret.slow`, divides the speed back on expiry), arc (`chain`), burn, lure (wraps `enemies.lureTarget`), self-destruct (`explode`), heal near it, grenades every N s (`grenade`), twin turrets (`double`), kill cooldown refund (`killCdr`). Cooldown runs only while no turret is up.
- **HUD**: a hex icon prepended to the hud mod's `#equip-hud` (or fixed bottom-right), cooldown sweep and seconds, the turret's remaining power while up, class and level under it.
- Debug: `kino.classes` (`state`, `stats()`, `action()`, `deploy()`, `cooldown`, `gain(xp)`, `turrets`).

- **Turret aims the gun only (2026-10-02)**: the base keeps the yaw it was placed with; aiming rotates `mg01` (yaw about world up relative to the base, then pitch about the gun's right axis, converted to the bone's local frame). The model has two hierarchies: the gun is skinned to `tag_aim_animated` under `bi_base>mg01` (40k verts), the tripod to `bi_base` (70k); `tag_aim` is an unskinned tag (turning it moved nothing).


## Fortifier (2026-10-03)

Second class (`classes.json` `fortifier`, colour `#7fb0c8`); its action skill is the **Barricade Wall** (`fortifier.js`, wired from `mod.js` when `cls.action.id==='wall'`; base cooldown 45 s, 40 hits, 130 wide, 40 tall: waist high, below the ~60 eye height, so you see and shoot over it).
- **Permanent** (user request): no timer; a wall stands until its hits run out, and the cooldown starts only when the last wall falls (Salvage shortens it). Using the skill while a wall stands picks it up and puts it down where you're facing (3 s between moves), keeping its damage and a spent Last Stand; claymores are only planted for a freshly raised wall. The HUD hex shows the hits left. Extra Bolts (`fort.duration`) became Field Repairs (`fort.roundRepair`, +4 hits per rank at each new round); `loadClassProfile` moves saved `bolts` points to `repairs`.
- **Holding zombies** works like a boarded window, not a navmesh cut (a cut would leave zombies stalled when the wall seals a corridor): zombies path as usual; any zombie inside the wall's slab (in the wall's own frame, `ax` along it, `az` out through the spiked face) is pushed back to the face it came from and put in its normal `attack` state with `attackDealt=true` (no damage to the player). The swing's mid-point (`attackLeft<.62`) is a hit on the wall (dogs half). `z.stuck` is reset while held, or enemies.js would remove it after 36 s. In open rooms crowds slide along the face and round the ends (separation); in doorways and corridors they're held.
- **Player collision**: a rotated box `CollisionWorld` in `world.dynamic` with `.box` and `window:true` (so `setDoors` doesn't disable navmesh polygons under it, and bullets pass through, like boards). Removed from `world.dynamic` when the wall goes. Moon's world adapter has no `dynamic` list: there the wall doesn't block the player.
- **Model**: procedural (a corrugated steel plate drawn on a canvas with hazard stripes and rivets, posts, struts to foot pads; spikes as an InstancedMesh on the +z face when the tree has them). It rises out of the ground, shakes when struck and darkens as it wears down (per-wall plate material).
- **Trees**: Hardpoint (`fort.health`, `fort.roundRepair`, `fort.regen` 2 hits/s when untouched, `fort.width`, `fort.cooldown`, `fort.salvage` cooldown refund, `fort.knock`, capstone `fort.double` = two walls in a V at 75% hits), Teeth (`fort.spikes` per-hit fraction of round health, `fort.slow` within 150, `fort.shock` arc to the attacker + one neighbour, `fort.bleed`, `fort.toll` points per hit, `fort.shrapnel` blast when it comes down, capstone `fort.execute` below 35%), Bunker (`player.armorWall`/`reloadWall`/`wallDamage` within 260, `fort.ammo` reserve +5%/2 s, `player.armor`, `player.grenades`, `fort.claymore` two claymores per wall, `player.points`, capstone `fort.laststand`: a downing hit near the wall costs it 10 hits instead, once per wall). Wall kills score like turret kills (50).
- `classes.js`: `actionStats` and the new `actionRows` (the action card's stat lines) branch on the action id. The menu (`tree-view.js`) gained a class picker row (sets `selected`; the game reads it at start).
- Debug: `kino.classes.fort` (`walls`, `mines`, `deploy()`).
- Verified headless (Sandbox): a lone zombie walks up, is held at the face attacking, the wall loses hits, spikes + current kill it in 3 hits; the player is stopped 19 units from the plate; Fortress + Tripwire raise 2 walls and 4 claymores (2 triggered); the Engineer still deploys its turret.

## BL4-style loadouts (2026-10-03)

User request: each tree changes the action skill itself, augments are chosen, capstones work with every skill.
- **Data** (`classes.json`): every tree has an `action` ({id, name, icon, desc, base}); `augmentSlots` 2, `capstoneSlots` 1. Each tree: tier 1 two passives; tiers 2–4 an augment + a passive; tier 5 an augment; tier 6 a capstone (4 augments, 5 passives, 1 capstone).
- **Loadout** (`state.loadout = {action: treeId, augments: [ids], capstone: id}`, `classes.js`): passives from every tree always count; augments only while equipped and only from the equipped skill's tree; one capstone from any tree. `stats()` filters with `isEquipped`; `actionStats`/`actionRows(cls,state,a)` switch on the equipped action id. `loadClassProfile` migrates: refunds points in nodes that no longer exist (or above their ranks), moves `bolts` to `repairs`, and gives an old profile a loadout (the tree with the most points, its invested augments, the first invested capstone).
- **Menu** (`tree-view.js`): each tree header has an EQUIP ACTION SKILL button; the side card shows the equipped skill, its stats and a loadout strip (2 augment slots + capstone). Clicking an unlocked augment/capstone toggles it (a freshly unlocked one drops into a free slot); right-click removing its last point unequips it. Equipped nodes glow (drop-shadow, which follows the clipped shapes); unlocked but unequipped ones are dimmed.
- **Skills**: Engineer: Sentry Turret (`mod.js`), Hunter Drone and Mortar Beacon (`engineer.js`). Fortifier: Barricade Wall, Razor Snare, Sandbag Nest (`fortifier.js`; walls and sandbag segments share the zombie-holding code, segments carry a `kind` and deployment `group`). The game reads the loadout at start (`act=actionOf(...)`).
  - Hunter Drone: a procedural quadcopter orbiting 55 out / 72 up, tracers at the nearest visible zombie (`drone.*`: count/Wingman ×0.7 damage each, kamikaze dive into the densest crowd at the end or on Z, Spotter mark → `beforeEnemyDamage`, Medic heal, Shock chain + 0.4 s stun that pins the zombie).
  - Mortar Beacon: a shell every `interval` on a random zombie within `range` of the beacon; a red ring warns 0.7 s before the blast (`blast()` hits zombies only, never the player). Napalm discs burn 8%/0.5 s for 4 s; Cluster = 3 bomblets; Danger Close keeps the beacon at your feet; Sustained +60% duration, 25% faster.
  - Razor Snare: an instanced field of concertina coils + loose strands + stakes; zombies inside are slowed (speed × (1−slow), restored on leaving) and take `damage`×health per second (ticked every 0.5 s); wear drops by one per zombie-second inside, permanent until worn out. Barbs bleed on leaving, Snarl pins entrants 2 s, Electrified zaps + arcs every 0.5 s, Reel In drags zombies within 300 at 40 u/s, Toll Gate points per zombie-second.
  - Sandbag Nest: instanced burlap sandbags (capsules) in 3 segments (front, left, right; Ring of Steel adds the back) at `radius` around your feet, each holding zombies like the wall; Field Medic heals and Ammo Cache refills inside it.
- **Capstones** (class-wide `cap.*`): `cap.double` (turrets/drones/beacons ×2 at 75% duration; two walls in a V, two snares, nest sandbags ×1.75 hits), `cap.killExtend` (+1.5 s per kill by the skill), `cap.finale` (turret self-destructs, drones dive, the barrage ends with 8 shells in a line), `cap.execute` (below 35% health dies on wall/wire/sandbags), `cap.laststand` (near any fortification, once per deployment).
- Verified headless (Sandbox): each of the six skills with two augments and a capstone deploys and works with no errors (sentry 2 kills, drones 3, mortar all 6, wall 1 with current, twin snares 4 + toll points, ring nest holds them); the menu migrates an old profile, equips skills and toggles augments.

## Generic passives and free augments (2026-10-03)

User requests: passives must work with every action skill, neutral wording ("Ability damage +8%"), more skills per tree, and augments free once their tier opens.
- **Trees**: 17 nodes each: tier 1 three passives; tiers 2–5 two passives + one augment; tier 6 one passive + the capstone (12 passives, 4 augments, 1 capstone).
- **Passives** are generic stats: `ability.damage`, `ability.duration` (time for turret/drone/barrage; hits/wear for walls, sandbags, wire), `ability.cooldown`, `ability.rate` (fire rate, shell rate, wire tick), `ability.size` (range, blast radius, width, radius), `ability.slow`, `ability.stun` (chance to pin a zombie 0.6 s), `ability.killCdr`, `ability.killHeal`, `ability.killPoints`, `ability.mark` (Spotter: +damage from the player for 3 s), `ability.toll` (points per hit), `ability.repair` (each round: hits back on a standing fortification, else seconds off the cooldown), `ability.salvage`, plus `player.*` (armor, armorNear/reloadNear/damageNear "near your ability", reload, explosive, blastResist, grenades, chainBlast, points, melee). `actionStats` maps them onto each skill.
- **Runtime**: `mod.js` owns the shared parts: `onHit(z,killed)` (every skill calls it for each zombie it damages: toll, mark, slow, stagger, kill heal/points/cooldown cut), `startCooldown` (Salvage; kill cuts during a still-running skill are banked until its cooldown starts), Field Repairs on a new round (`other.repair(n)` or cooldown), and the near-ability passives (`nearAbility()`: turrets, `other.near(f,r)`; the drone counts as always near). `engineer.js`/`fortifier.js` scale fixed-fraction damage by `A().dmgMul` and report hits.
- **Augments** cost nothing: `unlocked(cfg,cls,state,node)` (the tree's points reach the tier) gates `toggleAugment`; `stats()` counts an equipped augment as rank 1; `canAdd` refuses augments; `pruneLoadout` drops equipped augments whose tier relocks (called after every point change and on load). `loadClassProfile` refunds points that were in augments.
- **Menu**: augment diamonds have no pips; unlocked ones light up, pulse when a slot is free on the equipped tree, click to equip, right-click to unequip.
- Verified: Node checks (one set of passives changes all six skills; old augment points refunded; a relocked tier unequips); the menu equips free augments; all six skills run in Sandbox with passives, two augments and a capstone, no errors.
- Passive descriptions are written per class (the stat keys are shared): Engineer text names only the turret, drones and mortar; Fortifier text only the wall, wire and nest (e.g. `ability.duration` reads "durability" for the Fortifier, `ability.rate` "shred rate").
- **2026-10-03 tweaks**: Fortifier cooldowns raised (wall 75 s, snare 65 s, nest 80 s). The Sandbag Nest's segments share one pool of hits (`addSegment(..., pool)`: `hits`/`maxHits` become accessors on the pool; base 25 × segments; a hit on any side shakes every segment; regen and Field Repairs count once per pool via `unique()`; the nest falls together). The HUD skill hex has a health bar (`other.health()`: a wall, the whole nest, or the wire's wear) that turns red under 30%.
- **Co-op (2026-10-05, `coop.js`)**: other players see your action skill. The owner sends, 10×/s, adds/removes of what stands (turrets, steel walls, sandbag segments, wire fields, claymores, drones, beacons), drone/following-beacon positions and wall wear; turret/drone tracers and skill blasts as they happen (`{t:'ab', op}`). Everyone else builds mirrors from the same models (the builders are module-level exports now: `steelWall`, `sandbags`, `wireField`, `mineModel`, `droneModel`, `beaconModel`). Damage already reached the host like gunshots. The host's mirrors of walls/sandbags hold its (real) zombies and send each strike to the owner (`op:'hit'`), whose wall loses the hit (pool-aware) and disappears for everyone when broken; mirrored wire slows zombies inside on the host. A guest's own walls don't hold locally (their zombies are copies; strikes would count twice). Mirrors block players. Late joiners get what is standing; a leaver's mirrors are removed. Verified with two browsers: a guest's sandbag nest shows for the host, holds zombies there and lost 5 hits to their strikes; a guest's turret and drones show and move. Not mirrored: turret aim, napalm discs, mortar warning rings.


## Pilot (the mech class, 2026-10-05)

Third class, **Pilot** (`classes.json` id `mech`; named Mech until the user asked for a role name like the others, colour `#9ccf5a`). One action skill for all three trees, **Call In Mech** (`mech.js`), and a weapon per arm.
- **Data:**
  - `cls.mech.weapons` holds the six weapons' numbers. Each tree has a base weapon (`tree.weapon`, always available): Ballistics (Thresher Chaingun), Ordnance (Quad Rocket Pod), Vanguard (Hydraulic Fist).
  - Halfway down each tree (tier 3) a `type:'weapon'` node unlocks a second weapon for a point: Longbow Rail, Thermite Launcher, Arc Thrower. It renders as a wide hexagon.
  - Augments carry `weapon` (the weapon they modify) and work while that weapon is on an arm, `mech.augmentSlots` (2) per arm.
  - Capstones are "cores": Smart Core, Salvo Core, Berserker Core.
- **Rules** (`classes.js`): the loadout adds `left`/`right` (never the same weapon; picking the other arm's weapon swaps them). Helpers:
  - `mechWeapons` (available weapons) and `equipArm`.
  - `augmentsOn`, plus a mech branch in `toggleAugment`/`pruneLoadout`.
  - `mechStats`: the mech's integrity, cooldown, hit cost, cooling, speed and passives, and each arm's weapon via `mechWeapon`, with the trees applied.
- **Menu** (`tree-view.js`): the action card shows the arm loadout (weapon chips per arm, that arm's two augment slots) and the capstone slot. Tree headers show the base weapon instead of an action-skill button.
- **Model** (`mech-model.js`): built in code from rounded boxes (three's `RoundedBoxGeometry`, vendored into `vendor/jsm/geometries/` from three r185) and an extruded hull. It reuses no game or Cheese Cube Iron Man assets: the user wants the Iron Man suit kept for a future scorestreak.
  - Titanfall-style: canvas panel texture with hazard stripes and a "KD-07" stencil, cockpit hatch with a visor, pauldrons, legs, a reactor pack, and a rear hardpoint (post, seat, MG).
  - `createMech()` takes swappable arm weapons and runs a procedural walk, aim pitch, recoil, chaingun spin and charge glow. `mechArms()` gives the first-person forearms for the viewmodel scene.
- **Game** (`mech.js`; every class runs it for the co-op half, only the Mech class pilots):
  - **Drop:** Z drops the mech 150 ahead (1.1 s fall from 1,800 up, a whistle). The landing blasts zombies (1.3× health, 230 radius), then you're in. Integrity = duration (45 s base) and drains a second a second. Z again ejects.
  - **Damage:** each `beforeDamage` hit costs `hitCost × clamp(amount/45, .5, 3)` seconds. The player is kept invulnerable (`session.effects.invulnerable` refreshed each frame), so the HUD mod's damage effects stay off.
  - **Eject:** at 0 integrity you're pushed back 60, get 2 s of invulnerability, the wreck explodes (Ejection Charge makes it damage), and the cooldown starts.
  - **Cockpit:**
    - The camera is lifted 34, less under a low ceiling.
    - The gun viewmodel is hidden (`view.pivot.visible`) and the mech forearms are drawn instead. In third person (T) you see the mech.
    - Movement speed is ×0.82 and jumping is off.
    - A capture-phase `mousedown` takes left/right click (stopImmediatePropagation, so the gun neither fires nor aims). Gun keys are blocked: R V G F E Q X, 1–5.
  - **Weapons**, by `mode`:
    - `auto` (chaingun): spin-up, hitscan with spread, pierce augment.
    - `charge` (rail): hold to charge, damage scales with charge², pierces the whole line.
    - `semi`: rocket bursts as projectiles with splash, homing and cluster augments; thermite shells under gravity that leave fire pools; the fist hits a cone with knockback, plus pound, dash and execute augments.
    - `beam` (arc): ticks onto the zombie nearest the crosshair and chains.
    - Damage is a fraction of the round's zombie health (like the other classes' skills), through `enemies.hurt(..., 'mech')` (score on).
  - **Heat** per arm: firing adds it, and it cools at .38/s after 0.35 s idle. At 1 the arm overheats and vents at .55/s back to 0 before it can fire again.
  - **Sounds** are synthesized with Web Audio.
  - **HUD** (`#mech-hud`, `body.mech-pilot` hides the weapon panel and crosshair):
    - Integrity bar at the top (segmented, a white ghost for the last hit, a shake on hits, red below 25% with INTEGRITY CRITICAL).
    - A heat gauge per arm beside the reticle (LMB/RMB, weapon name, READY / SPINNING UP / CHARGING % / OVERHEAT · VENTING).
    - Bracket reticle, corner frame and scanlines, a boot readout on landing, and core status.
- **Rear Hardpoint** (Vanguard tier 2 passive): the mech carries a back MG.
  - Co-op messages: `{t:'mech', op:'st'}` 10×/s from pilots (on, mount, rider, arm weapons, pitch, gunner damage bonus).
  - Every player builds a mirror mech on a pilot's avatar and hides the avatar. The multiplayer mod now exposes `net.remotes`.
  - A teammate within 150 presses F (`op:'mount'`) to ride: their feet are pinned to the seat (`SEAT`, rotated by the pilot's yaw), they're invulnerable, and left click fires the MG (11/s, 7.5% of zombie health + 25).
  - Their kills send `op:'rkill'`, which feeds Covering Fire. F or Space dismounts, and the pilot ejecting (`op:'off'`) throws them off.
  - Tested with two browsers: mount, ride, rider immunity, dismount on eject.
- Debug: `kino.mech` (`phase`, `integrity`, `arms`, `deploy`, `eject`, `trig`, `mount()`, `pilots`).
- **Passive audit (2026-10-05):** every Pilot node's effect key was traced to the code and its text rewritten to say exactly what it touches (which weapons, "explosions and fire included", how Repair Drones interacts with the drain). Fixes:
  - Explosions (rockets, thermite blasts, Overcharge, the landing, Ejection Charge) now go through `mblast`, which hurts each zombie via `hurt()`. Explosive kills count for Kill Feed, Demolition Pay and Berserker Core, and get Smart Core's bonus.
  - Blast Radius was applied twice to rockets.
  - Salvo Core's rockets now use `mechWeapon` (the Ordnance damage and radius passives).
  - Verified in game: 6 rocket kills with Kill Feed ×3 added 2.7 s against 2.6 s of drain.
- **Other classes, same audit:** the class `blast()` takes `credit`. Skill-made explosions (the turret's Grenade Launcher, Final Payload, Shrapnel Charge, claymores) call `onHit` (Recycler, Bounty, Nanites, Contractor, Spotter, slows…), pay the skill's 50 points per kill instead of gun points, and the Fortifier's Shrapnel Charge and claymores now scale with ability damage (Heavy Gauge, Honed Edges). Chain Reaction (a player passive) stays uncredited.
- **Marcy model (2026-10-05, user request):** the mech is now RainOnTheMoon's "Animated Mech - Marceline Sentinel Armor (Marcy)" (Sketchfab, CC-BY-4.0, credited in CREDITS.md and on the class card). `.tools/build_mech.sh <zip>` → `.tools/build_mech_blend.py` → `mods/classes/models/mech.glb` (7 MB, git-ignored). Without the GLB, `createMech` falls back to the procedural chassis.
  - **Build cuts** (each vertex goes with its strongest bone weight; positions in Blender units, the model is ~1.35 tall with fins):
    - The blade forearms are cut 0.17 past the elbow (palm and fingers dropped).
    - A cockpit is opened: chest vertices with y < 0.1 and z < 1.0 (the "UNIT 17" brow stays as a canopy) and waist vertices with y < 0.05.
    - The forearm stumps are also copied out as `FP_ArmL`/`FP_ArmR` (elbow at the origin, forearm along +Z) for the first-person view.
    - The two clips are dropped; textures go to 2048/1024 WebP.
  - **Kept procedural:** `marcyMech` turns its bones in code every frame (each driven bone back to rest, then `turn()` about the mech's own axes):
    - Digitigrade walk: thigh, middle leg and shin, with the ankle levelled.
    - Pelvis bob, ribcage sway and pitch, booster flaps and fins.
    - Arm aim: the upper arm takes 35% of the look pitch; the forearm has its rest slope and outward yaw cancelled, then takes the rest of the pitch.
    - Weapons aren't bone children: each frame they're placed at the stump end (stored in the forearm bone's frame) pointing along the aim, scaled ×1.45.
    - Scale 175 (about 2.4 players).
    - Rear hardpoint on `EngineHead`; `gunnerSeat` (0, 191, −58).
  - **Pilot:** a copy of the operator (`window.kino.characterEntry`; co-op mirrors use the teammate's `r.entry`) sits in the cockpit (`seat`: hips at (0, 133, −17.5), with a back panel over the model's unseen checkerboard interior and two control sticks).
    - `seatCharacter()` (characters.js) poses any character without running its animation: thighs forward, shins down, hands on the sticks, recoil kicks, the head follows the aim.
    - It works on the mannequin (now exposes `joints`) and on rigged models (bones found by shape). It only uses bones the visible meshes are skinned to: bo1 rigs also carry Black Ops' hidden skeleton, whose "pelvis" was picked for Gyro.
    - Legs prefer leg/thigh-named chains: Gyro's holsters hang off his hips further out than his thighs.
    - Zoroark (Blockbench, no hips or legs it can find) sits upright.
    - Mine shows only in third person; teammates' always show.
  - **Camera:** first person sits at the pilot's eyes (`eye` 171 above the feet, clamped under ceilings). Third person pulls back (`kino.thirdPersonCamera` distance 270, shoulder 60, recomputed after the lift) and is restored on eject.
  - **Heat (user request):** an overheated arm stays locked for 1.2 s (`VENT_DELAY`, HUD "OVERHEAT", then "VENTING") before venting at .4/s (was .55). Normal cooling is .28/s after 0.5 s without firing (was .38 after .35).
- **Shorter mech, kit weapons (2026-10-05):**
  - The Marcy mech is now scale 130 (about 1.8 players; 175 was "way too tall").
  - The cockpit (`seat`) is scaled by 130/175 with the pilot and its panel and sticks, so the operator still fits under the brow. `eye` is now 127 above the feet.
  - The build now also copies seven of the model's parts out as `KIT_*` meshes: hand, blade, booster, engine, engine core, knee cap, shoulder.
  - `KIT_WEAPONS` builds the six arm weapons from them, so they share the mech's textures, plus finer procedural detail: fluted barrels with clamp rings and brakes, bores, pistons, glow.
    - Fist: the mech's own claw hand on pistons.
    - Rail: the cut-off "DO OR DIE" blade with coils.
    - Chaingun: the engine-core drum under a shoulder cowl with six barrels.
    - Rocket pod: an olive box with knee-cap armour, shoulder armour on top and a booster at the back.
    - Thermite: the radial engine as its drum.
    - Arc: the drum with prongs and a core.
  - The plain steel parts are only half metallic: the game's scenes have no environment map, so strongly metallic materials rendered black.

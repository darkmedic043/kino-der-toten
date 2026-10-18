# Reaper Collection perks (2 implemented, 43 working but switched off)

The user's requests (2026-10-18): first "add all 45 perks with their effects, but dont implement them, just keep them in the files while i figure out what i want to do, document each and every one of them", then "add the functions of all of them", answered "working, but switched off". So every effect below **works**, but **nothing sells the perks** (except the two in Implemented): no machine, no terminal PERKS entry, no gobblegum or Easter egg gives them. Only the cheat console does:

- `reaper list` (held ones marked `*`, upgraded `**`), `reaper <id|name|all>`, `reaper up <id|all>` (the mod's upgraded "double buy" version), `reaper none`.
- **Implemented** (sold for real, see the next section): Prismatic Punch and Dam-A-Nade.
- To switch one on for real later (as was done for those two): add it to the terminal's `PERKS` list (`mods/terminal-booth/desktop.js`) and/or a machine marker alias, and give it a drink in perks-plus `data.json`.

Code: `export/web/mods/perks-plus/reaper-perks.js` (`setupReaperPerks`, started by perks-plus once `reaper-perks.json` loads; `window.kino.reaperPerks` {ids, has, up, upgraded, give, armour, momentum, raiseWall, walls, nadeMax, tacticalMax}). The perks are in the perk table with `offSale: true` only so the HUD shows them while held (icons from the git-ignored `reaper/icons/` when built, else letter badges). **zh** below = `zombieHealth(round)` (1045 at round 10, 3953 at 24): the mod's scripts weren't decompiled, so every number is ours. Perks with charges or timers show a chip above the perks (`#reaper-chips`).

Engine/mod hooks added for them: `session.damage` gets an outermost wrapper (installed on the first frame, so it also wraps the co-op mod's downs) for the lethal-hit perks and Stone Cold armour; `session.spend` (Cashback), `mysteryBox.start/take` (No Bear, Timeslip, Pack-A-Box), `powerups.onCollect` (Nuka, Mocha, Repairman's Carpenter), `world.setBoards` (Repairman), `enemies.lureTarget` (Bubble Blink, Zombshell), the player's speed getters (I.C.U., Momentum, Fighter's Fizz) are wrapped; engine.js fires while sprinting when the mod host's `sprintFire()` says so (Tactiquilla); the rocket shield takes `.perk` hooks and has `heal(n)`; the multiplayer mod multiplies the bleed-out by `kino.coopBleedMul()` and exposes `kino.coopDown`.

## Implemented

The user (2026-10-18): "add one of the reaper perks, im thinking prismatic punch looks the best, give it the augment system, and have it be unlocked in page 6 of the melon pass, replacing the crows calling card. also add dam-a-nade, same stuff with the augment system, can be unlocked in page 8 and replaces the harvest moon glow there… ignore their double buy effect, can probably be reused in the augment system". Done the way Widow's Wine was (pass.md):

| Perk | Perk id | Unlock (Melon Pass Season 1) | Terminal | Drink |
|---|---|---|---|---|
| **Prismatic Punch** | `specialty_prismatic_punch` | page 6 (Night Shift) tier 9, premium: `pass.s1.perk.prismatic`, replaced the Crows calling card | PERKS app, 3,500 on the tile (the Cold War price ladder applies) | Quick Revive's bottle |
| **Dam-A-Nade** | `specialty_damnade` | page 8 (Embers) tier 7, free: `pass.s1.perk.damnade`, replaced the Harvest Moon Glow | PERKS app, 3,000 on the tile | PhD Flopper's (Moon) bottle |

- **Where**: `REAPER_ON` in `reaper-perks.js` (perk table entries; perks-plus adds them to `MORE_PERKS`), the terminal's `PERKS` with `unlock` (locked tile until the pass item is owned; the free-perk gums skip them until then), drinks in perks-plus `data.json` (tracked BO1 bottles, since the extracted BO3 bottles are git-ignored and rigged differently), HUD icons and Dam-A-Nade's sting from the git-ignored `reaper/` build (letter badges PP / DN without it). Pass thumbnails show the Reaper icon (`data.icon` a path under perks-plus/, `data.color` the glow).
- **No double-buy**: their "upgraded" versions aren't sold; the cheat's `reaper up` no longer changes them. The two upgrades became Majors on their research tracks (Afterglow, Demolition Expert), and Prismatic's "bigger wall" is the Refraction Minor.
- **Saves that already claimed the old rewards**: the pass remembers claims by slot, so `reconcile()` (pass.js, run by the main menu when the season loads) hands over the item of every claimed slot that isn't owned. Owners of the Crows card / Harvest Moon Glow keep the ids, but the items are gone from the catalogue, so they no longer show or apply (`cosmetics()` skips unknown items).

### Prismatic Punch (implemented)

- **Base**: 15% of bullet kills (45 s cooldown, counted from when the wall goes down, so Afterglow doesn't eat into it; until 2026-10-18 it was 10 s from the wall going up) raise a purple energy wall at the kill, facing you, for 10 s. A bullet that crosses it (the engine's per-pellet `shot` event, so every map; a bullet stopped by a zombie in front doesn't reach it) ricochets into the nearest zombie within 400 for the gun's damage, and the wall grows 10% per hit, up to double size, where it fires two ricochets. The mod's activate / max-size sounds.
- **Research track** (`pp.*`, Minor/Major alternating):

| # | Augment | Kind | Effect |
|---|---|---|---|
| 1 | Refraction | Minor | Walls start 40% bigger |
| 2 | Afterglow | Major | At double size the wall stays up 15 s from then (the mod's upgrade) |
| 3 | Quick Flash | Minor | Cooldown 45 s → 27 s |
| 4 | Scatter Light | Major | Every ricochet bounces on to a second zombie within 220 for half its damage |
| 5 | Prism Charge | Minor | 25% of bullet kills raise a wall (was 15%) |
| 6 | Full Spectrum | Major | Ricochets have a 20% chance to set off your gun's own ammo mod at its tier (and its augments); nothing without one (was a random mod until the user's change, 2026-10-18) |
| 7 | Amplifier | Minor | Ricochets +50% damage |
| 8 | Supernova | Major | A wall that reached double size bursts when it fades: 0.6 zh within 250 |

### Dam-A-Nade (implemented)

- **Base**: explosions (`cause` explosion / grenade) deal x1.5; you carry 5 lethals (one more than 4, filled when you drink it) and one more tactical (4 Monkey Bombs, Gersh Devices or QEDs); when each round starts (the countdown ends; user, 2026-10-18: it was at the round's end) your lethals refill and one tactical comes back, and the round-end +2 grenades no longer cuts a 5- or 6-grenade belt back to 4; Max Ammo fills both to the bigger limits.
- **Research track** (`dn.*`):

| # | Augment | Kind | Effect |
|---|---|---|---|
| 1 | Bandolier | Minor | One more lethal (6) |
| 2 | Concussion | Major | Explosives freeze the zombies they don't kill for 2 s |
| 3 | Extra Tactical | Minor | One more tactical (5) |
| 4 | Chain Reaction | Major | Explosive kills explode: 0.3 zh within 110 (cause `shrapnel`, so they don't chain or take the x1.5) |
| 5 | Recycler | Minor | 8% of explosive kills give a grenade back |
| 6 | Incendiary | Major | Explosives set the zombies they don't kill burning (4 s, 0.15 zh/s) |
| 7 | Resupply | Minor | The round-start refill gives the whole tactical slot back, not one |
| 8 | Demolition Expert | Major | x2 explosive damage instead of x1.5 (the mod's upgrade) |

- **Verified** (2026-10-18, a Kino match, GPU headless): both bought at the engine's perk path and drunk; Refraction wall 1.4x, a 400-damage bullet through it did 600 with Amplifier and grew it to 1.5x, a miss and a blocked bullet did nothing, 6 more hits maxed it, Supernova hit when it faded; explosions 1,000 → 1,500, bullets unchanged; Bandolier: 6 grenades after a round end and after Max Ammo, Monkey Bombs 1 → 2 at round end and 4 on Max Ammo; Chain Reaction hurt a zombie next to an explosive kill. Menu: page 6 / 8 show PERK UNLOCK tiles; Armory → Research lists both tracks. `test/reaper-pass.test.mjs`.

## Where things are

- **Catalogue (tracked)**: `export/web/mods/perks-plus/reaper-perks.json`. Per perk: `name`, `specialty` (the mod's id, e.g. `specialty_cashback`), `origin`, `new` (false = Melon Zombies already has it), `status` (`working, switched off`), `effect`, `upgrade` (the mod author's "All Perks" sheet, lightly tidied), `source` (BO3/mod asset names: machine model, HUD icon image, bottle label image, jingle/sting path). Edit names and effects here.
- **Assets (git-ignored, ripped mod art: never in Rind's OWN list)**: `export/web/mods/perks-plus/reaper/` (`machines/*.glb`, `bottles/<id>.glb`, `icons/<id>.webp`, `audio/<id>_{jingle,sting}.ogg`, `perks.json` = asset index with machine bounds), built by `python3 .tools/build_reaper_perks.py [--only id,id]` from the catalogue. How the assets were extracted (Greyhound, the mod's xpaks linked into BO3's `zone/`, sound banks): gameplay.md, "Reaper Collection perks: extracted assets".
- **Source mod**: REAPER COLLECTION REBUILT, Steam workshop 3814067303 (Logical Reaper; machines for Blaze Phase and Repairman Rum by BetiroVal, Zombshell by ChickenHatMan; MadGaz's perks: Banana Colada, Bull Ice Blast, Crusader's Ale, Madgaz Moonshine). Its perk scripts (`scripts/zm/logical/perks/_zm_perk_<x>.gsc`) are compiled and weren't decompiled, so exact numbers (radii, damage, timers) are unknown: the effect text is all there is, and every number below that isn't in it is a suggestion.
- **Origin**: the game the perk first appeared in where known (BO2 = Black Ops II, BO4 = Black Ops 4, CW = Cold War, BO6/BO7, IW = Infinite Warfare); `custom` = made by the mod's author or another modder.

## Hooks available for implementing them

Events (`host.on`): `kill`, `beforeEnemyDamage` (change `e.amount`, `e.cause`: bullet/melee/explosion/operator...), `beforeDamage` (player damage), `beforePoints` (`{amount}` only), `roundEnd`, `reset`, `update`; the movement mod's `slide`, `dive`, `diveLand`, `walljump`, `fall`. Perk table: `world.perkInfo` (perks-plus `MORE_PERKS`, as the BO7 perks do), drinks in perks-plus `data.json` `perkDrinks`, stings via `audio.manifest`. Existing systems several perks lean on: the rocket shield (`kino.rocketShield`), operator weapons (`kino.operator`), ammo mods (`mods/ammo-mods`, `TUNE`), the fx mod (`kino.fx.explosion/burn/strike/blood`), power-ups (engine `powerups`), the Mystery Box (`mystery-box.js`), co-op downs (`mods/multiplayer`). **Missing systems** some perks need: player armour (Stone Cold Stronghold), a double jump outside Der Eisendrache (Bull Ice Blast), friendly AI (Blood Wolf Bite, Who's Who's clone), power-up rerolls (Miracle Hands Mocha), firing while sprinting (Tactiquilla), solo downs (Tombstone, Who's Who, Fighter's Fizz, Downer's Delight, Nuka Cola: solo going down is game over since 2026-10-08).

## Summary

| Perk | id | Origin | Effect (short) | Assets |
|---|---|---|---|---|
| Banana Colada | `banana` | custom (MadGaz) | Sliding leaves a yellow trail that zombies slip and die on | bottle jingle |
| Bandolier Bandit | `bandolier` | Black Ops 4 | Extra ammo for all weapons | bottle  |
| Blaze Phase | `blazephase` | Black Ops 4 | Crouching charges up fire | bottle  |
| Blood Bullets | `bloodbullets` | custom | Ammo in the active gun slowly regenerates (clip size sets the rate) | bottle jingle |
| Blood Wolf Bite | `bloodwolf` | custom | Dealing a lot of damage quickly spawns a friendly wolf that hunts zombies | bottle  |
| Bubble Blink Blast | `bubbleblink` | custom | Melee the air while sprinting to teleport forward, leaving a decoy afterimage | -  |
| Bull Ice Blast | `bull_ice` | custom (MadGaz) | Double jump, then crouch in the air to slam down and blast zombies into ice | bottle jingle |
| Cashback Cocktail | `cashback` | custom | 20% cash back on any purchase | bottle jingle |
| Change Chews | `changechews` | Infinite Warfare | Headshots can trigger one of 4 elemental explosions | bottle jingle |
| Crusader's Ale | `crusade` | custom (MadGaz) | Double melee points, more knife damage, the shield repairs itself between rounds | bottle jingle |
| **Dam-A-Nade** (implemented) | `damnade` | custom | Stronger explosives, one more lethal and tactical | bottle jingle |
| Downer's Delight | `downers` | custom | Double bleed-out time | bottle jingle |
| Dying Wish | `dyingwish` | Black Ops 4 | Negates death for 9 s on 1 health (5 min cooldown) | bottle  |
| Electric Cherry | `electriccherry` | Black Ops II | Reloading releases an electric burst | bottle  |
| Estatic Elixir | `estatic` | custom | Sprinting builds an electric charge that stuns nearby zombies | bottle jingle |
| Ethereal Razor | `razor` | Black Ops 4 | Melee hits several zombies, deals much more damage and heals | bottle  |
| Fighter's Fizz | `ffyl` | custom | Keep your gun when downed | bottle jingle |
| Guardian Angel Ale | `guardianangel` | custom | Taking damage grants 5 s of invincibility | -  |
| I.C.U. | `icu` | custom | Faster health regen, speed boost at low health, invincible while doing actions | bottle jingle |
| Inciner-Brandy | `inferno` | custom | Chance to ignite zombies (damage over time) | bottle  |
| Madgaz Moonshine | `moonshine` | custom (MadGaz) | Sliding makes an explosion (20 a round) | bottle jingle |
| Magnet Margarita | `magnet` | custom | Power-ups drift toward the nearest player with this perk, stopping short of them | bottle  |
| Miracle Hands Mocha | `mh_mocha` | custom | Faster equipment use | bottle jingle |
| Momentum Mojito | `momentum` | custom | Sprinting builds speed | bottle jingle |
| Muscle Milk | `milk` | custom | Melee stabs chain electricity between zombies (15 s cooldown) | bottle jingle |
| Nitrogen Cooled | `nitrogen` | custom | Nearby zombies slow to a walk | bottle  |
| No Bear Brew | `nobear` | custom | No teddy bears from the Mystery Box | bottle jingle |
| Nuka Cola | `nukacola` | custom | Going down sets off a Nuke | bottle  |
| Pack-A-Box | `packbox` | custom | Chance of a Pack-a-Punched weapon from the Mystery Box | bottle  |
| PhD Flopper (Cold War) | `phdslider` | Black Ops Cold War | Sliding into zombies explodes | bottle jingle |
| Point Crusher | `pointcrusher` | custom | Can earn extra points per kill | bottle  |
| Point Polosa | `pointpolosa` | custom | Rarely, killed zombies become point fountains | -  |
| **Prismatic Punch** (implemented) | `prismatic` | custom | Kills raise an energy wall that ricochets bullets toward zombies | bottle  |
| Repairman Rum | `repairman` | custom | Instant window repairs, double repair points | bottle jingle |
| Spectre Shot | `spectorshot` | custom | Switching weapons near 10+ zombies summons a spectral copy of the last gun that auto-fires | bottle jingle |
| Stone Cold Stronghold | `stronghold` | Black Ops 4 | Standing still forms a ring that builds armour over time | bottle  |
| Swarm Scotch | `swarmscotch` | custom | Some headshots and empty-clip reloads release a friendly insect swarm that damages zombies | bottle  |
| Tactiquilla Sangria | `tactiquilla` | custom | Fire while sprinting, chance to regain fired ammo, multi-kills give bonus points | bottle jingle |
| Timeslip | `timeslip` | Black Ops 4 | Faster Mystery Box spins and Pack-a-Punch | bottle  |
| Tombstone | `tombstone` | Black Ops II | Solo: when downed, sacrifice all but one random gun to revive. Co-op: bleeding out leaves a stash of perks and weapons for 1 minute after respawn | - jingle |
| Victorious Tortoise | `victorious` | Black Ops 4 | A held shield blocks damage from every direction and explodes when destroyed | bottle  |
| Vigor Rush | `vigor` | custom | Bullet hits on zombies make small explosions | bottle  |
| Who's Who | `whoswho` | Black Ops II | Going down spawns a clone you control with the gun you held | - jingle |
| Winter's Wail | `winterwail` | Black Ops 4 | Getting hurt slows and freezes nearby zombies (3 uses) | bottle  |
| Zombshell | `zombshell` | Black Ops 4 | Shooting a zombie can create a slowing field that also weakens zombies | bottle  |

## The 45 new perks

### Banana Colada (`banana`)

- **Mod id**: `specialty_banana` · **Origin**: custom (MadGaz)
- **Effect**: Sliding leaves a yellow trail that zombies slip and die on.
- **Upgrade** (the mod's double-buy): Perk damage is doubled.
- **Assets**: machine `vending_banana_colada`, bottle, icon, jingle + sting.
- **As built**: Sliding (movement mod's `kino.movement.state.sliding`) drops a yellow slick every 0.12 s that lasts 6 s (radius 30); a zombie crossing one is frozen 0.5 s and takes 0.35 zh (0.7 upgraded), once per slick per 0.5 s.
- **Implementation notes (before building)**: Needs the movement mod's `slide` event and a floor decal trail (sampled feet positions, faded after a few seconds). Zombies crossing it: a slip (stagger) then a kill; the BO3 script's numbers aren't readable, so pick a trail lifetime and a damage. Upgrade = double damage.

### Bandolier Bandit (`bandolier`)

- **Mod id**: `specialty_bandolier` · **Origin**: Black Ops 4
- **Effect**: Extra ammo for all weapons.
- **Upgrade** (the mod's double-buy): Stowed weapons slowly refill their clips.
- **Assets**: machine `cz_zombie_vending_bandolier`, bottle, icon, **no jingle**.
- **As built**: Any gun whose reserve reaches its max (a refill) is topped up to 1.5x max. Upgraded: every 3 s each stowed gun moves one round from reserve into its magazine.
- **Implementation notes (before building)**: Simple: raise `maxAmmo` (reserve) for every gun the player holds while the perk is held (and on pick-up), restore on loss. Upgrade: a timer that tops up stowed guns' `mag` from reserve. Touches `session.inventory` only.

### Blaze Phase (`blazephase`)

- **Mod id**: `specialty_blazephase` · **Origin**: Black Ops 4
- **Effect**: Crouching charges up fire; standing releases it and flings you forward, igniting zombies.
- **Upgrade** (the mod's double-buy): Charges further and explodes when stopped.
- **Assets**: machine `p7_zm_vending_blazephase_on`, bottle, icon, **no jingle**.
- **As built**: Hold crouch while standing still and not sprinting to charge (up to 1.5 s, 3 s upgraded; chip BLAZE %). Releasing after 0.4 s or more launches you forward (520 x charge, up to 2x) and up; for 0.5-0.8 s zombies within 70 of you burn (4 s, 0.25 zh/s) and take 0.3 zh. Upgraded: an explosion where the run ends (radius 180, 1.2 zh).
- **Implementation notes (before building)**: Movement: holding crouch charges (UI meter), releasing launches the player forward (like the dive, `player.velocity`) and sets zombies along the path burning (the fx mod has `burn`). Upgrade: longer charge, an explosion at the end (`kino.fx.explosion`). Conflicts with crouch/slide keys: decide a hold time so plain crouching doesn't fire it.

### Blood Bullets (`bloodbullets`)

- **Mod id**: `specialty_bloodbullets` · **Origin**: custom
- **Effect**: Ammo in the active gun slowly regenerates (clip size sets the rate); not wonder weapons except the Ray Gun.
- **Upgrade** (the mod's double-buy): Occasionally affects stowed weapons and wonder weapons.
- **Assets**: machine `cz_zombie_vending_blood_bullets`, bottle, icon, jingle + sting.
- **As built**: The gun in hand gains a round from reserve every 12/clip seconds (0.3-3 s), not wonder weapons except the Ray Gun. Upgraded: wonder weapons too, and every 4 s a random stowed gun gains one.
- **Implementation notes (before building)**: A timer that adds 1 round to the held gun's `mag` from its reserve, interval scaled by clip size (bigger clip = faster). Skip wonder weapons (`weaponClass === 'Wonder weapon'`) except the Ray Gun. Upgrade: sometimes refills stowed guns and wonder weapons too.

### Blood Wolf Bite (`bloodwolf`)

- **Mod id**: `specialty_bloodwolf` · **Origin**: custom
- **Effect**: Dealing a lot of damage quickly spawns a friendly wolf that hunts zombies.
- **Upgrade** (the mod's double-buy): The wolf's kills drop mini power-ups (points, ammo, specialist power); shorter recharge.
- **Assets**: machine `cz_zombie_vending_blood_wolf_bite`, bottle, icon, **no jingle**.
- **As built**: 3 zh of damage dealt within 3 s summons the wolf (a red spectral orb) for 20 s: it runs to the nearest zombie within 900 (420/s) and bites every 0.6 s for 1.2 zh. 60 s cooldown (40 upgraded). Upgraded: 20% of its kills drop a pickup (50 points, 10% of max ammo, or 5% operator charge). The mod's whistle plays on summon.
- **Implementation notes (before building)**: Needs a friendly AI companion (none exists yet): a dog model (the hellhound rig, recoloured) that targets the nearest zombie and kills with `enemies.hurt`. Trigger: damage dealt within a short window over a threshold (`beforeEnemyDamage` sums). Upgrade: mini power-ups from wolf kills (points/ammo/operator charge via `kino.operator.addCharge`) and a shorter cooldown. One of the bigger jobs.

### Bubble Blink Blast (`bubbleblink`)

- **Mod id**: `specialty_bubble_blink` · **Origin**: custom
- **Effect**: Melee the air while sprinting to teleport forward, leaving a decoy afterimage; kills recharge.
- **Upgrade** (the mod's double-buy): 2 charges, longer afterimage.
- **Assets**: machine `cz_zombie_vending_bubble_blink`, **no bottle label**, icon, **no jingle**.
- **As built**: Knife while sprinting with a charge (chip BLINK): you teleport 300 ahead (stopping short of walls, onto the walkable floor) and an afterimage stays behind for 5 s (8 upgraded) that zombies within 700 walk to. 15 kills recharge one (max 1, 2 upgraded).
- **Implementation notes (before building)**: Melee the air while sprinting forward: teleport a short distance ahead (collision-checked) and leave an afterimage that draws zombies (a decoy target, like the Monkey Bomb's lure). Kills recharge it. Upgrade: 2 charges, longer afterimage. No bottle label in the mod.

### Bull Ice Blast (`bull_ice`)

- **Mod id**: `specialty_bull_ice` · **Origin**: custom (MadGaz)
- **Effect**: Double jump, then crouch in the air to slam down and blast zombies into ice.
- **Upgrade** (the mod's double-buy): Perk range doubled.
- **Assets**: machine `vending_bull_ice_blast_on`, bottle, icon, jingle + sting.
- **As built**: Jump again in the air (once) for a second jump; crouch after it to slam down at 1400/s. Landing freezes every zombie within 160 (320 upgraded) for 3 s and deals 1 zh.
- **Implementation notes (before building)**: Needs a double jump (only Der Eisendrache's low gravity has one, `lowgrav.js`), then crouch in the air = a fast drop and a slam: zombies in a radius frozen (stopped, ice-tinted) and shattered. Upgrade: double radius. Could share the slam code with the Ragnarok's `impact`.

### Cashback Cocktail (`cashback`)

- **Mod id**: `specialty_cashback` · **Origin**: custom
- **Effect**: 20% cash back on any purchase.
- **Upgrade** (the mod's double-buy): 10% more cash back.
- **Assets**: machine `cz_zombie_vending_cashback`, bottle, icon, jingle + sting.
- **As built**: `session.spend` is wrapped: every successful purchase pays back 20% (30% upgraded) straight onto your points (not doubled by Double Points).
- **Implementation notes (before building)**: `beforePoints` doesn't cover spending; hook the purchase paths (doors, wall buys, box, perks, PaP, terminal) or wrap `session.spend`/points deductions to refund 20% (30% upgraded). Check it doesn't stack oddly with the Bank and the perk price ladder.

### Change Chews (`changechews`)

- **Mod id**: `specialty_changechews` · **Origin**: Infinite Warfare
- **Effect**: Headshots can trigger one of 4 elemental explosions; the element changes at low health.
- **Upgrade** (the mod's double-buy): Effects are stronger and last longer.
- **Assets**: machine `cz_zombie_vending_changechews_on`, bottle, icon, jingle + sting.
- **As built**: Bullet headshots have a 15% chance to set off the current element at the zombie (radius 110, 165 upgraded): fire = burn 4 s at 0.2 zh/s, ice = frozen 2.5 s, electric = 0.5 zh with a bolt and a stun, poison = a 4 s cloud at 0.15 zh/s (all x1.5 upgraded). Dropping below 40% health turns the element over (fire, ice, electric, poison; chip shows it).
- **Implementation notes (before building)**: On a headshot kill or hit, a chance for an elemental blast of the current element (4: e.g. fire/ice/electric/poison; the IW perk's elements); the element rotates when the player drops to low health. The ammo-mods system (`TUNE`, `ammoModProc`) already has fire/ice/electric-like effects to borrow. Upgrade: stronger/longer.

### Crusader's Ale (`crusade`)

- **Mod id**: `specialty_crusade` · **Origin**: custom (MadGaz)
- **Effect**: Double melee points, more knife damage, the shield repairs itself between rounds.
- **Upgrade** (the mod's double-buy): Kills can slightly heal the shield.
- **Assets**: machine `vending_crusader_ale`, bottle, icon, jingle + sting.
- **As built**: Melee damage x2, melee kills +130 points, the rocket shield is fully repaired at each round's end. Upgraded: 10% of kills repair the shield 100.
- **Implementation notes (before building)**: Melee points x2 (`beforePoints` carries only `{amount}`: pay the extra from a melee `kill` instead, cause tracked like the operator mod's `lastCause`), knife damage up (`beforeEnemyDamage` cause 'melee'), and the rocket shield (`kino.rocketShield`) repairing between rounds (`roundEnd`). Upgrade: kills heal the shield a little.

### Dam-A-Nade (`damnade`)

- **Mod id**: `specialty_damnade` · **Origin**: custom
- **Effect**: Stronger explosives, one more lethal and tactical; at round end all lethals and 1 tactical refill.
- **Upgrade** (the mod's double-buy): Even stronger explosives.
- **Assets**: machine `cz_zombie_vending_damnade`, bottle, icon, jingle + sting.
- **As built**: **implemented** (2026-10-18): see "Dam-A-Nade (implemented)" above; the upgrade is the Demolition Expert augment.
- **Implementation notes (before building)**: Grenade damage up (`beforeEnemyDamage` cause 'explosion' from the player's grenades), +1 lethal and +1 tactical capacity (the throwables mod / `session` grenade counts), refill all lethals and one tactical on `roundEnd`. Upgrade: more damage.

### Downer's Delight (`downers`)

- **Mod id**: `specialty_downersdelight` · **Origin**: custom
- **Effect**: Double bleed-out time; keep your primary weapon when downed.
- **Upgrade** (the mod's double-buy): Triple bleed-out time.
- **Assets**: machine `cz_zombie_vending_downers_delight`, bottle, icon, jingle + sting.
- **As built**: Co-op bleed-out 30 s -> 60 s (90 s upgraded): the multiplayer mod reads `kino.coopBleedMul`. Fighter's Fizz's last stand lasts as much longer. Not done: holding your primary while downed (the engine doesn't let a downed player shoot).
- **Implementation notes (before building)**: Only meaningful in co-op (solo going down is game over here): double the bleed-out time in the multiplayer mod's down state, and let the downed player keep their primary instead of the pistol. Upgrade: triple bleed-out.

### Dying Wish (`dyingwish`)

- **Mod id**: `specialty_dyingwish` · **Origin**: Black Ops 4
- **Effect**: Negates death for 9 s on 1 health (5 min cooldown); melee kills basic zombies outright meanwhile.
- **Upgrade** (the mod's double-buy): Full health after the invincibility.
- **Assets**: machine `cz_vending_dying_wish_new`, bottle, icon, **no jingle**.
- **As built**: A lethal hit leaves you on 1 health, invulnerable for 9 s (red veil, chip counts down), and melee kills basic zombies outright meanwhile; 5 min cooldown (chip). Upgraded: full health when it ends. The mod's start/end sounds play.
- **Implementation notes (before building)**: On lethal damage (`beforeDamage`): cancel it, set health to 1, 9 s of invulnerability (melee kills basic zombies outright meanwhile), then a 5 min cooldown. Has to run before Quick Revive/co-op downs. The mod's sounds `reaps_cz/dying_wish/dyingwish_{start,lp,end}_plr` are exported. Upgrade: full health afterwards.

### Electric Cherry (`electriccherry`)

- **Mod id**: `specialty_electriccherry` · **Origin**: Black Ops II
- **Effect**: Reloading releases an electric burst.
- **Upgrade** (the mod's double-buy): Larger range and more damage.
- **Assets**: machine `p6_zm_vending_electric_cherry_on`, bottle, icon, **no jingle**.
- **As built**: Starting a reload sets off a burst around you: radius 120 + 80 x how empty the magazine was, 0.3-1.3 zh with bolts, and a 1.5 s stun; 1.5 s cooldown. Upgraded: radius x1.5, damage x1.6.
- **Implementation notes (before building)**: On reload (the engine's reload start): an electric burst around the player, damage scaled by how empty the clip was (BO2's rule), stuns survivors. Upgrade: more range and damage. Visual: the fx mod's `strike`/`thunder` or the DG-2 arc.

### Estatic Elixir (`estatic`)

- **Mod id**: `specialty_estatic` · **Origin**: custom
- **Effect**: Sprinting builds an electric charge that stuns nearby zombies.
- **Upgrade** (the mod's double-buy): Every 10 stuns stores a charge (max 4); when hit, a charge stuns nearby zombies.
- **Assets**: machine `cz_zombie_vending_estatic`, bottle, icon, jingle + sting.
- **As built**: While sprinting, every 0.5 s zombies within 80 are stunned (1.2 s) and take 0.05 zh, with bolts and the mod's stun sound. Upgraded: every 10 stunned stores a charge (max 4, chip STATIC); getting hit spends one to stun everything within 200 for 2 s.
- **Implementation notes (before building)**: Sprinting builds a charge that stuns zombies near you (slow them for a moment, `z.speed`). Upgrade: every 10 stuns stores a charge (max 4) that fires automatically when you're hit (`beforeDamage`). The mod's `electric_stun` sound is exported.

### Ethereal Razor (`razor`)

- **Mod id**: `specialty_razor` · **Origin**: Black Ops 4
- **Effect**: Melee hits several zombies, deals much more damage and heals.
- **Upgrade** (the mod's double-buy): Melee damage greatly increased again.
- **Assets**: machine `cz_vending_razor_new`, bottle, icon, **no jingle**.
- **As built**: Melee x3 (x6 upgraded), and every other zombie within 100 in front of you takes the same hit; each melee hit heals 10.
- **Implementation notes (before building)**: Melee changes: hits every zombie in a short arc (not just one), large damage boost, each melee hit heals the player a little. Upgrade: more damage. Same hook points as Melee Macchiato (`bo7-perks.js`): check how the two combine if both are held.

### Fighter's Fizz (`ffyl`)

- **Mod id**: `specialty_ffyl` · **Origin**: custom
- **Effect**: Keep your gun when downed; get a kill to revive yourself and keep all perks.
- **Upgrade** (the mod's double-buy): Keep Fighter's Fizz when reviving (losing the upgrade).
- **Assets**: machine `zombie_vending_ffyl_on`, bottle, icon, jingle + sting.
- **As built**: A lethal hit starts a 10 s last stand (x2/x3 with Downer's): 1 health, invulnerable, 35% speed, red veil and a countdown chip. A kill gets you back up at full health with your perks; the perk is used up (upgraded: you keep it once, losing the upgrade). Time out and you die (or go down in co-op).
- **Implementation notes (before building)**: Fighter's Fizz (BO4 'Fight for your Life' style): when downed you keep your gun, and a kill while downed revives you with all perks. Co-op only unless solo downs come back. Upgrade: keep the perk itself after reviving (losing the upgrade).

### Guardian Angel Ale (`guardianangel`)

- **Mod id**: `specialty_guardian_angel` · **Origin**: custom
- **Effect**: Taking damage grants 5 s of invincibility; kills recharge.
- **Upgrade** (the mod's double-buy): Hits while recharging grant 0.6 s of invincibility.
- **Assets**: machine `cz_zombie_vending_guardian_angel`, **no bottle label**, icon, **no jingle**.
- **As built**: Charged (chip ANGEL READY), the next hit does nothing and you're invulnerable for 5 s (gold veil); 20 kills recharge it. Upgraded: while it recharges, every hit you take gives 0.6 s of invulnerability afterwards.
- **Implementation notes (before building)**: Taking damage (`beforeDamage`) grants 5 s of invulnerability, then it recharges from kills. Upgrade: hits while recharging give 0.6 s of invulnerability. No bottle label in the mod.

### I.C.U. (`icu`)

- **Mod id**: `specialty_icu` · **Origin**: custom
- **Effect**: Faster health regen, speed boost at low health, invincible while doing actions.
- **Upgrade** (the mod's double-buy): Invincibility and speed boost last longer.
- **Assets**: machine `zombie_vending_icu_on`, bottle, icon, jingle + sting.
- **As built**: Health regenerates 25/s on top of the usual regen once you've gone 1 s without damage; under 35% health you're 25% faster; drinking or buying makes you invulnerable. Upgraded: the speed boost and the invulnerability last 2 s longer.
- **Implementation notes (before building)**: Faster health regen (`player-health` mod), a speed boost below a health threshold (the Stamin-Up getters in perks-plus), and invulnerability while drinking/reviving/buying (`session.busy`, `session.drinking`). Upgrade: longer invulnerability and boost.

### Inciner-Brandy (`inferno`)

- **Mod id**: `specialty_inferno` · **Origin**: custom
- **Effect**: Chance to ignite zombies (damage over time); zombies killed by fire can explode.
- **Upgrade** (the mod's double-buy): Fire lasts longer.
- **Assets**: machine `cz_zombie_vending_inferno`, bottle, icon, **no jingle**.
- **As built**: Bullet hits set zombies alight 10% of the time (4 s, 6 upgraded; 0.15 zh a second, an orange glow); a burning zombie that dies explodes 25% of the time (radius 100, 0.5 zh).
- **Implementation notes (before building)**: A chance per bullet hit to set the zombie on fire (damage over time; the fx mod's `burn`), fire kills can explode (`kino.fx.explosion` + area damage). Upgrade: longer burn.

### Madgaz Moonshine (`moonshine`)

- **Mod id**: `specialty_moonshine` · **Origin**: custom (MadGaz)
- **Effect**: Sliding makes an explosion (20 a round); shot zombies can catch fire.
- **Upgrade** (the mod's double-buy): 30 slide charges, higher fire chance.
- **Assets**: machine `vending_madgaz_moonshine`, bottle, icon, jingle + sting.
- **As built**: Each slide explodes where you start it (radius 140, 1 zh), 20 a round (30 upgraded; chip SLIDES), refilled at each round's end. Bullet hits ignite 5% (10%) of the time (4 s, 0.15 zh/s).
- **Implementation notes (before building)**: Slides (`slide` event) cause an explosion at the player (no self-damage), 20 per round (counter reset on `roundEnd`); bullet hits have a chance to ignite. Upgrade: 30 slides, higher ignite chance. Overlaps PhD Flopper (Cold War); decide whether they stack.

### Magnet Margarita (`magnet`)

- **Mod id**: `specialty_magnet` · **Origin**: custom
- **Effect**: Power-ups drift toward the nearest player with this perk, stopping short of them.
- **Upgrade** (the mod's double-buy): Power-ups move twice as fast; your kills can spawn bonus power-ups.
- **Assets**: machine `cz_zombie_vending_magnet`, bottle, icon, **no jingle**.
- **As built**: Power-ups within 1500 drift toward you at 120/s (240 upgraded) and stop 90 short, so you still choose to take them. Upgraded: 2% of kills drop a bonus power-up (Nuke, Insta-Kill, Double Points or Max Ammo).
- **Implementation notes (before building)**: Power-ups on the ground drift toward the nearest player who has the perk, stopping a short distance away (move the power-up objects in `update`). Upgrade: double speed, and kills can drop bonus power-ups (`powerups.spawn`).

### Miracle Hands Mocha (`mh_mocha`)

- **Mod id**: `specialty_mh_mocha` · **Origin**: custom
- **Effect**: Faster equipment use; change a power-up up to 3 times.
- **Upgrade** (the mod's double-buy): No Carpenter or Nuke results, one more change, Max Ammo becomes a free perk bottle.
- **Assets**: machine `cz_zombie_vending_mh_mocha`, bottle, icon, jingle + sting.
- **As built**: Near a power-up (within 140), F changes it to another random type: 3 times per power-up (4 upgraded). Upgraded: never into a Carpenter or Nuke, and picking up a Max Ammo also gives you a random base perk you lack. Not done: faster equipment (throws aren't timed here).
- **Implementation notes (before building)**: Faster equipment use (throw/plant times), and an interaction on a dropped power-up that rerolls it up to 3 times. Upgrade: rerolls never give Carpenter or Nuke, a 4th reroll, and Max Ammo turns into a free perk bottle. Needs a power-up reroll hook in the engine's power-up code.

### Momentum Mojito (`momentum`)

- **Mod id**: `specialty_momentum` · **Origin**: custom
- **Effect**: Sprinting builds speed; at top speed, charged sprints damage zombies you pass (10 charges, refilled by kills; double-tap sprint toggles kill mode).
- **Upgrade** (the mod's double-buy): 15 charges, momentum starts faster with more charges, not lost when sliding.
- **Assets**: machine `p6_zm_vending_momentum_on`, bottle, icon, jingle + sting.
- **As built**: Sprinting builds momentum over 4 s (faster with charges when upgraded), up to +35% speed; it drains when you stop. At full momentum with kill mode on, zombies within 50 take 2 zh and use a charge (10, 15 upgraded; kills give them back). Double-tap Shift toggles kill mode (chip shows it). Upgraded: sliding keeps building momentum.
- **Implementation notes (before building)**: Sprinting builds speed in stages (the Stamin-Up getters); at top speed, with kill mode on, zombies you pass take damage and use a charge (10, refilled by kills). Double-tap sprint toggles kill mode. Upgrade: 15 charges, faster start, sliding keeps momentum. The mod's `momentum_activate`/`momentum_hit` sounds are exported.

### Muscle Milk (`milk`)

- **Mod id**: `specialty_milk` · **Origin**: custom
- **Effect**: Melee stabs chain electricity between zombies (15 s cooldown).
- **Upgrade** (the mod's double-buy): Chains further, shorter cooldown.
- **Assets**: machine `zombie_vending_milk_on`, bottle, icon, jingle + sting.
- **As built**: A melee hit chains lightning from that zombie to 4 more (7 upgraded) each within 150 of the last, 0.8 zh each; 15 s cooldown (8 s upgraded).
- **Implementation notes (before building)**: Melee hits chain electricity to nearby zombies (a few jumps), then a 15 s cooldown. The DG-2's chain lightning in `mods/bo3-weapons` is the model to reuse. Upgrade: longer chains, shorter cooldown.

### Nitrogen Cooled (`nitrogen`)

- **Mod id**: `specialty_nitrogen` · **Origin**: custom
- **Effect**: Nearby zombies slow to a walk.
- **Upgrade** (the mod's double-buy): Larger range.
- **Assets**: machine `cz_zombie_vending_nitrogen`, bottle, icon, **no jingle**.
- **As built**: Zombies within 250 (400 upgraded) of you move at 45% speed (bosses aren't slowed).
- **Implementation notes (before building)**: Zombies within a radius of the player are slowed to a walk (`z.speed` capped while inside, restored outside). Simple aura in `update`. Upgrade: bigger radius. Mind the Panzer and hellhounds (exclude or partly slow).

### No Bear Brew (`nobear`)

- **Mod id**: `specialty_nobear` · **Origin**: custom
- **Effect**: No teddy bears from the Mystery Box.
- **Upgrade** (the mod's double-buy): Move the box once a round; it sometimes spins free nearby.
- **Assets**: machine `p7_zm_vending_nobear_on`, bottle, icon, jingle + sting.
- **As built**: The Mystery Box never rolls the teddy bear for you (it still spins a weapon). Upgraded: 25% of spins are refunded (free). Not done: moving the box once a round.
- **Implementation notes (before building)**: Mystery Box: no teddy bear (move) result while the player has it (`mystery-box.js` roll). Upgrade: the player can move the box once a round, and the box sometimes spins free when they're near. Needs box hooks; the Fire Sale and gobblegums touch the same code.

### Nuka Cola (`nukacola`)

- **Mod id**: `specialty_nukacola` · **Origin**: custom
- **Effect**: Going down sets off a Nuke.
- **Upgrade** (the mod's double-buy): Picking up a power-up can spawn another (always with Nukes).
- **Assets**: machine `cz_zombie_vending_nuka_cola`, bottle, icon, **no jingle**.
- **As built**: Dying (solo) or going down (co-op) with it sets off a Nuke (the engine's own pickup, `powerups.onCollect('nuke')`). Upgraded: picking up a power-up spawns another random one 25% of the time, always after a Nuke.
- **Implementation notes (before building)**: When the player goes down (co-op) or would die, a Nuke power-up goes off (`powerups` nuke). Upgrade: picking up a power-up can spawn another one, always for Nukes. Solo: decide whether it fires on the game-over hit.

### Pack-A-Box (`packbox`)

- **Mod id**: `specialty_packbox` · **Origin**: custom
- **Effect**: Chance of a Pack-a-Punched weapon from the Mystery Box.
- **Upgrade** (the mod's double-buy): Higher chance; can come re-Pack-a-Punched.
- **Assets**: machine `cz_zombie_vending_packbox`, bottle, icon, **no jingle**.
- **As built**: A weapon taken from the box comes Pack-a-Punched 15% of the time (30% upgraded), full magazine and reserve. Not done: double Pack-a-Punch.
- **Implementation notes (before building)**: Mystery Box: a chance the box gives the weapon already Pack-a-Punched (set `upgraded` on the taken weapon). Upgrade: higher chance, and it can come double-Packed (the weapon-levels/PaP tiers if any).

### PhD Flopper (Cold War) (`phdslider`)

- **Mod id**: `specialty_phdslider` · **Origin**: Black Ops Cold War
- **Effect**: Sliding into zombies explodes; immune to explosive damage.
- **Upgrade** (the mod's double-buy): More damage from higher drops and longer slides.
- **Assets**: machine `cz_zombie_vending_da_phd_slider`, bottle, icon, jingle + sting.
- **As built**: During a slide, the first zombie within 50 sets off an explosion (radius 160, 1.5 zh, purple, the mod's sound). Upgraded: up to +100% from the slide's length (400) and another +100% from a drop (200). It also counts as BO1's PhD Flopper for every `specialty_flakjacket` check (no self-explosive damage, no fall damage, and BO1's dive flop too).
- **Implementation notes (before building)**: The Cold War PhD (Melon Zombies has BO1's dive PhD as `specialty_flakjacket`): sliding into zombies explodes, explosive immunity. Upgrade: more damage from higher drops and longer slides. Decide: a separate perk, or a mode of the existing PhD. The mod's slide charge/explode sounds are exported.

### Point Crusher (`pointcrusher`)

- **Mod id**: `specialty_point` · **Origin**: custom
- **Effect**: Can earn extra points per kill.
- **Upgrade** (the mod's double-buy): Chance to double the extra points.
- **Assets**: machine `cz_vending_point_crusher`, bottle, icon, **no jingle**.
- **As built**: 30% of kills pay 10-50 extra points (upgraded: a quarter of those double).
- **Implementation notes (before building)**: On `kill` (`beforePoints` has no kill flag): a chance of extra points per kill via `session.addPoints`. Upgrade: a chance to double the extra. Pick numbers (BO's 'Point Crusher' isn't official).

### Point Polosa (`pointpolosa`)

- **Mod id**: `specialty_point_polosa` · **Origin**: custom
- **Effect**: Rarely, killed zombies become point fountains.
- **Upgrade** (the mod's double-buy): Zombies can drop 10 s mini Double Points.
- **Assets**: machine `cz_zombie_vending_point_polosa`, **no bottle label**, icon, **no jingle**.
- **As built**: 3% of kills leave a gold point fountain for 8 s: standing within 70 pays 10 points every 0.25 s. Upgraded: 4% of kills give you 10 s of personal Double Points (chip 2X).
- **Implementation notes (before building)**: Rarely, a killed zombie becomes a point fountain: a spot that pays points to whoever stands near for a few seconds. Upgrade: zombies can drop a 10 s mini Double Points. No bottle label in the mod.

### Prismatic Punch (`prismatic`)

- **Mod id**: `specialty_prismatic_punch` · **Origin**: custom
- **Effect**: Kills raise an energy wall that ricochets bullets toward zombies; shooting it grows it (extra ricochet at max).
- **Upgrade** (the mod's double-buy): Bigger wall, longer at max, more stray ricochets.
- **Assets**: machine `cz_zombie_vending_prismatic_punch`, bottle, icon, **no jingle**.
- **As built**: **implemented** (2026-10-18): see "Prismatic Punch (implemented)" above. The wall now reacts to the engine's `shot` event (it was a `world.addShootTarget`, which only custom maps have); the upgrade is split into the Refraction and Afterglow augments.
- **Implementation notes (before building)**: Kills raise an energy wall (a translucent plane) for a while; bullets passing through it ricochet to a nearby zombie (a second `rayHit` from the wall); shooting the wall grows it, and at max size it adds a ricochet. Upgrade: bigger wall, longer at max, stray shots ricochet more. Bigger job (ray vs wall test in the shot path). The mod's activate/max-size/ricochet sounds are exported.

### Repairman Rum (`repairman`)

- **Mod id**: `specialty_repairman` · **Origin**: custom
- **Effect**: Instant window repairs, double repair points; boards you repaired explode when torn off.
- **Upgrade** (the mod's double-buy): 4x repair point cap; Carpenter gets every effect and double points.
- **Assets**: machine `cz_vending_repairman_on`, bottle, icon, jingle + sting.
- **As built**: `world.setBoards` is wrapped: one repair press within 220 rebuilds the whole window and pays 20 per board (within the round's cap, 4x upgraded); boards rebuilt that way explode when a zombie tears them off (radius 120, 2 zh). Upgraded: a Carpenter marks every window's boards and pays 20 per board.
- **Implementation notes (before building)**: Barricades: rebuilding a window finishes instantly and pays double, boards rebuilt with the perk explode when a zombie tears them off (area damage at the window). Upgrade: 4x the per-round repair point cap; Carpenter pays double and applies the perk to every window. Needs window/board hooks in the engine (barrier code).

### Spectre Shot (`spectorshot`)

- **Mod id**: `specialty_spectorshot` · **Origin**: custom
- **Effect**: Switching weapons near 10+ zombies summons a spectral copy of the last gun that auto-fires; hits slow, kills refill that gun.
- **Upgrade** (the mod's double-buy): Spectral hits deal bonus damage and go for heads; longer, faster cooldown.
- **Assets**: machine `cz_vending_spectorshot_on`, bottle, icon, jingle + sting.
- **As built**: Switching guns with 10+ zombies within 600 summons a translucent copy of the gun you put away (the box's display model) at your shoulder for 8 s (12 upgraded): every 0.35 s it shoots the nearest zombie in sight within 900 for 1.5x the gun's damage (3x and headshots upgraded) and slows it; its kills put 20% of a magazine back in that gun. 30 s cooldown (20).
- **Implementation notes (before building)**: Switching weapons with 10+ zombies near summons a ghost copy of the previous gun that floats beside you and auto-fires at zombies for a few seconds (slowing what it hits; its kills refill that gun's ammo). Upgrade: bonus damage, aims for heads, longer, shorter cooldown. Needs a floating weapon model (the world model, translucent) and an auto-target loop.

### Stone Cold Stronghold (`stronghold`)

- **Mod id**: `specialty_stronghold` · **Origin**: Black Ops 4
- **Effect**: Standing still forms a ring that builds armour over time.
- **Upgrade** (the mod's double-buy): Armour builds faster and lingers after leaving the ring.
- **Assets**: machine `cz_zombie_vending_stronghold_on`, bottle, icon, **no jingle**.
- **As built**: Standing still for 1 s raises a ring under you and builds armour 20/s (35 upgraded) up to 150 (chip ARMOUR); armour soaks damage before health (outermost damage wrapper, the mod's hit/break sounds). Moving drains it 30/s (upgraded: it holds 10 s first).
- **Implementation notes (before building)**: Standing still builds a ring on the floor and armour over time; there's no player armour yet, so it needs an armour bar (absorbs damage before health, `beforeDamage`). Upgrade: faster, and the armour lingers when leaving the ring. The mod's `armour_hit`/`armour_broken` sounds are exported.

### Swarm Scotch (`swarmscotch`)

- **Mod id**: `specialty_swarmscotch` · **Origin**: custom
- **Effect**: Some headshots and empty-clip reloads release a friendly insect swarm that damages zombies.
- **Upgrade** (the mod's double-buy): Swarm survivors spawn swarms more often; more swarm damage.
- **Assets**: machine `cz_zombie_vending_swarmscotch`, bottle, icon, **no jingle**.
- **As built**: 20% of headshot kills, and every reload of an empty magazine, release a swarm (dark motes) that follows you for 8 s, biting zombies within 120 every 0.5 s for 0.15 zh (0.25 upgraded). Upgraded: a bitten zombie that's headshot later releases another swarm 40% of the time.
- **Implementation notes (before building)**: Some headshots and reloading an empty clip release a swarm (particles) that follows the player and damages nearby zombies for a while. Upgrade: zombies that survive a swarm spawn swarms more often, more damage. Particles via the fx mod.

### Tactiquilla Sangria (`tactiquilla`)

- **Mod id**: `specialty_tactiquilla` · **Origin**: custom
- **Effect**: Fire while sprinting, chance to regain fired ammo, multi-kills give bonus points.
- **Upgrade** (the mod's double-buy): Higher ammo chance, doubled multi-kill rewards.
- **Assets**: machine `xela_perk_tactiquilla_on`, bottle, icon, jingle + sting.
- **As built**: Fire while sprinting (engine.js asks the mod host's `sprintFire()`), 15% of shots (30% upgraded) put the round back, and kills within 0.5 s of each other pay 50 per extra kill (100 upgraded).
- **Implementation notes (before building)**: Fire while sprinting (engine.js only fires when `!sprint`: needs a perk check there or a `mods.holdFire`-style hook), a chance to refund a fired round, bonus points for multi-kills (kills within a short window). Upgrade: higher refund chance, double multi-kill points.

### Timeslip (`timeslip`)

- **Mod id**: `specialty_timeslip` · **Origin**: Black Ops 4
- **Effect**: Faster Mystery Box spins and Pack-a-Punch.
- **Upgrade** (the mod's double-buy): Faster special-weapon recharge, instant box spins.
- **Assets**: machine `cz_vending_timeslip2`, bottle, icon, **no jingle**.
- **As built**: Box spins and the Pack-a-Punch wait take half as long. Upgraded: box spins finish at once, and kills add 50% more operator weapon charge and class skill charge.
- **Implementation notes (before building)**: Faster Mystery Box spin and Pack-a-Punch (shorten their timers in `mystery-box.js` / the PaP sequence). Upgrade: faster operator weapon / class skill recharge (`kino.operator`, classes), instant box spins.

### Tombstone (`tombstone`)

- **Mod id**: `specialty_tombstone` · **Origin**: Black Ops II
- **Effect**: Solo: when downed, sacrifice all but one random gun to revive. Co-op: bleeding out leaves a stash of perks and weapons for 1 minute after respawn.
- **Upgrade** (the mod's double-buy): Co-op: the stash doesn't start fading until the round after respawn.
- **Assets**: machine `cz_zombie_vending_da_tombstone`, **no bottle label**, icon, jingle + sting.
- **As built**: Solo: a lethal hit keeps one random gun, takes the rest, and puts you back up at full health; the perk is used up. Co-op: if you bleed out (the multiplayer mod's `kino.coopDown.dead`), the perks and guns you had stay in a grey tombstone where you fell; after you respawn you have 60 s to press F at it (upgraded: until the end of that round, then 60 s).
- **Implementation notes (before building)**: Solo: when you'd die, sacrifice all guns but one (random) to get back up. Co-op: bleeding out leaves a tombstone holding your perks and guns that you can pick up after respawning for 1 minute. Upgrade (co-op): the stash doesn't start fading until the round after. Interacts with the multiplayer mod's downs.

### Victorious Tortoise (`victorious`)

- **Mod id**: `specialty_victorious` · **Origin**: Black Ops 4
- **Effect**: A held shield blocks damage from every direction and explodes when destroyed.
- **Upgrade** (the mod's double-buy): Double shield health.
- **Assets**: machine `cz_vending_victorious`, bottle, icon, **no jingle**.
- **As built**: The rocket shield (`kino.rocketShield.perk`) blocks hits from every side while raised, and explodes when it breaks (radius 200, 3 zh). Upgraded: double shield health (3000).
- **Implementation notes (before building)**: The rocket shield (`kino.rocketShield`) blocks damage from every direction while raised, and explodes (area damage) when it breaks. Upgrade: double shield health. Only does anything if the player has a shield.

### Vigor Rush (`vigor`)

- **Mod id**: `specialty_vigor` · **Origin**: custom
- **Effect**: Bullet hits on zombies make small explosions.
- **Upgrade** (the mod's double-buy): Double explosion damage.
- **Assets**: machine `km_zm_vending_vigor_rush_on_vm`, bottle, icon, **no jingle**.
- **As built**: Bullet hits on zombies burst at the hit (radius 60, 30% of the hit's damage, at least 50; x2 upgraded), at most one burst every 0.05 s (shotguns).
- **Implementation notes (before building)**: Bullet hits on zombies make a small explosion at the hit point (small radius area damage, no self-damage). Upgrade: double explosion damage. Simple via `beforeEnemyDamage` cause 'bullet'.

### Who's Who (`whoswho`)

- **Mod id**: `specialty_whos_who` · **Origin**: Black Ops II
- **Effect**: Going down spawns a clone you control with the gun you held; reviving your body restores your perks.
- **Upgrade** (the mod's double-buy): Your downed body keeps shooting; the clone has all your weapons.
- **Assets**: machine `cz_zombie_vending_whoswho`, **no bottle label**, icon, jingle + sting.
- **As built**: A lethal hit leaves your body (a blue glowing figure) where you fell and puts you 420 away, at full health, with only the gun you held (all of them upgraded) and no perks. Press F at your body within 30 s to get your perks and guns back; otherwise the perks are gone. Upgraded: your body shoots the nearest zombie every 0.5 s (0.3 zh).
- **Implementation notes (before building)**: Co-op downs: going down spawns a controllable clone near your body, holding the gun you had; reviving your own body restores your perks. Upgrade: the downed body keeps shooting, the clone has all your guns. The biggest job of the list (a second player body, camera swap). Solo needs a rule for what going down means.

### Winter's Wail (`winterwail`)

- **Mod id**: `specialty_winterwail` · **Origin**: Black Ops 4
- **Effect**: Getting hurt slows and freezes nearby zombies (3 uses).
- **Upgrade** (the mod's double-buy): One more charge; the effect lingers.
- **Assets**: machine `cz_zombie_vending_winterswail`, bottle, icon, **no jingle**.
- **As built**: Taking damage freezes every zombie within 200 for 3 s (5 upgraded) with the mod's freeze sound; 3 charges (4 upgraded; chip WAIL), at most one every 2 s, one back at each round's end.
- **Implementation notes (before building)**: When the player is hurt (`beforeDamage`): zombies nearby are slowed and frozen (ice tint) for a few seconds; 3 uses (restore on a schedule or per round?). Upgrade: a 4th charge and the freeze lingers. The mod's `cryofreeze` sound is exported.

### Zombshell (`zombshell`)

- **Mod id**: `specialty_zombshell` · **Origin**: Black Ops 4
- **Effect**: Shooting a zombie can create a slowing field that also weakens zombies.
- **Upgrade** (the mod's double-buy): Zombies ignore you while you stand in the field.
- **Assets**: machine `cz_vending_zombshell`, bottle, icon, **no jingle**.
- **As built**: 8% of bullet hits leave a green field where the zombie stood (radius 120, 6 s, the mod's sound): zombies in it move at 40% and take +30% damage. Upgraded: while you stand in one, zombies ignore you.
- **Implementation notes (before building)**: Shooting a zombie can leave a slow-down field where it stands (a few seconds): zombies inside are slowed and take extra damage. Upgrade: zombies ignore the player while the player stands in it (targeting, `enemies` `targetFor`). The mod's zombshell sounds are exported.

## Perks Melon Zombies already has (assets only)

Also in the mod and the catalogue (`new: false`), for their machines and jingles: none of these had a machine model before.

- **Vulture Aid** (`vultureaid`, Black Ops II): Already in Melon Zombies (`bo7-perks.js`). New from the mod: its BO2 machine (`p6_zm_vending_vultureaid_on`), bottle label, jingle/sting and the vulture power-up/stink sounds. Assets: machine `p6_zm_vending_vultureaid_on`, bottle, icon, jingle + sting.
- **Widow's Wine** (`widowswine`, Black Ops III): Already in Melon Zombies (`bo7-perks.js`). New: BO3's machine (`p7_zm_vending_widows_wine`) and a bottle; no jingle in the mod. Assets: machine `p7_zm_vending_widows_wine`, bottle, icon, **no jingle**.
- **Wisp Tea** (`wisptea`, Black Ops 7): Already in Melon Zombies (`bo7-perks.js`). New: a machine, bottle label, jingle/sting and the wisp loop sound. Assets: machine `cz_vending_wisp_tea`, bottle, icon, jingle + sting.
- **Death Perception** (`deathperception`, Black Ops Cold War): Already in Melon Zombies (`bo7-perks.js`). New: its machine (BO6-style), bottle label, jingle/sting. Assets: machine `cz_zombie_vending_da_death_perception`, bottle, icon, jingle + sting.
- **Elemental Pop** (`elementalpop`, Black Ops 4): Already in Melon Zombies (`bo7-perks.js`). New: its machine, bottle label, jingle/sting. Assets: machine `cz_zombie_vending_elemental_pop`, bottle, icon, jingle + sting.
- **Melee Macchiato** (`meleemacchiato`, Black Ops 6): Already in Melon Zombies (`bo7-perks.js`). New: its machine, bottle label, jingle/sting and 10 punch sounds. Assets: machine `cz_vending_melee_macchiato`, bottle, icon, jingle + sting.

Not catalogued: the mod's versions of Juggernog, Speed Cola, Double Tap 2.0, Quick Revive, Stamin-Up, Deadshot and Mule Kick (Melon Zombies has them, with BO3 machines already); the sheet's upgrade text for those is in the sheet only.
- Mod upgrades for existing perks, if wanted later (from the sheet): Juggernog: survive a fatal hit twice a round; Speed Cola: bullet damage up after a reload; Double Tap 2.0: damage ramps while firing; Quick Revive: speed boost after healing; Stamin-Up: unlimited sprint, fire while sprinting; Deadshot: headshot kill = 2 s of all-headshot damage, 4 in a row = double headshot damage; Mule Kick: a lost weapon comes back when re-bought; Widow's Wine: spider power-ups from un-webbed zombies; Vulture Aid: double vulture rewards, longer stink; Wisp Tea: faster cooldown, longer wisp; Death Perception: longer range, extra head damage to non-zombies; Elemental Pop: more often; Melee Macchiato: punches hit up to 3.

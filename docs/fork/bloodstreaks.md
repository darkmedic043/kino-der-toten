# Bloodstreaks (`mods/bloodstreaks`, 2026-11-22)

User: scorestreaks renamed Bloodstreaks, the Rake Trap first; "blood streaks should be expensive, so dont make anything
absurdly cheap", "id want it to need to be unlocked from nuketown originally", kept in the in-game Armory for now,
"augment leveling would be really good for this to", and "cut out the nuketown rake" (Nuketown's own rake code is gone:
its stations hand out the shared rake).

## The meter (`mods/bloodstreaks/mod.js`, `window.kino.bloodstreaks`)

- Kills fill one blood meter: **1** a kill, **+0.5** a headshot, **+1** a melee kill. Kills a teammate gets credit for on
  the host (`kill` event with `remote`) don't count; kills by your own rakes don't either (`kino.rakes.takeTrapKill()`
  eats them: the `rakeHit` sync event arrives before the kill), except through the Blood Harvest augment.
- The equipped streaks' costs are thresholds on that one meter, cheapest first, as in Black Ops: passing a cost earns that
  streak; reaching the dearest one starts the meter over and the blood past it carries.
- Earned streaks are banked, **2 of each at most**, on the command wheel (hold U, `kino.commandWheel` provider
  `bloodstreaks`) until used. Not while you are down.
- **Going down drains the whole meter** (toast "Bloodstreak meter drained"); banked streaks are kept (a default: the user
  didn't pick one). A restart (`reset`) clears the meter and the bank.
- HUD `#bloodstreaks`: a column on the right (top 40%), one box per equipped streak with its icon, filling with blood
  toward its cost (`--f` + `clip-path`, no blur), a badge when one is banked, and `x / 60 BLOOD` under it. Painted at load
  in `warmHud`. Hidden with nothing equipped.
- API: `blood`, `earned`, `slots`, `add(n)`, `refresh()` (the Armory calls it on equip), `give(id)`, `active(id)` (Research
  counts a streak as active while you have rakes in hand or down: ×activeMul research XP).

## Unlocking and equipping (`mods/armory`, ARMORY.EXE)

- Items with `streak: true` in the `streaks` tab (BLOODSTREAKS). The Rake Trap: `cost: 60` blood, found by **building the
  Rake Trap on Nuketown and taking a rake** (`kino.armory.found('rake_trap')` from `nuketown/buildables.js`), then
  **100 kills with your rakes** (`kino.armory.kill('rake_trap', n)` from `rake.js`).
- Never bought: once unlocked, clicking equips it or takes it off. **3 slots** (`MAX_STREAKS`), stored in
  `kino.mods.armory.streaks` (ids; `equippedStreaks()` returns the unlocked ones sorted by cost). Unlocking auto-equips
  when a slot is free.
- Idea given to the user for later: a main-menu Armory → Bloodstreaks tab editing the same `streaks` list (maybe per
  Armory preset), so they could be set before a match.

## The rakes (`mods/bloodstreaks/rake.js`, `window.kino.rakes`)

- Model: Nuketown's `nt_rake_trap` cut out of `~/projects/waw-nuketown` by `.tools/build_nuketown_rake.py` into the
  git-ignored `mods/maps/nuketown/rake/` (rake.glb with the skin stripped: handle end at the origin, head 71.3 along +z;
  the colour maps as webp; `icon.webp` = `hud_icon_rake_trap`). Ripped: never publish, never in Rind's `OWN` list.
- A pool of 16 (`RAKE`), each a group + tilt group, `noVisCull`, one in `host.warmObjects`. Placed with the claymore key
  (wraps `features.placeClaymore` while `hand > 0`): head ahead of you, handle back to your feet. Five down per player;
  a placed one can be picked up (F). Breaks after 20 hits (`rake_hit_0x`, `zombie_shield_break` sounds from
  `maps/nuketown/sounds/`).
- Co-op through `der-eisendrache/sync.js`: `rakePlace` (carries the placer's augments `a`), `rakeTake`, `rakeHit`. The
  host finds zombies and kills them with `sync.hurt(..., {head:true, cause:'trap'})`.
- The streak gives **3 rakes** (+Tool Shed). Nuketown's stations give one at a time (only with none in hand).

## Research (`research.json` kind `bloodstreak`, tab BLOODSTREAKS)

`armory: 'rake_trap', armoryKills: 100`: the track can't be started (`armoryLocked()` in `research.js`, which reads the
armory store directly) and research doesn't advance onto it until the streak is unlocked. Effects go into the
equipment pool (`kino.equipAug('rake.*')`).

| # | Augment | Kind | Effect |
|---|---|---|---|
| 1 | Long Handle | minor | `rake.reach` .25: 25% more reach |
| 2 | Whiplash | major | `rake.sweep` 2: up to 2 more zombies within 70 die with the swing |
| 3 | Hardwood | minor | `rake.uses` .5: 30 hits |
| 4 | Live Wire | major | `rake.shock` 2.5: stuns zombies within 140 for 2.5 s |
| 5 | Hair Trigger | minor | `rake.reset` .4: re-arms 40% sooner |
| 6 | Blood Harvest | major | `rake.blood` .25: rake kills add a quarter of their blood |
| 7 | Tool Shed | minor | `rake.extra` 1: the streak gives 4 rakes |
| 8 | Tetanus | major | `rake.bleed` .06: 6% max health a second for 4 s within 120 |

## Adding a streak

An item in the armory's `streaks` tab (`streak`, `cost`, `kills`, `home`, `findText`, `icon`), a `USE[id]` in
`bloodstreaks/mod.js` that hands it out (return false to keep it banked), an icon in `ICONS`, `found()` where it is
found, `kill()` for its kills, and a research item of kind `bloodstreak` with `armory`/`armoryKills`. Keep costs high
(the user: nothing absurdly cheap).

## Tests (2026-11-22)

- `INIT=scratch/bloodstreaks/init.js PLAY=scratch/bloodstreaks/play.js MAP=sandbox lowpri node .tools/map-test.mjs`:
  earn at 60 (1.5 carried), 4 rakes with Tool Shed, one placed, 3 zombies spawned on it all killed, 3 armory kills,
  +0.75 blood via Blood Harvest. Renderer peak 1.57 GB.
- `PLAY=scratch/bloodstreaks/nt.js MAP=nuketown` (light copy): the station gives a rake and finds the Rake Trap; Nuketown's
  tab state (`heldRake`, `rakesDown`) follows `kino.rakes`. Renderer peak 1.68 GB.

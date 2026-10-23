# Wiki (`/wiki/`, 2026-10-23)

A player-facing wiki on the game site: https://zombies.terminallysleepy.com/wiki/ (locally `127.0.0.1:5190/wiki/`).
Linked from the main menu rail (`#wiki-link` under the tabs, opens a new tab; on phones it sits top right beside the
logo). It lives outside `#tabs` on purpose: the controller's shoulder-button tab cycling clicks every `a` in a tab group,
so a link inside `#tabs` would pop the wiki open while cycling.

## How it's built

- One page, hash routes (`#/`, `#/<topic>`, `#/<topic>/<page>`, `#/search/<words>`): `export/web/wiki/index.html`,
  `wiki.js` (router, sidebar, search, home tiles), `helpers.js` (HTML builders and a shared cached `json()` fetch),
  `wiki.css` (the main menu's palette and type).
- Each section is a module in `wiki/topics/<id>.js` that builds its pages **from the game's own data files at load**
  (gums.json, classes.json, game-data.json, ...), so stats follow the game without editing the wiki. Topic contract:
  `wiki/topics/README.md`. Page ids are `slug(title)` so topics cross-link with `ctx.link(topic, slug(title))`.
- `wiki.js` `TOPICS` lists the ids in load order (a missing file is skipped with a warning); `order` sorts them.
- Rules for content: written for players (no file names, code ids, cheats or switched-off features, e.g. only the three
  implemented Reaper perks); Easter-egg steps inside `ctx.spoiler()`.
- No new assets: images are ones the menus already ship. The Rind installer picks the wiki up as code (`CODE` regex);
  it needs no `OWN` rule.

## Checking

`node .tools/wiki-check.mjs` opens the wiki headless, renders every page and reports failed or near-empty pages,
duplicate ids, links to pages that don't exist, console errors and HTTP errors. `--shots <dir> [topic]` saves a
screenshot per page, `--mobile` uses a 390 px viewport. Run it after changing a data file's shape: a topic that reads a
renamed field shows up as an empty or failed page.

## Topics (first pass, 213 pages)

basics (20: match rules, points, box, Pack-a-Punch, power-ups, downs, exfil, HUD, co-op, controls, menus), maps (10,
Easter eggs in spoilers from the journal quests), weapons (88: every obtainable gun by class, wonder and operator
weapons, equipment, plus Attachments/Camos/Weapon levels/Weapon prestige/Pack-a-Punch/Mystery Box), perks (28, incl.
the three live Reaper perks, ammo mods and Research), gobblegums (35), classes (10, full skill trees, Ante Up),
operators (10), progression (10: levels, prestige, credits, challenges, shop, journal, terminal unlocks, saving), pass
(how it works + one page per season).

Values that live only in code were copied by hand and can go stale; re-check them when those systems change:
- weapons: wall-buy lists for Sandbox, Cheese Cube, Der Eisendrache and The Giant; operator weapon numbers; Winter's
  Howl damage (its data value is a placeholder); Moon's weapon/equipment setup (the game's copy fetches
  `moon/combat-data.json` relative to the page, a 404 under /wiki/).
- basics/maps: box 950, Pack-a-Punch 5000, point awards, regen/revive timings, fall heights, exfil rules, per-map facts.
- perks: the prone 100-point bonus, Moon's 4-perk limit. The ammo mods' proc chances and cooldowns, and the Bank fee and
  Armory items (progression), are parsed out of the mods' source text, so a reformat there can hide those rows.
- classes: the casino games' rules text.

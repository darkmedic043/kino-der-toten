// Maps: one page per map on the main menu's map browser. The list, names and pictures come from the map list the menu uses,
// Easter egg steps from the in-game journal, exfil zones and terminal counts from their own data, so they follow the game.

const G = { zombies: 'Zombies maps', explore: 'Explore only' };

// Facts a player can see on each map (written by hand; numbers checked against the game).
const INFO = {
  kino: {
    origin: 'Call of Duty: Black Ops (2010)', color: '#b5372c',
    perks: ['Juggernog', 'Quick Revive', 'Speed Cola', 'Double Tap'],
    pap: 'In the projection room, reached through the stage teleporter (needs the power).',
    wonder: ['Ray Gun', 'Thundergun'],
    traps: 'Five electric traps, 1,000 points each (need the power).',
    teleporters: 'The stage teleporter to the projection room.',
    special: 'Hellhounds, gas crawlers, the Bowie Knife',
    body: L => `A ruined theater in Berlin, the first map of Black Ops zombies and the one Melon Zombies grew out of.

## Getting around

You start in the lobby. Doors open into the dressing rooms, the alleyway, the dining hall, the stage and the theater, and back round to the lobby, so the map is one big loop. The **power switch** is backstage: turn it on to wake the perk machines, the traps and the electric doors.

## The teleporter and Pack-a-Punch

1. With the power on, use the teleporter pad on the **stage**.
2. Within 30 seconds, link it at the **mainframe pad in the lobby**.
3. Use the stage pad again to teleport to the **projection room**, where Pack-a-Punch waits. After 30 seconds you are sent back to the lobby.
4. The teleporter needs about a minute and a half to cool down, then it has to be linked again.

## Traps

Five electric traps sit in doorways around the theater. Each costs 1,000 points, needs the power and burns every zombie that walks through it for a while.

## Enemies

Besides zombies and hellhound rounds, **gas crawlers** (legless zombies) leave a cloud of gas when they die that blurs your sight.

## Settings for this map

The **Daytime** setting lights the theater with sunlight, and **HD textures** give it sharper surfaces. Both are in Settings, Graphics.`,
  },
  moon: {
    origin: 'Call of Duty: Black Ops, Rezurrection (2011)', color: '#6aa7d6',
    perks: ['Juggernog', 'Quick Revive', 'Speed Cola', 'Double Tap', 'Stamin-Up', 'PhD Flopper', 'Deadshot Daiquiri', 'Mule Kick'],
    pap: 'Yes',
    wonder: ['Wave Gun', 'Ray Gun', 'Gersh Device', 'QED'],
    traps: 'None',
    teleporters: 'Between Area 51 and Griffin Station on the Moon.',
    special: 'Low gravity, air and the P.E.S., the Hacker, the astronaut, excavators',
    body: L => `A Nazi base on the Moon, Griffin Station, with a teleporter back to **Area 51** on Earth.

## Area 51

The game starts at Area 51, in No Man's Land. There is no round counter here: the horde keeps coming and grows stronger the longer you stay. Take the teleporter to the Moon when you are ready.

## On the Moon

- **Low gravity**: outside the pressurised rooms you jump higher and fall slower. Turning on the power restores normal gravity indoors.
- **Air**: the Moon's surface and depressurised rooms are a vacuum. Wear a **P.E.S.** (a space helmet, from the suit stations in Receiving Bay) or you choke. Press **P** to take it off and put it back on.
- **Excavators** dig into the base and breach its tunnels. Hold Use at an excavator's console with the Hacker to pull it back.
- **The astronaut** is a big, slow zombie in a space suit. If he grabs you, he teleports you somewhere else on the map.

## Gear

- **The Hacker** hacks things for points or favours: the Mystery Box (reroll it), perk machines, barricades (rebuild them for 100), doors (cheaper), wall guns, power-ups and Pack-a-Punch. Hacking the machine of a perk you hold gives that perk back for a refund.
- **Wave Gun**: a microwave gun that makes zombies swell and burst. Switch it to the **Zap Guns**, a pair of pistols, with the attachment key.
- **Gersh Device**: a thrown black hole that pulls zombies in.
- **QED**: a thrown quantum device with a random effect: a power-up, an explosion, free perks, a teleport, an upgraded gun, or something bad.

## Perks

All eight perk machines are here, but you can only hold **four perks** at a time on this map.`,
  },
  sandbox: {
    origin: 'Made for Melon Zombies', color: '#7cd65a',
    perks: ['Juggernog', 'Quick Revive', 'Speed Cola', 'Double Tap'],
    box: 'Two spots',
    pap: 'Yes, 5,000 points',
    traps: 'One electric trap',
    teleporters: 'A teleporter up to a sniper tower.',
    body: L => `A small practice map built from simple blocks: two rooms and seven windows, with everything a match needs packed close together.

- Wall guns, all four classic perks, a power switch and Pack-a-Punch.
- Two Mystery Box spots.
- An electric trap, and a teleporter that takes you up a sniper tower.
- A terminal, so you can try perks from other maps, ammo mods and exfil.

It is a good place to learn the basics or try a new class.`,
  },
  'cheese-cube': {
    origin: 'Call of Duty: World at War custom map', color: '#e8c33c',
    perks: ['Juggernog', 'Quick Revive', 'Speed Cola', 'Double Tap', 'PhD Flopper', 'Double-Dew'],
    box: 'One spot',
    pap: 'Yes, 5,000 points (needs the power)',
    wonder: ['Cheese Gun'],
    traps: 'The rising cheese',
    special: 'Hellhounds, moving platforms, Iron Man armor, an ending',
    body: L => `A huge hollow cube of cheese, climbed from the bottom up through **eight gated zones**. The doors get expensive as you go: from 750 points up to 10,000.

## The rising cheese

Not long after the game starts, molten cheese starts to **rise** from the bottom of the cube. Touching it kills you, so keep climbing. Moving platforms carry you between some floors.

## Power

The power switch is broken: you have to find its parts around the cube and bring them to it before the perks and Pack-a-Punch work.

## Perks

Five machines, all needing the power, plus **Double-Dew**, which does nothing at all (just like in the original map).

## The Cheese Gun

The **Cheese Gun** hangs on the wall where other maps put the MP40, for 1,000 points: a full-auto gun that hits hard (250 a shot) but cannot be Pack-a-Punched. It is the only gun that can catch the Cheese Brothers.

## Iron Man armor

Find the six armor parts around the map and bring them to the **Hall of Armors**. Then you can buy a suit and wear it: it replaces your health and your guns with the suit's, and you fly by holding **Space**.`,
    after: (ctx, num) => ctx.table(['Suit', 'Price', 'Health', 'Notes'], [
      ['Mark I', 5000, 350, 'Cannot sprint'], ['Mark III', 7500, 285, ''], ['Mark IV', 10000, 285, ''],
      ['Mark V', 12500, 200, ''], ['Mark VI', 15000, 285, ''], ['War Machine', 10000, 320, 'Reward from the trivia'],
    ].map(r => r.map(c => typeof c === 'number' ? num(c) : ctx.esc(c))), { cls: 'compact' }) +
      ctx.md('Building the armor and winning this map count toward unlocking the Iron Man armors at the terminals on other maps. The terminal\'s STARK app shows what is left.'),
  },
  'the-giant': {
    origin: 'Call of Duty: Black Ops III (2015), remaking Der Riese', color: '#c08a3a',
    perks: ['Juggernog', 'Quick Revive', 'Speed Cola', 'Double Tap', 'Stamin-Up', 'Deadshot Daiquiri', 'Mule Kick'],
    box: 'Six spots',
    pap: 'Sealed until all three teleporters are linked, then 5,000 points.',
    wonder: ['Wunderwaffe DG-2', 'Annihilator'],
    traps: 'Three electric traps, 1,000 points each, 30 s, then a 90 s cooldown.',
    teleporters: 'East, south and west, to the mainframe. 1,500 points, 30 s cooldown.',
    special: 'Hellhounds',
    body: L => `The Black Ops III remake of **Der Riese**: a Nazi factory in the snow, its courtyard, the yards on either side and the mainframe.

## Power and doors

Doors cost 750 or 1,250 points. The **power switch** opens the electric barricades and lowers the two drawbridges.

## Teleporters and Pack-a-Punch

There are three teleporters (east, south and west), all needing the power. To link one:

1. Pull the lever at the teleporter.
2. Within 30 seconds, use the switch at the **mainframe**.

Once all three are linked, **Pack-a-Punch** opens at the mainframe. After that each teleporter takes you to the mainframe for 1,500 points and then needs 30 seconds to recharge.

## Traps

Three electric traps, 1,000 points each. They burn for 30 seconds and then need 90 seconds to cool down.

## Wonder weapons

The **Wunderwaffe DG-2** is in the Mystery Box. Its lightning jumps from zombie to zombie, and Pack-a-Punched it becomes the **DG-3 JZ**. A secret on the map gives the **Annihilator** operator weapon (see the Easter eggs below).`,
  },
  'der-eisendrache': {
    origin: 'Call of Duty: Black Ops III, Awakening (2016)', color: '#7aa2c8', wip: true,
    perks: ['Juggernog', 'Quick Revive', 'Speed Cola', 'Double Tap', 'Stamin-Up', 'Mule Kick'],
    box: 'Six spots',
    pap: 'A quest: activate two of three spots, then it forms at the third (see below).',
    wonder: ['Wrath of the Ancients', 'Ragnarok DG-4', 'Rocket Shield'],
    traps: 'Death Ray (1,000), Masher (1,500), rocket test fires',
    teleporters: 'To the rocket pad, 500 points. Launch pads, 500 a launch.',
    special: 'Der Wunderfizz, Panzersoldat, hellhounds, low gravity, a boss and an ending',
    body: L => `A snowbound castle in the Austrian Alps with a Nazi rocket on its launch pad. The biggest map in the game, and the one with the most to do.

## Getting around

- Doors cost from 500 to 1,750 points. The **power switch** opens the electric doors and the gate down to the undercroft.
- The **teleporter** (500 points, needs the power) takes you to the rocket pad, then needs 45 seconds to recharge.
- **Launch pads** throw you across the castle for 500 points a launch, then recharge for 15 seconds.
- The **gondola** carries you across the castle once its fuses are found, and sometimes brings a power-up with it.
- Fall off the castle and you are put back where you were a few seconds before, minus almost half your health.

## Perks and Der Wunderfizz

Six perk machines stand around the castle. **Der Wunderfizz** is a seventh machine that sits at one of five spots (only one is lit at a time, and it needs the power). It costs 1,000 less than a perk would, spins for a few seconds and gives you a random perk you don't have yet; you have 10 seconds to take it. After a few uses it moves to another spot.

## Pack-a-Punch

1. Activate two of the three Pack-a-Punch spots: the undercroft, the rocket pad and the rooftop.
2. The machine forms at the third spot. Each Pack-a-Punch costs 5,000.
3. After its first use it moves to another spot every couple of rounds.

## Traps

- **Death Ray** on the rooftop: 1,000 points, runs 15 seconds, 60 second cooldown.
- **Masher**: 1,500 points, runs 20 seconds, 60 second cooldown.
- **Rocket test fires**: once the teleporter has been used, the rocket pad fires its engines now and then, burning anything below.

## Wonder weapons and gear

- **Wrath of the Ancients**, the dragon bow. Feed the three dragon heads around the castle (kill zombies near each until it is full) and the bow appears in the undercroft, free, once for each player. Hold fire to draw, release to shoot an explosive arrow. It never needs reloading.
- Four **upgraded bows**, each a long quest: the **Storm Bow** (lightning), the **Fire Bow** (fire, and a rune prison), the **Wolf Bow** (spirit wolves) and the **Void Bow** (a rift that swallows zombies). Holding the shot longer makes each one far stronger.
- **Ragnarok DG-4**: twin gravity spikes, built from parts. Slam them down to kill everything around you, or plant them to lift zombies into the air.
- **Rocket Shield**: built from three parts at a workbench. Raise it with **H**, bash with it and dash forward. A Carpenter repairs it.

## Enemies

- **Hellhounds**, from about round 5.
- **The Panzersoldat**, from round 12 and every few rounds after: an armoured soldier with a flamethrower and a claw. Nukes don't kill him and Insta-Kill only doubles your damage.
- The main Easter egg ends with a **boss fight**.

## Low gravity

Four pressure plates in the undercroft: step on all of them for 50 seconds of low gravity, where you can double jump and run along walls.`,
  },
  'malibu-drive': {
    origin: 'Call of Duty: World at War custom map by ZK', color: '#d0453a', wip: true,
    perks: [],
    perksText: 'No perk machines: buy perks at the terminals.',
    box: 'The Tesseract, fourteen spots, 950 points',
    pap: 'The pedestal in the Ashton store, woken by the four Infinity Stones. 5,000 points.',
    wonder: ['Ray Gun', 'Cheese Gun'],
    traps: 'None',
    teleporters: 'The Bifrost, the summon pad and Iron Man transport units.',
    special: 'Eleven heroes with their own powers, a boss and an ending',
    body: L => `The Avengers come to Malibu: Tony Stark's house on the cliffs, the beach, the countryside, a helicarrier, the city and a strange dream of the Cheese Cube. You play as an Avenger.

## Choosing a hero

The game starts in **Asgard**, at eleven hero stations. Pick a hero by using their figure. In co-op each hero can only be taken by one player. The **Bifrost** takes you down to Malibu for free, and from round 2 the summon pad brings you back to Asgard (three times a round).

Every hero has their own health, speed and powers:`,
    after: (ctx, num) => ctx.table(['Hero', 'Health', 'Powers'], [
      ['Tony Stark', 150, 'His phone summons his Iron Man armors.'],
      ['Bruce Banner', 225, 'Drinks from the Mean Juice valves turn him into the Hulk (900 health, a thunder clap).'],
      ['Black Widow', 450, 'Her own pistols. Fast.'],
      ['Hawkeye', 525, 'Three bows: Spearhead, Explosive and Electro-Shock arrows.'],
      ['Captain America', 600, 'His shield, once it is knocked down from the beach house.'],
      ['Thor', 600, 'Mjolnir, found in the city: chain lightning.'],
      ['Quicksilver', 180, 'Hold Use to run at four times the speed.'],
      ['Scarlet Witch', 225, 'A hex shield and telekinesis.'],
      ['Spider-Man', 450, 'Webs, spider sense and web-zips.'],
      ['James Rhodes', 300, 'Double bullet damage. The only one who can wear the War Machine armor (10,000 points).'],
      ['Vision', 375, 'Molecular mode: phase through things.'],
    ].map(([n, h, p]) => [`<b>${ctx.esc(n)}</b>`, num(h), ctx.esc(p)])) + ctx.md(`Juggernog adds to a hero's health as usual.

## Around the map

- **No power switch and no perk machines**: perks come from the terminals.
- The **Mystery Box** is the Tesseract, which jumps between fourteen spots. It can give the Famas, AK-47, Galil, MP5K, M14, Typewriter, CZ75, SPAS-12, the Cheese Gun and the Ray Gun.
- Eight **hologram wall stations** change their gun every round, with ammo at half price.
- The city has a garage, the Ashton store, a gas station, a theater, offices, a hotel, a chicken shop and a police station.
- Once JARVIS is back online, **Iron Man transport units** fly you across the map: 1,000 points for a 26 second flight.
- **Tony's armors**: Marks I, III, IV, V and VI, and with JARVIS online the Hall of Armors adds Marks XVI, XXXIII and XLII.

Bringing JARVIS back online here unlocks the STARK app on the terminals of other maps.`),
  },
  'shangri-la': {
    origin: 'Call of Duty: Black Ops, Annihilation (2011)', color: '#4f9a5a',
    body: L => 'A temple deep in the jungle, with waterfalls, caves and a mine cart track. This map can only be **explored**: walk around it freely, with no zombies.',
  },
  coast: {
    origin: 'Call of Duty: Black Ops, Escalation (2011)', color: '#8fb8d0',
    body: L => 'A lighthouse on a frozen coast, with a shipwreck stuck in the ice. This map can only be **explored**: walk around it freely, with no zombies.',
  },
  ascension: {
    origin: 'Call of Duty: Black Ops, First Strike (2011)', color: '#c84a3a',
    body: L => 'A Soviet cosmodrome with a rocket on its launch pad. This map can only be **explored**: walk around it freely, with no zombies.',
  },
};

export default {
  id: 'maps', title: 'Maps', order: 20,
  blurb: 'Every map you can play or explore, with its perks, wonder weapons and Easter eggs.',
  async load(ctx) {
    const { md, table, infobox, esc, num, note } = ctx;
    const [list, journal, zones, booths, data] = await Promise.all([
      ctx.json('mods/maps.json'),
      ctx.load('mods/journal/quests.js').catch(() => null),
      ctx.json('mods/exfil/zones.json').catch(() => ({})),
      ctx.json('mods/terminal-booth/placements.json').catch(() => ({})),
      ctx.json('game-data.json').catch(() => null),
    ]);
    const kinoCounts = data ? {
      box: data.entities.filter(e => e.targetname === 'treasure_chest_use').length,
    } : {};

    // a link to another topic's page when it exists, else plain text
    const P = (tid, title, label) => ctx.find(tid, ctx.slug(title)) ? ctx.link(tid, ctx.slug(title), label ?? title) : esc(label ?? title);

    const quests = id => journal?.questsFor ? journal.questsFor(id) : (journal?.JOURNAL?.find(j => j.map === id)?.quests ?? []);
    const KIND = { 'MAIN QUEST': 'Main quest', 'BOW UPGRADE': 'Bow upgrade', 'WONDER WEAPON': 'Wonder weapon', 'MAP QUEST': 'Map quest', BUILDABLE: 'Buildable', 'SIDE EGG': 'Side Easter egg' };
    const eggs = id => {
      const qs = quests(id).filter(q => q.steps?.length);
      if (!qs.length) return '';
      return md(`## Easter eggs and quests

Every step below is hidden until you click it. In a game, a terminal's **JOURNAL** app records each step once you have done it and can mark the next one on screen.`) +
        qs.map(q => ctx.spoiler(`${q.name} · ${KIND[q.kind] ?? ctx.cap(String(q.kind ?? '').toLowerCase())}`,
          `<ol>${q.steps.map(s => `<li><b>${esc(s.title)}</b>${s.how ? `: ${esc(s.how)}` : ''}</li>`).join('')}</ol>`)).join('');
    };

    const pages = list.maps.map(m => {
      const I = INFO[m.id] ?? { body: () => '' };
      const zombies = (m.modes ?? []).includes('zombies');
      const img = m.image ? ctx.url(m.image) : null;
      const terminals = booths?.maps?.[m.id]?.length ?? 0;
      const zoneList = zones?.[m.id];
      const exfil = !zombies ? null : terminals
        ? (Array.isArray(zoneList) && zoneList.length ? `Yes. Landing zones: ${zoneList.map(z => esc(z.name)).join(', ')}` : 'Yes')
        : 'No (no terminal)';
      const box = m.id === 'kino' && kinoCounts.box ? `${num(kinoCounts.box)} spots` : I.box ?? (zombies ? 'Moves between several spots' : null);
      const rowsFor = () => [
        ['From', esc(I.origin ?? '—')],
        m.place ? ['Location', esc(ctx.cap(m.place.toLowerCase()))] : null,
        ['Modes', (m.modes ?? []).map(x => x === 'zombies' ? 'Zombies' : 'Explore').join(', ')],
        zombies ? ['Perks', I.perks?.length ? I.perks.map(p => P('perks', p)).join(', ') : esc(I.perksText ?? '—')] : null,
        zombies ? ['Mystery Box', esc(box ?? '—')] : null,
        zombies ? ['Pack-a-Punch', esc(I.pap ?? '—')] : null,
        zombies && I.wonder?.length ? ['Wonder weapons', I.wonder.map(w => P('weapons', w)).join(', ')] : null,
        zombies && I.traps ? ['Traps', esc(I.traps)] : null,
        zombies && I.teleporters ? ['Teleporters', esc(I.teleporters)] : null,
        zombies ? ['Terminals', terminals ? num(terminals) : 'None'] : null,
        zombies ? ['Exfil', exfil] : null,
        zombies && I.special ? ['Also', esc(I.special)] : null,
      ];
      return {
        id: ctx.slug(m.title), title: m.title, group: zombies ? G.zombies : G.explore,
        sub: zombies ? (m.tagline ?? I.origin) : 'Explore only', img: img ?? undefined, color: I.color,
        keywords: [m.place, I.origin, ...(I.wonder ?? [])].filter(Boolean).join(' '),
        html: c => infobox({ title: m.title, img, color: I.color, rows: rowsFor() }) +
          (I.wip ? note('This map is still being finished: some areas and features may be rough.', 'warn') : '') +
          md(I.body(c)) + (I.after ? I.after(c, num) : '') +
          (zombies ? eggs(m.id) : ''),
      };
    });

    return {
      intro: md(`Pick a map on the main menu's **PLAY** tab. Maps marked Zombies can be played solo or in co-op; every map can also be **explored** with no zombies, to learn the layout. Easter egg steps on each page are hidden until you click them.`),
      groups: [G.zombies, G.explore],
      pages,
    };
  },
};

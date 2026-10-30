// Basics: how a match works, survival, co-op, controls, menus and settings.
// Numbers come from the game's own files where they exist (rules, health, key bindings), so they follow the game.

const G = { play: 'Playing a match', survive: 'Staying alive', coop: 'Co-op', controls: 'Controls', menus: 'Menus and settings' };

export default {
  id: 'basics', title: 'Basics', order: 10,
  blurb: 'How a match works, controls, co-op, movement, menus and settings.',
  async load(ctx) {
    const { md, table, note, esc, num, url } = ctx;
    const [rules, settings, health, data] = await Promise.all([
      ctx.load('rules.js').catch(() => null),
      ctx.load('settings.js').catch(() => null),
      ctx.json('mods/player-health/data.json').catch(() => null),
      ctx.json('game-data.json').catch(() => null),
    ]);
    const R = data?.rules ?? {};
    const hp = health?.rules?.player_health ?? 150, hpJugg = health?.rules?.player_health_juggernog ?? 250;
    const startPoints = R.zombie_score_start_1p ?? 500;
    const perkPrice = n => rules?.perkPrice ? rules.perkPrice(n) : 2500 + 500 * n;
    const pu = data?.powerups ?? {};
    const puName = (k, d) => pu[k] ?? d;
    const puTime = k => R[`zombie_powerup_${k}_time`] ?? 30;
    const lifetime = rules?.POWERUP_LIFETIME ?? 26.5;

    // link to a page in another topic when it exists, else to the topic itself
    const L = (tid, title, label) => ctx.find(tid, ctx.slug(title)) ? ctx.link(tid, ctx.slug(title), label) : ctx.link(tid, null, label ?? title);
    const T = (tid, label) => ctx.link(tid, null, label);
    const B = (pid, label) => ctx.link('basics', ctx.slug(pid), label);
    const M = (title, label) => ctx.link('maps', ctx.slug(title), label);

    const page = (title, group, sub, html, extra = {}) => ({ id: ctx.slug(title), title, group, sub, html, ...extra });
    const key = code => `<kbd>${esc(settings?.keyName ? settings.keyName(code) : code)}</kbd>`;
    const LABEL = { monkey: 'Tactical (Monkey Bomb, Gersh Device or QED)', wheel: 'Power-up stash wheel (hold)', shield: 'Rocket Shield', swap: 'Switch weapon' };
    const NOTE = {
      sprint: 'Works in any direction.',
      crouch: 'Tap to crouch, hold to go prone, tap while sprinting to slide.',
      use: 'Hold at revives and some prompts.',
      ability: 'Your class\'s action skill, when charged.',
      operator: 'Your operator weapon, when charged.',
      shield: 'Only once you carry one.',
      thirdPerson: 'Toggles a camera behind your character.',
      wheel: 'Only with the perk that stores power-ups.',
      gumChew: 'Uses the gobblegum shown on the HUD.',
      gumNext: 'Cycles your gobblegums.',
      claymore: 'Once you have claymores (G places them too).',
      grenade: 'Hold to cook. With claymores in your lethal slot, places one.',
    };

    const pages = [];

    // ---- Playing a match
    pages.push(page('How a match works', G.play, 'Rounds, points and the goal', c => {
      const rows = [1, 2, 3, 5, 10, 15, 20, 30, 50].map(r => [r,
        rules?.zombieHealth ? num(Math.round(rules.zombieHealth(r, R))) : '—',
        rules?.roundPopulation ? num(rules.roundPopulation(r, R, 1)) : '—',
        rules?.roundPopulation ? num(rules.roundPopulation(r, R, 4)) : '—']);
      return md(`Zombies is a survival game. The undead come in **rounds**: kill every zombie in a round and, after a short break, the next one starts with more of them, and each one tougher. There is no last round. Your best round on each map is kept on the main menu.

You start with **${num(startPoints)} points** and a pistol. Points buy everything: doors and debris that open the map, guns on the walls, the Mystery Box, perks, traps and Pack-a-Punch. Spending them well is most of the game.

## A typical game

1. Hold the first room for a few rounds, shooting zombies as they climb through the windows. Rebuild boarded windows to slow them down.
2. Open doors toward the power switch and turn it on: it wakes the perk machines and most traps.
3. Buy perks, try the Mystery Box, and Pack-a-Punch your best gun.
4. Find a place to train (run the horde in a loop) or hold, and see how far you get. On some maps you can call an exfil and escape instead.

## Every few rounds

- **Hellhound rounds** replace a normal round now and then on most maps: fast dogs that come in packs.
- Each new round tops your grenades back up (two more, up to four).
- Some maps add their own bosses and special zombies: see ${T('maps', 'the map pages')}.

## How hard the rounds get`) +
        table(['Round', 'Zombie health', 'Zombies (solo)', 'Zombies (4 players)'], rows, { cls: 'compact' }) +
        note('Health grows by a fixed amount for the first nine rounds and then by 10% a round, so late rounds get hard quickly. Not every zombie is on the map at once: there is a cap on how many are alive together.', 'tip');
    }));

    pages.push(page('Points', G.play, 'What pays and what costs', c => md(`Points are the money of a match. You start with ${num(startPoints)}. Each player has their own points, even in co-op.

## Earning points`) + table(['Action', 'Points'], [
      ['A hit that does not kill', 10],
      ['A kill', 60],
      ['A headshot kill', 100],
      ['A knife kill', 130],
      ['Reviving a teammate', 50],
      [`${esc(puName('nuke', 'Nuke'))} power-up`, 400],
      [`${esc(puName('carpenter', 'Carpenter'))} power-up`, 200],
    ], { cls: 'compact' }) + md(`${esc(puName('double_points', 'Double Points'))} doubles everything you earn while it lasts. The usual trick in early rounds is to shoot a zombie several times before finishing it with the knife, since every hit pays.

## Common prices`) + table(['Thing', 'Price'], [
      ['Mystery Box spin', 950],
      ['Pack-a-Punch', 5000],
      ['First perk', perkPrice(0)],
      ['Each further perk', `+${num(perkPrice(1) - perkPrice(0))} per perk you already hold`],
      ['Doors and debris', 'Shown on the door, usually 750 to 1,500'],
      ['Wall guns', 'Shown on the chalk outline; ammo costs half'],
      ['Traps', 'Usually 1,000'],
    ], { cls: 'compact' })));

    pages.push(page('Doors and wall guns', G.play, 'Opening the map, buying guns', c => md(`Doors, gates and piles of debris block the way to the rest of a map. Walk up to one and its price shows on screen: press **Use** (${key(settings?.DEFAULT_BINDS?.use ?? 'KeyF')}) to buy it. Some doors are electric and only open once the power is on.

**Wall guns** are drawn in chalk on the walls. Buy one with Use; buying it again later refills its ammo for half the price.

You can carry two guns (three with Mule Kick). Buying a new gun while your hands are full replaces the one you are holding.

**Windows**: zombies climb in through boarded windows. Stand at a broken window and hold Use to put the boards back.`)));

    pages.push(page('Mystery Box', G.play, '950 points for a random weapon', c => md(`The Mystery Box costs **950 points** and hands out a random weapon, including the wonder weapons you cannot buy anywhere else. Take the gun before it sinks back into the box, or it is gone.

- The box sits at one of several spots on a map, and only that one is open.
- Sometimes a **teddy bear** comes out instead of a gun: you get your points back, and the box flies off to another spot.
- During a **${esc(puName('fire_sale', 'Fire Sale'))}** every box spot opens at once and a spin costs **10 points**.
- What the box can give you is set on the main menu: the Mystery Box list in the loadout lets you choose which weapons are in it and how rare each one is.

The guns themselves are in ${T('weapons')}, and the box's odds and rarities on ${L('weapons', 'Mystery Box', 'its own page there')}.`)));

    pages.push(page('Pack-a-Punch', G.play, 'Upgrade a gun for 5,000', c => md(`The Pack-a-Punch machine upgrades the gun in your hands for **5,000 points**: more damage, a bigger magazine and more ammo, a new name and a camo. Many wonder weapons turn into something stronger. Hand it the gun, wait for it to come back out, and take it.

Each map hides its machine in its own way: on some it simply needs the power, on others it is a short quest (link the teleporters, send it away and call it back, wake it with the Infinity Stones). Each ${T('maps', 'map page')} says how.

A Pack-a-Punched gun refills from a Max Ammo like any other. What each gun turns into is on ${L('weapons', 'Pack-a-Punch', 'the Pack-a-Punch page under Weapons')}. Attachments, camos and weapon levels are in ${T('weapons')}.`)));

    pages.push(page('Power-ups', G.play, 'Drops from killed zombies', c => {
      const rows = [
        [puName('nuke', 'Nuke'), `Kills every zombie on the map and pays ${num(400)} points.`],
        [puName('insta_kill', 'Insta-Kill'), `Any hit kills, for ${num(puTime('insta_kill'))} s.`],
        [puName('double_points', 'Double Points'), `Every point you earn counts twice, for ${num(puTime('point_doubler'))} s.`],
        [puName('full_ammo', 'Max Ammo'), 'Refills every gun\'s ammo and your grenades.'],
        [puName('carpenter', 'Carpenter'), `Rebuilds every window and pays ${num(200)} points. Only drops when enough windows are broken.`],
        [puName('fire_sale', 'Fire Sale'), `Every Mystery Box spot opens and a spin costs 10, for ${num(puTime('fire_sale'))} s. Only once the box has moved.`],
      ].map(([n, d]) => [`<b>${esc(n)}</b>`, esc(d)]);
      return md(`Killed zombies sometimes drop a glowing **power-up**. Walk over it to take it; it works for the whole team. A power-up blinks and then vanishes about ${Math.round(lifetime)} seconds after it drops.`) +
        table(['Power-up', 'What it does'], rows) +
        md(`- The chance grows with the points the team scores: after enough points one is almost sure to drop. At most ${num(R.zombie_powerup_drop_max_per_round ?? 4)} drop in a round.
- There are no Nukes or Fire Sales on round 1, and hellhounds don't drop power-ups.
- Some perks, gobblegums and map Easter eggs give extra power-ups. See ${T('gobblegums')}.`);
    }));

    pages.push(page('Power', G.play, 'Turning the lights on', c => md(`Most maps start with the power off. Somewhere on the map is a **power switch**: reach it and press Use. With the power on:

- the perk machines work;
- electric doors open, and traps and teleporters can be used;
- on many maps Pack-a-Punch can be reached.

Some maps make you find the switch's parts first, and one has no power switch at all. The ${T('maps', 'map pages')} list what each map needs.`)));

    pages.push(page('Perks overview', G.play, 'Perk-a-Cola machines', c => md(`Perks are drinks from Perk-a-Cola machines that give you a lasting bonus, for example ${L('perks', 'Juggernog')} (more health), ${L('perks', 'Quick Revive')} (faster healing and reviving), ${L('perks', 'Speed Cola')} (faster reloads), ${L('perks', 'Double Tap')} (faster fire) and ${L('perks', 'Mule Kick')} (a third gun).

- Perks need the power on.
- Prices climb as you collect them: the first perk costs ${num(perkPrice(0))}, and each one after that costs ${num(perkPrice(1) - perkPrice(0))} more than the last.
- When you go down you lose every perk.
- Besides the machines on the map, the **terminals** on most maps sell every perk in the game, whatever map you are on.
- Lie prone at a perk machine to find ${num(100)} points under it (once per machine per game, for whoever finds it first).

Every perk, its effects and its upgrades are in ${T('perks')}.`)));

    pages.push(page('Terminals', G.play, 'The computer booths', c => md(`Most maps have one or more **terminal booths**: a computer you walk up to and press Use on. It opens a desktop with apps:

- **PERKS**: buy any perk in the game, at the usual perk prices.
- **ARSENAL**: put an ammo mod on the gun in your hands (needs the power).
- **ARMORY**: operator weapons and the Rocket Shield. See ${T('operators')}.
- **GUMS**: your gobblegum packs. See ${T('gobblegums')}.
- **BANK**: store points for later.
- **EXFIL**: call the escape chopper (see ${B('Exfil')}).
- **JOURNAL**: the map's Easter eggs, step by step once you have done them, with on-screen markers for the one you track.
- **RADIO**: the music Easter egg songs you have found.
- **STARK**: Iron Man armors, once you have unlocked them.

Maps without a terminal: ${M('Moon')} and ${M('Cheese Cube Unlimited')}.`)));

    // ---- Staying alive
    pages.push(page('Health and damage', G.survive, `${hp} health, ${hpJugg} with Juggernog`, c => md(`You have **${hp} health**, or **${hpJugg}** with ${L('perks', 'Juggernog')}. Your health bar is on the HUD.

- A zombie's hit takes ${num(50)} health, a hellhound's bite ${num(40)}: three zombie hits down you without Juggernog.
- Health comes back on its own: ${num(4)} seconds after you were last hit (${num(2)} with ${L('perks', 'Quick Revive')}) it starts to refill, a quarter of your health every second.
- A ring on screen shows which way the hit came from.

## Fall damage

A short drop is free. From about **3 metres** a fall starts to hurt, more the higher it is, and from about **16 metres** it takes all your health. ${L('perks', 'PhD Flopper')} removes fall damage, and with it, diving to prone from a height explodes. On ${M('Moon')}'s low gravity it is how hard you land that counts, not how far you fell.

## Going down

When your health runs out you go **down**. In solo that is the end of the game, unless something saves you. In co-op a teammate can revive you: see ${B('Downs and revives')}.`)));

    pages.push(page('Downs and revives', G.survive, 'Bleeding out and getting back up', c => md(`In co-op, losing all your health puts you **down** instead of out:

- You fall to the floor and can only crawl slowly.
- You have **30 seconds** before you bleed out. A teammate who reaches you holds **Use** for **3 seconds** (1.5 with ${L('perks', 'Quick Revive')}) to get you up, and earns ${num(50)} points.
- Going down costs every perk you held, and the third gun from ${L('perks', 'Mule Kick')}.
- If you bleed out you watch your team until the next round, then come back next to a teammate.
- If everyone is down at once, the game is over.

In **solo** there is nobody to revive you: going down ends the game. Quick Revive still speeds up your healing.`)));

    pages.push(page('Exfil', G.survive, 'Escape by chopper for bonus XP', c => md(`An **exfil** ends the game on your terms. Every five rounds, starting at round **11** (then 16, 21 and so on), a terminal's **EXFIL** app lets you call the escape chopper for the whole of that round.

1. Call it from a terminal. A landing zone is marked far across the map: a beam of light, with the distance on screen.
2. Get there and hold out for **2 minutes** against a heavier horde (zombies five rounds tougher than the current one). The chopper comes down in the last 25 seconds.
3. Be **standing inside the zone** when the timer hits zero. Anyone outside it, or down, is left behind, and that ends their game.

Escaping pays a big bonus of account and class XP that grows with the square of the rounds you survived, so a late exfil is worth far more than an early one. In co-op anyone can call it, and each player escapes or is left behind on their own. See ${T('progression')} for what XP unlocks.

Exfil needs a terminal, so it is not on ${M('Moon')} or ${M('Cheese Cube Unlimited')}.`)));

    pages.push(page('The HUD', G.survive, 'What the screen shows', c => md(`On a computer the HUD follows the Black Ops 7 layout:

- **Bottom left**: your character's portrait, level, name and health (in segments, red when low), your XP bar and your **points**.
- **Bottom right**: the gun's name, its weapon level and ammo mod, the ammo in the magazine and in reserve, and a dial with the gun's outline and a magazine ring (purple when Pack-a-Punched). Your lethal (grenades or claymores) and tactical sit on top of it. Your class's action skill and your operator weapon are the two bubbles beside it, filling as they charge. Gobblegums are stacked along the right edge.
- Perk icons, the round number, power-up timers and a ring that shows where damage came from.
- Hold **Tab** for the scoreboard (kills, downs, revives and points of every player).

On phones the classic layout is used, arranged around the touch buttons.`)));

    // ---- Co-op
    pages.push(page('Co-op', G.coop, 'Up to four players', c => md(`Up to **four players** can play a map together, each in their own browser.

## Hosting and joining

- **Host**: on the main menu pick a map and press **HOST CO-OP GAME**. You get a room with a **four-letter code**.
- **Join**: type the code into **JOIN CO-OP** on the Play tab, or use an invite link.
- In the lobby, **COPY INVITE** copies a link for your friends, and **INVITE FRIENDS** sends an invite to friends who are online (needs Discord sign-in). The host presses **START GAME** once everyone has loaded.

## In the game

- Everyone has their own points, perks and guns. Power-ups work for the whole team.
- Downed players can be revived: see ${B('Downs and revives')}.
- If the host leaves, another player takes over and the game goes on.
- There are more zombies with more players: see ${B('How a match works')}.

## Friends

Sign in with Discord on the main menu to get a profile that follows you between devices and a **SOCIAL** tab: add friends, see who is online and what they are playing, join them and send invites.`)));

    // ---- Controls
    pages.push(page('Keyboard and mouse', G.controls, 'Default key bindings', c => {
      const rows = [
        ['Fire', '<kbd>Left mouse</kbd>', ''],
        ['Aim down sights', '<kbd>Right mouse</kbd>', ''],
        ...(settings?.ACTIONS ?? []).map(([id, label, code]) => [esc(LABEL[id] ?? label), key(code), esc(NOTE[id] ?? '')]),
        ['Scoreboard', '<kbd>Tab</kbd>', 'Hold.'],
        ['Pause menu', '<kbd>Esc</kbd>', 'Settings and leaving the game.'],
      ];
      return md(`These are the default keys. Every one can be changed in **Settings, Controls**. Some keys only matter on certain maps or once you have the item (the Rocket Shield, an operator weapon, a class).`) +
        table(['Action', 'Key', 'Notes'], rows) +
        md(`## Map keys

Some maps add their own keys: on ${M('Moon')} **P** puts the P.E.S. helmet on and off, **H** hacks what you aim at once you carry the Hacker, and the Gersh Device or QED take the tactical key. Iron Man armor flies with **Space**.`);
    }));

    pages.push(page('Controller', G.controls, 'Xbox, PlayStation and Switch pads', c => {
      const rows = [
        ['Right trigger', 'Fire'], ['Left trigger', 'Aim down sights'],
        ['A / Cross', 'Jump'], ['B / Circle', 'Tap: crouch. Hold: prone. While sprinting: slide'],
        ['X / Square', 'Tap: reload. Hold at a prompt: use or buy. Hold elsewhere: inspect the gun'],
        ['Y / Triangle', 'Switch weapon'],
        ['Left bumper', 'Tactical'], ['Right bumper', 'Grenade (hold to cook)'],
        ['Right stick click', 'Knife'], ['Left stick click', 'Sprint'],
        ['D-pad up', 'Claymore'], ['D-pad left', 'Switch attachment'],
        ['D-pad down', 'Class action skill'], ['D-pad right', 'Operator weapon'],
        ['View / Back', 'Third person'], ['Touchpad / Share', 'Scoreboard (hold)'],
      ].map(([a, b]) => [`<b>${esc(a)}</b>`, esc(b)]);
      return md(`Plug in or pair a controller and just press a button: the game picks it up, and the button prompts change to match it (Xbox, PlayStation or Nintendo icons, or choose them yourself in Settings).`) +
        table(['Button', 'Action'], rows, { cls: 'compact' }) +
        md(`- The menus work with a controller too: the left stick or D-pad moves, A/Cross selects, B/Circle goes back, and the bumpers switch tabs.
- Gobblegums stay on the keyboard (N and J).
- **DualSense**: in Chrome or Edge, press **ENABLE DUALSENSE FEATURES** in the pause menu once to get adaptive triggers that push back on each gun, a light bar that shows your health and player lights for your perks. Xbox controllers get rumble in the triggers.
- **Aim assist**: the right stick slows down over a zombie, follows it a little while you move, and pulling the aim trigger with one near the crosshair snaps onto it. It aims at the chest; with **Deadshot Daiquiri** it aims at the head. Set it to Off, Standard or Strong in **Settings, Controls**.
- Look sensitivity, aim assist, vibration and the trigger effects are in **Settings, Controls**.`);
    }));

    pages.push(page('Movement', G.controls, 'Sprint, slide, dive, mantle', c => md(`Movement follows the newer Black Ops games.

- **Sprint**: hold Shift (or click the left stick). You can sprint in any direction, not just forward.
- **Crouch and prone**: one button. Tap crouch to crouch, hold it to go prone.
- **Slide**: tap crouch while sprinting. You keep your speed for a moment and can fire from the hip while sliding.
- **Dive**: hold crouch while sprinting to dive forward and land on your belly. With ${L('perks', 'PhD Flopper')} the landing explodes.
- **Mantle**: jump at a ledge or low wall up to about head height and you climb onto it.
- **Head bob**: the camera bobs and dips on landing. Turn it off in Settings if it bothers you, and use Weapon motion to tone down gun sway.

Some maps change the rules: ${M('Moon')} has low gravity outside the base, and ${M('Der Eisendrache')} has a low-gravity trick that lets you double jump and run along walls.`)));

    pages.push(page('Phones and touch', G.controls, 'Playing on a phone or tablet', c => md(`The game runs on phones and tablets in the browser.

- **Move** with the stick on the left, **look** by dragging on the right half of the screen.
- Buttons on the right fire, aim, jump, crouch, reload, use, switch weapon, knife and throw. **VIEW** switches to third person. Tap your **class badge** to use your action skill.
- On ${M('Moon')} extra buttons appear: **P.E.S.**, **OBJECTIVE** and a held **HACK**, and the tactical button reads GERSH or QED. A **BREATH** button shows while you look through a scope.
- In the Gunsmith, drag to turn the gun and pinch to zoom.
- Phones start on **Low** graphics, without HD textures and with the frame rate capped at 30, to keep them cool. You can raise all three in Settings.`)));

    // ---- Menus and settings
    pages.push(page('Main menu', G.menus, 'The tabs and what they hold', c => md(`The main menu is where you pick a map and set up your character between games. Your rank card shows your level and XP.

- **PLAY**: the map browser. Filter by **Zombies** or **Explore**, pick a map and press **PLAY ZOMBIES**, **HOST CO-OP GAME** or **EXPLORE THE MAP** (walk around the map freely, with no zombies). Your best round on the map is shown. **JOIN CO-OP** takes a room code. See ${T('maps')}.
- **ARMORY**: your **Loadout** (starting pistol, bonuses and Mystery Box list), **Weapons** (levels, attachments and camos), **Gobblegums**, **Research**, **Classes** and your **Operator**. See ${T('weapons')}, ${T('gobblegums')}, ${T('classes')} and ${T('operators')}.
- **SHOP**: spend credits. See ${T('progression')}.
- **PASS**: the Melon Pass seasons and their rewards. See ${T('pass')}.
- **CAREER**: your lifetime stats.
- **SOCIAL**: friends, who is online and invites (with Discord sign-in).
- **MODS**: optional extras you can switch on or off.
- **SETTINGS**: the same settings as in a game (see ${B('Settings')}).

## Loadout

- **Starting pistol**: the pistol you spawn with.
- **Tactical**: Monkey Bombs, the Gersh Device or the QED, unlocked by rank.
- **Mystery Box list**: which weapons the box can give and how rare each one is.`)));

    pages.push(page('Settings', G.menus, 'Graphics, film look, weapon motion', c => md(`Settings are on the main menu and in the pause menu, in four tabs: **Graphics**, **Audio**, **Controls** and **Gameplay**. Most changes apply at once.

## Graphics

- **Graphics quality**: Low, Medium, High or Ultra. Medium adds bloom and light beams, High adds shadows from lights, Ultra adds ambient occlusion (soft shadows in corners). Lower it first if the game stutters.
- **Film look**: Off, Light or Full. A Black Ops III style colour grade that gives each map its own mood. Needs Medium quality or higher. **Film grain** adds a light grain on top.
- **Render resolution**: 50% to 150% of your screen. Below 100% is faster and softer.
- **Frame rate cap**: 15 to 240, or Unlimited.
- **HD textures** and **Daytime** apply to ${M('Kino der Toten')}.
- **Show FPS** puts a frame counter in the corner.

## Controls and feel

- **Field of view**: 60 to 110 (78 by default).
- **Mouse sensitivity** and a separate one for aiming down sights, and **Invert Y**.
- **Weapon motion**: 0% to 150%. Scales how much the gun sways, bobs and kicks in your hands. Lower it if the motion makes you uncomfortable.
- **Head bob**: on or off.
- **Key bindings**: change any key (see ${B('Keyboard and mouse')}).
- Controller look sensitivity, aim assist, button icons, vibration, adaptive triggers and the DualSense lights (see ${B('Controller')}).

## Audio

- **Master volume** and **Background music** (an ambient soundtrack, off by default; Easter egg songs always play).

## Gameplay

- **Casino effects**: how much of the screen the Gambler class's games take over.`)));

    return {
      intro: md(`New to Zombies, or to Melon Zombies? Start with [How a match works](#/basics/how-a-match-works), then read up on [Points](#/basics/points), [perks](#/basics/perks-overview) and [Co-op](#/basics/co-op). The controls for keyboard, controller and phones are here too.`),
      groups: Object.values(G),
      pages,
    };
  },
};

// The Armory (ARMORY.EXE on the terminal booth, user 2026-10-17): special gear bought outside the map it comes from,
// in tabs: OPERATOR WEAPONS (the Ragnarok DG-4, the Annihilator, Gorod Krovi's Gauntlet of Siegfried), SHIELDS (the rocket shield, Nuketown's zombie shield, Gorod Krovi's Guard of Fafnir) and BLOODSTREAKS (equipped here, earned in play). Each item has
// to be earned on its home map first: find it there (Der Eisendrache: take it from its bench; The Giant: the Fly Trap; Nuketown: a shield station; Gorod Krovi: the bunker table for the shield, the grave by the fountain for the Gauntlet), then get item.kills kills
// with it. After that every other map sells it at a terminal for item.price (mains power on). It can't be bought on
// its home map: you build it there. Progress is account-wide in kino.mods.armory (cloud.js TRACKED).
// window.kino.armory: {status(), buy(id) -> true | 'reason' (a Bloodstreak: equip / take off), found(id), kill(id, n)}
import { cloudReady } from '../../profile.js';

const SHIELD_ICON = 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z';
const RAKE_ICON = 'M4 20L15 9M11 5l8 8M12.5 6.5l2-2M15 9l2-2M17.5 11.5l2-2';
export const TABS = [
  { id: 'operators', name: 'OPERATOR WEAPONS', items: [
    { id: 'ragnarok', name: 'Ragnarok DG-4', home: 'der-eisendrache', homeName: 'Der Eisendrache', price: 30000, kills: 250, color: '#5fd0ff',
      blurb: 'Gravity spikes. Slam the ground, or plant them and lift the horde.',
      specs: ['Operator weapon slot: Y to pull it out once charged (bought fully charged)', 'Left mouse slams: kills within 200 (300 from a jump)', 'Right mouse plants a lift field; either button slams them all down', 'Recharges from your kills'] },
    { id: 'annihilator', name: 'Annihilator', home: 'the-giant', homeName: 'The Giant', price: 25000, kills: 150, color: '#f2c14e',
      blurb: "Seraph's revolver. Six depleted-uranium rounds a cylinder, eighteen to a charge.",
      specs: ['Operator weapon slot: Y to pull it out once charged (bought fully charged)', '18 shots: each goes through every zombie in its path', 'One-shot headshots to round 24; kills disintegrate', 'Right mouse aims, V pistol-whips', 'Recharges from your kills'] },
    { id: 'dragon_gauntlet', name: 'Gauntlet of Siegfried', home: 'gorod-krovi', homeName: 'Gorod Krovi', price: 30000, kills: 200, color: '#ff7a2a',
      icon: 'M6 11V6a1.5 1.5 0 0 1 3 0v4V4.5a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v5V7.5a1.5 1.5 0 0 1 3 0V15c0 3.5-2.8 6-6.2 6C8.5 21 6 18.5 6 15z',
      blurb: 'A dragon whelp hatched from the egg, riding a gauntlet. It breathes fire, and it hunts for you.',
      specs: ['Operator weapon slot: Y to pull it out once charged (bought fully charged)', 'Left mouse: a cone of flame (500 units) that burns zombies down; V swipes', 'Right mouse sends the whelp out: it spits fireballs and fetches power-ups; you punch (V jukes forward)', 'Right mouse again calls it back to the arm', 'Recharges from your kills'] },
  ] },
  { id: 'shields', name: 'SHIELDS', items: [
    { id: 'rocket_shield', name: 'Rocket Shield', home: 'der-eisendrache', homeName: 'Der Eisendrache', price: 20000, kills: 250, color: '#ff9a3a', icon: SHIELD_ICON,
      blurb: 'A riot shield with rockets bolted on.',
      specs: ['H raises it: blocks hits from the front (on your back: from behind)', 'Left mouse bashes, right mouse fires a rocket dash (3 charges)', 'Off its home map a charge comes back each round', '1,500 health, then it breaks'] },
    { id: 'zombie_shield', name: 'Zombie Shield', home: 'nuketown', homeName: 'Nuketown', price: 15000, kills: 150, color: '#9fb7c4', icon: SHIELD_ICON,
      blurb: 'A car door on a dolly. Carry it, or stand it in a doorway and let them tear at it.',
      specs: ['H raises it: blocks hits from the front (on your back: from behind)', 'Left mouse bashes, right mouse plants it on the ground', 'Planted it stops zombies, who tear at it (35 hits); F takes it back with its health', '1,500 health, then it breaks'] },
    { id: 'fafnir_shield', name: 'Guard of Fafnir', home: 'gorod-krovi', homeName: 'Gorod Krovi', price: 25000, kills: 250, color: '#ff6a3d', icon: SHIELD_ICON,
      blurb: 'A dragon\'s head bolted to a shield. It still breathes.',
      specs: ['H raises it: blocks hits from the front (on your back: from behind)', 'Left mouse bashes, right mouse breathes fire: flings and burns everything in front out to 1200 (3 charges)', 'A charge comes back each round; a Max Ammo refills them', '1,500 health, then it breaks'] },
  ] },
  // Bloodstreaks (2026-11-22): earned in a match by filling the blood meter with kills (mods/bloodstreaks), not bought. Up
  // to three are equipped here (kino.mods.armory .streaks); `cost` is the blood a streak takes, in kills (a headshot 1.5, a melee kill 2).
  { id: 'streaks', name: 'BLOODSTREAKS', items: [
    { id: 'rake_trap', name: 'Rake Trap', streak: true, home: 'nuketown', homeName: 'Nuketown', findText: 'Build the Rake Trap on Nuketown and take a rake', cost: 60, kills: 100, price: 0, color: '#d0402e', icon: RAKE_ICON,
      blurb: 'Three rakes with an axe and a rope tied on. Lay them down and let the horde step on them.',
      specs: ['Costs 60 blood: a kill fills 1, a headshot 1.5, a melee kill 2', 'Earned, it waits on the command wheel (hold U) until you use it', 'Three rakes in hand: the claymore key lays one at your feet, five down at most', 'A zombie that steps on one loses its head; a rake breaks after 20', 'Going down drains the blood meter (earned streaks are kept)', 'Research augments under Research → BLOODSTREAKS'] },
  ] },
];
const ITEMS = Object.fromEntries(TABS.flatMap(t => t.items.map(i => [i.id, { ...i, tab: t.id }])));
const KEY = 'kino.mods.armory';
export function loadArmory() { try { return { items: {}, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { items: {} }; } }
export const saveArmory = a => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} };
export const unlocked = (rec, item) => !!rec?.found && (rec.kills ?? 0) >= item.kills;
export const STREAKS = TABS.find(t => t.id === 'streaks').items;
export const MAX_STREAKS = 3;
// the equipped Bloodstreaks that are unlocked, cheapest first
export function equippedStreaks(a = loadArmory()) {
  return (a.streaks ?? []).map(id => STREAKS.find(s => s.id === id)).filter(s => s && unlocked(a.items[s.id], s)).sort((x, y) => x.cost - y.cost);
}

export default async function setup(api) {
  const { session, host } = api;
  await cloudReady;
  const mapId = api.map?.id ?? 'kino', kino = window.kino;
  const cheating = () => !!kino?.cheats?.used;

  function found(id) {
    const item = ITEMS[id]; if (!item || cheating()) return;
    const a = loadArmory(), r = a.items[id] ??= { found: false, kills: 0 }; if (r.found) return;
    r.found = true; saveArmory(a);
    api.toast?.(`${item.name} found · ${item.kills} kills with it unlock it in the Armory`, 4);
  }
  function addKill(id, n = 1) {
    const item = ITEMS[id], a = loadArmory(), r = a.items[id];
    if (!item || !r?.found || cheating()) return;
    const was = unlocked(r, item); r.kills = (r.kills ?? 0) + n;
    const now = !was && unlocked(r, item);
    // a Bloodstreak goes straight into a free slot when it unlocks
    if (now && item.streak && !(a.streaks ??= []).includes(id) && a.streaks.length < MAX_STREAKS) a.streaks.push(id);
    saveArmory(a);
    if (now) { api.announce?.(item.name.toUpperCase(), item.streak ? 'BLOODSTREAK UNLOCKED' : 'UNLOCKED IN THE ARMORY', 3); if (item.streak) kino.bloodstreaks?.refresh?.(); }
  }
  // kills with each item: the shields' own bash/dash (rocketShield.hitting / altHitting while the damage lands, kill is synchronous)
  // and the operator weapons' (cause 'operator', recorded by operator-weapons as enemy.lastCause; the one in the slot)
  host.on('kill', e => {
    if (e.remote || !e.enemy || cheating()) return;
    if (kino.fafnir?.killing) addKill('fafnir_shield');   // its breath or its bash (before the zombie shield's alt check: both are alts)
    else if (kino.rocketShield?.hitting) addKill('rocket_shield');
    else if (kino.rocketShield?.altHitting) addKill('zombie_shield');
    else if (e.enemy.lastCause === 'operator' && ITEMS[kino.operator?.current]?.tab === 'operators') addKill(kino.operator.current);
  });

  const owned = id => ITEMS[id]?.tab === 'operators' ? kino.operator?.current === id : id === 'rocket_shield' ? !!kino.rocketShield?.owned : id === 'zombie_shield' ? !!(kino.zombieShield?.held() || kino.zombieShield?.planted()) : id === 'fafnir_shield' ? !!kino.fafnir?.mine() : false;
  // why it can't be bought right now ('' when it can)
  function blocked(item, rec) {
    if (item.streak) return unlocked(rec, item) ? '' : 'locked';   // equipped, not bought: on every map, no power needed
    if (item.home === mapId) return 'home';
    if (!unlocked(rec, item)) return 'locked';
    if (owned(item.id)) return 'owned';
    if (!session.power) return 'power';
    if (session.points < item.price) return 'points';
    return '';
  }
  function status() {
    const a = loadArmory();
    return { power: !!session.power, points: session.points, map: mapId,
      tabs: TABS.map(t => ({ id: t.id, name: t.name, soon: !!t.soon, items: t.items.map(i => {
        const r = a.items[i.id] ?? { found: false, kills: 0 };
        const slot = (a.streaks ?? []).indexOf(i.id);
        return { ...i, icon: i.icon ?? kino.operator?.defs?.get(i.id)?.icon, found: !!r.found, have: Math.min(r.kills ?? 0, i.kills), unlocked: unlocked(r, i),
          owned: owned(i.id), why: blocked(i, r), equipped: i.streak && slot >= 0, slot: slot + 1, slots: (a.streaks ?? []).length };
      }) })) };
  }
  function buy(id) {
    const item = ITEMS[id]; if (!item) return 'Unknown item';
    const r = loadArmory().items[id], why = blocked(item, r);
    if (why === 'home') return `Build it here on ${item.homeName}`;
    if (why === 'locked') return !r?.found ? (item.findText ? item.findText + ' first' : `Find it on ${item.homeName} first`) : (n => `${n} more kill${n === 1 ? '' : 's'} with it on ${item.homeName}`)(item.kills - (r.kills ?? 0));
    if (item.streak) {   // equip or take off
      const a = loadArmory(), list = a.streaks ??= [];
      if (list.includes(id)) list.splice(list.indexOf(id), 1);
      else if (list.length >= MAX_STREAKS) return `All ${MAX_STREAKS} Bloodstreak slots are full: take one off first`;
      else list.push(id);
      saveArmory(a); kino.bloodstreaks?.refresh?.(); return true;
    }
    if (why === 'owned') return 'You already have it';
    if (why === 'power') return 'No mains power';
    if (session.phase === 'reviving' || session.busy) return 'Terminal busy';
    if (ITEMS[id].tab === 'operators' && kino.operator?.active) return 'Put your operator weapon away first';
    if (host.gunBlocked) return 'Lower what you are holding first';
    if (id === 'zombie_shield' && !kino.zombieShield?.ready) return 'The shield model is missing';
    if (id === 'fafnir_shield' && !kino.fafnir?.ready) return 'The shield model is missing';
    if (id === 'dragon_gauntlet' && !kino.dragonGauntlet?.ready) return 'The gauntlet model is missing';
    if (!session.spend(item.price)) return 'Not enough points';
    if (ITEMS[id].tab === 'operators') kino.operator?.give(id, { full: true });
    else if (id === 'rocket_shield') kino.rocketShield?.give();
    else if (id === 'zombie_shield') kino.zombieShield.give();
    else if (id === 'fafnir_shield') kino.fafnir.give();
    return true;
  }
  kino.armory = { status, buy, found, kill: addKill };
}

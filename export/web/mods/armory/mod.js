// The Armory (ARMORY.EXE on the terminal booth, user 2026-10-17): special gear bought outside the map it comes from,
// in tabs: OPERATOR WEAPONS (the Ragnarok DG-4, the Annihilator), SHIELDS (the rocket shield) and SCORESTREAKS (to come). Each item has
// to be earned on its home map first: find it there (Der Eisendrache: take it from its bench; The Giant: the Fly Trap), then get item.kills kills
// with it. After that every other map sells it at a terminal for item.price (mains power on). It can't be bought on
// its home map: you build it there. Progress is account-wide in kino.mods.armory (cloud.js TRACKED).
// window.kino.armory: {status(), buy(id) -> true | 'reason', found(id)}
import { cloudReady } from '../../profile.js';

const SHIELD_ICON = 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z';
export const TABS = [
  { id: 'operators', name: 'OPERATOR WEAPONS', items: [
    { id: 'ragnarok', name: 'Ragnarok DG-4', home: 'der-eisendrache', homeName: 'Der Eisendrache', price: 30000, kills: 250, color: '#5fd0ff',
      blurb: 'Gravity spikes. Slam the ground, or plant them and lift the horde.',
      specs: ['Operator weapon slot: Y to pull it out once charged (bought fully charged)', 'Left mouse slams: kills within 200 (300 from a jump)', 'Right mouse plants a lift field; either button slams them all down', 'Recharges from your kills'] },
    { id: 'annihilator', name: 'Annihilator', home: 'the-giant', homeName: 'The Giant', price: 25000, kills: 150, color: '#f2c14e',
      blurb: "Seraph's revolver. Six depleted-uranium rounds a cylinder, eighteen to a charge.",
      specs: ['Operator weapon slot: Y to pull it out once charged (bought fully charged)', '18 shots: each goes through every zombie in its path', 'One-shot headshots to round 24; kills disintegrate', 'Right mouse aims, V pistol-whips', 'Recharges from your kills'] },
  ] },
  { id: 'shields', name: 'SHIELDS', items: [
    { id: 'rocket_shield', name: 'Rocket Shield', home: 'der-eisendrache', homeName: 'Der Eisendrache', price: 20000, kills: 250, color: '#ff9a3a', icon: SHIELD_ICON,
      blurb: 'A riot shield with rockets bolted on.',
      specs: ['H raises it: blocks hits from the front (on your back: from behind)', 'Left mouse bashes, right mouse fires a rocket dash (3 charges)', 'Off its home map a charge comes back each round', '1,500 health, then it breaks'] },
  ] },
  { id: 'streaks', name: 'SCORESTREAKS', soon: true, items: [] },
];
const ITEMS = Object.fromEntries(TABS.flatMap(t => t.items.map(i => [i.id, { ...i, tab: t.id }])));
const KEY = 'kino.mods.armory';
export function loadArmory() { try { return { items: {}, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { items: {} }; } }
const saveArmory = a => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} };
export const unlocked = (rec, item) => !!rec?.found && (rec.kills ?? 0) >= item.kills;

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
  function addKill(id) {
    const item = ITEMS[id], a = loadArmory(), r = a.items[id];
    if (!r?.found) return;
    const was = unlocked(r, item); r.kills = (r.kills ?? 0) + 1; saveArmory(a);
    if (!was && unlocked(r, item)) api.announce?.(item.name.toUpperCase(), 'UNLOCKED IN THE ARMORY', 3);
  }
  // kills with each item: the shield's own bash/dash (rocketShield.hitting while its damage lands, kill is synchronous)
  // and the operator weapons' (cause 'operator', recorded by operator-weapons as enemy.lastCause; the one in the slot)
  host.on('kill', e => {
    if (e.remote || !e.enemy || cheating()) return;
    if (kino.rocketShield?.hitting) addKill('rocket_shield');
    else if (e.enemy.lastCause === 'operator' && ITEMS[kino.operator?.current]?.tab === 'operators') addKill(kino.operator.current);
  });

  const owned = id => ITEMS[id]?.tab === 'operators' ? kino.operator?.current === id : id === 'rocket_shield' ? !!kino.rocketShield?.owned : false;
  // why it can't be bought right now ('' when it can)
  function blocked(item, rec) {
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
        return { ...i, icon: i.icon ?? kino.operator?.defs?.get(i.id)?.icon, found: !!r.found, have: Math.min(r.kills ?? 0, i.kills), unlocked: unlocked(r, i),
          owned: owned(i.id), why: blocked(i, r) };
      }) })) };
  }
  function buy(id) {
    const item = ITEMS[id]; if (!item) return 'Unknown item';
    const r = loadArmory().items[id], why = blocked(item, r);
    if (why === 'home') return `Build it here on ${item.homeName}`;
    if (why === 'locked') return !r?.found ? `Find it on ${item.homeName} first` : (n => `${n} more kill${n === 1 ? '' : 's'} with it on ${item.homeName}`)(item.kills - (r.kills ?? 0));
    if (why === 'owned') return 'You already have it';
    if (why === 'power') return 'No mains power';
    if (session.phase === 'reviving' || session.busy) return 'Terminal busy';
    if (ITEMS[id].tab === 'operators' && kino.operator?.active) return 'Put your operator weapon away first';
    if (host.gunBlocked) return 'Lower what you are holding first';
    if (!session.spend(item.price)) return 'Not enough points';
    if (ITEMS[id].tab === 'operators') kino.operator?.give(id, { full: true });
    else if (id === 'rocket_shield') kino.rocketShield?.give();
    return true;
  }
  kino.armory = { status, buy, found };
}

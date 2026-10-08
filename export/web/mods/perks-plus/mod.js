// Stamin-Up, Deadshot Daiquiri and Mule Kick for every map (not part of upstream). Moon has them natively and keeps its
// own versions (moon-session.js, maps/moon.js); everywhere else:
//   - the perk table gets their names, prices and HUD icons (the engine's buy prompt, HUD and Perk-a-Cola use it)
//   - their drinks come from data.json (Moon's bottles and drink animation, merged into the game data by the mod loader)
//   - Stamin-Up: walk and sprint speeds x1.1 / x1.16 (Moon's 190 -> 209, 285 -> 330). The speeds become getters over a
//     base value, so whatever else sets them (mech, suits) sets the base and the perk still applies on top.
//   - Deadshot: headshots deal 25% more (bullets); the tighter hip fire (x0.5 spread) is in engine.js
//   - Mule Kick: the third weapon slot is in rules.js (Session.giveWeapon / clearPerks)
export const MORE_PERKS = {
  specialty_longersprint: { name: 'Stamin-Up', price: 2000, color: '#ebbd4b', icon: 'S' },
  specialty_deadshot: { name: 'Deadshot Daiquiri', price: 1500, color: '#9da8ac', icon: 'DS' },
  specialty_additionalprimaryweapon: { name: 'Mule Kick', price: 4000, color: '#82a86c', icon: 'MK' },
};
// their purchase stings: Moon's (BO1) recordings, played by the engine as audio.play(<perk id>)
const STINGS = { specialty_longersprint: 'moon/audio/bce4d0477d3fb5e84e5d.ogg', specialty_deadshot: 'moon/audio/b08fede0bf04968b7f78.ogg',
  specialty_additionalprimaryweapon: 'moon/audio/5319f7e83b450594a1f5.ogg' };
export default function setup({ host, session, player, world, map, audio }) {
  if (map?.id === 'moon') return;
  const table = world?.perkInfo;
  if (table) for (const [id, p] of Object.entries(MORE_PERKS)) table[id] ??= p;
  if (audio?.manifest) for (const [id, url] of Object.entries(STINGS)) audio.manifest[id] ??= { url };
  const has = id => session.perks?.has(id);
  for (const [key, factor] of [['moveSpeed', 209 / 190], ['sprintSpeed', 330 / 285]]) {
    let base = player[key];
    Object.defineProperty(player, key, { configurable: true, get: () => base * (has('specialty_longersprint') ? factor : 1), set: v => { base = v; } });
  }
  host.on('beforeEnemyDamage', e => { if (e.head && e.cause === 'bullet' && !e.melee && has('specialty_deadshot')) e.amount *= 1.25; });
}

// Nuketown's tiles in the Tab scoreboard (mods/scoreboard: kino.scoreboard.addCollectible), as Malibu Drive's and Der
// Eisendrache's tab.js: the way into the lab (transformers, then the bunker), the power levers, the three tools and the
// elevator panels they repair, the skull key and Pack-a-Punch, the falling perks and the closet's free perk. Parts rows
// read dark = not found, white = in progress, gold = done. 2026-10-27, user: "add the tracking to the tab menu".
const PERKS = { specialty_quickrevive: ['Quick Revive', 'QR'], specialty_rof: ['Double Tap', 'DT'], specialty_fastreload: ['Speed Cola', 'SC'],
  specialty_additionalprimaryweapon: ['Mule Kick', 'MK'], specialty_flakjacket: ['PhD Flopper', 'Ph'], specialty_deadshot: ['Deadshot', 'DS'] };

export function setupTab(api, state) {
  const { host } = api;
  const part = (label, state, short) => ({ label, short, state });
  const add = def => window.kino.scoreboard.addCollectible(def);
  function register() {
    add({ id: 'nt-bunker', label: 'The bunker', value: () => { const s = state(); return s.bunker ? 'Open' : `${s.generators} / ${s.generatorCount} transformers`; }, done: () => state().bunker });
    add({ id: 'nt-power', label: 'Power', value: () => { const s = state(); return s.power ? 'On' : s.lever2 ? 'Lever 1 / 2 pulled' : 'Off'; }, done: () => state().power });
    add({ id: 'nt-panels', label: 'Elevator panels',
      parts: () => state().tools.map(t => part(t.name[0].toUpperCase() + t.name.slice(1), t.fixed ? 'placed' : t.got ? 'carried' : 'none', t.name.slice(0, 2).replace(/^./, c => c.toUpperCase()))),
      value: () => { const n = state().tools.filter(t => t.fixed).length; return n >= 3 ? 'Repaired' : `${n} / 3 repaired`; },
      done: () => state().tools.every(t => t.fixed) });
    add({ id: 'nt-skull', label: 'Skull key',
      value: () => { const s = state(); return s.pap ? 'Pack-a-Punch open' : s.placed ? 'The seal is breaking' : s.skull ? 'Carried' : s.elevator ? 'On the elevator' : 'In the pit'; },
      done: () => state().pap });
    add({ id: 'nt-perks', label: 'Falling perks',
      parts: () => state().perks.map(d => { const [name, short] = PERKS[d.perk] ?? [d.perk, d.perk.slice(10, 12)]; return part(name, d.landed ? 'placed' : d.called ? 'carried' : 'none', short); }),
      value: () => { const p = state().perks; return `${p.filter(d => d.landed).length} / ${p.length} landed`; },
      done: () => state().perks.every(d => d.landed) });
    add({ id: 'nt-free-perk', label: 'Free perk', value: () => state().freePerk ? 'Taken' : 'Not found', done: () => state().freePerk });
  }
  // the scoreboard (a core mod) may set up after this map's mod
  if (window.kino?.scoreboard) register();
  else { const off = host.on('update', () => { if (!window.kino?.scoreboard) return; off?.(); register(); }); }
}

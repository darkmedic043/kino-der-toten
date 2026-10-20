// Malibu Drive's tiles in the Tab scoreboard (mods/scoreboard: kino.scoreboard.addCollectible), as Der Eisendrache's
// tab.js: the carried part, the Infinity Stones, the main Easter egg and its locks, the bed machine, the four stations,
// Batman, the police cell, JARVIS and Tony's armor. Parts rows read dark = not found, white = in progress, gold = done.
// Everything is the team's (the quests' synced state), except the armor you wear. 2026-10-19, user: "make sure these
// collectables trackers are in malibu drive too".
const ROMAN = { mk1: 'I', mk3: 'III', mk4: 'IV', mk5: 'V', mk6: 'VI', mk16: 'XVI', mk33: 'XXXIII', mk42: 'XLII', wm: 'WM' };
const EE_STEPS = 18;

export function setupTab(api, { quests, tony }) {
  const { host } = api;
  const part = (label, state, short) => ({ label, short, state });
  const stage = (going, done) => (done ? 'placed' : going ? 'carried' : 'none');
  const add = def => window.kino.scoreboard.addCollectible(def);
  const Q = () => quests.state(), F = () => quests.flags(), T = () => tony.state();
  const label = id => id ? id.replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()) : 'None';
  function register() {
    add({ id: 'mal-part', label: 'Carried part', value: () => { const q = Q(); return q.part ? q.partLabel ?? label(q.part) : 'None'; }, done: () => false });
    add({ id: 'mal-stones', label: 'Infinity Stones',
      parts: () => { const q = Q(), f = F().stones; return [
        part('Time', stage(q.timeState !== 'idle', f.time), 'Ti'), part('Power', stage(q.powerHits > 0, f.power), 'Po'),
        part('Reality', stage(false, f.reality), 'Re'), part('Soul', stage(q.soulState !== 'hidden', f.soul), 'So')]; },
      value: () => { const q = Q(); return q.papLocked ? `${q.stones} / 4 placed` : 'Pack-a-Punch open'; },
      done: () => !Q().papLocked });
    add({ id: 'mal-ee', label: 'Easter egg', value: () => { const s = Q().step; return s >= EE_STEPS ? 'Complete' : `Step ${s + 1} / ${EE_STEPS}`; }, done: () => Q().step >= EE_STEPS });
    add({ id: 'mal-locks', label: 'Group 935 locks',
      parts: () => { const l = F().locks, q = Q(); return [part('Dials', stage(q.dials.some(Boolean), l.dials), 'Di'), part('Consoles', stage(false, l.consoles), 'Co'), part('Charger', stage(false, l.charger), 'Ch')]; },
      value: () => `${Q().locks} / 3`, done: () => Q().locks >= 3 });
    add({ id: 'mal-bed', label: 'Bed machine',
      parts: () => { const b = F().built ?? [], q = Q(); return [part('Parts', stage(b.length > 0, b.length >= 3), 'Pa'), part('Charge', stage(q.charge > 0, q.charge >= 100), 'Ch')]; },
      value: () => { const b = F().built ?? [], q = Q(); return b.length < 3 ? `${b.length} / 3 parts` : q.charge >= 100 ? 'Charged' : `${q.charge} / 100 charged`; },
      done: () => (F().built ?? []).length >= 3 && Q().charge >= 100 });
    add({ id: 'mal-stations', label: 'The four stations',
      parts: () => { const q = Q(), m = F().machines; return [part('Buttons', stage(q.a > 0, m.a), 'Bu'), part('Plates', stage(q.b > 0, m.b), 'Pl'), part('Targets', stage(q.c > 0, m.c), 'Ta'), part('Dishes', stage(q.d > 0, m.d), 'Sh')]; },
      value: () => `${Q().machines} / 4`, done: () => Q().machines >= 4 });
    add({ id: 'mal-batman', label: 'Batman',
      parts: () => { const f = F(); return [part('Rangs', stage(f.batEggs > 0, f.batEggs >= 4), 'Ba'), part('Seen', stage(f.batSightings > 0 || f.batmanGone, f.batSightings >= 4), 'Si')]; },
      value: () => { const f = F(); return f.batSightings >= 4 ? 'Gone for good' : f.batmanGone ? `Seen ${f.batSightings} / 4 times` : `${f.batEggs} / 4 batarangs`; },
      done: () => F().batSightings >= 4 });
    add({ id: 'mal-cell', label: 'Police cell', value: () => { const q = Q(); return q.cellOpen ? 'Open' : q.part === 'police' ? 'Key carried' : 'Locked'; }, done: () => Q().cellOpen });   // (keyIdx is which key is out, not that you have it)
    add({ id: 'mal-jarvis', label: 'JARVIS', value: () => { const t = T(); return t.jarvisOn ? 'Online' : `${t.towers} / 5 towers`; }, done: () => T().jarvisOn });
    add({ id: 'mal-armor', label: 'Armor', value: () => { const t = T(); return t.worn ? `Mark ${ROMAN[t.worn] ?? t.worn}` : t.summoned ? `Mark ${ROMAN[t.summoned] ?? t.summoned} ${t.landed ? 'landed' : 'on its way'}` : t.wmBought ? 'War Machine bought' : 'None'; }, done: () => !!T().worn });
  }
  // the scoreboard (a core mod) may set up after this map's mod
  if (window.kino?.scoreboard) register();
  else { const off = host.on('update', () => { if (!window.kino?.scoreboard) return; off?.(); register(); }); }
}

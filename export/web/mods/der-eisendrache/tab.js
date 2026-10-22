// Der Eisendrache's tiles in the Tab scoreboard (mods/scoreboard: kino.scoreboard.addCollectible): the buildables and
// their parts, the gondola fuse, the Easter egg's items and progress, the bows, Pack-a-Punch and the side eggs.
// Parts rows read dark = not found, white = carried, gold = built/placed. Everything here is the team's (co-op: the
// systems' own synced state), except the Wrath of the Ancients tile (your own bow).
const ELS = [['storm', 'Storm', 'St'], ['rune', 'Fire', 'Fi'], ['wolf', 'Wolf', 'Wo'], ['demon', 'Void', 'Vo']];
const STEP = {
  beacons: 'beacons', wallrun: 'wall-run', batteries: 'batteries', reforge: 'reforge', obelisk: 'obelisk', circles: 'runic circles', clock: 'the clock',
  golf: 'magma golf', fireplace: 'fireplace', shrine: 'skull shrine', skull: 'the skull', escort: 'Skadi', burial: 'burial chamber',
  seal: 'the seal', urn: 'the urn', fossils: 'fossils', crawlers: 'crawlers', runes: 'rune sequence',
};

export function setupTab(api, { craft, gondola, bow, bows, pap, ee, side, side2 }) {
  const { host } = api;
  const net = () => window.kino?.coop;
  const nameOf = id => (id === (net()?.id ?? 'solo') ? 'you' : net()?.players?.get(id)?.name ?? 'a teammate');
  const part = (label, state, short) => ({ label, short, state });
  const stage = (have, done) => (done ? 'placed' : have ? 'carried' : 'none');
  const add = def => window.kino.scoreboard.addCollectible(def);
  function register() {
    // buildables
    for (const [key, name, parts] of [['spike', 'Ragnarok DG-4', [['body', 'Spikes'], ['guards', 'Guards'], ['handle', 'Handle']]], ['shield', 'Rocket Shield', [['dolly', 'Eagle'], ['clamp', 'Window'], ['door', 'Fuel tank']]]]) {
      add({ id: 'de-' + key, label: name,
        parts: () => { const s = craft.state(); return parts.map(([p, l]) => part(l, stage(s.have[key].includes(p), !!s.built[key]))); },
        value: () => { const s = craft.state(); return s.built[key] ? (key === 'shield' && s.shield?.owned ? 'Built · yours' : 'Built') : `${s.have[key].length} / 3`; },
        done: () => !!craft.state().built[key] });
    }
    // the gondola fuse (zombies drop it; the console calls the car)
    add({ id: 'de-fuse', label: 'Gondola fuse', parts: () => { const g = gondola.state(); return [part('Fuse', g.held || g.heldBy ? 'carried' : g.fuseOnGround ? 'none' : 'none', 'Fu')]; },
      value: () => { const g = gondola.state(); return g.heldBy ? `Carried by ${nameOf(g.heldBy)}` : g.held ? 'Carried by you' : g.fuseOnGround ? 'On the ground' : 'None dropped'; } });
    // the Easter egg: its items, then its step
    const ITEMS = [['canister', 'canisterPlaced', 'Canister', 'Ca'], ['fuse', 'fusePlaced', 'Fuse', 'Fu'], ['key', 'keyUsed', 'Key', 'Ke'],
      ['stone', 'stonePlaced', 'Stone', 'St'], ['vril', 'vrilPlaced', 'Vril', 'Vr'], ['tc', 'tcTaken', 'Tesla', 'Tc']];
    add({ id: 'de-ee-items', label: 'Easter egg items', parts: () => { const s = ee.state(); return ITEMS.map(([h, d, l, sh]) => part(l, stage(s.have.includes(h), s.done.includes(d)), sh)); },
      value: () => { const s = ee.state(); return `${ITEMS.filter(([, d]) => s.done.includes(d)).length} / ${ITEMS.length} placed`; },
      done: () => { const s = ee.state(); return ITEMS.every(([, d]) => s.done.includes(d)); } });
    add({ id: 'de-ee', label: 'Easter egg', value: () => { const s = ee.state(); return s.step >= 9 ? 'Complete' : s.step >= 8 ? 'The Keeper' : `Step ${s.step + 1} / 8`; }, done: () => ee.state().step >= 9 });
    // bows
    add({ id: 'de-wrath', label: 'Wrath of the Ancients', value: () => { const s = bow.state(); return s.taken ? 'Taken' : s.charged ? 'Ready in the courtyard' : `Dragons fed ${s.souls.filter(([, n]) => n >= 8).length} / 3`; }, done: () => bow.state().taken });
    add({ id: 'de-bows', label: 'Bow upgrades',
      parts: () => { const s = bows.state(); return ELS.map(([el, l, sh]) => part(l, s[el].stage === 'taken' ? 'placed' : s[el].stage === 'idle' ? 'none' : 'carried', sh)); },
      value: () => {
        const s = bows.state(), me = net()?.id ?? 'solo', own = ELS.find(([el]) => s[el].owner === me);
        if (own) { const q = s[own[0]]; return `${own[1]}: ${q.step ? STEP[q.step] ?? q.step : q.stage === 'place' ? 'to the pedestal' : q.stage === 'souls' ? `souls ${q.souls} / 20` : q.stage}`; }
        return `${ELS.filter(([el]) => s[el].stage === 'taken').length} / 4 upgraded`;
      }, done: () => ELS.every(([el]) => bows.state()[el].stage === 'taken') });
    add({ id: 'de-pap', label: 'Pack-a-Punch', value: () => { const s = pap.state(); return s.reformed ? 'Formed' : `${s.active.length} / 2 lit`; }, done: () => pap.state().reformed });
    // side eggs
    add({ id: 'de-music', label: 'Music eggs', parts: () => { const s = side2.state(); return [part('Gramophones', s.gram >= 3 ? 'placed' : s.gram ? 'carried' : 'none', 'Gr'), part('Bears', s.bears >= 3 ? 'placed' : s.bears ? 'carried' : 'none', 'Te')]; },
      value: () => { const s = side2.state(); return `${s.gram} / 3 · ${s.bears} / 3`; }, done: () => { const s = side2.state(); return s.gram >= 3 && s.bears >= 3; } });
    add({ id: 'de-side', label: 'Side quests',
      parts: () => { const a = side.state(), b = side2.state(); return [
        part('Plates', a.plates ? 'placed' : a.pads.length ? 'carried' : 'none', 'Pl'), part('Plunger', a.plunger ? 'placed' : 'none', 'Pu'),
        part('Plant', a.sprout === 'done' ? 'placed' : a.sprout === 'pot' ? 'none' : 'carried', 'Pn'), part('Clock', b.clock.wallrun ? 'placed' : b.clock.powered ? 'carried' : 'none', 'Cl'),
        part('Skulls', b.skulls.length >= 3 ? 'placed' : b.skulls.length ? 'carried' : 'none', 'Sk'), part('Claws', b.hat ? 'placed' : b.claws.some(x => x) ? 'carried' : 'none', 'Cw')]; },
      value: () => { const a = side.state(), b = side2.state(); return `${[a.plates > 0, a.plunger, a.sprout === 'done', b.clock.wallrun, b.skulls.length >= 3, b.hat].filter(Boolean).length} / 6`; } });
  }
  // the scoreboard (a core mod) may set up after this map's mod
  if (window.kino?.scoreboard) register();
  else { const off = host.on('update', () => { if (!window.kino?.scoreboard) return; off?.(); register(); }); }
}

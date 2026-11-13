(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), k = window.kino, out = {}, C = k.castle, E = k.mods.api.enemies, P = k.mods.api.player;
  const warns = [], cw = console.warn; console.warn = (...a) => { warns.push(a.map(x => String(x?.message ?? x)).join(' ').slice(0, 200)); cw.apply(console, a); };
  const errs = []; window.addEventListener('error', e => errs.push(String(e.message).slice(0, 200)));
  k.debug.setInvulnerable(true);
  const PADS = [[-1191, 200, -2541], [-907, 200, -2256], [-1192, 200, -1972], [-1476, 200, -2257]];
  const feet = () => P.getFeetPosition(), dist = z => Math.round(Math.hypot(z.root.position.x - feet().x, z.root.position.z - feet().z));
  out.steps = []; let ids = [];
  for (let i = 0; i < 4; i++) {
    k.debug.teleportPlayer([PADS[i][0], PADS[i][1] + 30, PADS[i][2]]); await sleep(700);
    if (i === 0) ids = [2, 3].map(j => k.debug.spawnEnemy([PADS[j][0], feet().y, PADS[j][2]], 'zombie'));
    const f0 = feet().toArray().map(Math.round); await sleep(3800);
    const mine = E.list.filter(z => ids.includes(z.id));
    out.steps.push({ pad: i, feet: f0, pads: C.lowgrav.state().pads, zombies: mine.map(z => [dist(z), z.state, z.rig?.current]) });
  }
  await sleep(6000); const s = C.lowgrav.state(); out.low = { on: s.on, inside: s.inside, left: s.left, gravity: Math.round(P.gravity) };
  // every zombie alive: is anyone stuck? (moved under 15 units in 6 s while chasing, over 150 from me)
  const before = new Map(E.list.map(z => [z.id, z.root.position.clone()])); await sleep(6000);
  out.alive = E.list.length; out.stuck = E.list.filter(z => before.has(z.id) && z.state === 'chase' && dist(z) > 150 && z.root.position.distanceTo(before.get(z.id)) < 15).map(z => [z.id, z.root.position.toArray().map(Math.round), dist(z)]);
  out.mine = E.list.filter(z => ids.includes(z.id)).map(z => [dist(z), z.state]);
  out.warns = warns.slice(0, 8); out.errs = errs.slice(0, 8);
  return out;
})()

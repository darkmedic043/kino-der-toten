(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), k = window.kino, out = {}, net = k.coop, C = k.castle;
  const warns = [], cw = console.warn; console.warn = (...a) => { warns.push(a.map(x => String(x?.message ?? x)).join(' ').slice(0, 200)); cw.apply(console, a); };
  const errs = []; window.addEventListener('error', e => errs.push(String(e.message).slice(0, 200)));
  const T = C.traps, R = () => T.state().rocket, L = R().doorLine;
  const at = (d, u = 0) => [L.mid[0] + L.n[0] * d - L.n[1] * u, L.mid[1] - 150, L.mid[2] + L.n[1] * d + L.n[0] * u];
  k.debug.teleportPlayer(at(420)); await sleep(1500);
  const y = k.debug.getState().player.position[1] - 45, pin = at(-50, 60); pin[1] = y;
  const id = k.debug.spawnEnemy(pin, 'zombie'); await sleep(5000);
  const z = k.mods.api.enemies.list.find(e => e.id === id); out.spawned = z ? [z.state, z.rig?.current] : null;
  // from here this page is a guest of a host that is not there: the host's messages are fed in by hand
  net.id = 'G'; net.hostId = 'H'; out.guest = [C.sync.online, C.sync.isHost, C.sync.me];
  let n = 0; const cev = (type, data) => net.emit('cev', { t: 'cev', n: ++n, type, data, by: 'H', seed: 777 + n }, 'H');
  // 1. the plates: a teammate stands on each and locks it
  for (let i = 0; i < 4; i++) { cev('gravStand', { k: i, on: true }); await sleep(120); cev('gravPad', { k: i }); await sleep(120); }
  out.plates = C.lowgrav.state().pads;
  // 2. the clock tower wall: a teammate starts the Fire Bow quest
  cev('bqStart', { el: 'rune' }); await sleep(300); const b = C.bows.state().rune; out.rune = [b.stage, b.owner];
  // 3. the rocket test, from the host's 5 Hz state; the zombie is held where the host would hold it
  let rk = null; const t0 = performance.now(), el = () => (performance.now() - t0) / 1000;
  const feed = setInterval(() => { if (rk) net.emit('cst', { t: 'cst', s: { rocket: rk() } }, 'H'); }, 200);
  let hold = true; const pinIt = () => { if (hold && z?.root) { z.root.position.set(pin[0], z.root.position.y, pin[2]); } if (hold) requestAnimationFrame(pinIt); }; pinIt();
  rk = () => ({ next: null, phase: 8 + el() >= 20 ? 'fire' : 'warn', t: 8 + el(), re: null });
  out.series = []; const snap = tag => { const r = R(); out.series.push([tag, r.phase, Math.round(r.t ?? -1), +r.door.toFixed(2), r.beating, z ? z.state + ':' + z.rig?.current : '-', C.lowgrav.state().on ? 'lowg' : '']); };
  for (let i = 0; i < 8; i++) { await sleep(2000); snap('run'); }
  const t1 = performance.now(); rk = () => { const re = (performance.now() - t1) / 1000; return { next: 200, phase: null, t: 0, re: re < 7.5 ? re : null }; };
  for (let i = 0; i < 5; i++) { await sleep(2000); snap('open'); }
  hold = false; clearInterval(feed); net.id = null; net.hostId = null;
  out.lowgrav = (({ on, left, pads }) => ({ on, left, pads }))(C.lowgrav.state()); out.warns = warns.slice(0, 8); out.errs = errs.slice(0, 8);
  return out;
})()

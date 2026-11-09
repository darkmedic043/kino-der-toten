// The Debt Collector (debt_collector_zm): a loan shark's revolver, a Melon Zombies original (docs/fork/melon-weapons.md).
// Every hit BANKS its damage on the zombie instead of dealing it (a gold coin over its head shows what it owes, and the
// debt grows with interest); RELOADING COLLECTS: as the cylinder swings out, every debtor within 2,000 takes what it owes
// at once. A debtor that dies some other way defaults: its debt passes to the nearest zombie within 300.
// Built by .tools/build-debt-collector.py + .tools/assemble-grimhawk.mjs --gun debt on the Python's skeleton (its
// animations drive it; the cylinder variants hang off j_bolt so they swing out with the crane). Sounds: the Python's,
// with a coin tick and a till of our own. A Melon Pass Season 1 reward (released 2026-11-08): progression.json unlock.
//
// Attachments (weapon-levels attachments.json, ids dc_*):
//   dc_loupe     Appraiser's Loupe (optic, reflex): aimed hits bank 25% more
//   dc_brake     Foreclosure Brake (muzzle): a debtor owing more than its health is foreclosed: it shuffles at half speed
//   dc_compound  Compound Interest Cylinder (mag, replaces the ledger cylinder): 5 rounds; interest compounds at 8% a
//                second on everything owed, up to +150% (+300% Pack-a-Punched)
//   dc_roulette  Double or Nothing (mag, replaces the ledger cylinder): each collection spins the wheel: red doubles
//                every debt (x1.6), black forgives them all, the green zero pays x4
//   dc_hook      Repo Hook (underbarrel): collecting drags every debtor up to 150 toward you and staggers it
//   dc_payday    Payday Clip (ammo): collections pay 5% of what they collect as points (up to 100 a zombie)
//   dc_bailiff   The Bailiff (stock): a carbine conversion (long barrel, walnut handguard, wire stock): double range,
//                +30% damage, tighter aim and hip fire, and each shot bills the zombie behind too; no muzzle or barrel
//   dc_spiral    Debt Spiral Barrel (barrel): each further hit on a debtor banks 15% more than the last (up to +75%)
//   dc_ticker    Ticker Tape Laser (laser): a gold laser, tighter hip fire, and a debtor's tag turns red once the
//                collection will kill it
//   dc_shark     Loan Shark Grips (grip): 25% faster reloads, and a melee on a debtor collects its debt on the spot
// Pack-a-Punched (Hostile Takeover): 8 rounds, harder hits, interest up to +100%, and a debtor killed by a collection
// spills its overkill onto the nearest zombie that owes nothing.
import * as THREE from 'three';

const BASE = new URL('./', import.meta.url).href;
export const DEBT = 'debt_collector_zm';
const ATTACHMENT_TAGS = ['tag_dc_loupe', 'tag_dc_brake', 'tag_dc_compound', 'tag_dc_roulette', 'tag_dc_hook', 'tag_dc_payday',
  'tag_dc_bailiff', 'tag_dc_spiral', 'tag_dc_ticker', 'tag_dc_shark'];
const GOLD = 0xffc23a, RED = 0xff3a2a, GREEN = 0x3cff8a;
const RANGE = 2000, DEFAULT_REACH = 300, SPILL_REACH = 400;   // collect reach, a defaulted debt's reach, PaP overkill's reach
const RATE = .05, CAP = .5, PAP_CAP = 1, COMPOUND = .08;   // interest a second and its cap (of the principal)
const BAILIFF_SHIFT = 7.2;   // the Bailiff's barrel runs 7.2 further: the muzzle flash moves out with it

export function prepareDebt(data) {
  const py = data.weapons.python_zm;
  if (!py) { console.warn('[melon-weapons] no Python to build the Debt Collector on'); return; }
  const model = BASE + 'debt_view.glb?v=1', worldModel = BASE + 'debt_world.glb?v=1';
  const common = {
    hideTags: [...ATTACHMENT_TAGS], model, worldModel, automatic: false, fireType: 'Single Shot', pellets: 1, headMultiplier: 2.5,
    explosionRadius: 0, projectileSpeed: 0, segmentedReload: true, reloadStartAdd: 1, reloadStartTime: 1.3, reloadEndTime: .8,
    weaponClass: 'Pistol', gunsmith: true, killCauses: ['debt'], debt: true, weight: 1.15,
  };
  const gun = Object.assign(structuredClone(py), common, {
    id: DEBT, name: 'The Debt Collector', price: 1950, clipSize: 6, startAmmo: 48, maxAmmo: 84, damage: 1100, minDamage: 650, range: 1000,
    fireTime: .16, reloadTime: .65, reloadEmptyTime: .65, reloadAmmoAdd: 6, adsFov: 60,
  });
  gun.upgrade = Object.assign(structuredClone(py.upgrade ?? py), common, {
    name: 'Hostile Takeover', clipSize: 8, startAmmo: 96, maxAmmo: 120, damage: 2600, minDamage: 1700, range: 1200,
    fireTime: .14, reloadTime: .6, reloadEmptyTime: .6, reloadAmmoAdd: 8, adsFov: 60,
  });
  for (const o of [gun, gun.upgrade]) for (const k of ['projectileType', 'projectileModel']) delete o[k];
  data.weapons[DEBT] = gun;   // a Melon Pass Season 1 reward: progression.json unlock pass.s2.weapon.debtcollector (profile.js passLocked)
}

export function setupDebt(api) {
  const { host, session, camera, scene, world, enemies, audio, view, data, player } = api;
  if (!data.weapons[DEBT]) return;
  const isDebt = def => (def?.baseId ?? def?.id) === DEBT;
  const attsOf = def => String(def?.attachments ?? '').split('+');
  const held = () => isDebt(session.def) ? session.def : null;
  const now = () => session.time ?? performance.now() / 1000;
  const alive = z => !!z && !(z.dead || z.state === 'dead' || z.health <= 0) && enemies.list.includes(z);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const gambler = () => window.kino?.classes?.cls?.id === 'gambler';

  // ---- sound: the Python's shot and reload; a coin tick for a banked hit, a till for a collection -------------------
  const weaponSound = audio.weapon.bind(audio);
  audio.weapon = (kind, def, ...rest) => isDebt(def) ? weaponSound(kind, { ...def, id: 'python_zm', baseId: 'python_zm' }, ...rest) : weaponSound(kind, def, ...rest);
  const ctxOut = () => (audio.ctx && audio.master ? [audio.ctx, audio.master] : [null, null]);
  function ping(freq, gain, at = 0, len = .35, type = 'sine') {
    const [ctx, out] = ctxOut(); if (!ctx) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .004); g.gain.exponentialRampToValueAtTime(.0004, t + len);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + .02);
  }
  const tick = () => { ping(2650 + Math.random() * 300, .05, 0, .09); ping(5300, .015, 0, .05); };
  function till(big) {   // ka-ching: a drawer thunk and two bells
    ping(110, .25, 0, .12, 'triangle');
    ping(1568, .14, .05, .5); ping(2093, .12, .1, .7); ping(3136, .05, .1, .4);
    if (big) { ping(2637, .1, .2, .8); ping(3520, .06, .26, .8); }
  }

  // ---- shared textures and materials (built while loading: engine.warmShaders) --------------------------------------
  const canvasTex = (draw, size = 64) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const coinTex = canvasTex((g, s) => {   // a gold coin face with a struck $
    const r = s / 2, gr = g.createRadialGradient(r * .8, r * .7, 2, r, r, r);
    gr.addColorStop(0, '#fff3b0'); gr.addColorStop(.55, '#f0b830'); gr.addColorStop(1, '#8a5a10');
    g.fillStyle = gr; g.beginPath(); g.arc(r, r, r - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6a420a'; g.lineWidth = 3; g.beginPath(); g.arc(r, r, r - 8, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#6a420a'; g.font = `bold ${s * .55}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', r, r + 2);
  }, 128);
  const glowTex = canvasTex(g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  for (const t of [coinTex, glowTex]) api.renderer?.initTexture?.(t);   // uploaded once, never re-uploaded by a clone's disposal
  const coinMat = new THREE.SpriteMaterial({ map: coinTex, transparent: true, depthWrite: false });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: GOLD, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); beamGeo.translate(0, .5, 0); beamGeo.rotateX(Math.PI / 2);   // unit length along +z
  const beamMat = new THREE.MeshBasicMaterial({ color: GOLD, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .8 });
  host.warmObjects?.push(new THREE.Sprite(coinMat), new THREE.Sprite(glowMat), new THREE.Mesh(beamGeo, beamMat));

  // ---- the ledger: one record per debtor ------------------------------------------------------------------------------
  // principal: banked damage; interest: what it has grown by; hits: banked hits (Debt Spiral); head: any banked headshot
  const ledger = new Map();
  const owed = r => r.principal + r.interest;
  const capFor = (def, a) => (a.includes('dc_compound') ? 3 : 1) * (def?.upgraded ? PAP_CAP : CAP);
  let banking = null;   // the def of the shot being fired: its hit-scan runs straight after the fire hook
  let collecting = false;
  function fire(def, forward, { ads }) {
    if (!isDebt(def) || host.remoteDamage) return false;
    if (session.effects?.insta_kill > session.time) return false;   // Insta-Kill: the shot just kills
    banking = { def, ads, a: attsOf(def) }; queueMicrotask(() => { banking = null; });
    return false;   // the engine's own hit-scan fires the bullet (pierce, falloff, headshots); beforeEnemyDamage banks it
  }
  (host.fireHooks ??= []).push(fire);

  host.on('beforeEnemyDamage', e => {
    const z = e.enemy; if (!z) return;
    if (banking && e.cause === 'bullet' && !e.melee && e.amount > 0) {
      const { a, ads } = banking;
      let r = ledger.get(z);
      if (!r) { r = { principal: 0, interest: 0, hits: 0, head: false, t0: now() }; ledger.set(z, r); }
      let amount = e.amount;
      if (ads && a.includes('dc_loupe')) amount *= 1.25;
      if (a.includes('dc_spiral')) amount *= 1 + .15 * Math.min(5, r.hits);
      r.principal += amount; r.hits++; r.head ||= !!e.head; r.flash = .25;
      e.amount = 0;   // banked, not dealt (the hit still scores and flinches)
      tick();
      return;
    }
    // Loan Shark Grips: a melee on a debtor collects its debt then and there
    if (e.melee && ledger.has(z) && isDebt(session.def) && attsOf(session.def).includes('dc_shark') && !collecting)
      queueMicrotask(() => { if (ledger.has(z)) collect(session.def, [z]); });
  });

  // a debtor that dies some other way defaults: the debt passes to the nearest zombie within reach
  host.on('kill', ({ enemy }) => {
    const r = ledger.get(enemy); if (!r || collecting) return;
    ledger.delete(enemy); dropTag(r);
    const at = enemy.root.position; let best = null, bd = DEFAULT_REACH;
    for (const z of enemies.list) { if (z === enemy || !alive(z)) continue; const d = z.root.position.distanceTo(at); if (d < bd) { bd = d; best = z; } }
    if (!best) return;
    let n = ledger.get(best); if (!n) { n = { principal: 0, interest: 0, hits: 0, head: false, t0: now() }; ledger.set(best, n); }
    n.principal += owed(r); n.head ||= r.head; n.flash = .4;
    beam(at.clone().setY(at.y + 50), best.root.position.clone().setY(best.root.position.y + 50), .25);
  });

  // ---- collecting -----------------------------------------------------------------------------------------------------
  const reload0 = session.reload.bind(session);
  session.reload = (...args) => {
    const def = session.def, started = reload0(...args);
    if (isDebt(def) && ledger.size && (started || canCollectAnyway())) collect(def);
    return started;
  };
  // an empty reserve or a full cylinder can't reload, but the R key still calls in the debts
  const canCollectAnyway = () => !(session.phase === 'gameover' || session.phase === 'reviving' || session.drinking || session.meleeLeft > 0 || session.reloadLeft > 0);
  // Loan Shark Grips: the cylinder's swing-out and close are faster too (attachments' reloadMul only scales the rounds)
  const stage0 = session.setReloadStage.bind(session);
  session.setReloadStage = stage => {
    const r = stage0(stage);
    if (isDebt(session.def) && attsOf(session.def).includes('dc_shark') && (stage === 'start' || stage === 'end')) session.reloadDuration = session.reloadLeft *= .75;
    return r;
  };

  let roulette = null;   // the wheel's spin: {from, to, t, life}
  function collect(def, only = null) {
    const a = attsOf(def), from = camera.position;
    const due = [...ledger].filter(([z]) => (!only || only.includes(z)) && alive(z) && z.root.position.distanceTo(from) <= RANGE);
    if (!due.length) return 0;
    // Double or Nothing: one spin for the whole collection; the wheel stops on the result
    let wheel = 1, sector = null;
    if (a.includes('dc_roulette') && !only) {
      const roll = Math.random() * 12;
      if (roll < 1) { wheel = 4; sector = 3; } else if (roll < 6.5) { wheel = 1.6; sector = [0, 2, 4, 6, 8, 10][Math.floor(Math.random() * 6)] + 1; } else { wheel = 0; sector = [0, 2, 4, 6, 8, 10][Math.floor(Math.random() * 6)]; }
      spinWheel(sector);
      api.toast?.(wheel === 4 ? 'GREEN ZERO · every debt ×4' : wheel > 1 ? 'RED · debts ×1.6' : 'BLACK · the house forgives', 2);
    }
    collecting = true;
    let total = 0, kills = 0, jackpots = 0;
    try {
      for (const [z, r] of due) {
        ledger.delete(z); dropTag(r);
        let amount = owed(r) * wheel;
        if (gambler() && amount > 0 && Math.random() < .2) { amount *= 2; jackpots++; }   // the Gambler's jackpot
        const head = enemies.headPosition?.(z) ?? z.root.position.clone().setY(z.root.position.y + 60);
        if (amount <= 0) { burst(head, 0x444444, 5, .6); continue; }
        const before = z.health;
        enemies.hurt(z, amount, r.head, false, 'debt');
        total += amount;
        flash(head, wheel === 4 ? GREEN : GOLD, 26 + Math.min(40, amount / 150));
        coins(head, 4 + Math.min(10, Math.round(amount / 600)));
        if (a.includes('dc_payday')) session.addPoints?.(Math.min(100, Math.round(amount * .05 / 10) * 10));
        if (!alive(z)) {
          kills++; session.addPoints?.(20);
          if (def.upgraded && amount > before) spill(z, amount - before);   // Hostile Takeover: the overkill moves on
        } else if (a.includes('dc_hook')) {
          const flat = tmp.copy(from).sub(z.root.position).setY(0), d = flat.length();
          if (d > 40) { pushes.push({ z, dir: flat.normalize().clone(), left: Math.min(150, d - 40), t: .35 }); stagger(z, 1); }
          beam(from.clone().setY(from.y - 20), head, .3);
        }
      }
    } finally { collecting = false; }
    till(jackpots > 0 || wheel === 4);
    if (jackpots) api.toast?.(`JACKPOT${jackpots > 1 ? ' ×' + jackpots : ''} · debts doubled`, 2);
    window.kino.debt.last = { total: Math.round(total), kills, jackpots, wheel, n: due.length };
    return total;
  }
  function spill(dead, over) {
    const at = dead.root.position; let best = null, bd = SPILL_REACH;
    for (const z of enemies.list) { if (!alive(z) || ledger.has(z)) continue; const d = z.root.position.distanceTo(at); if (d < bd) { bd = d; best = z; } }
    if (!best) return;
    beam(at.clone().setY(at.y + 50), best.root.position.clone().setY(best.root.position.y + 50), .3);
    enemies.hurt(best, over, false, false, 'debt');
    if (!alive(best)) session.addPoints?.(20);
  }

  // ---- staggers and drags (the Repo Hook), foreclosures (the Foreclosure Brake) -----------------------------------------
  const pushes = [];
  function stagger(z, s) {
    if (z.dcStagger) { z.dcStagger.until = now() + s; return; }
    z.dcStagger = { until: now() + s, scale: z.rig?.mixer?.timeScale };
    if (z.speed) z.speed *= .35;
    if (z.rig?.mixer) z.rig.mixer.timeScale *= .5;
  }
  function unstagger(z) {
    const s = z.dcStagger; if (!s) return; z.dcStagger = null;
    if (z.speed) z.speed /= .35;
    if (z.rig?.mixer && s.scale !== undefined) z.rig.mixer.timeScale = s.scale;
  }
  function foreclose(z, on) {
    if (!!z.dcForeclosed === on) return;
    z.dcForeclosed = on;
    if (z.speed) z.speed *= on ? .5 : 2;
  }

  // ---- effects ----------------------------------------------------------------------------------------------------------
  const fx = [];
  function add(obj, f) { scene.add(obj); fx.push({ obj, ...f }); if (fx.length > 260) disposeFx(fx.shift()); }
  function flash(p, color, size) { const s = new THREE.Sprite(glowMat.clone()); s.material.color.setHex(color); s.position.copy(p); add(s, { t: .3, life: .3, size, grow: size * 1.6 }); }
  function coins(p, n) {   // a burst of spinning gold coins that fall
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(coinMat.clone()); s.position.copy(p);
      const v = new THREE.Vector3(Math.random() - .5, .6 + Math.random() * .8, Math.random() - .5).normalize().multiplyScalar(160 + Math.random() * 180);
      add(s, { t: .9 + Math.random() * .4, life: 1.2, size: 4 + Math.random() * 2, vel: v, coin: Math.random() * 6 });
    }
  }
  function burst(p, color, n, scale = 1) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(glowMat.clone()); s.material.color.setHex(color); s.position.copy(p);
      add(s, { t: .4, life: .4, size: 6 * scale, vel: new THREE.Vector3(Math.random() - .5, Math.random(), Math.random() - .5).multiplyScalar(220 * scale) });
    }
  }
  function beam(a, b, t) {
    const m = new THREE.Mesh(beamGeo, beamMat.clone()); m.position.copy(a); m.lookAt(b); m.scale.set(.8, .8, a.distanceTo(b)); m.frustumCulled = false;
    add(m, { t, life: t, line: true });
  }
  const disposeFx = f => { f.obj.removeFromParent(); f.obj.material.dispose(); };

  // ---- the coin tags over debtors: a coin sprite in the world, the amount as a HUD label --------------------------------
  const layer = document.createElement('div');
  layer.id = 'debt-tags';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:25;overflow:hidden';
  (document.getElementById('hud') ?? document.body).append(layer);
  const LABEL = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);font:700 13px/1 sans-serif;letter-spacing:.04em;color:#ffd25a;text-shadow:0 1px 3px #000;white-space:nowrap;will-change:transform';
  const freeLabels = [];
  function tagFor(r) {
    if (!r.label) { r.label = freeLabels.pop() ?? Object.assign(document.createElement('div'), { className: 'debt-tag' }); r.label.style.cssText = LABEL; layer.append(r.label); r.shown = ''; }
    if (!r.coin) { r.coin = new THREE.Sprite(coinMat); r.coin.scale.setScalar(9); scene.add(r.coin); }
  }
  function dropTag(r) {
    if (r.label) { r.label.remove(); freeLabels.push(r.label); r.label = null; }
    if (r.coin) { r.coin.removeFromParent(); r.coin = null; }
  }
  host.on('warmHud', on => {   // engine.warmHud: the label painted once behind the loading screen
    if (on) { const l = Object.assign(document.createElement('div'), { textContent: '$1,234' }); l.style.cssText = LABEL + ';transform:translate(200px,200px)'; layer.append(l); freeLabels.push(l); }
    else for (const l of freeLabels) l.remove();
  });
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');

  // ---- the gun: its glow follows what's owed, the roulette wheel spins, the Bailiff moves the muzzle out ----------------
  const viewCam = () => api.viewCamera ?? camera;
  function glowMats(gun) {
    if (!gun) return [];
    if (!gun.userData.dcGlow) {
      const list = new Set(); gun.traverse(o => { for (const m of [o.material].flat()) if (m?.name?.startsWith('dc_glow')) list.add(m); });
      for (const m of list) m.userData.dcBase ??= m.emissiveIntensity;
      gun.userData.dcGlow = [...list];
    }
    return gun.userData.dcGlow;
  }
  function spinWheel(sector) {
    const bone = view?.gun?.getObjectByName('tag_dc_roulette'); if (!bone) return;
    // sector k spans 30k..30k+30 degrees round the cylinder axis from +y toward +z; the top of the cylinder is 90
    const from = bone.rotation.x, base = THREE.MathUtils.degToRad(90 - (30 * sector + 15));
    const to = base + Math.PI * 2 * (Math.ceil((from - base) / (Math.PI * 2)) + 3);
    roulette = { bone, from, to, t: 0, life: 1.1 };
  }
  let shifted = null;   // the gun whose muzzle the Bailiff moved
  function bailiff(gun, on) {
    const flash = gun?.getObjectByName('tag_flash'); if (!flash) return;
    flash.userData.dcHome ??= flash.position.clone();
    const jg = gun.getObjectByName('j_gun');
    if (!on || !jg) { flash.position.copy(flash.userData.dcHome); return; }
    // the shift is along j_gun's x (its own frame: x forward), turned into tag_flash's parent's frame
    jg.updateWorldMatrix(true, false); flash.parent.updateWorldMatrix(true, false);
    const a = jg.localToWorld(new THREE.Vector3()), b = jg.localToWorld(new THREE.Vector3(BAILIFF_SHIFT, 0, 0));
    flash.parent.worldToLocal(a); flash.parent.worldToLocal(b);
    flash.position.copy(flash.userData.dcHome).add(b.sub(a));
  }

  // ---- the Ticker Tape Laser: a gold beam from the ticker's lens, steered at the crosshair (as mounts.js aimLasers), and
  // a gold dot where it lands ------------------------------------------------------------------------------------------------
  const LASER_AT = new THREE.Vector3(1.07, -.18, -.5);   // the lens, in tag_dc_ticker's frame (CoD axes: x forward)
  const laserGeo = (() => {
    const pos = [], col = [], idx = [], stops = [[0, 1], [.06, .75], [.35, .3], [1, 0]], L = 185, W = .09;
    for (const [a, b] of [[1, 0], [0, 1]]) {
      const base = pos.length / 3;
      for (const [f, c] of stops) { const w = W * (1 - .5 * f); pos.push(f * L, a * w, b * w, f * L, -a * w, -b * w); col.push(c, c, c, c, c, c); }
      for (let i = 0; i < stops.length - 1; i++) { const k = base + i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    return g;
  })();
  const laserMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffb020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const laserDot = new THREE.Sprite(glowMat.clone()); laserDot.visible = false; laserDot.renderOrder = 4; scene.add(laserDot);
  { const w = new THREE.Mesh(laserGeo, laserMat); w.frustumCulled = false; host.warmObjects?.push(w); }
  const lfwd = new THREE.Vector3(1, 0, 0), ldir = new THREE.Vector3(), lscale = new THREE.Vector3(), eye = new THREE.Vector3(), look = new THREE.Vector3(), ray = new THREE.Ray();
  function ticker(gun, on) {
    let beam = gun?.userData.dcBeam;
    if (on && gun && !beam) {
      const bone = gun.getObjectByName('tag_dc_ticker');
      if (bone) { beam = gun.userData.dcBeam = new THREE.Mesh(laserGeo, laserMat); beam.position.copy(LASER_AT); beam.frustumCulled = false; beam.renderOrder = 3; bone.add(beam); }
    }
    if (beam) beam.visible = !!on;
    if (!on || !beam) { laserDot.visible = false; return; }
    const vc = api.viewCamera; if (!vc) return;
    vc.getWorldPosition(eye); vc.getWorldDirection(look);
    const to = eye.addScaledVector(look, 1500);
    beam.parent.getWorldScale(lscale); beam.parent.worldToLocal(ldir.copy(to)).sub(beam.position).normalize();
    const k = THREE.MathUtils.smoothstep(ldir.x, .88, .97);
    ldir.lerp(lfwd, 1 - k).normalize(); beam.quaternion.setFromUnitVectors(lfwd, ldir); beam.scale.setScalar(1 / (lscale.x || 1));
    laserMat.opacity = view.input?.ads ? .35 : 1;
    const pointing = ['idle', 'fire'].includes(view.mode) && !(session.reloadLeft > 0) && !view.input?.sprint;
    camera.getWorldPosition(ray.origin); camera.getWorldDirection(ray.direction);
    let d = world.raycast(ray, 2, 2500)?.distance ?? Infinity;
    for (const o of enemies.list) { const p = o.root.position; tmp.set(p.x, p.y + 38, p.z).sub(ray.origin); const along = tmp.dot(ray.direction); if (along > 0 && along < d && tmp.lengthSq() - along * along < 400) d = along - 14; }
    laserDot.visible = pointing && d < Infinity;
    if (laserDot.visible) { laserDot.position.copy(ray.origin).addScaledVector(ray.direction, d - 1.5); laserDot.scale.setScalar(3 + d * .004); laserDot.material.opacity = .6 + .25 * Math.random(); }
  }

  // ---- the frame ----------------------------------------------------------------------------------------------------------
  let losT = 0, glowLevel = 0;
  const losOk = new WeakMap();
  host.on('update', dt => {
    if (!dt) return;
    const t = now(), def = held(), a = attsOf(def);
    losT -= dt; const checkLos = losT <= 0; if (checkLos) losT = .2;
    const w = innerWidth, h = innerHeight, cam = camera;
    let total = 0;
    for (const [z, r] of [...ledger]) {
      if (!enemies.list.includes(z)) { ledger.delete(z); dropTag(r); continue; }   // gone without a kill (cleanup)
      // interest: simple on the principal, or compound on everything owed (the Compound Interest Cylinder)
      const ia = attsOf(session.def), cdef = isDebt(session.def) ? session.def : data.weapons[DEBT];
      const cap = r.principal * capFor(cdef, ia);
      r.interest = Math.min(cap, r.interest + (ia.includes('dc_compound') && isDebt(session.def) ? owed(r) * COMPOUND : r.principal * RATE) * dt);
      const due = owed(r); total += due;
      if (a.includes('dc_brake')) foreclose(z, due >= z.health); else foreclose(z, false);
      tagFor(r);
      const p = tmp.copy(z.root.position); p.y += (z.kind === 'zombie' ? 82 : 46);
      r.coin.position.copy(p); r.flash = Math.max(0, (r.flash ?? 0) - dt);
      r.coin.scale.setScalar(9 * (1 + r.flash * 2));
      if (checkLos) losOk.set(z, world.lineClear(cam.position, p));
      tmp2.copy(p).project(cam);
      const on = tmp2.z < 1 && Math.abs(tmp2.x) < 1.1 && Math.abs(tmp2.y) < 1.1 && losOk.get(z) !== false;
      r.coin.visible = on;
      if (!on) { if (r.shown !== 'off') { r.label.style.visibility = 'hidden'; r.shown = 'off'; } continue; }
      const kill = a.includes('dc_ticker') && due >= z.health;
      const text = fmt(due) + (kill ? ' ✕' : ''), x = (tmp2.x * .5 + .5) * w, y = (.5 - tmp2.y * .5) * h - 12;
      if (r.shown !== text) { r.label.textContent = text; r.label.style.color = kill ? '#ff5a4a' : '#ffd25a'; r.label.style.visibility = 'visible'; r.shown = text; }
      r.label.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const z of [...enemies.list, ...(enemies.dead ?? [])]) {
      if (z.dcStagger && (!alive(z) || z.dcStagger.until <= t)) unstagger(z);
      if (z.dcForeclosed && (!alive(z) || !ledger.has(z))) foreclose(z, false);
    }
    // the gun's gold glows brighter with what's owed (faint when nothing is)
    const gun = view?.ready && isDebt(view.def) ? view.gun : null;
    glowLevel += ((total > 0 ? .5 + Math.min(1, total / 20000) : 0) - glowLevel) * Math.min(1, dt * 4);
    if (gun) {
      for (const m of glowMats(gun)) m.emissiveIntensity = m.userData.dcBase * (.35 + 1.6 * glowLevel * (.85 + .15 * Math.sin(t * 6)));
      const bail = attsOf(view.def).includes('dc_bailiff');
      if (shifted !== gun || gun.userData.dcBail !== bail) { if (shifted && shifted !== gun) bailiff(shifted, false); bailiff(gun, bail); shifted = gun; gun.userData.dcBail = bail; }
    }
    ticker(gun, !!gun && attsOf(view.def).includes('dc_ticker'));
    if (roulette) {
      roulette.t += dt; const u = Math.min(1, roulette.t / roulette.life), e = 1 - (1 - u) ** 3;
      roulette.bone.rotation.x = roulette.from + (roulette.to - roulette.from) * e;
      if (u >= 1) { roulette.bone.rotation.x = roulette.to % (Math.PI * 2); roulette = null; }
    }
    for (const p of [...pushes]) {
      p.t -= dt;
      if (alive(p.z)) {
        const step = Math.min(p.left, p.left * dt / Math.max(dt, p.t + dt)), from = tmp2.copy(p.z.root.position).add(tmp.set(0, 35, 0));
        if (world.lineClear(from, from.clone().addScaledVector(p.dir, step + 12))) p.z.root.position.addScaledVector(p.dir, step);
        p.left -= step;
      }
      if (p.t <= 0 || p.left <= .5) pushes.splice(pushes.indexOf(p), 1);
    }
    for (const f of [...fx]) {
      f.t -= dt; const u = Math.max(0, f.t / f.life);
      if (f.vel) { f.obj.position.addScaledVector(f.vel, dt); f.vel.y -= 520 * dt; }
      if (f.coin !== undefined) { f.coin += dt * 14; f.obj.scale.set(f.size * Math.abs(Math.cos(f.coin)) + .4, f.size, 1); f.obj.material.opacity = Math.min(1, u * 3); }
      else if (f.line) f.obj.material.opacity = .8 * u;
      else if (f.grow) { f.obj.scale.setScalar(f.size + f.grow * (1 - u)); f.obj.material.opacity = u; }
      else { f.obj.material.opacity = .8 * u; f.obj.scale.setScalar(f.size * (u * .7 + .3)); }
      if (f.t <= 0) { disposeFx(f); fx.splice(fx.indexOf(f), 1); }
    }
  });
  host.on('reset', () => {
    for (const [, r] of ledger) dropTag(r);
    ledger.clear();
    for (const f of fx) disposeFx(f);
    fx.length = pushes.length = 0; roulette = null;
    for (const z of [...enemies.list, ...(enemies.dead ?? [])]) { unstagger(z); foreclose(z, false); }
  });

  // debug handle (tests): kino.debt.ledger, .owed(z), .collect(), .last (the last collection's totals)
  window.kino ??= {};
  window.kino.debt = { ledger, owed: z => (ledger.has(z) ? owed(ledger.get(z)) : 0), collect: () => collect(session.def), fx, pushes, last: null, spinWheel };
}

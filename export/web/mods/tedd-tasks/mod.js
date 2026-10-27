// T.E.D.D. Tasks (Black Ops 7's timed tasks, fork 2026-10-26), run from the terminal booths' TASKS.EXE.
//   - Offered as in BO7: the first at the start of round 9, then every 4 to 6 rounds. An offer waits at every terminal
//     until it's taken; if the next one comes due first, it replaces it. No new offer while a task is running.
//   - Price goes up by round (user, 2026-10-26: no perk ladder): 500, +500 every 10 rounds (round 9: 500, 10-19: 1,000,
//     20-29: 1,500 ...).
//   - A task lasts 2 minutes (DURATION) and ends early once the Legendary mark is reached. Rated by the count reached:
//     Bronze / Silver / Gold / Legendary (the task's `tiers`); under Bronze pays nothing.
//   - The reward is a chest (mods/loot) in front of the terminal the task was started from; F opens it and the loot
//     spills out. Weapons come from the player's own Mystery Box list (kino.boxList via loot.pickWeapon), so only what
//     they switched on; a free perk only at Legendary.
// Local to each player (like box rolls): in co-op everyone has their own offers and chests.
// window.kino.tedd: {status(), act('start', booth) -> true | 'reason'}; host events 'teddStart' {task}, 'teddEnd' {task, tier, count}.
import * as THREE from 'three';

const FIRST = 9, GAP = [4, 6], DURATION = 120, ZONE_R = 230, FAR = 600;
export const teddPrice = round => 500 + 500 * Math.floor(round / 10);
export const TIERS = [
  { id: 'bronze', name: 'BRONZE', color: '#cd7f32' },
  { id: 'silver', name: 'SILVER', color: '#c9d3de' },
  { id: 'gold', name: 'GOLD', color: '#ffd34f' },
  { id: 'legendary', name: 'LEGENDARY', color: '#ff9a2e' },
];
// count: what a kill adds (ctx: {e, inZone, far}); streak: the best chain without taking damage counts instead
export const TASKS = [
  { id: 'headhunter', name: 'HEADHUNTER', text: 'Kill zombies with headshots.', unit: 'HEADSHOT KILLS', tiers: [8, 16, 24, 32], count: c => c.e.head },
  { id: 'zone', name: 'HOLD THE LINE', text: 'Kill zombies while you stand inside the ring around this terminal.', unit: 'KILLS IN THE RING', tiers: [10, 20, 30, 40], zone: true, count: c => c.inZone },
  { id: 'melee', name: 'UP CLOSE', text: 'Kill zombies with melee attacks.', unit: 'MELEE KILLS', tiers: [4, 8, 12, 18], count: c => c.e.melee },
  { id: 'untouchable', name: 'UNTOUCHABLE', text: 'Chain kills without taking damage. Your best chain counts; a hit starts a new one.', unit: 'KILL CHAIN', tiers: [8, 16, 26, 36], streak: true },
  { id: 'marksman', name: 'MARKSMAN', text: 'Kill zombies from long range (about 15 metres or more).', unit: 'LONG-RANGE KILLS', tiers: [5, 10, 16, 22], count: c => c.far },
];
// what each rating's chest holds (weapons from the player's box list, of these rarities)
const REWARDS = {
  bronze: { points: [250, 250], ammo: 1, grenades: 1 },
  silver: { points: [250, 250, 250], ammo: 2, grenades: 1, weapon: ['common', 'uncommon', 'rare'], powerup: .5 },
  gold: { points: [250, 250, 250, 250], ammo: 2, grenades: 2, weapon: ['rare', 'epic', 'legendary'], powerup: 1 },
  legendary: { points: [500, 500, 500, 500], ammo: 3, grenades: 2, weapon: ['epic', 'legendary', 'wonder'], powerup: 1, perk: true },
};
const POWERUPS = ['double_points', 'insta_kill', 'full_ammo', 'carpenter', 'nuke'];

export default async function setup(api) {
  const { host, session, scene, player, data, audio } = api;
  const feet = () => player.getFeetPosition();
  const booths = () => window.kino.terminalBooth?.booths ?? [];
  let next = FIRST, offer = null, run = null, last = null;

  // ---- the ring for HOLD THE LINE (warmed at load)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7dffa6, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 5, ZONE_R, 96).rotateX(-Math.PI / 2), ringMat);
  ring.renderOrder = 2; (host.warmObjects ??= []).push(ring);

  // ---- HUD while a task runs
  const hud = document.createElement('div'); hud.id = 'tedd-hud'; hud.hidden = true;
  const css = document.createElement('style');
  css.textContent = `#tedd-hud{position:fixed;left:50%;top:12%;transform:translateX(-50%);z-index:40;pointer-events:none;min-width:300px;padding:8px 16px 10px;
    background:#031208d0;border:2px solid #1f6b3a;border-radius:8px;color:#7dffa6;font:20px/1.15 'VT323','Courier New',monospace;text-align:center;text-shadow:0 0 6px #1bff6a66;letter-spacing:1px}
  #tedd-hud .t{display:flex;justify-content:space-between;gap:18px;color:#b6ffcb;font-size:22px}#tedd-hud .n{font-size:34px;margin:2px 0}
  #tedd-hud .pips{display:flex;gap:4px}#tedd-hud .pips span{flex:1;height:6px;border-radius:3px;background:#0d2a17;border:1px solid #1f6b3a}
  #tedd-hud .w{color:#ffd36b}`;
  document.head.append(css); document.body.append(hud);
  const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const tierOf = (task, n) => { let t = -1; task.tiers.forEach((v, i) => { if (n >= v) t = i; }); return t; };
  let hudKey = '';
  function drawHud() {
    if (!run) { hud.hidden = true; hudKey = ''; return; }
    const left = Math.max(0, run.ends - session.time), t = tierOf(run.task, run.count), out = run.task.zone && !inZone();
    const key = [Math.ceil(left), run.count, run.streak, out].join(); if (key === hudKey) return; hudKey = key;
    hud.hidden = false;
    hud.innerHTML = `<div class="t"><span>T.E.D.D. · ${run.task.name}</span><span>${clock(Math.ceil(left))}</span></div>
      <div class="n" style="color:${t >= 0 ? TIERS[t].color : '#7dffa6'}">${run.count} <small>/ ${run.task.tiers[Math.min(3, t + 1)]}</small></div>
      <div class="pips">${run.task.tiers.map((v, i) => `<span style="${run.count >= v ? `background:${TIERS[i].color};border-color:${TIERS[i].color}` : ''}" title="${v}"></span>`).join('')}</div>
      <div class="${out ? 'w' : ''}">${out ? 'GET BACK IN THE RING' : run.task.streak ? `CHAIN ${run.streak}` : run.task.unit}${t >= 0 ? ' · ' + TIERS[t].name : ''}</div>`;
  }
  function inZone() { if (!run?.zone) return false; const f = feet(), z = run.zone; return Math.hypot(f.x - z.x, f.z - z.z) < ZONE_R && Math.abs(f.y - z.y) < 150; }

  // ---- offers
  function newOffer() {
    const pool = TASKS.filter(t => t.id !== offer?.task.id && t.id !== last?.task.id);
    offer = { task: pool[Math.floor(Math.random() * pool.length)] ?? TASKS[0], round: session.round };
    next = session.round + GAP[0] + Math.floor(Math.random() * (GAP[1] - GAP[0] + 1));
    api.announce?.('T.E.D.D.', 'A NEW TASK IS WAITING AT THE TERMINAL', 3);
    audio?.play?.('round', .4);
    for (const b of booths()) b.print?.('T.E.D.D.: NEW TASK');
  }

  // ---- running a task
  function start(booth) {
    if (run) return 'A task is already running';
    if (!offer) return 'No task right now';
    if (session.busy || session.phase === 'reviving') return 'Terminal busy';
    const price = teddPrice(session.round);
    if (session.points < price) return 'Not enough points';
    if (!session.spend(price)) return 'Not enough points';
    audio?.play?.('buy');
    const b = booth ?? booths()[0]; if (!b) return 'No terminal here';
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.root.quaternion).setY(0).normalize();
    const base = b.root.getWorldPosition(new THREE.Vector3());
    run = { task: offer.task, ends: session.time + DURATION, count: 0, streak: 0, booth: b, chestAt: base.clone().addScaledVector(fwd, 80), chestYaw: Math.atan2(fwd.x, fwd.z) };
    offer = null;
    if (run.task.zone) { run.zone = base.clone().addScaledVector(fwd, 60); ring.position.copy(run.zone).y += 2; scene.add(ring); }
    b.print?.('TASK: ' + run.task.name);
    host.emit?.('teddStart', { task: run.task.id });
    return true;
  }
  function finish() {
    const r = run; run = null; ring.removeFromParent(); drawHud();
    const t = tierOf(r.task, r.count); last = { task: r.task, tier: t, count: r.count, round: session.round };
    host.emit?.('teddEnd', { task: r.task.id, tier: t >= 0 ? TIERS[t].id : null, count: r.count });
    if (t < 0) { api.announce?.('T.E.D.D.', 'TASK FAILED · NO REWARD', 3); r.booth.print?.('TASK FAILED'); return; }
    const tier = TIERS[t]; api.announce?.('T.E.D.D.', `${tier.name} · YOUR REWARD IS AT THE TERMINAL`, 3.5); audio?.play?.('round', .6);
    r.booth.print?.('REWARD: ' + tier.name);
    window.kino.loot?.chest(r.chestAt, r.chestYaw, tier.color, rewardList(tier.id), { label: `Open T.E.D.D.'s ${tier.name.toLowerCase()} chest` });
  }
  function rewardList(tier) {
    const rw = REWARDS[tier], loot = window.kino.loot, out = [];
    for (const n of rw.points) out.push({ kind: 'points', amount: n });
    for (let i = 0; i < rw.ammo; i++) out.push({ kind: 'ammo' });
    for (let i = 0; i < rw.grenades; i++) out.push({ kind: 'grenade' });
    if (rw.weapon) { const id = loot?.pickWeapon(rw.weapon); if (id) out.push({ kind: 'weapon', id }); }
    if (rw.powerup && Math.random() < rw.powerup) { const types = POWERUPS.filter(t => data.powerups?.[t]); if (types.length) out.push({ kind: 'powerup', id: types[Math.floor(Math.random() * types.length)] }); }
    if (rw.perk) { const p = loot?.freePerk(); if (p) out.push({ kind: 'perk', id: p.id }); else out.push({ kind: 'points', amount: 1000 }, { kind: 'points', amount: 1000 }); }   // every perk owned: 2,000 points instead
    return out;
  }

  host.on('kill', e => {
    if (!run || e.remote) return;
    if (run.task.streak) { run.streak++; run.count = Math.max(run.count, run.streak); }
    else {
      const far = !!e.enemy && e.enemy.root.position.distanceTo(feet()) > FAR;
      if (run.task.count({ e, inZone: inZone(), far })) run.count++;
    }
    if (run.count >= run.task.tiers[3]) finish();
  });
  host.on('beforeDamage', e => { if (run?.task.streak && e.amount > 0) run.streak = 0; });
  host.on('update', () => {
    if (session.phase === 'gameover') { if (run) { run = null; ring.removeFromParent(); } drawHud(); return; }
    if (!run && booths().length && session.round >= next) newOffer();
    if (run && session.time >= run.ends) finish();
    drawHud();
  });
  host.on('reset', () => { next = FIRST; offer = null; last = null; if (run) { run = null; ring.removeFromParent(); } drawHud(); });

  const info = t => ({ id: t.id, name: t.name, text: t.text, unit: t.unit, tiers: t.tiers, zone: !!t.zone, streak: !!t.streak });
  window.kino.tedd = {
    status: () => ({
      round: session.round, next, price: teddPrice(session.round), points: session.points, first: FIRST, gap: GAP, duration: DURATION,
      offer: offer && info(offer.task),
      run: run && { ...info(run.task), count: run.count, streak: run.streak, left: Math.max(0, run.ends - session.time), tier: tierOf(run.task, run.count) },
      last: last && { name: last.task.name, tier: last.tier, count: last.count, round: last.round },
      tiers: TIERS,
    }),
    act: (action, booth) => action === 'start' ? start(booth) : 'Unknown action',
    // tests and the cheat console: offer a given task now, set the running task's count, end it now
    debug: { offer: id => { newOffer(); if (id) offer.task = TASKS.find(t => t.id === id) ?? offer.task; return offer.task.id; }, count: n => { if (run) run.count = n; }, end: () => run && finish() },
  };
}

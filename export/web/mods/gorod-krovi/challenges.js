// Gorod Krovi's Groph challenges (BO3 zm_stalingrad_challenges.gsc; scratch/gk/spec/other.md §6). Each player has a
// gravestone in the start area (four in BO3, one per player number; the port's map has the first one) and one random
// challenge per tier, drawn at the start of the match (3_4, the mounted MG, never in solo). All three run at once;
// finishing one lights its tier at the grave. Claim it there: the reward rises out of the grave 30 units in 1 s, then
// sinks 30 units over 12 s and is lost once it's down (as in BO3). Rewards:
//   tier 1  Max Ammo
//   tier 2  a random Pack-a-Punched gun (BO3: FFAR/Famas, M1 Garand, MP40, Dual crossbows, L4 Siege; here the nearest
//           guns the fork has), in place of the gun in hand
//   tier 3  a random free perk (BO3 also raises the perk limit by one; the fork has no perk limit)
// The Gauntlet of Siegfried is reward 4, handed out at the same grave by gauntlet.js.
// The counters listen to the map's gk events (traps.js trap:*, raz.js raz:gun/raz:part, sentinel.js sentinel:part,
// dragon.js dragon:ride/dragon:burn/dragon:landed, shield.js shield:kill, sewer.js sewer:ride) and the mod loader's kill
// event (napalm zombies = z.napalm, BO3's "sparky" zombies = the ones a Valkyrie drone buffed, z.buffed). A challenge
// whose system isn't in the port yet (drop pods 1_4: gk.pods, Dragon Strike 3_3: gk.strike, the MG 3_4: gk.mg) is
// left out of the draw until it is. Solo-first: each client runs its own player's challenges.
// No skeleton arm model was exported (scratch/gk/spec/assets.md §12): the reward rises on its own, with BO3's sounds.
// Debug: kino.gorod.challenges.{state(), add(id, n), finish(tier), claim(), pick(tier, id)}; cheat-free URL ?gkChallenge=1_3,2_4,3_6.
import * as THREE from 'three';
import { makeSfx } from './dragon-sfx.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const GRAVES = [   // challenge_gravestone_N, s_challenge_trigger, s_challenge_reward (CoD)
  { stone: [344, 320, 10], trigger: [398, 385, 37], reward: [365, 343, 16] },
  { stone: [256.5, 384.6, -5.7], trigger: [321.6, 441.1, 25], reward: [277.5, 400.2, 1] },
  { stone: [214.8, 481.7, -5.7], trigger: [294.3, 496.2, 22], reward: [243.9, 486, 3] },
  { stone: [213.4, 587.6, -5.7], trigger: [290, 569, 26], reward: [238.4, 578.5, 5] },
];
const RISE = 30, RISE_T = 1, SINK_T = 12;
// BO3 ar_famas, ar_garand, smg_mp40, special_crossbow_dw, launcher_multi; each a list of the fork's nearest guns
const GUNS = [['famas_zm'], ['aw_m1garand', 'm14_zm'], ['mp40_zm'], ['crossbow_explosive_zm'], ['china_lake_zm']];
const TIER_NAME = ['I', 'II', 'III'];
const REWARD_NAME = ['Max Ammo', 'a Pack-a-Punched gun', 'a free perk'];

// id, tier, the target, the text (BO3's ZM_STALINGRAD_CHALLENGE_* in plain words), needs (a gk system that must exist)
const LIST = [
  { id: '1_1', need: 10, text: 'Get headshots on napalm zombies' },
  { id: '1_2', need: 3, text: 'Ride the dragon from different roosts' },
  { id: '1_3', need: 5, text: 'Shoot the arm cannon off Manglers' },
  { id: '1_4', need: 3, text: 'Defend drop pods while they are still green', needs: 'pods' },
  { id: '1_5', need: 5, text: 'Destroy Mangler masks' },
  { id: '1_6', need: 1, text: 'Survive 5 seconds after the dragon burns you' },
  { id: '2_1', need: 10, text: 'Kill zombies with the finger trap while sliding through it' },
  { id: '2_2', need: 30, text: 'Kill zombies with the Guard of Fafnir' },
  { id: '2_3', need: 40, text: 'Kill zombies with traps' },
  { id: '2_4', need: 45, text: 'Block dragon fire with the Guard of Fafnir (seconds)', unit: 's' },
  { id: '2_5', need: 10, text: 'Get headshots on electrified zombies' },
  { id: '2_6', need: 1, text: 'Kill 8 or more zombies with one eye beam' },
  { id: '3_1', need: 4, text: 'Survive rounds after a dragon ride without the sewer or bleeding out' },
  { id: '3_2', need: 3, text: 'Kill 3 or more zombies with flingers in different places' },
  { id: '3_3', need: 100, text: 'Kill zombies with Dragon Strike', needs: 'strike' },
  { id: '3_4', need: 60, text: 'Kill zombies with the mounted MG', needs: 'mg', coop: true },
  { id: '3_5', need: 6, text: 'Shoot every arm off Valkyrie drones' },
  { id: '3_6', need: 6, text: 'Destroy Valkyrie drone cameras' },
];
const BY = Object.fromEntries(LIST.map(c => [c.id, c]));

export default async function setupChallenges(api, gk) {
  const { world, session, player, scene, enemies } = api, host = api.host, kino = window.kino ??= {};
  const q = new URLSearchParams(location.search);
  const sfx = makeSfx(api, new URL('../maps/gorod-krovi/audio/', import.meta.url).href);
  const G = GRAVES[Math.min(3, Math.max(0, kino.coop?.slot ?? 0))];
  const STONE = W(...G.stone), TRIGGER = W(...G.trigger), REWARD = W(...G.reward);
  const solo = () => !(kino.coop?.id && (kino.coop.players?.size ?? kino.coop.peers?.size ?? 1) > 1);

  // ---- the draw ------------------------------------------------------------------------------------------------------
  const ready = c => (!c.needs || !!gk[c.needs]) && (!c.coop || !solo());
  const S = { tiers: [], reward: null, log: [] };
  function pick(tier, id = null) {
    const pool = LIST.filter(c => c.id[0] === String(tier + 1) && ready(c));
    const c = (id && BY[id]?.id[0] === String(tier + 1) ? BY[id] : null) ?? pool[Math.floor(Math.random() * pool.length)];
    S.tiers[tier] = { id: c.id, n: 0, done: false, claimed: false, set: new Set(), watch: null };
  }
  function draw() {
    const want = (q.get('gkChallenge') ?? '').split(',');
    for (let t = 0; t < 3; t++) pick(t, want.find(w => w[0] === String(t + 1)));
    S.reward = null; hideReward();
  }

  // ---- counting --------------------------------------------------------------------------------------------------------
  const live = id => { const t = S.tiers[+id[0] - 1]; return t && t.id === id && !t.done ? t : null; };
  function add(id, n = 1) {
    const t = live(id); if (!t) return;
    t.n = Math.min(BY[id].need, t.n + n);
    if (t.n >= BY[id].need) complete(t);
  }
  function addSet(id, key) { const t = live(id); if (!t) return; t.set.add(key); t.n = t.set.size; if (t.n >= BY[id].need) complete(t); }
  function complete(t) {
    t.done = true; t.n = BY[t.id].need;
    const tier = +t.id[0];
    S.log.push({ id: t.id, at: +session.time.toFixed(1) });
    const all = S.tiers.every(x => x.done);
    sfx.sfx(all ? 'challenge_all' : 'challenge_done', .8);
    api.toast?.(`Challenge ${TIER_NAME[tier - 1]} complete · claim ${REWARD_NAME[tier - 1]} at your grave`, 4);
    gk.emit('challenge:done', t.id);
  }
  const mineKill = e => !e.remote && e.enemy;
  host.on('kill', e => {
    if (!mineKill(e)) return;
    const z = e.enemy;
    if (e.head && z.napalm) add('1_1');
    if (e.head && z.buffed) add('2_5');
  });
  gk.on('dragon:ride', site => { if (site) addSet('1_2', site); });
  gk.on('raz:gun', () => add('1_3'));
  gk.on('raz:part', ({ part }) => { if (part === 'head') add('1_5'); });
  gk.on('pod:green', () => add('1_4'));   // pods.js: a pod won while its lamp is still green
  gk.on('dragon:burn', ({ blocked, secs }) => {
    if (blocked) { add('2_4', secs); return; }
    const t = live('1_6'); if (t) t.watch = session.time;   // burned: 5 s without going down
  });
  gk.on('trap:kill', ({ kind, slide }) => { add('2_3'); if (kind === 'finger' && slide) add('2_1'); });
  gk.on('trap:done', ({ kind, kills, place }) => {
    if (kind === 'eye' && kills >= 8) add('2_6');
    if (kind === 'flinger' && kills >= 3) addSet('3_2', place);
  });
  gk.on('shield:kill', () => add('2_2'));
  gk.on('strike:kill', () => add('3_3'));
  gk.on('mg:kill', () => add('3_4'));
  gk.on('sentinel:part', ({ z, part }) => {
    if (part === 'camera') add('3_6');
    if (part.startsWith('arm') && !z.gkArmsCounted && ['armL', 'armR', 'armT'].every(a => z.broken.has(a))) { z.gkArmsCounted = true; add('3_5'); }
  });
  // 3_1: from the landing of a dragon ride, 4 rounds without using the sewer or bleeding out (another ride starts it over)
  gk.on('dragon:landed', () => { const t = live('3_1'); if (t) { t.watch = session.round; t.n = 0; } });
  gk.on('sewer:ride', s => { const t = live('3_1'); if (s === 'start' && t) { t.watch = null; t.n = 0; } });
  host.on('roundEnd', () => {
    const t = live('3_1'); if (!t || t.watch == null) return;
    t.n = Math.min(BY['3_1'].need, session.round - t.watch);   // rounds finished since the landing (roundEnd comes after the round number moves on)
    if (t.n >= BY['3_1'].need) complete(t);
  });
  let lastPhase = session.phase;
  function phases() {
    const ph = session.phase;
    if (ph !== lastPhase) {
      if (ph === 'reviving' || ph === 'gameover') {   // going down ends 1_6's wait; bleeding out (game over in solo) ends 3_1's run
        const a = live('1_6'); if (a) a.watch = null;
        if (ph === 'gameover') { const b = live('3_1'); if (b) { b.watch = null; b.n = 0; } }
      }
      lastPhase = ph;
    }
    const a = live('1_6'); if (a?.watch != null && session.time - a.watch >= 5) { a.watch = null; add('1_6'); }
  }
  gk.on('coop:bleedout', () => { const b = live('3_1'); if (b) { b.watch = null; b.n = 0; } });

  // ---- the reward ------------------------------------------------------------------------------------------------------
  const root = new THREE.Group(); root.name = 'gk_challenge_reward'; root.userData.noMerge = true; root.visible = false; scene.add(root);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0x9e761d, emissive: 0x362305, emissiveIntensity: .6, roughness: .38, metalness: .6 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), goldMat);   // when a reward has no model
  host.warmObjects?.push?.(stand);
  function model(tier, gun) {
    if (tier === 1 && gun) { const d = api.mysteryBox?.display?.(gun); if (d) return d; }
    const tpl = api.powerups?.templates?.[tier === 0 ? 'full_ammo' : tier === 2 ? 'free_perk' : null];
    return tpl ? tpl.clone(true) : stand;
  }
  function hideReward() { for (const c of [...root.children]) root.remove(c); root.visible = false; }
  function raise(tier) {
    const t = S.tiers[tier];
    const gun = tier === 1 ? pickGun() : null;
    hideReward(); const m = model(tier, gun); root.add(m);
    root.position.copy(REWARD); root.rotation.set(0, 0, 0); root.visible = true; root.updateMatrixWorld(true);
    S.reward = { tier, t: 0, gun };
    sfx.sfxAt('skel_retract', REWARD, .8, 1500);
    gk.emit('challenge:reward', { tier: tier + 1, id: t.id, gun });
  }
  function pickGun() {
    const W_ = api.data?.weapons ?? {};
    const have = GUNS.map(list => list.find(id => W_[id]?.upgrade)).filter(Boolean);
    return have[Math.floor(Math.random() * have.length)] ?? null;
  }
  function take() {
    const R = S.reward; if (!R) return false;
    const t = S.tiers[R.tier];
    if (R.tier === 0) kino.debug?.collectPowerup?.('full_ammo');
    else if (R.tier === 1) {
      if (!R.gun) { api.toast?.('No gun to hand out', 2); return false; }
      session.giveWeapon(R.gun);
      const w = session.weapon;
      if (w?.id === R.gun) { w.upgraded = true; w.mag = session.def.clipSize; w.reserve = session.def.maxAmmo; }
      api.equipView?.();
      api.toast?.(`${session.def?.name ?? R.gun} · Pack-a-Punched`, 3);
    } else {
      if (api.data?.powerups?.free_perk?.mod) kino.debug?.collectPowerup?.('free_perk');
      else api.toast?.('Free perk (needs the gobblegums mod)', 3);
    }
    t.claimed = true; S.reward = null; hideReward();
    gk.emit('challenge:claimed', { tier: R.tier + 1, id: t.id });
    return true;
  }
  const claimable = () => S.tiers.findIndex(t => t?.done && !t.claimed);

  // the gravestone: read the challenges, raise a reward, take it
  const status = () => S.tiers.map((t, i) => `${TIER_NAME[i]} ${t.claimed ? '✓' : t.done ? 'done' : `${Math.floor(t.n)}/${BY[t.id].need}${BY[t.id].unit ?? ''}`}`).join(' · ');
  world.addInteraction({ position: STONE.clone().add(new THREE.Vector3(0, 40, 0)), sight: true,
    text: () => {
      if (S.reward) return `Take ${S.reward.tier === 1 && S.reward.gun ? (api.data?.weapons?.[S.reward.gun]?.upgrade?.name ?? api.data?.weapons?.[S.reward.gun]?.name ?? 'the gun') : REWARD_NAME[S.reward.tier]}`;
      const c = claimable();
      if (c >= 0) return `Claim ${REWARD_NAME[c]} (challenge ${TIER_NAME[c]})`;
      const open = S.tiers.find(t => !t.done);
      return open ? `${BY[open.id].text} · ${status()}` : `Challenges · ${status()}`;
    },
    use() {
      if (S.reward) return take();
      const c = claimable(); if (c < 0) return false;
      raise(c); return true;
    } });

  host.on('update', dt => {
    if (!dt) return;
    phases();
    const R = S.reward; if (!R) return;
    R.t += dt;
    const up = R.t < RISE_T ? R.t / RISE_T : 1 - Math.min(1, (R.t - RISE_T) / SINK_T);
    root.position.set(REWARD.x, REWARD.y + RISE * up, REWARD.z); root.rotation.y += dt * .8; root.updateMatrixWorld(true);
    if (R.t >= RISE_T + SINK_T) { S.tiers[R.tier].claimed = true; S.reward = null; hideReward(); api.toast?.('The reward sank back into the grave', 3); gk.emit('challenge:lost', R.tier + 1); }
  });
  host.on('reset', () => { draw(); S.log.length = 0; });
  draw();
  gk.on('parts:ready', () => { if (S.tiers.every(t => !t.n && !t.done)) draw(); });   // the parts load in parallel: gk.pods may come after this setup

  const handle = {
    state: () => ({ grave: G, tiers: S.tiers.map(t => ({ id: t.id, text: BY[t.id].text, n: +t.n.toFixed(2), need: BY[t.id].need, done: t.done, claimed: t.claimed, watch: t.watch, set: [...t.set] })),
      reward: S.reward && { tier: S.reward.tier + 1, t: +S.reward.t.toFixed(2), gun: S.reward.gun, y: +(root.position.y - REWARD.y).toFixed(1) }, log: S.log, pool: LIST.filter(ready).map(c => c.id) }),
    add, pick: (tier, id) => pick(tier - 1, id), finish: tier => { const t = S.tiers[tier - 1]; if (t && !t.done) complete(t); },
    claim: () => (S.reward ? take() : (claimable() >= 0 ? (raise(claimable()), true) : false)), positions: { STONE, TRIGGER, REWARD },
  };
  gk.challenges = handle; if (kino.gorod) kino.gorod.challenges = handle;
}

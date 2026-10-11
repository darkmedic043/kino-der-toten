// Prone under a perk machine for 100 points (BO1's _zombiemode_perks.gsc `perk_vending_prone_points`, there 100 per
// machine per player). Here each machine pays once per game, to the first player who goes prone at it (user decision,
// 2026-10-11). Set ONCE_PER_GAME to make it a single 100 for the whole game instead (the first machine anyone uses).
// Machines: world.interactions (Kino's zombie_vending triggers, custom maps' perk markers, Cheese Cube's machines) plus
// `features.perkMachines()` (Moon keeps its own targets). Co-op: the host decides who was first; guests ask it.
import * as THREE from 'three';

const POINTS = 100, RANGE = 75, HEIGHT = 120, ONCE_PER_GAME = false;

export default function setup({ host, session, world, features, player, toast, audio }) {
  const claimed = new Set(), asked = new Set();
  const net = () => window.kino.coop?.id ? window.kino.coop : null;
  const isHost = () => !net() || net().isHost;
  const send = (to, m) => net()?.send(to, { ...m, t: 'prone-points' });
  const v = p => p?.isVector3 ? p : new THREE.Vector3(...p);

  let machines = null;
  function list() {
    if (machines) return machines;
    const found = [];
    const add = (perk, position) => {
      if (!perk || !position) return;
      const p = v(position);
      // one machine per spot: Moon's Earth machine is two triggers in one place (Juggernog or Speed Cola by visit)
      if (found.some(m => m.position.distanceTo(p) < 40)) return;
      found.push({ key: ONCE_PER_GAME ? 'any' : `${perk}@${Math.round(p.x)},${Math.round(p.z)}`, perk, position: p });
    };
    for (const e of world?.interactions ?? []) add(e.perk ?? (e.targetname === 'zombie_vending' ? e.script_noteworthy : null), e.position);
    for (const m of features?.perkMachines?.() ?? []) add(m.perk, m.position);
    if (found.length) machines = found;   // the world may still be loading on the first frames
    return found;
  }

  function award(key) {
    claimed.add(key);
    session.points += POINTS; session.totalScore += POINTS;
    audio?.play?.('buy'); toast(`+${POINTS}`, 2);
  }
  const claim = key => {   // the host's ruling; true if this is the first claim
    if (claimed.has(key) || (ONCE_PER_GAME && claimed.size)) return false;
    return true;
  };

  let subscribed = false;
  function subscribe() {
    const n = net(); if (!n || subscribed) return; subscribed = true;
    n.on('prone-points', (m, from) => {
      if (m.a === 'claim' && isHost()) {
        if (claim(m.key)) { claimed.add(m.key); send('all', { a: 'taken', key: m.key, by: from }); }
        else send(from, { a: 'taken', key: m.key, by: null });
      } else if (m.a === 'taken') {
        asked.delete(m.key);
        if (m.by === n.id && !claimed.has(m.key)) award(m.key); else claimed.add(m.key);
      }
    });
  }

  host.on('update', () => {
    subscribe();
    const mv = window.kino.movement?.state;
    if (!mv?.prone || session.phase === 'gameover' || session.phase === 'reviving') return;
    const feet = player.feetPosition;
    for (const m of list()) {
      if (claimed.has(m.key) || asked.has(m.key) || (ONCE_PER_GAME && claimed.size)) continue;
      if (Math.hypot(feet.x - m.position.x, feet.z - m.position.z) > RANGE || Math.abs(feet.y - m.position.y) > HEIGHT) continue;
      if (isHost()) { if (claim(m.key)) { award(m.key); send('all', { a: 'taken', key: m.key, by: net()?.id }); } }
      else { asked.add(m.key); send('host', { a: 'claim', key: m.key }); }
      return;
    }
  });
  host.on('reset', () => { claimed.clear(); asked.clear(); machines = null; });

  window.kino.pronePoints = { machines: () => list().map(m => ({ perk: m.perk, at: m.position.toArray() })), claimed: () => [...claimed] };
}

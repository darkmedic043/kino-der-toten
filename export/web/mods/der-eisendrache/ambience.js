// Der Eisendrache's ambience (2026-11-13): the map's own placed sound emitters and the zm_castle bank's wind, rooms,
// creaks and birds. audio/ambience.json and audio/amb_*.ogg come from .tools/build_castle_ambience.py (ripped, so
// git-ignored: without them this module does nothing).
//   loops    one HTML audio per sound, as loud as its nearest emitter (a point, or the nearest point of a line),
//            only the loudest few at a time, paused once silent
//   shots    each `random` emitter plays a variant every wait-min..max seconds when the player is in range
//   beds     the mountain wind under an open sky and the keep's air under a roof: how open the sky is comes from five
//            collision rays up from the camera (one a tick, straight up and four leaning 35 degrees), eased
// All of it is local to each player: nothing is synced. ?noAmbience switches it off; kino.castle.ambience.state().
import * as THREE from 'three';
import { sfx, setVol } from './castle-audio.js';

const BASE = new URL('./audio/', import.meta.url).href;
const UP = 1.6;   // a floor above or below counts as further away than its height

export function setupAmbience({ camera, host, world }) {
  const st = { data: null, open: .5, played: 0, last: [] }, loops = [], shots = [], gapOf = {};
  const off = new URLSearchParams(location.search).has('noAmbience');
  const ready = off ? Promise.resolve() : fetch(BASE + 'ambience.json').then(r => (r.ok ? r.json() : null)).catch(() => null).then(data => {
    if (!data?.sounds) return;
    const by = {};
    for (const [key, s] of Object.entries(data.sounds)) {
      if (s.loop) { by[key] = { key, s, em: [], a: null, v: 0, want: 0, idle: 0, retry: 0, dead: false }; loops.push(by[key]); }
      else if (s.bed) shots.push({ key, s, bed: true, w: s.wait ?? [20, 50], next: 5 + Math.random() * 20 });
    }
    for (const e of data.emitters ?? []) {
      const s = data.sounds[e.s]; if (!s) continue;
      if (s.loop) by[e.s].em.push(e); else if (s.n) shots.push({ key: e.s, s, p: e.p, w: e.w ?? [5, 15], next: Math.random() * (e.w?.[1] ?? 15) });
    }
    st.data = data;
  });
  const MAX = globalThis.matchMedia?.('(pointer: coarse)').matches ? 4 : 7;   // loops heard at once
  const GAP = { gust: 4, groan: 7, owl: 9 };   // seconds between two one-shots of a sound (default 3)
  const ray = new THREE.Ray(), sky = [.5, .5, .5, .5, .5], DIRS = [[0, 1, 0], [.57, .82, 0], [-.57, .82, 0], [0, .82, .57], [0, .82, -.57]]; let ri = 0;
  const open = c => {   // 0 under a roof .. 1 open sky
    if (!world?.collision?.rayIntersect) return null;
    ray.origin.copy(c); ray.direction.fromArray(DIRS[ri]); sky[ri] = world.collision.rayIntersect(ray, 0, 5000) ? 0 : 1; ri = (ri + 1) % 5;
    return (sky[0] * 2 + sky[1] + sky[2] + sky[3] + sky[4]) / 6;
  };
  const dist = (c, e) => {
    let x = e.p[0], y = e.p[1], z = e.p[2];
    if (e.q) { const dx = e.q[0] - x, dy = e.q[1] - y, dz = e.q[2] - z, k = Math.max(0, Math.min(1, ((c.x - x) * dx + (c.y - y) * dy + (c.z - z) * dz) / (dx * dx + dy * dy + dz * dz || 1))); x += dx * k; y += dy * k; z += dz * k; }
    return Math.hypot(c.x - x, (c.y - y) * UP, c.z - z);
  };
  const fall = (d, r) => (d >= r ? 0 : (1 - d / r) ** 1.5);
  let acc = 0, t = 0;
  host.on('update', dt => {
    acc += typeof dt === 'number' ? dt : 1 / 60; if (acc < .2 || !st.data || !camera?.position) return;
    const step = Math.min(acc, 1), c = camera.position; acc = 0; t += step;
    const o = open(c); if (o != null) st.open += (o - st.open) * Math.min(1, step * 1.2);
    const live = [];
    for (const L of loops) {
      let g = 0;
      if (L.s.bed) g = L.s.bed === 'out' ? st.open : 1 - st.open;
      else for (const e of L.em) { const f = fall(dist(c, e), L.s.range); if (f > g) g = f; }
      L.want = L.dead ? 0 : g * L.s.vol; if (L.want > .004) live.push(L);
    }
    live.sort((a, b) => b.want - a.want); for (let i = MAX; i < live.length; i++) live[i].want = 0;
    for (const L of loops) {
      L.v += (L.want - L.v) * Math.min(1, step * 2);
      if (L.want === 0 && L.v < .003) { L.v = 0; if (L.a) { setVol(L.a, 0); if (!L.a.paused && (L.idle += step) > 2) L.a.pause(); } continue; }
      L.idle = 0;
      if (!L.a) { L.a = new Audio(BASE + 'amb_' + L.key + '.ogg'); L.a.loop = true; L.a.addEventListener('error', () => { L.dead = true; }); }
      setVol(L.a, L.v);
      if (L.a.paused && t >= L.retry) { L.retry = t + 2; L.a.play().catch(() => {}); }
    }
    for (const k in gapOf) gapOf[k] -= step;
    for (const sh of shots) {
      if (t < sh.next) continue;
      sh.next = t + sh.w[0] + Math.random() * (sh.w[1] - sh.w[0]);
      if (gapOf[sh.key] > 0) continue;
      const f = sh.bed ? (sh.s.bed === 'out' ? st.open : 1 - st.open) ** 2 : fall(dist(c, sh), sh.s.range); if (f < .04) continue;
      sfx('amb_' + sh.key + '_' + (Math.random() * sh.s.n | 0), sh.s.vol * f); gapOf[sh.key] = GAP[sh.key] ?? 3;
      st.played++; st.last.push(sh.key); if (st.last.length > 12) st.last.shift();
    }
  });
  // a hidden tab is silent; the loops come back on the next update
  document.addEventListener('visibilitychange', () => { if (document.hidden) for (const L of loops) L.a?.pause(); });
  const state = () => ({ on: !!st.data, open: +st.open.toFixed(2), loops: Object.fromEntries(loops.filter(L => L.a && !L.a.paused).map(L => [L.key, +L.v.toFixed(3)])), shots: st.played, last: [...st.last] });
  return { ready, state };
}

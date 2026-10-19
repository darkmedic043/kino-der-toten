// Malibu Drive helpers shared by the map's scripts (mod.js, heroes.js, tony.js...): the build's entities.json and ENT_
// meshes, GSC-style moves, the map's sounds and models, and the iprintln feed the original talks through.
// Coordinates: entities.json is in game space already (CoD x, y, z -> game x, z, -y), so CoD moveX(d) is +x here, moveY(d)
// is -z and moveZ(d) is +y (see `cod`).
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { loadModel, loadAnimation, Rig } from '../../animation.js';

export async function createKit(api) {
  const { world, session, host, audio } = api;
  const dir = api.map.dir.replace(/\/?$/, '/');
  const ents = await fetch(dir + 'entities.json').then(r => r.json()).catch(() => []);
  const named = n => ents.filter(e => e.name === n);
  const one = n => ents.find(e => e.name === n) ?? null;
  const v3 = a => new THREE.Vector3(...a);
  const center = e => e.bounds ? new THREE.Vector3(...[0, 1, 2].map(i => (e.bounds[0][i] + e.bounds[1][i]) / 2)) : v3(e.origin);
  // CoD angles (pitch, yaw, roll) -> a game-space yaw for a model facing its local +X (CoD forward)
  const yawOf = e => THREE.MathUtils.degToRad(e?.angles?.[1] ?? e?.yaw ?? 0);
  const cod = (x, y, z) => new THREE.Vector3(x, z, -y);   // a CoD offset in game axes
  const now = () => session.time;

  // ---- ENT_<targetname> meshes (top-level nodes; one name may have several)
  const nodes = n => { const out = []; world.root?.traverse(o => { if (o.name === 'ENT_' + n && o.parent?.name !== 'ENT_' + n) out.push(o); }); return out; };
  const show = (n, on) => { for (const o of nodes(n)) o.visible = on; };
  const boxOf = n => { const b = new THREE.Box3(); for (const o of nodes(n)) b.expandByObject(o); return b; };

  // ---- collision for ENT meshes (left out of COL_world by the build): player and bullets... the player only, as a
  // window-type dynamic piece, so it doesn't cut the navmesh
  const solids = new Map();
  const solid = (n, on = true) => {
    let s = solids.get(n);
    if (!s && on) {
      const geos = [];
      for (const o of nodes(n)) { o.updateWorldMatrix(true, true); o.traverse(m => { if (!m.isMesh) return; const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); geos.push(g.applyMatrix4(m.matrixWorld)); }); }
      if (!geos.length) return null;
      const pos = new Float32Array(geos.reduce((n2, g) => n2 + g.attributes.position.array.length, 0)); let k = 0;
      for (const g of geos) { pos.set(g.attributes.position.array, k); k += g.attributes.position.array.length; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeBoundingBox();
      s = { collider: new CollisionWorld(g), box: g.boundingBox.clone(), enabled: true, window: true, note: 'malibu ' + n };
      solids.set(n, s); world.dynamic.push(s);
    }
    if (s) s.enabled = on;
    return s;
  };

  // ---- moves over game time, like GSC's moveTo/moveZ/rotateYaw (ease ignored: smoothstep in and out)
  const moves = [];
  const base = new Map();   // object -> its build position/rotation (reset puts everything back)
  const remember = o => { if (!base.has(o)) base.set(o, { p: o.position.clone(), q: o.quaternion.clone(), v: o.visible }); };
  // move(name or objects, delta Vector3 in game axes, seconds) -> a promise for the end
  const move = (target, delta, dur = 1, { rot = null } = {}) => {
    const objs = typeof target === 'string' ? nodes(target) : [target].flat().filter(Boolean);
    return Promise.all(objs.map(o => new Promise(done => {
      remember(o);
      for (let i = moves.length - 1; i >= 0; i--) if (moves[i].o === o) { moves[i].finish(); moves.splice(i, 1); }
      const from = o.position.clone(), to = from.clone().add(delta), q0 = o.quaternion.clone();
      const q1 = rot ? q0.clone().premultiply(new THREE.Quaternion().setFromEuler(rot)) : q0;
      const m = { o, t0: now(), dur: Math.max(.001, dur), from, to, q0, q1, finish() { o.position.copy(to); o.quaternion.copy(q1); o.updateMatrix(); o.updateMatrixWorld(true); done(); } };
      moves.push(m);
    })));
  };
  const moveTo = (target, position, dur) => { const o = (typeof target === 'string' ? nodes(target) : [target])[0]; return o ? move(o, position.clone().sub(o.getWorldPosition(new THREE.Vector3())), dur) : Promise.resolve(); };
  host.on('update', () => {
    for (let i = moves.length - 1; i >= 0; i--) {
      const m = moves[i], k = Math.min(1, (now() - m.t0) / m.dur), e = k * k * (3 - 2 * k);
      m.o.position.lerpVectors(m.from, m.to, e); m.o.quaternion.slerpQuaternions(m.q0, m.q1, e); m.o.updateMatrix(); m.o.updateMatrixWorld(true);   // map meshes are frozen (matrixAutoUpdate off)
      if (k >= 1) { moves.splice(i, 1); m.finish(); }
    }
  });
  // wait(seconds) in game time (GSC's wait)
  const waits = [];
  const wait = s => new Promise(r => waits.push({ at: now() + s, r }));
  host.on('update', () => { for (let i = waits.length - 1; i >= 0; i--) if (now() >= waits[i].at) { waits[i].r(); waits.splice(i, 1); } });

  // ---- the map's sounds (sounds/<name>.ogg, from the iwd), through the game's mixer
  const LEVEL = 1 / .42, playing = new Set();
  const sound = (name, { volume = .7, loop = false, at = null, range = 1200 } = {}) => {
    try {
      const a = new Audio(dir + 'sounds/' + name + '.ogg'); a.loop = loop;
      const ctx = audio?.ctx, master = audio?.master;
      let vol = volume;
      if (at) { const d = at.distanceTo(api.camera.position); if (d > range) return null; vol *= 1 - d / range; }
      if (ctx && master) {
        const gn = ctx.createGain(); gn.gain.value = vol * LEVEL; ctx.createMediaElementSource(a).connect(gn).connect(master);
        Object.defineProperty(a, 'volume', { configurable: true, get: () => gn.gain.value / LEVEL, set: x => { gn.gain.value = Math.max(0, x) * LEVEL; } });
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } else a.volume = vol;
      a.play().catch(() => {}); playing.add(a); a.addEventListener('ended', () => playing.delete(a)); return a;
    } catch { return null; }
  };

  // ---- models from the asset build (models/<name>.glb) and posed figures (anims/<name>.json)
  const MODELS_V = 5;   // bump when the asset build changes the models (kino-server and Cloudflare cache .glb for a day)
  const model = name => loadModel(dir + 'models/' + name + '.glb?v=' + MODELS_V).catch(() => null);
  const rigs = new Set();
  const figure = async (name, anim, { position, yaw = 0, attach = [] } = {}) => {
    const o = await model(name); if (!o) return null;
    for (const a of attach) { const part = await model(a); if (part) o.add(part); }
    if (position) o.position.copy(position);
    o.rotation.y = yaw; o.name = 'malibu_' + name;
    o.traverse(c => { if (c.isMesh) { c.frustumCulled = false; c.castShadow = false; } });
    if (anim) {
      const data = await loadAnimation(dir + 'anims/' + anim + '.json').catch(() => null);
      if (data) { const rig = new Rig(o); rig.add('a', data); rig.play('a', true); o.userData.rig = rig; rigs.add(rig); }
    }
    api.scene.add(o); return o;
  };
  host.on('update', dt => { const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60; for (const r of rigs) if (r.root.parent && r.root.visible) r.update(step); });
  // a script_model the build left out (skinned: hall_mk42, the bow), added under the map root as ENT_<name> so the
  // same lookups find it
  const prop = async (name, modelName, anim = null) => {
    if (nodes(name).length) return nodes(name)[0];
    const e = one(name); if (!e) return null;
    const o = await figure(modelName, anim, { position: v3(e.origin), yaw: yawOf(e) });
    if (!o) return null;
    o.name = 'ENT_' + name; world.root.add(o); return o;
  };
  const remove = o => { if (!o) return; if (o.userData.rig) rigs.delete(o.userData.rig); o.removeFromParent(); };

  // ---- the iprintln feed (top left, as in the original): ^1..^8 colour codes
  const COLORS = { 0: '#000', 1: '#ff4d4d', 2: '#6fdc6f', 3: '#ffe066', 4: '#5b8cff', 5: '#7fe0ff', 6: '#ffa94d', 7: '#fff', 8: '#e58cff' };
  let feed = document.getElementById('malibu-feed');
  if (!feed) {
    feed = document.createElement('div'); feed.id = 'malibu-feed';
    feed.style.cssText = 'position:fixed;left:24px;top:150px;z-index:30;display:flex;flex-direction:column;gap:3px;pointer-events:none;font:600 13px/1.25 Arial,Helvetica,sans-serif;color:#fff;text-shadow:0 1px 2px #000,0 0 6px #000;max-width:46vw';
    document.body.append(feed);
  }
  const lines = [];
  const say = text => {
    const el = document.createElement('div');
    const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    el.innerHTML = esc(String(text)).replace(/\^(\d)([^^]*)/g, (_, c, t) => `<span style="color:${COLORS[c] ?? '#fff'}">${t}</span>`);
    feed.append(el); lines.push({ el, until: now() + 5 });
    while (lines.length > 6) lines.shift().el.remove();
  };
  host.on('update', () => { for (let i = lines.length - 1; i >= 0; i--) { const l = lines[i], left = l.until - now(); l.el.style.opacity = Math.max(0, Math.min(1, left)); if (left <= 0) { l.el.remove(); lines.splice(i, 1); } } });
  // a short exchange (the original's "wait n; iprintln" chains): [[seconds before, text], ...]
  let talking = false;
  const dialog = async steps => { if (talking) return; talking = true; try { for (const [delay, text] of steps) { if (delay) await wait(delay); say(text); } } finally { talking = false; } };

  host.on('reset', () => {
    moves.length = 0; waits.length = 0;
    for (const [o, b] of base) { o.position.copy(b.p); o.quaternion.copy(b.q); o.visible = b.v; o.updateMatrix(); o.updateMatrixWorld(true); }
    for (const a of playing) a.pause(); playing.clear();
    for (const l of lines) l.el.remove(); lines.length = 0; talking = false;
  });

  // ---- impacts (quests: "shoot this with X"): bullets (the engine's shot event), projectile blasts, the heroes' own
  // projectiles and melee report where they hit and with what; damage triggers listen
  const impactFns = [];
  const onImpact = fn => impactFns.push(fn);
  const impact = (point, weaponId, kind = 'bullet') => { for (const fn of impactFns) fn(point, weaponId, kind); };
  host.on('shot', e => { if (e?.origin && e.direction) impact(e.origin.clone().addScaledVector(e.direction, e.distance ?? 0), e.def?.id ?? session.def?.id, 'bullet'); });
  const features = api.features;
  if (features?.blast && !features.blast.malibu) { const blast = features.blast.bind(features); features.blast = (position, def, ...rest) => { impact(position.clone(), def?.id, 'blast'); return blast(position, def, ...rest); }; features.blast.malibu = true; }
  // ---- a quick glow burst (the original's playfx) and a screen flash
  const bursts = [];
  const fx = (position, color = 0xffffff, size = 10) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(position); m.scale.setScalar(size * .3); api.scene.add(m); bursts.push({ m, t0: performance.now(), size });
  };
  host.on('update', () => { const t = performance.now(); for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i], k = (t - b.t0) / 350; if (k >= 1) { b.m.removeFromParent(); b.m.geometry.dispose(); b.m.material.dispose(); bursts.splice(i, 1); continue; } b.m.scale.setScalar(b.size * (.3 + k)); b.m.material.opacity = .9 * (1 - k); } });
  const flashEl = document.createElement('div'); flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:39;transition:opacity .25s';
  document.body.append(flashEl);
  const flash = (s = .3) => { flashEl.style.transition = 'none'; flashEl.style.opacity = .55; requestAnimationFrame(() => { flashEl.style.transition = `opacity ${s}s`; flashEl.style.opacity = 0; }); };
  const feet = () => api.player.getFeetPosition();
  const near = (p, r) => feet().distanceTo(p) < r;
  // ---- on-screen waypoints: waypoint(position, label, {color, when, always}) -> {set(position), remove()}; shown while
  // when() is true, held at the screen's edge when off screen or behind. The label shows when you look toward it (or
  // always, with `always`), otherwise just the distance in metres; pinned to the edge, just the diamond
  const marks = []; let markBox = null;
  const waypoint = (position, label, { color = '#7fe0ff', when = () => true, always = false } = {}) => {
    if (!markBox) {
      markBox = document.createElement('div'); markBox.id = 'malibu-waypoints';
      markBox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4';
      const st = document.createElement('style');
      st.textContent = '#malibu-waypoints i{position:absolute;left:0;top:0;width:0;height:0;font:700 11px/1.2 Arial,sans-serif;color:#fff;text-shadow:0 1px 2px #000,0 0 4px #000;letter-spacing:1px}'
        + '#malibu-waypoints i::before{content:"";position:absolute;left:-9px;top:-9px;width:14px;height:14px;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 25%,transparent);transform:rotate(45deg);box-shadow:0 0 10px var(--c)}'
        + '#malibu-waypoints i span{position:absolute;left:-110px;width:220px;top:12px;text-align:center;white-space:nowrap}body.menu-open #malibu-waypoints{visibility:hidden}';
      document.head.append(st); document.body.append(markBox);
    }
    const el = document.createElement('i'); el.style.setProperty('--c', color); el.innerHTML = '<span></span>'; el.style.display = 'none'; markBox.append(el);
    const m = { position: position.clone(), label, when, always, el, set(p) { this.position.copy(p); }, remove() { el.remove(); marks.splice(marks.indexOf(this), 1); } };
    marks.push(m); return m;
  };
  const markTmp = new THREE.Vector3(), markCam = new THREE.Vector3();
  host.on('update', () => {
    if (!marks.length) return;
    const cam = api.camera, W = innerWidth, H = innerHeight, M = 40; cam.getWorldPosition(markCam);
    let best = null, bestD = Infinity;   // only the one nearest the crosshair is named
    for (const m of marks) {
      let on = false; try { on = !!m.when(); } catch {}
      m.el.style.display = on ? '' : 'none'; if (!on) continue;
      const behind = markTmp.copy(m.position).applyMatrix4(cam.matrixWorldInverse).z > 0;
      markTmp.copy(m.position).project(cam);
      let x = (markTmp.x + 1) / 2 * W, y = (1 - markTmp.y) / 2 * H;
      if (behind) { x = W - x; y = H - M; }
      const edge = behind || x < M || x > W - M || y < M || y > H - M;
      x = Math.min(W - M, Math.max(M, x)); y = Math.min(H - M, Math.max(M, y));
      m.el.style.transform = `translate(${x}px,${y}px)`;
      const metres = Math.round(m.position.distanceTo(markCam) * .0254) + ' m', off = Math.hypot(x - W / 2, (y - H / 2) * 1.4);
      m.el.firstChild.textContent = edge ? '' : m.always ? `${m.label} · ${metres}` : metres;
      if (!edge && !m.always && off < 160 && off < bestD) { best = m; bestD = off; }
    }
    if (best) best.el.firstChild.textContent = `${best.label} · ${best.el.firstChild.textContent}`;
  });
  return { api, dir, ents, named, one, center, yawOf, cod, now, nodes, show, boxOf, solid, move, moveTo, wait, sound, model, figure, prop, remove, onImpact, impact, fx, flash, say, dialog, feet, near, waypoint, remember, v3 };
}

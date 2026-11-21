// Wall buys as in Black Ops (not part of upstream; docs/fork/custom-maps.md "Wall buys").
//   * The chalk on the wall is drawn from the gun the wall buy really gives. A ported map's own chalk shows the weapon
//     the map shipped with (a KRM-262 where the port sells the Stakeout): takeMapChalk() takes those drawings out of the
//     map before it is optimised, and createWallChalk() draws each wall gun from the side into a small render target
//     at load, turns its silhouette and the steps between its parts into rough chalk strokes, and lays the result on
//     the wall behind the gun (the old drawing's plane, or the wall found by a ray).
//   * The gun's model stays hidden until the wall buy is first used (gun or ammo), then slides onto the wall as BO1's
//     weapon_show does: 8 units out on the buyer's side, back to its place over a second.
//   * A port's gun is put right first: sized (BO3 world models are 2.2 times BO1's), turned flat onto its wall and
//     centred on the old drawing (the ports' markers face along the wall, so the guns stood end-on in it).
// Kino's own chalk already matches its guns, so there only the models are hidden. A wall buy with no wall behind it
// (a gun on a rack) gets no chalk and keeps its model in view; one whose marker has a pool (Malibu Drive's stations,
// swapped by the map's mod) is left alone.
//   kino.wallChalk  { buys, bought(id, at), show(i), reset(), connect(), enabled }   ?noWallChalk = the old state
import * as THREE from 'three';
import { skinnedBox } from './skinned-bounds.js';

const CHALK = /chalk/i, NOT_CHALK = /chalkboard|chalky/i;
const NEAR = 24;      // a chalk drawing this close to a wall-buy marker is that wall buy's
const SIZE = 512;     // long side of a drawing, px

// custom-world.js, before the scene is optimised: the map's own weapon chalk near its wall buys leaves the scene.
// buys = the WALLBUY markers; returns [{ at (the wall buy's position), center, normal }], and in .own the positions of
// the wall buys whose gun a map mod deals out itself (a marker with a pool: Malibu Drive's stations), left alone here
export function takeMapChalk(root, buys) {
  const out = [], drop = [];
  out.own = buys.filter(b => b.extras?.pool).map(b => b.position.clone()); buys = buys.filter(b => !b.extras?.pool);
  if (!buys.length || /[?&]noWallChalk\b/.test(globalThis.location?.search ?? '')) return out;
  const box = new THREE.Box3(), c = new THREE.Vector3(), size = new THREE.Vector3(), tri = new THREE.Triangle(), nm = new THREE.Matrix3();
  root.traverse(o => {
    if (!o.isMesh || o.userData.marker) return;
    const name = [o.material].flat().map(m => m?.name ?? '').join(' ');
    if (!CHALK.test(name) || NOT_CHALK.test(name)) return;
    const g = o.geometry, P = g.attributes.position; if (!P || P.count < 3) return;
    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.getCenter(c); box.getSize(size);
    if (Math.max(size.x, size.y, size.z) > 90) return;   // several drawings in one mesh, or a mural
    let best = null, bd = NEAR;
    for (const b of buys) { const d = b.position.distanceTo(c); if (d < bd) { bd = d; best = b; } }
    if (!best) return;
    const ix = g.index, at = k => (ix ? ix.getX(k) : k);
    tri.a.fromBufferAttribute(P, at(0)); tri.b.fromBufferAttribute(P, at(1)); tri.c.fromBufferAttribute(P, at(2));
    const normal = tri.getNormal(new THREE.Vector3()).applyMatrix3(nm.getNormalMatrix(o.matrixWorld)).normalize();
    out.push({ at: best.position.clone(), center: c.clone(), normal, d: bd, name }); drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  return out;
}

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tD; uniform vec2 px; uniform float seed, aspect, step;
varying vec2 vUv;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+1.),f.x),f.y);}
vec4 D(vec2 uv){return texture2D(tD,uv);}   // r = depth, a = the gun
float rim(vec2 uv,float r){float mx=0.,mn=1.;for(int i=0;i<8;i++){float a=float(i)*.7854;float m=D(uv+vec2(cos(a),sin(a))*px*r).a;mx=max(mx,m);mn=min(mn,m);}return mx-mn;}
float part(vec2 uv,float r){vec4 c=D(uv);float e=0.;for(int i=0;i<4;i++){float a=float(i)*1.5708;vec4 s=D(uv+vec2(cos(a),sin(a))*px*r);e=max(e,abs(s.r-c.r)*s.a*c.a);}return e;}
void main(){
  vec2 p=vUv*vec2(aspect,1.);
  // an unsteady hand: the line wanders, and a second lighter pass does not quite follow the first
  vec2 w1=(vec2(vn(p*8.+seed),vn(p*8.+seed+31.))-.5)*px*8.;
  vec2 w2=(vec2(vn(p*4.+seed+7.),vn(p*4.+seed+53.))-.5)*px*12.;
  float o1=smoothstep(.3,.85,rim(vUv+w1,2.4));
  float o2=smoothstep(.3,.85,rim(vUv+w2,1.5))*.5;
  float in1=smoothstep(step,step*2.2,part(vUv+w1,1.8))*.62;
  float line=max(max(o1,o2),in1);
  // chalk skips on the wall's grain and thins where the hand lifted
  float grain=vn(p*190.)*.55+vn(p*61.+3.)*.45;
  line*=mix(.25,1.,smoothstep(.2,.55,grain))*mix(.55,1.,vn(p*6.+seed*2.));
  // loose hatching across the body
  float m=D(vUv+w2).a;
  float hatch=smoothstep(.72,.98,sin((p.x+p.y*.7)*170.+vn(p*11.+seed)*6.))*m*.2*smoothstep(.35,.7,vn(p*23.+9.))*smoothstep(.15,.5,grain);
  float white=clamp(max(line,hatch),0.,1.);
  // the wall rubbed dull around the strokes, so the drawing also reads on a pale wall
  float smear=smoothstep(.05,.8,rim(vUv+w2,6.))*.3*mix(.5,1.,vn(p*17.+seed));
  float a=max(white,smear);
  gl_FragColor=vec4(mix(vec3(.1,.1,.11),vec3(1.),white/max(a,.001)),a);
}`;

export function createWallChalk({ renderer, scene, world, data }) {
  const off = /[?&]noWallChalk\b/.test(globalThis.location?.search ?? '');
  const buys = [], drawings = new Map(), api = { buys, drawings, enabled: !off, chalk: 0, noWall: 0 };
  // --- the map's wall buys and their models
  if (world.wallGuns) {
    const used = new Set();
    for (const e of world.interactions ?? []) {
      if (e.kind !== 'wallbuy') continue;
      const gun = world.wallGuns.find(g => !used.has(g) && g.position.distanceToSquared(e.position) < 1);
      if (gun) { used.add(gun); buys.push({ weapon: e.weapon, position: e.position, gun, entry: e, own: (world.wallChalk?.own ?? []).some(p => p.distanceToSquared(e.position) < 1) }); }
    }
  } else if (world.entities?.get && Array.isArray(data.entities)) {   // Kino: trigger -> script_model, chalk in the map
    for (const e of data.entities) {
      if (e.targetname !== 'weapon_upgrade' || !data.weapons[e.zombie_weapon_upgrade]) continue;
      const t = data.entities.find(x => x.targetname === e.target && x.classname === 'script_model'), gun = t && world.entities.get(t.id);
      if (gun) buys.push({ weapon: e.zombie_weapon_upgrade, position: new THREE.Vector3().fromArray(e.position), gun, native: true });
    }
  }
  if (off || !buys.length) return Object.assign(api, { bought() {}, show() {}, reset() {}, connect() {} });

  // --- measuring a gun: its box in its own space (visible parts only), its thin axis
  const _b = new THREE.Box3(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const shown = (c, top) => { for (let p = c; p; p = p.parent) { if (!p.visible) return false; if (p === top) break; } return true; };
  function measure(gun) {
    gun.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), box = new THREE.Box3();
    gun.traverse(c => {
      if (!c.isMesh || !shown(c, gun)) return;
      if (c.isSkinnedMesh) skinnedBox(c, _b); else { c.geometry.boundingBox || c.geometry.computeBoundingBox(); _b.copy(c.geometry.boundingBox); }
      if (_b.isEmpty()) return;
      box.union(_b.applyMatrix4(_m.multiplyMatrices(inv, c.matrixWorld)));
    });
    if (box.isEmpty()) return null;
    const s = box.getSize(new THREE.Vector3()), thin = new THREE.Vector3(s.x < s.z ? 1 : 0, 0, s.x < s.z ? 0 : 1), long = new THREE.Vector3(thin.z, 0, thin.x);
    return { box, center: box.getCenter(new THREE.Vector3()).applyMatrix4(gun.matrixWorld), thin: thin.transformDirection(gun.matrixWorld), long: long.transformDirection(gun.matrixWorld) };
  }

  // --- the wall behind a gun: { point, normal } with the normal towards the room
  const ray = new THREE.Ray();
  const cast = (from, dir, far) => { ray.origin.copy(from); ray.direction.copy(dir); try { return world.raycast(ray, 0, far) || null; } catch { return null; } };
  // a ray from 30 out on one side back at the gun: on the room's side it runs free until the wall just behind the gun
  function probe(center, dir) {
    const h = cast(_v.copy(center).addScaledVector(dir, 30), dir.clone().negate(), 46);
    return h && h.distance > 24 ? h : null;
  }
  function findWall(f, old, buy) {
    if (old) {
      const n = old.normal.clone(), a = probe(old.center, n), b = probe(old.center, n.clone().negate());
      if (b && !a) n.negate(); else if (!!a === !!b) { const side = _v.copy(f.center).sub(old.center).dot(n); if (side < -.4) n.negate(); }
      return { point: old.center.clone(), normal: n };
    }
    const a = probe(f.center, f.thin), b = probe(f.center, f.thin.clone().negate()), h = a && b ? (a.distance < b.distance ? a : b) : a ?? b;
    if (!h) {
      // end-on in its wall (a port's marker facing along the wall): the wall cuts the gun close to its middle on one
      // side and the room is open on the other
      const s = f.box.getSize(new THREE.Vector3()), half = Math.max(s.x, s.z) * buy.gun.scale.x / 2;
      for (const sign of [1, -1]) {
        const d = f.long.clone().multiplyScalar(sign), near = cast(f.center, d, half + 4);
        if (!near || cast(f.center, d.clone().negate(), half + 24)) continue;
        const n = near.triangle?.getNormal ? near.triangle.getNormal(new THREE.Vector3()) : d.clone().negate();
        if (n.dot(d) > -.8) n.copy(d).negate();
        return { point: near.position.clone(), normal: n, turn: true };
      }
      return null;
    }
    const dir = h === a ? f.thin.clone() : f.thin.clone().negate(), n = h.triangle?.getNormal ? h.triangle.getNormal(new THREE.Vector3()) : dir.clone();
    if (n.dot(dir) < .8) n.copy(dir);   // a slanted or odd face: the gun's own side decides
    return { point: h.position.clone(), normal: n };
  }

  // --- a port's gun, put right. Imported BO3 world models are 2.2 times BO1's size (characters.js holdWeapon), and a
  // BO3 map's wall-buy marker is its trigger, whose facing is not the gun's: the guns stood end-on in their walls.
  // The map's own drawing is where the gun hung in the original, so the gun is turned flat onto it and centred there
  // (with no drawing to go by: onto the wall it sticks through, findWall's turn).
  const yawOf = v => Math.atan2(v.x, v.z), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function resize(b) {
    const def = data.weapons[b.weapon] ?? {}, ws = def.worldScale ?? (/bo3-weapons|wpn_t7|_vmgun/.test(def.worldModel ?? '') ? 1 / 2.2 : 1);
    if (ws !== 1) { b.gun.scale.multiplyScalar(ws); b.scaled = ws; }
  }
  function hang(b, f, wall, old) {
    const n = wall.normal; if (Math.abs(n.y) > .5 || old?.d > 14) return f;
    if (Math.abs(f.thin.dot(n)) < .9) {
      const t = new THREE.Vector3().crossVectors(Y, n).normalize(), d1 = wrap(yawOf(t) - yawOf(f.long)), d2 = wrap(yawOf(t) + Math.PI - yawOf(f.long));
      b.gun.rotation.y += Math.abs(Math.abs(d1) - Math.abs(d2)) < .02 ? Math.min(d1, d2) : Math.abs(d1) < Math.abs(d2) ? d1 : d2; b.turned = true;
      f = measure(b.gun);
    }
    const s = f.box.getSize(_v), half = Math.min(s.x, s.z) * b.gun.scale.x / 2;
    b.gun.position.add(_v.copy(wall.point).addScaledVector(n, half + .6).sub(f.center));
    return measure(b.gun);
  }

  // --- the drawings
  const group = new THREE.Group(); group.name = 'wall-chalk'; group.userData.noVisCull = true; group.matrixAutoUpdate = false;
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: THREE.DoubleSide });
  const stage = new THREE.Scene(); stage.overrideMaterial = depthMat; stage.matrixWorldAutoUpdate = false;
  const pass = new THREE.ShaderMaterial({ uniforms: { tD: { value: null }, px: { value: new THREE.Vector2() }, seed: { value: 0 }, aspect: { value: 1 }, step: { value: .04 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: FRAG, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), pass); quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad); const quadCam = new THREE.Camera();
  const cam = new THREE.OrthographicCamera(), rot = new THREE.Matrix4(), temps = [];
  const state = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear };
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());

  function draw(b, f, wall, key) {
    const n = wall.normal, up = Math.abs(n.y) > .9 ? f.long : Y;
    const yc = up.clone().addScaledVector(n, -n.dot(up)).normalize(), xc = new THREE.Vector3().crossVectors(yc, n);
    // the gun's extent in the drawing's axes
    const { min, max } = f.box; let k = 0;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) corners[k++].set(x, y, z).applyMatrix4(b.gun.matrixWorld).sub(f.center);
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = lo.clone().negate();
    for (const c of corners) { _v.set(c.dot(xc), c.dot(yc), c.dot(n)); lo.min(_v); hi.max(_v); }
    const w = hi.x - lo.x, h = hi.y - lo.y, pad = Math.max(1.5, w * .07), hw = w / 2 + pad, hh = h / 2 + pad;
    const mid = f.center.clone().addScaledVector(xc, (lo.x + hi.x) / 2).addScaledVector(yc, (lo.y + hi.y) / 2);
    let d = drawings.get(key);
    if (!d) {
      const W = hw >= hh ? SIZE : Math.max(64, Math.round(SIZE * hw / hh)), H = hw >= hh ? Math.max(64, Math.round(SIZE * hh / hw)) : SIZE;
      const depth = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true }); temps.push(depth);
      const out = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      out.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); out.texture.name = 'wall-chalk ' + b.weapon;
      cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.near = 1; cam.far = hi.z - lo.z + 11; cam.updateProjectionMatrix();
      cam.position.copy(mid).addScaledVector(n, hi.z + 6); cam.quaternion.setFromRotationMatrix(rot.makeBasis(xc, yc, n)); cam.updateMatrixWorld(true);
      const parent = b.gun.parent; stage.add(b.gun);
      renderer.setRenderTarget(depth); renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.render(stage, cam);
      parent.add(b.gun);
      const u = pass.uniforms; u.tD.value = depth.texture; u.px.value.set(1 / W, 1 / H); u.aspect.value = W / H; u.seed.value = (drawings.size * 7.31) % 50;
      u.step.value = .55 / cam.far;   // parts more than about half a unit apart get a line between them
      renderer.setRenderTarget(out); renderer.render(quadScene, quadCam);
      d = { out, material: new THREE.MeshBasicMaterial({ map: out.texture, color: 0xb4b4ac, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), geometry: new THREE.PlaneGeometry(1, 1) };
      d.material.name = 'wall-chalk'; drawings.set(key, d);
    }
    const mesh = new THREE.Mesh(d.geometry, d.material); mesh.name = 'wall-chalk ' + b.weapon; mesh.renderOrder = 2;
    // on the wall: the gun's middle dropped onto the wall's plane, a hair in front of it
    const on = mid.clone().addScaledVector(n, -_v.copy(mid).sub(wall.point).dot(n) + .3);
    mesh.matrix.makeBasis(xc, yc, n).scale(_v.set(hw * 2, hh * 2, 1)).setPosition(on); mesh.matrixAutoUpdate = false; mesh.matrixWorld.copy(mesh.matrix);
    mesh.userData.noMerge = mesh.userData.noCull = true;
    group.add(mesh); b.chalk = mesh; api.chalk++;
  }

  for (const b of buys) {
    try {
      if (!b.native && !b.own) resize(b);
      let f = b.f = measure(b.gun); if (!f) continue;
      if (b.native || b.own) continue;
      const old = (world.wallChalk ?? []).filter(c => c.at.distanceToSquared(b.position) < 1).sort((x, y) => x.d - y.d)[0];
      const wall = findWall(f, old, b); if (!wall) { api.noWall++; continue; }
      if (old || wall.turn) f = b.f = hang(b, f, wall, old);
      // one drawing per weapon and view of it (the wall's side and tilt in the gun's own space)
      const q = new THREE.Quaternion().setFromRotationMatrix(b.gun.matrixWorld).invert(), ln = wall.normal.clone().applyQuaternion(q);
      draw(b, f, wall, b.weapon + '|' + [ln.x, ln.y, ln.z].map(x => Math.round(x * 20)).join(','));
    } catch (e) { console.warn('[wall-chalk]', b.weapon, e); }
  }
  renderer.setRenderTarget(state.target); renderer.setClearColor(state.color, state.alpha); renderer.autoClear = state.auto;
  for (const t of temps) t.dispose();
  if (group.children.length) { group.updateMatrixWorld(true); scene.add(group); }

  // --- hidden until bought: each gun goes under a holder of its own (a map mod may drive the gun's own .visible)
  for (const b of buys) {
    if (!b.native && !b.chalk) continue;   // nothing on the wall to find it by: the model stays
    const h = b.holder = new THREE.Group(); h.name = 'wall-gun ' + b.weapon; b.gun.parent.add(h); h.add(b.gun); h.visible = false; b.hidden = true;
  }
  const out = new THREE.Vector3(), tweens = new Set();
  let running = false;
  function tick() {
    const now = performance.now();
    for (const t of tweens) {
      const k = Math.min(1, (now - t.t0) / 1000), e = 1 - (1 - k) * (1 - k);
      t.h.position.copy(t.dir).multiplyScalar(8 * (1 - e)); t.h.updateMatrix(); t.h.updateMatrixWorld(true);
      if (k >= 1) tweens.delete(t);
    }
    if (tweens.size) requestAnimationFrame(tick); else running = false;
  }
  function show(i, from) {
    const b = buys[i]; if (!b?.holder || !b.hidden) return false;
    b.hidden = false; b.holder.visible = true;
    // BO1's weapon_show: out on the buyer's side of the gun, then back into place
    const f = b.f, side = b.chalk ? out.setFromMatrixColumn(b.chalk.matrix, 2).normalize() : f.thin;
    const dir = side.clone(); dir.y = 0; if (dir.lengthSq() < .01) dir.copy(f.thin); dir.normalize();
    if (!b.chalk && from && _v.copy(from).sub(f.center).dot(dir) < 0) dir.negate();
    tweens.add({ h: b.holder, dir, t0: performance.now() }); if (!running) { running = true; tick(); }
    globalThis.kino?.visCull?.wake?.(b.holder);
    return true;
  }
  let net = null;
  return Object.assign(api, {
    show,
    // engine.js shop.buyWall: the wall buy of that weapon nearest the buyer
    bought(id, at) {
      // (a map mod may have renamed the wall buy's weapon since load: Cheese Cube's MP40 spots sell the Cheese Gun)
      let best = -1, bd = 400 * 400;
      buys.forEach((b, i) => { if ((b.entry?.weapon ?? b.weapon) !== id) return; const d = at ? b.position.distanceToSquared(at) : 0; if (d < bd) { bd = d; best = i; } });
      if (best < 0 || !show(best, at)) return;
      if (net?.id) net.send('all', { t: 'wallgun', i: best });
    },
    reset() { tweens.clear(); for (const b of buys) if (b.holder) { b.hidden = true; b.holder.visible = false; b.holder.position.set(0, 0, 0); b.holder.updateMatrix(); b.holder.updateMatrixWorld(true); } },
    // after the mods start: teammates see a gun the moment anyone buys it
    connect() { net = globalThis.kino?.coop ?? null; net?.on?.('wallgun', m => show(m.i | 0, null)); },
  });
}

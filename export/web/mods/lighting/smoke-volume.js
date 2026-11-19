// Smoke volumes (fork, 2026-11-19): smoke that fills the space it is thrown into, the way Counter-Strike 2's does.
//
// A cloud is a 40x20x40 grid of 20-unit cells around the point it starts from. A flood fill walks from that point
// through the map's collision (world.raycast between cell centres), so the smoke stops at walls, floors and shut
// doors, pours through doorways and down stairs, and what a wall keeps out of one side goes further along the other:
// the fill has a fixed budget of cells, not a radius. The path length of each cell (any-angle, so open ground gives a
// round dome and not a diamond) is its arrival time; the grid is a small 3D texture (R = how far the front is past
// the cell, G = a wall is right there) re-uploaded only while the cloud grows.
//
// Drawing: one composer pass (after motion blur, before the first-person weapon) ray-marches each cloud's box into its
// own target against the frame's depth and blends it over the frame. Scrolling 3D noise eats the open edges into
// billows, one tap towards the light shades them. Low graphics has no composer: there the same cells are drawn as
// camera-facing puffs (one instanced draw a cloud). Both programs are compiled and first drawn at load (warm()).
//
//   const vol = smokeVolume(api);                 // one per page, shared by the lighting mod and the smoke grenade
//   const c = vol.spawn(at, radius, { grow });    // radius = how wide it would get on open ground
//   vol.filled(c, position)                       // is this point in the smoke (after the front passed it)
//   c.fade = 0..1; vol.release(c);                // thin it out, then free its slot
//   vol.hole(position, radius)                    // an explosion blows a hole that closes again
//
// Live tuning: kino.smokeVol.config (sigma = thickness, clear = how far you see from inside, scale = resolution per
// graphics level), kino.smokeVol.stats.
import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

const NX = 40, NY = 20, NZ = 40, N = NX * NY * NZ, CELL = 20, SX = 20, SY = 5, SZ = 20;
const SOFT = 60, UP = 1.6, DOWN = 1.1, POOL = 4, HOLES = 3, PUFFS = 160;
const DI = [1, -1, 0, 0, 0, 0], DJ = [0, 0, 1, -1, 0, 0], DK = [0, 0, 0, 0, 1, -1], STEP = [CELL, CELL, CELL * UP, CELL * DOWN, CELL, CELL];
const DIRS = DI.map((x, d) => new THREE.Vector3(x, DJ[d], DK[d]));

// tiling Worley noise, two octaves, 32^3: bright blobs with dark creases (cauliflower once thresholded)
function noiseTexture() {
  const S = 32, data = new Uint8Array(S * S * S); let seed = 0x9e3779b9;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const points = g => { const a = new Float32Array(g * g * g * 3); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const worley = (g, P, x, y, z) => {
    const fx = x * g, fy = y * g, fz = z * g, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz); let m = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy, cz = iz + dz, o = ((((cz + g) % g) * g + (cy + g) % g) * g + (cx + g) % g) * 3;
      const ex = cx + P[o] - fx, ey = cy + P[o + 1] - fy, ez = cz + P[o + 2] - fz, d = ex * ex + ey * ey + ez * ez; if (d < m) m = d;
    }
    return Math.sqrt(m);
  };
  const A = points(4), B = points(9), raw = new Float32Array(S * S * S); let lo = 9, hi = -9;
  for (let z = 0, i = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = (x + .5) / S, v = (y + .5) / S, w = (z + .5) / S, n = .64 * (1 - Math.min(1, worley(4, A, u, v, w))) + .36 * (1 - Math.min(1, worley(9, B, u, v, w)));
    raw[i] = n; if (n < lo) lo = n; if (n > hi) hi = n;
  }
  for (let i = 0; i < raw.length; i++) data[i] = Math.round(255 * (raw[i] - lo) / (hi - lo));
  const t = new THREE.Data3DTexture(data, S, S, S); t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true; return t;
}

const VERT = /* glsl */`varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const FRAG = /* glsl */`precision highp float;precision highp sampler3D;
#include <packing>
uniform sampler3D tVol,tNoise;uniform sampler2D tDepth;
uniform vec3 gridMin,gridSize,boxLo,boxHi,camDir,lightDir,tint;uniform vec2 res;uniform float near,far,time,fade,clearR,sigma,seed;uniform vec4 holes[${HOLES}];
varying vec3 vWorld;
float shape(vec3 p,vec2 v,out float n){
  n=texture(tNoise,p*(1./230.)+vec3(time*.011,-time*.019,time*.007)+seed).r*.68+texture(tNoise,p*(1./74.)+vec3(-time*.027,-time*.05,time*.013)-seed).r*.32;
  float w=clamp(v.g*1.6,0.,1.),thr=mix(.5,.55,w)+(n-.5)*mix(.86,.16,w);
  return smoothstep(thr-.05,thr+.1,v.r);}
void main(){
  vec3 rd=normalize(vWorld-cameraPosition),inv=1./(rd+vec3(1e-5)),a=(boxLo-cameraPosition)*inv,b=(boxHi-cameraPosition)*inv,lo=min(a,b),hi=max(a,b);
  float tn=max(max(lo.x,lo.y),max(lo.z,0.)),tf=min(min(hi.x,hi.y),hi.z);
  float vz=-perspectiveDepthToViewZ(texture2D(tDepth,gl_FragCoord.xy/res).x,near,far);tf=min(tf,vz/max(1e-4,dot(rd,camDir)));
  if(tf<=tn)discard;
  float t=tn+fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))*10.,T=1.,k=sigma*fade,n;vec3 col=vec3(0.);
  for(int i=0;i<64;i++){
    if(t>=tf||T<.02)break;
    vec3 p=cameraPosition+rd*t;vec2 v=texture(tVol,(p-gridMin)/gridSize).rg;float len=18.;
    if(v.r>.03){
      float d=shape(p,v,n)*smoothstep(clearR*.15,clearR,t);
      for(int h=0;h<${HOLES};h++)d*=smoothstep(holes[h].w*.5,max(holes[h].w,.001),distance(p,holes[h].xyz));
      if(d>.004){
        len=min(9.,tf-t+.5);
        vec3 lp=p+lightDir*17.;vec2 lv=texture(tVol,(lp-gridMin)/gridSize).rg;
        float w=clamp(lv.g*1.6,0.,1.),lt=mix(.5,.55,w)+(n-.5)*mix(.86,.16,w),shade=smoothstep(lt-.12,lt+.2,lv.r);
        float lit=mix(1.,.5,shade)*(.84+.16*clamp((p.y-gridMin.y)/gridSize.y*2.4,0.,1.))*(.9+.2*n);
        float al=1.-exp(-d*k*len);col+=T*al*tint*lit;T*=1.-al;
      }
    }
    t+=len;
  }
  if(T>.995)discard;
  gl_FragColor=vec4(col,1.-T);}`;
const QUAD_VS = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const QUAD_FS = /* glsl */`uniform sampler2D tDiffuse;varying vec2 vUv;void main(){gl_FragColor=texture2D(tDiffuse,vUv);}`;
// Low graphics: one camera-facing puff per block of cells
const PUFF_VS = /* glsl */`attribute vec4 iPos;attribute float iSeed;uniform float time,fade,clearR,puffSize;varying vec2 vUv;varying float vA,vL;
#include <fog_pars_vertex>
void main(){vec4 mvPosition=viewMatrix*vec4(iPos.xyz+vec3(0.,sin(time*.5+iSeed*6.)*3.,0.),1.);float c=cos(iSeed*6.283+time*.05),s=sin(iSeed*6.283+time*.05);
  vec2 q=vec2(position.x*c-position.y*s,position.x*s+position.y*c);mvPosition.xy+=q*iPos.w*puffSize;vUv=position.xy;vL=.34+.16*q.y+.1*fract(iSeed*7.31);
  vA=fade*smoothstep(clearR*.6,clearR*1.8,length(mvPosition.xyz));gl_Position=vA<.004?vec4(2.,2.,2.,1.):projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const PUFF_FS = /* glsl */`uniform vec3 tint;uniform float puffA;varying vec2 vUv;varying float vA,vL;
#include <fog_pars_fragment>
void main(){float r=length(vUv)*2.,a=smoothstep(1.,.2,r)*vA*puffA;if(a<.004)discard;gl_FragColor=vec4(tint*vL,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

let inst = null;
export function smokeVolume(api) { return inst ??= create(api); }

function create(api) {
  const { renderer, world, scene, host } = api, K = window.kino ??= {};
  const config = { sigma: .06, clear: 110, scale: [1, .5, .75, 1], tint: [.33, .34, .35], hole: 150, holeLife: 3.5, ms: 2, puff: [.8, 1.5] };
  const stats = { clouds: 0, rays: 0, fillMs: 0, cells: 0, drew: 0 };
  const noise = noiseTexture(), ray = new THREE.Ray(), v0 = new THREE.Vector3();
  const cast = world?.raycast ? (o, d, far) => { stats.rays++; ray.origin.copy(o); ray.direction.copy(d); return world.raycast(ray, 0, far); } : () => null;
  let time = 0, quality = 3;
  const holes = Array.from({ length: HOLES }, () => ({ v: new THREE.Vector4(0, 0, 0, 0), r: 0, age: 9 }));

  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(.5, .5, .5), volScene = new THREE.Scene();
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  const puffU = { time: { value: 0 }, clearR: { value: config.clear }, tint: { value: new THREE.Color() }, puffA: { value: .8 }, puffSize: { value: 1.5 } };
  const puffMaterial = () => new THREE.ShaderMaterial({ uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: puffU.time, clearR: puffU.clearR, tint: puffU.tint, puffA: puffU.puffA, puffSize: puffU.puffSize, fade: { value: 1 } },
    vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false, fog: true });
  const puffMesh = () => {
    const g = new THREE.InstancedBufferGeometry(); g.index = puffGeo.index; g.setAttribute('position', puffGeo.getAttribute('position'));
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const seeds = new Float32Array(PUFFS); for (let i = 0; i < PUFFS; i++) seeds[i] = (i * .6180339887) % 1; g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 1)); g.instanceCount = 0;
    const m = new THREE.Mesh(g, puffMaterial()); m.frustumCulled = false; m.matrixAutoUpdate = false; m.renderOrder = 6; m.userData.noMerge = m.userData.noVisCull = true; return m;
  };
  const slots = Array.from({ length: POOL }, (_, id) => {
    const data = new Uint8Array(N * 2), tex = new THREE.Data3DTexture(data, NX, NY, NZ);
    tex.format = THREE.RGFormat; tex.type = THREE.UnsignedByteType; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.unpackAlignment = 1; tex.needsUpdate = true;
    const u = { tVol: { value: tex }, tNoise: { value: noise }, tDepth: { value: null }, gridMin: { value: new THREE.Vector3() }, gridSize: { value: new THREE.Vector3(NX * CELL, NY * CELL, NZ * CELL) },
      boxLo: { value: new THREE.Vector3() }, boxHi: { value: new THREE.Vector3() }, camDir: { value: new THREE.Vector3(0, 0, -1) }, lightDir: { value: new THREE.Vector3(.3, .9, .25).normalize() },
      tint: { value: new THREE.Color() }, res: { value: new THREE.Vector2(1, 1) }, near: { value: 1 }, far: { value: 1000 }, time: { value: 0 }, fade: { value: 1 }, clearR: { value: config.clear },
      sigma: { value: config.sigma }, seed: { value: id * .37 }, holes: { value: holes.map(h => h.v) } };
    const box = new THREE.Mesh(boxGeo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
      premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }));
    box.frustumCulled = false; box.visible = false; volScene.add(box);
    const puffs = puffMesh(); puffs.visible = false; scene.add(puffs);
    return { id, data, tex, u, box, puffs, cost: new Float32Array(N), state: new Uint8Array(N), wall: new Uint8Array(N), anchor: new Int32Array(N), gk: new Float32Array(N), gc: new Float32Array(N), hc: [], hi: [], cloud: null, used: 0 };
  });
  { const w = puffMesh(); w.geometry.instanceCount = 1; w.geometry.getAttribute('iPos').setXYZW(0, 0, 0, 0, 40); (host.warmObjects ??= []).push(w); }

  // ---- the fill: Dijkstra over the cells, any-angle (a cell seen from its parent's anchor takes the straight distance)
  const push = (s, c, i) => { const hc = s.hc, hi = s.hi; let n = hc.length; hc.push(c); hi.push(i); while (n > 0) { const p = (n - 1) >> 1; if (hc[p] <= c) break; hc[n] = hc[p]; hi[n] = hi[p]; n = p; } hc[n] = c; hi[n] = i; };
  const pop = s => { const hc = s.hc, hi = s.hi, top = hi[0], c = hc.pop(), i = hi.pop(), len = hc.length; if (len) { let n = 0; for (;;) { let k = 2 * n + 1; if (k >= len) break; if (k + 1 < len && hc[k + 1] < hc[k]) k++; if (hc[k] >= c) break; hc[n] = hc[k]; hi[n] = hi[k]; n = k; } hc[n] = c; hi[n] = i; } return top; };
  const centre = (c, i, j, k, out) => out.set(c.min.x + (i + .5) * CELL, c.min.y + (j + .5) * CELL, c.min.z + (k + .5) * CELL);
  const from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
  function advance(c, ms) {
    const s = c.slot, { cost, state, wall, anchor, gk, gc } = s, t0 = performance.now(); let n = 0;
    while (s.hc.length) {
      if ((++n & 7) === 0 && performance.now() - t0 > ms) break;
      const cu = s.hc[0], u = pop(s); if (state[u] === 2 || cu > cost[u] + 1e-3) continue;
      if (cu > c.maxCost || c.popped >= c.budget) { c.done = true; c.frontMax = Math.min(cu, c.maxCost); s.hc.length = s.hi.length = 0; break; }
      state[u] = 2; c.popped++; c.doneCost = cu;
      const i = u % NX, j = ((u / NX) | 0) % NY, k = (u / (NX * NY)) | 0, a = anchor[u], ai = a % NX, aj = ((a / NX) | 0) % NY, ak = (a / (NX * NY)) | 0;
      if (i < c.lo[0]) c.lo[0] = i; if (j < c.lo[1]) c.lo[1] = j; if (k < c.lo[2]) c.lo[2] = k; if (i > c.hi[0]) c.hi[0] = i; if (j > c.hi[1]) c.hi[1] = j; if (k > c.hi[2]) c.hi[2] = k;
      centre(c, i, j, k, from);
      for (let d = 0; d < 6; d++) {
        const ni = i + DI[d], nj = j + DJ[d], nk = k + DK[d]; if (ni < 1 || ni > NX - 2 || nj < 1 || nj > NY - 2 || nk < 1 || nk > NZ - 2) continue;
        const v = ni + NX * (nj + NY * nk); if (state[v] === 2) continue;
        const ex = (ni - ai) * CELL, ey = (nj - aj) * CELL * (nj > aj ? UP : DOWN), ez = (nk - ak) * CELL, cA = cost[a] + Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (cA >= cost[v] - .01) continue;
        const hit = cast(from, DIRS[d], CELL);
        if (hit) { const f = hit.distance / CELL, g = f > .56 ? 1 - .56 / f : 0; wall[v] = 1; if (g > gk[v]) gk[v] = g; if (cu < gc[v]) gc[v] = cu; continue; }
        let best = cu + STEP[d], via = u;
        if (a !== u) { centre(c, ai, aj, ak, v0); centre(c, ni, nj, nk, to); const len = dir.subVectors(to, v0).length(); if (!cast(v0, dir.divideScalar(len), len)) { best = cA; via = a; } }
        if (best < cost[v]) { cost[v] = best; anchor[v] = via; push(s, best, v); }
      }
    }
    if (!c.done && !s.hc.length) { c.done = true; c.frontMax = Math.min(c.doneCost + SOFT, c.maxCost); }   // a shut room smaller than the budget: filled to the walls
    stats.fillMs += performance.now() - t0;
    if (c.done && !c.rim) findRim(c);
  }
  // where zombies look for a hidden player: the open edge of the cloud at floor height
  function findRim(c) {
    const s = c.slot, out = []; c.rim = out;
    for (let k = 1; k < NZ - 1; k++) for (let j = Math.max(1, SY - 1); j <= SY + 1; j++) for (let i = 1; i < NX - 1; i++) {
      const u = i + NX * (j + NY * k); if (s.state[u] !== 2) continue; const e = c.frontMax - s.cost[u]; if (e < SOFT * .1 || e > SOFT * .5) continue;
      if (((i * 7 + k * 13 + j * 5) % 3) === 0) out.push(centre(c, i, j, k, new THREE.Vector3()));
    }
    for (const p of out) { const h = cast(p, DIRS[3], 90); if (h) p.y -= h.distance; else p.dead = true; }
    c.rim = out.filter(p => !p.dead);
  }
  function write(c) {
    const s = c.slot, { data, cost, state, wall, gk, gc } = s, f = c.front, inv = 255 / SOFT;
    for (let u = 0, o = 0; u < N; u++, o += 2) {
      if (state[u] === 2) { const e = (f - cost[u]) * inv; data[o] = e > 255 ? 255 : e < 0 ? 0 : e; data[o + 1] = 0; }
      else if (wall[u]) { const e = (f - gc[u]) * inv; data[o] = gk[u] * (e > 255 ? 255 : e < 0 ? 0 : e); data[o + 1] = 255; }
    }
    s.tex.needsUpdate = true;
    const lo = c.lo, hi = c.hi; s.u.boxLo.value.set(c.min.x + (lo[0] - 1) * CELL, c.min.y + (lo[1] - 1) * CELL, c.min.z + (lo[2] - 1) * CELL); s.u.boxHi.value.set(c.min.x + (hi[0] + 2) * CELL, c.min.y + (hi[1] + 2) * CELL, c.min.z + (hi[2] + 2) * CELL);
    s.box.position.copy(s.u.boxLo.value); s.box.scale.subVectors(s.u.boxHi.value, s.u.boxLo.value); s.box.updateMatrix(); s.box.updateMatrixWorld(true);
    if ((c.tick++ & 3) === 0 || c.front >= c.frontMax) writePuffs(c);
  }
  // Low graphics: blocks of 3x3x3 cells with enough smoke in them become one puff each
  function writePuffs(c) {
    const s = c.slot, at = s.puffs.geometry.getAttribute('iPos'), a = at.array, f = c.front; let n = 0;
    for (let k = c.lo[2]; k <= c.hi[2] && n < PUFFS; k += 3) for (let j = c.lo[1]; j <= c.hi[1] && n < PUFFS; j += 3) for (let i = c.lo[0]; i <= c.hi[0] && n < PUFFS; i += 3) {
      let sum = 0; for (let z = k; z < k + 3 && z < NZ; z++) for (let y = j; y < j + 3 && y < NY; y++) for (let x = i; x < i + 3 && x < NX; x++) { const u = x + NX * (y + NY * z); if (s.state[u] === 2) sum += Math.min(1, Math.max(0, (f - s.cost[u]) / SOFT)); }
      if (sum < 4) continue; const o = n++ * 4; a[o] = c.min.x + (i + 1.5) * CELL; a[o + 1] = c.min.y + (j + 1.5) * CELL; a[o + 2] = c.min.z + (k + 1.5) * CELL; a[o + 3] = 70 + 75 * Math.min(1, sum / 20);
    }
    at.needsUpdate = true; s.puffs.geometry.instanceCount = n;
  }

  const clouds = [];
  function spawn(at, r = 200, opts = {}) {
    let s = slots.find(s => !s.cloud); if (!s) { s = slots.reduce((a, b) => (a.used < b.used ? a : b)); release(s.cloud); }
    s.cost.fill(Infinity); s.gc.fill(Infinity); s.state.fill(0); s.wall.fill(0); s.gk.fill(0); s.data.fill(0); s.hc.length = s.hi.length = 0; s.used = ++stats.clouds;
    const c = { slot: s, at: at.clone(), r, min: new THREE.Vector3(at.x - (SX + .5) * CELL, at.y + 14 - (SY + .5) * CELL, at.z - (SZ + .5) * CELL), grow: opts.grow ?? 1.3, expect: r + SOFT * .5,
      budget: Math.round(2 / 3 * Math.PI * (r + SOFT * .5) ** 3 / UP / CELL ** 3), maxCost: Math.min(1.9 * r, (SX - 2) * CELL), popped: 0, doneCost: 0, front: 0, frontMax: Infinity, done: false, rim: null, fade: 1, tick: 0,
      lo: [SX, SY, SZ], hi: [SX, SY, SZ], growing: true, dead: false };
    const u0 = SX + NX * (SY + NY * SZ); s.cost[u0] = 0; s.anchor[u0] = u0; push(s, 0, u0); s.cloud = c;
    s.u.gridMin.value.copy(c.min); s.box.visible = true; s.puffs.geometry.instanceCount = 0; clouds.push(c);
    advance(c, config.ms); write(c); return c;
  }
  function release(c) { if (!c || c.dead) return; c.dead = true; const s = c.slot; s.cloud = null; s.box.visible = false; s.puffs.visible = false; s.hc.length = s.hi.length = 0; const i = clouds.indexOf(c); if (i >= 0) clouds.splice(i, 1); }
  const cellAt = (c, p, dy) => { const i = Math.floor((p.x - c.min.x) / CELL), j = Math.floor((p.y + dy - c.min.y) / CELL), k = Math.floor((p.z - c.min.z) / CELL); return i < 0 || i >= NX || j < 0 || j >= NY || k < 0 || k >= NZ ? -1 : i + NX * (j + NY * k); };
  const dense = (c, u) => u >= 0 && c.slot.state[u] === 2 && c.front - c.slot.cost[u] > SOFT * .45;
  // p = a point at someone's feet: in the smoke when the cell at the knees or the chest is
  const filled = (c, p) => !!c && !c.dead && (dense(c, cellAt(c, p, 40)) || dense(c, cellAt(c, p, 14)));
  const hole = (p, r = config.hole) => { if (!clouds.length) return; const h = holes.reduce((a, b) => (a.age > b.age ? a : b)); h.v.set(p.x, p.y, p.z, r); h.r = r; h.age = 0; };

  host.on('update', dt => {
    time += dt;
    for (const h of holes) if (h.r) { h.age += dt; const k = 1 - h.age / config.holeLife; if (k <= 0) { h.r = 0; h.v.w = 0; h.age = 9; } else h.v.w = h.r * Math.min(1, h.age * 8) * Math.sqrt(k); }
    if (!clouds.length) return;
    const g = K.vmLight?.gain ?? .6, lk = config.light ?? (.14 + Math.min(1.2, Math.max(.08, g)));   // as bright as the place it is in
    puffU.time.value = time; puffU.clearR.value = config.clear; puffU.puffA.value = config.puff[0]; puffU.puffSize.value = config.puff[1]; puffU.tint.value.setRGB(config.tint[0] * lk, config.tint[1] * lk, config.tint[2] * lk);
    for (const c of clouds) {
      const s = c.slot;
      if (c.growing) {
        if (!c.done) advance(c, config.ms);
        const limit = c.done ? c.frontMax : c.doneCost, speed = c.expect / c.grow * Math.max(.4, 1.7 - 1.3 * c.front / c.expect), f = Math.min(limit, c.front + speed * dt);
        if (f !== c.front || c.tick === 0) { c.front = f; write(c); }
        if (c.done && c.front >= c.frontMax) c.growing = false;
      }
      s.u.fade.value = s.puffs.material.uniforms.fade.value = c.fade; s.u.time.value = time; s.u.tint.value.copy(puffU.tint.value);
      s.puffs.visible = self.low;
    }
    stats.cells = clouds.reduce((n, c) => n + c.popped, 0);
  });
  // an explosion (the fx mod's test: an orange burst of 12 or more) blows a hole
  host.on('effect', e => { if (!clouds.length || !e?.position || !(e.count >= 12)) return; const h = typeof e.color === 'number' ? e.color : new THREE.Color(e.color).getHex(THREE.SRGBColorSpace);
    if (Math.abs((h >> 16 & 255) / 255 - 1) + Math.abs((h >> 8 & 255) / 255 - .7) + Math.abs((h & 255) / 255 - .3) < .25) hole(e.position); });
  host.on('reset', () => { for (const c of [...clouds]) release(c); for (const h of holes) { h.r = 0; h.v.w = 0; h.age = 9; } });

  // ---- the pass
  const quad = (fs, extra) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false, ...extra })); m.frustumCulled = false; return m; };
  const blend = quad(QUAD_FS, { transparent: true, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }), clear = new THREE.Color(), camPos = new THREE.Vector3();
  const drawClouds = (r, cam, depth, w, h) => {
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    cam.getWorldDirection(v0); camPos.setFromMatrixPosition(cam.matrixWorld);
    for (const s of slots) { if (!s.box.visible) continue; const u = s.u; u.tDepth.value = depth; u.res.value.set(w, h); u.near.value = cam.near; u.far.value = cam.far; u.camDir.value.copy(v0); u.clearR.value = config.clear; u.sigma.value = config.sigma;
      s.box.renderOrder = -camPos.distanceTo(s.cloud?.at ?? camPos); }
    const old = r.getRenderTarget(), cc = r.getClearColor(clear), ca = r.getClearAlpha(), ac = r.autoClear;
    r.setRenderTarget(target); r.setClearColor(0x000000, 0); r.autoClear = true; r.render(volScene, cam);
    r.setClearColor(cc, ca); r.autoClear = ac; r.setRenderTarget(old);
  };
  const blit = (r, to) => { const old = r.getRenderTarget(), ac = r.autoClear; r.autoClear = false; r.setRenderTarget(to); blend.material.uniforms.tDiffuse.value = target.texture; r.render(blend, quadCam); r.setRenderTarget(old); r.autoClear = ac; };
  let scenePass = null, sceneRT = null;
  const pass = new Pass(); pass.needsSwap = false; pass.seen = 0;
  pass.render = (r, writeBuffer, readBuffer) => {
    pass.seen = performance.now(); stats.drew = 0;
    if (!clouds.length || !sceneRT?.depthTexture || !scenePass?.camera?.isPerspectiveCamera) return;
    const k = config.scale[quality] ?? 1; drawClouds(r, scenePass.camera, sceneRT.depthTexture, Math.max(1, Math.round(readBuffer.width * k)), Math.max(1, Math.round(readBuffer.height * k)));
    blit(r, pass.renderToScreen ? null : readBuffer); stats.drew = clouds.length;
  };
  // the lighting mod calls this on every composer build: the scene pass tells which buffer holds the frame's depth
  const attach = (renderPass, q) => { quality = q; scenePass = renderPass; const f = renderPass.render.bind(renderPass); renderPass.render = (r, wb, rb, ...a) => { sceneRT = rb; return f(r, wb, rb, ...a); }; };
  // compile and first-draw both programs and upload the textures behind the loading screen
  const warm = () => { try {
    renderer.initTexture(noise); for (const s of slots) renderer.initTexture(s.tex);
    const a = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }); a.depthTexture = new THREE.DepthTexture(4, 4);
    const cam = new THREE.PerspectiveCamera(60, 1, 1, 2000); cam.position.set(0, 0, 300); cam.updateMatrixWorld(true);
    const s = slots[0], vis = s.box.visible; s.box.visible = true; if (!s.cloud) { s.u.boxLo.value.set(-50, -50, -50); s.u.boxHi.value.set(50, 50, 50); s.box.position.set(-50, -50, -50); s.box.scale.setScalar(100); s.box.updateMatrix(); s.box.updateMatrixWorld(true); }
    const old = renderer.getRenderTarget(); renderer.setRenderTarget(a); renderer.clear(); renderer.setRenderTarget(old);
    drawClouds(renderer, cam, a.depthTexture, 4, 4); s.box.visible = vis;
    const b = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }); blit(renderer, b); a.depthTexture.dispose(); a.dispose(); b.dispose();
  } catch (e) { console.warn('[smoke] warm', e); } };

  // low: no composer is drawing (Low graphics), so the puffs stand in; the lighting mod sets it on every build
  const self = K.smokeVol = { spawn, release, filled, hole, pass, attach, warm, clouds, config, stats, slots, low: true, CELL, SOFT };
  return self;
}

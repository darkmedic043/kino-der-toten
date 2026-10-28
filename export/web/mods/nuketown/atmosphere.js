// Nuketown's night (2026-10-27, after the UGX screenshots: a dark teal storm sky over a hazy test site, burning debris and
// window fires, lit streetlights, the nuke's smoke column on the horizon, grey-green ash in the air, a stuttering
// fluorescent lab, the odd flash of lightning). Called once from mod.js; nothing here may throw when a marker is missing.
//   - The look: the engine's four scene lights are retuned every frame (custom.js resets the ambient on every reset), the
//     map entry's fog/background give the haze, grade.js `nuketown` the grade.
//   - Sky: one far-plane dome (vertex xyww, follows the camera through mat3(modelViewMatrix)) with the gradient, drifting
//     fbm clouds, a moon glow, the nuke column (drawn in the dome shader toward the map's `nuke` struct, so the fog can't
//     swallow a far mesh) and the lightning flash (a uniform; the scene lights get a bump with it above LAB_Y only).
//   - Fires: the map's fx structs (entities.json notes fire1 / fire_long / fire2 / hell_fire / candle ...) through the
//     shared fire layers (mods/fx/flames.js: tongues, embers, smoke, glow; the emb1 emitters as floating embers).
//   - Ash: 2600 flakes wrapping through a box round the camera, gated by a roof map (the collision world drawn from above
//     over the playable part of the map, 1024 x 1024), so none falls indoors or in the lab.
//   - Lights: two fixed pools (6 warm fire lights, 4 cool lamp lights) re-picked to the nearest sources every 0.5 s;
//     the counts never change after setup (the pool size is baked into every shader).
//   - Materials: the map's light-pool decals (`dyn_lights`; there is no tube mesh) glow cold and the lab's stutter (a
//     y-band in onBeforeCompile so the outdoor decals in the same merged material stay steady); glow discs sit in the
//     lit windows and the truck's lights (godray1 structs) and on the lab's wall panels and ceiling fixtures (decal
//     clusters), faded by a line-of-sight ray; the hell lava glows and breathes. The streetlight heads have no marker
//     and no material of their own, so they stay dark (as most do in the UGX shots).
// Everything animates from scene.onBeforeRender (the menu shows the map too; `update` only runs in a match).
// Debug: window.kino.nukeAtmo = { state(), lightning(), set(k, v) } (kino.nuketown is the quest's).
import * as THREE from 'three';
import { createFlames, fireFlicker } from '../fx/flames.js';
import { settings } from '../../settings.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const NUKE = V3(501, -102, -9854);                                            // the gsc's nuke cloud origin (game space)
const PLAY = new THREE.Box3(V3(-2800, 800, -2000), V3(1400, 2700, 3600));      // the playable map for the roof map (world.bounds spans the far terrain)
const LAB_Y = 1600;                                                            // below: the lab and hell (the lab's tubes stutter, the streetlights don't)
const LOOK = {   // the UGX shots average sRGB (33, 48, 53): a teal-grey overcast, the houses lit flat by the sky
  ambient: { color: 0x5f7d86, on: 1.0, off: .85 }, hemi: { sky: 0x6a98a4, ground: 0x263230, intensity: 1.25 },
  key: { color: 0xa0c4cf, intensity: 1.1, dir: V3(-.3, 1, .45) }, fill: { color: 0x3a5660, intensity: .4 },
};
const FIRE = { range: 620, decay: 1.5, color: 0xff9c4e, intensity: 1500, pool: 6 };
const LAMP = { range: 760, decay: 1.4, color: 0xcfe0ea, labColor: 0x9fdcea, intensity: 1100, labIntensity: 1600, pool: 4 };
const GLOW = { lamp: { size: 150, color: [.8, .9, 1.0], gain: .75 }, lab: { size: 90, color: [.5, .9, 1.0], gain: 1.1 }, core: 2.6, halo: .55, through: 300, throughLab: 30, pull: 30, pullLab: 10 };   // additive discs in the lit windows and on the lab's fixtures; depth-tested; pull: drawn this much toward the camera to clear the fixture; through: the line-of-sight fade still shows a disc when the ray is blocked within this many units of it (window frames, glass)
// per fx note: flame sprite size, how hot (white core), sub-flames, smoke puffs, embers
// light shafts through the haze (the lighting mod's volumetric cones, kino.volumeBeam; Medium and up): from the god-ray
// markers (godray1: lit windows and rooms, aimed by the struct's angles) and down from the fixtures on walls and ceilings.
// r: end radius per unit of length; far: hidden beyond this distance from the camera
const BEAM = { window: { color: 0xc4dceb, strength: 1.6, r: .36, tip: 14, max: 340 }, lamp: { color: 0xd2e6f2, strength: 2, r: .5, tip: 16, max: 380 },
  lab: { color: 0x9fdcea, strength: 2.4, r: .5, tip: 16, max: 360 }, far: 2600 };
const KINDS = {   // kind: the mods/fx/flames.js kind (its glow and aspect)
  fire1: { kind: 'fire', size: 44, hot: 1, sub: 4, smoke: 6, embers: 8 }, fire_long: { kind: 'fire', size: 60, hot: 1, sub: 5, smoke: 7, embers: 10 }, fire2: { kind: 'fire', size: 50, hot: 1, sub: 4, smoke: 6, embers: 8 },
  hell_fire: { kind: 'fire', size: 72, hot: 1, sub: 6, smoke: 8, embers: 14 }, fire_pipe: { kind: 'torch', size: 24, hot: .9, sub: 2, smoke: 3, embers: 4 }, spawned_fire: { kind: 'fire', size: 54, hot: 1, sub: 4, smoke: 6, embers: 8 },
  lava_pop: { kind: 'fire', size: 26, hot: 1, sub: 2, smoke: 0, embers: 10 }, candle: { kind: 'candle', size: 7, hot: .6, sub: 1, smoke: 0, embers: 0 },
};
const ASH = { count: 2600, box: V3(560, 380, 560), fall: 26, wind: V3(14, 0, -6), color: new THREE.Color(.2, .25, .18) };
const SMOKE_WIND = V3(10, 0, -4);

export function setupAtmosphere(api) {
  const { scene, camera, world, renderer, host, session, map } = api;
  if (!scene || !camera || !renderer) return;
  const low = (settings.graphics ?? 2) < 1;
  const S = { time: 0, last: performance.now(), flash: 0, flashDir: new THREE.Vector2(0, -1), nextBolt: 6 + Math.random() * 8, strobes: 0, strobeT: 0, flick: 1, flickT: 1.5 + Math.random() * 3, drop: 0, pick: 0 };
  const px = () => renderer.getPixelRatio() * (renderer.getSize(new THREE.Vector2()).y / 900);
  const fogColor = () => scene.fog?.color ?? scene.background ?? new THREE.Color(0x314a50);

  // ---- scene lights (found late: the engine builds them before any mod)
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const [key, fill] = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  const keyColor = new THREE.Color(LOOK.key.color), boltColor = new THREE.Color(0xdbe9ff), tmpColor = new THREE.Color();

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,   // seen from inside: FrontSide culls the whole dome
    uniforms: { time: { value: 0 }, flash: { value: 0 }, flashDir: { value: S.flashDir }, horizon: { value: new THREE.Color(0x425a62) },
      zenith: { value: new THREE.Color(.028, .04, .046) }, cloudLo: { value: new THREE.Color(.04, .055, .06) }, cloudHi: { value: new THREE.Color(.12, .145, .15) },
      moonDir: { value: LOOK.key.dir.clone().normalize() }, nukeDir: { value: new THREE.Vector2(0, -1) }, nukeAng: { value: new THREE.Vector2(.14, .45) } },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0); gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }`,
    fragmentShader: `uniform float time, flash; uniform vec2 flashDir, nukeDir, nukeAng; uniform vec3 horizon, zenith, cloudLo, cloudHi, moonDir; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir); float el = d.y, h = clamp(el, 0.0, 1.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.45));
        float den = 0.0;
        if (el > 0.0) {                                                            // a cloud deck, projected from a plane overhead
          vec2 uv = d.xz / (el + 0.12) * 0.7 + time * vec2(0.011, 0.004);
          float n = fbm(uv * 1.3 + 0.4 * fbm(uv * 2.4 - time * 0.008));
          den = smoothstep(0.22, 0.72, n) * smoothstep(0.0, 0.14, el);
          col = mix(col, mix(cloudLo, cloudHi, smoothstep(0.25, 0.85, n)), den * 0.95);
        }
        float mu = max(dot(d, moonDir), 0.0);                                      // a faint moon behind the deck (where the key light comes from)
        col += vec3(0.5, 0.62, 0.72) * (pow(mu, 220.0) * 0.25 + pow(mu, 10.0) * 0.04) * (1.0 - den * 0.75);
        vec2 n2 = normalize(d.xz + vec2(1e-5, 0.0));
        float toward = pow(max(dot(n2, flashDir), 0.0), 3.0);                      // lightning: the deck lights up from one side
        col += flash * vec3(0.55, 0.65, 0.85) * (0.2 + 0.8 * toward) * (0.25 + den) * smoothstep(-0.06, 0.25, el);
        {                                                                          // the nuke's column, toward the test site
          float L = length(d.xz); vec2 n = d.xz / max(L, 1e-4);
          float f = dot(n, nukeDir), r = n.x * nukeDir.y - n.y * nukeDir.x, az = atan(r, f), elv = atan(d.y, L);
          if (f > 0.0 && abs(az) < 0.9 && elv > -0.08 && elv < 0.9) {
            float t = elv / nukeAng.y;
            float turb = fbm(vec2(az * 7.0, elv * 5.0 - time * 0.012)) - 0.5;
            float w = nukeAng.x * (1.0 - 0.35 * t + 0.2 * sin(t * 7.0 + turb * 4.0) + 0.25 * turb);
            float stem = (1.0 - smoothstep(w * 0.7, w, abs(az + 0.02 * turb))) * smoothstep(-0.08, -0.02, elv) * (1.0 - smoothstep(1.0, 1.35, t));
            vec2 cp = vec2(az, elv - nukeAng.y * 1.05) / vec2(nukeAng.x * 2.8, nukeAng.y * 0.5);
            float cap = 1.0 - smoothstep(0.6, 1.0, length(cp) + 0.3 * turb);
            float cloud = max(stem, cap);
            float lit = 0.5 + 0.5 * fbm(vec2(az * 10.0 + time * 0.01, elv * 8.0));
            vec3 smoke = mix(vec3(0.004, 0.005, 0.006), vec3(0.028, 0.032, 0.035), lit) + flash * vec3(0.12, 0.14, 0.18) * lit;
            smoke += vec3(0.5, 0.14, 0.02) * (1.0 - smoothstep(-0.04, 0.03, elv)) * stem * 0.6 * (0.7 + 0.3 * sin(time * 2.0 + turb * 6.0));
            col = mix(col, smoke, cloud * 0.96);
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), skyMat);
  sky.frustumCulled = false; sky.renderOrder = 999; sky.name = 'nuketown_sky'; sky.matrixAutoUpdate = false; scene.add(sky);

  // ---- roof map over the playable area (the ash stops under every roof, and the lab and hell are under the street)
  let roof = null; const roofSize = PLAY.getSize(new THREE.Vector3()), roofCenter = PLAY.getCenter(new THREE.Vector3());
  if (!low && world?.collision?.geometry) try {
    const RES = 1024;
    roof = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    roof.texture.wrapS = roof.texture.wrapT = THREE.ClampToEdgeWrapping;
    const cam = new THREE.OrthographicCamera(-roofSize.x / 2, roofSize.x / 2, roofSize.z / 2, -roofSize.z / 2, 1, roofSize.y + 400);
    cam.position.set(roofCenter.x, PLAY.max.y + 200, roofCenter.z); cam.up.set(0, 0, 1); cam.lookAt(roofCenter.x, PLAY.min.y, roofCenter.z); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }' });
    const mesh = new THREE.Mesh(world.collision.geometry, mat); mesh.frustumCulled = false;
    const tmp = new THREE.Scene(); tmp.add(mesh);
    const prevTarget = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha(), prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping; renderer.setRenderTarget(roof); renderer.setClearColor(new THREE.Color(PLAY.min.y - 2000, 0, 0), 1); renderer.clear(); renderer.render(tmp, cam);
    renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha); renderer.toneMapping = prevTone;
    mat.dispose();
  } catch (e) { console.warn('[nuketown] roof map', e); roof = null; }

  // ---- ash
  const N = low ? 800 : ASH.count, apos = new Float32Array(N * 3), aseed = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) { apos[i] = Math.random(); aseed[i] = Math.random(); }
  const ashGeo = new THREE.BufferGeometry(); ashGeo.setAttribute('position', new THREE.BufferAttribute(apos, 3)); ashGeo.setAttribute('seed', new THREE.BufferAttribute(aseed, 3));
  const ashMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, fog: false,
    uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: ASH.box }, fall: { value: ASH.fall }, wind: { value: ASH.wind }, px: { value: 1 },
      roof: { value: roof?.texture ?? null }, roofOn: { value: roof ? 1 : 0 }, roofMin: { value: new THREE.Vector2(PLAY.max.x, PLAY.min.z) }, roofSize: { value: new THREE.Vector2(-roofSize.x, roofSize.z) },   // the top-down camera (up = +z) mirrors x
      color: { value: ASH.color }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, flash: { value: 0 } },
    vertexShader: `attribute vec3 seed; uniform float time, fall, px, roofOn; uniform vec3 cam, box, wind; uniform sampler2D roof; uniform vec2 roofMin, roofSize;
      varying float vA, vFog;
      void main(){
        float sp = fall * (0.6 + 0.8 * seed.z), ph = seed.y * 6.2832;
        vec3 drift = vec3(wind.x * time + sin(time * 0.5 + ph) * 42.0, -sp * time, wind.z * time + cos(time * 0.37 + ph) * 42.0);
        vec3 w = cam + mod(position * box * 2.0 + drift - cam, box * 2.0) - box;   // wraps through a box round the camera, fixed in the world
        float open = 1.0;
        if (roofOn > 0.5) { vec2 uv = (w.xz - roofMin) / roofSize; float top = texture2D(roof, uv).r; open = step(top - 4.0, w.y);
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) open = 0.0; }
        vec4 mv = modelViewMatrix * vec4(w, 1.0); float d = max(30.0, -mv.z);
        vA = open * smoothstep(1500.0, 320.0, d) * smoothstep(15.0, 45.0, d) * (0.5 + 0.5 * seed.x);
        gl_PointSize = min(open * (0.8 + 1.3 * seed.x) * 400.0 * px / d, 8.0 * px);
        vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color, fogColor; uniform float fogDensity, flash; varying float vA, vFog;
      void main(){ vec2 p = gl_PointCoord - 0.5; float r = dot(p, p) * 4.0; if (r > 1.0) discard;
        float a = (1.0 - r) * vA * 0.8, f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog);
        vec3 col = mix(color * (1.0 + flash * 2.5), fogColor, f); gl_FragColor = vec4(col, a * (1.0 - f * 0.7));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ash = new THREE.Points(ashGeo, ashMat); ash.frustumCulled = false; ash.renderOrder = 900; ash.name = 'nuketown_ash'; scene.add(ash);

  // ---- fires: flames, smoke, embers (mods/fx/flames.js; the fires are added once entities.json arrives, the
  // materials compile on stub instances now)
  const fire = createFlames({ scene, renderer, low, name: 'nuketown_fire', fade: 5000 });
  const stub = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1e6, 0], 3)); return g; };
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { px: { value: 1 }, flick: { value: 1 }, cLamp: { value: new THREE.Vector3(...GLOW.lamp.color).multiplyScalar(GLOW.lamp.gain) }, cLab: { value: new THREE.Vector3(...GLOW.lab.color).multiplyScalar(GLOW.lab.gain) } },
    vertexShader: `#define PULL_LAMP ${GLOW.pull.toFixed(1)}
      #define PULL_LAB ${GLOW.pullLab.toFixed(1)}
      attribute float size, kind, occ; uniform float px; varying float vKind, vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(20.0, -mv.z);
        vKind = kind; vA = (1.0 - smoothstep(900.0, 4000.0, d) * 0.8) * occ;
        gl_PointSize = min(size * 640.0 * px / d, 360.0 * px);
        // depth-tested, but drawn a little toward the camera so the disc clears the fixture it sits on
        float L = length(mv.xyz); mv.xyz *= max(L - min(mix(PULL_LAMP, PULL_LAB, kind), L * 0.5), 1.0) / L;
        gl_Position = projectionMatrix * mv; }`,
    // a bulb, not a disc: a small hot core (over the bloom threshold, so the post chain flares it) in a halo that falls
    // off like light scattered in fog (1 / (1 + r^2)) and fades out before the sprite's edge, so no rim shows
    fragmentShader: `uniform float flick; uniform vec3 cLamp, cLab; varying float vKind, vA;
      void main(){ vec2 p = (gl_PointCoord - 0.5) * 2.0; float r = length(p); if (r > 1.0) discard;
        float core = exp(-r * r * 90.0) * ${GLOW.core.toFixed(2)}, halo = ${GLOW.halo.toFixed(2)} / (1.0 + r * r * 60.0) * (1.0 - smoothstep(0.45, 1.0, r));
        vec3 col = mix(cLamp, cLab * flick, vKind) * (core + halo) * vA;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const glow = new THREE.Points(stub(), glowMat); glow.geometry.setAttribute('size', new THREE.Float32BufferAttribute([1], 1)); glow.geometry.setAttribute('kind', new THREE.Float32BufferAttribute([0], 1)); glow.geometry.setAttribute('occ', new THREE.Float32BufferAttribute([0], 1));
  for (const [o, n, order] of [[glow, 'nuketown_glow', 903]]) { o.frustumCulled = false; o.renderOrder = order; o.name = n; scene.add(o); }

  // ---- light pools (fixed counts)
  const firePool = Array.from({ length: low ? 2 : FIRE.pool }, () => { const l = new THREE.PointLight(FIRE.color, 0, FIRE.range, FIRE.decay); l.position.set(0, -1e5, 0); l.userData.ph = Math.random() * 100; scene.add(l); return l; });
  const lampPool = Array.from({ length: low ? 2 : LAMP.pool }, () => { const l = new THREE.PointLight(LAMP.color, 0, LAMP.range, LAMP.decay); l.position.set(0, -1e5, 0); scene.add(l); return l; });
  const fires = [], lamps = [], glows = [], shaftSrc = [], shafts = [];   // {p, lab}; glows: {p, kind, n?, vis, occ}
  // `dyn_lights` is the map's light-pool decal material (textured quads under every fixture, on floors, walls and
  // ceilings; there is no tube mesh, and the streetlight heads have no marker at all). Every cluster of its quads is a
  // lamp source; the wall- and ceiling-facing ones (the lab's panels and ceiling fixtures, a few porch lights) also
  // get a glow disc just off the surface. Floor pools only glow through the decal's own emissive.
  const dyn = [], lava = [];
  world?.root?.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) { if (!m?.name) continue; if (/dyn_lights/.test(m.name)) dyn.push({ mesh: o, mat: m }); else if (/\/lava$/.test(m.name)) lava.push(m); } });
  for (const { mesh } of dyn) {
    const g = mesh.geometry, p = g.attributes.position, idx = g.index, tri = idx ? idx.count / 3 : p.count / 3, seen = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
      nrm.subVectors(b, a).cross(c.clone().sub(a)).applyMatrix3(nm).normalize(); mesh.localToWorld(a.add(b).add(c).multiplyScalar(1 / 3));
      const q = seen.find(q => q.p.distanceTo(a) < 140); if (q) { q.n.add(nrm); q.k++; } else seen.push({ p: a.clone(), n: nrm.clone(), k: 1 });
    }
    for (const q of seen) { const lab = q.p.y < LAB_Y, n = q.n.divideScalar(q.k); if (n.lengthSq() > .01) n.normalize(); else n.set(0, 1, 0);
      lamps.push({ p: q.p.clone().setY(q.p.y - 16), lab }); if (n.y >= .4) continue;
      glows.push({ p: q.p.clone().addScaledVector(n, 6), kind: lab ? 1 : 0, n, vis: 1, occ: 1 });
      // ceiling fixtures shine straight down, wall ones out and down
      shaftSrc.push({ top: q.p.clone().addScaledVector(n, n.y < -.6 ? 4 : 10), dir: n.y < -.6 ? V3(0, -1, 0) : V3(n.x * .6, -1, n.z * .6), kind: lab ? 'lab' : 'lamp' }); }
  }
  // the pools glow cold and the lab's stutter (a world-y band: the outdoor decals share the merged material)
  const flickU = { value: 1 };
  for (const { mat } of dyn) {
    if (mat.userData.nkPatched) continue; mat.userData.nkPatched = true;
    mat.emissive.setHex(0xc9e6ff); mat.emissiveIntensity = 2.6;   // at 1 the decals' alpha-tested texture swallows it
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => { prev?.call(mat, sh, r); sh.uniforms.nkFlick = flickU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', 'varying float vNkY;\n#include <common>').replace('#include <begin_vertex>', '#include <begin_vertex>\nvNkY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying float vNkY; uniform float nkFlick;\n#include <common>').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(1.0, nkFlick, step(vNkY, ' + LAB_Y.toFixed(1) + '));'); };
    mat.customProgramCacheKey = () => 'nuketown-dyn-lights'; mat.needsUpdate = true;   // at load, before the warm pass compiles it
  }
  for (const m of lava) { m.emissive.setHex(0xff3c08); m.emissiveIntensity = 1.3; }

  // ---- light shafts (once the fx structs are in): each runs to the first surface along its aim, up to BEAM.max
  function buildShafts() {
    const make = window.kino?.volumeBeam; if (!make || low || !world?.raycast) return;
    const r = new THREE.Ray(), up = V3(0, 1, 0), seen = [];
    for (const s of shaftSrc) {
      const B = BEAM[s.kind], dir = s.dir.normalize(); let top = s.top;
      if (s.ceiling) { const h = world.raycast(r.set(top, up), 0, 160); if (!h) continue; top = top.clone().setY(top.y + h.distance - 4); }   // lab lights hang under a fixture
      if (seen.some(q => q.distanceTo(top) < 40)) continue; seen.push(top);
      const hit = world.raycast(r.set(top.clone().addScaledVector(dir, 6), dir), 0, B.max), len = hit ? hit.distance + 6 : B.max;
      if (len < 60) continue;
      const mesh = make(top, dir, len, Math.max(B.tip * 1.5, len * B.r), new THREE.Color(B.color), { tip: B.tip, warmth: .1 });
      mesh.name = 'nuketown_shaft'; mesh.visible = false; mesh.material.uniforms.strength.value = 0;
      shafts.push({ mesh, B, lab: s.kind === 'lab', mid: top.clone().addScaledVector(dir, len / 2), len });
    }
  }

  // ---- the map's fx structs
  const dir = (map?.dir ?? '').replace(/\/?$/, '/');
  const bolts = [];   // lightning1 structs: where the flashes come from
  fetch(dir + 'entities.json').then(r => r.json()).then(rows => {
    const floating = [];   // emb1 emitters: embers hanging in the air (no fire under them)
    const addFire = (o, k) => {
      const K = KINDS[k]; if (!K) return;
      const base = V3(o[0], o[1] + (k === 'candle' ? 0 : 6), o[2]);
      fire.add(base, K.kind, { size: K.size, hot: K.hot, sub: K.sub, smoke: K.smoke, embers: K.embers });
      if (K.smoke) fires.push({ p: V3(base.x, base.y + 30, base.z) });
    };
    for (const r of rows) {
      const o = r.origin; if (!Array.isArray(o)) continue;
      if (r.class === 'script_struct' && r.name === 'fx') {
        if (KINDS[r.note]) addFire(o, r.note);
        else if (r.note === 'emb1') floating.push(V3(o[0], o[1] - 60, o[2]));   // embers hanging in the air
        else if (r.note === 'godray1') {   // lit windows and rooms: a light and a shaft along the fx's aim (no disc: the marker floats mid-room)
          const lab = o[1] < LAB_Y, [p, y] = (r.angles ?? [60, r.yaw ?? 0]).map(a => a * Math.PI / 180);
          lamps.push({ p: V3(o[0], o[1] - 22, o[2]), lab }); shaftSrc.push({ top: V3(o[0], o[1], o[2]), dir: V3(Math.cos(p) * Math.cos(y), -Math.sin(p), -Math.cos(p) * Math.sin(y)), kind: lab ? 'lab' : 'window' }); }
        else if (r.note === 'lightning1') bolts.push(new THREE.Vector2(o[0], o[2]));
      } else if (r.name === 'spawned_fire') addFire(o, 'spawned_fire');
      else if (r.light && o[1] < LAB_Y) { lamps.push({ p: V3(o[0], o[1], o[2]), lab: true }); shaftSrc.push({ top: V3(o[0], o[1], o[2]), dir: V3(0, -1, 0), kind: 'lab', ceiling: true }); }
    }
    const gp = [], gs = [], gk = [], go = [];
    for (const g of glows) { gp.push(g.p.x, g.p.y, g.p.z); gs.push(g.kind ? GLOW.lab.size : GLOW.lamp.size); gk.push(g.kind); go.push(1); }
    const set = (pts, attrs) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(attrs.position, 3)); for (const [k, [a, n]] of Object.entries(attrs)) if (k !== 'position') g.setAttribute(k, new THREE.Float32BufferAttribute(a, n)); g.computeBoundingSphere(); const old = pts.geometry; pts.geometry = g; old.dispose(); };
    for (const p of floating) fire.add(p, 'fire', { size: 160, sub: 0, smoke: 0, glow: 0, embers: low ? 8 : 24, float: true });
    fire.build();
    if (gp.length) set(glow, { position: gp, size: [gs, 1], kind: [gk, 1], occ: [go, 1] });
    buildShafts();
    S.counts = { ...fire.state(), glows: glows.length, fires: fires.length, lamps: lamps.length, shafts: shafts.length };
  }).catch(e => console.warn('[nuketown] atmosphere entities', e));

  // ---- per frame
  const nukeV = new THREE.Vector2(), eye = new THREE.Vector3(), ray = new THREE.Ray(), gdir = new THREE.Vector3(), _v = new THREE.Vector3();
  // line of sight to each glow: hidden behind a building or the lab's ceiling, kept when only glass or a frame is in the way
  const seeGlows = () => { if (!world?.raycast) return; for (const g of glows) { gdir.subVectors(g.p, eye); const d = gdir.length(); gdir.divideScalar(d || 1);
    const behind = g.n && gdir.dot(g.n) > 0; const hit = behind || d < 40 ? null : world.raycast(ray.set(eye, gdir), 0, d);
    g.vis = behind ? 0 : (!hit || d - hit.distance < (g.kind ? GLOW.throughLab : GLOW.through)) ? 1 : 0; } };
  const pick = (pool, list, lift) => {
    if (!pool.length || !list.length) return;
    const near = list.map(s => ({ s, d: s.p.distanceToSquared(eye) })).sort((a, b) => a.d - b.d).slice(0, pool.length);
    const free = pool.filter(l => !near.some(n => n.s === l.userData.src));
    for (const n of near) if (!pool.some(l => l.userData.src === n.s)) { const l = free.shift(); if (l) { l.userData.src = n.s; l.position.copy(n.s.p); l.position.y += lift; l.intensity = 0; } }
  };
  function tick() {
    const now = performance.now(), dt = Math.min(.1, (now - S.last) / 1000); if (dt < .002) return; S.last = now; S.time += dt;
    camera.getWorldPosition(eye);
    const pxv = px(), fogC = fogColor(), fogD = scene.fog?.density ?? 0;
    // lightning: a few strobes every 9-25 s from one of the map's lightning1 directions
    if ((S.nextBolt -= dt) <= 0) { S.nextBolt = 9 + Math.random() * 16; S.strobes = 2 + Math.floor(Math.random() * 2); S.strobeT = 0;
      const b = bolts.length ? bolts[Math.floor(Math.random() * bolts.length)] : new THREE.Vector2(eye.x + 1000, eye.z - 1200); S.flashDir.set(b.x - eye.x, b.y - eye.z).normalize(); }
    if (S.strobes > 0 && (S.strobeT -= dt) <= 0) { S.strobes--; S.strobeT = .07 + Math.random() * .16; S.flash = .7 + Math.random() * .5; }
    S.flash *= Math.exp(-dt * 10);
    const flash = S.flash, lit = flash * Math.min(1, Math.max(0, (eye.y - LAB_Y + 150) / 150));   // lit: the scene lights' share, none down in the lab
    // the fluorescent lab: a hum plus dropouts
    if ((S.flickT -= dt) <= 0) { if (S.drop > 0) { S.drop = 0; S.flickT = 1.2 + Math.random() * 4; } else { S.drop = 1; S.flickT = .08 + Math.random() * .35; } }
    S.flick = S.drop ? .12 + .45 * (Math.sin(S.time * 75) > 0 ? 1 : 0) : .9 + .1 * Math.sin(S.time * 120);
    flickU.value = S.flick;
    for (const m of lava) m.emissiveIntensity = 1.2 + .3 * Math.sin(S.time * 1.3) * Math.sin(S.time * .37 + 1);
    // scene lights
    const power = !!session?.power;
    if (ambient) { ambient.color.setHex(LOOK.ambient.color); ambient.intensity = (power ? LOOK.ambient.on : LOOK.ambient.off) + lit * 1.4; }
    if (hemi) { hemi.color.setHex(LOOK.hemi.sky); hemi.groundColor.setHex(LOOK.hemi.ground); hemi.intensity = LOOK.hemi.intensity + lit * 1.2; }
    if (key) { key.color.copy(keyColor).lerp(boltColor, Math.min(1, lit)); key.intensity = LOOK.key.intensity + lit * 1.8; key.position.copy(LOOK.key.dir); }
    if (fill) { fill.color.setHex(LOOK.fill.color); fill.intensity = LOOK.fill.intensity; }
    // sky
    const u = skyMat.uniforms; u.time.value = S.time; u.flash.value = flash; u.horizon.value.copy(fogC);
    nukeV.set(NUKE.x - eye.x, NUKE.z - eye.z); const nd = Math.max(2000, nukeV.length()); u.nukeDir.value.copy(nukeV).divideScalar(nd); u.nukeAng.value.set(Math.atan2(1500, nd), Math.atan2(5200, nd));   // the UGX column: about 15 degrees wide, up into the deck
    // particles
    ashMat.uniforms.time.value = S.time; ashMat.uniforms.cam.value.copy(eye); ashMat.uniforms.px.value = pxv; ashMat.uniforms.fogColor.value.copy(fogC); ashMat.uniforms.fogDensity.value = fogD; ashMat.uniforms.flash.value = flash;
    fire.update(dt, { fog: scene.fog, flash });
    glowMat.uniforms.px.value = pxv; glowMat.uniforms.flick.value = S.flick;
    for (const b of shafts) { const u = b.mesh.material.uniforms, near = b.mid.distanceTo(eye) < BEAM.far + b.len / 2; b.mesh.visible = near; if (!near) continue;
      // inside a cone the view ray runs down its whole length and the beam blows out to white (a window shaft down the
      // green house's stairwell): fade it out as the eye nears the axis, to 15% on it
      const d = _v.subVectors(eye, u.apex.value), t = d.dot(u.axis.value), r = u.rTop.value + (u.rBot.value - u.rTop.value) * Math.min(1, Math.max(0, t / u.len.value));
      const inside = t > -40 && t < u.len.value + 40 ? 1 - Math.min(1, Math.max(0, (d.addScaledVector(u.axis.value, -t).length() - r * .5) / (r + 40))) : 0;
      u.time.value = S.time; u.strength.value = b.B.strength * (b.lab ? S.flick : 1) * (1 + flash * .6) * (1 - .85 * inside * inside * (3 - 2 * inside)); }
    // light pools
    if ((S.pick -= dt) <= 0) { S.pick = .5; pick(firePool, fires, 0); pick(lampPool, lamps, 0); for (const l of lampPool) l.color.setHex(l.userData.src?.lab ? LAMP.labColor : LAMP.color); seeGlows(); }
    const occA = glow.geometry.attributes.occ;
    if (occA && occA.count === glows.length) { let changed = false; for (let i = 0; i < glows.length; i++) { const g = glows[i]; if (Math.abs(g.vis - g.occ) < .003) continue; g.occ += (g.vis - g.occ) * Math.min(1, dt * 8); occA.setX(i, g.occ); changed = true; } if (changed) occA.needsUpdate = true; }
    for (const l of firePool) { const t = S.time * 1.0 + l.userData.ph, want = l.userData.src ? FIRE.intensity * fireFlicker(t) * 1.05 : 0; l.intensity += (want - l.intensity) * Math.min(1, dt * 6); }
    for (const l of lampPool) { const src = l.userData.src, want = src ? (src.lab ? LAMP.labIntensity * S.flick : LAMP.intensity) : 0; l.intensity += (want - l.intensity) * Math.min(1, dt * (src?.lab ? 30 : 3)); }
  }
  const prevBefore = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) { prevBefore?.apply(this, a); tick(); };
  host.on('update', tick);
  host.on('reset', () => { S.flash = 0; S.strobes = 0; S.nextBolt = 6 + Math.random() * 8; });

  if (window.kino) window.kino.nukeAtmo = {
    state: () => ({ ...S.counts, pools: [firePool.length, lampPool.length], roof: !!roof, flash: S.flash, flick: S.flick, dyn: dyn.length, lava: lava.length, bolts: bolts.length }),
    lightning: () => { S.nextBolt = 0; }, set: (k, v) => { if (k in skyMat.uniforms) { const t = skyMat.uniforms[k].value; if (t?.set && Array.isArray(v)) t.set(...v); else skyMat.uniforms[k].value = v; } else if (k in LOOK) Object.assign(LOOK[k], v); },
    LOOK, FIRE, LAMP, ASH, GLOW, BEAM, mats: { skyMat, ashMat, glowMat }, fire, pools: { firePool, lampPool }, sources: { fires, lamps, glows, shafts },
  };
}

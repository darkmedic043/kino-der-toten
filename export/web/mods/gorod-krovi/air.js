// Gorod Krovi's air (2026-11-18, user: "make the game more beautiful"): the town burns. BO3's Stalingrad places 422
// fire, smoulder and smoke effects that are always on (fire lines along the rubble, burning window frames, infernos in
// the gutted buildings, smoke columns, the far "vista" fires behind the skyline); the port had none of them, only their
// light in the baked volume. They are read from the map's own entity list (.tools/gorod-fx.py -> fx.json, map data)
// and drawn by the shared fire layers (mods/fx/flames.js: flames, embers, smoke, glow = 4 draws for all of them).
// Ash and embers: one Points mesh that wraps through a box around the camera, as Der Eisendrache's snow does: grey ash
// sinking on the wind and a share of glowing embers rising, only under open sky (a roof map: the collision world drawn
// once from above over the town). One draw. The dragon's fire hazards stay with scenes.js. `?noAir` turns it all off.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { createFlames } from '../fx/flames.js';

const DATA = new URL('../maps/gorod-krovi/fx.json', import.meta.url).href;
// effect name -> fires: n fires spread over a half-length `len` (a "line" effect), the rest are flames.js options.
// The first match wins. Smoke, glow and shimmer go on a cluster's first fire only (overdraw).
const RULES = [
  [/mech_identifier/, null],
  [/fire_line_lg_vista/, { n: 3, len: 240, size: 210, sub: 3, embers: 0, smoke: 2, glow: 2.2, aspect: 1.5, heat: false }],
  [/fire_car_vista/, { size: 120, sub: 4, embers: 0, smoke: 2, glow: 1.9, heat: false }],
  [/fire_oil_water_md_vista/, { n: 2, len: 90, size: 130, sub: 3, embers: 0, smoke: 2, glow: 2, heat: false }],
  [/fire_line_embers/, { float: true, size: 100, sub: 0, embers: 16, smoke: 0, glow: 0 }],
  [/fire_line_xsm/, { n: 3, len: 26, size: 23, sub: 2, embers: 2, smoke: 0, glow: 3, heat: false }],
  [/fire_line_sm/, { n: 3, len: 46, size: 38, sub: 3, embers: 4, smoke: 1, glow: 3, heat: false }],
  [/fire_line_md/, { n: 4, len: 76, size: 60, sub: 3, embers: 6, smoke: 2, glow: 3 }],
  [/fire_ground_line/, { n: 3, len: 44, size: 16, sub: 2, embers: 1, smoke: 0, glow: 3, aspect: 1.1, heat: false }],
  [/fire_ground_fuel/, { n: 3, len: 70, size: 44, sub: 3, embers: 6, smoke: 2, glow: 3 }],
  [/fire_inferno.*_lg/, { size: 175, sub: 6, embers: 22, smoke: 6, glow: 1.9, aspect: 2 }],
  [/fire_inferno.*_md/, { size: 130, sub: 6, embers: 18, smoke: 5, glow: 1.9, aspect: 2 }],
  [/fire_inferno/, { size: 88, sub: 5, embers: 12, smoke: 4, glow: 2, aspect: 1.9 }],
  [/fire_hot/, { size: 30, sub: 3, embers: 5, smoke: 0, glow: 2.4 }],
  [/fire_no_smky/, { size: 50, sub: 4, embers: 8, smoke: 0, glow: 2.1 }],
  [/fire_smky/, { size: 50, sub: 4, embers: 8, smoke: 8, glow: 2.1 }],
  [/fire_(spot|single)/, { size: 60, sub: 5, embers: 10, smoke: 3, glow: 2.1 }],
  [/embers_ceiling/, { float: true, size: 120, sub: 0, embers: 18, smoke: 0, glow: 0 }],
  [/embers_smk_smolder/, { float: true, size: 60, sub: 0, embers: 9, smoke: 3, glow: 0 }],
  [/embers_smolder/, { float: true, size: 60, sub: 0, embers: 10, smoke: 0, glow: 0 }],
  [/smk_column.*_lg/, { size: 150, sub: 0, embers: 0, smoke: 9, glow: 0 }],
  [/smk_column/, { size: 80, sub: 0, embers: 0, smoke: 6, glow: 0 }],
  [/smk_smolder_lg/, { size: 60, sub: 0, embers: 0, smoke: 5, glow: 0 }],
  [/smk_smolder/, { size: 40, sub: 0, embers: 0, smoke: 3, glow: 0 }],
  [/fire_/, { size: 46, sub: 4, embers: 8, smoke: 2, glow: 2.1 }],
];
const ASH = { count: 3400, box: new THREE.Vector3(540, 340, 540), fall: 34, rise: 22, wind: new THREE.Vector3(30, 0, -13), embers: .2 };

export default async function setup(api, gk) {
  const { scene, camera, world, renderer } = api, host = api.host;
  if (/[?&]noAir/.test(location.search) || !scene || !renderer) return;
  const data = await fetch(DATA).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!data?.fx?.length) return;   // map data not built here (python3 -I .tools/gorod-fx.py)
  const low = (settings.graphics ?? 2) < 1, out = { fire: null, ash: null, roof: null };

  // ---- the fires
  const fire = createFlames({ scene, renderer, low, name: 'gorod_fire', fade: 7000 });   // a town seen down long streets: full to 2,100 units, gone by 7,000
  const rules = data.types.map(t => (RULES.find(([re]) => re.test(t)) ?? [])[1] ?? null);
  const p = new THREE.Vector3(), col = world?.collision, ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  // the ground under a point, if it lies within `tol` of height y (a line's fires must stay on the surface the effect stands on: many run along trench lips and rubble edges)
  const ground = (x, y, z, tol) => { if (!col?.raycastFirst) return y; ray.origin.set(x, y + tol, z); const h = col.raycastFirst(ray, 0, tol * 2); return h ? y + tol - h.distance : null; };
  let placed = 0;
  for (const [ti, x, y, z, yaw = 0] of data.fx) {
    const R = rules[ti]; if (!R) continue;
    const { n = 1, len = 0, ...opts } = R, a = yaw * Math.PI / 180, ax = -Math.sin(a), az = -Math.cos(a);   // the effect's side axis in map axes (BO3 x, y, z -> x, z, -y)
    const g0 = opts.sub ? ground(x, y, z, 36) : null, y0 = g0 !== null && g0 > y ? g0 - opts.size * .08 : y;   // an origin sunk in the rubble: the flames start at its surface
    for (let i = 0; i < n; i++) {
      let t = n > 1 ? ((i + Math.random() * .6 - .3) / (n - 1) - .5) * 2 * len : 0, s = (Math.random() - .5) * len * .5, gy = y0;
      for (let k = 0; k < 4 && i > 0; k++) {   // off the ledge: pull it in towards the effect's origin
        const g = ground(x + ax * t + az * s, y0, z + az * t - ax * s, 26);
        if (g !== null) { gy = g; break; }
        t *= .5; s *= .5; if (k === 3) { t = (Math.random() - .5) * opts.size * .5; s = (Math.random() - .5) * opts.size * .5; }
      }
      p.set(x + ax * t + az * s, gy, z + az * t - ax * s);
      const k = n > 1 ? .8 + Math.random() * .4 : 1;
      fire.add(p, 'fire', i ? { ...opts, size: opts.size * k, smoke: 0, glow: 0, heat: false } : { ...opts, glow: opts.glow * (n > 1 ? 1 + len / opts.size * .5 : 1) });
    }
    placed++;
  }
  fire.build(); out.fire = fire;

  // ---- the roof map: the highest collision surface over the town (rect from fx.json), seen from above
  let ash = null, mat = null;
  const geo0 = world?.collision?.geometry, b = world?.bounds, rect = data.rect;
  if (geo0 && b && rect) {
    const sx = rect[2] - rect[0], sz = rect[3] - rect[1], cx = (rect[0] + rect[2]) / 2, cz = (rect[1] + rect[3]) / 2, RES = 1024;
    const roof = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    roof.texture.wrapS = roof.texture.wrapT = THREE.ClampToEdgeWrapping;
    {
      const cam = new THREE.OrthographicCamera(-sx / 2, sx / 2, sz / 2, -sz / 2, 1, b.max.y - b.min.y + 400);
      cam.position.set(cx, b.max.y + 200, cz); cam.up.set(0, 0, 1); cam.lookAt(cx, b.min.y, cz); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      const m = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }' });
      const mesh = new THREE.Mesh(geo0, m); mesh.frustumCulled = false;
      const tmp = new THREE.Scene(); tmp.add(mesh);
      const prevTarget = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha(), prevTone = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping; renderer.setRenderTarget(roof); renderer.setClearColor(new THREE.Color(b.min.y - 2000, 0, 0), 1); renderer.clear(); renderer.render(tmp, cam);
      renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha); renderer.toneMapping = prevTone;
      m.dispose();
    }
    out.roof = roof;
    // ---- ash and embers
    const N = low ? 900 : ASH.count, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) { pos[i] = Math.random(); seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    // premultiplied blend (ONE, ONE_MINUS_SRC_ALPHA): the ash covers what is behind it, the embers only add light
    mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: ASH.box }, roof: { value: roof.texture }, roofMin: { value: new THREE.Vector2(rect[2], rect[1]) }, roofSize: { value: new THREE.Vector2(-sx, sz) },   // the top-down camera (up = +z) mirrors x
        wind: { value: ASH.wind }, fall: { value: ASH.fall }, rise: { value: ASH.rise }, share: { value: ASH.embers }, px: { value: 1 }, amount: { value: 1 }, glow: { value: 3 },
        ashColor: { value: new THREE.Color(.36, .34, .32) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: /* glsl */`attribute vec3 seed; uniform float time, fall, rise, share, px, amount; uniform vec3 cam, box, wind; uniform sampler2D roof; uniform vec2 roofMin, roofSize;
        varying float vA, vE, vFogDepth, vTw;
        void main(){
          float e = step(seed.y, share), ph = seed.x * 6.2832;                      // e: a glowing ember (rises), else an ash flake (sinks)
          float vy = mix(-fall * (0.7 + 0.6 * seed.z), rise * (0.5 + seed.z), e), sway = mix(16.0, 34.0, e);
          vec3 drift = vec3(wind.x * time * (1.0 + 0.5 * e) + sin(time * 0.6 + ph) * sway, vy * time, wind.z * time * (1.0 + 0.5 * e) + cos(time * 0.5 + ph * 1.7) * sway);
          vec3 w = cam + mod(position * box * 2.0 + drift - cam, box * 2.0) - box;    // wraps through a box round the camera, fixed in the world
          vec2 uv = (w.xz - roofMin) / roofSize; float top = texture2D(roof, uv).r;
          float open = step(top - 6.0, w.y) * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);   // only above the highest surface here, and only over the town
          vec4 mv = modelViewMatrix * vec4(w, 1.0); float d = max(30.0, -mv.z);
          vec3 l = abs(w - cam) / box; float edge = (1.0 - smoothstep(0.8, 1.0, l.x)) * (1.0 - smoothstep(0.8, 1.0, l.y)) * (1.0 - smoothstep(0.8, 1.0, l.z));   // no pop where a flake wraps
          vTw = 0.55 + 0.45 * sin(time * (5.0 + 9.0 * seed.z) + ph * 3.0);
          vA = open * amount * smoothstep(1300.0, 260.0, d) * smoothstep(20.0, 60.0, d) * (0.5 + 0.5 * seed.x) * edge;
          vE = e; gl_PointSize = open * mix(0.8 + 1.5 * seed.x, 0.7 + 0.9 * seed.z, e) * 470.0 * px / d; gl_PointSize = clamp(gl_PointSize, 0.0, mix(11.0, 6.0, e) * px);
          vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 fogColor, ashColor; uniform float fogDensity, glow; varying float vA, vE, vFogDepth, vTw;
        void main(){ vec2 p = gl_PointCoord - 0.5; float r = dot(p, p) * 4.0; if (r > 1.0) discard;
          float s = (1.0 - r) * (1.0 - r), f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          float a = s * vA * 0.8 * (1.0 - f * 0.6) * (1.0 - vE);
          vec3 ember = vec3(1.0, 0.42, 0.08) * glow * s * vA * vTw * (1.0 - f * 0.5) * vE;
          gl_FragColor = vec4(mix(ashColor, fogColor, f) * a + ember, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    ash = new THREE.Points(geo, mat); ash.frustumCulled = false; ash.renderOrder = 903; ash.name = 'gorod_ash'; scene.add(ash);
    out.ash = ash;
  }

  // ---- per frame
  const size = new THREE.Vector2();
  let last = performance.now();
  host?.on?.('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    fire.update(dt, { fog: scene.fog });
    if (!mat) return;
    const u = mat.uniforms;
    u.time.value += dt; u.cam.value.copy(camera.position); u.px.value = renderer.getPixelRatio() * (renderer.getSize(size).y / 900);
    if (scene.fog) { u.fogColor.value.copy(scene.fog.color); u.fogDensity.value = scene.fog.density ?? 0; }
  });
  out.state = () => ({ ...fire.state(), effects: placed, ash: ash ? ash.geometry.attributes.position.count : 0 });
  out.config = ASH;
  (window.kino.gorod ??= {}).air = out; gk.air = out;
}

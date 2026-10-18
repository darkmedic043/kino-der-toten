// Der Eisendrache's weather and fire (2026-10-17, user: "make it look a lot nicer with nice effects ... similar to
// BO3"): snow falling outdoors and flames on every lit candle, wall torch, fire pit, hurricane lamp and chandelier.
//
// Snow: one Points mesh of flakes that wrap through a box around the camera (fixed in the world, so they fall past you
// rather than ride along). Where it falls is read from a roof map: the collision world rendered once from above into
// a height texture (512 x 512 over the map's bounds); a flake is drawn only above the highest surface at its spot, so
// it stops under roofs, arches and the gondola station but fills the courtyards and the rooftop. Two draws a frame.
// Flames: CASTLE_FLAME_<k> nodes (build_bo3_map.py: the flame tips of every fire fixture, extras {kind, size}) drawn
// as one additive Points mesh with a procedural, flickering flame sprite (bloom picks up the hot core).
import * as THREE from 'three';
import { settings } from '../../settings.js';

const SNOW = { count: 3500, box: new THREE.Vector3(480, 340, 480), fall: 150, wind: new THREE.Vector3(26, 0, 12) };

export function setupWeather({ scene, camera, world, renderer, host, session }) {
  const low = (settings.graphics ?? 2) < 1;
  const out = { snow: null, flames: null, roof: null };
  if (!world?.collision?.geometry || !world.bounds) return out;
  // ---- roof map
  const b = world.bounds, size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), RES = 512;
  const roof = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
  roof.texture.wrapS = roof.texture.wrapT = THREE.ClampToEdgeWrapping;
  {
    const cam = new THREE.OrthographicCamera(-size.x / 2, size.x / 2, size.z / 2, -size.z / 2, 1, size.y + 400);
    cam.position.set(c.x, b.max.y + 200, c.z); cam.up.set(0, 0, 1); cam.lookAt(c.x, b.min.y, c.z); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }' });
    const mesh = new THREE.Mesh(world.collision.geometry, mat); mesh.frustumCulled = false;
    const tmp = new THREE.Scene(); tmp.add(mesh);
    const prevTarget = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha(), prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping; renderer.setRenderTarget(roof); renderer.setClearColor(new THREE.Color(b.min.y - 2000, 0, 0), 1); renderer.clear(); renderer.render(tmp, cam);
    renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha); renderer.toneMapping = prevTone;
    mat.dispose();
  }
  out.roof = roof;
  // ---- snow
  const N = low ? 900 : SNOW.count, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) { pos[i] = Math.random(); seed[i] = Math.random(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  const snowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, fog: true,
    uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: SNOW.box }, roof: { value: roof.texture }, roofMin: { value: new THREE.Vector2(b.max.x, b.min.z) }, roofSize: { value: new THREE.Vector2(-size.x, size.z) },   // the top-down camera (up = +z) mirrors x
      wind: { value: SNOW.wind }, fall: { value: SNOW.fall }, px: { value: 1 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 },
      covers: { value: 0 }, coverMin: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) }, coverMax: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) } },
    vertexShader: `attribute vec3 seed; uniform float time, fall, px; uniform vec3 cam, box, wind; uniform sampler2D roof; uniform vec2 roofMin, roofSize; uniform int covers; uniform vec3 coverMin[4], coverMax[4];
      varying float vA; varying float vFogDepth;
      void main(){
        float sp = fall * (0.75 + 0.5 * seed.z);
        vec3 drift = vec3(wind.x * time + sin(time * 0.9 + seed.y * 6.2832) * 22.0, -sp * time, wind.z * time + cos(time * 0.7 + seed.x * 6.2832) * 22.0);
        vec3 w = cam + mod(position * box * 2.0 + drift - cam, box * 2.0) - box;   // wraps through a box round the camera, fixed in the world
        vec2 uv = (w.xz - roofMin) / roofSize; float top = texture2D(roof, uv).r;
        float open = step(top - 6.0, w.y);                                        // only above the highest surface here: not under a roof
        for (int i = 0; i < 4; i++) if (i < covers && all(greaterThan(w, coverMin[i])) && all(lessThan(w, coverMax[i]))) open = 0.0;   // covered boxes (the gondola cars: no collision roof)
        vec4 mv = modelViewMatrix * vec4(w, 1.0); float d = max(30.0, -mv.z);
        vA = open * smoothstep(1500.0, 250.0, d) * smoothstep(20.0, 60.0, d) * (0.55 + 0.45 * seed.x);
        gl_PointSize = open * (0.9 + 1.4 * seed.x) * 520.0 * px / d; gl_PointSize = min(gl_PointSize, 14.0 * px);
        vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 fogColor; uniform float fogDensity; varying float vA; varying float vFogDepth;
      void main(){ vec2 p = gl_PointCoord - 0.5; float r = dot(p, p) * 4.0; if (r > 1.0) discard;
        float a = (1.0 - r) * (1.0 - r) * vA * 0.9; float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        vec3 col = mix(vec3(0.93, 0.95, 1.0), fogColor, f); gl_FragColor = vec4(col, a * (1.0 - f * 0.6));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  snowMat.fog = false;   // the fog is read by hand above (three's chunks expect its own varyings)
  const snow = new THREE.Points(geo, snowMat); snow.frustumCulled = false; snow.renderOrder = 900; snow.name = 'castle_snow'; scene.add(snow);
  out.snow = snow;
  // ---- flames
  const pts = [], sz = [], ph = [], kinds = [];
  // (the marker nodes are hidden once read: 376 empty objects the renderer walked every frame)
  world.root?.traverse(o => { if (/^CASTLE_FLAME_/.test(o.name)) { const p = o.getWorldPosition(new THREE.Vector3()); pts.push(p.x, p.y, p.z); sz.push(o.userData.size ?? 10); ph.push(Math.random() * 6.2832); kinds.push(o.userData.kind); if (!o.children.length) o.visible = false; } });
  let flames = null;
  if (pts.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('size', new THREE.Float32BufferAttribute(sz, 1)); g.setAttribute('phase', new THREE.Float32BufferAttribute(ph, 1));
    g.setAttribute('hot', new THREE.Float32BufferAttribute(kinds.map(k => k === 'torch' || k === 'fire' ? 1 : k === 'lamp' ? 0.35 : 0.7), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, px: { value: 1 } },
      vertexShader: `attribute float size, phase, hot; uniform float time, px; varying float vPhase, vHot, vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(20.0, -mv.z);
          vPhase = phase; vHot = hot; vA = smoothstep(2600.0, 600.0, d);
          gl_PointSize = min(size * 1.9 * 640.0 * px / d, 220.0 * px); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float time; varying float vPhase, vHot, vA;
        void main(){ vec2 p = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;   // y up
          float t = time * 7.0 + vPhase;
          float sway = sin(t * 0.9 + p.y * 2.5) * 0.16 * (p.y * 0.5 + 0.6);
          float x = p.x + sway, y = p.y + 0.15;
          float w = 0.34 * (1.0 - smoothstep(-0.7, 0.95, y)) + 0.05;                      // a teardrop: wide at the base, a point at the top
          float body = 1.0 - smoothstep(0.0, w, abs(x));
          float v = smoothstep(-0.95, -0.55, y) * (1.0 - smoothstep(0.35, 1.0, y + 0.12 * sin(t * 1.3 + vPhase)));
          float f = body * v; if (f < 0.01) discard;
          float flick = 0.82 + 0.18 * sin(t * 1.7 + vPhase) * sin(t * 0.63);
          float core = smoothstep(0.25, 0.9, f) * (1.0 - smoothstep(-0.6, 0.3, y));          // the hot blue-white base of a candle, orange-white in a torch
          vec3 col = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.86, 0.5), f * f) * (1.0 + 1.6 * vHot);
          col = mix(col, vec3(0.75, 0.85, 1.2) * (1.0 - vHot) + vec3(1.0, 0.9, 0.7) * vHot, core * 0.35);
          gl_FragColor = vec4(col * f * flick * vA * 1.35, f * vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    flames = new THREE.Points(g, mat); flames.frustumCulled = false; flames.renderOrder = 901; flames.name = 'castle_flames'; scene.add(flames);
    g.computeBoundingSphere();
  }
  out.flames = flames;
  // ---- per frame
  let last = performance.now(), coverT = 0;
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    if ((coverT -= dt) <= 0) { coverT = 1; const boxes = (window.kino?.castle?.gondola?.cars?.() ?? []).slice(0, 4); snowMat.uniforms.covers.value = boxes.length;
      boxes.forEach((b, i) => { snowMat.uniforms.coverMin.value[i].copy(b.min).subScalar(6); snowMat.uniforms.coverMax.value[i].copy(b.max).addScalar(6); }); }
    const px = renderer.getPixelRatio() * (renderer.getSize(new THREE.Vector2()).y / 900);
    snowMat.uniforms.time.value += dt; snowMat.uniforms.cam.value.copy(camera.position); snowMat.uniforms.px.value = px;
    if (scene.fog) { snowMat.uniforms.fogColor.value.copy(scene.fog.color); snowMat.uniforms.fogDensity.value = scene.fog.density ?? 0; }
    if (flames) { flames.material.uniforms.time.value += dt; flames.material.uniforms.px.value = px; }
  });
  out.state = () => ({ flames: pts.length / 3, snow: N, roof: RES, bounds: [b.min.toArray().map(Math.round), b.max.toArray().map(Math.round)] });
  out.roofAt = (x, z) => {   // debug: the roof map's height at a world point
    const buf = new Uint16Array(4); const u = Math.floor((b.max.x - x) / size.x * RES), v = Math.floor((z - b.min.z) / size.z * RES);
    renderer.readRenderTargetPixels(roof, u, v, 1, 1, buf); return THREE.DataUtils.fromHalfFloat(buf[0]);
  };
  return out;
}

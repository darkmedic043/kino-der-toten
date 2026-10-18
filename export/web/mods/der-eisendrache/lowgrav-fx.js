// Der Eisendrache's low gravity, as seen (2026-10-17, user: "add the visual effects of low gravity when its activated in
// the basement"). BO3's undercroft turns blue and hums while the gravity is low: dust and grit lift off the floor and
// drift upward, a wave of energy pulses out of the MPD pyramid when it switches on (and once more when it switches
// off), the screen takes a cold cast while you're in it, and jumps and wall kicks puff a ring of dust. Everything here
// is GPU-driven (one Points mesh animated in its vertex shader, a few sprites and one shell mesh) so it costs the frame
// nothing on the CPU, and all of it is compiled during the load (host.warmObjects).
import * as THREE from 'three';
import { settings } from '../../settings.js';

const MOTES = 2400, MOTES_LOW = 800, _v2 = new THREE.Vector2();
const COLD = new THREE.Color(0x6f94ff);

export function setupLowGravFx({ scene, renderer, host }, box, center, pyramid) {
  const low = (settings.graphics ?? 2) < 1;
  const size = box.getSize(new THREE.Vector3());
  // ---- motes: dust and grit rising through the room, wrapping back to the floor; the floor's own litter lifts first
  const N = low ? MOTES_LOW : MOTES, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  geo.boundingSphere = new THREE.Sphere(center.clone(), size.length() / 2);
  const moteMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, k: { value: 0 }, px: { value: 1 }, boxMin: { value: box.min.clone() }, boxSize: { value: size.clone() }, flash: { value: 1 } },
    vertexShader: `attribute vec3 seed; uniform float time, k, px, flash; uniform vec3 boxMin, boxSize; varying float vA; varying float vHot;
      void main(){
        // rises at 14-40 units/s, drifting sideways on a slow sine; wraps top to bottom. While k ramps in, the motes
        // are still near the floor (they lift off with the gravity), so the climb is scaled by k
        float up = (14.0 + 26.0 * seed.y) * time * k;
        vec3 p = boxMin + vec3(position.x * boxSize.x + sin(time * 0.35 + seed.x * 6.2832) * 18.0 * k, mod(position.y * boxSize.y + up, boxSize.y), position.z * boxSize.z + cos(time * 0.3 + seed.z * 6.2832) * 18.0 * k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = max(30.0, -mv.z);
        float twinkle = 0.65 + 0.35 * sin(time * (1.5 + seed.z * 2.0) + seed.x * 6.2832);
        vHot = step(0.93, seed.x);                                                     // a few brighter specks
        vA = k * flash * twinkle * smoothstep(1900.0, 400.0, d) * smoothstep(12.0, 40.0, d) * (0.5 + 0.7 * seed.y);
        gl_PointSize = min((1.6 + 2.6 * seed.z + 3.0 * vHot) * 460.0 * px / d, 14.0 * px);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying float vHot;
      void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard;
        float a = (1.0 - r) * (1.0 - r) * vA;
        vec3 col = mix(vec3(0.55, 0.68, 1.0), vec3(0.85, 0.92, 1.0), vHot);
        gl_FragColor = vec4(col * a * (1.0 + 1.5 * vHot), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const motes = new THREE.Points(geo, moteMat); motes.name = 'lowgrav_motes'; motes.renderOrder = 902; motes.visible = false; scene.add(motes);
  // ---- the pulse: a shell of light that swells out of the pyramid when the field switches on (and a dimmer one off)
  const shellMat = new THREE.MeshBasicMaterial({ color: COLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), shellMat); shell.position.copy(pyramid); shell.visible = false; shell.name = 'lowgrav_pulse'; shell.frustumCulled = false; scene.add(shell);
  let pulse = null;   // {t, len, from, to, peak}
  // ---- glow sprites: the pyramid's crown while the field is on, and a ring of dust under a jump
  const glowTex = radial(64, (r) => Math.pow(1 - r, 2.2)), ringTex = radial(64, (r) => Math.exp(-Math.pow((r - .72) / .09, 2)));
  const crown = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: COLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  crown.position.copy(pyramid).add(new THREE.Vector3(0, 70, 0)); crown.scale.setScalar(160); crown.visible = false; crown.name = 'lowgrav_crown'; scene.add(crown);
  const rings = [], freeRings = [];
  const ringMat = () => new THREE.SpriteMaterial({ map: ringTex, color: 0x9fb8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(ringMat()); s.visible = false; s.name = 'lowgrav_ring'; s.removeFromParent(); freeRings.push(s); }
  host.warmObjects?.push(motes, shell, crown, freeRings[0]);
  // ---- the cold cast on the screen (HUD overlay, outside the frame: no post-processing cost)
  const tint = document.createElement('div'); tint.id = 'lowgrav-tint';
  tint.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;transition:opacity .35s;background:radial-gradient(ellipse at center,transparent 30%,rgba(70,110,255,.22) 80%,rgba(60,90,230,.38));box-shadow:inset 0 0 140px rgba(90,130,255,.28)';
  const flash = document.createElement('div'); flash.id = 'lowgrav-flash';
  flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;background:radial-gradient(ellipse at center,rgba(170,200,255,.55),rgba(90,130,255,.25) 60%,transparent)';
  document.body.append(tint, flash);
  let flashT = 0, tintLevel = 0, lastTint = '';

  function ring(at, scale = 1) {
    const s = freeRings.pop() ?? rings.find(r => r.t > .8)?.s; if (!s) return;
    const i = rings.findIndex(r => r.s === s); if (i >= 0) rings.splice(i, 1);
    s.position.copy(at).add(new THREE.Vector3(0, 6, 0)); s.scale.setScalar(26 * scale); s.material.opacity = .7; s.visible = true; scene.add(s);
    rings.push({ s, t: 0, scale });
  }
  const out = {
    // the field switched: on = a bright swell from the pyramid, off = a soft one collapsing back
    pulse(on) { pulse = { t: 0, len: on ? 1.5 : 1.1, from: on ? 30 : 1300, to: on ? 1500 : 60, peak: on ? .55 : .22 }; shell.visible = true; },
    // the player's screen: entering the field flashes it
    enter() { flashT = 1; },
    jump(at, kick = false) { ring(at, kick ? 1.6 : 1); },
    // per frame: k = how far the field is on (0..1), inside = the player is in it, blink = the countdown's flashing (1 or .25)
    update(dt, k, inside, blink) {
      moteMat.uniforms.px.value = renderer.getPixelRatio() * (renderer.getSize(_v2).y / 900);
      moteMat.uniforms.time.value += dt; moteMat.uniforms.k.value = k; moteMat.uniforms.flash.value = blink; motes.visible = k > .002;
      const want = inside && k > .3 ? (.55 + .45 * blink) * Math.min(1, k * 2) : 0;
      tintLevel += (want - tintLevel) * Math.min(1, dt * 6); if (Math.abs(tintLevel - want) < .01) tintLevel = want;
      const ts = tintLevel.toFixed(3); if (ts !== lastTint) tint.style.opacity = lastTint = ts;   // (a style write only when it changes)
      if (flashT > 0) { flashT = Math.max(0, flashT - dt * 1.6); flash.style.opacity = (flashT * flashT * .9).toFixed(3); } else if (flash.style.opacity !== '0') flash.style.opacity = '0';
      crown.visible = k > .002; crown.material.opacity = k * (.55 + .3 * Math.sin(moteMat.uniforms.time.value * 2.4)) * blink; crown.scale.setScalar(150 + 30 * Math.sin(moteMat.uniforms.time.value * 1.7));
      if (pulse) { pulse.t += dt; const u = Math.min(1, pulse.t / pulse.len), e = 1 - Math.pow(1 - u, 3);
        shell.scale.setScalar(pulse.from + (pulse.to - pulse.from) * e); shellMat.opacity = pulse.peak * Math.sin(u * Math.PI);
        if (u >= 1) { pulse = null; shell.visible = false; shellMat.opacity = 0; } }
      for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt * 1.8; const u = Math.min(1, r.t);
        r.s.scale.setScalar((26 + 90 * (1 - Math.pow(1 - u, 2))) * r.scale); r.s.material.opacity = .7 * (1 - u);
        if (u >= 1) { r.s.visible = false; r.s.removeFromParent(); rings.splice(i, 1); freeRings.push(r.s); } }
    },
    reset() { pulse = null; shell.visible = false; shellMat.opacity = 0; flashT = 0; tintLevel = 0; tint.style.opacity = '0'; flash.style.opacity = '0'; for (const r of rings) { r.s.visible = false; r.s.removeFromParent(); freeRings.push(r.s); } rings.length = 0; },
    state: () => ({ motes: N, pulse: !!pulse, rings: rings.length, tint: +tint.style.opacity }),
  };
  return out;
}

// a soft radial texture drawn in code (no asset): f(r) = alpha at radius r (0 centre .. 1 edge)
function radial(n, f) {
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.min(1, Math.hypot((x + .5) / n - .5, (y + .5) / n - .5) * 2), a = Math.max(0, Math.min(1, f(r))), i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255); }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t;
}

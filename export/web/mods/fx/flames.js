// Fire for every map's fixtures (2026-10-27, user: "make the fire look like actual fire"): candles, wall torches,
// fire pits, burning debris, hurricane lamps. Replaces the one smooth teardrop sprite per fixture (which read as a
// candle everywhere) with four instanced billboard layers, one draw call each:
//   - flames: a teardrop body eaten from the top by scrolling noise, so tongues form, stretch and break off; graded
//     from a dark red edge through orange and yellow to a white core (candles keep a blue base); bigger fires are
//     several overlapping sub-flames of different heights and rates
//   - embers: sparks that rise out of the fire on a turbulent path and twinkle out
//   - smoke: soft noise-broken puffs rising and spreading above torches and fires, warm underneath while young,
//     fogged like the world (normal blending, drawn before the flames)
//   - glow: a soft additive halo on each fire that breathes with the flicker (light bleed on the fixture itself and
//     on fires the point-light pool can't reach)
// fireFlicker(t, seed) is the one flicker curve: the flames use it in GLSL and the maps' fire lights on the CPU, so
// a torch and its light pulse together. Quads are view-aligned and anchored at the fixture point; they never pop
// at the screen edge or hit the point-sprite size cap the old Points did.
import * as THREE from 'three';

// per fixture kind: flame height (world units), sub-flames, hot (1 = white core, lower = cooler, bluer base),
// embers and smoke puffs per fire, glow halo (× size), aspect (height / width)
export const KINDS = {
  candle: { size: 9, sub: 1, hot: .5, embers: 0, smoke: 0, glow: 2.6, aspect: 2.1 },
  lamp: { size: 12, sub: 1, hot: .35, embers: 0, smoke: 0, glow: 3, aspect: 1.9 },   // a hurricane lamp: a steadier flame behind glass
  torch: { size: 34, sub: 3, hot: 1, embers: 6, smoke: 2, glow: 2.6, aspect: 1.6 },
  fire: { size: 60, sub: 5, hot: 1, embers: 14, smoke: 6, glow: 2.2, aspect: 1.35 },   // a fire pit, burning debris
};

// the flicker of a flame, about 0.68..1.0: a few incommensurate sines (a slow breathing, a 9 Hz waver, fast jitter)
export function fireFlicker(t, seed = 0) {
  const a = t + seed;
  return .86 + .06 * Math.sin(a * 9.1) + .04 * Math.sin(a * 23.7 + seed) + .05 * Math.sin(a * 3.3) * Math.sin(a * 14.2 + seed * 2) + .03 * Math.sin(a * 41.3) * Math.sin(a * 1.7);
}
const GLSL_FLICKER = /* glsl */`float flicker(float t, float s){ float a = t + s;
  return .86 + .06 * sin(a * 9.1) + .04 * sin(a * 23.7 + s) + .05 * sin(a * 3.3) * sin(a * 14.2 + s * 2.0) + .03 * sin(a * 41.3) * sin(a * 1.7); }`;
const GLSL_NOISE = /* glsl */`
  float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }`;
// a quad anchored at its instance point, standing up along world Y and turned about it to face the camera (an axial
// billboard: a flame seen from above foreshortens on its candle instead of lying across the shelf behind it, which a
// screen-aligned quad did); only when seen almost straight down does it lean back toward the screen so it doesn't vanish.
// vertex xy in [-0.5,0.5]×[0,1] (uv.y up from the base)
const GLSL_BILLBOARD = /* glsl */`
  vec4 billboard(vec3 at, vec2 wh, vec2 corner, float yBase){ vec4 mv = modelViewMatrix * vec4(at, 1.0);
    vec3 toP = normalize(mv.xyz), up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float steep = abs(dot(up, toP)); up = normalize(mix(up, vec3(0.0, 1.0, 0.0), smoothstep(0.7, 0.97, steep)));
    vec3 right = normalize(cross(toP, up));
    mv.xyz += right * (corner.x * wh.x) + up * ((corner.y - yBase) * wh.y); return mv; }`;

const quad = () => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
};
const inst = (g, name, arr, n) => { g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr.length ? arr : new Array(n).fill(0)), n)); };

/** createFlames({scene, renderer, low}) → {add, build, update, fires, state, layers} */
export function createFlames({ scene, renderer, low = false, name = 'flames', fade = 2600 } = {}) {
  const fires = [];   // {p, kind, size, hot, seed, sub, embers, smoke, glow, aspect, rate}
  const u = { time: { value: 0 }, px: { value: 1 }, fogColor: { value: new THREE.Color(0, 0, 0) }, fogDensity: { value: 0 }, flash: { value: 0 }, fade: { value: fade },
    gain: { value: .55 }, core: { value: .25 }, alpha: { value: .9 }, glowK: { value: .4 }, soot: { value: .75 }, erode: { value: 1.15 } };   // tuning: brightness, white-core share, flame opacity, halo strength, how much the tips darken what's behind
  const common = { transparent: true, depthWrite: false, depthTest: true, fog: false };

  // the flame body blends premultiplied (ONE, ONE_MINUS_SRC_ALPHA): the bright inside adds light, the thin tips and the
  // outer skin also darken what is behind them a little (soot), which additive blending can't do and is what made the
  // old flames read as glowing cut-outs
  const flameMat = new THREE.ShaderMaterial({ ...common, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, uniforms: u,
    vertexShader: /* glsl */`attribute vec3 at; attribute vec4 fl;   // fl: height, aspect, phase, hot
      attribute float rate; uniform float px, fade; varying vec2 vUv; varying float vPhase, vHot, vA, vRate;
      ${GLSL_BILLBOARD}
      void main(){ vUv = vec2(uv.x * 2.0 - 1.0, uv.y); vPhase = fl.z; vHot = fl.w; vRate = rate;
        float h = fl.x, w = h / fl.y;
        vec4 mv = billboard(at, vec2(w, h), position.xy, 0.0); float d = max(10.0, -mv.z);
        // keep a far flame at least a few pixels tall (it would otherwise shimmer at sub-pixel size), dimmer to match
        float pxh = h * 700.0 * px / d, k = max(1.0, 4.0 * px / max(pxh, 0.01));
        if (k > 1.0) { mv = billboard(at, vec2(w, h) * k, position.xy, 0.0); }
        vA = smoothstep(fade, fade * 0.3, d) / (k * k);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float time, gain, core, alpha, soot, erode; varying vec2 vUv; varying float vPhase, vHot, vA, vRate;
      ${GLSL_NOISE} ${GLSL_FLICKER}
      void main(){ vec2 p = vUv; float t = time * vRate + vPhase, fk = flicker(time, vPhase);
        float y = p.y / (0.76 + 0.24 * fk);                                 // the flame breathes: taller as the flicker peaks
        // turbulence rising through the flame: slow eddies (warp) bend the body and the licks, finer noise rides on them;
        // the erosion grows with height, so the base is solid and the top breaks into tongues that pinch off and fade
        vec2 q = vec2(p.x * 1.6 + vPhase * 0.37, y * 2.2 - t * 1.9);
        vec2 warp = vec2(fbm(q * 0.8 + vec2(3.1, -t * 0.35)), fbm(q * 0.8 + vec2(-7.3, -t * 0.5))) - 0.5;
        float n = fbm(q + warp * 1.4), n2 = fbm(q * 2.7 + warp * 2.2 + vec2(5.2, -t * 1.2));
        float sway = sin(t * 1.1 + y * 3.5) * 0.07 * y + warp.x * 0.6 * y;
        float w = mix(0.78, 0.06, smoothstep(0.0, 1.0, y));                 // a teardrop: wide at the base, a point at the top
        float body = 1.0 - abs(p.x + sway) / w;                              // 1 on the axis, 0 at the edge
        float f = body * (1.0 - y) * 1.7 - ((n - 0.32) * (0.5 + 1.7 * y) + (n2 - 0.45) * (0.25 + 0.55 * y)) * erode;
        // the erosion can push f above 0 outside the tongue (low noise); mask by the body and the top, or the quad shows as a pale box
        float a = smoothstep(0.0, 0.13, f) * smoothstep(0.0, 0.1, p.y) * smoothstep(-0.1, 0.25, body) * smoothstep(1.0, 0.8, y) * vA; if (a < 0.01) discard;
        // how deep inside the flame: a thin dark red skin, orange, yellow; the white core sits low in the flame (the
        // hottest part is just above the fuel), the tips are only ever red-orange
        float dd = clamp(f * 0.75, 0.0, 1.0), low = smoothstep(0.8, 0.25, y);
        vec3 col = mix(vec3(0.7, 0.07, 0.01), vec3(1.0, 0.38, 0.04), smoothstep(0.0, 0.3, dd));
        col = mix(col, vec3(1.0, 0.72, 0.16), smoothstep(0.42, 0.85, dd) * (0.5 + 0.5 * low));
        col = mix(col, vec3(1.0, 0.93, 0.66), smoothstep(0.78, 1.0, dd) * low * (0.3 + 0.7 * vHot) * core);
        col = mix(col, vec3(0.35, 0.55, 1.2), (1.0 - vHot) * smoothstep(0.3, 0.0, p.y) * smoothstep(0.0, 0.5, dd) * 0.8);   // a candle's blue base
        // the body is optically thick: it covers what is behind it (and the sub-flames behind it) instead of adding to
        // it, so a fire of several overlapping sub-flames stays flame-coloured rather than summing to a white blob;
        // soot is the share of that cover (1 = plain cover, 0 = pure additive light); the thin skin and the tongue tips
        // cover less and are dark red, so they read as translucent and smoky
        float op = a * alpha * mix(0.4, 0.95, dd);
        gl_FragColor = vec4(col * gain * (0.8 + 0.4 * vHot) * fk * op, op * soot);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });

  const emberMat = new THREE.ShaderMaterial({ ...common, blending: THREE.AdditiveBlending, uniforms: u,
    vertexShader: /* glsl */`attribute vec3 at, seed; attribute float spread; uniform float time, px, fade; varying float vA, vT; varying vec2 vUv2;
      void main(){ float dur = 1.4 + 2.2 * seed.y, t = fract(time / dur + seed.x), ph = seed.z * 6.2832;
        float fl = step(spread, 0.0), sp = abs(spread);   // fl: floating embers (spread < 0) hang in the air instead of rising
        float rise = mix(t * sp * (3.0 + 2.5 * seed.z), (seed.y - 0.5) * sp * 0.8 + sin(time * 0.5 + ph) * sp * 0.12, fl);
        vec3 w = at + vec3(sin(time * 2.3 + ph + t * 6.0) * sp * (0.25 + 0.6 * t) * (1.0 - fl) + sin(ph + time * 0.1 * fl) * sp * mix(0.3, 0.9, fl), rise + sin(time * 1.3 + ph) * sp * 0.2 * (1.0 - fl),
          cos(time * 1.9 + ph * 1.3 + t * 5.0) * sp * (0.25 + 0.6 * t) * (1.0 - fl) + cos(ph + time * 0.08 * fl) * sp * mix(0.3, 0.9, fl));
        vec4 mv = modelViewMatrix * vec4(w, 1.0); float d = max(10.0, -mv.z);
        float sz = clamp((0.9 + 0.9 * seed.x) * 700.0 * px / d, 2.0 * px, 6.0 * px) * d / (700.0 * px);   // 2-6 px, as world units at d
        mv.xy += position.xy * sz; vT = t; vUv2 = uv;
        float tw = 0.6 + 0.4 * sin(time * 19.0 + ph * 3.0) * sin(time * 7.0 + ph);
        vA = (1.0 - t) * smoothstep(0.0, 0.06, t) * tw * smoothstep(fade, fade * 0.3, d);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`varying float vA, vT; varying vec2 vUv2;
      void main(){ vec2 p = vUv2 - 0.5; float r = dot(p, p) * 4.0; if (r > 1.0) discard; float a = (1.0 - r) * (1.0 - r) * vA;
        vec3 col = mix(vec3(1.0, 0.9, 0.55), vec3(1.0, 0.35, 0.06), smoothstep(0.0, 0.5, vT));
        gl_FragColor = vec4(col * 2.4 * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });

  const smokeMat = new THREE.ShaderMaterial({ ...common, blending: THREE.NormalBlending, uniforms: u,
    vertexShader: /* glsl */`attribute vec3 at, seed; attribute float size; uniform float time, px, fade; varying float vA, vT, vSeed, vFog; varying vec2 vUv2;
      ${GLSL_BILLBOARD}
      void main(){ float dur = 3.2 + 2.8 * seed.y, t = fract(time / dur + seed.x), ph = seed.z * 6.2832;
        vec3 w = at + vec3(sin(time * 0.5 + ph) * size * 0.35 * t + sin(ph) * size * 0.2, t * size * (2.6 + 1.6 * seed.z), cos(time * 0.4 + ph) * size * 0.35 * t + cos(ph) * size * 0.2);
        float s = size * (0.55 + 1.9 * t);
        vec4 mv = modelViewMatrix * vec4(w, 1.0); float d = max(10.0, -mv.z); mv.xy += position.xy * s - vec2(0.0, s * 0.5);
        vA = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.15, t) * smoothstep(fade, fade * 0.3, d) * smoothstep(15.0, 70.0, d);
        vT = t; vSeed = seed.z; vFog = d; vUv2 = uv; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform vec3 fogColor; uniform float fogDensity, time, flash; varying float vA, vT, vSeed, vFog; varying vec2 vUv2;
      ${GLSL_NOISE}
      void main(){ vec2 p = (vUv2 - 0.5) * 2.0; float r = length(p);
        float n = fbm(p * 1.8 + vec2(vSeed * 9.0, -time * 0.25 + vSeed * 4.0));
        float a = smoothstep(1.0, 0.2, r + (n - 0.45) * 0.9) * vA * 0.42; if (a < 0.004) discard;
        float f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog);
        vec3 col = mix(vec3(0.05, 0.05, 0.055), vec3(0.5, 0.2, 0.05), (1.0 - vT) * (1.0 - vT) * smoothstep(0.6, -0.2, p.y) * 0.9) + flash * vec3(0.1, 0.12, 0.15);
        gl_FragColor = vec4(mix(col, fogColor, f), a * (1.0 - f * 0.6));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });

  const glowMat = new THREE.ShaderMaterial({ ...common, blending: THREE.AdditiveBlending, uniforms: u,
    vertexShader: /* glsl */`attribute vec3 at; attribute vec3 gl;   // gl: size, phase, hot
      uniform float fade; varying float vA, vPhase, vHot; varying vec2 vUv2;
      ${GLSL_BILLBOARD}
      void main(){ vec4 mv = modelViewMatrix * vec4(at, 1.0); float d = max(10.0, -mv.z); mv.xy += position.xy * gl.x - vec2(0.0, gl.x * 0.5);
        vA = smoothstep(fade, fade * 0.3, d) * smoothstep(25.0, 110.0, d); vPhase = gl.y; vHot = gl.z; vUv2 = uv; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float time, glowK; varying float vA, vPhase, vHot; varying vec2 vUv2;
      ${GLSL_FLICKER}
      void main(){ vec2 p = (vUv2 - 0.5) * 2.0; float r = length(p * vec2(1.0, 0.85)); if (r > 1.0) discard;
        float a = pow(1.0 - r, 2.6) * vA * (0.75 + 0.25 * flicker(time, vPhase)) * 0.16 * glowK * (0.5 + 0.5 * vHot);
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.16) * 1.6 * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });

  // heat shimmer: a sheet of rising distortion over and above every torch and fire. It is not drawn in the scene: the
  // lighting mod's post chain renders kino.heatScene into a half-size offset map and its haze pass bends the frame by
  // it (grade.js HAZE_SHADER, tHeat). Occluded by the scene depth, so a fire behind a wall doesn't shimmer through it.
  // Low graphics has no composer, so no shimmer.
  const K = window.kino ??= {};
  const heatU = K.heat ??= { tDepth: { value: null }, near: { value: 1 }, far: { value: 1000 }, res: { value: new THREE.Vector2(1, 1) } };
  const heatScene = K.heatScene ??= new THREE.Scene();
  const heatMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { time: u.time, fade: u.fade, px: u.px, ...heatU },
    vertexShader: /* glsl */`attribute vec3 at; attribute vec3 ht;   // ht: flame height, phase, rate
      uniform float fade; varying vec2 vUv; varying float vPhase, vRate, vAmp, vZ;
      ${GLSL_BILLBOARD}
      void main(){ vUv = vec2(uv.x * 2.0 - 1.0, uv.y); vPhase = ht.y; vRate = ht.z;
        float h = ht.x * 2.4, w = ht.x * 1.5;                                 // the sheet: from the flame's base to 2.4 heights up
        vec4 mv = billboard(at, vec2(w, h), position.xy, 0.0); float d = max(10.0, -mv.z); vZ = d;
        vAmp = min(0.012, 0.03 * ht.x / d) * smoothstep(fade * 0.5, fade * 0.15, d);   // an offset in uv: ~2% of the flame's height on screen
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform sampler2D tDepth; uniform float time, near, far; uniform vec2 res; varying vec2 vUv; varying float vPhase, vRate, vAmp, vZ;
      ${GLSL_NOISE}
      #include <packing>
      void main(){ float z = -perspectiveDepthToViewZ(texture2D(tDepth, gl_FragCoord.xy / res).x, near, far); if (z < vZ - 4.0) discard;
        vec2 p = vUv; float t = time * vRate + vPhase;
        vec2 q = vec2(p.x * 1.4 + vPhase, p.y * 2.6 - t * 1.6);
        vec2 o = vec2(fbm(q) - fbm(q + vec2(0.07, 0.0)), fbm(q + vec2(11.3, 0.0)) - fbm(q + vec2(11.3, 0.07))) * 14.0;   // the noise gradient: a smooth swirl, not a static offset
        float x = 1.0 - p.x * p.x, shape = x * x * smoothstep(0.0, 0.12, p.y) * pow(1.0 - p.y, 1.3) * (0.6 + 0.4 * smoothstep(0.0, 0.3, p.y));
        gl_FragColor = vec4(o * shape * vAmp, 0.0, 1.0); }` });

  const layers = {};
  const mk = (key, mat, order) => { const m = new THREE.Mesh(quad(), mat); m.frustumCulled = false; m.renderOrder = order; m.name = name + '_' + key; m.matrixAutoUpdate = false; scene.add(m); layers[key] = m; return m; };
  mk('smoke', smokeMat, 899); mk('glow', glowMat, 900); mk('flames', flameMat, 901); mk('embers', emberMat, 902);
  { const m = new THREE.Mesh(quad(), heatMat); m.frustumCulled = false; m.name = name + '_heat'; m.matrixAutoUpdate = false; heatScene.add(m); layers.heat = m; }
  // stub instances far below the world, so every program compiles in the load-time warm-up (build() fills the real ones)
  const far = [0, -1e6, 0];
  inst(layers.smoke.geometry, 'at', far, 3); inst(layers.smoke.geometry, 'seed', [0, 0, 0], 3); inst(layers.smoke.geometry, 'size', [1], 1);
  inst(layers.glow.geometry, 'at', far, 3); inst(layers.glow.geometry, 'gl', [1, 0, 1], 3);
  inst(layers.flames.geometry, 'at', far, 3); inst(layers.flames.geometry, 'fl', [1, 1, 0, 1], 4); inst(layers.flames.geometry, 'rate', [1], 1);
  inst(layers.embers.geometry, 'at', far, 3); inst(layers.embers.geometry, 'seed', [0, 0, 0], 3); inst(layers.embers.geometry, 'spread', [1], 1);
  inst(layers.heat.geometry, 'at', far, 3); inst(layers.heat.geometry, 'ht', [1, 0, 1], 3);
  for (const m of Object.values(layers)) m.geometry.instanceCount = 0;

  /** add a fire at p (its base: the wick, the torch head, the top of the fuel) of a KINDS kind; opts override the kind
   *  (size, sub, hot, embers, smoke, glow, aspect; float: true = only embers, hanging in the air around p) */
  function add(p, kind = 'fire', opts = {}) {
    const K = KINDS[kind] ?? KINDS.fire;
    const f = { p: p.clone(), kind, seed: Math.random() * 6.2832, ...K, ...opts };
    if (low) { f.sub = Math.min(f.sub, 2); f.smoke = 0; f.embers = f.embers >> 1; }
    fires.push(f); return f;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function build() {
    const fa = [], fl = [], fr = [], ea = [], es = [], esp = [], sa = [], ss = [], sz = [], ga = [], gg = [], ha = [], hh = [];
    for (const f of fires) {
      const { p, size, sub, hot, aspect, seed } = f;
      for (let i = 0; i < sub; i++) {
        const main = i === 0, ang = Math.random() * 6.2832, r = main ? 0 : size * rnd(.08, .3);
        fa.push(p.x + Math.cos(ang) * r, p.y - (main ? 0 : size * rnd(.02, .1)), p.z + Math.sin(ang) * r);
        fl.push(size * (main ? 1 : rnd(.5, .85)), aspect * (main ? 1 : rnd(.85, 1.2)), main ? seed : Math.random() * 6.2832, hot);
        fr.push(rnd(.85, 1.25));
      }
      for (let i = 0; i < f.embers; i++) { ea.push(p.x, p.y + (f.float ? 0 : size * .35), p.z); es.push(Math.random(), Math.random(), Math.random()); esp.push(f.float ? -size : size * .45); }   // spread < 0: floating embers (no fire under them, they hang and drift)
      for (let i = 0; i < f.smoke; i++) { sa.push(p.x + (Math.random() - .5) * size * .4, p.y + size * .75, p.z + (Math.random() - .5) * size * .4); ss.push(Math.random(), Math.random(), Math.random()); sz.push(size * 1.3); }
      if (f.glow) { ga.push(p.x, p.y + size * .35, p.z); gg.push(size * f.glow, seed, hot); }
      if (sub > 0 && f.heat !== false && size >= 16) { ha.push(p.x, p.y, p.z); hh.push(size, seed, rnd(.9, 1.2)); }   // no shimmer on candles and lamps
    }
    const set = (m, attrs) => { let n = 0; for (const [k, [arr, w]] of Object.entries(attrs)) { inst(m.geometry, k, arr, w); n = arr.length / w; } m.geometry.instanceCount = n; };
    set(layers.flames, { at: [fa, 3], fl: [fl, 4], rate: [fr, 1] });
    set(layers.embers, { at: [ea, 3], seed: [es, 3], spread: [esp, 1] });
    set(layers.smoke, { at: [sa, 3], seed: [ss, 3], size: [sz, 1] });
    set(layers.glow, { at: [ga, 3], gl: [gg, 3] });
    set(layers.heat, { at: [ha, 3], ht: [hh, 3] });
    // three pins an InstancedBufferGeometry's max instance count at its first draw (the stub); clear it, or only one draws
    for (const m of Object.values(layers)) { m.geometry._maxInstanceCount = undefined; m.visible = m.geometry.instanceCount > 0; }
  }
  const size2 = new THREE.Vector2();
  /** per frame: dt, and optionally the scene's fog (for the smoke) and a lightning flash 0..1 */
  function update(dt, { fog = null, flash = 0 } = {}) {
    u.time.value += dt;
    u.px.value = renderer.getPixelRatio() * (renderer.getSize(size2).y / 900);
    if (fog) { u.fogColor.value.copy(fog.color); u.fogDensity.value = fog.density ?? 0; }
    u.flash.value = flash;
  }
  const state = () => ({ fires: fires.length, flames: layers.flames.geometry.instanceCount, embers: layers.embers.geometry.instanceCount, smoke: layers.smoke.geometry.instanceCount, glow: layers.glow.geometry.instanceCount });
  return { add, build, update, fires, state, layers, uniforms: u, flicker: (f, t = u.time.value) => fireFlicker(t, f.seed) };
}

// Fire for every map's fixtures (2026-10-27, user: "make the fire look like actual fire"): candles, wall torches,
// fire pits, burning debris, hurricane lamps. Replaces the one smooth teardrop sprite per fixture (which read as a
// candle everywhere) with four instanced billboard layers, one draw call each:
//   - flames (reworked 2026-11-19, user: "make the flames more realistic"): a plume that draws in as it rises, its
//     heat eaten more and more by rising turbulence read from one tiling noise texture (flameNoise: three reads a
//     pixel instead of twelve hashed noise evaluations), so the base is a solid bed, the middle splits into tongues
//     that lean and sway and the top is licks that pinch off; coloured by temperature in light units for the bloom
//     (dark red skin, orange, yellow body, a near-white core low down); candles and lamps (under 26 units tall) stay
//     one calm teardrop with a blue base; bigger fires are several overlapping sub-flames of different heights
//   - embers: sparks that rise out of the fire on a turbulent path and twinkle out
//   - smoke: soot-grey billows (two scales of the same noise texture break the edge and thin the inside) rising and
//     spreading above torches and fires, lit warm from underneath only while young,
//     fogged like the world (normal blending, drawn before the flames)
//   - glow: a soft additive halo on each fire that breathes with the flicker (light bleed on the fixture itself and
//     on fires the point-light pool can't reach)
// fireFlicker(t, seed) is the one flicker curve: the flames use it in GLSL and the maps' fire lights on the CPU, so
// a torch and its light pulse together. Quads are view-aligned and anchored at the fixture point; they never pop
// at the screen edge or hit the point-sprite size cap the old Points did.
import { softUniforms, softCheck, SOFT_VERT, SOFT_FRAG } from './soft.js';
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

// One tiling noise texture for every flame and smoke shader (made once on the CPU, uploaded at load): a texture read
// is far cheaper than hashing noise per pixel, and the channels can hold richer shapes. 128², wraps both ways:
// R, G = two smooth cloud fields (4 octaves from 4 cells), B = ridged noise (thin bright veins: the filaments of a
// flame), A = a finer cloud field (from 8 cells).
let noiseTex = null;
export function flameNoise(renderer) {
  if (noiseTex) return noiseTex;
  const N = 128, data = new Uint8Array(N * N * 4);
  let s = 1234567; const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const lattice = per => { const a = new Float32Array(per * per); for (let i = 0; i < a.length; i++) a[i] = rand(); return a; };
  const sample = (a, per, x, y) => { const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi; fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per, x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
    return (a[y0 * per + x0] * (1 - fx) + a[y0 * per + x1] * fx) * (1 - fy) + (a[y1 * per + x0] * (1 - fx) + a[y1 * per + x1] * fx) * fy; };
  const field = (base, oct, ridged) => { const lats = []; for (let o = 0; o < oct; o++) lats.push(lattice(base << o)); const out = new Float32Array(N * N); let lo = 1e9, hi = -1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0, amp = .5;
      for (let o = 0; o < oct; o++) { const per = base << o; let n = sample(lats[o], per, x / N * per, y / N * per); if (ridged) { n = 1 - Math.abs(n * 2 - 1); n *= n; } v += n * amp; amp *= .5; }
      out[y * N + x] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo); return out; };
  const R = field(4, 4), G = field(4, 4), B = field(4, 4, true), A = field(8, 3);
  for (let i = 0; i < N * N; i++) { data[i * 4] = R[i] * 255; data[i * 4 + 1] = G[i] * 255; data[i * 4 + 2] = B[i] * 255; data[i * 4 + 3] = A[i] * 255; }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter; noiseTex.generateMipmaps = true; noiseTex.needsUpdate = true; noiseTex.name = 'flame-noise';
  renderer?.initTexture?.(noiseTex);   // on the GPU before the first flame is drawn
  return noiseTex;
}

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
    gain: { value: 1 }, core: { value: 1 }, alpha: { value: 1 }, glowK: { value: .4 }, soot: { value: .6 }, erode: { value: 1 }, smokeK: { value: 1 }, tNoise: { value: flameNoise(renderer) }, ...softUniforms() };   // tuning: brightness, white-core share, flame opacity, halo strength, how much the tips darken what's behind
  const common = { transparent: true, depthWrite: false, depthTest: true, fog: false };

  // the flame body blends premultiplied (ONE, ONE_MINUS_SRC_ALPHA): the bright inside adds light, the thin tips and the
  // outer skin also darken what is behind them a little (soot), which additive blending can't do and is what made the
  // old flames read as glowing cut-outs
  const flameMat = new THREE.ShaderMaterial({ ...common, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, uniforms: u,
    vertexShader: /* glsl */`attribute vec3 at; attribute vec4 fl;   // fl: height, aspect, phase, hot
      attribute float rate; uniform float px, fade; varying vec2 vUv; varying float vPhase, vHot, vA, vRate, vSoftR, vCalm;
      ${GLSL_BILLBOARD} ${SOFT_VERT}
      void main(){ vUv = vec2(uv.x * 2.0 - 1.0, uv.y); vPhase = fl.z; vHot = fl.w; vRate = rate;
        float h = fl.x, w = h / fl.y; vCalm = smoothstep(26.0, 13.0, h);   // candles and lamps burn steadily: one clean teardrop
        vec4 mv = billboard(at, vec2(w, h), position.xy, 0.0); float d = max(10.0, -mv.z);
        // keep a far flame at least a few pixels tall (it would otherwise shimmer at sub-pixel size), dimmer to match
        float pxh = h * 700.0 * px / d, k = max(1.0, 4.0 * px / max(pxh, 0.01));
        if (k > 1.0) { mv = billboard(at, vec2(w, h) * k, position.xy, 0.0); }
        vA = smoothstep(fade, fade * 0.3, d) / (k * k); vSoft = softMat * mv; vSoftR = clamp(h * 0.14, 4.0, 40.0);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float time, gain, core, alpha, soot, erode; uniform sampler2D tNoise; varying vec2 vUv; varying float vPhase, vHot, vA, vRate, vSoftR, vCalm;
      ${GLSL_FLICKER} ${SOFT_FRAG}
      void main(){ vec2 p = vUv; float t = time * vRate + vPhase, fk = flicker(time, vPhase);
        float y = p.y / (0.8 + 0.2 * fk);                                   // the flame breathes: taller as the flicker peaks
        // large slow eddies lean the whole body and bend the paths the turbulence climbs along
        vec4 n0 = texture2D(tNoise, vec2(vPhase * 0.31 + p.x * 0.09, y * 0.2 - t * 0.17));
        float sway = ((n0.r - 0.5) * 0.7 + sin(t * 1.3 + y * 3.0) * 0.06) * y * mix(1.0, 0.35, vCalm);
        // the plume draws in as it rises: the noise is read in plume space, so its columns converge and the tongues lean inward
        float w = mix(mix(0.9, 0.34, pow(y, 0.8)), 0.04 + 0.6 * smoothstep(-0.03, 0.2, y) * (1.0 - 0.94 * smoothstep(0.16, 0.98, y)), vCalm);   // a candle is a teardrop: round at the wick, widest a fifth of the way up
        float xs = (p.x + sway + (n0.a - 0.5) * 0.22 * (1.0 - vCalm)) / w, env = 1.0 - xs * xs;
        // rising turbulence: gas speeds up as it climbs, so the features stretch with height (y^.7) and outrun the base
        float yy = pow(y + 0.03, 0.7);
        vec2 q = vec2(xs * w * 0.42 + xs * 0.12 + vPhase * 1.7, yy * 0.5 - t * 0.46), warp = (n0.gb - 0.5) * 0.19;
        vec4 n1 = texture2D(tNoise, q + warp), n2 = texture2D(tNoise, q * 2.7 + warp * 2.3 + vec2(0.37, -t * 0.5));
        float turb = n1.r * 0.5 + n1.b * 0.22 + n2.a * 0.28;                // big billows, filaments, fine breakup
        // heat: full across the fuel bed, falling with height; the turbulence eats it more and more on the way up, so the
        // base is a solid bed, the middle splits into tongues and the top is licks that pinch off and burn out
        float heat = mix(pow(max(env, 0.0), 0.8) * (1.0 - y * 0.72), env * (1.0 - y * 0.55), vCalm);
        float f = heat * mix(1.25, 1.7, vCalm) + (turb - 0.54) * (0.45 + 3.1 * y) * erode * mix(1.0, 0.22, vCalm) - y * mix(0.5, 0.0, vCalm);
        float yb = (0.1 * xs * xs + (n1.a - 0.5) * 0.07) * (1.0 - vCalm);                            // the bed is round: its near edge dips, the sides lift
        yb = max(yb, 0.0); float a = smoothstep(0.0, 0.16, f) * smoothstep(yb, yb + mix(0.2, 0.07, vCalm), p.y) * smoothstep(-0.05, 0.3, env) * smoothstep(1.0, 0.82, y) * vA * softFade(vSoftR, 0.15); if (a < 0.008) discard;
        // colour by temperature, in light units the bloom and the tone map work on: a thin dark red skin, orange, a
        // yellow body and a near-white core low in the flame (the hottest gas is just above the fuel); tips stay red-orange
        float dd = clamp(f * 0.5 + (n2.b - 0.45) * 0.3 + (n1.r - 0.5) * 0.25, 0.0, 1.0) * mix(0.6, 1.0, smoothstep(0.0, 0.16, p.y - yb)), low = smoothstep(0.85, 0.15, y);
        vec3 col = mix(vec3(0.38, 0.03, 0.0), vec3(1.3, 0.28, 0.02), smoothstep(0.0, 0.3, dd));
        col = mix(col, vec3(2.0, 0.8, 0.08), smoothstep(0.3, 0.75, dd) * (0.45 + 0.55 * low));
        col = mix(col, vec3(2.6, 1.7, 0.5), smoothstep(0.72, 1.0, dd) * low * (0.35 + 0.65 * vHot) * core);
        col = mix(col, vec3(0.25, 0.45, 1.2), (1.0 - vHot) * smoothstep(0.2, 0.02, p.y) * 0.75);   // a candle's blue base
        // premultiplied: the thick body covers what is behind it (overlapping cards saturate instead of summing to a
        // white blob), the thin skin and the tips are mostly added light with a little soot
        float op = a * alpha * mix(0.3, 0.92, smoothstep(0.0, 0.6, dd));
        gl_FragColor = vec4(col * gain * (0.75 + 0.25 * vHot) * (0.55 + 0.5 * fk) * op, op * soot * mix(0.25, 1.0, dd));
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
    vertexShader: /* glsl */`attribute vec3 at, seed; attribute float size; uniform float time, px, fade; varying float vA, vT, vSeed, vFog, vSoftR; varying vec2 vUv2;
      ${GLSL_BILLBOARD} ${SOFT_VERT}
      void main(){ float dur = 3.2 + 2.8 * seed.y, t = fract(time / dur + seed.x), ph = seed.z * 6.2832;
        vec3 w = at + vec3(sin(time * 0.5 + ph) * size * 0.35 * t + sin(ph) * size * 0.2, t * size * (2.6 + 1.6 * seed.z), cos(time * 0.4 + ph) * size * 0.35 * t + cos(ph) * size * 0.2);
        float s = size * (0.55 + 1.9 * t);
        vec4 mv = modelViewMatrix * vec4(w, 1.0); float d = max(10.0, -mv.z); mv.xy += position.xy * s - vec2(0.0, s * 0.5);
        vA = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.15, t) * smoothstep(fade, fade * 0.3, d) * smoothstep(15.0, 70.0, d);
        vT = t; vSeed = seed.z; vFog = d; vUv2 = uv; vSoft = softMat * mv; vSoftR = clamp(s * 0.3, 8.0, 90.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform vec3 fogColor; uniform float fogDensity, time, flash, smokeK; uniform sampler2D tNoise; varying float vA, vT, vSeed, vFog, vSoftR; varying vec2 vUv2;
      ${SOFT_FRAG}
      void main(){ vec2 p = (vUv2 - 0.5) * 2.0; float r = length(p);
        // a puff is a billow, not a disc: two noise scales break its edge and thin its inside, turning slowly as it rises
        vec2 o = vec2(vSeed * 3.1, vSeed * 7.3 - time * 0.035);
        vec4 n = texture2D(tNoise, p * 0.21 + o), n2 = texture2D(tNoise, p * 0.55 + o * 1.7 + (n.rg - 0.5) * 0.12);
        float dens = smoothstep(1.0, 0.1, r + (n.r - 0.5) * 1.0 + (n2.a - 0.5) * 0.4) * (0.55 + 0.45 * n2.r) * smoothstep(1.0, 0.72, r);
        float a = dens * vA * 0.5 * smokeK * softFade(vSoftR, 0.0); if (a < 0.004) discard;
        float f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog), young = (1.0 - vT) * (1.0 - vT) * (1.0 - vT);
        // soot grey, a little lighter where it is thin; lit warm from underneath only while it is young and close to the fire
        vec3 col = mix(vec3(0.028, 0.027, 0.03), vec3(0.1, 0.095, 0.09), n.g * (1.0 - dens * 0.5)) + vec3(0.5, 0.17, 0.03) * young * smoothstep(0.7, -0.7, p.y) * 0.55 + flash * vec3(0.1, 0.12, 0.15);
        gl_FragColor = vec4(mix(col, fogColor, f), a * (1.0 - f * 0.6));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });

  const glowMat = new THREE.ShaderMaterial({ ...common, blending: THREE.AdditiveBlending, uniforms: u,
    vertexShader: /* glsl */`attribute vec3 at; attribute vec3 gl;   // gl: size, phase, hot
      uniform float fade; varying float vA, vPhase, vHot, vSoftR; varying vec2 vUv2;
      ${GLSL_BILLBOARD} ${SOFT_VERT}
      void main(){ vec4 mv = modelViewMatrix * vec4(at, 1.0); float d = max(10.0, -mv.z); mv.xy += position.xy * gl.x - vec2(0.0, gl.x * 0.5);
        vA = smoothstep(fade, fade * 0.3, d) * smoothstep(25.0, 110.0, d); vPhase = gl.y; vHot = gl.z; vUv2 = uv; vSoft = softMat * mv; vSoftR = clamp(gl.x * 0.3, 8.0, 80.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float time, glowK; varying float vA, vPhase, vHot, vSoftR; varying vec2 vUv2;
      ${GLSL_FLICKER} ${SOFT_FRAG}
      void main(){ vec2 p = (vUv2 - 0.5) * 2.0; float r = length(p * vec2(1.0, 0.85)); if (r > 1.0) discard;
        float a = pow(1.0 - r, 2.6) * vA * (0.75 + 0.25 * flicker(time, vPhase)) * 0.16 * glowK * (0.5 + 0.5 * vHot) * softFade(vSoftR, 0.1);
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
    u.time.value += dt; softCheck();
    u.px.value = renderer.getPixelRatio() * (renderer.getSize(size2).y / 900);
    if (fog) { u.fogColor.value.copy(fog.color); u.fogDensity.value = fog.density ?? 0; }
    u.flash.value = flash;
  }
  const state = () => ({ fires: fires.length, flames: layers.flames.geometry.instanceCount, embers: layers.embers.geometry.instanceCount, smoke: layers.smoke.geometry.instanceCount, glow: layers.glow.geometry.instanceCount });
  return { add, build, update, fires, state, layers, uniforms: u, flicker: (f, t = u.time.value) => fireFlicker(t, f.seed) };
}

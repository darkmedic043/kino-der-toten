// Soft particles: a smoke, flame or glow sprite fades out where it nears the solid scene behind it, so it no longer
// ends in a hard line where its card cuts through a floor, wall or body.
//
// A sprite can't read the depth buffer it is being drawn into, so the lighting mod's post chain (post-fx.js) keeps a
// half-size copy of the LAST frame's scene depth (view distance, in units) in `tSoft`. The sprite's vertex shader carries
// its view-space position through `softMat` (this frame's view space → last frame's clip space), so the depth is read
// at the pixel the point was on a frame ago and compared with its distance then: a turning or strafing camera costs
// nothing, only a moving object lags by one frame. Low graphics has no post chain: `softOn` stays 0, sprites draw as before.
//
//   shader:   uniforms: { ...softUniforms() }
//             vertex    ${SOFT_VERT}  …  vSoft = softMat * mv;          (mv = the vertex in view space)
//             fragment  ${SOFT_FRAG}  …  a *= softFade(range, bias);    (range in units; bias 0-1 keeps a card centred
//                                                                        on a surface from fading out at its middle)
//   sprite:   softSprite(spriteMaterial, {k, min, max, bias})           (range = sprite size * k, clamped)
//   each frame, from any user: softCheck()  (drops the fade when the copy has gone stale, e.g. after a switch to Low)
//   kino.soft = { enabled, stamp }: enabled=false for an A/B
import * as THREE from 'three';

const K = globalThis.window ? (window.kino ??= {}) : {};
export const softU = { tSoft: { value: null }, softMat: { value: new THREE.Matrix4() }, softOn: { value: 0 } };
export const soft = K.soft ??= { enabled: true, stamp: 0 };
export const softUniforms = () => ({ tSoft: softU.tSoft, softMat: softU.softMat, softOn: softU.softOn });
export const softCheck = (now = performance.now()) => { if (softU.softOn.value && (now - soft.stamp > 250 || !soft.enabled)) softU.softOn.value = 0; };

export const SOFT_VERT = /* glsl */`uniform mat4 softMat; varying vec4 vSoft;`;
export const SOFT_FRAG = /* glsl */`uniform sampler2D tSoft; uniform float softOn; varying vec4 vSoft;
  float softFade(float range, float bias){ if (softOn < 0.5 || vSoft.w <= 0.0) return 1.0;
    vec2 suv = vSoft.xy / vSoft.w * 0.5 + 0.5; if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) return 1.0;
    float f = clamp((texture2D(tSoft, suv).r - vSoft.w) / max(range, 0.01) + bias, 0.0, 1.0); return f * f * (3.0 - 2.0 * f); }`;

/** three's SpriteMaterial with the fade: range = the sprite's size * k, clamped to [min, max] units. */
export function softSprite(material, { k = .12, min = 1.5, max = 16, bias = .3 } = {}) {
  const f = n => n.toFixed(3);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, softUniforms());
    shader.vertexShader = shader.vertexShader.replace('void main() {', `${SOFT_VERT} varying float vSoftR;\nvoid main() {`)
      .replace('gl_Position = projectionMatrix * mvPosition;', `gl_Position = projectionMatrix * mvPosition; vSoft = softMat * mvPosition; vSoftR = clamp(max(scale.x, scale.y) * ${f(k)}, ${f(min)}, ${f(max)});`);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${SOFT_FRAG} varying float vSoftR;\nvoid main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n\tdiffuseColor.a *= softFade(vSoftR, ${f(bias)});`);
  };
  material.customProgramCacheKey = () => `soft:${f(k)},${f(min)},${f(max)},${f(bias)}`;
  return material;
}

// Colour grade and film look: the last pass of the lighting mod's composer (2026-10-22).
//
// Replaces three's OutputPass. Does the same tone mapping (the renderer's, ACES at the
// renderer's exposure) and sRGB conversion, and in between shapes the picture the way
// Black Ops 3 / 7 do: crushed blacks and an S-curve, cool shadows against warm highlights
// (split toning), vibrance, a vignette, a little chromatic aberration at the edges, a
// sharpen and fine film grain. The viewmodel is drawn inside the composer (ViewmodelPass)
// so the gun is graded, bloomed and vignetted with the world as in the real games.
//
// Presets per map in GRADES (merged over `default`, then the map entry's `grade`), scaled by
// Settings → Film look (Off / Light / Full) and Film grain. Live tuning: kino.post.set({...}).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Every knob at its neutral value (the picture ACES + sRGB would give on their own).
export const NEUTRAL={
  exposure:1,       // multiplies the HDR frame before tone mapping (the renderer's exposure stays the lighting's)
  black:0,          // crushed blacks: sRGB level remapped to 0 (0.03 = 3%)
  contrast:1,       // S-curve strength in perceptual space (1 = none, 1.3 = strong)
  saturation:1, vibrance:0,   // vibrance boosts the dull colours more than the vivid ones
  warmth:0,         // >0 warmer, <0 cooler (white balance shift)
  shadowTint:[1,1,1], highlightTint:[1,1,1],   // split toning, multiplicative, weighted by luminance
  vignette:0, vignetteSoft:.55,
  bloom:1,          // multiplies the composer's bloom strength (lamps and glows)
  chroma:0,         // chromatic aberration, quartic falloff from the centre (corner offset ≈ chroma * 0.5 uv; .0015 ≈ 1 px at 1600 wide)
  sharpen:0,        // unsharp mask strength
  grain:0,          // film grain amplitude in sRGB (0.04 is visible, 0.02 subtle)
  haze:[0,0,0], hazeDensity:0, hazeStart:0,   // depth haze (aerial perspective) in HDR, before AO and bloom
};

// The look. Shadows lean cold and highlights warm on every map (BO3's standard grade); the
// maps then push it their own way: the castle colder and hazier, the theatre dusty and amber,
// Moon harsh with heavier aberration, the factory grey-green steel.
export const GRADES={
  default:{black:.04,contrast:1.3,saturation:1.04,vibrance:.3,shadowTint:[.84,.92,1.16],highlightTint:[1.12,1.03,.9],vignette:.46,chroma:.0015,sharpen:.25,grain:.03,bloom:1.25},
  kino:{exposure:.96,black:.035,contrast:1.3,shadowTint:[.84,.92,1.1],highlightTint:[1.14,1.04,.86],vibrance:.3,warmth:.02,bloom:1.35},
  'der-eisendrache':{exposure:.86,black:.045,contrast:1.34,saturation:.98,vibrance:.34,shadowTint:[.76,.87,1.22],highlightTint:[1.14,1.03,.88],vignette:.5,bloom:1.4,haze:[.06,.08,.12],hazeDensity:.00022,hazeStart:400},
  moon:{exposure:.95,black:.045,contrast:1.34,saturation:.92,vibrance:.22,shadowTint:[.82,.9,1.16],highlightTint:[1.06,1.03,.98],vignette:.52,chroma:.003,grain:.034},
  'the-giant':{exposure:.92,black:.045,contrast:1.32,saturation:.94,vibrance:.3,shadowTint:[.82,.94,1.08],highlightTint:[1.12,1.04,.9],vignette:.46,bloom:1.3,haze:[.05,.06,.07],hazeDensity:.0002,hazeStart:300},
  nuketown:{exposure:1,black:.02,contrast:1.18,saturation:1,vibrance:.25,shadowTint:[.94,1,1.06],highlightTint:[1.02,1.02,.98],vignette:.4,bloom:1.45,grain:.04,haze:[.052,.072,.078],hazeDensity:.00026,hazeStart:250},   // UGX Nuketown Remastered: teal-grey overcast, thick haze (mods/nuketown/atmosphere.js)
  'cheese-cube':{vignette:.32,contrast:1.18,black:.025},
  sandbox:{vignette:.32,contrast:1.18,black:.025},
};

const lerp=(a,b,t)=>a+(b-a)*t;
// The grade for a map entry at a strength (0 none, .5 Light, 1 Full), grain on/off.
export function gradeFor(entry,strength=1,grain=true){
  const g={...NEUTRAL,...GRADES.default,...(GRADES[entry?.id]??{}),...(entry?.grade??{})};
  if(!grain)g.grain=0;
  const out={};
  for(const k in NEUTRAL){const n=NEUTRAL[k],v=g[k];out[k]=Array.isArray(n)?n.map((x,i)=>lerp(x,v[i],strength)):lerp(n,v,strength);}
  out.vignetteSoft=g.vignetteSoft;return out;
}

const VERT=/* glsl */`precision highp float;
uniform mat4 modelViewMatrix,projectionMatrix;attribute vec3 position;attribute vec2 uv;varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const FRAG=/* glsl */`precision highp float;
uniform sampler2D tDiffuse;uniform vec2 texel;uniform float time;
uniform float exposure,black,contrast,saturation,vibrance,warmth,vignette,vignetteSoft,chroma,sharpen,grain;
uniform vec3 shadowTint,highlightTint;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
const vec3 LUM=vec3(.2126,.7152,.0722);
vec3 tone(vec3 c){
  #ifdef LINEAR_TONE_MAPPING
    return LinearToneMapping(c);
  #elif defined(REINHARD_TONE_MAPPING)
    return ReinhardToneMapping(c);
  #elif defined(CINEON_TONE_MAPPING)
    return CineonToneMapping(c);
  #elif defined(ACES_FILMIC_TONE_MAPPING)
    return ACESFilmicToneMapping(c);
  #elif defined(AGX_TONE_MAPPING)
    return AgXToneMapping(c);
  #elif defined(NEUTRAL_TONE_MAPPING)
    return NeutralToneMapping(c);
  #else
    return c;
  #endif
}
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
void main(){
  vec2 uv=vUv,d=uv-.5;float r2=dot(d,d);
  // chromatic aberration: red and blue pulled apart radially, growing towards the corners
  vec2 off=d*chroma*r2*r2*16.;
  vec3 c=vec3(texture2D(tDiffuse,uv+off).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-off).b);
  // unsharp mask on the HDR frame (clamped so bright lamps don't ring)
  if(sharpen>0.){
    vec3 n=texture2D(tDiffuse,uv+vec2(0.,texel.y)).rgb+texture2D(tDiffuse,uv-vec2(0.,texel.y)).rgb+texture2D(tDiffuse,uv+vec2(texel.x,0.)).rgb+texture2D(tDiffuse,uv-vec2(texel.x,0.)).rgb;
    vec3 e=clamp(min(c,vec3(4.))-min(n*.25,vec3(4.)),-.5,.5);c=max(c+e*sharpen,0.);
  }
  c=tone(c*exposure);
  // white balance, split toning (cold shadows / warm highlights), vibrance and saturation, in display-linear
  c*=vec3(1.+warmth,1.,1.-warmth);
  float l=dot(c,LUM);
  c*=mix(vec3(1.),shadowTint,1.-smoothstep(0.,.45,l));
  c*=mix(vec3(1.),highlightTint,smoothstep(.25,1.,l));
  l=dot(c,LUM);float sat=max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b);
  c=mix(vec3(l),c,saturation+vibrance*(1.-min(sat*1.5,1.)));
  // vignette (BO3's is wide and soft)
  float v=1.-smoothstep(.35,.35+vignetteSoft,sqrt(r2)*1.15);c*=mix(1.,v,vignette);
  // to sRGB, then the curve: crushed blacks and a cubic S around mid grey (keeps 0 and 1 in place)
  c=sRGBTransferOETF(vec4(max(c,0.),1.)).rgb;
  c=max((c-black)/(1.-black),0.);
  // S-curve; the shadow half pulls at 70% so dark rooms keep their detail (the theatre lost it at full strength)
  c+=(contrast-1.)*mix(vec3(.7),vec3(1.),step(.5,c))*(c-.5)*(1.-4.*(c-.5)*(c-.5));
  // fine grain, heavier in the shadows
  if(grain>0.){float n=hash(gl_FragCoord.xy+fract(time*vec2(7.13,3.71))*1e3)-.5;c+=n*grain*mix(1.6,.5,l);}
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

export class GradePass extends Pass{
  constructor(){
    super();
    this.uniforms={tDiffuse:{value:null},toneMappingExposure:{value:1},texel:{value:new THREE.Vector2(1/1600,1/900)},time:{value:0},
      exposure:{value:1},black:{value:0},contrast:{value:1},saturation:{value:1},vibrance:{value:0},warmth:{value:0},vignette:{value:0},vignetteSoft:{value:.55},chroma:{value:0},sharpen:{value:0},grain:{value:0},
      shadowTint:{value:new THREE.Vector3(1,1,1)},highlightTint:{value:new THREE.Vector3(1,1,1)}};
    this.material=new THREE.RawShaderMaterial({name:'GradePass',uniforms:this.uniforms,vertexShader:VERT,fragmentShader:FRAG});
    this.quad=new FullScreenQuad(this.material);this._tm=null;this.grade={...NEUTRAL};
  }
  set(g){
    Object.assign(this.grade,g);const u=this.uniforms,G=this.grade;
    for(const k of ['exposure','black','contrast','saturation','vibrance','warmth','vignette','vignetteSoft','chroma','sharpen','grain'])u[k].value=G[k];
    u.shadowTint.value.fromArray(G.shadowTint);u.highlightTint.value.fromArray(G.highlightTint);
  }
  setSize(w,h){this.uniforms.texel.value.set(1/Math.max(1,w),1/Math.max(1,h));}
  render(renderer,writeBuffer,readBuffer){
    const u=this.uniforms;u.tDiffuse.value=readBuffer.texture;u.time.value=(performance.now()/1000)%1000;
    if(this._tm!==renderer.toneMapping){this._tm=renderer.toneMapping;const d={};
      const T=THREE;d[{[T.LinearToneMapping]:'LINEAR_TONE_MAPPING',[T.ReinhardToneMapping]:'REINHARD_TONE_MAPPING',[T.CineonToneMapping]:'CINEON_TONE_MAPPING',[T.ACESFilmicToneMapping]:'ACES_FILMIC_TONE_MAPPING',[T.AgXToneMapping]:'AGX_TONE_MAPPING',[T.NeutralToneMapping]:'NEUTRAL_TONE_MAPPING'}[this._tm]??'NO_TONE_MAPPING']='';
      this.material.defines=d;this.material.needsUpdate=true;}
    u.toneMappingExposure.value=renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);
    if(!this.renderToScreen&&this.clear)renderer.clear();
    this.quad.render(renderer);
  }
  dispose(){this.material.dispose();this.quad.dispose();}
}

// Depth haze (aerial perspective) folded into the first swap pass of the chain, where the
// read buffer still holds the scene's depth: far surfaces fade towards a tint, which gives
// the big rooms and the valley their layers. Also the HDR sanitiser (NaN/Inf → black, clamp),
// which used to be its own pass.
export const HAZE_SHADER={
  uniforms:{tDiffuse:{value:null},tDepth:{value:null},cameraNear:{value:1},cameraFar:{value:1000},haze:{value:new THREE.Vector3()},hazeDensity:{value:0},hazeStart:{value:0}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:/* glsl */`uniform sampler2D tDiffuse,tDepth;uniform float cameraNear,cameraFar,hazeDensity,hazeStart;uniform vec3 haze;varying vec2 vUv;
#include <packing>
void main(){vec4 c=texture2D(tDiffuse,vUv);if(any(isnan(c))||any(isinf(c)))c=vec4(0.,0.,0.,1.);c.rgb=min(c.rgb,vec3(48.));
  if(hazeDensity>0.){float z=-perspectiveDepthToViewZ(texture2D(tDepth,vUv).x,cameraNear,cameraFar);
    float f=1.-exp(-max(z-hazeStart,0.)*hazeDensity);c.rgb=mix(c.rgb,haze,f*(1.-step(cameraFar*.98,z)*.6));}   // the sky (at far) takes less, it is already its own colour
  gl_FragColor=c;}`};

// Draws the first-person weapon into the frame before bloom and the grade, so it gets both.
export class ViewmodelPass extends Pass{
  constructor(viewScene,viewCamera){super();this.viewScene=viewScene;this.viewCamera=viewCamera;this.needsSwap=false;this.enabled=true;}
  render(renderer,writeBuffer,readBuffer){
    const old=renderer.getRenderTarget(),ac=renderer.autoClear;
    renderer.setRenderTarget(readBuffer);renderer.autoClear=false;renderer.clearDepth();
    renderer.render(this.viewScene,this.viewCamera);
    renderer.setRenderTarget(old);renderer.autoClear=ac;
  }
}

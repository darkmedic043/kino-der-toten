// Real light shafts (2026-11-17): light scattered by the air, cut by whatever blocks it. For each registered
// shadow-casting light the pass walks every pixel's view ray up to the scene depth and asks the light's own shadow map,
// step by step, whether that point of air is lit; the lit steps add up to the glow you see. A wall, a prop, a zombie or a
// player in the light's shadow map cuts a dark gap into the beam, and a window lets a beam through into a dark room. The
// beam cones (beamCone in mod.js) are placed by hand or by a bake and nothing can block them; these need no placement.
//
// Drawn at half resolution into the volumetric pass's target (mod.js VolumetricPass), added onto the frame before AO and
// bloom. One program for both light kinds (sun: orthographic map; spot: perspective map, cone and range falloff). It
// reads light.shadow.map.depthTexture as a sampler2DShadow (three's PCF shadow maps carry a compare function), so a
// light only shows shafts while it casts shadows. Its own ShaderMaterial: no lit shader changes.
//
//   kino.shafts.add(light, { strength, density, g, far, dust, lift, sky, indoor, white })   register (mods do it for their sun)
//   kino.shafts.remove(light)
//   kino.shafts.lights        the entries: tune strength/density/g/far/dust live
//   kino.shafts.scale         overall strength, set from the graphics quality by the pass (High and Ultra: 1)
//   kino.shafts.enabled       false = no shafts (for a before/after look)
//   kino.shafts.steps         samples a ray (changing it recompiles the pass: settings only)
//
//   strength  brightness of a fully lit ray                 density  extinction per unit (how fast distant air fades)
//   g         forward scattering: 0 even, 0.8 = a strong glow toward the light
//   far       how far along the view ray the air is sampled  dust     0..1 slow drifting unevenness
//   lift      0 = plain physics; above it a ray that is mostly in shadow (a window's shaft across a room) is raised
//             toward a fully lit one, which itself stays as it is (4: a ray a tenth lit shows a third of full)
//   sky       share of the glow kept in front of the sky (an outdoor map keeps its sky's mood)
//   indoor    a sun's shafts are this many times stronger while the camera stands in its shadow (the eye adapted to
//             the dark): an outdoor map can keep open ground subtle and still show beams inside (1 = off)
//   white     0..1: how far the air's colour is pulled from the light's own colour toward grey (lit haze is paler
//             than the surfaces the light hits)
//   strength  is the colour a fully lit endless ray adds, times the light's own colour and intensity: keep it small
//             (about 0.015 for an outdoor sun of intensity 2), or open ground washes out
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// The vertex stage works out how much of the air around the camera the light reaches (32 points within 170 units): in
// the shade the eye has adapted to the dark, and the shafts show `indoor` times stronger than out in the open.
const VERT = `
precision highp sampler2DShadow;
uniform sampler2DShadow shadowMap; uniform mat4 shadowMatrix; uniform vec3 camPos; uniform vec4 spot; uniform float indoor, bias; varying vec2 vUv; varying float vAdapt;
void main(){
  vUv=uv;gl_Position=vec4(position.xy,0.,1.);vAdapt=1.;
  if(spot.x<.5&&indoor!=1.){
    float sum=0.;
    for(int i=0;i<32;i++){
      float a=float(i)*2.39996,r=170.*sqrt((float(i)+.5)/32.);
      vec4 q=shadowMatrix*vec4(camPos+vec3(cos(a)*r,mod(float(i),4.)*18.,sin(a)*r),1.);vec3 sc=q.xyz/q.w;
      sum+=sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z<1.?texture(shadowMap,vec3(sc.xy,sc.z-bias)):1.;
    }
    vAdapt=mix(indoor,1.,sum/32.);
  }
}`;
const FRAG = `
precision highp sampler2DShadow;
varying float vAdapt;
uniform sampler2D depthTex; uniform sampler2DShadow shadowMap; uniform mat4 shadowMatrix, invPV;
uniform vec3 camPos, lightColor, lightPos, lightDir; uniform vec4 spot, medium; uniform vec2 shape; uniform float time, bias; varying vec2 vUv;
float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float phase(float c,float g){float d=1.+g*g-2.*g*c;return (1.-g*g)/(d*sqrt(d));}
void main(){
  float d=texture2D(depthTex,vUv).x;
  vec4 w=invPV*vec4(vUv*2.-1.,d*2.-1.,1.);vec3 ray=w.xyz/w.w-camPos;float sceneT=length(ray);vec3 rd=ray/sceneT;
  float t0=0.,t1=d>=1.?medium.z:min(sceneT,medium.z);
  if(spot.x>.5){vec3 oc=camPos-lightPos;float b=dot(oc,rd),h=b*b-dot(oc,oc)+spot.w*spot.w;if(h<=0.)discard;h=sqrt(h);t0=max(t0,-b-h);t1=min(t1,-b+h);}
  if(t1<=t0)discard;
  float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))+time*.61803);
  float span=1.-exp(-(t1-t0)*medium.x),acc=0.;   // samples are spread by how much each stretch of air shows through: all weigh the same
  for(int i=0;i<STEPS;i++){
    float t=t0-log(1.-(float(i)+jitter)/float(STEPS)*span)/medium.x;vec3 p=camPos+rd*t;
    vec4 s=shadowMatrix*vec4(p,1.);vec3 sc=s.xyz/s.w;float lit=1.;
    if(spot.x>.5){
      vec3 L=p-lightPos;float dist=length(L);L/=dist;float fall=clamp(1.-dist/spot.w,0.,1.);
      lit=smoothstep(spot.y,spot.z,dot(L,lightDir))*fall*fall*phase(dot(-rd,L),medium.y);
      if(lit<=0.||s.w<=0.)continue;
    }
    if(sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z<1.)lit*=texture(shadowMap,vec3(sc.xy,sc.z-bias));
    acc+=lit;
  }
  float dust=1.;
  if(medium.w>0.){vec3 q=camPos+rd*mix(t0,t1,.35);dust=mix(1.,.55+.9*noise(q*.012+vec3(0.,time*.04,time*.02))*noise(q*.04-vec3(time*.03,0.,0.))*1.6,medium.w);}
  float ph=spot.x>.5?1.:phase(dot(-rd,lightDir),medium.y);
  // m: the lit share of the air this ray shows. shape.x lifts a mostly shadowed ray (a window's shaft across a room) toward
  // a fully lit one without changing their order; shape.y is the share kept in front of the sky
  float m=acc/float(STEPS);m=m*(1.+shape.x)/(1.+shape.x*m);
  gl_FragColor=vec4(lightColor*m*span*exp(-t0*medium.x)*ph*dust*vAdapt*(d>=1.?shape.y:1.),1.);
}`;

export function createShafts() {
  const lights = [], _v = new THREE.Vector3(), _t = new THREE.Vector3();
  let steps = 28, quad = null, warmed = false, warmRT = null;
  const make = () => new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, defines: { STEPS: steps },
    uniforms: { depthTex: { value: null }, shadowMap: { value: null }, shadowMatrix: { value: new THREE.Matrix4() }, invPV: { value: new THREE.Matrix4() },
      camPos: { value: new THREE.Vector3() }, lightColor: { value: new THREE.Color() }, lightPos: { value: new THREE.Vector3() }, lightDir: { value: new THREE.Vector3(0, -1, 0) },
      spot: { value: new THREE.Vector4() }, shape: { value: new THREE.Vector2(0, 1) }, medium: { value: new THREE.Vector4(.001, .6, 2000, 0) }, time: { value: 0 }, bias: { value: .0015 }, indoor: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG });
  const api = {
    lights, scale: 1, enabled: true,
    get steps() { return steps; }, set steps(n) { n = Math.max(8, Math.min(64, Math.round(n))); if (n === steps) return; steps = n; quad?.material.dispose(); quad = null; warmed = false; },
    add(light, o = {}) {
      let e = lights.find(e => e.light === light);
      if (!e) lights.push(e = { light, strength: .015, density: .0015, g: .3, far: 2600, dust: .35, lift: 5, sky: .35, indoor: 1, white: .4, on: true });
      return Object.assign(e, o);
    },
    covers(light) { const e = lights.find(e => e.light === light); return !!e && api.enabled && e.on && e.strength > 0 && light.castShadow && light.intensity > 0; },   // this light's shafts are being drawn
    remove(light) { const i = lights.findIndex(e => e.light === light); if (i >= 0) lights.splice(i, 1); },
    // the lights to draw this frame: every sun, and the two nearest spots
    active(cam) {
      if (!api.enabled || !(api.scale > 0)) return [];
      const out = [], sp = [];
      for (const e of lights) {
        const l = e.light;
        if (!e.on || !(e.strength > 0) || !l.castShadow || !l.visible || !(l.intensity > 0) || !l.shadow?.map?.depthTexture || !l.parent) continue;
        if (l.isSpotLight) { e.d = l.getWorldPosition(_v).distanceTo(cam.getWorldPosition(_t)); if (e.d < (l.distance || 1500) * 1.5) sp.push(e); } else if (l.isDirectionalLight) out.push(e);
      }
      sp.sort((a, b) => a.d - b.d);
      return out.concat(sp.slice(0, 2));
    },
    needsWarm() { return !warmed; },
    // draws into the render target the caller has bound (autoClear off); list = active(cam)
    render(renderer, list, depthTexture, cam, time) {
      quad ??= new FullScreenQuad(make());
      const m = quad.material, u = m.uniforms;
      u.depthTex.value = depthTexture; u.time.value = time; u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
      u.invPV.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
      if (!warmed) {   // compiled behind the loading screen, against a 1x1 depth texture of the shadow maps' kind
        warmed = true;
        if (!warmRT) { warmRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: Object.assign(new THREE.DepthTexture(1, 1), { compareFunction: THREE.LessEqualCompare }) }); const rt = renderer.getRenderTarget(); renderer.initRenderTarget(warmRT); renderer.setRenderTarget(rt); }
        u.shadowMap.value = warmRT.depthTexture; u.lightColor.value.setScalar(0); u.spot.value.set(0, 0, 0, 1); m.uniformsNeedUpdate = true; quad.render(renderer);
      }
      for (const e of list) {
        const l = e.light;
        u.shadowMap.value = l.shadow.map.depthTexture; u.shadowMatrix.value.copy(l.shadow.matrix);
        const c = u.lightColor.value.copy(l.color), y = .2126 * c.r + .7152 * c.g + .0722 * c.b; c.r += (y - c.r) * e.white; c.g += (y - c.g) * e.white; c.b += (y - c.b) * e.white; c.multiplyScalar(l.intensity * e.strength * api.scale);
        u.lightPos.value.setFromMatrixPosition(l.matrixWorld); u.lightDir.value.setFromMatrixPosition(l.target.matrixWorld).sub(u.lightPos.value).normalize();
        if (l.isSpotLight) { const c = Math.cos(l.angle); u.spot.value.set(1, c, Math.cos(l.angle * (1 - l.penumbra)) + 1e-4, l.distance || 1500); u.bias.value = .0006; }
        else { u.spot.value.set(0, 0, 0, 1); u.bias.value = .0015; }
        u.medium.value.set(e.density, e.g, e.far, e.dust); u.shape.value.set(e.lift, e.sky); u.indoor.value = l.isSpotLight ? 1 : e.indoor;
        m.uniformsNeedUpdate = true; quad.render(renderer);
      }
    },
    dispose() { quad?.dispose(); warmRT?.dispose(); quad = warmRT = null; warmed = false; },
  };
  return api;
}

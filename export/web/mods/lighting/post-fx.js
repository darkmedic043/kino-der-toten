// Post effects that read the frame's depth (fork, 2026-11-19): camera motion blur, depth of field while aiming and
// screen-space reflections on water and wet floors. Each is a composer pass the lighting mod adds to its chain
// (mods/lighting/mod.js setupPost); none touches the lit materials, so they cost no shader rebuild of the map.
//
//   scene -> beams -> haze -> [reflections] -> AO -> [motion blur] -> viewmodel -> [depth of field] -> bloom -> grade
//
// The composer's two buffers both carry a depth texture and the scene's depth sits in the one the haze pass read
// (track() notes it). A pass may not draw into a buffer whose depth it samples, so each effect draws into its own
// target and is then copied (or blended) onto the frame. A pass that has nothing to do this frame returns at once:
// motion blur while the camera is still, depth of field while not aiming, reflections away from any reflective rule.
//
// Live tuning: kino.postFx.{motion,dof,ssr} are the uniforms, kino.postFx.config the strengths, kino.postFx.stats what
// ran last frame. Reflective surfaces are rules: kino.postFx.addWater({y, rect:[x0,z0,x1,z1], ...}) for a water level
// (the surface need not be in the depth buffer: see-through water isn't) and addFloor({min:[x,y,z], max:[x,y,z], ...})
// for wet or polished ground. A map entry's `reflect: {water:[...], floors:[...]}` adds them at load.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { settings } from '../../settings.js';

const VS = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const IGN = /* glsl */`float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}`;
const mat = (fragmentShader, uniforms, extra) => new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false, ...extra });

// Camera motion blur: each pixel is carried back to where it was on screen a frame ago (its depth, last frame's view
// and projection) and the frame is averaged along that path. `amount` scales the path to a fixed shutter time, so the
// streak is as long at 144 fps as at 60.
const MOTION_FS = /* glsl */`uniform sampler2D tDiffuse,tDepth;uniform mat4 projInv,reproject;uniform float amount,maxLen;uniform vec2 res;varying vec2 vUv;
${IGN}
void main(){
  float d=texture2D(tDepth,vUv).x;vec4 v=projInv*vec4(vUv*2.-1.,d*2.-1.,1.);v/=v.w;
  vec4 pc=reproject*vec4(v.xyz,1.);vec2 vel=pc.w>0.?(vUv-(pc.xy/pc.w*.5+.5))*amount:vec2(0.);
  float l=length(vel);if(l>maxLen)vel*=maxLen/l;
  if(l*res.y<.75){gl_FragColor=texture2D(tDiffuse,vUv);return;}
  float j=ign(gl_FragCoord.xy);vec4 acc=vec4(0.);
  for(int i=0;i<TAPS;i++)acc+=texture2D(tDiffuse,vUv+vel*((float(i)+j)/float(TAPS)-.5));
  gl_FragColor=acc/float(TAPS);}`;

// Depth of field while aiming: the part of the gun close to the eye blurs (its depth is in the buffer the viewmodel
// was just drawn into, in the view camera's projection) and the world softens a little away from the distance the
// crosshair rests on. A sample only counts where its own blur reaches the pixel, so a sharp thing never smears into a
// blurred one, and the blurred gun spreads a soft edge over what is behind it.
const DOF_FS = /* glsl */`#include <packing>
uniform sampler2D tDiffuse,tDepth,tView;uniform float near,far,vNear,vFar,focus,k,worldK,worldMax,gunK,gunSharp,gunNear;uniform vec2 px;varying vec2 vUv;
${IGN}
float coc(vec2 uv){float dv=texture2D(tView,uv).x;
  if(dv<1.){float z=-perspectiveDepthToViewZ(dv,vNear,vFar);return gunK*smoothstep(gunSharp,gunNear,z);}
  float z=-perspectiveDepthToViewZ(texture2D(tDepth,uv).x,near,far);return min(worldMax,worldK*abs(1./z-1./focus));}
void main(){
  vec4 base=texture2D(tDiffuse,vUv);float c=coc(vUv)*k,rad=c,pr=gunK*k*.6;
  rad=max(rad,min(pr,coc(vUv+vec2(pr,pr)*px)*k));rad=max(rad,min(pr,coc(vUv+vec2(-pr,pr)*px)*k));
  rad=max(rad,min(pr,coc(vUv+vec2(pr,-pr)*px)*k));rad=max(rad,min(pr,coc(vUv+vec2(-pr,-pr)*px)*k));
  if(rad<.6){gl_FragColor=base;return;}
  float a=ign(gl_FragCoord.xy)*6.2832;vec4 acc=base;
  for(int i=0;i<TAPS;i++){float r=sqrt((float(i)+.5)/float(TAPS))*rad,th=a+float(i)*2.39996;vec2 uv=vUv+vec2(cos(th),sin(th))*r*px;
    acc+=mix(base,texture2D(tDiffuse,uv),clamp(coc(uv)*k-r+1.,0.,1.));}
  gl_FragColor=acc/float(TAPS+1);}`;

// Screen-space reflections: where a rule says the ground is water or wet, the view ray is mirrored about the surface
// and marched through the depth buffer; what it meets (or the sky it ends on) is laid over the pixel by Fresnel, so a
// surface seen from above shows almost nothing and one seen at a low angle shows the scene beyond it.
const RULES = 8;
const SSR_FS = /* glsl */`#include <packing>
uniform sampler2D tDiffuse,tDepth;uniform mat4 projInv,proj,camWorld,viewM;uniform vec3 camPos;uniform float near,far,time;uniform int count;
uniform vec4 rA[${RULES}],rB[${RULES}],rC[${RULES}];varying vec2 vUv;
${IGN}
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float viewZ(vec2 uv){return perspectiveDepthToViewZ(texture2D(tDepth,uv).x,near,far);}
vec2 toUv(vec3 p){vec4 c=proj*vec4(p,1.);return c.xy/c.w*.5+.5;}
void main(){
  gl_FragColor=vec4(0.);
  float d=texture2D(tDepth,vUv).x;vec4 v4=projInv*vec4(vUv*2.-1.,d*2.-1.,1.);vec3 vp=v4.xyz/v4.w;
  vec3 W=(camWorld*vec4(vp,1.)).xyz,dir=normalize(W-camPos),P=W,N=vec3(0.,1.,0.);float k=0.,f0=.02;
  for(int i=0;i<${RULES};i++){if(i>=count)break;vec4 a=rA[i],b=rB[i],c=rC[i];
    if(b.w<.5){   // water: the level b.x inside the rectangle a, seen from above with the scene's surface under it
      if(camPos.y<=b.x||W.y>b.x+.5||dir.y>-1e-4)continue;
      vec3 q=camPos+dir*((b.x-camPos.y)/dir.y);if(q.x<a.x||q.z<a.y||q.x>a.z||q.z>a.w)continue;
      vec2 s=q.xz*c.y;float t=time;
      vec2 rip=vec2(noise(s+vec2(t*.6,t*.35))-noise(s*1.7-vec2(t*.4,-t*.5)),noise(s.yx+vec2(-t*.5,t*.45))-noise(s.yx*1.6+vec2(t*.3,t*.6)))*c.x;
      P=q;N=normalize(vec3(rip.x,1.,rip.y));k=b.z;f0=c.z;break;}
    if(W.x<a.x||W.z<a.y||W.x>a.z||W.z>a.w||W.y<b.x||W.y>b.y)continue;   // a floor: flat ground inside the box
    vec3 n=mat3(camWorld)*normalize(cross(dFdx(vp),dFdy(vp)));if(n.y<.9)continue;
    float pud=c.w>0.?smoothstep(.5,.64,noise(W.xz*c.w)*.62+noise(W.xz*c.w*2.7+7.3)*.38):1.;if(pud<=0.)continue;
    vec2 s=W.xz*c.y;N=normalize(vec3((noise(s)-.5)*c.x,1.,(noise(s.yx+3.1)-.5)*c.x));k=b.z*pud;f0=c.z;break;}
  if(k<=0.)return;
  vec3 R=reflect(dir,N);R.y=max(R.y,.02);R=normalize(R);
  float fres=f0+(1.-f0)*pow(1.-max(dot(-dir,N),0.),5.);
  vec3 p0=(viewM*vec4(P,1.)).xyz,p=p0,rv=normalize((viewM*vec4(R,0.)).xyz),prev=p;
  float len=STEP0*(.6+.8*ign(gl_FragCoord.xy));vec2 uv=vec2(-1.);bool hit=false,sky=false;
  for(int i=0;i<STEPS;i++){prev=p;p+=rv*len;if(p.z>-near){uv=vec2(-1.);break;}
    uv=toUv(p);if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){uv=vec2(-1.);break;}
    float sd=texture2D(tDepth,uv).x,diff=perspectiveDepthToViewZ(sd,near,far)-p.z;sky=sd>=.99999;
    if(diff>0.&&diff<len*1.6+10.){vec3 lo=prev,hi=p;
      for(int j=0;j<5;j++){vec3 m=(lo+hi)*.5;if(viewZ(toUv(m))-m.z>0.)hi=m;else lo=m;}
      uv=toUv(hi);p=hi;hit=true;break;}
    len*=GROW;}
  if(uv.x<0.||!(hit||sky))return;
  vec2 e=smoothstep(vec2(0.),vec2(.08),uv)*(1.-smoothstep(vec2(.92),vec2(1.),uv));
  float al=clamp(fres*k*e.x*e.y*(hit?smoothstep(3.,22.,distance(p,p0)):1.),0.,1.);gl_FragColor=vec4(min(texture2D(tDiffuse,uv).rgb,vec3(8.))*al,al);}`;

export function createPostFx(api) {
  const { renderer, view, world, enemies, host } = api;
  const K = window.kino ??= {};
  const config = { motion: [0, .3, .55], motionMin: 1.2, teleport: 150, dofGun: 7, dofWorld: 2.4, dofWorldK: 300, gunSharp: 13, gunNear: 3, ssrScale: [0, 0, .5, 1] };
  const stats = { motion: 0, dof: 0, ssr: 0, focus: 0 };
  const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const tmp = rt(), half = rt();
  const COPY = /* glsl */`uniform sampler2D tDiffuse;varying vec2 vUv;void main(){gl_FragColor=texture2D(tDiffuse,vUv);}`;
  const copyQ = new FullScreenQuad(mat(COPY, { tDiffuse: { value: null } }));
  const blendQ = new FullScreenQuad(mat(COPY, { tDiffuse: { value: null } }, { transparent: true, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
  const fit = (t, w, h) => { if (t.width !== w || t.height !== h) t.setSize(w, h); };
  const draw = (r, quad, target) => { const old = r.getRenderTarget(), ac = r.autoClear; r.autoClear = false; r.setRenderTarget(target); quad.render(r); r.setRenderTarget(old); r.autoClear = ac; };
  const back = (r, quad, from, to) => { quad.material.uniforms.tDiffuse.value = from.texture; draw(r, quad, to); };
  let sceneRT = null, cam = api.camera, drawView = false, viewCam = api.viewCamera, time = 0, last = 0, dt = 1 / 60;
  // The buffer the scene pass drew into holds this frame's depth (the composer alternates its two buffers).
  const track = renderPass => { const f = renderPass.render.bind(renderPass); renderPass.render = (r, wb, rb, ...a) => { sceneRT = rb; return f(r, wb, rb, ...a); }; };
  const frame = (c, dv, vc) => { cam = c; drawView = dv; viewCam = vc ?? viewCam; const n = performance.now(); dt = Math.min(.1, Math.max(.002, (n - last) / 1000)); last = n; time += dt; stats.motion = stats.dof = stats.ssr = 0; };

  // ---- motion blur
  const motionU = { tDiffuse: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, reproject: { value: new THREE.Matrix4() }, amount: { value: 0 }, maxLen: { value: .045 }, res: { value: new THREE.Vector2(1, 1) } };
  const motionQ = new FullScreenQuad(mat(MOTION_FS, motionU, { defines: { TAPS: 10 } }));
  const prevVP = new THREE.Matrix4(), prevPos = new THREE.Vector3(), prevQ = new THREE.Quaternion(), curPos = new THREE.Vector3(), curQ = new THREE.Quaternion(), scl = new THREE.Vector3(); let have = false;
  const wantDof = () => settings.dof !== false && drawView && (view?.aim ?? 0) >= .03;
  const motion = new Pass(); motion.needsSwap = false;
  motion.render = (r, wb, rb) => {
    cam.matrixWorld.decompose(curPos, curQ, scl);
    const S = config.motion[Math.round(settings.motionBlur ?? 1)] ?? 0, moved = curPos.distanceTo(prevPos), ang = 2 * Math.acos(Math.min(1, Math.abs(curQ.dot(prevQ))));
    const amount = S * Math.min(2.5, Math.max(.25, (1 / 60) / dt)) * (1 - .5 * (drawView ? view?.aim ?? 0 : 0));
    const px = (ang + moved / 220) * rb.height / (2 * Math.tan((cam.fov ?? 70) * Math.PI / 360)) * amount;
    const on = have && S > 0 && !!sceneRT?.depthTexture && moved < config.teleport && px > config.motionMin;
    if (on) { motionU.tDiffuse.value = rb.texture; motionU.tDepth.value = sceneRT.depthTexture; motionU.projInv.value.copy(cam.projectionMatrixInverse);
      motionU.reproject.value.multiplyMatrices(prevVP, cam.matrixWorld); motionU.amount.value = amount; motionU.res.value.set(rb.width, rb.height); stats.motion = +px.toFixed(1); }
    // At Ultra the AO pass has swapped the frame back onto the buffer that holds the scene's depth, and the viewmodel
    // would clear it. While the depth of field needs both depths, this pass moves the frame (blurred or as it is) to
    // the other buffer and swaps; otherwise it blurs in place through its own target.
    motion.needsSwap = sceneRT === rb && wantDof();
    if (motion.needsSwap) { if (on) draw(r, motionQ, wb); else back(r, copyQ, rb, wb); }
    else if (on) { fit(tmp, rb.width, rb.height); draw(r, motionQ, tmp); back(r, copyQ, tmp, rb); }
    prevVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); prevPos.copy(curPos); prevQ.copy(curQ); have = true;
  };

  // ---- depth of field while aiming
  const dofU = { tDiffuse: { value: null }, tDepth: { value: null }, tView: { value: null }, near: { value: 1 }, far: { value: 1000 }, vNear: { value: .01 }, vFar: { value: 200 }, focus: { value: 600 },
    k: { value: 0 }, worldK: { value: config.dofWorldK }, worldMax: { value: config.dofWorld }, gunK: { value: config.dofGun }, gunSharp: { value: config.gunSharp }, gunNear: { value: config.gunNear }, px: { value: new THREE.Vector2() } };
  const dofQ = new FullScreenQuad(mat(DOF_FS, dofU, { defines: { TAPS: 16 } }));
  const ray = new THREE.Ray(); let focus = 600;
  const dof = new Pass(); dof.needsSwap = false;
  dof.render = (r, wb, rb) => {
    const aim = drawView ? view?.aim ?? 0 : 0;
    if (!wantDof() || !sceneRT?.depthTexture || !rb.depthTexture || sceneRT === rb) return;
    // what the crosshair rests on: the nearer of the map and a zombie, eased so the focus doesn't snap between them
    ray.origin.setFromMatrixPosition(cam.matrixWorld); ray.direction.set(0, 0, -1).transformDirection(cam.matrixWorld);
    let want = 4000; try { want = Math.min(want, world?.collision?.raycastFirst?.(ray, 1, 4000)?.distance ?? 4000, enemies?.rayHit?.(ray, 4000)?.distance ?? 4000); } catch { }
    focus *= Math.pow(Math.max(40, want) / focus, 1 - Math.exp(-dt * 7)); stats.focus = Math.round(focus);
    dofU.tDiffuse.value = rb.texture; dofU.tDepth.value = sceneRT.depthTexture; dofU.tView.value = rb.depthTexture; dofU.near.value = cam.near; dofU.far.value = cam.far;
    dofU.vNear.value = viewCam.near; dofU.vFar.value = viewCam.far; dofU.focus.value = focus; dofU.k.value = aim * rb.height / 1080; dofU.px.value.set(1 / rb.width, 1 / rb.height);
    dofU.worldK.value = config.dofWorldK; dofU.worldMax.value = config.dofWorld; dofU.gunK.value = config.dofGun; dofU.gunSharp.value = config.gunSharp; dofU.gunNear.value = config.gunNear;
    fit(tmp, rb.width, rb.height); draw(r, dofQ, tmp); back(r, copyQ, tmp, rb); stats.dof = +aim.toFixed(2);
  };

  // ---- reflections
  const vec4s = () => Array.from({ length: RULES }, () => new THREE.Vector4());
  const ssrU = { tDiffuse: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, viewM: { value: new THREE.Matrix4() },
    camPos: { value: new THREE.Vector3() }, near: { value: 1 }, far: { value: 1000 }, time: { value: 0 }, count: { value: 0 }, rA: { value: vec4s() }, rB: { value: vec4s() }, rC: { value: vec4s() } };
  const ssrQ = new FullScreenQuad(mat(SSR_FS, ssrU, { defines: { STEPS: 26, STEP0: '5.0', GROW: '1.2' } }));
  const rules = [];
  // {y, rect} water or {min, max} floor; strength 0-1, ripple (tilt of the mirror) and its scale (1/units), f0 (how
  // much it reflects seen straight on), puddle (floors: 1/units of the puddle noise, 0 = the whole floor), reach
  // (how far away the camera can be and still see it)
  const add = rule => { rules.push(rule); return rule; };
  const addWater = o => add({ water: true, y: o.y, rect: o.rect, strength: o.strength ?? .9, ripple: o.ripple ?? .05, scale: o.scale ?? .02, f0: o.f0 ?? .03, reach: o.reach ?? 5000 });
  const addFloor = o => add({ water: false, min: o.min, max: o.max, strength: o.strength ?? .6, ripple: o.ripple ?? .02, scale: o.scale ?? .05, f0: o.f0 ?? .04, puddle: o.puddle ?? 0, reach: o.reach ?? 3000 });
  const near = (r, p) => { const [x0, z0, x1, z1] = r.water ? r.rect : [r.min[0], r.min[2], r.max[0], r.max[2]], dx = Math.max(x0 - p.x, 0, p.x - x1), dz = Math.max(z0 - p.z, 0, p.z - z1); r.d = dx * dx + dz * dz; return r.d < r.reach * r.reach; };
  const ssr = new Pass(); ssr.needsSwap = false; const camP = new THREE.Vector3();
  ssr.render = (r, wb, rb) => {
    const scale = config.ssrScale[Math.round(settings.graphics ?? 2)] ?? 0;
    if (!rules.length || !scale || settings.reflections === false || !sceneRT?.depthTexture || sceneRT === rb) return;
    camP.setFromMatrixPosition(cam.matrixWorld); let n = 0;
    const live = rules.filter(q => near(q, camP) && !(q.water && camP.y <= q.y)); if (live.length > RULES) live.sort((a, b) => a.d - b.d);   // the nearest 8
    for (const q of live) { if (n >= RULES) break;
      if (q.water) { ssrU.rA.value[n].set(...q.rect); ssrU.rB.value[n].set(q.y, 0, q.strength, 0); } else { ssrU.rA.value[n].set(q.min[0], q.min[2], q.max[0], q.max[2]); ssrU.rB.value[n].set(q.min[1], q.max[1], q.strength, 1); }
      ssrU.rC.value[n].set(q.ripple, q.scale, q.f0, q.puddle ?? 0); n++; }
    if (!n) return;
    ssrU.count.value = n; ssrU.tDiffuse.value = rb.texture; ssrU.tDepth.value = sceneRT.depthTexture; ssrU.projInv.value.copy(cam.projectionMatrixInverse); ssrU.proj.value.copy(cam.projectionMatrix);
    ssrU.camWorld.value.copy(cam.matrixWorld); ssrU.viewM.value.copy(cam.matrixWorldInverse); ssrU.camPos.value.copy(camP); ssrU.near.value = cam.near; ssrU.far.value = cam.far; ssrU.time.value = time;
    fit(half, Math.max(1, Math.round(rb.width * scale)), Math.max(1, Math.round(rb.height * scale))); draw(r, ssrQ, half); back(r, blendQ, half, rb); stats.ssr = n;
  };
  for (const w of api.map?.reflect?.water ?? []) addWater(w);
  for (const f of api.map?.reflect?.floors ?? []) addFloor(f);

  // Compile and first-draw every program here, behind the loading screen, into targets of the formats used in play
  // (a first draw mid-game is a freeze on D3D11).
  const warm = () => { try {
    const a = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }), b = rt(); b.setSize(4, 4); a.depthTexture = new THREE.DepthTexture(4, 4);
    for (const q of [motionQ, dofQ, ssrQ]) draw(renderer, q, b);
    back(renderer, copyQ, b, a); back(renderer, blendQ, b, a); a.depthTexture.dispose(); a.dispose(); b.dispose();
  } catch (e) { console.warn('[post-fx] warm', e); } };
  K.postFx = { motion: motionU, dof: dofU, ssr: ssrU, config, stats, rules, addWater, addFloor };
  return { motion, dof, ssr, track, frame, warm, rules, addWater, addFloor };
}

// Map lighting.
//
// Kino (api.map unset): the level's exported light entities and light
// fixtures become lights. A pool of point lights follows the strongest
// sources near the camera; the nearest spot fixtures (the theatre chandelier,
// the balcony spots aimed at the stage, lobby and hanging lamps) also get
// shadow-casting spotlights, visible light beams and drifting dust. The flat
// fill and the exposure are lowered so rooms get real light pools and dark
// corners. With the power on, the chandelier's candle bulbs glow.
//
// Every map: bloom and ground-contact ambient occlusion through a
// post-processing chain (mods.renderWorld), scaled by Settings → Graphics
// quality (0 Low: none, 1 Medium: bloom + beams, 2 High: + shadows + AO,
// 3 Ultra: sharper shadows, more shadow lights, full-rate updates).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { settings, onSettingsChange } from '../../settings.js';

const POOL=12,SWAP=.25;
const FIXTURES={
  zombie_theater_chandelier1_off:{color:'#ffd49a',intensity:14,radius:1700,drop:120,power:true,spot:{angle:.95,down:true,beam:.9}},
  zombie_theater_chandelier1arm_off:{color:'#ffcf8a',intensity:3,radius:420,drop:12,power:true},
  lights_hang_single:{color:'#ffd49a',intensity:5,radius:460,drop:30,power:false,spot:{angle:.9,down:true,beam:.55}},
  p_glo_stage_light:{color:'#fff0d0',intensity:7,radius:650,drop:0,power:true}};
const STAGE=new THREE.Vector3(0,90,-1100);
// Phones and tablets cap at Medium: shadows and AO are too heavy for them.
const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
const quality=()=>Math.min(coarse?1:3,THREE.MathUtils.clamp(Math.round(settings.graphics??2),0,3));

export default function setup(api){
  const {scene,camera,session,data,host,renderer}=api;
  const kino=!api.map;
  if(kino)setupKino(api);
  if(renderer)setupPost(api);
}

// ---- Kino lights ------------------------------------------------------------------------------
function setupKino(api){
  const {scene,camera,session,data,host,renderer,world}=api;
  const rgb=s=>{const [r,g,b]=String(s).trim().split(/\s+/).map(Number);return r+g+b>0?new THREE.Color(r,g,b):new THREE.Color('#fff4dc');};
  const sources=[];
  for(const e of data.entities){
    if(e.classname==='light'&&e.position){
      const kind=e.targetname==='fire_flicker'?'fire':e.targetname==='light_solid'?'solid':'power';
      const s={position:new THREE.Vector3(...e.position),color:rgb(e.script_light2_color??e._color),intensity:Math.min(10,+e.intensity||8),radius:(+e.radius||500)*1.3,kind};
      // High, narrow spots: the theatre balcony spots aim at the stage, the lobby ones down.
      const fov=+e.fov_outer||90;
      if(fov<=60&&s.position.y>400){
        const theatre=s.position.z<-100&&s.position.z>-1000&&Math.abs(s.position.x)<700;
        s.spot={angle:THREE.MathUtils.degToRad(Math.max(fov,32))/2*1.3,target:theatre?STAGE.clone():null,down:!theatre,beam:theatre?.7:.45};
        s.radius=Math.max(s.radius,theatre?1500:900);
      }
      sources.push(s);
    }
    const f=FIXTURES[e.model?.replace(/^,/,'')];
    if(e.classname==='script_model'&&f)sources.push({position:new THREE.Vector3(...e.position).add(new THREE.Vector3(0,-f.drop,0)),color:new THREE.Color(f.color),intensity:f.intensity,radius:f.radius,kind:f.power?'power':'solid',spot:f.spot?{...f.spot}:null,fixture:e.model});
  }
  // Where each spot points: at its target, or straight down to the floor.
  const down=new THREE.Vector3(0,-1,0);
  for(const s of sources){
    if(!s.spot)continue;
    if(!s.spot.target){const hit=world.raycast?.(new THREE.Ray(s.position.clone().add(new THREE.Vector3(0,-8,0)),down),0,3000);s.spot.target=s.position.clone().add(new THREE.Vector3(0,-(hit?.distance??600),0));}
    s.spot.length=s.position.distanceTo(s.spot.target);
  }

  // Darker base: less exposure and much less flat fill.
  renderer.toneMappingExposure=1.45;
  const fills=scene.children.filter(o=>o.isAmbientLight||o.isHemisphereLight||o.isDirectionalLight);
  const base=new Map(fills.map(l=>[l,l.intensity]));
  scene.fog=new THREE.FogExp2(0x0c0e11,.00042);scene.background=new THREE.Color(0x07080a);

  // Point-light pool (cheap, many sources).
  const pool=[...Array(POOL)].map(()=>{const l=new THREE.PointLight(0xffffff,0,1,1.3);scene.add(l);return l;});
  // Shadow-casting spots (expensive, the nearest few).
  const SPOTS=4;
  const spots=[...Array(SPOTS)].map(()=>{
    const l=new THREE.SpotLight(0xffffff,0,1,.8,.55,1.2);l.castShadow=false;l.shadow.bias=-.0004;l.shadow.normalBias=.6;l.shadow.camera.near=8;
    scene.add(l,l.target);return l;});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;

  // Everything static casts and receives; actors are picked up as they appear.
  const shadowReady=new WeakSet();
  function tagShadows(root){root.traverse(o=>{if(!o.isMesh||shadowReady.has(o))return;shadowReady.add(o);const m=[o.material].flat()[0];
    const see=!m?.transparent&&!(m?.blending>1);o.castShadow=see;o.receiveShadow=true;});}
  tagShadows(scene);let tagTimer=0;

  // Light beams: soft additive cones with drifting dust.
  const beams=[];
  const beamMaterial=()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:{color:{value:new THREE.Color()},strength:{value:0},time:{value:0}},
    vertexShader:`varying float vH;varying vec3 vN;varying vec3 vView;varying vec2 vUv;
      void main(){vUv=uv;vH=uv.y;vec4 wp=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vView=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader:`uniform vec3 color;uniform float strength;uniform float time;varying float vH;varying vec3 vN;varying vec3 vView;varying vec2 vUv;
      float n(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){float edge=pow(abs(dot(normalize(vN),vView)),1.6);float along=pow(vH,1.3)*(1.-smoothstep(.93,1.,vH));
        float streak=.75+.25*sin(vUv.x*43.+time*.3)*sin(vUv.x*17.-time*.2);
        gl_FragColor=vec4(color*strength*edge*along*streak,1.);}`});
  for(const s of sources){
    if(!s.spot?.beam)continue;
    const len=Math.min(s.spot.length,1400),r=Math.tan(s.spot.angle*.8)*len;
    const g=new THREE.CylinderGeometry(.5,r,len,32,1,true).translate(0,-len/2,0);
    const mesh=new THREE.Mesh(g,beamMaterial());mesh.position.copy(s.position);
    const dir=s.spot.target.clone().sub(s.position).normalize();mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir);
    mesh.material.uniforms.color.value.copy(s.color).lerp(new THREE.Color('#fff'),.3);mesh.frustumCulled=true;mesh.renderOrder=5;scene.add(mesh);
    // Dust drifting inside the beam.
    const count=Math.round(40+len/12),pos=new Float32Array(count*3),seed=[];
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,h=Math.random(),rr=Math.sqrt(Math.random())*r*h*.9;seed.push({a,h,rr,sp:.2+Math.random()*.5});}
    const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const dust=new THREE.Points(dg,new THREE.PointsMaterial({color:s.color,size:1.6,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
    dust.position.copy(mesh.position);dust.quaternion.copy(mesh.quaternion);dust.renderOrder=5;scene.add(dust);
    beams.push({s,mesh,dust,seed,len,strength:s.spot.beam});
  }

  // Chandelier bulbs glow with the power on (the white block top-left of its texture).
  const bulbs=[];
  {const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,128,128);g.fillStyle='#fff';g.fillRect(0,0,20,20);
    const tex=new THREE.CanvasTexture(c);tex.flipY=false;
    const seen=new Set();scene.traverse(o=>{for(const m of [o.material].flat())if(m&&!seen.has(m)&&/chandel/.test(m.name??'')){seen.add(m);m.emissive=new THREE.Color('#ffc27a');m.emissiveMap=tex;m.emissiveIntensity=0;m.needsUpdate=true;bulbs.push(m);}});}

  let timer=0,t=0,frame=0;
  const level=s=>s.kind==='power'?(session.power?1:0):s.kind==='fire'?.85+Math.sin(t*23+s.position.x)*.1+Math.random()*.12:1;
  host.on('update',dt=>{
    t+=dt;timer-=dt;frame++;const q=quality();
    for(const l of fills){const scale=l.isAmbientLight?.19:l.isHemisphereLight?.21:.12,now=l.isAmbientLight?(session.power?1.5:1.1):base.get(l);l.intensity=now*scale;}
    if(timer<=0){
      timer=SWAP;const eye=camera.position;
      const score=s=>level(s)?s.intensity*s.radius/Math.max(80,s.position.distanceTo(eye)):0;
      const ranked=sources.map(s=>({s,score:score(s)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
      assign(pool,ranked.filter(r=>!r.s.spot||q<2).slice(0,POOL));
      const nSpots=q>=3?4:q>=2?2:0;
      assign(spots,ranked.filter(r=>r.s.spot).slice(0,nSpots));
      // Shadow settings change only with the quality level (each change recompiles shaders).
      const size=q>=3?2048:1024,cast=q>=2;
      spots.forEach((l,i)=>{const on=cast&&i<nSpots;if(l.castShadow!==on)l.castShadow=on;if(l.shadow.mapSize.x!==size){l.shadow.mapSize.set(size,size);l.shadow.map?.dispose();l.shadow.map=null;}});
      renderer.shadowMap.needsUpdate=true;
    }
    for(const l of pool){const s=l.userData.source,target=s?s.intensity*level(s)*560:0;if(s){l.position.copy(s.position);l.color.copy(s.color);l.distance=s.radius;}l.intensity+=(target-l.intensity)*Math.min(1,dt*6);}
    for(const l of spots){const s=l.userData.source,target=s?Math.min(9,s.intensity)*level(s)*720:0;
      if(s){l.position.copy(s.position);l.target.position.copy(s.spot.target);l.color.copy(s.color);l.distance=s.radius*1.6;l.angle=Math.min(1.2,s.spot.angle);l.shadow.camera.far=l.distance;}
      l.intensity+=(target-l.intensity)*Math.min(1,dt*6);}   // never toggle .visible: that recompiles every lit shader
    // Shadows: the world is static, so refresh at 30 Hz on High and every frame on Ultra.
    if(q>=2&&(q>=3||frame%2===0))renderer.shadowMap.needsUpdate=true;
    if((tagTimer-=dt)<=0){tagTimer=1;tagShadows(scene);}
    for(const b of beams){const on=q>=1?level(b.s):0,u=b.mesh.material.uniforms;u.time.value=t;u.strength.value+=(on*b.strength*.16-u.strength.value)*Math.min(1,dt*4);b.mesh.visible=u.strength.value>.002;
      b.dust.visible=q>=2&&b.mesh.visible;if(b.dust.visible){b.dust.material.opacity=Math.min(.55,u.strength.value*4);const p=b.dust.geometry.attributes.position;
        b.seed.forEach((d,i)=>{d.h=(d.h+dt*.012*d.sp)%1;d.a+=dt*.05*d.sp;const rr=d.rr;p.setXYZ(i,Math.cos(d.a)*rr,-d.h*b.len,Math.sin(d.a)*rr);});p.needsUpdate=true;}}
    for(const m of bulbs)m.emissiveIntensity+=((session.power?2.6:0)-m.emissiveIntensity)*Math.min(1,dt*3);
  });
  // Keep lights that stay chosen on their current source to avoid pops.
  function assign(lights,ranked){
    const chosen=new Set(ranked.map(r=>r.s));
    for(const l of lights)if(l.userData.source&&!chosen.has(l.userData.source))l.userData.source=null;
    const taken=new Set(lights.map(l=>l.userData.source).filter(Boolean));
    for(const {s} of ranked)if(!taken.has(s)){const l=lights.find(l=>!l.userData.source);if(!l)break;l.userData.source=s;l.intensity=0;taken.add(s);}
  }
  window.kino.lighting={sources,pool,spots,beams};
}

// ---- Post-processing (all maps) ----------------------------------------------------------------
function setupPost(api){
  const {renderer,scene,camera,host}=api;
  let composer=null,renderPass=null,gtao=null,bloom=null,builtFor=-1;
  const size=()=>{const v=renderer.getSize(new THREE.Vector2());return [Math.max(1,v.x),Math.max(1,v.y)];};
  function build(q){
    composer?.dispose?.();composer=null;builtFor=q;
    if(q<1)return;
    const [w,h]=size(),target=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,samples:4});
    composer=new EffectComposer(renderer,target);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);
    renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
    if(q>=2){gtao=new GTAOPass(scene,camera,w,h);gtao.output=GTAOPass.OUTPUT.Default;gtao.blendIntensity=.85;
      gtao.updateGtaoMaterial({radius:28,distanceExponent:1.5,thickness:12,scale:1,samples:q>=3?16:10,distanceFallOff:1});
      gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:4,rings:2,samples:q>=3?16:8});composer.addPass(gtao);}else gtao=null;
    bloom=new UnrealBloomPass(new THREE.Vector2(w,h),.38,.55,.82);composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const resize=()=>{if(!composer)return;const [w,h]=size();composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);};
  addEventListener('resize',()=>setTimeout(resize,200));
  onSettingsChange((s,key)=>{if(key==='graphics'||key===null)build(quality());if(key==='renderScale')setTimeout(resize,50);});
  build(quality());
  host.renderWorld=(sceneToDraw,cam)=>{
    if(builtFor!==quality())build(quality());
    if(!composer){renderer.render(sceneToDraw,cam);return;}
    renderPass.camera=cam;if(gtao)gtao.camera=cam;
    const [w,h]=size();if(composer.renderTarget1.width!==Math.floor(w*renderer.getPixelRatio()))resize();
    composer.render();
  };
}

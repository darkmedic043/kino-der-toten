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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { settings, onSettingsChange } from '../../settings.js';

const POOL=12,SWAP=.25;
// Per-light brightness cap in the lighting shader. A lamp sitting inside its
// own fixture (a stage lamp, a cable plug, a wall sconce) gave that little
// mesh hundreds of times too much light, which bloomed into a white disc; the
// collision mesh can't see those small models, so cap it at the source.
// Scaling by the brightest channel keeps coloured lights their colour.
// Enabled per material by the LIGHT_CLAMP define (it is also the cap value).
{const clamp='\n\t\t#ifdef LIGHT_CLAMP\n\t\t{float mx=max(directLight.color.r,max(directLight.color.g,directLight.color.b));if(mx>LIGHT_CLAMP)directLight.color*=LIGHT_CLAMP/mx;}\n\t\t#endif';
  let c=THREE.ShaderChunk.lights_fragment_begin;
  for(const call of ['getPointLightInfo( pointLight, geometryPosition, directLight );','getSpotLightInfo( spotLight, geometryPosition, directLight );'])
    if(c.includes(call)&&!c.includes(call+clamp))c=c.replace(call,call+clamp);
  THREE.ShaderChunk.lights_fragment_begin=c;}
const LIGHT_CLAMP='3.2';
const FIXTURES={
  zombie_theater_chandelier1_off:{color:'#ffd49a',intensity:14,radius:1700,drop:120,power:true,spot:{angle:.95,down:true,beam:.9}},
  zombie_theater_chandelier1arm_off:{color:'#ffcf8a',intensity:3,radius:420,drop:12,power:true},
  lights_hang_single:{color:'#ffd49a',intensity:5,radius:460,drop:30,power:false,spot:{angle:.9,down:true,beam:.55}},
  p_glo_stage_light:{color:'#fff0d0',intensity:7,radius:650,drop:0,power:true}};
const STAGE=new THREE.Vector3(0,90,-1100);
// Perk machines glow in their colour once powered (Quick Revive is always on).
const PERKS={zombie_vending_jugg:{color:'#ff3524'},zombie_vending_sleight:{color:'#39ff6a'},zombie_vending_doubletap:{color:'#ffae2e'},
  zombie_vending_revive:{color:'#3d9dff',always:true},zombie_vending_packapunch:{color:'#b44dff'}};
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
    const perk=PERKS[e.model?.replace(/^,/,'')];
    if(e.classname==='script_model'&&perk)sources.push({position:new THREE.Vector3(...e.position),color:new THREE.Color(perk.color),intensity:6,radius:420,kind:perk.always?'solid':'power',machine:true});
    const f=FIXTURES[e.model?.replace(/^,/,'')];
    if(e.classname==='script_model'&&f)sources.push({position:new THREE.Vector3(...e.position).add(new THREE.Vector3(0,-f.drop,0)),color:new THREE.Color(f.color),intensity:f.intensity,radius:f.radius,kind:f.power?'power':'solid',spot:f.spot?{...f.spot}:null,fixture:e.model});
  }
  // Where each spot points: at its target, or straight down to the floor.
  const down=new THREE.Vector3(0,-1,0);
  // Every other light behaves like a bulb in a fixture: wall-mounted ones shine
  // out from their wall (moved off it, so no hot circle on the wall), ceiling
  // ones shine down, free-hanging ones (chandeliers) throw a wide cone down.
  // Perk machines light the floor in front of them.
  const ray=(o,d,far)=>world.raycast?.(new THREE.Ray(o,d),0,far);
  for(const s of sources){
    if(s.spot)continue;
    if(s.machine){
      let best=null;for(const a of [0,Math.PI/2,Math.PI,-Math.PI/2]){const d=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),o=s.position.clone().add(new THREE.Vector3(0,75,0));
        const far=ray(o.clone().addScaledVector(d,40),d,400)?.distance??400;if(!best||far>best.far)best={d,far};}
      s.position.add(new THREE.Vector3(0,78,0)).addScaledVector(best.d,42);s.dir=best.d.clone().add(new THREE.Vector3(0,-.75,0)).normalize();s.angle=1.15;continue;
    }
    let near=null;
    for(const d of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]].map(v=>new THREE.Vector3(...v))){const h=ray(s.position,d,95);if(h&&(!near||h.distance<near.h.distance))near={h,d};}
    if(near&&near.d.y===0){
      const n=near.h.triangle?.getNormal(new THREE.Vector3())??near.d.clone().negate();if(n.dot(near.d)>0)n.negate();n.y=0;n.normalize();
      s.position.copy(near.h.position).addScaledVector(n,30).setY(s.position.y);s.dir=n.clone().add(new THREE.Vector3(0,-.55,0)).normalize();s.angle=1.2;
    }else if(near){s.dir=down.clone();s.angle=1.15;s.position.y=Math.min(s.position.y,near.h.position.y-18);}
    else{s.dir=down.clone();s.angle=s.fixture?1.4:1.3;}
  }
  for(const s of sources){
    if(!s.spot)continue;
    // Start below the fixture's own body, or the ray hits the lamp itself (a 30-unit 'beam' that drew as a bright ring).
    if(!s.spot.target){const hit=world.raycast?.(new THREE.Ray(s.position.clone().add(new THREE.Vector3(0,-40,0)),down),0,3000);s.spot.target=s.position.clone().add(new THREE.Vector3(0,-40-(hit?.distance??600),0));}
    s.spot.length=s.position.distanceTo(s.spot.target);
  }
  // A light a few units from a wall or floor blows that surface out to a big
  // white disc (and bloom makes it a glowing circle). Cap each light so the
  // nearest surface gets at most a bright-but-lit level; far reach is unchanged.
  for(const s of sources){
    // Only surfaces inside the light's cone can blow out: probe its axis and a ring 50° around it.
    const axis=(s.spot?s.spot.target.clone().sub(s.position):s.dir??down).clone().normalize(),side=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize();
    const probes=[axis,...[0,1,2,3,4,5].map(k=>axis.clone().applyAxisAngle(side,.87).applyAxisAngle(axis,k*Math.PI/3))];
    let near=500;for(const d of probes){const h=ray(s.position,d,500);if(h)near=Math.min(near,h.distance);}
    if(near<2)near=12;   // the probe started inside geometry (a floor-level light): assume it is close
    s.near=near;s.cap=3.2*Math.pow(Math.max(near,6),1.3);
  }

  // Darker base: less exposure and much less flat fill.
  renderer.toneMappingExposure=1.45;
  const fills=scene.children.filter(o=>o.isAmbientLight||o.isHemisphereLight||o.isDirectionalLight);
  const base=new Map(fills.map(l=>[l,l.intensity]));
  scene.fog=new THREE.FogExp2(0x0c0e11,.00042);scene.background=new THREE.Color(0x07080a);

  // Point-light pool (cheap, many sources).
  const pool=[...Array(POOL)].map(()=>{const l=new THREE.SpotLight(0xffffff,0,1,1.2,1,1.3);scene.add(l,l.target);return l;});
  // Shadow-casting spots (expensive, the nearest few).
  const SPOTS=4;
  const spots=[...Array(SPOTS)].map(()=>{
    const l=new THREE.SpotLight(0xffffff,0,1,.8,1,1.2);l.castShadow=false;l.shadow.bias=-.0004;l.shadow.normalBias=.6;l.shadow.camera.near=8;
    scene.add(l,l.target);return l;});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=true;
  for(const l of spots){l.shadow.autoUpdate=false;l.shadow.needsUpdate=true;}   // refreshed on our own cadence below

  // Everything static casts and receives; actors are picked up as they appear.
  const shadowReady=new WeakSet();
  function tagShadows(root){root.traverse(o=>{if(!o.isMesh||shadowReady.has(o))return;shadowReady.add(o);
    for(const x of [o.material].flat())if(x&&!x.isShaderMaterial&&x.defines?.LIGHT_CLAMP!==LIGHT_CLAMP){x.defines={...x.defines,LIGHT_CLAMP};x.needsUpdate=true;}
    const m=[o.material].flat()[0];
    const see=!m?.transparent&&!(m?.blending>1);o.castShadow=see;o.receiveShadow=true;});}
  tagShadows(scene);let tagTimer=0;

  // ---- Daytime: a physical sky and a sun whose shadows keep interiors dark, so
  // sunlight only gets in through the roof holes, windows and open doors.
  const day=()=>settings.daytime!==false;
  const sunDir=new THREE.Vector3(-.42,.82,.39).normalize();
  const sky=new Sky();sky.scale.setScalar(11000);Object.assign(sky.material.uniforms.turbidity,{value:5});sky.material.uniforms.rayleigh.value=1.4;
  sky.material.uniforms.mieCoefficient.value=.004;sky.material.uniforms.mieDirectionalG.value=.82;sky.material.uniforms.sunPosition.value.copy(sunDir);
  sky.frustumCulled=false;sky.castShadow=sky.receiveShadow=false;shadowReady.add(sky);scene.add(sky);
  // The map's sky brushes (a 64 px placeholder filling roof holes and windows) would block the sun.
  const skyBrushes=[];scene.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>/sky_day/.test(m?.name??'')))skyBrushes.push(o);});
  const bounds=new THREE.Box3();scene.traverse(o=>{if(o.isMesh&&o!==sky&&!skyBrushes.includes(o)&&o.geometry){o.geometry.computeBoundingBox?.();if(o.geometry.boundingBox)bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
  const center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3()).length()*.5;
  const sun=new THREE.DirectionalLight(0xfff0da,0);sun.castShadow=true;sun.position.copy(center).addScaledVector(sunDir,extent*1.5);sun.target.position.copy(center);
  Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:1,far:extent*3.2});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-.0002;sun.shadow.normalBias=1.4;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;scene.add(sun,sun.target);
  let sunTimer=0,wasDay=null;
  // Sun shafts: trace sunlight down onto the map on a grid; spots it reaches
  // that still have a roof overhead are under a hole. Neighbouring spots form
  // one shaft, drawn back up along the sun (built in slices so loading doesn't stall).
  (async()=>{
    // The collision mesh has no roofs, so trace against the visible, opaque map geometry.
    const solids=[];scene.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||o===sky||skyBrushes.includes(o)||!o.geometry?.attributes?.position)return;
      const m=[o.material].flat();if(m.some(x=>x?.transparent||x?.blending>1||x?.alphaTest>0))return;solids.push(o);});
    for(const o of solids){if(!o.geometry.boundsTree){o.geometry.boundsTree=new MeshBVH(o.geometry);await new Promise(r=>setTimeout(r,0));}o.raycast=acceleratedRaycast;}
    const caster=new THREE.Raycaster();caster.firstHitOnly=true;
    const vis=(o,d,far)=>{caster.set(o,d);caster.far=far;return caster.intersectObjects(solids,false)[0]??null;};
    const STEP=32,up=new THREE.Vector3(0,1,0),downV=new THREE.Vector3(0,-1,0),into=sunDir.clone().negate(),lit=new Map();
    const nx=Math.ceil((bounds.max.x-bounds.min.x)/STEP),nz=Math.ceil((bounds.max.z-bounds.min.z)/STEP);
    for(let i=0;i<nx;i++){
      for(let k=0;k<nz;k++){
        const x=bounds.min.x+i*STEP,z=bounds.min.z+k*STEP;
        // Walkable floor here (collision is fast), then: does sunlight reach it, and is there a roof overhead?
        const floor=ray(new THREE.Vector3(x,bounds.max.y+10,z),downV,bounds.max.y-bounds.min.y+20);if(!floor)continue;
        const p=floor.position.clone().add(new THREE.Vector3(0,3,0));
        if(vis(p,sunDir,5000))continue;                 // in shadow
        const roof=vis(p,up,1200);if(!roof)continue;     // nothing overhead: outdoors
        lit.set(i+','+k,{i,k,p:floor.position.clone(),roofY:roof.point.y});
      }
      if(i%6===0)await new Promise(r=>setTimeout(r,0));
    }
    // Flood-fill neighbouring lit spots into shafts.
    const seen=new Set(),groups=[];
    for(const [key,c] of lit){if(seen.has(key))continue;const g=[],stack=[c];seen.add(key);
      while(stack.length){const a=stack.pop();g.push(a);for(const [di,dk] of [[1,0],[-1,0],[0,1],[0,-1]]){const kk=(a.i+di)+','+(a.k+dk),b=lit.get(kk);if(b&&!seen.has(kk)&&Math.abs(b.p.y-a.p.y)<40){seen.add(kk);stack.push(b);}}}
      if(g.length>=2)groups.push(g);}
    groups.sort((a,b)=>b.length-a.length);
    const warm=new THREE.Color('#fff1d6');
    for(const g of groups.slice(0,28)){
      const c=g.reduce((v,a)=>v.add(a.p),new THREE.Vector3()).divideScalar(g.length),roofY=g.reduce((m,a)=>Math.max(m,a.roofY),0);
      const len=Math.min(1600,Math.max(120,(roofY-c.y)/sunDir.y)),r=Math.sqrt(g.length*STEP*STEP/Math.PI)*.9;
      makeBeam({kind:'sun'},c.clone().addScaledVector(sunDir,len),into,len*.97,r,warm,1.1,.1,r*.95);
    }
    console.info('[lighting] sun shafts',Math.min(28,groups.length),'from',lit.size,'sunlit spots');
  })();
  function applyDay(q){
    const on=day();if(on===wasDay&&sun.shadow.mapSize.x===(q>=2?4096:2048))return;wasDay=on;
    sky.visible=on;for(const o of skyBrushes)o.visible=!on;
    const size=q>=2?4096:2048;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
    sun.castShadow=on&&q>=1;sun.shadow.needsUpdate=true;
    scene.fog=on?new THREE.FogExp2(0x9aa7b3,.00016):new THREE.FogExp2(0x0c0e11,.00042);scene.background=on?null:new THREE.Color(0x07080a);
  }

  // Light beams: soft additive cones with drifting dust.
  const beams=[];
  // Beams are camera-facing ribbons along the beam axis (the usual fake light
  // shaft): soft across their width, fading toward the far end and near the
  // camera. Cone meshes showed their walls edge-on as bright lines and their
  // rims as rings on real GPUs; a ribbon has neither.
  const beamMaterial=()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:{color:{value:new THREE.Color()},strength:{value:0},time:{value:0}},
    vertexShader:`varying vec2 vUv;varying float vDist;
      void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vDist=length(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader:`uniform vec3 color;uniform float strength;uniform float time;varying vec2 vUv;varying float vDist;
      void main(){float x=(vUv.x-.5)*2.;float across=exp(-x*x*3.2)*(1.-x*x);          // soft centre, zero at both edges
        float along=smoothstep(0.,.5,vUv.y)*(1.-smoothstep(.92,1.,vUv.y));           // fades toward the far end and at the source
        float near=smoothstep(40.,280.,vDist);
        float drift=.9+.1*sin(vUv.y*9.-time*.4+x*2.);
        gl_FragColor=vec4(color*strength*across*along*near*drift*1.35,1.);}`});
  const moteTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),r=g.createRadialGradient(16,16,0,16,16,16);
    r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.4,'rgba(255,255,255,.35)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);})();
  function makeBeam(src,top,dir,len,r,color,strength,warmth=.3,tip=.5){
    // Trapezoid ribbon: tip width at the source (y=0), base width at the far end (y=-len); uv.y = 1 at the source.
    const g=new THREE.BufferGeometry();const hw0=Math.max(tip,r*.12),hw1=r;
    g.setAttribute('position',new THREE.Float32BufferAttribute([-hw0,0,0, hw0,0,0, -hw1,-len,0, hw1,-len,0],3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1, 1,1, 0,0, 1,0],2));g.setIndex([0,2,1, 1,2,3]);g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,beamMaterial());mesh.position.copy(top);mesh.frustumCulled=false;
    mesh.material.uniforms.color.value.copy(color).lerp(new THREE.Color('#fff'),warmth);mesh.renderOrder=5;scene.add(mesh);
    const axisQ=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),dir.clone().normalize());
    // Dust drifting inside the beam.
    const count=Math.round(Math.min(110,20+len/24+r/2)),pos=new Float32Array(count*3),seed=[];
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,h=Math.random(),rr=Math.sqrt(Math.random())*(tip+(r-tip)*h)*.9;seed.push({a,h,rr,sp:.2+Math.random()*.5,ph:Math.random()*100,wob:1+Math.random()*4});}
    const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(pos,3));
    // Tiny soft motes (world-sized, so they shrink with distance), kept well under the bloom threshold.
    const dust=new THREE.Points(dg,new THREE.PointsMaterial({color,size:.35,map:moteTexture,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
    dust.position.copy(mesh.position);dust.quaternion.copy(axisQ);dust.renderOrder=5;scene.add(dust);
    beams.push({s:src,mesh,dust,seed,len,strength,top:top.clone(),dir:dir.clone().normalize(),r,tip});
  }
  for(const s of sources){
    if(!s.spot?.beam||s.spot.length<60)continue;   // degenerate (lamp right above a surface)
    const len=Math.min(s.spot.length*.85,1400);
    makeBeam(s,s.position,s.spot.target.clone().sub(s.position),len,Math.tan(s.spot.angle*.8)*len,s.color,s.spot.beam);
  }

  // Chandelier bulbs glow with the power on (the white block top-left of its texture).
  const bulbs=[];
  {const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,128,128);g.fillStyle='#fff';g.fillRect(0,0,20,20);
    const tex=new THREE.CanvasTexture(c);tex.flipY=false;
    const seen=new Set();scene.traverse(o=>{for(const m of [o.material].flat())if(m&&!seen.has(m)&&/chandel/.test(m.name??'')){seen.add(m);m.emissive=new THREE.Color('#ffc27a');m.emissiveMap=tex;m.emissiveIntensity=0;m.needsUpdate=true;bulbs.push(m);}});}

  let timer=0,t=0,frame=0;
  const level=s=>s.kind==='sun'?(day()?1:0):s.kind==='power'?(session.power?1:0):s.kind==='fire'?.85+Math.sin(t*23+s.position.x)*.1+Math.random()*.12:1;
  host.on('update',dt=>{
    t+=dt;timer-=dt;frame++;const q=quality();
    applyDay(q);const isDay=day();
    for(const l of fills){const scale=isDay?(l.isAmbientLight?.2:l.isHemisphereLight?.3:.08):(l.isAmbientLight?.19:l.isHemisphereLight?.21:.12),now=l.isAmbientLight?(session.power?1.5:1.1):base.get(l);l.intensity=now*scale;}
    // The sun needs its shadows (without them it would light every interior), so Low has none.
    sun.intensity=isDay&&q>=1?5.2:0;sky.position.copy(camera.position);
    if(isDay&&q>=1&&(sunTimer-=dt)<=0){sunTimer=2;sun.shadow.needsUpdate=true;}   // static world; refresh now and then for doors
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
      for(const l of spots)l.shadow.needsUpdate=true;
    }
    for(const l of pool){const s=l.userData.source,target=s?Math.min(s.intensity*560,s.cap)*level(s):0;if(s){l.position.copy(s.position);l.target.position.copy(s.position).add(s.dir??down);l.angle=s.angle??1.3;l.color.copy(s.color);l.distance=s.radius;}l.intensity+=(target-l.intensity)*Math.min(1,dt*6);}
    for(const l of spots){const s=l.userData.source,target=s?Math.min(Math.min(9,s.intensity)*720,s.cap*1.6)*level(s):0;
      if(s){l.position.copy(s.position);l.target.position.copy(s.spot.target);l.color.copy(s.color);l.distance=s.radius*1.6;l.angle=Math.min(1.2,s.spot.angle);l.shadow.camera.far=l.distance;}
      l.intensity+=(target-l.intensity)*Math.min(1,dt*6);}   // never toggle .visible: that recompiles every lit shader
    // Shadows: the world is static, so refresh at 30 Hz on High and every frame on Ultra.
    if(q>=2&&(q>=3||frame%2===0))for(const l of spots)l.shadow.needsUpdate=true;
    if((tagTimer-=dt)<=0){tagTimer=1;tagShadows(scene);}
    for(const b of beams){
      // Standing inside a beam: dim it (you see light around you, not the cone's walls).
      const rel=camera.position.clone().sub(b.top),along=rel.dot(b.dir),radial=rel.clone().addScaledVector(b.dir,-along).length();
      // Billboard about the beam axis: local -Y along the beam, +Z toward the camera.
      {const yAxis=b.dir.clone().negate(),toCam=rel.clone().addScaledVector(b.dir,-along);if(toCam.lengthSq()<1e-4)toCam.set(1,0,0);
        const xAxis=new THREE.Vector3().crossVectors(yAxis,toCam).normalize(),zAxis=new THREE.Vector3().crossVectors(xAxis,yAxis);
        b.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis,yAxis,zAxis));}
      const inside=along>0&&along<b.len&&radial<b.tip+(b.r-b.tip)*(along/b.len)+40;
      const on=(q>=1?level(b.s):0)*(inside?.3:1),u=b.mesh.material.uniforms;u.time.value=t;u.strength.value+=(on*b.strength*.16-u.strength.value)*Math.min(1,dt*4);b.mesh.visible=u.strength.value>.002;
      b.dust.visible=q>=2&&b.mesh.visible;if(b.dust.visible){b.dust.material.opacity=Math.min(.2,u.strength.value*1.4);const p=b.dust.geometry.attributes.position;
        b.seed.forEach((d,i)=>{d.h=(d.h+dt*.01*d.sp)%1;d.a+=dt*.03*d.sp*(d.ph>50?1:-1);const w=Math.sin(t*.6+d.ph)*d.wob;   // drifting, not orbiting in rings
          p.setXYZ(i,Math.cos(d.a)*d.rr+w,-d.h*b.len+Math.sin(t*.4+d.ph*2)*d.wob,Math.sin(d.a)*d.rr+Math.cos(t*.5+d.ph)*d.wob);});p.needsUpdate=true;}}
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
    // Sanitise the HDR frame: a light right against a surface can overflow
    // half-float to Inf, and the bloom blur smears NaN/Inf into black blocks.
    composer.addPass(new ShaderPass({uniforms:{tDiffuse:{value:null}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);if(any(isnan(c))||any(isinf(c)))c=vec4(0.,0.,0.,1.);gl_FragColor=vec4(min(c.rgb,vec3(48.)),c.a);}'}));
    if(q>=2){gtao=new GTAOPass(scene,camera,w,h);gtao.output=GTAOPass.OUTPUT.Default;gtao.blendIntensity=1;
      gtao.updateGtaoMaterial({radius:28,distanceExponent:1.5,thickness:12,scale:1,samples:q>=3?16:10,distanceFallOff:1});
      gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:4,rings:2,samples:q>=3?16:8});composer.addPass(gtao);
      // AO renders the scene's depth and normals itself; see-through things
      // (light beams, dust, glass, decals) must not count as solid surfaces,
      // or they get shaded as dark bars.
      const aoRender=gtao.render.bind(gtao);
      gtao.render=(...args)=>{const hidden=[];scene.traverseVisible(o=>{const m=o.material;if((o.isMesh||o.isPoints||o.isSprite)&&[m].flat().some(x=>x?.transparent||x?.blending>1)){o.visible=false;hidden.push(o);}});
        try{aoRender(...args);}finally{for(const o of hidden)o.visible=true;}};
    }else gtao=null;
    bloom=new UnrealBloomPass(new THREE.Vector2(w,h),.28,.32,.9);composer.addPass(bloom);
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

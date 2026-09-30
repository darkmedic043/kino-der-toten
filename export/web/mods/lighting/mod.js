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
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { settings, onSettingsChange } from '../../settings.js';

const SWAP=.25;
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
// Light beams live in their own scene, drawn by the volumetric pass (setupPost).
const volScene=new THREE.Scene();
let VM=null;   // the first-person weapon's lights (set up in setup())
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

export default async function setup(api){
  const {scene,camera,session,data,host,renderer}=api;
  const kino=!api.map;
  // Light fixtures placed in the static map (chandeliers, sconces, hanging lamps,
  // mirror bulbs, stage lamps...), baked from kino.gltf's nodes.
  const fixtures=kino?await fetch(new URL('fixtures.json',import.meta.url)).then(r=>r.ok?r.json():[]).catch(()=>[]):[];
  if(renderer)setupPost(api);
  // First-person weapons are lit by their own scene: a flat ambient 2.8 plus
  // one light, which bleached every gun to grey-white. Give them a softer
  // ambient and a key/fill/rim set so metal and wood keep their contrast.
  if(api.viewScene){
    for(const l of [...api.viewScene.children])if(l.isAmbientLight){l.intensity=.6;l.color.set(0xf2e8da);}else if(l.isDirectionalLight){l.intensity=2.2;l.color.set(0xfff0dc);l.position.set(1.2,3,1.5);}
    const fill=new THREE.HemisphereLight(0xece6dc,0x2e2620,.7);const rim=new THREE.DirectionalLight(0xe6e2dc,.7);rim.position.set(-2,1.2,-2.5);
    api.viewScene.add(fill,rim);
    VM={amb:api.viewScene.children.find(l=>l.isAmbientLight),key:api.viewScene.children.find(l=>l.isDirectionalLight&&l!==rim),fill,rim};
  }
  if(kino)setupKino(api,fixtures);
}

// ---- Kino lights ------------------------------------------------------------------------------
function setupKino(api,fixtures=[]){
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
  // Fixtures from the map itself. Kinds: light colour, strength, reach, and
  // whether they need the power (chandeliers, stage lamps) or are always lit.
  const KIND={chandelier:{color:'#ffcf8f',intensity:10,radius:1300,drop:60,power:true},sconce:{color:'#ffc987',intensity:5,radius:460,power:false},
    hang:{color:'#ffd49a',intensity:5,radius:480,drop:20,power:false,beam:.45},dress:{color:'#ffdcae',intensity:4,radius:400,power:true},
    stage_on:{color:'#fff1d8',intensity:7,radius:900,power:true,beam:.6,along:true},cage_on:{color:'#ff9a3a',intensity:3,radius:300,power:true},
    street:{color:'#ffd9a0',intensity:6,radius:700,power:false},overhead:{color:'#fff0d6',intensity:6,radius:600,power:true},
    tinhat:{color:'#ffd49a',intensity:4,radius:450,power:true},wall:{color:'#ffd49a',intensity:4,radius:420,power:false}};
  const fixturePoints=[];
  for(const f of fixtures){
    const k=KIND[f.kind];if(!k)continue;const p=new THREE.Vector3(...f.p);fixturePoints.push(p);
    if(f.kind==='chandelier'&&(p.y<200||Math.abs(f.x[1])>.2))continue;   // the fallen chandelier on the theatre seats
    if(f.kind==='stage_on'&&p.y<300)continue;                            // stage lamps lying on the floor (props, not lights)
    if(f.kind==='sconce'&&Math.abs(f.x[1])>.5)continue;                   // a sconce knocked askew: broken, unlit
    const at=p.clone().add(new THREE.Vector3(0,-(k.drop??0),0));
    if(sources.some(s=>s.position.distanceTo(at)<55))continue;            // already lit by a map light
    const s={position:at,color:new THREE.Color(k.color),intensity:k.intensity*(f.kind==='dress'?Math.min(1.6,.7+(f.n??1)*.08):1),radius:k.radius,kind:k.power?'power':'solid',fixture:f.kind,beamOK:!!k.beam};
    if(k.along){const x=new THREE.Vector3(...f.x);s.spot={angle:.6,target:p.clone().addScaledVector(x,700),beam:k.beam};}
    else if(k.beam&&f.kind==='hang')s.spot={angle:.9,down:true,beam:k.beam};
    sources.push(s);
  }
  // Mystery box lamps: with the power on, a green lamp glows above wherever the
  // box currently is (a light source here plus a halo sprite, set up below).
  const boxLamps=[];
  for(const e of world.boxLocations??[]){
    const p=new THREE.Vector3(...e.position),hit=world.raycast?.(new THREE.Ray(p.clone().add(new THREE.Vector3(0,40,0)),new THREE.Vector3(0,1,0)),0,400);
    const at=p.clone().add(new THREE.Vector3(0,Math.min(150,(hit?.distance??150)+20),0));
    const src={position:at,color:new THREE.Color('#44ff6a'),intensity:4.5,radius:360,kind:'box',box:e.id,beamOK:false,fixture:'boxlamp',dir:new THREE.Vector3(0,-1,0),angle:1.3};
    sources.push(src);boxLamps.push(src);
  }
  // A beam must come out of something you can see: keep beams only on sources
  // at a real fixture (the map's ceiling 'spots' in the theatre have none).
  for(const s of sources)if(s.spot&&!s.beamOK&&!fixturePoints.some(p=>p.distanceTo(s.position)<130)&&!s.fixture)s.spot.beam=0;
  for(const s of sources)if(/chandelier1_off/.test(s.fixture??'')&&s.spot)s.spot.beam=0;   // chandeliers glow, they don't cast a cone
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
      const n=near.h.triangle?.getNormal(new THREE.Vector3())??near.d.clone().negate();n.y=0;n.normalize();
      // Face whichever side of the wall is the room: a fixture sitting a hair
      // behind the wall surface would otherwise put its light inside the wall.
      // The room side is where the players walk: the side with navmesh floor below it.
      const walk=d=>{const c=near.h.position.clone().addScaledVector(d,45);const q=world.closest?.(new THREE.Vector3(c.x,c.y-150,c.z),{x:25,y:260,z:25});return q?1/(1+Math.hypot(q.x-c.x,q.z-c.z)):0;};
      const open=d=>{const c=near.h.position.clone().addScaledVector(d,30).setY(s.position.y);return ray(c,d,600)?.distance??600;};
      // First choice: face the room the neighbouring lights are in (their centre).
      const mates=sources.filter(o=>o!==s&&o.position.distanceTo(s.position)<750);
      const centre=mates.length>=2?mates.reduce((v,o)=>v.add(o.position),new THREE.Vector3()).divideScalar(mates.length):null;
      const toward=centre?centre.clone().sub(near.h.position).setY(0):null;
      if(toward&&toward.length()>60){if(toward.dot(n)<0)n.negate();}
      else{const a=walk(n),b=walk(n.clone().negate());if(b>a||(a===b&&open(n.clone().negate())>open(n)))n.negate();}
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
    let near=500;for(const d of probes){const skip=s.fixture?25:0,h=ray(s.position.clone().addScaledVector(d,skip),d,500);if(h)near=Math.min(near,h.distance+skip);}   // fixtures: skip their own body
    if(near<2)near=12;   // the probe started inside geometry (a floor-level light): assume it is close
    s.near=near;s.cap=(near>40?10:3.2)*Math.pow(Math.max(near,6),1.3);   // lights hugging a surface stay strictly capped
  }

  // Darker base: less exposure and much less flat fill.
  renderer.toneMappingExposure=1.7;
  const fills=scene.children.filter(o=>o.isAmbientLight||o.isHemisphereLight||o.isDirectionalLight);
  const base=new Map(fills.map(l=>[l,l.intensity]));
  scene.fog=new THREE.FogExp2(0x0c0e11,.00042);scene.background=new THREE.Color(0x07080a);

  // Point-light pool (cheap, many sources).
  // The live light budget grows with quality (every light is paid for per pixel,
  // and changing the count recompiles shaders, so it only changes with the setting).
  const poolSize=q=>q>=3?20:q>=2?14:q>=1?10:8;
  const pool=[];
  function resizePool(n){
    while(pool.length<n){const l=new THREE.SpotLight(0xffffff,0,1,1.2,1,1.3);scene.add(l,l.target);pool.push(l);}
    while(pool.length>n){const l=pool.pop();scene.remove(l,l.target);l.dispose();}
  }
  resizePool(poolSize(quality()));
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
  // The analytic sky outputs physical radiance; through this exposure it was
  // blinding (and bloomed). Scale it down in its shader.
  sky.material.fragmentShader=sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );','gl_FragColor = vec4( texColor * 0.2, 1.0 );');
  sky.frustumCulled=false;sky.castShadow=sky.receiveShadow=false;shadowReady.add(sky);scene.add(sky);
  // The map's sky brushes (a 64 px placeholder filling roof holes and windows) would block the sun.
  const skyBrushes=[];scene.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>/sky_day/.test(m?.name??'')))skyBrushes.push(o);});
  const bounds=new THREE.Box3();scene.traverse(o=>{if(o.isMesh&&o!==sky&&!skyBrushes.includes(o)&&o.geometry){o.geometry.computeBoundingBox?.();if(o.geometry.boundingBox)bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
  const center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3()).length()*.5;
  const sun=new THREE.DirectionalLight(0xfff0da,0);sun.castShadow=true;sun.position.copy(center).addScaledVector(sunDir,extent*1.5);sun.target.position.copy(center);
  Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:1,far:extent*3.2});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-.0002;sun.shadow.normalBias=1.4;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;scene.add(sun,sun.target);
  let sunSig='',wasDay=null;
  // Sun shafts: trace sunlight down onto the map on a grid; spots it reaches
  // that still have a roof overhead are under a hole. Neighbouring spots form
  // one shaft, drawn back up along the sun (built in slices so loading doesn't stall).
  // Shafts are baked (mods/lighting/sunshafts.json, made by tracing once with
  // ?bakeShafts in the URL): tracing at runtime built a ray index over every map
  // mesh, which froze the first minute of play in ~0.75 s chunks.
  const warmSun=new THREE.Color('#fff1d6'),baked=[];
  const addShaft=b=>{baked.push(b);makeBeam({kind:'sun'},new THREE.Vector3(...b.top),into0.clone(),b.len,b.r,warmSun,1.1,.1,b.r*.95);};
  const into0=sunDir.clone().negate();
  (async()=>{
    if(!/bakeShafts/.test(location.search)){
      const table=await fetch(new URL('sunshafts.json',import.meta.url)).then(r=>r.ok?r.json():null).catch(()=>null);
      if(table){for(const b of table)addShaft(b);console.info('[lighting] sun shafts',table.length,'(baked)');return;}
    }
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
      addShaft({top:c.clone().addScaledVector(sunDir,len).toArray().map(v=>+v.toFixed(1)),len:+(len*.97).toFixed(1),r:+r.toFixed(1)});
    }
    console.info('[lighting] sun shafts',Math.min(28,groups.length),'from',lit.size,'sunlit spots');
  })();
  function applyDay(q){
    const on=day();if(on===wasDay&&sun.shadow.mapSize.x===(q>=3?4096:2048))return;wasDay=on;
    sky.visible=on;for(const o of skyBrushes)o.visible=!on;
    const size=q>=3?4096:2048;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
    sun.castShadow=on&&q>=1;sun.shadow.needsUpdate=true;
    scene.fog=on?new THREE.FogExp2(0x9aa7b3,.00016):new THREE.FogExp2(0x0c0e11,.00042);scene.background=on?null:new THREE.Color(0x07080a);
  }

  // Light beams: soft additive cones with drifting dust.
  const beams=[];
  // Volumetric beams: each beam is a slightly oversized cone drawn back faces
  // only; for every pixel the shader marches the view ray through the cone and
  // integrates a smooth density (Gaussian across the beam, fading along it,
  // stirred by drifting noise that reads as dust in the light), stopping at the
  // scene depth so beams end softly on walls and floors. There is no visible
  // surface, so no edge lines or rims, and it works from inside a beam.
  const beamMaterial=()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.BackSide,
    uniforms:{color:{value:new THREE.Color()},strength:{value:0},time:{value:0},apex:{value:new THREE.Vector3()},axis:{value:new THREE.Vector3()},
      len:{value:1},rTop:{value:1},rBot:{value:1},depthTex:{value:null},resolution:{value:new THREE.Vector2(1,1)},near:{value:1},far:{value:1},camForward:{value:new THREE.Vector3()}},
    vertexShader:`varying vec3 vWorld;void main(){vec4 wp=modelMatrix*vec4(position,1.);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader:`#include <packing>
      uniform vec3 color,apex,axis,camForward;uniform float strength,time,len,rTop,rBot,near,far;uniform sampler2D depthTex;uniform vec2 resolution;varying vec3 vWorld;
      float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){
        if(strength<=0.)discard;
        vec3 toFrag=vWorld-cameraPosition;float tExit=length(toFrag);vec3 rd=toFrag/tExit;
        float d=texture2D(depthTex,gl_FragCoord.xy/resolution).x;
        float sceneT=d>=1.?1e9:-perspectiveDepthToViewZ(d,near,far)/max(dot(rd,camForward),1e-3);
        float tEnd=min(tExit,sceneT),tStart=max(0.,tExit-(len+2.5*rBot));
        if(tEnd<=tStart)discard;
        float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))+time*.61803);
        const int STEPS=28;float stepL=(tEnd-tStart)/float(STEPS),acc=0.;
        for(int i=0;i<STEPS;i++){
          vec3 p=cameraPosition+rd*(tStart+(float(i)+jitter)*stepL),v=p-apex;float h=dot(v,axis);
          if(h<0.||h>len)continue;float u=h/len,R=mix(rTop,rBot,u),q=length(v-axis*h)/R;if(q>1.3)continue;
          float across=exp(-q*q*4.2),along=smoothstep(0.,.12,u)*(1.-smoothstep(.55,1.,u))/(1.+1.4*u);
          float dust=.55+.9*noise(p*.018+vec3(0.,time*.05,time*.02))*noise(p*.05-vec3(time*.03,0.,0.));
          acc+=across*along*dust*stepL;}
        // Forward scattering: dusty light glows brightest when you look back toward its source.
        float phase=mix(.7,1.45,pow(max(-dot(rd,axis),0.),4.));
        gl_FragColor=vec4(color*strength*phase*acc/max(rBot*.7,12.),1.);}`});
  const moteTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),r=g.createRadialGradient(16,16,0,16,16,16);
    r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.4,'rgba(255,255,255,.35)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);})();
  function makeBeam(src,top,dir,len,r,color,strength,warmth=.3,tip=.5){
    tip=Math.min(tip,r*.9);const axis=dir.clone().normalize();
    // Bounding cone, a little larger than the beam so the soft falloff fits inside.
    const g=new THREE.CylinderGeometry(tip*1.3+4,r*1.35,len*1.04,24,1,false).translate(0,-len*.52,0);
    const mesh=new THREE.Mesh(g,beamMaterial());mesh.position.copy(top);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),axis);
    const u=mesh.material.uniforms;u.color.value.copy(color).lerp(new THREE.Color('#fff'),warmth);u.apex.value.copy(top);u.axis.value.copy(axis);u.len.value=len;u.rTop.value=tip;u.rBot.value=r;
    volScene.add(mesh);
    const axisQ=mesh.quaternion.clone();
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
  // Candle halos: find each candle bulb (vertices mapped to the bulb block of
  // the chandelier texture) and give it a small soft glow, so a chandelier
  // reads as a cluster of little flames rather than a haze.
  const halos=[];
  {const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,'rgba(255,244,220,1)');r.addColorStop(.12,'rgba(255,214,150,.9)');r.addColorStop(.35,'rgba(255,170,80,.28)');r.addColorStop(1,'rgba(255,140,40,0)');
    g.fillStyle=r;g.fillRect(0,0,64,64);const glow=new THREE.CanvasTexture(c);glow.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({map:glow,color:0xffffff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});
    const points=[],v=new THREE.Vector3();
    scene.traverse(o=>{if(!o.isMesh||![o.material].flat().some(m=>/chandel/.test(m?.name??'')))return;const g=o.geometry,uv=g.attributes.uv,pos=g.attributes.position;if(!uv)return;o.updateWorldMatrix(true,false);
      const groups=g.groups.length?g.groups:[{start:0,count:g.index?g.index.count:pos.count,materialIndex:0}];
      for(const gr of groups){const m=[o.material].flat()[gr.materialIndex];if(!/chandel/.test(m?.name??''))continue;
        for(let i=gr.start;i<gr.start+gr.count;i++){const vi=g.index?g.index.getX(i):i;const u=uv.getX(vi),w=uv.getY(vi);
          if(u>=0&&u<.156&&w>=0&&w<.156){v.fromBufferAttribute(pos,vi).applyMatrix4(o.matrixWorld);if(!points.some(p=>p.distanceToSquared(v)<16))points.push(v.clone());}}}});
    // Merge nearby bulb vertices into one candle each.
    const candles=[];for(const p of points){const c=candles.find(c=>c.p.distanceTo(p)<5);if(c){c.sum.add(p);c.n++;c.p.copy(c.sum).divideScalar(c.n);}else candles.push({p:p.clone(),sum:p.clone(),n:1});}
    for(const c of candles){const sp=new THREE.Sprite(mat);sp.position.copy(c.p).add(new THREE.Vector3(0,2.5,0));sp.scale.setScalar(16);sp.renderOrder=6;scene.add(sp);halos.push(sp);}
    halos.material=mat;console.info('[lighting] candle halos',candles.length);}

  // Green halos for the box lamps.
  const boxHalos=boxLamps.map(src=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,'rgba(220,255,225,1)');r.addColorStop(.18,'rgba(90,255,120,.85)');r.addColorStop(.5,'rgba(40,220,80,.22)');r.addColorStop(1,'rgba(20,200,60,0)');g.fillStyle=r;g.fillRect(0,0,64,64);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));sp.position.copy(src.position);sp.scale.setScalar(26);scene.add(sp);return {src,sp};});
  // The box's beacon: the game's flat cylinder becomes a volumetric column of
  // light rising from the active box, with dust, following it when it moves.
  let boxBeam=null;
  if(world.boxBeam){
    world.boxBeam.visible=false;world.boxBeam.material.opacity=0;
    const len=1500,base=new THREE.Vector3().copy(world.boxBeam.position).add(new THREE.Vector3(0,-800,0));
    makeBeam({kind:'boxbeam'},base.clone().add(new THREE.Vector3(0,30,0)),new THREE.Vector3(0,1,0),len,34,new THREE.Color('#a9c8ff'),1.3,.25,9);
    boxBeam=beams.at(-1);boxBeam.base=base;boxBeam.lastKey='';
  }
  let timer=0,t=0,frame=0;
  const level=s=>s.kind==='off'?0:s.kind==='box'?(session.power&&world.activeBox?.id===s.box?1:0):s.kind==='boxbeam'?1:s.kind==='sun'?(day()?1:0):s.kind==='power'?(session.power?1:0):s.kind==='fire'?.85+Math.sin(t*23+s.position.x)*.1+Math.random()*.12:1;
  const tick=dt=>{
    t+=dt;timer-=dt;frame++;const q=quality();
    applyDay(q);const isDay=day();
    for(const l of fills){const scale=isDay?(l.isAmbientLight?.11:l.isHemisphereLight?.17:.05):(l.isAmbientLight?.12:l.isHemisphereLight?.14:.08),now=l.isAmbientLight?(session.power?1.5:1.1):base.get(l);l.intensity=now*scale;}
    // The sun needs its shadows (without them it would light every interior), so Low has none.
    sun.intensity=isDay&&q>=1?3.4:0;sky.position.copy(camera.position);
    // The world is static: redraw the sun's shadow only when a door opens or the power changes
    // (a full-map shadow render every 2 s was a periodic hitch).
    {const sig=(api.session.openDoors?.size??0)+'/'+api.session.power;if(isDay&&q>=1&&sig!==sunSig){sunSig=sig;sun.shadow.needsUpdate=true;}}
    if(timer<=0){
      timer=SWAP;const eye=camera.position;
      const score=s=>level(s)?s.intensity*s.radius/Math.max(80,s.position.distanceTo(eye)):0;
      const ranked=sources.map(s=>({s,score:score(s)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
      if(pool.length!==poolSize(q))resizePool(poolSize(q));
      assignPool(ranked.filter(r=>!r.s.spot||q<2));
      const nSpots=q>=3?3:q>=2?1:0;
      assign(spots,ranked.filter(r=>r.s.spot).slice(0,nSpots));
      // Shadow settings change only with the quality level (each change recompiles shaders).
      const size=q>=3?2048:1024,cast=q>=2;
      spots.forEach((l,i)=>{const on=cast&&i<nSpots;if(l.castShadow!==on)l.castShadow=on;if(l.shadow.mapSize.x!==size){l.shadow.mapSize.set(size,size);l.shadow.map?.dispose();l.shadow.map=null;}});
      for(const l of spots)l.shadow.needsUpdate=true;
    }
    for(const l of pool){const u=l.userData;
      // Handover: fade the old light out, then the new one in (about 1 s total), so lights never pop.
      if(u.next&&l.intensity<2){u.source=u.next;u.next=null;}
      const s=u.source,target=s&&!u.next&&!u.fadeOut?Math.min(s.intensity*560,s.cap)*level(s):0;if(s){l.position.copy(s.position);l.target.position.copy(s.position).add(s.dir??down);l.angle=s.angle??1.3;l.color.copy(s.color);l.distance=s.radius;}l.intensity+=(target-l.intensity)*Math.min(1,dt*(u.next?4:2.2));}
    for(const l of spots){const s=l.userData.source,target=s?Math.min(Math.min(9,s.intensity)*720,s.cap*1.6)*level(s):0;
      if(s){l.position.copy(s.position);l.target.position.copy(s.spot.target);l.color.copy(s.color);l.distance=s.radius*1.6;l.angle=Math.min(1.2,s.spot.angle);l.shadow.camera.far=l.distance;}
      l.intensity+=(target-l.intensity)*Math.min(1,dt*6);}   // never toggle .visible: that recompiles every lit shader
    // Shadows: the world is static, so refresh at 30 Hz on High and every frame on Ultra.
    if(q>=2&&frame%(q>=3?2:3)===0)for(const l of spots)l.shadow.needsUpdate=true;
    if((tagTimer-=dt)<=0){tagTimer=1;tagShadows(scene);}
    for(const b of beams){
      const on=q>=1?level(b.s):0,u=b.mesh.material.uniforms;u.time.value=t;u.strength.value+=(on*b.strength*.45-u.strength.value)*Math.min(1,dt*4);b.mesh.visible=u.strength.value>.002;
      b.dust.visible=q>=2&&b.mesh.visible;if(b.dust.visible){b.dust.material.opacity=Math.min(.2,u.strength.value*1.4);const p=b.dust.geometry.attributes.position;
        b.seed.forEach((d,i)=>{d.h=(d.h+dt*.01*d.sp)%1;d.a+=dt*.03*d.sp*(d.ph>50?1:-1);const w=Math.sin(t*.6+d.ph)*d.wob;   // drifting, not orbiting in rings
          p.setXYZ(i,Math.cos(d.a)*d.rr+w,-d.h*b.len+Math.sin(t*.4+d.ph*2)*d.wob,Math.sin(d.a)*d.rr+Math.cos(t*.5+d.ph)*d.wob);});p.needsUpdate=true;}}
    if(VM&&frame%3===0)lightTheGun(dt*3);
    for(const h of boxHalos){const on=level(h.src);h.sp.material.opacity+=(on*(.85+Math.sin(t*3)*.08)-h.sp.material.opacity)*Math.min(1,dt*3);h.sp.visible=h.sp.material.opacity>.01;}
    if(boxBeam){
      // Beam upward from the box: the column is brightest at the box, fading into the air above.
      const p=world.boxBeam.position,key=p.x+','+p.z;
      if(key!==boxBeam.lastKey){boxBeam.lastKey=key;const top=new THREE.Vector3(p.x,p.y-800+30,p.z),u=boxBeam.mesh.material.uniforms;
        boxBeam.top=top;boxBeam.mesh.position.copy(top);u.apex.value.copy(top);boxBeam.dust.position.copy(top);}
      boxBeam.s.kind=world.boxBeam.parent&&!world.fireSale?'boxbeam':'off';
    }
    for(const m of bulbs)m.emissiveIntensity+=((session.power?2.6:0)-m.emissiveIntensity)*Math.min(1,dt*3);
    if(halos.material){const target=session.power?.55+Math.sin(t*7.3)*.04+Math.sin(t*11.1)*.03:0;halos.material.opacity+=(target-halos.material.opacity)*Math.min(1,dt*3);}
  };
  host.on('update',tick);
  // Settle the light setup now (shadow casters, sun) so shaders compiled during
  // loading match the ones used in play; otherwise the first frame recompiled them all.
  tick(1/60);
  // The gun is drawn in its own scene; make its lights follow the world: sum
  // the live lights reaching the camera (distance, cone, and a wall check),
  // plus sunlight inside a sun shaft, then dim/tint/aim the gun's key light.
  const occl=new Map(),toL=new THREE.Vector3(),keyDir=new THREE.Vector3(),mix=new THREE.Color(),tmp=new THREE.Color();let gunLevel=1,occlFrame=0;
  function lightTheGun(dt){
    const cam=camera.position;let sum=0;keyDir.set(0,0,0);mix.setRGB(0,0,0);occlFrame++;
    for(const l of [...pool,...spots]){
      if(l.intensity<1||!l.distance)continue;toL.copy(l.position).sub(cam);const d=toL.length();if(d>l.distance)continue;
      const along=l.target.position.clone().sub(l.position).normalize(),cosA=-toL.dot(along)/Math.max(d,1e-3),c0=Math.cos(l.angle);
      const cone=THREE.MathUtils.clamp((cosA-c0)/Math.max(1e-3,1-c0)*2.5,0,1);if(cone<=0)continue;
      if(!occl.has(l)||occlFrame%4===0){const hit=ray(cam,toL.clone().normalize(),Math.max(1,d-20));occl.set(l,hit?0:1);}
      const c=l.intensity*Math.pow(1-d/l.distance,2)*cone*occl.get(l)/(d*d+2500);if(c<=0)continue;
      sum+=c;keyDir.addScaledVector(toL.normalize(),c);mix.add(tmp.copy(l.color).multiplyScalar(c));
    }
    // Sunlight: standing inside a sun shaft.
    for(const b of beams)if(b.s.kind==='sun'&&b.mesh.visible){const rel=cam.clone().sub(b.top),a=rel.dot(b.dir);if(a>0&&a<b.len&&rel.addScaledVector(b.dir,-a).length()<b.r){const c=.12;sum+=c;keyDir.addScaledVector(sunDir,c);mix.add(tmp.setRGB(1,.95,.86).multiplyScalar(c));}}
    const target=THREE.MathUtils.clamp(.22+sum*8,.22,1.3);gunLevel+=(target-gunLevel)*Math.min(1,dt*3);
    VM.key.intensity=2.2*gunLevel;VM.amb.intensity=.6*(.45+.55*gunLevel);VM.fill.intensity=.7*(.4+.6*gunLevel);VM.rim.intensity=.7*(.3+.7*gunLevel);
    if(sum>0){mix.multiplyScalar(1/sum);VM.key.color.lerp(tmp.setRGB(Math.min(1,.55+mix.r*.6),Math.min(1,.55+mix.g*.6),Math.min(1,.55+mix.b*.6)),Math.min(1,dt*2));
      // Key light from the brightest direction, in the gun's (camera) space.
      const v=keyDir.normalize().applyQuaternion(camera.quaternion.clone().invert());VM.key.position.lerp(v.multiplyScalar(4).add(new THREE.Vector3(0,1.2,0)),Math.min(1,dt*2));}
  }
  // Keep lights that stay chosen on their current source to avoid pops.
  // Hysteresis: a waiting light takes a slot only from one it clearly outshines,
  // so small moves don't swap lights back and forth.
  function assignPool(ranked){
    const n=pool.length,score=new Map(ranked.map(r=>[r.s,r.score])),want=ranked.slice(0,n);
    const keep=new Set(ranked.slice(0,Math.ceil(n*1.5)).map(r=>r.s));
    for(const l of pool){const u=l.userData;if(u.source&&!keep.has(u.source)&&!u.next)u.fadeOut=true;}
    const busy=new Set(pool.flatMap(l=>[l.userData.source,l.userData.next]).filter(Boolean));
    for(const {s,score:sc} of want){
      if(busy.has(s))continue;
      let slot=pool.find(l=>!l.userData.source&&!l.userData.next)??pool.find(l=>l.userData.fadeOut&&!l.userData.next);
      if(!slot){const weakest=pool.filter(l=>!l.userData.next).sort((a,b)=>(score.get(a.userData.source)??0)-(score.get(b.userData.source)??0))[0];
        if(weakest&&(score.get(weakest.userData.source)??0)*1.4<sc)slot=weakest;}
      if(!slot)continue;
      if(slot.userData.source)slot.userData.next=s;else slot.userData.source=s;
      slot.userData.fadeOut=false;busy.add(s);
    }
    // Lights no longer wanted at all fade out and free their slot.
    for(const l of pool){const u=l.userData;if(u.fadeOut&&!u.next&&l.intensity<2){u.source=null;u.fadeOut=false;}}
  }
  function assign(lights,ranked){
    const chosen=new Set(ranked.map(r=>r.s));
    for(const l of lights)if(l.userData.source&&!chosen.has(l.userData.source))l.userData.source=null;
    const taken=new Set(lights.map(l=>l.userData.source).filter(Boolean));
    for(const {s} of ranked)if(!taken.has(s)){const l=lights.find(l=>!l.userData.source);if(!l)break;l.userData.source=s;l.intensity=0;taken.add(s);}
  }
  window.kino.lighting={sources,pool,spots,beams,volScene,shafts:baked,tag:tagShadows};
}

// ---- Volumetric beams pass -----------------------------------------------------------------------
// Renders the beam volumes at half resolution into their own target (they read
// the scene depth, which must not be attached to the target being drawn), then
// adds the result onto the frame before AO and bloom.
class VolumetricPass extends Pass{
  constructor(volScene,camera){
    super();this.volScene=volScene;this.camera=camera;this.needsSwap=false;
    this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
    this.quad=new FullScreenQuad(new THREE.ShaderMaterial({uniforms:{tVol:{value:null}},transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D tVol;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(tVol,vUv).rgb,1.);}'}));
    this.forward=new THREE.Vector3();
  }
  setSize(w,h){this.target.setSize(Math.max(1,Math.floor(w/2)),Math.max(1,Math.floor(h/2)));}
  render(renderer,writeBuffer,readBuffer){
    if(!this.volScene.children.some(o=>o.visible))return;
    const cam=this.camera;cam.getWorldDirection(this.forward);
    for(const o of this.volScene.children){const u=o.material?.uniforms;if(!u)continue;
      u.depthTex.value=readBuffer.depthTexture;u.resolution.value.set(this.target.width,this.target.height);u.near.value=cam.near;u.far.value=cam.far;u.camForward.value.copy(this.forward);}
    const old=renderer.getRenderTarget(),oldClear=renderer.autoClear;
    renderer.setRenderTarget(this.target);renderer.setClearColor(0x000000,0);renderer.clear(true,false,false);renderer.autoClear=false;
    renderer.render(this.volScene,cam);
    renderer.setRenderTarget(readBuffer);this.quad.material.uniforms.tVol.value=this.target.texture;this.quad.render(renderer);
    renderer.setRenderTarget(old);renderer.autoClear=oldClear;
  }
  dispose(){this.target.dispose();this.quad.dispose();}
}

// ---- Post-processing (all maps) ----------------------------------------------------------------
function setupPost(api){
  const {renderer,scene,camera,host}=api;
  let composer=null,renderPass=null,volPass=null,gtao=null,bloom=null,builtFor=-1;
  const size=()=>{const v=renderer.getSize(new THREE.Vector2());return [Math.max(1,v.x),Math.max(1,v.y)];};
  function build(q){
    composer?.dispose?.();composer=null;builtFor=q;
    if(q<1)return;
    const [w,h]=size(),target=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,samples:4});
    target.depthTexture=new THREE.DepthTexture(w,h);   // the volumetric beams read the scene depth
    composer=new EffectComposer(renderer,target);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);
    renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
    volPass=new VolumetricPass(volScene,camera);composer.addPass(volPass);
    // Sanitise the HDR frame: a light right against a surface can overflow
    // half-float to Inf, and the bloom blur smears NaN/Inf into black blocks.
    composer.addPass(new ShaderPass({uniforms:{tDiffuse:{value:null}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);if(any(isnan(c))||any(isinf(c)))c=vec4(0.,0.,0.,1.);gl_FragColor=vec4(min(c.rgb,vec3(48.)),c.a);}'}));
    if(q>=3){gtao=new GTAOPass(scene,camera,w,h);gtao.output=GTAOPass.OUTPUT.Default;gtao.blendIntensity=1;
      gtao.updateGtaoMaterial({radius:28,distanceExponent:1.5,thickness:12,scale:1,samples:q>=3?16:10,distanceFallOff:1});
      gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:4,rings:2,samples:q>=3?16:8});composer.addPass(gtao);
      // AO renders the scene's depth and normals itself; see-through things
      // (light beams, dust, glass, decals) must not count as solid surfaces,
      // or they get shaded as dark bars.
      const aoRender=gtao.render.bind(gtao);
      gtao.render=(...args)=>{const hidden=[];scene.traverseVisible(o=>{const m=o.material;if((o.isMesh||o.isPoints||o.isSprite)&&[m].flat().some(x=>x?.transparent||x?.blending>1)){o.visible=false;hidden.push(o);}});
        try{aoRender(...args);}finally{for(const o of hidden)o.visible=true;}};
    }else gtao=null;
    bloom=new UnrealBloomPass(new THREE.Vector2(w,h),.28,.32,1.05);composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const resize=()=>{if(!composer)return;const [w,h]=size();composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);};
  addEventListener('resize',()=>setTimeout(resize,200));
  onSettingsChange((s,key)=>{if(key==='graphics'||key===null)build(quality());if(key==='renderScale')setTimeout(resize,50);});
  build(quality());
  host.renderWorld=(sceneToDraw,cam)=>{
    if(builtFor!==quality())build(quality());
    if(!composer){renderer.render(sceneToDraw,cam);return;}
    renderPass.camera=cam;volPass.camera=cam;if(gtao)gtao.camera=cam;
    const [w,h]=size();if(composer.renderTarget1.width!==Math.floor(w*renderer.getPixelRatio()))resize();
    composer.render();
  };
}

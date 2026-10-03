// Moon's lighting (the lighting mod's Moon path; mod.js keeps bloom/AO and the gun lights).
//
// BO1 baked Moon's lighting into lightmaps we don't have, so the map was lit by
// a flat ambient + hemisphere + key light: everything evenly bright, no shadows.
// Here the map's own lamp models (ceiling fixtures, tube lights, light boxes,
// the yellow beam lamps, Area 51's floodlights) and its 14 light entities
// become light sources. A pool of spotlights follows the strongest ones near
// the camera (aimed down, wide, soft) and fades between them. On the lunar
// surface a low, hard sun from the level's worldspawn (16° up) casts long
// shadows, from a shadow map that follows the player. The flat fill is
// turned down so rooms get light pools and dark corners, lamp materials glow
// (and bloom), and the power switch brightens the station.
import * as THREE from 'three';

// Lamp models in moon.gltf (instanced nodes `i_<model>_<n>`): colour, strength, reach.
const LAMPS={
  p_zom_moon_light_fixture:{color:'#dfe9ff',intensity:7,radius:620},
  p_zom_moon_light_fixture_blue:{color:'#6aa6ff',intensity:7,radius:560},
  p_zom_moon_light_fixture_yellow:{color:'#ffcf6a',intensity:7,radius:560},
  p_zom_moon_yellow_lightbeam_on:{color:'#ffc457',intensity:6,radius:480},
  p_zom_moon_tube_light:{color:'#e6f1ff',intensity:7,radius:640},
  p_zom_moon_tube_light_red:{color:'#ff3b2c',intensity:6,radius:480},
  p_zom_moon_tube_light_green:{color:'#55ff7c',intensity:6,radius:480},
  p_zom_moon_tube_light_yellow:{color:'#ffd65a',intensity:6,radius:480},
  p_glo_light_box_on:{color:'#fff2d8',intensity:5,radius:460},
  p_zom_light_box_on_red:{color:'#ff3a2a',intensity:5,radius:460},
  zombie_zapper_cagelight:{color:'#ff9a3a',intensity:3,radius:300},
  zombie_trap_switch_light:{color:'#ff5a3a',intensity:2,radius:220},
  p_a51_lights_tall_floodlight_a:{color:'#fff0cf',intensity:10,radius:2600,earth:true},
};
// Materials of lit lamps: they glow, so bloom picks them up.
const GLOWING=/fixture_on|lightfixture|tube_light(?!_off)|tube_light_(red|green|ye)|lightbox_on|yellow_ligh|lab_light_neon|lampost|teleporter_glow|filament/i;

export function setupMoon(api,{quality,LIGHT_CLAMP}){
  const {scene,camera,renderer,data,host}=api;
  let st={};const readState=()=>{st=api.getState?.()?.moon??{};};   // the full engine snapshot: read it 4× a second, not every frame
  // ---- sources -------------------------------------------------------------------------------
  const sources=[],P=new THREE.Vector3();
  const add=(position,color,intensity,radius,extra={})=>{
    // Neighbouring lamps (rows of beam lamps, twin tubes) share one light.
    const near=sources.find(s=>s.position.distanceTo(position)<90&&s.color.equals(color));
    if(near){near.intensity=Math.min(near.intensity*1.25,12);near.radius=Math.max(near.radius,radius)*1.05;return;}
    sources.push({position,color,intensity,radius,...extra});
  };
  scene.traverse(o=>{
    const m=/^i_(.+?)(?:[_.]\d+)?$/.exec(o.name);const k=m&&LAMPS[m[1]];if(!k)return;
    o.getWorldPosition(P);add(P.clone().add(new THREE.Vector3(0,k.earth?-40:-14,0)),new THREE.Color(k.color),k.intensity,k.radius,{earth:!!k.earth});
  });
  for(const e of data.entities??[]){
    if(e.classname!=='light'||!e.position)continue;
    const [r,g,b]=String(e._color??'1 1 1').trim().split(/\s+/).map(Number);
    // light_off: the amber emergency lamps the power switch turns on.
    add(new THREE.Vector3(...e.position),new THREE.Color(r,g,b),Math.min(9,(+e.intensity||10)/2.5),(+e.radius||300)*1.6,{power:e.targetname==='light_off',flicker:e.targetname==='fire_flicker',earth:e.position[0]>9000});
  }
  console.info('[lighting] moon sources',sources.length);

  // Lamp materials glow.
  const glow=new Set();
  scene.traverse(o=>{if(!o.isMesh)return;for(const m of [o.material].flat())if(m?.emissive&&GLOWING.test(m.name??'')&&!glow.has(m)){glow.add(m);
    if(m.map&&!m.emissiveMap){m.emissiveMap=m.map;m.needsUpdate=true;}m.emissive.set(0xffffff);m.emissiveIntensity=1.2;}});

  // ---- the flat fill, turned down --------------------------------------------------------------
  const fills=[];scene.traverse(o=>{if(o.isAmbientLight||o.isHemisphereLight||(o.isDirectionalLight&&!o.castShadow))fills.push(o);});
  const base=new Map(fills.map(l=>[l,l.intensity]));

  // ---- the sun -------------------------------------------------------------------------------
  // worldspawn sundirection "-16.28 56.06 0" (pitch, yaw) in BO1's z-up axes; the export maps (x,y,z) → (x,z,-y).
  const ws=(data.entities??[]).find(e=>e.classname==='worldspawn')??{};
  const [pitch,yaw]=String(ws.sundirection??'-16.28 56.06 0').split(/\s+/).map(v=>THREE.MathUtils.degToRad(+v));
  const sunDir=new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw),-Math.sin(pitch),-Math.cos(pitch)*Math.sin(yaw)).normalize();
  const [sr,sg,sb]=String(ws.suncolor??'.84 .89 .89').split(/\s+/).map(Number);
  const sun=new THREE.DirectionalLight(new THREE.Color(sr,sg,sb),0);sun.castShadow=true;
  const R=2400;Object.assign(sun.shadow.camera,{left:-R,right:R,top:R,bottom:-R,near:10,far:9000});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-.0003;sun.shadow.normalBias=1.6;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;scene.add(sun,sun.target);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const shadowReady=new WeakSet();
  const tagShadows=root=>root.traverse(o=>{if(!o.isMesh||shadowReady.has(o))return;shadowReady.add(o);
    for(const x of [o.material].flat())if(x&&!x.isShaderMaterial&&x.defines?.LIGHT_CLAMP!==LIGHT_CLAMP){x.defines={...x.defines,LIGHT_CLAMP};x.needsUpdate=true;}
    const m=[o.material].flat()[0],sky=/sky/i.test(m?.name??''),glass=/glass|window_warehouse/i.test(m?.name??'');   // the biodome's dome and the windows let the sun in
    o.castShadow=!sky&&!glass&&!m?.transparent&&!(m?.blending>1)&&!glow.has(m);o.receiveShadow=!sky;});
  tagShadows(scene);let tagTimer=0;
  const snap=new THREE.Vector3(Infinity,0,0);let sunTimer=0,sunSig='';
  function placeSun(force){
    // Follow the player in 200-unit steps (a moving shadow map shimmers); redraw on a move,
    // a door, or every half second on High so zombies and the player cast shadows too.
    const c=camera.position,q=quality();
    const moved=Math.abs(c.x-snap.x)>200||Math.abs(c.z-snap.z)>200||Math.abs(c.y-snap.y)>200;
    if(moved){snap.set(Math.round(c.x/200)*200,Math.round(c.y/200)*200,Math.round(c.z/200)*200);sun.target.position.copy(snap);sun.position.copy(snap).addScaledVector(sunDir,4500);sun.target.updateMatrixWorld();}
    const size=q>=3?4096:2048;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
    if(force||moved||(q>=2&&sunTimer<=0)){sun.shadow.needsUpdate=true;sunTimer=q>=3?.15:.4;}
  }

  // ---- the light pool --------------------------------------------------------------------------
  const poolSize=q=>q>=3?20:q>=2?14:q>=1?10:6;
  const pool=[];
  function resizePool(n){
    while(pool.length<n){const l=new THREE.SpotLight(0xffffff,0,1,1.35,1,1.3);l.userData={};scene.add(l,l.target);pool.push(l);}
    while(pool.length>n){const l=pool.pop();scene.remove(l,l.target);l.dispose();}
  }
  resizePool(poolSize(quality()));
  let t=0,timer=0,power=0;
  const level=s=>(s.power?power:.55+.45*power)*(s.flicker?.85+Math.sin(t*23+s.position.x)*.1+Math.random()*.1:1);
  const tick=dt=>{
    t+=dt;timer-=dt;sunTimer-=dt;if(timer<=0)readState();const q=quality(),moon=!!st.onMoon;
    power+=((st.power?1:0)-power)*Math.min(1,dt*1.5);
    // The fill: dim inside the station, a little brighter on Earth's overcast yard.
    for(const l of fills){const k=moon?(l.isAmbientLight?.3:l.isHemisphereLight?.28:.12):(l.isAmbientLight?.45:l.isHemisphereLight?.42:.3);l.intensity=base.get(l)*k*(1+.25*power*moon);}
    sun.intensity=q>=1?(moon?3.2:1.1):0;sun.castShadow=true;
    if(q>=1)placeSun(false);
    if((tagTimer-=dt)<=0){tagTimer=1;tagShadows(scene);}
    if(timer<=0){
      timer=.25;if(pool.length!==poolSize(q))resizePool(poolSize(q));
      const eye=camera.position,ranked=sources.filter(s=>s.earth!==moon).map(s=>({s,score:level(s)*s.intensity*s.radius/Math.max(80,s.position.distanceTo(eye))}))
        .filter(r=>r.score>0&&r.s.position.distanceTo(eye)<r.s.radius*3).sort((a,b)=>b.score-a.score).slice(0,pool.length);
      const want=new Set(ranked.map(r=>r.s));
      // Keep lights that still rank; free the rest (they fade out first, then take a new source).
      for(const l of pool){const u=l.userData;if(u.source&&!want.has(u.source))u.fadeOut=true;}
      const held=new Set(pool.map(l=>l.userData.source).filter(Boolean));
      for(const {s} of ranked){if(held.has(s))continue;const slot=pool.find(l=>!l.userData.source)??pool.find(l=>l.userData.fadeOut&&!l.userData.next);if(!slot)break;
        if(slot.userData.source)slot.userData.next=s;else slot.userData.source=s;held.add(s);}
    }
    for(const l of pool){const u=l.userData;
      if((u.fadeOut||u.next)&&l.intensity<2){u.source=u.next??null;u.next=null;u.fadeOut=false;}
      const s=u.source,target=s&&!u.fadeOut&&!u.next?s.intensity*520*level(s):0;
      if(s&&!u.fadeOut&&!u.next){l.position.copy(s.position);l.target.position.copy(s.position).add(DOWN);l.color.copy(s.color);l.distance=s.radius;}
      l.intensity+=(target-l.intensity)*Math.min(1,dt*(target<l.intensity?4:1.6));   // never toggle .visible: it recompiles every lit shader
    }
    for(const m of glow)m.emissiveIntensity=.7+.8*power;
  };
  host.on('update',tick);
  readState();placeSun(true);tick(1/60);
  return {sources,pool,sun,tag:tagShadows};
}
const DOWN=new THREE.Vector3(0,-1,0);

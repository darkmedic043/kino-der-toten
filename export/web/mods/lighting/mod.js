// Map lighting for Kino: the level's exported light entities and light
// fixtures become point lights, and the flat fill light is dimmed so rooms get
// real light pools. Only POOL lights exist at once (each is costly in WebGL);
// every few frames they move to the strongest sources near the camera.
import * as THREE from 'three';

const POOL=12,SWAP=.25;
const FIXTURES={zombie_theater_chandelier1_off:{color:'#ffd9a0',intensity:9,radius:700,drop:40,power:true},
  zombie_theater_chandelier1arm_off:{color:'#ffcf8a',intensity:4,radius:380,drop:12,power:true},
  lights_hang_single:{color:'#ffd49a',intensity:5,radius:420,drop:30,power:false},
  p_glo_stage_light:{color:'#fff0d0',intensity:7,radius:650,drop:0,power:true}};

export default function setup(api){
  if(api.map)return;           // custom maps light themselves with their glTF lights
  const {scene,camera,session,data,host}=api;
  const rgb=s=>{const [r,g,b]=String(s).trim().split(/\s+/).map(Number);return r+g+b>0?new THREE.Color(r,g,b):new THREE.Color('#fff4dc');};
  const sources=[];
  for(const e of data.entities){
    if(e.classname==='light'&&e.position){
      const kind=e.targetname==='fire_flicker'?'fire':e.targetname==='light_solid'?'solid':'power';
      sources.push({position:new THREE.Vector3(...e.position),color:rgb(e.script_light2_color??e._color),intensity:Math.min(10,+e.intensity||8),radius:(+e.radius||500)*1.3,kind});
    }
    const f=FIXTURES[e.model?.replace(/^,/,'')];
    if(e.classname==='script_model'&&f)sources.push({position:new THREE.Vector3(...e.position).add(new THREE.Vector3(0,-f.drop,0)),color:new THREE.Color(f.color),intensity:f.intensity,radius:f.radius,kind:f.power?'power':'solid'});
  }
  // Dim the uniform fill; keep a little so nothing goes pitch black.
  const fills=scene.children.filter(o=>o.isAmbientLight||o.isHemisphereLight||o.isDirectionalLight);
  const base=new Map(fills.map(l=>[l,l.intensity]));
  const pool=[...Array(POOL)].map(()=>{const l=new THREE.PointLight(0xffffff,0,1,1.3);l.userData.target=0;scene.add(l);return l;});
  let timer=0,t=0;
  const level=s=>s.kind==='power'?(session.power?1:0):s.kind==='fire'?.85+Math.sin(t*23+s.position.x)*.1+Math.random()*.12:1;
  host.on('update',dt=>{
    t+=dt;timer-=dt;
    for(const l of fills){const scale=l.isAmbientLight?.28:l.isHemisphereLight?.3:.25,now=l.isAmbientLight?(session.power?1.7:1.2):base.get(l);l.intensity=now*scale;}
    if(timer<=0){
      timer=SWAP;const eye=camera.position;
      const ranked=sources.map(s=>({s,score:level(s)?s.intensity*s.radius/Math.max(80,s.position.distanceTo(eye)):0})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,POOL);
      // Keep lights that are still chosen on their current source to avoid pops.
      const chosen=new Set(ranked.map(r=>r.s)),free=pool.filter(l=>!chosen.has(l.userData.source));
      for(const l of pool)if(l.userData.source&&!chosen.has(l.userData.source))l.userData.source=null;
      const assigned=new Set(pool.map(l=>l.userData.source).filter(Boolean));
      for(const {s} of ranked)if(!assigned.has(s)){const l=free.find(l=>!l.userData.source);if(!l)break;l.userData.source=s;l.intensity=0;}
    }
    for(const l of pool){
      const s=l.userData.source,target=s?s.intensity*level(s)*560:0;
      if(s){l.position.copy(s.position);l.color.copy(s.color);l.distance=s.radius;}
      l.intensity+=(target-l.intensity)*Math.min(1,dt*6);
    }
  });
  window.kino.lighting={sources,pool};
}

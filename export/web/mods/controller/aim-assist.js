// Controller aim assist (2026-10-28, user: "can you give controller aim assist? and make sure the deadshot aim assist
// where aim assist goes to their head works too?"). Console Call of Duty's three parts, for the right stick only:
//  - slowdown: the look speed drops while the crosshair is over a target (more while aiming down sights),
//  - tracking: while you move or turn, the aim follows part of the target's angular motion (rotational assist),
//  - ADS snap: pulling the aim trigger with a target near the crosshair swings onto it over ~0.13 s (BO1's lock-on).
// The aim point is the chest; with Deadshot Daiquiri it is the head (BO1's console Deadshot). Setting padAimAssist:
// 0 off, 1 standard, 2 strong. Targets need a clear line from the eye (world.lineClear), checked for the best 3 only.
import * as THREE from 'three';

const LEVELS=[null,
  {slow:.4,adsSlow:.55,track:.4,adsTrack:.55,snap:.12,range:1800},    // standard
  {slow:.55,adsSlow:.7,track:.6,adsTrack:.75,snap:.17,range:2400}];   // strong
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

export function createAimAssist(api){
  const {camera,session}=api,E=()=>api.enemies??{list:[]},W=()=>api.world??{};
  const tmp=new THREE.Vector3();
  let target=null,last=null,snapT=0,wasAds=false;
  const state={target:null,point:null,head:false,err:0,scale:1,snapping:false};
  const deadshot=()=>!!session.perks?.has?.('specialty_deadshot');
  // the chest (72% of the way from the feet to the head) or, with Deadshot, the head
  function aimPoint(z,head){
    const feet=z.root.position,top=E().headPosition?.(z)??feet.clone().add(tmp.set(0,z.kind==='zombie'?63:28,0));
    return head?top:feet.clone().lerp(top,.72);
  }
  // yaw/pitch that would put the crosshair on p, and its size: the body's angular half-width plus a margin
  function angles(p){
    const v=tmp.copy(p).sub(camera.position),flat=Math.hypot(v.x,v.z),dist=v.length();
    return {yaw:Math.atan2(-v.x,-v.z),pitch:Math.atan2(v.y,flat),dist};
  }
  const errOf=a=>Math.hypot(wrap(a.yaw-camera.rotation.y),a.pitch-camera.rotation.x);
  const bubbleOf=(z,dist,lv)=>Math.atan2((z.hit?.r??18)+10,Math.max(1,dist))*(lv===LEVELS[2]?1.3:1)+.012;
  function pick(lv,cone,head){
    const c=[];
    for(const z of E().list??[]){
      if(z.state==='dead'||z.health<=0)continue;
      const p=aimPoint(z,head),a=angles(p);if(a.dist>lv.range)continue;
      const e=errOf(a),lim=cone??bubbleOf(z,a.dist,lv)*1.6;if(e<lim)c.push({z,p,a,e});
    }
    c.sort((x,y)=>x.e-y.e);
    for(const t of c.slice(0,3))if(!W().lineClear||W().lineClear(camera.position.clone(),t.p))return t;
    return null;
  }

  // Called once a frame after the stick has turned the camera (dt in seconds). Returns the look-speed factor for
  // the next frame's stick input. ads = aim trigger held, moving / turning = left / right stick deflection.
  function step(dt,{level,ads,moving,turning}){
    const lv=LEVELS[level|0];
    if(!lv||!dt){target=last=null;snapT=0;wasAds=ads;Object.assign(state,{target:null,point:null,scale:1,snapping:false});return 1;}
    const head=deadshot();
    // ADS snap: on the trigger pull, the closest target inside the snap cone
    if(ads&&!wasAds){const t=pick(lv,lv.snap,head);if(t){target=t.z;snapT=.13;}}
    wasAds=ads;
    let t=null;
    if(target&&E().list?.includes(target)&&target.health>0){   // stay on the current target while it's near and in sight
      const p=aimPoint(target,head),a=angles(p);t={z:target,p,a,e:errOf(a)};
      if(!snapT&&(t.e>bubbleOf(target,a.dist,lv)*2||a.dist>lv.range||W().lineClear&&!W().lineClear(camera.position.clone(),p)))t=null;}
    if(!t){snapT=0;t=pick(lv,null,head);}
    if(!t){target=last=null;snapT=0;Object.assign(state,{target:null,point:null,scale:1,snapping:false});return 1;}
    if(t.z!==target){target=t.z;last=null;}
    const dy=wrap(t.a.yaw-camera.rotation.y),dp=t.a.pitch-camera.rotation.x;
    if(snapT>0){   // ease the remaining error out over the snap time
      const k=Math.min(1,dt/snapT);camera.rotation.y+=dy*k;camera.rotation.x=Math.max(-1.5,Math.min(1.5,camera.rotation.x+dp*k));
      snapT=Math.max(0,snapT-dt);
    }else if(last&&(moving>.1||turning>.1)){   // tracking: follow the target's angular motion since the last frame
      const tr=ads?lv.adsTrack:lv.track;
      camera.rotation.y+=wrap(t.a.yaw-last.yaw)*tr;camera.rotation.x=Math.max(-1.5,Math.min(1.5,camera.rotation.x+(t.a.pitch-last.pitch)*tr));
    }
    last={yaw:t.a.yaw,pitch:t.a.pitch};
    const inside=t.e<bubbleOf(t.z,t.a.dist,lv),scale=inside?1-(ads?lv.adsSlow:lv.slow):1;
    Object.assign(state,{target:t.z,point:t.p,head,err:t.e,scale,snapping:snapT>0});
    return scale;
  }
  function reset(){target=last=null;snapT=0;wasAds=false;}
  return {step,reset,state};
}

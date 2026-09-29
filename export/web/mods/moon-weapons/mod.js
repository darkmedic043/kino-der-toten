// Moon's wonder weapons (original T5 assets from this project's Moon export)
// on Kino and custom maps: Zap Guns (dual wield) <-> Wave Gun (press B), and
// the Death Machine. Moon uses bespoke firing code; here they are instant-hit
// weapons whose special effects are added through mod events.
import * as THREE from 'three';
import { loadModel, loadAnimation } from '../../animation.js';

const IDS=['microwavegundw_zm','microwavegun_zm','minigun_zm'];
const UPGRADE_NAMES={microwavegundw_zm:"Porter's Zap Guns",microwavegun_zm:"Porter's Mark II Ray Gun"};
const SHOT_SOUNDS={microwavegundw_zm:'moon/wpn/microwave/dw/plr/microwave_shot',microwavegun_zm:'moon/wpn/microwave/rifle/plr/microwave_rifle_shot'};

export async function prepare(data){
  const moon=await fetch(new URL('moon/combat-data.json',document.baseURI)).then(r=>r.json());
  for(const id of IDS){
    const def=structuredClone(moon.weapons[id]);if(!def)continue;
    // Hit-scan instead of Kino's slow projectile path; effects come from setup().
    Object.assign(def,{projectileSpeed:0,explosionRadius:0});
    if(def.upgrade)Object.assign(def.upgrade,{projectileSpeed:0,explosionRadius:0,name:def.upgrade.name??UPGRADE_NAMES[id]});
    data.weapons[id]=def;
  }
  data.boxPool=[...new Set([...(data.boxPool??[]),'microwavegun_zm','minigun_zm'])];
  return data;
}

export default async function setup(api){
  const {host,session,enemies,world,camera,scene,audio,data}=api;
  // Moon's weapon sounds: merge just the wonder-weapon cues into this map's audio.
  try{
    const manifest=await fetch(new URL('moon/audio/manifest.json',document.baseURI)).then(r=>r.json());
    for(const [k,v] of Object.entries(manifest))if(/moon\/wpn\/(microwave|lmg\/minigun)/.test(k))audio.manifest[k]=v;
  }catch{}
  const minigunShot=Object.keys(audio.manifest).find(k=>/lmg\/minigun\/.*plr.*(loop|shot)/.test(k));
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def)=>{
    const id=def?.baseId??def?.id;
    if(kind==='shot'&&SHOT_SOUNDS[id]){audio.play(SHOT_SOUNDS[id],.8);return;}
    if(kind==='shot'&&id==='minigun_zm'&&minigunShot){audio.play(minigunShot,.55);return;}
    weaponSound(kind,def);
  };
  const current=()=>session.weapon?.id;

  // Zap Guns: any hit kills.
  host.on('beforeEnemyDamage',e=>{if(current()==='microwavegundw_zm'&&e.cause==='bullet'&&e.enemy)e.amount=Math.max(e.amount,e.enemy.health+1);});

  // Wave Gun: a microwave cone that pops every zombie in front of you.
  const waves=[];
  let lastShots=session.shots;
  host.on('update',dt=>{
    if(session.shots!==lastShots){
      const fired=session.shots>lastShots;lastShots=session.shots;
      if(fired&&current()==='microwavegun_zm'){
        const forward=camera.getWorldDirection(new THREE.Vector3()),range=session.weapon.upgraded?1400:1000;
        for(const z of [...enemies.list]){
          const delta=z.root.position.clone().add(new THREE.Vector3(0,35,0)).sub(camera.position),d=delta.length();
          if(d<range&&delta.normalize().dot(forward)>.78&&world.lineClear(camera.position,enemies.headPosition(z)))enemies.hurt(z,z.health+1,false,false,'wave');
        }
        const ring=new THREE.Mesh(new THREE.ConeGeometry(60,160,24,1,true),new THREE.MeshBasicMaterial({color:0xbfe8ff,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
        ring.position.copy(camera.position).addScaledVector(forward,120);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),forward);scene.add(ring);waves.push({ring,forward,life:.45});
      }
    }
    for(const w of [...waves]){w.life-=dt;w.ring.position.addScaledVector(w.forward,dt*1600);w.ring.scale.multiplyScalar(1+dt*3);w.ring.material.opacity=Math.max(0,w.life*.8);
      if(w.life<=0){w.ring.removeFromParent();w.ring.geometry.dispose();w.ring.material.dispose();waves.splice(waves.indexOf(w),1);}}
  });

  // B: combine the Zap Guns into the Wave Gun, or split it back (each keeps its own ammo).
  // The native transitions live on the Zap Gun rig: altDropAnim (dw_2_combo)
  // snaps the guns together, altRaiseAnim (combo_2_dw) pulls them apart.
  const pair={microwavegundw_zm:'microwavegun_zm',microwavegun_zm:'microwavegundw_zm'};
  const {view}=api;let swap=null;
  function exchange(w,next){
    const nd=data.weapons[next],up=w.upgraded?{...nd,...nd.upgrade}:nd;
    const stash={mag:w.mag,reserve:w.reserve};
    // The first swap gives the other form the same share of its ammo as this one has left.
    const cur=session.def,left=(w.mag+w.reserve)/Math.max(1,cur.clipSize+cur.maxAmmo);
    const back=w.other??{mag:up.clipSize,reserve:Math.round(up.maxAmmo*Math.min(1,left))};
    Object.assign(w,{id:next,mag:back.mag,reserve:back.reserve,other:stash});
  }
  // Equip without the normal draw animation, then run `then` on the new rig.
  async function equipInPlace(then){
    try{await api.equipView();if(view?.ready){view.rig.play('idleAnim',true,1,0);view.mode='idle';then?.();}}
    finally{swap=null;}
  }
  // Load the other form while holding one, so the hand-over doesn't blink.
  const warmed=new Set();
  function warm(id){
    if(warmed.has(id))return;warmed.add(id);const d=data.weapons[id];if(!d)return;
    for(const url of [d.model,d.leftModel].filter(Boolean))loadModel(url).catch(()=>{});
    for(const url of Object.values({...d.animations,...(d.leftAnimations??{})}))loadAnimation(url).catch(()=>{});
  }
  const clipTime=key=>view?.rig?.data?.[key]?.duration??0;
  addEventListener('keydown',e=>{
    if(e.code!=='KeyB'||e.repeat||swap||!window.kino.debug.getState().active)return;
    const w=session.weapon,next=pair[w?.id];if(!next||session.busy||session.weaponUnavailable||!view?.ready)return;
    session.cancelReload();
    const nd=data.weapons[next];api.toast(nd.name+' · B to '+(next==='microwavegun_zm'?'split':'combine'),2.5);
    if(next==='microwavegun_zm'&&view.rig.actions.altDropAnim){
      // Combine: play the snap-together on the Zap Guns, then hand over to the Wave Gun.
      const time=clipTime('altDropAnim');
      view.mode='raise';view.aim=0;view.rig.play('altDropAnim',false,1,.08);
      audio.play('moon/wpn/microwave/reload/wpn_micro_rld_join',.8);
      session.fireLeft=Math.max(session.fireLeft,time+.1);swap={w,next,left:time};
    }else{
      // Split: switch to the Zap Guns and play the pull-apart from the combined pose.
      exchange(w,next);swap={w,next,left:Infinity};
      audio.play('moon/wpn/microwave/reload/wpn_micro_rld_separate',.8);
      equipInPlace(()=>{
        if(view.rig.actions.altRaiseAnim){const time=clipTime('altRaiseAnim');view.mode='raise';view.rig.play('altRaiseAnim',false,1,0);session.fireLeft=Math.max(session.fireLeft,time);}
      });
    }
  });
  host.on('update',dt=>{
    if(!swap||swap.left===Infinity)return;
    if(session.weapon!==swap.w||session.busy){swap=null;return;}   // switched weapons or went down mid-combine
    swap.left-=dt;if(swap.left>0)return;
    const {w,next}=swap;swap.left=Infinity;exchange(w,next);
    equipInPlace();
  });
  host.on('update',()=>{const next=pair[current()];if(next)warm(next);});
  host.on('reset',()=>{swap=null;});
  // Max Ammo also refills the form you aren't holding.
  const powerup=session.powerup.bind(session);
  session.powerup=(type,...rest)=>{
    const result=powerup(type,...rest);
    if(type==='full_ammo')for(const w of session.inventory){const next=pair[w.id];if(!next||!w.other)continue;const nd=data.weapons[next];w.other.reserve=(w.upgraded?nd.upgrade?.maxAmmo:null)??nd.maxAmmo;}
    return result;
  };
  let hinted=false;host.on('update',()=>{if(!hinted&&pair[current()]){hinted=true;api.toast('Press B to combine / split the Zap Guns',4);}});
}

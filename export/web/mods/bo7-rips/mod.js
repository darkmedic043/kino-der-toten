// Black Ops 7 guns from the user's own rips (.tools/build_bo7_rips.py; docs/fork/bo7-rips.md). The build writes
// weapons.json (defs + sound lists); everything it points at is git-ignored. This adds the guns to the Mystery Box
// and plays their own sounds: a layered shot per trigger pull, reload foley on the clips' AudioOneShot@ markers.
import * as THREE from 'three';
import {loadModel} from '../../animation.js';
import {PRESTIGE_OWN} from '../weapon-levels/camo.js';
const BASE=new URL('./',import.meta.url).href;
let built=null;
const VIEW_FOV=64,VIEW_OFFSET={};   // hip framing at that FOV, per weapon class (right, up, z: negative = forward), [0,0,0] if not listed

export async function prepare(data){
  const r=await fetch(BASE+'weapons.json').catch(()=>null);
  if(!r?.ok){console.info('[bo7-rips] not built: run .tools/build_bo7_rips.py');return;}
  built=await r.json();
  // lazyLoad: hd-weapons' load-time preload skips them (44 view models ran a page out of memory, 2026-11-24)
  // ownSprint: their own walk_to_sprint / sprint_loop / sprint_to_walk clips play instead of the motion layer's pose (animation.js, fp.js);
  // not on an akimbo pair (bo7_<g>_dw, folded into the gun's Akimbo attachment): BO7 has no akimbo sprint clips
  // viewFov: these rigs are framed for IW's viewmodel field of view (FOV 80 on 4:3 = about 64° vertical), not BO1's 51°;
  // drawn at 51° and pushed forward to fit, the cut ends of the sleeves showed (2026-11-24)
  // stockClear: the hip turn about the support hand that drops the stock out of the bottom right corner (movement/fp.js measureFrame);
  // not on the launchers, which sit on the shoulder
  // partSlots: the Gunsmith's slot markers find each slot's stock part by its head bone (gunsmith-view.js partOf)
  const PART_SLOTS={b7_base_barrel:'barrel',b7_base_mag:'mag',b7_base_grip:'grip',b7_base_stock:'stock'};
  for(const d of Object.values(built.weapons)){d.lazyLoad=true;d.ownSprint=!d.dualWield&&!!d.animations?.sprintLoopAnim;d.viewFov??=VIEW_FOV;d.viewOffset=VIEW_OFFSET[d.weaponClass]??[0,0,0];d.partSlots=PART_SLOTS;if(!d.dualWield&&!d.id?.startsWith('bo7_me_')&&d.weaponClass!=='Launcher')d.stockClear??=.14;}
  Object.assign(data.weapons,built.weapons);
  // their own prestige camos (P1, P2, the animated Master) instead of the generated ones (.tools/build_bo7_prestige.py)
  const pr=await fetch(BASE+'prestige.json').then(r=>r.ok?r.json():null).catch(()=>null);
  if(pr)for(const [id,e] of Object.entries(pr))if(built.weapons[id])PRESTIGE_OWN[id]=e;
  data.boxPool=[...new Set([...(data.boxPool??[]),...Object.keys(built.weapons).filter(id=>!built.weapons[id].noBox)])];   // noBox: akimbo pairs, the melees (bo7_me_*: mods/melee ownClips)
}

export default async function setup(api){
  if(!built)return;
  const {session,audio,view,host,data,renderer,mysteryBox,features,enemies}=api;
  const ours=id=>!!built.weapons[id];
  // the viewmodel camera takes the held gun's viewFov (51° = the engine's own, BO1's); perk bottles and shields keep 51°
  const vc=api.viewCamera,baseFov=vc?.fov??51;
  host.on('update',()=>{if(!vc)return;const busy=api.perkDrink?.current||window.kino?.operator?.handle?.view||window.kino?.rocketShield?.view||window.kino?.knuckles?.active;
    const f=(!busy&&view?.def?.viewFov)||baseFov;if(vc.fov!==f){vc.fov=f;vc.updateProjectionMatrix();}});

  // Memory (docs/fork/bo7-rips.md, Loading): every gun in the box would load its viewmodel (~28 MB each) in the engine's
  // weapon warm-up. One BO7 gun warms the shared shader programs; the others load when the box rolls them (prefetch(),
  // during the spin) or when given. Guns already held stay in the warm-up.
  host.on('warmWeapons',ids=>{
    const held=new Set((session.inventory??[]).map(w=>w.id));let rep=null;
    for(const id of [...ids])if(ours(id)&&!held.has(id)){rep??=id;ids.delete(id);}
    if(rep&&![...ids].some(ours))ids.add(rep);
  });
  const fetched=new Set();
  function prefetch(id){
    const def=data.weapons[id];if(!ours(id)||!def?.model||fetched.has(id))return;fetched.add(id);
    const urls=[def.model];
    for(const a of globalThis.kino?.weaponLevels?.profile?.attachments?.[id]??[])if(def.mounts?.[a]?.model)urls.push(def.mounts[a].model);
    // textures upload one a frame while the box spins, not all on the frame the gun is taken
    Promise.all(urls.map(u=>loadModel(u).catch(()=>null))).then(models=>{
      const tex=new Set();for(const m of models)m?.traverse(o=>{for(const mat of [o.material??[]].flat())for(const v of Object.values(mat))if(v?.isTexture)tex.add(v);});
      const list=[...tex],step=()=>{const t=list.shift();if(!t)return;try{renderer?.initTexture?.(t);}catch{}requestAnimationFrame(step);};step();
    });
  }
  if(mysteryBox?.start){const start=mysteryBox.start.bind(mysteryBox);
    mysteryBox.start=(e,...rest)=>{const ok=start(e,...rest);if(ok){const r=mysteryBox.at(e);if(r&&!r.teddy)prefetch(r.weapon);}return ok;};}
  // Rechambering (docs/fork/bo7-rips.md, Gun behaviour): the Echo 12 pumps after both barrels (rechamberEvery 2), the
  // CBRS-3 turns its helical mag every third of it (rechamberParts 3). The shot that ends a set holds the trigger for
  // rechamberTime and plays its last-shot kick + rechamber clip; counted from the mag, so a reload starts a fresh set.
  let rechamberNext=false,burstShots=0,burstAt=-1;
  const fire0=session.fire.bind(session);
  session.fire=(...a)=>{
    const ok=fire0(...a),d=session.def,w=session.weapon;
    if(ok&&w&&(d?.rechamberEvery||d?.rechamberParts)&&!d.dualWield){
      const n=d.rechamberEvery||Math.max(1,Math.round(d.clipSize/d.rechamberParts)),spent=d.clipSize-w.mag;
      if(w.mag>0&&spent>0&&spent%n===0){session.fireLeft=Math.max(session.fireLeft,d.rechamberTime??.8);rechamberNext=true;}}
    // burst guns (burstDelay): the shot that ends a burst holds the trigger a moment, or quick clicks chain bursts
    if(ok&&d?.burstDelay&&d.burstCount&&!d.dualWield){const t=session.time??performance.now()/1e3;
      burstShots=t-burstAt>(d.fireTime??.1)*2+.05?1:burstShots+1;burstAt=t;
      if(burstShots>=d.burstCount){burstShots=0;session.fireLeft=Math.max(session.fireLeft,(d.fireTime??.1)+d.burstDelay);}}
    return ok;};
  const shoot0=view.shoot.bind(view);
  view.shoot=(o={})=>{shoot0(o);if(!rechamberNext)return;rechamberNext=false;
    const r=view.rig,k=o.ads&&r?.actions?.adsRechamberAnim?'adsRechamberAnim':'rechamberAnim';
    if(r?.actions?.[k]&&view.mode==='fire')r.play(k,false,1,0);};
  // Shotgun ammo and kits (docs/fork/bo7-rips.md, Attachments). Dragon's Breath (def.incendiary): a pellet that hits
  // sets the zombie alight (the flamethrower's burn, weapon-levels/flamer.js). Backlash (def.backlash, the Echo 12 kit):
  // each shot is one explosive round that sticks and blows 0.15 s later; Pack-a-Punched it bursts on impact.
  host.on('shot',e=>{
    if(!e?.hit||!e.def?.incendiary||!enemies||host.remoteDamage)return;
    const t=enemies.rayHit?.(new THREE.Ray(e.origin,e.direction),e.distance+1);
    if(t?.z&&enemies.list.includes(t.z))window.kino?.flamer?.ignite?.(t.z);});
  (host.fireHooks??=[]).push((d,forward)=>{
    if(!d?.backlash||!features?.shoot)return false;
    const up=!!session.weapon?.upgraded,dmg=(d.damage??140)*Math.max(1,d.pellets??1);
    features.shoot({...d,projectileSpeed:3400,projectileSpeedUp:30,projectileLifetime:6,projectileModel:'models/projectile_m203grenade.glb',
      projectileType:up?'grenade':'bolt',fuseTime:.15,impactExplode:false,explosionRadius:up?170:140,explosionInnerDamage:dmg*.9,explosionOuterDamage:dmg*.25,noSelfSplash:true},forward);
    return true;});
  // the Smoke Launcher underbarrel (def.smokeLauncher = cloud size): its round pops a smoke cloud (bo3-equipment kino.smokeAt), no blast
  if(features?.blast){const blast0=features.blast.bind(features);
    features.blast=(position,def,...rest)=>{
      if(def?.smokeLauncher&&window.kino?.smokeAt){features.effect?.(position,0xcfcfcf,10);window.kino.smokeAt(position.clone(),def.smokeLauncher);return [];}
      return blast0(position,def,...rest);};}
  const S=built.sounds??{},buffers=new Map();
  const own=def=>S[def?.bo7Sounds??def?.baseId??def?.id];   // bo7Sounds: an underbarrel launcher's own (the gun's ubgl foley, launcher shots)
  const buffer=url=>{const ctx=audio.ctx;if(!ctx)return null;
    if(!buffers.has(url))buffers.set(url,fetch(new URL(url,document.baseURI)).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null));return buffers.get(url);};
  async function play(url,gain=1,rate=1){
    const ctx=audio.ctx,out=audio.master;if(!ctx||!out)return null;const b=await buffer(url);if(!b)return null;
    const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=b;src.playbackRate.value=rate;g.gain.value=gain;src.connect(g).connect(out);src.start();return {src,g};
  }
  const pick=list=>list[Math.floor(Math.random()*list.length)];
  // decode while loading, not at the first shot
  for(const s of Object.values(S))for(const u of [...s.shots,...s.last])buffer(u);

  let prev=null,token=0;
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    const s=own(def);
    if(kind==='shot'&&s?.shots?.length){
      const last=(session.weapon?.mag??1)<=0&&s.last.length,ctx=audio.ctx;
      // full auto: fade the previous shot's tail so the layers don't stack up loud
      if(prev&&ctx){const g=prev.g.gain;g.cancelScheduledValues(ctx.currentTime);g.setValueAtTime(g.value,ctx.currentTime);g.linearRampToValueAtTime(0,ctx.currentTime+.1);prev.src.stop(ctx.currentTime+.11);prev=null;}
      const t=++token;play(pick(last?s.last:s.shots),.8*(.9+Math.random()*.15),.97+Math.random()*.06).then(h=>{if(h&&!last&&t===token)prev=h;});
      return;}
    return weaponSound(kind,def,...rest);
  };
  const onSound=view.onSound?.bind(view);
  view.onSound=(name,def,...rest)=>{
    const s=own(def);
    if(s){const l=s.notes?.[name];if(l?.length)play(pick(l),.8);return;}   // our markers only: 'end' etc. must not reach the engine's lookup
    return onSound?.(name,def,...rest);};
}

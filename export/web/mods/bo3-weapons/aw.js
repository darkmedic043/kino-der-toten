// Advanced Warfare guns (the BO3 workshop pack, docs/fork/advanced-warfare.md): their two moving extras.
//
// - A second form on the same model (def.attachment.altForm, the OHM's shotgun): the engine's attachment toggle
//   (key 5) swaps the definition; here the change plays the gun folding open (attachInAnim on the new form's rig)
//   or shut (attachOutAnim on the LMG's) in place of the raise.
// - The XMG's lockdown (def.lockdown): aiming folds both arm guns into their braced pose. The pack has only the
//   fold-in and fold-out clips (no lockdown idle or fire), so they ride on top of whatever plays as additive
//   layers held at the blend's point, the fire clips still kicking underneath. Braced, you are rooted in place: no
//   walking, sprinting or jumping until you let go of aim.
// - Gunsmith kits (weapon-levels attachments.json: aws_* shared, aw_* per gun; each gun's list and part mounts in aw-kits.json).
//   Most are plain stats; the ones with behaviour live here ("hits" = the gun's bullets, or the MDL's blasts for 4 s
//   after it fires):
//   aw_bulwark    XMG: 60% less damage taken while locked down (an amber edge on the screen)
//   aw_overclock  XMG: 40% faster fire while locked down (on top of lockdown's own 25%)
//   aw_seismic    XMG: locked down, hits stagger like Concussive Slugs
//   aw_hotswap    OHM: a form swap fills the new form's magazine from its reserve
//   aw_arcrail    RW1: hits arc to the 2 nearest zombies for half damage
//   aw_ignition   hits burn for 40% of the hit a second, 3 s (aw_incendiary: the MDL's blasts, 30%)
//   aw_concussive hits slow zombies to half speed, 2.5 s
//   aw_lastword   Atlas 45, M1 Irons (and akimbo): the last round in a magazine hits for triple
//   aws_tracker   hits tag the zombie (a red marker) for 4 s: tagged zombies take 20% more from your hits
//   aws_scavenger a kill puts 2 free rounds back in the magazine
//   aw_killchain  Atlas: each kill within 3 s of the last adds 10% fire rate, up to 50%
//   aw_ricochet   M1 Irons: a headshot bounces on to the nearest zombie for full damage
//   aw_recall     RW1: a slug through 3+ zombies refunds its round
//   aw_overcharge RW1: a slug's first hit bursts for 50% around it
//   aw_bayonet    Blunderbuss: melee ×3 with this gun out
//   aw_emberload  Blunderbuss: hits burn for 50% of the hit a second, 3 s
//   aw_twinfeed   Bulldog: a shot costs 2 rounds (its 80% damage is a plain stat)
//   aw_bullrush   Bulldog: the first shot after a sprint hits for double
//   aw_bipod      OHM: aiming and standing still, 30% faster fire
//   aw_crossfeed  OHM: a kill puts 3 rounds in the other form's magazine
//   aw_meltdown   CEL-3: sustained fire ramps damage to +50% over 3 s
//   aw_prism      CEL-3: a shot's first hit splits to the nearest zombie for 35%
//   aw_cluster    MDL: a blast that hits throws 3 bomblets, 30% of the gun's damage each
//   aw_shockanchor XMG: reaching full lockdown throws a shockwave (6 s recharge)
//   aw_gunshield  MG Turret: 40% less damage taken while firing
//   aw_spinup     MG Turret: held fire ramps fire rate to +60% over 4 s
//   Shared across a few of the 34 Season guns (2026-11-08): aw_overpressure every 5th round x2 and a stagger; aw_fieldstrip the
//   first 3 rounds after a reload +30%; aw_cqb +30% within 250, -25% past 700; aw_marksman a headshot refunds its round;
//   aw_penetrator +20% per zombie already passed; aw_beltfed every 4th round free; aw_gunslinger 2 s of +40% fire rate after the
//   switch; aw_thermobaric blasts +20%; aw_dronelink a drone over the shoulder shoots the nearest zombie in sight (0.8 s, half a hit).
//   One per gun: aw_rhythm (AK-12) +4% per hit in a row to +40%, a miss resets; aw_teslarifling (ARX) 15% of hits arc; aw_adaptive
//   (Bal-27) +5% fire rate a kill to +30% until a reload; aw_splitter (HBRa3) first hit splits 30%; aw_tripletap (IMR) every 3rd
//   hit in a row on one zombie x2.5; aw_heavybolt (AK-47) hits stagger; aw_rangecard (M16) +20% past 600; aw_spoils (StG) kills +30
//   points; aw_vent (AE4) the last quarter of the mag +40% and burns; aw_pulse (Repulsor) every 8th hit staggers all within 150;
//   aw_match (MK14) an aimed shot 0.4 s after the last +25%; aw_chargechamber (M160) 1 s aimed charges x2; aw_frenzy (KF5) kills
//   within 1 s refund 3; aw_shredder (MP11) +5% per hit on one zombie to +50%; aw_typewriter (ASM1) held fire to +40% fire rate;
//   aw_bodyguard (SN6) -25% damage taken while firing; aw_sentinel (AMR9) a headshot marks all within 200; aw_static (SAC3) every
//   20th hit arcs to 4; aw_blitz (MP40) +30% fire rate 1 s after a sprint; aw_lucky (Sten) 1 round in 10 free; aw_heatsink (Ameli)
//   2 s of fire, hits burn; aw_juggernaut (Pytaek) -30% damage taken aiming; aw_volley (Lynx) hits within 1 s +20% each to +80%;
//   aw_cryo (MORS) 5 s freeze, a frozen kill shatters; aw_spotter (SVO) aiming marks zombies in view; aw_explosivetip (Atlas 20mm)
//   hits burst 60% within 120; aw_showstopper (M1911) headshots stagger all within 120; aw_doubletap (MP-443) a second hit within
//   0.3 s x2; aw_vampire (PDW) kills heal 8; aw_tandem (MAAWS) a second blast 0.35 s later for half; aw_arcwarhead (Mahem) blast hits
//   arc; aw_salvo (Stinger) a rocket kill refunds a rocket. The AW launchers' blasts count as hits like the MDL's (4 s after firing).
// - The MG Turret itself: the barrels spin up (0.6 s) before it fires, aiming keeps them turning; see turret() below
// - Lasers (aws_tracker red, aws_laser green): the part's beam is steered at the crosshair each frame (mounts.js aimLasers),
//   dimmed while aiming, with a dot where the crosshair lands.
import * as THREE from 'three';
import { aimLasers, laserColour, beamWarm } from '../weapon-levels/mounts.js';

const ARC=0x8fb4ff,EMBER=0xff7a2a,GOLD=0xffd36a,DAZE=0xcfe4ff,MARK=0xff2a2a,PRISM=0xd08cff;

export function setupAw(api){
  const {host,session,view,player,enemies,scene,camera,world,data,audio}=api;
  const atts=()=>String(data.weapons[session.weapon?.id]?.attachments??'').split('+');   // the base def's (the OHM's shotgun form has none of its own)
  const has=id=>atts().includes(id);
  const now=()=>session.time??performance.now()/1000;
  const alive=z=>z&&!(z.dead||z.state==='dead'||z.health<=0)&&enemies.list.includes(z);

  const toggle=session.toggleAttachment.bind(session);
  session.toggleAttachment=(...args)=>{
    const was=session.attachmentMode,form=was?session.def.altForm:session.def.attachment?.altForm,ok=toggle(...args);
    if(ok&&form)view.raiseWith=was?'attachOutAnim':'attachInAnim';
    if(ok&&has('aw_hotswap')){const w=session.weapon,n=Math.max(0,Math.min(session.def.clipSize-w.mag,w.reserve));w.mag+=n;w.reserve-=n;}
    return ok;
  };

  let lock=0,falling=false,rig=null,acts=null,frozen=false,wasLocked=false;
  const layer=(clip,ref)=>{
    const add=THREE.AnimationUtils.makeClipAdditive(clip.clone(),0,ref,30),a=rig.mixer.clipAction(add);
    a.blendMode=THREE.AdditiveAnimationBlendMode;a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();a.paused=true;a.setEffectiveWeight(0);return a;
  };
  host.on('update',dt=>{
    const def=view.def;
    if(!def?.lockdown||!view.ready||!view.rig){lock=0;frozen=false;return;}
    if(view.rig!==rig){
      rig=view.rig;lock=0;falling=false;const a=rig.actions.lockdownInAnim,b=rig.actions.lockdownOutAnim;
      acts=a&&b?{in:layer(a.getClip(),a.getClip()),out:layer(b.getClip(),a.getClip())}:null;   // both measured from the fold-in's first frame (the idle grip)
    }
    if(!acts)return;
    const want=!!view.input?.ads&&['idle','fire'].includes(view.mode)&&!(session.reloadLeft>0),din=acts.in.getClip().duration,dout=acts.out.getClip().duration;
    frozen=want&&lock>0;
    if(want&&falling)falling=false;else if(!want&&!falling&&lock>0)falling=true;
    lock=THREE.MathUtils.clamp(lock+(want?dt/din:-dt/dout),0,1);
    acts.in.setEffectiveWeight(falling||lock===0?0:1);acts.out.setEffectiveWeight(falling&&lock>0?1:0);
    acts.in.time=lock*din;acts.out.time=(1-lock)*dout;
    if(lock>=1&&!wasLocked&&has('aw_shockanchor'))shockwave();wasLocked=lock>=1;
  });
  host.on('reset',()=>{lock=0;falling=false;frozen=false;wasLocked=false;spool=0;chain=0;chainUntil=0;sprintAt=-9;rush=-1;clusterArmed=false;anchorAt=0;bombs.length=0;for(const z of [...burning.keys()])burning.delete(z);for(const z of [...dazed])undaze(z);for(const z of [...marked.keys()])unmark(z);for(const f of fx.splice(0))dispose(f);});

  // Locked down you stay put: no speed (layered over the other speed getters, like the Siren's Soma-81), and the
  // controller input loses its move, sprint and jump. That wrap goes on at the first frame, outside every mod's
  // (the movement mod's mantle and slide read the input before passing it on).
  for(const key of ['moveSpeed','sprintSpeed']){
    if(!player)break;
    const d=Object.getOwnPropertyDescriptor(player,key);let base=player[key];
    Object.defineProperty(player,key,{configurable:true,get:()=>frozen?0:(d?.get?d.get():base),set:v=>{if(d?.set)d.set(v);else base=v;}});
  }
  let rooted=false;
  host.on('update',()=>{
    if(rooted||!player)return;rooted=true;
    const melee=host.meleeDamage?.bind(host);   // the melee mod's goes on later than this mod's setup
    host.meleeDamage=(d,heavy)=>(melee?melee(d,heavy):d)*(has('aw_bayonet')?3:1);
    const update=player.update.bind(player);
    player.update=(dt,input)=>update(dt,frozen&&input?{...input,forward:0,strafe:0,sprint:false,jump:false,jumpPressed:false}:input);
  });

  // ---- Bulwark Plating and Overclock Servos (the XMG, locked down) ----
  const braced=id=>lock>0&&!falling&&view.def?.lockdown&&has(id);
  host.on('beforeDamage',e=>{if(braced('aw_bulwark'))e.amount*=1-.6*lock;if(has('aw_gunshield')&&now()-lastShot<.4)e.amount*=.6;
    if(has('aw_bodyguard')&&now()-lastShot<.4)e.amount*=.75;if(has('aw_juggernaut')&&view.input?.ads)e.amount*=.7;});
  const fire=session.fire.bind(session);
  // fully locked down the XMG fires 25% faster (user, 2026-10-24); Overclock Servos stack another 40% on top
  // every shot: the rest of the per-gun triggers. spool = how long the trigger has been held, 0..1
  let shot=0,lastShot=-9,spool=0,chain=0,chainUntil=0,sprintAt=-9,rush=-1;
  const shotZ=new Set();   // zombies this shot has been through
  // the Season guns' customs: streaks, the same-zombie run, the shot numbers a bonus belongs to
  let rhythm=0,volley=0,lastHitAt=-9,adapt=0,fresh=0,freshShot=-1,matchShot=-1,chargeShot=-1,adsAt=-9,drawnAt=-9,heldId=null,frenzyAt=-9,
    sameZ=null,sameN=0,sameAt=-9,refunded=-1,pulseN=0,staticN=0,tandemArmed=false,salvoArmed=false,blastGun=null,droneT=0,spotT=0;
  session.fire=(...args)=>{
    const ok=fire(...args);if(!ok)return ok;
    if(lock>=1&&!falling&&view.def?.lockdown)session.fireLeft/=1.25*(braced('aw_overclock')?1.4:1);
    const a=atts(),t=now(),missed=shot>0&&!shotZ.size,since=t-lastShot;shot++;shotZ.clear();lastShot=t;
    const w=session.weapon,clip=session.def.clipSize,ads=!!view.input?.ads,free=()=>{if(w&&w.mag<clip)w.mag++;};
    if(missed)rhythm=0;
    if(fresh>0){fresh--;freshShot=shot;}
    if(a.includes('aw_adaptive'))session.fireLeft/=1+.05*adapt;
    if(a.includes('aw_gunslinger')&&t-drawnAt<2)session.fireLeft/=1.4;
    if(a.includes('aw_typewriter'))session.fireLeft/=1+.4*spool;
    if(a.includes('aw_blitz')&&t-sprintAt<1)session.fireLeft/=1.3;
    if(a.includes('aw_match')&&ads&&since>=.4)matchShot=shot;
    if(a.includes('aw_chargechamber')&&ads&&t-adsAt>=1)chargeShot=shot;
    adsAt=t;   // the charge starts over from this shot
    if(a.includes('aw_beltfed')&&shot%4===0)free();
    if(a.includes('aw_lucky')&&Math.random()<.1)free();
    if(a.includes('aw_killchain')&&t<chainUntil)session.fireLeft/=1+.1*chain;
    if(a.includes('aw_spinup'))session.fireLeft/=1+.6*spool;
    if(a.includes('aw_bipod')&&view.input?.ads&&still())session.fireLeft/=1.3;
    if(a.includes('aw_bullrush')&&t-sprintAt<.5){rush=shot;sprintAt=-9;}
    if(a.includes('aw_twinfeed')&&session.weapon.mag>0)session.weapon.mag--;
    return ok;
  };
  let movedAt=-9;const moved=new THREE.Vector3();
  const still=()=>now()-movedAt>.15;   // no walking for a moment (player position, so a push counts too)
  const edge=document.createElement('div');
  edge.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;box-shadow:inset 0 0 90px 18px #ffb43a88;border:2px solid #ffb43a55';
  document.body.append(edge);

  // ---- hits ----
  let blastUntil=0;   // the MDL's grenades count as its hits for a while after it fires
  // (every AW launcher's: the MDL's grenades and the rockets; they skip the 'shot' event)
  (host.fireHooks??=[]).push(def=>{const id=def.baseId??def.id;if(def.weaponClass==='Launcher'&&String(id).startsWith('aw_')){blastUntil=now()+4;blastGun=session.weapon?.id;clusterArmed=tandemArmed=salvoArmed=true;}return false;});
  const hurt=enemies.hurt.bind(enemies);
  enemies.hurt=(z,damage,head,...rest)=>{
    if(host.remoteDamage||!alive(z))return hurt(z,damage,head,...rest);
    const t=now(),cause=rest[1];
    if(z.awMark?.until>t)damage*=1.2;   // Tracker
    const gunHit=cause==='bullet'||(cause==='explosion'&&t<blastUntil&&session.weapon?.id===blastGun);
    if(!gunHit)return hurt(z,damage,head,...rest);
    const a=atts(),at=z.root.position.clone().add(new THREE.Vector3(0,45,0));
    const first=!shotZ.size;shotZ.add(z);
    const iced=a.includes('aw_cryo')&&dazed.has(z);   // (frozen before this hit: a kill shatters)
    let quick=false;
    if(first){quick=z===sameZ&&t-sameAt<.3;sameN=z===sameZ?sameN+1:1;sameZ=z;sameAt=t;volley=t-lastHitAt<1?Math.min(4,volley+1):0;lastHitAt=t;}
    const w=session.weapon,clip=session.def.clipSize,dist=player?.position?z.root.position.distanceTo(player.position):0;
    if(a.includes('aw_overpressure')&&shot%5===0){damage*=2;daze(z,at);}
    if(a.includes('aw_fieldstrip')&&freshShot===shot)damage*=1.3;
    if(a.includes('aw_cqb'))damage*=dist<250?1.3:dist>700?.75:1;
    if(a.includes('aw_penetrator'))damage*=1+.2*(shotZ.size-1);
    if(a.includes('aw_thermobaric')&&cause==='explosion')damage*=1.2;
    if(a.includes('aw_rhythm')){damage*=1+.04*rhythm;if(first)rhythm=Math.min(10,rhythm+1);}
    if(a.includes('aw_tripletap')&&first&&sameN%3===0){damage*=2.5;burst(at,GOLD,8,60);}
    if(a.includes('aw_shredder'))damage*=1+.05*Math.min(10,sameN-1);
    if(a.includes('aw_doubletap')&&quick){damage*=2;sameAt=-9;burst(at,GOLD,5,40);}
    if(a.includes('aw_volley'))damage*=1+.2*volley;
    if(a.includes('aw_rangecard')&&dist>600)damage*=1.2;
    if(a.includes('aw_vent')&&w&&w.mag<=clip*.25){damage*=1.4;ignite(z,damage*.3);}
    if(a.includes('aw_match')&&matchShot===shot)damage*=1.25;
    if(a.includes('aw_chargechamber')&&chargeShot===shot){damage*=2;if(first)burst(at,ARC,10,70);}
    if(a.includes('aw_heatsink')&&spool>=.67)ignite(z,damage*.3);
    if(a.includes('aw_heavybolt'))daze(z,at);
    if(a.includes('aw_cryo'))daze(z,at,5);
    if(head&&a.includes('aw_showstopper')){daze(z,at);for(const {o} of near(z,120))daze(o,chest(o));}
    if(head&&a.includes('aw_sentinel')){mark(z,t);for(const {o} of near(z,200))mark(o,t);}
    if(head&&a.includes('aw_marksman')&&refunded!==shot&&w&&w.mag<clip){refunded=shot;w.mag++;}
    if(a.includes('aw_lastword')&&session.weapon.mag===0){damage*=3;burst(at,GOLD,10,60);}
    if(a.includes('aw_meltdown'))damage*=1+.5*spool;
    if(rush===shot)damage*=2;
    if(a.includes('aw_emberload'))ignite(z,damage*.5);
    if(a.includes('aw_ignition'))ignite(z,damage*.4);
    if(a.includes('aw_incendiary'))ignite(z,damage*.3);
    if(a.includes('aw_concussive')||(a.includes('aw_seismic')&&braced('aw_seismic')))daze(z,at);
    if(a.includes('aws_tracker'))mark(z,t);
    const r=hurt(z,damage,head,...rest);
    if(a.includes('aw_arcrail'))arc(z,at,damage*.5);
    if(a.includes('aw_overcharge')&&first){burst(at,ARC,12,90);for(const {o} of near(z,120)){hurt(o,damage*.5,false,false,'explosion');burst(chest(o),ARC,3,40);}}
    if(a.includes('aw_prism')&&first){const o=near(z,260).find(({o})=>world.lineClear(at,chest(o)))?.o;if(o){bolt(at,chest(o),PRISM);hurt(o,damage*.35,false,false,'explosion');}}
    if(a.includes('aw_ricochet')&&head){const o=near(z,300).find(({o})=>world.lineClear(at,chest(o)))?.o;if(o){bolt(at,chest(o),GOLD);hurt(o,damage,false,false,'bullet');}}
    if(a.includes('aw_teslarifling')&&Math.random()<.15)arc(z,at,damage*.5);
    if(a.includes('aw_splitter')&&first){const o=near(z,260).find(({o})=>world.lineClear(at,chest(o)))?.o;if(o){bolt(at,chest(o),GOLD);hurt(o,damage*.3,false,false,'explosion');}}
    if(a.includes('aw_pulse')&&first&&++pulseN%8===0){burst(at,DAZE,18,160,4.5);for(const {o} of near(z,150))daze(o,chest(o));}
    if(a.includes('aw_static')&&first&&++staticN%20===0)arc(z,at,damage,4);
    if(a.includes('aw_explosivetip')){burst(at,EMBER,6,70);for(const {o} of near(z,120))hurt(o,damage*.6,false,false,'explosion');}
    if(a.includes('aw_arcwarhead')&&cause==='explosion'&&shotZ.size<=3)arc(z,at,damage*.5);
    if(a.includes('aw_tandem')&&cause==='explosion'&&tandemArmed){tandemArmed=false;bombs.push({at:z.root.position.clone().add(new THREE.Vector3(0,14,0)),t:t+.35,dmg:Math.max(damage,session.def.explosionInnerDamage??0)*.5,r:(session.def.explosionRadius||180)*.8});}
    if(a.includes('aw_recall')&&shotZ.size===3){const w=session.weapon;w.mag=Math.min(session.def.clipSize,w.mag+1);burst(at,ARC,10,70);}
    if(a.includes('aw_cluster')&&clusterArmed&&cause==='explosion'){clusterArmed=false;const dmg=session.def.damage*.3;
      for(let i=0;i<3;i++){const ang=i*2.1+Math.random(),r=50+Math.random()*40;bombs.push({at:z.root.position.clone().add(new THREE.Vector3(Math.cos(ang)*r,14,Math.sin(ang)*r)),t:t+.3+i*.13,dmg});}}
    if(!alive(z)){
      if(a.includes('aws_scavenger')){const w=session.weapon,clip=session.def.clipSize;if(w&&w.mag<clip){w.mag=Math.min(clip,w.mag+2);burst(at,GOLD,3,30,2.5);}}
      if(a.includes('aw_adaptive'))adapt=Math.min(6,adapt+1);
      if(a.includes('aw_spoils'))session.addPoints?.(30);
      if(a.includes('aw_frenzy')){if(t-frenzyAt<1&&w)w.mag=Math.min(clip,w.mag+3);frenzyAt=t;}
      if(a.includes('aw_vampire'))session.health=Math.min(session.maxHealth,session.health+8);
      if(a.includes('aw_salvo')&&cause==='explosion'&&salvoArmed&&w&&w.mag<clip){salvoArmed=false;w.mag++;burst(at,GOLD,8,60);}
      if(iced){burst(at,DAZE,16,120,4.5);for(const {o} of near(z,100))hurt(o,damage*.5,false,false,'explosion');}
      if(a.includes('aw_killchain')){chain=Math.min(5,(t<chainUntil?chain:0)+1);chainUntil=t+3;}
      if(a.includes('aw_crossfeed')){const w=session.weapon,form=session.attachmentMode?data.weapons[w.id]:session.def.attachment,other=session.attachmentMode?w.primaryAmmo:(w.attachmentAmmo??={mag:form?.clipSize??0,reserve:form?.maxAmmo??0});
        if(other&&form)other.mag=Math.min(form.clipSize,other.mag+3);}
    }
    return r;
  };
  const marked=new Map();   // zombie -> its marker sprite
  function mark(z,t){
    z.awMark={until:t+4};
    if(!marked.has(z)){const s=new THREE.Sprite(sprite.clone());s.material.color.setHex(MARK);s.scale.setScalar(7);scene.add(s);marked.set(z,s);}
  }
  function unmark(z){const s=marked.get(z);if(s){s.removeFromParent();s.material.dispose();}marked.delete(z);if(z.awMark)z.awMark=null;}
  const chest=o=>o.root.position.clone().add(new THREE.Vector3(0,42,0));
  const near=(z,r)=>enemies.list.filter(o=>o!==z&&alive(o)).map(o=>({o,d:o.root.position.distanceTo(z.root.position)})).filter(({d})=>d<r).sort((x,y)=>x.d-y.d);
  function arc(z,from,dmg,max=2){
    let n=0;
    for(const {o} of near(z,260)){
      const to=chest(o);
      if(!world.lineClear(from,to))continue;
      bolt(from,to,ARC);hurt(o,dmg,false,false,'explosion');if(++n>=max)break;
    }
    if(!n)for(let i=0;i<2;i++)bolt(from,from.clone().add(new THREE.Vector3(Math.random()-.5,Math.random()-.3,Math.random()-.5).normalize().multiplyScalar(50)),ARC);
  }
  const burning=new Map();
  function ignite(z,dps){const b=burning.get(z);if(b){b.left=3;b.dps=Math.max(b.dps,dps);}else burning.set(z,{left:3,dps,acc:0,fx:0});}
  const dazed=new Set();
  function daze(z,at,len=2.5){
    const c=z.awDaze??={k:1,scale:z.rig?.mixer?.timeScale};
    if(c.k===1){if(z.speed)z.speed*=.5;if(z.rig?.mixer&&c.scale!==undefined)z.rig.mixer.timeScale=c.scale*.5;c.k=.5;burst(at,DAZE,6,40);}
    c.until=Math.max(c.until??0,now()+len);dazed.add(z);
  }
  function undaze(z){const c=z.awDaze;if(c?.k===.5){if(z.speed)z.speed/=.5;if(z.rig?.mixer&&c.scale!==undefined)z.rig.mixer.timeScale=c.scale;}z.awDaze=null;dazed.delete(z);}

  // the MDL's bomblets, and the XMG's Shock Anchor
  let clusterArmed=false,anchorAt=0;const bombs=[];
  function shockwave(){
    const t=now();if(t<anchorAt)return;anchorAt=t+6;
    const p=player.position,dmg=session.def.damage*6;burst(p.clone().add(new THREE.Vector3(0,-30,0)),DAZE,26,260,5);audio?.play?.('explosion');
    for(const o of enemies.list){if(!alive(o)||o.root.position.distanceTo(p)>220)continue;const at=chest(o);daze(o,at);hurt(o,dmg,false,false,'explosion');}
  }

  // ---- fx: arcs (additive lines) and embers (additive sprites) ----
  const glow=document.createElement('canvas');glow.width=glow.height=32;
  {const g=glow.getContext('2d'),r=g.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,'#fff');r.addColorStop(.3,'#ffffffc0');r.addColorStop(1,'#fff0');g.fillStyle=r;g.fillRect(0,0,32,32);}
  const fx=[],sprite=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glow),color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  function bolt(a,b,color){
    const pts=[a.clone()];for(let i=1;i<7;i++)pts.push(a.clone().lerp(b,i/7).add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(18)));pts.push(b.clone());
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    line.frustumCulled=false;scene.add(line);fx.push({obj:line,t:.25,life:.25});
  }
  function burst(at,color,n,speed,size=3.5){
    for(let i=0;i<n;i++){const s=new THREE.Sprite(sprite.clone());s.material.color.setHex(color);s.scale.setScalar(size*(1+Math.random()*.6));s.position.copy(at);scene.add(s);
      fx.push({obj:s,t:.5,life:.5,vel:new THREE.Vector3(Math.random()-.5,Math.random()*.8+.2,Math.random()-.5).multiplyScalar(speed)});}
  }
  const dispose=f=>{f.obj.removeFromParent();f.obj.material.dispose();if(!f.vel)f.obj.geometry.dispose();};   // sprites share three's geometry
  host.warmObjects?.push(new THREE.Sprite(sprite.clone()),new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,1,0)]),
    new THREE.LineBasicMaterial({color:ARC,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})));

  // ---- lasers: beams at the crosshair, a dot on what it lands on ----
  const dot=new THREE.Sprite(sprite.clone());dot.visible=false;dot.renderOrder=4;dot.material.depthTest=true;scene.add(dot);
  const eye=new THREE.Vector3(),look=new THREE.Vector3(),aimAt=new THREE.Vector3(),tmp=new THREE.Vector3(),ray=new THREE.Ray();
  const DOT={red:0xff2a20,green:0x30ff60};
  host.warmObjects?.push(beamWarm());
  function lasers(){
    const gun=view.gun,colour=laserColour(gun),vc=api.viewCamera;
    if(!colour||!vc||!view.ready){dot.visible=false;return;}
    vc.getWorldPosition(eye);vc.getWorldDirection(look);aimAt.copy(eye).addScaledVector(look,1500);
    const opacity=view.input?.ads?.35:1;
    aimLasers(gun,aimAt,opacity);if(view.leftGun)aimLasers(view.leftGun,aimAt,opacity);
    const cam=host.camera??camera,pointing=['idle','fire'].includes(view.mode)&&!(session.reloadLeft>0)&&!view.input?.sprint;
    cam.getWorldPosition(ray.origin);cam.getWorldDirection(ray.direction);
    let d=world.raycast(ray,2,2500)?.distance??Infinity;
    for(const o of enemies.list){   // a sphere on the torso: enemies.rayHit poses every head, too dear for each frame
      const p=o.root.position;tmp.set(p.x,p.y+38,p.z).sub(ray.origin);const along=tmp.dot(ray.direction);
      if(along>0&&along<d&&tmp.lengthSq()-along*along<400)d=along-14;
    }
    if(!pointing||d===Infinity){dot.visible=false;return;}
    dot.visible=true;dot.position.copy(ray.origin).addScaledVector(ray.direction,d-1.5);dot.scale.setScalar(3+d*.004);
    dot.material.color.setHex(DOT[colour]);dot.material.opacity=.6+.25*Math.random();
  }

  // ---- the MG Turret's barrels: a motor that has to come up to speed before the gun fires. The pack has no spin clip,
  // so the bone turns here. One barrel per shot at full speed (three barrels, 0.06 s a shot = 5.5 turns a second), and
  // a frame never turns them past 50 degrees or the third-turn symmetry reads as spinning backwards.
  const REV_UP=.7,REV_DOWN=1.4,REV_READY=.85,SPIN=2*Math.PI/(3*.06);
  let rev=0,spin=0,spinBone=null,spinOn=null,whine=null;
  const isTurret=()=>(view.def?.baseId??view.def?.id)==='aw_sentry'&&view.ready;
  const claimFire=()=>{
    if(host.holdFire?.aw)return;const prev=host.holdFire;
    const f=()=>(isTurret()&&rev<REV_READY)||!!prev?.();Object.assign(f,prev,{aw:true});host.holdFire=f;   // keeps the earlier claimers' flags
  };
  claimFire();
  // the motor (no sound in the pack for it). Each frame re-arms a fall to silence, so a pause can't leave it humming
  function motor(){
    const c=audio?.ctx;if(!c||c.state!=='running'||!audio.master)return;
    if(!whine&&rev>.01){
      const g=c.createGain(),lp=c.createBiquadFilter(),a=c.createOscillator(),b=c.createOscillator(),bg=c.createGain();
      g.gain.value=0;lp.type='lowpass';a.type='sawtooth';b.type='square';bg.gain.value=.35;
      a.connect(lp);b.connect(bg);bg.connect(lp);lp.connect(g);g.connect(audio.master);a.start();b.start();whine={g,lp,a,b};
    }
    if(!whine)return;
    const t=c.currentTime,r=rev*rev;
    whine.a.frequency.setTargetAtTime(55+r*330,t,.03);whine.b.frequency.setTargetAtTime(83+r*495,t,.03);
    whine.lp.frequency.setTargetAtTime(350+r*2200,t,.03);
    whine.g.gain.cancelScheduledValues(t);whine.g.gain.setTargetAtTime(.012+rev*.05,t,.03);whine.g.gain.setTargetAtTime(0,t+.25,.06);
    if(rev<=.01){const w=whine;whine=null;w.g.gain.cancelScheduledValues(t);w.g.gain.setTargetAtTime(0,t,.04);w.a.stop(t+.3);w.b.stop(t+.3);}
  }
  function turret(dt){
    if(host.holdFire&&!host.holdFire.aw)claimFire();
    if(!isTurret()){rev=0;spinBone=null;spinOn=null;motor();return;}
    const gun=view.gun;
    if(spinOn!==gun){spinOn=gun;spinBone=null;gun?.traverse?.(o=>{if(o.isBone&&o.name==='tag_barrel_spin')spinBone=o;});}
    const i=view.input,want=(i?.fire||i?.ads)&&!i?.sprint&&!(session.reloadLeft>0)&&session.phase!=='reviving';
    rev=want?Math.min(1,rev+dt/REV_UP):Math.max(0,rev-dt/REV_DOWN);
    if(spinBone&&rev>0){spin=(spin+Math.min(.87,rev*rev*SPIN*(1+.6*spool*+has('aw_spinup'))*dt))%(2*Math.PI);spinBone.rotation.x=spin;}
    motor();
  }

  host.on('update',dt=>{
    lasers();
    { const t=now();
      if(view.input?.sprint)sprintAt=t;
      if(player?.position){if(moved.distanceToSquared(player.position)>.25){movedAt=t;moved.copy(player.position);}}
      if(!view.input?.ads)adsAt=t;
      const id=session.weapon?.id;if(id!==heldId){heldId=id;drawnAt=t;}
      season(dt,t);
      spool=t-lastShot<.35?Math.min(1,spool+dt/(has('aw_spinup')?4:3)):Math.max(0,spool-dt/1.5);
      turret(dt);
      for(let i=bombs.length-1;i>=0;i--){const b=bombs[i];if(t<b.t)continue;bombs.splice(i,1);burst(b.at,EMBER,14,110,5);if(Math.random()<.5)audio?.play?.('explosion');
        for(const o of enemies.list){if(alive(o)&&o.root.position.distanceTo(b.at)<(b.r??90))hurt(o,b.dmg,false,false,'explosion');}}
    }
    edge.style.opacity=braced('aw_bulwark')&&session.phase!=='gameover'?lock.toFixed(2):'0';
    const t=now();
    for(const [z,b] of burning){
      if(!alive(z)){burning.delete(z);continue;}
      b.left-=dt;b.acc+=dt;b.fx-=dt;
      if(b.fx<=0){b.fx=.06;burst(z.root.position.clone().add(new THREE.Vector3((Math.random()-.5)*16,20+Math.random()*45,(Math.random()-.5)*16)),EMBER,1,35,4);}
      if(b.acc>=.5){b.acc-=.5;hurt(z,b.dps*.5,false,false,'flame');}
      if(b.left<=0)burning.delete(z);
    }
    for(const z of dazed)if(!alive(z)||t>=z.awDaze.until)undaze(z);
    for(const [z,s] of marked){
      if(!alive(z)||!(z.awMark?.until>t)){unmark(z);continue;}
      s.position.copy(enemies.headPosition?.(z)??z.root.position).y+=16;s.material.opacity=.65+.35*Math.sin(t*9);
    }
    for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.t-=dt;
      if(f.t<=0){dispose(f);fx.splice(i,1);continue;}
      f.obj.material.opacity=f.t/f.life;if(f.vel){f.obj.position.addScaledVector(f.vel,dt);f.vel.y+=20*dt;}}
  });
  // a finished reload: Field-Stripped's 3 fresh rounds, and the Adaptive Barrel starts over
  const finish=session.finishReloadStage.bind(session);
  session.finishReloadStage=(...x)=>{const r=finish(...x);if(!(session.reloadLeft>0)){fresh=has('aw_fieldstrip')?3:0;adapt=0;}return r;};
  // Drone Uplink: a glow over the right shoulder that shoots; Spotter Scope: aiming marks what is in view
  const drone=new THREE.Sprite(sprite.clone());drone.material.color.setHex(0x7fffd4);drone.scale.setScalar(4);drone.visible=false;scene.add(drone);
  const dEye=new THREE.Vector3(),dq=new THREE.Quaternion();
  function season(dt,t){
    const cam=host.camera??camera,on=has('aw_dronelink')&&view.ready&&session.phase!=='gameover';
    drone.visible=on;
    if(on){
      cam.getWorldPosition(dEye);cam.getWorldQuaternion(dq);
      drone.position.set(34,16+Math.sin(t*2.3)*2.5,-40).applyQuaternion(dq).add(dEye);drone.material.opacity=.7+.3*Math.sin(t*11);
      if((droneT-=dt)<=0){droneT=.8;
        const o=enemies.list.filter(alive).map(o=>({o,d:o.root.position.distanceTo(dEye)})).filter(({d})=>d<1500).sort((x,y)=>x.d-y.d).find(({o})=>world.lineClear(drone.position,chest(o)))?.o;
        if(o){bolt(drone.position,chest(o),0x7fffd4);hurt(o,(session.def.damage||100)*.5,false,false,'explosion');burst(chest(o),0x7fffd4,3,30);}else droneT=.2;}
    }
    if(has('aw_spotter')&&view.input?.ads&&(spotT-=dt)<=0){spotT=.25;cam.getWorldPosition(dEye);cam.getWorldDirection(tmp);
      for(const o of enemies.list){if(!alive(o))continue;const c=chest(o),d=c.clone().sub(dEye),l=d.length();if(l<4000&&d.dot(tmp)/l>.96&&world.lineClear(dEye,c))mark(o,t);}}
  }
  host.on('reset',()=>{rhythm=volley=adapt=fresh=pulseN=staticN=0;sameZ=null;sameN=0;freshShot=matchShot=chargeShot=refunded=-1;tandemArmed=salvoArmed=false;blastGun=null;drone.visible=false;});
  window.kino.aw={get spool(){return spool;},get rev(){return rev;},get spin(){return spin;},get chain(){return chain;},bombs,dot,get lock(){return lock;},get frozen(){return frozen;},burning,dazed,marked};
}

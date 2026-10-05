// Cheese Cube's Iron Man suits (a cut-down port of the map's _iron_man_mk*.gsc scripts):
//   1. Six parts lie around the map (helmet, body, two arms, two legs). Carry each to the Hall of Armors and add it.
//   2. With all six built the suits can be bought at their stands: Mk1 5000, Mk3 7500, Mk4 10000, Mk5 12500, Mk6 15000.
//      The War Machine (10000) also needs the trivia reward.
//   3. Use a bought suit's stand to put it on (one suit at a time): more health, a different walking speed, and the
//      suit's own weapons in place of yours (repulsors and wrist rockets; Mk1 flamethrower; War Machine minigun and
//      handgun), as the map does. Your guns come back when the suit comes off. Use the stand again to take it off.
//   4. Suit power (the JARVIS HUD, suit-hud.js): each repulsor shot costs 1, a rocket 5, flying (hold Space in the air)
//      6 a second, and it does not recharge while worn. At zero the suit shuts down and goes back to its stand, which
//      recharges it for 30 s. Dying also takes the suit off.
// The weapons reuse BO1 guns' viewmodels (Ray Gun, LAW, HK21, CZ75, RPK) with the map's stats and fire sounds.
// Not ported: the Mk16 suit itself (its scanner joke is), the Mk5 suitcase and Mk6 laser.
import * as THREE from 'three';
import { createSuitHud } from './suit-hud.js';

export function setupSuits({api,world,session,host,toast,announce,named,center,nodes,show,beep,now,board,player,triviaDone,sync,sound}){
  const {equipView,data,audio}=api;

  // ---- the suits' weapons (the map's weapons/sp files), as defs on BO1 guns ----------------------------------------
  const W=data?.weapons??{},clone=(id,base,extra)=>{if(!W[base])return;W[id]={...W[base],id,baseId:base,price:0,upgrade:undefined,attachment:undefined,suitWeapon:true,...extra};};
  clone('iron_repulsor','ray_gun_zm',{name:'Repulsor',hideGun:true,damage:2000,minDamage:2000,fireTime:.33,fireType:'Single Shot',automatic:false,clipSize:10,startAmmo:120,maxAmmo:120,
    reloadTime:1,reloadEmptyTime:1,projectileSpeed:3200,explosionRadius:64,explosionInnerDamage:1500,explosionOuterDamage:300,suitSound:'suit_repulsor',suitPower:1});
  clone('iron_rocket','m72_law_zm',{name:'Wrist-Rocket',hideGun:true,damage:10000,minDamage:10000,fireTime:.33,clipSize:3,startAmmo:20,maxAmmo:20,reloadTime:1.2,reloadEmptyTime:1.2,
    projectileSpeed:2100,explosionRadius:256,explosionInnerDamage:600,explosionOuterDamage:75,suitSound:'suit_missile',suitPower:5});
  clone('iron_mk1_rocket','m72_law_zm',{name:'Mk1 Wrist-Rocket',hideGun:true,damage:10000,minDamage:10000,fireTime:.33,clipSize:1,startAmmo:2,maxAmmo:2,reloadTime:1.2,reloadEmptyTime:1.2,
    projectileSpeed:2100,explosionRadius:500,explosionInnerDamage:20000,explosionOuterDamage:150,suitSound:'suit_missile',suitPower:5});
  clone('iron_mk6_rocket','m72_law_zm',{name:'Mk6 Wrist-Rocket',hideGun:true,damage:10000,minDamage:10000,fireType:'Full Auto',automatic:true,fireTime:.2,clipSize:10,startAmmo:30,maxAmmo:30,
    reloadTime:1.2,reloadEmptyTime:1.2,projectileSpeed:2300,explosionRadius:200,explosionInnerDamage:1200,explosionOuterDamage:75,suitSound:'suit_missile',suitPower:5});
  // the flamethrower mod (weapon-levels/flamer.js) burns for any weapon flagged `flamethrower`
  clone('iron_mk1_flamer','rpk_zm',{name:'Mk1 Flamethrower',hideGun:true,flamethrower:true,clipSize:100,startAmmo:300,maxAmmo:300,fireTime:.1,automatic:true,fireType:'Full Auto',
    damage:1,minDamage:1,range:40,pellets:1,headMultiplier:1,reloadTime:1.83,reloadEmptyTime:1.83,projectileSpeed:0,explosionRadius:0,suitPower:.25});
  clone('iron_wm_minigun','hk21_zm',{name:'War Machine Minigun',damage:1000,minDamage:90,fireTime:.1,clipSize:125,startAmmo:500,maxAmmo:500,reloadTime:5,reloadEmptyTime:5,
    suitSound:'suit_minigun',suitPower:.2});
  clone('iron_wm_handgun','cz75_zm',{name:'War Machine Handgun',fireType:'Full Auto',automatic:true,damage:750,minDamage:90,fireTime:.15,clipSize:125,startAmmo:500,maxAmmo:500,
    reloadTime:2,reloadEmptyTime:2,suitPower:.2});
  // Repulsors, wrist rockets and the Mk1 flamethrower are part of the suit: their base gun's mesh is hidden, leaving the
  // arms (in the base gun's pose). The view caches gun models, so hidden meshes are shown again for any other weapon.
  const hiddenGun=new Set();
  host.on('update',()=>{
    const gun=api.view?.gun,hide=!!session.def?.hideGun;
    for(const o of hiddenGun)if(!hide||!gun||!o.parent||o.parent!==gun&&!isIn(o,gun)){o.visible=true;hiddenGun.delete(o);}
    if(hide&&gun)gun.traverse(o=>{if(o.isMesh&&o.visible){o.visible=false;hiddenGun.add(o);}});
  });
  const isIn=(o,root)=>{for(let p=o.parent;p;p=p.parent)if(p===root)return true;return false;};
  // the map's own fire sounds in place of the base guns'
  if(audio?.weapon){const play=audio.weapon.bind(audio);audio.weapon=(kind,def)=>{if(kind==='shot'&&def?.suitSound){sound?.(def.suitSound,{volume:.7});return;}return play(kind,def);};}


  // ---- parts -------------------------------------------------------------------------------------
  const PARTS=[
    {id:'head',label:'helmet',pick:'pick_head',place:'place_head',holo:'rotate_head'},
    {id:'body',label:'body armor',pick:'pick_body',place:'place_body',holo:'rotate_body'},
    {id:'arml',label:'left arm',pick:'pick_arm_l',place:'place_arm_l',holo:'rotate_left_arm'},
    {id:'armr',label:'right arm',pick:'pick_arm_r',place:'place_arm_r',holo:'rotate_right_arm'},
    {id:'legl',label:'left leg',pick:'pick_leg_l',place:'place_leg_l',holo:'rotate_left_leg'},
    {id:'legr',label:'right leg',pick:'pick_leg_r',place:'place_leg_r',holo:'rotate_right_leg'},
  ];
  const carrying=new Set(),placed=new Set();
  let assembled=false;
  const setPartVisuals=()=>{
    for(const p of PARTS){
      const on=placed.has(p.id);
      show('ENT_'+p.pick,!on&&!carrying.has(p.id));show('ENT_'+p.place,on);
      show('ENT_'+p.holo,!on);show('ENT_'+p.holo+'_on',on);
    }
    show('ENT_rotate_iron',placed.size>0&&!suitOf('mk3').owned);show('ENT_rotate_iron_on',placed.size>0&&suitOf('mk3').owned);
  };
  const partById=id=>PARTS.find(p=>p.id===id);
  const takePart=(id,remote)=>{
    const p=partById(id);if(!p||carrying.has(id)||placed.has(id))return;
    carrying.add(id);setPartVisuals();
    if(!remote){beep();toast(`You took the Iron Man ${p.label}`,3);sync?.emit('ir-take',id);}else toast(`A teammate took the ${p.label}`,3);
  };
  const placePart=(id,remote)=>{
    const p=partById(id);if(!p||placed.has(id))return;
    placed.add(id);carrying.delete(id);setPartVisuals();
    if(!remote){beep();sync?.emit('ir-place',id);}
    toast(`${placed.size} / 6 armor parts added`,3);
    if(placed.size===PARTS.length){assembled=true;announce('The armors are online','HALL OF ARMORS',5);}
  };
  sync?.on('ir-take',id=>takePart(id,true));sync?.on('ir-place',id=>placePart(id,true));
  for(const p of PARTS){
    const pick=named(p.pick+'_trig')[0],place=named(p.place+'_trig')[0];
    if(pick)world.addInteraction({position:center(pick),text:()=>`Take the ${p.label}`,hidden:()=>carrying.has(p.id)||placed.has(p.id),use(){takePart(p.id);return true;}});
    if(place)world.addInteraction({position:center(place),text:()=>`Add the ${p.label}`,hidden:()=>!carrying.has(p.id)||placed.has(p.id),use(){placePart(p.id);return true;}});
  }

  // ---- suits -------------------------------------------------------------------------------------
  const SUITS=[
    {id:'mk3',name:'Mark III',cost:7500,trig:'give_iron',hp:285,speed:1.05,holo:'rotate_iron',door:'iron_door',stand:'iron_stand',weapons:['iron_repulsor','iron_rocket']},
    {id:'mk1',name:'Mark I',cost:5000,trig:'give_mk1',hp:350,speed:.85,noSprint:true,holo:'rotate_mk1',display:'mk1',door:'mk1_door',stand:'mk1_stand',weapons:['iron_mk1_flamer','iron_mk1_rocket']},
    {id:'mk4',name:'Mark IV',cost:10000,trig:'give_mk4',hp:285,speed:1.1,holo:'rotate_mk4',display:'mk4',door:'mk4_door',stand:'mk4_stand',weapons:['iron_repulsor','iron_rocket']},
    {id:'mk5',name:'Mark V',cost:12500,trig:'give_mk5',hp:200,speed:1.2,holo:'rotate_mk5',display:'mk5',door:'mk5_door',stand:'mk5_stand',weapons:['iron_repulsor']},
    {id:'mk6',name:'Mark VI',cost:15000,trig:'give_mk6',hp:285,speed:1.1,holo:'rotate_mk6',display:'mk6',door:'mk6_door',stand:'mk6_stand',weapons:['iron_repulsor','iron_mk6_rocket']},
    {id:'wm',name:'War Machine',cost:10000,trig:'give_wm',hp:320,speed:.95,holo:'wm_holo_red',holoOn:'wm_holo',display:'wm_model',weapons:['iron_wm_minigun','iron_wm_handgun','iron_rocket'],needsTrivia:true},
  ].map(s=>({...s,owned:false,readyAt:0}));
  const suitOf=id=>SUITS.find(s=>s.id===id);
  let worn=null,originalSpeed=null,power=100,spaceHeld=false,flying=false,wornBefore=false,lowWarned=false,critWarned=false,hallHeard=false,saved=null,lastShots=0,healthVoiceAt=0;
  const voice=(n,v=.8)=>sound?.('jarvis_'+n,{volume:v});
  const MAX_POWER=100,FLY_DRAIN=6,THRUST=1500,RISE_CAP=260,RECHARGE=30;

  // The suit's health: maxHealth becomes the larger of the normal value and the suit's.
  const own=Object.getOwnPropertyDescriptor(session,'maxHealth');
  const baseMax=own?.get?()=>own.get.call(session):()=>own?.value??100;
  Object.defineProperty(session,'maxHealth',{configurable:true,get(){return Math.max(baseMax(),worn?.hp??0);},set(){}});

  const hud=createSuitHud({base:api.map.dir.replace(/\/?$/,'/')});

  // A suit leaves its stand by sinking out of sight and comes back by rising, like the map's stands do.
  const anims=[];
  const baseY=new Map();
  function lower(name,down,{depth=120,from=0,dur=down?1.5:2.5,hide=true}={}){
    const objs=nodes('ENT_'+name);if(!objs.length)return;
    for(const o of objs)if(!baseY.has(o))baseY.set(o,o.position.y);
    for(let i=anims.length-1;i>=0;i--)if(anims[i].name===name)anims.splice(i,1);
    if(!down)for(const o of objs)o.visible=true;
    anims.push({name,objs,down,depth,from,hide,t0:now(),dur});
  }
  host.on('update',()=>{
    for(let i=anims.length-1;i>=0;i--){
      const a=anims[i],k=Math.min(1,(now()-a.t0)/a.dur),d=-(a.down?a.from+(a.depth-a.from)*k:a.depth*(1-k));
      for(const o of a.objs){o.position.y=baseY.get(o)+d;o.updateMatrix();o.updateMatrixWorld(true);}
      if(k>=1){if(a.down&&a.hide)for(const o of a.objs)o.visible=false;anims.splice(i,1);}
    }
  });

  // The Hall of Armors holograms turn on the spot.
  // Seconds per turn, from each holo's `speed` in the map.
  const SPIN={rotate:5,rotate_head:25,rotate_head_on:25,rotate_body:25,rotate_body_on:25,rotate_left_arm:17,rotate_left_arm_on:17,rotate_right_arm:17,rotate_right_arm_on:17,
    rotate_left_leg:35,rotate_left_leg_on:35,rotate_right_leg:30,rotate_right_leg_on:30,rotate_iron:10,rotate_iron_on:10,rotate_mk1:15,rotate_mk1_on:15,rotate_mk4:17,rotate_mk4_on:17,
    rotate_mk5:12,rotate_mk5_on:12,rotate_mk6:14,rotate_mk6_on:14,wm_holo:12,wm_holo_red:12,stark_tower:10};
  const spinners=Object.entries(SPIN).flatMap(([n,period])=>nodes('ENT_'+n).map(o=>({o,period}))).map(({o,period})=>{
    o.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(o),c=box.getCenter(new THREE.Vector3());
    return {o,c,base:o.position.clone(),w:Math.PI*2/period};
  });
  host.on('update',()=>{
    for(const {o,c,base,w} of spinners){
      if(!o.visible)continue;
      const th=now()*w,cs=Math.cos(th),sn=Math.sin(th);
      o.rotation.y=th;o.position.set(base.x+c.x-(c.x*cs+c.z*sn),base.y,base.z+c.z-(-c.x*sn+c.z*cs));
      o.updateMatrix();o.updateMatrixWorld(true);
    }
  });

  // Flight: hold Space in the air while suited. The power runs down while flying and comes back on the ground.
  addEventListener('keydown',e=>{if(e.code==='Space')spaceHeld=true;});
  addEventListener('keyup',e=>{if(e.code==='Space')spaceHeld=false;});
  addEventListener('blur',()=>{spaceHeld=false;});
  const stats=()=>{const b=window.kino.scoreboard?.stats?.()??{};
    return {kills:session.kills??b.k??0,headshots:session.headshots??b.h??0,gibs:window.kino.dismemberment?.gibs??0,
      left:Math.max(0,(session.total??0)-(session.killed??0)),downs:b.d??0,revives:b.r??0};};
  host.on('update',(dt)=>{
    const step=typeof dt==='number'&&dt>0&&dt<.25?dt:1/60;
    if(!worn){flying=false;lastShots=session.shots??0;return;}
    const grounded=player.isGrounded??player.onFloor;
    flying=spaceHeld&&!grounded&&power>0&&session.phase==='fighting';
    if(flying){power-=FLY_DRAIN*step;player.velocity.y=Math.min(RISE_CAP,Math.max(player.velocity.y,0)+THRUST*step);}
    // each shot of a suit weapon costs power (the map: repulsor 1, rocket 5)
    const shots=session.shots??0;if(shots>lastShots)power-=(session.def?.suitPower??0)*(shots-lastShots);lastShots=shots;
    power=Math.max(0,power);
    if(power<25&&!lowWarned){lowWarned=true;hud.warn('POWER LEVELS LOW');voice('power_low_'+Math.floor(Math.random()*6));}
    if(power<11&&!critWarned){critWarned=true;hud.warn('POWER LEVELS CRITICAL');voice('power_low_'+Math.floor(Math.random()*6));}
    if(session.health<75&&now()>=healthVoiceAt){healthVoiceAt=now()+10;voice('health_low_'+Math.floor(Math.random()*6));}
    hud.update(power,stats());
    if(power<=0){const s=worn;takeOff(s,'Suit power depleted. The armor returns to its stand.');}
  });

  // The stands, as the map does them: the alcove door slides down, the suit and its stand sink, the door closes again.
  function standDown(s){
    if(!s.door){if(s.display)lower(s.display,true);return;}
    lower(s.door,true,{depth:100,dur:2,hide:false});
    setTimeout(()=>{if(s.display)lower(s.display,true);if(s.stand)lower(s.stand,true,{hide:false,dur:1.5});},2000);
    setTimeout(()=>lower(s.door,false,{depth:100,dur:3}),4000);
  }
  function standUp(s){
    if(!s.door){if(s.display)lower(s.display,false);return;}
    lower(s.door,true,{depth:100,dur:3,hide:false});
    setTimeout(()=>{if(s.display)lower(s.display,false,{dur:3});if(s.stand)lower(s.stand,false,{dur:3});},3000);
    setTimeout(()=>lower(s.door,false,{depth:100,dur:3}),6200);
  }

  function putOn(s){
    worn=s;session.health=session.maxHealth;
    if(!originalSpeed)originalSpeed={move:player.moveSpeed,sprint:player.sprintSpeed};
    player.moveSpeed=originalSpeed.move*s.speed;player.sprintSpeed=s.noSprint?player.moveSpeed:originalSpeed.sprint*s.speed;
    standDown(s);
    show('ENT_'+(s.holoOn??s.holo+'_on'),false);if(s.id==='mk3')show('ENT_rotate_iron_on',false);
    power=MAX_POWER;lowWarned=critWarned=false;lastShots=session.shots??0;
    // the suit's weapons replace yours until it comes off
    const kit=s.weapons.filter(id=>W[id]);
    if(kit.length){
      session.cancelReload?.();saved={inventory:session.inventory.map(w=>({...w})),slot:session.slot};
      session.inventory=kit.map(id=>({id,mag:W[id].clipSize,reserve:Math.max(0,W[id].maxAmmo-W[id].clipSize),upgraded:false}));session.slot=0;equipView?.();
    }
    hud.show(s.id);sound?.(s.id==='mk1'?'suit_on_mk1':'suit_on',{volume:.7});
    voice(wornBefore?'suit_up_0'+Math.floor(Math.random()*3):'suit_up_first');wornBefore=true;
    announce(`${s.name} armor`,'SUIT ONLINE',3);beep();
  }
  function takeOff(s,why){
    if(worn!==s)return;
    worn=null;s.readyAt=now()+RECHARGE;
    // your guns come back (anything bought while suited is kept, in front)
    if(saved){
      const extra=session.inventory.filter(w=>!W[w.id]?.suitWeapon);
      session.cancelReload?.();session.inventory=[...extra,...saved.inventory].slice(0,Math.max(saved.inventory.length,extra.length));
      session.slot=extra.length?0:Math.min(saved.slot,session.inventory.length-1);saved=null;equipView?.();
    }
    if(originalSpeed){player.moveSpeed=originalSpeed.move;player.sprintSpeed=originalSpeed.sprint;}
    if(session.health>session.maxHealth)session.health=session.maxHealth;
    standUp(s);
    show('ENT_'+(s.holoOn??s.holo+'_on'),true);if(s.id==='mk3')show('ENT_rotate_iron_on',true);
    hud.hide();flying=false;sound?.(s.id==='mk1'?'suit_off_mk1':'suit_off',{volume:.7});
    voice('charging');
    toast(why??`${s.name} armor is recharging`,3);
  }
  const buy=s=>{
    if(s.owned)return;s.owned=true;setPartVisuals();
    show('ENT_'+s.holo,false);show('ENT_'+(s.holoOn??s.holo+'_on'),true);if(s.id==='mk3')show('ENT_rotate_iron',false);
    if(SUITS.filter(x=>x.id!=='mk16'&&x.owned).length===6){show('ENT_malibu_wall',false);show('ENT_purchase_armors',false);announce('All six armors are yours','THE WALL FALLS AWAY',4);voice('armors_purchased');}
  };
  sync?.on('ir-buy',id=>{const s=suitOf(id);if(s){buy(s);toast(`A teammate bought the ${s.name} armor`,3);}});
  for(const s of SUITS){
    const trig=named(s.trig)[0];if(!trig)continue;
    const e=world.addInteraction({position:center(trig),
      text:()=>!s.owned?`Buy ${s.name} armor · ${s.cost}`:worn===s?`Take off ${s.name} armor`:now()<s.readyAt?`${s.name} armor is charging`:`Put on ${s.name} armor`,
      use(){
        if(!s.owned){
          if(session.points<s.cost){toast('Not enough points',2);return false;}
          session.spend(s.cost);beep();buy(s);sync?.emit('ir-buy',s.id);
          toast(`${s.name} armor bought. Use the stand to put it on.`,4);return true;
        }
        if(worn===s){takeOff(s);return true;}
        if(worn){voice('dup_armor_'+Math.floor(Math.random()*5));toast('You can only wear one armor at a time',3);return false;}
        if(now()<s.readyAt){toast('The armor is still charging',2);return false;}
        putOn(s);return true;
      }});
    e.locked=()=>!s.owned&&(!assembled||(s.needsTrivia&&!triviaDone()));
    Object.defineProperty(e,'lockedText',{get:()=>!assembled?'The armor stand is offline. Build the six Iron Man parts first.':'The War Machine needs the trivia reward',configurable:true});
  }

  // ---- Mark 16: open the door at its stand, then the biometric scanner (the map's joke) kills anyone it does not know
  let doorOpen=false,scanUntil=0;
  const g16=named('give_mk16')[0],u16=named('unlock_mk16')[0];
  if(g16)world.addInteraction({position:center(g16),text:()=>doorOpen?'The Mark 16 armor needs authorization':'Open the bonus Mark 16 Nightclub armor',
    hidden:()=>doorOpen,use(){doorOpen=true;lower('mk16_door',true);beep();toast('The door opens',3);return true;}})
    .locked=()=>!assembled;
  if(u16)world.addInteraction({position:center(u16),text:()=>'Authorize Mark 16 Nightclub armor',hidden:()=>!doorOpen||now()<scanUntil,
    use(){
      scanUntil=now()+4;toast('Checking biometrics...',4);
      setTimeout(()=>{
        toast('You are not authorized. Clearly, you can\'t read',4);
        session.effects.invulnerable=0;session.damage(session.health+90);
      },4000);
      return true;
    }});
  // The War Machine's cage sinks 100 at the start and goes away once the trivia is done.
  let cageOpen=false;
  lower('wm_cage',true,{depth:100,dur:2,hide:false});
  host.on('update',()=>{if(!cageOpen&&triviaDone()){cageOpen=true;lower('wm_cage',true,{depth:250,from:100,dur:4});}});
  const hall=named('hall_of_armors')[0];
  host.on('update',()=>{
    if(!hallHeard&&hall&&session.phase==='fighting'){
      const c=center(hall),f=player.getFeetPosition();
      if(Math.hypot(f.x-c.x,f.z-c.z)<220&&Math.abs(f.y-c.y)<220){hallHeard=true;voice('hall_of_armors');}
    }
  });
  host.on('update',()=>{
    if(worn&&(['reviving','gameover'].includes(session.phase)))takeOff(worn,'The armor was lost');
  });
  host.on('reset',()=>{
    hallHeard=false;wornBefore=false;cageOpen=false;carrying.clear();placed.clear();assembled=false;doorOpen=false;scanUntil=0;power=MAX_POWER;anims.length=0;
    for(const [o,y] of baseY){o.position.y=y;o.updateMatrix();o.updateMatrixWorld(true);}show('ENT_malibu_wall',true);show('ENT_purchase_armors',true);show('ENT_mk16_door',true);show('ENT_wm_cage',true);lower('wm_cage',true,{depth:100,dur:2,hide:false});
    if(worn){worn=null;if(originalSpeed){player.moveSpeed=originalSpeed.move;player.sprintSpeed=originalSpeed.sprint;}hud.hide();}saved=null;
    for(const s of SUITS){s.owned=false;s.readyAt=0;if(s.display)show('ENT_'+s.display,true);show('ENT_'+s.holo,true);show('ENT_'+(s.holoOn??s.holo+'_on'),false);}
    setPartVisuals();
  });
  setPartVisuals();
  for(const s of SUITS)show('ENT_'+(s.holoOn??s.holo+'_on'),false);

  board?.addCollectible({id:'cc-iron-parts',label:'Iron Man armor',value:()=>`${placed.size} / 6 built`,done:()=>assembled,
    parts:()=>PARTS.map(p=>({label:p.label,short:{head:'HD',body:'BD',arml:'LA',armr:'RA',legl:'LL',legr:'RL'}[p.id],state:placed.has(p.id)?'placed':carrying.has(p.id)?'carried':'none'}))});
  board?.addCollectible({id:'cc-armors',label:'Armors',value:()=>`${SUITS.filter(s=>s.owned).length} / ${SUITS.length}${worn?` · wearing ${worn.name}`:''}`,done:()=>SUITS.every(s=>s.owned)});
  return {state:()=>({carrying:[...carrying],placed:[...placed],assembled,worn:worn?.id??null,owned:SUITS.filter(s=>s.owned).map(s=>s.id),maxHealth:session.maxHealth,moveSpeed:player.moveSpeed})};
}

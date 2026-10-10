// Cheese Cube's Iron Man suits (a cut-down port of the map's _iron_man_mk*.gsc scripts):
//   1. Six parts lie around the map (helmet, body, two arms, two legs). Carry each to the Hall of Armors and add it.
//   2. With all six built the suits can be bought at their stands: Mk1 5000, Mk3 7500, Mk4 10000, Mk5 12500, Mk6 15000.
//      The War Machine (10000) also needs the trivia reward.
//   3. Use a bought suit's stand to put it on (one suit at a time): more health, a different walking speed, and the
//      suit's own weapons in place of yours (repulsors and wrist rockets; Mk1 flamethrower; War Machine minigun and
//      handgun), as the map does. Your guns come back when the suit comes off. Use the stand again to take it off.
//   4. Suit power (the JARVIS HUD, suit-hud.js), one per suit as in the map: each repulsor shot costs 1, a rocket 5,
//      flying (hold Space in the air) 6 a second, and it does not recharge while worn. At zero the suit shuts down and
//      goes back to its stand. On the stand it recharges 2 a second and can be worn again once above 98. Each suit's
//      computer screen in the Hall of Armors (`<suit>_power1-7`) shows its power in seven steps. Dying takes the suit off.
// The weapons reuse BO1 guns' viewmodels (Ray Gun, LAW, HK21, CZ75, RPK) with the map's stats and fire sounds.
// Not ported: the Mk16 suit itself (its scanner joke is), the Mk5 suitcase and Mk6 laser.
import * as THREE from 'three';
import { createSuitHud } from '../stark/suit-hud.js';
import { grant } from '../stark/unlocks.js';
import { SUITS as ARMORS, addSuitWeapons, createArmor, soundPlayer, jarvisBase, MAX_POWER, READY } from '../stark/armor.js';

export function setupSuits({api,world,session,host,toast,announce,named,center,nodes,show,beep,now,board,player,triviaDone,sync,sound}){
  const {equipView,data,audio}=api;

  // ---- the suits' weapons, the hidden base guns and the suits' fire sounds: shared (mods/stark/armor.js)
  const W=data?.weapons??{};addSuitWeapons(W);

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
    if(placed.size===PARTS.length){assembled=true;announce('The armors are online','HALL OF ARMORS',5);
      if(grant({stark:true}).length)setTimeout(()=>toast('STARK.EXE unlocked: Iron Man suits at terminals on other maps',6),5500);}   // account unlock (mods/stark)
  };
  sync?.on('ir-take',id=>takePart(id,true));sync?.on('ir-place',id=>placePart(id,true));
  for(const p of PARTS){
    const pick=named(p.pick+'_trig')[0],place=named(p.place+'_trig')[0];
    if(pick)world.addInteraction({position:center(pick),text:()=>`Take the ${p.label}`,hidden:()=>carrying.has(p.id)||placed.has(p.id),use(){takePart(p.id);return true;}});
    if(place)world.addInteraction({position:center(place),text:()=>`Add the ${p.label}`,hidden:()=>!carrying.has(p.id)||placed.has(p.id),use(){placePart(p.id);return true;}});
  }

  // ---- suits -------------------------------------------------------------------------------------
  const CC={
    mk3:{trig:'give_iron',holo:'rotate_iron',door:'iron_door',stand:'iron_stand'},
    mk1:{trig:'give_mk1',holo:'rotate_mk1',display:'mk1',door:'mk1_door',stand:'mk1_stand'},
    mk4:{trig:'give_mk4',holo:'rotate_mk4',display:'mk4',door:'mk4_door',stand:'mk4_stand'},
    mk5:{trig:'give_mk5',holo:'rotate_mk5',display:'mk5',door:'mk5_door',stand:'mk5_stand',suitcase:true},
    mk6:{trig:'give_mk6',holo:'rotate_mk6',display:'mk6',door:'mk6_door',stand:'mk6_stand'},
    wm:{trig:'give_wm',holo:'wm_holo_red',holoOn:'wm_holo',display:'wm_model',needsTrivia:true},
    // the bonus suit: free, behind its door and the biometric scanner (see the Mark 16 section)
    mk16:{trig:'give_mk16',holo:'rotate_mk16',bonus:true},
  };
  const SUITS=ARMORS.map(a=>({...a,...CC[a.id],owned:false,power:MAX_POWER}));
  const suitOf=id=>SUITS.find(s=>s.id===id);
  let hallHeard=false;

  const hud=createSuitHud({base:jarvisBase()});   // the JARVIS HUD and voices: shared with every map (mods/stark/jarvis)
  const jarvis=soundPlayer(audio,jarvisBase()+'sounds/').play;
  // wearing (health, speed, weapons, power, flight, JARVIS, cloak): shared; coming off puts the suit back on its stand
  const armor=createArmor({api,host,session,player,sound:jarvis,toast,announce,beep,hud,suits:SUITS,
    onOff:s=>{standUp(s);show('ENT_'+(s.holoOn??s.holo+'_on'),true);if(s.id==='mk3')show('ENT_rotate_iron_on',true);}});
  const voice=armor.voice,wornSuit=()=>armor.worn();

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

  // Suits on their stands recharge; each suit's screen shows its power (the map's thresholds), blank until it is bought.
  const SCREENS={mk3:'mk3_power',mk4:'mk4_power',mk5:'mk5_power',mk6:'mk6_power',wm:'wm_power'};
  const step7=p=>p>97?7:p>87?6:p>65?5:p>50?4:p>26?3:p>6?2:1,shownStep=new Map();
  for(const pre of Object.values(SCREENS))for(let i=1;i<=7;i++)show('ENT_'+pre+i,false);
  show('ENT_mk16_power6',false);
  host.on('update',dt=>{
    const step=typeof dt==='number'&&dt>0&&dt<.25?dt:1/60;
    for(const s of SUITS){
      const pre=SCREENS[s.id];if(!pre)continue;
      const want=s.owned?step7(s.power):0;if(shownStep.get(s.id)===want)continue;shownStep.set(s.id,want);
      for(let i=1;i<=7;i++)show('ENT_'+pre+i,i===want);
    }
  });
  host.on('reset',()=>shownStep.clear());

  // The Mark V travels as a suitcase (the map's _iron_man_mk5.gsc): its stand hands you the case (in place of your
  // current gun when both slots are full), the suit sinks from its alcove, and firing the case suits you up on the spot.
  // Bring the case back to the stand to trade it for your gun; going down loses the case back to the stand.
  let caseOut=null;   // {suit, taken: the gun the case replaced, or null}
  function takeCase(s){
    session.cancelReload?.();
    const inv=session.inventory,item={id:'iron_mk5_suitcase',mag:1,reserve:0,upgraded:false};
    let taken=null;
    if(inv.length>=2){taken={...inv[session.slot]};inv[session.slot]=item;}else{inv.push(item);session.slot=inv.length-1;}
    caseOut={suit:s,taken};standDown(s);equipView?.();toast('Fire the suitcase to suit up',3);beep();
  }
  function dropCase(){
    const inv=session.inventory,i=inv.findIndex(w=>w.id==='iron_mk5_suitcase');
    if(i>=0){if(caseOut?.taken)inv[i]=caseOut.taken;else{inv.splice(i,1);session.slot=Math.min(session.slot,Math.max(0,inv.length-1));}}
    caseOut=null;equipView?.();
  }
  function returnCase(){const s=caseOut.suit;dropCase();standUp(s);}
  let caseShots=0;
  host.on('update',()=>{
    const shots=session.shots??0;
    if(caseOut&&shots>caseShots&&session.def?.suitcase&&!wornSuit()){const s=caseOut.suit;dropCase();putOn(s,true);}
    caseShots=shots;
    if(caseOut&&['reviving','gameover'].includes(session.phase)){const s=caseOut.suit;dropCase();standUp(s);toast('The suitcase was lost',3);}
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

  function putOn(s,fromCase=false){
    if(!fromCase)standDown(s);
    show('ENT_'+(s.holoOn??s.holo+'_on'),false);if(s.id==='mk3')show('ENT_rotate_iron_on',false);
    armor.putOn(s,{quick:fromCase});
  }
  const takeOff=(s,why)=>armor.takeOff(s,why);
  const buy=s=>{
    if(s.owned)return;s.owned=true;setPartVisuals();
    show('ENT_'+s.holo,false);show('ENT_'+(s.holoOn??s.holo+'_on'),true);if(s.id==='mk3')show('ENT_rotate_iron',false);
    if(SUITS.filter(x=>x.id!=='mk16'&&x.owned).length===6){show('ENT_malibu_wall',false);show('ENT_purchase_armors',false);announce('All six armors are yours','THE WALL FALLS AWAY',4);voice('armors_purchased');}
  };
  sync?.on('ir-buy',id=>{const s=suitOf(id);if(s){buy(s);toast(`A teammate bought the ${s.name} armor`,3);}});
  for(const s of SUITS){
    const trig=named(s.trig)[0];if(!trig)continue;
    const e=world.addInteraction({position:center(trig),
      hidden:()=>!!s.bonus&&!s.owned,
      text:()=>!s.owned?`Buy ${s.name} armor · ${s.cost}`:wornSuit()===s?`Take off ${s.name} armor`:s.suitcase&&caseOut?`Return the ${s.name} suitcase`:s.power<=READY?`${s.name} armor is charging · ${Math.floor(s.power)}%`:s.suitcase?`Take the ${s.name} suitcase (takes your current gun)`:`Put on ${s.name} armor`,
      use(){
        if(!s.owned){
          if(session.points<s.cost){toast('Not enough points',2);return false;}
          session.spend(s.cost);beep();buy(s);sync?.emit('ir-buy',s.id);
          toast(`${s.name} armor bought. Use the stand to put it on.`,4);return true;
        }
        if(wornSuit()===s){takeOff(s);return true;}
        if(s.suitcase&&caseOut){returnCase();toast('Suitcase returned',2);return true;}
        if(wornSuit()){voice('dup_armor_'+Math.floor(Math.random()*5));toast('You can only wear one armor at a time',3);return false;}
        if(s.power<=READY){toast('The armor is still charging',2);return false;}
        if(s.suitcase){takeCase(s);return true;}
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
  // The map lets six named players (its makers) through; everyone else is killed ("Clearly, you can't read"). Here the
  // scanner also knows you once you own all six armors, so the bonus suit can be earned.
  const mk16=suitOf('mk16');
  const authorize=(remote)=>{if(mk16.owned)return;mk16.owned=true;show('ENT_rotate_mk16',false);show('ENT_rotate_mk16_on',true);
    if(!remote){sync?.emit('ir-mk16');toast('Authorization confirmed',3);setTimeout(()=>toast('Welcome, Mr. Stark',3),2000);setTimeout(()=>toast('Mark 16 Nightclub armor authorized for all players',4),4000);}
    else toast('A teammate authorized the Mark 16 Nightclub armor',4);};
  sync?.on('ir-mk16',()=>authorize(true));
  if(u16)world.addInteraction({position:center(u16),text:()=>'Authorize Mark 16 Nightclub armor',hidden:()=>!doorOpen||now()<scanUntil||mk16.owned,
    use(){
      scanUntil=now()+4;toast('Checking biometrics...',4);
      const known=SUITS.filter(x=>!x.bonus&&x.owned).length===6;
      setTimeout(()=>{
        if(known){authorize(false);return;}
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
  host.on('reset',()=>{
    hallHeard=false;cageOpen=false;carrying.clear();placed.clear();assembled=false;doorOpen=false;scanUntil=0;anims.length=0;caseOut=null;
    for(const [o,y] of baseY){o.position.y=y;o.updateMatrix();o.updateMatrixWorld(true);}show('ENT_malibu_wall',true);show('ENT_purchase_armors',true);show('ENT_mk16_door',true);show('ENT_wm_cage',true);lower('wm_cage',true,{depth:100,dur:2,hide:false});
    for(const s of SUITS){s.owned=false;if(s.display)show('ENT_'+s.display,true);show('ENT_'+s.holo,true);show('ENT_'+(s.holoOn??s.holo+'_on'),false);}
    setPartVisuals();
  });
  setPartVisuals();
  for(const s of SUITS)show('ENT_'+(s.holoOn??s.holo+'_on'),false);

  board?.addCollectible({id:'cc-iron-parts',label:'Iron Man armor',value:()=>`${placed.size} / 6 built`,done:()=>assembled,
    parts:()=>PARTS.map(p=>({label:p.label,short:{head:'HD',body:'BD',arml:'LA',armr:'RA',legl:'LL',legr:'RL'}[p.id],state:placed.has(p.id)?'placed':carrying.has(p.id)?'carried':'none'}))});
  board?.addCollectible({id:'cc-armors',label:'Armors',value:()=>`${SUITS.filter(s=>!s.bonus&&s.owned).length} / ${SUITS.filter(s=>!s.bonus).length}${wornSuit()?` · wearing ${wornSuit().name}`:''}`,done:()=>SUITS.every(s=>s.bonus||s.owned)});
  // the ending takes every suit off
  window.kino.cheeseCube.suitsOff=()=>{if(wornSuit())takeOff(wornSuit(),'The armor powers down');};
  return {state:()=>({carrying:[...carrying],placed:[...placed],assembled,worn:wornSuit()?.id??null,owned:SUITS.filter(s=>s.owned).map(s=>s.id),maxHealth:session.maxHealth,moveSpeed:player.moveSpeed})};
}

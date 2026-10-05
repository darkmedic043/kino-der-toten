// Cheese Cube's Iron Man suits (a cut-down port of the map's _iron_man_mk*.gsc scripts):
//   1. Six parts lie around the map (helmet, body, two arms, two legs). Carry each to the Hall of Armors and add it.
//   2. With all six built the suits can be bought at their stands: Mk1 5000, Mk3 7500, Mk4 10000, Mk5 12500, Mk6 15000.
//      The War Machine (10000) also needs the trivia reward.
//   3. Use a bought suit's stand to put it on (one suit at a time): more health, a different walking speed, the suit's
//      weapon on the first wear (stand-ins from the weapon list). Use the stand again to take it off. The suit returns to
//      its stand and recharges for 20 s. Dying also takes the suit off.
// Not ported: flight, the suit HUD, power meter, the stand and door animations, the Mk16 and the holo spinning.
export function setupSuits({api,world,session,host,toast,announce,named,center,show,beep,now,board,player,triviaDone}){
  const {equipView,data}=api;

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
  for(const p of PARTS){
    const pick=named(p.pick+'_trig')[0],place=named(p.place+'_trig')[0];
    if(pick)world.addInteraction({position:center(pick),text:()=>`Take the ${p.label}`,hidden:()=>carrying.has(p.id)||placed.has(p.id),
      use(){carrying.add(p.id);setPartVisuals();beep();toast(`You took the Iron Man ${p.label}`,3);return true;}});
    if(place)world.addInteraction({position:center(place),text:()=>`Add the ${p.label}`,hidden:()=>!carrying.has(p.id)||placed.has(p.id),
      use(){
        placed.add(p.id);carrying.delete(p.id);setPartVisuals();beep();toast(`${placed.size} / 6 armor parts added`,3);
        if(placed.size===PARTS.length){assembled=true;announce('The armors are online','HALL OF ARMORS',5);}
        return true;}});
  }

  // ---- suits -------------------------------------------------------------------------------------
  const SUITS=[
    {id:'mk3',name:'Mark III',cost:7500,trig:'give_iron',hp:285,speed:1.05,holo:'rotate_iron',weapon:'ray_gun_zm'},
    {id:'mk1',name:'Mark I',cost:5000,trig:'give_mk1',hp:350,speed:.85,noSprint:true,holo:'rotate_mk1',display:'mk1',weapon:'ray_gun_zm'},
    {id:'mk4',name:'Mark IV',cost:10000,trig:'give_mk4',hp:285,speed:1.1,holo:'rotate_mk4',display:'mk4',weapon:'m72_law_zm'},
    {id:'mk5',name:'Mark V',cost:12500,trig:'give_mk5',hp:200,speed:1.2,holo:'rotate_mk5',display:'mk5',weapon:'ray_gun_zm'},
    {id:'mk6',name:'Mark VI',cost:15000,trig:'give_mk6',hp:285,speed:1.1,holo:'rotate_mk6',display:'mk6',weapon:'m72_law_zm'},
    {id:'wm',name:'War Machine',cost:10000,trig:'give_wm',hp:320,speed:.95,display:'wm_model',weapon:'m72_law_zm',needsTrivia:true},
  ].map(s=>({...s,owned:false,given:false,readyAt:0}));
  const suitOf=id=>SUITS.find(s=>s.id===id);
  let worn=null,originalSpeed=null;

  // The suit's health: maxHealth becomes the larger of the normal value and the suit's.
  const own=Object.getOwnPropertyDescriptor(session,'maxHealth');
  const baseMax=own?.get?()=>own.get.call(session):()=>own?.value??100;
  Object.defineProperty(session,'maxHealth',{configurable:true,get(){return Math.max(baseMax(),worn?.hp??0);},set(){}});

  const overlay=document.createElement('div');overlay.id='suit-hud';
  overlay.style.cssText='position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;transition:opacity 1.2s;background:radial-gradient(ellipse at center,transparent 55%,#b8211a55 100%);box-shadow:inset 0 0 90px #e8a02a55';
  overlay.innerHTML='<div style="position:absolute;left:50%;bottom:22px;transform:translateX(-50%);font:600 12px/1 system-ui,sans-serif;letter-spacing:.36em;color:#f4c84a;text-shadow:0 0 8px #000">ARMOR ONLINE</div>';
  document.body.append(overlay);

  function putOn(s){
    worn=s;session.health=session.maxHealth;
    if(!originalSpeed)originalSpeed={move:player.moveSpeed,sprint:player.sprintSpeed};
    player.moveSpeed=originalSpeed.move*s.speed;player.sprintSpeed=s.noSprint?player.moveSpeed:originalSpeed.sprint*s.speed;
    if(s.display)show('ENT_'+s.display,false);
    show('ENT_'+s.holo+'_on',false);if(s.id==='mk3')show('ENT_rotate_iron_on',false);
    overlay.querySelector('div').textContent=s.name.toUpperCase()+' ARMOR ONLINE';overlay.style.opacity=1;
    if(!s.given&&data?.weapons?.[s.weapon]){s.given=true;session.giveWeapon(s.weapon);equipView?.();}
    announce(`${s.name} armor`,'SUIT ONLINE',3);beep();
  }
  function takeOff(s,why){
    if(worn!==s)return;
    worn=null;s.readyAt=now()+20;
    if(originalSpeed){player.moveSpeed=originalSpeed.move;player.sprintSpeed=originalSpeed.sprint;}
    if(session.health>session.maxHealth)session.health=session.maxHealth;
    if(s.display)show('ENT_'+s.display,true);
    show('ENT_'+s.holo+'_on',true);if(s.id==='mk3')show('ENT_rotate_iron_on',true);
    overlay.style.opacity=0;
    toast(why??`${s.name} armor is recharging`,3);
  }
  for(const s of SUITS){
    const trig=named(s.trig)[0];if(!trig)continue;
    const e=world.addInteraction({position:center(trig),
      text:()=>!s.owned?`Buy ${s.name} armor · ${s.cost}`:worn===s?`Take off ${s.name} armor`:now()<s.readyAt?`${s.name} armor is charging`:`Put on ${s.name} armor`,
      use(){
        if(!s.owned){
          if(session.points<s.cost){toast('Not enough points',2);return false;}
          session.spend(s.cost);s.owned=true;beep();setPartVisuals();
          show('ENT_'+s.holo,false);show('ENT_'+s.holo+'_on',true);if(s.id==='mk3')show('ENT_rotate_iron',false);
          toast(`${s.name} armor bought. Use the stand to put it on.`,4);return true;
        }
        if(worn===s){takeOff(s);return true;}
        if(worn){toast('You can only wear one armor at a time',3);return false;}
        if(now()<s.readyAt){toast('The armor is still charging',2);return false;}
        putOn(s);return true;
      }});
    e.locked=()=>!s.owned&&(!assembled||(s.needsTrivia&&!triviaDone()));
    Object.defineProperty(e,'lockedText',{get:()=>!assembled?'The armor stand is offline. Build the six Iron Man parts first.':'The War Machine needs the trivia reward',configurable:true});
  }
  host.on('update',()=>{
    if(worn&&(['reviving','gameover'].includes(session.phase)))takeOff(worn,'The armor was lost');
  });
  host.on('reset',()=>{
    carrying.clear();placed.clear();assembled=false;
    if(worn){worn=null;if(originalSpeed){player.moveSpeed=originalSpeed.move;player.sprintSpeed=originalSpeed.sprint;}overlay.style.opacity=0;}
    for(const s of SUITS){s.owned=false;s.given=false;s.readyAt=0;if(s.display)show('ENT_'+s.display,true);show('ENT_'+s.holo,true);show('ENT_'+s.holo+'_on',false);}
    setPartVisuals();
  });
  setPartVisuals();
  for(const s of SUITS)show('ENT_'+s.holo+'_on',false);

  board?.addCollectible({id:'cc-iron-parts',label:'Iron Man parts',value:()=>`${placed.size} / 6${carrying.size?` · carrying ${carrying.size}`:''}`,done:()=>assembled});
  board?.addCollectible({id:'cc-armors',label:'Armors',value:()=>`${SUITS.filter(s=>s.owned).length} / ${SUITS.length}${worn?` · wearing ${worn.name}`:''}`,done:()=>SUITS.every(s=>s.owned)});
  return {state:()=>({carrying:[...carrying],placed:[...placed],assembled,worn:worn?.id??null,owned:SUITS.filter(s=>s.owned).map(s=>s.id),maxHealth:session.maxHealth,moveSpeed:player.moveSpeed})};
}

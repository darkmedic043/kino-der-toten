// Cheese Cube's Iron Man suits (a cut-down port of the map's _iron_man_mk*.gsc scripts):
//   1. Six parts lie around the map (helmet, body, two arms, two legs). Carry each to the Hall of Armors and add it.
//   2. With all six built the suits can be bought at their stands: Mk1 5000, Mk3 7500, Mk4 10000, Mk5 12500, Mk6 15000.
//      The War Machine (10000) also needs the trivia reward.
//   3. Use a bought suit's stand to put it on (one suit at a time): more health, a different walking speed, the suit's
//      weapon on the first wear (stand-ins from the weapon list). Use the stand again to take it off. The suit returns to
//      its stand and recharges for 20 s. Dying also takes the suit off.
// Not ported: flight, the suit HUD, power meter, the stand and door animations, the Mk16 and the holo spinning.
import * as THREE from 'three';

export function setupSuits({api,world,session,host,toast,announce,named,center,nodes,show,beep,now,board,player,triviaDone,sync}){
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
    {id:'mk3',name:'Mark III',cost:7500,trig:'give_iron',hp:285,speed:1.05,holo:'rotate_iron',weapon:'ray_gun_zm'},
    {id:'mk1',name:'Mark I',cost:5000,trig:'give_mk1',hp:350,speed:.85,noSprint:true,holo:'rotate_mk1',display:'mk1',weapon:'ray_gun_zm'},
    {id:'mk4',name:'Mark IV',cost:10000,trig:'give_mk4',hp:285,speed:1.1,holo:'rotate_mk4',display:'mk4',weapon:'m72_law_zm'},
    {id:'mk5',name:'Mark V',cost:12500,trig:'give_mk5',hp:200,speed:1.2,holo:'rotate_mk5',display:'mk5',weapon:'ray_gun_zm'},
    {id:'mk6',name:'Mark VI',cost:15000,trig:'give_mk6',hp:285,speed:1.1,holo:'rotate_mk6',display:'mk6',weapon:'m72_law_zm'},
    {id:'wm',name:'War Machine',cost:10000,trig:'give_wm',hp:320,speed:.95,display:'wm_model',weapon:'m72_law_zm',needsTrivia:true},
  ].map(s=>({...s,owned:false,given:false,readyAt:0}));
  const suitOf=id=>SUITS.find(s=>s.id===id);
  let worn=null,originalSpeed=null,power=100,spaceHeld=false,flying=false;
  const MAX_POWER=100,DRAIN=22,REGEN=16,THRUST=1500,RISE_CAP=260;

  // The suit's health: maxHealth becomes the larger of the normal value and the suit's.
  const own=Object.getOwnPropertyDescriptor(session,'maxHealth');
  const baseMax=own?.get?()=>own.get.call(session):()=>own?.value??100;
  Object.defineProperty(session,'maxHealth',{configurable:true,get(){return Math.max(baseMax(),worn?.hp??0);},set(){}});

  const overlay=document.createElement('div');overlay.id='suit-hud';
  overlay.style.cssText='position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;transition:opacity 1.2s;background:radial-gradient(ellipse at center,transparent 55%,#b8211a55 100%);box-shadow:inset 0 0 90px #e8a02a55';
  overlay.innerHTML='<div id="suit-name" style="position:absolute;left:50%;bottom:44px;transform:translateX(-50%);font:600 12px/1 system-ui,sans-serif;letter-spacing:.36em;color:#f4c84a;text-shadow:0 0 8px #000">ARMOR ONLINE</div><div style="position:absolute;left:50%;bottom:26px;transform:translateX(-50%);width:220px;height:7px;background:#000a;border:1px solid #f4c84a99"><i id="suit-power" style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#e8a02a,#f4e08a)"></i></div>';
  document.body.append(overlay);

  // A suit leaves its stand by sinking out of sight and comes back by rising, like the map's stands do.
  const anims=[];
  const baseY=new Map();
  function lower(name,down){
    const objs=nodes('ENT_'+name);if(!objs.length)return;
    for(const o of objs)if(!baseY.has(o))baseY.set(o,o.position.y);
    for(let i=anims.length-1;i>=0;i--)if(anims[i].name===name)anims.splice(i,1);
    if(!down)for(const o of objs)o.visible=true;
    anims.push({name,objs,down,t0:now(),dur:down?1.5:2.5});
  }
  host.on('update',()=>{
    for(let i=anims.length-1;i>=0;i--){
      const a=anims[i],k=Math.min(1,(now()-a.t0)/a.dur),d=-120*(a.down?k:1-k);
      for(const o of a.objs){o.position.y=baseY.get(o)+d;o.updateMatrix();o.updateMatrixWorld(true);}
      if(k>=1){if(a.down)for(const o of a.objs)o.visible=false;anims.splice(i,1);}
    }
  });

  // The Hall of Armors holograms turn on the spot.
  const SPIN=['rotate_head','rotate_head_on','rotate_body','rotate_body_on','rotate_left_arm','rotate_left_arm_on','rotate_right_arm','rotate_right_arm_on','rotate_left_leg','rotate_left_leg_on','rotate_right_leg','rotate_right_leg_on','rotate_iron','rotate_iron_on','rotate_mk1','rotate_mk1_on','rotate_mk4','rotate_mk4_on','rotate_mk5','rotate_mk5_on','rotate_mk6','rotate_mk6_on'];
  const spinners=SPIN.flatMap(n=>nodes('ENT_'+n)).map(o=>{
    o.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(o),c=box.getCenter(new THREE.Vector3());
    return {o,c,base:o.position.clone()};
  });
  host.on('update',()=>{
    const th=now()*.9,cs=Math.cos(th),sn=Math.sin(th);
    for(const {o,c,base} of spinners){
      if(!o.visible)continue;
      o.rotation.y=th;o.position.set(base.x+c.x-(c.x*cs+c.z*sn),base.y,base.z+c.z-(-c.x*sn+c.z*cs));
      o.updateMatrix();o.updateMatrixWorld(true);
    }
  });

  // Flight: hold Space in the air while suited. The power runs down while flying and comes back on the ground.
  addEventListener('keydown',e=>{if(e.code==='Space')spaceHeld=true;});
  addEventListener('keyup',e=>{if(e.code==='Space')spaceHeld=false;});
  addEventListener('blur',()=>{spaceHeld=false;});
  const bar=overlay.querySelector('#suit-power');
  host.on('update',(dt)=>{
    const step=typeof dt==='number'&&dt>0&&dt<.25?dt:1/60;
    if(!worn){flying=false;return;}
    const grounded=player.isGrounded??player.onFloor;
    flying=spaceHeld&&!grounded&&power>0&&session.phase==='fighting';
    if(flying){power=Math.max(0,power-DRAIN*step);player.velocity.y=Math.min(RISE_CAP,Math.max(player.velocity.y,0)+THRUST*step);}
    else power=Math.min(MAX_POWER,power+(grounded?REGEN:REGEN*.35)*step);
    bar.style.width=(100*power/MAX_POWER)+'%';
  });

  function putOn(s){
    worn=s;session.health=session.maxHealth;
    if(!originalSpeed)originalSpeed={move:player.moveSpeed,sprint:player.sprintSpeed};
    player.moveSpeed=originalSpeed.move*s.speed;player.sprintSpeed=s.noSprint?player.moveSpeed:originalSpeed.sprint*s.speed;
    if(s.display)lower(s.display,true);
    show('ENT_'+s.holo+'_on',false);if(s.id==='mk3')show('ENT_rotate_iron_on',false);
    overlay.querySelector('#suit-name').textContent=s.name.toUpperCase()+' ARMOR ONLINE';power=MAX_POWER;overlay.style.opacity=1;
    if(!s.given&&data?.weapons?.[s.weapon]){s.given=true;session.giveWeapon(s.weapon);equipView?.();}
    announce(`${s.name} armor`,'SUIT ONLINE',3);beep();
  }
  function takeOff(s,why){
    if(worn!==s)return;
    worn=null;s.readyAt=now()+20;
    if(originalSpeed){player.moveSpeed=originalSpeed.move;player.sprintSpeed=originalSpeed.sprint;}
    if(session.health>session.maxHealth)session.health=session.maxHealth;
    if(s.display)lower(s.display,false);
    show('ENT_'+s.holo+'_on',true);if(s.id==='mk3')show('ENT_rotate_iron_on',true);
    overlay.style.opacity=0;flying=false;
    toast(why??`${s.name} armor is recharging`,3);
  }
  const buy=s=>{
    if(s.owned)return;s.owned=true;setPartVisuals();
    show('ENT_'+s.holo,false);show('ENT_'+s.holo+'_on',true);if(s.id==='mk3')show('ENT_rotate_iron',false);
    if(SUITS.filter(x=>x.id!=='mk16'&&x.owned).length===6){show('ENT_malibu_wall',false);show('ENT_purchase_armors',false);announce('All six armors are yours','THE WALL FALLS AWAY',4);}
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
        if(worn){toast('You can only wear one armor at a time',3);return false;}
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
  host.on('update',()=>{
    if(worn&&(['reviving','gameover'].includes(session.phase)))takeOff(worn,'The armor was lost');
  });
  host.on('reset',()=>{
    carrying.clear();placed.clear();assembled=false;doorOpen=false;scanUntil=0;power=MAX_POWER;anims.length=0;
    for(const [o,y] of baseY){o.position.y=y;o.updateMatrix();o.updateMatrixWorld(true);}show('ENT_malibu_wall',true);show('ENT_purchase_armors',true);show('ENT_mk16_door',true);
    if(worn){worn=null;if(originalSpeed){player.moveSpeed=originalSpeed.move;player.sprintSpeed=originalSpeed.sprint;}overlay.style.opacity=0;}
    for(const s of SUITS){s.owned=false;s.given=false;s.readyAt=0;if(s.display)show('ENT_'+s.display,true);show('ENT_'+s.holo,true);show('ENT_'+s.holo+'_on',false);}
    setPartVisuals();
  });
  setPartVisuals();
  for(const s of SUITS)show('ENT_'+s.holo+'_on',false);

  board?.addCollectible({id:'cc-iron-parts',label:'Iron Man armor',value:()=>`${placed.size} / 6 built`,done:()=>assembled,
    parts:()=>PARTS.map(p=>({label:p.label,short:{head:'HD',body:'BD',arml:'LA',armr:'RA',legl:'LL',legr:'RL'}[p.id],state:placed.has(p.id)?'placed':carrying.has(p.id)?'carried':'none'}))});
  board?.addCollectible({id:'cc-armors',label:'Armors',value:()=>`${SUITS.filter(s=>s.owned).length} / ${SUITS.length}${worn?` · wearing ${worn.name}`:''}`,done:()=>SUITS.every(s=>s.owned)});
  return {state:()=>({carrying:[...carrying],placed:[...placed],assembled,worn:worn?.id??null,owned:SUITS.filter(s=>s.owned).map(s=>s.id),maxHealth:session.maxHealth,moveSpeed:player.moveSpeed})};
}

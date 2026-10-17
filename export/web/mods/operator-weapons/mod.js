// Operator weapons (user, 2026-10-16): special weapons like BO3's Ragnarok DG-4 that sit in a slot of their own, next
// to the class action skill and independent of it. One at a time; it has its own meter:
//   - charging: your kills (bullet and melee, as for the class skill) fill it, def.kills of them to full (headshots
//     count 1.5); def.passive (seconds to full) adds a slow fill over time if set
//   - Y (Settings: "Operator weapon") pulls it out once the meter reaches def.minCharge (default full). While it's out
//     your gun is put away, the mouse buttons go to the operator weapon, and the meter is its power: it drains by
//     def.drain per second plus whatever the weapon spends (ctx.drain); empty, it's put away. Y again puts it away
//     early and keeps what's left.
//   - downed, a new game or losing the weapon puts it away.
// Weapons register themselves (window.kino.operator.register(def)); def.activate(ctx) returns a handle:
//   { update(dt), fire(down), aim(down), end() }   fire/aim: the left / right mouse button pressed (true) or released
// The slot is filled by give(id): map pickups and buildables (Der Eisendrache's Ragnarok craftable, later), the cheat
// console (`operator <id>`). Its HUD bubble is #operator-weapon (hud-bo7 puts it at the weapon dial's lower right).
import * as THREE from 'three';
import { binds } from '../../settings.js';
import { setupRagnarok } from './ragnarok.js';

export default async function setup(api){
  const {host,session,view,audio}=api;
  const defs=new Map();
  const st={def:null,charge:0,active:null,power:0};
  const PLAYER_CAUSES=new Set(['bullet','melee']);
  const kino=window.kino;

  function register(def){defs.set(def.id,{minCharge:1,kills:30,drain:0,...def});}
  function give(id,{full=false}={}){
    const def=defs.get(id);if(!def)return false;
    if(st.active)putAway();
    st.def=def;st.charge=full?1:0;hud();
    api.toast?.(`${def.name} · operator weapon`,2.5);return true;
  }
  function take(){if(st.active)putAway();st.def=null;st.charge=0;hud();}
  function ready(){audio.play('buy',.4);api.toast?.(st.def.name+' ready',1.4);el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),900);}
  function addCharge(f){
    if(!st.def||st.active||st.charge>=1)return;
    st.charge=Math.min(1,st.charge+f);if(st.charge>=1)ready();hud();
  }

  // ---- pulling it out and putting it away -------------------------------------------------------------------
  const ctx={api,THREE,
    drain(f){if(st.active)st.power=Math.max(0,st.power-f);},
    get power(){return st.power;},
    end(){putAway();},
  };
  function use(){
    if(!api.getState().active||session.phase==='reviving')return;
    if(st.active){putAway();return;}
    if(!st.def){api.toast?.('No operator weapon',1.2);return;}
    if(st.charge<st.def.minCharge){api.toast?.(`${st.def.name} charging · ${Math.floor(st.charge*100)}%`,1.2);return;}
    if(session.busy||session.pack||host.gunBlocked){return;}   // gunBlocked: something else (the rocket shield) is in hand
    st.power=st.charge;st.active=st.def.activate(ctx)??{};host.gunBlocked=true;padFire=!!view?.input?.fire;padAim=!!view?.input?.ads;   // a button already held doesn't count
    host.emit('operatorWeapon',{id:st.def.id,on:true});hud();
  }
  function putAway(){
    const a=st.active;if(!a)return;
    st.active=null;st.charge=st.power<.01?0:st.power;host.gunBlocked=false;
    try{a.end?.();}catch(e){console.warn('[operator]',e);}
    host.emit('operatorWeapon',{id:st.def?.id,on:false});hud();
  }

  let padFire=false,padAim=false;
  // ---- input: Y, and the mouse buttons while it's out --------------------------------------------------------
  addEventListener('keydown',e=>{if(e.code==='KeyY'&&!e.repeat)use();});   // game-menu re-sends a rebound key as KeyY
  // the gun keys do nothing while it's out (reload, knife, grenade, weapon slots, buy, monkey, swap)
  const BLOCK=new Set(['KeyR','KeyV','KeyG','Digit1','Digit2','Digit3','Digit4','Digit5','KeyX','KeyQ']);
  addEventListener('keydown',e=>{if(st.active&&api.getState().active&&BLOCK.has(e.code))e.stopImmediatePropagation();},true);
  addEventListener('mousedown',e=>{
    if(!st.active||!api.getState().active||(e.button!==0&&e.button!==2))return;
    e.stopImmediatePropagation();(e.button===0?st.active.fire:st.active.aim)?.(true);
  },true);
  addEventListener('mouseup',e=>{if(!st.active||(e.button!==0&&e.button!==2))return;e.stopImmediatePropagation();(e.button===0?st.active.fire:st.active.aim)?.(false);},true);

  host.on('beforeEnemyDamage',e=>{if(e.enemy)e.enemy.lastCause=e.cause;});
  host.on('kill',e=>{
    if(e.remote||!e.enemy||!st.def||st.active||!PLAYER_CAUSES.has(e.enemy.lastCause))return;
    addCharge((e.head?1.5:1)/st.def.kills);
  });
  host.on('update',dt=>{
    if(!dt)return;
    if(st.active){
      if(session.phase==='reviving'||session.health<=0){putAway();return;}
      if(view?.pivot)view.pivot.visible=false;   // the engine shows the gun each frame before mods run
      // touch and controller buttons reach the engine's input, not mouse events: their presses are passed on here
      // (a mouse click never sets them: its capture handler above stops it first)
      const fire=!!view?.input?.fire,aim=!!view?.input?.ads;
      if(fire!==padFire){padFire=fire;st.active.fire?.(fire);}
      if(st.active&&aim!==padAim){padAim=aim;st.active.aim?.(aim);}
      st.power=Math.max(0,st.power-(st.def.drain??0)*dt);
      try{st.active.update?.(dt);}catch(e){console.warn('[operator]',e);}
      if(st.active&&st.power<=0)putAway();
    }else if(st.def?.passive&&st.charge<1)addCharge(dt/st.def.passive);
  });
  host.on('reset',()=>{if(st.active)putAway();st.charge=0;hud();});

  // ---- HUD bubble ---------------------------------------------------------------------------------------------
  const style=document.createElement('style');style.textContent=`
    #operator-weapon{position:relative;width:62px;height:62px;pointer-events:none;color:var(--op,#9aa4ad);--op:#9aa4ad}
    #operator-weapon.free{position:fixed;right:330px;bottom:26px;z-index:3}
    #operator-weapon svg.meter{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
    #operator-weapon .bg{fill:#0d0d0dd9;stroke:#ffffff26;stroke-width:4}
    #operator-weapon .fill{fill:none;stroke:var(--op);stroke-width:4;stroke-linecap:round;transition:stroke-dashoffset .15s}
    #operator-weapon .ic{position:absolute;left:50%;top:50%;width:30px;height:30px;transform:translate(-50%,-50%)}
    #operator-weapon .ic svg{width:100%;height:100%}
    #operator-weapon b{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font:700 14px/1 Arial,sans-serif;color:#eee;text-shadow:0 1px 3px #000}
    #operator-weapon kbd{position:absolute;left:50%;top:-12px;transform:translateX(-50%);font:600 8px/1 Arial,sans-serif;letter-spacing:1px;color:#b5ac98aa}
    #operator-weapon small{position:absolute;left:50%;bottom:-13px;transform:translateX(-50%);white-space:nowrap;font:600 8px/1 Arial,sans-serif;letter-spacing:1px;color:var(--op)}
    #operator-weapon.empty{opacity:.55}#operator-weapon.empty .ic{opacity:.35}
    #operator-weapon.charging .ic{opacity:.2}
    #operator-weapon.ready .bg{fill:#0d0d0de6;stroke:var(--op);filter:drop-shadow(0 0 6px var(--op))}
    #operator-weapon.active .bg{fill:color-mix(in srgb,var(--op) 30%,#0d0d0d)}
    #operator-weapon.flash{animation:op-flash .3s ease-in-out 3}
    @keyframes op-flash{50%{transform:scale(1.15)}}
    body.menu-open #operator-weapon{visibility:hidden}`;
  document.head.append(style);
  const R=27,C=2*Math.PI*R;
  const EMPTY_ICON='M7 12h10M12 7v10';
  const el=document.createElement('div');el.id='operator-weapon';el.className='empty free';
  el.innerHTML=`<svg class="meter" viewBox="0 0 62 62"><circle class="bg" cx="31" cy="31" r="${R}"/><circle class="fill" cx="31" cy="31" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/></svg><span class="ic"></span><b></b><kbd></kbd><small></small>`;
  // classic HUD (touch): next to the class badge in #equip-hud; the BO7 HUD moves it to the dial's lower right
  const place=()=>{if(el.closest('#bo7-right'))return;const cluster=document.getElementById('equip-hud');if(cluster){const cs=document.getElementById('class-skill');if(cs&&cluster.contains(cs))cs.after(el);else cluster.prepend(el);el.classList.remove('free');}else{document.body.append(el);el.classList.add('free');}};
  place();setTimeout(place,700);
  let iconFor=null;
  function hud(){
    const d=st.def,on=!!st.active,k=on?st.power:st.charge;
    el.classList.toggle('empty',!d);el.classList.toggle('active',on);
    el.classList.toggle('ready',!!d&&!on&&st.charge>=d.minCharge);el.classList.toggle('charging',!!d&&!on&&st.charge<d.minCharge);
    el.style.setProperty('--op',d?.color??'#9aa4ad');
    el.querySelector('.fill').setAttribute('stroke-dashoffset',(C*(1-(d?k:0))).toFixed(2));
    if(iconFor!==(d?.id??'')){iconFor=d?.id??'';el.querySelector('.ic').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d?.icon??EMPTY_ICON}"/></svg>`;}
    el.querySelector('b').textContent=d&&!on&&st.charge<d.minCharge?Math.floor(st.charge*100)+'%':'';
    el.querySelector('kbd').textContent=(binds().operator??'KeyY').replace(/^Key/,'');
    el.querySelector('small').textContent=d?(on?Math.ceil(st.power*100)+'% POWER':d.short??d.name.toUpperCase()):'OPERATOR';
  }
  let hudT=0;host.on('update',dt=>{if((hudT-=dt)<=0){hudT=.15;hud();}});
  hud();

  kino.operator={register,give,take,use,putAway,addCharge,defs,
    get current(){return st.def?.id??null;},get charge(){return st.charge;},get active(){return !!st.active;},get power(){return st.power;}};
  setupRagnarok(api,kino.operator);
  kino.cheats?.addCommand?.('operator',{usage:'operator <id|none>',text:'Give an operator weapon, charged: '+[...defs.keys()].join(', '),cheat:true,
    run:([id])=>{if(!id||id==='none'){take();return 'Operator weapon removed';}const m=[...defs.keys()].find(k=>k.startsWith(id.toLowerCase()));if(!m)return 'Unknown: '+[...defs.keys()].join(', ');give(m,{full:true});return defs.get(m).name+' (charged)';}});
}

// Phase 3 class skills (BL3/BL4 style), the parts that aren't the action skill itself:
//   · the class resource (cls.resource): Engineer Uplink, Fortifier Grit, Pilot Combat Data, Gambler Fortune, drawn as a
//     bar beside the skill hex
//   · kill skills (stacks that expire), conditional passives (sidearm, low health, near your fortification, last quarter
//     of the mag, after a skill hit) and triggers (Bombardier, Retaliation, the Grit shockwave)
// mod.js calls onHit for every zombie the action skill damages and asks reloadMul / rateMul / killChargeMul / spendData.
// Player hits are the engine's default causes ('bullet', 'melee'); everything the skills deal has its own cause.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { classOf } from '../weapon-levels/camo.js';

const up=new THREE.Vector3(0,1,0);

export function setupSkills(x){
  const {api,cls,S,A,actionUp,nearAbility,blast}=x;
  const {host,session,data,enemies,audio}=api;
  const full=()=>zombieHealth(session.round,data.rules);
  const pistol=()=>{const w=session.weapon;return !!w&&!session.weaponUnavailable&&classOf(data.weapons,w.id)==='pistol';};

  // ---- the class resource ------------------------------------------------------------------------------------
  const R=cls.resource??null,res={value:0,last:-99};
  const max=()=>!R?0:R.max+(R.id==='uplink'?S()['uplink.max']??0:R.id==='grit'?S()['grit.max']??0:R.id==='fortune'?S()['fortune.max']??0:0);
  function gain(n){if(!R)return;const was=Math.floor(res.value);res.value=Math.min(max(),res.value+n);res.last=session.time;if(Math.floor(res.value)!==was)draw();}
  // Fortune gains scale with Lucky Seven; spend takes some off (Reshuffle, a cards bust)
  const gainF=n=>gain(n*(1+(S()['fortune.gain']??0)));
  function spend(n){if(!R)return;res.value=Math.max(0,res.value-n);draw();}
  function spendAll(){const v=Math.floor(res.value);res.value=0;draw();return v;}
  const v=()=>Math.floor(res.value);

  // ---- kill-skill stacks: expiry times per key ---------------------------------------------------------------------
  const stacks={};
  function addStack(key,dur,cap){const a=stacks[key]??=[];prune(a);if(a.length>=cap)a.shift();a.push(session.time+dur);}
  const prune=a=>{for(let i=a.length-1;i>=0;i--)if(a[i]<=session.time)a.splice(i,1);};
  const count=key=>{const a=stacks[key];if(!a)return 0;prune(a);return a.length;};

  // the last zombie you shot (Pack Tactics) and whether it's a player hit
  let focus=null;
  const PLAYER=new Set(['bullet','melee']);
  let sallyUntil=-1,wasNear=false,throttle=0;

  // ---- your hits ------------------------------------------------------------------------------------------------
  host.on('beforeEnemyDamage',e=>{
    const s=S(),z=e.enemy;if(!z)return;
    if(e.cause==='explosion'&&s['demo.shellshock'])z.shellShock=session.time+4;
    if(!PLAYER.has(e.cause))return;
    const melee=e.cause==='melee';
    if(!melee)focus={z,t:session.time};
    let k=0;
    if(R?.id==='uplink'&&!melee)k+=v()*R.per.gun;
    if(R?.id==='fortune'&&!melee)k+=v()*R.per.gun*(1+(s['gamble.fortuneMul']??0));
    if(R?.id==='grit'&&melee)k+=v()*R.per.melee;
    if(!melee){
      if(s['eng.crossfire']&&z.gadgetHit>session.time-2)k+=s['eng.crossfire'];
      if(s['side.fieldKit']&&pistol())k+=s['side.fieldKit'];
      if(s['demo.shellshock']&&z.shellShock>session.time)k+=s['demo.shellshock'];
      if(s['fort.headNear']&&e.head&&nearAbility())k+=s['fort.headNear'];
      if(s['fort.frenzy'])k+=count('frenzy')*s['fort.frenzy'];
      if(s['fort.dugin'])k+=count('dugin')*s['fort.dugin'];
      if(s['fort.sally']&&session.time<sallyUntil)k+=s['fort.sally'];
      if(s['demo.clickclick']){const w=session.weapon,d=session.def;if(w&&d?.clipSize&&w.mag<=d.clipSize*.25){k+=s['demo.clickclick'];
        if(Math.random()<.1){const at=z.root.position.clone().addScaledVector(up,30);setTimeout(()=>blast(at,90,.15),0);}}}
      // Overclocked Uplink: at full Uplink the hit arcs to a nearby zombie
      if(s['uplink.arc']&&R?.id==='uplink'&&v()>=max()){const n=enemies.list.find(o=>o!==z&&o.root.position.distanceTo(z.root.position)<200);
        if(n){const dmg=e.amount*s['uplink.arc'];setTimeout(()=>{if(enemies.list.includes(n)){enemies.hurt(n,dmg,false,false,'arc',false);window.kino.fx?.shock?.(n.root.position.clone().addScaledVector(up,40));}},0);}}
    }
    if(s['side.lastResort']&&pistol()&&session.health<(session.maxHealth??150)*.35)k+=s['side.lastResort'];
    if(s['fort.exposed']&&(z.snareK>0||z.fortWall&&z.state==='attack'||z.snareBleed?.until>session.time))k+=s['fort.exposed'];
    e.amount*=1+k;
    // full Grit: this melee is a shockwave that spends it all
    if(melee&&R?.id==='grit'&&v()>=max()){spendAll();const at=z.root.position.clone().addScaledVector(up,20);setTimeout(()=>blast(at,180,1.2,true),0);api.toast?.('GRIT SHOCKWAVE',1);}
  });

  host.on('kill',e=>{
    if(e.remote)return;const s=S(),z=e.enemy,cause=z?.lastCause;
    if(!PLAYER.has(cause))return;
    const melee=cause==='melee';
    if(melee&&s['fort.frenzy'])addStack('frenzy',6,5);
    if(melee&&s['fort.meleeHeal'])session.health=Math.min(session.maxHealth??150,session.health+s['fort.meleeHeal']);
    if(s['fort.dugin']&&nearAbility())addStack('dugin',1e6,5);
    if(R?.id==='grit'&&nearAbility())gain(1);
    if(R?.id==='data'&&!actionUp())gain(1);
    if(R?.id==='fortune'&&actionUp())gainF(e.head?2:1);   // kills during a Run
  });

  // ---- the action skill's hits (mod.js onHit) ---------------------------------------------------------------------
  function onHit(z,killed){
    const s=S();z.gadgetHit=session.time;
    if(R?.id==='uplink'&&!killed&&session.time>=throttle){throttle=session.time+.12;gain(1);}
    if(!killed)return;
    if(s['eng.afterburner'])addStack('afterburn',5,5);
    if(s['fort.frenzy'])addStack('frenzy',6,5);
    if(R?.id==='grit'&&nearAbility())gain(1);
  }

  // ---- you get hit -------------------------------------------------------------------------------------------------
  host.on('beforeDamage',e=>{
    if(!(e.amount>0))return;
    if(R?.id==='grit'){e.amount*=1-Math.min(.5,v()*R.per.armor);gain(1);}
    const r=S()['fort.retaliate'];
    if(r){const f=api.player.getFeetPosition(),z=enemies.list.filter(z=>z.state==='attack'&&z.root.position.distanceTo(f)<140).sort((a,b)=>a.root.position.distanceTo(f)-b.root.position.distanceTo(f))[0];
      if(z)setTimeout(()=>{if(enemies.list.includes(z)){enemies.hurt(z,full()*r,false,false,'fortify',false);window.kino.fx?.shock?.(z.root.position.clone().addScaledVector(up,40));}},0);}
  });

  // ---- Bombardier: a thrown grenade's burst (engine effect 0xffb347 ×30) calls a shell on the spot -------------------
  host.on('effect',e=>{
    if(!S()['demo.bombardier']||e.color!==0xffb347||e.count!==30)return;
    const at=e.position.clone(),a=A();
    setTimeout(()=>blast(at,a.radius??180,(a.damage??.55)*(a.dmgMul??1),true),550);
  });

  // ---- per frame: decay, Sally Port, Dug In ---------------------------------------------------------------------------
  host.on('update',dt=>{
    if(!dt)return;const s=S();
    if(R?.decayDelay&&res.value>0&&session.time-res.last>R.decayDelay){const was=v();res.value=Math.max(0,res.value-R.decay*dt);if(v()!==was)draw();}
    if(s['fort.sally']||s['fort.dugin']){const near=nearAbility();
      if(wasNear&&!near){if(s['fort.sally'])sallyUntil=session.time+6;stacks.dugin=[];}
      wasNear=near;}
  });
  host.on('reset',()=>{res.value=0;res.last=-99;for(const k in stacks)delete stacks[k];sallyUntil=-1;focus=null;draw();});

  // ---- HUD: a vertical bar on the skill hex's left ---------------------------------------------------------------------
  let bar=null;
  function draw(){
    if(!R)return;const el=document.getElementById('class-skill');if(!el)return;
    if(!bar||!el.contains(bar)){bar=document.createElement('span');bar.className='res';bar.title=R.name;bar.innerHTML='<i></i><em></em>';el.append(bar);}
    const m=max(),n=v();bar.firstChild.style.height=(m?100*n/m:0)+'%';bar.lastChild.textContent=n||'';bar.classList.toggle('full',n>=m&&m>0);
  }
  host.on('warmHud',on=>{draw();if(bar){if(on){bar.firstChild.style.height='100%';bar.lastChild.textContent='9';bar.classList.add('full');}else draw();}});   // warmHud (engine.js): the full bar painted behind the loading screen
  if(R){const st=document.createElement('style');st.textContent=`
    #class-skill .res{position:absolute;left:-11px;top:6px;bottom:6px;width:5px;background:#0009;border:1px solid #ffffff30;display:flex;flex-direction:column;justify-content:flex-end}
    #class-skill .res i{display:block;width:100%;background:${R.color??cls.color};box-shadow:0 0 6px ${R.color??cls.color};transition:height .15s}
    #class-skill .res em{position:absolute;left:50%;top:-13px;transform:translateX(-50%);font:700 9px/1 Arial,sans-serif;font-style:normal;color:${R.color??cls.color};text-shadow:0 1px 2px #000}
    #class-skill .res.full{border-color:${R.color??cls.color}}#class-skill .res.full i{animation:res-pulse .6s ease-in-out infinite alternate}
    @keyframes res-pulse{to{filter:brightness(1.8)}}`;document.head.append(st);setTimeout(draw,600);}

  return {
    onHit,res,gain,gainF,spend,spendAll,count,max,
    get focus(){return focus&&session.time-focus.t<4&&enemies.list.includes(focus.z)?focus.z:null;},
    // reload time multiplier (Uplink, Field Kit)
    reloadMul:()=>1-Math.min(.5,(R?.id==='uplink'?v()*R.per.reload:0)+(pistol()?S()['side.fieldKit']??0:0)),
    // Afterburner: the action skill fires faster
    rateMul:()=>1+count('afterburn')*(S()['eng.afterburner']??0),
    // Ground Crew: your kills on foot charge the mech more (double with a pistol)
    killChargeMul:()=>1+(S()['pilot.groundCrew']??0)*(pistol()?2:1),
    // the mech lands: spend Combat Data → {damage, time}
    spendData:()=>{if(R?.id!=='data')return {damage:0,time:0};const n=spendAll();return {damage:n*R.per.mechDamage,time:n*R.per.mechTime,n};},
  };
}

// Custom zombies maps (mods/maps.json entries with a "dir") as maps of the engine (engine.js):
// CustomWorld builds the world from a GLB plus markers; this module gives the engine its
// interactions (normalised entity kinds: doors, wall buys, perks, power, the box, Pack-a-Punch,
// traps, teleporters, claymores, Easter eggs) and systems (traps, teleporters with return trips,
// shootable eggs, hellhound fog). Moved from the fork's zombies.js.
import { CustomWorld } from '../custom-world.js';
import { KinoFeatures } from '../kino-features.js';
import { loadModel, loadAnimation } from '../animation.js';

// Projectiles, Claymores and Monkey Bombs without Kino's reels and screen.
export class MapFeatures extends KinoFeatures {
  async load(){
    const defs=[...Object.values(this.data.weapons).flatMap(d=>[d,d.upgrade,d.upgrade?.attachment]),...Object.values(this.data.equipment)];
    const urls=new Set(defs.filter(Boolean).flatMap(d=>[d.projectileModel,d.worldModel]).filter(Boolean));
    await Promise.all([...urls].map(async url=>this.models.set(url,await loadModel(url))));
    if(this.data.animations.o_monkey_bomb)this.monkeyAnimation=await loadAnimation(this.data.animations.o_monkey_bomb);
    this.reelModels=new Map();this.screen={visible:false,material:{opacity:0}};this.filmAtlas={offset:{set(){}}};
    this.enemies.lureTarget=z=>this.lureTarget(z);this.reset();
  }
}

export async function createMap(ctx,entry){
  if(!entry?.dir)throw new Error(`"${entry?.id}" is not a custom map`);
  const {THREE,scene,renderer,audio,vector,shop,perkInfo}=ctx;
  if(entry.background)scene.background=new THREE.Color(entry.background);if(entry.exposure)renderer.toneMappingExposure=entry.exposure;
  const baseFog=entry.fog??0;scene.fog=new THREE.FogExp2(scene.background.clone(),baseFog);
  let teleportPending=null,returnTrip=null;
  const S=()=>ctx.session,W=()=>ctx.world;
  const resetPower=()=>{const s=S(),world=W();if(!world.hasPower){s.power=true;s.flags.add('power_on');}ctx.ambient.intensity=s.power?1.7:1.2;world.setPower(s.power);};
  function findEgg(g,item){
    if(item.found||g.done)return false;item.found=true;item.object.visible=false;ctx.effect(item.position,0xd6a94a,12);audio.play('buy');
    const found=g.items.filter(i=>i.found).length;ctx.toast(`${g.name[0].toUpperCase()+g.name.slice(1)} · ${found} / ${g.items.length}`);
    if(found<g.items.length)return true;
    g.done=true;const rewards=[],s=S();
    if(g.points){s.addPoints(+g.points);rewards.push('+'+g.points+' points');}
    if(g.weapon&&ctx.data.weapons[g.weapon]){s.giveWeapon(g.weapon);ctx.equipView();rewards.push(ctx.data.weapons[g.weapon].name);}
    const perk={jugg:'specialty_armorvest',revive:'specialty_quickrevive',speedcola:'specialty_fastreload',doubletap:'specialty_rof'}[g.perk]??g.perk;
    if(perkInfo[perk]&&!s.perks.has(perk)){s.perks.add(perk);s.health=s.maxHealth;rewards.push(perkInfo[perk].name);}
    if(g.reward==='song'||!rewards.length)audio.playMusic('115');
    ctx.announce(g.message??'Secret found','EASTER EGG',5);if(rewards.length)ctx.toast('Reward: '+rewards.join(', '),5);
    ctx.mods.emit('easterEgg',{name:g.name});return true;
  }
  return {
    title:entry.title,
    async loadData(){const base=await fetch('game-data.json').then(r=>r.json());base.entities=[];base.zoneLinks=[];return base;},
    async loadWorld(progress){const world=new CustomWorld(scene,ctx.data,entry);await world.load(progress);return world;},
    spawn:()=>({position:W().spawn.position,yaw:W().spawn.yaw}),
    createFeatures:opts=>new MapFeatures(opts),
    async ready(){resetPower();
      const world=W();if(world.warnings.length){const w=document.createElement('ul');w.id='map-warnings';w.innerHTML='<li>Map warnings:</li>'+world.warnings.map(m=>`<li>${m.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</li>`).join('');document.getElementById('menu-status').after(w);}},
    boardCount:b=>b.boards.length,
    findPrompt(cam){
      const s=S(),world=W(),data=ctx.data;let best=null,distance=110;
      for(const e of world.interactions){
        if(e.kind==='box'&&!ctx.mysteryBox.available(e))continue;
        if(e.kind==='power'&&s.power)continue;
        if(e.kind==='egg'&&world.eggs.get(e.egg).items[e.item].found)continue;
        let d;
        if(e.kind==='door'){const door=world.doors.get(e.door);if(world.isOpen(door,s))continue;d=e.box.distanceToPoint(cam.position)+50;}
        else d=cam.position.distanceTo(e.kind==='box'?vector(e.position):e.position);
        if(d<distance){distance=d;best=e;}
      }
      if(!best)return null;
      const e=best;let text='';
      if(e.kind==='door'){const d=world.doors.get(e.door);text=d.electric?'The power must be activated':'Open door · '+d.cost;}
      if(e.kind==='wallbuy')text=shop.wallPrompt(e.weapon);
      if(e.kind==='perk')text=shop.perkPrompt(e.perk);
      if(e.kind==='power')text='Turn on the power';
      if(e.kind==='egg')text=world.eggs.get(e.egg).items[e.item].found?'':'Inspect';
      if(e.kind==='trap'){const t=world.traps.get(e.trap),label=t.kind==='fire'?'fire':'electric';text=t.power&&!s.power?'The power must be activated':t.activeUntil>s.time?'Trap active':t.readyAt>s.time?'Trap cooling down · '+Math.ceil(t.readyAt-s.time)+'s':'Activate '+label+' trap · '+t.cost;}
      if(e.kind==='teleport'){const tp=world.teleporters[e.teleporter];text=tp.power&&!s.power?'The power must be activated':teleportPending?'Teleporting…':returnTrip?'The teleporter will bring you back':tp.readyAt>s.time?'Teleporter cooling down · '+Math.ceil(tp.readyAt-s.time)+'s':'Teleport'+(tp.cost?' · '+tp.cost:'');}
      if(e.kind==='claymore')text=s.claymoresOwned?'Claymores equipped · 4 to place':'Claymores · 1000';
      if(e.kind==='box')text=shop.boxPrompt(e);
      if(e.kind==='pap')text=shop.packPrompt(true);
      return {target:e,text,distance};
    },
    interact(e){
      const s=S(),world=W();
      if(e.kind==='door'){
        const d=world.doors.get(e.door);if(d.electric){ctx.toast('Turn on the power');return false;}if(!shop.pay(d.cost))return false;
        s.openDoors.add(d.name);world.setDoors(s);ctx.toast(d.zone?'Door opened · '+d.zone:'Door opened');return true;
      }
      if(e.kind==='wallbuy')return shop.buyWall(e.weapon);
      if(e.kind==='perk')return shop.buyPerk(e.perk);
      if(e.kind==='power'){shop.powerOn();world.setPower(true);if(world.powerHandle)world.powerHandle.rotation.x=-1.2;return true;}
      if(e.kind==='egg')return findEgg(world.eggs.get(e.egg),world.eggs.get(e.egg).items[e.item]);
      if(e.kind==='trap'){
        const t=world.traps.get(e.trap);if(t.power&&!s.power){ctx.toast('Turn on the power');return false;}
        if(t.activeUntil>s.time||t.readyAt>s.time){ctx.toast('Trap cooling down');return false;}if(!shop.pay(t.cost))return false;
        t.activeUntil=s.time+t.duration;t.readyAt=s.time+Math.max(t.duration,t.cooldown);for(const h of t.handles??[])if(h)h.rotation.x=-1.2;ctx.toast((t.kind==='fire'?'Fire':'Electric')+' trap active · '+t.duration+'s');return true;
      }
      if(e.kind==='teleport'){
        const tp=world.teleporters[e.teleporter];if(tp.power&&!s.power){ctx.toast('Turn on the power');return false;}
        if(teleportPending||returnTrip||tp.readyAt>s.time)return false;if(tp.cost&&!shop.pay(tp.cost))return false;
        teleportPending={tp,at:s.time+1.6};tp.readyAt=s.time+tp.cooldown;ctx.toast('Teleporting…');audio.play('buy');return true;
      }
      if(e.kind==='claymore'){const ok=s.buyClaymores();if(ok){audio.play('buy');ctx.toast('Claymores · press 4 to place');}else if(!s.claymoresOwned)ctx.toast('Not enough points');return ok;}
      if(e.kind==='box')return shop.useBox(e);
      if(e.kind==='pap')return shop.usePack();
      return false;
    },
    onShot(ray,far){
      for(const g of W().eggs.values())for(const i of g.items){
        if(i.found||!i.shoot)continue;const hit=ray.intersectSphere(new THREE.Sphere(i.position,14),new THREE.Vector3());
        if(hit&&hit.distanceTo(ray.origin)<=far+14)findEgg(g,i);
      }
    },
    update(dt){
      const s=S(),world=W(),feet=ctx.player.getFeetPosition();
      for(const t of world.traps.values()){
        const on=t.activeUntil>s.time;
        for(const z of t.zones){
          z.mesh.visible=on;z.light.intensity=on?60+Math.random()*120:0;if(!on)continue;
          z.mesh.rotation.y+=dt*3;z.mesh.material.opacity=.16+Math.random()*.16;
          for(const e of [...ctx.enemies.list])if(world.inTrapZone(z,e.root.position.clone().add(new THREE.Vector3(0,30,0))))ctx.enemies.hurt(e,99999,false,false,t.kind==='fire'?'fire':'electric');
          if(world.inTrapZone(z,feet.clone().add(new THREE.Vector3(0,30,0)),-25))ctx.damage(dt*100);
        }
        if(!on)for(const h of t.handles??[])if(h&&t.readyAt<=s.time)h.rotation.x=0;
      }
      for(const tp of world.teleporters){const charging=teleportPending?.tp===tp;tp.glow.material.opacity=charging?.25+Math.sin(s.time*20)*.1:0;tp.ring.material.color.setHex(tp.readyAt>s.time&&!charging?0x5d6a70:0x7fd4ff);}
      if(teleportPending&&s.time>=teleportPending.at){
        const {tp}=teleportPending;teleportPending=null;const to=tp.to;
        ctx.moveTo(to.position,to.yaw);
        if(to.zone&&!s.flags.has('zone:'+to.zone))s.flags.add('zone:'+to.zone);
        if(to.returnAfter>0){returnTrip={at:s.time+to.returnAfter,position:tp.from.position,yaw:tp.from.yaw};ctx.toast('Returning in '+to.returnAfter+' seconds',4);}
        else ctx.toast(tp.name[0].toUpperCase()+tp.name.slice(1),2);
      }
      if(returnTrip&&s.time>=returnTrip.at){const r=returnTrip;returnTrip=null;ctx.moveTo(r.position,r.yaw);}
      // Hellhound rounds roll in a fog, as in the original maps.
      scene.fog.density=THREE.MathUtils.damp(scene.fog.density,s.dogRound&&s.phase==='fighting'?Math.max(baseFog,.0011):baseFog,1.5,dt);
      for(const g of world.eggs.values())for(const i of g.items)if(!i.found)i.object.rotation.y+=dt*.8;
    },
    beforeReset(){},
    reset(){resetPower();teleportPending=null;returnTrip=null;},
    hudEffects:()=>returnTrip?'<span>RETURN IN '+Math.max(0,Math.ceil(returnTrip.at-S().time))+'</span>':'',
    objective:()=>!S().power?'Find the power switch':'',
    state(){
      const s=S(),world=W();if(!world)return {};
      return {doors:[...world.doors.values()].map(d=>({name:d.name,cost:d.cost,zone:d.zone,open:world.isOpen(d,s)})),
        interactions:world.interactions.map(e=>({kind:e.kind,weapon:e.weapon,perk:e.perk,door:e.door,position:Array.isArray(e.position)?e.position:e.position.toArray()})),
        eggs:[...world.eggs.values()].map(g=>({name:g.name,found:g.items.filter(i=>i.found).length,total:g.items.length,done:g.done,items:g.items.map(i=>({position:i.position.toArray(),shoot:i.shoot}))})),warnings:world.warnings,
        traps:[...world.traps.values()].map(t=>({name:t.name,kind:t.kind,cost:t.cost,zones:t.zones.length,active:t.activeUntil>(s?.time??0),readyIn:Math.max(0,t.readyAt-(s?.time??0))})),
        teleporters:world.teleporters.map(t=>({name:t.name,to:t.to.position.toArray(),returnAfter:t.to.returnAfter,readyIn:Math.max(0,t.readyAt-(s?.time??0))})),teleporting:!!teleportPending,returnIn:returnTrip?returnTrip.at-s.time:0};
    },
    debug:{lights:()=>W().powerLights.map(p=>p.light.intensity)},
  };
}

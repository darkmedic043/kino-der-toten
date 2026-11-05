import * as THREE from 'three';
import { loadModel } from './animation.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { poseIdle } from './mods/bo3-weapons/pose.js';
import { objectBox, fitSkinnedBounds } from './skinned-bounds.js';
import { restoreImages } from './texture-memory.js';

const cycleTime=3.9,offerTime=12,LAZY_WAIT_MS=15000;
export class MysteryBox {
  constructor(scene,world,data,session,audio,toast){Object.assign(this,{scene,world,data,session,audio,toast});this.boxes=new Map();this.models={};this.displays=new Map();this.moves=0;this.uses=0;this.lazy=[];}
  async load(){
    // def.lazyWorld (the imported BO3 guns): loaded in the background, not awaited; they join the box pool once loaded
    const all=Object.entries(this.data.weapons),eager=all.filter(([,d])=>!d.lazyWorld);
    await Promise.all(eager.map(async([id,d])=>{this.models[id]=await loadModel(d.worldModel);}));
    for(const [id,d] of all)if(d.lazyWorld)this.lazy.push(loadModel(d.worldModel).then(m=>poseIdle(m,d)).then(async m=>{
      if(this.late){globalThis.kino?.lighting?.tag?.(m);await this.late.renderer.compileAsync(m,this.late.camera,this.scene);}   // past the warm-up: never compiles on a spin
      this.models[id]=m;}).catch(e=>console.warn('[mystery-box]',id,e)));
    if(this.data.equipment?.zombie_cymbal_monkey)this.models.zombie_cymbal_monkey=await loadModel(this.data.equipment.zombie_cymbal_monkey.projectileModel);
    this.models.teddy=await loadModel(this.data.boxTeddy);
    this.world.openBoxes=new Set();
    for(const e of this.world.boxLocations){
      const prefix=e.script_noteworthy,entity=this.data.entities.find(n=>n.targetname===prefix+'_org'),lidEntity=this.data.entities.find(n=>n.targetname===prefix+'_lid');
      const lid=this.world.entities.get(lidEntity?.id);if(!entity||!lid)continue;
      const display=new THREE.Group();display.position.fromArray(entity.position);display.rotation.y=entity.yaw+Math.PI/2;this.scene.add(display);
      const glow=new THREE.Mesh(new THREE.PlaneGeometry(65,22),new THREE.MeshBasicMaterial({color:0xd8eaff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));glow.rotation.x=-Math.PI/2;glow.position.y=12;display.add(glow);
      this.boxes.set(e.id,{id:e.id,entity:e,lid,closed:lid.quaternion.clone(),display,glow,roll:null,opening:0,closing:0,model:null,shown:null});
    }
  }
  available(e){const b=this.boxes.get(e.id);return !!b&&(e.id===this.world.activeBox.id||this.world.fireSale||!!b.roll);}
  at(e){return this.boxes.get(e.id)?.roll;}
  start(e){
    const b=this.boxes.get(e.id);if(!b||b.roll||b.closing)return false;
    const sale=this.session.effects.fire_sale>this.session.time;
    const full=(this.data.boxPool??Object.keys(this.models)).filter(k=>k!=='teddy'&&this.models[k]&&!this.session.inventory.some(w=>w.id===k&&!w.lost)&&!(k==='zombie_cymbal_monkey'&&this.session.monkeysOwned));
    // the player's own box list and rarity weights (fork: progression mod, globalThis.kino.boxList); an empty list falls back to the full pool
    const list=globalThis.kino?.boxList,owned=k=>this.session.inventory.some(w=>w.id===k&&!w.lost)||list?.owned?.(k);
    const mine=list?[...new Set([...full,...(list.extra??[])])].filter(k=>this.models[k]&&list.allowed(k)&&!owned(k)):full;
    const pool=mine.length?mine:full;
    if(!pool.length)return false;
    if(!sale)this.uses++;
    const chance=this.uses<4?0:this.uses<8?.15:!this.moves?1:this.uses<13?.3:.5;
    const teddy=!sale&&this.session.random()<chance;
    const weights=pool.map(k=>list?.weight?.(k)??1);let pick=this.session.random()*weights.reduce((a,b)=>a+b,0),weapon=pool.at(-1);
    for(let i=0;i<pool.length;i++){pick-=weights[i];if(pick<0){weapon=pool[i];break;}}
    const cycle=cycleTime*(window.kino?.boxSpin?.()??1);   // Speedy Roulette
    b.roll={weapon,ready:false,time:this.session.time+cycle,expires:this.session.time+cycle+offerTime,started:this.session.time,speed:cycleTime/cycle,sale,teddy,pool};
    b.opening=0;this.world.openBoxes.add(b.id);this.world.updateBox();this.audio.event('box/open/open_00');this.audio.event('box/music_box/music_box_00',.7);return true;
  }
  take(e){const b=this.boxes.get(e.id);if(!b?.roll?.ready||b.roll.teddy)return null;const weapon=b.roll.weapon;this.close(b);return weapon;}
  // Each weapon's centred display copy is cloned once and reused. Cloning a
  // rigged model on every swap of the spin (up to 20 a second) stalled frames.
  display(id){
    const list=this.displays.get(id)??[];this.displays.set(id,list);
    let group=list.find(g=>!g.parent);if(group)return group;
    const source=this.models[id];if(!source)return null;
    const model=clone(source);
    for(const name of this.data.weapons[id]?.hideTags??[]){const bone=model.getObjectByName(name);if(bone)bone.scale.setScalar(.000001);}
    const center=objectBox(model).getCenter(new THREE.Vector3());model.position.sub(center);   // fast skinned bounds (three's took ~1 s for the box guns)
    // No shadows, and no frustum culling: a rigged model's first cull computes its bounds through every bone (a hitch per
    // new weapon), and the renderer still sorts by bounding sphere, so it gets one here (~1 s saved over the box).
    group=new THREE.Group();group.add(model);group.userData.model=model;list.push(group);
    group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.frustumCulled=false;}});fitSkinnedBounds(group);return group;
  }
  // A display copy of everything this box can show, for the engine's warmShaders (engine.js adds them to its 'later' group:
  // lighting tag, compile, real draw with textures uploaded, behind the loading screen). The older warm() drew only what had
  // loaded when the mods finished, so the imported guns (they load in the background) compiled on the spin: a 3-4 s freeze
  // each on D3D11 (2026-11-02, hitch logs: one program a gun, up to 72 MB of textures). Wait for them here, for a while; one
  // that lands later is compiled before it joins the pool (load()).
  async warmCopies(){
    await Promise.race([Promise.allSettled(this.lazy),new Promise(done=>setTimeout(done,LAZY_WAIT_MS))]);
    const list=globalThis.kino?.boxList,ids=[...new Set([...(this.data.boxPool??Object.keys(this.models)),...(list?.extra??[])])].filter(k=>k!=='teddy'&&this.models[k]&&(!list||list.allowed(k)));
    const groups=[...ids,'teddy'].map(id=>this.display(id)).filter(Boolean);
    await Promise.all(groups.map(g=>restoreImages(g).catch(()=>{})));   // a world model can share an image the viewmodel's upload already freed (black gun)
    return groups;
  }
  setLate(renderer,camera){this.late={renderer,camera};}
  show(b,id){
    if(b.shown===id)return;b.wrapper?.removeFromParent();b.shown=id;
    b.wrapper=this.display(id);b.model=b.wrapper?.userData.model??null;
    if(b.wrapper){b.wrapper.position.set(0,0,0);b.display.add(b.wrapper);}
  }
  close(b){b.roll=null;b.closing=.5;b.wrapper?.removeFromParent();b.wrapper=null;b.model=null;b.shown=null;this.audio.event('box/close/close_00',.8);}
  update(dt){
    const sale=this.session.effects.fire_sale>this.session.time;
    if(this.world.fireSale!==sale){this.world.fireSale=sale;this.world.updateBox();this.audio.fireSale(sale);}
    for(const b of this.boxes.values()){
      if(b.roll){
        const r=b.roll,age=(this.session.time-r.started)*(r.speed??1);b.opening=Math.min(.5,b.opening+dt);
        if(this.session.time>=r.time&&!r.ready){r.ready=true;this.show(b,r.teddy?'teddy':r.weapon);this.toast(r.teddy?'The Mystery Box is moving…':(this.data.weapons[r.weapon]??this.data.equipment[r.weapon]).name+' — press F to take',4);
          if(r.teddy){this.session.points+=950;this.audio.event('box/whoosh/whoosh_00');}}
        if(!r.ready){const step=age<1?Math.floor(age/.05):age<2?20+Math.floor((age-1)/.1):age<3?30+Math.floor((age-2)/.2):35+Math.floor((age-3)/.3);this.show(b,r.pool[step%r.pool.length]);}
        if(b.wrapper){const sink=THREE.MathUtils.clamp((this.session.time-r.time)/offerTime,0,1);b.wrapper.position.y=r.teddy&&r.ready?40+Math.max(0,this.session.time-r.time-1)*80:r.ready?40*(1-sink*sink*(3-2*sink)):Math.min(64,age/3*64);}
        if(r.teddy&&this.session.time>r.time+5){this.close(b);this.moves++;this.uses=0;const choices=this.world.boxLocations.filter(e=>e.id!==this.world.activeBox.id);this.world.activeBox=choices[Math.floor(this.session.random()*choices.length)];this.world.updateBox();this.toast('The Mystery Box has moved');}
        else if(this.session.time>r.expires)this.close(b);
      }
      if(b.closing){b.closing=Math.max(0,b.closing-dt);b.opening=b.closing;if(!b.closing){this.world.openBoxes.delete(b.id);this.world.updateBox();}}
      const t=b.opening/.5,angle=t*t*(3-2*t)*105*Math.PI/180;
      b.lid.quaternion.copy(b.closed).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle));b.glow.material.opacity=t*.2;
    }
  }
  reset(){for(const b of this.boxes.values()){b.roll=null;b.opening=b.closing=0;b.wrapper?.removeFromParent();b.wrapper=null;b.model=null;b.shown=null;b.lid.quaternion.copy(b.closed);b.glow.material.opacity=0;}this.moves=this.uses=0;this.world.openBoxes.clear();this.world.fireSale=false;this.world.updateBox();this.audio.fireSale(false);}
  snapshot(){return [...this.boxes.values()].map(b=>({id:b.id,open:b.opening/.5,shown:b.shown,roll:b.roll?{weapon:b.roll.weapon,ready:b.roll.ready,teddy:b.roll.teddy,time:b.roll.time,expires:b.roll.expires}:null}));}
}

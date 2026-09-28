// Local mod support (not part of upstream). See mods/README.md.
//
// mods/mods.json lists enabled mod folders in load order. Each folder has a
// mod.json manifest that may name a data patch (merged into game-data.json
// before the game builds anything) and a script (an ES module whose default
// export receives the ModHost API once the game has loaded).

const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

// Objects merge recursively, arrays and scalars replace, null deletes a key.
// An array target patched with {add:[...],remove:[...]} is edited in place.
export function mergePatch(target,patch){
  if(Array.isArray(target)&&isObject(patch)&&('add' in patch||'remove' in patch)){
    const removed=new Set(patch.remove??[]);
    return [...target.filter(v=>!removed.has(v)),...(patch.add??[]).filter(v=>!target.includes(v)||removed.has(v))];
  }
  if(!isObject(target)||!isObject(patch))return structuredClone(patch);
  const out={...target};
  for(const [key,value] of Object.entries(patch)){
    if(value===null)delete out[key];
    else out[key]=key in out?mergePatch(out[key],value):structuredClone(value);
  }
  return out;
}

// A weapon with "extends":"<id>" starts as a copy of that weapon (models,
// animations, sounds, upgrade) and overrides only the fields it lists.
export function resolveWeapons(data){
  const weapons=data.weapons,resolving=new Set();
  const resolve=id=>{
    const w=weapons[id];if(!w?.extends)return w;
    if(resolving.has(id))throw new Error(`weapon ${id}: circular "extends"`);
    resolving.add(id);
    const base=resolve(w.extends);if(!base)throw new Error(`weapon ${id}: unknown base weapon "${w.extends}"`);
    const {extends:_,...own}=w;weapons[id]={...mergePatch(base,own),id,baseId:base.baseId??base.id};
    resolving.delete(id);return weapons[id];
  };
  for(const id of Object.keys(weapons))resolve(id);
  return data;
}

export class ModHost {
  // camera / hideViewmodel let a mod take over rendering (e.g. third person).
  constructor(base='mods/'){this.base=new URL(base,document.baseURI);this.mods=[];this.handlers=new Map();this.errors=[];this.camera=null;this.hideViewmodel=false;}
  on(event,fn){if(!this.handlers.has(event))this.handlers.set(event,[]);this.handlers.get(event).push(fn);return()=>this.off(event,fn);}
  off(event,fn){const list=this.handlers.get(event);if(list)list.splice(list.indexOf(fn)>>>0,1);}
  emit(event,...args){
    for(const fn of this.handlers.get(event)??[]){try{fn(...args);}catch(error){this.report(`${event} handler`,error);}}
  }
  report(where,error){console.error(`[mods] ${where}:`,error);this.errors.push(`${where}: ${error?.message??error}`);}
  async fetchJson(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url.pathname??url} HTTP ${r.status}`);return r.json();}

  // Reads the manifests and returns game data with every data patch applied.
  async load(data){
    let list;
    try{list=(await this.fetchJson(new URL('mods.json',this.base))).enabled??[];}
    catch(error){this.report('mods.json',error);return data;}
    for(const id of list){
      const url=new URL(id+'/',this.base);
      try{
        const manifest=await this.fetchJson(new URL('mod.json',url));
        const mod={id,url,manifest,name:manifest.name??id};
        for(const file of [manifest.data??[]].flat())data=mergePatch(data,await this.fetchJson(new URL(file,url)));
        // A script may export prepare(data) to adjust data before the game builds anything.
        if(manifest.script){mod.module=await import(new URL(manifest.script,url).href);if(mod.module.prepare)data=(await mod.module.prepare(data,mod))??data;}
        this.mods.push(mod);
      }catch(error){this.report(`mod ${id}`,error);}
    }
    try{resolveWeapons(data);}catch(error){this.report('weapons',error);}
    if(data.boxPool)data.boxPool=data.boxPool.filter(id=>data.weapons[id]||data.equipment?.[id]);
    return data;
  }

  // Wraps game objects so mods can observe them, then runs each mod script.
  async start(api){
    this.api=api;const {session,enemies}=api,host=this;
    let lastHit=null;
    wrap(session,'scoreHit',(original,killed,head,melee)=>{if(killed)lastHit={head:!!head,melee:!!melee};return original(killed,head,melee);});
    wrap(enemies,'onKill',(original,z,...rest)=>{const result=original(z,...rest);if(z){host.emit('kill',{enemy:z,kind:z.kind,head:lastHit?.head??false,melee:lastHit?.melee??false});lastHit=null;}return result;});
    wrap(session,'nextRound',(original)=>{const finished=session.round;const result=original();host.emit('roundEnd',{round:finished});return result;});
    wrap(session,'reset',(original)=>{const result=original();host.emit('reset');return result;});
    wrap(session,'damage',(original,n)=>{
      const event={amount:n};host.emit('beforeDamage',event);
      const before=session.phase,result=original(event.amount);
      if(session.phase==='gameover'&&before!=='gameover')host.emit('gameOver',{round:session.round,kills:session.kills});
      return result;
    });
    wrap(session,'addPoints',(original,n)=>{const event={amount:n};host.emit('beforePoints',event);return original(event.amount);});
    wrap(enemies,'hurt',(original,z,damage,head,melee,cause,score)=>{
      const event={enemy:z,amount:damage,head,melee,cause:cause??(melee?'melee':'bullet')};host.emit('beforeEnemyDamage',event);
      return original(z,event.amount,head,melee,cause,score);
    });
    for(const mod of this.mods){
      if(!mod.manifest.script)continue;
      try{
        const module=mod.module??await import(new URL(mod.manifest.script,mod.url).href);
        await module.default?.({...api,mod,host,on:this.on.bind(this),emit:this.emit.bind(this)});
      }catch(error){this.report(`mod ${mod.id} script`,error);}
    }
    this.emit('ready');
  }
}

function wrap(object,name,fn){
  const original=object[name]?.bind(object);if(!original)return;
  object[name]=(...args)=>fn(original,...args);
}

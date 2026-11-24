// Black Ops 7 guns from the user's own rips (.tools/build_bo7_rips.py; docs/fork/bo7-rips.md). The build writes
// weapons.json (defs + sound lists); everything it points at is git-ignored. This adds the guns to the Mystery Box
// and plays their own sounds: a layered shot per trigger pull, reload foley on the clips' AudioOneShot@ markers.
import {loadModel} from '../../animation.js';
import {PRESTIGE_OWN} from '../weapon-levels/camo.js';
const BASE=new URL('./',import.meta.url).href;
let built=null;
const VIEW_FOV=64,VIEW_OFFSET={};   // hip framing at that FOV, per weapon class (right, up, z: negative = forward), [0,0,0] if not listed

export async function prepare(data){
  const r=await fetch(BASE+'weapons.json').catch(()=>null);
  if(!r?.ok){console.info('[bo7-rips] not built: run .tools/build_bo7_rips.py');return;}
  built=await r.json();
  // lazyLoad: hd-weapons' load-time preload skips them (44 view models ran a page out of memory, 2026-11-24)
  // ownSprint: their own walk_to_sprint / sprint_loop / sprint_to_walk clips play instead of the motion layer's pose (animation.js, fp.js);
  // not on an akimbo pair (bo7_<g>_dw, folded into the gun's Akimbo attachment): BO7 has no akimbo sprint clips
  // viewFov: these rigs are framed for IW's viewmodel field of view (FOV 80 on 4:3 = about 64° vertical), not BO1's 51°;
  // drawn at 51° and pushed forward to fit, the cut ends of the sleeves showed (2026-11-24)
  for(const d of Object.values(built.weapons)){d.lazyLoad=true;d.ownSprint=!d.dualWield;d.viewFov??=VIEW_FOV;d.viewOffset=VIEW_OFFSET[d.weaponClass]??[0,0,0];}
  Object.assign(data.weapons,built.weapons);
  // their own prestige camos (P1, P2, the animated Master) instead of the generated ones (.tools/build_bo7_prestige.py)
  const pr=await fetch(BASE+'prestige.json').then(r=>r.ok?r.json():null).catch(()=>null);
  if(pr)for(const [id,e] of Object.entries(pr))if(built.weapons[id])PRESTIGE_OWN[id]=e;
  data.boxPool=[...new Set([...(data.boxPool??[]),...Object.keys(built.weapons)])];
}

export default async function setup(api){
  if(!built)return;
  const {session,audio,view,host,data,renderer,mysteryBox}=api;
  const ours=id=>!!built.weapons[id];
  // the viewmodel camera takes the held gun's viewFov (51° = the engine's own, BO1's); perk bottles and shields keep 51°
  const vc=api.viewCamera,baseFov=vc?.fov??51;
  host.on('update',()=>{if(!vc)return;const busy=api.perkDrink?.current||window.kino?.operator?.handle?.view||window.kino?.rocketShield?.view||window.kino?.knuckles?.active;
    const f=(!busy&&view?.def?.viewFov)||baseFov;if(vc.fov!==f){vc.fov=f;vc.updateProjectionMatrix();}});

  // Memory (docs/fork/bo7-rips.md, Loading): every gun in the box would load its viewmodel (~28 MB each) in the engine's
  // weapon warm-up. One BO7 gun warms the shared shader programs; the others load when the box rolls them (prefetch(),
  // during the spin) or when given. Guns already held stay in the warm-up.
  host.on('warmWeapons',ids=>{
    const held=new Set((session.inventory??[]).map(w=>w.id));let rep=null;
    for(const id of [...ids])if(ours(id)&&!held.has(id)){rep??=id;ids.delete(id);}
    if(rep&&![...ids].some(ours))ids.add(rep);
  });
  const fetched=new Set();
  function prefetch(id){
    const def=data.weapons[id];if(!ours(id)||!def?.model||fetched.has(id))return;fetched.add(id);
    const urls=[def.model];
    for(const a of globalThis.kino?.weaponLevels?.profile?.attachments?.[id]??[])if(def.mounts?.[a]?.model)urls.push(def.mounts[a].model);
    // textures upload one a frame while the box spins, not all on the frame the gun is taken
    Promise.all(urls.map(u=>loadModel(u).catch(()=>null))).then(models=>{
      const tex=new Set();for(const m of models)m?.traverse(o=>{for(const mat of [o.material??[]].flat())for(const v of Object.values(mat))if(v?.isTexture)tex.add(v);});
      const list=[...tex],step=()=>{const t=list.shift();if(!t)return;try{renderer?.initTexture?.(t);}catch{}requestAnimationFrame(step);};step();
    });
  }
  if(mysteryBox?.start){const start=mysteryBox.start.bind(mysteryBox);
    mysteryBox.start=(e,...rest)=>{const ok=start(e,...rest);if(ok){const r=mysteryBox.at(e);if(r&&!r.teddy)prefetch(r.weapon);}return ok;};}
  const S=built.sounds??{},buffers=new Map();
  const own=def=>S[def?.baseId??def?.id];
  const buffer=url=>{const ctx=audio.ctx;if(!ctx)return null;
    if(!buffers.has(url))buffers.set(url,fetch(new URL(url,document.baseURI)).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null));return buffers.get(url);};
  async function play(url,gain=1,rate=1){
    const ctx=audio.ctx,out=audio.master;if(!ctx||!out)return null;const b=await buffer(url);if(!b)return null;
    const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=b;src.playbackRate.value=rate;g.gain.value=gain;src.connect(g).connect(out);src.start();return {src,g};
  }
  const pick=list=>list[Math.floor(Math.random()*list.length)];
  // decode while loading, not at the first shot
  for(const s of Object.values(S))for(const u of [...s.shots,...s.last])buffer(u);

  let prev=null,token=0;
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    const s=own(def);
    if(kind==='shot'&&s?.shots?.length){
      const last=(session.weapon?.mag??1)<=0&&s.last.length,ctx=audio.ctx;
      // full auto: fade the previous shot's tail so the layers don't stack up loud
      if(prev&&ctx){const g=prev.g.gain;g.cancelScheduledValues(ctx.currentTime);g.setValueAtTime(g.value,ctx.currentTime);g.linearRampToValueAtTime(0,ctx.currentTime+.1);prev.src.stop(ctx.currentTime+.11);prev=null;}
      const t=++token;play(pick(last?s.last:s.shots),.8*(.9+Math.random()*.15),.97+Math.random()*.06).then(h=>{if(h&&!last&&t===token)prev=h;});
      return;}
    return weaponSound(kind,def,...rest);
  };
  const onSound=view.onSound?.bind(view);
  view.onSound=(name,def,...rest)=>{
    const s=own(def);
    if(s){const l=s.notes?.[name];if(l?.length)play(pick(l),.8);return;}   // our markers only: 'end' etc. must not reach the engine's lookup
    return onSound?.(name,def,...rest);};
}

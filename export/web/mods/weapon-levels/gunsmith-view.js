// Full-screen Gunsmith in the style of recent Black Ops games: the gun large
// in the middle (drag to rotate), attachment slots down the left with leader
// lines to the exact part of the gun each one edits, the options for the
// selected slot on the right with pros/cons and live stat deltas. Selecting a
// slot zooms the camera onto that part and pulses it; hovering an option
// previews it on the model. Used by the main menu and the in-game pause menu.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { applyGlow, tickGlow } from '../bo3-weapons/glow.js';
import { mountParts } from './mounts.js';
import { loadCamos, camoTexture, applyCamo, camoUnlocked, camoProgress, equippedCamo, classProgress } from './camo.js';
import { available, equipped, unlockedAttachments, weaponProgress, xpToNext, maxLevel, toggle, previewDef } from './gunsmith.js';

const SLOT_ORDER=['optic','muzzle','mag','under'];
const ANCHORS={optic:['tag_scope_rail','tag_flatrail','tag_iron_sights','tag_iron_sight','tag_elbit','tag_aimpoint','tag_scope_colt'],
  muzzle:['tag_suppressor','tag_silencer','tag_flash'],mag:['tag_clip','tag_ext_clip','tag_extended_clip'],
  under:['tag_foregrip','tag_grenade_launcher','tag_m203','tag_flame_unit','tag_masterkey','tag_grip']};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const CSS=`
#gsv{position:fixed;inset:0;z-index:50;color:#e9e4d8;font:13px/1.35 system-ui,'Segoe UI',sans-serif;user-select:none;
  background:radial-gradient(ellipse at 55% 45%,#1b1f24 0%,#0b0d10 55%,#050607 100%)}
#gsv::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.35;
  background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:48px 48px}
#gsv canvas.stage{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
#gsv canvas.stage:active{cursor:grabbing}
#gsv svg.lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#gsv .top{position:absolute;left:40px;right:40px;top:28px;display:flex;align-items:flex-end;gap:24px}
#gsv .crumb{font-size:10px;letter-spacing:4px;color:#f3a33a}
#gsv h1{margin:2px 0 0;font:900 44px/1 Impact,'Arial Narrow',sans-serif;letter-spacing:.5px;text-transform:uppercase}
#gsv .switch{display:flex;gap:6px;margin-bottom:6px}
#gsv button{font:inherit;color:inherit;cursor:pointer}
#gsv .switch button{width:30px;height:30px;border:1px solid #ffffff30;background:#00000055}
#gsv .switch button:hover{border-color:#f3a33a}
#gsv .lvl{margin-left:auto;min-width:260px;text-align:right}
#gsv .lvl b{font-size:12px;letter-spacing:3px}
#gsv .lvl .bar{height:4px;background:#ffffff18;margin-top:6px}#gsv .lvl .bar i{display:block;height:100%;background:#f3a33a}
#gsv .lvl small{display:block;color:#a09a8d;margin-top:4px;font-size:11px}
#gsv .slots{position:absolute;left:40px;top:130px;width:250px;display:flex;flex-direction:column;gap:8px}
#gsv .slots h3,#gsv .opts h3,#gsv .stats h3{margin:0 0 6px;font-size:10px;letter-spacing:4px;color:#a09a8d;font-weight:600}
#gsv .slot{position:relative;display:grid;grid-template-columns:34px 1fr;align-items:center;gap:10px;padding:10px 12px;text-align:left;
  border:1px solid #ffffff1c;background:linear-gradient(90deg,#0b0d10f2,#0b0d10d9);transition:border-color .12s,background .12s}
#gsv .slot:hover{border-color:#ffffff55}
#gsv .slot.sel{border-color:#f3a33a;background:linear-gradient(90deg,#3a2a14f2,#0b0d10e6)}
#gsv .slot .ico{width:34px;height:34px;display:grid;place-items:center;border:1px solid #ffffff30;font-weight:800;font-size:12px;letter-spacing:1px}
#gsv .slot.sel .ico{border-color:#f3a33a;color:#f3a33a}
#gsv .slot span{display:block;font-size:9px;letter-spacing:3px;color:#a09a8d}
#gsv .slot strong{display:block;font-size:14px;margin-top:2px}
#gsv .slot.empty strong{color:#77726a;font-weight:500}
#gsv .slot.na{opacity:.35;cursor:default}
#gsv .marker{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid #e9e4d8;border-radius:50%;pointer-events:none;background:#0b0d10aa}
#gsv .marker.sel{border-color:#f3a33a;box-shadow:0 0 0 0 #f3a33a88;animation:gsvpulse 1.2s infinite}
#gsv .marker i{position:absolute;left:14px;top:-9px;white-space:nowrap;font:600 10px/1 system-ui;letter-spacing:2px;color:#e9e4d8;background:#000000aa;padding:4px 6px;font-style:normal}
#gsv .marker.sel i{color:#f3a33a}
@keyframes gsvpulse{0%{box-shadow:0 0 0 0 #f3a33a99}100%{box-shadow:0 0 0 14px #f3a33a00}}
#gsv .opts{position:absolute;right:40px;top:130px;width:330px;max-height:calc(100vh - 330px);overflow:auto}
#gsv .opts:has(.camo-opt){max-height:calc(100vh - 200px)}
#gsv .opt{display:block;width:100%;text-align:left;margin-bottom:6px;padding:10px 12px;border:1px solid #ffffff1c;background:#0b0d10e6;transition:border-color .12s}
#gsv .opt:hover{border-color:#ffffff66}
#gsv .opt.on{border-color:#f3a33a;background:#f3a33a1c}
#gsv .opt.locked{opacity:.4;cursor:not-allowed}
#gsv .opt strong{font-size:14px}#gsv .opt .tag{float:right;font-size:9px;letter-spacing:2px;color:#f3a33a}
#gsv .opt .pc{margin-top:5px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px 10px}
#gsv .pro{color:#7fd48a}#gsv .con{color:#e46b5a}#gsv .neu{color:#a09a8d}
#gsv .stats{position:absolute;right:40px;bottom:70px;width:330px}
#gsv .swatch{background-size:cover;background-position:center}
#gsv .camo-row{display:flex;gap:10px;align-items:center}#gsv .camo-row .sw{width:44px;height:44px;flex:none;background-size:cover;border:1px solid #ffffff30}
#gsv .camo-row>div{flex:1}#gsv .cbar{height:3px;background:#ffffff14;margin-top:6px}#gsv .cbar b{display:block;height:100%;background:#7fd48a}
#gsv .stat{display:grid;grid-template-columns:86px 1fr 70px;align-items:center;gap:8px;margin:7px 0;font-size:10px;letter-spacing:2px;color:#a09a8d}
#gsv .stat .tr{position:relative;height:5px;background:#ffffff14}
#gsv .stat .tr i{position:absolute;top:0;bottom:0;left:0;background:#d8d2c4}
#gsv .stat .tr u{position:absolute;top:0;bottom:0;text-decoration:none}
#gsv .stat b{font-weight:500;color:#e9e4d8;text-align:right;letter-spacing:0;font-size:12px}
#gsv .foot{position:absolute;left:40px;right:40px;bottom:24px;display:flex;gap:18px;font-size:10px;letter-spacing:2px;color:#8a8478}
#gsv .foot kbd{border:1px solid #ffffff40;padding:2px 6px;margin-right:6px;font:inherit;color:#e9e4d8}
#gsv .back{position:absolute;right:40px;bottom:18px;padding:9px 18px;border:1px solid #ffffff40;background:#00000066;letter-spacing:3px;font-size:11px}
#gsv .back:hover{border-color:#f3a33a;color:#f3a33a}
@media (max-width:1100px){#gsv .opts,#gsv .stats{width:260px}#gsv .slots{width:210px}}
`;

export async function openGunsmith({cat,weapons,profile,id,ids,onChange,onClose,label}){
  if(!document.getElementById('gsv-css')){const st=document.createElement('style');st.id='gsv-css';st.textContent=CSS;document.head.append(st);}
  const cats=await loadCamos().catch(()=>null);
  const list=(ids??Object.keys(weapons)).filter(w=>weapons[w]&&available(cat,weapons[w],w).length);
  if(!list.includes(id))id=list[0];
  const single=list.length<2;
  const root=document.createElement('div');root.id='gsv';
  root.innerHTML=`<canvas class="stage"></canvas><svg class="lines"></svg>
    <div class="top"><div><div class="crumb">LOADOUT  ›  GUNSMITH</div><h1></h1></div>
      <div class="switch"><button data-go="-1" title="Previous weapon">◀</button><button data-go="1" title="Next weapon">▶</button></div>
      <div class="lvl"><b></b><div class="bar"><i></i></div><small></small></div></div>
    <div class="slots"><h3>ATTACHMENTS</h3></div><div class="markers"></div>
    <div class="opts"></div><div class="stats"></div>
    <div class="foot"><span><kbd>DRAG</kbd>ROTATE</span><span><kbd>CLICK</kbd>EQUIP</span><span><kbd>ESC</kbd>BACK</span></div>
    <button class="back">BACK</button>`;
  document.body.append(root);
  const $=s=>root.querySelector(s);
  if(single)$('.switch').style.display='none';

  // ---- 3D stage ------------------------------------------------------------------
  const canvas=$('canvas.stage');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(28,1,.1,2000);
  scene.add(new THREE.HemisphereLight(0xdfe6ee,0x1a1410,1.3));
  const key=new THREE.DirectionalLight(0xfff1dd,2.4);key.position.set(40,60,50);scene.add(key);
  const rim=new THREE.DirectionalLight(0xf3a33a,1.6);rim.position.set(-60,20,-50);scene.add(rim);
  const fill=new THREE.DirectionalLight(0x8fb4ff,.6);fill.position.set(0,-40,60);scene.add(fill);
  const pivot=new THREE.Group();scene.add(pivot);

  let gun=null,glow=null,def=null,slot=null,hover=null,yaw=-.35,pitch=.08,dragging=null,radius=40,alive=true;
  const focus=new THREE.Vector3(),focusGoal=new THREE.Vector3(),center=new THREE.Vector3();let dist=80,distGoal=80;
  const attachmentTags=new Set(Object.values(weapons).flatMap(d=>d?.hideTags??[]));

  function tagsFor(ids){const d=previewDef(cat,def,id,ids);return new Set(d.hideTags??[]);}
  const MAG_TAGS=['tag_ext_clip','tag_extended_clip','tag_clip_extended','tag_dual_clip','tag_double_clip','tag_duel_clip','tag_drum','tag_ammo_expander'];
  function domBone(o){const g=o.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;if(!o.isSkinnedMesh||!si||!sw)return null;
    const i=g.index?g.index.getX(0):0;let best=0,bw=-1;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>bw){bw=w;best=si.getComponent(i,k);}}return o.skeleton.bones[best];}
  function showParts(ids){
    if(!gun)return;const hidden=tagsFor(ids);gun.userData.shown=ids;
    gun.traverse(o=>{if(!o.isBone)return;if(hidden.has(o.name))o.scale.setScalar(1e-6);else if(attachmentTags.has(o.name))o.scale.setScalar(1);});
    // a fitted bigger mag replaces the stock one (tag_clip), as in game
    const stock=new Set(previewDef(cat,def,id,[]).hideTags??[]),bigMag=MAG_TAGS.some(t=>stock.has(t)&&!hidden.has(t)&&gun.getObjectByName(t));
    gun.traverse(o=>{if(o.isSkinnedMesh&&domBone(o)?.name==='tag_clip')o.visible=!bigMag;});
    // imported guns: attachment models mounted on their tags
    if(def?.mounts){const g=gun;mountParts(g,def,previewDef(cat,def,id,ids).mounted??[],()=>gun===g);}
  }
  async function loadGun(){
    def=weapons[id];const token=id;
    const model=await loadModel(def.model);if(!alive||token!==id)return;
    if(gun){pivot.remove(gun);}
    gun=model;glow=def.glow?applyGlow(gun,def.glow,{depthTest:true}):null;   // BO3 mod guns' lights, as in game (before emissive0 is recorded)
    gun=model;gun.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;
      for(const m of [o.material].flat()){const n=m?.name??'';
        if(/reflex_red_dot|scope_pka_crosshair|clan_tag|player_icon/.test(n))o.visible=false;   // aimpoint_red_dot is the Aimpoint body: keep it
        else if(/lens(?!_interior)/.test(n)&&!m.isMeshBasicMaterial){m.transparent=true;m.opacity=.15;m.depthWrite=false;}
        m.userData.emissive0??=m.emissive?.clone();}});
    // centre the gun and turn it so the barrel runs along +X
    pivot.add(gun);gun.position.set(0,0,0);gun.rotation.set(0,0,0);gun.updateMatrixWorld(true);
    showParts(equipped(cat,def,id,profile));if(cats)applyCamo(gun,equippedCamo(cats,profile,id,weapons));gun.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(gun,true),size=box.getSize(new THREE.Vector3());box.getCenter(center);
    const flash=gun.getObjectByName('tag_flash')?.getWorldPosition(new THREE.Vector3());
    const long=size.x>=size.z?'x':'z';
    let turn=long==='x'?0:-Math.PI/2;
    if(flash){const along=long==='x'?flash.x-center.x:flash.z-center.z;if((long==='x'&&along<0)||(long==='z'&&along<0))turn+=Math.PI;}
    gun.rotation.y=turn;gun.updateMatrixWorld(true);
    box.setFromObject(gun,true);box.getCenter(center);gun.position.sub(center);gun.updateMatrixWorld(true);
    radius=box.getSize(new THREE.Vector3()).length()/2;
    dist=distGoal=radius*3.1;focus.set(0,0,0);focusGoal.set(0,0,0);
    // Where each slot's parts actually sit: fit a representative attachment
    // for a moment and measure its geometry (bone origins can be far off; the
    // M16's grenade-launcher bone is back by the grip). Used for empty slots.
    home.clear();const cur=equipped(cat,def,id,profile);
    for(const sl of SLOT_ORDER){
      const opts=available(cat,def,id).filter(a=>a.slot===sl);if(!opts.length)continue;
      const pick=cur.find(a=>opts.some(o=>o.id===a))??opts[0].id;
      showParts([...cur.filter(a=>cat.attachments.find(x=>x.id===a)?.slot!==sl),pick]);gun.updateMatrixWorld(true);
      const c=partCentre(sl);if(c)home.set(sl,gun.worldToLocal(c));
    }
    showParts(cur);
    renderUI();
  }
  // Anchor a slot on its fitted part's actual geometry (bone origins can sit
  // far from the part, e.g. the FAMAS underbarrel bones are by the mag well);
  // cached in gun-local space. Empty slots fall back to bones.
  const centres=new Map(),vv=new THREE.Vector3();
  const visibleChain=o=>{const g=o.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;if(!o.isSkinnedMesh||!si||!sw)return true;
    const i=g.index?g.index.getX(0):0;let best=0,bw=-1;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>bw){bw=w;best=si.getComponent(i,k);}}
    for(let b=o.skeleton.bones[best];b;b=b.parent)if(b.isBone&&b.scale.x<1e-3)return false;return true;};
  function partCentre(s){
    const key=s+'|'+[...(gun.userData.shown??[])].join(',');
    if(centres.has(key)){const c=centres.get(key);return c&&gun.localToWorld(c.clone());}
    const sum=new THREE.Vector3();let n=0;gun.updateMatrixWorld(true);
    gun.traverse(o=>{if(!o.isMesh||!o.visible||partOf(o)!==s||!visibleChain(o))return;
      const g=o.geometry,P=g.attributes.position,I=g.index,count=I?I.count:P.count,step=Math.max(1,Math.floor(count/80));
      for(let k=0;k<count;k+=step){const i=I?I.getX(k):k;vv.fromBufferAttribute(P,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,vv);o.localToWorld(vv);sum.add(vv);n++;}});
    const c=n?gun.worldToLocal(sum.divideScalar(n)):null;centres.set(key,c);return c&&gun.localToWorld(c.clone());
  }
  const home=new Map();
  const anchorOf=s=>{
    if(!gun||!ANCHORS[s])return null;   // the camo row has no part to point at
    const part=partCentre(s);if(part)return part;
    if(home.has(s))return gun.localToWorld(home.get(s).clone());
    const own=available(cat,def,id).filter(a=>a.slot===s).flatMap(a=>a.tags);
    for(const n of [...own,...ANCHORS[s]]){const b=gun.getObjectByName(n);if(b)return b.getWorldPosition(new THREE.Vector3());}
    return null;
  };

  // ---- UI -----------------------------------------------------------------------------
  const slotsOf=()=>SLOT_ORDER.filter(s=>available(cat,def,id).some(a=>a.slot===s));
  const nameOf=a=>cat.attachments.find(x=>x.id===a)?.name;
  function renderUI(){
    if(!def)return;
    const p=weaponProgress(profile,id),cap=maxLevel(cat,def,id),need=xpToNext(cat,p.level);
    $('h1').textContent=def.name;$('.crumb').textContent='LOADOUT  ›  GUNSMITH'+(label?.(id)?'  ·  '+label(id):'');
    $('.lvl b').textContent=`WEAPON LEVEL ${p.level}${p.level>=cap?'  ·  MAX':''}`;
    $('.lvl i').style.width=(p.level>=cap?100:100*p.xp/need).toFixed(1)+'%';
    $('.lvl small').textContent=p.level>=cap?'Every attachment unlocked':`${p.xp} / ${need} XP to the next unlock · earn XP with kills using this gun`;
    const slots=slotsOf();if(slot!=='camo'&&!slots.includes(slot))slot=null;
    const on=equipped(cat,def,id,profile);
    $('.slots').innerHTML='<h3>ATTACHMENTS</h3>'+SLOT_ORDER.map(s=>{
      const has=slots.includes(s),eq=on.find(a=>cat.attachments.find(x=>x.id===a)?.slot===s);
      return `<button class="slot${s===slot?' sel':''}${has?'':' na'}${eq?'':' empty'}" data-slot="${s}">
        <div class="ico">${cat.slots[s].slice(0,2).toUpperCase()}</div><div><span>${esc(cat.slots[s].toUpperCase())}</span><strong>${has?esc(eq?nameOf(eq):'None'):'—'}</strong></div></button>`;}).join('');
    if(cats){const c=equippedCamo(cats,profile,id,weapons),done=camoUnlocked(cats,profile,id,weapons).size;
      $('.slots').insertAdjacentHTML('beforeend',`<h3 style="margin-top:14px">CAMO</h3><button class="slot${slot==='camo'?' sel':''}${c?'':' empty'}" data-slot="camo">
        <div class="ico swatch" style="background-image:url(${c?swatch(c):''})">${c?'':'—'}</div><div><span>CAMO · ${done} / ${cats.camos.length} UNLOCKED</span><strong>${esc(c?.name??'None')}</strong></div></button>`);}
    $('.markers').innerHTML=slots.map(s=>`<div class="marker${s===slot?' sel':''}" data-m="${s}"><i>${esc(cat.slots[s].toUpperCase())}</i></div>`).join('');
    renderOptions();renderStats();
    $('.stats').style.display=slot==='camo'?'none':'';   // camos don't change stats; the list needs the room
  }
  const swatchCache=new Map();
  function swatch(c){if(swatchCache.has(c.id))return swatchCache.get(c.id);const img=camoTexture(c).image;let url='';
    try{if(img instanceof HTMLCanvasElement)url=img.toDataURL('image/jpeg',.7);else if(img?.src)url=img.src;}catch{}swatchCache.set(c.id,url);return url;}
  function renderCamos(el){
    const done=camoUnlocked(cats,profile,id,weapons),p=camoProgress(profile,id),on=equippedCamo(cats,profile,id,weapons)?.id,base=cats.camos.filter(c=>!c.mastery&&!c.classMastery),cp=classProgress(cats,profile,id,weapons);
    el.innerHTML='<h3>CAMO</h3>'+`<button class="opt${on?'':' on'}" data-camo=""><strong>None</strong><div class="pc"><span class="neu">Factory finish</span></div></button>`+
      cats.camos.filter(c=>!c.classMastery||cp).map(c=>{const locked=!done.has(c.id);
        const have=c.classMastery?cp.done:c.mastery?base.filter(b=>done.has(b.id)).length:Math.min(c.count,p[c.challenge]??0),need=c.classMastery?cp.total:c.mastery?base.length:c.count;
        const what=c.classMastery?`Gold on every ${cp.label.toLowerCase().replace(/s$/,'')}`:c.mastery?'Complete every challenge camo':cats.challenges[c.challenge];
        return `<button class="opt camo-opt${on===c.id?' on':''}${locked?' locked':''}" data-camo="${c.id}"><span class="tag">${on===c.id?'EQUIPPED':locked?'LOCKED':''}</span>
          <div class="camo-row"><i class="sw" style="background-image:url(${swatch(c)})"></i><div><strong>${esc(c.name)}</strong>
          <div class="pc"><span class="${locked?'neu':'pro'}">${esc(what)} · ${have} / ${need}</span></div>
          <div class="cbar"><b style="width:${(100*have/need).toFixed(1)}%"></b></div></div></div></button>`;}).join('');
  }
  function renderOptions(){
    const el=$('.opts');
    if(slot==='camo'&&cats){renderCamos(el);return;}
    if(!slot){el.innerHTML='<h3>SELECT A SLOT</h3><p class="neu">Pick an attachment slot on the left; the camera moves to that part of the gun.</p>';return;}
    const all=available(cat,def,id),unlocked=new Set(unlockedAttachments(cat,def,id,profile).map(a=>a.id)),on=new Set(equipped(cat,def,id,profile));
    const opts=all.filter(a=>a.slot===slot);
    el.innerHTML=`<h3>${esc(cat.slots[slot].toUpperCase())}</h3>`+
      `<button class="opt${opts.some(a=>on.has(a.id))?'':' on'}" data-att=""><strong>None</strong><div class="pc"><span class="neu">Stock ${esc(cat.slots[slot].toLowerCase())}</span></div></button>`+
      opts.map(a=>{const lv=all.indexOf(a)+2,locked=!unlocked.has(a.id);
        return `<button class="opt${on.has(a.id)?' on':''}${locked?' locked':''}" data-att="${a.id}"><span class="tag">${on.has(a.id)?'EQUIPPED':locked?'WEAPON LV '+lv:''}</span>
          <strong>${esc(a.name)}</strong><div class="pc">${prosCons(a)}</div></button>`;}).join('');
  }
  function prosCons(a){
    const s=a.stats??{},out=[];
    if(s.damageMul)out.push(['con',`Damage ${Math.round((s.damageMul-1)*100)}%`]);
    if(s.rangeMul)out.push(['con',`Range ${Math.round((s.rangeMul-1)*100)}%`]);
    if(s.suppressed)out.push(['pro','Quiet shots']);
    if(s.clipMul)out.push(['pro',`Magazine +${Math.round((s.clipMul-1)*100)}%`]);
    if(s.reloadMul)out.push([s.reloadMul<1?'pro':'con',`Reload ${s.reloadMul<1?'−':'+'}${Math.round(Math.abs(1-s.reloadMul)*100)}%`]);
    if(s.adsFov||s.adsFovMul)out.push(['pro','Zoom +']);
    if(s.headMul)out.push(['pro',`Headshots +${Math.round((s.headMul-1)*100)}%`]);
    if(s.hipSpreadMul)out.push(['pro',`Hip spread −${Math.round((1-s.hipSpreadMul)*100)}%`]);
    if(a.underbarrel)out.push(['neu','Press 5 to switch']);
    if(!out.length)out.push(['neu',a.desc??'']);
    return out.map(([k,t])=>`<span class="${k}">${k==='pro'?'▲ ':k==='con'?'▼ ':''}${esc(t)}</span>`).join('');
  }
  const STATS=[['DAMAGE',d=>d.damage,300,v=>Math.round(v)],['RANGE',d=>d.range,4000,v=>Math.round(v)],['MAGAZINE',d=>d.clipSize,100,v=>Math.round(v)],
    ['RELOAD',d=>1/Math.max(.3,d.reloadTime??1),1/.8,(v,d)=>(d.reloadTime??0).toFixed(2)+'s'],['ZOOM',d=>80-(d.adsFov??60),70,(v,d)=>((80-(d.adsFov??60))/30+1).toFixed(1)+'×'],
    ['HEADSHOT',d=>d.headMultiplier??1,6,v=>'×'+(+v).toFixed(2)]];
  function renderStats(){
    const cur=equipped(cat,def,id,profile);
    let next=cur;
    if(hover!==null&&slot){const others=cur.filter(a=>cat.attachments.find(x=>x.id===a)?.slot!==slot);next=hover?[...others,hover]:others;}
    const a=previewDef(cat,def,id,cur),b=previewDef(cat,def,id,next);
    $('.stats').innerHTML='<h3>STATS'+(next!==cur?' · PREVIEW':'')+'</h3>'+STATS.map(([label,f,max,fmt])=>{
      const va=Math.max(0,Math.min(1,f(a)/max)),vb=Math.max(0,Math.min(1,f(b)/max)),lo=Math.min(va,vb),hi=Math.max(va,vb),up=vb>va+1e-4,down=vb<va-1e-4;
      return `<div class="stat"><span>${label}</span><span class="tr"><i style="width:${(lo*100).toFixed(1)}%"></i>${up||down?`<u style="left:${(lo*100).toFixed(1)}%;width:${((hi-lo)*100).toFixed(1)}%;background:${up?'#7fd48a':'#e46b5a'}"></u>`:''}</span><b class="${up?'pro':down?'con':''}">${fmt(f(b),b)}</b></div>`;}).join('');
  }

  // ---- interaction ------------------------------------------------------------------------
  // keep clicks here from reaching the game behind (the pause menu resumes on click)
  for(const ev of ['click','mousedown','mouseup','pointerdown'])root.addEventListener(ev,e=>e.stopPropagation());
  root.addEventListener('click',e=>{
    const s=e.target.closest('.slot');if(s&&!s.classList.contains('na')){slot=slot===s.dataset.slot?null:s.dataset.slot;hover=null;renderUI();aim();return;}
    const o=e.target.closest('.opt');
    if(o&&o.dataset.camo!==undefined&&!o.classList.contains('locked')){
      profile.camo??={};const ent=profile.camo[id]??={p:{}};if(o.dataset.camo)ent.on=o.dataset.camo;else delete ent.on;
      hover=null;onChange?.(id);applyCamo(gun,equippedCamo(cats,profile,id,weapons));renderUI();return;}
    if(o&&!o.classList.contains('locked')){
      const att=o.dataset.att,cur=equipped(cat,def,id,profile),inSlot=cur.find(a=>cat.attachments.find(x=>x.id===a)?.slot===slot);
      if(att&&att!==inSlot)toggle(cat,def,id,profile,att);else if(!att&&inSlot)toggle(cat,def,id,profile,inSlot);
      hover=null;onChange?.(id);showParts(equipped(cat,def,id,profile));renderUI();return;}
    const go=e.target.closest('[data-go]');
    if(go){const i=(list.indexOf(id)+(+go.dataset.go)+list.length)%list.length;id=list[i];slot=null;hover=null;loadGun();return;}
    if(e.target.closest('.back'))close();
  });
  root.addEventListener('mouseover',e=>{
    const o=e.target.closest('.opt');
    if(slot==='camo'&&cats){const cid=o&&!o.classList.contains('locked')?o.dataset.camo:undefined;
      applyCamo(gun,cid===undefined?equippedCamo(cats,profile,id,weapons):cats.camos.find(c=>c.id===cid)??null);return;}
    const h=o&&!o.classList.contains('locked')?o.dataset.att:null;
    if(h!==hover){hover=h;
      const cur=equipped(cat,def,id,profile);
      if(hover!==null&&slot){const others=cur.filter(a=>cat.attachments.find(x=>x.id===a)?.slot!==slot);showParts(hover?[...others,hover]:others);}
      else showParts(cur);
      renderStats();}
  });
  canvas.addEventListener('pointerdown',e=>{dragging={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-dragging.x)*.008;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-dragging.y)*.005,-.6,.8);dragging={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',()=>{dragging=null;});
  canvas.addEventListener('wheel',e=>{distGoal=THREE.MathUtils.clamp(distGoal*(1+Math.sign(e.deltaY)*.1),radius*1.2,radius*5);e.preventDefault();},{passive:false});
  const onKey=e=>{if(e.code==='Escape'){e.stopPropagation();e.preventDefault();close();}};
  addEventListener('keydown',onKey,true);
  function aim(){
    const p=slot&&anchorOf(slot);
    if(p){focusGoal.copy(p);distGoal=radius*2;}else{focusGoal.set(0,0,0);distGoal=radius*3.1;}
  }

  // ---- frame: camera, leader lines, pulse ---------------------------------------------------
  const svg=$('svg.lines'),v=new THREE.Vector3();let t=0,last=performance.now();
  function frame(now){
    if(!alive)return;requestAnimationFrame(frame);
    const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;
    const w=root.clientWidth,h=root.clientHeight;
    if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
    focus.lerp(focusGoal,1-Math.exp(-dt*6));dist+=(distGoal-dist)*(1-Math.exp(-dt*6));
    if(!dragging&&!slot)yaw+=dt*.12;
    camera.position.set(focus.x+Math.sin(yaw)*Math.cos(pitch)*dist,focus.y+Math.sin(pitch)*dist,focus.z+Math.cos(yaw)*Math.cos(pitch)*dist);
    // keep the gun off-centre toward the free middle of the screen
    camera.lookAt(focus);camera.setViewOffset(w,h,-w*.03,0,w,h);
    // pulse the parts of the selected slot
    if(gun){const pulse=.12+.1*Math.sin(t*5);gun.traverse(o=>{if(!o.isMesh||!o.visible)return;const m=o.material;if(!m?.emissive)return;
      const hot=slot&&partOf(o)===slot;m.emissive.copy(hot?new THREE.Color('#f3a33a').multiplyScalar(pulse):m.userData.emissive0??new THREE.Color(0));});}
    tickGlow(glow,t);
    renderer.render(scene,camera);
    // markers and leader lines from each slot row to its part on the gun
    let paths='';const rootBox=root.getBoundingClientRect();
    for(const m of root.querySelectorAll('.marker')){
      const s=m.dataset.m,p=anchorOf(s);if(!p){m.style.display='none';continue;}
      v.copy(p).project(camera);if(v.z>1){m.style.display='none';continue;}
      const x=(v.x*.5+.5)*w,y=(-v.y*.5+.5)*h;
      // parts that the zoomed camera has left off screen get no marker or line
      if(x<20||x>w-20||y<120||y>h-20){m.style.display='none';continue;}
      m.style.display='';m.style.left=x+'px';m.style.top=y+'px';
      const row=root.querySelector(`.slot[data-slot="${s}"]`);if(!row)continue;
      const r=row.getBoundingClientRect(),sx=r.right-rootBox.left,sy=r.top+r.height/2-rootBox.top,mx=sx+40;
      const sel=s===slot;
      paths+=`<path d="M${sx},${sy} H${mx} L${x-10},${y}" fill="none" stroke="${sel?'#f3a33a':'#ffffff40'}" stroke-width="${sel?1.6:1}" ${sel?'':'stroke-dasharray="3 4"'}/>`;
      paths+=`<circle cx="${sx}" cy="${sy}" r="2.5" fill="${sel?'#f3a33a':'#ffffff60'}"/>`;
    }
    svg.innerHTML=paths;
  }
  // Only tags the gun hides by default are attachment parts (the M16's stock
  // handguard is skinned to tag_heat_guard, which the flamer also lists).
  let tagSlots=null,tagSlotsFor=null;
  function partTags(){
    if(tagSlotsFor===id)return tagSlots;
    const hidden=new Set(previewDef(cat,def,id,[]).hideTags??[]);tagSlots=new Map();tagSlotsFor=id;
    for(const a of available(cat,def,id))for(const t of [...a.tags,...(a.extraTags??[])])if(hidden.has(t)&&!tagSlots.has(t))tagSlots.set(t,a.slot);
    return tagSlots;
  }
  // which slot a mesh belongs to: the dominant bone of its first indexed vertex
  const partCache=new WeakMap();
  function partOf(o){
    if(partCache.has(o))return partCache.get(o);
    let res=null;const g=o.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
    if(o.isSkinnedMesh&&si&&sw){const i=g.index?g.index.getX(0):0;let best=0,bw=-1;for(let k=0;k<4;k++){const wv=sw.getComponent(i,k);if(wv>bw){bw=wv;best=si.getComponent(i,k);}}
      const bone=o.skeleton.bones[best]?.name;
      res=partTags().get(bone)??null;}
    partCache.set(o,res);return res;
  }
  function close(){if(!alive)return;alive=false;
    // materials are shared with the game's copies of this model: put them back
    gun?.traverse(o=>{const m=o.material;if(o.isMesh&&m?.emissive&&m.userData.emissive0)m.emissive.copy(m.userData.emissive0);});removeEventListener('keydown',onKey,true);renderer.dispose();root.remove();onClose?.();}

  requestAnimationFrame(frame);
  await loadGun();
  return {close};
}

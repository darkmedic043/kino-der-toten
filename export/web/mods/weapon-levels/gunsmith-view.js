// Full-screen Gunsmith in the style of recent Black Ops games: the gun large
// in the middle (drag to rotate), attachment slots down the left with leader
// lines to the exact part of the gun each one edits, the options for the
// selected slot on the right with pros/cons and live stat deltas. Selecting a
// slot zooms the camera onto that part and pulses it; hovering an option
// previews it on the model. Used by the main menu and the in-game pause menu.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { applyGlow, tickGlow } from '../bo3-weapons/glow.js';
import { poseIdle } from '../bo3-weapons/pose.js';
import { mountParts } from './mounts.js';
import { loadCamos, camoTexture, applyCamo, camoUnlocked, camoProgress, challengeOf, equippedCamo, classProgress, camoById, camoTime, camoSwatch, fillSwatches } from './camo.js';
import { GLOBAL_CAMO_TABS } from './global-camos.js';
import { loadCharms, loadCharmState, saveCharmState, charmFor, charmLock, charmModel, charmReach, charmUnit, gunAnchor, CharmRig } from '../charms/charms.js';
import { loadStickers, loadStickerState, saveStickerState, stickersFor, stickerLock, stickerImage, applyStickers, stickerFromHit, meshKeys, MAX_STICKERS } from '../stickers/stickers.js';
import { loadPrestige, savePrestige, weaponTier, prestigeCamoId, spendToken, RULES as PRESTIGE, TIER_NAMES } from '../prestige/prestige.js';
import { available, equipped, unlockedAttachments, weaponProgress, xpToNext, maxLevel, toggle, previewDef, unlockLevelOf, nextUnlock } from './gunsmith.js';

const SLOT_ORDER=['optic','muzzle','barrel','mag','under','grip','stock','laser','ammo','akimbo'];
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
#gsv .slots{position:absolute;left:40px;top:130px;bottom:64px;width:250px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;scrollbar-width:thin;padding-right:4px}#gsv .slots .slot{padding:7px 12px;flex:none}#gsv .slots h3{flex:none}
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
#gsv .stk-row{display:grid;grid-template-columns:44px 1fr auto;gap:4px 10px;align-items:center}
#gsv .stk-row img,#gsv .stk-pick img{width:44px;height:44px;object-fit:contain}
#gsv .stk-row .acts button{font:600 9px/1 system-ui,sans-serif;letter-spacing:2px;padding:5px 7px;margin-left:4px;color:#e9e4d8;background:#ffffff10;border:1px solid #ffffff30;cursor:pointer}
#gsv .stk-row label{grid-column:1/-1;display:grid;grid-template-columns:70px 1fr 42px;align-items:center;font-size:10px;letter-spacing:2px;color:#a09a8d}
#gsv .stk-row input[type=range]{width:100%;accent-color:#f3a33a}
#gsv .stk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
#gsv .stk-pick{text-align:center;padding:8px 4px}#gsv .stk-pick strong{display:block;font-size:11px;margin-top:4px}
#gsv .stk-pick,#gsv canvas.stage{touch-action:none}#gsv .stk-flip{width:100%;text-align:left;margin-bottom:8px}#gsv .stk-hid{display:block;font:600 9px/1.4 system-ui,sans-serif;letter-spacing:2px;color:#f3a33a}#gsv .stk-flip strong{font-size:11px;letter-spacing:2px}
#gsv .stk-hint{font-size:11px;color:#f3a33a;margin:2px 0 10px}
#gsv .opt strong{font-size:14px}#gsv .opt .tag{float:right;font-size:9px;letter-spacing:2px;color:#f3a33a}
#gsv .opt .pc{margin-top:5px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px 10px}
#gsv .pro{color:#7fd48a}#gsv .con{color:#e46b5a}#gsv .neu{color:#a09a8d}
#gsv .stats{position:absolute;right:40px;bottom:70px;width:330px}
#gsv .swatch{background-size:cover;background-position:center}
#gsv .ctabs{display:flex;gap:6px;margin:0 0 8px}#gsv .ctab{flex:1;padding:7px 6px;background:#ffffff0d;border:1px solid #ffffff22;color:#cfcab9;font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.14em;cursor:pointer}#gsv .ctab small{display:block;margin-top:3px;font-weight:500;letter-spacing:.06em;color:#8d897c}#gsv .ctab.on{border-color:#d6a94a;color:#f3e3b0;background:#d6a94a1c}#gsv .ctab.on small{color:#d6a94a}
#gsv .cgroups{display:flex;gap:0;margin:0 0 6px;border:1px solid #ffffff22}#gsv .cgroup{flex:1;padding:8px 0;background:none;border:0;color:#9a958a;font:700 11px/1 inherit;letter-spacing:3px;cursor:pointer}#gsv .cgroup.on{background:#f0c06022;color:#f0c060}#gsv .camo-row{display:flex;gap:10px;align-items:center}#gsv .camo-opt.anim .sw{position:relative;overflow:hidden}#gsv .camo-opt.anim .sw::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,var(--a) 45%,var(--b) 55%,transparent 70%);background-size:300% 100%;mix-blend-mode:screen;animation:gsv-pm 2.4s linear infinite}@keyframes gsv-pm{from{background-position:120% 0}to{background-position:-120% 0}}#gsv .tok{display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid #f0c060;color:#f0c060;font-size:10px;letter-spacing:1px;cursor:pointer;pointer-events:auto}#gsv .tok:hover{background:#f0c06022}#gsv .camo-row .sw{width:44px;height:44px;flex:none;background-size:cover;border:1px solid #ffffff30}
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
/* Landscape phones (about 390px tall): the desktop layout stacks its panels on top of each other. */
@media (pointer:coarse) and (max-height:560px){
  #gsv .foot{display:none}
  #gsv .top{left:16px;right:16px;top:10px;gap:12px}
  #gsv h1{font-size:26px}
  #gsv .crumb{font-size:9px;letter-spacing:3px}
  #gsv .lvl{min-width:0;max-width:240px}#gsv .lvl small{display:none}
  #gsv .slots{left:16px;top:70px;bottom:60px;width:200px;gap:5px;overflow-y:auto;overflow-x:hidden}
  #gsv .slot{padding:6px 8px;gap:8px;grid-template-columns:28px 1fr}
  #gsv .slot .ico{width:28px;height:28px;font-size:11px}
  #gsv .slot strong{font-size:12px}
  #gsv .opts,#gsv .opts:has(.camo-opt){right:16px;top:70px;width:250px;max-height:calc(100vh - 140px)}
  #gsv .opt{padding:7px 9px;margin-bottom:4px}
  #gsv .stats{left:236px;right:282px;bottom:56px;width:auto;display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
  #gsv .stats h3{grid-column:1/-1;margin:0 0 2px}
  #gsv .stat{margin:2px 0;padding:3px 8px;min-height:0;grid-template-columns:62px 1fr 48px;font-size:9px;letter-spacing:1px}
  #gsv .back{right:16px;bottom:10px;padding:8px 14px}
}
`;

export async function openGunsmith({cat,weapons,profile,id,ids,onChange,onClose,label}){
  if(!document.getElementById('gsv-css')){const st=document.createElement('style');st.id='gsv-css';st.textContent=CSS;document.head.append(st);}
  const cats=await loadCamos().catch(()=>null);
  const list=(ids??Object.keys(weapons)).filter(w=>weapons[w]&&(weapons[w].gunsmith===true||available(cat,weapons[w],w).length));   // gunsmith:true: camos only
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
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));   // 2× on a high-DPI screen quadrupled the fill cost of heavy BO3 modelsrenderer.outputColorSpace=THREE.SRGBColorSpace;
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
  const MAG_TAGS=['tag_ext_clip','tag_extended_clip','tag_clip_extended','tag_dual_clip','tag_double_clip','tag_duel_clip','tag_drum','tag_ammo_expander','tag_gh_expanse','tag_sr_deflect','tag_sr_overclock','tag_xm_fastbelt','tag_xm_extbelt','tag_xm_leyden','tag_xm_titan'];   // tag_gh_expanse: the Grimhawk's P.T. Expanse; tag_sr_*: the Siren's cells
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
    await poseIdle(model,def);if(!alive||token!==id)return;
    if(gun){pivot.remove(gun);}
    gun=model;glow=def.glow?applyGlow(gun,def.glow,{depthTest:true}):null;   // BO3 mod guns' lights, as in game (before emissive0 is recorded)
    gun=model;gun.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;
      for(const m of [o.material].flat()){const n=m?.name??'';
        if(/reflex_red_dot|scope_pka_crosshair|clan_tag|player_icon/.test(n))o.visible=false;   // aimpoint_red_dot is the Aimpoint body: keep it
        else if(/lens(?!_interior)/.test(n)&&!m.isMeshBasicMaterial){m.transparent=true;m.opacity=.15;m.depthWrite=false;}
        m.userData.emissive0??=m.emissive?.clone();}});
    // centre the gun and turn it so the barrel runs along +X
    pivot.add(gun);gun.position.set(0,0,0);gun.rotation.set(0,0,0);gun.updateMatrixWorld(true);
    showParts(equipped(cat,def,id,profile));if(cats)applyCamo(gun,equippedCamo(cats,profile,id,weapons));stkArm=null;stkShow();gun.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(gun,true),size=box.getSize(new THREE.Vector3());box.getCenter(center);
    const flash=gun.getObjectByName('tag_flash')?.getWorldPosition(new THREE.Vector3());
    const long=size.x>=size.z?'x':'z';
    let turn=long==='x'?0:-Math.PI/2;
    if(flash){const along=long==='x'?flash.x-center.x:flash.z-center.z;if((long==='x'&&along<0)||(long==='z'&&along<0))turn+=Math.PI;}
    gun.rotation.y=turn;gun.updateMatrixWorld(true);charmShown=null;hangCharm();
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
    // the named fallback (a tag or anchor bone), looked up once per gun: BO3 guns land here every frame, and a name search
    // through their hierarchy per slot per frame was most of the Gunsmith's lag on them
    const key=gun.uuid+'|'+s;let b=anchorObj.get(key);
    if(b===undefined){b=null;const own=available(cat,def,id).filter(a=>a.slot===s).flatMap(a=>a.tags);for(const n of [...own,...ANCHORS[s]]){b=gun.getObjectByName(n);if(b)break;}anchorObj.set(key,b??null);}
    return b?b.getWorldPosition(new THREE.Vector3()):null;
  };
  const anchorObj=new Map();

  // ---- UI -----------------------------------------------------------------------------
  const slotsOf=()=>SLOT_ORDER.filter(s=>available(cat,def,id).some(a=>a.slot===s));
  const nameOf=a=>cat.attachments.find(x=>x.id===a)?.name;
  function renderUI(){
    if(!def)return;
    const p=weaponProgress(profile,id),cap=maxLevel(cat,def,id),need=xpToNext(cat,p.level);
    $('h1').textContent=def.name;$('.crumb').textContent='LOADOUT  ›  GUNSMITH'+(label?.(id)?'  ·  '+label(id):'');
    $('.lvl b').textContent=`WEAPON LEVEL ${p.level}${p.level>=cap?'  ·  MAX':''}`;
    $('.lvl i').style.width=(p.level>=cap?100:100*p.xp/need).toFixed(1)+'%';
    {const nx=nextUnlock(cat,def,id,p.level);$('.lvl small').textContent=p.level>=cap?'Max level · prestige it in the Armory':`${p.xp} / ${need} XP to level ${p.level+1}${nx?` · next unlock: ${nx.att.name} at level ${nx.level}`:''} · earn XP with kills using this gun`;}
    const slots=slotsOf();if(slot!=='camo'&&slot!=='charm'&&slot!=='sticker'&&!slots.includes(slot))slot=null;
    if(slot!=='sticker'){if(stkArm||stkPrev){stkArm=null;stkPrev=null;stkShow();}stkFor=null;}if(!stkDrag)canvas.style.cursor=stkArm?'crosshair':'';
    const on=equipped(cat,def,id,profile);
    $('.slots').innerHTML='<h3>ATTACHMENTS</h3>'+SLOT_ORDER.map(s=>{
      const has=slots.includes(s),eq=on.find(a=>cat.attachments.find(x=>x.id===a)?.slot===s);
      return `<button class="slot${s===slot?' sel':''}${has?'':' na'}${eq?'':' empty'}" data-slot="${s}">
        <div class="ico">${(def?.slotNames?.[s]??cat.slots[s]).slice(0,2).toUpperCase()}</div><div><span>${esc((def?.slotNames?.[s]??cat.slots[s]).toUpperCase())}</span><strong>${has?esc(eq?nameOf(eq):'None'):'—'}</strong></div></button>`;}).join('');
    // camo and charm share one COSMETIC section (user, 2026-11-06)
    if(cats||charmCat?.charms.length||stkCat?.stickers.length)$('.slots').insertAdjacentHTML('beforeend','<h3 style="margin-top:14px">COSMETIC</h3>');
    if(cats){const c=equippedCamo(cats,profile,id,weapons),unl=camoUnlocked(cats,profile,id,weapons),done=cats.camos.filter(k=>!k.reward&&!k.shop&&unl.has(k.id)).length,special=cats.camos.filter(k=>k.reward&&unl.has(k.id)).length;
      $('.slots').insertAdjacentHTML('beforeend',`<button class="slot${slot==='camo'?' sel':''}${c?'':' empty'}" data-slot="camo">
        <div class="ico swatch" style="background-image:url(${c?swatch(c):''})">${c?'':'—'}</div><div><span>CAMO · ${done} / ${cats.camos.filter(k=>!k.reward&&!k.shop).length} UNLOCKED${special?` · ${special} SPECIAL`:''}${loadPrestige().camos.length?` · ${loadPrestige().camos.length} PRESTIGE`:''}</span><strong>${esc(c?.name??'None')}</strong></div></button>`);}
    if(charmCat?.charms.length){const c=charmFor(charmCat,loadCharmState(),id);
      $('.slots').insertAdjacentHTML('beforeend',`<button class="slot${slot==='charm'?' sel':''}${c?'':' empty'}" data-slot="charm">
        <div class="ico">${c?'✦':'—'}</div><div><span>CHARM · ${charmCat.charms.filter(x=>!charmLock(x)).length} / ${charmCat.charms.length} OWNED</span><strong>${esc(c?.name??'None')}</strong></div></button>`);}
    if(stkCat?.stickers.length){const n=stkList().length;
      $('.slots').insertAdjacentHTML('beforeend',`<button class="slot${slot==='sticker'?' sel':''}${n?'':' empty'}" data-slot="sticker">
        <div class="ico">${n?'◉':'—'}</div><div><span>STICKERS · ${n} / ${MAX_STICKERS}</span><strong>${n?stkList().map(x=>esc(stkCat.stickers.find(s=>s.id===x.id)?.name??x.id)).join(', '):'None'}</strong></div></button>`);}
    $('.markers').innerHTML=slots.map(s=>`<div class="marker${s===slot?' sel':''}" data-m="${s}"><i>${esc((def?.slotNames?.[s]??cat.slots[s]).toUpperCase())}</i></div>`).join('');
    renderOptions();renderStats();if(cats)fillSwatches(root,cid=>camoById(cats,cid));
    $('.stats').style.display=slot==='camo'||slot==='charm'||slot==='sticker'?'none':'';   // camos don't change stats; the list needs the room
  }
  // swatches come from camo.js's shared cache, generated one per frame (fillSwatches after each render)
  const swatch=c=>camoSwatch(c);
  // Two tabs: the challenge camos (kills, headshots... with Gold and Diamond) and the special ones, rewards from maps
  // Two groups (user, 2026-10-14): THIS GUN (its challenge camos and its own three prestige camos) and GLOBAL (camos that
  // work on every gun, from GLOBAL_CAMO_TABS: prestige earned anywhere, shop, special)
  let camoTab='challenge';
  function renderCamos(el){
    const done=camoUnlocked(cats,profile,id,weapons),p=camoProgress(profile,id),on=equippedCamo(cats,profile,id,weapons)?.id,base=cats.camos.filter(c=>!c.mastery&&!c.classMastery&&!c.reward),cp=classProgress(cats,profile,id,weapons);
    const challenge=cats.camos.filter(c=>!c.reward&&!c.shop&&(!c.classMastery||cp)),special=cats.camos.filter(c=>c.reward),shop=cats.camos.filter(c=>c.shop);
    const pr=loadPrestige(),mine=[1,2,3].map(t=>camoById(cats,prestigeCamoId(t,id)));
    const global=GLOBAL_CAMO_TABS.map(t=>({...t,camos:t.list({cats,weapons,id})}));
    const group=camoTab.startsWith('g:')?'global':'gun',gt=global.find(t=>'g:'+t.id===camoTab);
    const shown=gt?gt.camos:camoTab==='mine'?mine:challenge,count=l=>`${l.filter(c=>done.has(c.id)).length} / ${l.length}`;
    const tab=(key,label,small)=>`<button class="ctab${camoTab===key?' on':''}" data-ctab="${key}">${label}<small>${small}</small></button>`;
    el.innerHTML='<h3>CAMO</h3>'+
      `<div class="cgroups"><button class="cgroup${group==='gun'?' on':''}" data-ctab="challenge">THIS GUN</button><button class="cgroup${group==='global'?' on':''}" data-ctab="g:${global[0].id}">GLOBAL</button></div>`+
      `<div class="ctabs">${group==='gun'?tab('challenge','CHALLENGE',count(challenge))+tab('mine','PRESTIGE',count(mine))
        :global.map(t=>tab('g:'+t.id,t.label,t.camos.filter(c=>done.has(c.id)).length)).join('')}</div>`+
      (gt?`<p class="neu">${esc(gt.hint)}</p>`:'')+
      (camoTab==='mine'?`<p class="neu">Prestige this gun in the Armory to earn its three camos; once earned, every gun can wear them (GLOBAL · PRESTIGE).${pr.player.tokens?` You have ${pr.player.tokens} prestige token${pr.player.tokens>1?'s':''}: a token unlocks a Prestige I or II camo.`:''}</p>`:'')+
      `<button class="opt${on?'':' on'}" data-camo=""><strong>None</strong><div class="pc"><span class="neu">Factory finish</span></div></button>`+
      (gt&&!shown.length?`<p class="neu">Nothing here yet.</p>`:'')+
      shown.map(c=>{const locked=!done.has(c.id);
        if(c.shop){   // shop camos (Phase 6): owned or not
          return `<button class="opt camo-opt${on===c.id?' on':''}${locked?' locked':''}${c.anim?' anim':''}" data-camo="${c.id}"><span class="tag">${on===c.id?'EQUIPPED':locked?'SHOP':''}</span>
            <div class="camo-row"><i class="sw" data-swatch="${c.id}" style="background-image:url(${swatch(c)})${c.anim?`;--a:rgb(${c.anim.c1.map(v=>Math.round(v*255))});--b:rgb(${c.anim.c2.map(v=>Math.round(v*255))})`:''}"></i><div><strong>${esc(c.name)}</strong>
            <div class="pc"><span class="${locked?'neu':'pro'}">${locked?'Buy it in the Shop':'Owned'}</span></div></div></div></button>`;}
        if(c.prestige){   // prestige camos: earned by prestiging the gun (or a token), Master by Master levels
          const own=c.owner===id,w=pr.weapons[c.owner]??{},tier=w.tier??0,mlv=w.mlevel??0,gun=weapons[c.owner]?.name??c.owner;
          const showBar=own&&c.prestige===3&&locked,have=showBar?Math.min(PRESTIGE.masterCamoAt,tier>=3?mlv:0):1,need=showBar?PRESTIGE.masterCamoAt:1;   // the Master bar only for this gun's own, still locked
          const what=!own?`Earned on the ${gun}`:c.prestige===3?`Prestige Master level ${PRESTIGE.masterCamoAt}${tier<3?' (prestige this gun three times)':''}`:`Reach ${TIER_NAMES[c.prestige].toLowerCase().replace('prestige','Prestige')} with this gun`;
          return `<button class="opt camo-opt${on===c.id?' on':''}${locked?' locked':''}${c.anim?' anim':''}" data-camo="${c.id}"><span class="tag">${on===c.id?'EQUIPPED':locked?'LOCKED':TIER_NAMES[c.prestige]}</span>
            <div class="camo-row"><i class="sw" data-swatch="${c.id}" style="background-image:url(${swatch(c)})${c.anim?`;--a:rgb(${c.anim.c1.map(v=>Math.round(v*255))});--b:rgb(${c.anim.c2.map(v=>Math.round(v*255))})`:''}"></i><div><strong>${esc(c.name)}</strong>
            <div class="pc"><span class="${locked?'neu':'pro'}">${esc(what)}${need>1?` · ${have} / ${need}`:''}</span>${locked&&own&&c.prestige<3&&pr.player.tokens?` <span class="tok" data-token="${c.id}">USE TOKEN</span>`:''}</div>
            ${need>1?`<div class="cbar"><b style="width:${(100*have/need).toFixed(1)}%"></b></div>`:''}</div></div></button>`;}
        const have=c.reward?(done.has(c.id)?1:0):c.classMastery?cp.done:c.mastery?base.filter(b=>done.has(b.id)).length:Math.min(c.count,p[challengeOf(cats,id,c)]??0),need=c.classMastery?cp.total:c.mastery?base.length:c.count;
        const what=c.classMastery?`Gold on every ${cp.label.toLowerCase().replace(/s$/,'')}`:c.mastery?'Complete every challenge camo':cats.challenges[challengeOf(cats,id,c)];
        return `<button class="opt camo-opt${on===c.id?' on':''}${locked?' locked':''}" data-camo="${c.id}"><span class="tag">${on===c.id?'EQUIPPED':locked?'LOCKED':''}</span>
          <div class="camo-row"><i class="sw" data-swatch="${c.id}" style="background-image:url(${swatch(c)})"></i><div><strong>${esc(c.name)}</strong>
          <div class="pc"><span class="${locked?'neu':'pro'}">${esc(what)} · ${have} / ${need}</span></div>
          <div class="cbar"><b style="width:${(100*have/need).toFixed(1)}%"></b></div></div></div></button>`;}).join('');
  }
  // Weapon charms (mods/charms, 2026-11-06): one per gun, hung on the preview gun as in game and swinging as it's
  // picked; locked ones (a pass reward, coming soon) preview but can't be equipped
  let charmYaw=null,charmFor_gun=null,charmCat=null,charmRig=null,charmAnchor=null,charmRoot=null,charmShown,charmToken=0,charmKick=0;
  loadCharms().then(c=>{charmCat=c;if(alive&&c.charms.length)renderUI();});
  function renderCharms(el){
    const on=charmFor(charmCat,loadCharmState(),id)?.id;
    el.innerHTML='<h3>CHARM</h3><p class="neu">Hangs off the side of this gun and swings as you move.</p>'+
      `<button class="opt${on?'':' on'}" data-charm=""><strong>None</strong><div class="pc"><span class="neu">No charm</span></div></button>`+
      charmCat.charms.map(c=>{const lock=charmLock(c);
        return `<button class="opt${on===c.id?' on':''}${lock?' locked':''}" data-charm="${esc(c.id)}"><span class="tag">${on===c.id?'EQUIPPED':lock==='PASS'?'MELON PASS':lock==='SOON'?'COMING SOON':lock}</span>
          <strong>${esc(c.name)}</strong><div class="pc"><span class="neu">${esc(c.desc??'')}</span></div></button>`;}).join('');
  }
  // hang a charm on the preview gun: cid = a charm id, '' = none, undefined = the one equipped on this gun
  async function hangCharm(cid){
    const want=cid===undefined?charmFor(charmCat,loadCharmState(),id)?.id??'':cid;if(want===charmShown&&charmRig?.gun===gun)return;charmShown=want;
    const my=++charmToken;charmRig?.dispose();charmRig=null;if(!gun||!charmCat)return;
    if(charmFor_gun!==gun){charmFor_gun=gun;   // where it hangs on this gun (also where the CHARM slot turns the camera)
      charmRoot=gun.getObjectByName(def.gunRoot??'j_gun')??(()=>{let b=null;gun.traverse(o=>{if(!b&&o.isBone)b=o;});return b;})();
      scene.updateMatrixWorld(true);charmAnchor=charmRoot&&gunAnchor(gun,charmRoot,{key:def.model,override:charmCat.anchors[id],unit:charmUnit(def)});}
    const c=charmCat.charms.find(x=>x.id===want);if(!c||!charmAnchor)return;
    const body=await charmModel(c);if(my!==charmToken||!body||!alive||charmFor_gun!==gun)return;
    charmAnchor=gunAnchor(gun,charmRoot,{key:def.model,override:charmCat.anchors[id],...charmReach(body,c),unit:charmUnit(def)})??charmAnchor;   // this charm's own reach
    charmRig=new CharmRig(body,c);charmRig.gun=gun;scene.add(charmRig.group);charmKick=2;if(slot==='charm')aim();
  }
  // Weapon stickers (mods/stickers, 2026-11-06): up to three per gun. Drag one from ADD onto the gun to place it, drag a
  // placed one to move it (a drag anywhere else still turns the gun; a tap on a sticker then a tap on the gun also
  // places it, for touch). SIZE and ROTATE on the selected one. The view turns to the gun's right side, the side
  // first person shows (FLIP for the left). The gun's materials draw them (stickers.js).
  let stkCat=null,stkArm=null,stkSel=0,stkPrev=null,stkYaw=null,stkFor=null;   // stkArm: {id, at (slot to fill or null)}; stkPrev: {at, x} the live preview
  const STK_GAME=-(Math.PI-.35),STK_OTHER=-.35;   // camera yaw for the side seen in first person (the gun's left) and the other side
  const gameDir=new THREE.Vector3(Math.sin(STK_GAME),0,Math.cos(STK_GAME));   // from the gun toward that camera
  loadStickers().then(c=>{stkCat=c;if(alive&&c.stickers.length)renderUI();});
  const stkList=()=>stkCat?stickersFor(stkCat,loadStickerState(),id):[];
  const stkGameSide=()=>Math.cos(stkYaw??yaw)<0;   // the side being turned to, not the one passing by
  function stkSave(listNow){const st=loadStickerState();if(listNow.length)st.on[id]=listNow;else delete st.on[id];saveStickerState(st);
    onChange?.(id);dispatchEvent(new CustomEvent('kino-stickers',{detail:{id}}));}
  function stkShow(){if(!gun)return;let l=stkList();if(stkPrev){l=l.slice();l[stkPrev.at]=stkPrev.x;}return applyStickers(gun,l.filter(Boolean),id);}
  function renderStickers(el){
    if(stkFor!==id){stkFor=id;stkYaw=STK_GAME;}   // first look at a gun's stickers: its in-game side
    const l=stkList(),nm=x=>esc(stkCat.stickers.find(s=>s.id===x)?.name??x),img=x=>{const s=stkCat.stickers.find(k=>k.id===x);return s?stickerImage(s):'';};
    if(stkSel>=l.length)stkSel=Math.max(0,l.length-1);const hid=l.map(stkHidden);
    const hint=stkArm?`Tap the gun to place ${nm(stkArm.id)}, or drag it there. Right-click or Esc cancels.`
      :l.length<MAX_STICKERS?'Drag a sticker onto the gun. Drag a placed one to move it.':'All three are placed: drag one to move it, or drop a new one to replace the selected one.';
    el.innerHTML=`<h3>STICKERS · ${l.length} / ${MAX_STICKERS}</h3><p class="stk-hint">${hint}</p>
      <button class="opt stk-flip" data-stk-flip><strong>${stkGameSide()?'SIDE SEEN IN GAME':'OTHER SIDE · NOT SEEN IN GAME'}</strong><span class="tag" style="float:none;margin-left:8px">FLIP ⟲</span></button>`+
      l.map((x,i)=>`<div class="opt stk-row${i===stkSel?' on':''}" data-stk-i="${i}"><img src="${img(x.id)}" alt="" draggable="false"><strong>${nm(x.id)}${hid[i]?'<small class="stk-hid">NOT SEEN IN GAME</small>':''}</strong>
        <span class="acts">${hid[i]?`<button data-stk-game="${i}">MOVE TO GAME SIDE</button>`:''}<button data-stk-del="${i}">REMOVE</button></span>
        ${i===stkSel?`<label>SIZE<input type="range" min="50" max="200" step="5" value="${Math.round((x.m??1)*100)}" data-stk-size="${i}"><b>${Math.round((x.m??1)*100)}%</b></label>
        <label>ROTATE<input type="range" min="-180" max="180" step="5" value="${x.r??0}" data-stk-rot="${i}"><b>${x.r??0}°</b></label>`:''}</div>`).join('')+
      `<h3 style="margin-top:12px">ADD</h3><div class="stk-grid">`+stkCat.stickers.map(s=>{const lock=stickerLock(s);
        return `<button class="opt stk-pick${stkArm?.id===s.id?' on':''}${lock?' locked':''}" data-stk-pick="${esc(s.id)}" title="${esc(s.desc??'')}">
          <img src="${stickerImage(s)}" alt="" draggable="false"><strong>${esc(s.name)}</strong>${lock?`<span class="tag" style="float:none">${lock==='PASS'?'MELON PASS':lock==='SOON'?'COMING SOON':lock}</span>`:''}</button>`;}).join('')+'</div>';
  }
  // where a screen point meets a painted, visible part of the gun (bind-space placement, stickers.js)
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function stkHit(cx,cy){
    if(!gun)return null;const r=canvas.getBoundingClientRect();ndc.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1);
    gun.updateMatrixWorld(true);camera.updateMatrixWorld();ray.setFromCamera(ndc,camera);
    return stkPick(camera);
  }
  function stkPick(cam){   // the first painted, visible part of the gun along `ray`
    for(const h of ray.intersectObject(gun,true)){const o=h.object;let shown=true;for(let a=o;a&&a!==scene;a=a.parent)if(!a.visible){shown=false;break;}
      const m=[o.material].flat()[h.face?.materialIndex??0]??[o.material].flat()[0],base=m?.userData?.stickerOf??m?.userData?.camoOf??m;
      if(!shown||!base?.map||m.transparent&&m.opacity<.5||/lens|glass|reticle|red_dot/i.test(base.name??''))continue;
      return stickerFromHit(gun,h,cam,radius*.18);}
    return null;
  }
  // a placed sticker's centre and normal in world space (through the skin of its nearest vertex)
  function stkWorld(x){
    if(!gun||!x)return null;let o=null;for(const [m,k] of meshKeys(gun))if(k===x.k){o=m;break;}
    const a=o?.geometry?.attributes?.position;if(!a)return null;gun.updateMatrixWorld(true);
    let bi=0,bd=Infinity;for(let i=0;i<a.count;i++){const d=(a.getX(i)-x.p[0])**2+(a.getY(i)-x.p[1])**2+(a.getZ(i)-x.p[2])**2;if(d<bd){bd=d;bi=i;}}
    const p=new THREE.Vector3().fromArray(x.p),q=p.clone().addScaledVector(new THREE.Vector3().fromArray(x.n),Math.max(x.s,1e-3));
    if(o.isSkinnedMesh){o.skeleton?.update();o.applyBoneTransform(bi,p);o.applyBoneTransform(bi,q);}
    o.localToWorld(p);o.localToWorld(q);return {p,n:q.sub(p).normalize()};
  }
  const stkHidden=x=>{const w=stkWorld(x);return !!w&&w.n.dot(gameDir)<-.25;};   // faces away from the first-person camera
  // move a sticker to the side seen in game: straight through the gun from that side, same size and turn
  function stkToGame(i){
    const l=stkList(),x=l[i],w=stkWorld(x);if(!w)return;
    const cam=camera.clone();cam.position.copy(w.p).addScaledVector(gameDir,radius*3);cam.up.set(0,1,0);cam.lookAt(w.p);cam.updateMatrixWorld();
    ray.set(cam.position,gameDir.clone().negate());const y=stkPick(cam);if(!y)return;
    l[i]={...y,id:x.id,m:x.m??1,r:x.r??0};stkSave(l);stkSel=i;stkYaw=STK_GAME;stkShow();renderUI();
  }
  // which placed sticker (index) a hit lands on: same vertex buffer, inside its square, facing the same way
  function stkUnder(x){
    if(!x)return -1;const keys=meshKeys(gun),buf=k=>{for(const [o,kk] of keys)if(kk===k)return o.geometry?.attributes?.position?.array;};
    const hb=buf(x.k),l=stkList();let best=-1,bd=Infinity;
    l.forEach((s,i)=>{if(buf(s.k)!==hb)return;const d=Math.hypot(x.p[0]-s.p[0],x.p[1]-s.p[1],x.p[2]-s.p[2]),lim=s.s*(s.m??1);
      if(d<lim&&x.n[0]*s.n[0]+x.n[1]*s.n[1]+x.n[2]*s.n[2]>.2&&d<bd){bd=d;best=i;}});
    return best;
  }
  const stkSlotFor=a=>a?.at??(stkList().length<MAX_STICKERS?stkList().length:stkSel);   // a new one fills the next slot, or replaces the selected
  function stkPreview(cx,cy){   // the dragged/armed sticker under the pointer
    if(!stkArm)return;const x=stkHit(cx,cy),at=stkSlotFor(stkArm),old=stkArm.at!=null?stkList()[at]:null;
    stkPrev=x?{at,x:{...x,id:stkArm.id,m:old?.m??1,r:old?.r??0}}:(stkArm.at!=null?{at,x:null}:null);stkShow();return !!x;
  }
  function stkDrop(){   // place the previewed sticker
    const pv=stkPrev;stkPrev=null;const arm=stkArm;stkArm=null;
    if(pv?.x){const l=stkList();l[pv.at]=pv.x;stkSave(l.slice(0,MAX_STICKERS));stkSel=pv.at;}
    stkShow();renderUI();
  }
  function stkCancel(){stkArm=null;stkPrev=null;stkDrag=null;stkGhost?.remove();stkGhost=null;stkShow();renderUI();}
  // dragging: from an ADD tile (a ghost follows the pointer) or a placed sticker on the gun
  let stkDrag=null,stkGhost=null,stkRaf=0,stkLast=null,stkTap=null;
  const overCanvas=(cx,cy)=>document.elementFromPoint(cx,cy)===canvas;
  function stkFrame(fn){stkLast=fn;if(stkRaf)return;stkRaf=requestAnimationFrame(()=>{stkRaf=0;const f=stkLast;stkLast=null;f?.();});}
  root.addEventListener('pointerdown',e=>{
    const pk=e.target.closest?.('[data-stk-pick]');if(!pk||e.button!==0||pk.classList.contains('locked')||slot!=='sticker')return;
    stkDrag={kind:'new',id:pk.dataset.stkPick,x:e.clientX,y:e.clientY,moved:false};
  });
  canvas.addEventListener('pointerdown',e=>{
    stkTap=null;if(slot!=='sticker'||e.button!==0||!stkCat)return;
    if(stkArm){stkTap={x:e.clientX,y:e.clientY};return;}   // armed by a tap: the next tap on the gun places it
    const i=stkUnder(stkHit(e.clientX,e.clientY));if(i<0)return;   // not on a sticker: the gun turns as usual
    e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);stkSel=i;
    stkDrag={kind:'move',at:i,x:e.clientX,y:e.clientY,moved:false};stkArm={id:stkList()[i].id,at:i};canvas.style.cursor='grabbing';
  });
  const stkMoveH=e=>{
    if(!alive)return;if(!stkDrag){   // hovering: a hand over placed stickers, the armed one follows the pointer
      if(slot!=='sticker'||e.target!==canvas||e.buttons)return;
      stkFrame(()=>{if(stkArm)stkPreview(e.clientX,e.clientY);else canvas.style.cursor=stkUnder(stkHit(e.clientX,e.clientY))>=0?'grab':'';});return;}
    if(!stkDrag.moved&&Math.hypot(e.clientX-stkDrag.x,e.clientY-stkDrag.y)<5)return;
    if(!stkDrag.moved){stkDrag.moved=true;
      if(stkDrag.kind==='new'){stkArm={id:stkDrag.id,at:stkList().length<MAX_STICKERS?null:stkSel};
        const s=stkCat.stickers.find(k=>k.id===stkDrag.id);stkGhost=document.createElement('img');stkGhost.src=s?stickerImage(s):'';
        stkGhost.style.cssText='position:fixed;width:64px;height:64px;pointer-events:none;z-index:60;opacity:.85;transform:translate(-50%,-50%);filter:drop-shadow(0 2px 4px #000a)';root.append(stkGhost);}}
    if(stkGhost){stkGhost.style.left=e.clientX+'px';stkGhost.style.top=e.clientY+'px';}
    const cx=e.clientX,cy=e.clientY;
    stkFrame(()=>{if(!stkDrag)return;const on=overCanvas(cx,cy)&&stkPreview(cx,cy);if(!on&&stkDrag.kind==='new'&&stkPrev){stkPrev=null;stkShow();}
      if(stkGhost)stkGhost.style.opacity=on?'0':'.85';});   // over the gun the sticker itself shows
  };
  const stkUpH=e=>{
    if(!alive)return;const d=stkDrag;stkDrag=null;stkGhost?.remove();stkGhost=null;cancelAnimationFrame(stkRaf);stkRaf=0;stkLast=null;
    if(d){canvas.style.cursor='';if(!d.moved){if(d.kind==='move'){stkArm=null;stkPrev=null;renderUI();}return;}   // a plain press on a tile: its click arms it
      if(overCanvas(e.clientX,e.clientY))stkPreview(e.clientX,e.clientY);stkDrop();return;}
    const t=stkTap;stkTap=null;   // tap-to-place
    if(t&&stkArm&&e.target===canvas&&Math.hypot(e.clientX-t.x,e.clientY-t.y)<=5){stkPreview(e.clientX,e.clientY);if(stkPrev?.x)stkDrop();}
  };
  addEventListener('pointermove',stkMoveH);addEventListener('pointerup',stkUpH);
  canvas.addEventListener('pointerleave',()=>{if(stkArm&&!stkDrag&&stkPrev){stkPrev=stkArm.at!=null?{at:stkArm.at,x:null}:null;stkShow();}});
  canvas.addEventListener('contextmenu',e=>{if(stkArm||stkDrag){e.preventDefault();stkCancel();}});
  root.addEventListener('input',e=>{const t=e.target,i=+(t.dataset.stkSize??t.dataset.stkRot);if(t.dataset.stkSize===undefined&&t.dataset.stkRot===undefined)return;
    const l=stkList();if(!l[i])return;if(t.dataset.stkSize!==undefined)l[i].m=+t.value/100;else l[i].r=+t.value;
    t.nextElementSibling.textContent=t.dataset.stkSize!==undefined?t.value+'%':t.value+'°';
    const st=loadStickerState();st.on[id]=l;saveStickerState(st);stkShow();});
  root.addEventListener('change',e=>{if(e.target.dataset?.stkSize!==undefined||e.target.dataset?.stkRot!==undefined)stkSave(stkList());});
  function stkClick(e){
    if(e.target.closest('[data-stk-flip]')){stkYaw=stkGameSide()?STK_OTHER:STK_GAME;renderUI();return true;}
    const pk=e.target.closest('[data-stk-pick]');if(pk){if(pk.classList.contains('locked'))return true;
      stkArm=stkArm?.id===pk.dataset.stkPick?null:{id:pk.dataset.stkPick,at:stkList().length<MAX_STICKERS?null:stkSel};
      stkPrev=null;stkShow();renderUI();return true;}
    const tg=e.target.closest('[data-stk-game]');if(tg){stkToGame(+tg.dataset.stkGame);return true;}
    const dl=e.target.closest('[data-stk-del]');if(dl){const l=stkList();l.splice(+dl.dataset.stkDel,1);stkSave(l);stkArm=null;stkPrev=null;stkShow();renderUI();return true;}
    const row=e.target.closest('[data-stk-i]');if(row){if(e.target.closest('input'))return true;const i=+row.dataset.stkI;if(i!==stkSel){stkSel=i;renderUI();}return true;}
    return false;
  }
  function renderOptions(){
    const el=$('.opts');
    if(slot==='camo'&&cats){renderCamos(el);return;}
    if(slot==='charm'&&charmCat){renderCharms(el);return;}
    if(slot==='sticker'&&stkCat){renderStickers(el);return;}
    if(!slot){el.innerHTML='<h3>SELECT A SLOT</h3><p class="neu">Pick an attachment slot on the left; the camera moves to that part of the gun.</p>';return;}
    const all=available(cat,def,id),unlocked=new Set(unlockedAttachments(cat,def,id,profile).map(a=>a.id)),on=new Set(equipped(cat,def,id,profile));
    const opts=all.filter(a=>a.slot===slot);
    el.innerHTML=`<h3>${esc((def?.slotNames?.[slot]??cat.slots[slot]).toUpperCase())}</h3>`+
      `<button class="opt${opts.some(a=>on.has(a.id))?'':' on'}" data-att=""><strong>None</strong><div class="pc"><span class="neu">Stock ${esc((def?.slotNames?.[slot]??cat.slots[slot]).toLowerCase())}</span></div></button>`+
      opts.map(a=>{const lv=unlockLevelOf(cat,def,id,a.id),locked=!unlocked.has(a.id);
        return `<button class="opt${on.has(a.id)?' on':''}${locked?' locked':''}" data-att="${a.id}"><span class="tag">${on.has(a.id)?'EQUIPPED':locked?'WEAPON LV '+lv:''}</span>
          <strong>${esc(a.name)}</strong><div class="pc">${prosCons(a)}</div></button>`;}).join('');
  }
  function prosCons(a){
    const s=a.stats??{},out=[];
    const pct=(k,label,m)=>{if(!m)return;const v=Math.round((m-1)*100);out.push([v>=0?'pro':'con',`${label} ${v>=0?'+':'−'}${Math.abs(v)}%`]);};
    pct(0,'Damage',s.damageMul);pct(0,'Range',s.rangeMul);pct(0,'Fire rate',s.fireMul);
    if(s.suppressed)out.push(['pro','Quiet shots']);
    if(s.auto)out.push(['pro','Full auto']);
    if(s.clipMul)out.push(['pro',`Magazine +${Math.round((s.clipMul-1)*100)}%`]);
    if(s.reserveMul)out.push(['pro',`Reserve ammo +${Math.round((s.reserveMul-1)*100)}%`]);
    if(s.reloadMul)out.push([s.reloadMul<1?'pro':'con',`Reload ${s.reloadMul<1?'−':'+'}${Math.round(Math.abs(1-s.reloadMul)*100)}%`]);
    if(s.adsFov||s.adsFovMul)out.push(['pro','Zoom +']);
    if(s.headMul)out.push(['pro',`Headshots +${Math.round((s.headMul-1)*100)}%`]);
    if(s.hipSpreadMul)out.push(['pro',`Hip spread −${Math.round((1-s.hipSpreadMul)*100)}%`]);
    if(a.underbarrel)out.push(['neu','Press 5 to switch']);
    if(!out.length)out.push(['neu',a.desc??'']);
    return out.map(([k,t])=>`<span class="${k}">${k==='pro'?'▲ ':k==='con'?'▼ ':''}${esc(t)}</span>`).join('');
  }
  // Bars fill against `max`, or the larger of the two values when a gun goes past it (snipers: damage 1000, range
  // 999999), so a change always shows. FIRE RATE (Rapid Fire) and HIP FIRE (grips, stocks, laser, short barrel) were
  // missing, so those attachments showed no change at all.
  const STATS=[['DAMAGE',d=>d.damage,300,v=>Math.round(v)],['RANGE',d=>d.range,4000,v=>v>=1e5?'∞':Math.round(v)],['FIRE RATE',d=>60/Math.max(.01,d.fireTime??.1),900,v=>Math.round(v)+' rpm'],
    ['MAGAZINE',d=>d.clipSize,100,v=>Math.round(v)],
    ['RELOAD',d=>1/Math.max(.3,d.reloadTime??1),1/.8,(v,d)=>(d.reloadTime??0).toFixed(2)+'s'],['HIP FIRE',d=>.012/Math.max(.001,d.hipSpread??.012),2.5,v=>Math.round(v*100)+'%'],
    ['ZOOM',d=>80-(d.adsFov??60),70,(v,d)=>((80-(d.adsFov??60))/30+1).toFixed(1)+'×'],['HEADSHOT',d=>d.headMultiplier??1,6,v=>'×'+(+v).toFixed(2)]];
  function renderStats(){
    const cur=equipped(cat,def,id,profile);
    let next=cur;
    if(hover!==null&&slot){const others=cur.filter(a=>cat.attachments.find(x=>x.id===a)?.slot!==slot);next=hover?[...others,hover]:others;}
    const a=previewDef(cat,def,id,cur),b=previewDef(cat,def,id,next);
    $('.stats').innerHTML='<h3>STATS'+(next!==cur?' · PREVIEW':'')+'</h3>'+STATS.map(([label,f,max,fmt])=>{
      max=Math.max(max,f(a)*1.1,f(b)*1.1);
      const va=Math.max(0,Math.min(1,f(a)/max)),vb=Math.max(0,Math.min(1,f(b)/max)),lo=Math.min(va,vb),hi=Math.max(va,vb),up=vb>va+1e-4,down=vb<va-1e-4;
      return `<div class="stat"><span>${label}</span><span class="tr"><i style="width:${(lo*100).toFixed(1)}%"></i>${up||down?`<u style="left:${(lo*100).toFixed(1)}%;width:${((hi-lo)*100).toFixed(1)}%;background:${up?'#7fd48a':'#e46b5a'}"></u>`:''}</span><b class="${up?'pro':down?'con':''}">${fmt(f(b),b)}</b></div>`;}).join('');
  }

  // ---- interaction ------------------------------------------------------------------------
  // keep clicks here from reaching the game behind (the pause menu resumes on click)
  for(const ev of ['click','mousedown','mouseup','pointerdown'])root.addEventListener(ev,e=>e.stopPropagation());
  root.addEventListener('click',e=>{
    const ct=e.target.closest('.ctab,.cgroup');if(ct){camoTab=ct.dataset.ctab;hover=null;renderUI();return;}
    if(slot==='sticker'&&stkCat&&stkClick(e))return;
    const tk=e.target.closest('[data-token]');if(tk){const pr=loadPrestige();if(spendToken(pr,tk.dataset.token)){savePrestige(pr);onChange?.(id);}renderUI();return;}
    const s=e.target.closest('.slot');if(s&&!s.classList.contains('na')){slot=slot===s.dataset.slot?null:s.dataset.slot;hover=null;renderUI();aim();return;}
    const o=e.target.closest('.opt');
    if(o&&o.dataset.charm!==undefined&&!o.classList.contains('locked')){
      const st=loadCharmState();if(o.dataset.charm)st.on[id]=o.dataset.charm;else delete st.on[id];saveCharmState(st);
      hover=null;onChange?.(id);dispatchEvent(new CustomEvent('kino-charm',{detail:{id}}));hangCharm();renderUI();return;}
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
    if(slot==='charm'){hangCharm(o?o.dataset.charm:undefined);return;}   // locked ones preview too
    if(slot==='camo'&&cats){const cid=o&&!o.classList.contains('locked')?o.dataset.camo:undefined;
      applyCamo(gun,cid===undefined?equippedCamo(cats,profile,id,weapons):camoById(cats,cid)??null);return;}
    const h=o?o.dataset.att??null:null;   // locked ones preview too (stats and parts), as in BO; only equipping needs the level
    if(h!==hover){hover=h;
      const cur=equipped(cat,def,id,profile);
      if(hover!==null&&slot){const others=cur.filter(a=>cat.attachments.find(x=>x.id===a)?.slot!==slot);showParts(hover?[...others,hover]:others);}
      else showParts(cur);
      renderStats();}
  });
  // One pointer turns the gun, two (touch) pinch to zoom. touch-action:none so a drag is not taken as a page scroll.
  canvas.style.touchAction='none';
  const pointers=new Map();let pinch=0;
  const release=e=>{pointers.delete(e.pointerId);pinch=0;dragging=pointers.size===1?{...[...pointers.values()][0]}:null;};
  canvas.addEventListener('pointerdown',e=>{stkYaw=null;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);dragging=null;}else dragging={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0&&d>0)distGoal=THREE.MathUtils.clamp(distGoal*pinch/d,radius*1.2,radius*5);pinch=d;return;}
    if(!dragging)return;yaw+=(e.clientX-dragging.x)*.008;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-dragging.y)*.005,-.6,.8);dragging={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',e=>{distGoal=THREE.MathUtils.clamp(distGoal*(1+Math.sign(e.deltaY)*.1),radius*1.2,radius*5);e.preventDefault();},{passive:false});
  const onKey=e=>{if(e.code==='Escape'){e.stopPropagation();e.preventDefault();if(stkArm||stkDrag){stkCancel();return;}close();}};
  addEventListener('keydown',onKey,true);
  function aim(){
    const p=slot==='charm'?(charmRoot&&charmAnchor?charmRoot.localToWorld(charmAnchor.at.clone()).addScaledVector(DOWN,radius*.08):null):slot&&anchorOf(slot);
    // the charm hangs on the gun's left: turn round to that side
    charmYaw=null;if(slot==='charm'&&charmRoot){const n=new THREE.Vector3().setFromMatrixColumn(charmRoot.matrixWorld,1);charmYaw=Math.atan2(n.x,n.z);}
    if(p){focusGoal.copy(p);distGoal=radius*(slot==='charm'?1.3:2);}else{focusGoal.set(0,0,0);distGoal=radius*3.1;}
  }

  // ---- frame: camera, leader lines, pulse ---------------------------------------------------
  const svg=$('svg.lines'),v=new THREE.Vector3();let t=0,last=performance.now();
  let emissiveFor=null,emissiveMeshes=[],pulsedSlot,lastPaths='',skip=false,lastCam=new THREE.Vector3(),lastKey='';
  const PULSE=new THREE.Color('#f3a33a'),DOWN=new THREE.Vector3(0,-1,0);
  function frame(now){
    if(!alive)return;requestAnimationFrame(frame);
    const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;camoTime.value+=dt;   // animated camos (Pack-a-Punch, Prestige Master)
    const w=root.clientWidth,h=root.clientHeight;
    if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
    focus.lerp(focusGoal,1-Math.exp(-dt*6));dist+=(distGoal-dist)*(1-Math.exp(-dt*6));
    if(!dragging&&!slot)yaw+=dt*.12;
    else if(!dragging&&slot==='sticker'&&stkYaw!=null){const d=Math.atan2(Math.sin(stkYaw-yaw),Math.cos(stkYaw-yaw));yaw+=d*(1-Math.exp(-dt*5));if(Math.abs(d)<.005)stkYaw=null;}
    else if(!dragging&&slot==='charm'&&charmYaw!=null){const d=Math.atan2(Math.sin(charmYaw-yaw),Math.cos(charmYaw-yaw));yaw+=d*(1-Math.exp(-dt*5));}
    camera.position.set(focus.x+Math.sin(yaw)*Math.cos(pitch)*dist,focus.y+Math.sin(pitch)*dist,focus.z+Math.cos(yaw)*Math.cos(pitch)*dist);
    // keep the gun off-centre toward the free middle of the screen
    camera.lookAt(focus);camera.setViewOffset(w,h,-w*.03,0,w,h);
    // pulse the parts of the selected slot
    if(gun){
      if(emissiveFor!==gun){emissiveFor=gun;emissiveMeshes=[];gun.traverse(o=>{if(o.isMesh&&o.material?.emissive)emissiveMeshes.push(o);});pulsedSlot=undefined;}
      if(slot||pulsedSlot!==slot){const pulse=.12+.1*Math.sin(t*5);pulsedSlot=slot;
        for(const o of emissiveMeshes){if(!o.visible)continue;const m=o.material;if(!m?.emissive)continue;const hot=slot&&partOf(o)===slot;
          if(hot)m.emissive.copy(PULSE).multiplyScalar(pulse);else if(m.userData.emissive0)m.emissive.copy(m.userData.emissive0);else m.emissive.setRGB(0,0,0);}}}
    tickGlow(glow,t);
    let swinging=false;
    if(charmRig&&charmRig.gun===gun){charmRig.step(dt,{root:charmRoot,anchor:charmAnchor,gravity:DOWN,unit:charmUnit(def),bone:charmAnchor.bone?gun.getObjectByName(charmAnchor.bone):null});
      if(charmKick&&!--charmKick){const n=new THREE.Vector3().setFromMatrixColumn(charmRoot.matrixWorld,0).normalize();charmRig.q2.addScaledVector(n,.05*new THREE.Vector3().setFromMatrixScale(charmRoot.matrixWorld).x);}   // a little swing as it's hung
      swinging=charmRig.p2.distanceTo(charmRig.q2)>1e-4;}
    // the idle spin alone renders at 30 fps; the camera easing, a drag, a hover or slot change, a pulsing slot render every frame
    const key=String(hover)+'|'+slot+'|'+id;const busy=dragging||slot||swinging||key!==lastKey||camera.position.distanceTo(lastCam)>dist*.01||focus.distanceTo(focusGoal)>.5||Math.abs(distGoal-dist)>.5;
    lastKey=key;lastCam.copy(camera.position);skip=!busy&&!skip;if(skip)return;
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
    if(paths!==lastPaths){lastPaths=paths;svg.innerHTML=paths;}
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
  function close(){if(!alive)return;alive=false;charmRig?.dispose();removeEventListener('pointermove',stkMoveH);removeEventListener('pointerup',stkUpH);stkGhost?.remove();
    if(host){host.renderWorld=prevWorld;host.hideViewmodel=prevHide;}
    // materials are shared with the game's copies of this model: put them back
    gun?.traverse(o=>{const m=o.material;if(o.isMesh&&m?.emissive&&m.userData.emissive0)m.emissive.copy(m.userData.emissive0);});removeEventListener('keydown',onKey,true);renderer.dispose();root.remove();onClose?.();}

  // In a match the Gunsmith covers the screen: stop drawing the world and the viewmodel behind it while it's open
  // (the engine's mods.renderWorld hook; restored as it was on close)
  const host=window.kino?.mods,prevWorld=host?.renderWorld,prevHide=host?.hideViewmodel;
  if(host){host.renderWorld=()=>{};host.hideViewmodel=true;}
  requestAnimationFrame(frame);
  await loadGun();
  return {close};
}

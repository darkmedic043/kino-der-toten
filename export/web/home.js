// Main menu (not part of upstream): map browser, loadout, character and mods.
import * as THREE from 'three';
import { loadModel, ViewWeapon } from './animation.js';
import { applyGlow, tickGlow } from './mods/bo3-weapons/glow.js';
import { renderSettings } from './settings.js';
import { mergePatch, resolveWeapons } from './mod-loader.js';
import { loadProfile, saveProfile, loadProgression, xpToNext, unlocks, validLoadout, cloudReady } from './profile.js';
import { loadCatalog as loadGunsmith, renderGunsmith, GUNSMITH_CSS } from './mods/weapon-levels/gunsmith.js';
import { openGunsmith } from './mods/weapon-levels/gunsmith-view.js';
import { loadCamos, camoUnlocked, weaponClass, CLASSES, classOf as classOfIn } from './mods/weapon-levels/camo.js';
import { weaponProgress, maxLevel } from './mods/weapon-levels/gunsmith.js';
import { getAccount, onAccountChange, renderSignInButton, signOut } from './cloud.js';
import { renderCareer } from './career-view.js';
import { loadCharacterRegistry, createCharacter, armsUrl, tintArms, loadCharacterGltf, applyVariants, renderPortrait } from './characters.js';
import { FirstPersonArms } from './fp-arms.js';
import { loadClasses, loadClassProfile, saveClassProfile } from './mods/classes/classes.js';
import { renderClasses, CLASS_CSS } from './mods/classes/tree-view.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
let toastTimer;
function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}

// ---- Data --------------------------------------------------------------------
const fetchJson=url=>fetch(url).then(r=>{if(!r.ok)throw new Error(url+' HTTP '+r.status);return r.json();});
const [mapList,modList,config,characters,baseData]=await Promise.all([
  fetchJson('mods/maps.json').then(d=>d.maps).catch(()=>[]),
  fetchJson('mods/mods.json').then(d=>d.enabled??[]).catch(()=>[]),
  loadProgression(),loadCharacterRegistry(),fetchJson('game-data.json'),
]);
// Mod data patches are applied so custom weapons show up in the loadout.
const mods=await Promise.all(modList.map(async id=>{
  try{const manifest=await fetchJson(`mods/${id}/mod.json`);return {id,manifest};}catch(error){return {id,error:error.message};}
}));
let data={weapons:baseData.weapons,equipment:{...baseData.equipment},boxPool:baseData.boxPool,characters:{...baseData.characters}};
for(const m of mods)for(const file of [m.manifest?.data??[]].flat()){try{data=mergePatch(data,await fetchJson(`mods/${m.id}/${file}`));}catch{}}
// Mods that add weapons from a script (prepare) must show up here too.
for(const m of mods)if(m.manifest?.script){try{const module=await import(`./mods/${m.id}/${m.manifest.script}`);if(module.prepare)data=(await module.prepare(data,{id:m.id,url:new URL(`mods/${m.id}/`,document.baseURI),manifest:m.manifest}))??data;}catch(error){console.warn('[menu] mod',m.id,error);}}
try{resolveWeapons(data);}catch{}
const weapons=data.weapons,bonusById=Object.fromEntries(config.bonuses.map(b=>[b.id,b]));
const weaponLevel=Object.fromEntries(config.weapons.map(w=>[w.id,w.level]));
await cloudReady;
let profile=loadProfile();
// Weapon XP is earned in game (maybe in another tab): keep the stored value.
// camo progress is earned in game too: keep the stored counts, the menu only picks which camo is on
const save=()=>{const stored=loadProfile();profile.weaponXp=stored.weaponXp;
  const camo={...stored.camo};for(const [id,e] of Object.entries(profile.camo??{}))camo[id]={...camo[id],on:e.on};profile.camo=camo;
  saveProfile(profile);renderProfile();};
addEventListener('focus',()=>{profile=loadProfile();renderProfile();renderLoadout();});

// ---- Tabs -------------------------------------------------------------------
const tabs=[...document.querySelectorAll('#tabs button')],panes=[...document.querySelectorAll('#armory-nav button')];
// Armory holds Loadout, Classes and Operator as panes. Old links (#loadout, #classes,
// #character) open the matching pane.
const PANES={loadout:'loadout',classes:'classes',operator:'operator',character:'operator'};
let pane=PANES[location.hash.slice(1)]??'loadout';
function showTab(name){
  if(PANES[name]){pane=PANES[name];name='armory';}
  for(const b of tabs)b.classList.toggle('active',b.dataset.tab===name);
  for(const s of document.querySelectorAll('.tab'))s.classList.toggle('active',s.id==='tab-'+name);
  for(const b of panes)b.classList.toggle('active',b.dataset.pane===pane);
  for(const s of document.querySelectorAll('.pane'))s.classList.toggle('active',s.id==='pane-'+pane);
  const hash=name==='armory'?pane:name;if(location.hash!=='#'+hash)history.replaceState(null,'','#'+hash);
  stage.active=name==='armory'&&pane==='operator';if(stage.active)stage.start();
  if(name==='career')renderCareer($('career-root'),{mapList,weapons:baseData?.weapons??{}});
}
for(const b of tabs)b.addEventListener('click',()=>showTab(b.dataset.tab));
for(const b of panes)b.addEventListener('click',()=>showTab(b.dataset.pane));
renderSettings($('settings-panel'));

// ---- Profile card -------------------------------------------------------------
function renderProfile(){
  const need=xpToNext(config,profile.level),c=characters.find(c=>c.id===profile.character)??characters[0];
  $('p-level').textContent='LEVEL '+profile.level;$('p-bar').style.width=(100*profile.xp/need).toFixed(1)+'%';
  $('p-xp').textContent=`${profile.xp.toLocaleString()} / ${need.toLocaleString()} XP`;$('p-char').textContent=c?.name??'';
  $('p-stats').textContent=`${profile.kills.toLocaleString()} kills · best round ${profile.bestRound||'—'} · ${profile.games} games`;
}

// ---- Account ------------------------------------------------------------------
let wasSignedIn=getAccount().signedIn;
function renderAccount(){
  const a=getAccount(),el=$('account');
  if(a.signedIn){
    el.innerHTML=`<div class="acct">${a.picture?`<img src="${esc(a.picture)}" alt="" referrerpolicy="no-referrer">`:''}<span><strong>${esc(a.name)}</strong><small>Progress saved online</small></span></div><button type="button" id="sign-out">SIGN OUT</button>`;
    $('sign-out').onclick=async()=>{await signOut();toast('Signed out · progress stays on this device');};
  }else{
    el.innerHTML='<p class="small muted">Sign in to save progress online and play on any device.</p><div id="signin"></div>';
    renderSignInButton($('signin'));
  }
}
onAccountChange(a=>{wasSignedIn=a.signedIn;renderAccount();});
renderAccount();
// Discord sends players back here; ?signin=... reports a failed attempt.
{const msg=new URLSearchParams(location.search).get('signin');
  if(msg){toast({cancelled:'Sign-in cancelled',expired:'Sign-in expired, please try again',failed:'Discord sign-in failed, please try again'}[msg]??'Sign-in failed');history.replaceState(null,'',location.pathname+location.hash);}}

// ---- Play: map browser --------------------------------------------------------
const modesOf=m=>m.modes??[(m.mode??'explore').toLowerCase()];
const zombiesUrl=m=>m.dir?`play.html?map=${encodeURIComponent(m.id)}`:m.url;   // every zombies map runs in the one engine (engine.js)
const exploreUrl=m=>m.dir?`explorer.html?map=${encodeURIComponent(m.id)}`:m.url;
function art(el,m,hero=false){
  el.className=(hero?'hero-art':'art')+(m.image?'':' generated');
  if(m.image){el.style.backgroundImage=`linear-gradient(0deg,#050606cc,transparent 55%),url("${m.image}")`;el.textContent='';}
  else{
    let h=0;for(const c of m.id)h=(h*31+c.charCodeAt(0))%360;
    el.style.backgroundImage=`linear-gradient(135deg,hsl(${h} 30% 16%),hsl(${(h+40)%360} 22% 7%))`;el.textContent=m.title;
  }
}
let filter='all',selectedMap=store.get('kino.menu.map')??mapList[0]?.id;
function best(m){const v=store.get(m.id==='kino'?'kino.best':'kino.best.'+m.id);return v?+v:0;}
function renderHero(){
  const m=mapList.find(m=>m.id===selectedMap)??mapList[0];if(!m)return;
  art($('hero-art'),m,true);
  $('hero-badges').innerHTML=modesOf(m).map(x=>`<span class="badge ${x}">${x.toUpperCase()}</span>`).join('')+(m.dir?'<span class="badge">CUSTOM</span>':'');
  $('hero-title').textContent=m.title;$('hero-desc').textContent=m.description??'';
  $('hero-best').textContent=modesOf(m).includes('zombies')&&best(m)?`Best: round ${best(m)}`:'';
  const actions=[];
  if(modesOf(m).includes('zombies')){const u=zombiesUrl(m);actions.push(`<a class="play-btn" href="${esc(u)}">PLAY ZOMBIES <span>→</span></a>`,`<a class="play-btn secondary" href="${esc(u+(u.includes('?')?'&':'?')+'mp=host')}">HOST CO-OP GAME <span>+</span></a>`);}
  if(modesOf(m).includes('explore'))actions.push(`<a class="play-btn ${actions.length?'secondary':''}" href="${esc(exploreUrl(m))}">EXPLORE THE MAP <span>→</span></a>`);
  $('hero-actions').innerHTML=actions.join('');
}
function renderMaps(){
  const grid=$('map-grid');grid.innerHTML='';
  for(const m of mapList.filter(m=>filter==='all'||modesOf(m).includes(filter))){
    const card=document.createElement('button');card.className='map-card'+(m.id===selectedMap?' active':'');
    card.innerHTML=`<div class="art"></div><div class="meta"><div class="badges">${modesOf(m).map(x=>`<span class="badge ${x}">${x.toUpperCase()}</span>`).join('')}</div><strong>${esc(m.title)}</strong></div>`;
    art(card.querySelector('.art'),m);
    card.addEventListener('click',()=>{selectedMap=m.id;store.set('kino.menu.map',m.id);renderMaps();renderHero();});
    card.addEventListener('dblclick',()=>{location.href=modesOf(m).includes('zombies')?zombiesUrl(m):exploreUrl(m);});
    grid.append(card);
  }
}
// Join a friend's co-op game by its room code.
$('join-form').addEventListener('submit',async e=>{
  e.preventDefault();const code=$('join-code').value.trim().toUpperCase();if(!/^[A-Z]{4}$/.test(code)){toast('Room codes are 4 letters');return;}
  try{const r=await fetch('/api/rooms/'+code);const room=await r.json();if(!r.ok)throw new Error(room.error);
    if(room.players>=room.max)throw new Error('That game is full');
    location.href=room.page+(room.page.includes('?')?'&':'?')+'room='+code;}catch(error){toast(error.message||'Could not join');}
});
for(const b of document.querySelectorAll('#map-filter button'))b.addEventListener('click',()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('#map-filter button'))x.classList.toggle('active',x===b);renderMaps();});

// ---- Weapon thumbnails ---------------------------------------------------------
// One offscreen renderer draws each weapon's world model once; results are cached.
const thumbs=new Map(),thumbWaiters=new Map();
const thumbRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
thumbRenderer.setSize(320,150);thumbRenderer.outputColorSpace=THREE.SRGBColorSpace;thumbRenderer.toneMapping=THREE.ACESFilmicToneMapping;thumbRenderer.toneMappingExposure=1.5;
const thumbScene=new THREE.Scene();thumbScene.add(new THREE.AmbientLight(0xffffff,1.6));
const tk=new THREE.DirectionalLight(0xfff1dc,2.4);tk.position.set(.3,1,1.4);thumbScene.add(tk);const tr=new THREE.DirectionalLight(0xa9c0d8,1.2);tr.position.set(-1,.4,-.6);thumbScene.add(tr);
const thumbCamera=new THREE.PerspectiveCamera(22,320/150,.1,5000);
let thumbQueue=Promise.resolve();
function thumb(id){
  if(thumbs.has(id))return Promise.resolve(thumbs.get(id));
  if(!thumbWaiters.has(id))thumbWaiters.set(id,thumbQueue=thumbQueue.then(async()=>{
    const def=weapons[id]??data.equipment?.[id];let url='';
    try{
      const model=await loadModel(def?.worldModel);
      if(model){
        for(const tag of def.hideTags??[]){const bone=model.getObjectByName(tag);if(bone)bone.scale.setScalar(1e-6);}
        if(def.glow)tickGlow(applyGlow(model,def.glow,{depthTest:true}),1);   // BO3 mod guns' lights, as in game
        const pivot=new THREE.Group();pivot.add(model);pivot.rotation.set(.12,-.35,0);thumbScene.add(pivot);pivot.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(pivot),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
        pivot.position.sub(center);const span=Math.max(size.x/thumbCamera.aspect,size.y,size.z*.6);
        thumbCamera.position.set(0,0,span/(2*Math.tan(THREE.MathUtils.degToRad(thumbCamera.fov/2)))*1.08);thumbCamera.lookAt(0,0,0);
        thumbRenderer.render(thumbScene,thumbCamera);url=thumbRenderer.domElement.toDataURL('image/png');pivot.removeFromParent();
      }
    }catch(error){console.warn('thumbnail',id,error);}
    thumbs.set(id,url);return url;
  }));
  return thumbWaiters.get(id);
}
function fillThumb(el,id){if(!id){el.style.backgroundImage='';return;}thumb(id).then(url=>{if(el.dataset.weapon===id&&url)el.style.backgroundImage=`url(${url})`;});el.dataset.weapon=id;}

// ---- Loadout ----------------------------------------------------------------------
let gunsmith=null,camoCats=null;
loadCamos(new URL('mods/weapon-levels/',document.baseURI)).then(c=>{camoCats=c;renderLoadout();}).catch(()=>{});
// Weapon classes, Black Ops style: the picker shows one class at a time.
const classOf=id=>classOfIn(weapons,id);
const activeClass={};
const gunsmithHas=id=>gunsmith&&weapons[id]&&(Object.keys(weapons[id].mounts??{}).length>0||weapons[id].statAttachments?.length>0   // imported guns: mounted / stat-only attachments
  ||gunsmith.attachments.some(a=>a.tags.some(t=>(weapons[id].hideTags??[]).includes(t))));
// Opened from the loadout: the arrows go through every gun with attachments,
// loadout guns first, so box and wall guns can be set up before you find them
// (attachments are saved per gun and apply however you get it).
function openLoadoutGunsmith(id){
  const l=validLoadout(config,profile,weapons),own=[l.primary,l.secondary].filter(w=>w&&gunsmithHas(w));
  const ids=[...own,...Object.keys(weapons).filter(w=>!own.includes(w)&&!w.includes('upgraded')&&gunsmithHas(w))];
  openGunsmith({cat:gunsmith,weapons,profile,id,ids:ids.includes(id)?ids:[id],label:w=>w===l.primary?'PRIMARY':w===l.secondary?'SECONDARY':'BOX / WALL GUN',
    onChange:()=>save(),onClose:()=>{focus={id,isWeapon:true};renderLoadout();}});
}
loadGunsmith(new URL('mods/weapon-levels/',document.baseURI)).then(c=>{gunsmith=c;const st=document.createElement('style');st.textContent=GUNSMITH_CSS;document.head.append(st);renderLoadout();}).catch(e=>console.warn('[gunsmith]',e));
const slots=[{key:'primary',label:'PRIMARY'},{key:'secondary',label:'SECONDARY'},{key:'tactical',label:'TACTICAL'},{key:'bonus0',label:'BONUS 1'},{key:'bonus1',label:'BONUS 2'}];
let activeSlot='primary',focus=null;
const weaponList=()=>config.weapons.filter(w=>weapons[w.id]);
function slotState(key,u,l){
  if(key==='primary')return {value:l.primary};
  if(key==='secondary')return u.secondary?{value:l.secondary}:{locked:`Unlocks at level ${config.secondaryLevel}`};
  if(key==='tactical')return u.tacticalSlot?{value:l.tactical}:{locked:`Unlocks at level ${config.tacticalLevel}`};
  const i=+key.slice(5);return i<u.bonusSlots?{value:l.bonuses[i]??''}:{locked:`Unlocks at level ${config.secondBonusLevel}`};
}
function renderLoadout(){
  const u=unlocks(config,profile.level,weapons),l=validLoadout(config,profile,weapons);
  if(slotState(activeSlot,u,l).locked)activeSlot='primary';
  $('slots').innerHTML='';
  for(const s of slots){
    const st=slotState(s.key,u,l),isTac=s.key==='tactical',isWeapon=!s.key.startsWith('bonus')&&!isTac,el=document.createElement('button');
    el.className='slot'+(s.key===activeSlot?' active':'')+(st.locked?' locked':'');
    const name=st.locked?'Locked':isWeapon?(st.value?weapons[st.value].name:'None'):isTac?(st.value?tacById[st.value].name:'None'):(st.value?bonusById[st.value].name:'None');
    const sub=st.locked??(isWeapon?'':isTac?(st.value?'':'No tactical'):st.value?bonusById[st.value].description:'No bonus equipped');
    const canMod=isWeapon&&!st.locked&&st.value&&gunsmith&&gunsmithHas(st.value);
    el.innerHTML=`<span class="label">${s.label}</span>${isWeapon||isTac&&st.value?'<div class="thumb"></div>':''}<strong>${esc(name)}</strong>${sub?`<small>${esc(sub)}</small>`:''}${canMod?'<span class="slot-gs">GUNSMITH  ›</span>':''}`;
    if(isWeapon||isTac&&st.value)fillThumb(el.querySelector('.thumb'),st.locked?'':st.value);
    el.addEventListener('click',e=>{if(st.locked){toast(st.locked);return;}if(e.target.closest('.slot-gs')){openLoadoutGunsmith(st.value);return;}activeSlot=s.key;focus=null;renderLoadout();});
    $('slots').append(el);
  }
  renderPicker(u,l);
}
function renderPicker(u,l){
  const grid=$('picker-grid');grid.innerHTML='';
  const isTac=activeSlot==='tactical',isWeapon=!activeSlot.startsWith('bonus')&&!isTac,current=slotState(activeSlot,u,l).value??'';
  $('picker-title').textContent={primary:'PRIMARY WEAPON',secondary:'SECONDARY WEAPON',tactical:'TACTICAL',bonus0:'BONUS',bonus1:'SECOND BONUS'}[activeSlot];
  $('picker-hint').textContent=isWeapon?`${u.weapons.length} / ${weaponList().length} unlocked`:isTac?`${u.tactical.length} / ${tacList().length} unlocked`:`${u.bonuses.length} / ${config.bonuses.length} unlocked`;
  let options=isWeapon?weaponList().map(w=>({id:w.id,level:w.level})):isTac?tacList().map(t=>({id:t.id,level:t.level})):config.bonuses.map(b=>({id:b.id,level:b.level}));
  // weapon class tabs (only classes with guns in the list)
  const cats=$('picker-cats');cats.innerHTML='';cats.hidden=!isWeapon;
  if(isWeapon){
    const present=CLASSES.filter(c=>options.some(o=>classOf(o.id)===c[0]));
    let cur=activeClass[activeSlot]??(current&&classOf(current))??present[0]?.[0];if(!present.some(c=>c[0]===cur))cur=present[0]?.[0];activeClass[activeSlot]=cur;
    for(const [key,label] of present){const all=options.filter(o=>classOf(o.id)===key),open=all.filter(o=>u.weapons.includes(o.id)).length;
      const b=document.createElement('button');b.className='cat'+(key===cur?' on':'');b.innerHTML=`${label}<small>${open}/${all.length}</small>`;
      b.addEventListener('click',()=>{activeClass[activeSlot]=key;renderLoadout();});cats.append(b);}
    options=options.filter(o=>classOf(o.id)===cur);
  }
  if(activeSlot!=='primary')options.unshift({id:'',level:1});
  for(const o of options){
    const unlocked=!o.id||(isWeapon?u.weapons:isTac?u.tactical:u.bonuses).includes(o.id);
    const other=activeSlot==='primary'?l.secondary:activeSlot==='secondary'?l.primary:l.bonuses[activeSlot==='bonus0'?1:0];
    const el=document.createElement('button');el.className='opt'+(isWeapon||isTac?'':' bonus')+(o.id===current?' selected':'')+(unlocked?'':' locked');
    if(isWeapon){const d=weapons[o.id];
      el.innerHTML=o.id?`<div class="thumb"></div><strong>${esc(d.name)}</strong><div class="badges">${weaponBadges(o.id)}</div>`:`<div class="thumb"></div><strong>None</strong><small>Start with one weapon</small>`;if(o.id)fillThumb(el.querySelector('.thumb'),o.id);}
    else if(isTac){el.innerHTML=o.id?`<div class="thumb"></div><strong>${esc(tacById[o.id].name)}</strong><small>${esc(tacById[o.id].description)}</small>`:`<div class="thumb"></div><strong>None</strong><small>No tactical</small>`;if(o.id)fillThumb(el.querySelector('.thumb'),o.id);}
    else el.innerHTML=o.id?`<strong>${esc(bonusById[o.id].name)}</strong><small>${esc(bonusById[o.id].description)}</small>`:'<strong>None</strong><small>No bonus</small>';
    if(!unlocked)el.insertAdjacentHTML('beforeend',`<span class="lock">LV ${o.level}</span>`);
    el.addEventListener('mouseenter',()=>isTac?renderTactical(o.id,unlocked):renderDetail(o.id,isWeapon,unlocked,o.level));
    // hovering previews; leaving goes back to the weapon actually in the slot (with its Gunsmith)
    el.addEventListener('mouseleave',()=>{const now=slotState(activeSlot,unlocks(config,profile.level,weapons),validLoadout(config,profile,weapons)).value??'';isTac?renderTactical(now,true):renderDetail(now,isWeapon,true,1);});
    el.addEventListener('click',()=>{
      if(!unlocked){toast(`Reach level ${o.level} to unlock`);return;}
      if(o.id&&o.id===other){toast('Already in your other slot');return;}
      const lo=profile.loadout;
      if(activeSlot==='primary')lo.primary=o.id;else if(activeSlot==='secondary')lo.secondary=o.id;else if(isTac)lo.tactical=o.id;
      else{const b=[...l.bonuses];b[activeSlot==='bonus0'?0:1]=o.id;lo.bonuses=b.filter(Boolean);}
      focus={id:o.id,isWeapon};save();renderLoadout();
    });
    grid.append(el);
  }
  if(isTac)renderTactical(current,true);else renderDetail(current,isWeapon,true,1);
}
// Tactical slot: Monkey Bombs, Gersh Device, QED (the latter two from the moon-equipment mod)
const tacById=Object.fromEntries((config.tactical??[]).map(t=>[t.id,t]));
const tacList=()=>(config.tactical??[]).filter(t=>data.equipment?.[t.id]);
function renderTactical(id,unlocked){
  const el=$('detail');
  if(!id){el.innerHTML='<h2>None</h2><p class="muted">Start without a tactical. You can still buy or find one in game.</p>';return;}
  const t=tacById[id];el.innerHTML=`<div class="thumb"></div><span class="eyebrow">TACTICAL</span><h2>${esc(t.name)}</h2><p>${esc(t.description)}</p><p>3 per game · X to throw · Max Ammo refills them</p><p class="muted">Unlocks at level ${t.level}${unlocked?'':' · locked'}</p>`;
  fillThumb(el.querySelector('.thumb'),id);
}
// weapon level and camo progress on a weapon card
function weaponBadges(id){
  const d=weapons[id],out=[];
  if(gunsmith&&gunsmithHas(id)){const p=weaponProgress(profile,id),cap=maxLevel(gunsmith,d,id);out.push(`<span class="b lv">LV ${p.level}${p.level>=cap?' MAX':''}</span>`);}
  if(camoCats){const n=camoUnlocked(camoCats,profile,id,weapons).size;if(n)out.push(`<span class="b camo">CAMO ${n}/${camoCats.camos.length}</span>`);}
  return out.join('');
}
const bar=(label,value,max,shown)=>`<div class="stat"><span>${label}</span><span class="track"><i style="width:${Math.max(3,Math.min(100,100*value/max)).toFixed(0)}%"></i></span><b>${shown}</b></div>`;
function renderDetail(id,isWeapon,unlocked,level){
  const el=$('detail');
  if(!id){el.innerHTML=`<h2>None</h2><p class="muted">${isWeapon?'Leave this slot empty.':'No bonus in this slot.'}</p>`;return;}
  if(!isWeapon){const b=bonusById[id];el.innerHTML=`<span class="eyebrow">BONUS</span><h2>${esc(b.name)}</h2><p>${esc(b.description)}</p><p class="muted">Unlocks at level ${b.level}${unlocked?'':' · locked'}</p>`;return;}
  const d=weapons[id],rpm=Math.round(60/Math.max(.02,d.fireTime)),pellets=Math.max(1,d.pellets);
  el.innerHTML=`<div class="thumb"></div><span class="eyebrow">${esc(weaponClass(d).toUpperCase())}</span><h2>${esc(d.name)}</h2>
    ${bar('DAMAGE',Math.log10(Math.max(10,d.damage*pellets)),Math.log10(3000),Math.round(d.damage)+(pellets>1?'×'+pellets:''))}
    ${bar('FIRE RATE',rpm,1000,rpm)}${bar('MAGAZINE',d.clipSize,100,d.clipSize)}${bar('RESERVE',d.maxAmmo,600,d.maxAmmo)}${bar('RELOAD',1/Math.max(.3,d.reloadTime),1/.8,(d.reloadTime??0).toFixed(1)+'s')}
    <p>${d.upgrade?`Pack-a-Punch: <b>${esc(d.upgrade.name)}</b>`:'Cannot be upgraded'} · ${esc(d.fireType??'')}</p>
    <p class="muted">${unlocked?'Unlocked':'Unlocks at level '+(weaponLevel[id]??level)}${weapons[id].baseId?' · modded':''}</p><div class="gunsmith-slot"></div>`;
  fillThumb(el.querySelector('.thumb'),id);
  // Weapon levels and attachments (mods/weapon-levels).
  // Attachments are edited for the weapon in the selected slot only, not whatever is hovered.
  const inSlot=slotState(activeSlot,unlocks(config,profile.level,weapons),validLoadout(config,profile,weapons)).value;
  if(gunsmith&&id===inSlot)renderGunsmith(el.querySelector('.gunsmith-slot'),{cat:gunsmith,def:d,id,profile,onOpen:()=>openLoadoutGunsmith(id)});
}

// ---- Operator (character) --------------------------------------------------------------
const stage={active:false,running:false,speed:0,character:null,loading:0,yaw:.5,mode:'body',fpTime:0,view:null,viewToken:0,
  start(){if(this.running)return;this.running=true;this.last=performance.now();requestAnimationFrame(t=>this.frame(t));},
  frame(now){
    if(!this.active){this.running=false;return;}
    const dt=Math.min(.05,(now-this.last)/1000);this.last=now;
    const c=$('char-canvas'),w=c.clientWidth,h=c.clientHeight;
    if(this.renderer.domElement.width!==Math.floor(w*this.renderer.getPixelRatio())||this.renderer.domElement.height!==Math.floor(h*this.renderer.getPixelRatio())){this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
    if(!this.dragging)this.yaw+=dt*.25;
    if(this.mode==='fp'){
      this.viewCamera.aspect=w/h;this.viewCamera.updateProjectionMatrix();this.fpTime+=dt;
      if(this.view?.ready){this.view.update(dt,{moving:this.speed>0,sprint:this.speed>230,ads:false,reloading:false,empty:false,time:this.fpTime});this.fp?.sync(this.view);}
      if(this.view?.ready&&this.view.def?.glow)tickGlow(applyGlow(this.view.gun,this.view.def.glow),this.fpTime);
      this.renderer.render(this.viewScene,this.viewCamera);
    }else{
      if(this.character){this.character.root.rotation.y=this.yaw;this.character.update(dt,this.speed);}
      this.renderer.render(this.scene,this.camera);
    }
    requestAnimationFrame(t=>this.frame(t));
  },
};
stage.renderer=new THREE.WebGLRenderer({canvas:$('char-canvas'),antialias:true,alpha:true});
stage.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));stage.renderer.outputColorSpace=THREE.SRGBColorSpace;stage.renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.renderer.toneMappingExposure=1.3;
stage.scene=new THREE.Scene();stage.camera=new THREE.PerspectiveCamera(30,1,1,4000);stage.camera.position.set(0,52,190);stage.camera.lookAt(0,36,0);
stage.scene.add(new THREE.HemisphereLight(0xd8d2c4,0x2a1d17,1.6));
const key=new THREE.DirectionalLight(0xffe2bd,2.6);key.position.set(60,120,90);stage.scene.add(key);
const rim=new THREE.DirectionalLight(0xc2402f,2.2);rim.position.set(-90,60,-80);stage.scene.add(rim);
const floor=new THREE.Mesh(new THREE.CircleGeometry(60,48),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.35}));floor.rotation.x=-Math.PI/2;stage.scene.add(floor);
$('char-canvas').addEventListener('pointerdown',e=>{stage.dragging=true;stage.dragX=e.clientX;e.target.setPointerCapture(e.pointerId);});
$('char-canvas').addEventListener('pointermove',e=>{if(!stage.dragging)return;stage.yaw+=(e.clientX-stage.dragX)*.01;stage.dragX=e.clientX;});
$('char-canvas').addEventListener('pointerup',()=>{stage.dragging=false;});
// First-person preview: the character's arms holding the loadout's primary weapon.
stage.viewScene=new THREE.Scene();stage.viewScene.add(new THREE.AmbientLight(0xe1d9c7,2.8));{const l=new THREE.DirectionalLight(0xffefc8,2);l.position.set(0,4,2);stage.viewScene.add(l);}
stage.viewCamera=new THREE.PerspectiveCamera(60,1,.01,200);
let currentEntry=null;
async function showArms(entry){
  const token=++stage.viewToken;
  await tintArms(entry);
  const data={...baseData,weapons,characters:{...baseData.characters}};const url=armsUrl(entry);if(url)data.characters.viewmodel_usa_pow_arms=url;
  const view=new ViewWeapon(new THREE.Group(),data);
  await view.equip(weapons[validLoadout(config,profile,weapons).primary]??weapons.m1911_zm);
  if(token!==stage.viewToken)return;
  if(stage.view)stage.viewScene.remove(stage.view.pivot);stage.view=view;stage.viewScene.add(view.pivot);
  stage.fp?.dispose();stage.fp=entry.fpArms&&entry.type==='gltf'?new FirstPersonArms(stage.viewScene,await loadCharacterGltf(entry),entry):null;
}
for(const b of document.querySelectorAll('#char-view button'))b.addEventListener('click',()=>{
  stage.mode=b.dataset.view;for(const x of document.querySelectorAll('#char-view button'))x.classList.toggle('active',x===b);
  if(stage.mode==='fp'&&currentEntry)showArms(currentEntry);
});
for(const b of document.querySelectorAll('#char-anim button'))b.addEventListener('click',()=>{stage.speed=+b.dataset.speed;for(const x of document.querySelectorAll('#char-anim button'))x.classList.toggle('active',x===b);});
// Customisation: the operator's variant groups (characters.json `variants`) as chips; picks are
// saved per operator in profile.variants and shown live on the preview.
function renderVariants(entry){
  const box=$('char-variants'),groups=entry.variants??[];box.hidden=!groups.length;box.innerHTML='';if(!groups.length)return;
  const choice=entry.choice??{};
  box.innerHTML='<span class="eyebrow">CUSTOMISE</span>';
  for(const g of groups){
    const current=g.options.find(o=>o.id===choice[g.id])??g.options.find(o=>o.default)??g.options[0];
    const row=document.createElement('div');row.className='variant-row';
    row.innerHTML=`<span class="variant-label">${esc(g.label)}${g.note?`<small>${esc(g.note)}</small>`:''}</span><div class="chips"></div>`;
    for(const o of g.options){
      const b=document.createElement('button');b.textContent=o.label;b.classList.toggle('active',o===current);
      b.addEventListener('click',()=>{
        profile.variants={...profile.variants,[entry.id]:{...profile.variants?.[entry.id],[g.id]:o.id}};save();
        entry.choice=profile.variants[entry.id];renderVariants(entry);
        // Bone poses (a tail, an eye) change the rest pose the rig and spring bones captured: rebuild.
        if(g.options.some(x=>x.bones))showCharacter(entry);else if(stage.character)applyVariants(stage.character.root,entry);
        portraits.delete(entry.id);renderCharacters();
        if(stage.mode==='fp')showArms(entry);
      });
      row.querySelector('.chips').append(b);
    }
    box.append(row);
  }
}
async function showCharacter(entry){
  entry.choice=profile.variants?.[entry.id];renderVariants(entry);
  currentEntry=entry;if(stage.mode==='fp')showArms(entry);
  const token=++stage.loading;$('char-name').textContent=entry.name;$('char-desc').textContent=entry.description??'';
  $('char-credit').innerHTML=entry.credit?'Model: '+creditHtml(entry.credit):'';
  try{
    const c=await createCharacter(entry,baseData);if(token!==stage.loading){c.dispose();return;}
    stage.character?.dispose();stage.character=c;stage.scene.add(c.root);
  }catch(error){console.error(error);$('char-desc').textContent='Could not load this model: '+error.message;}
}
// Operators and skins (Black Ops 7 style): the operators on the left, the selected operator's
// skins in a strip under the stage. A skin is its own characters.json entry with
// "skinOf": "<operator id>" and "skinName"; the operator entry is its default skin. The
// equipped skin is profile.character; profile.skins remembers each operator's last skin.
const portraits=new Map();let portraitQueue=Promise.resolve();
function portrait(entry,img){
  if(!portraits.has(entry.id))portraits.set(entry.id,portraitQueue=portraitQueue.then(()=>{entry.choice??=profile.variants?.[entry.id];return renderPortrait(entry,baseData,192);}).catch(()=>null));
  portraits.get(entry.id).then(url=>{if(url&&img.isConnected)img.src=url;});
}
const operatorOf=c=>characters.find(o=>o.id===c?.skinOf)??c;
const skinsOf=op=>[op,...characters.filter(c=>c.skinOf===op.id)];
function equip(c){
  const op=operatorOf(c);profile.character=c.id;profile.skins={...profile.skins,[op.id]:c.id};save();renderCharacters();showCharacter(c);
  toast(op.name+(c.skinOf||skinsOf(op).length>1?' · '+(c.skinName??'Default'):'')+' equipped');
}
function card(c,label,sub,active,onClick,cls){
  const el=document.createElement('button');el.className=cls+(active?' active':'');
  el.innerHTML=`<span class="thumb" style="--a:${esc(c.accent??'#3a3a36')};--b:${esc(c.color??'#12110f')}"><img alt=""></span><span class="label"><strong>${esc(label)}</strong><small>${sub}</small></span>`;
  el.addEventListener('click',onClick);portrait(c,el.querySelector('img'));return el;
}
function renderCharacters(){
  const list=$('char-list');list.innerHTML='';
  const current=characters.find(c=>c.id===profile.character)??characters[0],currentOp=operatorOf(current);
  for(const op of characters.filter(c=>!c.skinOf)){
    const skins=skinsOf(op),shown=skins.find(s=>s.id===(op===currentOp?current.id:profile.skins?.[op.id]))??op;
    const sub=`${op.type==='mannequin'?'PLACEHOLDER':op.type==='t5'?'GAME MODEL':'CUSTOM MODEL'}${skins.length>1?' · '+skins.length+' SKINS':''}`;
    list.append(card(shown,op.name,sub,op===currentOp,()=>{if(op!==currentOp)equip(shown);},'char-card'));
  }
  if(!characters.length)list.innerHTML='<p class="muted small">No characters registered (mods/characters/characters.json).</p>';
  const row=$('char-skins');row.innerHTML='';
  if(currentOp){
    const skins=skinsOf(currentOp);$('skin-count').textContent=skins.length+(skins.length===1?' skin':' skins');
    for(const s of skins)row.append(card(s,s.skinName??'Default',s===current?'EQUIPPED':s===currentOp?'DEFAULT':s.credit?'BY '+esc(s.credit.author).toUpperCase():'&nbsp;',s===current,()=>{if(s!==current)equip(s);},'skin-card'));
  }
  if(current&&!stage.character)showCharacter(current);
}

// Preview a local model file before adding it to characters.json.
$('char-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  if(/\.gltf$/i.test(file.name))toast('A .gltf with separate files may not load here. Export as .glb if it fails.');
  const id=file.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'my_character';
  const entry={id,name:file.name.replace(/\.[^.]+$/,''),type:'gltf',url:URL.createObjectURL(file),description:'Previewing '+file.name};
  const token=++stage.loading;$('char-name').textContent=entry.name;$('char-desc').textContent='Loading…';
  const report=$('char-report');report.hidden=false;report.innerHTML='Loading…';
  try{
    const c=await createCharacter(entry,baseData);if(token!==stage.loading){c.dispose();return;}
    stage.character?.dispose();stage.character=c;stage.scene.add(c.root);$('char-desc').textContent=entry.description;
    const m=c.matched,have=Object.entries(m).filter(([,v])=>v);
    report.innerHTML=`<b>${esc(file.name)}</b> · ${c.clips.length} animation${c.clips.length===1?'':'s'}${c.clips.length?': '+c.clips.map(esc).join(', '):''}<br>`+
      ['idle','walk','run'].map(k=>m[k]?`${k.toUpperCase()} → ${esc(m[k])}`:`<span class="bad">${k.toUpperCase()} → none (name a clip "${k}")</span>`).join('<br>')+
      `<br>If it faces the wrong way, add <b>"yaw": 180</b> (or 90 / -90).<br>Save it as <b>mods/characters/models/${esc(id)}.glb</b> and add this to <b>characters.json</b>:`+
      `<pre>${esc(JSON.stringify({id,name:entry.name,type:'gltf',model:`models/${id}.glb`,height:72,description:'My character'},null,0))}</pre>`;
    if(c.missing.length)report.innerHTML+=`<p class="bad">Missing textures (${c.missing.length}): ${esc(c.missing.slice(0,3).join(', '))}${c.missing.length>3?'…':''}. Export as .glb with textures embedded (Blender: Format glTF Binary).</p>`;
    if(!have.length&&c.clips.length===0)report.innerHTML+='<p class="bad">No animations: it will slide around in a fixed pose. Add Mixamo idle/walk/run clips in Blender.</p>';
  }catch(error){console.error(error);report.innerHTML=`<span class="bad">Could not load ${esc(file.name)}: ${esc(error.message)}</span>`;$('char-desc').textContent='';}
  e.target.value='';
});

// ---- Credits -------------------------------------------------------------------
// Third-party assets carry a "credit" object ({title, author, authorUrl, source,
// license, licenseUrl}); CC-BY and similar licences require showing it.
const link=(text,url)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`:esc(text);
const creditHtml=c=>`"${link(c.title,c.source)}" by ${link(c.author,c.authorUrl)}, licensed under ${link(c.license,c.licenseUrl)}`;
function renderCredits(){
  const items=[...characters.filter(c=>c.credit).map(c=>({what:'Operator · '+c.name,credit:c.credit})),...mapList.filter(m=>m.credit).map(m=>({what:'Map · '+m.title,credit:m.credit}))];
  $('credit-list').innerHTML=items.map(i=>`<li><strong>${esc(i.what)}</strong><span>This work is based on ${creditHtml(i.credit)}.</span></li>`).join('')+
    '<li><strong>Kino der Toten browser Zombies</strong><span>Original project by '+link('Luckey Faraday','https://github.com/luckeyfaraday/kino-der-toten')+' (code under the MIT licence).</span></li>'+
    '<li><strong>Call of Duty: Black Ops assets</strong><span>Maps, models, sounds and animations remain the property of Activision / Treyarch. Unofficial, non-commercial fan project.</span></li>';
}

// ---- Mods ---------------------------------------------------------------------------
function renderMods(){
  $('mod-list').innerHTML=mods.map(m=>m.error?`<div class="mod error"><strong>${esc(m.id)}</strong><p>${esc(m.error)}</p></div>`
    :`<div class="mod"><strong>${esc(m.manifest.name??m.id)}</strong><p>${esc(m.manifest.description??'')}</p><code>mods/${esc(m.id)}/ · ${[m.manifest.data&&'data',m.manifest.script&&'script'].filter(Boolean).join(' + ')||'empty'}</code></div>`).join('')
    ||'<p class="muted">No mods enabled.</p>';
}

renderProfile();renderMaps();renderHero();renderLoadout();renderCharacters();renderMods();renderCredits();
showTab(['play','armory','career','mods','settings',...Object.keys(PANES)].includes(location.hash.slice(1))?location.hash.slice(1):'play');
window.menu={profile:()=>profile,thumb,showTab,stage};

// ---- Classes (mods/classes): skill trees; progress in its own storage key ------------------
try{
  const classCfg=await loadClasses(new URL('mods/classes/',document.baseURI));
  const style=document.createElement('style');style.textContent=CLASS_CSS;document.head.append(style);
  const view=renderClasses($('classes-root'),classCfg,{getState:()=>loadClassProfile(classCfg),setState:s=>saveClassProfile(s)});
  addEventListener('focus',()=>view.redraw());
}catch(error){console.warn('[classes]',error);$('classes-root').textContent='Classes unavailable: '+error.message;}

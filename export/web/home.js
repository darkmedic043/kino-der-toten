// Main menu (not part of upstream): map browser, loadout, character and mods.
import * as THREE from 'three';
import { loadModel, ViewWeapon } from './animation.js';
import { renderSettings } from './settings.js';
import { mergePatch, resolveWeapons } from './mod-loader.js';
import { loadProfile, saveProfile, loadProgression, xpToNext, unlocks, validLoadout, cloudReady } from './profile.js';
import { getAccount, onAccountChange, renderGoogleButton, signOut } from './cloud.js';
import { loadCharacterRegistry, createCharacter, armsUrl, tintArms, loadCharacterGltf } from './characters.js';
import { FirstPersonArms } from './fp-arms.js';

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
let data={weapons:baseData.weapons,boxPool:baseData.boxPool};
for(const m of mods)for(const file of [m.manifest?.data??[]].flat()){try{data=mergePatch(data,await fetchJson(`mods/${m.id}/${file}`));}catch{}}
try{resolveWeapons(data);}catch{}
const weapons=data.weapons,bonusById=Object.fromEntries(config.bonuses.map(b=>[b.id,b]));
const weaponLevel=Object.fromEntries(config.weapons.map(w=>[w.id,w.level]));
await cloudReady;
let profile=loadProfile();
const save=()=>{saveProfile(profile);renderProfile();};
addEventListener('focus',()=>{profile=loadProfile();renderProfile();renderLoadout();});

// ---- Tabs -------------------------------------------------------------------
const tabs=[...document.querySelectorAll('#tabs button')];
function showTab(name){
  for(const b of tabs)b.classList.toggle('active',b.dataset.tab===name);
  for(const s of document.querySelectorAll('.tab'))s.classList.toggle('active',s.id==='tab-'+name);
  if(location.hash!=='#'+name)history.replaceState(null,'','#'+name);
  stage.active=name==='character';if(stage.active)stage.start();
}
for(const b of tabs)b.addEventListener('click',()=>showTab(b.dataset.tab));
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
    el.innerHTML='<p class="small muted">Sign in to save progress online and play on any device.</p><div id="g-button"></div>';
    renderGoogleButton($('g-button'));
  }
}
// Signing in may pull a newer profile from the server; reload to show it.
onAccountChange(a=>{if(a.signedIn&&!wasSignedIn){location.reload();return;}wasSignedIn=a.signedIn;renderAccount();});
renderAccount();

// ---- Play: map browser --------------------------------------------------------
const modesOf=m=>m.modes??[(m.mode??'explore').toLowerCase()];
const zombiesUrl=m=>m.dir?`zombies.html?map=${encodeURIComponent(m.id)}`:m.url;
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
  if(modesOf(m).includes('zombies'))actions.push(`<a class="play-btn" href="${esc(zombiesUrl(m))}">PLAY ZOMBIES <span>→</span></a>`);
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
    const def=weapons[id];let url='';
    try{
      const model=await loadModel(def?.worldModel);
      if(model){
        for(const tag of def.hideTags??[]){const bone=model.getObjectByName(tag);if(bone)bone.scale.setScalar(1e-6);}
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
const slots=[{key:'primary',label:'PRIMARY'},{key:'secondary',label:'SECONDARY'},{key:'bonus0',label:'BONUS 1'},{key:'bonus1',label:'BONUS 2'}];
let activeSlot='primary',focus=null;
const weaponList=()=>config.weapons.filter(w=>weapons[w.id]);
function slotState(key,u,l){
  if(key==='primary')return {value:l.primary};
  if(key==='secondary')return u.secondary?{value:l.secondary}:{locked:`Unlocks at level ${config.secondaryLevel}`};
  const i=+key.slice(5);return i<u.bonusSlots?{value:l.bonuses[i]??''}:{locked:`Unlocks at level ${config.secondBonusLevel}`};
}
function renderLoadout(){
  const u=unlocks(config,profile.level,weapons),l=validLoadout(config,profile,weapons);
  if(slotState(activeSlot,u,l).locked)activeSlot='primary';
  $('slots').innerHTML='';
  for(const s of slots){
    const st=slotState(s.key,u,l),isWeapon=!s.key.startsWith('bonus'),el=document.createElement('button');
    el.className='slot'+(s.key===activeSlot?' active':'')+(st.locked?' locked':'');
    const name=st.locked?'Locked':isWeapon?(st.value?weapons[st.value].name:'None'):(st.value?bonusById[st.value].name:'None');
    const sub=st.locked??(isWeapon?'':st.value?bonusById[st.value].description:'No bonus equipped');
    el.innerHTML=`<span class="label">${s.label}</span>${isWeapon?'<div class="thumb"></div>':''}<strong>${esc(name)}</strong>${sub?`<small>${esc(sub)}</small>`:''}`;
    if(isWeapon)fillThumb(el.querySelector('.thumb'),st.locked?'':st.value);
    el.addEventListener('click',()=>{if(st.locked){toast(st.locked);return;}activeSlot=s.key;focus=null;renderLoadout();});
    $('slots').append(el);
  }
  renderPicker(u,l);
}
function renderPicker(u,l){
  const grid=$('picker-grid');grid.innerHTML='';
  const isWeapon=!activeSlot.startsWith('bonus'),current=slotState(activeSlot,u,l).value??'';
  $('picker-title').textContent={primary:'PRIMARY WEAPON',secondary:'SECONDARY WEAPON',bonus0:'BONUS',bonus1:'SECOND BONUS'}[activeSlot];
  $('picker-hint').textContent=isWeapon?`${u.weapons.length} / ${weaponList().length} unlocked`:`${u.bonuses.length} / ${config.bonuses.length} unlocked`;
  const options=isWeapon?weaponList().map(w=>({id:w.id,level:w.level})):config.bonuses.map(b=>({id:b.id,level:b.level}));
  if(activeSlot!=='primary')options.unshift({id:'',level:1});
  for(const o of options){
    const unlocked=!o.id||(isWeapon?u.weapons:u.bonuses).includes(o.id);
    const other=activeSlot==='primary'?l.secondary:activeSlot==='secondary'?l.primary:l.bonuses[activeSlot==='bonus0'?1:0];
    const el=document.createElement('button');el.className='opt'+(isWeapon?'':' bonus')+(o.id===current?' selected':'')+(unlocked?'':' locked');
    if(isWeapon){const d=weapons[o.id];el.innerHTML=o.id?`<div class="thumb"></div><strong>${esc(d.name)}</strong><small>${esc(weaponClass(d))}</small>`:`<div class="thumb"></div><strong>None</strong><small>Start with one weapon</small>`;if(o.id)fillThumb(el.querySelector('.thumb'),o.id);}
    else el.innerHTML=o.id?`<strong>${esc(bonusById[o.id].name)}</strong><small>${esc(bonusById[o.id].description)}</small>`:'<strong>None</strong><small>No bonus</small>';
    if(!unlocked)el.insertAdjacentHTML('beforeend',`<span class="lock">LV ${o.level}</span>`);
    el.addEventListener('mouseenter',()=>renderDetail(o.id,isWeapon,unlocked,o.level));
    el.addEventListener('click',()=>{
      if(!unlocked){toast(`Reach level ${o.level} to unlock`);return;}
      if(o.id&&o.id===other){toast('Already in your other slot');return;}
      const lo=profile.loadout;
      if(activeSlot==='primary')lo.primary=o.id;else if(activeSlot==='secondary')lo.secondary=o.id;
      else{const b=[...l.bonuses];b[activeSlot==='bonus0'?0:1]=o.id;lo.bonuses=b.filter(Boolean);}
      focus={id:o.id,isWeapon};save();renderLoadout();
    });
    grid.append(el);
  }
  const f=focus??{id:current,isWeapon};renderDetail(f.id,f.isWeapon,true,1);
}
function weaponClass(d){
  const b=d.baseId??d.id;
  if(/ray_gun|thundergun/.test(b))return 'Wonder weapon';if(d.projectileSpeed>0||d.explosionRadius)return 'Launcher';if(d.pellets>1)return 'Shotgun';
  if(/l96|dragunov/.test(b))return 'Sniper rifle';if(/hk21|rpk/.test(b))return 'Light machine gun';if(/m1911|python|cz75/.test(b))return 'Pistol';
  if(/mp40|mp5k|mpl|pm63|ak74u|spectre|g11/.test(b))return 'Submachine gun';return 'Rifle';
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
    <p class="muted">${unlocked?'Unlocked':'Unlocks at level '+(weaponLevel[id]??level)}${weapons[id].baseId?' · modded':''}</p>`;
  fillThumb(el.querySelector('.thumb'),id);
}

// ---- Character ---------------------------------------------------------------------
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
async function showCharacter(entry){
  currentEntry=entry;if(stage.mode==='fp')showArms(entry);
  const token=++stage.loading;$('char-name').textContent=entry.name;$('char-desc').textContent=entry.description??'';
  $('char-credit').innerHTML=entry.credit?'Model: '+creditHtml(entry.credit):'';
  try{
    const c=await createCharacter(entry,baseData);if(token!==stage.loading){c.dispose();return;}
    stage.character?.dispose();stage.character=c;stage.scene.add(c.root);
  }catch(error){console.error(error);$('char-desc').textContent='Could not load this model: '+error.message;}
}
function renderCharacters(){
  const list=$('char-list');list.innerHTML='';
  const current=characters.find(c=>c.id===profile.character)??characters[0];
  for(const c of characters){
    const el=document.createElement('button');el.className='char-card'+(c===current?' active':'');
    el.innerHTML=`<span class="swatch" style="--a:${esc(c.accent??'#3a3a36')};--b:${esc(c.color??'#12110f')}"></span><span><strong>${esc(c.name)}</strong><small>${c.type==='mannequin'?'PLACEHOLDER':c.type==='t5'?'GAME MODEL':'CUSTOM MODEL'}${c.credit?' · BY '+esc(c.credit.author).toUpperCase():''}</small></span>`;
    el.addEventListener('click',()=>{profile.character=c.id;save();renderCharacters();showCharacter(c);toast(c.name+' selected');});
    list.append(el);
  }
  if(!characters.length)list.innerHTML='<p class="muted small">No characters registered (mods/characters/characters.json).</p>';
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
  const items=[...characters.filter(c=>c.credit).map(c=>({what:'Character · '+c.name,credit:c.credit})),...mapList.filter(m=>m.credit).map(m=>({what:'Map · '+m.title,credit:m.credit}))];
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
showTab(['play','loadout','character','mods','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'play');
window.menu={profile:()=>profile,thumb,showTab,stage};

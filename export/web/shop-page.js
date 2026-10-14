// The Shop page (roadmap Phase 6, shop.html): spend credits on cosmetics. Featured (3 daily slots + the weekly bundle),
// seven categories, and Credits (challenges and the ledger). Select an item to preview it in the drawer, buy it (two
// clicks), equip it here or in the Armory (camos in the Gunsmith, outfits in the Operator pane). Rules: mods/shop/shop.js.
import * as THREE from 'three';
import { cloudReady } from './cloud.js';
import { loadModel } from './animation.js';
import { loadCatalog, loadShop, saveShop, itemById, slotOf, rotation, listed, buy, toggleEquip, installRewards } from './mods/shop/shop.js';
import { loadCredits, saveCredits, loadCreditsConfig, currentChallenges, challengeText, nextReset } from './mods/credits/credits.js';
import { loadCamos, camoTexture, applyCamo, camoTime } from './mods/weapon-levels/camo.js';
import { renderPortrait } from './characters.js';
import { cardSvg } from './mods/shop/card.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let toastT=0;function toast(t){const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2600);}

await cloudReady;installRewards();
const [cat,ccfg,camos,data,chars]=await Promise.all([loadCatalog(new URL('mods/shop/',location.href)),loadCreditsConfig(new URL('mods/credits/',location.href)),
  loadCamos(new URL('mods/weapon-levels/',location.href)),fetch('game-data.json').then(r=>r.json()),fetch('mods/characters/characters.json').then(r=>r.json())]);
const by=itemById(cat),rar=cat.rarities;
const camoOf=item=>camos.camos.find(c=>c.id===item.data?.camo);
const charOf=item=>chars.characters.find(c=>c.id===item.data?.character);
let view=location.hash.slice(1)||'featured',sel=null;

// ---- small previews ---------------------------------------------------------------------------------------------
const swatchCache=new Map();
function camoSwatch(c){if(!c)return '';if(swatchCache.has(c.id))return swatchCache.get(c.id);let url='';try{const img=camoTexture(c,new URL('mods/weapon-levels/camo.js',location.href)).image;url=img instanceof HTMLCanvasElement?img.toDataURL('image/jpeg',.75):img?.src??'';}catch{}swatchCache.set(c.id,url);return url;}
function thumb(item){
  const d=item.data??{};
  if(item.cat==='camo'){const c=camoOf(item);return `<div class="pv" style="background-image:url(${camoSwatch(c)})"></div>`;}
  if(item.cat==='card')return `<div class="pv">${cardSvg(d,'SURVIVOR','LEVEL 1')}</div>`;
  if(item.cat==='outfit'){const ch=charOf(item);return `<div class="pv" style="background:linear-gradient(135deg,${ch?.color} 0 55%,${ch?.accent} 55%)"></div>`;}
  if(d.char||d.hitmarker)return `<div class="pv" style="color:${d.color};font-size:46px">${esc(d.char??d.hitmarker)}</div>`;
  if(d.blood)return `<div class="pv" style="background:radial-gradient(circle,${d.blood} 0 18%,${d.blood}55 30%,transparent 55%),#111"></div>`;
  if(d.hud)return `<div class="pv" style="background:linear-gradient(90deg,${d.hud.points} 0 33%,${d.hud.round} 33% 66%,${d.hud.ring} 66%)"></div>`;
  if(d.menu||d.frame)return `<div class="pv" style="box-shadow:inset 0 0 0 6px ${d.menu??d.frame};background:#111"></div>`;
  if(d.box)return `<div class="pv" style="background:radial-gradient(circle,#fff 0 6%,${d.box} 12%,${d.box}33 35%,transparent 60%),#0a0a0a"></div>`;
  if(d.hits)return `<div class="pv" style="font-size:40px;color:#f0c060">♪</div>`;
  return '<div class="pv"></div>';
}
// a hit-sound sample: the hud mod's thump with the set's numbers
let actx=null;
function playHits(hs){
  actx??=new AudioContext();const c=actx,t0=c.currentTime;
  const thump=(t,{from,to,length,body,knock,knockCut})=>{from*=hs.pitch;to*=hs.pitch;knock*=hs.knock;knockCut*=hs.cut;
    const o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+length*.6);g.gain.setValueAtTime(body*.5,t);g.gain.exponentialRampToValueAtTime(.001,t+length);o.connect(g).connect(c.destination);o.start(t);o.stop(t+length);
    const n=c.createBufferSource(),b=c.createBuffer(1,c.sampleRate*.08,c.sampleRate),ch=b.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*(1-i/ch.length);n.buffer=b;
    const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=knockCut;const ng=c.createGain();ng.gain.value=knock*.4;n.connect(lp).connect(ng).connect(c.destination);n.start(t);};
  thump(t0,{from:170,to:65,length:.13,body:.95,knock:.55,knockCut:1500});thump(t0+.25,{from:230,to:90,length:.12,body:1,knock:.7,knockCut:2600});
  thump(t0+.5,{from:170,to:65,length:.13,body:.95,knock:.55,knockCut:1500});thump(t0+.55,{from:120,to:42,length:.22,body:1,knock:.35,knockCut:700});
}
// the camo drawer: a gun turning on a small renderer (one, reused)
let gl=null,gun=null,gunReady=null,spin=0;
async function gunPreview(el,camo){
  gl??=(()=>{const r=new THREE.WebGLRenderer({antialias:true,alpha:true});r.outputColorSpace=THREE.SRGBColorSpace;const scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff,0x332211,2.2));const k=new THREE.DirectionalLight(0xffffff,2.4);k.position.set(1,2,2);scene.add(k);
    const cam=new THREE.PerspectiveCamera(28,2,.1,5000);return {r,scene,cam};})();
  el.innerHTML='';el.append(gl.r.domElement);
  gunReady??=loadModel(data.weapons.m16_zm?.model??Object.values(data.weapons)[0].model).then(m=>{const box=new THREE.Box3().setFromObject(m),s=box.getSize(new THREE.Vector3());
    if(s.z>s.x)m.rotation.y=Math.PI/2;m.updateMatrixWorld(true);const b2=new THREE.Box3().setFromObject(m);m.position.sub(b2.getCenter(new THREE.Vector3()));
    gun=new THREE.Group();gun.add(m);gl.scene.add(gun);const sz=b2.getSize(new THREE.Vector3()).length();gl.cam.position.set(0,sz*.14,sz*1.55);gl.cam.lookAt(0,0,0);return gun;});
  await gunReady;applyCamo(gun,camo);
}
let lastT=performance.now();
(function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-lastT)/1000);lastT=now;camoTime.value+=dt;
  if(gl&&gun&&gl.r.domElement.isConnected){const el=gl.r.domElement.parentElement,w=el.clientWidth,h=el.clientHeight;if(gl.r.domElement.width!==Math.floor(w*devicePixelRatio)){gl.r.setPixelRatio(devicePixelRatio);gl.r.setSize(w,h,false);gl.cam.aspect=w/h;gl.cam.updateProjectionMatrix();}
    spin+=dt*.5;gun.rotation.y=Math.sin(spin)*.6;gl.r.render(gl.scene,gl.cam);}
  if(Math.floor(now/1000)!==Math.floor((now-dt*1000)/1000))header();})(lastT);

// ---- page ---------------------------------------------------------------------------------------------------------
const CATS=[{id:'featured',name:'Featured'},...cat.categories,{id:'credits',name:'Credits'}];
const fmtLeft=d=>{const s=Math.max(0,(d-Date.now())/1000);const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h>=24?`${Math.floor(h/24)}d ${h%24}h`:`${h}h ${m}m`;};
function header(){
  $('sp-balance').textContent=loadCredits().balance.toLocaleString();const r=rotation(cat);
  $('sp-daily').textContent=`DAILY ITEMS · NEW IN ${fmtLeft(r.dailyEnds)}`;$('sp-weekly').textContent=`WEEKLY BUNDLE · NEW IN ${fmtLeft(r.weeklyEnds)}`;
}
function card(item,{tag}={}){
  const s=loadShop(),owned=s.owned.includes(item.id),eq=Object.values(s.equip).includes(item.id);
  return `<button class="sp-item${owned?' owned':''}${sel===item.id?' sel':''}" data-id="${esc(item.id)}" style="--r:${rar[item.rarity]}">${thumb(item)}
    <span class="price">${item.price.toLocaleString()}</span>${owned||tag?`<span class="tag">${eq?'EQUIPPED':owned?'OWNED':tag}</span>`:''}<b>${esc(item.name)}</b><small>${item.rarity.toUpperCase()}</small></button>`;
}
function render(){
  const s=loadShop(),r=rotation(cat,s),unseen=c=>listed(cat,s).filter(i=>i.cat===c&&!s.seen.includes(i.id)).length;
  $('sp-cats').innerHTML=CATS.map(c=>`<button data-cat="${c.id}" class="${view===c.id?'on':''}">${esc(c.name.toUpperCase())}${cat.categories.some(x=>x.id===c.id)&&unseen(c.id)?'<span class="new">NEW</span>':''}</button>`).join('');
  $('sp-cats-select').innerHTML=CATS.map(c=>`<option value="${c.id}"${view===c.id?' selected':''}>${esc(c.name)}</option>`).join('');
  const body=$('sp-body');
  if(view==='featured'){
    const bundleOwned=r.bundle.every(i=>s.owned.includes(i.id));
    body.innerHTML=`<h2>TODAY <small>NEW IN ${fmtLeft(r.dailyEnds)}</small></h2><div class="sp-grid">${r.daily.map(i=>card(i,{tag:'TODAY'})).join('')}</div>
      <h2>WEEKLY BUNDLE <small>NEW IN ${fmtLeft(r.weeklyEnds)}</small></h2><div class="sp-bundle"><div class="row">${r.bundle.map(i=>card(i,{tag:'BUNDLE'})).join('')}</div>
      <div class="row"><span>All three for <b style="color:#f0c060">${r.bundlePrice.toLocaleString()}</b> credits (${Math.round((cat.bundle?.discount??.3)*100)}% off; anything you own is free)</span>
      <button class="buy" data-buy="bundle"${bundleOwned?' disabled':''} style="margin-left:auto;min-height:44px;padding:10px 18px;border:1px solid #f0c060;background:#f0c06018;color:#f0c060;font:700 12px/1 inherit;letter-spacing:2px;cursor:pointer">${bundleOwned?'OWNED':'BUY BUNDLE'}</button></div></div>`;
  }else if(view==='credits'){
    const c=loadCredits();currentChallenges(ccfg,c);saveCredits(c);
    const list=kind=>c.challenges[kind].list.map(ch=>`<div class="c${ch.done?' done':''}"><span>${esc(challengeText(ccfg,ch))}</span><small>+${ccfg[kind]}</small><div class="bar"><i style="width:${(100*ch.p/ch.n).toFixed(1)}%"></i></div><span class="muted small">${ch.done?'DONE':`${Math.floor(ch.p).toLocaleString()} / ${ch.n.toLocaleString()}`}</span></div>`).join('');
    body.innerHTML=`<h2>DAILY CHALLENGES <small>NEW IN ${fmtLeft(nextReset('daily'))}</small></h2><div class="sp-ch">${list('daily')}</div>
      <h2>WEEKLY CHALLENGES <small>NEW IN ${fmtLeft(nextReset('weekly'))}</small></h2><div class="sp-ch">${list('weekly')}</div>
      <h2>HOW TO EARN</h2><p class="muted small">A match pays ${ccfg.payout.perRoundOver5} per round past 5 and ${ccfg.payout.perKill} per kill (up to ${ccfg.payout.cap}); the first time you reach rounds ${Object.keys(ccfg.milestones).join(', ')} on a map pays ${Object.values(ccfg.milestones).join(' / ')}; weapon prestige pays ${ccfg.prestige[1]} / ${ccfg.prestige[2]} / ${ccfg.prestige[3]} and a player prestige ${ccfg.prestige.player}. Nothing is earned in a game where cheats were used.</p>
      <h2>RECENT</h2><div class="sp-ledger">${c.ledger.slice(0,20).map(l=>`<div><b class="${l.n<0?'neg':''}">${l.n>0?'+':''}${l.n.toLocaleString()}</b> · ${esc(l.why)} · ${new Date(l.t).toLocaleDateString()}</div>`).join('')||'<div>Nothing yet. Play a match.</div>'}</div>`;
  }else{
    const items=listed(cat,s).filter(i=>i.cat===view),today=[...r.daily,...r.bundle].filter(i=>i.cat===view&&!items.includes(i));
    body.innerHTML=`<h2>${esc(CATS.find(c=>c.id===view)?.name.toUpperCase())}</h2><div class="sp-grid">${[...today.map(i=>card(i,{tag:'TODAY'})),...items.map(i=>card(i))].join('')}</div>
      ${view==='sound'?'<p class="muted small">Music packs need your own music files; none ship yet.</p>':''}`;
  }
  drawer();header();
}
async function drawer(){
  const el=$('sp-drawer'),item=by[sel];
  if(!item){el.classList.remove('open');el.innerHTML='<p class="hint">Pick an item to preview it. Everything here is a look or a sound: power comes from play.</p>';return;}
  const s=loadShop(),owned=s.owned.includes(item.id),slot=slotOf(item),eq=slot&&s.equip[slot]===item.id,bal=loadCredits().balance,r=rotation(cat,s),onSale=!item.rotating||r.daily.includes(item)||r.bundle.includes(item);
  if(!s.seen.includes(item.id)){s.seen.push(item.id);saveShop(s);}
  const where=item.cat==='camo'?'Equip it on any gun in the Gunsmith (camo · SHOP tab).':item.cat==='outfit'?'Pick it in Armory → Operator.':'';
  el.style.setProperty('--r',rar[item.rarity]);el.classList.add('open');
  el.innerHTML=`<div class="pv" id="sp-pv"></div><span class="rar">${item.rarity.toUpperCase()} · ${esc(CATS.find(c=>c.id===item.cat)?.name.toUpperCase())}</span><h3>${esc(item.name)}</h3><p>${esc(item.desc)}</p>
    <div class="act">${owned?(slot?`<button class="buy" data-equip="${esc(item.id)}">${eq?'UNEQUIP':'EQUIP'}</button>`:`<span class="hint">Owned. ${where}</span>`)
      :onSale?`<button class="buy" data-buy="${esc(item.id)}"${bal<item.price?' disabled':''}>BUY · ${item.price.toLocaleString()}</button>${bal<item.price?`<span class="hint">You need ${(item.price-bal).toLocaleString()} more credits.</span>`:''}`:'<span class="hint">Not in the shop today.</span>'}
      ${item.data?.hits?'<button class="buy" data-play="1">PLAY</button>':''}</div>${!owned&&where?`<span class="hint">${where}</span>`:''}`;
  const pv=$('sp-pv'),d=item.data??{};
  if(item.cat==='camo')gunPreview(pv,camoOf(item));
  else if(item.cat==='card')pv.innerHTML=cardSvg(d,'SURVIVOR','LEVEL 20 · PRESTIGE 2');
  else if(item.cat==='outfit'){const ch=charOf(item);pv.innerHTML='<span class="hint">Rendering…</span>';renderPortrait({...ch,type:'mannequin'},data).then(u=>{if(sel===item.id)pv.innerHTML=`<img src="${u}" alt="" style="height:100%">`;}).catch(()=>{pv.innerHTML='';});}
  else if(d.char||d.hitmarker)pv.innerHTML=`<div class="mock-hud" style="background:radial-gradient(#2a2620,#0a0a0a)"><span style="color:${d.color};font-size:${d.char?42:56}px">${esc(d.char??d.hitmarker)}</span></div>`;
  else pv.innerHTML=thumb(item).replace('class="pv"','class="pv" style="height:100%"');
}
document.addEventListener('click',e=>{
  const c=e.target.closest('[data-cat]');if(c){view=c.dataset.cat;history.replaceState(null,'','#'+view);render();return;}
  const i=e.target.closest('.sp-item');if(i){sel=i.dataset.id;render();return;}
  const p=e.target.closest('[data-play]');if(p){playHits(by[sel].data.hits);return;}
  const q=e.target.closest('[data-equip]');if(q){const why=toggleEquip(cat,q.dataset.equip);if(why)toast(why);render();return;}
  const b=e.target.closest('[data-buy]');if(b&&!b.disabled){
    if(!b.dataset.armed){b.dataset.armed='1';const t=b.textContent;b.textContent='CONFIRM · '+t;setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent=t;}},4000);return;}
    const id=b.dataset.buy,why=buy(cat,id);if(why){toast(why);render();return;}
    toast(id==='bundle'?'Bundle bought':`${by[id].name} bought${slotOf(by[id])?' and equipped':''}`);render();return;}
  if(e.target.closest('#sp-drawer')===null&&innerWidth<=760&&!e.target.closest('.sp-item'))$('sp-drawer').classList.remove('open');
});
$('sp-cats-select').addEventListener('change',e=>{view=e.target.value;history.replaceState(null,'','#'+view);render();});
addEventListener('focus',render);
render();

// The Shop (roadmap Phase 6): a main-menu tab (home.js mounts it into #shop-root; the sidebar stays). Spend credits on
// cosmetics: Featured (3 daily slots + the weekly bundle), seven categories, and Credits (challenges and the ledger).
// Select an item to preview it in the drawer, buy it (two clicks), equip it here or where it lives (camos in the Gunsmith
// or the Camos tab, outfits in the Operator pane). Rules: shop.js.
import { loadCatalog, loadShop, saveShop, itemById, slotOf, rotation, listed, buy, toggleEquip, installRewards } from './shop.js';
import { loadCredits, saveCredits, loadCreditsConfig, currentChallenges, challengeText, nextReset } from '../credits/credits.js';
import { loadCamos, camoSwatch, fillSwatches } from '../weapon-levels/camo.js';
import { gunPreview } from '../weapon-levels/gun-preview.js';
import { renderPortrait } from '../../characters.js';
import { cardSvg } from './card.js';
import { makeThumb } from './thumbs.js';

const MARKUP=`<header class="sp-top"><h1>SHOP</h1><div class="sp-bal"><b id="sp-balance">0</b><span>CREDITS</span></div><div class="sp-timers"><span id="sp-daily"></span><span id="sp-weekly"></span></div></header>
<div class="sp-main"><nav class="sp-cats" id="sp-cats"></nav><select class="sp-cats-select" id="sp-cats-select" aria-label="Category"></select><section class="sp-body" id="sp-body"></section><aside class="sp-drawer" id="sp-drawer"></aside></div>`;
let mounted=null;
// mount once; later calls just refresh (the tab was shown again)
export async function mountShop(root,{toast,data}){
  if(mounted){mounted.render();return;}
  root.innerHTML=MARKUP;root.classList.add('shop-tab');
  const $=id=>root.querySelector('#'+id);
  const base=new URL('mods/',document.baseURI);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
installRewards();
const [cat,ccfg,camos,chars]=await Promise.all([loadCatalog(new URL('shop/',base)),loadCreditsConfig(new URL('credits/',base)),
  loadCamos(new URL('weapon-levels/',base)),fetch(new URL('characters/characters.json',base)).then(r=>r.json())]);
const by=itemById(cat),rar=cat.rarities;
const camoOf=item=>camos.camos.find(c=>c.id===item.data?.camo);
const charOf=item=>chars.characters.find(c=>c.id===item.data?.character);
let view='featured',sel=null;

// ---- small previews ---------------------------------------------------------------------------------------------
const thumb=makeThumb({camos,chars});
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
const preview=gunPreview();
setInterval(()=>{if(root.offsetParent)header();},1000);

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
  drawer();header();fillSwatches(root,cid=>camos.camos.find(c=>c.id===cid));
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
  if(item.cat==='camo')preview.show(pv,data.weapons.m16_zm??Object.values(data.weapons)[0],camoOf(item));
  else if(item.cat==='card')pv.innerHTML=cardSvg(d,'SURVIVOR','LEVEL 20 · PRESTIGE 2');
  else if(item.cat==='outfit'){const ch=charOf(item);pv.innerHTML='<span class="hint">Rendering…</span>';renderPortrait({...ch,type:'mannequin'},data).then(u=>{if(sel===item.id)pv.innerHTML=`<img src="${u}" alt="" style="height:100%">`;}).catch(()=>{pv.innerHTML='';});}
  else if(d.char||d.hitmarker)pv.innerHTML=`<div class="mock-hud" style="background:radial-gradient(#2a2620,#0a0a0a)"><span style="color:${d.color};font-size:${d.char?42:56}px">${esc(d.char??d.hitmarker)}</span></div>`;
  else pv.innerHTML=thumb(item).replace('class="pv"','class="pv" style="height:100%"');
}
root.addEventListener('click',e=>{
  const c=e.target.closest('[data-cat]');if(c){view=c.dataset.cat;render();return;}
  const i=e.target.closest('.sp-item');if(i){sel=i.dataset.id;render();return;}
  const p=e.target.closest('[data-play]');if(p){playHits(by[sel].data.hits);return;}
  const q=e.target.closest('[data-equip]');if(q){const why=toggleEquip(cat,q.dataset.equip);if(why)toast(why);render();return;}
  const b=e.target.closest('[data-buy]');if(b&&!b.disabled){
    if(!b.dataset.armed){b.dataset.armed='1';const t=b.textContent;b.textContent='CONFIRM · '+t;setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent=t;}},4000);return;}
    const id=b.dataset.buy,why=buy(cat,id);if(why){toast(why);render();return;}
    toast(id==='bundle'?'Bundle bought':`${by[id].name} bought${slotOf(by[id])?' and equipped':''}`);render();return;}
  if(e.target.closest('#sp-drawer')===null&&innerWidth<=760&&!e.target.closest('.sp-item'))$('sp-drawer').classList.remove('open');
});
$('sp-cats-select').addEventListener('change',e=>{view=e.target.value;render();});
mounted={render};
render();
}

// The Melon Pass tab (roadmap Phase 7, BO6/BO7 style): a main-menu tab (home.js mounts it into #pass-root; the sidebar
// stays). Pages of 9 rewards + a major reward; spend tier tokens on any reward of an open page, or turn on auto-progress.
// Rules and store: pass.js. Rewards preview in a drawer (camos on a turning gun, outfits as a portrait).
import { loadSeason, loadPass, savePass, ensureSeason, seasonEnd, tiersEarned, tokens, pageDone, pageOpen, unlock, autoSpend, buyPremium, buyToken, describe } from './pass.js';
import { loadCatalog } from '../shop/shop.js';
import { loadCredits } from '../credits/credits.js';
import { loadCamos, fillSwatches } from '../weapon-levels/camo.js';
import { gunPreview } from '../weapon-levels/gun-preview.js';
import { makeThumb } from '../shop/thumbs.js';
import { loadGums } from '../gobblegums/gums.js';
import { renderPortrait } from '../../characters.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let mounted=null;
export async function mountPass(root,{toast,data}){
  if(mounted){mounted.render();return;}
  const base=new URL('mods/',document.baseURI);
  const [season,catalog,camos,chars,gums]=await Promise.all([loadSeason(new URL('pass/',base)),loadCatalog(new URL('shop/',base)),loadCamos(new URL('weapon-levels/',base)),
    fetch(new URL('characters/characters.json',base)).then(r=>r.json()),loadGums(new URL('gobblegums/',base)).catch(()=>null)]);
  const thumb=makeThumb({camos,chars}),preview=gunPreview(),rar=catalog.rarities;
  {const p=loadPass();if(ensureSeason(season,p))savePass(p);}
  let page=0,sel=null;
  {const p=loadPass();while(page<season.pages.length-1&&pageDone(season,p,page)&&pageOpen(season,p,page+1))page++;}
  root.classList.add('pass-tab');
  const left=d=>{const s=Math.max(0,(d-Date.now())/1000),dd=Math.floor(s/86400),h=Math.floor(s%86400/3600);return dd?`${dd}d ${h}h`:`${h}h ${Math.floor(s%3600/60)}m`;};
  function rewardThumb(r){
    const d=describe(r,{catalog,gums});if(r.type==='item'&&d.item)return thumb(d.item);
    if(r.type==='credits')return `<div class="pv ps-ic" style="color:#f0c060">◈<small>${r.amount}</small></div>`;
    if(r.type==='token')return `<div class="pv ps-ic" style="color:#7fd8ff">×2<small>${({passXp:'PASS',weaponXp:'WEAPON',researchXp:'RESEARCH'})[r.kind]}</small></div>`;
    if(r.type==='gum'){const g=gums?.gums.find(x=>x.id===r.id),c=gums?.rarities.find(x=>x.id===g?.rarity)?.color??'#888';return `<div class="pv ps-ic"><i class="gumball" style="--c:${c}"></i></div>`;}
    return '<div class="pv"></div>';
  }
  function card(entry,p,{major=false}={}){
    const unlocked=!!p.unlocked[entry.id]||major&&!!p.granted[entry.id],held=unlocked&&entry.premium&&!p.premium,d=describe(entry.reward,{catalog,gums}),r=d.item?.rarity??(major?'legendary':'rare');
    const state=major?(p.granted[entry.id]?'CLAIMED':'COMPLETE THE PAGE'):held?'HELD · NEEDS PREMIUM':unlocked?'UNLOCKED':'1 TOKEN';
    return `<button class="ps-card${major?' major':''}${unlocked?' got':''}${held?' held':''}${sel===entry.id?' sel':''}" data-id="${esc(entry.id)}" style="--r:${rar[r]??'#888'}">${rewardThumb(entry.reward)}
      ${entry.premium?'<span class="ps-prem">PREMIUM</span>':major?'<span class="ps-prem maj">PAGE REWARD</span>':'<span class="ps-prem free">FREE</span>'}<b>${esc(d.title)}</b><small>${esc(d.sub)}</small><span class="ps-st">${state}</span></button>`;
  }
  function render(){
    const p=loadPass(),pg=season.pages[page],t=tiersEarned(season,p),tk=tokens(season,p),bal=loadCredits().balance,total=season.pages.reduce((a,x)=>a+x.items.length,0);
    root.innerHTML=`<header class="ps-top" style="--sc:${season.color}">
        <div><span class="eyebrow">MELON PASS · SEASON ${esc(season.id.slice(1))}</span><h1>${esc(season.name.toUpperCase())}</h1><span class="muted small">Ends in ${left(seasonEnd(season))}</span></div>
        <div class="ps-tier"><b>TIER ${t}</b><span>/ ${total}</span><div class="bar"><i style="width:${t>=total?100:(100*(p.xp%season.tierXp)/season.tierXp).toFixed(1)}%"></i></div><small>${t>=total?'All tiers earned':`${(p.xp%season.tierXp).toLocaleString()} / ${season.tierXp.toLocaleString()} pass XP to the next tier`}</small></div>
        <div class="ps-tok"><b>${tk}</b><span>TOKEN${tk===1?'':'S'}</span></div>
        <div class="ps-btns"><label class="ps-auto"><input type="checkbox" data-auto ${p.auto?'checked':''}> AUTO-PROGRESS</label>
          ${p.premium?'<span class="ps-own">PREMIUM ✓</span>':`<button data-premium${bal<season.premiumPrice?' disabled':''}>PREMIUM · ${season.premiumPrice.toLocaleString()}</button>`}
          <button data-token${bal<season.tokenPrice?' disabled':''}>BUY A TOKEN · ${season.tokenPrice}</button><span class="muted small">${bal.toLocaleString()} credits</span></div></header>
      <nav class="ps-pages">${season.pages.map((x,i)=>{const open=pageOpen(season,p,i),done=pageDone(season,p,i),n=x.items.filter(it=>p.unlocked[it.id]).length;
        return `<button data-page="${i}" class="${i===page?'on':''}${open?'':' locked'}${done?' done':''}"><small>PAGE ${i+1}</small><b>${esc(x.name)}</b><span>${done?'✓ DONE':open?`${n} / ${x.items.length}`:'🔒'}</span></button>`;}).join('')}</nav>
      <div class="ps-body"><div class="ps-grid">${pg.items.map(it=>card(it,p)).join('')}</div>${card(pg.major,p,{major:true})}<aside class="ps-drawer" id="ps-drawer"></aside></div>
      <p class="muted small">Every pass tier you earn gives a token. Spend it on any reward on an open page; unlocking all 9 on a page grants its page reward and opens the next page. ${p.premium?'':'Premium rewards can be unlocked without premium (the page still progresses); they are handed over when you buy the premium pass.'} Pass XP comes from kills, rounds survived and challenges.</p>`;
    fillSwatches(root,cid=>camos.camos.find(c=>c.id===cid));drawer(p);
  }
  function drawer(p){
    const el=root.querySelector('#ps-drawer'),pg=season.pages[page],entry=[...pg.items,pg.major].find(x=>x.id===sel);
    if(!entry){el.innerHTML='<p class="muted small">Pick a reward to preview it.</p>';return;}
    const major=entry===pg.major,d=describe(entry.reward,{catalog,gums}),open=pageOpen(season,p,page),tk=tokens(season,p),unlocked=!!p.unlocked[entry.id];
    el.innerHTML=`<div class="ps-pv" id="ps-pv"></div><h3>${esc(d.title)}</h3><span class="muted small">${esc(d.sub)}${entry.premium?' · PREMIUM':''}</span>${d.item?`<p>${esc(d.item.desc)}</p>`:''}
      ${major?`<p class="muted small">${p.granted[entry.id]?'Claimed.':'Unlock all 9 rewards on this page to get it.'}</p>`
        :unlocked?`<p class="muted small">${entry.premium&&!p.premium?'Unlocked · handed over when you buy the premium pass.':'Unlocked and yours.'}${d.item&&['camo','outfit'].includes(d.item.cat)?` ${d.item.cat==='camo'?'Equip it in the Gunsmith (GLOBAL · SEASON).':'Pick it in Armory → Operator.'}`:d.item?' Equip it in the Shop tab.':''}</p>`
        :`<button class="ps-unlock" data-unlock="${esc(entry.id)}"${!open||tk<=0?' disabled':''}>UNLOCK · 1 TOKEN</button><p class="muted small">${!open?'Finish the page before it first.':tk<=0?'No tokens: earn pass tiers by playing, or buy one.':''}</p>`}`;
    const pv=el.querySelector('#ps-pv'),it=d.item;
    if(it?.cat==='camo')preview.show(pv,data.weapons.m16_zm??Object.values(data.weapons)[0],camos.camos.find(c=>c.id===it.data.camo));
    else if(it?.cat==='outfit'){const ch=chars.characters.find(c=>c.id===it.data.character);pv.innerHTML='';renderPortrait({...ch,type:'mannequin'},data).then(u=>{if(sel===entry.id)pv.innerHTML=`<img src="${u}" alt="" style="height:100%">`;}).catch(()=>{});}
    else pv.innerHTML=rewardThumb(entry.reward).replace('class="pv','class="pv big');
    fillSwatches(el,cid=>camos.camos.find(c=>c.id===cid));
  }
  const report=out=>{const names=(out.granted??[]).map(e=>describe(e.reward,{catalog,gums}).title);toast?.(out.major?`PAGE COMPLETE · ${names.join(' · ')}`:names.length?`Unlocked: ${names.join(' · ')}`:out.held?'Unlocked · held until you buy premium':'Unlocked');};
  root.onclick=e=>{
    const pb=e.target.closest('[data-page]');if(pb){page=+pb.dataset.page;sel=null;render();return;}
    const c=e.target.closest('.ps-card');if(c){sel=c.dataset.id;render();return;}
    const u=e.target.closest('[data-unlock]');if(u&&!u.disabled){const p=loadPass(),r=unlock(season,p,u.dataset.unlock);if(typeof r==='string'){toast?.(r);return;}savePass(p);report(r);
      if(pageDone(season,p,page)&&page<season.pages.length-1){page++;sel=null;}render();return;}
    if(e.target.closest('[data-premium]')){const b=e.target.closest('[data-premium]');if(!b.dataset.armed){b.dataset.armed='1';b.textContent='CONFIRM · '+b.textContent;return;}
      const p=loadPass(),r=buyPremium(season,p);if(typeof r==='string'){toast?.(r);return;}savePass(p);toast?.(`Premium pass · ${r.length} held reward${r.length===1?'':'s'} handed over`);render();return;}
    if(e.target.closest('[data-token]')){const b=e.target.closest('[data-token]');if(!b.dataset.armed){b.dataset.armed='1';b.textContent='CONFIRM · '+b.textContent;return;}
      const p=loadPass(),why=buyToken(season,p);if(why){toast?.(why);return;}const spent=autoSpend(season,p);savePass(p);toast?.(spent.length?'Token bought and spent (auto-progress)':'Token bought');render();}
  };
  root.onchange=e=>{if(e.target.matches('[data-auto]')){const p=loadPass();p.auto=e.target.checked;const spent=autoSpend(season,p);savePass(p);if(spent.length)toast?.(`Auto-progress spent ${spent.length} token${spent.length>1?'s':''}`);render();}};
  addEventListener('kino-pass',()=>{if(root.offsetParent)render();});
  mounted={render};render();
}
export const PASS_CSS=`
.pass-tab{display:flex;flex-direction:column;gap:16px;min-width:0}
.ps-top{display:grid;grid-template-columns:auto 1fr auto auto;gap:22px;align-items:center;padding-bottom:16px;border-bottom:1px solid var(--line)}
.ps-top h1{margin:4px 0;font-size:34px;letter-spacing:5px;color:var(--sc)}
.ps-tier b{font-size:22px}.ps-tier span{color:var(--muted);margin-left:6px}.ps-tier .bar{height:6px;background:#ffffff14;margin:6px 0}.ps-tier .bar i{display:block;height:100%;background:var(--sc)}.ps-tier small{font-size:10px;color:var(--muted);letter-spacing:1px}
.ps-tok{display:flex;flex-direction:column;align-items:center}.ps-tok b{font-size:34px;color:#f0c060;line-height:1}.ps-tok span{font-size:10px;letter-spacing:3px;color:var(--muted)}
.ps-btns{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.ps-btns button,.ps-unlock{min-height:40px;padding:8px 14px;border:1px solid #f0c060;background:#f0c06014;color:#f0c060;font:700 11px/1 inherit;letter-spacing:1.5px;cursor:pointer}
.ps-btns button:disabled,.ps-unlock:disabled{opacity:.4;cursor:default}.ps-btns button[data-armed]{background:#f0c060;color:#111}
.ps-auto{font-size:10px;letter-spacing:2px;color:var(--text);display:flex;gap:6px;align-items:center}.ps-own{color:#7fd48a;font-weight:700;letter-spacing:2px;font-size:12px}
.ps-pages{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.ps-pages button{flex:none;min-width:118px;min-height:56px;padding:8px 10px;border:1px solid #ffffff1c;background:#0007;color:inherit;font:inherit;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.ps-pages button small{font-size:9px;letter-spacing:2px;color:var(--muted)}.ps-pages button b{font-size:13px}.ps-pages button span{font-size:10px;color:var(--muted)}
.ps-pages button.on{border-color:#ff9a3d;background:#ff9a3d18}.ps-pages button.done span{color:#7fd48a}.ps-pages button.locked{opacity:.45}
.ps-body{display:grid;grid-template-columns:minmax(0,1fr) 230px 300px;gap:16px;align-items:start}
.ps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.ps-card{position:relative;display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid #ffffff18;border-bottom:3px solid var(--r);background:#0008;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:44px}
.ps-card:hover{border-color:#ffffff44;border-bottom-color:var(--r)}.ps-card.sel{outline:2px solid #f0c060;outline-offset:2px}
.ps-card .pv{height:70px;background:#111 center/cover;display:grid;place-items:center;overflow:hidden}.ps-card .pv svg{width:100%;height:auto}
.ps-card b{font-size:12px}.ps-card small{font-size:9px;letter-spacing:1.5px;color:var(--muted)}
.ps-card .ps-st{font-size:9px;letter-spacing:1.5px;color:#f0c060}.ps-card.got .ps-st{color:#7fd48a}.ps-card.held .ps-st{color:#ff9a3d}
.ps-card.got:not(.held) .pv{box-shadow:inset 0 0 0 2px #7fd48a88}
.ps-prem{position:absolute;top:12px;left:12px;padding:1px 6px;background:#000c;font-size:9px;letter-spacing:1.5px;color:#f0c060}.ps-prem.free{color:#9a9a9a}.ps-prem.maj{color:#ff9a3d}
.ps-card.major{border-color:#ff9a3d66}.ps-card.major .pv{height:200px}.ps-card.major b{font-size:16px}
.ps-ic{font-size:30px;font-weight:700;display:flex!important;flex-direction:column;align-items:center;justify-content:center}.ps-ic small{font-size:10px;letter-spacing:2px;color:inherit}
.gumball{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8,var(--c) 45%,#000 120%)}
.ps-drawer{border:1px solid var(--line);background:#0b0b0bee;padding:14px;display:flex;flex-direction:column;gap:8px;position:sticky;top:12px}
.ps-pv{height:180px;background:#0a0a0a;display:grid;place-items:center;overflow:hidden}.ps-pv .pv.big{height:100%;width:100%}.ps-drawer h3{margin:0;font-size:20px}.ps-drawer p{margin:0;font-size:12px;color:#cfc8b8}
@media (max-width:1300px){.ps-body{grid-template-columns:minmax(0,1fr) 220px}.ps-drawer{grid-column:1/-1;position:static}}
@media (max-width:760px){.ps-top{grid-template-columns:minmax(0,1fr) auto;gap:12px}.ps-top h1{font-size:22px;letter-spacing:2px;overflow-wrap:anywhere}.ps-tier{grid-column:1/-1}.ps-btns{grid-column:1/-1;align-items:stretch}.ps-body{grid-template-columns:minmax(0,1fr)}.ps-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ps-card.major .pv{height:120px}}`;

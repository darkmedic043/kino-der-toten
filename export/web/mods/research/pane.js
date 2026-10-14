// Armory → Research (roadmap Phase 5): pick an item (perk or ammo mod), research its augments one at a time, equip one
// Major and one Minor per item. Rules and store: research.js. Touch-sized targets; one column on phones.
import { loadResearch, saveResearch, startResearch, toggleEquip, costOf, researchOpen } from './research.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const RESEARCH_CSS=`
.rs{display:grid;grid-template-columns:minmax(200px,260px) 1fr;gap:18px;min-height:0}
.rs-list{display:flex;flex-direction:column;gap:4px;overflow:auto;max-height:68vh;padding-right:4px}
.rs-list h4{margin:10px 0 4px;font-size:10px;letter-spacing:3px;color:var(--muted,#8a8577)}
.rs-item{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 10px;border:1px solid #ffffff14;background:#0006;color:inherit;font:inherit;text-align:left;cursor:pointer}
.rs-item:hover{border-color:#ffffff40}.rs-item.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,#0008)}
.rs-item i{width:12px;height:12px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c);flex:none}
.rs-item b{flex:1;font-weight:600;letter-spacing:.5px}.rs-item small{font-size:10px;letter-spacing:1px;color:var(--muted,#8a8577)}
.rs-item .dot{width:8px;height:8px;border-radius:50%;background:#f0c060;box-shadow:0 0 6px #f0c060}
.rs-main{display:flex;flex-direction:column;gap:14px;min-width:0}.rs-active,.rs-card p{overflow-wrap:anywhere}
.rs-active{padding:10px 14px;border:1px solid #f0c06055;background:#f0c0600d;font-size:12px}
.rs-active b{color:#f0c060}.rs-active .bar{height:4px;background:#ffffff14;margin-top:6px}.rs-active .bar i{display:block;height:100%;background:#f0c060}
.rs-head{display:flex;align-items:baseline;gap:12px}.rs-head h2{margin:0;color:var(--c)}.rs-head span{font-size:11px;letter-spacing:2px;color:var(--muted,#8a8577)}
.rs-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.rs-cols h3{margin:0 0 8px;font-size:11px;letter-spacing:3px;color:var(--muted,#8a8577)}
.rs-card{padding:12px 14px;border:1px solid #ffffff1c;background:#0007;margin-bottom:10px;display:flex;flex-direction:column;gap:6px}
.rs-card.done{border-color:color-mix(in srgb,var(--c) 45%,transparent)}.rs-card.eq{border-color:var(--c);box-shadow:0 0 12px color-mix(in srgb,var(--c) 30%,transparent)}
.rs-card strong{font-size:15px}.rs-card p{margin:0;font-size:12px;line-height:1.45;color:#cfc8b8}
.rs-card .st{font-size:10px;letter-spacing:2px;color:var(--muted,#8a8577)}.rs-card.done .st{color:var(--c)}
.rs-card .bar{height:4px;background:#ffffff14}.rs-card .bar i{display:block;height:100%;background:#f0c060}
.rs-card button{align-self:flex-start;min-height:40px;padding:8px 14px;border:1px solid var(--c);background:transparent;color:var(--c);font:600 11px/1 inherit;letter-spacing:1.5px;cursor:pointer}
.rs-card button:hover{background:color-mix(in srgb,var(--c) 18%,transparent)}.rs-card button.on{background:var(--c);color:#111!important}
.rs-lock{padding:18px;border:1px dashed #ffffff30;color:var(--muted,#8a8577)}
@media(max-width:760px){.rs{grid-template-columns:minmax(0,1fr)}.rs-list{max-height:none;flex-direction:row;flex-wrap:wrap}.rs-list h4{width:100%}.rs-item{flex:1 1 40%;min-width:0}.rs-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rs-cols{grid-template-columns:minmax(0,1fr)}.rs-head{flex-wrap:wrap}}`;

let sel=null;
// root: the pane's element; cfg: research.json; level: the unlock level (profile.js unlockLvl); toast: the menu's toast
export function renderResearch(root,{cfg,level,toast}){
  const r=loadResearch(),items=cfg.items,open=researchOpen(cfg,level);sel??=items[0].id;
  const it=items.find(i=>i.id===sel)??items[0],by=Object.fromEntries(items.flatMap(i=>i.augments.map(a=>[a.id,{...a,item:i}])));
  const act=r.active&&by[r.active],eqOf=i=>Object.values(r.equip[i.id]??{}).filter(Boolean).length;
  const group=(kind,label)=>`<h4>${label}</h4>`+items.filter(i=>i.kind===kind).map(i=>`<button class="rs-item${i.id===it.id?' on':''}" data-item="${esc(i.id)}" style="--c:${i.color}"><i></i><b>${esc(i.name)}</b>${act?.item.id===i.id?'<span class="dot" title="Researching"></span>':''}<small>${i.augments.filter(a=>r.done.includes(a.id)).length}/${i.augments.length}${eqOf(i)?' · '+eqOf(i)+' ON':''}</small></button>`).join('');
  const card=a=>{const done=r.done.includes(a.id),eq=r.equip[it.id]?.[a.kind]===a.id,cost=costOf(cfg,a),xp=r.progress[a.id]??0,activeNow=r.active===a.id;
    return `<div class="rs-card${done?' done':''}${eq?' eq':''}"><span class="st">${eq?'EQUIPPED':done?'RESEARCHED':activeNow?'RESEARCHING':xp?'PAUSED':'NOT RESEARCHED'}</span><strong>${esc(a.name)}</strong><p>${esc(a.desc)}</p>
      ${done?`<button data-equip="${esc(a.id)}" class="${eq?'on':''}">${eq?'UNEQUIP':'EQUIP'}</button>`
        :`<div class="bar"><i style="width:${(100*xp/cost).toFixed(1)}%"></i></div><span class="st">${Math.floor(xp).toLocaleString()} / ${cost.toLocaleString()} RESEARCH XP</span>${activeNow?'':`<button data-research="${esc(a.id)}"${open?'':' disabled'}>${xp?'RESUME':'RESEARCH'}</button>`}`}</div>`;};
  root.innerHTML=`<style>${RESEARCH_CSS}</style><div class="rs">
    <div class="rs-list">${group('perk','PERKS')}${group('ammo','AMMO MODS')}</div>
    <div class="rs-main" style="--c:${it.color}">
      ${open?'':`<div class="rs-lock">Research opens at level ${cfg.unlockLevel}.</div>`}
      <div class="rs-active">${act?`RESEARCHING <b>${esc(act.name)}</b> · ${esc(act.item.name)} ${act.kind} · ${Math.floor(r.progress[act.id]??0).toLocaleString()} / ${costOf(cfg,act).toLocaleString()} XP · ×${cfg.activeMul} while ${act.item.kind==='perk'?'you have '+esc(act.item.name):esc(act.item.name)+' is on your gun'}<div class="bar"><i style="width:${(100*(r.progress[act.id]??0)/costOf(cfg,act)).toFixed(1)}%"></i></div>`
        :`Nothing is being researched. Pick an augment: it earns research XP from kills and rounds, ×${cfg.activeMul} while its ${it.kind==='perk'?'perk':'ammo mod'} is active. One at a time; switching keeps progress.`}</div>
      <div class="rs-head"><h2>${esc(it.name)}</h2><span>${it.kind==='perk'?'PERK AUGMENTS · WORK WHILE YOU HAVE THE PERK':'AMMO MOD AUGMENTS · WORK WHILE THE MOD IS ON YOUR GUN'}</span></div>
      <div class="rs-cols"><div><h3>MAJOR · EQUIP ONE</h3>${it.augments.filter(a=>a.kind==='major').map(card).join('')}</div>
        <div><h3>MINOR · EQUIP ONE</h3>${it.augments.filter(a=>a.kind==='minor').map(card).join('')}</div></div>
      <p class="muted small">Equipped augments are locked in when a match starts.</p>
    </div></div>`;
  root.onclick=e=>{
    const i=e.target.closest('[data-item]');if(i){sel=i.dataset.item;renderResearch(root,{cfg,level,toast});return;}
    const s=e.target.closest('[data-research]');if(s){const r2=loadResearch(),why=startResearch(cfg,r2,s.dataset.research);if(why)toast?.(why);else saveResearch(r2);renderResearch(root,{cfg,level,toast});return;}
    const q=e.target.closest('[data-equip]');if(q){const r2=loadResearch(),why=toggleEquip(cfg,r2,q.dataset.equip);if(why)toast?.(why);else saveResearch(r2);renderResearch(root,{cfg,level,toast});}
  };
}

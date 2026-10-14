// Armory → Research (roadmap Phase 5, BO7 style): pick an item (perk or ammo mod); its 8 augments form a linear track
// researched in order, one at a time across all items; the end of the track (mastery) opens a second Minor slot.
// Equip one Major and one Minor (two once mastered) per item. Rules and store: research.js. Touch-sized; one column on phones.
import { loadResearch, saveResearch, startResearch, toggleEquip, costOf, researchOpen, nextOnTrack, mastered, augById } from './research.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const RESEARCH_CSS=`
.rs{display:grid;grid-template-columns:minmax(200px,250px) minmax(0,1fr);gap:18px;min-height:0}
.rs-list{display:flex;flex-direction:column;gap:4px;overflow:auto;max-height:70vh;padding-right:4px}
.rs-list h4{margin:10px 0 4px;font-size:10px;letter-spacing:3px;color:var(--muted,#8a8577)}
.rs-item{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 10px;border:1px solid #ffffff14;background:#0006;color:inherit;font:inherit;text-align:left;cursor:pointer}
.rs-item:hover{border-color:#ffffff40}.rs-item.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,#0008)}
.rs-item i{width:12px;height:12px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c);flex:none}
.rs-item b{flex:1;font-weight:600;letter-spacing:.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rs-item small{font-size:10px;letter-spacing:1px;color:var(--muted,#8a8577)}
.rs-item .dot{width:8px;height:8px;border-radius:50%;background:#f0c060;box-shadow:0 0 6px #f0c060}.rs-item .m{color:#f0c060}
.rs-main{display:flex;flex-direction:column;gap:14px;min-width:0}
.rs-active{padding:10px 14px;border:1px solid #f0c06055;background:#f0c0600d;font-size:12px;overflow-wrap:anywhere}
.rs-active b{color:#f0c060}.rs .bar{height:4px;background:#ffffff14;margin-top:6px}.rs .bar i{display:block;height:100%;background:#f0c060}
.rs-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.rs-head h2{margin:0;color:var(--c)}.rs-head span{font-size:11px;letter-spacing:2px;color:var(--muted,#8a8577)}
.rs-slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.rs-slot{padding:8px 12px;border:1px dashed #ffffff30;font-size:12px;min-height:44px}.rs-slot small{display:block;font-size:9px;letter-spacing:2px;color:var(--muted,#8a8577)}
.rs-slot.full{border-style:solid;border-color:var(--c)}.rs-slot.locked{opacity:.45}
.rs-track{position:relative;display:flex;flex-direction:column;gap:8px;padding-left:22px}
.rs-track::before{content:'';position:absolute;left:8px;top:12px;bottom:12px;width:2px;background:#ffffff1c}
.rs-track .fill{position:absolute;left:8px;top:12px;width:2px;background:var(--c);box-shadow:0 0 6px var(--c)}
.rs-step{position:relative;padding:10px 14px;border:1px solid #ffffff1c;background:#0007;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center}
.rs-step::before{content:'';position:absolute;left:-19px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#111;border:2px solid #ffffff40}
.rs-step.done::before{background:var(--c);border-color:var(--c)}.rs-step.now::before{border-color:#f0c060;box-shadow:0 0 8px #f0c060}
.rs-step.major{border-left:3px solid color-mix(in srgb,var(--c) 70%,transparent)}
.rs-step.locked{opacity:.55}.rs-step.eq{border-color:var(--c);box-shadow:0 0 12px color-mix(in srgb,var(--c) 30%,transparent)}
.rs-step strong{font-size:14px}.rs-step p{grid-column:1;margin:0;font-size:12px;line-height:1.4;color:#cfc8b8;overflow-wrap:anywhere}
.rs-step .st{font-size:9px;letter-spacing:2px;color:var(--muted,#8a8577)}.rs-step.done .st{color:var(--c)}
.rs-step .bar{grid-column:1}
.rs-step .act{grid-column:2;grid-row:1/4}
.rs-step button{min-height:40px;padding:8px 14px;border:1px solid var(--c);background:transparent;color:var(--c);font:600 11px/1 inherit;letter-spacing:1.5px;cursor:pointer;white-space:nowrap}
.rs-step button:hover{background:color-mix(in srgb,var(--c) 18%,transparent)}.rs-step button.on{background:var(--c);color:#111!important}
.rs-mastery{padding:10px 14px;border:1px solid #f0c06055;color:#f0c060;font-size:12px;letter-spacing:1px}.rs-mastery.off{border-color:#ffffff1c;color:var(--muted,#8a8577)}
.rs-lock{padding:18px;border:1px dashed #ffffff30;color:var(--muted,#8a8577)}
@media(max-width:760px){.rs{grid-template-columns:minmax(0,1fr)}.rs-list{max-height:none;flex-direction:row;flex-wrap:wrap}.rs-list h4{width:100%}.rs-item{flex:1 1 40%;min-width:0}.rs-slots{grid-template-columns:minmax(0,1fr)}}`;

let sel=null;
// root: the pane's element; cfg: research.json; level: the unlock level (profile.js unlockLvl); toast: the menu's toast
export function renderResearch(root,{cfg,level,toast}){
  const r=loadResearch(),items=cfg.items,open=researchOpen(cfg,level),by=augById(cfg);sel??=items[0].id;
  const it=items.find(i=>i.id===sel)??items[0],act=r.active&&by[r.active],eq=r.equip[it.id]??{},m=mastered(cfg,r,it.id),next=nextOnTrack(cfg,r,it.id);
  const doneN=i=>i.augments.filter(a=>r.done.includes(a.id)).length;
  const group=(kind,label)=>`<h4>${label}</h4>`+items.filter(i=>i.kind===kind).map(i=>`<button class="rs-item${i.id===it.id?' on':''}" data-item="${esc(i.id)}" style="--c:${i.color}"><i></i><b>${esc(i.name)}</b>${act?.item===i.id?'<span class="dot" title="Researching"></span>':''}<small class="${doneN(i)===8?'m':''}">${doneN(i)===8?'MASTERED':doneN(i)+'/8'}</small></button>`).join('');
  const slot=(k,label,locked)=>{const a=by[eq[k]];return `<div class="rs-slot${a&&!locked?' full':''}${locked?' locked':''}"><small>${label}</small>${locked?'Master the track':esc(a?.name??'Empty')}</div>`;};
  const step=(a,i)=>{const done=r.done.includes(a.id),now=r.active===a.id,isNext=next?.id===a.id,on=Object.values(eq).includes(a.id),cost=costOf(cfg,{...a,index:i}),xp=r.progress[a.id]??0;
    const st=on?'EQUIPPED':done?'RESEARCHED':now?'RESEARCHING':isNext?(xp?'PAUSED':'NEXT'):'LOCKED';
    const btn=done?`<button data-equip="${esc(a.id)}" class="${on?'on':''}">${on?'UNEQUIP':'EQUIP'}</button>`:isNext&&!now?`<button data-research="${esc(a.id)}"${open?'':' disabled'}>${xp?'RESUME':'RESEARCH'}</button>`:'';
    return `<div class="rs-step ${a.kind}${done?' done':''}${now?' now':''}${!done&&!isNext?' locked':''}${on?' eq':''}"><span class="st">${i+1} · ${a.kind.toUpperCase()} · ${st}</span>
      <div class="act">${btn}</div><strong>${esc(a.name)}</strong><p>${esc(a.desc)}</p>${done?'':`<div class="bar"><i style="width:${(100*xp/cost).toFixed(1)}%"></i></div><span class="st">${Math.floor(xp).toLocaleString()} / ${cost.toLocaleString()} RESEARCH XP</span>`}</div>`;};
  const fill=Math.max(0,doneN(it)-.5)/7;
  root.innerHTML=`<style>${RESEARCH_CSS}</style><div class="rs">
    <div class="rs-list">${group('perk','PERKS')}${group('ammo','AMMO MODS')}</div>
    <div class="rs-main" style="--c:${it.color}">
      ${open?'':`<div class="rs-lock">Research opens at level ${cfg.unlockLevel}.</div>`}
      <div class="rs-active">${act?`RESEARCHING <b>${esc(act.name)}</b> · ${esc(act.itemName)} ${act.index+1}/8 · ${Math.floor(r.progress[act.id]??0).toLocaleString()} / ${costOf(cfg,act).toLocaleString()} XP · ×${cfg.activeMul} while ${act.itemKind==='perk'?'you have '+esc(act.itemName):esc(act.itemName)+' is on your gun'}<div class="bar"><i style="width:${(100*(r.progress[act.id]??0)/costOf(cfg,act)).toFixed(1)}%"></i></div>`
        :`Nothing is being researched. Each perk and ammo mod has a track of 8 augments, researched in order with XP from kills and rounds (×${cfg.activeMul} while the item is active). One at a time; switching keeps progress.`}</div>
      <div class="rs-head"><h2>${esc(it.name)}</h2><span>${it.kind==='perk'?'PERK AUGMENTS · WORK WHILE YOU HAVE THE PERK':'AMMO MOD AUGMENTS · WORK WHILE THE MOD IS ON YOUR GUN'}</span></div>
      <div class="rs-slots">${slot('major','MAJOR')}${slot('minor','MINOR')}${slot('minor2','MINOR 2 · MASTERY',!m)}</div>
      <div class="rs-track"><div class="fill" style="height:calc((100% - 24px) * ${fill.toFixed(3)})"></div>${it.augments.map(step).join('')}</div>
      <div class="rs-mastery${m?'':' off'}">${m?'MASTERED · a second Minor slot is open for '+esc(it.name):'MASTERY · finish all 8 to open a second Minor slot'}</div>
      <p class="muted small">Equipped augments are locked in when a match starts.</p>
    </div></div>`;
  root.onclick=e=>{
    const i=e.target.closest('[data-item]');if(i){sel=i.dataset.item;renderResearch(root,{cfg,level,toast});return;}
    const s=e.target.closest('[data-research]');if(s){const r2=loadResearch(),why=startResearch(cfg,r2,s.dataset.research);if(why)toast?.(why);else saveResearch(r2);renderResearch(root,{cfg,level,toast});return;}
    const q=e.target.closest('[data-equip]');if(q){const r2=loadResearch(),why=toggleEquip(cfg,r2,q.dataset.equip);if(why)toast?.(why);else saveResearch(r2);renderResearch(root,{cfg,level,toast});}
  };
}

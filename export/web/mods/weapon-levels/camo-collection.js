// The Camos tab (main menu): every global camo in one place: prestige camos earned on any gun, shop camos, and special
// (reward) camos. Pick one, preview it on a turning gun, and put it on any gun with a Gunsmith, or on all of them.
// Sub-tabs come from CAMO_TABS: add an entry to add a tab ({id, label, list(ctx) → camos, locked?(ctx, camo) → reason}).
// Per-gun challenge camos (Woodland… Gold, Diamond) stay in each gun's Gunsmith: they belong to that gun.
import { camoUnlocked, camoSwatch, fillSwatches, prestigeCamo } from './camo.js';
import { loadPrestige, prestigeCamoId, TIER_NAMES, RULES as PRESTIGE } from '../prestige/prestige.js';
import { gunPreview } from './gun-preview.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ctx: {cats, weapons, guns (ids with a Gunsmith), profile, showLocked}
export const CAMO_TABS=[
  {id:'prestige',label:'PRESTIGE',hint:'Earned by prestiging a gun. Every gun has its own three; once earned, any gun can wear it.',
    list:ctx=>{const pr=loadPrestige(),earned=pr.camos.map(id=>prestigeCamo(id)).filter(Boolean);
      if(!ctx.showLocked)return earned;
      const all=ctx.guns.flatMap(g=>[1,2,3].map(t=>prestigeCamo(prestigeCamoId(t,g))));return [...earned,...all.filter(c=>!pr.camos.includes(c.id))];},
    locked:(ctx,c)=>loadPrestige().camos.includes(c.id)?null:c.prestige===3?`Prestige Master level ${PRESTIGE.masterCamoAt} on the ${ctx.weapons[c.owner]?.name??c.owner}`:`${TIER_NAMES[c.prestige].replace('PRESTIGE','Prestige')} on the ${ctx.weapons[c.owner]?.name??c.owner}`,
    sub:(ctx,c)=>`${TIER_NAMES[c.prestige]} · ${ctx.weapons[c.owner]?.name??c.owner}`},
  {id:'shop',label:'SHOP',hint:'Bought in the Shop. Every shop camo works on every gun.',
    list:ctx=>ctx.cats.camos.filter(c=>c.shop&&(ctx.showLocked||owned(ctx,c))),
    locked:(ctx,c)=>owned(ctx,c)?null:'Buy it in the Shop',sub:()=>'SHOP'},
  {id:'special',label:'SPECIAL',hint:'Rewards from maps and events.',
    list:ctx=>ctx.cats.camos.filter(c=>c.reward&&(ctx.showLocked||owned(ctx,c))),
    locked:(ctx,c)=>owned(ctx,c)?null:ctx.cats.challenges?.[c.challenge]??'A map reward',sub:()=>'SPECIAL'},
];
// global camos don't depend on the gun: any gun id answers for them
const owned=(ctx,c)=>camoUnlocked(ctx.cats,ctx.profile,ctx.guns[0]??'',ctx.weapons).has(c.id);

let state={tab:'prestige',sel:null,gun:null,showLocked:false};
const preview=gunPreview();
// opts: {cats, weapons, guns, profile(), setCamo(gunId, camoId|null), toast}
export function renderCamos(root,opts){
  const profile=opts.profile(),ctx={...opts,profile,showLocked:state.showLocked};
  const tab=CAMO_TABS.find(t=>t.id===state.tab)??CAMO_TABS[0],list=tab.list(ctx);
  state.gun??=ctx.guns.find(g=>g==='m16_zm')??ctx.guns[0];
  const sel=list.find(c=>c.id===state.sel)??null,lockWhy=sel&&tab.locked(ctx,sel);
  const wearing=sel?ctx.guns.filter(g=>profile.camo?.[g]?.on===sel.id):[];
  const counts=CAMO_TABS.map(t=>{const all=t.list({...ctx,showLocked:false});return all.length;});
  root.innerHTML=`<div class="cc">
    <div class="cc-tabs">${CAMO_TABS.map((t,i)=>`<button data-ctab="${t.id}" class="${t.id===tab.id?'on':''}">${esc(t.label)}<small>${counts[i]}</small></button>`).join('')}
      <label class="cc-locked"><input type="checkbox" data-locked ${state.showLocked?'checked':''}> SHOW LOCKED</label></div>
    <p class="muted small">${esc(tab.hint)}</p>
    <div class="cc-body"><div class="cc-grid">${list.length?list.map(c=>{const why=tab.locked(ctx,c);
        return `<button class="cc-item${c.id===state.sel?' sel':''}${why?' locked':''}${c.anim?' anim':''}" data-camo="${esc(c.id)}"><i data-swatch="${esc(c.id)}" style="background-image:url(${camoSwatch(c)})"></i><b>${esc(c.name)}</b><small>${esc(tab.sub(ctx,c))}</small></button>`;}).join('')
        :`<p class="muted">Nothing here yet.${tab.id==='prestige'?' Prestige a gun in the Armory (Weapons) to earn its camos.':''}</p>`}</div>
      <aside class="cc-side">${sel?`<div class="cc-pv" id="cc-pv"></div><h3>${esc(sel.name)}</h3><span class="muted small">${esc(tab.sub(ctx,sel))}</span>
        ${lockWhy?`<p class="cc-why">LOCKED · ${esc(lockWhy)}</p>`:`
        <label class="cc-gun">PUT IT ON<select data-gun>${ctx.guns.map(g=>`<option value="${esc(g)}"${g===state.gun?' selected':''}>${esc(ctx.weapons[g]?.name??g)}${profile.camo?.[g]?.on===sel.id?' ✓':''}</option>`).join('')}</select></label>
        <div class="cc-act"><button data-equip>${profile.camo?.[state.gun]?.on===sel.id?'TAKE IT OFF':'EQUIP ON '+esc((ctx.weapons[state.gun]?.name??state.gun).toUpperCase())}</button><button data-all>EQUIP ON EVERY GUN</button></div>
        <p class="muted small">${wearing.length?`Worn by ${wearing.length} gun${wearing.length>1?'s':''}: ${esc(wearing.map(g=>ctx.weapons[g]?.name??g).slice(0,6).join(', '))}${wearing.length>6?'…':''}`:'No gun wears it yet.'}</p>`}`
        :'<p class="muted">Pick a camo to preview it and put it on your guns.</p>'}</aside></div></div>`;
  fillSwatches(root,cid=>list.find(c=>c.id===cid)??ctx.cats.camos.find(c=>c.id===cid)??prestigeCamo(cid));
  if(sel)preview.show(root.querySelector('#cc-pv'),ctx.weapons[state.gun],sel);
  root.onclick=e=>{
    const t=e.target.closest('[data-ctab]');if(t){state.tab=t.dataset.ctab;state.sel=null;renderCamos(root,opts);return;}
    const c=e.target.closest('[data-camo]');if(c){state.sel=c.dataset.camo;renderCamos(root,opts);return;}
    if(e.target.closest('[data-equip]')){const on=profile.camo?.[state.gun]?.on===state.sel;opts.setCamo(state.gun,on?null:state.sel);opts.toast?.(on?'Camo taken off':`${sel.name} on the ${ctx.weapons[state.gun]?.name}`);renderCamos(root,opts);return;}
    if(e.target.closest('[data-all]')){for(const g of ctx.guns)opts.setCamo(g,state.sel);opts.toast?.(`${sel.name} on all ${ctx.guns.length} guns`);renderCamos(root,opts);}
  };
  root.onchange=e=>{
    if(e.target.matches('[data-gun]')){state.gun=e.target.value;renderCamos(root,opts);}
    if(e.target.matches('[data-locked]')){state.showLocked=e.target.checked;renderCamos(root,opts);}
  };
}
export const CAMO_CSS=`
.cc{display:flex;flex-direction:column;gap:12px;min-width:0}
.cc-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)}
.cc-tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:10px 16px;font-weight:700;letter-spacing:3px;color:var(--muted);cursor:pointer;min-height:44px}
.cc-tabs button.on{color:var(--text);border-bottom-color:var(--red-hi)}.cc-tabs button small{margin-left:8px;font-size:10px;color:var(--dim)}
.cc-locked{margin-left:auto;font-size:10px;letter-spacing:2px;color:var(--muted);display:flex;gap:6px;align-items:center}
.cc-body{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px}
.cc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;align-content:start;max-height:68vh;overflow:auto;padding-right:4px}
.cc-item{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid #ffffff18;background:#0008;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:44px}
.cc-item:hover{border-color:#ffffff44}.cc-item.sel{outline:2px solid #f0c060;outline-offset:2px}.cc-item.locked{opacity:.45}
.cc-item i{height:70px;background:#151515 center/cover}.cc-item b{font-size:12px}.cc-item small{font-size:9px;letter-spacing:1.5px;color:var(--muted)}
.cc-item.anim i{position:relative;overflow:hidden}.cc-item.anim i::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,#ffffff55 50%,transparent 65%);background-size:300% 100%;animation:cc-sh 2.4s linear infinite}
@keyframes cc-sh{from{background-position:120% 0}to{background-position:-120% 0}}
.cc-side{border:1px solid var(--line);background:#0b0b0bee;padding:14px;display:flex;flex-direction:column;gap:10px;align-self:start;position:sticky;top:12px}
.cc-pv{height:190px;background:#0a0a0a}.cc-side h3{margin:0;font-size:20px}
.cc-why{color:#e46b5a;font-size:12px;margin:0}
.cc-gun{display:flex;flex-direction:column;gap:6px;font-size:10px;letter-spacing:2px;color:var(--muted)}.cc-gun select{min-height:40px;background:#111;color:var(--text);border:1px solid var(--line);font:inherit;padding:6px}
.cc-act{display:flex;gap:8px;flex-wrap:wrap}.cc-act button{min-height:44px;padding:10px 14px;border:1px solid #f0c060;background:#f0c06014;color:#f0c060;font:700 11px/1 inherit;letter-spacing:1.5px;cursor:pointer}
.cc-act button:hover{background:#f0c06030}
@media (max-width:900px){.cc-body{grid-template-columns:minmax(0,1fr)}.cc-side{position:static}.cc-grid{max-height:none;grid-template-columns:repeat(2,minmax(0,1fr))}}`;

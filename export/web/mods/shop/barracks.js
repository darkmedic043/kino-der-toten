// Armory → Barracks (2026-11-13): equip the cosmetics you own, slot by slot. Owned items left the Shop the same day, so
// this is where they live now. Same store as the Shop (kino.mods.shop equip), same tiles (shop.css .sp-item, thumbs.js).
// Camos stay in the Gunsmith and outfits in the Operator pane (slotOf gives them no slot).
import { loadCatalog, loadShop, saveShop, itemById, slotOf } from './shop.js';
import { makeThumb } from './thumbs.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const BARRACKS_SLOTS=[
  {id:'glow',name:'BOX COLOUR',hint:'The Mystery Box glow'},
  {id:'hitmarker',name:'HIT MARKER',hint:'The mark on every hit'},
  {id:'reticle',name:'CROSSHAIR',hint:'The hip-fire crosshair'},
  {id:'sound',name:'HIT SOUNDS',hint:'The hit and kill sounds'},
  {id:'kill',name:'KILL COLOUR',hint:'Blood colour on kills'},
  {id:'killfx',name:'KILL EFFECT',hint:'What a zombie does when it dies'},
  {id:'emblem',name:'EMBLEM',hint:'On your calling card'},
  {id:'card',name:'CALLING CARD',hint:'Your profile card'},
  {id:'title',name:'TITLE',hint:'Before your level'},
  {id:'frame',name:'PORTRAIT FRAME',hint:'Round your HUD portrait'},
  {id:'hud',name:'HUD COLOURS',hint:'Points, round and rings'},
  {id:'menu',name:'MENU THEME',hint:'This menu\'s accent colour'},
];
const CSS=`.bk{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:22px;align-items:start}
.bk-slots{display:flex;flex-direction:column;gap:6px}
.bk-slot{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:10px 12px;border:1px solid var(--line);background:var(--panel);color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:44px}
.bk-slot:hover{border-color:var(--line-strong)}.bk-slot.on{border-color:var(--red-hi);background:linear-gradient(90deg,#932e2522,#05050580)}
.bk-slot span{font-size:10px;letter-spacing:2px;color:var(--muted)}.bk-slot strong{grid-column:1;font-size:13px}.bk-slot em{grid-row:1/3;grid-column:2;align-self:center;font-style:normal;font-size:10px;letter-spacing:1px;color:var(--gold)}
.bk-head{display:flex;align-items:baseline;gap:12px;margin:0 0 12px}.bk-head h2{margin:0;font-size:16px;letter-spacing:3px}
.bk .sp-item.eq{outline:2px solid var(--gold);outline-offset:2px}
.bk .sp-item.def .pv{font-size:12px;letter-spacing:3px;color:var(--muted)}
@media (max-width:760px){.bk{grid-template-columns:1fr}.bk-slots{flex-direction:row;overflow-x:auto}.bk-slot{flex:none}}`;

let cat=null,thumb=null,slot='glow',styled=false;
export async function mountBarracks(root,{toast=()=>{},onChange=()=>{}}={}){
  if(!styled){const st=document.createElement('style');st.textContent=CSS;document.head.append(st);styled=true;}
  cat??=await loadCatalog();thumb??=makeThumb({camos:{camos:[]},chars:{characters:[]}});
  const by=itemById(cat),rar=cat.rarities??{};
  const draw=()=>{
    const s=loadShop(),owned=s.owned.map(id=>by[id]).filter(Boolean),inSlot=id=>owned.filter(i=>slotOf(i)===id);
    const cur=id=>{const e=s.equip[id];return e&&s.owned.includes(e)?by[e]:null;};
    const def=BARRACKS_SLOTS.find(x=>x.id===slot)??BARRACKS_SLOTS[0],items=inSlot(def.id),eq=cur(def.id);
    root.innerHTML=`<div class="bk"><div class="bk-slots">${BARRACKS_SLOTS.map(x=>`<button class="bk-slot${x.id===def.id?' on':''}" data-slot="${x.id}"><span>${x.name}</span><strong>${esc(cur(x.id)?.name??'Default')}</strong><em>${inSlot(x.id).length}</em></button>`).join('')}</div>
      <div><div class="bk-head"><h2>${def.name}</h2><span class="muted small">${esc(def.hint)} · ${items.length} owned</span></div>
      <div class="sp-grid"><button class="sp-item def${eq?'':' eq'}" data-item="" style="--r:#776b52"><div class="pv">DEFAULT</div><b>Default</b><small>${eq?'':'EQUIPPED'}</small></button>
      ${items.map(i=>`<button class="sp-item${eq===i?' eq':''}" data-item="${esc(i.id)}" style="--r:${rar[i.rarity]??'#888'}">${thumb(i)}<b>${esc(i.name)}</b><small>${eq===i?'EQUIPPED':esc(i.rarity?.toUpperCase())}</small></button>`).join('')}</div>
      ${items.length?'':'<p class="muted small">Nothing owned for this slot yet: buy it in the Shop or earn it in the Melon Pass.</p>'}
      <p class="muted small">Camos go on in the Gunsmith, outfits in Operator.</p></div></div>`;
  };
  root.onclick=e=>{
    const b=e.target.closest('[data-slot]');if(b){slot=b.dataset.slot;draw();return;}
    const it=e.target.closest('[data-item]');if(!it)return;
    const s=loadShop(),id=it.dataset.item||null;if(id&&!s.owned.includes(id)){toast('Not owned');return;}
    s.equip[slot]=id;saveShop(s);draw();onChange(slot);
    toast(id?`${by[id].name} equipped`:'Back to default');
  };
  draw();
}

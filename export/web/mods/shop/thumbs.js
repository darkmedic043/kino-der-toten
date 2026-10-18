// Reward / item thumbnails (a 2D preview box) shared by the Shop tab and the Melon Pass tab.
// makeThumb({camos, chars}) → thumb(item) returning '<div class="pv">…</div>' (camo swatches fill in later via fillSwatches).
import { camoSwatch } from '../weapon-levels/camo.js';
import { cardSvg } from './card.js';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const iconUrl=ch=>new URL('../characters/'+ch.icon,import.meta.url).href;
export function makeThumb({camos,chars}){
  const camoOf=item=>camos.camos.find(c=>c.id===item.data?.camo);
  const charOf=item=>chars.characters.find(c=>c.id===item.data?.character);
  return function thumb(item){
  const d=item.data??{};
  if(item.cat==='camo'){const c=camoOf(item);return `<div class="pv" data-swatch="${c?.id}" style="background-image:url(${camoSwatch(c)})"></div>`;}
  if(item.cat==='card')return `<div class="pv">${cardSvg(d,'SURVIVOR','LEVEL 1')}</div>`;
  if(item.cat==='perk')return `<div class="pv" style="background:url(${new URL('../perks-plus/'+(d.icon.includes('/')?'':'icons/')+d.icon,import.meta.url).href}) center/62% no-repeat,radial-gradient(circle,${d.color?d.color+'55':'#3a0a14'},#0a0204)"></div>`;   // perk unlocks (pass): the perk's HUD icon (perks-plus/icons/<file>, or a path under perks-plus/ for the Reaper ones)
  if(item.cat==='outfit'){const ch=charOf(item);   // operators with a rendered icon (characters.json "icon", next to the models) show it
    const bg=`linear-gradient(135deg,${ch?.color} 0 55%,${ch?.accent} 55%)`;
    return ch?.icon?`<div class="pv" style="background:url(${iconUrl(ch)}) center/contain no-repeat,${bg}"></div>`:`<div class="pv" style="background:${bg}"></div>`;}
  if(d.char||d.hitmarker)return `<div class="pv" style="color:${d.color};font-size:46px">${esc(d.char??d.hitmarker)}</div>`;
  if(d.blood)return `<div class="pv" style="background:radial-gradient(circle,${d.blood} 0 18%,${d.blood}55 30%,transparent 55%),#111"></div>`;
  if(d.hud)return `<div class="pv" style="background:linear-gradient(90deg,${d.hud.points} 0 33%,${d.hud.round} 33% 66%,${d.hud.ring} 66%)"></div>`;
  if(d.menu||d.frame)return `<div class="pv" style="box-shadow:inset 0 0 0 6px ${d.menu??d.frame};background:#111"></div>`;
  if(d.box)return `<div class="pv" style="background:radial-gradient(circle,#fff 0 6%,${d.box} 12%,${d.box}33 35%,transparent 60%),#0a0a0a"></div>`;
  if(d.hits)return `<div class="pv" style="font-size:40px;color:#f0c060">♪</div>`;
  return '<div class="pv"></div>';
}
}

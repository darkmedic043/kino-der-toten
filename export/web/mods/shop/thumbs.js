// Reward / item thumbnails (a 2D preview box) shared by the Shop tab and the Melon Pass tab.
// makeThumb({camos, chars, charms, stickers}) → thumb(item) returning '<div class="pv">…</div>' (camo swatches fill in later via
// fillSwatches; weapons, melees, equipment and charms carry data-wthumb="<weapon id | model:url>" for a 3D picture the page
// renders when it can (home.js thumb, passed to the Pass tab as weaponThumb), over a glyph shown until then).
import { camoSwatch } from '../weapon-levels/camo.js';
import { cardSvg } from './card.js';
import { killFxSvg, titlePlate } from './cosmetic-art.js';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const iconUrl=ch=>new URL('../characters/'+ch.icon,import.meta.url).href;
const MODS=new URL('../',import.meta.url).href;
// a gun screen: its housing (slab or the taller field unit with buttons) in its trim colour, the display lit in its tint
function screenSvg(sc){
  const t=sc?.tint??'#8fffb0',tr=sc?.trim??'#555',field=sc?.housing==='field',k=sc?.kind;
  const body=k==='kills'?`<text x="60" y="47" text-anchor="middle" font-family="monospace" font-weight="700" font-size="20" fill="${t}">127</text><text x="60" y="58" text-anchor="middle" font-family="monospace" font-size="7" fill="${t}" opacity=".7">KILLS · 41 HS</text>`
    :k==='ammo'?`<text x="60" y="49" text-anchor="middle" font-family="monospace" font-weight="700" font-size="20" fill="${t}">30</text><rect x="38" y="53" width="44" height="3" fill="${t}" opacity=".35"/><rect x="38" y="53" width="30" height="3" fill="${t}"/>`
    :k==='buddy'?`<circle cx="60" cy="44" r="13" fill="${t}"/><circle cx="55" cy="41" r="2" fill="#0a0a0a"/><circle cx="65" cy="41" r="2" fill="#0a0a0a"/><path d="M54 48q6 5 12 0" stroke="#0a0a0a" stroke-width="2" fill="none"/>`
    :`<path d="M44 40a16 16 0 0 0 32 0z" fill="#3fa34d"/><path d="M47 40a13 13 0 0 0 26 0z" fill="${t}"/><circle cx="54" cy="45" r="1.4" fill="#111"/><circle cx="60" cy="48" r="1.4" fill="#111"/><circle cx="66" cy="45" r="1.4" fill="#111"/>`;
  const h=field?62:50,y=field?14:20;
  return `<svg viewBox="0 0 120 90" style="height:100%;width:auto;max-width:100%" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="${y-6}" width="72" height="${h+12}" rx="5" fill="#1a1c1e" stroke="${tr}" stroke-width="3"/>
    <rect x="31" y="${y}" width="58" height="${h-(field?14:0)}" rx="2" fill="#050807"/><rect x="31" y="${y}" width="58" height="${h-(field?14:0)}" rx="2" fill="${t}" opacity=".08"/>${body}
    ${field?`<circle cx="44" cy="${y+h-4}" r="3" fill="${tr}"/><circle cx="60" cy="${y+h-4}" r="3" fill="${tr}"/><circle cx="76" cy="${y+h-4}" r="3" fill="${tr}"/>`:''}</svg>`;
}
export function makeThumb({camos,chars,charms,stickers}){
  const camoOf=item=>camos.camos.find(c=>c.id===item.data?.camo);
  const charOf=item=>chars.characters.find(c=>c.id===item.data?.character);
  return function thumb(item){
  const d=item.data??{};
  if(item.cat==='pack')return `<div class="pv" style="background:url(${new URL('../weapon-levels/games/'+esc(d.game)+'.webp',import.meta.url).href}) center/auto 62% no-repeat,radial-gradient(circle at 50% 40%,#3a2a14,#0a0806 70%)"></div>`;   // weapon packs: the game's logo
  if(item.cat==='camo'){const c=camoOf(item);return `<div class="pv" data-swatch="${c?.id}" style="background-image:url(${camoSwatch(c)})"></div>`;}
  if(d.killfx)return `<div class="pv">${killFxSvg(d.killfx)}</div>`;   // kill effects: a looping picture of the effect
  if(d.emblem&&/^\/mods\/[\w./-]+$/.test(d.emblem))return `<div class="pv" style="display:grid;place-items:center;background:radial-gradient(circle,#2a251d,#0a0908)"><img src="${esc(d.emblem)}" alt="" loading="lazy" style="height:84%;aspect-ratio:1;object-fit:contain"></div>`;   // emblems: the badge (animated WebP plays by itself)
  if(d.title)return `<div class="pv">${titlePlate(d.title)}</div>`;   // titles: a nameplate
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
  // Season 1 kinds (2026-11-08): stickers show their image, gun screens a drawing, the rest a 3D picture filled in by the page
  if(d.sticker){const st=stickers?.stickers.find(x=>x.id===d.sticker);return st?`<div class="pv" style="background:url(${MODS}stickers/${esc(st.image)}) center/contain no-repeat,radial-gradient(circle,#2a2a2a,#0a0a0a)"></div>`:'<div class="pv"></div>';}
  if(d.screen)return `<div class="pv">${screenSvg(charms?.screens?.find(x=>x.id===d.screen))}</div>`;
  if(d.charm){const c=charms?.charms.find(x=>x.id===d.charm);return `<div class="pv" style="font-size:34px;color:#c9a227"${c?.model?` data-wthumb="model:${MODS}charms/${esc(c.model)}"`:''}>❖</div>`;}
  if(d.class)return `<div class="pv" style="background:${d.icon?`url(${MODS}${esc(d.icon)}) center/auto 78% no-repeat,`:''}radial-gradient(circle,${d.color??'#888'}66,#060a04 75%)"></div>`;
  if(d.weapon)return `<div class="pv" style="font-size:30px;color:#f0c060" data-wthumb="${esc(d.weapon)}">✦</div>`;
  if(d.equipment)return `<div class="pv" style="font-size:30px;color:#f0c060" data-wthumb="${esc(d.equipment)}">✹</div>`;
  return '<div class="pv"></div>';
}
}

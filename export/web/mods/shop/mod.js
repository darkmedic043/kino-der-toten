// Shop cosmetics in a match (roadmap Phase 6). Read once at load and on a new game; looks and sounds only.
//   reticle / hitmarker: #crosshair and #hitmarker text and colour (and the red dot sight's colour)
//   kill: the colour of the engine's hit burst (effect events in its default blood colour)
//   hud / frame: CSS variables the hud-bo7 layout reads; sound: window.kino.hitSoundSet (the hud mod's thumps, or its recorded samples)
//   glow: window.kino.boxGlow (the lighting mod's Mystery Box map bulb and lamp); card: shown in the pause menu
//   killfx: what plays on your kills (kill-fx.js); title: shown with your name on the pause card, the co-op lobby and the
//   scoreboard (window.kino.titleOf(itemId): peers send an item id, never text); emblem: a badge at the card's left end and
//   the avatar square on the scoreboard and in the co-op lobby (window.kino.emblemOf(itemId), the same way)
import { loadCatalog, cosmetics, installRewards } from './shop.js';
import { cardSvg, safePath, PLAIN_CARD } from './card.js';
import { installKillFx } from './kill-fx.js';
import { loadProfile } from '../../profile.js';
import { loadPrestige, prestigeName } from '../prestige/prestige.js';

export default async function setup(api){
  const {host,mod}=api;
  installRewards();
  const cat=await loadCatalog(mod.url);
  const style=document.createElement('style');style.id='shop-cosmetics';document.head.append(style);
  const card=document.createElement('div');card.id='pause-card';
  let C={};
  function apply(){
    C=cosmetics(cat);const css=[];
    const ch=document.getElementById('crosshair');if(ch&&C.reticle){ch.textContent=C.reticle.char;ch.style.color=C.reticle.color;}
    if(C.reticle)css.push(`#reflex-dot{background:${C.reticle.color}!important;box-shadow:0 0 6px ${C.reticle.color}!important}`);
    const hm=document.getElementById('hitmarker');if(hm&&C.hitmarker){hm.textContent=C.hitmarker.hitmarker;hm.style.color=C.hitmarker.color;}
    if(C.hud)css.push(`body.bo7-hud{--bo7-ess:${C.hud.hud.points}}#bo7-round .n{color:${C.hud.hud.round}!important;text-shadow:0 2px 2px #000,0 0 18px ${C.hud.hud.round}66!important}#bo7-right .dial .mag{stroke:${C.hud.hud.ring}!important;filter:drop-shadow(0 0 4px ${C.hud.hud.ring}88)!important}`);
    if(C.frame)css.push(`#bo7-left .pf{border-color:${C.frame.frame}!important;box-shadow:0 0 10px ${C.frame.frame}66,inset 0 0 0 1px ${C.frame.frame}}#hud-portrait img{border-color:${C.frame.frame}!important}`);
    style.textContent=css.join('\n');
    // a set with samples (recorded hit sounds, files in sounds/) hands the hud mod their URLs
    const hs=C.sound?.hits;window.kino.hitSoundSet=hs?{...hs,samples:hs.samples?.map(f=>new URL('sounds/'+f,mod.url).href)}:null;
    window.kino.boxGlow=C.glow?.box??null;
    // the calling card in the pause menu, under the map title
    const p=loadProfile(),pr=loadPrestige().player.prestige;
    if(C.card||C.emblem){card.innerHTML=cardSvg(C.card??PLAIN_CARD,(p.name??document.querySelector('#account .name')?.textContent)||'Survivor',`${C.title?C.title.title.toUpperCase()+' · ':''}LEVEL ${p.level}${pr?' · '+prestigeName(pr):''}`,C.emblem?.emblem);
      const anchor=document.querySelector('#menu .menu-content .tagline')??document.getElementById('map-tagline');if(anchor&&card.previousElementSibling!==anchor)anchor.after(card);}
    else if(C.title){card.innerHTML=`<div class="pc-title">${String(C.title.title).replace(/[&<>"]/g,'')}</div>`;   // a title with no card: the title alone
      const anchor=document.querySelector('#menu .menu-content .tagline')??document.getElementById('map-tagline');if(anchor&&card.previousElementSibling!==anchor)anchor.after(card);}
    else card.remove();
  }
  const blood=0x9e3023;
  host.on('effect',e=>{if(C.kill&&e.color===blood)e.color=parseInt(C.kill.blood.slice(1),16);});
  const css2=document.createElement('style');css2.textContent='#pause-card{margin:10px 0 4px;max-width:320px}#pause-card svg{display:block;width:100%;height:auto}#pause-card .pc-title{color:#f0c060;font:700 13px/1 \'Barlow Condensed\',Arial Narrow,sans-serif;letter-spacing:.16em;text-transform:uppercase}';document.head.append(css2);
  apply();host.on('start',apply);addEventListener('focus',apply);
  installKillFx(api,()=>C.killfx);
  const by=Object.fromEntries(cat.items.map(i=>[i.id,i]));
  window.kino.emblemOf=id=>typeof id==='string'&&safePath(by[id]?.data?.emblem)||null;
  window.kino.titleOf=id=>typeof id==='string'&&by[id]?.data?.title||null;
  window.kino.cosmetics={get equipped(){return {...C};},apply};
}

// Shop cosmetics in a match (roadmap Phase 6). Read once at load and on a new game; looks and sounds only.
//   reticle / hitmarker: #crosshair and #hitmarker text and colour (and the red dot sight's colour)
//   kill: the colour of the engine's hit burst (effect events in its default blood colour)
//   hud / frame: CSS variables the hud-bo7 layout reads; sound: window.kino.hitSoundSet (the hud mod's thumps)
//   glow: window.kino.boxGlow (the lighting mod's Mystery Box map bulb and lamp); card: shown in the pause menu
import { loadCatalog, cosmetics, installRewards } from './shop.js';
import { cardSvg } from './card.js';
import { loadProfile } from '../../profile.js';
import { loadPrestige } from '../prestige/prestige.js';

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
    window.kino.hitSoundSet=C.sound?.hits??null;
    window.kino.boxGlow=C.glow?.box??null;
    // the calling card in the pause menu, under the map title
    const p=loadProfile(),pr=loadPrestige().player.prestige;
    if(C.card){card.innerHTML=cardSvg(C.card,(p.name??document.querySelector('#account .name')?.textContent)||'Survivor',`LEVEL ${p.level}${pr?' · PRESTIGE '+pr:''}`);
      const anchor=document.querySelector('#menu .menu-content .tagline')??document.getElementById('map-tagline');if(anchor&&card.previousElementSibling!==anchor)anchor.after(card);}
    else card.remove();
  }
  const blood=0x9e3023;
  host.on('effect',e=>{if(C.kill&&e.color===blood)e.color=parseInt(C.kill.blood.slice(1),16);});
  const css2=document.createElement('style');css2.textContent='#pause-card{margin:10px 0 4px;max-width:320px}#pause-card svg{display:block;width:100%;height:auto}';document.head.append(css2);
  apply();host.on('start',apply);addEventListener('focus',apply);
  window.kino.cosmetics={get equipped(){return {...C};},apply};
}

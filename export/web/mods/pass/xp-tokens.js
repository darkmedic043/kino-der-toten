// Timed double-XP tokens (2026-11-07, user: "double xp tokens… one for player and weapon, 1 hour long and only go down in
// game time, can be equipped mid game in the pause menu or before starting a match in the play menu"). Melon Pass rewards
// ({type:'token', kind:'playerXp'|'weaponXp', hours}), one token per hour.
//
// Saved in the pass store (kino.mods.pass, cloud-synced): xpTokens {playerXp, weaponXp} = tokens held, xpLeft {…} = seconds
// left on the running one. Using a token adds an hour (another one while it runs adds to it). The clock only runs while a
// match is being played (the engine's update: not while paused, not in the menus) and not in a cheat game (it earns no XP).
// While one runs, window.kino.xpMul(kind) is 2: progression's grant (player XP) and weapon-levels' kill XP multiply by it.
// The older per-match tokens (boosts, Season 0's removed rewards) still count; the two never stack past double.
import { loadPass, savePass } from './pass.js';

export const XP_TOKEN_KINDS=['playerXp','weaponXp'];
export const XP_TOKEN_NAMES={playerXp:'PLAYER XP',weaponXp:'WEAPON XP'};
export const TOKEN_SECONDS=3600;
export const xpHeld=(p,k)=>Math.max(0,+p?.xpTokens?.[k]||0);
export const xpLeft=(p,k)=>Math.max(0,+p?.xpLeft?.[k]||0);
export const xpAny=p=>XP_TOKEN_KINDS.some(k=>xpHeld(p,k)||xpLeft(p,k));

// Start (or extend) a kind's double XP with one token. False when none is held.
export function useXpToken(p,k){
  if(!XP_TOKEN_KINDS.includes(k)||!xpHeld(p,k))return false;
  p.xpTokens[k]=xpHeld(p,k)-1;p.xpLeft[k]=xpLeft(p,k)+TOKEN_SECONDS;return true;
}
// Run the clocks for dt seconds of play. Returns the kinds that just ran out.
export function tickXpTokens(p,dt){
  const ended=[];
  for(const k of XP_TOKEN_KINDS){const l=xpLeft(p,k);if(l>0){p.xpLeft[k]=Math.max(0,l-dt);if(!p.xpLeft[k])ended.push(k);}}
  return ended;
}
export const fmtLeft=s=>{s=Math.ceil(s);const h=s/3600|0,m=(s%3600)/60|0,x=s%60,two=n=>String(n).padStart(2,'0');return h?`${h}:${two(m)}:${two(x)}`:`${m}:${two(x)}`;};

export const XP_TOKEN_CSS=`.xpt{margin:8px 0;display:grid;gap:5px;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.08em;color:#b9b2a3}
.xpt-h{color:#7fd8ff;font-size:11px;letter-spacing:.14em}.xpt-h small{color:#8d8678;font-weight:500;letter-spacing:.06em;margin-left:6px}
.xpt-k{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:5px 8px;border:1px solid #ffffff1c;background:#0000002e}
.xpt-k.on{border-color:#7fd8ff80;background:#7fd8ff14}.xpt-k em{font-style:normal;color:#8d8678;font-variant-numeric:tabular-nums}.xpt-k.on em{color:#7fd8ff}
.xpt-k button{font:700 10px/1 system-ui,sans-serif;letter-spacing:.12em;padding:6px 9px;color:#0b0f12;background:#7fd8ff;border:0;cursor:pointer}
.xpt-k button:disabled{background:#ffffff14;color:#8d8678;cursor:default}
.xpt-k>*{white-space:nowrap}.xpt-h small{display:block;margin:3px 0 0}
.xpt-k{grid-template-columns:1fr auto;row-gap:2px}.xpt-k em{grid-row:2;font-size:10px}.xpt-k button{grid-column:2;grid-row:1/3}   /* the menu panel is narrow: time under the name */
#xpt-panel .xpt{grid-template-columns:auto auto auto;justify-content:start;align-items:center;margin:6px 0 10px;gap:6px}#xpt-panel .xpt-h{white-space:nowrap}#xpt-panel .xpt-h small{display:none}
#xpt-panel .xpt-k{grid-template-columns:auto auto auto;gap:8px;padding:3px 6px}#xpt-panel .xpt-k em{grid-row:auto;font-size:inherit}#xpt-panel .xpt-k button{grid-column:auto;grid-row:auto}#xpt-panel .xpt-k button{padding:4px 7px}`;   // the pause menu: one row

// The DOUBLE XP strip (pause menu and the menu's PLAY panel): each kind's tokens, time left and a USE button.
// Nothing when no token is held or running.
export function xpTokenHtml(p){
  if(!xpAny(p))return '';
  return `<div class="xpt"><b class="xpt-h">DOUBLE XP<small>1 hour a token · counts down only in play</small></b>${XP_TOKEN_KINDS.map(k=>{const n=xpHeld(p,k),l=xpLeft(p,k);
    return `<div class="xpt-k${l>0?' on':''}"><span>${XP_TOKEN_NAMES[k]}</span><em>${l>0?fmtLeft(l)+' LEFT':'OFF'}</em>`+
      `<button data-xp-use="${k}"${n?'':' disabled'} title="${n} token${n===1?'':'s'}">${l>0?'+1 HOUR':'USE'} · ${n}</button></div>`;}).join('')}</div>`;
}

// The menu side (home.js PLAY panel): fills el, uses a token on click. onUse(kind) after a token is used.
export function mountXpTokens(el,{onUse}={}){
  if(!document.getElementById('xpt-css')){const c=document.createElement('style');c.id='xpt-css';c.textContent=XP_TOKEN_CSS;document.head.append(c);}
  const draw=()=>{el.innerHTML=xpTokenHtml(loadPass());};
  el.onclick=e=>{const b=e.target.closest('[data-xp-use]');if(!b)return;e.preventDefault();e.stopPropagation();
    const p=loadPass();if(useXpToken(p,b.dataset.xpUse)){savePass(p);onUse?.(b.dataset.xpUse);}draw();};
  draw();return draw;
}

// The game side (pass/mod.js): getP returns the pass mod's live store object (one object, so neither side saves over the other).
export function installXpTokens(api,getP){
  const {host}=api;
  const cheating=()=>!!window.kino.cheats?.used;
  window.kino.xpMul=k=>Math.max(window.kino.boost?.[k]??1,!cheating()&&xpLeft(getP(),k)>0?2:1);
  let unsaved=0;const save=()=>{unsaved=0;savePass(getP());};
  host.on('update',dt=>{
    if(cheating()||!(dt>0)||!XP_TOKEN_KINDS.some(k=>xpLeft(getP(),k)>0))return;
    const ended=tickXpTokens(getP(),Math.min(dt,.25));unsaved+=dt;
    for(const k of ended)api.toast?.(`DOUBLE ${XP_TOKEN_NAMES[k]} ran out${xpHeld(getP(),k)?` · ${xpHeld(getP(),k)} token${xpHeld(getP(),k)>1?'s':''} left · pause menu to use one`:''}`,5);
    if(ended.length||unsaved>30)save();
  });
  host.on('gameOver',save);host.on('reset',()=>{if(unsaved)save();});   // before pass/mod.js reloads its store at the next start
  addEventListener('pagehide',()=>{if(unsaved)save();});
  host.on('start',()=>{const on=XP_TOKEN_KINDS.filter(k=>xpLeft(getP(),k)>0);
    if(on.length)setTimeout(()=>api.toast?.('DOUBLE XP · '+on.map(k=>`${XP_TOKEN_NAMES[k]} ${fmtLeft(xpLeft(getP(),k))}`).join(' · '),4),4500);});   // after the match-start boost toast
  // pause menu: under the status line
  const css=document.createElement('style');css.textContent=XP_TOKEN_CSS;document.head.append(css);
  const panel=document.createElement('div');panel.id='xpt-panel';let last='';
  panel.addEventListener('click',e=>{const b=e.target.closest('[data-xp-use]');if(!b)return;e.stopPropagation();const k=b.dataset.xpUse;
    if(useXpToken(getP(),k)){save();api.toast?.(`DOUBLE ${XP_TOKEN_NAMES[k]} · ${fmtLeft(xpLeft(getP(),k))} of play`,3);}draw();});
  function draw(){
    const html=xpTokenHtml(getP());if(html!==last){last=html;panel.innerHTML=html;}
    const a=document.getElementById('menu-status');   // right under "Paused · Round n", above the panels (the menu runs past the fold)
    if(a&&a.nextElementSibling!==panel)a.after(panel);
  }
  setInterval(draw,1000);draw();   // the menu shows before the first frame and while paused, when no update runs
  window.kino.xpTokens={get state(){return getP();},use:k=>{const ok=useXpToken(getP(),k);if(ok)save();draw();return ok;}};
}

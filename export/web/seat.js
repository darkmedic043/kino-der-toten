// Split screen seats (not part of upstream; 2026-10-19). The Rind launcher can run two copies of the game in one window,
// one per Discord account (~/projects/rind src/split.js), as a co-op room. Each copy gets `window.rindSeat` from Rind:
// {seat: 1|2, players, keyboard, pad, name}. `pad` is which connected controller is this player's (an index into the
// connected ones in navigator.getGamepads() order, the same in both copies; null = none) and `keyboard` whether the
// keyboard and mouse are. Everything that reads a controller goes through seatPad(), so each copy follows only its own
// player's; outside split screen it is the first connected controller, as before. A controller-only seat never pauses on
// window blur (engine.js checks padOnly(): that half has no focus to keep). A small tag names the player for a few
// seconds after loading and when Rind swaps the controllers (F8).
const bridge=globalThis.rindSeat??null;
let info=null;try{info=bridge?.info?.()??null;}catch{}
const listeners=new Set();
export const seat=()=>info;
export const onSeatChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
// a controller-only seat (player 2, or player 1 without the keyboard)
export const padOnly=()=>!!info&&!info.keyboard;
export function seatPad(){
  const pads=[...(navigator.getGamepads?.()??[])].filter(g=>g&&g.connected);
  if(!info)return pads[0]??null;
  return info.pad==null?null:pads[info.pad]??null;
}

if(info){
  bridge.onChange?.(i=>{info=i;showTag();for(const fn of listeners)fn(i);});
  let tag=null,hideTimer=0;
  function showTag(){
    if(!document.body){addEventListener('DOMContentLoaded',showTag,{once:true});return;}
    if(!tag){tag=document.createElement('div');tag.id='seat-tag';
      tag.style.cssText='position:fixed;left:12px;top:12px;z-index:100000;pointer-events:none;padding:6px 10px;border-radius:4px;background:#000c;color:#eee8dc;font:700 11px/1.3 Arial,sans-serif;letter-spacing:2px;transition:opacity .6s;border-left:3px solid';
      document.body.append(tag);}
    const how=[info.keyboard&&'KEYBOARD & MOUSE',info.pad!=null&&(seatPad()?'CONTROLLER '+(info.pad+1):'CONTROLLER '+(info.pad+1)+' (PRESS A BUTTON)')].filter(Boolean).join(' + ');
    tag.textContent=`P${info.seat} · ${String(info.name||'PLAYER').toUpperCase()} · ${how}`;
    tag.style.borderLeftColor=info.seat===1?'#e0343e':'#58b04a';
    tag.style.opacity=1;clearTimeout(hideTimer);hideTimer=setTimeout(()=>{tag.style.opacity=0;},6000);
  }
  showTag();
}

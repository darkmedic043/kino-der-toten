// Gamepad menu navigation (not part of upstream). Moves a focus ring over the clickable things of a
// menu (buttons, links, inputs, tabs, and any element that registered a click listener), in the
// direction of the D-pad or left stick: the nearest candidate in that direction wins, with a
// penalty for sideways offset. South (Cross/A) activates, east (Circle/B) goes back, L1/R1 cycle the
// first tab strip in scope, L2/R2 the second, sliders adjust with left/right while focused. Start is
// the page's own action (resume, play). Used by mods/controller in the game (fed its button state
// every frame) and standalone on the main menu (installGamepadNav polls the Gamepad API itself).
// Import it before anything that builds menu elements: it records click listeners as they are added.
import { seatPad } from './seat.js';   // split screen (Rind): only this player's controller
const clickable=new WeakSet();
if(typeof EventTarget!=='undefined'&&!EventTarget.prototype.addEventListener.__padNav){
  const orig=EventTarget.prototype.addEventListener;
  const patched=function(type,...rest){if(type==='click'&&this instanceof Element)clickable.add(this);return orig.call(this,type,...rest);};
  patched.__padNav=true;EventTarget.prototype.addEventListener=patched;
}
const CONTROLS='button,a[href],input:not([type=hidden]),select,textarea,[role=tab],[tabindex]:not([tabindex="-1"])';
const DEFAULT_TABS='#tabs,.settings-tabs,#armory-nav,[role=tablist],#map-filter';
const CSS=`#pad-ring{position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;box-sizing:border-box;border:2px solid #8fdc73;border-radius:6px;background:#8fdc7318;box-shadow:0 0 0 4px #8fdc7326,0 0 18px #8fdc7355;opacity:0;transition:transform .14s cubic-bezier(.2,.8,.2,1),width .14s cubic-bezier(.2,.8,.2,1),height .14s cubic-bezier(.2,.8,.2,1),opacity .15s}
#pad-ring.on{opacity:1}#pad-ring.press{animation:pad-press .18s ease-out}
@keyframes pad-press{50%{background:#8fdc7355;box-shadow:0 0 0 7px #8fdc7340,0 0 26px #8fdc7388}}
#pad-nav-hint{position:fixed;right:18px;bottom:14px;z-index:40;display:none;gap:14px;align-items:center;font:600 9px/1 Arial,Helvetica,sans-serif;letter-spacing:1.5px;color:#b9b2a0;text-shadow:0 1px 3px #000;pointer-events:none}
body.using-pad #pad-nav-hint{display:flex}#pad-nav-hint i{display:inline-block;width:16px;height:16px;margin-right:5px;vertical-align:middle;background:center/contain no-repeat}`;
const REPEAT_FIRST=400,REPEAT=110;

export const visible=el=>{if(!el||!el.isConnected||el.hidden)return false;if(el.closest('[hidden]'))return false;const r=el.getBoundingClientRect();if(r.width<=0||r.height<=0)return false;return el.checkVisibility?el.checkVisibility({checkVisibilityCSS:true}):true;};
const centre=r=>[r.left+r.width/2,r.top+r.height/2];

export class GamepadNav{
  constructor({scope=()=>document.body,initial=null,onBack=null,onStart=null,tabGroups=DEFAULT_TABS,hint=true}={}){
    this.scope=scope;this.initial=initial;this.onBack=onBack;this.onStart=onStart;this.tabGroups=tabGroups;
    this.current=null;this.held={};this.enabled=true;
    if(typeof document!=='undefined'){
      if(!document.getElementById('pad-nav-css')){const st=document.createElement('style');st.id='pad-nav-css';st.textContent=CSS;document.head.append(st);}
      if(hint&&!document.getElementById('pad-nav-hint')){const h=document.createElement('div');h.id='pad-nav-hint';document.body.append(h);this.hintEl=h;}
      this.ring=document.getElementById('pad-ring')||Object.assign(document.createElement('div'),{id:'pad-ring'});document.body.append(this.ring);
      let q=0;new MutationObserver(()=>{if(!q)q=requestAnimationFrame(()=>{q=0;this.reacquire();});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','disabled']});
      const track=()=>{requestAnimationFrame(track);this.place();};requestAnimationFrame(track);
      for(const t of ['mousemove','mousedown','keydown'])addEventListener(t,e=>{if(e.isTrusted&&!e.remapped)this.clear();},true);
    }
  }
  // The glyph strip in the corner (brand from mods/controller/glyphs.js).
  setHints(glyphUrl,brand){
    if(!this.hintEl)return;const g=b=>`<i style="background-image:${glyphUrl(brand,b)}"></i>`;
    this.hintEl.innerHTML=`<span>${g('south')}SELECT</span><span>${g('east')}BACK</span><span>${g('lb')}${g('rb')}TABS</span><span>${g('start')}${this.startLabel??'PLAY'}</span>`;
  }
  candidates(){
    const root=this.scope()??document.body,out=[];if(!root)return out;
    for(const el of root.querySelectorAll('*')){
      if(el.disabled||el.id==='pad-nav-hint')continue;
      if(!(el.matches(CONTROLS)||clickable.has(el)||typeof el.onclick==='function'))continue;
      if(el.closest('.value-edit')||!visible(el))continue;
      out.push(el);
    }
    return out;
  }
  // A button's identity, to find it again after the page rebuilt that part of itself.
  keyOf(el){
    const own=el.id||[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>a.name+'='+a.value).join('&');
    if(own)return own;const up=el.parentElement?.closest('[id]');
    return (up?up.id:'')+'>'+el.tagName+':'+el.textContent.trim().slice(0,30)+'#'+[...(el.parentElement?.children??[])].indexOf(el);
  }
  place(){
    const r=this.ring,el=this.current;if(!r)return;
    if(!el||!el.isConnected||!document.body.classList.contains('using-pad')){r.classList.remove('on');return;}
    const b=el.getBoundingClientRect(),p=3;if(!b.width){r.classList.remove('on');return;}
    r.style.width=b.width+p*2+'px';r.style.height=b.height+p*2+'px';r.style.transform=`translate(${b.left-p}px,${b.top-p}px)`;
    r.style.borderRadius=(parseFloat(getComputedStyle(el).borderRadius)||5)+p+'px';r.classList.add('on');
  }
  flash(){const r=this.ring;if(!r)return;r.classList.remove('press');void r.offsetWidth;r.classList.add('press');}
  // The page rebuilt itself: keep the highlight on the same button, or the nearest one to where it was.
  reacquire(){
    if(!this.current||!document.body.classList.contains('using-pad'))return;
    if(this.current.isConnected&&visible(this.current)){this.lastRect=this.current.getBoundingClientRect();return;}
    const list=this.candidates();if(!list.length)return;
    const same=list.find(e=>this.keyOf(e)===this.currentKey);if(same){this.current=same;return;}
    if(this.lastRect){const [x,y]=centre(this.lastRect),d=e=>{const [p,q]=centre(e.getBoundingClientRect());return Math.hypot(p-x,q-y);};this.focus(list.reduce((a,b)=>d(a)<=d(b)?a:b));}
  }
  focus(el){
    if(this.current===el)return;
    this.current?.classList.remove('pad-focus');this.current=el;this.currentKey=el?this.keyOf(el):null;if(!el)return;
    el.classList.add('pad-focus');
    document.body.classList.add('using-pad');
    try{el.focus({preventScroll:true});}catch{}
    el.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  clear(){this.current?.classList.remove('pad-focus');this.current=null;this.ring?.classList.remove('on');}
  // The element to start from when nothing is focused: the page's choice, else the top-left candidate.
  start(){
    const init=typeof this.initial==='function'?this.initial():this.initial;
    const list=this.candidates();
    const el=(init&&visible(init)&&list.includes(init))?init:list.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return (ra.top-rb.top)||(ra.left-rb.left);})[0];
    if(el)this.focus(el);return !!el;
  }
  move(dir){
    if(this.current&&!this.candidates().includes(this.current)){const same=this.candidates().find(e=>this.keyOf(e)===this.currentKey);if(same)this.current=same;}
    if(!this.current||!visible(this.current)||!this.candidates().includes(this.current)){this.clear();return this.start();}
    const from=this.current.getBoundingClientRect(),[fx,fy]=centre(from);
    const dx=dir==='left'?-1:dir==='right'?1:0,dy=dir==='up'?-1:dir==='down'?1:0;
    let best=null,bestScore=Infinity;
    for(const el of this.candidates()){
      if(el===this.current)continue;const r=el.getBoundingClientRect();
      // it must lie beyond the current element's edge in that direction (a little overlap allowed)
      const beyond=dx>0?r.left-from.right:dx<0?from.left-r.right:dy>0?r.top-from.bottom:from.top-r.bottom;
      if(beyond<-Math.min(8,(dx?from.width:from.height)*.3))continue;
      const [cx,cy]=centre(r),ax=cx-fx,ay=cy-fy,along=dx?ax*dx:ay*dy,across=dx?Math.abs(ay):Math.abs(ax);
      if(along<=0)continue;
      // the nearest edge wins (the next row, not the one after it); overlap on the cross axis is rewarded, so a
      // row below counts as "down" even when its centre is off to the side
      const overlap=dx?Math.max(0,Math.min(from.bottom,r.bottom)-Math.max(from.top,r.top)):Math.max(0,Math.min(from.right,r.right)-Math.max(from.left,r.left));
      const score=Math.max(0,beyond)*2+across*(overlap>0?.6:2.5);
      if(score<bestScore){bestScore=score;best=el;}
    }
    if(best)this.focus(best);return !!best;
  }
  activate(){
    const el=this.current;if(!el||!visible(el))return this.start();
    if(el.matches('input[type=range]'))return true;   // adjusted with left/right
    this.flash();el.click();return true;
  }
  // Left/right on a slider: a step; on anything else, a move.
  adjust(delta){
    const el=this.current;if(!el?.matches?.('input[type=range]'))return false;
    delta>0?el.stepUp():el.stepDown();el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }
  groups(){const root=this.scope()??document.body;return [...root.querySelectorAll(this.tabGroups)].filter(visible);}
  cycle(index,delta){
    const g=this.groups()[index];if(!g)return false;
    const tabs=[...g.querySelectorAll('button,[role=tab],a')].filter(visible);if(tabs.length<2)return false;
    let i=tabs.findIndex(t=>t.classList.contains('active')||t.getAttribute('aria-selected')==='true');if(i<0)i=0;
    const next=tabs[(i+delta+tabs.length)%tabs.length];next.click();this.focus(next);return true;
  }
  back(){
    if(this.onBack?.()===true)return true;
    const e=new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true,cancelable:true});e.remapped=true;(document.body??window).dispatchEvent(e);return true;
  }
  // One frame of button state (booleans and the left stick); repeats held directions. Returns true when it did something.
  step(s,now=performance.now()){
    if(!this.enabled)return false;
    const dirs={up:s.up||s.ly<-.5,down:s.down||s.ly>.5,left:s.left||s.lx<-.5,right:s.right||s.lx>.5};
    let did=false;
    const edge=(name,down)=>{const h=this.held;if(down&&!h[name]){h[name]=now;h[name+'_n']=0;return true;}if(!down){delete h[name];return false;}
      const n=h[name+'_n'],due=h[name]+REPEAT_FIRST+n*REPEAT;if(now>=due){h[name+'_n']=n+1;return true;}return false;};
    for(const d of ['up','down','left','right'])if(edge(d,dirs[d])){did=true;if((d==='left'&&this.adjust(-1))||(d==='right'&&this.adjust(1)))continue;this.move(d);}
    const once=(name,down)=>{const was=this.held[name+'!'];this.held[name+'!']=down;return down&&!was;};
    if(once('a',s.a)){did=true;this.activate();}
    if(once('b',s.b)){did=true;this.back();}
    if(once('lb',s.lb)){did=true;this.cycle(0,-1);}if(once('rb',s.rb)){did=true;this.cycle(0,1);}
    if(once('lt',s.lt)){did=true;this.cycle(1,-1);}if(once('rt',s.rt)){did=true;this.cycle(1,1);}
    if(once('start',s.start)){did=true;this.flash();this.onStart?.();}
    if(did)document.body.classList.add('using-pad');
    return did;
  }
}

// Button state from a Gamepad (standard mapping).
export function padState(gp){
  const b=i=>!!gp.buttons[i]&&(gp.buttons[i].pressed||gp.buttons[i].value>.5);
  return {a:b(0),b:b(1),lb:b(4),rb:b(5),lt:b(6),rt:b(7),start:b(9),up:b(12),down:b(13),left:b(14),right:b(15),lx:gp.axes[0]??0,ly:gp.axes[1]??0};
}

// Standalone: polls the Gamepad API itself (the main menu, which loads no mods).
export function installGamepadNav(opts={}){
  const nav=new GamepadNav(opts);let brand=null;
  if(opts.glyphs){const {identify,glyphUrl}=opts.glyphs;nav.startLabel=opts.startLabel;
    const update=gp=>{const b=identify(gp.id).brand;if(b!==brand){brand=b;nav.setHints(glyphUrl,b);}};nav.updateBrand=update;}
  function frame(now){requestAnimationFrame(frame);
    const gp=seatPad();if(!gp)return;
    nav.updateBrand?.(gp);nav.step(padState(gp),now);}
  requestAnimationFrame(frame);return nav;
}

// Controller support (not part of upstream). Polls the Gamepad API every animation frame
// (also while paused, so Start resumes). The left stick feeds analog movement through
// kino.gamepad.move (read by engine.js); the right stick turns the camera; every
// button is sent as the key or mouse event the game and the other mods already listen for
// (default key codes, flagged `remapped` so the keybind remapper passes them through).
// Standard mapping, Xbox names (PlayStation: A=Cross, B=Circle, X=Square, Y=Triangle).
import { settings } from '../../settings.js';

const DEAD=.15;
// button index -> action
const KEYS={0:'Space',1:'KeyC',3:'KeyQ',4:'KeyX',5:'KeyG',11:'KeyV',12:'Digit4',13:'KeyZ',14:'Digit5',15:'KeyT',8:'KeyT'};
const FIRE=7,AIM=6,RELOAD=2,SPRINT=10,START=9;

export default async function setup(api){
  const {host,camera,renderer}=api;
  const pad=(window.kino??={}).gamepad={move:{forward:0,strafe:0,sprint:false},connected:false,last:0};
  // Sent to the page body like a real key press: dispatched on window itself, the game's own
// handlers (registered first) ran before the mods' capture-phase ones could claim the key (a
// grenade went off twice).
const key=(code,down)=>{const e=new KeyboardEvent(down?'keydown':'keyup',{code,key:code,bubbles:true,cancelable:true});e.remapped=true;(document.body??window).dispatchEvent(e);};
  const mouse=(button,down)=>renderer.domElement.dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,bubbles:true,cancelable:true}));
  const held=new Map();   // button -> what it is holding down (a key code or a mouse button)
  let prev=[],sprintLatch=false,useHeld=false,lastT=performance.now(),shots=api.session?.shots??0;
  const style=document.createElement('style');
  style.textContent='body.using-pad #prompt kbd{font-size:0}body.using-pad #prompt kbd::after{content:"X";font-size:12px}';
  document.head.append(style);
  addEventListener('gamepadconnected',e=>api.toast?.(`Controller connected · ${e.gamepad.id.replace(/\s*\(.*$/,'').slice(0,40)}`,3));
  addEventListener('gamepaddisconnected',()=>{release();api.toast?.('Controller disconnected',2);});
  // Mouse or keyboard use hands the prompts back to keyboard glyphs.
  for(const t of ['mousemove','keydown'])addEventListener(t,e=>{if(!e.remapped&&e.isTrusted)document.body.classList.remove('using-pad');},true);
  function release(){for(const [,h] of held)typeof h==='number'?mouse(h,false):key(h,false);held.clear();if(sprintLatch)key('ShiftLeft',false);sprintLatch=false;pad.move.forward=pad.move.strafe=0;}
  const hold=(b,what,down)=>{if(down&&!held.has(b)){held.set(b,what);typeof what==='number'?mouse(what,true):key(what,true);}else if(!down&&held.has(b)){const h=held.get(b);held.delete(b);typeof h==='number'?mouse(h,false):key(h,false);}};
  const stick=(x,y)=>{const m=Math.hypot(x,y);if(m<DEAD)return [0,0];const k=Math.min(1,(m-DEAD)/(1-DEAD))/m;return [x*k,y*k];};
  const rumble=(gp,strong,weak,ms)=>gp?.vibrationActuator?.playEffect?.('dual-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak}).catch(()=>{});
  let gpNow=null;
  host.on('beforeDamage',()=>rumble(gpNow,.7,.4,200));

  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min(.05,(now-lastT)/1000);lastT=now;
    const gp=[...(navigator.getGamepads?.()??[])].find(g=>g&&g.connected);gpNow=gp;
    pad.connected=!!gp;if(!gp){if(prev.length){release();prev=[];}return;}
    const b=gp.buttons.map(x=>x.value>.5||x.pressed),pressed=i=>b[i]&&!prev[i];
    const st=api.getState?.()??{};
    if(b.some(Boolean)||gp.axes.some(a=>Math.abs(a)>.3)){pad.last=now;document.body.classList.add('using-pad');}
    // Start: pause / resume (resuming needs no pointer lock; the right stick looks).
    if(pressed(START)||(!st.active&&st.ready&&pressed(0))){
      if(st.active)key('Escape',true);
      else if(st.ready){if(st.phase==='gameover')api.reset();api.setActive(true);}
      prev=b;return;
    }
    if(!st.active){if(held.size||sprintLatch)release();prev=b;return;}
    // Left stick: analog movement. L3 latches sprint until the stick is let go.
    const [lx,ly]=stick(gp.axes[0]??0,gp.axes[1]??0);pad.move.forward=-ly;pad.move.strafe=lx;
    if(pressed(SPRINT)&&Math.hypot(lx,ly)>.3&&!sprintLatch){sprintLatch=true;key('ShiftLeft',true);}
    if(sprintLatch&&(Math.hypot(lx,ly)<.3||ly>.2||b[AIM])){sprintLatch=false;key('ShiftLeft',false);}
    // Right stick: look, with a response curve (fine aim near the centre), slower aiming down sights.
    const [rx,ry]=stick(gp.axes[2]??0,gp.axes[3]??0),ads=b[AIM];
    const rate=3.4*(settings.sensitivity??1)*(ads?.5*(settings.adsSensitivity??1):1);
    const curve=v=>v*Math.abs(v);
    camera.rotation.y-=curve(rx)*rate*dt;
    camera.rotation.x=Math.max(-1.5,Math.min(1.5,camera.rotation.x-curve(ry)*rate*.75*dt*(settings.invertY?-1:1)));
    // Triggers: fire and aim (mouse buttons). Buttons: their keys, held as long as the button.
    hold(FIRE,0,b[FIRE]);hold(AIM,2,b[AIM]);
    for(const [i,code] of Object.entries(KEYS))hold(+i,code,b[+i]);
    // X: hold to use when there's a prompt (buy, repair, Pack-a-Punch), otherwise tap to reload.
    if(pressed(RELOAD)){const prompt=document.getElementById('prompt')?.textContent.trim();
      if(prompt&&!/secured/i.test(prompt)){useHeld=true;key('KeyF',true);}else{key('KeyR',true);key('KeyR',false);}}
    if(useHeld&&!b[RELOAD]){useHeld=false;key('KeyF',false);}
    // Light kick on each shot.
    const s=api.session?.shots??0;if(s>shots)rumble(gp,.15,.35,45);shots=s;
    prev=b;
  }
  requestAnimationFrame(frame);
  host.on('reset',()=>release());
}

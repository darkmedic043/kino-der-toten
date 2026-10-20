// Controller support (not part of upstream). Polls the Gamepad API every animation frame
// (also while paused, so Start resumes). The left stick feeds analog movement through
// kino.gamepad.move (read by engine.js); the right stick turns the camera; every
// button is sent as the key or mouse event the game and the other mods already listen for
// (default key codes, flagged `remapped` so the keybind remapper passes them through).
// Standard mapping, named by position: south/east/west/north = Xbox A/B/X/Y = PlayStation
// Cross/Circle/Square/Triangle = Nintendo B/A/Y/X.
//
// Native support (2026-10-17): the controller is identified from its id (glyphs.js) and the HUD's
// key hints turn into that controller's own button glyphs (body.pad-xbox / pad-ps / pad-nintendo;
// the "Controller button icons" setting can force one). A DualSense gets its adaptive triggers,
// light bar, player LEDs and rumble over WebHID (dualsense.js; Chrome/Edge and Rind, after one click
// on ENABLE DUALSENSE FEATURES in the pause menu, remembered by the browser). Xbox One/Series pads
// get trigger rumble through the Gamepad haptics API where the browser offers it (Chrome on Windows).
// Menu navigation (gamepad-nav.js): while the game is paused the D-pad / left stick move a focus ring over
// the pause menu and the settings overlay, Cross/A activates (Cross on ENTER / nothing focused resumes),
// Circle/B closes the overlay or resumes, L1/R1 switch the settings tabs, sliders adjust with left/right.
import { settings, onSettingsChange } from '../../settings.js';
import { weaponClass } from '../weapon-levels/camo.js';
import { identify, isDualSense, glyphUrl, glyph, label, INDEX } from './glyphs.js';
import { DualSenseLink, trigger, PLAYER_LEDS } from './dualsense.js';
import { GamepadNav, padState } from '../../gamepad-nav.js';
import { seat, seatPad } from '../../seat.js';

const DEAD=.15;
// button index -> key. 8 = Back/Create/View, 12-15 = D-pad, 17 = touchpad press / Xbox Share (hold: scoreboard).
const KEYS={0:'Space',1:'KeyC',3:'KeyQ',4:'KeyX',5:'KeyG',11:'KeyV',12:'Digit4',13:'KeyZ',14:'Digit5',15:'KeyY',8:'KeyT',17:'Tab'};
const FIRE=7,AIM=6,RELOAD=2,SPRINT=10,START=9;
// What the pause menu lists for a controller, in button order.
const HINTS=[['lt','AIM'],['rt','FIRE'],['south','JUMP'],['east','CROUCH · SLIDE'],['west','USE · RELOAD'],['north','SWAP'],['lb','TACTICAL'],['rb','GRENADE'],
  ['l3','SPRINT'],['r3','KNIFE'],['dup','CLAYMORE'],['dleft','ATTACHMENT'],['ddown','CLASS SKILL'],['dright','OPERATOR'],['back','THIRD PERSON'],['touchpad','SCOREBOARD'],['start','PAUSE']];
// HUD key hints that become button glyphs while a controller is in use: selector -> button.
const HUD_GLYPHS={'#prompt kbd':'west','#equip-hud .slot[data-k="lethal"] kbd':'rb','#equip-hud .slot[data-k="tactical"] kbd':'lb','#equip-hud .slot[data-k="mine"] kbd':'dup','#class-skill kbd':'ddown','#operator-weapon kbd':'dright'};
const GLYPH_SETTING=['auto','xbox','ps','nintendo'];
const isBow=id=>id==='bo3_wrath_ancients'||/^bo3_bow_/.test(id??'');
const MELON=[.42,.85,.3];

export default async function setup(api){
  const {host,camera,renderer,session}=api;
  const pad=(window.kino??={}).gamepad={move:{forward:0,strafe:0,sprint:false},connected:false,last:0,brand:'generic',kind:'generic',name:'',native:false,
    glyph:(button,size)=>glyph(pad.brand,button,size),label:button=>label(pad.brand,button),button:i=>INDEX[i]};
  // Sent to the page body like a real key press: dispatched on window itself, the game's own
  // handlers (registered first) ran before the mods' capture-phase ones could claim the key (a
  // grenade went off twice).
  const key=(code,down)=>{const e=new KeyboardEvent(down?'keydown':'keyup',{code,key:code,bubbles:true,cancelable:true});e.remapped=true;(document.body??window).dispatchEvent(e);};
  const mouse=(button,down)=>renderer.domElement.dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,bubbles:true,cancelable:true}));
  const held=new Map();   // button -> what it is holding down (a key code or a mouse button)
  let prev=[],sprintLatch=false,useHeld=false,reloadHeld=false,lastT=performance.now(),shots=session?.shots??0,gpNow=null,info=null;

  // ---- glyphs: the connected controller's own buttons on the HUD and in the pause menu --------------------------
  const style=document.createElement('style');document.head.append(style);
  const brandCss=brand=>Object.entries(HUD_GLYPHS).map(([sel,b])=>`body.using-pad.pad-${brand} ${sel}{background-image:${glyphUrl(brand,b)}!important}`).join('\n');
  style.textContent=`body.using-pad #prompt kbd,body.using-pad #equip-hud kbd,body.using-pad #class-skill kbd,body.using-pad #operator-weapon kbd{font-size:0!important;color:transparent!important;display:inline-block;width:20px;height:20px;padding:0!important;border:0!important;background-color:transparent!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important;box-shadow:none!important;vertical-align:middle}
body.using-pad #prompt kbd{width:26px;height:26px;margin-right:6px}
body.using-pad #equip-hud kbd,body.using-pad #class-skill kbd,body.using-pad #operator-weapon kbd{width:16px;height:16px;top:-16px!important}
.menu-controls.pad{display:none}body.using-pad .menu-controls.pad{display:flex}body.using-pad .menu-controls:not(.pad){display:none}
.menu-controls.pad .pg{display:inline-block;width:18px;height:18px;margin-right:6px;vertical-align:middle;background:center/contain no-repeat}
.menu-controls.pad .pad-name{flex-basis:100%;color:#a39d8c;font-size:9px;letter-spacing:2px}.menu-controls.pad .pad-name b{color:#cfc7b3;font-weight:700}.menu-controls.pad .pad-name i{color:#7fcf6a;font-style:normal;margin-left:10px}
#dualsense-link{display:block}
body.using-pad:not(.menu-open) #pad-nav-hint{display:none!important}
${['xbox','ps','nintendo','generic'].map(brandCss).join('\n')}`;
  const hints=document.createElement('div');hints.className='menu-controls pad';
  const menuControls=document.querySelector('#menu .menu-controls');menuControls?.after(hints);
  function renderHints(){
    const b=pad.brand,nm=info?.name??'Controller';
    hints.innerHTML=`<span class="pad-name"><b>${nm.toUpperCase()}</b>${pad.native?'<i>NATIVE DUALSENSE · ADAPTIVE TRIGGERS · LIGHT BAR</i>':''}</span>`+
      HINTS.map(([btn,what])=>`<span title="${label(b,btn)}"><i class="pg" style="background-image:${glyphUrl(b,btn)}"></i>${what}</span>`).join('');
  }
  function applyBrand(){
    const forced=GLYPH_SETTING[settings.padGlyphs|0];
    pad.brand=forced&&forced!=='auto'?forced:(info?.brand??'generic');
    for(const b of ['xbox','ps','nintendo','generic'])document.body.classList.toggle('pad-'+b,pad.brand===b);
    renderHints();nav.setHints(glyphUrl,pad.brand);
  }
  // ---- menu navigation while paused ---------------------------------------------------------------------------
  const overlay=()=>{const o=document.getElementById('settings-overlay');return o&&!o.hidden?o:null;};
  // the co-op lobby (multiplayer mod) sits over the pause menu until the game starts: the pad works its buttons, and
  // nothing resumes past it (Start presses START GAME / JOIN THE GAME when it is enabled)
  const lobby=()=>{const l=document.getElementById('coop-lobby');return l&&!l.hidden?l:null;};
  const resume=()=>{const st=api.getState?.()??{};if(!st.ready||lobby())return;if(st.phase==='gameover')api.reset();nav.clear();api.setActive(true);};
  const nav=new GamepadNav({scope:()=>overlay()??lobby()??document.getElementById('menu')??document.body,
    initial:()=>lobby()?(lobby().querySelector('.go:not(:disabled)')??lobby().querySelector('button')):document.getElementById('start'),
    onBack:()=>{if(overlay())return false;if(lobby())return true;resume();return true;},onStart:null});
  nav.startLabel='RESUME';pad.nav=nav;
  onSettingsChange((s,k)=>{if(k===null||k==='padGlyphs')applyBrand();if(k===null||k==='padLightbar'||k==='padTriggers')pushNative(true);});
  applyBrand();

  // ---- native DualSense (WebHID) -------------------------------------------------------------------------------
  const link=new DualSenseLink();
  let flashUntil=0,flashColor=null,natKey='';
  const linkBtn=document.createElement('button');linkBtn.type='button';linkBtn.className='secondary';linkBtn.id='dualsense-link';linkBtn.hidden=true;
  linkBtn.textContent='ENABLE DUALSENSE FEATURES';linkBtn.title='Adaptive triggers, light bar, player LEDs and rumble over WebHID. The browser remembers the choice.';
  (document.getElementById('open-settings')?.parentElement??document.getElementById('restart'))?.after(linkBtn);
  linkBtn.addEventListener('click',async e=>{e.stopPropagation();linkBtn.disabled=true;
    const ok=await link.connect({interactive:true});linkBtn.disabled=false;
    api.toast?.(ok?'DualSense connected · adaptive triggers and light bar on':'DualSense not linked (Chrome, Edge or Rind needed; Linux needs hidraw access)',4);});
  link.onchange=on=>{pad.native=on;linkBtn.hidden=on||!showLinkButton();natKey='';renderHints();};
  // (not in split screen: WebHID can't tell which DualSense is this player's, so both copies would drive the same one)
  const showLinkButton=()=>!!info&&isDualSense(info)&&DualSenseLink.supported()&&!link.connected&&!seat();
  // Already granted (an earlier click, or Rind's permission handler): link without asking.
  let autoTried=false;
  async function autoLink(){if(autoTried||!showLinkButton())return;autoTried=true;if((await DualSenseLink.granted()).length)await link.connect();linkBtn.hidden=!showLinkButton();}
  if(DualSenseLink.supported()){navigator.hid.addEventListener('disconnect',e=>{if(e.device===link.device)link.drop();});
    navigator.hid.addEventListener('connect',()=>{autoTried=false;autoLink();});}
  addEventListener('pagehide',()=>{link.close();});

  // The fire trigger feels like the weapon in hand; the aim trigger has a light, constant pull.
  function fireEffect(){
    const def=session?.def,w=session?.weapon;
    if(!def||!w||session.phase==='gameover'||session.phase==='reviving'||session.drinking)return trigger.off();
    if(window.kino.operator?.active)return trigger.feedback(3,7);
    if(isBow(w.id))return trigger.bow(1,7,5,3);
    if(w.mag<=0||session.reloadLeft>0||session.weaponUnavailable)return trigger.off();
    const cls=weaponClass(def);
    if(cls==='Death Machine')return trigger.vibration(2,8,20);
    if(def.automatic||def.fireType==='Full Auto'){const amp=cls==='Light machine gun'?7:cls==='Submachine gun'?4:cls==='Wonder weapon'?6:5;return trigger.vibration(2,amp,Math.min(40,Math.max(6,Math.round(1/(def.fireTime||.1)))));}
    if(def.fireType==='3-Round Burst')return trigger.weapon(2,6,6);
    if(cls==='Shotgun'||cls==='Launcher')return trigger.weapon(3,7,8);
    if(cls==='Sniper rifle')return trigger.weapon(2,5,7);
    if(cls==='Wonder weapon')return /thundergun|microwave/.test(def.baseId??def.id)?trigger.feedback(3,8):trigger.weapon(2,6,5);
    if(cls==='Pistol')return trigger.weapon(2,5,4);
    return trigger.weapon(2,6,5);
  }
  const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),scale=(c,k)=>c.map(v=>v*k);
  function lightbar(now,active){
    const t=now/1000;
    if(flashColor&&now<flashUntil)return flashColor;
    if(!session||!active)return scale(MELON,.25);
    if(session.phase==='gameover')return [.35,0,0];
    if(session.phase==='reviving')return scale([1,.05,0],.3+.3*(.5+.5*Math.sin(t*4)));
    if(session.pack)return scale([.7,.2,1],.5+.5*(.5+.5*Math.sin(t*6)));
    const h=session.health/(session.maxHealth||100),k=Math.max(0,Math.min(1,(h-.2)/.5));
    let c=lerp([1,.03,0],MELON,k*k);
    if(h<.35)c=scale(c,.4+.6*(.5+.5*Math.sin(t*10)));
    return scale(c,.75);
  }
  const flash=(color,ms)=>{flashColor=color;flashUntil=performance.now()+ms;};
  function pushNative(force,active=api.getState?.().active){
    if(!link.connected)return;const now=performance.now();
    const triggers=settings.padTriggers!==false,bar=settings.padLightbar!==false;
    link.set({right:triggers&&active?fireEffect():trigger.off(),left:triggers&&active&&session?.phase!=='reviving'?trigger.feedback(5,2):trigger.off(),
      lightbar:bar?lightbar(now,active):[0,0,0],leds:bar&&session?PLAYER_LEDS[Math.min(5,session.perks?.size??0)]:0});
    link.update(now);link.flush(force,now);
  }
  if(session?.powerup){const o=session.powerup.bind(session);session.powerup=t=>{flash([1,1,1],250);return o(t);};}
  host.on('roundEnd',()=>flash([1,.2,.1],400));

  // ---- rumble: DualSense over HID, otherwise the Gamepad haptics API (Xbox adds trigger rumble) -----------------
  const triggerRumble=gp=>!!gp?.vibrationActuator&&(gp.vibrationActuator.effects?.includes('trigger-rumble')||gp.vibrationActuator.canPlayEffectType?.('trigger-rumble'));
  function rumble(strong,weak,ms,{left=0,right=0}={}){
    if(settings.padVibration===false)return;
    if(link.connected){link.pulse(strong,weak,ms);return;}
    const gp=gpNow,a=gp?.vibrationActuator;if(!a?.playEffect)return;
    if((left||right)&&settings.padTriggers!==false&&triggerRumble(gp))a.playEffect('trigger-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak,leftTrigger:left,rightTrigger:right}).catch(()=>{});
    else a.playEffect('dual-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak}).catch(()=>{});
  }
  host.on('beforeDamage',()=>rumble(.7,.4,200,{left:.3,right:.3}));
  function shotKick(){
    const cls=session?.def?weaponClass(session.def):'';
    if(cls==='Shotgun'||cls==='Sniper rifle')rumble(.4,.5,70,{right:.8});
    else if(cls==='Launcher'||cls==='Wonder weapon')rumble(.5,.6,110,{right:1});
    else rumble(.12,.35,45,{right:.5});
  }

  addEventListener('gamepadconnected',e=>{const id=e.gamepad?.id??'';info=identify(id);info.id=id;pad.kind=info.kind;pad.name=info.name;applyBrand();api.toast?.(`Controller connected · ${info.name.slice(0,40)}`,3);linkBtn.hidden=!showLinkButton();autoTried=false;autoLink();});
  addEventListener('gamepaddisconnected',()=>{release();api.toast?.('Controller disconnected',2);});
  // Mouse or keyboard use hands the prompts back to keyboard glyphs.
  for(const t of ['mousemove','keydown'])addEventListener(t,e=>{if(!e.remapped&&e.isTrusted)document.body.classList.remove('using-pad');},true);
  function release(){for(const [,h] of held)typeof h==='number'?mouse(h,false):key(h,false);held.clear();if(reloadHeld)key('KeyR',false);reloadHeld=false;if(useHeld)key('KeyF',false);useHeld=false;if(sprintLatch)key('ShiftLeft',false);sprintLatch=false;pad.move.forward=pad.move.strafe=0;}
  const hold=(b,what,down)=>{if(down&&!held.has(b)){held.set(b,what);typeof what==='number'?mouse(what,true):key(what,true);}else if(!down&&held.has(b)){const h=held.get(b);held.delete(b);typeof h==='number'?mouse(h,false):key(h,false);}};
  const stick=(x,y)=>{const m=Math.hypot(x,y);if(m<DEAD)return [0,0];const k=Math.min(1,(m-DEAD)/(1-DEAD))/m;return [x*k,y*k];};
  let emptyClick=false;

  function frame(now){
    requestAnimationFrame(frame);pad.frames=(pad.frames|0)+1;
    const dt=Math.min(.05,(now-lastT)/1000);lastT=now;
    const gp=seatPad();gpNow=gp;   // (split screen: this player's controller only)
    pad.connected=!!gp;
    if(gp&&(!info||info.id!==gp.id)){info=identify(gp.id);info.id=gp.id;pad.kind=info.kind;pad.name=info.name;applyBrand();linkBtn.hidden=!showLinkButton();autoLink();}
    if(!gp){if(prev.length){release();prev=[];}if(link.connected)pushNative(false,false);return;}
    const b=gp.buttons.map(x=>x.value>.5||x.pressed),pressed=i=>b[i]&&!prev[i];
    const st=api.getState?.()??{};
    if(b.some(Boolean)||gp.axes.some(a=>Math.abs(a)>.3)){pad.last=now;document.body.classList.add('using-pad');}
    // Start: pause / resume (resuming needs no pointer lock; the right stick looks).
    if(!st.active&&lobby()&&pressed(START)){lobby().querySelector('.go:not(:disabled)')?.click();prev=b;pushNative(false,false);return;}
    if(pressed(START)||(!st.active&&st.ready&&pressed(0)&&!overlay()&&!lobby()&&(!nav.current||nav.current.id==='start'))){
      if(st.active)key('Escape',true);
      else resume();   // Start, or Cross/A with nothing (or ENTER) focused: back into the game without pointer lock
      prev=b;pushNative(false,st.active);return;
    }
    if(!st.active){if(held.size||sprintLatch)release();if(st.ready)nav.step(padState(gp),now);prev=b;pushNative(false,false);return;}
    // Left stick: analog movement. L3 latches sprint until the stick is let go.
    const [lx,ly]=stick(gp.axes[0]??0,gp.axes[1]??0);pad.move.forward=-ly;pad.move.strafe=lx;
    if(pressed(SPRINT)&&Math.hypot(lx,ly)>.3&&!sprintLatch){sprintLatch=true;key('ShiftLeft',true);}
    if(sprintLatch&&(Math.hypot(lx,ly)<.3||ly>.2||b[AIM])){sprintLatch=false;key('ShiftLeft',false);}
    // Right stick: look, with a response curve (fine aim near the centre), slower aiming down sights.
    const [rx,ry]=stick(gp.axes[2]??0,gp.axes[3]??0),ads=b[AIM];
    const rate=3.4*(settings.sensitivity??1)*(settings.padSensitivity??1)*(ads?.5*(settings.adsSensitivity??1):1);
    const curve=v=>v*Math.abs(v);
    if(!window.kino?.lookHold){   // a radial picker (the Gambler's ante wheel) is reading the stick
      camera.rotation.y-=curve(rx)*rate*dt;
      camera.rotation.x=Math.max(-1.5,Math.min(1.5,camera.rotation.x-curve(ry)*rate*.75*dt*(settings.invertY?-1:1)));
    }
    // Triggers: fire and aim (mouse buttons). Buttons: their keys, held as long as the button.
    hold(FIRE,0,b[FIRE]);hold(AIM,2,b[AIM]);
    for(const [i,code] of Object.entries(KEYS))hold(+i,code,b[+i]);
    // A pull on an empty magazine: a dry click in the trigger (Xbox trigger rumble; the DualSense's trigger goes slack by itself).
    if(pressed(FIRE)&&session?.weapon&&session.weapon.mag<=0&&!isBow(session.weapon.id)&&!emptyClick){emptyClick=true;if(!link.connected)rumble(0,.2,40,{right:.6});}
    if(!b[FIRE])emptyClick=false;
    // X / Square: hold to use when there's a prompt (buy, repair, Pack-a-Punch), otherwise tap to reload.
    if(pressed(RELOAD)){const prompt=document.getElementById('prompt')?.textContent.trim();
      if(prompt&&!/secured/i.test(prompt)){useHeld=true;key('KeyF',true);}else{reloadHeld=true;key('KeyR',true);}}   // held: inspect (mods/inspect)
    if(useHeld&&!b[RELOAD]){useHeld=false;key('KeyF',false);}
    if(reloadHeld&&!b[RELOAD]){reloadHeld=false;key('KeyR',false);}
    // A kick on each shot.
    const s=session?.shots??0;if(s>shots)shotKick();shots=s;
    pushNative(false,true);
    prev=b;
  }
  requestAnimationFrame(frame);
  host.on('reset',()=>{release();flashColor=null;});
}

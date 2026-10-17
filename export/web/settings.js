// Player settings (not part of upstream): stored in localStorage and shared by
// the main menu and every game page. `settings` is live; pages read it each frame.

const KEY='kino.settings';
// Phones start on Low graphics without HD textures (the lighting and HD texture work is heavy there); a saved choice wins.
const COARSE=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
export const DEFAULTS={sensitivity:1,adsSensitivity:1,invertY:false,fov:78,volume:1,music:false,headBob:true,renderScale:1,graphics:COARSE?0:2,hdTextures:!COARSE,daytime:true,devConsole:false,showFps:false,fpsCap:COARSE?30:0,binds:{}};
// Rebindable actions and the key each game page listens for. game-menu.js
// translates a rebound key into its default so the game code stays unchanged.
export const ACTIONS=[
  ['forward','Move forward','KeyW'],['back','Move back','KeyS'],['left','Move left','KeyA'],['right','Move right','KeyD'],
  ['sprint','Sprint (hold)','ShiftLeft'],['jump','Jump','Space'],['crouch','Crouch','KeyC'],['use','Use / buy','KeyF'],
  ['reload','Reload','KeyR'],['melee','Knife','KeyV'],['grenade','Grenade','KeyG'],['swap','Switch weapon','KeyQ'],
  ['claymore','Claymore','Digit4'],['monkey','Monkey Bomb','KeyX'],['thirdPerson','Third person','KeyT'],['ability','Class action skill','KeyZ'],['operator','Operator weapon','KeyY'],['gumChew','Chew gobblegum','KeyN'],['gumNext','Next gobblegum','KeyJ'],
];
export const DEFAULT_BINDS=Object.fromEntries(ACTIONS.map(([id,,code])=>[id,code]));
export const binds=()=>({...DEFAULT_BINDS,...settings.binds});
export const keyName=code=>code?code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow/,'↑').replace('Left','').replace('Right',' R').replace(/([a-z])([A-Z])/g,'$1 $2'):'—';
export const settings={...DEFAULTS};
try{Object.assign(settings,JSON.parse(localStorage.getItem(KEY))??{});}catch{}
settings.binds={...settings.binds};
// fpsCap was a 30 FPS toggle: true is 30, false no cap
const migrate=()=>{if(typeof settings.fpsCap==='boolean')settings.fpsCap=settings.fpsCap?30:0;};migrate();
const listeners=new Set();
export function onSettingsChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function setSetting(key,value){settings[key]=value;try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}for(const fn of listeners)fn(settings,key);}
// Another tab (e.g. the menu) changed them.
// Signed-in progress (including settings) was pulled from the server.
addEventListener('kino-cloud-pulled',()=>{try{Object.assign(settings,DEFAULTS,JSON.parse(localStorage.getItem(KEY))??{});settings.binds={...settings.binds};migrate();}catch{}for(const fn of listeners)fn(settings,null);});
addEventListener('storage',e=>{if(e.key!==KEY)return;try{Object.assign(settings,DEFAULTS,JSON.parse(e.newValue)??{});migrate();}catch{}for(const fn of listeners)fn(settings,null);});

const FIELDS=[
  {key:'sensitivity',tab:'controls',label:'Mouse sensitivity',type:'range',min:.1,max:3,step:.05,format:v=>v.toFixed(2)+'×'},
  {key:'adsSensitivity',tab:'controls',label:'Aim-down-sights sensitivity',type:'range',min:.1,max:2,step:.05,format:v=>v.toFixed(2)+'×'},
  {key:'invertY',tab:'controls',label:'Invert look up / down',type:'toggle'},
  {key:'headBob',tab:'gameplay',label:'Head bob',type:'toggle',hint:'Camera moves with your steps and landings'},
  {key:'fov',tab:'gameplay',label:'Field of view',type:'range',min:60,max:110,step:1,format:v=>v+'°'},
  {key:'volume',tab:'audio',label:'Master volume',type:'range',min:0,max:1.5,step:.05,format:v=>Math.round(v*100)+'%'},
  {key:'music',tab:'audio',label:'Background music',type:'toggle',hint:'Ambient soundtrack; Easter-egg songs always play'},
  {key:'renderScale',tab:'graphics',label:'Render resolution',type:'range',min:.5,max:1.5,step:.05,format:v=>Math.round(v*100)+'%',hint:'Lower it for more FPS'},
  {key:'graphics',tab:'graphics',label:'Graphics quality',type:'range',min:0,max:3,step:1,format:v=>['Low','Medium','High','Ultra'][v]??v,hint:'Medium: bloom and light beams. High: + light shadows. Ultra: + ambient occlusion (heavy). Lower it for more FPS'},
  {key:'daytime',tab:'graphics',label:'Daytime (Kino)',type:'toggle',hint:'Sunlight and sky; off for the original night'},
  {key:'hdTextures',tab:'graphics',label:'HD textures',type:'toggle',hint:'AI-upscaled map textures (Kino). Uses more video memory'},
  {key:'showFps',tab:'gameplay',label:'Show FPS counter',type:'toggle'},
  // fpsCap: frames a second, 0 = no cap. The slider's last stop is "Unlimited"; click the number to type any cap.
  {key:'fpsCap',tab:'graphics',label:'Frame rate cap',type:'range',min:15,max:245,step:5,typed:{min:5,max:1000},
    toInput:v=>v>0?Math.min(v,240):245,fromInput:v=>v>=245?0:v,format:v=>v>0?v+' FPS':'Unlimited',
    hint:'Lower saves battery (30 by default on phones and tablets). Click the number to type a cap. A steady 30 with no cap is the browser\'s battery saver'},
  {key:'devConsole',tab:'dev',label:'Cheat console',type:'toggle',hint:'Press ` in a game to open it. A game where you use cheats earns no XP or stats'},
];

// Tabs of the settings form, in order. Controls also holds the key bindings.
const TABS=[['graphics','GRAPHICS'],['audio','AUDIO'],['controls','CONTROLS'],['gameplay','GAMEPLAY'],['dev','DEV']];
const TAB_KEY='kino.settings.tab';

// Builds the settings form into `container` (used by the menu and the in-game overlay): a tab strip, one page per tab.
export function renderSettings(container){
  container.classList.add('settings-form');
  const field=f=>`<label class="setting" data-key="${f.key}"><span class="name">${f.label}${f.hint?`<small>${f.hint}</small>`:''}</span>`+
    (f.type==='range'?`<input type="range" min="${f.min}" max="${f.max}" step="${f.step}"><b class="value"></b>`:`<input type="checkbox"><b class="value"></b>`)+'</label>';
  const page=id=>FIELDS.filter(f=>f.tab===id).map(field).join('')+(id==='controls'?
    '<div class="settings-sub">KEY BINDINGS <small>Click a key, then press the new one · Esc cancels</small></div><div class="binds">'+
    ACTIONS.map(([id,label])=>`<div class="bind" data-action="${id}"><span>${label}</span><button type="button" class="key"></button></div>`).join('')+'</div>':'');
  container.innerHTML=`<div class="settings-tabs" role="tablist">${TABS.map(([id,label])=>`<button type="button" role="tab" data-tab="${id}">${label}</button>`).join('')}</div>`+
    TABS.map(([id])=>`<div class="settings-page" data-page="${id}">${page(id)}</div>`).join('')+
    '<button type="button" class="settings-reset">RESET TO DEFAULTS</button>';
  let tab;try{tab=localStorage.getItem(TAB_KEY);}catch{}
  const show=id=>{if(!TABS.some(([t])=>t===id))id=TABS[0][0];
    for(const b of container.querySelectorAll('.settings-tabs button'))b.classList.toggle('active',b.dataset.tab===id);
    for(const p of container.querySelectorAll('.settings-page'))p.hidden=p.dataset.page!==id;
    try{localStorage.setItem(TAB_KEY,id);}catch{}};
  show(tab);
  container.querySelector('.settings-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)show(b.dataset.tab);});
  const sync=()=>{for(const f of FIELDS){const row=container.querySelector(`[data-key="${f.key}"]`),input=row.querySelector('input');
    if(row.querySelector('.value input'))continue;   // being typed into
    if(f.type==='range')input.value=f.toInput?f.toInput(+settings[f.key]):settings[f.key];else input.checked=!!settings[f.key];
    row.querySelector('.value').textContent=f.type==='range'?f.format(+settings[f.key]):settings[f.key]?'ON':'OFF';}
    const b=binds();for(const el of container.querySelectorAll('.bind'))if(el!==waiting)el.querySelector('.key').textContent=keyName(b[el.dataset.action]);};
  let waiting=null;
  container.addEventListener('click',e=>{const bind=e.target.closest('.bind');if(!bind)return;waiting?.classList.remove('waiting');waiting=bind;bind.classList.add('waiting');bind.querySelector('.key').textContent='Press a key…';});
  // Capture phase on window so the key never reaches the game while rebinding.
  addEventListener('keydown',e=>{
    if(!waiting||!container.isConnected)return;e.preventDefault();e.stopImmediatePropagation();
    const action=waiting.dataset.action;waiting.classList.remove('waiting');waiting=null;
    if(e.code!=='Escape'){const next={...binds()},clash=Object.keys(next).find(a=>a!==action&&next[a]===e.code);if(clash)next[clash]=next[action];next[action]=e.code;
      setSetting('binds',Object.fromEntries(Object.entries(next).filter(([a,c])=>c!==DEFAULT_BINDS[a])));}
    sync();
  },true);
  container.addEventListener('input',e=>{const row=e.target.closest('.setting');if(!row||e.target.closest('.value'))return;const f=FIELDS.find(f=>f.key===row.dataset.key);
    setSetting(f.key,f.type==='range'?(f.fromInput?f.fromInput(+e.target.value):+e.target.value):e.target.checked);sync();});
  // `typed` fields: click the value to type a number (Enter or leaving the box applies; Esc cancels; 0 or empty = off)
  container.addEventListener('click',e=>{
    const b=e.target.closest('.setting .value');if(!b||b.querySelector('input'))return;const row=b.closest('.setting'),f=FIELDS.find(f=>f.key===row.dataset.key);if(!f?.typed)return;
    e.preventDefault();const box=document.createElement('input');box.type='number';box.min=0;box.max=f.typed.max;box.value=settings[f.key]||'';box.placeholder='off';box.className='value-edit';
    b.textContent='';b.append(box);box.focus();box.select();
    let done=false;const finish=apply=>{if(done)return;done=true;if(apply){const v=Math.round(+box.value);setSetting(f.key,!box.value||v<=0?0:Math.min(f.typed.max,Math.max(f.typed.min,v)));}box.remove();sync();};
    box.addEventListener('keydown',k=>{k.stopPropagation();if(k.key==='Enter')finish(true);if(k.key==='Escape')finish(false);});
    box.addEventListener('blur',()=>finish(true));
  });
  container.querySelector('.settings-reset').addEventListener('click',()=>{for(const [k,v] of Object.entries(DEFAULTS))setSetting(k,structuredClone(v));sync();});
  // Stop typing/clicks here from reaching the game's handlers.
  for(const type of ['click','mousedown','keydown'])container.addEventListener(type,e=>e.stopPropagation());
  sync();onSettingsChange(sync);
}

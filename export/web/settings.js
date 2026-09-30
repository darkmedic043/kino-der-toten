// Player settings (not part of upstream): stored in localStorage and shared by
// the main menu and every game page. `settings` is live; pages read it each frame.

const KEY='kino.settings';
export const DEFAULTS={sensitivity:1,adsSensitivity:1,invertY:false,fov:78,volume:1,music:false,headBob:true,renderScale:1,graphics:2,hdTextures:true,daytime:true,devConsole:false,showFps:false,binds:{}};
// Rebindable actions and the key each game page listens for. game-menu.js
// translates a rebound key into its default so the game code stays unchanged.
export const ACTIONS=[
  ['forward','Move forward','KeyW'],['back','Move back','KeyS'],['left','Move left','KeyA'],['right','Move right','KeyD'],
  ['sprint','Sprint (hold)','ShiftLeft'],['jump','Jump','Space'],['crouch','Crouch','KeyC'],['use','Use / buy','KeyF'],
  ['reload','Reload','KeyR'],['melee','Knife','KeyV'],['grenade','Grenade','KeyG'],['swap','Switch weapon','KeyQ'],
  ['claymore','Claymore','Digit4'],['monkey','Monkey Bomb','KeyX'],['thirdPerson','Third person','KeyT'],
];
export const DEFAULT_BINDS=Object.fromEntries(ACTIONS.map(([id,,code])=>[id,code]));
export const binds=()=>({...DEFAULT_BINDS,...settings.binds});
export const keyName=code=>code?code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow/,'↑').replace('Left','').replace('Right',' R').replace(/([a-z])([A-Z])/g,'$1 $2'):'—';
export const settings={...DEFAULTS};
try{Object.assign(settings,JSON.parse(localStorage.getItem(KEY))??{});}catch{}
settings.binds={...settings.binds};
const listeners=new Set();
export function onSettingsChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function setSetting(key,value){settings[key]=value;try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}for(const fn of listeners)fn(settings,key);}
// Another tab (e.g. the menu) changed them.
// Signed-in progress (including settings) was pulled from the server.
addEventListener('kino-cloud-pulled',()=>{try{Object.assign(settings,DEFAULTS,JSON.parse(localStorage.getItem(KEY))??{});settings.binds={...settings.binds};}catch{}for(const fn of listeners)fn(settings,null);});
addEventListener('storage',e=>{if(e.key!==KEY)return;try{Object.assign(settings,DEFAULTS,JSON.parse(e.newValue)??{});}catch{}for(const fn of listeners)fn(settings,null);});

const FIELDS=[
  {key:'sensitivity',label:'Mouse sensitivity',type:'range',min:.1,max:3,step:.05,format:v=>v.toFixed(2)+'×'},
  {key:'adsSensitivity',label:'Aim-down-sights sensitivity',type:'range',min:.1,max:2,step:.05,format:v=>v.toFixed(2)+'×'},
  {key:'invertY',label:'Invert look up / down',type:'toggle'},
  {key:'headBob',label:'Head bob',type:'toggle',hint:'Camera moves with your steps and landings'},
  {key:'fov',label:'Field of view',type:'range',min:60,max:110,step:1,format:v=>v+'°'},
  {key:'volume',label:'Master volume',type:'range',min:0,max:1.5,step:.05,format:v=>Math.round(v*100)+'%'},
  {key:'music',label:'Background music',type:'toggle',hint:'Ambient soundtrack; Easter-egg songs always play'},
  {key:'renderScale',label:'Render resolution',type:'range',min:.5,max:1.5,step:.05,format:v=>Math.round(v*100)+'%',hint:'Lower it for more FPS'},
  {key:'graphics',label:'Graphics quality',type:'range',min:0,max:3,step:1,format:v=>['Low','Medium','High','Ultra'][v]??v,hint:'Medium: bloom and light beams. High: + light shadows. Ultra: + ambient occlusion (heavy). Lower it for more FPS'},
  {key:'daytime',label:'Daytime (Kino)',type:'toggle',hint:'Sunlight and sky; off for the original night'},
  {key:'hdTextures',label:'HD textures',type:'toggle',hint:'AI-upscaled map textures (Kino). Uses more video memory'},
  {key:'showFps',label:'Show FPS counter',type:'toggle'},
  // Dev section (collapsed by default).
  {key:'devConsole',label:'Cheat console',type:'toggle',group:'dev',hint:'Press ` in a game to open it. A game where you use cheats earns no XP or stats'},
];

// Builds the settings form into `container` (used by the menu and the in-game overlay).
export function renderSettings(container){
  container.classList.add('settings-form');
  const field=f=>`<label class="setting" data-key="${f.key}"><span class="name">${f.label}${f.hint?`<small>${f.hint}</small>`:''}</span>`+
    (f.type==='range'?`<input type="range" min="${f.min}" max="${f.max}" step="${f.step}"><b class="value"></b>`:`<input type="checkbox"><b class="value"></b>`)+'</label>';
  container.innerHTML=FIELDS.filter(f=>!f.group).map(field).join('')+
    '<div class="settings-sub">CONTROLS <small>Click a key, then press the new one · Esc cancels</small></div><div class="binds">'+
    ACTIONS.map(([id,label])=>`<div class="bind" data-action="${id}"><span>${label}</span><button type="button" class="key"></button></div>`).join('')+'</div>'+
    `<details class="settings-dev"><summary>DEV</summary>${FIELDS.filter(f=>f.group==='dev').map(field).join('')}</details>`+
    '<button type="button" class="settings-reset">RESET TO DEFAULTS</button>';
  const sync=()=>{for(const f of FIELDS){const row=container.querySelector(`[data-key="${f.key}"]`),input=row.querySelector('input');
    if(f.type==='range')input.value=settings[f.key];else input.checked=!!settings[f.key];
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
  container.addEventListener('input',e=>{const row=e.target.closest('.setting');if(!row)return;const f=FIELDS.find(f=>f.key===row.dataset.key);
    setSetting(f.key,f.type==='range'?+e.target.value:e.target.checked);sync();});
  container.querySelector('.settings-reset').addEventListener('click',()=>{for(const [k,v] of Object.entries(DEFAULTS))setSetting(k,structuredClone(v));sync();});
  // Stop typing/clicks here from reaching the game's handlers.
  for(const type of ['click','mousedown','keydown'])container.addEventListener(type,e=>e.stopPropagation());
  sync();onSettingsChange(sync);
}

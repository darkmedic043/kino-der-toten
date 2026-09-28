// Player settings (not part of upstream): stored in localStorage and shared by
// the main menu and every game page. `settings` is live; pages read it each frame.

const KEY='kino.settings';
export const DEFAULTS={sensitivity:1,adsSensitivity:1,invertY:false,fov:78,volume:1,renderScale:1,showFps:false};
export const settings={...DEFAULTS};
try{Object.assign(settings,JSON.parse(localStorage.getItem(KEY))??{});}catch{}
const listeners=new Set();
export function onSettingsChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function setSetting(key,value){settings[key]=value;try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}for(const fn of listeners)fn(settings,key);}
// Another tab (e.g. the menu) changed them.
addEventListener('storage',e=>{if(e.key!==KEY)return;try{Object.assign(settings,DEFAULTS,JSON.parse(e.newValue)??{});}catch{}for(const fn of listeners)fn(settings,null);});

const FIELDS=[
  {key:'sensitivity',label:'Mouse sensitivity',type:'range',min:.1,max:3,step:.05,format:v=>v.toFixed(2)+'×'},
  {key:'adsSensitivity',label:'Aim-down-sights sensitivity',type:'range',min:.1,max:2,step:.05,format:v=>v.toFixed(2)+'×'},
  {key:'invertY',label:'Invert look up / down',type:'toggle'},
  {key:'fov',label:'Field of view',type:'range',min:60,max:110,step:1,format:v=>v+'°'},
  {key:'volume',label:'Master volume',type:'range',min:0,max:1.5,step:.05,format:v=>Math.round(v*100)+'%'},
  {key:'renderScale',label:'Render resolution',type:'range',min:.5,max:1.5,step:.05,format:v=>Math.round(v*100)+'%',hint:'Lower it for more FPS'},
  {key:'showFps',label:'Show FPS counter',type:'toggle'},
];

// Builds the settings form into `container` (used by the menu and the in-game overlay).
export function renderSettings(container){
  container.classList.add('settings-form');
  container.innerHTML=FIELDS.map(f=>`<label class="setting" data-key="${f.key}"><span class="name">${f.label}${f.hint?`<small>${f.hint}</small>`:''}</span>`+
    (f.type==='range'?`<input type="range" min="${f.min}" max="${f.max}" step="${f.step}"><b class="value"></b>`:`<input type="checkbox"><b class="value"></b>`)+'</label>').join('')+
    '<button type="button" class="settings-reset">RESET TO DEFAULTS</button>';
  const sync=()=>{for(const f of FIELDS){const row=container.querySelector(`[data-key="${f.key}"]`),input=row.querySelector('input');
    if(f.type==='range')input.value=settings[f.key];else input.checked=!!settings[f.key];
    row.querySelector('.value').textContent=f.type==='range'?f.format(+settings[f.key]):settings[f.key]?'ON':'OFF';}};
  container.addEventListener('input',e=>{const row=e.target.closest('.setting');if(!row)return;const f=FIELDS.find(f=>f.key===row.dataset.key);
    setSetting(f.key,f.type==='range'?+e.target.value:e.target.checked);sync();});
  container.querySelector('.settings-reset').addEventListener('click',()=>{for(const [k,v] of Object.entries(DEFAULTS))setSetting(k,v);sync();});
  // Stop typing/clicks here from reaching the game's handlers.
  for(const type of ['click','mousedown','keydown'])container.addEventListener(type,e=>e.stopPropagation());
  sync();onSettingsChange(sync);
}

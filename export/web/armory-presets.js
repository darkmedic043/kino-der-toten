// Armory presets (2026-11-13): three named slots, each its own save of what you take into a match: operator, loadout
// (starting pistol, melee, Mystery Box list, bonuses, equipment), class with each class's action skill set-up,
// Gobblegum pack and research augments. The active slot is the live state; picking another slot saves the live state
// into the active one and writes the picked one back. Progress (XP, weapon levels, camos, attachments, skill points,
// gums owned, research done) is account-wide and never part of a preset.
// Store: kino.mods.presets = {active, slots:[{name, snap|null}]}, cloud-synced (cloud.js TRACKED). Menu only (home.js).
import { PROFILE_KEY } from './profile.js';
import { CLASSES_KEY } from './mods/classes/classes.js';
import { GUM_KEY } from './mods/gobblegums/gums.js';
import { RESEARCH_KEY } from './mods/research/research.js';

export const PRESETS_KEY='kino.mods.presets',PRESET_COUNT=3;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=k=>{try{const v=JSON.parse(localStorage.getItem(k));return v&&typeof v==='object'?v:{};}catch{return {};}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};

export function loadPresets(){
  const p=read(PRESETS_KEY),slots=Array.isArray(p.slots)?p.slots:[];
  return {active:Number.isInteger(p.active)&&p.active>=0&&p.active<PRESET_COUNT?p.active:0,
    slots:Array.from({length:PRESET_COUNT},(_,i)=>({name:typeof slots[i]?.name==='string'&&slots[i].name.trim()?slots[i].name.slice(0,24):`PRESET ${i+1}`,snap:slots[i]?.snap??null}))};
}
export const savePresets=p=>write(PRESETS_KEY,p);

// The live state as a preset.
export function snapshot(){
  const p=read(PROFILE_KEY),c=read(CLASSES_KEY),g=read(GUM_KEY),r=read(RESEARCH_KEY);
  return {character:p.character??null,loadout:p.loadout?structuredClone(p.loadout):null,
    cls:{selected:c.selected??null,loadouts:Object.fromEntries(Object.entries(c.classes??{}).map(([id,s])=>[id,s?.loadout??null]))},
    gums:g.pack??null,research:structuredClone(r.equip??{})};
}
// Write a preset back as the live state. setProfile(character, loadout) goes through home.js, whose in-memory profile
// would otherwise save over it (and whose save() keeps weapon XP, camos and rewards from storage).
export function applySnap(snap,{setProfile}){
  if(!snap)return;
  if(snap.character||snap.loadout)setProfile(snap.character,snap.loadout&&structuredClone(snap.loadout));
  const c=read(CLASSES_KEY);c.classes??={};
  if(snap.cls?.selected)c.selected=snap.cls.selected;
  for(const [id,l] of Object.entries(snap.cls?.loadouts??{}))if(l&&c.classes[id])c.classes[id].loadout=structuredClone(l);   // loadClassProfile prunes anything stale
  write(CLASSES_KEY,c);
  if('gums' in snap){const g=read(GUM_KEY);g.pack=snap.gums;write(GUM_KEY,g);}
  if(snap.research){const r=read(RESEARCH_KEY);r.equip=structuredClone(snap.research);write(RESEARCH_KEY,r);}
}

const CSS=`.pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;max-width:1040px}
.pr-card{position:relative;display:flex;flex-direction:column;border:1px solid var(--line-strong);background:linear-gradient(180deg,#1b1410,#07070a 80%);color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0;overflow:hidden;min-height:44px;transition:border-color .15s,transform .15s}
.pr-card:hover{border-color:var(--red-hi);transform:translateY(-2px)}
.pr-card.on{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset}
.pr-art{position:relative;aspect-ratio:300/380;background:radial-gradient(ellipse at 50% 30%,#3a2418,#100b09 62%,#050505);overflow:hidden}
.pr-art::after{content:'';position:absolute;inset:auto 0 0;height:38%;background:linear-gradient(transparent,#07070a)}
.pr-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pr-art .wait{position:absolute;inset:0;display:grid;place-items:center;font-size:10px;letter-spacing:3px;color:var(--dim)}
.pr-class{position:absolute;right:10px;bottom:10px;z-index:1;display:flex;align-items:center;gap:7px;padding:5px 8px 5px 6px;background:#000b;border:1px solid #ffffff22;border-right:3px solid var(--c,#888);font-size:10px;font-weight:700;letter-spacing:2px}
.pr-class img{width:22px;height:22px;object-fit:contain}
.pr-tag{position:absolute;left:10px;top:10px;z-index:1;padding:3px 8px;background:#000c;font-size:9px;letter-spacing:2px;color:var(--gold)}
.pr-foot{display:flex;flex-direction:column;gap:4px;padding:10px 12px 12px}
.pr-name{width:100%;background:transparent;border:0;border-bottom:1px dashed transparent;color:var(--text);font:700 15px/1.2 inherit;letter-spacing:2px;padding:2px 0;text-transform:uppercase}
.pr-name:hover{border-bottom-color:var(--line-strong)}.pr-name:focus{outline:none;border-bottom-color:var(--red-hi)}
.pr-sub{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;

let styled=false;
// root: the pane's container. opts: portrait(snap) => Promise<url|null>, describe(snap) => {cls:{name,icon,color}, lines:[..]},
// setProfile(character, loadout), onSwitch(index) after another slot became live, onOpen(index) after any pick (the live one or a switch): home.js opens LOADOUT.
export function mountPresets(root,opts){
  if(!styled){const st=document.createElement('style');st.textContent=CSS;document.head.append(st);styled=true;}
  const st=loadPresets(),live=snapshot();
  if(JSON.stringify(st.slots[st.active].snap)!==JSON.stringify(live)){st.slots[st.active].snap=live;savePresets(st);}   // keep the live slot current
  root.innerHTML=`<div class="pr-grid">${st.slots.map((s,i)=>{
    const d=s.snap?opts.describe(s.snap):null;
    return `<div class="pr-card${i===st.active?' on':''}" data-preset="${i}" role="button" tabindex="0">
      <div class="pr-art">${i===st.active?'<span class="pr-tag">ACTIVE</span>':''}<span class="wait">${s.snap?'…':'EMPTY · COPIES THE ACTIVE PRESET'}</span>
        ${d?.cls?`<span class="pr-class" style="--c:${esc(d.cls.color??'#888')}">${d.cls.icon?`<img src="${esc(d.cls.icon)}" alt="">`:''}${esc(d.cls.name.toUpperCase())}</span>`:''}</div>
      <div class="pr-foot"><input class="pr-name" value="${esc(s.name)}" maxlength="24" spellcheck="false" aria-label="Preset name">
        ${(d?.lines??[]).map(l=>`<span class="pr-sub">${esc(l)}</span>`).join('')}</div></div>`;}).join('')}</div>
    <p class="muted small" style="margin-top:14px">Each preset keeps its own operator, loadout, class set-up, Gobblegum pack and research augments. Progress is shared. Pick one to edit it; BACK (bottom left) returns here. Click a name to rename it.</p>`;
  st.slots.forEach((s,i)=>{if(!s.snap)return;const art=root.querySelector(`[data-preset="${i}"] .pr-art`);
    Promise.resolve(opts.portrait(s.snap)).then(url=>{if(!url||!art.isConnected)return;art.querySelector('.wait')?.remove();const img=new Image();img.alt='';img.src=url;art.prepend(img);}).catch(()=>{});});
  for(const inp of root.querySelectorAll('.pr-name')){
    inp.addEventListener('click',e=>e.stopPropagation());inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')inp.blur();});
    inp.addEventListener('change',()=>{const p=loadPresets(),i=+inp.closest('[data-preset]').dataset.preset,v=inp.value.trim().slice(0,24);p.slots[i].name=v||`PRESET ${i+1}`;inp.value=p.slots[i].name;savePresets(p);});
  }
  const pick=i=>{
    const p=loadPresets();if(i===p.active){opts.onOpen?.(i);return;}
    p.slots[p.active].snap=snapshot();
    p.slots[i].snap??=structuredClone(p.slots[p.active].snap);   // a new slot starts as a copy of the live one
    p.active=i;savePresets(p);applySnap(p.slots[i].snap,opts);opts.onSwitch?.(i);opts.onOpen?.(i);   // then straight into its panes (2026-11-13)
  };
  root.onclick=e=>{const c=e.target.closest('[data-preset]');if(c&&!e.target.closest('.pr-name'))pick(+c.dataset.preset);};
  root.onkeydown=e=>{const c=e.target.closest?.('[data-preset]');if(c&&e.target===c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pick(+c.dataset.preset);}};
}
export const activePresetName=()=>{const p=loadPresets();return p.slots[p.active].name;};

// The base game's touch layer (touch-controls.js, zombies-touch.js) predates the fork's HUD and actions, so on a phone:
// the class badge, grenade/monkey counters and weapon level sat under the buttons, the class skill could not be used,
// a scope could not hold its breath, and third person (where the operator shows) had no key. Touch devices only; desktop is untouched.
export default async function setup(api){
  if(!matchMedia('(pointer: coarse)').matches)return;
  const root=document.getElementById('touch-controls');if(!root)return;
  // A key sent from a button. `remapped` skips game-menu's rebind swallowing of default keys.
  const key=(type,code)=>{const e=new KeyboardEvent(type,{code,bubbles:true,cancelable:true});e.remapped=true;dispatchEvent(e);};

  const style=document.createElement('style');
  style.textContent=`
    body.touch-mode #hud-portrait{display:none}
    body.touch-mode #equip-hud{right:12px;top:112px;bottom:auto;gap:8px;transform:scale(.8);transform-origin:top right;z-index:8}
    body.touch-mode #class-skill{pointer-events:auto;touch-action:none;cursor:pointer}
    body.touch-mode #class-skill kbd{display:none}
    body.touch-mode #weapon-level{right:12px;bottom:auto;top:168px}
    body.touch-mode #progression-hud{left:200px;bottom:24px}
    .touch-breath{right:calc(var(--touch-right) + 232px);bottom:calc(var(--touch-bottom) + 40px)}
    .touch-breath[hidden]{display:none}
    .touch-toolbar .touch-button[hidden]{display:none}
    body.touch-moon #equip-hud{top:158px}
    body.touch-moon #weapon-level{top:204px}
    body.touch-moon #equipment{right:110px;top:160px}
    .touch-hack-hold{right:calc(var(--touch-right) + 232px);bottom:calc(var(--touch-bottom) + 104px)}
    @media (orientation:portrait){
      body.touch-mode #equip-hud{top:292px;bottom:auto;right:12px}
      body.touch-mode #weapon-level{top:350px;bottom:auto;right:12px}
      body.touch-mode #progression-hud{left:12px;top:272px;bottom:auto}
      body.touch-moon #moon-hud .moon-systems{top:170px;right:12px;font-size:8px;letter-spacing:1px;gap:1px}
      body.touch-moon #equip-hud{top:340px}
      body.touch-moon #weapon-level{top:396px}
      .touch-breath{right:calc(var(--touch-right) + 150px);bottom:calc(var(--touch-bottom) + 232px)}
      .touch-hack-hold{right:calc(var(--touch-right) + 140px);bottom:calc(var(--touch-bottom) + 300px)}
    }`;
  document.head.append(style);

  // Tap the class badge to use the action skill (the classes mod listens for KeyZ).
  document.addEventListener('pointerdown',e=>{
    if(!e.target.closest?.('#class-skill'))return;
    e.preventDefault();e.stopPropagation();key('keydown','KeyZ');key('keyup','KeyZ');
  },true);

  // Third person (T), where the chosen operator is shown: no key on a phone, so a toolbar button.
  const toolbar=root.querySelector('.touch-toolbar');
  if(toolbar){
    const view=document.createElement('button');view.type='button';view.className='touch-button touch-view';view.setAttribute('aria-label','Third person');
    view.innerHTML='<span>VIEW</span>';
    view.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();key('keydown','KeyT');key('keyup','KeyT');});
    toolbar.append(view);
  }

  // Moon: the unified engine builds the Kino toolbar, so the suit, objective journal and hacking had no touch
  // controls (and the suit is needed to survive outside). X already throws the Gersh Device / QED on Moon, so
  // MONKEY is relabelled and CLAYMORE (a no-op there) hidden.
  if(api.map?.id==='moon')document.body.classList.add('touch-moon');
  if(api.map?.id==='moon'&&toolbar){
    const label=(selector,text)=>{const b=toolbar.querySelector(selector);if(!b)return;const span=b.querySelector('span');if(span)span.textContent=text;b.setAttribute('aria-label',text);};
    label('[data-touch=equipment]','GERSH/QED');
    const claymore=toolbar.querySelector('[data-touch=claymore]');if(claymore)claymore.hidden=true;
    const tap=(kind,text,code)=>{const b=document.createElement('button');b.type='button';b.className='touch-button touch-'+kind;b.setAttribute('aria-label',text);b.innerHTML='<span>'+text+'</span>';
      b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();key('keydown',code);key('keyup',code);});toolbar.append(b);};
    tap('suit','P.E.S.','KeyP');tap('journal','OBJECTIVE','Tab');
    // HACK is held (the hack keeps going while H is down)
    const hack=document.createElement('button');hack.type='button';hack.className='touch-button touch-hack-hold';hack.setAttribute('aria-label','Hack');hack.innerHTML='<span>HACK</span>';
    let hacking=false;
    const stop=()=>{if(!hacking)return;hacking=false;hack.classList.remove('pressed');key('keyup','KeyH');};
    hack.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();hack.setPointerCapture?.(e.pointerId);if(hacking)return;hacking=true;hack.classList.add('pressed');key('keydown','KeyH');});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])hack.addEventListener(type,stop);
    root.append(hack);
  }

  // Hold your breath while looking through a scope (the scopes mod reads Shift).
  const breath=document.createElement('button');
  breath.type='button';breath.hidden=true;breath.className='touch-button touch-breath';breath.setAttribute('aria-label','Hold breath');
  breath.innerHTML='<span>BREATH</span>';
  let held=false;
  const release=()=>{if(!held)return;held=false;breath.classList.remove('pressed');key('keyup','ShiftLeft');};
  breath.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();breath.setPointerCapture?.(e.pointerId);if(held)return;held=true;breath.classList.add('pressed');key('keydown','ShiftLeft');});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])breath.addEventListener(type,release);
  root.append(breath);
  api.host.on('update',()=>{
    const scoped=!!globalThis.kino?.scopes?.scoped;
    if(breath.hidden===scoped)breath.hidden=!scoped;
    if(!scoped)release();
  });
}

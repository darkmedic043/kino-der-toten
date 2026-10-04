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
    @media (orientation:portrait){
      body.touch-mode #equip-hud{top:292px;bottom:auto;right:12px}
      body.touch-mode #weapon-level{top:350px;bottom:auto;right:12px}
      body.touch-mode #progression-hud{left:12px;top:272px;bottom:auto}
      .touch-breath{right:calc(var(--touch-right) + 150px);bottom:calc(var(--touch-bottom) + 232px)}
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

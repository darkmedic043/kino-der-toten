// In-game additions shared by Kino and custom maps (not part of upstream):
// Settings and Main menu buttons in the pause menu, a settings overlay, and
// applying settings that live outside the game loop (volume, resolution, FPS).
import { settings, onSettingsChange, renderSettings } from './settings.js';

export function installGameMenu({renderer,audio,pixelRatio,started=()=>false}){
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('game-menu.css',import.meta.url).href;document.head.append(css);
  // Buttons under the start / restart buttons.
  const anchor=document.getElementById('restart')??document.getElementById('start');
  const row=document.createElement('div');row.className='game-menu-row';
  row.innerHTML='<button type="button" class="secondary" id="open-settings">SETTINGS</button><a class="secondary" id="to-main-menu" href="./">MAIN MENU</a>';
  anchor.after(row);
  row.addEventListener('click',e=>e.stopPropagation());
  row.querySelector('#to-main-menu').addEventListener('click',e=>{if(started()&&!confirm('Leave this game and go back to the main menu? Your XP so far is kept.'))e.preventDefault();});

  const overlay=document.createElement('div');overlay.id='settings-overlay';overlay.hidden=true;
  overlay.innerHTML='<div class="settings-card"><div class="settings-head"><span class="eyebrow">SETTINGS</span><button type="button" class="settings-close">DONE</button></div><div class="settings-body"></div></div>';
  document.body.append(overlay);renderSettings(overlay.querySelector('.settings-body'));
  const close=()=>{overlay.hidden=true;};
  row.querySelector('#open-settings').addEventListener('click',()=>{overlay.hidden=false;});
  overlay.querySelector('.settings-close').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();e.stopPropagation();});
  addEventListener('keydown',e=>{if(e.code==='Escape'&&!overlay.hidden){close();e.stopImmediatePropagation();}},true);

  // Volume: the game sets its master gain on start and on the M toggle.
  const volume=()=>{if(audio.master)audio.master.gain.value=audio.enabled?.42*settings.volume:0;};
  const start=audio.start.bind(audio);audio.start=(...a)=>{const r=start(...a);volume();return r;};
  const proto=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(audio),'enabled');
  Object.defineProperty(audio,'enabled',{configurable:true,get(){return proto.get.call(this);},set(v){proto.set.call(this,v);volume();}});

  const fps=document.createElement('div');fps.id='fps-counter';document.body.append(fps);
  let frames=0,last=performance.now();
  const tick=now=>{frames++;if(now-last>=500){fps.textContent=Math.round(frames*1000/(now-last))+' FPS';frames=0;last=now;}if(settings.showFps)requestAnimationFrame(tick);};
  const apply=()=>{renderer.setPixelRatio(pixelRatio*settings.renderScale);volume();fps.hidden=!settings.showFps;if(settings.showFps){last=performance.now();frames=0;requestAnimationFrame(tick);}};
  onSettingsChange(apply);apply();
}

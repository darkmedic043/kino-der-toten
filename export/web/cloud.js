// Account sync (not part of upstream). Progress always lives in localStorage;
// when signed in it is mirrored to the server (/api/profile), newest copy wins.
// Tracked keys are caught at localStorage.setItem, so game code needs no changes.

const TRACKED=/^kino\.(mods\.progression|settings|best(\..+)?)$/;
const STAMP='kino.cloud.updatedAt';
const store=(()=>{try{return localStorage;}catch{return null;}})();
const rawSet=store?Storage.prototype.setItem.bind(store):()=>{};
let account={signedIn:false},pushTimer=0,pulling=false;
const listeners=new Set();
export const onAccountChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
const emit=()=>{for(const fn of listeners)fn(account);};
export const getAccount=()=>account;

function snapshot(){
  const keys={};for(let i=0;i<store.length;i++){const k=store.key(i);if(TRACKED.test(k))keys[k]=store.getItem(k);}
  return {updatedAt:+(store.getItem(STAMP)||0),keys};
}
async function push(){
  if(!account.signedIn)return;
  try{await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot()),keepalive:true,credentials:'same-origin'});}catch{}
}
function dirty(){rawSet(STAMP,String(Date.now()));clearTimeout(pushTimer);pushTimer=setTimeout(push,2000);}
if(store){
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){original.call(this,k,v);if(this===store&&!pulling&&TRACKED.test(k))dirty();};
  addEventListener('pagehide',()=>{if(pushTimer){clearTimeout(pushTimer);push();}});
}

// Newest wins: server copy replaces local keys, or local progress is uploaded.
async function sync(){
  const r=await fetch('/api/profile',{credentials:'same-origin'});if(!r.ok)return;
  const remote=await r.json(),local=snapshot();
  if(remote.keys&&(remote.updatedAt??0)>local.updatedAt){
    pulling=true;
    try{for(const [k,v] of Object.entries(remote.keys))rawSet(k,v);rawSet(STAMP,String(remote.updatedAt));}finally{pulling=false;}
    dispatchEvent(new Event('kino-cloud-pulled'));
  }else if(local.updatedAt>(remote.updatedAt??-1)||!remote.keys)await push();
}

async function start(){
  try{
    const me=await fetch('/api/me',{credentials:'same-origin'});if(!me.ok)return;
    account=await me.json();if(account.signedIn)await sync();
  }catch{}finally{emit();}
}
// Pages await this before reading the profile.
export const cloudReady=store?Promise.race([start(),new Promise(r=>setTimeout(r,4000))]):Promise.resolve();

// ---- Discord sign-in -----------------------------------------------------------
export async function signInConfig(){try{return await fetch('/api/config').then(r=>r.json());}catch{return {};}}
// Renders a "Sign in with Discord" button into `el` (a full-page redirect).
export async function renderSignInButton(el){
  const cfg=await signInConfig();
  if(cfg.signIn!=='discord'){el.textContent='Sign-in is not set up on this server yet.';return false;}
  // Sessions belong to the public https site; elsewhere, point players there.
  if(cfg.publicUrl&&new URL(cfg.publicUrl).origin!==location.origin){el.innerHTML=`<a class="signin-link" href="${cfg.publicUrl}/">Sign in on ${new URL(cfg.publicUrl).host}</a> to save progress online.`;return false;}
  el.innerHTML='<a class="discord-btn" href="/api/auth/discord"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1A19.9 19.9 0 0 0 6.1 21l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.6ZM8.5 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>SIGN IN WITH DISCORD</a>';
  return true;
}
export async function signOut(){
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}catch{}
  account={signedIn:false};emit();
}

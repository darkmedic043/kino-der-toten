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

// ---- Google sign-in ------------------------------------------------------------
let gisLoaded=null;
const loadGis=()=>gisLoaded??=new Promise((ok,fail)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=ok;s.onerror=()=>fail(new Error('Could not load Google sign-in'));document.head.append(s);});
export async function signInConfig(){try{return (await fetch('/api/config').then(r=>r.json())).googleClientId;}catch{return null;}}
// Renders Google's button into `el`; resolves once signed in.
export async function renderGoogleButton(el,{theme='filled_black'}={}){
  const clientId=await signInConfig();
  if(!clientId){el.textContent='Sign-in is not set up on this server yet.';return false;}
  if(location.protocol!=='https:'&&!/^(localhost|127\.)/.test(location.hostname)){el.innerHTML='Sign in on the secure site to save progress online.';return false;}
  await loadGis();
  google.accounts.id.initialize({client_id:clientId,ux_mode:'popup',callback:async({credential})=>{
    const r=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential}),credentials:'same-origin'});
    const result=await r.json();
    if(!r.ok){alert(result.error??'Sign-in failed');return;}
    account=result;await sync();emit();
  }});
  google.accounts.id.renderButton(el,{theme,size:'large',text:'signin_with',shape:'rectangular',width:220});
  return true;
}
export async function signOut(){
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}catch{}
  account={signedIn:false};try{google?.accounts?.id?.disableAutoSelect();}catch{}emit();
}

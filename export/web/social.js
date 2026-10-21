// Friends (not part of upstream): talks to the social API in .tools/kino-server.mjs. Signed-in players keep a social
// socket open on the menu and in games; it carries their status (online / in game, map, co-op room) and brings
// friend requests and game invites, shown as notifications on any page.
//   startSocial({status}) once per page; setStatus({status:'game', map, mapName, room}); onSocial(fn) for changes;
//   request(name|{id}), accept(id), decline(id), cancel(id), remove(id), invite(id, room, map); socialState().
// Players are addressed by a friend id (`id`, a hash of their account); `username` is their Discord username.
let state={signedIn:false,me:null,friends:[],incoming:[],outgoing:[]},ws=null,status={status:'menu'},retry=0,started=false;
const listeners=new Set();
const emit=()=>{for(const fn of listeners)try{fn(state);}catch(e){console.error('[social]',e);}};
export const socialState=()=>state;
export function onSocial(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);}
export const isFriend=id=>state.friends.some(f=>f.id===id);
export const isPending=id=>state.outgoing.some(f=>f.id===id);

async function call(path,body){
  const r=await fetch('/api/social'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'HTTP '+r.status);
  if(j.friends){Object.assign(state,{me:j.me,friends:j.friends,incoming:j.incoming,outgoing:j.outgoing});emit();}
  return j;
}
export const refresh=()=>call('');
export const request=q=>call('/request',typeof q==='string'?{name:q}:q);
export const accept=id=>call('/accept',{id});
export const decline=id=>call('/decline',{id});
export const cancel=id=>call('/cancel',{id});
export const remove=id=>call('/remove',{id});
export const invite=(id,room,map)=>call('/invite',{id,room,map});

function connect(){
  ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/social/ws`);
  ws.onopen=()=>{retry=0;ws.send(JSON.stringify({t:'status',...status}));};
  ws.onclose=()=>{ws=null;if(state.signedIn)setTimeout(connect,Math.min(30000,1500*2**retry++));};
  ws.onmessage=e=>{
    let m;try{m=JSON.parse(e.data);}catch{return;}
    if(m.t==='state'){Object.assign(state,{me:m.me,friends:m.friends,incoming:m.incoming,outgoing:m.outgoing});emit();}
    else if(m.t==='presence'){const i=state.friends.findIndex(f=>f.id===m.friend.id);if(i>=0){state.friends[i]=m.friend;emit();}}
    else if(m.t==='friends')refresh().catch(()=>{});
    else if(m.t==='request'){refresh().catch(()=>{});notify({who:m.from,text:'wants to be friends',actions:[['ACCEPT',()=>accept(m.from.id)],['DECLINE',()=>decline(m.from.id)]]});}
    else if(m.t==='invite')notify({who:m.from,text:`invited you to ${m.map?esc(m.map)+' ':''}co-op`,actions:[['JOIN',()=>{location.href=m.page+(m.page.includes('?')?'&':'?')+'room='+m.room;}],['LATER',()=>{}]],life:30});
  };
}
export async function startSocial(initial){
  if(initial)status={...status,...initial};
  if(started)return state;started=true;
  try{const me=await fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json());state.signedIn=!!me.signedIn;}catch{state.signedIn=false;}
  emit();if(state.signedIn)connect();
  return state;
}
export function setStatus(s){status={...status,...s};if(ws?.readyState===1)ws.send(JSON.stringify({t:'status',...status}));}

// ---- notifications (requests, invites), top right -----------------------------------------------------------------------------
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let stack=null;
function notify({who,text,actions=[],life=20}){
  if(!stack){stack=document.createElement('div');stack.id='social-notes';const st=document.createElement('style');st.textContent=`
    #social-notes{position:fixed;right:18px;top:18px;z-index:60;display:grid;gap:8px;width:320px;max-width:calc(100vw - 36px);font-family:Arial,Helvetica,sans-serif}
    #social-notes .note{display:grid;grid-template-columns:38px 1fr;gap:10px;align-items:center;padding:12px;background:#0b0c0bf2;border:1px solid #776b5266;border-left:3px solid #b5372c;color:#eee8dc;box-shadow:0 10px 30px #000a;animation:sn-in .25s}
    #social-notes img{width:38px;height:38px;border-radius:50%;background:#222}
    #social-notes .t{font-size:12px;line-height:1.4}#social-notes .t b{color:#fff}
    #social-notes .a{grid-column:1/-1;display:flex;gap:6px}
    #social-notes button{flex:1;padding:8px;border:1px solid #776b5266;background:#05050580;color:#ccc3ae;font:700 10px Arial;letter-spacing:2px;cursor:pointer}
    #social-notes button:first-child{background:#932e25;border-color:#b03f31;color:#fff}
    @keyframes sn-in{from{transform:translateX(30px);opacity:0}}`;document.head.append(st);document.body.append(stack);}
  const n=document.createElement('div');n.className='note';
  n.innerHTML=`<img src="${esc(who?.picture)}" alt=""><div class="t"><b>${esc(who?.name)}</b> ${text}</div><div class="a">${actions.map(([l],i)=>`<button type="button" data-i="${i}">${l}</button>`).join('')}</div>`;
  const close=()=>n.remove();
  n.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;e.stopPropagation();Promise.resolve(actions[+b.dataset.i][1]()).catch(err=>alert(err.message));close();});
  for(const t of ['mousedown','pointerdown'])n.addEventListener(t,e=>e.stopPropagation(),true);
  stack.append(n);setTimeout(close,life*1000);
}
export { notify };

// status line for a friend: "Online", "In game · Kino der Toten · co-op 2/4", "Last seen 3h ago"
export function statusText(f){
  if(f.status==='online')return f.where==='launcher'?'Online · in Rind':'Online · in the menu';
  if(f.status==='game')return 'In game'+(f.map?' · '+f.map:'')+(f.room?` · co-op${f.players?` ${f.players}/4`:''}`:' · solo');
  if(!f.seen)return 'Offline';
  const m=Math.round((Date.now()-f.seen)/60000);
  return 'Offline · last seen '+(m<1?'just now':m<60?m+'m ago':m<1440?Math.round(m/60)+'h ago':Math.round(m/1440)+'d ago');
}

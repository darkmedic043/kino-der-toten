// Hold Tab: every player's points, kills, headshots, downs and accuracy, with what you have collected along the bottom
// (perks, equipment, Easter egg progress and any collectibles a map or mod registers).
//   kino.scoreboard.addCollectible({id, label, value(): string|number, done?(): boolean})   (re-adding an id replaces it)
// In co-op each client shares its stats with the others about twice a second (kino.coop, a `stats` message).
// A quick tap (touch buttons send a synthetic Tab) toggles it instead of holding.
export default async function setup(api){
  const {host,session,world,mod}=api;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('scoreboard.css',mod.url).href;document.head.append(css);
  const root=document.createElement('div');root.id='scoreboard';document.body.append(root);
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const PERKS={specialty_armorvest:['Juggernog','#b5372c'],specialty_quickrevive:['Quick Revive','#509ebc'],specialty_fastreload:['Speed Cola','#478450'],specialty_rof:['Double Tap','#c9a23a'],
    specialty_longersprint:['Stamin-Up','#d4a017'],specialty_flakjacket:['PhD Flopper','#8a4fc9'],specialty_deadshot:['Deadshot Daiquiri','#8c5a2b'],specialty_additionalprimaryweapon:['Mule Kick','#3a8a6a']};
  const collectibles=new Map();
  window.kino.scoreboard={addCollectible(def){collectibles.set(def.id,def);return def;},removeCollectible(id){collectibles.delete(id);}};

  // ---- stats ---------------------------------------------------------------------------------------
  let downs=0,lastPhase=session.phase;
  const peers=new Map();let subscribed=false,sendAt=0;
  const mine=()=>({p:Math.round(session.points),k:session.kills,h:session.headshots,d:downs,a:session.shots?Math.round(100*session.hits/session.shots):0});
  host.on('reset',()=>{downs=0;lastPhase=session.phase;});
  function pump(){
    if(session.phase==='reviving'&&lastPhase!=='reviving')downs++;lastPhase=session.phase;
    const net=window.kino.coop;
    if(net&&!subscribed){subscribed=true;net.on('stats',(m,from)=>peers.set(from,m));}
    if(net?.id&&performance.now()>sendAt){sendAt=performance.now()+500;net.send('all',{t:'stats',...mine()});}
  }

  // ---- rendering -----------------------------------------------------------------------------------
  const localName=()=>{const net=window.kino.coop;return net?.players?.get(net.id)?.name??(document.getElementById('hud-portrait')?.innerText||'').trim()??'You';};
  const avatar=name=>{const src=document.querySelector('#hud-portrait img')?.src;return src?`<img src="${esc(src)}" alt="">`:esc((name||'?')[0].toUpperCase());};
  const mapTitle=()=>api.map?.title??(/\/\s*([^\n]+)/.exec(document.getElementById('top')?.innerText??'')?.[1]??'Zombies');
  const clock=()=>{const t=Math.floor(session.time);return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
  const row=(name,s,cls,tag,av)=>`<tr class="${cls}"><td><div class="sb-who"><i>${av}</i><div>${esc(name)}${tag?`<em>${tag}</em>`:''}</div></div></td><td>${s?s.p.toLocaleString():'—'}</td><td>${s?s.k:'—'}</td><td>${s?s.h:'—'}</td><td>${s?s.d:'—'}</td><td>${s?s.a+'%':'—'}</td></tr>`;
  const tile=(label,value,done,cls='',style='')=>`<div class="sb-tile${done?' done':''}${cls?' '+cls:''}"${style?` style="${style}"`:''}><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  function html(){
    const net=window.kino.coop,me=mine(),rows=[row(localName()||'You',me,'me',net?.id&&net.id===net.hostId?'HOST':'',avatar(localName()))];
    for(const p of net?.players?.values?.()??[]){if(p.id===net.id)continue;rows.push(row(p.name,peers.get(p.id),'',p.id===net.hostId?'HOST':'',esc((p.name||'?')[0].toUpperCase())));}
    const tiles=[];
    for(const id of session.perks??[]){const [name,color]=PERKS[id]??[id.replace(/^specialty_/,'').replace(/_/g,' '),'#888'];tiles.push(tile('Perk',name,false,'sb-perk','--c:'+color));}
    if(session.grenades!=null)tiles.push(tile('Grenades',session.grenades,false));
    if(session.claymoresOwned)tiles.push(tile('Claymores',session.claymoresOwned,false));
    if(session.monkeysOwned)tiles.push(tile('Monkey Bombs',session.monkeysOwned,false));
    for(const g of world?.eggs?.values?.()??[]){const found=g.items.filter(i=>i.found).length;tiles.push(tile('Easter egg · '+g.name,`${found} / ${g.items.length}`,!!g.done));}
    for(const c of collectibles.values()){let v='',done=false;try{v=c.value();done=!!c.done?.();}catch{}tiles.push(tile(c.label,v,done));}
    const objective=document.getElementById('moon-objective')?.textContent?.trim();
    return `<div class="sb-panel"><div class="sb-head"><div><small>${net?.id?'CO-OP':'SOLO'}</small><h2>${esc(mapTitle())}</h2></div>
      <div class="sb-meta"><div><b>${session.round}</b><span>ROUND</span></div><div><b>${clock()}</b><span>TIME</span></div></div></div>
      ${objective?`<p class="sb-objective">${esc(objective)}</p>`:''}
      <table><thead><tr><th>PLAYER</th><th>POINTS</th><th>KILLS</th><th>HEADSHOTS</th><th>DOWNS</th><th>ACCURACY</th></tr></thead><tbody>${rows.join('')}</tbody></table>
      <div class="sb-collect"><h3>COLLECTIBLES</h3><div class="sb-tiles">${tiles.join('')||'<span class="sb-none">Nothing collected yet</span>'}</div></div></div>`;
  }

  // ---- input: hold Tab ------------------------------------------------------------------------------
  let shown=false,sticky=false,drawAt=0;
  const set=on=>{if(on&&document.body.classList.contains('menu-open'))return;shown=on;root.classList.toggle('on',on);if(on){root.innerHTML=html();drawAt=performance.now()+200;}else sticky=false;};
  const typing=e=>e.target?.closest?.('input,textarea,select');
  addEventListener('keydown',e=>{
    if(e.code!=='Tab'||typing(e))return;
    e.preventDefault();e.stopImmediatePropagation();   // also keeps Moon's journal (Tab) from toggling: its objective is shown here
    if(e.repeat)return;
    if(e.remapped){sticky=!shown;set(!shown);return;}   // touch buttons send a tap
    set(true);
  },true);
  addEventListener('keyup',e=>{if(e.code!=='Tab'||typing(e))return;e.preventDefault();e.stopImmediatePropagation();if(!sticky)set(false);},true);
  addEventListener('blur',()=>set(false));
  host.on('update',()=>{
    pump();
    if(!shown)return;
    if(document.body.classList.contains('menu-open')){set(false);return;}
    if(performance.now()>=drawAt){root.innerHTML=html();drawAt=performance.now()+200;}
  });
}

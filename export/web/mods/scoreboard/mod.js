// Hold Tab: a Mob of the Dead (Black Ops 2) style scoreboard: every player's score, kills, downs, revives and headshots,
// with what you have collected along the bottom
// (Easter egg progress and any collectibles or buildables a map or mod registers; no perks or equipment).
//   kino.scoreboard.addCollectible({id, label, value(): string|number, done?(): boolean, parts?(): [{label, short?, state: 'none'|'carried'|'placed'}]})
//   (re-adding an id replaces it; `parts` draws a buildable's parts as a row of slots, like Mob of the Dead: dark = not found, white = carried, gold = built)
// In co-op each client shares its stats with the others about twice a second (kino.coop, a `stats` message).
// A quick tap (touch buttons send a synthetic Tab) toggles it instead of holding.
export default async function setup(api){
  const {host,session,world,mod}=api;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('scoreboard.css',mod.url).href;document.head.append(css);
  const root=document.createElement('div');root.id='scoreboard';document.body.append(root);
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const collectibles=new Map();
  window.kino.scoreboard={addCollectible(def){collectibles.set(def.id,def);return def;},removeCollectible(id){collectibles.delete(id);}};

  // ---- stats ---------------------------------------------------------------------------------------
  let downs=0,revives=0,lastPhase=session.phase;
  const peers=new Map();let subscribed=false,sendAt=0;
  const mine=()=>({p:Math.round(session.points),k:session.kills,h:session.headshots,d:downs,r:revives});
  window.kino.scoreboard.stats=mine;   // your own row (Cheese Cube's JARVIS HUD reads it)
  host.on('reset',()=>{downs=0;revives=0;lastPhase=session.phase;});
  function pump(){
    if(session.phase==='reviving'&&lastPhase!=='reviving')downs++;lastPhase=session.phase;
    const net=window.kino.coop;
    if(net&&!subscribed){subscribed=true;net.on('stats',(m,from)=>peers.set(from,m));
      const send=net.send.bind(net);net.send=(to,msg,...rest)=>{if(msg?.t==='revive')revives++;return send(to,msg,...rest);};}   // count the revives you give
    if(net?.id&&performance.now()>sendAt){sendAt=performance.now()+500;net.send('all',{t:'stats',...mine()});}
  }

  // ---- rendering -----------------------------------------------------------------------------------
  const localName=()=>{const net=window.kino.coop;return net?.players?.get(net.id)?.name??(document.getElementById('hud-portrait')?.innerText||'').trim()??'You';};
  const avatar=name=>{const src=document.querySelector('#hud-portrait img')?.src;return src?`<img src="${esc(src)}" alt="">`:esc((name||'?')[0].toUpperCase());};
  const mapTitle=()=>api.map?.title??(/\/\s*([^\n]+)/.exec(document.getElementById('top')?.innerText??'')?.[1]??'Zombies');
  const clock=()=>{const t=Math.floor(session.time);return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
  const row=(i,name,s,cls,tag,av)=>`<tr class="${cls}"><td class="sb-n">${i}</td><td><div class="sb-who"><i>${av}</i><div>${esc(name)}${tag?`<em>${tag}</em>`:''}</div></div></td><td class="sb-score">${s?s.p.toLocaleString():'—'}</td><td>${s?s.k:'—'}</td><td>${s?s.d:'—'}</td><td>${s?s.r??0:'—'}</td><td>${s?s.h:'—'}</td></tr>`;
  const tile=(label,value,done,cls='',style='')=>`<div class="sb-tile${done?' done':''}${cls?' '+cls:''}"${style?` style="${style}"`:''}><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const build=(label,parts,value,done)=>`<div class="sb-tile sb-build${done?' done':''}"><span>${esc(label)}</span><div class="sb-parts">${parts.map(p=>`<i class="${esc(p.state)}" title="${esc(p.label)}"><b>${esc(p.short??p.label.slice(0,2))}</b><u>${esc(p.label)}</u></i>`).join('')}</div><em>${esc(value)}</em></div>`;
  function html(){
    const net=window.kino.coop,me=mine(),rows=[row(1,localName()||'You',me,'me',net?.id&&net.id===net.hostId?'HOST':'',avatar(localName()))];
    for(const p of net?.players?.values?.()??[]){if(p.id===net.id)continue;rows.push(row(rows.length+1,p.name,peers.get(p.id),'',p.id===net.hostId?'HOST':'',esc((p.name||'?')[0].toUpperCase())));}
    const tiles=[];
    for(const g of world?.eggs?.values?.()??[]){const found=g.items.filter(i=>i.found).length;tiles.push(tile('Easter egg · '+g.name,`${found} / ${g.items.length}`,!!g.done));}
    for(const c of collectibles.values()){let v='',done=false,parts=null;try{v=c.value();done=!!c.done?.();parts=c.parts?.();}catch{}tiles.push(parts?build(c.label,parts,v,done):tile(c.label,v,done));}
    const objective=document.getElementById('moon-objective')?.textContent?.trim();
    return `<div class="sb-panel"><div class="sb-head"><div><small>${net?.id?'CO-OP':'SOLO'}</small><h2>${esc(mapTitle())}</h2></div>
      <div class="sb-meta"><div><b>${clock()}</b><span>TIME</span></div><div class="sb-round"><b>${session.round}</b><span>ROUND</span></div></div></div>
      ${objective?`<p class="sb-objective">${esc(objective)}</p>`:''}
      <table><thead><tr><th></th><th>PLAYER</th><th>SCORE</th><th>KILLS</th><th>DOWNS</th><th>REVIVES</th><th>HEADSHOTS</th></tr></thead><tbody>${rows.join('')}</tbody></table>
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

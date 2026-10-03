// Main menu CAREER tab (not part of upstream): lifetime stats recorded by mods/career,
// overall, per map and per weapon.
import { loadCareer } from './mods/career/career.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=n=>Math.round(n??0).toLocaleString();
const pct=(a,b)=>b?Math.round(100*(a??0)/b)+'%':'—';
const dur=s=>{s=Math.round(s??0);const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h}h ${m}m`:m?`${m}m`:`${s}s`;};
const EXTRA={knife:'Knife',frag_grenade_zm:'Frag Grenade',sentry_turret:'Sentry Turret',black_hole_bomb:'Gersh Device',trap:'Traps',zombie_cymbal_monkey:'Cymbal Monkey'};

export function renderCareer(root,{mapList=[],weapons={}}={}){
  const c=loadCareer(),t=c.total;
  const weaponName=id=>EXTRA[id]??weapons[id]?.name??id.replace(/_zm$/,'').replace(/_/g,' ');
  const mapName=id=>mapList.find(m=>m.id===id)?.title??id;
  const fav=(o,key)=>Object.entries(o).sort((a,b)=>(b[1][key]??0)-(a[1][key]??0))[0];
  const favGun=fav(c.weapons,'kills'),favMap=fav(c.maps,'time');
  let view=root.dataset.view||'overview',mapSel=root.dataset.map,gunSel=root.dataset.gun,sort=root.dataset.sort||'kills',query='';
  const card=(label,value,sub='')=>`<div class="stat"><span>${esc(label)}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</div>`;
  const block=o=>[
    card('Kills',num(o.kills)),card('Headshots',num(o.headshots),pct(o.headshots,o.kills)+' of kills'),card('Highest round',num(o.bestRound)),
    card('Rounds survived',num(o.rounds)),card('Games',num(o.games)),card('Time played',dur(o.time)),card('Points earned',num(o.points)),
  ].join('');
  function draw(){
    root.dataset.view=view;
    const nav=['overview','maps','weapons'].map(v=>`<button data-v="${v}" class="${v===view?'active':''}">${v.toUpperCase()}</button>`).join('');
    let body='';
    if(view==='overview'){
      body=`<div class="stat-grid">${block(t)}${card('Knife kills',num(t.meleeKills))}${card('Hellhound kills',num(t.dogKills))}${card('Shots fired',num(t.shots))}
        ${card('Perks drunk',num(t.perks))}${card('Pack-a-Punches',num(t.packs))}${card('Kills per game',t.games?(t.kills/t.games).toFixed(1):'—')}</div>
        <div class="fav-row">${favGun?`<button class="fav" data-gun="${esc(favGun[0])}"><span>FAVOURITE WEAPON</span><strong>${esc(weaponName(favGun[0]))}</strong><small>${num(favGun[1].kills)} kills</small></button>`:''}
        ${favMap?`<button class="fav" data-map="${esc(favMap[0])}"><span>MOST PLAYED MAP</span><strong>${esc(mapName(favMap[0]))}</strong><small>${dur(favMap[1].time)}</small></button>`:''}</div>
        ${t.kills?'':'<p class="muted small">Play a game to start your career record. Cheat games don&#39;t count.</p>'}`;
    }
    if(view==='maps'){
      const ids=[...new Set([...mapList.filter(m=>(m.modes??['zombies']).includes('zombies')).map(m=>m.id),...Object.keys(c.maps)])];
      mapSel=ids.includes(mapSel)?mapSel:ids.find(id=>c.maps[id])??ids[0];
      const list=ids.map(id=>{const m=c.maps[id]??{};return `<button data-map="${esc(id)}" class="row ${id===mapSel?'active':''}"><strong>${esc(mapName(id))}</strong><small>${m.games?`${num(m.games)} games · best round ${num(m.bestRound)}`:'Not played yet'}</small></button>`;}).join('');
      const m=c.maps[mapSel]??{};
      body=`<div class="split"><div class="list">${list}</div><div class="detail"><h3>${esc(mapName(mapSel))}</h3>
        <div class="stat-grid">${block(m)}${card('Deaths',num(m.deaths))}</div></div></div>`;
    }
    if(view==='weapons'){
      const rows=Object.entries(c.weapons).filter(([id])=>weaponName(id).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(b[1][sort]??0)-(a[1][sort]??0));
      gunSel=c.weapons[gunSel]?gunSel:rows[0]?.[0];
      const list=rows.map(([id,w])=>`<button data-gun="${esc(id)}" class="row ${id===gunSel?'active':''}"><strong>${esc(weaponName(id))}</strong><small>${num(w.kills)} kills · ${dur(w.time)}</small></button>`).join('')||'<p class="muted small">No weapon stats yet.</p>';
      const w=c.weapons[gunSel]??{};
      body=`<div class="split"><div class="list"><input type="search" placeholder="Search weapons" value="${esc(query)}"><div class="chips sort">${['kills','time','headshots'].map(k=>`<button data-sort="${k}" class="${k===sort?'active':''}">${k.toUpperCase()}</button>`).join('')}</div>${list}</div>
        <div class="detail">${gunSel?`<h3>${esc(weaponName(gunSel))}</h3><div class="stat-grid">${card('Kills',num(w.kills))}${card('Headshots',num(w.headshots),pct(w.headshots,w.kills)+' of kills')}
        ${card('Time used',dur(w.time))}${card('Shots fired',num(w.shots))}${card('Kills per minute',w.time>30?(w.kills/(w.time/60)).toFixed(1):'—')}${card('Pack-a-Punched',num(w.packs),'times')}</div>`:''}</div></div>`;
    }
    root.innerHTML=`<div class="chips career-nav">${nav}</div>${body}`;
    root.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;draw();});
    root.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{view='maps';mapSel=root.dataset.map=b.dataset.map;draw();});
    root.querySelectorAll('[data-gun]').forEach(b=>b.onclick=()=>{view='weapons';gunSel=root.dataset.gun=b.dataset.gun;draw();});
    root.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sort=root.dataset.sort=b.dataset.sort;draw();});
    const q=root.querySelector('input[type=search]');if(q)q.oninput=()=>{query=q.value;const pos=q.selectionStart;draw();const n=root.querySelector('input[type=search]');n.focus();n.setSelectionRange(pos,pos);};
  }
  draw();
}

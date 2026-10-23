// The Melon Zombies wiki (fork-only, served at /wiki/). One page, hash routes: #/ home, #/<topic> a topic's index,
// #/<topic>/<page> a page, #/search/<words>. Every topic is a module in topics/ that builds its pages from the game's own
// data files at load, so stats follow the game. Topic contract (see topics/README.md):
//   export default {id, title, blurb, order, async load(ctx) -> {intro?, groups?:[names in order], pages:[{id, title, group?,
//     sub?, img?, color?, keywords?, html: string | (() => string | Promise<string>), after?: (el) => void}]}}
import * as H from './helpers.js';

const TOPICS=['basics','maps','weapons','perks','gobblegums','classes','operators','progression','pass'];
const main=document.getElementById('main'),nav=document.getElementById('nav'),q=document.getElementById('q');
const ctx={...H};
const topics=[];   // {id,title,blurb,order,intro,groups,pages,error}

async function loadTopic(id){
  let mod;try{mod=(await import(`./topics/${id}.js`)).default;}catch(e){console.warn('[wiki] no topic',id,e);return null;}
  const t={id:mod.id??id,title:mod.title??id,blurb:mod.blurb??'',order:mod.order??99,pages:[],groups:[],intro:''};
  try{const r=await mod.load(ctx);Object.assign(t,{intro:r.intro??'',pages:r.pages??[],groups:r.groups??[]});
    for(const p of t.pages)p.topic=t;}
  catch(e){console.error('[wiki]',id,e);t.error=String(e?.message??e);}
  return t;
}

const pageHref=p=>`#/${p.topic.id}/${encodeURIComponent(p.id)}`;
const findTopic=id=>topics.find(t=>t.id===id);
const findPage=(tid,pid)=>findTopic(tid)?.pages.find(p=>p.id===pid);
ctx.href=(tid,pid)=>pid?`#/${tid}/${encodeURIComponent(pid)}`:`#/${tid}`;
// a link to another page; tells you (console) when the target doesn't exist, so broken cross-links show up in testing
ctx.link=(tid,pid,label)=>{if(topics.length&&pid&&!findPage(tid,pid))console.warn('[wiki] broken link',tid,pid);
  const p=pid?findPage(tid,pid):null;return `<a href="${ctx.href(tid,pid)}">${H.esc(label??p?.title??pid??findTopic(tid)?.title??tid)}</a>`;};
ctx.find=findPage;
ctx.pages=tid=>findTopic(tid)?.pages??[];

function grouped(t){
  const groups=[...t.groups];for(const p of t.pages){const g=p.group??'';if(!groups.includes(g))groups.push(g);}
  return groups.map(g=>[g,t.pages.filter(p=>(p.group??'')===g)]).filter(([,ps])=>ps.length);
}
function drawNav(tid,pid){
  nav.innerHTML=topics.map(t=>{
    const open=t.id===tid;
    const inner=open?grouped(t).map(([g,ps])=>`${g?`<span class="ng">${H.esc(g)}</span>`:''}${ps.map(p=>`<a href="${pageHref(p)}" class="np${p.id===pid?' on':''}">${H.esc(p.title)}</a>`).join('')}`).join(''):'';
    return `<a href="#/${t.id}" class="nt${open?' on':''}">${H.esc(t.title.toUpperCase())}</a>${open?`<div class="nsub">${inner}</div>`:''}`;}).join('');
  nav.querySelector('.np.on')?.scrollIntoView({block:'nearest'});
}
const card=p=>`<a class="card" href="${pageHref(p)}" style="--c:${p.color??'var(--line-strong)'}">${p.img?`<span class="ci" style="background-image:url('${p.img}')"></span>`:''}<b>${H.esc(p.title)}</b>${p.sub?`<small>${H.esc(p.sub)}</small>`:''}</a>`;

function home(){
  const n=topics.reduce((a,t)=>a+t.pages.length,0);
  return `<header class="hero"><span class="eyebrow">THE MELON ZOMBIES WIKI</span><h1>Everything in the game, in one place</h1>
    <p class="lead">Maps and their Easter eggs, every weapon, perk, gobblegum, class and operator, and how progression works. Built from the game's own data, so the numbers match what you play. ${n} pages.</p></header>
    <div class="tiles">${topics.map(t=>`<a class="tile" href="#/${t.id}"><b>${H.esc(t.title)}</b><span>${H.esc(t.blurb)}</span><small>${t.error?'Failed to load':`${t.pages.length} page${t.pages.length===1?'':'s'}`}</small></a>`).join('')}</div>`;
}
function topicIndex(t){
  if(t.error)return `<h1>${H.esc(t.title)}</h1><p class="warn">This section failed to load: ${H.esc(t.error)}</p>`;
  return `<nav class="crumbs"><a href="#/">Wiki</a></nav><h1>${H.esc(t.title)}</h1>${t.intro?`<div class="intro">${t.intro}</div>`:''}
    ${grouped(t).map(([g,ps])=>`${g?`<h2>${H.esc(g)}</h2>`:''}<div class="cards">${ps.map(card).join('')}</div>`).join('')}`;
}
async function pageView(p){
  let html;try{html=typeof p.html==='function'?await p.html(ctx):p.html;}catch(e){console.error('[wiki]',p.id,e);html=`<p class="warn">This page failed to build: ${H.esc(e.message)}</p>`;}
  const t=p.topic,sib=t.pages,i=sib.indexOf(p),prev=sib[i-1],next=sib[i+1];
  return `<nav class="crumbs"><a href="#/">Wiki</a> › <a href="#/${t.id}">${H.esc(t.title)}</a>${p.group?` › ${H.esc(p.group)}`:''}</nav>
    <article class="page"><h1>${H.esc(p.title)}</h1>${p.sub?`<p class="sub">${H.esc(p.sub)}</p>`:''}${html??''}</article>
    <nav class="pn">${prev?`<a href="${pageHref(prev)}">← ${H.esc(prev.title)}</a>`:'<span></span>'}${next?`<a href="${pageHref(next)}">${H.esc(next.title)} →</a>`:''}</nav>`;
}
// search: every word must match the title, subtitle, group, topic or keywords; title hits rank first
function search(words){
  const ws=words.toLowerCase().split(/\s+/).filter(Boolean);if(!ws.length)return home();
  const hits=[];for(const t of topics)for(const p of t.pages){
    const title=p.title.toLowerCase(),hay=[title,p.sub,p.group,t.title,p.keywords].flat().filter(Boolean).join(' ').toLowerCase();
    if(ws.every(w=>hay.includes(w)))hits.push([ws.every(w=>title.includes(w))?0:1,p]);}
  hits.sort((a,b)=>a[0]-b[0]||a[1].title.localeCompare(b[1].title));
  return `<nav class="crumbs"><a href="#/">Wiki</a> › Search</nav><h1>“${H.esc(words)}”</h1><p class="muted">${hits.length} result${hits.length===1?'':'s'}</p>
    <div class="cards">${hits.slice(0,120).map(([,p])=>card({...p,sub:`${p.topic.title}${p.sub?' · '+p.sub:''}`})).join('')}</div>`;
}

let seq=0;
async function route(){
  const my=++seq,parts=location.hash.replace(/^#\/?/,'').split('/').map(decodeURIComponent);
  const [tid,...rest]=parts,pid=rest.join('/');let html,after=null;
  if(tid==='search'){html=search(pid);if(q.value!==pid)q.value=pid;}
  else if(!tid)html=home();
  else{const t=findTopic(tid),p=pid?findPage(tid,pid):null;
    if(!t)html=`<h1>Not found</h1><p>No section “${H.esc(tid)}”. <a href="#/">Back to the wiki</a></p>`;
    else if(pid&&!p)html=`<nav class="crumbs"><a href="#/">Wiki</a> › <a href="#/${t.id}">${H.esc(t.title)}</a></nav><h1>Not found</h1><p>No page “${H.esc(pid)}” in ${H.esc(t.title)}.</p>`;
    else if(p){html=await pageView(p);after=p.after;}else html=topicIndex(t);}
  if(my!==seq)return;
  drawNav(tid==='search'?null:tid,pid);main.innerHTML=html;main.scrollTop=0;scrollTo(0,0);
  document.title=(tid&&tid!=='search'?(findPage(tid,pid)?.title??findTopic(tid)?.title)+' · ':'')+'Melon Zombies Wiki';
  try{after?.(main,ctx);}catch(e){console.error('[wiki] after',e);}
}
let qt=null;
q.addEventListener('input',()=>{clearTimeout(qt);qt=setTimeout(()=>{const v=q.value.trim();location.hash=v?'#/search/'+encodeURIComponent(v):'#/';},180);});
addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==q){e.preventDefault();q.focus();q.select();}else if(e.key==='Escape'&&document.activeElement===q)q.blur();});
// spoiler blocks remember being opened for this visit
main.addEventListener('toggle',e=>{if(e.target.matches?.('details.spoiler'))e.target.classList.toggle('seen',e.target.open);},true);
addEventListener('hashchange',route);

const loaded=await Promise.all(TOPICS.map(loadTopic));
topics.push(...loaded.filter(Boolean).sort((a,b)=>a.order-b.order));
window.wiki={topics,ctx,render:p=>pageView(p)};   // for .tools/wiki-check.mjs
route();

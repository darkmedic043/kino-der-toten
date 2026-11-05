// The Gardener's Potting Bench. The game keeps running behind it (you can still walk), so it takes the mouse with a
// virtual cursor as the ante wheel does: pointer lock stays on, capture listeners read the movement, elementFromPoint
// finds what's under the cursor. Each seed is a paper packet with its Blender picture on it, and the packet stock is the
// rarity: kraft for common, a printed colour for uncommon, black foil for rare. A second seed in the cross socket makes a
// hybrid, and an exact mix a Legendary (resolve, garden-rules.js); the Seed Catalogue page lists every plant. No blurred shadows or filters: every
// paint here has to be something the HUD warm-up already covers (CLAUDE.md, HUD paint warm-up).
import { recipe, resolve, slotsFor, plotsFor, bloomCost, stagePower, stageHits, plantCooldown, plantDps } from './garden-rules.js';

const icon=f=>new URL(`garden/icons/${f}.webp`,import.meta.url).href;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const W=1060,H=680;

const CSS=`
#gdb{position:fixed;left:50%;top:50%;width:${W}px;height:${H}px;z-index:41;display:none;color:#2b1d14;background:#2b1d14;border:3px solid #120b07;box-shadow:8px 8px 0 #0008;font:600 13px/1.3 "Arial Narrow","Liberation Sans Narrow",sans-serif;grid-template:52px 1fr 106px/300px 1fr 300px;user-select:none;cursor:none}
#gdb.show{display:grid}
#gdb h1,#gdb h2,#gdb h3{margin:0;font-family:Georgia,"Times New Roman",serif;font-style:italic;font-weight:700}
#gdb .top{grid-column:1/-1;display:flex;align-items:center;gap:22px;padding:0 16px;background:#3a2a1c;color:#e3d2a6;border-bottom:2px solid #120b07}
#gdb .top h1{font-size:24px;margin-right:auto;color:#e3d2a6}
#gdb .sun{display:flex;align-items:center;gap:8px;font-size:15px}
#gdb .sunbar{width:150px;height:12px;background:#120b07;border:1px solid #6a5238}
#gdb .sunbar i{display:block;height:100%;background:#e9c23c;transform-origin:left}
#gdb .x{width:30px;height:30px;border:2px solid #6a5238;background:none;color:#e3d2a6;font:700 16px Georgia,serif}
#gdb .wall{padding:12px;background:#4a3524;display:grid;grid-template-columns:repeat(3,1fr);gap:7px;align-content:start;overflow:hidden}
#gdb .pk{position:relative;box-sizing:border-box;height:92px;background:#b9925f;border:1px solid #6b4f2c;padding:10px 4px 3px;text-align:center;display:flex;flex-direction:column;align-items:center;box-shadow:2px 3px 0 #0007}
#gdb .pk:nth-child(3n+1){transform:rotate(-1.2deg)}#gdb .pk:nth-child(3n+3){transform:rotate(1deg)}
#gdb .pk::before{content:"";position:absolute;left:0;right:0;top:7px;border-top:1px dashed #0006}
#gdb .pk img{width:42px;height:42px;object-fit:contain}
#gdb .pk h3{font-size:12px;line-height:1.02;margin-top:1px;white-space:nowrap}
#gdb .pk h3.long{font-size:10.5px;letter-spacing:-.2px}
#gdb .pk small{font:600 11px "Arial Narrow","Liberation Sans Narrow",sans-serif;margin-top:auto}
#gdb .pk.uncommon{background:#d6a32f;border-color:#7d5c10}
#gdb .pk.uncommon::after,#gdb .pk.rare::after{content:"";position:absolute;inset:11px 3px 3px;border:1px solid #2b1d1466;pointer-events:none}
#gdb .pk.rare{background:#1b1712;border-color:#d6a32f;color:#e9c23c}
#gdb .pk.rare::after{border-color:#d6a32f}
#gdb .pk.rare::before{border-color:#d6a32f88}
#gdb .pk.two{outline:3px dashed #5f7a3a;outline-offset:1px}
#gdb .wall.pick .pk:not(.locked){background:#d7c98f;border-color:#5f7a3a;color:#2b1d14}
#gdb .pk.locked{background:#3a2a1c;border-color:#5a452f;color:#8c7656;box-shadow:none}
#gdb .pk.locked img{opacity:.38}
#gdb .pk.stuck small{color:#8a2413}#gdb .pk.rare.stuck small{color:#e88a6a}
#gdb .pk.on{outline:3px solid #b8402c;outline-offset:1px;transform:translateY(-3px);z-index:1}
#gdb .hot{outline:2px solid #e3d2a6;outline-offset:1px}
#gdb .mid{background:#e3d2a6;padding:10px 18px 8px;display:flex;flex-direction:column;align-items:center;min-width:0}
#gdb .mid h2{font-size:27px;line-height:1.1;text-align:center}
#gdb .life{font-size:14px;color:#5b4630;margin-top:1px;text-align:center}
#gdb .potw{position:relative;height:228px;width:230px;margin-top:8px}
#gdb .potw img{position:absolute;left:50%;bottom:50px;width:172px;height:172px;margin-left:-86px;object-fit:contain;object-position:bottom}
#gdb .rim{position:absolute;left:37px;right:37px;bottom:42px;height:13px;background:#b4623d;border:1px solid #6e3518}
#gdb .pot{position:absolute;left:47px;right:47px;bottom:0;height:43px;background:#9a4f2e;clip-path:polygon(0 0,100% 0,88% 100%,12% 100%)}
#gdb .sock{display:flex;gap:10px;align-items:center;margin-top:6px;min-height:50px}
#gdb .so{width:48px;height:48px;border:2px dashed #8a7350;background:#d8c594;display:flex;align-items:center;justify-content:center;color:#7a6647;font-size:11px;text-align:center;line-height:1}
#gdb .so.cross{border-color:#5f7a3a;color:#3f6a1e}
#gdb .so.wait{background:#5f7a3a;color:#f3ebd0}
#gdb .so.full{border:2px solid #5f7a3a;background:#f0e4c2}
#gdb .so img{width:42px;height:42px;object-fit:contain}
#gdb .lad{display:grid;grid-template-columns:repeat(4,1fr);width:100%;margin-top:auto;border-top:2px solid #2b1d14}
#gdb .st{padding:5px 4px 2px;text-align:center;border-left:1px solid #2b1d1444;font-size:13px;line-height:1.15}
#gdb .st:first-child{border-left:0}
#gdb .st b{display:block;font:italic 700 14px Georgia,serif}
#gdb .st.off{color:#a08c6c}
#gdb .side{background:#cdb988;display:flex;flex-direction:column;padding:10px 12px;gap:8px;min-width:0}
#gdb .side h3{font-size:15px;line-height:1}
#gdb .tins{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
#gdb .tin{position:relative;height:49px;background:#e3d2a6;border:1px solid #6b4f2c;display:flex;align-items:center;justify-content:center}
#gdb .tin img{width:40px;height:40px;object-fit:contain}
#gdb .tin u{position:absolute;right:2px;bottom:0;text-decoration:none;font-size:15px;font-weight:700}
#gdb .tin.none{background:#b9a678}#gdb .tin.none img{opacity:.35}
#gdb .tin.fixed{background:#d8c594}
#gdb .sheet{margin-top:2px;font-size:14px}
#gdb .row{display:flex;justify-content:space-between;border-bottom:1px solid #2b1d1433;padding:1.5px 0}
#gdb .row b{font-size:15px}#gdb .row b.up{color:#3f6a1e}
#gdb .say{margin-top:auto;font:400 14px/1.3 Georgia,serif;color:#2b1d14;min-height:92px}
#gdb .say em{display:block;margin-top:4px;color:#7a4a10}
#gdb .bed{grid-column:1/-1;display:flex;gap:6px;padding:8px 10px;background:#1f150e;border-top:2px solid #120b07;align-items:stretch}
#gdb .rows{display:flex;gap:6px;flex:1;min-width:0;overflow:hidden}
#gdb .gp{width:96px;flex:none;position:relative;background:#cdb988;border:1px solid #6b4f2c;color:#2b1d14;padding:2px 4px;font-size:12px;line-height:1.1;display:flex;flex-direction:column;align-items:center}
#gdb .gp img{width:46px;height:46px;object-fit:contain}
#gdb .gp .hp{width:100%;height:5px;background:#2b1d14;margin-top:auto}
#gdb .gp .hp i{display:block;height:100%;background:#5f7a3a;transform-origin:left}
#gdb .gp .up{position:absolute;right:1px;top:1px;width:18px;height:18px;line-height:15px;text-align:center;font:700 13px Georgia,serif;color:#8a2413;border:1px solid #6e3518;background:#e3d2a6}
#gdb .empty{color:#a08c6c;font:italic 400 15px Georgia,serif;align-self:center;padding-left:6px}
#gdb .go{display:flex;flex-direction:column;gap:6px;width:192px;flex:none}
#gdb .btn{flex:1;border:2px solid #120b07;background:#5f7a3a;color:#f3ebd0;font:italic 700 19px Georgia,serif;box-shadow:2px 2px 0 #000}
#gdb .btn.b{background:#d6a32f;color:#2b1d14;font-size:15px}
#gdb .btn.no{background:#4a3f33;color:#94866f;box-shadow:none}
#gdb .tab{height:30px;padding:0 12px;border:2px solid #6a5238;background:none;color:#e3d2a6;font:italic 700 15px Georgia,serif}
#gdb .book{grid-column:1/-1;grid-row:2;background:#e3d2a6;padding:9px 12px;display:flex;flex-direction:column;gap:5px;min-height:0;overflow:hidden}
#gdb .book h3{font-size:15px;line-height:1.1}
#gdb .cards{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
#gdb .cd{box-sizing:border-box;height:52px;background:#cdb988;border:1px solid #6b4f2c;display:flex;align-items:center;gap:3px;padding:2px 3px;font-size:12px;line-height:1.02;min-width:0}
#gdb .cd img{width:44px;height:44px;flex:none;object-fit:contain}
#gdb .cd b,#gdb .cd small{display:block;font-weight:600}#gdb .cd b{font:italic 700 12px Georgia,serif}#gdb .cd small{font-size:11px;color:#5b4630}
#gdb .cd.off{background:#c0ae80;color:#8c7656}#gdb .cd.off img{opacity:.42}
#gdb .cards.leg{grid-template-columns:repeat(7,1fr)}
#gdb .cd.lg{height:136px;flex-direction:column;background:#1b1712;border-color:#d6a32f;color:#e9c23c;text-align:center;justify-content:flex-start;padding:4px}
#gdb .cd.lg small{color:#d8c594;font:italic 400 12px/1.15 Georgia,serif;margin-top:2px}#gdb .cd.lg b{color:#e9c23c}
#gdb .cd.lg img,#gdb .sil{width:60px;height:60px;flex:none}
#gdb .sil{background:#4a3a1c;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}
#gdb .note{margin-top:auto;min-height:40px;font:400 14px/1.25 Georgia,serif}
#gdc{position:fixed;left:0;top:0;width:0;height:0;z-index:42;display:none;border-left:7px solid #e3d2a6;border-top:0 solid transparent;border-right:7px solid transparent;border-bottom:14px solid transparent;pointer-events:none}
#gdp{position:fixed;left:50%;bottom:17%;transform:translateX(-50%);z-index:41;display:none;align-items:center;gap:10px;padding:7px 12px;background:#2b1d14;border:2px solid #120b07;color:#e3d2a6;font:italic 700 16px Georgia,serif;pointer-events:none}
#gdp button{display:none;pointer-events:auto;padding:8px 16px;border:2px solid #120b07;background:#5f7a3a;color:#f3ebd0;font:italic 700 17px Georgia,serif}
#gdp button+button{background:#4a3f33}
.touch-mode #gdp button{display:block}.touch-mode #gdp span{display:none}
`;
const WHY={cross:'These two seeds don’t cross.',legend:'Only so many Legendaries can stand in one garden.',locked:'Buy this seed in the skill tree.',packet:'This seed needs a Seed Packet. They drop from kills near your garden from round 4.',rare:'This seed needs a Rare Seed. They drop from round 10, mostly from dogs and specials.',ingredient:'You don’t have enough of that ingredient.',limit:'You already have as many of these as the garden allows.',plots:'Not enough free plots. Uproot something first.'};

export function setupBench({api,cls,G,ctl}){
  const {host,session,audio}=api;
  const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
  const el=document.createElement('div');el.id='gdb';document.body.append(el);
  const cursor=document.createElement('div');cursor.id='gdc';document.body.append(cursor);
  const hint=document.createElement('div');hint.id='gdp';
  hint.innerHTML='<span>Click to plant. Right click cancels.</span><button data-p="go">Plant here</button><button data-p="no">Cancel</button>';document.body.append(hint);
  hint.addEventListener('click',e=>{const a=e.target.dataset?.p;if(a==='go')ctl.confirmPlace();else if(a==='no')ctl.stopPlacing();});
  const touch=()=>document.body.classList.contains('touch-mode');
  const P=G.plants;
  const ranks=['common','uncommon','rare','legendary'],byRank=(a,b)=>ranks.indexOf(P[a].rarity)-ranks.indexOf(P[b].rarity);
  const seeds=[...cls.trees.flatMap(t=>[t.seed,...t.nodes.filter(n=>n.seed).map(n=>n.seed)])].filter((v,i,a)=>a.indexOf(v)===i).sort(byRank);
  const hybrids=Object.keys(P).filter(k=>P[k].parents),legends=Object.keys(P).filter(k=>P[k].legend);
  const treeOf=id=>cls.trees.find(t=>t.seed===id||t.nodes.some(n=>n.seed===id));
  let open=false,seed=null,seed2=null,crossing=false,tab='bench',adds=[],hover=null,cx=0,cy=0,padA=false,padB=false,beat=0;

  // Everything shown here is decoded behind the loading screen: a bench that opens mid-round decodes nothing.
  const names=[...Object.keys(P).flatMap(k=>[1,2,3].map(i=>`${k}_${i}`)),...Object.keys(G.additives),...Object.keys(G.items)];
  const imgs=names.map(n=>{const i=new Image();i.src=icon(n);return i;});
  host.pending?.push?.(Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));

  const count=a=>adds.filter(x=>x===a).length;
  const mix=()=>resolve(G,seed,seed2,adds);
  const made=()=>mix()?.id??seed;
  const free=()=>slotsFor(G,ctl.S())-(seed2||crossing?1:0);
  const nameOf=x=>P[x]?.name??G.additives[x]?.name??x;
  const stage=(id,st)=>icon(`${id}_${Math.min(3,Math.max(1,st))}`);
  const inGround=id=>ctl.plants.filter(p=>p.r.id===id).length;
  function why(){
    const m=mix();if(!m)return WHY.cross;
    const b=ctl.block(m.id,m.adds,m.cost);if(b)return WHY[b];
    if(!session.power)return 'The bench works once the power is on.';
    const c=ctl.cooldown();if(c>0)return `The bench is ready in ${Math.ceil(c)} s.`;
    return null;
  }
  function packet(id){
    const p=P[id],have=ctl.known().includes(id),need=G.rarity[p.rarity].needs;
    const stuck=have&&(need?(ctl.inv[need]??0)<1:false);
    const n=inGround(id);
    const foot=!have?esc(treeOf(id)?.name??'Skill tree'):need?`${ctl.inv[need]??0} ${esc(G.items[need].name)}${(ctl.inv[need]??0)===1?'':'s'}`:n?`${n} planted`:'Free';
    return `<div class="pk ${p.rarity}${have?'':' locked'}${stuck?' stuck':''}${id===seed?' on':''}${id===seed2?' two':''}" data-act="seed:${id}"><img src="${stage(id,1)}" alt=""><h3${p.name.length>13?' class="long"':''}>${esc(p.name)}</h3><small>${foot}</small></div>`;
  }
  function stages(r){
    const S=ctl.S();
    return G.stages.map((s,i)=>{
      const off=i>r.cap,when=i===0?`${Math.round(r.grow)} s`:i===1?'next':`${Math.round(s.age/r.ageRate)} s`;
      const k=i===0?'No attacks':`${Math.round(stagePower(G,S,i)*100)}% power`;
      return `<div class="st${off?' off':''}"><b>${esc(s.name)}</b>${off?'Won’t reach':when}<br>${off?'&nbsp;':k}</div>`;
    }).join('');
  }
  function sheet(r){
    const S=ctl.S(),base=recipe(G,{},made(),[]),top=Math.min(3,r.cap);
    const rows=[['Health',`${Math.round(r.hits)} bites`,r.hits>base.hits],['Range',String(Math.round(r.range)),r.range>base.range],['Plots',String(r.plots),false]];
    const dps=plantDps(r,G,S,top);if(dps>0)rows.push(['Best damage',`${Math.round(dps*100)}% zombie/s`,false]);
    if(r.uses)rows.push(['Uses',String(r.uses),r.uses>base.uses]);
    if(r.slow)rows.push(['Slow',`${Math.round(r.slow*100)}%`,true]);
    rows.push(['Bench after',`${Math.round(plantCooldown(G,made(),ctl.base()))} s`,false]);
    return rows.map(([a,b,up])=>`<div class="row"><span>${a}</span><b class="${up?'up':''}">${b}</b></div>`).join('');
  }
  function say(r){
    const h=/^(add|tin):(.+)/.exec(hover??'');
    if(h){const x=G.additives[h[2]]??G.items[h[2]];return `<b>${esc(x.name)}.</b> ${esc(x.desc)}`;}
    const w=why(),p=P[made()];
    return `${esc(p.desc)}${r.cap>=3?`<em>Ancient: ${esc(p.ancient)}</em>`:''}${w?`<em>${esc(w)}</em>`:''}`;
  }
  const tins=()=>ctl.adds().map(a=>{const n=(ctl.inv[a]??0)-count(a);return `<div class="tin${n>0?'':' none'}" data-act="add:${a}"><img src="${icon(a)}" alt="${esc(G.additives[a].name)}"><u>${n}</u></div>`;}).join('')
    +Object.keys(G.items).filter(a=>G.items[a].shelf!==false).map(a=>`<div class="tin fixed${ctl.inv[a]>0?'':' none'}" data-act="tin:${a}"><img src="${icon(a)}" alt="${esc(G.items[a].name)}"><u>${ctl.inv[a]??0}</u></div>`).join('');
  function bed(){
    if(!ctl.plants.length)return '<div class="empty">Nothing in the ground yet.</div>';
    return ctl.plants.map((p,i)=>{
      const hp=Math.max(0,p.hits/p.maxHits);
      return `<div class="gp" data-act="tin:"><img src="${stage(p.r.id,p.stage)}" alt=""><span>${esc(G.stages[p.stage].name)}${p.uses&&p.r.def.uses?`, ${p.uses} left`:''}</span><div class="hp"><i style="transform:scaleX(${hp.toFixed(2)})"></i></div><div class="up" data-act="up:${i}">×</div></div>`;
    }).join('');
  }
  // The Seed Catalogue: every plant the class can grow. A Legendary shows as a shadow and a riddle until you have planted it.
  function card(id){
    const p=P[id],have=ctl.known().includes(id),sub=p.parents?p.parents.map(nameOf).join(' × '):G.rarity[p.rarity].name??p.rarity;
    return `<div class="cd${have?'':' off'}" data-act="book:${id}"><img src="${stage(id,3)}" alt=""><span><b>${esc(p.name)}</b><small>${esc(sub)}</small></span></div>`;
  }
  function legend(id){
    const p=P[id],got=ctl.found().includes(id);
    return got?`<div class="cd lg" data-act="book:${id}"><img src="${stage(id,3)}" alt=""><span><b>${esc(p.name)}</b><small>${esc(p.recipe.map(nameOf).join(' + '))}</small></span></div>`
      :`<div class="cd lg" data-act="book:${id}"><div class="sil" style="--m:url(${stage(id,3)})"></div><span><b>Unknown</b><small>${esc(p.riddle)}</small></span></div>`;
  }
  function note(){
    const h=/^book:(.+)/.exec(hover??'');if(!h)return 'Click a plant you know to set its mix on the bench.';
    const p=P[h[1]];if(p.legend&&!ctl.found().includes(h[1]))return esc(p.riddle);
    return `<b>${esc(p.name)}.</b> ${esc(p.desc)}`;
  }
  function book(){
    return `<div class="book"><h3>Seeds</h3><div class="cards">${seeds.map(card).join('')}</div>
      <h3>Hybrids</h3><div class="cards">${hybrids.map(card).join('')}</div>
      <h3>Legendaries, ${legends.filter(x=>ctl.found().includes(x)).length} of ${legends.length} found</h3><div class="cards leg">${legends.map(legend).join('')}</div>
      <div class="note">${note()}</div></div>`;
  }
  function render(){
    if(!open)return;
    const S=ctl.S(),m=mix(),id=m?.id??seed,r=recipe(G,S,id,m?.adds??[]),slots=free(),bc=bloomCost(G,S),ok=!why();
    const crossSock=seed2?`<div class="so full" data-act="cross:"><img src="${stage(seed2,1)}" alt=""></div>`:`<div class="so cross${crossing?' wait':''}" data-act="cross:">${crossing?'Pick a seed':'Cross a seed'}</div>`;
    const plots=plotsFor(G,S),used=ctl.usedPlots(),sock=crossSock+Array.from({length:slots},(_,i)=>adds[i]?`<div class="so full" data-act="rem:${i}"><img src="${icon(adds[i])}" alt=""></div>`:'<div class="so">Add an ingredient</div>').join('');
    const title=m?esc(r.name):`${esc(P[seed].name)} × ${esc(P[seed2].name)}`,life=m?`${esc(G.life[r.life].name)}: ${esc(G.life[r.life].desc.toLowerCase())}`:'These two don’t cross.';
    const top=`<div class="top"><h1>${tab==='book'?'Seed Catalogue':'Potting Bench'}</h1><button class="tab" data-act="tab:">${tab==='book'?'Back to the bench':'Seed Catalogue'}</button><span>${used} of ${plots} plots used</span><div class="sun">Sunlight <div class="sunbar"><i id="gdsun"></i></div><span id="gdsunv"></span></div><button class="x" data-act="close">×</button></div>`;
    const foot=`<div class="bed"><div class="rows" id="gdbed">${bed()}</div><div class="go"><button class="btn${ok?'':' no'}" data-act="plant">Plant</button><button class="btn b${ctl.sun()>=bc?'':' no'}" data-act="bloom">Bloom, ${bc} Sunlight</button></div></div>`;
    el.innerHTML=top+(tab==='book'?book():`<div class="wall${crossing?' pick':''}">${seeds.map(packet).join('')}</div>
      <div class="mid"><h2>${title}</h2><div class="life">${life}</div>
        <div class="potw"><img src="${stage(id,r.cap)}" alt=""><div class="rim"></div><div class="pot"></div></div>
        <div class="sock">${sock}</div><div class="lad">${stages(r)}</div></div>
      <div class="side"><h3>Your ingredients</h3><div class="tins">${tins()}</div><div class="sheet">${sheet(r)}</div><div class="say">${say(r)}</div></div>`)+foot;
    live();
  }
  function live(){
    const v=ctl.sun();
    el.querySelector('#gdsun')?.style.setProperty('transform',`scaleX(${Math.min(1,v/cls.resource.max).toFixed(3)})`);
    const t=el.querySelector('#gdsunv');if(t)t.textContent=Math.floor(v);
  }
  function setHover(a){if(a===hover)return;hover=a;render();mark();}
  function under(){return touch()?null:document.elementFromPoint(cx,cy)?.closest?.('[data-act]')??null;}
  function mark(){
    el.querySelectorAll('.hot').forEach(n=>n.classList.remove('hot'));
    const n=under();if(n&&n.dataset.act!=='tin:')n.classList.add('hot');
  }
  function act(a){
    if(!a)return;
    const [k,v]=a.split(':');
    if(k==='seed'){
      if(crossing){if(v!==seed&&ctl.known().includes(v)){seed2=v;crossing=false;audio.play('board',.2);}else audio.play('empty',.4);}
      else{seed=v;if(seed2===v)seed2=null;audio.play('board',.18);}
    }
    else if(k==='cross'){
      if(seed2)seed2=null;else{crossing=!crossing;adds=adds.slice(0,Math.max(0,free()));}
      audio.play('board',.15);
    }
    else if(k==='tab'){tab=tab==='book'?'bench':'book';crossing=false;audio.play('board',.15);}
    else if(k==='book')load(v);
    else if(k==='add'){
      if(adds.length<free()&&(ctl.inv[v]??0)>count(v)){adds.push(v);audio.play('board',.2);}
      else audio.play('empty',.4);
    }
    else if(k==='rem'){adds.splice(+v,1);audio.play('board',.15);}
    else if(k==='up'){const p=ctl.plants[+v];if(p)ctl.uproot(p);}
    else if(k==='plant')return plant();
    else if(k==='bloom'){if(!ctl.bloom())audio.play('empty',.4);}
    else if(k==='close')return close();
    render();mark();
  }
  function plant(){
    if(why()){audio.play('empty',.4);render();return;}
    const m=mix();ctl.startPlacing(m.id,m.adds,m.cost);
  }
  // From the Catalogue: lay out the mix of a plant you know
  function load(id){
    const p=P[id];
    if(!ctl.known().includes(id)||p.legend&&!ctl.found().includes(id)){audio.play('empty',.4);return;}
    const parts=p.parents??p.recipe??[id],ss=parts.filter(x=>P[x]);
    seed=ss[0];seed2=ss[1]??null;crossing=false;adds=parts.filter(x=>!P[x]);tab='bench';audio.play('board',.2);
  }
  function move(dx,dy){
    cx=Math.max(0,Math.min(innerWidth-2,cx+dx));cy=Math.max(0,Math.min(innerHeight-2,cy+dy));
    cursor.style.transform=`translate(${cx}px,${cy}px)`;
    setHover(under()?.dataset.act??null);mark();
  }
  function show(){
    const k=Math.min(1,innerWidth/(W+16),innerHeight/(H+16));
    el.style.transform=`translate(-50%,-50%) scale(${k.toFixed(3)})`;
  }
  function openBench(){
    if(open)return;
    const list=ctl.known();
    if(!seed||!list.includes(seed))seed=list[0];
    if(seed2&&!list.includes(seed2))seed2=null;
    crossing=false;tab='bench';
    adds=adds.filter((a,i)=>(ctl.inv[a]??0)>adds.slice(0,i).filter(x=>x===a).length);
    open=true;hover=null;cx=innerWidth/2;cy=innerHeight*.72;window.kino.lookHold=true;
    show();el.classList.add('show');
    if(!touch())cursor.style.display='block';
    audio.play('board',.3);render();move(0,0);
  }
  function close(){
    if(!open)return;
    open=false;window.kino.lookHold=false;el.classList.remove('show');cursor.style.display='none';
  }
  const eat=e=>{e.preventDefault();e.stopImmediatePropagation();};
  addEventListener('keydown',e=>{
    if(!open)return;
    if(e.code==='Escape'){close();return;}
    if(e.code==='KeyQ'&&!e.repeat){eat(e);close();}
  },true);
  addEventListener('mousemove',e=>{if(open&&!touch()){e.stopImmediatePropagation();move(e.movementX,e.movementY);}},true);
  addEventListener('mousedown',e=>{if(!open||touch())return;eat(e);if(e.button===0)act(under()?.dataset.act);else if(e.button===2)close();},true);
  addEventListener('wheel',e=>{if(open)e.stopImmediatePropagation();},true);
  el.addEventListener('click',e=>{if(touch())act(e.target.closest?.('[data-act]')?.dataset.act);});

  host.on('warmHud',(on,wait)=>{
    if(on){
      seed=ctl.known()[0];seed2=null;adds=[];tab='bench';open=true;show();el.classList.add('show');hint.style.display='flex';render();
      wait?.(new Promise(res=>setTimeout(()=>{tab='book';render();setTimeout(res,80);},80)));
    }
    else{open=false;tab='bench';el.classList.remove('show');hint.style.display='none';}
  });
  return {
    open:openBench,close,isOpen:()=>open,
    refresh(){if(open){render();mark();}},
    confirm(){plant();},
    placing(on){hint.style.display=on?'flex':'none';},
    update(dt){
      if(!open)return;
      if(!api.getState?.()?.active&&!touch()||session.phase==='reviving'){close();return;}
      if((beat-=dt)<=0){beat=.4;live();const b=el.querySelector('#gdbed');if(b){const h=bed();if(b.innerHTML!==h)b.innerHTML=h;}}
      const gp=[...(navigator.getGamepads?.()??[])].find(g=>g?.connected);if(!gp)return;
      const x=gp.axes[2]??0,y=gp.axes[3]??0;
      if(Math.hypot(x,y)>.15)move(x*dt*620,y*dt*620);
      const a=!!gp.buttons[0]?.pressed,b=!!gp.buttons[1]?.pressed;
      if(a&&!padA)act(under()?.dataset.act);if(b&&!padB)close();padA=a;padB=b;
    }
  };
}

// Class skill trees in the main menu, laid out like Borderlands 4: the action
// skill on top, three trees side by side, each a column of tiers that open as
// points go into that tree (a spine fills as you invest). Passives have ranks,
// augments (diamonds) change the action skill, the capstone sits at the bottom.
// Left click adds a point, right click takes one out; Respec refunds everything.
import { classById, xpToNext, available, totalPoints, treeSpent, tierNeed, canAdd, canRemove, actionStats, actionRows, describe } from './classes.js';

const ICONS={
  turret:'<path d="M5 20h14M8 20l2-6h4l2 6M12 14V9M7 9h10v-3H7zM17 7.5h4"/>',
  wall:'<path d="M3 6h18v12H3zM3 10h18M3 14h18M9 6v4M15 10v4M9 14v4"/>',
  crosshair:'<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  snow:'<path d="M12 3v18M4 7.5l16 9M4 16.5l16-9M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
  recycle:'<path d="M7 9l3-5h4l2 3M17 15l-3 5H8M5 15l-2-3 2-4M16 7l3 1-1 3M8 20l-3-1 1-3"/>',
  bolt:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  double:'<path d="M3 20h8M5 20l1.5-4h3L11 20M8 16v-4M13 20h8M15 20l1.5-4h3L21 20M18 16v-4M6 12h4M16 12h4"/>',
  shield:'<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  wrench:'<path d="M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 1-2-2z"/>',
  heart:'<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  grenade:'<circle cx="11" cy="14" r="6"/><path d="M9 8h4v-3H9zM13 6.5l4-2"/>',
  coin:'<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5"/>',
  magnet:'<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/>',
  flame:'<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-10 3 2 4 4 4 6 1-1 1.5-2 1.5-3 2 2 2.5 4 2.5 6 0 4-2 7-6 7z"/>',
  bomb:'<circle cx="11" cy="14" r="6.5"/><path d="M15 9l3-3M18 6l1-1M17 3.5l.5 1.5M20.5 7l-1.5-.5"/>',
};
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]??ICONS.gear}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export const CLASS_CSS=`
.cls{display:grid;gap:18px}
.cls-pick{display:flex;gap:10px;flex-wrap:wrap}
.cls-pick button{display:flex;align-items:center;gap:10px;padding:9px 16px 9px 11px;border:1px solid var(--line);background:#0b0b0bcc;color:#cfc8ba;font:600 11px/1 inherit;letter-spacing:.14em;cursor:pointer}
.cls-pick button svg{width:20px;height:20px;color:var(--pc)}
.cls-pick button small{color:#8b857a;letter-spacing:.08em}
.cls-pick button.on{border-color:var(--pc);background:linear-gradient(90deg,color-mix(in srgb,var(--pc) 22%,transparent),#0b0b0bcc);color:#fff}
.cls-pick button:hover{border-color:var(--pc)}
.cls-head{display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center;padding:18px 22px;border:1px solid var(--line);background:linear-gradient(90deg,color-mix(in srgb,var(--cc) 18%,transparent),#05050580 55%)}
.cls-emblem{width:64px;height:64px;color:var(--cc);display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--cc) 60%,transparent);clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);background:#0008}
.cls-emblem svg{width:34px;height:34px}
.cls-title strong{display:block;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:38px;letter-spacing:1px;line-height:1}
.cls-title small{color:var(--muted);font-size:11px;letter-spacing:1px}
.cls-xp{margin-top:10px;display:flex;align-items:center;gap:10px;font-size:10px;letter-spacing:2px;color:var(--muted)}
.cls-xp .bar{flex:0 0 260px;margin:0}.cls-xp .bar i{background:var(--cc)}
.cls-points{text-align:right}
.cls-points b{display:block;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:44px;line-height:1;color:var(--cc)}
.cls-points span{font-size:9px;letter-spacing:3px;color:var(--muted)}
.cls-points button{margin-top:10px;background:#05050560;border:1px solid var(--line-strong);color:var(--muted);padding:6px 12px;font-size:9px;letter-spacing:2px}
.cls-points button:hover{color:var(--text);border-color:var(--red-hi)}
.cls-body{display:grid;grid-template-columns:300px 1fr;gap:18px;align-items:start}
.cls-side{display:grid;gap:14px;position:sticky;top:0}
.cls-action{border:1px solid color-mix(in srgb,var(--cc) 50%,transparent);background:#05050590;padding:16px}
.cls-action .top{display:flex;gap:14px;align-items:center}
.cls-action .ic{width:56px;height:56px;flex:none;display:grid;place-items:center;color:#111;background:var(--cc);clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)}
.cls-action .ic svg{width:30px;height:30px}
.cls-action .eyebrow{display:block;margin-bottom:4px;font-size:9px}
.cls-action strong{font-size:16px;letter-spacing:1px}
.cls-action p{font-size:12px;line-height:1.55;color:#cfc6b4;margin:12px 0}
.cls-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:10px;letter-spacing:1px;color:var(--muted)}
.cls-stats b{color:var(--text);font-weight:600;float:right}
.cls-stats .up b{color:var(--cc)}
.cls-detail{border:1px solid var(--line);background:#05050590;padding:16px;min-height:150px}
.cls-detail .kind{font-size:9px;letter-spacing:3px;color:var(--dc,var(--muted))}
.cls-detail strong{display:block;font-size:15px;letter-spacing:1px;margin:6px 0 2px}
.cls-detail .rank{font-size:10px;letter-spacing:2px;color:var(--muted)}
.cls-detail p{font-size:12px;line-height:1.55;color:#cfc6b4;margin:10px 0 0}
.cls-detail .next{color:var(--dc,var(--gold))}
.cls-detail .lock{color:#c96a5a;font-size:11px;margin-top:10px}
.cls-trees{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.tree{--tc:#888;border:1px solid var(--line);background:linear-gradient(180deg,color-mix(in srgb,var(--tc) 10%,#05050590),#05050590 40%);position:relative;padding:14px 10px 16px}
.tree-head{text-align:center;margin-bottom:12px}
.tree-head strong{display:block;font-size:13px;letter-spacing:3px;color:var(--tc);text-transform:uppercase}
.tree-head small{font-size:10px;color:var(--muted)}
.tree-head .spent{display:inline-block;margin-top:6px;font-size:10px;letter-spacing:2px;padding:3px 8px;border:1px solid color-mix(in srgb,var(--tc) 50%,transparent)}
.tree-body{position:relative}
.spine{position:absolute;left:50%;top:18px;bottom:18px;width:3px;margin-left:-1.5px;background:#ffffff12}
.spine i{display:block;width:100%;background:linear-gradient(var(--tc),color-mix(in srgb,var(--tc) 60%,#fff));box-shadow:0 0 10px var(--tc);transition:height .3s}
.tier{position:relative;display:flex;justify-content:center;gap:18px;padding:10px 0;min-height:86px;align-items:center}
.tier .need{position:absolute;left:2px;top:6px;font-size:8px;letter-spacing:1.5px;color:var(--dim)}
.tier.locked .need{color:#c96a5a}
.tier.locked .node{filter:grayscale(1) brightness(.55)}
.node{position:relative;width:60px;height:66px;display:grid;place-items:center;background:none;border:0;padding:0;color:var(--text);z-index:1}
.node .shape{position:absolute;inset:0;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:color-mix(in srgb,var(--tc) 35%,#0b0b0b);transition:transform .12s,background .15s}
.node .shape::after{content:'';position:absolute;inset:2px;clip-path:inherit;background:#0e0f0f}
.node.invested .shape::after{background:linear-gradient(160deg,color-mix(in srgb,var(--tc) 45%,#141414),#101010)}
.node.max .shape{background:var(--tc);box-shadow:0 0 18px var(--tc)}
.node svg{position:relative;width:24px;height:24px;color:#a8a294}
.node.invested svg{color:var(--tc)}
.node.max svg{color:#fff}
.node:hover .shape,.node.sel .shape{transform:scale(1.08);background:color-mix(in srgb,var(--tc) 80%,#fff)}
.node .pips{position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);display:flex;gap:2px}
.node .pips i{width:6px;height:3px;background:#ffffff26}.node .pips i.on{background:var(--tc)}
.node.augment{width:56px;height:56px}
.node.augment .shape{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
.node.capstone{width:78px;height:86px}
.node.capstone .shape{clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(160deg,var(--tc),color-mix(in srgb,var(--tc) 30%,#000))}
.node.capstone svg{width:32px;height:32px}
.node.can .shape{animation:nodepulse 1.6s ease-in-out infinite}
@keyframes nodepulse{50%{box-shadow:0 0 0 0 transparent;filter:brightness(1.25)}}
@media(max-width:1100px){.cls-body{grid-template-columns:1fr}.cls-side{position:static}}
@media(max-width:820px){.cls-trees{grid-template-columns:1fr}.cls-head{grid-template-columns:1fr}.cls-points{text-align:left}}
`;

export function renderClasses(root,cfg,{getState,setState}){
  let sel=null;
  function draw(){
    const st=getState(),cls=classById(cfg,st.selected)??cfg.classes[0],state=st.classes[cls.id];
    const a=actionStats(cls,state),b=cls.action.base,up=(x,y)=>Math.abs(x-y)>1e-6?' class="up"':'';
    const need=xpToNext(cfg,state.level),maxed=state.level>=cfg.xp.maxLevel;
    root.style.setProperty('--cc',cls.color);
    root.innerHTML=`<div class="cls">
      ${cfg.classes.length>1?`<div class="cls-pick">${cfg.classes.map(c=>`<button data-class="${c.id}" style="--pc:${c.color}"${c.id===cls.id?' class="on"':''}>${icon(c.action.icon)}${esc(c.name.toUpperCase())} <small>LV ${st.classes[c.id]?.level??1}</small></button>`).join('')}</div>`:''}
      <div class="cls-head">
        <div class="cls-emblem">${icon(cls.id==='engineer'?'wrench':cls.action.icon)}</div>
        <div class="cls-title"><span class="eyebrow">CLASS</span><strong>${esc(cls.name.toUpperCase())}</strong><small>${esc(cls.tagline)}</small>
          <div class="cls-xp">LEVEL ${state.level}${maxed?' · MAX':''}<div class="bar"><i style="width:${maxed?100:Math.round(state.xp/need*100)}%"></i></div>${maxed?'':`${state.xp} / ${need} XP`}</div></div>
        <div class="cls-points"><b>${available(state)}</b><span>SKILL POINTS</span><br><button data-act="respec">RESPEC</button></div>
      </div>
      <div class="cls-body">
        <div class="cls-side">
          <div class="cls-action"><div class="top"><div class="ic">${icon(cls.action.icon)}</div><div><span class="eyebrow">ACTION SKILL · Z</span><strong>${esc(cls.action.name)}</strong></div></div>
            <p>${esc(cls.action.desc)}</p>
            <div class="cls-stats">
              ${actionRows(cls,a).map(([label,value,better])=>`<span${better?' class="up"':''}>${label} <b>${value}</b></span>`).join('')}
            </div></div>
          <div class="cls-detail" id="cls-detail"></div>
        </div>
        <div class="cls-trees">${cls.trees.map(t=>{
          const spentT=treeSpent(cls,state,t.id),tiers=Math.max(...t.nodes.map(n=>n.tier)),fill=Math.min(1,spentT/tierNeed(cfg,tiers));
          return `<div class="tree" style="--tc:${t.color}"><div class="tree-head"><strong>${esc(t.name)}</strong><small>${esc(t.desc)}</small><br><span class="spent">${spentT} PTS</span></div>
            <div class="tree-body"><div class="spine"><i style="height:${fill*100}%"></i></div>
            ${Array.from({length:tiers},(_,i)=>{const tier=i+1,locked=spentT<tierNeed(cfg,tier);
              return `<div class="tier${locked?' locked':''}"><span class="need">${tier===1?'':(locked?'🔒 ':'')+tierNeed(cfg,tier)}</span>${t.nodes.filter(n=>n.tier===tier).map(n=>{
                const r=state.points[n.id]??0,node={...n,tree:t.id};
                return `<button class="node ${n.type??'passive'}${r?' invested':''}${r>=n.ranks?' max':''}${canAdd(cfg,cls,state,node)?' can':''}${sel===n.id?' sel':''}" data-node="${n.id}" data-tree="${t.id}">
                  <span class="shape"></span>${icon(n.icon)}<span class="pips">${Array.from({length:n.ranks},(_,k)=>`<i${k<r?' class="on"':''}></i>`).join('')}</span></button>`;}).join('')}</div>`;}).join('')}
            </div></div>`;}).join('')}</div>
      </div></div>`;
    detail(cls,state);
  }
  function detail(cls,state){
    const el=root.querySelector('#cls-detail');if(!el)return;
    const t=cls.trees.find(t=>t.nodes.some(n=>n.id===sel)),n=t?.nodes.find(n=>n.id===sel);
    if(!n){el.innerHTML=`<span class="kind">SKILL</span><p>Hover a skill to see what it does. Left click to spend a point, right click to take it back. Every ${cfg.tierPoints} points in a tree opens its next tier.</p>`;return;}
    const r=state.points[n.id]??0,node={...n,tree:t.id},locked=treeSpent(cls,state,t.id)<tierNeed(cfg,n.tier);
    const kind=n.type==='augment'?'AUGMENT · CHANGES THE ACTION SKILL':n.type==='capstone'?'CAPSTONE':'PASSIVE';
    el.style.setProperty('--dc',t.color);
    el.innerHTML=`<span class="kind">${kind} · ${esc(t.name.toUpperCase())}</span><strong>${esc(n.name)}</strong><span class="rank">RANK ${r} / ${n.ranks}</span>
      <p>${esc(describe(n,r||1))}</p>${r&&r<n.ranks?`<p class="next">Next rank: ${esc(describe(n,r+1))}</p>`:''}
      ${locked?`<div class="lock">Needs ${tierNeed(cfg,n.tier)} points in ${esc(t.name)} (${treeSpent(cls,state,t.id)} spent)</div>`:''}
      ${!locked&&r<n.ranks&&available(state)<=0?`<div class="lock">No skill points: level the ${esc(cls.name)} up by playing as it.</div>`:''}`;
  }
  root.addEventListener('mouseover',e=>{const b=e.target.closest('.node');if(!b||b.dataset.node===sel)return;sel=b.dataset.node;root.querySelectorAll('.node.sel').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');const st=getState(),cls=classById(cfg,st.selected)??cfg.classes[0];detail(cls,st.classes[cls.id]);});
  function change(e,dir){
    const b=e.target.closest('.node');if(!b)return;e.preventDefault();
    const st=getState(),cls=classById(cfg,st.selected)??cfg.classes[0],state=st.classes[cls.id];
    const n={...cls.trees.find(t=>t.id===b.dataset.tree).nodes.find(n=>n.id===b.dataset.node),tree:b.dataset.tree};sel=n.id;
    if(dir>0&&canAdd(cfg,cls,state,n))state.points[n.id]=(state.points[n.id]??0)+1;
    else if(dir<0&&canRemove(cfg,cls,state,n)){state.points[n.id]--;if(!state.points[n.id])delete state.points[n.id];}
    else return;
    setState(st);draw();
  }
  root.addEventListener('click',e=>{
    const pick=e.target.closest('[data-class]');if(pick){const st=getState();st.selected=pick.dataset.class;setState(st);sel=null;draw();return;}
    if(e.target.closest('[data-act="respec"]')){const st=getState(),cls=classById(cfg,st.selected)??cfg.classes[0];st.classes[cls.id].points={};setState(st);draw();return;}
    change(e,1);
  });
  root.addEventListener('contextmenu',e=>change(e,-1));
  draw();
  return {redraw:draw};
}
export { totalPoints };

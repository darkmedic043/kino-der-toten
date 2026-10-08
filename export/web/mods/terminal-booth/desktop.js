// MelonTerm desktop: the full-screen UI the terminal booth opens (F at the screen). A green phosphor
// desktop with square app icons and windows. Apps so far: Perks (every perk in the game, whether or
// not this map has its machine). openDesktop(opts) builds it once and shows it; Esc or LOG OFF closes.
//   opts: {perks: [...], onMap(perk) -> bool, owned(perk) -> bool, price(perk) -> number, power() -> bool,
//          points() -> number, onOpen(), onClose(), onApp(name)}

// Every perk in the game. ids: the session ids it can go by (Cheese Cube's PHD is its own id).
// Double-Dew (Cheese Cube) is left out for now, at the user's request.
const TEX = new URL('../../textures/', import.meta.url).href, OWN = new URL('../perks-plus/icons/', import.meta.url).href;
export const PERKS = [
  { ids: ['specialty_quickrevive'], name: 'Quick Revive', price: 500, color: '#509ebc', badge: 'QR', icon: TEX + 'specialty_quickrevive_zombies.png',
    blurb: 'Get back up.',
    effects: ['Solo: when you go down, you revive yourself after a few seconds (3 times a game)', 'Co-op: revive teammates twice as fast', 'Works without the power'],
    note: 'Going down still costs every other perk.' },
  { ids: ['specialty_armorvest'], name: 'Juggernog', price: 2500, color: '#a53835', badge: 'J', icon: TEX + 'specialty_juggernaut_zombies.png',
    blurb: 'Take more hits.',
    effects: ['Max health 150 → 250', 'Five zombie hits to go down instead of three'] },
  { ids: ['specialty_fastreload'], name: 'Speed Cola', price: 3000, color: '#478450', badge: 'SC', icon: TEX + 'specialty_fastreload_zombies.png',
    blurb: 'Reload faster.',
    effects: ['Reloads take half the time'] },
  { ids: ['specialty_rof'], name: 'Double Tap', price: 2000, color: '#b37528', badge: 'DT', icon: TEX + 'specialty_doubletap_zombies.png',
    blurb: 'Fire faster, hit harder.',
    effects: ['Rate of fire ×1.33', 'Every bullet counts twice (Double Tap II)'], note: 'Bullets only: melee, explosives and wonder-weapon effects are unchanged.' },
  { ids: ['specialty_longersprint'], name: 'Stamin-Up', price: 2000, color: '#ebbd4b', badge: 'S', icon: OWN + 'staminup.webp',
    blurb: 'Move faster.',
    effects: ['Walk speed +10%', 'Sprint speed +16%'] },
  { ids: ['specialty_flakjacket'], name: 'PhD Flopper', price: 2000, color: '#be83da', badge: 'PhD', icon: null,
    blurb: 'Hit the deck. Hard.',
    effects: ['Dive off a ledge: you land with an explosion (5000 damage close, 1000 at the edge)', 'Your own grenades and explosive weapons can\'t hurt you', 'Moon: immune to the excavator gas'],
    note: 'A dive on flat ground doesn\'t count: the landing has to be a real drop.' },
  { ids: ['specialty_deadshot'], name: 'Deadshot Daiquiri', price: 1500, color: '#9da8ac', badge: 'DS', icon: OWN + 'deadshot.webp',
    blurb: 'Aim for the head.',
    effects: ['Hip-fire spread halved', 'Headshots deal 25% more damage'] },
  { ids: ['specialty_additionalprimaryweapon'], name: 'Mule Kick', price: 4000, color: '#82a86c', badge: 'MK', icon: null,
    blurb: 'Carry one more gun.',
    effects: ['A third weapon slot'], note: 'Go down and you lose the third weapon with the perk.' },
];

const CSS = `
#melonterm{position:fixed;inset:0;z-index:70;display:grid;place-items:center;background:radial-gradient(ellipse at center,#04140a 0%,#010603 70%,#000 100%);
  font-family:'VT323','Courier New',ui-monospace,monospace;color:#7dffa6;user-select:none;--g:#7dffa6;--g2:#3fcf73;--dim:#2a7a48;--bg:#031208;--line:#1f6b3a}
#melonterm *{box-sizing:border-box}
#melonterm .crt{position:relative;width:min(1180px,96vw);height:min(760px,92vh);background:var(--bg);border:2px solid var(--line);border-radius:18px;overflow:hidden;
  box-shadow:0 0 0 10px #050a07,0 0 0 12px #13261a,0 0 60px #1bff6a30,inset 0 0 120px #000c;display:flex;flex-direction:column;animation:mt-on .35s ease-out}
@keyframes mt-on{0%{transform:scaleY(.01) scaleX(.6);filter:brightness(4)}60%{transform:scaleY(1) scaleX(1);filter:brightness(1.6)}100%{filter:none}}
#melonterm .crt::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:9;
  background:repeating-linear-gradient(0deg,#0006 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 55%,#000a 100%);mix-blend-mode:multiply}
#melonterm .crt::before{content:'';position:absolute;left:0;right:0;height:90px;z-index:8;pointer-events:none;background:linear-gradient(#7dffa600,#7dffa60d,#7dffa600);animation:mt-roll 7s linear infinite}
@keyframes mt-roll{from{top:-90px}to{top:100%}}
#melonterm .glow{text-shadow:0 0 6px #3dff8a99}
#melonterm .bar{display:flex;align-items:center;gap:18px;padding:6px 16px;border-bottom:2px solid var(--line);font-size:20px;letter-spacing:1px;background:#04180c}
#melonterm .bar .grow{flex:1}
#melonterm .bar .warn{color:#ffd36b;text-shadow:0 0 6px #ffb00088}
#melonterm .desk{position:relative;flex:1;min-height:0;padding:22px;
  background:linear-gradient(#0c3a1c22 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,#0c3a1c22 1px,transparent 1px) 0 0/32px 32px}
#melonterm .icons{display:grid;grid-template-columns:repeat(auto-fill,96px);grid-auto-rows:110px;gap:10px;width:96px}
#melonterm .app{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;background:none;border:0;color:inherit;font:inherit;font-size:19px;padding:0}
#melonterm .app .sq{width:64px;height:64px;border:2px solid var(--g2);background:#062a14;display:grid;place-items:center;box-shadow:0 0 10px #3dff8a33,inset 0 0 12px #000a}
#melonterm .app:hover .sq,#melonterm .app:focus-visible .sq{background:#0d4a24;box-shadow:0 0 16px #3dff8a88,inset 0 0 12px #0008}
#melonterm .app:hover span,#melonterm .app:focus-visible span{background:var(--g);color:var(--bg);text-shadow:none}
#melonterm .app span{padding:0 4px}
#melonterm .win{position:absolute;inset:22px 22px 22px 140px;display:flex;flex-direction:column;border:2px solid var(--g2);background:#020d06f2;box-shadow:0 0 0 2px #000,8px 8px 0 #0008,0 0 30px #3dff8a22}
#melonterm .win[hidden]{display:none}
#melonterm .title{display:flex;align-items:center;gap:10px;padding:3px 4px 3px 12px;background:var(--g2);color:var(--bg);font-size:21px;letter-spacing:2px}
#melonterm .title .grow{flex:1}
#melonterm .title button{width:30px;height:26px;border:2px solid var(--bg);background:var(--g2);color:var(--bg);font:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0}
#melonterm .title button:hover{background:var(--bg);color:var(--g)}
#melonterm .perks{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}
#melonterm .grid{align-content:start;display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:12px;padding:18px;overflow:auto;border-right:2px dashed var(--line)}
#melonterm .tile{position:relative;aspect-ratio:1;border:2px solid var(--line);background:#041a0c;display:grid;place-items:center;cursor:pointer;padding:12px;color:inherit;font:inherit}
#melonterm .tile.on{border-color:var(--g);background:#0b3d1d;box-shadow:0 0 14px #3dff8a77,inset 0 0 14px #000a}
#melonterm .tile.off .art{opacity:.38;filter:grayscale(.8)}
#melonterm .tile .tag{position:absolute;left:4px;right:4px;bottom:3px;font-size:14px;text-align:center;letter-spacing:1px;color:var(--dim)}
#melonterm .tile.owned::after{content:'OWNED';position:absolute;top:3px;right:4px;font-size:14px;padding:0 3px;background:var(--g);color:var(--bg)}
#melonterm .art{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 6px #000)}
#melonterm .badge{width:78%;aspect-ratio:1;display:grid;place-items:center;border:3px solid #000a;font:bold 28px 'Arial Black',Arial,sans-serif;color:#fff;text-shadow:0 2px 3px #000;
  box-shadow:inset 0 0 0 3px #fff4,inset 0 -14px 20px #0006}
#melonterm .detail{padding:22px 26px;display:flex;flex-direction:column;gap:10px;overflow:auto;min-height:0}
#melonterm .detail .head{display:flex;gap:18px;align-items:center}
#melonterm .detail .big{width:128px;height:128px;flex:none;border:2px solid var(--g2);background:#041a0c;display:grid;place-items:center;padding:12px;box-shadow:0 0 18px #3dff8a33}
#melonterm .detail .big .badge{font-size:40px}
#melonterm .detail h2{margin:0;font:inherit;font-size:40px;line-height:1;letter-spacing:1px;color:#b6ffcb}
#melonterm .detail .blurb{font-size:22px;color:var(--g2)}
#melonterm .price{display:inline-block;margin-top:6px;font-size:26px;padding:0 8px;border:2px solid var(--g);}
#melonterm .status{display:flex;flex-wrap:wrap;gap:8px;font-size:18px}
#melonterm .status span{padding:0 6px;border:1px solid var(--dim);color:var(--g2)}
#melonterm .status span.yes{border-color:var(--g);color:var(--bg);background:var(--g)}
#melonterm .status span.no{border-style:dashed;color:var(--dim)}
#melonterm .detail h3{margin:8px 0 0;font:inherit;font-size:19px;letter-spacing:3px;color:var(--dim)}
#melonterm .detail ul{margin:0;padding:0;list-style:none;font-size:23px;line-height:1.25}
#melonterm .detail li{padding-left:22px;position:relative}
#melonterm .detail li::before{content:'>';position:absolute;left:2px;color:var(--g2)}
#melonterm .detail .note{font-size:19px;color:var(--g2);opacity:.85}
#melonterm .detail .cursor{animation:mt-blink 1s steps(1) infinite}
@keyframes mt-blink{50%{opacity:0}}
#melonterm .task{display:flex;align-items:center;gap:10px;padding:5px 10px;border-top:2px solid var(--line);background:#04180c;font-size:19px}
#melonterm .task button{font:inherit;font-size:19px;color:var(--g);background:#062a14;border:2px solid var(--g2);padding:0 10px;cursor:pointer}
#melonterm .task button:hover{background:var(--g);color:var(--bg)}
#melonterm .task .grow{flex:1}
#melonterm .task .hint{color:var(--dim)}
@media(max-width:760px){#melonterm .win{inset:8px}#melonterm .perks{grid-template-columns:1fr;grid-template-rows:auto 1fr}#melonterm .grid{grid-template-columns:repeat(4,minmax(0,1fr));border-right:0;border-bottom:2px dashed var(--line);padding:10px;gap:8px}#melonterm .tile{padding:6px}#melonterm .tile .tag{display:none}#melonterm .bar{gap:10px;font-size:17px}#melonterm .bar .clock{display:none}#melonterm .detail{padding:14px}#melonterm .detail .big{width:96px;height:96px}#melonterm .detail h2{font-size:32px}}
#melonterm .bar span{white-space:nowrap}
`;

const PERKS_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <rect x="13" y="2" width="6" height="3"/><rect x="14" y="5" width="4" height="5"/><rect x="11" y="10" width="10" height="3"/>
  <rect x="9" y="13" width="14" height="17"/><rect x="11" y="17" width="10" height="7" fill="#031208"/><rect x="13" y="19" width="6" height="3"/>
  <rect x="10" y="14" width="2" height="5" fill="#c9ffd9"/></svg>`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let ui = null;
export function openDesktop(opts) {
  if (!ui) ui = build();
  ui.open(opts);
  return ui;
}

function build() {
  if (!document.getElementById('melonterm-font')) {
    const l = document.createElement('link'); l.id = 'melonterm-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=VT323&display=swap'; document.head.append(l);
  }
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const root = document.createElement('div'); root.id = 'melonterm'; root.hidden = true;
  root.innerHTML = `<div class="crt glow">
    <div class="bar"><span>MELONTERM 2.7</span><span class="grow"></span><span class="pwr"></span><span class="pts"></span><span class="clock"></span></div>
    <div class="desk">
      <div class="icons"><button class="app" data-app="perks"><div class="sq">${PERKS_ICON}</div><span>PERKS</span></button></div>
      <div class="win" data-win="perks" hidden>
        <div class="title"><span>PERKS.EXE</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="perks"><div class="grid"></div><div class="detail"></div></div>
      </div>
    </div>
    <div class="task"><button data-logoff>LOG OFF</button><span class="open"></span><span class="grow"></span><span class="hint">ESC · LOG OFF</span></div>
  </div>`;
  document.body.append(root);
  const $ = s => root.querySelector(s);
  const win = $('[data-win=perks]'), grid = $('.grid'), detail = $('.detail');
  let opts = null, shown = 0, clock = 0;

  // Keep the game from seeing anything typed or clicked while the desktop is up.
  const block = e => { if (root.hidden) return; e.stopPropagation(); if (e.type === 'keydown') key(e); };
  for (const t of ['keydown', 'keyup']) addEventListener(t, block, true);
  for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'wheel', 'contextmenu']) root.addEventListener(t, e => e.stopPropagation());

  function key(e) {
    if (e.code === 'Escape') { e.preventDefault(); if (!win.hidden) closeApp(); else close(); return; }
    if (win.hidden) { if (e.code === 'Enter') { e.preventDefault(); openApp('perks'); } return; }
    const cols = Math.max(1, Math.round(grid.clientWidth / (grid.firstElementChild?.offsetWidth + 12 || 1)));
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.code];
    if (step) { e.preventDefault(); select(Math.min(PERKS.length - 1, Math.max(0, shown + step))); }
  }

  const art = (p, big) => p.icon
    ? `<img class="art" src="${p.icon}" alt="" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'badge',style:'background:${p.color}',textContent:'${p.badge}'}))">`
    : `<div class="badge" style="background:${p.color}">${p.badge}</div>`;

  function renderGrid() {
    grid.innerHTML = PERKS.map((p, i) => {
      const on = opts.onMap(p), owned = opts.owned(p);
      return `<button class="tile ${on ? '' : 'off'} ${owned ? 'owned' : ''}" data-i="${i}" title="${esc(p.name)}">${art(p)}<span class="tag">${on ? '' : 'NOT ON MAP'}</span></button>`;
    }).join('');
    for (const t of grid.children) { t.addEventListener('mouseenter', () => select(+t.dataset.i)); t.addEventListener('focus', () => select(+t.dataset.i)); }
  }
  function select(i) {
    shown = i; const p = PERKS[i], on = opts.onMap(p), owned = opts.owned(p);
    for (const t of grid.children) t.classList.toggle('on', +t.dataset.i === i);
    detail.innerHTML = `<div class="head"><div class="big">${art(p)}</div><div>
        <h2>${esc(p.name.toUpperCase())}</h2><div class="blurb">${esc(p.blurb)}</div><div class="price">${opts.price(p).toLocaleString()} PTS</div></div></div>
      <div class="status"><span class="${on ? 'yes' : 'no'}">${on ? 'ON THIS MAP' : 'NOT ON THIS MAP'}</span>${owned ? '<span class="yes">OWNED</span>' : ''}</div>
      <h3>WHAT IT DOES</h3><ul>${p.effects.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      ${p.note ? `<div class="note">* ${esc(p.note)}</div>` : ''}<div class="cursor">█</div>`;
  }
  function openApp(name) {
    if (name !== 'perks') return;
    renderGrid(); select(shown); win.hidden = false; $('.open').textContent = '[PERKS.EXE]';
    opts.onApp?.(name); grid.querySelector(`[data-i="${shown}"]`)?.focus({ preventScroll: true });
  }
  function closeApp() { win.hidden = true; $('.open').textContent = ''; }
  function status() {
    if (!opts) return;
    $('.pwr').innerHTML = opts.power() ? 'MAINS OK' : '<span class="warn">AUX BATTERY</span>';
    $('.pts').textContent = (opts.points() ?? 0).toLocaleString() + ' PTS';
    const d = new Date(); $('.clock').textContent = d.toTimeString().slice(0, 5);
  }
  function open(o) {
    opts = o; root.hidden = false; status(); clearInterval(clock); clock = setInterval(status, 1000);
    const c = root.querySelector('.crt'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    if (!win.hidden) renderGrid(), select(shown);
    opts.onOpen?.();
  }
  function close() {
    if (root.hidden) return; root.hidden = true; clearInterval(clock); const o = opts; opts && (opts = null);
    o?.onClose?.();
  }
  root.querySelector('[data-app=perks]').addEventListener('click', () => openApp('perks'));
  root.querySelector('[data-close]').addEventListener('click', closeApp);
  root.querySelector('[data-logoff]').addEventListener('click', close);
  return { open, close, isOpen: () => !root.hidden };
}

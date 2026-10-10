// MelonTerm desktop: the window the terminal booth opens (F at the screen). A green phosphor CRT
// window floating over the game (which keeps running: zombies still come), with square app icons. Apps so far: Perks, a shop for every
// perk in the game, whether or not this map has its machine (perks bought here work on any map).
// openDesktop(opts) builds it once and shows it; Esc or LOG OFF closes.
// EXFIL (bottom right, greyed out when no exfil window is open) shows the exfil status and calls it in.
//   opts: {owned(perk), onMap(perk), needsPower(perk), power(), price(perk), points(), buy(perk) -> true | 'reason',
//          exfil() -> status (mods/exfil), callExfil() -> true | 'reason', arsenal() -> status (mods/ammo-mods),
//          buyMod(id) / upgradeMod() -> true | 'reason', onOpen(), onClose(), onApp(name)}
// ARSENAL (under PERKS) sells ammo mods for the gun in hand once the power is on.

// Every perk in the game. Double-Dew (Cheese Cube) is left out for now, at the user's request.
const TEX = new URL('../../textures/', import.meta.url).href, OWN = new URL('../perks-plus/icons/', import.meta.url).href;
export const PERKS = [
  { id: 'specialty_quickrevive', name: 'Quick Revive', price: 1500, color: '#509ebc', badge: 'QR', icon: OWN + 'quickrevive.webp', fallback: TEX + 'specialty_quickrevive_zombies.png',
    blurb: 'Recover faster.',
    effects: ['Health starts coming back after 2 s instead of 4', 'Revive teammates twice as fast', 'Works without the power'],
    note: 'Cold War / Black Ops 6 rules: no self-revive in solo.' },
  { id: 'specialty_armorvest', name: 'Juggernog', price: 2500, color: '#a53835', badge: 'J', icon: OWN + 'juggernog.webp', fallback: TEX + 'specialty_juggernaut_zombies.png',
    blurb: 'Take more hits.',
    effects: ['Max health 150 → 250', 'Five zombie hits to go down instead of three'] },
  { id: 'specialty_fastreload', name: 'Speed Cola', price: 3000, color: '#478450', badge: 'SC', icon: OWN + 'speedcola.webp', fallback: TEX + 'specialty_fastreload_zombies.png',
    blurb: 'Reload faster.',
    effects: ['Reloads take half the time'] },
  { id: 'specialty_rof', name: 'Double Tap', price: 2000, color: '#b37528', badge: 'DT', icon: OWN + 'doubletap.webp', fallback: TEX + 'specialty_doubletap_zombies.png',
    blurb: 'Fire faster, hit harder.',
    effects: ['Rate of fire ×1.33', 'Every bullet counts twice (Double Tap II)'], note: 'Bullets only: melee, explosives and wonder-weapon effects are unchanged.' },
  { id: 'specialty_longersprint', name: 'Stamin-Up', price: 2000, color: '#ebbd4b', badge: 'S', icon: OWN + 'staminup.webp',
    blurb: 'Move faster.',
    effects: ['Walk speed +10%', 'Sprint speed +16%'] },
  { id: 'specialty_flakjacket', name: 'PhD Flopper', price: 2000, color: '#be83da', badge: 'PhD', icon: OWN + 'phd.webp',
    blurb: 'Hit the deck. Hard.',
    effects: ['No fall damage', 'Dive to prone off a drop that would have hurt you: you land with an explosion instead (5000 damage close, 1000 at the edge)', 'Your own grenades and explosive weapons can\'t hurt you', 'Moon: immune to the excavator gas'],
    note: 'Falls start to hurt past 128 units (about two player heights), so a dive on flat ground doesn\'t flop.' },
  { id: 'specialty_deadshot', name: 'Deadshot Daiquiri', price: 1500, color: '#9da8ac', badge: 'DS', icon: OWN + 'deadshot.webp',
    blurb: 'Aim for the head.',
    effects: ['Hip-fire spread halved', 'Headshots deal 25% more damage'] },
  { id: 'specialty_additionalprimaryweapon', name: 'Mule Kick', price: 4000, color: '#82a86c', badge: 'MK', icon: OWN + 'mulekick.webp',
    blurb: 'Carry one more gun.',
    effects: ['A third weapon slot'], note: 'Go down and you lose the third weapon with the perk.' },
];

const CSS = `
#melonterm{position:fixed;inset:0;z-index:70;display:grid;place-items:center;background:radial-gradient(ellipse at center,transparent 55%,#0006 100%);
  font-family:'VT323','Courier New',ui-monospace,monospace;color:#7dffa6;user-select:none;--g:#7dffa6;--g2:#3fcf73;--dim:#2a7a48;--bg:#031208;--line:#1f6b3a;--warn:#ffd36b;--bad:#ff6b5a}
#melonterm *{box-sizing:border-box}
#melonterm .crt{position:relative;width:min(1040px,92vw);height:min(580px,80vh);background:#031208f0;border:2px solid var(--line);border-radius:16px;overflow:hidden;
  box-shadow:0 0 0 8px #050a07,0 0 0 10px #13261a,0 18px 60px #000c,0 0 50px #1bff6a30,inset 0 0 110px #000c;display:flex;flex-direction:column;animation:mt-on .35s ease-out}
@keyframes mt-on{0%{transform:scaleY(.01) scaleX(.6);filter:brightness(4)}60%{transform:scaleY(1) scaleX(1);filter:brightness(1.6)}100%{filter:none}}
#melonterm .crt::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:9;
  background:repeating-linear-gradient(0deg,#0006 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 55%,#000a 100%);mix-blend-mode:multiply}
#melonterm .crt::before{content:'';position:absolute;left:0;right:0;height:90px;z-index:8;pointer-events:none;background:linear-gradient(#7dffa600,#7dffa60d,#7dffa600);animation:mt-roll 7s linear infinite}
@keyframes mt-roll{from{top:-90px}to{top:100%}}
#melonterm .glow{text-shadow:0 0 6px #3dff8a99}
#melonterm .bar{display:flex;align-items:center;gap:18px;padding:6px 16px;border-bottom:2px solid var(--line);font-size:20px;letter-spacing:1px;background:#04180c}
#melonterm .bar span{white-space:nowrap}
#melonterm .grow{flex:1}
#melonterm .warn{color:var(--warn);text-shadow:0 0 6px #ffb00088}
#melonterm .desk{position:relative;flex:1;min-height:0;padding:20px;
  background:linear-gradient(#0c3a1c22 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,#0c3a1c22 1px,transparent 1px) 0 0/32px 32px}
#melonterm .icons{display:grid;grid-template-columns:96px;grid-auto-rows:110px;gap:10px;width:96px}
#melonterm .ars{flex:1;min-height:0;display:flex;flex-direction:column}#melonterm .ars .tile.owned::after{content:'LOADED'}#melonterm .ars>.perks{flex:1;min-height:0}
#melonterm .app{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;background:none;border:0;color:inherit;font:inherit;font-size:19px;padding:0}
#melonterm .app .sq{width:64px;height:64px;border:2px solid var(--g2);background:#062a14;display:grid;place-items:center;box-shadow:0 0 10px #3dff8a33,inset 0 0 12px #000a}
#melonterm .app:hover .sq,#melonterm .app:focus-visible .sq{background:#0d4a24;box-shadow:0 0 16px #3dff8a88,inset 0 0 12px #0008}
#melonterm .app:hover span,#melonterm .app:focus-visible span{background:var(--g);color:var(--bg);text-shadow:none}
#melonterm .app span{padding:0 4px}
#melonterm .win{position:absolute;inset:16px 128px 16px 132px;display:flex;flex-direction:column;border:2px solid var(--g2);background:#020d06f2;box-shadow:0 0 0 2px #000,8px 8px 0 #0008,0 0 30px #3dff8a22}
#melonterm .win[hidden]{display:none}
#melonterm .title{display:flex;align-items:center;gap:10px;padding:3px 4px 3px 12px;background:var(--g2);color:var(--bg);font-size:21px;letter-spacing:2px;text-shadow:none}
#melonterm .title button{width:30px;height:26px;border:2px solid var(--bg);background:var(--g2);color:var(--bg);font:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0}
#melonterm .title button:hover{background:var(--bg);color:var(--g)}
#melonterm .perks{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}
#melonterm .left{display:flex;flex-direction:column;min-height:0;border-right:2px dashed var(--line)}
#melonterm .grid{flex:1;align-content:start;display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px;padding:14px;overflow:auto}
#melonterm .msg{padding:6px 16px;border-top:2px solid var(--line);font-size:20px;min-height:36px;background:#04180c}
#melonterm .msg.bad{color:var(--bad);text-shadow:0 0 6px #ff3a2288}
#melonterm .msg.ok{color:#b6ffcb}
#melonterm .tile{position:relative;aspect-ratio:1;border:2px solid var(--line);background:#041a0c;display:grid;place-items:center;cursor:pointer;padding:12px;color:inherit;font:inherit}
#melonterm .tile.on{border-color:var(--g);background:#0b3d1d;box-shadow:0 0 14px #3dff8a77,inset 0 0 14px #000a}
#melonterm .tile.locked{cursor:not-allowed}
#melonterm .tile.locked .art,#melonterm .tile.locked .badge{opacity:.3;filter:grayscale(1)}
#melonterm .tile.owned .art,#melonterm .tile.owned .badge{opacity:.55}
#melonterm .tile .tag{position:absolute;left:4px;right:4px;bottom:3px;font-size:14px;text-align:center;letter-spacing:1px;color:var(--dim)}
#melonterm .tile.locked .tag{color:var(--warn);opacity:.8}
#melonterm .tile.owned::after{content:'OWNED';position:absolute;top:3px;right:4px;font-size:14px;padding:0 3px;background:var(--g);color:var(--bg);text-shadow:none}
#melonterm .art{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 6px #000)}
#melonterm .badge{width:78%;aspect-ratio:1;display:grid;place-items:center;border:3px solid #000a;font:bold 28px 'Arial Black',Arial,sans-serif;color:#fff;text-shadow:0 2px 3px #000;
  box-shadow:inset 0 0 0 3px #fff4,inset 0 -14px 20px #0006}
#melonterm .detail{padding:20px 24px;display:flex;flex-direction:column;gap:10px;overflow:auto;min-height:0}
#melonterm .detail .head{display:flex;gap:18px;align-items:center}
#melonterm .detail .big{width:120px;height:120px;flex:none;border:2px solid var(--g2);background:#041a0c;display:grid;place-items:center;padding:12px;box-shadow:0 0 18px #3dff8a33}
#melonterm .detail .big .badge{font-size:40px}
#melonterm .detail h2{margin:0;font:inherit;font-size:38px;line-height:1;letter-spacing:1px;color:#b6ffcb}
#melonterm .detail .blurb{font-size:22px;color:var(--g2)}
#melonterm .price{display:inline-block;margin-top:6px;font-size:26px;padding:0 8px;border:2px solid var(--g)}
#melonterm .buy{align-self:flex-start;font:inherit;font-size:24px;letter-spacing:2px;padding:2px 14px;border:2px solid var(--g);background:var(--g);color:var(--bg);cursor:pointer;text-shadow:none}
#melonterm .buy:hover{background:#b6ffcb}
#melonterm .buy:disabled{background:transparent;color:var(--dim);border-color:var(--dim);border-style:dashed;cursor:not-allowed}
#melonterm .buy.locked:disabled{color:var(--warn);border-color:var(--warn)}
#melonterm .status{display:flex;flex-wrap:wrap;gap:8px;font-size:18px}
#melonterm .status span{padding:0 6px;border:1px solid var(--dim);color:var(--g2)}
#melonterm .detail h3{margin:6px 0 0;font:inherit;font-size:19px;letter-spacing:3px;color:var(--dim)}
#melonterm .detail ul{margin:0;padding:0;list-style:none;font-size:23px;line-height:1.25}
#melonterm .detail li{padding-left:22px;position:relative}
#melonterm .detail li::before{content:'>';position:absolute;left:2px;color:var(--g2)}
#melonterm .detail .note{font-size:19px;color:var(--g2);opacity:.85}
#melonterm .app.exfil{position:absolute;right:16px;bottom:14px}
#melonterm .app.off .sq{border-color:var(--dim);background:#03160a;box-shadow:none}
#melonterm .app.off svg{opacity:.5;filter:grayscale(1)}#melonterm .app.off span{color:var(--dim)}
#melonterm .app.live .sq{animation:mt-pulse 1.2s ease-in-out infinite}
@keyframes mt-pulse{50%{box-shadow:0 0 22px #3dff8acc,inset 0 0 12px #000a}}
#melonterm .exf{flex:1;min-height:0;overflow:auto;padding:20px 26px;display:flex;flex-direction:column;gap:10px;font-size:23px;line-height:1.25}
#melonterm .exf h2{margin:0;font:inherit;font-size:40px;line-height:1;letter-spacing:2px;color:#b6ffcb}
#melonterm .exf .state{align-self:flex-start;font-size:22px;padding:0 8px;border:2px solid var(--g)}
#melonterm .exf .state.no{border-style:dashed;border-color:var(--dim);color:var(--dim)}
#melonterm .exf .state.go{background:var(--g);color:var(--bg);text-shadow:none}
#melonterm .exf dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;margin:4px 0}
#melonterm .exf dt{color:var(--dim);letter-spacing:2px}#melonterm .exf dd{margin:0}
#melonterm .exf .call{align-self:flex-start;margin-top:6px}
#melonterm .exf ul{margin:0;padding:0;list-style:none;font-size:21px}#melonterm .exf li{padding-left:22px;position:relative}#melonterm .exf li::before{content:'>';position:absolute;left:2px;color:var(--g2)}
#melonterm .exf .msg{border:0;background:none;padding:0}
#melonterm .task{display:flex;align-items:center;gap:10px;padding:5px 10px;border-top:2px solid var(--line);background:#04180c;font-size:19px}
#melonterm .task button{font:inherit;font-size:19px;color:var(--g);background:#062a14;border:2px solid var(--g2);padding:0 10px;cursor:pointer}
#melonterm .task button:hover{background:var(--g);color:var(--bg)}
#melonterm .task .hint{color:var(--dim)}
@media(max-width:760px){#melonterm .crt{width:96vw;height:92vh}#melonterm .win{inset:8px 8px 120px}#melonterm .perks{grid-template-columns:1fr;grid-template-rows:auto 1fr}#melonterm .left{border-right:0;border-bottom:2px dashed var(--line)}
  #melonterm .grid{grid-template-columns:repeat(4,minmax(0,1fr));padding:10px;gap:8px}#melonterm .tile{padding:6px}#melonterm .tile .tag{display:none}
  #melonterm .bar{gap:10px;font-size:17px}#melonterm .bar .clock{display:none}#melonterm .detail{padding:14px}#melonterm .detail .big{width:90px;height:90px}#melonterm .detail h2{font-size:30px}}
`;

const PERKS_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <rect x="13" y="2" width="6" height="3"/><rect x="14" y="5" width="4" height="5"/><rect x="11" y="10" width="10" height="3"/>
  <rect x="9" y="13" width="14" height="17"/><rect x="11" y="17" width="10" height="7" fill="#031208"/><rect x="13" y="19" width="6" height="3"/>
  <rect x="10" y="14" width="2" height="5" fill="#c9ffd9"/></svg>`;

const ARSENAL_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <rect x="6" y="4" width="4" height="18"/><rect x="14" y="4" width="4" height="18"/><rect x="22" y="4" width="4" height="18"/>
  <rect x="6" y="2" width="4" height="2" fill="#c9ffd9"/><rect x="14" y="2" width="4" height="2" fill="#c9ffd9"/><rect x="22" y="2" width="4" height="2" fill="#c9ffd9"/>
  <rect x="4" y="24" width="24" height="3"/><rect x="4" y="28" width="24" height="2"/><rect x="7" y="8" width="2" height="9" fill="#031208"/><rect x="23" y="8" width="2" height="9" fill="#031208"/></svg>`;
const EXFIL_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <rect x="4" y="6" width="24" height="2"/><rect x="15" y="8" width="2" height="3"/><rect x="9" y="11" width="15" height="7"/><rect x="6" y="13" width="3" height="3"/>
  <rect x="2" y="12" width="4" height="2"/><rect x="11" y="12" width="5" height="3" fill="#031208"/><rect x="11" y="19" width="2" height="3"/><rect x="20" y="19" width="2" height="3"/>
  <rect x="8" y="22" width="17" height="2"/><rect x="14" y="26" width="4" height="4"/><rect x="12" y="28" width="8" height="2"/></svg>`;

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
      <div class="icons"><button class="app" data-app="perks"><div class="sq">${PERKS_ICON}</div><span>PERKS</span></button>
        <button class="app" data-app="arsenal"><div class="sq">${ARSENAL_ICON}</div><span>ARSENAL</span></button></div>
      <button class="app exfil off" data-app="exfil"><div class="sq">${EXFIL_ICON}</div><span>EXFIL</span></button>
      <div class="win" data-win="perks" hidden>
        <div class="title"><span>PERKS.EXE</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="perks"><div class="left"><div class="grid"></div><div class="msg"></div></div><div class="detail"></div></div>
      </div>
      <div class="win" data-win="arsenal" hidden>
        <div class="title"><span>ARSENAL.EXE · AMMO MODS</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="ars"></div>
      </div>
      <div class="win" data-win="exfil" hidden>
        <div class="title"><span>EXFIL.EXE</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="exf"></div>
      </div>
    </div>
    <div class="task"><button data-logoff>LOG OFF</button><span class="open"></span><span class="grow"></span><span class="hint">ESC · LOG OFF</span></div>
  </div>`;
  document.body.append(root);
  const $ = s => root.querySelector(s);
  const win = $('[data-win=perks]'), exWin = $('[data-win=exfil]'), exBody = $('.exf'), exIcon = $('[data-app=exfil]');
  const arWin = $('[data-win=arsenal]'), arBody = $('.ars'); let arState = '', arMsg = ['', ''];
  const grid = $('.grid'), detail = $('.detail'), msg = $('.msg');
  let exState = '';
  let opts = null, shown = 0, clock = 0, lastState = '';

  // Keep the game from seeing key presses and clicks while the desktop is up. Key releases still go through, so a
  // key held when it opened (W) doesn't stay stuck down in the game.
  addEventListener('keydown', e => { if (root.hidden) return; e.stopPropagation(); key(e); }, true);
  for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'wheel', 'contextmenu']) root.addEventListener(t, e => e.stopPropagation());

  function key(e) {
    if (e.code === 'Escape') { e.preventDefault(); if (!win.hidden || !exWin.hidden || !arWin.hidden) closeApp(); else close(); return; }
    if (!arWin.hidden) return;
    if (!exWin.hidden) { if (e.code === 'Enter') { e.preventDefault(); callExfil(); } return; }
    if (win.hidden) { if (e.code === 'Enter') { e.preventDefault(); openApp('perks'); } return; }
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); buy(shown); return; }
    const cols = Math.max(1, Math.round(grid.clientWidth / (grid.firstElementChild?.offsetWidth + 12 || 1)));
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.code];
    if (step) { e.preventDefault(); select(Math.min(PERKS.length - 1, Math.max(0, shown + step))); }
  }

  const art = p => p.icon
    ? `<img class="art" src="${p.icon}" alt="" draggable="false" data-fallback="${p.fallback ?? ''}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else this.replaceWith(Object.assign(document.createElement('div'),{className:'badge',style:'background:${p.color}',textContent:'${p.badge}'}))">`
    : `<div class="badge" style="background:${p.color}">${p.badge}</div>`;
  // why a perk can't be bought right now ('' when it can)
  const blocked = p => opts.owned(p) ? 'owned' : opts.needsPower(p) && !opts.power() ? 'power' : '';

  function renderGrid() {
    grid.innerHTML = PERKS.map((p, i) => {
      const why = blocked(p);
      return `<button class="tile ${why === 'power' ? 'locked' : ''} ${why === 'owned' ? 'owned' : ''}" data-i="${i}" title="${esc(p.name)}">${art(p)}<span class="tag">${why === 'power' ? 'NO POWER' : ''}</span></button>`;
    }).join('');
    for (const t of grid.children) {
      t.addEventListener('mouseenter', () => select(+t.dataset.i)); t.addEventListener('focus', () => select(+t.dataset.i));
      t.addEventListener('click', () => buy(+t.dataset.i));
    }
  }
  function select(i) {
    shown = i; const p = PERKS[i], why = blocked(p), price = opts.price(p), short = !why && opts.points() < price;
    for (const t of grid.children) t.classList.toggle('on', +t.dataset.i === i);
    const label = why === 'owned' ? 'OWNED' : why === 'power' ? 'NEEDS POWER' : short ? 'NOT ENOUGH POINTS' : `BUY · ${price.toLocaleString()}`;
    detail.innerHTML = `<div class="head"><div class="big">${art(p)}</div><div>
        <h2>${esc(p.name.toUpperCase())}</h2><div class="blurb">${esc(p.blurb)}</div><div class="price">${price.toLocaleString()} PTS</div></div></div>
      <button class="buy ${why === 'power' ? 'locked' : ''}" ${why || short ? 'disabled' : ''}>${label}</button>
      <div class="status"><span>${opts.onMap(p) ? 'MACHINE ON THIS MAP' : 'NO MACHINE ON THIS MAP · TERMINAL ONLY'}</span></div>
      <h3>WHAT IT DOES</h3><ul>${p.effects.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      ${p.note ? `<div class="note">* ${esc(p.note)}</div>` : ''}`;
    detail.querySelector('.buy').addEventListener('click', () => buy(i));
  }
  function say(text, cls = '') { msg.textContent = text; msg.className = 'msg ' + cls; }
  function buy(i) {
    const p = PERKS[i], why = blocked(p);
    if (why === 'owned') return say(`${p.name.toUpperCase()} ALREADY INSTALLED`, 'bad');
    if (why === 'power') return say('ACCESS DENIED · RESTORE MAINS POWER', 'bad');
    const r = opts.buy(p);
    if (r === true) { say(`DISPENSING ${p.name.toUpperCase()} ...`, 'ok'); status(); renderGrid(); select(i); return; }
    say(String(r || 'TRANSACTION FAILED').toUpperCase(), 'bad');
  }
  function openApp(name) {
    if (name === 'arsenal') { win.hidden = exWin.hidden = true; arState = ''; arMsg = ['', '']; drawArsenal(); arWin.hidden = false; $('.open').textContent = '[ARSENAL.EXE]'; opts.onApp?.(name); return; }
    if (name === 'exfil') { win.hidden = arWin.hidden = true; exState = ''; drawExfil(); exWin.hidden = false; $('.open').textContent = '[EXFIL.EXE]'; opts.onApp?.(name); return; }
    if (name !== 'perks') return;
    exWin.hidden = arWin.hidden = true;
    say('> SELECT A PERK'); renderGrid(); select(shown); win.hidden = false; $('.open').textContent = '[PERKS.EXE]';
    opts.onApp?.(name); grid.querySelector(`[data-i="${shown}"]`)?.focus({ preventScroll: true });
  }
  function closeApp() { win.hidden = exWin.hidden = arWin.hidden = true; $('.open').textContent = ''; }
  // ---- ARSENAL.EXE: ammo mods for the gun in hand, laid out like PERKS.EXE (tiles left, details right) -------------
  const ROMAN = ['', 'I', 'II', 'III'];
  const MOD_GLYPH = {   // simple square-icon glyphs per mod (white, tinted by the mod's colour); unknown ids get a letter
    cryo: '<path d="M16 3v26M5 9.5l22 13M5 22.5l22-13M12 5l4 3 4-3M12 27l4-3 4 3" stroke="currentColor" stroke-width="2.4" fill="none"/>',
    napalm: '<path d="M16 3c1 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-8 1 3 3 4 3 4-1-5 0-9 2-12z" fill="currentColor"/>',
    deadwire: '<path d="M18 2 7 18h7l-3 12 13-17h-8z" fill="currentColor"/>',
    shatter: '<path d="M16 2l3 9 9-3-6 8 8 5-10 1 1 9-5-7-5 7 1-9-10-1 8-5-6-8 9 3z" fill="currentColor"/>',
    fireworks: '<path d="M16 16 6 6M16 16l10-10M16 16 4 18M16 16l12 2M16 16l-6 12M16 16l6 12" stroke="currentColor" stroke-width="2.2" fill="none"/><circle cx="16" cy="16" r="3" fill="currentColor"/><circle cx="6" cy="6" r="2" fill="currentColor"/><circle cx="26" cy="6" r="2" fill="currentColor"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="28" cy="18" r="1.6" fill="currentColor"/>',
    shadowrift: '<circle cx="16" cy="16" r="5" fill="currentColor"/><path d="M16 4a12 12 0 0 1 12 12M28 16a12 12 0 0 1-12 12M16 28A12 12 0 0 1 4 16M4 16A12 12 0 0 1 16 4" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="5 4"/>',
    lightmend: '<path d="M13 4h6v9h9v6h-9v9h-6v-9H4v-6h9z" fill="currentColor"/>',
    brainrot: '<path d="M11 6a5 5 0 0 0-5 5 5 5 0 0 0-1 9 5 5 0 0 0 7 6V6zm10 0a5 5 0 0 1 5 5 5 5 0 0 1 1 9 5 5 0 0 1-7 6V6z" fill="currentColor"/>',
  };
  const modIcon = m => `<svg viewBox="0 0 32 32" width="58%" height="58%" style="color:${m.color};filter:drop-shadow(0 0 6px ${m.color})">${MOD_GLYPH[m.id] ?? `<text x="16" y="22" text-anchor="middle" font-size="16" fill="currentColor">${esc(m.name[0])}</text>`}</svg>`;
  let arShown = 0;
  function arsenalBody() {
    if (!arBody.querySelector('.grid')) arBody.innerHTML = '<div class="perks"><div class="left"><div class="grid"></div><div class="msg"></div></div><div class="detail"></div></div>';
    return { grid: arBody.querySelector('.grid'), detail: arBody.querySelector('.detail'), msg: arBody.querySelector('.msg') };
  }
  function drawArsenal() {
    if (arWin.hidden) return;
    const st = opts?.arsenal?.(); if (!st) { arBody.innerHTML = '<p>Ammo mods are not installed.</p>'; return; }
    const key = JSON.stringify([st.power, st.points, st.weapon, st.mod, arMsg, arShown]); if (key === arState) return; arState = key;
    const { grid, detail, msg } = arsenalBody(), cur = st.mod, w = st.weapon;
    grid.innerHTML = st.mods.map((m, i) => {
      const on = cur?.id === m.id, locked = !st.power || !w;
      return `<button class="tile ${locked ? 'locked' : ''} ${on ? 'owned' : ''} ${i === arShown ? 'on' : ''}" data-i="${i}" title="${esc(m.name)}">${modIcon(m)}
        <span class="tag">${!st.power ? 'NO POWER' : on ? 'TIER ' + ROMAN[cur.tier] : ''}</span></button>`;
    }).join('');
    for (const t of grid.children) {
      t.addEventListener('mouseenter', () => { arShown = +t.dataset.i; drawArsenal(); });
      t.addEventListener('click', () => arBuy(st.mods[+t.dataset.i]));
    }
    const m = st.mods[Math.min(arShown, st.mods.length - 1)], on = cur?.id === m.id, tier = on ? cur.tier : 0;
    const cost = on ? st.price[tier + 1] : st.price.apply, can = st.power && w && !(on && tier >= 3) && st.points >= cost;
    const label = !st.power ? 'NEEDS POWER' : !w ? 'NO WEAPON IN HAND' : on && tier >= 3 ? 'MAX TIER' : st.points < cost ? 'NOT ENOUGH POINTS'
      : on ? `UPGRADE TO TIER ${ROMAN[tier + 1]} · ${cost.toLocaleString()}` : `${cur ? 'SWAP TO' : 'APPLY'} · ${cost.toLocaleString()}`;
    detail.innerHTML = `<div class="head"><div class="big" style="border-color:${m.color}">${modIcon(m)}</div><div>
        <h2 style="color:${m.color}">${esc(m.name.toUpperCase())}</h2><div class="blurb">${esc(m.desc)}</div>
        <div class="price">${(on ? (st.price[tier + 1] ?? 0) : st.price.apply).toLocaleString() || '—'} PTS</div></div></div>
      <button class="buy ${!st.power ? 'locked' : ''}" ${can ? '' : 'disabled'}>${label}</button>
      <div class="status"><span>${esc((w?.name ?? 'No weapon').toUpperCase())} · ${cur ? esc((st.mods.find(x => x.id === cur.id)?.name ?? '').toUpperCase()) + ' ' + ROMAN[cur.tier] : 'NO AMMO MOD'}</span></div>
      <h3>TIERS</h3><ul>${(m.tiers ?? []).map((t, k) => `<li style="${k < tier ? `color:${m.color}` : ''}">${ROMAN[k + 1]} · ${esc(t)}</li>`).join('')}</ul>
      <div class="note">* One mod per weapon. Swapping starts again at tier I. It stays on the gun through Pack-a-Punch.</div>`;
    detail.querySelector('.buy').addEventListener('click', () => arBuy(m));
    msg.textContent = arMsg[0] || (st.power ? '> HOVER A MOD · CLICK TO APPLY OR UPGRADE' : '> ACCESS DENIED · RESTORE MAINS POWER');
    msg.className = 'msg ' + (arMsg[1] || (st.power ? '' : 'bad'));
  }
  function arBuy(m) {
    const st = opts?.arsenal?.(); if (!st) return;
    const on = st.mod?.id === m.id, r = on ? opts.upgradeMod?.() : opts.buyMod?.(m.id);
    arMsg = r === true ? [on ? `${m.name.toUpperCase()} UPGRADED` : `${m.name.toUpperCase()} LOADED`, 'ok'] : [String(r || 'TRANSACTION FAILED').toUpperCase(), 'bad'];
    status(); drawArsenal();
  }
  // ---- EXFIL.EXE --------------------------------------------------------------------------------------------
  const exfilStatus = () => opts?.exfil?.() ?? { available: false, reason: 'Exfil is not installed' };
  function drawExfil() {
    const st = exfilStatus(), key = JSON.stringify(st);
    exIcon.classList.toggle('off', !st.available); exIcon.classList.toggle('live', !!st.available);
    if (exWin.hidden || key === exState) return; exState = key;
    const rw = st.reward, xp = rw ? `<dt>REWARD</dt><dd>+${rw.account.toLocaleString()} XP · +${rw.cls.toLocaleString()} CLASS XP</dd>` : '';
    const when = `<dt>WINDOWS</dt><dd>START OF ROUND ${st.first ?? 11}, THEN EVERY ${st.every ?? 5} ROUNDS</dd>`;
    exBody.innerHTML = st.active
      ? `<h2>EXFIL IN PROGRESS</h2><div class="state go">CHOPPER INBOUND</div><dl><dt>LANDING ZONE</dt><dd>${esc(st.zone.toUpperCase())}</dd>${xp}</dl>`
      : st.available
      ? `<h2>EXFIL AVAILABLE</h2><div class="state go">WINDOW OPEN · CLOSES WHEN ROUND ${st.closes} ENDS</div>
         <dl><dt>LANDING ZONE</dt><dd>${esc(st.zone.toUpperCase())}</dd><dt>HOLD OUT</dt><dd>${Math.floor(st.duration / 60)}:${String(st.duration % 60).padStart(2, '0')} AGAINST A STRONGER HORDE</dd>${xp}${when}</dl>
         <ul><li>Normal spawns stop; the horde rises around you</li><li>Be inside the landing zone when the chopper lands</li><li>Outside it when it leaves: left behind (game over)</li><li>Escaping ends the game with the reward</li></ul>
         <button class="buy call">CALL EXFIL</button><div class="msg"></div>`
      : `<h2>EXFIL</h2><div class="state no">${esc(String(st.reason ?? 'UNAVAILABLE').toUpperCase())}</div>
         <dl>${st.next ? `<dt>NEXT WINDOW</dt><dd>START OF ROUND ${st.next}</dd>` : ''}${rw ? `<dt>REWARD THEN</dt><dd>+${rw.account.toLocaleString()} XP · +${rw.cls.toLocaleString()} CLASS XP</dd>` : ''}${when}</dl>
         <button class="buy call" disabled>CALL EXFIL</button>`;
    exBody.querySelector('.call:not([disabled])')?.addEventListener('click', callExfil);
  }
  function callExfil() {
    if (!exfilStatus().available) return;
    const r = opts.callExfil?.() ?? 'Exfil is not installed';
    if (r === true) { close(); return; }
    const m = exBody.querySelector('.msg'); if (m) { m.textContent = String(r).toUpperCase(); m.className = 'msg bad'; }
  }
  function status() {
    if (!opts) return;
    $('.pwr').innerHTML = opts.power() ? 'MAINS OK' : '<span class="warn">AUX BATTERY</span>';
    $('.pts').textContent = (opts.points() ?? 0).toLocaleString() + ' PTS';
    $('.clock').textContent = new Date().toTimeString().slice(0, 5);
    // the game runs underneath: redraw the shop when a drink finishes, the power comes on or the points change
    const state = PERKS.map(p => blocked(p)).join() + opts.points();
    if (!win.hidden && state !== lastState) { renderGrid(); select(shown); }
    lastState = state;
    drawExfil(); drawArsenal();
  }
  function open(o) {
    opts = o; root.hidden = false; status(); clearInterval(clock); clock = setInterval(status, 250);
    const c = root.querySelector('.crt'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    if (!win.hidden) { say('> SELECT A PERK'); renderGrid(); select(shown); }
    exState = ''; drawExfil();
    opts.onOpen?.();
  }
  function close() {
    if (root.hidden) return; root.hidden = true; clearInterval(clock); const o = opts; opts = null;
    o?.onClose?.();
  }
  root.querySelector('[data-app=perks]').addEventListener('click', () => openApp('perks'));
  root.querySelector('[data-app=exfil]').addEventListener('click', () => openApp('exfil'));
  root.querySelector('[data-app=arsenal]').addEventListener('click', () => openApp('arsenal'));
  for (const b of root.querySelectorAll('[data-close]')) b.addEventListener('click', closeApp);
  root.querySelector('[data-logoff]').addEventListener('click', close);
  return { open, close, isOpen: () => !root.hidden };
}

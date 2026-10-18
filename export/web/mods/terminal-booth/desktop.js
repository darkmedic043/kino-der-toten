// MelonTerm desktop: the window the terminal booth opens (F at the screen). A green phosphor CRT
// window floating over the game (which keeps running: zombies still come), with square app icons. Apps so far: Perks, a shop for every
// perk in the game, whether or not this map has its machine (perks bought here work on any map).
// openDesktop(opts) builds it once and shows it; Esc or LOG OFF closes.
// EXFIL (bottom right, greyed out when no exfil window is open) shows the exfil status and calls it in.
//   opts: {owned(perk), onMap(perk), needsPower(perk), power(), price(perk), points(), buy(perk) -> true | 'reason',
//          exfil() -> status (mods/exfil), callExfil() -> true | 'reason', arsenal() -> status (mods/ammo-mods),
//          buyMod(id) / upgradeMod() -> true | 'reason', onOpen(), onClose(), onApp(name)}
// ARSENAL (under PERKS) sells ammo mods for the gun in hand once the power is on.
// STARK.EXE (mods/stark): the Iron Man armors; opts.stark() -> status, opts.starkAct(action, id) -> true | 'reason'.
// GOBBLE.EXE (mods/gobblegums): rolls a gobblegum from your pack on a slot-machine reel; opts.gums() -> status,
//   opts.gumRoll() -> {id, commit()} | 'reason' (commit puts it in your hand once the reel stops).
// BANK.EXE (mods/bank, above EXFIL): TranZit's bank. Build the vault first (invest points until every requirement is met),
//   then deposit (1,100 per 1,000 banked) and withdraw across matches; opts.bank() -> status, opts.bankAct(action, amount).
// ARMORY.EXE (mods/armory, above BANK): tabs of special gear bought off its home map (operator weapons, shields,
//   scorestreaks later); opts.armory() -> status, opts.armoryBuy(id) -> true | 'reason'.
// JOURNAL.EXE (mods/journal, top of the right column): every map's Easter eggs step by step, recorded once done;
//   TRACK puts the current step on the HUD with markers. opts.journal() -> status, opts.journalTrack(map, quest | null).
// Home screen (2026-10-17, user): the icons sit on a phone-style cell grid (cells of at least 108x112 px, stretched to fill
//   the desk) and the player arranges them: drag an icon (mouse: just drag; touch: hold or drag) onto a cell to move it,
//   onto another icon to swap the two. The layout is saved per grid shape ("cols x rows", so a phone and a desktop each
//   keep their own) in localStorage kino.mods.terminal {layout:{'9x4':{perks:[c,r],...}}}, cloud-synced (cloud.js TRACKED).
//   RESET ICONS in the taskbar restores the default (shop apps down the left, map apps up the right). App windows open in the
//   middle, inset one grid column on each side, so the icons on the outer edges stay visible (user, 2026-10-17); phones cover the desk.

import { keepScroll } from '../../keep-scroll.js';

const TEX = new URL('../../textures/', import.meta.url).href, OWN = new URL('../perks-plus/icons/', import.meta.url).href;
// perks with `unlock` (a shop/pass item id) stay locked until that item is owned (Widow's Wine: a Melon Pass reward);
// the terminal and the free-perk gums both check this
export const perkUnlocked = p => { if (!p.unlock) return true; try { return (JSON.parse(localStorage.getItem('kino.mods.shop'))?.owned ?? []).includes(p.unlock); } catch { return false; } };
// Every perk in the game. Double-Dew (Cheese Cube) is left out for now, at the user's request.
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
  // Black Ops 7 perks (mods/perks-plus/bo7-perks.js); their augments are research tracks (Armory -> Research)
  { id: 'specialty_vultureaid', name: 'Vulture Aid', price: 3000, color: '#c0392b', badge: 'VA', icon: OWN + 'vultureaid.webp',
    blurb: 'Pick the bones clean.',
    effects: ['Kills sometimes drop vulture loot only you can see: ammo for the gun in hand or a few points', 'Walk near a drop to collect it'] },
  { id: 'specialty_widowswine', name: "Widow's Wine", price: 4000, color: '#7a1830', badge: 'WW', icon: OWN + 'widowswine.webp', unlock: 'pass.s1.perk.widowswine',
    blurb: 'Get caught, and catch them back.',
    effects: ['Getting hit sets off a web explosion: zombies next to you are cocooned, the rest slowed, for 8 s (40 s cooldown)', 'Your melee sometimes webs what it hits'] },
  { id: 'specialty_wisptea', name: 'Wisp Tea', price: 3500, color: '#62c6e8', badge: 'WT', icon: OWN + 'wisptea.webp',
    blurb: 'A friend from the Dark Aether.',
    effects: ['Every 40 kills summon a small Wisp that stays by you for 20 s', 'Every 1.8 s it strikes a zombie close to you for a third of its health', 'It rests 2 minutes before it can come back, and spares the round\'s last zombie'] },
  { id: 'specialty_deathperception', name: 'Death Perception', price: 3000, color: '#e07a1f', badge: 'DP', icon: OWN + 'deathperception.webp',
    blurb: 'Nothing hides from you.',
    effects: ['Zombies within 750 are outlined in orange through walls'] },
  { id: 'specialty_elementalpop', name: 'Elemental Pop', price: 3000, color: '#d65fc4', badge: 'EP', icon: OWN + 'elementalpop.webp',
    blurb: 'Every flavour at once.',
    effects: ['Bullet hits have a 6% chance to set off a random ammo mod (Cryo, Napalm, Dead Wire…)', '5 s cooldown between pops'] },
  { id: 'specialty_meleemacchiato', name: 'Melee Macchiato', price: 3000, color: '#8b5a2b', badge: 'MM', icon: OWN + 'meleemacchiato.webp',
    blurb: 'One punch.',
    effects: ['Your melee one-shots zombies through round 20 (2,700 damage after)', 'Punched zombies are thrown back'] },
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
#melonterm .apps{position:absolute;inset:0}
#melonterm .cells{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .15s}#melonterm .desk.arranging .cells{opacity:1}
#melonterm .cell{position:absolute;border:1px dashed #1f6b3a88}#melonterm .cell.hot{border:2px solid var(--g);background:#3dff8a22;box-shadow:0 0 14px #3dff8a55}
#melonterm .stk{flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto}#melonterm .stk>.perks{flex:1;min-height:0}
#melonterm .stk .panel{padding:20px 26px;display:flex;flex-direction:column;gap:10px;font-size:22px}
#melonterm .stk .panel h2{margin:0;font:inherit;font-size:38px;color:#ffd36b;letter-spacing:2px}
#melonterm .stk .panel ul{margin:0;padding:0;list-style:none}#melonterm .stk .panel li{padding-left:28px;position:relative}
#melonterm .stk .panel li::before{content:'[ ]';position:absolute;left:0;color:var(--dim)}#melonterm .stk .panel li.ok::before{content:'[X]';color:var(--g)}
#melonterm .stk .bar2{height:14px;border:2px solid var(--g2);max-width:420px}#melonterm .stk .bar2 i{display:block;height:100%;background:var(--g)}
#melonterm .stk .suit{font:bold 22px 'Arial Black',Arial,sans-serif;color:#ffd36b;text-shadow:0 0 8px #ff9f2a}
#melonterm .ars{flex:1;min-height:0;display:flex;flex-direction:column}#melonterm .ars .tile.owned::after{content:'LOADED'}#melonterm .ars>.perks{flex:1;min-height:0}
#melonterm .app{position:absolute;width:96px;height:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;background:none;border:0;color:inherit;font:inherit;font-size:19px;padding:0;
  touch-action:none;transition:left .18s ease-out,top .18s ease-out}
#melonterm .app.drag{transition:none;z-index:5;pointer-events:none;filter:drop-shadow(0 0 10px #3dff8a);transform:scale(1.08)}
#melonterm .desk.arranging .app:not(.drag){animation:mt-jiggle .5s ease-in-out infinite alternate}
@keyframes mt-jiggle{from{rotate:-1.5deg}to{rotate:1.5deg}}
#melonterm .app .sq{width:64px;height:64px;border:2px solid var(--g2);background:#062a14;display:grid;place-items:center;box-shadow:0 0 10px #3dff8a33,inset 0 0 12px #000a}
#melonterm .app:hover .sq,#melonterm .app:focus-visible .sq{background:#0d4a24;box-shadow:0 0 16px #3dff8a88,inset 0 0 12px #0008}
#melonterm .app:hover span,#melonterm .app:focus-visible span{background:var(--g);color:var(--bg);text-shadow:none}
#melonterm .app span{padding:0 4px}
#melonterm .win{position:absolute;inset:16px var(--side,128px);z-index:6;display:flex;flex-direction:column;border:2px solid var(--g2);background:#020d06f2;box-shadow:0 0 0 2px #000,8px 8px 0 #0008,0 0 30px #3dff8a22}
#melonterm .win[hidden]{display:none}
#melonterm .title{display:flex;align-items:center;gap:10px;padding:3px 4px 3px 12px;background:var(--g2);color:var(--bg);font-size:21px;letter-spacing:2px;text-shadow:none}
#melonterm .title button{width:30px;height:26px;border:2px solid var(--bg);background:var(--g2);color:var(--bg);font:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0}
#melonterm .title button:hover{background:var(--bg);color:var(--g)}
#melonterm .perks{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}
#melonterm .left{display:flex;flex-direction:column;min-height:0;border-right:2px dashed var(--line)}
#melonterm .grid{flex:1;align-content:start;display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px;padding:14px;overflow:auto}
#melonterm :is([data-win=perks],[data-win=arsenal],[data-win=stark]) .grid{grid-template-columns:repeat(4,minmax(0,1fr))}   /* 4 a row: perks, ammo mods, suits (user, 2026-10-15) */
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
#melonterm .bar .exlive{animation:mt-blink 1.2s steps(2) infinite}@keyframes mt-blink{to{opacity:.35}}
#melonterm .jnl{flex:1;min-height:0;display:flex;flex-direction:column}
#melonterm .jnl .body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.3fr)}
#melonterm .jnl .qs{overflow:auto;border-right:2px dashed var(--line);padding:8px}
#melonterm .jnl .q{display:flex;flex-direction:column;align-items:flex-start;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:2px solid transparent;padding:4px 8px;cursor:pointer}
#melonterm .jnl .q:hover{border-color:var(--line)}#melonterm .jnl .q.on{border-color:var(--g);background:#0b3d1d}
#melonterm .jnl .q b{font-weight:normal;font-size:22px}#melonterm .jnl .q small{font-size:16px;color:var(--dim);letter-spacing:1px}
#melonterm .jnl .q small em{font-style:normal;color:var(--warn)}
#melonterm .jnl .steps{overflow:auto;padding:14px 18px;display:flex;flex-direction:column;gap:8px}
#melonterm .jnl .steps h2{margin:0;font:inherit;font-size:32px;color:#b6ffcb;letter-spacing:1px;line-height:1}
#melonterm .jnl .st{padding-left:30px;position:relative;font-size:20px}
#melonterm .jnl .st::before{content:attr(data-n);position:absolute;left:0;top:0;color:var(--dim)}
#melonterm .jnl .st b{font-weight:normal;color:#b6ffcb;font-size:22px}#melonterm .jnl .st p{margin:2px 0 0;color:var(--g2);font-size:19px;line-height:1.2}
#melonterm .jnl .st.lock{color:var(--dim)}#melonterm .jnl .st.lock b{color:var(--dim)}
#melonterm .jnl .st.now b::after{content:' · DONE THIS MATCH';color:var(--g);font-size:16px}
#melonterm .arm{flex:1;min-height:0;display:flex;flex-direction:column}#melonterm .arm>.perks{flex:1;min-height:0}
#melonterm .tabs{display:flex;gap:0;border-bottom:2px solid var(--line);background:#04180c}
#melonterm .tabs button{font:inherit;font-size:20px;letter-spacing:2px;padding:3px 16px;color:var(--g2);background:none;border:0;border-right:2px solid var(--line);cursor:pointer}
#melonterm .tabs button:hover{color:var(--g)}#melonterm .tabs button.on{background:var(--g2);color:var(--bg);text-shadow:none}
#melonterm .tabs button.soon{color:var(--dim)}#melonterm .tabs button.soon.on{background:var(--dim);color:var(--bg)}
#melonterm .arm .soonbox{flex:1;display:grid;place-items:center;text-align:center;font-size:26px;color:var(--dim);letter-spacing:2px}
#melonterm .arm .grid{grid-template-columns:repeat(4,minmax(0,1fr))}
#melonterm .arm .gear{width:70%;height:70%}
#melonterm .arm .prog{height:12px;border:2px solid var(--g2);max-width:360px}#melonterm .arm .prog i{display:block;height:100%;background:var(--g)}
#melonterm .bnk{flex:1;min-height:0;overflow:auto;padding:18px 26px;display:flex;flex-direction:column;gap:10px;font-size:22px;line-height:1.2}
#melonterm .bnk h2{margin:0;font:inherit;font-size:38px;line-height:1;letter-spacing:2px;color:var(--warn);text-shadow:0 0 8px #ffb00088}
#melonterm .bnk .note{font-size:19px;color:var(--g2);opacity:.85}
#melonterm .bnk ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
#melonterm .bnk li{padding-left:34px;position:relative}#melonterm .bnk li::before{content:'[ ]';position:absolute;left:0;color:var(--dim)}
#melonterm .bnk li.ok::before{content:'[X]';color:var(--g)}#melonterm .bnk li.ok{color:#b6ffcb}
#melonterm .bnk li small{display:block;font-size:17px;color:var(--dim)}
#melonterm .bnk .have{float:right;color:var(--g2)}#melonterm .bnk li.ok .have{color:var(--g)}
#melonterm .bnk .bar2{height:12px;border:2px solid var(--g2);margin-top:3px}#melonterm .bnk .bar2 i{display:block;height:100%;background:var(--g)}
#melonterm .bnk .row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}#melonterm .bnk .row>b{width:120px;font-weight:normal;letter-spacing:2px;color:var(--dim)}
#melonterm .bnk .row .buy{font-size:21px;padding:0 10px}
#melonterm .bnk .bal{display:flex;align-items:baseline;gap:16px;padding:6px 14px;border:2px solid var(--warn);align-self:flex-start;color:var(--warn)}
#melonterm .bnk .bal b{font-weight:normal;font-size:46px;line-height:1;text-shadow:0 0 10px #ffb000aa}
#melonterm .bnk .msg{border:0;background:none;padding:0}
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
#melonterm .gum{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
#melonterm .reelbox{position:relative;display:grid;place-items:center;border-right:2px dashed var(--line);padding:16px}
#melonterm .reel{position:relative;width:min(300px,100%);height:210px;overflow:hidden;border:2px solid var(--g2);background:#020a05;box-shadow:inset 0 0 30px #000,0 0 16px #3dff8a33}
#melonterm .reel::before,#melonterm .reel::after{content:'';position:absolute;left:0;right:0;height:70px;z-index:2;pointer-events:none}
#melonterm .reel::before{top:0;background:linear-gradient(#020a05,#020a0500)}#melonterm .reel::after{bottom:0;background:linear-gradient(#020a0500,#020a05)}
#melonterm .reel .line{position:absolute;left:-2px;right:-2px;top:70px;height:70px;border:2px solid var(--warn);z-index:3;pointer-events:none;box-shadow:0 0 12px #ffd36b66}
#melonterm .strip{position:absolute;left:0;right:0;top:0;will-change:transform}
#melonterm .strip .it{height:70px;display:flex;align-items:center;gap:14px;padding:0 16px;font-size:24px;white-space:nowrap;overflow:hidden}
#melonterm .ball{flex:none;width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fffa,var(--c) 45%,#000 125%);box-shadow:0 0 10px var(--c)}
#melonterm .gum .side{padding:20px 24px;display:flex;flex-direction:column;gap:10px;overflow:auto;min-height:0;font-size:22px}
#melonterm .gum .side h2{margin:0;font:inherit;font-size:36px;color:#b6ffcb;letter-spacing:1px}
#melonterm .gum .swap{display:flex;flex-direction:column;gap:6px}#melonterm .gum .swap button{display:flex;align-items:center;gap:10px;padding:6px 10px;background:none;border:2px solid var(--c,var(--line));color:inherit;font:inherit;font-size:20px;text-align:left;cursor:pointer}#melonterm .gum .swap button:hover{background:#ffffff14}#melonterm .gum .swap .ball{width:24px;height:24px;flex:none}
#melonterm .gum .won{font-size:30px;text-shadow:0 0 10px var(--c)}
#melonterm .gum .hand{display:flex;gap:8px}#melonterm .gum .hand .ball{width:34px;height:34px}#melonterm .gum .hand .empty{width:34px;height:34px;border-radius:50%;border:2px dashed var(--dim)}
@media(max-width:760px){#melonterm .gum{grid-template-columns:1fr;grid-template-rows:auto 1fr}#melonterm .reelbox{border-right:0;border-bottom:2px dashed var(--line)}}
@media(max-width:760px){#melonterm .crt{width:96vw;height:92vh}#melonterm .win{inset:8px}#melonterm .perks{grid-template-columns:1fr;grid-template-rows:auto 1fr}#melonterm .left{border-right:0;border-bottom:2px dashed var(--line)}
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
const STARK_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <path d="M9 4h14l3 5v9l-4 8-6 3-6-3-4-8V9z" fill="none" stroke="#7dffa6" stroke-width="2"/><rect x="10" y="12" width="5" height="2"/><rect x="17" y="12" width="5" height="2"/>
  <rect x="13" y="20" width="6" height="1.5"/><rect x="15" y="5" width="2" height="5"/></svg>`;
const GUMS_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <circle cx="16" cy="11" r="9" fill="none" stroke="#7dffa6" stroke-width="2"/><circle cx="12" cy="9" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="15" cy="13" r="2"/><circle cx="20" cy="13" r="2" fill="#c9ffd9"/>
  <rect x="9" y="20" width="14" height="9"/><rect x="14" y="23" width="4" height="3" fill="#031208"/><rect x="7" y="29" width="18" height="2"/></svg>`;
const BANK_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#ffd36b">
  <path d="M16 2 3 9v2h26V9z"/><rect x="5" y="13" width="3" height="11"/><rect x="11" y="13" width="3" height="11"/><rect x="18" y="13" width="3" height="11"/><rect x="24" y="13" width="3" height="11"/>
  <rect x="3" y="25" width="26" height="2"/><rect x="2" y="28" width="28" height="2"/><rect x="14" y="5" width="4" height="3" fill="#031208"/></svg>`;
const ARMORY_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <path d="M16 3 6 7v8c0 7 4 11 10 14 6-3 10-7 10-14V7z" fill="none" stroke="#7dffa6" stroke-width="2"/>
  <rect x="15" y="9" width="2" height="14"/><rect x="11" y="13" width="10" height="2"/><rect x="13" y="20" width="6" height="2" fill="#c9ffd9"/></svg>`;
const JOURNAL_ICON = `<svg viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" fill="#7dffa6">
  <path d="M6 4h17l3 3v21H6z" fill="none" stroke="#7dffa6" stroke-width="2"/><rect x="9" y="4" width="2" height="24"/>
  <rect x="14" y="10" width="9" height="2"/><rect x="14" y="15" width="9" height="2"/><rect x="14" y="20" width="6" height="2"/><path d="M21 24l3-3 3 3-3 3z" fill="#ffd36b"/></svg>`;
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
    <div class="bar"><span>MELONTERM 2.7</span><span class="grow"></span><span class="exlive warn" hidden>EXFIL OPEN</span><span class="pwr"></span><span class="pts"></span><span class="clock"></span></div>
    <div class="desk">
      <div class="cells"></div>
      <div class="apps"><button class="app" data-app="perks"><div class="sq">${PERKS_ICON}</div><span>PERKS</span></button>
        <button class="app" data-app="arsenal"><div class="sq">${ARSENAL_ICON}</div><span>ARSENAL</span></button>
        <button class="app" data-app="stark"><div class="sq">${STARK_ICON}</div><span>STARK</span></button>
        <button class="app" data-app="gums"><div class="sq">${GUMS_ICON}</div><span>GUMS</span></button>
        <button class="app" data-app="journal"><div class="sq">${JOURNAL_ICON}</div><span>JOURNAL</span></button>
        <button class="app" data-app="armory"><div class="sq">${ARMORY_ICON}</div><span>ARMORY</span></button>
        <button class="app off" data-app="bank"><div class="sq">${BANK_ICON}</div><span>BANK</span></button>
        <button class="app off" data-app="exfil"><div class="sq">${EXFIL_ICON}</div><span>EXFIL</span></button></div>
      <div class="win" data-win="perks" hidden>
        <div class="title"><span>PERKS.EXE</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="perks"><div class="left"><div class="grid"></div><div class="msg"></div></div><div class="detail"></div></div>
      </div>
      <div class="win" data-win="arsenal" hidden>
        <div class="title"><span>ARSENAL.EXE · AMMO MODS</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="ars"></div>
      </div>
      <div class="win" data-win="stark" hidden>
        <div class="title"><span>STARK.EXE · ARMORY</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="stk"></div>
      </div>
      <div class="win" data-win="gums" hidden>
        <div class="title"><span>GOBBLE.EXE · GOBBLEGUMS</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="gum"><div class="reelbox"><div class="reel"><div class="strip"></div><div class="line"></div></div></div><div class="side"></div></div>
      </div>
      <div class="win" data-win="journal" hidden>
        <div class="title"><span>JOURNAL.EXE</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="jnl"></div>
      </div>
      <div class="win" data-win="armory" hidden>
        <div class="title"><span>ARMORY.EXE</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="arm"></div>
      </div>
      <div class="win" data-win="bank" hidden>
        <div class="title"><span>BANK.EXE · MELON SAVINGS &amp; LOAN</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="bnk"></div>
      </div>
      <div class="win" data-win="exfil" hidden>
        <div class="title"><span>EXFIL.EXE</span><span class="grow"></span><button data-close title="Close">×</button></div>
        <div class="exf"></div>
      </div>
    </div>
    <div class="task"><button data-logoff>LOG OFF</button><span class="open"></span><span class="grow"></span><span class="hint">DRAG ICONS TO ARRANGE · ESC LOG OFF</span><button data-reset title="Put the icons back where they started">RESET ICONS</button></div>
  </div>`;
  document.body.append(root);
  const $ = s => root.querySelector(s);
  const win = $('[data-win=perks]'), exWin = $('[data-win=exfil]'), exBody = $('.exf'), exIcon = $('[data-app=exfil]');
  const stWin = $('[data-win=stark]'), stBody = $('.stk'); let stState = '', stMsg = ['', ''], stShown = 0;
  const arWin = $('[data-win=arsenal]'), arBody = $('.ars'); let arState = '', arMsg = ['', ''];
  const gmWin = $('[data-win=gums]'), gmStrip = $('.strip'), gmSide = $('.gum .side'); let gmState = '', gmMsg = ['', ''], gmSpin = false, gmWon = null, gmPending = null;   // gmPending: a gum rolled into a full hand, waiting for swap or keep
  const grid = $('.grid'), detail = $('.detail'), msg = $('.msg');
  let exState = '';
  const jnWin = $('[data-win=journal]'), jnBody = $('.jnl'); let jnState = '', jnMap = null, jnQuest = null, jnMsg = '';
  const amWin = $('[data-win=armory]'), amBody = $('.arm'); let amState = '', amMsg = ['', ''], amTab = 'operators', amShown = 0;
  const bkWin = $('[data-win=bank]'), bkBody = $('.bnk'), bkIcon = $('[data-app=bank]'); let bkState = '', bkMsg = ['', ''];
  let opts = null, shown = 0, clock = 0, lastState = '';

  // Keep the game from seeing key presses and clicks while the desktop is up. Key releases still go through, so a
  // key held when it opened (W) doesn't stay stuck down in the game.
  addEventListener('keydown', e => { if (root.hidden) return; e.stopPropagation(); key(e); }, true);
  for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'wheel', 'contextmenu']) root.addEventListener(t, e => e.stopPropagation());

  function key(e) {
    if (e.code === 'Escape') { e.preventDefault(); if (!win.hidden || !exWin.hidden || !arWin.hidden || !stWin.hidden || !gmWin.hidden || !bkWin.hidden || !amWin.hidden || !jnWin.hidden) closeApp(); else close(); return; }
    if (!gmWin.hidden) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); gumRoll(); } return; }
    if (!arWin.hidden || !stWin.hidden || !bkWin.hidden || !amWin.hidden || !jnWin.hidden) return;
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
  const blocked = p => opts.owned(p) ? 'owned' : !perkUnlocked(p) ? 'pass' : opts.needsPower(p) && !opts.power() ? 'power' : '';

  function renderGrid() {
    keepScroll(grid).innerHTML = PERKS.map((p, i) => {
      const why = blocked(p);
      return `<button class="tile ${why === 'power' || why === 'pass' ? 'locked' : ''} ${why === 'owned' ? 'owned' : ''}" data-i="${i}" title="${esc(p.name)}">${art(p)}<span class="tag">${why === 'power' ? 'NO POWER' : why === 'pass' ? 'MELON PASS' : ''}</span></button>`;
    }).join('');
    for (const t of grid.children) {
      t.addEventListener('mouseenter', () => select(+t.dataset.i)); t.addEventListener('focus', () => select(+t.dataset.i));
      t.addEventListener('click', () => buy(+t.dataset.i));
    }
  }
  function select(i) {
    shown = i; const p = PERKS[i], why = blocked(p), price = opts.price(p), short = !why && opts.points() < price;
    for (const t of grid.children) t.classList.toggle('on', +t.dataset.i === i);
    const label = why === 'owned' ? 'OWNED' : why === 'pass' ? 'LOCKED · MELON PASS REWARD' : why === 'power' ? 'NEEDS POWER' : short ? 'NOT ENOUGH POINTS' : `BUY · ${price.toLocaleString()}`;
    detail.innerHTML = `<div class="head"><div class="big">${art(p)}</div><div>
        <h2>${esc(p.name.toUpperCase())}</h2><div class="blurb">${esc(p.blurb)}</div><div class="price">${price.toLocaleString()} PTS</div></div></div>
      <button class="buy ${why === 'power' || why === 'pass' ? 'locked' : ''}" ${why || short ? 'disabled' : ''}>${label}</button>
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
    if (why === 'pass') return say('LOCKED · UNLOCK IT IN THE MELON PASS (PASS TAB)', 'bad');
    const r = opts.buy(p);
    if (r === true) { say(`DISPENSING ${p.name.toUpperCase()} ...`, 'ok'); status(); renderGrid(); select(i); return; }
    say(String(r || 'TRANSACTION FAILED').toUpperCase(), 'bad');
  }
  function openApp(name) {
    bkWin.hidden = amWin.hidden = jnWin.hidden = true;
    if (name === 'journal') { win.hidden = exWin.hidden = arWin.hidden = stWin.hidden = gmWin.hidden = true; jnState = ''; jnMsg = ''; jnWin.hidden = false; drawJournal(); $('.open').textContent = '[JOURNAL.EXE]'; opts.onApp?.(name); return; }
    if (name === 'armory') { win.hidden = exWin.hidden = arWin.hidden = stWin.hidden = gmWin.hidden = true; amState = ''; amMsg = ['', '']; amWin.hidden = false; drawArmory(); $('.open').textContent = '[ARMORY.EXE]'; opts.onApp?.(name); return; }
    if (name === 'bank') { win.hidden = exWin.hidden = arWin.hidden = stWin.hidden = gmWin.hidden = true; bkState = ''; bkMsg = ['', '']; bkWin.hidden = false; drawBank(); $('.open').textContent = '[BANK.EXE]'; opts.onApp?.(name); return; }
    if (name === 'gums') { win.hidden = exWin.hidden = arWin.hidden = stWin.hidden = true; gmState = ''; if (!gmSpin && !gmPending) { gmMsg = ['', '']; gmWon = null; idleReel(); } gmWin.hidden = false; drawGums(); $('.open').textContent = '[GOBBLE.EXE]'; opts.onApp?.('gobble'); return; }
    gmWin.hidden = true;
    if (name === 'stark') { win.hidden = exWin.hidden = arWin.hidden = true; stState = ''; stMsg = ['', '']; stWin.hidden = false; drawStark(); $('.open').textContent = '[STARK.EXE]'; opts.onApp?.(name); return; }
    if (name === 'arsenal') { win.hidden = exWin.hidden = stWin.hidden = true; arState = ''; arMsg = ['', '']; drawArsenal(); arWin.hidden = false; $('.open').textContent = '[ARSENAL.EXE]'; opts.onApp?.(name); return; }
    if (name === 'exfil') { win.hidden = arWin.hidden = stWin.hidden = true; exState = ''; drawExfil(); exWin.hidden = false; $('.open').textContent = '[EXFIL.EXE]'; opts.onApp?.(name); return; }
    if (name !== 'perks') return;
    exWin.hidden = arWin.hidden = stWin.hidden = true;
    say('> SELECT A PERK'); renderGrid(); select(shown); win.hidden = false; $('.open').textContent = '[PERKS.EXE]';
    opts.onApp?.(name); grid.querySelector(`[data-i="${shown}"]`)?.focus({ preventScroll: true });
  }
  function closeApp() { win.hidden = exWin.hidden = arWin.hidden = stWin.hidden = gmWin.hidden = bkWin.hidden = amWin.hidden = jnWin.hidden = true; $('.open').textContent = ''; }
  // ---- STARK.EXE: the Iron Man armors (mods/stark) ---------------------------------------------------------------
  const MARK = { mk1: 'I', mk3: 'III', mk4: 'IV', mk5: 'V', mk6: 'VI', wm: 'WM', mk16: 'XVI' };
  function starkDo(action, id) {
    const r = opts.starkAct?.(action, id) ?? 'STARK.EXE is not installed';
    stMsg = r === true ? [{ start: 'UPLINK INITIATED · RECOVER THE CORES', upload: 'UPLOADING · HOLD THE TERMINAL', buy: 'ARMOR PURCHASED', deploy: 'ARMOR INBOUND', recall: 'ARMOR RECALLED' }[action] ?? 'OK', 'ok'] : [String(r).toUpperCase(), 'bad'];
    status(); drawStark(); if (r === true && action === 'deploy') setTimeout(close, 500);
  }
  function drawStark() {
    if (stWin.hidden) return;
    const st = opts?.stark?.(); if (!st) { stBody.innerHTML = '<div class="panel"><p>STARK.EXE is not installed.</p></div>'; return; }
    const key = JSON.stringify([st, stMsg, stShown]); if (key === stState) return; stState = key;
    const msgHtml = `<div class="msg ${stMsg[1]}">${esc(stMsg[0] || '')}</div>`;
    if (!st.unlocked || !st.power || st.phase !== 'online') {
      let body;
      if (!st.unlocked) body = `<h2>ACCESS DENIED</h2><p>STARK INDUSTRIES CREDENTIALS REQUIRED. EARN THEM ON CHEESE CUBE:</p>
        <ul><li class="${st.req.stark ? 'ok' : ''}">Build the six Iron Man armor parts in the Hall of Armors (Iron Man armors)</li>
        <li class="${st.req.stark_wm ? 'ok' : ''}">Complete the trivia (War Machine)</li>
        <li class="${st.req.stark_mk16 ? 'ok' : ''}">Beat the map ${st.winsNeeded} times · ${Math.min(st.wins, st.winsNeeded)} / ${st.winsNeeded} (Mark XVI)</li></ul>`;
      else if (!st.power) body = `<h2>ARMORY OFFLINE</h2><p>RESTORE MAINS POWER TO REACH THE STARK SATELLITE.</p>`;
      else if (st.phase === 'offline') body = `<h2>ARMOR UPLINK</h2><p>THE ARMORS NEED POWER CORES BEFORE THEY CAN BE DEPLOYED HERE.</p>
        <ul><li>Recover ${st.coresNeeded} armor cores: the undead drop them (hellhounds always). They glow blue.</li><li>Upload them here, then hold the terminal for ${st.uplink} s.</li></ul>
        <button class="buy" data-act="start">START ARMOR UPLINK</button>`;
      else if (st.phase === 'cores') body = `<h2>RECOVERING CORES</h2><p>${st.cores} / ${st.coresNeeded} ARMOR CORES</p><div class="bar2"><i style="width:${100 * st.cores / st.coresNeeded}%"></i></div><p>KILL ZOMBIES AND PICK UP THE GLOWING CORES.</p>`;
      else if (st.phase === 'upload') body = `<h2>CORES RECOVERED</h2><p>UPLOAD THEM, THEN HOLD THIS TERMINAL FOR ${st.uplink} S.</p><button class="buy" data-act="upload">UPLOAD CORES</button>`;
      else body = `<h2>UPLINK ${st.uplinkLeft} S</h2><div class="bar2"><i style="width:${100 * (1 - st.uplinkLeft / st.uplink)}%"></i></div><p>STAY NEAR A TERMINAL UNTIL IT COMPLETES.</p>`;
      keepScroll(stBody).innerHTML = `<div class="panel">${body}${msgHtml}</div>`;
      for (const b of stBody.querySelectorAll('[data-act]')) b.addEventListener('click', () => starkDo(b.dataset.act));
      return;
    }
    // online: the armors, laid out like PERKS.EXE
    if (!stBody.querySelector('.grid')) stBody.innerHTML = '<div class="perks"><div class="left"><div class="grid"></div><div class="msg"></div></div><div class="detail"></div></div>';
    const grid = stBody.querySelector('.grid'), detail = stBody.querySelector('.detail'), msg = stBody.querySelector('.msg');
    keepScroll(grid).innerHTML = st.suits.map((s, i) => `<button class="tile ${s.unlocked ? '' : 'locked'} ${s.owned ? 'owned' : ''} ${i === stShown ? 'on' : ''}" data-i="${i}" title="${esc(s.name)}">
      <span class="suit">${MARK[s.id] ?? s.id}</span><span class="tag">${!s.unlocked ? 'LOCKED' : s.worn ? 'WORN' : s.owned ? s.power + '%' : ''}</span></button>`).join('');
    for (const t of grid.children) { t.addEventListener('mouseenter', () => { stShown = +t.dataset.i; drawStark(); }); t.addEventListener('click', () => { const s = st.suits[+t.dataset.i]; starkDo(s.worn ? 'recall' : s.owned ? 'deploy' : 'buy', s.id); }); }
    const s = st.suits[Math.min(stShown, st.suits.length - 1)];
    const label = !s.unlocked ? 'LOCKED · EARN IT ON CHEESE CUBE' : s.worn ? 'RECALL ARMOR' : s.owned ? (st.delivering ? 'ARMOR INBOUND' : s.ready ? 'DEPLOY ARMOR' : `CHARGING · ${s.power}%`) : st.points < s.cost ? 'NOT ENOUGH POINTS' : `BUY · ${s.cost.toLocaleString()}`;
    const can = s.unlocked && (s.worn || (s.owned ? s.ready && !st.delivering : st.points >= s.cost));
    detail.innerHTML = `<div class="head"><div class="big"><span class="suit" style="font-size:40px">${MARK[s.id] ?? ''}</span></div><div>
        <h2>${esc(s.name.toUpperCase())}</h2><div class="blurb">${s.owned ? `POWER ${s.power}%` : 'STARK INDUSTRIES ARMOR'}</div><div class="price">${s.cost.toLocaleString()} PTS</div></div></div>
      <button class="buy ${s.unlocked ? '' : 'locked'}" ${can ? '' : 'disabled'}>${label}</button>
      <h3>SPECS</h3><ul><li>Health ${s.hp}</li><li>Speed ×${s.speed}</li><li>${s.weapons.map(esc).join(' · ')}</li><li>Hold Space in the air to fly; shots and flight use power</li></ul>
      <div class="note">* Deployed where you stand. When its power runs out it flies home and recharges.</div>`;
    detail.querySelector('.buy').addEventListener('click', () => starkDo(s.worn ? 'recall' : s.owned ? 'deploy' : 'buy', s.id));
    msg.textContent = stMsg[0] || '> HOVER AN ARMOR · CLICK TO BUY OR DEPLOY'; msg.className = 'msg ' + stMsg[1];
  }
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
    keepScroll(grid).innerHTML = st.mods.map((m, i) => {
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
  // ---- GOBBLE.EXE: a slot-machine reel over your pack (mods/gobblegums) ------------------------------------------
  const ITEM = 70;
  const gumRow = g => `<div class="it" style="--c:${g.color}"><div class="ball"></div><span>${esc(g.name.toUpperCase())}</span></div>`;
  function idleReel() {
    const st = opts?.gums?.(); const list = st?.pack?.length ? st.pack : [{ name: '- - -', color: '#2a7a48' }];
    gmStrip.style.transition = 'none'; gmStrip.innerHTML = [0, 1, 2].map(i => gumRow(list[i % list.length])).join(''); gmStrip.style.transform = 'translateY(0)';
  }
  function gumRoll() {
    if (gmSpin || gmPending) return;
    const r = opts?.gumRoll?.() ?? 'Gobblegums are not installed';
    if (typeof r !== 'object') { gmMsg = [String(r).toUpperCase(), 'bad']; gmState = ''; drawGums(); return; }
    const st = opts.gums(), by = Object.fromEntries(st.pack.map(g => [g.id, g])), n = 46, win = n - 4;
    // a long random strip with the prize on the pay line (the middle row) when it stops
    const rows = Array.from({ length: n }, (_, i) => i === win ? by[r.id] : st.pack[Math.floor(Math.random() * st.pack.length)]);
    gmStrip.style.transition = 'none'; gmStrip.innerHTML = rows.map(gumRow).join(''); gmStrip.style.transform = 'translateY(0)'; void gmStrip.offsetWidth;
    gmSpin = true; gmWon = null; gmMsg = ['ROLLING ...', '']; gmState = ''; drawGums(); status();
    gmStrip.style.transition = 'transform 2.6s cubic-bezier(.12,.62,.18,1)'; gmStrip.style.transform = `translateY(${-(win - 1) * ITEM}px)`;
    const ticks = setInterval(() => tick(), 90); setTimeout(() => clearInterval(ticks), 1900);
    setTimeout(() => { gmSpin = false; gmWon = by[r.id]; gmState = '';
      if (r.full) { gmPending = r; gmMsg = [`HAND FULL · SWAP ONE OUT FOR ${by[r.id].name.toUpperCase()}, OR KEEP YOUR HAND`, '']; }
      else { r.commit(); gmMsg = [`${by[r.id].name.toUpperCase()} · ${by[r.id].rarity.toUpperCase()} · N TO CHEW`, 'ok']; }
      status(); drawGums(); }, 2700);
  }
  // full hand: swap the rolled gum into slot i, or keep the hand (i = null drops the rolled gum)
  function gumResolve(i) {
    const r = gmPending; if (!r || !gmWon) return; gmPending = null; r.commit(i); gmState = '';
    gmMsg = i == null ? ['KEPT YOUR HAND', ''] : [`${gmWon.name.toUpperCase()} · N TO CHEW`, 'ok']; if (i == null) gmWon = null;
    status(); drawGums();
  }
  let tickCtx = null;
  function tick() { try { tickCtx ??= new AudioContext(); const t = tickCtx.currentTime, o = tickCtx.createOscillator(), g = tickCtx.createGain(); o.type = 'square'; o.frequency.value = 1400; g.gain.setValueAtTime(.04, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03); o.connect(g).connect(tickCtx.destination); o.start(t); o.stop(t + .04); } catch {} }
  function drawGums() {
    if (gmWin.hidden) return;
    const st = opts?.gums?.(); if (!st) { gmSide.innerHTML = '<p>Gobblegums are not installed.</p>'; return; }
    const key = JSON.stringify([st, gmMsg, gmSpin, gmWon?.id, !!gmPending]); if (key === gmState) return; gmState = key;
    const left = st.rollsPerRound - st.rolls, can = st.ok && left > 0 && st.pool > 0 && st.points >= st.price && !gmSpin && !gmPending;
    const label = gmSpin ? 'ROLLING ...' : gmPending ? 'CHOOSE ABOVE' : !st.ok ? 'NO PACK' : left <= 0 ? 'COME BACK NEXT ROUND' : st.points < st.price ? 'NOT ENOUGH POINTS' : `ROLL · ${st.price.toLocaleString()}`;
    const hand = Array.from({ length: st.handSize }, (_, i) => { const g = st.pack.find(g => g.name === st.hand[i]); return g ? `<div class="ball" style="--c:${g.color}" title="${esc(g.name)}"></div>` : '<div class="empty"></div>'; }).join('');
    const swap = gmPending ? `<div class="swap">${st.hand.map((name, i) => { const g = st.pack.find(g => g.name === name); return `<button data-swap="${i}" style="--c:${g?.color ?? '#888'}"><div class="ball"></div>SWAP OUT ${esc(name.toUpperCase())}</button>`; }).join('')}<button data-swap="keep">KEEP MY HAND</button></div>` : '';
    keepScroll(gmSide).innerHTML = `<h2>GOBBLEGUMS</h2>
      ${gmWon ? `<div class="won" style="--c:${gmWon.color};color:${gmWon.color}">${esc(gmWon.name.toUpperCase())}</div><div class="note">${esc(gmWon.desc)}</div>` : ''}${swap}
      ${st.ok ? `<div>PACK · ${st.pack.length} GUMS${st.auto ? ' (AUTO)' : ''}</div>` : `<div class="warn">NO USABLE PACK</div><div class="note">${esc(st.problems[0] ?? '')} · BUILD IT IN THE ARMORY</div>`}
      <div class="status"><span>ROLLS THIS ROUND ${st.rolls} / ${st.rollsPerRound}</span><span>NEXT ${st.price.toLocaleString()} PTS</span></div>
      <div>HAND</div><div class="hand">${hand}</div>
      <button class="buy" ${can ? '' : 'disabled'}>${label}</button>
      <div class="msg ${gmMsg[1]}">${esc(gmMsg[0] || '> ROLL A GUM FROM YOUR PACK · N CHEWS IN GAME')}</div>`;
    gmSide.querySelector('.buy').addEventListener('click', gumRoll);
    for (const b of gmSide.querySelectorAll('[data-swap]')) b.addEventListener('click', () => gumResolve(b.dataset.swap === 'keep' ? null : +b.dataset.swap));
  }
  // ---- JOURNAL.EXE: map tabs, the map's quests (left), the selected quest's steps (right); TRACK on the map you're on --
  function drawJournal() {
    if (jnWin.hidden) return;
    const st = opts?.journal?.(); if (!st) { jnBody.innerHTML = '<p>JOURNAL.EXE is not installed.</p>'; return; }
    jnMap ??= st.maps.some(m => m.map === st.map) ? st.map : st.maps[0]?.map;
    const m = st.maps.find(x => x.map === jnMap) ?? st.maps[0];
    if (!m.quests.some(q => q.id === jnQuest)) jnQuest = (m.quests.find(q => q.tracked) ?? m.quests[0])?.id;
    const key = JSON.stringify([st, jnMap, jnQuest, jnMsg]); if (key === jnState) return; jnState = key;
    const q = m.quests.find(x => x.id === jnQuest);
    const tabs = `<div class="tabs">${st.maps.map(x => `<button data-map="${x.map}" class="${x.map === m.map ? 'on' : ''}">${esc(x.title.toUpperCase())}${x.here ? ' ◆' : ''}</button>`).join('')}</div>`;
    const list = m.quests.map(x => `<button class="q ${x.id === jnQuest ? 'on' : ''}" data-q="${x.id}"><b>${esc(x.name.toUpperCase())}</b><small>${esc(x.kind)} · ${x.recorded} / ${x.total} RECORDED${x.tracked ? ' · <em>TRACKING</em>' : ''}</small></button>`).join('');
    const steps = q ? q.steps.map((s, i) => s.recorded
      ? `<div class="st ${s.now ? 'now' : ''}" data-n="${i + 1}."><b>${esc(s.title.toUpperCase())}</b><p>${esc(s.how)}</p></div>`
      : `<div class="st lock ${s.now ? 'now' : ''}" data-n="${i + 1}."><b>??? · NOT YET RECORDED</b><p>Do this step once and the journal keeps it.</p></div>`).join('') : '';
    const trackBtn = !q ? '' : !m.here ? `<button class="buy" disabled>PLAY ${esc(m.title.toUpperCase())} TO TRACK</button>`
      : q.tracked ? '<button class="buy" data-track="off">STOP TRACKING</button>' : '<button class="buy" data-track="on">TRACK QUEST · MARKERS ON</button>';
    keepScroll(jnBody).innerHTML = `${tabs}<div class="body"><div class="qs">${list || '<p>No quests on this map.</p>'}</div><div class="steps">${q ? `<h2>${esc(q.name.toUpperCase())}</h2>${trackBtn}${steps}` : ''}</div></div>
      <div class="msg ${st.cheating ? 'bad' : jnMsg ? 'ok' : ''}">${esc(st.cheating ? 'CHEAT MODE · NOTHING IS RECORDED THIS GAME' : jnMsg || '> A STEP IS RECORDED THE FIRST TIME YOU DO IT · MARKERS SHOW RECORDED STEPS')}</div>`;
    for (const b of jnBody.querySelectorAll('[data-map]')) b.addEventListener('click', () => { jnMap = b.dataset.map; jnQuest = null; jnMsg = ''; drawJournal(); for (const x of jnBody.querySelectorAll('.qs,.steps')) x.scrollTop = 0; });
    for (const b of jnBody.querySelectorAll('[data-q]')) b.addEventListener('click', () => { const changed = jnQuest !== b.dataset.q; jnQuest = b.dataset.q; jnMsg = ''; drawJournal(); if (changed) { const st = jnBody.querySelector('.steps'); if (st) st.scrollTop = 0; } });
    jnBody.querySelector('[data-track]')?.addEventListener('click', e => {
      const on = e.currentTarget.dataset.track === 'on'; opts.journalTrack?.(m.map, on ? q.id : null);
      jnMsg = on ? `TRACKING ${q.name.toUpperCase()}` : 'TRACKING OFF'; jnState = ''; drawJournal();
    });
  }
  // ---- ARMORY.EXE: tabs of gear (mods/armory), each laid out like PERKS.EXE (tiles left, details right) -----------
  const gearIcon = it => `<svg class="gear" viewBox="0 0 24 24" fill="none" stroke="${it.color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px ${it.color})"><path d="${it.icon ?? 'M7 12h10M12 7v10'}"/></svg>`;
  function armoryBuy(it) {
    const r = opts.armoryBuy?.(it.id) ?? 'ARMORY.EXE is not installed';
    amMsg = r === true ? [`${it.name.toUpperCase()} ISSUED`, 'ok'] : [String(r).toUpperCase(), 'bad'];
    amState = ''; status(); drawArmory();
  }
  function drawArmory() {
    if (amWin.hidden) return;
    const st = opts?.armory?.(); if (!st) { amBody.innerHTML = '<p>ARMORY.EXE is not installed.</p>'; return; }
    const key = JSON.stringify([st, amMsg, amTab, amShown]); if (key === amState) return; amState = key;
    const tab = st.tabs.find(t => t.id === amTab) ?? st.tabs[0];
    const tabs = `<div class="tabs">${st.tabs.map(t => `<button data-tab="${t.id}" class="${t.id === tab.id ? 'on' : ''} ${t.soon ? 'soon' : ''}">${esc(t.name)}</button>`).join('')}</div>`;
    const msg = `<div class="msg ${amMsg[1]}">${esc(amMsg[0] || (tab.soon ? '> OFFLINE' : st.power ? '> HOVER AN ITEM · CLICK TO BUY' : '> ACCESS DENIED · RESTORE MAINS POWER'))}</div>`;
    if (tab.soon || !tab.items.length) {
      amBody.innerHTML = `${tabs}<div class="soonbox">${esc(tab.name)}<br>COMING SOON</div>${msg}`;
    } else {
      const it = tab.items[Math.min(amShown, tab.items.length - 1)];
      const tag = i => i.why === 'home' ? 'BUILD HERE' : !i.unlocked ? 'LOCKED' : i.why === 'power' ? 'NO POWER' : '';
      const label = it.why === 'home' ? `BUILD IT HERE ON ${it.homeName.toUpperCase()}` : !it.unlocked ? 'LOCKED' : it.why === 'owned' ? 'OWNED'
        : it.why === 'power' ? 'NEEDS POWER' : it.why === 'points' ? 'NOT ENOUGH POINTS' : `BUY · ${it.price.toLocaleString()}`;
      const unlock = it.unlocked ? `<div class="status"><span>UNLOCKED · ${it.have.toLocaleString()} KILLS</span></div>`
        : `<h3>UNLOCK</h3><ul><li style="${it.found ? `color:${it.color}` : ''}">${it.found ? '[X]' : '[ ]'} Find it on ${esc(it.homeName)}</li>
           <li>${it.have.toLocaleString()} / ${it.kills.toLocaleString()} kills with it${it.found ? '' : ' (after finding it)'}</li></ul>
           <div class="prog"><i style="width:${100 * it.have / it.kills}%"></i></div>`;
      const shownBefore = amBody.querySelector('.tile.on')?.dataset.i;
      keepScroll(amBody).innerHTML = `${tabs}<div class="perks"><div class="left"><div class="grid">${tab.items.map((i, k) => `<button class="tile ${i.unlocked && i.why !== 'home' ? '' : 'locked'} ${i.owned ? 'owned' : ''} ${k === amShown ? 'on' : ''}" data-i="${k}" title="${esc(i.name)}">${gearIcon(i)}<span class="tag">${tag(i)}</span></button>`).join('')}</div>${msg}</div>
        <div class="detail"><div class="head"><div class="big" style="border-color:${it.color}">${gearIcon(it)}</div><div>
          <h2 style="color:${it.color}">${esc(it.name.toUpperCase())}</h2><div class="blurb">${esc(it.blurb)}</div><div class="price">${it.price.toLocaleString()} PTS</div></div></div>
          <button class="buy ${it.unlocked ? '' : 'locked'}" ${it.why ? 'disabled' : ''}>${label}</button>
          ${unlock}
          <h3>SPECS</h3><ul>${it.specs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="note">* Not sold on ${esc(it.homeName)}: build it there.</div></div></div>`;
      if (shownBefore !== undefined && +shownBefore !== amShown) amBody.querySelector('.detail').scrollTop = 0;   // a different item's details start at the top
      for (const t of amBody.querySelectorAll('.tile')) { t.addEventListener('mouseenter', () => { amShown = +t.dataset.i; drawArmory(); }); t.addEventListener('click', () => armoryBuy(tab.items[+t.dataset.i])); }
      amBody.querySelector('.buy').addEventListener('click', () => armoryBuy(it));
    }
    for (const b of amBody.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { amTab = b.dataset.tab; amShown = 0; amMsg = ['', '']; drawArmory(); });
  }
  // ---- BANK.EXE: TranZit's bank (mods/bank). Locked: the vault's build checklist and INVEST; open: deposit / withdraw --
  const pts = n => n.toLocaleString();
  function bankDo(action, amount) {
    const r = opts.bankAct?.(action, amount) ?? 'BANK.EXE is not installed';
    bkMsg = r === true ? [{ invest: 'INVESTMENT RECEIVED · THE VAULT GROWS', activate: 'VAULT ONLINE · WELCOME, VALUED CUSTOMER', deposit: 'DEPOSIT CLEARED', withdraw: 'CASH DISPENSED' }[action] ?? 'OK', 'ok'] : [String(r).toUpperCase(), 'bad'];
    bkState = ''; status(); drawBank();
  }
  function drawBank() {
    const st = opts?.bank?.();
    bkIcon.classList.toggle('off', !st?.unlocked);
    if (bkWin.hidden) return;
    if (!st) { bkBody.innerHTML = '<p>BANK.EXE is not installed.</p>'; return; }
    const key = JSON.stringify([st, bkMsg]); if (key === bkState) return; bkState = key;
    const off = !st.power, dis = c => off || !c ? 'disabled' : '';
    const power = off ? '<div class="warn">NO MAINS POWER · THE VAULT WON\'T RUN ON THE AUX BATTERY</div>' : '';
    const cheat = st.cheating ? '<div class="warn">CHEAT MODE · INVESTING AND DEPOSITS ARE LOCKED THIS GAME</div>' : '';
    const msg = `<div class="msg ${bkMsg[1]}">${esc(bkMsg[0] || (st.unlocked ? '> DEPOSIT OR WITHDRAW IN 1,000S' : '> INVEST POINTS TO BUILD THE VAULT'))}</div>`;
    let body;
    if (!st.unlocked) {
      const reqs = st.reqs.map(r => `<li class="${r.ok ? 'ok' : ''}">${esc(r.text)}<span class="have">${pts(Math.min(r.have, r.need))} / ${pts(r.need)}</span>
        ${r.id === 'invest' ? `<div class="bar2"><i style="width:${Math.min(100, 100 * r.have / r.need)}%"></i></div>` : ''}${r.detail ? `<small>${esc(r.detail.toUpperCase())}</small>` : ''}</li>`).join('');
      const can = n => !st.cheating && st.points >= n, all = Math.floor(st.points / st.step) * st.step;
      const room = st.reqs[0].need - st.invested, top = room > 0 ? Math.min(all, room) : all;
      body = `<h2>VAULT UNDER CONSTRUCTION</h2>
        <div class="note">A VAULT FOR THE DEDICATED. INVESTED POINTS BUILD IT AND ARE NEVER RETURNED. PROGRESS IS SAVED TO YOUR ACCOUNT.</div>
        ${power}${cheat}<ul>${reqs}</ul>
        ${st.ready ? `<button class="buy" data-act="activate" ${dis(true)}>ACTIVATE VAULT</button>`
          : `<div class="row"><b>INVEST</b><button class="buy" data-act="invest" data-n="1000" ${dis(can(1000))}>1,000</button>
             <button class="buy" data-act="invest" data-n="10000" ${dis(can(10000))}>10,000</button>
             <button class="buy" data-act="invest" data-n="max" ${dis(can(1000))}>ALL · ${pts(top)}</button></div>`}`;
    } else {
      const unit = st.step + st.fee, can = n => !st.cheating && st.points >= n / st.step * unit, most = Math.floor(st.points / unit) * st.step;
      body = `<h2>MELON SAVINGS &amp; LOAN</h2>${power}${cheat}
        <div class="bal">BALANCE <b>${pts(st.balance)}</b></div>
        <div class="row"><b>DEPOSIT</b><button class="buy" data-act="deposit" data-n="1000" ${dis(can(1000))}>1,000 · ${pts(unit)} PTS</button>
          <button class="buy" data-act="deposit" data-n="10000" ${dis(can(10000))}>10,000 · ${pts(10 * unit)} PTS</button>
          <button class="buy" data-act="deposit" data-n="max" ${dis(can(1000))}>MAX · ${pts(most)}</button></div>
        <div class="row"><b>WITHDRAW</b><button class="buy" data-act="withdraw" data-n="1000" ${dis(st.balance >= 1000)}>1,000</button>
          <button class="buy" data-act="withdraw" data-n="10000" ${dis(st.balance >= 10000)}>10,000</button>
          <button class="buy" data-act="withdraw" data-n="max" ${dis(st.balance > 0)}>ALL · ${pts(st.balance)}</button></div>
        <div class="note">* ${pts(unit)} POINTS IN FOR EVERY ${pts(st.step)} BANKED. WITHDRAWALS ARE FREE. YOUR BALANCE CARRIES ACROSS EVERY MAP AND MATCH.</div>
        <div class="note">LIFETIME · DEPOSITED ${pts(st.deposited)} · WITHDRAWN ${pts(st.withdrawn)}</div>`;
    }
    keepScroll(bkBody).innerHTML = body + msg;
    for (const b of bkBody.querySelectorAll('[data-act]')) b.addEventListener('click', () => bankDo(b.dataset.act, b.dataset.n === 'max' ? 'max' : +b.dataset.n || 0));
  }
  // ---- EXFIL.EXE --------------------------------------------------------------------------------------------
  const exfilStatus = () => opts?.exfil?.() ?? { available: false, reason: 'Exfil is not installed' };
  function drawExfil() {
    const st = exfilStatus(), key = JSON.stringify(st);
    exIcon.classList.toggle('off', !st.available); exIcon.classList.toggle('live', !!st.available);
    if (exWin.hidden || key === exState) return; exState = key;
    const rw = st.reward, xp = rw ? `<dt>REWARD</dt><dd>+${rw.account.toLocaleString()} XP · +${rw.cls.toLocaleString()} CLASS XP</dd>` : '';
    const when = `<dt>WINDOWS</dt><dd>START OF ROUND ${st.first ?? 11}, THEN EVERY ${st.every ?? 5} ROUNDS</dd>`;
    keepScroll(exBody).innerHTML = st.active
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
    drawExfil(); drawArsenal(); drawStark(); drawGums(); drawBank(); drawArmory(); drawJournal();
    $('[data-app=stark]').classList.toggle('off', !opts.stark?.()?.unlocked);
    $('.exlive').hidden = !exIcon.classList.contains('live');
  }
  function open(o) {
    opts = o; root.hidden = false; status(); clearInterval(clock); clock = setInterval(status, 250);
    const c = root.querySelector('.crt'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    layout();
    if (!win.hidden) { say('> SELECT A PERK'); renderGrid(); select(shown); }
    exState = ''; drawExfil();
    opts.onOpen?.();
  }
  function close() {
    if (root.hidden) return; root.hidden = true; clearInterval(clock); const o = opts; opts = null;
    o?.onClose?.();
  }
  // ---- Home screen: icons on a cell home, dragged into place like a phone's ---------------------------------------
  const desk = $('.desk'), appsEl = $('.apps'), cellsEl = $('.cells'), apps = [...appsEl.querySelectorAll('.app')];
  const PAD = 20, ICON_W = 96, ICON_H = 110, MIN_W = 108, MIN_H = 112, STORE = 'kino.mods.terminal';
  // default: shop apps down the left column, map apps up the right column (negative = from the far edge)
  const HOME = { perks: [0, 0], arsenal: [0, 1], stark: [0, 2], gums: [0, 3], journal: [-1, -4], armory: [-1, -3], bank: [-1, -2], exfil: [-1, -1] };
  let home = { cols: 1, rows: 1, cw: MIN_W, ch: MIN_H, key: '' }, cells = {}, drag = null, swallowClick = false;
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) ?? {}; } catch { return {}; } };
  const save = layout => { try { const d = load(); d.layout = { ...(d.layout ?? {}), [home.key]: layout }; localStorage.setItem(STORE, JSON.stringify(d)); } catch {} };
  const inGrid = ([c, r]) => c >= 0 && r >= 0 && c < home.cols && r < home.rows;
  function defaults() {   // HOME anchors, then any that clash or fall off the home take the first free cell
    const out = {}, used = new Set();
    for (const a of apps) {
      const h = HOME[a.dataset.app] ?? [0, 0], p = [h[0] < 0 ? home.cols + h[0] : h[0], h[1] < 0 ? home.rows + h[1] : h[1]];
      if (inGrid(p) && !used.has(p.join())) { out[a.dataset.app] = p; used.add(p.join()); }
    }
    for (const a of apps) {
      if (out[a.dataset.app]) continue;
      let p = null;
      for (let c = 0; c < home.cols && !p; c++) for (let r = 0; r < home.rows; r++) if (!used.has([c, r].join())) { p = [c, r]; break; }
      p ??= [home.cols - 1, home.rows - 1];   // more icons than cells (tiny screen): pile up in the last one
      out[a.dataset.app] = p; used.add(p.join());
    }
    return out;
  }
  function layout() {
    if (root.hidden) return;
    const w = Math.max(1, desk.clientWidth - PAD * 2), h = Math.max(1, desk.clientHeight - PAD * 2);
    const cols = Math.max(1, Math.floor(w / MIN_W)), rows = Math.max(1, Math.floor(h / MIN_H));
    home = { cols, rows, cw: w / cols, ch: h / rows, key: cols + 'x' + rows };
    desk.style.setProperty('--side', PAD + w / cols + 'px');   // app windows sit in the middle, one column in from each side
    const saved = load().layout?.[home.key], used = new Set();
    cells = defaults();
    if (saved) {   // saved cells win where they still fit and don't clash; the rest keep their default spot
      const def = cells; cells = {};
      for (const a of apps) { const p = saved[a.dataset.app]; if (Array.isArray(p) && inGrid(p) && !used.has(p.join())) { cells[a.dataset.app] = p; used.add(p.join()); } }
      for (const a of apps) if (!cells[a.dataset.app]) { let p = def[a.dataset.app]; if (used.has(p.join())) { p = null; for (let c = 0; c < cols && !p; c++) for (let r = 0; r < rows; r++) if (!used.has([c, r].join())) { p = [c, r]; break; } p ??= def[a.dataset.app]; } cells[a.dataset.app] = p; used.add(p.join()); }
    }
    cellsEl.innerHTML = '';
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const d = document.createElement('div'); d.className = 'cell'; d.dataset.cell = c + ',' + r;
      d.style.cssText = `left:${PAD + c * home.cw + 3}px;top:${PAD + r * home.ch + 3}px;width:${home.cw - 6}px;height:${home.ch - 6}px`; cellsEl.append(d);
    }
    place();
  }
  function place() { for (const a of apps) { const [c, r] = cells[a.dataset.app]; a.style.left = PAD + c * home.cw + (home.cw - ICON_W) / 2 + 'px'; a.style.top = PAD + r * home.ch + (home.ch - ICON_H) / 2 + 'px'; } }
  const cellAt = (x, y) => { const b = desk.getBoundingClientRect(); const c = Math.floor((x - b.left - PAD) / home.cw), r = Math.floor((y - b.top - PAD) / home.ch); return inGrid([c, r]) ? [c, r] : null; };
  const nameAt = p => p && apps.find(a => cells[a.dataset.app].join() === p.join())?.dataset.app;
  function beginDrag() {
    if (!drag || drag.active) return;
    drag.active = true; clearTimeout(drag.timer); drag.btn.classList.add('drag'); desk.classList.add('arranging'); moveDrag(drag.x, drag.y);
  }
  function moveDrag(x, y) {
    drag.x = x; drag.y = y; if (!drag.active) return;
    drag.btn.style.left = drag.left + x - drag.sx + 'px'; drag.btn.style.top = drag.top + y - drag.sy + 'px';
    const p = cellAt(x, y); for (const d of cellsEl.children) d.classList.toggle('hot', !!p && d.dataset.cell === p.join());
  }
  function endDrag(x, y, cancel) {
    const d = drag; drag = null; if (!d) return; clearTimeout(d.timer);
    if (!d.active) return;
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    d.btn.classList.remove('drag'); desk.classList.remove('arranging');
    const to = cancel ? null : cellAt(x, y), me = d.btn.dataset.app;
    if (to && to.join() !== cells[me].join()) {
      const other = nameAt(to); if (other) cells[other] = cells[me];   // swap with whatever sits there
      cells[me] = to; save(cells);
    }
    place();
  }
  appsEl.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.app'); if (!btn || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { btn, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, left: parseFloat(btn.style.left) || 0, top: parseFloat(btn.style.top) || 0, active: false, id: e.pointerId,
      timer: setTimeout(beginDrag, 380) };   // hold to pick up (touch), or just drag
    try { btn.setPointerCapture(e.pointerId); } catch {}
  });
  appsEl.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; if (!drag.active && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) beginDrag(); moveDrag(e.clientX, e.clientY); });
  appsEl.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) endDrag(e.clientX, e.clientY, false); });
  appsEl.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) endDrag(0, 0, true); });
  appsEl.addEventListener('click', e => { const btn = e.target.closest('.app'); if (!btn || swallowClick) return; openApp(btn.dataset.app); });
  new ResizeObserver(() => layout()).observe(desk);
  root.querySelector('[data-reset]').addEventListener('click', () => { try { const d = load(); delete d.layout?.[home.key]; localStorage.setItem(STORE, JSON.stringify(d)); } catch {} layout(); });

  for (const b of root.querySelectorAll('[data-close]')) b.addEventListener('click', closeApp);
  root.querySelector('[data-logoff]').addEventListener('click', close);
  return { open, close, isOpen: () => !root.hidden };
}

// Bloodstreaks (2026-11-22, user: scorestreaks renamed, "blood streaks should be expensive", the rake trap first, unlocked
// on Nuketown). Kills fill a blood meter: 1 a kill, 1.5 a headshot, 2 a melee kill (kills by your own rakes don't count,
// except through the Blood Harvest augment). Up to three streaks are equipped in ARMORY.EXE (mods/armory, the BLOODSTREAKS
// tab: each is earned on its home map first, then N kills with it); their costs are thresholds on one meter, cheapest
// first, as in Black Ops: reaching a cost earns that streak, and reaching the dearest one starts the meter over. Earned
// streaks are banked (two of each at most) on the command wheel (hold U) until used. Going down drains the meter; banked
// streaks are kept. Each streak has a Research track (research.json, kind 'bloodstreak': rake.* numbers via kino.equipAug).
// HUD: the equipped streaks, each filling with blood toward its cost (no blur: painted at load), then the rakes in hand.
// A column on the right in the classic layout; hud-bo7 moves #bloodstreaks above the gun, a row beside the gobblegums.
// window.kino.bloodstreaks: {blood, add(n), refresh(), earned, slots, give(id)}
import { equippedStreaks, STREAKS } from '../armory/mod.js';
import { setupRakes, RAKE_ICON } from './rake.js';
import { cloudReady } from '../../profile.js';

const BANK = 2;
const ICONS = { rake_trap: RAKE_ICON };
const css = `#bloodstreaks{position:fixed;right:26px;top:40%;z-index:3;display:flex;flex-direction:column;align-items:flex-end;gap:7px;pointer-events:none;
  font:600 13px/1 'Barlow Condensed','Arial Narrow',Arial,sans-serif;color:#ece8de;text-shadow:0 1px 3px #000c}
body.menu-open #bloodstreaks{visibility:hidden}
#bloodstreaks .row{display:flex;flex-direction:column;align-items:flex-end;gap:7px}
#bloodstreaks .row:empty,#bloodstreaks .n:empty{display:none}
#bloodstreaks .bs{position:relative;width:46px;height:46px;background:#0009;border:1px solid #ffffff38}
#bloodstreaks .bs::before{content:"";position:absolute;inset:0;background:#8e1a10;opacity:.75;clip-path:inset(calc((1 - var(--f,0)) * 100%) 0 0 0)}
#bloodstreaks .bs img{position:absolute;inset:5px;width:36px;height:36px;object-fit:contain}
#bloodstreaks .bs b{position:absolute;left:-30px;bottom:2px;width:26px;text-align:right;color:#a9a397;font-size:12px}
#bloodstreaks .bs i{position:absolute;right:-1px;top:-1px;padding:2px 4px;background:#d0402e;color:#fff;font-style:normal;font-size:12px;text-shadow:none;display:none}
#bloodstreaks .bs.ready{border-color:#ff6a4f}#bloodstreaks .bs.ready::before{opacity:.95}#bloodstreaks .bs.ready i{display:block}
#bloodstreaks .n{letter-spacing:1px;color:#d9a59c}
#bloodstreaks .hand{display:flex;align-items:center;gap:5px;color:#ffe9c0;letter-spacing:1px}
#bloodstreaks .hand[hidden]{display:none}
#bloodstreaks .hand img{width:24px;height:24px;object-fit:contain}
#bloodstreaks .hand kbd{font:inherit;font-size:11px;padding:1px 4px;border:1px solid #ffffff66;color:#fff;text-shadow:none}`;

export default async function setup(api) {
  const { host, session } = api;
  await cloudReady;
  const kino = window.kino;
  const rakes = await setupRakes(api);
  const S = { blood: 0, earned: {}, slots: [] };
  const top = () => S.slots.at(-1)?.cost ?? 0;
  const icon = id => ICONS[id] ?? '';

  // ---- the HUD column
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const el = document.createElement('div'); el.id = 'bloodstreaks'; el.hidden = true; document.body.append(el);
  el.innerHTML = `<div class="row"></div><div class="n"></div><div class="hand" hidden><img src="${RAKE_ICON}" alt=""><span></span><kbd></kbd></div>`;
  const row = el.querySelector('.row'), hand = el.querySelector('.hand');
  // rakes in hand (a streak's or one from Nuketown's stations): a chip with the count and the key that places them
  function paintHand(n = rakes.hand) {
    hand.hidden = !(n > 0); if (n > 0) { hand.querySelector('span').textContent = `RAKE ×${n}`; hand.querySelector('kbd').textContent = rakes.keyName?.() ?? '4'; }
    el.hidden = !S.slots.length && hand.hidden;
  }
  rakes.onHand = () => paintHand();
  let built = '', painted = '';
  function build(slots) {
    const key = slots.map(s => s.id).join(); if (key === built) return; built = key; painted = '';
    row.innerHTML = [...slots].reverse().map(s => `<div class="bs" data-id="${s.id}"><img src="${icon(s.id)}" alt=""><b>${s.cost}</b><i></i></div>`).join('');
  }
  function paint(force) {
    paintHand(); if (!S.slots.length) { build([]); el.querySelector('.n').textContent = ''; return; }
    build(S.slots);
    const key = Math.floor(S.blood * 2) + '|' + S.slots.map(s => S.earned[s.id] ?? 0).join(); if (key === painted && !force) return; painted = key;
    let prev = 0;
    for (const s of S.slots) {
      const box = el.querySelector(`.bs[data-id="${s.id}"]`), n = S.earned[s.id] ?? 0;
      box.style.setProperty('--f', Math.min(1, Math.max(0, (S.blood - prev) / (s.cost - prev))).toFixed(3)); prev = s.cost;
      box.classList.toggle('ready', n > 0); box.querySelector('i').textContent = n > 1 ? '×' + n : 'U';
    }
    el.querySelector('.n').textContent = `${Math.floor(S.blood)} / ${top()} BLOOD`;
  }
  host.on('warmHud', on => {
    if (!on) { paint(true); return; }
    build(S.slots.length ? S.slots : STREAKS.slice(0, 1)); el.hidden = false;
    for (const box of el.querySelectorAll('.bs')) { box.style.setProperty('--f', .5); box.classList.add('ready'); box.querySelector('i').textContent = '×2'; }
    el.querySelector('.n').textContent = '30 / 60 BLOOD'; paintHand(3); el.hidden = false;
  });

  // ---- the meter
  function refresh() {
    S.slots = equippedStreaks();
    if (S.blood > top()) S.blood = 0;
    paint(true);
  }
  function earn(s) {
    const n = S.earned[s.id] ?? 0;
    if (n >= BANK) { api.toast?.(`${s.name}: ${BANK} already waiting, use one (hold U)`, 3); return; }
    S.earned[s.id] = n + 1;
    api.announce?.(s.name.toUpperCase(), 'BLOODSTREAK READY · HOLD U', 3);
  }
  function add(n) {
    if (!(n > 0) || !S.slots.length || session.phase === 'reviving' || session.phase === 'gameover') return;
    const was = S.blood; S.blood += n;
    for (const s of S.slots) if (was < s.cost && S.blood >= s.cost) earn(s);
    if (S.blood >= top()) S.blood -= top();   // the dearest one reached: the meter starts over (what's past it carries)
    paint();
  }
  host.on('kill', e => {
    if (e.remote || rakes.takeTrapKill()) return;
    add(1 + (e.head ? .5 : 0) + (e.melee ? 1 : 0));
  });
  let wasDown = false;
  host.on('update', () => {
    const down = session.phase === 'reviving';
    if (down && !wasDown && S.blood > 0) { S.blood = 0; paint(); api.toast?.('Bloodstreak meter drained', 2.5); }
    wasDown = down;
  });
  host.on('reset', () => { S.blood = 0; S.earned = {}; refresh(); });

  // ---- using them: the command wheel
  const USE = {
    rake_trap: () => rakes.ready ? rakes.give(3 + Math.round(kino.equipAug?.('rake.extra') ?? 0)) : (api.toast?.('The rake model is missing', 2), false),
  };
  function give(id) {
    if (!(S.earned[id] > 0)) return false;
    if (session.phase === 'reviving') { api.toast?.('Not while you are down', 2); return false; }
    if (!USE[id]?.()) return false;
    S.earned[id]--; paint(); return true;
  }
  const wheel = () => S.slots.filter(s => S.earned[s.id] > 0).map(s => ({
    label: s.name, sub: `Bloodstreak${S.earned[s.id] > 1 ? ' ×' + S.earned[s.id] : ''}`, icon: icon(s.id), color: s.color, use: () => give(s.id),
  }));
  const register = () => { if (kino.commandWheel) kino.commandWheel.add('bloodstreaks', wheel); else setTimeout(register, 300); };
  register();

  refresh();
  kino.bloodstreaks = { get blood() { return S.blood; }, get earned() { return { ...S.earned }; }, get slots() { return S.slots.map(s => s.id); }, add, refresh, give,
    active: id => id === 'rake_trap' && (rakes.hand > 0 || rakes.mineOut() > 0) };
}

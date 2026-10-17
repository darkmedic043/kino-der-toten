// The Bank (BANK.EXE on the terminal booth): TranZit's bank, for dedicated players. The vault is built first, by
// investing points (gone for good) until every requirement in CFG.unlock is met, then ACTIVATE VAULT opens it.
// Once open, deposits cost 1,100 points per 1,000 banked (TranZit's fee, moved to the deposit side) and withdrawals are
// free. The balance is account-wide (every map, every match) in kino.mods.bank, cloud-synced via cloud.js TRACKED.
// Everything needs mains power (no aux battery). Cheat games can't invest or deposit.
// window.kino.bank: {status(), act(action, amount) -> true | 'reason'} is what the terminal talks to.
import { loadProfile, cloudReady, unlockLvl } from '../../profile.js';

export const CFG = {
  step: 1000,            // points move in 1,000s
  fee: 100,              // per 1,000 deposited: 1,100 in, 1,000 banked
  unlock: {
    invest: 1000000,     // total points sunk into building the vault, over any number of matches
    maps: 3, mapMin: 50000,   // at least mapMin of it invested on each of `maps` different maps
    match: 150000,       // invested in one match
    round: 30,           // best round on any map (the profile's, which cheat games never set)
    level: 55,           // player level (prestige keeps it: unlockLvl)
  },
};
const KEY = 'kino.mods.bank';
// read fresh for every action (another tab or a cloud pull may have changed it)
export function loadBank() {
  const empty = { invested: 0, maps: {}, bestMatch: 0, unlocked: false, balance: 0, deposited: 0, withdrawn: 0 };
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s ? { ...empty, ...s, maps: { ...s.maps } } : empty; } catch { return empty; }
}
const saveBank = b => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {} };

// the unlock checklist for a bank state, profile and this match's investment
export function requirements(b, profile, match = 0) {
  const u = CFG.unlock, maps = Object.entries(b.maps).filter(([, m]) => m.n >= u.mapMin);
  return [
    { id: 'invest', text: `Invest ${u.invest.toLocaleString()} points in the vault`, have: b.invested, need: u.invest },
    { id: 'maps', text: `Invest ${u.mapMin.toLocaleString()}+ on ${u.maps} different maps`, have: maps.length, need: u.maps,
      detail: Object.values(b.maps).map(m => `${m.name} ${m.n.toLocaleString()}`).join(' · ') },
    { id: 'match', text: `Invest ${u.match.toLocaleString()} in a single match`, have: Math.max(b.bestMatch, match), need: u.match,
      detail: `best ${b.bestMatch.toLocaleString()} · this match ${match.toLocaleString()}` },
    { id: 'round', text: `Reach round ${u.round} on any map`, have: profile.bestRound ?? 0, need: u.round },
    { id: 'level', text: `Reach level ${u.level} (or prestige)`, have: unlockLvl(profile), need: u.level },
  ].map(r => ({ ...r, ok: r.have >= r.need }));
}

export default async function setup(api) {
  const { session, host } = api;
  await cloudReady;
  const mapId = api.map?.id ?? 'kino', mapName = api.map?.title ?? mapId;
  let match = 0;   // invested this match
  host.on('reset', () => { match = 0; });
  const cheating = () => !!globalThis.kino?.cheats?.used;

  function status() {
    const b = loadBank(), reqs = requirements(b, loadProfile(), match);
    return { ...b, reqs, ready: reqs.every(r => r.ok), match, power: !!session.power, points: session.points, step: CFG.step, fee: CFG.fee,
      cheating: cheating(), map: mapName };
  }
  // Points are taken straight off session.points, not session.spend: Shopping Free (a gum) wraps spend to make
  // purchases free, which would print money here.
  function take(n) { if (!(n > 0) || session.points < n) return false; session.points -= n; return true; }

  // action: 'invest' | 'activate' | 'deposit' | 'withdraw'; amount: points to move (rounded down to 1,000s), or 'max'
  function act(action, amount) {
    if (!session.power) return 'No mains power · the vault won\'t run on the aux battery';
    if (session.phase === 'reviving' || session.phase === 'gameover') return 'Terminal busy';
    const b = loadBank(), step = CFG.step, steps = n => Math.floor(n / step) * step;
    if (action === 'activate') {
      if (b.unlocked) return 'The vault is already open';
      const left = requirements(b, loadProfile(), match).filter(r => !r.ok);
      if (left.length) return left[0].text;
      b.unlocked = true; b.unlockedAt = Date.now(); saveBank(b);
      api.toast('THE BANK IS OPEN', 4); return true;
    }
    if (action === 'invest') {
      if (b.unlocked) return 'The vault is already built';
      if (cheating()) return 'Cheat games can\'t invest';
      const room = CFG.unlock.invest - b.invested;
      // the last 1M only needs topping up; past it, investing still counts toward the per-map and single-match goals
      const n = Math.min(amount === 'max' ? steps(session.points) : steps(amount), room > 0 ? room : Infinity);
      if (n < step) return 'Not enough points';
      if (!take(n)) return 'Not enough points';
      b.invested += n; match += n; b.bestMatch = Math.max(b.bestMatch, match);
      const m = b.maps[mapId] ??= { name: mapName, n: 0 }; m.n += n; m.name = mapName;
      saveBank(b); return true;
    }
    if (!b.unlocked) return 'The vault is still under construction';
    if (action === 'deposit') {
      if (cheating()) return 'Cheat games can\'t deposit';
      const unit = step + CFG.fee, n = (amount === 'max' ? Math.floor(session.points / unit) : Math.floor(amount / step)) * step;
      if (n < step || !take(n / step * unit)) return 'Not enough points';
      b.balance += n; b.deposited += n; saveBank(b); return true;
    }
    if (action === 'withdraw') {
      const n = Math.min(amount === 'max' ? b.balance : steps(amount), b.balance);
      if (n <= 0) return b.balance ? 'Withdraw at least 1,000' : 'Your balance is empty';
      b.balance -= n; b.withdrawn += n; saveBank(b);
      session.points += n; return true;
    }
    return 'Unknown action';
  }
  window.kino ??= {};
  window.kino.bank = { status, act };
}

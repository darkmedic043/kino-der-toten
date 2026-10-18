// The Bank (BANK.EXE on the terminal booth): TranZit's bank, for dedicated players. Since 2026-10-18 (user) the vault
// opens with account Prestige Master (mods/prestige: the prestige after Prestige X) and nothing else: no investing.
// Vaults opened the old way (investing points, 2026-10-17) stay open. Once open, deposits cost 1,100 points per 1,000
// banked (TranZit's fee, moved to the deposit side) and withdrawals are free. The balance is account-wide (every map,
// every match) in kino.mods.bank, cloud-synced via cloud.js TRACKED.
// Everything needs mains power (no aux battery). Cheat games can't deposit.
// window.kino.bank: {status(), act(action, amount) -> true | 'reason'} is what the terminal talks to.
import { cloudReady } from '../../profile.js';
import { loadPrestige, isPrestigeMaster, prestigeName, RULES as PRESTIGE } from '../prestige/prestige.js';

export const CFG = {
  step: 1000,            // points move in 1,000s
  fee: 100,              // per 1,000 deposited: 1,100 in, 1,000 banked
};
const KEY = 'kino.mods.bank';
// read fresh for every action (another tab or a cloud pull may have changed it)
export function loadBank() {
  const empty = { invested: 0, maps: {}, bestMatch: 0, unlocked: false, balance: 0, deposited: 0, withdrawn: 0 };
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s ? { ...empty, ...s, maps: { ...s.maps } } : empty; } catch { return empty; }
}
const saveBank = b => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {} };

// The bank state, opened (and saved open) once the account has Prestige Master. `prestige` is where the account stands.
export function bankState(prestige = loadPrestige().player.prestige) {
  const b = loadBank();
  if (!b.unlocked && isPrestigeMaster(prestige)) { b.unlocked = true; b.unlockedAt = Date.now(); b.by = 'prestige-master'; saveBank(b); }
  return { ...b, prestige, master: PRESTIGE.playerMax + 1, prestigeName: prestige ? prestigeName(prestige) : 'NO PRESTIGE' };
}

export default async function setup(api) {
  const { session, host } = api;
  await cloudReady;
  const cheating = () => !!globalThis.kino?.cheats?.used;

  function status() {
    return { ...bankState(), power: !!session.power, points: session.points, step: CFG.step, fee: CFG.fee, cheating: cheating() };
  }
  // Points are taken straight off session.points, not session.spend: Shopping Free (a gum) wraps spend to make
  // purchases free, which would print money here.
  const strip = ({ prestige, master, prestigeName, ...b }) => b;   // bankState's extra fields aren't stored
  function take(n) { if (!(n > 0) || session.points < n) return false; session.points -= n; return true; }

  // action: 'invest' | 'activate' | 'deposit' | 'withdraw'; amount: points to move (rounded down to 1,000s), or 'max'
  function act(action, amount) {
    if (!session.power) return 'No mains power · the vault won\'t run on the aux battery';
    if (session.phase === 'reviving' || session.phase === 'gameover') return 'Terminal busy';
    const b = bankState(), step = CFG.step, steps = n => Math.floor(n / step) * step;
    if (!b.unlocked) return 'The vault opens at Prestige Master';
    if (action === 'deposit') {
      if (cheating()) return 'Cheat games can\'t deposit';
      const unit = step + CFG.fee, n = (amount === 'max' ? Math.floor(session.points / unit) : Math.floor(amount / step)) * step;
      if (n < step || !take(n / step * unit)) return 'Not enough points';
      b.balance += n; b.deposited += n; saveBank(strip(b)); return true;
    }
    if (action === 'withdraw') {
      const n = Math.min(amount === 'max' ? b.balance : steps(amount), b.balance);
      if (n <= 0) return b.balance ? 'Withdraw at least 1,000' : 'Your balance is empty';
      b.balance -= n; b.withdrawn += n; saveBank(strip(b));
      session.points += n; return true;
    }
    return 'Unknown action';
  }
  window.kino ??= {};
  window.kino.bank = { status, act };
}

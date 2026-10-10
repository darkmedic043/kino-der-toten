// Account unlocks for STARK.EXE (profile.rewards in kino.mods.progression, cloud-synced like the Swiss Cheese camo).
// Earned on Cheese Cube, used on every other map:
//   stark       building the six Iron Man parts in the Hall of Armors: STARK.EXE and the Iron Man line (Mk I, III, IV, V, VI)
//   stark_wm    finishing the trivia: the War Machine
//   stark_mk16  beating the map (the hammer ending) 5 times: the Mark XVI Nightclub; ccWins counts the wins
// A game where the cheat console was used earns nothing.
import { loadProfile, saveProfile } from '../../profile.js';

export const WINS_FOR_MK16 = 5;
export const rewards = () => loadProfile().rewards ?? {};
const cheating = () => !!window.kino?.cheats?.used;

// set reward flags (and other reward fields); returns the keys that were newly earned
export function grant(fields) {
  if (cheating()) return [];
  const fresh = loadProfile(), had = fresh.rewards ?? {}, news = Object.keys(fields).filter(k => fields[k] === true && !had[k]);
  fresh.rewards = { ...had, ...fields }; saveProfile(fresh);
  const wl = window.kino?.weaponLevels; if (wl?.profile) wl.profile.rewards = { ...wl.profile.rewards, ...fields };   // keep other cached copies in step
  return news;
}
// one more Cheese Cube win; unlocks the Mark XVI at WINS_FOR_MK16
export function addWin() {
  if (cheating()) return { wins: rewards().ccWins ?? 0, news: [] };
  const wins = (rewards().ccWins ?? 0) + 1;
  return { wins, news: grant({ ccWins: wins, ...(wins >= WINS_FOR_MK16 ? { stark_mk16: true } : {}) }) };
}

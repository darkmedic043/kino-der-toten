// Shared by the career mod (in game) and the main menu's CAREER tab.
import { loadProfile } from '../../profile.js';
export const CAREER_KEY='kino.mods.career';
// Stats recorded before the career mod existed live in the profile (kills, games, best round):
// they seed the lifetime totals once.
export function loadCareer(){
  let c;try{c=JSON.parse(localStorage.getItem(CAREER_KEY))??{};}catch{c={};}
  c.total??={};c.maps??={};c.weapons??={};
  if(!c.seeded){const p=loadProfile();c.seeded=true;
    c.total.kills=Math.max(c.total.kills??0,p.kills??0);c.total.games=Math.max(c.total.games??0,p.games??0);c.total.bestRound=Math.max(c.total.bestRound??0,p.bestRound??0);}
  return c;
}

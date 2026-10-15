// The Melon Pass (roadmap Phase 7, BO6/BO7 style), shared by the main menu's PASS tab and the game.
// A season (season.json) is pages of 9 tier rewards plus a major reward. Pass XP earns tiers (tierXp each); every tier is a
// token. Spend a token on any reward of an open page, in any order, or let auto-progress spend them in page order. A page is
// complete when all 9 are unlocked: its major reward is granted and the next page opens. Premium rewards need the premium
// pass (credits); without it a token still unlocks them (the page progresses) and they're handed over when premium is bought.
// Store: kino.mods.pass = {season, xp, bought, auto, premium, unlocked:{rewardId:true}, granted:{rewardId:true},
//   boosts:{passXp, weaponXp, researchXp} (matches left at double XP), gums:[ids unlocked early], archive:[...]},
// cloud-synced (cloud.js TRACKED). Rewards go through the reward registry (shop.js grantReward) or the pass's own types.
import { grantReward } from '../shop/shop.js';
import { loadCredits, saveCredits, change } from '../credits/credits.js';

export const PASS_KEY='kino.mods.pass';
export async function loadSeason(base=import.meta.url){const r=await fetch(new URL('season.json',base));if(!r.ok)throw new Error('season.json HTTP '+r.status);return r.json();}
export function loadPass(){
  let p;try{p=JSON.parse(localStorage.getItem(PASS_KEY));}catch{}p=p&&typeof p==='object'?p:{};
  return {season:p.season??null,xp:+p.xp||0,bought:+p.bought||0,auto:p.auto??true,premium:!!p.premium,unlocked:{...p.unlocked},granted:{...p.granted},
    boosts:{passXp:0,weaponXp:0,researchXp:0,...p.boosts},gums:Array.isArray(p.gums)?p.gums:[],archive:Array.isArray(p.archive)?p.archive:[]};
}
export function savePass(p){try{localStorage.setItem(PASS_KEY,JSON.stringify(p));}catch{}window.dispatchEvent?.(new CustomEvent('kino-pass'));}

// A new season: the old track is archived (owned items, gums and boosts stay), progress starts over.
export function ensureSeason(season,p){
  if(p.season===season.id)return false;
  if(p.season)p.archive.push({season:p.season,xp:p.xp,premium:p.premium,unlocked:Object.keys(p.unlocked).length});
  Object.assign(p,{season:season.id,xp:0,bought:0,premium:false,unlocked:{},granted:{}});return true;
}
export const seasonEnd=season=>new Date(season.end+'T23:59:59');
export const allItems=season=>season.pages.flatMap((pg,pi)=>pg.items.map(it=>({...it,page:pi})));
export const tiersEarned=(season,p)=>Math.min(allItems(season).length,Math.floor(p.xp/season.tierXp));
export const tokens=(season,p)=>tiersEarned(season,p)+p.bought-season.pages.reduce((a,pg)=>a+pg.items.filter(it=>p.unlocked[it.id]).length,0);
export const pageDone=(season,p,pi)=>season.pages[pi].items.every(it=>p.unlocked[it.id]);
export const pageOpen=(season,p,pi)=>pi===0||pageDone(season,p,pi-1);
const itemOf=(season,id)=>{for(const [pi,pg] of season.pages.entries()){const it=pg.items.find(x=>x.id===id);if(it)return {...it,page:pi};if(pg.major.id===id)return {...pg.major,page:pi,major:true};}return null;};

// Hand a reward over (once). Returns true when something was granted.
function give(season,p,entry){
  if(p.granted[entry.id])return false;const r=entry.reward;
  if(r.type==='item')grantReward('item',r.id);
  else if(r.type==='credits'){const c=loadCredits();change(c,r.amount,`Melon Pass ${season.name}: ${entry.id}`);saveCredits(c);}
  else if(r.type==='token')p.boosts[r.kind]=(p.boosts[r.kind]??0)+r.matches;
  else if(r.type==='gum'){if(!p.gums.includes(r.id))p.gums.push(r.id);}
  p.granted[entry.id]=true;return true;
}
// Spend a token on a reward. Returns {granted:[entries], held:bool (premium, waiting for the pass), major:entry|null} or a reason.
export function unlock(season,p,id){
  const it=itemOf(season,id);if(!it||it.major)return 'Not a tier reward';if(p.unlocked[id])return 'Already unlocked';
  if(!pageOpen(season,p,it.page))return 'Finish the page before it first';if(tokens(season,p)<=0)return 'No tokens: earn pass tiers by playing, or buy one';
  p.unlocked[id]=true;const out={granted:[],held:false,major:null};
  if(!it.premium||p.premium){if(give(season,p,it))out.granted.push(it);}else out.held=true;
  if(pageDone(season,p,it.page)){const m=season.pages[it.page].major;if(give(season,p,m)){out.granted.push(m);out.major=m;}}
  return out;
}
// The next reward auto-progress would take: the first locked one, in order, on the first open page that isn't done.
export function nextAuto(season,p){for(const [pi,pg] of season.pages.entries()){if(!pageOpen(season,p,pi))return null;const it=pg.items.find(x=>!p.unlocked[x.id]);if(it)return it;}return null;}
export function autoSpend(season,p){const out=[];if(!p.auto)return out;while(tokens(season,p)>0){const it=nextAuto(season,p);if(!it)break;const r=unlock(season,p,it.id);if(typeof r==='string')break;out.push(r);}return out;}
export function buyPremium(season,p){
  if(p.premium)return 'You have the premium pass';const c=loadCredits();if(!change(c,-season.premiumPrice,`Melon Pass ${season.name}: premium`))return `Not enough credits (${season.premiumPrice.toLocaleString()} needed)`;
  saveCredits(c);p.premium=true;const out=[];
  for(const it of allItems(season))if(p.unlocked[it.id]&&give(season,p,it))out.push(it);   // everything already unlocked on the premium track
  return out;
}
export function buyToken(season,p){const c=loadCredits();if(!change(c,-season.tokenPrice,`Melon Pass ${season.name}: tier token`))return `Not enough credits (${season.tokenPrice} needed)`;saveCredits(c);p.bought++;return null;}
// Pass XP. Returns how many tiers it crossed.
export function addXp(season,p,n){const before=tiersEarned(season,p);p.xp+=Math.max(0,Math.round(n));return tiersEarned(season,p)-before;}

// what a reward is, for the UI: {title, sub, kind}
export function describe(r,{catalog,gums}={}){
  if(r.type==='item'){const i=catalog?.items.find(x=>x.id===r.id);return {title:i?.name??r.id,sub:{camo:'CAMO',outfit:'OUTFIT',reticle:'RETICLE & HITS',theme:'THEME',sound:'SOUND SET',glow:'MAP GLOW',card:'CALLING CARD'}[i?.cat]??'ITEM',item:i};}
  if(r.type==='credits')return {title:`${r.amount} Credits`,sub:'CREDITS'};
  if(r.type==='token')return {title:`Double ${{passXp:'Pass',weaponXp:'Weapon',researchXp:'Research'}[r.kind]} XP`,sub:`NEXT ${r.matches} MATCH${r.matches>1?'ES':''}`};
  if(r.type==='gum'){const g=gums?.gums.find(x=>x.id===r.id);return {title:g?.name??r.id,sub:`GOBBLEGUM · ${(g?.rarity??'').toUpperCase()} · SEASON EXCLUSIVE`,desc:g?.desc};}
  return {title:'?',sub:''};
}

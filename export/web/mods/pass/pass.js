// The Melon Pass (roadmap Phase 7, BO6/BO7 style), shared by the main menu's PASS tab and the game.
// A season (season files listed in seasons.json) is pages of 9 tier rewards plus a major reward. Pass XP earns tiers (tierXp
// each); every tier is a token. Spend a token on any reward of an open page, in any order, or let auto-progress spend them in
// page order. A page is complete when all 9 are unlocked: its major reward is granted and the next page opens. Premium rewards
// need that season's premium pass (credits); without it a token still unlocks them (the page progresses) and they're handed
// over when premium is bought.
// Past seasons never expire (Marvel Rivals style): every season keeps its own progress, tokens are one pool across seasons
// (pass XP always goes to the live season; tiers past its last reward still give tokens), and any token can be spent on any
// season that has started. Auto-progress spends on the "active" pass: the live season, or a past one the player picked
// (until the next season goes live).
// Store: kino.mods.pass = {v:2, auto, track:{id, live}, seasons:{<id>:{xp, bought, premium, unlocked:{rewardId:true},
//   granted:{rewardId:true}}}, boosts:{passXp, weaponXp, researchXp} (matches left at double XP), gums:[pass gum ids],
//   archive:[summaries from before v2]}, cloud-synced (cloud.js TRACKED). Older saves (one flat season) migrate on load.
// Most rules take S = loadSeasons()'s {list, current}. Rewards go through the reward registry (shop.js grantReward) or the
// pass's own types.
import { grantReward } from '../shop/shop.js';
import { loadCredits, saveCredits, change } from '../credits/credits.js';

export const PASS_KEY='kino.mods.pass';
const getJson=async u=>{const r=await fetch(u);if(!r.ok)throw new Error(u.pathname.split('/').pop()+' HTTP '+r.status);return r.json();};
const today=()=>new Date().toLocaleDateString('en-CA');   // local YYYY-MM-DD
// Every season that has started, oldest first, and the live one (the newest started). A season file whose start is still to
// come stays hidden, so the next season can be dropped in ahead of time and goes live on its own.
export async function loadSeasons(base=import.meta.url){
  const idx=await getJson(new URL('seasons.json',base)).catch(()=>({seasons:['season.json']}));
  const all=(await Promise.all(idx.seasons.map(f=>getJson(new URL(f,base)).catch(e=>{console.warn('[pass]',f,e);return null;})))).filter(Boolean);
  return seasonsFrom(all);
}
export function seasonsFrom(all,day=today()){
  const list=all.filter(s=>s.start<=day).sort((a,b)=>a.start<b.start?-1:1);if(!list.length&&all.length)list.push(all[0]);
  return {list,current:list.at(-1)};
}
export async function loadSeason(base=import.meta.url){return (await loadSeasons(base)).current;}   // the live season
const blank=()=>({xp:0,bought:0,premium:false,unlocked:{},granted:{}});
export function loadPass(){
  let p;try{p=JSON.parse(localStorage.getItem(PASS_KEY));}catch{}p=p&&typeof p==='object'?p:{};
  const seasons={};for(const [id,r] of Object.entries(p.seasons??{})){seasons[id]={xp:+r.xp||0,bought:+r.bought||0,premium:!!r.premium,unlocked:{...r.unlocked},granted:{...r.granted}};if(Number.isFinite(r.earned))seasons[id].earned=r.earned;}
  if(p.season&&!seasons[p.season])seasons[p.season]={xp:+p.xp||0,bought:+p.bought||0,premium:!!p.premium,unlocked:{...p.unlocked},granted:{...p.granted}};   // v1: one flat season
  return {v:2,auto:p.auto??true,track:p.track??null,seasons,boosts:{passXp:0,weaponXp:0,researchXp:0,...p.boosts},gums:Array.isArray(p.gums)?p.gums:[],archive:Array.isArray(p.archive)?p.archive:[],forfeit:+p.forfeit||0};
}
export function savePass(p){try{localStorage.setItem(PASS_KEY,JSON.stringify(p));}catch{}window.dispatchEvent?.(new CustomEvent('kino-pass'));}

// one season's progress (made on first use)
export const rec=(p,season)=>p.seasons[season.id]??=blank();
export const isLive=(S,season)=>season.id===S.current.id;
export const seasonEnd=season=>new Date(season.end+'T23:59:59');
export const allItems=season=>season.pages.flatMap((pg,pi)=>pg.items.map(it=>({...it,page:pi})));
const tierCount=season=>season.pages.reduce((a,pg)=>a+pg.items.length,0);
const tiersRaw=(season,p)=>Math.floor((p.seasons[season.id]?.xp??0)/season.tierXp);   // past the last reward too
export const tiersEarned=(season,p)=>Math.min(tierCount(season),tiersRaw(season,p));
export const unlockedCount=(season,p)=>Object.keys(p.seasons[season.id]?.unlocked??{}).length;
// Tokens a season's pass XP has given (`earned`, kept in the save since 2026-10-26: a tier only gives one while it's needed,
// see addXp). Older saves count their tiers, up to the season's reward count (the bonus tokens past it are gone).
const earnedOf=(season,p)=>p.seasons[season.id]?.earned??Math.min(tierCount(season),tiersRaw(season,p));
// The shared pool: every season's earned and bought tokens, less every unlock. Never below 0: tierXp rose (1,500 -> 2,500),
// so a save could have unlocked more than it now earns; it earns back first.
export const tokens=(S,p)=>Math.max(0,S.list.reduce((a,s)=>a+earnedOf(s,p)+(p.seasons[s.id]?.bought??0)-unlockedCount(s,p),0)-(p.forfeit??0));
// rewards still locked: in one season, and in every season that's out
export const lockedCount=(season,p)=>tierCount(season)-season.pages.reduce((a,pg)=>a+pg.items.filter(it=>p.seasons[season.id]?.unlocked[it.id]).length,0);
const lockedAll=(S,p)=>S.list.reduce((a,s)=>a+lockedCount(s,p),0);
// No hoarding (2026-10-26, user: "you cant earn tokens after fully completing a pass… no more extra tokens so people dont
// horde for the next pass"): pass XP gives a token only while the pool can't yet pay for the rest of the live season, so a
// finished pass gives nothing more, and nothing piles up for the next one. Tiers past the last reward still give a token
// when the pool falls short (it went on a past season). A token can be bought only while something is left to spend it on.
export const tokensNeeded=(S,p)=>tokens(S,p)<lockedCount(S.current,p);
export const canBuyToken=(S,p)=>tokens(S,p)<lockedAll(S,p);
// Tokens beyond every reward still locked (bought before the pass was done, or bonus tokens in an old save) are dropped
// (`forfeit`), so a finished pass wraps up with none left to carry into the next season. Returns how many went.
export function wrapUp(S,p){const x=tokens(S,p)-lockedAll(S,p);if(x>0)p.forfeit=(p.forfeit??0)+x;return Math.max(0,x);}
const isUnlocked=(season,p,id)=>!!p.seasons[season.id]?.unlocked[id];
export const pageDone=(season,p,pi)=>season.pages[pi].items.every(it=>isUnlocked(season,p,it.id));
export const pageOpen=(season,p,pi)=>pi===0||pageDone(season,p,pi-1);
export const seasonDone=(season,p)=>season.pages.every((_,pi)=>pageDone(season,p,pi));
const itemOf=(season,id)=>{for(const [pi,pg] of season.pages.entries()){const it=pg.items.find(x=>x.id===id);if(it)return {...it,page:pi};if(pg.major.id===id)return {...pg.major,page:pi,major:true};}return null;};

// Hand a reward over (once). Returns true when something was granted.
function give(season,p,entry){
  const R=rec(p,season);if(R.granted[entry.id])return false;const r=entry.reward;
  if(r.type==='item')grantReward('item',r.id);
  else if(r.type==='credits'){const c=loadCredits();change(c,r.amount,`Melon Pass ${season.name}: ${entry.id}`);saveCredits(c);}
  else if(r.type==='token')p.boosts[r.kind]=(p.boosts[r.kind]??0)+r.matches;
  else if(r.type==='gum'){if(!p.gums.includes(r.id))p.gums.push(r.id);}
  R.granted[entry.id]=true;return true;
}
// Rewards are remembered by slot (granted['p6.9']), so a slot whose reward was swapped for a new item after it was claimed
// (Crows card -> Prismatic Punch, Harvest Moon Glow -> Dam-A-Nade) hands the new item over here. Returns the items granted.
export function reconcile(S,p){
  const out=[];
  for(const season of S.list){const g=p.seasons[season.id]?.granted;if(!g)continue;
    for(const pg of season.pages)for(const e of [...pg.items,pg.major])
      if(g[e.id]&&e.reward.type==='item'&&grantReward('item',e.reward.id))out.push(e.reward.id);}
  return out;
}
// Spend a token on a reward of any started season. Returns {granted:[entries], held:bool (premium, waiting for the pass),
// major:entry|null} or a reason.
export function unlock(S,season,p,id){
  const it=itemOf(season,id);if(!it||it.major)return 'Not a tier reward';if(isUnlocked(season,p,id))return 'Already unlocked';
  if(!pageOpen(season,p,it.page))return 'Finish the page before it first';if(tokens(S,p)<=0)return 'No tokens: earn pass tiers by playing, or buy one';
  const R=rec(p,season);R.unlocked[id]=true;const out={granted:[],held:false,major:null,season};
  if(!it.premium||R.premium){if(give(season,p,it))out.granted.push(it);}else out.held=true;
  if(pageDone(season,p,it.page)){const m=season.pages[it.page].major;if(give(season,p,m)){out.granted.push(m);out.major=m;}}
  wrapUp(S,p);return out;
}
// The pass auto-progress spends on: a past season the player made active (until the next season goes live), else the live one.
export function trackOf(S,p){return p.track?.live===S.current.id&&S.list.find(s=>s.id===p.track.id)||S.current;}
export function setTrack(S,p,season){p.track=isLive(S,season)?null:{id:season.id,live:S.current.id};}
// The next reward auto-progress would take: the first locked one, in order, on the first open page that isn't done.
export function nextAuto(season,p){for(const [pi,pg] of season.pages.entries()){if(!pageOpen(season,p,pi))return null;const it=pg.items.find(x=>!isUnlocked(season,p,x.id));if(it)return it;}return null;}
// Spends on the active pass, then the live season once that one is finished.
export function autoSpend(S,p){
  const out=[];if(!p.auto)return out;
  for(const season of new Set([trackOf(S,p),S.current]))
    while(tokens(S,p)>0){const it=nextAuto(season,p);if(!it)break;const r=unlock(S,season,p,it.id);if(typeof r==='string')break;out.push(r);}
  return out;
}
export function buyPremium(season,p){
  const R=rec(p,season);
  if(R.premium)return 'You have the premium pass';const c=loadCredits();if(!change(c,-season.premiumPrice,`Melon Pass ${season.name}: premium`))return `Not enough credits (${season.premiumPrice.toLocaleString()} needed)`;
  saveCredits(c);R.premium=true;const out=[];
  for(const it of allItems(season))if(R.unlocked[it.id]&&give(season,p,it))out.push(it);   // everything already unlocked on the premium track
  return out;
}
// A tier skip at the live season's price; the token joins the shared pool.
export function buyToken(S,p){const s=S.current;if(!canBuyToken(S,p))return 'Your tokens already cover every reward left';const c=loadCredits();if(!change(c,-s.tokenPrice,`Melon Pass ${s.name}: tier token`))return `Not enough credits (${s.tokenPrice} needed)`;saveCredits(c);rec(p,s).bought++;return null;}
// Pass XP, always into the live season. Returns how many tokens it gave: one per tier crossed while one is needed.
export function addXp(S,p,n){
  const s=S.current,R=rec(p,s),before=tiersRaw(s,p);R.earned=earnedOf(s,p);R.xp+=Math.max(0,Math.round(n));
  let got=0;for(let i=tiersRaw(s,p)-before;i>0&&tokensNeeded(S,p);i--){R.earned++;got++;}
  wrapUp(S,p);return got;
}

// what a reward is, for the UI: {title, sub, kind}
export function describe(r,{catalog,gums}={}){
  if(r.type==='item'){const i=catalog?.items.find(x=>x.id===r.id);if(i?.data?.label)return {title:i.name,sub:i.data.label,item:i,desc:i.desc};return {title:i?.name??r.id,sub:{camo:'CAMO',outfit:'OUTFIT',reticle:'RETICLE & HITS',theme:'THEME',sound:'SOUND SET',glow:'MAP GLOW',card:'CALLING CARD'}[i?.cat]??'ITEM',item:i};}
  if(r.type==='credits')return {title:`${r.amount} Credits`,sub:'CREDITS'};
  if(r.type==='token')return {title:`Double ${{passXp:'Pass',weaponXp:'Weapon',researchXp:'Research'}[r.kind]} XP`,sub:`NEXT ${r.matches} MATCH${r.matches>1?'ES':''}`};
  if(r.type==='gum'){const g=gums?.gums.find(x=>x.id===r.id);return {title:g?.name??r.id,sub:`GOBBLEGUM · ${(g?.rarity??'').toUpperCase()} · SEASON EXCLUSIVE`,desc:g?.desc};}
  return {title:'?',sub:''};
}

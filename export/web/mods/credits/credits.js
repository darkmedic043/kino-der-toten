// Credits (roadmap Phase 6): the play-earned currency the Shop spends. Shared by the menu, the Shop page and the game.
// Store: kino.mods.credits = {balance, ledger:[{t, n, why}] (last 50), challenges:{daily:{key, list:[{id,p,done}]},
//   weekly:{...}}, milestones:{[map]: {[round]: true}}}, cloud-synced (cloud.js TRACKED). Numbers: credits.json.
// A client-side balance can be edited; that's accepted for a local fork, and the ledger makes odd jumps visible.
export const CREDITS_KEY='kino.mods.credits';
export async function loadCreditsConfig(base=import.meta.url){const r=await fetch(new URL('credits.json',base));if(!r.ok)throw new Error('credits.json HTTP '+r.status);return r.json();}
export function loadCredits(){
  let p;try{p=JSON.parse(localStorage.getItem(CREDITS_KEY));}catch{}p=p&&typeof p==='object'?p:{};
  return {balance:Math.max(0,Math.floor(+p.balance||0)),ledger:Array.isArray(p.ledger)?p.ledger:[],challenges:{...p.challenges},milestones:{...p.milestones}};
}
export function saveCredits(c){try{localStorage.setItem(CREDITS_KEY,JSON.stringify(c));}catch{}window.dispatchEvent?.(new CustomEvent('kino-credits',{detail:c.balance}));}
// add (n > 0) or spend (n < 0); returns false when the balance can't cover a spend
export function change(c,n,why){n=Math.round(n);if(!n)return true;if(c.balance+n<0)return false;c.balance+=n;c.ledger.unshift({t:Date.now(),n,why});c.ledger.length=Math.min(c.ledger.length,50);return true;}
// one-shot helper: load, change, save
export function grantCredits(n,why){const c=loadCredits();const ok=change(c,n,why);if(ok)saveCredits(c);return ok?c.balance:false;}

// ---- challenges -------------------------------------------------------------------------------------------------
const pad=n=>String(n).padStart(2,'0');
export const dayKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export function weekKey(d=new Date()){const m=new Date(d);m.setHours(0,0,0,0);m.setDate(m.getDate()-((m.getDay()+6)%7));return 'w'+dayKey(m);}
export function nextReset(kind,d=new Date()){const n=new Date(d);n.setHours(24,0,0,0);if(kind==='weekly')while(n.getDay()!==1)n.setDate(n.getDate()+1);return n;}
function seeded(str){let h=2166136261;for(const ch of str){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return ()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return (h>>>0)/4294967296;};}
// The current daily and weekly sets (rolled from the date, so every device agrees), refreshed in place when the period changes.
export function currentChallenges(cfg,c,now=new Date()){
  for(const [kind,key,mul] of [['daily',dayKey(now),1],['weekly',weekKey(now),cfg.weeklyMul??6]]){
    const cur=c.challenges[kind];if(cur?.key===key)continue;
    const r=seeded(kind+key),pool=[...cfg.challenges];const list=[];
    while(list.length<3&&pool.length){const ch=pool.splice(Math.floor(r()*pool.length),1)[0];list.push({id:ch.id,p:0,done:false,n:ch.max?Math.round(ch.n*(kind==='weekly'?2:1)):Math.round(ch.n*mul)});}
    c.challenges[kind]={key,list};
  }
  return c.challenges;
}
export const challengeText=(cfg,ch)=>{const d=cfg.challenges.find(x=>x.id===ch.id);return (d?.text??ch.id).replace('{n}',ch.n.toLocaleString());};
// Count stats into the open challenges. stats: {statName: amount}; `max` challenges take the highest value instead.
// Returns the challenges completed by this call (their credits are already paid into c).
export function countChallenges(cfg,c,stats){
  const out=[];currentChallenges(cfg,c);
  for(const kind of ['daily','weekly'])for(const ch of c.challenges[kind].list){
    if(ch.done)continue;const d=cfg.challenges.find(x=>x.id===ch.id);const v=stats[d?.stat];if(v==null)continue;
    ch.p=d.max?Math.max(ch.p,v):ch.p+v;
    if(ch.p>=ch.n){ch.p=ch.n;ch.done=true;change(c,cfg[kind],`${kind} challenge: ${challengeText(cfg,ch)}`);out.push({...ch,kind,reward:cfg[kind]});}
  }
  return out;
}
export function matchPayout(cfg,{round,kills}){const p=cfg.payout;return Math.min(p.cap,Math.round(Math.max(0,round-5)*p.perRoundOver5+kills*p.perKill));}

// The Melon Pass in a match (roadmap Phase 7): pass XP from kills and rounds (none in a cheat game) into the live season, double-XP tokens
// consumed at match start (window.kino.boost, read by weapon-levels, research and here), tier-up toasts, auto-progress
// spending, and a pause-menu line. Challenge completions add pass XP through window.kino.pass.addXp (credits mod).
import { loadSeasons, loadPass, savePass, addXp, autoSpend, tiersEarned, tokens, describe } from './pass.js';
import { loadCatalog } from '../shop/shop.js';

export default async function setup(api){
  const {host,mod}=api;
  const S=await loadSeasons(mod.url),season=S.current,catalog=await loadCatalog(new URL('../shop/',mod.url)).catch(()=>null);
  let P=loadPass();
  const cheating=()=>!!window.kino.cheats?.used;
  // double-XP tokens: each kind with matches left doubles that XP for this match and uses one up
  function startBoosts(){
    P=loadPass();const b={};for(const k of ['passXp','weaponXp','researchXp'])if(P.boosts[k]>0){P.boosts[k]--;b[k]=2;}
    window.kino.boost=b;savePass(P);
    const on=Object.keys(b);if(on.length)api.toast?.('DOUBLE XP · '+on.map(k=>({passXp:'pass',weaponXp:'weapon',researchXp:'research'})[k]).join(' · ')+' this match',4);
  }
  window.kino.boost={};host.on('start',startBoosts);   // used up when a match starts, not at load
  let saveT=null;
  function gain(n,why){
    if(cheating()||!(n>0))return;
    const tiers=addXp(S,P,n*(window.kino.boost?.passXp??1));
    if(tiers){const t=tiersEarned(season,P),bonus=P.seasons[season.id].xp/season.tierXp>=t+1;   // past the season's last tier: a bonus token (for past seasons)
      const spent=autoSpend(S,P);
      if(spent.length){const names=spent.flatMap(s=>s.granted).map(e=>describe(e.reward,{catalog}).title);api.announce?.(bonus?'BONUS PASS TOKEN':`PASS TIER ${t}`,names.length?names.join(' · ').toUpperCase():'REWARD HELD FOR PREMIUM',3);}
      else{const n=tokens(S,P);api.announce?.(bonus?'BONUS PASS TOKEN':`PASS TIER ${t}`,`${n} TOKEN${n===1?'':'S'} TO SPEND · MAIN MENU → PASS`,3);}
      savePass(P);}
    else{clearTimeout(saveT);saveT=setTimeout(()=>savePass(P),1500);}
  }
  host.on('kill',e=>{if(!e.remote)gain(season.xp.kill+(e.head?season.xp.headshot:0));});
  host.on('roundEnd',({round})=>gain(round*season.xp.roundPerRound));
  addEventListener('beforeunload',()=>{clearTimeout(saveT);savePass(P);});
  // pause menu: tier, XP to the next, tokens
  const panel=document.createElement('div');panel.id='pass-panel';
  const css=document.createElement('style');css.textContent='#pass-panel{margin:6px 0;font-size:11px;letter-spacing:.06em;color:#b9b2a3}#pass-panel b{color:#ff9a3d}';document.head.append(css);
  let last='';host.on('update',()=>{const n=tokens(S,P),html=`<b>MELON PASS</b> · tier ${tiersEarned(season,P)} · ${(P.seasons[season.id]?.xp??0)%season.tierXp} / ${season.tierXp} XP${n?` · ${n} token${n>1?'s':''} to spend`:''}${Object.keys(window.kino.boost??{}).length?' · double XP on':''}`;
    if(html!==last){last=html;panel.innerHTML=html;}const a=document.getElementById('research-panel')??document.getElementById('gunsmith-panel');if(a&&a.nextElementSibling!==panel)a.after(panel);});
  window.kino.pass={addXp:(n,why)=>{gain(n,why);savePass(P);},get state(){return P;},season,seasons:S};
}

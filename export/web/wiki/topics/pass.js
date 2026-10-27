// The Melon Pass: an overview page (tokens, premium, past seasons) and one page per season with every reward.
// Seasons are loaded the way the game loads them (the pass rules' own loader: the seasons index, falling back to the
// first season file; seasons that haven't started yet stay hidden).
import { rewardKit, REWARD_CSS } from './progression.js';

const fmtDate=s=>new Date(s+'T00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const range=s=>{const a=new Date(s.start+'T00:00'),b=new Date(s.end+'T00:00');
  return a.getFullYear()===b.getFullYear()?`${a.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${fmtDate(s.end)}`:`${fmtDate(s.start)} – ${fmtDate(s.end)}`;};

export default {
  id:'pass', title:'Melon Pass', order:90,
  blurb:'The seasonal pass: how tiers, tokens and premium work, past seasons, and every reward on every page.',
  async load(ctx){
    const P=await ctx.load('mods/pass/pass.js');
    const S=await P.loadSeasons(ctx.url('mods/pass/'));
    const [catalog,gums]=await Promise.all([ctx.json('mods/shop/catalog.json'),ctx.json('mods/gobblegums/gums.json')]);
    const live=S.current,num=s=>S.list.indexOf(s)+1;
    const count=s=>s.pages.reduce((a,pg)=>a+pg.items.length,0);
    const lk=(tid,title)=>ctx.find(tid,ctx.slug(title))?ctx.link(tid,ctx.slug(title),title):ctx.esc(title);
    const ml=(tid,pid,label)=>pid&&!ctx.find(tid,pid)?label:`[${label}](${ctx.href(tid,pid)})`;   // a link inside md() prose (md escapes HTML)
    const seasonTitle=s=>s.name;

    // ---- overview -------------------------------------------------------------------------------------------
    const overview=c=>{
      const x=live.xp,tiers=count(live);
      const xpRows=[['Zombie kill',`${ctx.num(x.kill)} pass XP`],['Headshot kill',`+${ctx.num(x.headshot)} on top`],
        ['Round survived',`${ctx.num(x.roundPerRound)} × the round number (round 10 gives ${ctx.num(10*x.roundPerRound)})`],
        ['Daily challenge done',`${ctx.num(x.daily)} pass XP`],['Weekly challenge done',`${ctx.num(x.weekly)} pass XP`]];
      return c.infobox({title:'Melon Pass',color:live.color,rows:[
          ['Live season',`${ctx.link('pass',ctx.slug(seasonTitle(live)),`Season ${num(live)}: ${live.name}`)}`],
          ['Seasons',S.list.length],['XP per tier',ctx.num(live.tierXp)],['Premium',`${ctx.num(live.premiumPrice)} credits`],['Tier skip',`${ctx.num(live.tokenPrice)} credits`]],
          foot:'Open it from the PASS tab in the main menu.'})+
        c.md(`The Melon Pass is a seasonal track of cosmetics and unlocks, laid out like the Black Ops 6 and 7 battle passes. Each season is a set of **pages**. A page holds **9 tier rewards** and one bigger **page reward**. The live season, ${live.name}, has ${live.pages.length} pages: ${tiers} tier rewards plus ${live.pages.length} page rewards.`)+
        `<h2>Earning tiers</h2>`+c.md(`Playing earns **pass XP**. Every ${ctx.num(live.tierXp)} pass XP is one **tier**, and every tier gives you one **token**.`)+
        c.table(['Source','Pass XP'],xpRows,{cls:'compact'})+
        c.md(`A tier-up is announced in the match. Your tier and spare tokens also show in the pause menu. The pass XP counts on top of your normal player XP. See ${ml('progression',ctx.slug('Challenges'),'Challenges')} for the daily and weekly lists.`)+
        `<h2>Spending tokens</h2>`+c.md(`- A token unlocks **any reward on an open page**, in any order. Page 1 is always open. Each later page opens once the page before it is complete.
- Unlocking is claiming: the reward is yours straight away (premium rewards: see below).
- Unlock all 9 rewards on a page and its **page reward** is granted. The next page then opens.
- **Auto-progress** (a toggle in the PASS tab, on by default) spends your tokens for you, taking the first locked reward of the first open page.
- Out of tokens? **Buy a token** (a tier skip) for ${ctx.num(live.tokenPrice)} credits. See ${ml('progression',ctx.slug('Credits'),'Credits')}.`)+
        `<h2>Free and premium</h2>`+c.md(`Some tier rewards are **premium**. Premium is bought once per season with credits (${ctx.num(live.premiumPrice)} for ${live.name}).

You can spend a token on a premium reward without premium. It still counts toward finishing the page, and the reward is **held for you**. Buying premium later hands over every held reward at once. Page rewards are free for everyone.`)+
        `<h2>When a pass is finished</h2>`+c.md(`Tokens stop as soon as the ones you hold can pay for every reward still locked in the live season. A finished pass gives no more tokens, and you can't stockpile them for the next season. If you spent tokens on a past season, tiers past the last of the ${tiers} still give a **BONUS PASS TOKEN** (one ${ctx.num(live.tierXp)} XP each) until the live pass is covered again. Tier skips can be bought only while some reward is left to spend them on.`)+
        `<h2>Past seasons never expire</h2>`+c.md(`When a new season goes live, the old one stays open for good, like Marvel Rivals' battle passes:

- **One token pool.** Tokens from every season go into one shared count, and you can spend any of them on any season.
- **Pass XP always goes to the live season.** Past seasons are finished with tokens: spare tokens and tier skips.
- **Premium is per season.** A past season's premium can still be bought, at its own price, and it hands over that season's held rewards.
- **Active pass.** Pick a past season with MAKE ACTIVE PASS and auto-progress spends on it first, then on the live season. When the next season goes live, the active pass resets to it.
- Rewards you own stay yours forever.`)+
        c.note('Pass rewards are exclusive: the Shop never sells them. Once you own one, it shows in the Shop under its category so you can equip it there.','tip')+
        `<h2>Seasons</h2>`+c.cards([...S.list].reverse().map(s=>({href:ctx.href('pass',ctx.slug(seasonTitle(s))),title:`Season ${num(s)}: ${s.name}`,
          sub:`${s===live?'Live':'Past'} · ${range(s)}`,color:s.color})));
    };

    // ---- a season ---------------------------------------------------------------------------------------------
    const seasonPage=s=>async c=>{
      const K=await rewardKit(ctx,{catalog,gums});
      const items=P.allItems(s),prem=items.filter(i=>i.premium).length;
      const typeCount={};for(const pg of s.pages)for(const e of [...pg.items,pg.major]){const t=K.info(e.reward).type;typeCount[t]=(typeCount[t]??0)+1;}
      const row=(e,slot,major)=>{const r=K.info(e.reward);
        return [`<div class="rw-th">${K.thumb(e.reward)}</div>`,slot,`<b>${r.link??ctx.esc(r.name)}</b>${r.desc?`<br><small class="muted">${ctx.esc(r.desc)}</small>`:''}`,
          ctx.esc(r.type),major?ctx.badge('Page reward',s.accent??'var(--melon)'):e.premium?ctx.badge('Premium','#d6a94a'):ctx.badge('Free','#9d947e')];};
      return REWARD_CSS+c.infobox({title:`Season ${num(s)}`,color:s.color,rows:[['Name',ctx.esc(s.name)],['Status',s===live?ctx.badge('Live',s.accent??'#7cd65a'):ctx.badge('Past · never expires','#9d947e')],
          ['Dates',range(s)],['Pages',s.pages.length],['Tier rewards',`${items.length} (${prem} premium)`],['Page rewards',s.pages.length],
          ['XP per tier',ctx.num(s.tierXp)],['Total XP',ctx.num(items.length*s.tierXp)],['Premium',`${ctx.num(s.premiumPrice)} credits`],['Tier skip',`${ctx.num(s.tokenPrice)} credits`]],
          foot:`How tokens and premium work: ${ctx.link('pass',ctx.slug('How the Melon Pass works'),'How the Melon Pass works')}.`})+
        c.md(`Season ${num(s)} of the Melon Pass ran ${range(s)}${s===live?' and is the live season, so your pass XP goes here':''}. ${s===live?'Like every season, it':'It'} never expires: tokens can be spent on it at any time.`)+
        c.md(`It has ${s.pages.length} pages of ${s.pages[0]?.items.length??9} rewards, each with a page reward. That is ${items.length} tier rewards (${items.length-prem} free, ${prem} premium) and ${s.pages.length} page rewards, and none of them repeat. Earning every tier takes ${ctx.num(items.length*s.tierXp)} pass XP.`)+
        c.table(['Reward type','Count'],Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).map(([t,n])=>[ctx.esc(t),n]),{cls:'compact'})+
        s.pages.map((pg,pi)=>`<h2>Page ${pi+1}: ${ctx.esc(pg.name)}</h2>`+
          (pi===0?'':`<p class="muted">Opens once page ${pi} is complete.</p>`)+
          c.table(['','#','Reward','Type','Track'],[...pg.items.map((e,i)=>row(e,i+1,false)),row(pg.major,'★',true)],{cls:'compact rw-table'})).join('');
    };

    const pages=[{id:ctx.slug('How the Melon Pass works'),title:'How the Melon Pass works',group:'The pass',sub:'Tokens, premium, past seasons',color:live.color,
        keywords:'battle pass tokens premium tier skip auto progress bonus token season',html:overview,after:el=>rewardKit.fill?.(el)},
      ...[...S.list].reverse().map(s=>({id:ctx.slug(seasonTitle(s)),title:seasonTitle(s),group:'Seasons',sub:`Season ${num(s)} · ${s===live?'Live':'Past'} · ${range(s)}`,color:s.color,
        keywords:`season ${num(s)} rewards camos calling cards operators gobblegums ${s.pages.map(p=>p.name).join(' ')} ${s.pages.flatMap(p=>[...p.items,p.major]).map(e=>catalog.items.find(i=>i.id===e.reward.id)?.name??gums.gums.find(g=>g.id===e.reward.id)?.name??'').join(' ')}`,
        html:seasonPage(s),after:el=>rewardKit.fill?.(el)}))];
    return {
      intro:ctx.md(`The Melon Pass is the season track: play to earn tiers, and every tier is a token you spend on a reward. Season ${num(live)}, **${live.name}**, is live. Older seasons never expire, and one token pool covers them all.`),
      groups:['The pass','Seasons'],pages};
  },
};

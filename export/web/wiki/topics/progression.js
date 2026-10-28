// Progression: player levels and unlocks, prestige, credits and challenges, the Shop, the Journal, the terminal's
// account-wide apps (Bank, Armory, Radio), career stats and saving. Numbers come from the game's data at load.
// Also exports the reward thumbnails/labels (rewardKit) that the Melon Pass topic shares.

// ---- reward thumbnails and labels (shared with pass.js) ---------------------------------------------------------
export const REWARD_CSS=`<style>
.rw-th .pv,.rwg .pv{width:56px;height:42px;display:grid;place-items:center;background:#111 center/cover no-repeat;border:1px solid #ffffff1a;overflow:hidden;line-height:1}
.rw-th .pv svg,.rwg .pv svg{width:100%;height:100%;display:block}
table.rw-table td{vertical-align:middle}table.rw-table td:first-child{width:62px}
.rw-badges{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.rw-badges svg{vertical-align:middle}
.rw-badges span{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#cfc6b2;border:1px solid #ffffff14;padding:4px 8px 4px 4px;background:#0006}
</style>`;
const DEV_NOTE=/\s*\([^()]*\buser\b[^()]*\)/g;   // "(user, 2026-10-15: replaced …)" in some item descriptions
let kit=null,kitP=null;
// thumbnails (the game's own Shop/Pass tile art) and player-facing names, types and links for rewards and shop items
export function rewardKit(ctx,{catalog,gums}){
  return kitP??=(async()=>{
    const [T,C,camos,chars]=await Promise.all([ctx.load('mods/shop/thumbs.js'),ctx.load('mods/weapon-levels/camo.js'),
      ctx.json('mods/weapon-levels/camos.json'),ctx.json('mods/characters/characters.json')]);
    const thumbItem=T.makeThumb({camos,chars});
    const lk=(tid,name)=>{const base=String(name).split(':')[0].trim();
      for(const n of [name,base])if(ctx.find(tid,ctx.slug(n)))return ctx.link(tid,ctx.slug(n),name);return null;};
    const typeOf=i=>{const d=i.data??{};
      if(d.label)return ctx.cap(d.label.toLowerCase()).replace(/ (\w)/g,(m,a)=>' '+a.toLowerCase());
      return {camo:'Camo',outfit:'Outfit',sound:'Hit sound set',glow:'Mystery Box glow',card:'Calling card'}[i.cat]
        ??(d.char?'Reticle':d.hitmarker?'Hitmarker':d.blood?'Kill colour':d.hud?'HUD theme':d.menu?'Menu accent':d.frame?'Portrait frame':'Item');};
    const itemInfo=i=>{const d=i.data??{},special=i.cat==='perk'||d.label;
      return {name:i.name,type:typeOf(i),desc:special?String(i.desc??'').replace(DEV_NOTE,''):'',
        link:i.cat==='perk'?lk('perks',i.name):d.character&&d.label?lk('operators',i.name):null};};
    const gumColor=g=>gums?.rarities?.find(r=>r.id===g?.rarity)?.color??'#7cd65a';
    kit={
      info(r){
        if(r.type==='item'){const i=catalog.items.find(x=>x.id===r.id);return i?itemInfo(i):{name:'Unknown item',type:'Item'};}
        if(r.type==='gum'){const g=gums?.gums.find(x=>x.id===r.id);return {name:g?.name??'Gobblegum',type:`Gobblegum (${ctx.cap(g?.rarity??'')})`,desc:g?.desc??'',link:g?lk('gobblegums',g.name):null};}
        if(r.type==='credits')return {name:`${ctx.num(r.amount)} credits`,type:'Credits'};
        if(r.type==='token')return {name:`Double ${{passXp:'pass',weaponXp:'weapon',researchXp:'research'}[r.kind]??''} XP`,type:`XP token (${r.matches} match${r.matches>1?'es':''})`};
        return {name:'?',type:''};
      },
      item:itemInfo,
      thumb(r){
        if(r.type==='item'){const i=catalog.items.find(x=>x.id===r.id);return i?thumbItem(i):'<div class="pv"></div>';}
        if(r.cat)return thumbItem(r);   // a catalogue item passed directly
        if(r.type==='gum'){const c=gumColor(gums?.gums.find(x=>x.id===r.id));return `<div class="pv" style="background:radial-gradient(circle at 40% 35%,#fff8 0 8%,${c} 22%,${c}66 45%,#0a0a0a 47%)"></div>`;}
        if(r.type==='credits')return '<div class="pv" style="color:#d6a94a;font-size:22px">¢</div>';
        if(r.type==='token')return '<div class="pv" style="color:#7cd65a;font-size:20px;font-weight:700">2×</div>';
        return '<div class="pv"></div>';
      },
      fill(el){try{C.fillSwatches(el,id=>camos.camos.find(c=>c.id===id));}catch{}},
    };
    return kit;
  })();
}
rewardKit.fill=el=>kit?.fill(el);

// weapon names by id: the base game, Moon's guns, the imported BO3 and wonder weapons, and the BO7 guns (built in code)
let namesP=null;
function weaponNames(ctx){
  return namesP??=(async()=>{
    const n={},add=d=>{for(const [k,v] of Object.entries(d?.weapons??{}))if(v?.name)n[k]??=v.name;};
    const files=['game-data.json','moon/combat-data.json','mods/bo3-weapons/weapons.json','mods/wonder-weapons/weapons.json'];
    const datas=await Promise.all(files.map(f=>ctx.json(f).catch(()=>null)));datas.forEach(add);
    try{const m=await ctx.load('mods/bo7-weapons/mod.js');const d={weapons:structuredClone(datas[0]?.weapons??{}),equipment:{},boxPool:[]};
      m.prepare(d);add(d);}catch(e){console.warn('[wiki] BO7 weapon names',e);}
    return n;
  })();
}

const order=['Levels & prestige','Credits & Shop','Records & saves'];

export default {
  id:'progression', title:'Progression', order:80,
  blurb:'Player levels and unlocks, prestige, credits, challenges, the Shop, the Journal and how your progress is saved.',
  async load(ctx){
    const [cfg,credits,catalog,gums]=await Promise.all([ctx.json('mods/progression/progression.json'),ctx.json('mods/credits/credits.json'),
      ctx.json('mods/shop/catalog.json'),ctx.json('mods/gobblegums/gums.json')]);
    const PR=await ctx.load('mods/prestige/prestige.js');const R=await PR.loadPrestigeRules(ctx.url('mods/prestige/'));
    const xpTo=l=>Math.round(cfg.levelCurve.base*l**cfg.levelCurve.exponent);
    const total=l=>{let t=0;for(let i=1;i<l;i++)t+=xpTo(i);return t;};
    const lk=(tid,name,label)=>ctx.find(tid,ctx.slug(name))?ctx.link(tid,ctx.slug(name),label??name):ctx.esc(label??name);
    const ml=(tid,pid,label)=>pid&&!ctx.find(tid,pid)?label:`[${label}](${ctx.href(tid,pid)})`;   // a link inside md() prose (md escapes HTML)
    const mlk=(tid,name)=>ml(tid,ctx.slug(name),name);
    const rar=Object.fromEntries((cfg.rarities??[]).map(r=>[r.id,r]));
    const shopRar=catalog.rarities??{};
    const X=cfg.xp;

    // ---- Player level --------------------------------------------------------------------------------------------
    const levelPage=c=>{
      const marks=[1,2,3,4,5,...Array.from({length:Math.floor(R.playerLevel/5)},(_,i)=>(i+1)*5).filter(l=>l>5)];
      if(!marks.includes(R.playerLevel))marks.push(R.playerLevel);
      return c.infobox({title:'Player level',rows:[['Prestige from',`Level ${R.playerLevel}`],['Level 1 → 2',`${ctx.num(xpTo(1))} XP`],
          [`Level ${R.playerLevel-1} → ${R.playerLevel}`,`${ctx.num(xpTo(R.playerLevel-1))} XP`],[`Total to ${R.playerLevel}`,`${ctx.num(total(R.playerLevel))} XP`],
          ['Prestige Master levels',`${ctx.num(R.accountMasterXp)} XP each`]],foot:'Your level and XP bar show in the main menu and on the HUD.'})+
        c.md(`Your account has one **player level**, shared by every map. Kills and rounds earn XP, and each level makes the next one cost a little more. Leveling up unlocks weapons, starting bonuses and equipment (see ${ml('progression',ctx.slug('Level Unlocks'),'Level Unlocks')}). From level ${R.playerLevel} you can ${ml('progression',ctx.slug('Prestige'),'prestige')}.`)+
        `<h2>Earning XP</h2>`+c.table(['Action','XP'],[['Zombie kill',ctx.num(X.kill)],['Headshot kill',`+${ctx.num(X.headshot)}`],['Melee kill',`+${ctx.num(X.melee)}`],
          ['Hellhound kill',ctx.num(X.hellhound)],['Round survived',`${ctx.num(X.roundSurvivedPerRound)} × the round number`]],{cls:'compact'})+
        c.md(`Round XP grows fast: surviving round 10 alone is worth ${ctx.num(10*X.roundSurvivedPerRound)} XP, and a game that reaches round 20 earns ${ctx.num(Array.from({length:19},(_,i)=>(i+1)*X.roundSurvivedPerRound).reduce((a,b)=>a+b,0))} XP from rounds before counting kills. Only your own kills count; in co-op, each player earns from their own kills. The game-over screen shows the XP the match earned.`)+
        c.note(`The ${ctx.link('pass',null,'Melon Pass')} and every gun's own level have separate XP. Kills feed all three at once.`,'tip')+
        `<h2>XP per level</h2>`+c.table(['Level','XP to the next level','Total XP to reach it'],marks.map(l=>[l,ctx.num(xpTo(l)),ctx.num(total(l))]),{cls:'compact'})+
        c.md(`In ${ml('progression',ctx.slug('Prestige'),'Prestige Master')} the curve stops: every level from ${R.accountMasterStart} to ${ctx.num(R.accountMasterCap)} costs a flat ${ctx.num(R.accountMasterXp)} XP.`);
    };

    // ---- Level unlocks -----------------------------------------------------------------------------------------------
    const unlocksPage=async c=>{
      const names=await weaponNames(ctx);
      const wname=id=>names[id];
      const wl=(id,r)=>{const n=wname(id);return n?`${lk('weapons',n)}${r&&rar[r]?` <small style="color:${rar[r].color}">${ctx.esc(rar[r].name)}</small>`:''}`:null;};
      const rows=new Map();const at=l=>{if(!rows.has(l))rows.set(l,{weapons:[],gunsmith:[],other:[]});return rows.get(l);};
      for(const w of cfg.weapons){if(!wname(w.id))continue;
        if(w.kit){at(1).weapons.push(wl(w.id,w.rarity));if((w.gunsmith??1)>1)at(w.gunsmith).gunsmith.push(lk('weapons',wname(w.id)));}
        else at(w.level).weapons.push(wl(w.id,w.rarity));}
      for(const b of cfg.bonuses)at(b.level).other.push(`${ctx.badge('Bonus','#7cd65a')}<b>${ctx.esc(b.name)}</b>: ${ctx.esc(b.description)}`);
      for(const t of cfg.tactical??[])at(t.level).other.push(`${ctx.badge('Tactical','#4aa3ff')}<b>${ctx.esc(t.name)}</b>: ${ctx.esc(t.description)}`);
      for(const t of cfg.lethal??[])at(t.level).other.push(`${ctx.badge('Lethal','#ff9a2e')}<b>${ctx.esc(t.name)}</b>: ${ctx.esc(t.description)}`);
      if(cfg.tacticalLevel)at(cfg.tacticalLevel).other.unshift(`${ctx.badge('Slot','#d6a94a')}<b>Tactical slot</b>: start each game with a tactical`);
      if(cfg.secondBonusLevel)at(cfg.secondBonusLevel).other.unshift(`${ctx.badge('Slot','#d6a94a')}<b>Second bonus slot</b>: two starting bonuses at once`);
      const lv=[...rows.keys()].sort((a,b)=>a-b);
      const kitCount=cfg.weapons.filter(w=>w.kit&&wname(w.id)).length;
      const minTier=cfg.box?.minPerTier??{};
      return c.md(`Leveling up unlocks weapons, passive **bonuses**, **tactical** equipment and a second bonus slot. Unlocks follow the **highest level you have ever reached**, so a ${ml('progression',ctx.slug('Prestige'),'prestige')} (back to level 1) locks nothing again.`)+
        `<h2>Your loadout</h2>`+c.md(`Set it up in the main menu, under ARMORY → LOADOUT:

- **Starting weapon**: one slot, pistols only. If the pistol you picked isn't unlocked, you start with the M1911.
- **Bonuses**: one slot, two from level ${cfg.secondBonusLevel}.
- **Mystery Box list**: every unlocked weapon, tactical and lethal can be switched on or off for your Mystery Box. Each weapon rarity keeps a few switched on (${Object.entries(minTier).map(([r,n])=>`${n} ${rar[r]?.name??r}`).join(', ')}).`)+
        `<h2>Starting bonuses</h2>`+c.table(['Bonus','Level','Effect'],cfg.bonuses.map(b=>[`<b>${ctx.esc(b.name)}</b>`,b.level,ctx.esc(b.description)]),{cls:'compact'})+
        `<h2>Unlocks by level</h2>`+c.md(`The ${kitCount} weapons of the starting kit are yours from level 1. Each one's **Gunsmith** (weapon levels, attachments and camos; see ${ml('weapons',null,'Weapons')}) opens at a later level. Every other weapon unlocks at its level, Gunsmith included, and joins your Mystery Box list. Rarities are the Mystery Box tiers.`)+
        c.table(['Level','Weapons','Gunsmith opens','Other'],lv.map(l=>{const r=rows.get(l);
          return [`<b>${l}</b>`,r.weapons.join(r.weapons.length>4?', ':'<br>')||'—',r.gunsmith.join(', ')||'—',r.other.join('<br>')||'—'];}));
    };

    // ---- Prestige ------------------------------------------------------------------------------------------------------
    const prestigePage=c=>{
      const n=R.playerMax;
      const badges=`<div class="rw-badges">${Array.from({length:n},(_,i)=>`<span>${PR.prestigeBadge(i+1,26)}${PR.prestigeName(i+1)}</span>`).join('')}<span>${PR.prestigeBadge(n+1,26,R.accountMasterStart)}PRESTIGE MASTER</span></div>`;
      const ms=PR.MASTER_MILESTONES.map(m=>[`<b>${ctx.num(m.level)}</b>`,m.icon?PR.masterBadge(m.level,26):'',m.title?ctx.esc(m.title):'—',
        m.color?`<span class="swatch" style="background:${m.legend?'linear-gradient(90deg,#ff5a5a,#ffd65a,#5aff8a,#5ab8ff,#c45bff)':m.color}"></span>${ctx.esc(m.colorName)}`:'—',m.credits?ctx.num(m.credits):'—']);
      const cp=credits.prestige??{};
      return REWARD_CSS+c.infobox({title:'Prestige',color:PR.MASTER_COLOR,rows:[['Player prestige from',`Level ${R.playerLevel}`],['Prestiges',`I to ${PR.roman(n)}, then Master`],
          ['Each prestige',`+1 token, ${ctx.num(cp.player)} credits`],['Master levels',`${R.accountMasterStart} to ${ctx.num(R.accountMasterCap)}`],
          ['Weapon prestige',`at the gun's max level`],['Weapon Master levels',`up to ${R.masterMax}`]]})+
        c.md(`Prestige works as in Black Ops 7. There are two kinds: **player prestige** for your account level, and **weapon prestige** for each gun.`)+
        `<h2>Player prestige</h2>`+c.md(`From level ${R.playerLevel}, the rank card in the main menu shows a PRESTIGE button. Prestiging:

- sets your level back to 1 (XP to 0),
- gives you a **prestige badge** in a new colour, shown on the rank card and on the HUD's level,
- gives you **1 prestige token** and **${ctx.num(cp.player)} credits**.

Nothing locks again: your unlocks follow the highest level you have ever reached. A prestige token unlocks one Prestige I or Prestige II camo of **any** gun, without prestiging that gun (spend it in the Gunsmith's PRESTIGE camo tab).`)+badges+
        `<h2>Prestige Master</h2>`+c.md(`After Prestige ${PR.roman(n)}, the next prestige is the last: **Prestige Master**. It uses the same reset, token and credits, and it also **opens the Bank** on the terminal (see ${ml('progression',ctx.slug('Terminal Unlocks'),'Terminal Unlocks')}).

In Prestige Master your level carries on from ${R.accountMasterStart} up to ${ctx.num(R.accountMasterCap)}, at a flat ${ctx.num(R.accountMasterXp)} XP per level. Milestones along the way give titles, level colours, a badge that grows a pip every 100 levels, and credits. At ${ctx.num(R.accountMasterCap)} you become a **Legend**, with an animated rainbow level and a crowned badge. The rank card's MASTER REWARDS list shows your progress. Credits from milestones you've passed are paid automatically.`)+
        c.table(['Level','Badge','Title','Level colour','Credits'],ms,{cls:'compact'})+
        `<h2>Weapon prestige</h2>`+c.md(`Once a gun reaches its **max level** (one level per attachment, plus one), its Gunsmith offers WEAPON PRESTIGE. Wonder weapons and other guns without attachments can't prestige.

- **Prestige I** and **Prestige II** reset the gun's level and attachments (camo challenge progress stays). Each earns that gun's own **prestige camo**, and every gun can wear it.
- The third prestige is **Prestige Master**: nothing resets. XP the gun earns at its max level fills **Master levels**, ${ctx.num(R.masterXp)} XP each, up to ${R.masterMax}. Master level ${R.masterCamoAt} earns the gun's animated **Master camo**.

Weapon prestiges pay credits: ${[['I',cp[1]],['II',cp[2]],['Master',cp[3]]].map(([t,v])=>`${ctx.num(v)} for ${t}`).join(', ')}. Each gun has its own three camos, with their own names and patterns. More in ${ml('weapons',null,'Weapons')}.`);
    };

    // ---- Credits -------------------------------------------------------------------------------------------------------
    const payout=(round,kills)=>Math.min(credits.payout.cap,Math.round(Math.max(0,round-5)*credits.payout.perRoundOver5+kills*credits.payout.perKill));
    const creditsPage=c=>{
      const p=credits.payout,ms=credits.milestones,cp=credits.prestige;
      const masterCredits=PR.MASTER_MILESTONES.filter(m=>m.credits).reduce((a,m)=>a+m.credits,0);
      return c.infobox({title:'Credits',color:'#d6a94a',rows:[['Match payout cap',ctx.num(p.cap)],['Daily challenge',ctx.num(credits.daily)],['Weekly challenge',ctx.num(credits.weekly)],
          ['Player prestige',ctx.num(cp.player)]],foot:'Your balance shows next to the SHOP button in the main menu.'})+
        c.md(`**Credits** are the currency you earn by playing. Spend them in the ${ml('progression',ctx.slug('Shop'),'Shop')} on cosmetics, or on the ${ml('pass',null,'Melon Pass')} (premium and tier skips). They never buy power. The Shop's CREDITS view lists your challenges and your last 50 credit changes.`)+
        `<h2>Match payout</h2>`+c.md(`Every match pays out on the game-over screen: **${ctx.num(p.perRoundOver5)} per round past round 5**, plus **${ctx.num(p.perKill)} per kill**, up to **${ctx.num(p.cap)}** a match.`)+
        c.table(['Match','Payout'],[[10,60],[15,120],[20,200],[30,350]].map(([r,k])=>[`Round ${r}, ${k} kills`,ctx.num(payout(r,k))]),{cls:'compact'})+
        `<h2>Round milestones</h2>`+c.md('Paid the **first time** you reach each round on each map (announced in the match).')+
        c.table(['Round reached','Credits'],Object.entries(ms).map(([r,v])=>[`Round ${r}`,ctx.num(v)]),{cls:'compact'})+
        c.md(`That is ${ctx.num(Object.values(ms).reduce((a,b)=>a+b,0))} credits per map for reaching every milestone.`)+
        `<h2>Challenges</h2>`+c.md(`3 daily challenges pay ${ctx.num(credits.daily)} each, and 3 weekly challenges pay ${ctx.num(credits.weekly)} each. See ${ml('progression',ctx.slug('Challenges'),'Challenges')}.`)+
        `<h2>Prestige</h2>`+c.table(['Prestige','Credits'],[['Weapon Prestige I',cp[1]],['Weapon Prestige II',cp[2]],['Weapon Prestige Master',cp[3]],['Player prestige (each)',cp.player]].map(([a,b])=>[a,ctx.num(b)]),{cls:'compact'})+
        c.md(`Prestige Master milestones pay ${ctx.num(masterCredits)} credits in all, on the way to level ${ctx.num(R.accountMasterCap)} (see ${ml('progression',ctx.slug('Prestige'),'Prestige')}).`);
    };

    // ---- Challenges ------------------------------------------------------------------------------------------------------
    const mul=credits.weeklyMul??4;
    const challengesPage=async c=>{
      let passXp=null;try{const P=await ctx.load('mods/pass/pass.js');passXp=(await P.loadSeasons(ctx.url('mods/pass/'))).current?.xp;}catch{}
      return c.md(`Each day brings **3 daily challenges** and each week **3 weekly challenges**, drawn at random from the list below. Everyone gets the same set on the same day. Progress counts across all your matches on any map, and a challenge pays the moment you finish it.`)+
        c.table(['','Daily','Weekly'],[['Challenges at once',3,3],['Credits each',ctx.num(credits.daily),ctx.num(credits.weekly)],
          ...(passXp?[['Melon Pass XP each',ctx.num(passXp.daily),ctx.num(passXp.weekly)]]:[]),['Resets','Midnight (your time)','Monday midnight']],{cls:'compact'})+
        `<h2>The challenge list</h2>`+c.md(`Weekly goals are ${mul} times the daily ones. "Reach round" challenges double instead.`)+
        c.table(['Challenge','Daily goal','Weekly goal'],credits.challenges.map(ch=>{const d=ch.n,w=ch.max?ch.n*2:ch.n*mul;
          return [ctx.esc(ch.text.replace('{n}','N')),ctx.num(d),ctx.num(w)];}),{cls:'compact'})+
        c.md(`Track them in the Shop's CREDITS view, which shows each challenge's progress and the time to the next reset.`);
    };

    // ---- Shop ------------------------------------------------------------------------------------------------------------
    const shopPage=async c=>{
      const K=await rewardKit(ctx,{catalog,gums});
      const forSale=catalog.items.filter(i=>!i.pass);
      const b=catalog.bundle??{size:3,discount:.3};
      const rb=r=>ctx.badge(ctx.cap(r),shopRar[r]);
      const byCat=catalog.categories.map(cat=>[cat,forSale.filter(i=>i.cat===cat.id)]).filter(([,l])=>l.length);
      const prices=forSale.map(i=>i.price);
      return REWARD_CSS+c.infobox({title:'Shop',color:'#d6a94a',rows:[['Items for sale',forSale.length],['Daily featured',catalog.daily??3],['Weekly bundle',`${b.size} items, ${ctx.pct(b.discount)} off`],
          ['Prices',`${ctx.num(Math.min(...prices))} to ${ctx.num(Math.max(...prices))} credits`]],foot:'The SHOP tab in the main menu.'})+
        c.md(`The Shop sells **cosmetics only**: camos, outfits, reticles, themes, sounds and more, paid with ${ml('progression',ctx.slug('Credits'),'credits')}. Nothing in it changes how strong you are.`)+
        `<h2>How it works</h2>`+c.md(`- **Featured**: ${catalog.daily??3} daily items (new at midnight) and a weekly **bundle** of ${b.size} items at ${ctx.pct(b.discount)} off (new on Monday). Both are picked at random from items you don't own yet.
- Items marked **Rotating** below are only sold as a daily item or in the bundle. Everything else is always in its category.
- Buying takes two clicks. Owned items never leave, and you **equip** them in the Shop. Camos are the exception: put those on a gun in the Gunsmith. Outfits work the same way, from the Operator pane.
- A Shop camo works on **every gun** and shows in the Gunsmith's SHOP camo tab.
- The drawer previews each item: camos on a turning gun, reticles and hitmarkers on a mock HUD, and sound sets play a sample.
- ${ml('pass',null,'Melon Pass')} rewards are never sold. Once you own one, it appears here so you can equip it.`)+
        `<h2>What each kind does</h2>`+c.md(`- **Reticles**: the crosshair's shape and colour. A red dot sight takes the colour too.
- **Hitmarkers**: the hit marker's shape and colour. **Kill colours**: the colour zombies burst in when you hit and kill them.
- **HUD themes**: colours for the points, round counter and ammo ring. **Menu accents**: the main menu's accent colour. **Frames**: a frame round your portrait on the HUD.
- **Sound sets**: a different hit and kill thump.
- **Mystery Box glow**: the colour of the Mystery Box's light on the map.
- **Calling cards**: shown on your rank card, in the pause menu and behind your name in the co-op lobby.`)+
        byCat.map(([cat,list])=>`<h2>${ctx.esc(cat.name)}</h2>`+c.table(['','Item','Type','Price','Rarity',''],
          list.map(i=>{const r=K.item(i);return [`<div class="rw-th">${K.thumb(i)}</div>`,`<b>${ctx.esc(i.name)}</b><br><small class="muted">${ctx.esc(String(i.desc??'').replace(DEV_NOTE,''))}</small>`,
            ctx.esc(r.type),ctx.num(i.price),rb(i.rarity),i.rotating?ctx.badge('Rotating','#d6a94a'):''];}),{cls:'compact rw-table'})).join('');
    };

    // ---- Journal ---------------------------------------------------------------------------------------------------------
    const journalPage=async c=>{
      const {JOURNAL}=await ctx.load('mods/journal/quests.js');
      const tot=JOURNAL.reduce((a,m)=>a+m.quests.length,0);
      return c.md(`The **Journal** (JOURNAL.EXE on the terminal) is your Easter egg notebook. It covers every quest on ${JOURNAL.length} maps (${tot} in all), from main Easter eggs to buildables, bow upgrades and music eggs. Step-by-step guides are on each map's page under ${ml('maps',null,'Maps')}.`)+
        `<h2>Recording steps</h2>`+c.md(`- Each step starts as **??? · NOT YET RECORDED**. The first time you do it in a match, it is written down for good, with its title and instructions, and a toast tells you.
- In co-op the quests belong to the team, so steps your team completes are recorded for you too.
- Steps you skip past in a quest that goes in order count as done.
- On the map you're playing, the Journal also marks which steps are **done this match**.`)+
        `<h2>Tracking a quest</h2>`+c.md(`Pick a quest on the map you're on and press **TRACK QUEST**. A panel at the right of the screen shows the current step: the first one not yet done this match.

- If you have recorded that step, the panel shows its instructions, and **markers** (diamonds with the distance) point to where it happens. Off-screen markers stick to the screen edge.
- Steps you haven't recorded show "Not recorded yet" and no markers. The first time through, you find it yourself.
- Spots you've already dealt with this match drop out, so the markers only show what's left. A finished quest stops tracking on its own.`)+
        `<h2>What it covers</h2>`+c.table(['Map','Quests','Steps'],JOURNAL.map(m=>[lk('maps',m.title),m.quests.length,m.quests.reduce((a,q)=>a+q.steps.length,0)]),{cls:'compact'})+
        c.spoiler('Quest names per map',JOURNAL.map(m=>`<h4>${ctx.esc(m.title)}</h4>`+c.table(['Quest','Kind','Steps'],m.quests.map(q=>[ctx.esc(q.name),ctx.esc(ctx.cap(String(q.kind).toLowerCase())),q.steps.length]),{cls:'compact'})).join(''));
    };

    // ---- Terminal unlocks (Bank, Armory, Radio) -----------------------------------------------------------------------------
    const terminalPage=async c=>{
      const [place,maps,bankSrc,armSrc,radio]=await Promise.all([ctx.json('mods/terminal-booth/placements.json').catch(()=>null),ctx.json('mods/maps.json').catch(()=>null),
        ctx.text('mods/bank/mod.js').catch(()=>''),ctx.text('mods/armory/mod.js').catch(()=>''),ctx.load('mods/radio/mod.js').catch(()=>null)]);
      const title=id=>maps?.maps.find(m=>m.id===id)?.title??ctx.cap(id);
      const booths=Object.keys(place?.maps??{}).map(id=>mlk('maps',title(id)));
      const step=+(bankSrc.match(/step:\s*(\d+)/)?.[1]??0),fee=+(bankSrc.match(/fee:\s*(\d+)/)?.[1]??0);
      // the Armory's items, read from its own table (name, home map, price, kills needed, blurb)
      const arm=[...armSrc.matchAll(/\{\s*id:\s*'[^']+',\s*name:\s*'([^']+)',\s*home:\s*'[^']+',\s*homeName:\s*'([^']+)',\s*price:\s*(\d+),\s*kills:\s*(\d+)[^]*?blurb:\s*(['"])(.*?)\5/g)]
        .map(m=>({name:m[1],home:m[2],price:+m[3],kills:+m[4],blurb:m[6]}));
      const songs=radio?.SONGS??[];
      return c.md(`Some maps have a **MelonTerm terminal booth**${booths.length?` (${booths.join(', ')})`:''}. Press the interact key at its screen to use its desktop. The game keeps running while it's open, so watch your back. Most of its apps are covered elsewhere (perks, ammo mods, gobblegums, exfil). The three below keep **account-wide** progress, and most of their actions need the power on.`)+
        `<h2>Bank</h2>`+c.md(`BANK.EXE stores points between matches and maps. It stays sealed until you reach ${ml('progression',ctx.slug('Prestige'),'Prestige Master')}, then opens by itself.`+
          (step&&fee?`\n\n- **Deposit**: ${ctx.num(step+fee)} points per ${ctx.num(step)} banked (a ${ctx.pct(fee/step)} fee).\n- **Withdraw**: free, in ${ctx.num(step)}s, ${ctx.num(step*10)}s or all at once.\n- The balance has no cap and works on every map.`:''))+
        `<h2>Armory</h2>`+c.md(`ARMORY.EXE sells special gear on maps **other than** the one it comes from. Each item must be earned first: **find** it on its home map (build or take it there), then get enough **kills** with it. After that, any other map's terminal sells it for points.`)+
        (arm.length?c.table(['Item','Home map','Kills needed','Price (points)',''],arm.map(a=>[`<b>${lk('weapons',a.name)}</b>`,lk('maps',a.home),ctx.num(a.kills),ctx.num(a.price),ctx.esc(a.blurb)]),{cls:'compact'}):'')+
        `<h2>Radio</h2>`+c.md(`RADIO.EXE is a jukebox for the maps' Easter egg songs. A song joins your radio the first time you hear its egg play it. A song from the map you're on stays locked in the radio until you've done its egg in that match. After a song ends, it rests for a few minutes before it can play again. You can queue songs, skip, seek and set the radio's volume. The map's ambience pauses while the radio plays.`)+
        (songs.length?c.spoiler(`The ${songs.length} songs and how to unlock them`,c.table(['Song','Artist','Map','Egg'],songs.map(s=>[`<b>${ctx.esc(s.title)}</b>`,ctx.esc(s.artist),lk('maps',s.mapName),ctx.esc(s.egg)]),{cls:'compact'})):'');
    };

    // ---- Career ---------------------------------------------------------------------------------------------------------------
    const careerPage=c=>c.md(`The **CAREER** tab in the main menu keeps your lifetime stats. They are recorded as you play and saved every few seconds.`)+
      `<h2>What it records</h2>`+c.md(`- **Overview**: kills, headshots, knife and Hellhound kills, rounds survived, highest round, games, deaths, points earned, shots fired, time played, perks drunk and Pack-a-Punches. It also picks your favourite weapon and most played map.
- **Maps**: the same stats for each map you play.
- **Weapons**: kills, headshots, shots, time held and Pack-a-Punches for every gun. Search and sort by kills, time or headshots.`)+
      c.md(`A kill goes to whatever did the damage last: a knife kill counts for the knife, a trap or turret for that, and an explosion for the launcher in your hands (or your grenade). In co-op, only your own kills count.`);

    // ---- Saving -----------------------------------------------------------------------------------------------------------------
    const savingPage=c=>c.md(`Your progress lives in your browser, and **signing in with Discord** also saves it to the server.`)+
      `<h2>Signed in</h2>`+c.md(`Use **Sign in with Discord** in the main menu (on the public site). Your progress is then copied to your account on the server a couple of seconds after every change, and again when you leave the page. Sign in on another device or browser and it is downloaded there. When the two copies differ, **the newest one wins**. Map rewards are always merged, so you never lose one.

If a different Discord account signs in on the same browser, the progress left by the previous account is not uploaded to the new one. The new account gets its own saved copy instead.`)+
      `<h2>Not signed in</h2>`+c.md(`Everything is kept in this browser only. Clearing the site's data, or switching browser or device, starts you over. Sign in to keep it safe. Progress you made before signing in is uploaded if your account has nothing newer.`)+
      `<h2>What is saved</h2>`+c.md(`Your level, XP, loadout and operator; weapon levels, attachments and camos; prestige; classes and skill trees; gobblegums; research; credits, challenges and Shop items; the Melon Pass; career stats; the Journal, Radio, Armory and Bank; the terminal's icon layout; your settings and key bindings; and your best rounds.`)+
      c.note('XP, credits and stats only count in normal games. Each map\'s rewards and unlocks are saved the moment you earn them.','tip');

    const pages=[
      {title:'Player Level',group:order[0],sub:`XP, levels 1 to ${R.playerLevel}`,color:'#7cd65a',keywords:'xp experience rank level up curve',html:levelPage},
      {title:'Level Unlocks',group:order[0],sub:'Weapons, bonuses, tacticals, slots',color:'#4aa3ff',keywords:'unlock loadout bonus deep pockets iron skin scavenger hollow points bandolier tactical monkey gersh qed gunsmith mystery box list starting pistol',html:unlocksPage},
      {title:'Prestige',group:order[0],sub:`Player, Master and weapon prestige`,color:PR.MASTER_COLOR,keywords:'prestige master legend token badge camo milestones title level colour',html:prestigePage},
      {title:'Credits',group:order[1],sub:'The currency you earn by playing',color:'#d6a94a',keywords:'currency payout milestones money earn',html:creditsPage},
      {title:'Challenges',group:order[1],sub:'3 daily, 3 weekly',color:'#ff9a3d',keywords:'daily weekly challenge reset',html:challengesPage},
      {title:'Shop',group:order[1],sub:`${catalog.items.filter(i=>!i.pass).length} cosmetics for credits`,color:'#b46bff',keywords:'store buy cosmetics camo reticle hitmarker theme frame calling card sound box glow bundle featured outfit',html:shopPage},
      {title:'Journal',group:order[2],sub:'Easter egg tracking',color:'#c2b5a0',keywords:'easter egg quest tracker markers journal.exe',html:journalPage},
      {title:'Terminal Unlocks',group:order[2],sub:'Bank, Armory, Radio',color:'#5fd0ff',keywords:'bank armory radio terminal melonterm deposit withdraw songs music ragnarok rocket shield annihilator',html:terminalPage},
      {title:'Career Stats',group:order[2],sub:'Lifetime stats',color:'#9d947e',keywords:'career stats kills headshots time played favourite weapon',html:careerPage},
      {title:'Saving Your Progress',group:order[2],sub:'Discord sign-in and local saves',color:'#5865f2',keywords:'save cloud sync discord sign in account local browser',html:savingPage},
    ].map(p=>({...p,id:ctx.slug(p.title),after:el=>rewardKit.fill(el)}));
    return {
      intro:ctx.md(`How your account grows: **XP and levels** unlock weapons and bonuses, **prestige** goes past the level cap, and **credits** from matches, milestones and challenges buy cosmetics in the **Shop**. The **Journal**, career stats and terminal apps keep records across matches. Signed in with Discord, all of it is saved to your account. The season track has its own section: ${ml('pass',null,'Melon Pass')}.`),
      groups:order,pages};
  },
};

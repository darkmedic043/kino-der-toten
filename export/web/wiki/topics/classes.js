// Classes: one page per class (action skills, resource, the three skill trees, synergies) plus overview pages on how
// classes work. Everything is read from the classes data at load, so numbers follow the game.
const GOLD='#d6a94a',MELON='#7cd65a',CYAN='#6fc3c9',MUTED='#9d947e',RED='#e07a5f';

// What each Ante Up game plays like (rules text the data doesn't carry; same wording as the class guide note)
const GAME={
  blackjack:['Z hits, R stands. A kill peeks at the next card, two headshots swap it.','Over 21, or under the dealer','Beat the dealer','21, or a five-card Charlie','Two-card BLACKJACK'],
  dice:['A headshot adds 1 to a die, a multikill re-rolls your lowest, Z calls it.','Under the house (two 1s: SNAKE EYES)','Over the house','Over by 5+, or any triple','Triple 6s: BOXCARS'],
  slots:['Kills nudge a reel, headshots aim it, Z cashes in.','No line, or three skulls','Any pair (cherries push)','Three of a kind','MELON 777'],
  poker:['A kill ranks up a card, a headshot makes one wild, Z or R locks the hand.','Nothing, or a low pair (jacks or better push)','Two pair to three of a kind','A straight to four of a kind','Straight flush and up'],
  fistful:['A kill holds a die, melee sets one, a headshot tumbles one, Z re-rolls once.','Scattered (two pair and low threes push)','A straight, or three 4s or better','Four of a kind or a full house','FIVE OF A KIND'],
  roulette:['Kills brake the wheel, headshots skip a pocket.','The wrong colour','Your colour','Your lucky number','GREEN 0'],
};
const MODE={auto:'Hold to fire',charge:'Hold to charge, release',semi:'Single shots',beam:'Hold for a beam'};

export default {
  id:'classes',title:'Classes',order:60,
  blurb:'Borderlands-style classes: action skills, three skill trees each, augments, capstones, resources and synergies.',
  async load(ctx){
    const {esc,badge,table,md,note,slug,infobox}=ctx;
    const C=await ctx.json('mods/classes/classes.json');
    // the menu's skill icons (plain SVG paths in the skill tree view); optional, the pages work without them
    const ICONS={};
    try{const src=await ctx.text('mods/classes/tree-view.js'),body=src.match(/const ICONS=\{([\s\S]*?)\n\};/)?.[1]??'';
      for(const m of body.matchAll(/^\s*(\w+):'([^']*)',?\s*$/gm))ICONS[m[1]]=m[2];}catch{}
    const icon=(k,color)=>ICONS[k]?`<span style="display:inline-block;width:18px;height:18px;vertical-align:-4px;margin-right:6px;color:${color??GOLD}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg></span>`:'';

    const P=v=>`${+(v*100).toFixed(2)}%`;
    const zh=v=>`${P(v)} of a zombie's health`;
    const unit=n=>n.fmt==='s'?'s':n.fmt==='n'?'':'%';
    const val=(n,v)=>n.fmt==='s'?+v.toFixed(2):n.fmt==='n'?Math.round(v):+(v*100).toFixed(1);
    const strip=d=>{d=d.replace(/^(Capstone: |Either-or with [^.]+\. )/,'');return d[0].toUpperCase()+d.slice(1);};
    // a node's effect at max rank, with the per-rank step for ranked passives
    const effect=n=>{const e=Object.values(n.effects??{})[0]??0,r=n.ranks??1,d=strip(n.desc);
      let h=esc(d).replaceAll('{v}',`<b>${val(n,e*r)}</b>`);
      if(d.includes('{v}')&&r>1)h+=` <span class="muted">(${val(n,e)}${unit(n)} per rank)</span>`;
      return h;};
    const all=x=>x.trees.flatMap(t=>t.nodes.map(n=>({...n,tree:t})));
    const nodeName=(x,id)=>all(x).find(n=>n.id===id);
    const kindBadge=(x,n)=>{
      if(n.type==='augment')return badge(n.weapon?'Augment · '+x.mech.weapons[n.weapon].name:'Augment',CYAN);
      if(n.type==='capstone')return badge('Capstone',GOLD);
      if(n.type==='weapon')return badge('Weapon unlock',MELON);
      if(n.type==='game')return badge('Game unlock',MELON);
      if(n.excl){const o=all(x).find(m=>m.excl===n.excl&&m.id!==n.id);return badge('Either-or',RED)+(o?`<br><small class="muted">locks ${esc(o.name)}</small>`:'');}
      return badge('Passive',MUTED);
    };
    const cost=n=>n.type==='augment'?'Free':n.type?'1 point':`${n.ranks} rank${n.ranks===1?'':'s'}`;
    const maxPoints=x=>all(x).reduce((a,n)=>a+(n.type==='augment'?0:n.ranks??1),0);

    // an action skill's base numbers, as readable rows
    const baseRows=a=>{const b=a.base,id=a.id,rows=[];
      const add=(k,v)=>rows.push([k,v]);
      if(b.cooldown!=null)add('Cooldown',`${b.cooldown} s`);
      if(id==='mech'){add('Integrity',`${b.duration} s (drains a second a second)`);add('Each hit costs',`${b.hitCost} s of integrity`);return rows;}
      if(b.duration!=null)add('Lasts',`${b.duration} s`);
      if(id==='wall'){add('Lasts','Until it is broken');add('Hits',`${b.health}`);add('Width',`${b.width}`);add('Height',`${b.height} (waist high)`);}
      if(id==='nest'){add('Lasts','Until it is broken');add('Hits',`${b.health} per side, ${b.health*3} for the whole nest`);add('Radius',`${b.radius}`);add('Height',`${b.height} (waist high)`);}
      if(id==='snare'){add('Lasts','Until it is worn out');add('Wear',`${b.durability} zombie-seconds (each zombie inside wears it a second a second)`);add('Damage',`${zh(b.damage)} per second`);add('Slow',P(b.slow));add('Radius',`${b.radius}`);}
      if(id==='mortar'){add('Damage',`${zh(b.damage)} per shell`);add('A shell every',`${b.interval} s`);add('Blast radius',`${b.radius}`);add('Range',`${b.range} around the beacon`);}
      if(id==='sentry'||id==='drone'){add('Damage',`${zh(b.damage)} per shot`);add('Fire rate',`${b.rate} shots/s`);add('Range',`${b.range}`);}
      return rows;};
    const statTable=rows=>table(null,rows.map(([k,v])=>[`<b>${esc(k)}</b>`,v]),{cls:'compact'});

    // one tree: its action skill (or base weapon/game) and the tier table
    const treeHtml=(x,t)=>{
      let h=`<h3 style="color:${t.color??x.color}">${esc(t.name)}</h3><p><i>${esc(t.desc)}</i></p>`;
      if(x.mech)h+=`<p>Base weapon: <b>${esc(x.mech.weapons[t.weapon].name)}</b> (always available).</p>`;
      else if(x.gambler)h+=`<p>Base game: <b>${esc(x.gambler.games[t.game].name)}</b> (always in your pool).</p>`;
      else h+=`<h4>${icon(t.action.icon,t.color)}Action skill: ${esc(t.action.name)}</h4><p>${esc(t.action.desc)}</p>${statTable(baseRows(t.action))}`;
      const nodes=[...t.nodes].sort((a,b)=>a.tier-b.tier);let last=0;
      h+=table(['Tier','Skill','Type','Points','Effect (at max rank)'],nodes.map(n=>{
        const first=n.tier!==last;last=n.tier;
        return [first?`<b>${n.tier}</b>${n.tier>1?`<br><small class="muted">${(n.tier-1)*C.tierPoints} pts</small>`:''}`:'',
          `${icon(n.icon,t.color)}<b>${esc(n.name)}</b>`,kindBadge(x,n),cost(n),effect(n)];}));
      return h;};
    const synergyTable=(x,withClass)=>table([...(withClass?['Class']:[]),'Synergy','Equip both','Bonus'],(x?[x]:C.classes).flatMap(c=>(c.synergies??[]).map(s=>{
      const a=nodeName(c,s.a),b=nodeName(c,s.b);
      return [...(withClass?[ctx.link('classes',slug(c.name))]:[]),`<b>${esc(s.name)}</b>`,`${esc(a?.name??s.a)} + ${esc(b?.name??s.b)}`,esc(s.desc)];})));
    const actions=x=>[...new Set(x.trees.map(t=>t.action.name))];
    const L=(id,label)=>ctx.link('classes',id,label);

    // ---- per-class pages
    const classPage=x=>{
      const res=x.resource;
      const box=infobox({title:x.name,color:x.color,rows:[
        ['Role',esc(x.tagline)],
        ['Action skill'+(actions(x).length>1?'s':''),actions(x).map(esc).join('<br>')],
        ['Resource',`${esc(res.name)} (max ${res.max})`],
        ['Skill trees',x.trees.map(t=>esc(t.name)).join('<br>')],
        ['Points to max all',`${maxPoints(x)} (you get ${C.xp.maxLevel})`],
        ['Synergies',String(x.synergies?.length??0)],
      ],foot:x.credit?`${esc(x.credit.text.replace(/\s*\(cut and re-animated\)/,''))}${x.credit.url?` · <a href="${esc(x.credit.url)}" target="_blank" rel="noopener">source</a>`:''}`:null});
      let h=box+`<p class="lead"><i>${esc(x.tagline)}</i></p>`;
      h+=`<h2>Resource: ${esc(res.name)}</h2><p>${esc(res.desc)}</p>`;
      if(x.mech){
        const a=x.trees[0].action,M=x.mech;
        h+=`<h2>Action skill: ${esc(a.name)}</h2><p>${icon(a.icon,x.color)}${esc(a.desc)}</p>${statTable(baseRows(a))}`;
        h+=md(`The Pilot has the same action skill in every tree. Instead of picking a tree's skill, you put **a weapon on each arm** (two different ones) in the class loadout. Each tree has a base weapon that is always available and unlocks a second one at tier 3 for a point. Pilot augments belong to one weapon and only work while it is on an arm, **${M.augmentSlots} per arm**. The capstones are mech cores and work with any weapons.

Each arm has its own heat: firing builds it and it cools when you stop. An arm that overheats locks up for a few seconds while it vents. In the cockpit you move a little slower, can't jump, and your gun keys are off: left click fires the left arm, right click the right arm, and pressing the action skill key again ejects.`);
        h+=`<h3>Arm weapons</h3>`+table(['Weapon','Tree','Firing','Damage','What it does'],Object.values(M.weapons).map(w=>{
          const t=x.trees.find(t=>t.id===w.tree),base=t?.weapon===Object.keys(M.weapons).find(k=>M.weapons[k]===w);
          const dmg=w.mode==='auto'?`${zh(w.damage)} + ${w.flat} per round, ${w.rate} rounds/s`
            :w.mode==='charge'?`${zh(w.damage)}, up to ${P(w.full)} fully charged (${w.charge} s)`
            :w.count?`${w.count} rockets, ${P(w.damage)} each (blast ${w.radius})`
            :w.pool?`${zh(w.damage)} blast (${w.radius}), then a fire pool for ${w.pool} s`
            :w.arc?`${zh(w.damage)} in a ${w.arc}° swing, reach ${w.range}`
            :w.tick?`${zh(w.damage)} every ${w.tick} s, jumps to ${w.chain} more`:zh(w.damage);
          return [`${icon(w.icon,t?.color)}<b>${esc(w.name)}</b>`,`${esc(t?.name??'')}<br><small class="muted">${base?'base weapon':'tier 3 unlock'}</small>`,MODE[w.mode]??esc(w.mode),dmg,esc(w.desc)];}));
      }else if(x.gambler){
        const a=x.trees[0].action;
        h+=`<h2>Action skill: ${esc(a.name)}</h2><p>${icon(a.icon,x.color)}${esc(a.desc)}</p>${statTable(baseRows(a))}`;
        h+=md(`The Gambler has the same action skill in every tree; each tree adds its own casino game to the pool, and a tier-3 **game unlock** adds one more. Augments can come from **any tree** (${C.augmentSlots} slots; the Devil's Tines capstone adds a third). The antes, games, rewards and jackpots are on their own page:`)+
          `<p>${L(slug('Ante Up'),'Ante Up: the Gambler\'s casino →')}</p>`;
      }else{
        h+=`<h2>Action skills</h2><p>Each tree brings its own action skill; you equip one. Its stats grow with your passives from every tree.</p>`+
          table(['Skill','Tree','Cooldown','What it does'],x.trees.map(t=>[`${icon(t.action.icon,t.color)}<b>${esc(t.action.name)}</b>`,esc(t.name),`${t.action.base.cooldown} s`,esc(t.action.desc)]));
      }
      h+=`<h2>Skill trees</h2><p>Tier 2 of a tree opens after ${C.tierPoints} points in that tree, tier 3 after ${C.tierPoints*2}, and so on up to tier 6 at ${C.tierPoints*5}. Passive values below are at max rank. See ${L(slug('How Classes Work'),'how classes work')} for augments, capstones and either-or skills.</p>`;
      for(const t of x.trees)h+=treeHtml(x,t);
      if(x.synergies?.length)h+=`<h2>Synergies</h2><p>Equip both augments of a pair to unlock the bonus.</p>`+synergyTable(x,false);
      return h;};

    // ---- Ante Up (the Gambler's casino)
    const gamblerCls=C.classes.find(x=>x.gambler);
    const antePage=()=>{
      const x=gamblerCls,g=x.gambler,a=x.trees[0].action,J=g.jackpot,tierName={win:'Win',big:'Big win'};
      const from=id=>{const t=x.trees.find(t=>t.game===id);if(t)return esc(t.name);const n=all(x).find(n=>n.game===id);return n?`${esc(n.tree.name)} <small class="muted">(tier ${n.tier} unlock)</small>`:'—';};
      let h=infobox({title:a.name,color:x.color,rows:[['Class',L(slug(x.name),x.name)],['Cooldown',`${a.base.cooldown} s`],['Games',String(Object.keys(g.games).length)],['Antes',String(g.antes.length)],['Hand',`${g.hand} cards`],['Rides',`up to ${g.ride.max}`]]});
      h+=`<p>${esc(a.desc)}</p>`;
      h+=`<h2>A Run, step by step</h2>`+md(`1. **Open the ante wheel**: hold the action skill key (Z) and point at an ante with the mouse or right stick (a pointer on the hub shows which one is lit), then click it or let go of Z on it to bet. Letting go anywhere else leaves the wheel open (a quick tap lights your last ante), so you can take your time. Keys 1-6 bet straight away; right click or Esc folds. A greyed-out ante says why and keeps the wheel open. The game, shown in the middle, is drawn at random from your pool and never repeats the last one.
2. **The game plays across your screen** while you keep shooting. Kills, headshots, melee and multikills are your moves; Z and R make the calls. The table shows the live odds of a bust, a win and a jackpot.
3. **Let It Ride**: after a win, Z flips a coin (a win pays one tier up, a loss busts) and R cashes out. Up to ${g.ride.max} rides.
4. **Payout**: the ante pays on top of the rewards, or takes its penalty on a bust. Nothing an ante pays or costs is permanent: it all wears off or comes back.`);
      h+=`<h2>Antes</h2><p>What you put on the table. A bigger stake takes more off the house edge, tilting the game toward you.</p>`+
        table(['Ante','House edge off','Stake','While it plays','Win','Bust'],g.antes.map(an=>[`<b style="color:${an.color??'inherit'}">${esc(an.name)}</b>`,Array.isArray(an.edge)?an.edge.map(P).join(' / '):P(an.edge),esc(an.stake),esc(an.table),esc(an.win),esc(an.bust)]));
      const bank=g.antes.find(an=>Array.isArray(an.edge));
      if(bank)h+=`<p class="muted">${esc(bank.name)}'s three values are before round 10, from round 10 and from round 20, like its stake.</p>`;
      h+=`<h2>Games</h2>`+table(['Game','Comes from','Your gun','Bust','Win','Big win','Jackpot'],Object.entries(g.games).map(([id,gm])=>{const r=GAME[id]??[];
        return [`${icon(gm.icon,x.color)}<b>${esc(gm.name)}</b>`,from(id),esc(r[0]??''),esc(r[1]??''),esc(r[2]??''),esc(r[3]??''),esc(r[4]??'')];}));
      h+=`<h2>Rewards</h2><p>A win pays one Win reward; a big win pays one Big win reward and one Win reward; a jackpot starts ${esc(J.name)} plus one Big win reward. Gun power-ups and totems are timed; cards wait in your hand (${g.hand}) until you play them.</p>`+
        table(['Reward','Tier','Kind','What it does'],g.rewards.map(r=>[`<b>${esc(r.name)}</b>`,r.tiers.map(t=>tierName[t]??t).join(', '),r.kind==='mod'?`Gun power-up, ${r.time} s`:r.kind==='totem'?`Totem, ${r.time} s`:'Card',esc(r.desc)]));
      h+=`<h2>Jackpot: ${esc(J.name)}</h2><p>${esc(J.desc)} Each game's jackpot adds its own extra:</p>`+
        table(['Jackpot','Extra'],Object.entries(g.extras).map(([k,v])=>[`<b>${esc(k)}</b>`,esc(v)]));
      if(g.specials){const SP=g.specials,sc=SP.scale;
        h+=`<h2>House specials</h2><p>Every game also pays its own special when you win it, on top of the rewards: ${SP.time} s on a win, ${SP.time*sc.big} s on a big win, ${SP.time*sc.jackpot} s on a jackpot. More games in your pool means more kinds of special.</p>`+
          table(['Game','Special','What it does'],Object.entries(g.games).filter(([id])=>SP[id]).map(([id,gm])=>[esc(gm.name),`<b>${esc(SP[id].name)}</b>`,esc(SP[id].desc)]));
        if(g.tour)h+=note(`<b>${esc(g.tour.name)}</b>: ${esc(g.tour.desc)}`,'tip');}
      h+=`<h2>Busts</h2><p>A bust costs the ante's stake plus the game family's penalty:</p>`+
        table(['Family','Penalty'],Object.entries(g.busts).map(([k,v])=>[`<b>${esc(k[0].toUpperCase()+k.slice(1))}</b>`,esc(v)]));
      const RUN={marker:'The Marker',ride:'Let It Ride',reshuffle:'Reshuffle',hand:'Your hand'};
      h+=`<h2>Around the table</h2><ul>${Object.entries(g.run).map(([k,v])=>`<li><b>${esc(RUN[k]??k)}</b>: ${esc(v)}</li>`).join('')}
        <li><b>Casino effects</b>: Settings → Casino effects (Full, Reduced, Minimal) tones down the marquee bulbs and screen tint.</li>
        <li><b>Co-op</b>: the table is yours alone; teammates see what your rewards do to the zombies.</li></ul>`;
      return h;};

    // ---- overview pages
    const overview=()=>{
      const special=C.classes.filter(x=>x.mech||x.gambler);
      return md(`Pick a class in the main menu under **Armory → Classes**. Each class levels up on its own as you play it, and its **action skill** goes on the action skill key (**Z** by default, rebindable in Settings).

## The loadout

Borderlands 4 style: every skill tree carries its own action skill, and you build a loadout from three kinds of skill.

- **Action skill**: equip one with the button on a tree's header. You can switch any time in the menu.
- **Passives** (hexagons) take skill points, up to their ranks, and always count, whichever action skill is equipped.
- **Augments** (diamonds) cost nothing: one unlocks as soon as its tree reaches its tier. You can equip **${C.augmentSlots}**, and only from the tree of your equipped action skill.
- **Capstone** (the star at tier 6 of each tree): one point unlocks it, and you equip **${C.capstoneSlots}**, from any tree. It works with every action skill.
- **Either-or passives**: some passives come in pairs; a point in one locks the other until you take it back out.

Left click adds a point, right click takes one out (a point can't come out if a higher tier would lose its opening). **Respec** refunds every point for free.

## Tiers

Each tree has 6 tiers. Tier 2 opens after **${C.tierPoints} points in that tree**, tier 3 after ${C.tierPoints*2}, and so on up to tier 6 at ${C.tierPoints*5}, so a capstone takes ${C.tierPoints*5+1} points in one tree. You get one point per level, ${C.xp.maxLevel} at the top level, which is not enough to fill everything: you choose.

## Classes that work differently

${special.map(x=>x.mech?`- **${x.name}**: one action skill in every tree. You pick a weapon for each arm of the mech instead, and its augments belong to a weapon (${x.mech.augmentSlots} per arm).`:`- **${x.name}**: one action skill in every tree. Each tree adds a casino game, and augments come from any tree.`).join('\n')}

## In a game

- The action skill **charges** like a field upgrade, and it's locked until the power is on.
- Each class builds its own **resource** as you play.
- Equipping both augments of a pair can unlock a **synergy**.
- In co-op, other players see your action skill and what it puts down (the Gambler's casino table is the exception: only you see it).`)+
        `<h2>The classes</h2>`+table(['Class','Role','Action skills','Resource'],C.classes.map(x=>[`<b>${L(slug(x.name),x.name)}</b>`,esc(x.tagline),actions(x).map(esc).join(', '),esc(x.resource.name)]))+
        `<p>More: ${L(slug('Levels and Skill Points'))} · ${L(slug('Charging'))} · ${L(slug('Resources'))} · ${L(slug('Synergies'))}</p>`;};

    const levelsPage=()=>{
      const X=C.xp,rows=[];let total=0;
      for(let l=1;l<X.maxLevel;l++){const need=Math.round(X.base*Math.pow(X.growth,l-1));total+=need;rows.push([l,need,total]);}
      const cols=4,per=Math.ceil(rows.length/cols),split=[];for(let i=0;i<per;i++)split.push(Array.from({length:cols},(_,k)=>rows[i+k*per]).flatMap(r=>r?[`<b>${r[0]}→${r[0]+1}</b>`,ctx.num(r[1])]:['','']));
      return md(`Each class has its own level, from 1 to **${X.maxLevel}**, and earns XP only while it's the class you play.

- **${X.kill} XP** per kill, **+${X.headshot}** for a headshot (kills by your action skill count too).
- **${X.round} XP** per round survived.

You get **one skill point per level**, the first at level 1, so ${X.maxLevel} points at the top. A capstone takes ${C.tierPoints*5+1} points in one tree, and maxing every skill of a class takes far more than ${X.maxLevel} (the class pages list how many), so a build is a choice.`)+
        `<h2>XP to the next level</h2>`+table(Array.from({length:cols},()=>['Level','XP']).flat(),split,{cls:'compact'})+
        `<p class="muted">Level 1 to ${X.maxLevel} takes ${ctx.num(total)} XP in all.</p>`;};

    const chargePage=()=>{
      const ch=C.charge,ref=ch.ref??60,rows=[];
      for(const x of C.classes)for(const a of [...new Map(x.trees.map(t=>[t.action.id,t.action])).values()]){
        const cd=a.base.cooldown,s=Math.min(1,ref/cd),k=ch.kill*s,hd=(ch.kill+ch.headshot)*s,ml=(ch.kill+ch.melee)*s;
        rows.push([`${icon(a.icon,x.color)}<b>${esc(a.name)}</b>`,L(slug(x.name),x.name),`${cd} s`,P(k),P(hd),P(ml),String(Math.ceil(1/k))]);}
      return md(`Action skills charge like Black Ops 6/7 field upgrades.

- The meter **fills over the skill's cooldown** on its own.
- Each of **your own kills** (bullets or melee) adds a share of a full charge on top: **${P(ch.kill)}** for a kill, **+${P(ch.headshot)}** for a headshot, **+${P(ch.melee)}** for a melee kill. On skills with a cooldown over ${ref} s, a kill is worth only ${ref} seconds' share, so long meters don't refill from kills alone.
- Kills made by the action skill itself don't charge it (a few skills, like the Engineer's Recycler, say otherwise), and nothing charges while the skill is out.
- The meter **starts empty** each game and fills before the power is on, but the skill is **locked until the power is on** (maps without a power switch start with it on). The HUD hex shows the charge, with NO POWER under it until then.
- Cooldown passives make the meter shorter, so the same kills fill it faster.`)+
        `<h2>Per skill (base values)</h2>`+table(['Action skill','Class','Cooldown','Per kill','Headshot kill','Melee kill','Kills to fill'],rows)+
        `<p class="muted">"Kills to fill" counts plain kills from empty, ignoring the time it charges by itself.</p>`;};

    const resourcePage=()=>md(`Every class builds its own resource as you play, shown as a bar beside the action skill on the HUD. Some passives raise its maximum or what it gives.`)+
      table(['Class','Resource','Max','How it works'],C.classes.map(x=>[L(slug(x.name),x.name),`<b style="color:${x.resource.color??'inherit'}">${esc(x.resource.name)}</b>`,x.resource.max,esc(x.resource.desc)]));

    const synergyPage=()=>md(`Each class has pairs of augments that unlock a bonus when you equip **both**. The menu lights the link when a synergy is active. Since augments come from your equipped action skill's tree (any tree for the Gambler, and per weapon for the Pilot), a synergy also decides your loadout.`)+synergyTable(null,true);

    const pages=[
      {title:'How Classes Work',group:'Guide',sub:'Loadouts, points and tiers',html:overview,keywords:'action skill augment capstone passive either-or respec loadout'},
      {title:'Levels and Skill Points',group:'Guide',sub:`Level 1-${C.xp.maxLevel}`,html:levelsPage,keywords:'xp level skill points'},
      {title:'Charging',group:'Guide',sub:'The action skill meter',html:chargePage,keywords:'cooldown charge power meter field upgrade'},
      {title:'Resources',group:'Guide',sub:C.classes.map(x=>x.resource.name).join(' · '),html:resourcePage,keywords:C.classes.map(x=>x.resource.name).join(' ')},
      {title:'Synergies',group:'Guide',sub:`${C.classes.reduce((a,x)=>a+(x.synergies?.length??0),0)} augment pairs`,html:synergyPage,keywords:'synergy augment pair'},
      ...C.classes.flatMap(x=>[
        {title:x.name,group:'Classes',sub:actions(x).join(' · '),color:x.color,html:()=>classPage(x),
          keywords:[x.tagline,x.resource.name,...x.trees.map(t=>t.name),...actions(x),...all(x).map(n=>n.name),x.mech?'mech pilot '+Object.values(x.mech.weapons).map(w=>w.name).join(' '):'',x.gambler?'casino gambling':''].join(' ')},
        ...(x.gambler?[{title:'Ante Up',group:'Classes',sub:`${x.name}'s casino`,color:x.color,html:antePage,
          keywords:'gambler casino blackjack dice slots poker roulette jackpot high roller ante '+Object.values(x.gambler.games).map(g=>g.name).join(' ')}]:[]),
      ]),
    ].map(p=>({id:slug(p.title),...p}));

    return {
      intro:md(`Melon Zombies has **${C.classes.length} classes**, each with three skill trees, an action skill on **Z** and a resource of its own. Classes level up separately; every level is a skill point.`)+
        table(['Class','Role','Action skills','Resource'],C.classes.map(x=>[`<b>${L(slug(x.name),x.name)}</b>`,esc(x.tagline),actions(x).map(esc).join(', '),esc(x.resource.name)])),
      groups:['Guide','Classes'],
      pages,
    };
  },
};

// renders classes.json as the Helm "Classes" note (prints it; --send PATCHes note 04ff973e0e). Run from the repo root.
import fs from 'fs';
const c = JSON.parse(fs.readFileSync('export/web/mods/classes/classes.json', 'utf8'));
const pct = v => `${+(v * 100).toFixed(2)}%`;
const val = (n, v) => n.fmt === 's' ? +v.toFixed(1) : n.fmt === 'n' ? Math.round(v) : Math.round(v * 100);
const desc = n => { const e = Object.values(n.effects ?? {})[0] ?? 0; return n.desc.replace(/^(Capstone: |Either-or with [^.]+\. )/, '').replaceAll('{v}', val(n, e * (n.ranks ?? 1))); };
const zh = v => `${pct(v)} of a zombie's health`;
const BASE = {
  cooldown: v => `Cooldown **${v} s**`, duration: v => `Lasts **${v} s**`, damage: v => `Damage **${zh(v)}** per hit`,
  rate: v => `**${v}** shots/s`, range: v => `Range **${v}**`, interval: v => `A shell every **${v} s**`, radius: v => `Radius **${v}**`,
  health: v => `**${v}** hits`, width: v => `Width **${v}**`, height: v => `Height **${v}**`, durability: v => `Wear **${v}** zombie-seconds`,
  slow: v => `Slows **${pct(v)}**`, hitCost: v => `Each hit costs **${v} s** of integrity`,
};
const baseLine = b => Object.entries(b).map(([k, v]) => BASE[k] ? BASE[k](v) : `${k} ${v}`).join(' · ');
const TYPE = { augment: '◆ Augment', capstone: '★ Capstone', weapon: '⚙ Weapon', game: '🎲 Game unlock' };
const out = [];
const p = s => out.push(s);
const names = new Map();
for (const x of c.classes) for (const t of x.trees) for (const n of t.nodes) names.set(n.id, n.name);

p('# Classes');
p('');
p(`Melon Zombies has **${c.classes.length} classes**, picked in the main menu's Classes tab. Each one has three skill trees, and every tree brings its own **action skill** (press **Z**).`);
p('');
p('| Class | Role | Action skills | Resource |');
p('|---|---|---|---|');
for (const x of c.classes) p(`| **${x.name}** | ${x.tagline} | ${x.trees.map(t => t.action.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')} | ${x.resource.name} |`);
p('');
p('## How classes work');
p('');
p(`- **Levels**: classes level up from kills (${c.xp.kill} XP, +${c.xp.headshot} for a headshot) and rounds survived (${c.xp.round} XP), up to level ${c.xp.maxLevel}. Each level gives one skill point.`);
p(`- **Tiers**: each tree has 6 tiers. Tier 2 opens after ${c.tierPoints} points in *that* tree, tier 3 after ${c.tierPoints * 2}, and so on up to tier 6 at ${c.tierPoints * 5} (Borderlands 4 style).`);
p('- **Passives** (hexagons) take points and always count, whichever action skill is equipped.');
p(`- **Augments** (diamonds) are free once their tier opens. You can equip **${c.augmentSlots}**, only from the tree of your equipped action skill (the Pilot and the Gambler work differently, see below).`);
p(`- **Capstone** (star): one, from any tree.
- **Either-or passives**: some passives come in pairs; putting a point in one locks the other.`);
p(`- **Charging**: the action skill's meter fills over its cooldown, like BO6/BO7 field upgrades. Each of your own kills adds ${pct(c.charge.kill)} of a full charge (+${pct(c.charge.headshot)} for a headshot, +${pct(c.charge.melee)} for melee). It's locked until the power is on and starts empty each game.`);
p('- **Resource**: each class builds its own resource as you play (below).');
p('- **Synergies**: equipping both augments of a pair unlocks a bonus effect.');
p('- **Co-op**: other players see your action skill and the things it puts down.');
p('');

for (const x of c.classes) {
  p('---');
  p('');
  p(`## ${x.name}`);
  p('');
  p(`> *${x.tagline}*`);
  p('');
  p(`**Resource: ${x.resource.name}** (max ${x.resource.max}). ${x.resource.desc}`);
  p('');
  if (x.mech) {
    p('### The mech');
    p('');
    const a = x.trees[0].action;
    p(`The Pilot has one action skill in every tree, **${a.name}**: ${a.desc}`);
    p('');
    p(`${baseLine(a.base)}`);
    p('');
    p(`Instead of picking a tree's action skill, the Pilot picks **a weapon for each arm** (two different ones). Each tree has a base weapon that's always available and unlocks a second one at tier 3. Mech augments belong to one weapon and only work while it's on an arm, **${x.mech.augmentSlots} per arm**.`);
    p('');
    p('| Weapon | Tree | Fire | What it does |');
    p('|---|---|---|---|');
    for (const w of Object.values(x.mech.weapons)) p(`| **${w.name}** | ${x.trees.find(t => t.id === w.tree).name} | ${w.mode} | ${w.desc} |`);
    p('');
  }
  if (x.gambler) {
    const g = x.gambler, a = x.trees[0].action, J = g.jackpot;
    const tierName = { win: 'Win', big: 'Big win' };
    p(`### ${a.name}`);
    p('');
    p(`The Gambler has one action skill in every tree, **${a.name}**: ${a.desc}`);
    p('');
    p(`${baseLine(a.base)}. Augments can come from **any tree** (${c.augmentSlots} slots; Devil's Tines adds a third).`);
    p('');
    p('**A Run, step by step**');
    p('');
    p(`1. **Pick an ante** (Z cycles, ${g.pick}s to choose). The game is drawn at random from your pool and never repeats the last one.`);
    p('2. **The game plays across your screen** while you keep shooting. Kills, headshots, melee and multikills are your moves; Z and R make the calls. The table shows the live odds of a bust, win and jackpot.');
    p(`3. **Let It Ride**: after a win, Z flips a coin (a win pays one tier up, a loss busts), R cashes out. ${g.run.ride.replace(/^.*Up to/, 'Up to')}`);
    p('4. **Payout**: the ante pays on top of the rewards (below), or takes its penalty on a bust.');
    p('');
    p('**Antes** (what you put on the table; a bigger stake tilts the game toward you)');
    p('');
    p('| Ante | House edge off | Stake and payout |');
    p('|---|---|---|');
    for (const an of g.antes) p(`| **${an.name}** | ${Array.isArray(an.edge) ? an.edge.map(pct).join(' / ') : pct(an.edge)} | ${an.desc} |`);
    p('');
    p('**Games**');
    p('');
    p('| Game | Comes from | Your gun | Bust · Win · Big win · Jackpot |');
    p('|---|---|---|---|');
    const GAME = {
      blackjack: ['Z hits, R stands. A kill peeks at the next card, two headshots swap it.', 'over 21 or under the dealer · beat the dealer · 21, or a five-card Charlie · two-card **BLACKJACK**'],
      dice: ['A headshot adds 1 to a die, a multikill re-rolls your lowest, Z calls it.', 'under the house (two 1s = SNAKE EYES) · over the house · over by 5+, or any triple · triple 6s, **BOXCARS**'],
      slots: ['Kills nudge a reel, headshots aim it, Z cashes in.', 'no line or three skulls · any pair (cherries push) · three of a kind · **MELON 777**'],
      poker: ['A kill ranks up a card, a headshot makes one wild, Z or R locks the hand.', 'nothing or a low pair (jacks or better push) · two pair to a three · straight to four of a kind · straight flush and up'],
      fistful: ['A kill holds a die, melee sets one, a headshot tumbles one, Z re-rolls once.', 'scattered (two pair and low threes push) · a straight or three 4s+ · four of a kind or a full house · **FIVE OF A KIND**'],
      roulette: ['Kills brake the wheel, headshots skip a pocket.', 'the wrong colour · your colour · your lucky number · **GREEN 0**'],
    };
    const from = id => x.trees.find(t => t.game === id)?.name ?? `${x.trees.find(t => t.nodes.some(n => n.game === id)).name} (tier 3)`;
    for (const [id, gm] of Object.entries(g.games)) p(`| **${gm.name}** | ${from(id)} | ${GAME[id]?.[0] ?? ''} | ${GAME[id]?.[1] ?? ''} |`);
    p('');
    p('**Rewards** (a win pays one Win reward; a big win one Big win reward and one Win reward; a jackpot starts High Roller Mode plus one Big win reward)');
    p('');
    p('| Reward | Tier | Kind | What it does |');
    p('|---|---|---|---|');
    for (const r of g.rewards) p(`| **${r.name}** | ${r.tiers.map(t => tierName[t]).join(', ')} | ${r.kind === 'mod' ? `Gun power-up, ${r.time}s` : r.kind === 'totem' ? `Totem, ${r.time}s` : 'Card'} | ${r.desc} |`);
    p('');
    p(`**${J.name}** (${J.time}s): ${J.desc} The game's jackpot adds its own extra:`);
    p('');
    p('| Jackpot | Extra |');
    p('|---|---|');
    for (const [k, v] of Object.entries(g.extras)) p(`| **${k}** | ${v} |`);
    p('');
    p('**Busts** cost the ante (above) plus the game family\'s penalty:');
    p('');
    for (const [k, v] of Object.entries(g.busts)) p(`- **${k[0].toUpperCase() + k.slice(1)}**: ${v}`);
    p('');
    p('**Around the table**');
    p('');
    for (const [k, v] of Object.entries(g.run)) p(`- **${{ marker: 'The Marker', ride: 'Let It Ride', reshuffle: 'Reshuffle', hand: 'Your hand' }[k] ?? k}**: ${v}`);
    p(`- **Casino effects**: Settings → Casino effects (Full, Reduced, Minimal) tones down the marquee bulbs and screen tint.`);
    p('');
  }
  for (const t of x.trees) {
    p(x.mech || x.gambler ? `### ${t.name}` : `### ${t.name}: ${t.action.name}`);
    p('');
    p(`*${t.desc}*`);
    p('');
    if (x.mech) p(`Base weapon: **${x.mech.weapons[t.weapon].name}**`);
    else if (x.gambler) p(`Base game: **${x.gambler.games[t.game].name}**`);
    else { p(`**${t.action.name}**: ${t.action.desc}`); p(''); p(baseLine(t.action.base)); }
    p('');
    p('| Tier | Skill | Type | Ranks | Effect (at max rank) |');
    p('|---|---|---|---|---|');
    for (const n of [...t.nodes].sort((a, b) => a.tier - b.tier)) {
      const pair = n.excl && t.nodes.concat(...x.trees.map(u => u.nodes)).find(m => m.excl === n.excl && m.id !== n.id);
      const type = n.excl ? `⬡ Either-or (vs ${pair.name})` : n.type === 'augment' && n.weapon ? `◆ Augment (${x.mech.weapons[n.weapon].name})` : TYPE[n.type] ?? '⬡ Passive';
      p(`| ${n.tier} | **${n.name}** | ${type} | ${n.type ? '-' : n.ranks} | ${desc(n)} |`);
    }
    p('');
  }
  if (x.synergies?.length) {
    p(`### ${x.name} synergies`);
    p('');
    p('| Synergy | Needs | Bonus |');
    p('|---|---|---|');
    for (const s of x.synergies) p(`| **${s.name}** | ${names.get(s.a)} + ${names.get(s.b)} | ${s.desc} |`);
    p('');
  }
}
p('---');
p('');
p(`*Generated from \`export/web/mods/classes/classes.json\` on ${new Date().toISOString().slice(0, 10)}. Engineering notes: \`docs/fork/classes.md\`.*`);
const md = out.join('\n') + '\n';
if (process.argv.includes('--send')) {
  const tok = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/helm/config.json', 'utf8')).ownerToken;
  const r = await fetch('http://127.0.0.1:7690/api/notes/04ff973e0e', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ content: md, force: true }) });
  const j = await r.json(); console.log(r.status, j.title, j.content === md ? 'identical' : 'MISMATCH', md.length);
} else console.log(md);

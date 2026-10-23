// Perks, ammo mods and Research. Built from the game's own data: the terminal's perk list (names, colours, icons and the
// effect lines players see in the PERKS app), the perk price ladder, the research tracks, the ammo mod list and the
// Melon Pass seasons (which perks are pass unlocks).
const CLASSIC = ['specialty_quickrevive', 'specialty_armorvest', 'specialty_fastreload', 'specialty_rof', 'specialty_longersprint',
  'specialty_flakjacket', 'specialty_deadshot', 'specialty_additionalprimaryweapon'];
const BO7 = ['specialty_vultureaid', 'specialty_widowswine', 'specialty_wisptea', 'specialty_deathperception', 'specialty_elementalpop',
  'specialty_meleemacchiato'];
const G = { classic: 'Classic Perks', bo7: 'Black Ops 7 Perks', reaper: 'Reaper Collection', map: 'Map Perks', other: 'More Perks',
  ammo: 'Ammo Mods', research: 'Research' };
// a few extra lines per perk on top of the in-game text
const EXTRA = {
  specialty_quickrevive: 'In co-op you revive a downed teammate in half the time. There is no self-revive in solo: a hit that would down you ends the game.',
  specialty_additionalprimaryweapon: 'Going down takes your third gun with the perk.',
};
const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const tidy = s => String(s ?? '').replace(/\s*\(the mod's[^)]*\)/g, '');

// where a pass item or gum comes from: {season, page, pageName, premium, major}
export async function passSources(ctx) {
  const out = new Map();
  try {
    const list = (await ctx.json('mods/pass/seasons.json')).seasons ?? [];
    for (const file of list) {
      const s = await ctx.json('mods/pass/' + file);
      s.pages?.forEach((p, i) => {
        const at = (r, major, premium) => { if (r?.id && !out.has(r.id)) out.set(r.id, { season: s.name, page: i + 1, pageName: p.name, premium: !!premium, major }); };
        for (const it of p.items ?? []) at(it.reward, false, it.premium);
        at(p.major?.reward, true, false);
      });
    }
  } catch (e) { console.warn('[wiki] perks: pass', e); }
  return out;
}

export default {
  id: 'perks', title: 'Perks', order: 40,
  blurb: 'Every perk you can drink, what it costs, its research augments, and the ammo mods.',
  async load(ctx) {
    const [term, rules, research, reaper, ammo, ammoSrc, settings, pass] = await Promise.all([
      ctx.load('mods/terminal-booth/desktop.js'), ctx.load('rules.js'), ctx.json('mods/research/research.json'),
      ctx.json('mods/perks-plus/reaper-perks.json').catch(() => ({ perks: {} })), ctx.load('mods/ammo-mods/mod.js'),
      ctx.text('mods/ammo-mods/mod.js').catch(() => ''), ctx.load('settings.js').catch(() => null), passSources(ctx)]);
    const { esc, md, table, infobox, badge, note, cards, num, slug } = ctx;
    const price = rules.perkPrice, base = price(0), step = price(1) - price(0);
    const reaperIds = new Set(Object.values(reaper.perks ?? {}).map(p => p.specialty));
    const items = Object.fromEntries(research.items.map(i => [i.id, i]));
    const key = id => { const b = settings?.DEFAULT_BINDS?.[id]; return b ? settings.keyName(b) : null; };
    const passText = r => r ? `Melon Pass (${esc(r.season)}): page ${r.page}, ${esc(r.pageName)}${r.major ? ' (the page reward)' : r.premium ? ', premium' : ', free'}` : null;
    // ammo mod proc chances and cooldowns live in the mod's code
    const grab = name => { const m = ammoSrc.match(new RegExp(`const ${name}\\s*=\\s*(\\{[^}]*\\})`)); try { return m ? Function(`return (${m[1]})`)() : null; } catch { return null; } };
    const PROC = grab('PROC'), COOLDOWN = grab('COOLDOWN');
    const totalXp = (research.trackCost ?? []).reduce((a, b) => a + b, 0);

    const augTable = item => {
      if (!item) return '';
      const rows = item.augments.map((a, i) => [`${i + 1}. <b>${esc(a.name)}</b><br>${a.kind === 'major' ? badge('Major', item.color) : badge('Minor')}`,
        num(research.trackCost?.[i]), esc(tidy(a.desc))]);
      return `<h2>Research augments</h2><p>Researched in order, top to bottom (${ctx.link('perks', 'research', 'how Research works')}). Equip one Major and one Minor; finishing all ${item.augments.length} masters ${esc(item.name)} and opens a second Minor slot.</p>` +
        table(['Augment', 'Research XP', 'Effect'], rows, { cls: 'compact' });
    };

    // ---- perks
    const perkPages = term.PERKS.map(p => {
      const group = CLASSIC.includes(p.id) ? G.classic : BO7.includes(p.id) ? G.bo7 : reaperIds.has(p.id) ? G.reaper : G.other;
      const item = items[p.id], unlock = p.unlock ? pass.get(p.unlock) : null, machine = CLASSIC.includes(p.id);
      return {
        id: slug(p.name), title: p.name, group, color: p.color, img: p.icon ?? p.fallback, sub: p.blurb,
        keywords: [p.badge, ...(item?.augments.map(a => a.name) ?? [])].join(' '),
        html: () => {
          let h = infobox({ title: p.name, img: p.icon ?? p.fallback, color: p.color, rows: [
            ['Price', `${num(base)} for your first perk, +${num(step)} per perk held`],
            ['Where', machine ? 'Its Perk-a-Cola machine (on maps that have one), or a terminal booth' : 'Terminal booths (PERKS app)'],
            ['Power', p.id === 'specialty_quickrevive' ? 'Not needed' : 'Needed'],
            unlock ? ['Unlock', passText(unlock)] : p.unlock ? ['Unlock', 'A Melon Pass reward'] : null,
            item ? ['Augments', `${item.augments.length} (Research)`] : null,
          ] });
          h += `<h2>Effects</h2><ul>${p.effects.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
          if (p.note) h += note(esc(p.note));
          if (EXTRA[p.id]) h += `<p>${esc(EXTRA[p.id])}</p>`;
          if (p.unlock) h += note(`Locked until you own it from the ${ctx.link('pass', null, 'Melon Pass')}. Until then the terminal shows it locked and gobblegums that hand out perks skip it.`, 'tip');
          if (p.id === 'specialty_elementalpop') h += `<p>See ${ctx.link('perks', 'ammo-mods', 'Ammo Mods')} for what each one does.</p>`;
          if (p.id === 'specialty_magnet' && key('wheel')) h += `<p>The command wheel opens while you hold <b>${esc(key('wheel'))}</b> (or the middle mouse button); rebind it in Settings → Controls. On a phone it is the WHEEL button.</p>`;
          return h + augTable(item);
        },
      };
    });
    perkPages.push({
      id: slug('Double-Dew'), title: 'Double-Dew', group: G.map, color: '#d0b020', sub: 'Cheese Cube only',
      html: () => infobox({ title: 'Double-Dew', color: '#d0b020', rows: [['Price', `The perk ladder (${num(base)} +${num(step)} per perk held)`], ['Where', `Its machine on ${mapLink(ctx, 'Cheese Cube')}`], ['Power', 'Needed']] }) +
        md('A perk from the original Cheese Cube map, behind its own door there. As in the original, it has **no effect of its own**: you drink it for the collection (it still counts toward the perk price ladder).') +
        note('Not sold at terminal booths, and gobblegums never hand it out.'),
    });

    // ---- ammo mods
    const tiersRow = m => m.tiers.map((t, i) => [badge('Tier ' + ['I', 'II', 'III'][i], m.color), esc(t), num(i ? ammo.PRICE[i + 1] : ammo.PRICE.apply), PROC ? `${Math.round(PROC[i + 1] * 100)}%` : '—']);
    const ammoPages = ammo.MODS.map(m => ({
      id: slug(m.name), title: m.name, group: G.ammo, color: m.color, sub: 'Ammo mod',
      keywords: 'ammo mod arsenal ' + (items[m.id]?.augments.map(a => a.name).join(' ') ?? ''),
      html: () => infobox({ title: m.name, color: m.color, rows: [
        ['Where', 'Terminal booths (ARSENAL app), power on'],
        ['Apply', num(ammo.PRICE.apply)], ['Tier II', num(ammo.PRICE[2])], ['Tier III', num(ammo.PRICE[3])],
        PROC ? ['Proc chance', ['I', 'II', 'III'].map((t, i) => `${Math.round(PROC[i + 1] * 100)}%`).join(' / ')] : null,
        COOLDOWN?.[m.id] != null ? ['Cooldown', ctx.secs(COOLDOWN[m.id])] : null,
      ] }) + `<p>${esc(m.desc)}</p>` +
        table(['Tier', 'Effect', 'Price', 'Proc chance'], tiersRow(m), { cls: 'compact' }) +
        `<p>Bought for the gun in your hands; it stays on that gun (Pack-a-Punch keeps it). See ${ctx.link('perks', 'ammo-mods', 'Ammo Mods')}.</p>` + augTable(items[m.id]),
    }));
    ammoPages.unshift({
      id: 'ammo-mods', title: 'Ammo Mods', group: G.ammo, color: '#ff7a2a', sub: 'Elemental rounds for one gun',
      keywords: 'arsenal proc tier',
      html: () => md(`An ammo mod gives one gun an elemental effect that goes off now and then when its bullets hit a zombie (a **proc**). Each gun carries one mod at a time, at tier I to III.

## How to get one

- With the **power on**, open the **ARSENAL** app on a terminal booth. It sells mods for the gun in your hands.
- Applying a mod costs **${num(ammo.PRICE.apply)}**. Upgrading to tier II costs **${num(ammo.PRICE[2])}**, tier III **${num(ammo.PRICE[3])}**.
- Switching to a different mod costs the apply price again and starts it back at tier I.
- The mod stays on that gun, through Pack-a-Punch too. Swap the gun away and the mod goes with it.

## How it works

- Every bullet hit rolls the tier's chance${PROC ? ` (**${Object.values(PROC).map(c => Math.round(c * 100) + '%').join(' / ')}** for tiers I / II / III)` : ''}. After a proc the gun waits a short cooldown before it can proc again.
- Damage from a mod is a share of the zombie's health, so mods keep up in high rounds.
- [Elemental Pop](${ctx.href('perks', slug('Elemental Pop'))}) sets off random tier I mods on any gun.
- Every mod has its own [Research](${ctx.href('perks', 'research')}) track of augments.`) +
        table(['Mod', 'What it does', 'Cooldown'], ammo.MODS.map(m => [ctx.link('perks', slug(m.name), m.name), esc(m.desc), COOLDOWN?.[m.id] != null ? ctx.secs(COOLDOWN[m.id]) : '—'])) +
        note('In co-op only the host runs the zombies, so slows, stuns, pulls and Brain Rot only steer zombies in the host\'s game; a guest\'s procs still deal their damage.'),
    });

    // ---- research
    const researchPage = {
      id: 'research', title: 'Research', group: G.research, color: '#d6a94a', sub: 'Augments for perks and ammo mods',
      keywords: 'augment augments major minor mastery',
      html: () => {
        const perkItems = research.items.filter(i => i.kind === 'perk'), ammoItems = research.items.filter(i => i.kind !== 'perk');
        const link = i => ctx.find('perks', slug(i.name)) ? ctx.link('perks', slug(i.name), i.name) : esc(i.name);
        const list = arr => table(['Item', 'Major augments', 'Minor augments'], arr.map(i => [link(i),
          i.augments.filter(a => a.kind === 'major').map(a => esc(a.name)).join(', '), i.augments.filter(a => a.kind !== 'major').map(a => esc(a.name)).join(', ')]), { cls: 'compact' });
        return md(`Research upgrades your perks and ammo mods with **augments**, as in Black Ops 7. You set it up from the main menu: **Armory → Research**. It opens at player level **${research.unlockLevel}** (see [Progression](${ctx.href('progression')})).

## Tracks

- Every perk and ammo mod has a track of **${research.items[0]?.augments.length ?? 8} augments**, Minor and Major in turn. You research them in order, one at a time across all tracks (switching keeps the progress you made).
- Each step costs more research XP: ${(research.trackCost ?? []).map(num).join(', ')}, **${num(totalXp)}** for a whole track.
- When one finishes, the next on the track starts by itself; after a mastered track, research moves on to the next item, and spare XP carries over.

## Research XP

- **${research.xp.kill}** per kill, **+${research.xp.headshot}** for a headshot kill, and **${research.xp.roundPerRound} × the round** for each round you survive.
- ×**${research.activeMul}** while the item you are researching is active: you own that perk, or that ammo mod is on the gun in your hands.

## Equipping

- Per item, equip **one Major and one Minor** augment you have finished. Finish the whole track (**mastery**) to open a **second Minor** slot.
- Your augments are locked in when a match starts. A perk's augments work while you have that perk; an ammo mod's while that mod is on your gun.`) +
          `<h2>Perk tracks</h2>${list(perkItems)}<h2>Ammo mod tracks</h2>${list(ammoItems)}`;
      },
    };

    const ladder = [1, 2, 3, 4, 5, 6, 7, 8].map(n => [`${ord(n)} perk`, num(price(n - 1))]);
    const order = [G.classic, G.bo7, G.reaper, G.map, G.other, G.ammo, G.research];
    const pages = [...perkPages, ...ammoPages, researchPage].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    return {
      groups: order,
      intro: md(`Perks are drinks that give you a lasting edge for the rest of the match. Walk up to a **Perk-a-Cola machine** and buy it, or buy **any** perk on any map from the **PERKS** app on a terminal booth, whether or not the map has its machine. Most perks need the power on (Quick Revive doesn't).

## Price

Every perk costs the same, set by how many perks you have already bought: **${num(base)}** for the first and **+${num(step)}** for each one after, with no cap.`) +
        table(['Perk', 'Price'], ladder, { cls: 'compact' }) +
        md(`- Free perks (from [gobblegums](${ctx.href('gobblegums')}) like [Perkaholic](${ctx.href('gobblegums', slug('Perkaholic'))})) don't raise the price.
- On Moon you can buy at most four perks.
- Going down in co-op loses every perk you hold (and Mule Kick's third gun), and the price drops back with them.

Every perk also has a track of **augments** you unlock through [Research](${ctx.href('perks', 'research')}), and the terminal's ARSENAL app sells [Ammo Mods](${ctx.href('perks', 'ammo-mods')}) for your gun. Some perks are [Melon Pass](${ctx.href('pass')}) unlocks.`) +
        ctx.spoiler('A secret at every machine', md('Go **prone** right next to a perk machine for **100 points**. Each machine pays once per game, to the first player who does it.')),
      pages,
    };
  },
};

function mapLink(ctx, name) { const id = ctx.slug(name); return ctx.find('maps', id) ? ctx.link('maps', id, name) : ctx.link('maps', null, name); }

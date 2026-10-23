// Gobblegums: one page per gum, grouped by rarity, from the game's gum list (rarities, the pack ladder, roll prices) and
// the Melon Pass seasons (which gums are pass rewards).
import { passSources } from './perks.js';

const TYPES = {
  instant: ['Instant', 'Works the moment you chew it.'],
  timed: ['Timed', 'Lasts for a set time after you chew it; the HUD counts it down.'],
  conditional: ['Conditional', 'Armed when you chew it, and goes off when its condition is met; the HUD shows it as ARMED until then.'],
};
const clock = s => s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} seconds`;
const FREE_PERK = 'Free perks don\'t raise the price of your next perk. Perks that are Melon Pass unlocks only come from it once you own them.';
// extra notes per gum, on top of its in-game description
const EXTRA = {
  perkaholic: FREE_PERK, on_the_house: FREE_PERK, soda_fountain: FREE_PERK,
  ephemeral_enhancement: 'If the gun in your hands can\'t be Pack-a-Punched, the gum won\'t chew and stays in your hand. When the time is up the gun goes back to normal.',
  crate_power: 'The gun comes with its full Pack-a-Punched ammo.', wall_power: 'The gun comes with its full Pack-a-Punched ammo.',
  idle_eyes: 'In co-op this only works in the host\'s game for now.', in_plain_sight: 'In co-op this only works in the host\'s game for now.',
  second_helping: 'A timed power-up (like Insta-Kill or Double Points) gets 30 more seconds.',
};

export default {
  id: 'gobblegums', title: 'Gobblegums', order: 50,
  blurb: 'Every gum, its rarity and how to unlock it, how to build a pack and roll gums at a terminal.',
  async load(ctx) {
    const [cfg, settings, pass] = await Promise.all([ctx.json('mods/gobblegums/gums.json'), ctx.load('settings.js').catch(() => null), passSources(ctx)]);
    const { esc, md, table, infobox, badge, note, num, slug } = ctx;
    const R = Object.fromEntries(cfg.rarities.map((r, i) => [r.id, { ...r, index: i }]));
    const key = id => { const b = settings?.DEFAULT_BINDS?.[id]; return b ? settings.keyName(b) : '?'; };
    const chew = key('gumChew'), next = key('gumNext');
    const need = (r, k) => r.base == null ? 0 : r.base + (r.step ?? 0) * (k - 1);
    const passText = r => r ? `Melon Pass (${esc(r.season)}): page ${r.page}, ${esc(r.pageName)}${r.major ? ' (the page reward)' : r.premium ? ', premium' : ', free'}` : 'Melon Pass';
    const unlockOf = g => g.pass ? passText(pass.get(g.id)) : `Player level ${g.level}`;
    const typeName = g => TYPES[g.type]?.[0] ?? ctx.cap(g.type);
    const extras = g => [g.duration ? clock(g.duration) : null, g.charges ? `${g.charges} charges` : null].filter(Boolean).join(' · ');

    // the first player level where the automatic pack is complete (enough gums, ladder satisfied)
    const firstPack = (() => {
      const lv = cfg.gums.filter(g => !g.pass).map(g => g.level).sort((a, b) => a - b);
      for (const L of [...new Set(lv)]) {
        const open = cfg.gums.filter(g => !g.pass && g.level <= L), ids = [];
        for (const r of cfg.rarities) for (const g of open) if (g.rarity === r.id) {
          const below = ids.filter(x => R[x.rarity].index < R[r.id].index).length, have = ids.filter(x => x.rarity === r.id).length;
          if (below >= need(r, have + 1)) ids.push(g);
        }
        if (ids.length >= cfg.packMin) return L;
      }
      return null;
    })();

    const sorted = [...cfg.gums].sort((a, b) => R[a.rarity].index - R[b.rarity].index || (a.pass ? 1 : 0) - (b.pass ? 1 : 0) || a.level - b.level);
    const pages = sorted.map(g => {
      const r = R[g.rarity];
      return {
        id: slug(g.name), title: g.name, group: r.name, color: r.color,
        sub: [r.name, typeName(g), extras(g), g.pass ? 'Melon Pass' : null].filter(Boolean).join(' · '),
        keywords: `gum gobblegum ${r.name} ${g.type} ${g.pass ? 'melon pass' : ''}`,
        html: () => {
          let h = infobox({ title: g.name, color: r.color, imgHtml: `<div class="gum-ball" style="height:90px;display:grid;place-items:center;margin-bottom:8px;background:#070707"><span style="width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8,${r.color} 45%,#000 120%);box-shadow:0 0 18px ${r.color}66"></span></div>`, rows: [
            ['Rarity', badge(r.name, r.color)],
            ['Type', esc(typeName(g))],
            g.duration ? ['Lasts', esc(clock(g.duration))] : null,
            g.charges ? ['Charges', num(g.charges)] : null,
            ['Unlock', unlockOf(g)],
          ] });
          h += `<p>${esc(g.desc)}</p>`;
          if (TYPES[g.type]) h += `<p class="muted">${esc(typeName(g))}: ${esc(TYPES[g.type][1])}</p>`;
          if (g.powerup || g.powerups) h += `<p>The power-up${g.powerups ? 's land' : ' lands'} a few steps in front of you instead of going off at once, so you choose when to grab ${g.powerups ? 'them' : 'it'}.</p>`;
          if (g.id === 'power_vacuum' && g.chance) h += `<p>Whenever a kill fails to drop a power-up, there is a ${Math.round(g.chance * 100)}% chance it drops one anyway. The usual limit on power-ups per round still applies.</p>`;
          if (EXTRA[g.id]) h += `<p>${esc(EXTRA[g.id])}</p>`;
          if (g.pass) h += note(`A ${ctx.link('pass', null, 'Melon Pass')} exclusive: it can't be unlocked by levelling. Once you own it, add it to your pack like any other gum.`, 'tip');
          if (r.base != null) h += `<h2>In your pack</h2><p>Each ${esc(r.name)} gum needs lower-tier gums under it: your 1st needs ${need(r, 1)}, your 2nd ${need(r, 2)}, your 3rd ${need(r, 3)} (+${r.step ?? 0} for each one after). See ${ctx.link('gobblegums', null, 'the pack ladder')}.</p>`;
          return h;
        },
      };
    });

    const ladderRows = cfg.rarities.map(r => [badge(r.name, r.color), r.base == null ? 'None' : [1, 2, 3, 4].map(k => num(need(r, k))).join(', ') + ', …',
      num(cfg.gums.filter(g => g.rarity === r.id && !g.pass).length), num(cfg.gums.filter(g => g.rarity === r.id && g.pass).length)]);
    const overview = sorted.map(g => [ctx.link('gobblegums', slug(g.name), g.name), badge(R[g.rarity].name, R[g.rarity].color), esc(typeName(g)) + (extras(g) ? `<br><small class="muted">${esc(extras(g))}</small>` : ''),
      g.pass ? 'Melon Pass' : `Level ${g.level}`, esc(g.desc)]);
    const prices = cfg.rollPrices.map((p, i) => `${['1st', '2nd', '3rd', '4th', '5th'][i] ?? i + 1 + 'th'} ${num(p)}`).join(', ');

    return {
      groups: cfg.rarities.map(r => r.name),
      intro: md(`Gobblegums are one-shot boosts you chew during a match. You never start a match with any: you **roll** them at a terminal booth from a **pack** you build in the main menu. Gums are not used up: your pack is the same every match.

## Your pack

- Build it in the main menu: **Armory → Gobblegums**. Until you change it you play with an automatic pack of every gum you've unlocked that fits.
- A pack needs at least **${cfg.packMin} gums**. Gums unlock as your player level rises; some only come from the [Melon Pass](${ctx.href('pass')}).
- Rarer gums need lower-tier gums under them in the pack, on a rising ladder (like the perk prices): the table shows how many lower-tier gums your 1st, 2nd, 3rd… gum of each rarity needs.${firstPack ? ` Your first full pack is possible at player level **${firstPack}**.` : ''}`) +
        table(['Rarity', 'Lower-tier gums needed', 'Gums', 'Melon Pass gums'], ladderRows, { cls: 'compact' }) +
        md(`The more rare gums a pack holds compared with common ones, the more often you roll them: a roll picks evenly from your pack, minus the gums already in your hand.

## In a match

- Open the **GUMS** app on a terminal booth and roll. The price goes up with each roll in a round (${prices}), up to **${cfg.rollsPerRound} rolls a round**.
- You hold up to **${cfg.handSize} gums**. With a full hand you can still roll, then swap the new gum for one you hold or keep your hand.
- **${chew}** chews the selected gum, **${next}** selects the next one (rebind them in Settings → Controls). The HUD shows your hand, timers for timed gums and ARMED for conditional ones.
- Your hand is lost when the match ends.

## Types

- **Instant**: works the moment you chew it.
- **Timed**: lasts a set time.
- **Conditional**: waits, armed, until something sets it off (some have several charges).

## Every gum`) + table(['Gum', 'Rarity', 'Type', 'Unlock', 'Effect'], overview),
      pages,
    };
  },
};

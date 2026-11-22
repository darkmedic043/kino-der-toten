// Gorod Krovi's tiles in the Tab scoreboard (mods/scoreboard: kino.scoreboard.addCollectible), as Der Eisendrache's and
// Nuketown's tab.js (2026-11-22, user: "add the collectiables in the tab menu for gorod"): the Guard of Fafnir's parts and
// its upgrade, the dragon network's three parts (drop pods) and the cylinder in hand, the Gauntlet of Siegfried, the
// Dragon Strike and its upgrade, the Groph challenges, the main Easter egg's step and its six key figures, the three
// wearables, the music eggs, the ethereal logs and the time attack. Parts rows read dark = not found, white = carried / in
// progress, gold = done. Each tile reads its system's own handle (gk.<system>.state) when Tab is open, and hides its row
// as "—" when that system isn't in this game (a missing asset, ?noStrike). The quests run on the host / solo (their own
// headers), so a co-op guest sees their own game's copy, as on Der Eisendrache.
const NET = [['Radio', 'Tx'], ['Codes', 'Cb'], ['Map', 'Ma']]   // the transmitter, the code book, the map;
const SHIELD = [['dolly', 'Head', 'He'], ['door', 'Pelvis', 'Pe'], ['clamp', 'Window', 'Wi']];
const KEYS = [['Blob', 'Bl'], ['Nuke', 'Nu'], ['Soldier', 'So'], ['Drone', 'Dr'], ['Symbol', 'Sy'], ['Pod', 'Po']];
const EE_STAGES = ['generator', 'password', 'keys', 'scenarios', 'cores', 'escape', 'hatch', 'arena'];
const EE_PARTS = [['Power', 'Ge'], ['Code', 'Pw'], ['Keys', 'Ke'], ['Tasks', 'Ta'], ['Core', 'Co'], ['Escape', 'Es'], ['Hatch', 'Ha'], ['Nikolai', 'Ni']];
const SC_NAMES = { pod: 'Cargo defence', escort: 'Escort the Valkyrie', mangler: 'Capture the Mangler', timed: 'Security system', pursue: 'The anomaly', terminal: 'Data download' };
// the Gauntlet's quest (gauntlet.js STEPS) as six slots: the egg cooked, three kill counts, the incubator, the grave
const G_SLOTS = [['Egg', 'Eg', ['boards', 'egg', 'carry', 'placed', 'bathed', 'cooled']], ['Napalm', 'Na', ['napalm']], ['Pierce', 'Pi', ['pierce']],
  ['Melee', 'Me', ['melee']], ['Incubate', 'In', ['incubate', 'lockdown', 'hot', 'collect']], ['Grave', 'Gr', ['done']]];   // done = hatched, S.given = taken
const G_TEXT = { boards: 'Free the egg (Pavlov\'s sewer)', egg: 'Take the egg', carry: 'Lay it in the dragon\'s path', placed: 'Waiting for the dragon\'s fire',
  bathed: 'Cooling for a round', cooled: 'Take the egg back', incubate: 'To the incubator', hot: 'Cooling for a round', collect: 'Take it from the incubator',
  done: 'Take it from the grave by the fountain' };
const MELEE = [null, 'Wrench', 'Ritual Dagger', 'Fire Axe', 'Sword', 'Daisho'];
const NEED = 5;   // wearables.js NEED

export default function setupTab(api, gk) {
  const { host, session } = api;
  const part = (label, state, short) => ({ label, short, state });
  const stage = (have, done) => (done ? 'placed' : have ? 'carried' : 'none');
  const prog = (n, need) => (n >= need ? 'placed' : n > 0 ? 'carried' : 'none');
  const read = k => { try { return gk[k]?.state ? (typeof gk[k].state === 'function' ? gk[k].state() : gk[k].state) : null; } catch { return null; } };
  const shield = () => { try { return window.kino?.gorod?.shield?.state?.() ?? null; } catch { return null; } };
  const add = def => window.kino.scoreboard.addCollectible(def);
  function register() {
    // the Guard of Fafnir: the team's three parts and the bunker's table, then this player's upgrade
    add({ id: 'gk-shield', label: 'Guard of Fafnir',
      parts: () => { const s = shield(); return SHIELD.map(([k, l, sh]) => part(l, s ? stage(s.have.includes(k), s.built) : 'none', sh)); },
      value: () => { const s = shield(); return !s ? '—' : s.built ? (s.held ? 'Built · in hand' : 'Built · at the bunker') : `${s.have.length} / 3 parts`; },
      done: () => !!shield()?.built });
    add({ id: 'gk-shield-up', label: 'Fafnir upgrade',
      parts: () => { const q = shield()?.quest ?? {}; const k = q.kills >= 50, r = q.runes >= 3;
        return [part('Kills', q.done || k ? 'placed' : q.kills ? 'carried' : 'none', 'Ki'), part('Runes', q.done || r ? 'placed' : k ? 'carried' : 'none', 'Ru'),
          part('Fire', q.done || q.bathed ? 'placed' : r ? 'carried' : 'none', 'Fi'), part('Fountain', q.done ? 'placed' : q.bathed ? 'carried' : 'none', 'Fo')]; },
      value: () => { const s = shield(); if (!s) return '—'; const q = s.quest;
        return q.done ? 'Upgraded' : q.busy ? 'In the fountain' : q.kills < 50 ? `Shield kills ${q.kills} / 50` : q.runes < 3 ? `Runes burnt ${q.runes} / 3` : !q.bathed ? 'Stand in the dragon\'s fire' : 'To the fountain'; },
      done: () => !!shield()?.quest?.done });
    // the dragon network: the drop pods' three parts into the console by Pavlov's stairs (without pods.js the power crafts it)
    add({ id: 'gk-network', label: 'Dragon network',
      parts: () => { const p = read('pods'), c = gk.hasFlag('dragonridecrafted'); return NET.map(([l, sh], i) => part(l, c || p?.placed.includes(i) ? 'placed' : p?.carried.includes(i) ? 'carried' : 'none', sh)); },
      value: () => { const p = read('pods'); if (gk.hasFlag('dragonridecrafted')) return 'Crafted · the roosts fly'; if (!p) return session.power ? 'Crafted' : 'Needs power';
        const cyl = p.held ? ` · ${p.held} cylinder` : p.cylinder ? ` · a ${p.cylinder.colour} cylinder dropped` : '';
        return p.active ? `A pod is down${cyl}` : `${p.placed.length} / 3 placed${p.carried.length ? `, ${p.carried.length} carried` : ''}${cyl}`; },
      done: () => gk.hasFlag('dragonridecrafted') });
    // the Gauntlet of Siegfried (this player's quest)
    add({ id: 'gk-gauntlet', label: 'Gauntlet of Siegfried',
      parts: () => { const g = gk.gauntlet; const s = g?.state ?? 'boards', at = G_SLOTS.findIndex(([, , st]) => st.includes(s)), done = !!g?.S.given;
        return G_SLOTS.map(([l, sh], i) => part(l, done || (at >= 0 && i < at) ? 'placed' : i === at ? 'carried' : 'none', sh)); },
      value: () => { const g = gk.gauntlet; if (!g) return '—'; const s = g.state, S = g.S; if (S.given) return 'Yours';
        if (['napalm', 'pierce', 'melee'].includes(s)) return `${s[0].toUpperCase() + s.slice(1)} kills ${S.kills} / ${g.N()}`;
        if (s === 'lockdown') return `Incubator kills ${S.incKills} / ${g.incGoal()}`;
        return G_TEXT[s] ?? s; },
      done: () => !!gk.gauntlet?.S.given });
    // the Dragon Strike: the console, the first lockdown, then its upgrade
    add({ id: 'gk-strike', label: 'Dragon Strike',
      parts: () => { const s = read('strike'); if (!s) return null; const f = new Set(s.flags), up = s.owned === 'upgraded';
        return [part('Console', f.has('dragonstrikeunlocked') ? 'placed' : s.pressed ? 'carried' : 'none', 'Co'), part('Lockdown', f.has('dragonstrikequestcomplete') ? 'placed' : f.has('dragonstrikeunlocked') ? 'carried' : 'none', 'Lo'),
          part('Kills', up || s.stage >= 2 ? 'placed' : s.stage === 1 && s.kills ? 'carried' : 'none', 'Ki'), part('Banners', up || s.stage >= 4 ? 'placed' : s.stage === 3 ? 'carried' : 'none', 'Ba'),
          part('Upgrade', up || s.stage >= 5 ? 'placed' : s.stage === 4 ? 'carried' : 'none', 'Up')]; },
      value: () => { const s = read('strike'); if (!s) return '—'; const f = new Set(s.flags);
        if (s.owned === 'upgraded') return `Upgraded · ${s.ammo} charge${s.ammo === 1 ? '' : 's'}`;
        if (f.has('draconiteavailable')) return 'Upgrade ready at the console';
        if (!f.has('dragonstrikequestcomplete')) return !f.has('dragonstrikeunlocked') ? (s.pressed ? 'Console pressed · the team must too' : 'Press the console (Pavlov\'s 2F)')
          : !f.has('dragonpavlovfirsttime') ? 'Ride a dragon to Pavlov\'s' : 'Survive Pavlov\'s lockdown';
        if (!s.owned) return 'Take it from the console';
        if (s.stage === 1) return `Strike kills ${s.kills} / ${s.need1}`;
        if (s.stage === 3) { const live = s.banners.filter(b => b.live), hit = live.filter(b => b.hit).length; return live.length && hit >= live.length ? (s.upPressed ? 'Console pressed' : 'Press the console again') : `Banners burnt ${hit} / ${live.length}`; }
        if (s.stage === 4) return `Lockdown strike kills ${s.upKills} / ${s.need4}`;
        return `Owned · ${s.ammo} charge${s.ammo === 1 ? '' : 's'}`; },
      done: () => read('strike')?.owned === 'upgraded' });
    // the Groph challenges at this player's grave (claimed = gold, done and waiting = white)
    add({ id: 'gk-groph', label: 'Groph challenges',
      parts: () => (read('challenges')?.tiers ?? []).map((t, i) => part(`Tier ${i + 1}`, t.claimed ? 'placed' : t.done ? 'carried' : 'none', String(i + 1))),
      value: () => { const s = read('challenges'); if (!s) return '—'; const t = s.tiers, ready = t.filter(x => x.done && !x.claimed).length;
        if (!t.length) return 'None drawn';
        const next = t.find(x => !x.done);
        return ready ? `${ready} reward${ready > 1 ? 's' : ''} at the grave` : next ? `${next.text} · ${Math.floor(next.n)} / ${next.need}` : 'All claimed'; },
      done: () => { const t = read('challenges')?.tiers; return !!t?.length && t.every(x => x.claimed); } });
    // the main Easter egg, "Love and War": its step, then the six key figures for the war map's shelf
    add({ id: 'gk-ee', label: 'Love and War',
      parts: () => { const s = read('ee'); const at = s ? (s.stage === 'done' ? EE_STAGES.length : EE_STAGES.indexOf(s.stage)) : -1;
        return EE_PARTS.map(([l, sh], i) => part(l, i < at ? 'placed' : i === at ? 'carried' : 'none', sh)); },
      value: () => { const s = read('ee'); if (!s) return '—';
        switch (s.stage) {
          case 'generator': return s.generator?.charged ? (s.tubes?.solved ? 'Take the cylinder' : 'Route the pneumatic tubes') : 'Charge the generator (a Valkyrie)';
          case 'password': return 'S.O.P.H.I.A.\'s password';
          case 'keys': return `Figures found ${s.keys.length} / 6 · placed ${s.placed.length} / 6`;
          case 'scenarios': return s.scen ? `Task ${s.task + 1} / 6: ${SC_NAMES[s.scen] ?? s.scen}` : `${s.task} / 6 tasks · the map button`;
          case 'cores': return 'The weapon core to the mech';
          case 'escape': return 'Follow S.O.P.H.I.A.';
          case 'hatch': return 'Everyone onto the hatch';
          case 'arena': return 'Defeat Nikolai';
          case 'done': return 'Complete';
          default: return s.stage;
        } },
      done: () => read('ee')?.stage === 'done' });
    add({ id: 'gk-ee-keys', label: 'Key figures',
      parts: () => { const s = read('ee'); return KEYS.map(([l, sh], i) => part(l, s ? stage(s.keys.includes(i), s.placed.includes(i)) : 'none', sh)); },
      value: () => { const s = read('ee'); return !s ? '—' : s.placed.length >= 6 ? 'All on the shelf' : `${s.keys.length} / 6 found · ${s.placed.length} placed`; },
      done: () => (read('ee')?.placed?.length ?? 0) >= 6 });
    // the wearables (shared counts): the Mangler helmet, the Valkyrie hat, the dragon wings
    const worn = k => (read('wear')?.worn === k ? ' · worn' : '');
    const opened = k => !!read('wear')?.open?.includes(k);
    add({ id: 'gk-wear-raz', label: 'Mangler Helmet',
      parts: () => { const r = read('wear')?.raz ?? {}; return [part('Cannons', prog(r.arms, NEED), 'Ar'), part('Masks', prog(r.masks, NEED), 'Ma')]; },
      value: () => { const w = read('wear'); return !w ? '—' : opened('raz') ? 'Unlocked' + worn('raz') : `Cannons ${w.raz.arms} / ${NEED} · masks ${w.raz.masks} / ${NEED}`; },
      done: () => opened('raz') });
    add({ id: 'gk-wear-sentinel', label: 'Valkyrie Hat',
      parts: () => { const r = read('wear')?.sentinel ?? {}; return [part('Arms', prog(r.arms, NEED), 'Ar'), part('Cameras', prog(r.cams, NEED), 'Ca')]; },
      value: () => { const w = read('wear'); return !w ? '—' : opened('sentinel') ? 'Unlocked' + worn('sentinel') : `Drones dearmed ${w.sentinel.arms} / ${NEED} · cameras ${w.sentinel.cams} / ${NEED}`; },
      done: () => opened('sentinel') });
    add({ id: 'gk-wear-wings', label: 'Dragon Wings',   // the shield used, the Gauntlet and the Strike taken, a ride from each roost
      parts: () => { const w = read('wear')?.wings ?? { roosts: [] }, r = w.roosts ?? [];
        return [part('Shield', w.shield ? 'placed' : 'none', 'Sh'), part('Gauntlet', w.gauntlet ? 'placed' : 'none', 'Ga'), part('Strike', w.strike ? 'placed' : 'none', 'St'),
          part('Library', r.includes('library') ? 'placed' : 'none', 'Li'), part('Factory', r.includes('factory') ? 'placed' : 'none', 'Fa'), part('Judicial', r.includes('judicial') ? 'placed' : 'none', 'Ju')]; },
      value: () => { const w = read('wear'); if (!w) return '—'; if (opened('wings')) return 'Unlocked' + worn('wings');
        const n = ['shield', 'gauntlet', 'strike'].filter(k => w.wings[k]).length + w.wings.roosts.length; return `${n} / 6 steps`; },
      done: () => opened('wings') });
    // side eggs
    add({ id: 'gk-music', label: 'Music eggs',
      parts: () => { const e = read('eggs'); if (!e) return null; return [part('Bottles', prog(e.bottles, 3), 'Vo'), part('Aces', prog(e.cards, 3), 'Ac'), part('Box', e.sam.step >= 8 ? 'placed' : e.sam.step || e.sam.areas.length ? 'carried' : 'none', 'Sa')]; },
      value: () => { const e = read('eggs'); return !e ? '—' : `Bottles ${e.bottles} / 3 · aces ${e.cards} / 3${e.sam.step >= 8 ? ' · Samantha done' : e.sam.step ? ' · Samantha started' : e.sam.areas.length ? ` · fires ${e.sam.areas.length} / 3` : ''}`; },
      done: () => { const e = read('eggs'); return !!e && e.bottles >= 3 && e.cards >= 3 && e.sam.step >= 8; } });
    add({ id: 'gk-logs', label: 'Ethereal logs',
      value: () => { const e = read('eggs'); if (!e) return '—'; const L = e.logs; return L.stage >= 4 ? 'All 10 heard' : L.stage >= 2 ? `${L.i} / 10 shot` : L.stage === 1 ? 'They spoke · next round end' : 'From round 14'; },
      done: () => (read('eggs')?.logs?.stage ?? 0) >= 4 });
    add({ id: 'gk-time', label: 'Time attack',
      value: () => { const t = read('eggs')?.timeAttack; if (!t) return '—'; return t.reward ? `${MELEE[t.reward]} on the wall${t.bought === t.reward ? ' · bought' : ''}` : 'Beat round 5 in time'; },
      done: () => (read('eggs')?.timeAttack?.reward ?? 0) >= 5 });
  }
  // the scoreboard (a core mod) may set up after this map's mod
  if (window.kino?.scoreboard) register();
  else { const off = host.on('update', () => { if (!window.kino?.scoreboard) return; off?.(); register(); }); }
}

// Weapons: every gun, wonder weapon, operator weapon and piece of equipment a player can get, and the systems around
// them (attachments, camos, weapon levels, weapon prestige, Pack-a-Punch, the Mystery Box). The weapon table is built
// the way the main menu builds it: the base game's weapons plus the weapon add-ons' prepare() steps, so every number
// here is the game's own. Unlock levels and rarities come from the progression list, attachments from the Gunsmith
// catalogue (its own unlock track per gun), camos from the camo list.
const UNIT = 39.37;   // game units per metre
const BIG = 99999;    // a range this long means "no fall-off"

// display groups: weapon class (camo.js weaponClass) → group
const CLASS_GROUP = {
  'Pistol': 'Pistols', 'Submachine gun': 'Submachine guns', 'Rifle': 'Assault rifles', 'Shotgun': 'Shotguns',
  'Light machine gun': 'Light machine guns', 'Sniper rifle': 'Sniper rifles', 'Launcher': 'Launchers',
  'Special': 'Specials', 'Death Machine': 'Specials', 'Wonder weapon': 'Wonder weapons',
};
const SYS = 'How it works';
const GROUPS = ['Pistols', 'Submachine guns', 'Assault rifles', 'Shotguns', 'Light machine guns', 'Sniper rifles', 'Launchers',
  'Specials', 'Wonder weapons', 'Operator weapons', 'Equipment', SYS];

// Wall buys on the custom maps (they're placed inside each map's level file, so they're listed here).
// Kino der Toten's and Moon's come from their level data at load.
const CUSTOM_WALLS = {
  'sandbox': ['m14_zm', 'rottweil72_zm', 'mp40_zm', 'dragunov_zm'],
  'cheese-cube': ['bo3_g18_death', 'bo3_mp7_flanker', 'cheese_gun', 'bo3_tommy_modern', 'bo3_sa80', 'bo3_ak117', 'bo3_f2000_tech'],
  'der-eisendrache': ['rpk_zm', 'bo3_ak117', 'm16_zm', 'bo3_g18_death', 'ithaca_zm', 'ak74u_zm', 'mpl_zm', 'famas_zm', 'm14_zm', 'mp5k_zm', 'cz75_zm'],
  'the-giant': ['m16_zm', 'ithaca_zm', 'cz75_zm', 'm14_zm', 'mpl_zm', 'mp5k_zm', 'famas_zm', 'bo3_ak117', 'bo3_g18_death'],
};
// Moon's wonder weapons, as the game adds them to every other map
const MOON_IDS = ['microwavegundw_zm', 'microwavegun_zm', 'minigun_zm'];
const MOON_UPGRADE_NAMES = { microwavegundw_zm: "Porter's Zap Guns", microwavegun_zm: "Porter's Mark II Ray Gun" };
const MOON_EQUIPMENT = ['zombie_black_hole_bomb', 'zombie_quantum_bomb'];
const DE_BOWS = ['bo3_wrath_ancients', 'bo3_bow_storm', 'bo3_bow_rune', 'bo3_bow_wolf', 'bo3_bow_demon'];

// What a weapon does beyond its numbers (written from the game's own behaviour). md text; {Name} links to that weapon.
const NOTES = {
  m1911_zm: 'The pistol everyone starts with, unless your loadout picks another pistol for the starting slot.',
  ray_gun_zm: 'Fires fast green bolts that burst where they land, hurting every zombie in the splash. The classic Mystery Box prize.',
  thundergun_zm: 'Each blast kills every zombie you can see in a wide cone in front of you, out to about 15 m, and throws the bodies. Only two shots a magazine, so reload between crowds.',
  microwavegun_zm: 'A microwave cone: each shot pops every zombie you can see in front of you, out to about 25 m (about 36 m once upgraded). Press **B** to split it back into the {microwavegundw_zm}; each form keeps its own ammo, and a Max Ammo refills both.',
  microwavegundw_zm: 'A pair of pistols, one in each hand. Any hit kills, whatever the round. Press **B** to snap them together into the {microwavegun_zm}; each form keeps its own ammo.',
  minigun_zm: 'The barrels have to spin up (about 0.75 s, 0.45 s once upgraded) before it fires. Holding aim spins them too, so you can spin up before a push. Unlike the original, this one can be Pack-a-Punched.',
  tesla_gun_zm: 'Each shot arcs lightning to the zombie nearest your aim (out to about 25 m), then chains on to zombies close to that one (within about 7.5 m), killing up to 10 a shot. Upgraded: further arcs and chains, up to 24 kills a shot.',
  freezegun_zm: 'Each shot hits every zombie in a narrow column ahead of you, harder up close. Zombies it kills freeze solid and stand as ice statues: shoot or walk into one to shatter it, which hurts the zombies around it. Survivors slow down a step.',
  bo3_bow: 'Its arrows stick in whatever they hit and explode. Drawing the next arrow is its reload.',
  bo3_wrath_ancients: 'Der Eisendrache\'s bow. Its arrows explode where they land. It also starts the four elemental bow quests, each of which turns it into one of the elemental bows.',
  bo3_bow_storm: 'One of Wrath of the Ancients\' four elemental upgrades, earned through its own quest on Der Eisendrache.',
  bo3_bow_rune: 'One of Wrath of the Ancients\' four elemental upgrades, earned through its own quest on Der Eisendrache.',
  bo3_bow_wolf: 'One of Wrath of the Ancients\' four elemental upgrades, earned through its own quest on Der Eisendrache. Its arrows send spirit wolves running down the line of the shot.',
  bo3_bow_demon: 'One of Wrath of the Ancients\' four elemental upgrades, earned through its own quest on Der Eisendrache.',
  grimhawk_zm: 'Fires homing flechettes: aim down the sight and the rounds steer into the zombies you\'re looking at. Its Long Barrel makes them home from the hip instead.',
  siren_zm: 'A charge weapon: hold the trigger to charge an orb (about 2 s for a full charge), let go to fire. Orbs pierce through zombies. Double-tapping the trigger charges twice as fast. Upgraded, its orbs also entrance zombies, and the orb sings.',
  havoc_zm: 'A grenade launcher whose rounds stick where they land. Press the aim button to set them all off.',
  roc_zm: 'A 20 mm cannon. Each shell punches through zombies and shoves them aside. Its ammo attachments turn it into very different weapons (high-explosive, incendiary, shotgun canister and more).',
  xm325_zm: 'A belt-fed machine gun. Its attachments include an overheating 500-round belt and a second gun for your other hand.',
  cheese_gun: 'Cheese Cube Unlimited\'s own gun, sold on two of the map\'s walls in place of the MP40. It hits for 250 at any range and is always in the Swiss Cheese camo.',
  crossbow_explosive_zm: 'Its bolts stick in whatever they hit, then explode.',
  knife_ballistic_zm: 'Fires its blade.',
  cz75_zm: 'Its Akimbo attachment puts a second CZ75 in your other hand.',
};
const SPOILERS = {
  bo3_wrath_ancients: ['How to get it', 'Get kills near each of the castle\'s three dragon heads (8 in each dragon\'s area) to feed it. When all three are fed, the bow appears in a red glow in the Family Crypt in the undercroft chapel. You can take it once a game, for free.'],
  cheese_gun: ['Cheese Brothers', 'Five Cheese Brothers targets are hidden around the map, and only the Cheese Gun can capture them: 2,000 points each, and another 4,000 for all five.'],
};

export default {
  id: 'weapons', title: 'Weapons', order: 30,
  blurb: 'Every gun, wonder weapon and piece of equipment: stats, Pack-a-Punch, where to get them, attachments and camos.',
  async load(ctx) {
    const [gd, prog, cat, cats, mapList, moonMap, moonCombat, shopCat, prestigeRules, gs, camo, loader] = await Promise.all([
      ctx.json('game-data.json'), ctx.json('mods/progression/progression.json'), ctx.json('mods/weapon-levels/attachments.json'),
      ctx.json('mods/weapon-levels/camos.json'), ctx.json('mods/maps.json').then(d => d.maps).catch(() => []),
      ctx.json('moon/map-data.json').catch(() => null), ctx.json('moon/combat-data.json').catch(() => null),
      ctx.json('mods/shop/catalog.json').catch(() => null), ctx.json('mods/prestige/prestige.json').catch(() => ({})),
      ctx.load('mods/weapon-levels/gunsmith.js'), ctx.load('mods/weapon-levels/camo.js'), ctx.load('mod-loader.js'),
    ]);
    const P = { masterXp: 500, masterMax: 250, masterCamoAt: 50, ...prestigeRules };

    // ---- the weapon table, built like the main menu builds it -------------------------------------------------
    let data = { weapons: structuredClone(gd.weapons), equipment: structuredClone(gd.equipment ?? {}), boxPool: [...(gd.boxPool ?? [])] };
    if (moonCombat) {   // Moon's wonder weapons and tacticals, on every map
      for (const id of MOON_IDS) {
        const def = structuredClone(moonCombat.weapons?.[id]); if (!def) continue;
        Object.assign(def, { projectileSpeed: 0, explosionRadius: 0 });
        if (def.upgrade) Object.assign(def.upgrade, { projectileSpeed: 0, explosionRadius: 0, name: def.upgrade.name ?? MOON_UPGRADE_NAMES[id] });
        if (id === 'minigun_zm') {
          Object.assign(def, { reloadTime: 3, reloadEmptyTime: 3 });
          def.upgrade ??= { name: 'The Reaper', clipSize: 750, maxAmmo: 1500, startAmmo: 1500, damage: 900, minDamage: 550, range: 2200, headMultiplier: 2.5, reloadTime: 2.6, reloadEmptyTime: 2.6 };
        }
        data.weapons[id] = def;
      }
      data.boxPool = [...new Set([...data.boxPool, 'microwavegun_zm', 'minigun_zm'])];
      for (const id of MOON_EQUIPMENT) if (moonCombat.equipment?.[id]) data.equipment[id] = { ...moonCombat.equipment[id], tactical: true };
      data.boxPool = [...new Set([...data.boxPool, ...MOON_EQUIPMENT])];
    }
    for (const id of ['wonder-weapons', 'bo3-weapons', 'bo7-weapons']) {   // in the game's load order
      try {
        const mod = await ctx.load(`mods/${id}/mod.js`);
        if (mod.prepare) data = (await mod.prepare(data, { id, url: new URL(ctx.url(`mods/${id}/`)) })) ?? data;
      } catch (e) { console.info('[wiki] weapons: no', id, e?.message); }
    }
    try { (await ctx.load('mods/weapon-levels/akimbo.js')).foldAkimbo(data); } catch (e) { console.info('[wiki] weapons: no akimbo fold', e?.message); }   // dual-wield pairs are the Akimbo attachment
    try { loader.resolveWeapons(data); } catch {}
    const W = data.weapons;
    if (W.mp40_zm) W.cheese_gun = { ...structuredClone(W.mp40_zm), id: 'cheese_gun', baseId: 'mp40_zm', name: 'Cheese Gun', price: 1000, damage: 250, minDamage: 250, clipSize: 30, startAmmo: 210, maxAmmo: 210 };

    // ---- lookups -----------------------------------------------------------------------------------------------
    const progById = Object.fromEntries(prog.weapons.map(w => [w.id, w]));
    const rarities = Object.fromEntries((prog.rarities ?? []).map(r => [r.id, r]));
    const equipProg = Object.fromEntries([...(prog.tactical ?? []).map(t => [t.id, { ...t, kind: 'Tactical' }]), ...(prog.lethal ?? []).map(t => [t.id, { ...t, kind: 'Lethal' }])]);
    const mapTitle = Object.fromEntries(mapList.map(m => [m.id, m.title]));
    // wall buys: weapon id → [map ids]
    const walls = new Map();
    const addWall = (map, id) => { if (!W[id]) return; if (!walls.has(id)) walls.set(id, []); if (!walls.get(id).includes(map)) walls.get(id).push(map); };
    for (const e of gd.entities ?? []) if (e.targetname === 'weapon_upgrade') addWall('kino', e.zombie_weapon_upgrade);
    for (const e of moonMap?.entities ?? []) if (e.targetname === 'weapon_upgrade') addWall('moon', e.zombie_weapon_upgrade);
    for (const [map, ids] of Object.entries(CUSTOM_WALLS)) if (mapTitle[map]) for (const id of ids) addWall(map, id);
    const pool = new Set(data.boxPool);

    // which weapons get a page: anything you can unlock, buy off a wall, or earn in a quest
    const isPlayable = id => !/upgraded/.test(id) && W[id] && !W[id].suitWeapon && !W[id].hideGun && (progById[id] || walls.has(id) || DE_BOWS.includes(id));
    const ids = Object.keys(W).filter(isPlayable);
    const cls = id => { const k = camo.weaponClass(W[id]); return k === 'Rifle' ? 'Assault rifle' : k; };
    const groupOf = id => CLASS_GROUP[camo.weaponClass(W[id])] ?? 'Specials';
    // guns that open in the Gunsmith (attachments, or camos alone)
    const hasSmith = id => W[id].gunsmith === true || Object.keys(W[id].mounts ?? {}).length > 0 || gs.available(cat, W[id], id).length > 0;
    // page ids: the display name; a clash gets its class added
    const names = new Map();
    for (const id of ids) { const s = ctx.slug(W[id].name); names.set(s, (names.get(s) ?? 0) + 1); }
    const pageId = Object.fromEntries(ids.map(id => { const s = ctx.slug(W[id].name); return [id, names.get(s) > 1 ? ctx.slug(W[id].name + ' ' + cls(id)) : s]; }));
    const titleOf = id => names.get(ctx.slug(W[id].name)) > 1 ? `${W[id].name} (${cls(id)})` : W[id].name;

    // ---- formatting ---------------------------------------------------------------------------------------------
    const { num, esc } = ctx;
    const metres = u => `${num(Math.round(u / UNIT * (u / UNIT < 10 ? 10 : 1)) / (u / UNIT < 10 ? 10 : 1))} m`;
    const rpm = d => d.fireTime > 0 && d.clipSize !== 1 ? Math.round(60 / d.fireTime) : null;   // one-round weapons are paced by the reload
    const up = d => d?.upgrade ? { ...d, ...d.upgrade } : null;
    const projectile = d => d.projectileSpeed > 0 && !/thundergun/.test(d.baseId ?? d.id);
    const rarityBadge = id => { const r = rarities[progById[id]?.rarity ?? equipProg[id]?.rarity]; return r ? ctx.badge(r.name, r.color) : ''; };
    const colorOf = id => rarities[progById[id]?.rarity ?? equipProg[id]?.rarity]?.color;
    const wlink = (c, id, label) => pageId[id] ? c.link('weapons', pageId[id], label ?? titleOf(id)) : esc(label ?? W[id]?.name ?? id);
    const sys = (c, title, label) => c.link('weapons', c.slug(title), label ?? title);
    const mapLink = (c, map) => { const t = mapTitle[map] ?? map; return c.find('maps', c.slug(t)) ? c.link('maps', c.slug(t), t) : esc(t); };
    const notes = (c, id) => (NOTES[id] ?? '').replace(/\{(\w+)\}/g, (m, k) => `[${W[k]?.name ?? k}](${pageId[k] ? c.href('weapons', pageId[k]) : '#/weapons'})`);

    function damageText(d) {
      if (/thundergun/.test(d.baseId ?? d.id)) return 'Kills everything it hits';
      if (/microwavegun/.test(d.baseId ?? d.id)) return 'Kills everything it hits';
      if (/tesla_gun/.test(d.baseId ?? d.id)) return 'Kills every zombie it arcs to';
      if (/freezegun/.test(d.baseId ?? d.id)) return d.name === W.freezegun_zm?.name ? '1,000 up close, 500 at range' : '1,500 up close, 750 at range';
      if (!(d.damage > 0)) return null;
      let s = num(Math.round(d.damage));
      if (d.pellets > 1) s += ` × ${d.pellets} pellets`;
      if (projectile(d)) s += ' on a direct hit';
      else if (d.range < BIG && d.minDamage !== d.damage) s += ` (${num(Math.round(d.minDamage))} past ${metres(d.range)})`;
      return s;
    }
    const blastText = d => d.explosionRadius > 0 && d.explosionInnerDamage ? `${num(d.explosionInnerDamage)} to ${num(d.explosionOuterDamage)} within ${metres(d.explosionRadius)}` : null;
    const ammoText = d => d.clipSize > 0 ? `${num(d.clipSize)} + ${num(d.maxAmmo)}` : null;

    // ---- class-wide maxima for the comparison bars ----------------------------------------------------------------
    const byGroup = new Map();
    for (const id of ids) { const g = groupOf(id); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(id); }
    const dmgPerShot = d => (d.damage || 0) * Math.max(1, d.pellets || 1);
    const maxOf = (g, f) => Math.max(1, ...(byGroup.get(g) ?? []).map(id => f(W[id]) || 0));

    // ---- one weapon page -------------------------------------------------------------------------------------------
    function weaponPage(id) {
      const d = W[id], g = groupOf(id), pr = progById[id], t = gs.track(cat, d, id), maxLv = gs.maxLevel(cat, d, id);
      const sub = [cls(id), pr ? (pr.kit ? 'from the start' : `level ${pr.level}`) : null].filter(Boolean).join(' · ');
      return {
        id: pageId[id], title: titleOf(id), group: g, color: colorOf(id), sub,
        keywords: [d.upgrade?.name, cls(id), id === 'microwavegun_zm' ? 'zap guns' : '', id === 'microwavegundw_zm' ? 'wave gun' : ''].filter(Boolean).join(' '),
        html: c => {
          const u = up(d);
          const where = [];
          for (const map of walls.get(id) ?? []) where.push(`Wall buy on ${mapLink(c, map)}`);
          if (id !== 'cheese_gun') {
            if (pool.has(id) && pr) where.push(`${sys(c, 'Mystery Box')} (in it by default)`);
            else if (pr) where.push(`${sys(c, 'Mystery Box')} (switch it on in your box list)`);
          }
          if (DE_BOWS.includes(id)) where.push(`Quest on ${mapLink(c, 'der-eisendrache')}`);
          const unlock = pr ? (pr.kit ? `Yours from the start${hasSmith(id) && (pr.gunsmith ?? 1) > 1 ? ` · its Gunsmith opens at player level ${pr.gunsmith}` : ''}` : `Player level ${pr.level}`) : DE_BOWS.includes(id) ? 'Quest only' : 'This map only';
          const price = walls.has(id) ? `${num(d.price)} · ammo ${num(d.ammoPrice ?? Math.ceil(d.price / 2))}` : null;
          const box = c.infobox({
            title: titleOf(id), color: colorOf(id),
            rows: [
              ['Class', `${esc(cls(id))} ${rarityBadge(id)}`],
              ['Damage', damageText(d)],
              blastText(d) ? ['Blast', blastText(d)] : null,
              d.headMultiplier > 1 && !projectile(d) ? ['Headshots', `×${num(d.headMultiplier)}`] : null,
              ['Fire mode', esc(d.fireType ?? '')],
              rpm(d) ? ['Fire rate', `${num(rpm(d))} rounds/min`] : null,
              ['Ammo', ammoText(d) ? `${ammoText(d)} <span class="muted">(magazine + reserve)</span>` : null],
              d.reloadTime ? ['Reload', d.reloadEmptyTime && Math.abs(d.reloadEmptyTime - d.reloadTime) > .05 ? `${c.secs(d.reloadTime)} (empty ${c.secs(d.reloadEmptyTime)})` : c.secs(d.reloadTime)] : null,
              price ? ['Wall price', price] : null,
              ['Pack-a-Punch', u ? (u.name === d.name ? 'Yes (keeps its name)' : esc(u.name)) : 'Can\'t be upgraded'],
              ['Get it', where.join('<br>') || '—'],
              ['Unlock', esc(unlock)],
              ['Attachments', t.length ? `${t.length} · ${maxLv} weapon levels` : 'None'],
            ],
          });
          let h = box;
          const n = notes(c, id); if (n) h += c.md(n);
          if (SPOILERS[id]) h += c.spoiler(SPOILERS[id][0], c.md(SPOILERS[id][1]));
          // compared with the rest of its group
          if (d.damage > 0 && (byGroup.get(g)?.length ?? 0) > 2 && !/thundergun|microwavegun/.test(d.baseId ?? id)) {
            const rows = [
              ['Damage per shot', dmgPerShot(d), maxOf(g, dmgPerShot)],
              ['Fire rate', rpm(d), maxOf(g, rpm)],
              ['Magazine', d.clipSize, maxOf(g, x => x.clipSize)],
              ['Reserve', d.maxAmmo, maxOf(g, x => x.maxAmmo)],
            ].filter(r => r[1] > 0).map(([k, v, m]) => [k, `${c.bar(v / m, `${num(v)} of the class best ${num(m)}`)} ${num(v)}`]);
            h += `<h2>Against other ${esc(g.toLowerCase())}</h2>` + c.table(null, rows, { cls: 'compact' }) +
              `<p class="muted">Bars are against the best in its group.</p>`;
          }
          // Pack-a-Punch
          if (u) {
            const stat = [
              ['Damage', damageText(d), damageText(u)], ['Blast', blastText(d), blastText(u)],
              ['Headshots', d.headMultiplier > 1 ? `×${num(d.headMultiplier)}` : null, u.headMultiplier > 1 ? `×${num(u.headMultiplier)}` : null],
              ['Fire mode', d.fireType, u.fireType], ['Fire rate', rpm(d) && `${num(rpm(d))}/min`, rpm(u) && `${num(rpm(u))}/min`],
              ['Ammo', ammoText(d), ammoText(u)], ['Reload', d.reloadTime && c.secs(d.reloadTime), u.reloadTime && c.secs(u.reloadTime)],
            ].filter(([, a, b]) => (a || b) && a !== b).map(([k, a, b]) => [k, esc(a ?? '—'), `<b>${esc(b ?? '—')}</b>`]);
            h += u.name === d.name ? '<h2>Pack-a-Punch</h2>' : `<h2>Pack-a-Punch: ${esc(u.name)}</h2>`;
            h += stat.length ? c.table(['', 'Base', 'Upgraded'], stat, { cls: 'compact' }) : c.md('Upgrading it keeps its stats.');
            if (d.upgrade?.attachment && !t.some(x => x.att.underbarrel)) h += c.md('The upgraded gun also carries an underbarrel weapon: press **5** to switch to it.');
          }
          // attachments, in unlock order
          if (t.length) {
            h += `<h2>Attachments</h2>` + c.table(['Level', 'Attachment', 'Slot', 'What it does'], t.map(x => [x.level, `<b>${esc(x.att.name)}</b>`, esc(cat.slots[x.att.slot] ?? x.att.slot), esc(x.att.desc)]), { cls: 'compact' }) +
              c.md(`Kills with this gun level it up to ${maxLv}; each attachment unlocks at the level shown. See ${'[' + 'Weapon levels' + '](' + c.href('weapons', c.slug('Weapon levels')) + ')'} and ${'[' + 'Attachments' + '](' + c.href('weapons', c.slug('Attachments')) + ')'}.`);
          }
          // camos
          if (hasSmith(id)) {
            const pc = [1, 2, 3].map(tier => camo.prestigeCamo(`pr${tier}:${id}`)).filter(Boolean);
            const alt = cats.alt?.[id];
            h += `<h2>Camos</h2>` + c.md(`Camo challenges with this gun: ${cats.camos.filter(x => x.challenge && x.count && !x.reward && !x.shop).map(x => `${x.name} (${num(x.count)} ${(cats.challenges[camo.challengeOf(cats, id, x)] ?? '').toLowerCase()})`).join(', ')}. See [Camos](${c.href('weapons', c.slug('Camos'))}).`) +
              (pc.length ? `<p>Its own prestige camos (see ${sys(c, 'Weapon prestige')}):</p><p>${pc.map((x, i) => `<span class="swatch" data-swatch="${esc(x.id)}" style="width:42px;height:42px;margin-right:10px;vertical-align:middle"></span><b>${esc(x.name)}</b> <span class="muted">${['Prestige I', 'Prestige II', `Prestige Master, level ${P.masterCamoAt}`][i]}</span>`).join('<br>')}</p>` : '');
            if (alt) h += c.note('This gun can\'t score headshots, so its headshot challenge counts crowd kills instead.', 'tip');
          } else {
            h += c.md('It has no Gunsmith: no weapon levels, attachments, camos or prestige.');
          }
          return h;
        },
        after: el => camo.fillSwatches(el, k => camo.camoById(cats, k)),
      };
    }

    const pages = ids.sort((a, b) => W[a].name.localeCompare(W[b].name)).map(weaponPage);

    // ---- operator weapons (bought from the terminal's Armory once earned on their home map) ----------------------
    const OPS = [
      { title: 'Ragnarok DG-4', color: '#5fb8ff', home: 'der-eisendrache', price: 30000, kills: 250, charge: 60,
        how: 'Built from parts on Der Eisendrache.',
        rows: [['Charge', '60 kills (headshots count 1.5)'], ['Drain', '2.5% a second while held (40 s)']],
        text: 'Gravity spikes. Press **Y** to pull them out once the meter is full.\n\n- **Left mouse** slams both spikes into the ground: zombies within about 5 m die and those out to twice that are thrown back. Slamming on the way down from a jump reaches about 7.5 m. Each slam costs 12% of the meter.\n- **Right mouse** plants them where you stand. A gravity field (about 5.5 m across) lifts every zombie that walks in and holds it in the air; picking the spikes up again with either button, or running out of meter, slams them all down dead. Planted, the meter drains 10% a second.\n- The Panzersoldat isn\'t lifted; a slam does 1,500 damage to it.' },
      { title: 'Annihilator', color: '#f2c14e', home: 'the-giant', price: 25000, kills: 150, charge: 50,
        how: 'The Fly Trap\'s prize on The Giant.',
        rows: [['Charge', '50 kills (headshots count 1.5)'], ['Shots', '18 a charge (the meter is its ammo)']],
        text: 'Seraph\'s revolver. Press **Y** to pull it out once the meter is full.\n\n- Each round goes through up to 8 zombies in its path: 2,000 damage to the body, 4,000 to the head (a one-shot headshot kill up to round 24). Kills disintegrate.\n- About one shot a second. **Right mouse** aims down the sight, **V** pistol-whips for 100.' },
      { title: 'Rocket Shield', color: '#ff9a3a', home: 'der-eisendrache', price: 20000, kills: 250,
        how: 'Built from parts on Der Eisendrache.',
        rows: [['Health', '1,500, then it breaks'], ['Rocket charges', '3']],
        text: 'A riot shield with rockets bolted on. Press **H** to raise it and again to lower it.\n\n- Raised, it blocks hits from the front; on your back, hits from behind.\n- **Left mouse** bashes the two nearest zombies in front of you (killing them up to 2,500 health) and knocks the rest back.\n- **Right mouse** fires the rockets: a short dash that kills everything in the way. Charges come back from nitrous tanks on Der Eisendrache, and one a round on other maps.\n- A Carpenter repairs it.' },
    ];
    for (const o of OPS) pages.push({
      id: ctx.slug(o.title), title: o.title, group: 'Operator weapons', color: o.color, sub: mapTitle[o.home] ?? '',
      keywords: 'operator armory',
      html: c => c.infobox({ title: o.title, color: o.color, rows: [
        ['Slot', o.charge ? 'Operator weapon' : 'Shield'], ...o.rows,
        ['Home map', mapLink(c, o.home)], ['Get it', esc(o.how)],
        ['Armory', `${num(o.price)} points after ${num(o.kills)} kills with it`],
      ] }) + c.md(o.text) + `<h2>The Armory</h2>` +
        c.md(`Once you have found it on its home map, get ${num(o.kills)} kills with it. After that, every other map sells it from the ARMORY app on a terminal for ${num(o.price)} points (with the power on). On its home map you build or earn it instead.`),
    });

    // ---- equipment ---------------------------------------------------------------------------------------------
    for (const [eid, e] of Object.entries(equipProg)) {
      const def = data.equipment[eid];
      if (!def && eid !== 'frag_grenade_zm') continue;
      const name = e.name ?? def?.name;
      pages.push({
        id: ctx.slug(name), title: name, group: 'Equipment', color: rarities[e.rarity]?.color, sub: `${e.kind} · level ${e.level}`,
        keywords: 'grenade equipment ' + e.kind,
        html: c => {
          const where = [];
          if (eid === 'claymore_zm') where.push(`Wall buy on ${mapLink(c, 'kino')} (1,000)`);
          if (eid === 'frag_grenade_zm') where.push(`Wall buy on ${mapLink(c, 'kino')}`);
          if (pool.has(eid)) where.push(`${sys(c, 'Mystery Box')}`);
          where.push('Your loadout');
          return c.infobox({ title: name, color: rarities[e.rarity]?.color, rows: [
            ['Type', `${esc(e.kind)} ${rarityBadge(eid)}`],
            def?.explosionRadius ? ['Blast radius', metres(def.explosionRadius)] : null,
            ['Unlock', `Player level ${e.level}`], ['Get it', where.join('<br>')],
          ] }) + c.md(`${e.description}.`) +
            c.md(e.kind === 'Tactical'
              ? `Tacticals go in your loadout's tactical slot, which opens at player level ${prog.tacticalLevel ?? 6}. Press **X** to throw one.`
              : 'Lethals go in your loadout\'s lethal slot.') +
            (eid === 'zombie_black_hole_bomb' ? c.md('Walk into the black hole yourself and it teleports you.') : '');
        },
      });
    }

    // ---- system pages ------------------------------------------------------------------------------------------
    const cumXp = [0]; for (let L = 1; L < cat.levels; L++) cumXp.push(cumXp[L - 1] + gs.xpToNext(cat, L));
    const papGuns = ids.filter(id => W[id].upgrade?.name).sort((a, b) => W[a].name.localeCompare(W[b].name));
    const challengeCamos = cats.camos.filter(x => x.challenge && x.count && !x.reward && !x.shop && !x.pass);
    const shopItems = Object.fromEntries((shopCat?.items ?? []).map(i => [i.id, i]));
    const swatch = (id, size = 28) => `<span class="swatch" data-swatch="${esc(id)}" style="width:${size}px;height:${size}px;margin-right:8px;vertical-align:middle"></span>`;
    const fill = el => camo.fillSwatches(el, k => camo.camoById(cats, k));
    const generic = cat.attachments.filter(a => a.generic);
    const takers = new Map(cat.attachments.map(a => [a.id, []]));
    for (const id of ids) for (const x of gs.track(cat, W[id], id)) takers.get(x.att.id)?.push(id);

    pages.push({
      id: ctx.slug('Attachments'), title: 'Attachments', group: SYS, keywords: 'gunsmith optic suppressor scope underbarrel',
      html: c => c.md(`Every gun with a Gunsmith has attachments to unlock. Kills with the gun earn it weapon XP, and each new attachment unlocks at one of its weapon levels (see [Weapon levels](${c.href('weapons', c.slug('Weapon levels'))})). Attachments are **never put on automatically**: equip them in the **Gunsmith**, from the main menu (Loadout, then OPEN GUNSMITH) or from the pause menu for the gun in your hands. Hovering a locked attachment previews it.

You can fit one attachment per slot: ${Object.values(cat.slots).join(', ')}. What you fit is saved for that gun and applies to every copy you pick up, from a wall or from the box.

- **Optics**: fitting one folds the gun's iron sights away. Guns with a built-in scope (Dragunov, L96A1, G11, AUG, Crossbow) only take optics made to replace it.
- **Scopes**: hold **Shift** while scoped to hold your breath for 3 s (almost no sway), then you gasp for a moment. The Variable Zoom steps 4×, 6×, 8× and 10× with the mouse wheel. The IR Scope makes zombies glow white.
- **Underbarrels** (Grenade Launcher, Masterkey, Flamethrower): press **5** to switch to them and back.
- **Suppressors**: kills get one extra 1% roll for a power-up drop, on top of the usual chance.
- One-round weapons (bows, most launchers) have no magazine attachments.
- Guns with fewer than ${cat.padTo} attachments of their own are topped up with general upgrades (${generic.map(a => a.name).join(', ')}, in that order) so every gun has something to work toward.`) +
        c.note(`Guns without a Gunsmith have no attachments: ${ids.filter(id => !hasSmith(id) && !gs.track(cat, W[id], id).length).sort((a, b) => W[a].name.localeCompare(W[b].name)).map(id => wlink(c, id)).join(', ')}.`, 'tip') +
        Object.entries(cat.slots).map(([slot, label]) => {
          const list = cat.attachments.filter(a => a.slot === slot && takers.get(a.id)?.length);
          if (!list.length) return '';
          return `<h2>${esc(label)}</h2>` + c.table(['Attachment', 'What it does', 'Guns'], list.map(a => {
            const g = takers.get(a.id);
            return [`<b>${esc(a.name)}</b>`, esc(a.desc), g.length > 12 ? `${g.length} guns` : g.map(id => wlink(c, id)).join(', ')];
          }), { cls: 'compact' });
        }).join(''),
    });

    pages.push({
      id: ctx.slug('Camos'), title: 'Camos', group: SYS, keywords: 'gold diamond camouflage challenges',
      html: c => {
        let h = c.md(`Each gun has its own camo challenges. Progress counts on that gun only, and you pick the camo it wears in the Gunsmith (tabs: THIS GUN for its own camos, GLOBAL for camos you can put on any gun).`);
        h += `<h2>Challenges</h2>` + c.table(['Camo', 'Challenge'], challengeCamos.map(x => [`${swatch(x.id)}<b>${esc(x.name)}</b>`, `${num(x.count)} ${esc((cats.challenges[x.challenge] ?? '').toLowerCase())}`]), { cls: 'compact' });
        const altGuns = Object.keys(cats.alt ?? {}).filter(id => pageId[id]);
        if (altGuns.length) h += c.md(`Guns that can't score headshots (${altGuns.map(id => `[${W[id].name}](${c.href('weapons', pageId[id])})`).join(', ')}) count **${(cats.challenges.crowd ?? 'crowd kills').toLowerCase()}** in place of headshots.`);
        const gold = cats.camos.find(x => x.mastery), diamond = cats.camos.find(x => x.classMastery);
        h += `<h2>Mastery</h2>` + c.table(['Camo', 'How'], [
          gold && [`${swatch(gold.id)}<b>${esc(gold.name)}</b>`, `Finish all ${challengeCamos.length} challenges on that gun.`],
          diamond && [`${swatch(diamond.id)}<b>${esc(diamond.name)}</b>`, `Get ${esc(gold?.name ?? 'Gold')} on every gun in a class, and the whole class gets ${esc(diamond.name)}. Specials have no ${esc(diamond.name)}.`],
        ].filter(Boolean), { cls: 'compact' });
        const reward = cats.camos.filter(x => x.reward);
        if (reward.length) h += `<h2>Map rewards</h2>` + c.table(['Camo', 'How'], reward.map(x => [`${swatch(x.id)}<b>${esc(x.name)}</b>`, esc(cats.challenges[x.challenge] ?? '') + '. Wear it on any gun.']), { cls: 'compact' });
        const shop = cats.camos.filter(x => x.shop && !x.pass);
        if (shop.length) h += `<h2>Shop camos</h2>` + c.md(`Bought with credits in the Shop (see ${c.link('progression')}). Some only show up in the daily or weekly offers until you own them. Once bought, wear them on any gun.`) +
          c.table(['Camo', 'Price'], shop.map(x => { const i = shopItems[x.shop]; return [`${swatch(x.id)}<b>${esc(x.name)}</b>`, i ? `${num(i.price)} credits` : '—']; }), { cls: 'compact' });
        const pass = cats.camos.filter(x => x.pass);
        if (pass.length) h += `<h2>Melon Pass camos</h2>` + c.md(`Earned from the Melon Pass (see ${c.link('pass')}). Wear them on any gun.`) +
          `<p>${pass.map(x => `${swatch(x.id, 22)}${esc(x.name)}`).join('<br>')}</p>`;
        h += `<h2>Prestige camos</h2>` + c.md(`Every gun has three camos of its own, earned by prestiging it (see [Weapon prestige](${c.href('weapons', c.slug('Weapon prestige'))})). Once earned they can be worn on any gun. Each gun's page shows its three.`);
        h += `<h2>Pack-a-Punch</h2>` + c.md('An upgraded gun that keeps its normal model wears the animated Pack-a-Punch camo instead of your chosen one. Guns with a model of their own once upgraded keep their camo.');
        return h;
      },
      after: fill,
    });

    pages.push({
      id: ctx.slug('Weapon levels'), title: 'Weapon levels', group: SYS, keywords: 'weapon xp level gunsmith',
      html: c => c.md(`Every kill with a gun earns that gun **${cat.xp.kill} XP**, and a headshot kill **${cat.xp.kill + cat.xp.headshot} XP**. Kills that count include bullets, explosions, fire, freezing and the special kills of wonder weapons.

Guns with a Gunsmith have **${cat.levels} weapon levels**. Their attachments are spread from level 2 to level ${cat.levels - 2}; the levels between have no unlock but still count toward [Weapon prestige](${c.href('weapons', c.slug('Weapon prestige'))}). Each gun's page lists which attachment comes at which level. When something unlocks you get a message in game; equip it in the Gunsmith.

Guns without a Gunsmith (most wonder weapons) have a single level: nothing to unlock.`) +
        `<h2>XP per level</h2>` + c.table(['Level', 'XP to next', 'Total XP', 'Kills (no headshots)'],
          cumXp.slice(1).map((tot, i) => [i + 1, gs.xpToNext(cat, i + 1), tot, Math.ceil(tot / cat.xp.kill)]).concat([[cat.levels, '—', cumXp.at(-1), Math.ceil(cumXp.at(-1) / cat.xp.kill)]])
            .map(([l, n, tot, k], i) => [l, n, i === 0 ? 0 : cumXp[i], i === 0 ? 0 : Math.ceil(cumXp[i] / cat.xp.kill)]), { cls: 'compact' }) +
        c.md(`Getting a gun from level 1 to ${cat.levels} takes ${num(cumXp.at(-1))} XP: about ${num(Math.ceil(cumXp.at(-1) / cat.xp.kill))} kills, fewer with headshots.`),
    });

    pages.push({
      id: ctx.slug('Weapon prestige'), title: 'Weapon prestige', group: SYS, keywords: 'prestige master camo armory',
      html: c => c.md(`Once a gun with a Gunsmith reaches its top weapon level (${cat.levels}), you can prestige it. The prestige button needs two clicks, so you can't do it by accident.

1. **Prestige I**: the gun goes back to level 1 and loses its unlocked attachments (camo progress stays). You earn its first prestige camo.
2. **Prestige II**: the same again, for its second prestige camo.
3. **Prestige Master**: nothing resets. From now on, XP the gun earns at its top level fills **Master levels** (${num(P.masterXp)} XP each, up to ${num(P.masterMax)}). Master level ${P.masterCamoAt} earns its animated Master camo.

Every gun's prestige camos are its own design; once earned you can wear them on any gun. Player prestige can also hand out tokens that unlock a gun's Prestige I or II camo without the grind (see ${c.link('progression')}).`) +
        `<h2>Some examples</h2>` + c.table(['Gun', 'Prestige I', 'Prestige II', 'Prestige Master'],
          ['m16_zm', 'ray_gun_zm', 'bo3_ak117', 'grimhawk_zm', 'spas_zm'].filter(id => pageId[id] && gs.maxLevel(cat, W[id], id) > 1).map(id => [wlink(c, id),
            ...[1, 2, 3].map(tier => { const x = camo.prestigeCamo(`pr${tier}:${id}`); return x ? `${swatch(x.id)}${esc(x.name)}` : '—'; })]), { cls: 'compact' }),
      after: fill,
    });

    pages.push({
      id: ctx.slug('Pack-a-Punch'), title: 'Pack-a-Punch', group: SYS, keywords: 'pap upgrade machine',
      html: c => c.md(`The Pack-a-Punch machine upgrades the gun in your hands for **5,000 points**. On most maps the power has to be on first; where the machine is differs per map (see ${c.link('maps')}).

- The machine takes your gun for about 4 seconds while it works. Then you have about 15 seconds to take it back, or it's gone.
- The upgraded gun comes back with a full magazine and full reserve, a new name and better stats (each gun's page lists exactly what changes). Its shots get an extra Pack-a-Punch sound.
- You can't upgrade a gun twice.
- Ammo for an upgraded gun from its wall buy costs **4,500**.
- Upgraded guns that use their normal model wear the animated Pack-a-Punch camo.`) +
        `<h2>Every upgrade</h2>` + c.table(['Weapon', 'Upgraded name', 'Damage', 'Ammo'], papGuns.map(id => {
          const d = W[id], u = up(d);
          return [wlink(c, id), `<b>${esc(u.name)}</b>`, damageText(u) ?? '—', ammoText(u) ?? '—'];
        }), { cls: 'compact' }),
    });

    pages.push({
      id: ctx.slug('Mystery Box'), title: 'Mystery Box', group: SYS, keywords: 'box teddy bear fire sale rarity',
      html: c => {
        const rar = prog.rarities ?? [];
        const total = rar.reduce((a, r) => a + (r.weight ?? 1), 0);
        const inPool = ids.filter(id => pool.has(id) && progById[id]).sort((a, b) => W[a].name.localeCompare(W[b].name));
        return c.md(`A spin costs **950 points** (10 during a Fire Sale). The box cycles for about 4 seconds, then you have 12 seconds to take the weapon before it sinks back in. It never offers a weapon you're already holding.

**The teddy bear.** Sometimes the box shows a teddy bear instead: you get your 950 back and the box moves somewhere else on the map. The chance depends on how many times it has been used since it last moved:

- Uses 1 to 3: never.
- Uses 4 to 7: 15%.
- Use 8 onward: certain if the box hasn't moved yet this game; otherwise 30% up to use 12, then 50%.
- Fire Sale spins never move the box.

**Your box list.** In the main menu's Loadout you choose which unlocked weapons and equipment your box can roll. Weapons that are normally in the box start switched on; any other weapon you've unlocked can be switched on too. Each rarity keeps a minimum switched on: ${Object.entries(prog.box?.minPerTier ?? {}).map(([r, n]) => `${n} ${rarities[r]?.name ?? r}`).join(', ')} (or all of that rarity you have, if fewer). Some maps have their own box with their own prizes.`) +
          `<h2>Rarity weights</h2>` + c.md('Each roll is weighted by the weapon\'s rarity: a weapon with a higher weight comes up more often than one with a lower weight.') +
          c.table(['Rarity', 'Weight'], rar.map(r => [`<span class="swatch" style="background:${r.color}"></span>${esc(r.name)}`, `${c.bar((r.weight ?? 1) / Math.max(...rar.map(x => x.weight ?? 1)), '')} ${num(r.weight ?? 1)}`]), { cls: 'compact' }) +
          `<h2>In the box by default</h2>` + c.cards(inPool.map(id => ({ href: c.href('weapons', pageId[id]), title: W[id].name, sub: rarities[progById[id]?.rarity]?.name, color: colorOf(id) }))) +
          c.md(`Equipment in the box: ${Object.keys(equipProg).filter(e => pool.has(e)).map(e => `[${equipProg[e].name}](${c.href('weapons', c.slug(equipProg[e].name))})`).join(', ') || 'none'}.`);
      },
    });

    const groupCount = g => pages.filter(p => p.group === g).length;
    return {
      intro: ctx.md(`Every weapon you can buy, roll or earn, with its stats read straight from the game. Damage is per bullet (per pellet for shotguns); "past N m" is the damage beyond the gun's range. Ammo is shown as magazine + reserve.

How the systems work: [Attachments](${ctx.href('weapons', ctx.slug('Attachments'))}), [Camos](${ctx.href('weapons', ctx.slug('Camos'))}), [Weapon levels](${ctx.href('weapons', ctx.slug('Weapon levels'))}), [Weapon prestige](${ctx.href('weapons', ctx.slug('Weapon prestige'))}), [Pack-a-Punch](${ctx.href('weapons', ctx.slug('Pack-a-Punch'))}) and the [Mystery Box](${ctx.href('weapons', ctx.slug('Mystery Box'))}).`),
      groups: GROUPS.filter(g => groupCount(g)),
      pages,
    };
  },
};

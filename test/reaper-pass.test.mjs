import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

// Prismatic Punch, Dam-A-Nade and Magnet Margarita: switched-on Reaper Collection perks, Melon Pass unlocks with research augments
const store = new Map();
globalThis.Storage ??= class Storage { getItem(k) { return store.get(k) ?? null; } setItem(k, v) { store.set(k, String(v)); } removeItem(k) { store.delete(k); } };
globalThis.localStorage = new Storage();
globalThis.addEventListener ??= () => {};
const web = new URL('../export/web/', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, web), 'utf8'));
const season = json('mods/pass/season.json'), catalog = json('mods/shop/catalog.json'), research = json('mods/research/research.json'), drinks = json('mods/perks-plus/data.json').perkDrinks;
const reaperSrc = ['reaper-perks.js', 'magnet.js'].map(f => readFileSync(new URL('mods/perks-plus/' + f, web), 'utf8')).join('\n');
const PERKS = { prismatic: 'specialty_prismatic_punch', damnade: 'specialty_damnade', magnet: 'specialty_magnet' };
const slot = id => season.pages.flatMap(p => p.items).find(x => x.id === id);

test('page 6 gives Prismatic Punch (was the Crows card), page 8 Dam-A-Nade (was the Harvest Moon Glow), page 10 Magnet Margarita', () => {
  assert.equal(slot('p6.9').reward.id, 'pass.s1.perk.prismatic');
  assert.equal(slot('p8.7').reward.id, 'pass.s1.perk.damnade');
  assert.equal(slot('p10.1').reward.id, 'pass.s1.perk.magnet');   // was the Crop Circle camo, which went to p9.9 in place of the Pyre card
  assert.equal(slot('p9.9').reward.id, 'pass.s1.camo.cropcircle');
  for (const [k, spec] of Object.entries(PERKS)) {
    const item = catalog.items.find(i => i.id === 'pass.s1.perk.' + k);
    assert.equal(item.cat, 'perk'); assert.equal(item.data.perk, spec); assert.equal(item.pass, 's1');
  }
  assert.ok(!catalog.items.some(i => ['pass.s1.card.crows', 'pass.s1.glow.harvestmoon', 'pass.s1.card.pyre'].includes(i.id)));
  const all = season.pages.flatMap(p => [...p.items, p.major]).map(x => JSON.stringify(x.reward));
  assert.equal(all.length, new Set(all).size);
});

test('each has an 8-augment research track, alternating Minor/Major, every effect read by the perk code', () => {
  for (const spec of Object.values(PERKS)) {
    const it = research.items.find(i => i.id === spec);
    assert.ok(it, spec); assert.equal(it.kind, 'perk'); assert.equal(it.augments.length, 8);
    it.augments.forEach((a, i) => assert.equal(a.kind, i % 2 ? 'major' : 'minor', a.name));
    for (const a of it.augments) for (const k of Object.keys(a.effects)) assert.ok(reaperSrc.includes(`stat('${k}')`), `${a.name}: ${k} unused`);
  }
  const ids = research.items.flatMap(i => i.augments.map(a => a.id));
  assert.equal(ids.length, new Set(ids).size);
});

test('they can be drunk (tracked bottles) and are on sale at the terminal behind their pass item', async () => {
  for (const spec of Object.values(PERKS)) { assert.ok(drinks[spec], spec); assert.ok(existsSync(new URL(drinks[spec].model, web)), drinks[spec].model); }
  const { REAPER_ON } = await import('../export/web/mods/perks-plus/reaper-perks.js');
  assert.deepEqual(Object.keys(REAPER_ON).filter(k => !REAPER_ON[k].soon).sort(), [...Object.values(PERKS), 'specialty_electriccherry', 'specialty_stronghold', 'specialty_victorious', 'specialty_zombshell', 'specialty_tactiquilla'].sort());   // Electric Cherry is on sale without a pass item; the last four are Season 1's
  const { PERKS: TERMINAL, perkUnlocked } = await import('../export/web/mods/terminal-booth/desktop.js');
  const cherry = TERMINAL.find(x => x.id === 'specialty_electriccherry'); assert.ok(drinks[cherry.id]); assert.ok(!cherry.unlock);
  for (const [k, spec] of Object.entries(PERKS)) {
    const p = TERMINAL.find(x => x.id === spec);
    assert.equal(p.unlock, 'pass.s1.perk.' + k);
    store.clear(); assert.ok(!perkUnlocked(p));
    localStorage.setItem('kino.mods.shop', JSON.stringify({ owned: ['pass.s1.perk.' + k] })); assert.ok(perkUnlocked(p));
  }
});

test('Stone Cold Stronghold, Victorious Tortoise, Zombshell and Tactiquilla Sangria are Melon Pass Season 1 unlocks (since 2026-11-08) with research tracks', async () => {
  const S1 = { stronghold: 'specialty_stronghold', victorious: 'specialty_victorious', zombshell: 'specialty_zombshell', tactiquilla: 'specialty_tactiquilla' };
  const { REAPER_ON } = await import('../export/web/mods/perks-plus/reaper-perks.js');
  const { PERKS: TERMINAL, perkUnlocked } = await import('../export/web/mods/terminal-booth/desktop.js');
  const { isSoon } = await import('../export/web/mods/research/research.js');
  const catalog = JSON.parse(readFileSync(new URL('mods/shop/catalog.json', web), 'utf8'));
  assert.deepEqual(Object.keys(REAPER_ON).filter(k => REAPER_ON[k].soon), []);
  for (const [k, spec] of Object.entries(S1)) {
    assert.ok(drinks[spec] && existsSync(new URL(drinks[spec].model, web)), spec);
    const p = TERMINAL.find(x => x.id === spec); assert.ok(!p.soon, spec); assert.equal(p.unlock, 'pass.s2.perk.' + k);
    assert.ok(catalog.items.find(i => i.id === p.unlock), p.unlock);
    store.clear(); assert.equal(perkUnlocked(p), false);
    localStorage.setItem('kino.mods.shop', JSON.stringify({ owned: [p.unlock] })); assert.ok(perkUnlocked(p));
    const it = research.items.find(i => i.id === spec);
    assert.ok(!it.soon, spec); assert.equal(it.augments.length, 8);
    it.augments.forEach((a, i) => assert.equal(a.kind, i % 2 ? 'major' : 'minor', a.name));
    for (const a of it.augments) for (const k of Object.keys(a.effects)) assert.ok(reaperSrc.includes(`stat('${k}')`), `${a.name}: ${k} unused`);
    assert.ok(!isSoon(research, spec));
  }
});

test('a slot claimed before its reward was swapped hands the new item over, once', async () => {
  const { reconcile, loadPass, seasonsFrom } = await import('../export/web/mods/pass/pass.js');
  store.clear();
  localStorage.setItem('kino.mods.shop', JSON.stringify({ owned: ['pass.s1.card.crows', 'pass.s1.camo.scarecrowburlap'] }));
  const S = seasonsFrom([season]), p = { ...loadPass(), seasons: { [season.id]: { xp: 0, bought: 0, premium: false, unlocked: {}, granted: { 'p1.1': true, 'p6.9': true, 'p8.7': true, 'p9.9': true, 'p10.1': true } } } };
  assert.deepEqual(reconcile(S, p).sort(), ['pass.s1.camo.cropcircle', 'pass.s1.perk.damnade', 'pass.s1.perk.magnet', 'pass.s1.perk.prismatic']);
  assert.deepEqual(reconcile(S, p), []);
  assert.deepEqual(reconcile(S, { ...p, seasons: { old: p.seasons[season.id] } }), []);
  const owned = JSON.parse(localStorage.getItem('kino.mods.shop')).owned;
  assert.ok(owned.includes('pass.s1.perk.prismatic') && owned.includes('pass.s1.perk.damnade'));
});

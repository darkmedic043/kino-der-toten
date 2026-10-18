import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

// Prismatic Punch and Dam-A-Nade: switched-on Reaper Collection perks, Melon Pass unlocks with research augments
const store = new Map();
globalThis.Storage ??= class Storage { getItem(k) { return store.get(k) ?? null; } setItem(k, v) { store.set(k, String(v)); } removeItem(k) { store.delete(k); } };
globalThis.localStorage = new Storage();
globalThis.addEventListener ??= () => {};
const web = new URL('../export/web/', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, web), 'utf8'));
const season = json('mods/pass/season.json'), catalog = json('mods/shop/catalog.json'), research = json('mods/research/research.json'), drinks = json('mods/perks-plus/data.json').perkDrinks;
const reaperSrc = readFileSync(new URL('mods/perks-plus/reaper-perks.js', web), 'utf8');
const PERKS = { prismatic: 'specialty_prismatic_punch', damnade: 'specialty_damnade' };
const slot = id => season.pages.flatMap(p => p.items).find(x => x.id === id);

test('page 6 gives Prismatic Punch (was the Crows card), page 8 Dam-A-Nade (was the Harvest Moon Glow)', () => {
  assert.equal(slot('p6.9').reward.id, 'pass.s1.perk.prismatic');
  assert.equal(slot('p8.7').reward.id, 'pass.s1.perk.damnade');
  for (const [k, spec] of Object.entries(PERKS)) {
    const item = catalog.items.find(i => i.id === 'pass.s1.perk.' + k);
    assert.equal(item.cat, 'perk'); assert.equal(item.data.perk, spec); assert.equal(item.pass, 's1');
  }
  assert.ok(!catalog.items.some(i => i.id === 'pass.s1.card.crows' || i.id === 'pass.s1.glow.harvestmoon'));
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
  assert.deepEqual(Object.keys(REAPER_ON).sort(), Object.values(PERKS).sort());
  const { PERKS: TERMINAL, perkUnlocked } = await import('../export/web/mods/terminal-booth/desktop.js');
  for (const [k, spec] of Object.entries(PERKS)) {
    const p = TERMINAL.find(x => x.id === spec);
    assert.equal(p.unlock, 'pass.s1.perk.' + k);
    store.clear(); assert.ok(!perkUnlocked(p));
    localStorage.setItem('kino.mods.shop', JSON.stringify({ owned: ['pass.s1.perk.' + k] })); assert.ok(perkUnlocked(p));
  }
});

test('a slot claimed before its reward was swapped hands the new item over, once', async () => {
  const { reconcile, loadPass } = await import('../export/web/mods/pass/pass.js');
  store.clear();
  localStorage.setItem('kino.mods.shop', JSON.stringify({ owned: ['pass.s1.card.crows', 'pass.s1.camo.scarecrowburlap'] }));
  const p = { ...loadPass(), season: season.id, granted: { 'p1.1': true, 'p6.9': true, 'p8.7': true } };
  assert.deepEqual(reconcile(season, p).sort(), ['pass.s1.perk.damnade', 'pass.s1.perk.prismatic']);
  assert.deepEqual(reconcile(season, p), []);
  assert.deepEqual(reconcile(season, { ...p, season: 'old' }), []);
  const owned = JSON.parse(localStorage.getItem('kino.mods.shop')).owned;
  assert.ok(owned.includes('pass.s1.perk.prismatic') && owned.includes('pass.s1.perk.damnade'));
});

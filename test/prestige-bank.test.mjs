import assert from 'node:assert/strict';
import { test } from 'node:test';

// a localStorage for the profile, prestige and bank stores
const store = new Map();
// (a Storage class too: cloud.js, pulled in through profile.js, patches Storage.prototype.setItem)
globalThis.Storage ??= class Storage { getItem(k) { return store.get(k) ?? null; } setItem(k, v) { store.set(k, String(v)); } removeItem(k) { store.delete(k); } };
globalThis.localStorage = new Storage();
globalThis.addEventListener ??= () => {};   // cloud.js listens for page events
globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });   // signed out: no cloud pull
const { canPrestigePlayer, prestigePlayer, isPrestigeMaster, hasPrestigeMaster, prestigeName, prestigeShort, prestigeColor, prestigeBadge, savePrestige, loadPrestige, RULES } =
  await import('../export/web/mods/prestige/prestige.js');
const { bankState, loadBank } = await import('../export/web/mods/bank/mod.js');

test('the account prestiges I to X, then once more into Prestige Master, then stops', () => {
  const p = { player: { prestige: 0, peak: 0, tokens: 0 }, weapons: {}, camos: [] };
  for (let i = 1; i <= RULES.playerMax; i++) { assert.ok(canPrestigePlayer(p, RULES.playerLevel)); prestigePlayer(p, RULES.playerLevel); }
  assert.equal(p.player.prestige, 10);
  assert.ok(!isPrestigeMaster(10));
  assert.ok(!canPrestigePlayer(p, RULES.playerLevel - 1));   // still needs the level
  assert.ok(canPrestigePlayer(p, RULES.playerLevel));
  prestigePlayer(p, RULES.playerLevel);
  assert.equal(p.player.prestige, 11); assert.ok(isPrestigeMaster(11)); assert.equal(p.player.tokens, 11);
  assert.ok(!canPrestigePlayer(p, 99));                       // nothing past Master
});

test('labels, colour and badge for Master', () => {
  assert.equal(prestigeName(4), 'PRESTIGE IV'); assert.equal(prestigeName(11), 'PRESTIGE MASTER');
  assert.equal(prestigeShort(10), 'PX'); assert.equal(prestigeShort(11), 'MASTER');
  assert.notEqual(prestigeColor(11), prestigeColor(10));
  assert.match(prestigeBadge(11), /Prestige Master/); assert.match(prestigeBadge(3), /Prestige 3/); assert.equal(prestigeBadge(0), '');
});

test('the bank stays sealed below Prestige Master and opens (for good) at it', () => {
  store.clear();
  savePrestige({ player: { prestige: 10, peak: 60, tokens: 10 }, weapons: {}, camos: [] });
  let b = bankState();
  assert.equal(b.unlocked, false); assert.equal(b.prestige, 10); assert.equal(b.master, 11); assert.equal(b.prestigeName, 'PRESTIGE X');
  assert.ok(!hasPrestigeMaster());
  const p = loadPrestige(); prestigePlayer(p, 55); savePrestige(p);
  b = bankState();
  assert.equal(b.unlocked, true); assert.equal(b.by, 'prestige-master'); assert.ok(b.unlockedAt > 0);
  // saved open: the stored copy carries no derived fields, and stays open even if the prestige store is lost
  const saved = loadBank(); assert.equal(saved.unlocked, true); assert.equal(saved.prestige, undefined);
  store.delete('kino.mods.prestige'); assert.equal(bankState().unlocked, true);
});

test('a vault opened the old way (investing) stays open without Master', () => {
  store.clear();
  store.set('kino.mods.bank', JSON.stringify({ invested: 1000000, unlocked: true, balance: 25000 }));
  savePrestige({ player: { prestige: 2, peak: 55, tokens: 2 }, weapons: {}, camos: [] });
  const b = bankState(); assert.equal(b.unlocked, true); assert.equal(b.balance, 25000);
});

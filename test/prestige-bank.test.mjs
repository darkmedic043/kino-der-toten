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

const { masterLook, masterLevelXp, claimMasterRewards, awardMasterRewards, nextMasterMilestone, milestoneText, masterBadge, MASTER_MILESTONES } = await import('../export/web/mods/prestige/prestige.js');
const { levelNeed, xpToNext, loadProfile, saveProfile } = await import('../export/web/profile.js');

test('Master levels: flat XP from 56 to the 1,000 cap; the normal curve below Master', () => {
  const cfg = { levelCurve: { base: 100, exponent: 1.15 } };
  assert.equal(levelNeed(cfg, 40, 3), xpToNext(cfg, 40));
  assert.equal(levelNeed(cfg, 56, 11), RULES.accountMasterXp);
  assert.equal(levelNeed(cfg, 999, 11), RULES.accountMasterXp);
  assert.equal(levelNeed(cfg, 1000, 11), Infinity); assert.equal(masterLevelXp(1000), Infinity);
  assert.ok(Math.abs(RULES.accountMasterXp - xpToNext(cfg, 55)) < 500);   // about what level 55 costs
});

test('milestones: colours and titles change every 100 levels, a badge pip per 100, a crown at 1,000', () => {
  assert.deepEqual([masterLook(56).title, masterLook(56).colorName, masterLook(56).tier], ['Prestige Master', 'Orange', 0]);
  assert.deepEqual([masterLook(99).title, masterLook(100).title, masterLook(100).colorName, masterLook(100).tier], ['Prestige Master', 'Centurion', 'Crimson', 1]);
  assert.deepEqual([masterLook(1000).title, masterLook(1000).legend, masterLook(999).legend], ['Legend', true, false]);
  assert.equal(nextMasterMilestone(56).level, 60); assert.equal(nextMasterMilestone(950).level, 1000); assert.equal(nextMasterMilestone(1000), null);
  assert.match(milestoneText(MASTER_MILESTONES.find(m => m.level === 500)), /Aether-Touched.*Cyan.*1,000 credits/);
  assert.equal((masterBadge(56).match(/<circle/g) ?? []).length, 0);
  assert.equal((masterBadge(450).match(/<circle/g) ?? []).length, 4);
  assert.match(masterBadge(1000), /M6\.5 1\.2/);   // the crown
  assert.equal(new Set(MASTER_MILESTONES.filter(m => m.color).map(m => m.color)).size, 11);
});

test('rewards are claimed once, in order, only in Master, and paid after the claim is saved', () => {
  const p = { player: { prestige: 10, peak: 60, tokens: 10 } };
  assert.deepEqual(claimMasterRewards(p, 200), []);   // not Master yet
  p.player.prestige = 11;
  assert.deepEqual(claimMasterRewards(p, 56).map(m => m.level), [56]);
  assert.deepEqual(claimMasterRewards(p, 104).map(m => m.level), [60, 65, 70, 80, 90, 100]);
  assert.deepEqual(claimMasterRewards(p, 104), []);   // nothing twice
  // awardMasterRewards: a grant that re-enters (as the menu's credits event does) finds nothing left to pay
  store.clear(); savePrestige({ player: { prestige: 11, peak: 60, tokens: 11, mclaim: 56 }, weapons: {}, camos: [] });
  const paid = [];
  const grant = (n, why) => { paid.push(n); awardMasterRewards(1000, grant); };
  awardMasterRewards(1000, grant);
  assert.equal(paid.reduce((a, n) => a + n, 0), 1050 + 8 * 500 + 1000 + 2500);
  assert.equal(loadPrestige().player.mclaim, 1000);
});

test('an account that entered Master at level 1 moves up to 56', () => {
  store.clear();
  savePrestige({ player: { prestige: 11, peak: 60, tokens: 11 }, weapons: {}, camos: [] });
  saveProfile({ level: 3, xp: 120, kills: 5 });
  const p = loadProfile(); assert.equal(p.level, 56); assert.equal(p.xp, 0); assert.equal(p.kills, 5);
  savePrestige({ player: { prestige: 9, peak: 60, tokens: 9 }, weapons: {}, camos: [] });
  assert.equal(loadProfile().level, 3);   // not Master: untouched
});

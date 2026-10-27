import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Melon Pass seasons never expire (Marvel Rivals style): per-season progress, one shared token pool, an active pass
const store = new Map();
globalThis.Storage ??= class Storage { getItem(k) { return store.get(k) ?? null; } setItem(k, v) { store.set(k, String(v)); } removeItem(k) { store.delete(k); } };
globalThis.localStorage = new Storage();
globalThis.addEventListener ??= () => {};
globalThis.window ??= globalThis; globalThis.CustomEvent ??= class CustomEvent { constructor(t) { this.type = t; } };
const web = new URL('../export/web/', import.meta.url);
const s1 = JSON.parse(readFileSync(new URL('mods/pass/season.json', web), 'utf8'));
const idx = JSON.parse(readFileSync(new URL('mods/pass/seasons.json', web), 'utf8'));
// a made-up season 2: season 1's track under a new id
const next = (id, start) => ({ ...structuredClone(s1), id, name: 'Test ' + id, start, end: '2099-01-01' });
const P = await import('../export/web/mods/pass/pass.js');
const { loadCredits, saveCredits, change } = await import('../export/web/mods/credits/credits.js');

test('seasons.json lists season.json; future seasons are hidden and the newest started one is live', () => {
  assert.ok(idx.seasons.includes('season.json'));
  const S = P.seasonsFrom([next('s2', '2026-12-15'), s1], '2026-11-01');
  assert.deepEqual(S.list.map(s => s.id), ['s1']); assert.equal(S.current.id, 's1');
  const T = P.seasonsFrom([s1, next('s2', '2026-12-15')], '2026-12-20');
  assert.deepEqual(T.list.map(s => s.id), ['s1', 's2']); assert.equal(T.current.id, 's2');
});

test('a one-season save migrates into seasons[id]', () => {
  store.clear();
  localStorage.setItem(P.PASS_KEY, JSON.stringify({ season: 's1', xp: 7500, bought: 1, auto: false, premium: true, unlocked: { 'p1.1': true }, granted: { 'p1.1': true }, gums: ['g'] }));
  const p = P.loadPass();
  assert.deepEqual(p.seasons.s1, { xp: 7500, bought: 1, premium: true, unlocked: { 'p1.1': true }, granted: { 'p1.1': true } });
  assert.equal(p.auto, false); assert.deepEqual(p.gums, ['g']); assert.equal(p.season, undefined);
  const S = P.seasonsFrom([s1]);
  assert.equal(P.tokens(S, p), 3 + 1 - 1);
  P.savePass(p); assert.deepEqual(P.loadPass().seasons.s1, p.seasons.s1);   // saved in the new shape, loads the same
});

test('tokens are shared: XP goes to the live season and is spent on a past one', () => {
  store.clear();
  const S = P.seasonsFrom([s1, next('s2', '2026-10-20')], '2026-10-22'), [a, b] = S.list, p = P.loadPass();
  p.auto = false;
  assert.equal(P.addXp(S, p, 3 * b.tierXp), 3); assert.equal(p.seasons.s2.xp, 3 * b.tierXp); assert.equal(p.seasons.s1, undefined);
  assert.equal(P.tokens(S, p), 3);
  const r = P.unlock(S, a, p, 'p1.1'); assert.equal(typeof r, 'object'); assert.equal(r.granted[0].id, 'p1.1');
  assert.equal(P.tokens(S, p), 2); assert.ok(p.seasons.s1.unlocked['p1.1']); assert.ok(!p.seasons.s2.unlocked['p1.1']);
  assert.equal(P.unlock(S, a, p, 'p2.1'), 'Finish the page before it first');
  P.unlock(S, b, p, 'p1.1'); P.unlock(S, b, p, 'p1.2');
  assert.equal(P.unlock(S, a, p, 'p1.2'), 'No tokens: earn pass tiers by playing, or buy one');
});

test('auto-progress spends on the active pass, then the live one; a new live season resets the active pass', () => {
  store.clear();
  const S = P.seasonsFrom([s1, next('s2', '2026-10-20')], '2026-10-22'), [a, b] = S.list, p = P.loadPass();
  assert.equal(P.trackOf(S, p), b);
  P.setTrack(S, p, a); assert.equal(P.trackOf(S, p), a);
  // finish all of season 1 but its last reward, then earn 3 tokens
  for (const pg of a.pages) for (const it of pg.items) p.seasons.s1 = { ...P.rec(p, a), unlocked: { ...P.rec(p, a).unlocked, [it.id]: true } };
  delete p.seasons.s1.unlocked[a.pages.at(-1).items.at(-1).id];
  p.seasons.s1.xp = (90 - 1) * a.tierXp;   // what those unlocks cost
  P.addXp(S, p, 3 * b.tierXp);
  const spent = P.autoSpend(S, p);
  assert.equal(spent.length, 3); assert.equal(spent[0].season, a); assert.equal(spent[1].season, b);
  assert.ok(P.seasonDone(a, p)); assert.ok(p.seasons.s1.granted[a.pages.at(-1).major.id]);
  assert.equal(P.unlockedCount(b, p), 2);
  const T = P.seasonsFrom([s1, next('s2', '2026-10-20'), next('s3', '2026-12-01')], '2026-12-02');
  assert.equal(P.trackOf(T, p).id, 's3');
});

test('no hoarding: tokens stop once the pool covers the live season; a finished pass gives none', () => {
  store.clear();
  const S = P.seasonsFrom([s1, next('s2', '2026-10-20')], '2026-10-22'), [a, b] = S.list, p = P.loadPass();
  p.auto = false;
  assert.equal(P.addXp(S, p, 95 * b.tierXp), 90);   // 95 tiers, but the live pass only has 90 rewards
  assert.equal(P.tiersEarned(b, p), 90); assert.equal(P.tokens(S, p), 90); assert.ok(!P.tokensNeeded(S, p));
  P.unlock(S, a, p, 'p1.1');   // one spent on a past season: the next tier past the end makes it up, and only that one
  assert.equal(P.addXp(S, p, 3 * b.tierXp), 1); assert.equal(P.tokens(S, p), 90);
  // an old save with bonus tokens counts only up to the reward count
  const q = { ...P.loadPass(), seasons: { s2: { ...structuredClone(P.rec(p, b)), earned: undefined, xp: 108 * b.tierXp, unlocked: {} } } };
  delete q.seasons.s2.earned; assert.equal(P.tokens(S, q), 90);
  // a finished pass: nothing more from XP, and no token purchase once every reward left is paid for
  for (const pg of b.pages) for (const it of pg.items) P.rec(p, b).unlocked[it.id] = true;
  P.rec(p, b).earned = 90; for (const pg of a.pages) for (const it of pg.items) P.rec(p, a).unlocked[it.id] = true;
  assert.ok(P.seasonDone(b, p)); assert.equal(P.addXp(S, p, 10 * b.tierXp), 0);
  assert.equal(P.buyToken(S, p), 'Your tokens already cover every reward left');
  // spare tokens (bought before the end) are dropped when the pass wraps up, and stay gone when a new season comes out
  P.rec(p, a).earned = 90; P.rec(p, b).bought = 4; assert.equal(P.tokens(S, p), 4); assert.equal(P.wrapUp(S, p), 4); assert.equal(P.tokens(S, p), 0);
  const T = P.seasonsFrom([s1, next('s2', '2026-10-20'), next('s3', '2026-12-01')], '2026-12-02');
  assert.equal(P.tokens(T, p), 0); assert.ok(P.canBuyToken(T, p));
  P.savePass(p); const back = P.loadPass(); assert.equal(back.forfeit, 4); assert.equal(back.seasons.s2.earned, 90); assert.equal(P.tokens(S, back), 0);
});

test('premium is per season', () => {
  store.clear();
  const S = P.seasonsFrom([s1, next('s2', '2026-10-20')], '2026-10-22'), [a, b] = S.list, p = P.loadPass();
  P.rec(p, b).xp = 95 * b.tierXp;
  const c = loadCredits(); change(c, 5000, 'test'); saveCredits(c);
  p.auto = false; P.unlock(S, a, p, 'p1.3');   // premium reward: held
  assert.ok(!p.seasons.s1.granted['p1.3']);
  assert.deepEqual(P.buyPremium(b, p), []); assert.ok(p.seasons.s2.premium && !p.seasons.s1.premium);
  assert.ok(!p.seasons.s1.granted['p1.3']);
  assert.equal(P.buyPremium(a, p).map(x => x.id).join(), 'p1.3'); assert.ok(p.seasons.s1.granted['p1.3']);
  assert.equal(P.buyToken(S, p), null); assert.equal(p.seasons.s2.bought, 1);
});

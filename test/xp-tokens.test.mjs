import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Timed double XP tokens (Melon Pass rewards, mods/pass/xp-tokens.js): one hour each, the clock runs only in play
const store = new Map();
globalThis.Storage ??= class Storage { getItem(k) { return store.get(k) ?? null; } setItem(k, v) { store.set(k, String(v)); } removeItem(k) { store.delete(k); } };
globalThis.localStorage = new Storage();
globalThis.addEventListener ??= () => {};
globalThis.window ??= globalThis; globalThis.CustomEvent ??= class CustomEvent { constructor(t) { this.type = t; } };
const web = new URL('../export/web/', import.meta.url);
const s1 = JSON.parse(readFileSync(new URL('mods/pass/season.json', web), 'utf8'));
const P = await import('../export/web/mods/pass/pass.js');
const X = await import('../export/web/mods/pass/xp-tokens.js');

test('a pass reward of hours gives one-hour tokens of its kind, and the save keeps them', () => {
  localStorage.removeItem('kino.mods.pass');
  const season = structuredClone(s1);
  season.pages[0].items[0] = { id: 'xp-w', reward: { type: 'token', kind: 'weaponXp', hours: 2 } };
  season.pages[0].items[1] = { id: 'xp-p', reward: { type: 'token', kind: 'playerXp', hours: 1 } };
  const S = P.seasonsFrom([season]), p = P.loadPass();
  p.seasons[season.id] = { xp: season.tierXp * 3, bought: 0, premium: false, unlocked: {}, granted: {} };
  for (const id of ['xp-w', 'xp-p']) assert.notEqual(typeof P.unlock(S, season, p, id), 'string');
  assert.deepEqual(p.xpTokens, { playerXp: 1, weaponXp: 2 });
  P.savePass(p);
  const q = P.loadPass();
  assert.deepEqual(q.xpTokens, { playerXp: 1, weaponXp: 2 });
  assert.deepEqual(q.xpLeft, { playerXp: 0, weaponXp: 0 });
  assert.equal(P.describe({ type: 'token', kind: 'playerXp', hours: 1 }).title, 'Double Player XP');
  assert.equal(P.describe({ type: 'token', kind: 'weaponXp', hours: 1 }).sub, '1 HOUR · GAME TIME');
});

test('using a token starts an hour, another adds an hour, and play time runs it down', () => {
  const p = P.loadPass();
  p.xpTokens = { playerXp: 2, weaponXp: 0 }; p.xpLeft = { playerXp: 0, weaponXp: 0 };
  assert.equal(X.useXpToken(p, 'weaponXp'), false);
  assert.equal(X.useXpToken(p, 'nope'), false);
  assert.equal(X.useXpToken(p, 'playerXp'), true);
  assert.equal(X.xpLeft(p, 'playerXp'), 3600);
  assert.deepEqual(X.tickXpTokens(p, 600), []);
  assert.equal(X.xpLeft(p, 'playerXp'), 3000);
  assert.equal(X.useXpToken(p, 'playerXp'), true);
  assert.equal(X.xpLeft(p, 'playerXp'), 6600);
  assert.equal(X.xpHeld(p, 'playerXp'), 0);
  assert.deepEqual(X.tickXpTokens(p, 7000), ['playerXp']);
  assert.equal(X.xpLeft(p, 'playerXp'), 0);
  assert.deepEqual(X.tickXpTokens(p, 10), []);
  assert.equal(X.fmtLeft(3600), '1:00:00');
  assert.equal(X.fmtLeft(59.2), '1:00');
  assert.equal(X.fmtLeft(61), '1:01');
});

test('the strip shows nothing until a token is held, then both kinds with a USE button', () => {
  const p = P.loadPass();
  p.xpTokens = { playerXp: 0, weaponXp: 0 }; p.xpLeft = { playerXp: 0, weaponXp: 0 };
  assert.equal(X.xpTokenHtml(p), '');
  p.xpTokens.weaponXp = 1;
  const h = X.xpTokenHtml(p);
  assert.match(h, /data-xp-use="weaponXp" title="1 token">USE · 1/);
  assert.match(h, /data-xp-use="playerXp" disabled/);
  p.xpLeft.playerXp = 125;
  assert.match(X.xpTokenHtml(p), /2:05 LEFT/);
});

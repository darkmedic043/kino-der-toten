// The cloud save: a device with an old copy must never replace the account's newer save (it did on 2026-11-01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { keepCopy, staleUpload } from '../.tools/save-guard.mjs';

class FakeStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i]; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.Storage = FakeStorage;
globalThis.addEventListener ??= () => {};
const realSetItem = FakeStorage.prototype.setItem;
const P = 'kino.mods.progression', STAMP = 'kino.cloud.updatedAt';
const server = { doc: {}, rejected: [] };
let n = 0;

// A page load on a device: the module patches Storage, migrates and syncs.
async function load(store) {
  FakeStorage.prototype.setItem = realSetItem;
  globalThis.localStorage = store;
  globalThis.fetch = async (url, opts) => {
    if (url === '/api/me') return { ok: true, status: 200, json: async () => ({ signedIn: true, id: 'me' }) };
    if (opts?.method !== 'PUT') return { ok: true, status: 200, json: async () => server.doc };
    const doc = JSON.parse(opts.body);
    if (staleUpload(server.doc, doc)) { server.rejected.push(doc); return { ok: false, status: 409 }; }
    const { base, ...save } = doc; server.doc = save;
    return { ok: true, status: 200 };
  };
  const mod = await import(`../export/web/cloud.js?load=${++n}`);
  await mod.cloudReady;
}
const device = (progress, stamp) => { const s = new FakeStorage(); s.m.set(P, JSON.stringify(progress)); s.m.set(STAMP, String(stamp)); return s; };

test('an old copy that needs migrating does not replace a newer save', async () => {
  server.doc = {}; server.rejected = [];
  const good = device({ kills: 500, weaponXp: { aw_xmg: { level: 20 } } }, 2000);
  await load(good);
  assert.equal(JSON.parse(server.doc.keys[P]).kills, 500);
  const old = device({ kills: 100, weaponXp: { cz75dw_zm: { level: 3, xp: 0 } } }, 1000);
  await load(old);
  assert.equal(JSON.parse(server.doc.keys[P]).kills, 500, 'the server keeps the newer save');
  assert.equal(JSON.parse(old.getItem(P)).kills, 500, 'the old device takes it');
});

test('a device that saw the server keeps saving, one that fell behind is refused even with a later clock', async () => {
  server.doc = {}; server.rejected = [];
  const a = device({ kills: 10 }, 1000), b = new FakeStorage();
  await load(a); await load(b);
  assert.equal(JSON.parse(b.getItem(P)).kills, 10);
  a.m.set(P, JSON.stringify({ kills: 20 })); a.m.set(STAMP, '2000'); await load(a);
  assert.equal(JSON.parse(server.doc.keys[P]).kills, 20, 'same device, moved on');
  b.m.set(P, JSON.stringify({ kills: 11 })); b.m.set(STAMP, '9000'); await load(b);
  assert.equal(JSON.parse(server.doc.keys[P]).kills, 20, 'b never saw 20');
  assert.equal(JSON.parse(b.getItem(P)).kills, 20, 'b takes the newer save');
  assert.equal(JSON.parse(server.rejected.at(-1).keys[P]).kills, 11, 'b\'s copy reaches the server for filing');
});

test('staleUpload lets legacy clients through and same-device saves', () => {
  const cur = { keys: {}, device: 'a', updatedAt: 5 };
  assert.equal(staleUpload(cur, { device: 'b' }), false);
  assert.equal(staleUpload(cur, { device: 'a', base: 1 }), false);
  assert.equal(staleUpload(cur, { device: 'b', base: 5 }), false);
  assert.equal(staleUpload(cur, { device: 'b', base: 1 }), true);
  assert.equal(staleUpload({}, { device: 'b', base: 1 }), false);
});

test('keepCopy throttles auto copies and trims each kind', () => {
  const dir = mkdtempSync(new URL('./.tmp-save-', import.meta.url).pathname);
  try {
    const file = join(dir, 'p.json'), hist = join(dir, 'p.history'), doc = { keys: {} };
    assert.equal(keepCopy(file, {}, 'auto', 1e12), false);
    assert.equal(keepCopy(file, doc, 'auto', 1e12), true);
    assert.equal(keepCopy(file, doc, 'auto', 1e12 + 3600e3), false);
    assert.equal(keepCopy(file, doc, 'auto', 1e12 + 4 * 3600e3), true);
    for (let i = 0; i < 12; i++) keepCopy(file, doc, 'rejected', 1e12 + i);
    const names = readdirSync(hist);
    assert.equal(names.filter(f => f.startsWith('auto-')).length, 2);
    assert.equal(names.filter(f => f.startsWith('rejected-')).length, 10);
    assert.ok(existsSync(hist));
  } finally { rmSync(dir, { recursive: true }); }
});

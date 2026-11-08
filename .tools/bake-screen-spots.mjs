// Bakes the gun screens' spots (mods/charms/screen-spots.json): for every gun model (base and Pack-a-Punched) and every
// screen housing, runs screens.js's placement search once in a game page, with the player's arms and the view camera, as
// it would run in play. The Gunsmith and the game then both read the file, so they show the same spot and nothing searches
// in play (2026-11-07, user: "make it consistent with the gunsmith please, no need to have it search during play").
//
//   ~/.local/bin/lowpri node .tools/bake-screen-spots.mjs [--force] [ids...]
//
// Already-baked models are skipped unless --force (or named). Rerun after changing a gun model, a housing, the search, or a
// charms.json screenMounts hint (along / height). One page on the GPU, Sandbox map, ?noWarm. The page loads every weapon model
// at start (270 GLBs, ~1,900 embedded images) and keeps their decoded bitmaps until the main renderer uploads them: 3-4 GB of
// renderer RAM. The search reads geometry only, so here every image is decoded at 4x4 (renderer ~1 GB). It stops and keeps
// what it has if the renderer passes MAX_MB anyway.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium, GPU_ARGS } from './browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '..'), OUT = path.join(ROOT, 'export/web/mods/charms/screen-spots.json');
const BASE = process.env.KINO_URL || 'http://127.0.0.1:5190', MAX_MB = +process.env.MAX_MB || 2200;
const force = process.argv.includes('--force'), only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const spots = old.spots ?? {};
const save = () => {
  const lines = Object.keys(spots).sort().map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(spots[k])}`);
  fs.writeFileSync(OUT, `{\n"_": "Baked by .tools/bake-screen-spots.mjs: gun model|housing -> the screen spot in the root bone's space (inches; screens.js mountFromSpot). Do not edit by hand: set a charms.json screenMounts hint and rebake.",\n"spots": {\n${lines.join(',\n')}\n}}\n`);
};
const rendererMB = () => { try { return Math.max(...execSync("ps -eo rss,args | grep -E 'ms-playwright.*--type=renderer' | grep -v grep | awk '{print $1}'").toString().trim().split('\n').map(x => (x / 1024) | 0)); } catch { return 0; } };

const b = await launchChromium(chromium, { args: GPU_ARGS });
let done = 0, failed = [];
try {
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  // decode every image at 4x4: the bake never looks at textures, and full-size bitmaps of every gun cost 3 GB
  await p.addInitScript(() => { const cib = globalThis.createImageBitmap, tiny = { resizeWidth: 4, resizeHeight: 4 };
    globalThis.createImageBitmap = (src, ...a) => a.length > 1 ? cib(src, ...a.slice(0, 4), { ...a[4], ...tiny }) : cib(src, { ...a[0], ...tiny }); });
  p.on('pageerror', e => console.log('PAGEERROR ' + String(e).slice(0, 200)));
  await p.goto(`${BASE}/play.html?map=${process.env.MAP || 'sandbox'}&noWarm`);
  await p.waitForFunction(() => window.kino?.debug?.getState?.().ready, null, { timeout: 900000 });
  await p.evaluate(() => { document.getElementById('start')?.click(); kino.debug.setActive(true); kino.debug.setInvulnerable(true); kino.debug.setAutoSpawn(false); kino.debug.clearEnemies(); });
  console.log('ready, renderer', rendererMB(), 'MB');
  // the search, imported fresh (its in-memory cache and the baked lookup stay out of the way)
  await p.evaluate(async () => { globalThis.__S = await import('/mods/charms/screens.js?bake=' + Date.now()); globalThis.__C = await import('/mods/charms/charms.js'); });
  const guns = await p.evaluate(() => { const W = kino.mods.api.data.weapons;
    return Object.values(W).filter(w => w.model && !/^(melee_|iron_)/.test(w.id)).flatMap(w => [{ id: w.id, up: false, model: w.model }, ...(w.upgrade?.model && w.upgrade.model !== w.model ? [{ id: w.id, up: true, model: w.upgrade.model }] : [])]); });
  const housings = await p.evaluate(() => Object.keys(kino.charms.catalogue.housings));
  for (const g of guns) {
    if (only.length && !only.includes(g.id)) continue;
    if (!force && !only.length && housings.every(h => spots[`${g.model.replace(/^[a-z]+:\/\/[^/]+\//, "")}|${h}`])) continue;
    const mb = rendererMB(); if (mb > MAX_MB) { console.log(`renderer at ${mb} MB (over ${MAX_MB}): stopping, rerun to continue`); break; }
    const r = await p.evaluate(async ({ id, up, model }) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms)), api = kino.mods.api, s = api.session, v = api.view;
      kino.debug.giveWeapon(id); if (up) { s.weapon.upgraded = true; api.equipView(); }
      for (let i = 0; i < 100 && !(v.gun && v.def?.model === model); i++) await sleep(100);
      if (!(v.gun && v.def?.model === model)) return { err: 'not equipped' };
      await sleep(1600); v.pivot.updateMatrixWorld(true);   // the raise settled, the idle pose
      const def = v.def, cat = kino.charms.catalogue, S = globalThis.__S, C = globalThis.__C, unit = C.charmUnit(def);
      const root = v.gun.getObjectByName(def.gunRoot ?? 'j_gun') ?? (() => { let b = null; v.gun.traverse(o => { if (!b && o.isBone) b = o; }); return b; })();
      if (!root) return { err: 'no root' };
      const override = cat.screenMounts[id], hint = override && !override.at ? override : undefined;
      // always keep clear of where a charm would hang, so adding a charm later never needs another spot
      const avoid = S.charmZone(v.gun, root, { key: def.model, override: cat.anchors[id], unit });
      const out = {}, t0 = performance.now();
      for (const [hk, housing] of Object.entries(cat.housings)) {
        const m = S.screenMount(v.gun, root, { key: 'bake|' + def.model + '|' + Date.now(), override: hint, hands: v.hands, camera: api.viewCamera, housing, unit, avoid });
        if (m?.spot) out[S.spotKey(def.model, housing)] = m.spot;
      }
      return { out, ms: performance.now() - t0 | 0 };
    }, g);
    if (r.err || !Object.keys(r.out ?? {}).length) { failed.push(`${g.id}${g.up ? '+' : ''}: ${r.err ?? 'no spot'}`); continue; }
    Object.assign(spots, r.out); done++; save();
    const f = Object.values(r.out)[0];
    console.log(`${g.id}${g.up ? ' (PaP)' : ''}: size ${f.s} along ${f.along} hook ${f.hook ? f.hook.len : '-'}  ${r.ms} ms, renderer ${rendererMB()} MB`);
  }
} finally { await b.close(); }
console.log(`baked ${done} models into ${path.relative(ROOT, OUT)}${failed.length ? `; skipped: ${failed.join(', ')}` : ''}`);

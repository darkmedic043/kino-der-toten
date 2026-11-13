// A real match on a whole map inside the test memory budget: the map's textures are served as 16 px copies
// (node .tools/map-lite.mjs <map-id> first), phone profile, Low graphics, half render scale, and a watchdog that closes the
// browser when the renderer or all of Chromium passes a limit (so a run can never squeeze the host).
//   MAP=der-eisendrache [PLAY=scratch/x.js] [SECS=20] [FIRST=1] [LIMIT=2300] [ALL=4500] [REAL=1] [AUDIO=1] [Q=1] [EVERY=10] ~/.local/bin/lowpri node .tools/map-test.mjs
// PLAY: a file whose text is one async expression evaluated in the page once the match has started; its JSON result is printed.
// Without PLAY the match idles SECS seconds and the round, zombies alive and player position are printed every 5 s.
// Exit code 2 = stopped by the watchdog (the last lines say at what load step), 3 = the map never became ready.
import { chromium } from '../node_modules/playwright-core/index.mjs'; import { execSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const MAP = process.env.MAP || 'sandbox', LIMIT = +(process.env.LIMIT || (process.env.FIRST ? 2600 : 2300)), ALL = +(process.env.ALL || 4500), SECS = +(process.env.SECS || 20), Q = +(process.env.Q || 1);
const lite = `scratch/lite/${MAP}/tex`, useLite = !process.env.REAL && fs.existsSync(lite);
const mem = () => { try { const r = execSync("ps -C chrome -o rss=,args=").toString().split('\n').filter(Boolean).map(l => [parseInt(l) / 1024, / --type=renderer/.test(l)]);
  return [Math.round(Math.max(0, ...r.filter(x => x[1]).map(x => x[0]))), Math.round(r.reduce((a, x) => a + x[0], 0))]; } catch { return [0, 0]; } };
// A profile kept between runs (scratch/lite/profile): the map's navmesh stays in its IndexedDB, so only a map's first run
// builds it (the build is the load's memory peak: the castle's needs FIRST=1, which lifts the renderer limit to 3300 MB once).
const b = await chromium.launchPersistentContext('scratch/lite/profile', { executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--disk-cache-size=1048576', '--js-flags=--expose-gc'], viewport: { width: 640, height: 360 }, hasTouch: true, isMobile: true });
const net = new Map();
let code = 0, label = '', peak = [0, 0], stopped = false, model = 'real'; const closers = [], t0 = Date.now(), secs = () => ((Date.now() - t0) / 1000).toFixed(0);
let gcIv = null, over = 0; const HOLD = +(process.env.HOLD || 6), HARD = +(process.env.HARD || (process.env.FIRST ? 3600 : 3000));
const wd = setInterval(() => { const m = mem(); peak = [Math.max(peak[0], m[0]), Math.max(peak[1], m[1])];
  over = m[0] > LIMIT ? over + 1 : 0;   // a load's short peaks (data waiting for the garbage collector) are let through; staying over LIMIT is not
  if (!stopped && (over >= HOLD || m[0] > HARD || m[1] > ALL)) { stopped = true; code = 2; console.log(`WATCHDOG at ${secs()} s: renderer ${m[0]} MB (limit ${LIMIT} for ${HOLD} s, ${HARD} at once), all ${m[1]} MB (limit ${ALL}); load step "${label}"`); b.close().catch(() => {}); } }, 1000);
try {
  const p = b.pages()[0] ?? await b.newPage(); let served = 0, missed = 0;
  // the 16 px copies make the map's texture arrays warn (texSubImage3D: source sub-rectangle...), a test artefact: counted, not listed
  const lines = []; let tex3 = 0; p.on('console', m => { const t = m.text(); if (/texSubImage3D: source sub-rectangle|too many errors, no more errors/.test(t)) { tex3++; return; } const l = /^\[load\] (.*)/.exec(t); if (/WebGL|INVALID|Context Lost|navmesh|slow setups|warm-shaders|\[mods\]|Error|error|Uncaught|MEMORY/.test(t) && lines.length < 60) lines.push(t.slice(0, 260)); });
  p.on('pageerror', e => { if (lines.length < 60) lines.push('PAGEERROR ' + String(e.stack || e).replace(/\n/g, ' | ').slice(0, 400)); });
  // The light copies come from a file server of our own (a 264 MB model handed over through route.fulfill crashes the browser);
  // the page still sees the game's URLs.
  const TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', glb: 'model/gltf-binary' };
  const srv = http.createServer((q, s) => { const f = path.join(`scratch/lite/${MAP}`, path.normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^([/\\]|\.\.)+/, ''));
    fs.stat(f, (e, st) => { if (e || !st.isFile()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[f.split('.').pop()] || 'application/octet-stream', 'Content-Length': st.size }); fs.createReadStream(f).pipe(s); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); closers.push(() => srv.close()); const base = `http://127.0.0.1:${srv.address().port}/`;
  const liteGlb = !process.env.REAL && fs.existsSync(`scratch/lite/${MAP}`) && fs.readdirSync(`scratch/lite/${MAP}`).find(f => f.endsWith('.glb'));
  if (useLite || liteGlb) await p.route(u => u.pathname.startsWith(`/mods/maps/${MAP}/`), r => { const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(`/mods/maps/${MAP}/`.length));
    if (rel === liteGlb) { model = 'lite'; return r.continue({ url: base + rel }); }
    if (useLite && rel.startsWith('tex/')) { if (fs.existsSync(path.join(`scratch/lite/${MAP}`, rel))) { served++; return r.continue({ url: base + rel }); } missed++; }
    r.continue(); });
  // every image decoded at 16 px (weapons, zombies, the HUD's models): full-size bitmaps of every gun alone cost 2-3 GB (performance.md)
  if (!process.env.REAL) await p.addInitScript(() => { const cib = globalThis.createImageBitmap, tiny = { resizeWidth: 16, resizeHeight: 16 };
    globalThis.createImageBitmap = (src, ...a) => a.length > 1 ? cib(src, ...a.slice(0, 4), { ...a[4], ...tiny }) : cib(src, { ...a[0], ...tiny }); });
  // decoded sounds are the next biggest part of the base game's load: every sound becomes 0.1 s of silence (AUDIO=1 keeps them)
  if (!process.env.REAL && !process.env.AUDIO) await p.addInitScript(() => { for (const C of [globalThis.AudioContext, globalThis.OfflineAudioContext, globalThis.BaseAudioContext]) { if (!C?.prototype?.decodeAudioData || C.prototype.decodeAudioData.tiny) continue;
    const f = function (buf, ok, err) { const b = this.createBuffer(1, 2205, 22050); ok?.(b); return Promise.resolve(b); }; f.tiny = true; C.prototype.decodeAudioData = f; } });
  await p.goto('http://127.0.0.1:5190/');
  await p.evaluate(q => { localStorage.clear(); const s = {}; s.graphics = q; s.renderScale = .5; localStorage.setItem('kino.settings', JSON.stringify(s)); }, Q);
  await p.goto('http://127.0.0.1:5190/play.html?map=' + MAP);
  // NET=1: what the page downloads, by folder and 5 s slice (MB), and every file over 8 MB: shows which step a memory peak belongs to
  if (process.env.NET) p.on('response', r => { const n = +(r.headers()['content-length'] || 0), u = new URL(r.url()), k = `${String(Math.floor(secs() / 5) * 5).padStart(3)} s ${u.pathname.split('/').slice(1, 3).join('/')}`;
    net.set(k, (net.get(k) || 0) + n); if (n > 8e6) console.log(`  net ${secs()} s ${(n / 1048576).toFixed(0)} MB ${u.pathname.slice(-70)}`); });
  // dead load data (the model file's own buffer, collision scratch) is collected every 2 s instead of whenever V8 gets to it
  gcIv = setInterval(() => { p.evaluate(() => globalThis.gc?.()).catch(() => {}); }, 2000);
  const iv = setInterval(async () => { try { label = await Promise.race([p.evaluate(() => document.getElementById('load-label')?.textContent || ''), new Promise(r => setTimeout(() => r(label), 1500))]); } catch {} const m = mem(); console.log(`  t ${secs()} s  renderer ${m[0]} MB  all ${m[1]} MB  ${label.slice(0, 60)}`); }, +(process.env.EVERY || 10) * 1000);
  try { await p.waitForFunction(() => window.kino?.debug?.getState?.().ready || /Unable/.test(document.getElementById('load-label')?.textContent || ''), null, { timeout: 600000 }); }
  catch (e) { if (!stopped) { code = 3; console.log('never ready:', String(e).slice(0, 120)); } } finally { clearInterval(iv); }
  if (!code) {
    const m = mem(); console.log(`${MAP} ready in ${secs()} s; renderer ${m[0]} MB, all ${m[1]} MB; model: ${model}; textures: ${useLite ? served + ' lite, ' + missed + ' real' : 'real'}`);
    console.log(JSON.stringify(await p.evaluate(() => { const a = kino.mods.api, r = a.renderer; return { label: document.getElementById('load-label')?.textContent, programs: r?.info?.programs?.length, geometries: r?.info?.memory?.geometries, textures: r?.info?.memory?.textures, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6) }; })));
    await p.evaluate(() => { document.getElementById('start')?.click(); const D = kino.debug; D.setActive(true); D.setInvulnerable(true); });
    if (process.env.PLAY) console.log('PLAY', JSON.stringify(await p.evaluate(fs.readFileSync(process.env.PLAY, 'utf8'))));
    else for (let t = 0; t < SECS && !stopped; t += 5) { await new Promise(r => setTimeout(r, 5000)); const s = await p.evaluate(() => { const a = kino.mods.api, st = kino.debug.getState(); return { round: a.session?.round, alive: a.enemies?.list?.filter(z => !z.dead).length ?? st.zombies, pos: a.player?.position?.toArray().map(Math.round) }; }).catch(e => ({ err: String(e).slice(0, 80) })); const m = mem(); console.log(`  +${t + 5} s`, JSON.stringify(s), `renderer ${m[0]} MB`); }
  }
  console.log(lines.join('\n')); if (tex3) console.log(`${tex3} texture-array warnings from the 16 px copies (test only)`);
} catch (e) { if (!stopped) { code = code || 1; console.log('FAILED', String(e).slice(0, 300)); } }
finally { clearInterval(wd); clearInterval(gcIv); await b.close().catch(() => {}); for (const c of closers) c(); if (process.env.NET) console.log([...net].filter(e => e[1] > 2e6).map(e => `${e[0]} ${(e[1] / 1048576).toFixed(0)}`).join('\n')); console.log(`peak: renderer ${peak[0]} MB, all ${peak[1]} MB`); process.exit(code); }

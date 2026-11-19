// Where do a frame's triangles go? Real engine, real GPU, one page. QUERY='&noSun' Q=ultra VIEWS=json ~/.local/bin/lowpri node .tools/pass-tally.mjs (performance.md, Gorod Krovi frame drops)
import { chromium } from '../node_modules/playwright-core/index.mjs';
import { launchChromium } from './browser.mjs';
import { execSync } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const map = process.env.MAP || 'gorod-krovi', quality = process.env.Q || 'ultra', query = process.env.QUERY || '';
const rss = () => { try { return Math.max(0, ...execSync("ps -C chrome -o rss=,args= | grep -- '--type=renderer' | awk '{print $1}'").toString().split('\n').filter(Boolean).map(Number)) / 1048576; } catch { return 0; } };
const T0 = Date.now(); let peak = 0, dead = false; const wd = setInterval(() => { const r = rss(); peak = Math.max(peak, r); console.log('t', ((Date.now() - T0) / 1000).toFixed(0), 'rss', r.toFixed(2), 'lite', globalThis.LITE ?? 0, globalThis.STAGE ?? ''); if (r > 3.0 && !dead) { dead = true; console.log('!! renderer over 3.0 GB, stopping'); b?.close(); } }, 4000);
let b, srv, gcIv;
try {
  b = await launchChromium(chromium, { executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--js-flags=--expose-gc', '--disk-cache-size=1048576'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { const t = m.text(); if (/^\[|load|warm|nav/i.test(t)) globalThis.STAGE = t.slice(0, 90); if (/Context Lost|OUT_OF_MEMORY|Shader Error/i.test(t)) errs.push(t.slice(0, 200)); });
  await p.addInitScript(() => { const cib = globalThis.createImageBitmap, tiny = { resizeWidth: 16, resizeHeight: 16 };
    globalThis.createImageBitmap = (src, ...a) => a.length > 1 ? cib(src, ...a.slice(0, 4), { ...a[4], ...tiny }) : cib(src, { ...a[0], ...tiny }); });
  await p.addInitScript(() => { for (const C of [globalThis.AudioContext, globalThis.OfflineAudioContext, globalThis.BaseAudioContext]) { if (!C?.prototype?.decodeAudioData || C.prototype.decodeAudioData.tiny) continue;
    const f = function (buf, ok, err) { const b = this.createBuffer(1, 2205, 22050); ok?.(b); return Promise.resolve(b); }; f.tiny = true; C.prototype.decodeAudioData = f; } });
  gcIv = setInterval(() => { if (!globalThis.PROFILING) p.evaluate(() => globalThis.gc?.()).catch(() => {}); }, 2000);
  for (const pair of (process.env.ROUTE || '').split(',').filter(Boolean)) { const [u, f] = pair.split('='); await p.route(x => x.pathname === u, r => r.fulfill({ body: fs.readFileSync(f), contentType: 'text/javascript' })); }
  await p.goto('http://127.0.0.1:5190/');
  await p.evaluate(q => { const s = JSON.parse(localStorage.getItem('kino.settings') || '{}'); s.graphics = { low: 0, medium: 1, high: 2, ultra: 3 }[q]; delete s.renderScale; localStorage.setItem('kino.settings', JSON.stringify(s)); }, quality);
  const TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', glb: 'model/gltf-binary' };
  srv = http.createServer((q, s) => { const f = path.join(`scratch/lite/${map}`, path.normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^([/\\]|\.\.)+/, ''));
    fs.stat(f, (e, st) => { if (e || !st.isFile()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[f.split('.').pop()] || 'application/octet-stream', 'Content-Length': st.size, 'Access-Control-Allow-Origin': '*' }); fs.createReadStream(f).pipe(s); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  let lite = 0; const liteGlb = process.env.REAL ? null : `${map}.glb`;
  await p.route(u => u.pathname.startsWith(`/mods/maps/${map}/`), r => { const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(`/mods/maps/${map}/`.length));
    if (rel === liteGlb || (rel.startsWith('tex/') && fs.existsSync(path.join(`scratch/lite/${map}`, rel)))) { lite++; globalThis.LITE = lite; return r.continue({ url: base + rel }); } return r.continue(); });
  const t0 = Date.now(); await p.goto(`http://127.0.0.1:5190/play.html?map=${map}${query}`);
  await p.waitForFunction(() => window.kino?.debug?.getState?.().ready, null, { timeout: 600000 });
  console.log('lite textures', lite, 'ready', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'rss', rss().toFixed(2));
  await p.evaluate(() => { kino.debug.setActive(true); kino.debug.setInvulnerable?.(true); });
  if (process.env.EVAL) console.log('eval', JSON.stringify(await p.evaluate(process.env.EVAL)));   // EVAL=<js>: run once in the page after ready (tuning)
  await p.waitForTimeout(6000);
  const spawn = await p.evaluate(() => kino.mods.api.player.getFeetPosition().toArray());
  const views = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : [0, 180].map(y => ({ name: 'spawn ' + y, pos: spawn, yaw: y }));
  for (const v of views) {
    const r = await p.evaluate(async v => {
      const D = kino.debug, api = kino.mods.api, R = api.renderer, sc = api.scene;
      D.teleportPlayer(v.pos); api.camera.rotation.set((v.pitch || 0) * Math.PI / 180, v.yaw * Math.PI / 180, 0, 'YXZ');
      const e = api.enemies; for (const z of [...e.list]) e.hurt(z, 1e9, false, false, 'bullet');
      await new Promise(r => setTimeout(r, 2500));
      const rtName = new Map(), T = {};
      const label = rt => { if (!rt) return 'screen'; let n = rtName.get(rt); if (n) return n;
        sc.traverse(o => { if (o.isLight && o.shadow?.map === rt) n = 'shadow:' + (o.name || o.type); });
        n ??= `rt ${rt.width}x${rt.height}`; rtName.set(rt, n); return n; };   // same-size targets count as one (the composer alternates two)
      const top = o => { let t = o, c = null; while (t.parent && t.parent !== sc) { c = t; t = t.parent; } return (t.name || t.type) + (t.name ? '' : '>' + (c?.name || c?.type || '')); };
      const base = R.renderBufferDirect;
      R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        let n = group ? group.count : geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
        if (!group && isFinite(geometry.drawRange.count)) n = Math.min(n, geometry.drawRange.count);
        let inst = 1; if (object.isInstancedMesh) inst = object.count; else if (geometry.isInstancedBufferGeometry) inst = Math.min(geometry.instanceCount, geometry._maxInstanceCount ?? Infinity);
        if (object.isBatchedMesh) { n = 0; const c = object._multiDrawCounts; for (let i = 0; i < object._multiDrawCount; i++) n += c[i]; }
        const tris = n / 3 * inst, L = T[label(R.getRenderTarget())] ??= { tris: 0, calls: 0, by: {} };
        const kind = object.isBatchedMesh ? 'batched' : object.isInstancedMesh ? 'instanced' : object.isSkinnedMesh ? 'skinned' : object.isMesh ? 'mesh' : object.isSprite ? 'sprite' : object.isPoints ? 'points' : 'line';
        const K = L.kinds ??= {}; K[kind] = (K[kind] ?? 0) + 1; if (material.id !== L.lastM) { L.mat = (L.mat ?? 0) + 1; L.lastM = material.id; } (L.mats ??= new Set()).add(material.id); const pr = R.properties.get(material).currentProgram?.id; if (pr !== L.lastP) { L.prog = (L.prog ?? 0) + 1; L.lastP = pr; } (L.progs ??= new Set()).add(pr);
        (L.tr ??= [0, 0])[material.transparent ? 1 : 0]++;
        L.tris += tris; L.calls++; const k = (top(object) + ' :: ' + (object.name || object.type).replace(/\d+/g, '#')).slice(0, 70); const B = L.by[k] ??= [0, 0]; B[0] += tris; B[1]++;
        return base.apply(this, arguments);
      };
      let frames = 0; const ts = []; let last = performance.now();
      await new Promise(res => { const end = last + 3000; (function f(t) { frames++; ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(); })(last); });
      R.renderBufferDirect = base; ts.shift(); frames = ts.length;
      // CPU time of each render call (JS + GL command encoding), by target, in a second window without the tally hook
      const cpu = {}, rb = R.render, sb = R.shadowMap.render; let cf = 0, depth = 0, shadowT = 0;
      R.render = function () { const k = label(R.getRenderTarget()), t0 = performance.now(), s0 = shadowT; depth++; try { return rb.apply(this, arguments); } finally { depth--; const c = cpu[k] ??= [0, 0]; c[0] += performance.now() - t0 - (shadowT - s0); c[1]++; } };
      R.shadowMap.render = function () { const t0 = performance.now(); try { return sb.apply(this, arguments); } finally { const d = performance.now() - t0; shadowT += d; const c = cpu['shadow maps'] ??= [0, 0]; c[0] += d; c[1]++; } };
      await new Promise(res => { const end = performance.now() + 3000; (function f(t) { cf++; if (t < end) requestAnimationFrame(f); else res(); })(performance.now()); });
      R.render = rb; R.shadowMap.render = sb;
      const out = { frames, ms: +(ts.reduce((a, b) => a + b, 0) / frames).toFixed(1), sun: kino.gkSun ? { ...kino.gkSun.stats, area: kino.gkSun.area, q: kino.gkSun.report.quality } : null, passes: {} };
      for (const [k, L] of Object.entries(T)) out.passes[k] = { tris: Math.round(L.tris / frames), calls: Math.round(L.calls / frames), kinds: Object.entries(L.kinds).map(([n, c]) => `${n} ${Math.round(c / frames)}`).join(', ') + ` | material switches ${Math.round(L.mat / frames)} (${L.mats.size} materials), program switches ${Math.round(L.prog / frames)} (${L.progs.size} programs), opaque/transparent ${L.tr.map(c => Math.round(c / frames)).join('/')}`, top: Object.entries(L.by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 7).map(([n, [t, c]]) => `${Math.round(t / frames / 1000)}k/${Math.round(c / frames)} ${n}`), topc: Object.entries(L.by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 90).map(([n, [t, c]]) => `${Math.round(c / frames)}c/${Math.round(t / frames / 1000)}k ${n}`) };
      out.cpu = Object.entries(cpu).map(([k, [t, n]]) => [k, +(t / cf).toFixed(2), +(n / cf).toFixed(1)]).sort((x, y) => y[1] - x[1]);
      out.pc = kino.gorod?.propCull?.() ?? null;
      out.vc = kino.visCull?.stats?.() ?? null; out.vd = kino.visCull?.describe?.(30) ?? null;
      out.odd = sc.children.filter(c => /console/.test(c.name) || (!c.name && c.isGroup)).slice(0, 12).map(c => { let n = 0, sk = 0, fc = 0, cs = 0, R = 0, first = ''; c.traverse(o => { if (!o.isMesh) return; n++; sk += +!!o.isSkinnedMesh; fc += +o.frustumCulled; cs += +o.castShadow; first ||= (o.name + '/' + (o.material?.name ?? '')); const bs = o.boundingSphere ?? o.geometry.boundingSphere; if (bs) R = Math.max(R, bs.radius * o.matrixWorld.getMaxScaleOnAxis()); });
        return `${c.name || 'Group'}(${c.children.length} kids, ${n} meshes, ${sk} skinned, ${fc} culled, ${cs} cast, maxR ${Math.round(R)}, vis ${c.visible}, first ${first.slice(0, 40)}, kid0 ${c.children[0]?.name})`; });
      const ic = kino.instanceCull; out.ic = ic ? { batches: ic.meshes, instances: ic.instances, drawn: ic.drawn, followers: ic.followers } : null;
      return out;
    }, v);
    console.log(`\n== ${v.name}: ${r.frames} frames, ${r.ms} ms/frame, sun ${JSON.stringify(r.sun)}`);
    for (const AB of (process.env.AB || '').split(';').filter(Boolean)) {   // AB=<js lvalue>, e.g. kino.visCull.enabled: off/on back and forth in the same page (two separate runs differ by more than most changes on a shared host)
      const ab = await p.evaluate(async lv => { const set = new Function('v', lv + '=v'), R = kino.mods.api.renderer, rb = R.render, out = { off: [], on: [] };
        for (let i = 0; i < 10; i++) { set(i % 2 === 1); await new Promise(r => setTimeout(r, 1200)); let n = 0, cpu = 0, calls = 0, depth = 0;
          R.render = function () { const t0 = performance.now(); depth++; try { return rb.apply(this, arguments); } finally { if (!--depth) cpu += performance.now() - t0; } };
          const t0 = performance.now(); await new Promise(res => (function f(t) { n++; calls += R.info.render.calls; if (t - t0 < 2500) requestAnimationFrame(f); else res(); })(t0));
          R.render = rb; out[i % 2 ? 'on' : 'off'].push([+((performance.now() - t0) / n).toFixed(1), +(cpu / n).toFixed(1), Math.round(calls / n)]); }
        set(true); return out; }, AB);
      for (const k of ['off', 'on']) console.log(`  ${AB} ${k}: ms/frame ${ab[k].map(x => x[0]).join(' ')} | render cpu ${ab[k].map(x => x[1]).join(' ')} | calls ${ab[k].map(x => x[2]).join(' ')}`);
    }
    if (process.env.SHOTS) {   // SHOTS=<folder>: a frame of each view, grabbed inside the page (page.screenshot stalls on a shared GPU)
      fs.mkdirSync(process.env.SHOTS, { recursive: true });   // SHOT_AB=<js lvalue>: two frames a view, the value false then true (zombies are cleared first)
      const sets = (process.env.SHOT_SET || '').split('|').filter(Boolean);   // SHOT_SET='js|js|...': one frame a view after each snippet (tuning a look in one load)
      for (const on of process.env.SHOT_AB ? [false, true] : sets.length ? sets.map((_, i) => i) : [null]) {
        const url = await p.evaluate(([lv, on, js]) => new Promise(res => { if (js) new Function(js)(); else if (lv) new Function('v', lv + '=v')(on); kino.debug.clearEnemies?.();
          setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => res(kino.mods.api.renderer.domElement.toDataURL('image/jpeg', .9)))), 400); }), [process.env.SHOT_AB, on, typeof on === 'number' ? sets[on] : null]);
        fs.writeFileSync(path.join(process.env.SHOTS, v.name.replace(/\W+/g, '_') + (on === null ? '' : typeof on === 'number' ? '_' + on : on ? '_on' : '_off') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
      }
    }
    for (const [k, L] of Object.entries(r.passes).sort((a, b) => b[1].tris - a[1].tris)) { if (L.calls < 20) continue; console.log(`  ${k}: ${(L.tris / 1e6).toFixed(2)}M tris, ${L.calls} calls`); if (L.calls > 100) console.log('    ' + L.kinds); for (const t of L.top) console.log('      ' + t); if (process.env.DETAIL && L.calls > 100) console.log('    by calls: ' + L.topc.slice(0, +process.env.DETAIL > 1 ? +process.env.DETAIL : 14).join(' | ')); }
    console.log('  cpu ms/frame by target: ' + r.cpu.filter(c => c[1] >= .05).map(c => `${c[0]} ${c[1]}`).join(' | '));
    if (process.env.PROFILE) { const cdp = await p.context().newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); globalThis.PROFILING = true; await cdp.send('Profiler.start'); await p.waitForTimeout(5000); globalThis.PROFILING = false;
      const { profile } = await cdp.send('Profiler.stop'); const f = `${process.env.PROFILE}.${views.indexOf(v)}.cpuprofile`; fs.writeFileSync(f, JSON.stringify(profile)); console.log('  profile', f); await cdp.detach(); }
    console.log('  cull', JSON.stringify(r.ic)); console.log('  props', JSON.stringify(r.pc)); console.log('  vis', JSON.stringify(r.vc)); if (process.env.DUMP && r.vd) console.log('  groups: ' + r.vd.map(g => JSON.stringify(g)).join('\n          ')); if (process.env.DUMP) console.log('  odd: ' + r.odd.join('\n       '));
  }
  console.log('\nerrors', errs.length, errs.slice(0, 3).join(' | ').slice(0, 300));
} finally { clearInterval(wd); clearInterval(gcIv); await b?.close().catch(() => {}); srv?.close(); console.log('peak renderer rss GB', peak.toFixed(2)); }

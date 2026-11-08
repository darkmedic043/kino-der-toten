// node .tools/aw-fit/fit.mjs aw_ak12,aw_lynx [--pap]  (run under flock + lowpri). Per gun: measure the idle gun, propose part
// mounts (opts.json overrides per gun), mount them, contact + ADS sight checks, renders to scratch/aw2/fit/out/. Browser closed in finally.
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const rss = () => { try { return Math.max(...execSync("ps -eo rss,args | grep -E 'ms-playwright.*--type=renderer' | grep -v grep | awk '{print $1}'").toString().trim().split('\n').map(Number)) / 1024 | 0; } catch { return -1; } };
const ids = process.argv[2].split(','), pap = process.argv.includes('--pap'), dir = 'scratch/aw2/fit/out/'; fs.mkdirSync(dir, { recursive: true });
const opts = JSON.parse(fs.readFileSync('.tools/aw-fit/opts.json', 'utf8'));
const src = fs.readFileSync('.tools/aw-fit/page.js', 'utf8');
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = (n, d) => fs.writeFileSync(dir + n + '.jpg', Buffer.from(d.split(',')[1], 'base64'));
try {
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', e => console.log('PAGEERROR ' + String(e).slice(0, 300)));
  p.on('console', m => { const t = m.text(); if (/Context Lost|rror/i.test(t)) console.log('CONSOLE ' + t.slice(0, 200)); });
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('kino.settings') || '{}'); s.graphics = 1; s.renderScale = .6; s.devConsole = true; localStorage.setItem('kino.settings', JSON.stringify(s)); });
  await p.goto('http://127.0.0.1:5190/play.html?map=kino');
  await p.waitForFunction(() => window.kino?.debug?.getState?.().ready, null, { timeout: 900000 });
  await p.evaluate(() => { document.getElementById('start')?.click(); kino.debug.setActive(true); kino.debug.setInvulnerable(true); kino.debug.setAutoSpawn?.(false); });
  await p.addScriptTag({ content: src });
  console.log('ready rss', rss());
const settle = async (mounts, skip = new Set()) => {   // a part that floats moves toward the gun by its gap (up to 3 times)
    let c = await p.evaluate(() => fit.contact());
    for (let it = 0; it < 3; it++) {
      const loose = c.filter(x => x.near > .3 && x.near < 3); if (!loose.length) break;
      for (const x of loose) for (const [k, mm] of Object.entries(mounts)) if ('part_' + mm.part === x.part && !skip.has(k)) {
        const nrm = { silencer: [-1, 0, 0], brake: [-1, 0, 0], foregrip: [0, 0, 1], stabilizer: [0, 0, -1] }[mm.part] ?? (mm.rot ? [0, -1, 0] : [0, 0, 1]);
        mm.at = mm.at.map((v, i) => +(v + nrm[i] * (x.near - .08)).toFixed(2)); }
      await p.evaluate(ms => fit.mount(ms), mounts); await sleep(200); c = await p.evaluate(() => fit.contact());
    }
    return c;
  };
  const grab = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => r(kino.mods.api.renderer.domElement.toDataURL('image/jpeg', .8)))));
  const cheat = c => p.evaluate(c => { const f = document.querySelector('#cheat-console form'); f.querySelector('input').value = c; f.requestSubmit(); }, c);
  for (const id of ids) try {
    const o = opts[id] ?? {};
    await p.evaluate(id => kino.debug.giveWeapon(id), id); await sleep(3500);
    const m = await p.evaluate(() => fit.measure());
    const kit = await p.evaluate(() => kino.mods.api.session.def.statAttachments ?? []);
    o.cls ??= await p.evaluate(() => kino.mods.api.session.def.weaponClass);
    const pr = o.mounts ? { mounts: o.mounts, notes: 'manual' } : await p.evaluate(([k, o]) => fit.propose(k, o), [kit, o]);
    console.log(id, JSON.stringify(m.meshes), JSON.stringify(pr.notes), JSON.stringify(pr.mounts));
    if (o.fixed) Object.assign(pr.mounts, o.fixed);
    for (const k of [...(o.drop ?? []), ...(o.veto ?? [])]) delete pr.mounts[k];
    for (const [k, mm] of Object.entries(pr.mounts)) if (!mm.tag || mm.at.some(v => !isFinite(v) || Math.abs(v) > 1e4)) { console.log(id, 'skip', k, 'no fit'); delete pr.mounts[k]; }
    for (const [k, t] of Object.entries(o.retag ?? {})) if (pr.mounts[k]) pr.mounts[k].tag = t;
    await p.evaluate(ms => fit.mount(ms), pr.mounts); await sleep(300);
    let c = await settle(pr.mounts);
    save(id + '-hip', await grab());
    const sv = await p.evaluate(() => fit.side(['left', 'top', 'front', 'bottom']));
    for (const [k, d] of Object.entries(sv)) save(id + '-' + k, d);
    {
      const where = {}; for (const [k, mm] of Object.entries(pr.mounts)) { const key = mm.at.map(x => Math.round(x)).join(','); where[key] ??= [k, mm]; }
      const tiles = [];
      for (const [k, mm] of Object.values(where)) {
        const live = await p.evaluate(([tag, at]) => fit.rest2live(tag, at), [mm.tag, mm.at]);
        const off = { silencer: [7, 0, 0], brake: [2, 0, 0], laser_tracker: [4, 1, -1.5], laser_sight: [4, 1, -1.5], foregrip: [0, 0, -3], stabilizer: [0, 0, 0] }[mm.part] ?? [0, 0, 0];
        const f = live.map((x, i) => x + off[i]);
        const z = await p.evaluate(f => fit.side(['left', 'top', 'front', 'bottom'], 320, f, 13), f);
        for (const v of ['left', 'top', 'front', 'bottom']) { const n = `${dir}z-${id}-${k}-${v}.jpg`; fs.writeFileSync(n, Buffer.from(z[v].split(',')[1], 'base64')); tiles.push(n); }
      }
      if (tiles.length) { const rows = tiles.length / 4; execSync(`ffmpeg -loglevel error -y ${tiles.map(t => '-i ' + t).join(' ')} -filter_complex "${tiles.map((t, i) => `[${i}]`).join('')}xstack=inputs=${tiles.length}:layout=${tiles.map((t, i) => `${(i % 4) * 320}_${Math.floor(i / 4) * 160}`).join('|')}" scratch/aw2/fit/zoom-${id}.jpg`); for (const t of tiles) fs.unlinkSync(t); }
    }
    await p.mouse.move(320, 180); await p.mouse.down({ button: 'right' }); await sleep(1600);
    const blk = await p.evaluate(() => fit.aimBlock()); save(id + '-ads', await grab());
    await p.mouse.up({ button: 'right' }); await sleep(400);
    let up = null; const upFix = {};
    if (pap) {
      await cheat('pap'); await sleep(4000);
      await p.evaluate(() => fit.measure()); await p.evaluate(ms => fit.mount(ms), pr.mounts); await sleep(300);
      up = await p.evaluate(() => fit.contact());
      // the upgraded model can differ (shorter barrel, other stock): refit the parts that fail on it, as mount.up overrides
      const bad = new Set(up.filter(x => x.loose.length || x.near > .3).map(x => x.part));
      if (bad.size) {
        const pu = await p.evaluate(([k, o]) => fit.propose(k, o), [kit, o]), um = structuredClone(pr.mounts), keep = new Set();
        for (const [k, mm] of Object.entries(pr.mounts)) {
          if (!bad.has('part_' + mm.part)) { keep.add(k); continue; }
          const n = pu.mounts[k];
          if (n?.tag && n.at.every(v => isFinite(v) && Math.abs(v) < 1e4)) { if (o.retag?.[k]) n.tag = o.retag[k]; um[k] = n; } else { delete um[k]; upFix[k] = false; }
        }
        await p.evaluate(ms => fit.mount(ms), um); await sleep(300);
        up = await settle(um, keep);
        for (const x of up) if (x.loose.length || x.near > .3) for (const [k, mm] of Object.entries(um)) if ('part_' + mm.part === x.part && !keep.has(k)) { delete um[k]; upFix[k] = false; }
        for (const [k, mm] of Object.entries(um)) if (!keep.has(k)) upFix[k] = mm;
        await p.evaluate(ms => fit.mount(ms), um); await sleep(300); up = await p.evaluate(() => fit.contact());
      }
      const s2 = await p.evaluate(() => fit.side(['left', 'top'])); for (const [k, d] of Object.entries(s2)) save(id + '-up-' + k, d);
    }
    fs.writeFileSync(dir + id + '.json', JSON.stringify({ id, kit, meshes: m.meshes, tags: m.bones, ...pr, contact: c, aimBlock: blk, up, upFix }, null, 1));
    const bad = c.filter(x => x.loose.length || x.near > .3).map(x => x.part + ':' + x.near + (x.loose.length ? ' loose ' + x.loose.join('/') : ''));
    const ubad = (up ?? []).filter(x => x.loose.length || x.near > .3).map(x => x.part + ':' + x.near);
    console.log(id, 'tris', m.tris, 'mounts', Object.keys(pr.mounts).length, 'bad', JSON.stringify(bad), 'aim', JSON.stringify(blk), pap ? 'up-bad ' + JSON.stringify(ubad) + ' upFix ' + JSON.stringify(Object.fromEntries(Object.entries(upFix).map(([k, v]) => [k, v && v.at]))) : '', 'rss', rss());
  } catch (e) { console.log(id, 'FAILED', String(e).slice(0, 200)); }
} finally { await b.close(); }

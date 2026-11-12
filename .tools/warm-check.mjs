// Smoke test of the real engine after an engine or mod-setup edit: MAP=sandbox ~/.local/bin/lowpri node .tools/warm-check.mjs
// (a small map with a phone profile, so the load stays light). Prints the load time, the renderer's memory, the shader warm-up
// line, mod errors and the terminal booths in the scene. OLD=1 runs HEAD's terminal-booth mod.js for a before/after.
import { chromium } from '../node_modules/playwright-core/index.mjs'; import { execSync } from 'node:child_process';
const MAP = process.env.MAP || 'sandbox';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const rss = () => { try { return execSync("ps -C chrome -o rss=,args= | grep -- '--type=renderer' | sort -n | tail -1 | awk '{print int($1/1024)}'").toString().trim(); } catch { return '?'; } };
try {
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const lines = []; p.on('console', m => { const t = m.text(); if (/Context Lost|warm-shaders|terminal-booth|\[mods\]|Error|error|Uncaught|MEMORY/.test(t)) lines.push(t.slice(0, 260)); });
  p.on('pageerror', e => lines.push('PAGEERROR ' + String(e).slice(0, 200)));
  if (process.env.OLD) { const body = execSync('git show HEAD:export/web/mods/terminal-booth/mod.js', { maxBuffer: 1e8 }).toString(); await p.route(/\/mods\/terminal-booth\/mod\.js(\?|$)/, r => r.fulfill({ contentType: 'text/javascript', body })); }
  await p.goto('http://127.0.0.1:5190/');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('kino.settings') || '{}'); s.graphics = 1; s.renderScale = .5; localStorage.setItem('kino.settings', JSON.stringify(s)); });
  const t0 = Date.now(); await p.goto('http://127.0.0.1:5190/play.html?map=' + MAP);
  const iv = setInterval(() => console.log('  t', ((Date.now() - t0) / 1000).toFixed(0), 'renderer MB', rss()), 10000);
  try { await p.waitForFunction(() => window.kino?.debug?.getState?.().ready || /Unable/.test(document.getElementById('load-label')?.textContent || ''), null, { timeout: 300000 }); } finally { clearInterval(iv); }
  console.log(MAP, 'ready in', ((Date.now() - t0) / 1000).toFixed(1), 's; renderer MB', rss());
  console.log(JSON.stringify(await p.evaluate(() => ({ label: document.getElementById('load-label')?.textContent, programs: kino.mods?.api?.renderer?.info?.programs?.length,
    booths: (kino.terminalBooth?.booths || []).map(b => ({ at: b.root.position.toArray().map(v => +v.toFixed(3)), rot: +b.root.rotation.y.toFixed(4), sc: +b.root.scale.x.toFixed(4), vis: b.root.visible, inScene: (() => { let o = b.root; while (o.parent) o = o.parent; return !!o.isScene; })() })) }))));
  console.log(lines.join('\n'));
} finally { await b.close(); }

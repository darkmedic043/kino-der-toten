#!/usr/bin/env node
// Summarises the play-time 'perf' / 'perfEnd' lines (export/web/perf-diag.js) in client-log.jsonl.
// node .tools/perf-report.mjs [filter] [--all]
//   filter: matched against the signed-in name, GPU string or page (case-insensitive), e.g. 4070, SleepyZoroark, der-eisendrache
//   --all: every 10 s window, not just each session's summary and its worst windows
// KINO_DATA (default ~/.local/share/kino) is where kino-server keeps client-log.jsonl (and the rotated .1).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2), all = args.includes('--all'), filter = args.find(a => !a.startsWith('--'))?.toLowerCase();
const dir = process.env.KINO_DATA || join(homedir(), '.local/share/kino');
const lines = ['client-log.jsonl.1', 'client-log.jsonl'].map(f => join(dir, f)).filter(existsSync)
  .flatMap(f => readFileSync(f, 'utf8').split('\n')).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// the GPU and user agent come with the stage/beat events; carry the latest one per user forward onto perf lines
const gpuOf = new Map();
const rows = [];
for (const e of lines) {
  const key = e.who ?? 'anon';
  if (e.gpu) gpuOf.set(key, { gpu: e.gpu, ua: e.ua });
  if (e.ev !== 'perf' && e.ev !== 'perfEnd') continue;
  const g = gpuOf.get(key) ?? {};
  const row = { ...e, gpu: g.gpu ?? '', rind: /Rind\/([\d.]+)/.exec(g.ua ?? '')?.[1] };
  if (filter && ![row.who, row.gpu, row.page].some(v => String(v ?? '').toLowerCase().includes(filter))) continue;
  rows.push(row);
}
if (!rows.length) { console.log('No perf lines' + (filter ? ` matching "${filter}"` : '') + ' yet. They are written while a map is being played.'); process.exit(0); }

const map = p => /map=([^&]+)/.exec(p ?? '')?.[1] ?? p;
const gpuShort = g => (/(?:NVIDIA |AMD |Intel\(R\) )?((?:GeForce|Radeon|Arc|Iris|UHD|RTX|GTX)[^,(]*)/.exec(g)?.[1] ?? g).trim();
const QUALITY = ['Low', 'Medium', 'High', 'Ultra'];
const HIST = ['≤8', '≤17', '≤25', '≤33', '≤50', '≤100', '>100'];
const histLine = h => h.map((n, i) => `${HIST[i]}:${n}`).join(' ');

function windowLine(w) {
  const mods = (w.mods ?? []).map(([id, avg, max]) => `${id} ${avg}/${max}`).join(', ');
  return `  ${w.at.slice(11, 19)} ${String(w.fps).padStart(5)} fps  interval p50/p95/p99/max ${w.gap.join('/')} ms  update ${w.upd.join('/')}  render ${w.ren.join('/')}` +
    `  zombies ${w.zombies}  calls ${w.calls}  gc ${w.gc[0]} (${w.gc[1]} MB)  long ${w.long[0]} (${w.long[1]} ms, max ${w.long[2]})  heap ${w.heap}/${w.heapMax} MB` +
    (w.hitches?.length ? `\n      hitches [s, ms, update, render, gcMB]: ${w.hitches.map(h => `[${h.join(', ')}]`).join(' ')}` : '') +
    (mods ? `\n      mods avg/max ms: ${mods}` : '');
}

// group windows into sessions: same user and page, ending at a perfEnd or a gap of over 2 minutes
const sessions = [];
let cur = null;
for (const r of rows) {
  const t = Date.parse(r.at);
  if (!cur || cur.who !== r.who || cur.page !== r.page || t - cur.last > 120000) sessions.push(cur = { who: r.who, page: r.page, gpu: r.gpu, rind: r.rind, windows: [], end: null, last: t });
  cur.last = t;
  if (r.ev === 'perfEnd') { cur.end = r; cur = null; } else cur.windows.push(r);
}

for (const s of sessions) {
  const w0 = s.windows[0] ?? s.end, sum = s.end;
  console.log(`\n=== ${w0.at.slice(0, 16).replace('T', ' ')}  ${s.who ?? 'anon'}  ${map(s.page)}  ${gpuShort(s.gpu)}${s.rind ? `  Rind ${s.rind}` : '  browser'}`);
  console.log(`    ${QUALITY[w0.q] ?? w0.q} quality, render scale ${w0.scale}, fps cap ${w0.cap || 'none'}, canvas ${w0.px}${w0.coop ? ', co-op' : ''}`);
  if (sum) console.log(`    session: ${sum.minutes} min, ${sum.fps} fps avg, ${sum.hitches} hitches over 50 ms (worst ${sum.worst} ms), ${sum.gc} heap drops, long tasks ${sum.long[0]} (${sum.long[1]} ms)\n    frame intervals: ${histLine(sum.hist)}`);
  const ws = s.windows;
  if (!ws.length) continue;
  const fps = ws.map(w => w.fps), avg = fps.reduce((a, b) => a + b, 0) / fps.length;
  console.log(`    ${ws.length} windows: fps avg ${avg.toFixed(0)}, min ${Math.min(...fps)}, max ${Math.max(...fps)}; avg update ${(ws.reduce((a, w) => a + w.upd[0], 0) / ws.length).toFixed(1)} ms, render ${(ws.reduce((a, w) => a + w.ren[0], 0) / ws.length).toFixed(1)} ms`);
  // mods: average per-frame cost over the session
  const modCost = new Map();
  for (const w of ws) for (const [id, a, m] of w.mods ?? []) { const c = modCost.get(id) ?? { a: 0, m: 0 }; c.a += a / ws.length; c.m = Math.max(c.m, m); modCost.set(id, c); }
  if (modCost.size) console.log(`    costliest mod updates (avg/max ms): ${[...modCost].sort((a, b) => b[1].a - a[1].a).slice(0, 6).map(([id, c]) => `${id} ${c.a.toFixed(2)}/${c.m.toFixed(1)}`).join(', ')}`);
  const shown = all ? ws : [...ws].sort((a, b) => b.gap[2] - a.gap[2]).slice(0, 3).sort((a, b) => a.at.localeCompare(b.at));
  console.log(all ? '    windows:' : '    worst windows (by p99 interval):');
  for (const w of shown) console.log(windowLine(w));
}

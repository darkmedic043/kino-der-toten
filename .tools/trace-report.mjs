#!/usr/bin/env node
// Reads a Chromium trace uploaded by Rind's runtime (POST /api/trace, stored under
// KINO_DATA/traces/<who>-<time>.json.gz) and reports what the GPU process, the browser
// process and the renderer were doing around the game's user-timing marks:
// 'kino-ready' (the warm-up done), 'kino-play' (the first played frame) and
// 'kino-hitch <n>ms' (one per hitch, placed at the END of the gap).
//
//   node .tools/trace-report.mjs [file.json.gz | latest] [--top 14] [--marks] [--names]
//     --top n     longest events listed per window (default 14)
//     --marks     list every user-timing mark and stop
//     --names [re] per-process totals by event name over the whole trace (top 40, or every name matching re)
//     --all       also windows for hitches under 150 ms
//     --long ms   list every event over ms (except the generic task wrappers), in time order
//     --dump re   print the full args of every event whose name matches (shader sources of ShaderTranslateTaskD3D...)
//     --grep re   list every event whose name matches, with the top-level task it ran inside
import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i < 0 ? dflt : (args[i + 1] ?? true); };
const TOP = +opt('--top', 14);
const DIR = join(process.env.KINO_DATA || join(homedir(), '.local', 'share', 'kino'), 'traces');
let file = args.find(a => !a.startsWith('--') && a !== String(TOP)) || 'latest';
if (file === 'latest') {
  const files = readdirSync(DIR).filter(f => f.endsWith('.json.gz')).map(f => join(DIR, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!files.length) { console.error('no traces in ' + DIR); process.exit(1); }
  file = files[0];
}
// Stream the events (the JSON can exceed Node's string limit): gunzip chunk by chunk, split the
// top-level objects of the traceEvents array by brace depth and parse each one alone.
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
const events = []; let metadata = null;
async function load(file) {
  const head = Buffer.alloc(2); { const fd = openSync(file, 'r'); readSync(fd, head, 0, 2, 0); closeSync(fd); }
  const src = createReadStream(file);
  const stream = head[0] === 0x1f && head[1] === 0x8b ? src.pipe(createGunzip()) : src;
  let depth = 0, inStr = false, esc = false, buf = '', started = false, tail = '';
  const keep = e => {
    if (e.ph === 'M' || e.ph === 'X' || e.ph === 'B' || e.ph === 'E' || e.ph === 'R' || e.ph === 'I' || e.ph === 'n' || e.ph === 'b') {
      if (e.args && !(e.ph === 'M' || (e.dur > 2000))) e.args = undefined;
      events.push(e);
    }
  };
  for await (const chunk of stream) {
    const text = chunk.toString('latin1');
    let i = 0;
    if (!started) { const k = text.indexOf('"traceEvents"'); if (k < 0) { tail = text.slice(-20); continue; } i = text.indexOf('[', k) + 1; started = true; }
    for (; i < text.length; i++) {
      const c = text[i];
      if (depth === 0) { if (c === '{') { depth = 1; buf = '{'; } else if (c === ']') { started = 2; break; } continue; }
      buf += c;
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { if (--depth === 0) { try { keep(JSON.parse(Buffer.from(buf, 'latin1').toString('utf8'))); } catch {} buf = ''; } }
    }
    if (started === 2) { tail = text.slice(i); break; }
  }
  const m = /"metadata"\s*:\s*(\{.*\})\s*\}?\s*$/s.exec(tail); if (m) { try { metadata = JSON.parse(m[1]); } catch {} }
}
await load(file);
const json = { metadata };
console.log(`${file}: ${events.length} events kept` + (json.metadata ? `, ${JSON.stringify(json.metadata).slice(0, 200)}` : ''));

// process and thread names
const pname = new Map(), tname = new Map();
for (const e of events) {
  if (e.ph !== 'M') continue;
  if (e.name === 'process_name') pname.set(e.pid, e.args?.name);
  if (e.name === 'thread_name') tname.set(e.pid + ':' + e.tid, e.args?.name);
}
const proc = pid => (pname.get(pid) || 'pid ' + pid).replace('Renderer', 'renderer').replace('GPU Process', 'gpu').replace('Browser', 'browser');
const thread = e => (tname.get(e.pid + ':' + e.tid) || 'tid ' + e.tid).replace('CrGpuMain', 'gpu-main').replace('CrRendererMain', 'main').replace('CrBrowserMain', 'main');

// complete events: 'X' with dur, plus paired B/E per thread
const spans = []; const open = new Map();
for (const e of events) {
  if (e.ph === 'X') { if (e.dur > 0) spans.push({ ts: e.ts, dur: e.dur, name: e.name, cat: e.cat, pid: e.pid, tid: e.tid, args: e.args }); }
  else if (e.ph === 'B') { const k = e.pid + ':' + e.tid; (open.get(k) || open.set(k, []).get(k)).push(e); }
  else if (e.ph === 'E') { const k = e.pid + ':' + e.tid; const st = open.get(k); const b = st?.pop(); if (b) spans.push({ ts: b.ts, dur: e.ts - b.ts, name: b.name, cat: b.cat, pid: b.pid, tid: b.tid, args: b.args }); }
}
spans.sort((a, b) => a.ts - b.ts);
let t0 = Infinity, t1 = 0;
for (const e of events) { if (e.ts > 0 && e.ts < t0) t0 = e.ts; if (e.ts > t1) t1 = e.ts; }
for (const s of spans) if (s.ts + s.dur > t1) t1 = s.ts + s.dur;
const sec = ts => ((ts - t0) / 1e6).toFixed(3) + 's';
const procs = [...new Set(events.map(e => e.pid))].map(p => `${proc(p)}(${p})`).join(', ');
console.log(`span ${((t1 - t0) / 1e6).toFixed(1)} s; processes: ${procs}`);

// user-timing marks
const marks = events.filter(e => e.cat?.includes('blink.user_timing') && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n' || e.ph === 'b'))
  .filter(e => /^kino-/.test(e.name)).sort((a, b) => a.ts - b.ts);
if (opt('--marks', false) || !marks.length) {
  console.log(`marks (${marks.length}):`); for (const m of marks) console.log('  ' + sec(m.ts) + '  ' + m.name);
  if (opt('--marks', false)) process.exit(0);
  if (!marks.length) console.log('(no kino- marks: trace started before the page, or user timing category missing)');
}

function argStr(a) {
  if (!a) return '';
  const s = JSON.stringify(a); return s.length > 90 ? s.slice(0, 88) + '…' : s;
}
function window_(title, from, to) {
  const inWin = spans.filter(s => s.ts < to && s.ts + s.dur > from);
  // busy time per process/thread inside the window (top-level spans only: skip spans nested in a longer one on the same thread)
  const byThread = new Map();
  for (const s of inWin) {
    const k = proc(s.pid) + '/' + thread(s);
    const cur = byThread.get(k) || { busy: 0, last: -1 };
    const a = Math.max(from, s.ts), b = Math.min(to, s.ts + s.dur);
    if (a >= cur.last) { cur.busy += b - a; cur.last = b; } else if (b > cur.last) { cur.busy += b - cur.last; cur.last = b; }
    byThread.set(k, cur);
  }
  console.log(`\n== ${title}  [${sec(from)} .. ${sec(to)}]  ${((to - from) / 1000).toFixed(0)} ms, ${inWin.length} events`);
  const busy = [...byThread].sort((a, b) => b[1].busy - a[1].busy).slice(0, 8)
    .map(([k, v]) => `${k} ${(v.busy / 1000).toFixed(0)}ms`).join(', ');
  console.log('busy: ' + busy);
  const top = inWin.slice().sort((a, b) => b.dur - a.dur).slice(0, TOP);
  for (const s of top) {
    const inside = Math.min(to, s.ts + s.dur) - Math.max(from, s.ts);
    console.log(`  ${(s.dur / 1000).toFixed(1).padStart(8)} ms  ${proc(s.pid)}/${thread(s)}  ${s.name}  ${sec(s.ts)}${inside < s.dur ? ` (${(inside / 1000).toFixed(0)} ms inside)` : ''}  ${argStr(s.args)}`);
  }
}


const LONG = +opt('--long', 0);
if (LONG) {
  const skip = /^(ThreadControllerImpl::RunTask|Scheduler::RunTask|ThreadPool_RunTask|GpuChannel::ExecuteDeferredRequest|CommandBuffer::Flush|CommandBufferStub::OnAsyncFlush|CommandBufferService:PutChanged|SimpleWatcher::OnHandleReady|Receive mojo message|MessageLoop::RunTask|RendererRasterWorker)$/;
  console.log(`\n== events over ${LONG} ms`);
  for (const s of spans) if (s.dur >= LONG * 1000 && !skip.test(s.name))
    console.log(`  ${sec(s.ts)}  ${(s.dur / 1000).toFixed(1).padStart(8)} ms  ${proc(s.pid)}/${thread(s)}  ${s.name}  ${argStr(s.args)}`);
}

const dump = opt('--dump', null);
if (dump) { const re = new RegExp(dump); let n = 0; for (const s of spans) if (re.test(s.name) && s.args && n++ < 40) console.log(`\n-- ${sec(s.ts)} ${(s.dur / 1000).toFixed(1)} ms ${proc(s.pid)}/${thread(s)} ${s.name}\n` + JSON.stringify(s.args, null, 1).slice(0, +opt('--dump-len', 4000))); }

const grep = opt('--grep', null);
if (grep) {
  const re = new RegExp(grep);
  // top-level span per thread covering each match (the outermost task on that thread)
  const byThread = new Map();
  for (const s of spans) { const k = s.pid + ':' + s.tid; const st = byThread.get(k) || []; st.push(s); byThread.set(k, st); }
  const outer = s => { const st = byThread.get(s.pid + ':' + s.tid); let best = s; for (const o of st) { if (o.ts > s.ts) break; if (o.ts <= s.ts && o.ts + o.dur >= s.ts + s.dur && o.dur > best.dur) best = o; } return best; };
  const childNames = s => { const st = byThread.get(s.pid + ':' + s.tid); const names = new Set(); for (const o of st) { if (o.ts >= s.ts + s.dur) break; if (o.ts >= s.ts && o !== s && o.dur > s.dur * 0.3) names.add(o.name); } return [...names].slice(0, 6).join(' > '); };
  console.log(`\n== events matching /${grep}/`);
  let n = 0;
  for (const s of spans) {
    if (!re.test(s.name)) continue; n++; if (n > 200) break;
    const o = outer(s);
    console.log(`  ${sec(s.ts)}  ${(s.dur / 1000).toFixed(1).padStart(8)} ms  ${proc(s.pid)}/${thread(s)}  ${s.name}  ${argStr(s.args)}  in: ${o.name}${o.args?.handler ? ' ' + o.args.handler : ''}  with: ${childNames(s)}`);
  }
  console.log(`  ${n} matches`);
}

const ready = marks.find(m => m.name === 'kino-ready'), play = marks.find(m => m.name === 'kino-play');
if (ready) window_('kino-ready → +3 s (after the warm-up)', ready.ts, ready.ts + 3e6);
if (play) window_('kino-play (first played frame) -1 s .. +8 s', play.ts - 1e6, play.ts + 8e6);
const hitches = marks.filter(m => /^kino-hitch (\d+)ms/.test(m.name)).map(m => ({ ts: m.ts, gap: +/(\d+)ms/.exec(m.name)[1] }))
  .filter(h => opt('--all', false) || h.gap >= 150).sort((a, b) => b.gap - a.gap).slice(0, 12);
for (const h of hitches) window_(`hitch ${h.gap} ms`, h.ts - h.gap * 1000 - 200e3, h.ts + 100e3);

// whole-trace: longest GPU-process events
const gpu = spans.filter(s => proc(s.pid) === 'gpu').sort((a, b) => b.dur - a.dur).slice(0, TOP);
console.log('\n== longest GPU-process events in the whole trace');
for (const s of gpu) console.log(`  ${(s.dur / 1000).toFixed(1).padStart(8)} ms  ${thread(s)}  ${s.name}  ${sec(s.ts)}  ${argStr(s.args)}`);

const namesRe = opt('--names', false);
if (namesRe) {
  const tot = new Map();
  for (const s of spans) { const k = proc(s.pid) + '  ' + s.name; const c = tot.get(k) || { n: 0, dur: 0, max: 0 }; c.n++; c.dur += s.dur; c.max = Math.max(c.max, s.dur); tot.set(k, c); }
  console.log('\n== totals by event name');
  const re = typeof namesRe === 'string' ? new RegExp(namesRe) : null;
  for (const [k, c] of [...tot].filter(([k]) => !re || re.test(k)).sort((a, b) => b[1].dur - a[1].dur).slice(0, re ? 200 : 40))
    console.log(`  ${(c.dur / 1000).toFixed(0).padStart(8)} ms  n=${String(c.n).padStart(6)}  max ${(c.max / 1000).toFixed(1).padStart(7)} ms  ${k}`);
}

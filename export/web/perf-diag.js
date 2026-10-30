// Play-time performance diagnostics (2026-10-17, user on an RTX 4070 Ti Super: "constant frame loss"). While the game is
// being played (not paused), every frame's interval, game-logic time (update) and render time are recorded, plus
// main-thread long tasks, likely garbage collections (the JS heap dropping) and each mod's 'update' handler time.
// Every 10 s a compact 'perf' summary goes to /api/client-log (kino-server writes client-log.jsonl; lines are cut at
// 4,000 characters, so keep it small), and a whole-session 'perfEnd' when the page goes away.
// Read them with `node .tools/perf-report.mjs [name|gpu]`. `?noPerfLog` turns the reporting off.
// (2026-10-27, user: "when starting a match, it lags extremely hard") each hitch also carries `busy`, the ms of main-thread long
// tasks overlapping the gap (0 = the main thread was idle: the browser or the GPU held the frame), and the engine feeds GPU
// frame times (gpuMs: avg/p95/max; gpuHit: [interval after the frame, its GPU ms] for frames followed by a hitch).
const WINDOW_MS = 10000, MAX_SENDS = 1500, HITCH_MS = 50;
// frame-interval histogram edges in ms: ≤8.3 (120 Hz), ≤16.7 (60), ≤25, ≤33.3 (30), ≤50, ≤100, more
const EDGES = [8.4, 16.8, 25, 33.4, 50, 100];
const r1 = n => Math.round(n * 10) / 10;
const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
const heapMb = () => performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null;

export function createPerfDiag({ send, context }) {
  const off = new URLSearchParams(location.search).has('noPerfLog');
  let sends = 0, last = 0, windowStart = performance.now(), lastHeap = heapMb(), w = fresh(), session = freshSession();
  function fresh() { return { gaps: [], upd: [], ren: [], hist: EDGES.map(() => 0).concat(0), hitches: [], hitchAbs: [], gpu: [], gpuHit: [], gc: 0, gcMb: 0, longN: 0, longMs: 0, longMax: 0, heapMax: 0, mods: new Map(), progs: [], fd: 0 }; }
  const tasks = [];   // recent long tasks as [start, end] ms, to tell which hitches the main thread was busy for
  const events = [];  // recent game events as [name, ms] (event())
  const stalls = [];  // main-thread heartbeat gaps over 50 ms as [start, end] (beat()): a hitch overlapping one had the main thread or process blocked
  const lats = new Map(), latList = [];   // GPU-process latency per frame, keyed by the frame's time (lat())
  function freshSession() { return { frames: 0, ms: 0, hist: EDGES.map(() => 0).concat(0), hitches: 0, worst: 0, gc: 0, longN: 0, longMs: 0, fd: 0 }; }
  const bucket = ms => { let i = 0; while (i < EDGES.length && ms > EDGES[i]) i++; return i; };

  // Long tasks: main-thread work over 50 ms (ours, the browser's or a GC), counted whether or not a frame was playing.
  try {
    new PerformanceObserver(list => { for (const e of list.getEntries()) { w.longN++; w.longMs += e.duration; w.longMax = Math.max(w.longMax, e.duration); session.longN++; session.longMs += e.duration; tasks.push([e.startTime, e.startTime + e.duration]); }
      while (tasks.length && tasks[0][1] < performance.now() - 30000) tasks.shift(); })
      .observe({ type: 'longtask', buffered: false });
  } catch {}

  function post(ev, body) {
    if (off || sends++ >= MAX_SENDS) return;
    try { navigator.sendBeacon('/api/client-log', JSON.stringify({ ev, page: location.pathname + location.search, ...body })); } catch {}
  }

  function flush(now) {
    const n = w.gaps.length;
    if (n > 5) {
      const gaps = [...w.gaps].sort((a, b) => a - b), upd = [...w.upd].sort((a, b) => a - b), ren = [...w.ren].sort((a, b) => a - b);
      const sum = a => a.reduce((s, x) => s + x, 0);
      for (const [h, s, e, prev] of w.hitchAbs) { let busy = 0, mt = 0; for (const [a, b] of tasks) busy += Math.max(0, Math.min(b, e) - Math.max(a, s)); for (const [a, b] of stalls) mt = Math.max(mt, Math.min(b, e) - Math.max(a, s));
        h.push(Math.round(busy), 'mt ' + Math.round(mt)); const lat = lats.get(prev); if (lat != null) h.push('lat ' + Math.round(lat)); }
      const latv = latList.splice(0).sort((a, b) => a - b);
      const gpu = [...w.gpu].sort((a, b) => a - b);
      const mods = [...w.mods].map(([id, m]) => [id, Math.round(m.ms / n * 100) / 100, r1(m.max)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
      post('perf', {
        ...context(), frames: n, fps: r1(n / (sum(gaps) / 1000)),
        gap: [r1(pct(gaps, .5)), r1(pct(gaps, .95)), r1(pct(gaps, .99)), r1(gaps[n - 1])],   // frame interval p50/p95/p99/max ms
        upd: [r1(sum(upd) / n), r1(pct(upd, .95)), r1(upd[n - 1])],   // game logic + mods: avg/p95/max ms
        ren: [r1(sum(ren) / n), r1(pct(ren, .95)), r1(ren[n - 1])],   // render submission (CPU side): avg/p95/max ms
        hist: w.hist, hitches: w.hitches.slice(0, 8), gc: [w.gc, Math.round(w.gcMb)], long: [w.longN, Math.round(w.longMs), Math.round(w.longMax)],
        heap: lastHeap == null ? null : Math.round(lastHeap), heapMax: Math.round(w.heapMax), mods, progs: w.progs.slice(0, 8), fd: w.fd,
        ...(gpu.length ? { gpuMs: [r1(sum(gpu) / gpu.length), r1(pct(gpu, .95)), r1(gpu[gpu.length - 1])], gpuHit: w.gpuHit } : {}),
        ...(latv.length ? { latMs: [r1(sum(latv) / latv.length), r1(pct(latv, .95)), r1(latv[latv.length - 1])] } : {}),
      });
      for (const k of lats.keys()) if (k < now - 20000) lats.delete(k);
    }
    windowStart = now; w = fresh();
  }

  return {
    // one played frame: gapMs = time since the previous played frame, updMs / renMs = CPU time in update and render
    // game events (mod events, round, spawn, equip) with their time, for the hitches: the ones of the last 1.5 s before a hitch are listed with it
    event(name) { const t = performance.now(); if (events.length && events[events.length - 1][0] === name && t - events[events.length - 1][1] < 250) return; events.push([String(name).slice(0, 24), t]); if (events.length > 24) events.shift(); },
    // main-thread heartbeat (engine.js, every 10 ms): gaps over 50 ms are kept for the hitches ('mt')
    beat(last, now) { if (now - last > 50) { stalls.push([last, now]); while (stalls.length && stalls[0][1] < now - 30000) stalls.shift(); } },
    // GPU-process latency of the frame submitted at `frameNow` (engine.js fence): ms until its commands completed
    lat(frameNow, ms) { lats.set(frameNow, ms); if (latList.length < 2000) latList.push(ms); },
    frame(now, updMs, renMs, extra, tex, prevTex) {
      const gap = last ? now - last : 0; last = now;
      const heap = heapMb();
      let gcMb = 0;
      if (heap != null) { if (lastHeap != null && lastHeap - heap > 8) { gcMb = lastHeap - heap; w.gc++; w.gcMb += gcMb; session.gc++; } lastHeap = heap; w.heapMax = Math.max(w.heapMax, heap); }
      if (gap > 0 && gap < 5000) {
        w.gaps.push(gap); w.upd.push(updMs); w.ren.push(renMs); w.hist[bucket(gap)]++;
        session.frames++; session.ms += gap; session.hist[bucket(gap)]++; session.worst = Math.max(session.worst, gap);
        if (gap > HITCH_MS) {
          session.hitches++;
          // what the hitch frame looked like: when, interval, its update/render ms, heap freed just before it (MB), extra
          // (engine.js: first draws in the frame before and in this one, then the first few of those materials' names)
          // then texture uploads in the hitch frame ('tex count/KB/mipmaps') and the game events of the 1.5 s before it ('ev ...')
          if (w.hitches.length < 8) { const h = [r1((now - windowStart) / 1000), Math.round(gap), r1(updMs), r1(renMs), Math.round(gcMb), ...(extra ? [extra] : [])];
            // 'tex' = uploads of the frame before the gap | of this frame; 'gl' = the previous frame's other GL work (non-zero counters)
            const t = x => x ? `${x.n}/${Math.round(x.kb)}/${x.mip}` : '-'; if (tex || prevTex) h.push(`tex ${t(prevTex)}|${t(tex)}`);
            const glc = prevTex?.gl ? Object.entries(prevTex.gl).filter(([, v]) => v).map(([k, v]) => `${k.replace(/KB$/, 'K')}:${Math.round(v)}`).join(' ') : ''; if (glc) h.push('gl ' + glc.slice(0, 200));
            const ev = events.filter(([, t]) => t > now - gap - 1500).map(e => e[0]); if (ev.length) h.push('ev ' + ev.join(' '));
            w.hitches.push(h); w.hitchAbs.push([h, now - gap, now, last - gap]); }
        }
      }
      if (now - windowStart > WINDOW_MS) flush(now);
    },
    // shader programs compiled during play (each one a stall on its first frame): names, kept to the first 8 a window
    programs(names) { session.programs = (session.programs ?? 0) + names.length; for (const n of names) if (w.progs.length < 8) w.progs.push(String(n).slice(0, 120)); },
    // GPU time of a frame (ms) and the frame interval that followed it (engine.js gpuEnd)
    gpu(ms, gapAfter) { w.gpu.push(ms); if (gapAfter >= HITCH_MS && w.gpuHit.length < 8) w.gpuHit.push([Math.round(gapAfter), r1(ms)]); },
    // first draws this frame (program x vertex layout x target format, engine.js firstDraw): each may build a GPU pipeline
    firstDraws(n) { w.fd += n; session.fd += n; },
    // the game paused or the window was hidden: the next frame's interval isn't a played one
    pause() { last = 0; },
    // a mod's 'update' handler took ms (mod-loader.js reports these while profiling)
    mod(id, ms) { let m = w.mods.get(id); if (!m) w.mods.set(id, m = { ms: 0, max: 0 }); m.ms += ms; m.max = Math.max(m.max, ms); },
    end() {
      if (!session.frames) return;
      post('perfEnd', { ...context(), frames: session.frames, fps: r1(session.frames / (session.ms / 1000)), minutes: r1(session.ms / 60000), hist: session.hist,
        hitches: session.hitches, worst: Math.round(session.worst), gc: session.gc, programs: session.programs ?? 0, fd: session.fd, long: [session.longN, Math.round(session.longMs)] });
      session = freshSession();
    },
  };
}

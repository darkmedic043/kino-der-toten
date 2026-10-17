// Play-time performance diagnostics (2026-10-17, user on an RTX 4070 Ti Super: "constant frame loss"). While the game is
// being played (not paused), every frame's interval, game-logic time (update) and render time are recorded, plus
// main-thread long tasks, likely garbage collections (the JS heap dropping) and each mod's 'update' handler time.
// Every 10 s a compact 'perf' summary goes to /api/client-log (kino-server writes client-log.jsonl; lines are cut at
// 4,000 characters, so keep it small), and a whole-session 'perfEnd' when the page goes away.
// Read them with `node .tools/perf-report.mjs [name|gpu]`. `?noPerfLog` turns the reporting off.
const WINDOW_MS = 10000, MAX_SENDS = 1500, HITCH_MS = 50;
// frame-interval histogram edges in ms: ≤8.3 (120 Hz), ≤16.7 (60), ≤25, ≤33.3 (30), ≤50, ≤100, more
const EDGES = [8.4, 16.8, 25, 33.4, 50, 100];
const r1 = n => Math.round(n * 10) / 10;
const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
const heapMb = () => performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null;

export function createPerfDiag({ send, context }) {
  const off = new URLSearchParams(location.search).has('noPerfLog');
  let sends = 0, last = 0, windowStart = performance.now(), lastHeap = heapMb(), w = fresh(), session = freshSession();
  function fresh() { return { gaps: [], upd: [], ren: [], hist: EDGES.map(() => 0).concat(0), hitches: [], gc: 0, gcMb: 0, longN: 0, longMs: 0, longMax: 0, heapMax: 0, mods: new Map(), progs: [] }; }
  function freshSession() { return { frames: 0, ms: 0, hist: EDGES.map(() => 0).concat(0), hitches: 0, worst: 0, gc: 0, longN: 0, longMs: 0 }; }
  const bucket = ms => { let i = 0; while (i < EDGES.length && ms > EDGES[i]) i++; return i; };

  // Long tasks: main-thread work over 50 ms (ours, the browser's or a GC), counted whether or not a frame was playing.
  try {
    new PerformanceObserver(list => { for (const e of list.getEntries()) { w.longN++; w.longMs += e.duration; w.longMax = Math.max(w.longMax, e.duration); session.longN++; session.longMs += e.duration; } })
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
      const mods = [...w.mods].map(([id, m]) => [id, Math.round(m.ms / n * 100) / 100, r1(m.max)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
      post('perf', {
        ...context(), frames: n, fps: r1(n / (sum(gaps) / 1000)),
        gap: [r1(pct(gaps, .5)), r1(pct(gaps, .95)), r1(pct(gaps, .99)), r1(gaps[n - 1])],   // frame interval p50/p95/p99/max ms
        upd: [r1(sum(upd) / n), r1(pct(upd, .95)), r1(upd[n - 1])],   // game logic + mods: avg/p95/max ms
        ren: [r1(sum(ren) / n), r1(pct(ren, .95)), r1(ren[n - 1])],   // render submission (CPU side): avg/p95/max ms
        hist: w.hist, hitches: w.hitches.slice(0, 8), gc: [w.gc, Math.round(w.gcMb)], long: [w.longN, Math.round(w.longMs), Math.round(w.longMax)],
        heap: lastHeap == null ? null : Math.round(lastHeap), heapMax: Math.round(w.heapMax), mods, progs: w.progs.slice(0, 8),
      });
    }
    windowStart = now; w = fresh();
  }

  return {
    // one played frame: gapMs = time since the previous played frame, updMs / renMs = CPU time in update and render
    frame(now, updMs, renMs, extra) {
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
          if (w.hitches.length < 8) w.hitches.push([r1((now - windowStart) / 1000), Math.round(gap), r1(updMs), r1(renMs), Math.round(gcMb), ...(extra ? [extra] : [])]);
        }
      }
      if (now - windowStart > WINDOW_MS) flush(now);
    },
    // shader programs compiled during play (each one a stall on its first frame): names, kept to the first 8 a window
    programs(names) { session.programs = (session.programs ?? 0) + names.length; for (const n of names) if (w.progs.length < 8) w.progs.push(String(n).slice(0, 40)); },
    // the game paused or the window was hidden: the next frame's interval isn't a played one
    pause() { last = 0; },
    // a mod's 'update' handler took ms (mod-loader.js reports these while profiling)
    mod(id, ms) { let m = w.mods.get(id); if (!m) w.mods.set(id, m = { ms: 0, max: 0 }); m.ms += ms; m.max = Math.max(m.max, ms); },
    end() {
      if (!session.frames) return;
      post('perfEnd', { ...context(), frames: session.frames, fps: r1(session.frames / (session.ms / 1000)), minutes: r1(session.ms / 60000), hist: session.hist,
        hitches: session.hitches, worst: Math.round(session.worst), gc: session.gc, programs: session.programs ?? 0, long: [session.longN, Math.round(session.longMs)] });
      session = freshSession();
    },
  };
}

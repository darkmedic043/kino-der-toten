// Automatic resolution (fork, 2026-11-19; Settings → Automatic resolution, "Hold N FPS"): draws fewer pixels while the
// graphics card is what keeps the game under the chosen frame rate, and gives them back when the card has room. It
// multiplies Settings → Render resolution by a factor from 1 down to 0.5, in steps of 0.05, at most once every 2.5 s
// (a change resizes every render target). It does nothing while the processor is the limit (draw calls, game logic):
// fewer pixels would not help there.
//
// How it knows: the engine's GPU timer (engine.js gpuEnd) gives the card's time per frame, so the factor is solved for
// directly (cost follows the pixel count) and a step up is only taken when the card would still be inside 80% of the
// frame. Without the timer extension the card is taken to be the limit when the frame is late while the page's own
// work fills under 60% of it; steps up are then tries, and a try that has to be undone doubles the wait before the
// next (6 s to 60 s). kino.autoRes.stats shows the last second.
import { settings } from './settings.js';
const MIN = .5, STEP = .05, COOL = 2500;
export function createAutoRes({ renderer, pixelRatio }) {
  let factor = 1, gpu = 0, gpuAt = 0, n = 0, frameMs = 0, jsMs = 0, winStart = 0, cool = 0, wait = 6000, lastRaise = 0, lastChange = 0, probe = null, block = 0;
  const set = f => { f = Math.round(Math.min(1, Math.max(MIN, f)) / STEP) * STEP; if (Math.abs(f - factor) < 1e-4) return false; factor = f; renderer.setPixelRatio(pixelRatio * settings.renderScale * factor); lastChange = performance.now(); cool = lastChange + COOL; return true; };
  const api = {
    get factor() { return factor; }, stats: {},
    gpu(ms) { gpu = gpu ? gpu * .8 + ms * .2 : ms; gpuAt = performance.now(); },
    frame(dtMs, js, playing) {
      let target = settings.autoRes | 0; if (target && settings.fpsCap > 0) target = Math.min(target, settings.fpsCap); if (!target) { if (factor !== 1) set(1); return; }
      if (!playing) { n = 0; frameMs = jsMs = 0; winStart = 0; return; }
      const now = performance.now(); if (!winStart) winStart = now; n++; frameMs += dtMs; jsMs += js;
      if (now - winStart < 1000) return;
      const f = frameMs / n, j = jsMs / n, T = 1000 / target, timed = gpu > 0 && now - gpuAt < 3000; n = 0; frameMs = jsMs = 0; winStart = now;
      api.stats = { frame: +f.toFixed(2), js: +j.toFixed(2), gpu: timed ? +gpu.toFixed(2) : null, factor, target };
      if (now < cool) return;
      if (probe) { const p = probe; probe = null; if (f > p.f * .97) { set(p.from); block = now + 60000; return; } }   // a cut that bought nothing (the display or the frame cap is the limit): undo it, no cuts for a minute
      const late = f > T * 1.06;
      if (late && (timed ? gpu > T * .8 : j < f * .6 && now > block)) {
        if (!timed) probe = { f, from: factor };   // the card is the limit: fewer pixels
        if (set(Math.min(factor - STEP, timed ? factor * Math.sqrt(T * .8 / gpu) : factor - 2 * STEP)) && now - lastRaise < 6000) wait = Math.min(60000, wait * 2);
      } else if (factor < 1 && !late) {   // room again: one step back up
        if (timed) { const next = factor + STEP; if (gpu * (next / factor) ** 2 < T * .8) set(next); }
        else if (now - lastChange > wait) { if (now - lastRaise > wait * 2) wait = Math.max(6000, wait / 2); if (set(factor + STEP)) lastRaise = now; }
      }
    },
  };
  return api;
}

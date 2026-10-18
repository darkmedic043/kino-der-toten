// Der Eisendrache's own sounds and music (BO3's zm_castle sound banks, exported with Greyhound's Load File and converted
// to Ogg in audio/, git-ignored: ripped): plain HTML audio, at the game's volume, silent while the game is muted (M).
//   sfx(name, vol)               a one-shot
//   sfxAt(name, pos, cam, vol)   a one-shot that fades with distance (out to 1,500)
//   music(name, {loop, vol})     one track at a time (the Easter-egg songs, disco, the boss fight); stopMusic(fade)
import { settings } from '../../settings.js';

const BASE = new URL('./audio/', import.meta.url).href;
let gameAudio = null, track = null;
export const useGameAudio = a => { gameAudio = a; };
const level = v => (gameAudio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
export function sfx(name, vol = 1) { const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol); a.play().catch(() => {}); return a; }
export function sfxAt(name, pos, camera, vol = 1, range = 1500) { const d = camera?.position ? camera.position.distanceTo(pos) : 0; if (d > range) return null; return sfx(name, vol * (1 - d / range) ** 1.5); }
export function music(name, { loop = false, vol = .8 } = {}) {
  globalThis.kino?.radio?.heard?.('castle:' + name);   // RADIO.EXE: an egg song joins the radio (mods/radio)
  stopMusic(.3); const a = new Audio(BASE + name + '.ogg'); a.loop = loop; a.volume = level(vol); a._vol = vol; a.play().catch(() => {}); track = a; return a;
}
export function stopMusic(fade = .8) {
  const a = track; track = null; if (!a) return;
  const v0 = a.volume, t0 = performance.now(), step = () => { const k = (performance.now() - t0) / 1000 / Math.max(.01, fade); if (k >= 1) { a.pause(); return; } a.volume = v0 * (1 - k); requestAnimationFrame(step); }; step();
}
export const musicPlaying = () => (track && !track.paused && !track.ended ? track : null);
// the game's mute and volume apply to a song already playing
setInterval(() => { if (track) track.volume = level(track._vol ?? .8); }, 500);

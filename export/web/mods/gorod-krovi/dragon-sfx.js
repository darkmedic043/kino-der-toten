// Sounds of the dragon ride, the Pavlov's lockdown and the powered bridge (BO3's zm_stalingrad bank, converted to Ogg by
// .tools/build_gorod_dragon.py into maps/gorod-krovi/dragon/audio/, git-ignored: ripped). Plain HTML audio at the
// game's volume, silent while the game is muted, as Der Eisendrache's castle-audio.js. A missing file just stays quiet.
//   sfx(name, vol)                 a one-shot
//   sfxAt(name, pos, vol, range)   a one-shot that fades with distance from the camera
//   loop(name, vol)                a loop: {set(vol), stop()}
import { settings } from '../../settings.js';

const BASE0 = new URL('../maps/gorod-krovi/dragon/audio/', import.meta.url).href;
export function makeSfx(api, BASE = BASE0) {   // BASE: another folder of the map's sounds (traps.js: audio/)
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol = 1) => { const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol); a.play().catch(() => {}); return a; };
  const sfxAt = (name, pos, vol = 1, range = 2500) => { const d = api.camera?.position ? api.camera.position.distanceTo(pos) : 0; return d > range ? null : sfx(name, vol * (1 - d / range) ** 1.5); };
  const loop = (name, vol = 1) => { const a = new Audio(BASE + name + '.ogg'); a.loop = true; a.volume = level(vol); a.play().catch(() => {});
    return { set: v => { a.volume = level(v); }, stop: () => { a.pause(); a.src = ''; } }; };
  return { sfx, sfxAt, loop };
}

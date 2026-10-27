// Nuketown's own zombies: BO2 Nuketown Zombies' hazmat, soldier and civilian zombies as UGX ported them to World at War
// (character/c_zom_dlc1-4.gsc: four bodies picked evenly, the gas-mask hazmat with the mask heads, the others with one of
// four heads or their blue-eyed twins). Built by .tools/build_nuketown_zombies.py into the map's zombies/ (git-ignored:
// ripped). World at War's skeleton is BO1's, so the engine's ai_zombie_* clips drive them unchanged and the heads mount on
// j_spine4 as BO1's do. Their gib pieces go to the dismemberment mod (window.kino.gibSets); the flying limbs stay BO1's,
// as in the original (gibSpawn = char_ger_honorgd_*). ?bo1Zombies keeps the BO1 zombies.
import { loadModel } from '../../animation.js';

// body x head, in step: enemies.js takes templates[id % n] and heads[id % n], so equal lengths keep each pair together
const PAIRS = [
  ['haz_body1', 'head1'], ['sol_body1', 'head2'], ['solciv_body1', 'head3'], ['haz_body2', 'haz_head_mask'],
  ['haz_body1', 'head4_blueeyes'], ['sol_body1', 'head3_blueeyes'], ['solciv_body1', 'head4'], ['haz_body2', 'haz_head_mask_blueeyes'],
  ['haz_body1', 'head2_blueeyes'], ['sol_body1', 'head1_blueeyes'], ['solciv_body1', 'head2'], ['haz_body2', 'haz_head_mask'],
];
// the dismemberment mod's keys -> the gib pieces' names
const GIBS = { upclean: 'upclean', lowclean: 'lowclean', behead: 'behead', larmoff_1: 'larmoff', rarmoff_1: 'rarmoff', llegoff_1: 'llegoff', rlegoff_1: 'rlegoff', legsoff_1: 'legsoff' };
const SPAWNS = ['rarmspawn', 'larmspawn', 'rlegspawn', 'llegspawn'];

export function setupZombies(api) {
  const e = api.enemies;
  if (!e?.templates || /[?&]bo1Zombies/.test(location.search)) return null;
  const base = (api.map?.dir ?? '').replace(/\/?$/, '/') + 'zombies/';
  const cache = new Map(), L = n => { if (!cache.has(n)) cache.set(n, loadModel(base + n + '.glb').catch(() => null)); return cache.get(n); };
  const bodies = [...new Set(PAIRS.map(p => p[0]))];
  return Promise.all(PAIRS.map(([b, h]) => Promise.all([L(b), L(h)]))).then(async pairs => {
    const ok = pairs.filter(([b, h]) => b && h);
    if (!ok.length) { console.warn('[nuketown] zombies not built: run .tools/build_nuketown_zombies.py'); return null; }
    for (const b of bodies) { const m = await L(b); if (m) m.userData.gibSet = 'nuketown_' + b; }
    e.templates = ok.map(p => p[0]); e.heads = ok.map(p => p[1]);
    // gib pieces per body, plus BO1's flying limbs
    const gibs = await fetch(new URL('../dismemberment/gibs.json', import.meta.url)).then(r => r.ok ? r.json() : null).catch(() => null);
    const limbs = Object.fromEntries(await Promise.all(SPAWNS.map(async k => [k, gibs?.parts?.[k] ? await loadModel(gibs.parts[k]).catch(() => null) : null])));
    const sets = ((globalThis.kino ??= {}).gibSets ??= {});
    await Promise.all(bodies.map(async b => {
      const set = { ...limbs };
      await Promise.all(Object.entries(GIBS).map(async ([key, g]) => { set[key] = await L(`${b}_${g}`); }));
      sets['nuketown_' + b] = set;
    }));
    return { templates: e.templates.length, sets: bodies.length };
  });
}

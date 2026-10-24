// Akimbo (2026-10-23): dual-wield pairs are not guns of their own. At load (weapon-levels prepare) each pair is folded
// into its single gun: what the pair does differently (models, clips, magazine, timings, name) goes on def.akimbo and
// def.upgrade.akimbo, the pair leaves data.weapons and the box, and the single gun gets the Akimbo attachment
// (attachments.json `akimbo`, its own slot), which gunsmith.js applyAttachments puts on before the other stats.
// Old saves that levelled a pair are merged into the single gun by mergeAkimboSaves (cloud.js, on every load and pull).

// pair -> single gun (imported pairs also say so in their def: akimboOf, .tools/build_bo3_weapons.py AKIMBO_OF)
export const AKIMBO_OF = { cz75dw_zm: 'cz75_zm', aw_atlas45_dw: 'aw_atlas45', aw_m1_irons_dw: 'aw_m1_irons' };
// fields that stay the single gun's
const KEEP = new Set(['id', 'baseId', 'upgrade', 'akimbo', 'akimboOf', 'noBox', 'statAttachments', 'mounts', 'attachAnims', 'gunsmith',
  'price', 'hideTags', 'camo', 'weaponClass', 'rarity', 'attachment', 'attachments', 'mounted', 'bo3', 'modWeapon', 'glow']);

function look(single, pair) {
  const o = {};
  for (const k of Object.keys(pair)) if (!KEEP.has(k) && JSON.stringify(single[k]) !== JSON.stringify(pair[k])) o[k] = structuredClone(pair[k]);
  return o;
}

export function foldAkimbo(data) {
  const W = data?.weapons; if (!W) return data;
  const gone = new Set();
  for (const [id, pair] of Object.entries(W)) {
    const base = W[pair?.akimboOf ?? AKIMBO_OF[id]];
    if (!pair || typeof pair !== 'object' || !base || base === pair) continue;
    base.akimbo = look(base, pair);
    if (base.upgrade && pair.upgrade) base.upgrade.akimbo = look(base.upgrade, pair.upgrade);
    base.statAttachments = [...new Set([...(base.statAttachments ?? []), 'akimbo'])];
    delete W[id]; gone.add(id);
  }
  if (gone.size && data.boxPool) data.boxPool = data.boxPool.filter(id => !gone.has(id));
  return data;
}

// ---- saves ----------------------------------------------------------------------------------------------------------
// A pair's progress becomes its single gun's: levels and prestige keep the higher of the two, counters (camo
// challenges, career stats) add up, loadout slots name the single gun and lists drop the pair. A loadout that carried the pair
// gets the Akimbo attachment fitted on the single gun (it applies once the gun's level unlocks it).
const isLevel = v => v && typeof v === 'object' && ('level' in v || 'tier' in v);
const rank = v => [v.tier ?? 0, v.mlevel ?? 0, v.level ?? 0, v.mxp ?? 0, v.xp ?? 0];
const higher = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b; return a; };
function add(into, from) {
  for (const [k, v] of Object.entries(from)) {
    if (typeof v === 'number' && typeof into[k] === 'number') into[k] += v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && into[k] && typeof into[k] === 'object' && !Array.isArray(into[k])) add(into[k], v);
    else if (!(k in into)) into[k] = v;
  }
}
function walk(o, from, to) {
  // lists drop the pair (box on/off toggles: the pair's must not switch the single gun off)
  if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) if (o[i] === from) o.splice(i, 1); else walk(o[i], from, to); return; }
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    if (k === from) {
      const v = o[from]; delete o[from];
      if (!(to in o)) o[to] = v;
      else if (isLevel(v) && isLevel(o[to])) o[to] = higher(o[to], v);
      else if (Array.isArray(v) || Array.isArray(o[to])) { /* the single gun's own list (its fitted attachments) stays */ }
      else if (v && typeof v === 'object' && o[to] && typeof o[to] === 'object') add(o[to], v);
      continue;
    }
    if (o[k] === from) o[k] = to; else walk(o[k], from, to);
  }
}
// raw: a stored value (JSON text) → the migrated text, or null when it never mentions a pair
export function mergeAkimboSaves(key, raw) {
  if (!raw || !Object.keys(AKIMBO_OF).some(id => raw.includes(id))) return null;
  let o; try { o = JSON.parse(raw); } catch { return null; }
  for (const [from, to] of Object.entries(AKIMBO_OF)) {
    const l = o?.loadout, carried = l && Object.values(l).includes(from);
    walk(o, from, to);
    if (carried && key === 'kino.mods.progression') { o.attachments ??= {}; o.attachments[to] = [...new Set([...(o.attachments[to] ?? []), 'akimbo'])]; }
  }
  return JSON.stringify(o);
}

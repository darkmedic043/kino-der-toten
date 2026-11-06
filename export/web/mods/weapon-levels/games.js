// Which game a gun comes from (games.json), for the logo on the menu's weapon pictures (home.js fillThumb).
// The logos (games/*.webp) are third-party trademarks: git-ignored and not installed by Rind.
const BASE = new URL('./', import.meta.url).href;
// baseIds: the ids in game-data.json, taken before mods add their guns (the base game's own weapons)
export async function loadGames(baseIds) {
  const c = await fetch(BASE + 'games.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (!c) return () => null;
  const games = Object.fromEntries(Object.entries(c.games).map(([k, g]) => [k, { id: k, name: g.name, url: BASE + g.logo }]));
  const byId = new Map(Object.entries(c.weapons ?? {}).flatMap(([g, ids]) => ids.map(id => [id, g])));
  const prefixes = Object.entries(c.prefixes ?? {});
  return id => {
    if (!id) return null;
    const k = String(id).replace('_upgraded', '');   // m1911_upgraded_zm -> m1911_zm
    const g = byId.get(id) ?? byId.get(k) ?? prefixes.find(([p]) => k.startsWith(p))?.[1] ?? (baseIds.has(k) ? c.base : null);
    return games[g] ?? null;
  };
}

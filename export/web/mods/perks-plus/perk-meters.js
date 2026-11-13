// Perk icon cooldowns (2026-11-13, user: "greyed out and slowly fill up with their respective color to mark its
// cooldown"). A perk with a cooldown, a kill charge or charges registers perkMeter(id, () => 0..1) (1 = ready, null =
// nothing to show); its #perks icon is drawn grey above the fill line and in colour below it, with a thin line in the
// perk's colour at the edge. The engine rebuilds #perks whenever its innerHTML differs from the held perks, so nothing
// here touches those spans: one CSS rule per perk (keyed by its title, like the icon rules) carries --cd, --edge and
// --pc, and the spans' ::before/::after read them. No blur or shadow (Skia shaders, CLAUDE.md HUD paint warm-up).
const meters = new Map();   // perk id -> fn
export const perkMeter = (id, fn) => meters.set(id, fn);

export function setupPerkMeters({ host, session, map, world, perkInfo }) {
  if (document.getElementById('perk-meters')) document.getElementById('perk-meters').remove();
  const el = document.createElement('style'); el.id = 'perk-meters';
  el.textContent = '#perks .perk{position:relative}' +
    '#perks .perk::before{content:"";position:absolute;inset:0;border-radius:inherit;background:inherit;filter:grayscale(1) brightness(.55);clip-path:inset(0 0 calc(var(--cd,1)*100%) 0);pointer-events:none}' +
    '#perks .perk::after{content:"";position:absolute;left:12%;right:12%;height:2px;bottom:calc(var(--cd,1)*100% - 1px);background:var(--pc,#fff);opacity:var(--edge,0);pointer-events:none}';
  document.head.append(el);
  const sheet = el.sheet, rules = new Map();   // id -> {style, v}
  const info = id => (map?.perkInfo ?? world?.perkInfo ?? perkInfo)?.[id] ?? perkInfo?.[id];
  const rule = id => {
    let r = rules.get(id); if (r) return r;
    const p = info(id); if (!p?.name) return null;
    const i = sheet.insertRule(`#perks .perk[title="${p.name.replace(/["\\]/g, '\\$&')}"]{--cd:1;--edge:0;--pc:${p.color ?? '#fff'}}`, sheet.cssRules.length);
    r = { style: sheet.cssRules[i].style, v: 1 }; rules.set(id, r); return r;
  };
  const set = (r, v) => {
    v = Math.round(Math.min(1, Math.max(0, v)) * 200) / 200; if (v === r.v) return; r.v = v;
    r.style.setProperty('--cd', v); r.style.setProperty('--edge', v > 0 && v < 1 ? 1 : 0);
  };
  let t = 0;
  host.on('update', dt => {
    if ((t -= dt) > 0) return; t = .05;
    for (const [id, fn] of meters) {
      const held = session.perks?.has(id); let r = rules.get(id);
      if (!held) { if (r) set(r, 1); continue; }
      let v; try { v = fn(); } catch { v = null; }
      if (v == null) { if (r) set(r, 1); continue; }
      r ??= rule(id); if (r) set(r, v);
    }
  });
  host.on('reset', () => { for (const r of rules.values()) set(r, 1); });
  // the grey filter first shows mid-game: paint it at load on a stand-in icon (title of a perk that has a meter)
  let warm = null;
  host.on('warmHud', on => {
    warm?.remove(); warm = null;
    const id = [...meters.keys()].find(i => info(i)?.name), box = document.getElementById('perks');
    if (!on || !id || !box) return;
    const r = rule(id); if (r) set(r, .5);
    warm = Object.assign(document.createElement('span'), { className: 'perk', title: info(id).name });
    warm.style.background = info(id).color ?? '#888'; box.append(warm);
  });
  host.on('warmHud', on => { if (!on) for (const r of rules.values()) set(r, 1); });
}

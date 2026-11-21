// Relics (2026-11-17, user: "a cool way to unlock the elemental bows, including the base bows too, and the gkz-45 mk3 so
// that you can put them in your loadout"; then: "they should just be unlockable to be put in your mystery boxs loadout"):
// wonder weapons earned once in their own map, then in the player's Mystery Box list on every map (switched on when earned).
// Account unlocks: profile.rewards['relic.<id>'] (cloud-synced like the Stark suits; a cheat game
// earns nothing, mods/stark/unlocks.js grant). progression.json lists them with `unlock` (the reward key) and `relic` (how
// to earn it, shown on the locked card); profile.js isRelic / relicLocked / boxItems let them into the box list once owned.
//   Wrath of the Ancients  Der Eisendrache: claim the bow behind the castle (mods/der-eisendrache/mod.js setupBow)
//   the four elemental bows Der Eisendrache: claim the finished bow from its pedestal (bows.js 'take'); the base bow too
//   GKZ-45 Mk3            Gorod Krovi: 115 kills with it (or the Maelstrom of Eris) in one game (below)
// Off Der Eisendrache a bow out of the box still draws, flies, burns and bursts with its element: the castle mod runs bows.js in
// its offMap mode on other maps once a bow relic is owned (mods/der-eisendrache/mod.js).
import { grant } from '../stark/unlocks.js';

export const RELICS = {
  bo3_wrath_ancients: 'relic.bow', bo3_bow_rune: 'relic.bow_rune', bo3_bow_storm: 'relic.bow_storm',
  bo3_bow_wolf: 'relic.bow_wolf', bo3_bow_demon: 'relic.bow_demon', bo3_raygun_mk3: 'relic.raygun_mk3',
};
const FORGE = new Set(['bo3_bow_rune', 'bo3_bow_storm', 'bo3_bow_wolf', 'bo3_bow_demon']);   // upgrades: never in the box, forged in a match (mods/wonder-forge)
const COLOR = { bo3_wrath_ancients: 0xff7a22, bo3_bow_rune: 0xff5a14, bo3_bow_storm: 0x5fb8ff, bo3_bow_wolf: 0x8fd0ff, bo3_bow_demon: 0xa45cff, bo3_raygun_mk3: 0x7dff6a };
export const MK3_KILLS = 115;

// grant the relics in ids (the first is the headline); after `delay` s (the map's own claim banner goes first) the
// fanfare: a banner, the box chime and a burst of the relic's colour round the player. Returns the ids newly earned.
export function earnRelic(api, ids, { delay = 3.4 } = {}) {
  ids = [].concat(ids).filter(id => RELICS[id]);
  const news = grant(Object.fromEntries(ids.map(id => [RELICS[id], true])));
  const got = ids.filter(id => news.includes(RELICS[id])); if (!got.length) return got;
  const name = id => api.data?.weapons?.[id]?.name ?? id;
  setTimeout(() => {
    api.announce?.(name(got[0]).toUpperCase(), got.length > 1 ? `RELICS UNLOCKED · ${got.length}` : 'RELIC UNLOCKED', 5);
    api.audio?.play?.('box');
    const fx = window.kino?.fx, p = api.player?.getFeetPosition?.();
    if (fx?.emit && p) for (let i = 0; i < 3; i++) fx.emit({ key: 'glow', at: p.clone().setY(p.y + 40 + i * 30), size: [60, 420 - i * 90], life: .6 + i * .2, fade: [.05, .8], additive: true, color: COLOR[got[0]] ?? 0xffd070 });
    const box = got.filter(id => !FORGE.has(id)), forge = got.filter(id => FORGE.has(id));
    const say = (l, what) => l.length ? `${l.map(name).join(', ')}: ${what}` : '';
    api.toast?.([say(box, `${box.length > 1 ? 'are' : 'is'} now in your Mystery Box on every map (Armory → Loadout → Mystery Box)`), say(forge, `can now be forged from a Wrath of the Ancients at any terminal (FORGE.EXE) on every map`)].filter(Boolean).join(' · '), 8);
  }, delay * 1000);
  return got;
}

// the GKZ-45 Mk3 trial: on Gorod Krovi, your own kills while holding it (the vortex pulses count, as does the Maelstrom)
export function setupRelics(api) {
  const { host, session } = api;
  if (api.map?.id !== 'gorod-krovi' || !api.data?.weapons?.bo3_raygun_mk3) return;
  const owned = () => { try { return JSON.parse(localStorage.getItem('kino.mods.progression'))?.rewards?.[RELICS.bo3_raygun_mk3] === true; } catch { return false; } };
  let kills = 0, told = false, done = owned();
  host.on('reset', () => { kills = 0; told = false; done = owned(); });
  host.on('update', () => {
    if (done || told || !session.inventory?.some(w => w.id === 'bo3_raygun_mk3')) return;
    told = true; api.toast?.(`Relic trial · ${MK3_KILLS} kills with the GKZ-45 Mk3 this game puts it in your Mystery Box on every map`, 6);
  });
  host.on('kill', e => {
    if (done || e.remote || session.weapon?.id !== 'bo3_raygun_mk3') return;
    kills++;
    if (kills >= MK3_KILLS) { done = true; earnRelic(api, 'bo3_raygun_mk3', { delay: .4 }); return; }
    if (kills % 25 === 0) api.toast?.(`GKZ-45 Mk3 relic trial · ${kills} / ${MK3_KILLS}`, 2.5);
  });
}

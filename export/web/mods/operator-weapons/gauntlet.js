// The Gauntlet of Siegfried off Gorod Krovi (user, 2026-11-22: "can you add the gauntlet into the armory"): taken from the grave
// there after the egg quest (mods/gorod-krovi/gauntlet.js), then bought at a terminal's ARMORY on every other map. The weapon is
// the same code (gorod-krovi/gauntlet-weapon.js) on the same kit (gorod-krovi/gauntlet-kit.js: BO3's viewmodels, whelp and
// sounds, git-ignored ripped art, so without them the Armory won't sell it). The kit loads only for a player who has it
// unlocked in the Armory, read after the cloud sync. The egg quest, its hazards and ee.js's hooks stay on Gorod Krovi.
// window.kino.dragonGauntlet: {ready, loaded (promise)}
import { gauntletKit } from '../gorod-krovi/gauntlet-kit.js';
import { setupGauntletWeapon, ID } from '../gorod-krovi/gauntlet-weapon.js';
import { TABS, loadArmory, unlocked } from '../armory/mod.js';
import { cloudReady } from '../../profile.js';

export function setupGauntletAway(api) {
  if (api.map?.id === 'gorod-krovi') return null;   // built there by the quest
  const item = TABS.flatMap(t => t.items).find(i => i.id === ID);
  let ready = false;
  const loaded = cloudReady.then(async () => {
    if (!item || !unlocked(loadArmory().items[ID], item)) return;
    const A = await gauntletKit(api, { quiet: true });
    if (!A.J) return;   // no BO3 files: not sold
    setupGauntletWeapon(api, { emit() {} }, A); ready = true;   // gk.emit: the quest's listeners are not here
  }).catch(e => console.warn('[gauntlet]', e));
  (api.host.pending ??= []).push?.(loaded);
  return { get ready() { return ready; }, loaded };
}

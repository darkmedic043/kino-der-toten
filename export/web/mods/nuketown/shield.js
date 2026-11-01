// Nuketown's shield stations give the Zombie Shield; everything it does lives in mods/operator-weapons/zombie-shield.js, on every
// map since it went on sale in the Armory (user, 2026-11-01). Taking one here is what marks it found for the Armory.
export function setupShield() {
  const z = globalThis.kino.zombieShield;
  return {
    tick() {},   // zombie-shield.js runs its own
    held: z.held, planted: z.planted, damaged: z.damaged, repair: z.repair, reset: z.reset, stands: z.stands,
    give() { if (!z.give()) return false; globalThis.kino.armory?.found('zombie_shield'); return true; },
  };
}

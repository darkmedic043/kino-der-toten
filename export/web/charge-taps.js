// Double tap for charge weapons (not part of upstream; user, 2026-10-22: "double tap makes bows draw faster, make it
// also work in general for charge weapons"). Tap fire, let go and press again within GAP: the draw that second press
// starts charges RATE times as fast, still held to the release as usual. The first tap is its own shot as before (no
// waiting to see whether a second one follows). A weapon feeds the fire button's edges to down()/up() and multiplies
// its charge time by rate() while the press that started the draw is held; quick tells whether it is a double tap.
// Used by the Der Eisendrache bows (mods/der-eisendrache/bows.js) and the Siren (mods/bo7-weapons/siren.js).
export const GAP = .3, TAP = .25, RATE = 2;   // seconds between the tap's release and the next press; a tap is held under TAP

export function chargeTaps() {
  const now = () => performance.now() / 1000;
  let downAt = -1e9, tapUp = -1e9, quick = false, held = false;
  return {
    down() {   // a press: quick when it follows a tap's release closely
      const t = now(); quick = t - tapUp < GAP; downAt = t; held = true; return quick;
    },
    up() {
      const t = now(); if (held && t - downAt < TAP) tapUp = t; held = false; quick = false;
    },
    get held() { return held; },
    get quick() { return held && quick; },
    rate() { return held && quick ? RATE : 1; },
  };
}

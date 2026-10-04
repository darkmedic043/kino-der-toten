# Mobile (touch) support

Upstream has the touch layer (`touch-controls.js`, `zombies-touch.js`: stick, look, fire, aim, jump, crouch, reload, use, knife, weapon, grenade, claymore, monkey, alt fire, pause). A phone is detected by `(pointer: coarse)` (`runtime-assets.js` `runtimeProfile.mobile`, `touch-controls.js` `mode`). This file is what the fork added on top (2026-10-04).

- **Mobile textures** (`runtime-assets.js`): the phone handler swaps `/textures/` for `/textures-mobile/`, but only the top-level folder has a mobile copy. It used to rewrite every `/textures/` (Moon, mods, dismemberment, wonder weapons), 404ing 17 textures on a phone. Now only paths starting `/textures/` are rewritten, and a failed mobile copy falls back to the original image.
- **`mods/touch-extras`** (touch devices only; desktop verified unchanged: same HUD position, no extra buttons, no errors):
  - Tap the class badge (`#class-skill`) to use the action skill. It sends `KeyZ` with `remapped=true` (game-menu swallows a default key whose action was rebound unless the event is flagged).
  - A VIEW button in the toolbar sends `T` (third person, where the chosen operator shows; there is no T key on a phone).
  - A BREATH button, shown while `kino.scopes.scoped`, holds Shift down for the scopes mod (hold breath).
  - Layout: the fork's HUD (`#equip-hud` skill and grenade/monkey counters, `#weapon-level`, `#progression-hud`) sat under the buttons; they are moved (landscape: top right under the ammo, portrait: below the ammo). `#hud-portrait` is hidden on touch. Zero overlaps with the buttons in 844x390 and 390x844.
- **Menu page** (`home.css`, `@media (pointer:coarse)`): finger-sized targets (buttons min 40px, sliders 36px, checkboxes 26px). No sideways overflow on any tab or Armory pane at 844x390.
- **Gunsmith** (`mods/weapon-levels/gunsmith-view.js`): `touch-action:none` on the canvas (a touch drag was taken as a page scroll), one pointer rotates, two pinch-zoom (wheel still works), `pointercancel` handled; a compact layout for landscape phones (`@media (pointer:coarse) and (max-height:560px)`: smaller type, scrolling attachment list, stats strip under the gun, keyboard hints hidden). Mouse drag and wheel verified unchanged on desktop.
- **Defaults** (`settings.js`): phones start on Low graphics with HD textures off (a saved setting wins). The lighting mod already caps at Medium on touch.
- **Testing without a phone**: Playwright Chromium with `isMobile`, `hasTouch`, `deviceScaleFactor 2`, an iPhone UA (gives `pointer: coarse`), real GPU flags. Taps go through `page.tap`, holds through CDP `Input.dispatchTouchEvent`. Check the console for errors and failed requests too.
- Known leftovers: the third-person toast still says "T to switch back"; the other 3D menu previews (loadout thumbnails, Operator, characters) were only checked for layout, not touch input.
- Not verified on a real phone (memory, thermals, real touch feel).

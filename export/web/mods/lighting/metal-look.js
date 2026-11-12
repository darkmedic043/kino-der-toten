// BO3 keeps a metal's colour in its specular map and leaves the diffuse black. The ports have neither the specular
// maps (not in the export) nor reflections, so pipes, ducts, gratings, cabinets, lamp housings and brass came out as
// flat near-black shapes (The Giant: 137 materials; Der Eisendrache: 465; user, 2026-11-11: "textures not looking
// right"). metalLook(root) gives every untextured metal material a colour by its name and a surface that catches the
// lamps (its normal map does the rest). Call it at the map mod's setup, before the shader warm-up.
import * as THREE from 'three';

const IS_METAL = /metal|iron|steel|brass|gold|copper|bronze|tungsten|nickel|chrome|alumin|casing|pipe|duct|conduit|chain|hinge|handle|bracket|hook|bolt|rail|grating|grate|file_cab|gear|engine|tank|valve|beam|girder|torch|hurricane_lamp|light_set|light_cage|light_spot|sword|armor|armour|shield|cannon|anvil/i;
const NOT_METAL = /glass|decal|water|rubber|plastic|wire|cloth|paper|wood(?!.*metal)|emissive|glow/i;
// [name, linear colour, roughness, metalness]: first match wins
const KINDS = [
  [/rust/i, [.26, .15, .09], .78, .05],
  [/brass|gold|casing|bullet/i, [.46, .33, .12], .42, .3],
  [/copper|bronze/i, [.42, .23, .13], .45, .3],
  [/tungsten|graphite|black|dark|_drk|cast|iron|worn|aged|grunge|corroded/i, [.105, .108, .115], .56, .2],
  [/polished|chrome|stainless|nickel|alumin|brushed|bare|steel|silver/i, [.27, .28, .3], .4, .3],
];
const DEFAULT = [[.17, .172, .18], .52, .2];

export function metalLook(root) {
  const done = new Set(); let n = 0;
  root?.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) {
      if (!m || done.has(m) || !m.isMeshStandardMaterial) continue; done.add(m);
      const name = m.name ?? '', c = m.color;
      if (m.map || m.transparent || m.opacity < 1 || !c || Math.max(c.r, c.g, c.b) > .24 || !IS_METAL.test(name) || NOT_METAL.test(name)) continue;
      const [col, rough, metal] = (KINDS.find(k => k[0].test(name)) ?? [null, ...DEFAULT]).slice(1);
      c.setRGB(...col); m.roughness = rough; m.metalness = metal; n++;
    }
  });
  return n;
}

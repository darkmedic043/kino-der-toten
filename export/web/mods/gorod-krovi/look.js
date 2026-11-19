// Gorod Krovi's look (2026-11-15, user: "it looked really bad": no sky, everything orange-red with crushed blacks;
// later the same day "make the lighting match": the sun, its colour, the sky's heading and the grade now come from
// the game's own data, docs/fork/waw-ports.md Gorod Krovi, Light).
// BO3's Stalingrad is a cold blue storm at dusk with a low warm sun behind the smoke; the orange comes from the fires
// (1,477 lights in the map's own data, baked into the light volume) rather than from the whole scene. So: BO3's own
// skybox on a sphere (as Der Eisendrache), cool blue-grey sky light, a low warm key from the panorama's sun, a smoky
// grey-blue haze, the map-detail copies, the metal pass and the overlay fixes, and a grade with lifted blacks (grade.js).
import * as THREE from 'three';
import { loadMapLight } from '../lighting/map-volume.js';
import { metalLook } from '../lighting/metal-look.js';
import { prepareDetail, applyDetail } from '../../map-detail.js';
import { overlayLayers } from '../der-eisendrache/overlays.js';
import { setupSun } from './sun.js';

const DIR = 'mods/maps/gorod-krovi/';
const q = s => new RegExp(`[?&]${s}`).test(location.search);
export async function prepareLook() {
  if (new URLSearchParams(location.search).get('map') === 'gorod-krovi' && !q('noDetail')) await prepareDetail(DIR);
}

// BO3's own sun for this map (the sun volume's settings in zm_stalingrad.ff: yaw 311.4, pitch 146.76 = heading 311.4°,
// 33.2° up, colour 1 / .908 / .546, read as the swatch the artist picked: as linear light it turned every wall olive), as a map direction (BO3 x, y, z -> x, z, -y); the bake uses the same one
const KEY_DIR = new THREE.Vector3(.553, .548, .627).normalize(), KEY_RGB = [1, .908, .546];
// the panorama's glow (a low warm sun through the smoke, 17.8° up), 15° to the side of the real sun once the sky is
// turned the way the game draws it: SKY_TURN is the fraction of a turn added to the panorama's u (heading 307° at its
// middle column, fitted on Der Eisendrache's moon, whose far-away fx entity gives its true heading)
const SUN = new THREE.Vector3(.797, .306, .521).normalize(), SKY_TURN = .6028;
const SKY_GAIN = 2, HAZE = 0x3d3c45, KEY_I = 2;   // (KEY_I 1.1 -> 2 on 2026-11-16 with the real shadows: at 1.1 the sun barely showed against the sky light)

// Textured metals whose colour map is near black (BO3 keeps a metal's colour in its specular map, not exported): the
// pressed-bronze ceilings of the department store and the factory read as black voids overhead (2026-11-15). Each is
// lifted to about sRGB 85 from its texture's measured average (sRGB 0-255; the map's tex/ at 512 px), bronze tinted.
const NORMAL_AS_COLOUR = /^(t7_zm_sta_decal_damage_paint_peeling_normal|mtl_veh_t7_dlc3_tank_tiger_decal_blast_01|mtl_veh_t7_dlc3_tank_tiger_bullet_dent_decal|mtl_veh_t7_decal_bolt_10_other_gloss|mtl_veh_t7_dlc_decal_edge_trim_dead|mtl_veh_t7_dlc_dmg_dents_decal_reveal)$/;
const DARK_METAL = { t7_zm_sta_metal_bronze_ceiling_tile: 28, t7_metal_planter_top_trim: 32, t7_metal_truss_01: 43, t7_zm_isl_metal_treadplate_01_alpha: 23,
  mtl_p7_barrel_metal_55gal_lid: 33, mtl_p7_can_metal_cube_01_smal: 19, mtl_p7_chalkboard_vintage_metal: 33, mtl_p7_light_chandelier_vintage_01_metal: 33,
  mtl_p7_zm_ctl_radio_reciever_02_metal_02: 33, mtl_p7_zm_der_cabinet_lab_bottom_metal_01: 25, mtl_veh_t7_mil_tank_tiger_tread: 42, mtl_veh_t7_mil_tank_tiger_treads_alpha: 42 };
const lin = v => Math.pow(v / 255, 2.2);
function liftDarkMetal(root) {
  const done = new Set(); let n = 0;
  root.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) {
    if (!m?.color || done.has(m)) continue; done.add(m);
    const avg = DARK_METAL[(m.name ?? '').replace(/^wc\//, '')]; if (!avg) continue;
    const k = Math.min(10, lin(85) / lin(avg)), bronze = /bronze/.test(m.name);
    m.color.multiplyScalar(k); if (bronze) { m.color.r *= 1.15; m.color.b *= .8; }
    m.roughness = Math.min(m.roughness, .6); m.metalness = Math.max(m.metalness, .2); n++;
  } });
  return n;
}

// The flood water (2026-11-15, user: "i cant see through the water"): the basement and the low streets stand in about a
// foot of murky green water in BO3 (surface at z -180 over wet rubble at -192), which is see-through there; the build
// drew it as an opaque floor. Made a glossy see-through layer here, before the engine batches the map (the batches key
// on transparency and opacity). Water decals, stains and the distant waterfall card stay as they are.
const WATER = /(^|\/)t7_(zm_sta_)?water_(?!.*(decal|stain|puddle|backscatter))|^wc\/t7_water/;
function seeThroughWater(root) {
  const done = new Set(), flats = [], B = new THREE.Box3(); let n = 0;
  root.traverse(o => { if (!o.isMesh) return; const ms = [o.material].flat();
    if (!ms.some(m => WATER.test(m?.name ?? '') && !/waterfall|decal|stain/.test(m.name))) return;
    o.castShadow = false;
    for (const m of ms) { if (done.has(m) || !WATER.test(m?.name ?? '') || /waterfall|decal|stain/.test(m.name)) continue; done.add(m);
      const op = /opacity_60/.test(m.name) ? .6 : .55;
      m.transparent = true; m.opacity = op; m.depthWrite = false;
      m.roughness = .12; m.metalness = 0; if (m.color) m.color.multiplyScalar(.85); n++; }
    o.renderOrder = Math.max(o.renderOrder, 1);
    o.updateWorldMatrix(true, false); B.setFromObject(o); if (B.max.y - B.min.y < 30 && !B.isEmpty()) flats.push({ y: B.max.y, r: [B.min.x, B.min.z, B.max.x, B.max.z] });
  });
  // (2026-11-19) the flood mirrors the town (lighting/post-fx.js): one rule per stretch of water, from the meshes'
  // own bounds; sheets at the same level that touch or lie within 150 units are one stretch
  const pools = [];
  for (const f of flats.sort((a, b) => a.y - b.y)) { let p = pools.find(p => Math.abs(p.y - f.y) < 6 && f.r[0] < p.r[2] + 150 && f.r[2] > p.r[0] - 150 && f.r[1] < p.r[3] + 150 && f.r[3] > p.r[1] - 150);
    if (p) { p.r[0] = Math.min(p.r[0], f.r[0]); p.r[1] = Math.min(p.r[1], f.r[1]); p.r[2] = Math.max(p.r[2], f.r[2]); p.r[3] = Math.max(p.r[3], f.r[3]); p.y = Math.max(p.y, f.y); } else pools.push({ y: f.y, r: [...f.r] }); }
  for (const p of pools) window.kino?.postFx?.addWater({ y: p.y, rect: p.r, strength: .8, ripple: .045, scale: .018, reach: 3500 });
  return n;
}

export function setupLook(api, { detail = true } = {}) {
  const { scene, world, session, host, camera } = api, report = {};
  if (world.root) {
    // the map root and the buy doors' parts, which custom-world moves onto the scene (gates and power doors kept the normal-as-colour paint, 2026-11-17)
    const doorParts = [...(world.doors?.values() ?? [])].flatMap(d => d.parts.map(p => p.object)).filter(o => { for (let p = o.parent; p; p = p.parent) if (p === world.root) return false; return true; }), root = { traverse: f => { world.root.traverse(f); for (const o of doorParts) o.traverse(f); } };
    // BO3's global_invisible (clip and hint surfaces the game never draws) is in the build as near-black solid faces:
    // hidden here, still in the collision.
    let hid = 0; root.traverse(o => { if (o.isMesh && [o.material].flat().every(m => /^global_invisible$/.test(m?.name ?? ''))) { o.visible = false; hid++; } });
    report.invisible = hid;
    // decals whose only exported image is their normal map, built with it as their colour (map v=10): saturated blue sheets
    // (the start gate's peeling paint, 2026-11-17). The builder drops their colour since; hidden here until the next rebuild.
    let nrm = 0; root.traverse(o => { if (o.isMesh && o.visible && [o.material].flat().every(m => NORMAL_AS_COLOUR.test(m?.name ?? ''))) { o.visible = false; nrm++; } });
    report.normalDecals = nrm;
    metalLook(root);
    report.darkMetal = liftDarkMetal(root);
    if (detail) applyDetail(root);
    report.water = seeThroughWater(root);
    if (!q('noOverlays')) report.overlays = overlayLayers(root, { soft: null });
  }
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const [key, fill] = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  let baked = null;
  // the light left indoors: a neutral, slightly warm grey (the fires and bulbs are in the bake's lamp light)
  // 2026-11-16 (user, with a BO3 video: "everything seems off and weird"): the floors .62/.14, ambient .75 and hemi .95 sat
  // on top of the bake's room fill and lit every room alike (flat, beige); lower floors, a cooler indoor tint and a softer
  // knee give the shade back (frame brightness 85 -> 74, the video's median 54; ambient and hemi below too)
  // 2026-11-16 (user: "i want a sun above ... shadows needs real shadows"): the key light casts real shadows (sun.js), set
  // up once the bake's regions are known and before the engine batches the map (the batches key on castShadow)
  let sun = null; const wantSun = !!api.renderer && !q('noSun');
  const ready = loadMapLight(api, { skyFloor: .42, indoor: [.93, .95, 1.03], sunFloor: .1, strength: 1, powerOff: .7, knee: .17, sunShadow: wantSun }).catch(() => null).then(l => { baked = l; report.bake = !!l;
    if (wantSun && key) { sun = setupSun(api, { key, dir: KEY_DIR, regions: (l?.meta?.regions ?? []).map(r => ({ ...r, cell: l.meta.cell })), sky }); report.sun = sun?.report ?? false; } });

  // the sky: BO3's panorama, sampled per pixel by view direction (an equirectangular scene.background turns every map
  // material white here; DE's notes), stored dim so drawn at SKY_GAIN, its horizon band fading into the haze
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { map: { value: null }, gain: { value: SKY_GAIN }, haze: { value: new THREE.Color(HAZE) }, sun: { value: SUN },
      disc: { value: KEY_DIR }, discColor: { value: new THREE.Color().setRGB(1, .84, .6, THREE.SRGBColorSpace) } },
    vertexShader: 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `#define SKY_TURN ${SKY_TURN}
uniform sampler2D map; uniform float gain; uniform vec3 haze, sun, disc, discColor; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5 + float(SKY_TURN), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.1415927);
        vec3 c = texture2D(map, uv).rgb * gain; c = c / (1.0 + max(max(c.r, c.g), c.b) * 0.45); float band = smoothstep(0.52, 0.62, uv.y);   // (soft roll-off: the sun's disc burned white through the bloom)
        vec3 h = haze + vec3(0.30, 0.17, 0.08) * pow(max(0.0, dot(d, sun)), 4.0);   // the haze warms toward the sun
        c = mix(h, c, band);
        // the sun itself, where the key light comes from (2026-11-16): a disc dimmed by the smoke, a tight glow and a wide
        // warm bloom of the sky around it (after the roll-off: the disc is meant to reach the bloom)
        float cd = max(0.0, dot(d, disc)), dk = smoothstep(0.99984, 0.99990, cd);   // (about 2 degrees across: games draw the sun larger than it is)
        c += discColor * (dk * 7.0 + pow(cd, 900.0) * 1.6 + pow(cd, 60.0) * 0.32 + pow(cd, 8.0) * 0.07) * smoothstep(-0.02, 0.05, d.y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -1000; sky.scale.setScalar(1000); sky.visible = false; scene.add(sky);
  const haze = new THREE.Color(HAZE);
  if (scene.fog) { scene.fog.color.copy(haze); scene.fog.density = Math.max(scene.fog.density ?? 0, .00024); }
  scene.background = haze.clone();
  const skyReady = q('noSky') ? Promise.resolve() : new THREE.TextureLoader().loadAsync((world.entry?.dir ?? DIR) + 'sky/skybox.webp').then(tex => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping;
    sky.material.uniforms.map.value = tex; sky.visible = true; report.sky = true;
  }).catch(() => { report.sky = false; });

  host.on('update', () => {
    sky.position.copy(camera.position);
    if (ambient) { ambient.color.setHex(0x8f8da8); ambient.intensity = .58; }   // (sky light: the panorama's own blue-violet, measured on its upper half)
    if (hemi) { hemi.color.setHex(0xb0aecc); hemi.groundColor.setHex(0x4a4038); hemi.intensity = .68; }
    if (key) { key.color.setRGB(...KEY_RGB, THREE.SRGBColorSpace); key.intensity = baked ? KEY_I : .9; if (!sun) key.position.copy(KEY_DIR); }   // (sun.js places it over the area)
    if (fill) { fill.color.setHex(0x6a7a96); fill.intensity = .35; }
  });
  return { ready: Promise.all([ready, skyReady]), report, sky, get baked() { return baked; }, get sun() { return sun; } };
}

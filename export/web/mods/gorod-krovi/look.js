// Gorod Krovi's look (2026-11-15, user: "it looked really bad": no sky, everything orange-red with crushed blacks).
// BO3's Stalingrad is a cold blue storm at dusk with a low warm sun behind the smoke; the orange comes from the fires
// (1,477 lights in the map's own data, baked into the light volume) rather than from the whole scene. So: BO3's own
// skybox on a sphere (as Der Eisendrache), cool blue-grey sky light, a low warm key from the panorama's sun, a smoky
// grey-blue haze, the map-detail copies, the metal pass and the overlay fixes, and a grade with lifted blacks (grade.js).
import * as THREE from 'three';
import { loadMapLight } from '../lighting/map-volume.js';
import { metalLook } from '../lighting/metal-look.js';
import { prepareDetail, applyDetail } from '../../map-detail.js';
import { overlayLayers } from '../der-eisendrache/overlays.js';

const DIR = 'mods/maps/gorod-krovi/';
const q = s => new RegExp(`[?&]${s}`).test(location.search);
export async function prepareLook() {
  if (new URLSearchParams(location.search).get('map') === 'gorod-krovi' && !q('noDetail')) await prepareDetail(DIR);
}

// the panorama's sun (skybox_zm_stalingrad: a low warm glow through the clouds), as a map direction
const SUN = new THREE.Vector3(-.35, .31, -.88).normalize();
const KEY_DIR = new THREE.Vector3(-.35, .62, -.88).normalize();   // (the key a little higher than the sun: at 18° the streets' floors went black)
const SKY_GAIN = 3, HAZE = 0x3d3c45;

// Textured metals whose colour map is near black (BO3 keeps a metal's colour in its specular map, not exported): the
// pressed-bronze ceilings of the department store and the factory read as black voids overhead (2026-11-15). Each is
// lifted to about sRGB 85 from its texture's measured average (sRGB 0-255; the map's tex/ at 512 px), bronze tinted.
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
  const done = new Set(); let n = 0;
  root.traverse(o => { if (!o.isMesh) return; const ms = [o.material].flat();
    if (!ms.some(m => WATER.test(m?.name ?? '') && !/waterfall|decal|stain/.test(m.name))) return;
    o.castShadow = false;
    for (const m of ms) { if (done.has(m) || !WATER.test(m?.name ?? '') || /waterfall|decal|stain/.test(m.name)) continue; done.add(m);
      const op = /opacity_60/.test(m.name) ? .6 : .55;
      m.transparent = true; m.opacity = op; m.depthWrite = false;
      m.roughness = .12; m.metalness = 0; if (m.color) m.color.multiplyScalar(.85); n++; }
    o.renderOrder = Math.max(o.renderOrder, 1);
  });
  return n;
}

export function setupLook(api, { detail = true } = {}) {
  const { scene, world, session, host, camera } = api, report = {};
  if (world.root) {
    // BO3's global_invisible (clip and hint surfaces the game never draws) is in the build as near-black solid faces:
    // hidden here, still in the collision.
    let hid = 0; world.root.traverse(o => { if (o.isMesh && [o.material].flat().every(m => /^global_invisible$/.test(m?.name ?? ''))) { o.visible = false; hid++; } });
    report.invisible = hid;
    metalLook(world.root);
    report.darkMetal = liftDarkMetal(world.root);
    if (detail) applyDetail(world.root);
    report.water = seeThroughWater(world.root);
    if (!q('noOverlays')) report.overlays = overlayLayers(world.root, { soft: null });
  }
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const [key, fill] = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  let baked = null;
  // the light left indoors: a neutral, slightly warm grey (the fires and bulbs are in the bake's lamp light)
  const ready = loadMapLight(api, { skyFloor: .62, indoor: [1.0, .96, .92], sunFloor: .14, strength: 1, powerOff: .7, knee: .12 }).catch(() => null).then(l => { baked = l; report.bake = !!l; });

  // the sky: BO3's panorama, sampled per pixel by view direction (an equirectangular scene.background turns every map
  // material white here; DE's notes), stored dim so drawn at SKY_GAIN, its horizon band fading into the haze
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { map: { value: null }, gain: { value: SKY_GAIN }, haze: { value: new THREE.Color(HAZE) }, sun: { value: SUN } },
    vertexShader: 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform sampler2D map; uniform float gain; uniform vec3 haze, sun; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.1415927);
        vec3 c = texture2D(map, uv).rgb * gain; c = c / (1.0 + max(max(c.r, c.g), c.b) * 0.45); float band = smoothstep(0.52, 0.62, uv.y);   // (soft roll-off: the sun's disc burned white through the bloom)
        vec3 h = haze + vec3(0.30, 0.17, 0.08) * pow(max(0.0, dot(d, sun)), 4.0);   // the haze warms toward the sun
        c = mix(h, c, band);
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
    if (ambient) { ambient.color.setHex(0x8792a8); ambient.intensity = .75; }
    if (hemi) { hemi.color.setHex(0xa9b6cc); hemi.groundColor.setHex(0x4a4038); hemi.intensity = .95; }
    if (key) { key.color.setHex(0xffc9a0); key.intensity = baked ? 1.35 : 1.1; key.position.copy(KEY_DIR); }
    if (fill) { fill.color.setHex(0x6a7a96); fill.intensity = .35; }
  });
  return { ready: Promise.all([ready, skyReady]), report, sky, get baked() { return baked; } };
}

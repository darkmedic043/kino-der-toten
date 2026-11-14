import * as THREE from 'three';

// Layers the map build wrote as solid surfaces ("grey panel by the blueprint", "white panels behind the fence",
// 2026-11-12). BO3 props carry their dirt, rust, rivets, labels, chalk and snow as extra shells over the base surface,
// see-through where the colour image's alpha says so. The build only made a material an overlay when its *name* said
// decal or _blend, so a chalkboard's writing (pale grey image, the chalk in its alpha) was a flat grey board, a snow
// edge strip a white panel, and chains, gratings and straw were solid cards. Fixed here by the colour image, not the
// material name (the build merges equal materials, so names are whichever came first):
//   BLEND  the image is an overlay: drawn see-through over the surface below (all of BO3's *decal* images, plus the
//          ones checked by eye on a colour | alpha contact sheet);
//   MASK   a cut-out (chains, gratings, straw, splinters, banners, vista cards): alpha tested, still writes depth;
//   snow   a prop's snow shell (name ...snow..._blend, a copy of the whole prop in snow that BO3 fades with vertex
//          alpha the export doesn't carry: a bridge pillar was white from top to bottom): faded by how far each
//          vertex faces up, so snow lies on ledges and tops and leaves the sides;
//   SOFT   other prop blend shells with no weights (the roof's oxidised copper plates): a fixed share.
// Images whose alpha is data, not coverage (tint masks, icicles, the opus tiles) are in neither list and stay solid.
// Run before the props are merged (instancing groups by material and geometry).
// Shared by the BO3 ports: another map passes its own image stems on top of these lists (The Giant,
// mods/the-giant/overlays.js), `snow`/`soft` to replace those two name rules (null = none), and `glass` for images
// whose alpha is the glass's opacity (a jar, a clock face cover: see-through, no offset, drawn after the decals).
const BLEND = new Set((
  'mtl_p7_blast_wall_concrete_decal mtl_p7_blast_wall_concrete_decal_02 mtl_p7_bottle_lable_wine_01 ' +
  'mtl_p7_cai_door_wood_rustic_01_stains mtl_p7_cai_street_vendor_02_dirty mtl_p7_ctl_keepers_stone ' +
  'mtl_p7_furniture_bedroom_vintage_01_dirty mtl_p7_mirror_wood_ornate_glsss ' +
  'mtl_p7_sgen_door_pushbar_set_decal_clean mtl_p7_trunk_steamer_dc mtl_p7_wall_mobile_dep_decal_details_01 ' +
  'mtl_p7_zm_ctl_astrolabe_character mtl_p7_zm_ctl_battery_ceramic_label mtl_p7_zm_ctl_bookcase_vintage_drity ' +
  'mtl_p7_zm_ctl_canteen_stove_dirty mtl_p7_zm_ctl_case_medical_vintage_figure ' +
  'mtl_p7_zm_ctl_case_medical_vintage_figure_rust mtl_p7_zm_ctl_clock_symbol_01 mtl_p7_zm_ctl_clock_symbol_02 ' +
  'mtl_p7_zm_ctl_clock_symbol_03 mtl_p7_zm_ctl_clock_wall_vintage_01 mtl_p7_zm_ctl_comm_equip_set_label ' +
  'mtl_p7_zm_ctl_comm_equip_set_nail mtl_p7_zm_ctl_console_deathray_set_label mtl_p7_zm_ctl_demon_gate_rune ' +
  'mtl_p7_zm_ctl_door_sliding_set_decal_01 mtl_p7_zm_ctl_elemental_storm_rune ' +
  'mtl_p7_zm_ctl_fireplace_01_decal_grout_01 mtl_p7_zm_ctl_keycard_ee mtl_p7_zm_ctl_light_lamp_gyro_flower ' +
  'mtl_p7_zm_ctl_light_spot_hanging_set_decal mtl_p7_zm_ctl_magma_rune_pedestal mtl_p7_zm_ctl_mathamatics_01 ' +
  'mtl_p7_zm_ctl_radio_recorder_deck_script mtl_p7_zm_ctl_rocket_a10_decal_02 mtl_p7_zm_ctl_rocket_a10_logo ' +
  'mtl_p7_zm_ctl_sign_bookcase_vintage_01_02 mtl_p7_zm_ctl_trophy_taxidermy_elk_antler_dirty ' +
  'mtl_p7_zm_ctl_trunk_wood_vintage_metal mtl_p7_zm_ctl_weapon_armory_bow_arrow_rope mtl_p7_zm_ctl_wolf_icon ' +
  'mtl_p7_zur_metro_sign_terminal_set_snow_2 p7_mp_vld_vista_light_flare p7_snow_slush_floor ' +
  'p7_zm_ctl_jumpsphere_set_decal_signage t7_decal_damage_burn_impact_01 t7_decal_damage_burn_impact_04 ' +
  't7_decal_damage_concrete_cracks_01 t7_decal_damage_metal_rust_edge_01 t7_decal_grunge_calcium_drip_01 ' +
  't7_decal_grunge_charred_stain_01 t7_decal_grunge_charred_stain_02 t7_decal_grunge_dirty ' +
  't7_decal_grunge_dirty_tile_01 t7_decal_grunge_paint_discolored_01 t7_decal_grunge_rust_04 ' +
  't7_decal_grunge_scratches_scrapes_01 t7_decal_grunge_wall_scratch_marks t7_decal_labels_electrical_hazard ' +
  't7_decal_line_horizontal_chipped_edges t7_decal_metal_fasteners t7_decal_signage_letters_upper ' +
  't7_decal_signage_numbers t7_decal_signage_numbers_airport t7_decal_signage_numbers_grungy ' +
  't7_decal_snow_powder_01 t7_decal_tech_details_01 t7_decal_tech_lines t7_metal_trim_weld_01 ' +
  't7_metal_trim_weld_01_rust t7_veh_decal_bolt_06 t7_zm_chalk_buy_arak t7_zm_chalk_buy_bowie ' +
  't7_zm_chalk_buy_cqw t7_zm_chalk_buy_krm t7_zm_chalk_buy_kuda t7_zm_chalk_buy_m8a4 t7_zm_chalk_buy_shiva ' +
  't7_zm_chalk_buy_spyder t7_zm_chalk_buy_trip_mine t7_zm_chalk_buy_triton t7_zm_chalk_buy_vmp ' +
  't7_zm_decal_iron_cross t7_zm_decal_logo_935 t7_zm_der_decal_wolf_banner').split(' '));
const MASK = new Set((
  'mtl_p7_cai_lantern_chain mtl_p7_church_bench_01_woodend mtl_p7_hay_bale_straw mtl_p7_light_chandelier_chain ' +
  'mtl_p7_pallet_wood_splinters mtl_p7_shelf_metal_lab_01_grate mtl_p7_shelf_metal_lab_grate ' +
  'mtl_p7_zm_ctl_cryo_chamber_valve mtl_p7_zm_ctl_desk_supply_set_02 mtl_p7_zm_ctl_keycard_ee_light ' +
  'mtl_p7_zm_ctl_pap_platform_set_grating01 mtl_p7_zm_ctl_tomb_wall_top_transparent ' +
  'mtl_p7_zm_ctl_tool_fireplace_brush p7_zm_ctl_banner_coatofarms p7_zm_ctl_banner_coatofarms_tattered ' +
  'p7_zm_ctl_valley_vista_hanger_card p7_zm_ctl_valley_vista_rocket_card p7_zm_ctl_valley_vista_snow_chunk ' +
  'p7_zm_ctl_valley_vista_sphere_card p7_zm_ctl_valley_vista_tower_card t7_metal_chain ' +
  'wpn_t7_zmb_bow_demon_missile_emblem wpn_t7_zmb_bow_demon_missile_fletching ' +
  'wpn_t7_zmb_bow_rune_missile_fletching wpn_t7_zmb_bow_storm_missile_fletching ' +
  'wpn_t7_zmb_bow_wolf_missile_fletching').split(' '));
const SOFT = [[/copper_floor_01_oxidized_blend$/, .35], [/stone_wall_cut_grout_dark_blend$/, .5]];
const SNOW = /snow\w*_blend$/, DARK = /_carved$|weld_01_normal$/;   // carved symbols and normal-only weld seams: their image is white
const stem = t => (t?.name ?? '').split('/').pop().replace(/^i_/, '').replace(/_c(_\d+)?\.\w+$/, '');

export function overlayLayers(root, { blend = null, mask = null, glass = null, snow = SNOW, soft = SOFT } = {}) {
  const B = blend ? new Set([...BLEND, ...blend]) : BLEND, M = mask ? new Set([...MASK, ...mask]) : MASK, G = new Set(glass ?? []);
  const kind = new Map(), count = { blend: 0, mask: 0, snow: 0, soft: 0 }, up = new THREE.Vector3(), m3 = new THREE.Matrix3(), m4 = new THREE.Matrix4();
  const overlay = (m, units) => { m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = units; m.userData.decal = true; };
  const classify = m => {
    if (!m?.isMeshStandardMaterial || m.transparent || m.alphaTest > 0 || m.visible === false) return null;
    const s = stem(m.map), name = m.name ?? '';
    if (s && G.has(s)) { m.transparent = true; m.depthWrite = false; return 'glass'; }
    if (s && B.has(s)) { overlay(m, -8); if (DARK.test(name)) m.color.multiplyScalar(.22); return 'blend'; }
    if (s && M.has(s)) { m.alphaTest = .4; return 'mask'; }
    if (snow?.test(name) && !name.startsWith('wc/')) { overlay(m, -4); m.vertexColors = true; return 'snow'; }
    const fixed = soft?.find(e => e[0].test(name) && !name.startsWith('wc/'));
    if (fixed) { overlay(m, -4); m.opacity = fixed[1]; return 'soft'; }
    return null;
  };
  // snow shells: vertex alpha from the world-space normal (an instanced prop: its first instance's turn)
  const snowAlpha = o => {
    const g = o.geometry, n = g.attributes.normal; if (!n || g.attributes.color?.itemSize === 4) return;
    o.updateWorldMatrix(true, false); m4.copy(o.matrixWorld); if (o.isInstancedMesh && o.count) { const im = new THREE.Matrix4(); o.getMatrixAt(0, im); m4.multiply(im); }
    m3.getNormalMatrix(m4); const c = new Float32Array(n.count * 4);
    for (let i = 0; i < n.count; i++) { up.fromBufferAttribute(n, i).applyMatrix3(m3).normalize(); const t = Math.min(1, Math.max(0, (up.y - .2) / .55)); c[i * 4] = c[i * 4 + 1] = c[i * 4 + 2] = 1; c[i * 4 + 3] = t * t * (3 - 2 * t); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 4));
  };
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) {
      if (!m) continue; let k = kind.get(m);
      if (k === undefined) { k = classify(m); kind.set(m, k); if (k) count[k] = (count[k] ?? 0) + 1; }
      if (!k) continue;
      if (k === 'snow') snowAlpha(o);
      if (k !== 'mask') { o.renderOrder = (k === 'blend' ? 2200 : k === 'glass' ? 2300 : 1200); o.castShadow = false; }
    }
  });
  return count;
}

// BO3's "infinite blackness" planes (wc/global_diffuse_black: the ceilings over the Juggernog room, the undercroft and
// its passages, the backs of shafts) are meant to read as nothing. As an untextured near-black material the look pass
// took them for dark metal, so they mirrored the blue room light and sparkled like a night sky (user, 2026-11-12:
// "missing" ceilings). Here they become one unlit black material without fog, drawn from both sides: the planes'
// winding is mixed, and the ones facing up left gaps that showed the courtyard above from below.
export function blackPlanes(root, match = /global_diffuse_black|infinite_blackness/, ceilings = null, props = false) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide }); mat.name = 'castle_void'; let n = 0; const parts = {}, cache = new Map();
  const plane = o => { if (!props) return true; if (o.isInstancedMesh) return false; for (let p = o; p && p !== root; p = p.parent) if (/^bsp_/.test(p.name)) return true; return false; };
  root.traverse(o => { if (!o.isMesh || Array.isArray(o.material) || !match.test(o.material?.name ?? '')) return;
    if (plane(o)) { o.material = mat; o.castShadow = false; n++; } else { const m = partMaterial(o, root, cache, match); o.material = m; const k = m.userData.part ?? 'rock texture'; parts[k] = (parts[k] || 0) + 1; } });
  if (props) console.info('[der-eisendrache] void planes:', n, 'black prop parts coloured:', JSON.stringify(parts));
  if (ceilings) { const c = voidCeilings(root, mat, ceilings); if (c) console.info('[der-eisendrache] void ceilings:', JSON.stringify(c)); }
  return n;
}

// The same black material is on parts of placed props, doors and moving pieces (fan covers, the teleporter's copper
// pipes, sign backs, rock undersides, the pyramid): BO3 keeps a metal's colour in its specular map and leaves the
// diffuse black (lighting/metal-look.js), and the port has no specular maps. As unlit void they were black cut-outs in
// lit rooms (user, 2026-11-13). Each gets a lit flat colour by what its prop is (first match of the names up to the
// map root); a rock takes the rock material beside it, so its underside carries on the rock.
const PART_KINDS = [   // [name, key, linear colour, roughness, metalness]
  [/copper|bronze|brass|coil/i, 'copper', [.34, .19, .11], .48, .3],
  [/rust/i, 'rust', [.2, .12, .075], .8, .05],
  [/rock_|boulder|tomb|floater|urn|ledge/i, 'stone', [.13, .125, .118], .95, 0],
  [/foliage|tree|flower/i, 'plant', [.045, .04, .028], 1, 0],
  [/fan_|teleporter|gantry|trap_|signage|generator|truck|veh_|vent|canister|pipe|metal|light_|beam|bracket|door|MPD/i, 'steel', [.1, .102, .11], .58, .2],
];
const PART_ROCK = /rock_|boulder/i, PART_DEFAULT = ['dark', [.05, .048, .045], .9, 0];
function partMaterial(o, root, cache, match) {
  let name = ''; for (let p = o; p && p !== root; p = p.parent) name += ' ' + p.name;
  if (PART_ROCK.test(name) && o.parent && o.parent !== root) { let best = null, size = 0;
    for (const c of o.parent.children) { const m = c.material; if (c === o || !c.isMesh || !!c.isInstancedMesh !== !!o.isInstancedMesh || !m || Array.isArray(m) || !m.map || m.transparent || m.alphaTest || match.test(m.name ?? '') || /decal|blend|glass/i.test(m.name ?? '')) continue;
      const k = c.geometry.index?.count ?? c.geometry.attributes.position.count; if (k > size) { size = k; best = m; } }
    if (best) return best; }
  const [key, col, rough, metal] = (PART_KINDS.find(k => k[0].test(name)) ?? [null, ...PART_DEFAULT]).slice(1);
  if (!cache.has(key)) { const m = new THREE.MeshStandardMaterial({ roughness: rough, metalness: metal, side: THREE.DoubleSide }); m.color.setRGB(...col); m.name = 'castle_part_' + key; m.userData.part = key; cache.set(key, m); }
  return cache.get(key);
}

// Flat black over a lit room still reads as a hole in the roof (user, 2026-11-13: the Juggernog room's ribs with black
// between them, and gaps beside the planes that showed the rocks and sky above). ceilings.js (.tools/castle-ceilings.mjs:
// rays from every walkable point of the real model) lists the void triangles that are seen from below, each with the
// side it is seen from, and flat plugs at ceiling height for the gaps its rays found. Those triangles leave the void
// meshes and are redrawn, with the plugs, as one mesh in a wall material of the map: lit like the walls around it, one
// sided (a plug is invisible from above); a ceiling triangle is drawn again facing the other way, so it is a stone slab
// from above too and not a window into the room. Triangles are matched by centre, so a rebuild that moves them just
// leaves them black: the console then warns that the table is stale (.tools/castle-after-rebuild.sh redoes it).
export function voidCeilings(root, voidMat, data) {
  let donor = null; root.traverse(o => { if (!donor && o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && o.material?.name === data.material && o.geometry?.attributes.uv && o.geometry.index) donor = o; });
  if (!data.tris?.length) return null;
  if (!donor) { console.warn('[der-eisendrache] void ceilings: no mesh with the material ' + data.material + ', the ceilings stay black (.tools/castle-after-rebuild.sh)'); return null; }
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3(), m = new THREE.Matrix4(), inv = new THREE.Matrix4();
  let dens = 1 / 256; { const P = donor.geometry.attributes.position, U = donor.geometry.attributes.uv, I = donor.geometry.index, r = [], ua = new THREE.Vector2(), ub = new THREE.Vector2(), uc = new THREE.Vector2();
    for (let k = 0; k + 2 < I.count && r.length < 400; k += 3) { const i0 = I.getX(k), i1 = I.getX(k + 1), i2 = I.getX(k + 2); A.fromBufferAttribute(P, i0); B.fromBufferAttribute(P, i1).sub(A); C.fromBufferAttribute(P, i2).sub(A); const wa = B.cross(C).length();
      ua.fromBufferAttribute(U, i0); ub.fromBufferAttribute(U, i1).sub(ua); uc.fromBufferAttribute(U, i2).sub(ua); const t = Math.abs(ub.cross(uc)); if (wa > 1 && t > 0) r.push(Math.sqrt(t / wa)); }
    if (r.length) { r.sort((x, y) => x - y); dens = r[r.length >> 1]; } }
  const table = new Map(); for (const t of data.tris) table.set(t[0] + ',' + t[1] + ',' + t[2], t);
  const find = (x, y, z) => { const X = Math.round(x), Y = Math.round(y), Z = Math.round(z); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const t = table.get((X + i) + ',' + (Y + j) + ',' + (Z + k)); if (t) return t; } return null; };
  const pos = [], nor = [], uv = [], put = (p, n) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z); if (ay >= ax && ay >= az) uv.push(p.x * dens, p.z * dens); else if (ax >= az) uv.push(p.z * dens, p.y * dens); else uv.push(p.x * dens, p.y * dens); };
  const tri = (vx, vy, vz, back) => { N.subVectors(B, A).cross(E.subVectors(C, A)).normalize(); E.set(vx, vy, vz).sub(A); const f = N.dot(E) < 0; if (f) N.negate(); put(A, N); put(f ? C : B, N); put(f ? B : C, N); if (back) { N.negate(); put(A, N); put(f ? B : C, N); put(f ? C : B, N); } };
  root.updateWorldMatrix(true, false); inv.copy(root.matrixWorld).invert(); const meshes = []; root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.material === voidMat) meshes.push(o); }); let moved = 0, gone = 0; const found = new Set(), both = donor.material.side !== THREE.DoubleSide, stale = () => console.warn(`[der-eisendrache] ceilings.js does not fit this build of the map: ${found.size} of ${data.tris.length} void ceiling triangles found, the rest stay black. Run .tools/castle-after-rebuild.sh (waw-ports.md, void ceilings).`);
  for (const o of meshes) { o.updateWorldMatrix(true, false); m.multiplyMatrices(inv, o.matrixWorld); const g = o.geometry, P = g.attributes.position, I = g.index, n = I ? I.count : P.count, keep = [];
    for (let k = 0; k + 2 < n; k += 3) { const i0 = I ? I.getX(k) : k, i1 = I ? I.getX(k + 1) : k + 1, i2 = I ? I.getX(k + 2) : k + 2; A.fromBufferAttribute(P, i0).applyMatrix4(m); B.fromBufferAttribute(P, i1).applyMatrix4(m); C.fromBufferAttribute(P, i2).applyMatrix4(m);
      const t = find((A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3, (A.z + B.z + C.z) / 3); if (!t) { keep.push(i0, i1, i2); continue; } tri(t[3], t[4], t[5], both); moved++; found.add(t); }
    if (keep.length === n) continue; if (!keep.length) { o.removeFromParent(); gone++; continue; }
    const g2 = g.clone(); g2.setIndex(keep); g2.boundingBox = null; g2.boundingSphere = null; o.geometry = g2; }
  if (found.size < data.tris.length * .9) stale();
  if (!moved) return null;
  for (const [x0, z0, x1, z1, y] of data.patches || []) { A.set(x0, y, z0); B.set(x1, y, z0); C.set(x1, y, z1); tri(x0, y - 100, z0); A.set(x0, y, z0); B.set(x1, y, z1); C.set(x0, y, z1); tri(x0, y - 100, z0); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(Array.from({ length: pos.length / 3 }, (_, i) => i)); geo.computeBoundingBox(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, donor.material); mesh.name = 'bsp_void_ceilings'; mesh.castShadow = false; mesh.receiveShadow = donor.receiveShadow; mesh.layers.mask = donor.layers.mask;
  mesh.matrixAutoUpdate = donor.matrixAutoUpdate; root.add(mesh); mesh.updateMatrix(); mesh.updateMatrixWorld(true);
  return { triangles: moved, entries: found.size, of: data.tris.length, plugs: (data.patches || []).length, voidMeshesEmptied: gone, material: data.material };
}

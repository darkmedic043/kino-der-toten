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

export function overlayLayers(root) {
  const kind = new Map(), count = { blend: 0, mask: 0, snow: 0, soft: 0 }, up = new THREE.Vector3(), m3 = new THREE.Matrix3(), m4 = new THREE.Matrix4();
  const overlay = (m, units) => { m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = units; m.userData.decal = true; };
  const classify = m => {
    if (!m?.isMeshStandardMaterial || m.transparent || m.alphaTest > 0 || m.visible === false) return null;
    const s = stem(m.map), name = m.name ?? '';
    if (s && BLEND.has(s)) { overlay(m, -8); if (DARK.test(name)) m.color.multiplyScalar(.22); return 'blend'; }
    if (s && MASK.has(s)) { m.alphaTest = .4; return 'mask'; }
    if (SNOW.test(name) && !name.startsWith('wc/')) { overlay(m, -4); m.vertexColors = true; return 'snow'; }
    const soft = SOFT.find(e => e[0].test(name) && !name.startsWith('wc/'));
    if (soft) { overlay(m, -4); m.opacity = soft[1]; return 'soft'; }
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
      if (k === undefined) { k = classify(m); kind.set(m, k); if (k) count[k]++; }
      if (!k) continue;
      if (k === 'snow') snowAlpha(o);
      if (k !== 'mask') { o.renderOrder = (k === 'blend' ? 2200 : 1200); o.castShadow = false; }
    }
  });
  return count;
}

// The Giant's share of the BO3 overlay fix (mods/der-eisendrache/overlays.js has the method and the lists both maps
// use). Checked on a colour | alpha contact sheet of every image a solid material of this map uses (2026-11-13): 74 of
// 293 carry an alpha. The ones below were drawn as flat panels or solid cards; the rest keep their alpha as data
// (barrels' tint masks, tiles' grout lines, the perk bottle, window panes that are nearly opaque anyway).
import { overlayLayers, blackPlanes } from '../der-eisendrache/overlays.js';

const BLEND = ('t7_zm_chalk_buy_frag t7_zm_der_chalk_help t7_zm_der_chalk_lightning_bolt t7_zm_der_chalk_teleporter ' +   // the three der_chalk images need .tools/giant-chalk.mjs (their drawing is in a second image)
  't7_zm_der_zombie_scribbles t7_zm_der_map_arrow_urhere t7_metal_trim_plasma_cut_melted_01 ' +
  'mtl_p7_zm_der_teleporter_control_gauge').split(' ');
const MASK = ('mtl_p7_rebar_tie_01 mtl_p7_ceramic_tile_shower_loose mtl_p7_wood_plank_rustic_2x16x48_splinter ' +
  'mtl_p7_wood_plank_rustic_2x4x120_splinter mtl_p7_wood_plank_rustic_2x12x96_splinter t7_metal_grating_expanded_snow ' +
  'mtl_p7_debris_wood_lath_splinters mtl_p7_debris_paint_peeling_01 t7_metal_grating_01 ' +
  't7_metal_floor_catwalk_reinforced mtl_p7_zm_der_vista_crane mtl_p7_zm_der_time_clock_card ' +
  'mtl_p7_zm_der_cipher_message_01 mtl_p7_zm_der_cipher_message_02 mtl_p7_zm_der_cipher_message_03 ' +
  'mtl_p7_zm_der_cipher_message_04 mtl_p7_zm_der_cipher_message_05 t7_metal_corrugated_rust_dmg').split(' ');
// Left solid on purpose: t7_zm_der_notes_01 (paper notes, blood paw prints). The map cuts the wall away under half of
// its quads, so blending them shows the void behind the wall instead of the wall.
// glass that hid what is behind it: the lab clocks' faces, the brains in their jars, lamp tubes, flasks, floor shards
const GLASS = ('t7_glass_dirty_streaks t7_glass_dirty_streaks_cracked t7_glass_plain_cracked t7_water_variant_opacity_40 ' +
  'mtl_p7_chemistry_kit_glass mtl_p7_zm_ctl_chemistry_kit_glass mtl_p7_debris_glass_shards mtl_p7_debris_glass_shards_edge').split(' ');

// The map's snow _blend materials are real surfaces here (the brick "breakout" patches are the wall itself), so the
// castle's snow-shell rule is off; its black backdrop planes are named wc/global_black.
export function giantOverlays(root) {
  return { ...overlayLayers(root, { blend: BLEND, mask: MASK, glass: GLASS, snow: null, soft: null }), black: blackPlanes(root, /^wc\/global_black$/) };
}

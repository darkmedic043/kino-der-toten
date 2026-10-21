# The Siren (Black Ops 7's charge energy rifle), rebuilt from reference images for Melon Zombies.
# Modelled in the BO1 M16 viewmodel's gun space (j_gun: x forward, y left, z up, inches) like the Grimhawk, so
# .tools/assemble-grimhawk.mjs --gun siren skins each part to the M16 skeleton. The player sees the gun's left (+y)
# side, so the detail (window, hoses, cable) is there. Parts are objects named part_<bone>:
#   j_gun          receiver, front block, shroud, muzzle, hoses, coil, stock, trigger
#   tag_clip       the coolant canister (the magazine: moved by the reload)
#   tag_iron_sight flip-up irons (folded away by an optic, ironSights in attachments.json)
#   tag_sr_grip    the stock pistol grip (replaced by the Lancet / Soma rear grips)
#   tag_sr_*       the attachments, hidden by tag until fitted
#   blender -b -P .tools/build-siren.py -- <out.glb> [--render <dir>]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *
import bo7lib

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/siren_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None

PARTS.update({k: [] for k in ('j_gun', 'tag_clip', 'tag_iron_sight', 'tag_sr_grip', 'tag_sr_reflex', 'tag_sr_deflect',
                              'tag_sr_overclock', 'tag_sr_resonance', 'tag_sr_baffle', 'tag_sr_echo', 'tag_sr_lancet',
                              'tag_sr_soma', 'tag_ext_clip', 'tag_double_clip', 'tag_foregrip', 'tag_laser_box')})
M.update(
    # a hand-built prototype: enamel paint chipped through the primer to bare steel, grime run down the sides, rust
    silver=worn('sr_silver', '#b2b5b8', .3, .85, bare='#d6d8da', wear=.45, brushed=.9, dirt=.35),   # shroud, canister: brushed alloy
    dark=worn('sr_dark', '#4f5559', .5, .15, bare='#a4a8ae', wear=.7, chips=.55, under='#6a2c1f', mottle=.5, dirt=.45, rust=.2),
    poly=worn('sr_polymer', '#26272a', .6, 0, bare='#8d9197', wear=.4, chips=.35, under='#3d3f42', mottle=.4, dirt=.4),   # stock, grip: painted steel
    steel=worn('sr_steel', '#55595e', .35, 1, bare='#90949a', wear=.6, dirt=.3, rust=.3),     # rail, irons, screws
    rubber=worn('sr_rubber', '#131313', .88, 0, bare='#262626', wear=.2, bare_metal=False, dirt=.3),   # cable, fittings, pad
    hose=worn('sr_hose', '#8c7420', .42, .3, bare='#c9ab42', wear=.3, chips=.45, under='#7d7f7a', dirt=.35),   # the yellow coolant lines
    redpaint=worn('sr_redpaint', '#8e1b15', .5, 0, bare='#b9bbbd', wear=.55, chips=.6, under='#5f5f5a', dirt=.3),
    tan=worn('sr_tan', '#a48d6a', .6, .1, bare='#c9b896', wear=.3, bare_metal=False, chips=.3, under='#6b6252', dirt=.3),
    label=worn('sr_label', '#c9ccd0', .45, .2, bare='#e0e2e5', wear=.2, chips=.2, under='#8a8d90', dirt=.3),
    window=mat('sr_window', '#4a080a', .15, 0, '#ff3b3b', 2.2),    # the receiver's red window
    green=mat('sr_green', '#06300c', .3, 0, '#3dff6a', 3),         # the coil's charge bands
    bore=mat('sr_bore', '#2a0c34', .2, 0, '#e3a6ff', 4),           # the lilac glow down the muzzle
    reso=mat('sr_reso', '#062a30', .2, 0, '#5ef0ff', 3),           # Resonance Chamber
    deflect=mat('sr_deflect', '#04182e', .3, 0, '#3aa8ff', 3),     # Deflection Core
    over=mat('sr_over', '#301000', .3, 0, '#ff7a1a', 3),           # Overclock Cell
    echo=mat('sr_echo', '#200830', .3, 0, '#b65cff', 3),           # Echo Rounds
    lens=mat('reflex_lens_sr', '#a9d6e6', .05, 0, alpha=.08),      # named so the scopes mod treats it as a reflex lens
    dot=mat('sr_dot', '#300000', .3, 0, '#ff2a1a', 12),
    # the prototype finish: red-oxide primer, stencil paint, masking tape, bare copper, loose wiring and a circuit board
    primer=worn('sr_primer', '#62291c', .8, 0, bare='#9a9ea4', wear=.55, chips=.3, under='#4a4d52', mottle=.6, dirt=.4, rust=.35),
    stencil=worn('sr_stencil', '#d9d3bd', .6, 0, bare='#7d8186', wear=.4, chips=.35, under='#55595e', dirt=.3),
    masking=worn('sr_masking', '#c9b98e', .88, 0, bare='#ddd1ab', wear=.25, bare_metal=False, dirt=.5),
    copper=worn('sr_copper', '#a8622f', .32, 1, bare='#de9a64', wear=.35, dirt=.2),
    bakelite=worn('sr_bakelite', '#3b1a0f', .35, 0, bare='#5a2c18', wear=.25, bare_metal=False, mottle=.6, dirt=.2),   # tube sockets
    wred=worn('sr_wire_red', '#8a1410', .5, 0, bare='#b02a20', wear=.15, bare_metal=False),
    wblue=worn('sr_wire_blue', '#173f8a', .5, 0, bare='#2c5cb0', wear=.15, bare_metal=False),
    wwhite=worn('sr_wire_white', '#c8c8c0', .55, 0, bare='#e4e4dc', wear=.15, bare_metal=False),
    pcb=worn('sr_pcb', '#1c4a26', .5, 0, bare='#b7953e', wear=.3, bare_metal=False),
    # the lettering stays out of the bake (glyphs that small lose strokes in the atlas)
    glass=mat('sr_glass', '#c8d4cf', .05, 0, alpha=.22),              # vacuum tube envelopes
    filament=mat('sr_filament', '#401000', .3, 0, '#ff8a2a', 6),      # their glowing heaters
    ink_w=mat('sr_ink_white', '#cfc9b2', .6, 0), ink_r=mat('sr_ink_red', '#8a1a14', .55, 0), ink_k=mat('sr_ink_black', '#151515', .6, 0),
)
BAKED = ('silver', 'dark', 'poly', 'steel', 'rubber', 'hose', 'redpaint', 'tan', 'label',
         'primer', 'stencil', 'masking', 'copper', 'wred', 'wblue', 'wwhite', 'pcb', 'bakelite')
STENCIL = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'   # has Cyrillic, unlike Blender's default font
MARKER = '/usr/share/fonts/opentype/urw-base35/Z003-MediumItalic.otf'       # a script face for the pen notes on the tape

SZ, SR = 2.2, 1.45      # shroud axis height and radius (kept near the M16 handguard so the left hand fits)
CZ, CR = -2.0, 1.55     # canister axis height and radius
RAIL = 3.85             # rail top; the irons and the optic's glass centre on z 5.2 (the M16 sight line)


def tube(name, pts, r, m, part='j_gun', res=8):
    """A round hose through the points (a NURBS curve with a bevel, made a mesh)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS'); sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts): p.co = (*c, 1)
    sp.use_endpoint_u = True; sp.order_u = min(4, len(pts)); sp.resolution_u = res
    ob = bpy.data.objects.new(name, cu); COL.objects.link(ob); bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob); me.materials.append(m)
    o2 = bpy.data.objects.new(name, me); COL.objects.link(o2); me.shade_smooth()
    PARTS[part].append(o2); return o2


def ring(name, r_out, r_in, x0, x1, m, part='j_gun', z=SZ, y=0., seg=40, bw=.03):
    """A band around the x axis (a tube from r_in to r_out)."""
    return solid(name, cylbm(r_out, x0, x1, z, y, seg), m, part=part, cuts=[cylbm(r_in, x0 - .1, x1 + .1, z, y, seg)], bw=bw, seg=1)


def vcyl(r, x, y, z0, z1, seg=16, r2=None):
    """An upright cylinder at (x, y) from z0 to z1."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0)
    bm.transform(Matrix.Translation((x, y, (z0 + z1) / 2))); return bm


def rivets(pts, y, r=.055, m='steel', part='j_gun'):
    """Round rivet heads on a +y face at the (x, z) points."""
    bm = bmesh.new()
    for x, z in pts:
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r, matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((1, .5, 1, 1)))
    return solid('rivets', bm, M[m], part=part, bw=0)


def onside(x, z, cz, r, out=.02):
    """The y of the canister/shroud's +y surface at height z (for wires lying on it)."""
    return math.sqrt(max(r * r - (z - cz) ** 2, 0)) + out


# ---------------------------------------------------------------- receiver
rcv = prism(fillet([(8.6, 0.0), (8.6, 3.55), (-2.4, 3.55), (-3.3, 3.0), (-3.3, 0.15), (-0.6, 0.2), (2.8, 0.2), (3.4, 0.0)], .25), -.85, .85)
rcv_cuts = [prism(rrect_xz(-0.3, 4.2, 0.95, 2.6, .3), -2, 2),                      # the open coil bay
            boxbm(4.75, 6.85, .72, 1, 0.65, 2.65), boxbm(4.75, 6.85, -1, -.72, 0.65, 2.65),   # window recesses
            prism(rrect_xz(-2.6, -0.9, 2.55, 3.15, .2), .78, 1),                     # the E&M plate recess
            ] + [boxbm(x, x + .35, -1, 1, -.1, .12) for x in (5.0, 5.6, 6.2, 6.8, 7.4)]   # ribs under the front
solid('receiver', rcv, M['dark'], cuts=rcv_cuts, bw=.08, seg=3)
solid('window', boxbm(4.75, 6.85, -.78, .78, 0.65, 2.65), M['window'], bw=.12, seg=3)
win_frame = prism(rrect_xz(4.4, 7.2, 0.3, 3.0, .45), -.97, .97)
solid('window_frame', win_frame, M['steel'], cuts=[prism(rrect_xz(4.75, 6.85, 0.65, 2.65, .25), -2, 2)], bw=.06, seg=2)
for s in (1, -1):
    for x, z in ((4.6, .45), (7.0, .45), (4.6, 2.85), (7.0, 2.85)):
        solid('wscrew', screw(x, s * .99, z, .11, .06, seg=6), M['steel'], bw=0)   # hex bolts
solid('em_plate', prism(rrect_xz(-2.55, -0.95, 2.6, 3.1, .15), .78, .9), M['label'], bw=.02)
text('E&M', .34, (-1.75, .91, 2.85), side=1, m=M['dark'])
for s_ in (1, -1):   # the upper panel over the coil bay and window: still in primer on the left, Cyrillic stencils
    solid('top_panel', prism(fillet([(-0.4, 2.95), (8.4, 2.95), (8.4, 3.45), (-0.4, 3.45)], .1), s_ * .84, s_ * .92),
          M['primer' if s_ > 0 else 'silver'], bw=.02)
    text('СИРЕНА  ЭМ-7', .24, (2.0, s_ * .93, 3.2), side=s_, m=M['ink_w' if s_ > 0 else 'ink_k'], font=STENCIL)
rivets([(x, z) for x in [-0.15 + .7 * k for k in range(13)] for z in (3.02, 3.38) if not (1.0 < x < 3.0)], .92)
# coil in the bay: a core, windings, and the green charge bands
solid('coil_core', cylbm(.55, -0.5, 4.4, 1.78, seg=20), M['steel'], bw=0)
for i in range(13):
    x = -0.2 + i * .33
    if 1.6 < x < 2.6: continue
    solid('winding', cylbm(.74, x, x + .2, 1.78, seg=24), M['copper'], bw=.03, seg=1)   # bare copper
for x in (1.65, 1.95, 2.25):
    solid('band', cylbm(.78, x, x + .2, 1.78, seg=24), M['green'], bw=.03, seg=1)
# top rail with flat teeth
solid('rail', boxbm(-0.6, 10.9, -.52, .52, 3.4, RAIL - .12), M['steel'], bw=.04)
for k in range(28):
    x = -0.45 + k * .4
    solid('tooth', boxbm(x, x + .24, -.52, .52, RAIL - .14, RAIL), M['steel'], bw=.03, seg=1)
# trigger guard and trigger (the M16's trigger sits at x 0.65)
guard = prism([(-0.9, 0.3), (2.6, 0.3), (2.6, -0.6), (2.1, -1.0), (-0.5, -1.0), (-0.9, -0.6)], -.3, .3)
solid('guard', guard, M['poly'], cuts=[prism(fillet([(-0.5, .1), (2.2, .1), (2.2, -.6), (1.9, -.75), (-.3, -.75), (-.5, -.5)], .2), -1, 1)], bw=.05)
solid('trigger', prism([(0.55, 0.3), (0.85, 0.3), (0.75, -0.45), (0.45, -0.55)], -.12, .12), M['steel'], bw=.03)
# magwell collar the canister plugs into
solid('collar', prism(fillet([(3.2, 0.1), (8.4, 0.1), (8.4, -0.75), (3.6, -0.75)], .15), -.82, .82), M['dark'],
      cuts=[boxbm(x, x + .3, .7, 1, -.55, -.15) for x in (4.3, 4.9, 5.5)], bw=.05)
solid('collar_slot', prism(rrect_xz(6.2, 7.9, -.6, -.1, .12), .8, .86), M['steel'], bw=.01)

# ---------------------------------------------------------------- front block and coupling
fb = prism(fillet([(8.5, 0.0), (11.4, 0.4), (11.4, 3.65), (8.5, 3.55)], .3), -1.15, 1.15)
fb_cuts = [prism(rrect_xz(9.15, 10.85, z0, z0 + .7, .25), -2, -.98) for z0 in (0.75, 2.35)]
fb_cuts.append(prism(rrect_xz(9.0, 11.0, .65, 3.15, .2), .45, 2))   # the left side's cover is off: a vacuum-tube bay
solid('front_block', fb, M['primer'], cuts=fb_cuts, bw=.1, seg=3)   # never got its top coat
for z0 in (0.75, 2.35):
    solid('slot_grip', prism(rrect_xz(9.35, 10.65, z0 + .18, z0 + .52, .15), -1.04, -.92), M['steel'], bw=.03)
solid('chev', prism([(11.0, 1.6), (11.2, 1.4), (11.0, 1.2), (10.9, 1.2), (11.1, 1.4), (10.9, 1.6)], -1.18, -1.13), M['label'], bw=0)
solid('tube_chassis', boxbm(9.05, 10.95, .45, .52, .7, 3.1), M['steel'], bw=.01)
for x in (9.55, 10.45):   # two valves on bakelite sockets, glass envelopes with a glowing heater inside
    solid('valve_socket', vcyl(.36, x, .85, .66, .95, 18), M['bakelite'], bw=.03)
    solid('valve_glass', vcyl(.3, x, .85, .95, 2.7, 20), M['glass'], bw=0)
    solid('valve_top', vcyl(.3, x, .85, 2.7, 2.95, 20, r2=.1), M['glass'], bw=0)
    solid('valve_plate', boxbm(x - .17, x + .17, .8, .9, 1.25, 2.35), M['steel'], bw=0)
    solid('valve_heater', vcyl(.045, x, .95, 1.15, 2.45, 8), M['filament'], bw=0)
    solid('valve_getter', vcyl(.2, x, .85, 2.55, 2.6, 16), M['copper'], bw=0)
tube('valve_link', [(9.55, 1.12, .8), (10.0, 1.2, .7), (10.45, 1.12, .8)], .035, M['wwhite'], res=6)
tube('valve_feed', [(10.45, 1.1, .78), (10.85, 1.18, 1.2), (10.9, 1.24, 2.9), (10.6, 1.3, 3.1)], .04, M['wblue'], res=6)
ring('coupling', 1.72, 1.0, 11.3, 11.75, M['steel'], bw=.05)
ring('coupling2', 1.6, 1.0, 11.75, 12.05, M['dark'], bw=.04)

# ---------------------------------------------------------------- shroud (brushed alloy), bands, rails
HATCH = (13.65, 15.35, SZ + .4, SZ + 1.0)   # an open service hatch above the left side rail (its cover is missing)
solid('shroud', cylbm(SR, 11.9, 18.3, SZ, seg=40), M['silver'], cuts=[boxbm(HATCH[0], HATCH[1], .95, 2, HATCH[2], HATCH[3])], bw=.06, seg=2)
for x in (13.15, 15.7):
    ring('red_band', SR + .015, SR - .2, x, x + .26, M['redpaint'], bw=.01)
for x in (12.75, 17.25):
    ring('groove', SR + .03, SR - .2, x, x + .12, M['steel'], bw=.01)
ring('shroud_cap', SR + .14, 1.0, 18.15, 18.5, M['steel'], bw=.05)
for s in (1, -1):   # side rails (left and right) and the bottom rail
    solid('side_rail', boxbm(12.4, 17.6, s * (SR - .1), s * (SR + .32), SZ - .3, SZ + .3), M['dark'],
          cuts=[boxbm(x, x + .22, s * (SR + .18), s * (SR + .5), SZ - .4, SZ + .4) for x in [12.7 + .5 * k for k in range(10)]], bw=.03)
    for x in (12.6, 17.4):
        solid('rail_screw', screw(x, s * (SR + .34), SZ, .09, .05), M['steel'], bw=0)
solid('bottom_rail', boxbm(12.4, 17.6, -.42, .42, SZ - SR - .3, SZ - SR + .25), M['dark'],
      cuts=[boxbm(x, x + .22, -.6, .6, SZ - SR - .4, SZ - SR - .15) for x in [12.7 + .5 * k for k in range(10)]], bw=.03)
solid('knob', vcyl(.24, 14.6, -.5, SZ + SR - .3, SZ + SR + .45), M['steel'], bw=.03)
solid('knob_cap', vcyl(.3, 14.6, -.5, SZ + SR + .4, SZ + SR + .55), M['steel'], bw=.02)
solid('amber_vent', prism(rrect_xz(19.6, 20.5, SZ - .8, SZ - .1, .12), .95, 1.2), M['tan'],
      cuts=[boxbm(19.7, 20.4, .9, 1.4, z, z + .07) for z in (SZ - .7, SZ - .52, SZ - .34)], bw=.02)

# ---------------------------------------------------------------- muzzle: wide, stepped, with a glowing bore
solid('muzzle_base', cylbm(1.32, 18.4, 19.5, SZ, seg=36), M['dark'], bw=.06, seg=2)
solid('muzzle', cylbm(1.18, 19.4, 22.35, SZ, seg=36), M['dark'],
      cuts=[cylbm(.82, 20.4, 22.6, SZ, seg=36)] + [boxbm(19.9, 21.6, -2, 2, SZ + z, SZ + z + .14) for z in (-.95, .82)], bw=.07, seg=2)
ring('muzzle_lip', 1.27, .9, 21.95, 22.4, M['steel'], bw=.05)
ring('bore_step', .84, .58, 21.1, 21.4, M['steel'], bw=.02)
solid('bore', cylbm(.82, 20.42, 20.5, SZ, seg=36), M['bore'], bw=0)

# ---------------------------------------------------------------- coolant hoses: three yellow lines arcing over the shroud
for i, (xs, ys) in enumerate(((15.3, .25), (13.9, .45), (12.5, .65))):
    yb = .62 + .16 * i
    tube('hose', [(xs, ys, SZ + SR - .1), (xs, ys, SZ + SR + .35), (xs - .9, ys + .1, 4.25), (xs - 2.6, yb, 4.3),
                  (10.6, yb, 4.0), (9.0, yb + .05, 3.85), (8.0, yb + .1, 3.45)], .12, M['hose'])
    solid('fitting', vcyl(.2, xs, ys, SZ + SR - .2, SZ + SR + .3, 14), M['rubber'], bw=.02)
    solid('fitting_nut', vcyl(.17, 8.0, yb + .1, 3.2, 3.5, 6), M['steel'], bw=.01)

# ---------------------------------------------------------------- braided cable from the receiver down to the canister
solid('cable_plug', cylbm(.22, -2.3, -0.4, 2.15, y=1.0, seg=14), M['rubber'], bw=.02, seg=1)
for x in (-2.1, -1.8, -1.5, -1.2, -0.9):
    solid('plug_rib', cylbm(.26, x, x + .1, 2.15, y=1.0, seg=14), M['steel'], bw=.01, seg=1)
tube('cable', [(-0.4, 1.0, 2.15), (0.6, 1.08, 1.9), (2.0, 1.12, 1.0), (3.4, 1.12, 0.35), (4.2, 1.05, -0.2), (4.6, .95, -0.85)],
     .15, M['rubber'], res=10)

# ---------------------------------------------------------------- prototype work: loose wiring, an open hatch, welds, stencils
# a loom of four wires from the coil bay along the receiver, past the front block, into the circuit board in the hatch
LOOM = [(3.7, .35, 2.25), (4.0, .9, 2.55), (4.6, 1.1, 3.16), (6.0, 1.1, 3.18), (7.6, 1.12, 3.06), (8.6, 1.26, 3.0),
        (10.0, 1.3, 3.12), (11.5, 1.42, 3.4), (12.5, 1.36, 3.45), (13.3, 1.2, 3.2)]
for i, (m, end) in enumerate((('wred', (14.0, 1.07, 2.75)), ('rubber', (14.35, 1.07, 2.85)),
                               ('wblue', (14.1, 1.07, 3.02)), ('wwhite', (14.7, 1.07, 2.95)))):
    a = [i * math.pi / 2 + k * 1.1 for k in range(len(LOOM))]   # loosely twisted round each other
    tube('loom', [(x, y + .06 * math.cos(t), z + .06 * math.sin(t)) for (x, y, z), t in zip(LOOM, a)] + [end], .05, M[m], res=6)
    solid('lug', cylbm(.07, end[0], end[0] + .14, end[2], y=1.04, axis='y', seg=8), M['copper'], bw=0)
for x, y, z in ((6.0, 1.1, 3.18), (10.0, 1.3, 3.12)):   # electrical tape wraps
    ring('tape', .16, .02, x - .14, x + .14, M['rubber'], z=z, y=y, seg=14, bw=.02)
ring('zip', .145, .02, 7.0, 7.05, M['wwhite'], z=3.13, y=1.11, seg=12, bw=0)
solid('zip_head', boxbm(6.96, 7.1, 1.24, 1.34, 3.04, 3.16), M['wwhite'], bw=0)
# the circuit board in the hatch: chips, capacitors, solder pads; screw bosses round the empty cover seat
solid('pcb', boxbm(HATCH[0] + .1, HATCH[1] - .1, .95, 1.0, HATCH[2] + .05, HATCH[3] - .05), M['pcb'], bw=0)
for x0, x1, z0, z1 in ((13.85, 14.25, 2.68, 2.92), (14.5, 15.15, 2.72, 2.88), (14.85, 15.15, 2.98, 3.12)):
    solid('chip', boxbm(x0, x1, 1.0, 1.05, z0, z1), M['rubber'], bw=.005)
for x, z, r in ((13.95, 3.08, .08), (14.45, 3.1, .07), (14.6, 3.1, .07)):
    solid('cap', cylbm(r, x, x + .22, z, y=1.11, axis='y', seg=10), M['wblue' if r > .075 else 'steel'], bw=.01)
for x in (13.6, 15.4):
    for z in (HATCH[2] + .08, HATCH[3] - .08):
        solid('hatch_boss', screw(x, onside(0, z, SZ, SR, .01), z, .07, .05, seg=6), M['steel'], bw=0)
# a loose red jumper looping over the window to a terminal on the front block
tube('jumper', [(5.6, 1.12, 3.1), (6.3, 1.27, 2.3), (7.0, 1.32, 1.55), (7.8, 1.28, 1.3), (8.5, 1.26, 1.55), (8.85, 1.25, 1.9)],
     .045, M['wred'], res=8)
solid('terminal', screw(8.85, 1.19, 1.9, .14, .1, seg=6), M['copper'], bw=0)
for x, z in ((8.8, .4), (8.8, 3.3), (11.05, 3.4)):   # hex bolts on the front block (one never went back in)
    solid('fb_bolt', screw(x, 1.19, z, .12, .08, seg=6), M['steel'], bw=0)
solid('fb_hole', screw(11.15, 1.15, .55, .07, .02, seg=10), M['rubber'], bw=0)
# a rough weld down the seam where the front block meets the receiver
weld = bmesh.new()
for k in range(22):
    z = .3 + k * .12
    bmesh.ops.create_icosphere(weld, subdivisions=1, radius=.075 + .02 * math.sin(k * 2.7),
                               matrix=Matrix.Translation((8.47 + .02 * math.sin(k * 1.3), .9, z)))
solid('weld', weld, M['steel'], bw=0)
# a warning plate below the coil bay: lightning triangle, "DANGER! HIGH VOLTAGE"
solid('warn_plate', prism(rrect_xz(-0.7, 2.4, .28, .88, .06), .85, .89), M['stencil'], bw=.01)
solid('warn_tri', prism([(-0.62, .34), (-0.02, .34), (-0.32, .84)], .89, .9), M['redpaint'], bw=0)
rivets([(-0.6, .35), (2.3, .35), (-0.6, .81), (2.3, .81)], .89, r=.04)
solid('warn_bolt', prism([(-.25, .72), (-.30, .72), (-.38, .55), (-.31, .55), (-.37, .40), (-.24, .60), (-.31, .60)], .9, .91), M['rubber'], bw=0)
text('ОПАСНО!', .2, (1.0, .9, .68), m=M['ink_r'], font=STENCIL)
text('ВЫСОКОЕ НАПРЯЖЕНИЕ', .12, (1.0, .9, .44), m=M['ink_k'], font=STENCIL)
# masking tape round the shroud with a pen note: "don't touch"
ring('masking', SR + .012, SR - .2, 16.05, 17.15, M['masking'], bw=.005)
text('не трогать!', .2, (16.6, (SR + .02) * math.cos(math.radians(40)), SZ + (SR + .02) * math.sin(math.radians(40))),
     m=M['ink_k'], font=MARKER, tilt=40)

# ---------------------------------------------------------------- stock: skeletal, with vents, a tan plate and labels
stock = prism(fillet([(-2.9, 3.45), (-8.4, 3.0), (-9.4, 3.35), (-14.4, 3.35), (-14.9, 2.85), (-14.9, -2.4), (-14.4, -2.85),
                      (-7.6, -2.85), (-3.7, -0.6), (-2.9, -0.1)], .4), -.68, .68)
st_cuts = [prism(fillet([(-4.7, 0.65), (-9.5, 0.65), (-9.5, -1.95), (-7.9, -1.95), (-4.7, -0.2)], .5), -2, 2)]
st_cuts += [prism(rrect_xz(x, x + .22, 1.95, 2.75, .1), -2, 2) for x in (-10.4, -10.8, -11.2, -11.6)]
st_cuts += [prism(rrect_xz(x, x + .22, 1.95, 2.75, .1), -2, 2) for x in (-13.0, -13.4, -13.8)]
st_cuts += [prism(rrect_xz(-14.0, -10.4, -2.3, -1.4, .3), .58, 2)]   # a recessed panel low on the butt
st_cuts += [prism(rrect_xz(-8.0, -4.45, 1.05, 2.75, .25), .2, 2)]     # the capacitor compartment (cover off)
solid('stock', stock, M['poly'], cuts=st_cuts, bw=.16, seg=3)
solid('butt_pad', prism(fillet([(-14.85, 3.0), (-15.35, 2.9), (-15.35, -2.45), (-14.85, -2.55)], .2), -.72, .72), M['rubber'],
      cuts=[boxbm(-15.5, -15.2, -1, 1, z, z + .12) for z in (-1.8, -1.0, -0.2, 0.6, 1.4, 2.2)], bw=.08, seg=2)
solid('em_label', prism(rrect_xz(-13.1, -10.4, .9, 1.65, .1), .6, .72), M['label'], bw=.02)
text('ОПЫТНЫЙ ОБРАЗЕЦ', .2, (-11.75, .73, 1.42), m=M['ink_k'], font=STENCIL)   # "experimental prototype"
text('ЭМ-7  СЕРИЯ 0  №004', .13, (-11.75, .73, 1.1), m=M['ink_k'], font=STENCIL)
rivets([(-13.0, .98), (-10.5, .98), (-13.0, 1.57), (-10.5, 1.57)], .72, r=.045)
for z in (1.38, 1.9, 2.42):   # three capacitor cans with paper sleeves, strapped down, bussed to the receiver cable
    solid('cap_can', cylbm(.25, -7.75, -4.85, z, y=.45, seg=24), M['silver'], bw=.04, seg=2)
    ring('cap_sleeve', .262, .2, -7.2, -5.7, M['tan'], z=z, y=.45, seg=24, bw=.01)
    solid('cap_post', cylbm(.07, -4.9, -4.62, z, y=.45, seg=8), M['copper'], bw=0)
solid('cap_bus', boxbm(-4.72, -4.6, .36, .54, 1.25, 2.55), M['copper'], bw=.01)
solid('cap_strap', boxbm(-6.45, -6.15, .69, .74, 1.0, 2.8), M['steel'], bw=.01)
rivets([(-6.3, 1.04), (-6.3, 2.76)], .74, r=.05)
tube('cap_lead', [(-4.62, .48, 1.95), (-4.1, .78, 2.05), (-3.2, .96, 2.15), (-2.3, 1.0, 2.15)], .1, M['rubber'], res=8)
solid('warn', prism([(-13.4, -.4), (-12.9, -.4), (-13.15, .05)], .62, .73), M['redpaint'], bw=0)
solid('tan_plate', prism(rrect_xz(-11.9, -10.0, -.35, .3, .28), .6, .8), M['tan'], bw=.04, seg=2)
for x in (-11.45, -10.45):
    solid('tan_slot', prism(rrect_xz(x - .3, x + .3, -.2, .15, .12), .78, .84), M['dark'], bw=0)
for x, z in ((-3.75, 2.75), (-13.6, -1.2)):
    ring('sling', .32, .15, 0, .14, M['steel'], z=0, bw=.02).data.transform(Matrix.Translation((x, .7, z)) @ Matrix.Rotation(math.radians(90), 4, 'Z'))

# ---------------------------------------------------------------- canister (tag_clip): the magazine
C = 'tag_clip'
solid('canister', cylbm(CR, 3.6, 8.7, CZ, seg=40), M['silver'], part=C, bw=.05)
solid('can_front', cylbm(CR + .06, 8.6, 9.15, CZ, seg=40), M['dark'], part=C, cuts=[cylbm(CR - .45, 8.95, 9.3, CZ, seg=40)], bw=.08, seg=2)
solid('can_front_in', cylbm(CR - .45, 8.8, 9.0, CZ, seg=40), M['steel'], part=C, bw=.02)
solid('can_back', cylbm(CR + .05, 3.3, 3.7, CZ, seg=40), M['dark'], part=C, bw=.06, seg=2)
solid('can_neck', boxbm(4.3, 8.2, -.7, .7, CZ + CR - .3, -0.6), M['dark'], part=C, bw=.05)
solid('can_plug', boxbm(5.3, 6.3, .75, 1.0, -1.2, -.7), M['dark'], part=C, bw=.03)
text('V', .7, (8.3, onside(0, CZ - .9, CZ, CR, .03), CZ - .9), part=C, side=1, m=M['redpaint'])
for i, z in enumerate((CZ + .25, CZ - .2, CZ - .65)):   # the yellow wires along the canister's side
    pts = [(5.8, .9, -1.0), (6.0, onside(0, -1.1, CZ, CR, .08), -1.15), (6.4, onside(0, z + .35, CZ, CR, .08), z + .35),
           (6.9, onside(0, z, CZ, CR, .08), z), (7.9, onside(0, z, CZ, CR, .08), z)]
    tube('wire', pts, .06, M['hose'], part=C, res=6)
    solid('wire_end', cylbm(.1, 7.85, 8.15, z, y=onside(0, z, CZ, CR, .08), seg=10), M['rubber'], part=C, bw=0)
solid('can_label', prism(rrect_xz(6.2, 8.0, CZ + 1.2, CZ + 1.45, .05), 0, .92), M['label'], part=C, bw=0)
ring('can_tape', CR + .012, CR - .2, 3.85, 4.55, M['masking'], part=C, z=CZ, bw=.005)
text('№004', .22, (4.2, CR + .03, CZ + .1), part=C, m=M['ink_k'], font=MARKER)
text('НЕ ВСКРЫВАТЬ', .15, (5.35, onside(0, CZ - .15, CZ, CR, .02), CZ - .15), part=C, m=M['ink_r'], font=STENCIL)   # "do not open"

# Extended Mag (the shared extmag, on the M16's own tag_ext_clip): a second canister section screwed on in front of
# the first, joined by a ribbed coupling with a sight-glass, the yellow wires running on along both
X = 'tag_ext_clip'
solid('xc_can', cylbm(CR, 3.6, 8.3, CZ, seg=40), M['silver'], part=X, bw=.05)
solid('xc_can2', cylbm(CR, 9.3, 12.2, CZ, seg=40), M['primer'], part=X, bw=.05)
solid('xc_coupling', cylbm(CR + .14, 8.2, 9.4, CZ, seg=40), M['dark'], part=X,
      cuts=[cylbm(CR + .3, x, x + .1, CZ, seg=40) for x in (8.4, 8.65, 8.9, 9.15)], bw=.04, seg=1)
solid('xc_gauge', cylbm(.32, 8.8, 9.3, CZ - .1, y=CR + .1, seg=16, axis='y'), M['steel'], part=X, bw=.02)
solid('xc_gauge_in', cylbm(.22, 8.8, 9.2, CZ - .1, y=CR + .2, seg=16, axis='y'), M['lens'], part=X, bw=0)
solid('xc_front', cylbm(CR + .06, 12.1, 12.55, CZ, seg=40), M['dark'], part=X, cuts=[cylbm(CR - .45, 12.4, 12.7, CZ, seg=40)], bw=.08, seg=2)
solid('xc_front_in', cylbm(CR - .45, 12.25, 12.45, CZ, seg=40), M['steel'], part=X, bw=.02)
solid('xc_back', cylbm(CR + .05, 3.3, 3.7, CZ, seg=40), M['dark'], part=X, bw=.06, seg=2)
solid('xc_neck', boxbm(4.3, 8.2, -.7, .7, CZ + CR - .3, -0.6), M['dark'], part=X, bw=.05)
solid('xc_plug', boxbm(5.3, 6.3, .75, 1.0, -1.2, -.7), M['dark'], part=X, bw=.03)
for z in (CZ + .25, CZ - .2, CZ - .65):
    pts = [(5.8, .9, -1.0), (6.0, onside(0, -1.1, CZ, CR, .08), -1.15), (6.4, onside(0, z + .35, CZ, CR, .08), z + .35),
           (6.9, onside(0, z, CZ, CR, .08), z), (11.4, onside(0, z, CZ, CR, .22), z)]
    tube('xc_wire', pts, .06, M['hose'], part=X, res=6)
    solid('xc_wire_end', cylbm(.1, 11.35, 11.65, z, y=onside(0, z, CZ, CR, .22), seg=10), M['rubber'], part=X, bw=0)
solid('xc_label', prism(rrect_xz(9.7, 11.6, CZ + 1.2, CZ + 1.45, .05), 0, .92), M['label'], part=X, bw=0)
ring('xc_tape', CR + .012, CR - .2, 3.85, 4.55, M['masking'], part=X, z=CZ, bw=.005)
ring('xc_tape2', CR + .012, CR - .2, 10.2, 10.7, M['masking'], part=X, z=CZ, bw=.005)
text('№004', .22, (4.2, CR + .03, CZ + .1), part=X, m=M['ink_k'], font=MARKER)
text('№004-Б', .22, (10.25, CR + .03, CZ + .1), part=X, m=M['ink_k'], font=MARKER)
text('×1.5', .3, (11.0, onside(0, CZ - .7, CZ, CR, .02), CZ - .7), part=X, m=M['ink_r'], font=STENCIL)

# Dual Mag (the shared dualmag, on tag_double_clip): a spare canister strapped under the stock one, a coolant bridge
# between them, so a reload just swaps which one feeds
DM = 'tag_double_clip'
Z2 = CZ - 2 * CR - .12   # the spare's axis
for nm, z, mat in (('dm_can', CZ, 'silver'), ('dm_spare', Z2, 'primer')):
    solid(nm, cylbm(CR, 3.6, 8.7, z, seg=40), M[mat], part=DM, bw=.05)
    solid(nm + '_front', cylbm(CR + .06, 8.6, 9.15, z, seg=40), M['dark'], part=DM, cuts=[cylbm(CR - .45, 8.95, 9.3, z, seg=40)], bw=.08, seg=2)
    solid(nm + '_front_in', cylbm(CR - .45, 8.8, 9.0, z, seg=40), M['steel'], part=DM, bw=.02)
    solid(nm + '_back', cylbm(CR + .05, 3.3, 3.7, z, seg=40), M['dark'], part=DM, bw=.06, seg=2)
solid('dm_neck', boxbm(4.3, 8.2, -.7, .7, CZ + CR - .3, -0.6), M['dark'], part=DM, bw=.05)
solid('dm_plug', boxbm(5.3, 6.3, .75, 1.0, -1.2, -.7), M['dark'], part=DM, bw=.03)
for x in (4.9, 7.6):   # two straps round both: a steel band and a cam buckle on the side
    solid('dm_strap', boxbm(x, x + .45, -CR - .1, CR + .1, Z2 - CR - .1, CZ + CR + .1), M['rubber'], part=DM,
          cuts=[boxbm(x - .1, x + .55, -CR, CR, Z2 - CR, CZ + CR)], bw=.02)
    solid('dm_buckle', boxbm(x - .05, x + .5, CR + .05, CR + .3, Z2 + CR - .5, Z2 + CR + .5), M['steel'], part=DM, bw=.03)
tube('dm_bridge', [(9.2, 0, CZ - .3), (9.7, 0, CZ - .6), (9.7, 0, Z2 + .6), (9.2, 0, Z2 + .3)], .2, M['hose'], part=DM, res=8)
for z in (CZ - .3, Z2 + .3):
    solid('dm_bridge_nut', cylbm(.28, 8.95, 9.3, z, seg=12), M['copper'], part=DM, bw=.02)
solid('dm_label', prism(rrect_xz(5.4, 7.2, Z2 + .1, Z2 + .45, .05), 0, CR + .02), M['label'], part=DM, bw=0)
text('ЗАПАС', .26, (5.5, onside(0, Z2 - .5, Z2, CR, .02), Z2 - .5), part=DM, m=M['ink_r'], font=STENCIL)   # "spare"
text('№004', .22, (4.2, CR + .03, CZ + .1), part=DM, m=M['ink_k'], font=MARKER)
text('№005', .22, (4.2, CR + .03, Z2 + .1), part=DM, m=M['ink_k'], font=MARKER)

# ---------------------------------------------------------------- flip-up irons (tag_iron_sight)
IS = 'tag_iron_sight'
solid('front_base', boxbm(9.7, 10.6, -.48, .48, RAIL, RAIL + .45), M['steel'], part=IS, bw=.05)
for s in (1, -1):
    solid('front_ear', prism(fillet([(9.95, RAIL + .4), (10.35, RAIL + .4), (10.3, 5.55), (10.0, 5.55)], .08), s * .26, s * .4), M['steel'], part=IS, bw=.02)
solid('front_post', boxbm(10.1, 10.2, -.05, .05, RAIL + .4, 5.2), M['steel'], part=IS, bw=0)
# rear: a thin ghost ring on a slim post (it sits right by the eye: a solid plate filled the aimed view)
solid('rear_base', boxbm(-0.3, 0.6, -.3, .3, RAIL, RAIL + .35), M['steel'], part=IS, bw=.04)
solid('rear_post', prism(fillet([(0.0, RAIL + .3), (0.3, RAIL + .3), (0.22, 5.2 - .3), (0.08, 5.2 - .3)], .04), -.07, .07), M['steel'], part=IS, bw=.01)
solid('rear_ring', cylbm(.34, .08, .22, 5.2, seg=32), M['steel'], part=IS, cuts=[cylbm(.29, -.2, .5, 5.2, seg=32)], bw=.01)
for x in (9.75,):   # the rear base is too slim for a label
    text('///', .22, (x + .4, .49, RAIL + .22), part=IS, side=1, m=M['label'])

# ---------------------------------------------------------------- pistol grip (tag_sr_grip)
G = 'tag_sr_grip'
grip = prism(fillet([(-0.6, 0.3), (-2.6, 0.3), (-3.6, -3.7), (-3.25, -4.2), (-1.85, -4.25), (-1.55, -3.85), (-0.85, -0.55)], 0.35), -.62, .62)
solid('grip', grip, M['poly'], part=G, cuts=[prism(fillet([(-1.4, -0.9), (-2.5, -0.9), (-3.1, -3.3), (-2.0, -3.3)], .25), .5, 1),
                                              prism(fillet([(-1.4, -0.9), (-2.5, -0.9), (-3.1, -3.3), (-2.0, -3.3)], .25), -1, -.5)], bw=.2, seg=4)
for s in (1, -1):
    solid('grip_panel', prism(fillet([(-1.45, -0.95), (-2.45, -0.95), (-3.05, -3.25), (-2.05, -3.25)], .22), s * .5, s * .58), M['rubber'], part=G,
          cuts=[boxbm(-3.4, -1.2, -1, 1, z, z + .08) for z in (-1.3, -1.7, -2.1, -2.5, -2.9)], bw=.02)

# ---------------------------------------------------------------- attachments
# Tuning Fork Reflex (optic): two tines either side of a glass pane centred on the sight line
R = 'tag_sr_reflex'
solid('rx_base', boxbm(2.4, 5.0, -.56, .56, RAIL, RAIL + .32), M['dark'], part=R, bw=.05)
solid('rx_clamp', boxbm(2.6, 4.8, -.62, -.45, RAIL - .35, RAIL + .2), M['dark'], part=R, bw=.03)
for s in (1, -1):
    solid('rx_tine', prism(fillet([(3.3, RAIL + .2), (4.3, RAIL + .2), (4.15, 6.15), (3.75, 6.25), (3.5, 6.05)], .18), s * .52, s * .74), M['steel'], part=R, bw=.05, seg=2)
solid('rx_fork', prism(fillet([(3.3, RAIL + .2), (4.3, RAIL + .2), (4.2, RAIL + .6), (3.4, RAIL + .6)], .1), -.74, .74), M['steel'], part=R, bw=.04)
solid('rx_glass', boxbm(3.84, 3.9, -.52, .52, 4.55, 5.85), M['lens'], part=R, bw=0)
solid('rx_emit', cylbm(.1, 2.9, 3.2, RAIL + .45, seg=10), M['dot'], part=R, bw=0)

# MFS Deflection Core (mag): a faceted armoured canister with blue slits and deflector fins at the front
D = 'tag_sr_deflect'
solid('dc_body', cylbm(CR + .12, 3.3, 9.0, CZ, seg=8), M['dark'], part=D,
      cuts=[cylbm(CR + .5, x, x + .12, CZ, seg=8) for x in (4.6, 5.6, 6.6, 7.6)], bw=.06, seg=2)
for x in (4.6, 5.6, 6.6, 7.6):
    solid('dc_glow', cylbm(CR + .02, x, x + .12, CZ, seg=8), M['deflect'], part=D, bw=0)
solid('dc_nose', cylbm(CR + .12, 9.0, 10.0, CZ, seg=8, r2=CR - .45), M['steel'], part=D, bw=.04)
for k in range(4):
    a = math.radians(45 + 90 * k)
    fin = prism([(8.2, 0), (9.9, 0), (9.6, .45), (8.4, .45)], -.06, .06)
    fin.transform(Matrix.Translation((0, 0, CZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, CR + .02)))
    solid('dc_fin', fin, M['steel'], part=D, bw=.02)
solid('dc_neck', boxbm(4.3, 8.2, -.7, .7, CZ + CR - .3, -0.6), M['dark'], part=D, bw=.05)
text('MFS', .45, (6.1, CR + .16, CZ - .9), part=D, side=1, m=M['label'])

# Overclock Cell (mag): a short hot cell with heat-sink fins and orange vents
O = 'tag_sr_overclock'
solid('oc_body', cylbm(CR - .2, 4.0, 8.0, CZ + .2, seg=32), M['steel'], part=O, bw=.04)
for x in [4.3 + .32 * k for k in range(12)]:
    solid('oc_fin', cylbm(CR + .05, x, x + .12, CZ + .2, seg=32), M['dark'], part=O, bw=.02, seg=1)
for x in (5.0, 6.0, 7.0):
    solid('oc_vent', cylbm(CR - .15, x + .1, x + .3, CZ + .2, seg=32), M['over'], part=O, bw=0)
solid('oc_cap', cylbm(CR, 7.95, 8.4, CZ + .2, seg=32), M['dark'], part=O, cuts=[cylbm(.5, 8.25, 8.6, CZ + .2, seg=16)], bw=.05)
solid('oc_core', cylbm(.5, 8.2, 8.3, CZ + .2, seg=16), M['over'], part=O, bw=0)
solid('oc_neck', boxbm(4.3, 7.6, -.7, .7, CZ + CR - .5, -0.6), M['dark'], part=O, bw=.05)

# Resonance Chamber (barrel): a stack of resonator rings round the front of the shroud, teal light between them
RC = 'tag_sr_resonance'
for k, x in enumerate((15.75, 16.3, 16.85, 17.4)):
    ring('rc_ring', SR + .42 - .04 * k, SR + .02, x, x + .32, M['steel'], part=RC, bw=.04)
    if k < 3:
        ring('rc_glow', SR + .26, SR + .01, x + .32, x + .55, M['reso'], part=RC, bw=0)
solid('rc_spine', boxbm(15.6, 17.85, -(SR + .5), -(SR + .2), SZ + .55, SZ + .85), M['dark'], part=RC, bw=.04)

# Hush Baffle (muzzle): a fluted can in front of the muzzle
B = 'tag_sr_baffle'
solid('hb_can', cylbm(1.05, 22.2, 26.6, SZ, seg=36), M['dark'], part=B, bw=.08, seg=2)
for k in range(10):
    a = math.radians(36 * k)
    fl = boxbm(22.8, 26.0, -.09, .09, 0.98, 1.2)
    fl.transform(Matrix.Translation((0, 0, SZ)) @ Matrix.Rotation(a, 4, 'X'))
    solid('hb_flute', fl, M['steel'], part=B, bw=.02)
ring('hb_end', 1.1, .45, 26.4, 26.8, M['steel'], part=B, bw=.05)
solid('hb_bore', cylbm(.45, 26.3, 26.4, SZ, seg=24), M['bore'], part=B, bw=0)

# Echo Rounds (ammo): a little coil pod on the left rail with violet windings
E = 'tag_sr_echo'
solid('ec_clamp', boxbm(15.4, 17.4, SR + .25, SR + .55, SZ - .35, SZ + .35), M['dark'], part=E, bw=.04)
solid('ec_pod', cylbm(.48, 15.1, 17.8, SZ, y=SR + .95, seg=24), M['steel'], part=E, bw=.05)
for x in (15.5, 15.9, 16.3, 16.7, 17.1):
    solid('ec_coil', cylbm(.53, x, x + .2, SZ, y=SR + .95, seg=24), M['echo'], part=E, bw=0)
solid('ec_tip', cylbm(.48, 17.8, 18.3, SZ, y=SR + .95, seg=24, r2=.2), M['dark'], part=E, bw=.03)

# Lancet Tear Grip (rear grip): slim and raked, a teardrop cut through it, red insert
LG = 'tag_sr_lancet'
lg = prism(fillet([(-0.6, 0.3), (-2.5, 0.3), (-3.9, -3.9), (-3.5, -4.35), (-2.3, -4.3), (-0.9, -0.6)], 0.3), -.55, .55)
tear = []   # a teardrop, point up
for k in range(20):
    a = 2 * math.pi * k / 20; up = max(math.sin(a), 0)
    tear.append((-2.6 + .42 * math.cos(a) * (1 - .9 * up) - .35 * up, -2.6 + (.55 if up else .5) * math.sin(a) * (1 + .9 * up)))
solid('lg_grip', lg, M['poly'], part=LG, cuts=[prism(tear, -1, 1)], bw=.18, seg=4)
solid('lg_insert', prism([(-1.0, -0.4), (-1.25, -0.4), (-2.3, -4.1), (-2.05, -4.1)], -.57, .57), M['redpaint'], part=LG, bw=.02)

# Soma-81 Grip (rear grip): chunky rubber with finger grooves and a palm swell
SG = 'tag_sr_soma'
sg = prism(fillet([(-0.5, 0.3), (-2.8, 0.3), (-3.7, -3.6), (-3.4, -4.4), (-1.6, -4.4), (-1.35, -3.6), (-1.05, -3.25), (-1.35, -2.75),
                   (-0.95, -2.2), (-1.2, -1.65), (-0.8, -1.1), (-0.75, -0.5)], 0.25), -.75, .75)
solid('sg_grip', sg, M['rubber'], part=SG, cuts=[boxbm(-3.9, -0.4, -1, 1, z, z + .05) for z in (-1.0, -1.4, -1.8, -2.2, -2.6, -3.0, -3.4)], bw=.25, seg=4)
solid('sg_cap', prism(fillet([(-3.45, -4.3), (-1.55, -4.3), (-1.5, -4.6), (-3.5, -4.6)], .12), -.78, .78), M['poly'], part=SG, bw=.06)
text('81', .35, (-2.5, .76, -4.05), part=SG, side=1, m=M['label'])

# Grip (foregrip, under the shroud's bottom rail)
FG = 'tag_foregrip'
solid('fg_clamp', boxbm(14.2, 16.2, -.55, .55, SZ - SR - .6, SZ - SR - .2), M['dark'], part=FG, bw=.06)
solid('fg_grip', prism(fillet([(14.5, SZ - SR - .5), (15.9, SZ - SR - .5), (15.75, -2.6), (14.75, -2.75)], .35), -.5, .5), M['poly'], part=FG,
      cuts=[boxbm(15.85, 16.4, -.6, .6, z - .06, z + .06) for z in (-0.6, -1.2, -1.8, -2.3)], bw=.2, seg=4)

# Laser Sight (on the right rail)
LS = 'tag_laser_box'
solid('ls_box', prism(fillet([(14.6, SZ - .5), (17.4, SZ - .5), (17.4, SZ + .5), (14.6, SZ + .5)], .2), -(SR + .9), -(SR + .32)), M['dark'], part=LS, bw=.08, seg=3)
solid('ls_lens', cylbm(.2, 17.38, 17.44, SZ, y=-(SR + .6), seg=16), M['dot'], part=LS, bw=0)

export(OUT, RENDER, 'sr', BAKED, tex=4096, frame=(5.5, 0, 0.5), ortho=46)

if RENDER:   # close-ups of the bare gun (no attachments) for checking the small stencils and wiring
    sc = bpy.context.scene; co = sc.camera
    for o in bpy.data.objects:
        if o.name.startswith('part_tag_') and o.name not in ('part_tag_clip', 'part_tag_iron_sight', 'part_tag_sr_grip'): o.hide_render = True
    for name, (x, z, sc_) in (('close_rcv', (3.0, 1.8, 13)), ('close_front', (12.0, 2.2, 13)), ('close_stock', (-6.5, 0.5, 13))):
        co.location = (x, 60, z); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = sc_
        sc.render.filepath = f'{RENDER}/sr_{name}.png'; bpy.ops.render.render(write_still=True)
    co.location = (-30, 26, 16)   # roughly the player's view: from behind, left and above
    co.rotation_euler = (Vector((6, 0, 2)) - co.location).to_track_quat('-Z', 'Z').to_euler(); co.data.ortho_scale = 30
    sc.render.filepath = f'{RENDER}/sr_close_hip.png'; bpy.ops.render.render(write_still=True)

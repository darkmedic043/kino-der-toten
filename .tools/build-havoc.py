# The GDL Havoc (Black Ops 7's pump-action sticky grenade launcher), rebuilt from reference images for Melon Zombies.
# Modelled in the BO1 China Lake (EX41) viewmodel's gun space (j_gun: x forward, y left, z up, inches), so
# .tools/assemble-grimhawk.mjs --gun havoc skins each part to the China Lake's skeleton and its pump-action animations
# drive it. The player sees the gun's left (+y) side from behind and above, so the detail is there. The hands set the
# layout: the left hand cups the pump from below at x 12-15 (z -2.3 and up), the right hand holds the wrist at x -6..-9.
# Parts are objects named part_<bone>:
#   j_gun          receiver, barrel, rail, tan bracket, detonator receiver, mag tube, trigger, stock
#   j_pump         the pump (slides on the mag tube; the reload animations and havoc.js's fire pump move it)
#   tag_clip       the grenade in the hand during a reload
#   tag_hv_cap     the mag tube's teal end cap (replaced by the MFS Airstrike Mag / Extended Tube)
#   tag_hv_grip    the pistol grip (replaced by the Actuator / Redwell Dash grips)
#   tag_hv_*       the attachments, hidden by tag until fitted
#   blender -b -P .tools/build-havoc.py -- <out.glb> [--render <dir>]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/havoc_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None

AMMO = {   # ammo mods: the colour of the shells in the side saddle (head, glowing band)
    'napalm': ('#b4401a', '#ff6a1a'), 'cryo': ('#a9dcef', '#7fe8ff'), 'arc': ('#33389c', '#8fa0ff'),
    'cluster': ('#c9a227', '#ffd23a'), 'singularity': ('#1d1128', '#c45cff'),
}
PARTS.update({k: [] for k in ('j_gun', 'j_pump', 'tag_clip', 'tag_hv_cap', 'tag_hv_grip', 'tag_hv_ballistic', 'tag_hv_prox',
                              'tag_hv_daisy', 'tag_hv_kinetic', 'tag_hv_mortar', 'tag_hv_airstrike', 'tag_hv_extube',
                              'tag_hv_tripwire', 'tag_hv_actuator', 'tag_hv_dash', 'tag_hv_bandolier', 'tag_hv_breacher',
                              'tag_laser_box', *('tag_hv_' + a for a in AMMO))})
M.update(
    gun=worn('hv_gunmetal', '#4a4f55', .42, .65, bare='#a6abb1', wear=.55, chips=.3, under='#2c2f33', mottle=.3, dirt=.35, rust=.08),
    barrel=worn('hv_barrel', '#2d3135', .38, .75, bare='#8f949a', wear=.5, dirt=.35, rust=.12, brushed=.5),
    poly=worn('hv_polymer', '#1e2023', .72, 0, bare='#3e4146', wear=.3, bare_metal=False, mottle=.35, dirt=.4),
    tan=worn('hv_tan', '#9a8156', .45, .45, bare='#cdb58c', wear=.5, chips=.35, under='#58504a', mottle=.3, dirt=.3),
    teal=worn('hv_teal', '#2b8a86', .4, .35, bare='#a3d8d2', wear=.45, chips=.45, under='#2c3034', dirt=.25),
    steel=worn('hv_steel', '#5a5e63', .32, 1, bare='#a0a4aa', wear=.5, dirt=.25, rust=.15),
    rubber=worn('hv_rubber', '#141414', .9, 0, bare='#272727', wear=.2, bare_metal=False, dirt=.35),
    label=worn('hv_label', '#cfd2d4', .5, .1, bare='#e6e8ea', wear=.25, chips=.25, under='#7d8186', dirt=.3),
    yellow=worn('hv_yellow', '#d7a21e', .5, .1, bare='#e9c76a', wear=.35, chips=.4, under='#4a4f55', dirt=.25),
    orange=worn('hv_orange', '#c8561c', .5, .1, bare='#e08a52', wear=.35, chips=.4, under='#2d3135', dirt=.25),
    brass=worn('hv_brass', '#a98339', .3, 1, bare='#dcb86c', wear=.3, dirt=.2),
    copper=worn('hv_copper', '#a8622f', .32, 1, bare='#de9a64', wear=.35, dirt=.2),
    webbing=worn('hv_webbing', '#3d3a2e', .95, 0, bare='#5a5644', wear=.25, bare_metal=False, mottle=.5, dirt=.45),
    led=mat('hv_led', '#300000', .3, 0, '#ff2a1a', 8),          # the sticky round's arming light, the laser
    green=mat('hv_led_green', '#002a08', .3, 0, '#3dff6a', 6),   # the detonator receiver's link light
    screen=mat('hv_screen', '#03180a', .25, 0, '#1fd765', 1.4),  # Ballistic Computer's display
    trace=mat('hv_trace', '#063015', .3, 0, '#7dffb0', 6),       # the arc drawn on it
    amber=mat('hv_amber', '#301800', .3, 0, '#ffa21a', 5),       # Daisy Chain's slits
    ice=mat('hv_ice', '#0a2a33', .3, 0, '#8ff0ff', 4),
    ink_w=mat('hv_ink_white', '#d6d8d4', .6, 0), ink_k=mat('hv_ink_black', '#141414', .6, 0), ink_y=mat('hv_ink_yellow', '#d7a21e', .55, 0),
    **{f'head_{a}': worn(f'hv_head_{a}', h, .45, .2, bare='#b8bcc0', wear=.3, chips=.25, under='#55595e', dirt=.25) for a, (h, _) in AMMO.items()},
    **{f'band_{a}': mat(f'hv_band_{a}', '#101010', .3, 0, g, 5) for a, (_, g) in AMMO.items()},
)
BAKED = ('gun', 'barrel', 'poly', 'tan', 'teal', 'steel', 'rubber', 'label', 'yellow', 'orange', 'brass', 'copper', 'webbing',
         *(f'head_{a}' for a in AMMO))
STENCIL = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'

BZ, BR = 2.0, 1.5       # barrel axis height and radius (40 mm bore)
MZ, MR = -1.05, 1.12    # mag tube axis height and radius (under the barrel, through the pump)
RAIL = 3.95             # rail top
PX0, PX1 = 4.6, 15.4    # the pump's length (the left hand holds its front half)


def ring(name, r_out, r_in, x0, x1, m, part='j_gun', z=BZ, y=0., seg=40, bw=.03):
    """A band around the x axis (a tube from r_in to r_out)."""
    return solid(name, cylbm(r_out, x0, x1, z, y, seg), m, part=part, cuts=[cylbm(r_in, x0 - .1, x1 + .1, z, y, seg)], bw=bw, seg=1)


def axis_rot(bm, ang_deg, pivot):
    """Turn a bmesh about the y axis through pivot (x, z): positive tips its top back (towards -x)."""
    bm.transform(Matrix.Translation((pivot[0], 0, pivot[1])) @ Matrix.Rotation(math.radians(-ang_deg), 4, 'Y') @ Matrix.Translation((-pivot[0], 0, -pivot[1])))
    return bm


def seg_cyl(r, p0, p1, seg=16, r2=None):
    """A cylinder from point p0 to p1 (x, y, z)."""
    a, b = Vector(p0), Vector(p1); d = b - a
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=d.length)
    bm.transform(Matrix.Translation((a + b) / 2) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
    return bm


def about_x(bm, ang, z, y=0.):
    """Turn a bmesh built around the x axis by ang (radians) about the axis at (y, z)."""
    bm.transform(Matrix.Translation((0, y, z)) @ Matrix.Rotation(ang, 4, 'X')); return bm


def shell(part, x0, y, z, r, head, band, length=4.2, case=1.5):
    """A 40 mm round lying along x from x0: brass case, coloured head with a glowing band, a blunt ogive nose."""
    solid('case', cylbm(r, x0, x0 + case, z, y, seg=20), M['brass'], part=part, bw=.03, seg=1)
    solid('rim', cylbm(r + .06, x0 - .1, x0 + .05, z, y, seg=20), M['brass'], part=part, bw=.02, seg=1)
    solid('head', cylbm(r * .97, x0 + case, x0 + length - .7, z, y, seg=20), M[head], part=part, bw=.03, seg=1)
    solid('nose', cylbm(r * .97, x0 + length - .7, x0 + length, z, y, seg=20, r2=r * .45), M[head], part=part, bw=.05, seg=2)
    solid('band', cylbm(r + .015, x0 + case + .2, x0 + case + .38, z, y, seg=20), M[band], part=part, bw=0)


# ---------------------------------------------------------------- receiver
rcv = prism(fillet([(1.6, 3.6), (-9.0, 3.6), (-9.8, 3.0), (-9.8, -0.4), (-9.2, -0.9), (-3.4, -0.9), (-3.0, -2.6), (1.6, -2.6)], .3), -1.45, 1.45)
rcv_cuts = [boxbm(-1.6, 1.0, -.75, .75, -2.8, -1.9),                       # the loading port (the grenade goes in from below)
            prism(rrect_xz(-8.5, -4.9, 2.2, 3.25, .2), 1.37, 2),            # REDWELL panel recess
            prism(rrect_xz(-8.5, -4.9, 2.2, 3.25, .2), -2, -1.37),
            prism(rrect_xz(-3.0, 1.2, -2.35, -0.25, .25), 1.38, 2),         # the side-saddle recess (ammo mods clip in here)
            ] + [boxbm(-9.2, -3.8, -2, 2, z, z + .07) for z in (.35, .75)]  # panel lines over the grip
solid('receiver', rcv, M['gun'], cuts=rcv_cuts, bw=.07, seg=3)
solid('rw_plate', prism(rrect_xz(-8.4, -5.0, 2.3, 3.15, .15), 1.37, 1.44), M['gun'], bw=.02)
text('REDWELL', .46, (-6.7, 1.45, 2.72), side=1, m=M['ink_w'], font=STENCIL)
text('REDWELL', .46, (-6.7, -1.45, 2.72), side=-1, m=M['ink_w'], font=STENCIL)
solid('data_plate', prism(rrect_xz(-8.4, -5.3, -0.55, 1.75, .12), 1.43, 1.5), M['label'], bw=.02)
for i, (s, z, sz) in enumerate((('GDL HAVOC', 1.35, .27), ('40x46MM  SR', .95, .2), ('SER 0842-RW', .62, .19), ('DET LINK 2.4GHZ', .3, .16))):
    text(s, sz, (-6.85, 1.51, z), side=1, m=M['ink_k'], font=STENCIL)
solid('qr', boxbm(-8.2, -7.6, 1.5, 1.52, -.42, .18), M['ink_k'], bw=0)        # a little square code tag in the corner
for x, z in ((-8.1, 1.6), (-5.6, 1.6), (-8.1, -.4), (-5.6, -.4)):
    solid('pscrew', screw(x, 1.5, z, .07, .04, seg=6), M['steel'], bw=0)
solid('saddle_bed', prism(rrect_xz(-2.9, 1.1, -2.25, -0.35, .2), 1.3, 1.4), M['poly'], bw=.02)   # the empty side saddle
for x in (-2.3, -0.9, 0.5):
    solid('bed_rib', boxbm(x, x + .25, 1.38, 1.46, -2.15, -.45), M['poly'], bw=.02, seg=1)
for x, z in ((-1.5, .55), (-8.9, 2.65), (-9.2, -.2)):   # takedown pins
    for s in (1, -1):
        solid('pin', screw(x, s * 1.46, z, .2, .06), M['steel'], bw=.02, seg=1)
        solid('pin_c', screw(x, s * 1.5, z, .09, .04), M['gun'], bw=0)
solid('selector', prism(fillet([(-4.4, -0.2), (-3.4, -0.05), (-3.4, 0.25), (-4.4, 0.3)], .1), 1.45, 1.6), M['teal'], bw=.03)
solid('selector_hub', screw(-4.4, 1.55, .05, .28, .12), M['gun'], bw=.03)
text('S', .2, (-3.85, 1.46, .6), side=1, m=M['ink_w']); text('F', .2, (-3.2, 1.46, .6), side=1, m=M['ink_y'])
# the action cover on the right: an ejection door for the spent cases
solid('eject_door', prism(rrect_xz(-2.9, 0.9, 0.3, 2.3, .2), -1.53, -1.44), M['gun'], bw=.03)

# trigger and guard
solid('guard', prism(fillet([(-2.6, -2.3), (-2.9, -3.3), (-6.7, -3.3), (-6.7, -2.95), (-3.3, -2.95), (-3.0, -2.3)], .15), -.32, .32), M['gun'], bw=.06)
solid('trigger', prism(fillet([(-3.7, -0.9), (-4.15, -0.9), (-4.4, -2.0), (-4.05, -2.65), (-3.85, -2.55), (-3.95, -1.95)], .1), -.16, .16), M['steel'], bw=.04)

# ---------------------------------------------------------------- barrel, mag tube and the tan bracket
solid('barrel', cylbm(BR, 1.0, 18.6, BZ, seg=40), M['barrel'], cuts=[cylbm(.82, 15, 22, BZ, seg=32)], bw=.03, seg=1)
ring('collar', BR + .12, .82, 18.6, 20.3, M['barrel'], bw=.06)
ring('crown', BR + .08, .9, 20.3, 20.9, M['teal'], bw=.08)
solid('bore', cylbm(.83, 15, 20.85, BZ, seg=32), M['rubber'], cuts=[cylbm(.8, 15.1, 21, BZ, seg=32)], bw=0)   # dark inside
for x in (14.6, 15.0):
    ring('joint', BR + .06, BR - .2, x, x + .25, M['gun'])
ring('rear_band', BR + .1, BR - .2, 1.6, 2.6, M['gun'], bw=.05)
solid('magtube', cylbm(MR, -0.3, 19.0, MZ, seg=32), M['gun'], bw=.03, seg=1)
solid('band_plate', prism(rrect_xz(17.4, 18.3, MZ - .5, BZ - .3, .25), -1.05, 1.05), M['gun'], bw=.05)   # holds the tube to the barrel
solid('band_screw', screw(17.85, 1.07, .45, .14, .06, seg=6), M['steel'], bw=0)
# the bracket: tan side plates with a triangular window, bridging the barrel's rear to the receiver
br = fillet([(4.6, 3.55), (-4.6, 3.55), (-4.6, 2.35), (-0.9, 0.15), (1.3, 0.15), (4.6, 2.1)], .3)
for s in (1, -1):
    solid('bracket', prism(br, s * 1.46, s * 1.64), M['tan'], cuts=[prism(fillet([(3.3, 3.1), (-0.4, 3.1), (1.5, 1.2)], .25), -3, 3)], bw=.05)
    for x, z in ((-3.9, 3.0), (3.9, 2.9), (0.2, .55)):
        solid('br_bolt', screw(x, s * 1.65, z, .12, .06, seg=6), M['steel'], bw=0)
solid('bridge', boxbm(-4.6, 4.6, -1.64, 1.64, 3.3, 3.6), M['tan'], bw=.05)
# rail along the top, on standoffs over the barrel
solid('rail', boxbm(-8.8, 18.4, -.52, .52, 3.6, RAIL - .12), M['tan'], bw=.04)
for k in range(66):
    x = -8.6 + k * .4
    solid('tooth', boxbm(x, x + .24, -.52, .52, RAIL - .14, RAIL), M['tan'], bw=.03, seg=1)
for x in (6.0, 9.5, 13.0):
    solid('standoff', boxbm(x, x + .9, -.55, .55, BZ + BR - .2, 3.62), M['gun'], bw=.04)
# front sight block: gunmetal with a tan cap and the yellow strip
solid('fs_block', boxbm(16.6, 19.6, -.78, .78, RAIL - .05, 4.75), M['gun'], cuts=[boxbm(17.1, 19.1, -1, 1, 4.1, 4.5)], bw=.06)
solid('fs_cap', boxbm(16.5, 19.7, -.82, .82, 4.75, 5.0), M['tan'], bw=.05)
solid('fs_strip', boxbm(16.42, 16.62, -.6, .6, 4.3, 4.6), M['yellow'], bw=.02)
solid('fs_label', prism(rrect_xz(17.2, 19.0, 4.12, 4.48, .05), .7, .8), M['label'], bw=0)
text('40', .22, (18.1, .8, 4.3), side=1, m=M['ink_k'], font=STENCIL)
# the detonator receiver on the rail: a boxy radio with a ribbed tan lid, a link light and a whip antenna
solid('det_base', boxbm(-3.8, 1.3, -.98, .98, RAIL, 4.75), M['gun'], bw=.08, seg=2)
solid('det_lid', boxbm(-3.9, 1.4, -1.02, 1.02, 4.75, 5.05), M['tan'], cuts=[boxbm(x, x + .14, -2, 2, 4.95, 5.2) for x in (-3.0, -2.5, -2.0, -1.5, -1.0, -.5, 0, .5)], bw=.04)
solid('det_dome', cylbm(.45, 1.3, 1.7, 4.35, seg=20, r2=.25), M['poly'], bw=.03)
solid('det_led', cylbm(.11, -3.86, -3.8, 4.45, y=.5, seg=12), M['green'], bw=0)
solid('det_led2', cylbm(.11, -3.86, -3.8, 4.45, y=.1, seg=12), M['led'], bw=0)
a_base = bmesh.new(); bmesh.ops.create_cone(a_base, cap_ends=True, segments=12, radius1=.17, radius2=.12, depth=.5)
a_base.transform(Matrix.Translation((-3.3, -.6, 5.3))); solid('ant_base', a_base, M['poly'], bw=0)
a_whip = bmesh.new(); bmesh.ops.create_cone(a_whip, cap_ends=True, segments=8, radius1=.05, radius2=.035, depth=2.0)
a_whip.transform(Matrix.Translation((-3.3, -.6, 6.5))); solid('ant_whip', a_whip, M['rubber'], bw=0)
a_tip = bmesh.new(); bmesh.ops.create_icosphere(a_tip, subdivisions=2, radius=.09); a_tip.transform(Matrix.Translation((-3.3, -.6, 7.5)))
solid('ant_tip', a_tip, M['orange'], bw=0)
solid('det_tag', prism(rrect_xz(-3.2, 0.6, 3.98, 4.6, .08), .98, 1.02), M['label'], bw=0)
text('RW-DET 7', .26, (-1.3, 1.03, 4.29), side=1, m=M['ink_k'], font=STENCIL)

# ---------------------------------------------------------------- stock (behind the eye: kept simple)
solid('buffer_cap', cylbm(.95, -10.8, -9.7, 1.6, seg=24), M['tan'], bw=.08)
solid('buffer', cylbm(.62, -15, -10.8, 1.6, seg=20), M['gun'], bw=.03)
stock = fillet([(-11.0, 2.6), (-20.0, 2.8), (-20.0, -3.1), (-18.7, -3.1), (-12.6, 0.15), (-11.0, 0.55)], .35)
solid('stock', prism(stock, -.72, .72), M['poly'], cuts=[prism(fillet([(-13.9, 1.75), (-18.6, 1.9), (-18.6, -1.55)], .4), -2, 2),
                                                       seg_cyl(.28, (-19.25, -2, 2.1), (-19.25, 2, 2.1))], bw=.12, seg=3)   # the sling hole
solid('buttpad', prism(fillet([(-20.0, 2.95), (-20.7, 2.95), (-20.7, -3.25), (-20.0, -3.25)], .2), -.95, .95), M['rubber'],
      cuts=[boxbm(-21, -20.5, -2, 2, z, z + .1) for z in (-2.4, -1.6, -.8, 0, .8, 1.6, 2.4)], bw=.1, seg=2)
solid('cheek', prism(fillet([(-12.0, 2.6), (-18.0, 2.75), (-18.0, 3.2), (-12.6, 3.05)], .2), -.6, .6), M['poly'], bw=.1)

# ---------------------------------------------------------------- the pump (j_pump)
P = 'j_pump'
pump_cuts = [cylbm(BR + .05, PX0 - 1, PX1 + 1, BZ, seg=40), cylbm(MR + .04, PX0 - 1, PX1 + 1, MZ, seg=32)]
for s in (1, -1):   # M-LOK slots down each side
    pump_cuts += [boxbm(x, x + 1.3, s * 1.3, s * 2.2, -1.85, -1.3) for x in (6.0, 7.8, 9.6, 11.4)]
solid('pump', prism(rrect_xz(PX0, PX1, -2.25, 0.95, .45), -1.62, 1.62), M['poly'], part=P, cuts=pump_cuts, bw=.1, seg=3)
solid('pump_lip_f', prism(fillet([(PX1 - .55, -2.2), (PX1, -2.2), (PX1, -2.75), (PX1 - .35, -2.75)], .12), -1.4, 1.4), M['poly'], part=P, bw=.08)
solid('pump_lip_r', prism(fillet([(PX0, -2.2), (PX0 + .5, -2.2), (PX0 + .35, -2.6), (PX0, -2.6)], .12), -1.4, 1.4), M['poly'], part=P, bw=.08)
for x in [6.2 + .55 * k for k in range(13)]:   # grip ribs under the palm
    solid('rib', boxbm(x, x + .22, -1.1, 1.1, -2.32, -2.2), M['poly'], part=P, bw=.03, seg=1)
solid('pump_tag', prism(rrect_xz(7.4, 11.6, .08, .62, .08), 1.5, 1.57), M['label'], part=P, bw=0)
text('LN-40MM-842', .25, (9.5, 1.58, .35), part=P, side=1, m=M['ink_k'], font=STENCIL)
text('RW', .3, (13.6, 1.63, .35), part=P, side=1, m=M['ink_w'], font=STENCIL)
for s in (1, -1):   # action bars into the receiver
    solid('action_bar', boxbm(-0.6, PX0 + .2, s * .98, s * 1.1, MZ - .18, MZ + .18), M['steel'], part=P, bw=.02, seg=1)

# ---------------------------------------------------------------- the stock cap (mag tube end) and grip
C = 'tag_hv_cap'
ring('cap', MR + .16, MR - .3, 19.0, 19.8, M['teal'], part=C, z=MZ, bw=.06)
solid('cap_face', cylbm(MR - .28, 19.1, 19.95, MZ, seg=28), M['poly'], part=C, bw=.06)
for k in range(12):
    a = math.radians(30 * k)
    solid('knurl', about_x(boxbm(19.05, 19.75, -.06, .06, MR + .1, MR + .22), a, MZ), M['teal'], part=C, bw=0)
G = 'tag_hv_grip'
grip = fillet([(-4.9, -0.75), (-8.5, -0.75), (-10.5, -5.3), (-10.1, -5.75), (-7.7, -5.75), (-7.45, -5.2), (-6.5, -3.3), (-5.6, -1.9)], .3)
grip_cuts = []
for i in range(4):          # stippled panels: rows of square dimples down the grip's rake
    t = .25 + .19 * i; cx, cz = -6.7 - 2.2 * t, -0.75 - 5.0 * t
    for j in (-1, 0, 1):
        for s in (1, -1):
            grip_cuts.append(boxbm(cx + j * .55 - .2, cx + j * .55 + .2, s * .62, s * 1, cz - .2, cz + .2))
solid('grip', prism(grip, -.72, .72), M['poly'], part=G, cuts=grip_cuts, bw=.15, seg=3)
solid('grip_cap', prism(fillet([(-10.15, -5.6), (-7.65, -5.6), (-7.6, -5.95), (-10.3, -5.95)], .12), -.74, .74), M['gun'], part=G, bw=.05)

# ---------------------------------------------------------------- the grenade in the hand (tag_clip): a sticky round
K = 'tag_clip'
solid('g_case', cylbm(.78, -0.7, 0.9, -4.7, seg=24), M['brass'], part=K, bw=.03, seg=1)
solid('g_rim', cylbm(.84, -0.75, -0.55, -4.7, seg=24), M['brass'], part=K, bw=.02, seg=1)
solid('g_body', cylbm(.76, 0.9, 2.5, -4.7, seg=24), M['teal'], part=K, bw=.04, seg=1)
solid('g_pad', cylbm(.76, 2.5, 3.1, -4.7, seg=24, r2=.5), M['rubber'], part=K, bw=.12, seg=3)   # the sticky foam nose
solid('g_led', cylbm(.775, 1.3, 1.45, -4.7, seg=24), M['led'], part=K, bw=0)
solid('g_ring', cylbm(.79, 2.2, 2.35, -4.7, seg=24), M['yellow'], part=K, bw=0)

# ---------------------------------------------------------------- attachments
# Ballistic Computer (optic): a tilted display on the rail drawing the round's arc; havoc.js draws the arc in the world
B = 'tag_hv_ballistic'
solid('bc_clamp', boxbm(4.7, 8.4, -.66, .66, RAIL - .25, RAIL + .3), M['gun'], part=B, bw=.05)
solid('bc_house', axis_rot(boxbm(5.4, 6.7, -1.3, 1.3, RAIL + .3, RAIL + 2.3), 14, (6.0, RAIL + .3)), M['poly'], part=B, bw=.1, seg=2)
solid('bc_hood', axis_rot(prism([(4.8, RAIL + 2.3), (5.45, RAIL + 2.3), (5.45, RAIL + 2.45), (4.8, RAIL + 2.45)], -1.3, 1.3), 14, (6.0, RAIL + .3)), M['poly'], part=B, bw=.03)
for s in (1, -1):
    solid('bc_side', axis_rot(prism([(4.85, RAIL + .55), (5.45, RAIL + .55), (5.45, RAIL + 2.35), (4.85, RAIL + 2.35)], s * 1.2, s * 1.3), 14, (6.0, RAIL + .3)), M['poly'], part=B, bw=.02)
solid('bc_screen', axis_rot(boxbm(5.36, 5.42, -1.05, 1.05, RAIL + .6, RAIL + 2.1), 14, (6.0, RAIL + .3)), M['screen'], part=B, bw=0)
for k in range(9):   # the arc on the screen: a parabola of little dashes, and the impact ring
    u = k / 8; y = .85 - 1.6 * u; z = RAIL + .85 + 1.0 * (1 - (2 * u - .7) ** 2 / .49 * .7)
    solid('bc_arc', axis_rot(boxbm(5.33, 5.36, y - .06, y + .06, z - .03, z + .03), 14, (6.0, RAIL + .3)), M['trace'], part=B, bw=0)
solid('bc_mark', axis_rot(boxbm(5.33, 5.36, -.9, -.6, RAIL + .72, RAIL + .78), 14, (6.0, RAIL + .3)), M['led'], part=B, bw=0)
text('BC-40', .24, (6.3, 1.31, RAIL + 1.3), part=B, side=1, m=M['ink_w'], font=STENCIL)
solid('bc_knob', screw(7.0, 1.4, RAIL + .9, .22, .2), M['steel'], part=B, bw=.03)

# Proximity Fuse Ring (muzzle): a sensor collar with six seeker eyes; stuck rounds become mines
PR = 'tag_hv_prox'
ring('pr_body', BR + .34, .95, 20.0, 21.6, M['gun'], part=PR, bw=.08)
ring('pr_glow', BR + .3, .95, 21.45, 21.62, M['led'], part=PR, bw=0)
for k in range(6):
    a = math.radians(30 + 60 * k)
    eye = cylbm(.2, 0, .3, 0, seg=12); eye.transform(Matrix.Translation((20.8, 0, BZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, BR + .38)) @ Matrix.Rotation(math.radians(-90), 4, 'Y') @ Matrix.Translation((-.15, 0, 0)))
    solid('pr_eye', eye, M['gun'], part=PR, bw=.02, seg=1)
    lens = cylbm(.12, 0, .05, 0, seg=12); lens.transform(Matrix.Translation((20.8, 0, BZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, BR + .54)) @ Matrix.Rotation(math.radians(-90), 4, 'Y'))
    solid('pr_lens', lens, M['led'], part=PR, bw=0)
text('PROX', .22, (20.8, BR + .1, BZ + 1.4), part=PR, side=1, m=M['ink_y'], font=STENCIL, tilt=45)

# Daisy Chain Coupler (muzzle): three linked collars with amber slits; detonations ripple round to round
DC = 'tag_hv_daisy'
for x in (20.1, 20.95, 21.8):
    ring('dc_collar', BR + .3, .9, x, x + .55, M['tan' if x > 21 else 'gun'], part=DC, bw=.06)
    if x < 21.8: ring('dc_slit', BR + .2, .9, x + .55, x + .85, M['amber'], part=DC, bw=0)
for k in range(3):
    a = math.radians(120 * k + 30)
    rod = cylbm(.09, 20.1, 22.35, 0, seg=8); rod.transform(Matrix.Translation((0, 0, BZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, BR + .38)))
    solid('dc_rod', rod, M['steel'], part=DC, bw=0)

# Kinetic Coil Sleeve (barrel): bare copper coils on the barrel ahead of the pump and a slotted top shroud
KC = 'tag_hv_kinetic'
for k in range(9):
    x = 15.7 + k * .31
    ring('kc_coil', BR + .26, BR - .05, x, x + .2, M['copper'], part=KC, bw=.03)
solid('kc_shroud', cylbm(BR + .3, 6.0, 15.65, BZ, seg=40), M['gun'], part=KC,
      cuts=[cylbm(BR + .02, 5, 17, BZ, seg=40), boxbm(5, 17, -3, 3, BZ - 3, BZ + .25)] + [boxbm(x, x + .7, -3, 3, BZ + .7, BZ + 3) for x in (7.0, 8.4, 9.8, 11.2, 12.6)], bw=.05)
for x in (7.0, 8.4, 9.8, 11.2, 12.6):   # copper showing through the slots
    ring('kc_inner', BR + .06, BR - .05, x + .05, x + .65, M['copper'], part=KC, bw=0)
for s in (1, -1):
    solid('kc_lead', cylbm(.1, 6.2, 15.7, BZ + .25, y=s * (BR + .2), seg=8), M['orange'], part=KC, bw=0)
text('KINETIC', .24, (11.5, BR + .32, BZ + .75), part=KC, side=1, m=M['ink_y'], font=STENCIL, tilt=40)

# Mortar Tube (barrel): a heavy finned sleeve and an elevation quadrant with a bubble level
MT = 'tag_hv_mortar'
ring('mt_sleeve', BR + .32, BR - .05, 15.6, 19.9, M['gun'], part=MT, bw=.08)
for k in range(8):
    a = math.radians(22.5 + 45 * k)
    if math.sin(a) < -.5: continue   # none into the mag tube below
    fin = prism([(16.0, 0), (19.4, 0), (19.0, .55), (16.4, .55)], -.07, .07)
    fin.transform(Matrix.Translation((0, 0, BZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, BR + .3)))
    solid('mt_fin', fin, M['gun'], part=MT, bw=.02)
quad = [(11.0, BZ + 1.2)] + [(11.0 + 2.6 * math.cos(math.radians(d)), BZ + 1.2 + 1.5 * math.sin(math.radians(d))) for d in range(0, 91, 10)]
solid('mt_quad', prism(quad, BR + .05, BR + .16), M['tan'], part=MT, bw=.02)
for d in range(0, 91, 15):   # tick marks
    c, s_ = math.cos(math.radians(d)), math.sin(math.radians(d))
    solid('mt_tick', boxbm(11.0 + 2.2 * c - .03, 11.0 + 2.2 * c + .03, BR + .16, BR + .18, BZ + 1.2 + 1.3 * s_ - .12, BZ + 1.2 + 1.3 * s_ + .12), M['ink_k'], part=MT, bw=0)
solid('mt_vial', cylbm(.14, 11.4, 12.6, BZ + 1.5, y=BR + .28, seg=12), M['ice'], part=MT, bw=0)

# MFS Airstrike Mag (BO7's prestige magazine): a long finned airburst cap on the tube
AS = 'tag_hv_airstrike'
ring('as_cap', MR + .2, MR - .3, 19.0, 21.3, M['teal'], part=AS, z=MZ, bw=.06)
solid('as_face', cylbm(MR - .28, 19.1, 21.45, MZ, seg=28, r2=MR - .45), M['poly'], part=AS, bw=.06)
solid('as_band', cylbm(MR + .22, 20.0, 20.2, MZ, seg=28), M['orange'], part=AS, bw=.02, seg=1)
for k in range(4):
    a = math.radians(45 + 90 * k)
    fin = prism([(19.2, 0), (21.1, 0), (20.9, .45), (19.6, .45)], -.06, .06)
    fin.transform(Matrix.Translation((0, 0, MZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, MR + .18)))
    solid('as_fin', fin, M['steel'], part=AS, bw=.02)
text('MFS', .3, (20.6, MR + .23, MZ + .1), part=AS, side=1, m=M['ink_w'], font=STENCIL)

# Extended Tube (mag): the tube runs on past the muzzle, with a clamp and the teal cap at the end
ET = 'tag_hv_extube'
solid('et_tube', cylbm(MR, 18.9, 23.6, MZ, seg=32), M['gun'], part=ET, bw=.03, seg=1)
ring('et_clamp', MR + .14, MR - .1, 21.6, 22.1, M['tan'], part=ET, z=MZ, bw=.04)
ring('et_cap', MR + .16, MR - .3, 23.6, 24.4, M['teal'], part=ET, z=MZ, bw=.06)
solid('et_face', cylbm(MR - .28, 23.7, 24.55, MZ, seg=28), M['poly'], part=ET, bw=.06)

# Tripwire Spool (underbarrel): a spool of laser line under the tube; havoc.js strings it between stuck rounds
TW = 'tag_hv_tripwire'
ring('tw_clamp', MR + .15, MR - .05, 16.1, 16.7, M['gun'], part=TW, z=MZ, bw=.04)
ring('tw_clamp2', MR + .15, MR - .05, 18.0, 18.6, M['gun'], part=TW, z=MZ, bw=.04)
solid('tw_arm', boxbm(16.1, 18.6, -.45, .45, MZ - MR - .9, MZ - MR + .1), M['gun'], part=TW, bw=.06)
solid('tw_drum', seg_cyl(.8, (17.35, -.6, MZ - MR - 1.2), (17.35, .6, MZ - MR - 1.2), seg=24), M['orange'], part=TW, bw=.05)
solid('tw_line', seg_cyl(.84, (17.35, -.4, MZ - MR - 1.2), (17.35, .4, MZ - MR - 1.2), seg=24), M['led'], part=TW, bw=0)   # the wound line
solid('tw_eye', cylbm(.12, 18.6, 18.75, MZ - MR - .5, seg=12), M['led'], part=TW, bw=0)

# Actuator Grip (BO7 rear grip): a pistol grip with a hydraulic ram down its back strap
AC = 'tag_hv_actuator'
ag = fillet([(-4.9, -0.75), (-8.3, -0.75), (-9.9, -5.4), (-9.5, -5.8), (-7.3, -5.8), (-7.1, -5.1), (-6.7, -4.4), (-6.9, -3.7), (-6.3, -3.0), (-6.4, -2.3), (-5.6, -1.6)], .25)
solid('ag_grip', prism(ag, -.72, .72), M['poly'], part=AC, bw=.15, seg=3)
R0, RD = Vector((-8.75, 0, -1.1)), Vector((-.325, 0, -.946))   # down the back strap
solid('ag_ram', seg_cyl(.24, R0, R0 + RD * 4.3), M['steel'], part=AC, bw=.02)
solid('ag_body', seg_cyl(.32, R0 + RD * .3, R0 + RD * 2.2), M['gun'], part=AC, bw=.03)
for t in (.6, 1.9):
    solid('ag_ring', seg_cyl(.36, R0 + RD * t, R0 + RD * (t + .2)), M['orange'], part=AC, bw=.02)
solid('ag_plate', prism(rrect_xz(-8.0, -6.5, -4.6, -2.2, .2), .72, .78), M['orange'], part=AC, bw=.02)
text('ACT', .22, (-7.25, .79, -3.4), part=AC, side=1, m=M['ink_k'], font=STENCIL)

# Redwell Dash Grip (BO7 rear grip): a slim skeleton grip with tan inserts
DG = 'tag_hv_dash'
dg = fillet([(-4.9, -0.75), (-8.0, -0.75), (-9.6, -5.3), (-9.3, -5.65), (-7.6, -5.65), (-7.3, -5.0), (-5.6, -1.9)], .25)
solid('dg_grip', prism(dg, -.6, .6), M['gun'], part=DG, cuts=[prism(fillet([(-6.9, -1.6), (-7.7, -1.6), (-8.8, -4.7), (-8.0, -4.7)], .3), -1, 1)], bw=.12, seg=3)
solid('dg_insert', prism(fillet([(-6.85, -1.7), (-7.65, -1.7), (-8.7, -4.6), (-8.05, -4.6)], .25), -.35, .35), M['tan'], part=DG, bw=.08)
text('DASH', .2, (-6.3, .61, -1.3), part=DG, side=1, m=M['ink_y'], font=STENCIL)

# Bandolier Stock (stock): webbing with four spare rounds on the stock's left
BD = 'tag_hv_bandolier'
solid('bd_web', prism(fillet([(-19.6, 0.4), (-13.2, 0.75), (-13.2, 2.45), (-19.6, 2.55)], .2), .72, .86), M['webbing'], part=BD, bw=.04)
for i, x in enumerate((-18.8, -17.4, -16.0, -14.6)):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=.5, radius2=.5, depth=1.2)
    bm.transform(Matrix.Translation((x, 1.38, 0.55)))
    solid('bd_case', bm, M['brass'], part=BD, bw=.03, seg=1)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=.48, radius2=.24, depth=1.4)
    bm.transform(Matrix.Translation((x, 1.38, 1.85)))
    solid('bd_head', bm, M['teal'], part=BD, bw=.05, seg=2)
    solid('bd_loop', boxbm(x - .62, x + .62, .86, 1.95, 1.0, 1.4), M['webbing'], part=BD, bw=.05)

# Breacher Stock (stock): twin pistons behind a fat recoil pad (and a blast-jump in havoc.js)
BS = 'tag_hv_breacher'
for s in (1, -1):
    solid('bs_piston', cylbm(.3, -20.9, -15.5, 1.3, y=s * .95, seg=16), M['steel'], part=BS, bw=.02)
    solid('bs_sleeve', cylbm(.4, -17.8, -15.4, 1.3, y=s * .95, seg=16), M['orange'], part=BS, bw=.04)
solid('bs_pad', prism(fillet([(-20.6, 3.3), (-22.0, 3.3), (-22.0, -3.6), (-20.6, -3.6)], .45), -1.25, 1.25), M['rubber'], part=BS,
      cuts=[boxbm(-22.3, -21.7, -2, 2, z, z + .14) for z in (-2.8, -1.8, -.8, .2, 1.2, 2.2)], bw=.25, seg=3)
solid('bs_stripe', prism([(-16.2, -.25), (-15.6, -.25), (-15.6, .25), (-16.2, .25)], .74, .8), M['yellow'], part=BS, bw=0)

# ammo mods: two colour-coded rounds in the side saddle
for a in AMMO:
    T = 'tag_hv_' + a
    for z in (-1.75, -0.85):
        shell(T, -2.8, 1.98, z, .43, f'head_{a}', f'band_{a}', length=3.8, case=1.3)
    for x in (-2.1, 0.0):
        solid('strap', boxbm(x, x + .45, 1.36, 2.48, -2.3, -0.3), M['poly'], part=T, bw=.06, seg=2)
    text(a.upper()[:5], .16, (-1.0, 2.49, -1.3), part=T, side=1, m=M['ink_w'], font=STENCIL)

# Laser (the shared Laser Sight attachment): a box on the barrel's right
LS = 'tag_laser_box'
solid('ls_box', prism(fillet([(11.6, BZ + .1), (14.4, BZ + .1), (14.4, BZ + 1.0), (11.6, BZ + 1.0)], .2), -(BR + .75), -(BR - .1)), M['gun'], part=LS, bw=.08, seg=3)
solid('ls_lens', cylbm(.2, 14.38, 14.44, BZ + .55, y=-(BR + .4), seg=16), M['led'], part=LS, bw=0)

export(OUT, RENDER, 'hv', BAKED, tex=4096, frame=(0, 0, 0.5), ortho=48)

if RENDER:   # close-ups of the bare gun (no attachments) and the hip view
    sc = bpy.context.scene; co = sc.camera
    bare = ('part_tag_clip', 'part_tag_hv_cap', 'part_tag_hv_grip')
    for o in bpy.data.objects:
        if o.name.startswith('part_tag_') and o.name not in bare: o.hide_render = True
    for name, (x, z, sc_) in (('close_rcv', (-3.0, 1.0, 13)), ('close_front', (13.0, 1.0, 14))):
        co.location = (x, 60, z); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = sc_
        sc.render.filepath = f'{RENDER}/hv_{name}.png'; bpy.ops.render.render(write_still=True)
    co.location = (-30, 26, 16)   # roughly the player's view: from behind, left and above
    co.rotation_euler = (Vector((6, 0, 0)) - co.location).to_track_quat('-Z', 'Z').to_euler(); co.data.ortho_scale = 30
    sc.render.filepath = f'{RENDER}/hv_close_hip.png'; bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:   # every attachment on at once (overlapping alternatives included), for a look
        if o.name.startswith('part_tag_'): o.hide_render = o.name in ('part_tag_hv_cap', 'part_tag_hv_grip')
    co.location = (2, 60, 0); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = 50
    sc.render.filepath = f'{RENDER}/hv_all.png'; bpy.ops.render.render(write_still=True)

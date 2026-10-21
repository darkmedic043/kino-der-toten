# The ROC 20mm (Black Ops 7's semi-auto 20 mm cannon, a Season 6 Special), rebuilt from the season's announcement render
# for Melon Zombies. Modelled in the BO1 M16 viewmodel's gun space (j_gun: x forward, y left, z up, inches) like the
# Siren, so .tools/assemble-grimhawk.mjs --gun roc skins each part to the M16 skeleton. The player sees the gun's left
# (+y) side. Parts are objects named part_<bone>:
#   j_gun          olive upper, black lower and handguard, top rail, barrel, trigger
#   tag_clip       the ribbed 5-round box magazine (moved by the reload)
#   tag_iron_sight flip-up irons at both ends of the rail (folded away by an optic, ironSights in attachments.json)
#   tag_ro_grip    the pistol grip (replaced by the Damper / Snap grips)
#   tag_ro_stock   the recoil stock (replaced by the Buffer / Kick stocks)
#   tag_ro_brake   the hexagonal double-port muzzle brake (replaced by the muzzle attachments)
#   tag_ro_*       the attachments, hidden by tag until fitted
#   blender -b -P .tools/build-roc.py -- <out.glb> [--render <dir>]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *
import bo7lib

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/roc_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None

AMMO = ('he', 'sabot', 'thermite', 'flak', 'shock', 'canister', 'mark')
PARTS.update({k: [] for k in ('j_gun', 'tag_clip', 'tag_iron_sight', 'tag_ro_grip', 'tag_ro_stock', 'tag_ro_brake',
                              'tag_ro_gunner', 'tag_ro_reflex', 'tag_ro_concuss', 'tag_ro_hush', 'tag_ro_tungsten',
                              'tag_ro_mfs', 'tag_ext_clip', 'tag_double_clip', 'tag_ro_damper', 'tag_ro_snap', 'tag_ro_buffer', 'tag_ro_kick',
                              'tag_ro_bipod', 'tag_foregrip', 'tag_laser_box') + tuple('tag_ro_' + a for a in AMMO)})
M.update(
    # a field cannon in service: olive enamel worn and chipped to grey primer and bare steel, black polymer, blued steel
    olive=worn('ro_olive', '#86836a', .58, .1, bare='#b5b6aa', wear=.5, chips=.45, under='#4b4c45', mottle=.45, dirt=.45, rust=.1),
    black=worn('ro_black', '#2a2c2e', .5, .2, bare='#8f959b', wear=.55, chips=.3, under='#46484b', mottle=.3, dirt=.4, rust=.15),
    poly=worn('ro_poly', '#1d1e20', .72, 0, bare='#55585c', wear=.35, bare_metal=False, mottle=.35, dirt=.4),
    steel=worn('ro_steel', '#4c5155', .35, 1, bare='#a0a6ac', wear=.55, dirt=.25, rust=.2),
    gunmetal=worn('ro_gunmetal', '#2c3134', .38, .95, bare='#929aa0', wear=.45, brushed=.7, dirt=.3, rust=.1),   # barrel
    brake=worn('ro_brakemetal', '#3f4b4d', .3, 1, bare='#a9b4b6', wear=.5, brushed=.5, dirt=.35, rust=.2),       # the teal-sheened brake
    rubber=worn('ro_rubber', '#141414', .9, 0, bare='#2a2a2a', wear=.2, bare_metal=False, dirt=.35),
    brass=worn('ro_brass', '#a8843c', .32, 1, bare='#dcb86c', wear=.3, dirt=.2),
    copper=worn('ro_copper', '#a3602e', .32, 1, bare='#dc9a62', wear=.35, dirt=.2),
    yellow=worn('ro_yellow', '#c79a1c', .55, 0, bare='#9a9da0', wear=.45, chips=.5, under='#3e3f40', dirt=.3),
    red=worn('ro_red', '#8c1d16', .5, 0, bare='#a9abad', wear=.45, chips=.5, under='#3e3f40', dirt=.3),
    label=worn('ro_label', '#c9c6b5', .5, .1, bare='#e0dfd6', wear=.25, chips=.2, under='#7c7d78', dirt=.35),
    tungsten=worn('ro_tungsten', '#3a3d40', .3, 1, bare='#b8bec4', wear=.3, brushed=.8),
    bore=mat('ro_bore', '#060606', .6, 0),
    glass=mat('ro_glass', '#a9d6e6', .05, 0, alpha=.1),
    lens=mat('reflex_lens_ro', '#a9e6c4', .05, 0, alpha=.08),   # named so the scopes mod treats it as a reflex lens
    dot=mat('ro_dot', '#300000', .3, 0, '#ff2a1a', 12),
    rail=mat('ro_rail_glow', '#04202a', .3, 0, '#3ce0ff', 3),    # Tungsten Rail Barrel's charge gap
    shock=mat('ro_shock_glow', '#041a3a', .3, 0, '#5aa8ff', 4),
    tracer=mat('ro_tracer_glow', '#3a1200', .3, 0, '#ff7a1a', 4),
    fuze=mat('ro_fuze_glow', '#2a2000', .3, 0, '#ffd23a', 2),
    # the lettering stays out of the bake (glyphs that small lose strokes in the atlas)
    ink_w=mat('ro_ink_white', '#d4d0be', .6, 0), ink_k=mat('ro_ink_black', '#141414', .6, 0), ink_y=mat('ro_ink_yellow', '#d6a92a', .6, 0),
)
BAKED = ('olive', 'black', 'poly', 'steel', 'gunmetal', 'brake', 'rubber', 'brass', 'copper', 'yellow', 'red', 'label', 'tungsten')
STENCIL = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'

SZ = 2.2          # bore axis height (the handguard is centred near it so the M16's left hand fits)
RAIL = 3.85       # rail top; the irons and the optics centre on z 5.2 (the M16 sight line)
SIGHT = 5.2
BR = .55          # barrel radius
BRAKE = (30.6, 34.9)


def vcyl(r, x, y, z0, z1, seg=16, r2=None):
    """An upright cylinder at (x, y) from z0 to z1."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0)
    bm.transform(Matrix.Translation((x, y, (z0 + z1) / 2))); return bm


def ring(name, r_out, r_in, x0, x1, m, part='j_gun', z=SZ, y=0., seg=40, bw=.03):
    """A band around the x axis (a tube from r_in to r_out)."""
    return solid(name, cylbm(r_out, x0, x1, z, y, seg), m, part=part, cuts=[cylbm(r_in, x0 - .1, x1 + .1, z, y, seg)], bw=bw, seg=1)


def bar(x0, z0, x1, z1, w, y0, y1):
    """A straight strip w wide from (x0, z0) to (x1, z1), across y0..y1."""
    dx, dz = x1 - x0, z1 - z0; L = math.hypot(dx, dz) or 1; nx, nz = -dz / L * w / 2, dx / L * w / 2
    return prism([(x0 + nx, z0 + nz), (x1 + nx, z1 + nz), (x1 - nx, z1 - nz), (x0 - nx, z0 - nz)], y0, y1)


def rail_teeth(x0, x1, y0, y1, z0, z1, part='j_gun', m='steel', step=.4, w=.24, axis_y=False):
    for k in range(int((x1 - x0) / step)):
        x = x0 + k * step
        solid('tooth', boxbm(x, x + w, y0, y1, z0, z1), M[m], part=part, bw=.03, seg=1)


def shell(part, z, tip, band=None, y=1.42, x0=-2.35, kind=''):
    """One 20 mm round lying along the saddle: brass case, a belt, and the projectile in the ammo's colours."""
    solid('case', cylbm(.27, x0, x0 + 2.0, z, y=y, seg=18), M['brass'], part=part, bw=.02, seg=1)
    solid('rim', cylbm(.3, x0 - .08, x0 + .06, z, y=y, seg=18), M['brass'], part=part, bw=.01, seg=1)
    if kind == 'sabot':   # a slim tungsten dart in a three-petal sabot, fins at the back
        solid('sabot', cylbm(.25, x0 + 2.0, x0 + 2.55, z, y=y, seg=18, r2=.2), M['black'], part=part, bw=.02, seg=1)
        solid('dart', cylbm(.08, x0 + 2.4, x0 + 3.55, z, y=y, seg=10, r2=.02), M['tungsten'], part=part, bw=0)
        ring('sabot_band', .255, .15, x0 + 2.1, x0 + 2.2, M['ink_w'], part=part, z=z, y=y, seg=18, bw=0)
        return
    if kind == 'canister':   # flat-nosed, holes in the nose cap, a green body
        solid('can', cylbm(.26, x0 + 2.0, x0 + 2.85, z, y=y, seg=18), M[tip], part=part, bw=.03, seg=1)
        solid('can_cap', cylbm(.2, x0 + 2.85, x0 + 2.92, z, y=y, seg=18), M['steel'], part=part, bw=.01, seg=1)
        return
    solid('proj', cylbm(.26, x0 + 2.0, x0 + 2.75, z, y=y, seg=18, r2=.18), M['steel'], part=part, bw=.02, seg=1)
    solid('nose', cylbm(.18, x0 + 2.75, x0 + 3.15, z, y=y, seg=18, r2=.03), M[tip], part=part, bw=0)
    if band: ring('pband', .27, .15, x0 + 2.25, x0 + 2.4, M[band], part=part, z=z, y=y, seg=18, bw=0)


# ---------------------------------------------------------------- upper receiver (olive), angular
up = prism(fillet([(-3.0, 3.4), (9.0, 3.4), (9.0, 1.7), (7.9, 1.0), (-2.4, 1.0), (-3.0, 1.55)], .15), -.95, .95)
up_cuts = [boxbm(2.2, 5.2, -2, -.8, 1.95, 2.85),                       # ejection port (right)
           boxbm(3.1, 7.9, .82, 2, 2.72, 3.06),                         # charging slot (left)
           bar(5.6, 1.0, 8.2, 2.35, .07, .9, 2),                        # panel lines on the left, like the render's
           bar(8.2, 2.35, 8.95, 2.35, .07, .9, 2), bar(-2.2, 2.45, 5.6, 2.45, .07, .9, 2),
           prism(rrect_xz(.7, 2.6, 1.3, 2.15, .12), .88, 2)]           # a recessed data plate
solid('upper', up, M['olive'], cuts=up_cuts, bw=.07, seg=3)
solid('port_cover', boxbm(2.3, 5.1, -.86, -.8, 2.0, 2.8), M['black'], bw=.01)
solid('bolt_face', boxbm(2.4, 5.0, -.82, -.7, 2.1, 2.7), M['steel'], bw=.01)
solid('handle_stem', boxbm(3.6, 4.1, .6, 1.25, 2.78, 3.0), M['steel'], bw=.03)
solid('handle', prism(fillet([(3.3, 2.7), (4.4, 2.7), (4.5, 3.1), (3.2, 3.1)], .1), 1.15, 1.55), M['black'], bw=.05)
solid('data_plate', prism(rrect_xz(.75, 2.55, 1.35, 2.1, .1), .88, .93), M['label'], bw=.01)
text('VAS', .26, (1.65, .94, 1.88), m=M['ink_k'], font=STENCIL)
text('ROC 20MM  S/N 0662', .1, (1.65, .94, 1.55), m=M['ink_k'], font=STENCIL)
text('VAS ARMS  CAL 20x102', .13, (5.2, .96, 3.22), m=M['ink_k'], font=STENCIL)
for x, z in ((-2.5, 1.3), (-2.5, 3.1), (8.6, 3.1), (6.2, 1.25)):
    solid('pin', screw(x, .97, z, .1, .05, seg=10), M['steel'], bw=0)

# ---------------------------------------------------------------- lower receiver (black), magwell, trigger
lo = prism(fillet([(-2.8, 1.05), (8.7, 1.05), (8.7, -0.95), (3.3, -0.95), (2.9, -0.15), (-2.3, -0.15), (-2.8, 0.35)], .12), -.82, .82)
solid('lower', lo, M['black'], cuts=[boxbm(x, x + .25, .7, 1, -.75, -.25) for x in (4.0, 4.5, 5.0)], bw=.06, seg=2)
solid('magwell_lip', prism(fillet([(3.25, -0.7), (8.85, -0.7), (8.95, -1.2), (3.15, -1.2)], .1), -.92, .92), M['black'],
      cuts=[boxbm(3.6, 8.5, -.72, .72, -1.5, -0.6)], bw=.04)
solid('mag_release', boxbm(2.85, 3.25, .8, .95, -.05, .35), M['steel'], bw=.02)
guard = prism([(-0.9, -0.1), (2.75, -0.1), (2.75, -0.6), (2.25, -1.0), (-0.5, -1.0), (-0.9, -0.6)], -.3, .3)
solid('guard', guard, M['black'], cuts=[prism(fillet([(-0.5, -.2), (2.35, -.2), (2.35, -.6), (2.05, -.75), (-.3, -.75), (-.5, -.5)], .2), -1, 1)], bw=.05)
solid('trigger', prism([(0.55, -0.1), (0.85, -0.1), (0.75, -0.55), (0.45, -0.62)], -.12, .12), M['steel'], bw=.03)
solid('selector', prism(fillet([(-1.4, .45), (-0.4, .62), (-0.4, .82), (-1.4, .75)], .08), .82, .95), M['steel'], bw=.02)
solid('sel_hub', screw(-1.25, .9, .6, .2, .12, seg=16), M['steel'], bw=.02)
text('S', .16, (-1.05, .84, .25), m=M['ink_w'], font=STENCIL); text('F', .16, (-0.55, .84, .25), m=M['red'], font=STENCIL)

# ---------------------------------------------------------------- handguard (black), rails
hg = prism(fillet([(8.6, 3.4), (17.6, 3.4), (18.1, 2.9), (18.1, 1.0), (17.6, 0.65), (8.6, 0.65)], .2), -1.0, 1.0)
hg_cuts = [prism(rrect_xz(9.8, 16.6, 2.55, 3.05, .2), .75, 2),          # the long window along the top left
           prism(rrect_xz(9.8, 16.6, 2.55, 3.05, .2), -2, -.75)]
hg_cuts += [prism(rrect_xz(x, x + .9, 1.05, 1.9, .2), -2, 2) for x in (15.1, 16.4)]   # cooling cuts low at the front
solid('handguard', hg, M['black'], cuts=hg_cuts, bw=.08, seg=3)
solid('hg_inner', boxbm(9.9, 16.5, -.78, .78, 2.5, 3.1), M['gunmetal'], bw=0)   # the barrel's jacket behind the windows
for s in (1, -1):   # short side rails, screwed on
    solid('side_rail', boxbm(10.6, 14.0, s * .98, s * 1.24, 1.5, 2.2), M['black'],
          cuts=[boxbm(x, x + .24, s * 1.1, s * 1.5, 1.4, 2.3) for x in [10.85 + .42 * k for k in range(8)]], bw=.03)
    for x in (10.75, 13.85):
        solid('rail_screw', screw(x, s * 1.25, 1.85, .08, .05), M['steel'], bw=0)
solid('bottom_rail', boxbm(9.4, 17.2, -.45, .45, 0.38, 0.7), M['black'], bw=.03)
rail_teeth(9.6, 17.1, -.45, .45, 0.22, 0.42, m='black')
solid('hg_cap', prism(fillet([(17.95, 3.0), (18.45, 2.75), (18.45, 1.25), (17.95, 1.0)], .1), -.9, .9), M['steel'], bw=.04)

# ---------------------------------------------------------------- top rail, full length
solid('rail', boxbm(-2.8, 17.5, -.52, .52, 3.4, RAIL - .12), M['black'], bw=.04)
rail_teeth(-2.65, 17.4, -.52, .52, RAIL - .14, RAIL, m='black')
text('1  2  3  4  5  6  7  8  9  10  11  12  13  14', .1, (7.2, .53, 3.56), m=M['ink_w'], font=STENCIL)

# ---------------------------------------------------------------- barrel: long and thin, a gas collar, stepped
solid('collar', cylbm(.95, 18.4, 19.2, SZ, seg=32), M['steel'], bw=.05, seg=2)
solid('nut', cylbm(.88, 19.2, 19.85, SZ, seg=6), M['steel'], bw=.04, seg=2)
solid('barrel', cylbm(BR, 19.8, 25.4, SZ, seg=28), M['gunmetal'], bw=.02)
solid('barrel_step', cylbm(BR + .04, 25.4, 25.7, SZ, seg=28, r2=BR - .05), M['gunmetal'], bw=.01)
solid('barrel_front', cylbm(BR - .05, 25.7, BRAKE[0] + .3, SZ, seg=28), M['gunmetal'], bw=.02)
for x in (21.0, 21.25):
    ring('barrel_band', BR + .02, BR - .2, x, x + .1, M['steel'], bw=0)
text('CAL 20MM', .2, (23.0, BR + .02, SZ + .05), m=M['ink_w'], font=STENCIL, tilt=0)

# ---------------------------------------------------------------- muzzle brake (tag_ro_brake): hexagonal, two big ports
BK = 'tag_ro_brake'
x0, x1 = BRAKE
solid('brake', cylbm(1.18, x0, x1, SZ, seg=6), M['brake'], part=BK,
      cuts=[boxbm(x0 + .95, x0 + 1.95, -2, 2, SZ - .82, SZ + .82), boxbm(x0 + 2.45, x0 + 3.45, -2, 2, SZ - .82, SZ + .82),
            cylbm(.55, x0 - .2, x1 + .2, SZ, seg=24), cylbm(.92, x1 - .35, x1 + .2, SZ, seg=32)], bw=.09, seg=3)
solid('brake_face', cylbm(.92, x1 - .36, x1 - .3, SZ, seg=32), M['brake'], part=BK, cuts=[cylbm(.55, x1 - 1, x1 + 1, SZ, seg=24)], bw=.01)
solid('brake_bore', cylbm(.55, x1 - 2.0, x1 - 1.9, SZ, seg=24), M['bore'], part=BK, bw=0)
solid('brake_baffle', cylbm(1.05, x0 + 2.0, x0 + 2.4, SZ, seg=6), M['brake'], part=BK, cuts=[cylbm(.55, x0, x1, SZ, seg=24)], bw=.04)

# ---------------------------------------------------------------- the stock (tag_ro_stock): a heavy recoil stock
ST = 'tag_ro_stock'
solid('buffer_tube', cylbm(.62, -9.0, -2.8, 2.15, seg=28), M['black'], part=ST, bw=.04)
stock = prism(fillet([(-4.0, 3.15), (-7.0, 3.15), (-7.6, 3.75), (-13.9, 3.75), (-14.6, 3.25), (-14.6, -2.6), (-14.0, -3.05),
                      (-11.2, -3.05), (-7.2, 0.1), (-5.2, 0.9), (-4.0, 1.0)], .35), -.8, .8)
st_cuts = [prism(fillet([(-6.6, 1.55), (-10.6, 1.55), (-12.0, -.2), (-12.0, -1.6), (-11.2, -1.6), (-7.6, 1.0)], .4), -2, 2),
           prism(rrect_xz(-13.6, -11.9, 2.15, 3.2, .2), .65, 2), prism(rrect_xz(-13.6, -11.9, 2.15, 3.2, .2), -2, -.65)]
solid('stock', stock, M['poly'], part=ST, cuts=st_cuts, bw=.15, seg=3)
solid('cheek', prism(fillet([(-7.4, 3.7), (-13.6, 3.7), (-13.6, 4.15), (-7.9, 4.15)], .15), -.72, .72), M['olive'], part=ST, bw=.08, seg=2)
for x in (-8.6, -12.4):
    solid('cheek_post', vcyl(.12, x, 0, 3.6, 3.75), M['steel'], part=ST, bw=0)
# the recoil buffer: a silver piston in the stock's open skeleton, a spring round it
solid('piston', cylbm(.32, -11.3, -6.9, .85, seg=20), M['steel'], part=ST, bw=.02)
solid('piston_rod', cylbm(.16, -6.9, -5.4, .85, seg=14), M['tungsten'], part=ST, bw=0)
for k in range(9):
    x = -10.9 + k * .45
    ring('spring', .42, .3, x, x + .1, M['red'], part=ST, z=.85, seg=16, bw=0)
pad = prism(fillet([(-14.55, 3.4), (-15.55, 3.25), (-15.55, -2.7), (-14.55, -2.8)], .25), -.86, .86)
solid('butt_pad', pad, M['rubber'], part=ST, cuts=[boxbm(-15.8, -15.3, -1, 1, z, z + .14) for z in (-2.0, -1.2, -0.4, 0.4, 1.2, 2.0, 2.8)], bw=.1, seg=2)
solid('st_label', prism(rrect_xz(-11.6, -8.6, -2.0, -1.2, .1), .7, .82), M['label'], part=ST, bw=.02)
text('RECOIL', .22, (-10.1, .83, -1.45), part=ST, m=M['ink_k'], font=STENCIL)
text('20MM', .2, (-10.1, .83, -1.8), part=ST, m=M['red'], font=STENCIL)
ring('sling', .3, .15, 0, .14, M['steel'], part=ST, z=0, bw=.02).data.transform(Matrix.Translation((-13.8, .8, -2.2)) @ Matrix.Rotation(math.radians(90), 4, 'Z'))

# ---------------------------------------------------------------- magazine (tag_clip): a deep ribbed box, 5 rounds
C = 'tag_clip'
mag = prism(fillet([(3.65, -0.6), (8.35, -0.6), (8.5, -6.2), (8.2, -6.55), (4.15, -6.55), (3.9, -6.2)], .2), -.86, .86)
solid('mag', mag, M['poly'], part=C, bw=.1, seg=2)
for s in (1, -1):   # the zigzag ribs down each side, as on the render
    for k in range(5):
        z = -1.35 - k * 1.0
        solid('rib', bar(4.5, z + .38, 7.6, z, .2, s * .84, s * .95), M['poly'], part=C, bw=.04, seg=1)
        solid('rib', bar(7.6, z, 4.5, z - .38, .2, s * .84, s * .95), M['poly'], part=C, bw=.04, seg=1)
solid('mag_plate', prism(fillet([(3.95, -6.4), (8.4, -6.4), (8.45, -6.95), (3.9, -6.95)], .12), -.9, .9), M['black'], part=C, bw=.05)
solid('mag_lips', boxbm(4.0, 8.0, -.6, .6, -0.6, -0.3), M['steel'], part=C, bw=.02)
solid('mag_round', cylbm(.27, 4.4, 7.6, -0.25, seg=18), M['brass'], part=C, bw=.02)
text('20x102  AP-T', .17, (6.0, .97, -6.15), part=C, m=M['ink_y'], font=STENCIL)
for k in range(5):
    solid('witness', cylbm(.07, 8.38, 8.5, -1.4 - k * 1.0, seg=8), M['steel'], part=C, bw=0)

# ---------------------------------------------------------------- flip-up irons (tag_iron_sight), sights at both ends
IS = 'tag_iron_sight'
FX = 16.3
solid('front_base', boxbm(FX - .45, FX + .45, -.5, .5, RAIL, RAIL + .45), M['black'], part=IS, bw=.05)
for s in (1, -1):
    solid('front_ear', prism(fillet([(FX - .2, RAIL + .4), (FX + .2, RAIL + .4), (FX + .15, 5.6), (FX - .15, 5.6)], .08), s * .26, s * .42), M['black'], part=IS, bw=.02)
solid('front_post', boxbm(FX - .05, FX + .05, -.05, .05, RAIL + .4, SIGHT), M['steel'], part=IS, bw=0)
solid('front_screw', screw(FX, .52, RAIL + .2, .1, .05), M['steel'], part=IS, bw=0)
solid('rear_base', boxbm(-0.3, 0.6, -.32, .32, RAIL, RAIL + .35), M['black'], part=IS, bw=.04)
solid('rear_post', prism(fillet([(0.0, RAIL + .3), (0.3, RAIL + .3), (0.22, SIGHT - .3), (0.08, SIGHT - .3)], .04), -.07, .07), M['black'], part=IS, bw=.01)
solid('rear_ring', cylbm(.34, .08, .22, SIGHT, seg=32), M['black'], part=IS, cuts=[cylbm(.29, -.2, .5, SIGHT, seg=32)], bw=.01)

# ---------------------------------------------------------------- pistol grip (tag_ro_grip)
G = 'tag_ro_grip'
grip = prism(fillet([(-0.6, 0.0), (-2.6, 0.0), (-3.7, -3.9), (-3.35, -4.4), (-1.85, -4.45), (-1.55, -4.05), (-0.85, -0.75)], 0.35), -.66, .66)
solid('grip', grip, M['poly'], part=G, cuts=[prism(fillet([(-1.4, -1.0), (-2.5, -1.0), (-3.15, -3.5), (-2.05, -3.5)], .25), .52, 1),
                                              prism(fillet([(-1.4, -1.0), (-2.5, -1.0), (-3.15, -3.5), (-2.05, -3.5)], .25), -1, -.52)], bw=.2, seg=4)
for s in (1, -1):   # stippled rubber panels
    solid('grip_panel', prism(fillet([(-1.45, -1.05), (-2.45, -1.05), (-3.1, -3.45), (-2.1, -3.45)], .22), s * .52, s * .6), M['rubber'], part=G,
          cuts=[boxbm(-3.4, -1.2, -1, 1, z, z + .08) for z in (-1.4, -1.75, -2.1, -2.45, -2.8, -3.15)], bw=.02)
solid('grip_cap', prism(fillet([(-1.9, -4.3), (-3.35, -4.25), (-3.4, -4.6), (-1.85, -4.65)], .1), -.6, .6), M['black'], part=G, bw=.04)

# ================================================================ attachments
# Gunner's Scope 4x (optic): a squat armoured tank-gunner sight, square shroud, rubber eyecup
GS = 'tag_ro_gunner'
solid('gs_body', boxbm(0.4, 5.6, -.78, .78, SIGHT - .78, SIGHT + .78), M['olive'], part=GS, cuts=[cylbm(.6, -1, 7, SIGHT, seg=28)], bw=.12, seg=2)
solid('gs_obj', cylbm(.95, 5.5, 7.0, SIGHT, seg=8, r2=1.05), M['black'], part=GS, cuts=[cylbm(.8, 5.3, 7.3, SIGHT, seg=28)], bw=.06)
solid('gs_eye', cylbm(.7, -1.4, 0.5, SIGHT, seg=28, r2=.6), M['rubber'], part=GS, cuts=[cylbm(.55, -2, .7, SIGHT, seg=28)], bw=.06)
for x in (-1.3, 6.9):
    solid(f'gs_glass{x}', cylbm(.58 if x < 0 else .8, x - .01, x + .01, SIGHT, seg=28), M['glass'], part=GS, bw=0)
solid('gs_mount', boxbm(1.0, 5.0, -.45, .45, RAIL - .05, SIGHT - .7), M['black'], part=GS, bw=.04)
solid('gs_knob', cylbm(.32, 2.6, 2.9, SIGHT, y=.95, seg=18, axis='y'), M['steel'], part=GS, bw=.02)
solid('gs_turret', vcyl(.3, 3.0, 0, SIGHT + .7, SIGHT + 1.15, 18), M['steel'], part=GS, bw=.03)
text('4x', .3, (2.0, .79, SIGHT + .1), part=GS, m=M['ink_w'], font=STENCIL)
text('VAS GS-4', .14, (4.3, .79, SIGHT - .35), part=GS, m=M['ink_k'], font=STENCIL)

# Breach Reflex (optic): an open square window on a tall riser, steel hood
RX = 'tag_ro_reflex'
solid('rx_base', boxbm(2.4, 5.0, -.58, .58, RAIL, RAIL + .35), M['black'], part=RX, bw=.05)
solid('rx_hood', prism(fillet([(3.0, RAIL + .3), (4.7, RAIL + .3), (4.7, 6.3), (3.2, 6.3)], .2), -.8, .8), M['olive'], part=RX,
      cuts=[prism(rrect_xz(2.8, 5.0, 4.4, 6.0, .2), -.62, .62)], bw=.06, seg=2)
solid('rx_glass', boxbm(4.3, 4.36, -.62, .62, 4.4, 6.0), M['lens'], part=RX, bw=0)
solid('rx_emit', cylbm(.1, 3.0, 3.3, RAIL + .5, seg=10), M['dot'], part=RX, bw=0)
solid('rx_knob', screw(3.8, .82, RAIL + .55, .16, .1, seg=14), M['steel'], part=RX, bw=.02)

# Concussion Brake (muzzle): a wide bell with a ring of vents, yellow-banded
CB = 'tag_ro_concuss'
solid('cb_bell', cylbm(1.0, x0, x0 + 4.8, SZ, seg=32, r2=1.85), M['brake'], part=CB,
      cuts=[cylbm(.6, x0 - .2, x0 + 2, SZ, seg=24), cylbm(.6, x0 + 1.8, x0 + 5.0, SZ, seg=32, r2=1.65)], bw=.08, seg=2)
for k in range(8):   # vents slotted round the bell
    a = math.radians(22.5 + 45 * k)
    v = boxbm(x0 + 1.6, x0 + 3.8, -.17, .17, 1.0, 1.75)
    v.transform(Matrix.Translation((0, 0, SZ)) @ Matrix.Rotation(a, 4, 'X'))
    solid('cb_fin', v, M['steel'], part=CB, bw=.03)
ring('cb_band', 1.4, 1.05, x0 + 1.05, x0 + 1.4, M['yellow'], part=CB, bw=.01)
ring('cb_lip', 1.92, 1.62, x0 + 4.7, x0 + 4.95, M['steel'], part=CB, bw=.04)

# Thump Baffle (muzzle): a fat ribbed can
HB = 'tag_ro_hush'
solid('hb_can', cylbm(1.25, x0, x0 + 7.0, SZ, seg=36), M['black'], part=HB, bw=.1, seg=2)
for x in [x0 + 1.0 + .7 * k for k in range(8)]:
    ring('hb_rib', 1.33, 1.1, x, x + .25, M['gunmetal'], part=HB, bw=.02)
ring('hb_end', 1.3, .5, x0 + 6.9, x0 + 7.15, M['steel'], part=HB, bw=.05)
solid('hb_bore', cylbm(.5, x0 + 6.8, x0 + 6.9, SZ, seg=24), M['bore'], part=HB, bw=0)
text('THUMP', .3, (x0 + 3.5, 1.27, SZ), part=HB, m=M['ink_w'], font=STENCIL)

# Tungsten Rail Barrel (barrel): two copper rails either side of the barrel, a glowing gap, spacer collars
TR = 'tag_ro_tungsten'
for s in (1, -1):
    solid('tr_rail', boxbm(19.9, 30.2, s * .62, s * .98, SZ - .42, SZ + .42), M['copper'], part=TR, bw=.05)
    solid('tr_glow', boxbm(20.2, 29.9, s * .56, s * .64, SZ - .3, SZ + .3), M['rail'], part=TR, bw=0)
for x in (20.2, 23.4, 26.6, 29.6):
    solid('tr_collar', boxbm(x, x + .45, -1.08, 1.08, SZ - .6, SZ + .6), M['tungsten'], part=TR, bw=.06, seg=2)
solid('tr_cable', cylbm(.12, 18.4, 20.3, SZ - .7, y=.9, seg=10), M['rubber'], part=TR, bw=0)

# MFS Warhead Autoloader (BO7's prestige mag): a black drum hung from the magwell, MFS stamped, a ribbed rim
MF = 'tag_ro_mfs'
DX, DZ, DR = 6.1, -3.4, 2.75
solid('mf_neck', boxbm(3.8, 8.3, -.72, .72, -2.0, -0.55), M['poly'], part=MF, bw=.06)
solid('mf_drum', cylbm(DR, DX, DX + 2.4, DZ, y=0, seg=48, axis='y'), M['poly'], part=MF, bw=.18, seg=3)
for s in (1, -1):
    solid('mf_face', cylbm(DR - .35, DX, DX + .12, DZ, y=s * 1.22, seg=48, axis='y'), M['black'], part=MF, bw=.03)
    solid('mf_hub', cylbm(.7, DX, DX + .2, DZ, y=s * 1.32, seg=32, axis='y'), M['steel'], part=MF, bw=.04)
    solid('mf_wind', boxbm(DX - .12, DX + .12, s * 1.38, s * 1.5, DZ - .6, DZ + .6), M['steel'], part=MF, bw=.02)
for k in range(24):   # the knurled rim
    a = 2 * math.pi * k / 24
    solid('mf_knurl', boxbm(DX + (DR + .02) * math.cos(a) - .1, DX + (DR + .02) * math.cos(a) + .1, -.95, .95,
                            DZ + (DR + .02) * math.sin(a) - .1, DZ + (DR + .02) * math.sin(a) + .1), M['black'], part=MF, bw=.02, seg=1)
text('MFS', .5, (DX + 1.0, 1.29, DZ + 1.2), part=MF, m=M['red'], font=STENCIL)
text('WARHEAD AUTOLOADER', .14, (DX, 1.29, DZ - 1.45), part=MF, m=M['ink_w'], font=STENCIL)

# Extended Mag (the shared extmag, on the M16's own tag_ext_clip): 8 rounds, a longer box with a yellow band
EM = 'tag_ext_clip'
em = prism(fillet([(3.65, -0.6), (8.35, -0.6), (8.9, -8.6), (8.55, -8.95), (4.75, -8.95), (4.35, -8.6)], .2), -.86, .86)
solid('em_body', em, M['poly'], part=EM, bw=.1, seg=2)
for s in (1, -1):
    for k in range(7):
        z = -1.35 - k * 1.0
        solid('em_rib', bar(4.5 + k * .06, z + .38, 7.6 + k * .06, z, .2, s * .84, s * .95), M['poly'], part=EM, bw=.04, seg=1)
        solid('em_rib', bar(7.6 + k * .06, z, 4.5 + k * .06, z - .38, .2, s * .84, s * .95), M['poly'], part=EM, bw=.04, seg=1)
solid('em_band', prism([(4.3, -8.0), (8.82, -8.0), (8.86, -8.45), (4.34, -8.45)], -.9, .9), M['yellow'], part=EM, bw=.02)
solid('em_plate', prism(fillet([(4.45, -8.8), (8.85, -8.8), (8.9, -9.35), (4.4, -9.35)], .12), -.9, .9), M['black'], part=EM, bw=.05)
solid('em_lips', boxbm(4.0, 8.0, -.6, .6, -0.6, -0.3), M['steel'], part=EM, bw=.02)
text('8 RDS', .3, (6.7, .97, -8.22), part=EM, m=M['ink_k'], font=STENCIL)

# Dual Mag (the shared dualmag, on tag_double_clip): a second box taped to the left of the first, offset down, so a
# reload swaps them
DM = 'tag_double_clip'
DY, DZ = 1.86, -.9   # the spare's offset
for k, (dy, dz) in enumerate(((0, 0), (DY, DZ))):
    b = prism(fillet([(3.65, -0.6 + dz), (8.35, -0.6 + dz), (8.5, -6.2 + dz), (8.2, -6.55 + dz), (4.15, -6.55 + dz), (3.9, -6.2 + dz)], .2), -.86 + dy, .86 + dy)
    solid('dm_mag', b, M['poly'], part=DM, bw=.1, seg=2)
    for s_ in (1, -1):
        if (k == 0 and s_ > 0) or (k == 1 and s_ < 0): continue   # the ribs on the faces taped together are hidden
        for j in range(5):
            z = -1.35 - j * 1.0 + dz
            solid('dm_rib', bar(4.5, z + .38, 7.6, z, .2, dy + s_ * .84, dy + s_ * .95), M['poly'], part=DM, bw=.04, seg=1)
            solid('dm_rib', bar(7.6, z, 4.5, z - .38, .2, dy + s_ * .84, dy + s_ * .95), M['poly'], part=DM, bw=.04, seg=1)
    solid('dm_plate', prism(fillet([(3.95, -6.4 + dz), (8.4, -6.4 + dz), (8.45, -6.95 + dz), (3.9, -6.95 + dz)], .12), -.9 + dy, .9 + dy), M['black'], part=DM, bw=.05)
    solid('dm_lips', boxbm(4.0, 8.0, -.6 + dy, .6 + dy, -0.6 + dz, -0.3 + dz), M['steel'], part=DM, bw=.02)
    solid('dm_round', cylbm(.27, 4.4, 7.6, -0.25 + dz, y=dy, seg=18), M['brass'], part=DM, bw=.02)
for z0 in (-2.4, -4.6):   # two wraps of olive tape round both, and a pull tab
    solid('dm_tape', prism(fillet([(3.95, z0), (8.42, z0), (8.45, z0 - .55), (3.98, z0 - .55)], .05), -.93, DY + .93), M['olive'], part=DM, bw=.01)
solid('dm_tab', boxbm(8.4, 8.75, DY - .2, DY + .2, -6.2, -5.7), M['olive'], part=DM, bw=.01)
text('20x102  AP-T', .17, (6.0, DY + .97, -6.15 + DZ), part=DM, m=M['ink_y'], font=STENCIL)

# Damper Grip (rear grip): chunky, a rubber recoil cushion at the web and a hydraulic bolt through it
DG = 'tag_ro_damper'
dg = prism(fillet([(-0.5, 0.0), (-2.8, 0.0), (-3.9, -3.8), (-3.6, -4.6), (-1.6, -4.6), (-1.35, -3.7), (-1.05, -3.3), (-1.35, -2.8),
                   (-0.95, -2.25), (-1.2, -1.7), (-0.8, -1.15), (-0.75, -0.5)], 0.25), -.76, .76)
solid('dg_grip', dg, M['poly'], part=DG, cuts=[boxbm(-4.1, -0.4, -1, 1, z, z + .05) for z in (-1.0, -1.4, -1.8, -2.2, -2.6, -3.0, -3.4)], bw=.25, seg=4)
solid('dg_cushion', prism(fillet([(-2.75, -0.05), (-3.6, -0.05), (-3.7, -1.3), (-3.05, -1.3)], .2), -.8, .8), M['rubber'], part=DG, bw=.12, seg=2)
solid('dg_bolt', cylbm(.2, -3.4, -2.4, -0.7, y=.82, seg=16), M['steel'], part=DG, bw=.02)
solid('dg_cap', prism(fillet([(-3.65, -4.5), (-1.55, -4.5), (-1.5, -4.8), (-3.7, -4.8)], .12), -.8, .8), M['olive'], part=DG, bw=.06)

# Snap Grip (rear grip): slim and raked, open-backed, an olive insert
SN = 'tag_ro_snap'
sn = prism(fillet([(-0.6, 0.0), (-2.5, 0.0), (-4.0, -4.0), (-3.6, -4.45), (-2.4, -4.4), (-0.9, -0.8)], 0.3), -.55, .55)
solid('sn_grip', sn, M['poly'], part=SN, cuts=[prism(fillet([(-2.2, -.6), (-2.6, -.6), (-3.55, -3.6), (-3.15, -3.6)], .15), -1, 1)], bw=.18, seg=4)
solid('sn_insert', prism([(-1.0, -0.6), (-1.3, -0.6), (-2.4, -4.2), (-2.1, -4.2)], -.57, .57), M['olive'], part=SN, bw=.02)

# Hydraulic Buffer Stock: twin silver cylinders from the receiver to a broad pad, springs over them
BS = 'tag_ro_buffer'
for z in (2.6, 0.2):
    solid('bs_cyl', cylbm(.42, -10.5, -2.8, z, seg=24), M['black'], part=BS, bw=.05)
    solid('bs_rod', cylbm(.22, -13.6, -10.4, z, seg=16), M['tungsten'], part=BS, bw=.01)
    for k in range(10):
        ring('bs_spring', .34, .23, -13.3 + k * .3, -13.3 + k * .3 + .08, M['yellow'], part=BS, z=z, seg=14, bw=0)
solid('bs_yoke', prism(fillet([(-4.2, 3.2), (-2.8, 3.2), (-2.8, -0.4), (-4.2, -0.4)], .2), -.85, .85), M['black'], part=BS, bw=.1)
solid('bs_plate', prism(fillet([(-13.7, 3.7), (-14.6, 3.7), (-14.6, -2.7), (-13.7, -2.7)], .3), -1.0, 1.0), M['olive'], part=BS, bw=.12, seg=2)
solid('bs_pad', prism(fillet([(-14.55, 3.6), (-15.7, 3.4), (-15.7, -2.6), (-14.55, -2.7)], .3), -1.0, 1.0), M['rubber'], part=BS,
      cuts=[boxbm(-16, -15.4, -1.2, 1.2, z, z + .14) for z in (-1.8, -1.0, -0.2, 0.6, 1.4, 2.2, 3.0)], bw=.12, seg=2)
solid('bs_cheek', prism(fillet([(-8.0, 3.2), (-13.7, 3.2), (-13.7, 4.0), (-8.6, 4.0)], .2), -.7, .7), M['poly'], part=BS, bw=.1)
for x in (-9.0, -12.8):
    solid('bs_strut', boxbm(x, x + .3, -.3, .3, 2.9, 3.25), M['steel'], part=BS, bw=.02)

# Kick Stock: a bare bent strut, a red coil spring and a small pad (it throws you back on every shot)
KS = 'tag_ro_kick'
solid('ks_strut', bar(-2.8, 2.6, -9.0, 2.6, .5, -.3, .3), M['steel'], part=KS, bw=.06, seg=2)
solid('ks_strut2', bar(-3.2, -0.2, -9.0, 1.6, .45, -.28, .28), M['steel'], part=KS, bw=.06, seg=2)
solid('ks_spring_rod', cylbm(.15, -13.0, -8.8, 2.1, seg=14), M['tungsten'], part=KS, bw=0)
for k in range(13):
    ring('ks_spring', .55, .4, -12.8 + k * .3, -12.8 + k * .3 + .12, M['red'], part=KS, z=2.1, seg=16, bw=0)
solid('ks_block', boxbm(-9.3, -8.6, -.55, .55, .9, 3.1), M['black'], part=KS, bw=.08)
solid('ks_pad', prism(fillet([(-13.0, 3.6), (-13.8, 3.5), (-13.8, .6), (-13.0, .5)], .25), -.8, .8), M['rubber'], part=KS, bw=.1, seg=2)
text('KICK', .22, (-6.0, .31, 2.6), part=KS, m=M['ink_w'], font=STENCIL)

# Bipod (underbarrel): two legs folded forward under the handguard, a swivel clamp on the bottom rail
BP = 'tag_ro_bipod'
solid('bp_clamp', boxbm(14.4, 16.0, -.6, .6, -0.1, 0.4), M['black'], part=BP, bw=.06)
solid('bp_swivel', cylbm(.35, 15.0, 15.0 + .6, 0.0, seg=18, axis='y'), M['steel'], part=BP, bw=.03)
for s in (1, -1):
    solid('bp_leg', cylbm(.2, 15.2, 23.6, -0.25, y=s * .42, seg=14), M['black'], part=BP, bw=.02)
    solid('bp_inner', cylbm(.14, 23.5, 26.5, -0.25, y=s * .42, seg=12), M['steel'], part=BP, bw=.01)
    solid('bp_foot', cylbm(.28, 26.4, 26.9, -0.25, y=s * .42, seg=14), M['rubber'], part=BP, bw=.05)
    solid('bp_lock', cylbm(.26, 21.0, 21.5, -0.25, y=s * .42, seg=14), M['olive'], part=BP, bw=.03)

# Foregrip (underbarrel, generic): an angled stub on the bottom rail
FG = 'tag_foregrip'
solid('fg_clamp', boxbm(13.4, 15.4, -.55, .55, -0.05, 0.38), M['black'], part=FG, bw=.06)
solid('fg_grip', prism(fillet([(13.6, 0.0), (15.2, 0.0), (15.0, -2.9), (13.9, -3.1)], .35), -.52, .52), M['poly'], part=FG,
      cuts=[boxbm(15.0, 15.5, -.6, .6, z - .06, z + .06) for z in (-0.7, -1.3, -1.9, -2.5)], bw=.2, seg=4)

# Laser (generic): a box on the right side rail
LS = 'tag_laser_box'
solid('ls_box', prism(fillet([(10.8, 1.35), (13.8, 1.35), (13.8, 2.35), (10.8, 2.35)], .2), -1.95, -1.25), M['black'], part=LS, bw=.08, seg=3)
solid('ls_lens', cylbm(.2, 13.78, 13.84, 1.85, y=-1.6, seg=16), M['dot'], part=LS, bw=0)

# Ammo (one saddle of three rounds on the receiver's left, behind the charging handle; the tips show the load)
SADDLE_Z = (1.55, 2.15, 2.75)
LOOK = {'he': ('red', 'yellow'), 'sabot': ('black', None), 'thermite': ('red', 'red'), 'flak': ('yellow', 'black'), 'shock': ('shock', 'copper'),
        'canister': ('olive', None), 'mark': ('tracer', 'label')}
NAME = {'he': 'HE', 'sabot': 'APFSDS', 'thermite': 'THERMITE', 'flak': 'FLAK', 'shock': 'SHOCK', 'canister': 'CANISTER', 'mark': 'TRACER'}
for a in AMMO:
    P = 'tag_ro_' + a
    solid('saddle', boxbm(-2.75, -1.95, .9, 1.12, 1.15, 3.15), M['black'], part=P, bw=.04)
    solid('saddle_front', boxbm(.6, 1.1, .9, 1.12, 1.15, 3.15), M['black'], part=P, bw=.04)
    for z in SADDLE_Z:
        ring('saddle_loop', .33, .26, -2.6, -2.1, M['black'], part=P, z=z, y=1.42, seg=18, bw=.01)
        tip, band = LOOK[a]
        shell(P, z, tip, band, kind=a)
    if a == 'shock':
        for z in SADDLE_Z:
            ring('shock_coil', .29, .18, -.25, -.1, M['copper'], part=P, z=z, y=1.42, seg=18, bw=0)
    text(NAME[a], .14, (-2.35, 1.13, 3.0), part=P, m=M['ink_w'], font=STENCIL)

export(OUT, RENDER, 'ro', BAKED, tex=4096, frame=(9.5, 0, -1.0), ortho=56)

if RENDER:   # close-ups of the bare gun (no attachments)
    sc = bpy.context.scene; co = sc.camera
    keep = ('part_tag_clip', 'part_tag_iron_sight', 'part_tag_ro_grip', 'part_tag_ro_stock', 'part_tag_ro_brake')
    for o in bpy.data.objects:
        if o.name.startswith('part_tag_') and o.name not in keep: o.hide_render = True
    for name, (x, z, sc_) in (('close_rcv', (3.0, 1.0, 14)), ('close_front', (25.0, 2.2, 16)), ('close_stock', (-8.0, 0.5, 13))):
        co.location = (x, 60, z); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = sc_
        sc.render.filepath = f'{RENDER}/ro_{name}.png'; bpy.ops.render.render(write_still=True)
    co.location = (-30, 26, 16)   # roughly the player's view: from behind, left and above
    co.rotation_euler = (Vector((8, 0, 2)) - co.location).to_track_quat('-Z', 'Z').to_euler(); co.data.ortho_scale = 34
    sc.render.filepath = f'{RENDER}/ro_close_hip.png'; bpy.ops.render.render(write_still=True)
    # every attachment on at once, for a look at them
    for o in bpy.data.objects:
        if o.name.startswith('part_tag_'): o.hide_render = not (o.name in ('part_tag_clip', 'part_tag_iron_sight') or any(
            o.name == 'part_tag_ro_' + k for k in ('gunner', 'concuss', 'tungsten', 'damper', 'buffer', 'bipod', 'flak')))
    co.location = (9.5, 60, -1.0); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = 56
    sc.render.filepath = f'{RENDER}/ro_kit_a.png'; bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        if o.name.startswith('part_tag_'): o.hide_render = not (o.name in ('part_tag_iron_sight',) or any(
            o.name == 'part_tag_ro_' + k for k in ('reflex', 'hush', 'mfs', 'snap', 'kick', 'shock', 'grip')) or o.name == 'part_tag_laser_box')
    sc.render.filepath = f'{RENDER}/ro_kit_b.png'; bpy.ops.render.render(write_still=True)

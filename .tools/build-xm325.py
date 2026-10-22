# The XM325 (Black Ops 7's Rist Rauch belt-fed LMG), rebuilt from the Gunsmith renders for Melon Zombies. Modelled in
# the BO1 HK21 viewmodel's gun space (j_gun: x forward, y left, z up, inches), so .tools/assemble-grimhawk.mjs --gun xm325
# skins each part to the HK21 skeleton (and --gun xm325_rh / xm325_lh to the CZ75 dual-wield pair for Titan Wield).
# The player sees the gun's left (+y) side. Sizes come off the left-side Gunsmith render (1604 px wide):
# x = 30.465 - px * .0285, z = 5.738 - py * .024 (bore z 2.19, sight line z 5.14, muzzle x 29.5). Parts are part_<bone>:
#   j_gun          receiver, skeletal upper handguard, tan lower handguard, rear housing, rails, trigger group
#   j_bolt         the feed-cover latch and charging handle (moved by the reload)
#   tag_clip       the fabric belt pouch (60) and its caseless belt (moved by the reload)
#   tag_iron_sight front post and rear aperture (removed by an optic, ironSights in attachments.json)
#   tag_xm_muzzle / _barrel / _grip / _stock   the stock parts, replaced by their attachments
#   tag_xm_*       the attachments, hidden by tag until fitted
#   blender -b -P .tools/build-xm325.py -- <out.glb> [--render <dir>] [--tex 4096]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *
import bo7lib

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/xm325_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None
TEX = int(argv[argv.index('--tex') + 1]) if '--tex' in argv else 4096

MAGS = ('tag_xm_fastbelt', 'tag_xm_extbelt', 'tag_xm_leyden', 'tag_xm_titan')
PARTS.update({k: [] for k in ('j_gun', 'j_bolt', 'tag_clip', 'tag_iron_sight', 'tag_xm_muzzle', 'tag_xm_barrel', 'tag_xm_grip',
                              'tag_xm_stock', 'tag_xm_comp', 'tag_xm_sup', 'tag_xm_chief', 'tag_xm_fractal', 'tag_xm_cryo',
                              'tag_xm_vas', 'tag_xm_mfs', 'tag_xm_reflex', 'tag_xm_lucius', 'tag_xm_aegis') + MAGS})
M.update(
    # Rist Rauch's two-tone: tan cerakote over aluminium, black polymer furniture, a black fabric belt pouch
    tan=worn('xm_tan', '#857262', .6, .05, bare='#aeaba4', wear=.35, chips=.25, under='#4a4239', mottle=.35, dirt=.4, rust=.05),
    black=worn('xm_black', '#1f2022', .55, .15, bare='#7f858b', wear=.45, chips=.2, under='#3a3c3f', mottle=.3, dirt=.35, rust=.08),
    poly=worn('xm_poly', '#1b1c1e', .72, 0, bare='#4d5054', wear=.3, bare_metal=False, mottle=.35, dirt=.4),
    steel=worn('xm_steel', '#4a4f53', .35, 1, bare='#a0a6ac', wear=.5, dirt=.25, rust=.15),
    gunmetal=worn('xm_gunmetal', '#2b3033', .38, .95, bare='#8e969c', wear=.45, brushed=.7, dirt=.3, rust=.1),
    fabric=worn('xm_fabric', '#18191a', .88, 0, bare='#2c2d2f', wear=.25, bare_metal=False, mottle=.5, dirt=.45),
    rubber=worn('xm_rubber', '#141414', .9, 0, bare='#2a2a2a', wear=.2, bare_metal=False, dirt=.35),
    red=worn('xm_red', '#9c1f17', .5, 0, bare='#a9abad', wear=.35, chips=.4, under='#3e3f40', dirt=.3),
    round=worn('xm_round', '#2a2b2c', .45, .2, bare='#5c5f62', wear=.3, bare_metal=False, dirt=.2),   # caseless propellant
    copper=worn('xm_copper', '#a3602e', .32, 1, bare='#dc9a62', wear=.35, dirt=.2),
    frost=worn('xm_frost', '#cfe3ea', .4, .3, bare='#eef6f8', wear=.3, bare_metal=False, mottle=.4),
    olive=worn('xm_olive', '#5a5c45', .58, .1, bare='#a9aa9c', wear=.45, chips=.45, under='#3c3d36', mottle=.4, dirt=.45, rust=.15),
    yellow=worn('xm_yellow', '#c79a1c', .55, 0, bare='#9a9da0', wear=.4, chips=.45, under='#3e3f40', dirt=.3),
    bore=mat('xm_bore', '#060606', .6, 0),
    glass=mat('xm_glass', '#a9d6e6', .05, 0, alpha=.15),
    lens=mat('reflex_lens_xm', '#a9e6c4', .05, 0, alpha=.08),   # named so the scopes mod treats it as a reflex lens
    dot=mat('xm_dot', '#300000', .3, 0, '#ff2a1a', 12),
    green=mat('xm_green_glow', '#002a08', .3, 0, '#3cff6a', 4),   # the front sight base's status light
    blue=mat('xm_blue_glow', '#04203a', .3, 0, '#58c8ff', 6),     # Cryo Shroud coolant, Leyden spark gap
    laser=mat('xm_laser_glow', '#300000', .3, 0, '#ff2018', 10),
    # the lettering stays out of the bake (glyphs that small lose strokes in the atlas)
    ink_w=mat('xm_ink_white', '#d4d0be', .6, 0), ink_k=mat('xm_ink_black', '#141414', .6, 0),
    ink_r=mat('xm_ink_red', '#e0402a', .6, 0), ink_t=mat('xm_ink_tan', '#b8a48e', .6, 0),
)
BAKED = ('tan', 'black', 'poly', 'steel', 'gunmetal', 'fabric', 'rubber', 'red', 'round', 'copper', 'frost', 'olive', 'yellow')
STENCIL = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'


def X(px): return 30.465 - px * .0285
def Z(py): return 5.738 - py * .024
def P(pts): return [(X(a), Z(b)) for a, b in pts]


SZ = 2.19          # bore axis
SIGHT = 5.14       # the HK21 sight line (front post top, rear aperture centre)
RAIL = 4.25        # top rail
MUZ = 27.33        # barrel end / muzzle device start


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


def rail_teeth(x0, x1, y0, y1, z0, z1, part='j_gun', m='black', step=.4, w=.22):
    for k in range(int((x1 - x0) / step)):
        x = x0 + k * step
        solid('tooth', boxbm(x, x + w, y0, y1, z0, z1), M[m], part=part, bw=.02, seg=1)


def rot_x(bm, a, zc, yc=0.):
    """Turn a bmesh about the x axis through (yc, zc)."""
    bm.transform(Matrix.Translation((0, yc, zc)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, -yc, -zc))); return bm


def belt(part, z0=.18, n=7, ys=(1.12, 1.18, 1.18, 1.1, .95, .8, .66), x0=5.3):
    """The caseless belt climbing out of the box into the feed window: black propellant blocks with a tapered nose,
    a steel link band round each, bulging out past the receiver's left face and curving back in."""
    for k in range(n):
        z, y = z0 + .44 * k, ys[min(k, len(ys) - 1)]
        solid('rnd', cylbm(.22, x0, x0 + 1.05, z, y=y, seg=16), M['round'], part=part, bw=.03, seg=1)
        solid('nose', cylbm(.22, x0 + 1.05, x0 + 1.35, z, y=y, seg=16, r2=.1), M['round'], part=part, bw=0)
        ring('link', .245, .2, x0 + .3, x0 + .5, M['steel'], part=part, z=z, y=y, seg=16, bw=0)
        ring('link', .245, .2, x0 + .72, x0 + .9, M['steel'], part=part, z=z, y=y, seg=16, bw=0)


# ---------------------------------------------------------------- receiver core (black) and its tan bands
core = prism(fillet([(10.09, 4.06), (-0.74, 4.06), (-0.74, -0.14), (10.09, -0.14)], .1), -.85, .85)
solid('core', core, M['black'], cuts=[boxbm(2.25, 7.95, .4, 2, .94, 3.22),          # left feed window (the belt goes in here)
                                      boxbm(2.9, 6.1, -2, -.7, 2.35, 3.0)], bw=.05)  # ejection port (right)
solid('band_top', boxbm(-0.46, 9.37, -.88, .88, 3.63, 4.06), M['tan'], cuts=[boxbm(2.25, 7.95, .4, 2, 3.0, 3.7)], bw=.04)
solid('band_low', prism(fillet([(10.09, .99), (-0.74, .99), (-0.74, -0.14), (10.09, -0.14)], .08), -.88, .88), M['tan'], bw=.05)
solid('port_door', boxbm(3.0, 6.0, -.9, -.86, 2.4, 2.95), M['steel'], bw=.01)
for z in [.98 + .12 * k for k in range(10)]:   # the ribbed spring at the window's front edge
    solid('spring', boxbm(7.55, 8.35, .82, .95, z, z + .06), M['steel'], bw=0)
solid('lbl_ready', boxbm(6.95, 7.5, .4, .44, 1.45, 2.25), M['red'], bw=.01)
solid('lbl_keep', boxbm(2.4, 3.2, .4, .44, 1.4, 2.3), M['red'], bw=.01)
text('READY', .09, (7.22, .45, 2.05), m=M['ink_w'], font=STENCIL)
text('MIL 556', .07, (7.22, .45, 1.75), m=M['ink_w'], font=STENCIL)
text('KEEP', .1, (2.8, .45, 2.1), m=M['ink_w'], font=STENCIL)
text('PORT', .1, (2.8, .45, 1.85), m=M['ink_w'], font=STENCIL)
text('CLEAR', .1, (2.8, .45, 1.6), m=M['ink_w'], font=STENCIL)
solid('cover_knob', prism(fillet([(0.54, 2.71), (1.68, 2.71), (1.68, 3.1), (0.54, 3.1)], .08), .85, 1.02), M['poly'],
      cuts=[boxbm(x, x + .08, .97, 1.1, 2.6, 3.2) for x in (.75, .95, 1.15, 1.35)], bw=.03)
solid('knob_sel', screw(0.15, .92, .35, .22, .12, seg=18), M['steel'], bw=.02)
for x in (9.6, -0.3):
    solid('pin', screw(x, .9, 3.85, .09, .05, seg=10), M['steel'], bw=0)
text('XM325', .16, (5.2, -.9, 3.3), m=M['ink_t'], side=-1, font=STENCIL)

# top rail on the receiver
solid('rail', boxbm(-0.46, 8.8, -.38, .38, 4.06, RAIL - .1), M['black'], bw=.03)
rail_teeth(-0.3, 8.7, -.38, .38, RAIL - .12, RAIL)

# ---------------------------------------------------------------- upper skeletal handguard (black) with the gas tube
up = prism(fillet([(23.62, SZ), (23.62, 3.55), (23.4, 3.70), (13.6, 3.70), (13.2, 4.01), (9.37, 4.01), (9.37, SZ)], .12), -.8, .8)
up_cuts = [prism(rrect_xz(17.92, 22.77, 2.67, 3.34, .18), -2, 2), prism(rrect_xz(13.37, 17.5, 2.67, 3.34, .18), -2, 2),
           prism(rrect_xz(18.2, 22.5, 3.45, 3.62, .06), -.5, .5), bar(9.6, 3.55, 13.0, 3.55, .06, .75, 2)]
solid('upper', up, M['black'], cuts=up_cuts, bw=.05, seg=2)
solid('gas_tube', cylbm(.26, 9.4, 23.5, 3.0, seg=18), M['gunmetal'], bw=.02)
solid('gas_plug', cylbm(.3, 23.45, 23.75, 3.0, seg=18), M['steel'], bw=.02)
text('XM325 - 1/8 - 5.56 CASELESS', .085, (11.3, .81, 3.05), m=M['ink_t'], font=STENCIL)

# ---------------------------------------------------------------- tan lower handguard: M-LOK, stipple plate, side rail
lo = prism(fillet([(23.71, SZ), (9.37, SZ), (9.37, -0.02), (20.92, -0.02), (21.63, 0.94), (23.34, 1.71), (23.71, 1.78)], .12), -1.0, 1.0)
lo_cuts = [prism(rrect_xz(x0, x1, 1.47, 1.8, .14), s * .86, s * 2) for x0, x1 in ((16.78, 17.92), (12.37, 14.36), (10.37, 12.08)) for s in (1, -1)]
lo_cuts += [oval(20.3, 1.86, 5.2, .3, math.radians(-3), .86, 2), oval(20.3, 1.86, 5.2, .3, math.radians(-3), -2, -.86)]
solid('lower_hg', lo, M['tan'], cuts=lo_cuts, bw=.06, seg=2)
solid('stipple', prism(rrect_xz(11.94, 14.5, .46, 1.3, .12), .95, 1.05), M['tan'],
      cuts=[boxbm(x, x + .06, 1.02, 1.1, .4, 1.4) for x in [12.1 + .16 * k for k in range(15)]], bw=.02)
text('XM325', .1, (13.2, 1.06, .2), m=M['ink_k'], font=STENCIL)
# left side rail with red index marks (the MFS laser clamps on here)
solid('side_rail', boxbm(15.36, 20.63, .98, 1.15, .94, 1.54), M['black'], cuts=[boxbm(x, x + .22, 1.08, 1.3, .8, 1.7) for x in
      [15.6 + .45 * k for k in range(11)]], bw=.02)
for x in (16.05, 17.4, 18.75, 20.1):
    solid('mark', boxbm(x, x + .14, 1.14, 1.17, 1.0, 1.48), M['red'], bw=0)
# bottom rail (the VAS foregrip clamps on here)
solid('bot_rail', boxbm(15.8, 21.0, -.38, .38, -0.2, -0.01), M['black'], bw=.02)
rail_teeth(15.9, 20.9, -.38, .38, -0.3, -0.18)
for x in (10.2, 22.4):
    solid('hg_pin', screw(x, 1.0, 1.0, .1, .05, seg=10), M['steel'], bw=0)

# ---------------------------------------------------------------- front sight base (black) with its green light
solid('fsb', prism(fillet([(23.48, 1.1), (25.19, 1.1), (25.19, 3.25), (24.9, 3.4), (23.48, 3.4)], .12), -.55, .55), M['black'],
      cuts=[cylbm(.28, 23.0, 25.5, SZ, seg=18)], bw=.04)
solid('fsb_lamp', boxbm(24.2, 24.48, .55, .6, 1.18, 1.46), M['green'], bw=0)
solid('fsb_screw', screw(24.9, .56, 2.9, .08, .04, seg=8), M['steel'], bw=0)

# ---------------------------------------------------------------- rear housing (tan), black top cap
rh = prism(fillet([(-0.46, 4.25), (-1.4, 4.3), (-6.4, 4.42), (-13.14, 4.42), (-13.14, -0.02), (-0.46, -0.02)], .12), -.9, .9)
rh_cuts = [boxbm(-12.6, -0.6, s * .86, s * 2, 2.33, 2.43) for s in (1, -1)] + \
          [boxbm(-12.4, -0.7, .86, 2, .94, 1.47), boxbm(-12.4, -0.7, -2, -.86, .94, 1.47)]
solid('housing', rh, M['tan'], cuts=rh_cuts, bw=.06, seg=2)
solid('cap', prism(fillet([(-6.59, 4.3), (-10.0, 4.3), (-10.0, 4.6), (-6.8, 4.6)], .1), -.72, .72), M['black'], bw=.05)
for x in (0.54, -0.46, -5.16, -6.3):   # Rist Rauch's triangular screws
    solid('tri', screw(x, .9, 1.13, .17, .06, seg=3), M['black'], bw=.01)
text('R', .5, (-2.65, .91, 3.05), m=M['ink_k'], font=STENCIL)
text('RIST', .2, (-3.75, .91, 3.2), m=M['ink_k'], font=STENCIL)
text('RAUCH', .2, (-3.9, .91, 2.9), m=M['ink_k'], font=STENCIL)
solid('qr', boxbm(-8.0, -7.4, .89, .92, 2.75, 3.35), M['black'], bw=0)
text('LMG  5.56x45 CASELESS', .09, (-9.5, .92, 3.05), m=M['ink_k'], font=STENCIL)
text('RIST RAUCH', .16, (-5.0, -.91, 3.05), m=M['ink_k'], side=-1, font=STENCIL)

# ---------------------------------------------------------------- lower receiver (black), trigger guard, trigger
lr = prism(fillet([(4.4, -0.1), (-2.6, -0.1), (-2.6, -1.0), (-0.3, -1.0), (-0.05, -0.28), (3.0, -0.28), (4.4, -0.65)], .1), -.65, .65)
solid('lower_rcv', lr, M['black'], bw=.05)
gd = prism([(3.7, -0.25), (3.7, -1.0), (3.1, -1.5), (-0.7, -1.5), (-0.7, -0.95), (0.0, -0.25)], -.28, .28)
solid('guard', gd, M['black'], cuts=[prism(fillet([(3.35, -0.2), (3.35, -0.95), (2.95, -1.3), (-0.25, -1.3), (-0.25, -0.9),
                                                    (0.3, -0.2)], .2), -1, 1)], bw=.05)
solid('trigger', prism([(1.75, -0.25), (2.05, -0.25), (1.85, -0.75), (1.5, -0.95), (1.4, -0.85)], -.11, .11), M['steel'], bw=.03)
solid('mag_btn', screw(4.0, .65, -0.4, .14, .08, seg=12), M['steel'], bw=.01)

# ---------------------------------------------------------------- j_bolt: the feed-cover latch and charging handle
solid('latch', prism(fillet([(11.8, 4.0), (13.02, 4.0), (13.02, 4.17), (12.0, 4.25)], .06), -.2, .2), M['steel'], part='j_bolt', bw=.02)
solid('ch_stem', boxbm(12.2, 12.6, .78, 1.15, 3.78, 3.95), M['steel'], part='j_bolt', bw=.02)
solid('ch_knob', prism(fillet([(12.0, 3.72), (12.85, 3.72), (12.85, 4.0), (12.0, 4.0)], .1), 1.1, 1.38), M['poly'], part='j_bolt', bw=.04)

# ---------------------------------------------------------------- iron sights (tag_iron_sight)
IS = 'tag_iron_sight'
solid('fs_tower', prism(fillet([(23.25, 3.3), (24.45, 3.3), (24.3, 4.15), (23.4, 4.15)], .08), -.32, .32), M['black'], part=IS, bw=.03)
for s in (1, -1):
    solid('fs_ear', prism(fillet([(23.4, 4.0), (24.3, 4.0), (24.15, 5.38), (23.6, 5.38)], .08), s * .2, s * .34), M['black'], part=IS,
          cuts=[prism(rrect_xz(23.7, 24.05, 4.35, 4.9, .08), -1, 1)], bw=.02)
solid('fs_post', boxbm(23.82, 23.98, -.05, .05, 4.1, SIGHT), M['steel'], part=IS, bw=0)
solid('rs_base', boxbm(-2.85, -1.5, -.42, .42, 4.25, 4.6), M['black'], part=IS, bw=.04)
for s in (1, -1):
    solid('rs_wing', prism(fillet([(-2.75, 4.55), (-1.6, 4.55), (-1.75, 5.55), (-2.55, 5.55)], .08), s * .28, s * .42), M['black'], part=IS, bw=.02)
ring('rs_aperture', .28, .12, -2.25, -2.05, M['black'], part=IS, z=SIGHT, seg=24, bw=0)
solid('rs_stem', boxbm(-2.25, -2.05, -.08, .08, 4.55, SIGHT - .26), M['black'], part=IS, bw=0)
solid('rs_knob', screw(-2.15, .45, 4.45, .12, .08, seg=12), M['steel'], part=IS, bw=0)

# ---------------------------------------------------------------- stock parts: barrel, flash hider, grip, stock
BA = 'tag_xm_barrel'
solid('barrel_in', cylbm(.3, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=BA, bw=.01)
solid('barrel', cylbm(.26, 23.5, MUZ + .05, SZ, seg=20), M['gunmetal'], part=BA, bw=.01)
ring('barrel_step', .32, .2, 25.2, 25.45, M['steel'], part=BA, seg=20, bw=.01)

MZ = 'tag_xm_muzzle'
solid('fh', cylbm(.34, MUZ, 29.47, SZ, seg=20), M['steel'], part=MZ,
      cuts=[boxbm(28.1, 29.7, -.06, .06, SZ, 2.7), rot_x(boxbm(28.1, 29.7, -.06, .06, SZ, 2.7), math.radians(120), SZ),
            rot_x(boxbm(28.1, 29.7, -.06, .06, SZ, 2.7), math.radians(240), SZ), cylbm(.15, 28.6, 29.6, SZ, seg=12)], bw=.03)
ring('fh_nut', .38, .24, MUZ, MUZ + .35, M['black'], part=MZ, seg=6, bw=.02)

GR = 'tag_xm_grip'
gp = prism(fillet([(-1.2, -0.6), (-0.6, -0.98), (-1.74, -6.62), (-2.3, -6.82), (-3.8, -6.65), (-4.02, -6.38), (-2.31, -0.5)], .3), -.55, .55)
solid('grip', gp, M['tan'], part=GR, bw=.12, seg=3)
for s in (1, -1):
    solid('grip_panel', prism(fillet([(-1.3, -2.0), (-2.0, -6.0), (-3.45, -5.85), (-2.65, -2.0)], .25), s * .5, s * .6), M['rubber'], part=GR,
          cuts=[bar(-1.2, z, -3.6, z - .3, .06, s * .57, s * .7) for z in (-2.6, -3.3, -4.0, -4.7, -5.4)], bw=.03)
solid('grip_logo', screw(-1.55, .57, -1.35, .24, .05, seg=20), M['black'], part=GR, bw=.01)
text('R', .2, (-1.55, .6, -1.35), part=GR, m=M['ink_t'], font=STENCIL)

ST = 'tag_xm_stock'
sk = prism(fillet([(-12.2, 4.55), (-14.4, 4.8), (-14.75, 4.55), (-14.75, -0.9), (-14.3, -1.25), (-13.6, -1.25), (-12.3, -0.1), (-12.2, .2)], .2), -.6, .6)
solid('stock', sk, M['poly'], part=ST, cuts=[prism(rrect_xz(-13.85, -12.86, -0.26, 3.1, .25), -1, 1)], bw=.08, seg=2)
solid('stock_rod', bar(-13.35, 3.0, -13.35, -0.15, .1, -.08, .08), M['steel'], part=ST, bw=.02)
solid('buttpad', prism(fillet([(-14.7, 4.7), (-15.19, 4.6), (-15.19, -1.1), (-14.7, -1.2)], .12), -.75, .75), M['rubber'], part=ST,
      cuts=[boxbm(-15.4, -15.05, -1, 1, z, z + .1) for z in [-0.8 + .32 * k for k in range(17)]], bw=.04)

# ---------------------------------------------------------------- the default belt pouch (tag_clip, 60 rounds)
CL = 'tag_clip'
solid('pouch', prism(fillet([(10.23, .58), (5.38, -0.14), (6.81, -7.34), (11.43, -6.79)], .35), -.85, .85), M['fabric'], part=CL, bw=.15, seg=3)
solid('pouch_lip', prism(fillet([(10.3, .7), (5.3, -0.02), (5.42, -0.4), (10.35, .3)], .08), -.9, .9), M['poly'], part=CL, bw=.04)
solid('pouch_logo', screw(6.95, .86, -1.5, .45, .04, seg=24), M['poly'], part=CL, cuts=[screw(6.95, .89, -1.5, .32, .04, seg=24)], bw=.01)
solid('pouch_seam', bar(6.0, -1.0, 7.2, -6.9, .05, .84, .9), M['poly'], part=CL, bw=0)
text('5.56x45MM', .2, (8.6, .87, -3.2), part=CL, m=M['ink_w'], font=STENCIL)
text('CASELESS', .16, (9.2, .87, -5.6), part=CL, m=M['ink_w'], font=STENCIL)
belt(CL)

# ---------------------------------------------------------------- muzzle attachments
CP = 'tag_xm_comp'   # RL-7.62 Compensator: a squared-off block with top and side ports
solid('comp', prism(fillet([(MUZ - .05, 1.77), (30.0, 1.77), (30.0, 2.61), (MUZ - .05, 2.61)], .12), -.42, .42), M['black'], part=CP,
      cuts=[boxbm(x, x + .22, -.3, .3, 2.3, 3) for x in (28.0, 28.5, 29.0, 29.5)] +
           [boxbm(x, x + .2, -1, 1, 2.05, 2.35) for x in (28.25, 28.75, 29.25)] + [cylbm(.16, 29.6, 30.2, SZ, seg=12)], bw=.03)
text('RL-7.62', .1, (28.6, .43, 1.92), part=CP, m=M['ink_w'], font=STENCIL)

SP = 'tag_xm_sup'    # Monolithic Suppressor: one long faceted can
solid('sup', cylbm(.5, MUZ - .3, 34.0, SZ, seg=8), M['black'], part=SP, cuts=[cylbm(.14, 33.6, 34.3, SZ, seg=12)], bw=.04)
for x in (MUZ - .3, 33.6):
    ring('sup_band', .53, .4, x, x + .4, M['steel'], part=SP, seg=8, bw=.01)
text('MONOLITHIC', .14, (30.8, .49, SZ), part=SP, m=M['ink_t'], font=STENCIL)

# ---------------------------------------------------------------- barrel attachments (each replaces tag_xm_barrel)
CH = 'tag_xm_chief'   # 19.3" R-556 Chief: a fluted barrel with a hex gas block
solid('ch_in', cylbm(.3, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=CH, bw=.01)
solid('ch_barrel', cylbm(.31, 23.5, MUZ + .05, SZ, seg=24), M['gunmetal'], part=CH,
      cuts=[rot_x(boxbm(25.4, 27.1, -.05, .05, SZ + .24, SZ + .4), math.radians(a), SZ) for a in range(0, 360, 60)], bw=.01)
solid('ch_block', cylbm(.48, 25.9, 26.6, SZ, seg=6), M['steel'], part=CH, cuts=[cylbm(.31, 25.8, 26.7, SZ, seg=20)], bw=.03)
text('CHIEF', .1, (26.25, .45, SZ), part=CH, m=M['ink_w'], font=STENCIL)

FR = 'tag_xm_fractal'   # 24" Fractal-LRB: a heavy barrel in a perforated shroud
solid('fr_in', cylbm(.32, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=FR, bw=.01)
solid('fr_barrel', cylbm(.3, 23.5, MUZ + .05, SZ, seg=20), M['gunmetal'], part=FR, bw=.01)
holes = [cylbm(.11, x, x + 3, SZ, y=0, seg=10, axis='y') for x in [23.9 + .42 * k for k in range(8)]]
solid('fr_shroud', cylbm(.46, 23.7, MUZ, SZ, seg=24), M['black'], part=FR,
      cuts=[cylbm(.36, 23.5, MUZ + .2, SZ, seg=24)] + holes + [vcyl(.1, x, 0, SZ, SZ + 1, 10) for x in [24.1 + .42 * k for k in range(8)]], bw=.02)
ring('fr_cap', .48, .28, MUZ - .25, MUZ, M['steel'], part=FR, seg=24, bw=.01)

CR = 'tag_xm_cryo'   # Cryo Shroud (custom): a frosted coolant jacket, blue lines glowing through the handguard windows
solid('cr_in', cylbm(.3, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=CR, bw=.01)
solid('cr_jacket', cylbm(.4, 23.5, MUZ, SZ, seg=24), M['frost'], part=CR, bw=.03)
for x in [25.4 + .35 * k for k in range(5)]:
    ring('cr_fin', .5, .35, x, x + .12, M['copper'], part=CR, seg=24, bw=0)
for s in (1, -1):
    solid('cr_line', cylbm(.12, 13.4, 23.4, 3.0, y=s * .48, seg=12), M['blue'], part=CR, bw=0)
    for x in (14.0, 17.0, 20.0, 22.8):
        ring('cr_clip', .17, .1, x, x + .15, M['copper'], part=CR, z=3.0, y=s * .48, seg=12, bw=0)
solid('cr_valve', cylbm(.2, 23.55, 23.9, 3.0, y=.48, seg=12), M['copper'], part=CR, bw=.01)

# ---------------------------------------------------------------- underbarrel, laser, optic
VA = 'tag_xm_vas'    # VAS Convergence Foregrip: a raked grip on the bottom rail
solid('vas_clamp', boxbm(17.0, 19.5, -.5, .5, -0.32, -0.05), M['black'], part=VA, bw=.04)
solid('vas_grip', prism(fillet([(17.3, -0.2), (19.3, -0.2), (18.9, -2.6), (17.8, -2.7)], .35), -.48, .48), M['tan'], part=VA,
      cuts=[boxbm(19.0, 19.6, -.6, .6, z - .05, z + .05) for z in (-0.8, -1.4, -2.0)], bw=.18, seg=3)
solid('vas_cap', prism(fillet([(17.6, -2.45), (19.05, -2.4), (18.95, -2.8), (17.7, -2.85)], .12), -.5, .5), M['rubber'], part=VA, bw=.05)

MF = 'tag_xm_mfs'    # MFS Motion Strike Laser: a box on the left side rail, two red lenses
solid('mfs_clamp', boxbm(16.8, 19.0, 1.0, 1.2, .9, 1.6), M['black'], part=MF, bw=.02)
solid('mfs_box', prism(fillet([(16.2, .75), (19.6, .75), (19.6, 1.75), (16.2, 1.75)], .18), 1.15, 1.75), M['black'], part=MF, bw=.06, seg=2)
for z in (1.0, 1.5):
    solid('mfs_lens', cylbm(.17, 19.55, 19.66, z, y=1.45, seg=16), M['laser'], part=MF, bw=0)
solid('mfs_btn', screw(17.2, 1.76, 1.25, .16, .08, seg=12), M['red'], part=MF, bw=.01)
text('MFS', .14, (18.0, 1.76, 1.3), part=MF, m=M['ink_w'], font=STENCIL)

RX = 'tag_xm_reflex'   # a compact reflex on the top rail
solid('rx_base', boxbm(1.0, 4.5, -.55, .55, RAIL, RAIL + .3), M['black'], part=RX, bw=.04)
solid('rx_hood', prism(fillet([(1.6, RAIL + .25), (4.2, RAIL + .25), (4.2, 6.0), (2.0, 6.0)], .2), -.75, .75), M['tan'], part=RX,
      cuts=[prism(rrect_xz(1.4, 4.4, 4.62, 5.68, .18), -.58, .58)], bw=.06, seg=2)
solid('rx_glass', boxbm(3.95, 4.0, -.58, .58, 4.62, 5.68), M['lens'], part=RX, bw=0)
solid('rx_emit', cylbm(.08, 1.7, 1.95, RAIL + .45, seg=10), M['dot'], part=RX, bw=0)
solid('rx_knob', screw(2.7, .76, RAIL + .5, .15, .1, seg=14), M['steel'], part=RX, bw=.02)

# ---------------------------------------------------------------- grip and stock attachments
LU = 'tag_xm_lucius'   # Lucius-90: a black rubber grip with finger grooves
lu = prism(fillet([(-1.2, -0.6), (-0.6, -0.98), (-0.95, -2.2), (-0.75, -2.6), (-1.15, -3.6), (-0.95, -4.0), (-1.4, -5.1), (-1.25, -5.5),
                   (-1.6, -6.7), (-3.7, -6.8), (-4.0, -6.5), (-2.9, -1.4), (-3.3, -0.7), (-2.31, -0.5)], .2), -.56, .56)
solid('lucius', lu, M['rubber'], part=LU, cuts=[boxbm(-4, 0, s * .52, s * 1, z, z + .07) for s in (1, -1) for z in (-2.0, -3.0, -4.0, -5.0)],
      bw=.12, seg=3)
text('LUCIUS', .14, (-2.5, .57, -1.4), part=LU, m=M['ink_w'], font=STENCIL)

AE = 'tag_xm_aegis'    # Aegis-X40: a solid stock with a cheek riser
ae = prism(fillet([(-12.2, 4.4), (-12.9, 4.5), (-13.4, 5.0), (-15.2, 5.0), (-15.4, 4.6), (-15.4, -1.5), (-14.6, -1.6), (-12.2, 0.1)], .25), -.7, .7)
solid('aegis', ae, M['poly'], part=AE, cuts=[prism(rrect_xz(-14.6, -13.2, .2, 2.6, .3), .55, 2), prism(rrect_xz(-14.6, -13.2, .2, 2.6, .3), -2, -.55)],
      bw=.12, seg=3)
solid('aegis_riser', prism(fillet([(-12.9, 4.9), (-15.0, 4.9), (-15.0, 5.3), (-13.3, 5.3)], .15), -.55, .55), M['tan'], part=AE, bw=.08)
solid('aegis_pad', prism(fillet([(-15.3, 5.0), (-15.85, 4.9), (-15.85, -1.4), (-15.3, -1.5)], .15), -.78, .78), M['rubber'], part=AE, bw=.06)
text('AEGIS X40', .16, (-14.0, .71, 3.6), part=AE, m=M['ink_t'], font=STENCIL)

# ---------------------------------------------------------------- magazines (each replaces tag_clip, moved by the reload)
FB = 'tag_xm_fastbelt'   # Wessi Fast Belt (50): a short rigid box
solid('fb_box', prism(fillet([(10.3, .5), (5.3, -0.12), (5.9, -4.0), (10.5, -3.7)], .25), -.82, .82), M['tan'], part=FB,
      cuts=[bar(6.0, z, 10.2, z + .3, .08, .78, 1) for z in (-1.4, -2.2, -3.0)], bw=.1, seg=3)
solid('fb_lid', prism(fillet([(10.4, .65), (5.2, .0), (5.3, -0.35), (10.45, .25)], .08), -.88, .88), M['black'], part=FB, bw=.04)
solid('fb_tab', prism(fillet([(10.5, -2.8), (11.1, -2.75), (11.0, -1.8), (10.5, -1.85)], .1), -.3, .3), M['poly'], part=FB, bw=.04)
text('WESSI 50', .18, (8.2, .83, -0.8), part=FB, m=M['ink_k'], font=STENCIL)
belt(FB)

EB = 'tag_xm_extbelt'   # Enforcer Extended Belt (85): a long pouch
solid('eb_pouch', prism(fillet([(10.6, .58), (5.2, -0.14), (6.4, -9.5), (12.0, -9.0)], .4), -1.0, 1.0), M['fabric'], part=EB, bw=.16, seg=3)
solid('eb_lip', prism(fillet([(10.7, .7), (5.1, -0.02), (5.25, -0.4), (10.75, .3)], .08), -1.04, 1.04), M['poly'], part=EB, bw=.04)
for z in (-3.0, -6.0):
    solid('eb_strap', bar(5.5, z + .2, 11.6, z + .6, .5, -1.06, 1.06), M['poly'], part=EB, bw=.04)
    solid('eb_buckle', boxbm(8.3, 8.9, 1.05, 1.12, z + .1, z + .75), M['steel'], part=EB, bw=.01)
text('ENFORCER', .2, (8.8, 1.01, -4.5), part=EB, m=M['ink_w'], font=STENCIL)
text('85', .4, (9.0, 1.01, -7.6), part=EB, m=M['ink_w'], font=STENCIL)
belt(EB)

LY = 'tag_xm_leyden'   # Leyden Spark Belt Fed: an ammo can with Leyden jars and a spark gap (it overheats and discharges)
solid('ly_can', prism(fillet([(5.2, .2), (11.0, .2), (11.0, -5.4), (5.2, -5.4)], .2), -1.0, 1.0), M['olive'], part=LY,
      cuts=[boxbm(5.6, 10.6, .95, 1.1, z, z + .1) for z in (-0.6, -4.9)], bw=.08, seg=2)
solid('ly_lid', boxbm(5.1, 11.1, -1.05, 1.05, .05, .38), M['olive'], part=LY, bw=.06)
solid('ly_plate', boxbm(5.6, 7.0, 1.0, 1.04, -1.5, -0.85), M['yellow'], part=LY, bw=.01)
text('HV', .3, (6.3, 1.05, -1.18), part=LY, m=M['ink_k'], font=STENCIL)
text('LEYDEN', .2, (8.4, -1.01, -2.5), part=LY, m=M['ink_w'], side=-1, font=STENCIL)
for x in (7.6, 9.9):   # two Leyden jars: glass, copper foil on the lower half, a cap and a ball terminal
    solid('jar', vcyl(.36, x, 1.42, -4.8, -2.3, 20), M['glass'], part=LY, bw=0)
    solid('foil', vcyl(.37, x, 1.42, -4.8, -3.6, 20), M['copper'], part=LY, bw=.01)
    solid('jar_cap', vcyl(.39, x, 1.42, -2.35, -2.15, 20), M['poly'], part=LY, bw=.02)
    solid('jar_rod', vcyl(.04, x, 1.42, -2.15, -1.7, 8), M['copper'], part=LY, bw=0)
    solid('jar_ball', vcyl(.11, x, 1.42, -1.75, -1.55, 12), M['copper'], part=LY, bw=.04, seg=3)
    for z in (-4.5, -2.8):
        solid('jar_strap', boxbm(x - .45, x + .45, 1.0, 1.06, z, z + .15), M['steel'], part=LY, bw=.01)
solid('gap_l', cylbm(.09, 8.0, 8.6, -1.0, y=1.25, seg=12, r2=.03), M['steel'], part=LY, bw=0)
solid('gap_r', cylbm(.03, 8.9, 9.5, -1.0, y=1.25, seg=12, r2=.09), M['steel'], part=LY, bw=0)
solid('gap_arc', cylbm(.045, 8.58, 8.92, -1.0, y=1.25, seg=8), M['blue'], part=LY, bw=0)
solid('gap_mount', boxbm(7.9, 9.6, 1.0, 1.12, -1.25, -0.75), M['poly'], part=LY, bw=.02)
solid('coil_core', cylbm(.14, 5.7, 10.6, -0.45, y=1.18, seg=12), M['steel'], part=LY, bw=0)
for x in [5.9 + .18 * k for k in range(25)]:
    ring('coil', .22, .13, x, x + .11, M['copper'], part=LY, z=-0.45, y=1.18, seg=14, bw=0)
belt(LY, z0=.5, n=6, ys=(1.18, 1.18, 1.1, .95, .8, .66))

TW = 'tag_xm_titan'   # Titan Wield: a 500-round drum slung under the handguard, fed through a box into the window
DZ = -2.85
notches = [rot_x(boxbm(25.9, 26.75, -.17, .17, DZ + 2.0, DZ + 2.5), math.radians(a), DZ) for a in range(0, 360, 20)]
panels = []
for s in (1, -1):
    for x0, x1 in ((10.4, 14.4), (15.6, 19.6), (20.8, 24.6)):
        panels.append(prism(rrect_xz(x0, x1, DZ - .7, DZ + .7, .3), s * 1.96, s * 3))
    for cx in (15.0, 20.2):
        panels.append(oval(cx, DZ, 1.0, 1.3, 0, s * 1.96, s * 3, n=4))
solid('tw_drum', cylbm(2.1, 9.0, 25.9, DZ, seg=40), M['poly'], part=TW, cuts=panels, bw=.08, seg=2)
solid('tw_ring', cylbm(2.2, 25.8, 26.8, DZ, seg=40), M['black'], part=TW, cuts=notches, bw=.04)
solid('tw_cap', cylbm(1.95, 26.75, 27.3, DZ, seg=40, r2=1.55), M['poly'], part=TW, bw=.06)
ring('tw_back', 2.15, 1.5, 9.0, 9.5, M['black'], part=TW, z=DZ, seg=40, bw=.03)
for x in (12.1, 17.3, 22.6):
    ring('tw_band', 2.13, 1.9, x, x + .25, M['black'], part=TW, z=DZ, seg=40, bw=.01)
solid('tw_hanger', boxbm(14.0, 20.0, -.45, .45, -0.85, -0.05), M['black'], part=TW, bw=.04)
solid('tw_box', prism(fillet([(3.7, -0.14), (9.1, -0.14), (9.1, -5.0), (4.4, -5.0), (3.7, -4.3)], .25), -1.25, 1.25), M['poly'], part=TW,
      cuts=[prism(rrect_xz(4.4, 8.6, z, z + .9, .2), 1.18, 2) for z in (-4.5, -3.2, -1.9)], bw=.1, seg=2)
solid('tw_box_lid', boxbm(3.6, 9.2, -1.3, 1.3, -0.3, 0.05), M['black'], part=TW, bw=.05)
solid('tw_chute', prism(fillet([(9.0, -1.4), (10.8, -1.4), (10.8, -4.4), (9.0, -4.4)], .2), -1.1, 1.1), M['black'], part=TW, bw=.06)
text('TITAN', .3, (6.4, 1.26, -2.75), part=TW, m=M['ink_w'], font=STENCIL)
text('500', .26, (6.4, 1.26, -4.05), part=TW, m=M['ink_w'], font=STENCIL)
belt(TW)

export(OUT, RENDER, 'xm', BAKED, tex=TEX, frame=(7.5, 0, -1.0), ortho=52)

if RENDER:   # close-ups of the bare gun (no attachments), then the kits
    sc = bpy.context.scene; co = sc.camera
    keep = ('part_tag_clip', 'part_tag_iron_sight', 'part_tag_xm_muzzle', 'part_tag_xm_barrel', 'part_tag_xm_grip', 'part_tag_xm_stock')
    for o in bpy.data.objects:
        if o.name.startswith('part_tag_') and o.name not in keep: o.hide_render = True
    for name, (x, z, sc_) in (('close_rcv', (4.0, 1.0, 16)), ('close_front', (21.0, 2.2, 16)), ('close_stock', (-8.0, 0.5, 16))):
        co.location = (x, 60, z); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = sc_
        sc.render.filepath = f'{RENDER}/xm_{name}.png'; bpy.ops.render.render(write_still=True)
    co.location = (-30, 26, 16)   # roughly the player's view: from behind, left and above
    co.rotation_euler = (Vector((8, 0, 2)) - co.location).to_track_quat('-Z', 'Z').to_euler(); co.data.ortho_scale = 36
    sc.render.filepath = f'{RENDER}/xm_close_hip.png'; bpy.ops.render.render(write_still=True)
    kits = (('a', ('iron_sight', 'xm_comp', 'xm_chief', 'xm_vas', 'xm_lucius', 'xm_aegis', 'xm_fastbelt')),
            ('b', ('xm_reflex', 'xm_sup', 'xm_cryo', 'xm_mfs', 'xm_grip', 'xm_stock', 'xm_leyden')),
            ('c', ('iron_sight', 'xm_muzzle', 'xm_fractal', 'xm_grip', 'xm_stock', 'xm_titan')),
            ('d', ('iron_sight', 'xm_muzzle', 'xm_barrel', 'xm_grip', 'xm_stock', 'xm_extbelt')))
    co.location = (7.5, 60, -1.5); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = 52
    for k, on in kits:
        for o in bpy.data.objects:
            if o.name.startswith('part_tag_'): o.hide_render = o.name[9:] not in on
        sc.render.filepath = f'{RENDER}/xm_kit_{k}.png'; bpy.ops.render.render(write_still=True)

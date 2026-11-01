# The Advanced Warfare guns' Gunsmith parts, built from scratch (our own models, nothing ripped).
#   blender -b -P .tools/build_aw_attachments.py
# Every part is one node of mods/bo3-weapons/parts/aw_attachments.glb, all sharing one baked atlas, so 40 parts cost one
# material and one texture set. aw-kits.json says which gun takes which node, on which bone, at what offset (mounts.js).
#
# Space: a part is modelled at its own origin, x forward (down the barrel), y the gun's left, z up, in the viewmodel's
# units (the Atlas 45 is about 40 long). Exported z-up on purpose: glTF axes = the tag's axes, so no rotation at mount.
# The material names hold "attachments", which keeps them out of the camo pass (camo.js SKIP).
# Small emissive discs named *_emit_beam_<colour> are laser emitters: mounts.js starts the beam at their centre.
import sys, os, math
sys.path.insert(0, os.path.join(os.getcwd(), '.tools'))
from bo7lib import *

OUT = os.path.abspath('export/web/mods/bo3-weapons/parts/aw_attachments.glb')
TEX = 2048
BAKED = ['steel', 'poly', 'alu', 'white', 'brass', 'copper', 'leather', 'blade', 'rubber', 'wood']

M.update(
    steel=worn('aw_steel', '#2c2e33', .38, 1., wear=.45, grain=.5),
    poly=worn('aw_poly', '#17181b', .62, 0., bare='#3a3c40', wear=.3, grain=.5, bare_metal=False),
    alu=worn('aw_alu', '#4b4f56', .34, 1., bare='#a8abb0', wear=.35, grain=.5),
    white=worn('aw_white', '#b9b6ae', .5, 0., bare='#5a5c60', wear=.4, grain=.5, dirt=.3),
    brass=worn('aw_brass', '#a07a35', .32, 1., bare='#d9b56a', wear=.5, grain=.5, dirt=.4),
    copper=worn('aw_copper', '#a5552b', .3, 1., bare='#e09a6a', wear=.4, grain=.5),
    leather=worn('aw_leather', '#4a2c18', .6, 0., bare='#6e4a2c', wear=.4, grain=.7, bare_metal=False, mottle=.4),
    blade=worn('aw_blade', '#8d9094', .24, 1., bare='#d4d6d9', wear=.6, grain=.4, brushed=.5),
    rubber=worn('aw_rubber', '#0f1012', .8, 0., bare='#25262a', wear=.15, grain=.4, bare_metal=False),
    wood=worn('aw_wood', '#5a3019', .5, 0., bare='#7c4b2a', wear=.3, grain=.6, bare_metal=False, mottle=.5),
    ered=mat('aw_attachments_emit_red', '#300000', .4, 0., '#ff2018', 2.5),
    egreen=mat('aw_attachments_emit_green', '#003000', .4, 0., '#28ff50', 2.),
    eblue=mat('aw_attachments_emit_blue', '#001830', .4, 0., '#4aa8ff', 1.6),
    eorange=mat('aw_attachments_emit_orange', '#301000', .4, 0., '#ff8020', 1.8),
    eamber=mat('aw_attachments_emit_amber', '#302000', .4, 0., '#ffc040', 1.6),
    bred=mat('aw_attachments_emit_beam_red', '#300000', .4, 0., '#ff2018', 5.),
    bgreen=mat('aw_attachments_emit_beam_green', '#003000', .4, 0., '#28ff50', 5.),
    glass=mat('aw_attachments_glass', '#7ad8ff', .08, 0., '#57c0ff', 1.),
)

CUR = None
N = [0]


def part(name):
    global CUR
    CUR = name; PARTS[name] = []


def P(bm, m='steel', bw=.1, cuts=(), seg=2, ang=30):
    N[0] += 1
    return solid(f'{CUR}{N[0]}', bm, M[m], part=CUR, cuts=cuts, bw=bw, seg=seg, ang=ang)


def L(bm, m, smooth=60):
    N[0] += 1
    return plain(f'{CUR}{N[0]}', bm, M[m], part=CUR, smooth=smooth)


def lathe(pts, seg=32, y=0., z=0., closed=True):
    """Revolve (x, r) points about a line along x. closed: the outline is a loop (a tube wall)."""
    bm = bmesh.new()
    rings = []
    for x, r in pts:
        rings.append([bm.verts.new((x, y + r * math.cos(2 * math.pi * k / seg), z + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)])
    n = len(rings)
    for i in range(n if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(seg):
            j = (k + 1) % seg
            bm.faces.new((a[k], a[j], b[j], b[k]))
    if not closed:
        bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def box(x0, x1, y0, y1, z0, z1, m='steel', bw=.12, cuts=()):
    return P(boxbm(x0, x1, y0, y1, z0, z1), m, bw, cuts)


def disc(x, r, m, y=0., z=0., t=.08, seg=24):
    return L(cylbm(r, x, x + t, z, y, seg=seg), m)


def turn(bm, deg, axis='X'):
    bm.transform(Matrix.Rotation(math.radians(deg), 4, axis))
    return bm


def at(bm, x, y, z):
    bm.transform(Matrix.Translation((x, y, z)))
    return bm


def shoe(x0, x1, w=1.5, z=0., h=.7, m='alu'):
    """A rail clamp: flat on top (z), with two cross bolts."""
    box(x0, x1, -w, w, z - h, z)
    for x in (x0 + (x1 - x0) * .25, x0 + (x1 - x0) * .75):
        o = L(at(turn(cylbm(.3, -w - .12, w + .12, 0, 0, seg=10), 90, 'Z'), x, 0, z - h * .5), 'alu')


def radial(x, r, a, rad=.22, h=.08, m='alu', seg=8):
    """A stud standing out from the x axis at radius r, a degrees round it."""
    return L(turn(at(turn(cylbm(rad, 0, h, 0, 0, seg=seg), -90, 'Y'), x, 0, r), a, 'X'), m)


def band(pts, x0, x1, t, m='leather', bw=.03):
    """A strap: the closed (y, z) outline pts, t thick, x0 to x1 along x."""
    n = len(pts)
    cy, cz = sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n
    inner = []
    for y, z in pts:
        l = math.hypot(y - cy, z - cz) or 1
        inner.append((y - (y - cy) / l * t, z - (z - cz) / l * t))
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for y, z in loop] for x, loop in ((x0, pts), (x1, pts), (x1, inner), (x0, inner))]
    for i in range(4):
        a, b = rings[i], rings[(i + 1) % 4]
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P(bm, m, bw)


# ---- muzzles (bore radius 1, x = 0 at the muzzle; x < 0 is the collar over the barrel; scaled to each gun's barrel) ----
part('brake')             # a collar (x < 0) slides over the real barrel, so the brake sits on it instead of hanging off the tip
P(lathe([(-2.6, .96), (-2.6, 1.2), (-.2, 1.2), (0, 1.5), (.5, 1.5), (.7, 1.35), (5.4, 1.35), (5.7, 1.2), (5.7, .96)]), 'steel', .05,
  cuts=[boxbm(1.2 + i * 1.35, 1.95 + i * 1.35, -2, 2, -.42, .42) for i in range(3)])
P(lathe([(.1, .96), (.1, 1.0), (5.5, 1.0), (5.5, .96)]), 'poly', 0)
for a in (40, 140, 220, 320):
    radial(-1.4, 1.17, a)

part('silencer')
P(lathe([(-3.2, .98), (-3.2, 1.22), (-.4, 1.22), (0, 1.5), (.6, 1.5), (.9, 1.72), (16.5, 1.72), (17.2, 1.45), (17.2, .5), (16.9, .5), (16.9, .98)], seg=36), 'poly', .05)
for x in (1.4, 2.0, 2.6, 15.0, 15.6):
    P(lathe([(x, 1.68), (x, 1.8), (x + .3, 1.8), (x + .3, 1.68)], seg=36), 'steel', 0)
for a in (40, 140, 220, 320):
    radial(-1.7, 1.19, a)

# ---- lasers (origin = the middle of the mounting face, the body hangs below it) ----
part('laser_tracker')
P(prism(fillet([(-.5, -.6), (7, -.6), (8.2, -1.0), (8.2, -2.9), (7, -3.3), (.4, -3.3), (-.5, -2.5)], .3), -1.25, 1.25), 'poly', .1)
box(.5, 6.5, -1.45, 1.45, -1.5, -.75, 'alu', .08)
shoe(.6, 6.4, 1.3)
P(lathe([(7.9, .62), (7.9, .92), (8.8, .92), (8.8, .62)], z=-1.95), 'steel', .03)
disc(8.45, .64, 'bred', z=-1.95, t=.12)
L(at(turn(cylbm(.2, -.05, .05, 0, 0, seg=10), 90, 'Z'), 3.2, 1.28, -2.45), 'ered')
L(at(turn(cylbm(.2, -.05, .05, 0, 0, seg=10), 90, 'Z'), 3.2, -1.28, -2.45), 'ered')

part('laser_sight')
P(lathe([(.2, 0.01), (.2, 1.25), (6.6, 1.25), (7, 1.05), (7, .8), (7.6, .8), (7.6, .01)], z=-1.75, closed=True), 'poly', .05)
for x in (1.1, 1.7, 2.3):
    P(lathe([(x, 1.2), (x, 1.34), (x + .28, 1.34), (x + .28, 1.2)], z=-1.75), 'alu', 0)
disc(7.55, .56, 'bgreen', z=-1.75, t=.1)
shoe(1.0, 6.2, 1.2)
box(1.2, 6, -.8, .8, -1.0, -.55, 'alu', .06)

# ---- under the barrel ----
part('foregrip')          # a stubby angled hand stop (origin = the top, centre of the shoe)
shoe(-3.2, 3.2, 1.6)
P(prism(fillet([(-3, -.7), (3, -.7), (4.2, -5.6), (3.2, -6.3), (.6, -6.3), (-1.2, -2.6)], .7), -1.35, 1.35), 'poly', .12)
for i in range(4):
    z = -2.4 - i * .85
    box(.2 + i * .28, 3.2 + i * .28, -1.5, 1.5, z - .22, z + .22, 'rubber', .06)

part('bipod')             # folded legs under the handguard, feet forward (origin = the hinge block's top)
shoe(-2.4, 2.4, 1.7)
box(-2, 2, -2.2, 2.2, -2.2, -.7, 'steel')
for s in (-1, 1):
    P(at(turn(cylbm(.55, 0, 14, 0, 0, seg=12), 5, 'Y'), .4, s * 1.75, -1.5), 'alu', 0)
    P(at(turn(cylbm(.72, 0, 7, 0, 0, seg=12), 5, 'Y'), .4, s * 1.75, -1.5), 'poly', .04)
    P(at(boxbm(0, 1.1, -.9, .9, -.7, .7), 14.1, s * 1.75, -2.8), 'rubber', .18)
    L(at(turn(cylbm(.32, -1, 1, 0, 0, seg=12), 90, 'Z'), .4, s * 1.75, -1.5), 'alu')

part('bayonet')           # Blunderbuss: a clamp under the forestock, the spike runs forward under the bell (origin = the top of the clamp)
P(prism(fillet([(-6, 0), (6, 0), (6.6, -1.1), (5, -2), (-5.4, -2), (-6.6, -1)], .3), -1.5, 1.5), 'steel', .1)
for x in (-3.4, 2.6):
    box(x, x + 1.1, -1.75, 1.75, -1.5, .05, 'brass', .06)
box(4, 6.2, -1.7, 1.7, -6.2, -1.6, 'brass', .12)
P(prism([(6, -2.5), (9, -2.4), (30, -3.7), (38.5, -5.6), (30, -5.9), (9, -5.5), (6, -5.5)], -.34, .34), 'blade', 0)
P(prism([(6, -3.6), (29, -4.45), (29, -4.75), (6, -4.3)], -.44, .44), 'steel', 0)

# ---- mags ----
part('mag_atlas')         # origin = the end of the stock magazine, on tag_clip
P(prism(fillet([(-3.6, .2), (3.6, .2), (3.4, -5.6), (2.8, -6), (-2.6, -6), (-3.4, -5.6)], .3), -1.75, 1.75), 'poly', .08)
box(-3.9, 3.9, -2.05, 2.05, -7, -5.8, 'steel', .15)
for z in (-1.5, -3, -4.5):
    L(boxbm(-1.2, 2.2, 1.72, 1.82, z - .16, z + .16), 'eamber')

part('mag_xmg')           # a bulged box, on tag_clip
box(-5, 5, -4.2, 4.2, -9, .4, 'poly', .25)
box(-5.6, 5.6, -4.8, 4.8, -10.2, -8.8, 'alu', .2)
for x in (-3, 0, 3):
    box(x - .5, x + .5, 4.14, 4.34, -7.5, -1, 'alu', .05)
L(boxbm(4.9, 5.08, -3, 3, -1.8, -1.2), 'eamber')

part('cell')              # a reserve cell clipped on the side
P(lathe([(0, .01), (.3, 1.25), (1, 1.5), (9, 1.5), (9.7, 1.25), (10, .01)], closed=False), 'white', .03)
for x in (2.1, 5, 7.9):
    P(lathe([(x - .3, 1.42), (x - .3, 1.62), (x + .3, 1.62), (x + .3, 1.42)]), 'alu', 0)
L(lathe([(2.6, 1.46), (2.6, 1.54), (4.5, 1.54), (4.5, 1.46)]), 'eblue')
L(lathe([(5.5, 1.46), (5.5, 1.54), (7.4, 1.54), (7.4, 1.46)]), 'eblue')
box(2, 8, -1.9, -1.2, -.8, .8, 'alu', .08)

part('drum_ohm')          # the Capacitor Drum on tag_clip
drum = lathe([(-3.2, .01), (-3.2, 8.2), (-2.6, 8.8), (2.6, 8.8), (3.2, 8.2), (3.2, .01)], seg=40, closed=False)
P(at(turn(drum, 90, 'Z'), 0, 0, -7.5), 'poly', .1)
ring = lathe([(-3.35, 3.5), (-3.35, 4.8), (3.35, 4.8), (3.35, 3.5)], seg=32)
P(at(turn(ring, 90, 'Z'), 0, 0, -7.5), 'alu', .05)
for a in range(0, 360, 45):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    L(at(turn(cylbm(.32, -3.4, 3.4, 0, 0, seg=8), 90, 'Z'), c * 6.8, 0, -7.5 + s * 6.8), 'alu')
L(at(turn(lathe([(-3.42, 2.3), (-3.42, 3.0), (3.42, 3.0), (3.42, 2.3)], seg=28), 90, 'Z'), 0, 0, -7.5), 'eamber')

part('belt_box')          # MG Turret: an ammo box at the end of the gun's own feed tube, on an arm from the receiver (mounted turned 180 degrees: x back, y out of the gun)
box(-1, 13, -9, -1.2, -13, -1, 'alu', .3, cuts=[boxbm(1 + i * 3, 2 + i * 3, -9.2, -8.8, -11, -3) for i in range(4)])
box(-1.4, 13.4, -9.5, -.8, -14, -12.6, 'steel', .2)
box(-.8, 12.8, -8.8, -1.4, -1.2, -.6, 'steel', .2)
P(at(turn(lathe([(0, 2), (0, 3), (1.2, 2.7), (1.2, 2)], seg=24), -90, 'Y'), 6.5, -4.6, -.8), 'steel', .08)    # the throat the feed tube runs into
box(-3.5, 1.5, -1.4, 2.8, -4.2, -1, 'steel', .15)     # the arm
box(-3.9, 1.9, 2.5, 3, -5, -.2, 'steel', .1)          # its plate on the receiver
for x in (-3.2, 1.2):
    for z in (-4.3, -.9):
        L(at(turn(cylbm(.28, 3, 3.14, 0, 0, seg=10), 90, 'Z'), x, 0, z), 'alu')

part('saddle')            # a shell carrier on the left of the receiver (origin = its back face, centre)
box(0, 15, .05, .7, -2.6, 2.6, 'poly', .15)
for i in range(5):
    x = 1.9 + i * 2.8
    L(at(turn(lathe([(-2, .01), (-2, 1.0), (2.2, 1.0), (2.2, .01)], seg=18, closed=False), 90, 'Y'), x, 1.55, 0), 'white')
    L(at(turn(lathe([(2.2, .01), (2.2, 1.08), (3.1, 1.08), (3.1, .01)], seg=18, closed=False), 90, 'Y'), x, 1.55, 0), 'brass')
P(boxbm(.3, 14.7, .6, 1.1, -1.5, -1.0), 'rubber', .05)
P(boxbm(.3, 14.7, .6, 1.1, 1.0, 1.5), 'rubber', .05)

part('shell_strip')       # a short flat strip of shells for the Bulldog (same idea, four)
box(0, 11, .05, .55, -2.1, 2.1, 'alu', .12)
for i in range(4):
    x = 1.6 + i * 2.6
    L(at(turn(lathe([(-1.6, .01), (-1.6, .92), (1.2, .92), (1.2, .01)], seg=16, closed=False), 90, 'Y'), x, 1.4, 0), 'poly')
    L(at(turn(lathe([(1.2, .01), (1.2, 1.0), (2, 1.0), (2, .01)], seg=16, closed=False), 90, 'Y'), x, 1.4, 0), 'brass')

part('speedloader')       # a clamp round the barrel, an arm, and a tray with two loaded speedloaders on it (origin = the bore)
P(lathe([(-1.3, 1.58), (-1.3, 2.15), (1.3, 2.15), (1.3, 1.58)], seg=28), 'steel', .08)
box(-1.1, 1.1, 1.9, 3.1, -.9, .9, 'steel', .1)
box(-6.4, 6.4, 2.55, 3.0, -2.75, 2.4, 'alu', .1)        # the back plate rests on the loading tube
box(-6.4, 6.4, 2.55, 8.2, -3.05, -2.6, 'alu', .1)       # the tray under the loaders
L(cylbm(.42, -6.4, 6.4, 0, 5.75, seg=12), 'alu')        # the spine they sit on
for s in (-1, 1):
    box(s * 6 - .4, s * 6 + .4, 2.55, 6.3, -3, .7, 'alu', .08)
for cx in (-3.1, 3.1):
    P(lathe([(cx - 1.2, .4), (cx - 1.2, 2.4), (cx - .3, 2.4), (cx - .3, .4)], y=5.75, seg=24), 'alu', .05)
    for a in range(6):
        y, z = 5.75 + 1.5 * math.cos(a * 1.047), 1.5 * math.sin(a * 1.047)
        L(lathe([(cx - .3, 0.01), (cx - .3, .6), (cx + 2.2, .6), (cx + 2.4, .32), (cx + 2.4, .01)], y=y, z=z, seg=10, closed=False), 'brass')

# ---- barrels and bodies, one gun each ----
part('hunter')            # the M1 Irons' Hunter Barrel: a sleeve closed down on the barrel at both ends, slotted so the real front sight still stands (origin = the bore at the muzzle)
P(lathe([(-9.3, 1.58), (-9.3, 2.05), (-8.5, 2.05), (-8.2, 2.85), (5.4, 2.85), (6, 2.45), (6, 1.4), (5.5, 1.4), (5.5, 2.25), (-7.6, 2.25), (-7.6, 1.58)], seg=32), 'steel', .05,
  cuts=[boxbm(-5.7, 1, -.95, .95, 1.5, 4)] + [boxbm(1.7 + i * 1.25, 2.5 + i * 1.25, -4, 4, -.5, .5) for i in range(3)])
box(-8, -5.8, -.8, .8, 2.7, 2.95, 'steel', .08)
box(1.1, 5.2, -.8, .8, 2.7, 2.95, 'steel', .08)
for x in (-7.4, -6.2):
    P(lathe([(x, 2.8), (x, 2.98), (x + .4, 2.98), (x + .4, 2.8)], seg=32), 'alu', 0, cuts=[boxbm(x - 1, x + 1, -1, 1, 2, 4)])

part('titan')             # the Atlas's heavy slide weight (origin = the top of the slide at the muzzle)
P(prism(fillet([(-13, -.15), (2, -.15), (3.2, -1.2), (3.2, -5.4), (2, -6.2), (-.5, -6.2), (-.5, -2.0), (-13, -1.3)], .3), -3.5, 3.5), 'steel', .1,
  cuts=[boxbm(-12 + i * 2.2, -11.1 + i * 2.2, -4, 4, -3, 1) for i in range(5)] + [cylbm(1.4, -1, 4, -2.12, seg=20)])

part('arcrails')          # RW1: two copper rails on a bed clamped over the barrel housing (origin = their front, on the housing's top)
box(-20, 0, -2.2, 2.2, -.1, .6, 'poly', .1)
for x in (-17.6, -12.2, -6.8, -1.4):
    box(x - .8, x + .8, -2.52, 2.52, .15, .78, 'alu', .08)
    box(x - .8, x + .8, 2.24, 2.54, -1.9, .7, 'alu', .06)
    box(x - .8, x + .8, -2.54, -2.24, -1.9, .7, 'alu', .06)
for s in (-1, 1):
    a, b = sorted((s * .75, s * 1.85))
    box(-19.7, -.3, a, b, .6, 1.15, 'white', .06)
    a, b = sorted((s * .9, s * 1.7))
    box(-20, 0, a, b, 1.15, 1.95, 'copper', .08)
    L(boxbm(-19.5, -.5, a + .06, b - .06, 1.95, 2.01), 'eblue')
L(boxbm(-19.4, -.6, -.5, .5, .6, .68), 'eblue')

part('railcap')           # RW1: a capacitor pod on each flank, under the aim line (z 12.2): the top stays clear (origin = 12 up, front of the pods)
for s in (-1, 1):
    y, z = s * 3.15, -2.4
    y0, y1 = sorted((s * 1.95, s * 2.7))
    box(-12.6, .2, y0, y1, -4.4, -2.3, 'poly', .1)                  # a plate on the gun's flank
    for x in (-10.2, -2.4):                                         # two cradle arms out to the tube
        ya, yb = sorted((s * 2.4, s * 3.2))
        box(x - .5, x + .5, ya, yb, -3.6, -1.7, 'alu', .08)
    P(lathe([(-12.4, .01), (-12.4, .7), (-12, 1.15), (-.6, 1.15), (-.2, .7), (-.2, .01)], y=y, z=z, seg=18, closed=False), 'alu', .06)
    for x in (-11.2, -6, -1.4):
        P(lathe([(x - .3, 1.1), (x - .3, 1.26), (x + .3, 1.26), (x + .3, 1.1)], y=y, z=z, seg=18), 'steel', 0)
    L(lathe([(-9.6, 1.12), (-9.6, 1.22), (-8, 1.22), (-8, 1.12)], y=y, z=z, seg=18), 'eblue')
    L(lathe([(-4.6, 1.12), (-4.6, 1.22), (-3, 1.22), (-3, 1.12)], y=y, z=z, seg=18), 'eblue')

part('recall')            # RW1: a magnet coil on a block clamped along the under rail (origin = the rail, centre)
box(-8.6, 8.6, -2, 2, -1, .35, 'alu', .1)
for x in (-8.8, 8.8):
    box(x - .6, x + .6, -1.2, 1.2, -3.2, -.6, 'alu', .1)
P(lathe([(-9, .01), (-9, 1.5), (9, 1.5), (9, .01)], z=-2.3, seg=24, closed=False), 'steel', .08)
for i in range(11):
    x = -7.2 + i * 1.44
    P(lathe([(x - .4, 1.4), (x - .4, 1.85), (x + .4, 1.85), (x + .4, 1.4)], z=-2.3, seg=24), 'copper', 0)
disc(9, 1.1, 'eblue', z=-2.3)

part('overcharge')        # RW1: three field rings on rods from a sleeve over the square muzzle head (origin = the bore at the muzzle's face)
box(-3.6, 0, -2.66, 2.66, -3.16, 2.52, 'alu', .1, cuts=[boxbm(-4, -.3, -2.34, 2.34, -2.84, 2.2), cylbm(1.5, -.5, .5, 0)])
for s in (-1, 1):
    for z in (-2.2, 1.6):
        L(at(turn(cylbm(.26, 0, .1, 0, 0, seg=10), 90, 'Z'), -1.8, s * 2.62, z), 'steel')
for x, r in ((.9, 3.1), (3.3, 3.25), (5.7, 3.4)):
    P(lathe([(x, r - .6), (x, r), (x + 1.1, r), (x + 1.1, r - .6)], seg=32), 'alu', .08)
    L(lathe([(x + .2, r - .72), (x + .2, r - .6), (x + .9, r - .6), (x + .9, r - .72)], seg=32), 'eblue')
for y in (-2, 2):
    for z in (-2, 2):
        P(boxbm(-.1, 6.8, y - .24, y + .24, z - .24, z + .24), 'steel', .04)

part('coil')              # Ignition Coil: a glowing wrap round the barrel (origin = the bore; scaled to the gun)
P(lathe([(-5, .96), (-5, 1.25), (5, 1.25), (5, .96)], seg=24), 'steel', .03)
for i in range(9):
    x = -4.1 + i * 1.02
    P(lathe([(x - .28, 1.2), (x - .28, 1.55), (x + .28, 1.55), (x + .28, 1.2)], seg=24), 'copper', 0)
    L(lathe([(x + .29, 1.2), (x + .29, 1.48), (x + .72, 1.48), (x + .72, 1.2)], seg=24), 'eorange')

part('jacket')            # MG Turret: a fixed cooling jacket from the receiver to the barrels' end; the barrels spin inside it (origin = the spin axis)
P(lathe([(-26.4, 5.75), (-26.4, 6.4), (-25.6, 6.6), (25, 6.6), (26, 6.2), (26.8, 5.15), (26.2, 5.15), (25.4, 5.75)], seg=40), 'poly', .08)
for i in range(22):
    x = -24.2 + i * 2.3
    P(lathe([(x - .35, 6.5), (x - .35, 7.5), (x + .35, 7.5), (x + .35, 6.5)], seg=40), 'alu', 0)

part('shield')            # MG Turret: a gun shield with a sight slit, bracketed to the receiver's front (origin = the spin axis)
P(lathe([(-1.6, 5.75), (-1.6, 6.3), (1.4, 6.3), (1.4, 5.75)], seg=36), 'steel', .08)
for y, z in ((-7.4, -5.2), (7.4, -5.2), (-7.4, 5.4), (7.4, 5.4)):
    box(-2.8, .1, y - .9, y + .9, z - .9, z + .9, 'steel', .12)
plate = [(-13, -11), (13, -11), (15.5, -4), (15.5, 7), (12, 12.5), (3, 14.2), (-3, 14.2), (-12, 12.5), (-15.5, 7), (-15.5, -4)]
bm = bmesh.new()
a = [bm.verts.new((-.5 + 2.6 * (1 - math.cos(math.radians(y * 2.6))), y, z)) for y, z in plate]
b = [bm.verts.new((.5 + 2.6 * (1 - math.cos(math.radians(y * 2.6))), y, z)) for y, z in plate]
bm.faces.new(a); bm.faces.new(b[::-1])
for i in range(len(a)):
    j = (i + 1) % len(a); bm.faces.new((a[i], b[i], b[j], a[j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
P(bm, 'alu', .18, cuts=[lathe([(-2, .01), (-2, 6.0), (5, 6.0), (5, .01)], seg=32, closed=False), boxbm(-3, 5, -6, 6, 9.2, 10.6)])
for y, z in ((-12, -7), (12, -7), (-13, 5), (13, 5), (-9, 11), (9, 11)):
    bow = 2.6 * (1 - math.cos(math.radians(y * 2.6)))    # the plate curves forward towards its edges
    L(lathe([(bow - .9, .01), (bow - .9, .55), (bow, .55), (bow, .01)], y=y, z=z, seg=10, closed=False), 'steel')

part('breacher')          # Tac-19: a toothed breaching choke (origin = the muzzle's bore; bore radius 1, scaled)
P(lathe([(-1.2, .96), (-1.2, 1.32), (-.2, 1.32), (0, 1.5), (.4, 1.7), (6, 1.7), (6, .96)], seg=30), 'steel', .05,
  cuts=[turn(boxbm(1.6, 4.4, -.4, .4, -3, 3), a, 'X') for a in (0, 60, 120)])
for a in range(0, 360, 60):
    tooth = prism([(5.8, 1.1), (6, 1.9), (7.9, 1.2), (6.4, 1.1)], -.42, .42)
    P(turn(tooth, a + 30, 'X'), 'blade', 0)

part('duckbill')          # Bulldog: a flat duckbill spreader on a collar over the barrel (origin = the bore; bore radius 1)
P(lathe([(-3, .96), (-3, 1.3), (-.3, 1.3), (0, 1.45), (1.6, 1.45), (1.6, .96)], seg=24), 'steel', .05)
for a in (0, 180):
    radial(-1.5, 1.27, a)
bm = bmesh.new()
sec = [(1.5, 1.4, 1.4), (8.5, 4.2, .6), (9.4, 4.4, .5)]
rings = []
for x, w, h in sec:
    rings.append([bm.verts.new((x, sw * w, sh * h)) for sw, sh in ((1, 1), (-1, 1), (-1, -1), (1, -1))])
for r0, r1 in zip(rings, rings[1:]):
    for k in range(4):
        j = (k + 1) % 4; bm.faces.new((r0[k], r0[j], r1[j], r1[k]))
bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
P(bm, 'steel', .12, cuts=[boxbm(4, 9.8, -3.4, 3.4, -.22, .22)])

part('bell')              # Blunderbuss: a brass flare over the bell's rim, opening out of its mouth (origin = the mouth)
P(lathe([(-3.4, 8.3), (-3.4, 9.25), (-1.5, 9.35), (0, 9.6), (2, 10.6), (3.6, 11.8), (4.2, 12), (4.2, 11.2), (2.6, 9.9), (1, 8.5), (-.1, 7.5)], seg=48), 'brass', .06)
for a in range(0, 360, 30):
    radial(-2.2, 9.28, a, .34, .24, 'steel')

part('doublelock')        # Blunderbuss: a second hammer and frizzen on a plate flat against the +y side (origin = the back of the plate)
P(prism(fillet([(-5, -1.4), (6, -1.4), (7.4, 0), (6, 1.4), (-4, 1.6)], .5), 0, .5), 'brass', .06)
P(prism(fillet([(-3.4, .6), (-2, .9), (-.8, 2.6), (.4, 3.8), (.2, 4.5), (-1.1, 3.9), (-2.4, 2.4)], .3), .45, .95), 'steel', .05)
P(prism([(2.2, 1), (3.6, 1), (3.9, 3.2), (3, 3.4)], .45, .95), 'steel', .05)
L(at(turn(cylbm(.55, .35, 1.05, 0, 0, seg=14), 90, 'Z'), -2.6, 0, .4), 'brass')
for x in (-3.4, 4.8):
    L(at(turn(cylbm(.3, .44, .56, 0, 0, seg=10), 90, 'Z'), x, 0, -.4), 'steel')

part('box_leather')       # Blunderbuss: a cartridge box buckled to the stock by two closed straps (origin = its back, centre; the stock's section sets their shape)
P(prism(fillet([(-5, -3), (5, -3), (5, 3), (-5, 3)], .8), .05, 3.2), 'leather', .2)
P(prism(fillet([(-5.3, .4), (5.3, .4), (5.3, 3.3), (-5.3, 3.3)], .6), -.05, 3.5), 'leather', .15)
L(at(turn(cylbm(.55, 3.45, 3.65, 0, 0, seg=14), 90, 'Z'), 0, 0, 1.4), 'brass')
for x, top, bot in ((-1.9, 8.75, -13.2), (1.9, 9.1, -14.6)):
    half = [(0, top), (1.1, top - .25), (2.2, 5.9), (3.05, 2.4), (3.3, -.2), (3.05, -5), (2.5, bot + 2.2), (2.1, bot + .7), (1.1, bot + .15), (0, bot)]
    pts = [(y - 2.6, z - 2) for y, z in half] + [(-y - 2.6, z - 2) for y, z in half[-2:0:-1]]
    band(pts, x - .7, x + .7, .22, 'leather', .05)
    box(x - .9, x + .9, 3.2, 3.7, -2.6, -.2, 'brass', .06)

part('fins')              # CEL-3: open heat fins on all three lobes of the front, which turns a third with each shot (origin = its spin axis)
for a in (0, 120, 240):
    P(turn(boxbm(-9.2, 9.2, -2.25, 2.25, 6.05, 6.45), a, 'X'), 'steel', .1)
    L(turn(boxbm(-8.9, 8.9, -.7, .7, 6.45, 6.6), a, 'X'), 'eorange')
    for i in range(7):
        x = -8.1 + i * 2.7
        P(turn(boxbm(x - .4, x + .4, -2.1, 2.1, 6.3, 7.7), a, 'X'), 'alu', .08)
        L(turn(boxbm(x - .46, x + .46, -1.7, 1.7, 6.95, 7.25), a, 'X'), 'eorange')

part('prism')             # CEL-3: a crystal focus on a plate over all three barrels (origin = the spin axis, on their faces)
barrels = [(3.2 * math.cos(math.radians(a)), 3.2 * math.sin(math.radians(a))) for a in (90, 210, 330)]
P(lathe([(0, .01), (0, 5.2), (.9, 5.2), (1.1, 4.9), (1.1, .01)], seg=36, closed=False), 'alu', .06,
  cuts=[cylbm(1.72, -1, 2, z, y, seg=20) for y, z in barrels])
for y, z in barrels:
    P(lathe([(-.7, 1.7), (-.7, 2.1), (1.25, 2.1), (1.25, 1.7)], y=y, z=z, seg=20), 'steel', .04)
P(lathe([(1, .01), (1, .6), (2.4, .4), (2.4, .01)], seg=12, closed=False), 'steel', .03)
for a in (30, 150, 270):
    claw = prism([(1, 2.6), (1.4, 3.4), (4.6, 2.75), (7.5, .8), (6.7, .85), (4.6, 1.75), (3, 2.1)], -.6, .6)
    P(turn(claw, a - 90, 'X'), 'steel', .06)
bm = bmesh.new()
top, bot = bm.verts.new((8.8, 0, 0)), bm.verts.new((1.8, 0, 0))
eq = [bm.verts.new((4.6, 1.9 * math.cos(k * 1.047), 1.9 * math.sin(k * 1.047))) for k in range(6)]
for k in range(6):
    j = (k + 1) % 6; bm.faces.new((top, eq[k], eq[j])); bm.faces.new((bot, eq[j], eq[k]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
N[0] += 1
plain(f'prism{N[0]}', bm, M['glass'], part=CUR, smooth=5)

part('bandolier')         # MDL: grenades in a carrier on the stock (origin = the carrier's back, centre)
box(-8, 8, .05, .6, -3.2, 3.2, 'poly', .15)
for x in (-5.3, 0, 5.3):
    P(at(turn(lathe([(-3, .01), (-2.4, 1.7), (1.4, 1.7), (1.7, 1.4), (2.6, .8), (2.8, .01)], seg=18, closed=False), 90, 'Y'), x, 2.2, 0), 'alu', .04)
    P(at(turn(lathe([(-2.4, 1.68), (-2.4, 1.78), (-1.5, 1.78), (-1.5, 1.68)], seg=18), 90, 'Y'), x, 2.2, 0), 'copper', 0)
    box(x - 2, x + 2, .1, 2.2, -1.8, -1.2, 'rubber', .1)

part('rotary')            # MDL: a motor bolted on the drum's front face (origin = the drum's axis, on its face)
P(lathe([(0, 1.5), (0, 6), (.8, 6.4), (1.6, 6.4), (1.6, 1.5)], seg=40), 'steel', .08)
for a in range(0, 360, 45):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    L(lathe([(1.5, .01), (1.5, .55), (2, .55), (2, .01)], y=c * 5.2, z=s * 5.2, seg=8, closed=False), 'alu')
P(lathe([(1.4, 2), (1.4, 3.2), (4.2, 3.2), (4.2, 2)], seg=28), 'poly', .08)
L(lathe([(4.1, 2.25), (4.1, 2.8), (4.3, 2.8), (4.3, 2.25)], seg=28), 'eamber')

part('longtube')          # MDL: a sleeve that lengthens the tube (origin = the muzzle's bore; bore radius 1)
P(lathe([(-5, .96), (-5, 1.45), (0, 1.45), (.8, 1.2), (15, 1.2), (16, 1.55), (18, 1.55), (18, .9), (15, .9), (15, .96)], seg=30), 'steel', .05,
  cuts=[turn(boxbm(3 + i * 3, 4.6 + i * 3, -3, 3, -.4, .4), 90 * (i % 2), 'X') for i in range(4)])

part('plate')             # XMG Bulwark: an armour plate over the forearm rig (origin = the gun's axis, on top)
bm = lathe([(-16, 7), (-16, 7.8), (14, 7.8), (14, 7)], seg=48)
P(bm, 'alu', .2, cuts=[boxbm(-17, 15, -9, 9, -9, 3.4)])
for x in (-11, -3.5, 4, 11):
    P(lathe([(x, 7.75), (x, 8.05), (x + .4, 8.05), (x + .4, 7.75)], seg=48), 'steel', 0, cuts=[boxbm(x - 1, x + 1, -9, 9, -9, 3.6)])
L(boxbm(-14, 14, -.3, .3, 7.82, 7.92), 'eamber')

part('motor')             # XMG Overclock: a feed motor (origin = its mounting face, centre)
box(-6, 6, -3.4, 3.4, -.2, 3.4, 'steel', .2)
P(at(lathe([(-7.6, .01), (-7.6, 2.4), (7.6, 2.4), (7.6, .01)], seg=24, closed=False), 0, 0, 4), 'alu', .1)
for i in range(9):
    x = -5.6 + i * 1.4
    P(lathe([(x - .3, 2.3), (x - .3, 2.72), (x + .3, 2.72), (x + .3, 2.3)], z=4, seg=24), 'copper', 0)
L(lathe([(7.5, .01), (7.5, 1.4), (7.7, 1.4), (7.7, .01)], z=4, seg=20, closed=False), 'eamber')

part('spike')             # XMG Seismic: a piston spike under the gun (origin = its mounting face, centre)
box(-4, 4, -3, 3, -1.8, .1, 'steel', .2)
P(at(turn(lathe([(0, .01), (0, 1.6), (6, 1.6), (6.6, 1.3), (6.6, .01)], seg=20, closed=False), 90, 'Y'), 0, 0, -1.6), 'alu', .05)
P(at(turn(lathe([(6.4, .01), (6.4, 1.1), (9, 1), (14, .08), (14, .01)], seg=20, closed=False), 90, 'Y'), 0, 0, -1.6), 'blade', 0)

part('anchor')            # XMG Shock Anchor: a charge ring on the gun's flank (origin = its mounting face, centre)
box(-5, 5, -2.8, 2.8, -.1, 1.2, 'steel', .15)
P(at(turn(lathe([(0, 2.5), (0, 4.8), (1.8, 4.8), (1.8, 2.5)], seg=32), -90, 'Y'), 0, 0, 1.1), 'alu', .15)
L(at(turn(lathe([(.3, 2.6), (.3, 3.3), (2, 3.3), (2, 2.6)], seg=32), -90, 'Y'), 0, 0, 1.1), 'eblue')
L(at(turn(cylbm(2.6, 0, .3, 0, seg=24), -90, 'Y'), 0, 0, 1.4), 'poly')

part('stabilizer')        # a saddle over the stock with a gyro let into its top (origin = the stock's top, centre)
P(prism(fillet([(-8, 0), (8, 0), (8, 1.4), (3, 2.7), (-6, 2.7), (-8, 1.8)], .5), -2.7, 2.7), 'poly', .15)
box(-7.6, 7.6, -3, -2.6, -2.4, .4, 'poly', .1)
box(-7.6, 7.6, 2.6, 3, -2.4, .4, 'poly', .1)
P(at(turn(lathe([(0, .01), (0, 1.9), (.5, 1.9), (.7, 1.6), (.7, .01)], seg=24, closed=False), -90, 'Y'), -1.6, 0, 2.5), 'alu', .05)
L(at(turn(lathe([(.14, 1.86), (.14, 1.98), (.42, 1.98), (.42, 1.86)], seg=24), -90, 'Y'), -1.6, 0, 2.5), 'eblue')
L(at(turn(lathe([(.68, .01), (.68, .5), (.86, .5), (.86, .01)], seg=12, closed=False), -90, 'Y'), -1.6, 0, 2.5), 'steel')

part('sil_xmg')           # XMG: three small cans, one on each barrel, held by two spiders (origin = the cluster's axis at the tips)
BX = [(0, 4.52), (3.8, -2.35), (-3.8, -2.35)]
for y, z in BX:
    P(lathe([(-1.2, .86), (-1.2, 1.12), (-.2, 1.12), (.2, 1.5), (.5, 2), (11, 2), (11.5, 1.8), (11.5, .6), (11.2, .6), (11.2, .86)], y=y, z=z, seg=20), 'poly', .04)
    for x in (1.2, 1.8, 2.4, 9.6, 10.2):
        P(lathe([(x, 1.96), (x, 2.06), (x + .26, 2.06), (x + .26, 1.96)], y=y, z=z, seg=20), 'steel', 0)
for x in (3.4, 8):
    P(lathe([(x, .01), (x, 5.2), (x + .6, 5.2), (x + .6, .01)], seg=30, closed=False), 'steel', .05, cuts=[cylbm(1.98, x - 1, x + 2, z, y, seg=18) for y, z in BX])

part('brake_xmg')         # XMG: a short ported brake on each barrel, tied by a spider (origin = the cluster's axis at the tips)
for y, z in BX:
    P(lathe([(-1.2, .86), (-1.2, 1.12), (-.2, 1.12), (.1, 1.55), (5, 1.55), (5.3, 1.3), (5.3, .86)], y=y, z=z, seg=18), 'steel', .04,
      cuts=[boxbm(1.2 + i * 1.25, 1.85 + i * 1.25, y - 2, y + 2, z - .36, z + .36) for i in range(3)])
P(lathe([(.2, .01), (.2, 4.9), (.8, 4.9), (.8, .01)], seg=30, closed=False), 'alu', .05, cuts=[cylbm(1.53, -1, 2, z, y, seg=16) for y, z in BX])

export(OUT, None, 'aw_attachments', BAKED, tex=TEX, yup=False, spread=120)

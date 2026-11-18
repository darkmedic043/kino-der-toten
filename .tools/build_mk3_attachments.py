# The GKZ-45 Mk3's own Gunsmith parts (user, 2026-11-18: "build a few custom attachment for the gkz, make them cool"),
# built from scratch (our own models, nothing ripped).
#   blender -b -P .tools/build_mk3_attachments.py [-- --preview scratch/gkz/r]
# Every part is one node of mods/bo3-weapons/parts/mk3_attachments.glb sharing one baked atlas, like the AW set
# (build_aw_attachments.py). The kit is in mods/bo3-weapons/mk3-kit.js; the effects in mk3.js.
#
# Space: each part is modelled straight in its gun's own space (tag_weapon / tag_weapon_le at rest: x forward, y the
# gun's left, z up, viewmodel units), measured from the two view models (right gun 47 long, bore z 7.15; left gun
# 36 long, bore z 10.4). So every mount is at [0,0,0] on the gun's root tag with no mirroring (mount.hand).
# Exported z-up (glTF axes = the tag's axes). Material names hold "attachments": the camo pass skips them.
# --preview <dir>: after the export, renders the parts on the measured guns (scratch/gkz/*.npz, from measure.py).
import sys, os, math
sys.path.insert(0, os.path.join(os.getcwd(), '.tools'))
from bo7lib import *

OUT = os.path.abspath('export/web/mods/bo3-weapons/parts/mk3_attachments.glb')
TEX = 1024
BAKED = ['steel', 'brass', 'copper', 'dark']

M.update(
    steel=worn('mk3_steel', '#3a3d44', .36, 1., bare='#9ea2a8', wear=.4, grain=.5),
    brass=worn('mk3_brass', '#9c7a3c', .3, 1., bare='#dcbc72', wear=.5, grain=.5, dirt=.3),
    copper=worn('mk3_copper', '#a5552b', .28, 1., bare='#e8a070', wear=.4, grain=.4),
    dark=worn('mk3_dark', '#1a1a20', .55, .6, bare='#55575e', wear=.3, grain=.5),
    egreen=mat('mk3_attachments_emit_green', '#0c3010', .3, 0., '#7dff6a', 2.2),
    eviolet=mat('mk3_attachments_emit_violet', '#200a30', .3, 0., '#b060ff', 2.4),
    crystal=mat('mk3_attachments_crystal', '#2a7a30', .05, 0., '#9dff8a', 1.8),
    glass=mat('mk3_attachments_glass', '#a8f0c0', .06, 0., '#7dff6a', .5),
)

CUR = None
N = [0]


def part(name):
    global CUR
    CUR = name; PARTS[name] = []


def P(bm, m='steel', bw=.06, cuts=(), seg=2, ang=30):
    N[0] += 1
    return solid(f'{CUR}{N[0]}', bm, M[m], part=CUR, cuts=cuts, bw=bw, seg=seg, ang=ang)


def L(bm, m, smooth=60):
    N[0] += 1
    return plain(f'{CUR}{N[0]}', bm, M[m], part=CUR, smooth=smooth)


def lathe(pts, seg=32, y=0., z=0., closed=True):
    """Revolve (x, r) points about a line along x through (y, z). closed: the outline is a loop (a tube wall)."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y + r * math.cos(2 * math.pi * k / seg), z + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)] for x, r in pts]
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


def sweep(path, radii, seg=10):
    """A tube along the polyline `path` (points), radius per point, capped."""
    bm = bmesh.new(); rings = []
    pts = [Vector(p) for p in path]
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < .9 else Vector((0, 1, 0))
        u = d.cross(up).normalized(); v = d.cross(u).normalized()
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg)) * radii[i]) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            j = (k + 1) % seg
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def ring(x0, x1, r0, r1, y=0., z=0., seg=32):
    """A flat ring (washer/collar) along x."""
    return lathe([(x0, r0), (x0, r1), (x1, r1), (x1, r0)], seg=seg, y=y, z=z)


def box(x0, x1, y0, y1, z0, z1, m='steel', bw=.1, cuts=()):
    return P(boxbm(x0, x1, y0, y1, z0, z1), m, bw, cuts)


def turn(bm, deg, axis='X'):
    bm.transform(Matrix.Rotation(math.radians(deg), 4, axis))
    return bm


def at(bm, x, y, z):
    bm.transform(Matrix.Translation((x, y, z)))
    return bm


def upright(pts, x, y, z, seg=20, closed=True):
    """A lathe standing on z (points are (height, r)), its foot at (x, y, z)."""
    return at(turn(lathe(pts, seg=seg, closed=closed), -90, 'Y'), x, y, z)


# ---- Eris Prism: right gun (Mark III), a focusing collar on the thin barrel with three crystals that converge ahead --
RZ = 7.15                                    # the right gun's bore axis (tag_flash z)
part('mk3_prism')
for x0 in (19.6, 25.4):                      # two clamp collars round the barrel (its section reaches 3.25 from the axis)
    P(ring(x0, x0 + 1.3, 3.3, 4.15, z=RZ), 'steel', .05)
    P(ring(x0 + .25, x0 + 1.05, 4.1, 4.35, z=RZ), 'brass', .02)
for k in range(3):                           # the crystals: hex shards on arms, tilted toward the bore ahead
    a = math.radians(90 + 120 * k); cy, cz = math.cos(a), math.sin(a)
    r0 = 5.6
    arm = sweep([(21.5, cy * 4.0, RZ + cz * 4.0), (22.4, cy * r0, RZ + cz * r0), (26.0, cy * r0, RZ + cz * r0), (26.0, cy * 4.0, RZ + cz * 4.0)], [.32, .32, .32, .32], seg=8)
    P(arm, 'brass', .02)
    tilt = math.radians(math.degrees(math.atan2(r0 - 2.4, 30)))   # the shards aim at the axis about 30 ahead
    def place(bm):
        bm.transform(Matrix.Rotation(-tilt, 4, 'Y')); bm.transform(Matrix.Translation((20.6, 0, r0 + .2)))
        bm.transform(Matrix.Rotation(a - math.pi / 2, 4, 'X')); bm.transform(Matrix.Translation((0, 0, RZ))); return bm
    L(place(lathe([(0, .01), (1.8, .95), (6.6, .95), (9.4, .01)], seg=6, closed=False)), 'crystal', smooth=0)
    P(place(lathe([(1.2, .9), (1.2, 1.2), (2.4, 1.2), (2.4, .9)], seg=6)), 'brass', .02)   # the shard's socket

# ---- Overcharge Capacitor: right gun, two glass capacitor tubes on a saddle over the rear housing --------------------
part('mk3_capacitor')
P(prism(fillet([(-9.1, 10.4), (-3.9, 10.4), (-3.9, 11.6), (-4.6, 12.0), (-8.6, 12.0), (-9.1, 11.5)], .3), -2.7, 2.7), 'dark', .1)
for y in (-2.85, 2.55):                      # cheek plates down the housing's flanks
    box(-8.8, -4.2, y, y + .3, 8.2, 11.8, 'steel', .05)
for y in (-1.45, 1.45):
    P(upright([(0, 1.25), (.5, 1.25), (.5, 1.05), (3.0, 1.05), (3.0, 1.25), (3.5, 1.25), (3.7, .5), (3.7, .01)], -6.5, y, 11.9, closed=False), 'glass', 0)
    L(upright([(.4, .01), (.4, .55), (3.1, .55), (3.1, .01)], -6.5, y, 11.9, closed=False, seg=12), 'egreen')
    for h in (0, 3.1):
        P(upright([(h, .01), (h, 1.32), (h + .5, 1.32), (h + .5, .01)], -6.5, y, 11.9, closed=False), 'copper', .03)
    for h in (1.2, 2.0):                     # copper windings
        P(upright([(h, 1.05), (h, 1.17), (h + .35, 1.17), (h + .35, 1.05)], -6.5, y, 11.9), 'copper', 0)
    P(upright([(0, .01), (0, .3), (.6, .2), (.6, .01)], -6.5, y, 15.6, closed=False, seg=10), 'brass', .02)   # the terminal
P(sweep([(-6.5, -1.45, 16.1), (-6.5, -.6, 16.6), (-6.5, .6, 16.6), (-6.5, 1.45, 16.1)], [.16] * 4, seg=8), 'copper', 0)   # bus bar between the terminals
P(sweep([(-5.0, 2.0, 12.4), (-3.2, 2.0, 12.3), (-2.0, 1.9, 11.6)], [.22, .22, .22], seg=8), 'dark', 0)   # the feed into the housing

# ---- Eris Cell Bank: a glowing cell under each gun (right: below the front housing; left: both flanks of the body) --
def cell(x0, x1, y, z, r=1.25):
    P(lathe([(x0, .01), (x0, r * .7), (x0 + .4, r + .15), (x1 - .4, r + .15), (x1, r * .7), (x1, .01)], seg=20, y=y, z=z, closed=False), 'glass', 0)
    L(lathe([(x0 + .5, .01), (x0 + .5, r * .55), (x1 - .5, r * .55), (x1 - .5, .01)], seg=12, y=y, z=z, closed=False), 'egreen')
    for xa, xb in ((x0 - .3, x0 + .55), (x1 - .55, x1 + .3)):
        P(lathe([(xa, .01), (xa, r + .3), (xb, r + .3), (xb, .01)], seg=20, y=y, z=z, closed=False), 'brass', .04)
    P(lathe([(x0 - .9, .01), (x0 - .9, .35), (x0 - .3, .35), (x0 - .3, .01)], seg=10, y=y, z=z, closed=False), 'copper', .02)   # contact pin

part('mk3_cell_r')
cell(14.6, 21.0, 0, .55)
for x in (15.4, 19.9):                       # bands from the cell up into the housing (its underside is at z 2.2-3.5)
    P(lathe([(x, 1.55), (x, 1.85), (x + .7, 1.85), (x + .7, 1.55)], seg=20, z=.55), 'steel', .02)
    box(x, x + .7, -.5, .5, 2.2, 3.9, 'steel', .05)

part('mk3_cell_l')
for s in (-1, 1):                            # the left gun's body is 4-4.6 wide at x 0..5, its top 12.5-14.5
    y = s * 5.5
    cell(-.6, 6.4, y, 11.2, r=1.1)
    for x in (.4, 4.6):
        P(lathe([(x, 1.35), (x, 1.62), (x + .6, 1.62), (x + .6, 1.35)], seg=20, y=y, z=11.2), 'steel', .02)
        box(x, x + .6, min(y - s * .2, s * 4.0), max(y - s * .2, s * 4.0), 10.7, 11.7, 'steel', .05)

# ---- Event Horizon Coil: left gun, a containment claw round the funnel's mouth (front rim at x 27-28.7, r ~8.5) ----
LZ = 10.6                                    # the left gun's bore axis
part('mk3_horizon')
P(ring(26.2, 28.4, 8.3, 9.4, z=LZ, seg=40), 'dark', .06)
for x in (26.5, 27.2, 27.9):                 # copper windings round the collar
    P(ring(x, x + .4, 9.35, 9.65, z=LZ, seg=40), 'copper', 0)
L(ring(28.4, 28.75, 7.2, 9.0, z=LZ, seg=40), 'eviolet')   # the event horizon: a violet lip in front of the mouth
for k in range(4):                           # four claws reaching forward and in, tipped with violet
    a = math.radians(45 + 90 * k); cy, cz = math.cos(a), math.sin(a)
    path = [(27.0, 9.0), (30.5, 9.4), (33.5, 8.1), (35.6, 5.9), (36.6, 4.2)]
    P(sweep([(x, cy * r, LZ + cz * r) for x, r in path], [.75, .7, .55, .42, .2], seg=10), 'steel', .03)
    for x, r in ((30.5, 9.4), (33.4, 8.1)):  # knuckles
        P(at(lathe([(-.45, .01), (-.45, .62), (.45, .62), (.45, .01)], seg=12, closed=False), x, cy * (r + .05), LZ + cz * (r + .05)), 'brass', .02)
    L(sweep([(x, cy * r, LZ + cz * r) for x, r in [(35.5, 5.75), (36.3, 4.6), (37.0, 3.6)]], [.36, .3, .05], seg=8), 'eviolet')

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
export(OUT, None, 'mk3_attachments', BAKED, tex=TEX, yup=False, spread=120)
print('[mk3] exported', OUT)

if '--preview' in args:
    out = args[args.index('--preview') + 1]; os.makedirs(out, exist_ok=True)
    exec(open(os.path.join(os.getcwd(), 'scratch/gkz/preview.py')).read().split("if __name__")[0])
    import numpy as np
    for o in list(bpy.data.objects): o.hide_render = True
    for gun, parts, tag in (('wpn_t7_zmb_dlc3_raygun_mk3_view', ['mk3_prism', 'mk3_capacitor', 'mk3_cell_r'], 'r'),
                            ('wpn_t7_zmb_dlc3_raygun_mk3_dw_view', ['mk3_cell_l', 'mk3_horizon'], 'l')):
        for o in bpy.data.objects: o.hide_render = True
        g = gun_mesh(f'scratch/gkz/{gun}.npz', 'gun_' + tag)
        for p in parts: bpy.data.objects['part_' + p].hide_render = False
        bb = np.load(f'scratch/gkz/{gun}.npz')['v']; lo, hi = bb.min(0), bb.max(0); lo[0] -= 2; hi[0] += 9
        cam_views(f'{out}/{tag}', (lo + hi) / 2, (hi - lo).max() * 1.1, VIEWS)

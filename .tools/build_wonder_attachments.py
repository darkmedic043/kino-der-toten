# The wonder weapons' own Gunsmith parts (user, 2026-11-18: "custom attachments for all the wonder weapons besides the
# bows"), built from scratch (our own models, nothing ripped): Ray Gun, Thundergun, Winter's Howl, DG-2, Wave Gun and
# the Zap Guns. The kits and effects live in mods/weapon-levels (wonder-kits.js); placements in wonder-mounts.json.
#   blender -b -P .tools/build_wonder_attachments.py [-- --preview scratch/wonder/r]
# Every part is one node (part_<name>) of mods/weapon-levels/parts/wonder_attachments.glb sharing one baked atlas.
#
# Space: each part is modelled straight in its gun's mount bone at rest (x forward, y the gun's left, z up, the
# viewmodel's own units), measured from the view models (scratch/wonder/measure.py): BO1 guns have no tag_weapon, so
# that is j_gun (j_gun1 for the Zap Guns' left gun); the DG-2's is tag_weapon. So every mount is at [0,0,0], no mirror.
# The DG-2 is huge (133 long): its parts are modelled at true size, then shrunk by DGS about the origin so they don't
# take most of the atlas, and mounted with "scale": DGS. Exported z-up. Material names hold "attachments" (camo skips).
# --preview <dir>: renders every gun with its parts (from the measured scratch/wonder/*.npz) and prints a clearance
# report (triangles crossing the gun, vertices inside it, gap to it) per part.
import sys, os, math
sys.path.insert(0, os.path.join(os.getcwd(), '.tools'))
from bo7lib import *

OUT = os.path.abspath('export/web/mods/weapon-levels/parts/wonder_attachments.glb')
TEX = 1024
DGS = 4.                                     # DG-2 parts: modelled true size, stored at 1/DGS, mounted at scale DGS
BAKED = ['steel', 'brass', 'copper', 'dark', 'ceramic']

M.update(
    steel=worn('wonder_steel', '#3a3d44', .36, 1., bare='#9ea2a8', wear=.4, grain=.5),
    brass=worn('wonder_brass', '#9c7a3c', .3, 1., bare='#dcbc72', wear=.5, grain=.5, dirt=.3),
    copper=worn('wonder_copper', '#a5552b', .28, 1., bare='#e8a070', wear=.4, grain=.4),
    dark=worn('wonder_dark', '#1a1a20', .55, .6, bare='#55575e', wear=.3, grain=.5),
    ceramic=worn('wonder_ceramic', '#cfc6b0', .45, 0., bare='#ece4d0', wear=.2, grain=.3, bare_metal=False, dirt=.3),
    egreen=mat('wonder_attachments_emit_green', '#0c3010', .3, 0., '#7dff6a', 2.2),
    eblue=mat('wonder_attachments_emit_blue', '#0a1830', .3, 0., '#6ab8ff', 2.6),
    eice=mat('wonder_attachments_emit_ice', '#1a3a50', .2, 0., '#a8e8ff', 1.8),
    glassg=mat('wonder_attachments_glass_green', '#a8f0c0', .06, 0., '#7dff6a', .4, alpha=.5),
    glassb=mat('wonder_attachments_glass_blue', '#b0d8ff', .06, 0., '#6ab8ff', .35, alpha=.45),
    glassi=mat('wonder_attachments_glass_ice', '#c8eeff', .08, 0., '#a8e8ff', .3, alpha=.5),
    crystal=mat('wonder_attachments_crystal_ice', '#5ab0d8', .05, 0., '#bdf2ff', 1.5),
)

CUR = None
N = [0]


def part(name):
    global CUR
    CUR = name; PARTS[name] = []


def P(bm, m='steel', bw=.03, cuts=(), seg=2, ang=30):
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


def rod(x0, x1, r, y=0., z=0., seg=16):
    return lathe([(x0, .001), (x0, r), (x1, r), (x1, .001)], seg=seg, y=y, z=z, closed=False)


def ball(x, y, z, r, seg=14):
    return lathe([(x - r * math.cos(t), max(r * math.sin(t), .001)) for t in [math.pi * k / 8 for k in range(9)]], seg=seg, y=y, z=z, closed=False)


def box(x0, x1, y0, y1, z0, z1, m='steel', bw=.03, cuts=()):
    return P(boxbm(x0, x1, y0, y1, z0, z1), m, bw, cuts)


def turn(bm, deg, axis='X'):
    bm.transform(Matrix.Rotation(math.radians(deg), 4, axis))
    return bm


def at(bm, x, y, z):
    bm.transform(Matrix.Translation((x, y, z)))
    return bm


def polar(x, r, deg, y0=0., z0=0.):
    """A point at radius r and angle deg (0 = +y, 90 = +z) round the x-line through (y0, z0)."""
    a = math.radians(deg)
    return (x, y0 + r * math.cos(a), z0 + r * math.sin(a))


def helix(x0, x1, r, turns, y=0., z=0., a0=0., n=None):
    n = n or int(turns * 24) + 2
    return [polar(x0 + (x1 - x0) * k / (n - 1), r, a0 + 360 * turns * k / (n - 1), y, z) for k in range(n)]


def vane(pts_xr, th, deg, twist, y0=0., z0=0.):
    """A blade drawn in the (x, r) plane, th thick, set at angle deg round the x-line and twisted along x."""
    bm = prism(pts_xr, -th / 2, th / 2)
    xs = [p[0] for p in pts_xr]; xa, xb = min(xs), max(xs)
    for v in bm.verts:
        x, t, r = v.co; a = math.radians(deg + twist * (x - xa) / (xb - xa))
        v.co = Vector((x, y0 + r * math.cos(a) - t * math.sin(a), z0 + r * math.sin(a) + t * math.cos(a)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def along(bm, d, o):
    """Lathe/sweep made along +x, laid along unit direction d, its x=0 at point o."""
    d = Vector(d).normalized()
    bm.transform(Matrix.Translation(o) @ Vector((1, 0, 0)).rotation_difference(d).to_matrix().to_4x4())
    return bm


# =================================== RAY GUN (j_gun; bore z 2.62, y -0.04, muzzle cone x 7.9..9.93, rod to 10.94) ===
RY, RZ = -.04, 2.62

# ---- Focusing Lens: a brass bell over the muzzle cone with a green glass lens and a focus ring ahead of the rod -------
part('rg_lens')
P(lathe([(9.62, .86), (9.62, 1.02), (9.78, 1.1), (10.06, 1.1), (10.06, .92)], y=RY, z=RZ), 'steel', .02)   # collar on the cone's lip
P(lathe([(10.0, .95), (10.62, 1.5), (10.66, 1.6), (10.04, 1.07)], y=RY, z=RZ, seg=40), 'brass', .01)       # the bell
L(ring(10.0, 10.09, .2, .97, y=RY, z=RZ), 'glassg')                                                     # the lens
L(ring(10.09, 10.12, .45, .82, y=RY, z=RZ), 'egreen')
for k in range(8):                                                                                       # rim studs
    P(ball(*polar(10.64, 1.6, 22.5 + 45 * k, RY, RZ), .07, seg=8), 'copper', 0)
for k in range(3):                                                                                       # struts to the focus ring
    a = 90 + 120 * k
    P(sweep([polar(10.55, 1.42, a, RY, RZ), polar(11.0, .9, a, RY, RZ), polar(11.3, .42, a, RY, RZ)], [.05, .045, .04], seg=6), 'brass', 0)
P(ring(11.22, 11.36, .3, .44, y=RY, z=RZ, seg=20), 'copper', .01)
L(ring(11.25, 11.33, .26, .31, y=RY, z=RZ, seg=20), 'egreen')

# ---- Particle Accelerator: two clamp rings (the rear one notched for the fin), three copper rails, a green sleeve ----
part('rg_accelerator')
notch = [boxbm(5.4, 6.0, -.3 + RY, .3 + RY, RZ + .35, RZ + 1.2)]
P(ring(5.55, 5.82, .48, .84, y=RY, z=RZ), 'steel', .02, cuts=notch)
P(ring(6.82, 7.12, .48, .84, y=RY, z=RZ), 'steel', .02)
L(ring(5.82, 6.82, .5, .57, y=RY, z=RZ, seg=24), 'egreen')
for a in (30, 150, 270):
    P(rod(5.5, 7.18, .085, *polar(0, .8, a, RY, RZ)[1:], seg=10), 'copper', .01)
    for x in (6.05, 6.55):                                                                               # coil beads on the rails
        P(lathe([(x, .085), (x, .14), (x + .22, .14), (x + .22, .085)], seg=10, y=polar(0, .8, a, RY, RZ)[1], z=polar(0, .8, a, RY, RZ)[2]), 'copper', 0)
    L(ball(*polar(7.24, .8, a, RY, RZ), .1, seg=8), 'egreen')

# ---- Plasma Canister: a green cell along the body's left flank, strapped on, a feed tube into the barrel housing -----
part('rg_canister')
CY, CZ = 2.36, 2.2
P(lathe([(1.0, .01), (1.0, .38), (1.12, .5), (3.48, .5), (3.6, .38), (3.6, .01)], seg=20, y=CY, z=CZ, closed=False), 'glassg', 0)
L(rod(1.15, 3.45, .32, CY, CZ, seg=12), 'egreen')
for xa, xb in ((.86, 1.22), (3.38, 3.74)):                                                              # end caps
    P(lathe([(xa, .01), (xa, .48), (xa + .06, .55), (xb - .06, .55), (xb, .48), (xb, .01)], seg=20, y=CY, z=CZ, closed=False), 'brass', .01)
for x in (1.6, 2.85):                                                                                    # straps and saddles to the body
    P(ring(x, x + .22, .5, .58, y=CY, z=CZ, seg=20), 'steel', 0)
    box(x, x + .22, 1.3, CY - .45, CZ - .28, CZ + .28, 'dark', .02)
P(sweep([(3.74, CY, CZ), (4.05, CY - .1, CZ), (4.35, 1.6, CZ + .1), (4.5, 1.0, CZ + .2)], [.11, .11, .1, .1], seg=8), 'copper', 0)
P(rod(.66, .86, .1, CY, CZ, seg=8), 'copper', 0)                                                         # contact pin

# ---- Tesla Coil: a wound coil lying on the rear top plate, green glow at both ends --------------------------------------
part('rg_coil')
KZ = 5.3
P(rod(-3.5, -1.0, .26, RY, KZ, seg=16), 'dark', .02)
for k in range(9):
    x = -3.2 + .23 * k
    P(ring(x, x + .14, .26, .4, y=RY, z=KZ, seg=16), 'copper', 0)
for x0, x1 in ((-3.62, -3.4), (-1.1, -.88)):
    P(lathe([(x0, .01), (x0, .4), (x0 + .04, .44), (x1 - .04, .44), (x1, .4), (x1, .01)], seg=16, y=RY, z=KZ, closed=False), 'brass', .01)
L(ball(-3.72, RY, KZ, .2, seg=10), 'egreen'); L(ball(-.78, RY, KZ, .2, seg=10), 'egreen')
for x, zb in ((-3.25, 4.55), (-1.45, 4.1)):                                                              # legs to the plate
    box(x, x + .2, RY - .2, RY + .2, zb, KZ - .2, 'steel', .02)
for k in range(5):                                                                                       # a crown of spikes on the rear cap
    P(sweep([polar(-3.6, .3, 90 + 45 * (k - 2), RY, KZ), polar(-3.95, .55, 90 + 45 * (k - 2), RY, KZ)], [.05, .015], seg=6), 'copper', 0)

# =================================== THUNDERGUN (j_gun; bore z 9.66; funnel x 16..24.7, r 4.75) ======================
TZ = 9.66

# ---- Vortex Choke: a collar on the funnel's mouth, eight twisted vanes and an outer ring ----------------------------
part('tg_choke')
P(lathe([(23.5, 4.7), (23.5, 5.2), (23.7, 5.32), (24.8, 5.32), (24.95, 5.2), (24.95, 4.5)], seg=48, z=TZ), 'steel', .04)
for k in range(16):
    P(ball(*polar(24.2, 5.32, 11.25 + 22.5 * k, 0, TZ), .13, seg=8), 'brass', 0)
for k in range(8):
    P(vane([(24.7, 4.95), (24.95, 5.35), (27.6, 6.05), (27.6, 5.75), (25.6, 4.95)], .16, 45 * k, 28, 0, TZ), 'brass', .02)
P(lathe([(27.3, 5.75), (27.3, 6.1), (27.5, 6.25), (28.05, 6.25), (28.2, 6.1), (28.2, 5.75)], seg=48, z=TZ), 'dark', .03)
for x in (27.42, 27.98):
    P(ring(x, x + .1, 6.2, 6.3, z=TZ, seg=48), 'copper', 0)

# ---- Turbine: an air turbine pod clamped to the funnel's left flank, fan inside its intake ---------------------------
part('tg_turbine')
PY_, PZ = 6.0, TZ
P(lathe([(16.7, .35), (17.0, .85), (17.5, 1.08), (21.6, 1.15), (21.9, 1.25), (22.6, 1.25), (22.6, 1.05), (21.95, .95)], seg=28, y=PY_, z=PZ), 'steel', .03)
P(lathe([(16.2, .2), (16.2, .4), (16.75, .4), (16.75, .2)], seg=16, y=PY_, z=PZ), 'brass', .02)          # exhaust nozzle
L(rod(21.9, 22.0, .96, PY_, PZ, seg=28), 'dark')                                                        # the dark throat
P(rod(21.95, 22.45, .22, PY_, PZ, seg=14), 'brass', .01)                                                 # hub and spinner
P(lathe([(22.45, .22), (22.7, .1), (22.78, .001)], seg=14, y=PY_, z=PZ, closed=False), 'brass', 0)
for k in range(9):                                                                                       # fan blades
    P(vane([(22.05, .2), (22.4, .2), (22.4, .92), (22.05, .92)], .05, 40 * k, 35, PY_, PZ), 'copper', 0)
for k in range(10):                                                                                      # intake grille bars
    P(sweep([polar(22.62, .12, 18 + 36 * k, PY_, PZ), polar(22.62, 1.12, 18 + 36 * k, PY_, PZ)], [.035, .035], seg=6), 'steel', 0)
for x in (17.9, 20.6):                                                                                   # bands and saddles to the funnel
    P(ring(x, x + .45, 1.13, 1.3, y=PY_, z=PZ, seg=28), 'brass', .02)
    box(x, x + .45, 4.6, PY_ - .9, PZ - .45, PZ + .45, 'dark', .03)
for k in range(4):                                                                                       # cooling ribs along the pod
    P(vane([(17.6, 1.08), (21.4, 1.12), (21.4, 1.3), (17.6, 1.26)], .1, -40 + 45 * k, 0, PY_, PZ), 'steel', 0)

# ---- Pressure Chamber: a third tank on the left flank of the rear, strapped on, with a gauge and a feed pipe ---------
part('tg_chamber')
QY, QZ = 4.85, 7.6
P(lathe([(-10.2, .01), (-10.2, .7), (-9.9, 1.05), (-4.9, 1.05), (-4.6, .7), (-4.6, .01)], seg=28, y=QY, z=QZ, closed=False), 'steel', .03)
for xa, xb in ((-10.35, -9.75), (-5.05, -4.45)):
    P(lathe([(xa, .01), (xa, .9), (xa + .1, 1.12), (xb - .1, 1.12), (xb, .9), (xb, .01)], seg=28, y=QY, z=QZ, closed=False), 'brass', .02)
for x in (-9.0, -5.9):                                                                                   # straps to the body
    P(ring(x, x + .35, 1.04, 1.2, y=QY, z=QZ, seg=28), 'dark', .01)
    box(x, x + .35, 3.0, QY - .95, QZ - .4, QZ + .4, 'dark', .03)
P(at(turn(lathe([(0, .01), (0, .3), (.5, .3), (.5, .2), (.8, .2), (.8, .45), (.95, .45), (.95, .01)], seg=14, closed=False), -90, 'Y'), -7.6, QY, QZ + 1.0), 'brass', .01)   # valve
P(at(turn(lathe([(0, .01), (0, .55), (.25, .55), (.25, .01)], seg=24, closed=False), 90, 'Z'), -7.3, QY + 1.0, QZ), 'brass', .01)   # gauge bezel
L(at(turn(lathe([(0, .01), (0, .46), (.04, .46), (.04, .01)], seg=24, closed=False), 90, 'Z'), -7.3, QY + 1.25, QZ), 'ceramic')
P(sweep([(-7.3, QY + 1.3, QZ), (-7.3 + .32, QY + 1.31, QZ + .12)], [.03, .02], seg=5), 'dark', 0)       # needle
P(sweep([(-4.45, QY, QZ), (-4.0, QY - .1, QZ - .1), (-3.4, 3.6, QZ - .4), (-3.1, 2.7, QZ - .6)], [.2, .2, .2, .2], seg=10), 'copper', 0)

# ---- Bellows Stock: an accordion bellows in the valley between the top tanks, on saddles, with a hose forward -------
part('tg_bellows')
BZ = 12.95
pts = []
for k in range(19):
    pts.append((-9.2 + .3 * k, .62 if k % 2 else .86))
P(lathe([(-9.2, .01)] + pts + [(-3.8, .01)], seg=24, z=BZ, closed=False), 'dark', 0)
for xa, xb in ((-9.6, -9.15), (-3.85, -3.4)):
    P(lathe([(xa, .01), (xa, .85), (xa + .08, .98), (xb - .08, .98), (xb, .85), (xb, .01)], seg=24, z=BZ, closed=False), 'brass', .02)
for x in (-9.55, -3.75):                                                                                 # saddles on the tanks
    box(x, x + .35, -1.25, 1.25, 11.95, BZ - .55, 'steel', .03)
P(at(turn(lathe([(0, .01), (0, .14), (.3, .14), (.3, .01)], seg=12, closed=False), -90, 'Y'), -3.62, 0, BZ + .9), 'brass', 0)   # valve stem
P(at(turn(ring(-.05, .05, .32, .42, seg=20), -90, 'Y'), -3.62, 0, BZ + 1.2), 'copper', 0)                # valve wheel
for k in range(4):
    a = math.radians(45 * k)
    P(sweep([(-3.62 - .35 * math.cos(a), -.35 * math.sin(a), BZ + 1.2), (-3.62 + .35 * math.cos(a), .35 * math.sin(a), BZ + 1.2)], [.03, .03], seg=5), 'copper', 0)
P(sweep([(-3.4, 0, BZ), (-2.9, 0, BZ - .05), (-2.4, 0, BZ - .3), (-2.0, 0, 12.25)], [.22, .22, .2, .2], seg=10), 'dark', 0)

# =================================== WINTER'S HOWL (j_gun; barrel z 3.64, x 8..17.5; drum x -3..8) ===================
WZ = 3.64

# ---- Cryo Coil: a glass coil with an icy core wound round the barrel inside the cage, clamped at both ends -----------
part('wh_coil')
path = helix(9.0, 14.4, 1.55, 4.5, 0, WZ, 90)
P(sweep(path, [.13] * len(path), seg=8), 'glassi', 0)
L(sweep(path, [.065] * len(path), seg=6), 'eice')
for x in (8.6, 14.45):
    P(ring(x, x + .38, 1.12, 1.72, z=WZ, seg=32), 'steel', .02)
    P(sweep([polar(x + .19, 1.6, 90, 0, WZ), polar(x + .19 + (.4 if x < 10 else -.4), 1.55, 90, 0, WZ)], [.14, .14], seg=8), 'brass', 0)

# ---- Frost Nozzle: a crown on the prongs' tips with six ice shards splaying ahead ---------------------------------------
part('wh_nozzle')
P(lathe([(17.45, .95), (17.45, 1.5), (17.6, 1.6), (17.95, 1.6), (18.1, 1.45), (18.1, .95)], seg=36, z=WZ), 'steel', .02)
L(ring(18.1, 18.16, .8, 1.15, z=WZ, seg=36), 'eice')
for k in range(6):
    a = 30 + 60 * k
    base = Vector(polar(17.95, 1.3, a, 0, WZ)); tip = Vector(polar(19.7, 2.0, a, 0, WZ))
    L(along(lathe([(0, .001), (.35, .22), (1.25, .2), (1.85, .001)], seg=6, closed=False), tip - base, base), 'crystal', smooth=0)
    P(along(lathe([(-.05, .2), (-.05, .3), (.3, .3), (.3, .2)], seg=6), tip - base, base), 'brass', .01)

# ---- Cryo Tank: a glass tank of glowing coolant on the drum's left flank -------------------------------------------------
part('wh_tank')
HY, HZ = 3.3, 3.0
P(lathe([(-1.5, .01), (-1.5, .62), (-1.35, .8), (4.35, .8), (4.5, .62), (4.5, .01)], seg=24, y=HY, z=HZ, closed=False), 'glassi', 0)
L(rod(-1.3, 4.3, .58, HY, HZ, seg=16), 'eice')
for xa, xb in ((-1.75, -1.3), (4.3, 4.75)):
    P(lathe([(xa, .01), (xa, .75), (xa + .06, .88), (xb - .06, .88), (xb, .75), (xb, .01)], seg=24, y=HY, z=HZ, closed=False), 'brass', .02)
for x in (-.5, 3.3):
    P(ring(x, x + .3, .8, .92, y=HY, z=HZ, seg=24), 'steel', 0)
    box(x, x + .3, 2.05, HY - .7, HZ - .3, HZ + .3, 'dark', .02)
P(sweep([(4.75, HY, HZ), (5.15, HY - .1, HZ + .1), (5.5, 2.4, HZ + .4), (5.7, 1.6, HZ + .6)], [.14, .14, .13, .13], seg=8), 'copper', 0)
P(at(turn(lathe([(0, .01), (0, .14), (.35, .14), (.35, .26), (.45, .26), (.45, .01)], seg=12, closed=False), -90, 'Y'), 1.5, HY, HZ + .72), 'brass', 0)   # filler cap

# ---- Compressor Stock: a finned compressor on the top rear, on two legs, with an icy sight band ----------------------
part('wh_compressor')
KZ2 = 6.38
P(rod(-3.3, .6, .55, 0, KZ2, seg=24), 'dark', .02)
for k in range(10):
    x = -3.05 + .2 * k
    P(ring(x, x + .07, .54, .82, z=KZ2, seg=24), 'steel', 0)
L(ring(-.95, -.55, .5, .58, z=KZ2, seg=24), 'eice')
for x0, x1 in ((-3.5, -3.2), (.4, .75)):
    P(lathe([(x0, .01), (x0, .55), (x0 + .05, .62), (x1 - .05, .62), (x1, .55), (x1, .01)], seg=24, z=KZ2, closed=False), 'brass', .02)
for x, zb in ((-2.2, 5.4), (-.55, 5.0)):
    box(x, x + .35, -.32, .32, zb, KZ2 - .35, 'steel', .02)
P(sweep([(.75, 0, KZ2), (1.1, 0, KZ2 - .05), (1.35, .25, KZ2 - .5), (1.45, .5, 5.0)], [.12, .12, .11, .11], seg=8), 'copper', 0)

# =================================== DG-2 (tag_weapon; bore z 7.98; true size here, shrunk by DGS below) =============
GZ = 7.98

# ---- Fourth Bulb: a caged tesla bulb on its own bracket behind the gun's three, glowing blue -----------------------
part('dg_rack')
box(31.2, 35.6, 3.3, 4.15, 2.6, 8.7, 'dark', .15)
for x, z in ((31.6, 3.0), (35.2, 3.0), (31.6, 8.3), (35.2, 8.3)):
    P(at(turn(lathe([(0, .01), (0, .22), (.18, .22), (.18, .01)], seg=10, closed=False), 90, 'Z'), x, 4.15, z), 'brass', 0)
bd = Vector((0, math.cos(math.radians(-10)), math.sin(math.radians(-10)))); bo = Vector((33.37, 4.1, 5.85))
P(along(lathe([(0, .01), (0, 2.05), (.4, 2.05), (.5, 1.85), (2.6, 1.85), (2.75, 2.0), (3.05, 2.0), (3.05, .01)], seg=28, closed=False), bd, bo), 'steel', .08)
P(along(ring(1.1, 1.6, 1.84, 1.98, seg=28), bd, bo), 'copper', .02)
P(along(lathe([(3.0, .01), (3.0, 1.35), (3.5, 1.75), (5.3, 1.92), (7.3, 1.78), (8.4, 1.2), (8.75, .45), (8.8, .01)], seg=28, closed=False), bd, bo), 'glassb', 0)
L(along(rod(3.1, 7.9, .28, seg=12), bd, bo), 'eblue')
L(along(lathe([(5.1 - .75 * math.cos(t), max(.75 * math.sin(t), .001)) for t in [math.pi * k / 8 for k in range(9)]], seg=16, closed=False), bd, bo), 'eblue')
cage = [(3.05, 1.5), (3.5, 1.9), (5.3, 2.07), (7.3, 1.93), (8.4, 1.36), (8.85, .62), (9.05, .25)]
for k in range(6):
    a = math.radians(30 + 60 * k)
    P(along(sweep([(x, r * math.cos(a), r * math.sin(a)) for x, r in cage], [.09] * len(cage), seg=6), bd, bo), 'brass', 0)
for x, r in ((4.4, 2.03), (7.0, 1.98)):
    P(along(ring(x - .12, x + .12, r - .06, r + .1, seg=28), bd, bo), 'brass', 0)
P(along(lathe([(8.95, .01), (8.95, .4), (9.5, .32), (9.6, .01)], seg=14, closed=False), bd, bo), 'brass', .02)
P(sweep([(33.37, 4.6, 3.6), (34.5, 4.3, 2.5), (36.6, 3.7, 2.4), (37.4, 3.2, 3.0)], [.3, .3, .28, .28], seg=10), 'dark', 0)

# ---- Arc Conductor: ceramic insulators, a copper winding and a blue core on the barrel tube ahead of the cage -------
part('dg_conductor')
for x in (93.4, 95.85, 98.3):
    P(lathe([(x, 1.3), (x, 2.5), (x + .12, 2.9), (x + .38, 3.0), (x + .52, 2.6), (x + .52, 1.3)], seg=32, z=GZ), 'ceramic', .04)
L(ring(93.9, 98.3, 1.3, 1.55, z=GZ, seg=24), 'eblue')
path = helix(93.95, 98.25, 1.75, 6, 0, GZ)
P(sweep(path, [.16] * len(path), seg=8), 'copper', 0)
for a in (90, 210, 330):
    P(rod(93.1, 99.1, .16, *polar(0, 2.55, a, 0, GZ)[1:], seg=10), 'brass', .02)

# ---- Arc Prongs: five inner prongs clamped on the front hoop between the hooks, curving in to blue tips --------------
part('dg_prongs')
for k in range(5):
    a = 54 + 72 * k
    P(sweep([polar(90.4, 4.45, a, 0, GZ), polar(92.6, 4.45, a, 0, GZ)], [.75, .75], seg=10), 'dark', .06)   # clamp on the hoop
    path = [(92.0, 4.45), (95.5, 4.65), (98.4, 4.1), (100.8, 3.0), (102.5, 2.0)]
    P(sweep([polar(x, r, a, 0, GZ) for x, r in path], [.38, .34, .3, .26, .22], seg=10), 'steel', .03)
    for x, r in ((95.5, 4.65), (98.4, 4.1)):
        P(ball(*polar(x, r, a, 0, GZ), .45, seg=10), 'brass', 0)
    L(sweep([polar(x, r, a, 0, GZ) for x, r in ((102.3, 2.1), (103.1, 1.65), (103.8, 1.35))], [.26, .2, .05], seg=8), 'eblue')

# ---- Tesla Stock: a stacked tesla coil on the stock's left flank, a glowing toroid at its rear ------------------------
part('dg_coil')
SY, SZ = 3.75, 2.4
P(rod(-15.0, -4.5, .8, SY, SZ, seg=24), 'ceramic', .05)
for k in range(20):
    x = -13.6 + .42 * k
    P(ring(x, x + .3, .8, .98, y=SY, z=SZ, seg=24), 'copper', 0)
for x0, x1 in ((-14.4, -13.7), (-5.2, -4.5)):
    P(lathe([(x0, .01), (x0, 1.0), (x0 + .1, 1.15), (x1 - .1, 1.15), (x1, 1.0), (x1, .01)], seg=24, y=SY, z=SZ, closed=False), 'brass', .04)
L(lathe([(-15.3 + .38 * math.cos(2 * math.pi * k / 12), 1.0 + .38 * math.sin(2 * math.pi * k / 12)) for k in range(12)], seg=28, y=SY, z=SZ), 'eblue')   # the toroid
P(rod(-16.0, -15.0, .3, SY, SZ, seg=14), 'brass', .03)
P(ball(-16.1, SY, SZ, .38), 'brass', 0)
for x in (-12.0, -7.0):                                                                                  # clamps to the stock
    box(x, x + .6, 2.1, SY - .9, SZ - .5, SZ + .5, 'dark', .08)
P(sweep([(-4.5, SY, SZ), (-3.4, SY - .1, SZ + .3), (-2.0, 3.1, 3.4), (-.6, 2.6, 4.2)], [.26, .26, .24, .24], seg=10), 'dark', 0)

# =================================== WAVE GUN (combined, j_gun) / ZAP GUNS (rear: j_gun, front: j_gun1) ================
AZ = 1.74                                    # the rear gun's axis (rear_vm = the combined gun's rear half, same space)


def cells(name, y, zs, x0, x1, r=.5, plate=(1.8, 2.25)):
    """A cradle of cells side by side along x on a gun's flank (y > 0 left, y < 0 right)."""
    part(name)
    s = 1 if y > 0 else -1
    box(x0 + .15, x1 - .15, min(s * plate[0], s * plate[1]), max(s * plate[0], s * plate[1]), min(zs) - r * .9, max(zs) + r * .9, 'dark', .03)
    for z in zs:
        P(lathe([(x0, .01), (x0, r * .8), (x0 + .1, r), (x1 - .1, r), (x1, r * .8), (x1, .01)], seg=20, y=y, z=z, closed=False), 'steel', .02)
        for xa in (x0 + .3, x1 - .55):
            P(ring(xa, xa + .25, r - .02, r + .07, y=y, z=z, seg=20), 'copper', 0)
        P(ring((x0 + x1) / 2 - .5, (x0 + x1) / 2 + .5, r - .02, r + .03, y=y, z=z, seg=20), 'brass', 0)
        P(rod(x1, x1 + .18, .16, y, z, seg=10), 'brass', .01)


# ---- Power Cells: two cells clipped on the rear capsule's left flank (Wave Gun and the Zap Guns' right gun) ----------
for nm in ('wv_cells', 'wv_cells_r'):
    cells(nm, 2.78, (1.2, 2.3), 2.7, 4.75)
# ---- the left Zap Gun's: one cell on each flank (its outside faces the camera's other side) ----------------------------
part('wv_cells_l')
for s in (1, -1):
    y = s * 2.68
    box(4.15, 5.65, min(s * 1.6, s * 2.3), max(s * 1.6, s * 2.3), .95, 1.65, 'dark', .03)
    P(lathe([(3.95, .01), (3.95, .36), (4.05, .45), (5.75, .45), (5.85, .36), (5.85, .01)], seg=20, y=y, z=1.29, closed=False), 'steel', .02)
    for xa in (4.2, 5.35):
        P(ring(xa, xa + .22, .43, .51, y=y, z=1.29, seg=20), 'copper', 0)
    P(rod(5.85, 6.02, .15, y, 1.29, seg=10), 'brass', .01)


# ---- Capacitor (Zap Guns): a capacitor can on each gun's rear (right: left flank; left: both flanks) -----------------
def capacitor(y, z, x0, x1, r, ytoward):
    P(lathe([(x0, .01), (x0, r * .85), (x0 + .08, r), (x1 - .08, r), (x1, r * .85), (x1, .01)], seg=20, y=y, z=z, closed=False), 'dark', .02)
    for xa in (x0 + .35, x1 - .6):
        P(ring(xa, xa + .2, r - .02, r + .06, y=y, z=z, seg=20), 'brass', 0)
    for dy in (-.18, .18):                                                                               # terminals
        P(rod(x0 - .3, x0, .08, y + dy, z, seg=8), 'copper', 0)
    for x in (x0 + .5, x1 - .5):
        box(x - .15, x + .15, min(ytoward, y - math.copysign(r * .7, y)), max(ytoward, y - math.copysign(r * .7, y)), z - .22, z + .22, 'steel', .02)


part('wv_cap_r')
capacitor(2.5, AZ, -4.1, -1.9, .55, 1.6)
P(sweep([(-4.4, 2.32, AZ), (-4.6, 2.2, AZ + .2), (-4.5, 1.6, AZ + .6), (-4.2, 1.2, AZ + .9)], [.07] * 4, seg=6), 'copper', 0)
part('wv_cap_l')
for s in (1, -1):
    capacitor(s * 2.3, 1.29, -4.6, -2.9, .42, s * 1.5)

# ---- Emitter Dish (Wave Gun): a collar round the dish's lip with six copper emitter rods ----------------------------
part('wv_dish')
DZ = .52
P(lathe([(24.6, 1.86), (24.6, 2.18), (24.75, 2.32), (25.05, 2.32), (25.15, 2.2), (25.15, 2.0)], seg=40, z=DZ), 'steel', .02)
for k in range(6):
    a = 30 + 60 * k
    P(sweep([polar(24.95, 2.25, a, 0, DZ), polar(25.6, 2.45, a, 0, DZ), polar(26.2, 2.55, a, 0, DZ)], [.09, .08, .07], seg=8), 'copper', 0)
    P(ball(*polar(26.25, 2.55, a, 0, DZ), .16, seg=10), 'brass', 0)
    P(ball(*polar(24.85, 2.32, a + 30, 0, DZ), .08, seg=8), 'brass', 0)

# ---- Magnetron (Wave Gun): a finned magnetron on the front body's left flank, its waveguide into the barrel neck -----
part('wv_magnetron')
MY, MZ = 3.05, .55
P(rod(17.9, 20.6, .52, MY, MZ, seg=24), 'dark', .02)
for k in range(8):
    x = 18.15 + .28 * k
    P(ring(x, x + .08, .5, .85, y=MY, z=MZ, seg=24), 'steel', 0)
for x0, x1 in ((17.7, 18.0), (20.55, 20.85)):
    P(lathe([(x0, .01), (x0, .52), (x0 + .05, .6), (x1 - .05, .6), (x1, .52), (x1, .01)], seg=24, y=MY, z=MZ, closed=False), 'brass', .02)
for x in (18.4, 20.0):
    box(x, x + .3, 2.0, MY - .45, MZ - .25, MZ + .25, 'dark', .02)
P(sweep([(20.85, MY, MZ), (21.4, MY - .1, MZ), (22.0, 2.0, .52), (22.4, 1.1, .52), (22.55, .75, .52)], [.2, .2, .19, .18, .18], seg=10), 'copper', 0)
P(at(turn(lathe([(0, .01), (0, .2), (.35, .2), (.35, .01)], seg=12, closed=False), -90, 'Y'), 19.25, MY, MZ + .82), 'brass', 0)   # a terminal on top

# ---- DG-2 parts: stored at 1/DGS (mounted with scale DGS) ------------------------------------------------------------
for p in ('dg_rack', 'dg_conductor', 'dg_prongs', 'dg_coil'):
    for o in PARTS[p]:
        o.data.transform(Matrix.Scale(1 / DGS, 4))

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
export(OUT, None, 'wonder_attachments', BAKED, tex=TEX, yup=False, spread=120)
print('[wonder] exported', OUT)

if '--preview' in args:
    out = args[args.index('--preview') + 1]; os.makedirs(out, exist_ok=True)
    exec(open(os.path.join(os.getcwd(), 'scratch/wonder/rv.py')).read())
    exec(open(os.path.join(os.getcwd(), 'scratch/wonder/check.py')).read())

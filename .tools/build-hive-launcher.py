# The Hive Launcher (Melon Zombies' own wonder launcher, docs/fork/melon-weapons.md): an industrial apiary on a tube.
# Modelled in the BO1 M72 LAW viewmodel's gun space (j_gun: x forward, y left, z up, inches), so
# .tools/assemble-grimhawk.mjs --gun hive skins each part to the LAW's skeleton and its animations drive it.
# The LAW is shouldered: the eye sits at about (-10.8, 3.4, 2.4), level with the tube's axis (z 2.1) and left of it, so
# the player sees the gun's left (+y) side end-on, and anything behind x -5 is right beside the camera (keep it slim).
# The hands set the rest: the left hand cups the tube from below at x 3.5-8.5, the right hand holds its right side at
# x -3.5..0.5 with the fingers over the top (the LAW's trigger is on top at x -0.7). So the honeycomb drum sits forward
# of the left hand (x 9.6-15), under a brass top strap that carries the front sight.
# Parts are objects named part_<bone>:
#   j_gun            tube, smoker fire-pot, bellows stock, vial rack, APIARY plate, trigger housing, the drum's frame
#   tag_hi_drum      the hexagonal honeycomb drum (hive.js turns it 60 degrees a shot); replaced by the Swarm Drum / Personal Hive
#   tag_hi_barrel    the brass barrel with the hexagonal muzzle; replaced by the Smoker / Killer Swarm barrels
#   tag_hi_irons     the hex peep and the front bead (hidden under the Waggle Scope)
#   tag_hi_*         the attachments, hidden by tag until fitted
#   blender -b -P .tools/build-hive-launcher.py -- <out.glb> [--render <dir>] [--tex 4096] [--quick]
#   (--quick: renders the raw materials without the bake or the export, for iterating on the shapes)
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/hive_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None
TEX = int(argv[argv.index('--tex') + 1]) if '--tex' in argv else 4096
QUICK = '--quick' in argv
rnd = random.Random(6)

ATT = ('tag_hi_waggle', 'tag_hi_pheromone', 'tag_hi_swarm', 'tag_hi_keeper', 'tag_hi_smoker', 'tag_hi_killer', 'tag_hi_honey',
       'tag_hi_queen', 'tag_hi_propolis', 'tag_hi_jelly')
PARTS.update({k: [] for k in ('j_gun', 'tag_hi_drum', 'tag_hi_barrel', 'tag_hi_irons', *ATT)})
M.update(
    tube=worn('hi_tube', '#2b2723', .45, .7, bare='#8d8579', wear=.45, chips=.2, under='#1a1816', mottle=.35, dirt=.4, rust=.1),
    brass=worn('hi_brass', '#a8822f', .32, 1, bare='#e3c06e', wear=.4, dirt=.3, mottle=.25),
    oldbrass=worn('hi_oldbrass', '#6e5524', .45, 1, bare='#c9a45a', wear=.4, dirt=.45, mottle=.4),
    comb=worn('hi_comb', '#5a3410', .5, 0, bare='#a8692a', wear=.4, bare_metal=False, mottle=.45, dirt=.35),
    tin=worn('hi_tin', '#7d8084', .45, .9, bare='#b8bcc0', wear=.35, dirt=.6, rust=.2, mottle=.4),
    soot=worn('hi_soot', '#1c1a18', .85, 0, bare='#3a3632', wear=.2, bare_metal=False, mottle=.5, dirt=.3),
    wood=worn('hi_wood', '#8a6a3e', .7, 0, bare='#b89464', wear=.3, bare_metal=False, mottle=.6, dirt=.4),
    leather=worn('hi_leather', '#3b2416', .75, 0, bare='#6b4a32', wear=.35, bare_metal=False, mottle=.5, dirt=.4),
    yellow=worn('hi_yellow', '#e0a91c', .5, .1, bare='#f0cf6a', wear=.35, chips=.4, under='#2b2723', dirt=.3),
    black=worn('hi_black', '#141312', .55, .1, bare='#3c3a37', wear=.3, chips=.3, under='#2b2723', dirt=.25),
    wax=worn('hi_wax', '#d9a43a', .55, 0, bare='#f0c870', wear=.2, bare_metal=False, mottle=.5, dirt=.25),
    seal=worn('hi_seal', '#8c1414', .35, 0, bare='#c23a2a', wear=.3, bare_metal=False, mottle=.3, dirt=.2),
    straw=worn('hi_straw', '#c69a4c', .8, 0, bare='#e3c27c', wear=.3, bare_metal=False, mottle=.6, dirt=.45),
    propolis=worn('hi_propolis', '#4a1c0c', .28, 0, bare='#8a3c16', wear=.3, bare_metal=False, mottle=.5, dirt=.2),
    steel=worn('hi_steel', '#3a3d41', .35, 1, bare='#a0a4aa', wear=.5, dirt=.3, rust=.1),
    ink_k=mat('hi_ink_black', '#141210', .6, 0), ink_r=mat('hi_ink_red', '#8c1414', .55, 0), ink_y=mat('hi_ink_yellow', '#e0a91c', .55, 0),
    glass=mat('hi_glass', '#d8eef2', .05, 0, alpha=.28),
    amber=mat('hi_amber', '#3a1a00', .3, 0, '#ffa21a', 3),       # glowing resin in the cells, the bead, the bore
    dim=mat('hi_amber_dim', '#2a1400', .4, 0, '#ff8a10', 1.2),   # the dormant drones' eyes
    ember=mat('hi_ember', '#300800', .5, 0, '#ff5a10', 5),       # the Smoker's coals
    pink=mat('hi_pink', '#30001a', .3, 0, '#ff3fa8', 5),         # Pheromone Laser
    venom=mat('hi_venom', '#400000', .2, 0, '#ff1a2a', 4),       # Killer Swarm
    honey=mat('hi_honey', '#a85400', .2, 0, '#ff9a10', 1.4),     # Honey Trap
    jelly=mat('hi_jelly', '#e8dca0', .3, 0, '#fff0b0', .8),      # Royal Jelly
    royal=mat('hi_royal', '#301040', .3, 0, '#d070ff', 4),       # the Queen Cell's window
)
BAKED = ('tube', 'brass', 'oldbrass', 'comb', 'tin', 'soot', 'wood', 'leather', 'yellow', 'black', 'wax', 'seal', 'straw', 'propolis', 'steel')
STENCIL = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'

AZ, TR = 2.1, 1.45          # the tube's axis height and radius (the LAW's: the hands are fitted to it)
D0, D1, DR = 9.6, 15.0, 3.0  # the drum's length and circumradius (flat top: a vertex points at +y)
EYE = (0.75, 5.7)           # the sight line (y, z): the peep's centre and the bead's top


def ngon_x(n, R, x0, x1, z=AZ, y=0., a0=0., R1=None):
    """An n-sided prism along x; a0 = the first vertex's angle in the y-z plane from +y; R1 = the radius at x1."""
    bm = bmesh.new(); R1 = R if R1 is None else R1
    ang = [a0 + 2 * math.pi * k / n for k in range(n)]
    a = [bm.verts.new((x0, y + R * math.cos(t), z + R * math.sin(t))) for t in ang]
    b = [bm.verts.new((x1, y + R1 * math.cos(t), z + R1 * math.sin(t))) for t in ang]
    bm.faces.new(a); bm.faces.new(b[::-1])
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def ring(name, r_out, r_in, x0, x1, m, part='j_gun', z=AZ, y=0., seg=40, bw=.03, n=None, a0=0.):
    """A band round the x axis (n: a polygonal band, e.g. 6 for a hex collar)."""
    if n:
        return solid(name, ngon_x(n, r_out, x0, x1, z, y, a0), m, part=part, cuts=[ngon_x(n, r_in, x0 - .1, x1 + .1, z, y, a0)], bw=bw, seg=1)
    return solid(name, cylbm(r_out, x0, x1, z, y, seg), m, part=part, cuts=[cylbm(r_in, x0 - .1, x1 + .1, z, y, seg)], bw=bw, seg=1)


def zcyl(r, x, y, z0, z1, seg=16, r2=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0)
    bm.transform(Matrix.Translation((x, y, (z0 + z1) / 2))); return bm


def seg_cyl(r, p0, p1, seg=16, r2=None):
    """A cylinder from point p0 to p1."""
    a, b = Vector(p0), Vector(p1); d = b - a
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=d.length)
    bm.transform(Matrix.Translation((a + b) / 2) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
    return bm


def ball(c, r, s=(1, 1, 1), seg=12):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    bm.transform(Matrix.Translation(c) @ Matrix.Diagonal((*s, 1))); return bm


def torus_x(R, r, x, z=AZ, y=0., seg=40, sseg=8):
    """A torus round the x axis."""
    bm = bmesh.new(); rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; row = []
        for k in range(sseg):
            b = 2 * math.pi * k / sseg; rr = R + r * math.cos(b)
            row.append(bm.verts.new((x + r * math.sin(b), y + rr * math.cos(a), z + rr * math.sin(a))))
        rows.append(row)
    for i in range(seg):
        for k in range(sseg):
            i2, k2 = (i + 1) % seg, (k + 1) % sseg
            bm.faces.new((rows[i][k], rows[i2][k], rows[i2][k2], rows[i][k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); return bm


def hazard(x0, x1, r, part='j_gun', z=AZ, pairs=9, seg=108, nx=10, twist=1.2):
    """Yellow and black diagonal stripes round the x axis (two meshes, no bevel)."""
    bms = (bmesh.new(), bmesh.new())
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        for j in range(nx):
            xa, xb = x0 + (x1 - x0) * j / nx, x0 + (x1 - x0) * (j + 1) / nx
            t = (i + .5) / seg * pairs * 2 + (j + .5) / nx * twist * 2
            bm = bms[int(t) % 2]
            v = [bm.verts.new((x, r * math.cos(a), z + r * math.sin(a))) for x, a in ((xa, a0), (xb, a0), (xb, a1), (xa, a1))]
            bm.faces.new(v)
    for bm, k in zip(bms, ('yellow', 'black')):
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        plain('hz_' + k, bm, M[k], part=part, smooth=10)


def hex_cells(cells, rc, w0, w1, phi, z=AZ, a0=0.):
    """Hex prisms along the normal of a drum face (normal angle phi in the y-z plane; u = x, v = across the face, w = out)."""
    bm = bmesh.new(); c, s = math.cos(phi), math.sin(phi)
    P = lambda u, v, w: (u, w * c - v * s, z + w * s + v * c)
    for u, v in cells:
        ang = [a0 + math.pi / 3 * k for k in range(6)]
        a = [bm.verts.new(P(u + rc * math.cos(t), v + rc * math.sin(t), w0)) for t in ang]
        b = [bm.verts.new(P(u + rc * math.cos(t), v + rc * math.sin(t), w1)) for t in ang]
        bm.faces.new(a); bm.faces.new(b[::-1])
        for i in range(6):
            j = (i + 1) % 6; bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); return bm


def wax_seal(x, y, z, r=.36, part='j_gun', axis='x', sign=1):
    """A blob of red sealing wax with a hex stamp, on a face looking along +x (or +z)."""
    if axis == 'x':
        solid('seal', cylbm(r, x, x + .1 * sign, z, y, seg=14), M['seal'], part=part, bw=.04, seg=2)
        for k in range(5):   # the wax squeezed out round the stamp
            a = k * 1.3 + .4
            solid('seal_b', ball((x + .02 * sign, y + r * math.cos(a), z + r * math.sin(a)), .1, (.6, 1, 1), 8), M['seal'], part=part, bw=0)
        solid('stamp', ngon_x(6, r * .55, x + .08 * sign, x + .13 * sign, z, y, math.pi / 6), M['seal'], part=part, bw=.01, seg=1)
    else:
        solid('seal', zcyl(r, x, y, z, z + .1, 14), M['seal'], part=part, bw=.04, seg=2)
        solid('stamp', zcyl(r * .55, x, y, z + .08, z + .14, 6), M['seal'], part=part, bw=.01, seg=1)


def drip(x, y, z, m='wax', part='j_gun', length=.5, r=.12):
    """A drip of wax hanging off an edge: a teardrop."""
    solid('drip', ball((x, y, z - length * .45), r, (1, 1, length / r * .55), 10), M[m], part=part, bw=0)
    solid('drip_t', ball((x, y, z - length * .95), r * 1.25, (1, 1, 1), 10), M[m], part=part, bw=0)


def drone(c, s=1., part='j_gun', body='brass', eye='dim'):
    """A little mechanical bee lying along x at c: striped abdomen, thorax, head, eyes, glass wings, a stinger."""
    x, y, z = c
    for k, (dx, r, m) in enumerate(((-.42, .17, body), (-.27, .2, 'black'), (-.12, .19, body), (0, .14, 'black'))):
        solid('dr_ab', ball((x + dx * s, y, z), r * s, (1.15, 1, 1), 10), M[m], part=part, bw=0)
    solid('dr_th', ball((x + .2 * s, y, z), .15 * s, (1, 1, 1), 10), M['black'], part=part, bw=0)
    solid('dr_hd', ball((x + .37 * s, y, z), .1 * s, (1, 1, 1), 8), M[body], part=part, bw=0)
    for sy in (1, -1):
        solid('dr_eye', ball((x + .42 * s, y + .06 * s * sy, z + .03 * s), .055 * s, (1, 1, 1), 8), M[eye], part=part, bw=0)
        solid('dr_wing', ball((x + .1 * s, y + .22 * s * sy, z + .14 * s), .2 * s, (1.2, .9, .12), 8), M['glass'], part=part, bw=0)
    solid('dr_st', cylbm(.04 * s, x - .72 * s, x - .52 * s, z, y, 6, r2=.0), M['black'], part=part, bw=0)


# ---------------------------------------------------------------- the tube (j_gun)
solid('tube', cylbm(TR, -6.7, D0 + .2, AZ, seg=48), M['tube'], cuts=[cylbm(TR + .1, x, x + .07, AZ, seg=48) for x in (-3.3, 2.4, 6.8)], bw=.02)
ring('collar_r', TR + .22, TR - .1, -7.0, -6.3, M['brass'])
ring('collar_f', TR + .25, TR - .1, 8.75, D0 - .1, M['brass'], n=6)
hazard(-6.25, -5.25, TR + .03)
hazard(7.45, 8.7, TR + .03)
for k in range(9):   # a leather wrap where the left hand cups the tube
    x = 2.6 + k * .46
    ring('wrap', TR + .13, TR - .05, x, x + .4, M['leather'], seg=40, bw=.03)
# the trigger housing on top (the LAW's trigger is up there) with a red push button and an arming lever on the left
solid('trig_box', prism(fillet([(-2.5, 3.2), (0.5, 3.2), (0.5, 4.2), (-0.2, 4.45), (-2.5, 4.45)], .2), -.55, .55), M['brass'], bw=.06, seg=2)
solid('trig_btn', zcyl(.26, -0.9, 0, 4.4, 4.75, 16), M['seal'], bw=.05, seg=2)
solid('trig_rim', zcyl(.36, -0.9, 0, 4.4, 4.5, 16), M['steel'], bw=.02)
solid('arm_lever', prism(fillet([(-2.0, 3.6), (-1.4, 3.6), (-0.3, 4.1), (-0.5, 4.3), (-2.0, 3.95)], .1), .55, .72), M['steel'], bw=.03)
solid('arm_knob', ball((-0.35, .66, 4.2), .14), M['seal'], bw=0)

# the vial rack on the upper left: three glass vials, each with a dormant drone, wax-sealed
VY, VZ, VR = 1.38, 3.62, .38
for i, (x0, x1) in enumerate(((-5.5, -3.55), (-3.35, -1.4), (-1.2, 0.75))):
    solid('vial', cylbm(VR, x0 + .25, x1 - .25, VZ, VY, seg=20), M['glass'], bw=0)
    for xa, xb in ((x0, x0 + .27), (x1 - .27, x1)):
        solid('vcap', cylbm(VR + .05, xa, xb, VZ, VY, seg=20), M['brass'], bw=.03, seg=1)
    wax_seal(x1, VY, VZ, r=.27)
    drone(((x0 + x1) / 2 + .05, VY, VZ), .78)
    for xc in (x0 + .55, x1 - .55):   # the clips holding it to the tube
        ring('vclip', VR + .07, VR + .005, xc - .1, xc + .1, M['oldbrass'], y=VY, z=VZ, seg=20, bw=.01)
        solid('vfoot', seg_cyl(.09, (xc, VY - .2, VZ - .3), (xc, .75, AZ + 1.1), 8), M['oldbrass'], bw=0)
solid('vrail', cylbm(.11, -5.6, 0.85, AZ + 1.15, .78, seg=10), M['oldbrass'], bw=0)
drip(0.76, VY, VZ - .3, 'seal', length=.35, r=.07)

# the APIARY plate on the left side (yellow, riveted on standoffs) with hazard stripes along its foot
solid('plate', prism(rrect_xz(-4.45, 0.75, 0.7, 2.75, .18), 1.5, 1.58), M['yellow'], bw=.03)
for x, z in ((-4.2, .95), (-4.2, 2.5), (0.5, .95), (0.5, 2.5)):
    solid('rivet', screw(x, 1.6, z, .08, .05, seg=8), M['brass'], bw=0)
text('APIARY', .62, (-1.85, 1.6, 1.95), side=1, m=M['ink_k'], font=STENCIL)
text('HIVE LAUNCHER  MK.VI', .17, (-1.85, 1.6, 1.38), side=1, m=M['ink_k'], font=STENCIL)
text('LIVE DRONES - DO NOT SHAKE', .13, (-1.85, 1.6, 1.12), side=1, m=M['ink_r'], font=STENCIL)
for k in range(9):
    x = -4.1 + k * .52
    solid('pl_stripe', prism([(x, .78), (x + .26, .78), (x + .46, .98), (x + .2, .98)], 1.575, 1.6), M['ink_k'], bw=0)

# ---------------------------------------------------------------- the smoker fire-pot and the bellows stock (j_gun)
CX0, CX1, CR = -12.0, -7.0, 1.55   # slim: it sits beside the camera, and a fatter pot filled the ADS view
solid('pot', cylbm(CR, CX0, CX1, AZ, seg=40), M['tin'], bw=.04)
solid('pot_lid', cylbm(CR + .04, CX1 - .1, CX1 + .45, AZ, seg=40, r2=TR + .05), M['tin'], bw=.04)
ring('pot_band', CR + .06, CR - .1, -9.9, -9.4, M['brass'])
ring('pot_band2', CR + .06, CR - .1, CX0 + .05, CX0 + .4, M['oldbrass'])
for x in (-11.3, -8.4):   # the heat guard: half hoops under the pot with bars (no hoop over the top, it crossed the ADS view)
    solid('guard', cylbm(CR + .32, x - .08, x + .08, AZ, seg=40), M['steel'], bw=.01, seg=1,
          cuts=[cylbm(CR + .2, x - .2, x + .2, AZ, seg=40), prism([(x - 1, AZ + .02), (x + 1, AZ + .02), (x + 1, AZ + 4), (x - 1, AZ + 4)], -4, 4)])
for k in range(7):
    a = math.radians(190 + k * 25)
    solid('guard_bar', cylbm(.06, -11.45, -8.25, AZ + (CR + .26) * math.sin(a), (CR + .26) * math.cos(a), seg=8), M['steel'], bw=0)
for k in range(10):   # soot streaks round the lid
    a = math.radians(rnd.uniform(0, 360)); r = TR + .2
    solid('soot', ball((CX1 + .3, r * math.cos(a), AZ + r * math.sin(a)), .14, (2.2, 1, 1), 8), M['soot'], bw=0)

# bellows: two wooden boards hinged at the pot with pleated leather between, wider towards the butt
BX0, BX1 = -19.6, -12.3
zb = lambda x: .25 + (x - BX1) * .075   # the bottom board's top (lower at the back)
zt = lambda x: 3.05 - (x - BX1) * .075  # the top board's underside (higher at the back)
outline = fillet([(BX1, .78), (-17.4, 1.55), (BX0, 1.25), (BX0, -1.25), (-17.4, -1.55), (BX1, -.78)], .55)


def board(name, zf, th, m='wood'):
    bm = bmesh.new()
    a = [bm.verts.new((x, y, zf(x))) for x, y in outline]
    b = [bm.verts.new((x, y, zf(x) + th)) for x, y in outline]
    bm.faces.new(a); bm.faces.new(b[::-1])
    for i in range(len(a)):
        j = (i + 1) % len(a); bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return solid(name, bm, M[m], bw=.06, seg=2)


board('board_b', lambda x: zb(x) - .3, .3)
board('board_t', zt, .3)
bm = bmesh.new(); N = 10; loops = []
for k in range(N + 1):
    t = k / N; s = 1. if k % 2 == 0 else .84
    loops.append([bm.verts.new((x if k % 2 == 0 else x * .985 + BX0 * .015 * 0, y * s, zb(x) + t * (zt(x) - zb(x)))) for x, y in outline])
for k in range(N):
    for i in range(len(outline)):
        j = (i + 1) % len(outline); bm.faces.new((loops[k][i], loops[k][j], loops[k + 1][j], loops[k + 1][i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
plain('pleats', bm, M['leather'], smooth=50)
solid('hinge', boxbm(BX1 - .35, BX1 + .1, -.8, .8, -.05, 3.35), M['leather'], bw=.08, seg=2)
solid('nozzle', cylbm(.32, BX1 - .1, CX0 + .3, 1.65, seg=14), M['tin'], bw=.02)
for x in (-18.6, -14.2):   # brass corner plates and nails on the top board
    for sy in (1, -1):
        solid('nail', zcyl(.09, x, sy * .95, zt(x) + .28, zt(x) + .36, 8), M['brass'], bw=0)
solid('butt', prism(fillet([(BX0 - .45, zb(BX0) - .45), (BX0 + .1, zb(BX0) - .45), (BX0 + .1, zt(BX0) + .45), (BX0 - .45, zt(BX0) + .45)], .3), -1.3, 1.3),
      M['leather'], bw=.12, seg=2)
wax_seal(-16.2, 0, zt(-16.2) + .28, r=.4, axis='z')
solid('spring', torus_x(.35, .06, -12.9, z=1.65, seg=16, sseg=6), M['steel'], bw=0)

# ---------------------------------------------------------------- the drum's frame (j_gun): a brass top strap and end posts
SZ0, SZ1 = 5.0, 5.42
solid('strap', prism(fillet([(8.75, SZ0), (16.0, SZ0), (16.0, SZ1), (8.75, SZ1)], .12), -.55, .55), M['brass'], bw=.05, seg=2)
solid('post_r', prism(fillet([(8.75, 3.3), (9.35, 3.3), (9.35, SZ1), (8.75, SZ1)], .12), -.55, .55), M['brass'], bw=.05, seg=2)
solid('post_f', prism(fillet([(15.35, 3.0), (16.0, 3.0), (16.0, SZ1), (15.35, SZ1)], .12), -.55, .55), M['brass'], bw=.05, seg=2)
ring('front_ring', 1.45, 1.0, 15.3, 16.05, M['brass'], n=6, a0=math.pi / 6)
solid('axle_r', cylbm(.55, D0 - .5, D0 + .05, AZ, seg=16), M['steel'], bw=.02)
for x in (9.0, 15.7):
    solid('strap_screw', zcyl(.12, x, 0, SZ1, SZ1 + .05, 10), M['steel'], bw=0)
text('MELON APIARY CO.', .17, (12.4, .56, (SZ0 + SZ1) / 2), side=1, m=M['ink_k'], font=STENCIL)
for x, l in ((10.6, .45), (13.9, .3), (15.6, .55)):   # wax that ran off the drum onto the strap
    drip(x, -.45, SZ0, length=l, r=.09)

# ---------------------------------------------------------------- the honeycomb drum (tag_hi_drum)
DP = 'tag_hi_drum'
AP = DR * math.cos(math.pi / 6)   # the faces' distance from the axis
cell_uv = []
RC, SP = .34, .42
for ci in range(7):
    u = 10.25 + ci * SP * 1.5
    for v in ((-.73, 0, .73) if ci % 2 == 0 else (-.365, .365)):
        cell_uv.append((u, v))
cuts, fills = [], []
for f in range(6):
    phi = math.pi / 6 + f * math.pi / 3
    cuts.append(hex_cells(cell_uv, RC, AP - .38, AP + .2, phi))
solid('comb', ngon_x(6, DR, D0 + .25, D1 - .25), M['comb'], part=DP, cuts=cuts, bw=.02, seg=1)
for f in range(6):   # the cells: most glow with resin, a few are capped with wax
    phi = math.pi / 6 + f * math.pi / 3
    lit = [c for c in cell_uv if rnd.random() > .3]; capped = [c for c in cell_uv if c not in lit]
    solid('resin', hex_cells(lit, RC - .01, AP - .4, AP - .13, phi), M['amber'], part=DP, bw=0)
    if capped:
        solid('caps', hex_cells(capped, RC - .01, AP - .4, AP - .05, phi), M['wax'], part=DP, bw=.04, seg=1)
for x0, x1 in ((D0, D0 + .3), (D1 - .3, D1)):   # brass end plates, a touch bigger than the comb
    solid('dplate', ngon_x(6, DR + .1, x0, x1), M['brass'], part=DP, cuts=[cylbm(.6, x0 - .1, x1 + .1, AZ, seg=16)], bw=.05, seg=2)
for k in range(6):   # brass edge strips along each corner
    a = k * math.pi / 3; y, z = (DR + .02) * math.cos(a), AZ + (DR + .02) * math.sin(a)
    solid('dedge', cylbm(.13, D0 + .2, D1 - .2, z, y, seg=8), M['oldbrass'], part=DP, bw=0)
    wax_seal(D1, 2.15 * math.cos(a + math.pi / 6), AZ + 2.15 * math.sin(a + math.pi / 6), r=.3, part=DP)
solid('hub', ngon_x(6, .95, D1, D1 + .3, a0=math.pi / 6), M['brass'], part=DP, cuts=[cylbm(.55, D1 - .1, D1 + .5, AZ, seg=16)], bw=.04, seg=1)
for k in range(3):
    a = k * 2 * math.pi / 3 + .3
    drip(D1 + .15, (DR - .2) * math.cos(a) * .2, AZ - AP - .02, length=.4 + k * .15, r=.09, part=DP) if k == 0 else None

# ---------------------------------------------------------------- the brass barrel with the hex muzzle (tag_hi_barrel)
BP = 'tag_hi_barrel'
solid('barrel', cylbm(1.05, 15.25, 20.6, AZ, seg=36), M['brass'], part=BP, cuts=[cylbm(.75, 19.0, 22.6, AZ, seg=24)], bw=.02)
for x in (16.6, 18.7):
    ring('bring', 1.2, 1.0, x, x + .3, M['oldbrass'], part=BP)
solid('muzzle', ngon_x(6, 1.62, 20.4, 22.4, a0=math.pi / 6, R1=1.42), M['brass'], part=BP,
      cuts=[ngon_x(6, 1.0, 20.0, 22.6, a0=math.pi / 6)],
      bw=.06, seg=2)
solid('bore_glow', ngon_x(6, .98, 21.2, 21.35, a0=math.pi / 6), M['amber'], part=BP, bw=0)
text('No.6', .3, (17.65, 1.06, AZ), side=1, m=M['ink_k'], font=STENCIL)

# ---------------------------------------------------------------- iron sights (tag_hi_irons): a hex peep and an amber bead
IP = 'tag_hi_irons'
solid('peep_post', prism(fillet([(-4.85, 3.1), (-4.15, 3.1), (-4.3, EYE[1] - .35), (-4.7, EYE[1] - .35)], .08), EYE[0] - .15, EYE[0] + .15), M['brass'], part=IP, bw=.03)
ring('peep', .5, .26, -4.6, -4.4, M['brass'], part=IP, z=EYE[1], y=EYE[0], n=6, a0=math.pi / 6, bw=.02)
solid('bead_post', prism(fillet([(12.45, SZ1 - .1), (12.95, SZ1 - .1), (12.82, EYE[1] - .1), (12.58, EYE[1] - .1)], .06), .5, 1.0), M['brass'], part=IP, bw=.02)
solid('bead', ball((12.7, EYE[0], EYE[1] - .05), .085), M['amber'], part=IP, bw=0)

# ================================================================ attachments
# Waggle Scope (optic): an open brass tube on the sight line with an amber hex reticle, a waggle-dance dial and feelers
WS = 'tag_hi_waggle'
ring('ws_tube', .62, .5, -5.8, -1.6, M['brass'], part=WS, z=EYE[1], y=EYE[0])
ring('ws_hood', .82, .56, -1.75, -1.05, M['oldbrass'], part=WS, z=EYE[1], y=EYE[0], n=6, a0=math.pi / 6)
ring('ws_eye', .75, .5, -6.2, -5.7, M['leather'], part=WS, z=EYE[1], y=EYE[0])
ring('ws_ret', .48, .44, -1.4, -1.36, M['amber'], part=WS, z=EYE[1], y=EYE[0], n=6, a0=math.pi / 6, bw=0)
for x in (-5.0, -2.6):
    solid('ws_leg', prism(fillet([(x - .3, 3.3), (x + .3, 3.3), (x + .2, EYE[1] - .5), (x - .2, EYE[1] - .5)], .08), EYE[0] - .2, EYE[0] + .2), M['oldbrass'], part=WS, bw=.03)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=.36, radius2=.36, depth=.14)
bm.transform(Matrix.Translation((-3.6, EYE[0] + .6, EYE[1])) @ Matrix.Rotation(math.radians(90), 4, 'X'))
solid('ws_dial', bm, M['brass'], part=WS, bw=.02)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=.29, radius2=.29, depth=.02)
bm.transform(Matrix.Translation((-3.6, EYE[0] + .68, EYE[1])) @ Matrix.Rotation(math.radians(90), 4, 'X'))
solid('ws_face', bm, M['amber'], part=WS, bw=0)
solid('ws_needle', seg_cyl(.03, (-3.6, EYE[0] + .7, EYE[1]), (-3.42, EYE[0] + .7, EYE[1] + .2), 6), M['ink_k'], part=WS, bw=0)
for sy in (1, -1):   # feelers curling up off the hood, amber bulbs on the tips
    pts = [(-1.3, EYE[0] + sy * .35, EYE[1] + .6), (-.8, EYE[0] + sy * .5, EYE[1] + 1.2), (-.1, EYE[0] + sy * .6, EYE[1] + 1.45)]
    for p, q in zip(pts, pts[1:]):
        solid('ws_feeler', seg_cyl(.04, p, q, 6), M['black'], part=WS, bw=0)
    solid('ws_bulb', ball(pts[-1], .11), M['amber'], part=WS, bw=0)

# Pheromone Laser (laser): a brass emitter on the barrel's right with a pink scent bulb
PL = 'tag_hi_pheromone'
solid('pl_box', prism(fillet([(16.4, 2.15), (19.2, 2.15), (19.2, 3.0), (16.4, 3.0)], .15), -1.95, -1.1), M['oldbrass'], part=PL, bw=.05, seg=2)
solid('pl_clamp', prism(fillet([(17.2, 1.3), (17.8, 1.3), (17.8, 3.1), (17.2, 3.1)], .1), -1.2, -.6), M['steel'], part=PL, bw=.03)
solid('pl_bulb', ball((17.0, -1.52, 3.38), .34), M['glass'], part=PL, bw=0)
solid('pl_fluid', ball((17.0, -1.52, 3.3), .27), M['pink'], part=PL, bw=0)
solid('pl_neck', zcyl(.12, 17.0, -1.52, 2.95, 3.12, 10), M['brass'], part=PL, bw=0)
solid('pl_lens', cylbm(.2, 19.18, 19.26, 2.58, -1.52, seg=16), M['pink'], part=PL, bw=0)

# Swarm Drum (mag, replaces the drum): a fluted revolver cylinder with six bores, a small nest in each
SW = 'tag_hi_swarm'
flutes = [cylbm(.5, D0 + .9, D1 - .9, AZ + 3.2 * math.sin(a), 3.2 * math.cos(a), seg=16) for a in (math.pi / 6 + k * math.pi / 3 for k in range(6))]
bores = [cylbm(.74, D0 - .2, D1 + .2, AZ + 1.85 * math.sin(a), 1.85 * math.cos(a), seg=20) for a in (k * math.pi / 3 for k in range(6))]
solid('sw_cyl', cylbm(3.05, D0 + .1, D1 - .1, AZ, seg=48), M['steel'], part=SW, cuts=flutes + bores, bw=.06, seg=2)
for x0, x1 in ((D0 - .05, D0 + .25), (D1 - .25, D1 + .05)):
    ring('sw_band', 3.12, 2.75, x0, x1, M['brass'], part=SW, seg=48)
hazard(12.0, 12.6, 3.07, part=SW, pairs=18)
for k in range(6):   # the nests waiting in the bores: amber pods with a wax ring
    a = k * math.pi / 3; y, z = 1.85 * math.cos(a), AZ + 1.85 * math.sin(a)
    solid('sw_pod', ngon_x(6, .62, D0 + .2, D1 - .35, z, y, R1=.5), M['amber'], part=SW, bw=0)
    solid('sw_podcap', ngon_x(6, .66, D1 - .55, D1 - .2, z, y, R1=.45), M['wax'], part=SW, bw=.03, seg=1)
solid('sw_hub', cylbm(.9, D1 - .1, D1 + .3, AZ, seg=24), M['brass'], part=SW, cuts=[cylbm(.55, D1 - .2, D1 + .5, AZ, seg=16)], bw=.04, seg=1)

# Personal Hive (mag, replaces the drum): a woven straw skep lying on its side, its board facing forward
KP = 'tag_hi_keeper'
x_base, x_apex = 15.15, 9.2
for k in range(12):
    x = x_base - .3 - k * .5
    t = (x_base - x) / (x_base - x_apex)
    R = max(1.75, 3.15 * math.sqrt(max(0., 1 - t * t)))
    solid('kp_coil', torus_x(R, .3, x, seg=40, sseg=8), M['straw'], part=KP, bw=0)
for k in range(8):   # the lashings across the coils
    a = k * math.pi / 4 + .2; pts = []
    for j in range(9):
        x = x_base - .3 - j * .62; t = min(1, (x_base - x) / (x_base - x_apex)); R = max(1.75, 3.15 * math.sqrt(max(0., 1 - t * t))) + .22
        pts.append((x, R * math.cos(a), AZ + R * math.sin(a)))
    for p, q in zip(pts, pts[1:]):
        solid('kp_lash', seg_cyl(.07, p, q, 6), M['leather'], part=KP, bw=0)
solid('kp_board', cylbm(3.4, x_base, x_base + .35, AZ, seg=40), M['wood'], part=KP,
      cuts=[boxbm(x_base - .2, x_base + .6, -1.1, 1.1, AZ - 2.9, AZ - 2.3), cylbm(.6, x_base - .1, x_base + .5, AZ, seg=16)], bw=.06, seg=2)
solid('kp_glow', boxbm(x_base - .1, x_base + .05, -1.05, 1.05, AZ - 2.85, AZ - 2.35), M['amber'], part=KP, bw=0)
for k in range(3):
    drone((x_base + .55, -.8 + k * .8, AZ - 2.95 + (k % 2) * .25), .7, part=KP)

# Smoker (barrel, replaces the barrel): a sooty tin can with hex vents and glowing coals, a heat guard and a conical spout
SM = 'tag_hi_smoker'
vents = []
for x in (16.4, 18.0):
    for k in range(8):
        a = k * math.pi / 4 + (x > 17) * math.pi / 8
        bm = zcyl(.28, 0, 0, 0, 3, 6); bm.transform(Matrix.Translation((x, 0, AZ)) @ Matrix.Rotation(a - math.pi / 2, 4, 'X')); vents.append(bm)
solid('sm_can', cylbm(1.58, 15.3, 19.4, AZ, seg=40), M['tin'], part=SM, cuts=vents + [cylbm(1.35, 15.5, 19.2, AZ, seg=40)], bw=.03)
solid('sm_coals', cylbm(1.3, 15.6, 19.1, AZ, seg=24), M['ember'], part=SM, bw=0)
solid('sm_cone', cylbm(1.6, 19.35, 21.2, AZ, seg=40, r2=.68), M['tin'], part=SM, bw=.04)
solid('sm_tip', cylbm(.68, 21.15, 22.3, AZ, seg=24, r2=.56), M['soot'], part=SM, cuts=[cylbm(.42, 21.0, 22.5, AZ, seg=16)], bw=.03)
ring('sm_lip', .7, .42, 22.2, 22.45, M['oldbrass'], part=SM, seg=24)
for x in (15.6, 19.0):
    ring('sm_band', 1.66, 1.5, x, x + .25, M['brass'], part=SM)
for x in (15.9, 18.7):
    ring('sm_guard', 1.95, 1.85, x - .06, x + .06, M['steel'], part=SM, seg=40, bw=.01)
for k in range(6):
    a = math.radians(30 + k * 24)
    solid('sm_bar', cylbm(.06, 15.7, 18.9, AZ + 1.9 * math.sin(a), 1.9 * math.cos(a), seg=8), M['steel'], part=SM, bw=0)
for k in range(8):
    a = math.radians(rnd.uniform(0, 360))
    solid('sm_soot', ball((21.9, .62 * math.cos(a), AZ + .62 * math.sin(a)), .12, (2, 1, 1), 8), M['soot'], part=SM, bw=0)

# Killer Swarm (barrel, replaces the barrel): a black barrel in hornet bands, venom vials, six stingers round the muzzle
KS = 'tag_hi_killer'
solid('ks_barrel', cylbm(1.1, 15.25, 20.4, AZ, seg=36), M['steel'], part=KS, cuts=[cylbm(.75, 19.0, 22.6, AZ, seg=24)], bw=.02)
for k, x in enumerate((16.0, 16.9, 17.8)):
    ring('ks_band', 1.17, 1.0, x, x + .45, M['yellow'], part=KS)
solid('ks_muzzle', ngon_x(6, 1.6, 20.3, 22.0, a0=math.pi / 6, R1=1.25), M['black'], part=KS, cuts=[ngon_x(6, .95, 20.0, 22.2, a0=math.pi / 6)], bw=.05, seg=2)
for k in range(6):
    a = math.pi / 6 + k * math.pi / 3
    p = (21.9, 1.3 * math.cos(a), AZ + 1.3 * math.sin(a)); q = (23.6, .75 * math.cos(a), AZ + .75 * math.sin(a))
    solid('ks_sting', seg_cyl(.2, p, q, 8, r2=.0), M['black'], part=KS, bw=0)
    solid('ks_tip', ball(((p[0] + q[0] * 3) / 4, (p[1] + q[1] * 3) / 4, (p[2] + q[2] * 3) / 4), .07), M['venom'], part=KS, bw=0)
for sy in (1, -1):
    solid('ks_vial', cylbm(.26, 16.2, 18.9, AZ - .2, sy * 1.42, seg=14), M['glass'], part=KS, bw=0)
    solid('ks_venom', cylbm(.2, 16.3, 18.6, AZ - .2, sy * 1.42, seg=12), M['venom'], part=KS, bw=0)
    for x in (16.05, 18.85):
        solid('ks_vcap', cylbm(.29, x, x + .25, AZ - .2, sy * 1.42, seg=14), M['black'], part=KS, bw=.02)
solid('ks_bore', ngon_x(6, .93, 21.0, 21.1, a0=math.pi / 6), M['venom'], part=KS, bw=0)

# Honey Trap (under): a glass jar of glowing honey under the barrel with a drip nozzle
HT = 'tag_hi_honey'
HZ = -.5
solid('ht_jar', cylbm(.85, 16.6, 19.8, HZ, seg=24), M['glass'], part=HT, bw=0)
solid('ht_honey', cylbm(.76, 16.65, 19.75, HZ, seg=24), M['honey'], part=HT, bw=0)
for x0, x1 in ((16.3, 16.65), (19.75, 20.1)):
    solid('ht_cap', cylbm(.9, x0, x1, HZ, seg=24), M['brass'], part=HT, bw=.03, seg=1)
solid('ht_nozzle', cylbm(.32, 20.1, 21.0, HZ, seg=14, r2=.14), M['brass'], part=HT, bw=.02)
solid('ht_drop', ball((20.95, 0, HZ - .3), .14, (1, 1, 1.5)), M['honey'], part=HT, bw=0)
for x in (17.1, 19.1):
    solid('ht_clamp', prism(fillet([(x, HZ + .6), (x + .4, HZ + .6), (x + .4, 1.4), (x, 1.4)], .1), -.3, .3), M['oldbrass'], part=HT, bw=.03)
solid('ht_label', cylbm(.86, 17.6, 18.8, HZ, seg=24), M['yellow'], part=HT, cuts=[boxbm(17.5, 18.9, -2, 0, -3, 3)], bw=0)
text('HONEY', .3, (18.2, .87, HZ), side=1, m=M['ink_k'], font=STENCIL, part=HT)

# Queen Cell (ammo): a royal wax cell in a brass cradle on top of the tube, a crown on its nose, a violet window
QC = 'tag_hi_queen'
QY, QZ = .35, 4.2
for k in range(9):
    x = 1.4 + k * .62; r = .5 + .14 * math.sin(k / 8 * math.pi)
    solid('qc_bump', ball((x, QY, QZ), r, (1.05, 1, 1), 14), M['wax'], part=QC, bw=0)
solid('qc_win', ball((4.0, QY + .55, QZ + .05), .22, (1.4, .6, 1)), M['royal'], part=QC, bw=0)
for x in (2.0, 5.9):
    ring('qc_hoop', .72, .6, x - .1, x + .1, M['brass'], part=QC, z=QZ, y=QY, seg=24, bw=.01)
    solid('qc_leg', prism(fillet([(x - .25, 3.4), (x + .25, 3.4), (x + .15, QZ - .55), (x - .15, QZ - .55)], .06), QY - .2, QY + .2), M['brass'], part=QC, bw=.02)
ring('qc_crown', .36, .28, 6.6, 6.75, M['brass'], part=QC, z=QZ, y=QY, seg=20, bw=0)
for k in range(5):
    a = k * 2 * math.pi / 5
    solid('qc_spike', seg_cyl(.07, (6.75, QY + .32 * math.cos(a), QZ + .32 * math.sin(a)), (7.15, QY + .36 * math.cos(a), QZ + .36 * math.sin(a)), 6, r2=.0), M['brass'], part=QC, bw=0)
drip(3.2, QY - .3, QZ - .45, length=.3, r=.07, part=QC)

# Propolis Shell (ammo): dark resin bars sealing the drum in, with drips (fixed: it shows round every drum)
PS = 'tag_hi_propolis'
for k in range(6):
    a = k * math.pi / 3
    if k in (1, 2): a += 0
    y, z = 3.45 * math.cos(a), AZ + 3.45 * math.sin(a)
    solid('ps_bar', cylbm(.22, D0 - .15, D1 + .15, z, y, seg=10), M['propolis'], part=PS, bw=0)
    for j in range(3):
        x = D0 + .8 + j * 1.8 + rnd.uniform(-.3, .3)
        solid('ps_lump', ball((x, y, z), .32, (1.6, 1, 1), 10), M['propolis'], part=PS, bw=0)
    if z < AZ:
        drip(D0 + 2.6, y, z - .15, m='propolis', length=.45, r=.1, part=PS)
for x0 in (D0 - .3, D1):
    ring('ps_hoop', 3.72, 3.3, x0, x0 + .3, M['propolis'], part=PS, n=6, bw=.03)

# Royal Jelly (stock): a canister of pale jelly strapped to the bellows, piped into the fire-pot
RJ = 'tag_hi_jelly'
JZ = zt(-15.6) + .3 + .72
solid('rj_glass', cylbm(.7, -18.0, -13.3, JZ, seg=24), M['glass'], part=RJ, bw=0)
solid('rj_jelly', cylbm(.6, -17.95, -13.35, JZ, seg=24), M['jelly'], part=RJ, bw=0)
for x0, x1 in ((-18.3, -17.95), (-13.35, -13.0)):
    solid('rj_cap', cylbm(.76, x0, x1, JZ, seg=24), M['brass'], part=RJ, bw=.03, seg=1)
for x in (-17.2, -14.2):
    ring('rj_strap', .8, .7, x - .2, x + .2, M['leather'], part=RJ, z=JZ, seg=24, bw=.01)
solid('rj_pipe', seg_cyl(.12, (-13.0, 0, JZ), (-11.2, 0, AZ + CR - .05), 10), M['brass'], part=RJ, bw=0)
text('ROYAL JELLY', .22, (-15.65, .71, JZ), side=1, m=M['ink_k'], font=STENCIL, part=RJ)

# ---------------------------------------------------------------- render / export


def views(prefix_dir, tagged=True):
    sc = bpy.context.scene
    if not sc.camera:
        sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
        sc.render.resolution_x, sc.render.resolution_y = 1600, 700
        w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.05, .06, .08, 1)
        for loc, e in (((10, -40, 30), 12000), ((-20, 30, 20), 6000), ((40, 0, 10), 4000), ((10, 40, 30), 12000)):
            ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 20
            lo = bpy.data.objects.new('l', ld); lo.location = loc; COL.objects.link(lo)
            lo.rotation_euler = (Vector((2, 0, 2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'
        co = bpy.data.objects.new('c', cam); COL.objects.link(co); sc.camera = co
    co = sc.camera; os.makedirs(prefix_dir, exist_ok=True)
    def shot(name, loc, look=None, ortho=30, persp=False):
        co.data.type = 'PERSP' if persp else 'ORTHO'; co.data.ortho_scale = ortho; co.data.lens = 22
        co.location = loc
        co.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler() if look else (math.radians(90), 0, math.radians(180))
        sc.render.filepath = f'{prefix_dir}/hi_{name}.png'; bpy.ops.render.render(write_still=True)
    obs = [o for o in bpy.data.objects if o.type == 'MESH']
    def show(fn):
        for o in obs: o.hide_render = not fn(o)
    part = lambda o: o.get('part') or o.name
    base = ('tag_hi_drum', 'tag_hi_barrel', 'tag_hi_irons', 'j_gun')
    show(lambda o: any(part(o).endswith(b) for b in base))
    shot('left', (3, 60, 1), ortho=46)
    shot('close_mid', (2, 60, 2.5), ortho=22)
    shot('close_front', (14, 60, 2.5), ortho=17)
    shot('eye', (-13.5, 4.6, 3.2), look=(14, -.6, 1.4), persp=True)
    shot('three', (30, -32, 22), look=(2, 0, 2), ortho=40)
    show(lambda o: True)
    shot('all', (3, 60, 1), ortho=50)
    shot('all_three', (30, -32, 22), look=(2, 0, 2), ortho=44)
    for alt in ('tag_hi_swarm', 'tag_hi_keeper', 'tag_hi_smoker', 'tag_hi_killer'):
        hide = {'tag_hi_swarm': 'tag_hi_drum', 'tag_hi_keeper': 'tag_hi_drum', 'tag_hi_smoker': 'tag_hi_barrel', 'tag_hi_killer': 'tag_hi_barrel'}[alt]
        show(lambda o: any(part(o).endswith(b) for b in (*base, alt)) and not part(o).endswith(hide))
        shot('x_' + alt[7:], (24, -30, 16), look=(10, 0, 2), ortho=26)


if QUICK:
    for p, obs in PARTS.items():
        for o in obs: o['part'] = p
    views(RENDER or '/tmp/hive_r')
    sys.exit(0)

export(OUT, None, 'hi', BAKED, tex=TEX, frame=(1, 0, 1), ortho=48, spread=70)
if RENDER:
    views(RENDER)

# The Grave Bell (Melon Zombies' own melee, mods/melee melee.json grave_bell): a cracked verdigris-bronze funeral
# hand-bell on a bound-femur handle. Modelled in Blender units = inches along the bell's axis: +x runs from the handle's
# top (femoral head, x<0) through the fist (the origin, where tag_knife_attach holds it) to the bell's mouth (+x).
# Parts are collected per bone, baked into one atlas by bo7lib.export (camos paint it), then joined into one skinned
# mesh on its own small skeleton:
#   j_gun          the femur handle, leather wrap, coffin nails (the melee mod hangs it on the hand's knife tag)
#   j_bell         yoke, bell, MEMENTO MORI band, skulls, chain links (moved down the chain by Chained Bell)
#   j_clapper      the skull clapper on its rod (swings when it rings)
#   tag_gb_*       the attachments, hidden by tag until fitted (attachments.json gb_*)
#   blender -b -P .tools/build-grave-bell.py -- <view.glb> [--world <world.glb>] [--render <dir>] [--tex 2048]
# BO7_CPU=1 bakes on the CPU (when another program holds the GPU).
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *
import bo7lib

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'grave_bell_view.glb'
WORLD = argv[argv.index('--world') + 1] if '--world' in argv else None
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None
TEX = int(argv[argv.index('--tex') + 1]) if '--tex' in argv else 2048
random.seed(7)

TAGS = ('tag_gb_wolftone', 'tag_gb_irontongue', 'tag_gb_veil', 'tag_gb_crown', 'tag_gb_chain', 'tag_gb_lantern',
        'tag_gb_choir', 'tag_gb_requiem', 'tag_gb_ossuary', 'tag_gb_belfry')
PARTS.update({k: [] for k in ('j_gun', 'j_bell', 'j_clapper') + TAGS})
# bone -> (head position, parent)
BONES = {'j_gun': ((0, 0, 0), None), 'j_bell': ((1.8, 0, 0), 'j_gun'), 'j_clapper': ((3.5, 0, 0), 'j_bell'),
         'tag_gb_wolftone': ((10.3, 0, 0), 'j_clapper'), 'tag_gb_irontongue': ((8.0, 0, 0), 'j_clapper'),
         'tag_gb_veil': ((5, 0, 0), 'j_bell'), 'tag_gb_crown': ((3, 0, 0), 'j_bell'), 'tag_gb_lantern': ((11, 0, 3.6), 'j_bell'),
         'tag_gb_choir': ((4.3, 0, 0), 'j_bell'), 'tag_gb_chain': ((1.8, 0, 0), 'j_gun'), 'tag_gb_requiem': ((-1, 0, 0), 'j_gun'),
         'tag_gb_ossuary': ((-4.8, 0, 0), 'j_gun'), 'tag_gb_belfry': ((-6.6, 0, 0), 'j_gun')}

M.update(
    bronze=worn('gb_bronze', '#3d8a72', .62, .15, bare='#b8823e', wear=.75, mottle=.8, dirt=.55, chips=.25, under='#5a3b1e'),
    letter=worn('gb_letter', '#2f6e5c', .5, .3, bare='#d49a4c', wear=1, mottle=.4, dirt=.3),
    bone=worn('gb_bone', '#cfc3a2', .72, 0, bare='#efe6cb', wear=.5, bare_metal=False, mottle=.7, dirt=.7, chips=.2, under='#7a6a4a'),
    leather=worn('gb_leather', '#151112', .5, 0, bare='#4a352a', wear=.5, bare_metal=False, mottle=.4, dirt=.2),
    iron=worn('gb_iron', '#2c2a29', .62, .85, bare='#86817b', wear=.55, rust=.6, dirt=.4),
    cloth=worn('gb_cloth', '#0c0b0e', .95, 0, bare='#2c2930', wear=.35, bare_metal=False, mottle=.6, dirt=.3),
    socket=worn('gb_socket', '#070506', .9, 0, bare='#1a1512', wear=.1, bare_metal=False),
    glow=mat('gb_glow', '#7fe9ff', .4, 0, emit='#62dcff', strength=7),
    flame=mat('gb_flame', '#9dffd8', .4, 0, emit='#5effc4', strength=9),
)
BAKED = ('bronze', 'letter', 'bone', 'leather', 'iron', 'cloth', 'socket')


# ---- helpers -------------------------------------------------------------------------------------------------------
def lathe(profile, seg=56, x0=0.):
    """Revolve an (x, r) outline (closed: outer then inner) around the x axis."""
    bm = bmesh.new()
    vs = [bm.verts.new((x + x0, r, 0)) for x, r in profile]
    es = [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(1, 0, 0), angle=math.tau, steps=seg, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def sphere(c, r, scale=(1, 1, 1), seg=16, rings=10):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bm.transform(Matrix.Translation(c) @ Matrix.Diagonal((*scale, 1)))
    return bm


def torus(c, R, r, axis=(1, 0, 0), seg=20, rs=8, squash=1.):
    """A ring of radius R (tube r) around `axis` at c; squash stretches it along its long side (chain links)."""
    bm = bmesh.new(); vs = []
    for i in range(seg):
        a = math.tau * i / seg; ring = []
        for j in range(rs):
            b = math.tau * j / rs
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a) * squash, (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        vs.append(ring)
    for i in range(seg):
        for j in range(rs):
            bm.faces.new((vs[i][j], vs[(i + 1) % seg][j], vs[(i + 1) % seg][(j + 1) % rs], vs[i][(j + 1) % rs]))
    z = Vector((0, 0, 1)); a = Vector(axis).normalized()
    bm.transform(Matrix.Translation(c) @ z.rotation_difference(a).to_matrix().to_4x4())
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def tube(pts, r, n=8, flat=1., twist_up=None):
    """A tube swept along a polyline (flat < 1 squashes the section along the normal: a strap)."""
    bm = bmesh.new(); rings = []
    pts = [Vector(p) for p in pts]
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector(twist_up(p)) if twist_up else (Vector((1, 0, 0)) if abs(t.x) < .9 else Vector((0, 0, 1)))
        nrm = t.cross(up).normalized(); bi = t.cross(nrm).normalized()
        rings.append([bm.verts.new(p + (nrm * math.cos(a) * flat + bi * math.sin(a)) * r) for a in (math.tau * k / n for k in range(n))])
    for i in range(len(rings) - 1):
        for k in range(n):
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][(k + 1) % n], rings[i][(k + 1) % n]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def frame(c, normal, up):
    """A matrix whose z is `normal`, y is `up` (made perpendicular), at c."""
    n = Vector(normal).normalized(); u = Vector(up); u = (u - n * u.dot(n)).normalized(); x = u.cross(n)
    m = Matrix((x, u, n)).transposed().to_4x4(); m.translation = c; return m


def place(bm, m):
    bm.transform(m); return bm


def skull(part, c, normal, up, s=1., jaw_open=0., mats=('bone', 'socket')):
    """A small skull facing `normal`, crown toward `up`: cranium, cheekbones, eye sockets, nose, teeth, jaw."""
    m = frame(Vector(c), normal, up) @ Matrix.Diagonal((s, s, s, 1))
    plain('sk_cran', place(sphere((0, .18, -.2), .62, (1, 1.05, .95), 18, 12), m), M[mats[0]], part)
    plain('sk_face', place(sphere((0, -.22, .05), .48, (1.05, .8, .85), 16, 10), m), M[mats[0]], part)
    for sx in (-1, 1):
        plain('sk_cheek', place(sphere((sx * .33, -.2, .22), .2, (1.2, .8, .8), 10, 8), m), M[mats[0]], part)
        plain('sk_eye', place(sphere((sx * .2, -.08, .33), .16, (1.1, 1, .7), 10, 8), m), M[mats[1]], part)
    nose = bmesh.new(); a = nose.verts.new((-.07, -.27, .45)); b = nose.verts.new((.07, -.27, .45)); cc = nose.verts.new((0, -.4, .44))
    nose.faces.new((a, b, cc)); bmesh.ops.solidify(nose, geom=nose.faces[:], thickness=.04)
    plain('sk_nose', place(nose, m), M[mats[1]], part)
    jaw = Matrix.Translation((0, -.5, .12)) @ Matrix.Rotation(-jaw_open, 4, 'X') @ Matrix.Translation((0, .5, -.12))
    plain('sk_jaw', place(sphere((0, -.6, .02), .34, (1, .55, .7), 14, 8), m @ jaw), M[mats[0]], part)
    for k in range(5):
        x = (k - 2) * .085
        plain('sk_tooth', place(boxbm(x - .03, x + .03, -.06, .06, -.05, .05), m @ Matrix.Translation((0, -.47, .33))), M[mats[0]], part)
        plain('sk_tooth', place(boxbm(x - .03, x + .03, -.06, .06, -.05, .05), m @ jaw @ Matrix.Translation((0, -.58, .3))), M[mats[0]], part)
    if jaw_open > .05:   # an open mouth shows dark inside
        plain('sk_mouth', place(sphere((0, -.52, .2), .2, (1, .6, .5), 10, 6), m), M[mats[1]], part)


def letters(body, x, r, size, part, m, start=0., gap=1.):
    """Raised letters around the x axis at radius r: read left to right with the bell's mouth down."""
    step = size * .82 * gap / r
    for i, ch in enumerate(body):
        th = start - i * step
        if ch == ' ':
            continue
        cu = bpy.data.curves.new('t', 'FONT'); cu.body = ch; cu.size = size; cu.extrude = .05; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
        ob = bpy.data.objects.new('t', cu); COL.objects.link(ob); bpy.context.view_layer.update()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get())); bpy.data.objects.remove(ob)
        n = Vector((0, math.cos(th), math.sin(th))); t = Vector((0, -math.sin(th), math.cos(th)))
        # text x along -t (reads around), text y toward the handle (-x), text z out of the surface
        mm = Matrix((-t, Vector((-1, 0, 0)), n)).transposed().to_4x4(); mm.translation = Vector((x, 0, 0)) + n * r
        me.transform(mm); o2 = bpy.data.objects.new('txt', me); COL.objects.link(o2); me.materials.append(m)
        PARTS[part].append(o2)


def bell_r(x):
    """The bell's outer radius at x (bell space: crown at 3, lip at 10.6)."""
    pts = [(3.0, 1.25), (3.3, 1.85), (3.9, 2.12), (5.0, 2.08), (6.4, 2.06), (7.6, 2.22), (8.6, 2.6), (9.5, 3.15), (10.2, 3.7), (10.55, 3.92)]
    for (a, ra), (b, rb) in zip(pts, pts[1:]):
        if a <= x <= b:
            return ra + (rb - ra) * (x - a) / (b - a)
    return pts[-1][1]


def zig(x0, x1, th, n, amp, seed):
    """A jagged crack line on the bell's surface from x0 to x1 around angle th."""
    rnd = random.Random(seed); out = []
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n; a = th + (rnd.random() - .5) * amp * (1 if k else 0)
        out.append((x, a))
    return out


# ---- the bell (j_bell) ---------------------------------------------------------------------------------------------
OUTER = [(3.0, 0), (3.0, 1.25), (3.3, 1.85), (3.9, 2.12), (5.0, 2.08), (6.4, 2.06), (7.6, 2.22), (8.6, 2.6), (9.5, 3.15), (10.2, 3.7), (10.55, 3.92), (10.72, 3.82)]
INNER = [(10.72, 3.52), (10.3, 3.4), (9.5, 2.85), (8.5, 2.3), (7.5, 1.92), (6.0, 1.8), (4.3, 1.78), (3.7, 1.4), (3.6, 0)]
cracks = [zig(10.7, 6.4, math.radians(200), 7, .22, 1), zig(10.7, 8.2, math.radians(-25), 4, .2, 2)]
cuts = []
for cr in cracks:   # a thin jagged slot through the wall along each crack
    for (xa, aa), (xb, ab) in zip(cr, cr[1:]):
        pa, pb = Vector((xa, math.cos(aa), math.sin(aa))), Vector((xb, math.cos(ab), math.sin(ab)))
        mid = (pa + pb) / 2; d = Vector((xb - xa, (math.cos(ab) - math.cos(aa)) * 3, (math.sin(ab) - math.sin(aa)) * 3))
        ln = d.length; th = math.atan2(mid.z, mid.y); n = Vector((0, math.cos(th), math.sin(th)))
        c = Vector((mid.x, 0, 0)) + n * bell_r(mid.x)
        cuts.append(place(boxbm(-ln / 2 - .05, ln / 2 + .05, -.07, .07, -.9, .9), frame(c, n, d.normalized()) @ Matrix.Rotation(math.pi / 2, 4, 'Z')))
solid('bell', lathe(OUTER + INNER), M['bronze'], 'j_bell', cuts=cuts, bw=.04, ang=40)
# the crack's spectral light, just under the surface
for cr in cracks:
    for (xa, aa), (xb, ab) in zip(cr, cr[1:]):
        ra, rb = bell_r(xa) - .12, bell_r(xb) - .12
        plain('crackglow', tube([(xa, math.cos(aa) * ra, math.sin(aa) * ra), (xb, math.cos(ab) * rb, math.sin(ab) * rb)], .06, 6), M['glow'], 'j_bell')
# bands: lip bead, sound-bow rings, the inscription band's two rings, shoulder ring
for x, R, r in ((10.6, 3.94, .1), (9.7, bell_r(9.7) + .02, .07), (9.95, bell_r(9.95) + .02, .06), (5.95, bell_r(5.95) + .02, .08), (7.15, bell_r(7.15) + .02, .08), (3.95, 2.14, .07)):
    plain('band', torus((x, 0, 0), R, r, seg=56, rs=8), M['bronze'], 'j_bell')
letters('MEMENTO MORI + MEMENTO MORI + ', 6.55, bell_r(6.55) + .01, .62, 'j_bell', M['letter'], start=math.radians(-60), gap=.86)
# skulls around the sound bow, crowns toward the handle
for k in range(7):
    th = math.tau * k / 7 + .2; n = Vector((0, math.cos(th), math.sin(th)))
    tilt = Vector((-.6, 0, 0)) + n; c = Vector((8.75, 0, 0)) + n * (bell_r(8.75) + .12)
    skull('j_bell', c, tilt.normalized(), (-1, 0, 0), .78)
# the crown: a dome cap, the canons (loops) the yoke grips, the yoke collar
plain('crown', lathe([(2.4, 0), (2.4, .9), (2.7, 1.25), (3.05, 1.35), (3.15, 0)], seg=40), M['bronze'], 'j_bell')
for th in (0, math.pi / 2):
    plain('canon', torus((2.3, 0, 0), .55, .16, axis=(0, math.cos(th + math.pi / 2), math.sin(th + math.pi / 2)), seg=20, rs=8, squash=1.25), M['bronze'], 'j_bell')
solid('yoke', lathe([(1.5, 0), (1.5, .78), (1.7, .95), (2.35, 1.05), (2.45, .9), (2.5, 0)], seg=36), M['iron'], 'j_bell', bw=.03)
for th in range(4):   # yoke rivets
    a = th * math.pi / 2 + math.pi / 4; n = Vector((0, math.cos(a), math.sin(a)))
    plain('rivet', place(sphere((0, 0, 0), .11, (1, 1, .6), 8, 6), frame(Vector((2.0, 0, 0)) + n * 1.0, n, (-1, 0, 0))), M['iron'], 'j_bell')
# a side eyelet with hanging chain links and a little iron coffin charm (on the +z shoulder)
plain('eyelet', torus((3.5, 0, 2.05), .28, .08, axis=(0, 1, 0), seg=16, rs=6), M['iron'], 'j_bell')
pz, px = 2.32, 3.75
for k in range(4):
    ax = (0, 1, 0) if k % 2 else (0, 0, 1)
    x = px + .45 + k * .52; z = bell_r(x) + .28 + k * .03
    plain('link', torus((x, 0, z), .26, .06, axis=ax, seg=14, rs=6, squash=1.4), M['iron'], 'j_bell')
cx = px + .45 + 4 * .52 + .55; cz = bell_r(cx) + .45
coffin = prism([(-.55, 0), (-.2, .3), (.75, .2), (.75, -.2), (-.2, -.3)], -.08, .08)
plain('coffin', place(coffin, Matrix.Translation((cx, 0, cz)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Rotation(-.15, 4, 'Z')), M['iron'], 'j_bell')
plain('coffin_x', place(boxbm(-.06, .06, -.1, .1, -.12, .12), Matrix.Translation((cx + .05, .12, cz))), M['bronze'], 'j_bell')

# ---- the skull clapper (j_clapper) ---------------------------------------------------------------------------------
plain('cl_loop', torus((3.85, 0, 0), .3, .09, axis=(0, 0, 1), seg=14, rs=6), M['iron'], 'j_clapper')
plain('cl_rod', cylbm(.17, 4.1, 9.5, 0, seg=12), M['iron'], 'j_clapper')
plain('cl_collar', cylbm(.3, 9.2, 9.55, 0, seg=14), M['iron'], 'j_clapper')
skull('j_clapper', (10.3, 0, 0), (.35, -1, -.2), (-1, 0, 0), 1.05)

# ---- the femur handle (j_gun) --------------------------------------------------------------------------------------
shaft = [(-5.5, .55), (-4.5, .5), (-2.5, .46), (0, .44), (1.0, .5), (1.4, .6)]
plain('femur', lathe([(x, r) for x, r in shaft] + [(1.4, 0), (-5.5, 0)], seg=20), M['bone'], 'j_gun')
plain('fhead', sphere((-6.35, .1, .25), .78, (1, 1, 1), 18, 12), M['bone'], 'j_gun')   # femoral head, a little off axis
plain('fneck', tube([(-5.4, 0, 0), (-6.0, .05, .15)], .5, 12), M['bone'], 'j_gun')
plain('troch', sphere((-5.7, -.05, -.5), .45, (1.3, 1, .9), 14, 10), M['bone'], 'j_gun')
for sy in (-1, 1):   # the knee end's two condyles, seated in the yoke
    plain('condyle', sphere((1.55, sy * .38, 0), .52, (1, .85, 1), 16, 10), M['bone'], 'j_gun')
# black leather strap wound round the grip
hel = [(x, math.cos(x * 6.4) * .5, math.sin(x * 6.4) * .5) for x in [(-3.6 + 4.7 * k / 240) for k in range(241)]]
plain('wrap', tube(hel, .26, 8, flat=.3), M['leather'], 'j_gun')
for x in (-3.65, 1.12):   # lashing at each end
    plain('lash', torus((x, 0, 0), .56, .07, seg=20, rs=6), M['leather'], 'j_gun')
# coffin nails driven through the wrap: square heads, bent
for k, (x, a) in enumerate(((-3.0, .3), (-1.9, 2.4), (-.6, 4.1), (.5, 1.2), (-2.5, 5.2))):
    n = Vector((0, math.cos(a), math.sin(a)))
    head = prism([(-.13, -.13), (.13, -.13), (.13, .13), (-.13, .13)], 0, .09)
    plain('nail', place(head, frame(Vector((x, 0, 0)) + n * .62, n, (-1, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'X')), M['iron'], 'j_gun')
    plain('nail_cap', place(sphere((0, 0, 0), .1, (1, 1, .45), 6, 4), frame(Vector((x, 0, 0)) + n * .72, n, (-1, 0, 0))), M['iron'], 'j_gun')

# ---- attachments -----------------------------------------------------------------------------------------------------
# Wolf Tone: an iron wolf's jaw clamped over the skull clapper, fangs out (clapper slot)
for sz in (-1, 1):
    jaw = [(9.75, sz * .6), (10.35, sz * 1.25), (11.05, sz * 1.15), (11.3, sz * .55)]
    plain('wt_jaw', tube([(x, -.25, z) for x, z in jaw], .14, 8), M['iron'], 'tag_gb_wolftone')
    plain('wt_jaw2', tube([(x, .55, z * .9) for x, z in jaw], .1, 6), M['iron'], 'tag_gb_wolftone')
    for k, (x, z) in enumerate(jaw):
        tip = Vector((x + .05, -.6, z - sz * .35))
        c = bmesh.new(); bmesh.ops.create_cone(c, cap_ends=True, segments=8, radius1=.13, radius2=0, depth=.6)
        plain('wt_fang', place(c, frame(Vector((x, -.3, z)) + (tip - Vector((x, -.3, z))) * .5, tip - Vector((x, -.3, z)), (1, 0, 0))), M['bone'], 'tag_gb_wolftone')
plain('wt_ring', torus((9.75, 0, 0), .62, .1, seg=18, rs=6), M['iron'], 'tag_gb_wolftone')
# Iron Tongue: a ribbed lead weight on the clapper rod and a band round the skull (clapper slot)
plain('it_weight', lathe([(7.2, 0), (7.2, .45), (7.5, .8), (8.3, .82), (8.6, .45), (8.6, 0)], seg=20), M['iron'], 'tag_gb_irontongue')
for x in (7.6, 7.9, 8.2):
    plain('it_rib', torus((x, 0, 0), .82, .06, seg=20, rs=6), M['iron'], 'tag_gb_irontongue')
plain('it_band', torus((10.2, 0, 0), .78, .1, seg=24, rs=6), M['iron'], 'tag_gb_irontongue')
for k in range(6):
    a = math.tau * k / 6; plain('it_stud', sphere((10.2, math.cos(a) * .86, math.sin(a) * .86), .09, (1, 1, 1), 6, 4), M['iron'], 'tag_gb_irontongue')
# Mourning Veil: black cloth over the shoulder, torn strips hanging past the lip (shroud slot)
plain('veil_cap', lathe([(2.6, 0), (2.6, 1.45), (3.4, 2.1), (4.3, 2.4), (5.4, 2.42), (5.4, 2.32), (4.25, 2.3), (3.35, 2.0), (2.7, 1.38), (2.7, 0)], seg=40), M['cloth'], 'tag_gb_veil')
rnd = random.Random(3)
for k in range(15):
    a = math.tau * k / 15 + rnd.random() * .2; L = 11.0 + rnd.random() * 2.2; w = .38 + rnd.random() * .25
    pts = []
    for j in range(9):
        x = 5.1 + (L - 5.1) * j / 8; r = max(bell_r(min(x, 10.6)) + .12, 2.4) + (x - 10.6 if x > 10.6 else 0) * -.15 + rnd.random() * .05
        pts.append((x, math.cos(a + j * .02) * r, math.sin(a + j * .02) * r))
    plain('veil_strip', tube(pts, w, 6, flat=.12, twist_up=lambda p, a=a: (0, math.sin(a), -math.cos(a))), M['cloth'], 'tag_gb_veil')
# Cracked Crown: a jagged iron crown round the bell's crown, one point snapped off, light through its crack (crown slot)
plain('cr_ring', torus((3.05, 0, 0), 1.55, .16, seg=32, rs=8), M['iron'], 'tag_gb_crown')
for k in range(7):
    a = math.tau * k / 7; n = Vector((0, math.cos(a), math.sin(a))); L = .5 if k == 4 else 1.4
    c = bmesh.new(); bmesh.ops.create_cone(c, cap_ends=True, segments=4, radius1=.32, radius2=.02 if k != 4 else .2, depth=L)
    d = Vector((-1, 0, 0)) + n * .45
    plain('cr_spike', place(c, frame(Vector((3.05, 0, 0)) + n * 1.55 + d.normalized() * L / 2, d, n)), M['iron'], 'tag_gb_crown')
    plain('cr_gem', sphere((3.05, n.y * 1.72, n.z * 1.72), .12, (1, 1, 1), 8, 6), M['glow'], 'tag_gb_crown')
# Chained Bell: the bell rides 7 inches down a chain off the femur's knee (hang slot; the mod moves j_bell)
for k in range(9):
    ax = (0, 1, 0) if k % 2 else (0, 0, 1)
    plain('ch_link', torus((2.05 + k * .78, 0, 0), .34, .09, axis=ax, seg=14, rs=6, squash=1.5), M['iron'], 'tag_gb_chain')
plain('ch_shackle', torus((1.75, 0, 0), .5, .11, axis=(0, 1, 0), seg=16, rs=6), M['iron'], 'tag_gb_chain')
# Sexton's Lantern: a little iron lantern on a hook from the lip, a ghost-light flame inside (hang slot)
LX, LZ = 12.5, 3.6
plain('ln_hook', tube([(10.6, 0, 3.75), (10.95, 0, 4.15), (11.35, 0, 3.95), (11.45, 0, LZ)], .07, 6), M['iron'], 'tag_gb_lantern')
plain('ln_top', place(lathe([(11.4, 0), (11.4, .25), (11.85, .82), (11.95, .82), (11.95, 0)], seg=4), Matrix.Translation((0, 0, LZ))), M['iron'], 'tag_gb_lantern')
for k in range(4):
    a = math.tau * k / 4 + math.pi / 4
    plain('ln_post', cylbm(.06, 11.9, 13.3, math.sin(a) * .62 + LZ, y=math.cos(a) * .62, seg=6), M['iron'], 'tag_gb_lantern')
plain('ln_base', place(lathe([(13.25, 0), (13.25, .8), (13.5, .7), (13.55, 0)], seg=4), Matrix.Translation((0, 0, LZ))), M['iron'], 'tag_gb_lantern')
plain('ln_flame', sphere((12.65, 0, LZ), .36, (1.6, 1, 1), 12, 8), M['flame'], 'tag_gb_lantern')
plain('ln_wick', cylbm(.05, 12.9, 13.25, LZ, seg=6), M['iron'], 'tag_gb_lantern')
# Choir of the Dead: three little skulls singing on the shoulder, wisps rising (rite slot)
for k, a in enumerate((math.radians(-80), math.radians(-30), math.radians(20))):
    n = Vector((0, math.cos(a), math.sin(a)))
    skull('tag_gb_choir', Vector((4.55, 0, 0)) + n * 2.45, (n + Vector((-.6, 0, 0))).normalized(), (-1, 0, 0), .42, jaw_open=.5)
    for j in range(3):
        plain('ch_wisp', sphere(tuple(Vector((3.7 - j * .55, 0, 0)) + n * (2.9 + j * .35)), .12 - j * .03, (1.6, 1, 1), 8, 6), M['glow'], 'tag_gb_choir')
# Requiem: a rosary of bone beads wound round the grip, a little bronze cross hanging (rite slot)
beads = [(x, math.cos(-x * 2.2 + 1) * .66, math.sin(-x * 2.2 + 1) * .66) for x in [(-3.3 + 4.2 * k / 22) for k in range(23)]]
for p in beads:
    plain('rq_bead', sphere(p, .13, (1, 1, 1), 8, 6), M['bone'], 'tag_gb_requiem')
drop = [beads[-1], (1.2, beads[-1][1] * 1.2, beads[-1][2] * 1.2 + .4), (1.6, 0, 1.5)]
for k in range(1, 6):
    t = k / 6; p = Vector(drop[0]).lerp(Vector(drop[2]), t); plain('rq_bead', sphere(tuple(p), .11, (1, 1, 1), 8, 6), M['bone'], 'tag_gb_requiem')
cm = Matrix.Translation((2.2, 0, 1.7)) @ Matrix.Rotation(math.radians(70), 4, 'Y')
plain('rq_cross', place(boxbm(-.75, .75, -.08, .08, -.12, .12), cm), M['bronze'], 'tag_gb_requiem')
plain('rq_cross2', place(boxbm(-.35, -.15, -.08, .08, -.45, .45), cm), M['bronze'], 'tag_gb_requiem')
# Ossuary Grip: a skeleton's hand clasping the top of the femur (grip slot)
for k, a in enumerate((.3, 1.1, 1.9, 2.7)):
    base = Vector((-4.5 - k * .05, 0, 0))
    pts = [base + Vector((0, math.cos(a + j * .55) * .62, math.sin(a + j * .55) * .62)) + Vector((-.15 * j, 0, 0)) for j in range(5)]
    for j in range(4):
        plain('os_phal', tube([pts[j], pts[j + 1]], .1 - j * .012, 6), M['bone'], 'tag_gb_ossuary')
        plain('os_knuck', sphere(tuple(pts[j]), .13 - j * .015, (1, 1, 1), 8, 6), M['bone'], 'tag_gb_ossuary')
plain('os_palm', place(sphere((0, 0, 0), .55, (1.4, .6, 1), 12, 8), Matrix.Translation((-4.3, -.55, -.3))), M['bone'], 'tag_gb_ossuary')
plain('os_thumb', tube([(-4.0, -.7, -.5), (-4.6, -.65, .2), (-5.0, -.4, .55)], .1, 6), M['bone'], 'tag_gb_ossuary')
# Belfry Spike: an iron grave spike driven through the femoral head (pommel slot)
c = bmesh.new(); bmesh.ops.create_cone(c, cap_ends=True, segments=4, radius1=.32, radius2=.0, depth=3.4)
plain('bf_spike', place(c, frame(Vector((-8.6, .1, .25)), (-1, 0, 0), (0, 0, 1))), M['iron'], 'tag_gb_belfry')
plain('bf_collar', torus((-6.95, .1, .25), .36, .1, seg=14, rs=6), M['iron'], 'tag_gb_belfry')
for sy in (-1, 1):
    c = bmesh.new(); bmesh.ops.create_cone(c, cap_ends=True, segments=4, radius1=.14, radius2=0, depth=1.0)
    plain('bf_barb', place(c, frame(Vector((-8.2, .1 + sy * .45, .25)), (.6, sy * 1, 0), (0, 0, 1))), M['iron'], 'tag_gb_belfry')

# ---- bake, then one skinned mesh on the bell's skeleton -------------------------------------------------------------
bo7lib.export(OUT + '.parts.glb', None, 'gravebell', BAKED, tex=TEX, spread=40)
os.remove(OUT + '.parts.glb')
arm_d = bpy.data.armatures.new('grave_bell'); arm = bpy.data.objects.new('grave_bell', arm_d); COL.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for name, (head, parent) in BONES.items():
    b = arm_d.edit_bones.new(name); b.head = head; b.tail = Vector(head) + Vector((0, .5, 0)); eb[name] = b
for name, (head, parent) in BONES.items():
    if parent: eb[name].parent = eb[parent]
bpy.ops.object.mode_set(mode='OBJECT')
objs = []
for part in PARTS:
    o = bpy.data.objects.get('part_' + part)
    if not o: continue
    vg = o.vertex_groups.new(name=part); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE'); objs.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
body = bpy.context.view_layer.objects.active; body.name = body.data.name = 'grave_bell'
body.parent = arm; mod = body.modifiers.new('arm', 'ARMATURE'); mod.object = arm


def export_glb(path):
    bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); body.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_materials='EXPORT', export_image_format='WEBP', export_image_quality=90, export_skins=True,
                              export_all_influences=False, export_def_bones=False, export_texcoords=True, export_normals=True)
    print('[bell] wrote', path)


export_glb(OUT)
if RENDER:
    os.makedirs(RENDER, exist_ok=True)
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 900, 1100
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.03, .035, .045, 1)
    for loc, e in (((0, -30, 20), 9000), ((-10, 25, 10), 4000), ((25, 0, -10), 3000), ((-25, -10, -15), 3000)):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 15
        lo = bpy.data.objects.new('l', ld); lo.location = loc; COL.objects.link(lo)
        lo.rotation_euler = (Vector((3, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 24
    co = bpy.data.objects.new('c', cam); COL.objects.link(co); sc.camera = co
    arm.rotation_euler = (0, math.radians(90), 0)   # mouth down for the pictures
    pb = arm.pose.bones

    def shot(name, show, loc=(3, -40, 4)):
        for t in TAGS: pb[t].scale = (1, 1, 1) if t in show else (1e-4, 1e-4, 1e-4)
        pb['j_bell'].location = (0, 0, 0)
        if 'tag_gb_chain' in show: pb['j_bell'].location = (7, 0, 0)   # the bones' rest frame is the model's (identity), so x = down the chain
        co.location = loc; co.rotation_euler = (Vector((0, 0, -1.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{RENDER}/{name}.png'; bpy.ops.render.render(write_still=True)
    shot('stock', ())
    shot('stock_34', (), (-25, -30, 8))
    shot('clappers', ('tag_gb_wolftone', 'tag_gb_crown', 'tag_gb_choir', 'tag_gb_ossuary', 'tag_gb_belfry'), (-20, -32, 6))
    shot('veil_lantern', ('tag_gb_veil', 'tag_gb_lantern', 'tag_gb_requiem', 'tag_gb_irontongue'), (20, -32, 6))
    arm.rotation_euler = (0, 0, 0)
if WORLD:
    # third person: holdWeapon points a gun's +x along the arm, sights +z: the bell hangs down (-z) from the fist
    arm.rotation_euler = (0, math.radians(90), 0)
    for t in TAGS: arm.pose.bones[t].scale = (1, 1, 1)
    arm.pose.bones['j_bell'].location = (0, 0, 0)
    export_glb(WORLD)

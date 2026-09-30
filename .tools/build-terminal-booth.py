# Builds the terminal booth prop: a payphone-style wall booth whose phone is
# a CRT terminal with a retro keyboard, wrapped in hoses, conduits and live
# wiring. Everything is generated here; grime, edge wear, crevice dirt and
# rounded edges are baked (Cycles) into one texture set for the game.
#
#   blender -b -P .tools/build-terminal-booth.py -- <out.glb> [--nobake] [--render <dir>] [--compact]
#
# --compact leaves out everything above the roof (conduit risers, cable spans)
# and moves the roof vent forward, for spots with low headroom near the wall
# (under Kino's west staircase).
#
# Units are inches (Kino units). Blender Z-up, the wall is the y=0 plane and
# the booth stands in -Y; after glTF export it faces +Z with its back at z=0.
# Node names the game mod looks for: crt_screen, sign_glow, wire_*, led_*,
# coolant_*, glass_*, spark_* (empties).
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/terminal_booth.glb'
BAKE = '--nobake' not in argv
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None
COMPACT = '--compact' in argv
TEX = 2048
random.seed(20260930)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection
BAKED = {'shell': [], 'front': [], 'term': []}   # bake groups: each gets its own texture set
GROUP = 'shell'
LOOSE = []      # emissive / transparent / animated parts kept separate


def srgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c) + (1,)


# ---------------------------------------------------------------- materials
def sock(node, ident, out=False):
    return next(s for s in (node.outputs if out else node.inputs) if s.identifier == ident)


class NT:
    def __init__(self, mat):
        self.N, self.L = mat.node_tree.nodes, mat.node_tree.links

    def new(self, t, **kw):
        n = self.N.new(t)
        for k, v in kw.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.L.new(a, b)

    def val(self, s, v):
        if isinstance(v, (int, float, tuple)):
            s.default_value = v
        else:
            self.link(v, s)

    def math(self, op, a, b=0.0, clamp=False):
        n = self.new('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.val(n.inputs[0], a); self.val(n.inputs[1], b)
        return n.outputs[0]

    def mr(self, v, a, b, c=0.0, d=1.0):
        n = self.new('ShaderNodeMapRange')
        self.val(n.inputs['Value'], v)
        n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = a, b
        n.inputs['To Min'].default_value, n.inputs['To Max'].default_value = c, d
        return n.outputs['Result']

    def mixf(self, f, a, b):
        n = self.new('ShaderNodeMix', data_type='FLOAT')
        self.val(sock(n, 'Factor_Float'), f); self.val(sock(n, 'A_Float'), a); self.val(sock(n, 'B_Float'), b)
        return sock(n, 'Result_Float', True)

    def mixc(self, f, a, b):
        n = self.new('ShaderNodeMix', data_type='RGBA')
        self.val(sock(n, 'Factor_Float'), f); self.val(sock(n, 'A_Color'), a); self.val(sock(n, 'B_Color'), b)
        return sock(n, 'Result_Color', True)

    def noise(self, vec, scale, detail=6.0, rough=.55):
        n = self.new('ShaderNodeTexNoise')
        self.link(vec, n.inputs['Vector']); n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']


METAL = {}   # material name -> socket feeding Metallic (for the metallic bake)


def grimy(name, base, rough=.55, metal=0., wear=.5, grime=.6, bare='#8c8f91', stripes=None, rust=.5, bare_metal=True):
    """Worn industrial surface: paint chipped to bare metal on edges, dirt in
    crevices and near the floor, rust streaks running down."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    t = NT(m); bsdf = t.N['Principled BSDF']
    obj = t.new('ShaderNodeTexCoord').outputs['Object']
    z = t.new('ShaderNodeSeparateXYZ'); t.link(obj, z.inputs[0])
    # base colour, optionally hazard stripes
    col = srgb(base)
    if stripes:
        w = t.new('ShaderNodeTexWave', wave_type='BANDS', bands_direction='DIAGONAL')
        t.link(obj, w.inputs['Vector']); w.inputs['Scale'].default_value = .09
        w.inputs['Distortion'].default_value = 0
        band = t.math('GREATER_THAN', t.math('SINE', t.math('MULTIPLY', t.math('ADD', sock(z, 'X', True), sock(z, 'Z', True)), 1.1)), 0)
        col = t.mixc(band, srgb(stripes[0]), srgb(stripes[1]))
    # edge wear from the bevel normal vs the true normal
    bev = t.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = .35; bev.samples = 8
    geo = t.new('ShaderNodeNewGeometry')
    dot = t.new('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    t.link(bev.outputs['Normal'], dot.inputs[0]); t.link(geo.outputs['Normal'], dot.inputs[1])
    edge = t.mr(dot.outputs['Value'], .998, .9)
    # chipped paint: crisp-edged flakes along edges, plus a few bigger bites
    chip = t.mr(t.noise(obj, 3.4, 10, .6), .45, .48)
    bite = t.mr(t.noise(obj, 1.1, 6), .56, .58)
    worn = t.math('MULTIPLY', edge, t.math('MAXIMUM', chip, bite))
    # worn-through patches on flat faces
    patch = t.mr(t.noise(obj, .35, 7), .62, .68)
    worn = t.math('ADD', worn, t.math('MULTIPLY', patch, .75))
    # scratches: thin sharp lines, dense inside scrape zones and sparse elsewhere
    zone = t.mr(t.noise(obj, .45, 4), .5, .62)
    scratch = 0.0
    for k in range(4):
        scm = t.new('ShaderNodeMapping'); t.link(obj, scm.inputs['Vector'])
        scm.inputs['Scale'].default_value = ((4.0, 4.0, .18), (.2, 4.0, 4.0), (4.0, .2, 4.0), (3.0, 3.0, .3))[k]
        scm.inputs['Rotation'].default_value = (random.random() * 3, random.random() * 3, random.random() * 3)
        n = t.noise(scm.outputs['Vector'], (6.0, 5.0, 7.0, 9.0)[k], 2, .35)
        line = t.mr(t.math('ABSOLUTE', t.math('SUBTRACT', n, .5)), .007, 0)
        scratch = t.math('MAXIMUM', scratch, line)
    scratch = t.math('MULTIPLY', scratch, t.math('ADD', t.math('MULTIPLY', zone, .85), .15))
    worn = t.math('MAXIMUM', worn, scratch)
    worn = t.math('MULTIPLY', worn, wear, clamp=True)
    # dirt: large blotches, crevices (AO), heavier near the floor, vertical streaks
    blot = t.mr(t.noise(obj, .08, 8), .36, .66)
    ao = t.new('ShaderNodeAmbientOcclusion', samples=12, only_local=False)
    ao.inputs['Distance'].default_value = 3.5
    crev = t.mr(ao.outputs['AO'], .9, .3)
    low = t.mr(sock(z, 'Z', True), 2, 36)
    low = t.math('SUBTRACT', 1, low)
    sm = t.new('ShaderNodeMapping'); t.link(obj, sm.inputs['Vector']); sm.inputs['Scale'].default_value = (1.0, 1.0, .06)
    streak = t.mr(t.noise(sm.outputs['Vector'], .9, 4), .44, .64)
    rustp = t.mr(t.noise(obj, .22, 7), .58, .7)
    rusty = t.math('MINIMUM', 1, t.math('MULTIPLY', t.math('ADD', streak, t.math('MULTIPLY', rustp, .9)), rust))
    dirt = t.math('ADD', t.math('MULTIPLY', blot, .75), t.math('MULTIPLY', crev, 1.1))
    dirt = t.math('ADD', dirt, t.math('MULTIPLY', low, .6))
    dirt = t.math('MULTIPLY', dirt, grime, clamp=True)
    # dust settled on upward-facing surfaces
    up = t.new('ShaderNodeSeparateXYZ'); t.link(geo.outputs['Normal'], up.inputs[0])
    dust = t.math('MULTIPLY', t.mr(sock(up, 'Z', True), .45, .9), t.mr(t.noise(obj, .5, 5), .3, .65))
    dust = t.math('MULTIPLY', dust, grime * .85, clamp=True)
    c = t.mixc(worn, col, srgb(bare))
    c = t.mixc(rusty, c, srgb('#5e2c12'))
    c = t.mixc(dirt, c, srgb('#130e09'))
    c = t.mixc(dust, c, srgb('#5d564b'))
    r = t.mixf(worn, rough, .36)
    r = t.mixf(rusty, r, .88)
    r = t.mixf(dirt, r, .93)
    r = t.mixf(dust, r, .97)
    mt = t.mixf(worn, metal, 1.0) if bare_metal else t.mixf(worn, metal, metal)
    mt = t.mixf(t.math('MAXIMUM', t.math('MULTIPLY', dirt, .85), t.math('MAXIMUM', rusty, dust)), mt, 0.0)
    t.link(c, bsdf.inputs['Base Color']); t.link(r, bsdf.inputs['Roughness']); t.link(mt, bsdf.inputs['Metallic'])
    METAL[name] = mt
    # rounded edges and fine surface pitting
    bev2 = t.new('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = .18; bev2.samples = 8
    bump = t.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .3; bump.inputs['Distance'].default_value = .035
    height = t.math('SUBTRACT', t.math('MULTIPLY', t.noise(obj, 6, 4), .25), worn)   # chips and scratches sit below the paint
    t.link(height, bump.inputs['Height']); t.link(bev2.outputs['Normal'], bump.inputs['Normal'])
    t.link(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def plain(name, base, rough=.5, metal=0., emit=None, strength=0., alpha=1.):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(base)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit); b.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


M = dict(
    paint=grimy('paint', '#3f524c', .6, 0, wear=1, grime=0.85),
    paint2=grimy('paint2', '#2f3d3a', .6, 0, wear=0.75, grime=0.91),
    orange=grimy('orange', '#b0521d', .55, 0, wear=1, grime=0.72),
    hazard=grimy('hazard', '#000000', .6, 0, wear=1, grime=0.78, stripes=('#d8a51e', '#16140f')),
    steel=grimy('steel', '#7d8184', .42, 1, wear=0.1, grime=0.65, rust=0.28),
    dsteel=grimy('dsteel', '#393b3d', .5, 1, wear=0.49, grime=0.72, rust=0.42),
    brass=grimy('brass', '#a8854e', .35, 1, wear=0, grime=0.72, rust=0),
    copper=grimy('copper', '#a0603c', .38, 1, wear=0, grime=0.65, rust=0),
    crt=grimy('crt', '#a99c7a', .5, 0, wear=0.6, grime=1, bare='#8a826c', rust=0.07, bare_metal=False),
    bezel=grimy('bezel', '#5a5549', .55, 0, wear=0.5, grime=0.9, bare='#777060', rust=0, bare_metal=False),
    kbd=grimy('kbd', '#48443c', .6, 0, wear=0.5, grime=0.95, bare='#6a655a', rust=0, bare_metal=False),
    key=grimy('key', '#c4b692', .5, 0, wear=0.35, grime=0.85, bare='#bdb293', rust=0, bare_metal=False),
    keyd=grimy('keyd', '#3d3a34', .55, 0, wear=0.45, grime=0.8, bare='#5c574d', rust=0, bare_metal=False),
    keyf=grimy('keyf', '#a4582a', .5, 0, wear=.4, grime=.75, bare='#7a4222', rust=0, bare_metal=False),
    keyr=grimy('keyr', '#9c2a1c', .5, 0, wear=0.36, grime=0.52, bare='#6e2016', rust=0, bare_metal=False),
    rubber=grimy('rubber', '#1b1b1b', .85, 0, wear=0, grime=0.45, rust=0, bare_metal=False),
    hose=grimy('hose', '#2a2b2a', .7, 0, wear=0.36, grime=0.65, bare='#4a4c4a', rust=0.14, bare_metal=False),
    gauge=grimy('gauge', '#d9d2bd', .45, 0, wear=0, grime=0.65, rust=0, bare_metal=False),
    red=grimy('red', '#8f1d15', .5, 0, wear=0.49, grime=0.52),
)
MX = dict(
    glass=plain('glass', '#9fb8b4', .08, 0, alpha=.16),
    screen=plain('crt_screen', '#050806', .2, 0, emit='#39ff88', strength=2.0),
    sign=plain('sign_glow', '#1a0b04', .4, 0, emit='#ff8a2a', strength=6.0),
    strip=plain('led_strip', '#e8eef2', .3, 0, emit='#f2f6ff', strength=5),
    legend_dark=plain('legend_dark', '#2a2118', .6),
    legend_light=plain('legend_light', '#ddd0b3', .55),
    coolant=plain('coolant', '#0a3a40', .1, 0, emit='#2ef2ff', strength=4.0),
    led_r=plain('led_red', '#330000', .3, 0, emit='#ff2a1a', strength=8),
    led_g=plain('led_green', '#003300', .3, 0, emit='#30ff50', strength=8),
    led_a=plain('led_amber', '#331100', .3, 0, emit='#ffaa20', strength=8),
    w_red=plain('wire_red', '#8c1a12', .45), w_yel=plain('wire_yellow', '#b98d12', .45),
    w_blu=plain('wire_blue', '#1d3f8c', .45), w_grn=plain('wire_green', '#1e6b2c', .45),
    w_wht=plain('wire_white', '#c9c4b5', .45), w_blk=plain('wire_black', '#141414', .6),
)


# -------------------------------------------------------------------- mesh
def finish(name, bm, mat, bake=True, smooth=38):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if bake and not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    ob = bpy.data.objects.new(name, me); COL.objects.link(ob)
    me.materials.append(mat)
    me.shade_smooth(); me.set_sharp_from_angle(angle=math.radians(smooth))
    (BAKED[GROUP] if bake else LOOSE).append(ob)
    return ob


def bevel(bm, amt, seg=2, ang=50):
    if amt <= 0:
        return
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(ang)]
    if edges:
        bmesh.ops.bevel(bm, geom=edges, offset=amt, segments=seg, profile=.5, affect='EDGES', clamp_overlap=True)


def box(name, x0, x1, y0, y1, z0, z1, mat, bev=.25, seg=2, mw=None, taper=None, bake=True):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for v in bm.verts:
        top = v.co.z > 0
        v.co.x = x0 if v.co.x < 0 else x1; v.co.y = y0 if v.co.y < 0 else y1; v.co.z = z0 if v.co.z < 0 else z1
        if taper and top:
            v.co.x = cx + (v.co.x - cx) * taper; v.co.y = cy + (v.co.y - cy) * taper
    bevel(bm, min(bev, .45 * min(x1 - x0, y1 - y0, z1 - z0)), seg)
    if mw:
        bm.transform(mw)
    return finish(name, bm, mat, bake)


def cyl(name, r, h, mat, at, axis=(0, 0, 1), seg=20, r2=None, bev=.12, bake=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bevel(bm, min(bev, .3 * r, .3 * h), 1, ang=60)
    rot = Vector((0, 0, 1)).rotation_difference(Vector(axis)).to_matrix().to_4x4()
    bm.transform(Matrix.Translation(Vector(at)) @ rot)
    return finish(name, bm, mat, bake)


def sphere(name, r, at, mat, seg=10, squash=1., bake=True):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg // 2), radius=r)
    bm.transform(Matrix.Translation(Vector(at)) @ Matrix.Diagonal((1, 1, squash, 1)))
    return finish(name, bm, mat, bake)


def poly_prism(name, pts_yz, x0, x1, mat, bev=.2):
    """Extrude a YZ outline along X (side panels, gussets)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in pts_yz]
    b = [bm.verts.new((x1, y, z)) for y, z in pts_yz]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bevel(bm, bev, 2)
    return finish(name, bm, mat)


# ------------------------------------------------------- curves and sweeps
def catmull(ctrl, step=.3):
    P = [Vector(c) for c in ctrl]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int((p2 - p1).length / step))
        for k in range(n):
            t = k / n
            out.append(.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return out


def resample(pts, step):
    out, carry = [pts[0].copy()], 0.
    for a, b in zip(pts, pts[1:]):
        seg = (b - a).length; d = step - carry
        while d <= seg:
            out.append(a.lerp(b, d / seg)); d += step
        carry = seg - (d - step)
    if (out[-1] - pts[-1]).length > step * .3:
        out.append(pts[-1].copy())
    return out


def frames(pts):
    T = []
    for i in range(len(pts)):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        T.append((b - a).normalized())
    up = Vector((0, 0, 1)) if abs(T[0].z) < .9 else Vector((1, 0, 0))
    N = [T[0].cross(up).normalized()]
    for i in range(1, len(pts)):
        N.append((T[i - 1].rotation_difference(T[i]) @ N[-1]).normalized())
    return T, N, [t.cross(n) for t, n in zip(T, N)]


def sweep(name, pts, radius, mat, sides=10, bake=True, cap=True, uscale=.01):
    """Tube along pts. radius: float or per-point list. UV u = arc length * uscale."""
    T, N, B = frames(pts)
    rad = radius if isinstance(radius, list) else [radius] * len(pts)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    rings, s, U = [], 0., []
    for i, p in enumerate(pts):
        if i:
            s += (p - pts[i - 1]).length
        U.append(s * uscale)
        rings.append([bm.verts.new(p + rad[i] * (math.cos(a) * N[i] + math.sin(a) * B[i]))
                      for a in (2 * math.pi * j / sides for j in range(sides))])
    for i in range(len(rings) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            f = bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
            for l, (uu, vv) in zip(f.loops, ((U[i], j / sides), (U[i], (j + 1) / sides), (U[i + 1], (j + 1) / sides), (U[i + 1], j / sides))):
                l[uv].uv = (uu, vv)
    if cap:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(name, bm, mat, bake, smooth=70)


def hose(name, ctrl, r, mat=None, pitch=.7, depth=.13, sides=12):
    """Corrugated hose: the radius ripples along the length."""
    pts = resample(catmull(ctrl), pitch / 6)
    rad, s = [], 0.
    for i, p in enumerate(pts):
        if i:
            s += (p - pts[i - 1]).length
        rad.append(r * (1 + depth * math.cos(2 * math.pi * s / pitch)))
    return sweep(name, pts, rad, mat or M['hose'], sides)


def coil(name, ctrl, coil_r, wire_r, mat, pitch=.32, bake=True):
    """Coiled cord (the payphone kind) wound around a path."""
    path = resample(catmull(ctrl), pitch / 10)
    T, N, B = frames(path)
    s, pts = 0., []
    for i, p in enumerate(path):
        if i:
            s += (p - path[i - 1]).length
        a = 2 * math.pi * s / pitch
        pts.append(p + coil_r * (math.cos(a) * N[i] + math.sin(a) * B[i]))
    return sweep(name, pts, wire_r, mat, 6, bake)


def wire(name, ctrl, r, mat, bake=False):
    return sweep(name, resample(catmull(ctrl), .35), r, mat, 7, bake)


def empty(name, at):
    e = bpy.data.objects.new(name, None); e.location = at; COL.objects.link(e)
    return e


# ================================================================== BOOTH
# plinth and tread
box('plinth', -20, 20, -26, 0, 0, 3.5, M['dsteel'], .6)
box('tread', -18.5, 18.5, -24.5, -1, 3.5, 3.75, M['steel'], .1, 1)
for x in (-17, 17):
    for y in (-23, -3):
        cyl('bolt', .45, .35, M['steel'], (x, y, 3.85), seg=6, bev=.08)
box('kick', -20, 20, -26.4, -26, .5, 3, M['hazard'], .15, 1)

# back plate with ribs and rivets
box('back', -18, 18, -1.6, 0, 3.5, 88, M['paint'], .3)
for z in (21, 71):
    box('rib', -17.5, 17.5, -2.3, -1.6, z, z + 1.3, M['paint2'], .2)
for x in (-16.8, 16.8):
    for z in range(8, 88, 6):
        sphere('rivet', .32, (x, -1.65, z), M['steel'], 8, .55)

# side wings: lower panel, front and rear posts, rails, glass pane, bars
for sgn in (-1, 1):
    x0, x1 = sorted((sgn * 18, sgn * 19.6))
    box('wing_low', x0, x1, -21, 0, 3.5, 34, M['paint'], .25)
    box('wing_front', x0 - .2, x1 + .2, -24.5, -21, 3.5, 88, M['orange'], .4)
    box('wing_rear', x0, x1, -4, 0, 34, 88, M['paint'], .25)
    box('wing_mid', x0 - .1, x1 + .1, -24, 0, 33.5, 36.5, M['paint2'], .3)
    box('wing_top', x0 - .1, x1 + .1, -24, 0, 84.5, 88, M['paint2'], .3)
    box(f'glass_{"l" if sgn < 0 else "r"}', sgn * 18.7 - .12, sgn * 18.7 + .12, -21, -4, 36.5, 84.5, MX['glass'], 0, bake=False)
    for z in (52, 68):
        box('bar', x0 + .3, x1 - .3, -21, -4, z, z + .7, M['dsteel'], .15, 1)
    for z in range(6, 88, 7):
        sphere('rivet', .3, (sgn * 19.8 + (.25 if sgn > 0 else -.25) * 0, -22.8, z), M['steel'], 8, 1)
    # louvre on the lower panel
    for z in range(10, 30, 3):
        box('louvre', min(sgn * 19.6, sgn * 20.2), max(sgn * 19.6, sgn * 20.2), -17, -5, z, z + 1.2, M['paint2'], .2,
            mw=None)

# roof canopy with sign
box('roof', -21, 21, -28, 1, 88, 95, M['paint2'], .5)
box('roof_lip', -21.5, 21.5, -28.6, -27.6, 87.2, 88.4, M['orange'], .3)
box('sign_frame_t', -18, 18, -28.9, -28, 93.6, 94.4, M['steel'], .2)
box('sign_frame_b', -18, 18, -28.9, -28, 88.7, 89.5, M['steel'], .2)
box('sign_frame_l', -18, -17.2, -28.9, -28, 88.7, 94.4, M['steel'], .2)
box('sign_frame_r', 17.2, 18, -28.9, -28, 88.7, 94.4, M['steel'], .2)
# sign face: a flat quad with a clean 0..1 UV for the game's canvas
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
vs = [bm.verts.new(p) for p in ((-17.2, -28.2, 89.5), (17.2, -28.2, 89.5), (17.2, -28.2, 93.6), (-17.2, -28.2, 93.6))]
f = bm.faces.new(vs)
for l, u in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
    l[uvl].uv = u
bm.normal_update()
if f.normal.y > 0:
    f.normal_flip()
finish('sign_glow', bm, MX['sign'], bake=False)
# roof vent and caged lamp
VY = (-24, -13) if COMPACT else (-19, -6)
box('vent', -9, 9, VY[0], VY[1], 95, 97.5, M['dsteel'], .3)
for x in range(-8, 9, 2):
    box('vent_slat', x - .3, x + .3, VY[0] - .4, VY[1] + .4, 97.5, 98.3, M['steel'], .1, 1)
# interior light strip under the roof (the game adds a faint white light here)
box('strip_housing', -11.5, 11.5, -21, -18.2, 87.3, 88, M['dsteel'], .15, 1)
box('led_strip', -11, 11, -20.4, -18.8, 86.9, 87.3, MX['strip'], 0, bake=False)
cyl('lamp_base', 1.6, 1.2, M['dsteel'], (14, -22, 86.8))
sphere('lamp_bulb', 1.1, (14, -22, 85.2), MX['led_a'], 12, bake=False).name = 'led_lamp'
for a in range(0, 360, 60):
    r = math.radians(a)
    box('cage', 14 + 1.5 * math.cos(r) - .1, 14 + 1.5 * math.cos(r) + .1, -22 + 1.5 * math.sin(r) - .1, -22 + 1.5 * math.sin(r) + .1, 83.4, 86.3, M['steel'], 0)
cyl('cage_ring', 1.6, .25, M['steel'], (14, -22, 83.5), seg=16, bev=0)

# ------------------------------------------------------------ CRT terminal
# An all-in-one retro terminal (think PET / VT-series): a moulded housing
# with a sloped keyboard deck in front and a hooded CRT rising behind it,
# sitting on the lower cabinet like the phone unit of a payphone.
GROUP = 'term'


def prism_bm(pts_yz, x0, x1):
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in pts_yz]
    b = [bm.verts.new((x1, y, z)) for y, z in pts_yz]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(len(a)):
        j = (i + 1) % len(a)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def rrect(w, h, r, n=4):
    """Rounded rectangle outline (CCW), w×h centred on 0, n points per corner."""
    r = min(r, w / 2 - 1e-3, h / 2 - 1e-3)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(n):
            a = math.radians(a0 + 90 * k / (n - 1))
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def loft_bm(rings, bm=None, caps=True):
    """Faces between rings of equal length (Vectors); ends capped."""
    bm = bm or bmesh.new()
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(vs[0][::-1]); bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def solid(name, bm, mat, cut=None, cut_mat=None, bw=.5, seg=3, ang=30):
    """A mesh with an optional boolean cut, then rounded edges (bevel modifier), applied."""
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); COL.objects.link(ob)
    co = None
    if cut is not None:
        cm = bpy.data.meshes.new(name + '_cut'); cut.to_mesh(cm); cut.free(); cm.materials.append(cut_mat or mat)
        co = bpy.data.objects.new(name + '_cut', cm); COL.objects.link(co); co.hide_render = True
        bo = ob.modifiers.new('cut', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = co; bo.solver = 'EXACT'
        bo.material_mode = 'TRANSFER'
    if bw > 0:
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bw; bv.segments = seg; bv.limit_method = 'ANGLE'
        bv.angle_limit = math.radians(ang); bv.profile = .5
    bpy.context.view_layer.update()
    nm = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.modifiers.clear(); old = ob.data; ob.data = nm; nm.name = name; bpy.data.meshes.remove(old)
    if co:
        cm = co.data; bpy.data.objects.remove(co); bpy.data.meshes.remove(cm)
    if not nm.uv_layers:
        nm.uv_layers.new(name='UVMap')
    nm.shade_smooth(); nm.set_sharp_from_angle(angle=math.radians(40))
    BAKED[GROUP].append(ob)
    return ob


def text_mesh(body, size, font_align=('CENTER', 'CENTER')):
    cu = bpy.data.curves.new('txt', 'FONT'); cu.body = body; cu.size = size
    cu.align_x, cu.align_y = font_align; cu.resolution_u = 3
    ob = bpy.data.objects.new('txt', cu); COL.objects.link(ob); bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    return me


LEGENDS = {'dark': bmesh.new(), 'light': bmesh.new()}


def add_legend(kind, body, size, mw):
    me = text_mesh(body, size); me.transform(mw)
    LEGENDS[kind].from_mesh(me); bpy.data.meshes.remove(me)


# --- the housing: keyboard base (deck) and monitor, as side profiles
BASE_W, MON_W = 13.4, 12.9
deck0, deck1 = Vector((0, -27.2, 38.2)), Vector((0, -14.4, 41.0))     # deck surface, front → back
DA = (deck1 - deck0).normalized()                                      # along the deck, toward the back
DN = Vector((0, -DA.z, DA.y)) if DA.y > 0 else Vector((0, DA.z, -DA.y))
if DN.z < 0:
    DN = -DN


def deck(x, a, h):
    return Vector((x, 0, 0)) + deck0 + DA * a + DN * h


# keyboard well and a speaker grille cut into the deck
cut = bmesh.new()
WELL = dict(x=8.9, a0=1.35, a1=7.95)
wring = lambda inset, h: [deck(x, (WELL['a0'] + WELL['a1']) / 2 + y, h) for x, y in rrect(2 * WELL['x'] - 2 * inset, WELL['a1'] - WELL['a0'] - 2 * inset, .55 - inset)]
loft_bm([wring(-.12, 1.2), wring(-.12, 0), wring(0, -.18), wring(.05, -.5)], cut)
for i in range(6):
    xx = -9.6 + i * .9
    loft_bm([[deck(xx + x, 10.9 + y, h) for x, y in rrect(.34, 2.2, .16)] for h in (1, -.35)], cut)
base_pts = [(-1.8, 36.5), (deck0.y - .1, 36.5), (deck0.y - .1, deck0.z - .05), (deck1.y, deck1.z), (-1.8, deck1.z)]
solid('term_base', prism_bm(base_pts, -BASE_W, BASE_W), M['crt'], cut, M['kbd'], bw=.45, seg=3, ang=30)

# monitor: hooded top, face tilted back, deep rounded shell
P0, P1 = Vector((0, -14.3, 41.2)), Vector((0, -12.7, 62.3))          # screen face, bottom → top
FU = (P1 - P0).normalized()                                           # up along the face
FN = Vector((0, -FU.z, FU.y))                                         # out of the face (toward the viewer)
if FN.y > 0:
    FN = -FN
FACE_LEN = (P1 - P0).length
SCR_W, SCR_H, SCR_U = 17.6, 13.0, 12.1                                # screen size, centre along the face
FC = P0 + FU * SCR_U


def face(x, u, n):
    return Vector((x, 0, 0)) + FC + FU * u + FN * n


mon_pts = [(-1.8, deck1.z - .3), (P0.y, P0.z - .3), (P1.y, P1.z), (P1.y - 1.3, P1.z + 1.1), (P1.y - 1.1, 65.3),
           (-2.9, 65.7), (-1.8, 64.9)]
cut = bmesh.new()
# screen recess: a chamfered, rounded opening down into the housing
ring = lambda w, h, r, n: [face(x, y, n) for x, y in rrect(w, h, r, 5)]
loft_bm([ring(SCR_W + 2.8, SCR_H + 2.8, 2.4, 1.2), ring(SCR_W + 2.8, SCR_H + 2.8, 2.4, 0),
         ring(SCR_W + .5, SCR_H + .5, 1.5, -1.7), ring(SCR_W + .5, SCR_H + .5, 1.5, -4)], cut)
# vent slots on the hood and both sides
for i in range(9):
    y = -4.6 - i * .95
    loft_bm([[Vector((x, y + yy, z)) for x, yy in rrect(9.5, .38, .18)] for z in (67, 65.0)], cut)
for sx in (-1, 1):
    for i in range(7):
        z = 49.5 + i * 1.5
        loft_bm([[Vector((sx * xx, -5.8 + y, z + zz)) for y, zz in rrect(4.6, .42, .2)] for xx in (MON_W + 1, MON_W - .35)], cut)
solid('term_monitor', prism_bm(mon_pts, -MON_W, MON_W), M['crt'], cut, M['bezel'], bw=.75, seg=4, ang=28)

# CRT glass: bulged, 0..1 UV (u right, v up), sitting just behind the inner lip
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
GX, GZ = 32, 24
SW, SH = SCR_W + .5, SCR_H + .5
grid = [[bm.verts.new(face(-SW / 2 + SW * i / GX, -SH / 2 + SH * j / GZ,
                           -1.95 + .75 * (1 - (2 * i / GX - 1) ** 2) * (1 - (2 * j / GZ - 1) ** 2)))
         for i in range(GX + 1)] for j in range(GZ + 1)]
for j in range(GZ):
    for i in range(GX):
        f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        for l, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
            l[uvl].uv = (a / GX, b / GZ)
bm.normal_update(); bm.faces.ensure_lookup_table()
if bm.faces[0].normal.dot(FN) < 0:
    for f in bm.faces:
        f.normal_flip()
finish('crt_screen', bm, MX['screen'], bake=False, smooth=89)


def on_face(x, u, n=0.):
    """Matrix placing a local object (its +Z out of the face) on the monitor face."""
    return Matrix.Translation(face(x, u, n)) @ Matrix(((1, 0, 0, 0), (0, FU.y, FN.y, 0), (0, FU.z, FN.z, 0), (0, 0, 0, 1)))


# chin: nameplate with raised lettering, knobs, rocker switch, power LED
CHIN = -SCR_H / 2 - 1.4 - 2.4
box('nameplate', -5.2, 5.2, -.9, .9, -.02, .14, M['brass'], .08, 1, mw=on_face(-4.2, CHIN))
add_legend('dark', 'MelonTerm 2.7', .95, on_face(-4.2, CHIN, .15))
for i, x in enumerate((4.6, 6.6)):
    cyl('knob', .62, .9, M['keyd'], (0, 0, 0), seg=24).data.transform(on_face(x, CHIN, .45))
    cyl('knob_cap', .35, .12, M['steel'], (0, 0, 0), seg=16, bev=0).data.transform(on_face(x, CHIN, .95))
box('rocker_well', -.6, .6, -.85, .85, -.1, .2, M['keyd'], .1, 1, mw=on_face(9.2, CHIN))
box('rocker', -.45, .45, -.7, .7, 0, .35, M['keyr'], .12, 1, mw=on_face(9.2, CHIN, .15) @ Matrix.Rotation(math.radians(-10), 4, 'X'))
sphere('led_power', .26, face(8.0 - 6.2, CHIN + .1, .1), MX['led_g'], 8, bake=False).name = 'led_power'
# side port for the junction box wires, glands on the hood for the hoses
cyl('port', .95, 1.1, M['steel'], (MON_W + .3, -11, 47), axis=(1, 0, 0), seg=14)
cyl('gland', .85, 1.2, M['brass'], (7.5, -6.6, 65.8), seg=14)
cyl('gland', .85, 1.2, M['brass'], (-7.5, -6.6, 65.8), seg=14)
cyl('gland', .7, 1.0, M['brass'], (-MON_W - .3, -4.6, 48), axis=(1, 0, 0), seg=12)
# brackets under the front of the deck, down to the cabinet
for x in (-10.5, 10.5):
    poly_prism('deck_bracket', [(-14, 36.5), (deck0.y + 2, 36.5), (-14, 29)], x - .45, x + .45, M['dsteel'], .15)

# --- keyboard: sculpted, dished keycaps in the well, with legends
KP = .9                                    # key pitch (inches)
ROWTILT = [9, 5, 1.5, -2, -5.5, -7]        # sculpted row profile, degrees (back rows tip toward the user)
ROWLIFT = [.1, .04, 0, 0, .03, .02]


def keycap(x, a, w_units, kind, label, row):
    W, D = w_units * KP - .1, KP - .1
    H = .48 + ROWLIFT[row]
    tilt = math.radians(ROWTILT[row])
    lift = lambda yy: yy * math.tan(tilt)
    dish = .035 if w_units < 4 else .012
    rings = []
    for (dw, dd, r, h, tilted) in ((0, 0, .07, 0, False), (.04, .04, .08, .05, False), (.2, .22, .13, H - .07, True), (.27, .29, .11, H, True)):
        rings.append([Vector((xx, yy, h + (lift(yy) if tilted else 0))) for xx, yy in rrect(W - dw, D - dd, r)])
    top = rrect(W - .27, D - .29, .11)
    rings.append([Vector((xx * .55, yy * .55, H - dish * .7 + lift(yy * .55))) for xx, yy in top])
    bm = loft_bm(rings, caps=False)
    c = bm.verts.new((0, 0, H - dish)); last = bm.verts[-len(top) - 1:-1]
    bm.verts.ensure_lookup_table()
    ring_v = [bm.verts[i] for i in range(len(bm.verts) - 1 - len(top), len(bm.verts) - 1)]
    for i in range(len(ring_v)):
        bm.faces.new((ring_v[i], ring_v[(i + 1) % len(ring_v)], c))
    bottom = [bm.verts[i] for i in range(len(top))]
    bm.faces.new(bottom[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mw = Matrix.Translation(deck(x, a, -.45)) @ Matrix(((1, 0, 0, 0), (0, DA.y, DN.y, 0), (0, DA.z, DN.z, 0), (0, 0, 0, 1)))
    bm.transform(mw)
    mat = {'a': M['key'], 'm': M['keyd'], 'f': M['keyf']}[kind]
    finish('key', bm, mat, smooth=50)
    if label:
        size = .27 if len(label) == 1 else (.15 if len(label) <= 3 else .12)
        lm = mw @ Matrix.Translation((0, 0, H - dish * .5 + .004)) @ Matrix.Rotation(tilt, 4, 'X')
        add_legend('dark' if kind == 'a' else 'light', label, size, lm)


ALPHA = lambda s: [(c, 1, 'a') for c in s]
rows = [
    [('ESC', 1.25, 'm'), ('', .35, None)] + [(f'F{i}', 1, 'f') for i in range(1, 5)] + [('', .35, None)] + [(f'F{i}', 1, 'f') for i in range(5, 9)] + [('', .35, None), ('BRK', 1.25, 'm'), ('CLR', 1.25, 'm')],
    ALPHA('`1234567890-=') + [('DEL', 1.5, 'm')],
    [('TAB', 1.5, 'm')] + ALPHA('QWERTYUIOP[]\\'),
    [('CTRL', 1.75, 'm')] + ALPHA("ASDFGHJKL;'") + [('RETURN', 1.75, 'm')],
    [('SHIFT', 2.25, 'm')] + ALPHA('ZXCVBNM,./') + [('SHIFT', 2.25, 'm')],
    [('', 3.0, None), ('', 8, 'a'), ('', 3.5, None)],
]
pad = [['PF1', 'PF2', 'PF3', 'PF4'], ['7', '8', '9', '-'], ['4', '5', '6', ','], ['1', '2', '3', 'ENT'], [('0', 2), '.', '+']]
MAIN_W, PAD_GAP = 14.5, .6
total = (MAIN_W + PAD_GAP + 4) * KP
x0 = -total / 2
missing = {(2, 6), (4, 9)}              # a couple of caps long gone
for r, row in enumerate(rows):
    a = WELL['a1'] - .55 - r * KP
    w = sum(u for _, u, _ in row) * KP
    x = x0 + (MAIN_W * KP - w) / 2
    for c, (label, u, kind) in enumerate(row):
        if kind and (r, c) not in missing:
            keycap(x + u * KP / 2, a, u, kind, label, r)
        x += u * KP
    x = x0 + (MAIN_W + PAD_GAP) * KP
    for item in pad[r] if r < len(pad) else []:
        label, u = (item, 1) if isinstance(item, str) else item
        keycap(x + u * KP / 2, a, u, 'm' if label in ('ENT', '+', '-', ',') or label.startswith('PF') else 'a', label, r)
        x += u * KP
# status lights on the deck behind the keys
for i, m in enumerate((MX['led_g'], MX['led_a'], MX['led_r'])):
    sphere(f'led_kb{i}', .17, deck(5.4 + i * .85, 9.6, .06), m, 6, bake=False)
    cyl('led_bezel', .28, .12, M['steel'], (0, 0, 0), seg=10, bev=0).data.transform(
        Matrix.Translation(deck(5.4 + i * .85, 9.6, 0)) @ Matrix(((1, 0, 0, 0), (0, DA.y, DN.y, 0), (0, DA.z, DN.z, 0), (0, 0, 0, 1))))
finish('key_legends_dark', LEGENDS['dark'], MX['legend_dark'], bake=False, smooth=10)
finish('key_legends_light', LEGENDS['light'], MX['legend_light'], bake=False, smooth=10)

# -------------------------------------------------------------- handset
GROUP = 'front'
box('hook', -18, -16.4, -15, -12, 62, 66.5, M['dsteel'], .25)
cyl('handset', .95, 7.5, M['rubber'], (-15.6, -13.5, 63.2), seg=14)
for z in (59.6, 66.8):
    cyl('cup', 1.45, 1.3, M['rubber'], (-15.2, -13.5, z), axis=(1, 0, 0), seg=16)
coil('handset_cord', [(-15.6, -13.5, 59), (-15.3, -15, 52), (-16.4, -12, 44.5), (-17.9, -10, 40)], .55, .16, M['dsteel'], pitch=.45)

# ----------------------------------------------------------- lower cabinet
box('cab', -13, 13, -14, -1.6, 3.75, 36.5, M['paint'], .5)
box('cab_door', -12, 12, -14.5, -13.8, 8, 35.4, M['paint2'], .3)
box('cab_hazard', -13.1, 13.1, -14.35, -13.9, 4, 7.6, M['hazard'], .15, 1)
for i in range(8):
    z = 27.5 + i * .95
    box('slat', -10, -1, -14.9, -14.4, z, z + .45, M['dsteel'], .12, 1)
cyl('gauge_rim', 2.4, .9, M['brass'], (6.5, -14.8, 28.5), axis=(0, 1, 0), seg=24)
cyl('gauge_face', 2.0, .2, M['gauge'], (6.5, -15.25, 28.5), axis=(0, 1, 0), seg=24, bev=0)
box('needle', -.08, .08, -.1, .1, 0, 1.6, M['red'], 0, mw=Matrix.Translation((6.5, -15.45, 28.5)) @ Matrix.Rotation(math.radians(-38), 4, 'Y'))
box('gauge_glass', 6.5 - 2, 6.5 + 2, -15.62, -15.55, 26.5, 30.5, MX['glass'], 0, bake=False)
for i, x in enumerate((-8, -5, -2)):
    box('sw_plate', x - 1, x + 1, -14.9, -14.4, 18, 22, M['steel'], .15, 1)
    lever = Matrix.Translation((x, -15, 20)) @ Matrix.Rotation(math.radians(25 if i != 1 else -25), 4, 'X')
    box('sw_lever', -.2, .2, -.2, .2, 0, 2, M['steel'], .1, 1, mw=lever, taper=.7)
    sphere(f'led_sw{i}', .22, (x, -14.6, 23), (MX['led_g'], MX['led_r'], MX['led_g'])[i], 6, bake=False)
box('card_slot', 2, 9, -14.9, -14.4, 18.5, 21.5, M['dsteel'], .3)
box('card_gap', 2.8, 8.2, -15, -14.8, 19.7, 20.2, M['rubber'], .05, 1)
box('flap', -3, 3, -14.8, -14.3, 10, 13.5, M['steel'], .3)
box('label', 2.5, 9, -14.6, -14.5, 11, 14, M['gauge'], .05, 1)
for x in (-11.5, 11.5):
    for z in (9.2, 34.2):
        cyl('screw', .35, .3, M['steel'], (x, -14.6, z), axis=(0, 1, 0), seg=8, bev=.05)

# ------------------------------------------- conduits along the back wall
GROUP = 'shell'
for x in (-15.2, 15.2):
    if COMPACT:   # up into the roof
        sweep('conduit', resample([Vector((x, -3.2, 3.75)), Vector((x, -3.2, 88.5))], 1.0), 1.0, M['steel'], 14)
    else:
        sweep('conduit', resample(catmull([(x, -3.2, 3.75), (x, -3.2, 60), (x, -3.2, 120), (x, -2.4, 128), (x, -.2, 130)], .8), 1.0), 1.0, M['steel'], 14)
    for z in (12, 30, 50, 80) if COMPACT else (12, 30, 50, 80, 104, 122):
        box('clamp', x - 1.4, x + 1.4, -4.6, -1.6, z, z + 1.2, M['dsteel'], .25)
    if not COMPACT:
        cyl('coupler', 1.3, 2.2, M['brass'], (x, -3.2, 97.5), seg=16)
# junction box on the right conduit
GROUP = 'front'
box('jbox', 11.5, 17.6, -7.8, -1.6, 66, 76, M['orange'], .45)
box('jbox_lid', 11.9, 17.2, -8.2, -7.6, 66.4, 75.6, M['paint2'], .25)
sphere('led_jbox', .3, (16.3, -8.35, 74.6), MX['led_r'], 8, bake=False).name = 'led_jbox'
for z in (67.5, 70, 72.5):
    cyl('jbox_gland', .5, .8, M['brass'], (11.2, -5, z), axis=(1, 0, 0), seg=10)

# --------------------------------------------------- corrugated hoses
GROUP = 'shell'
hose('hose_r', [(7.5, -6.6, 66.2), (8.5, -8, 70), (12, -12, 80), (14.5, -14, 87.9)], 1.25)
hose('hose_l', [(-7.5, -6.6, 66.2), (-8.5, -8.5, 71), (-12, -13, 79), (-14.5, -15, 87.9)], 1.25)
hose('hose_back', [(0, -3.2, 65.4), (1, -2.8, 71), (3, -2.8, 78), (10, -2.8, 83), (15.2, -3.2, 88)], .9)
# outside: off the roof and down to the floor, snaking out along it
hose('hose_out_r', [(21, -12, 91.5), (24.5, -12, 90), (26.5, -13, 70), (26, -16, 30), (25.5, -18, 4), (27, -22, 1.2), (32, -30, 1.3), (36, -38, 1.3)], 1.5)
hose('hose_out_l', [(-21, -6, 92), (-24, -6, 91), (-25.5, -7, 60), (-25, -9, 20), (-26, -12, 2.5), (-30, -12, 1.4), (-34, -5, 1.4), (-36, -.5, 2)], 1.2)
cyl('hose_cuff', 1.9, 2, M['brass'], (22, -12, 91.5), axis=(1, 0, 0), seg=16)
cyl('hose_cuff', 1.6, 2, M['brass'], (-22, -6, 92), axis=(1, 0, 0), seg=16)

# ------------------------------------------------ coolant tubes (glass)
for i, y in enumerate((-8.5, -14.5)):
    x = 22.6
    cyl(f'glass_tube{i}', 1.6, 34, MX['glass'], (x, y, 58), seg=18, bev=0, bake=False)
    c = cyl(f'coolant_{i}', 1.15, 33.6, MX['coolant'], (x, y, 58), seg=14, bev=0, bake=False)
    for z in (40.2, 75.8):
        cyl('tube_cap', 2.1, 1.8, M['brass'], (x, y, z), seg=18)
        box('tube_arm', 19.6, x - 1.5, y - .6, y + .6, z - .5, z + .5, M['dsteel'], .15)
    cyl('tube_valve', .6, 2.6, M['copper'], (x, y, 78), seg=10)
# coolant UVs: v along height so the game can scroll the flow
for ob in LOOSE:
    if ob.name.startswith('coolant_'):
        me = ob.data; uvl = me.uv_layers.new(name='UVMap')
        zs = [v.co.z for v in me.vertices]; z0, z1 = min(zs), max(zs)
        cx = sum(v.co.x for v in me.vertices) / len(me.vertices); cy = sum(v.co.y for v in me.vertices) / len(me.vertices)
        for poly in me.polygons:
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uvl.data[li].uv = (.5 + math.atan2(co.y - cy, co.x - cx) / (2 * math.pi), (co.z - z0) / (z1 - z0))

# ---------------------------------------------------------- live wiring
WM = [MX['w_red'], MX['w_yel'], MX['w_blu'], MX['w_grn'], MX['w_wht']]
# cabinet → terminal, looping forward under the shelf
for i, m in enumerate(WM):
    dy = -7 - i * .9
    wire(f'wire_cab{i}', [(-13, dy, 29 + i * .6), (-15.8, dy - 1, 27.5 + i), (-16.6 - i * .15, dy - 1.5, 36),
                         (-15.4, dy - 1, 38.6), (-13.3, dy - .5, 39.2)], .2, m)
# junction box → terminal side port, drooping
for i, m in enumerate(WM[:4]):
    wire(f'wire_jb{i}', [(11.2, -5, 67.5 + i * .5 if i < 3 else 70), (13.9, -9 - i * .4, 60 - i), (14.2, -11.5 - i * .2, 52), (13.4, -11, 47.3)], .19, m)
# severed ends hanging from under the roof, sparking
for i, (x, m) in enumerate(((-5, MX['w_red']), (-3.8, MX['w_yel']), (4.5, MX['w_blu']))):
    L = 7 + i * 1.6
    wire(f'wire_cut{i}', [(x, -20, 88), (x + .4, -21, 85), (x + .2 * i, -21.6 - .3 * i, 88 - L)], .17, m)
    empty(f'spark_{i}', (x + .2 * i, -21.6 - .3 * i, 88 - L - .2))
# sagging cable runs strung between the conduits above the roof, and down the left side
for i, (z, sag, m) in enumerate(() if COMPACT else ((112, 7, MX['w_blk']), (116, 9, MX['w_blk']), (120, 5.5, MX['w_red']), (109, 11, MX['w_blk']))):
    wire(f'wire_span{i}', [(-14.2, -2.4 - i * .5, z), (-7, -4 - i * .6, z - sag * .8), (0, -4.5 - i * .6, z - sag), (7, -4 - i * .6, z - sag * .8), (14.2, -2.4 - i * .5, z)], .28 if m is MX['w_blk'] else .2, m)
for i, z in enumerate(() if COMPACT else (103, 118)):
    box('tie', -15.9, -14.5, -4.8, -1.6, z, z + .8, M['brass'], .1, 1)
for i, (m, dz) in enumerate(((MX['w_blk'], 0), (MX['w_yel'], 1.2), (MX['w_blk'], 2.4))):
    wire(f'wire_side{i}', [(-19.7, -3 - i, 86 - dz), (-21.5, -5 - i, 70), (-21.2, -6 - i, 45), (-21.8, -4 - i, 20), (-22.5, -1.2, 8 + dz)], .3 if m is MX['w_blk'] else .2, m)
hose('hose_jb', [(17.6, -5, 67), (19.8, -6, 60), (20.2, -8, 45), (19.8, -10, 36)], .7, pitch=.5)
# a bundle of black power cable from the terminal back into the wall
for i in range(3):
    wire(f'wire_pwr{i}', [(-MON_W - .6, -4.6 + i * .3, 48), (-15.2 - i * .3, -4 + i * .5, 45), (-16 - i * .3, -2.6, 38), (-15.8, -1.9, 30 - i * 2)], .3, MX['w_blk'])


# ================================================================== BAKE
def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    return ob


def setup_cycles(samples):
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'CUDA'; prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'CUDA'
        scene.cycles.device = 'GPU'
    except Exception as e:
        print('GPU unavailable, using CPU:', e)
    scene.cycles.samples = samples


parts = {}
for gname, objs in BAKED.items():
    if not objs:
        continue
    ob = join(objs, 'booth_' + gname)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=.003, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=.003, rotate=True, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts[gname] = ob
    print(gname, 'tris', sum(len(p.vertices) - 2 for p in ob.data.polygons))

world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.light_settings.distance = 4.0
ORM_TEX = TEX // 2
texnodes = {}


def bake_part(gname, ob):
    """Bake one group into its own base colour, normal and packed ORM maps,
    then give the joined mesh a single material using them."""
    imgs = {}
    for k, nc, size in (('col', False, TEX), ('nrm', True, TEX), ('rough', True, ORM_TEX), ('metal', True, ORM_TEX), ('ao', True, ORM_TEX)):
        im = bpy.data.images.new(f'{gname}_{k}', size, size, alpha=False)
        if nc:
            im.colorspace_settings.name = 'Non-Color'
        imgs[k] = im
    mats = list(ob.data.materials)
    for m in mats:
        if m.name not in texnodes:
            texnodes[m.name] = m.node_tree.nodes.new('ShaderNodeTexImage')
        m.node_tree.nodes.active = texnodes[m.name]

    def bake(kind, img, samples, **kw):
        scene.cycles.samples = samples
        for m in mats:
            texnodes[m.name].image = img
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type=kind, margin=12, use_clear=True, **kw)
        print('baked', gname, kind)

    # the diffuse colour bake returns black for metals, so zero metallic first
    mlinks = {}
    for m in mats:
        b = m.node_tree.nodes['Principled BSDF']; lk = b.inputs['Metallic'].links
        if lk:
            mlinks[m.name] = lk[0].from_socket; m.node_tree.links.remove(lk[0])
        b.inputs['Metallic'].default_value = 0
    bake('DIFFUSE', imgs['col'], 128, pass_filter={'COLOR'})
    for m in mats:
        if m.name in mlinks:
            m.node_tree.links.new(mlinks[m.name], m.node_tree.nodes['Principled BSDF'].inputs['Metallic'])
    bake('ROUGHNESS', imgs['rough'], 96)
    bake('NORMAL', imgs['nrm'], 128, normal_space='TANGENT')
    bake('AO', imgs['ao'], 128)
    saved = {}
    for m in mats:
        nt = m.node_tree; out = nt.nodes['Material Output']
        saved[m.name] = out.inputs['Surface'].links[0].from_socket
        em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(METAL[m.name], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    bake('EMIT', imgs['metal'], 8)
    for m in mats:
        m.node_tree.links.new(saved[m.name], m.node_tree.nodes['Material Output'].inputs['Surface'])

    import numpy as np
    px = lambda im: np.array(im.pixels[:], dtype=np.float32).reshape(-1, 4)
    ao, ro, me = px(imgs['ao']), px(imgs['rough']), px(imgs['metal'])
    orm = np.stack([ao[:, 0], ro[:, 0], me[:, 0], np.ones(len(ao), np.float32)], 1)
    im = bpy.data.images.new(f'{gname}_orm', ORM_TEX, ORM_TEX, alpha=False); im.colorspace_settings.name = 'Non-Color'
    im.pixels = orm.ravel(); imgs['orm'] = im
    for k in ('col', 'orm', 'nrm'):
        imgs[k].pack()

    fm = bpy.data.materials.new('booth_' + gname); fm.use_nodes = True
    nt = fm.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = imgs['col']; nt.links.new(tc.outputs['Color'], b.inputs['Base Color'])
    to = nt.nodes.new('ShaderNodeTexImage'); to.image = imgs['orm']
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(to.outputs['Color'], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = imgs['nrm']
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    grp = bpy.data.node_groups.get('glTF Material Output')
    if not grp:
        grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp; nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
    ob.data.materials.clear(); ob.data.materials.append(fm)
    for p in ob.data.polygons:
        p.material_index = 0


if BAKE:
    setup_cycles(128)
    for gname, ob in parts.items():
        bake_part(gname, ob)

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_image_quality=92,
                          export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False)
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


# ================================================================ PREVIEW
if RENDER:
    os.makedirs(RENDER, exist_ok=True)
    setup_cycles(64); scene.cycles.use_denoising = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.02, .022, .025, 1)
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, -60, 0))
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0.05, 100), rotation=(math.pi / 2, 0, 0))
    wall = bpy.context.object; wall.data.materials.append(plain('wallm', '#6b5e50', .9))
    for loc, en, size in (((-60, -90, 140), 90000, 60), ((70, -70, 60), 25000, 50), ((0, -40, 150), 15000, 40)):
        bpy.ops.object.light_add(type='AREA', location=loc); L = bpy.context.object
        L.data.energy = en; L.data.size = size
        L.rotation_euler = (Vector((0, 0, 50)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    views = {'full': ((70, -150, 75), (0, -10, 55), 32, (900, 1200)),
             'terminal': ((22, -52, 64), (0, -14, 48), 40, (1200, 900)),
             'keys': ((6, -38, 52), (0, -16, 40), 35, (1200, 800))}
    for name, (loc, tgt, lens, res) in views.items():
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); COL.objects.link(cam)
        cam.location = loc; cam.data.lens = lens; cam.data.clip_end = 2000
        cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = os.path.join(RENDER, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', name)

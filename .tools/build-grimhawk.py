# The Grimhawk (Black Ops 7's homing flechette rifle), rebuilt from reference images for Melon Zombies.
# Modelled directly in the BO1 M16 viewmodel's gun space (j_gun: x forward, y left, z up, inches), so
# .tools/assemble-grimhawk.mjs can skin each part to the M16's own skeleton and every M16 animation
# (reload, fire, sprint, ADS) drives it. Parts are objects named part_<bone>: part_j_gun (the gun),
# part_tag_clip (the magazine, moved by the reload), part_j_charging_handle.
#   blender -b -P .tools/build-grimhawk.py -- <out.glb> [--render <dir>]
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/grimhawk_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
COL = bpy.context.scene.collection
PARTS = {'j_gun': [], 'tag_clip': [], 'j_charging_handle': []}


def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c] + [1]


def mat(name, base, rough=.5, metal=0., emit=None, strength=0., alpha=1.):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(base)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit); b.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha; m.surface_render_method = 'BLENDED'
    return m


METAL = {}   # baked material -> the socket feeding Metallic (for the metal bake)


def worn(name, base, rough=.5, metal=0., bare='#9a9da2', wear=.6, grain=1., bare_metal=True):
    """A used gun finish for baking: paint/coating worn to bare steel on the edges, light scratches, fine grain,
    grime in the crevices, and rounded edges (bevel normal) so the low-poly shapes read smooth."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links; b = N['Principled BSDF']
    def node(t, **kw):
        n = N.new(t)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def math(op, a, c=0., clamp=False):
        n = node('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, c)):
            (L.new(v, n.inputs[i]) if not isinstance(v, (int, float)) else setattr(n.inputs[i], 'default_value', v))
        return n.outputs[0]
    def mr(v, a, c, lo=0., hi=1.):
        n = node('ShaderNodeMapRange'); L.new(v, n.inputs['Value'])
        n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = a, c
        n.inputs['To Min'].default_value, n.inputs['To Max'].default_value = lo, hi
        return n.outputs['Result']
    def noise(vec, scale, detail=4., r=.55):
        n = node('ShaderNodeTexNoise'); L.new(vec, n.inputs['Vector'])
        n.inputs['Scale'].default_value, n.inputs['Detail'].default_value, n.inputs['Roughness'].default_value = scale, detail, r
        return n.outputs['Fac']
    def mix(f, a, c, rgb=True):
        n = node('ShaderNodeMix', data_type='RGBA' if rgb else 'FLOAT')
        ins = {i.identifier: i for i in n.inputs}; outs = {o.identifier: o for o in n.outputs}
        L.new(f, ins['Factor_Float'])
        for key, v in (('A', a), ('B', c)):
            sk = ins[key + ('_Color' if rgb else '_Float')]
            (L.new(v, sk) if not isinstance(v, (int, float, tuple, list)) else setattr(sk, 'default_value', v))
        return outs['Result_Color' if rgb else 'Result_Float']
    obj = node('ShaderNodeTexCoord').outputs['Object']; geo = node('ShaderNodeNewGeometry')
    # edges: bevel normal against the true normal
    bev = node('ShaderNodeBevel', samples=8); bev.inputs['Radius'].default_value = .06
    dot = node('ShaderNodeVectorMath', operation='DOT_PRODUCT'); L.new(bev.outputs['Normal'], dot.inputs[0]); L.new(geo.outputs['Normal'], dot.inputs[1])
    edge = mr(dot.outputs['Value'], .999, .94)
    chip = mr(noise(obj, 9, 8, .6), .42, .52)
    w = math('MULTIPLY', math('MULTIPLY', edge, chip), wear, clamp=True)
    # scratches: thin stretched lines
    scr = 0.
    for k, sc in enumerate(((6, .25, 6), (.25, 6, 6), (6, 6, .3))):
        mp = node('ShaderNodeMapping'); L.new(obj, mp.inputs['Vector']); mp.inputs['Scale'].default_value = sc
        mp.inputs['Rotation'].default_value = (k * .7, k * 1.3, k * .4)
        line = mr(math('ABSOLUTE', math('SUBTRACT', noise(mp.outputs['Vector'], 14, 2, .3), .5)), .006, 0.)
        scr = line if scr == 0. else math('MAXIMUM', scr, line)
    zone = mr(noise(obj, .8, 3), .5, .65)
    w = math('MAXIMUM', w, math('MULTIPLY', math('MULTIPLY', scr, zone), .7 * wear))
    # grime in crevices, fine grain
    ao = node('ShaderNodeAmbientOcclusion', samples=12); ao.inputs['Distance'].default_value = .6
    grime = mr(ao.outputs['AO'], .95, .45, 0., .55)
    grainv = mr(noise(obj, 60, 3), .3, .7, -.06 * grain, .06 * grain)
    col = srgb(base)
    c = mix(w, col, srgb(bare)); c = mix(grime, c, srgb('#0a0a0b'))
    hsv = node('ShaderNodeHueSaturation'); L.new(c, hsv.inputs['Color']); L.new(math('ADD', grainv, 1.), hsv.inputs['Value'])
    L.new(hsv.outputs['Color'], b.inputs['Base Color'])
    r = math('ADD', mix(w, rough, .3, False), math('MULTIPLY', grainv, 1.5)); r = mix(grime, r, .85, False)
    L.new(r, b.inputs['Roughness'])
    mt = mix(w, metal, 1. if bare_metal else metal, False); L.new(mt, b.inputs['Metallic']); METAL[name] = mt
    # rounded edges + micro surface
    bev2 = node('ShaderNodeBevel', samples=8); bev2.inputs['Radius'].default_value = .09
    bump = node('ShaderNodeBump'); bump.inputs['Strength'].default_value = .25; bump.inputs['Distance'].default_value = .02
    L.new(math('SUBTRACT', math('MULTIPLY', noise(obj, 40, 3), .3), w), bump.inputs['Height']); L.new(bev2.outputs['Normal'], bump.inputs['Normal'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


M = dict(
    silver=worn('gh_silver', '#a9adb2', .3, .8, bare='#c8cbcf', wear=.5),     # the upper receiver's light finish
    dark=worn('gh_dark', '#2c2f33', .48, .4, bare='#7d8187', wear=.75),       # gunmetal lower, handguard, side plate
    poly=worn('gh_polymer', '#1d1e20', .7, 0, bare='#3a3b3e', wear=.35, bare_metal=False),   # grip, stock, magazine
    steel=worn('gh_steel', '#3c3f43', .36, 1, bare='#8e9296', wear=.6),       # barrel, brake, screws, rail teeth
    rubber=worn('gh_rubber', '#141414', .9, 0, bare='#262626', wear=.2, bare_metal=False),
    amber=mat('gh_amber', '#3a2006', .25, 0, '#ffae2e', 2.2),   # the magazine's round-count window
    lens=mat('gh_lens', '#0b1418', .05, .2, '#2fd7ff', .6),
    red=mat('gh_red', '#300404', .3, 0, '#ff2a1a', 3),
    label=worn('gh_label', '#c9ccd0', .45, .2, bare='#e0e2e5', wear=.2),
    glass=mat('gh_glass', '#a9d6e6', .05, 0, alpha=.08),
    dot=mat('gh_dot', '#300000', .3, 0, '#ff2a1a', 12),
)


def finish(name, bm, m, part='j_gun', smooth=35):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    ob = bpy.data.objects.new(name, me); COL.objects.link(ob)
    me.shade_smooth(); me.set_sharp_from_angle(angle=math.radians(smooth))
    PARTS[part].append(ob); return ob


def solid(name, bm, m, part='j_gun', cuts=(), bw=.06, seg=2, ang=30):
    """A mesh with optional boolean cuts (list of bmesh), then rounded edges, applied."""
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    ob = bpy.data.objects.new(name, me); COL.objects.link(ob)
    tmp = []
    for i, c in enumerate(cuts):
        cm = bpy.data.meshes.new(f'{name}_cut{i}'); c.to_mesh(cm); c.free(); cm.materials.append(m)
        co = bpy.data.objects.new(cm.name, cm); COL.objects.link(co); tmp.append(co)
        bo = ob.modifiers.new(f'cut{i}', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = co; bo.solver = 'EXACT'
    if bw > 0:
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bw; bv.segments = seg; bv.limit_method = 'ANGLE'
        bv.angle_limit = math.radians(ang); bv.profile = .5; bv.harden_normals = False
    bpy.context.view_layer.update()
    nm = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.modifiers.clear(); old = ob.data; ob.data = nm; nm.name = name; bpy.data.meshes.remove(old)
    for co in tmp:
        d = co.data; bpy.data.objects.remove(co); bpy.data.meshes.remove(d)
    nm.shade_smooth(); nm.set_sharp_from_angle(angle=math.radians(35))
    PARTS[part].append(ob); return ob


def prism(pts_xz, y0, y1):
    """Extrude an XZ side outline across Y (y0..y1)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts_xz]
    b = [bm.verts.new((x, y1, z)) for x, z in pts_xz]
    bm.faces.new(a); bm.faces.new(b[::-1])
    for i in range(len(a)):
        j = (i + 1) % len(a); bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def fillet(pts, r, n=4):
    """Round every corner of an XZ outline (a quadratic curve through each corner, up to r along each edge)."""
    out, N = [], len(pts)
    for i in range(N):
        p, a, b = Vector(pts[i]), Vector(pts[i - 1]), Vector(pts[(i + 1) % N])
        da, db = min(r, (a - p).length * .45), min(r, (b - p).length * .45)
        p0, p2 = p + (a - p).normalized() * da, p + (b - p).normalized() * db
        for k in range(n + 1):
            t = k / n; q = p0 * (1 - t) ** 2 + p * 2 * t * (1 - t) + p2 * t * t
            out.append((q.x, q.y))
    return out


def boxbm(x0, x1, y0, y1, z0, z1):
    return prism([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1)


def cylbm(r, x0, x1, z, y=0., seg=24, r2=None, axis='x'):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=x1 - x0)
    if axis == 'x':
        bm.transform(Matrix.Translation(((x0 + x1) / 2, y, z)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
    elif axis == 'y':
        bm.transform(Matrix.Translation((x0, (y), z)) @ Matrix.Rotation(math.radians(90), 4, 'X'))
    return bm


def screw(x, y, z, r=.1, depth=.06, seg=12):
    """A short cylinder sticking out of a side face (y), centred at x, z."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(90), 4, 'X'))
    return bm


def oval(cx, cz, w, h, ang, y0=-2, y1=2, n=16):
    """A slanted oval prism through the part across Y (for vents)."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n; x, z = w / 2 * math.cos(a), h / 2 * math.sin(a)
        c, s = math.cos(ang), math.sin(ang); pts.append((cx + x * c - z * s, cz + x * s + z * c))
    return prism(pts, y0, y1)


def rrect_xz(x0, x1, z0, z1, r, n=4):
    pts = []
    for cx, cz, a0 in ((x1 - r, z1 - r, 0), (x0 + r, z1 - r, 90), (x0 + r, z0 + r, 180), (x1 - r, z0 + r, 270)):
        for k in range(n):
            a = math.radians(a0 + 90 * k / (n - 1)); pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def text(body, size, at, rot_z=0., part='j_gun', m=None, extrude=.01, side=1):
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('t_' + body[:8], cu); COL.objects.link(ob)
    # on the gun's right (-y) or left (+y) side, reading front-to-back as seen from that side
    ob.rotation_euler = (math.radians(90), 0, math.radians(180) if side > 0 else 0); ob.location = at
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.transform(ob.matrix_world); bpy.data.objects.remove(ob)
    o2 = bpy.data.objects.new('txt', me); COL.objects.link(o2); me.materials.append(m or M['label'])
    PARTS[part].append(o2); return o2


Y = .78     # half-width of the upper receiver

# ---- upper receiver (the light finish): a long slab with a chamfered top and a pointed rear fairing
upper = prism(fillet([(-4.6, 1.55), (12.6, 1.55), (12.6, 3.25), (12.2, 3.55), (-2.6, 3.55), (-4.6, 2.6)], 0.35), -Y, Y)
cuts = []
for x0, x1, z in ((6.6, 8.2, 3.12), (8.9, 10.5, 3.12), (10.9, 11.9, 2.15), (-1.8, 1.0, 2.0)):
    cuts.append(boxbm(x0, x1, Y - .05, Y + .2, z - .13, z + .13))       # recessed slots, left side
    cuts.append(boxbm(x0, x1, -Y - .2, -Y + .05, z - .13, z + .13))     # and right
solid('upper', upper, M['silver'], cuts=cuts, bw=.16, seg=4)
# the dark side plate over the receiver, slightly proud, with the FLECHETTE marking
for s in (1, -1):
    plate = prism([(0.2, 1.62), (8.6, 1.62), (8.9, 2.1), (8.6, 2.95), (0.6, 2.95), (0.2, 2.6)], s * Y - .03 * (s < 0), s * Y + .05 * (s > 0) - .05 * (s < 0) + .0)
    solid(f'plate{s}', plate, M['dark'], bw=.07, seg=3)
for s in (1, -1):
    text('FLECHETTE F28', .34, (4.4, s * (Y + .06), 2.42), side=s)
    text('PRISMATECH', .2, (9.6, s * (Y + .01), 3.35), side=s, m=M['dark'])
# vents along the top of the side plate
for i in range(4):
    solid(f'vent{i}', boxbm(4.6 + i * .32, 4.8 + i * .32, -Y - .07, Y + .07, 2.82, 2.92), M['steel'], bw=0)

# ---- lower receiver, magwell, trigger guard
lower = prism(fillet([(-4.4, 0.25), (2.55, 0.25), (2.55, 1.6), (-4.4, 1.6)], 0.25), -.68, .68)
solid('lower', lower, M['dark'], bw=.14, seg=3)
solid('magwell', prism(fillet([(2.45, 0.3), (6.85, 0.3), (7.0, 1.6), (2.45, 1.6)], 0.2), -.8, .8), M['dark'], bw=.06)
guard = prism([(-0.9, 0.25), (2.3, 0.25), (2.3, -0.65), (1.9, -0.95), (-0.5, -0.95), (-0.9, -0.55)], -.3, .3)
inner = prism([(-0.55, 0.3), (2.0, 0.3), (2.0, -0.6), (1.75, -0.72), (-0.35, -0.72), (-0.55, -0.45)], -1, 1)
solid('guard', guard, M['poly'], cuts=[inner], bw=.05)
solid('trigger', prism([(0.55, 0.25), (0.85, 0.25), (0.75, -0.45), (0.45, -0.55)], -.12, .12), M['steel'], bw=.03)
# selector, mag release and screws
for s in (1, -1):
    solid(f'sel{s}', cylbm(.22, 0, .12, 1.05, y=s * .7, axis='y'), M['steel'], bw=.02)
    solid(f'rel{s}', boxbm(2.0, 2.45, s * .68 - .06, s * .68 + .06, 0.8, 1.15), M['red'], bw=.02)
    for x, z in ((-3.6, 1.0), (-2.2, 1.3), (1.6, 1.3), (5.8, 1.35), (-1.0, 3.2), (11.4, 1.8)):
        solid(f'scr{s}{x}', screw(x, s * (Y + .02), z), M['steel'], bw=0)

# ---- pistol grip (raked back, finger grooves) and the skeletal stock
grip = prism(fillet([(-0.6, 0.3), (-2.55, 0.3), (-3.55, -3.7), (-3.2, -4.15), (-1.85, -4.2), (-1.55, -3.8), (-0.85, -0.55)], 0.35), -.6, .6)
gcuts = [boxbm(-3.8, -0.4, -.7, -.55, z - .07, z + .07) for z in (-1.2, -1.8, -2.4, -3.0)] + \
        [boxbm(-3.8, -0.4, .55, .7, z - .07, z + .07) for z in (-1.2, -1.8, -2.4, -3.0)]
solid('grip', grip, M['poly'], cuts=gcuts, bw=.22, seg=4)
solid('tube', cylbm(.62, -10.4, -4.4, 2.45, seg=20), M['dark'], bw=.05)
stock_top = prism(fillet([(-4.4, 2.0), (-4.4, 3.35), (-9.0, 3.6), (-14.2, 3.5), (-14.6, 3.0), (-14.2, 2.4), (-9.4, 2.55)], 0.4), -.62, .62)
solid('stock_top', stock_top, M['poly'], bw=.2, seg=4)
butt = prism(fillet([(-13.3, 3.4), (-14.7, 3.4), (-14.9, -2.3), (-14.0, -2.6), (-13.3, -2.0)], 0.3), -.7, .7)
bcut = [oval(-14.05, z, .5, 1.1, 0, -1, 1) for z in (1.6, -0.3)]
solid('butt', butt, M['poly'], cuts=bcut, bw=.2, seg=4)
solid('pad', prism(fillet([(-14.7, 3.45), (-15.1, 3.45), (-15.25, -2.55), (-14.9, -2.7)], 0.25), -.74, .74), M['rubber'], bw=.08)
brace = prism(fillet([(-13.4, -1.4), (-12.9, -1.9), (-9.0, 1.95), (-9.6, 2.25)], 0.2), -.32, .32)
solid('brace', brace, M['poly'], bw=.06)
solid('lock', boxbm(-6.9, -6.1, -.7, .7, 1.75, 2.0), M['steel'], bw=.03)

# ---- handguard with slanted oval vents, front block, barrel and muzzle brake
hg = prism(fillet([(12.4, 1.25), (21.6, 1.25), (21.6, 3.45), (12.4, 3.45)], 0.3), -.82, .82)
vents = []
for i in range(4):
    for zc, ang in ((2.85, -.6), (1.95, .6)):
        vents.append(oval(15.3 + i * 1.45, zc, .6, .3, ang, -1, 1))
vents.append(boxbm(20.6, 21.2, -1, 1, 2.75, 2.95))
solid('handguard', hg, M['dark'], cuts=vents, bw=.18, seg=4)
for s_ in (1, -1):   # the -/+ buttons on the handguard (video)
    for k, x in enumerate((12.85, 13.85)):
        solid(f'hgbtn{s_}{k}', prism(rrect_xz(x, x + .8, 2.15, 2.7, .2), s_ * .8, s_ * .9), M['poly'], bw=.03)
        solid(f'hgsym{s_}{k}', boxbm(x + .25, x + .55, s_ * .89 - .02, s_ * .89 + .02, 2.4, 2.45), M['label'], bw=0)
        if k: solid(f'hgsymv{s_}', boxbm(x + .375, x + .425, s_ * .89 - .02, s_ * .89 + .02, 2.28, 2.57), M['label'], bw=0)
solid('hg_liner', prism([(12.5, 1.4), (21.5, 1.4), (21.5, 3.3), (12.5, 3.3)], -.6, .6), M['steel'], bw=.02)
solid('rail_low', boxbm(13.2, 19.4, -.42, .42, 0.98, 1.27), M['dark'], bw=.03)
for i in range(15):
    solid(f'rlt{i}', boxbm(13.3 + i * .41, 13.5 + i * .41, -.44, .44, 0.95, 1.0), M['steel'], bw=0)
front = prism(fillet([(21.5, 1.55), (25.0, 1.55), (25.0, 3.05), (24.2, 3.9), (21.5, 3.9)], 0.3), -.72, .72)
solid('front_block', front, M['dark'], cuts=[boxbm(22.2, 23.6, -1, 1, 3.05, 3.4)], bw=.14, seg=3)
solid('front_sight', prism(fillet([(21.7, 3.85), (22.8, 3.85), (22.6, 4.45), (22.0, 4.45)], 0.12), -.3, .3), M['dark'], bw=.04)
solid('light', cylbm(.3, 23.6, 24.9, 1.95, y=-.62, seg=16), M['dark'], bw=.03)
solid('light_lens', cylbm(.22, 24.88, 24.95, 1.95, y=-.62, seg=16), M['lens'], bw=0)
for s in (1, -1):
    solid(f'knob{s}', screw(23.1, s * .76, 2.4, r=.26, depth=.16), M['steel'], bw=.02)
solid('barrel', cylbm(.32, 24.9, 28.0, 2.4, seg=20), M['steel'], bw=.02)
solid('gas', cylbm(.45, 24.9, 25.8, 2.4, seg=20), M['steel'], bw=.03)
brake = cylbm(.55, 27.6, 30.2, 2.4, seg=24)
bcuts = [boxbm(x0, x0 + .32, -1, 1, 2.1, 2.7) for x0 in (28.1, 28.7, 29.3)] + [cylbm(.25, 30.0, 30.4, 2.4)]
solid('brake', brake, M['steel'], cuts=bcuts, bw=.04)

# ---- top rail (teeth), rear flip sight, the rangefinder optic
solid('rail', boxbm(-3.9, 20.2, -.43, .43, 3.5, 3.72), M['dark'], bw=.03)
for i in range(58):
    solid(f'rt{i}', boxbm(-3.8 + i * .41, -3.62 + i * .41, -.45, .45, 3.72, 3.8), M['steel'], bw=0)
hump = prism(fillet([(-4.2, 3.5), (-0.4, 3.5), (-0.4, 3.95), (-1.0, 4.35), (-3.6, 4.35), (-4.2, 4.0)], 0.25), -.62, .62)
solid('hump', hump, M['dark'], cuts=[boxbm(x0, x0 + .14, -1, 1, 4.15, 4.5) for x0 in (-3.2, -2.85, -2.5)], bw=.18, seg=4)
# the rangefinder optic on a riser; its tube is bored along the M16's sight line (z 5.2, found from the ADS view),
# with tinted glass front and back and a red dot on the front glass
SIGHT = 5.2
solid('riser', boxbm(2.2, 4.2, -.5, .5, 3.78, 4.35), M['dark'], bw=.04)
opt = prism(fillet([(2.5, 4.3), (4.6, 4.3), (4.6, 5.95), (4.25, 6.3), (2.85, 6.3), (2.5, 5.95)], 0.25), -.82, .82)
ocuts = [cylbm(.68, -.5, 5.5, SIGHT, seg=32), cylbm(.16, 4.3, 5.0, 4.5, y=.55)]
solid('optic', opt, M['dark'], cuts=ocuts, bw=.12, seg=3)
solid('o_hood', cylbm(.8, 4.55, 5.2, SIGHT, seg=32), M['dark'], cuts=[cylbm(.68, 4.4, 5.4, SIGHT, seg=32)], bw=.03)
for x in (4.5, 2.62):
    solid(f'oglass{x}', cylbm(.68, x - .01, x + .01, SIGHT, seg=32), M['glass'], bw=0)
solid('o_dot', cylbm(.045, 4.47, 4.49, SIGHT, seg=10), M['dot'], bw=0)
solid('o_emitter', cylbm(.13, 4.58, 4.62, 4.5, y=.55, seg=14), M['lens'], bw=0)
solid('o_knob', screw(3.4, .86, 5.2, r=.22, depth=.16), M['steel'], bw=.02)
solid('o_btn', boxbm(3.2, 3.8, -.88, -.78, 4.55, 4.8), M['red'], bw=.02)
text('|| ||', .22, (3.5, -.84, 5.95), side=-1, m=M['steel'])

# ---- the flechette magazine (tag_clip): a wide slab raked forward, ribbed, with the amber window
mag = prism(fillet([(2.6, 1.15), (6.85, 1.15), (7.1, -0.3), (9.35, -2.3), (9.75, -4.9), (9.3, -5.45), (4.0, -5.6), (3.35, -5.0), (2.75, -0.4)], 0.35), -.7, .7)
mcuts = []
for s_ in (1, -1):   # two recessed panels a side, as on the video's magazine
    y0, y1 = (.6, .9) if s_ > 0 else (-.9, -.6)
    mcuts.append(prism([(3.6, -0.6), (6.6, -0.6), (8.1, -2.0), (8.2, -2.6), (3.75, -2.6)], y0, y1))
    mcuts.append(prism([(3.85, -3.0), (8.5, -3.0), (8.8, -4.85), (4.0, -4.85)], y0, y1))
solid('mag', mag, M['poly'], part='tag_clip', cuts=mcuts, bw=.16, seg=4)
for s_ in (1, -1):
    win = prism([(7.25, -0.45), (9.35, -2.35), (9.55, -4.6), (9.4, -4.6), (9.2, -2.45), (7.15, -0.6)], s_ * .62, s_ * .71)
    solid(f'mag_win{s_}', win, M['amber'], part='tag_clip', bw=0)
    text('V', .75, (7.0, s_ * .63, -3.9), part='tag_clip', side=s_, m=M['label'])
solid('mag_base', prism(fillet([(3.9, -5.5), (9.35, -5.35), (9.45, -5.85), (3.8, -6.0)], 0.2), -.76, .76), M['rubber'], part='tag_clip', bw=.06)

# ---- charging handle (j_charging_handle)
ch = prism(fillet([(-2.7, 3.5), (-1.1, 3.5), (-1.2, 3.82), (-2.5, 3.82)], 0.12), -.95, .95)
solid('charging', ch, M['dark'], part='j_charging_handle', bw=.05)

# ---- join per part and export
for part, obs in PARTS.items():
    if not obs:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join(); obs[0].name = 'part_' + part; obs[0].data.name = 'part_' + part
    if not obs[0].data.uv_layers:
        obs[0].data.uv_layers.new(name='UVMap')


# ---- texture bake: one atlas for every part (UVs shared), the worn materials baked into base colour, normal and
# ORM (occlusion, roughness, metal); the glowing and see-through bits keep their own plain materials.
BAKED = {M[k].name for k in ('silver', 'dark', 'poly', 'steel', 'rubber', 'label')}
TEX = 2048
objs = [bpy.data.objects['part_' + p] for p in PARTS if 'part_' + p in bpy.data.objects]
scene = bpy.context.scene
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=.004, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=.004, rotate=True, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'CUDA'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'CUDA'
    scene.cycles.device = 'GPU'
except Exception as e:
    print('GPU unavailable:', e)
world = bpy.data.worlds.new('bakew'); scene.world = world
imgs = {}
for k, nc, size in (('col', False, TEX), ('nrm', True, TEX), ('rough', True, TEX // 2), ('metal', True, TEX // 2), ('ao', True, TEX // 2)):
    im = bpy.data.images.new('gh_' + k, size, size, alpha=False)
    if nc: im.colorspace_settings.name = 'Non-Color'
    imgs[k] = im
allmats = {m for o in objs for m in o.data.materials}
tex = {}
for m in allmats:
    tex[m.name] = m.node_tree.nodes.new('ShaderNodeTexImage'); m.node_tree.nodes.active = tex[m.name]
def bake(kind, img, samples, **kw):
    scene.cycles.samples = samples
    for m in allmats: tex[m.name].image = img
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.object.bake(type=kind, margin=8, use_clear=True, **kw); print('[grimhawk] baked', kind)
mlinks = {}
for m in allmats:   # the diffuse bake returns black for metals: zero metallic for it
    b = m.node_tree.nodes['Principled BSDF']; lk = b.inputs['Metallic'].links
    if lk: mlinks[m.name] = lk[0].from_socket; m.node_tree.links.remove(lk[0])
    b.inputs['Metallic'].default_value = 0
bake('DIFFUSE', imgs['col'], 64, pass_filter={'COLOR'})
for m in allmats:
    if m.name in mlinks: m.node_tree.links.new(mlinks[m.name], m.node_tree.nodes['Principled BSDF'].inputs['Metallic'])
bake('ROUGHNESS', imgs['rough'], 32)
bake('NORMAL', imgs['nrm'], 64, normal_space='TANGENT')
bake('AO', imgs['ao'], 64)
saved = {}
for m in allmats:
    nt = m.node_tree; out = nt.nodes['Material Output']; saved[m.name] = out.inputs['Surface'].links[0].from_socket
    em = nt.nodes.new('ShaderNodeEmission')
    if m.name in METAL: nt.links.new(METAL[m.name], em.inputs['Color'])
    else: em.inputs['Color'].default_value = (0, 0, 0, 1)
    nt.links.new(em.outputs[0], out.inputs['Surface'])
bake('EMIT', imgs['metal'], 4)
for m in allmats: m.node_tree.links.new(saved[m.name], m.node_tree.nodes['Material Output'].inputs['Surface'])
import numpy as np
px = lambda im: np.array(im.pixels[:], dtype=np.float32).reshape(-1, 4)
ao, ro, me = px(imgs['ao']), px(imgs['rough']), px(imgs['metal'])
orm = bpy.data.images.new('gh_orm', TEX // 2, TEX // 2, alpha=False); orm.colorspace_settings.name = 'Non-Color'
orm.pixels = np.stack([ao[:, 0], ro[:, 0], me[:, 0], np.ones(len(ao), np.float32)], 1).ravel()
for im in (imgs['col'], imgs['nrm'], orm): im.pack()
body = bpy.data.materials.new('gh_body'); body.use_nodes = True
nt = body.node_tree; b = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = imgs['col']; nt.links.new(tc.outputs['Color'], b.inputs['Base Color'])
to = nt.nodes.new('ShaderNodeTexImage'); to.image = orm
sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(to.outputs['Color'], sep.inputs[0])
nt.links.new(sep.outputs['Green'], b.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = imgs['nrm']
nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
grp = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
if not grp.interface.items_tree: grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp; nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
for o in objs:   # baked materials -> gh_body; the rest keep theirs
    mats = list(o.data.materials); keep = [m for m in mats if m.name not in BAKED]
    remap = {i: (0 if m.name in BAKED else 1 + keep.index(m)) for i, m in enumerate(mats)}
    idx = [p.material_index for p in o.data.polygons]
    o.data.materials.clear(); o.data.materials.append(body)
    for m in keep: o.data.materials.append(m)
    for p, i in zip(o.data.polygons, idx): p.material_index = remap[i]

if RENDER:
    import os
    os.makedirs(RENDER, exist_ok=True)
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 1600, 700
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.05, .06, .08, 1)
    for loc, e in (((10, -40, 30), 2500), ((-20, 30, 20), 1200), ((40, 0, 10), 800)):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 20
        lo = bpy.data.objects.new('l', ld); lo.location = loc; COL.objects.link(lo)
        lo.rotation_euler = (Vector((7, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 48
    co = bpy.data.objects.new('c', cam); COL.objects.link(co); sc.camera = co
    for name, loc in (('side', (7.5, -60, 0)), ('left', (7.5, 60, 0)), ('three', (35, -40, 22))):
        co.location = loc
        co.rotation_euler = (Vector((7.5, 0, -0.5)) - Vector(loc)).to_track_quat('-Z', 'Z').to_euler()
        cam.ortho_scale = 48 if name != 'three' else 40
        sc.render.filepath = f'{RENDER}/grimhawk_{name}.png'; bpy.ops.render.render(write_still=True)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT',
                          export_image_format='WEBP', export_image_quality=90, export_texcoords=True, export_normals=True)
print('[grimhawk] wrote', OUT, {p: len(o) for p, o in PARTS.items()})

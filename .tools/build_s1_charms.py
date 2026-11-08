# Season 1 charms modelled for this fork (2026-11-08, user: "model the melon seedling, bottled lightning, and queen bee in amber"):
#   seedling          a clay pot with a melon sprout and a MELON plant marker; it hangs from the marker's eyelet
#   bottledlightning  a storm in a corked vial: cloud, rain, puddle, two bolts (animated in game by material name: charms.json storm)
#   amberqueen        a crowned queen bee in an amber teardrop with a gold cap
# Plain materials, no textures. Built Z-up in centimetres-ish units (charms.json size rescales them), front toward -Y.
#   blender -b -P .tools/build_s1_charms.py -- [--out export/web/mods/charms/season1] [--render scratch/charms/s1] [--only id,id]
import random, bpy, bmesh, sys, math, os, json
from mathutils import Vector, Matrix

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return A[A.index(k) + 1] if k in A else d
OUT = arg('--out', 'export/web/mods/charms/season1'); RENDER = arg('--render'); ONLY = arg('--only')

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)

MATS = {}
def mat(name, col, rough=.6, metal=0., alpha=1., emit=None, strength=1.):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(col), 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        if hasattr(m, 'surface_render_method'): m.surface_render_method = 'BLENDED'
        if hasattr(m, 'blend_method'):
            try: m.blend_method = 'BLEND'
            except Exception: pass
    if emit:
        b.inputs['Emission Color'].default_value = (*srgb(emit), 1); b.inputs['Emission Strength'].default_value = strength
    MATS[name] = m; return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

def obj(name, bm, material, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if isinstance(material, list):
        for m in material: me.materials.append(m)
    else: me.materials.append(material)
    return o

def lathe(name, prof, material, segs=40, smooth=True, at=(0, 0, 0)):
    """prof: [(r,z)...] from bottom to top; r=0 ends are closed with a single pole."""
    bm = bmesh.new(); rings = []
    for r, z in prof:
        if r < 1e-6: rings.append([bm.verts.new((at[0], at[1], at[2] + z))])
        else: rings.append([bm.verts.new((at[0] + r * math.cos(2 * math.pi * i / segs), at[1] + r * math.sin(2 * math.pi * i / segs), at[2] + z)) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            if len(a) == 1: bm.faces.new((a[0], b[i], b[(i + 1) % segs]))
            elif len(b) == 1: bm.faces.new((a[i], a[(i + 1) % segs], b[0]))
            else: bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, material, smooth)

def tube(name, pts, r, material, segs=8, taper=None):
    """A swept circle along pts (Vectors); taper(t)->scale."""
    pts = [Vector(p) for p in pts]; bm = bmesh.new(); rings = []; n = len(pts)
    up = Vector((0, 0, 1))
    for k, p in enumerate(pts):
        t = (pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]).normalized()
        a = t.cross(up if abs(t.dot(up)) < .95 else Vector((1, 0, 0))).normalized(); b = t.cross(a)
        s = r * (taper(k / (n - 1)) if taper else 1)
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * i / segs) + b * math.sin(2 * math.pi * i / segs)) * s) for i in range(segs)])
    for A_, B_ in zip(rings, rings[1:]):
        for i in range(segs): bm.faces.new((A_[i], A_[(i + 1) % segs], B_[(i + 1) % segs], B_[i]))
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        f = bm.faces.new(ring[::-1] if rev else ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, material)

def blob(name, at, scale, material, rot=(0, 0, 0), segs=24, rings=14):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1)
    M = Matrix.Translation(at) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return obj(name, bm, material)

def box(name, at, size, material, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    M = Matrix.Translation(at) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return obj(name, bm, material, smooth=False)

def ring(name, at, R, r, material, axis='Y'):
    """A torus standing upright (its hole along `axis`), for eyelets."""
    bm = bmesh.new(); seg, side = 28, 10; vs = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; c = Vector((math.cos(a), 0, math.sin(a)))
        vs.append([bm.verts.new(c * (R + r * math.cos(2 * math.pi * j / side)) + Vector((0, r * math.sin(2 * math.pi * j / side), 0))) for j in range(side)])
    for i in range(seg):
        for j in range(side):
            a, b = vs[i], vs[(i + 1) % seg]; bm.faces.new((a[j], b[j], b[(j + 1) % side], a[(j + 1) % side]))
    M = Matrix.Translation(at) @ (Matrix.Rotation(math.pi / 2, 4, 'Z') if axis == 'X' else Matrix.Identity(4))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, material)

def text(name, body, at, size, material, extrude=.012):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    o.location = at; o.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.objects.active = o; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.data.materials.clear(); o.data.materials.append(material); return o

def lerp(a, b, t): return a + (b - a) * t

# ---- Melon Seedling -----------------------------------------------------------------------------------------------------------
def seedling():
    clay, rim = mat('clay', '#b4572e', .85), mat('clay_rim', '#c86b3c', .8)
    soil, peb = mat('soil', '#3a2517', 1.), mat('pebble', '#6b5a4a', .9)
    stem, leaf, leaf2 = mat('stem', '#7cbf3a', .55), mat('leaf', '#4fa82a', .45), mat('leaf_new', '#8fd14a', .45)
    wood, ink, brass, rind = mat('marker', '#e8d7b0', .8), mat('ink', '#2f6b1f', .7), mat('brass', '#c9a24a', .35, 1.), mat('rind_band', '#3f7d2a', .7)
    lathe('pot', [(0, 0), (.95, 0), (1.0, .05), (1.25, 1.45), (0, 1.45)], clay)
    lathe('pot_band', [(1.105, .62), (1.135, .62), (1.165, .82), (1.135, .82)], rind, smooth=False)   # a melon-green painted stripe
    lathe('pot_rim', [(1.2, 1.38), (1.42, 1.4), (1.45, 1.78), (1.36, 1.82), (1.27, 1.8), (1.27, 1.66), (0, 1.66)], rim)
    lathe('soil', [(0, 1.62), (1.28, 1.62), (1.27, 1.7), (.9, 1.74), (.4, 1.76), (0, 1.77)], soil)
    for i, (x, y) in enumerate([(.6, -.5), (-.7, -.3), (.2, .8), (-.3, -.85), (.85, .35)]):
        blob(f'pebble{i}', (x, y, 1.75), (.09, .07, .05), peb, rot=(0, 0, i))
    # stem: a gentle S up from the soil
    sp = [Vector((lerp(.05, .12, t) + .12 * math.sin(t * 3.2), -.15 - .1 * math.sin(t * 2.4), lerp(1.7, 3.15, t))) for t in [i / 14 for i in range(15)]]
    tube('stem', sp, .085, stem, taper=lambda t: 1 - .25 * t)
    top = sp[-1]
    # two seed leaves, cupped up and out, and the first true leaf between them
    for s in (-1, 1):
        blob(f'cotyledon{s}', top + Vector((s * .52, -.04, .1)), (.5, .33, .065), leaf, rot=(-.35, -s * .55, s * .1))
        blob(f'cotyledon_vein{s}', top + Vector((s * .5, -.08, .14)), (.42, .02, .025), stem, rot=(-.35, -s * .55, s * .1))
    blob('true_leaf', top + Vector((.05, -.05, .42)), (.2, .05, .34), leaf2, rot=(.15, .2, 0))
    # a curly tendril off the stem
    tp = [Vector((.3 + .16 * math.cos(a) * (1 - a / 14), -.2 + .16 * math.sin(a) * (1 - a / 14), 2.45 + a * .03)) for a in [i * .45 for i in range(30)]]
    tube('tendril', [sp[9]] + tp, .028, stem, segs=6, taper=lambda t: 1 - .6 * t)
    # the plant marker behind it: a pointed stake with a paddle, MELON on the front, an eyelet on top
    mx, my = -.25, .45
    box('stake', (mx, my, 2.6), (.16, .05, 2.4), wood)
    box('stake_tip', (mx, my, 1.38), (.11, .05, .2), wood, rot=(0, math.pi / 4, 0))
    box('paddle', (mx, my, 3.95), (.95, .06, .6), wood)
    text('label', 'MELON', (mx, my - .035, 3.95), .26, ink)
    lathe('eye_post', [(.045, 4.2), (.045, 4.33), (0, 4.33)], brass, segs=12, at=(mx, my, 0))
    ring('eyelet', (mx, my, 4.48), .15, .035, brass)
    return {'hang': (mx, my, 4.66)}

# ---- Bottled Lightning ----------------------------------------------------------------------------------------------------
def rain_mat(name, seed, streaks):
    """Falling rain: a tiling texture of thin streaks with fading tails (alpha), scrolled down in game (charms.js storm)."""
    W, H = 64, 128; px = [0.] * (W * H * 4); rnd = random.Random(seed)
    for _ in range(streaks):
        x = rnd.randrange(W - 1); y0 = rnd.randrange(H); L = rnd.randint(10, 26); a0 = rnd.uniform(.55, 1.)
        for k in range(L):   # the head (lowest, brightest) at y0, the tail fading upward; wraps so the tile repeats
            y = (y0 + k) % H; a = a0 * (1 - k / L) ** 1.5; i = (y * W + x) * 4
            px[i:i + 4] = [.82, .9, 1., max(px[i + 3], a)]; px[i + 4:i + 8] = [.82, .9, 1., max(px[i + 7], a * .6)]   # two texels wide
    img = bpy.data.images.new(name, W, H, alpha=True); img.pixels = px; img.file_format = 'PNG'; img.pack()
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.interpolation = 'Linear'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = .3; b.inputs['Emission Color'].default_value = (*srgb('#9cc4ff'), 1); b.inputs['Emission Strength'].default_value = 1.4
    if hasattr(m, 'surface_render_method'): m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False
    MATS[name] = m; return m

def rain_tube(name, r, z0, z1, wraps, material, segs=24):
    """An open cylinder (no caps) with u around it and v up it, v in tile units so streaks keep their shape."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new(); vs = []
    for k in range(segs + 1):
        a = 2 * math.pi * k / segs
        vs.append((bm.verts.new((r * math.cos(a), r * math.sin(a), z0)), bm.verts.new((r * math.cos(a), r * math.sin(a), z1))))
    h = (z1 - z0) / (2 * math.pi * r / wraps) * .5   # a tile is 64x128, so it stands twice as tall as it is wide
    for k in range(segs):
        f = bm.faces.new((vs[k][0], vs[k + 1][0], vs[k + 1][1], vs[k][1]))
        for l, (u, v) in zip(f.loops, ((k, 0), (k + 1, 0), (k + 1, h), (k, h))): l[uv].uv = (u / segs * wraps, v)
    o = obj(name, bm, material, smooth=True); return o

def bottled():
    """A storm in a bottle: a dark cloud under the cork, rain falling from it onto a puddle, and two lightning bolts that only
    show during a strike. The game animates it by material name (charms.json storm, charms.js): rain* scrolls, bolt_a/bolt_b
    flash one at a time every few seconds, cloud* and glass light up with each strike."""
    glass = mat('glass', '#cfeeff', .04, 0., alpha=.12, emit='#5bbcff', strength=.06)
    cork, wire = mat('cork', '#a87b4c', .9), mat('wire', '#b9bec6', .3, 1.)
    lathe('vial', [(0, 0), (.38, .05), (.62, .22), (.74, .55), (.75, .9), (.75, 3.0), (.68, 3.2), (.5, 3.33), (.44, 3.4), (.44, 3.6), (.53, 3.66), (.53, 3.78), (.4, 3.8), (0, 3.8)], glass, segs=48)
    lathe('cork', [(0, 3.5), (.4, 3.5), (.43, 3.8), (.48, 4.2), (.44, 4.26), (0, 4.27)], cork, segs=24)
    for i in range(6): lathe(f'cork_pit{i}', [(0, 0), (.03, 0), (0, .01)], mat('cork_pit', '#6d4a2a', 1.), segs=6, at=(.45 * math.cos(i), .45 * math.sin(i), 3.9 + .05 * i))
    lathe('collar', [(.455, 3.42), (.5, 3.42), (.5, 3.5), (.455, 3.5)], wire, segs=32, smooth=False)
    for s in (-1, 1):
        tube(f'bail{s}', [Vector((s * .49, 0, 3.47)), Vector((s * .5, 0, 3.9)), Vector((s * .4, 0, 4.3)), Vector((s * .12, 0, 4.42)), Vector((0, 0, 4.44))], .028, wire, segs=6)
    ring('eyelet', (0, 0, 4.6), .15, .032, wire)
    # the cloud: puffs packed into the top of the vial, darker underneath (a storm cell's flat grey base)
    top, base = mat('cloud_top', '#464d5a', 1., emit='#b9d4ff', strength=.05), mat('cloud_base', '#22272f', 1., emit='#9fc0ff', strength=.05)
    rnd = random.Random(7)
    for i in range(22):
        a = rnd.uniform(0, 2 * math.pi); d = rnd.uniform(.05, .42); z = rnd.uniform(2.15, 3.0); r = rnd.uniform(.26, .36) * (1.1 - .3 * (z - 2.15) / .85)
        blob(f'puff{i}', Vector((d * math.cos(a), d * math.sin(a), z)), (r, r, r * .85), top, segs=16, rings=10)
    for i in range(10):
        a = 2 * math.pi * i / 10 + rnd.uniform(-.2, .2); d = rnd.uniform(.3, .44)
        blob(f'base{i}', Vector((d * math.cos(a), d * math.sin(a), 2.0 + rnd.uniform(-.04, .05))), (.27, .27, .15), base, segs=16, rings=8)
    blob('base_mid', Vector((0, 0, 1.98)), (.42, .42, .16), base, segs=16, rings=8)
    # rain: two nested streak tubes from the cloud's base to the puddle, scrolling at different speeds for depth
    rain_tube('rain1', .5, .5, 2.0, 2, rain_mat('rain1', 11, 34))
    rain_tube('rain2', .27, .5, 2.0, 2, rain_mat('rain2', 23, 22))
    # the puddle on the bottom, with a meniscus
    water = mat('water', '#5c8fc4', .05, 0., alpha=.55, emit='#3a78c0', strength=.2)
    lathe('puddle', [(0, .08), (.5, .1), (.68, .3), (.72, .46), (.66, .47), (0, .45)], water, segs=40)
    # the strikes: two bolts from the cloud base down to the water, shown one at a time (transparent so they can fade)
    def bolt(name, pts, forks):
        m = mat(name, '#f4fcff', .3, alpha=.99, emit='#a8ecff', strength=9.)
        tube(name, [Vector(p) for p in pts], .075, m, segs=6, taper=lambda t: 1 - .55 * t)
        for k, f in enumerate(forks): tube(f'{name}_f{k}', [Vector(pts[f[0]])] + [Vector(p) for p in f[1:]], .04, m, segs=5, taper=lambda t: 1 - .6 * t)
    bolt('bolt_a', [(.05, 0, 1.95), (.22, .02, 1.72), (-.05, -.03, 1.45), (.18, .02, 1.2), (-.08, 0, .95), (.12, .03, .7), (0, 0, .47)],
         [(2, (-.3, .02, 1.25), (-.24, -.03, 1.02)), (4, (.25, -.02, .82))])
    bolt('bolt_b', [(-.2, .1, 1.95), (-.35, .05, 1.7), (-.1, .12, 1.45), (-.32, .06, 1.15), (-.12, .1, .85), (-.25, .05, .47)],
         [(1, (-.1, -.1, 1.5), (.12, -.05, 1.3)), (3, (-.5, .03, .95))])
    return {}

# ---- Queen Bee in Amber ----------------------------------------------------------------------------------------------------
def amberqueen():
    amber = mat('amber', '#f2a33a', .06, 0., alpha=.34, emit='#c06a10', strength=.18)
    gold = mat('gold', '#d9ab45', .28, 1.)
    yel, blk, fuzz = mat('bee_yellow', '#f2b40a', .55), mat('bee_black', '#1b130a', .5), mat('bee_fuzz', '#6a4416', .9)
    wing, eye = mat('bee_wing', '#e4eef2', .25), mat('bee_eye', '#0d0d10', .15)
    # a teardrop, slightly flattened front to back so it reads as a pendant
    prof = []
    for i in range(25):
        t = i / 24; z = .02 + t * 3.0
        r = 1.1 * math.sin(math.pi * t ** .68) ** .8   # round below, drawn to a point at the top
        prof.append((max(r, .0) if 0 < i < 24 else 0, z))
    o = lathe('amber', prof, amber, segs=48); o.scale = (1, .82, 1)
    # gold bell cap and eyelet
    lathe('cap', [(0, 2.62), (.3, 2.62), (.36, 2.72), (.33, 2.9), (.24, 3.05), (.1, 3.12), (0, 3.13)], gold, segs=32)
    lathe('cap_bead', [(.05, 3.1), (.07, 3.16), (.05, 3.22), (0, 3.22)], gold, segs=12)
    ring('eyelet', (0, 0, 3.36), .14, .035, gold)
    # the bee, side on, head to +X, a little nose-up
    B = Matrix.Translation((.06, 0, 1.05)) @ Matrix.Rotation(.22, 4, 'Y') @ Matrix.Diagonal((1.22, 1.22, 1.22, 1))
    def P(x, y, z): return B @ Vector((x, y, z))
    # abdomen: a long queen's abdomen, banded yellow/black by face position
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=30, radius=1)   # poles along X, so the rings make clean bands
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((.48, .27, .27, 1)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'), verts=bm.verts)
    for f in bm.faces:   # bands along the body's own axis, before the tilt
        x = f.calc_center_median().x - .36; f.material_index = 1 if (x < -.74 or int((x + .9) / .13) % 2 == 0) else 0
    bmesh.ops.transform(bm, matrix=Matrix.Translation((-.36, 0, -.02)) @ Matrix.Rotation(-.12, 4, 'Y'), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=B, verts=bm.verts)
    obj('abdomen', bm, [yel, blk])
    lathe('stinger', [(.03, 0), (0, .12)], blk, segs=8).matrix_world = Matrix.Translation(P(-.83, 0, -.08)) @ Matrix.Rotation(-math.pi / 2 - .3, 4, 'Y')
    blob('thorax', P(.1, 0, .02), (.22, .2, .2), fuzz)
    blob('head', P(.36, 0, .03), (.13, .14, .14), blk)
    for s in (-1, 1):
        blob(f'eye{s}', P(.4, s * .1, .06), (.06, .045, .085), eye)
        tube(f'antenna{s}', [P(.44, s * .05, .12), P(.52, s * .09, .25), P(.62, s * .12, .28)], .012, blk, segs=5)
        for k, lx in enumerate((.02, .12, .2)):   # three legs a side, bent under
            tube(f'leg{s}{k}', [P(lx, s * .12, -.1), P(lx - .03 + .04 * k, s * .2, -.24), P(lx - .08 + .06 * k, s * .22, -.36)], .014, blk, segs=5)
        blob(f'wing{s}', P(-.12, s * .14, .2), (.34, .02, .12), wing, rot=(s * -.5, .35, s * .25))
        blob(f'wing_back{s}', P(-.05, s * .12, .17), (.22, .02, .08), wing, rot=(s * -.4, .25, s * .45))
    # her crown: a band with five points and beads
    lathe('crown', [(.085, 0), (.095, 0), (.095, .055), (.085, .055)], gold, segs=20, smooth=False).matrix_world = Matrix.Translation(P(.36, 0, .15))
    for i in range(5):
        a = 2 * math.pi * i / 5; c = P(.36, 0, .15) + Vector((.09 * math.cos(a), .09 * math.sin(a), 0))
        lathe(f'crown_pt{i}', [(.025, .05), (0, .13)], gold, segs=6).matrix_world = Matrix.Translation(c)
        blob(f'crown_bead{i}', c + Vector((0, 0, .135)), (.016, .016, .016), mat('ruby', '#c0182a', .2), segs=8, rings=6)
    return {}

BUILD = {'seedling': seedling, 'bottledlightning': bottled, 'amberqueen': amberqueen}

def render(path):
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 600; sc.render.resolution_y = 600
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.18, .18, .2, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .6
    for loc, e in (((-4, -6, 7), 600), ((5, -3, 2), 250), ((0, 6, 4), 300)):
        L = bpy.data.objects.new('L', bpy.data.lights.new('L', 'POINT')); L.data.energy = e; L.location = loc; sc.collection.objects.link(L)
    ms = [o for o in sc.objects if o.type == 'MESH']
    lo = Vector((min(min((o.matrix_world @ Vector(c)).x for c in o.bound_box) for o in ms), 0, min(min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in ms)))
    hi = Vector((max(max((o.matrix_world @ Vector(c)).x for c in o.bound_box) for o in ms), 0, max(max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in ms)))
    c = (lo + hi) / 2; r = max(hi.x - lo.x, hi.z - lo.z)
    for k, az in enumerate((0, 35, 180)):
        cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
        d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), .25)).normalized()
        cam.location = c + d * r * 2.3; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{path}_{k}.png'; bpy.ops.render.render(write_still=True)

info = {}
for cid, fn in BUILD.items():
    if ONLY and cid not in ONLY.split(','): continue
    reset(); MATS.clear(); meta = fn()
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH')
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, cid + '.glb'), export_format='GLB', export_animations=False, export_apply=True)
    # the hang point in three's Y-up frame (x, z, -y), for charms.json "hang"
    if 'hang' in meta: x, y, z = meta['hang']; meta['hang'] = [round(x, 3), round(z, 3), round(-y, 3)]
    info[cid] = {'tris': tris, **meta}
    if RENDER: os.makedirs(RENDER, exist_ok=True); render(os.path.join(RENDER, cid))
print('CHARMS', json.dumps(info))

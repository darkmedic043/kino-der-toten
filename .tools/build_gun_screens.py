# Gun screen housings (2026-11-07): small displays that mount flat on the left side of a gun (mods/charms/screens.js).
# Original designs, built procedurally. Units are inches; the face looks down +Z, the back is at z=0 (exported Z-up, as built).
#   slab  : a square body where the screen fills the face, a thin raised rim
#   field : a taller body with the screen on top and three buttons below (btn_0 round, btn_1 up, btn_2 down), each its own
#           object with its origin on the face so a later press is a move along -Z
# Every unit has: `screen` (the display, UVs 0..1 across it, drawn by a shader in the game), `foot` (the mount block from
# z=0 to z=-1, scaled in the game to reach the gun's surface), materials shell / trim / rubber / glyph / glass.
# blender -b -P .tools/build_gun_screens.py -- [--render scratch/screens]
import bpy, bmesh, math, os, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'export', 'web', 'mods', 'charms', 'screens')
os.makedirs(OUT, exist_ok=True)


def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)


def mat(name, col, metal=0., rough=.5, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 3.
    return m


def rr(w, h, r, n=6, cx=0., cy=0.):
    """rounded rectangle outline, counter-clockwise, 4*(n+1) points"""
    r = max(1e-4, min(r, w / 2 - 1e-4, h / 2 - 1e-4)); pts = []
    for i, (sx, sy, a0) in enumerate(((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270))):
        ox, oy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n); pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def circle(r, n=28, cx=0., cy=0.):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def loft(bm, rings, cap0=False, cap1=False, mi=0):
    """rings: [(points, z)] with equal point counts; quads between neighbours, optional end caps"""
    loops = [[bm.verts.new((x, y, z)) for x, y in pts] for pts, z in rings]
    for a, b in zip(loops, loops[1:]):
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            try: bm.faces.new((a[i], a[j], b[j], b[i])).material_index = mi
            except ValueError: pass
    if cap0: f = bm.faces.new(list(reversed(loops[0]))); f.material_index = mi
    if cap1: f = bm.faces.new(loops[-1]); f.material_index = mi
    return loops


def shape(w, h, r, inset, cx=0., cy=0., n=6):
    return rr(w - 2 * inset, h - 2 * inset, max(.01, r - inset), n, cx, cy)


def obj(name, bm, mats, smooth=35, parent=None, origin=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    if origin != (0, 0, 0):
        me.transform(__import__('mathutils').Matrix.Translation((-origin[0], -origin[1], -origin[2]))); o.location = origin
    me.shade_smooth()
    try: me.set_sharp_from_angle(angle=math.radians(smooth))
    except Exception: pass
    if parent: o.parent = parent
    return o


def body(w, h, d, r, b, front_rings):
    """the housing: bevelled back and front edges, then the given rings across the face (inset, z) to the middle"""
    bm = bmesh.new(); rings = []
    for k in range(4):  # back bevel
        t = math.radians(90 * k / 3); rings.append((shape(w, h, r, b * (1 - math.sin(t))), b * (1 - math.cos(t))))
    for k in range(4):  # front bevel
        t = math.radians(90 * k / 3); rings.append((shape(w, h, r, b * (1 - math.cos(t))), d - b + b * math.sin(t)))
    rings[0] = (rings[0][0], 0.)
    loft(bm, rings + front_rings, cap0=True, cap1=True)
    return bm


def uv_planar(o):
    me = o.data; xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys); uv = me.uv_layers.new(name='UVMap')
    for l in me.loops:
        c = me.vertices[l.vertex_index].co; uv.data[l.index].uv = ((c.x - x0) / (x1 - x0), (c.y - y0) / (y1 - y0))


def screen(w, h, r, z, M):
    bm = bmesh.new(); loft(bm, [(rr(w, h, r, 6), z)], cap1=True); o = obj('screen', bm, [M['screen']], 1); uv_planar(o); return o


def foot(w, h, r, M):
    bm = bmesh.new(); loft(bm, [(rr(w, h, r, 4), -1.), (rr(w, h, r, 4), 0.)], cap0=True, cap1=False)
    return obj('foot', bm, [M['shell']], 30)


def screw(x, y, z, M, name):
    bm = bmesh.new(); loft(bm, [(circle(.028, 12, x, y), z), (circle(.028, 12, x, y), z + .012), (circle(.02, 12, x, y), z + .02)], cap1=True)
    return obj(name, bm, [M['trim']], 50)


def materials():
    return dict(shell=mat('shell', (.05, .055, .06), .75, .38), trim=mat('trim', (.32, .78, .22), .6, .3),
                rubber=mat('rubber', (.025, .027, .03), 0., .72), glyph=mat('glyph', (.78, .82, .8), 0., .5),
                screen=mat('screen', (0, 0, 0), 0., .2), led=mat('led', (.2, 1., .3), 0., .4, emit=(.3, 1., .35)))


def finish(name, parts, fit):
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    for p in parts:
        if p.parent is None: p.parent = root
    root['fit'] = fit
    bpy.ops.object.select_all(action='DESELECT'); root.select_set(True)
    for p in parts: p.select_set(True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=False, export_apply=False,
                              export_materials='EXPORT', export_texcoords=True, export_normals=True, export_extras=True)
    print('[screens] wrote', path, sum(len(p.data.polygons) for p in parts if p.type == 'MESH'), 'faces')
    return root


# ---- slab: the screen takes the whole face ----
def build_slab():
    clear(); M = materials()
    W, H, D, R, B = 1.2, 1.2, .3, .2, .045
    rim = [(shape(W, H, R, B + .012), D + .018), (shape(W, H, R, B + .045), D + .018), (shape(W, H, R, B + .06), D - .012)]
    bm = body(W, H, D, R, B, rim); hb = obj('housing', bm, [M['shell']], 35)
    sw = W - 2 * (B + .06); scr = screen(sw, sw, R - B - .06, D - .011, M)
    # a trim band around the sides, tiny grip ridges on the right edge, a status LED on top
    bm = bmesh.new(); loft(bm, [(shape(W, H, R, -.006), D * .42), (shape(W, H, R, -.006), D * .62)]); band = obj('band', bm, [M['trim']], 35)
    parts = [hb, scr, band]
    bm = bmesh.new()
    for i in range(4):
        y = -.18 + i * .12; loft(bm, [(rr(.03, .07, .012, 3, W / 2 + .012, y), D * .66), (rr(.03, .07, .012, 3, W / 2 + .012, y), D * .9)], cap0=True, cap1=True)
    parts.append(obj('grip', bm, [M['rubber']], 40))
    bm = bmesh.new(); loft(bm, [(rr(.16, .02, .008, 3, -.32, H / 2 + .006), D * .7), (rr(.16, .02, .008, 3, -.32, H / 2 + .006), D * .9)], cap0=True, cap1=True)
    led = obj('led', bm, [M['led']], 40); parts.append(led)
    parts.append(foot(.62, .52, .1, M))
    return finish('slab', parts, dict(w=W, h=H, d=D)), (sw, sw)


# ---- field: screen on top, three buttons below ----
def build_field():
    clear(); M = materials()
    W, H, D, R, B = 1.1, 1.45, .32, .16, .045
    bm = body(W, H, D, R, B, [(shape(W, H, R, B + .002), D)]); parts = [obj('housing', bm, [M['shell']], 35)]
    # screen frame: a raised trim rim with the screen recessed inside, on the upper part
    sy, fw, fh, sw, sh = .25, .98, .8, .84, .64
    bm = bmesh.new()
    loft(bm, [(rr(fw, fh, .1, 6, 0, sy), D), (rr(fw, fh, .1, 6, 0, sy), D + .035), (rr(fw - .03, fh - .03, .09, 6, 0, sy), D + .045),
              (rr(sw + .02, sh + .02, .06, 6, 0, sy), D + .045), (rr(sw, sh, .055, 6, 0, sy), D + .01)], cap1=True)
    parts.append(obj('frame', bm, [M['trim']], 35))
    s = screen(sw, sh, .055, D + .012, M); s.location.y = 0; parts.append(s)
    # move the screen's geometry up: built at the origin
    for v in s.data.vertices: v.co.y += sy
    # button wells (rubber plates) and the three caps
    by = -.44
    bm = bmesh.new()
    loft(bm, [(circle(.15, 32, -.27, by), D), (circle(.15, 32, -.27, by), D + .012)], cap1=True)
    loft(bm, [(rr(.56, .28, .1, 6, .17, by), D), (rr(.56, .28, .1, 6, .17, by), D + .012)], cap1=True)
    parts.append(obj('wells', bm, [M['rubber']], 40))

    def cap(name, outline_fn, cx, glyph):
        bm = bmesh.new(); z = D + .012
        loft(bm, [(outline_fn(0), z), (outline_fn(0), z + .04), (outline_fn(.012), z + .052)], cap1=True, mi=0)
        g = glyph(z + .052)
        if g: loft(bm, [(g, z + .051), (g, z + .057)], cap1=True, mi=1)
        o = obj(name, bm, [M['rubber'], M['glyph']], 40, origin=(cx, by, z)); return o

    def ring_glyph(z):  # a ring drawn as a flat annulus is two loops; a plain dot keeps it one outline
        return circle(.04, 20, -.27, by)
    parts.append(cap('btn_0', lambda i: circle(.115 - i, 32, -.27, by), -.27, ring_glyph))
    parts.append(cap('btn_1', lambda i: rr(.245 - 2 * i, .22 - 2 * i, .07 - i, 5, .045, by), .045,
                     lambda z: [(.045 - .045, by - .03), (.045 + .045, by - .03), (.045, by + .04)]))
    parts.append(cap('btn_2', lambda i: rr(.245 - 2 * i, .22 - 2 * i, .07 - i, 5, .295, by), .295,
                     lambda z: [(.295 + .045, by + .03), (.295 - .045, by + .03), (.295, by - .04)]))
    # trim band, status LEDs on top, corner screws
    bm = bmesh.new(); loft(bm, [(shape(W, H, R, -.006), D * .42), (shape(W, H, R, -.006), D * .62)]); parts.append(obj('band', bm, [M['trim']], 35))
    bm = bmesh.new()
    for x in (-.3, -.18):
        loft(bm, [(rr(.07, .02, .008, 3, x, H / 2 + .006), D * .7), (rr(.07, .02, .008, 3, x, H / 2 + .006), D * .9)], cap0=True, cap1=True)
    parts.append(obj('led', bm, [M['led']], 40))
    for i, (x, y) in enumerate(((-1, -1), (1, -1))):
        parts.append(screw(x * (W / 2 - B - .045), by - .2 + y * 0, D, M, 'screw%d' % i))
    parts.append(foot(.6, .62, .1, M))
    return finish('field', parts, dict(w=W, h=H, d=D)), (sw, sh)


def render(root, name):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.device = 'GPU'
    try:
        p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'CUDA'; p.get_devices()
        for d in p.devices: d.use = d.type == 'CUDA'
    except Exception: pass
    sc.render.resolution_x = sc.render.resolution_y = 600
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.35, .38, .42, 1)
    for o in bpy.data.objects:
        if o.name == 'screen': o.data.materials[0] = mat('screen_preview', (.02, .05, .03), 0, .15, emit=(.1, .5, .2))
    cam = bpy.data.cameras.new('c'); c = bpy.data.objects.new('c', cam); bpy.context.collection.objects.link(c); sc.camera = c
    cam.lens = 85; c.location = (1.6, -3.4, 3.2)
    con = c.constraints.new('TRACK_TO'); con.target = root; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
    L = bpy.data.lights.new('l', 'AREA'); L.energy = 60; L.size = 3; lo = bpy.data.objects.new('l', L); bpy.context.collection.objects.link(lo); lo.location = (-2, -2, 4)
    con = lo.constraints.new('TRACK_TO'); con.target = root; con.track_axis = 'TRACK_NEGATIVE_Z'
    sc.render.filepath = os.path.join(RENDER, name + '.png'); bpy.ops.render.render(write_still=True)


for build, name in ((build_slab, 'slab'), (build_field, 'field')):
    root, size = build(); print('[screens]', name, 'screen', size)
    if RENDER: os.makedirs(RENDER, exist_ok=True); render(root, name)

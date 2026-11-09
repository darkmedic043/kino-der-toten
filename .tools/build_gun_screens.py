# Gun screen housings (2026-11-07): small displays that mount flat on the left side of a gun (mods/charms/screens.js).
# Original designs, built procedurally. Units are inches; the face looks down +Z, the back is at z=0 (exported Z-up, as built).
#   slab  : a square body where the screen fills the face, a thin raised rim
#   field : a taller body with the screen on top and three buttons below (btn_0 round, btn_1 up, btn_2 down), each its own
#           object with its origin on the face so a later press is a move along -Z
# Every unit has: `screen` (the display, UVs 0..1 across it, drawn by a shader in the game) and the mount (2026-11-07, user:
# "it doesnt really look like its attached to the gun ... something like a clip added to the back of it"): a boss on the
# back, `arm` (z=0 to z=-1, scaled in the game to reach the gun) and `clip`, a clamp plate placed by the game flat on the
# gun's side (its own frame: back on the gun at z=0, +Z away from it, the arm's ball at z=.13), with claws over its top
# and bottom edges. Materials shell / trim / rubber / glyph / led.
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


def mount(M):
    """the back of the unit (2026-11-07, user: "add abit more to the back part that makes it actually look like its connected"):
    a bracket on the housing's back, the arm (unit length, scaled in the game) and the clip that sits flush on the gun's side
    with a hook over the gun's top. The clip's own frame: back on the gun at z=0, +Z away from it, +Y up, the arm's ball at
    z=.13. The game stretches `clip_riser` (Y, from the plate's top to over the gun's top), moves `clip_lip` to the riser's top
    and stretches it in -Z over the gun (Z = how far in), and puts `clip_tip` at the lip's end; with no top in reach it
    hides all three."""
    out = []
    # the bracket: a rounded plate over the housing's back, a ribbed collar and a knuckle the arm leaves from
    bm = bmesh.new(); loft(bm, [(shape(.74, .74, .14, .03), -.07), (shape(.74, .74, .14, 0.), -.05), (shape(.74, .74, .14, 0.), 0.)], cap0=True)
    out.append(obj('boss', bm, [M['shell']], 35))
    bm = bmesh.new()
    for sx in (-1, 1):
        loft(bm, [(rr(.06, .5, .02, 3, sx * .27, 0), -.12), (rr(.06, .5, .02, 3, sx * .27, 0), -.06)], cap0=True, cap1=True)
    loft(bm, [(circle(.2, 24), -.2), (circle(.2, 24), -.06)], cap0=True, cap1=True)
    out.append(obj('boss_collar', bm, [M['trim']], 40))
    for i, (x, y) in enumerate(((-.27, .27), (.27, .27), (-.27, -.27), (.27, -.27))):
        out.append(screw(x, y, -.085, M, 'boss_screw%d' % i, flip=True))
    bm = bmesh.new(); loft(bm, [(rr(.22, .26, .08, 4), -1.), (rr(.22, .26, .08, 4), -.15)], cap0=True, cap1=True); out.append(obj('arm', bm, [M['shell']], 40))
    clip = bpy.data.objects.new('clip', None); bpy.context.collection.objects.link(clip); out.append(clip)
    PW, PH, T = .86, .7, .09
    bm = bmesh.new(); rings = [(shape(PW, PH, .12, .02), 0.), (shape(PW, PH, .12, 0.), .02), (shape(PW, PH, .12, 0.), T - .025), (shape(PW, PH, .12, .03), T)]
    loft(bm, rings, cap0=True, cap1=True); out.append(obj('clip_plate', bm, [M['shell']], 35, parent=clip))
    bm = bmesh.new(); loft(bm, [(shape(PW, PH, .12, -.015), -.02), (shape(PW, PH, .12, -.015), .002)], cap0=True, cap1=True)
    out.append(obj('clip_pad', bm, [M['rubber']], 35, parent=clip))
    # the hook: riser up the gun's side from the plate's top, lip over the top, a tip that bites down
    HW, HT = .5, .12   # stout, in the housing's dark shell (a thin gold bar read as a coat hanger)
    bm = bmesh.new(); loft(bm, [(rr(HW + .04, .1, .03, 3, 0, 0), 0.), (rr(HW + .04, .1, .03, 3, 0, 0), T + .03)], cap0=True, cap1=True)
    o = obj('clip_riser_cap', bm, [M['trim']], 40, parent=clip); o.location = (0, PH / 2 - .02, 0); out.append(o)
    bm = bmesh.new()
    vs = [(-HW / 2, 0, 0), (HW / 2, 0, 0), (HW / 2, 1, 0), (-HW / 2, 1, 0), (-HW / 2, 0, HT), (HW / 2, 0, HT), (HW / 2, 1, HT), (-HW / 2, 1, HT)]
    box(bm, vs); o = obj('clip_riser', bm, [M['shell']], 30, parent=clip); o.location = (0, PH / 2, 0); out.append(o)
    bm = bmesh.new()
    vs = [(-HW / 2, 0, -1), (HW / 2, 0, -1), (HW / 2, HT, -1), (-HW / 2, HT, -1), (-HW / 2, 0, HT), (HW / 2, 0, HT), (HW / 2, HT, HT), (-HW / 2, HT, HT)]
    box(bm, vs); o = obj('clip_lip', bm, [M['shell']], 30, parent=clip); o.location = (0, PH / 2 + 1, 0); out.append(o)
    bm = bmesh.new()
    vs = [(-HW / 2, -.12, -.1), (HW / 2, -.12, -.1), (HW / 2, HT, -.1), (-HW / 2, HT, -.1), (-HW / 2, -.07, 0), (HW / 2, -.07, 0), (HW / 2, HT, 0), (-HW / 2, HT, 0)]
    box(bm, vs); o = obj('clip_tip', bm, [M['trim']], 30, parent=clip); o.location = (0, PH / 2 + 1, -1); out.append(o)
    # the socket the arm's ball sits in (a dome) and the screws
    bm = bmesh.new(); loft(bm, [(circle(.15 * math.cos(math.radians(a)), 24), T + .12 * math.sin(math.radians(a))) for a in (0, 25, 50, 70, 85)], cap1=True)
    out.append(obj('clip_socket', bm, [M['trim']], 50, parent=clip))
    for i, (x, y) in enumerate(((-.31, .22), (.31, .22), (-.31, -.22), (.31, -.22))):
        o = screw(x, y, T, M, 'clip_screw%d' % i); o.parent = clip; out.append(o)
    return out


def box(bm, vs):
    """a box from 8 corners: 0-3 the bottom (or back) loop, 4-7 the top (or front) loop, both counter-clockwise"""
    v = [bm.verts.new(p) for p in vs]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        try: bm.faces.new([v[i] for i in f])
        except ValueError: pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def screw(x, y, z, M, name, flip=False):
    s = -1 if flip else 1; c = (lambda r: circle(r, 12, x, y)[::-1]) if flip else (lambda r: circle(r, 12, x, y))   # reversed: faces still point out
    bm = bmesh.new(); loft(bm, [(c(.03), z), (c(.03), z + s * .014), (c(.021), z + s * .024)], cap1=True)
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
    # the screen 14 thou above the recess floor (D - .012); at .001 it z-fought the shell in game (2026-11-08, user: "clip into
    # the screen holder itself, its like the texture isnt pushed far enough")
    sw = W - 2 * (B + .06); scr = screen(sw, sw, R - B - .06, D + .002, M)
    # a trim band around the sides, tiny grip ridges on the right edge, a status LED on top
    bm = bmesh.new(); loft(bm, [(shape(W, H, R, -.006), D * .42), (shape(W, H, R, -.006), D * .62)]); band = obj('band', bm, [M['trim']], 35)
    parts = [hb, scr, band]
    bm = bmesh.new()
    for i in range(4):
        y = -.18 + i * .12; loft(bm, [(rr(.03, .07, .012, 3, W / 2 + .012, y), D * .66), (rr(.03, .07, .012, 3, W / 2 + .012, y), D * .9)], cap0=True, cap1=True)
    parts.append(obj('grip', bm, [M['rubber']], 40))
    bm = bmesh.new(); loft(bm, [(rr(.16, .02, .008, 3, -.32, H / 2 + .006), D * .7), (rr(.16, .02, .008, 3, -.32, H / 2 + .006), D * .9)], cap0=True, cap1=True)
    led = obj('led', bm, [M['led']], 40); parts.append(led)
    parts += mount(M)
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
    s = screen(sw, sh, .055, D + .024, M); s.location.y = 0; parts.append(s)   # 14 thou above the frame's floor (D + .01): at .002 it z-fought
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
    parts += mount(M)
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

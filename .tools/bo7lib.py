# Shared Blender helpers for the BO7 weapons rebuilt from reference (the Siren; the Grimhawk has its own copy in
# build-grimhawk.py). Modelling happens in the BO1 donor's j_gun space (x forward, y left, z up, inches); parts are
# collected per bone in PARTS and finish() joins, bakes and exports them.
#   import sys; sys.path.insert(0, '.tools'); from bo7lib import *
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

bpy.ops.wm.read_factory_settings(use_empty=True)
COL = bpy.context.scene.collection
PARTS = {}   # bone -> objects; fill it with the gun's bones before modelling
M = {}       # material key -> material (the gun's palette)

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


def plain(name, bm, m, part='j_gun', smooth=35):
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



def export(OUT, RENDER, prefix, baked, tex=2048, frame=(7.5, 0, -0.5), ortho=48):
    """Join each bone's objects, bake the worn materials into one atlas (<prefix>_body), render, export GLB."""
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
    BAKED = {M[k].name for k in baked}
    TEX = tex
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
        im = bpy.data.images.new(prefix + '_' + k, size, size, alpha=False)
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
        bpy.ops.object.bake(type=kind, margin=8, use_clear=True, **kw); print('[bo7] baked', kind)
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
    orm = bpy.data.images.new(prefix + '_orm', TEX // 2, TEX // 2, alpha=False); orm.colorspace_settings.name = 'Non-Color'
    orm.pixels = np.stack([ao[:, 0], ro[:, 0], me[:, 0], np.ones(len(ao), np.float32)], 1).ravel()
    for im in (imgs['col'], imgs['nrm'], orm): im.pack()
    body = bpy.data.materials.new(prefix + '_body'); body.use_nodes = True
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
    for o in objs:   # baked materials -> <prefix>_body; the rest keep theirs
        mats = list(o.data.materials); keep = [m for m in mats if m.name not in BAKED]
        remap = {i: (0 if m.name in BAKED else 1 + keep.index(m)) for i, m in enumerate(mats)}
        idx = [p.material_index for p in o.data.polygons]
        o.data.materials.clear(); o.data.materials.append(body)
        for m in keep: o.data.materials.append(m)
        for p, i in zip(o.data.polygons, idx): p.material_index = remap[i]

    if RENDER:
        os.makedirs(RENDER, exist_ok=True)
        sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
        sc.render.resolution_x, sc.render.resolution_y = 1600, 700
        w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.05, .06, .08, 1)
        for loc, e in (((10, -40, 30), 2500), ((-20, 30, 20), 1200), ((40, 0, 10), 800), ((10, 40, 30), 2500)):
            ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 20
            lo = bpy.data.objects.new('l', ld); lo.location = loc; COL.objects.link(lo)
            lo.rotation_euler = (Vector(frame) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 48
        co = bpy.data.objects.new('c', cam); COL.objects.link(co); sc.camera = co
        for name, loc in (('side', (frame[0], -60, frame[2])), ('left', (frame[0], 60, frame[2])), ('three', (frame[0] + 28, -40, 22))):
            co.location = loc
            co.rotation_euler = (Vector(frame) - Vector(loc)).to_track_quat('-Z', 'Z').to_euler()
            if name != 'three': co.rotation_euler = (math.radians(90), 0, math.radians(0 if name == 'side' else 180))
            cam.ortho_scale = ortho if name != 'three' else ortho * .83
            sc.render.filepath = f'{RENDER}/{prefix}_{name}.png'; bpy.ops.render.render(write_still=True)


    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT',
                              export_image_format='WEBP', export_image_quality=90, export_texcoords=True, export_normals=True)
    print('[bo7] wrote', OUT, {p: len(o) for p, o in PARTS.items()})

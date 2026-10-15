# SCP: Secret Laboratory operators (Melon Pass Season 1): one model per run, in headless Blender.
#   official .blend (Northwood's released human models: PurpleGoop, rigged by DrPri, CC BY-SA 4.0; Rigify rig)
#   Sketchfab .gltf (the game's heavy-armour versions, the game's own skeleton: Hip/SpineMiddle/Chest/Arm/Forearm/...)
# Both end on the game skeleton (Hips, SpineMiddle, Chest, Neck, Head, Shoulder/Arm/Forearm/Hand.L/R, fingers
# index1-3 etc., Thigh/leg/Foot/Toes.L/R), the names bo1-motion.js humanoid() and fp-arms.js find, with the main joint
# first among each bone's children. Meshes are joined into named parts (variant toggles key on them), materials are
# rebuilt opaque (the albedos carry Unity "AlbedoTransparency" alpha, which made the uniform see-through) and the 4K
# textures are halved. Usage (see build_scpsl.sh):
#   blender -b --disable-autoexec <src.blend> -P build_scpsl_blend.py -- <out.glb>
#   blender -b -P build_scpsl_blend.py -- <out.glb> <scene.gltf> [fix-boots]
import bpy, sys, re, os, json, struct
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
out, opts = args[0], set(args[1:])
src = next((a for a in args[1:] if a.endswith('.gltf')), None)
if src:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene

def base_name(n): return re.sub(r'_\d+$', '', n)

# ---- the target skeleton ---------------------------------------------------------------------------------------------
MAIN = ('Hips', 'SpineBottom', 'SpineMiddle', 'Chest', 'Neck', 'Head', 'Shoulder', 'Arm.', 'Forearm.', 'Hand', 'Thigh', 'leg', 'Foot', 'Toes',
        'index', 'middle', 'ring', 'pinky', 'thumb')

def official():
    """Northwood's .blend: the meshes deform by Rigify DEF- bones (the game-named vertex groups are stale leftovers).
    Merge the DEF bones into a plain armature with the game's names."""
    rig = bpy.data.objects['rig']
    # bake everything as saved (the pouches hang off their own one-bone armatures parented to posed rig bones; at REST
    # they floated above the head), and take the skeleton from the same pose
    bpy.context.view_layer.update()
    pose = {b.name: (rig.matrix_world @ b.head, rig.matrix_world @ b.tail) for b in rig.pose.bones}
    def side(s): return s[-2:] if s[-2:] in ('.L', '.R') else ''
    def target(g):
        if not g.startswith('DEF-'):
            return None
        n = g[4:]
        if n.split('.')[0] in ('thigh', 'shin', 'upper_arm', 'forearm'): n = re.sub(r'\.00\d$', '', n)   # Rigify's second limb segment (forearm.L.001)
        sd = side(n); core = n[:-2] if sd else n
        spine = {'spine': 'Hips', 'spine.001': 'SpineBottom', 'spine.002': 'SpineMiddle', 'spine.003': 'Chest', 'spine.004': 'Neck', 'spine.005': 'Neck', 'spine.006': 'Head'}
        if core in spine: return spine[core]
        if core == 'pelvis': return 'Hips'
        m = {'thigh': 'Thigh', 'shin': 'leg', 'foot': 'Foot', 'toe': 'Toes', 'shoulder': 'Shoulder', 'upper_arm': 'Arm', 'forearm': 'Forearm', 'hand': 'Hand'}
        if core in m: return m[core] + sd
        if core.startswith('palm'): return 'Hand' + sd
        f = re.match(r'(?:f_)?(index|middle|ring|pinky|thumb)\.0(\d)', core)
        if f: return f'{f[1]}{f[2]}{sd}'
        return None
    # target joints: head/tail from the DEF bones (merged segments run from the first head to the last tail)
    joints = {}
    for b in rig.data.bones:
        t = target(b.name)
        if not t: continue
        h, tl = pose[b.name]
        if t not in joints: joints[t] = [h, tl, b]
        else:
            j = joints[t]
            if t in ('Hips', 'Hand.L', 'Hand.R', 'Neck'): continue          # keep the first segment's extent
            # a later segment of the same limb: extend the tail
            if (tl - j[0]).length > (j[1] - j[0]).length: j[1] = tl
    parent = {'SpineBottom': 'Hips', 'SpineMiddle': 'SpineBottom', 'Chest': 'SpineMiddle', 'Neck': 'Chest', 'Head': 'Neck'}
    for s in ('.L', '.R'):
        parent.update({'Thigh' + s: 'Hips', 'leg' + s: 'Thigh' + s, 'Foot' + s: 'leg' + s, 'Toes' + s: 'Foot' + s,
                       'Shoulder' + s: 'Chest', 'Arm' + s: 'Shoulder' + s, 'Forearm' + s: 'Arm' + s, 'Hand' + s: 'Forearm' + s})
        for f in ('index', 'middle', 'ring', 'pinky', 'thumb'):
            parent[f'{f}1{s}'] = 'Hand' + s; parent[f'{f}2{s}'] = f'{f}1{s}'; parent[f'{f}3{s}'] = f'{f}2{s}'
    # meshes: rest-pose evaluated copies, weights renamed/merged onto the targets
    keep = []
    for o in list(scene.objects):
        if o.type != 'MESH' or not o.visible_get() or not len(o.data.polygons): continue
        mods = [m for m in o.modifiers if m.type == 'ARMATURE' and m.object]
        if not mods: continue
        arm = mods[0].object
        if arm == rig:
            groups = {g.index: target(g.name) for g in o.vertex_groups}
        else:   # pouch/rope on their own one-bone armature: bind rigidly to the rig bone that armature hangs from
            b = arm.parent_bone and rig.data.bones.get(arm.parent_bone)
            t = None
            while b and not t: t = target(b.name) or target('DEF-' + b.name.replace('ORG-', '')); b = b.parent
            groups = None; rigid = t or 'Chest'
        # bake the deformation as saved (shape keys: none on these models)
        if o.data.users > 1: o.data = o.data.copy()
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            for m in list(o.modifiers):
                if m.type == 'ARMATURE': bpy.ops.object.modifier_apply(modifier=m.name)
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        o.data.transform(mw); o.matrix_world = Matrix()
        weights = [dict() for _ in o.data.vertices]
        for v in o.data.vertices:
            if groups is None: weights[v.index][rigid] = 1.0; continue
            for g in v.groups:
                t = groups.get(g.group)
                if t and g.weight > 0: weights[v.index][t] = weights[v.index].get(t, 0) + g.weight
        o.vertex_groups.clear()
        vg = {}
        for v, w in enumerate(weights):
            s = sum(w.values())
            if not s: w = {'Hips': 1.0}; s = 1
            for t, x in w.items():
                if t not in vg: vg[t] = o.vertex_groups.new(name=t)
                vg[t].add([v], x / s, 'REPLACE')
        keep.append(o)
    # build the armature
    ad = bpy.data.armatures.new('Skeleton'); ao = bpy.data.objects.new('Skeleton', ad); scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for t, (h, tl, b) in joints.items():
        e = ad.edit_bones.new(t); e.head = h; e.tail = tl if (tl - h).length > 1e-4 else h + Vector((0, 0, .01)); eb[t] = e
    for t, e in eb.items():
        p = parent.get(t)
        if p in eb: e.parent = eb[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in keep:
        md = o.modifiers.new('Armature', 'ARMATURE'); md.object = ao; o.parent = ao
    return ao, keep

def sketchfab():
    """A Sketchfab glTF of the game model: strip the _NN suffixes, drop the control bones, rename Hip -> Hips."""
    ao = next(o for o in scene.objects if o.type == 'ARMATURE')
    if ao.animation_data: ao.animation_data.action = None
    for pb in ao.pose.bones: pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    keep = []
    for o in list(scene.objects):
        if o.type != 'MESH': continue
        a = o; bone = None   # rigid armour pieces (visor, shoulder plates) hang off a bone through empties
        while a.parent and not bone:
            if a.parent == ao and a.parent_type == 'BONE': bone = a.parent_bone
            a = a.parent
        if bone and not any(m.type == 'ARMATURE' for m in o.modifiers):
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
            o.vertex_groups.clear(); o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
            o.modifiers.new('Armature', 'ARMATURE').object = ao
        if not o.vertex_groups or not any(m.type == 'ARMATURE' for m in o.modifiers):
            print('drop', o.name); bpy.data.objects.remove(o); continue      # a stray icosphere
        keep.append(o)
    # bake every transform into the data: meshes in world space, the armature at identity
    for o in keep:
        mw = o.matrix_world.copy(); o.parent = None
        if o.data.users > 1: o.data = o.data.copy()
        o.data.transform(mw); o.matrix_world = Matrix()
    mw = ao.matrix_world.copy(); ao.parent = None
    ao.data.transform(mw); ao.matrix_world = Matrix()
    for o in keep:
        for g in o.vertex_groups: g.name = base_name(g.name)
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    ad = ao.data
    for e in ad.edit_bones: e.name = base_name(e.name)
    hips = ad.edit_bones['Hip']; hips.name = 'Hips'
    used = {g.name for o in keep for g in o.vertex_groups}
    for e in list(ad.edit_bones):
        if e.name in ('IKswitch.R', 'IKswitch.L', 'floor', 'Controller', 'HipControl') or (e.name not in used and not e.children_recursive and e.name not in ('Head',)):
            if e.name in ('Hips',): continue
            for c in e.children: c.parent = e.parent
            ad.edit_bones.remove(e)
    ad.edit_bones['Hips'].parent = None
    for e in ad.edit_bones:
        if e.parent is None and e.name != 'Hips': e.parent = ad.edit_bones['Hips']
    # twist bones contain "Arm"; rename so the arm finder can't pick them
    for e in ad.edit_bones:
        if e.name.startswith('ArmTwist'): e.name = e.name.replace('ArmTwist', 'UpperTwist')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in keep:
        for g in o.vertex_groups:
            if g.name == 'Hip': g.name = 'Hips'
            if g.name.startswith('ArmTwist'): g.name = g.name.replace('ArmTwist', 'UpperTwist')
            if g.name == 'neutral_bone': g.name = 'Hips'
    return ao, keep

ao, meshes = sketchfab() if src else official()
for o in list(scene.objects):
    if o != ao and o not in meshes: bpy.data.objects.remove(o, do_unlink=True)

# ---- materials ---------------------------------------------------------------------------------------------------------
def images_of(m):
    # only images with pixels: the Chaos backpack names a normal map missing from the release (it exported as an empty texture)
    return [n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 0] if m and m.use_nodes else []
def pick(ims, *keys, avoid=()):
    for k in keys:
        for i in ims:
            n = i.name.lower()
            if k in n and not any(a in n for a in avoid): return i
    return None
cache = {}
def rebuild(m):
    if m.name in cache: return cache[m.name]
    ims = images_of(m)
    col = pick(ims, 'albedo', 'basecolor', 'base_color', 'diffuse', avoid=('normal',))
    nor = pick(ims, 'normal')
    if not col: return m
    n = bpy.data.materials.new(m.name); n.use_nodes = True; nt = n.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = .8; b.inputs['Metallic'].default_value = 0
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = col; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if nor:
        nor.colorspace_settings.name = 'Non-Color'
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nor; nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    cache[m.name] = n; return n
body_mat = None
for o in meshes:
    for s in o.material_slots:
        if s.material and pick(images_of(s.material), 'body'): body_mat = body_mat or s.material
for o in meshes:
    for s in o.material_slots:
        if not s.material: continue
        if 'fix-boots' in opts and s.material.name == 'body_chaos' and body_mat: s.material = body_mat   # untextured boots
        s.material = rebuild(s.material)
# drop slots no face uses (the official Chaos pieces carry 4 slots, mostly unused)
for o in meshes:
    usedi = {p.material_index for p in o.data.polygons}
    if len(o.material_slots) > 1:
        mats = [s.material for s in o.material_slots]
        keepi = sorted(usedi); remap = {old: new for new, old in enumerate(keepi)}
        for p in o.data.polygons: p.material_index = remap[p.material_index]
        o.data.materials.clear()
        for i in keepi: o.data.materials.append(mats[i])

# ---- parts: join meshes by name into toggleable pieces -----------------------------------------------------------------
PARTS = [('Helmet', r'helmet'), ('Backpack', r'backpack'), ('Pouches', r'pouch|rope|holster|hook|radio|magPouch')]
groups = {}
for o in meshes:
    part = 'Body'
    for name, rx in PARTS:
        if re.search(rx, base_name(o.name) if not src else o.name, re.I): part = name; break
    groups.setdefault(part, []).append(o)
if src:   # the heavy-armour glTFs: one body (no toggles)
    groups = {'Body': meshes}
final = []
for part, objs in groups.items():
    if not objs: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = part; j.data.name = part; final.append(j)
print('PARTS', {o.name: len(o.data.polygons) for o in final})

for im in bpy.data.images:
    if im.size[0] > 2048: im.scale(2048, max(1, im.size[1] * 2048 // im.size[0]))
bpy.ops.object.select_all(action='DESELECT')
ao.select_set(True)
for o in final: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_morph=False, export_animations=False,
                          export_image_format='WEBP', export_image_quality=85, export_yup=True, export_apply=False, use_selection=True)
print('wrote', out)

# main joints first among each bone's children (the rigs walk limbs by first child)
raw = open(out, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]; doc = json.loads(raw[20:20 + n]); rest = raw[20 + n:]
main = lambda i: 0 if doc['nodes'][i].get('name', '').startswith(MAIN) else 1
for nd in doc['nodes']:
    if 'children' in nd: nd['children'].sort(key=main)
j = json.dumps(doc, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546c67, 2, 20 + len(j) + len(rest)) + struct.pack('<II', len(j), 0x4e4f534a) + j + rest)
print('reordered joints')

# Blender (headless) half of .tools/build_mech.sh: RainOnTheMoon's "Animated Mech - Marceline Sentinel Armor (Marcy)"
# (Sketchfab, CC-BY-4.0) as the Pilot class's mech. The game animates it procedurally (mech-model.js), so:
#   - its two clips are dropped; the skeleton is kept (the game turns the bones)
#   - the blade forearms are cut off a little past the elbow (palm, fingers and forearm beyond STUMP): the game mounts the
#     loadout's weapons on the stumps
#   - a cockpit is opened: the lower front of the chest yoke (below the "UNIT 17" brow) and the front of the waist come
#     out, so the seated pilot shows
#   - the two forearm stumps are also copied out as plain meshes (FP_ArmL / FP_ArmR: elbow at the origin, forearm along
#     -Y in Blender = +Z in the game) for the first-person cockpit view
#   - textures: base colour 2048, normal and metal/roughness 1024, WebP
# usage: blender -b -P build_mech_blend.py -- <scene.gltf> <out.glb>
import bpy, sys, mathutils, bmesh
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
STUMP = .17            # forearm kept past the elbow (model units; the whole model is ~1.35 tall)
PELVIS_FRONT = .05     # waist vertices in front of this y (and above z .45) are removed
CHEST_FRONT, CHEST_TOP = .1, 1.0   # chest (ribcage/spine) vertices in front of y and below z are removed

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
if arm.animation_data: arm.animation_data.action = None
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for pb in arm.pose.bones: pb.matrix_basis = mathutils.Matrix()
bpy.context.view_layer.update()
bone_head = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
elbow = {'L': bone_head('MechArmL2_019'), 'R': bone_head('MechArmR2_032')}
palm = {'L': bone_head('MechPalmL_020'), 'R': bone_head('MechPalmR_033')}
print('ELBOW', {k: tuple(round(x, 4) for x in v) for k, v in elbow.items()}, 'PALM', {k: tuple(round(x, 4) for x in v) for k, v in palm.items()})

def dominant(o, v, names, dl):
    w = v[dl]
    return names[max(w.items(), key=lambda x: x[1])[0]] if w else None

fp_parts = {'L': [], 'R': []}   # (mesh object, [vertex indices]) of each forearm stump
# weapon kit: parts of the model the game builds its arm weapons from (same textures as the mech). Left-side copies,
# each centred on its first bone's head; the blade and hand are turned so the forearm runs along -Y (game +Z).
KIT = {'KIT_Hand': ('MechPalmL', 'MechFinger1BaseL', 'MechFinger1MiddleL', 'MechFinger1EndL', 'MechFinger2BaseL', 'MechFinger2MiddleL',
                    'MechFinger2EndL', 'MechFinger3BaseL', 'MechFinger3MiddleL', 'MechFinger3EndL'),
       'KIT_Blade': ('MechArmL2',), 'KIT_Booster': ('MechBoosterL', 'MechBoosterFlapL'), 'KIT_Engine': ('EngineHead',),
       'KIT_EngineCore': ('EngineCenter', 'EngineBase'), 'KIT_KneeCap': ('KneeCapL',), 'KIT_Shoulder': ('MechArmLShoulder',)}
KIT_ALIGN = {'KIT_Hand', 'KIT_Blade'}
kit_parts = {k: [] for k in KIT}
def kit_of(n, p):
    for k, prefixes in KIT.items():
        if any(n.startswith(x + '_') for x in prefixes):
            if k == 'KIT_Blade' and (p - elbow['L']).length <= STUMP: return None
            return k
    return None
kit_origin = {k: bone_head(next(b.name for b in arm.data.bones if b.name.startswith(KIT[k][0] + '_'))) for k in KIT}
kit_origin['KIT_Blade'] = elbow['L'] + (palm['L'] - elbow['L']).normalized() * STUMP
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    if not o.vertex_groups: bpy.data.objects.remove(o); continue
    names = {g.index: g.name for g in o.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(o.data); dl = bm.verts.layers.deform.active; kill = []; keep_fp = {'L': set(), 'R': set()}
    for v in bm.verts:
        n = dominant(o, v, names, dl)
        if not n: continue
        p = o.matrix_world @ v.co
        if 'Palm' in n or 'Finger' in n: kill.append(v); continue
        if 'Arm' in n and '2_' in n:
            s = 'L' if 'ArmL2' in n else 'R'
            if (p - elbow[s]).length > STUMP: kill.append(v)
            else: keep_fp[s].add(v.index)
            continue
        if n.startswith('MechPelvis') and p.y < PELVIS_FRONT and p.z > .45: kill.append(v); continue
        if (n.startswith('MechRibcage') or n.startswith('MechSpine')) and p.y < CHEST_FRONT and p.z < CHEST_TOP: kill.append(v)
    # weapon kit copies
    kv = {k: set() for k in KIT}
    for v in bm.verts:
        n = dominant(o, v, names, dl)
        if n:
            k = kit_of(n, o.matrix_world @ v.co)
            if k: kv[k].add(v.index)
    uvl = bm.loops.layers.uv.active
    for k, idx in kv.items():
        faces = [f for f in bm.faces if all(v.index in idx for v in f.verts)]
        if not faces: continue
        sub = bmesh.new(); vmap = {}; suv = sub.loops.layers.uv.new('UVMap') if uvl else None
        for f in faces:
            vs = []
            for v in f.verts:
                if v.index not in vmap: vmap[v.index] = sub.verts.new(o.matrix_world @ v.co - kit_origin[k])
                vs.append(vmap[v.index])
            try:
                nf = sub.faces.new(vs)
                if uvl:
                    for l, ol in zip(nf.loops, f.loops): l[suv].uv = ol[uvl].uv
            except ValueError: pass
        me = bpy.data.meshes.new(f'{k}_{o.name}'); sub.to_mesh(me); sub.free(); me.materials.append(o.data.materials[0])
        kit_parts[k].append(me)
    # copy the stump faces out before deleting (first-person forearms)
    for s in 'LR':
        if not keep_fp[s]: continue
        faces = [f for f in bm.faces if all(v.index in keep_fp[s] for v in f.verts)]
        if not faces: continue
        sub = bmesh.new(); vmap = {}
        uv = bm.loops.layers.uv.active; suv = sub.loops.layers.uv.new('UVMap') if uv else None
        for f in faces:
            vs = []
            for v in f.verts:
                if v.index not in vmap: vmap[v.index] = sub.verts.new(o.matrix_world @ v.co - elbow[s])
                vs.append(vmap[v.index])
            try:
                nf = sub.faces.new(vs); nf.material_index = 0
                if uv:
                    for l, ol in zip(nf.loops, f.loops): l[suv].uv = ol[uv].uv
            except ValueError: pass
        me = bpy.data.meshes.new(f'FP_Arm{s}_{o.name}'); sub.to_mesh(me); sub.free()
        me.materials.append(o.data.materials[0])
        fp_parts[s].append(me)
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(o.data); bm.free()

# first-person forearms: one object per side (all materials), elbow at the origin, the forearm turned to point down -Y
for s in 'LR':
    if not fp_parts[s]: continue
    objs = []
    for me in fp_parts[s]:
        ob = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(ob); objs.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = f'FP_Arm{s}'
    d = (palm[s] - elbow[s]).normalized()
    q = d.rotation_difference(mathutils.Vector((0, -1, 0)))
    ob.data.transform(q.to_matrix().to_4x4()); ob.data.update()
    ob.location = (0, 0, -5)   # parked out of the way; the game re-parents it

# weapon kit objects (parked under the floor; the game clones them)
for k, mes in kit_parts.items():
    if not mes: continue
    objs = []
    for me in mes:
        ob = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(ob); objs.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = k
    if k in KIT_ALIGN:
        d = (palm['L'] - elbow['L']).normalized(); q = d.rotation_difference(mathutils.Vector((0, -1, 0)))
        ob.data.transform(q.to_matrix().to_4x4()); ob.data.update()
    ob.location = (0, 0, -5)
    print('KIT', k, len(ob.data.vertices), [round(x, 3) for x in ob.dimensions])

# textures
for im in bpy.data.images:
    target = 2048 if 'baseColor' in im.name else 1024
    if im.size[0] > target: im.scale(target, target)

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_animations=False, export_morph=False,
                          export_image_format='WEBP', export_image_quality=82, export_yup=True, export_apply=False,
                          export_tangents=False, use_selection=False)
print('wrote', out)

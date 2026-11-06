# Blender (headless) half of .tools/build_deadlock.sh: Deadlock heroes (Valve; fan rips from the user's uploads) to a
# skinned GLB for the characters mod.  Seven = gigawatt_prisoner, Venator = priest (the game's internal names).
#   - keeps the body meshes, drops held guns, FX meshes, the cloth-sim planes and the scene's rig-control shapes;
#     Venator's slung crossbow is kept as its own mesh (Crossbow) and the two spare UI heads become HeadGritty /
#     HeadPsycho (the Expression variant)
#   - Source 2 skeletons already use the names the game's rigs look for (pelvis, spine_0..3, neck_0, head, clavicle,
#     arm_upper/arm_lower/hand, leg_upper/leg_lower/ankle/ball, finger_*_0..2). Every other bone (twist, cloth,
#     face, gun, finger metacarpals, IK targets: ~240 of them) is merged into its nearest kept ancestor's weights and
#     removed, so the fingers hang straight off the hand and the limbs' first children are the real joints
#   - stands the rig at the origin facing -Y (the rips face +X), the bind pose as the rest pose
#   - drops the inverted-hull outline (SOLIDIFY + "outline" material), applies the weighted-normal modifiers
#   - rebuilds every material as a plain Principled (colour, normal, roughness/metal maps where the rip has them,
#     emissive for Seven's head), textures capped at 2048
# usage: blender -b <hero>.blend -P build_deadlock_blend.py -- <out.glb>
import bpy, sys, re, math
from mathutils import Matrix
out = sys.argv[-1]
C = bpy.context

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and len(o.data.bones) > 50)
hero = 'seven' if arm.name.startswith('gigawatt') else 'venator'
KEEP = {
    'seven': {'outer_costume_gigawatt_prisoner': 'Body', 'shirt_backfaces_gigawatt_prisoner': 'Body',
              'outer_costume_gigawatt_prisoner_head': 'Head'},
    'venator': {'priest_priest_upper_LOD0': 'Body', 'priest_priest_lower_LOD0': 'Body',
                'head_priest_head_v2_LOD0': 'Head', 'head_priest_hair_LOD0': 'Head', 'head_priest_eyes_LOD0': 'Head',
                'head_priest_teeth_LOD0': 'Head', 'head_priest_upper_LOD0': 'Head',
                'head_ui_gritty_priest_head_v2_LOD0': 'HeadGritty', 'head_ui_gritty_priest_hair_LOD0': 'HeadGritty',
                'head_ui_gritty_priest_eyes_LOD0': 'HeadGritty', 'head_ui_gritty_priest_teeth_LOD0': 'HeadGritty',
                'head_ui_psycho_priest_head_v2_LOD0': 'HeadPsycho', 'head_ui_psycho_priest_hair_LOD0': 'HeadPsycho',
                'head_ui_psycho_priest_eyes_LOD0': 'HeadPsycho', 'head_ui_psycho_priest_teeth_LOD0': 'HeadPsycho',
                'priest_priest_gun_crossbow_LOD0': 'Crossbow', 'priest_priest_stake_LOD0': 'Stake'},
}[hero]
for o in list(bpy.data.objects):
    if o is not arm and o.name not in KEEP: bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in [arm] + meshes:   # the spare heads sit in collections excluded from the view layer
    if o.name not in C.view_layer.objects: C.scene.collection.objects.link(o)
    o.hide_set(False); o.hide_viewport = False; o.hide_render = False

# ---- bind pose, facing -Y, at the origin ---------------------------------------------------------------------------
for pb in arm.pose.bones: pb.matrix_basis = Matrix()
R = Matrix.Rotation(-math.pi / 2, 4, 'Z')   # +X (the rips' forward) -> -Y
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = None
    if o.data.shape_keys: o.shape_key_clear()
    o.data.transform(R @ mw); o.matrix_world = Matrix()
arm.data.transform(R @ arm.matrix_world); arm.matrix_world = Matrix()
for o in meshes:
    o.parent = arm; o.matrix_parent_inverse = Matrix()

# Seven's ankle chains hang below his soles in the bind pose (to z -0.18): the game stands a model on its lowest point,
# so they lifted him off the floor. They follow the shins rigidly here, so their links below the floor are laid on it.
for o in meshes:
    names = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices:
        if v.co.z < .01 and v.groups:
            top = max(v.groups, key=lambda g: g.weight)
            if names[top.group].startswith('chain_hang_leg'): v.co.z = .01

# ---- modifiers and outline -----------------------------------------------------------------------------------------
for o in meshes:
    C.view_layer.objects.active = o
    for m in list(o.modifiers):
        if m.type == 'WEIGHTED_NORMAL':
            with C.temp_override(object=o, active_object=o): bpy.ops.object.modifier_apply(modifier=m.name)
        elif m.type != 'ARMATURE': o.modifiers.remove(m)
        else: m.object = arm
    idx = [i for i, s in enumerate(o.material_slots) if s.material and s.material.name.startswith('outline')]
    if idx:
        import bmesh
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in idx], context='FACES'); bm.to_mesh(o.data); bm.free()
        for i in sorted(idx, reverse=True): o.data.materials.pop(index=i)

# ---- skeleton: keep the humanoid joints, merge the rest ------------------------------------------------------------
CORE = re.compile(r'^(pelvis|spine_[0-3]|neck_0|head|clavicle_[LR]|arm_(upper|lower)_[LR]|hand_[LR]|leg_(upper|lower)_[LR]|'
                  r'ankle_[LR]|ball_[LR]|finger_(thumb|index|middle|ring|pinky)_[0-2]_[LR])$')
bones = arm.data.bones
def keeper(b):
    while b and not CORE.match(b.name): b = b.parent
    return b.name if b else 'pelvis'
target = {b.name: keeper(b) for b in bones if not CORE.match(b.name)}
for o in meshes:
    vg = o.vertex_groups
    for t in set(target.values()):
        if t not in vg: vg.new(name=t)
    by_index = {g.index: g.name for g in vg}
    adds = {}
    for v in o.data.vertices:
        for ge in v.groups:
            n = by_index[ge.group]
            if n in target and ge.weight > 0: adds.setdefault((target[n], v.index), 0.0); adds[(target[n], v.index)] += ge.weight
    for (t, vi), w in adds.items(): vg[t].add([vi], w, 'ADD')
    for n in list(target):
        if n in vg: vg.remove(vg[n])
C.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for b in eb:
    if CORE.match(b.name):
        p = b.parent
        while p and not CORE.match(p.name): p = p.parent
        b.parent = p
for n in target: eb.remove(eb[n])
bpy.ops.object.mode_set(mode='OBJECT')
print('BONES', len(arm.data.bones), sorted(b.name for b in arm.data.bones if not b.parent))

# ---- join the parts by name ----------------------------------------------------------------------------------------
parts = {}
for o in meshes: parts.setdefault(KEEP[o.name], []).append(o)
for name, objs in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    C.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    objs[0].name = objs[0].data.name = name

# ---- materials -----------------------------------------------------------------------------------------------------
def img(m, pat):
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and re.search(pat, n.image.name): return n.image
import os
def side_emissive(im):
    """The glTF exporter can't write Seven's head emissive (an "internal error" saving its WebP copy, even reloaded
    from a PNG). It is saved next to the GLB and build_deadlock.sh patches it in (glb_add_texture.py); the material
    carries the white emissive factor it multiplies."""
    if not im: return None
    im.filepath_raw = out.replace('.glb', '_emissive.png'); im.file_format = 'PNG'; im.save(); return True
def simple(name, color, normal=None, rough=None, metal=None, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = .8; b.inputs['Metallic'].default_value = 0
    def tex(im, sock, data=True):
        if data: im.colorspace_settings.name = 'Non-Color'
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; nt.links.new(t.outputs['Color'], sock); return t
    tex(color, b.inputs['Base Color'], False)
    if rough: tex(rough, b.inputs['Roughness'])
    if metal: tex(metal, b.inputs['Metallic'])
    if emit:
        b.inputs['Emission Color'].default_value = (1, 1, 1, 1); b.inputs['Emission Strength'].default_value = 1
    if normal:
        normal.colorspace_settings.name = 'Non-Color'
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = normal; nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    return m
made = {}
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    for s in o.material_slots:
        m = s.material
        if not m: continue
        color = img(m, r'color|_d\.png')
        key = color.name if color else m.name
        if key not in made:
            made[key] = simple(re.sub(r'\.\d+$', '', m.name), color, img(m, r'normal'), img(m, r'rough'),
                               img(m, r'metal|gun_r\.png'), side_emissive(img(m, r'emissive'))) if color else m
        s.material = made[key]
print('MATERIALS', sorted(set(m.name for m in made.values())))
for im in bpy.data.images:
    if im.size[0] > 2048: im.scale(2048, max(1, im.size[1] * 2048 // im.size[0]))

bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_morph=False, export_animations=False,
                          export_image_format='WEBP', export_image_quality=85, export_yup=True, export_apply=False,
                          use_selection=True)
print('PARTS', {o.name: len(o.data.vertices) for o in bpy.data.objects if o.type == 'MESH'})
print('wrote', out)

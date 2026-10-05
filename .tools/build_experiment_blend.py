# Blender (headless) half of .tools/build_experiment.sh: Akittu's "Stylized Experiment V3" avatar (the user's purchased
# VRChat/Resonite avatar, Stylized Experiment V3.zip) to a skinned GLB for the characters mod.
#   - opens the base body (akiexpie_base_3dmouth.blend: body, 3D mouth, ears, tail) and brings in the default clothing
#     (the "Cosmetics - Original" mesh: scarf, bandages) from akiexpie_default_clothing.blend. Both rigs share the
#     body bones at the same rest pose; the clothing's own bones (scarf, bandages) are copied into the body armature
#   - shape keys: "Eye - Eyelash ON" is baked in (the clothed blend has it on); the keys the variants use are kept
#     (body builds, clothing fluff hiding, a few expressions), the other ~90 (visemes, face tracking) are dropped
#   - materials rebuilt as plain ones: base colour x mixed AO (the avatar's own node setup) baked into one image,
#     normal maps kept; textures scaled to 2048 (normals 1024)
#   - the avatar's cosmetics toggles (Poiyomi "UDIM discard": faces are hidden by which 1x1 tile of the second UV set
#     they sit in) become materials: each clothing piece gets its own material, and so does each patch of fur a piece
#     hides (the neck fluff under the scarf, arm and leg fluff under the wraps, the muzzle and mouth under the
#     balaclava), so the variants can hide them by material. Tiles from the avatar's toggle animations.
# usage: blender -b akiexpie_base_3dmouth.blend -P build_experiment_blend.py -- <akiexpie_default_clothing.blend> <out.glb>
import bpy, sys, os
import numpy as np
clothing_blend, out = sys.argv[-2], sys.argv[-1]

KEEP = {'Body - LORE ACCURATE', 'Body - Male Style', 'Body - Emaciated', 'Body - Obese', 'Clothing - Kevlar - No Mags',
        'Eye - Eyelid Closed', 'Eye - Eyelid Glee', 'Angry', 'MouthSmileLeft', 'MouthSmileRight', 'TongueOut',
        'JawOpen', 'EyebrowAngledInL', 'EyebrowAngledInR', 'WideEyeL', 'WideEyeR', 'MouthSadLeft', 'MouthSadRight'}
BAKE = {'Eye - Eyelash ON': 1.0}

# ---- bring in the clothing -------------------------------------------------------------------------------------------
with bpy.data.libraries.load(clothing_blend, link=False) as (src, dst):
    dst.objects = ['Cosmetics - Original', 'Base Clothing Armature']
for o in dst.objects: bpy.context.scene.collection.objects.link(o)
cos, carm = bpy.data.objects['Cosmetics - Original'], bpy.data.objects['Base Clothing Armature']
arm, body = bpy.data.objects['Armature'], bpy.data.objects['Body']

cbones = {b.name: (b.head_local.copy(), b.tail_local.copy(), b.parent.name if b.parent else None) for b in carm.data.bones}
croll = {}
bpy.context.view_layer.objects.active = carm; bpy.ops.object.mode_set(mode='EDIT')
for b in carm.data.edit_bones: croll[b.name] = b.roll
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
added = [n for n in cbones if n not in eb]
for n in added:
    b = eb.new(n); b.head, b.tail = cbones[n][0], cbones[n][1]; b.roll = croll[n]
for n in added:
    p = cbones[n][2]
    if p: eb[n].parent = eb[p]
bpy.ops.object.mode_set(mode='OBJECT')
print('clothing bones added:', len(added))
for m in cos.modifiers:
    if m.type == 'ARMATURE': m.object = arm
cos.parent = arm
bpy.data.objects.remove(carm, do_unlink=True)

# ---- shape keys ------------------------------------------------------------------------------------------------------
def shape_keys(o, keep, bake):
    ks = o.data.shape_keys
    if not ks: return
    blocks = ks.key_blocks; basis = blocks[0]; n = len(o.data.vertices)
    base = np.empty(n * 3, 'f'); basis.data.foreach_get('co', base)
    for name, v in bake.items():
        k = blocks.get(name)
        if not k: continue
        co = np.empty(n * 3, 'f'); k.data.foreach_get('co', co); delta = (co - base) * v
        for kb in blocks:   # move every key by the delta, so the others stay relative to the new basis
            c = np.empty(n * 3, 'f'); kb.data.foreach_get('co', c); kb.data.foreach_set('co', c + delta)
        base += delta
    for kb in list(blocks)[1:]:
        if kb.name not in keep: o.shape_key_remove(kb)
    for kb in o.data.shape_keys.key_blocks: kb.value = 0
    print(o.name, 'keys:', [k.name for k in o.data.shape_keys.key_blocks][1:])
shape_keys(body, KEEP, BAKE)
shape_keys(cos, KEEP, {})

# ---- materials -------------------------------------------------------------------------------------------------------
def pixels(img, size):
    im = img.copy()
    if im.size[0] != size: im.scale(size, size)
    a = np.empty(size * size * 4, 'f'); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(-1, 4)

def multiply(name, color, ao, size=2048):
    c, a = pixels(color, size), pixels(ao, size)
    c[:, :3] *= a[:, :3]
    im = bpy.data.images.new(name, size, size, alpha=False); im.pixels.foreach_set(c.ravel()); im.pack()
    return im

def scaled(img, size):
    im = img.copy(); im.name = img.name.split('.png')[0] + '_s'
    if im.size[0] > size: im.scale(size, size)
    im.pack(); return im

def material(name, color, normal=None, rough=.8, alpha=None, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = rough
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = color; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if emission:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emission
    if alpha:
        nt.links.new(t.outputs['Alpha'], b.inputs['Alpha']); m.blend_method = alpha
    if normal:
        normal.colorspace_settings.name = 'Non-Color'
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = normal; nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    return m

I = bpy.data.images
ao_body = I['Body_Mixed_AO.png']; ao_body.colorspace_settings.name = 'Non-Color'
body_mat = material('Experiment', multiply('experiment_body', I['Body_Base_color.png'], ao_body), scaled(I['Body_Normal_OpenGL.png'], 1024))
eyes_mat = material('ExperimentEyes', scaled(I['Akittu Experiment - Eyes - Puppy Eye Emote - With Sparkle 2.png'], 1024), rough=.2, emission=.5)
mouth_mat = material('ExperimentMouth', scaled(I['Mouth_Base_color.png'], 1024), rough=.6)
body.data.materials[0] = body_mat; body.data.materials[1] = eyes_mat; body.data.materials[2] = mouth_mat

ao_cos = I['Cosmetics_Mixed_AO.png.001']; ao_cos.colorspace_settings.name = 'Non-Color'
cos_mat = material('ExperimentClothing', multiply('experiment_clothing', I['Cosmetics_Base_color.png.003'], ao_cos),
                   scaled(I['Cosmetics_Normal_OpenGL.png.001'], 1024), rough=.7)
cos.name = 'Clothing'

# ---- cosmetics toggles: UDIM tiles (u, v) of the second UV set -> materials ------------------------------------------
def tile(o, p):
    uv = o.data.uv_layers[-1].data; n = p.loop_total
    return (int(sum(uv[i].uv[0] for i in p.loop_indices) / n // 1), int(sum(uv[i].uv[1] for i in p.loop_indices) / n // 1))
def split(o, groups, base):
    """groups: {material: [tiles]}; faces of material index `base` in those tiles move to a copy of it"""
    slot = {}
    for name, tiles in groups.items():
        m = o.data.materials[base].copy(); m.name = name; o.data.materials.append(m); slot[name] = len(o.data.materials) - 1
    counts = {}
    for p in o.data.polygons:
        if p.material_index != base: continue
        t = tile(o, p)
        for name, tiles in groups.items():
            if t in tiles: p.material_index = slot[name]; counts[name] = counts.get(name, 0) + 1
    print(o.name, 'split:', counts)
# the clothing mesh: every piece is its own tile
cos.data.materials.clear(); cos.data.materials.append(cos_mat)
for p in cos.data.polygons: p.material_index = 0
split(cos, {'ClothPouch': [(2, 0)], 'ClothScarf': [(2, 1)], 'ClothKevlar': [(2, 2)], 'ClothArmWraps': [(1, 2)],
            'ClothLegWraps': [(1, 3)], 'ClothBalaclava': [(2, 3)]}, 0)
# fur the pieces hide (scarf: Row0_2; arm wraps: Row1_0, Row1_2; leg wraps: Row1_1, Row3_2; balaclava: Row0_1)
split(body, {'FurNeck': [(2, 0)], 'FurArms': [(0, 1), (2, 1)], 'FurLegs': [(1, 1), (2, 3)], 'FurMuzzle': [(1, 0)]}, 0)
split(body, {'ExperimentMouthMuzzle': [(1, 0)]}, 2)

# only one UV set and no vertex colours (three's material would expect COLOR_0; extra sets bloat the GLB)
for o in (body, cos):
    while len(o.data.uv_layers) > 1: o.data.uv_layers.remove(o.data.uv_layers[-1])
    while len(o.data.color_attributes): o.data.color_attributes.remove(o.data.color_attributes[0])

for o in list(bpy.data.objects):
    if o not in (arm, body, cos): bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_morph=True, export_morph_normal=False,
                          export_animations=False, export_image_format='WEBP', export_image_quality=85, export_yup=True,
                          export_apply=False, use_selection=False)
print('wrote', out)

# The rigs walk a limb by each bone's first child, and the copied clothing bones came first under the elbows (the
# forearm wraps' "bandage" bones): first-person arms took a bandage bone for the hand and found no fingers. Put the
# body skeleton's own bones first.
import json, struct
raw = open(out, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]; doc = json.loads(raw[20:20+n]); rest = raw[20+n:]
late = set(added)
for nd in doc['nodes']:
    if 'children' in nd: nd['children'].sort(key=lambda i: doc['nodes'][i].get('name', '') in late)
j = json.dumps(doc, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546c67, 2, 20+len(j)+len(rest)) + struct.pack('<II', len(j), 0x4e4f534a) + j + rest)
print('reordered joints')

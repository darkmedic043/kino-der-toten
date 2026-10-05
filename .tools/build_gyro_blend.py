# Blender (headless) half of .tools/build_gyro.sh: Gyro Zeppeli (JoJo SBR; a fan rip of a Steam Workshop model, from the
# user's JojoSBR-GyroZeppeli-3DModel.zip) to a skinned GLB for the characters mod.
#   - drops the scene props (grass cards, the SMD bone-display mesh)
#   - Source bones get the names the game's rigs look for: a Hips bone is added as the parent of the spine and both legs
#     (the rip has none: spine and legs were separate roots); bip_hip -> Thigh, bip_collar -> Shoulder, bip_head -> Head;
#     its sleeve helpers ("7jir01t0 l arm bone04") become "sleeve" bones
#   - the body's 16 Cycles materials (texture mixes, hue shifts, metal masks over one UV atlas) are baked to one colour
#     atlas (Cycles DIFFUSE colour, metallic forced to 0 first so metal parts keep their colour); the body, hat and
#     beard then share one material with that atlas and the rip's normal map. Eyes and lashes keep simple materials.
# usage: blender -b GyroZeppeli.blend -P build_gyro_blend.py -- <out.glb>
import bpy, sys, os
out = sys.argv[-1]
scene = bpy.context.scene

for o in list(bpy.data.objects):
    if o.type == 'MESH' and (o.name.startswith('_') or o.name == 'smd_bone_vis'):
        bpy.data.objects.remove(o, do_unlink=True)

# ---- bones -------------------------------------------------------------------------------------------------------
arm = bpy.data.objects['GyroZeppeli']
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
spine, hl, hr = eb['bip_spine_0'], eb['bip_hip_L'], eb['bip_hip_R']
hips = eb.new('Hips')
hips.head = (hl.head + hr.head) / 2
hips.head.z = spine.head.z
hips.tail = hips.head.copy(); hips.tail.z += (spine.tail - spine.head).length * .5
for b in (spine, hl, hr): b.parent = hips
bpy.ops.object.mode_set(mode='OBJECT')
for old, new in {'bip_hip_L': 'Thigh_L', 'bip_hip_R': 'Thigh_R', 'bip_collar_L': 'Shoulder_L', 'bip_collar_R': 'Shoulder_R', 'bip_head': 'Head'}.items():
    arm.data.bones[old].name = new   # vertex groups follow the rename
# sleeve-twist helpers named "... arm bone04": the rigs look for arm bones by name and took these (further out than the
# real arm) as the arm chain
for b in arm.data.bones:
    if b.name.startswith('7jir') and ' arm ' in b.name: b.name = b.name.replace(' arm ', ' sleeve ')

# ---- bake the body atlas ------------------------------------------------------------------------------------------
body, hat = bpy.data.objects['MainBody'], bpy.data.objects['Hat']
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'CUDA'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'CUDA'
    scene.cycles.device = 'GPU'
except Exception as e:
    print('bake on CPU:', e)
scene.cycles.samples = 16
atlas = bpy.data.images.new('gyro_atlas', 2048, 1024, alpha=False)
for o in (body, hat):
    for m in o.data.materials:
        if not m or not m.use_nodes: continue
        nt = m.node_tree
        for n in nt.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for k in ('Metallic', 'Transmission Weight'):
                    s = n.inputs.get(k)
                    if s:
                        for l in list(s.links): nt.links.remove(l)
                        s.default_value = 0
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = atlas
        for n in nt.nodes: n.select = False
        t.select = True; nt.nodes.active = t
bpy.ops.object.select_all(action='DESELECT')
for o in (body, hat): o.select_set(True)
bpy.context.view_layer.objects.active = body
scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = True
scene.render.bake.margin = 8
bpy.ops.object.bake(type='DIFFUSE')
atlas.filepath_raw = os.path.join(os.path.dirname(out), 'gyro_atlas.png'); atlas.file_format = 'PNG'; atlas.save(); atlas.pack()

def simple(name, color, normal=None, alpha=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = .75
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = color; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if alpha: nt.links.new(t.outputs['Alpha'], b.inputs['Alpha']); m.blend_method = 'CLIP'
    if normal:
        normal.colorspace_settings.name = 'Non-Color'
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = normal; nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = .6
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    return m

skin = simple('Gyro', atlas, bpy.data.images.get('bodygn3.png'))
for o in (body, hat):
    o.data.materials.clear(); o.data.materials.append(skin)
    for p in o.data.polygons: p.material_index = 0
eyes = simple('GyroEyes', bpy.data.images['eye2.png'])
for n in ('EyeL', 'EyeR'):
    o = bpy.data.objects[n]; o.data.materials.clear(); o.data.materials.append(eyes)
lashes = bpy.data.objects.get('Lashes')
if lashes:
    lashes.data.materials.clear(); lashes.data.materials.append(simple('GyroLashes', bpy.data.images['bodygd3.3US.png'], alpha=True))

# images the GLB keeps: shrink the big ones
for im in bpy.data.images:
    if im.size[0] > 2048: im.scale(2048, max(1, im.size[1] * 2048 // im.size[0]))

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_morph=False, export_animations=False,
                          export_image_format='WEBP', export_image_quality=85, export_yup=True, export_apply=False, use_selection=False)
print('wrote', out)

# The rigs walk a limb by each bone's first child; the rip lists its sleeve/face helpers before the real joints (the
# upper arm's first child was a sleeve bone, so no arm chain was found). Put the skeleton's own bones first.
import json, struct
raw = open(out, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]; doc = json.loads(raw[20:20+n]); rest = raw[20+n:]
main = lambda i: 0 if doc['nodes'][i].get('name', '').startswith(('bip_', 'Hips', 'Thigh', 'Shoulder', 'Head')) else 1
for nd in doc['nodes']:
    if 'children' in nd: nd['children'].sort(key=main)
j = json.dumps(doc, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546c67, 2, 20+len(j)+len(rest)) + struct.pack('<II', len(j), 0x4e4f534a) + j + rest)
print('reordered joints')

# Blender (headless) half of .tools/build_bondrewd.sh: imports Bunny Squad's Bondrewd FBX,
# rebuilds its three materials from the package textures (the FBX names files that aren't in
# it) and exports a skinned GLB with only the shape keys the customisation menu uses
# (characters.json `variants`; no animations, the game animates it).
import bpy, sys, os
fbx, tex, out = sys.argv[-3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
SETS = {'Body': ('Science_difl_Base', 'Science_norml_Base', 'Science_EMISl_Base'),
        'Helmet': ('Helmet_dif_Base', 'Helmet_normal_Base', 'Helmet_EMIS_Base'),
        'Metal': ('Metal_dif_Base', 'Metal_Norm_Base', None)}
def img(name, colour=True):
    p = os.path.join(tex, name+'.png'); im = bpy.data.images.load(p); im.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'; return im
for m in bpy.data.materials:
    key = next((k for k in SETS if m.name.startswith(k)), None)
    if not key: continue
    dif, nrm, emis = SETS[key]; m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = .7 if key != 'Metal' else .45; b.inputs['Metallic'].default_value = .0 if key != 'Metal' else .6
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(dif); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if nrm:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img(nrm, False); nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    if emis:
        e = nt.nodes.new('ShaderNodeTexImage'); e.image = img(emis); nt.links.new(e.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 1
# Shape keys behind the original avatar's toggles (gauntlets, paper eyes and their expressions,
# pockets, boots) plus the long coat and bulky build; the rest (visemes etc.) are dropped.
KEEP = {'Gauntlet_Off', 'Manga_Pocket', 'Anime_Pocket', 'Boots_Manga', 'Jacket_Long', 'Bulky'}
KEEP |= {f'Eye_{e}_{s}' for e in ('Paper','Happy','Angry','Sad','Suprise','Smort','Annoyed','Dead','Squint') for s in 'LR'} | {'Blink_L','Blink_R'}
for o in bpy.data.objects:
    keys = o.type == 'MESH' and o.data.shape_keys
    if not keys: continue
    bpy.context.view_layer.objects.active = o
    for k in list(keys.key_blocks)[1:]:
        if k.name in KEEP: k.value = 0
        else: o.shape_key_remove(k)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_morph=True, export_morph_normal=False, export_animations=False,
                          export_image_format='WEBP', export_image_quality=85, export_yup=True, export_apply=False)
# The avatar's materials are double-sided (Poiyomi _Cull 0): coat lining and panels seen from behind.
import json, struct
raw = open(out, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]; doc = json.loads(raw[20:20+n]); rest = raw[20+n:]
for m in doc['materials']: m['doubleSided'] = True
j = json.dumps(doc, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546c67, 2, 20+len(j)+len(rest)) + struct.pack('<II', len(j), 0x4e4f534a) + j + rest)

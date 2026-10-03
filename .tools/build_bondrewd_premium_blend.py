# Blender (headless) half of .tools/build_bondrewd_premium.sh: imports the Premium Bondrewd FBX,
# rebuilds its materials from the package textures (Poiyomi shaders don't survive), drops the
# particle-effect faces, keeps the shape keys the customisation menu uses and exports a GLB.
import bpy, bmesh, sys, os
fbx, tex, out = sys.argv[-3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
SETS = {'Body': ('Science_dif', 'Science_norm', 'Science_EMIS'),
        'Metal': ('Metal_dif', 'Metal_Norm', 'Metal_Emis'),
        'Transform': ('Transform_dif', 'Transform_normal', 'Transform_EMIS')}
def img(name, colour=True):
    im = bpy.data.images.load(os.path.join(tex, name+'.png')); im.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'; return im
for m in bpy.data.materials:
    key = next((k for k in SETS if m.name.startswith(k)), None)
    if not key: continue
    dif, nrm, emis = SETS[key]; m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = .45 if key == 'Metal' else .7; b.inputs['Metallic'].default_value = .6 if key == 'Metal' else 0
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(dif); nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = img(nrm, False); nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    e = nt.nodes.new('ShaderNodeTexImage'); e.image = img(emis); nt.links.new(e.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 1
# Particle cards (Gangway/SFX quads) are effects, not geometry.
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    bad = [i for i, s in enumerate(o.material_slots) if s.material and s.material.name.startswith('Particles')]
    if not bad: continue
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in bad], context='FACES')
    bm.to_mesh(o.data); bm.free()
    for i in sorted(bad, reverse=True): o.active_material_index = i; bpy.context.view_layer.objects.active = o; bpy.ops.object.material_slot_remove()
KEEP = {'ScienceSuit','Manga_Pocket','Anime_Pocket','Bulky','Puff','Boots_Manga','Boots_Combat','Boots_Combat_Manga','ClawFoot1','ClawFoot2',
        'Jacket_Long','ClawGrowth1L','ClawGrowth2L','ClawGrowth1R','ClawGrowth2R','TailCut','ClawShrinkL','ClawShrinkR','Tail_Out',
        'Eye_Noodles_Out','Eye_Noodles_Bend1','Eye_Noodles_Bend2','Eye_Noodles_Bend3','Horn_out','Gangway_Ripped','Ears','Mask_Damage1','Mask_Damage2','Fluff_Out',
        'CombatSuit','Curse_Dart_Launcher','Gauntlet_Off','unHide_Sparagmus','Tank Combat','Blink_L','Blink_R'}
KEEP |= {f'Eye_{e}_{s}' for e in ('Paper','Happy','Angry','Sad','Suprise','Smort','Annoyed','Dead','Squint') for s in 'LR'}
for o in bpy.data.objects:
    keys = o.type == 'MESH' and o.data.shape_keys
    if not keys: continue
    bpy.context.view_layer.objects.active = o
    for k in list(keys.key_blocks)[1:]:
        if k.name in KEEP: k.value = 0
        else: o.shape_key_remove(k)
# Poiyomi keeps masks in extra UV and colour sets; the game only reads the first UV set, and a
# colour set three doesn't get in first person rendered the fur black.
for o in bpy.data.objects:
    if o.type == 'MESH':
        while len(o.data.uv_layers) > 1: o.data.uv_layers.remove(o.data.uv_layers[-1])
        for a in list(o.data.color_attributes): o.data.color_attributes.remove(a)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_morph=True, export_morph_normal=False, export_vertex_color='NONE', export_animations=False,
                          export_image_format='WEBP', export_image_quality=85, export_yup=True, export_apply=False)
# Poiyomi cutout: the diffuse alpha clips (the coat lining, fur cards), at the avatar's cutoffs.
import json, struct
CUT = {'Body': .4, 'Metal': .475, 'Transform': .5}
raw = open(out, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]; doc = json.loads(raw[20:20+n]); rest = raw[20+n:]
for m in doc['materials']:
    if m['name'] in CUT: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = CUT[m['name']]
    m['doubleSided'] = True   # Poiyomi _Cull 0: fur and claw cards, coat lining vanished from behind (knife swings)
j = json.dumps(doc, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546c67, 2, 20+len(j)+len(rest)) + struct.pack('<II', len(j), 0x4e4f534a) + j + rest)

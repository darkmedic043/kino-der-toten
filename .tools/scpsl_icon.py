# Operator icon for the SCP:SL operators: head-and-shoulders, 3/4 view, transparent, 256 px WebP. Prints the model's height.
#   blender -b -P scpsl_icon.py -- <model.glb> <icon.webp>
import bpy, sys, math
from mathutils import Vector
glb, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get(); pts = []
for o in sc.objects:
    if o.type == 'MESH' and o.name != 'Icosphere':   # the glTF importer's bone-shape sphere
        e = o.evaluated_get(dg); m = e.to_mesh(); pts += [e.matrix_world @ v.co for v in m.vertices]; e.to_mesh_clear()
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)]); h = hi.z - lo.z
print('HEIGHT', round(h, 4), 'WIDTH', round(hi.x - lo.x, 4), 'DEPTH', round(hi.y - lo.y, 4))
head = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z - h * .13))
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = h * .36
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
a = math.radians(-30); d = Vector((math.sin(a), -math.cos(a), .12)).normalized()
co.location = head + d * h * 3; co.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
for (rx, rz, e) in ((50, -40, 3.5), (70, 150, 2.0)):
    l = bpy.data.lights.new('l', 'SUN'); l.energy = e; lo_ = bpy.data.objects.new('l', l); lo_.rotation_euler = (math.radians(rx), 0, math.radians(rz)); sc.collection.objects.link(lo_)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = .6
sc.render.engine = 'BLENDER_EEVEE'; sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 256
sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.quality = 90
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('icon', out)

# The Iron Man armors as playable characters (fork): Cheese Cube's suit meshes (ENT_mk1/4/5/6, ENT_wm_model; static
# A-posed meshes from the map's mod files) cut out of the built map, stood upright at the origin facing forward, given a
# humanoid skeleton named the way the characters mod's BO1 motion looks for bones (Hips, Spine, Neck, Head, Shoulder,
# UpperArm, Forearm, Hand, Thigh, Shin, Foot, Toe), skinned by distance to the bones (hard-surface armor in many loose
# pieces defeats Blender's heat weighting), and exported as one GLB per suit.
#   blender -b -P .tools/build-armor-characters.py -- <map.glb> <out dir>
# Output (git-ignored; derived from the map's assets): <out>/armor_<id>.glb
import bpy, bmesh, sys, math, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
MAP, OUT = argv[0], argv[1]
SUITS = {'mk1': 'ENT_mk1', 'mk4': 'ENT_mk4', 'mk5': 'ENT_mk5', 'mk6': 'ENT_mk6', 'wm': 'ENT_wm_model'}
os.makedirs(OUT, exist_ok=True)


def verts_world(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]


def facing_yaw(ws):
    """The suit's forward heading: soles reach further forward (toes) than the shins' line, then refined by left/right
    mirror symmetry within ±30° of that."""
    z0 = min(v.z for v in ws)
    c = lambda L: sum(L, Vector()) / len(L)
    sole, shin = [v for v in ws if v.z < z0 + 2.5], [v for v in ws if z0 + 12 < v.z < z0 + 16]
    d = c(sole) - c(shin)
    base = math.atan2(d.y, d.x)
    cen = c(ws)
    sample = ws[::max(1, len(ws) // 3000)]

    def asym(a):   # lateral coordinate histogram vs its mirror
        side = Vector((-math.sin(a), math.cos(a), 0))
        bins = [0] * 40
        for v in sample:
            s = (v - cen).dot(side); h = int(v.z - z0) // 4
            k = int((s + 20) / 1)
            if 0 <= k < 40: bins[k] += 1 + h * 0
        return sum(abs(bins[i] - bins[39 - i]) for i in range(20))
    best = min((asym(base + math.radians(t)), base + math.radians(t)) for t in range(-30, 31, 2))[1]
    return best


def build(sid, src):
    # ---- a clean copy, upright at the origin, facing Blender -Y (glTF +Z); its left is +X
    me = src.data.copy(); o = bpy.data.objects.new('armor_' + sid, me); bpy.context.scene.collection.objects.link(o)
    me.transform(src.matrix_world)
    ws = [v.co.copy() for v in me.vertices]
    yaw = facing_yaw(ws)
    z0 = min(v.z for v in ws)
    sole = [v for v in ws if v.z < z0 + 2.5]; foot = sum(sole, Vector()) / len(sole)
    me.transform(Matrix.Translation((-foot.x, -foot.y, -z0)))
    me.transform(Matrix.Rotation(-math.pi / 2 - yaw, 4, 'Z'))
    me.update()
    vs = [v.co for v in me.vertices]; H = max(v.z for v in vs)
    # ---- landmarks from the mesh
    band = lambda lo, hi: [v for v in vs if lo * H < v.z < hi * H]
    hip_w = max(abs(v.x) for v in band(.40, .46)) * .45
    arms = {}
    for s in (1, -1):
        side = [v for v in band(.33, .64) if v.x * s > 0]
        far = sorted(side, key=lambda v: -abs(v.x))[:max(8, len(side) // 40)]
        hand = sum(far, Vector()) / len(far)
        sh = Vector((s * .17 * H, 0, .80 * H))
        # shoulder x from the mesh: half the width just under the armpits
        sh.x = s * max(abs(v.x) for v in band(.74, .78)) * .78
        wrist = hand + (sh - hand).normalized() * .045 * H
        elbow = (sh + wrist) / 2 + Vector((0, .02 * H, 0))   # elbows bend back a touch
        arms[s] = (sh, elbow, wrist, hand + (hand - sh).normalized() * .04 * H)
    # ---- the skeleton
    ad = bpy.data.armatures.new('rig_' + sid); rig = bpy.data.objects.new('rig_' + sid, ad); bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT'); eb = ad.edit_bones
    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name); b.head = head; b.tail = tail
        if parent: b.parent = eb[parent]; b.use_connect = connect
        return b
    P = lambda x, y, z: Vector((x, y, z))
    bone('Hips', P(0, 0, .52 * H), P(0, 0, .58 * H))
    bone('Spine', P(0, 0, .58 * H), P(0, 0, .68 * H), 'Hips', True)
    bone('Spine1', P(0, 0, .68 * H), P(0, 0, .79 * H), 'Spine', True)
    bone('Neck', P(0, 0, .82 * H), P(0, 0, .865 * H), 'Spine1')
    bone('Head', P(0, 0, .865 * H), P(0, 0, H), 'Neck', True)
    for s, sfx in ((1, 'L'), (-1, 'R')):
        sh, el, wr, tip = arms[s]
        bone('Shoulder_' + sfx, P(s * .03 * H, 0, .79 * H), sh, 'Spine1')
        bone('UpperArm_' + sfx, sh, el, 'Shoulder_' + sfx, True)
        bone('Forearm_' + sfx, el, wr, 'UpperArm_' + sfx, True)
        bone('Hand_' + sfx, wr, tip, 'Forearm_' + sfx, True)
        x = s * hip_w
        bone('Thigh_' + sfx, P(x, 0, .50 * H), P(x, .005 * H, .27 * H), 'Hips')
        bone('Shin_' + sfx, P(x, .005 * H, .27 * H), P(x, .02 * H, .05 * H), 'Thigh_' + sfx, True)
        bone('Foot_' + sfx, P(x, .02 * H, .05 * H), P(x, -.08 * H, .015 * H), 'Shin_' + sfx, True)
        bone('Toe_' + sfx, P(x, -.08 * H, .015 * H), P(x, -.12 * H, .01 * H), 'Foot_' + sfx, True)
    segs = {b.name: (b.head.copy(), b.tail.copy()) for b in eb}
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---- skinning: the two nearest bones by distance to their segment, inverse-distance weights
    groups = {n: o.vertex_groups.new(name=n) for n in segs}
    def seg_dist(p, a, b):
        ab = b - a; t = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-9))); return (p - (a + ab * t)).length
    skip = {'Hips'}   # the hips bone only parents; the pelvis goes with the spine/thighs
    for v in me.vertices:
        p = v.co
        # keep each side's limbs to its own side
        ds = sorted((seg_dist(p, *segs[n]) + (6 if (n.endswith('_L') and p.x < -.5) or (n.endswith('_R') and p.x > .5) else 0), n) for n in segs if n not in skip)
        (d1, n1), (d2, n2) = ds[0], ds[1]
        w1, w2 = 1 / (d1 + .3) ** 4, 1 / (d2 + .3) ** 4; t = w1 + w2
        groups[n1].add([v.index], w1 / t, 'REPLACE')
        if w2 / t > .08: groups[n2].add([v.index], w2 / t, 'REPLACE')
    o.parent = rig
    mod = o.modifiers.new('rig', 'ARMATURE'); mod.object = rig
    # ---- export just this suit
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); rig.select_set(True)
    path = os.path.join(OUT, f'armor_{sid}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_skins=True, export_animations=False,
                              export_image_format='WEBP', export_image_quality=88, export_yup=True, export_apply=False)
    print('[armor]', sid, 'height', round(H, 1), 'yaw', round(math.degrees(yaw)), '->', path, os.path.getsize(path) // 1024, 'KB')
    bpy.data.objects.remove(o); bpy.data.objects.remove(rig)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=MAP)
srcs = {sid: bpy.data.objects.get(n) for sid, n in SUITS.items()}
for o in list(bpy.data.objects):
    if o not in srcs.values(): bpy.data.objects.remove(o, do_unlink=True)
for sid, src in srcs.items():
    if src: build(sid, src)

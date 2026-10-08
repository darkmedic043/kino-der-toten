#!/usr/bin/env python3
"""Builds a custom zombies map (export/web/mods/maps/<id>/, see mods/README.md) from a Black Ops III map dumped by
.tools/bo3_dump_map.py, with textures and props exported by Greyhound (BO3 running under Proton; see
docs/fork/waw-ports.md, "Black Ops III maps").

  blender -b -P .tools/build_bo3_map.py -- <bsp name> <map id> [--tex 1024] [--normal-tex 512] [--prop-tex 512]

(Blender only for its Python with numpy; no scene is built.) Output:
  <id>.glb   the level geometry split by material and 1024-unit cell, the props as EXT_mesh_gpu_instancing nodes (one
             mesh per prop model, instances grouped per 2048-unit cell so they still get culled), a COL_world mesh
             (solid level geometry inside the playable area: CustomWorld builds collision and the navmesh from COL_
             meshes only) and the gameplay markers from the map's entity list
  tex/       WebP textures (external, so the browser caches them one by one)
CoD inches, Z up -> glTF Y up: (x, y, z) -> (x, z, -y). Ripped game data: the map folder is git-ignored.
"""
import json, math, os, re, struct, subprocess, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
BSP, MAP_ID = argv[0], argv[1]
opt = lambda k, d: int(argv[argv.index(k) + 1]) if k in argv else d
TEX, NORMAL_TEX, PROP_TEX = opt('--tex', 1024), opt('--normal-tex', 512), opt('--prop-tex', 512)
CM = 1 / 2.54   # Greyhound writes models in centimetres; the map (and the game) is in inches
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'export_game', 'bo3', 'maps', BSP)
GH = '/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3'
OUT = os.path.join(ROOT, 'export', 'web', 'mods', 'maps', MAP_ID)
os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
open(os.path.join(OUT, '.gitignore'), 'w').write('*\n')
sys.path.insert(0, os.path.join(ROOT, '.tools'))
from semodel_to_glb import read_semodel

C = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float64)   # CoD -> glTF axes
def g(v): return (C @ np.asarray(v, dtype=np.float64).T).T
COLOR, NORMAL = 'a0ab1041', '59d30d0f'
SKIP = re.compile(r'sky|caulk|clip|portal|nodraw|shadow_?caster|\$', re.I)              # not drawn
NOT_SOLID = re.compile(r'decal|glass|water|foliage|grass|cobweb|web_|fx_|_fx|blend|vista|light_?ray|godray|smoke|fog|ivy|leaves|vine|cloth|curtain', re.I)

# ---- textures ----------------------------------------------------------------------------------------------------------
textures = {}   # image name -> {uri, alpha}
def texture(name, size):
    name = (name or '').split('\\')[-1].split('/')[-1].replace('.png', '')
    if not name or name.startswith('$'): return None
    key = (name, size)
    if key in textures: return textures[key]
    src = os.path.join(GH, 'ximages', name + '.png')
    if not os.path.exists(src): textures[key] = None; print('  missing texture', name); return None
    with open(src, 'rb') as f: head = f.read(32)
    alpha = head[25] in (4, 6)   # PNG colour type with alpha
    uri = f'tex/{name}_{size}.webp'
    dst = os.path.join(OUT, uri)
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-vf', f"scale='min({size},iw)':'min({size},ih)':force_original_aspect_ratio=decrease",
                        '-c:v', 'libwebp', '-quality', '82', *(['-pix_fmt', 'yuva420p'] if alpha else []), dst], check=True)
    textures[key] = {'uri': uri, 'alpha': alpha}
    return textures[key]

# ---- glTF writer (numpy buffers, external images) -------------------------------------------------------------------------
gltf = {'asset': {'version': '2.0', 'generator': 'build_bo3_map.py'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
        'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
        'accessors': [], 'bufferViews': [], 'buffers': [], 'extensionsUsed': ['EXT_texture_webp', 'EXT_mesh_gpu_instancing']}
blob = bytearray()
def add_buffer(arr, target=None):
    data = np.ascontiguousarray(arr).tobytes()
    while len(blob) % 4: blob.append(0)
    view = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
    if target: view['target'] = target
    blob.extend(data); gltf['bufferViews'].append(view)
    return len(gltf['bufferViews']) - 1
def accessor(arr, typ, target=None, minmax=False):
    arr = np.ascontiguousarray(arr)
    comp = {np.dtype('float32'): 5126, np.dtype('uint32'): 5125, np.dtype('uint16'): 5123, np.dtype('uint8'): 5121}[arr.dtype]
    acc = {'bufferView': add_buffer(arr, target), 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
    if comp == 5121: acc['normalized'] = True
    if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
    gltf['accessors'].append(acc); return len(gltf['accessors']) - 1
tex_index = {}
def tex_ref(t):
    if not t: return None
    if t['uri'] not in tex_index:
        gltf['images'].append({'uri': t['uri'], 'mimeType': 'image/webp'})
        gltf['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(gltf['images']) - 1}}})
        tex_index[t['uri']] = len(gltf['textures']) - 1
    return tex_index[t['uri']]
mat_index = {}
# BO3 materials whose colour map is a built-in constant ($white_diffuse, $gray_color...) get their colour from tint values
# the SEModel doesn't carry: pick one from the material name instead of rendering them white
BUILTIN = {'$black_color': [.02, .02, .02], '$gray_color': [.25, .25, .25], '$white_color': [.7, .7, .7]}
TINTS = [(r'rust|iron|steel|metal|conduit|pipe|bracket|bolt|chain|ibeam|beam|rail|clamp|valve', [.22, .21, .2]),
         (r'wood|plank|board|crate|pallet', [.32, .22, .14]), (r'concrete|cement|stone|brick', [.36, .34, .31]),
         (r'paper|cloth|fabric|canvas|sack|bag', [.45, .41, .34]), (r'insulator|ceramic|porcelain|light|lamp|bulb|glass', [.72, .7, .66]),
         (r'rubber|tire|cable|wire|black', [.05, .05, .05]), (r'snow|ice', [.8, .82, .85])]
def builtin_color(image, name):
    image = (image or '').split('\\')[-1].replace('.png', '')
    if image.startswith('$color_black_'):
        g = (1 - int(re.sub(r'\D', '', image) or 0) / 100) * .3; return [g, g, g]
    if image in BUILTIN: return BUILTIN[image]
    for pat, col in TINTS:
        if re.search(pat, name, re.I): return col
    return [.3, .3, .3]
def material(key, name, color, normal, two_sided=False, overlay=False, fallback=None):
    if key in mat_index: return mat_index[key]
    m = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': .85}, 'doubleSided': two_sided}
    c = tex_ref(color); n = tex_ref(normal)
    if c is not None: m['pbrMetallicRoughness']['baseColorTexture'] = {'index': c}
    else: m['pbrMetallicRoughness']['baseColorFactor'] = [*(fallback or [.3, .3, .3]), 1]
    if n is not None: m['normalTexture'] = {'index': n}
    if overlay: m['alphaMode'] = 'BLEND'   # BO3 _blend layers and decals: drawn over the surface below, faded by vertex/texture alpha
    elif color and color['alpha']: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = .5
    gltf['materials'].append(m); mat_index[key] = len(gltf['materials']) - 1
    return mat_index[key]
def add_node(node):
    gltf['nodes'].append(node); gltf['scenes'][0]['nodes'].append(len(gltf['nodes']) - 1); return len(gltf['nodes']) - 1

# ---- level geometry ---------------------------------------------------------------------------------------------------------
info = json.load(open(os.path.join(SRC, BSP + '.json')))
P = np.fromfile(os.path.join(SRC, BSP + '.positions.bin'), dtype='<f4').reshape(-1, 3)
VD = np.fromfile(os.path.join(SRC, BSP + '.vdata.bin'), dtype=np.uint8).reshape(-1, 20)
I = np.fromfile(os.path.join(SRC, BSP + '.indices.bin'), dtype='<u2').astype(np.int64)
UV = VD[:, 4:12].copy().view('<f4').reshape(-1, 2)
packed = VD[:, 12:16].copy().view('<u4').reshape(-1).astype(np.int64)
N = np.stack([((packed >> s) & 1023) - 512 for s in (0, 10, 20)], 1) / 511.0
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
Pg, Ng = g(P).astype(np.float32), g(N).astype(np.float32)
print(f'{BSP}: {len(P)} vertices, {len(info["surfaces"])} surfaces')

# entities and the playable area (union of the zone volumes and spawn points, grown by 900)
ents = [dict(re.findall(r'"([^"]*)" "([^"]*)"', b)) for b in re.findall(r'\{(.*?)\}', open(os.path.join(SRC, BSP + '.ents'), encoding='latin1').read(), re.S)]
vec = lambda s: [float(x) for x in (s or '0 0 0').split()][:3]
playable = np.array([vec(e['origin']) for e in ents if e.get('script_noteworthy') in ('player_volume', 'spawn_location', 'riser_location') or e.get('classname') == 'info_player_start'])
lo, hi = playable.min(0) - 900, playable.max(0) + 900
print('playable area (CoD):', lo.round(), hi.round())

groups, solid = {}, []
for s in info['surfaces']:
    mat = info['materials'][s['material']]
    if SKIP.search(mat['name']): continue
    t = I[s['firstIndex']:s['firstIndex'] + s['faces'] * 3].reshape(-1, 3)[:, [0, 2, 1]] + s['base']
    t = t[(t[:, 0] != t[:, 1]) & (t[:, 0] != t[:, 2]) & (t[:, 1] != t[:, 2])]
    if not len(t): continue
    c = P[t].mean(1)
    cell = np.floor(c[:, :2] / 1024).astype(int)
    for key in {tuple(k) for k in cell}:
        sel = t[(cell[:, 0] == key[0]) & (cell[:, 1] == key[1])]
        groups.setdefault((s['material'], key), []).append(sel)
    if not NOT_SOLID.search(mat['name']):
        inside = np.all((c >= lo) & (c <= hi), axis=1)
        if inside.any(): solid.append(t[inside])
for (mi, cell), parts in groups.items():
    tri = np.concatenate(parts)
    used, inv = np.unique(tri.ravel(), return_inverse=True)
    mat = info['materials'][mi]
    imgs = {i['hash']: i['name'] for i in mat['images']}
    overlay = bool(re.search(r'_blend|decal', mat['name'], re.I))
    m = material(('bsp', mi), mat['name'], texture(imgs.get(COLOR), TEX), texture(imgs.get(NORMAL), NORMAL_TEX), two_sided=bool(NOT_SOLID.search(mat['name'])) and not overlay,
                 overlay=overlay, fallback=builtin_color(imgs.get(COLOR), mat['name']))
    pos = Pg[used] + Ng[used] * (.12 if overlay else 0)   # overlays sit a hair above the surface they cover (no z-fighting)
    prim = {'attributes': {'POSITION': accessor(pos.astype(np.float32), 'VEC3', 34962, True), 'NORMAL': accessor(Ng[used], 'VEC3', 34962),
                           'TEXCOORD_0': accessor(UV[used].astype(np.float32), 'VEC2', 34962)},
            'indices': accessor(inv.astype(np.uint32), 'SCALAR', 34963), 'material': m}
    if overlay: prim['attributes']['COLOR_0'] = accessor(VD[used, 0:4].copy(), 'VEC4', 34962)
    gltf['meshes'].append({'name': f'bsp_{mi}_{cell[0]}_{cell[1]}', 'primitives': [prim]})
    add_node({'name': f'bsp_{mat["name"].split("/")[-1]}_{cell[0]}_{cell[1]}', 'mesh': len(gltf['meshes']) - 1})
tri = np.concatenate(solid); used, inv = np.unique(tri.ravel(), return_inverse=True)
gltf['meshes'].append({'name': 'COL_world', 'primitives': [{'attributes': {'POSITION': accessor(Pg[used], 'VEC3', 34962, True)}, 'indices': accessor(inv.astype(np.uint32), 'SCALAR', 34963)}]})
add_node({'name': 'COL_world', 'mesh': len(gltf['meshes']) - 1})
print(f'level: {len(groups)} pieces, collision {len(tri)} triangles')

# ---- props (instanced) ------------------------------------------------------------------------------------------------
def quat(R):   # rotation matrix -> (x, y, z, w)
    t = np.trace(R)
    if t > 0: s = math.sqrt(t + 1) * 2; return [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, s / 4]
    i = int(np.argmax(np.diag(R))); j, k = (i + 1) % 3, (i + 2) % 3
    s = math.sqrt(1 + R[i, i] - R[j, j] - R[k, k]) * 2
    q = [0, 0, 0, 0]; q[i] = s / 4; q[j] = (R[j, i] + R[i, j]) / s; q[k] = (R[k, i] + R[i, k]) / s; q[3] = (R[k, j] - R[j, k]) / s
    return q
by_model = {}
for m in info['models']: by_model.setdefault(m['name'], []).append(m)
mesh_cache = {}
def prop_mesh(name):   # a BO3 model as a glTF mesh (cached), or None if Greyhound didn't export it
    if name in mesh_cache: return mesh_cache[name]
    path = os.path.join(GH, 'xmodels', name, name + '_LOD0.semodel')
    if not os.path.exists(path): mesh_cache[name] = None; return None
    model = read_semodel(path)
    prims = []
    for mesh in model['meshes']:
        if not mesh['faces']: continue
        pos = (g(np.array(mesh['pos'])) * CM).astype(np.float32); nrm = g(np.array(mesh['nrm'])); nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-6)
        uv = np.array([u[0] for u in mesh['uv']], dtype=np.float32)
        faces = np.array(mesh['faces'], dtype=np.uint32)[:, [0, 2, 1]]
        mm = model['materials'][mesh['mats'][0]] if mesh['mats'] else {'name': 'none'}
        overlay = bool(re.search(r'decal', mm['name'], re.I))
        mat = material(('prop', mm['name']), mm['name'], texture(mm.get('diffuse'), PROP_TEX), texture(mm.get('normal'), PROP_TEX), overlay=overlay,
                       fallback=builtin_color(mm.get('diffuse'), mm['name']))
        prims.append({'attributes': {'POSITION': accessor(pos, 'VEC3', 34962, True), 'NORMAL': accessor(nrm.astype(np.float32), 'VEC3', 34962),
                                     'TEXCOORD_0': accessor(uv, 'VEC2', 34962)}, 'indices': accessor(faces.ravel(), 'SCALAR', 34963), 'material': mat})
    if not prims: mesh_cache[name] = None; return None
    gltf['meshes'].append({'name': name, 'primitives': prims}); mesh_cache[name] = len(gltf['meshes']) - 1
    return mesh_cache[name]
instances, skipped = 0, []
for name, insts in sorted(by_model.items()):
    mesh_i = prop_mesh(name)
    if mesh_i is None: skipped.append(name); continue
    cells = {}
    for it in insts:
        o = np.array(it['origin']); cells.setdefault(tuple(np.floor(o[:2] / 2048).astype(int)), []).append(it)
    for cell, group in cells.items():
        T, R, S = [], [], []
        for it in group:
            A = np.array(it['axes'], dtype=np.float64).reshape(3, 3)       # rows: the model's x, y, z axes in the world (CoD)
            M = A.T; sc = np.linalg.norm(M, axis=0); M = M / np.where(sc > 1e-6, sc, 1)
            Rg = C @ M @ C.T
            T.append(g(it['origin'])); R.append(quat(Rg)); S.append([it['scale'] * sc.mean()] * 3)
        add_node({'name': f'prop_{name}_{cell[0]}_{cell[1]}', 'mesh': mesh_i, 'extensions': {'EXT_mesh_gpu_instancing': {'attributes': {
            'TRANSLATION': accessor(np.array(T, dtype=np.float32), 'VEC3'), 'ROTATION': accessor(np.array(R, dtype=np.float32), 'VEC4'),
            'SCALE': accessor(np.array(S, dtype=np.float32), 'VEC3')}}}})
        instances += len(group)
print(f'props: {len(by_model) - len(skipped)} models, {instances} instances' + (f', {len(skipped)} not exported' if skipped else ''))

# ---- markers ------------------------------------------------------------------------------------------------------------
PERKS = {'specialty_armorvest': 'jugg', 'specialty_quickrevive': 'revive', 'specialty_fastreload': 'speedcola', 'specialty_doubletap2': 'doubletap',
         'specialty_staminup': 'staminup', 'specialty_deadshot': 'deadshot', 'specialty_additionalprimaryweapon': 'mulekick'}   # the last three: perks-plus mod
WEAPONS = {'ar_longburst': 'm16_zm', 'shotgun_pump': 'ithaca_zm', 'pistol_burst': 'cz75_zm', 'ar_marksman': 'm14_zm', 'smg_fastfire': 'mpl_zm',
           'smg_versatile': 'mp5k_zm', 'ar_cqb': 'famas_zm', 'ar_standard': 'bo3_ak117', 'pistol_fullauto': 'bo3_g18_death'}
START_ZONE = 'receiver'
# BO3 zone (volume name without _zone) -> the door zones that activate it. A door's script_flag enter_<x> opens zone x;
# zones without a door of their own open with the doors next to them (their spawners are placed once per listed zone).
ZONE_GROUPS = {'receiver': ['start'], 'warehouse_bottom': ['warehouse_building'], 'warehouse_top': ['warehouse_building'],
               'wnuen': ['wnuen_building'], 'wnuen_bridge': ['wnuen_building'], 'bridge': ['warehouse_building', 'wnuen_building'],
               'outside_south': ['outside_east', 'outside_west']}
zid = lambda z: z.replace('_', '')   # CustomWorld reads a marker's zone up to the first underscore
def zone_ids(z): return [zid(x) for x in ZONE_GROUPS.get(z, [z])]
zones = {}
for e in ents:
    if e.get('script_noteworthy') == 'player_volume': zones.setdefault(e['targetname'].removesuffix('_zone'), []).append(vec(e['origin']))
def zone_of_point(p):
    best = min(((z, np.linalg.norm(np.array(o) - p)) for z, os_ in zones.items() for o in os_), key=lambda x: x[1])[0]
    return zone_ids(best)[0]
def marker(name, origin, yaw_deg=0.0, extras=None):
    r = math.radians(yaw_deg) / 2
    n = {'name': name, 'translation': g(origin).tolist(), 'rotation': [0, math.sin(r), 0, math.cos(r)]}
    if extras: n['extras'] = extras
    add_node(n)
counts = {}
perk_spots, SIDE, SIDE_DIR = [], 62, int(os.environ.get('SIDE_DIR', '-1'))
def count(k): counts[k] = counts.get(k, 0) + 1
for e in ents:
    cls, tn, sn = e.get('classname', ''), e.get('targetname', ''), e.get('script_noteworthy', '')
    o = vec(e.get('origin')); yaw = vec(e.get('angles'))[1]
    if cls == 'info_player_start': marker('PLAYER_SPAWN', o, yaw); count('PLAYER_SPAWN')
    elif sn in ('spawn_location', 'riser_location') and tn.endswith('_spawners'):
        for z in zone_ids(tn.removesuffix('_spawners').removesuffix('_zone')): marker(f'ZSPAWN_{z}', o, yaw, {'zone': z}); count('ZSPAWN')
    elif cls.startswith('zbarrier_zmcore_basicwoodbarrier'):
        wz = zone_of_point(np.array(o)); marker(f'WINDOW_{wz}', o, yaw, {'zone': wz}); count('WINDOW')
        # the window's own spawner (same script_string) can be far away; CustomWorld wants a ZSPAWN within 400 units
        # outside it: one on the way there, 250 units out
        sp = [x for x in ents if x.get('script_noteworthy') in ('spawn_location', 'riser_location') and x.get('script_string') == e.get('script_string')]
        if sp:
            t = np.array(vec(sp[0]['origin'])); d = t - np.array(o); d[2] = 0; dist = np.linalg.norm(d)
            if dist > 1:
                for z in zone_ids(sp[0]['targetname'].removesuffix('_spawners').removesuffix('_zone')):
                    marker(f'ZSPAWN_{z}', (np.array(o) + d / dist * min(250, dist * .8)).tolist(), yaw, {'zone': z}); count('ZSPAWN_window')
    elif cls == 'zbarrier_zmcore_MagicBox': marker('BOX_start' if sn.startswith('start_chest') else 'BOX', o, yaw); count('BOX')
    elif cls == 'zbarrier_zmcore_packapunch': marker('PAP', o, yaw); count('PAP')
    elif tn == 'use_power_switch': marker('POWER', o, yaw); count('POWER')
    elif tn == 'zm_perk_machine' and sn in PERKS and f'PERK_{PERKS[sn]}' not in counts:
        # two machines on one spot (The Giant's Stamin-Up and Deadshot: BO3 fills it with one of them): slide the later one
        # SIDE units along the wall (SIDE_DIR picks the side with room; CoD yaw: +90 is the machine's left)
        if any(np.linalg.norm(np.array(o[:2]) - np.array(q[:2])) < 40 for q in perk_spots):
            a = math.radians(yaw + 90 * SIDE_DIR); o = [o[0] + math.cos(a) * SIDE, o[1] + math.sin(a) * SIDE, o[2]]
        perk_spots.append(o); marker(f'PERK_{PERKS[sn]}', o, yaw); count(f'PERK_{PERKS[sn]}')
    elif tn == 'weapon_upgrade' and e.get('zombie_weapon_upgrade') in WEAPONS: marker(f'WALLBUY_{WEAPONS[e["zombie_weapon_upgrade"]]}', o, yaw); count('WALLBUY')
    elif tn == 'claymore_purchase': marker('CLAYMORE', o, yaw); count('CLAYMORE')
# Doors: each zombie_door trigger (two can share a target) -> a DOOR_<zone>_<cost> group of its script_model pieces, each
# with extras.move (BO3's script_vector, a world offset: slide or drop) for CustomWorld to animate when it opens.
# BO3's electric doors (script_noteworthy electric_door) open with the power.
by_target = {}
for e in ents:
    if e.get('targetname'): by_target.setdefault(e['targetname'], []).append(e)
done = set()
for e in ents:
    if e.get('targetname') != 'zombie_door' or e.get('target') in done: continue
    done.add(e.get('target'))
    electric = e.get('script_noteworthy') == 'electric_door'
    z = '' if electric else zid(e.get('script_flag', '').removeprefix('enter_'))
    cost = int(float(e.get('zombie_cost', 750)))
    kids = []
    for part in by_target.get(e.get('target'), []):
        if part.get('classname') != 'script_model': continue
        mi = prop_mesh(part['model'])
        if mi is None: print('  door piece not exported:', part['model']); continue
        r = math.radians(vec(part.get('angles'))[1]) / 2
        node = {'name': part['model'], 'mesh': mi, 'translation': g(vec(part['origin'])).tolist(), 'rotation': [0, math.sin(r), 0, math.cos(r)]}
        if part.get('script_vector'): node['extras'] = {'move': g(vec(part['script_vector'])).tolist()}
        gltf['nodes'].append(node); kids.append(len(gltf['nodes']) - 1)
    if not kids: continue
    add_node({'name': f'DOOR_{z or "power"}_{cost}', 'children': kids, 'extras': {'zone': z, 'cost': cost, 'electric': electric}})
    count('DOOR')
# Teleporters (Der Riese): each pad sends you to the mainframe for 1500 (one-way: TELEPORT_<pad> + TPDEST_<pad>)
MAINFRAME, MAINFRAME_YAW = [-56, 440, 64], 270
for e in ents:
    m = re.fullmatch(r'telepad_(\d)', e.get('targetname', ''))
    if m and e.get('script_sound') == 'evt_pad':
        pad = f'pad{m[1]}'
        marker(f'TELEPORT_{pad}', [*vec(e['origin'])[:2], vec(e['origin'])[2] - 20], vec(e.get('angles'))[1],
               {'cost': 1500, 'cooldown': 30, 'power': True, 'locked': True, 'lockedText': 'Link this teleporter: pull its lever, then the mainframe'})
        marker(f'TPDEST_{pad}', MAINFRAME, MAINFRAME_YAW); count('TELEPORT')
    elif m and e.get('script_sound') == 'evt_lever_pull':
        add_node({'name': f'GIANT_LEVER_pad{m[1]}', 'translation': g(vec(e['origin'])).tolist()}); count('LEVER')   # the-giant mod: linking
# lamps (the-giant mod lights the nearest few): BO3's buzzing light fixtures and lanterns, merged within 120 units
lamps = []
for e in ents:
    if e.get('targetname') in ('lights', 'dyn_light', 'lantern') and e.get('origin'):
        o = vec(e['origin'])
        if all(np.linalg.norm(np.array(o) - np.array(q)) > 120 for q in lamps): lamps.append(o)
for k, o in enumerate(lamps): add_node({'name': f'GIANT_LAMP_{k}', 'translation': g(o).tolist()})
counts['LAMP'] = len(lamps)
for e in ents:
    if e.get('targetname') == 'trigger_teleport_core': add_node({'name': 'GIANT_CORE', 'translation': g(vec(e['origin'])).tolist()})
    if e.get('targetname') == 'pack_door' and e.get('classname') == 'script_model':
        mi = prop_mesh(e['model'])
        if mi is not None:   # the mainframe door: shut until the three pads are linked (the-giant mod opens it), then it rises
            r = math.radians(vec(e.get('angles'))[1]) / 2
            gltf['nodes'].append({'name': e['model'], 'mesh': mi, 'translation': g(vec(e['origin'])).tolist(), 'rotation': [0, math.sin(r), 0, math.cos(r)], 'extras': {'move': g([0, 0, 110]).tolist()}})
            add_node({'name': 'DOOR_pap_0', 'children': [len(gltf['nodes']) - 1], 'extras': {'zone': '', 'cost': 0, 'scripted': True}}); count('PAP_DOOR')
print('markers:', counts)

# ---- write -----------------------------------------------------------------------------------------------------------------
gltf['buffers'] = [{'byteLength': len(blob)}]
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4); blob += b'\0' * (-len(blob) % 4)
out = os.path.join(OUT, MAP_ID + '.glb')
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
tex_mb = sum(os.path.getsize(os.path.join(OUT, 'tex', f)) for f in os.listdir(os.path.join(OUT, 'tex'))) / 1048576
print(f'wrote {out}: {os.path.getsize(out) / 1048576:.1f} MB, {len(gltf["images"])} textures ({tex_mb:.0f} MB)')

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
SKIP = re.compile(r'sky|caulk|clip|portal|nodraw|shadow_?caster|^wc/core_|\$', re.I)              # not drawn (core_*: Radiant placeholder boxes, the grey slab by the stairs)
NOT_SOLID = re.compile(r'decal|glass|water|foliage|grass|cobweb|web_|fx_|_fx|blend|vista|light_?ray|godray|smoke|fog|ivy|leaves|vine|cloth|curtain', re.I)
if BSP == 'zm_castle':   # Der Eisendrache's snowy ground is often only a _blend surface (two layers mixed by vertex alpha, nothing
    # under it): without it the navmesh had holes across the courtyard and zombies couldn't cross. Decals stay non-solid.
    NOT_SOLID = re.compile(r'decal|glass|water|foliage|cobweb|web_|fx_|_fx|vista|light_?ray|godray|smoke|fog|ivy|leaves|vine|cloth|curtain', re.I)

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
    # BO3 tints some colour maps at run time (a white trim or blood mask painted grey or red by the material): note
    # near-white ones so the material can take a tint from its name
    out = subprocess.run(['magick', src, '-alpha', 'off', '-resize', '32x32', '-colorspace', 'gray', '-format', '%[fx:mean]', 'info:'], capture_output=True, text=True).stdout
    try: bright = float(out)
    except ValueError: bright = .5
    uri = f'tex/{name}_{size}.webp'
    dst = os.path.join(OUT, uri)
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-vf', f"scale='min({size},iw)':'min({size},ih)':force_original_aspect_ratio=decrease",
                        '-c:v', 'libwebp', '-quality', '82', *(['-pix_fmt', 'yuva420p'] if alpha else []), dst], check=True)
    textures[key] = {'uri': uri, 'alpha': alpha, 'bright': bright}
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
PAINT = [(r'blood', [.32, .03, .03]), (r'grey_?drk|grey_?dk|gray_?dark|dark_?grey|drk|_dk\b', [.13, .13, .13]), (r'black', [.05, .05, .05]),
         (r'grey|gray', [.35, .35, .35]), (r'white', [.78, .78, .76]), (r'red', [.4, .07, .06]), (r'green', [.16, .26, .13]),
         (r'blue', [.1, .16, .3]), (r'yellow|caution', [.62, .5, .1]), (r'orange', [.6, .3, .08]), (r'rust|brown', [.36, .2, .1])]
def name_tint(name):
    for pat, col in PAINT:
        if re.search(pat, name, re.I): return col
    return builtin_color('', name)
def builtin_color(image, name):
    image = (image or '').split('\\')[-1].replace('.png', '')
    if image.startswith('$color_black_'):
        g = (1 - int(re.sub(r'\D', '', image) or 0) / 100) * .3; return [g, g, g]
    if image in BUILTIN: return BUILTIN[image]
    for pat, col in TINTS:
        if re.search(pat, name, re.I): return col
    return [.3, .3, .3]
CUTOUT = re.compile(r'leaf|leaves|foliage|grass|fence|chainlink|chain_link|grate|grill|mesh|cobweb|web_|ivy|vine|plant|tree|bush|branch|'
                    r'wire|barbed|paper|newspaper|poster|cloth|curtain|flag|net_|netting|tarp|hair|feather|lattice|cutout|alpha', re.I)
GLASS = re.compile(r'glass|window_pane|windowpane', re.I)
mat_sig = {}
def material(key, name, color, normal, two_sided=False, overlay=False, fallback=None):
    if key in mat_index: return mat_index[key]
    m = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': .85}, 'doubleSided': two_sided}
    c = tex_ref(color); n = tex_ref(normal)
    if c is not None:
        m['pbrMetallicRoughness']['baseColorTexture'] = {'index': c}
        # a tint mask (see texture()), or a BO3 "micro" detail map (i_t7_micro_*: near-white detail the game multiplies by a
        # colour constant the export lacks; untinted, lockers, gondola trim and machines came out white)
        if (color['bright'] > .85 or '_micro_' in color['uri']) and not re.search(r'snow|ice|paper|glass|light|bulb|lamp', name, re.I):
            t = name_tint(name)
            if '_micro_' in color['uri'] and color['bright'] <= .85: t = [min(1, v / max(color['bright'], .3)) for v in t]   # tint x detail ~ the tint
            m['pbrMetallicRoughness']['baseColorFactor'] = [*t, 1]
    else: m['pbrMetallicRoughness']['baseColorFactor'] = [*(fallback or [.3, .3, .3]), 1]
    if n is not None: m['normalTexture'] = {'index': n}
    if GLASS.search(name) and not re.search(r'decal|bottle|jar|beaker|glasses', name, re.I):   # see-through panes (the gondola's windows...)
        m['alphaMode'] = 'BLEND'; m['doubleSided'] = True
        m['pbrMetallicRoughness']['baseColorFactor'] = [*(m['pbrMetallicRoughness'].get('baseColorFactor', [.75, .8, .85, 1])[:3]), .28]
        m['pbrMetallicRoughness']['roughnessFactor'] = .15
    elif overlay:
        m['alphaMode'] = 'BLEND'   # BO3 _blend layers and decals: drawn over the surface below, faded by vertex/texture alpha
        if c is None: m['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 0]   # its image wasn't exported: a flat quad otherwise
    # BO3 colour maps often keep other data in their alpha: only materials that are see-through by nature cut it out
    elif color and color['alpha'] and CUTOUT.search(name): m['alphaMode'] = 'MASK'; m['alphaCutoff'] = .5
    # materials that differ only by name (BO3 has many per-model copies of one texture set) are shared: each distinct
    # material is its own prop batch at run time (instance-cull.js), and Der Eisendrache had 3,267 of them
    sig = json.dumps({k: v for k, v in m.items() if k != 'name'}, sort_keys=True)
    if sig in mat_sig: mat_index[key] = mat_sig[sig]; return mat_index[key]
    gltf['materials'].append(m); mat_index[key] = mat_sig[sig] = len(gltf['materials']) - 1
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
vec = lambda s: [float(x) for x in s][:3] if isinstance(s, (list, tuple)) else [float(x) for x in (s or '0 0 0').split()][:3]
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
print(f'level: {len(groups)} pieces')
# props that are solid (stairs, the teleporter floors, crates, machines) join the collision; small debris, pipes, wires
# and lamps stay walk-through (or the floors would be bumpy)
NO_COLLIDE = re.compile(r'debris|paper|trash|newspaper|wire|cable|rope|chain|light|lamp|bulb|sign|fxanim|snow|decal|cobweb|leaves|ivy|'
                        r'grass|pipe|conduit|insulator|bracket|bolt|clamp|spring|spindle|_rod|tube|vent|glass|curtain|cloth|flag|poster|'
                        r'graffiti|plant|bush|tree|rubble|brick_dirty|barbed|bottle|can_|cup|plate|book|tool|_handle|outlet', re.I)
# only compact, solid objects collide as their box (a box around a door frame, a window frame or the teleporter's rings
# closes the opening)
BOXABLE = re.compile(r'crate|box(?!_wood_wine)|barrel|drum|cabinet|file_cab|locker|desk|table|generator|machine|sandbag|pallet|tank|chest|'
                     r'safe|bench|shelf|cart|engine|transformer|control_box|pillar|column|cinder|block|furnace|boiler|compressor|workbench', re.I)
WALKABLE = re.compile(r'stair|step|floor|platform|catwalk(?!_support)|walkway|bridge(?!_piston|_spring)|grate|deck|ramp|teleporter_(floor|base|mf_base|pad_glass)|zm_der_teleporter$', re.I)
# floor gratings (396 panels), planks: flat slabs, exact as boxes; teleporter bases and pads: their convex hull
FLATBOX = re.compile(r'grating_metal|wood_plank_rustic|zm_der_plank_wood', re.I)
CONVEX = re.compile(r'teleporter_base|zm_der_teleporter$|teleporter_pad_glass|teleporter_mf_bolted_floor', re.I)
def convex_hull(pts):
    import bmesh
    bm = bmesh.new()
    for p in np.unique(np.round(pts, 2), axis=0): bm.verts.new(p.tolist())
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.verts.index_update()
    P = np.array([v.co[:] for v in bm.verts]); T = np.array([[v.index for v in f.verts] for f in bm.faces]); bm.free()
    c = P.mean(0); n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    flip = (n * (P[T].mean(1) - c)).sum(1) < 0; T[flip] = T[flip][:, [0, 2, 1]]   # outward
    return P, T
# a box from its 8 corners (index = x*4 + y*2 + z over min/max), outward-facing triangles
BOX_TRIS = np.array([[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]])
prop_geo = {}   # model -> (positions in model space, inches, glTF axes; triangles)

# ---- props (instanced) ------------------------------------------------------------------------------------------------
def euler_cod(pitch, yaw, roll):
    p, y, r = (math.radians(v) for v in (pitch, yaw, roll))
    Rz = np.array([[math.cos(y), -math.sin(y), 0], [math.sin(y), math.cos(y), 0], [0, 0, 1]])
    Ry = np.array([[math.cos(p), 0, math.sin(p)], [0, 1, 0], [-math.sin(p), 0, math.cos(p)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(r), -math.sin(r)], [0, math.sin(r), math.cos(r)]])
    return Rz @ Ry @ Rx
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
    tris, base, P_all = [], 0, []
    for mesh in model['meshes']:
        if not mesh['faces']: continue
        P_all.append(g(np.array(mesh['pos'])) * CM); tris.append(np.array(mesh['faces'])[:, [0, 2, 1]] + base); base += len(mesh['pos'])
    if P_all: prop_geo[name] = (np.concatenate(P_all), np.concatenate(tris))
    gltf['meshes'].append({'name': name, 'primitives': prims}); mesh_cache[name] = len(gltf['meshes']) - 1
    return mesh_cache[name]
instances, skipped = 0, []
# skinned characters placed as static props (Der Eisendrache's zombie corpses, soldier and gib parts): a static model
# can't be posed, so they stood in their bind pose (user: "T-posing messes"); left out
POSED_CHARACTER = re.compile(r'^c_(zom_.*corpse|zom_zod_zombie_fem_body|54i_.*spawn|ger_winter_soldier)', re.I)
for name, insts in sorted(by_model.items()):
    if POSED_CHARACTER.search(name): continue
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
# Der Eisendrache builds much of the castle from big props (stone walls, columns, arches, rock faces, roofs): they
# collide as their own mesh (up to 1,500 triangles; boxes around them, or railings and furniture, cut the navmesh into
# islands the zombies couldn't leave). The Giant: unchanged.
STRUCTURAL = re.compile(r'wall|column|pillar|arch(?!ive)|fireplace|stone_|rock|cliff|tower|roof|balcony|statue|buttress|parapet|battlement|chimney|bookcase|throne|altar', re.I) if BSP == 'zm_castle' else None
col_P, col_T, n0, solid_props = [], [], 0, 0
# Der Eisendrache: props that would cut the navmesh into islands (railings, crates, furniture, machines...) still stop the
# player and bullets: they go to PCOL_props, which CustomWorld adds to collision but leaves out of the navmesh.
pcol_P, pcol_T, pn0, pcol_props = [], [], 0, 0
CLUTTER = re.compile(r'debris|rubble|brick|rock_|stone_pile|plank|board|crate|box|barrel|bucket|basket|sack|bag|pile|hay|log|branch|bone|skull|helmet|ammo|shell|tool|pot|pan|chair_.*broken|broken|scrap|junk|tire|ladder|cart_wheel|wheel', re.I)
tri = np.concatenate(solid); used, inv = np.unique(tri.ravel(), return_inverse=True)
col_P.append(Pg[used].astype(np.float64)); col_T.append(inv.reshape(-1, 3)); n0 = len(used)
for name, insts in by_model.items():
    player_only = False
    base_ = re.sub(r'_snow(?=_|$)', '', name)   # a snowy variant collides like the plain one (NO_COLLIDE's 'snow' is for snow piles)
    if name not in prop_geo or NO_COLLIDE.search(base_) or 'stair_step' in name: continue   # steps: ramps below
    pp, tt = prop_geo[name]
    size = pp.max(0) - pp.min(0)
    if size.max() < 24 and 'sandbag' not in name: continue   # small stuff (sandbags pile up under the windows)
    # walkable structure keeps its shape (if it isn't too detailed); other solid props collide as their bounding box,
    # and big irregular ones are left out (a box around them could close a passage)
    if CONVEX.search(base_): pp, tt = convex_hull(pp)   # a smooth bump, no pits to sink into
    elif FLATBOX.search(base_) or (WALKABLE.search(base_) and len(tt) > 6000):   # flat panels and over-detailed walkables: their box
        lo3, hi3 = pp.min(0), pp.max(0)
        pp = np.array([[x, y, z] for x in (lo3[0], hi3[0]) for y in (lo3[1], hi3[1]) for z in (lo3[2], hi3[2])])
        tt = BOX_TRIS
    elif WALKABLE.search(base_): pass
    elif size.max() <= 200 and BOXABLE.search(base_) and not re.search(r'frame|arch|door|window|gate', name, re.I):
        lo3, hi3 = pp.min(0), pp.max(0)
        pp = np.array([[x, y, z] for x in (lo3[0], hi3[0]) for y in (lo3[1], hi3[1]) for z in (lo3[2], hi3[2])])
        tt = BOX_TRIS
    elif STRUCTURAL and STRUCTURAL.search(base_) and len(tt) <= 1500: pass   # Der Eisendrache: walls, columns, arches... as they are
    elif BSP == 'zm_castle' and len(tt) <= 1500 and size[1] >= 40 and size.max() <= 360 and not CLUTTER.search(base_):
        # everything else that stands at least 40 high (railings, furniture, machines...): the player-only layer
        # (PCOL_props), as its own mesh. Lower things you could only snag on (crates, rubble, clutter: there was so
        # much of it you got stuck everywhere, user), bigger irregular ones and detailed ones (a box would close gaps) don't
        player_only = True
    else: continue
    for it in insts:
        o = np.array(it['origin'])
        if not np.all((o >= lo) & (o <= hi)): continue
        A = np.array(it['axes'], dtype=np.float64).reshape(3, 3); M = A.T; sc = np.linalg.norm(M, axis=0); M = M / np.where(sc > 1e-6, sc, 1)
        R = C @ M @ C.T
        if player_only: pcol_P.append(pp @ R.T * (it['scale'] * sc.mean()) + g(o)); pcol_T.append(tt + pn0); pn0 += len(pp); pcol_props += 1
        else: col_P.append(pp @ R.T * (it['scale'] * sc.mean()) + g(o)); col_T.append(tt + n0); n0 += len(pp); solid_props += 1
# Stairs: BO3's steps are separate 2-inch treads (8 up, 10-12 along) with gaps, and the game walks players on an
# invisible clip ramp that isn't in the data. Chain the treads into flights and collide with a ramp from the bottom
# tread to the top one instead (the treads stay visual).
steps = [m for m in info['models'] if 'stair_step_8x' in m['name']]
parent = list(range(len(steps)))
def find(i):
    while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
    return i
for i, a in enumerate(steps):
    for j in range(i + 1, len(steps)):
        b = steps[j]
        if a['name'] != b['name'] or np.abs(np.array(a['axes']) - np.array(b['axes'])).max() > .01: continue
        dz = abs(a['origin'][2] - b['origin'][2]); dh = math.hypot(a['origin'][0] - b['origin'][0], a['origin'][1] - b['origin'][1])
        if 5 <= dz <= 11 and dh <= 16: parent[find(i)] = find(j)
flights = {}
for i in range(len(steps)): flights.setdefault(find(i), []).append(steps[i])
ramps = 0
for fl in flights.values():
    if len(fl) < 3: continue
    fl.sort(key=lambda m: m['origin'][2]); lo_s, hi_s = np.array(fl[0]['origin']), np.array(fl[-1]['origin'])
    half_w = float(re.search(r'8x\d+x(\d+)', fl[0]['name'])[1]) / 2; half_d = float(re.search(r'8x(\d+)x', fl[0]['name'])[1]) / 2
    fwd = (hi_s - lo_s)[:2]; fwd = fwd / max(np.linalg.norm(fwd), 1e-6); side = np.array([-fwd[1], fwd[0]])
    a0 = np.array([*(lo_s[:2] - fwd * half_d), lo_s[2] + 2]); a1 = np.array([*(hi_s[:2] + fwd * half_d), hi_s[2] + 2])
    quad = [np.array([*(a0[:2] + side * half_w), a0[2]]), np.array([*(a0[:2] - side * half_w), a0[2]]),
            np.array([*(a1[:2] - side * half_w), a1[2]]), np.array([*(a1[:2] + side * half_w), a1[2]])]
    col_P.append(g(np.array(quad))); col_T.append(np.array([[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) + n0); n0 += 4; ramps += 1
print(f'stairs: {ramps} ramps from {len(steps)} treads')
CP, CT = np.concatenate(col_P).astype(np.float32), np.concatenate(col_T).astype(np.uint32)
gltf['meshes'].append({'name': 'COL_world', 'primitives': [{'attributes': {'POSITION': accessor(CP, 'VEC3', 34962, True)}, 'indices': accessor(CT.ravel(), 'SCALAR', 34963)}]})
add_node({'name': 'COL_world', 'mesh': len(gltf['meshes']) - 1})
print(f'collision: {len(CT)} triangles ({solid_props} solid props)')
if pcol_P:
    PP, PT = np.concatenate(pcol_P).astype(np.float32), np.concatenate(pcol_T).astype(np.uint32)
    gltf['meshes'].append({'name': 'PCOL_props', 'primitives': [{'attributes': {'POSITION': accessor(PP, 'VEC3', 34962, True)}, 'indices': accessor(PT.ravel(), 'SCALAR', 34963)}]})
    add_node({'name': 'PCOL_props', 'mesh': len(gltf['meshes']) - 1})
    print(f'player-only collision: {len(PT)} triangles ({pcol_props} props)')
CTRI = CP[CT].astype(np.float64)   # (n, 3, 3) collision triangles in glTF space
def seg_blocked(a, b, tris):   # does the segment a->b cross any triangle (Moller-Trumbore, vectorised)
    d = b - a; e1 = tris[:, 1] - tris[:, 0]; e2 = tris[:, 2] - tris[:, 0]
    h = np.cross(d, e2); det = (e1 * h).sum(1); ok = np.abs(det) > 1e-9; inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
    sv = a - tris[:, 0]; u = (sv * h).sum(1) * inv; q = np.cross(sv, e1); v = (q * d).sum(1) * inv; t = (q * e2).sum(1) * inv
    return bool(np.any(ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t >= 0) & (t <= 1)))
def floor_below(o):   # collision floor within 48 units under a CoD point, and nothing solid in the 60 above it
    O = g(o).astype(np.float64); near = CTRI[np.linalg.norm(CTRI.mean(1) - O, axis=1) < 200]
    return seg_blocked(O + [0, 8, 0], O - [0, 48, 0], near) and not seg_blocked(O + [0, 10, 0], O + [0, 60, 0], near)
def window_opening(o, out):
    """A window's clear opening, measured through the collision (walls, sandbag boxes): segments 30 units either side of
    the barrier plane at heights over the floor. Returns (bottom, top, width) in CoD units above the origin, or None."""
    O = g(o).astype(np.float64); n = g(np.array([out[0], out[1], 0.0])); n /= max(np.linalg.norm(n), 1e-6); side = np.array([n[2], 0, -n[0]])
    near = CTRI[np.linalg.norm(CTRI.mean(1) - O, axis=1) < 160]
    clear = [h for h in range(4, 161, 4) if not seg_blocked(O + [0, h, 0] - n * 30, O + [0, h, 0] + n * 30, near)]
    runs, cur = [], []
    for h in clear:
        if cur and h != cur[-1] + 4: runs.append(cur); cur = []
        cur.append(h)
    if cur: runs.append(cur)
    runs = [r for r in runs if len(r) >= 6]   # at least 24 units tall
    if not runs: return None
    r = max(runs, key=len); bottom, top = r[0] - 2, r[-1] + 2; mid = (bottom + top) / 2
    w = 0
    for k in range(4, 80, 4):
        if any(seg_blocked(O + [0, mid, 0] + side * sgn * k - n * 30, O + [0, mid, 0] + side * sgn * k + n * 30, near) for sgn in (1, -1)): break
        w = 2 * k
    return bottom, top, max(w, 32)

# ---- markers ------------------------------------------------------------------------------------------------------------
PERKS = {'specialty_armorvest': 'jugg', 'specialty_quickrevive': 'revive', 'specialty_fastreload': 'speedcola', 'specialty_doubletap2': 'doubletap',
         'specialty_staminup': 'staminup', 'specialty_deadshot': 'deadshot', 'specialty_additionalprimaryweapon': 'mulekick'}   # the last three: perks-plus mod
WEAPONS = {'ar_longburst': 'm16_zm', 'shotgun_pump': 'ithaca_zm', 'pistol_burst': 'cz75_zm', 'ar_marksman': 'm14_zm', 'smg_fastfire': 'mpl_zm',
           'smg_versatile': 'mp5k_zm', 'ar_cqb': 'famas_zm', 'ar_standard': 'bo3_ak117', 'pistol_fullauto': 'bo3_g18_death',
           'lmg_light': 'rpk_zm', 'smg_standard': 'ak74u_zm'}   # the last two: Der Eisendrache's Dingo and Kuda
# Per map: the start zone, BO3 zone -> the door zones that activate it, and the Mystery Box that starts out.
# The Giant: a door's script_flag enter_<x> opens zone x; zones without a door of their own open with the doors next to
# them (their spawners are placed once per listed zone). Der Eisendrache: every zone keeps its own id and the
# der-eisendrache mod switches them on as zm_castle_zones.gsc does (adjacent zones linked by door flags); a door's zone
# is its whole flag (connect_start_to_subclocktower -> connectstarttosubclocktower).
MAPCFG = {
    'zm_factory': {'start': 'receiver', 'box': 'start_chest', 'groups': {
        'receiver': ['start'], 'warehouse_bottom': ['warehouse_building'], 'warehouse_top': ['warehouse_building'],
        'wnuen': ['wnuen_building'], 'wnuen_bridge': ['wnuen_building'], 'bridge': ['warehouse_building', 'wnuen_building'],
        'outside_south': ['outside_east', 'outside_west']}},
    'zm_castle': {'start': 'start', 'box': 'behind_tram_station_chest', 'groups': {'start': ['start'], 'tram_high': ['start']}},
}[BSP]
START_ZONE, ZONE_GROUPS = MAPCFG['start'], MAPCFG['groups']
zname = lambda t: t.removeprefix('zone_').removesuffix('_spawners').removesuffix('_zone')   # receiver_zone / zone_start -> receiver / start
zid = lambda z: z.replace('_', '')   # CustomWorld reads a marker's zone up to the first underscore
def zone_ids(z): return [zid(x) for x in ZONE_GROUPS.get(z, [z])]
zones = {}
for e in ents:
    if e.get('script_noteworthy') == 'player_volume': zones.setdefault(zname(e['targetname']), []).append(vec(e['origin']))
def zone_of_point(p):
    best = min(((z, np.linalg.norm(np.array(o) - p)) for z, os_ in zones.items() for o in os_), key=lambda x: x[1])[0]
    return zone_ids(best)[0]
def marker(name, origin, yaw_deg=0.0, extras=None):
    r = math.radians(yaw_deg) / 2
    n = {'name': name, 'translation': g(origin).tolist(), 'rotation': [0, math.sin(r), 0, math.cos(r)]}
    if extras: n['extras'] = extras
    add_node(n)
counts = {}
openings = []
perk_spots, SIDE, SIDE_DIR = [], 62, int(os.environ.get('SIDE_DIR', '-1'))
def count(k): counts[k] = counts.get(k, 0) + 1
for e in ents:
    cls, tn, sn = e.get('classname', ''), e.get('targetname', ''), e.get('script_noteworthy', '')
    o = vec(e.get('origin')); yaw = vec(e.get('angles'))[1]
    if cls == 'info_player_start': marker('PLAYER_SPAWN', o, yaw); count('PLAYER_SPAWN')
    elif sn == 'riser_location' and tn.endswith('_spawners'):
        # BO3's spawn_location structs are behind the walls (zombies walk from there to a window): CustomWorld would snap
        # them to the nearest walkable spot (the mainframe platform...), so only the windows' spawns and the ground risers
        for z in zone_ids(zname(tn)): marker(f'ZSPAWN_{z}', o, yaw, {'zone': z}); count('ZSPAWN')
    elif BSP == 'zm_castle' and sn == 'spawn_location' and tn.endswith('_spawners') and floor_below(o):
        # Der Eisendrache: most zones have no windows; BO3's zombies appear at these points and climb in. Those with
        # floor under them become walk-in spawns (CustomWorld uses only the ones with a navmesh path to the player)
        for z in zone_ids(zname(tn)): marker(f'ZSPAWN_{z}', o, yaw, {'zone': z, 'walk': True}); count('ZSPAWN_walk')
    elif cls.startswith('zbarrier_zmcore_basicwoodbarrier'):
        # zbarrier origins are at the floor; CustomWorld centres the boards on the marker
        wz = zone_of_point(np.array(o))
        goal_ = next((x for x in ents if x.get('targetname') == 'exterior_goal' and x.get('target') == e.get('targetname')), None)
        outward = (np.array(vec(goal_['origin'])) - np.array(o)) if goal_ else np.array([math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0])
        # BO3's boards (and the window, its sandbags) are 40 units in from the zbarrier origin, away from the exterior goal
        nrm = outward.astype(float); nrm[2] = 0; nrm /= max(np.linalg.norm(nrm), 1e-6); o = (np.array(o) - nrm * 40).tolist()
        op = window_opening([o[0], o[1], o[2] - 40], outward)
        if op:   # boards (and their clip) fill the measured opening: above the sandbags, below the lintel
            bottom, top, width = op; bottom -= 40; top -= 40
            marker(f'WINDOW_{wz}', [o[0], o[1], o[2] + (bottom + top) / 2], yaw, {'zone': wz, 'height': top - bottom, 'width': min(max(width, 48), 72)})
            openings.append((round(bottom), round(top), width))
        else: marker(f'WINDOW_{wz}', [o[0], o[1], o[2] + 48], yaw, {'zone': wz}); openings.append(None)
        count('WINDOW')
        # the window's own spawner (same script_string) can be far away; CustomWorld wants a ZSPAWN within 400 units
        # outside it: one on the way there, 250 units out
        sp = [x for x in ents if x.get('script_noteworthy') in ('spawn_location', 'riser_location') and x.get('script_string') == e.get('script_string')]
        goal = next((x for x in ents if x.get('targetname') == 'exterior_goal' and x.get('target') == e.get('targetname')), None)
        if sp:
            t = np.array(vec(sp[0]['origin'])); d = t - np.array(o); d[2] = 0; dist = np.linalg.norm(d)
            if goal:   # the exterior goal (a few units outside the boards) gives the true outward direction
                d = np.array(vec(goal['origin'])) - np.array(o); d[2] = 0; dist = max(np.linalg.norm(d), 1e-6); d = d / dist * 100; dist = 100
            if dist > 1:
                for z in zone_ids(zname(sp[0]['targetname'])):
                    # 80 units out: the nearest unpaired ZSPAWN is the one CustomWorld pairs (and aims the boards at)
                    marker(f'ZSPAWN_{z}', (np.array(o) + d / dist * min(80, dist * .8)).tolist(), yaw, {'zone': z}); count('ZSPAWN_window')
    elif cls.lower() == 'zbarrier_zmcore_magicbox': marker('BOX_start' if sn.startswith(MAPCFG['box']) else 'BOX', o, yaw - 90); count('BOX')   # -90: undo CustomWorld's FACE
    elif cls.startswith('zbarrier_') and cls.endswith('packapunch'): marker('PAP', o, yaw); count('PAP')
    elif tn == 'use_power_switch':
        # no angle on the trigger: face out of the nearest wall (level triangles within 60 units, near-vertical, the one
        # closest to the switch); the lever turns yaw + FACE + perkYaw(-90) = yaw, and its front is +Z
        best = None
        for sf in info['surfaces']:
            t = I[sf['firstIndex']:sf['firstIndex'] + sf['faces'] * 3].reshape(-1, 3) + sf['base']
            if not len(t): continue
            c = P[t].mean(1); dd = np.linalg.norm(c - np.array(o), axis=1); k = int(np.argmin(dd))
            if dd[k] > 60: continue
            n = np.cross(P[t[k, 1]] - P[t[k, 0]], P[t[k, 2]] - P[t[k, 0]]); n = n / max(np.linalg.norm(n), 1e-6)
            if abs(n[2]) < .3 and (best is None or dd[k] < best[0]):
                if np.dot(n, np.array(o) - c[k]) < 0: n = -n
                best = (dd[k], n)
        pyaw = math.degrees(math.atan2(*(lambda v: (v[0], v[2]))(g(best[1])))) if best else yaw
        marker('POWER', o, pyaw); count('POWER')
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
# Der Eisendrache also has zombie_debris (same idea) and zbarrier gates as door pieces: the scissor gate and the drop-down
# buy gates (BO3 animates them; here they rise). Debris whose only pieces are brush models (their geometry isn't in the
# dump) get a stand-in: a pile of BO3 rubble at the clip brush.
GATE_MODELS = {'zbarrier_zm_castle_gate_dropdown_snow': 'p7_fxanim_zm_castle_drop_down_buy_gate_mod'}
BARRICADE, BARRICADE_W, BARRICADE_H = 'p7_zm_der_barricade_wall_main', 138.6, 92.5   # BO3 plank wall, model X = width, Z = height
def debris_standin(o):
    """A plank wall filling the passage at a debris clip brush (CoD origin o), measured through the collision: the
    floor below, the narrower of the two horizontal axes (walls both sides), and the clear height. Sinks when bought."""
    O = g(o).astype(np.float64); near = CTRI[np.linalg.norm(CTRI.mean(1) - O, axis=1) < 320]
    down = next((h for h in range(4, 300, 4) if seg_blocked(O, O - [0, h, 0], near)), 60)
    F = O - [0, down - 2, 0]
    best = None
    for axis in ((1.0, 0.0), (0.0, 1.0)):
        side = g(np.array([-axis[1], axis[0], 0.0])); C = F + [0, 40, 0]
        ext = [next((k for k in range(4, 220, 4) if seg_blocked(C, C + side * sg * k, near)), None) for sg in (1, -1)]
        open_ = ext.count(None); ext = [x if x is not None else 110 for x in ext]   # no wall within 220: an open side, 110 out
        if best is None or (open_, sum(ext)) < (best[4], best[0]): best = (sum(ext), side, ext, axis, open_)
    width, side, (l, r), axis, _ = best
    F = F + side * (l - r) / 2
    up = next((h for h in range(8, 240, 4) if seg_blocked(F + [0, 2, 0], F + [0, h, 0], near)), 120)
    height = min(up, 130)
    mi = prop_mesh(BARRICADE)
    if mi is None: return None
    yaw = math.atan2(axis[0], -axis[1])   # CoD yaw putting the model's X (its width) along the side direction (-ay, ax)
    r_ = yaw / 2
    node = {'name': BARRICADE, 'mesh': mi, 'translation': F.tolist(), 'rotation': [0, math.sin(r_), 0, math.cos(r_)],
            'scale': [width / BARRICADE_W, height / BARRICADE_H, 1], 'extras': {'move': g([0, 0, -(height + 10)]).tolist()}}
    gltf['nodes'].append(node); count('DEBRIS_STANDIN'); return len(gltf['nodes']) - 1
def door_piece(model, origin, angles, move):
    mi = prop_mesh(model)
    if mi is None: print('  door piece not exported:', model); return None
    r = math.radians(vec(angles)[1]) / 2
    node = {'name': model, 'mesh': mi, 'translation': g(vec(origin)).tolist(), 'rotation': [0, math.sin(r), 0, math.cos(r)]}
    if move: node['extras'] = {'move': g(move).tolist()}
    gltf['nodes'].append(node); return len(gltf['nodes']) - 1
for e in ents:
    if e.get('targetname') not in ('zombie_door', 'zombie_debris') or (e.get('target'), e.get('script_flag')) in done: continue
    done.add((e.get('target'), e.get('script_flag')))
    electric = e.get('script_noteworthy') == 'electric_door'
    z = '' if electric and BSP == 'zm_factory' else zid(e.get('script_flag', '').removeprefix('enter_'))
    cost = int(float(e.get('zombie_cost', 750)))
    kids, brushes = [], []
    for part in by_target.get(e.get('target'), []):
        pc = part.get('classname', '')
        if pc == 'script_model': k = door_piece(part['model'], part['origin'], part.get('angles'), vec(part['script_vector']) if part.get('script_vector') else None)
        elif pc.startswith('zbarrier_'): k = door_piece(GATE_MODELS.get(pc, part.get('model')), part['origin'], part.get('angles'), [0, 0, 110])
        elif pc == 'script_brushmodel': brushes.append(vec(part['origin'])); k = None
        else: k = None
        if k is not None: kids.append(k)
    if not kids and brushes and e.get('targetname') == 'zombie_debris':
        for o_ in brushes[:2]:
            k = debris_standin(o_)
            if k is not None: kids.append(k)
    if not kids: print('  door without pieces:', e.get('script_flag')); continue
    add_node({'name': f'DOOR_{z or "power"}_{cost}', 'children': kids, 'extras': {'zone': z, 'cost': cost, 'electric': electric}})
    count('DOOR')
# Teleporters (Der Riese): each pad sends you to the mainframe for 1500 (one-way: TELEPORT_<pad> + TPDEST_<pad>)
MAINFRAME, MAINFRAME_YAW = [-56, 292, 116], 270   # between BO3's origin_teleport_player_0..3 (in front of the mainframe, not inside it)
for e in ents:
    m = re.fullmatch(r'telepad_(\d)', e.get('targetname', ''))
    if m and e.get('script_sound') == 'evt_pad':
        pad = f'pad{m[1]}'
        marker(f'TELEPORT_{pad}', [*vec(e['origin'])[:2], vec(e['origin'])[2] - 20], vec(e.get('angles'))[1],
               {'cost': 1500, 'cooldown': 30, 'power': True, 'visual': False, 'locked': True, 'lockedText': 'Link this teleporter: pull its lever, then the mainframe'})
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
# Electric traps (trap_a/b/c): a TRAP switch at each use trigger (BO3's own handle models are placed as props, so
# CustomWorld's BO1 handle and panel are skipped: handle false), TRAPZONE cylinders along the row of fire_med points
for e in ents:
    tn = e.get('targetname', '')
    if BSP != 'zm_factory' or not re.fullmatch(r'trap_[abc]', tn): continue   # The Giant's (Der Eisendrache's trap_b is something else)
    if e.get('classname') == 'trigger_use':
        marker(f'TRAP_{tn.replace("_", "")}_1000', vec(e['origin']), 0, {'kind': 'electric', 'handle': False, 'power': True}); count('TRAP')
    elif e.get('script_sound') == 'fire_med':
        o = vec(e['origin']); marker(f'TRAPZONE_{tn.replace("_", "")}', [o[0], o[1], o[2] - 4], 0, {'radius': 34, 'height': 110}); count('TRAPZONE')
    elif e.get('classname') == 'script_model' and e.get('model'):
        mi = prop_mesh(e['model'])
        if mi is not None:
            pitch, yaw_, roll = vec(e.get('angles'))
            node = {'name': e['model'], 'mesh': mi, 'translation': g(vec(e['origin'])).tolist()}
            q = quat(C @ euler_cod(pitch, yaw_, roll) @ C.T); node['rotation'] = q
            add_node(node)
# Easter eggs (the-giant mod scripts them, after zm_factory.gsc flytrap() and the music egg):
#   GIANT_FLYTRAP: the control panel to shoot with a Pack-a-Punched gun (trig_ee_flytrap)
#   GIANT_EE_<target>: the three hide-and-seek targets (hidden until the fly trap is hit), each a group of its BO3
#     script_models; a model Greyhound didn't export is an empty GIANT_EESUB_<model> child the mod fills with a stand-in
#   GIANT_FLOATY: the items floating in the fly trap room (same scheme)
#   GIANT_PRIZE (+ GIANT_PRIZE_USE): where the Annihilator spins after all three targets are shot
#   GIANT_JAR_<n>: the music egg's three spine jars (positions from zm_factory.gsc, not in the entity string)
def ee_group(name, models):
    kids = []
    for e in models:
        pitch, yaw_, roll = vec(e.get('angles')); mi = prop_mesh(e['model'])
        node = {'name': e['model'] if mi is not None else 'GIANT_EESUB_' + e['model'], 'translation': g(vec(e['origin'])).tolist(),
                'rotation': quat(C @ euler_cod(pitch, yaw_, roll) @ C.T)}
        if mi is not None: node['mesh'] = mi
        gltf['nodes'].append(node); kids.append(len(gltf['nodes']) - 1)
    add_node({'name': name, 'children': kids}); count('EE')
for tn in ('ee_exp_monkey', 'ee_bowie_bear', 'ee_perk_bear', 'ee_floaty_stuff'):
    ms = [e for e in ents if e.get('targetname') == tn and e.get('classname') == 'script_model' and e.get('model')]
    if ms: ee_group('GIANT_FLOATY' if tn == 'ee_floaty_stuff' else 'GIANT_EE_' + tn[3:], ms)
for e in ents:
    tn = e.get('targetname', '')
    if tn.startswith('trig_ee_') and tn != 'trig_ee_flytrap':
        add_node({'name': 'GIANT_EETRIG_' + tn[8:], 'translation': g(vec(e['origin'])).tolist()})
    elif tn == 'trig_ee_flytrap': add_node({'name': 'GIANT_FLYTRAP', 'translation': g(vec(e['origin'])).tolist()}); count('EE')
    elif tn == 'flytrap_prize':
        if e.get('classname') == 'script_struct':
            r = math.radians(vec(e.get('angles'))[1]) / 2
            add_node({'name': 'GIANT_PRIZE', 'translation': g(vec(e['origin'])).tolist(), 'rotation': [0, math.sin(r), 0, math.cos(r)]})
        else: add_node({'name': 'GIANT_PRIZE_USE', 'translation': g(vec(e['origin'])).tolist()})
for k, o in enumerate([(900, -586, 151), (987, -873, 122), (-1340, -483, 255)] if BSP == 'zm_factory' else []): add_node({'name': f'GIANT_JAR_{k}', 'translation': g(o).tolist()}); count('JAR')

# The two drawbridges (fxanim scriptbundles p7_fxanim_zm_factory_bridge_<lft|rt>_bundle; zm_factory.gsc bridge_init plays
# them when the power comes on). Greyhound exported each rig (_mod) and its 145-frame animation (_anim). Each becomes a
# GIANT_BRIDGE_<side> node (at the bundle origin, turning CoD's Z-up into Y-up, cm -> inches) over a copy of the rig's bone
# hierarchy in its own units: GIANT_BRIDGE_<side>_<bone> nodes with the bind (raised) pose, carrying the rigidly bound
# vertices (each to its strongest bone) and the keys in extras (rot: absolute local quaternions, loc: offsets added to
# the bind position; [frame, x, y, z(, w)] runs). The-giant mod plays it. GIANT_BRIDGECOL_<side>: the deck in its lowered
# pose (last frame), in map space, for the mod's collision (switched on at the bridge_connect note).
from semodel_to_glb import qmul, qrot, qinv
from seanim import read_seanim
AXQ = [-math.sqrt(.5), 0, 0, math.sqrt(.5)]   # -90 degrees about X: (x, y, z) -> (x, z, -y), as g()
for e in ents:
    m_ = re.fullmatch(r'p7_fxanim_zm_factory_bridge_(lft|rt)_bundle', e.get('scriptbundlename', ''))
    if not m_: continue
    side = m_[1]; base = f'p7_fxanim_zm_factory_bridge_{side}'
    mpath = os.path.join(GH, 'xmodels', base + '_mod', base + '_mod_LOD0.semodel'); apath = os.path.join(GH, 'xanims', base + '_anim.seanim')
    if not (os.path.exists(mpath) and os.path.exists(apath)): print('bridge', side, 'not exported'); continue
    model, anim = read_semodel(mpath), read_seanim(apath)
    bones = model['bones']; bidx = {b['name']: i for i, b in enumerate(bones)}
    # per bone: primitives (material -> local positions/normals/uvs/faces)
    parts = {}
    for mesh in model['meshes']:
        if not mesh['faces']: continue
        dom = [max(w, key=lambda t: t[1])[0] for w in mesh['w']]
        mm = model['materials'][mesh['mats'][0]] if mesh['mats'] else {'name': 'none'}
        for f in mesh['faces']:
            b = dom[f[0]]; pr = parts.setdefault(b, {}).setdefault(mm['name'], {'mm': mm, 'P': [], 'N': [], 'UV': [], 'F': [], 'map': {}})
            idx = []
            for v in f:
                if v not in pr['map']:
                    bn = bones[b]; q = qinv(bn['wrot'])
                    p = mesh['pos'][v]; pr['map'][v] = len(pr['P'])
                    pr['P'].append(qrot(q, (p[0] - bn['wpos'][0], p[1] - bn['wpos'][1], p[2] - bn['wpos'][2])))
                    pr['N'].append(qrot(q, mesh['nrm'][v])); pr['UV'].append(mesh['uv'][v][0])
                idx.append(pr['map'][v])
            pr['F'].append([idx[0], idx[2], idx[1]])
    mesh_of = {}
    for b, mats in parts.items():
        prims = []
        for mname, pr in mats.items():
            mm = pr['mm']; N = np.array(pr['N']); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
            mat = material(('prop', mname), mname, texture(mm.get('diffuse'), PROP_TEX), texture(mm.get('normal'), PROP_TEX), overlay=bool(re.search(r'decal', mname, re.I)), fallback=builtin_color(mm.get('diffuse'), mname))
            prims.append({'attributes': {'POSITION': accessor(np.array(pr['P'], dtype=np.float32), 'VEC3', 34962, True), 'NORMAL': accessor(N.astype(np.float32), 'VEC3', 34962),
                                         'TEXCOORD_0': accessor(np.array(pr['UV'], dtype=np.float32), 'VEC2', 34962)},
                          'indices': accessor(np.array(pr['F'], dtype=np.uint32).ravel(), 'SCALAR', 34963), 'material': mat})
        gltf['meshes'].append({'name': f'bridge_{side}_{bones[b]["name"]}', 'primitives': prims}); mesh_of[b] = len(gltf['meshes']) - 1
    # bone nodes (children before parents are fine in glTF: link after creating all)
    first = len(gltf['nodes'])
    for i, bn in enumerate(bones):
        node = {'name': f'GIANT_BRIDGE_{side}_{bn["name"]}', 'translation': list(bn['lpos']), 'rotation': list(bn['lrot'])}
        if i in mesh_of: node['mesh'] = mesh_of[i]
        k = anim['bones'].get(bn['name'])
        if k and (len(k.get('rot', [])) > 1 or k.get('loc')):
            node['extras'] = {'rot': [x for f, q in k.get('rot', []) for x in (f, *q)], 'loc': [x for f, p in k.get('loc', []) for x in (f, *p)]}
        gltf['nodes'].append(node)
    for i, bn in enumerate(bones):
        if bn['parent'] >= 0: gltf['nodes'][first + bn['parent']].setdefault('children', []).append(first + i)
    roots = [first + i for i, bn in enumerate(bones) if bn['parent'] < 0]
    connect = next((f for f, n in anim['notes'] if n == 'bridge_connect'), anim['frames'] - 1)
    add_node({'name': f'GIANT_BRIDGE_{side}', 'translation': g(vec(e['origin'])).tolist(), 'rotation': AXQ, 'scale': [CM] * 3, 'children': roots,
              'extras': {'fps': anim['framerate'], 'frames': anim['frames'] - 1, 'connect': connect}})
    # lowered pose -> model space -> map space, for the deck collision (only the j_bridge part: the deck and its rails)
    def key(track, frame):
        return track[-1][1] if track else None
    world = {}
    for i, bn in enumerate(bones):
        k = anim['bones'].get(bn['name'], {})
        r = k.get('rot')[-1][1] if k.get('rot') else bn['lrot']
        t = list(bn['lpos']); l = k.get('loc')
        if l: t = [t[j] + l[-1][1][j] for j in range(3)]
        if bn['parent'] < 0: world[i] = (tuple(t), tuple(r))
        else:
            pt, pq = world[bn['parent']]; d = qrot(pq, t); world[i] = ((pt[0] + d[0], pt[1] + d[1], pt[2] + d[2]), qmul(pq, r))
    jb = bidx.get('j_bridge'); CP_, CT_ = [], []
    for mname, pr in parts.get(jb, {}).items():
        wt, wq = world[jb]; n = len(CP_)
        for p in pr['P']:
            d = qrot(wq, p); CP_.append((wt[0] + d[0], wt[1] + d[1], wt[2] + d[2]))
        CT_ += [[a + n, b_ + n, c + n] for a, b_, c in pr['F']]
    if CP_:
        P_ = g(np.array(CP_) * CM) + g(vec(e['origin']))
        gltf['meshes'].append({'name': f'bridgecol_{side}', 'primitives': [{'attributes': {'POSITION': accessor(P_.astype(np.float32), 'VEC3', 34962, True)},
                                                                           'indices': accessor(np.array(CT_, dtype=np.uint32).ravel(), 'SCALAR', 34963)}]})
        add_node({'name': f'GIANT_BRIDGECOL_{side}', 'mesh': len(gltf['meshes']) - 1})
    count('BRIDGE')

# ---- Der Eisendrache scripted pieces (the der-eisendrache mod runs them) ------------------------------------------------
def fxanim_rig(name, model_name, origin, anims):
    """A BO3 fxanim rig with several animations: a CASTLE_<name> node (bundle origin, Z-up -> Y-up, cm -> inches) over the
    rig's bone nodes (bind pose, each carrying the vertices rigidly bound to it); extras.anims[key] = {frames, fps, notes}
    and per bone extras.anims[key] = {rot, loc} runs as for The Giant's bridges (rot: absolute local quaternions, loc:
    offsets added to the bind position, [frame, ...])."""
    mpath = os.path.join(GH, 'xmodels', model_name, model_name + '_LOD0.semodel')
    if not os.path.exists(mpath): print('  rig not exported:', model_name); return
    model = read_semodel(mpath); bones = model['bones']
    loaded = {}
    for key, an in anims.items():
        ap = os.path.join(GH, 'xanims', an + '.seanim')
        if os.path.exists(ap): loaded[key] = read_seanim(ap)
        else: print('  anim not exported:', an)
    parts = {}
    for mesh in model['meshes']:
        if not mesh['faces']: continue
        dom = [max(w, key=lambda t: t[1])[0] for w in mesh['w']]
        mm = model['materials'][mesh['mats'][0]] if mesh['mats'] else {'name': 'none'}
        for f in mesh['faces']:
            b = dom[f[0]]; pr = parts.setdefault(b, {}).setdefault(mm['name'], {'mm': mm, 'P': [], 'N': [], 'UV': [], 'F': [], 'map': {}})
            idx = []
            for v in f:
                if v not in pr['map']:
                    bn = bones[b]; q = qinv(bn['wrot']); p = mesh['pos'][v]; pr['map'][v] = len(pr['P'])
                    pr['P'].append(qrot(q, (p[0] - bn['wpos'][0], p[1] - bn['wpos'][1], p[2] - bn['wpos'][2])))
                    pr['N'].append(qrot(q, mesh['nrm'][v])); pr['UV'].append(mesh['uv'][v][0])
                idx.append(pr['map'][v])
            pr['F'].append([idx[0], idx[2], idx[1]])
    mesh_of = {}
    for b, mats in parts.items():
        prims = []
        for mname, pr in mats.items():
            mm = pr['mm']; N = np.array(pr['N']); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
            mat = material(('prop', mname), mname, texture(mm.get('diffuse'), PROP_TEX), texture(mm.get('normal'), PROP_TEX), overlay=bool(re.search(r'decal', mname, re.I)), fallback=builtin_color(mm.get('diffuse'), mname))
            prims.append({'attributes': {'POSITION': accessor(np.array(pr['P'], dtype=np.float32), 'VEC3', 34962, True), 'NORMAL': accessor(N.astype(np.float32), 'VEC3', 34962),
                                         'TEXCOORD_0': accessor(np.array(pr['UV'], dtype=np.float32), 'VEC2', 34962)},
                          'indices': accessor(np.array(pr['F'], dtype=np.uint32).ravel(), 'SCALAR', 34963), 'material': mat})
        gltf['meshes'].append({'name': f'{name}_{bones[b]["name"]}', 'primitives': prims}); mesh_of[b] = len(gltf['meshes']) - 1
    first = len(gltf['nodes'])
    for i, bn in enumerate(bones):
        node = {'name': f'CASTLE_{name}_{bn["name"]}', 'translation': list(bn['lpos']), 'rotation': list(bn['lrot'])}
        if i in mesh_of: node['mesh'] = mesh_of[i]
        ka = {}
        for key, an in loaded.items():
            k = an['bones'].get(bn['name'])
            if k and (len(k.get('rot', [])) > 1 or k.get('loc')):
                ka[key] = {'rot': [x for f, q in k.get('rot', []) for x in (f, *q)], 'loc': [x for f, p in k.get('loc', []) for x in (f, *p)]}
        if ka: node['extras'] = {'anims': ka}
        gltf['nodes'].append(node)
    for i, bn in enumerate(bones):
        if bn['parent'] >= 0: gltf['nodes'][first + bn['parent']].setdefault('children', []).append(first + i)
    roots = [first + i for i, bn in enumerate(bones) if bn['parent'] < 0]
    add_node({'name': f'CASTLE_{name}', 'translation': g(origin).tolist(), 'rotation': AXQ, 'scale': [CM] * 3, 'children': roots,
              'extras': {'anims': {k: {'frames': a['frames'] - 1, 'fps': a['framerate'], 'notes': [[f, n] for f, n in a['notes'] if not n.startswith('dlc1/')]} for k, a in loaded.items()}}})
    count('CASTLE_RIG')
def place_model(name, model_name, origin, angles, extras=None, hidden=False):
    mi = prop_mesh(model_name)
    if mi is None: print('  not exported:', model_name); return
    pitch, yaw_, roll = vec(angles)
    node = {'name': name, 'mesh': mi, 'translation': g(vec(origin)).tolist(), 'rotation': quat(C @ euler_cod(pitch, yaw_, roll) @ C.T)}
    ex = dict(extras or {}); ex['model'] = model_name
    if hidden: ex['hidden'] = True
    node['extras'] = ex; add_node(node)
if BSP == 'zm_castle':
    from semodel_to_glb import qmul, qrot, qinv
    from seanim import read_seanim
    AXQ = [-math.sqrt(.5), 0, 0, math.sqrt(.5)]
    by_tn = {}
    for e in ents:
        if e.get('targetname'): by_tn.setdefault(e['targetname'], []).append(e)
    one = lambda tn: (by_tn.get(tn) or [None])[0]
    # The gondola (zm_castle_tram.gsc): two counterweighted cable cars on one bundle origin. car 2 brings a power-up
    # when a fuse is put in the console: called_a (mid-air -> docked at the station, doors open at 225) with car 1's
    # called_b (mid -> bottom); then return_a with car 1's return_b. car 1 starts docked and leaves (its return_a) 12 s in,
    # while car 2 comes up from the bottom (start).
    TRAM = [420, 420, 0]
    for car in ('01', '02'):
        base = f'p7_fxanim_zm_castle_tram_car_{car}'
        fxanim_rig(f'TRAM{car}', base + '_mod', TRAM, {k: f'{base}_{k}_anim' for k in ('called_a', 'called_b', 'return_a', 'return_b', 'start', 'idle_mid')})
    for e in by_tn.get('tram_gates', []):   # the station gates slide to their target struct while car 2 is docked
        t = one(e.get('target'))
        place_model('CASTLE_TRAMGATE', e['model'], e['origin'], e.get('angles'), {'open': g(vec(t['origin'])).tolist() if t else None})
    for e in by_tn.get('player_tram_gates', []): place_model('CASTLE_PTRAMGATE', e['model'], e['origin'], e.get('angles'))
    lv = one('tram_call_lever_2')
    if lv: place_model('CASTLE_TRAMLEVER', lv['model'], lv['origin'], lv.get('angles'))
    for tn, nm in (('tram_object_spawn_pos', 'CASTLE_TRAMDROP'), ('tram_token_spawn_pos', 'CASTLE_TRAMTOKEN'), ('docked_tram_car_interior', 'CASTLE_TRAMINSIDE')):
        x = one(tn)
        if x: add_node({'name': nm, 'translation': g(vec(x['origin'])).tolist()})
    # Landing pads (zm_castle_flingers.gsc): a launch pad (115_flinger_pad_aimer -> its jump sphere model -> the fling
    # volume) works once its landing pad (115_flinger_landing_pad, same flag) has been switched on; 500 points flings
    # whoever stands on it along the vehicle spline <base target>_spline (node speeds in mph) to the landing pad.
    for e in by_tn.get('115_flinger_landing_pad', []):
        m = one(e.get('target'))
        if not m: continue
        spots = [g(vec(x['origin'])).tolist() for x in sorted(by_tn.get(m.get('target'), []), key=lambda x: int(x.get('script_int', 0)))]
        place_model('CASTLE_LANDING_' + e['script_noteworthy'], m['model'], m['origin'], m.get('angles'), {'flag': e['script_noteworthy'], 'spots': spots})
        place_model('CASTLE_LANDINGON_' + e['script_noteworthy'], m['model'] + '_blue', m['origin'], m.get('angles'), hidden=True)
    # The teleporter (zm_castle_teleporter.gsc): trigger_teleport_pad 0 in the castle -> the V-10 rocket pad for 500 (power,
    # 45 s cooldown), pad 1 (script_noteworthy nocost) -> back for free. Destinations: each pad's target structs.
    for e in by_tn.get('trigger_teleport_pad', []):
        dst = sorted(by_tn.get(e.get('target'), []), key=lambda x: int(x.get('script_int', 0)))
        if not dst: continue
        nm = 'castlereturn' if e.get('script_noteworthy') == 'nocost' else 'rocketpad'
        o = vec(e['origin']); d = dst[0]
        marker(f'TELEPORT_{nm}', [o[0], o[1], o[2] - 56], 0, {'cost': 0 if nm == 'castlereturn' else 500, 'cooldown': 45, 'power': True, 'visual': False})
        marker(f'TPDEST_{nm}', vec(d['origin']), vec(d.get('angles'))[1]); count('TELEPORT')
    # Pack-a-Punch quest (zm_castle_pap_quest.gsc): the machine (the PAP marker, BO3's storage spot under the map) is
    # hidden until two of the three s_pap_tp spots (under/rocket/roof) are activated; it re-forms at the third
    # (s_pap_location, its machine origin 16 lower) once a player looks at it from within 400, then moves to the next
    # location 2-3 rounds after each first use. Their scattered parts are BO3 script_models.
    for e in by_tn.get('s_pap_location', []):
        o = vec(e['origin'])
        add_node({'name': f'CASTLE_PAPLOC_{e["script_noteworthy"]}', 'translation': g([o[0], o[1], o[2] - 16]).tolist(),
                  'extras': {'yaw': math.radians(vec(e.get('angles'))[1]), 'index': int(e.get('script_int', 0))}})
    for e in by_tn.get('s_pap_tp', []):
        add_node({'name': f'CASTLE_PAPTP_{e["script_noteworthy"]}', 'translation': g(vec(e['origin'])).tolist()})
        for part in by_tn.get(e.get('target'), []):
            place_model(f'CASTLE_PAPPART_{e["script_noteworthy"]}', part['model'], part['origin'], part.get('angles'))
        count('PAP_SPOT')
    # lamps for the der-eisendrache mod's light pool: lit fixtures among the static models, merged within 150 units
    LIT = re.compile(r'candle_.*_on|torch_wall|light_sconce|light_cage|light_spot_hanging$|light_industrial|hurricane_lamp|light_chandelier(?!_chain)|light_lamp_vintage|light_bulb_edison|camp_fire_pit|light_hanging_ball_01$', re.I)
    lamps = []
    for m in info['models']:
        if LIT.search(m['name']) and all(np.linalg.norm(np.array(m['origin']) - np.array(q)) > 150 for q in lamps): lamps.append(m['origin'])
    for k, o in enumerate(lamps): add_node({'name': f'CASTLE_LAMP_{k}', 'translation': g(o).tolist()})
    counts['CASTLE_LAMP'] = len(lamps)
    for e in by_tn.get('115_flinger_pad_aimer', []):
        m = one(e.get('target'))
        if not m: continue
        vol = one(m.get('target')); n = one(m['target'] + '_spline'); path, speeds = [], []
        while n and len(path) < 40:
            path.append(g(vec(n['origin'])).tolist()); speeds.append(float(n.get('speed', 90)) * 17.6); n = one(n.get('target'))
        flag = e['script_noteworthy']
        place_model('CASTLE_FLINGER_' + flag, m['model'], m['origin'], m.get('angles'),
                    {'flag': flag, 'path': path, 'speeds': speeds, 'volume': g(vec(vol['origin'])).tolist() if vol else g(vec(m['origin'])).tolist()})
        place_model('CASTLE_FLINGERON_' + flag, m['model'] + '_blue', m['origin'], m.get('angles'), hidden=True)
        count('FLINGER')

print('window openings (bottom, top, width):', openings)
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

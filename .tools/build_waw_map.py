#!/usr/bin/env python3
"""Builds a Kino custom zombies map (export/web/mods/maps/<id>/<id>.glb, see mods/README.md) from a
World at War map dumped with OpenAssetTools' Unlinker (with this fork's T4 GfxWorld dumper).

  python3 .tools/build_waw_map.py <dump dir of the zone> <out dir> [--flip] [--max-tex 512]

The dump dir holds maps/<zone>.d3dbsp.obj (+ .smodels.json, .brushmodels.json, .ents), materials/ and
images/. Output is a GLB in CoD inches, Y up (x, y, z) -> (x, z, -y), with the markers the map format needs
(PLAYER_SPAWN, ZSPAWN_<zone>, DOOR_<zone>_<cost> meshes, WALLBUY_, PERK_, BOX_start, PAP). Textures are
converted from DDS to WebP with ffmpeg. Standard library plus ffmpeg only. The output is ripped game data:
keep it out of git (the map folder gets a .gitignore).
"""
import collections, json, math, pathlib, re, struct, subprocess, sys, tempfile

SKIP_MATERIAL = re.compile(r'sky|clip|trigger|nodraw|caulk|portal|hint|origin', re.I)
# Wall weapons the map names -> weapons this game has (the map's own are not in the game)
WEAPON_MAP = {'kap40': 'bo3_g18_death', 'pdw': 'bo3_mp7_flanker', 'cheese_gun': 'ray_gun_zm', 'm1927': 'bo3_tommy_modern',
              'm27': 'bo3_sa80', 'aek': 'bo3_ak117', 'an94': 'bo3_f2000_tech'}
PERK_MAP = {'specialty_armorvest': 'jugg', 'specialty_quickrevive': 'revive', 'specialty_fastreload': 'speedcola', 'specialty_rof': 'doubletap'}

def g(p):  # CoD (x, y, z up) -> glTF (x, z, -y)
    return (p[0], p[2], -p[1])

def parse_ents(path):
    ents = []
    for block in re.findall(r'\{(.*?)\}', open(path, encoding='utf-8', errors='replace').read(), re.S):
        ents.append(dict(re.findall(r'"([^"]*)"\s+"([^"]*)"', block)))
    return ents

def vec(s, n=3):
    v = [float(x) for x in (s or '').split()]
    return (v + [0.0] * n)[:n]

def yaw_quat(deg):  # a marker faces its local +X; CoD yaw is about +Z, which is -Y... see g(): rotation about +Y by deg
    r = math.radians(deg) / 2
    return [0, math.sin(r), 0, math.cos(r)]

def read_obj(path):
    surfaces, cur, nv = [], None, 0
    for line in open(path):
        if line.startswith('o '):
            cur = {'idx': int(line.split('_')[1]), 'mat': '', 'v': [], 'vt': [], 'vn': [], 'f': [], 'vbase': nv}
            surfaces.append(cur)
        elif line.startswith('usemtl '):
            cur['mat'] = line.split(None, 1)[1].strip()
        elif line.startswith('v '):
            cur['v'].append(tuple(float(x) for x in line.split()[1:4])); nv += 1
        elif line.startswith('vt '):
            cur['vt'].append(tuple(float(x) for x in line.split()[1:3]))
        elif line.startswith('vn '):
            cur['vn'].append(tuple(float(x) for x in line.split()[1:4]))
        elif line.startswith('f '):
            cur['f'].append(tuple(int(t.split('/')[0]) - 1 - cur['vbase'] for t in line.split()[1:4]))
    return surfaces

class Builder:
    def __init__(self, dump, max_tex):
        self.dump, self.max_tex = pathlib.Path(dump), max_tex
        self.bin = bytearray(); self.views, self.accessors = [], []
        self.images, self.textures, self.materials, self.meshes, self.nodes = [], [], [], [], []
        self.tex_index, self.mat_index = {}, {}
        self.tmp = pathlib.Path(tempfile.mkdtemp())

    # ---- materials and textures ----
    def material_info(self, name):
        path = self.dump / 'materials' / (name + '.json')
        info = {'image': None, 'alpha': 'OPAQUE'}
        if not path.exists():
            return info
        m = json.load(open(path))
        for t in m.get('textures', []):
            if t.get('semantic') == 'colorMap' and not t['image'].startswith('$'):
                info['image'] = t['image']
        for sb in m.get('stateBits', []):
            if sb.get('alphaTest', 'disabled') != 'disabled':
                info['alpha'] = 'MASK'
        for sb in m.get('stateBits', []):
            if sb.get('blendOpRgb', 'disabled') != 'disabled' and sb.get('dstBlendRgb') not in (None, 'zero') and 'glass' in name + (info['image'] or ''):
                info['alpha'] = 'BLEND'
        return info

    def texture(self, image):
        if image in self.tex_index:
            return self.tex_index[image]
        src = self.dump / 'images' / (image + '.dds')
        idx = None
        if src.exists():
            out = self.tmp / (re.sub(r'[^A-Za-z0-9_.-]', '_', image) + '.webp')
            r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(src), '-frames:v', '1', '-vf',
                                f"scale='min({self.max_tex},iw)':-1", '-c:v', 'libwebp', '-quality', '80', str(out)], capture_output=True)
            if r.returncode == 0 and out.exists():
                view = self.add_view(out.read_bytes())
                self.images.append({'bufferView': view, 'mimeType': 'image/webp', 'name': image})
                self.textures.append({'extensions': {'EXT_texture_webp': {'source': len(self.images) - 1}}})
                idx = len(self.textures) - 1
        self.tex_index[image] = idx
        return idx

    def material(self, name):
        if name in self.mat_index:
            return self.mat_index[name]
        info = self.material_info(name)
        pbr = {'metallicFactor': 0.0, 'roughnessFactor': 0.9}
        tex = self.texture(info['image']) if info['image'] else None
        if tex is not None:
            pbr['baseColorTexture'] = {'index': tex}
        else:
            pbr['baseColorFactor'] = [0.5, 0.5, 0.5, 1]
        mat = {'name': name, 'pbrMetallicRoughness': pbr, 'doubleSided': True}
        if info['alpha'] != 'OPAQUE':
            mat['alphaMode'] = info['alpha']
            if info['alpha'] == 'MASK':
                mat['alphaCutoff'] = 0.5
        self.materials.append(mat)
        self.mat_index[name] = len(self.materials) - 1
        return self.mat_index[name]

    # ---- binary buffer ----
    def add_view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            view['target'] = target
        self.bin.extend(data)
        self.views.append(view)
        return len(self.views) - 1

    def accessor(self, data, ctype, count, atype, target, minmax=None):
        a = {'bufferView': self.add_view(data, target), 'componentType': ctype, 'count': count, 'type': atype}
        if minmax:
            a['min'], a['max'] = minmax
        self.accessors.append(a)
        return len(self.accessors) - 1

    def primitive(self, matname, pos, nor, uv, idx, flip):
        # Wind every triangle to agree with its vertex normals (the winding of the dumped data is not uniform,
        # and the navmesh builder decides walkable floors from it). `flip` inverts the result.
        fixed = []
        for a, c, d in idx:
            p0, p1, p2 = pos[a], pos[c], pos[d]
            u = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); v = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
            n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
            sx = nor[a][0] + nor[c][0] + nor[d][0]; sy = nor[a][1] + nor[c][1] + nor[d][1]; sz = nor[a][2] + nor[c][2] + nor[d][2]
            dot = n[0] * sx + n[1] * sy + n[2] * sz
            fixed.append((a, d, c) if (dot < 0) != flip else (a, c, d))
        idx = fixed
        pos_b = b''.join(struct.pack('<3f', *p) for p in pos)
        nor_b = b''.join(struct.pack('<3f', *n) for n in nor)
        uv_b = b''.join(struct.pack('<2f', *t) for t in uv)
        idx_b = b''.join(struct.pack('<3I', *f) for f in idx)
        lo = [min(p[i] for p in pos) for i in range(3)]; hi = [max(p[i] for p in pos) for i in range(3)]
        return {'attributes': {'POSITION': self.accessor(pos_b, 5126, len(pos), 'VEC3', 34962, [lo, hi]),
                               'NORMAL': self.accessor(nor_b, 5126, len(nor), 'VEC3', 34962),
                               'TEXCOORD_0': self.accessor(uv_b, 5126, len(uv), 'VEC2', 34962)},
                'indices': self.accessor(idx_b, 5125, len(idx) * 3, 'SCALAR', 34963), 'material': self.material(matname)}

    def add_mesh_node(self, name, prims, translation=None):
        self.meshes.append({'name': name, 'primitives': prims})
        node = {'name': name, 'mesh': len(self.meshes) - 1}
        if translation:
            node['translation'] = translation
        self.nodes.append(node)

    def add_marker(self, name, pos, yaw=0):
        self.nodes.append({'name': name, 'translation': [round(c, 3) for c in g(pos)], 'rotation': yaw_quat(yaw)})

    def write(self, path):
        gltf = {'asset': {'version': '2.0', 'generator': 'build_waw_map.py'}, 'scene': 0,
                'scenes': [{'nodes': list(range(len(self.nodes)))}], 'nodes': self.nodes, 'meshes': self.meshes,
                'materials': self.materials, 'accessors': self.accessors, 'bufferViews': self.views,
                'buffers': [{'byteLength': len(self.bin)}]}
        if self.images:
            gltf.update({'images': self.images, 'textures': self.textures, 'extensionsUsed': ['EXT_texture_webp']})
        js = json.dumps(gltf, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        data = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        path.write_bytes(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(data)) + struct.pack('<II', len(js), 0x4E4F534A) + js
                         + struct.pack('<II', len(data), 0x004E4942) + data)

def surfaces_to_prims(b, surfaces, flip):
    by_mat = collections.defaultdict(lambda: ([], [], [], []))
    for s in surfaces:
        pos, nor, uv, idx = by_mat[s['mat']]
        base = len(pos)
        pos.extend(g(p) for p in s['v']); nor.extend(g(n) for n in s['vn']); uv.extend((t[0], 1 - t[1]) for t in s['vt'])  # the OBJ's v is flipped (v up); glTF's points down
        idx.extend((base + a, base + c, base + d) for a, c, d in s['f'])
    return [b.primitive(mat, *data, flip) for mat, data in by_mat.items() if data[3]]

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flip = '--flip' in sys.argv
    max_tex = int(sys.argv[sys.argv.index('--max-tex') + 1]) if '--max-tex' in sys.argv else 512
    if len(args) < 2:
        sys.exit(__doc__)
    dump, out = pathlib.Path(args[0]), pathlib.Path(args[1])
    zone = next((dump / 'maps').glob('*.d3dbsp.obj')).name[:-len('.d3dbsp.obj')]
    obj_base = dump / 'maps' / (zone + '.d3dbsp')
    cfg_path = pathlib.Path(__file__).resolve().parent / 'waw_maps' / (zone + '.json')
    cfg = json.load(open(cfg_path)) if cfg_path.exists() else {}
    ents = parse_ents(str(obj_base) + '.ents')
    brush = {m['index']: m for m in json.load(open(str(obj_base) + '.brushmodels.json'))['brushModels']}
    surfaces = [s for s in read_obj(str(obj_base) + '.obj') if s['mat'] and not SKIP_MATERIAL.search(s['mat'])]
    # Brush models (everything but model 0: doors, moving stairs, plates, the rising plane...) store their geometry
    # relative to their entity's origin. Place each one with its entity's origin and angles.
    def rot(angles):
        pitch, yaw, roll = (math.radians(a) for a in angles)
        cp, sp, cy, sy, cr, sr = math.cos(pitch), math.sin(pitch), math.cos(yaw), math.sin(yaw), math.cos(roll), math.sin(roll)
        return [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
                [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
                [-sp, cp * sr, cp * cr]]
    by_index = {s['idx']: s for s in surfaces}
    placed_models = 0
    for e in ents:
        if not e.get('model', '').startswith('*') or int(e['model'][1:]) == 0 or int(e['model'][1:]) not in brush:
            continue
        m = brush[int(e['model'][1:])]
        o, R = vec(e.get('origin')), rot(vec(e.get('angles')))
        for k in range(m['startSurface'], m['startSurface'] + m['surfaceCount']):
            sf = by_index.get(k)
            if not sf:
                continue
            sf['v'] = [tuple(o[i] + sum(R[i][j] * v[j] for j in range(3)) for i in range(3)) for v in sf['v']]
            sf['vn'] = [tuple(sum(R[i][j] * n[j] for j in range(3)) for i in range(3)) for n in sf['vn']]
        placed_models += 1
    print(f'placed {placed_models} brush models at their entity origins')

    # Clip oversized surfaces (a death/ground plane tens of thousands of units wide) to the map's footprint: the
    # game sizes its navmesh cells from the bounds, so one huge plane makes them too coarse for corridors.
    small = [s for s in surfaces if max(max(v[i] for v in s['v']) - min(v[i] for v in s['v']) for i in (0, 1)) <= 2500]
    lo = [min(v[i] for s in small for v in s['v']) - 150 for i in (0, 1)]
    hi = [max(v[i] for s in small for v in s['v']) + 150 for i in (0, 1)]
    for s in surfaces:
        if s in small:
            continue
        a = next((t for t in s['f']), None)
        p0, p1, p2 = (s['v'][k] for k in a); t0, t1, t2 = (s['vt'][k] for k in a)
        det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
        fit = None
        if abs(det) > 1e-6:  # (u, v) as a linear function of (x, y), fitted on one triangle
            def lin(c0, c1, c2):
                gx = ((c1 - c0) * (p2[1] - p0[1]) - (c2 - c0) * (p1[1] - p0[1])) / det
                gy = ((c2 - c0) * (p1[0] - p0[0]) - (c1 - c0) * (p2[0] - p0[0])) / det
                return gx, gy, c0 - gx * p0[0] - gy * p0[1]
            fit = (lin(t0[0], t1[0], t2[0]), lin(t0[1], t1[1], t2[1]))
        for k, v in enumerate(s['v']):
            x, y = min(max(v[0], lo[0]), hi[0]), min(max(v[1], lo[1]), hi[1])
            s['v'][k] = (x, y, v[2])
            if fit:
                s['vt'][k] = tuple(f[0] * x + f[1] * y + f[2] for f in fit)
        print(f"clipped {s['mat']} to the map footprint")
    b = Builder(dump, max_tex)
    out.mkdir(parents=True, exist_ok=True)

    # zones: <zone>_spawners_rise structs. 'start_zone' is 'start'.
    zone_name = lambda t: 'start' if t.startswith('start_zone') else t.split('_spawners')[0]
    spawners = [(zone_name(e['targetname']), vec(e['origin'])) for e in ents if e.get('targetname', '').endswith('_spawners_rise')]
    zone_z = {}
    for z, o in spawners:
        zone_z.setdefault(z, []).append(o[2])
    zone_z = {z: sum(v) / len(v) for z, v in zone_z.items()}
    nearest_zone = lambda z: min(zone_z, key=lambda k: abs(zone_z[k] - z)) if zone_z else 'start'

    # doors: a trigger's `target` names script_brushmodels whose surfaces become the DOOR mesh
    by_target = collections.defaultdict(list)
    for e in ents:
        if e.get('classname') == 'script_brushmodel' and e.get('targetname'):
            by_target[e['targetname']].append(e)
    door_surfaces, doors = set(), []
    for e in ents:
        if e.get('targetname') not in ('zombie_door', 'zombie_debris'):
            continue
        wanted = set()
        for piece in by_target.get(e.get('target', ''), []):
            m = brush.get(int(piece['model'].lstrip('*')))
            if m:
                wanted.update(range(m['startSurface'], m['startSurface'] + m['surfaceCount']))
        flag = e.get('script_flag', '')
        zone_id = flag.replace('enter_', '') if flag.startswith('enter_zone') else nearest_zone(vec(e['origin'])[2])
        doors.append((zone_id, int(e.get('zombie_cost', 750)), wanted))
        door_surfaces |= wanted

    rising = cfg.get('rising')
    rising_surfaces = [s for s in surfaces if rising and s['mat'] == rising['material']]
    world_surfaces = [s for s in surfaces if s['idx'] not in door_surfaces and s not in rising_surfaces]
    b.add_mesh_node('world', surfaces_to_prims(b, world_surfaces, flip))
    if rising_surfaces:  # a death plane that climbs (see RISING in mods/README.md): render-only, no collision or navigation
        b.add_mesh_node(f"RISING_{rising['delay']}_{rising['speed']}", surfaces_to_prims(b, rising_surfaces, flip))
    for zone_id, cost, wanted in doors:
        pieces = [s for s in surfaces if s['idx'] in wanted]
        if pieces:
            b.add_mesh_node(f'DOOR_{zone_id}_{cost}', surfaces_to_prims(b, pieces, flip))

    # markers
    for e in ents:
        if e.get('targetname') == 'initial_spawn_points':
            b.add_marker('PLAYER_SPAWN', vec(e['origin']), vec(e.get('angles'))[1])
    low = cfg.get('dropSpawnersBelow')
    dropped = 0
    for z, o in spawners:
        if low is not None and o[2] < low:
            dropped += 1  # on a floor the navmesh does not connect to the rest of the map: zombies would get stuck
            continue
        b.add_marker(f'ZSPAWN_{z}', o)
    for z, pts in cfg.get('extraSpawns', {}).items():
        for o in pts:
            b.add_marker(f'ZSPAWN_{z}', o)
    if dropped:
        print(f'dropped {dropped} spawners below z={low}')
    models = {e['targetname']: e for e in ents if e.get('classname') == 'script_model' and e.get('targetname')}
    def site(e):  # the machine model the trigger points at, else the trigger
        m = models.get(e.get('target', ''))
        return (vec((m or e)['origin']), vec((m or e).get('angles'))[1])
    for e in ents:
        t = e.get('targetname')
        if t == 'weapon_upgrade' and e.get('zombie_weapon_upgrade') in WEAPON_MAP:
            b.add_marker('WALLBUY_' + WEAPON_MAP[e['zombie_weapon_upgrade']], vec(e['origin']), vec(e.get('angles'))[1])
        elif t == 'zombie_vending' and e.get('script_noteworthy') in PERK_MAP:
            o, yaw = site(e)
            b.add_marker('PERK_' + PERK_MAP[e['script_noteworthy']], o, yaw)
        elif t == 'zombie_vending_upgrade':
            o, yaw = site(e)
            b.add_marker('PAP', o, yaw)
        elif t == 'treasure_chest_use':
            o, yaw = site(e)
            b.add_marker('BOX_start' if e.get('script_noteworthy') == 'start_chest' else 'BOX', o, yaw)

    # placed static models (props; skinned models such as characters are skipped)
    placed = 0
    for inst in json.load(open(str(obj_base) + '.smodels.json'))['models']:
        path = dump / 'model_export' / (inst['model'] + '_lod0.glb')
        if not path.exists() or inst['model'].startswith(('char_', 'viewmodel_', 'weapon_')):
            continue
        prims = load_static_glb(b, path, inst, flip)
        if prims:
            b.add_mesh_node('prop_' + inst['model'], prims)
            placed += 1

    b.write(out / (out.name + '.glb'))
    (out / '.gitignore').write_text('# Ripped game data: keep it local.\n*\n!.gitignore\n')
    print(f'{zone}: {len(surfaces)} surfaces, {len(doors)} doors, {placed} props, {len(b.materials)} materials, {len(b.images)} textures,'
          f' {(out / (out.name + ".glb")).stat().st_size / 1e6:.1f} MB')

def mat_mul(a, c):
    return [[sum(a[i][k] * c[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def node_matrix(n):
    if 'matrix' in n:
        m = n['matrix']; return [[m[j * 4 + i] for j in range(4)] for i in range(4)]
    t, r, s = n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[R[i][0] * s[0], R[i][1] * s[1], R[i][2] * s[2], t[i]] for i in range(3)] + [[0, 0, 0, 1]]

def load_static_glb(b, path, inst, flip):
    raw = path.read_bytes()
    jl = struct.unpack('<I', raw[12:16])[0]
    j = json.loads(raw[20:20 + jl])
    if j.get('skins'):
        return []
    bin_off = 20 + jl + 8
    def accessor(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']]
        size = struct.calcsize(fmt) * n
        stride = v.get('byteStride') or size
        off = bin_off + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + fmt * n, raw, off + k * stride) for k in range(a['count'])]
    origin, axis, scale = inst['origin'], inst['axis'], inst['scale']
    def place(p):  # glTF-local (Y up) -> CoD-local (Z up) -> placed in CoD space -> game space
        c = (p[0], -p[2], p[1])
        w = [origin[i] + scale * (c[0] * axis[0][i] + c[1] * axis[1][i] + c[2] * axis[2][i]) for i in range(3)]
        return g(w)
    def place_dir(p):
        c = (p[0], -p[2], p[1])
        w = [c[0] * axis[0][i] + c[1] * axis[1][i] + c[2] * axis[2][i] for i in range(3)]
        return g(w)
    prims, world = [], {}
    def walk(i, parent):
        n = j['nodes'][i]; m = mat_mul(parent, node_matrix(n)); world[i] = m
        for c in n.get('children', []):
            walk(c, m)
    ident = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    for r in j['scenes'][j.get('scene', 0)]['nodes']:
        walk(r, ident)
    for i, n in world.items():
        node = j['nodes'][i]
        if 'mesh' not in node:
            continue
        for prim in j['meshes'][node['mesh']]['primitives']:
            at = prim['attributes']
            if 'POSITION' not in at or 'indices' not in prim:
                continue
            tf = lambda p: tuple(sum(n[r][k] * (p[k] if k < 3 else 1) for k in range(4)) for r in range(3))
            pos = [place(tf(p)) for p in accessor(at['POSITION'])]
            nor = [place_dir(tuple(sum(n[r][k] * p[k] for k in range(3)) for r in range(3))) for p in accessor(at['NORMAL'])] if 'NORMAL' in at else [(0, 1, 0)] * len(pos)
            uv = accessor(at['TEXCOORD_0']) if 'TEXCOORD_0' in at else [(0, 0)] * len(pos)
            flat = [x[0] for x in accessor(prim['indices'])]
            idx = [tuple(flat[k:k + 3]) for k in range(0, len(flat) - 2, 3)]
            matname = j['materials'][prim['material']]['name'] if 'material' in prim else 'default'
            if SKIP_MATERIAL.search(matname):
                continue
            prims.append(b.primitive(matname, pos, nor, uv, idx, flip))
    return prims

if __name__ == '__main__':
    main()

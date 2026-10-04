"""Convert a Greyhound SEModel (.semodel, SETools format v1) to a skinned GLB.

    python3 .tools/semodel_to_glb.py model.semodel out.glb [texture_dir]

Used for Black Ops III assets exported with Greyhound from the user's own
install (outputs stay git-ignored, like the BO1 ones). Bones keep their names
(tag_weapon, j_gun, ...), so the game's weapon code finds them as with BO1.
Textures: each material's diffuse (and normal) map is looked up in
texture_dir as <name>.png and embedded. Units stay in inches, like BO1.
"""
import json, math, pathlib, struct, sys

def read_semodel(path):
    b = pathlib.Path(path).read_bytes(); o = 0
    def take(fmt):
        nonlocal o
        v = struct.unpack_from('<'+fmt, b, o); o += struct.calcsize('<'+fmt); return v
    def cstr():
        nonlocal o
        e = b.index(0, o); s = b[o:e].decode('utf-8', 'replace'); o = e+1; return s
    if b[:7] != b'SEModel': raise ValueError('not an SEModel file')
    o = 7
    version, header_size = take('HH')
    data_flags, bone_flags, mesh_flags = take('BBB')
    bone_count, mesh_count, mat_count = take('III')
    o += 3   # reserved
    names = [cstr() for _ in range(bone_count)]
    bones = []
    for i in range(bone_count):
        flags, parent = take('Bi')
        bone = {'name': names[i], 'parent': parent}
        if bone_flags & 1: bone['wpos'] = take('fff'); bone['wrot'] = take('ffff')
        if bone_flags & 2: bone['lpos'] = take('fff'); bone['lrot'] = take('ffff')
        if bone_flags & 4: bone['scale'] = take('fff')
        bones.append(bone)
    bfmt = 'B' if bone_count <= 0xff else 'H' if bone_count <= 0xffff else 'I'
    meshes = []
    for _ in range(mesh_count):
        flags, layers, influences, nv, nf = take('BBBII')
        m = {'pos': [take('fff') for _ in range(nv)]}
        if mesh_flags & 1: m['uv'] = [[take('ff') for _ in range(layers)] for _ in range(nv)]
        if mesh_flags & 2: m['nrm'] = [take('fff') for _ in range(nv)]
        if mesh_flags & 4: m['col'] = [take('BBBB') for _ in range(nv)]
        if mesh_flags & 8: m['w'] = [[(take(bfmt)[0], take('f')[0]) for _ in range(influences)] for _ in range(nv)]
        ifmt = 'B' if nv <= 0xff else 'H' if nv <= 0xffff else 'I'
        m['faces'] = [take(ifmt*3) for _ in range(nf)]
        m['mats'] = [take('i')[0] for _ in range(layers)]
        meshes.append(m)
    mats = []
    for _ in range(mat_count):
        name = cstr(); simple = take('B')[0]; mat = {'name': name}
        if simple: mat['diffuse'], mat['normal'], mat['specular'] = cstr(), cstr(), cstr()
        mats.append(mat)
    return {'version': version, 'bones': bones, 'meshes': meshes, 'materials': mats}

# ---- quaternion helpers (x, y, z, w) ----
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz)
def qinv(q): return (-q[0], -q[1], -q[2], q[3])
def qrot(q, v):
    x, y, z, _ = qmul(qmul(q, (v[0], v[1], v[2], 0)), qinv(q)); return (x, y, z)
def mat4(t, q):   # column-major TRS (no scale)
    x, y, z, w = q
    return [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0, 2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
            2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0, t[0], t[1], t[2], 1]
def inv_rigid(t, q):
    qi = qinv(q); ti = qrot(qi, (-t[0], -t[1], -t[2])); return mat4(ti, qi)

def to_glb(model, out, tex_dir=None, texture_loader=None, rename=None, glow=None, glow_maps=None):
    """texture_loader(name, kind) -> (bytes, mime) or None, kind in diffuse/normal/rough;
    rename: {old bone name: new} (e.g. BO3 hands' tag_weapon_right -> tag_weapon)."""
    rename = rename or {}
    # Call of Duty is Z-up; glTF is Y-up: (x, y, z) -> (x, z, -y), same as the BO1 exports.
    AX = (-math.sqrt(.5), 0, 0, math.sqrt(.5))   # -90° about X
    bones = model['bones']; nb = len(bones)
    world = []
    for bn in bones:
        if 'wpos' in bn: world.append((qrot(AX, bn['wpos']), qmul(AX, bn['wrot'])))
        else: world.append(None)
    for i, bn in enumerate(bones):   # local-only files: build world transforms down the hierarchy
        if world[i] is None:
            pt, pq = world[bn['parent']] if bn['parent'] >= 0 else ((0, 0, 0), AX)
            lp = qrot(pq, bn['lpos']); world[i] = ((pt[0]+lp[0], pt[1]+lp[1], pt[2]+lp[2]), qmul(pq, bn['lrot']))
    nodes = []
    for i, bn in enumerate(bones):
        t, q = world[i]
        if bn['parent'] >= 0:
            pt, pq = world[bn['parent']]; pqi = qinv(pq)
            t = qrot(pqi, (t[0]-pt[0], t[1]-pt[1], t[2]-pt[2])); q = qmul(pqi, q)
        nodes.append({'name': rename.get(bn['name'], bn['name']), 'translation': list(t), 'rotation': list(q)})
    for i, bn in enumerate(bones):
        if bn['parent'] >= 0: nodes[bn['parent']].setdefault('children', []).append(i)
    roots = [i for i, bn in enumerate(bones) if bn['parent'] < 0]

    bin_ = bytearray(); views = []; accessors = []
    def add(data, comp, typ, count, target=None, mn=None, mx=None):
        while len(bin_) % 4: bin_.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), **({'target': target} if target else {})})
        bin_.extend(data)
        acc = {'bufferView': len(views)-1, 'componentType': comp, 'count': count, 'type': typ}
        if mn is not None: acc['min'], acc['max'] = mn, mx
        accessors.append(acc); return len(accessors)-1

    images, textures, materials, tex_index = [], [], [], {}
    used_webp = False
    def embed(data, mime):
        nonlocal used_webp
        while len(bin_) % 4: bin_.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data)}); bin_.extend(data)
        images.append({'bufferView': len(views)-1, 'mimeType': mime})
        if mime == 'image/webp': used_webp = True; textures.append({'extensions': {'EXT_texture_webp': {'source': len(images)-1}}})
        else: textures.append({'source': len(images)-1})
        return len(textures)-1
    def texture(name, kind):
        if not name: return None
        key = (name, kind)
        if key in tex_index: return tex_index[key]
        got = None
        if texture_loader: got = texture_loader(pathlib.Path(name.replace('\\', '/')).stem, kind)
        elif tex_dir and kind != 'rough':
            p = pathlib.Path(tex_dir)/(pathlib.Path(name.replace('\\', '/')).stem+'.png')
            if p.exists(): got = (p.read_bytes(), 'image/png')
        tex_index[key] = embed(*got) if got else None
        return tex_index[key]
    glow_tex = None
    def radial():   # soft white spot with alpha falloff, for BO3's effect-only glow cards
        import zlib
        n = 64; rows = b''
        for y in range(n):
            rows += b'\0'
            for x in range(n):
                d = min(1, math.hypot(x-n/2+.5, y-n/2+.5)/(n/2)); a = int(255*(1-d)**2)
                rows += bytes([255, 255, 255, a])
        chunk = lambda t, d: struct.pack('>I', len(d))+t+d+struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
        return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0))+chunk(b'IDAT', zlib.compress(rows))+chunk(b'IEND', b'')
    for m in model['materials']:
        mat = {'name': m['name'], 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': .7}}
        if 'fullalpha' in (m.get('diffuse') or ''):
            # BO3 draws these (light cards, glow shells) with an effect shader; its colour slot is blank.
            # Show them as a soft emissive spot that fades out, so they don't render as solid boxes.
            gm = (glow_maps or {}).get(m['name'])   # (png bytes, [scroll u, v] per s, tint by gun colour?)
            if gm:   # BO3's own glow image (pattern in its alpha), scrolled at runtime (mods/bo3-weapons: bo3glow)
                t = embed(gm[0], 'image/png'); c = [int(glow.lstrip('#')[i:i+2], 16)/255 for i in (0, 2, 4)] if glow and gm[2] else [1, 1, 1]
                mat.update({'alphaMode': 'BLEND', 'doubleSided': True, 'emissiveTexture': {'index': t}, 'emissiveFactor': c,
                            'extras': {'bo3glow': {'scroll': gm[1], 'tint': gm[2]}}})
                mat['pbrMetallicRoughness'].update({'baseColorTexture': {'index': t}, 'baseColorFactor': [0, 0, 0, 1]})
                materials.append(mat); continue
            mat['extras'] = {'bo3glow': {'card': True}}
            if glow_tex is None: glow_tex = embed(radial(), 'image/png')
            c = [int(glow.lstrip('#')[i:i+2], 16)/255 for i in (0, 2, 4)] if glow else [1, 1, 1]
            mat.update({'alphaMode': 'BLEND', 'doubleSided': True, 'emissiveTexture': {'index': glow_tex}, 'emissiveFactor': c})
            mat['pbrMetallicRoughness'].update({'baseColorTexture': {'index': glow_tex}, 'baseColorFactor': [0, 0, 0, 1]})
            materials.append(mat); continue
        d = texture(m.get('diffuse'), 'diffuse'); n = texture(m.get('normal'), 'normal')
        r = texture((m.get('diffuse') or '').replace('_c.png', '_g.png'), 'rough') if m.get('diffuse') else None
        if d is not None: mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': d}
        elif 'black_color' in (m.get('diffuse') or ''): mat['pbrMetallicRoughness']['baseColorFactor'] = [.02, .02, .02, 1]   # BO3's built-in $black_color
        elif '$color_black_' in (m.get('diffuse') or ''):   # $color_black_40 etc.: a grey of that percentage
            g = 1-int(m['diffuse'].split('$color_black_')[1].split('.')[0])/100; mat['pbrMetallicRoughness']['baseColorFactor'] = [g*.25, g*.25, g*.25, 1]
        if n is not None: mat['normalTexture'] = {'index': n}
        if r is not None: mat['pbrMetallicRoughness']['metallicRoughnessTexture'] = {'index': r}; mat['pbrMetallicRoughness']['roughnessFactor'] = 1
        materials.append(mat)

    prims = []
    skinned = nb > 0 and all('w' in m for m in model['meshes'])
    for m in model['meshes']:
        pos = [qrot(AX, p) for p in m['pos']]; nv = len(pos)
        attrs = {'POSITION': add(b''.join(struct.pack('<fff', *p) for p in pos), 5126, 'VEC3', nv, 34962,
                                 [min(p[k] for p in pos) for k in range(3)], [max(p[k] for p in pos) for k in range(3)])}
        if 'nrm' in m: attrs['NORMAL'] = add(b''.join(struct.pack('<fff', *qrot(AX, n)) for n in m['nrm']), 5126, 'VEC3', nv, 34962)
        if 'uv' in m: attrs['TEXCOORD_0'] = add(b''.join(struct.pack('<ff', u[0][0], u[0][1]) for u in m['uv']), 5126, 'VEC2', nv, 34962)
        if skinned:
            js, ws = bytearray(), bytearray()
            for w in m['w']:
                top = sorted(w, key=lambda x: -x[1])[:4]+[(0, 0.0)]*4; top = top[:4]; s = sum(x[1] for x in top) or 1
                js += struct.pack('<HHHH', *[x[0] for x in top]); ws += struct.pack('<ffff', *[x[1]/s for x in top])
            attrs['JOINTS_0'] = add(bytes(js), 5123, 'VEC4', nv, 34962); attrs['WEIGHTS_0'] = add(bytes(ws), 5126, 'VEC4', nv, 34962)
        idx = b''.join(struct.pack('<III', f[0], f[2], f[1]) for f in m['faces'])   # CoD winding is clockwise
        prim = {'attributes': attrs, 'indices': add(idx, 5125, 'SCALAR', len(m['faces'])*3, 34963)}
        if m['mats'] and 0 <= m['mats'][0] < len(materials): prim['material'] = m['mats'][0]
        src = model['materials'][prim['material']] if 'material' in prim else {}
        if materials[prim.get('material', 0)]['name'].startswith('mtl_hud'): continue   # in-world HUD screens (need BO3's live UI)
        if 'diffuse' in src and not src['diffuse'] and not src.get('normal'): continue
        if 'blacktransparent' in (src.get('diffuse') or ''): continue
        if '$white_diffuse' in (src.get('diffuse') or '') and (len(m['pos']) <= 24 or 'lensflare' in src.get('name', '')): continue   # untextured helper box (the bow's lambert1), lens-flare cards   # BO3's $blacktransparent_color: invisible helper geometry   # no images at all: shader-only (sight reticles), would render white
        prims.append(prim)
    mesh_node = len(nodes); nodes.append({'name': 'mesh', 'mesh': 0})
    gltf = {'asset': {'version': '2.0', 'generator': 'semodel_to_glb.py'}, 'scene': 0,
            'scenes': [{'nodes': roots+[mesh_node]}], 'nodes': nodes, 'meshes': [{'primitives': prims}],
            'materials': materials, 'accessors': accessors, 'bufferViews': views}
    if images: gltf['images'] = images; gltf['textures'] = textures; gltf['samplers'] = [{}]
    if used_webp: gltf['extensionsUsed'] = ['EXT_texture_webp']; gltf['extensionsRequired'] = ['EXT_texture_webp']
    if skinned:
        ibm = b''.join(struct.pack('<16f', *inv_rigid(*world[i])) for i in range(nb))
        gltf['skins'] = [{'joints': list(range(nb)), 'inverseBindMatrices': add(ibm, 5126, 'MAT4', nb)}]
        nodes[mesh_node]['skin'] = 0
    while len(bin_) % 4: bin_.append(0)
    gltf['buffers'] = [{'byteLength': len(bin_)}]
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    pathlib.Path(out).write_bytes(struct.pack('<III', 0x46546c67, 2, 28+len(js)+len(bin_))+struct.pack('<II', len(js), 0x4e4f534a)+js
                                  + struct.pack('<II', len(bin_), 0x004e4942)+bytes(bin_))

if __name__ == '__main__':
    m = read_semodel(sys.argv[1])
    print(f"{len(m['bones'])} bones, {len(m['meshes'])} meshes, {sum(len(x['pos']) for x in m['meshes'])} verts, materials:",
          [x['name'] for x in m['materials']])
    to_glb(m, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print('wrote', sys.argv[2])

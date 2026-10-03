"""Convert a Blockbench (Bedrock-format) .bbmodel plus its Bedrock animation
file into a .glb character for the operator registry: every group becomes a
node carrying its boxes (rigid, the way Blockbench draws them), and the named
Bedrock animations (Molang expressions or keyframes) are sampled into looping
glTF clips. Made for Cobblemon models.

    python3 .tools/bbmodel_to_glb.py model.bbmodel anims.json out.glb \
        idle=animation.x.ground_idle walk=animation.x.ground_walk run=animation.x.ground_walk@1.7 \
        [split=group:childJoint:margin] [reparent=a,b,c:newParent] [pose=bone:x,y,z] [shrink=bone:factor] [offset=bone:x,y,z] [extend=group:x0,y0,z0,x1,y1,z1]

Conventions (Blockbench's own renderer): group/element rotations are degrees,
Euler order ZYX, about their `origin`; Bedrock animation rotations apply as
(−x, −y, z) and positions as (−x, y, z) on top of the rest pose.
"""
import base64, json, math, re, struct, sys

def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz)
def qaxis(axis, deg):
    h = math.radians(deg)/2; s = math.sin(h); return tuple(s*c for c in axis)+(math.cos(h),)
def qeuler(r):   # Euler ZYX (three.js order 'ZYX'): q = qz·qy·qx
    return qmul(qmul(qaxis((0, 0, 1), r[2]), qaxis((0, 1, 0), r[1])), qaxis((1, 0, 0), r[0]))
def qrot(q, v):
    x, y, z, w = q; vx, vy, vz = v
    ix, iy, iz, iw = w*vx+y*vz-z*vy, w*vy+z*vx-x*vz, w*vz+x*vy-y*vx, -x*vx-y*vy-z*vz
    return (ix*w+iw*-x+iy*-z-iz*-y, iy*w+iw*-y+iz*-x-ix*-z, iz*w+iw*-z+ix*-y-iy*-x)

# 4x4 rigid matrices (row-major lists)
def m_tq(t, q):
    x, y, z, w = q
    return [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), t[0]], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), t[1]],
            [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), t[2]], [0, 0, 0, 1]]
def m_mul(a, b): return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def m_inv(m):   # rigid
    r = [[m[j][i] for j in range(3)] for i in range(3)]; t = [-sum(r[i][k]*m[k][3] for k in range(3)) for i in range(3)]
    return [r[0]+[t[0]], r[1]+[t[1]], r[2]+[t[2]], [0, 0, 0, 1]]
def m_apply(m, v): return [sum(m[i][k]*v[k] for k in range(3))+m[i][3] for i in range(3)]
def m_quat(m):
    tr = m[0][0]+m[1][1]+m[2][2]
    if tr > 0: s = math.sqrt(tr+1)*2; return ((m[2][1]-m[1][2])/s, (m[0][2]-m[2][0])/s, (m[1][0]-m[0][1])/s, s/4)
    if m[0][0] > m[1][1] and m[0][0] > m[2][2]: s = math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2; return (s/4, (m[0][1]+m[1][0])/s, (m[0][2]+m[2][0])/s, (m[2][1]-m[1][2])/s)
    if m[1][1] > m[2][2]: s = math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2; return ((m[0][1]+m[1][0])/s, s/4, (m[1][2]+m[2][1])/s, (m[0][2]-m[2][0])/s)
    s = math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2; return ((m[0][2]+m[2][0])/s, (m[1][2]+m[2][1])/s, s/4, (m[1][0]-m[0][1])/s)

# ---- Molang (the subset Cobblemon uses: math.* in degrees, anim_time) ----------------------------
MATH = {'sin': lambda d: math.sin(math.radians(d)), 'cos': lambda d: math.cos(math.radians(d)), 'abs': abs,
        'clamp': lambda v, a, b: max(a, min(b, v)), 'lerp': lambda a, b, t: a+(b-a)*t, 'pow': pow, 'sqrt': math.sqrt,
        'floor': math.floor, 'ceil': math.ceil, 'round': round, 'min': min, 'max': max, 'mod': math.fmod, 'pi': math.pi}
def molang(expr):
    if isinstance(expr, (int, float)): return lambda t: float(expr)
    src = str(expr).strip().lower().replace('query.', 'q.').replace('q.anim_time', 't').replace('q.life_time', 't')
    src = re.sub(r'math\.(\w+)', r'M_\1', src)
    if re.search(r'q\.|v\.|variable\.|c\.', src): src = re.sub(r'(q|v|variable|c)\.\w+', '0', src)
    env = {'M_'+k: v for k, v in MATH.items()}
    code = compile(src, 'molang', 'eval')
    return lambda t: float(eval(code, {'__builtins__': {}}, {**env, 't': t}))
def channel(spec):
    """A bone channel → f(t) returning [x,y,z]: a vector of expressions, or keyframes."""
    if isinstance(spec, list): fs = [molang(e) for e in spec]; return lambda t: [f(t) for f in fs]
    if isinstance(spec, (int, float, str)): f = molang(spec); return lambda t: [f(t)]*3
    keys = sorted((float(k), v.get('post', v.get('pre')) if isinstance(v, dict) else v) for k, v in spec.items())
    keys = [(k, channel(v)) for k, v in keys]
    def f(t):
        if t <= keys[0][0]: return keys[0][1](t)
        for (a, fa), (b, fb) in zip(keys, keys[1:]):
            if t <= b: u = (t-a)/(b-a) if b > a else 0; va, vb = fa(t), fb(t); return [x+(y-x)*u for x, y in zip(va, vb)]
        return keys[-1][1](t)
    return f
def period(anim):
    if anim.get('animation_length'): return float(anim['animation_length'])
    text = json.dumps(anim)
    ks = [float(k) for k in re.findall(r'\*\s*90\s*\*\s*([\d.]+)', text)]
    return 4/min(ks) if ks else 2.0

# ---- model ---------------------------------------------------------------------------------------
def build(bb_path, anim_path, out_path, clips, opts=None):
    opts = opts or {}
    bb = json.load(open(bb_path)); W, H = bb['resolution']['width'], bb['resolution']['height']
    groups = {g['uuid']: g for g in bb.get('groups', [])}; elements = {e['uuid']: e for e in bb['elements']}
    nodes, meshes, accessors, views, binbuf = [], [], [], [], bytearray()
    def blob(data, target=None):
        while len(binbuf) % 4: binbuf.append(0)
        off = len(binbuf); binbuf.extend(data); v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v); return len(views)-1
    def acc(fmt, comps, values, kind, target=None, minmax=False):
        n = len(values)//comps; data = struct.pack('<%d%s' % (len(values), fmt), *values)
        a = {'bufferView': blob(data, target), 'componentType': 5126 if fmt == 'f' else 5125, 'count': n, 'type': kind}
        if minmax: a['min'] = [min(values[i::comps]) for i in range(comps)]; a['max'] = [max(values[i::comps]) for i in range(comps)]
        accessors.append(a); return len(accessors)-1
    FACES = {   # corners TL, TR, BR, BL seen from outside; normal
        'north': (((1, 1, 0), (0, 1, 0), (0, 0, 0), (1, 0, 0)), (0, 0, -1)),
        'south': (((0, 1, 1), (1, 1, 1), (1, 0, 1), (0, 0, 1)), (0, 0, 1)),
        'east':  (((1, 1, 1), (1, 1, 0), (1, 0, 0), (1, 0, 1)), (1, 0, 0)),
        'west':  (((0, 1, 0), (0, 1, 1), (0, 0, 1), (0, 0, 0)), (-1, 0, 0)),
        'up':    (((0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)), (0, 1, 0)),
        'down':  (((0, 0, 1), (1, 0, 1), (1, 0, 0), (0, 0, 0)), (0, -1, 0))}
    def cube_mesh(els, origin):
        pos, nrm, uv, idx = [], [], [], []
        for e in els:
            if e.get('visibility') is False or e.get('type', 'cube') != 'cube': continue
            inf = e.get('inflate', 0); lo = [a-inf for a in e['from']]; hi = [b+inf for b in e['to']]
            eq = qeuler(e.get('rotation', [0, 0, 0])); eo = e.get('origin', [0, 0, 0])
            for face, (corners, n) in FACES.items():
                f = e['faces'].get(face)
                if not f or f.get('texture') is None: continue
                u1, v1, u2, v2 = f['uv']; rot = f.get('rotation', 0)
                uvs = [(u1, v1), (u2, v1), (u2, v2), (u1, v2)]
                for _ in range(rot//90): uvs = uvs[-1:]+uvs[:-1]
                base = len(pos)//3
                for (cx, cy, cz), (u, v) in zip(corners, uvs):
                    p = [hi[0] if cx else lo[0], hi[1] if cy else lo[1], hi[2] if cz else lo[2]]
                    p = qrot(eq, [p[i]-eo[i] for i in range(3)]); p = [p[i]+eo[i]-origin[i] for i in range(3)]
                    pos += p; nrm += list(qrot(eq, n)); uv += [u/W, v/H]
                idx += [base, base+3, base+2, base, base+2, base+1]
        if not idx: return None
        prim = {'attributes': {'POSITION': acc('f', 3, pos, 'VEC3', 34962, True), 'NORMAL': acc('f', 3, nrm, 'VEC3', 34962),
                'TEXCOORD_0': acc('f', 2, uv, 'VEC2', 34962)}, 'indices': acc('I', 1, idx, 'SCALAR', 34963), 'material': 0}
        meshes.append({'primitives': [prim]}); return len(meshes)-1
    # Skinned output: every group is a joint; each box is bound 100% to its group, except
    # `split` (vertices of a group past a child joint go to that joint: a wrist) and
    # `reparent` (move groups under another joint, keeping their world pose).
    # `pose=bone:x,y,z` adds degrees (Blockbench display axes) to a bone's rest rotation; animations
    # are applied on top, so it reshapes the whole posture (e.g. stand a hunched model upright).
    for x in opts.get('pose', []):
        name, vals = x.split(':'); d = [float(v) for v in vals.split(',')]
        for g in groups.values():
            if g['name'] == name: g['rotation'] = [a+b for a, b in zip(g.get('rotation', [0, 0, 0]), d)]
    # `shrink=bone:factor` scales a bone's whole subtree (pivots and boxes) about its pivot: e.g. a
    # mane too long to hang down the back once the model stands upright.
    # `offset=bone:x,y,z` moves a bone's whole subtree (pivots and boxes) in model space: e.g. a mane
    # pushed back off the body. Both reuse one subtree transform.
    xforms = [(x.split(':')[0], 'shrink', float(x.split(':')[1])) for x in opts.get('shrink', [])] + \
             [(x.split(':')[0], 'offset', [float(v) for v in x.split(':')[1].split(',')]) for x in opts.get('offset', [])]
    for name, kind, f in xforms:
        root = next((g for g in groups.values() if g['name'] == name), None)
        if not root: continue
        ho = list(root.get('origin', [0, 0, 0]))
        sc = (lambda p: [ho[i]+(p[i]-ho[i])*f for i in range(3)]) if kind == 'shrink' else (lambda p: [p[i]+f[i] for i in range(3)])
        def sub(entry):
            g = groups.get(entry['uuid'], entry)
            if g is not root or kind == 'offset': g['origin'] = sc(g.get('origin', [0, 0, 0]))
            for c in entry.get('children', []):
                if isinstance(c, str) and c in elements:
                    e = elements[c]
                    if 'from' not in e:
                        if 'position' in e: e['position'] = sc(e['position'])
                        continue
                    e['from'] = sc(e['from']); e['to'] = sc(e['to']); e['origin'] = sc(e.get('origin', [0, 0, 0])); e['inflate'] = e.get('inflate', 0)*(f if kind == 'shrink' else 1)
                elif not isinstance(c, str): sub(c)
        def findent(entries):
            for en in entries:
                if isinstance(en, str): continue
                if groups.get(en['uuid'], en) is root: return en
                r = findent(en.get('children', []))
                if r: return r
        ent = findent(bb['outliner'])
        if ent: sub(ent)
    # `extend=group:x0,y0,z0,x1,y1,z1` grows the group's own boxes (adds to from/to): e.g. bridge a
    # gap left after moving the rest of a chain.
    for x in opts.get('extend', []):
        name, vals = x.split(':'); dv = [float(v) for v in vals.split(',')]
        for en in [en for en in groups.values() if en['name'] == name]:
            def boxes(entries):
                for c in entries:
                    if isinstance(c, str): continue
                    if c['uuid'] == en['uuid']: return [elements[u] for u in c.get('children', []) if isinstance(u, str) and u in elements]
                    r = boxes(c.get('children', []))
                    if r is not None: return r
            for e in boxes(bb['outliner']) or []:
                if 'from' in e: e['from'] = [e['from'][i]+dv[i] for i in range(3)]; e['to'] = [e['to'][i]+dv[3+i] for i in range(3)]
    split = dict((a, (b, float(c))) for a, b, c in (x.split(':') for x in opts.get('split', [])))
    reparent = {}
    for x in opts.get('reparent', []):
        kids, parent = x.split(':')
        for k in kids.split(','): reparent[k] = parent
    order, info = [], {}   # group name -> {g, parent, world}
    def walk(entry, parent, pw):
        if isinstance(entry, str): return
        g = groups.get(entry['uuid'], entry); o = g.get('origin', [0, 0, 0]); po = info[parent]['g'].get('origin', [0, 0, 0]) if parent else [0, 0, 0]
        w = m_mul(pw, m_tq([o[i]-po[i] for i in range(3)], qeuler(g.get('rotation', [0, 0, 0]))))
        info[g['name']] = {'g': g, 'parent': parent, 'world': w, 'entry': entry}; order.append(g['name'])
        for c in entry.get('children', []): walk(c, g['name'], w)
    I4 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    for e in bb['outliner']: walk(e, None, I4)
    for k, p in reparent.items():
        if k in info and p in info: info[k]['parent'] = p
    children = {n: [] for n in order}; roots = []
    for n in order: (children[info[n]['parent']] if info[n]['parent'] else roots).append(n)
    rest = {}
    for n in order:
        par = info[n]['parent']; local = m_mul(m_inv(info[par]['world']), info[n]['world']) if par else info[n]['world']
        t = [local[i][3] for i in range(3)]; q = m_quat(local)
        rest[n] = {'node': len(nodes), 't': t, 'r': info[n]['g'].get('rotation', [0, 0, 0]), 'moved': n in reparent}
        nodes.append({'name': n, 'translation': t, 'rotation': list(q)})
    for n in order:
        if children[n]: nodes[rest[n]['node']]['children'] = [rest[c]['node'] for c in children[n]]
    joints = [rest[n]['node'] for n in order]; jindex = {n: i for i, n in enumerate(order)}
    pos, nrm, uv, jts, wts, idx = [], [], [], [], [], []
    for n in order:
        g = info[n]['g']; o = g.get('origin', [0, 0, 0]); W4 = info[n]['world']
        sp = split.get(n); axis = None
        if sp and sp[0] in info:
            so = info[sp[0]]['g'].get('origin', [0, 0, 0]); axis = [so[i]-o[i] for i in range(3)]; alen = math.sqrt(sum(a*a for a in axis))
        for c in info[n]['entry'].get('children', []):
            if not isinstance(c, str) or c not in elements: continue
            e = elements[c]
            if e.get('visibility') is False or e.get('type', 'cube') != 'cube': continue
            inf = e.get('inflate', 0); lo = [a-inf for a in e['from']]; hi = [b+inf for b in e['to']]
            eq = qeuler(e.get('rotation', [0, 0, 0])); eo = e.get('origin', [0, 0, 0])
            for face, (corners, nn) in FACES.items():
                f = e['faces'].get(face)
                if not f or f.get('texture') is None: continue
                u1, v1, u2, v2 = f['uv']; rot = f.get('rotation', 0)
                uvs = [(u1, v1), (u2, v1), (u2, v2), (u1, v2)]
                for _ in range(rot//90): uvs = uvs[-1:]+uvs[:-1]
                base = len(pos)//3
                for (cx, cy, cz), (u, v) in zip(corners, uvs):
                    p = [hi[0] if cx else lo[0], hi[1] if cy else lo[1], hi[2] if cz else lo[2]]
                    p = qrot(eq, [p[i]-eo[i] for i in range(3)]); p = [p[i]+eo[i] for i in range(3)]
                    joint = n
                    if axis and sum((p[i]-o[i])*axis[i] for i in range(3))/alen >= alen-sp[1]: joint = sp[0]
                    wp = m_apply(W4, [p[i]-o[i] for i in range(3)])
                    pos += wp; nrm += list(qrot(m_quat(W4), qrot(eq, nn))); uv += [u/W, v/H]; jts += [jindex[joint], 0, 0, 0]; wts += [1.0, 0, 0, 0]
                idx += [base, base+3, base+2, base, base+2, base+1]
    jdata = struct.pack('<%dH' % len(jts), *jts)
    jacc = {'bufferView': blob(jdata, 34962), 'componentType': 5123, 'count': len(jts)//4, 'type': 'VEC4'}; accessors.append(jacc); jacc_i = len(accessors)-1
    prim = {'attributes': {'POSITION': acc('f', 3, pos, 'VEC3', 34962, True), 'NORMAL': acc('f', 3, nrm, 'VEC3', 34962),
            'TEXCOORD_0': acc('f', 2, uv, 'VEC2', 34962), 'JOINTS_0': jacc_i, 'WEIGHTS_0': acc('f', 4, wts, 'VEC4', 34962)},
            'indices': acc('I', 1, idx, 'SCALAR', 34963), 'material': 0}
    meshes.append({'name': bb.get('name', 'model'), 'primitives': [prim]})
    ibm = []
    for n in order:
        inv = m_inv(info[n]['world']); ibm += [inv[r][c] for c in range(4) for r in range(4)]   # column-major
    skin = {'joints': joints, 'inverseBindMatrices': acc('f', 16, ibm, 'MAT4'), 'skeleton': rest[roots[0]]['node']}
    nodes.append({'name': (bb.get('name') or 'model')+'_mesh', 'mesh': 0, 'skin': 0})
    roots = [rest[r]['node'] for r in roots]+[len(nodes)-1]
    # texture
    tex = bb['textures'][0]; png = base64.b64decode(tex['source'].split(',', 1)[1])
    image_view = blob(png)
    # animations
    anims = json.load(open(anim_path))['animations']; gl_anims = []
    for name, spec in clips.items():
        src, _, speed = spec.partition('@'); speed = float(speed or 1); a = anims[src]; T = period(a); fps = 30
        n = max(2, round(T*fps)+1); times = [i/fps for i in range(n)]; times[-1] = T
        samplers, channels = [], []
        for bone, chans in a['bones'].items():
            if bone not in rest: continue
            if rest[bone]['moved']: continue
            ni, t0, r0 = rest[bone]['node'], rest[bone]['t'], rest[bone]['r']
            if 'rotation' in chans:
                f = channel(chans['rotation']); vals = []
                for t in times: d = f(t); vals += list(qeuler([r0[0]-d[0], r0[1]-d[1], r0[2]+d[2]]))
                samplers.append({'input': acc('f', 1, [t/speed for t in times], 'SCALAR', None, True), 'output': acc('f', 4, vals, 'VEC4'), 'interpolation': 'LINEAR'})
                channels.append({'sampler': len(samplers)-1, 'target': {'node': ni, 'path': 'rotation'}})
            if 'position' in chans:
                f = channel(chans['position']); vals = []
                for t in times: d = f(t); vals += [t0[0]-d[0], t0[1]+d[1], t0[2]+d[2]]
                samplers.append({'input': acc('f', 1, [t/speed for t in times], 'SCALAR', None, True), 'output': acc('f', 3, vals, 'VEC3'), 'interpolation': 'LINEAR'})
                channels.append({'sampler': len(samplers)-1, 'target': {'node': ni, 'path': 'translation'}})
        gl_anims.append({'name': name, 'samplers': samplers, 'channels': channels})
    doc = {'asset': {'version': '2.0', 'generator': 'kino bbmodel_to_glb'}, 'scene': 0, 'scenes': [{'nodes': roots}], 'nodes': nodes, 'meshes': meshes,
           'materials': [{'name': bb.get('name', 'model'), 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1},
                          'alphaMode': 'MASK', 'alphaCutoff': .5, 'doubleSided': True}],
           'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9728, 'minFilter': 9984, 'wrapS': 33071, 'wrapT': 33071}],
           'images': [{'bufferView': image_view, 'mimeType': 'image/png'}], 'accessors': accessors, 'bufferViews': views,
           'buffers': [{'byteLength': len(binbuf)}], 'animations': gl_anims, 'skins': [skin]}
    while len(binbuf) % 4: binbuf.append(0)
    raw = json.dumps(doc, separators=(',', ':')).encode(); raw += b' '*(-len(raw) % 4)
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546c67, 2, 12+8+len(raw)+8+len(binbuf)))
        f.write(struct.pack('<II', len(raw), 0x4e4f534a)); f.write(raw)
        f.write(struct.pack('<II', len(binbuf), 0x004e4942)); f.write(binbuf)
    print('wrote', out_path, '| nodes', len(nodes), '| meshes', len(meshes), '| clips', [a['name'] for a in gl_anims])

if __name__ == '__main__':
    bb, an, out, *specs = sys.argv[1:]
    opts = {'split': [], 'reparent': [], 'pose': [], 'shrink': [], 'offset': [], 'extend': []}; clips = {}
    for x in specs:
        k, v = x.split('=', 1)
        if k in opts: opts[k].append(v)
        else: clips[k] = v
    build(bb, an, out, clips, opts)

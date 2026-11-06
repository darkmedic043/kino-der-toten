# Reorders each node's children in a GLB so the ones whose name matches a regex come first (stable otherwise).
# bo1-motion.js walks limbs by first child, so a spring chain hung off a forearm (Seven's wrist shackle) must not
# come before the hand. usage: python3 glb_joints_first.py <file.glb> <regex>
import json, re, struct, sys
path, pat = sys.argv[1], re.compile(sys.argv[2])
data = open(path, 'rb').read()
magic, ver, _ = struct.unpack_from('<III', data, 0); jlen, jtype = struct.unpack_from('<II', data, 12)
gltf = json.loads(data[20:20 + jlen]); rest = data[20 + jlen:]
nodes, moved = gltf['nodes'], 0
for n in nodes:
    ch = n.get('children')
    if not ch: continue
    new = sorted(ch, key=lambda i: 0 if pat.match(nodes[i].get('name', '')) else 1)
    if new != ch: n['children'] = new; moved += 1
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
out = struct.pack('<III', magic, ver, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), jtype) + js + rest
open(path, 'wb').write(out); print('joints first:', moved, 'nodes reordered')

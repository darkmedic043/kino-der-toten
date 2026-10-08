#!/usr/bin/env python3
# Dumps the loaded Black Ops III map from the running game's memory (BO3 under Proton; the process is readable from
# Linux via /proc/<pid>/mem). A port of Husky 0.8's BlackOps3.cs (Scobalula, GPL) with the asset-pool table address
# found for the current BO3 build (Husky's 0x94093F0 moved to 0x93883F0; --scan finds it again after an update).
# Output (export_game/bo3/maps/<map>/, git-ignored): <map>.json (surfaces, materials with every image and its semantic
# hash, static models) and the raw buffers <map>.positions.bin (float32 xyz), <map>.vdata.bin (20 bytes a vertex: rgba,
# u, v, packed normal, pad), <map>.indices.bin (uint16). Units are the game's (inches).
# usage: python3 .tools/bo3_dump_map.py [--pid N] [--pools 0x93883F0] [--scan]
import argparse, json, os, re, struct, sys

ap = argparse.ArgumentParser()
ap.add_argument('--pid', type=int); ap.add_argument('--pools', default='0x93883F0'); ap.add_argument('--scan', action='store_true')
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'export_game', 'bo3', 'maps'))
a = ap.parse_args()
BASE = 0x140000000
pid = a.pid or next(int(p) for p in os.listdir('/proc') if p.isdigit() and 'BlackOps3.exe' in open(f'/proc/{p}/cmdline', 'rb').read().decode('latin1') and 'reaper' not in open(f'/proc/{p}/cmdline', 'rb').read().decode('latin1') and 'proton' not in open(f'/proc/{p}/cmdline', 'rb').read().decode('latin1') and 'sh' != open(f'/proc/{p}/comm').read().strip())
mem = open(f'/proc/{pid}/mem', 'rb', buffering=0)
def rd(addr, n): mem.seek(addr); return mem.read(n)
def q(addr): return struct.unpack('<Q', rd(addr, 8))[0]
def cstr(addr, n=256): return rd(addr, n).split(b'\0')[0].decode('latin1')
def valid(table):
    try: return cstr(q(q(table + 0x80)), 8) == 'void'
    except OSError: return False

pools = BASE + int(a.pools, 16)
if a.scan or not valid(pools):
    print('scanning for the asset pool table...', file=sys.stderr)
    pools = None
    for line in open(f'/proc/{pid}/maps'):
        if 'BlackOps3.exe' not in line: continue
        s, e = (int(x, 16) for x in line.split()[0].split('-'))
        for off in range(s, e, 0x400000):
            try: d = rd(off, min(0x400000, e - off))
            except OSError: continue
            for i in range(0, len(d) - 0x88, 8):
                v = struct.unpack_from('<Q', d, i + 0x80)[0]
                if 0x10000 < v < 0x7fffffffffff:
                    try:
                        g = q(off + i + 0x200)
                        if valid(off + i) and cstr(q(g)).startswith('maps/') and struct.unpack('<i', rd(g + 0x18, 4))[0] > 1000: pools = off + i; break
                    except OSError: pass
            if pools: break
        if pools: break
    if not pools: sys.exit('asset pool table not found (is a map loaded?)')
    print(f'asset pools at base+{pools - BASE:#x}', file=sys.stderr)

g = q(pools + 0x200)
G = rd(g, 0x440)
u32 = lambda o: struct.unpack_from('<I', G, o)[0]; i32 = lambda o: struct.unpack_from('<i', G, o)[0]; u64 = lambda o: struct.unpack_from('<Q', G, o)[0]
gfx_name, map_name = cstr(u64(0)), cstr(u64(8))
if not gfx_name: sys.exit('no map loaded')
surf_n, vert_n, idx_n, smodel_n = i32(0x18), i32(0x268), u64(0x298), i32(0x2FC)
vpos, vdata, idx, surfs, smodels = u64(0x270), u64(0x288), u64(0x2A0), u64(0x430), u64(0x438)
print(f'{gfx_name} ({map_name}): {surf_n} surfaces, {vert_n} vertices, {idx_n} indices, {smodel_n} static models', file=sys.stderr)
out = os.path.join(a.out, map_name); os.makedirs(out, exist_ok=True)
open(os.path.join(out, f'{map_name}.positions.bin'), 'wb').write(rd(vpos, vert_n * 12))
open(os.path.join(out, f'{map_name}.vdata.bin'), 'wb').write(rd(vdata, vert_n * 20))
open(os.path.join(out, f'{map_name}.indices.bin'), 'wb').write(rd(idx, idx_n * 2))

materials, mat_index, surfaces = [], {}, []
def material(ptr):
    if ptr in mat_index: return mat_index[ptr]
    M = rd(ptr, 0x288)
    name = cstr(struct.unpack_from('<Q', M, 0)[0]).replace('*', '')
    count, table = M[0x270], struct.unpack_from('<Q', M, 0x280)[0]
    images = []
    for k in range(count):
        ip, sem = struct.unpack('<QI', rd(table + k * 0x20, 12))
        try: images.append({'hash': f'{sem:08x}', 'name': cstr(q(ip + 0xF8))})
        except OSError: pass
    mat_index[ptr] = len(materials); materials.append({'name': name, 'images': images})
    return mat_index[ptr]
S = rd(surfs, surf_n * 96)
for k in range(surf_n):
    o = k * 96
    vbo, = struct.unpack_from('<i', S, o + 0xC)
    vcount, fcount = struct.unpack_from('<HH', S, o + 0x28)
    findex, = struct.unpack_from('<i', S, o + 0x2C)
    mptr, = struct.unpack_from('<Q', S, o + 0x48)
    surfaces.append({'base': vbo // 12, 'faces': fcount, 'firstIndex': findex, 'material': material(mptr)})
models = []
SM = rd(smodels, smodel_n * 152)
for k in range(smodel_n):
    o = k * 152
    x, y, z = struct.unpack_from('<3f', SM, o); m = struct.unpack_from('<9f', SM, o + 12); scale, = struct.unpack_from('<f', SM, o + 48)
    mp, = struct.unpack_from('<Q', SM, o + 0x58)
    name = cstr(q(mp))
    if name.startswith('*'): continue
    models.append({'name': name, 'origin': [x, y, z], 'axes': list(m), 'scale': scale})
json.dump({'gfx': gfx_name, 'map': map_name, 'units': 'inches', 'vertices': vert_n, 'indices': idx_n,
           'surfaces': surfaces, 'materials': materials, 'models': models}, open(os.path.join(out, f'{map_name}.json'), 'w'))
print(f'wrote {out}: {len(materials)} materials, {len(models)} static models', file=sys.stderr)

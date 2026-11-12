#!/usr/bin/env python3
"""Reads a Black Ops III map's primary lights (the lights its lightmaps were baked from) out of the map's fastfile.

  python3 -I .tools/bo3_ff_lights.py "<BO3>/zone/zm_castle.ff" export_game/bo3/maps/zm_castle/zm_castle.lights.json
      [--zone decompressed.zone]   reuse (or keep) the decompressed zone instead of a temporary file

The output is game data: it goes under export_game/ (git-ignored) and is read by .tools/bake-map-light.mjs.
Nothing here comes from a tool or header: the layout was worked out from the file (docs/fork/lighting.md).

Fastfile (BO3, PC): magic "TAff0000", a 0x248-byte header, then blocks
  u32 compressedSize, u32 decompressedSize, u32 storedSize (compressedSize aligned up to 4), u32 ownFileOffset, zlib data
A header whose decompressedSize is 0 is filler up to the next 8 MB boundary (a block never straddles one).
The zone inside is not 4-byte aligned to the file.

Primary lights: one array of 564-byte records, each ending in its id word (0x30000 | index). From a record's start:
  +104 u32   type (2 = spot, 4 = omni)
  +112 f32x3 origin (inches, Z up)
  +128 f32x3 colour (linear RGB, already times the intensity)
  +144 f32   cut-on distance      +148 f32  radius
  +196 f32x3 unit vector from the lit side towards the light (a spot's cone opens along its negative)
  +308 f32   cos(half inner angle)  +312 f32  cos(half outer angle)
  +384 u32   lighting-state mask (bit 0 = the map's default state; 0 = switched by script)
  +560 u32   id
"""
import sys, os, struct, zlib, mmap, json, tempfile

S, ID0 = 564, 0x30000

def decompress(ff, out):
    with open(ff, 'rb') as f:
        m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        if m[:8] != b'TAff0000': sys.exit('not an unencrypted BO3 fastfile (TAff0000)')
        p, total = 0x248, 0
        while p + 16 <= len(m):
            comp, dec, stored, pos = struct.unpack_from('<4I', m, p)
            data = None
            if pos == p and 0 < comp <= stored < 0x400000 and dec > 0:
                try: data = zlib.decompress(m[p + 16:p + 16 + comp])
                except zlib.error: data = None
            if data is not None:
                out.write(data); total += len(data); p += 16 + stored; continue
            q = p + 16                                   # filler: resync on the next header that names its own offset
            while True:
                q = (q + 3) & ~3
                if q + 16 > len(m): q = len(m); break
                c2, d2, s2, p2 = struct.unpack_from('<4I', m, q)
                if p2 == q and 0 < c2 <= s2 < 0x400000: break
                q += 4
            p = q
        m.close()
    out.flush(); return total

def find_lights(z):
    """the array: ids 0x30000, 0x30001, 0x30002... one record apart; returns the first record's start and the count"""
    pat, q = struct.pack('<I', ID0), -1
    while True:
        q = z.find(pat, q + 1)
        if q < 0: sys.exit('no primary-light array found')
        if all(q + k * S + 4 <= len(z) and struct.unpack_from('<I', z, q + k * S)[0] == ID0 + k for k in (1, 2, 3)): break
    n = 0
    while q + (n + 1) * S <= len(z) and struct.unpack_from('<I', z, q + n * S)[0] == ID0 + n: n += 1
    return q + 4 - S, n

def main():
    a = sys.argv[1:]
    zone = a[a.index('--zone') + 1] if '--zone' in a else None
    if zone: a = [x for i, x in enumerate(a) if i not in (a.index('--zone'), a.index('--zone') + 1)]
    if len(a) != 2: sys.exit(__doc__)
    ff, dst = a
    if zone and os.path.exists(zone): zf = open(zone, 'rb')
    else:
        zf = open(zone, 'w+b') if zone else tempfile.TemporaryFile(dir=os.path.dirname(os.path.abspath(dst)))
        print('decompressed', decompress(ff, zf), 'bytes')
    z = mmap.mmap(zf.fileno(), 0, access=mmap.ACCESS_READ)
    q, n = find_lights(z)
    f3 = lambda o: [round(v, 4) for v in struct.unpack_from('<3f', z, o)]
    lights = []
    for k in range(n):
        r = q + k * S
        t, = struct.unpack_from('<I', z, r + 104)
        near, radius = struct.unpack_from('<2f', z, r + 144)
        ci, co = struct.unpack_from('<2f', z, r + 308)
        state, = struct.unpack_from('<I', z, r + 384)
        L = {'type': {2: 'spot', 4: 'omni'}.get(t, t), 'origin': f3(r + 112), 'color': f3(r + 128), 'radius': round(radius, 3), 'near': round(near, 3), 'states': state}
        if t == 2: L.update(toLight=f3(r + 196), cosInner=round(ci, 5), cosOuter=round(co, 5))
        lights.append(L)
    z.close(); zf.close()
    with open(dst, 'w') as o: json.dump({'source': os.path.basename(ff), 'units': 'inches, Z up; colour linear RGB times intensity', 'lights': lights}, o, separators=(',', ':'))
    kinds = {}
    for L in lights: kinds[L['type']] = kinds.get(L['type'], 0) + 1
    print(n, 'lights at zone offset', q, kinds, '->', dst)

main()

#!/usr/bin/env python3
"""Black Ops III's colour-grading LUT of a map, read from its fastfile and written as a strip PNG for the grade pass.

  python3 -I .tools/bo3_ff_lut.py <zone/zm_x.ff | --zone already-decompressed.zone> <out.png> [--index n] [--name img_luts_x]

BO3 grades the tone-mapped, display-space picture through a 32x32x32 colour cube (material luts_t7_<map>, technique
create_lut2dv). The image asset img_luts_<map> holds several cubes one after the other (zm_stalingrad: 9; the pbg_box
volumes pick one with lut_index and blend it with lut_mix); its pixels follow the name's NUL directly: each cube is
32768 packed words, x fastest, 10 bits a channel (bits 0-9 red, 10-19 green, 20-29 blue, top two bits set).
In the identity cube the x index drives red, y blue and z green, so input (r, g, b) is voxel x=r, y=b, z=g.

The PNG is 1024x32: 32 tiles side by side, tile = blue, x in the tile = red, y = green (row 0 = green 0).
lighting/grade.js reads it (GRADES entry `lut`, loadLut). It is game data: keep it in the git-ignored map folder.
Without --index the first cube that is neither identity nor black is taken (the map's grade).
"""
import sys, os, re, struct, zlib, mmap, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo3_ff_lights import decompress

N = 32
V = N * N * N

def cubes(z, at):
    out = []
    while at + V * 4 <= len(z):
        w = struct.unpack_from('<%dI' % V, z, at)
        if any((x >> 30) != 3 for x in w[::97]): break
        out.append(w); at += V * 4
    return out

def kind(w):
    if all((x & 0x3fffffff) == 0 for x in w[::61]): return 'black'
    ok = True
    for i in range(0, V, 37):
        x, y, zz = i % N, i // N % N, i // (N * N)
        e = (round(x * 1023 / 31), round(zz * 1023 / 31), round(y * 1023 / 31))
        g = (w[i] & 1023, w[i] >> 10 & 1023, w[i] >> 20 & 1023)
        if max(abs(a - b) for a, b in zip(e, g)) > 2: ok = False; break
    return 'identity' if ok else 'grade'

def png(path, w):
    rows = []
    for g in range(N):
        row = bytearray([0])
        for b in range(N):
            for r in range(N):
                x = w[r + N * (b + N * g)]
                row += bytes(((x & 1023) * 255 + 511) // 1023 if k == 0 else ((x >> 10 * k & 1023) * 255 + 511) // 1023 for k in range(3))
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N * N, N, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))

def main():
    a = sys.argv[1:]; opt = {}
    for k in ('--zone', '--index', '--name'):
        if k in a: i = a.index(k); opt[k] = a[i + 1]; del a[i:i + 2]
    if len(a) != (1 if '--zone' in opt else 2): sys.exit(__doc__)
    out = a[-1]; tmp = None
    if '--zone' in opt: zone = opt['--zone']
    else:
        fd, zone = tempfile.mkstemp(suffix='.zone', dir=os.path.dirname(os.path.abspath(out))); tmp = zone
        with os.fdopen(fd, 'wb') as f: decompress(a[0], f)
    try:
        with open(zone, 'rb') as f:
            z = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            pat = re.compile(re.escape(opt['--name'].encode()) + b'\0' if '--name' in opt else rb'img_luts_[a-z0-9_]+\0')
            best = None
            for m in pat.finditer(z):
                c = cubes(z, m.end())
                if c and (not best or len(c) > len(best[1])): best = (m.group()[:-1].decode(), c, m.end())
            if not best: sys.exit('no LUT image found (img_luts_*)')
            name, c, at = best; kinds = [kind(w) for w in c]
            print(f'{name} at {at}: {len(c)} cubes: ' + ' '.join(f'{i}={k}' for i, k in enumerate(kinds)))
            i = int(opt['--index']) if '--index' in opt else next((i for i, k in enumerate(kinds) if k == 'grade'), None)
            if i is None: sys.exit('no graded cube (all identity or black): the map has no grade of its own')
            w = c[i]
            grey = [w[j + N * (j + N * j)] for j in range(N)]
            print(f'cube {i} grey ramp (red /1023):', ' '.join(str(x & 1023) for x in grey))
            tint = max(max(abs((x & 1023) - (x >> 10 & 1023)), abs((x & 1023) - (x >> 20 & 1023))) for x in grey)
            curve = [x & 1023 for x in grey]; cross = 0
            for j in range(0, V, 53):
                x, y, zz = j % N, j // N % N, j // (N * N)
                cross = max(cross, abs((w[j] & 1023) - curve[x]), abs((w[j] >> 10 & 1023) - curve[zz]), abs((w[j] >> 20 & 1023) - curve[y]))
            print(f'grey tint {tint}/1023, channel crosstalk {cross}/1023' + (' (a plain tone curve, no colour change)' if tint < 4 and cross < 4 else ''))
            png(out, w); print('wrote', out)
    finally:
        if tmp: os.unlink(tmp)

if __name__ == '__main__': main()

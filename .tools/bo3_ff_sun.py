#!/usr/bin/env python3
"""The sun (or moon) of a Black Ops III map, read from its fastfile: direction and colour, for the map mod's key light
and the light bake's `sun`.

  python3 -I .tools/bo3_ff_sun.py <zone/zm_x.ff | --zone already-decompressed.zone>

The entity string only names the sun assets (ssi); the compiled settings sit inside each sun volume, and the 8 floats
right before the volume's skybox model name (skybox_<map>) are: pitch, yaw, colour r g b, then three fields not worked
out (the last looks like a strength: 3 on zm_stalingrad, 1.5 on zm_castle). The angles give the way the light travels
(pitch positive = downwards), so the light comes from heading = yaw, elevation = 180 - pitch: fitted on zm_castle, whose
moon is also a far-away fx entity (heading 311.9, 21.4 up; the settings say 310, 20). The stock default_day block
(-45, 45) comes out below the horizon by that rule and is mirrored up here.
Map directions: BO3 (x, y, z up) -> three.js (x, z, -y).
"""
import sys, os, re, struct, math, mmap, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo3_ff_lights import decompress

def main():
    a = sys.argv[1:]; tmp = None
    if len(a) == 2 and a[0] == '--zone': zone = a[1]
    elif len(a) == 1:
        fd, zone = tempfile.mkstemp(suffix='.zone'); tmp = zone
        with os.fdopen(fd, 'wb') as f: decompress(a[0], f)
    else: sys.exit(__doc__)
    try:
        with open(zone, 'rb') as f:
            z = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ); seen = {}
            for m in re.finditer(rb'skybox_[a-z0-9_]+\0', z):
                if m.start() < 32: continue
                v = struct.unpack_from('<8f', z, m.start() - 32)
                if not all(math.isfinite(x) for x in v) or not (-360 <= v[0] <= 360 and -360 <= v[1] <= 360) or not all(0 <= c <= 64 for c in v[2:5]) or max(v[2:5]) < .01: continue
                k = (m.group()[:-1].decode(),) + tuple(round(x, 4) for x in v)
                seen[k] = seen.get(k, 0) + 1
            if not seen: sys.exit('no sun settings found (no floats before a skybox_* name)')
            for k, n in sorted(seen.items(), key=lambda e: -e[1]):
                p, y = math.radians(k[1]), math.radians(k[2])
                d = [-math.cos(p) * math.cos(y), -math.cos(p) * math.sin(y), math.sin(p)]; note = ''
                if d[2] < 0: d = [-x for x in d]; note = '  (mirrored up)'
                el = math.degrees(math.asin(d[2])); az = math.degrees(math.atan2(d[1], d[0])) % 360
                print(f'{k[0]} x{n}: pitch {k[1]} yaw {k[2]} colour {k[3]} {k[4]} {k[5]} rest {k[6]} {k[7]} {k[8]}')
                print(f'   light from heading {az:.1f}, {el:.1f} up{note}; three.js direction to it [{d[0]:.3f}, {d[2]:.3f}, {-d[1]:.3f}]')
    finally:
        if tmp: os.unlink(tmp)

if __name__ == '__main__': main()

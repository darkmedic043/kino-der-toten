#!/bin/bash
# Gorod Krovi's map build with every flag it needs (2026-11-17). v=6 and v=9 were both built from the short command in the
# docs, without --game-clip: no BO3 clip brushes (out-of-bounds areas walkable, 396k flood points under the map), no
# light static-model collision (props walked through) and no clip ramps on the stairs (the dragon roosts' stairs broken).
# usage: .tools/build-gorod-krovi.sh [extra build_bo3_map.py args]   (about 15 min, capped at 6 GB)
# Then: the after-rebuild steps (map detail, KTX2, light copy, gz, spawns) and bump maps.json's ?v=.
set -e
cd "$(dirname "$0")/.."
systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=2G nice -n 15 \
  ~/.local/bin/blender -b -P .tools/build_bo3_map.py -- zm_stalingrad gorod-krovi --tex 512 --prop-tex 256 --game-clip --game-clip-simple 64 "$@"
glb=export/web/mods/maps/gorod-krovi/gorod-krovi.glb
# the check that would have caught v=9: the collision layers must all be there
python3 -I - "$glb" <<'EOF'
import json, struct, sys
f = open(sys.argv[1], 'rb'); f.read(12); n, _ = struct.unpack('<II', f.read(8)); names = [x.get('name', '') for x in json.loads(f.read(n))['nodes']]
miss = [p for p in ('COL_', 'PCOL_', 'CLIP_') if not any(s.startswith(p) for s in names)]
if miss: sys.exit(f'build-gorod-krovi: no {" ".join(miss)} nodes in the map: collision is incomplete')
print('collision layers: COL_ PCOL_ CLIP_ present')
EOF

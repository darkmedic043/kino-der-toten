#!/bin/bash
# Der Eisendrache, after a map rebuild (.tools/build_bo3_map.py): redo everything that was computed from the old model,
# in one go. The void-ceiling table (mods/der-eisendrache/ceilings.js) is matched to the model by triangle centres, so
# a rebuild leaves it stale: the game then warns in the console and the ceilings stay black until this has run.
#   .tools/castle-after-rebuild.sh [--force] [--verify] [--no-light] [--dry]
#   1 walkable points (col-audit flood)            seconds
#   2 void-ceiling scan of every tile              about an hour, one tile at a time (JOBS=2 halves it and needs 6 GB free)
#   3 the table -> mods/der-eisendrache/ceilings.js
#   4 --verify: second scan with the plugs in, then the open-ray report of every tile (as long again)
#   5 light volume (skip with --no-light), map detail table, light test copy, .gz copies
# Without --force it stops when ceilings.js already belongs to the current GLB (castle-ceilings.mjs status).
# Not done here: bump the map's ?v= in mods/maps.json (players keep the old model cached otherwise).
set -euo pipefail
cd "$(dirname "$0")/.."
has() { case " $ARGS " in *" $1 "*) return 0;; esac; return 1; }
ARGS="$*"
export JOBS="${JOBS:-1}"   # a tile peaks near 4 GB with the page cache; a tile that dies stops the script (scan exits 1)
run() { echo "== $*"; has --dry && return 0; systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=2G nice -n 15 "$@"; }
soft() { run "$@" || echo "!! failed (not fatal): $*"; }
if node .tools/castle-ceilings.mjs status && ! has --force; then echo "ceilings.js is current: nothing to do (--force redoes it)"; exit 0; fi
mkdir -p scratch/ceilings
run node .tools/col-audit.mjs der-eisendrache --flood-only --points scratch/ceilings/walk.json
run node .tools/castle-ceilings.mjs scan --fresh
run node .tools/castle-ceilings.mjs build --write
if has --verify; then run node .tools/castle-ceilings.mjs scan verify --fresh; run node .tools/castle-ceilings.mjs check all; fi
has --no-light || soft node .tools/bake-map-light.mjs der-eisendrache
has --dry || node -e "const fs=require('fs');fs.writeFileSync('scratch/ceilings/walk-pts.json',JSON.stringify({pts:JSON.parse(fs.readFileSync('scratch/ceilings/walk.json'))}))"
soft node .tools/map-detail.mjs der-eisendrache --pts scratch/ceilings/walk-pts.json --go
soft node .tools/map-lite.mjs der-eisendrache --force --keep "global_diffuse_black|infinite_blackness"
soft node .tools/build-gz.mjs
node .tools/castle-ceilings.mjs status || true
echo "done. Now bump ?v= of der-eisendrache in export/web/mods/maps.json, and look at one load: the console line"
echo "'[der-eisendrache] void ceilings: {...}' must show entries close to its 'of' count and no stale warning."

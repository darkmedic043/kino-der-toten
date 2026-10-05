#!/bin/sh
# BO1 zombie riser clips for mods/zombie-rise (ripped assets: the output is git-ignored), from the OAT Unlinker dump of
# common_zombie_assets.  usage: sh .tools/build_zombie_rise.sh
set -e
cd "$(dirname "$0")/.."
src=export_game/common_zombie_assets/xanim
out=export/web/mods/zombie-rise/animations
mkdir -p "$out"; printf '*.json\n' > "$out/.gitignore"
for a in ai_zombie_traverse_ground_climbout_fast ai_zombie_traverse_ground_v1_run; do node .tools/xanim_to_json.mjs "$src/$a" -o "$out" >/dev/null; done
ls "$out"

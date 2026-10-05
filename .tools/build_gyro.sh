#!/bin/sh
# Gyro Zeppeli operator from the user's JojoSBR-GyroZeppeli-3DModel.zip (a fan rip of a Steam Workshop model; never
# committed): unzips the .blend and runs .tools/build_gyro_blend.py in headless Blender (bake + GLB export) into
# export/web/mods/characters/models/gyro/ (git-ignored).
# usage: .tools/build_gyro.sh ~/Downloads/JojoSBR-GyroZeppeli-3DModel.zip
set -e
zip="$1"; [ -f "$zip" ] || { echo "usage: $0 <JojoSBR-GyroZeppeli-3DModel.zip>"; exit 1; }
root=$(cd "$(dirname "$0")/.." && pwd); out="$root/export/web/mods/characters/models/gyro"; tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
unzip -q -o "$zip" '*/BlendFile/GyroZeppeli.blend' -d "$tmp"
mkdir -p "$out"
blender -b "$tmp"/*/BlendFile/GyroZeppeli.blend -P "$root/.tools/build_gyro_blend.py" -- "$tmp/gyro.glb" | grep -E "wrote|Error" || true
cp "$tmp/gyro.glb" "$out/gyro.glb"
echo "built $out/gyro.glb (bump the ?v= on its model path in characters.json, or browsers keep the old one for a day)"

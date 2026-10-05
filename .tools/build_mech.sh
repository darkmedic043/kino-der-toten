#!/bin/sh
# The Pilot class's mech from RainOnTheMoon's "Animated Mech - Marceline Sentinel Armor (Marcy)" (Sketchfab, CC-BY-4.0;
# the user downloads the glTF zip): runs .tools/build_mech_blend.py in headless Blender into
# export/web/mods/classes/models/mech.glb (git-ignored, like the other third-party models). Without it the game falls
# back to the procedural mech.
# usage: .tools/build_mech.sh ~/Downloads/animated_mech_-_marceline_sentinel_armor_marcy.zip
set -e
zip="$1"; [ -f "$zip" ] || { echo "usage: $0 <animated_mech_-_marceline_sentinel_armor_marcy.zip>"; exit 1; }
root=$(cd "$(dirname "$0")/.." && pwd); out="$root/export/web/mods/classes/models"; tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
unzip -q -o "$zip" -d "$tmp"
mkdir -p "$out"
blender -b -P "$root/.tools/build_mech_blend.py" -- "$tmp/scene.gltf" "$tmp/mech.glb" | grep -E "ELBOW|wrote|Error" || true
cp "$tmp/mech.glb" "$out/mech.glb"
ls -la "$out/mech.glb"

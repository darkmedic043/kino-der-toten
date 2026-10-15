#!/bin/sh
# SCP: Secret Laboratory operators for Melon Pass Season 1 (Nine-Tailed Fox + Captain skin, Chaos Insurgent + Juggernaut
# skin). Sources (user downloads, CC BY-SA; credits in characters.json):
#   NewHumans/          Northwood's released human models (MTF1.blend, Chaos.blend; README: PurpleGoop, rigged by DrPri, CC BY-SA 4.0)
#   chaos_insurgent_juggernaut/, nine-_tailed_fox_captian/   Sketchfab glTFs of the in-game heavy-armour versions
# Output: export/web/mods/characters/models/scpsl/<id>.glb + <id>_icon.webp (git-ignored like the other operator builds).
# usage: .tools/build_scpsl.sh [~/Downloads]
set -e
dl="${1:-$HOME/Downloads}"; root=$(cd "$(dirname "$0")/.." && pwd); out="$root/export/web/mods/characters/models/scpsl"
T="$root/.tools/build_scpsl_blend.py"; mkdir -p "$out"; printf "# built by .tools/build_scpsl.sh from the user's downloads\n*\n" > "$out/.gitignore"
run() { blender -b "$@" 2>&1 | grep -E "PARTS|wrote|Error|Traceback" || true; }
run --disable-autoexec "$dl/NewHumans/MTF1.blend" -P "$T" -- "$out/scp_ntf.glb"
run --disable-autoexec "$dl/NewHumans/Chaos.blend" -P "$T" -- "$out/scp_chaos.glb"
run -P "$T" -- "$out/scp_ntf_captain.glb" "$dl/nine-_tailed_fox_captian/scene.gltf"
run -P "$T" -- "$out/scp_chaos_juggernaut.glb" "$dl/chaos_insurgent_juggernaut/scene.gltf" fix-boots
for m in scp_ntf scp_chaos scp_ntf_captain scp_chaos_juggernaut; do
  blender -b -P "$root/.tools/scpsl_icon.py" -- "$out/$m.glb" "$out/${m}_icon.webp" 2>&1 | grep -E "HEIGHT|Error" || true
done
echo "built $out (bump the ?v= on the model paths in .tools/build-season.py after a rebuild)"

#!/bin/sh
# Deadlock operators (Venator, Seven) for the Melon Pass: Valve's heroes, fan rips the user uploaded as .blend files
# (never commit or ship them: the output folder is git-ignored and has no Rind OWN rule).
# Output: export/web/mods/characters/models/deadlock/deadlock_<hero>.glb + _icon.webp .
# usage: .tools/build_deadlock.sh <seven.blend> <venator.blend>
set -e
root=$(cd "$(dirname "$0")/.." && pwd); out="$root/export/web/mods/characters/models/deadlock"
mkdir -p "$out"; printf "# built by .tools/build_deadlock.sh from the user's uploads (Deadlock fan rips; never commit)\n*\n" > "$out/.gitignore"
build() { blender -b --disable-autoexec "$2" -P "$root/.tools/build_deadlock_blend.py" -- "$out/deadlock_$1.glb" 2>&1 | grep -E "BONES|PARTS|wrote|Error|Traceback" || true
  e="$out/deadlock_$1_emissive"   # the exporter can't write this one: patched into the GLB
  if [ -f "$e.png" ]; then ffmpeg -loglevel error -y -i "$e.png" -c:v libwebp -quality 90 "$e.webp" && rm "$e.png"
    python3 "$root/.tools/glb_add_texture.py" "$out/deadlock_$1.glb" "$e.webp" gigawatt_prisoner_head emissiveTexture && rm "$e.webp"; fi
  blender -b -P "$root/.tools/scpsl_icon.py" -- "$out/deadlock_$1.glb" "$out/deadlock_$1_icon.webp" '^Head(Gritty|Psycho)' head 2>&1 | grep -E "HEIGHT|Error" || true; }
build seven "$1"
build venator "$2"
echo "built $out (bump the ?v= on the deadlock_* model paths in characters.json after a rebuild)"

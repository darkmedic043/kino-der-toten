#!/bin/sh
# Akittu's Stylized Experiment V3 operator from the user's "Stylized Experiment V3.zip" (a purchased avatar; never
# committed): unzips the two .blends and runs .tools/build_experiment_blend.py in headless Blender into
# export/web/mods/characters/models/experiment/ (git-ignored), then makes the customisation textures from the
# zip's Unity package (the avatar's own fur colourways, eye and scarf colours; see docs/fork/characters.md).
# usage: .tools/build_experiment.sh ~/Downloads/"Stylized Experiment V3.zip"
set -e
zip="$1"; [ -f "$zip" ] || { echo "usage: $0 <Stylized Experiment V3.zip>"; exit 1; }
root=$(cd "$(dirname "$0")/.." && pwd); out="$root/export/web/mods/characters/models/experiment"; tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
unzip -q -o "$zip" '*/Blender/*.blend' '*.unitypackage' -d "$tmp"
mkdir -p "$out" "$tmp/pkg" "$tmp/tex"
blender -b "$tmp"/*/Blender/akiexpie_base_3dmouth.blend -P "$root/.tools/build_experiment_blend.py" -- \
  "$(ls "$tmp"/*/Blender/akiexpie_default_clothing.blend)" "$tmp/experiment.glb" | grep -E "wrote|keys:|bones added|split:|Error" || true
cp "$tmp/experiment.glb" "$out/experiment.glb"

# textures from the Unity package (a gzipped tar: one folder per asset with `pathname` + `asset`)
tar -xzf "$tmp"/*/*.unitypackage -C "$tmp/pkg"
for d in "$tmp"/pkg/*/; do
  [ -f "$d/asset" ] || continue; n=$(head -1 "$d/pathname")
  case "$n" in
    */Textures/Body/Body_Base_color.png) cp "$d/asset" "$tmp/tex/fur_default.png" ;;
    */Textures/Body/Body_Base_color\ 1.png) cp "$d/asset" "$tmp/tex/fur_albino.png" ;;      # the Albino toggle's texture
    */Textures/Body/LIT/Body_Base_color\ 1.png) cp "$d/asset" "$tmp/tex/fur_gold.png" ;;    # the LIT material's colourways
    */Textures/Body/LIT/Body_Base_color\ 2.png) cp "$d/asset" "$tmp/tex/fur_striped.png" ;;
    */Textures/Body/LIT/Body_Base_color\ 3.png) cp "$d/asset" "$tmp/tex/fur_piebald.png" ;;
    */Textures/Body/Body_Mixed_AO.png) cp "$d/asset" "$tmp/tex/body_ao.png" ;;
    */Textures/Cosmetics/Cosmetics_Base_color.png) cp "$d/asset" "$tmp/tex/cos.png" ;;
    */Textures/Cosmetics/Cosmetics_Mixed_AO.png) cp "$d/asset" "$tmp/tex/cos_ao.png" ;;
    */Textures/Cosmetics/scarf_mask.png) cp "$d/asset" "$tmp/tex/scarf_mask.png" ;;
    */Textures/Eyes/*Puppy_Eye*Sparkle*.png) cp "$d/asset" "$tmp/tex/eyes.png" ;;
  esac
done
ff() { ffmpeg -nostdin -v error -y "$@"; }
# fur colourways x the body AO (as the build bakes the default fur)
for c in albino gold striped piebald; do
  ff -i "$tmp/tex/fur_$c.png" -i "$tmp/tex/body_ao.png" -filter_complex \
    "[0]scale=2048:2048,format=gbrp[a];[1]scale=2048:2048,format=gbrp[b];[a][b]blend=all_mode=multiply" \
    -c:v libwebp -quality 85 "$out/fur_$c.webp"
done
# scarf colours: the scarf (scarf_mask) recoloured on the clothing atlas, 1024 (only the scarf material uses them).
# The scarf is red: hue turns move it round the wheel; black and white desaturate it.
for spec in blue:h=-140 green:h=120 purple:h=-75 gold:h=45:b=1 black:s=0:b=-1.4 white:s=0:b=2.5; do
  c=${spec%%:*}; hue=$(echo "${spec#*:}" | tr : :)
  ff -i "$tmp/tex/cos.png" -i "$tmp/tex/cos_ao.png" -i "$tmp/tex/scarf_mask.png" -filter_complex \
    "[0]scale=1024:1024,format=gbrp[c];[1]scale=1024:1024,format=gbrp[ao];[c][ao]blend=all_mode=multiply,split[x][y];[y]hue=$hue[r];[2]scale=1024:1024,format=gray,dilation,dilation,format=gbrp[m];[x][r][m]maskedmerge" \
    -c:v libwebp -quality 85 "$out/scarf_$c.webp"
done
# eye colours: hue turns of the eye atlas (amber by default)
for spec in blue:-160 green:80 red:-30 purple:-110 pink:-60 cyan:150; do
  ff -i "$tmp/tex/eyes.png" -vf "scale=1024:1024,hue=h=${spec#*:}" -c:v libwebp -quality 90 "$out/eyes_${spec%%:*}.webp"
done
ls -la "$out"
echo "bump the ?v= on its model path in characters.json after a rebuild, or browsers keep the old one for a day"

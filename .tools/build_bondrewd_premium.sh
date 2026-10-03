#!/bin/sh
# Bunny Squad Bondrewd "Premium" (the PC model from "Bondrewd Premium and Quest") → a skin of
# the Bondrewd operator. Fan model; output git-ignored. Run on each checkout:
#   sh .tools/build_bondrewd_premium.sh "$HOME/Downloads/Bunny Squad  Bondrewd Premium and Quest.unitypackage"
# Writes models/bondrewd_premium/: bondrewd_premium.glb plus the textures its toggles swap in.
set -e
cd "$(dirname "$0")/.."
pkg=${1:-"$HOME/Downloads/Bunny Squad  Bondrewd Premium and Quest.unitypackage"}
tmp=$(mktemp -d); tar -xzf "$pkg" -C "$tmp"; mkdir -p "$tmp/tex"
out=export/web/mods/characters/models/bondrewd_premium; mkdir -p "$out"; printf '*.glb\n*.webp\n' > "$out/.gitignore"
for d in "$tmp"/*/; do
  [ -f "$d/pathname" ] || continue; n=$(head -1 "$d/pathname")
  case "$n" in *Quest*) continue;; esac
  case "$n" in
    *"Bondrewd Premium/Mesh/Bondrewd_Premium.fbx") cp "$d/asset" "$tmp/model.fbx" ;;
    *"Bondrewd Premium/Textures/"*.png)
      b=$(basename "$n" .png | tr ' ()' '___'); case "$b" in *norm*|*Norm*|*normal*) s=1024;; *Mask*|*mask*|*Alpha*|*alpha*) s=512;; *) s=2048;; esac
      ffmpeg -nostdin -v error -y -i "$d/asset" -vf "scale='min($s,iw)':-2" "$tmp/tex/$b.png" ;;
  esac
done
# Swapped-in textures and clip masks (inverted copies for Poiyomi's "inverse clipping").
w() { ffmpeg -nostdin -v error -y -i "$tmp/tex/$1.png" $3 -q:v 85 "$out/$2.webp"; }
w Combat_dif combat_dif; w Combat_norm combat_norm; w Anime_Eye anime_eye; w Transform_EMIS_Anime anime_eye_emis
w Metal_Alpha metal_alpha "-vf format=gray"; w Metal_Alpha metal_alpha_inv "-vf format=gray,negate"
w Tail_alpha tail_alpha_inv "-vf format=gray,negate"; w Transform_Mask_fur fur_mask "-vf format=gray"; w Transform_Mask_fur fur_mask_inv "-vf format=gray,negate"
blender -b -P .tools/build_bondrewd_premium_blend.py -- "$tmp/model.fbx" "$tmp/tex" "$PWD/$out/bondrewd_premium.glb" >"$tmp/blender.log" 2>&1 || { tail -20 "$tmp/blender.log"; exit 1; }
rm -rf "$tmp"; ls -la "$out"

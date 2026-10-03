#!/bin/sh
# Bunny Squad Bondrewd (by Malganis Lefay; "feel free to use, edit, and share") from the user's
# downloaded Unity packages → an operator model. Fan model of a Made in Abyss character, so the
# output is git-ignored; run on each checkout:
#   sh .tools/build_bondrewd.sh ~/Downloads/UploadReadyBunnySquadBondrewd/Bondrewd_Base.unitypackage
set -e
cd "$(dirname "$0")/.."
pkg=${1:-$HOME/Downloads/UploadReadyBunnySquadBondrewd/Bondrewd_Base.unitypackage}
tmp=$(mktemp -d); tar -xzf "$pkg" -C "$tmp"; mkdir -p "$tmp/tex"
for d in "$tmp"/*/; do
  [ -f "$d/pathname" ] || continue; n=$(head -1 "$d/pathname")
  case "$n" in
    *Mesh/Bondrewd_Base.fbx) cp "$d/asset" "$tmp/model.fbx" ;;
    *Textures/Helmet/*.png|*Textures/Jacket_Science/*.png|*Textures/Metal/*.png)
      b=$(basename "$n" .png); case "$b" in *norm*|*Norm*) s=1024;; *) s=2048;; esac
      ffmpeg -nostdin -v error -y -i "$d/asset" -vf "scale='min($s,iw)':-2" "$tmp/tex/$b.png" ;;
  esac
done
mkdir -p export/web/mods/characters/models/bondrewd
blender -b -P .tools/build_bondrewd_blend.py -- "$tmp/model.fbx" "$tmp/tex" "$PWD/export/web/mods/characters/models/bondrewd/bondrewd.glb" >/dev/null 2>&1
rm -rf "$tmp"; ls -la export/web/mods/characters/models/bondrewd/bondrewd.glb

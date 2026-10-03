#!/bin/sh
# Fetch Cobblemon's Zoroark (CC BY-NC 3.0, the Cobblemon team) and convert it for the
# operator list: upright, more human posture (pose=…), paw wrists split out and claws on the
# hands for first-person arms (split/reparent). Git-ignored (Pokémon IP); run on each checkout.
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); R="https://gitlab.com/cable-mc/cobblemon-assets/-/raw/master/blockbench/pokemon/gen5/0571_zoroark"
for f in zoroark.bbmodel zoroark.animation.json LICENSE; do curl -sfL "$R/$f" -o "$tmp/$f"; done
mkdir -p export/web/mods/characters/models/zoroark
python3 .tools/bbmodel_to_glb.py "$tmp/zoroark.bbmodel" "$tmp/zoroark.animation.json" export/web/mods/characters/models/zoroark/zoroark.glb \
  idle=animation.zoroark.ground_idle walk=animation.zoroark.ground_walk run=animation.zoroark.ground_walk@1.7 \
  split=arm_right2:locator_hand_primary:4 split=arm_left2:locator_hand_secondary:4 \
  reparent=claw_back_right,claw_middle_right,claw_front_right:locator_hand_primary \
  reparent=claw_back_left,claw_middle_left,claw_front_left:locator_hand_secondary \
  pose=torso:20,0,0 pose=waist:20,0,0 pose=head:-30,0,0 \
  pose=leg_right:-15,0,-12 pose=leg_left:-15,0,12 pose=leg_right2:33,0,0 pose=leg_left2:33,0,0 \
  pose=arm_left:0,55,30 pose=arm_right:0,-55,-30 \
  extend=hair3:-1,-6,0,1,0,10 shrink=hair4:0.7 offset=hair4:0,-2,11 pose=hair4:57,0,0 pose=hair6:4,0,0 pose=hair7:-12,0,0 pose=hair8:-22,0,0 pose=hair11:-20,0,0
rm -rf "$tmp"

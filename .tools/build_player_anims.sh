#!/bin/sh
# BO1 player-body (pb_*) animations for third-person operators (bo1-motion.js), from the
# OAT Unlinker dump of common_zombie_assets. Ripped assets: the output is git-ignored, so
# run this on each checkout:  sh .tools/build_player_anims.sh
set -e
cd "$(dirname "$0")/.."
src=export_game/common_zombie_assets/xanim
out=export/web/mods/characters/animations
mkdir -p "$out"; printf '*.json\n' > "$out/.gitignore"
set -- pb_stand_alert pb_stand_ads pb_stand_alert_pistol \
  pb_stand_shoot_walk_forward pb_stand_shoot_walk_back pb_stand_shoot_walk_left pb_stand_shoot_walk_right \
  pb_combatrun_forward_loop pb_combatrun_back_loop pb_combatrun_left_loop pb_combatrun_right_loop \
  pb_sprint pb_sprint_pistol \
  pb_crouch_alert pb_crouch_ads pb_crouch_run_forward pb_crouch_run_back pb_crouch_run_left pb_crouch_run_right \
  pb_prone_aim pb_prone_crawl pb_prone_crawl_back pb_prone_crawl_left pb_prone_crawl_right \
  pb_standjump_takeoff pb_standjump_land pb_runjump_takeoff pb_runjump_land \
  pb_dive_prone pb_dive_prone_land pb_terrain_slide pb_breach_slide pb_climbup \
  pb_turn_90left pb_turn_90right
for a; do node .tools/xanim_to_json.mjs "$src/$a" -o "$out" >/dev/null; done
ls "$out" | wc -l

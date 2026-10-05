// Zombies rise from the ground: BO1's riser clips (ai_zombie_traverse_ground_*, ripped: animations/ is git-ignored,
// built by .tools/build_zombie_rise.sh) are added to the game's animations; enemies.js plays one when a zombie spawns
// at a spawn point without boards (custom maps' ZSPAWN / nearby spawns), climbing up from below the ground.
const CLIPS=['ai_zombie_traverse_ground_climbout_fast','ai_zombie_traverse_ground_v1_run'];

export async function prepare(data){
  const base=new URL('animations/',import.meta.url).href;
  for(const n of CLIPS){
    const url=base+n+'.json';
    const ok=await fetch(url,{method:'HEAD'}).then(r=>r.ok).catch(()=>false);
    if(ok)data.animations={...data.animations,[n]:url};
  }
  return data;
}
export default function setup(){}

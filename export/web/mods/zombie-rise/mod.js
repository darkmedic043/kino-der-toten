// Zombies rise from the ground: BO1's riser clips (ai_zombie_traverse_ground_*, ripped: animations/ is git-ignored,
// built by .tools/build_zombie_rise.sh) are added to the game's animations; enemies.js plays one when a zombie spawns
// at a spawn point without boards (custom maps' ZSPAWN / nearby spawns), climbing up from below the ground.
// The traversal clips (BO1's window vaults, jump-downs and the climb up, with their root motion) carry zombies over
// fences, ledges and barricade windows (enemies.js hopOver / entering).
const CLIPS=['ai_zombie_traverse_ground_climbout_fast','ai_zombie_traverse_ground_v1_run','ai_zombie_traverse_v1','ai_zombie_traverse_v5','ai_zombie_traverse_v7',
  'ai_zombie_jump_down_40','ai_zombie_jump_down_72','ai_zombie_jump_down_96','ai_zombie_jump_up_2_climb'];

export async function prepare(data){
  const base=new URL('animations/',import.meta.url).href;
  const ok=await Promise.all(CLIPS.map(n=>fetch(base+n+'.json',{method:'HEAD'}).then(r=>r.ok).catch(()=>false)));
  data.animations={...data.animations,...Object.fromEntries(CLIPS.filter((n,i)=>ok[i]).map(n=>[n,base+n+'.json']))};
  return data;
}
export default function setup(){}

// Double Tap 2.0 (Black Ops 2 onward): on top of the base game's faster fire
// rate (fireTime / 1.33 in rules.js), every bullet counts twice. Applies to
// bullet hits only (not melee, explosions, wonder-weapon effects).
export default function setup({host,session}){
  host.on('beforeEnemyDamage',e=>{
    if(e.cause==='bullet'&&!e.melee&&session.perks?.has('specialty_rof'))e.amount*=2;
  });
}

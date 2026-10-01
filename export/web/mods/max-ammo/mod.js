// Max Ammo fills magazines as well as reserves, for every gun you carry and its
// underbarrel. Runs after the game's own refill, so reserves stay at max too.
export default function setup({session,data}){
  const powerup=session.powerup?.bind(session);if(!powerup)return;
  session.powerup=(type,...rest)=>{
    const r=powerup(type,...rest);if(type!=='full_ammo')return r;
    const current=session.weapon;
    for(const w of session.inventory??[]){
      const d=data.weapons[w.id];if(!d)continue;
      const def=w.upgraded&&d.upgrade?{...d,...d.upgrade}:d,a=def.attachment;
      if(w===current&&session.attachmentMode){if(w.primaryAmmo)w.primaryAmmo.mag=def.clipSize;if(a)w.mag=a.clipSize;}
      else{w.mag=def.clipSize;if(a&&w.attachmentAmmo)w.attachmentAmmo.mag=a.clipSize;}
    }
    if(session.reloadLeft>0)session.cancelReload?.();
    return r;
  };
}

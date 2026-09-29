// Player health from data rules (the game hardcodes 100, or 250 with Juggernog).
// A normal zombie hit does 50, so 150 health is three hits.
export default async function setup(api){
  const {session,data,host}=api,rules=data.rules;
  const base=+(rules.player_health??100),jugg=+(rules.player_health_juggernog??250);
  Object.defineProperty(session,'maxHealth',{configurable:true,get(){return this.perks.has('specialty_armorvest')?jugg:base;}});
  // Starting a game and getting back up from Quick Revive both reset to 100 in
  // the game code; bring them up to the configured value instead.
  const fill=()=>{session.health=session.maxHealth;};
  host.on('reset',fill);fill();
  let phase=session.phase;
  host.on('update',()=>{if(phase==='reviving'&&session.phase==='fighting')fill();phase=session.phase;});
}

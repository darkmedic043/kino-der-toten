// Group trips (2026-11-02): everyone standing on a teleporter goes with the player who used it. Map code calls
// groupTrip.start(key,data,at,radius) when its own trip starts, and groupTrip.on(key,(data,here)=>...) runs on each
// teammate: `here` is true when they stand within radius of `at` (they start the same trip, without paying or needing
// the pad's lock), false elsewhere (share the pad's cooldown). With no `at` everyone gets here=false: pad state each
// client keeps for itself (Kino's link). The multiplayer mod fills in `send` and calls `receive`; solo, start does
// nothing, so a map needs no co-op check. maps/custom.js does this for every world.teleporters pad (The Giant, Der
// Eisendrache's rocket pad, any future custom map), maps/kino.js for the stage pad.
// maps/moon.js sends 'moon:trip' (the whole squad goes) and handles 'area' (the multiplayer mod's snaps: the host's
// session.area, for a teammate left in the other area).
const handlers=new Map();
export const TRIP_RADIUS=140;
export const groupTrip={
  send:null,
  on(key,fn){handlers.set(key,fn);},
  start(key,data={},at=null,radius=TRIP_RADIUS){this.send?.({key,data,at:at?[at.x,at.y,at.z]:null,radius});},
  receive(m,feet){
    const fn=handlers.get(m.key);if(!fn)return;
    const here=!!m.at&&Math.hypot(feet.x-m.at[0],feet.z-m.at[2])<=m.radius&&Math.abs(feet.y-m.at[1])<=160;
    fn(m.data??{},here);
  },
};

// Fall damage, as BO1 does it (bg_fallDamageMinHeight 128, bg_fallDamageMaxHeight 300): a drop of more than 128 hurts,
// scaling linearly up to the player's whole max health at 300. The height is from the top of the arc (a jump's or a
// dive's hop counts) to the landing, scaled by gravity against the strongest gravity seen, so Moon's low gravity
// (and other light-gravity spots) hurts as much as the same impact would, not the same height.
//
// Before the damage lands it emits host 'fall' with {height, amount, dive, position}; a mod may lower e.amount
// (perks-plus: PhD Flopper takes it to 0, and a dive that would have hurt explodes instead). dive is true when the
// fall ends a dive to prone (the movement mod's 'dive' event), BO1's self.divetoprone.
//
// Not counted: teleports and position resets (the feet move more than 150 in one frame), Moon's jump pad flights
// (api.features.flight), and the time before the game starts.
const MIN = 128, MAX = 300;
export default function setup(api) {
  const { host, player, session } = api;
  let peak = null, last = null, dive = false, refG = 0;   // refG: from the first frame on (Moon sets its gravity per frame, after the movement mod's setup value)
  host.on('dive', () => { dive = true; });
  host.on('reset', () => { peak = last = null; dive = false; });
  host.on('update', () => {
    const feet = player.getFeetPosition();
    refG = Math.max(refG, player.gravity || 0);
    const jumped = last && feet.distanceTo(last) > 150;
    last = feet.clone();
    if (jumped || api.features?.flight || session.phase === 'gameover' || session.phase === 'reviving') { peak = player.onFloor ? null : feet.y; if (player.onFloor) dive = false; return; }
    if (!player.onFloor) { peak = Math.max(peak ?? feet.y, feet.y); return; }
    if (peak === null) { dive = false; return; }
    const height = (peak - feet.y) * (player.gravity || refG) / refG, wasDive = dive;
    peak = null; dive = false;
    if (height <= MIN) return;
    const e = { height, amount: session.maxHealth * Math.min(1, (height - MIN) / (MAX - MIN)), dive: wasDive, position: feet };
    host.emit('fall', e);
    if (e.amount > 0) api.damage(e.amount);
  });
}

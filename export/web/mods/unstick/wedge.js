// Wedge jump (2026-11-15): a capsule resting in a V between two slopes steeper than the floor limit (sloped banister
// tops, rubble, pipe pairs) is never "on the floor", so the controller refuses to jump and the player is trapped. When
// the feet have held still in the air (under 20 u/s vertically) for 0.15 s, hand the controller its coyote time so the
// next jump works. The apex of a real jump is still for about 0.05 s, so this gives no double jumps. Shared by the
// unstick mod and .tools/stuck-audit.mjs, so the audit tests the same rule the game plays by.
export function wedgeAssist(pc, dt, st) {
  const y = pc.feetPosition.y;
  if (pc.onFloor || pc.onLadder || st.y == null || Math.abs(y - st.y) > 20 * dt) st.t = 0;
  else if ((st.t += dt) >= .15) pc._coyoteTimer = Math.max(pc._coyoteTimer ?? 0, .12);
  st.y = y;
  return st.t >= .15;
}

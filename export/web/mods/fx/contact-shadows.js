// Contact shadows (fork, 2026-11-19): a soft dark patch on the ground under every zombie, teammate and the player,
// so bodies stand on the floor instead of floating over it where no shadow map reaches them (Der Eisendrache has no
// sun shadow, Kino's lamps don't shadow zombies). One instanced draw for all of them, every graphics level.
//
// The patch sits at the body's feet (a zombie's root, a teammate's avatar root), lifted 1.2 units with a polygon
// offset; the ground's depth clips whatever hangs over an edge. The player's own is dropped onto the ground under
// them by a ray, and thins out as they leave it (jumps, dives). A dying zombie's fades in half a second. Instance 0
// is the player and is always drawn, so the program is compiled by the load's warm-up, not at the first spawn.
// kino.contactShadows: { strength, radius, playerRadius, enabled, count }.
import * as THREE from 'three';
const MAX = 96;
export function setupContactShadows(api) {
  const { host, scene, enemies, player, world } = api;
  const cfg = { strength: .68, radius: 23, playerRadius: 17, enabled: true, count: 0 };
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  geo.setIndex([0, 2, 1, 0, 3, 2]);
  const inst = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), fade = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  inst.setUsage(THREE.DynamicDrawUsage); fade.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('inst', inst); geo.setAttribute('fade', fade); geo.instanceCount = 1;
  const mat = new THREE.ShaderMaterial({
    uniforms: { strength: { value: cfg.strength } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    vertexShader: `attribute vec4 inst;attribute float fade;varying vec2 vP;varying float vA;
      void main(){vP=position.xz;vec3 w=inst.xyz+position*inst.w;vA=fade*(1.-smoothstep(1400.,2200.,distance(cameraPosition,inst.xyz)));
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader: `uniform float strength;varying vec2 vP;varying float vA;
      void main(){float d=length(vP);if(d>=1.)discard;float k=1.-d;gl_FragColor=vec4(0.,0.,0.,strength*vA*k*k*(1.6-.6*k));}`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.name = 'contact-shadows'; mesh.userData.noMerge = mesh.userData.noVisCull = true; mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  const fades = new WeakMap(), ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  let ground = null, groundT = 0;
  const put = (i, x, y, z, r, a) => { const o = i * 4; inst.array[o] = x; inst.array[o + 1] = y + 1.2; inst.array[o + 2] = z; inst.array[o + 3] = r; fade.array[i] = a; };
  host.on('update', dt => {
    mesh.visible = cfg.enabled; if (!cfg.enabled) return; mat.uniforms.strength.value = cfg.strength;
    const k = 1 - Math.exp(-(dt || .016) * 7); let n = 1;
    // the player: the ground under the feet, looked up 20 times a second
    const f = player.getFeetPosition();
    if ((groundT -= dt) <= 0 || ground == null) { groundT = .05; ray.origin.set(f.x, f.y + 20, f.z); const h = world.collision?.raycastFirst?.(ray, 0, 420); ground = h ? f.y + 20 - h.distance : null; }
    if (ground == null) put(0, f.x, f.y, f.z, cfg.playerRadius, 0);
    else { const up = Math.max(0, f.y - ground); put(0, f.x, ground, f.z, cfg.playerRadius * (1 + up / 260), .85 * Math.max(0, 1 - up / 300)); }
    for (const z of enemies.list) { if (n >= MAX) break; const p = z.root?.position; if (!p) continue;
      let a = fades.get(z) ?? 0; a += ((z.state === 'dead' ? 0 : 1) - a) * k; fades.set(z, a); if (a < .01) continue;
      const s = z.root.scale.x || 1; put(n++, p.x, p.y, p.z, cfg.radius * Math.min(2.5, Math.max(.6, s)), a); }
    const remotes = window.kino?.coop?.remotes;
    if (remotes?.size) for (const r of remotes.values()) { if (n >= MAX) break; const o = r.root; if (!o?.parent || o.visible === false || r.dead) continue; put(n++, o.position.x, o.position.y, o.position.z, cfg.playerRadius * (r.down ? 1.5 : 1), 1); }
    geo.instanceCount = cfg.count = n; inst.needsUpdate = fade.needsUpdate = true;
  });
  put(0, 0, -1e5, 0, cfg.playerRadius, 0);
  (window.kino ??= {}).contactShadows = cfg;
  return cfg;
}

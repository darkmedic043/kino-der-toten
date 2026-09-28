// Generic walk/fly explorer for custom maps (not part of upstream).
// Open explorer.html?map=<id>; the map is looked up in mods/maps.json.
// See mods/README.md for the map entry format.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld, loadCollisionWorld } from './collision-world.js';
import { PlayerController } from './player-controller.js';
import { optimizeStaticScene } from './scene-optimizer.js';

const status = document.getElementById('status');
const help = document.getElementById('help');
const debug = document.getElementById('debug');
const keys = new Set(), errors = [];
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 1, 70000);
camera.rotation.order = 'YXZ';
const scene = new THREE.Scene();
let renderer, entry, player, collision, spawn;
let ready = false, active = false, flying = false, helpVisible = true, fps = 0;
const forward = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
const COLLISION_NAME = /^(COL|UCX|collision)[_.-]/i;

function updateHelp() {
  help.hidden = !ready || !helpVisible;
  help.textContent = active
    ? `WASD move · Mouse look · Shift ${flying ? 'faster' : 'sprint'} · ${flying ? 'Space / Ctrl up / down' : 'Space jump'} · F ${flying ? 'walk' : 'fly'} · R reset · H hide · Esc release`
    : 'Click the map to explore · WASD move · Mouse look · F fly / walk';
}
function pause() { active = false; keys.clear(); player?.setEnabled(false); updateHelp(); }
function reset() {
  flying = false; keys.clear();
  player.setPosition(spawn.position.clone().add(new THREE.Vector3(0, 3, 0)));
  camera.rotation.set(0, spawn.yaw, 0);
  player.setEnabled(true);
  for (let i = 0; i < 90; i++) player.update(1 / 120, {});
  player.setEnabled(active);
  updateHelp();
}
function toggleFly() {
  flying = !flying;
  if (!flying) player.setPosition(camera.position.clone().add(new THREE.Vector3(0, -player.eyeHeight, 0)));
  player.setEnabled(active && !flying); keys.clear(); updateHelp();
}

// Without a baked collision file, collide with the map's own triangles. Meshes
// named COL_*, UCX_* or collision_* are used instead when present, and hidden.
function buildCollision(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const dedicated = meshes.filter(o => COLLISION_NAME.test(o.name));
  for (const o of dedicated) o.visible = false;
  const geometries = (dedicated.length ? dedicated : meshes).map(o => {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    return g.applyMatrix4(o.matrixWorld);
  });
  if (!geometries.length) throw new Error('The map has no meshes to collide with');
  return new CollisionWorld(mergeGeometries(geometries, false));
}

async function load() {
  const id = new URLSearchParams(location.search).get('map');
  const list = await fetch('./mods/maps.json').then(r => r.json());
  entry = list.maps.find(m => m.id === id);
  if (!entry) throw new Error(`No map "${id}" in mods/maps.json`);
  if (!entry.dir) { location.replace(entry.url); return; }
  document.title = entry.title;
  status.textContent = `Loading ${entry.title}…`;
  const dir = entry.dir.replace(/\/?$/, '/');

  renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = entry.exposure ?? 1.4;
  document.body.prepend(renderer.domElement);
  scene.background = new THREE.Color(entry.background ?? '#20262b');
  scene.add(new THREE.AmbientLight(0xc3d6e8, entry.ambient ?? .9));
  scene.add(new THREE.HemisphereLight(0xc0cddd, 0x4e4a45, 1.7));
  const sun = new THREE.DirectionalLight(0xf2ead8, 2.0);
  sun.position.set(-.6, .8, -.4); scene.add(sun);

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => { status.textContent = `Loading ${entry.title}… ${Math.round(100 * loaded / total)}%`; };
  manager.onError = url => errors.push(`Asset failed: ${url}`);
  const gltf = await new GLTFLoader(manager).loadAsync(dir + entry.model);
  if (errors.length) throw new Error(errors.join('\n'));
  const world = gltf.scene;
  // Game units are inches; a Blender export in metres needs scale 39.37.
  world.scale.setScalar(entry.scale ?? 1);
  collision = entry.collision
    ? await loadCollisionWorld({metadataUrl: dir + entry.collision})
    : buildCollision(world);
  const optimization = optimizeStaticScene(world, {cellSize: 640, verticalCellSize: 384});
  scene.add(world);

  const bounds = new THREE.Box3().setFromObject(world);
  const center = bounds.getCenter(new THREE.Vector3());
  spawn = {
    position: entry.spawn?.position ? new THREE.Vector3(...entry.spawn.position) : new THREE.Vector3(center.x, bounds.max.y + 10, center.z),
    yaw: THREE.MathUtils.degToRad(entry.spawn?.yaw ?? 0),
  };
  player = new PlayerController(camera, collision, {
    radius: 15, height: 70, eyeHeight: 60, moveSpeed: 190, sprintSpeed: 285,
    crouchSpeed: 90, gravity: 800, jumpHeight: 39, stepHeight: 18, groundProbeDistance: 4,
  });
  reset();
  ready = true; status.hidden = true; updateHelp();
  renderer.domElement.addEventListener('click', () => {
    if (!ready || active) return;
    renderer.domElement.requestPointerLock()?.catch(() => { help.hidden = false; help.textContent = 'Click the map again to capture the mouse.'; });
  });
  window.explorer = {scene, camera, player, collision, renderer, entry, world,
    debug: {reset, snapshot: () => ({ready, active, flying, grounded: player.isGrounded, position: camera.position.toArray(),
      feet: player.getFeetPosition().toArray(), fps, drawCalls: renderer.info.render.calls, optimization, errors: [...errors]})}};

  let previous = performance.now(), frameTime = 0, frames = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - previous) / 1000, .25); previous = now;
    if (active) {
      const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      if (flying) {
        camera.getWorldDirection(forward);
        right.setFromMatrixColumn(camera.matrix, 0);
        wish.copy(forward).multiplyScalar(z).addScaledVector(right, x);
        wish.y += Number(keys.has('Space')) - Number(keys.has('ControlLeft') || keys.has('ControlRight'));
        if (wish.lengthSq()) camera.position.addScaledVector(wish.normalize(), (sprint ? 1800 : 600) * dt);
      } else {
        for (let remaining = dt; remaining > 0;) {
          const step = Math.min(remaining, .05);
          player.update(step, {forward: z, strafe: x, sprint, jump: keys.has('Space'),
            crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC')});
          remaining -= step;
        }
        if (player.getFeetPosition().y < bounds.min.y - 600) reset();
      }
    }
    renderer.render(scene, camera);
    frames++; frameTime += dt;
    if (frameTime >= .5) { fps = Math.round(frames / frameTime); frames = 0; frameTime = 0; }
    if (!debug.hidden) debug.textContent = `${fps} FPS · ${renderer.info.render.calls} calls\n${flying ? 'Fly' : 'Walk'} · ${camera.position.toArray().map(n => n.toFixed(1)).join(', ')}`;
  });
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer?.domElement) { pause(); return; }
  active = true; keys.clear(); player?.setEnabled(!flying); updateHelp();
});
document.addEventListener('mousemove', e => {
  if (!active) return;
  camera.rotation.y -= e.movementX * .002;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - e.movementY * .002, -1.55, 1.55);
});
addEventListener('keydown', e => {
  if (!active) return;
  if (['Space', 'F3'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyF') toggleFly();
  if (e.code === 'KeyR') reset();
  if (e.code === 'KeyH') { helpVisible = !helpVisible; updateHelp(); }
  if (e.code === 'F3') debug.hidden = !debug.hidden;
  if (e.code === 'Escape') { document.exitPointerLock(); pause(); }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { document.exitPointerLock(); pause(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer?.setSize(innerWidth, innerHeight);
});
load().catch(error => {
  errors.push(String(error));
  status.hidden = false;
  status.textContent = `The map could not load.\n${error.message}`;
  console.error(error);
});

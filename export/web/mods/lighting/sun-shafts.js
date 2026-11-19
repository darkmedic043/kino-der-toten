// Sun (or moon) rays for maps whose key light casts no shadows (2026-11-19, user: "make sun rays and anything like
// that able ... if they have a sun"). The real shafts (shafts.js) walk each view ray through a light's shadow map; only
// Kino's day sun and Gorod Krovi's sun have one. Giving the other maps a shadow-casting sun would change every lit
// shader on them and add a shadow pass, so this draws the map's depth from the key light's direction ONCE into its own
// target (at the load-time warm-up, again a few seconds into play and when a door opens or the power comes on) and
// hands the shaft pass a stand-in "light" that carries that map. Nothing lit changes: no light is added to the scene,
// no surface gets a shadow, the per-frame cost is the shaft pass alone (half resolution, High and Ultra).
//
// The depth map covers the play area (the spawn, the zombies' spawns and everything usable, padded, inside the
// collision's box); air outside it counts as lit.
// What blocks the light: every solid mesh under world.root and every static batch in the scene. Cut-out and see-through materials
// (fences, leaves, glass, decals) let it pass, and a sky dome is skipped. Zombies and players cast nothing here.
//
//   kino.sunShafts            { entry, light, box, size, redraw(), stats, debug() }   (entry = the shafts.js settings: tune live)
//   ?noSunShafts              off, for a before/after look
import * as THREE from 'three';

// per map: the shaft settings (see shafts.js for each), `pad` = how far past the play area the depth map reaches
// sideways, `min` = the key light's lowest useful height (a sun under it is lifted so its rays still clear the roofs)
const MAPS = {
  // Tuned on light copies at 1x/3x/8x (2026-11-19). In open air the pass can only add an even haze, so `strength` stays
  // low; rays read as rays where roofs, slats and windows cut the light, and there the camera stands in the shade, so
  // `indoor` carries them (the gondola station's roof slats on Der Eisendrache, the houses on Nuketown).
  'der-eisendrache': { strength: .025, density: .0013, g: .35, far: 3000, dust: .5, lift: 5, sky: .15, indoor: 5, white: .55 },   // moonlit snow light over the castle
  'the-giant': { strength: .045, density: .0014, g: .4, far: 2600, dust: .45, lift: 5, sky: .25, indoor: 3, white: .35 },      // the moon through the factory's open roof trusses
  'malibu-drive': { strength: .02, density: .0012, g: .45, far: 3200, dust: .35, lift: 4, sky: .25, indoor: 5, white: .3 },     // a warm sun over the gardens; more washes the trees out
  'nuketown': { strength: .035, density: .0014, g: .35, far: 2800, dust: .5, lift: 5, sky: .25, indoor: 5, white: .5 },         // the pale storm light through the houses' windows
};
export const sunShaftMaps = Object.keys(MAPS);

export function setupSunShafts(api, shafts, quality) {
  const { scene, renderer, host, session } = api, cfg = MAPS[api.map?.id];
  if (!cfg || !renderer || !shafts || /[?&]noSunShafts/.test(location.search)) return null;
  const q = quality();
  if (q < 2) return null;   // the shaft pass only runs on High and Ultra: no depth map for nothing
  const size = q >= 3 ? 4096 : 2048;
  // 16-bit depth with a compare function (the pass reads it as a sampler2DShadow, hardware PCF) and the smallest colour
  // attachment three allows: 48 MB at 4096, 12 MB at 2048
  const depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedShortType);
  depthTexture.compareFunction = THREE.LessEqualCompare; depthTexture.magFilter = depthTexture.minFilter = THREE.LinearFilter;
  const rt = new THREE.WebGLRenderTarget(size, size, { depthTexture, format: THREE.RedFormat, type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  rt.texture.name = 'sun-shafts';
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2); cam.matrixAutoUpdate = false;
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }); depthMat.name = 'sun-shafts-depth';
  const fakeScene = new THREE.Scene(); fakeScene.matrixWorldAutoUpdate = false; fakeScene.overrideMaterial = depthMat;   // its own render state: the real scene's light set is not touched
  // the stand-in the shaft pass reads: colour, intensity, direction and the depth map (never added to the scene)
  const light = { isDirectionalLight: true, castShadow: true, visible: true, intensity: 0, color: new THREE.Color(1, 1, 1), parent: scene,
    shadow: { map: { depthTexture }, matrix: new THREE.Matrix4() }, matrixWorld: new THREE.Matrix4(), target: { matrixWorld: new THREE.Matrix4() } };
  const { pad = 600, min = .5, ...opts } = cfg, entry = shafts.add(light, opts);
  const stats = { draws: 0, ms: 0, hidden: 0, calls: 0 }, box = new THREE.Box3(), play = new THREE.Box3(), dir = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3();
  const REACH = 5000;
  const BIAS = new THREE.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
  let key = null, drawn = false;
  const findKey = () => key ??= scene.children.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity)[0] ?? null;
  const passes = m => !m || m.transparent || m.alphaTest > 0 || m.depthWrite === false || m.side === THREE.BackSide || (m.blending ?? THREE.NormalBlending) !== THREE.NormalBlending || m.visible === false;

  function draw() {
    const world = api.world, root = world?.root; if (!root || !findKey()) return false;
    const t0 = performance.now();
    // the area: where the match happens (the spawn, the zombies' spawns, everything that can be used), padded, and never
    // more than the collision's box. The collision alone is no guide: Nuketown's runs 43,000 units out over the desert,
    // which left the town about 15 units a texel. Outside the map the pass treats the air as lit.
    const cb = world.collision?.geometry?.boundingBox;
    if (cb && !cb.isEmpty()) box.copy(cb); else box.setFromObject(root);
    play.makeEmpty(); let n = 0; const put = p => { if (p?.isVector3) { play.expandByPoint(p); n++; } };
    put(world.spawn?.position); for (const k of ['interactions', 'rising', 'boxLocations']) for (const o of world[k] ?? []) put(o.position ?? o.pos);
    if (n >= 4) { play.min.y -= 300; play.max.y += 900; play.expandByVector(_v.set(pad, 0, pad)); box.intersect(play); if (box.isEmpty()) box.copy(play); }
    else { box.min.x -= pad; box.min.z -= pad; box.max.x += pad; box.max.z += pad; box.max.y += pad * 2; box.min.y -= 100; }
    stats.area = n >= 4 ? 'play' : 'collision';
    dir.copy(key.position).normalize(); if (dir.y < min) { dir.y = min; dir.normalize(); }
    const c = box.getCenter(_c), R = box.getSize(_v).length() / 2;
    cam.position.copy(c).addScaledVector(dir, R + REACH);   // far enough back that a tower or a hillside outside the area still shades it cam.up.set(0, 1, 0); cam.lookAt(c); cam.updateMatrix(); cam.updateMatrixWorld(true);
    // fit the frustum to the box as the light sees it
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < 8; i++) { _v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(cam.matrixWorldInverse);
      x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); z0 = Math.min(z0, -_v.z); z1 = Math.max(z1, -_v.z); }
    cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1; cam.near = 1; cam.far = z1 + 50; cam.updateProjectionMatrix();
    light.shadow.matrix.multiplyMatrices(BIAS, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    light.matrixWorld.makeTranslation(cam.position.x, cam.position.y, cam.position.z); light.target.matrixWorld.makeTranslation(c.x, c.y, c.z);
    render(rt, root);
    stats.draws++; stats.ms = Math.round(performance.now() - t0); drawn = true;
    return true;
  }
  // the map's solid meshes into `target`'s depth, as the light sees them
  function render(target, root) {
    // what lets the light through sits this draw out
    const hidden = [];
    root.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && (!o.isMesh || o.userData.noSunShafts || passes(Array.isArray(o.material) ? o.material[0] : o.material))) { o.visible = false; hidden.push(o); } });
    const ic = globalThis.kino?.instanceCull, sm = renderer.shadowMap, keep = { rt: renderer.getRenderTarget(), auto: renderer.autoClear, smAuto: sm.autoUpdate, smNeeds: sm.needsUpdate, calls: renderer.info.render.calls };
    ic?.restore?.();   // every batched piece, not only the ones the player's camera keeps
    try {
      sm.autoUpdate = false; sm.needsUpdate = false;   // lights under the map root keep their own shadow maps
      // drawn in place, no reparenting: the map root plus the static batches, which sit in the scene itself (instance-cull.js)
      fakeScene.children = [root, ...scene.children.filter(o => o.isBatchedMesh && o.visible && !o.userData.noSunShafts && !passes(o.material))];
      renderer.autoClear = true; renderer.setRenderTarget(target); renderer.render(fakeScene, cam);
    } finally {
      fakeScene.children = []; renderer.setRenderTarget(keep.rt); renderer.autoClear = keep.auto; sm.autoUpdate = keep.smAuto; sm.needsUpdate = keep.smNeeds;
      for (const o of hidden) o.visible = true;
      ic?.reapply?.();
    }
    stats.hidden = hidden.length; stats.calls = renderer.info.render.calls - keep.calls;
  }

  let again = 0, sig = '';
  host.on('warm', () => { try { draw(); again = 3; } catch (error) { console.warn('[sun-shafts]', error); } });
  host.on('update', dt => {
    if (!findKey()) return;
    light.color.copy(key.color); light.intensity = drawn ? key.intensity : 0;   // follows the map's own key light (Nuketown's lightning flashes it)
    if (again > 0 && (again -= dt) <= 0) draw();
    const s = `${session?.openDoors?.size ?? 0}|${session?.power ? 1 : 0}`;
    if (s !== sig) { if (sig) again = 1.5; sig = s; }   // a door's pieces take a moment to go
  });
  const out = { entry, light, box, size, cam, rt, stats, redraw: draw,
    // the depth map as a grey picture (near = dark), for checking what blocks the light
    debug(px = 512) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, depthTest: false,
        vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: 'uniform sampler2D t;varying vec2 v;void main(){gl_FragColor=vec4(vec3(texture2D(t,v).x),1.);}' }));
      const dt = new THREE.DepthTexture(size, size, THREE.UnsignedShortType), r2 = new THREE.WebGLRenderTarget(size, size, { depthTexture: dt, format: THREE.RedFormat }), o = new THREE.WebGLRenderTarget(px, px), keep = renderer.getRenderTarget();
      // a plain copy of the draw (a compare texture can't be read as a picture)
      render(r2, api.world.root);
      q.material.uniforms.t.value = dt; q.frustumCulled = false; const s2 = new THREE.Scene(); s2.add(q); renderer.setRenderTarget(o); renderer.render(s2, cam);
      const buf = new Uint8Array(px * px * 4); renderer.readRenderTargetPixels(o, 0, 0, px, px, buf); renderer.setRenderTarget(keep); r2.dispose(); dt.dispose(); o.dispose(); q.geometry.dispose(); q.material.dispose();
      const cv = document.createElement('canvas'); cv.width = cv.height = px; const g = cv.getContext('2d'), im = g.createImageData(px, px);
      for (let y = 0; y < px; y++) im.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4); g.putImageData(im, 0, 0); return cv.toDataURL('image/jpeg', .9);
    } };
  if (window.kino) window.kino.sunShafts = out;
  return out;
}

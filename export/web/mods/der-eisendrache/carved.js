import * as THREE from 'three';

// Flat grey sheets on the ground and walls ("white blotches", 2026-11-12). Three causes, all from the map build:
// (1) the glowing rune circles of the rune prison quest are placed twice, once as CASTLE_BQ_rcircle_* (hidden, the bow
// quest shows them) and once as plain script models CASTLE_SM_aq_rp_runic_circle_* that nothing hid: a 232 unit sheet
// with no texture at the road, the roof and the rampart. Those copies leave the scene.
// (2) BO3's "carved" decals (the rune circles and their symbols cut into the ground, the wind runes on the walls, the
// pyramid's celestial carving) only have a normal map: the game bends the surface's normals with it. With no colour
// image the build wrote them as opaque grey. Here they become what they are, an overlay: the grooves, read from the
// normal map's slope, drawn dark over the stone and nothing in between.
// (3) the road's blood footprints (wc/t7_decal_blood_footprints, 24,600 triangles over the lower road) lost their
// footprint image: the build drew its red tint over a detail map, a pink wash across the snow. Not drawn.
export function carvedDecals(root, scene) {
  for (const o of [...root.children]) if (/^CASTLE_SM_aq_rp_runic_circle_/.test(o.name)) o.removeFromParent();
  const done = new Map();
  const carve = m => {
    if (done.has(m)) return done.get(m);
    let ok = false; const nm = m.normalMap, img = nm?.image;
    if (img?.width) try {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const s = Math.hypot(p[i] / 127.5 - 1, p[i + 1] / 127.5 - 1), t = Math.min(1, Math.max(0, (s - .08) / .36)); p[i] = 46; p[i + 1] = 42; p[i + 2] = 39; p[i + 3] = Math.round(t * t * (3 - 2 * t) * 175); }
      x.putImageData(d, 0, 0);
      const tex = new THREE.CanvasTexture(c); tex.name = (nm.name || m.name) + '_carve'; tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = nm.flipY; tex.wrapS = nm.wrapS; tex.wrapT = nm.wrapT; tex.channel = nm.channel; tex.repeat.copy(nm.repeat); tex.offset.copy(nm.offset); tex.anisotropy = 4;
      m.map = tex; m.color.setScalar(1); m.transparent = true; m.depthWrite = false; m.roughness = 1; m.metalness = 0; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -8; m.userData.decal = true; ok = true;
    } catch (e) { console.warn('[der-eisendrache] carved decal', m.name, e); }
    if (!ok) m.visible = false;   // no normal map to read (or its image is gone): nothing is closer to the game than a grey sheet
    done.set(m, ok); return ok;
  };
  scene.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) if (m && /decal_blood_footprints$/.test(m.name ?? '') && /_micro_/.test(m.map?.name ?? '_micro_')) m.visible = false; });   // (only while its colour image is the detail map: a rebuild with the real image shows again)
  scene.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) if (m && (done.has(m) ? done.get(m) : !m.map && m.opacity > 0 && /_carved$/.test(m.name ?? '') && carve(m))) { o.renderOrder = 2100; o.castShadow = false; } });
}

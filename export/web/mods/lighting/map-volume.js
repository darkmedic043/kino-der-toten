// Baked light volume for the BO3-port maps (The Giant, Der Eisendrache), made offline by .tools/bake-map-light.mjs:
// light.json + light.bin.gz in the map's folder. Three RGBA 3D textures over the playable area:
//   A  rgb lamp light with the power off (sqrt-encoded)   a  how much of the sun/moon reaches the cell
//   B  rgb extra lamp light with the power on              a  how much of the sky the cell sees
//      (`powerOff` of it shows before the power is on: the rooms must stay readable)
//   C  rgb dominant lamp direction
// Every lit material is patched: the scene's ambient + hemisphere are scaled by the sky value (down to `skyFloor` times
// the `indoor` tint, the bounce light left indoors: warmer than the sky), its directional lights by the sun value, and the lamp light is added. The map keeps
// tuning its own lights (colour, level, power); the volume only says where they reach. Outside the volume nothing
// changes. Lamps therefore light their rooms from any distance: the map's point lights become a few accents.
//
//   const light = await loadMapLight(api, { skyFloor, indoor, sunFloor, strength, powerOff });   // null without a bake (or ?noBake)
//   light.at(pos) -> { sky, sun, lamp } (CPU lookup: the viewmodel light)
import * as THREE from 'three';

// (the chunk is read at compile time: the lighting mod adds its light clamp to it when it loads)
const DIR_INFO = 'getDirectionalLightInfo( directionalLight, directLight );';

export async function loadMapLight({ scene, world, session, host }, { skyFloor = .3, indoor = [1.1, .98, .84], sunFloor = .12, strength = 1, powerOff = .3, knee = 0, dir = world?.entry?.dir } = {}) {
  if (!dir || /[?&]noBake\b/.test(location.search) || !THREE.ShaderChunk.lights_fragment_begin.includes(DIR_INFO)) return null;
  const base = new URL(dir.replace(/\/?$/, '/'), document.baseURI);
  const meta = await fetch(new URL('light.json', base)).then(r => r.ok ? r.json() : null).catch(() => null); if (!meta) return null;
  const res = await fetch(new URL('light.bin.gz', base)).catch(() => null); if (!res?.ok) return null;
  const bin = new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  // up to two play areas, packed side by side along x in one atlas (region.x = its first column)
  const regions = (meta.regions ?? [{ origin: meta.origin, dims: meta.dims, x: 0 }]).slice(0, 2), [X, Y, Z] = meta.atlas ?? meta.dims, n = X * Y * Z; if (bin.length < n * 12) return null;
  const tex = k => { const t = new THREE.Data3DTexture(bin.subarray(k * n * 4, (k + 1) * n * 4), X, Y, Z); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.minFilter = t.magFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true; return t; };
  const uniforms = { mvA: { value: tex(0) }, mvB: { value: tex(1) }, mvC: { value: tex(2) },
    mvOrg: { value: [0, 1].map(k => regions[k] ? new THREE.Vector3(...regions[k].origin).addScalar(-meta.cell / 2) : new THREE.Vector3()) },   // texel centres sit on the cell positions
    mvDim: { value: [0, 1].map(k => regions[k] ? new THREE.Vector4(...regions[k].dims, regions[k].x) : new THREE.Vector4(-1, -1, -1, 0)) },
    mvInv: { value: new THREE.Vector3(1 / X, 1 / Y, 1 / Z) }, mvCell: { value: meta.cell }, mvScale: { value: meta.scale },
    mvPower: { value: session.power ? 1 : powerOff }, mvStrength: { value: strength }, mvIndoor: { value: new THREE.Vector3(...indoor).multiplyScalar(skyFloor) }, mvSunFloor: { value: sunFloor }, mvKnee: { value: knee } };

  function patch(m) {
    if (m.userData.mapLight || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return false;
    m.userData.mapLight = true;
    // (three's default key is the patch function's source: read it from the earlier patch now, or every material would
    // answer with this function's text and two materials with different earlier patches would share one program)
    const prev = m.onBeforeCompile, ownKey = Object.hasOwn(m, 'customProgramCacheKey') ? m.customProgramCacheKey.bind(m) : null, prevSrc = String(prev ?? '');
    m.onBeforeCompile = (shader, renderer) => {
      prev?.call(m, shader, renderer);
      if (!shader.fragmentShader.includes('#include <lights_fragment_begin>')) return;
      Object.assign(shader.uniforms, uniforms);
      // world position as three's worldpos_vertex computes it (batched and instanced props carry their placement)
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMapLightPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n{vec4 lp=vec4(transformed,1.);\n#ifdef USE_BATCHING\nlp=batchingMatrix*lp;\n#endif\n#ifdef USE_INSTANCING\nlp=instanceMatrix*lp;\n#endif\nvMapLightPos=(modelMatrix*lp).xyz;}');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vMapLightPos;uniform highp sampler3D mvA,mvB,mvC;uniform vec3 mvOrg[2],mvInv,mvIndoor;uniform vec4 mvDim[2];uniform float mvCell,mvScale,mvPower,mvStrength,mvSunFloor,mvKnee;`)
        .replace('#include <lights_fragment_begin>', `float mvSun=1.;vec3 mvSky=vec3(1.),mvLamp=vec3(0.),mvDir=vec3(0.,1.,0.);vec3 mvN=inverseTransformDirection(normal,viewMatrix);
        {vec3 mvP=vMapLightPos+mvN*mvCell*.45;   // nudged off the surface: a wall samples the room it faces, not its own inside
         // Straight-line code on purpose (2026-11-12): the first version looped over the two regions with texture() inside
         // an if and a break, in every lit program; D3D11's shader compiler is slow on exactly that, and warm-ups on
         // Windows went from 8-28 s to about 2 minutes. Region 0 wins where both hold the point, as the loop did.
         vec3 lc0=(mvP-mvOrg[0])/mvCell,lc1=(mvP-mvOrg[1])/mvCell;
         vec3 s0=step(vec3(0.),lc0)*step(lc0,mvDim[0].xyz),s1=step(vec3(0.),lc1)*step(lc1,mvDim[1].xyz);
         float w0=s0.x*s0.y*s0.z,mvIn=w0+(1.-w0)*s1.x*s1.y*s1.z;
         vec3 lc=mix(lc1,lc0,w0);vec4 dm=mix(mvDim[1],mvDim[0],w0);
         vec3 uvw=(clamp(lc,vec3(.5),max(dm.xyz-.5,vec3(.5)))+vec3(dm.w,0.,0.))*mvInv;
         vec4 a=textureLod(mvA,uvw,0.),b=textureLod(mvB,uvw,0.);vec3 c=textureLod(mvC,uvw,0.).rgb*2.-1.;
         mvSun=mix(1.,mix(mvSunFloor,1.,a.a),mvIn);mvSky=mix(vec3(1.),mix(mvIndoor,vec3(1.),b.a),mvIn);
         mvLamp=(a.rgb*a.rgb+b.rgb*b.rgb*mvPower)*mvScale*mvIn;mvDir=normalize(mix(vec3(0.,1.,0.),c,mvIn));}
        ` + THREE.ShaderChunk.lights_fragment_begin.replace(DIR_INFO, DIR_INFO + ' directLight.color *= mvSun;'))
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
          // soft knee (opts.knee): a lamp's light levels off towards 1/knee instead of burning pale surfaces white next to it
          mvLamp/=1.+max(mvLamp.r,max(mvLamp.g,mvLamp.b))*mvKnee;
          irradiance*=mvSky;irradiance+=mvLamp*mix(.45,1.,max(dot(mvN,mvDir),0.))*mvStrength;
        #endif`);
    };
    m.customProgramCacheKey = () => (ownKey ? ownKey() : prevSrc) + '|maplight';
    m.needsUpdate = true; return true;
  }
  // every lit material in the world scene, now (before the shader warm-up) and as things appear (zombies, drops, players)
  const seen = new WeakSet();
  const sweep = () => { let k = 0; scene.traverse(o => { if (!(o.isMesh || o.isPoints || o.isLine) || seen.has(o)) return; seen.add(o); for (const m of [o.material].flat()) if (m && patch(m)) k++; }); return k; };
  sweep();
  let timer = 0, last = performance.now();
  host.on('warm', () => sweep());
  host.on('update', () => { const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    uniforms.mvPower.value += ((session.power ? 1 : powerOff) - uniforms.mvPower.value) * Math.min(1, dt * 1.5);
    if ((timer -= dt) <= 0) { timer = 1; sweep(); } });

  // CPU lookup, nearest cell: { sky, sun } as the factors the shader applies, lamp = the lamp light there
  // (valid: 255 open cell, 128 a wall cell filled from its neighbours, 0 solid or outside the bake)
  const dec = v => (v / 255) ** 2 * meta.scale, lamp = new THREE.Color(), out = { sky: 1, sun: 1, lamp, valid: 0 };
  const at = p => {
    out.sky = out.sun = 1; out.valid = 0; lamp.setRGB(0, 0, 0);
    const R = regions.find(r => [p.x, p.y, p.z].every((v, k) => { const c = Math.round((v - r.origin[k]) / meta.cell); return c >= 0 && c < r.dims[k]; })); if (!R) return out;
    const x = Math.round((p.x - R.origin[0]) / meta.cell) + R.x, y = Math.round((p.y - R.origin[1]) / meta.cell), z = Math.round((p.z - R.origin[2]) / meta.cell);
    const i = ((z * Y + y) * X + x) * 4, j = n * 4 + i, pw = uniforms.mvPower.value, s = uniforms.mvStrength.value * .75;
    out.sun = uniforms.mvSunFloor.value + (1 - uniforms.mvSunFloor.value) * bin[i + 3] / 255; { const f = uniforms.mvIndoor.value, fl = (f.x + f.y + f.z) / 3; out.sky = fl + (1 - fl) * bin[j + 3] / 255; }
    out.valid = bin[n * 8 + i + 3]; lamp.setRGB(dec(bin[i]) + dec(bin[j]) * pw, dec(bin[i + 1]) + dec(bin[j + 1]) * pw, dec(bin[i + 2]) + dec(bin[j + 2]) * pw);
    lamp.multiplyScalar(s / (1 + Math.max(lamp.r, lamp.g, lamp.b) * uniforms.mvKnee.value)); return out;   // (the shader's knee)
  };
  const light = { meta, uniforms, at, patch, sweep };
  if (window.kino) window.kino.mapLight = light;
  return light;
}

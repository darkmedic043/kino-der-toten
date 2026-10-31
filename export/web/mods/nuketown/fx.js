// Nuketown's shader effects, all GPU-driven (only uniforms change in play, nothing is uploaded or rebuilt) and all in the scene
// from setup on, so the engine's warm-up compiles them with the map:
//   - portals: the map's wc/blue_element splats are an unlit blend in the original (`wc_unlit_blend`), and each one gets a swirl
//     drawn over it on the surface's own plane (the fitted plane of its triangles)
//   - geysers on the water spouts: a column, spray particles and a foam ring, driven by a power level (idle, building, full)
//   - fire tornadoes: the same column in fire colours, walking the original's struct chains (mods/nuketown/extras.js)
//   - the electric trap's sheet of sparks over the water
import * as THREE from 'three';

const NOISE = `
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*noise(p);p=mat2(.8,.6,-.6,.8)*p*2.03+7.1;a*=.5;}return s;}`;
const PLAIN_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
const clock = { value: 0 };   // every effect's time

const VORTEX_FS = `uniform float time;varying vec2 vUv;${NOISE}
  void main(){
    vec2 p=vUv*2.-1.;float r=length(p);if(r>1.)discard;
    float a=atan(p.y,p.x),spin=a+2.4/(r+.28)-time*1.1;
    float n=fbm(vec2(cos(spin),sin(spin))*1.6+vec2(r*2.2-time*.4,time*.1));
    float arms=.5+.5*sin(spin*3.+n*6.);
    float edge=smoothstep(1.,.62,r),core=exp(-r*r*7.);
    float rim=smoothstep(.55,.9,r)*smoothstep(1.,.88,r)*(.5+.5*sin(a*5.+time*2.+n*4.));
    float i=edge*(.12+1.1*arms*n)+core*.8+rim*.5;
    vec3 c=mix(vec3(.02,.1,.42),vec3(.16,.72,1.),clamp(i,0.,1.))*i*.75+vec3(.8,.95,1.)*core*core*.3;
    gl_FragColor=vec4(c,1.);
  }`;

// blue_element is a splat decal all over hell: drawn as the original's unlit blend, through its alpha (2026-10-30, user: as
// solid sheets it drew hard-edged slabs round Jugg and on the walls). Round each swirl it fades into an opaque core with the
// veins moving, so the world doesn't show through the portal; the alpha holds the splat, the RGB is white outside it
const SURFACE_VS = `varying vec2 vUv;varying vec3 vP;
  void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const SURFACE_FS = `uniform float time;uniform sampler2D map;uniform vec4 spots[3];varying vec2 vUv;varying vec3 vP;
  void main(){
    vec4 t=texture2D(map,vUv);
    float core=0.,splat=t.a;
    for(int i=0;i<3;i++)if(spots[i].w>0.){float d=distance(vP,spots[i].xyz)/spots[i].w;core=max(core,smoothstep(.95,.6,d));splat*=smoothstep(.9,1.3,d);}   // no hard edge on the portal's polygon
    float alpha=max(splat,core);if(alpha<.01)discard;
    float a=texture2D(map,vUv+vec2(0.,time*.03)).a,b=texture2D(map,vUv*.7-vec2(time*.02,0.)).a,v=clamp(a*.75+b*.55,0.,1.);
    gl_FragColor=vec4(mix(t.rgb*vec3(.3,.62,.95),mix(vec3(.006,.02,.09),vec3(.14,.42,.85),v*v),core),alpha);
  }`;

// the triangles of `meshes` within `reach` of each spot, as a plane: centre, normal and half size
function fitPlanes(meshes, spots, reach = 130) {
  const groups = spots.map(() => ({ tris: [] }));
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index, n = idx ? idx.count : pos.count;
    const at = i => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
    for (let i = 0; i + 2 < n; i += 3) {
      const a = at(i), b = at(i + 1), c = at(i + 2), mid = a.clone().add(b).add(c).divideScalar(3);
      spots.forEach((s, k) => { if (s.distanceTo(mid) < reach) groups[k].tris.push([a, b, c, mid]); });
    }
  }
  return groups.filter(g => g.tris.length).map(g => {
    const centre = new THREE.Vector3(), normal = new THREE.Vector3(); let area = 0;
    for (const [a, b, c, mid] of g.tris) {
      const cross = b.clone().sub(a).cross(c.clone().sub(a)), w = cross.length() / 2; if (!w) continue;
      if (normal.dot(cross) < 0) cross.negate();
      normal.add(cross); centre.addScaledVector(mid, w); area += w;
    }
    centre.divideScalar(area || 1); normal.normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(normal); if (u.lengthSq() < 1e-4) u.set(1, 0, 0); u.normalize();
    const v = normal.clone().cross(u);
    let half = 0; for (const t of g.tris) for (const p of t.slice(0, 3)) { const d = p.clone().sub(centre); half = Math.max(half, Math.abs(d.dot(u)), Math.abs(d.dot(v))); }
    return { centre, normal, half };
  });
}

export function setupPortalFx(api, spots) {
  const { world, scene } = api;
  const meshes = [];
  world.root.traverse(o => {
    if (!o.isMesh) return; const name = o.material?.name ?? '';
    if (/blue_element$/.test(name)) meshes.push(o);   // split by world tile
    else if (/mpl_chalk$/.test(name)) Object.assign(o.material, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });   // additive in the original, opaque in the glb
  });
  if (!meshes.length) { console.warn('[nuketown] no portal surface'); return; }
  for (const m of meshes) m.updateWorldMatrix(true, false);
  const planes = fitPlanes(meshes, spots), old = meshes[0].material;
  const core = [0, 1, 2].map(i => { const q = planes[i]; return q ? new THREE.Vector4(q.centre.x, q.centre.y, q.centre.z, q.half) : new THREE.Vector4(); });
  const glow = new THREE.ShaderMaterial({ name: old.name, vertexShader: SURFACE_VS, fragmentShader: SURFACE_FS, uniforms: { time: clock, map: { value: old.map }, spots: { value: core } }, side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  for (const m of meshes) { m.material = glow; m.renderOrder = -2; }   // before the map's decals, whose orders run past 2000: behind the portal they painted over it in shards
  const mat = new THREE.ShaderMaterial({ vertexShader: PLAIN_VS, fragmentShader: VORTEX_FS, uniforms: { time: clock }, ...additive, depthWrite: true });   // keeps those decals out, things in front still draw
  for (const p of planes) {
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(p.half * 2.1, p.half * 2.1), mat);
    disc.position.copy(p.centre); disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.normal); disc.renderOrder = -1;
    scene.add(disc); disc.updateMatrix(); disc.updateMatrixWorld(true);
  }
  return planes;
}

const COLUMN_VS = `uniform float time,height,radius,flare,wobble;varying vec2 vUv;varying float vY,vFacing;${NOISE}
  void main(){
    vUv=uv;vY=position.y;vFacing=abs(normalize(normalMatrix*normal).z);
    float y=position.y,w=1.+flare*y*y+.28*sin(y*7.-time*9.+uv.x*6.283)*wobble;
    vec3 p=vec3(position.x*radius*w,y*height,position.z*radius*w);
    p.xz+=vec2(sin(y*4.+time*3.),cos(y*3.-time*2.3))*wobble*radius*.18*y;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }`;
const COLUMN_FS = `uniform float time,alpha,rate,height;uniform vec3 deep,bright;varying vec2 vUv;varying float vY,vFacing;${NOISE}
  void main(){
    float streak=fbm(vec2(vUv.x*22.,vUv.y*height*.012-time*rate));
    float body=smoothstep(.36,.7,streak),tip=smoothstep(1.,.72,vY),foot=smoothstep(0.,.06,vY);
    float a=alpha*body*tip*foot*(1.-.75*vFacing);if(a<.01)discard;   // thin where it faces the camera, like a falling sheet
    gl_FragColor=vec4(mix(deep,bright,smoothstep(.45,.8,streak))*(.75+.5*body),a);
  }`;
const SPRAY_VS = `uniform float time,power,height,px;attribute vec4 seed;varying float vT;
  void main(){
    float t=fract(time*(.55+seed.x*.5)+seed.y);vT=t;
    float h=height*power*(.5+.6*seed.z),g=4.*h;   // up and back down: y = h - g(t-.5)^2
    float out_=(10.+70.*seed.w*power)*t;
    vec3 p=vec3(cos(seed.y*97.)*out_,max(0.,h-g*(t-.5)*(t-.5)),sin(seed.y*97.)*out_);
    vec4 mv=modelViewMatrix*vec4(p,1.);
    gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp((2.+5.*seed.x)*(1.+t)*px/-mv.z,1.,20.);
  }`;
const SPRAY_FS = `uniform float alpha;varying float vT;
  void main(){
    float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
    gl_FragColor=vec4(.3,.38,.45,alpha*(1.-r*r)*(1.-vT*vT));
  }`;
const FOAM_FS = `uniform float time,alpha;varying vec2 vUv;${NOISE}
  void main(){
    vec2 p=vUv*2.-1.;float r=length(p);if(r>1.)discard;
    float a=atan(p.y,p.x),ripple=.5+.5*sin(r*26.-time*6.+fbm(p*3.)*5.);
    float foam=smoothstep(.34,.72,fbm(vec2(a*2.,r*5.-time*1.2)+p*2.))*(.45+.55*ripple);
    float k=alpha*foam*smoothstep(1.,.35,r);if(k<.01)discard;
    gl_FragColor=vec4(.2,.26,.32,k);
  }`;
const normal = { transparent: true, depthWrite: false, side: THREE.DoubleSide };
const column = (uniforms, segments = 28, rows = 16) => new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, segments, rows, true).translate(0, .5, 0),
  new THREE.ShaderMaterial({ vertexShader: COLUMN_VS, fragmentShader: COLUMN_FS, uniforms: { time: clock, ...uniforms }, ...normal }));
const u = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

// a geyser at `at`, reaching `top`. power 0 idle, .35 building up, 1 full
export function makeGeyser(api, at, top, radius) {
  const { scene, renderer } = api;
  const reach = top - at.y, group = new THREE.Group(); group.position.copy(at);
  const shared = { deep: { value: new THREE.Color(.05, .11, .18) }, bright: { value: new THREE.Color(.24, .34, .42) } };
  const outer = column({ ...u({ height: 40, radius, flare: .35, wobble: 1, alpha: .5, rate: 2.2 }), ...shared });
  const inner = column({ ...u({ height: 40, radius: radius * .55, flare: .15, wobble: .6, alpha: .8, rate: 3.4 }), ...shared });
  const COUNT = 260, seeds = new Float32Array(COUNT * 4).map(() => Math.random());
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  sprayGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const sprayU = { time: clock, ...u({ power: .2, height: reach * 1.05, px: 400, alpha: .4 }) };
  const spray = new THREE.Points(sprayGeo, new THREE.ShaderMaterial({ vertexShader: SPRAY_VS, fragmentShader: SPRAY_FS, uniforms: sprayU, ...normal }));
  const foamU = { time: clock, ...u({ alpha: .4 }) };
  const foam = new THREE.Mesh(new THREE.CircleGeometry(radius * 2.6, 32).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: PLAIN_VS, fragmentShader: FOAM_FS, uniforms: foamU, ...normal }));
  foam.position.y = 1.5;
  for (const o of [outer, inner, spray, foam]) { o.frustumCulled = false; o.renderOrder = 1500; group.add(o); }
  scene.add(group); group.updateMatrixWorld(true);
  let level = 0, target = 0, pulse = 0;
  const size = new THREE.Vector2();
  return {
    group,
    set(p) { target = p; },
    tick(dt) {
      level += (target - level) * Math.min(1, dt * (target > level ? 5 : 2));
      pulse += dt; const idle = .13 + .05 * Math.sin(pulse * 1.7) + .03 * Math.sin(pulse * 4.3), k = Math.max(idle, level);
      const h = reach * k;
      outer.material.uniforms.height.value = h * 1.02; inner.material.uniforms.height.value = h * 1.15;
      outer.material.uniforms.radius.value = radius * (.35 + .65 * k); inner.material.uniforms.radius.value = radius * (.2 + .35 * k);
      outer.material.uniforms.alpha.value = .3 + .3 * k; sprayU.power.value = k; sprayU.px.value = renderer.getDrawingBufferSize(size).y;
      foamU.alpha.value = .3 + .35 * k;
    },
  };
}

// a fire tornado: a tall funnel in fire colours, additive
export function makeTornado(api, height = 420) {
  const { scene } = api, group = new THREE.Group();
  const fire = { deep: { value: new THREE.Color(.5, .07, .01) }, bright: { value: new THREE.Color(1., .34, .04) } };
  for (const [radius, flare, alpha, rate] of [[46, 2.6, .75, 1.6], [26, 2.2, .9, 2.6]]) {
    const m = column({ ...u({ height, radius, flare, wobble: 1.4, alpha, rate }), ...fire }, 56, 56);
    m.frustumCulled = false; group.add(m);   // not additive: over the bright sky that washes out to white
  }
  scene.add(group); return group;
}

const SPARK_FS = `uniform float time,alpha;varying vec2 vUv;${NOISE}
  void main(){
    float n=fbm(vUv*vec2(9.,14.)+vec2(0.,time*3.)),line=abs(n-.5+.12*sin(time*40.+vUv.y*30.));
    float arc=smoothstep(.022,.0,line)+.35*smoothstep(.09,.0,line);
    float k=alpha*arc*(.55+.45*noise(vec2(time*24.,vUv.x*5.)));
    gl_FragColor=vec4(vec3(.38,.68,1.4)*k+vec3(1.)*k*k*.6,1.);
  }`;
// the sheet of arcs over the trap's water: alpha 0 draws nothing
export function makeSparkSheet(api, [lo, hi], y) {
  const uniforms = { time: clock, alpha: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(hi[0] - lo[0], hi[2] - lo[2]).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: PLAIN_VS, fragmentShader: SPARK_FS, uniforms, ...additive }));
  m.position.set((lo[0] + hi[0]) / 2, y, (lo[2] + hi[2]) / 2); m.renderOrder = 1500; m.frustumCulled = false;
  api.scene.add(m); m.updateMatrixWorld(true);
  return uniforms.alpha;
}

export const fxTick = dt => { clock.value += dt; if (clock.value > 3600) clock.value -= 3600; };

// a looping map sound that fades with distance to the nearest of its spots; plays only while in range
export function spotLoop(api, name, range, gain) {
  const base = (api.map?.dir ?? '').replace(/\/?$/, '/') + 'sounds/';
  let a = null, g = null;
  const stop = () => { try { a?.pause(); } catch {} a = g = null; };
  return {
    stop,
    tick(p, spots, on = true) {
      let d = Infinity; if (on) for (const s of spots) d = Math.min(d, s.distanceTo(p));
      if (d > range) { if (a) stop(); return; }
      if (!a) {
        a = new Audio(base + name + '.ogg'); a.loop = true;
        try {
          const ctx = api.audio?.ctx, master = api.audio?.master;
          if (ctx && master) { g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(a).connect(g).connect(master); } else a.volume = 0;
        } catch { g = null; }
        a.play().catch(() => {});
      }
      const v = gain * (1 - d / range) ** 2;
      if (g) g.gain.value = v; else a.volume = Math.min(1, v * .42);
    },
  };
}

// The Pilot class's mech, built in code (no game assets): a Titanfall-style chassis about twice a player's height:
// armoured hull with a cockpit hatch and visor, pauldrons, digitigrade legs, a reactor pack on the back and, with
// the Rear Hardpoint passive, a gunner's machine gun on top of it. Each arm ends in a swappable weapon. Faces +Z,
// stands on y=0. Also the first-person cockpit arms (mechArms), which share the weapon builders.
//   createMech({mount}) -> {root, setWeapons(left, right), setMount(on), update(dt, pose), recoil(arm, k), muzzle(arm)}
//   mechArms()          -> {root, setWeapons(left, right), update(dt, pose), recoil(arm, k), muzzle(arm)}
// pose: {speed (units/s), pitch (rad), spin: {left, right} (0..1 chaingun spin), charge: {left, right} (0..1),
// heat: {left, right}}.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// ---- the Marcy model (RainOnTheMoon, CC-BY-4.0; .tools/build_mech.sh, git-ignored) -----------------------------------
// When it's there, createMech/mechArms use it, animated in code: its bones are turned each frame (walk, aim, recoil),
// the loadout's weapons sit on its cut forearm stumps, and the pilot sits in the opened cockpit. Without it, the
// procedural chassis below.
const MECH_URL=new URL('models/mech.glb',import.meta.url).href;
const SCALE=130;          // model units (the mesh is ~1.35 tall with its fins) to game units: about 1.8 players tall (175 was too tall)
const PILOT_SCALE=SCALE/175;   // the cockpit was fitted at 175: the seated operator shrinks with the mech
const STUMP=.17;          // forearm left past the elbow by the build (model units)
let mechGltf=null,mechLoad=null;
export function loadMechModel(){mechLoad??=new GLTFLoader().loadAsync(MECH_URL).then(g=>{mechGltf=g;return g;}).catch(()=>null);return mechLoad;}
export const mechModelReady=()=>!!mechGltf;

// ---- materials ---------------------------------------------------------------------------------------------------
let mats=null;
function panelTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  g.fillStyle='#7b8063';g.fillRect(0,0,256,256);
  // grime and panel seams
  for(let i=0;i<900;i++){g.fillStyle=`rgba(${20+Math.random()*30},${20+Math.random()*30},${15},${Math.random()*.08})`;g.fillRect(Math.random()*256,Math.random()*256,2+Math.random()*10,1+Math.random()*4);}
  g.strokeStyle='#2c2f26';g.lineWidth=2;
  for(const [x,y,w,h] of [[8,8,112,72],[136,8,112,72],[8,96,240,56],[8,168,72,80],[96,168,152,80]])g.strokeRect(x,y,w,h);
  g.fillStyle='#3a3d33';for(const [x,y] of [[14,14],[114,14],[142,14],[242,14],[14,74],[242,74],[14,102],[242,146]]){g.beginPath();g.arc(x,y,2.2,0,7);g.fill();}
  // hazard stripes and a stencil
  g.save();g.beginPath();g.rect(96,176,152,22);g.clip();for(let x=80;x<260;x+=18){g.fillStyle='#d9772e';g.beginPath();g.moveTo(x,176);g.lineTo(x+9,176);g.lineTo(x-3,198);g.lineTo(x-12,198);g.fill();}g.restore();
  g.fillStyle='#e8e2cf';g.font='bold 26px Arial Narrow, Arial, sans-serif';g.fillText('KD-07',150,232);
  g.fillStyle='#d9772e';g.fillRect(8,120,240,6);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function materials(){
  if(mats)return mats;
  const panel=panelTexture();
  mats={
    hull:new THREE.MeshStandardMaterial({color:0xffffff,map:panel,metalness:.45,roughness:.62}),
    plate:new THREE.MeshStandardMaterial({color:0x4f5840,metalness:.55,roughness:.55}),
    paint:new THREE.MeshStandardMaterial({color:0x9a5a2e,metalness:.35,roughness:.65}),   // rust, to sit with the Marcy model
    dark:new THREE.MeshStandardMaterial({color:0x22252a,metalness:.7,roughness:.45}),
    steel:new THREE.MeshStandardMaterial({color:0x8c9196,metalness:.85,roughness:.32}),
    visor:new THREE.MeshStandardMaterial({color:0x0b1a20,emissive:0x5fe0ff,emissiveIntensity:1.6,metalness:.2,roughness:.2}),
    glowBlue:new THREE.MeshStandardMaterial({color:0x103040,emissive:0x58c8ff,emissiveIntensity:2.2}),
    glowOrange:new THREE.MeshStandardMaterial({color:0x301808,emissive:0xff8a2a,emissiveIntensity:2}),
    tube:new THREE.MeshStandardMaterial({color:0x0c0d0f,metalness:.4,roughness:.8}),
  };
  return mats;
}
const box=(w,h,d,m,r=Math.min(w,h,d)*.18)=>new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.max(.2,r)),m);
const cyl=(r1,r2,h,m,seg=14)=>new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg),m);
const at=(o,x,y,z,rx=0,ry=0,rz=0)=>{o.position.set(x,y,z);o.rotation.set(rx,ry,rz);return o;};
const group=(name,...kids)=>{const g=new THREE.Group();g.name=name;kids.forEach(k=>g.add(k));return g;};

// The hull: a chamfered octagon (front view) extruded front to back, bevelled.
function hullGeometry(w,h,d){
  const s=new THREE.Shape(),cx=w/2,cy=h/2,c=w*.18;
  s.moveTo(-cx+c,-cy);s.lineTo(cx-c,-cy);s.lineTo(cx,-cy+c*.8);s.lineTo(cx,cy-c*1.4);s.lineTo(cx-c*1.2,cy);s.lineTo(-cx+c*1.2,cy);s.lineTo(-cx,cy-c*1.4);s.lineTo(-cx,-cy+c*.8);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelThickness:2.2,bevelSize:2.2,bevelSegments:2});
  g.translate(0,0,-d/2);
  // box-project UVs so the panel texture lands on the faces
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
    if(az>=ax&&az>=ay)uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);else if(ax>=ay)uv.setXY(i,p.getZ(i)/d+.5,p.getY(i)/h+.5);else uv.setXY(i,p.getX(i)/w+.5,p.getZ(i)/d+.5);}
  return g;
}

// ---- weapons: each points down +Z from its mount, with a `muzzle` node at the tip -----------------------------------
export const WEAPON_BUILDERS={
  chaingun(){
    const M=materials(),g=group('chaingun');
    g.add(at(box(15,15,18,M.plate),0,0,6),at(box(16,4,14,M.paint,1),0,8.5,6),at(cyl(6.5,6.5,6,M.dark),0,0,17,Math.PI/2));
    const spin=group('spin');for(let i=0;i<6;i++){const a=i/6*Math.PI*2,b=cyl(1.5,1.5,30,M.steel,8);at(b,Math.cos(a)*4,Math.sin(a)*4,15,Math.PI/2);spin.add(b);}
    spin.add(at(cyl(6,6,2.5,M.dark),0,0,28,Math.PI/2),at(cyl(6,6,2.5,M.dark),0,0,12,Math.PI/2));spin.position.z=17;g.add(spin);
    g.add(at(box(6,9,10,M.dark),-9,-3,4));   // ammo feed
    g.add(at(new THREE.Object3D(),0,0,49));g.children.at(-1).name='muzzle';return g;
  },
  rail(){
    const M=materials(),g=group('rail');
    g.add(at(box(15,16,20,M.plate),0,0,6),at(box(3,6,52,M.steel,1),-4.5,0,36),at(box(3,6,52,M.steel,1),4.5,0,36),at(box(16,3,30,M.dark,1),0,-6,22));
    const glow=group('glow');for(const z of [22,34,46]){const r=new THREE.Mesh(new THREE.TorusGeometry(6.2,1.1,8,18),M.glowBlue.clone());r.position.z=z;glow.add(r);}g.add(glow);
    g.add(at(new THREE.Object3D(),0,0,63));g.children.at(-1).name='muzzle';return g;
  },
  salvo(){
    const M=materials(),g=group('salvo');
    g.add(at(box(22,22,26,M.plate,2.5),0,0,10),at(box(23,5,20,M.paint,1.5),0,11,8));
    for(const [x,y] of [[-5.5,-5],[5.5,-5],[-5.5,5],[5.5,5]])g.add(at(cyl(3.6,3.6,4,M.tube,12),x,y,22.2,Math.PI/2),at(cyl(4.4,4.4,2,M.dark,12),x,y,23.4,Math.PI/2));
    g.add(at(new THREE.Object3D(),0,0,25));g.children.at(-1).name='muzzle';return g;
  },
  thermite(){
    const M=materials(),g=group('thermite');
    g.add(at(box(16,16,16,M.plate),0,0,4),at(cyl(8,8.5,26,M.dark,16),0,1,22,Math.PI/2),at(cyl(9,9,3,M.paint,16),0,1,33,Math.PI/2));
    const ring=new THREE.Mesh(new THREE.TorusGeometry(6,1,8,18),M.glowOrange);ring.position.set(0,1,35.5);ring.name='glow';g.add(ring);
    g.add(at(cyl(7,7,10,M.dark,14),0,-10,8,0,0,Math.PI/2));   // drum
    g.add(at(new THREE.Object3D(),0,1,37));g.children.at(-1).name='muzzle';return g;
  },
  fist(){
    const M=materials(),g=group('fist'),hand=group('hand');
    hand.add(at(box(20,12,16,M.plate,2),0,0,6),at(box(21,6,10,M.paint,1.5),0,6.5,4));
    for(let i=0;i<4;i++){const x=-7.5+i*5;hand.add(at(box(4.4,5,9,M.steel,1),x,1,17),at(box(4.2,4.6,7,M.steel,1),x,-2,22,-.9));}
    hand.add(at(box(5,5,10,M.steel,1),-11.5,-2,9,0,.5,0));
    hand.add(at(box(22,7,4,M.dark,1),0,3,21));   // knuckle guard
    hand.add(at(cyl(2.4,2.4,16,M.steel,10),0,0,-4,Math.PI/2));   // piston
    g.add(hand);g.add(at(new THREE.Object3D(),0,0,26));g.children.at(-1).name='muzzle';return g;
  },
  arc(){
    const M=materials(),g=group('arc');
    g.add(at(box(16,16,20,M.plate),0,0,6),at(cyl(5,7,10,M.dark,12),0,0,20,Math.PI/2));
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2+Math.PI/2,p=box(2.6,2.6,20,M.steel,.8);at(p,Math.cos(a)*6,Math.sin(a)*6,30,-Math.sin(a)*.25,Math.cos(a)*.25,0);g.add(p);}
    const core=new THREE.Mesh(new THREE.SphereGeometry(4,16,12),M.glowBlue.clone());core.position.z=27;core.name='glow';g.add(core);
    g.add(at(new THREE.Object3D(),0,0,36));g.children.at(-1).name='muzzle';return g;
  },
  mg(){   // the rear gunner's machine gun
    const M=materials(),g=group('mg');
    g.add(at(box(7,8,22,M.dark,1),0,0,4),at(cyl(1.6,1.6,26,M.steel,8),0,1,26,Math.PI/2),at(box(4,10,6,M.dark,1),0,-8,0),at(box(14,9,2,M.plate,1),0,4,10));
    g.add(at(new THREE.Object3D(),0,1,40));g.children.at(-1).name='muzzle';return g;
  },
};
export const weaponFor=id=>weapon(id);
const weapon=id=>(mechGltf&&KIT_WEAPONS[id]?KIT_WEAPONS[id]:WEAPON_BUILDERS[id]??WEAPON_BUILDERS.chaingun)();

// ---- the mech ----------------------------------------------------------------------------------------------------
export function createMech(opts={}){return mechGltf?marcyMech(opts):proceduralMech(opts);}
function proceduralMech({mount=false}={}){
  const M=materials(),root=group('mech');
  const hips=group('hips');hips.position.y=64;root.add(hips);
  hips.add(at(box(40,16,26,M.dark),0,0,0),at(box(34,9,22,M.plate),0,-6,2));
  const legs={};
  for(const [side,x] of [['left',1],['right',-1]]){
    const thigh=group('thigh_'+side);thigh.position.set(x*15,-4,0);hips.add(thigh);
    thigh.add(at(cyl(8.5,8.5,12,M.dark,12),0,0,0,0,0,Math.PI/2),at(box(19,36,21,M.plate,3.5),x*1,-18,2,.12),at(box(21,14,22,M.hull,3.5),x*1,-10,3,.12));
    const shin=group('shin_'+side);shin.position.set(x*1,-34,5);thigh.add(shin);
    shin.add(at(cyl(7.5,7.5,14,M.dark,12),0,0,0,0,0,Math.PI/2),at(box(17,36,19,M.plate,3.5),0,-16,-4,-.32),at(box(18,16,9,M.paint,2),0,-6,5,-.32),at(box(10,22,6,M.dark,2),0,-18,-14,-.32));
    const foot=group('foot_'+side);foot.position.set(0,-31,-10);shin.add(foot);
    foot.add(at(box(24,8,36,M.dark,3),0,-6,6),at(box(22,6,14,M.plate,2),0,-2,16,.2),at(box(18,6,11,M.plate,2),0,-4,-9));
    legs[side]={thigh,shin,foot};
  }
  // torso: turns with the aim; the hull, cockpit, pauldrons, reactor pack
  const torso=group('torso');torso.position.y=8;hips.add(torso);
  const hull=new THREE.Mesh(hullGeometry(54,44,34),M.hull);hull.position.set(0,26,0);torso.add(hull);
  torso.add(at(box(30,26,7,M.plate,2.5),0,30,19,-.18),at(box(23,3.2,2,M.visor,1),0,34,22.6,-.18),at(box(32,4,8,M.paint,1.5),0,45,17,-.3));   // hatch + visor
  torso.add(at(box(14,10,12,M.dark,2),0,52,4),at(box(8,2,2,M.visor,.6),0,53,10.2));   // sensor head
  for(const x of [1,-1])torso.add(at(box(10,22,30,M.plate,2.5),x*29,22,0),at(box(3,16,24,M.paint,1),x*34.5,22,0));   // side plates
  const pack=group('pack');pack.position.set(0,28,-21);torso.add(pack);
  pack.add(at(box(36,32,14,M.plate,3),0,0,-2));
  for(let i=0;i<5;i++)pack.add(at(box(28,2,3,M.dark,.6),0,-10+i*5,-9.5));
  pack.add(at(cyl(5,5,4,M.glowOrange,16),0,10,-9.5,Math.PI/2));
  // rear hardpoint: a post, the gun and a seat for a co-op gunner
  const hard=group('hardpoint');hard.position.set(0,18,-8);pack.add(hard);
  hard.add(at(cyl(2.2,2.2,12,M.dark,10),0,6,0),at(box(18,3,14,M.dark,1),0,-1,-10));   // seat
  const mg=weapon('mg');mg.position.set(0,14,2);hard.add(mg);hard.visible=mount;
  const arms={};
  for(const [side,x] of [['left',1],['right',-1]]){
    const pauldron=at(box(24,16,28,M.hull,3),x*39,48,0,0,0,x*-.18);torso.add(pauldron);
    torso.add(at(box(25,4,20,M.paint,1.5),x*40,56,0,0,0,x*-.18));
    const shoulder=group('shoulder_'+side);shoulder.position.set(x*38,40,0);torso.add(shoulder);
    shoulder.add(at(cyl(9,9,12,M.dark,14),0,0,0,0,0,Math.PI/2),at(box(17,36,17,M.plate,3),x*1,-20,0));
    const elbow=group('elbow_'+side);elbow.position.set(x*1,-38,0);shoulder.add(elbow);
    elbow.add(at(cyl(7.5,7.5,15,M.dark,12),0,0,0,0,0,Math.PI/2),at(box(20,20,32,M.plate,3),0,0,13),at(box(21,5,24,M.paint,1.5),0,10.5,11));
    const mountPt=group('weapon_'+side);mountPt.position.set(0,0,28);elbow.add(mountPt);
    arms[side]={shoulder,elbow,mount:mountPt,weapon:null,kick:0};
  }
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});

  let phase=0,bob=0;
  const api={root,arms,legs,torso,
    setWeapons(left,right){for(const [side,id] of [['left',left],['right',right]]){const a=arms[side];if(a.id===id)continue;a.weapon?.removeFromParent();a.weapon=weapon(id);a.id=id;a.weapon.traverse(o=>{if(o.isMesh)o.castShadow=true;});a.mount.add(a.weapon);}},
    setMount(on){hard.visible=on;},
    mountGun:mg,seat:hard,
    recoil(side,k=1){arms[side].kick=Math.min(1.5,arms[side].kick+k);},
    muzzle(side,out=new THREE.Vector3()){const m=arms[side].weapon?.getObjectByName('muzzle');root.updateMatrixWorld(true);return m?m.getWorldPosition(out):arms[side].mount.getWorldPosition(out);},
    update(dt,pose={}){
      const speed=pose.speed??0,stride=Math.min(1,speed/120);
      phase+=dt*(1.6+speed/55);bob+=dt;
      for(const [side,s] of [['left',0],['right',Math.PI]]){
        const L=legs[side],p=Math.sin(phase+s)*stride,lift=Math.max(0,Math.cos(phase+s))*stride;
        L.thigh.rotation.x=-p*.45-lift*.25;L.shin.rotation.x=lift*.7;L.foot.rotation.x=-L.thigh.rotation.x*.6-lift*.3;
      }
      hips.position.y=64-Math.abs(Math.sin(phase))*3*stride+Math.sin(bob*1.3)*.4*(1-stride);
      torso.rotation.z=Math.sin(phase)*.03*stride;torso.rotation.y=Math.sin(phase)*.05*stride;
      for(const [side,a] of Object.entries(arms)){
        a.kick=Math.max(0,a.kick-dt*8);
        const pitch=pose.pitch??0;a.shoulder.rotation.x=-.3+a.kick*.12;   // upper arm hangs a little forward; the forearm aims (+Z, tilted by the look pitch)
        a.elbow.rotation.x=.3-pitch*.9-a.kick*.05;a.elbow.position.z=-a.kick*2;
        const spin=a.weapon?.getObjectByName('spin');if(spin)spin.rotation.z+=dt*30*(pose.spin?.[side]??0);
        const glow=a.weapon?.getObjectByName('glow');if(glow)glow.traverse(o=>{if(o.material?.emissiveIntensity!=null)o.material.emissiveIntensity=1+(pose.charge?.[side]??0)*5;});
      }
    }};
  return api;
}

// ---- first person: the two forearms and their weapons in the viewmodel scene ----------------------------------------
export function mechArms(){
  const M=materials(),root=group('mech_arms'),arms={},stumps=mechGltf?{left:mechGltf.scene.getObjectByName('FP_ArmL'),right:mechGltf.scene.getObjectByName('FP_ArmR')}:null;
  for(const [side,x] of [['left',-1],['right',1]]){
    const pivot=group('fp_'+side);pivot.position.set(x*20,-17,-34);root.add(pivot);
    const fore=group('fore');pivot.add(fore);fore.rotation.set(.2,Math.PI+x*.12,0);   // weapons point down +Z: turn them to face away from the camera
    const stump=stumps?.[side];
    if(stump){const c=stump.clone();c.position.set(0,0,4-STUMP*SCALE*.62);c.scale.setScalar(SCALE*.62);c.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});fore.add(c);}   // the Marcy forearm stump, elbow first
    else fore.add(at(box(17,17,22,M.plate,3),0,0,-8),at(box(5,1.6,16,M.paint,.6),0,8.7,-7),at(box(12,12,10,M.dark,2),0,-1,-22));
    const mountPt=group('weapon');mountPt.position.z=4;fore.add(mountPt);
    pivot.scale.setScalar(.5);
    arms[side]={pivot,fore,mount:mountPt,weapon:null,kick:0,base:pivot.position.clone()};
  }
  let t=0;
  return {root,arms,
    setWeapons(left,right){for(const [side,id] of [['left',left],['right',right]]){const a=arms[side];if(a.id===id)continue;a.weapon?.removeFromParent();a.weapon=weapon(id);a.id=id;a.mount.add(a.weapon);}},
    recoil(side,k=1){arms[side].kick=Math.min(1.5,arms[side].kick+k);},
    update(dt,pose={}){
      t+=dt;const speed=pose.speed??0,stride=Math.min(1,speed/120);
      for(const [side,a] of Object.entries(arms)){
        a.kick=Math.max(0,a.kick-dt*9);const s=side==='left'?0:Math.PI;
        a.pivot.position.copy(a.base);a.pivot.position.y+=Math.abs(Math.sin(t*6+s))*-.9*stride+Math.sin(t*1.5)*.15;a.pivot.position.x+=Math.sin(t*3+s)*.4*stride;
        a.pivot.position.z+=a.kick*2.6;a.pivot.rotation.x=a.kick*.08;
        if(side==='left'?pose.punch?.left:pose.punch?.right){const p=side==='left'?pose.punch.left:pose.punch.right;a.pivot.position.z-=Math.sin(p*Math.PI)*12;}
        const spin=a.weapon?.getObjectByName('spin');if(spin)spin.rotation.z+=dt*30*(pose.spin?.[side]??0);
        const glow=a.weapon?.getObjectByName('glow');if(glow)glow.traverse(o=>{if(o.material?.emissiveIntensity!=null)o.material.emissiveIntensity=1+(pose.charge?.[side]??0)*5+(pose.heat?.[side]??0)*1.5;});
      }
    },
    muzzle(side,out=new THREE.Vector3()){const m=arms[side].weapon?.getObjectByName('muzzle');root.updateMatrixWorld(true);return m?m.getWorldPosition(out):arms[side].mount.getWorldPosition(out);}};
}

// ---- the Marcy mech, bones turned in code ------------------------------------------------------------------------
// Facing +Z, feet on y=0 (the build exports it so). Pose each frame: every driven bone back to its rest rotation, then
// turned about the mech's own axes (turn()): digitigrade walk (thigh, knee joint, shin, ankle kept level), the pelvis
// bobbing, the ribcage swaying, upper arms and forearms raised so the stumps aim along the look pitch, recoil. The
// weapons aren't children of the bones: each frame they're put at the stump's end, pointing along the aim.
function marcyMech({mount=false}={}){
  const root=group('mech'),model=cloneSkinned(mechGltf.scene);
  for(const o of [...model.children])if(/^(FP_Arm|KIT_)/.test(o.name))o.removeFromParent();   // first-person stumps and the weapon kit live in the same file
  model.scale.setScalar(SCALE);root.add(model);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  const B=n=>model.getObjectByName(n);
  const bones={pelvis:B('MechPelvis_01'),ribcage:B('MechRibcage_016'),engine:B('EngineHead_045'),
    flaps:[B('MechBoosterFlapL_049'),B('MechBoosterFlapR_047')],fins:[B('MechTopFinL2_053'),B('MechTopFinR2_051')]};
  const legs={left:{thigh:B('ThighL_02'),mid:B('MiddleLegL_03'),shin:B('ShinL_04'),ankle:B('AnkleL_00')},right:{thigh:B('ThighR_08'),mid:B('MiddleLegR_09'),shin:B('ShinR_010'),ankle:B('AnkleR_011')}};
  const arms={left:{upper:B('MechArmL1_018'),fore:B('MechArmL2_019'),palm:B('MechPalmL_020'),kick:0},
    right:{upper:B('MechArmR1_031'),fore:B('MechArmR2_032'),palm:B('MechPalmR_033'),kick:0}};
  const driven=[bones.pelvis,bones.ribcage,...bones.flaps,...bones.fins,...Object.values(legs).flatMap(l=>Object.values(l)),...Object.values(arms).flatMap(a=>[a.upper,a.fore])].filter(Boolean);
  const rest=new Map(driven.map(b=>[b,b.quaternion.clone()])),restModelY=model.position.y;
  root.updateMatrixWorld(true);
  const local=o=>root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  // each forearm's rest aim (elbow -> palm, mech space): its downward slope and outward yaw, taken out so the stump aims
  // straight ahead; the stump's end in the forearm bone's own frame (the weapon mount)
  for(const [side,a] of Object.entries(arms)){
    const e=local(a.fore),d=local(a.palm).sub(e).normalize();
    a.slope=Math.asin(-d.y);a.yaw=Math.atan2(d.x,d.z);
    a.end=a.fore.worldToLocal(root.localToWorld(e.clone().addScaledVector(d,STUMP*SCALE)));
    a.mount=group('weapon_'+side);root.add(a.mount);a.weapon=null;a.id=null;
  }
  const seat=group('seat');seat.position.set(0,.76*SCALE,-.1*SCALE);seat.scale.setScalar(PILOT_SCALE);root.add(seat);   // the pilot's hips (cockpit, under the brow)
  // the cockpit: a padded back panel over the model's unseen interior (opened by the build) and two control sticks
  {const M=materials();seat.add(at(box(40,50,4,M.dark,2),0,20,-15),at(box(30,5,26,M.dark,2),0,-2,-2),at(box(26,30,3,M.tube,1.5),0,22,-12.8));
    for(const x of [-11,11])seat.add(at(cyl(1.2,1.2,16,M.steel,8),x,6,15,-.35),at(box(3.2,4.5,3.2,M.dark,1),x,13,17.5));}
  const hard=group('hardpoint');root.add(hard);hard.visible=mount;
  hard.add(at(cyl(2.2,2.2,12,materials().dark,10),0,6,0),at(box(18,3,14,materials().dark,1),0,-1,-10));
  const mg=weapon('mg');mg.position.set(0,14,2);hard.add(mg);
  const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),tq=new THREE.Quaternion(),rq=new THREE.Quaternion(),q=new THREE.Quaternion(),ax=new THREE.Vector3();
  // turn a bone about an axis given in the mech's frame
  function turn(bone,axis,angle){
    if(!bone||!angle)return;bone.parent.updateWorldMatrix(true,false);
    bone.parent.getWorldQuaternion(tq).invert();root.getWorldQuaternion(rq);
    ax.copy(axis).applyQuaternion(rq).applyQuaternion(tq).normalize();bone.quaternion.premultiply(q.setFromAxisAngle(ax,angle));
  }
  let phase=0,t=0;
  const v=new THREE.Vector3(),wq=new THREE.Quaternion();
  const api={root,arms,legs,seat,seatFacing:0,pilotScale:PILOT_SCALE,
    eye:.98*SCALE,   // the pilot's eye above the feet (first person)
    gunnerSeat:new THREE.Vector3(0,1.09*SCALE,-.33*SCALE),
    setWeapons(left,right){for(const [side,id] of [['left',left],['right',right]]){const a=arms[side];if(a.id===id)continue;a.weapon?.removeFromParent();a.weapon=weapon(id);a.weapon.scale.setScalar(1.1);a.id=id;a.weapon.traverse(o=>{if(o.isMesh)o.castShadow=true;});a.mount.add(a.weapon);}},
    setMount(on){hard.visible=on;},
    mountGun:mg,
    recoil(side,k=1){arms[side].kick=Math.min(1.5,arms[side].kick+k);},
    muzzle(side,out=new THREE.Vector3()){const m=arms[side].weapon?.getObjectByName('muzzle');root.updateMatrixWorld(true);return m?m.getWorldPosition(out):arms[side].mount.getWorldPosition(out);},
    update(dt,pose={}){
      const speed=pose.speed??0,stride=Math.min(1,speed/110),pitch=pose.pitch??0;
      phase+=dt*(1.4+speed/60);t+=dt;
      for(const [b,r] of rest)b.quaternion.copy(r);
      model.position.y=restModelY-Math.abs(Math.sin(phase))*4*stride+Math.sin(t*1.2)*.6*(1-stride);
      turn(bones.pelvis,Y,Math.sin(phase)*.05*stride);
      for(const [side,s] of [['left',0],['right',Math.PI]]){
        const L=legs[side],p=Math.sin(phase+s)*stride,lift=Math.max(0,Math.cos(phase+s))*stride;
        const th=-p*.4-lift*.2,mid=lift*.45,sh=-lift*.35;
        turn(L.thigh,X,th);turn(L.mid,X,mid);turn(L.shin,X,sh);turn(L.ankle,X,-(th+mid+sh)*.9);
      }
      turn(bones.ribcage,Y,-Math.sin(phase)*.04*stride);turn(bones.ribcage,X,Math.sin(t*1.2)*.01-pitch*.12);
      bones.flaps.forEach((f,i)=>turn(f,X,-(.2+.35*stride)*Math.abs(Math.sin(t*9+i))));
      bones.fins.forEach((f,i)=>turn(f,X,Math.sin(t*2+i)*.03+stride*.06));
      for(const [side,a] of Object.entries(arms)){
        a.kick=Math.max(0,a.kick-dt*8);
        // upper arm lifts a little with the aim, the forearm the rest of the way: the stump points along the look
        turn(a.upper,X,-pitch*.35+a.kick*.08);
        turn(a.fore,Y,-a.yaw);turn(a.fore,X,a.slope-pitch*.65-a.kick*.05);
        root.updateMatrixWorld(true);
        a.mount.position.copy(root.worldToLocal(a.fore.localToWorld(v.copy(a.end))));
        a.mount.quaternion.setFromAxisAngle(X,-pitch);a.mount.position.z-=a.kick*4;
        const spin=a.weapon?.getObjectByName('spin');if(spin)spin.rotation.z+=dt*30*(pose.spin?.[side]??0);
        const glow=a.weapon?.getObjectByName('glow');if(glow)glow.traverse(o=>{if(o.material?.emissiveIntensity!=null)o.material.emissiveIntensity=1+(pose.charge?.[side]??0)*5;});
      }
      // rear hardpoint rides the engine
      if(bones.engine){root.updateMatrixWorld(true);hard.position.copy(root.worldToLocal(bones.engine.getWorldPosition(v))).add(new THREE.Vector3(0,12,-4));}
    }};
  return api;
}

// ---- weapons from the Marcy model's own parts (the build's KIT_* meshes, same textures as the mech) ---------------------
// Each points down +Z from its mount with a `muzzle` node, about the size of the procedural ones (45-65 long), so the
// first-person arms and the mech share them. kit(name, scale): a copy centred on its bounding box.
let steelMats=null;
function steel(){
  return steelMats??={
    // no environment map in the game's scenes: strong metalness renders near-black, so these stay half metallic
    gun:new THREE.MeshStandardMaterial({color:0x4a4f4c,metalness:.45,roughness:.5}),
    worn:new THREE.MeshStandardMaterial({color:0x837a68,metalness:.4,roughness:.55}),
    bore:new THREE.MeshStandardMaterial({color:0x050506,metalness:.3,roughness:.9}),
    brass:new THREE.MeshStandardMaterial({color:0x9a7842,metalness:.5,roughness:.45}),
    olive:new THREE.MeshStandardMaterial({color:0x4b5338,metalness:.3,roughness:.65}),
  };
}
function kit(name,scale,rot=[0,0,0]){
  const src=mechGltf.scene.getObjectByName(name),g=new THREE.Group();if(!src)return g;
  const c=src.clone();c.position.set(0,0,0);c.rotation.set(0,0,0);c.scale.setScalar(scale);
  const b=new THREE.Box3().setFromObject(c),mid=b.getCenter(new THREE.Vector3());c.position.sub(mid);
  const inner=new THREE.Group();inner.add(c);inner.rotation.set(...rot);g.add(inner);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});return g;
}
// a fluted barrel along +Z: tube, bore, a few clamp rings and a muzzle brake
function barrel(r,len,m=steel()){
  const g=new THREE.Group();
  g.add(at(cyl(r,r,len,m.gun,16),0,0,len/2,Math.PI/2),at(cyl(r*.55,r*.55,len+.2,m.bore,12),0,0,len/2,Math.PI/2));
  for(const t of [.2,.55])g.add(at(cyl(r*1.25,r*1.25,len*.05,m.worn,16),0,0,len*t,Math.PI/2));
  g.add(at(cyl(r*1.35,r*1.2,len*.12,m.gun,16),0,0,len*.97,Math.PI/2));
  for(let i=0;i<4;i++)g.add(at(box(r*.5,r*2.7,len*.07,m.bore,.2),0,0,len*.97,0,0,i*Math.PI/4));   // brake slots
  return g;
}
const muzzleAt=(g,z,y=0)=>{const m=new THREE.Object3D();m.name='muzzle';m.position.set(0,y,z);g.add(m);return g;};
const KIT_WEAPONS={
  chaingun(){
    const g=group('chaingun'),m=steel();
    g.add(at(kit('KIT_EngineCore',110,[Math.PI/2,0,0]),0,0,4));                 // breech drum
    g.add(at(kit('KIT_Shoulder',85,[0,Math.PI/2,0]),0,9,6));                     // armour cowl over it
    const spin=group('spin');spin.position.z=13;
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2,b=barrel(1.8,34);b.position.set(Math.cos(a)*4.6,Math.sin(a)*4.6,0);spin.add(b);}
    spin.add(at(cyl(7,7,2.5,m.worn,18),0,0,8,Math.PI/2),at(cyl(7,7,2.5,m.worn,18),0,0,24,Math.PI/2),at(cyl(2.4,2.4,36,m.gun,10),0,0,17,Math.PI/2));
    g.add(spin);g.add(at(box(6,10,12,m.brass,1),-10,-4,4));                      // ammo feed
    return muzzleAt(g,48);
  },
  rail(){
    const g=group('rail'),m=steel();
    g.add(at(kit('KIT_Blade',80),0,0,26));                                        // the cut-off "DO OR DIE" blade forearm as the rail
    g.add(at(kit('KIT_KneeCap',90,[0,0,Math.PI/2]),0,-6,2));
    const glow=group('glow');for(const z of [8,18,28]){const r=new THREE.Mesh(new THREE.TorusGeometry(5.5,1,8,20),materials().glowBlue.clone());r.position.z=z;glow.add(r);}g.add(glow);
    return muzzleAt(g,58);
  },
  salvo(){
    const g=group('salvo'),m=steel();
    for(const x of [-1,1])g.add(at(kit('KIT_KneeCap',120,[0,0,x*Math.PI/2]),x*11,0,6));    // armour plates either side
    g.add(at(box(18,18,22,m.olive,2.5),0,0,6),at(kit('KIT_Shoulder',110,[0,Math.PI/2,0]),0,10,6));   // pod body, shoulder armour on top
    for(const [x,y] of [[-4.6,-4.6],[4.6,-4.6],[-4.6,4.6],[4.6,4.6]])g.add(at(cyl(3.6,3.6,6,m.worn,14),x,y,15.5,Math.PI/2),at(cyl(2.7,2.7,6.2,m.bore,12),x,y,15.6,Math.PI/2));
    g.add(at(kit('KIT_Booster',90,[Math.PI,0,0]),0,1,-8));                        // the booster pod at the back
    return muzzleAt(g,19);
  },
  thermite(){
    const g=group('thermite'),m=steel();
    g.add(at(kit('KIT_Engine',120),0,0,4));                                       // the radial engine as a drum magazine
    g.add(at(cyl(6,6.8,24,m.worn,18),0,0,20,Math.PI/2),at(cyl(4.4,4.4,24.2,m.bore,14),0,0,20,Math.PI/2),at(cyl(7.6,7.6,3,m.gun,18),0,0,31,Math.PI/2),at(cyl(7.2,7.2,2.4,m.gun,18),0,0,13,Math.PI/2));
    for(const x of [-1,1])g.add(at(kit('KIT_KneeCap',80,[0,0,x*Math.PI/2]),x*8.5,-1,20));
    const ring=new THREE.Mesh(new THREE.TorusGeometry(5.8,1,8,20),materials().glowOrange);ring.position.z=33.5;ring.name='glow';g.add(ring);
    g.add(at(kit('KIT_Shoulder',70,[0,Math.PI/2,0]),0,9,16));
    return muzzleAt(g,35);
  },
  fist(){
    const g=group('fist'),m=steel(),hand=group('hand');
    hand.add(at(kit('KIT_Hand',150),0,0,12));                                    // the mech's own claw hand
    hand.add(at(cyl(2.6,2.6,16,m.worn,12),-5,4,-2,Math.PI/2),at(cyl(2.6,2.6,16,m.worn,12),5,4,-2,Math.PI/2),at(cyl(4,4,6,m.gun,14),0,0,-4,Math.PI/2));   // pistons
    g.add(hand);return muzzleAt(g,24);
  },
  arc(){
    const g=group('arc'),m=steel();
    g.add(at(kit('KIT_EngineCore',100,[Math.PI/2,0,0]),0,0,4));
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2+Math.PI/2,p=at(box(2.4,2.4,20,m.worn,.8),Math.cos(a)*6.5,Math.sin(a)*6.5,22,Math.sin(a)*.25,-Math.cos(a)*.25,0);g.add(p);   // prongs lean in towards the core
      g.add(at(cyl(1.6,1.6,2,materials().glowBlue,8),Math.cos(a)*4,Math.sin(a)*4,31,Math.PI/2));}
    const core=new THREE.Mesh(new THREE.SphereGeometry(4,16,12),materials().glowBlue.clone());core.position.z=20;core.name='glow';g.add(core);
    g.add(at(kit('KIT_Shoulder',70,[0,Math.PI/2,0]),0,9,4));
    return muzzleAt(g,32);
  },
};

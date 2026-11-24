// Attachment models mounted on a gun's tags (imported BO3 guns: def.mounts {attId: {model, tag, offset?}},
// the equipped ones in def.mounted). Shared by the game (weapon-levels mod.js) and the main
// menu's Gunsmith preview. Each part's root bone sits on the tag. Lenses become glass named like
// the scopes mod's (it centres the sight on them while aiming); reticle cards hide (it draws the
// dot). Models are cached per weapon, so earlier mounts come off first.
// Parts of a shared model (the AW guns' Blender set, mods/bo3-weapons/aw-kits.json) name their node, and give `at`: where
// the part sits in the gun's own space (tag_weapon at rest: x forward, y left, z up), so one list of coordinates works
// whichever bone carries it. Optional rot (degrees), scale (number or [x,y,z]). They share one material: no clones.
// On an off-hand gun (opts.mirror) y and the x rotation flip, so a part on the outside of one gun is on the outside of both.
// A part made for one gun of a pair (mount.hand 'right'/'left', the GKZ-45 Mk3's kit) is modelled in that gun's own space:
// it goes only on that gun, never mirrored. A mount may be a list (one attachment, a part on each gun).
// A part with a laser (a material named *emit_beam_<colour>) gets a beam from that emitter: aimLasers steers it.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { restick } from '../stickers/stickers.js';

// tag_weapon space to a bone's, from the rest pose (bones move while a clip plays, the skeleton's inverses don't)
function restSpace(gun,bone){
  let sk=null;gun.traverse(o=>{if(!sk&&o.isSkinnedMesh&&o.skeleton.bones.includes(bone))sk=o.skeleton;});
  const t=sk?.bones.findIndex(b=>/^tag_weapon(\d|_le)?$/.test(b.name))??-1;
  if(t<0)return new THREE.Matrix4();
  return sk.boneInverses[sk.bones.indexOf(bone)].clone().multiply(sk.boneInverses[t].clone().invert());
}
const R=Math.PI/180;
function placement(gun,bone,m,mirror){
  const s=m.scale??1,e=m.rot??[0,0,0],k=mirror?-1:1;
  const local=new THREE.Matrix4().compose(new THREE.Vector3(m.at[0],m.at[1]*k,m.at[2]),new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0]*R*k,e[1]*R,e[2]*R)),
    Array.isArray(s)?new THREE.Vector3(...s):new THREE.Vector3(s,s,s));
  return restSpace(gun,bone).multiply(local);
}

// The beam: two crossed strips 185 long (the view camera ends at 200), bright at the emitter, gone at the end. Additive, one material per colour.
const BEAM={L:185,W:.09,mats:new Map(),geo:null};
const beamMaterial=hex=>{if(!BEAM.mats.has(hex))BEAM.mats.set(hex,new THREE.MeshBasicMaterial({vertexColors:true,color:hex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false,toneMapped:false}));return BEAM.mats.get(hex);};
function beamGeometry(){
  if(BEAM.geo)return BEAM.geo;
  const pos=[],col=[],idx=[],stops=[[0,1],[.06,.75],[.35,.3],[1,0]];
  for(const [a,b] of [[1,0],[0,1]]){
    const base=pos.length/3;
    for(const [f,c] of stops){const w=BEAM.W*(1-.5*f);pos.push(f*BEAM.L,a*w,b*w,f*BEAM.L,-a*w,-b*w);col.push(c,c,c,c,c,c);}
    for(let i=0;i<stops.length-1;i++){const k=base+i*2;idx.push(k,k+1,k+3,k,k+3,k+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);
  return BEAM.geo=g;
}
const BEAM_COLOUR={red:0xff2a20,green:0x30ff60};
function addBeam(part,gun){
  let src=null;part.traverse(o=>{if(!src&&o.isMesh&&/emit_beam_/.test(o.material.name))src=o;});
  if(!src)return;
  src.geometry.computeBoundingBox();
  const colour=src.material.name.split('emit_beam_')[1],at=src.geometry.boundingBox.getCenter(new THREE.Vector3()),beam=new THREE.Mesh(beamGeometry(),beamMaterial(BEAM_COLOUR[colour]??0xff2a20));
  beam.position.copy(at);beam.frustumCulled=false;beam.renderOrder=3;beam.userData.laser=colour;
  src.parent.add(beam);(gun.userData.beams??=live()).push(beam);
}
// Steer every beam on a gun at the crosshair (the point `to`, world space): beams leave a gun held off-centre and meet
// where the shots go. When the gun points well away (reload, sprint) the beam just follows the barrel.
const fwd=new THREE.Vector3(1,0,0),dir=new THREE.Vector3(),mid=new THREE.Vector3(),scale=new THREE.Vector3();
export function aimLasers(gun,to,opacity=1){
  const list=gun?.userData.beams;if(!list?.length)return;
  for(const b of list){
    const p=b.parent;p.getWorldScale(scale);
    p.worldToLocal(dir.copy(to)).sub(b.position).normalize();
    const c=dir.x,k=THREE.MathUtils.smoothstep(c,.88,.97);
    dir.lerp(fwd,1-k).normalize();b.quaternion.setFromUnitVectors(fwd,dir);b.scale.setScalar(1/(scale.x||1));
    b.material.opacity=opacity;
  }
}
export const laserColour=gun=>gun?.userData.beams?.[0]?.userData.laser??null;
export const beamWarm=()=>{const m=new THREE.Mesh(beamGeometry(),beamMaterial(BEAM_COLOUR.red));m.frustumCulled=false;return m;};   // for host.warmObjects

// lists of live objects in userData copy as [] (three's Object3D.copy JSON-copies userData: a clone of the hands rig with
// the gun on it, fp-arms.js ArmSetArms, serialised the parts' textures and threw on their released images, 2026-11-18)
const live=()=>Object.defineProperty([],'toJSON',{value:()=>[]});
// Guns with swappable parts inside the model (BO7 rips, def.tagGroups; docs/fork/bo7-rips.md): a part's bones are named
// <head>__<bone> and hang from the bones the clips move, so they follow the head's hide state here, after the
// engine and the Gunsmith hid def.hideTags; a hidden part's meshes (materials <head>~...) stop drawing. def.tagMoves
// {head:{tag:[x,y,z,qx,qy,qz,qw]}} put the gun's own tags where a fitted part has them (the muzzle on a longer barrel),
// def.tagRest puts them back.
const TAGS=new WeakMap(),TMP=new THREE.Matrix4(),TV=new THREE.Vector3(),TQ=new THREE.Quaternion(),TS=new THREE.Vector3();
export function syncTagGroups(gun,def,mirror=false){
  if(!gun||!def?.tagGroups)return;
  // first call: before any part is mounted. An akimbo pair's second gun (mirror) has every bone suffixed _le (BO7 rips,
  // .tools/build_bo7_rips.py build_akimbo): keyed by the right gun's names, so the def's lists fit both
  const key=n=>mirror&&n.endsWith('_le')?n.slice(0,-3):n;
  let by=TAGS.get(gun);if(!by){by=new Map();gun.traverse(o=>{if(o.isBone&&!by.has(key(o.name)))by.set(key(o.name),o);});TAGS.set(gun,by);}
  const shown=h=>{const b=by.get(h);return !b||b.scale.x>1e-3;};
  // the heads themselves (b7_base_<slot>, b7_<slot>_<kind>): straight from the def, since a cached viewmodel keeps the
  // last loadout's scales and the engine only hides tags when it builds one
  const hide=new Set(def.hideTags??[]);
  for(const [n,b] of by)if(n.startsWith('b7_')&&!n.includes('__'))b.scale.setScalar(hide.has(n)?1e-6:1);
  for(const [n,b] of by){const i=n.indexOf('__');if(i>0&&!b.userData.poseFolded)b.scale.setScalar(shown(n.slice(0,i))?1:1e-6);}   // poseFolded: a static view's loose part (pose.js), the spare mag
  gun.traverse(o=>{if(!o.isMesh)return;const i=(o.material?.name??'').indexOf('~');if(i>0)o.visible=shown(o.material.name.slice(0,i));});
  const put=(n,v)=>{const b=by.get(n);if(b&&v){b.position.set(v[0],v[1],v[2]);b.quaternion.set(v[3],v[4],v[5],v[6]);b.updateMatrix();}};
  const fl=by.get('tag_flash');if(fl?.userData.rest)put('tag_flash',fl.userData.rest);   // a muzzle moved it last time
  for(const [n,v] of Object.entries(def.tagRest??{}))put(n,v);
  for(const [h,list] of Object.entries(def.tagMoves??{}))if(by.get(h)&&shown(h))for(const [n,v] of Object.entries(list))put(n,v);
}
// def.flashFollowsMuzzle: a mounted muzzle's own flash bone moves the gun's tag_flash out to its end (tracers, flash)
function muzzleFlash(gun,bone,part){
  let f=null;part.traverse(o=>{if(!f&&o.isBone&&/^tag_flash/.test(o.name))f=o;});
  const flash=gun.getObjectByName('tag_flash')??gun.getObjectByName('tag_flash_le');if(!f||!flash||flash.parent!==bone.parent)return;
  // f.matrixWorld is still in the part's own space (updated before part.matrix was set), part.matrix takes it to the bone's
  flash.userData.rest??=[...flash.position.toArray(),...flash.quaternion.toArray()];
  TMP.multiplyMatrices(bone.matrix,part.matrix).multiply(f.matrixWorld).decompose(TV,TQ,TS);
  flash.position.copy(TV);flash.quaternion.copy(TQ);flash.updateMatrix();
}
export async function mountParts(gun,def,ids=def?.mounted??[],stillCurrent=()=>true,{mirror=false}={}){
  if(!gun)return;
  syncTagGroups(gun,def,mirror);
  const run=gun.userData.mountRun=(gun.userData.mountRun??0)+1;   // a newer call (equip fires twice on some guns) replaces this one, or its parts stack on top
  for(const o of gun.userData.mounts??[])o.removeFromParent();gun.userData.mounts=live();gun.userData.beams=live();
  // def.fixedParts: always-on parts that are their own model (the AS50's scope), mounted the same way
  for(const [mid,m] of [...(def?.fixedParts??[]).map((m,i)=>['fixed'+i,m]),...ids.flatMap(id=>[def?.mounts?.[id]].flat().map(m=>[id,m]))]){
    if(m?.hand&&(m.hand==='left')!==mirror)continue;
    const bone=m&&[m.tag,m.tag+'1',m.tag+'_le',m.tag.replace(/\d+$/,d=>+d+1)].map(n=>gun.getObjectByName(n)).find(Boolean);if(!bone)continue;   // left models number their bones one up, or add _le
    let part=await loadModel(m.model).catch(()=>null);if(!part||!stillCurrent()||gun.userData.mountRun!==run)return;
    if(m.node){   // one node of a shared model: nothing below needs patching
      part=part.getObjectByName(m.node);if(!part)continue;
      part.removeFromParent();part.matrixAutoUpdate=false;part.matrix.copy(placement(gun,bone,m,mirror&&!m.hand));
      part.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});part.userData.mountId=mid;bone.add(part);gun.userData.mounts.push(part);addBeam(part,gun);continue;
    }
    part.updateMatrixWorld(true);let root=null;part.traverse(o=>{if(!root&&o.isBone)root=o;});
    part.matrixAutoUpdate=false;if(root)part.matrix.copy(root.matrixWorld).invert();
    if(m.offset)for(let i=0;i<3;i++)part.matrix.elements[12+i]+=m.offset[i];   // a gun without the part's tag: placed off another bone (AW red dots)
    part.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;const mm=o.material=o.material.clone(),n=mm.name??'';
      if(/reticle|_ret1$|reflex_ret$/.test(n))o.visible=false;
      else if(/lens|eotech_ret$/.test(n)){mm.name='reflex_lens '+n;Object.assign(mm,{transparent:true,depthWrite:false,opacity:.12,roughness:.05,metalness:0});o.renderOrder=2;}});
    part.userData.mountId=mid;bone.add(part);gun.userData.mounts.push(part);
    if(def?.flashFollowsMuzzle&&/^tag_(silencer|flash)/.test(m.tag))muzzleFlash(gun,bone,part);
  }
  // stickers placed on attachments (mods/stickers): the parts arrive after the gun's stickers were applied
  if(gun.userData.kinoStickers)restick(gun);
}

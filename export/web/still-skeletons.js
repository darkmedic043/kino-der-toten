// Moved out of world.js (2026-10-17) so the engine can apply it to every map's static root: Der Eisendrache's
// rigged BO3 props re-uploaded 268 bone textures a frame (~10% of its CPU time).
// Map props (wall guns, turrets) are rigged but never animate their bones, yet three re-uploads every bone
// texture each frame (about 140 uploads a frame). Keep the update (a moving door root still needs it) but
// undo the texture version bump when the matrices came out the same, so nothing is re-uploaded.
export function stillSkeletons(root){
  root.traverse(o=>{
    const sk=o.isSkinnedMesh&&o.skeleton;if(!sk||sk.userData?.still)return;
    sk.userData={...sk.userData,still:true};
    // (2026-10-25) the bones' world matrices are compared first: unchanged since the last update means the same bone
    // matrices, so the multiplies (Kino: ~1.5 ms a frame over its 330 still rigs) and the upload are skipped outright
    // (2026-11-21) a rig that changed on 6 updates running is an animated one (a zombie): the compare and the copy are
    // left out for its next 40 updates, then it is looked at again (they were 3.5% of a frame with 17 zombies)
    const update=sk.update;let last=null,run=0,hot=0;
    sk.update=function(){
      if(hot>0){hot--;update.call(this);return;}
      const bones=this.bones,n=bones.length*16;let same=!!last&&last.length===n;
      for(let i=0;same&&i<bones.length;i++){const e=bones[i].matrixWorld.elements,o=i*16;for(let j=0;j<16;j++)if(e[j]!==last[o+j]){same=false;break;}}
      if(same){run=0;return;}
      if(!last||last.length!==n)last=new Float64Array(n);
      for(let i=0;i<bones.length;i++)last.set(bones[i].matrixWorld.elements,i*16);
      if(++run>=6){run=5;hot=40;}
      update.call(this);
    };
  });
}

// One skeleton per rig (2026-11-21). SkeletonUtils.clone gives every skinned mesh of a copy its own Skeleton, also where
// the source's meshes shared one, and the mods that bind pieces onto a zombie's bones make one each too: a zombie's four
// body meshes and two head meshes were six skeletons, so six bone-matrix updates and six bone-texture uploads a frame
// (120 for 20 zombies). Meshes whose skeletons list the same bones in the same order with the same inverses are bound
// to one of them; a mesh keeps its own bind matrix. Skeletons of another class (the first-person arms' solver) are left.
const shared=new WeakSet(),byBone=new WeakMap();
const sameInverses=(a,b)=>{if(a===b)return true;if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i]&&!a[i].equals(b[i]))return false;return true;};
export function shareSkeletons(root){
  let n=0;
  root.traverse(o=>{
    if(!o.isSkinnedMesh||shared.has(o))return;
    const sk=o.skeleton;if(!sk||sk.constructor!==THREE.Skeleton||!sk.bones.length||!sk.bones[0])return;
    shared.add(o);
    let list=byBone.get(sk.bones[0]);if(!list){list=[];byBone.set(sk.bones[0],list);}
    if(list.includes(sk))return;
    for(const t of list){
      if(t.bones.length!==sk.bones.length)continue;
      let same=true;for(let i=0;i<sk.bones.length;i++)if(t.bones[i]!==sk.bones[i]){same=false;break;}
      if(!same||!sameInverses(t.boneInverses,sk.boneInverses))continue;
      o.skeleton=t;sk.dispose();n++;return;
    }
    list.push(sk);
  });
  return n;
}

// Bones hidden (2026-10-17): the renderer's projectObject visits every bone of every rig each render (Der Eisendrache:
// 1,036 bones under its wall guns, machines and animated props), and `visible = false` prunes that walk without
// touching the animation (matrices and the skeleton's bone texture still update). Only bones with nothing but bones
// under them are hidden; attaching something to a bone later (a held weapon on a hand, a gib piece) shows its chain again.
import * as THREE from 'three';
if(!THREE.Bone.prototype.__showOnAdd){
  for(const k of ['add','attach']){const f=THREE.Object3D.prototype[k];THREE.Bone.prototype[k]=function(...o){if(o.some(c=>c&&!c.isBone))for(let p=this;p&&p.isBone;p=p.parent)p.visible=true;return f.apply(this,o);};}
  THREE.Bone.prototype.__showOnAdd=true;
}
export function hideBones(root){
  let n=0;
  const walk=o=>{let only=true;for(const c of o.children)if(!walk(c))only=false;if(o.isBone){if(only&&o.visible){o.visible=false;n++;}return only;}return false;};
  // (a bone's non-bone child keeps its chain visible; a bone under a hidden bone can't be seen anyway)
  for(const c of root.children)walk(c);
  return n;
}

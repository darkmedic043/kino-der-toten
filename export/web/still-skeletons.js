// Moved out of world.js (2026-10-17) so the engine can apply it to every map's static root: Der Eisendrache's
// rigged BO3 props re-uploaded 268 bone textures a frame (~10% of its CPU time).
// Map props (wall guns, turrets) are rigged but never animate their bones, yet three re-uploads every bone
// texture each frame (about 140 uploads a frame). Keep the update (a moving door root still needs it) but
// undo the texture version bump when the matrices came out the same, so nothing is re-uploaded.
export function stillSkeletons(root){
  root.traverse(o=>{
    const sk=o.isSkinnedMesh&&o.skeleton;if(!sk||sk.userData?.still)return;
    sk.userData={...sk.userData,still:true};
    const update=sk.update;let last=null;
    sk.update=function(){
      const texture=this.boneTexture,version=texture?.version;
      update.call(this);
      const m=this.boneMatrices;let same=!!last&&last.length===m.length;
      for(let i=0;same&&i<m.length;i++)if(m[i]!==last[i])same=false;
      if(same&&texture)texture.version=version;else if(last&&last.length===m.length)last.set(m);else last=m.slice();
    };
  });
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

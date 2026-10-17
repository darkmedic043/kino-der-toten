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

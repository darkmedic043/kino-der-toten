// Attachment models mounted on a gun's tags (imported BO3 guns: def.mounts {attId: {model, tag}},
// the equipped ones in def.mounted). Shared by the game (weapon-levels mod.js) and the main
// menu's Gunsmith preview. Each part's root bone sits on the tag. Lenses become glass named like
// the scopes mod's (it centres the sight on them while aiming); reticle cards hide (it draws the
// dot). Models are cached per weapon, so earlier mounts come off first.
import { loadModel } from '../../animation.js';

export async function mountParts(gun,def,ids=def?.mounted??[],stillCurrent=()=>true){
  if(!gun)return;
  for(const o of gun.userData.mounts??[])o.removeFromParent();gun.userData.mounts=[];
  // def.fixedParts: always-on parts that are their own model (the AS50's scope), mounted the same way
  for(const m of [...(def?.fixedParts??[]),...ids.map(id=>def?.mounts?.[id])]){
    const bone=m&&gun.getObjectByName(m.tag);if(!bone)continue;
    const part=await loadModel(m.model).catch(()=>null);if(!part||!stillCurrent())return;
    part.updateMatrixWorld(true);let root=null;part.traverse(o=>{if(!root&&o.isBone)root=o;});
    part.matrixAutoUpdate=false;if(root)part.matrix.copy(root.matrixWorld).invert();
    part.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;const mm=o.material=o.material.clone(),n=mm.name??'';
      if(/reticle|_ret1$|reflex_ret$/.test(n))o.visible=false;
      else if(/lens|eotech_ret$/.test(n)){mm.name='reflex_lens '+n;Object.assign(mm,{transparent:true,depthWrite:false,opacity:.12,roughness:.05,metalness:0});o.renderOrder=2;}});
    bone.add(part);gun.userData.mounts.push(part);
  }
}

// Stops three recomputing the local and world matrices of a map's static objects every frame (not part of upstream;
// docs/fork/performance.md). three r185 composes every `matrixAutoUpdate` object's matrix and multiplies it into its
// world matrix each frame, for ~2,600 objects of The Giant's map that never move (~25% of a cheap frame's CPU).
// Kino's world.js freezes its root outright; custom maps can't, because doors slide, barricade debris rises and mods
// animate map parts. So here every object under `root` except bones is frozen (matrixAutoUpdate off, matrix current),
// its position/rotation/scale are snapshotted, and every `every` frames the snapshots are compared: anything that moved
// goes back to normal updates for good (it is then one frame behind once, at most `every` frames after it started).
import * as THREE from 'three';

export function createStaticFreeze(root,{every=15}={}){
  const list=[],snap=[];
  root.updateMatrixWorld(true);
  root.traverse(o=>{
    if(o===root||!o.matrixAutoUpdate||o.isBone||o.isCamera||o.isLight)return;
    o.updateMatrix();o.matrixAutoUpdate=false;list.push(o);
    snap.push(o.position.x,o.position.y,o.position.z,o.quaternion.x,o.quaternion.y,o.quaternion.z,o.quaternion.w,o.scale.x,o.scale.y,o.scale.z);
  });
  let frame=0,thawed=0;
  return {
    frozen:list.length,get thawed(){return thawed;},
    tick(){
      if(++frame%every)return;
      for(let i=0;i<list.length;i++){
        const o=list[i];if(!o||o.matrixAutoUpdate)continue;
        const p=o.position,q=o.quaternion,s=o.scale,k=i*10;
        if(p.x!==snap[k]||p.y!==snap[k+1]||p.z!==snap[k+2]||q.x!==snap[k+3]||q.y!==snap[k+4]||q.z!==snap[k+5]||q.w!==snap[k+6]||s.x!==snap[k+7]||s.y!==snap[k+8]||s.z!==snap[k+9]){
          o.matrixAutoUpdate=true;o.matrixWorldNeedsUpdate=true;list[i]=null;thawed++;   // it moves: normal updates from now on
        }
      }
    },
  };
}

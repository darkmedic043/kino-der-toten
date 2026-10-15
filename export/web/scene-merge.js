// Static level meshes merged per material (not part of upstream; docs/fork/performance.md). Opt-in per map
// (maps.json `mergeStatic: true`, `mergeExclude`: a regex for names whose subtree stays as it is): The Giant's level is
// 2,099 meshes (split by material and 1,024-unit cell) over 354 materials but only 1.26M triangles, and the frame was
// CPU-bound on those draws (2,400 a frame with every prop hidden, 37 FPS), not on the GPU (half resolution: +1 FPS).
// Meshes sharing a material and vertex layout become one mesh in world space; drawing the whole level each frame is
// cheap for the GPU. Left alone: skinned and instanced meshes, custom-world markers (doors, movers, traps, risers,
// panels: `userData.marker`), anything hidden, multi-material meshes, and `mergeExclude` names (mods that find or
// toggle map parts by name). The originals leave the scene (kept in `detached`); geometry no longer used is disposed.
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';

export function mergeStaticMeshes(root,{exclude=null,target=root}={}){
  root.updateMatrixWorld(true);
  const groups=new Map(),users=new Map();
  const skip=o=>{for(let p=o;p&&p!==root;p=p.parent){if(!p.visible||p.userData.marker||p.userData.noMerge||(exclude&&exclude.test(p.name)))return true;}return false;};
  root.traverse(o=>{
    if(!o.isMesh)return;users.set(o.geometry,(users.get(o.geometry)??0)+1);
    if(o.isSkinnedMesh||o.isInstancedMesh||Array.isArray(o.material)||o.morphTargetInfluences?.length||skip(o))return;
    const g=o.geometry;if(Object.values(g.attributes).some(a=>a.isInterleavedBufferAttribute)||Object.keys(g.morphAttributes).length)return;
    const attrs=Object.keys(g.attributes).sort().map(k=>`${k}:${g.attributes[k].itemSize}${g.attributes[k].normalized?'n':''}:${g.attributes[k].array.constructor.name}`).join(',');
    const key=[o.material.uuid,attrs,!!g.index,o.castShadow,o.receiveShadow,o.renderOrder,o.layers.mask].join('|');
    let e=groups.get(key);if(!e)groups.set(key,e={meshes:[],tris:0});e.meshes.push(o);
  });
  const detached=[],made=[];let merged=0;
  for(const e of groups.values()){
    if(e.meshes.length<2)continue;
    const geos=e.meshes.map(o=>{const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;});
    const geo=mergeGeometries(geos,false);for(const g of geos)g.dispose();
    if(!geo)continue;
    const first=e.meshes[0],mesh=new THREE.Mesh(geo,first.material);
    mesh.name='merged_'+(first.material.name||first.name);for(const p of ['castShadow','receiveShadow','renderOrder'])mesh[p]=first[p];mesh.layers.mask=first.layers.mask;
    mesh.userData={merged:e.meshes.length};mesh.matrixAutoUpdate=false;geo.computeBoundingSphere();geo.computeBoundingBox();
    target.add(mesh);mesh.updateMatrixWorld(true);made.push(mesh);
    // world space: undo the target's own transform
    if(!target.matrixWorld.equals(new THREE.Matrix4())){geo.applyMatrix4(new THREE.Matrix4().copy(target.matrixWorld).invert());geo.computeBoundingSphere();}
    for(const o of e.meshes){detached.push([o,o.parent]);o.parent.remove(o);users.set(o.geometry,users.get(o.geometry)-1);merged++;}
  }
  for(const [o] of detached)if(o.isMesh&&!users.get(o.geometry))o.geometry.dispose();
  // empty groups left behind go too
  for(const [,parent] of [...detached]){let q=parent;while(q&&q!==root&&!q.children.length&&q.parent&&!q.isMesh){const up=q.parent;up.remove(q);detached.push([q,up]);q=up;}}
  return {merged,meshes:made.length,detached,made};
}

// Static views of the imported BO3 guns (third person, Mystery Box, Pack-a-Punch, Gunsmith, menu
// thumbnails) show the model unanimated. BO3's bind pose isn't a rest pose: it parks parts (mags,
// sight blocks) away from the gun and leaves placing them to the animations, so they floated.
// poseIdle applies the first frame of the gun's idle animation once, with the game's own clip rules
// (animation.js makeClip: part translations are offsets from each bone's bind position).
import * as THREE from 'three';
import { loadAnimation, makeClip } from '../../animation.js';

export const needsPose=def=>!!(def?.lazyWorld&&def.animations?.idleAnim);
export async function poseIdle(model,def){
  if(!model||!needsPose(def)||model.userData.bo3Posed)return model;
  const data=await loadAnimation(def.animations.idleAnim).catch(()=>null);if(!data)return model;
  // The root bone (j_gun, or the first bone: tag_weapon on these guns) stays put, as ViewWeapon anchors
  // it: its bind carries a 90 degree roll that the animation's root track resets, which left the
  // static views lying on their side.
  let root=model.getObjectByName('j_gun');model.traverse(n=>{if(!root&&n.isBone)root=n;});
  // Loose shells (j_ammo_NN) of the shell-loaded guns only belong in the reload; the idle frame throws
  // the M1887's 100 units away from the gun, so they keep their bind position.
  const shell=n=>def.segmentedReload&&/^j_ammo_\d+$/.test(n.name);
  model.traverse(n=>{if(!n.isBone)return;if(n===root||shell(n)||/^j_gun1?$/.test(n.name))n.userData.animationAnchor=true;else n.userData.bindPosition??=n.position.clone();});
  const mixer=new THREE.AnimationMixer(model);mixer.clipAction(makeClip(model,data)).play();mixer.update(0);
  // Loose parts that only belong in the reload are hidden, folded onto their parent bone: the M1 Irons' speedloader and
  // the RW1's tag_bullet (the idle frame parks them 70-110 units off), the Blunderbuss's powder horn, shot and wad. In
  // a static view they floated beside the gun, and the menu thumbnail framed them too, so the gun came out tiny.
  // Loose = a bone whose vertices don't touch the gun, directly or through other parts (each bone's posed vertex box,
  // grown from the root and barrel bones; a bone also hangs on when its joint is within 12 units of its parent's
  // vertices, which links up a sling's spaced-out segments). A bone scaled to ~0 still counts as a point in the bounds, hence the fold.
  model.updateMatrixWorld(true);
  const boxes=new Map(),v=new THREE.Vector3(),isBody=n=>n===root||/^(j_gun|tag_weapon|tag_barrel)$/.test(n.name);
  model.traverse(m=>{if(!m.isSkinnedMesh)return;const SI=m.geometry.attributes.skinIndex,SW=m.geometry.attributes.skinWeight;if(!SI)return;
    for(let i=0;i<SI.count;i++){let k=0;for(let c=1;c<4;c++)if(SW.getComponent(i,c)>SW.getComponent(i,k))k=c;
      const bone=m.skeleton.bones[SI.getComponent(i,k)];if(!boxes.has(bone))boxes.set(bone,new THREE.Box3());
      boxes.get(bone).expandByPoint(m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld));}});
  const reached=[...boxes.keys()].filter(isBody),rest=new Set([...boxes.keys()].filter(n=>!isBody(n)));
  for(let i=0;i<reached.length;i++){const box=boxes.get(reached[i]),near=box.clone().expandByScalar(4),joint=box.clone().expandByScalar(12);
    for(const n of rest)if(near.intersectsBox(boxes.get(n))||n.parent===reached[i]&&joint.containsPoint(n.getWorldPosition(v))){rest.delete(n);reached.push(n);}}
  if(reached.length&&rest.size){for(const n of rest){n.position.set(0,0,0);n.scale.setScalar(1e-6);}model.userData.looseParts=[...rest].map(n=>n.name);}
  // left as is: stopping the action would restore the bind pose
  model.userData.bo3Posed=true;model.updateMatrixWorld(true);return model;
}

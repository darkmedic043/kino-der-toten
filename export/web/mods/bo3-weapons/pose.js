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
  model.traverse(n=>{if(!n.isBone)return;if(n===root||/^j_gun1?$/.test(n.name))n.userData.animationAnchor=true;else n.userData.bindPosition??=n.position.clone();});
  const mixer=new THREE.AnimationMixer(model);mixer.clipAction(makeClip(model,data)).play();mixer.update(0);
  // left as is: stopping the action would restore the bind pose
  model.userData.bo3Posed=true;model.updateMatrixWorld(true);return model;
}

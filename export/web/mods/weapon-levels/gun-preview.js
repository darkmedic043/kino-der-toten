// A small turning 3D gun for menus (the Shop's camo previews, the Camos tab): one shared renderer, a gun model per
// weapon (cached), a camo applied on top (animated camos run on camo.js's clock). Usage: const pv=gunPreview(); pv.show(el, def, camo).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { applyCamo, camoTime } from './camo.js';

let gl=null,current=null,spin=0,last=performance.now();
const models=new Map();
function init(){
  if(gl)return gl;
  const r=new THREE.WebGLRenderer({antialias:true,alpha:true});r.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x332211,2.2));const k=new THREE.DirectionalLight(0xffffff,2.4);k.position.set(1,2,2);scene.add(k);
  gl={r,scene,cam:new THREE.PerspectiveCamera(28,2,.1,5000)};
  (function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;camoTime.value+=dt;
    const el=gl.r.domElement;if(!current||!el.isConnected||!el.offsetParent)return;
    const box=el.parentElement,w=box.clientWidth,h=box.clientHeight;
    if(w&&h&&(el.width!==Math.floor(w*devicePixelRatio)||el.height!==Math.floor(h*devicePixelRatio))){gl.r.setPixelRatio(devicePixelRatio);gl.r.setSize(w,h,false);gl.cam.aspect=w/h;gl.cam.updateProjectionMatrix();}
    spin+=dt*.5;current.rotation.y=Math.sin(spin)*.6;gl.r.render(gl.scene,gl.cam);})(last);
  return gl;
}
async function gunFor(def){
  if(!def?.model)return null;
  if(!models.has(def.model))models.set(def.model,loadModel(def.model).then(m=>{
    const box=new THREE.Box3().setFromObject(m),s=box.getSize(new THREE.Vector3());if(s.z>s.x)m.rotation.y=Math.PI/2;m.updateMatrixWorld(true);
    const b2=new THREE.Box3().setFromObject(m);m.position.sub(b2.getCenter(new THREE.Vector3()));const g=new THREE.Group();g.add(m);g.userData.size=b2.getSize(new THREE.Vector3()).length();return g;}).catch(()=>null));
  return models.get(def.model);
}
export function gunPreview(){
  return {async show(el,def,camo){
    const g=init();el.innerHTML='';el.append(g.r.domElement);g.r.domElement.style.cssText='width:100%;height:100%;display:block';
    const gun=await gunFor(def);if(!gun)return;
    if(current!==gun){if(current)g.scene.remove(current);current=gun;g.scene.add(gun);const sz=gun.userData.size;g.cam.position.set(0,sz*.14,sz*1.55);g.cam.lookAt(0,0,0);}
    applyCamo(gun,camo??null);
  }};
}

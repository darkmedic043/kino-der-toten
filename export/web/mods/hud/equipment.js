// Bottom-right equipment cluster: lethal and tactical side by side as greyed
// icons with counts, claymores beside them. Replaces the game's "G · 4 GRENADES"
// text line. Icons are rendered once from each item's world model; Kino ships
// no frag grenade model, so that one is drawn.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

function fragIcon(){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  g.fillStyle='#ddd';g.strokeStyle='#ddd';
  g.beginPath();g.ellipse(60,78,34,40,0,0,Math.PI*2);g.fill();                       // body
  g.fillRect(48,26,26,16);                                                              // fuse
  g.beginPath();g.moveTo(72,30);g.lineTo(96,34);g.lineTo(100,70);g.lineTo(93,72);g.lineTo(89,40);g.lineTo(72,40);g.fill();   // spoon
  g.lineWidth=5;g.beginPath();g.arc(42,30,11,0,Math.PI*2);g.stroke();                  // pull ring
  g.globalCompositeOperation='destination-out';g.lineWidth=3;                           // pineapple grooves
  for(const y of [62,78,94]){g.beginPath();g.moveTo(26,y);g.lineTo(94,y);g.stroke();}
  for(const x of [48,72]){g.beginPath();g.moveTo(x,42);g.lineTo(x,116);g.stroke();}
  return c.toDataURL();
}

async function renderIcons(defs){
  const r=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});r.setSize(128,128);r.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,2));const key=new THREE.DirectionalLight(0xffffff,2.5);key.position.set(.4,1,1.2);scene.add(key);
  const cam=new THREE.PerspectiveCamera(24,1,.1,5000),out={};
  for(const [id,def] of defs){
    try{
      const model=await loadModel(def.worldModel);if(!model)continue;
      const pivot=new THREE.Group();pivot.add(model);pivot.rotation.set(.25,-.6,0);scene.add(pivot);pivot.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(pivot),size=box.getSize(new THREE.Vector3());pivot.position.sub(box.getCenter(new THREE.Vector3()));
      cam.position.set(0,0,Math.max(size.x,size.y,size.z*.7)/(2*Math.tan(THREE.MathUtils.degToRad(12)))*1.05);cam.lookAt(0,0,0);
      r.render(scene,cam);out[id]=r.domElement.toDataURL();pivot.removeFromParent();
    }catch(error){console.warn('equipment icon',id,error);}
  }
  r.dispose();r.forceContextLoss();return out;
}

export function setupEquipmentHud({host,session,data}){
  const el=document.createElement('div');el.id='equip-hud';
  el.innerHTML='<div class="slot" data-k="lethal"><i></i><b></b><kbd>G</kbd></div><div class="slot" data-k="tactical"><i></i><b></b><kbd>X</kbd></div><div class="slot" data-k="mine"><i></i><b></b><kbd>4</kbd></div>';
  document.body.append(el);document.body.classList.add('equip-hud');
  const slot=k=>el.querySelector(`[data-k="${k}"]`),icons={frag:fragIcon()};
  const ids=['claymore_zm','zombie_cymbal_monkey','zombie_black_hole_bomb','zombie_quantum_bomb'].filter(id=>data.equipment?.[id]);
  renderIcons(ids.map(id=>[id,data.equipment[id]])).then(o=>{Object.assign(icons,o);last='';});
  let last='';
  function set(k,icon,count){const s=slot(k);s.hidden=!icon;if(!icon)return;s.querySelector('i').style.backgroundImage=icons[icon]?`url(${icons[icon]})`:'';s.querySelector('b').textContent=count;s.classList.toggle('empty',!count);}
  host.on('update',()=>{
    const t=window.kino?.tactical,tac=t?.id&&t.count?[t.id,t.count]:session.monkeysOwned||session.monkeys>0?['zombie_cymbal_monkey',session.monkeys]:[null,0];
    const key=[session.grenades,...tac,session.claymoresOwned,session.claymores,Object.keys(icons).length].join();if(key===last)return;last=key;
    set('lethal','frag',session.grenades);set('tactical',tac[0],tac[1]);set('mine',session.claymoresOwned?'claymore_zm':null,session.claymores);
  });
}

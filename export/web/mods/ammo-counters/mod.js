// Thundergun ammo bulbs. In the original game the canister carries small red
// lights (FX on the model's tag_bulb1-8 bones), one per round in the
// magazine: two normally, four when upgraded (the model has no tag_bulb4, so
// only three show, as in the original). The export kept the bones but not
// the effects, so this adds a glowing sprite per bulb and lights them from the
// real magazine count.
import * as THREE from 'three';

export default async function setup(api){
  const {session,view}=api;
  if(!view||!api.data.weapons.thundergun_zm)return;

  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,235,220,1)');r.addColorStop(.25,'rgba(255,70,40,.95)');r.addColorStop(.6,'rgba(255,20,10,.35)');r.addColorStop(1,'rgba(255,0,0,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);
  const glow=new THREE.CanvasTexture(c);glow.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:glow,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});

  const OUT=new THREE.Vector3(-.9,0,0);
  let bulbs=[];   // [{slot, sprite}] on the current viewmodel, in firing order
  function attach(){
    bulbs=[];const gun=view.gun,def=view.def;
    if(!gun||(def?.baseId??def?.id)!=='thundergun_zm')return;
    for(let i=1;i<=8;i++){
      const bone=gun.getObjectByName('tag_bulb'+i);if(!bone)continue;
      const sprite=new THREE.Sprite(material);sprite.scale.setScalar(1.3);sprite.renderOrder=3;sprite.visible=false;
      // The bulb tags sit 0.15 behind the drum's face (the face is at x≈8.6
      // facing −X in gun space, tags at x=8.75), inside their windows, so the
      // glow was buried. Push it out along −X of the gun, in the tag's frame.
      sprite.position.copy(OUT).applyQuaternion(bone.quaternion.clone().invert());
      bone.add(sprite);bulbs.push({slot:i,sprite});
    }
  }
  const equip=view.equip.bind(view);
  view.equip=async(...args)=>{const result=await equip(...args);attach();return result;};
  attach();

  api.host.on('update',()=>{
    if(!bulbs.length)return;
    const mag=session.weapon?.mag??0,t=performance.now()/1000;
    // Bulb n lights while the magazine holds at least n rounds.
    for(const b of bulbs){b.sprite.visible=b.slot<=mag;b.sprite.material.opacity=.85+Math.sin(t*14+b.slot)*.15;}
  });
}

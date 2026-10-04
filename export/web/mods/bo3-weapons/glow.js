// Glow for the BO3 workshop-mod guns, shared by the game (mods/bo3-weapons/mod.js), the Gunsmith
// view and the menu previews (home.js), so they all look alike. The converter tags BO3's glow
// materials with extras.bo3glow (material.userData): {card} or {scroll, tint}.
import * as THREE from 'three';

// Glow cards (BO3 effect-only glow parts; the converter gives them a radial spot) are drawn additively
// with a hot white core fading through the gun's colour, plus a soft halo sprite on each small light
// (the viewmodel gets no bloom). Each light flickers on its own phase; all flare on a shot.
function glowTexture(color,core){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  const rgb=(a,mix)=>{const r=Math.round(255*(color.r+(1-color.r)*mix)),gg=Math.round(255*(color.g+(1-color.g)*mix)),b=Math.round(255*(color.b+(1-color.b)*mix));return `rgba(${r},${gg},${b},${a})`;};
  if(core){g.addColorStop(0,rgb(1,.9));g.addColorStop(.18,rgb(1,.45));g.addColorStop(.45,rgb(.7,0));g.addColorStop(1,rgb(0,0));}
  else{g.addColorStop(0,rgb(.55,.2));g.addColorStop(.3,rgb(.25,0));g.addColorStop(1,rgb(0,0));}
  x.fillStyle=g;x.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function buildGlow(gun,color,depthTest){
  const mats=[],lights=[],cardTex=glowTexture(color,true),haloTex=glowTexture(color,false);
  const v=new THREE.Vector3();gun.updateMatrixWorld(true);
  gun.traverse(o=>{
    if(!o.isMesh||!/glow|_ret|lens/i.test(o.material?.name??''))return;
    const bg=o.material.userData.bo3glow;
    if(bg&&!bg.card&&o.material.map){   // BO3's own glow image, scrolling (pulses/sparks travel along the part)
      const m=new THREE.MeshBasicMaterial({map:o.material.map,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
      m.name=o.material.name;o.material=m;lights.push({mat:m,phase:Math.random()*6.28,speed:1.5+Math.random()*2,scroll:bg.scroll,
        base:bg.tint?color.clone().lerp(new THREE.Color(1,1,1),.25):new THREE.Color(1,1,1)});
      return;}
    if(bg?.card){   // a glow card
      const m=new THREE.MeshBasicMaterial({map:cardTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
      m.name=o.material.name;o.material=m;lights.push({mat:m,phase:Math.random()*6.28,speed:2+Math.random()*3});
      // halos: cluster the card's vertices (skinned, world space) into lights and hang a sprite on each one's bone
      const pos=o.geometry.attributes.position,si=o.geometry.attributes.skinIndex;if(!o.isSkinnedMesh||!si||pos.count>400)return;
      const clusters=[];
      for(let i=0;i<pos.count;i++){o.getVertexPosition(i,v);o.localToWorld(v);
        let c=clusters.find(c=>c.c.distanceTo(v)<3);if(!c)clusters.push(c={c:v.clone(),sum:new THREE.Vector3(),n:0,box:new THREE.Box3(),bone:o.skeleton.bones[si.getX(i)]});
        c.sum.add(v);c.n++;c.box.expandByPoint(v);c.c.copy(c.sum).divideScalar(c.n);}
      for(const c of clusters.slice(0,16)){if(!c.bone)continue;
        const sm=new THREE.SpriteMaterial({map:haloTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest,toneMapped:false});
        const sp=new THREE.Sprite(sm),size=Math.max(1.6,c.box.getSize(new THREE.Vector3()).length()*1.8);
        sp.scale.setScalar(size);c.bone.updateMatrixWorld(true);sp.position.copy(c.bone.worldToLocal(c.c.clone()));sp.renderOrder=10;sp.frustumCulled=false;
        sp.scale.divide(c.bone.getWorldScale(new THREE.Vector3()));c.bone.add(sp);lights.push({mat:sm,phase:Math.random()*6.28,speed:2+Math.random()*3,halo:true});}
      return;}
    if(/_ret|lens/i.test(o.material.name)&&!/glow/i.test(o.material.name)){   // sight lens glass: a faint tint, not a lit panel
      o.material=new THREE.MeshBasicMaterial({map:o.material.map,color:color.clone().multiplyScalar(.12),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,toneMapped:false});return;}
    o.material=o.material.clone();o.material.emissive=color.clone();if(o.material.map)o.material.emissiveMap=o.material.map;else o.material.color.set(0x000000);mats.push(o.material);
  });
  return {mats,lights};
}
// Replace a gun's glow materials (once per model object; viewmodels are cached). color: the gun's
// def.glow. depthTest: halos hidden behind the gun (previews you can turn around); the first-person
// view draws them on top.
export function applyGlow(gun,color,{depthTest=false}={}){
  return gun.userData.bo3Glow??=buildGlow(gun,new THREE.Color(color??'#ffffff'),depthTest);
}
// Animate: per-light flicker, scrolling glow images, flare (0..1) on a shot.
export function tickGlow(glow,t,flash=0){
  if(!glow)return;
  const k=1.6+Math.sin(t*3)*.4+flash*2;for(const m of glow.mats)m.emissiveIntensity=k;
  for(const l of glow.lights){const f=.85+Math.sin(t*l.speed+l.phase)*.12+Math.sin(t*l.speed*3.7+l.phase*2)*.05+flash*(l.halo?1.2:.8);
    if(l.halo)l.mat.opacity=Math.min(1,f*.9);
    else if(l.base){l.mat.color.copy(l.base).multiplyScalar(f*1.5);if(l.scroll)l.mat.map.offset.set((t*l.scroll[0])%1,(t*l.scroll[1])%1);}
    else l.mat.color.setScalar(f*1.3);}
}

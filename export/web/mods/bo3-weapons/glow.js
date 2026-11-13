// Glow for the BO3 workshop-mod guns, shared by the game (mods/bo3-weapons/mod.js), the Gunsmith
// view and the menu previews (home.js), so they all look alike. The converter tags BO3's glow
// materials with extras.bo3glow (material.userData): {card} or {scroll, tint}.
import * as THREE from 'three';

// Glow cards (BO3 effect-only glow parts; the converter gives them a radial spot) are drawn additively
// in the gun's colour with a lighter (never white) core, plus a soft halo sprite per connected piece
// of card (one per lens-flare quad or bulb). The viewmodel is drawn inside the post chain since the
// grade rewrite, so it blooms: every level here stays near or under the bloom threshold (1.05) at rest
// and only a shot's flash pushes past it. Each light flickers on its own phase.
function glowTexture(color,core){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  const rgb=(a,mix)=>{const r=Math.round(255*(color.r+(1-color.r)*mix)),gg=Math.round(255*(color.g+(1-color.g)*mix)),b=Math.round(255*(color.b+(1-color.b)*mix));return `rgba(${r},${gg},${b},${a})`;};
  if(core){g.addColorStop(0,rgb(.9,.55));g.addColorStop(.2,rgb(.7,.25));g.addColorStop(.5,rgb(.35,0));g.addColorStop(1,rgb(0,0));}
  else{g.addColorStop(0,rgb(.42,.12));g.addColorStop(.35,rgb(.16,0));g.addColorStop(1,rgb(0,0));}
  x.fillStyle=g;x.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// Connected pieces of a card mesh (through its index): a lens-flare quad or a bulb is one piece, so it
// gets one halo at its centre instead of one per corner.
function pieces(geo){
  const pos=geo.attributes.position,n=pos.count,parent=Array.from({length:n},(_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
  const idx=geo.index;if(idx){for(let i=0;i+2<idx.count;i+=3){const a=idx.getX(i);join(a,idx.getX(i+1));join(a,idx.getX(i+2));}}
  else for(let i=0;i+2<n;i+=3){join(i,i+1);join(i,i+2);}
  const out=new Map();for(let i=0;i<n;i++){const r=find(i);let p=out.get(r);if(!p)out.set(r,p=[]);p.push(i);}
  return [...out.values()];
}
function buildGlow(gun,color,depthTest){
  const mats=[],lights=[],cardTex=glowTexture(color,true),haloTex=glowTexture(color,false);
  const v=new THREE.Vector3();gun.updateMatrixWorld(true);
  gun.traverse(o=>{
    // BO3's effect cards whose picture is not in the export (an 8 px white stand-in with alpha 0, drawn solid white: the
    // Der Eisendrache bows' mtl_wpn_t7_zmb_bow_no_e, a white arc beside the bow and a patch at the grip, user 2026-11-13)
    if(o.isMesh&&/_bow_no_e$/.test(o.material?.name??'')){o.visible=false;return;}
    if(!o.isMesh||!/glow|_ret|lens/i.test(o.material?.name??''))return;
    const bg=o.material.userData.bo3glow;
    if(bg&&!bg.card&&o.material.map){   // BO3's own glow image, scrolling (pulses/sparks travel along the part)
      const m=new THREE.MeshBasicMaterial({map:o.material.map,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
      m.name=o.material.name;o.material=m;lights.push({mat:m,phase:Math.random()*6.28,speed:1.5+Math.random()*2,scroll:bg.scroll,
        base:bg.tint?color.clone().lerp(new THREE.Color(1,1,1),.1):new THREE.Color(1,1,1)});
      return;}
    if(bg?.card){   // a glow card
      const m=new THREE.MeshBasicMaterial({map:cardTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
      m.name=o.material.name;o.material=m;lights.push({mat:m,phase:Math.random()*6.28,speed:2+Math.random()*3});
      // halos: one per connected piece of the card (skinned, world space), hung on the piece's bone
      const si=o.geometry.attributes.skinIndex;if(!o.isSkinnedMesh||!si||o.geometry.attributes.position.count>400)return;
      for(const piece of pieces(o.geometry).slice(0,12)){
        const c=new THREE.Vector3(),box=new THREE.Box3();
        for(const i of piece){o.getVertexPosition(i,v);o.localToWorld(v);c.add(v);box.expandByPoint(v);}
        c.divideScalar(piece.length);const bone=o.skeleton.bones[si.getX(piece[0])];if(!bone)continue;
        const sm=new THREE.SpriteMaterial({map:haloTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest,toneMapped:false});
        const sp=new THREE.Sprite(sm),size=Math.min(5,Math.max(1.2,box.getSize(new THREE.Vector3()).length()*.6));
        sp.scale.setScalar(size);bone.updateMatrixWorld(true);sp.position.copy(bone.worldToLocal(c.clone()));sp.renderOrder=10;sp.frustumCulled=false;
        sp.scale.divide(bone.getWorldScale(new THREE.Vector3()));bone.add(sp);lights.push({mat:sm,phase:Math.random()*6.28,speed:2+Math.random()*3,halo:true});}
      return;}
    // mounted sights' glass (mods/weapon-levels/mounts.js names it 'reflex_lens …'): leave it; the scopes mod finds it by name to centre the sight
    if(o.material.name.startsWith('reflex_lens'))return;
    if(!bg&&(/_ret|lens/i.test(o.material.name)&&!/glow/i.test(o.material.name)||/glass/i.test(o.material.name))){   // the gun's own sight glass (MR23: mtl_eot_tesla_glass_glow): a faint tint, not a lit panel you can't see through
      const m=new THREE.MeshBasicMaterial({map:o.material.map,color:color.clone().multiplyScalar(.12),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,toneMapped:false});
      m.name=o.material.name;o.material=m;return;}
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
// Animate: per-light flicker, scrolling glow images, flare (0..1) on a shot. aim (0..1, first person's
// view.aim): the lights dim while aiming down sights so they don't cover the sight picture: halos
// (drawn on top of everything) fade out completely, glow cards and scrolling glows keep a little.
export function tickGlow(glow,t,flash=0,{aim=0}={}){
  if(!glow)return;
  const a=Math.min(1,Math.max(0,aim)),halo=(1-a)*(1-a),card=1-.7*a,scroll=1-.6*a;
  const k=(1+Math.sin(t*3)*.2+flash*1.2)*(1-.4*a);for(const m of glow.mats)m.emissiveIntensity=k;
  for(const l of glow.lights){const f=.85+Math.sin(t*l.speed+l.phase)*.1+Math.sin(t*l.speed*3.7+l.phase*2)*.04+flash*(l.halo?.7:.5);
    if(l.halo)l.mat.opacity=Math.min(1,f*.6)*halo;
    else if(l.base){l.mat.color.copy(l.base).multiplyScalar(f*.9*scroll);if(l.scroll)l.mat.map.offset.set((t*l.scroll[0])%1,(t*l.scroll[1])%1);}
    else l.mat.color.setScalar(f*.8*card);}
}

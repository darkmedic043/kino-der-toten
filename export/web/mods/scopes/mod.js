// Scopes that work. The exported viewmodels kept their scope lenses opaque,
// so aiming a scoped gun meant staring at a black disc.
// - Every lens is now glass (see-through), and red dots and reflex dots glow.
// - Magnified optics (sniper scopes, the AUG's ACOG, the G11's LPS, and the
//   ACOG / IR attachments from the weapon-levels mod) switch to a full-screen
//   scope view once fully aimed, as in Black Ops: the gun is hidden, the world
//   is seen through a lens with that optic's reticle, the aim sways a little,
//   and holding Shift holds your breath to steady it.
// - Unmagnified sights (reflex, red dot) keep the gun on screen; while aiming,
//   the gun is shifted so the dot sits exactly on the screen centre.
// A weapon's optic is def.scope (set by weapon-levels for attachments) or the
// built-in one from BUILT_IN below.
import * as THREE from 'three';

const BUILT_IN={dragunov_zm:'pso',l96a1_zm:'duplex',g11_lps_zm:'lps',aug_acog_zm:'acog'};
const MAGNIFIED={vzoom:{zoom:16,radius:.46,sway:.9},pso:{zoom:15,radius:.46,sway:1},duplex:{zoom:15,radius:.46,sway:1},lps:{zoom:26,radius:.44,sway:.45},acog:{zoom:30,radius:.4,sway:.35},ir:{zoom:28,radius:.42,sway:.4}};
// dot cards only; mtl_t5_aimpoint_red_dot is the whole Aimpoint sight body, not a card
const DOTS=/reflex_red_dot|scope_pka_crosshair/;
const GLASS=/lens(?!_interior)|reflex_lens/;

export default async function setup(api){
  const {host,view,data,session,camera,renderer,enemies}=api;
  if(!view)return;
  // Built-in magnified scopes zoom like a scope, not like iron sights.
  for(const [id,kind] of Object.entries(BUILT_IN)){const d=data.weapons[id];if(!d)continue;d.adsFov=MAGNIFIED[kind].zoom;if(d.upgrade)d.upgrade.adsFov=MAGNIFIED[kind].zoom;}
  const scopeOf=def=>def?.scope??BUILT_IN[def?.baseId??def?.id?.replace(/_upgraded/,'')];

  // ---- glass and glowing dots, patched on every equipped viewmodel ---------
  const patched=new WeakSet();
  function glass(root){
    root?.traverse(o=>{if(!o.isMesh)return;
      // dot cards are hidden per mesh: materials are shared between copies of a model,
      // so a material-level 'already done' check would skip later copies
      if([o.material].flat().some(m=>DOTS.test(m?.name??''))){o.visible=false;return;}
      for(const m of [o.material].flat()){if(!m||patched.has(m))continue;patched.add(m);const n=m.name??'';
      // the model's dot cards have mixed backgrounds (some glow as blobs): hide
      // them; a clean dot is drawn at the screen centre while aiming instead
      if(DOTS.test(n)){o.visible=false;}
      else if(GLASS.test(n)){Object.assign(m,{transparent:true,depthWrite:false,opacity:.1,roughness:.05,metalness:0});o.renderOrder=2;m.needsUpdate=true;}}});
  }
  const equip=view.equip.bind(view);
  view.equip=async(...args)=>{const r=await equip(...args);glass(view.gun);align.key=null;return r;};
  glass(view.gun);

  // ---- full-screen scope view --------------------------------------------
  const overlay=document.createElement('div');overlay.id='scope-overlay';
  overlay.style.cssText='position:fixed;inset:0;pointer-events:none;display:none;z-index:2';
  const cv=document.createElement('canvas');cv.style.cssText='width:100%;height:100%;display:block';overlay.append(cv);
  document.body.append(overlay);
  let drawn='';
  function draw(kind){
    const W=cv.width=innerWidth*devicePixelRatio,H=cv.height=innerHeight*devicePixelRatio,g=cv.getContext('2d');
    const cx=W/2,cy=H/2,R=Math.min(W,H)*MAGNIFIED[kind].radius,px=Math.max(1,devicePixelRatio);
    // black housing with a round window, soft at the rim, darker toward the edge of the lens
    g.fillStyle='#000';g.fillRect(0,0,W,H);
    g.globalCompositeOperation='destination-out';
    const hole=g.createRadialGradient(cx,cy,R*.9,cx,cy,R);hole.addColorStop(0,'rgba(0,0,0,1)');hole.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=hole;g.beginPath();g.arc(cx,cy,R,0,7);g.fill();
    g.globalCompositeOperation='source-over';
    const vig=g.createRadialGradient(cx,cy,R*.55,cx,cy,R);vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(0,0,0,.55)');
    g.fillStyle=vig;g.beginPath();g.arc(cx,cy,R,0,7);g.fill();
    // lens tint and a faint reflection
    g.fillStyle=kind==='ir'?'rgba(40,255,120,.08)':'rgba(120,160,255,.04)';g.beginPath();g.arc(cx,cy,R,0,7);g.fill();
    const refl=g.createRadialGradient(cx-R*.35,cy-R*.4,0,cx-R*.35,cy-R*.4,R*.6);refl.addColorStop(0,'rgba(255,255,255,.05)');refl.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=refl;g.beginPath();g.arc(cx,cy,R,0,7);g.fill();
    // dark reticle lines get a faint light halo so they read against dark rooms
    const stroke=(x0,y0,x1,y1,w,c)=>{g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();};
    const line=(x0,y0,x1,y1,w,c)=>{if(c.startsWith('rgba(8'))stroke(x0,y0,x1,y1,w+2.2*px,'rgba(220,225,230,.22)');stroke(x0,y0,x1,y1,w,c);};
    const ink='rgba(8,8,8,.92)';
    if(kind==='vzoom'){
      // mil-dot duplex with the current magnification
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){line(cx+dx*R,cy+dy*R,cx+dx*R*.35,cy+dy*R*.35,5*px,ink);line(cx+dx*R*.35,cy+dy*R*.35,cx,cy,1.3*px,ink);
        for(let i=1;i<=4;i++){g.fillStyle=ink;g.beginPath();g.arc(cx+dx*R*.075*i,cy+dy*R*.075*i,2*px,0,7);g.fill();}}
      g.fillStyle='rgba(235,240,245,.8)';g.font=`${13*px}px monospace`;g.fillText(`${ZOOMS[zoomAt].x}×  ▲▼ WHEEL`,cx+R*.18,cy+R*.62);
    }else if(kind==='duplex'){
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){line(cx+dx*R,cy+dy*R,cx+dx*R*.3,cy+dy*R*.3,6*px,ink);line(cx+dx*R*.3,cy+dy*R*.3,cx,cy,1.4*px,ink);}
    }else if(kind==='pso'){
      // PSO-1: glowing main chevron, three below for range, windage scale, rangefinder curve
      line(cx-R,cy,cx-R*.12,cy,1.4*px,ink);line(cx+R*.12,cy,cx+R,cy,1.4*px,ink);
      for(let i=1;i<=10;i++){const x=R*.12+i*R*.08;line(cx-x,cy,cx-x,cy+(i%5?R*.03:R*.06),1.2*px,ink);line(cx+x,cy,cx+x,cy+(i%5?R*.03:R*.06),1.2*px,ink);}
      g.shadowColor='#ff5a1a';g.shadowBlur=8*px;
      const chev=(y,s)=>{g.strokeStyle='#ff5a28';g.lineWidth=2*px;g.beginPath();g.moveTo(cx-s,y+s*1.2);g.lineTo(cx,y);g.lineTo(cx+s,y+s*1.2);g.stroke();};
      chev(cy,R*.05);for(let i=1;i<=3;i++)chev(cy+R*.12*i,R*.028);
      g.shadowBlur=0;
      g.strokeStyle=ink;g.lineWidth=1.2*px;g.beginPath();for(let i=0;i<=20;i++){const t=i/20,x=cx-R*.75+t*R*.35,y=cy+R*.55-R*.15*Math.sqrt(t);i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
      line(cx-R*.75,cy+R*.55,cx-R*.4,cy+R*.55,1.2*px,ink);
    }else if(kind==='acog'){
      line(cx-R,cy,cx-R*.35,cy,1.2*px,ink);line(cx+R*.35,cy,cx+R,cy,1.2*px,ink);line(cx,cy+R*.3,cx,cy+R,1.2*px,ink);
      for(let i=1;i<=4;i++){const y=cy+R*.07*i+R*.05,w=R*(.06-.01*i);line(cx-w,y,cx+w,y,1.2*px,ink);}
      g.shadowColor='#ff3018';g.shadowBlur=10*px;g.fillStyle='#ff3a20';
      g.beginPath();g.moveTo(cx,cy);g.lineTo(cx-R*.045,cy+R*.06);g.lineTo(cx-R*.03,cy+R*.06);g.lineTo(cx,cy+R*.02);g.lineTo(cx+R*.03,cy+R*.06);g.lineTo(cx+R*.045,cy+R*.06);g.closePath();g.fill();
      g.shadowBlur=0;
    }else if(kind==='lps'){
      line(cx-R,cy,cx+R,cy,1.2*px,ink);line(cx,cy-R,cx,cy+R,1.2*px,ink);
      g.strokeStyle=ink;g.lineWidth=1.2*px;g.beginPath();g.arc(cx,cy,R*.12,0,7);g.stroke();
      for(let i=1;i<=4;i++){for(const s of [-1,1]){g.fillStyle=ink;g.beginPath();g.arc(cx+s*R*(.12+i*.14),cy,2.2*px,0,7);g.fill();g.beginPath();g.arc(cx,cy+s*R*(.12+i*.14),2.2*px,0,7);g.fill();}}
    }else if(kind==='ir'){
      const w='rgba(230,255,235,.85)';
      line(cx-R,cy,cx-R*.06,cy,1.2*px,w);line(cx+R*.06,cy,cx+R,cy,1.2*px,w);line(cx,cy+R*.06,cx,cy+R,1.2*px,w);line(cx,cy-R*.06,cx,cy-R,1.2*px,w);
      g.fillStyle=w;g.font=`${12*px}px monospace`;g.fillText('IR  WHT-HOT',cx-R*.6,cy-R*.72);
    }
    drawn=kind+W+'x'+H+(kind==='vzoom'?zoomAt:'');
  }

  // ---- thermal look for the IR scope ----------------------------------------
  const hot=new Map();
  function thermal(on){
    renderer.domElement.style.filter=on?'grayscale(1) contrast(1.55) brightness(1.25)':'';
    if(on){for(const z of enemies?.list??[])z.root?.traverse(o=>{if(!o.isMesh)return;for(const m of [o.material].flat())if(m?.emissive&&!hot.has(m)){hot.set(m,[m.emissive.clone(),m.emissiveIntensity]);m.emissive.set('#ffffff');m.emissiveIntensity=1.6;}});}
    else{for(const [m,[c,i]] of hot){m.emissive.copy(c);m.emissiveIntensity=i;}hot.clear();}
  }

  // ---- variable zoom: the wheel steps magnification while scoped ------------
  const ZOOMS=[{x:4,fov:24},{x:6,fov:16},{x:8,fov:12},{x:10,fov:9}];let zoomAt=1;
  function setZoom(i){
    zoomAt=Math.max(0,Math.min(ZOOMS.length-1,i));const id=session.weapon?.id,d=data.weapons[id];if(!d)return;
    d.adsFov=ZOOMS[zoomAt].fov;if(d.upgrade)d.upgrade.adsFov=ZOOMS[zoomAt].fov;
  }
  // capture phase on window, before the game's wheel = switch weapon
  addEventListener('wheel',e=>{if(!scoped||scopeOf(session.def)!=='vzoom')return;e.stopImmediatePropagation();e.preventDefault();setZoom(zoomAt+(e.deltaY<0?1:-1));},{capture:true,passive:false});

  // ---- sway and holding breath ---------------------------------------------
  let shift=false,breath=3,gasp=0,t=0,sx=0,sy=0;
  addEventListener('keydown',e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')shift=true;});
  addEventListener('keyup',e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')shift=false;});

  // ---- sight alignment for reflex / red dot sights -------------------------
  const align={key:null,offset:new THREE.Vector3(),applied:new THREE.Vector3()};
  const v=new THREE.Vector3();
  function measure(){
    // centroid of the visible dot / lens vertices, skinned, in view space
    const sum=new THREE.Vector3();let n=0;
    // view.update moves the pivot but only refreshes the gun below it: recompute the pivot too, or the measure
    // sees last frame's alignment offset (and the continuous re-measure settles halfway)
    view.pivot.updateMatrixWorld(true);
    // Every optic is in the mesh; hidden ones are collapsed onto a bone scaled
    // to ~0. Only measure sights whose bone chain is actually shown.
    const shown=o=>{if(!o.isSkinnedMesh)return true;const g=o.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;if(!si||!sw)return true;
      const i=g.index?g.index.getX(0):0;let best=0,bw=-1;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>bw){bw=w;best=si.getComponent(i,k);}}
      for(let b=o.skeleton.bones[best];b;b=b.parent)if(b.isBone&&b.scale.x<1e-3)return false;return true;};
    view.gun.traverse(o=>{if(!o.isMesh||!o.visible)return;const m=[o.material].flat()[0];if(!(DOTS.test(m?.name)||/reflex_lens|scope_pka_lens|aimpoint_red_dot/.test(m?.name))||!shown(o))return;
      // surfaces share one vertex buffer; only the indexed vertices are this mesh's
      const P=o.geometry.attributes.position,I=o.geometry.index,count=I?I.count:P.count,step=Math.max(1,Math.floor(count/60));
      for(let k=0;k<count;k+=step){const i=I?I.getX(k):k;v.fromBufferAttribute(P,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,v);o.localToWorld(v);
        if(v.lengthSq()<1e-6||Math.abs(v.x)>50)continue;sum.add(v);n++;}});
    if(!n)return null;
    sum.divideScalar(n).sub(align.applied);
    // centre the dot, and keep the sight window at arm's length rather than around the eye
    const depth=-sum.z,want=9;
    return new THREE.Vector3(-sum.x,-sum.y,depth<want?-(want-depth):0);
  }

  const dot=document.createElement('div');dot.id='reflex-dot';
  dot.style.cssText='position:fixed;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#ff4a2a;box-shadow:0 0 6px 2px #ff2a10aa;pointer-events:none;display:none;z-index:2';
  document.body.append(dot);
  let scoped=false,prevSway=[0,0],dotOn=false;
  host.on('update',dt=>{
    const def=session.def,kind=scopeOf(def),aim=view.aim??0;t+=dt;
    // sights: centre the dot while aiming
    align.applied.set(0,0,0);
    if(kind&&!MAGNIFIED[kind]&&view.gun&&view.pivot){
      const key=def.id+(def.attachments??'');
      // re-measured while aiming (the ADS pose and mounted parts are still settling when aim first passes .97,
      // so a one-off measurement could leave the dot well off the sight); eased so it doesn't jitter
      if(aim>.6){const off=measure();if(off){if(align.key!==key){align.offset.copy(off);align.key=key;}else align.offset.lerp(off,1-Math.exp(-dt*10));}}
      if(align.key===key){align.applied.copy(align.offset).multiplyScalar(aim);view.pivot.position.add(align.applied);view.root?.updateMatrixWorld(true);}
    }
    const wantDot=!!(kind&&!MAGNIFIED[kind]&&aim>.85&&!session.reloadLeft);
    if(wantDot!==dotOn){dotOn=wantDot;dot.style.display=wantDot?'block':'none';const ch=document.getElementById('crosshair');if(ch&&!scoped)ch.style.visibility=wantDot?'hidden':'';}
    // magnified: full-screen scope once fully aimed
    const want=!!(kind&&MAGNIFIED[kind]&&aim>.92&&session.weapon&&!session.reloadLeft);
    if(want!==scoped){scoped=want;overlay.style.display=want?'block':'none';host.hideViewmodel=want;
      const ch=document.getElementById('crosshair');if(ch)ch.style.visibility=want?'hidden':'';thermal(want&&kind==='ir');if(!want){breath=Math.min(breath,3);}}
    if(scoped&&drawn!==kind+(innerWidth*devicePixelRatio)+'x'+(innerHeight*devicePixelRatio)+(kind==='vzoom'?zoomAt:''))draw(kind);
    // sway (and breath) moves the actual aim, so undo last frame's offset first
    camera.rotation.y-=prevSway[0];camera.rotation.x-=prevSway[1];prevSway=[0,0];
    if(scoped){
      let amp=.0032*MAGNIFIED[kind].sway;
      if(gasp>0){gasp-=dt;amp*=2.2;}
      else if(shift&&breath>0){breath-=dt;amp*=.08;if(breath<=0)gasp=1.6;}
      else breath=Math.min(3,breath+dt*.6);
      sx=Math.sin(t*.9)*amp+Math.sin(t*2.3)*amp*.35;sy=Math.sin(t*1.3+1)*amp*.8+Math.cos(t*.7)*amp*.3;
      camera.rotation.y+=sx;camera.rotation.x+=sy;prevSway=[sx,sy];
    }
  });
  window.kino.scopes={scopeOf,get scoped(){return scoped;},align,measure,view};
}

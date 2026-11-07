// Weapon charms (2026-11-06): the catalogue, who owns what, the charm models, where a charm hangs on a gun and the swing.
// Shared by the game (mod.js, first person) and the Gunsmith preview (weapon-levels/gunsmith-view.js).
//
// A charm is a model the user supplies (GLB under mods/charms/models/, listed in charms.json). It is normalised once:
// its longest side becomes `size` inches, its hang point (`hang`, model units; default the top centre of its bounds)
// goes to the origin, so the body hangs down -Y with its front +Z (Blender's -Y front, glTF +Z). The rig hangs it from a
// small ring on the gun's left side (the side the player sees) by a short chain of links, and swings it with a two-point
// verlet (chain end + the body's centre) under gravity, the gun's motion and, in game, the camera's turning.
//
// Gun screens (a kill counter, a buddy, an ammo readout, animated art) are screens.js: a housing mounted flat on the gun's
// left side, its own slot per gun (state.screen) next to the charm.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

const KEY='kino.mods.charms';
let catalogue=null;
export function loadCharms(){
  return catalogue??=fetch(new URL('./charms.json',import.meta.url)).then(r=>r.json())
    .then(c=>{c.charms??=[];c.anchors??={};c.screens??=[];c.housings??={};c.screenMounts??={};return c;}).catch(()=>({charms:[],anchors:{},screens:[],housings:{},screenMounts:{}}));
}
// {on:{[gun base id]:charm id}, screen:{[gun base id]:screen id}} (gun screens: screens.js)
export function loadCharmState(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');s.on??={};s.screen??={};return s;}catch{return {on:{},screen:{}};}}
export function saveCharmState(s){localStorage.setItem(KEY,JSON.stringify(s));}

const devSoon=()=>{try{return localStorage.getItem('kino.dev.soon')==='1';}catch{return false;}};
const shopOwned=k=>{try{const o=JSON.parse(localStorage.getItem('kino.mods.shop')||'{}')?.owned;return Array.isArray(o)?o.includes(k):!!o?.[k];}catch{return false;}};
// soon = built but not out (the dev flag lifts it); unlock = a shop key (a Melon Pass reward); otherwise free
export function charmOwned(c){if(!c)return false;if(c.soon&&!devSoon())return false;return !c.unlock||devSoon()||shopOwned(c.unlock);}
export function charmLock(c){return !c||charmOwned(c)?'':c.soon?'SOON':c.pass?'PASS':'LOCKED';}
export function charmFor(cat,state,gunId){const c=cat?.charms.find(x=>x.id===state?.on?.[gunId]);return c&&charmOwned(c)?c:null;}

// ---- models -------------------------------------------------------------------------------------------------------------
const templates=new Map(),box=new THREE.Box3(),v=new THREE.Vector3(),v2=new THREE.Vector3();
// A normalised charm body: {object, com (inches below the hang point), depth (half thickness, inches)}
export function charmModel(c){
  if(!c?.model)return Promise.resolve(null);
  if(!templates.has(c.id))templates.set(c.id,loadModel(new URL(c.model,import.meta.url).href).then(m=>{
    if(!m)return null;m.updateMatrixWorld(true);box.setFromObject(m);box.getSize(v);
    const s=(c.size??1.3)/Math.max(v.x,v.y,v.z,1e-6),hang=c.hang?v2.fromArray(c.hang):v2.set((box.min.x+box.max.x)/2,box.max.y,(box.min.z+box.max.z)/2);
    m.position.sub(hang);const object=new THREE.Group();object.add(m);object.scale.setScalar(s);
    object.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=false;o.frustumCulled=false;}});
    return {object,com:(hang.y-(box.min.y+box.max.y)/2)*s,depth:v.z*s/2,width:v.x*s/2};
  }).catch(e=>{console.warn('[charms] model',c.id,e);return null;}));
  return templates.get(c.id).then(t=>t&&{...t,object:t.object.clone()});
}

// how far a charm reaches below its ring and how wide it is (inches), for gunAnchor's drop/width
// a gun model's units in inches: BO1 viewmodels are in inches, the BO3/AW imports (Greyhound exports) in centimetres;
// def.charmUnit overrides it. Charms are sized in inches, so the rig and the hang search scale by this.
export const charmUnit=def=>def?.charmUnit??(def?.bo3?2.54:1);
export const charmReach=(body,c={})=>({drop:.25+(c.chain??.42)+2*Math.max(.05,body?.com??1),width:body?.width??.3});

// the chain: oval links and the ring on the gun, one shared geometry and material
let linkGeo=null,ringGeo=null,metal=null;
const parts=()=>{
  linkGeo??=new THREE.TorusGeometry(.085,.02,6,12).scale(1,1.55,1);
  ringGeo??=new THREE.TorusGeometry(.11,.026,6,14);
  metal??=new THREE.MeshStandardMaterial({color:0xb8b8b8,metalness:.85,roughness:.35,name:'charm_chain'});
};

// ---- where it hangs -----------------------------------------------------------------------------------------------------
// In the gun's root bone space (BO1: inches, x forward, y left = the side the camera sees, z up), from the visible
// vertices at the current pose: just above the grip (a little forward of j_gun, the hand), just under the bore, on the
// outer surface. side = the gun's widest point below it, which the charm is kept outside of. Cached per model and shown
// attachments. charms.json anchors[gun id] = [x,y,z] (or {at:[x,y,z],side:y}) where the automatic spot looks wrong.
const anchors=new Map(),inv=new THREE.Matrix4(),_m=new THREE.Matrix4(),_c=new THREE.Vector3();
export const LOOSE=/clip|mag|ammo|shell|bullet|round|speedloader|loader|belt|cartridge|grenade|rocket|arrow|bolt_?release_?no/i,
  // small parts that snap on every shot (a charm on them would jerk), and no room to hang from them anyway
  FIDGET=/hammer|trigger|safety|sear|firing_?pin|ejector|selector|lever|button|latch/i;
// visible vertices of `obj` (skipping the subtree `skip`) in the space of inv, as a flat [x,y,z,...] list: a vertex counts
// when its mesh and the mesh's ancestors are visible and neither its dominant bone nor any ancestor is scaled to nothing
// (BO1 hides attachments that way; their vertices collapse far off)
export function visiblePoints(obj,skip,stop,bones=null,unit=1,space=inv){   // space: world -> the frame the points come out in (the root bone's inverse world matrix)
  const pts=[],done=new Map(),dead=b=>{for(let p=b;p&&p!==stop;p=p.parent)if(p.isBone&&p.scale.x<1e-3)return true;return false;};
  const shown=o=>{for(let p=o;p&&p!==stop;p=p.parent)if(!p.visible||p.userData.charm||p===skip)return false;return !dead(o);};
  obj.traverse(o=>{
    if(!o.isMesh||!shown(o))return;
    const g=o.geometry,pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;if(!pos)return;
    // BO1 surfaces share one vertex buffer: read this surface's own vertices through its index (each vertex once)
    let ids;if(g.index){const seen=done.get(pos)??new Set();done.set(pos,seen);const st=g.drawRange.start,end=Math.min(g.index.count,st+(Number.isFinite(g.drawRange.count)?g.drawRange.count:g.index.count));
      ids=[];for(let k=st;k<end;k++){const i=g.index.getX(k);if(!seen.has(i)){seen.add(i);ids.push(i);}}}
    else ids=Array.from({length:pos.count},(_,i)=>i);
    let owner=null;if(bones){for(let p=o.parent;p&&p!==stop;p=p.parent)if(p.isBone){owner=p;break;}}   // an unskinned part: the bone it rides on
    const boneOk=new Map(),step=Math.max(1,Math.floor(ids.length/4000));
    for(let k=0;k<ids.length;k+=step){const i=ids[k];
      if(o.isSkinnedMesh&&si&&sw){let best=0,bw=-1;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>bw){bw=w;best=si.getComponent(i,k);}}
        if(!boneOk.has(best))boneOk.set(best,!dead(o.skeleton.bones[best]));if(!boneOk.get(best))continue;if(bones)owner=o.skeleton.bones[best];}
      o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld).applyMatrix4(space);
      if(Number.isFinite(v.x+v.y+v.z)&&Math.abs(v.x)<60*unit&&Math.abs(v.y)<30*unit&&Math.abs(v.z)<30*unit){pts.push(v.x/unit,v.y/unit,v.z/unit);bones?.push(owner);}   // (the SPAS parks its spare shells 127 in behind)
    }
  });
  return pts;
}
export const pct=(pts,axis,q)=>{const a=[];for(let i=axis;i<pts.length;i+=3)a.push(pts[i]);a.sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(a.length*q))];};
// In the gun's root bone space (BO1: inches, x forward, y left = the side the camera sees, z up), from the visible
// vertices at the current pose. The ring goes on a real point of the gun's outer surface on the visible side (it never
// floats beside the gun): a point with nothing wider below it along the charm's drop, so the charm hangs straight down past
// the gun. Spots are scored: a hand in the way, off screen, low under the bore (less visible), far from the preferred spot
// (a little forward of the hand). side = the gun's widest point below the ring, which the charm is kept outside of. Cached
// per gun model, hands and shown attachments. charms.json anchors[gun id] = [x,y,z] (or {at:[x,y,z],side:y}) where the
// automatic spot looks wrong. drop: how far the chain and charm reach below the ring (inches); width: the charm's half
// width; unit: the gun model's units in inches (charmUnit; anchors overrides are in the model's own units); hands: the arms model the gun is held in (the gun is under it); camera: the view camera.
export function gunAnchor(gun,root,{key,override,hands,camera,drop=2.6,width=.3,unit=1}={}){
  if(override){const at=Array.isArray(override)?override:override.at;return {at:new THREE.Vector3().fromArray(at),side:override.side??at[1]};}
  const fullKey=key+'|'+(hands?.name??'')+'|'+drop.toFixed(1)+'|'+unit+'|'+(()=>{const h=[];gun.traverse(b=>{if(b.isBone&&b.scale.x<1e-3)h.push(b.name);});return h.join(',');})();
  if(anchors.has(fullKey))return anchors.get(fullKey);
  inv.copy(root.matrixWorld).invert();
  const pb=[],pts=visiblePoints(gun,null,gun.parent,pb,unit);if(pts.length<9)return null;
  const hp=hands?visiblePoints(hands,gun,hands.parent,null,unit):[];
  const xmin=pct(pts,0,.01),xmax=pct(pts,0,.99),L=xmax-xmin,lo=xmin+.12*L,hi=xmax-.3*L;
  // parts that leave the gun in a reload (a mag, shells, a speedloader) are never hung from
  const loose=new Map(),isLoose=b=>{if(!b)return false;if(!loose.has(b)){let l=false;for(let p=b;p&&p!==root&&p!==gun;p=p.parent)if(LOOSE.test(p.name)||FIDGET.test(p.name))l=true;loose.set(b,l);}return loose.get(b);};
  const flash=gun.getObjectByName('tag_flash');let top=null;
  if(flash){let ok=true;for(let p=flash;p&&p!==gun.parent;p=p.parent)if(p.scale.x<1e-3)ok=false;if(ok)top=flash.getWorldPosition(v).applyMatrix4(inv).z/unit;}
  top??=pct(pts,2,.85);
  // hand vertices in the way: near this x, from the ring down to the bottom of the charm, on the visible side
  const handsAt=(x,y,z)=>{let n=0;for(let i=0;i<hp.length;i+=3)if(Math.abs(hp[i]-x)<1.3&&hp[i+2]<z+.5&&hp[i+2]>z-drop&&hp[i+1]>y-1.2)n++;return n;};
  const fw=Math.max(.35,width+.12),x0=THREE.MathUtils.clamp(.1*L+1,lo,hi);let best=null;
  for(let cx=lo;cx<=hi+1e-6;cx+=.5){
    // the column the charm drops through (F) and the surface points to hang from (S: the outermost vertex every .15 in of height)
    const F=[],S=new Map();let y0=1e9,y1=-1e9;
    for(let i=0;i<pts.length;i+=3){const dx=Math.abs(pts[i]-cx);if(dx>=fw)continue;F.push(pts[i+1],pts[i+2]);
      if(dx<.3){y0=Math.min(y0,pts[i+1]);y1=Math.max(y1,pts[i+1]);if(pts[i+2]<top+.6){const k=Math.round(pts[i+2]/.15),o=S.get(k);if(!o||pts[i+1]>o[0])S.set(k,[pts[i+1],pts[i+2],pb[i/3]]);}}}
    const ySide=(y0+y1)/2+(y1-y0)*.15;   // the visible half (a point under the middle of the gun hangs the charm out of sight)
    for(const [y,z,bone] of S.values()){
      if(y<ySide||isLoose(bone))continue;
      let below=-1e9;for(let i=0;i<F.length;i+=2)if(F[i+1]<z-.05&&F[i+1]>z-drop&&F[i]>below)below=F[i];
      const lean=Math.max(0,below-y-.04);if(lean>.8)continue;   // something sticks out much further below: the charm would lie on it
      let off=0;if(camera){_c.set(cx,y,z-drop*.6).multiplyScalar(unit).applyMatrix4(root.matrixWorld).project(camera);off=_c.z>1||Math.abs(_c.x)>.92||_c.y<-.88?6:0;}
      const h=hp.length?handsAt(cx,y,z):0;
      // a moving part (a slide, a bolt) only when it's clearly the better spot; hammers and triggers are never used (FIDGET)
      const cost=(h?4+Math.min(4,h/40):0)+off+3*lean+.45*Math.max(0,top-.4-z)+.25*Math.abs(cx-x0)+(bone&&bone!==root?1:0);
      if(!best||cost<best.cost)best={cost,x:cx,y,z,side:Math.max(below,y-.3),bone};
    }
  }
  if(!best){const z=top-.4;best={x:x0,y:pct(pts,1,.99),z,side:pct(pts,1,.99)};}
  const a={at:new THREE.Vector3(best.x,best.y-.02,best.z).multiplyScalar(unit),side:best.side*unit};   // the ring sinks a hair into the surface
  // a moving part (a revolver's swing-out frame, a slide, a bolt): the ring rides on its bone, in that bone's own space
  if(best.bone&&best.bone!==root){a.bone=best.bone.name;_m.copy(best.bone.matrixWorld).invert();
    a.local=a.at.clone().applyMatrix4(root.matrixWorld).applyMatrix4(_m);   // and the gun's side and forward in that bone's frame:
    a.n=new THREE.Vector3().setFromMatrixColumn(root.matrixWorld,1).transformDirection(_m);   // they turn only when the part turns
    a.f=new THREE.Vector3().setFromMatrixColumn(root.matrixWorld,0).transformDirection(_m);}
  anchors.set(fullKey,a);return a;
}

// ---- the rig --------------------------------------------------------------------------------------------------------------
// One charm on one gun. The meshes live in `group` (put it under an identity-matrix parent: the view scene, the Gunsmith's
// scene); their matrices are written in that space each step. step() wants the gun's root bone with a fresh matrixWorld.
const STEP=1/120,COSMAX=Math.cos(1.85),SINMAX=Math.sin(1.85);   // a link swings at most ~105° from hanging straight down
const _w=new THREE.Vector3(),_l=new THREE.Vector3();
function limit(o,p,len,g,n){_l.copy(p).sub(o);const d=_l.length();if(d<1e-9)return;_l.divideScalar(d);const c=_l.dot(g);if(c>=COSMAX)return;
  _w.copy(_l).addScaledVector(g,-c);if(_w.lengthSq()<1e-9)_w.copy(n);_w.normalize();p.copy(o).addScaledVector(g,COSMAX*len).addScaledVector(_w,SINMAX*len);}
export class CharmRig{
  constructor(body,c={}){
    parts();this.body=body;this.c=c;
    this.group=new THREE.Group();this.group.matrixAutoUpdate=false;this.group.userData.charm=true;
    this.ring=new THREE.Mesh(ringGeo,metal);this.links=[];
    for(let i=0;i<(c.links??2);i++)this.links.push(new THREE.Mesh(linkGeo,metal));
    for(const m of [this.ring,...this.links,body.object]){m.matrixAutoUpdate=false;this.group.add(m);}
    this.chain=c.chain??.42;   // inches, ring to the charm's loop
    this.p1=new THREE.Vector3();this.q1=new THREE.Vector3();this.p2=new THREE.Vector3();this.q2=new THREE.Vector3();
    this.fresh=true;this.acc=0;this.anchor=null;this.prevA=new THREE.Vector3();
    this.r1=new THREE.Vector3();this.r2=new THREE.Vector3();this.s1=new THREE.Vector3();this.s2=new THREE.Vector3();this.smoothed=false;this.push=[0,1,2,3].map(()=>new THREE.Vector3());   // drawn points; camera shift still to apply
  }
  reset(){this.fresh=true;}
  dispose(){this.group.removeFromParent();}
  // opts: root (bone), anchor ({at,side}), gravity (unit vector in the rig's space), moved (Matrix4: how a fixed point in
  // the rig's space moved this frame, e.g. the camera's turn; optional), follow (how much of `moved` the charm takes)
  step(dt,{root,anchor,gravity,moved=null,follow=.25,gravityScale=1,bone=null,unit=1}){
    if(!root||!anchor)return;
    const M=root.matrixWorld,sR=_s.setFromMatrixScale(M).x,s=sR*unit,B=bone&&anchor.local?bone.matrixWorld:null;
    const n=B?_n.copy(anchor.n).transformDirection(B):_n.setFromMatrixColumn(M,1).normalize(),fwd=B?_f.copy(anchor.f).transformDirection(B):_f.setFromMatrixColumn(M,0).normalize();
    // the point on the gun (on a moving part's bone when it has one), then A: the bottom of the ring, out of the gun's side
    const base=B?_b.copy(anchor.local).applyMatrix4(B):_b.copy(anchor.at).applyMatrix4(M),A=_a.copy(base).addScaledVector(n,.12*s);   // A: the bottom of the ring, which stands out of the gun's side
    const L1=this.chain*s,L2=Math.max(.05,this.body.com)*s;
    if(this.fresh||!(dt>0&&dt<.25)||_t.copy(this.p1).sub(A).length()>L1*6+1e-6){
      this.p1.copy(A).addScaledVector(gravity,L1);this.q1.copy(this.p1);this.p2.copy(this.p1).addScaledVector(gravity,L2);this.q2.copy(this.p2);
      this.fresh=false;this.acc=0;this.smoothed=false;this.prevA.copy(A);for(const v of this.push)v.set(0,0,0);
    }else{
      // the gun's own motion (aiming down sights, recoil, sway, the raise): the charm is carried with most of it rigidly
      // (p and q both, so no speed is added) and only the rest swings it (user: "doesnt absurdly fling around when ADSing")
      _u.copy(A).sub(this.prevA).multiplyScalar(this.c.carry??.8);this.prevA.copy(A);
      for(const p of [this.p1,this.q1,this.p2,this.q2])p.add(_u);
      if(moved){_R.extractRotation(moved);_t.setFromMatrixPosition(moved);
        // a world-fixed point moves by `moved`; the charm takes `follow` of that (air drag), at most a third of its chain a frame
        // (spread over this frame's physics steps below: applied in one lump, a strafe pressing it on the gun made it shake)
        const pts=[this.p1,this.q1,this.p2,this.q2];for(let i=0;i<4;i++){const p=pts[i];_u.copy(p).applyMatrix4(_R).sub(p).multiplyScalar(follow).addScaledVector(_t,follow*.3);const l=_u.length(),mx=L1*.5;if(l>mx)_u.multiplyScalar(mx/l);this.push[i].add(_u);const pl=this.push[i].length();if(pl>L1)this.push[i].multiplyScalar(L1/pl);}}
      this.acc=Math.min(this.acc+dt,STEP*4);
      // the side plane: a point on the gun's widest surface below the ring, normal = the gun's left (+y)
      const P0=_p.copy(base).addScaledVector(n,(anchor.side-anchor.at.y)*sR),m1=.06*s,m2=(this.body.depth*.8+.02)*s;
      const G=(this.c.gravity??260)*gravityScale*s*STEP*STEP,drag=this.c.drag??.07,k=this.c.stiff??.012;
      let steps=Math.floor(this.acc/STEP+1e-9);
      while(this.acc>=STEP){this.acc-=STEP;
        {const pts=[this.p1,this.q1,this.p2,this.q2];for(let i=0;i<4;i++){_u.copy(this.push[i]).divideScalar(Math.max(1,steps));pts[i].add(_u);this.push[i].sub(_u);}steps--;}
        for(const [p,q] of [[this.p1,this.q1],[this.p2,this.q2]]){_u.copy(p).sub(q).multiplyScalar(1-drag);q.copy(p);p.add(_u).addScaledVector(gravity,G);}
        // stiffness: a pull toward hanging straight (a charm's loop is a little stiff, so it doesn't flop)
        _t.copy(A).addScaledVector(gravity,L1).sub(this.p1).multiplyScalar(k);this.p1.add(_t);
        _t.copy(this.p1).addScaledVector(gravity,L2).sub(this.p2).multiplyScalar(k);this.p2.add(_t);
        for(let it=0;it<3;it++){
          _u.copy(this.p1).sub(A);let d=_u.length();if(d>1e-9)this.p1.copy(A).addScaledVector(_u,L1/d);
          _u.copy(this.p2).sub(this.p1);d=_u.length();if(d>1e-9){const e=(d-L2)/d;this.p1.addScaledVector(_u,e*.7);this.p2.addScaledVector(_u,-e*.3);}
          limit(A,this.p1,L1,gravity,n);limit(this.p1,this.p2,L2,gravity,n);
          for(const [p,q,m] of [[this.p1,this.q1,m1],[this.p2,this.q2,m2]]){const h=_t.copy(p).sub(P0).dot(n);if(h<m){p.addScaledVector(n,m-h);q.addScaledVector(n,m-h);   // on the gun: pushed out without
            const vn=_t.copy(p).sub(q).dot(n);if(vn<0)q.addScaledVector(n,vn);}}   // gaining speed (no bounce), and its speed into the gun dropped
        }
      }
      if(!Number.isFinite(this.p1.x+this.p1.y+this.p1.z+this.p2.x+this.p2.y+this.p2.z)){this.fresh=true;return;}
    }
    // drawn between the last two physics steps (120 Hz steps on a 144 Hz or uneven frame rate stuttered), kept on the chain's lengths
    {const a=this.acc/STEP;this.r1.lerpVectors(this.q1,this.p1,a);_u.copy(this.r1).sub(A);let d=_u.length();if(d>1e-9)this.r1.copy(A).addScaledVector(_u,L1/d);
     this.r2.lerpVectors(this.q2,this.p2,a);_u.copy(this.r2).sub(this.r1);d=_u.length();if(d>1e-9)this.r2.copy(this.r1).addScaledVector(_u,L2/d);
     // then smoothed in the gun's own frame (~35 ms): the charm's quick shake against the gun while running is taken out, the gun's
     // own motion isn't (user: "when moving rapidly and into the gun, it kinda jitters"); stays outside the gun (a blend of points outside it)
     const F=B||M;_x.setFromMatrixColumn(F,0).normalize();_y.setFromMatrixColumn(F,1).normalize();_z.setFromMatrixColumn(F,2).normalize();
     const toL=(v,o)=>{_u.copy(v).sub(A);return o.set(_u.dot(_x),_u.dot(_y),_u.dot(_z));},w=this.smoothed?1-Math.exp(-Math.max(0,dt)/(this.c.smooth??.035)):1;
     this.s1.lerp(toL(this.r1,_d),w);this.s2.lerp(toL(this.r2,_d),w);this.smoothed=true;
     const toW=(o,v)=>v.copy(A).addScaledVector(_x,o.x).addScaledVector(_y,o.y).addScaledVector(_z,o.z);toW(this.s1,this.r1);toW(this.s2,this.r2);}
    // ring: sticks out of the gun's side, its hole along the gun's length
    _y.copy(n);_z.copy(fwd);_x.crossVectors(_y,_z);this.ring.matrix.makeBasis(_x,_y,_z).scale(_sv.setScalar(s)).setPosition(_t.copy(A).addScaledVector(n,-.02*s));
    // links between the ring and the charm's loop, each turned 90° from the last
    _d.copy(this.r1).sub(A);const len=_d.length()||1;_d.divideScalar(len);
    for(let i=0;i<this.links.length;i++){
      _y.copy(_d);_z.copy(i%2?fwd:n).addScaledVector(_y,-_z.dot(_y));if(_z.lengthSq()<1e-8)_z.set(0,0,1);_z.normalize();_x.crossVectors(_y,_z);
      this.links[i].matrix.makeBasis(_x,_y,_z).scale(_sv.setScalar(s)).setPosition(_t.copy(A).addScaledVector(_d,len*(i+.5)/this.links.length));
    }
    // the body: up = along the chain end to its centre, front = out of the gun's side
    _y.copy(this.r1).sub(this.r2).normalize();_z.copy(n).addScaledVector(_y,-n.dot(_y));if(_z.lengthSq()<1e-8)_z.copy(fwd);_z.normalize();_x.crossVectors(_y,_z);
    const o=this.body.object;o.matrix.makeBasis(_x,_y,_z).scale(_sv.setScalar(s*o.scale.x)).setPosition(this.r1);
    for(const m of [this.ring,...this.links,o])m.matrixWorldNeedsUpdate=true;
  }
}
const _s=new THREE.Vector3(),_a=new THREE.Vector3(),_n=new THREE.Vector3(),_f=new THREE.Vector3(),_t=new THREE.Vector3(),_u=new THREE.Vector3(),_p=new THREE.Vector3(),
  _d=new THREE.Vector3(),_b=new THREE.Vector3(),_x=new THREE.Vector3(),_y=new THREE.Vector3(),_z=new THREE.Vector3(),_sv=new THREE.Vector3(),_R=new THREE.Matrix4();

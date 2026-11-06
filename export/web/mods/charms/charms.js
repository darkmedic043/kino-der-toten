// Weapon charms (2026-11-06): the catalogue, who owns what, the charm models, where a charm hangs on a gun and the swing.
// Shared by the game (mod.js, first person) and the Gunsmith preview (weapon-levels/gunsmith-view.js).
//
// A charm is a model the user supplies (GLB under mods/charms/models/, listed in charms.json). It is normalised once:
// its longest side becomes `size` inches, its hang point (`hang`, model units; default the top centre of its bounds)
// goes to the origin, so the body hangs down -Y with its front +Z (Blender's -Y front, glTF +Z). The rig hangs it from a
// small ring on the gun's left side (the side the player sees) by a short chain of links, and swings it with a two-point
// verlet (chain end + the body's centre) under gravity, the gun's motion and, in game, the camera's turning.
//
// Screen charms (a stat tracker, a virtual buddy) come later: a model with a screen material whose picture is drawn from a
// glyph/sprite atlas through shader uniforms (never a CanvasTexture redrawn in play, performance rule). They hang the same.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

const KEY='kino.mods.charms';
let catalogue=null;
export function loadCharms(){
  return catalogue??=fetch(new URL('./charms.json',import.meta.url)).then(r=>r.json())
    .then(c=>{c.charms??=[];c.anchors??={};return c;}).catch(()=>({charms:[],anchors:{}}));
}
// {on:{[gun base id]:charm id}}
export function loadCharmState(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');s.on??={};return s;}catch{return {on:{}};}}
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
const anchors=new Map(),inv=new THREE.Matrix4(),_c=new THREE.Vector3();
// visible vertices of `obj` (skipping the subtree `skip`) in the space of inv, as a flat [x,y,z,...] list: a vertex counts
// when its mesh and the mesh's ancestors are visible and neither its dominant bone nor any ancestor is scaled to nothing
// (BO1 hides attachments that way; their vertices collapse far off)
function visiblePoints(obj,skip,stop){
  const pts=[],done=new Map(),dead=b=>{for(let p=b;p&&p!==stop;p=p.parent)if(p.isBone&&p.scale.x<1e-3)return true;return false;};
  const shown=o=>{for(let p=o;p&&p!==stop;p=p.parent)if(!p.visible||p.userData.charm||p===skip)return false;return !dead(o);};
  obj.traverse(o=>{
    if(!o.isMesh||!shown(o))return;
    const g=o.geometry,pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;if(!pos)return;
    // BO1 surfaces share one vertex buffer: read this surface's own vertices through its index (each vertex once)
    let ids;if(g.index){const seen=done.get(pos)??new Set();done.set(pos,seen);const st=g.drawRange.start,end=Math.min(g.index.count,st+(Number.isFinite(g.drawRange.count)?g.drawRange.count:g.index.count));
      ids=[];for(let k=st;k<end;k++){const i=g.index.getX(k);if(!seen.has(i)){seen.add(i);ids.push(i);}}}
    else ids=Array.from({length:pos.count},(_,i)=>i);
    const boneOk=new Map(),step=Math.max(1,Math.floor(ids.length/4000));
    for(let k=0;k<ids.length;k+=step){const i=ids[k];
      if(o.isSkinnedMesh&&si&&sw){let best=0,bw=-1;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>bw){bw=w;best=si.getComponent(i,k);}}
        if(!boneOk.has(best))boneOk.set(best,!dead(o.skeleton.bones[best]));if(!boneOk.get(best))continue;}
      o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      if(Number.isFinite(v.x+v.y+v.z)&&Math.abs(v.x)<60&&Math.abs(v.y)<30&&Math.abs(v.z)<30)pts.push(v.x,v.y,v.z);   // (the SPAS parks its spare shells 127 in behind)
    }
  });
  return pts;
}
const pct=(pts,axis,q)=>{const a=[];for(let i=axis;i<pts.length;i+=3)a.push(pts[i]);a.sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(a.length*q))];};
// In the gun's root bone space (BO1: inches, x forward, y left = the side the camera sees, z up), from the visible
// vertices at the current pose: a little forward of j_gun (the hand), just under the bore, on the outer surface, moved
// along the gun to where no hand is in the way below it. side = the gun's widest point below it, which the charm is kept
// outside of. Cached per gun model, hands and shown attachments. charms.json anchors[gun id] = [x,y,z] (or {at:[x,y,z],
// side:y}) where the automatic spot looks wrong. hands: the arms model the gun is held in (the gun is under it); camera:
// the view camera (spots where the hanging charm would be off the bottom or side of the screen score badly).
export function gunAnchor(gun,root,{key,override,hands,camera}={}){
  if(override){const at=Array.isArray(override)?override:override.at;return {at:new THREE.Vector3().fromArray(at),side:override.side??at[1]};}
  const fullKey=key+'|'+(hands?.name??'')+'|'+(()=>{const h=[];gun.traverse(b=>{if(b.isBone&&b.scale.x<1e-3)h.push(b.name);});return h.join(',');})();
  if(anchors.has(fullKey))return anchors.get(fullKey);
  inv.copy(root.matrixWorld).invert();
  const pts=visiblePoints(gun,null,gun.parent);if(pts.length<9)return null;
  const hp=hands?visiblePoints(hands,gun,hands.parent):[];
  const xmin=pct(pts,0,.01),xmax=pct(pts,0,.99),L=xmax-xmin,lo=xmin+.12*L,hi=xmax-.3*L;
  const flash=gun.getObjectByName('tag_flash');let fz=null;
  if(flash){let ok=true;for(let p=flash;p&&p!==gun.parent;p=p.parent)if(p.scale.x<1e-3)ok=false;if(ok)fz=flash.getWorldPosition(v).applyMatrix4(inv).z-.4;}
  const zAt=x=>{if(fz!=null)return fz;const zs=[];for(let i=0;i<pts.length;i+=3)if(Math.abs(pts[i]-x)<1.5)zs.push(pts[i+2]);zs.sort((a,b)=>a-b);return zs.length?zs[Math.floor(zs.length*.7)]:0;};
  const maxY=(x,dx,z0,z1)=>{let m=-1e9;for(let i=0;i<pts.length;i+=3)if(Math.abs(pts[i]-x)<dx&&pts[i+2]>=z0&&pts[i+2]<=z1)m=Math.max(m,pts[i+1]);return m;};
  // hand vertices in the way: near this x, from the bore down to where the charm hangs, on the visible side
  const handsAt=(x,z)=>{let n=0;const y0=maxY(x,2,z-6,z+.5)-1.5;for(let i=0;i<hp.length;i+=3)if(Math.abs(hp[i]-x)<1.3&&hp[i+2]<z+1&&hp[i+2]>z-5&&hp[i+1]>y0)n++;return n;};
  // every spot along the gun, scored: a hand in the way, something wider below (the charm would lie on it, sticking out),
  // and the distance from the preferred spot
  const x0=THREE.MathUtils.clamp(.1*L+1,lo,hi);let best=null;
  for(let cx=lo;cx<=hi+1e-6;cx+=.5){
    const cz=zAt(cx);let cy=maxY(cx,1,cz-.8,cz+.8);if(cy<-1e8)cy=maxY(cx,3,cz-3,cz+3);if(cy<-1e8)continue;
    const cs=Math.max(cy,maxY(cx,2,cz-5,cz+.5)),h=hp.length?handsAt(cx,cz):0;
    let off=0;if(camera){_c.set(cx,cy,cz-1.8).applyMatrix4(root.matrixWorld).project(camera);off=_c.z>1||Math.abs(_c.x)>.92||_c.y<-.88?6:0;}
    const cost=(h?4+Math.min(4,h/40):0)+off+2.5*(cs-cy)+.25*Math.abs(cx-x0);
    if(!best||cost<best.cost)best={cost,x:cx,y:cy,z:cz,side:cs};
  }
  if(!best){const z=zAt(x0);best={x:x0,y:0,z,side:0};}
  const {x,z}=best,side=best.side,y=Math.max(best.y,side-.25);   // the ring stands off a little where the side bulges below
  const a={at:new THREE.Vector3(x,y+.06,z),side};anchors.set(fullKey,a);return a;
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
    this.fresh=true;this.acc=0;this.anchor=null;
  }
  reset(){this.fresh=true;}
  dispose(){this.group.removeFromParent();}
  // opts: root (bone), anchor ({at,side}), gravity (unit vector in the rig's space), moved (Matrix4: how a fixed point in
  // the rig's space moved this frame, e.g. the camera's turn; optional), follow (how much of `moved` the charm takes)
  step(dt,{root,anchor,gravity,moved=null,follow=.25,gravityScale=1}){
    if(!root||!anchor)return;
    const M=root.matrixWorld,s=_s.setFromMatrixScale(M).x;
    const n=_n.setFromMatrixColumn(M,1).normalize(),fwd=_f.setFromMatrixColumn(M,0).normalize(),A=_a.copy(anchor.at).applyMatrix4(M).addScaledVector(n,.12*s);   // A: the bottom of the ring, which stands out of the gun's side
    const L1=this.chain*s,L2=Math.max(.05,this.body.com)*s;
    if(this.fresh||!(dt>0&&dt<.25)||_t.copy(this.p1).sub(A).length()>L1*6+1e-6){
      this.p1.copy(A).addScaledVector(gravity,L1);this.q1.copy(this.p1);this.p2.copy(this.p1).addScaledVector(gravity,L2);this.q2.copy(this.p2);
      this.fresh=false;this.acc=0;
    }else{
      if(moved){_R.extractRotation(moved);_t.setFromMatrixPosition(moved);
        // a world-fixed point moves by `moved`; the charm takes `follow` of that (air drag), at most a third of its chain a frame
        for(const p of [this.p1,this.q1,this.p2,this.q2]){_u.copy(p).applyMatrix4(_R).sub(p).multiplyScalar(follow).addScaledVector(_t,follow*.3);const l=_u.length(),mx=L1*.5;if(l>mx)_u.multiplyScalar(mx/l);p.add(_u);}}
      this.acc=Math.min(this.acc+dt,STEP*4);
      // the side plane: a point on the gun's widest surface below the ring, normal = the gun's left (+y)
      const P0=_p.set(anchor.at.x,anchor.side,anchor.at.z).applyMatrix4(M),m1=.06*s,m2=(this.body.depth*.8+.02)*s;
      const G=(this.c.gravity??260)*gravityScale*s*STEP*STEP,drag=this.c.drag??.035;
      while(this.acc>=STEP){this.acc-=STEP;
        for(const [p,q] of [[this.p1,this.q1],[this.p2,this.q2]]){_u.copy(p).sub(q).multiplyScalar(1-drag);q.copy(p);p.add(_u).addScaledVector(gravity,G);}
        for(let it=0;it<3;it++){
          _u.copy(this.p1).sub(A);let d=_u.length();if(d>1e-9)this.p1.copy(A).addScaledVector(_u,L1/d);
          _u.copy(this.p2).sub(this.p1);d=_u.length();if(d>1e-9){const e=(d-L2)/d;this.p1.addScaledVector(_u,e*.7);this.p2.addScaledVector(_u,-e*.3);}
          limit(A,this.p1,L1,gravity,n);limit(this.p1,this.p2,L2,gravity,n);
          for(const [p,m] of [[this.p1,m1],[this.p2,m2]]){const h=_t.copy(p).sub(P0).dot(n);if(h<m)p.addScaledVector(n,m-h);}
        }
      }
      if(!Number.isFinite(this.p1.x+this.p1.y+this.p1.z+this.p2.x+this.p2.y+this.p2.z)){this.fresh=true;return;}
    }
    // ring: sticks out of the gun's side, its hole along the gun's length
    _y.copy(n);_z.copy(fwd);_x.crossVectors(_y,_z);this.ring.matrix.makeBasis(_x,_y,_z).scale(_sv.setScalar(s)).setPosition(_t.copy(A).addScaledVector(n,-.02*s));
    // links between the ring and the charm's loop, each turned 90° from the last
    _d.copy(this.p1).sub(A);const len=_d.length()||1;_d.divideScalar(len);
    for(let i=0;i<this.links.length;i++){
      _y.copy(_d);_z.copy(i%2?fwd:n).addScaledVector(_y,-_z.dot(_y));if(_z.lengthSq()<1e-8)_z.set(0,0,1);_z.normalize();_x.crossVectors(_y,_z);
      this.links[i].matrix.makeBasis(_x,_y,_z).scale(_sv.setScalar(s)).setPosition(_t.copy(A).addScaledVector(_d,len*(i+.5)/this.links.length));
    }
    // the body: up = along the chain end to its centre, front = out of the gun's side
    _y.copy(this.p1).sub(this.p2).normalize();_z.copy(n).addScaledVector(_y,-n.dot(_y));if(_z.lengthSq()<1e-8)_z.copy(fwd);_z.normalize();_x.crossVectors(_y,_z);
    const o=this.body.object;o.matrix.makeBasis(_x,_y,_z).scale(_sv.setScalar(s*o.scale.x)).setPosition(this.p1);
    for(const m of [this.ring,...this.links,o])m.matrixWorldNeedsUpdate=true;
  }
}
const _s=new THREE.Vector3(),_a=new THREE.Vector3(),_n=new THREE.Vector3(),_f=new THREE.Vector3(),_t=new THREE.Vector3(),_u=new THREE.Vector3(),_p=new THREE.Vector3(),
  _d=new THREE.Vector3(),_x=new THREE.Vector3(),_y=new THREE.Vector3(),_z=new THREE.Vector3(),_sv=new THREE.Vector3(),_R=new THREE.Matrix4();

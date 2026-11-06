// Weapon charms in first person (2026-11-06): the charm picked for the held gun in the Gunsmith hangs off its left side
// and swings. The system is in charms.js; this hangs it on the viewmodel. Right-hand gun only (dual wield: not the left).
import * as THREE from 'three';
import { loadCharms, loadCharmState, charmFor, charmModel, charmReach, charmUnit, gunAnchor, CharmRig } from './charms.js';

export default async function setup(api){
  const {host,session,viewScene}=api;const view=api.view;
  const cat=await loadCharms();
  let rig=null,gun=null,root=null,anchor=null,bone=null,gunId=null,token=0;
  const camPrev=new THREE.Matrix4(),D=new THREE.Matrix4(),g=new THREE.Vector3(),q=new THREE.Quaternion();
  let camFresh=true,last=0,hungAt=0;

  const rootOf=(gun,def)=>gun.getObjectByName(def?.gunRoot??'j_gun')??(()=>{let b=null;gun.traverse(o=>{if(!b&&o.isBone)b=o;});return b;})();
  const drop=()=>{rig?.dispose();rig=null;gun=root=anchor=bone=null;};
  // which gun this equip is: the session's held gun (an equipment view, a grenade or the box's prize, gets nothing)
  const heldId=def=>{const id=session.weapon?.id;return id&&(def===session.def||(def?.baseId??def?.id)===id)?id:null;};

  async function hang(def){
    const my=++token;drop();
    const id=heldId(def),state=loadCharmState();
    const c=charmFor(cat,state,id),g=view.gun;if(!c||!g)return;
    const body=await charmModel(c);if(my!==token||!body||view.gun!==g)return;
    gun=g;root=rootOf(gun,def);if(!root)return;gunId=id;
    rig=new CharmRig(body,c);viewScene.add(rig.group);rig.group.visible=false;anchor=null;hungAt=performance.now();
  }
  // hang it whenever the gun in hand changes, however it got there (the match's first gun is equipped before this mod's
  // setup runs, other mods swap viewmodels themselves): watched each frame rather than by wrapping view.equip
  let seen=null;
  host.on('update',dt=>{
    if(view.gun!==seen){seen=view.gun;if(view.gun&&(!rig||gun!==view.gun))hang(view.def??session.def);}
    if(!rig)return;
    if(view.gun!==gun){drop();return;}
    let shown=true;for(let o=gun;o;o=o.parent){if(o===viewScene)break;if(!o.visible){shown=false;break;}}
    rig.group.visible=shown;if(!shown){rig.reset();camFresh=true;return;}
    view.pivot.updateMatrixWorld(true);
    // the hang point once the raise has settled (the hands' grip is measured too), the charm hidden until then
    if(!anchor){if(performance.now()-hungAt<450){rig.group.visible=false;return;}anchor=gunAnchor(gun,root,{key:(view.def?.model??gunId),override:cat.anchors[gunId],hands:view.hands,camera:api.viewCamera,...charmReach(rig.body,rig.c),unit:charmUnit(view.def??session.def)});if(!anchor){drop();return;}}
    // the world camera's turn since last frame: the view scene is camera space, so a world-fixed point moves by D
    const cam=api.camera??host.camera;let moved=null;
    if(cam){cam.updateMatrixWorld();if(!camFresh){D.multiplyMatrices(cam.matrixWorldInverse,camPrev);if(g.setFromMatrixPosition(D).length()<150)moved=D;}
      camPrev.copy(cam.matrixWorld);camFresh=false;g.set(0,-1,0).applyQuaternion(q.copy(cam.quaternion).invert());}
    else g.set(0,-1,0);
    const now=performance.now(),d=(now-last)/1000;last=now;
    rig.step(d,{root,anchor,gravity:g,moved,unit:charmUnit(view.def??session.def),bone:anchor.bone?(bone??=gun.getObjectByName(anchor.bone)):null});
  });

  // the load's weapon warm-up (engine.js warmWeapons draws throwaway copies of every gun): the charm a gun carries
  // compiles with it, hung under the copy's root bone
  host.on('warmWeapon',({def,gun:wg,wait})=>{
    const id=def?.baseId??def?.id,c=charmFor(cat,loadCharmState(),id);if(!c||!wg)return;
    wait?.(charmModel(c).then(body=>{if(!body)return;const r=rootOf(wg,def);if(!r)return;
      body.object.matrixAutoUpdate=true;body.object.position.set(1,3,0);r.add(body.object);}));
  });

  // the Gunsmith changed a gun's charm (weapon-levels/gunsmith-view.js): rehang it if that's the gun in hand
  addEventListener('kino-charm',e=>{if(e.detail?.id===session.weapon?.id&&view.gun)hang(view.def??session.def);});

  window.kino??={};
  window.kino.charms={
    // set the held gun's charm (null = none) and save it; for tests and the console
    set:(charmId)=>{const id=session.weapon?.id;if(!id)return;const s=loadCharmState();if(charmId)s.on[id]=charmId;else delete s.on[id];
      localStorage.setItem('kino.mods.charms',JSON.stringify(s));return hang(view.def??session.def);},
    catalogue:cat,get rig(){return rig;},get anchor(){return anchor;},api,
  };
}

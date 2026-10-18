// BO7-style HUD layout (desktop). It doesn't redraw the HUD: the engine and the other mods keep writing their
// elements by id (#mag, #points, #perks, #equip-hud, #class-skill, #gum-hud, ...), and this mod moves those nodes
// into BO7-shaped containers and restyles them (hud.css):
//   bottom left  · player card: portrait, level badge, name, HP, segmented health bar, points (room left for
//                  self-revives and other slots later, the user's plan)
//   bottom right · ammo, then a dial with the gun's silhouette, a magazine arc and lethal/tactical/mine on top;
//                  bubbles joined to the dial: the class ability at its upper right, the operator weapon
//                  (operator-weapons) at its lower right; gobblegums stacked vertically above the dial
//   bottom centre · perks, with power-up timers above them
//   top right    · the round
// Load it last (mods.json): the nodes it adopts must exist. Touch devices keep the classic layout (touch-extras
// places those panels around the on-screen buttons).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { loadPrestige, prestigeColor, prestigeName, prestigeShort, isPrestigeMaster, masterLook } from '../prestige/prestige.js';

export default async function setup(api){
  if(matchMedia('(pointer: coarse)').matches)return;
  const {session,host,data,mod}=api;
  const $=id=>document.getElementById(id);
  for(const href of ['https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&display=swap',new URL('hud.css',mod.url).href]){
    const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);
  }
  document.body.classList.add('bo7-hud');

  const make=(id,html)=>{const el=document.createElement('div');el.id=id;el.innerHTML=html;document.body.append(el);return el;};
  const ESSENCE='<svg viewBox="0 0 20 20" class="ess"><path d="M4 3h13l-1.4 3L9 14h7l-1.5 3H2l1.4-3L10 6H3z"/></svg>';
  const left=make('bo7-left',`<div class="pf"></div><div class="info"><div class="who"><span class="lv"></span><span class="nm"></span></div>
    <div class="hp"><b></b> HP</div><div class="bar"></div><div class="xp"></div><div class="pts">${ESSENCE}</div></div><div class="extra"></div>`);
  const right=make('bo7-right',`<div class="ammo"><div class="wname"></div><div class="count"></div><div class="reload"></div></div>
    <div class="dial"><svg class="ring" viewBox="0 0 160 160"><circle class="track" cx="80" cy="80" r="74"/><path class="mag-track"/><path class="mag"/>
      <circle class="inner" cx="80" cy="80" r="62"/></svg>
      <svg class="links" viewBox="0 0 164 164"><rect class="l-ability" x="74" y="-7" width="22" height="14" rx="3" transform="translate(82 82) rotate(-30)"/><rect class="l-operator" x="74" y="-7" width="22" height="14" rx="3" transform="translate(82 82) rotate(30)"/></svg>
      <img class="gun" alt=""><div class="eq"></div><div class="gums"></div>
      <div class="sat ability"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg></div>
      <div class="sat operator"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg></div></div>`);
  const perks=make('bo7-perks','<div class="fx"></div><div class="row"></div>');
  const round=make('bo7-round','<span class="lbl">ROUND</span><b class="n"></b><span class="rem"></span>');
  const q=(el,s)=>el.querySelector(s);
  // player prestige: the level badge takes the prestige colour and a numeral
  {const n=loadPrestige().player.prestige,lv=q(left,'.lv');if(n){const c=prestigeColor(n);lv.style.background=c;lv.style.borderColor='#fff';lv.dataset.p=prestigeShort(n);lv.title=prestigeName(n);}}
  const master=isPrestigeMaster(loadPrestige().player.prestige);   // Master: the badge takes the level colour (changes every 100 levels)

  // ---- the magazine arc across the top of the dial (BO7's orange arc) ---------------------------------------
  const arc=(a0,a1,r=74)=>{const p=a=>[80+r*Math.cos(a*Math.PI/180),80+r*Math.sin(a*Math.PI/180)].map(v=>v.toFixed(2));
    const [x0,y0]=p(a0),[x1,y1]=p(a1);return `M${x0} ${y0}A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${x1} ${y1}`;};
  const ARC0=-150,ARC1=-30;q(right,'.mag-track').setAttribute('d',arc(ARC0,ARC1));

  // ---- adopt the existing HUD nodes ------------------------------------------------------------------------------
  // [node getter, new parent]. Re-checked twice a second: some mods place their node late or move it again
  // (classes puts #class-skill into #equip-hud at start and after 0.5 s).
  const healthTrack=document.querySelector('#player-panel .health-track'),pointsEl=document.querySelector('#player-panel .points');
  const adopt=[
    [()=>$('hud-portrait'),q(left,'.pf')],[()=>healthTrack,q(left,'.bar')],[()=>pointsEl,q(left,'.pts')],[()=>$('progression-hud'),q(left,'.xp')],
    [()=>$('weapon-name'),q(right,'.wname')],[()=>$('weapon-level'),q(right,'.wname')],[()=>$('ammo-mod-tag'),q(right,'.wname')],
    [()=>$('ammo'),q(right,'.count')],[()=>$('reload-label'),q(right,'.reload')],
    [()=>$('equip-hud'),q(right,'.eq')],[()=>$('class-skill'),q(right,'.ability')],[()=>$('operator-weapon'),q(right,'.operator')],[()=>$('gum-hud'),q(right,'.gums')],
    [()=>$('perks'),q(perks,'.row')],[()=>$('effects'),q(perks,'.fx')],[()=>$('remaining'),q(round,'.rem')],
  ];
  function place(){for(const [get,parent] of adopt){const n=get();if(n&&n.parentNode!==parent)parent.append(n);}}
  place();

  // ---- gun silhouette for the dial: the world model, side on, flat white (one small renderer, cached per gun) --------
  let gunR=null;const gunIcons=new Map();
  function gunIcon(id){
    if(gunIcons.has(id))return gunIcons.get(id);
    const p=(async()=>{
      const def=data.weapons[id];const model=def?.worldModel&&await loadModel(def.worldModel).catch(()=>null);if(!model)return null;
      gunR??=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});gunR.setSize(256,128);
      const scene=new THREE.Scene(),pivot=new THREE.Group();scene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xf2eee4});
      pivot.add(model);scene.add(pivot);pivot.updateMatrixWorld(true);
      let box=new THREE.Box3().setFromObject(pivot),size=box.getSize(new THREE.Vector3());
      if(size.z>size.x){pivot.rotation.y=Math.PI/2;pivot.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(pivot);size=box.getSize(new THREE.Vector3());}
      const c=box.getCenter(new THREE.Vector3()),half=Math.max(size.x/2,size.y)*1.08,cam=new THREE.OrthographicCamera(-half,half,half/2,-half/2,-5000,5000);
      cam.position.set(c.x,c.y,c.z+1000);cam.lookAt(c);gunR.render(scene,cam);
      const url=gunR.domElement.toDataURL();scene.overrideMaterial.dispose();return url;
    })().catch(e=>{console.warn('bo7-hud gun icon',id,e);return null;});
    gunIcons.set(id,p);return p;
  }
  const gunImg=q(right,'.gun');let gunId=null;
  function showGun(id){if(id===gunId)return;gunId=id;gunImg.style.opacity=0;if(!id)return;gunIcon(id).then(url=>{if(gunId!==id)return;if(url){gunImg.src=url;gunImg.style.opacity=1;}});}

  // ---- per-frame bits that aren't plain moved nodes -------------------------------------------------------------------------
  let t=0,last='';
  host.on('update',dt=>{
    if((t-=dt)<=0){t=.5;place();}
    const op=!!(window.kino.operator?.active||host.gunBlocked),w=session.weapon,def=w&&!session.weaponUnavailable&&!op?session.def:null;   // an operator weapon or the rocket shield in hand: no gun
    showGun(def?w.id:null);
    const frac=def?.clipSize?Math.max(0,Math.min(1,w.mag/def.clipSize)):0;
    const lv=($('progression-hud')?.querySelector('.lvl')?.textContent??'').replace(/\D+/g,''),nm=$('hud-portrait')?.querySelector('span')?.textContent??'';
    const rt=$('round')?.textContent??'',rn=/^I+$/.test(rt)?String(rt.length):rt;   // BO1 tallies (I–IIIII) shown as digits
    const key=[Math.ceil(session.health),frac.toFixed(3),lv,nm,rn,w?.upgraded,op].join('|');if(key===last)return;last=key;right.classList.toggle('op',op);
    q(left,'.hp b').textContent=Math.ceil(session.health);q(left,'.lv').textContent=lv;if(master&&lv){const lc=masterLook(+lv);q(left,'.lv').style.background=lc.color;q(left,'.lv').title='Prestige Master · '+lc.title;}q(left,'.nm').textContent=nm;
    left.classList.toggle('low',session.health<session.maxHealth*.35);
    q(right,'.mag').setAttribute('d',frac>0?arc(ARC0,ARC0+(ARC1-ARC0)*frac):'');right.classList.toggle('empty',def&&w.mag===0);
    right.classList.toggle('pap',!!w?.upgraded);
    q(round,'.n').textContent=rn;round.classList.toggle('text',!/^\d+$/.test(rn));   // Moon's No Man's Land: a status line, not a number
  });
  host.on('reset',()=>{last='';});
}

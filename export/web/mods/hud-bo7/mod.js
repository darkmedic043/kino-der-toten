// BO7-style HUD layout (desktop). It doesn't redraw the HUD: the engine and the other mods keep writing their
// elements by id (#mag, #points, #perks, #equip-hud, #class-skill, #gum-hud, ...), and this mod moves those nodes
// into BO7-shaped containers and restyles them (hud.css):
//   bottom left  · player card: portrait, level badge, name, HP, segmented health bar, points (room left for
//                  self-revives and other slots later, the user's plan)
//   bottom right · ammo, then a dial with the gun's silhouette, a magazine arc, the weapon slot's number at its
//                  left (pips for the 2 slots, 3 with Mule Kick), a dark band above it holding lethal/tactical/mine,
//                  and under the gun the ammo mod's icon and the Pack-a-Punch level (user, 2026-10-24, from a BO7
//                  screenshot); bubbles attached to the dial's right edge like BO7's field upgrade: the class ability
//                  at its upper right, the operator weapon (operator-weapons) at its lower right, key badge below;
//                  gobblegums stacked vertically above the dial
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
    <div class="dial"><div class="disc"></div><svg class="ring" viewBox="0 0 160 160"><circle class="track" cx="80" cy="80" r="74"/><path class="mag-track"/><path class="mag"/><g class="spokes"></g></svg>
      <div class="bar"></div><img class="gun" alt=""><div class="slotno"><b></b><span class="pips"></span></div>
      <div class="foot"><div class="amod"><svg viewBox="0 0 24 24"></svg><small></small></div><div class="pap"></div></div>
      <div class="eq"></div>
      <div class="sat ability" data-dir="-30"><div class="disc"></div><svg class="ring" viewBox="0 0 100 100"><path class="arc-track"/><path class="arc"/></svg></div>
      <div class="sat operator" data-dir="30"><div class="disc"></div><svg class="ring" viewBox="0 0 100 100"><path class="arc-track"/><path class="arc"/></svg></div>
      <div class="gums"></div></div>`);
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
  // radial spokes (the dial is cut into segments as in BO7): the equipment above between -135/-45 degrees (no backdrop, 2026-10-24: lethal at the right, tactical at the left), the
  // Pack-a-Punch segment below between 65/115, ticks at the top and bottom
  q(right,'.spokes').innerHTML=[[-135,70,98],[-45,70,98],[65,70,90],[115,70,90],[-90,76,84],[90,64,74]].map(([a,r0,r1])=>{const c=Math.cos(a*Math.PI/180),s=Math.sin(a*Math.PI/180);
    return `<line x1="${(80+r0*c).toFixed(1)}" y1="${(80+r0*s).toFixed(1)}" x2="${(80+r1*c).toFixed(1)}" y2="${(80+r1*s).toFixed(1)}"/>`;}).join('');
  // the bubbles' arcs run round their outer side (230 degrees facing away from the dial), the charge filling clockwise
  const arcAt=(a0,a1,r=45)=>{const p=a=>[50+r*Math.cos(a*Math.PI/180),50+r*Math.sin(a*Math.PI/180)].map(v=>v.toFixed(2));
    const [x0,y0]=p(a0),[x1,y1]=p(a1);return a1-a0<=0?'':`M${x0} ${y0}A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${x1} ${y1}`;};
  for(const sat of right.querySelectorAll('.sat')){const d=+sat.dataset.dir;q(sat,'.arc-track').setAttribute('d',arcAt(d-115,d+115));}
  function setArc(sat,frac,hot){const d=+sat.dataset.dir,f=Math.max(0,Math.min(1,frac||0)),k=f.toFixed(3)+(hot?'h':'');if(sat._arc===k)return;sat._arc=k;
    q(sat,'.arc').setAttribute('d',arcAt(d-115,d-115+230*f));sat.classList.toggle('full',f>=.999);sat.classList.toggle('hot',!!hot);}

  // ---- ammo mod icons (ammo-mods): one simple glyph per mod, drawn in the mod's colour -----------------------------
  const MOD_ICONS={
    cryo:'M12 2v20M2 12h20M5 5l14 14M19 5L5 19M12 5l-2.5-2M12 5l2.5-2M12 19l-2.5 2M12 19l2.5 2M5 12l-2-2.5M5 12l-2 2.5M19 12l2-2.5M19 12l2 2.5',
    napalm:'M12 2c1.5 4 5.5 6.5 5.5 11.5a5.5 5.5 0 0 1-11 0c0-2.5 1.2-4 2.5-5.2 0 2.2 1 3.4 2.3 3.6-.3-3.4-.8-6.4.7-9.9z',
    deadwire:'M13.5 2 4.5 14h7l-1 8 9-12h-7z',
    fireworks:'M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M5.6 18.4l3.2-3.2M15.2 8.8l3.2-3.2M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
    shadowrift:'M12 12a1.5 1.5 0 1 0 3 0 3.5 3.5 0 1 1-7 0 5.5 5.5 0 1 0 11 0 7.5 7.5 0 1 1-15 0 9.5 9.5 0 1 0 19 0',
    lightmend:'M12 5v14M5 12h14M12 2.5l1.2 2.3M12 2.5l-1.2 2.3M21.5 12l-2.3 1.2M21.5 12l-2.3-1.2M2.5 12l2.3 1.2M2.5 12l2.3-1.2M12 21.5l1.2-2.3M12 21.5l-1.2-2.3',
    shatter:'M12 2.5 20.5 7v10L12 21.5 3.5 17V7zM12 12l-4-6.5M12 12l5.5 7.5M12 12l-7 3.5M12 12l6-1',
    brainrot:'M12 3a7 7 0 0 0-7 7c0 3 2 4 2 6.5h10c0-2.5 2-3.5 2-6.5a7 7 0 0 0-7-7zM9 16.5v4M12 16.5v4M15 16.5v4M9 10.5a1 1 0 1 0 0 .1M15 10.5a1 1 0 1 0 0 .1',
  };
  const ROMAN=['','I','II','III','IV','V'];

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

  // ---- gun silhouette for the dial: the world model, side on, flat white, drawn by the game's own renderer into a small
  // render target and read back (cached per gun). It used to have its own WebGLRenderer, a second WebGL context whose one
  // program (skinned MeshBasicMaterial) linked on the first played frame: 5.2 s on the user's D3D11 trace (2026-10-30) and
  // invisible to the engine's program telemetry. The main renderer's program compiles during loading instead (the starting
  // gun's icon is drawn in setup, with an unskinned box for the other variant), so later guns cost a 256x128 draw and a readback.
  const renderer=api.renderer,gunIcons=new Map();let iconRT=null,iconMat=null,iconCanvas=null,iconBox=null;
  function drawIcon(model){
    iconRT??=new THREE.WebGLRenderTarget(256,128,{samples:4});
    if(!iconMat){iconMat=new THREE.MeshBasicMaterial();iconMat.color.setRGB(0xf2/255,0xee/255,0xe4/255,THREE.LinearSRGBColorSpace);}   // read back as-is: no colour-space conversion into a render target
    iconBox??=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),iconMat);iconBox.frustumCulled=false;   // unskinned variant, drawn off-screen
    const scene=new THREE.Scene(),pivot=new THREE.Group();scene.overrideMaterial=iconMat;
    pivot.add(model);scene.add(pivot);pivot.updateMatrixWorld(true);
    let box=new THREE.Box3().setFromObject(pivot),size=box.getSize(new THREE.Vector3());
    if(size.z>size.x){pivot.rotation.y=Math.PI/2;pivot.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(pivot);size=box.getSize(new THREE.Vector3());}
    const c=box.getCenter(new THREE.Vector3()),half=Math.max(size.x/2,size.y)*1.08,cam=new THREE.OrthographicCamera(-half,half,half/2,-half/2,-5000,5000);
    cam.position.set(c.x,c.y,c.z+1000);cam.lookAt(c);iconBox.position.set(c.x+half*4,c.y,c.z);scene.add(iconBox);
    const prevRT=renderer.getRenderTarget(),prevColor=renderer.getClearColor(new THREE.Color()),prevAlpha=renderer.getClearAlpha(),prevAuto=renderer.autoClear;
    const px=new Uint8Array(256*128*4);
    try{renderer.setRenderTarget(iconRT);renderer.setClearColor(0x000000,0);renderer.autoClear=true;renderer.render(scene,cam);renderer.readRenderTargetPixels(iconRT,0,0,256,128,px);}
    finally{renderer.setRenderTarget(prevRT);renderer.setClearColor(prevColor,prevAlpha);renderer.autoClear=prevAuto;pivot.remove(model);scene.remove(iconBox);}
    iconCanvas??=document.createElement('canvas');iconCanvas.width=256;iconCanvas.height=128;
    const ctx=iconCanvas.getContext('2d'),img=ctx.createImageData(256,128);
    for(let y=0;y<128;y++)img.data.set(px.subarray((127-y)*1024,(128-y)*1024),y*1024);   // GL rows run bottom-up
    ctx.putImageData(img,0,0);return iconCanvas.toDataURL();
  }
  function gunIcon(id){
    if(gunIcons.has(id))return gunIcons.get(id);
    const p=(async()=>{
      const def=data.weapons[id];const model=def?.worldModel&&await loadModel(def.worldModel).catch(()=>null);if(!model)return null;
      return drawIcon(model);
    })().catch(e=>{console.warn('bo7-hud gun icon',id,e);return null;});
    gunIcons.set(id,p);return p;
  }
  if(session.weapon?.id)(host.pending??=[]).push(gunIcon(session.weapon.id));   // the starting gun's icon (and the programs) while loading
  const gunImg=q(right,'.gun');let gunId=null;
  function showGun(id){if(id===gunId)return;gunId=id;gunImg.style.opacity=0;if(!id)return;gunIcon(id).then(url=>{if(gunId!==id)return;if(url){gunImg.src=url;gunImg.style.opacity=1;}});}

  // warmHud (engine.js): the panels' states painted once behind the loading screen (their Skia shaders)
  host.on('warmHud',on=>{for(const [el,cls] of [[left,'low'],[right,'empty'],[right,'pap'],[round,'text']])el.classList.toggle(cls,on);
    for(const sat of right.querySelectorAll('.sat')){if(on){sat._arc=null;q(sat,'.arc').setAttribute('d',arcAt(+sat.dataset.dir-115,+sat.dataset.dir+100));}sat.classList.toggle('full',on);sat.classList.toggle('hot',on);}});

  // ---- per-frame bits that aren't plain moved nodes -------------------------------------------------------------------------
  let t=0,last='';
  host.on('update',dt=>{
    if((t-=dt)<=0){t=.5;place();}
    const op=!!(window.kino.operator?.active||host.gunBlocked),w=session.weapon,def=w&&!session.weaponUnavailable&&!op?session.def:null;   // an operator weapon or the rocket shield in hand: no gun
    showGun(def?w.id:null);
    const frac=def?.clipSize?Math.max(0,Math.min(1,w.mag/def.clipSize)):0;
    const lv=($('progression-hud')?.querySelector('.lvl')?.textContent??'').replace(/\D+/g,''),nm=$('hud-portrait')?.querySelector('span')?.textContent??'';
    const rt=$('round')?.textContent??'',rn=/^I+$/.test(rt)?String(rt.length):rt;   // BO1 tallies (I–IIIII) shown as digits
    const am=def&&w.ammoMod?.id?w.ammoMod:null,pap=def?(w.papLevel??(w.upgraded?1:0)):0,slots=session.weaponSlots??2,slot=def?session.slot+1:0;   // papLevel: Pack-a-Punch tiers, when they come
    {const cs=$('class-skill'),ow=$('operator-weapon');   // the bubbles' outer arcs follow their own meters
      setArc(q(right,'.ability'),cs?cs.classList.contains('cooling')?1-parseFloat(cs.style.getPropertyValue('--p'))/100:cs.classList.contains('locked')?0:1:0,cs?.classList.contains('active'));
      const f=ow?.querySelector('.fill'),of=f?1-parseFloat(f.getAttribute('stroke-dashoffset'))/parseFloat(f.getAttribute('stroke-dasharray')):0;
      setArc(q(right,'.operator'),ow&&!ow.classList.contains('empty')?of:0,ow?.classList.contains('active')||ow?.classList.contains('ready'));}
    const key=[Math.ceil(session.health),frac.toFixed(3),lv,nm,rn,w?.upgraded,op,am?.id,am?.tier,pap,slot,slots].join('|');if(key===last)return;last=key;right.classList.toggle('op',op);
    q(left,'.hp b').textContent=Math.ceil(session.health);q(left,'.lv').textContent=lv;if(master&&lv){const lc=masterLook(+lv);q(left,'.lv').style.background=lc.color;q(left,'.lv').title='Prestige Master · '+lc.title;}q(left,'.nm').textContent=nm;
    left.classList.toggle('low',session.health<session.maxHealth*.35);
    q(right,'.mag').setAttribute('d',frac>0?arc(ARC0,ARC0+(ARC1-ARC0)*frac):'');right.classList.toggle('empty',def&&w.mag===0);
    right.classList.toggle('pap',!!w?.upgraded);
    {const el=q(right,'.slotno');el.hidden=!slot;q(el,'b').textContent=slot;q(el,'.pips').innerHTML=Array.from({length:slots},(_,i)=>`<i${i+1===slot?' class="on"':''}></i>`).join('');}
    {const el=q(right,'.amod'),m=am&&window.kino.ammoMods?.MODS?.find(x=>x.id===am.id);el.hidden=!am;if(am){el.style.color=m?.color??'#fff';el.title=m?.name??am.id;q(el,'path')?.remove();const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',MOD_ICONS[am.id]??'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16');q(el,'svg').append(p);q(el,'small').textContent=ROMAN[am.tier]??am.tier;}}
    {const el=q(right,'.pap');el.hidden=!pap;el.textContent=ROMAN[pap]??pap;}
    q(round,'.n').textContent=rn;round.classList.toggle('text',!/^\d+$/.test(rn));   // Moon's No Man's Land: a status line, not a number
  });
  host.on('reset',()=>{last='';});
}

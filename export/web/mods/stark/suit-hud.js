// The Iron Man suits' JARVIS HUD, after the map's _iron_man_mk*.gsc: the suit's interface image over the screen, the
// faceplate sliding down on suit-up, live stats (kills, headshots, gibs, zombies left, downs, revives) in the interface's
// own boxes, the suit power, and the POWER LEVELS LOW / CRITICAL warnings. The images come from the map's .iwd
// (.tools/waw_maps/cheese_cube_suit_assets.py, in mods/stark/jarvis/hud/, git-ignored; shared by every map); without them only the numbers show.
//
// The original draws the interface 1000x600 on WaW's 480-unit-high HUD, centred, so its edges fall off the screen (the
// War Machine's stat box is cut at the top). Here it keeps that 5:3 shape but fits the screen height, so all of it shows
// on 16:9 and wider. Positions below are fractions of the image. The power number goes in the interface's power ring
// (`ring`); the Mk1 has no interface and gets the original's spot (x 90, y 35 of 480: top left).
const LAYOUTS={
  // Mk3 (iron_man_interface_glow8) and War Machine (wm3): two stat boxes of three rows, numbers right-aligned in them
  mk3:{img:'interface_mk3',ring:[.184,.094],stats:{kills:[.875,.362,'r'],headshots:[.875,.39,'r'],gibs:[.875,.419,'r'],left:[.875,.5,'r'],downs:[.875,.528,'r'],revives:[.875,.556,'r']}},
  wm:{img:'interface_wm',ring:[.789,.162],stats:{kills:[.238,.095,'r'],headshots:[.238,.122,'r'],gibs:[.238,.151,'r'],left:[.238,.231,'r'],downs:[.238,.26,'r'],revives:[.238,.289,'r']}},
  // Mk4 and Mk6: one ring per stat, the number in its middle
  mk4:{img:'interface_mk4',ring:[.795,.256],stats:{kills:[.156,.112],headshots:[.238,.225],gibs:[.144,.304],left:[.224,.406],downs:[.141,.498],revives:[.236,.596]}},
  mk6:{img:'interface_mk6',ring:[.797,.256],low:'interface_mk6_red',stats:{kills:[.194,.566],headshots:[.268,.685],gibs:[.359,.738],left:[.458,.738],downs:[.556,.738],revives:[.656,.738]}},
  mk16:{img:'interface_mk16',ring:[.797,.256],stats:{kills:[.194,.566],headshots:[.268,.685],gibs:[.359,.738],left:[.458,.738],downs:[.556,.738],revives:[.656,.738]}},
  // Mk5: nodes on two arcs, the number beside each node
  mk5:{img:'interface_mk5',ring:[.689,.188],stats:{kills:[.215,.194,'l'],headshots:[.182,.338,'l'],left:[.178,.513,'l'],gibs:[.205,.669,'l'],revives:[.808,.194,'r'],downs:[.838,.444,'r']}},
  // Mk1: no interface in the original, only the faceplate and the power number
  mk1:{img:null},
};

export function createSuitHud({base}){
  const url=n=>base+'hud/'+n+'.webp';
  const root=document.createElement('div');root.id='jarvis-hud';
  root.innerHTML=`<div class="jv-frame"><img class="jv-ui" alt=""><div class="jv-stats"></div></div><div class="jv-power"></div>
    <img class="jv-mask" alt=""><div class="jv-warn"></div><div class="jv-stealth">Stealth-Mode</div>`;
  const style=document.createElement('style');style.textContent=`
    #jarvis-hud{position:fixed;inset:0;z-index:4;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .5s}
    #jarvis-hud.on{opacity:1}
    #jarvis-hud .jv-frame{position:absolute;left:50%;top:50%;width:166.67vh;height:100vh;transform:translate(-50%,-50%)}
    #jarvis-hud .jv-ui{position:absolute;inset:0;width:100%;height:100%;opacity:.85}
    #jarvis-hud .jv-ui[src=""]{display:none}
    #jarvis-hud .jv-n{position:absolute;transform:translate(-50%,-50%);font:700 2.6vh/1 'Arial Narrow',system-ui,sans-serif;color:#7fffd4;text-shadow:0 0 .6vh #00e5ff,0 0 .2vh #000;white-space:nowrap}
    #jarvis-hud .jv-n.r{transform:translate(-100%,-50%)}
    #jarvis-hud .jv-n.l{transform:translate(0,-50%)}
    #jarvis-hud .jv-power{position:absolute;left:18.75vh;top:7.3vh;transform:translate(0,-50%);font:700 5vh/1 'Arial Narrow',system-ui,sans-serif;color:#7fffd4;text-shadow:0 0 1vh #00e5ff,0 0 .2vh #000}
    #jarvis-hud .jv-frame .jv-power{transform:translate(-50%,-50%);font-size:4.4vh}
    #jarvis-hud .jv-power.low{color:#dc143c;text-shadow:0 0 1vh #ff2040,0 0 .2vh #000}
    #jarvis-hud .jv-mask{position:absolute;left:50%;top:50%;width:208.33vh;height:125vh;transform:translate(-50%,-180%);opacity:0}
    #jarvis-hud .jv-mask.down{transform:translate(-50%,-50%);opacity:1;transition:transform .2s ease-in}
    #jarvis-hud .jv-mask.fade{transform:translate(-50%,-50%);opacity:0;transition:opacity .7s}
    #jarvis-hud .jv-warn{position:absolute;left:0;right:0;top:25vh;text-align:center;font:700 6vh/1 'Arial Narrow',system-ui,sans-serif;color:#dc143c;text-shadow:0 0 1vh #000;opacity:0}
    #jarvis-hud .jv-warn.flash{animation:jv-flash .6s steps(1) 4}
    @keyframes jv-flash{0%{opacity:1}50%{opacity:0}}
    /* Mk16 Stealth-Mode: the HUD turns green (the map recolours it) and the view softens */
    #jarvis-hud.cloak .jv-ui{filter:sepia(1) saturate(6) hue-rotate(70deg) brightness(.9)}
    #jarvis-hud.cloak .jv-n,#jarvis-hud.cloak .jv-power{color:#3cd03c;text-shadow:0 0 .8vh #1e8b1e,0 0 .2vh #000}
    #jarvis-hud.cloak::before{content:'';position:absolute;inset:0;z-index:0;backdrop-filter:blur(1.5px);background:#0a2a0a22}
    #jarvis-hud .jv-frame,#jarvis-hud .jv-power,#jarvis-hud .jv-mask,#jarvis-hud .jv-warn,#jarvis-hud .jv-stealth{z-index:1}
    #jarvis-hud .jv-stealth{position:absolute;left:0;right:0;top:15vh;text-align:center;font:700 5vh/1 'Arial Narrow',system-ui,sans-serif;color:#fff;text-shadow:0 0 1vh #000;opacity:0}
    #jarvis-hud.cloak .jv-stealth{animation:jv-pulse 4s ease-in-out infinite}
    @keyframes jv-pulse{0%,100%{opacity:0}50%{opacity:1}}
    body.menu-open #jarvis-hud{visibility:hidden}`;
  document.head.append(style);document.body.append(root);
  const frame=root.querySelector('.jv-frame'),ui=root.querySelector('.jv-ui'),mask=root.querySelector('.jv-mask'),powerEl=root.querySelector('.jv-power'),
    statsEl=root.querySelector('.jv-stats'),warnEl=root.querySelector('.jv-warn');
  let layout=null,cells={},maskTimer=0;

  function show(suitId){
    layout=LAYOUTS[suitId]??LAYOUTS.mk3;
    ui.src=layout.img?url(layout.img):'';
    statsEl.innerHTML='';cells={};
    if(layout.ring){frame.append(powerEl);powerEl.style.left=layout.ring[0]*100+'%';powerEl.style.top=layout.ring[1]*100+'%';}
    else{root.append(powerEl);powerEl.style.left='';powerEl.style.top='';}
    for(const [k,[x,y,a]] of Object.entries(layout.stats??{})){
      const n=document.createElement('div');n.className='jv-n'+(a?' '+a:'');n.style.left=x*100+'%';n.style.top=y*100+'%';statsEl.append(n);cells[k]=n;
    }
    // the faceplate closes, then clears so the HUD is readable (the original holds it 5.2 s)
    clearTimeout(maskTimer);mask.src=url(suitId==='mk1'?'mask_mk1':'mask');mask.className='jv-mask';
    void mask.offsetWidth;mask.className='jv-mask down';
    maskTimer=setTimeout(()=>{mask.className='jv-mask fade';},2400);
    root.classList.add('on');
  }
  function setCloak(on){root.classList.toggle('cloak',on);}
  function hide(){root.classList.remove('on','cloak');clearTimeout(maskTimer);mask.className='jv-mask';}
  function update(power,stats){
    if(!layout)return;
    const p=Math.max(0,Math.round(power));powerEl.textContent=p;powerEl.classList.toggle('low',p<=25);
    if(layout.low){const want=url(p<=25?layout.low:layout.img);if(!ui.src.endsWith(want.split('/').pop()))ui.src=want;}
    for(const [k,el] of Object.entries(cells)){const v=String(stats[k]??0);if(el.textContent!==v)el.textContent=v;}
  }
  function warn(text){warnEl.textContent=text;warnEl.className='jv-warn';void warnEl.offsetWidth;warnEl.className='jv-warn flash';}
  return {show,hide,update,warn,setCloak,root};
}

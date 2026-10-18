// Der Eisendrache frame-rate benchmark across the castle (docs/fork/performance.md): spawn x4 yaws, every perk machine
// and the power switch from two sides, the Pack-a-Punch, the undercroft. node .tools/bench-castle.mjs [quality] [query]
// [--profile out.cpuprofile]; env RS=0.5 (render scale: takes the GPU out), SECS=2.5 (per view). Needs the server on 5190.
// Summarise a profile with node .tools/profile-summary.mjs out.cpuprofile [topN].
import { chromium } from '../node_modules/playwright-core/index.mjs';
import fs from 'fs';
const args=process.argv.slice(2);const pos=args.filter(a=>!a.startsWith('--'));
const [quality='high',query='']=pos;const prof=args.includes('--profile')?args[args.indexOf('--profile')+1]:null;
const secs=+(process.env.SECS||2.5);
const b=await chromium.launch({executablePath:process.env.HOME+'/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args:['--use-angle=vulkan','--enable-gpu','--ignore-gpu-blocklist','--disable-gpu-vsync','--disable-frame-rate-limit']});
const p=await b.newPage({viewport:{width:1600,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const logs=[];p.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text().slice(0,300));});
await p.goto('http://127.0.0.1:5190/');
await p.evaluate(([q,rs])=>{const s=JSON.parse(localStorage.getItem('kino.settings')||'{}');s.graphics={low:0,medium:1,high:2,ultra:3}[q];if(rs)s.renderScale=rs;else delete s.renderScale;s.fpsCap=0;localStorage.setItem('kino.settings',JSON.stringify(s));},[quality,+process.env.RS||0]);
const t0=Date.now();await p.goto(`http://127.0.0.1:5190/play.html?map=der-eisendrache${query}`);
const prog=setInterval(async()=>{try{const t=await p.evaluate(()=>[document.getElementById('load-label')?.textContent,document.getElementById('load-progress')?.style.width,Math.round(performance.memory?.usedJSHeapSize/1048576)]);console.log('  load',((Date.now()-t0)/1000).toFixed(0)+'s',t.join(' | '));}catch(e){console.log('  load poll failed',e.message.slice(0,80));}},10000);
p.on('console',m=>{if(/instance-cull|scene-merge|der-eisendrache|warm|context/i.test(m.text()))console.log('  >',m.text().slice(0,160));});
await p.waitForFunction(()=>window.kino?.debug?.getState?.().ready,null,{timeout:600000});const load=(Date.now()-t0)/1000;clearInterval(prog);
await p.evaluate(()=>{kino.debug.setActive(true);kino.debug.setInvulnerable?.(true);kino.mods.api.session.round=1;kino.debug.setAutoSpawn(false);});
await p.waitForTimeout(3000);
const views=await p.evaluate(()=>{const api=kino.mods.api,w=api.world,spawn=api.player.getFeetPosition().toArray();
  const v=[0,90,180,270].map(y=>({name:'spawn '+y,pos:spawn,yaw:y}));
  for(const it of w.interactions){if(it.kind==='perk')v.push({name:'perk '+(it.perk.id??it.perk.name??'?'),pos:it.position.toArray(),yaw:0,yaw2:180});
    if(it.kind==='power')v.push({name:'power',pos:it.position.toArray(),yaw:0,yaw2:180});if(it.kind==='pap')v.push({name:'pap',pos:it.position.toArray(),yaw:0});}
  v.push({name:'undercroft',pos:[-625,60,-2400],yaw:0,yaw2:180});
  return v.flatMap(x=>x.yaw2!=null?[{...x},{...x,name:x.name+' b',yaw:x.yaw2}]:[x]);});
let session;if(prof){session=await p.context().newCDPSession(p);await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:200});await session.send('Profiler.start');}
const rows=[];
for(const v of views){
  const r=await p.evaluate(async ([v,secs])=>{const D=kino.debug,api=kino.mods.api;D.teleportPlayer(v.pos);api.camera.rotation.set(0,v.yaw*Math.PI/180,0);
    const e=api.enemies;for(const z of [...e.list])e.hurt(z,1e9,false,false,'bullet');
    await new Promise(r=>setTimeout(r,700));const ts=[];let last=performance.now();const perf0=kino.perf?.snapshot?.();
    await new Promise(res=>{const end=last+secs*1000;(function f(t){ts.push(t-last);last=t;if(t<end)requestAnimationFrame(f);else res();})(last);});
    ts.shift();const s=[...ts].sort((a,b)=>a-b),avg=ts.reduce((a,b)=>a+b,0)/ts.length,st=D.getState().performance;
    return {avg,p95:s[Math.floor(s.length*.95)],max:s.at(-1),calls:st.calls,tris:st.triangles,feet:api.player.getFeetPosition().toArray().map(Math.round)};},[v,secs]);
  rows.push({view:v.name,...r});console.log(`${v.name.padEnd(24)} ${(1000/r.avg).toFixed(1).padStart(6)} fps  avg ${r.avg.toFixed(2)} ms  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(0)}  calls ${String(r.calls).padStart(5)}  tris ${(r.tris/1e6).toFixed(2)}M  at ${r.feet}`);
}
if(prof){const {profile}=await session.send('Profiler.stop');fs.writeFileSync(prof,JSON.stringify(profile));}
const avg=rows.reduce((a,r)=>a+r.avg,0)/rows.length,worst=rows.reduce((a,r)=>r.avg>a.avg?r:a);
console.log(`\nder-eisendrache ${quality}${query}: load ${load.toFixed(1)} s, average ${(1000/avg).toFixed(1)} fps (${avg.toFixed(2)} ms), worst view ${worst.view} ${(1000/worst.avg).toFixed(1)} fps; errors ${errs.length}, console errors/warnings ${logs.length}`);
for(const e of errs.slice(0,5))console.log('  ',e.slice(0,200));for(const l of logs.slice(0,12))console.log('  ',l);
await b.close();

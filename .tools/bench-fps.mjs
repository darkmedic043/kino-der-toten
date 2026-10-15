// Uncapped frame-rate benchmark (docs/fork/performance.md): node .tools/bench-fps.mjs [map] [quality] [query] [--profile out.cpuprofile]
// Loads play.html?map=<map> in headless Chromium on the real GPU with vsync and the frame limit off, then for each view
// (spawn x4 yaws + the map's exfil zones x2 yaws) samples frame times for 2.5 s. Prints avg/p95 frame time, FPS, draw
// calls and triangles per view and overall. Needs the kino server on 127.0.0.1:5190.
import { chromium } from '../node_modules/playwright-core/index.mjs';
import fs from 'fs';
const [map='the-giant',quality='high',query='']=process.argv.slice(2).filter(a=>!a.startsWith('--')),prof=process.argv.includes('--profile')?process.argv[process.argv.indexOf('--profile')+1]:null;
const zones=JSON.parse(fs.readFileSync(new URL('../export/web/mods/exfil/zones.json',import.meta.url)))[map]??[];
const b=await chromium.launch({executablePath:process.env.HOME+'/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args:['--use-angle=vulkan','--enable-gpu','--ignore-gpu-blocklist','--disable-gpu-vsync','--disable-frame-rate-limit']});
const p=await b.newPage({viewport:{width:1600,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:5190/');
await p.evaluate(q=>{const s=JSON.parse(localStorage.getItem('kino.settings')||'{}');s.graphics={low:0,medium:1,high:2,ultra:3}[q];localStorage.setItem('kino.settings',JSON.stringify(s));},quality);
const t0=Date.now();await p.goto(`http://127.0.0.1:5190/play.html?map=${map}${query}`);   // query: A/B switches, e.g. '&noBatch'
await p.waitForFunction(()=>window.kino?.debug?.getState?.().ready,null,{timeout:600000});const load=(Date.now()-t0)/1000;
await p.evaluate(()=>{kino.debug.setActive(true);kino.debug.setInvulnerable?.(true);kino.mods.api.session.round=1;
  // no zombies: freeze spawning so views are comparable
  });
await p.waitForTimeout(3000);
const spawn=await p.evaluate(()=>kino.mods.api.player.getFeetPosition().toArray());
const views=[...[0,90,180,270].map(y=>({name:'spawn '+y,pos:spawn,yaw:y})),...zones.flatMap(z=>[0,180].map(y=>({name:z.name+' '+y,pos:z.position,yaw:y})))];
let session;if(prof){session=await p.context().newCDPSession(p);await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:200});await session.send('Profiler.start');}
const rows=[];
for(const v of views){
  const r=await p.evaluate(async v=>{const D=kino.debug,api=kino.mods.api;D.teleportPlayer(v.pos);api.camera.rotation.set(0,v.yaw*Math.PI/180,0);
    const e=api.enemies;for(const z of [...e.list])e.hurt(z,1e9,false,false,'bullet');   // no zombies: views stay comparable
    await new Promise(r=>setTimeout(r,600));const ts=[];let last=performance.now();
    await new Promise(res=>{const end=last+2500;(function f(t){ts.push(t-last);last=t;if(t<end)requestAnimationFrame(f);else res();})(last);});
    ts.shift();const s=[...ts].sort((a,b)=>a-b),avg=ts.reduce((a,b)=>a+b,0)/ts.length,st=D.getState().performance;
    return {avg,p95:s[Math.floor(s.length*.95)],max:s.at(-1),calls:st.calls,tris:st.triangles};},v);
  rows.push({view:v.name,...r});console.log(`${v.name.padEnd(22)} ${(1000/r.avg).toFixed(1).padStart(6)} fps  avg ${r.avg.toFixed(2)} ms  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(0)}  calls ${r.calls}  tris ${(r.tris/1e6).toFixed(2)}M`);
}
if(prof){const {profile}=await session.send('Profiler.stop');fs.writeFileSync(prof,JSON.stringify(profile));}
const avg=rows.reduce((a,r)=>a+r.avg,0)/rows.length,worst=rows.reduce((a,r)=>r.avg>a.avg?r:a);
console.log(`\n${map} ${quality}: load ${load.toFixed(1)} s, average ${(1000/avg).toFixed(1)} fps (${avg.toFixed(2)} ms), worst view ${worst.view} ${(1000/worst.avg).toFixed(1)} fps; errors ${errs.length}`);
for(const e of errs.slice(0,5))console.log('  ',e.slice(0,200));
await b.close();

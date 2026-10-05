import {chromium} from 'playwright-core';
import fs from 'fs';
const S='/tmp/claude-1000/-home-sleepyzoroark/3ff14e7b-430c-489c-9a95-7301b55a29e4/scratchpad/';
const exe=fs.readdirSync(process.env.HOME+'/.cache/ms-playwright').filter(d=>d.startsWith('chromium-'))[0];
const b=await chromium.launch({executablePath:`${process.env.HOME}/.cache/ms-playwright/${exe}/chrome-linux64/chrome`,args:['--use-angle=vulkan','--enable-gpu','--ignore-gpu-blocklist','--no-sandbox']});
const p=await b.newPage({viewport:{width:960,height:540}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text().slice(0,160));});
await p.addInitScript(()=>{try{const k='kino.mods.progression';const s=JSON.parse(localStorage.getItem(k)||'{}');s.character='bondrewd_premium';localStorage.setItem(k,JSON.stringify(s));}catch{}});
await p.goto('http://127.0.0.1:5190/play.html?map=sandbox');
await p.waitForFunction(()=>window.kino?.debug?.getState,null,{timeout:180000});
await p.waitForTimeout(4000);await p.getByText(/ENTER THE MAP|START/i).first().click().catch(()=>{});await p.waitForTimeout(3000);
console.log('char',await p.evaluate(()=>window.kino.character?.entry?.id??window.kino.character?.id??'?'));
const mode=process.argv[2]||'fp';
if(mode==='tp')await p.evaluate(()=>{window.kino.debug.step(.1);});
await p.evaluate(()=>{window.kino.debug.setInvulnerable(true);window.kino.debug.step(.5);});
if(mode==='tp'){await p.keyboard.press('KeyT');await p.waitForTimeout(800);}
await p.evaluate(()=>{window.kino.debug.melee();window.kino.debug.step(.02);});
for(let i=0;i<6;i++){await p.evaluate(()=>window.kino.debug.step(.045));await p.waitForTimeout(120);await p.screenshot({path:S+`knife-${mode}-${i}.png`});}
console.log('errors',JSON.stringify(errs.slice(0,6)));
await b.close();

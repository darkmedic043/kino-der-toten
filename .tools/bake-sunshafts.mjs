#!/usr/bin/env node
// Traces Kino's sun shafts once in a headless browser and writes
// export/web/mods/lighting/sunshafts.json (loaded at runtime instead).
//   node .tools/bake-sunshafts.mjs   (needs the game served on :5190)
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
const exe=fs.readdirSync(os.homedir()+'/.cache/ms-playwright').filter(d=>d.startsWith('chromium-')).map(d=>os.homedir()+'/.cache/ms-playwright/'+d+'/chrome-linux64/chrome').find(fs.existsSync);
const browser=await chromium.launch({executablePath:exe,headless:true,args:['--use-angle=vulkan','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:320,height:180}});
await page.addInitScript(()=>{try{localStorage.setItem('kino.settings',JSON.stringify({graphics:2,daytime:true}));}catch{}});
await page.goto('http://127.0.0.1:5190/index.html?bakeShafts');
await page.waitForFunction(()=>kino?.debug.getState().ready,null,{timeout:300000});
await page.waitForFunction(()=>kino.lighting?.shafts?.length>0,null,{timeout:600000});
await page.waitForTimeout(3000);
const shafts=await page.evaluate(()=>kino.lighting.shafts);
fs.writeFileSync(new URL('../export/web/mods/lighting/sunshafts.json',import.meta.url),JSON.stringify(shafts));
console.log('baked',shafts.length,'sun shafts');await browser.close();

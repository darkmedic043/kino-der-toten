#!/usr/bin/env node
// Bakes Kino's static lighting volume (see export/web/mods/lighting/baked.js):
// loads the game with ?bakeLight in headless Chromium (GPU), waits for the bake
// and writes export/web/mods/lighting/baked-light.{bin,json}.
//   node .tools/bake-lighting.mjs   (needs the game served on :5190)
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
const base=os.homedir()+'/.cache/ms-playwright/';
const exe=fs.readdirSync(base).filter(d=>d.startsWith('chromium-')).map(d=>base+d+'/chrome-linux64/chrome').find(fs.existsSync);
const browser=await chromium.launch({executablePath:exe,headless:true,args:['--use-angle=vulkan','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:320,height:180}});
page.on('console',m=>{if(/\[bake\]|rror/.test(m.text()))console.log(m.text());});
page.on('pageerror',e=>console.log('ERR',String(e)));
await page.addInitScript(()=>{try{localStorage.setItem('kino.settings',JSON.stringify({graphics:2}));}catch{}});
await page.goto('http://127.0.0.1:5190/index.html?bakeLight');
await page.waitForFunction(()=>kino?.debug.getState().ready,null,{timeout:300000});
await page.waitForFunction(()=>kino.lighting?.bakeResult,null,{timeout:3600000,polling:2000});
const meta=await page.evaluate(()=>kino.lighting.bakeResult.meta);
const chunks=[];
for(const key of ['solidRGB','powerRGB','dirRGB']){
  const len=await page.evaluate(k=>kino.lighting.bakeResult[k].length,key);
  for(let o=0;o<len;o+=4_000_000){
    const b64=await page.evaluate(([k,o])=>{const a=kino.lighting.bakeResult[k].subarray(o,o+4_000_000);let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return btoa(s);},[key,o]);
    chunks.push(Buffer.from(b64,'base64'));
  }
}
const out=new URL('../export/web/mods/lighting/',import.meta.url);
fs.writeFileSync(new URL('baked-light.bin.gz',out),(await import('node:zlib')).gzipSync(Buffer.concat(chunks),{level:9}));
fs.writeFileSync(new URL('baked-light.json',out),JSON.stringify(meta));
console.log('wrote',meta.dims.join('x'),'cells,',Buffer.concat(chunks).length,'bytes');
await browser.close();

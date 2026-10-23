// Headless check of the wiki (export/web/wiki): opens it on the local server, renders every page, and reports console
// errors, pages that failed to build, empty pages and links to pages that don't exist.
//   node .tools/wiki-check.mjs [--base http://127.0.0.1:5190] [--shots <dir> [topicId]] [--mobile]
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const base=arg('--base','http://127.0.0.1:5190'),shots=arg('--shots',null),only=shots?process.argv[process.argv.indexOf('--shots')+2]:null,mobile=process.argv.includes('--mobile');
const pw=process.env.HOME+'/.cache/ms-playwright',dir=readdirSync(pw).find(d=>d.startsWith('chromium_headless_shell'));
const b=await chromium.launch({executablePath:`${pw}/${dir}/chrome-headless-shell-linux64/chrome-headless-shell`});
const pg=await b.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
const errs=[];pg.on('pageerror',e=>errs.push('pageerror: '+e.message));pg.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text());});
pg.on('requestfailed',r=>errs.push('request failed: '+r.url()));pg.on('response',r=>{if(r.status()>=400)errs.push(`HTTP ${r.status()}: ${r.url()}`);});
await pg.goto(base+'/wiki/');await pg.waitForFunction(()=>window.wiki,null,{timeout:60000});
const report=await pg.evaluate(async()=>{
  const {topics,render}=window.wiki,known=new Set(),out={topics:[],bad:[],broken:[]};
  for(const t of topics){known.add(t.id);for(const p of t.pages)known.add(t.id+'/'+p.id);}
  const check=(where,html)=>{for(const m of html.matchAll(/href="#\/([^"]*)"/g)){const h=decodeURIComponent(m[1]).replace(/\/$/,'');if(h&&!h.startsWith('search/')&&!known.has(h))out.broken.push(`${where} → #/${h}`);}};
  for(const t of topics){out.topics.push(`${t.id}: ${t.pages.length} pages${t.error?' ERROR '+t.error:''}`);check(t.id+' intro',t.intro??'');
    const ids=new Set();for(const p of t.pages){if(ids.has(p.id))out.bad.push(`${t.id}/${p.id}: duplicate id`);ids.add(p.id);
      const html=await render(p);if(/failed to build/.test(html))out.bad.push(`${t.id}/${p.id}: ${html.match(/failed to build: ([^<]*)/)?.[1]}`);
      else if(html.replace(/<[^>]+>/g,'').trim().length<40)out.bad.push(`${t.id}/${p.id}: nearly empty`);check(`${t.id}/${p.id}`,html);}}
  return out;});
console.log(report.topics.join('\n'));
for(const [k,v] of [['Failed or empty pages',report.bad],['Broken links',report.broken],['Console',[...new Set(errs)]]])if(v.length)console.log(`\n${k} (${v.length}):\n  `+v.slice(0,60).join('\n  '));
if(shots){mkdirSync(shots,{recursive:true});const list=await pg.evaluate(o=>window.wiki.topics.filter(t=>!o||t.id===o).flatMap(t=>[`#/${t.id}`,...t.pages.slice(0,o?999:2).map(p=>`#/${t.id}/${encodeURIComponent(p.id)}`)]),only);
  for(const h of ['#/',...list]){await pg.evaluate(h=>location.hash=h,h);await pg.waitForTimeout(250);await pg.screenshot({path:`${shots}/${h.replace(/[^a-z0-9]+/gi,'_')||'home'}.png`,fullPage:true});}
  console.log(`\n${list.length+1} screenshots in ${shots}`);}
await b.close();

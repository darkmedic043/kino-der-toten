// Builds a custom map's navmesh off the main thread (custom-world.js; 2026-11-04: Nuketown's first build froze the
// loading screen for 7.5 s). Module workers get no import map, so the recast modules are fetched and their bare
// imports pointed at blob URLs of each other. Replies {data} (exportNavMesh bytes) or {error}.
const vendor=new URL('./vendor/',import.meta.url);
const blob=text=>URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
const source=async name=>{const r=await fetch(new URL(name,vendor));if(!r.ok)throw new Error(name+' '+r.status);return r.text();};
let recast=null;
async function load(){
  const core=blob((await source('recast-core.mjs')).replaceAll("'@recast-navigation/wasm'",JSON.stringify(new URL('recast-wasm.js',vendor).href)));
  const generators=blob((await source('recast-generators.mjs')).replaceAll("'@recast-navigation/core'",JSON.stringify(core)));
  const c=await import(core),g=await import(generators);await c.init();return {c,g};
}
onmessage=async e=>{
  try{recast??=load();const {c,g}=await recast;const t0=performance.now();
    const nav=g.generateTiledNavMesh(e.data.positions,e.data.indices,e.data.config);
    if(!nav.success)throw new Error('Navigation mesh generation failed: '+(nav.error??'unknown error'));
    const data=c.exportNavMesh(nav.navMesh);nav.navMesh.destroy?.();postMessage({data,ms:Math.round(performance.now()-t0)},[data.buffer]);}
  catch(err){recast=null;postMessage({error:String(err?.message??err)});}
};

// Allocation-free uniform setters (2026-11-21, engine).
//
// three's setters for vec3 and matrix uniforms are shared by every value type a uniform can hold (Vector3, Color, plain
// arrays, typed arrays), so their property reads go megamorphic and V8 then boxes every number they load: a heap sample of
// a played round put a third of all garbage there (setValueV3f 26%, setValueM4 6%, setValueM3 2%; lights are uploaded in
// view space, so with a moving camera every lit program gets its whole light list again each frame). The versions here
// branch on the value's type first, so each read sees one shape, and keep the last value in a Float64Array.
//
// The setters live on three's own uniform objects (program.getUniforms()), found by the stock function's name, so nothing
// in vendor/ is patched; a three update that renames them leaves the stock setters in place. fastUniforms(renderer) is
// called by the engine after the warm-up and in its one-second sweep, and only touches programs that have linked.
// ?slowUniforms keeps the stock setters (performance.md).
const done=new WeakSet(),m4=new Float32Array(16),m3=new Float32Array(9);
let stockV3=null,stockM4=null,stockM3=null;
function v3f(gl,v){
  const c=this.cache;let x,y,z;
  if(v.isVector3===true){x=v.x;y=v.y;z=v.z;}
  else if(v.isColor===true){x=v.r;y=v.g;z=v.b;}
  else{stockV3.call(this,gl,v);return;}
  if(c[0]!==x||c[1]!==y||c[2]!==z){gl.uniform3f(this.addr,x,y,z);c[0]=x;c[1]=y;c[2]=z;}
}
function mat4(gl,v){
  const e=v.elements;if(e===undefined||e.length!==16){stockM4.call(this,gl,v);return;}
  const c=this.cache;let i=0;while(i<16&&c[i]===e[i])i++;if(i===16)return;
  for(;i<16;i++)c[i]=e[i];m4.set(c);gl.uniformMatrix4fv(this.addr,false,m4);
}
function mat3(gl,v){
  const e=v.elements;if(e===undefined||e.length!==9){stockM3.call(this,gl,v);return;}
  const c=this.cache;let i=0;while(i<9&&c[i]===e[i])i++;if(i===9)return;
  for(;i<9;i++)c[i]=e[i];m3.set(c);gl.uniformMatrix3fv(this.addr,false,m3);
}
const cache=n=>new Float64Array(n).fill(NaN);   // NaN: the first value is always sent
function swap(u){
  const f=u.setValue;
  if(f.name==='setValueV3f'){stockV3??=f;u.cache=cache(3);u.setValue=v3f;return 1;}
  if(f.name==='setValueM4'){stockM4??=f;u.cache=cache(16);u.setValue=mat4;return 1;}
  if(f.name==='setValueM3'){stockM3??=f;u.cache=cache(9);u.setValue=mat3;return 1;}
  return 0;
}
const walk=c=>{let n=0;for(const u of c.seq){if(u.seq)n+=walk(u);else if(u.size===undefined&&typeof u.setValue==='function')n+=swap(u);}return n;};
export const uniformStats={programs:0,setters:0};
export function fastUniforms(renderer){
  const list=renderer.info.programs;if(!list)return 0;
  let n=0;
  for(const p of list){
    if(done.has(p))continue;
    try{if(typeof p.isReady==='function'&&!p.isReady())continue;done.add(p);const k=walk(p.getUniforms());uniformStats.programs++;uniformStats.setters+=k;n+=k;}
    catch(e){done.add(p);}
  }
  return n;
}

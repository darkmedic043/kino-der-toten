// Summarises a Chromium .cpuprofile (from bench-castle.mjs/bench-fps.mjs --profile): self time by function and file, and
// inclusive time for named functions (env INCL=comma,separated,names). node .tools/profile-summary.mjs out.cpuprofile [topN]
import fs from 'fs';
const [file, topN = '40'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map(); let total = 0;
const dt = p.timeDeltas; const samples = p.samples;
for (let i = 0; i < samples.length; i++) { const d = dt[i] ?? 0; total += d; self.set(samples[i], (self.get(samples[i]) ?? 0) + d); }
const name = n => { const f = n.callFrame; const u = (f.url || '').split('/').slice(-2).join('/'); return `${f.functionName || '(anon)'} ${u}:${f.lineNumber + 1}`; };
const agg = new Map(), byFile = new Map();
for (const [id, t] of self) { const n = byId.get(id); const k = name(n); agg.set(k, (agg.get(k) ?? 0) + t); const u = (n.callFrame.url || '(native)').split('/').slice(-1)[0]; byFile.set(u, (byFile.get(u) ?? 0) + t); }
const pct = t => (100 * t / total).toFixed(1).padStart(5) + '%';
console.log('total sampled', (total / 1e6).toFixed(1), 's');
console.log('\n-- self time by function');
for (const [k, t] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, +topN)) console.log(pct(t), k);
console.log('\n-- self time by file');
for (const [k, t] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(pct(t), k);
// inclusive time for functions matching a regex list
const want = (process.env.INCL || 'render,update,renderWorld,projectObject,renderBufferDirect,setProgram,updateMatrixWorld,shapecast,raycast,capsuleIntersect,_stepFixed,emit,composer,sortObjects,intersectsObject,uploadTexture,setValue,upload,mergeProps,instanceProps,sync,tag,tagShadows,bows,castle').split(',');
const incl = new Map();
for (const [id, t] of self) { const seen = new Set(); for (let q = id; q != null; q = parent.get(q)) { const k = name(byId.get(q)); const fn = byId.get(q).callFrame.functionName; if (want.some(w => fn === w || fn.startsWith(w)) && !seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + t); } } }
console.log('\n-- inclusive time (named functions)');
for (const [k, t] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(pct(t), k);

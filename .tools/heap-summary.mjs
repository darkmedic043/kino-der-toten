// node .tools/heap-summary.mjs file.heapprofile [rows] : bytes allocated by function (self), from a sampling heap profile
import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), by = new Map(); let total = 0;
const walk = (n, path) => { const f = n.callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; if (n.selfSize) { total += n.selfSize; const e = by.get(key) ?? { size: 0, callers: new Map() }; e.size += n.selfSize; const c = path.slice(-3).join(' < '); e.callers.set(c, (e.callers.get(c) ?? 0) + n.selfSize); by.set(key, e); } for (const c of n.children ?? []) walk(c, [...path, key]); };
walk(p.head, []);
console.log('total sampled', (total / 1048576).toFixed(1), 'MB');
for (const [k, e] of [...by].sort((a, b) => b[1].size - a[1].size).slice(0, +(process.argv[3] ?? 30))) { console.log((e.size / total * 100).toFixed(1).padStart(5) + '%', k); const c = [...e.callers].sort((a, b) => b[1] - a[1])[0]; if (c) console.log('         via', c[0].slice(0, 200)); }

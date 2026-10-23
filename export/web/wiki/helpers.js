// Shared building blocks for wiki topics (topics/*.js get these on ctx, plus ctx.link/href/find/pages from wiki.js).
// Everything returns HTML strings. Paths are relative to the site root (export/web), e.g. 'mods/gobblegums/gums.json'.
const ROOT=new URL('../',import.meta.url);
export const url=p=>new URL(p,ROOT).href;
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new Map();
// fetch a game data file once (shared by every topic). Rejects on HTTP errors.
export function json(p){if(!cache.has(p))cache.set(p,fetch(url(p)).then(r=>{if(!r.ok)throw new Error(`${p}: HTTP ${r.status}`);return r.json();}));return cache.get(p);}
export function text(p){const k='text:'+p;if(!cache.has(k))cache.set(k,fetch(url(p)).then(r=>{if(!r.ok)throw new Error(`${p}: HTTP ${r.status}`);return r.text();}));return cache.get(k);}
// a module from the game (e.g. a data table only exported from JS); path relative to the site root
export const load=p=>import(url(p));

export const num=n=>n==null||n===''?'—':typeof n==='number'?n.toLocaleString('en-US',{maximumFractionDigits:2}):esc(n);
export const pct=f=>f==null?'—':`${+(f*100).toFixed(1)}%`;
export const secs=s=>s==null?'—':`${+(+s).toFixed(2)} s`;
export const slug=s=>String(s).toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const cap=s=>String(s??'').replace(/(^|[\s_-])(\w)/g,(m,a,b)=>(a==='_'||a==='-'?' ':a)+b.toUpperCase());

// tiny markdown for prose: paragraphs, blank-line breaks, **bold**, *italic*, `code`, [text](#/topic/page), "- " lists, "## " headings
export function md(src){
  const inline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>').replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g,(m,t,h)=>`<a href="${h.replace(/"/g,'')}">${t}</a>`)
    // ctx.link() output dropped into prose stays a link (its label is already escaped)
    .replace(/&lt;a href=&quot;(#\/[^&"]*)&quot;&gt;(.*?)&lt;\/a&gt;/g,(m,h,t)=>`<a href="${h}">${t.replace(/&amp;(\w+|#\d+);/g,'&$1;')}</a>`);
  // a list straight under a line of text starts its own block
  src=String(src??'').replace(/^((?!\s*(?:[-*]|\d+\.) ).*\S.*)\n(?=\s*(?:[-*]|\d+\.) )/gm,'$1\n\n');
  return src.trim().split(/\n{2,}/).map(b=>{
    if(/^#{2,4} /.test(b)){const n=b.match(/^#+/)[0].length;return `<h${n}>${inline(b.slice(n+1))}</h${n}>`;}
    if(/^\s*[-*] /.test(b))return `<ul>${b.split(/\n(?=\s*[-*] )/).map(l=>`<li>${inline(l.replace(/^\s*[-*] /,''))}</li>`).join('')}</ul>`;
    if(/^\s*\d+\. /.test(b))return `<ol>${b.split(/\n(?=\s*\d+\. )/).map(l=>`<li>${inline(l.replace(/^\s*\d+\. /,''))}</li>`).join('')}</ol>`;
    return `<p>${inline(b).replace(/\n/g,'<br>')}</p>`;}).join('');
}
// a table. head: ['Name', ...]; rows: arrays of cells (HTML strings, or numbers). opts.cls adds a class ('compact', 'wide')
export const table=(head,rows,{cls=''}={})=>`<div class="tw"><table class="${cls}">${head?`<thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${typeof c==='number'?num(c):c??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
// the box at the top right of an item page. rows: [[label, valueHtml], ...] (null rows are skipped); img: url or HTML
export const infobox=({title,img,imgHtml,color,rows=[],foot})=>`<aside class="infobox" style="--c:${color??'var(--gold)'}">${title?`<b class="ib-t">${esc(title)}</b>`:''}
  ${imgHtml??(img?`<img src="${img}" alt="" loading="lazy">`:'')}<dl>${rows.filter(Boolean).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v??'—'}</dd>`).join('')}</dl>${foot?`<p class="ib-f">${foot}</p>`:''}</aside>`;
// hidden until clicked (Easter egg steps, secret unlocks)
export const spoiler=(label,html)=>`<details class="spoiler"><summary>${esc(label??'Spoiler')} <span>click to reveal</span></summary><div>${html}</div></details>`;
export const badge=(t,color)=>`<span class="badge" style="--c:${color??'var(--muted)'}">${esc(t)}</span>`;
export const note=(html,kind='')=>`<div class="note ${kind}">${html}</div>`;
// a grid of small cards inside a page. items: [{href, title, sub, img, color}]
export const cards=items=>`<div class="cards">${items.map(i=>`<a class="card" ${i.href?`href="${i.href}"`:''} style="--c:${i.color??'var(--line-strong)'}">${i.img?`<span class="ci" style="background-image:url('${i.img}')"></span>`:''}<b>${esc(i.title)}</b>${i.sub?`<small>${esc(i.sub)}</small>`:''}</a>`).join('')}</div>`;
// a stat bar (0..1) for comparisons
export const bar=(f,label)=>`<span class="sbar" title="${esc(label??'')}"><i style="width:${Math.max(0,Math.min(1,f))*100}%"></i></span>`;

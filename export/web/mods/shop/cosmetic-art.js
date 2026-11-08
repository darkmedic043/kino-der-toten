// Menu pictures for the kill effects and titles (Shop drawer and grid, Melon Pass tab), 2026-11-08.
// Kill effects: a small looping SVG of a zombie bust and the effect (SMIL, no blur filters). Titles: a nameplate.
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const BUST='<path d="M30 64c2-14 10-20 20-21-6-3-9-9-9-15 0-8 6-14 13-14s13 6 13 14c0 6-3 12-9 15 10 1 18 7 20 21z" fill="#1d1a16" stroke="#3a342b"/>';
const loop=(attr,vals,dur,begin=0)=>`<animate attributeName="${attr}" values="${vals}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`;
function particles(n,make){let s='';for(let i=0;i<n;i++)s+=make(i,n);return s;}
const ART={
  payout:()=>`<circle cx="54" cy="38" r="4" fill="#ffd36a" opacity="0">${loop('r','4;26;4','1.6')}${loop('opacity','.9;0;0','1.6')}</circle>`+
    particles(9,(i,n)=>{const a=-Math.PI*(.15+.7*i/(n-1)),dx=Math.cos(a)*30,b=(i%3)*.12;
      return `<ellipse cx="54" cy="38" rx="3.2" ry="3.2" fill="#f2c14a" stroke="#8a5a12" stroke-width=".8">${loop('cx',`54;${54+dx};${54+dx*1.4}`,'1.6',b)}${loop('cy',`38;${16+(i%2)*6};66`,'1.6',b)}${loop('rx','3.2;.6;3.2;.6;3.2','.4')}</ellipse>`;}),
  swarm:()=>particles(10,(i)=>{const x=40+i*3,b=(i%5)*.25,w=i%2?6:-6;
      return `<g opacity="0">${loop('opacity','0;1;1;0','2',b)}<animateTransform attributeName="transform" type="translate" values="${x-54} 0;${x-54+w} -14;${x-54-w} -30;${x-54+w*2} -46" dur="2s" begin="${b}s" repeatCount="indefinite"/><ellipse cx="54" cy="44" rx="2.4" ry="3" fill="#f2b51f"/><rect x="51.6" y="43.4" width="4.8" height="1.1" fill="#1a1408"/><ellipse cx="52" cy="41" rx="2" ry="1.4" fill="#e6f2ff" opacity=".8">${loop('ry','1.4;.4;1.4','.12')}</ellipse></g>`;})+
    `<ellipse cx="54" cy="44" rx="10" ry="6" fill="#d9a031" opacity="0">${loop('opacity','.45;0;0','2')}${loop('rx','10;24;24','2')}</ellipse>`,
  grounded:()=>`<path d="M58 0l-7 14 6 2-9 14 5 2-7 16" fill="none" stroke="#cfe6ff" stroke-width="2.4" stroke-linejoin="round" opacity="0">${loop('opacity','1;0;0;0;0;0','1.8')}</path>`+
    `<rect width="108" height="64" fill="#8fb4ff" opacity="0">${loop('opacity','.25;0;0;0;0;0','1.8')}</rect>`+
    particles(6,(i)=>{const x=46+i*3.5,b=.1+i*.08;return `<circle cx="${x}" cy="40" r="3" fill="#3a3a3e" opacity="0">${loop('opacity','0;.8;0',1.7,b)}${loop('cy','40;20;8',1.7,b)}${loop('r','3;6;8',1.7,b)}</circle>`;})+
    particles(6,(i)=>{const dx=(i-2.5)*7,b=.05;return `<circle cx="54" cy="40" r="1.2" fill="#7fb8ff" opacity="0">${loop('opacity','1;0;0','1.8',b)}${loop('cx',`54;${54+dx};${54+dx}`,'1.8',b)}${loop('cy','40;30;46','1.8',b)}</circle>`;}),
  tolled:()=>`<circle cx="54" cy="38" r="6" fill="none" stroke="#d8ccb0" stroke-width="2" opacity="0">${loop('r','6;40;40','2.2')}${loop('opacity','.9;0;0','2.2')}</circle>`+
    `<circle cx="54" cy="38" r="6" fill="none" stroke="#a89a7c" stroke-width="1.4" opacity="0">${loop('r','6;30;30','2.2','.25')}${loop('opacity','.6;0;0','2.2','.25')}</circle>`+
    particles(4,(i)=>{const x=46+i*6,b=.2+i*.1;return `<circle cx="${x}" cy="44" r="5" fill="#8c8c8c" opacity="0">${loop('opacity','0;.45;0','2.2',b)}${loop('cy','44;30;22','2.2',b)}${loop('r','5;9;12','2.2',b)}</circle>`;})+
    `<path d="M88 12c0-4 3-6 5-6s5 2 5 6v5l2 3h-14l2-3z" fill="#c9a86a" opacity="0">${loop('opacity','1;1;0;0','2.2')}<animateTransform attributeName="transform" type="rotate" values="-14 93 6;14 93 6;-14 93 6" dur=".6s" repeatCount="indefinite"/></path>`,
};
export function killFxSvg(id){
  const art=ART[id]?.()??'';
  return `<svg viewBox="0 0 108 64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"><rect width="108" height="64" fill="#0d0c0a"/>${BUST}${art}</svg>`;
}
// a nameplate: the player's name over the title, as the scoreboard and the co-op lobby show it
export function titlePlate(title,name='SURVIVOR'){
  return `<div style="display:grid;place-content:center;gap:4px;height:100%;background:linear-gradient(135deg,#17140f,#0a0908);text-align:center;font-family:Barlow Condensed,Arial Narrow,Arial,sans-serif">`+
    `<span style="color:#cfc7b6;font-size:13px;letter-spacing:.14em">${esc(name)}</span><b style="color:#f0c060;font-size:17px;letter-spacing:.16em;text-transform:uppercase">${esc(title)}</b></div>`;
}

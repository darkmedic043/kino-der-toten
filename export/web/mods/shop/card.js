// Calling cards (Phase 6): a 300x64 SVG drawn from the card's two colours and pattern, with the player's name.
// Used by the main menu's profile card, the pause menu, the co-op lobby and the Shop page.
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function rng(seed){let h=seed>>>0||1;return ()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return (h>>>0)/4294967296;};}
export function cardSvg(d,title='',sub=''){
  const r=rng([...(d.pattern+d.c2)].reduce((a,c)=>a*31+c.charCodeAt(0),7)),c1=d.c1,c2=d.c2;let art='';
  if(d.pattern==='stripes')for(let x=-80;x<320;x+=26)art+=`<path d="M${x} 64L${x+40} 0h10L${x+10} 64z" fill="${c2}" opacity=".35"/>`;
  else if(d.pattern==='rings')for(let i=1;i<9;i++)art+=`<circle cx="250" cy="32" r="${i*14}" fill="none" stroke="${c2}" stroke-opacity="${.7-i*.07}" stroke-width="2"/>`;
  else if(d.pattern==='seeds'){art+=`<path d="M190 64a80 80 0 0 1 160 0z" fill="${c2}" opacity=".85"/><path d="M196 64a74 74 0 0 1 148 0" fill="none" stroke="#7cd65a" stroke-width="6"/>`;for(let i=0;i<14;i++)art+=`<ellipse cx="${210+r()*120}" cy="${30+r()*30}" rx="2" ry="4" fill="#111"/>`;}
  else if(d.pattern==='noise')for(let i=0;i<260;i++)art+=`<rect x="${r()*300}" y="${r()*64}" width="${1+r()*5}" height="1.5" fill="${c2}" opacity="${r()*.7}"/>`;
  else if(d.pattern==='stars'){art+=`<ellipse cx="230" cy="32" rx="90" ry="26" fill="${c2}" opacity=".3"/>`;for(let i=0;i<60;i++)art+=`<circle cx="${r()*300}" cy="${r()*64}" r="${r()*1.4+.3}" fill="#fff" opacity="${.4+r()*.6}"/>`;}
  else if(d.pattern==='moon')art+=`<circle cx="250" cy="30" r="22" fill="${c2}"/><circle cx="250" cy="30" r="34" fill="${c2}" opacity=".15"/>`;
  return `<svg class="kcard" viewBox="0 0 300 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="kg${d.pattern}" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c1}" stop-opacity=".75"/></linearGradient></defs>
    <rect width="300" height="64" fill="url(#kg${d.pattern})"/>${art}<rect width="300" height="64" fill="none" stroke="${c2}" stroke-opacity=".6"/>
    <text x="12" y="30" font-family="Barlow Condensed,Arial Narrow,Arial,sans-serif" font-weight="700" font-size="20" fill="#fff">${esc(title)}</text>
    <text x="12" y="49" font-family="Arial,sans-serif" font-size="10" letter-spacing="2" fill="#ffffffaa">${esc(sub)}</text></svg>`;
}

// Prestige camo art (Phase 4, reworked): 6 styles per tier, each drawn from a gun's palette and seed, with a weapon-class
// motif laid over it. Every texture tiles (shapes are drawn at their wrap offsets).
//   Prestige I  (bold two-tone):  shards, chevrons, splinter, contour, scales, brush
//   Prestige II (ornate metal):   lattice, filigree, damascus, mosaic, carbon, facets
//   Master      (animated glow):  cracks, circuit, runes, lightning, magma, constellation; each has a base and a glow mask
//                                 (white = glowing), animated in camo.js's shader
// Class motifs: sniper scope rings, shotgun buckshot, SMG speed lines, AR chevron marks, LMG belt links, pistol
// engraving, launcher blast rays, special glyph runes.
// Hand-made: the Siren's Wailing Tide (I), Choir Grille (II) and Song of Circe (Master); the GDL Havoc's Danger Close (I),
// Live Ordnance (II) and Chain Reaction (Master); the ROC 20mm's Ammo Crate (I), Breechworks (II) and Flak Night (Master);
// the XM325's Voltaic (I), Fated (II) and Cobalt Circuit (Master); the Hive Launcher's Honeycomb (I), Apiary (II) and
// Hivemind (Master).
// Hand-made designs for one gun (named in .tools/prestige-guns.json, not in STYLES so no other gun is dealt them)
const OWN=new Set(['wailtide','choirgrille','songofcirce','dangerclose','liveordnance','chainreaction','ammocrate','breechworks','flaknight','voltaic','fated','cobaltcircuit','honeycomb','apiary','hivemind','verdigris','gildedrequiem','deathknell','promissory','giltledger','finalnotice']);
export const STYLES={1:['shards','chevrons','splinter','contour','scales','brush'],2:['lattice','filigree','damascus','mosaic','carbon','facets'],3:['cracks','circuit','runes','lightning','magma','constellation']};

const hsl=(h,s,l,a=1)=>`hsla(${((h%360)+360)%360},${s}%,${l}%,${a})`;
export function rng(seed){let h=seed>>>0||1;return ()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return (h>>>0)/4294967296;};}
function wrapper(g,S){return fn=>{for(const dx of [-S,0,S])for(const dy of [-S,0,S]){g.save();g.translate(dx,dy);fn();g.restore();}};}
function poly(g,pts){g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();}
// toroidal voronoi (cell index and the gap to the second-nearest point: small = on an edge)
function voronoi(S,n,r){const pts=[...Array(n)].map(()=>[r()*S,r()*S]),cell=new Int16Array(S*S),edge=new Float32Array(S*S);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){let d1=1e9,d2=1e9,c=0;for(let i=0;i<n;i++){let dx=Math.abs(x-pts[i][0]),dy=Math.abs(y-pts[i][1]);if(dx>S/2)dx=S-dx;if(dy>S/2)dy=S-dy;const d=dx*dx+dy*dy;if(d<d1){d2=d1;d1=d;c=i;}else if(d<d2)d2=d;}
    cell[y*S+x]=c;edge[y*S+x]=Math.sqrt(d2)-Math.sqrt(d1);}return {cell,edge,pts};}

// ---- Prestige I ------------------------------------------------------------------------------------------------
const P1={
  // the ROC 20mm's Prestige I: olive crate planks with seams and nails, yellow lot bands, stencilled 20MM HE and rows of shells
  ammocrate(g,S,r,p,w){const P=S/8,TAU=6.283;g.fillStyle=hsl(p.h,30,17);g.fillRect(0,0,S,S);
    for(let k=0;k<8;k++){g.fillStyle=hsl(p.h,28+r()*8,14+r()*7);g.fillRect(0,k*P+1,S,P-2);for(let i=0;i<40;i++){g.strokeStyle=hsl(p.h,25,10+r()*12,.35);g.lineWidth=1;const y=k*P+3+r()*(P-6),x=r()*S;g.beginPath();g.moveTo(x,y);g.lineTo(x+60+r()*160,y+(r()-.5)*2);g.stroke();}
      g.fillStyle=hsl(p.h,30,7);g.fillRect(0,k*P,S,2);for(let x=0;x<S;x+=S/4){const o=(k%2)*S/8;g.fillStyle=hsl(p.h,20,32);g.beginPath();g.arc(x+o+10,k*P+8,2.2,0,TAU);g.arc(x+o+10,k*P+P-8,2.2,0,TAU);g.fill();}}
    for(let i=0;i<2;i++){const y=Math.floor(r()*8)*P+P*.3;g.fillStyle=hsl(p.h2,80,48);g.fillRect(0,y,S,P*.14);g.fillRect(0,y+P*.26,S,P*.06);}
    const words=['20MM HE','ROC','LOT 7-24','HE-T','20 X 102','LIVE'];g.textBaseline='middle';
    for(let i=0;i<12;i++){const x=r()*S,y=(Math.floor(r()*8)+.55)*P,t=words[Math.floor(r()*words.length)],yel=r()<.45;w(()=>{g.font='bold 30px monospace';g.fillStyle=yel?hsl(p.h2,75,52,.9):'rgba(10,10,6,.75)';g.fillText(t,x,y);});}
    for(let i=0;i<7;i++){const x=r()*S,y=r()*S,n=4+Math.floor(r()*4);w(()=>{for(let k=0;k<n;k++){const yy=y+k*13;g.fillStyle=hsl(p.h2,45,30);g.fillRect(x,yy,34,9);g.fillStyle=hsl(p.h2,55,40);g.fillRect(x,yy+1,34,2);
      g.fillStyle=hsl(p.h,25,26);g.beginPath();g.moveTo(x+34,yy);g.lineTo(x+44,yy+2.5);g.quadraticCurveTo(x+52,yy+4.5,x+44,yy+6.5);g.lineTo(x+34,yy+9);g.closePath();g.fill();g.fillStyle=hsl(p.h2,80,45);g.fillRect(x+36,yy,2.5,9);}});}},
  // the GDL Havoc's Prestige I: hazard-stripe bands between dark plates, stencilled 40MM blocks and two-tone blast stars
  dangerclose(g,S,r,p,w){g.fillStyle=hsl(p.h,25,10);g.fillRect(0,0,S,S);const B=S/4,st=S/16;
    for(let b=0;b<4;b++){if(b%2)continue;const y0=b*B+B*.18,y1=y0+B*.64;g.save();g.beginPath();g.rect(0,y0,S,y1-y0);g.clip();
      g.fillStyle=hsl(p.h2,85,52);g.fillRect(0,y0,S,y1-y0);g.fillStyle=hsl(p.h,30,8);
      for(let x=-S;x<S*2;x+=st*2){poly(g,[[x,y0],[x+st,y0],[x+st+(y1-y0),y1],[x+(y1-y0),y1]]);g.fill();}g.restore();
      g.fillStyle=hsl(p.h,20,6);g.fillRect(0,y0-3,S,3);g.fillRect(0,y1,S,3);}
    for(let i=0;i<14;i++){const cx=r()*S,cy=(Math.floor(r()*2)*2+1)*B+B*(.25+r()*.5),R=14+r()*26,n=7+Math.floor(r()*5),a0=r()*6.283,hot=r()<.5;
      const pts=[...Array(n*2)].map((_,k)=>{const a=a0+k/(n*2)*6.283,rr=k%2?R*.38:R*(.75+r()*.45);return [cx+Math.cos(a)*rr,cy+Math.sin(a)*rr];});
      w(()=>{g.fillStyle=hot?hsl(p.h,80,46):hsl(p.h2,70,40,.85);poly(g,pts);g.fill();g.strokeStyle=hsl(p.h,25,6);g.lineWidth=2;g.stroke();});}
    g.font='bold 20px monospace';g.textBaseline='middle';
    for(let i=0;i<6;i++){const x=r()*S,y=(Math.floor(r()*2)*2+1)*B+B*(.2+r()*.6),t=['40MM','HE-DP','RW-842','DANGER'][Math.floor(r()*4)];
      w(()=>{g.fillStyle=hsl(p.h2,60,62,.8);g.fillText(t,x,y);});}},
  // the Siren's Prestige I (hand-made, .tools/prestige-guns.json): rows of mirrored sound waves, bold ribbons in two tones
  wailtide(g,S,r,p,w){g.fillStyle=hsl(p.h,35,11);g.fillRect(0,0,S,S);const n=6,H=S/n,TAU=6.283;
    for(let j=0;j<n;j++){const cy=j*H+H/2,k=2+Math.floor(r()*4),m=1+Math.floor(r()*2),ph=r()*TAU,ph2=r()*TAU,A=H*.46,hot=j%3===1,l=26+r()*12;
      const env=x=>.3+.7*Math.abs(Math.sin(Math.PI*m*x/S+ph2)),top=[],bot=[];
      for(let x=0;x<=S;x+=4){const a=A*env(x)*(.45+.55*Math.abs(Math.sin(TAU*k*x/S+ph)));top.push([x,cy-a]);bot.push([x,cy+a]);}
      w(()=>{g.fillStyle=hot?hsl(p.h2,70,46):hsl(p.h,55,l);poly(g,[...top,...bot.reverse()]);bot.reverse();g.fill();
        g.strokeStyle=hot?hsl(p.h2,85,72):hsl(p.h,70,l+22);g.lineWidth=1.4;g.beginPath();top.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
        g.beginPath();bot.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
        g.strokeStyle=hsl(p.h,30,8);g.lineWidth=2;g.beginPath();g.moveTo(0,cy);g.lineTo(S,cy);g.stroke();});
      // a thin echo between the rows
      const ey=(j+1)*H,ek=4+Math.floor(r()*5),eph=r()*TAU;w(()=>{g.strokeStyle=hsl(p.h2,60,55,.55);g.lineWidth=1.2;g.beginPath();for(let x=0;x<=S;x+=4)g.lineTo(x,ey+Math.sin(TAU*ek*x/S+eph)*H*.08);g.stroke();});}},
  shards(g,S,r,p,w){g.fillStyle=hsl(p.h,30,16);g.fillRect(0,0,S,S);for(let i=0;i<90;i++){const x=r()*S,y=r()*S,len=40+r()*150,wd=8+r()*30,a=r()*Math.PI,l=26+r()*36,sh=(r()-.5)*40;
    const pts=[[0,-wd*.2],[len*.55,-wd],[len,0],[len*.4,wd]].map(([u,v])=>[x+u*Math.cos(a)-v*Math.sin(a),y+u*Math.sin(a)+v*Math.cos(a)]);
    w(()=>{g.fillStyle=hsl(p.h+sh,55,l);poly(g,pts);g.fill();g.strokeStyle=hsl(p.h+sh,80,l+25);g.lineWidth=1.2;g.stroke();});}},
  chevrons(g,S,r,p,w){g.fillStyle=hsl(p.h,35,20);g.fillRect(0,0,S,S);const n=8,st=S/n;for(let i=0;i<n;i++)for(let j=0;j<n+1;j++){const x=i*st,y=j*st-st/2+(i%2)*st/2;
    g.fillStyle=(i+j)%3?hsl(p.h,55,34+r()*10):hsl(p.h2,65,48);poly(g,[[x,y],[x+st/2,y+st*.45],[x+st,y],[x+st,y+st*.35],[x+st/2,y+st*.8],[x,y+st*.35]]);g.fill();}},
  splinter(g,S,r,p){const P=8;g.fillStyle=hsl(p.h,35,22);g.fillRect(0,0,S,S);const cols=[hsl(p.h,50,34),hsl(p.h,45,14),hsl(p.h2,55,42),hsl(p.h,25,52)];
    for(let i=0;i<420;i++){const x=Math.floor(r()*S/P)*P,y=Math.floor(r()*S/P)*P,wd=P*(2+Math.floor(r()*9)),ht=P*(1+Math.floor(r()*2));g.fillStyle=cols[i%4];g.fillRect(x,y,wd,ht);if(x+wd>S)g.fillRect(x-S,y,wd,ht);}},
  contour(g,S0,r,p){const S=S0/2,g0=g;const c0=document.createElement('canvas');c0.width=c0.height=S;g=c0.getContext('2d');   // per pixel: drawn at half size, scaled up
    const c=[...Array(5)].map(()=>[r()*S,r()*S,20+r()*45]);
    const img=g.createImageData(S,S),d=img.data;for(let y=0;y<S;y++)for(let x=0;x<S;x++){let v=0;for(const [cx,cy,rad] of c){let dx=Math.abs(x-cx),dy=Math.abs(y-cy);if(dx>S/2)dx=S-dx;if(dy>S/2)dy=S-dy;v+=Math.exp(-(dx*dx+dy*dy)/(2*rad*rad));}
      const band=Math.min(6,Math.floor(v*7)),line=Math.abs((v*7)%1-.5)>.42,l=(line?62:18+band*6)/100,s=.5,hh=((p.h+(line?p.h2-p.h:0))%360)/360;
      const q=l<.5?l*(1+s):l+s-l*s,pp=2*l-q,f=t=>{t=(t+1)%1;return t<1/6?pp+(q-pp)*6*t:t<.5?q:t<2/3?pp+(q-pp)*(2/3-t)*6:pp;};
      const i=(y*S+x)*4;d[i]=f(hh+1/3)*255;d[i+1]=f(hh)*255;d[i+2]=f(hh-1/3)*255;d[i+3]=255;}g.putImageData(img,0,0);g0.drawImage(c0,0,0,S0,S0);},
  scales(g,S,r,p){g.fillStyle=hsl(p.h,40,12);g.fillRect(0,0,S,S);const R=26;for(let row=-1;row*R*.75<S+R;row++)for(let col=-1;col*R*2<S+R*2;col++){const cx=col*R*2+(row%2?R:0),cy=row*R*.75,l=30+r()*18;
    const gr=g.createRadialGradient(cx,cy-R*.4,2,cx,cy,R*1.1);gr.addColorStop(0,hsl(p.h,60,l+22));gr.addColorStop(1,hsl(p.h,55,l-14));g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R,0,Math.PI);g.closePath();g.fill();g.strokeStyle=hsl(p.h2,70,55);g.lineWidth=1.5;g.stroke();}},
  brush(g,S,r,p,w){g.fillStyle=hsl(p.h,25,24);g.fillRect(0,0,S,S);for(let i=0;i<40;i++){const x=r()*S,y=r()*S,len=120+r()*240,a=(r()-.5)*.8,wd=12+r()*30,col=i%3?hsl(p.h,55,12+r()*14):hsl(p.h2,70,45);
    w(()=>{g.save();g.translate(x,y);g.rotate(a);g.fillStyle=col;g.beginPath();g.moveTo(0,0);for(let k=0;k<=10;k++)g.lineTo(k/10*len,Math.sin(k*.9+i)*wd*.25-wd*(1-Math.abs(k/5-1))*.5);for(let k=10;k>=0;k--)g.lineTo(k/10*len,Math.sin(k*.9+i)*wd*.25+wd*(1-Math.abs(k/5-1))*.5);g.fill();g.restore();});}},
  // the XM325's Prestige I: bold electric zig-zag bands across a slate plate, bolt stencils and belt markings
  voltaic(g,S,r,p,w){const TAU=6.283;g.fillStyle=hsl(p.h,22,13);g.fillRect(0,0,S,S);
    for(let i=0;i<60;i++){const x=r()*S,y=r()*S,R=20+r()*50;w(()=>{g.fillStyle=hsl(p.h,20,9+r()*8,.35);g.beginPath();g.arc(x,y,R,0,TAU);g.fill();});}
    const seg=S/8;
    for(let b=0;b<3;b++){const y=b*S/3+r()*S/8,amp=14+r()*14,th=16+r()*8,pts=[...Array(9)].map((_,k)=>[k*seg,y+(k%2?amp:-amp)]);
      w(()=>{g.lineJoin='miter';g.lineCap='butt';const path=()=>{g.beginPath();pts.forEach(([x,yy],i)=>i?g.lineTo(x,yy):g.moveTo(x,yy));};
        g.strokeStyle=hsl(p.h,30,6);g.lineWidth=th+8;path();g.stroke();g.strokeStyle=hsl(p.h2,85,52);g.lineWidth=th;path();g.stroke();
        g.strokeStyle=hsl(p.h2,90,82);g.lineWidth=th*.25;path();g.stroke();});}
    const bolt=(x,y,k)=>poly(g,[[x,y],[x+9*k,y],[x+4*k,y+11*k],[x+11*k,y+11*k],[x-2*k,y+30*k],[x+2*k,y+16*k],[x-5*k,y+16*k]]);
    for(let i=0;i<10;i++){const x=r()*S,y=r()*S,k=.8+r()*.7,lit=r()<.5;w(()=>{bolt(x,y,k);g.fillStyle=lit?hsl(p.h2,85,60):hsl(p.h,25,24);g.fill();});}
    const words=['XM325','LEYDEN','500 RD','RIST RAUCH','HV'];g.textBaseline='middle';
    for(let i=0;i<8;i++){const x=r()*S,y=r()*S,t=words[Math.floor(r()*words.length)];w(()=>{g.font='bold 22px monospace';g.fillStyle=hsl(p.h,20,30,.8);g.fillText(t,x,y);});}},
  // the Hive Launcher's: a slab of comb (wax walls, amber honey cells with a shine, pale wax caps, empty and brood
  // cells) with honey running down over it
  honeycomb(g,S,r,p,w){const TAU=6.283;g.fillStyle=hsl(p.h,45,9);g.fillRect(0,0,S,S);
    const kind=[],sh=[];for(let i=0;i<224;i++){const v=r();kind.push(v<.45?1:v<.75?2:v<.9?0:3);sh.push(r());}
    hexGrid(S,(x,y,i,a,b)=>{hexPath(g,x,y,a,b,.97);g.fillStyle=hsl(p.h,50,20+sh[i]*6);g.fill();const k=kind[i];hexPath(g,x,y,a,b,.8);
      if(k===1){const gr=g.createRadialGradient(x-4,y-5,2,x,y,a);gr.addColorStop(0,hsl(p.h2,95,60));gr.addColorStop(1,hsl(p.h2,90,28+sh[i]*8));g.fillStyle=gr;g.fill();
        g.fillStyle=hsl(p.h2,100,86,.6);g.beginPath();g.ellipse(x-5,y-6,5,2.4,-.5,0,TAU);g.fill();}
      else if(k===2){const gr=g.createRadialGradient(x-3,y-4,1,x,y,a);gr.addColorStop(0,hsl(p.h2,60,84));gr.addColorStop(1,hsl(p.h2,45,58));g.fillStyle=gr;g.fill();}
      else if(k===3){g.fillStyle=hsl(p.h,55,27+sh[i]*6);g.fill();}
      else{g.fillStyle=hsl(p.h,50,5);g.fill();g.strokeStyle=hsl(p.h,40,15);g.lineWidth=2;hexPath(g,x,y,a,b,.6);g.stroke();}});
    for(let i=0;i<14;i++){const x=r()*S,y=r()*S,len=30+r()*80,wd=5+r()*5,bulb=r()<.65;
      w(()=>{g.lineCap='round';g.strokeStyle=hsl(p.h2,90,30);g.lineWidth=wd+3;g.beginPath();g.moveTo(x,y);g.lineTo(x,y+len);g.stroke();g.strokeStyle=hsl(p.h2,95,50);g.lineWidth=wd;g.stroke();
        if(bulb){g.fillStyle=hsl(p.h2,95,48);g.beginPath();g.arc(x,y+len+wd*.4,wd*.95,0,TAU);g.fill();}
        g.strokeStyle=hsl(p.h2,100,84,.7);g.lineWidth=1.5;g.beginPath();g.moveTo(x-wd*.25,y+4);g.lineTo(x-wd*.25,y+len-4);g.stroke();});}},
  // the Grave Bell's Prestige I: oxidised bronze, verdigris blooming over it, sound rings engraved in it and MEMENTO MORI bands
  verdigris(g,S,r,p,w){const TAU=6.283,n=rng(p.seed*7+1);g.fillStyle=hsl(p.h,34,22);g.fillRect(0,0,S,S);
    for(let i=0;i<150;i++){const x=r()*S,y=r()*S,R=12+r()*58,k=r(),c=k<.55?hsl(p.h,42+r()*18,32+r()*16,.55):k<.8?hsl(p.h2,58,26+r()*12,.5):hsl(p.h,25,11,.5);
      w(()=>{const gr=g.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,c);gr.addColorStop(1,hsl(p.h,34,22,0));g.fillStyle=gr;g.fillRect(x-R,y-R,R*2,R*2);});}
    for(let i=0;i<2600;i++){g.fillStyle=n()<.7?hsl(p.h,50,55+n()*20,.35):hsl(p.h2,60,40,.35);g.fillRect(n()*S,n()*S,1+n()*1.5,1+n()*1.5);}
    for(let i=0;i<7;i++){const x=r()*S,y=r()*S,cnt=3+Math.floor(r()*4),st=9+r()*6,arcs=[...Array(cnt)].map(()=>[r()*TAU,(.55+r()*.45)*TAU]);
      w(()=>{g.lineCap='round';for(let k=0;k<cnt;k++){const R=st*(k+1),[a0,al]=arcs[k];
        g.strokeStyle=hsl(p.h,40,9,.85);g.lineWidth=2.6;g.beginPath();g.arc(x,y,R,a0,a0+al);g.stroke();
        g.strokeStyle=hsl(p.h,45,60,.45);g.lineWidth=1;g.beginPath();g.arc(x+1,y+1.2,R,a0,a0+al);g.stroke();}});}
    g.textBaseline='middle';g.textAlign='center';
    for(let b=0;b<2;b++){const y=b*S/2+S/8+r()*S/8,ox=r()*S/2;
      w(()=>{for(const yy of [y-15,y+15]){g.strokeStyle=hsl(p.h,40,9,.85);g.lineWidth=2.4;g.beginPath();g.moveTo(0,yy);g.lineTo(S,yy);g.stroke();g.strokeStyle=hsl(p.h,45,60,.4);g.lineWidth=1;g.beginPath();g.moveTo(0,yy+1.2);g.lineTo(S,yy+1.2);g.stroke();}
        g.font='bold 21px serif';for(const x of [ox,ox+S/2]){g.fillStyle=hsl(p.h,45,62,.45);g.fillText('MEMENTO ✠ MORI',x+1,y+1.3);g.fillStyle=hsl(p.h,40,8,.9);g.fillText('MEMENTO ✠ MORI',x,y);}});
      for(let i=0;i<9;i++){const x=r()*S,len=20+r()*70,wd=2+r()*4;w(()=>{const gr=g.createLinearGradient(0,y+16,0,y+16+len);gr.addColorStop(0,hsl(p.h,55,48,.6));gr.addColorStop(1,hsl(p.h,55,48,0));g.fillStyle=gr;g.fillRect(x,y+16,wd,len);});}}
    g.textAlign='start';},
};
// ---- Prestige II ---------------------------------------------------------------------------------------------------
const gold=(g,x0,y0,x1,y1)=>{const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,'#fff0b8');gr.addColorStop(.5,'#c9952f');gr.addColorStop(1,'#ffe39a');return gr;};
const P2={
  // the ROC 20mm's Prestige II: engine-turned gunmetal (overlapping machined swirls), riveted breech plates and brass rivets
  breechworks(g,S,r,p,w){const G=32,TAU=6.283;g.fillStyle=hsl(p.h,12,20);g.fillRect(0,0,S,S);
    for(let row=0;row<S/G+1;row++)for(let col=0;col<S/G+1;col++){const cx=col*G+(row%2)*G/2,cy=row*G*.85,a=r()*TAU,l=22+r()*14;w(()=>{const gr=g.createRadialGradient(cx-6,cy-6,2,cx,cy,G*.62);
      gr.addColorStop(0,hsl(p.h,14,l+22));gr.addColorStop(.55,hsl(p.h,12,l));gr.addColorStop(1,hsl(p.h,14,l-10));g.fillStyle=gr;g.beginPath();g.arc(cx,cy,G*.62,0,TAU);g.fill();
      g.strokeStyle=hsl(p.h,10,l+30,.35);g.lineWidth=1;for(let k=1;k<6;k++){g.beginPath();g.arc(cx,cy,k*3.4,a+k*.5,a+k*.5+2.4);g.stroke();}});}
    const seams=[...Array(3)].map(()=>[Math.floor(r()*16)*G,r()<.5]);
    for(const [o,vert] of seams)w(()=>{g.fillStyle=hsl(p.h,15,6);vert?g.fillRect(o-2,0,4,S):g.fillRect(0,o-2,S,4);g.fillStyle=hsl(p.h,10,40,.5);vert?g.fillRect(o+2,0,1,S):g.fillRect(0,o+2,S,1);
      for(let t=G/2;t<S;t+=G){const x=vert?o+9:t,y=vert?t:o+9;const gr=g.createRadialGradient(x-1.5,y-1.5,.5,x,y,5);gr.addColorStop(0,hsl(p.h2,80,78));gr.addColorStop(.5,hsl(p.h2,65,45));gr.addColorStop(1,hsl(p.h2,50,18));g.fillStyle=gr;g.beginPath();g.arc(x,y,5,0,TAU);g.fill();}});
    for(let i=0;i<6;i++){const x=r()*S,y=r()*S;w(()=>{g.font='bold 15px monospace';g.fillStyle=hsl(p.h2,55,55,.8);g.fillText('ROC-20 · '+(1000+Math.floor(x*7)%9000),x,y);});}},
  // the GDL Havoc's Prestige II: gilded 40 mm rounds laid in staggered rows on dark enamel, riveted rails between the rows
  liveordnance(g,S,r,p,w){g.fillStyle=hsl(p.h,45,13);g.fillRect(0,0,S,S);for(let i=0;i<300;i++){g.fillStyle=hsl(p.h,40,9+r()*10,.4);g.fillRect(r()*S,r()*S,2+r()*3,1);}
    const R=8,H=S/8;
    for(let j=0;j<8;j++){const cy=j*H+H/2,off=j%2?S/16:0,flip=j%2;
      g.fillStyle=gold(g,0,cy-H/2,0,cy-H/2+5);g.fillRect(0,cy-H/2,S,4);for(let x=8;x<S;x+=S/16){g.fillStyle='#3a2a10';g.beginPath();g.arc(x+off*.5,cy-H/2+2,1.6,0,6.283);g.fill();}
      for(let i=0;i<8;i++){const cx=i*S/8+off+S/16,dir=flip?-1:1,x0=cx-26*dir,x1=cx+18*dir;
        w(()=>{g.fillStyle=gold(g,0,cy-R,0,cy+R);g.fillRect(Math.min(x0,cx-6*dir),cy-R,Math.abs(cx-6*dir-x0),R*2);   // the case
          g.fillStyle=hsl(p.h,55,30);g.fillRect(Math.min(cx-6*dir,x1-8*dir),cy-R*.92,Math.abs(x1-8*dir-(cx-6*dir)),R*1.84);   // the enamel body
          g.beginPath();g.ellipse(x1-8*dir,cy,9,R*.92,0,dir>0?-Math.PI/2:Math.PI/2,dir>0?Math.PI/2:Math.PI*1.5);g.fillStyle=hsl(p.h,60,38);g.fill();   // the nose
          g.fillStyle=gold(g,0,cy-R,0,cy+R);g.fillRect(cx-7*dir-(dir<0?3:0),cy-R,3,R*2);g.fillRect(x0-(dir>0?0:3)+dir*2,cy-R-1,3,R*2+2);   // driving band, rim
          g.strokeStyle='rgba(40,25,5,.7)';g.lineWidth=1;g.strokeRect(Math.min(x0,x1),cy-R,Math.abs(x1-x0),R*2);
          g.fillStyle='rgba(255,240,190,.35)';g.fillRect(Math.min(x0,x1)+2,cy-R*.7,Math.abs(x1-x0)-4,2);});}}},
  // the Siren's Prestige II: a gilded speaker grille, staggered perforations broken by engraved speaker cones with gem domes
  choirgrille(g,S,r,p,w){g.fillStyle=hsl(p.h,55,30);g.fillRect(0,0,S,S);for(let i=0;i<260;i++){const y=r()*S;g.strokeStyle=hsl(p.h,50,22+r()*28,.3);g.lineWidth=1;g.beginPath();g.moveTo(0,y);g.lineTo(S,y);g.stroke();}
    const cones=[...Array(5)].map(()=>[r()*S,r()*S,34+r()*24]),near=(x,y)=>cones.some(([cx,cy,R])=>{let dx=Math.abs(x-cx),dy=Math.abs(y-cy);if(dx>S/2)dx=S-dx;if(dy>S/2)dy=S-dy;return dx*dx+dy*dy<(R+7)**2;});
    const G=16;for(let row=0;row<S/G;row++)for(let col=0;col<S/G;col++){const x=col*G+(row%2?G/2:0)+G/4,y=row*G+G/2;if(near(x,y))continue;
      g.fillStyle=hsl(p.h2,40,7);g.beginPath();g.arc(x,y,4.6,0,6.283);g.fill();g.strokeStyle=hsl(p.h,75,66,.8);g.lineWidth=1;g.beginPath();g.arc(x,y,5.4,.6,2.6);g.stroke();}
    for(const [cx,cy,R] of cones)w(()=>{for(let k=0;k<6;k++){const rr=R-k*R/7;g.fillStyle=hsl(p.h,55+k*3,k%2?24:38);g.beginPath();g.arc(cx,cy,rr,0,6.283);g.fill();g.strokeStyle=hsl(p.h,80,70,.7);g.lineWidth=1.2;g.stroke();}
      const gr=g.createRadialGradient(cx-R*.08,cy-R*.08,1,cx,cy,R*.24);gr.addColorStop(0,hsl(p.h2,80,78));gr.addColorStop(1,hsl(p.h2,70,22));g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R*.24,0,6.283);g.fill();
      g.strokeStyle=hsl(p.h,40,14);g.lineWidth=2;g.beginPath();g.arc(cx,cy,R+2,0,6.283);g.stroke();});},
  lattice(g,S,r,p){const R=30,W=Math.sqrt(3)*R;g.fillStyle=hsl(p.h,40,15);g.fillRect(0,0,S,S);for(let row=-1;row*R*1.5<S+R;row++)for(let col=-1;col*W<S+W;col++){const cx=col*W+(row%2?W/2:0),cy=row*R*1.5,l=30+r()*30;
    const gr=g.createLinearGradient(cx-R,cy-R,cx+R,cy+R);gr.addColorStop(0,hsl(p.h,65,l+15));gr.addColorStop(1,hsl(p.h,60,l-12));g.beginPath();for(let k=0;k<6;k++){const a=Math.PI/6+k*Math.PI/3;g.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));}g.closePath();g.fillStyle=gr;g.fill();g.strokeStyle=gold(g,cx-R,cy,cx+R,cy);g.lineWidth=2.5;g.stroke();}},
  filigree(g,S,r,p,w){g.fillStyle=hsl(p.h,45,14);g.fillRect(0,0,S,S);g.lineCap='round';for(let i=0;i<34;i++){const x=r()*S,y=r()*S,rad=20+r()*40,turns=1.5+r()*1.5,dir=r()<.5?1:-1;
    w(()=>{g.strokeStyle=gold(g,x-rad,y-rad,x+rad,y+rad);g.lineWidth=2.2;g.beginPath();for(let t=0;t<=1;t+=.01){const a=dir*t*turns*6.283,rr=rad*(1-t);g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}g.stroke();
      g.fillStyle=hsl(p.h2,70,55);g.beginPath();g.arc(x,y,3,0,6.283);g.fill();});}},
  damascus(g,S0,r,p){const S=S0/2,img=g.createImageData(S,S),d=img.data,k=[r()*6,r()*6,r()*6];   // half size, scaled up
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const u=x/S*6.283,v=y/S*6.283;
    const f=Math.sin(u*3+Math.sin(v*2+k[0])*2.2+Math.sin(u+v+k[1])*1.4)*.5+.5,band=Math.pow(Math.abs(Math.sin(f*Math.PI*6+k[2])),.4);
    const base=60+band*150,i=(y*S+x)*4;d[i]=base*(.8+.2*Math.cos(p.h/57.3));d[i+1]=base*(.8+.2*Math.cos((p.h-120)/57.3));d[i+2]=base*(.85+.15*Math.cos((p.h-240)/57.3));d[i+3]=255;}blit(g,img,S,S0);},
  mosaic(g,S,r,p){const v=voronoi(S/2,40,r),T=S/2,img=g.createImageData(T,T),cols=[...Array(40)].map(()=>[p.h+(r()-.5)*60,50+r()*30,30+r()*30]);
    for(let i=0;i<T*T;i++){const e=v.edge[i],[h,s,l]=cols[v.cell[i]],lead=e<2.2;const c=lead?[200,170,90]:hslRgb(h,s/100,l/100).map(x=>x*255);d4(img.data,i,c);}
    const c2=document.createElement('canvas');c2.width=c2.height=T;c2.getContext('2d').putImageData(img,0,0);g.imageSmoothingEnabled=false;g.drawImage(c2,0,0,S,S);},
  carbon(g,S,r,p){const C=16;g.fillStyle='#0c0c0e';g.fillRect(0,0,S,S);for(let y=0;y<S;y+=C)for(let x=0;x<S;x+=C){const vert=((x+y)/C)%2<1;const gr=vert?g.createLinearGradient(x,y,x+C,y):g.createLinearGradient(x,y,x,y+C);
    gr.addColorStop(0,hsl(p.h,25,10));gr.addColorStop(.5,hsl(p.h,40,32));gr.addColorStop(1,hsl(p.h,25,10));g.fillStyle=gr;g.fillRect(x+1,y+1,C-2,C-2);}
    g.strokeStyle=gold(g,0,0,S,S);g.globalAlpha=.6;g.lineWidth=2;for(let i=0;i<S;i+=S/4){g.beginPath();g.moveTo(0,i);g.lineTo(S,i);g.stroke();}g.globalAlpha=1;},
  facets(g,S,r,p){const T=64;for(let y=0;y<S;y+=T)for(let x=0;x<S;x+=T)for(const tri of [[[x,y],[x+T,y],[x,y+T]],[[x+T,y],[x+T,y+T],[x,y+T]]]){g.fillStyle=hsl(p.h+(r()-.5)*30,55+r()*25,30+r()*45);poly(g,tri);g.fill();}
    g.strokeStyle='rgba(255,240,200,.45)';g.lineWidth=1;for(let i=0;i<=S;i+=T){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.moveTo(0,i);g.lineTo(S,i);g.moveTo(i,0);g.lineTo(0,i);g.moveTo(S,i);g.lineTo(i,S);g.stroke();}},
  // the XM325's Prestige II: the Fates' medallions in gilt on dark bronze, three threads spun in each, tied by cords
  fated(g,S,r,p,w){const TAU=6.283,G=128;g.fillStyle=hsl(p.h,35,12);g.fillRect(0,0,S,S);
    for(let i=0;i<500;i++){g.fillStyle=hsl(p.h,30,8+r()*12,.4);g.fillRect(r()*S,r()*S,2+r()*3,1);}
    const gold=(x0,y0,x1,y1)=>{const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,hsl(p.h2,70,28));gr.addColorStop(.45,hsl(p.h2,85,62));gr.addColorStop(.55,hsl(p.h2,90,78));gr.addColorStop(1,hsl(p.h2,70,30));return gr;};
    g.lineCap='round';
    for(let y=0;y<=S;y+=G)for(let x=0;x<=S;x+=G){   // cords between medallions (drawn on every edge, so they tile)
      g.strokeStyle=gold(x,y-3,x,y+3);g.lineWidth=3;g.beginPath();for(let t=0;t<=G;t+=4)g.lineTo(x+t,y+G/2+Math.sin(t/G*TAU*2)*5);g.stroke();
      g.strokeStyle=gold(x-3,y,x+3,y);g.beginPath();for(let t=0;t<=G;t+=4)g.lineTo(x+G/2+Math.sin(t/G*TAU*2)*5,y+t);g.stroke();
      g.fillStyle=hsl(p.h2,80,55);g.beginPath();g.arc(x,y+G/2,4,0,TAU);g.arc(x+G/2,y,4,0,TAU);g.fill();}
    for(let y=G/2;y<S;y+=G)for(let x=G/2;x<S;x+=G){const R=40,rot=r()*TAU;
      g.fillStyle=hsl(p.h,40,9);g.beginPath();g.arc(x,y,R+4,0,TAU);g.fill();
      g.strokeStyle=gold(x-R,y-R,x+R,y+R);g.lineWidth=5;g.beginPath();g.arc(x,y,R,0,TAU);g.stroke();g.lineWidth=1.5;g.beginPath();g.arc(x,y,R-7,0,TAU);g.stroke();
      for(let k=0;k<24;k++){const a=k/24*TAU;g.lineWidth=2;g.beginPath();g.moveTo(x+Math.cos(a)*(R-6),y+Math.sin(a)*(R-6));g.lineTo(x+Math.cos(a+.1)*(R-2),y+Math.sin(a+.1)*(R-2));g.stroke();}
      g.lineWidth=3;for(let k=0;k<3;k++){const a0=rot+k*TAU/3;g.beginPath();for(let t=0;t<=1;t+=.04){const a=a0+t*3.2,d=t*(R-12);g.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d);}g.stroke();}
      g.fillStyle=hsl(p.h2,90,80);g.beginPath();g.arc(x,y,4,0,TAU);g.fill();}},
  // the Hive Launcher's: a painted bee box (planks with grain and chipped paint, seams with brass rivets, brass hand
  // holds, APIARY stencils) crawling with brass bees
  apiary(g,S,r,p,w){const TAU=6.283,H=S/4;
    const brass=(x0,y0,x1,y1)=>{const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,hsl(p.h2,70,26));gr.addColorStop(.45,hsl(p.h2,85,58));gr.addColorStop(.55,hsl(p.h2,90,76));gr.addColorStop(1,hsl(p.h2,70,28));return gr;};
    for(let k=0;k<4;k++){const y0=k*H,l=54+r()*10;g.fillStyle=hsl(p.h,48,l);g.fillRect(0,y0,S,H);g.lineWidth=1.2;
      for(let j=0;j<12;j++){const yy=y0+8+r()*(H-16),amp=2+r()*5,f=1+Math.floor(r()*3),ph=r()*TAU;g.strokeStyle=hsl(p.h,35,l-16,.5);g.beginPath();for(let x=0;x<=S;x+=8)g.lineTo(x,yy+Math.sin(x/S*TAU*f+ph)*amp);g.stroke();}}
    for(let i=0;i<30;i++){const x=r()*S,y=r()*S,R=4+r()*12,pts=[...Array(7)].map((_,k)=>[x+Math.cos(k/7*TAU)*R*(.6+r()*.6),y+Math.sin(k/7*TAU)*R*(.6+r()*.6)]);
      w(()=>{poly(g,pts);g.fillStyle=hsl(28,35,30);g.fill();});}
    for(let y=0;y<=S;y+=H){g.fillStyle=hsl(p.h,40,16);g.fillRect(0,y-3,S,6);
      for(let x=32;x<S;x+=64)for(const dy of [-12,12]){g.fillStyle=brass(x-5,y+dy-5,x+5,y+dy+5);g.beginPath();g.arc(x,y+dy,5,0,TAU);g.fill();g.strokeStyle=hsl(p.h2,60,20);g.lineWidth=1;g.stroke();}}
    const words=['APIARY','HIVE No.7','LIVE BEES','QUEEN INSIDE','THIS SIDE UP','HONEY'];
    for(let i=0;i<6;i++){const j=i%4,t=words[i%words.length],x=((i>>2)*.5+.25+j*.13+(r()-.5)*.05)*S,y=(r(),j)*H+H*(.38+r()*.24),rot=(r()-.5)*.1,sz=20+r()*12;   // one slot each (two a plank, staggered), so stencils never overlap
      w(()=>{g.save();g.translate(x,y);g.rotate(rot);g.font=`900 ${sz}px Impact, "Arial Black", sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillStyle=hsl(p.h,30,18,.8);g.fillText(t,0,0);g.restore();});}
    for(let i=0;i<2;i++){const j=i+2,x=((.75+j*.13+(r()-.5)*.04)%1)*S,y=(r(),j)*H+H*.5;   // the hand holds: planks 2-3, opposite their one stencil
      w(()=>{g.fillStyle=brass(x-50,y-22,x+50,y+22);g.beginPath();g.roundRect(x-50,y-22,100,44,10);g.fill();g.strokeStyle=hsl(p.h2,60,22);g.lineWidth=2;g.stroke();
        g.fillStyle=hsl(p.h,30,8);g.beginPath();g.roundRect(x-36,y-9,72,18,9);g.fill();
        for(const sx of [-43,43]){g.fillStyle=hsl(p.h2,50,30);g.beginPath();g.arc(x+sx,y,3,0,TAU);g.fill();}});}
    for(let i=0;i<9;i++){const x=r()*S,y=r()*S,rot=r()*TAU,s=.8+r()*.6;
      w(()=>{g.save();g.translate(x,y);g.rotate(rot);g.scale(s,s);g.lineWidth=1.5;
        for(const sy of [-1,1]){g.fillStyle='rgba(255,250,230,.4)';g.strokeStyle=hsl(p.h2,70,32);g.beginPath();g.ellipse(-2,10*sy,10,5,.4*sy,0,TAU);g.fill();g.stroke();}
        g.fillStyle=brass(-14,-8,14,8);g.beginPath();g.ellipse(0,0,14,8,0,0,TAU);g.fill();g.strokeStyle=hsl(p.h2,60,20);g.stroke();
        g.lineWidth=2.5;for(const sx of [-5,1,7]){const hh=8*Math.sqrt(1-(sx/14)**2)-.5;g.beginPath();g.moveTo(sx,-hh);g.lineTo(sx,hh);g.stroke();}
        g.fillStyle=brass(-21,-5,-11,5);g.beginPath();g.arc(-16,0,5,0,TAU);g.fill();g.lineWidth=1.2;g.stroke();
        g.beginPath();g.moveTo(-19,-2);g.lineTo(-26,-8);g.moveTo(-19,2);g.lineTo(-26,8);g.stroke();
        g.fillStyle=hsl(p.h2,60,20);poly(g,[[13,-2],[20,0],[13,2]]);g.fill();g.restore();});}},
  // the Grave Bell's Prestige II: Gilded Requiem: gold leaf laid in squares (seams, crackle), black enamel skulls set in it
  gildedrequiem(g,S,r,p,w){const TAU=6.283,L=64,n=S/L;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const l=50+r()*14,gr=g.createLinearGradient(x*L,y*L,x*L+L,y*L+L);
      gr.addColorStop(0,hsl(p.h,80,l+12));gr.addColorStop(.5,hsl(p.h,75,l-8));gr.addColorStop(1,hsl(p.h,85,l+6));g.fillStyle=gr;g.fillRect(x*L,y*L,L,L);}
    g.strokeStyle=hsl(p.h,60,26,.7);g.lineWidth=1.2;for(let i=0;i<=n;i++){g.beginPath();g.moveTo(i*L,0);g.lineTo(i*L,S);g.moveTo(0,i*L);g.lineTo(S,i*L);g.stroke();}
    for(let i=0;i<60;i++){const x=r()*S,y=r()*S,pts=[[x,y]];let a=r()*TAU;for(let k=0;k<5;k++){a+=(r()-.5)*1.6;const q=pts[k];pts.push([q[0]+Math.cos(a)*(6+r()*10),q[1]+Math.sin(a)*(6+r()*10)]);}
      w(()=>{g.strokeStyle=hsl(p.h,55,24,.55);g.lineWidth=.8;g.beginPath();pts.forEach((q,k)=>k?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.stroke();});}
    const skull=(s)=>{g.beginPath();g.arc(0,-4*s,13*s,Math.PI*.82,Math.PI*.18);g.lineTo(8*s,10*s);g.lineTo(-8*s,10*s);g.closePath();};
    for(let y=0;y<S/128;y++)for(let x=0;x<S/128;x++)for(const [ox,oy] of [[0,0],[64,64]]){const cx=x*128+32+ox,cy=y*128+32+oy,s=1.9,rot=(r()-.5)*.25;
      w(()=>{g.save();g.translate(cx,cy);g.rotate(rot);
        skull(s);g.fillStyle='#0b0908';g.fill();g.strokeStyle=gold(g,-16,-20,16,14);g.lineWidth=2.4;g.stroke();
        g.fillStyle=gold(g,-10,-10,10,4);for(const sx of [-1,1]){g.beginPath();g.ellipse(sx*5.2*s,-3*s,3.6*s,4.2*s,0,0,TAU);g.fill();}
        g.fillStyle='#0b0908';for(const sx of [-1,1]){g.beginPath();g.ellipse(sx*5.2*s,-2.6*s,2.4*s,3*s,0,0,TAU);g.fill();}
        g.fillStyle=gold(g,-3,0,3,6);poly(g,[[0,1.5*s],[-2*s,5*s],[2*s,5*s]]);g.fill();
        g.strokeStyle=gold(g,-8,6,8,10);g.lineWidth=1.2;for(let t=-3;t<=3;t++){g.beginPath();g.moveTo(t*2.2*s,6.5*s);g.lineTo(t*2.2*s,10*s);g.stroke();}
        g.restore();});
      const dx=cx+64,dy=cy;w(()=>{g.fillStyle='#0b0908';poly(g,[[dx,dy-7],[dx+5,dy],[dx,dy+7],[dx-5,dy]]);g.fill();g.strokeStyle=hsl(p.h,70,70);g.lineWidth=1;g.stroke();});}},
};
function hslRgb(h,s,l){h=((h%360)+360)%360/360;const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return l-a*Math.max(-1,Math.min(k-3,9-k,1));};return [f(0),f(8),f(4)];}
export { hslRgb };
const d4=(d,i,[r,g,b])=>{d[i*4]=r;d[i*4+1]=g;d[i*4+2]=b;d[i*4+3]=255;};

// ---- Master (base, glow) ----------------------------------------------------------------------------------------------
// Each returns the base on `g` (dark, the gun's colour) or, with glow=true, a white-on-black mask of what lights up.
const PM={
  // the ROC 20mm's Master: a night sky full of tracer streams (every fifth round lit) and flak bursts; tracers and bursts glow
  flaknight(g,S,r,p,w,glow){const TAU=6.283,n=rng(p.seed*7+1);g.fillStyle=glow?'#000':hsl(p.h,45,7);g.fillRect(0,0,S,S);
    if(!glow){for(let i=0;i<900;i++){g.fillStyle=`rgba(255,255,255,${n()*.22})`;g.fillRect(n()*S,n()*S,1,1);}for(let i=0;i<14;i++){const x=n()*S,y=n()*S,R=40+n()*70;w(()=>{const gr=g.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,hsl(p.h,25,16,.6));gr.addColorStop(1,hsl(p.h,25,10,0));g.fillStyle=gr;g.fillRect(x-R,y-R,2*R,2*R);});}}
    const A=-.55-r()*.25;
    for(let i=0;i<16;i++){const x=r()*S,y=r()*S,a=A+(r()-.5)*.35,len=220+r()*260,bend=(r()-.5)*.0012,ph=r()*48;
      w(()=>{g.lineCap='round';for(let t=ph;t<len;t+=48){const x1=x+Math.cos(a)*t,y1=y+Math.sin(a)*t+bend*t*t,x2=x+Math.cos(a)*(t+16),y2=y+Math.sin(a)*(t+16)+bend*(t+16)*(t+16);
        g.strokeStyle=glow?'rgba(255,255,255,.9)':hsl(p.h2,85,50);g.lineWidth=glow?3.2:2.4;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();}});}
    for(let i=0;i<9;i++){const x=r()*S,y=r()*S,R=22+r()*26,puffs=[...Array(10)].map(()=>[r()*TAU,R*(.7+r()*.4),5+r()*7]),bits=[...Array(16)].map(()=>[r()*TAU,R*(1.2+r()*.9)]);
      w(()=>{for(const [a,d,pr] of puffs){g.fillStyle=glow?'rgba(255,255,255,.28)':hsl(p.h,15,22,.85);g.beginPath();g.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,pr,0,TAU);g.fill();}
        const gr=g.createRadialGradient(x,y,0,x,y,R*.8);gr.addColorStop(0,glow?'rgba(255,255,255,1)':hsl(p.h2,90,70));gr.addColorStop(1,glow?'rgba(255,255,255,0)':hsl(p.h2,80,30,0));g.fillStyle=gr;g.beginPath();g.arc(x,y,R*.8,0,TAU);g.fill();
        g.fillStyle=glow?'rgba(255,255,255,.8)':hsl(p.h2,70,55);for(const [a,d] of bits)g.fillRect(x+Math.cos(a)*d,y+Math.sin(a)*d,2,2);});}},
  // the GDL Havoc's Master: shockwave rings racing out of blast cores, scorched rays and stuck-round beacons; rings,
  // rays and beacons glow and pulse
  chainreaction(g,S,r,p,w,glow){const TAU=6.283;g.fillStyle=glow?'#000':hsl(p.h,40,7);g.fillRect(0,0,S,S);
    if(!glow){const n=rng(p.seed*7+1);for(let i=0;i<700;i++){g.fillStyle=hsl(p.h,30,5+n()*9,.6);g.fillRect(n()*S,n()*S,2,2);}}   // own generator: the glow must keep r()'s sequence
    const cores=[...Array(7)].map(()=>[r()*S,r()*S,60+r()*70]);
    for(const [cx,cy,R] of cores){const n=14+Math.floor(r()*8),rays=[...Array(n)].map(()=>[r()*TAU,R*(.5+r()*.8)]),gaps=[...Array(4)].map(()=>r()*TAU);
      w(()=>{g.strokeStyle=glow?'rgba(255,255,255,.55)':hsl(p.h,35,14);g.lineWidth=2;for(const [a,l] of rays){g.beginPath();g.moveTo(cx+Math.cos(a)*8,cy+Math.sin(a)*8);g.lineTo(cx+Math.cos(a)*l,cy+Math.sin(a)*l);g.stroke();}
        for(let k=1;k<=4;k++){g.strokeStyle=glow?`rgba(255,255,255,${1-k*.18})`:hsl(p.h2,30,14+k*2);g.lineWidth=glow?4-k*.6:2.4;
          for(let s=0;s<3;s++){const a=gaps[k-1]+s*TAU/3;g.beginPath();g.arc(cx,cy,R*k/4,a,a+TAU/3-.35);g.stroke();}}
        g.fillStyle=glow?'#fff':hsl(p.h,50,22);g.beginPath();g.arc(cx,cy,9,0,TAU);g.fill();});}
    for(let i=0;i<16;i++){const x=r()*S,y=r()*S;w(()=>{g.fillStyle=glow?'#fff':hsl(p.h,25,16);g.fillRect(x-4,y-7,8,14);g.fillStyle=glow?'rgba(255,255,255,.9)':hsl(p.h2,60,30);g.beginPath();g.arc(x,y-3,2.4,0,TAU);g.fill();});}},
  // the Siren's Master: oscilloscope traces and voice-print bars over a graticule; the traces and bars glow and pulse
  songofcirce(g,S,r,p,w,glow){const TAU=6.283;g.fillStyle=glow?'#000':hsl(p.h,45,7);g.fillRect(0,0,S,S);
    if(!glow){g.strokeStyle=hsl(p.h,30,12);g.lineWidth=1;for(let x=0;x<S;x+=32){g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,S);g.stroke();g.beginPath();g.moveTo(0,x+.5);g.lineTo(S,x+.5);g.stroke();}}
    for(let i=0;i<8;i++){const cy=(i+.2+r()*.6)*S/8,k=1+Math.floor(r()*3),m=1+Math.floor(r()*2),A=12+r()*20,ph=r()*TAU,ph2=r()*TAU,ph3=r()*TAU;
      w(()=>{g.strokeStyle=glow?'#fff':hsl(p.h,40,24);g.lineWidth=glow?2.6:2;g.beginPath();
        for(let x=0;x<=S;x+=4){const e=.35+.65*Math.sin(Math.PI*m*x/S+ph3)**2;g.lineTo(x,cy+A*e*(.7*Math.sin(TAU*k*x/S+ph)+.3*Math.sin(TAU*k*5*x/S+ph2)));}g.stroke();});}
    for(let i=0;i<7;i++){const x0=r()*S,cy=(i+.5)*S/7,n=18+Math.floor(r()*14),H=30+r()*36,ph=r()*TAU,hs=[...Array(n)].map((_,k)=>H*(.25+.6*Math.abs(Math.sin(k*.45+ph))+.15*r()));
      w(()=>{g.fillStyle=glow?'rgba(255,255,255,.85)':hsl(p.h2,35,20);hs.forEach((h,k)=>g.fillRect(x0+k*6,cy-h/2,3.2,h));});}
    for(let i=0;i<5;i++){const cx=r()*S,cy=r()*S,a0=r()*TAU;w(()=>{g.strokeStyle=glow?'rgba(255,255,255,.7)':hsl(p.h,35,18);g.lineWidth=1.6;for(let k=1;k<=3;k++){g.beginPath();g.arc(cx,cy,10+k*12,a0,a0+1.4);g.stroke();g.beginPath();g.arc(cx,cy,10+k*12,a0+Math.PI,a0+Math.PI+1.4);g.stroke();}});}},
  cracks(g,S,r,p,w,glow){const T=256,v=voronoi(T,34,r),img=g.createImageData(T,T),shade=[...Array(34)].map(()=>.6+r()*.8);
    for(let i=0;i<T*T;i++){const e=v.edge[i];if(glow){const k=Math.max(0,1-e/3.2)**1.5*255;d4(img.data,i,[k,k,k]);}else{const c=hslRgb(p.h+200,.35,.09*shade[v.cell[i]]),rim=Math.max(0,1-e/6)*.25;d4(img.data,i,c.map(x=>(x+rim)*255));}}
    blit(g,img,T,S);},
  circuit(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h,30,8);g.fillRect(0,0,S,S);g.strokeStyle=glow?'#fff':hsl(p.h,30,20);g.lineWidth=3;const G=32;
    for(let i=0;i<80;i++){let x=Math.floor(r()*S/G)*G,y=Math.floor(r()*S/G)*G;const pts=[[x,y]];for(let k=0;k<4;k++){if(r()<.5)x+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));else y+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));pts.push([x,y]);}
      w(()=>{g.beginPath();pts.forEach(([a,b],k)=>k?g.lineTo(a,b):g.moveTo(a,b));g.stroke();g.fillStyle=glow?'#fff':hsl(p.h,40,30);g.beginPath();g.arc(x,y,5,0,6.283);g.fill();});}},
  runes(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h,35,7);g.fillRect(0,0,S,S);const glyphs='ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for(let i=0;i<13;i++){const cx=r()*S,cy=r()*S,R=28+r()*34;w(()=>{g.strokeStyle=glow?'#fff':hsl(p.h,30,18);g.lineWidth=2;g.beginPath();g.arc(cx,cy,R,0,6.283);g.stroke();g.beginPath();g.arc(cx,cy,R-14,0,6.283);g.stroke();
      g.fillStyle=glow?'#fff':hsl(p.h,30,22);g.font='bold 13px serif';g.textAlign='center';g.textBaseline='middle';const n=10;for(let k=0;k<n;k++){const a=k/n*6.283;g.save();g.translate(cx+Math.cos(a)*(R-7),cy+Math.sin(a)*(R-7));g.rotate(a+Math.PI/2);g.fillText(glyphs[Math.floor(r()*glyphs.length)],0,0);g.restore();}});}},
  lightning(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h,40,8);g.fillRect(0,0,S,S);if(!glow){for(let i=0;i<500;i++){g.fillStyle=hsl(p.h,30,10+r()*10);g.fillRect(r()*S,r()*S,2,2);}}
    const bolt=(x,y,a,len,wd,depth)=>{const pts=[[x,y]];for(let k=0;k<8;k++){a+=(r()-.5)*.9;x+=Math.cos(a)*len/8;y+=Math.sin(a)*len/8;pts.push([x,y]);}
      w(()=>{g.strokeStyle=glow?'#fff':hsl(p.h,35,20);g.lineWidth=wd;g.beginPath();pts.forEach(([a1,b1],k)=>k?g.lineTo(a1,b1):g.moveTo(a1,b1));g.stroke();});
      if(depth<2)for(let k=0;k<2;k++){const [bx,by]=pts[2+Math.floor(r()*5)];bolt(bx,by,a+(r()-.5)*1.6,len*.55,wd*.6,depth+1);}};
    for(let i=0;i<7;i++)bolt(r()*S,r()*S,r()*6.283,180+r()*140,3,0);},
  magma(g,S,r,p,w,glow){const T=160,c=[...Array(6)].map(()=>[r()*T,r()*T,25+r()*45]),img=g.createImageData(T,T);
    for(let y=0;y<T;y++)for(let x=0;x<T;x++){let v=0;for(const [cx,cy,rad] of c){let dx=Math.abs(x-cx),dy=Math.abs(y-cy);if(dx>T/2)dx=T-dx;if(dy>T/2)dy=T-dy;v+=Math.exp(-(dx*dx+dy*dy)/(2*rad*rad));}
      const f=Math.abs((v*6)%1-.5),line=Math.max(0,1-f*9);const i=y*T+x;if(glow){const k=line*255;d4(img.data,i,[k,k,k]);}else{const col=hslRgb(p.h+10,.5,.06+v*.05);d4(img.data,i,col.map(q=>q*255));}}
    blit(g,img,T,S);},
  constellation(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h+220,45,6);g.fillRect(0,0,S,S);if(!glow){for(let i=0;i<900;i++){g.fillStyle=`rgba(255,255,255,${r()*.25})`;g.fillRect(r()*S,r()*S,1,1);}}
    for(let i=0;i<20;i++){let x=r()*S,y=r()*S;const pts=[[x,y]];for(let k=0;k<4+Math.floor(r()*3);k++){x+=(r()-.5)*110;y+=(r()-.5)*110;pts.push([x,y]);}
      w(()=>{g.strokeStyle=glow?'rgba(255,255,255,.65)':hsl(p.h,30,18);g.lineWidth=1.5;g.beginPath();pts.forEach(([a,b],k)=>k?g.lineTo(a,b):g.moveTo(a,b));g.stroke();
        for(const [a,b] of pts){g.fillStyle=glow?'#fff':hsl(p.h,40,30);g.beginPath();g.arc(a,b,glow?4:3,0,6.283);g.fill();}});}},
  // the XM325's Master: Cobalt Circuit: a cobalt board of 45-degree traces and Leyden-jar capacitor rings (the glow)
  cobaltcircuit(g,S,r,p,w,glow){const TAU=6.283,G=32,n=rng(p.seed*5+3);g.fillStyle=glow?'#000':hsl(p.h,65,10);g.fillRect(0,0,S,S);
    if(!glow){for(let y=0;y<S;y+=G)for(let x=0;x<S;x+=G){g.fillStyle=hsl(p.h,55,12+n()*4);g.fillRect(x+1,y+1,G-2,G-2);}
      g.strokeStyle=hsl(p.h,50,18,.6);g.lineWidth=1;for(let i=0;i<=S;i+=G/2){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.moveTo(0,i);g.lineTo(S,i);g.stroke();}}
    const D=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    for(let i=0;i<34;i++){let x=Math.floor(r()*16)*G,y=Math.floor(r()*16)*G,d=Math.floor(r()*8);const pts=[[x,y]],steps=3+Math.floor(r()*7);
      for(let k=0;k<steps;k++){if(r()<.35)d=(d+(r()<.5?1:7))%8;x+=D[d][0]*G;y+=D[d][1]*G;pts.push([x,y]);}
      const wide=r()<.3;
      w(()=>{g.lineCap='round';g.lineJoin='round';if(!glow){g.strokeStyle=hsl(p.h,40,5);g.lineWidth=wide?9:6;g.beginPath();pts.forEach(([a,b],j)=>j?g.lineTo(a,b):g.moveTo(a,b));g.stroke();}
        g.strokeStyle=glow?'rgba(255,255,255,.95)':hsl(p.h2,80,42);g.lineWidth=wide?4:2.4;g.beginPath();pts.forEach(([a,b],j)=>j?g.lineTo(a,b):g.moveTo(a,b));g.stroke();
        for(const [a,b] of [pts[0],pts.at(-1)]){g.fillStyle=glow?'#fff':hsl(p.h2,70,60);g.beginPath();g.arc(a,b,wide?6:4.5,0,TAU);g.fill();if(!glow){g.fillStyle=hsl(p.h,60,8);g.beginPath();g.arc(a,b,2,0,TAU);g.fill();}}});}
    for(let i=0;i<6;i++){const x=Math.floor(r()*16)*G+G/2,y=Math.floor(r()*16)*G+G/2;
      w(()=>{for(let k=0;k<3;k++){g.strokeStyle=glow?`rgba(255,255,255,${.9-k*.25})`:hsl(p.h2,75,55-k*8);g.lineWidth=k?1.5:3;g.beginPath();g.arc(x,y,7+k*6,0,TAU);g.stroke();}
        g.fillStyle=glow?'#fff':hsl(p.h2,90,80);g.beginPath();g.arc(x,y,3.5,0,TAU);g.fill();});}},
  // the Hive Launcher's Master: dark comb wired into a network; lit cells, circuit veins that run cell to cell and
  // queen nodes glow
  hivemind(g,S,r,p,w,glow){const TAU=6.283,n=rng(p.seed*7+1),py=S/14;g.fillStyle=glow?'#000':hsl(p.h,50,6);g.fillRect(0,0,S,S);
    const lit=[],core=[];for(let i=0;i<224;i++){lit.push(r()<.2);core.push(r()<.35);}
    if(!glow){const sh=[];for(let i=0;i<224;i++)sh.push(n());   // own generator: the glow must keep r()'s sequence
      hexGrid(S,(x,y,i,a,b)=>{hexPath(g,x,y,a,b,.94);g.fillStyle=hsl(p.h,40,7+sh[i]*6);g.fill();g.strokeStyle=hsl(p.h,45,15);g.lineWidth=1.5;g.stroke();});}
    hexGrid(S,(x,y,i,a,b)=>{if(!lit[i])return;hexPath(g,x,y,a,b,.86);g.strokeStyle=glow?'rgba(255,255,255,.75)':hsl(p.h2,85,48);g.lineWidth=2.4;g.stroke();
      if(core[i]){hexPath(g,x,y,a,b,.42);g.fillStyle=glow?'rgba(255,255,255,.55)':hsl(p.h2,80,32);g.fill();}});
    const D=[[0,-py],[S/16,-py/2],[S/16,py/2],[0,py],[-S/16,py/2],[-S/16,-py/2]];
    for(let i=0;i<22;i++){const c=Math.floor(r()*16);let x=c*S/16,y=(Math.floor(r()*14)+(c&1)*.5)*py,d=Math.floor(r()*6);const pts=[[x,y]],steps=3+Math.floor(r()*6);
      for(let k=0;k<steps;k++){if(r()<.4)d=(d+(r()<.5?1:5))%6;x+=D[d][0];y+=D[d][1];pts.push([x,y]);}
      const wide=r()<.3;
      w(()=>{g.lineCap='round';g.lineJoin='round';const path=()=>{g.beginPath();pts.forEach(([a,b],j)=>j?g.lineTo(a,b):g.moveTo(a,b));};
        if(!glow){g.strokeStyle=hsl(p.h,40,4);g.lineWidth=wide?9:6;path();g.stroke();}
        g.strokeStyle=glow?'rgba(255,255,255,.95)':hsl(p.h2,85,45);g.lineWidth=wide?4:2.4;path();g.stroke();
        for(const [a,b] of [pts[0],pts.at(-1)]){g.fillStyle=glow?'#fff':hsl(p.h2,80,62);g.beginPath();g.arc(a,b,wide?6:4.5,0,TAU);g.fill();}});}
    for(let i=0;i<5;i++){const c=Math.floor(r()*16),x=c*S/16,y=(Math.floor(r()*14)+(c&1)*.5)*py,a=S/24,b=py/1.732;
      w(()=>{for(let k=0;k<3;k++){hexPath(g,x,y,a,b,.5+k*.4);g.strokeStyle=glow?`rgba(255,255,255,${.95-k*.25})`:hsl(p.h2,85,58-k*8);g.lineWidth=k?1.5:3;g.stroke();}
        g.fillStyle=glow?'#fff':hsl(p.h2,95,80);g.beginPath();g.arc(x,y,4,0,TAU);g.fill();});}},
  // the Grave Bell's Master: Death Knell: spectral blue sound rings breaking out of a black bronze, small bells at their hearts,
  // the toll's tremor lines running across (the glow); base-only noise from its own rng so the glow stays on the shapes
  deathknell(g,S,r,p,w,glow){const TAU=6.283,n=rng(p.seed*5+11);g.fillStyle=glow?'#000':hsl(p.h,50,6);g.fillRect(0,0,S,S);
    if(!glow)for(let i=0;i<90;i++){const x=n()*S,y=n()*S,R=15+n()*55,c=hsl(p.h,40,9+n()*7,.5);w(()=>{const gr=g.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,c);gr.addColorStop(1,hsl(p.h,50,6,0));g.fillStyle=gr;g.fillRect(x-R,y-R,R*2,R*2);});}
    for(let i=0;i<4;i++){const y=r()*S,amp=6+r()*10,f=2+Math.floor(r()*3),ph=r()*TAU;
      w(()=>{g.strokeStyle=glow?'rgba(255,255,255,.4)':hsl(p.h2,70,30,.8);g.lineWidth=1.4;g.beginPath();for(let x=0;x<=S;x+=4)g.lineTo(x,y+Math.sin(x/S*TAU*f+ph)*amp*Math.sin(x/S*TAU*2+ph));g.stroke();});}
    const bell=(x,y,k)=>{g.beginPath();g.moveTo(x-10*k,y+9*k);g.quadraticCurveTo(x-9*k,y-11*k,x,y-12*k);g.quadraticCurveTo(x+9*k,y-11*k,x+10*k,y+9*k);g.closePath();};
    for(let i=0;i<6;i++){const x=((i%3)+.2+r()*.6)*S/3,y=((i/3|0)+.2+r()*.6)*S/2,cnt=4+Math.floor(r()*4),st=11+r()*6,k=.8+r()*.5,arcs=[...Array(cnt)].map(()=>[r()*TAU,(.5+r()*.5)*TAU]);
      w(()=>{g.lineCap='round';for(let j=0;j<cnt;j++){const R=st*(j+2),[a0,al]=arcs[j],fade=1-j/cnt;
          if(!glow){g.strokeStyle=hsl(p.h,60,3);g.lineWidth=6;g.beginPath();g.arc(x,y,R,a0,a0+al);g.stroke();}
          g.strokeStyle=glow?`rgba(255,255,255,${.25+.7*fade})`:hsl(p.h2,85,38+22*fade);g.lineWidth=j?2.2:3.4;g.beginPath();g.arc(x,y,R,a0,a0+al);g.stroke();}
        bell(x,y,k);g.fillStyle=glow?'#fff':hsl(p.h2,90,72);g.fill();g.beginPath();g.arc(x,y+11*k,2.6*k,0,TAU);g.fill();});}},
};
// a hex grid that tiles at S: 16 columns x 14 rows of flat-topped hexes (1% squashed so it wraps), each cell called
// with its centre, its index (wrapped copies share it) and its half-width/half-height
function hexGrid(S,cb){const py=S/14,a=S/24,b=py/1.732;for(let c=-1;c<=16;c++)for(let q=-1;q<=14;q++)cb(c*S/16,(q+(c&1)*.5)*py,((c+16)%16)*14+(q+14)%14,a,b);}
function hexPath(g,x,y,a,b,s){g.beginPath();for(let k=0;k<6;k++){const t=k*1.0472;g.lineTo(x+Math.cos(t)*a*s,y+Math.sin(t)*b*s);}g.closePath();}
function blit(g,img,T,S){const c=document.createElement('canvas');c.width=c.height=T;c.getContext('2d').putImageData(img,0,0);g.drawImage(c,0,0,S,S);}

// ---- class motifs (laid over the base at low alpha; on Master they're part of the base, not the glow) ----------------
const MOTIF={
  sniper(g,S,r,p,w){g.strokeStyle=hsl(p.h2,80,70,.45);g.lineWidth=2;for(let i=0;i<5;i++){const x=r()*S,y=r()*S,R=24+r()*30;w(()=>{g.beginPath();g.arc(x,y,R,0,6.283);g.stroke();g.beginPath();g.moveTo(x-R*1.4,y);g.lineTo(x-R*.3,y);g.moveTo(x+R*.3,y);g.lineTo(x+R*1.4,y);g.moveTo(x,y-R*1.4);g.lineTo(x,y-R*.3);g.moveTo(x,y+R*.3);g.lineTo(x,y+R*1.4);g.stroke();});}},
  shotgun(g,S,r,p,w){g.fillStyle=hsl(p.h2,70,70,.4);for(let i=0;i<14;i++){const x=r()*S,y=r()*S;for(let k=0;k<9;k++){const a=r()*6.283,d=r()*26;w(()=>{g.beginPath();g.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,2.6,0,6.283);g.fill();});}}},
  smg(g,S,r,p,w){g.strokeStyle=hsl(p.h2,80,70,.35);for(let i=0;i<30;i++){const x=r()*S,y=r()*S,len=40+r()*90;g.lineWidth=1+r()*2;w(()=>{g.beginPath();g.moveTo(x,y);g.lineTo(x+len,y-len*.25);g.stroke();});}},
  ar(g,S,r,p,w){g.fillStyle=hsl(p.h2,75,65,.4);for(let i=0;i<12;i++){const x=r()*S,y=r()*S;w(()=>{for(let k=0;k<3;k++){const yy=y+k*9;poly(g,[[x,yy],[x+12,yy+7],[x+24,yy],[x+24,yy+4],[x+12,yy+11],[x,yy+4]]);g.fill();}});}},
  lmg(g,S,r,p,w){g.fillStyle=hsl(p.h2,60,62,.38);for(let i=0;i<6;i++){const y=r()*S,a=(r()-.5)*.5;w(()=>{g.save();g.translate(0,y);g.rotate(a);for(let x=-S;x<S*2;x+=18){g.fillRect(x,-6,10,12);g.beginPath();g.arc(x+5,0,3,0,6.283);g.fill();}g.restore();});}},
  pistol(g,S,r,p,w){g.strokeStyle=hsl(p.h2,70,72,.42);g.lineWidth=1.6;for(let i=0;i<14;i++){const x=r()*S,y=r()*S,R=10+r()*16;w(()=>{g.beginPath();for(let t=0;t<=1;t+=.02){const a=t*9;g.lineTo(x+Math.cos(a)*R*t,y+Math.sin(a)*R*t);}g.stroke();});}},
  launcher(g,S,r,p,w){g.strokeStyle=hsl(p.h2,85,62,.38);g.lineWidth=2;for(let i=0;i<5;i++){const x=r()*S,y=r()*S;w(()=>{for(let k=0;k<12;k++){const a=k/12*6.283;g.beginPath();g.moveTo(x+Math.cos(a)*10,y+Math.sin(a)*10);g.lineTo(x+Math.cos(a)*(30+r()*20),y+Math.sin(a)*(30+r()*20));g.stroke();}});}},
  special(g,S,r,p,w){g.fillStyle=hsl(p.h2,80,72,.42);g.font='bold 22px serif';const glyphs='✶✷✸✹⟁⌬⍟⎔';for(let i=0;i<22;i++){const x=r()*S,y=r()*S,ch=glyphs[Math.floor(r()*glyphs.length)];w(()=>g.fillText(ch,x,y));}},
};

// ---- the Debt Collector's (melon-weapons/debt.js): Promissory (I), Gilt Ledger (II), Final Notice (Master) ----------------
// a gold-leaf gradient whose two ends match (so a full-width rule tiles)
const leaf=(g,x0,y0,x1,y1)=>{const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,'#c9952f');gr.addColorStop(.25,'#fff0b8');gr.addColorStop(.5,'#b8862a');gr.addColorStop(.75,'#ffe39a');gr.addColorStop(1,'#c9952f');return gr;};
function dcCoin(g,x,y,R,tilt,a){const TAU=6.283;g.save();g.translate(x,y);g.rotate(a);g.scale(1,tilt);
  g.fillStyle='#5a3808';g.beginPath();g.arc(0,R*.28,R,0,TAU);g.fill();   // the coin's edge
  const gr=g.createRadialGradient(-R*.35,-R*.35,1,0,0,R);gr.addColorStop(0,'#fff3b0');gr.addColorStop(.55,'#e8ad2c');gr.addColorStop(1,'#8a5a10');
  g.fillStyle=gr;g.beginPath();g.arc(0,0,R,0,TAU);g.fill();g.strokeStyle='#6a420a';g.lineWidth=1.4;g.beginPath();g.arc(0,0,R*.78,0,TAU);g.stroke();
  g.fillStyle='#6a420a';g.font=`bold ${Math.round(R*1.1)}px serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('$',0,1);g.restore();}
Object.assign(P1,{
  // Promissory: a banknote's green guilloche: fine interlaced waves, spirograph rosettes, treasury seals, the
  // promise to pay and serial numbers
  promissory(g,S,r,p,w){const TAU=6.283;g.fillStyle=hsl(p.h,32,15);g.fillRect(0,0,S,S);
    for(let i=0;i<48;i++){const y0=i*S/48,k=3+(i%3),ph=r()*TAU,A=4+r()*5;   // integer waves across the tile, so they wrap
      w(()=>{g.strokeStyle=hsl(p.h,38,26+(i%2)*6,.85);g.lineWidth=1;g.beginPath();for(let x=0;x<=S;x+=4){const y=y0+A*Math.sin(TAU*k*x/S+ph);x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();});}
    for(let i=0;i<24;i++){const x0=i*S/24,k=2+(i%2),ph=r()*TAU,A=6+r()*6;
      w(()=>{g.strokeStyle=hsl(p.h,30,30,.35);g.lineWidth=1;g.beginPath();for(let y=0;y<=S;y+=4){const x=x0+A*Math.sin(TAU*k*y/S+ph);y?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();});}
    for(let i=0;i<7;i++){const x=r()*S,y=r()*S,R=30+r()*28,q=[3,4,5][Math.floor(r()*3)],d=.45+r()*.3;   // rosettes: hypotrochoids
      w(()=>{for(const [s,l,lw] of [[1,62,1.2],[.72,48,1]]){g.strokeStyle=hsl(p.h,45,l,.9);g.lineWidth=lw;g.beginPath();
        const Rr=R*s,rr=Rr*q/(q*2+1);for(let t=0;t<=TAU*q+.01;t+=.02){const a=(Rr-rr)*Math.cos(t)+rr*d*2*Math.cos((Rr-rr)/rr*t),b=(Rr-rr)*Math.sin(t)-rr*d*2*Math.sin((Rr-rr)/rr*t);t?g.lineTo(x+a,y+b):g.moveTo(x+a,y+b);}g.stroke();}});}
    for(let i=0;i<4;i++){const x=r()*S,y=r()*S,R=18+r()*6;   // treasury seals: a toothed ring with a balance inside
      w(()=>{g.fillStyle=hsl(p.h2,55,42);g.beginPath();for(let k=0;k<=64;k++){const a=k/64*TAU,rad=R+(k%2?3:0);k?g.lineTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad):g.moveTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad);}g.fill();
        g.strokeStyle=hsl(p.h,40,12);g.lineWidth=1.5;g.beginPath();g.arc(x,y,R*.72,0,TAU);g.stroke();
        g.fillStyle=hsl(p.h,40,12);g.font=`bold ${Math.round(R*.9)}px serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('$',x,y+1);});}
    const words=['I PROMISE TO PAY THE BEARER ON DEMAND','ONE HUNDRED','LEGAL TENDER FOR ALL DEBTS','PAYABLE WITH INTEREST','THE DEBT COLLECTOR'];
    g.textBaseline='middle';g.textAlign='left';
    for(let i=0;i<7;i++){const x=r()*S,y=r()*S,t=words[Math.floor(r()*words.length)],big=t.length<14;
      w(()=>{g.font=big?'bold 26px serif':'bold 12px serif';g.fillStyle=hsl(p.h,45,big?60:55,.85);g.fillText(t,x,y);});}
    for(let i=0;i<5;i++){const x=r()*S,y=r()*S,num=String(Math.floor(r()*9e7)).padStart(8,'0');   // serial numbers in the note's red
      w(()=>{g.font='bold 15px monospace';g.fillStyle='hsla(355,70%,48%,.9)';g.fillText(`DC ${num} A`,x,y);});}
    for(let i=0;i<5;i++){const x=r()*S,y=r()*S;w(()=>{g.font='bold 54px serif';g.lineWidth=2;g.strokeStyle=hsl(p.h,45,58,.8);g.strokeText('100',x,y);});}},
});
Object.assign(P2,{
  // Gilt Ledger: a leather account book's page edge: gold-leaf rules, red ink columns, the accounts in gold and ink,
  // flakes of leaf, and red wax seals on gold ribbons
  giltledger(g,S,r,p,w){const TAU=6.283,R=S/16;g.fillStyle=hsl(p.h,35,10);g.fillRect(0,0,S,S);
    for(let i=0;i<1400;i++){g.fillStyle=hsl(p.h,30,5+r()*11,.5);g.fillRect(r()*S,r()*S,1+r()*3,1);}   // leather grain
    for(let y=0;y<S;y+=R){g.fillStyle=leaf(g,0,0,S,0);g.fillRect(0,y,S,2.5);g.fillStyle='rgba(255,226,140,.3)';g.fillRect(0,y+R/2,S,1);}
    for(let k=0;k<4;k++){const x=k*S/4+S/16;g.fillStyle='hsla(355,78%,42%,.9)';g.fillRect(x,0,2,S);g.fillRect(x+5,0,1.2,S);}   // red ink columns
    const heads=['PRINCIPAL','INTEREST','BALANCE','OWED','PAID','DEFAULT'];g.textBaseline='middle';g.textAlign='left';
    for(let row=0;row<16;row++)for(let k=0;k<4;k++){if(r()<.42)continue;const x=k*S/4+S/16+10+r()*20,y=row*R+R*.5+1,v=(r()*9999).toFixed(2),head=r()<.15,ink=r()<.3;
      const t=head?heads[Math.floor(r()*heads.length)]:Number(v).toLocaleString('en-US',{minimumFractionDigits:2});
      w(()=>{g.font=head?'bold 13px serif':'italic 14px serif';g.fillStyle=head?'#e8c060':ink?'hsla(355,75%,55%,.95)':'#d9b45a';g.fillText(t,x,y);});}
    for(let i=0;i<60;i++){const x=r()*S,y=Math.floor(r()*16)*R+(r()-.5)*6,s=2+r()*6,pts=[...Array(5)].map((_,k)=>[x+Math.cos(k*1.26+r())*s,y+Math.sin(k*1.26+r())*s*.7]);   // leaf flakes along the rules
      w(()=>{g.fillStyle=leaf(g,x-8,y-8,x+8,y+8);poly(g,pts);g.fill();});}
    for(let i=0;i<4;i++){const x=r()*S,y=r()*S,Rs=20+r()*7,rot=r()*TAU,lumps=[...Array(18)].map(()=>.88+r()*.2);
      w(()=>{g.save();g.translate(x,y);g.rotate(rot);
        for(const s of [-1,1]){g.fillStyle=leaf(g,-10,0,10,Rs*2);poly(g,[[s*4,0],[s*16,Rs*1.9],[s*9,Rs*1.6],[s*5,Rs*2.1],[s*(-2),0]]);g.fill();}   // ribbon tails
        g.fillStyle='hsl(355,70%,26%)';g.beginPath();lumps.forEach((l,k)=>{const a=k/18*TAU;k?g.lineTo(Math.cos(a)*Rs*l,Math.sin(a)*Rs*l+2):g.moveTo(Math.cos(a)*Rs*l,Math.sin(a)*Rs*l+2);});g.closePath();g.fill();
        const gr=g.createRadialGradient(-Rs*.3,-Rs*.35,2,0,0,Rs);gr.addColorStop(0,'hsl(358,80%,55%)');gr.addColorStop(1,'hsl(355,75%,30%)');
        g.fillStyle=gr;g.beginPath();lumps.forEach((l,k)=>{const a=k/18*TAU;k?g.lineTo(Math.cos(a)*Rs*l,Math.sin(a)*Rs*l):g.moveTo(Math.cos(a)*Rs*l,Math.sin(a)*Rs*l);});g.closePath();g.fill();
        g.strokeStyle='hsl(355,70%,24%)';g.lineWidth=2;g.beginPath();g.arc(0,0,Rs*.62,0,TAU);g.stroke();
        g.fillStyle='hsl(355,70%,24%)';g.font=`bold ${Math.round(Rs*.85)}px serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('DC',0,1);
        g.fillStyle='hsla(0,0%,100%,.25)';g.beginPath();g.ellipse(-Rs*.35,-Rs*.4,Rs*.28,Rs*.12,-.6,0,TAU);g.fill();g.restore();});}},
});
Object.assign(PM,{
  // Final Notice: black paper, scattered gold coins, and red FINAL NOTICE / PAST DUE rubber stamps (the glow), worn
  // where the ink didn't take
  finalnotice(g,S,r,p,w,glow){const TAU=6.283,n=rng(p.seed*11+5),bg=glow?'#000':'#0b0807';g.fillStyle=bg;g.fillRect(0,0,S,S);
    if(!glow){for(let y=0;y<S;y+=S/16){g.fillStyle='rgba(140,30,25,.16)';g.fillRect(0,y,S,1);}
      for(let i=0;i<900;i++){g.fillStyle=`rgba(255,240,220,${n()*.05})`;g.fillRect(n()*S,n()*S,1+n()*3,1);}}
    for(let i=0;i<18;i++){const x=r()*S,y=r()*S,R=8+r()*8,tilt=.35+r()*.65,a=r()*TAU;if(!glow)w(()=>dcCoin(g,x,y,R,tilt,a));}   // coins: base only (r is drawn the same in both passes)
    const words=['FINAL NOTICE','PAST DUE','OVERDUE','PAY NOW','IN COLLECTIONS'];
    for(let i=0;i<10;i++){const x=r()*S,y=r()*S,a=(r()-.5)*.9,t=words[Math.floor(r()*words.length)],sz=Math.round(18+r()*14),seed=Math.floor(r()*1e6);
      w(()=>{g.save();g.translate(x,y);g.rotate(a);g.font=`900 ${sz}px Impact,'Arial Black',sans-serif`;const tw=g.measureText(t).width,hh=sz;
        const col=glow?'#fff':hsl(p.h,85,46);g.strokeStyle=col;g.fillStyle=col;
        g.lineWidth=3.5;g.strokeRect(-tw/2-11,-hh/2-9,tw+22,hh+18);g.lineWidth=1.3;g.strokeRect(-tw/2-6,-hh/2-4,tw+12,hh+8);
        g.textAlign='center';g.textBaseline='middle';g.fillText(t,0,1);
        const d=rng(seed);g.fillStyle=bg;for(let k=0;k<70;k++){g.fillRect((d()-.5)*(tw+26),(d()-.5)*(hh+22),1+d()*3,1+d()*2);}   // worn ink, the same in both passes
        g.restore();});}},
});

// Draw one prestige camo texture. spec: {tier, style, seed, h, h2, cls}; glow: the Master's glow mask.
export function drawPrestigeArt(spec,glow=false){
  const S=512,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),r=rng(spec.seed*31+spec.tier*7+(glow?0:3)),w=wrapper(g,S);
  const fn=(spec.tier===1?P1:spec.tier===2?P2:PM)[spec.style]??(spec.tier===1?P1.shards:spec.tier===2?P2.lattice:PM.cracks);
  // the base and its glow must line up: the Master's generator runs from the same seed for both
  const rr=spec.tier===3?rng(spec.seed*31+21):r;
  fn(g,S,rr,spec,w,glow);
  // tone: within a design, neighbouring guns alternate normal / darker / lighter so close hues still read differently
  if(!glow&&spec.tone===1){g.globalCompositeOperation='multiply';g.fillStyle='rgba(70,70,80,.55)';g.fillRect(0,0,S,S);g.globalCompositeOperation='source-over';}
  if(!glow&&spec.tone===2){g.globalCompositeOperation='screen';g.fillStyle='rgba(255,250,235,.22)';g.fillRect(0,0,S,S);g.globalCompositeOperation='source-over';}
  if(!glow&&MOTIF[spec.cls]&&!OWN.has(spec.style))MOTIF[spec.cls](g,S,rng(spec.seed*13+spec.tier),spec,w);   // hand-made designs carry their own
  return c;
}

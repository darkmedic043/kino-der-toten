// Prestige camo art (Phase 4, reworked): 6 styles per tier, each drawn from a gun's palette and seed, with a weapon-class
// motif laid over it. Every texture tiles (shapes are drawn at their wrap offsets).
//   Prestige I  (bold two-tone):  shards, chevrons, splinter, contour, scales, brush
//   Prestige II (ornate metal):   lattice, filigree, damascus, mosaic, carbon, facets
//   Master      (animated glow):  cracks, circuit, runes, lightning, magma, constellation; each has a base and a glow mask
//                                 (white = glowing), animated in camo.js's shader
// Class motifs: sniper scope rings, shotgun buckshot, SMG speed lines, AR chevron marks, LMG belt links, pistol
// engraving, launcher blast rays, special glyph runes.
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
  shards(g,S,r,p,w){g.fillStyle=hsl(p.h,30,16);g.fillRect(0,0,S,S);for(let i=0;i<90;i++){const x=r()*S,y=r()*S,len=40+r()*150,wd=8+r()*30,a=r()*Math.PI,l=26+r()*36,sh=(r()-.5)*40;
    const pts=[[0,-wd*.2],[len*.55,-wd],[len,0],[len*.4,wd]].map(([u,v])=>[x+u*Math.cos(a)-v*Math.sin(a),y+u*Math.sin(a)+v*Math.cos(a)]);
    w(()=>{g.fillStyle=hsl(p.h+sh,55,l);poly(g,pts);g.fill();g.strokeStyle=hsl(p.h+sh,80,l+25);g.lineWidth=1.2;g.stroke();});}},
  chevrons(g,S,r,p,w){g.fillStyle=hsl(p.h,35,20);g.fillRect(0,0,S,S);const n=8,st=S/n;for(let i=0;i<n;i++)for(let j=0;j<n+1;j++){const x=i*st,y=j*st-st/2+(i%2)*st/2;
    g.fillStyle=(i+j)%3?hsl(p.h,55,34+r()*10):hsl(p.h2,65,48);poly(g,[[x,y],[x+st/2,y+st*.45],[x+st,y],[x+st,y+st*.35],[x+st/2,y+st*.8],[x,y+st*.35]]);g.fill();}},
  splinter(g,S,r,p){const P=8;g.fillStyle=hsl(p.h,35,22);g.fillRect(0,0,S,S);const cols=[hsl(p.h,50,34),hsl(p.h,45,14),hsl(p.h2,55,42),hsl(p.h,25,52)];
    for(let i=0;i<420;i++){const x=Math.floor(r()*S/P)*P,y=Math.floor(r()*S/P)*P,wd=P*(2+Math.floor(r()*9)),ht=P*(1+Math.floor(r()*2));g.fillStyle=cols[i%4];g.fillRect(x,y,wd,ht);if(x+wd>S)g.fillRect(x-S,y,wd,ht);}},
  contour(g,S,r,p){g.fillStyle=hsl(p.h,35,18);g.fillRect(0,0,S,S);const c=[...Array(5)].map(()=>[r()*S,r()*S,40+r()*90]);
    const img=g.getImageData(0,0,S,S),d=img.data;for(let y=0;y<S;y++)for(let x=0;x<S;x++){let v=0;for(const [cx,cy,rad] of c){let dx=Math.abs(x-cx),dy=Math.abs(y-cy);if(dx>S/2)dx=S-dx;if(dy>S/2)dy=S-dy;v+=Math.exp(-(dx*dx+dy*dy)/(2*rad*rad));}
      const band=Math.min(6,Math.floor(v*7)),line=Math.abs((v*7)%1-.5)>.42,l=(line?62:18+band*6)/100,s=.5,hh=((p.h+(line?p.h2-p.h:0))%360)/360;
      const q=l<.5?l*(1+s):l+s-l*s,pp=2*l-q,f=t=>{t=(t+1)%1;return t<1/6?pp+(q-pp)*6*t:t<.5?q:t<2/3?pp+(q-pp)*(2/3-t)*6:pp;};
      const i=(y*S+x)*4;d[i]=f(hh+1/3)*255;d[i+1]=f(hh)*255;d[i+2]=f(hh-1/3)*255;d[i+3]=255;}g.putImageData(img,0,0);},
  scales(g,S,r,p){g.fillStyle=hsl(p.h,40,12);g.fillRect(0,0,S,S);const R=26;for(let row=-1;row*R*.75<S+R;row++)for(let col=-1;col*R*2<S+R*2;col++){const cx=col*R*2+(row%2?R:0),cy=row*R*.75,l=30+r()*18;
    const gr=g.createRadialGradient(cx,cy-R*.4,2,cx,cy,R*1.1);gr.addColorStop(0,hsl(p.h,60,l+22));gr.addColorStop(1,hsl(p.h,55,l-14));g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R,0,Math.PI);g.closePath();g.fill();g.strokeStyle=hsl(p.h2,70,55);g.lineWidth=1.5;g.stroke();}},
  brush(g,S,r,p,w){g.fillStyle=hsl(p.h,25,24);g.fillRect(0,0,S,S);for(let i=0;i<40;i++){const x=r()*S,y=r()*S,len=120+r()*240,a=(r()-.5)*.8,wd=12+r()*30,col=i%3?hsl(p.h,55,12+r()*14):hsl(p.h2,70,45);
    w(()=>{g.save();g.translate(x,y);g.rotate(a);g.fillStyle=col;g.beginPath();g.moveTo(0,0);for(let k=0;k<=10;k++)g.lineTo(k/10*len,Math.sin(k*.9+i)*wd*.25-wd*(1-Math.abs(k/5-1))*.5);for(let k=10;k>=0;k--)g.lineTo(k/10*len,Math.sin(k*.9+i)*wd*.25+wd*(1-Math.abs(k/5-1))*.5);g.fill();g.restore();});}},
};
// ---- Prestige II ---------------------------------------------------------------------------------------------------
const gold=(g,x0,y0,x1,y1)=>{const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,'#fff0b8');gr.addColorStop(.5,'#c9952f');gr.addColorStop(1,'#ffe39a');return gr;};
const P2={
  lattice(g,S,r,p){const R=30,W=Math.sqrt(3)*R;g.fillStyle=hsl(p.h,40,15);g.fillRect(0,0,S,S);for(let row=-1;row*R*1.5<S+R;row++)for(let col=-1;col*W<S+W;col++){const cx=col*W+(row%2?W/2:0),cy=row*R*1.5,l=30+r()*30;
    const gr=g.createLinearGradient(cx-R,cy-R,cx+R,cy+R);gr.addColorStop(0,hsl(p.h,65,l+15));gr.addColorStop(1,hsl(p.h,60,l-12));g.beginPath();for(let k=0;k<6;k++){const a=Math.PI/6+k*Math.PI/3;g.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));}g.closePath();g.fillStyle=gr;g.fill();g.strokeStyle=gold(g,cx-R,cy,cx+R,cy);g.lineWidth=2.5;g.stroke();}},
  filigree(g,S,r,p,w){g.fillStyle=hsl(p.h,45,14);g.fillRect(0,0,S,S);g.lineCap='round';for(let i=0;i<34;i++){const x=r()*S,y=r()*S,rad=20+r()*40,turns=1.5+r()*1.5,dir=r()<.5?1:-1;
    w(()=>{g.strokeStyle=gold(g,x-rad,y-rad,x+rad,y+rad);g.lineWidth=2.2;g.beginPath();for(let t=0;t<=1;t+=.01){const a=dir*t*turns*6.283,rr=rad*(1-t);g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}g.stroke();
      g.fillStyle=hsl(p.h2,70,55);g.beginPath();g.arc(x,y,3,0,6.283);g.fill();});}},
  damascus(g,S,r,p){const img=g.createImageData(S,S),d=img.data,k=[r()*6,r()*6,r()*6];for(let y=0;y<S;y++)for(let x=0;x<S;x++){const u=x/S*6.283,v=y/S*6.283;
    const f=Math.sin(u*3+Math.sin(v*2+k[0])*2.2+Math.sin(u+v+k[1])*1.4)*.5+.5,band=Math.pow(Math.abs(Math.sin(f*Math.PI*6+k[2])),.4);
    const base=60+band*150,i=(y*S+x)*4;d[i]=base*(.8+.2*Math.cos(p.h/57.3));d[i+1]=base*(.8+.2*Math.cos((p.h-120)/57.3));d[i+2]=base*(.85+.15*Math.cos((p.h-240)/57.3));d[i+3]=255;}g.putImageData(img,0,0);},
  mosaic(g,S,r,p){const v=voronoi(S/2,40,r),T=S/2,img=g.createImageData(T,T),cols=[...Array(40)].map(()=>[p.h+(r()-.5)*60,50+r()*30,30+r()*30]);
    for(let i=0;i<T*T;i++){const e=v.edge[i],[h,s,l]=cols[v.cell[i]],lead=e<2.2;const c=lead?[200,170,90]:hslRgb(h,s/100,l/100).map(x=>x*255);d4(img.data,i,c);}
    const c2=document.createElement('canvas');c2.width=c2.height=T;c2.getContext('2d').putImageData(img,0,0);g.imageSmoothingEnabled=false;g.drawImage(c2,0,0,S,S);},
  carbon(g,S,r,p){const C=16;g.fillStyle='#0c0c0e';g.fillRect(0,0,S,S);for(let y=0;y<S;y+=C)for(let x=0;x<S;x+=C){const vert=((x+y)/C)%2<1;const gr=vert?g.createLinearGradient(x,y,x+C,y):g.createLinearGradient(x,y,x,y+C);
    gr.addColorStop(0,hsl(p.h,25,10));gr.addColorStop(.5,hsl(p.h,40,32));gr.addColorStop(1,hsl(p.h,25,10));g.fillStyle=gr;g.fillRect(x+1,y+1,C-2,C-2);}
    g.strokeStyle=gold(g,0,0,S,S);g.globalAlpha=.6;g.lineWidth=2;for(let i=0;i<S;i+=S/4){g.beginPath();g.moveTo(0,i);g.lineTo(S,i);g.stroke();}g.globalAlpha=1;},
  facets(g,S,r,p){const T=64;for(let y=0;y<S;y+=T)for(let x=0;x<S;x+=T)for(const tri of [[[x,y],[x+T,y],[x,y+T]],[[x+T,y],[x+T,y+T],[x,y+T]]]){g.fillStyle=hsl(p.h+(r()-.5)*30,55+r()*25,30+r()*45);poly(g,tri);g.fill();}
    g.strokeStyle='rgba(255,240,200,.45)';g.lineWidth=1;for(let i=0;i<=S;i+=T){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.moveTo(0,i);g.lineTo(S,i);g.moveTo(i,0);g.lineTo(0,i);g.moveTo(S,i);g.lineTo(i,S);g.stroke();}},
};
function hslRgb(h,s,l){h=((h%360)+360)%360/360;const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return l-a*Math.max(-1,Math.min(k-3,9-k,1));};return [f(0),f(8),f(4)];}
export { hslRgb };
const d4=(d,i,[r,g,b])=>{d[i*4]=r;d[i*4+1]=g;d[i*4+2]=b;d[i*4+3]=255;};

// ---- Master (base, glow) ----------------------------------------------------------------------------------------------
// Each returns the base on `g` (dark, the gun's colour) or, with glow=true, a white-on-black mask of what lights up.
const PM={
  cracks(g,S,r,p,w,glow){const T=256,v=voronoi(T,34,r),img=g.createImageData(T,T),shade=[...Array(34)].map(()=>.6+r()*.8);
    for(let i=0;i<T*T;i++){const e=v.edge[i];if(glow){const k=Math.max(0,1-e/3.2)**1.5*255;d4(img.data,i,[k,k,k]);}else{const c=hslRgb(p.h+200,.35,.09*shade[v.cell[i]]),rim=Math.max(0,1-e/6)*.25;d4(img.data,i,c.map(x=>(x+rim)*255));}}
    blit(g,img,T,S);},
  circuit(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h,30,8);g.fillRect(0,0,S,S);g.strokeStyle=glow?'#fff':hsl(p.h,30,20);g.lineWidth=3;const G=32;
    for(let i=0;i<80;i++){let x=Math.floor(r()*S/G)*G,y=Math.floor(r()*S/G)*G;const pts=[[x,y]];for(let k=0;k<4;k++){if(r()<.5)x+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));else y+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));pts.push([x,y]);}
      w(()=>{g.beginPath();pts.forEach(([a,b],k)=>k?g.lineTo(a,b):g.moveTo(a,b));g.stroke();g.fillStyle=glow?'#fff':hsl(p.h,40,30);g.beginPath();g.arc(x,y,5,0,6.283);g.fill();});}},
  runes(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h,35,7);g.fillRect(0,0,S,S);const glyphs='ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for(let i=0;i<18;i++){const cx=r()*S,cy=r()*S,R=26+r()*34;w(()=>{g.strokeStyle=glow?'#fff':hsl(p.h,30,18);g.lineWidth=2;g.beginPath();g.arc(cx,cy,R,0,6.283);g.stroke();g.beginPath();g.arc(cx,cy,R-14,0,6.283);g.stroke();
      g.fillStyle=glow?'#fff':hsl(p.h,30,22);g.font='bold 13px serif';g.textAlign='center';g.textBaseline='middle';const n=10;for(let k=0;k<n;k++){const a=k/n*6.283;g.save();g.translate(cx+Math.cos(a)*(R-7),cy+Math.sin(a)*(R-7));g.rotate(a+Math.PI/2);g.fillText(glyphs[Math.floor(r()*glyphs.length)],0,0);g.restore();}});}},
  lightning(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h,40,8);g.fillRect(0,0,S,S);if(!glow){for(let i=0;i<500;i++){g.fillStyle=hsl(p.h,30,10+r()*10);g.fillRect(r()*S,r()*S,2,2);}}
    const bolt=(x,y,a,len,wd,depth)=>{const pts=[[x,y]];for(let k=0;k<8;k++){a+=(r()-.5)*.9;x+=Math.cos(a)*len/8;y+=Math.sin(a)*len/8;pts.push([x,y]);}
      w(()=>{g.strokeStyle=glow?'#fff':hsl(p.h,35,20);g.lineWidth=wd;g.beginPath();pts.forEach(([a1,b1],k)=>k?g.lineTo(a1,b1):g.moveTo(a1,b1));g.stroke();});
      if(depth<2)for(let k=0;k<2;k++){const [bx,by]=pts[2+Math.floor(r()*5)];bolt(bx,by,a+(r()-.5)*1.6,len*.55,wd*.6,depth+1);}};
    for(let i=0;i<7;i++)bolt(r()*S,r()*S,r()*6.283,180+r()*140,3,0);},
  magma(g,S,r,p,w,glow){const T=256,c=[...Array(6)].map(()=>[r()*T,r()*T,25+r()*45]),img=g.createImageData(T,T);
    for(let y=0;y<T;y++)for(let x=0;x<T;x++){let v=0;for(const [cx,cy,rad] of c){let dx=Math.abs(x-cx),dy=Math.abs(y-cy);if(dx>T/2)dx=T-dx;if(dy>T/2)dy=T-dy;v+=Math.exp(-(dx*dx+dy*dy)/(2*rad*rad));}
      const f=Math.abs((v*6)%1-.5),line=Math.max(0,1-f*9);const i=y*T+x;if(glow){const k=line*255;d4(img.data,i,[k,k,k]);}else{const col=hslRgb(p.h+10,.5,.06+v*.05);d4(img.data,i,col.map(q=>q*255));}}
    blit(g,img,T,S);},
  constellation(g,S,r,p,w,glow){g.fillStyle=glow?'#000':hsl(p.h+220,45,6);g.fillRect(0,0,S,S);if(!glow){for(let i=0;i<900;i++){g.fillStyle=`rgba(255,255,255,${r()*.25})`;g.fillRect(r()*S,r()*S,1,1);}}
    for(let i=0;i<20;i++){let x=r()*S,y=r()*S;const pts=[[x,y]];for(let k=0;k<4+Math.floor(r()*3);k++){x+=(r()-.5)*110;y+=(r()-.5)*110;pts.push([x,y]);}
      w(()=>{g.strokeStyle=glow?'rgba(255,255,255,.65)':hsl(p.h,30,18);g.lineWidth=1.5;g.beginPath();pts.forEach(([a,b],k)=>k?g.lineTo(a,b):g.moveTo(a,b));g.stroke();
        for(const [a,b] of pts){g.fillStyle=glow?'#fff':hsl(p.h,40,30);g.beginPath();g.arc(a,b,glow?4:3,0,6.283);g.fill();}});}},
};
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

// Draw one prestige camo texture. spec: {tier, style, seed, h, h2, cls}; glow: the Master's glow mask.
export function drawPrestigeArt(spec,glow=false){
  const S=512,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),r=rng(spec.seed*31+spec.tier*7+(glow?0:3)),w=wrapper(g,S);
  const fn=(spec.tier===1?P1:spec.tier===2?P2:PM)[spec.style]??(spec.tier===1?P1.shards:spec.tier===2?P2.lattice:PM.cracks);
  // the base and its glow must line up: the Master's generator runs from the same seed for both
  const rr=spec.tier===3?rng(spec.seed*31+21):r;
  fn(g,S,rr,spec,w,glow);
  if(!glow&&MOTIF[spec.cls])MOTIF[spec.cls](g,S,rng(spec.seed*13+spec.tier),spec,w);
  return c;
}

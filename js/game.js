'use strict';
(function(){
const TL_BUILD="1.39 · 2026-11-08";
// ===== 00_core.js =====
/* ================= CORE ================= */
const $=s=>document.querySelector(s);
const isTouch=matchMedia('(pointer: coarse)').matches||('ontouchstart' in window)||navigator.maxTouchPoints>1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const wrapA=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
const dist2=(ax,az,bx,bz)=>Math.hypot(ax-bx,az-bz);
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let rng=mulberry(20261029);
const rr=(a,b)=>a+(b-a)*rng();
const rf=(a,b)=>a+(b-a)*Math.random();
const pick=(arr,r=Math.random)=>arr[Math.floor(r()*arr.length)];
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hex6=n=>'#'+(n>>>0).toString(16).padStart(6,'0').slice(-6);
function fail(msg){const d=document.createElement('div');d.id='err';d.textContent=msg;document.body.appendChild(d);}
window.addEventListener('error',e=>{if(!window.__tlBooted)fail('Tidelock hit an error while starting: '+(e.message||'unknown')+'. Reload the page to try again.');});

/* noise */
function hash(x,z){const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);}
function vnoise(x,z){const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;const u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  const a=hash(xi,zi),b=hash(xi+1,zi),c=hash(xi,zi+1),d=hash(xi+1,zi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function fbm(x,z,o=4){let s=0,a=1,f=1,t=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f,z*f);t+=a;a*=.5;f*=2.03;}return s/t;}
const ridged=(x,z)=>1-Math.abs(fbm(x,z)*2-1);
const noise3=(x,y,z)=>(vnoise(x+z*1.71,y-z*.93)+vnoise(y*1.31+31.7,z+x*.77))*.5;

/* tiny event bus: quests, achievements and UI listen to gameplay events */
const Bus={h:{},on(ev,fn){(this.h[ev]=this.h[ev]||[]).push(fn);},emit(ev,...a){(this.h[ev]||[]).forEach(f=>{try{f(...a);}catch(e){console.error(e);}});}};

/* embedded binary assets live in <script type="application/octet-stream"> tags */
function assetBuf(id){// the web version fetches every asset before the game starts; the single-file version embeds them
  if(window.__TLA&&window.__TLA[id]){const b=window.__TLA[id];delete window.__TLA[id];return b;}
  const t=document.getElementById('asset-'+id);if(!t)return null;const bin=atob(t.textContent.trim());const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);t.textContent='';return u.buffer;}
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));

// ===== 01_render.js =====
/* ================= RENDERER, LIGHTS, SKY ================= */
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:!isTouch||devicePixelRatio<2,powerPreference:'high-performance'});}
catch(e){fail('This device could not start WebGL, which Tidelock needs for its 3D view.');throw e;}
const PIXEL_RATIO=Math.min(devicePixelRatio,isTouch?1.5:2);
renderer.setPixelRatio(PIXEL_RATIO);renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$('#game').appendChild(renderer.domElement);
const ANISO=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,2200);
scene.fog=new THREE.Fog(0x3a2238,50,330);
const hemi=new THREE.HemisphereLight(0x9a80c8,0x1c1426,.62);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xff9a66,1.15);
sun.castShadow=true;sun.shadow.mapSize.set(isTouch?1024:2048,isTouch?1024:2048);
Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:360});
sun.shadow.bias=-.0006;sun.shadow.normalBias=.04;scene.add(sun);scene.add(sun.target);
// A fixed pool of point lights: the shader count never changes, zones just move and dim them.
const LIGHTS=[];for(let i=0;i<6;i++){const l=new THREE.PointLight(0xffffff,0,30,1.6);scene.add(l);LIGHTS.push(l);}
const muzzleLight=new THREE.PointLight(0x6ff2d6,0,16,1.6);scene.add(muzzleLight);
const flareLight=new THREE.PointLight(0xff5a3a,0,26,1.6);scene.add(flareLight);
function setLights(list){LIGHTS.forEach((l,i)=>{const d=list[i];if(!d){l.intensity=0;return;}l.position.set(d.x,d.y,d.z);l.color.set(d.color);l.intensity=d.i;l.distance=d.d||30;l.userData.base=d.i;l.userData.flicker=d.flicker||0;});}

const skyMat=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{sunDir:{value:new THREE.Vector3(0,.15,-1).normalize()},time:{value:0},aurora:{value:0},night:{value:0},
    cNight:{value:new THREE.Color(.028,.025,.075)},cDusk:{value:new THREE.Color(.30,.11,.21)},cSun:{value:new THREE.Color(.98,.40,.17)},cHorizon:{value:new THREE.Color(.22,.08,.12)},
    stars:{value:1},sunSize:{value:1},space:{value:0},aurC1:{value:new THREE.Color(.15,1,.65)},aurC2:{value:new THREE.Color(.55,.25,1)}},
  vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 sunDir;uniform float time;uniform float aurora;uniform float night;uniform vec3 cNight;uniform vec3 cDusk;uniform vec3 cSun;uniform vec3 cHorizon;uniform float stars;uniform float sunSize;uniform float space;uniform vec3 aurC1;uniform vec3 aurC2;varying vec3 vDir;
  float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
  void main(){vec3 d=normalize(vDir);float sd=dot(d,sunDir);float s=sd*.5+.5;
    float lowSun=clamp(sunDir.y*6.+.4,0.,1.);
    vec3 col=mix(cNight,cDusk*(.55+.45*lowSun),pow(s,2.2)*(1.-space));
    col=mix(col,cSun,pow(s,9.)*(1.-smoothstep(-.05,.5,d.y))*(.4+.6*lowSun)*(1.-space));
    col+=cHorizon*pow(1.-abs(d.y),9.)*s*(1.-space);
    vec3 q=floor(d*320.);float st=step(.9965-space*.004,h(q));
    col+=st*vec3(.85,.88,1.)*(1.-s*.9*(1.-space))*mix(smoothstep(-.02,.25,d.y),1.,space)*(.55+.45*sin(time*1.7+h(q+1.)*40.))*(.5+night*.8)*stars;
    if(space>0.){float neb=sin(d.x*3.+d.y*2.)*sin(d.z*2.5-d.y)*.5+.5;col+=space*vec3(.18,.08,.28)*pow(neb,3.)+space*vec3(.05,.12,.2)*pow(1.-neb,4.);}
    if(aurora>0.){float a=smoothstep(.04,.35,d.y)*(1.-smoothstep(.45,.95,d.y));
      float w=sin(d.x*7.+time*.35+sin(d.z*4.+time*.25)*2.5)*.5+.5;float w2=sin(d.x*13.-time*.5+d.z*6.)*.5+.5;
      col+=aurora*a*(1.-s*.8)*(aurC1*w+aurC2*w2*.5)*.6;}
    float ss=.9983+.0006*(1.-sunSize);
    col+=cSun*smoothstep(ss,ss+.0008,sd)*2.2+cSun*pow(max(sd,0.),180./sunSize)*.55+vec3(1.,.55,.3)*pow(max(sd,0.),20.)*.08*(1.-space);
    gl_FragColor=vec4(col,1.);}`
});
const sky=new THREE.Mesh(new THREE.SphereGeometry(1000,32,18),skyMat);scene.add(sky);
const sunDir=new THREE.Vector3();

// ===== 02_tex.js =====
/* ================= PROCEDURAL TEXTURES ================= */
// Everything is painted in code at startup: tileable noise and Voronoi fields feed albedo, normal, roughness and glow maps.
const TX=512,NPX=TX*TX;
const B=v=>v*255;
function makeNoise(cx,cy,oct,seed,gain=.5){
  const size=TX,out=new Float32Array(NPX);let amp=1,tot=0;
  for(let o=0;o<oct;o++){const nx=cx<<o,ny=cy<<o,lat=new Float32Array(nx*ny),r=mulberry(seed*9973+o*131);for(let i=0;i<lat.length;i++)lat[i]=r();
    const kx=nx/size,ky=ny/size;
    for(let y=0;y<size;y++){const fy=y*ky,yi=fy|0,t=fy-yi,v=t*t*(3-2*t),r0=(yi%ny)*nx,r1=((yi+1)%ny)*nx;
      for(let x=0;x<size;x++){const fx=x*kx,xi=fx|0,s=fx-xi,u=s*s*(3-2*s),x0=xi%nx,x1=(xi+1)%nx;
        const a=lat[r0+x0],b=lat[r0+x1],c=lat[r1+x0],d=lat[r1+x1];out[y*size+x]+=amp*((a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v);}}
    tot+=amp;amp*=gain;}
  for(let i=0;i<NPX;i++)out[i]/=tot;return out;}
function makeCells(n,seed){
  const size=TX,r=mulberry(seed),pts=new Float32Array(n*n*2),ids=new Float32Array(n*n);
  for(let i=0;i<n*n;i++){pts[i*2]=r();pts[i*2+1]=r();ids[i]=r();}
  const f1=new Float32Array(NPX),f2=new Float32Array(NPX),id=new Float32Array(NPX),k=n/size;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const gx=(x+.5)*k,gy=(y+.5)*k,cx=gx|0,cy=gy|0;let d1=9,d2=9,best=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const ix=cx+dx,iy=cy+dy,j=((iy+n)%n)*n+((ix+n)%n);
      const px=ix+pts[j*2]-gx,py=iy+pts[j*2+1]-gy,d=Math.sqrt(px*px+py*py);
      if(d<d1){d2=d1;d1=d;best=ids[j];}else if(d<d2)d2=d;}
    const i=y*size+x;f1[i]=d1;f2[i]=d2;id[i]=best;}
  return {f1,f2,id};}
function mkCanvas(w=TX,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function fromFn(fn,w=TX,h=w){const c=mkCanvas(w,h),g=c.getContext('2d'),im=g.createImageData(w,h),d=im.data,o=[0,0,0,255];
  for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){o[3]=255;fn(i,x,y,o);const k=i*4;d[k]=o[0];d[k+1]=o[1];d[k+2]=o[2];d[k+3]=o[3];}
  g.putImageData(im,0,0);return c;}
const gray=fn=>fromFn((i,x,y,o)=>{o[0]=o[1]=o[2]=B(fn(i,x,y));});
function readGray(c){const d=c.getContext('2d').getImageData(0,0,TX,TX).data,out=new Float32Array(NPX);for(let i=0;i<NPX;i++)out[i]=d[i*4]/255;return out;}
function blur(h,passes=1){let a=h;const S=TX;
  for(let p=0;p<passes;p++){const b=new Float32Array(NPX);for(let y=0;y<S;y++){const ym=((y-1+S)%S)*S,y0=y*S,yp=((y+1)%S)*S;for(let x=0;x<S;x++){const xm=(x-1+S)%S,xp=(x+1)%S;
    b[y0+x]=(a[ym+xm]+a[ym+x]+a[ym+xp]+a[y0+xm]+a[y0+x]+a[y0+xp]+a[yp+xm]+a[yp+x]+a[yp+xp])/9;}}a=b;}
  return a;}
function normalMap(h,str){const S=TX;return fromFn((i,x,y,o)=>{
  const l=h[y*S+((x-1+S)%S)],r=h[y*S+((x+1)%S)],u=h[((y-1+S)%S)*S+x],d=h[((y+1)%S)*S+x];
  const nx=(l-r)*str,ny=(d-u)*str,inv=1/Math.sqrt(nx*nx+ny*ny+1);
  o[0]=(nx*inv*.5+.5)*255;o[1]=(ny*inv*.5+.5)*255;o[2]=(inv*.5+.5)*255;});}
function tx(c){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=ANISO;return t;}
function multiply(g,c){g.globalCompositeOperation='multiply';g.drawImage(c,0,0);g.globalCompositeOperation='source-over';}

const TEX={};
{
  const NL=makeNoise(4,4,5,1),NM=makeNoise(16,16,4,2),NH=makeNoise(64,64,2,3);
  const CA=makeCells(8,11),CB=makeCells(22,12);
  const FIB=makeNoise(32,3,3,4),STR=makeNoise(12,2,3,5);
  const H=()=>new Float32Array(NPX);
  const seam=(c,i,w)=>1-smooth(0,w,c.f2[i]-c.f1[i]);

  // rock: fractured stone with lichen
  {const h=H(),cr=H();for(let i=0;i<NPX;i++){cr[i]=seam(CA,i,.07);h[i]=.45*NL[i]+.3*NM[i]+.15*NH[i]+.15*(1-CA.f1[i])-.32*cr[i];}
    TEX.rock={map:tx(fromFn((i,x,y,o)=>{let v=.6+.3*NM[i]+.12*NH[i];v*=1-.5*cr[i];const l=smooth(.57,.68,NL[i])*.55;
      o[0]=B(v*(.92-.35*l))+(NH[i]>.8?22:0);o[1]=B(v*(.86+.06*l))+(NH[i]>.8?22:0);o[2]=B(v*(.96-.14*l))+(NH[i]>.8?26:0);})),normal:tx(normalMap(h,10))};}
  // ground: gravel and dust, tiled over the terrain at two scales
  {const h=H();for(let i=0;i<NPX;i++){const p=1-CB.f1[i];h[i]=.55*p*p+.25*NM[i]+.2*NH[i];}
    TEX.ground={map:tx(fromFn((i,x,y,o)=>{const p=1-CB.f1[i];let v=.84+.08*NM[i]+.08*p*p*p+.05*NH[i]-.07*smooth(.7,.95,CB.f1[i]);v*=.95+.05*CB.id[i];
      o[0]=B(v*1.02);o[1]=B(v);o[2]=B(v*.97);})),normal:tx(normalMap(h,7))};}
  // suit fabric: quilted padding with seams and stitching
  {const h=H(),al=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x,yy=y%64,row=(y/64)|0,xx=(x+(row%2)*64)%128;
      let v=.5+.05*Math.sin(x*1.05)*Math.sin(y*1.05)+.25*Math.sin(Math.PI*yy/64)+.12*NM[i];let a=.82+.1*NM[i]-.16*smooth(.56,.72,NL[i]);
      if(yy<3||xx<3){v-=.45;a*=.62;}else if(((yy===7||yy===57)&&x%8<4)||((xx===8||xx===120)&&y%8<4)){v+=.1;a=.97;}
      h[i]=v;al[i]=a;}
    TEX.fabric={map:tx(gray(i=>al[i])),normal:tx(normalMap(h,5))};}
  // rubber undersuit: fine ribs
  {const h=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x,r=.5+.5*Math.sin(y*Math.PI*2/10);h[i]=r*.6+.2*NM[i]+.1*NH[i];}
    TEX.rubber={map:tx(gray((i,x,y)=>.62+.14*(.5+.5*Math.sin(y*Math.PI*2/10))+.16*NM[i])),normal:tx(normalMap(h,6))};}
  // armor: irregular plates, bevels, screws, scratches
  {const r=mulberry(77),panels=[];
    (function split(x,y,w,h,d){if(d>=4||(d>1&&r()<.2)||w<100||h<100){panels.push([x,y,w,h]);return;}
      if(w>=h){const s=Math.round(w*(.35+r()*.3));split(x,y,s,h,d+1);split(x+s,y,w-s,h,d+1);}else{const s=Math.round(h*(.35+r()*.3));split(x,y,w,s,d+1);split(x,y+s,w,h-s,d+1);}})(0,0,TX,TX,0);
    const hc=mkCanvas(),hg=hc.getContext('2d'),ac=mkCanvas(),ag=ac.getContext('2d');
    hg.fillStyle='#808080';hg.fillRect(0,0,TX,TX);
    for(const [x,y,w,h] of panels){const t=Math.round(198+r()*34);ag.fillStyle=`rgb(${t},${t},${t+3})`;ag.fillRect(x,y,w,h);
      hg.fillStyle='#a0a0a0';hg.fillRect(x+4,y+4,w-8,h-8);hg.fillStyle='#b2b2b2';hg.fillRect(x+10,y+10,w-20,h-20);
      hg.strokeStyle='#1e1e1e';hg.lineWidth=3;hg.strokeRect(x+1.5,y+1.5,w-3,h-3);
      ag.strokeStyle='rgba(40,36,50,.8)';ag.lineWidth=2.5;ag.strokeRect(x+1.25,y+1.25,w-2.5,h-2.5);
      ag.strokeStyle='rgba(255,255,255,.18)';ag.lineWidth=1;ag.strokeRect(x+5,y+5,w-10,h-10);
      for(const [sx,sy] of [[x+13,y+13],[x+w-13,y+13],[x+13,y+h-13],[x+w-13,y+h-13]]){
        hg.fillStyle='#e4e4e4';hg.beginPath();hg.arc(sx,sy,4.2,0,7);hg.fill();
        ag.fillStyle='rgb(150,146,160)';ag.beginPath();ag.arc(sx,sy,3.8,0,7);ag.fill();
        ag.strokeStyle='rgba(25,25,35,.85)';ag.lineWidth=1.2;ag.beginPath();ag.moveTo(sx-2.6,sy-1);ag.lineTo(sx+2.6,sy+1);ag.stroke();}}
    ag.lineWidth=1;for(let i=0;i<90;i++){const x=r()*TX,y=r()*TX,a=r()*6.28,l=6+r()*30;ag.strokeStyle=`rgba(255,255,255,${.12+r()*.25})`;ag.beginPath();ag.moveTo(x,y);ag.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);ag.stroke();}
    multiply(ag,gray(i=>(.88+.12*NM[i])*(1-.22*smooth(.55,.75,NL[i]))));
    const h=blur(readGray(hc),2);for(let i=0;i<NPX;i++)h[i]+=NH[i]*.03;
    TEX.armor={map:tx(ac),normal:tx(normalMap(h,7))};}
  // hull: riveted panel grid with vents, markings and grime streaks
  {const r=mulberry(91),hc=mkCanvas(),hg=hc.getContext('2d'),ac=mkCanvas(),ag=ac.getContext('2d');
    hg.fillStyle='#808080';hg.fillRect(0,0,TX,TX);ag.fillStyle='#cdcdd2';ag.fillRect(0,0,TX,TX);
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      const off=(row%2)*64,t=Math.round(188+r()*38),vent=r()<.22,mark=r()<.16,px0=col*128+off,py0=row*128;
      const draw=(x,y)=>{ag.fillStyle=`rgb(${t},${t},${t+5})`;ag.fillRect(x,y,128,128);
        hg.fillStyle='#9c9c9c';hg.fillRect(x+3,y+3,122,122);
        hg.strokeStyle='#181818';hg.lineWidth=3;hg.strokeRect(x+1.5,y+1.5,125,125);
        ag.strokeStyle='rgba(32,28,44,.85)';ag.lineWidth=2.5;ag.strokeRect(x+1.25,y+1.25,125.5,125.5);
        for(let k=10;k<128;k+=16)for(const [px,py] of [[x+k,y+7],[x+k,y+121],[x+7,y+k],[x+121,y+k]]){
          hg.fillStyle='#dadada';hg.beginPath();hg.arc(px,py,2.5,0,7);hg.fill();
          ag.fillStyle='rgba(118,114,130,.95)';ag.beginPath();ag.arc(px,py,2.1,0,7);ag.fill();
          ag.fillStyle='rgba(255,255,255,.35)';ag.beginPath();ag.arc(px-.7,py-.7,.9,0,7);ag.fill();}
        if(vent)for(let s=0;s<5;s++){const yy=y+36+s*12;hg.fillStyle='#2c2c2c';hg.fillRect(x+28,yy,72,5);ag.fillStyle='rgba(26,22,34,.92)';ag.fillRect(x+28,yy,72,5);ag.fillStyle='rgba(255,255,255,.25)';ag.fillRect(x+28,yy+5,72,1);}
        if(mark){ag.fillStyle='rgba(255,180,80,.85)';ag.fillRect(x+16,y+98,44,9);ag.fillStyle='rgba(30,26,36,.8)';for(let s=0;s<4;s++)ag.fillRect(x+20+s*10,y+98,4,9);}};
      draw(px0,py0);if(px0+128>TX)draw(px0-TX,py0);}
    multiply(ag,gray(i=>(.86+.14*NM[i])*(1-.3*smooth(.5,.85,STR[i]))));
    const h=blur(readGray(hc),1);for(let i=0;i<NPX;i++)h[i]+=NH[i]*.03;
    TEX.hull={map:tx(ac),normal:tx(normalMap(h,6)),rough:tx(gray(i=>.5+.35*smooth(.5,.85,STR[i])+.15*NM[i])),canvas:ac};}
  // deck: diamond tread plate
  {const h=H(),al=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x,u=x+y,v=x-y+TX,cu=(u%16)-8,cv=(v%16)-8,ch=(((u/16)|0)+((v/16)|0))&1;
      const e=ch?(cu/6.5)**2+(cv/2.2)**2:(cu/2.2)**2+(cv/6.5)**2,b=Math.max(0,1-e),sm=(x%256<3||y%256<3)?1:0;
      h[i]=b*.5+.1*NM[i]-sm*.6;al[i]=(.5+.24*b+.1*NM[i]-.16*smooth(.55,.75,NL[i]))*(sm?.5:1);}
    TEX.deck={map:tx(fromFn((i,x,y,o)=>{o[0]=B(al[i]*.97);o[1]=B(al[i]*.97);o[2]=B(al[i]);})),normal:tx(normalMap(h,6))};}
  // bark: fibrous ridges with luminous spores
  {const h=H();for(let i=0;i<NPX;i++)h[i]=.7*FIB[i]+.3*NM[i];
    TEX.bark={map:tx(fromFn((i,x,y,o)=>{const t=h[i],g=smooth(.45,.3,FIB[i]);
      if(CB.f1[i]<.14&&CB.id[i]>.8){o[0]=90;o[1]=225;o[2]=200;return;}
      o[0]=B(lerp(.28,.58,t)*(1-.45*g));o[1]=B(lerp(.22,.48,t)*(1-.45*g));o[2]=B(lerp(.33,.64,t)*(1-.4*g));})),normal:tx(normalMap(h,12))};}
  // mushroom cap spots + gill stripes
  TEX.cap={map:tx(gray((i,x,y)=>{let v=.6+.1*NM[i];v=lerp(v,1,(1-smooth(.18,.3,CA.f1[i]))*.85);if(Math.abs(((x/TX*40)%1)-.5)<.04)v*=.85;return lerp(v,1,smooth(.82,.98,y/TX)*.7);}))};
  TEX.gill={map:tx(gray((i,x)=>{const s=.5+.5*Math.sin(x/TX*Math.PI*2*64);return .3+.62*s*s*s+.08*NM[i];}))};
  // crystal: lengthwise striations and inner glow veins
  TEX.crystal={map:tx(gray(i=>.7+.3*STR[i]+.05*NH[i])),emis:tx(gray(i=>smooth(.6,.85,STR[i])*.9+(NH[i]>.88?.35:0)+.12)),normal:tx(normalMap(STR,8))};
  // carapace: armored plates with seams and pores
  {const h=H();for(let i=0;i<NPX;i++){const p=1-CA.f1[i];h[i]=.6*Math.pow(p,1.5)+.18*NM[i]-.5*seam(CA,i,.05)-(NH[i]>.82?.08:0);}
    TEX.carapace={map:tx(gray(i=>clamp((.55+.35*(1-CA.f1[i])+.1*NM[i])*(1-.6*seam(CA,i,.05))*(NL[i]>.6?.78:1)+(CA.id[i]-.5)*.1,0,1))),normal:tx(normalMap(h,9))};}
  // obsidian with glowing fractures
  {const cr=H(),h=H();for(let i=0;i<NPX;i++){cr[i]=seam(CA,i,.035);h[i]=.4*NM[i]+.2*(1-CA.f1[i])-.3*cr[i];}
    const map=fromFn((i,x,y,o)=>{const v=.12+.1*NM[i]+.06*NH[i];o[0]=B(v+cr[i]*.3);o[1]=B(v+cr[i]*.55);o[2]=B(v*1.2+cr[i]*.5);});
    TEX.obsidian={map:tx(map),emis:tx(gray(i=>Math.min(1,cr[i]+.3*(1-smooth(0,.12,CA.f2[i]-CA.f1[i]))))),normal:tx(normalMap(h,6)),canvas:map};}
  // jelly membrane veins
  TEX.membrane={map:tx(fromFn((i,x,y,o)=>{const v=seam(CB,i,.05);o[0]=B(.55+.2*NM[i]+.35*v);o[1]=B(.75+.15*NM[i]+.25*v);o[2]=B(.9+.1*v);})),emis:tx(gray(i=>.2+.8*seam(CB,i,.05)))};
  // spire runes: circuit traces over obsidian
  {const ec=mkCanvas(),eg=ec.getContext('2d'),r=mulberry(5);eg.fillStyle='#000';eg.fillRect(0,0,TX,TX);eg.strokeStyle='#fff';eg.fillStyle='#fff';eg.lineCap='round';
    for(let k=0;k<70;k++){let x=16+Math.floor(r()*30)*16,y=16+Math.floor(r()*30)*16;eg.lineWidth=r()<.3?3:1.6;eg.beginPath();eg.moveTo(x,y);
      for(let s=0,n=3+r()*7;s<n;s++){const d=Math.floor(r()*4),l=16*(1+Math.floor(r()*3));x=clamp(x+[l,-l,0,0][d],8,TX-8);y=clamp(y+[0,0,l,-l][d],8,TX-8);eg.lineTo(x,y);}
      eg.stroke();eg.beginPath();eg.arc(x,y,3.5,0,7);eg.fill();}
    for(let b=0;b<6;b++){const y=40+b*80;for(let x=20;x<TX-20;x+=14+r()*10){const w=4+r()*8,h=6+r()*10;eg.fillRect(x,y,w,2);if(r()<.6)eg.fillRect(x+w/2-1,y,2,h);}}
    TEX.runes={map:TEX.obsidian.map,normal:TEX.obsidian.normal,emis:tx(ec)};}
  // cargo crate: frame, braces, stencil
  {const ac=mkCanvas(),ag=ac.getContext('2d'),hc=mkCanvas(),hg=hc.getContext('2d');
    ag.fillStyle='#bdbdbd';ag.fillRect(0,0,TX,TX);hg.fillStyle='#606060';hg.fillRect(0,0,TX,TX);
    hg.save();hg.beginPath();hg.rect(40,40,TX-80,TX-80);hg.clip();hg.strokeStyle='#a8a8a8';hg.lineWidth=34;hg.beginPath();hg.moveTo(0,0);hg.lineTo(TX,TX);hg.moveTo(TX,0);hg.lineTo(0,TX);hg.stroke();hg.restore();
    ag.save();ag.beginPath();ag.rect(40,40,TX-80,TX-80);ag.clip();ag.strokeStyle='#cfcfcf';ag.lineWidth=34;ag.beginPath();ag.moveTo(0,0);ag.lineTo(TX,TX);ag.moveTo(TX,0);ag.lineTo(0,TX);ag.stroke();ag.restore();
    hg.strokeStyle='#b8b8b8';hg.lineWidth=40;hg.strokeRect(20,20,TX-40,TX-40);ag.strokeStyle='#d6d6d6';ag.lineWidth=40;ag.strokeRect(20,20,TX-40,TX-40);
    ag.strokeStyle='rgba(40,36,30,.7)';ag.lineWidth=2;ag.strokeRect(41,41,TX-82,TX-82);ag.strokeRect(2,2,TX-4,TX-4);
    for(const [x,y] of [[20,20],[TX-20,20],[20,TX-20],[TX-20,TX-20]]){hg.fillStyle='#f0f0f0';hg.beginPath();hg.arc(x,y,9,0,7);hg.fill();ag.fillStyle='#9a9aa4';ag.beginPath();ag.arc(x,y,8,0,7);ag.fill();}
    ag.fillStyle='rgba(26,24,20,.82)';ag.font='bold 74px "Arial Narrow",Arial,sans-serif';ag.textAlign='center';ag.textBaseline='middle';ag.fillText('MRD-07',TX/2,TX/2-18);
    ag.font='bold 22px Arial,sans-serif';ag.fillText('MERIDIAN STORES · 40 KG',TX/2,TX/2+38);
    ag.fillStyle='rgba(255,180,80,.9)';ag.fillRect(TX/2-60,TX/2+62,120,10);
    multiply(ag,gray(i=>(.85+.15*NM[i])*(1-.3*smooth(.55,.8,NL[i]))));
    TEX.crate={map:tx(ac),normal:tx(normalMap(blur(readGray(hc),2),5))};}
  // visor: reflected horizon
  {const c=mkCanvas(256,256),g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,256);
    gr.addColorStop(0,'#050a12');gr.addColorStop(.38,'#163a48');gr.addColorStop(.5,'#9ff8e8');gr.addColorStop(.56,'#2a6a70');gr.addColorStop(1,'#04070c');
    g.fillStyle=gr;g.fillRect(0,0,256,256);g.fillStyle='rgba(255,255,255,.06)';for(let y=0;y<256;y+=4)g.fillRect(0,y,256,1);
    TEX.visor={map:tx(c)};}
  // lander hull: base hull plus a livery stripe
  {const c=mkCanvas(),g=c.getContext('2d');g.drawImage(TEX.hull.canvas,0,0);g.fillStyle='rgba(255,138,76,.92)';g.fillRect(0,TX*.44,TX,26);g.fillStyle='rgba(240,236,250,.9)';g.fillRect(0,TX*.44+30,TX,5);
    TEX.lander={map:tx(c),normal:TEX.hull.normal,rough:TEX.hull.rough};}
  // gas giant bands
  {const pal=[[59,58,122],[91,79,154],[47,63,120],[122,106,176],[70,61,134],[141,127,192],[51,53,109],[166,150,214]];
    TEX.giant=new THREE.CanvasTexture(fromFn((i,x,y,o)=>{const sx=x,sy=(y*2)%TX,k=sy*TX+sx;let b=y/256*7+(NL[k]-.5)*1.6+(NM[k]-.5)*.5;b=((b%pal.length)+pal.length)%pal.length;
      const a=pal[b|0],c=pal[((b|0)+1)%pal.length],t=smooth(0,1,b%1);const sh=.85+.3*NH[k];o[0]=lerp(a[0],c[0],t)*sh;o[1]=lerp(a[1],c[1],t)*sh;o[2]=lerp(a[2],c[2],t)*sh;},TX,256));
    const rc=mkCanvas(),g=rc.getContext('2d');for(let rad=170;rad<256;rad+=1){const t=(rad-170)/86;const a=(.25+.35*Math.abs(Math.sin(t*23))+.2*Math.sin(t*61))*(1-Math.abs(t-.5)*1.1);g.strokeStyle=`rgba(200,186,236,${clamp(a,0,1)})`;g.lineWidth=1.2;g.beginPath();g.arc(256,256,rad,0,7);g.stroke();}
    TEX.ring=new THREE.CanvasTexture(rc);}
  TEX._N={NL,NM,NH,CA,CB,FIB,STR,H};
}
function std(set,o={}){const p={map:set.map,roughness:.75,metalness:.15};
  if(set.normal){p.normalMap=set.normal;p.normalScale=new THREE.Vector2(1,1);}
  if(set.rough)p.roughnessMap=set.rough;if(set.emis)p.emissiveMap=set.emis;
  return new THREE.MeshStandardMaterial(Object.assign(p,o));}
function decalTex(lines,w,h,{fg='#ece6f5',bg=null,size=.5,wear=true}={}){
  const cw=512,ch=Math.max(32,Math.round(512*h/w)),c=mkCanvas(cw,ch),g=c.getContext('2d');
  if(bg){g.fillStyle=bg;g.fillRect(0,0,cw,ch);}
  g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';
  const L=Array.isArray(lines)?lines:[lines];L.forEach((t,k)=>{let fs=Math.round(ch*size/(k?1.8:1));g.font=`bold ${fs}px "Arial Narrow",Arial,sans-serif`;const tw=g.measureText(t).width;if(tw>cw*.92){fs=Math.floor(fs*cw*.92/tw);g.font=`bold ${fs}px "Arial Narrow",Arial,sans-serif`;}g.fillText(t,cw/2,ch*(L.length>1?(k?.75:.38):.52));});
  if(wear){const r=mulberry(lines.length*31+7);g.globalCompositeOperation='destination-out';for(let i=0;i<220;i++){g.globalAlpha=r()*.6;g.beginPath();g.arc(r()*cw,r()*ch,r()*2.4,0,7);g.fill();}g.globalAlpha=1;g.globalCompositeOperation='source-over';}
  return new THREE.CanvasTexture(c);}
function decal(lines,w,h,opts){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:decalTex(lines,w,h,opts),transparent:true,roughness:.7,polygonOffset:true,polygonOffsetFactor:-4,depthWrite:false}));m.receiveShadow=true;return m;}

/* ================= GEOMETRY HELPERS ================= */
const cyl=(rt,rb,h,s=16,hs=1,open=false)=>new THREE.CylinderGeometry(rt,rb,h,s,hs,open);
const sph=(r,w=24,h=16,ps=0,pl=Math.PI*2,ts=0,tl=Math.PI)=>new THREE.SphereGeometry(r,w,h,ps,pl,ts,tl);
const cone=(r,h,s=12)=>new THREE.ConeGeometry(r,h,s);
const tor=(r,t,rs=10,ts=32,arc=Math.PI*2)=>new THREE.TorusGeometry(r,t,rs,ts,arc);
const lathe=(pts,s=24)=>new THREE.LatheGeometry(pts.map(([x,y])=>new THREE.Vector2(x,y)),s);
function rbox(w,h,d,r,k=3){
  r=Math.min(r,w/2-1e-3,h/2-1e-3,d/2-1e-3);const N=2*k+2,g=new THREE.BoxGeometry(w,h,d,N,N,N),p=g.attributes.position,n=g.attributes.normal;
  const map=(a,L)=>{const j=Math.round((a/L+.5)*N);if(j<=k)return -L/2+r*j/k;if(j>=N-k)return L/2-r*(N-j)/k;return -(L/2-r)+(j-k)/(N-2*k)*(L-2*r);};
  const dims=[w,h,d],v=[0,0,0];
  for(let i=0;i<p.count;i++){v[0]=map(p.getX(i),w);v[1]=map(p.getY(i),h);v[2]=map(p.getZ(i),d);
    const c=v.map((a,ax)=>clamp(a,-(dims[ax]/2-r),dims[ax]/2-r)),dx=v[0]-c[0],dy=v[1]-c[1],dz=v[2]-c[2],l=Math.hypot(dx,dy,dz);
    if(l>1e-6){p.setXYZ(i,c[0]+dx/l*r,c[1]+dy/l*r,c[2]+dz/l*r);n.setXYZ(i,dx/l,dy/l,dz/l);}else p.setXYZ(i,v[0],v[1],v[2]);}
  return g;}
function projUV(g,unit=1){const p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v;
    if(ax>=ay&&ax>=az){u=-p.getZ(i)*Math.sign(n.getX(i));v=p.getY(i);}else if(ay>=az){u=p.getX(i);v=-p.getZ(i)*Math.sign(n.getY(i));}else{u=p.getX(i)*Math.sign(n.getZ(i));v=p.getY(i);}
    uv[i*2]=u/unit;uv[i*2+1]=v/unit;}
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;}
function scaleUV(g,su,sv){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*su,uv.getY(i)*sv);return g;}
const RB=(w,h,d,r,u=.35,k=3)=>projUV(rbox(w,h,d,r,k),u);
function rockGeo(detail,seed,amp=.36,flat=.35){const g=new THREE.IcosahedronGeometry(1,detail),p=g.attributes.position,v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=noise3(v.x*1.4+seed,v.y*1.4,v.z*1.4)*.7+noise3(v.x*3.6,v.y*3.6+seed,v.z*3.6)*.3;v.multiplyScalar(1+(n-.5)*amp*2);if(v.y<-flat)v.y=-flat+(v.y+flat)*.25;p.setXYZ(i,v.x,v.y,v.z);}
  g.computeVertexNormals();return projUV(g,.9);}
const crystalGeo=(r,h,tip=.24,s=6)=>lathe([[0,0],[r*.82,h*.03],[r,h*.1],[r*.94,h*(1-tip)],[0,h]],s);
// Merge many small parts into one mesh per material so detailed models stay cheap to draw.
function mergeGeos(list){let n=0;const parts=list.map(([g,m])=>{const ng=g.index?g.toNonIndexed():g.clone();ng.applyMatrix4(m);n+=ng.attributes.position.count;return ng;});
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2);let o=0;
  for(const g of parts){pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,o*2);o+=g.attributes.position.count;g.dispose();}
  const r=new THREE.BufferGeometry();r.setAttribute('position',new THREE.BufferAttribute(pos,3));r.setAttribute('normal',new THREE.BufferAttribute(nor,3));r.setAttribute('uv',new THREE.BufferAttribute(uv,2));r.computeBoundingSphere();return r;}
const _q=new THREE.Quaternion(),_e=new THREE.Euler(),_v=new THREE.Vector3(),_s=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0);
class Parts{constructor(){this.b=new Map();}
  add(parent,mat,geo,x=0,y=0,z=0,rx=0,ry=0,rz=0,sx=1,sy=sx,sz=sx){const m=new THREE.Matrix4().compose(_v.set(x,y,z),_q.setFromEuler(_e.set(rx,ry,rz)),_s.set(sx,sy,sz));return this.addM(parent,mat,geo,m);}
  addM(parent,mat,geo,m){const key=parent.uuid+'|'+mat.uuid;if(!this.b.has(key))this.b.set(key,{parent,mat,list:[]});this.b.get(key).list.push([geo,m]);return this;}
  beam(parent,mat,a,b,r,seg=8){const d=_v.subVectors(b,a),L=d.length();const m=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),_q.setFromUnitVectors(UP,d.normalize()),_s.set(1,1,1));return this.addM(parent,mat,cyl(r,r,L,seg),m);}
  build(shadow=true){const out=[];for(const {parent,mat,list} of this.b.values()){const m=new THREE.Mesh(mergeGeos(list),mat);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);out.push(m);}this.b.clear();return out;}}

// the soft halo used by every glow sprite, computed per pixel: canvas gradients are dithered on some GPUs (Safari), and bloom
// magnified that dither into specks floating in the glows
const GLOW=(()=>{const N=128,d=new Uint8Array(N*N*4);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const r=Math.hypot(x+.5-N/2,y+.5-N/2)/(N/2),a=r>=1?0:Math.pow(1-r,2.2)*(r<.25?1:1)*(1-.0*r);
  const k=(y*N+x)*4;d[k]=d[k+1]=d[k+2]=255;d[k+3]=Math.round(Math.min(1,a*1.15)*255);}const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat);t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;})();
const glowMats={};
function glowSprite(color,size,op=1){const k=color+'_'+op;if(!glowMats[k]){glowMats[k]=new THREE.SpriteMaterial({map:GLOW,color,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false});if(typeof POST!=='undefined'&&POST.on&&POST.composer)boostMat(glowMats[k],true);}const s=new THREE.Sprite(glowMats[k]);s.scale.set(size,size,1);return s;}

// ===== 03_tex2.js =====
/* ================= MORE TEXTURES: interiors, deserts, ice, lava, reed wood, water, screens ================= */
{
  const {NL,NM,NH,CA,CB,FIB,STR}=TEX._N,H=()=>new Float32Array(NPX);
  const seam=(c,i,w)=>1-smooth(0,w,c.f2[i]-c.f1[i]);
  // interior floor: large plates, inset seams, anti-slip dots, scuffs
  {const h=H(),al=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x,px=x%256,py=y%256,edge=Math.min(px,py,255-px,255-py);
      const sm=edge<3?1:0,bevel=smooth(3,10,edge),dot=((x%32-16)**2+(y%32-16)**2)<10&&edge>20?1:0;
      h[i]=.45+.25*bevel-sm*.5+dot*.15+.05*NH[i];al[i]=(.62+.08*NM[i]+(((x/256|0)+(y/256|0))&1)*.04-.12*smooth(.6,.8,NL[i]))*(sm?.45:1)+dot*.05;}
    TEX.tile={map:tx(fromFn((i,x,y,o)=>{o[0]=B(al[i]*.96);o[1]=B(al[i]*.97);o[2]=B(al[i]);})),normal:tx(normalMap(h,6)),rough:tx(gray(i=>.45+.3*smooth(.55,.85,NL[i])))};}
  // interior wall: tall panels, vent slots, light-strip channels
  {const hc=mkCanvas(),hg=hc.getContext('2d'),ac=mkCanvas(),ag=ac.getContext('2d'),r=mulberry(44);
    hg.fillStyle='#808080';hg.fillRect(0,0,TX,TX);ag.fillStyle='#c9c6d2';ag.fillRect(0,0,TX,TX);
    for(let c=0;c<4;c++){const x=c*128,t=Math.round(192+r()*30);ag.fillStyle=`rgb(${t},${t},${t+6})`;ag.fillRect(x+3,0,122,TX);
      hg.fillStyle='#a6a6a6';hg.fillRect(x+6,6,116,TX-12);hg.strokeStyle='#1a1a1a';hg.lineWidth=4;hg.strokeRect(x+2,2,124,TX-4);
      ag.strokeStyle='rgba(30,26,40,.85)';ag.lineWidth=3;ag.strokeRect(x+2,2,124,TX-4);
      if(r()<.5){for(let s=0;s<6;s++){hg.fillStyle='#303030';hg.fillRect(x+24,60+s*10,80,5);ag.fillStyle='rgba(26,22,34,.9)';ag.fillRect(x+24,60+s*10,80,5);}}
      hg.fillStyle='#2a2a2a';hg.fillRect(x+20,300,88,10);ag.fillStyle='rgba(40,36,52,.9)';ag.fillRect(x+20,300,88,10);
      for(let k=0;k<6;k++){hg.fillStyle='#dadada';hg.beginPath();hg.arc(x+14,30+k*90,2.6,0,7);hg.fill();hg.beginPath();hg.arc(x+114,30+k*90,2.6,0,7);hg.fill();}}
    multiply(ag,gray(i=>(.88+.12*NM[i])*(1-.18*smooth(.55,.8,STR[i]))));
    TEX.wall={map:tx(ac),normal:tx(normalMap(blur(readGray(hc),1),6))};}
  // floor grating (walkways)
  {const h=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x,a=Math.abs((x%32)-16)<4||Math.abs((y%16)-8)<2?1:0;h[i]=a?.8:.2+.05*NH[i];}
    TEX.grate={map:tx(gray(i=>h[i]>.5?.62+.1*NM[i]:.12)),normal:tx(normalMap(blur(h,1),5))};}
  // desert sand with wind ripples
  {const h=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x,r=Math.sin((y+NL[i]*90+NM[i]*20)*.35)*.5+.5;h[i]=r*.5+.3*NM[i]+.2*NH[i];}
    TEX.sand={map:tx(fromFn((i,x,y,o)=>{const v=.82+.1*NM[i]+.06*h[i]+.04*NH[i];o[0]=B(v*1.03);o[1]=B(v*.97);o[2]=B(v*.9);})),normal:tx(normalMap(h,6))};}
  // ice: deep cracks, frost speckle
  {const h=H();for(let i=0;i<NPX;i++){h[i]=.6+.15*NM[i]-.5*seam(CB,i,.025)-.25*seam(CA,i,.04)+.08*NH[i];}
    TEX.ice={map:tx(fromFn((i,x,y,o)=>{const c=seam(CB,i,.025)*.5+seam(CA,i,.04)*.3,v=.82+.12*NM[i]+.06*NH[i];o[0]=B(v*(.86+.1*c));o[1]=B(v*(.93+.05*c));o[2]=B(Math.min(1,v*1.02+.06*c));})),normal:tx(normalMap(h,5))};}
  // basalt with molten cracks
  {const cr=H(),h=H();for(let i=0;i<NPX;i++){cr[i]=seam(CA,i,.05);h[i]=.5+.3*(1-CA.f1[i])+.2*NM[i]-.6*cr[i];}
    TEX.lava={map:tx(fromFn((i,x,y,o)=>{const v=.16+.12*NM[i]+.08*(1-CA.f1[i]);o[0]=B(v+cr[i]*.55);o[1]=B(v*.9+cr[i]*.22);o[2]=B(v*.85);})),emis:tx(gray(i=>Math.min(1,cr[i]*1.1+.25*(1-smooth(0,.14,CA.f2[i]-CA.f1[i]))))),normal:tx(normalMap(h,8))};}
  // reed planks (Calder stilt village)
  {const h=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x,pl=(y%64),gap=pl<3?1:0;h[i]=.5+.35*FIB[(x*7%TX)+(y%TX)*0]+.15*NM[i]-gap*.6;}
    TEX.reed={map:tx(fromFn((i,x,y,o)=>{const pl=(y%64),gap=pl<3?1:0,v=(.52+.3*FIB[((x*3)%TX)]+.12*NM[i]+((y/64|0)%3)*.03)*(gap?.35:1);o[0]=B(v*1.0);o[1]=B(v*.82);o[2]=B(v*.58);})),normal:tx(normalMap(h,6))};}
  // broad leaves with veins
  TEX.leaf={map:tx(gray((i,x,y)=>{const u=x/TX-.5,v=y/TX;const vein=Math.abs(u)<.008?1:Math.abs(Math.abs(u)-((v*3)%1)*.4)<.006?.6:0;return .55+.25*NM[i]+.2*vein;}))};
  // water ripple normal
  {const h=H();for(let y=0;y<TX;y++)for(let x=0;x<TX;x++){const i=y*TX+x;h[i]=.5*NM[i]+.3*NH[i]+.2*Math.sin((x+y)*.06+NL[i]*8);}TEX.water={normal:tx(normalMap(h,3))};}
  // console screens: a few animated-looking UI layouts painted once
  const screen=(seed,hue)=>{const c=mkCanvas(256,160),g=c.getContext('2d'),r=mulberry(seed);g.fillStyle='#04080c';g.fillRect(0,0,256,160);
    g.strokeStyle=hue;g.fillStyle=hue;g.globalAlpha=.9;g.lineWidth=2;g.strokeRect(6,6,244,148);g.font='bold 13px monospace';g.fillText(['SYS','NAV','PWR','COMMS','LIFE','DOCK'][seed%6]+' · '+(100+Math.floor(r()*900)),14,24);
    g.globalAlpha=.6;for(let k=0;k<7;k++)g.fillRect(14,36+k*14,30+r()*130,6);
    g.globalAlpha=.85;g.beginPath();for(let x=0;x<90;x++){const yy=118-20*Math.sin(x*.15+seed)-10*r();x?g.lineTo(160+x,yy):g.moveTo(160,yy);}g.stroke();
    g.beginPath();g.arc(205,60,24,0,7);g.stroke();g.beginPath();g.moveTo(205,60);g.lineTo(205+Math.cos(seed)*24,60+Math.sin(seed)*24);g.stroke();return new THREE.CanvasTexture(c);};
  TEX.screens=[0,1,2,3,4,5].map(i=>screen(i+3,['#6ff2d6','#ffc35a','#8fd8ff','#ff7a5a','#a98cff','#7fe08a'][i]));
  // starfield + planet for windows looking out into space
  {const c=mkCanvas(1024,512),g=c.getContext('2d');g.fillStyle='#020208';g.fillRect(0,0,1024,512);const r=mulberry(9);
    for(let i=0;i<1400;i++){const a=r();g.fillStyle=`rgba(${200+r()*55},${200+r()*55},255,${a*a})`;g.fillRect(r()*1024,r()*512,r()<.05?2:1,r()<.05?2:1);}
    const gr=g.createRadialGradient(700,620,40,700,620,420);gr.addColorStop(0,'#ffb37f');gr.addColorStop(.35,'#7a3a5a');gr.addColorStop(.62,'#2a1838');gr.addColorStop(.7,'rgba(60,140,200,.5)');gr.addColorStop(.74,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(700,620,420,0,7);g.fill();
    TEX.space=new THREE.CanvasTexture(c);}
}

// ===== 04_assets.js =====
/* ================= 3D MODEL ASSETS ================= */
// Credits: Spacesuit and the Ultimate Modular Men/Women by Quaternius, CC0; RobotExpressive by Tomás Laulhé (Quaternius), CC0;
// "Space ship hallway" by yeeyeeman on Sketchfab, CC BY 4.0.
// "Stylized Sci-Fi Soldier (animated)" by Jungle Jim on Sketchfab, CC BY 4.0 (the third player body).
// Weapons: "Scifi Gun" by Slav92 and "Scifi Heavy Blade (LowPoly)" by Wang Sh D (CC BY 4.0); "SciFi Rifle" by DJMaesen and "Shotgun" by Alex Sanches (CC BY-NC 4.0).
// Beam weapons: "Low Poly Laser Pistol 1" by sidedvirus; launchers: "Grenade Launcher (Death Stranding fan art)" by mnshkv (both CC BY 4.0).
// Townspeople: Ready Player Me avatars from Sketchfab (CC BY-NC-SA 4.0); robots: "rusty robot Walking", "Mech Drone", "Robot", "BOX-02 Robot" (CC BY 4.0).
// The Vesper: "Phantom Sabre jet" by #3D $Resource$ (CC BY 4.0).
// "Golem Rigged" by FourthGreen and "Alien Ninja Creature" by Jungle Jim (CC BY 4.0); "Manta Ray Birostris (animated)" by Violaine (CC BY-NC-SA 4.0).
// "Flying Bot" by colizey, "FireBall" by tamminen and "Nightmare Creature 1#" by Idk on Sketchfab, all CC BY 4.0.
// "alien low poly" by vicente betoret ferrero on Sketchfab, CC BY 4.0 (the Hollow Warden).
// "Alien" by DJMaesen on Sketchfab, CC BY 4.0 (the skitters).
// "Sci-Fi Male Character" by Xavi Pujadas on Sketchfab, CC BY-NC-ND 4.0 (used unaltered in shape; textures resized for size).
const MODELS={},CLIPS={};
const gltfLoader=new THREE.GLTFLoader();
if(window.MeshoptDecoder)gltfLoader.setMeshoptDecoder(MeshoptDecoder);
// iPads have far less graphics memory than a computer; when it runs out, textures upload black and models stop drawing.
// There, big model textures are scaled down once as they load (the player's own body keeps more detail).
const TEX_CAP=(typeof isTouch!=='undefined'&&isTouch)||/iPad|iPhone/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?512:0;
function capTextures(root,cap){const done=new Set();root.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]))for(const k in m){const t=m[k];
  if(!t||!t.isTexture||done.has(t)||!t.image)continue;done.add(t);const im=t.image,w=im.width,h=im.height;if(!(w>cap||h>cap))continue;const k2=cap/Math.max(w,h),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*k2));c.height=Math.max(1,Math.round(h*k2));try{c.getContext('2d').drawImage(im,0,0,c.width,c.height);if(im.close)im.close();t.image=c;t.needsUpdate=true;}catch(e){}}});}
function loadModel(id){return new Promise(res=>{const buf=assetBuf(id);if(!buf)return res(null);
  try{gltfLoader.parse(buf,'',g=>{if(TEX_CAP)capTextures(g.scene,['suit','prota','soldier'].includes(id)?1024:TEX_CAP);MODELS[id]=g;res(g);},e=>{console.error('model',id,e);res(null);});}catch(e){console.error(e);res(null);}});}
async function loadAllModels(){
  if(window.MeshoptDecoder&&MeshoptDecoder.ready)await MeshoptDecoder.ready;
  for(const id of ['vesper','stbot','halobar','chair_a','chair_b','plants','shipkit','sterm','schair','borer','suit','men','women','robot','hallway','prota','alien','warden','drone','wisp','vash','golem','stalker','ray','soldier','wpn_pistol','wpn_rifle','wpn_shotgun','wpn_blade','wpn_beam','wpn_gl','sabre','npc_f1','npc_f2','npc_f3','npc_f5','npc_f6','npc_f7','npc_m1','npc_m2','npc_m3','npc_m4','npc_m5','npc_m6','npc_m7','npc_m8','npc_r1','npc_r2','npc_r3','npc_r4','env_cr1','env_cr2','env_cr3','env_cr4','env_cr5','env_jelly','env_runes','env_ruins','env_pebbles','env_boulder','env_fire','env_tent','env_rover','env_shuttle']){await loadModel(id);await nextFrame();}
  // the Quaternius rig is shared by the spacesuit and every townsperson, so one clip set drives everyone
  CLIPS.q={};(MODELS.suit?MODELS.suit.animations:[]).forEach(a=>CLIPS.q[a.name]=a);
  for(const k of ['Idle','Idle_Gun','Idle_Gun_Pointing','Idle_Neutral','Walk','Run','Run_Shoot','Run_Back','Run_Left','Run_Right'])if(CLIPS.q[k])stripRoot(CLIPS.q[k]);
  const R=MODELS.robot?MODELS.robot.animations:[];CLIPS.robot={};R.forEach(a=>CLIPS.robot[a.name]=a);
}
// Keep loops in place: pin the root's horizontal travel to its first frame so movement comes from gameplay.
function stripRoot(clip){for(const t of clip.tracks){if(/^(Root|Body|Hips)\.position$/.test(t.name)){const v=t.values,x0=v[0],z0=v[2];for(let i=0;i<v.length;i+=3){v[i]=x0;v[i+2]=z0;}}}}
function cloneModel(id){const m=MODELS[id];if(!m)return null;const o=THREE.SkeletonUtils.clone(m.scene);
  o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;c.frustumCulled=false;if(c.material){c.material=Array.isArray(c.material)?c.material.map(x=>x.clone()):c.material.clone();}}});return o;}
function boneMap(o){const B={};o.traverse(c=>{if(c.isBone)B[c.name.replace(/^mixamorig:?/,'')]=c;});return B;}

// ===== 05_fx.js =====
/* ================= EFFECTS ================= */
// Pooled particles, shader-drawn shock rings and energy fans, camera-facing lightning ribbons.
const FX={items:[]};
{
  const N=isTouch?1100:2200,pos=new Float32Array(N*3),col=new Float32Array(N*3),siz=new Float32Array(N),alp=new Float32Array(N);
  const geo=new THREE.BufferGeometry();
  const A=(n,a,s)=>{const b=new THREE.BufferAttribute(a,s);b.setUsage(THREE.DynamicDrawUsage);geo.setAttribute(n,b);return b;};
  const aPos=A('position',pos,3),aCol=A('pcol',col,3),aSiz=A('psize',siz,1),aAlp=A('palpha',alp,1);
  const pmat=new THREE.ShaderMaterial({uniforms:{scale:{value:400}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float scale;attribute vec3 pcol;attribute float psize;attribute float palpha;varying vec3 vC;varying float vA;
      void main(){vC=pcol;vA=palpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=min(256.,psize*scale/max(.1,-mv.z));gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){if(vA<=0.)discard;vec2 d=gl_PointCoord-.5;float r=length(d)*2.;if(r>1.)discard;
      float core=exp(-r*r*7.);float halo=(1.-r)*.45;gl_FragColor=vec4(vC*(core*1.7+halo)+vec3(core*.55),(core+halo)*vA);}`});
  const pts=new THREE.Points(geo,pmat);pts.frustumCulled=false;pts.renderOrder=5;scene.add(pts);
  const P=[];for(let i=0;i<N;i++)P.push({life:0,max:1});let cur=0;
  const tc=new THREE.Color(),tc2=new THREE.Color();
  FX.spawn=(x,y,z,vx,vy,vz,o)=>{const p=P[cur];cur=(cur+1)%N;p.x=x;p.y=y;p.z=z;p.vx=vx;p.vy=vy;p.vz=vz;p.life=p.max=o.life;p.s0=o.size;p.s1=o.size1===undefined?0:o.size1;
    tc.set(o.c0);tc2.set(o.c1===undefined?o.c0:o.c1);p.r0=tc.r;p.g0=tc.g;p.b0=tc.b;p.r1=tc2.r;p.g1=tc2.g;p.b1=tc2.b;p.drag=o.drag===undefined?2:o.drag;p.grav=o.grav||0;};
  FX.particles=dt=>{for(let i=0;i<N;i++){const p=P[i];if(p.life<=0){alp[i]=0;continue;}p.life-=dt;const k=Math.max(0,p.life/p.max),t=1-k,dr=Math.exp(-p.drag*dt);
    p.vx*=dr;p.vz*=dr;p.vy=p.vy*dr-p.grav*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;col[i*3]=p.r0+(p.r1-p.r0)*t;col[i*3+1]=p.g0+(p.g1-p.g0)*t;col[i*3+2]=p.b0+(p.b1-p.b0)*t;
    siz[i]=p.s0+(p.s1-p.s0)*t;alp[i]=Math.min(1,k*4);}
    aPos.needsUpdate=aCol.needsUpdate=aSiz.needsUpdate=aAlp.needsUpdate=true;};
  FX.resize=()=>{pmat.uniforms.scale.value=renderer.getDrawingBufferSize(new THREE.Vector2()).y*.5/Math.tan(camera.fov*Math.PI/360);};
  FX.resize();
}
const RING_VS=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function ringMat(){return new THREE.ShaderMaterial({uniforms:{t:{value:0},col:{value:new THREE.Color()},seed:{value:0},thick:{value:.07}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,vertexShader:RING_VS,
  fragmentShader:`uniform float t;uniform vec3 col;uniform float seed;uniform float thick;varying vec2 vUv;
  void main(){vec2 p=vUv*2.-1.;float r=length(p);float a=atan(p.y,p.x);float R=.22+.7*sqrt(t);float w=thick*(1.+t*1.4);
    float n=(sin(a*9.+seed+t*14.)*.5+.5)*(sin(a*23.-seed*2.-t*22.)*.25+.75);
    float band=exp(-pow((r-R)/w,2.));float inner=exp(-pow((r-R*.8)/(w*.45),2.))*.55;float hex=step(.5,fract(a*3.8197+seed))*exp(-pow((r-R*.9)/(w*.25),2.))*.6;
    float glow=smoothstep(R,0.,r)*.14;float al=(band*(.5+.5*n)+inner+hex+glow)*(1.-t)*(1.-t);
    gl_FragColor=vec4(mix(col,vec3(1.),band*.55)*1.5,min(1.,al*1.4));}`});}
const fanMat=new THREE.ShaderMaterial({uniforms:{t:{value:0},col:{value:new THREE.Color()},seed:{value:0},spread:{value:.95},reach:{value:6.5}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,vertexShader:RING_VS,
  fragmentShader:`uniform float t;uniform vec3 col;uniform float seed;uniform float spread;uniform float reach;varying vec2 vUv;
  void main(){vec2 q=vec2((vUv.x-.5)*12.,vUv.y*8.);float r=length(q);float ang=atan(q.x,q.y);
    float R=reach*pow(t,.55);float w=.3+.45*t;float front=exp(-pow((r-R)/w,2.));
    float lines=pow(sin(r*16.-t*46.+seed)*.5+.5,6.)*smoothstep(R,R-2.4,r)*step(r,R+.2);
    float turb=sin(ang*17.+seed+r*1.3)*sin(r*4.-t*13.)*.5+.5;float spokes=pow(abs(sin(ang*11.+seed)),12.)*smoothstep(R,0.,r)*.5;
    float mask=smoothstep(spread,spread*.55,abs(ang))*smoothstep(.15,.9,r);
    float al=(front*(.6+.4*turb)+lines*.4+spokes*.3)*mask*pow(1.-t,1.4);
    gl_FragColor=vec4(mix(col,vec3(1.),front*.5)*1.4,min(1.,al*1.3));}`});
const fan=new THREE.Mesh(new THREE.PlaneGeometry(12,8).translate(0,4,0).rotateX(Math.PI/2),fanMat);fan.visible=false;fan.frustumCulled=false;scene.add(fan);
const ringPool=[];for(let i=0;i<14;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),ringMat());m.visible=false;m.frustumCulled=false;scene.add(m);ringPool.push(m);}
let ringCur=0;const takeRing=()=>{const m=ringPool[ringCur];ringCur=(ringCur+1)%ringPool.length;return m;};
const STAR=new THREE.CanvasTexture((()=>{const c=mkCanvas(128),g=c.getContext('2d');g.translate(64,64);const gr=g.createRadialGradient(0,0,0,0,0,64);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.18,'rgba(255,255,255,.7)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(-64,-64,128,128);
  g.fillStyle='rgba(255,255,255,.9)';for(let i=0;i<8;i++){g.rotate(Math.PI/4);g.beginPath();g.moveTo(0,-4);g.lineTo(i%2?40:62,0);g.lineTo(0,4);g.closePath();g.fill();}return c;})());
const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:STAR,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));flash.visible=false;scene.add(flash);
// lightning ribbons
const bolts=[];
for(let i=0;i<8;i++){const n=16,mk=(op)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*2*3),3));const idx=[];for(let k=0;k<n-1;k++){const a=k*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}g.setIndex(idx);
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));m.frustumCulled=false;m.visible=false;scene.add(m);return m;};
  bolts.push({n,outer:mk(.5),core:mk(1),t:1,dur:.2,a:new THREE.Vector3(),b:new THREE.Vector3(),pts:[],jit:0});}
let boltCur=0;
const _bd=new THREE.Vector3(),_bp=new THREE.Vector3(),_bs=new THREE.Vector3(),_cd=new THREE.Vector3();
function jitterBolt(B){const d=_bd.subVectors(B.b,B.a),L=d.length();d.normalize();const p1=new THREE.Vector3().crossVectors(d,UP);if(p1.lengthSq()<1e-4)p1.set(1,0,0);p1.normalize();const p2=new THREE.Vector3().crossVectors(d,p1);
  B.pts=[];for(let i=0;i<B.n;i++){const s=i/(B.n-1),amp=Math.sin(s*Math.PI)*Math.min(.5,L*.09);B.pts.push(B.a.clone().addScaledVector(d,L*s).addScaledVector(p1,(Math.random()-.5)*2*amp).addScaledVector(p2,(Math.random()-.5)*2*amp));}}
function writeRibbon(m,pts,w){const a=m.geometry.attributes.position;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[Math.min(i+1,pts.length-1)],o=pts[Math.max(i-1,0)];
  _bs.subVectors(q,o);_cd.subVectors(camera.position,p);_bp.crossVectors(_bs,_cd).normalize().multiplyScalar(w*(i===0||i===pts.length-1?.3:1));
  a.setXYZ(i*2,p.x+_bp.x,p.y+_bp.y,p.z+_bp.z);a.setXYZ(i*2+1,p.x-_bp.x,p.y-_bp.y,p.z-_bp.z);}a.needsUpdate=true;}
FX.bolt=(a,b,col,dur=.22)=>{const B=bolts[boltCur];boltCur=(boltCur+1)%bolts.length;B.a.copy(a);B.b.copy(b);B.t=0;B.dur=dur;B.jit=0;B.outer.material.color.set(col);jitterBolt(B);B.outer.visible=B.core.visible=true;
  const d=_bd.subVectors(b,a);for(let i=0;i<10;i++){const s=Math.random();FX.spawn(a.x+d.x*s,a.y+d.y*s,a.z+d.z*s,rr(-1.5,1.5),rr(-1,2),rr(-1.5,1.5),{life:rr(.15,.35),size:rr(.06,.12),c0:0xffffff,c1:col,drag:3});}};
FX.add=(dur,fn,delay=0)=>FX.items.push({t:-delay,dur,fn});
const _o=new THREE.Vector3();
FX.ringAt=(pos,normalTo,col,size0,size1,dur,travel,seed,thick=.07)=>{const m=takeRing();m.material.uniforms.col.value.set(col);m.material.uniforms.seed.value=seed||Math.random()*10;m.material.uniforms.thick.value=thick;
  const start=pos.clone();FX.add(dur,k=>{m.visible=k<1;const e=1-Math.pow(1-k,2);m.position.copy(start);if(travel)m.position.addScaledVector(travel,e);
    if(normalTo==='cam')m.quaternion.copy(camera.quaternion);else if(normalTo==='up'){m.rotation.set(-Math.PI/2,0,0);}else{_o.copy(m.position).add(normalTo);m.lookAt(_o);}
    m.scale.setScalar(lerp(size0,size1,e));m.material.uniforms.t.value=k;});};
FX.burst=(p,col,n,speed,life,size)=>{for(let i=0;i<n;i++){const u=rr(-1,1),a=rr(0,6.28),s=Math.sqrt(1-u*u),v=rr(.4,1)*speed;FX.spawn(p.x,p.y,p.z,Math.cos(a)*s*v,u*v,Math.sin(a)*s*v,{life:rr(life*.6,life),size,c0:0xffffff,c1:col,drag:3.5});}};
FX.impact=(p,col,power)=>{FX.burst(p,col,Math.round(34*power),9,.45,.16);for(let i=0;i<10;i++)FX.spawn(p.x,p.y,p.z,rr(-1,1),rr(.5,2.5),rr(-1,1),{life:rr(.6,1),size:rr(.06,.1),c0:col,c1:0x200810,drag:1,grav:-1});
  FX.ringAt(p,'cam',col,.3,2.4*power,.3,null,0,.09);};
FX.fire=(o,dir,col,power,hits,chains)=>{
  const c=new THREE.Color(col);
  flash.position.copy(o).addScaledVector(dir,.15);flash.material.color.copy(c).lerp(new THREE.Color(0xffffff),.35);flash.material.rotation=Math.random()*6.28;
  FX.add(.16,k=>{flash.visible=k<1;const s=k<.25?k/.25:1-(k-.25)/.75;flash.scale.setScalar(2.4*power*s+.01);flash.material.opacity=s;});
  muzzleLight.color.copy(c);muzzleLight.position.copy(o);FX.add(.18,k=>{muzzleLight.intensity=k<1?2.6*power*(1-k)*(1-k):0;});
  for(let i=0;i<3;i++)FX.ringAt(o.clone().addScaledVector(dir,.25),dir,col,.25+i*.1,(1.5+i*.55)*power,.34+i*.04,dir.clone().multiplyScalar((1.6+i*1.5)*power),i*2.1,.06);
  fan.position.set(o.x,o.y-.3,o.z);fan.rotation.y=Math.atan2(dir.x,dir.z);fanMat.uniforms.col.value.copy(c);fanMat.uniforms.seed.value=Math.random()*10;fanMat.uniforms.reach.value=6.2*Math.min(1.3,power);
  FX.add(.42,k=>{fan.visible=k<1;fanMat.uniforms.t.value=k;});
  const gp=new THREE.Vector3(o.x,groundY(o.x,o.z)+.08,o.z);FX.ringAt(gp,'up',col,.4,5*power,.45,null,0,.05);
  const side=new THREE.Vector3().crossVectors(dir,UP).normalize();
  for(let i=0;i<Math.round(70*power);i++){const sp=rr(9,22),v=dir.clone().addScaledVector(side,rr(-.5,.5)).add(new THREE.Vector3(0,rr(-.18,.28),0)).normalize().multiplyScalar(sp);
    FX.spawn(o.x,o.y,o.z,v.x,v.y,v.z,{life:rr(.15,.38),size:rr(.09,.2),size1:.02,c0:0xffffff,c1:col,drag:5});}
  for(let i=0;i<Math.round(26*power);i++){const v=dir.clone().multiplyScalar(rr(1,4)).add(new THREE.Vector3(rr(-1,1),rr(0,1.5),rr(-1,1)));FX.spawn(o.x,o.y,o.z,v.x,v.y,v.z,{life:rr(.6,1.2),size:rr(.05,.1),c0:col,c1:0x101020,drag:1.5,grav:-1.2});}
  for(const h of hits){FX.bolt(o,h,col);FX.impact(h,col,power);}
  for(const [a,b] of chains){FX.bolt(a,b,col,.28);FX.impact(b,col,power*.8);}
  if(hits.length)sfx('zap');
  cam.shake=Math.max(cam.shake||0,.1+.06*power);
};
FX.heal=()=>{for(let i=0;i<40;i++){const a=rr(0,6.28),r=rr(.2,.8);FX.spawn(player.x+Math.cos(a)*r,player.y+rr(.2,1.6),player.z+Math.sin(a)*r,0,rr(1,2.2),0,{life:rr(.6,1.1),size:rr(.12,.2),c0:0xb8ffcf,c1:0x2aff8a,drag:1});}};
FX.heatGlow=()=>{for(let i=0;i<40;i++){const a=rr(0,6.28),r=rr(.2,.7);FX.spawn(player.x+Math.cos(a)*r,player.y+rr(.6,1.6),player.z+Math.sin(a)*r,Math.cos(a)*.6,rr(.3,1),Math.sin(a)*.6,{life:rr(.6,1),size:rr(.12,.22),c0:0xffd28a,c1:0xff4a1a,drag:1});}};
FX.overcharge=(o,col)=>{FX.burst(o,0xd8c8ff,50,5,.6,.14);FX.ringAt(o,'cam',col,.2,2.2,.4,null,0,.1);};
FX.scanPing=()=>{const p=new THREE.Vector3(player.x,player.y+.15,player.z);FX.ringAt(p,'up',0x6ff2d6,1,90,1.6,null,0,.025);FX.ringAt(p,'up',0xffc35a,1,60,1.3,null,3,.02);};
FX.craft=v=>{FX.burst(v,0x6ff2d6,60,4,.6,.1);FX.ringAt(v,'cam',0x6ff2d6,.2,1.6,.4,null,0,.1);};
FX.update=dt=>{
  for(let i=FX.items.length-1;i>=0;i--){const it=FX.items[i];it.t+=dt;if(it.t<0)continue;const k=Math.min(1,it.t/it.dur);it.fn(k);if(k>=1)FX.items.splice(i,1);}
  for(const B of bolts){if(B.t>=B.dur){if(B.outer.visible)B.outer.visible=B.core.visible=false;continue;}B.t+=dt;B.jit-=dt;if(B.jit<=0){B.jit=.035;jitterBolt(B);}
    const k=B.t/B.dur,f=1-k;writeRibbon(B.outer,B.pts,.2*f+.05);writeRibbon(B.core,B.pts,.05*f+.015);B.outer.material.opacity=.55*f;B.core.material.opacity=f;}
  FX.particles(dt);
};


// ===== 06_audio.js =====
/* ================= AUDIO ================= */
let AC=null,master=null,sfxGain=null,musicGain=null,ambGain=null,muted=false,musicOn=true,laserBuf=null,NOISE=null,beamOsc=null;
try{const p=JSON.parse(localStorage.getItem('tidelock-audio')||'{}');if(p.muted)muted=true;if(p.music===false)musicOn=false;}catch(e){}
const saveAudioPref=()=>{try{localStorage.setItem('tidelock-audio',JSON.stringify({muted,music:musicOn}));}catch(e){}};
function decodeBuf(buf){return new Promise(res=>{if(!buf||!AC)return res(null);try{const p=AC.decodeAudioData(buf,b=>res(b),()=>res(null));if(p&&p.catch)p.catch(()=>res(null));}catch(e){res(null);}});}
const pendingAudio={music:null,laser:null};
function initAudio(){
  if(AC){AC.resume&&AC.resume();return;}
  try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){AC=null;return;}
  AC.resume&&AC.resume();master=AC.createGain();master.gain.value=muted?0:.6;master.connect(AC.destination);
  sfxGain=AC.createGain();sfxGain.gain.value=1;sfxGain.connect(master);
  musicGain=AC.createGain();musicGain.gain.value=0;musicGain.connect(master);
  const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=300;ambGain=AC.createGain();ambGain.gain.value=.03;f.connect(ambGain);ambGain.connect(master);
  [[55,'sawtooth',-6],[82.4,'sawtooth',5],[110.2,'sine',0],[164.8,'triangle',3]].forEach(([fr,ty,dt])=>{const o=AC.createOscillator();o.type=ty;o.frequency.value=fr;o.detune.value=dt;o.connect(f);o.start();});
  const lfo=AC.createOscillator();lfo.frequency.value=.06;const lg=AC.createGain();lg.gain.value=170;lfo.connect(lg);lg.connect(f.frequency);lfo.start();
  decodeBuf(pendingAudio.laser||assetBuf('laser')).then(b=>laserBuf=b);
  for(const k of['gun','shotgun','gl','beam','melee','start','breath','spark'])decodeBuf(assetBuf('sfx_'+k)).then(b=>{SFXB[k]=b;});
  musicInit();
}
// Music: four looping tracks (start-menu ambience, world, city, fight) that crossfade by situation. They stream from audio
// elements routed through Web Audio, each with its own fader, so nothing big is decoded into memory. All of them are started and
// paused once during the first tap, which iPad Safari requires before a track can begin later on its own (a fight, a town).
// A track whose element won't play, or plays silence, falls back to a decoded buffer.
const TRACKS={menu:['mus_menu',1.0],world:['music',1.0],city:['mus_city',.26],fight:['mus_fight',.2]};
const TR={},MUS={cur:null,fightOn:false,calm:0};let musicBroken=false;
function trackMake(k){if(TR[k])return TR[k];const bytes=k==='world'&&pendingAudio.music||assetBuf(TRACKS[k][0]);if(!bytes)return null;
  const t={k,bytes,g:AC.createGain(),on:false,lvl:TRACKS[k][1]};t.g.gain.value=0;t.g.connect(musicGain);
  if(!musicBroken)try{const el=new Audio(URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'})));el.loop=true;el.preload='auto';AC.createMediaElementSource(el).connect(t.g);t.el=el;
    const p=el.play();if(p&&p.then)p.then(()=>{if(!t.on)el.pause();}).catch(()=>{t.el=null;});else if(!t.on)el.pause();}catch(e){t.el=null;}
  return TR[k]=t;}
function trackStart(t,restart){if(t.on)return;t.on=true;
  if(t.el){if(restart)try{t.el.currentTime=0;}catch(e){}const p=t.el.play();if(p&&p.catch)p.catch(()=>{t.el=null;t.on=false;trackStart(t,restart);});return;}
  const go=b=>{if(!t.on||t.src)return;const s=AC.createBufferSource();s.buffer=b;s.loop=true;s.connect(t.g);s.start(0,restart?0:(t.pos||0)%b.duration);t.src=s;t.t0=AC.currentTime-(restart?0:(t.pos||0));};
  if(t.buf)go(t.buf);else decodeBuf(t.bytes.slice(0)).then(b=>{if(b){t.buf=b;go(b);}});}
function trackStop(t){if(!t.on)return;t.on=false;if(t.el)t.el.pause();if(t.src){t.pos=AC.currentTime-(t.t0||0);try{t.src.stop();}catch(e){}t.src=null;}}
function musicInit(){musicGain.gain.value=0;for(const k in TRACKS)trackMake(k);applyMusic();
  // a few seconds in, make sure the streamed music is actually reaching the speakers; if not, switch every track to buffers
  const an=AC.createAnalyser();an.fftSize=256;musicGain.connect(an);
  setTimeout(()=>{const t=TR[MUS.cur];if(!t||!t.el||t.el.paused||t.el.currentTime<1)return;const d=new Uint8Array(an.fftSize);let live=false;for(let i=0;i<20&&!live;i++){an.getByteTimeDomainData(d);live=d.some(v=>Math.abs(v-128)>2);}
    if(!live){musicBroken=true;for(const k in TR){const x=TR[k];if(x.el){x.el.pause();x.el=null;}if(x.on){x.on=false;trackStart(x,false);}}}},5000);}
// mode: 'menu', 'world', 'city' or 'fight'. A fight holds for a few calm seconds after the last enemy stops chasing.
function musicTick(dt,mode){if(!AC||!musicGain)return;const M=MUS;
  if(mode==='fight'){M.calm=0;M.fightOn=true;}else if(M.fightOn){M.calm+=dt;if(M.calm>4)M.fightOn=false;}
  const want=M.fightOn?'fight':mode==='fight'?'world':mode;if(want===M.cur)return;const prev=M.cur;M.cur=want;const now=AC.currentTime;
  const t=TR[want]||trackMake(want);if(t){trackStart(t,want==='fight'||want==='city'&&prev!=='fight');t.g.gain.cancelScheduledValues(now);t.g.gain.setTargetAtTime(t.lvl,now,want==='fight'?.35:.9);}
  for(const k in TR){if(k===want)continue;const x=TR[k];x.g.gain.cancelScheduledValues(now);x.g.gain.setTargetAtTime(0,now,k==='fight'?1:.6);
    setTimeout(()=>{if(MUS.cur!==k)trackStop(x);},6000);}}
function applyMusic(){if(!musicGain)return;const t=AC.currentTime;musicGain.gain.cancelScheduledValues(t);musicGain.gain.setTargetAtTime(musicOn?.42:0,t,.7);ambGain.gain.setTargetAtTime(musicOn?.006:.03,t,.7);}
function setMuted(v){muted=v;if(master)master.gain.value=muted?0:.6;saveAudioPref();}
function setMusic(v){musicOn=v;applyMusic();saveAudioPref();}
function noise(dur,gain,freq,type='bandpass'){if(!AC||muted)return;const t=AC.currentTime;if(!NOISE){NOISE=AC.createBuffer(1,AC.sampleRate*.6,AC.sampleRate);const d=NOISE.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  const s=AC.createBufferSource();s.buffer=NOISE;const f=AC.createBiquadFilter();f.type=type;f.frequency.setValueAtTime(freq,t);f.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.25),t+dur);const g=AC.createGain();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0005,t+dur);s.connect(f);f.connect(g);g.connect(sfxGain);s.start(t);s.stop(t+dur+.02);}
function playLaser(rate,gain=.375){if(!laserBuf||!AC)return false;const s=AC.createBufferSource();s.buffer=laserBuf;s.playbackRate.value=rate*(.96+Math.random()*.08);const g=AC.createGain();g.gain.value=gain;s.connect(g);g.connect(sfxGain);s.start();return true;}
// weapon sounds by class; the uploaded laser sample is pitched per weapon
// recorded weapon sounds: one for sidearms and rifles (pitched apart), the shotgun, grenade launcher, melee swing and beam
const SFXB={};
function playSample(k,rate,gain){const b=SFXB[k];if(!b||!AC)return null;const s=AC.createBufferSource();s.buffer=b;s.playbackRate.value=rate*(.97+Math.random()*.06);const g=AC.createGain();g.gain.value=gain;s.connect(g);g.connect(sfxGain);s.start();return {s,g};}
// a spark burst somewhere in the world: quieter with distance, silent beyond about 16 m
function sparkSound(x,z,vol=.5){if(!AC||muted||!SFXB.spark)return;const d=Math.hypot(x-player.x,z-player.z),k=Math.max(0,1-d/16);if(k<.05)return;playSample('spark',.85+Math.random()*.3,vol*k*k);}
// the title sting when a game begins, and the helmet breathing that loops while you come to (until the look screen is done)
function startSting(){if(!AC||muted)return;if(SFXB.start){const s=AC.createBufferSource();s.buffer=SFXB.start;const g=AC.createGain();g.gain.value=.75;s.connect(g);g.connect(sfxGain);s.start();}}
let breathSrc=null,breathWant=false;
function breathing(on){breathWant=on;if(!AC)return;
  if(on&&!breathSrc){if(!SFXB.breath){setTimeout(()=>{if(breathWant&&!breathSrc)breathing(true);},400);return;}
    const s=AC.createBufferSource();s.buffer=SFXB.breath;s.loop=true;s.loopStart=.38;s.loopEnd=Math.min(SFXB.breath.duration,7.95);const g=AC.createGain();g.gain.setValueAtTime(0,AC.currentTime);g.gain.linearRampToValueAtTime(.55,AC.currentTime+1.2);
    s.connect(g);g.connect(sfxGain);s.start(AC.currentTime,.38);breathSrc={s,g};}
  else if(!on&&breathSrc){const b=breathSrc;breathSrc=null;b.g.gain.cancelScheduledValues(AC.currentTime);b.g.gain.setTargetAtTime(0,AC.currentTime,.5);setTimeout(()=>{try{b.s.stop();}catch(e){}},2500);}}
function weaponSound(cls,pitch=1){if(!AC||muted)return;
  if(cls==='sidearm'){if(!playSample('gun',1.08*pitch,.5)&&!playLaser(1.25*pitch,.32))sfx('pulse');}
  else if(cls==='rifle'){if(!playSample('gun',.94*pitch,.42)&&!playLaser(1.05*pitch,.26))sfx('pulse');}
  else if(cls==='scatter'){if(!playSample('shotgun',pitch,.6)){playLaser(.72*pitch,.34);noise(.28,.22,1400,'lowpass');}}
  else if(cls==='launcher'){if(!playSample('gl',pitch,.65)){noise(.5,.3,600,'lowpass');sfx('thump');}}
  else if(cls==='melee'){if(!playSample('melee',pitch,.7))noise(.18,.12,2400,'highpass');}
}
// the beam: its sample starts with the discharge, holds on its strongest stretch while the trigger is down, then rings out
function beamHum(on,pitch=1){if(!AC)return;
  if(SFXB.beam){if(on&&!beamOsc&&!muted){const v=playSample('beam',pitch,.5);if(v){v.s.loop=true;v.s.loopStart=.18;v.s.loopEnd=.62;beamOsc={smp:v};}}
    else if(!on&&beamOsc){const b=beamOsc;beamOsc=null;if(b.smp){b.smp.s.loop=false;b.smp.g.gain.setTargetAtTime(0,AC.currentTime+.5,.5);setTimeout(()=>{try{b.smp.s.stop();}catch(e){}},3200);}else{b.g.gain.setTargetAtTime(0,AC.currentTime,.03);setTimeout(()=>{try{b.o.stop();b.o2.stop();}catch(e){}},200);}}
    return;}
  if(on&&!beamOsc&&!muted){const o=AC.createOscillator(),o2=AC.createOscillator(),g=AC.createGain();o.type='sawtooth';o2.type='square';o.frequency.value=180*pitch;o2.frequency.value=362*pitch;g.gain.value=.035;o.connect(g);o2.connect(g);g.connect(sfxGain);o.start();o2.start();beamOsc={o,o2,g};}
  else if(!on&&beamOsc){const b=beamOsc;beamOsc=null;b.g.gain.setTargetAtTime(0,AC.currentTime,.03);setTimeout(()=>{try{b.o.stop();b.o2.stop();}catch(e){}},200);}}
function sfx(type,arg){if(!AC||muted)return;const t=AC.currentTime;const o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(sfxGain);let dur=.3;
  const env=(a,d)=>{g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0005,t+d);dur=d;};
  switch(type){
    case 'pulse':o.type='square';o.frequency.setValueAtTime(760,t);o.frequency.exponentialRampToValueAtTime(120,t+.2);env(.06,.22);break;
    case 'hit':o.type='sawtooth';o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(60,t+.12);env(.07,.14);break;
    case 'hurt':o.type='triangle';o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(70,t+.25);env(.16,.28);break;
    case 'pick':o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.setValueAtTime(1320,t+.07);env(.07,.22);break;
    case 'loot':o.type='triangle';o.frequency.setValueAtTime(660,t);o.frequency.setValueAtTime(990,t+.06);o.frequency.setValueAtTime(1320,t+.12);env(.08,.3);break;
    case 'rare':o.type='triangle';[784,988,1175,1568].forEach((f,i)=>o.frequency.setValueAtTime(f,t+i*.07));env(.1,.5);break;
    case 'quest':o.type='triangle';[523,659,784,1046].forEach((f,i)=>o.frequency.setValueAtTime(f,t+i*.09));env(.12,.6);break;
    case 'level':o.type='square';[392,523,659,784,1046].forEach((f,i)=>o.frequency.setValueAtTime(f,t+i*.08));env(.06,.7);break;
    case 'click':o.type='sine';o.frequency.setValueAtTime(600,t);env(.03,.06);break;
    case 'scan':o.type='sine';o.frequency.setValueAtTime(300,t);o.frequency.linearRampToValueAtTime(900,t+1.3);env(.05,1.4);break;
    case 'slam':o.type='sawtooth';o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(30,t+.5);env(.2,.55);noise(.5,.2,500,'lowpass');break;
    case 'zap':o.type='sawtooth';o.frequency.setValueAtTime(1900,t);o.frequency.exponentialRampToValueAtTime(260,t+.16);env(.04,.18);break;
    case 'craft':o.type='triangle';[660,880,1320].forEach((f,i)=>o.frequency.setValueAtTime(f,t+i*.06));env(.08,.32);break;
    case 'open':o.type='sine';o.frequency.setValueAtTime(220,t);o.frequency.linearRampToValueAtTime(660,t+.3);env(.1,.42);break;
    case 'door':o.type='sine';o.frequency.setValueAtTime(140,t);o.frequency.linearRampToValueAtTime(90,t+.35);env(.05,.4);noise(.35,.05,900,'lowpass');break;
    case 'melt':o.type='sawtooth';o.frequency.setValueAtTime(300,t);o.frequency.linearRampToValueAtTime(80,t+1.2);env(.04,1.3);noise(1.2,.08,1800);break;
    case 'flare':o.type='sawtooth';o.frequency.setValueAtTime(160,t);o.frequency.linearRampToValueAtTime(90,t+.5);env(.06,.6);break;
    case 'jump':o.type='sine';o.frequency.setValueAtTime(300,t);o.frequency.exponentialRampToValueAtTime(640,t+.12);env(.05,.14);break;
    case 'land':o.type='triangle';o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(50,t+.1);env(.08,.12);break;
    case 'thump':o.type='sine';o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(40,t+.25);env(.22,.3);break;
    case 'boom':o.type='sawtooth';o.frequency.setValueAtTime(80,t);o.frequency.exponentialRampToValueAtTime(25,t+.7);env(.25,.8);noise(.9,.35,700,'lowpass');break;
    case 'shield':o.type='sine';o.frequency.setValueAtTime(420,t);o.frequency.linearRampToValueAtTime(840,t+.25);env(.06,.3);break;
    case 'warp':o.type='sawtooth';o.frequency.setValueAtTime(60,t);o.frequency.exponentialRampToValueAtTime(900,t+1.6);env(.08,1.8);noise(1.8,.12,300);break;
    case 'deny':o.type='square';o.frequency.setValueAtTime(180,t);o.frequency.setValueAtTime(140,t+.08);env(.05,.18);break;
    default:env(.01,.05);}
  o.start(t);o.stop(t+dur+.05);}

// ===== 07_post.js =====
/* ================= POST-PROCESSING: bloom, so emissive panels, lamps, glows and the sun bleed light ================= */
// The scene renders into an HDR buffer (half float where the device allows), then bright pixels are blurred back over it.
const POST={on:true,composer:null,bloom:null,hdr:false};
try{const p=JSON.parse(localStorage.getItem('tidelock-gfx')||'{}');if(p.bloom===false)POST.on=false;}catch(e){}
function initPost(){if(!THREE.EffectComposer||!THREE.UnrealBloomPass)return;try{
  const ex=n=>renderer.extensions.has(n),gl2=renderer.capabilities.isWebGL2;
  const hdr=gl2?(ex('EXT_color_buffer_float')||ex('EXT_color_buffer_half_float')):(ex('OES_texture_half_float')&&ex('EXT_color_buffer_half_float'));
  const w=Math.round(innerWidth*PIXEL_RATIO),h=Math.round(innerHeight*PIXEL_RATIO),o={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,type:hdr?THREE.HalfFloatType:THREE.UnsignedByteType};
  // multisampled on WebGL2 so edges stay smooth (the canvas's own antialiasing doesn't apply to offscreen buffers)
  const rt=gl2&&THREE.WebGLMultisampleRenderTarget?new THREE.WebGLMultisampleRenderTarget(w,h,o):new THREE.WebGLRenderTarget(w,h,o);
  const c=new THREE.EffectComposer(renderer,rt);c.addPass(new THREE.RenderPass(scene,camera));
  const b=new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),1.25,.6,hdr?.88:.8);c.addPass(b);
  b.setSize(innerWidth,innerHeight);// bloom blurs from a lower resolution: the glow is soft anyway, and it costs a fraction
  POST.composer=c;POST.bloom=b;POST.hdr=hdr;}catch(e){console.error('bloom unavailable',e);POST.composer=null;}}
// Light sources only bloom if they are brighter than lit surfaces, so while bloom is on their emission is pushed above 1:
// emissive panels and lamps, glow halos, neon and screens. Everything else keeps its colour, and turning glow off restores them.
const GLOW_K={emissive:1.55,halo:1.3,neon:1.5,screen:1.25};
function glowKind(m){if(!m||m.userData.noGlow)return null;if(m.userData.glow)return m.userData.glow;
  if(m.isSpriteMaterial)return m.blending===THREE.AdditiveBlending?'halo':null;
  if(m.isMeshBasicMaterial)return m.blending===THREE.AdditiveBlending?'halo':(MAT.screens&&MAT.screens.includes(m))?'screen':null;
  if(m.isMeshStandardMaterial&&m.emissive&&m.emissiveIntensity>=.5&&(m.emissive.r+m.emissive.g+m.emissive.b)>.55)return 'emissive';return null;}
function boostMat(m,on){const k=glowKind(m);if(!k)return;const u=m.userData;
  if(on&&!u._pb){u._pb=k==='emissive'?{ei:m.emissiveIntensity}:{c:m.color.clone()};if(k==='emissive')m.emissiveIntensity*=GLOW_K.emissive;else m.color.multiplyScalar(GLOW_K[k]);}
  else if(!on&&u._pb){if(u._pb.ei!==undefined)m.emissiveIntensity=u._pb.ei;else m.color.copy(u._pb.c);delete u._pb;}}
function boostAll(on){const seen=new Set(),f=m=>{if(!m||seen.has(m))return;seen.add(m);boostMat(m,on);};
  for(const k in MAT){const v=MAT[k];if(Array.isArray(v))v.forEach(f);else if(v&&v.isMaterial)f(v);}
  if(typeof glowMats!=='undefined')for(const k in glowMats)f(glowMats[k]);
  scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(f);});}
// called once a zone is built, and when people or enemies with lights are added
function postScan(){if(POST.on&&POST.composer)boostAll(true);}
function setBloom(v){POST.on=v;try{const p=JSON.parse(localStorage.getItem('tidelock-gfx')||'{}');p.bloom=v;localStorage.setItem('tidelock-gfx',JSON.stringify(p));}catch(e){}boostAll(v&&!!POST.composer);}
// bright daylight zones need a higher threshold or the whole sky blooms
function postZone(def){if(!POST.bloom)return;const o=def.bloom||{};POST.bloom.threshold=o.threshold||(POST.hdr?.88:.8);POST.bloom.strength=o.strength||1.25;}
function renderFrame(dt){if(POST.on&&POST.composer)POST.composer.render(dt);else renderer.render(scene,camera);}
function resizePost(){const r=renderer.getPixelRatio();if(POST.composer)POST.composer.setSize(Math.round(innerWidth*r),Math.round(innerHeight*r));if(POST.bloom)POST.bloom.setSize(innerWidth*r/PIXEL_RATIO,innerHeight*r/PIXEL_RATIO);}
// Auto resolution: when frames take too long the render resolution steps down a little (to at most 70% of full) and comes back
// up when there is headroom. Text and the HUD are HTML, so they stay sharp. It can be switched off in Options.
const DRS={on:true,scale:1,acc:0,n:0,cool:0};try{const p=JSON.parse(localStorage.getItem('tidelock-gfx')||'{}');if(p.drs===false)DRS.on=false;}catch(e){}
function drsApply(){const r=Math.max(.75,PIXEL_RATIO*DRS.scale);if(Math.abs(renderer.getPixelRatio()-r)<.01)return;renderer.setPixelRatio(r);renderer.setSize(innerWidth,innerHeight);resizePost();}
function drsTick(raw){if(raw<=0||raw>.5)return;DRS.acc+=raw;DRS.n++;if(DRS.acc<1.5)return;const ms=DRS.acc/DRS.n*1000;DRS.acc=0;DRS.n=0;if(DRS.cool>0){DRS.cool--;return;}
  if(!DRS.on||UI.title){if(DRS.scale!==1){DRS.scale=1;drsApply();}return;}
  if(ms>24&&DRS.scale>.7){DRS.scale=Math.max(.7,DRS.scale-.1);drsApply();DRS.cool=1;}else if(ms<15&&DRS.scale<1){DRS.scale=Math.min(1,DRS.scale+.05);drsApply();DRS.cool=2;}}
function setDrs(v){DRS.on=v;try{const p=JSON.parse(localStorage.getItem('tidelock-gfx')||'{}');p.drs=v;localStorage.setItem('tidelock-gfx',JSON.stringify(p));}catch(e){}if(!v){DRS.scale=1;drsApply();}}
initPost();

// ===== 08_avatar.js =====
/* ================= CHARACTERS: skinned bodies, attachments, animation ================= */
// Attach a group to a bone so the group is authored in model space (x right, y up, z forward) relative to the bone origin at bind pose.
const _bq=new THREE.Quaternion(),_abs=new THREE.Vector3(),_abp=new THREE.Vector3();
function bindToBone(root,bone,group,offset){
  root.updateMatrixWorld(true);bone.getWorldQuaternion(_bq);bone.getWorldScale(_abs);bone.getWorldPosition(_abp);
  const rs=root.getWorldScale(new THREE.Vector3()),inv=_bq.clone().invert();
  group.quaternion.copy(inv);group.scale.set(rs.x/_abs.x,rs.y/_abs.y,rs.z/_abs.z);
  // offset is in model units relative to the bone origin
  const off=offset.clone().multiply(rs).applyQuaternion(inv).divide(_abs);group.position.copy(off);bone.add(group);return group;}
function boneOrigin(root,bone){root.updateMatrixWorld(true);const p=new THREE.Vector3();bone.getWorldPosition(p);root.worldToLocal(p);return p;}

// Put a skinned model's bones in their bind pose (the pose the mesh was modelled in), read from the skin's inverse bind
// matrices. Root bones keep their placement, so this works whatever transform the armature sits under. Returns an undo.
const _bpP=new THREE.Vector3(),_bpQ=new THREE.Quaternion(),_bpS=new THREE.Vector3();
function bindPose(model){const W=new Map();model.traverse(x=>{if(!x.isSkinnedMesh)return;const sk=x.skeleton;sk.bones.forEach((b,i)=>{if(!W.has(b)&&sk.boneInverses[i])W.set(b,sk.boneInverses[i].clone().invert());});});
  const saved=[];for(const [b,w] of W){if(!b.parent||!W.has(b.parent))continue;saved.push([b,b.position.clone(),b.quaternion.clone()]);
    W.get(b.parent).clone().invert().multiply(w).decompose(_bpP,_bpQ,_bpS);b.position.copy(_bpP);b.quaternion.copy(_bpQ);}
  model.updateMatrixWorld(true);return ()=>{for(const [b,p,q] of saved){b.position.copy(p);b.quaternion.copy(q);}model.updateMatrixWorld(true);};}

/* ---------- animation controller ---------- */
// 'q' is the Quaternius rig shared by the player's spacesuit and every townsperson; 'robot' is RobotExpressive.
class Animator{
  constructor(model,set){this.m=model;this.mixer=new THREE.AnimationMixer(model);this.B=boneMap(model);this.a={};this.set=set;this.dead=false;
    const add=(k,clip)=>{if(!clip)return;const a=this.mixer.clipAction(clip);a.setLoop(THREE.LoopRepeat,Infinity);a.enabled=true;a.setEffectiveWeight(0);a.play();this.a[k]=a;};
    const once=(k,clip,clamp)=>{if(!clip)return;const a=this.mixer.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=!!clamp;this.a[k]=a;};
    if(set==='robot'){const R=CLIPS.robot||{};add('idle',R.Idle);add('walk',R.Walking);add('run',R.Running);for(const k of ['Wave','Yes','No','ThumbsUp','Punch','Sitting','Dance','Jump'])once(k.toLowerCase(),R[k]);once('death',R.Death,true);
      this.walkRef=1.6;this.runRef=4.5;}
    else{const Q=CLIPS.q||{};add('idle',Q.Idle);add('walk',Q.Walk);add('run',Q.Run);add('idleGun',Q.Idle_Gun);add('aim',Q.Idle_Gun_Pointing);add('aimRun',Q.Run_Shoot);
      const O={wave:'Wave',interact:'Interact',shoot:'Gun_Shoot',punch:'Punch_Right',slash:'Sword_Slash',hit:'HitRecieve',roll:'Roll',neutral:'Idle_Neutral',kick:'Kick_Right'};for(const k in O)once(k,Q[O[k]]);once('death',Q.Death,true);
      this.walkRef=1.5;this.runRef=4.6;}
    // the head's rest orientation in the character's frame, used to keep it facing forward while moving
    if(set!=='robot'&&this.B.Head){model.updateMatrixWorld(true);const mi=model.getWorldQuaternion(new THREE.Quaternion()).invert();
      if(!this.B.Body&&this.B.UpperLegL&&this.B.UpperLegL.parent.isBone)this.B.Body=this.B.UpperLegL.parent;
      this.rest={};for(const k of['Body','Hips','Torso','Chest','Neck','Head'])if(this.B[k])this.rest[k]=mi.clone().multiply(this.B[k].getWorldQuaternion(new THREE.Quaternion()));this.headRest=this.rest.Head;}
    this.one=null;this.touched=new Map();this.mixer.update(Math.random()*2);}
  oneShot(k){const a=this.a[k];if(!a||this.dead)return false;if(this.one&&this.one!==a)this.one.fadeOut(.15);a.reset();a.setEffectiveWeight(1);a.fadeIn(.18);a.play();this.one=a;this.oneT=a.getClip().duration/Math.max(.01,a.timeScale||1);return true;}
  die(){const a=this.a.death;this.dead=true;this.one=null;if(!a)return;for(const k in this.a)if(this.a[k]!==a){this.a[k].stopFading();this.a[k].setEffectiveWeight(0);}a.reset();a.setEffectiveWeight(1);a.play();}
  revive(){this.dead=false;if(this.a.death)this.a.death.stop();for(const k of ['idle','walk','run','idleGun','aim','aimRun'])if(this.a[k]&&!this.a[k].isRunning())this.a[k].play();}
  // undo last frame's procedural turns first: bones the clips don't animate would otherwise keep rotating
  restore(){for(const [b,q] of this.touched)b.quaternion.copy(q);this.touched.clear();}
  update(dt,speed,frozen,o){this.restore();const A=this.a;if(this.dead){this.mixer.update(frozen?0:dt);return;}
    const sp=Math.max(0,speed),w=sp<.15?0:clamp(sp/1.6,0,1),r=clamp((sp-2.6)/2.2,0,1),aim=o&&o.aim||0,gun=o&&o.gun&&A.idleGun;
    const base=1-aim,idleW=(1-w)*base,walkW=w*(1-r)*base,runW=w*r*base;
    if(A.idle)A.idle.setEffectiveWeight(gun?0:idleW);if(A.idleGun)A.idleGun.setEffectiveWeight(gun?idleW:0);
    if(A.walk){A.walk.setEffectiveWeight(walkW);A.walk.timeScale=clamp(sp/this.walkRef,.5,1.8);}if(A.run){A.run.setEffectiveWeight(runW);A.run.timeScale=clamp(sp/this.runRef,.7,1.6);}
    if(A.aim)A.aim.setEffectiveWeight(aim*(1-w));if(A.aimRun){A.aimRun.setEffectiveWeight(aim*w);A.aimRun.timeScale=clamp(sp/this.runRef,.6,1.5);}
    if(this.one){this.oneT-=dt;if(this.oneT<=.2||(sp>.6&&this.one!==A.shoot&&this.one!==A.slash&&this.one!==A.punch&&this.one!==A.hit)){const a=this.one;a.fadeOut(.2);setTimeout(()=>{if(this.one!==a)a.stop();},260);this.one=null;}
      else{const k=.25;for(const x of ['idle','idleGun','aim'])if(A[x])A[x].setEffectiveWeight(A[x].getEffectiveWeight()*k);}}
    this.mixer.update(frozen?0:dt);
    // the walk and run clips swing the head to one side each stride; take that turn out (in proportion to speed) so the eyes stay on the path
    if(this.headRest&&w>0)steadyUpper(this,w,frozen?0:dt);}
}
const _sh1=new THREE.Quaternion(),_sh2=new THREE.Quaternion(),_sh3=new THREE.Quaternion(),_she=new THREE.Euler();
// a bone's yaw (about the body's up) and roll relative to its rest pose, in the character's frame
function boneYR(an,k){const b=an.B[k],R=an.rest[k];if(!b||!R)return null;const mi=an.m.getWorldQuaternion(_sh1).invert(),q=b.getWorldQuaternion(_sh2).premultiply(mi);
  _she.setFromQuaternion(_sh3.copy(R).invert().premultiply(q),'YXZ');return {y:_she.y,z:_she.z};}
// set a bone's yaw and roll (relative to rest, in the character's frame) to new values, keeping its nod
function setYR(an,k,f){const b=an.B[k],R=an.rest[k];if(!b||!R)return;const mi=an.m.getWorldQuaternion(_sh1).invert(),q=b.getWorldQuaternion(_sh2).premultiply(mi);
  const d=_sh3.copy(R).invert().premultiply(q);_she.setFromQuaternion(d,'YXZ');const r=f(_she.y,_she.z);_she.y=r[0];_she.z=r[1];d.setFromEuler(_she);q.copy(d).multiply(R);
  const pq=b.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(mi);b.quaternion.copy(pq.invert().multiply(q));b.updateMatrixWorld(true);}
// The legs hang from the Body bone, the spine from Hips. The walk and run clips square the legs up but leave Hips turned about
// 27 degrees away from them, which a body whose thighs hang from its pelvis shows as a hip and torso turned off the path.
// Turn Hips to face where the legs face, give the spine its own original facing back with a lighter swing, and keep the head level.
function steadyUpper(an,w,dt){const al=1-Math.exp(-dt*4);an.m.updateMatrixWorld(true);const t0=boneYR(an,'Torso'),c0=boneYR(an,'Chest'),b0=boneYR(an,'Body');
  setYR(an,'Hips',(y,z)=>[y+((b0?b0.y:0)-y)*w,z]);
  // the clips' spine also leans to one side on average: track that average and swing evenly around straight ahead instead
  if(t0){an.tMean=an.tMean===undefined?t0.y:an.tMean+(t0.y-an.tMean)*al;setYR(an,'Torso',()=>[t0.y-an.tMean*w-(t0.y-an.tMean)*.6*w,t0.z*(1-.4*w)]);}
  if(c0){an.cMean=an.cMean===undefined?c0.y:an.cMean+(c0.y-an.cMean)*al;setYR(an,'Chest',()=>[c0.y-an.cMean*w-(c0.y-an.cMean)*.6*w,c0.z*(1-.4*w)]);}
  setYR(an,'Head',(y,z)=>[y*(1-w),z*(1-w)]);}
const _qa=new THREE.Quaternion(),_e2=new THREE.Euler();
function rot(b,x,y,z,w=1,anim){if(!b||w<=0)return;if(anim&&!anim.touched.has(b))anim.touched.set(b,b.quaternion.clone());_e2.set(x*w,y*w,z*w);b.quaternion.multiply(_qa.setFromEuler(_e2));}
// small procedural touches on top of the clips: head turns and idle gestures
const ACT_CLIP={wrist:'neutral',gun:'neutral',stretch:'neutral',talk:'interact',interact:'interact',wave:'wave',neutral:'neutral'};
function poseLayers(B,P,anim){const A=P.act;
  if(anim&&A){if(A.kind&&A.kind!==A.fired){const k=ACT_CLIP[A.kind];if(k&&anim.a[k])anim.oneShot(k);A.fired=A.kind;}if(!A.kind)A.fired=null;}
  let yaw=(P.look||0)*.75;if(A&&A.w>0&&A.kind==='look')yaw+=Math.sin(A.t*1.3)*.7*A.w;
  yaw=clamp(yaw,-1.1,1.1);if(yaw&&anim){rot(B.Head,0,yaw,0,1,anim);rot(B.Neck,0,yaw*.25,0,1,anim);}}
function tickIdle(a,dt,busy,kinds){
  if(busy){a.w=Math.max(0,a.w-dt*6);a.idle=0;if(a.w===0)a.kind=null;return;}
  a.idle+=dt;a.cd-=dt;
  if(!a.kind&&a.idle>4&&a.cd<=0){a.kind=kinds[Math.floor(Math.random()*kinds.length)];a.t=0;a.dur=3+Math.random()*1.8;}
  if(a.kind){a.t+=dt;a.w=smooth(0,.55,a.t)*(1-smooth(a.dur-.55,a.dur,a.t));if(a.t>=a.dur){a.kind=null;a.w=0;a.cd=4+Math.random()*5;}}
}
const newAct=()=>({kind:null,t:0,dur:0,w:0,cd:2+Math.random()*4,idle:0});

/* ---------- model parts: clone just the pieces a character needs ---------- */
const lin=hex=>new THREE.Color(hex).convertSRGBToLinear();
function cloneParts(id,names){const M=MODELS[id];if(!M)return null;const arm=M.scene.children.find(c=>c.name==='CharacterArmature')||M.scene.children[0];
  const want=new Set(names),tmp=new THREE.Object3D();tmp.children=arm.children.filter(c=>c.isBone||c.name==='Root'||want.has(c.name));
  const o=THREE.SkeletonUtils.clone(tmp);o.name='CharacterArmature';
  o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;c.frustumCulled=false;c.material=c.material.clone();}});return o;}
// move a part cloned from another file onto this character's skeleton (the rigs share bone names)
function graft(model,part){const B={};model.traverse(c=>{if(c.isBone)B[c.name]=c;});const meshes=[];part.traverse(c=>{if(c.isSkinnedMesh)meshes.push(c);});
  for(const m of meshes){const bones=m.skeleton.bones.map(b=>B[b.name]||b);m.bind(new THREE.Skeleton(bones,m.skeleton.boneInverses),m.bindMatrix);}
  for(const c of [...part.children])if(!c.isBone&&c.name!=='Root')model.add(c);}
const SKIP_TINT=/skin|eye|hair|black|white|grey/i;

/* ---------- player look options ---------- */
const LOOK={
  outfit:[['spacesuit','Spacesuit'],['heavy','Heavy plating'],['scout','Scout harness'],['engineer','Engineer rig'],['pilot','Flight harness'],['explorer','Explorer coat'],['ranger','Ranger poncho','ranger'],['vanguard','Vanguard plate','vanguard']],
  body:[['suit','Spacesuit (customizable)'],['prota','Sci-fi operative'],['soldier','Sci-fi soldier'],['npc','Special model']],
  helmet:[['suit','Spacesuit helmet'],['none','No helmet (show face)'],['crest','Ancient crest','crest'],['halo','Choir halo','halo']],
  face:[['m1','Face 1'],['m2','Face 2'],['m3','Face 3'],['m4','Face 4'],['m5','Face 5'],['m6','Face 6'],['f1','Face 7'],['f2','Face 8'],['f3','Face 9'],['f4','Face 10'],['f5','Face 11'],['f6','Face 12']],
  hairstyle:[['auto','Match face'],['crop','Short crop'],['swept','Swept back'],['tousled','Tousled'],['wild','Shaggy'],['surfer','Surfer + beard'],['mohawk','Mohawk'],['long','Long'],['bob','Bob'],['ponytail','Ponytail'],['wavy','Wavy'],['undercut','Undercut'],['bun','Up-do'],['punk','Punk streak'],['bald','Shaved']],
  pack:[['none','No back item'],['tanks','Twin tanks'],['compact','Compact'],['rig','Comms rig'],['cargo','Cargo frame'],['jets','Thruster pack']],
  shoulders:[['outfit','Match outfit'],['light','Light'],['heavy','Heavy'],['none','None']],
  pattern:[['circuit','Circuit plating'],['hex','Hex armor'],['hazard','Hazard stripes'],['clean','Clean']],
  emblem:[['none','None'],['halcyon','Halcyon'],['meridian','Meridian'],['star','Star'],['choir','Choir sigil','choir'],['wing','Wing','wing']],
  finish:[['matte','Matte'],['satin','Satin'],['chrome','Polished']],
  build:[['slim','Slim',.94,1],['standard','Standard',1,1],['broad','Broad',1.08,1.02]],
  height:[['short','Short',.95],['average','Average',1],['tall','Tall',1.05]],
};
const HEADS={
  m1:['men','Casual_2_Head'],m2:['men','Casual_Hoodie_Head'],m3:['men','Adventurer_Head'],m4:['men','Suit_Head'],m5:['men','Punk_Head'],m6:['men','Beach_Head'],
  f1:['women','Casual_Head'],f2:['women','Formal_Head'],f3:['women','Adventurer_Head'],f4:['women','Suit_Head'],f5:['women','Soldier_Head'],f6:['women','SciFi_Head']};
// hairstyles are the hair pieces of other heads, moved onto any face: [file, head, hair materials]
const HAIR_OF={m1:'Hair.001',m2:'Hair.001',m3:'Hair.001',m4:'Hair.001',m5:/^Red/,m6:'Hair.001',f1:/^Hair_/,f2:/^Red$/,f3:/^Hair_/,f4:/^Hair_/,f5:/^Hair_/,f6:/^Hair_/};
const HAIRS_STY={crop:['men','Casual_2_Head','Hair.001'],swept:['men','Suit_Head','Hair.001'],tousled:['men','Casual_Hoodie_Head','Hair.001'],wild:['men','Adventurer_Head','Hair.001'],surfer:['men','Beach_Head','Hair.001'],mohawk:['men','Punk_Head',/^Red/],
  long:['women','Casual_Head',/^Hair_/],bob:['women','Suit_Head',/^Hair_/],ponytail:['women','Soldier_Head',/^Hair_/],wavy:['women','Adventurer_Head',/^Hair_/],undercut:['women','SciFi_Head',/^Hair_/],bun:['women','Formal_Head',/^Red$/],punk:['women','Punk_Head',/^(Hair_|Pink)/]};
const isHair=(n,rule)=>rule instanceof RegExp?rule.test(n):n===rule;
const PAL=[0x5a7472,0x3e5a7a,0x2f4f8f,0x5a7fb0,0x2f6a6a,0x3a7a5a,0x5a6a3e,0x8a8a4a,0xc9a06a,0x8a6a3a,0x8a4a32,0xa0402a,0x7a2a3a,0x6a2a5a,0x4a3a6a,0x6a5a9a,0xe8e4ee,0xa8a4b4,0x6a6874,0x34323e,0x16151c];
const GLOWS=[0xff8a3a,0x6ff2d6,0x4ae0ff,0x8fd8ff,0x5a8cff,0xa98cff,0xd36cf0,0xff5ad8,0xff5a8a,0xff5a5a,0xffc35a,0xfff07a,0xa8ff5a,0x5aff8a,0xffffff];
const SKINS=[0xf2d0b8,0xe0b090,0xc48a64,0x9a6440,0x6e452a,0x4a2e1c];
const HAIRS=[0x2a1a10,0x5a3a1e,0x8a5a2a,0xd8b060,0xb0402a,0xe8e4e0,0x3a3a44,0x6a2a8a,0x2a6a8a];
const defaultLook=()=>({name:'',suit:0x5a7472,armor:0xe8e2dc,trim:0x3a4a4c,accent:0xff8a3a,visor:null,body:'suit',outfit:'spacesuit',helmet:'suit',face:'m1',hairstyle:'auto',pattern:'circuit',skin:null,hair:null,pack:'tanks',shoulders:'outfit',emblem:'none',finish:'satin',build:'standard',height:'average'});
function lookColors(L){const c=new THREE.Color(L.suit);return {suit:L.suit,armor:L.armor??c.clone().lerp(new THREE.Color(0xffffff),.32).getHex(),trim:L.trim??c.clone().multiplyScalar(.42).getHex(),accent:L.accent,visor:L.visor??L.accent};}
const EMBLEM_TEX={};

function emblemTex(k,color){const key=k+color;if(EMBLEM_TEX[key])return EMBLEM_TEX[key];const c=mkCanvas(128),g=c.getContext('2d');g.translate(64,64);g.strokeStyle=g.fillStyle=hex6(color);g.lineWidth=7;g.lineJoin='round';
  if(k==='halcyon'){g.beginPath();g.arc(0,8,34,Math.PI,0);g.stroke();for(let i=0;i<5;i++){const a=Math.PI+i*Math.PI/4;g.beginPath();g.moveTo(Math.cos(a)*44,8+Math.sin(a)*44);g.lineTo(Math.cos(a)*56,8+Math.sin(a)*56);g.stroke();}g.fillRect(-46,14,92,7);}
  else if(k==='meridian'){g.beginPath();g.arc(0,0,40,0,7);g.stroke();g.beginPath();g.moveTo(-40,0);g.lineTo(40,0);g.moveTo(0,-40);g.lineTo(0,40);g.stroke();}
  else if(k==='star'){g.beginPath();for(let i=0;i<10;i++){const r=i%2?20:50,a=i/10*Math.PI*2-Math.PI/2;i?g.lineTo(Math.cos(a)*r,Math.sin(a)*r):g.moveTo(Math.cos(a)*r,Math.sin(a)*r);}g.closePath();g.fill();}
  else if(k==='choir'){g.beginPath();g.moveTo(0,-50);g.lineTo(32,0);g.lineTo(0,50);g.lineTo(-32,0);g.closePath();g.stroke();g.beginPath();g.arc(0,0,12,0,7);g.fill();}
  else if(k==='wing'){for(const s of[-1,1]){g.beginPath();g.moveTo(0,10);g.quadraticCurveTo(s*40,-30,s*58,-6);g.quadraticCurveTo(s*30,0,s*36,20);g.quadraticCurveTo(s*14,10,0,24);g.closePath();g.fill();}}
  return EMBLEM_TEX[key]=new THREE.CanvasTexture(c);}


/* ---------- alternate bodies on other skeletons ---------- */
// The game animates the Quaternius rig. A model on another rig rides along: each frame its bones copy the rig's pose,
// as rotations relative to each skeleton's rest pose, so every existing clip, aim layer and one-shot drives it too.
const PROTA_MAP={Hips:'pelvis',Abdomen:'spine_01',Torso:'spine_02',Chest:'spine_03',Neck:'neck_01',Head:'head',
  UpperLegL:'thigh_l',LowerLegL:'calf_l',FootL:'foot_l',UpperLegR:'thigh_r',LowerLegR:'calf_r',FootR:'foot_r'};
for(const s of['L','R']){const t=s.toLowerCase();Object.assign(PROTA_MAP,{['Shoulder'+s]:'clavicle_'+t,['UpperArm'+s]:'upperarm_'+t,['LowerArm'+s]:'lowerarm_'+t,['Wrist'+s]:'hand_'+t});
  for(const [q,u] of[['Index','index'],['Middle','middle'],['Ring','ring'],['Pinky','pinky'],['Thumb','thumb']])for(let i=1;i<=3;i++)PROTA_MAP[q+i+s]=u+'_0'+i+'_'+t;}
// the bone each one points toward, used to line up the two rest poses (T-pose against A-pose and so on)
const RIG_CHILD={Hips:'Abdomen',Abdomen:'Torso',Torso:'Chest',Chest:'Neck',Neck:'Head',UpperLegL:'LowerLegL',LowerLegL:'FootL',UpperLegR:'LowerLegR',LowerLegR:'FootR'};
for(const s of['L','R']){Object.assign(RIG_CHILD,{['Shoulder'+s]:'UpperArm'+s,['UpperArm'+s]:'LowerArm'+s,['LowerArm'+s]:'Wrist'+s,['Wrist'+s]:'Middle1'+s});
  for(const q of['Index','Middle','Ring','Pinky','Thumb'])for(let i=1;i<3;i++)RIG_CHILD[q+i+s]=q+(i+1)+s;}
// Mixamo skeletons (bone names arrive as mixamorigHips and so on)
const MIXAMO_MAP={Hips:'Hips',Abdomen:'Spine',Torso:'Spine1',Chest:'Spine2',Neck:'Neck',Head:'Head',UpperLegL:'LeftUpLeg',LowerLegL:'LeftLeg',FootL:'LeftFoot',UpperLegR:'RightUpLeg',LowerLegR:'RightLeg',FootR:'RightFoot',
  ShoulderL:'LeftShoulder',UpperArmL:'LeftArm',LowerArmL:'LeftForeArm',WristL:'LeftHand',ShoulderR:'RightShoulder',UpperArmR:'RightArm',LowerArmR:'RightForeArm',WristR:'RightHand'};
for(const k in MIXAMO_MAP)MIXAMO_MAP[k]='mixamorig'+MIXAMO_MAP[k];
// Character Creator skeletons (bone names like CC_Base_L_Upperarm)
const CC_MAP={Hips:'Hip',Abdomen:'Waist',Torso:'Spine01',Chest:'Spine02',Neck:'NeckTwist01',Head:'Head',UpperLegL:'L_Thigh',LowerLegL:'L_Calf',FootL:'L_Foot',UpperLegR:'R_Thigh',LowerLegR:'R_Calf',FootR:'R_Foot'};
for(const s of['L','R']){Object.assign(CC_MAP,{['Shoulder'+s]:s+'_Clavicle',['UpperArm'+s]:s+'_Upperarm',['LowerArm'+s]:s+'_Forearm',['Wrist'+s]:s+'_Hand'});
  for(const [q,u] of[['Index','Index'],['Middle','Mid'],['Ring','Ring'],['Pinky','Pinky'],['Thumb','Thumb']])for(let i=1;i<=3;i++)CC_MAP[q+i+s]=s+'_'+u+i;}
for(const k in CC_MAP)CC_MAP[k]='CC_Base_'+CC_MAP[k];
// Ready Player Me skeletons (Mixamo names without the prefix, fingers included)
const RPM_MAP={};for(const k in MIXAMO_MAP)RPM_MAP[k]=MIXAMO_MAP[k].replace('mixamorig','');
for(const [s,S] of[['L','Left'],['R','Right']])for(const [q,u] of[['Index','Index'],['Middle','Middle'],['Ring','Ring'],['Pinky','Pinky'],['Thumb','Thumb']])for(let i=1;i<=3;i++)RPM_MAP[q+i+s]=S+'Hand'+u+i;
// the "Robot" NPC: no neck or head, so it is measured from the chest
const ROBOT3_MAP={Hips:'hips',Abdomen:'spine',Chest:'chest',UpperLegL:'L_leg',LowerLegL:'L_knee',FootL:'L_ankle',UpperLegR:'R_leg',LowerLegR:'R_knee',FootR:'R_ankle',
  ShoulderL:'L_shoulder',UpperArmL:'L_arm',LowerArmL:'L_elbow',WristL:'L_wrist',ShoulderR:'R_shoulder',UpperArmR:'R_arm',LowerArmR:'R_elbow',WristR:'R_wrist'};
let PROTA_ENV=null;
// a soft twilight environment so the model's metal reads (without one, metal renders black)
function protaEnv(){if(PROTA_ENV)return PROTA_ENV;const c=mkCanvas(256),g=c.getContext('2d');c.height=128;const gr=g.createLinearGradient(0,0,0,128);
  gr.addColorStop(0,'#2a2848');gr.addColorStop(.4,'#6a5a88');gr.addColorStop(.5,'#ffc09a');gr.addColorStop(.58,'#7a6070');gr.addColorStop(1,'#2c2a32');g.fillStyle=gr;g.fillRect(0,0,256,128);
  const t=new THREE.CanvasTexture(c);t.mapping=THREE.EquirectangularReflectionMapping;t.encoding=THREE.sRGBEncoding;const pm=new THREE.PMREMGenerator(renderer);PROTA_ENV=pm.fromEquirectangular(t).texture;pm.dispose();t.dispose();return PROTA_ENV;}
function buildRiderBody(root,model,o){const M=MODELS[o.id],map=o.map;if(!M)return null;const body=THREE.SkeletonUtils.clone(M.scene),wrap=new THREE.Group();wrap.add(body);root.add(wrap);
  const mats=[];body.traverse(x=>{if(!x.isMesh)return;x.castShadow=true;x.receiveShadow=true;x.frustumCulled=false;const m=x.material=x.material.clone();mats.push(m);if(o.paint)o.paint(m);});
  const SB={},TB={};model.traverse(x=>{if(x.isBone)SB[x.name]=x;});body.traverse(x=>{if(x.isBone)TB[x.name.replace(/_\d+$/,'')]=x;});const T=k=>TB[map[k]];
  const pairs=Object.keys(map).filter(k=>SB[k]&&T(k));if(pairs.length<12||!SB.Hips||!T('Hips')||!T('FootL')||!T('FootR')||!(T('Head')||T('Chest')))return null;
  // measure both skeletons in their bind poses: measured mid-animation (an idle stance with the hips turned against the chest),
  // that turn would be built in backwards and show up as a twisted torso whenever the clips square the body up
  const unpose=bindPose(model),unposeB=bindPose(body);
  const wp=b=>root.worldToLocal(b.getWorldPosition(new THREE.Vector3()));const upd=()=>root.updateMatrixWorld(true);upd();
  // turn the model upright and facing the same way as the rig, then match height and stand it on the same spot
  const basis=(head,hips,l,r)=>{const u=wp(head).sub(wp(hips)).normalize(),x=wp(r).sub(wp(l));x.addScaledVector(u,-x.dot(u)).normalize();const f=new THREE.Vector3().crossVectors(x,u);return new THREE.Matrix4().makeBasis(x,u,f);};
  const HK=T('Head')?'Head':'Chest';// rigs without a head bone are measured from the chest
  const Ms=basis(SB[HK],SB.Hips,SB.UpperLegL,SB.UpperLegR),Mt=basis(T(HK),T('Hips'),T('UpperLegL'),T('UpperLegR'));
  wrap.quaternion.setFromRotationMatrix(Ms.multiply(Mt.transpose()));upd();
  const hs=wp(SB[HK]).y-wp(SB.FootL).y,ht=wp(T(HK)).y-wp(T('FootL')).y;wrap.scale.setScalar(hs/ht);upd();
  const d=wp(SB.FootL).add(wp(SB.FootR)).multiplyScalar(.5).sub(wp(T('FootL')).add(wp(T('FootR'))).multiplyScalar(.5));d.x=wp(SB.Hips).x-wp(T('Hips')).x;d.z=wp(SB.Hips).z-wp(T('Hips')).z;wrap.position.add(d);upd();
  // ankle bones sit at different heights on different rigs: stand the soles on the same ground as the driving rig's soles
  {const lo=skinBox(model,root).min.y,lb=skinBox(body,root).min.y;if(isFinite(lo)&&isFinite(lb)){wrap.position.y+=lo-lb;upd();}}
  // rest poses in the character's own space
  const rq=new THREE.Quaternion(),qi=new THREE.Quaternion();const relQ=(o,out)=>{root.getWorldQuaternion(qi).invert();return out.copy(qi).multiply(o.getWorldQuaternion(rq));};
  // Arms, hands and fingers are measured in the models' own resting poses instead (arms down on both): against the rig's T-pose,
  // matching each bone's direction alone leaves the forearm and hand rolled outward.
  const ARM=/^(UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;const off={};
  const measure=keys=>{for(const k of keys){const s=SB[k],t=T(k);const Rs=relQ(s,new THREE.Quaternion()),Rt=relQ(t,new THREE.Quaternion());let Ra=new THREE.Quaternion();
    const c=RIG_CHILD[k];if(c&&SB[c]&&T(c)){const ds=wp(SB[c]).sub(wp(s)).normalize(),dt=wp(T(c)).sub(wp(t)).normalize();Ra.setFromUnitVectors(dt,ds);}
    off[t.uuid]={s,o:Rs.clone().invert().multiply(Ra).multiply(Rt)};}};
  measure(pairs.filter(k=>!ARM.test(k)));unpose();unposeB();upd();measure(pairs.filter(k=>ARM.test(k)));bindPose(model);const unposeB2=bindPose(body);
  const hip0s=wp(SB.Hips),pel=T('Hips'),pel0=wp(pel),hipK=(pel0.y-wp(T('FootL')).y)/Math.max(.01,hip0s.y-wp(SB.FootL).y);
  const order=[];body.traverse(x=>{if(x.isBone)order.push(x);});
  const fL=T('FootL'),fR=T('FootR'),footRest=Math.min(fL?wp(fL).y:9,fR?wp(fR).y:9);let lift=0;// parents come before children
  const W={},tmp=new THREE.Quaternion(),pv=new THREE.Vector3();unpose();
  // and give the body back its own pose: bones the skin never uses (some finger and helper bones) have no real bind data and
  // would otherwise be left wherever the bind matrices put them (at the model's origin, by its feet)
  unposeB2();
  return {srcId:o.id,body,wrap,mats,T,handR:T('WristR'),armR:T('LowerArmR'),sync(){root.updateMatrixWorld(true);
    for(const b of order){const P=b.parent.isBone?W[b.parent.uuid]:relQ(b.parent,new THREE.Quaternion()),e=off[b.uuid];let w;
      if(e){w=relQ(e.s,new THREE.Quaternion()).multiply(e.o);b.quaternion.copy(tmp.copy(P).invert().multiply(w));}else w=P.clone().multiply(b.quaternion);W[b.uuid]=w;}
    // hips travel (crouches, falls, lying knocked down), scaled to this body's leg length
    pv.copy(wp(SB.Hips)).sub(hip0s).multiplyScalar(hipK).add(pel0);pv.y+=lift;const pw=pv.clone();pel.parent.worldToLocal(root.localToWorld(pv));pel.position.copy(pv);
    // keep the feet out of the ground: different leg proportions can let a pose sink below where the soles stood at rest
    body.updateMatrixWorld(true);const fy=Math.min(fL?wp(fL).y:9,fR?wp(fR).y:9),pen=footRest-fy;
    if(pen>.005){lift+=pen;pw.y+=pen;pel.parent.worldToLocal(root.localToWorld(pw));pel.position.copy(pw);}else lift=Math.max(0,lift-.01);}};}

/* ---------- suit surface patterns ---------- */
// The spacesuit has no texture coordinates, so its detail is drawn in the shader from each vertex's rest-pose position
// (projected on three planes and blended by the surface normal). It sticks to the body as it moves and keeps the chosen colours:
// armour plates get seams (some glowing), the under-suit a weave with pulsing circuit traces, joints get ribbing,
// and the accent lines carry a moving band of energy.
const SFX_TIME={value:0};
const SFX_GLSL=`
varying vec3 vSfxP;varying vec3 vSfxN;uniform float uSfxStyle;uniform float uSfxKind;uniform float uSfxTime;uniform vec3 uSfxGlow;
float sfxH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float sfxGrid(vec2 p,float s,float w){vec2 g=abs(fract(p/s+.5)-.5)*s;return 1.-smoothstep(w*.5,w,min(g.x,g.y));}
float sfxHex(vec2 p,float s,float w){p/=s;vec2 r=vec2(1.,1.732),h=r*.5,a=mod(p,r)-h,b=mod(p-h,r)-h,q=abs(dot(a,a)<dot(b,b)?a:b);float d=max(dot(q,vec2(.5,.866)),q.x);return smoothstep(.5-w,.5-w*.35,d);}
vec2 sfxPat(vec2 p,float kind,float st,float t){float dk=1.,gl=0.;
  if(kind<.5){vec2 q=p;q.x+=step(.5,fract(q.y/.2))*.05;float seam=sfxGrid(q,.1,.007);vec2 id=floor(q/.1);dk*=1.-.42*seam;dk*=.94+.06*sfxH(id);
    if(st<.5&&sfxH(id+3.1)>.91)gl+=seam*.7;
    if(st>.5&&st<1.5){float hx=sfxHex(p,.05,.08);dk*=1.-.3*hx;if(sfxH(floor(p/.15))>.75)gl+=hx*.45;}
    if(st>1.5&&st<2.5)dk*=mix(1.,.45,step(.5,fract((p.x+p.y)/.08)));}
  else if(kind<1.5){if(st<.5){dk*=1.-.2*sfxHex(p,.018,.12);vec2 c=floor(p/.05),f=fract(p/.05);float h=sfxH(c),tr=0.;
      if(h>.5)tr=max(tr,1.-smoothstep(.04,.07,abs(f.y-.5)));if(h<.3)tr=max(tr,1.-smoothstep(.04,.07,abs(f.x-.5)));if(h>.9)tr=max(tr,1.-smoothstep(.1,.14,length(f-.5)));
      gl+=tr*(.3+.7*smoothstep(.55,1.,sin(t*2.6-(c.x+c.y)*.7)*.5+.5));dk*=1.-.25*tr;}
    else if(st<1.5){float hx=sfxHex(p,.035,.1);dk*=1.-.3*hx;gl+=hx*.22;}
    else if(st<2.5)dk*=.82+.18*step(.5,fract((p.x-p.y)/.014))*step(.5,fract((p.x+p.y)/.028)+.25);}
  else if(kind<2.5){dk*=.68+.32*smoothstep(.18,.42,abs(fract(p.y/.014)-.5));}
  else gl+=.25+.6*max(0.,sin(p.y*22.-t*4.));
  return vec2(dk,gl);}
vec2 sfxTri(){vec3 n=abs(normalize(vSfxN));n=pow(n,vec3(4.));n/=n.x+n.y+n.z;
  return sfxPat(vSfxP.yz,uSfxKind,uSfxStyle,uSfxTime)*n.x+sfxPat(vSfxP.xz,uSfxKind,uSfxStyle,uSfxTime)*n.y+sfxPat(vSfxP.xy,uSfxKind,uSfxStyle,uSfxTime)*n.z;}
`;
function suitFx(m,kind,style,glow,scale){const st={circuit:0,hex:1,hazard:2}[style];if(st===undefined)return;
  m.customProgramCacheKey=()=>'suitfx';
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,{uSfxStyle:{value:st},uSfxKind:{value:kind},uSfxTime:SFX_TIME,uSfxGlow:{value:glow},uSfxScale:{value:scale}});
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSfxP;varying vec3 vSfxN;uniform float uSfxScale;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_SKINNING\nvSfxP=(bindMatrix*vec4(position,1.)).xyz*uSfxScale;vSfxN=mat3(bindMatrix)*normal;\n#else\nvSfxP=position*uSfxScale;vSfxN=normal;\n#endif');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n'+SFX_GLSL)
      .replace('#include <color_fragment>','#include <color_fragment>\nvec2 sfxV=sfxTri();diffuseColor.rgb*=sfxV.x;')
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uSfxGlow*sfxV.y;');};
  m.needsUpdate=true;}
// metres per rest-pose unit for a model: its height from feet to head is taken as 1.85 m
function restScale(model){const b=new THREE.Box3(),v=new THREE.Vector3();model.updateMatrixWorld(true);
  model.traverse(o=>{if(!o.isSkinnedMesh)return;const P=o.geometry.attributes.position,q=P.normalized?1/32767:1;for(let i=0;i<P.count;i+=4){v.set(P.getX(i),P.getY(i),P.getZ(i)).multiplyScalar(q).applyMatrix4(o.bindMatrix);b.expandByPoint(v);}});
  const h=b.max.y-b.min.y;return h>0?1.85/h:1;}

/* ---------- the player: a recolorable spacesuit, swappable helmet or face, outfit layers and a backpack ---------- */
const _wp=new THREE.Vector3(),_we=new THREE.Vector3(),_wd=new THREE.Vector3(),_wt=new THREE.Vector3(),_wa=new THREE.Vector3(),_wb=new THREE.Vector3(),_wc=new THREE.Vector3(),_wz=new THREE.Vector3(),_wy=new THREE.Vector3();
const _hf=new THREE.Vector3(),_hr=new THREE.Vector3(),_hs=new THREE.Vector3(),_hl=new THREE.Vector3(),_ha=new THREE.Vector3(),_hb=new THREE.Vector3(),_hc=new THREE.Vector3(),_hd=new THREE.Vector3(),_he=new THREE.Vector3(),
  _hm2v=new THREE.Vector3(),_hm3v=new THREE.Vector3(),_hv8=new THREE.Vector3(),_hv9=new THREE.Vector3(),_hg=new THREE.Vector3(),_hh=new THREE.Vector3(),_hp=new THREE.Vector3(),_hq=new THREE.Vector3(),_hm=new THREE.Matrix4();
// ---- hands on a weapon ----
// A hand's frame from its bones: fwd = wrist to middle knuckle, across = pinky to index knuckle, n = palm normal (the side the thumb is on)
const _hvA=[...Array(8)].map(()=>new THREE.Vector3()),_hq1=new THREE.Quaternion(),_hq2=new THREE.Quaternion(),_hM1=new THREE.Matrix4(),_hM2=new THREE.Matrix4();
function handFrame(B,s,out){const w=B['Wrist'+s],m=B['Middle1'+s],i=B['Index1'+s],p=B['Pinky1'+s],t=B['Thumb1'+s];if(!w||!m||!i||!p)return null;
  const W0=w.getWorldPosition(_hvA[0]),M0=m.getWorldPosition(_hvA[1]),I0=i.getWorldPosition(_hvA[2]),P0=p.getWorldPosition(_hvA[3]);
  const fwd=out.fwd.subVectors(M0,W0).normalize(),across=out.across.subVectors(I0,P0);across.addScaledVector(fwd,-across.dot(fwd)).normalize();const n=out.n.crossVectors(fwd,across);
  // which side is the palm: fixed per hand for the suit rig (checked against the curl, which bends the fingers toward it). Reading
  // it from the thumb was unreliable: decided on a frame where the hands were posed (the look screen, an animation), it came
  // out backwards and stayed that way, turning both hands inside out on the gun
  B._psg={R:-1,L:1};if(B._psg[s]<0)n.negate();return out;}
const _hf1={fwd:new THREE.Vector3(),across:new THREE.Vector3(),n:new THREE.Vector3()};
// turn the hand so its fingers point along fwdT and its palm faces nT
function orientHand(B,s,fwdT,nT,k=1){const h=B['Wrist'+s],F=handFrame(B,s,_hf1);if(!h||!F)return;const a0=_hvA[6].crossVectors(F.n,F.fwd);
  _hM1.makeBasis(a0,F.n,F.fwd);const f=_hvA[7].copy(fwdT).normalize(),n=_hvA[4].copy(nT);n.addScaledVector(f,-n.dot(f)).normalize();const a=_hvA[5].crossVectors(n,f);_hM2.makeBasis(a,n,f);
  _hq1.setFromRotationMatrix(_hM2.multiply(_hM1.transpose()));if(k<1)_hq1.slerp(_hq2.identity(),1-k);
  h.getWorldQuaternion(_hq2);_hq2.premultiply(_hq1);h.parent.getWorldQuaternion(_hq1).invert();h.quaternion.copy(_hq1.multiply(_hq2));h.updateMatrixWorld(true);}
// close the fingers toward the palm (amount 0..1; the thumb closes about half as far); each frame starts from the bones' own pose
const FINGERS=['Index','Middle','Ring','Pinky'];
function curlFingers(B,s,amt){const F=handFrame(B,s,_hf1);if(!F||amt<=0)return;B._fr=B._fr||{};const n=F.n.clone();
  const all=[];for(const f of FINGERS)for(let j=1;j<=3;j++)all.push(B[f+j+s]);for(let j=1;j<=2;j++)all.push(B['Thumb'+j+s]);
  // every frame starts from the fingers' own rest pose
  for(const b of all){if(!b)continue;if(!B._fr[b.uuid])B._fr[b.uuid]=b.quaternion.clone();b.quaternion.copy(B._fr[b.uuid]);}B['Wrist'+s].updateMatrixWorld(true);
  const turn=(b,ax,ang)=>{_hq1.setFromAxisAngle(ax,ang);b.getWorldQuaternion(_hq2).premultiply(_hq1);b.parent.getWorldQuaternion(_hq1).invert();b.quaternion.copy(_hq1.multiply(_hq2));b.updateMatrixWorld(true);};
  const seg=(b,c,out)=>c.getWorldPosition(out).sub(b.getWorldPosition(_hvA[1])).normalize();
  // close the spread: index, ring and little finger swing in alongside the middle finger, so the hand closes as one
  const m1=B['Middle1'+s],m2=B['Middle2'+s];if(m1&&m2){const dm=seg(m1,m2,_hvA[3]).clone();for(const f of['Index','Ring','Pinky']){const b=B[f+'1'+s],c=B[f+'2'+s];if(!b||!c)continue;
    const d=seg(b,c,_hvA[0]),ax=_hvA[2].crossVectors(d,dm);const sn=ax.length();if(sn<1e-4)continue;ax.normalize();turn(b,ax,Math.asin(Math.min(1,sn))*.8);}}
  const bend=(b,c,ang)=>{if(!b||!c)return;const d=seg(b,c,_hvA[0]),ax=_hvA[2].crossVectors(d,n);if(ax.lengthSq()<1e-6)return;ax.normalize();turn(b,ax,ang);};
  for(const f of FINGERS)for(let j=1;j<=3;j++)bend(B[f+j+s],B[f+(j+1)+s],amt*(j===1?1.15:j===2?1.45:1.1));
  for(let j=1;j<=2;j++)bend(B['Thumb'+j+s],B['Thumb'+(j+1)+s],amt*.55);}

// two-bone IK in world space: bend upper and lower arm so the wrist reaches the target, the elbow swinging toward the pole
const _ka=new THREE.Vector3(),_kb=new THREE.Vector3(),_kc=new THREE.Vector3(),_kd=new THREE.Vector3(),_ke=new THREE.Vector3(),_kp=new THREE.Vector3(),_kq=new THREE.Quaternion(),_kw=new THREE.Quaternion(),_kx=new THREE.Quaternion();
// a person sitting: thighs forward along the seat, shins down to the floor (the caller lowers the body onto the seat)
function seatLegs(B,face){const f=_hv8.set(Math.sin(face),0,Math.cos(face)),side=_hm3v.set(Math.cos(face),0,-Math.sin(face));
  for(const s of['L','R']){const u=B['UpperLeg'+s],l=B['LowerLeg'+s],ft=B['Foot'+s];if(!u||!l||!ft)continue;const sp=(s==='L'?1:-1)*.12;
    rotBoneTo(u,l.getWorldPosition(new THREE.Vector3()).sub(u.getWorldPosition(new THREE.Vector3())),_hv9.copy(f).addScaledVector(UP,-.08).addScaledVector(side,sp));
    rotBoneTo(l,ft.getWorldPosition(new THREE.Vector3()).sub(l.getWorldPosition(new THREE.Vector3())),_hv9.set(0,-1,0).addScaledVector(f,.15));}}
// the visible body's own bones by the rig's names, with its fingers' resting turns taken from the untouched model
function riderBones(rd){if(rd._B)return rd._B;const RB={},src=MODELS[rd.srcId]&&MODELS[rd.srcId].scene;RB._fr={};
  for(const s of['L','R']){for(const k of['UpperArm','LowerArm','Wrist'])RB[k+s]=rd.T(k+s);for(const f of[...FINGERS,'Thumb'])for(let j=1;j<=4;j++){const b=rd.T(f+j+s);if(b){RB[f+j+s]=b;const o=src&&src.getObjectByName(b.name);if(o)RB._fr[b.uuid]=o.quaternion.clone();}}}
  RB._psg={R:-1,L:1};return rd._B=RB;}
function riderHold(av,rd){const RB=riderBones(rd),H=av._hold;if(!RB.UpperArmR||!RB.UpperArmL||!RB.WristR||!RB.WristL)return;av.root.updateMatrixWorld(true);
  ik2(RB.UpperArmR,RB.LowerArmR,RB.WristR,H.wr,H.pR);ik2(RB.UpperArmL,RB.LowerArmL,RB.WristL,H.fo,H.pL);av.root.updateMatrixWorld(true);
  const wx=_hm2v.crossVectors(H.up,H.dir);orientHand(RB,'R',_hv8.copy(H.up).multiplyScalar(-.8).addScaledVector(H.dir,.45),wx);orientHand(RB,'L',H.lF,_hm3v.copy(wx).multiplyScalar(-1).addScaledVector(H.up,.35));
  curlFingers(RB,'R',1.02);curlFingers(RB,'L',.12);}
function riderGrip(rd,amt){const RB=riderBones(rd);if(RB.WristR){RB.WristR.updateMatrixWorld(true);curlFingers(RB,'R',amt);}}
function rotBoneTo(bone,from,to){_kq.setFromUnitVectors(from.normalize(),to.normalize());bone.getWorldQuaternion(_kw);bone.parent.getWorldQuaternion(_kx);bone.quaternion.copy(_kx.invert().multiply(_kq.multiply(_kw)));bone.updateMatrixWorld(true);}
function ik2(up,lo,hand,target,pole){if(!up||!lo||!hand)return;const a=up.getWorldPosition(_ka),b=lo.getWorldPosition(_kb),c=hand.getWorldPosition(_kc);const l1=a.distanceTo(b),l2=b.distanceTo(c);
  const d=_kd.subVectors(target,a),dist=clamp(d.length(),Math.abs(l1-l2)+.01,l1+l2-.005);d.normalize();const pd=_kp.subVectors(pole,a);pd.addScaledVector(d,-pd.dot(d));if(pd.lengthSq()<1e-6)pd.set(0,-1,0);pd.normalize();
  const ca=clamp((l1*l1+dist*dist-l2*l2)/(2*l1*dist),-1,1),sa=Math.sqrt(1-ca*ca),e=_ke.copy(a).addScaledVector(d,ca*l1).addScaledVector(pd,sa*l1);
  rotBoneTo(up,b.clone().sub(a),e.clone().sub(a));const b2=lo.getWorldPosition(_kb),c2=hand.getWorldPosition(_kc),t2=a.clone().addScaledVector(d,dist);rotBoneTo(lo,c2.clone().sub(b2),t2.sub(b2));}
function buildAvatar(L){
  const root=new THREE.Group(),weaponG=new THREE.Group();scene.add(weaponG);
  const valid=(k,v)=>LOOK[k].some(x=>x[0]===v)?v:defaultLook()[k];for(const k of ['body','pattern','outfit','helmet','face','hairstyle','pack','shoulders','emblem','finish','build','height'])L[k]=valid(k,L[k]);
  const hs=L.helmet,useSuitHead=hs==='suit'||hs==='crest'||hs==='halo';
  const model=cloneParts('suit',['SpaceSuit_Body','SpaceSuit_Legs','SpaceSuit_Feet'].concat(useSuitHead?['SpaceSuit_Head']:[]));
  if(!model){root.add(new THREE.Mesh(cyl(.3,.3,1.8,12),MAT.hull));return {root,model:root,B:{},anim:null,weapon:null,weaponG,setWeapon(){},updateWeapon(){}};}
  // 'none' shows a face with any hairstyle
  if(!useSuitHead){const key=hs==='none'?L.face:hs,h=HEADS[key];const part=h&&cloneParts(h[0],[h[1]]);
    if(part){if(hs==='none'&&L.hairstyle!=='auto'){const rule=HAIR_OF[key];part.traverse(o=>{if(o.isMesh&&isHair(o.material.name,rule))o.visible=false;});}
      part.traverse(o=>{if(o.isMesh&&hs==='none'&&L.hairstyle==='auto'&&isHair(o.material.name,HAIR_OF[key]))o.userData.hair=true;});graft(model,part);}
    if(hs==='none'&&L.hairstyle!=='auto'&&L.hairstyle!=='bald'){const H=HAIRS_STY[L.hairstyle];const hp=H&&cloneParts(H[0],[H[1]]);
      if(hp){hp.traverse(o=>{if(o.isMesh){if(isHair(o.material.name,H[2]))o.userData.hair=true;else o.visible=false;}});graft(model,hp);}}}
  const BL=LOOK.build.find(b=>b[0]===L.build),HT=LOOK.height.find(h=>h[0]===L.height)[2];
  root.add(model);root.scale.set(BL[2],BL[3]*HT,BL[2]);
  const C=lookColors(L),fin={matte:[.85,.05],satin:[.5,.25],chrome:[.22,.75]}[L.finish];
  const slot={SciFi_Light:C.armor,SciFi_Light_Accent:C.accent,SciFi_Main:C.suit,SciFi_MainDark:C.trim};
  let sfxScale=0;model.traverse(o=>{if(!o.isMesh)return;const m=o.material,n=m.name;
    if(slot[n]!==undefined&&L.pattern!=='clean'&&L.body!=='prota'&&L.body!=='soldier')suitFx(m,{SciFi_Light:0,SciFi_Main:1,SciFi_MainDark:2,SciFi_Light_Accent:3}[n],L.pattern,lin(C.accent).multiplyScalar(n==='SciFi_Light_Accent'?.9:1.4),sfxScale||(sfxScale=restScale(model)));
    if(slot[n]!==undefined){m.color.copy(lin(slot[n]));m.roughness=n==='SciFi_Light'?fin[0]:.7;m.metalness=n==='SciFi_Light'?fin[1]:.15;if(n==='SciFi_Light_Accent'){m.emissive=lin(C.accent);m.emissiveIntensity=.12;}}
    else if(n==='Grey'){m.color.setHex(0x0a0c10);m.roughness=.08;m.metalness=.9;m.emissive=lin(C.visor);m.emissiveIntensity=.22;}
    else if(/skin/i.test(n)&&L.skin!=null)m.color.copy(lin(L.skin));
    else if((o.userData.hair||/eyebrow/i.test(n))&&L.hair!=null)m.color.copy(lin(L.hair));});
  const anim=new Animator(model,'q'),B=anim.B;if(anim.a.idle){anim.a.idle.setEffectiveWeight(1);}
  model.updateMatrixWorld(true);
  // layered gear, authored in model space (character faces +z, 1.85 m tall) and pinned to bones
  const groups={},P=new Parts();
  const G=bone=>{if(groups[bone])return groups[bone];const g=new THREE.Group();if(B[bone])bindToBone(model,B[bone],g,new THREE.Vector3());groups[bone]=g;return g;};
  const org={};const O=bone=>org[bone]||(org[bone]=B[bone]?boneOrigin(model,B[bone]):new THREE.Vector3());
  const A=(bone,m,geo,x,y,z,...r)=>{const o=O(bone);P.add(G(bone),m,geo,x-o.x,y-o.y,z-o.z,...r);};
  const armor=std(TEX.armor,{color:C.armor,roughness:fin[0],metalness:fin[1]}),dark=std(TEX.rubber,{color:C.trim,roughness:.8});
  const acc=new THREE.MeshStandardMaterial({color:C.accent,emissive:C.accent,emissiveIntensity:.8,roughness:.4});
  const cloth=std(TEX.fabric,{color:C.armor,roughness:.95,side:THREE.DoubleSide}),cloth2=std(TEX.fabric,{color:C.suit,roughness:.95,side:THREE.DoubleSide});
  const of=L.outfit,cz=.055,cf=.185,cb=-.08; // torso center, front and back surface depth
  const sh=L.shoulders==='outfit'?({spacesuit:'none',heavy:'heavy',scout:'light',engineer:'light',pilot:'none',explorer:'none',ranger:'none',vanguard:'heavy'}[of]):L.shoulders;
  if(of==='heavy'||of==='vanguard'){A('Chest',armor,RB(.34,.24,.07,.035,3),0,1.38,cf+.01);A('Chest',armor,RB(.32,.26,.06,.03,3),0,1.36,cb-.01);A('Chest',acc,RB(.14,.02,.01,.005),0,1.45,cf+.05);
    A('Hips',armor,RB(.36,.1,.28,.04,3),0,1.02,cz);for(const s of[-1,1])A('Hips',armor,RB(.12,.16,.05,.02),s*.1,.92,cf-.01,.12,0,0);}
  if(of==='vanguard'){for(const s of[-1,1])A('Chest',acc,RB(.016,.2,.012,.005),s*.12,1.38,cf+.05);A('Chest',dark,RB(.06,.06,.04,.02),0,1.27,cf+.05);}
  if(of==='scout'||of==='pilot'){for(const s of[-1,1])A('Chest',dark,RB(.035,.36,.02,.008),s*.075,1.38,cf+.012,0,0,s*.22);A('Chest',dark,RB(.32,.035,.02,.008),0,1.26,cf+.012);
    if(of==='scout'){A('Chest',armor,RB(.16,.1,.05,.02),0,1.42,cf+.03);A('Chest',acc,RB(.07,.014,.01,.004),0,1.45,cf+.057);}
    else{A('Chest',armor,cyl(.045,.045,.02,20),0,1.26,cf+.03,Math.PI/2,0,0);A('Chest',acc,cyl(.028,.028,.01,20),0,1.26,cf+.042,Math.PI/2,0,0);A('Neck',dark,tor(.12,.035,8,28),0,1.6,cz,Math.PI/2,0,0);}}
  if(of==='engineer'){A('Hips',dark,tor(.18,.025,8,32),0,1.02,cz,Math.PI/2,0,0,1,1.2,1);for(const [x,z] of[[.14,.15],[-.15,.13],[.19,.0],[-.19,.02]])A('Hips',armor,RB(.08,.09,.06,.015),x,.98,z+.02);
    A('Chest',armor,RB(.11,.09,.05,.02),-.08,1.4,cf+.02);A('Chest',armor,RB(.09,.07,.05,.02),.09,1.38,cf+.02);A('ShoulderL',dark,cyl(.03,.035,.06,16),.16,1.57,cz+.05,Math.PI/2,0,0);A('ShoulderL',acc,cyl(.026,.026,.008,16),.16,1.57,cz+.085,Math.PI/2,0,0);}
  if(of==='explorer'){A('Hips',cloth2,lathe([[.17,.1],[.19,-.05],[.22,-.25],[.25,-.42]],36),0,1.04,cz,0,0,0,1.05,1,1);A('Chest',cloth2,RB(.33,.3,.27,.08,3),0,1.33,cz);A('Chest',cloth2,RB(.1,.12,.24,.04,2),0,1.5,cz-.01);A('Chest',dark,RB(.34,.035,.28,.01),0,1.19,cz);for(const s of[-1,1])A('Chest',dark,RB(.03,.28,.01,.005),s*.06,1.34,cz+.14);}
  if(of==='ranger'){A('Chest',cloth2,lathe([[.1,.02],[.19,-.06],[.25,-.22],[.27,-.42]],40),0,1.58,cz,0,0,0,1,1,.85);A('Chest',cloth2,sph(.13,24,12,0,Math.PI*2,0,Math.PI/2),0,1.56,cz-.1,-1.2,0,0,1,1,.8);A('Hips',dark,tor(.18,.02,8,32),0,1.02,cz,Math.PI/2,0,0,1,1.2,1);}
  if(sh==='light')for(const [s,b] of [[1,'UpperArmL'],[-1,'UpperArmR']])A(b,armor,sph(.085,24,12,0,Math.PI*2,0,Math.PI/2),s*.22,1.47,cz,0,0,-s*.5,1,.6,1.05);
  if(sh==='heavy')for(const [s,b] of [[1,'UpperArmL'],[-1,'UpperArmR']]){A(b,armor,RB(.15,.06,.2,.03,3),s*.22,1.49,cz,0,0,-s*.45);A(b,armor,RB(.12,.05,.17,.02,3),s*.26,1.44,cz,0,0,-s*.75);A(b,acc,RB(.015,.015,.2,.005),s*.225,1.525,cz,0,0,-s*.45);}
  if(L.emblem!=='none'&&of!=='ranger'&&of!=='explorer'){const e=new THREE.Mesh(new THREE.PlaneGeometry(.085,.085),new THREE.MeshBasicMaterial({map:emblemTex(L.emblem,C.accent),transparent:true,depthWrite:false}));const o=O('Chest');e.position.set(.085-o.x,1.45-o.y,cf+(of==='heavy'||of==='vanguard'?.05:.012)-o.z);G('Chest').add(e);}
  if(hs==='crest'){A('Head',armor,RB(.03,.1,.32,.012),0,1.91,cz+.02);A('Head',acc,RB(.012,.024,.28,.005),0,1.96,cz+.02);}
  if(hs==='halo'){const o=O('Head'),ring=new THREE.Mesh(tor(.2,.012,8,48),acc);ring.rotation.x=Math.PI/2-.25;ring.position.set(-o.x,2.02-o.y,cz-.02-o.z);G('Head').add(ring);}
  // backpack
  const pk=L.pack,bz=cb+.025,by=1.36;const K=(m,geo,x,y,z,...r)=>A('Chest',m,geo,x,y,z,...r);
  if(pk==='tanks'){K(dark,RB(.28,.32,.12,.05),0,by,bz+.02);for(const s of[-1,1]){K(armor,cyl(.045,.045,.28,20),s*.075,by,bz-.06);K(armor,sph(.045,20,10),s*.075,by+.14,bz-.06);K(armor,sph(.045,20,10),s*.075,by-.14,bz-.06);}K(acc,RB(.15,.02,.01,.004),0,by+.12,bz-.04);}
  if(pk==='compact'){K(dark,RB(.24,.26,.09,.04),0,by,bz+.03);K(armor,RB(.2,.06,.05,.015),0,by-.08,bz-.02);K(acc,cyl(.018,.018,.01,16),0,by+.06,bz-.017,Math.PI/2,0,0);}
  if(pk==='rig'){K(dark,RB(.3,.36,.14,.05),0,by,bz+.01);for(const s of[-1,1])K(armor,RB(.07,.12,.09,.02),s*.19,by-.08,bz+.01);K(dark,cyl(.009,.009,.55,8),.1,by+.45,bz-.02);K(acc,sph(.016,10,8),.1,by+.73,bz-.02);K(acc,RB(.16,.018,.01,.004),0,by+.08,bz-.065);}
  if(pk==='cargo'){K(dark,RB(.26,.3,.04,.015),0,by,bz+.02);for(const s of[-1,1])K(armor,RB(.025,.5,.03,.008),s*.13,by,bz-.01);K(armor,RB(.3,.025,.03,.008),0,by+.24,bz-.01);K(armor,RB(.3,.025,.03,.008),0,by-.24,bz-.01);K(MAT.crate,rbox(.22,.18,.15,.02,1),0,by+.09,bz-.085);K(MAT.crateBlue,rbox(.2,.14,.13,.02,1),0,by-.1,bz-.075);}
  if(pk==='jets'){K(dark,RB(.28,.3,.12,.05),0,by,bz+.02);for(const s of[-1,1]){K(armor,cyl(.05,.06,.26,20),s*.1,by-.04,bz-.06);K(acc,cyl(.045,.045,.01,20),s*.1,by-.175,bz-.06);}}
  // the wrist terminal: a band with a glowing emitter on the left forearm
  if(B.WristL&&B.LowerArmL){const w=O('WristL'),e=O('LowerArmL'),m=e.clone().lerp(w,.78);A('LowerArmL',dark,tor(.052,.016,8,24),m.x,m.y,m.z,0,Math.PI/2,0);A('LowerArmL',armor,RB(.06,.025,.05,.008),m.x,m.y+.05,m.z);A('LowerArmL',acc,RB(.035,.008,.03,.003),m.x,m.y+.064,m.z);}
  P.build();
  // an alternate body rides the rig; the suit and its gear stay in place, unseen, to drive it
  // a special model: any rigged townsperson or humanoid robot, with its colours shifted
  const spn=L.body==='npc'&&MODELS[L.npc]&&!NPC_CLIP[L.npc]?{mdl:L.npc,hue:(L.npcHue||0)*Math.PI/180,sat:L.npcSat??1,val:L.npcVal??1}:null;
  const rider=spn?buildRiderBody(root,model,{id:spn.mdl,map:NPC_RIG[spn.mdl]||RPM_MAP,paint:m=>npcPaint(m,spn,!!NPC_RIG[spn.mdl])}):L.body==='soldier'?buildRiderBody(root,model,{id:'soldier',map:CC_MAP,paint:m=>{m.envMap=protaEnv();m.envMapIntensity=.6;if(m.map)bodyTint(m,'soldier',C);else m.color.copy(lin(C.trim)).multiplyScalar(.5);}}):L.body==='prota'?buildRiderBody(root,model,{id:'prota',map:PROTA_MAP,paint:m=>{m.envMap=protaEnv();m.envMapIntensity=1.2;
    bodyTint(m,'prota',C);m.metalness=.55;m.roughness=.55;m.emissive=lin(C.accent);m.emissiveIntensity=2.4;}}):null;if(rider)model.traverse(o=>{if(o.isMesh)o.visible=false;});
  // first-person left forearm that rises into view when the wrist terminal opens
  const fpLeft=new THREE.Group();fpLeft.visible=false;scene.add(fpLeft);{const sm=std(TEX.fabric,{color:C.suit,roughness:.8}),gm=std(TEX.rubber,{color:C.trim,roughness:.7});
    const s1=new THREE.Mesh(cyl(.055,.065,.42,16),sm);s1.position.y=-.2;fpLeft.add(s1);const band=new THREE.Mesh(tor(.068,.02,8,24),dark);band.rotation.x=Math.PI/2;band.position.y=-.03;fpLeft.add(band);
    const pl=new THREE.Mesh(RB(.08,.03,.07,.01),armor);pl.position.set(0,-.03,.07);fpLeft.add(pl);const em=new THREE.Mesh(RB(.045,.012,.04,.004),acc);em.position.set(0,-.03,.09);fpLeft.add(em);
    const gl=glowSprite(C.accent,.18,.9);gl.position.set(0,-.03,.11);fpLeft.add(gl);const g1=new THREE.Mesh(sph(.06,16,12),gm);g1.scale.set(1.1,1.3,.8);g1.position.y=.06;fpLeft.add(g1);}
  // first-person sleeve and glove, shown under the weapon only when the camera is in the helmet
  const sleeve=new THREE.Group();sleeve.visible=false;weaponG.add(sleeve);{const sm=std(TEX.fabric,{color:C.suit,roughness:.8}),gm=std(TEX.rubber,{color:C.trim,roughness:.7});
    const s1=new THREE.Mesh(cyl(.05,.06,.34,16),sm);s1.rotation.x=Math.PI/2;s1.position.set(.01,-.07,-.24);sleeve.add(s1);const r1=new THREE.Mesh(tor(.055,.012,6,16),new THREE.MeshStandardMaterial({color:C.accent,emissive:C.accent,emissiveIntensity:.5}));r1.position.set(.01,-.07,-.09);sleeve.add(r1);
    const g1=new THREE.Mesh(sph(.055,16,12),gm);g1.scale.set(1,.8,1.3);g1.position.set(.01,-.06,-.04);sleeve.add(g1);}
  const av={root,model,B,anim,weaponG,sleeve,fpLeft,weapon:null,accent:C.accent,rider,sync(){if(rider)rider.sync();if(rider&&this._hold&&this._hold.on){this._hold.on=false;riderHold(this,rider);}else if(rider&&this._grip1){riderGrip(rider,this._grip1);}this._grip1=0;},
    setWeapon(base){if(this.weapon)weaponG.remove(this.weapon.g);this.weapon=null;if(!base)return;this.weapon=buildWeaponModel(base);weaponG.add(this.weapon.g);this.weapon.g.traverse(o=>{if(o.isMesh)o.castShadow=true;});},
    // the weapon follows the right hand: along the forearm at rest, straight ahead when aiming
    // two-handed weapons: the gun is posed against the body (a diagonal low ready, raised to the shoulder when aiming)
    // and both arms reach for it, right hand on the grip and left on the fore-grip
    holdPose(aim,face){const W=this.weapon;if(!W||!W.two||!B.UpperArmR||!B.UpperArmL||!root.visible)return;root.updateMatrixWorld(true);const S=root.scale.x;
      const f=_hf.set(Math.sin(face),0,Math.cos(face)),rt=_hr.set(-Math.cos(face),0,Math.sin(face)),rs=rider&&rider.T('UpperArmR'),rl=rider&&rider.T('UpperArmL'),sh=(rs||B.UpperArmR).getWorldPosition(_hs),shL=(rl||B.UpperArmL).getWorldPosition(_hl);// the shoulders of the body you can see
      const lowP=_ha.copy(sh).addScaledVector(f,.22*S).addScaledVector(UP,-(rider?.3:.22)*S).addScaledVector(rt,-.1*S),aimP=_hb.copy(sh).addScaledVector(f,.26*S).addScaledVector(UP,-.08*S).addScaledVector(rt,-.12*S);
      const lowD=_hc.copy(f).multiplyScalar(.9).addScaledVector(UP,-.3).addScaledVector(rt,-.26).normalize(),grip=lowP.lerp(aimP,aim),dir=lowD.lerp(f,aim).normalize();
      const up=_hd.copy(UP).addScaledVector(dir,-UP.dot(dir)).normalize(),x=_he.crossVectors(up,dir);_hm.makeBasis(x,up,dir);
      weaponG.position.copy(grip);weaponG.quaternion.setFromRotationMatrix(_hm);weaponG.scale.setScalar(S);weaponG.updateMatrixWorld(true);this._posed=true;
      // how wide the gun is (in its own frame), so the palms sit against its sides rather than inside it
      if(W._hw===undefined){const inv=weaponG.matrixWorld.clone().invert(),bb=new THREE.Box3();W.g.updateMatrixWorld(true);W.g.traverse(q=>{if(q.isMesh){q.geometry.computeBoundingBox();bb.union(q.geometry.boundingBox.clone().applyMatrix4(q.matrixWorld.clone().premultiply(inv)));}});W._hw=clamp((bb.max.x-bb.min.x)/2/S,.025,.06);}
      const hw=W._hw*S;
      // wrists sit just behind and below where the palms close
      const wr=_hg.copy(grip).addScaledVector(dir,-.05*S).addScaledVector(up,-.05*S).addScaledVector(_hm2v.crossVectors(up,dir),-(hw+.02*S)),foreD=W.fore?W.fore.getWorldPosition(_hh).sub(grip).dot(dir):.3*S,tt=clamp(_hp.copy(shL).sub(grip).dot(dir),.09*S,Math.max(.09*S,foreD)),fo=_hh.copy(grip).addScaledVector(dir,tt);// on the line of the bore, then down to the underside of the fore-end where the weapon says it is
      if(W.fore){const fw=W.fore.getWorldPosition(_hm3v).sub(grip);fo.addScaledVector(up,fw.dot(up));}fo.addScaledVector(up,.065*S);
      // the support hand lies along the left side of the fore-end, palm flat against it, fingers forward: the wrist sits just
      // outside the gun's left flank (the arm can't reach far enough to cup under it)
      const wxL=_hm2v.crossVectors(up,dir),lF=_hv9.copy(dir).multiplyScalar(.92).addScaledVector(up,.22).addScaledVector(wxL,.14).normalize();fo.addScaledVector(wxL,hw+.03*S).addScaledVector(lF,-.06*S);
      const poleR=_hp.copy(sh).addScaledVector(rt,.4).addScaledVector(UP,-.5).addScaledVector(f,-.2),poleL=_hq.copy(shL).addScaledVector(rt,-.4).addScaledVector(UP,-.5).addScaledVector(f,-.05);
      // kept for the visible body: a different model (operative, soldier) has its own arm lengths and hands, and is posed again after it copies this rig
      const H=this._hold||(this._hold={});for(const [k,v] of [['wr',wr],['fo',fo],['up',up],['dir',dir],['lF',lF],['pR',poleR],['pL',poleL]])(H[k]=H[k]||new THREE.Vector3()).copy(v);H.on=true;
      ik2(B.UpperArmR,B.LowerArmR,B.WristR,wr,poleR);
      ik2(B.UpperArmL,B.LowerArmL,B.WristL,fo,poleL);
      // the hands take hold: right palm against the grip with the fingers wrapped round it, left hand cupped under the fore-end
      // the arms were just bent: bring every bone's world transform up to date before reading the hands, or they are turned
      // from where the arm was last frame (fine standing still, wildly off while running)
      root.updateMatrixWorld(true);
      const wx=_hm2v.crossVectors(up,dir);// the gun's left
      orientHand(B,'R',_hv8.copy(up).multiplyScalar(-.8).addScaledVector(dir,.45),wx);
      // the support hand comes up under the fore-end, palm up, fingers reaching across the barrel to wrap its far side
      orientHand(B,'L',lF,_hm3v.copy(wx).multiplyScalar(-1).addScaledVector(up,.35));
      curlFingers(B,'R',1.02);curlFingers(B,'L',.12);},
    // seated: thighs forward along the seat, shins down to the floor (the root is lowered to the seat by the caller)
    sitPose(face){root.updateMatrixWorld(true);const f=_hv8.set(Math.sin(face),0,Math.cos(face));
      for(const s of['L','R']){const u=B['UpperLeg'+s],l=B['LowerLeg'+s],ft=B['Foot'+s];if(!u||!l||!ft)continue;
        rotBoneTo(u,l.getWorldPosition(_hm2v).sub(u.getWorldPosition(_hm3v)),_hv9.copy(f).addScaledVector(UP,-.1));
        rotBoneTo(l,ft.getWorldPosition(_hm2v).sub(l.getWorldPosition(_hm3v)),_hv9.set(0,-1,0).addScaledVector(f,.12));}},
    // one-handed weapons: the fist closes on the grip
    gripOne(){if(!this.weapon||this.weapon.two||!root.visible)return;root.updateMatrixWorld(true);this._grip1=this.weapon.cls==='melee'?1:.9;curlFingers(B,'R',this._grip1);},
    // one-handed weapons follow the hand itself: the pistol's barrel runs along the forearm with its top on the index-finger side,
    // the blade leaves the top of the fist
    updateWeapon(aim,face){weaponG.visible=root.visible&&!!this.weapon;if(!this.weapon||!B.WristR)return;if(this.weapon.two&&this._posed){this._posed=false;return;}root.updateMatrixWorld(true);
      const hb=k=>rider&&rider.T(k)?rider.T(k):B[k],wrist=hb('WristR').getWorldPosition(_wp),elbow=hb('LowerArmR').getWorldPosition(_we),fore=_wd.subVectors(wrist,elbow).normalize();
      const iB=hb('Index1R'),pB=hb('Pinky1R'),across=_wt.set(0,1,0);let palm=_wa.copy(wrist).addScaledVector(fore,.06);
      if(iB&&pB){const ip=iB.getWorldPosition(_wb),pp=pB.getWorldPosition(_wc);across.subVectors(ip,pp).normalize();palm.copy(ip).add(pp).multiplyScalar(.5).lerp(wrist,.35);}
      let z,y;if(this.weapon.cls==='melee'){z=_wz.copy(across).addScaledVector(fore,.35).normalize();y=_wy.copy(fore);}
      else{z=_wz.copy(fore);if(aim>0)z.lerp(_hf.set(Math.sin(face),0,Math.cos(face)),aim).normalize();y=_wy.copy(across);}
      y.addScaledVector(z,-y.dot(z));if(y.lengthSq()<1e-4)y.set(0,1,0).addScaledVector(z,-z.y);y.normalize();_hm.makeBasis(_he.crossVectors(y,z),y,z);
      weaponG.position.copy(palm);weaponG.quaternion.setFromRotationMatrix(_hm);weaponG.scale.setScalar(root.scale.x);},
    dispose(){scene.remove(weaponG);scene.remove(fpLeft);}};
  return av;
}

/* ---------- people: townspeople built from outfit parts, robots and VESTA's hologram ---------- */
const QT_OUT={m:['Worker','Casual_2','Casual_Hoodie','Farmer','Punk','Suit','Beach'],f:['Worker','Casual','Formal','Punk','Suit']};
const QT_FACES={m:['Casual_2_Head','Casual_Hoodie_Head','Adventurer_Head','Suit_Head','Punk_Head','Beach_Head','Farmer_Head','Worker_Head'],f:['Casual_Head','Formal_Head','Adventurer_Head','Suit_Head','Punk_Head','Medieval_Head','Worker_Head']};
// [sex, outfit, head (file:part or bare name), extras]
const QT_NPC={okafor:['m','Worker','men:Swat_Head'],ines:['f','Casual','Casual_Head'],vey:['f','Formal','Formal_Head'],tamsin:['f','Worker','Punk_Head'],halden:['m','Suit','Suit_Head'],bo:['m','Casual_2','Adventurer_Head'],kit:['f','Casual','Casual_Head'],
  marisol:['f','Casual','Medieval_Head'],jory:['m','Farmer','Farmer_Head'],yusuf:['m','Worker','men:Swat_Head'],lena:['f','Worker','Worker_Head'],pell:['m','Farmer','Farmer_Head'],
  oduya:['m','Worker','Worker_Head'],sable:['f','Punk','Punk_Head'],amaru:['m','Suit','Casual_2_Head'],nell:['f','Worker','women:Soldier_Head'],vik:['m','Casual_Hoodie','Casual_Hoodie_Head'],
  varga:['f','Formal','Formal_Head'],pavo:['m','Worker','Casual_2_Head'],siku:['m','Casual_Hoodie','Adventurer_Head'],hale:['m','Casual_2','Casual_2_Head'],
  ostrander:['m','Suit','Suit_Head'],sato:['f','Worker','Casual_Head'],arn:['f','Suit','Suit_Head'],dax:['m','Punk','Punk_Head'],oriel:['f','Formal','Medieval_Head','halo'],prin:['f','Worker','women:Soldier_Head'],hollis:['m','Casual_2','Adventurer_Head'],feng:['f','Formal','Formal_Head'],rook:['m','Worker','Worker_Head'],pip:['f','Casual','Punk_Head'],
  maru:['f','Formal','Medieval_Head'],tavi:['m','Beach','Beach_Head'],ona:['f','Casual','Adventurer_Head'],kesh:['m','Farmer','Adventurer_Head'],tem:['m','Suit','Adventurer_Head','halo'],ryn:['m','Worker','men:Swat_Head'],oriel2:['f','Formal','Medieval_Head','halo']};
/* ---------- the supplied townspeople and robots ---------- */
// Main characters wear the original models; everyone else, and the crowds, wear recoloured copies. Colour changes rotate
// the hue of clothing (or a robot's paint) in the shader, keeping skin, eyes and teeth, so repeats don't read as clones.
const NPC_RIG={npc_r1:MIXAMO_MAP,npc_r3:ROBOT3_MAP},NPC_CLIP={npc_r2:1,npc_r4:1},NPC_F=['npc_f1','npc_f2','npc_f3','npc_f5','npc_f6','npc_f7'],NPC_M=['npc_m1','npc_m2','npc_m3','npc_m4','npc_m5','npc_m6','npc_m7','npc_m8'];
const NPC_LOOKS=(()=>{const L={},orig={vey:'npc_f1',ines:'npc_f2',tamsin:'npc_f3',marisol:'npc_f5',varga:'npc_f6',oriel:'npc_f7',oriel2:'npc_f7',
    okafor:'npc_m3',ostrander:'npc_m2',halden:'npc_m1',bo:'npc_m4',oduya:'npc_m5',amaru:'npc_m8',clank:'npc_r4',index:'npc_r2',lumo:'npc_r1',vonn:'npc_r3'};
  for(const k in orig)L[k]={mdl:orig[k]};
  // minor characters who are now robots
  Object.assign(L,{yusuf:{mdl:'npc_r3',hue:2.4},rook:{mdl:'npc_r1',hue:3.6},prin:{mdl:'npc_r4',hue:2.1},sato:{mdl:'npc_r2',hue:1.4}});
  const rest={f:['lena','sable','nell','arn','feng','maru','ona','kit','pip'],m:['jory','pell','vik','pavo','siku','hale','dax','hollis','tavi','kesh','tem','ryn']};
  for(const g of['f','m']){const pool=g==='f'?NPC_F:NPC_M.filter(m=>m!=='npc_m6');rest[g].forEach((id,i)=>{L[id]={mdl:pool[(i*3+1)%pool.length],hue:1.1+i*1.37,sat:.9+(i%3)*.15,val:.92+(i%2)*.1,scale:id==='kit'||id==='pip'?.72:1};});}
  return L;})();
// a crowd member: any human model, recoloured well away from its original
function npcCrowdLook(sex,r=Math.random){const pool=sex==='f'?NPC_F:NPC_M;return {mdl:pool[Math.floor(r()*pool.length)],hue:.9+r()*4.4,sat:.8+r()*.4,val:.85+r()*.2};}
const _hy=[[.299,.587,.114],[.596,-.274,-.322],[.211,-.523,.312]],_hi=[[1,.956,.621],[1,-.272,-.647],[1,-1.106,1.703]];
function hueMatrix(h,s,v){const c=Math.cos(h)*s,sn=Math.sin(h)*s,R=[[1,0,0],[0,c,-sn],[0,sn,c]],mul=(A,B)=>A.map(r=>B[0].map((_,j)=>r.reduce((a,x,k)=>a+x*B[k][j],0)));
  const M=mul(_hi,mul(R,_hy)).map(r=>r.map(x=>x*v));return new THREE.Matrix3().set(...M[0],...M[1],...M[2]);}
function hueFx(m,h,s=1,v=1){if(!h&&s===1&&v===1)return;const M=hueMatrix(h,s,v);m.customProgramCacheKey=()=>'huefx';
  m.onBeforeCompile=sh=>{sh.uniforms.uHueM={value:M};sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform mat3 uHueM;').replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=max(uHueM*diffuseColor.rgb,0.);');};m.needsUpdate=true;}
// Recolour the textured operative and soldier by region, so each colour choice lands where its name says. Every texel is sorted by
// its own colour (bright plates, dark under-suit, mid-grey trim and joints, saturated glow lines) and takes the chosen colour for
// that region, keeping the texture's own shading as detail. Tiny highlights are left as painted.
const BT_GLSL={
  soldier:`float wG=smoothstep(.28,.42,mx-mn)*smoothstep(.45,.6,mx),wA=smoothstep(.4,.52,tl)*(1.-wG),wS=(1.-smoothstep(.15,.24,tl))*(1.-wG),wT=max(0.,1.-wG-wA-wS);
    float dA=tl/.72,dS=tl/.1,dT=tl/.3,wK=0.;`,
  prota:`float dk=1.-smoothstep(.25,.29,tl),bl=smoothstep(.022,.042,br),wK=smoothstep(.6,.66,tl),wG=0.,wS=dk*bl,wT=dk*(1.-bl),wA=(1.-dk)*(1.-wK);
    float dA=tl/.37,dS=tl/.18,dT=tl/.2;`};
function bodyTint(m,kind,C){const U={uBtS:{value:lin(C.suit)},uBtA:{value:lin(C.armor)},uBtT:{value:lin(C.trim)},uBtG:{value:lin(C.accent)}};m.color.setRGB(1,1,1);
  m.customProgramCacheKey=()=>'bt-'+kind;
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uBtS,uBtA,uBtT,uBtG;')
    .replace('#include <map_fragment>',`#include <map_fragment>
    vec3 tS=pow(max(diffuseColor.rgb,vec3(0.)),vec3(1./2.2));float tl=dot(tS,vec3(1./3.)),br=tS.b-tS.r,mx=max(tS.r,max(tS.g,tS.b)),mn=min(tS.r,min(tS.g,tS.b));
    ${BT_GLSL[kind]}
    #define BTD(d) pow(clamp(d,.45,1.7),2.2)
    vec3 btC=uBtS*wS*BTD(dS)+uBtA*wA*BTD(dA)+uBtT*wT*BTD(dT)+uBtG*wG*.7+diffuseColor.rgb*wK;
    diffuseColor.rgb=btC/max(wS+wA+wT+wG+wK,1e-3);`)
    .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uBtG*wG*1.6;');};m.needsUpdate=true;}
const NPC_KEEP=/Body|Skin|Eye|Teeth/i;
function npcPaint(m,nm,robot){m.envMap=protaEnv();m.envMapIntensity=robot?.9:.4;if(robot||!NPC_KEEP.test(m.name||''))hueFx(m,(nm.hue||0)*(/Hair|Beard/i.test(m.name||'')?.25:1),nm.sat||1,nm.val||1);}
// the hovering drone and the boxy walker play their own clips through a small stand-in for the animator
function clipRobot(nm,spec){const M=MODELS[nm.mdl],root=new THREE.Group(),fit=new THREE.Group(),o=THREE.SkeletonUtils.clone(M.scene);root.add(fit);fit.add(o);
  o.traverse(x=>{if(x.isMesh){x.castShadow=true;x.frustumCulled=false;const mt=x.material=x.material.clone();npcPaint(mt,nm,true);
    // the drone's thruster flame keeps its glow but stays below white; its paint isn't self-lit
    if(mt.emissive&&/fire/i.test(mt.name||'')){mt.emissiveIntensity=Math.min(mt.emissiveIntensity,.7);mt.userData.noGlow=true;}}});
  let bb0=skinBox(o,root);if(bb0.isEmpty()){root.updateMatrixWorld(true);bb0=new THREE.Box3().setFromObject(o);}// rigid-part robots have no skinned mesh
  const drone=nm.mdl==='npc_r2',bb=bb0,sz=bb.getSize(new THREE.Vector3()),k=(drone?1.3/Math.max(sz.x,sz.y,sz.z):1.35/sz.y)*(spec.scale||1),c=bb.getCenter(new THREE.Vector3());
  fit.scale.setScalar(k);fit.position.set(-c.x*k,drone?1.25-c.y*k:-bb.min.y*k,-c.z*k);const y0=fit.position.y;
  const mixer=new THREE.AnimationMixer(o),A={};for(const cl of M.animations){A[cl.name]=mixer.clipAction(cl);}const walk=A.Walk||A['Take 001']||Object.values(A)[0],jump=A['small Jump'];if(walk)walk.play();
  let dead=false,fall=0,jt=0,t=Math.random()*9;
  const anim={a:{},update(dt,speed){t+=dt;if(dead){fall=Math.min(1,fall+dt*2.5);fit.rotation.x=fall*1.35;fit.position.y=y0-(drone?fall*1.05:fall*.25);return;}
      if(drone){if(walk)walk.timeScale=1;fit.position.y=y0+Math.sin(t*2)*.08;fit.rotation.x=Math.min(.3,(speed||0)*.08);}
      else if(walk){if(jt>0){jt-=dt;}else{walk.timeScale=speed>.3?Math.min(1.6,speed/1.1):0;if(speed<=.3){walk.time=0;}fit.position.y=y0+(speed>.3?0:Math.sin(t*1.6)*.01);}}
      mixer.update(dt);},
    oneShot(){if(jump&&!dead){jump.reset().setLoop(THREE.LoopOnce,1).play();jt=jump.getClip().duration;}return true;},
    die(){dead=true;},revive(){dead=false;fall=0;fit.rotation.x=0;fit.position.y=y0;}};
  return {root,model:o,anim,B:{}};}
function buildPerson(spec){
  const nm=spec.npcModel||(spec.id&&NPC_LOOKS[spec.id]);
  if(nm&&MODELS[nm.mdl]){if(NPC_CLIP[nm.mdl])return clipRobot(nm,spec);
    // people and humanoid robots: the townsperson rig stays as an unseen driver and the new model copies its pose
    const sex=/npc_f/.test(nm.mdl)?'f':'m',P=buildPerson(Object.assign({},spec,{npcModel:null,id:null,body:'soldier',qt:spec.qt||(spec.id&&QT_NPC[spec.id])||[sex,sex==='f'?'Casual':'Casual_2',sex==='f'?'Casual_Head':'Casual_2_Head'],scale:spec.scale||nm.scale||1}));
    if(P.model){const rb=buildRiderBody(P.root,P.model,{id:nm.mdl,map:NPC_RIG[nm.mdl]||RPM_MAP,paint:m=>npcPaint(m,nm,!!NPC_RIG[nm.mdl])});
      if(rb){P.model.traverse(o=>{if(o.isMesh)o.visible=false;});P.rider=rb;
        // a carried gun: robots don't carry one; people hold it in the visible body's hand
        if(P.held){if(NPC_RIG[nm.mdl]){P.root.remove(P.held.g);P.held=null;P.updateHeld=()=>{};}
          else{const h=P.held,hw=rb.T('WristR'),he=rb.T('LowerArmR');P.updateHeld=(aim,face)=>{if(!hw||!he)return;P.root.updateMatrixWorld(true);hw.getWorldPosition(_wp);he.getWorldPosition(_we);_wd.subVectors(_wp,_we).normalize();
            if(aim>0){_wt.set(Math.sin(face),0,Math.cos(face));_wd.lerp(_wt,aim).normalize();}P.root.worldToLocal(_wt.copy(_wp).addScaledVector(_wd,.06));h.g.position.copy(_wt);P.root.worldToLocal(_we.copy(_wp).addScaledVector(_wd,1.06));h.g.lookAt(P.root.localToWorld(_we.clone()));};}}}}
    return P;}
  const body=spec.body||'soldier',root=new THREE.Group();
  if(body==='robot'){const model=cloneModel('robot');if(!model){root.add(new THREE.Mesh(cyl(.3,.3,1.8,12),MAT.hull));return {root,anim:null,B:{}};}
    model.scale.setScalar(.42*(spec.scale||1));root.add(model);
    model.traverse(o=>{if(o.isMesh&&o.material){const m=o.material,n=(m.name||'').toLowerCase();if(n==='main'&&spec.tint)m.color.set(spec.tint);if(n==='grey'&&spec.tint2)m.color.set(spec.tint2);m.metalness=.45;m.roughness=.45;}});
    const anim=new Animator(model,'robot');return {root,model,anim,B:anim.B};}
  const q=spec.qt||(spec.id&&QT_NPC[spec.id])||null,r=spec.rand||Math.random;
  const sex=q?q[0]:body==='michelle'?'f':'m',file=sex==='f'?'women':'men';
  const outfit=q?q[1]:pick(QT_OUT[sex],r);let headSpec=q?q[2]:pick(QT_FACES[sex],r);
  let hf=file,hn=headSpec;if(headSpec.includes(':'))[hf,hn]=headSpec.split(':');
  const holo=body==='xbot';
  const parts=holo?['SpaceSuit_Body','SpaceSuit_Legs','SpaceSuit_Feet','SpaceSuit_Head']:[outfit+'_Body',outfit+'_Legs',outfit+'_Feet'].concat(hf===file?[hn]:[]);
  const model=cloneParts(holo?'suit':file,parts);if(!model){root.add(new THREE.Mesh(cyl(.3,.3,1.8,12),MAT.hull));return {root,anim:null,B:{}};}
  if(!holo&&hf!==file){const p=cloneParts(hf,[hn]);if(p)graft(model,p);}
  root.add(model);model.scale.setScalar(spec.scale||1);
  if(holo){const col=new THREE.Color(spec.tint||0x6ff2d6);const hm=new THREE.MeshStandardMaterial({color:0x000000,emissive:0x000000,transparent:true,depthWrite:false,roughness:1,skinning:true});// skinning: the body follows the skeleton (without it, a frozen T-pose)
    hm.userData.uG={value:0};// malfunction: 0 = clean, 1 = torn bands and red error tint
    hm.onBeforeCompile=sh=>{sh.uniforms.uHoloC={value:col};sh.uniforms.uHoloT=SFX_TIME;sh.uniforms.uGlitch=hm.userData.uG;sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uHoloC;uniform float uHoloT;uniform float uGlitch;')
      .replace('#include <dithering_fragment>',`#include <dithering_fragment>
      float hf=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),2.2);
      float hs=.72+.28*sin(gl_FragCoord.y*.9-uHoloT*7.);float band=smoothstep(.0,.02,abs(fract(uHoloT*.18-gl_FragCoord.y*.0015)-.5)-.47);
      vec3 hc=uHoloC;if(uGlitch>0.){float gy=floor(gl_FragCoord.y/(5.+26.*fract(floor(uHoloT*9.)*.37)));float gn=fract(sin(gy*91.7+floor(uHoloT*13.)*13.1)*43758.5453);
        if(gn<.42*uGlitch)discard;hc=mix(hc,vec3(1.,.28,.16),uGlitch*step(.55,gn));hs*=1.+uGlitch*step(.86,gn)*1.4;}
      gl_FragColor=vec4(hc*(.55+hf*.9+band*.3)*hs,(.5+hf*.45+band*.15)*hs);`);};
    hm.customProgramCacheKey=()=>'holo';model.traverse(o=>{if(o.isMesh){o.material=hm;o.renderOrder=3;}});}
  else{// keep each outfit's own colors; nudge clothing toward the person's tint so neighbors differ
    const tint=spec.tint!=null?lin(spec.tint):null,hair=spec.hair!=null?lin(spec.hair):null;
    model.traverse(o=>{if(!o.isMesh)return;const m=o.material,n=m.name||'';if(/hair|eyebrow/i.test(n)&&hair)m.color.copy(hair);else if(tint&&!SKIP_TINT.test(n))m.color.lerp(tint,spec.tintAmt??.3);m.roughness=Math.max(m.roughness,.6);});}
  const anim=new Animator(model,'q'),B=anim.B;
  if((q&&q[3]==='halo')||spec.halo){model.updateMatrixWorld(true);const g=new THREE.Group();bindToBone(model,B.Head,g,new THREE.Vector3(0,.42,-.02));const ring=new THREE.Mesh(tor(.19,.012,8,48),new THREE.MeshStandardMaterial({color:0x8fffe0,emissive:0x8fffe0,emissiveIntensity:1}));ring.rotation.x=Math.PI/2-.25;g.add(ring);}
  let held=null;if(spec.held==='rifle'||spec.held==='pistol'){held=buildWeaponModel(spec.held==='rifle'?{cls:'rifle',model:'cohort'}:{cls:'sidearm',model:'service'});root.add(held.g);}
  return {root,model,anim,B,held,
    updateHeld(aim,face){if(!held||!B.WristR)return;root.updateMatrixWorld(true);B.WristR.getWorldPosition(_wp);B.LowerArmR.getWorldPosition(_we);_wd.subVectors(_wp,_we).normalize();if(aim>0){_wt.set(Math.sin(face),0,Math.cos(face));_wd.lerp(_wt,aim).normalize();}
      root.worldToLocal(_wt.copy(_wp).addScaledVector(_wd,.06));held.g.position.copy(_wt);root.worldToLocal(_we.copy(_wp).addScaledVector(_wd,1.06));held.g.lookAt(root.localToWorld(_we.clone()));}};
}

// ===== 10_items.js =====
/* ================= ITEMS ================= */
const RAR=[{id:'common',name:'Common',mult:1,slots:0,w:60,col:0xd8d2e4},{id:'uncommon',name:'Uncommon',mult:1.14,slots:1,w:26,col:0x7fe08a},{id:'rare',name:'Rare',mult:1.3,slots:1,w:10,col:0x5ab4ff},{id:'epic',name:'Epic',mult:1.5,slots:2,w:3.4,col:0xc58cff},{id:'legendary',name:'Legendary',mult:1.75,slots:2,w:.6,col:0xffa94a}];
const CLS={sidearm:'Sidearm',rifle:'Rifle',scatter:'Scattergun',beam:'Beam',launcher:'Launcher',melee:'Melee'};
// weapons: dmg per hit, rate per second, energy per shot (per second for beams), range in meters, speed of projectile
const WEAPONS={
  vs9:{name:'VS-9 Survival Pistol',cls:'sidearm',model:'survival',tier:1,dmg:12,rate:3,energy:6,range:30,speed:62,spread:.02,col:0x6ff2d6,desc:'Emergency sidearm from the Vesper\'s survival case. Reliable and forgiving.'},
  service:{name:'Halcyon Service Sidearm',cls:'sidearm',model:'service',tier:2,dmg:15,rate:3.2,energy:6,range:32,speed:66,spread:.018,col:0x8fd8ff,desc:'Standard issue for Halcyon Lines crews. Clean lines, clean shots.'},
  hammer:{name:'Kiln Hammer',cls:'sidearm',model:'hammer',tier:2,dmg:28,rate:1.5,energy:11,range:30,speed:58,spread:.012,col:0xffa94a,knock:1.4,desc:'A mining-camp revolver that throws overcharged slugs. Slow, heavy, satisfying.'},
  needler:{name:'Choir Needler',cls:'sidearm',model:'needler',tier:3,dmg:9,rate:7,energy:3,range:28,speed:80,spread:.04,col:0xc58cff,shock:.12,desc:'Fires crystal needles that sometimes jolt targets with stored charge.'},
  prerogative:{name:'Director\'s Prerogative',cls:'sidearm',model:'service',tier:5,dmg:44,rate:3.4,energy:7,range:36,speed:84,spread:.01,col:0xffd86a,unique:true,crit:.25,desc:'Imre Vash\'s personal sidearm. Gold-chased, absurdly expensive, and very accurate.'},
  carbine:{name:'Meridian Carbine',cls:'rifle',model:'carbine',tier:1,dmg:8,rate:7,energy:3.5,range:45,speed:88,spread:.03,col:0x6ff2d6,auto:true,desc:'The colony militia rifle. Fully automatic and easy to keep running.'},
  cohort:{name:'Cohort AR-4',cls:'rifle',model:'cohort',tier:3,dmg:12,rate:8,energy:3.8,range:48,speed:95,spread:.028,col:0xff6a5a,auto:true,desc:'Gray Cohort battle rifle. Brutal, efficient, and stamped with a wolf\'s head.'},
  longwatch:{name:'Longwatch Marksman',cls:'rifle',model:'longwatch',tier:3,dmg:48,rate:1.1,energy:14,range:80,speed:150,spread:.003,col:0x8fd8ff,crit:.22,desc:'A ranger\'s marksman rifle. One careful shot at a time.'},
  tidecaller:{name:'Tidecaller',cls:'rifle',model:'tide',tier:4,dmg:16,rate:6,energy:4,range:50,speed:100,spread:.024,col:0x4ae0ff,auto:true,freeze:.12,desc:'Reedwater hunters build these around a cold-core coil. Hits can freeze targets solid.'},
  arklance:{name:'Ark Lance',cls:'rifle',model:'lance',tier:5,dmg:30,rate:4,energy:6,range:60,speed:130,spread:.012,col:0xb98cff,auto:true,chain:2,unique:true,desc:'Builder-glass rifle. Its bolts leap between targets.'},
  breaker:{name:'Breaker Scattergun',cls:'scatter',model:'breaker',tier:1,dmg:7,pellets:7,rate:1.25,energy:13,range:14,speed:60,spread:.14,col:0xffc35a,desc:'Short-range scattergun for clearing skitter nests.'},
  sweeper:{name:'Dune Sweeper',cls:'scatter',model:'sweeper',tier:2,dmg:8,pellets:8,rate:1.4,energy:13,range:15,speed:60,spread:.13,col:0xff8a4c,burn:.15,desc:'Kiln Hollow special. Incendiary pellets that set things alight.'},
  riot:{name:'Cohort Riot Gun',cls:'scatter',model:'riot',tier:3,dmg:11,pellets:8,rate:1.2,energy:15,range:16,speed:65,spread:.12,col:0xff6a5a,knock:2.4,desc:'Knocks targets back hard. Designed for corridors.'},
  maw:{name:'Cinder Maw',cls:'scatter',model:'sweeper',tier:5,dmg:16,pellets:10,rate:1.5,energy:15,range:17,speed:70,spread:.12,col:0xff5a1a,burn:.35,unique:true,desc:'Forged in Ashfall\'s vents. Everything it touches burns.'},
  cutter:{name:'Mining Cutter',cls:'beam',model:'cutter',tier:1,dmg:20,rate:10,energy:15,range:18,col:0xffa94a,desc:'An industrial cutting beam. Continuous damage while you hold the trigger.'},
  lumen:{name:'Choir Lumen',cls:'beam',model:'lumen',tier:3,dmg:30,rate:10,energy:16,range:22,col:0xc58cff,desc:'A ceremonial beam the Choir uses to light relic chambers. And to defend them.'},
  prism:{name:'Prism Lance',cls:'beam',model:'prism',tier:5,dmg:46,rate:10,energy:17,range:26,col:0x8fffe0,chain:1,unique:true,desc:'Splits its beam to a second target.'},
  thumper:{name:'Thumper GL',cls:'launcher',model:'thumper',tier:2,dmg:55,rate:.8,energy:26,range:28,speed:24,splash:3.6,col:0xffc35a,desc:'Lobs charge canisters that burst on impact.'},
  starfall:{name:'Starfall Launcher',cls:'launcher',model:'starfall',tier:4,dmg:90,rate:.7,energy:30,range:32,speed:28,splash:4.2,col:0xff6a5a,burn:.4,desc:'Military grade. Leaves the ground glowing.'},
  baton:{name:'Shock Baton',cls:'melee',model:'baton',tier:1,dmg:20,rate:1.8,energy:0,range:2.8,col:0x8fd8ff,shock:.2,desc:'Security baton. Quiet, close and dependable.'},
  machete:{name:'Plasma Machete',cls:'melee',model:'machete',tier:2,dmg:34,rate:1.6,energy:0,range:3,col:0xff8a4c,burn:.2,desc:'A jungle-clearing blade with a superheated edge.'},
  edge:{name:'Builder\'s Edge',cls:'melee',model:'edge',tier:5,dmg:80,rate:1.7,energy:0,range:3.4,col:0x8fffe0,chain:1,unique:true,desc:'A blade of living glass recovered from the Ark.'},
};
// gear: armor reduces damage, cold/heat widen the safe temperature range
const GEAR={
  h_scuffed:{name:'Scuffed Flight Helmet',slot:'helmet',tier:1,armor:2,cold:2,heat:2,look:'pilot',desc:'Your helmet from the crash. Cracked visor, working seals.'},
  h_surveyor:{name:'Surveyor Helm',slot:'helmet',tier:1,armor:4,cold:4,heat:4,look:'dome',desc:'Standard Meridian field helmet.'},
  h_pathfinder:{name:'Pathfinder Visor',slot:'helmet',tier:2,armor:4,scan:30,cold:5,heat:5,look:'scout',desc:'Monocle scanner shows enemies at longer range.'},
  h_frost:{name:'Frostguard Helm',slot:'helmet',tier:2,armor:6,cold:14,heat:0,look:'rebreather',desc:'Cold Harbor issue. Breath-warmed filters.'},
  h_sunshade:{name:'Sunshade Mask',slot:'helmet',tier:2,armor:5,cold:0,heat:14,look:'hood',desc:'Kiln Hollow sun hood with a cooling mask.'},
  h_siege:{name:'Siege Helm',slot:'helmet',tier:3,armor:12,cold:6,heat:6,look:'heavy',desc:'Cohort assault helmet. Heavy and nearly bulletproof.'},
  h_choir:{name:'Choir Circlet',slot:'helmet',tier:4,armor:6,regen:2,cold:8,heat:8,look:'halo',desc:'A resonance halo. Your suit\'s energy recovers faster.'},
  h_crest:{name:'Ancient Crest',slot:'helmet',tier:5,armor:14,cold:14,heat:14,regen:1,look:'crest',unique:true,desc:'Builder glass shaped to a human head. It hums when the signal is near.'},
  s_vesper:{name:'Vesper Flight Suit',slot:'suit',tier:1,armor:4,hp:0,cold:6,heat:6,look:'pilot',desc:'Halcyon Lines pilot suit. Scorched but sealed.'},
  s_colonist:{name:'Colonist Work Suit',slot:'suit',tier:1,armor:6,hp:10,cold:8,heat:8,look:'engineer',desc:'Tough coveralls with plenty of pockets.'},
  s_eva:{name:'EVA Hardsuit',slot:'suit',tier:2,armor:10,hp:20,cold:12,heat:12,look:'eva',desc:'Full pressure suit with armored plating.'},
  s_thermal:{name:'Thermal Hardsuit',slot:'suit',tier:2,armor:8,hp:10,cold:26,heat:6,look:'explorer',desc:'Insulated in layers for the nightward plains.'},
  s_heatweave:{name:'Heat-weave Suit',slot:'suit',tier:2,armor:8,hp:10,cold:6,heat:26,look:'ranger',desc:'Reflective weave and a coolant mesh for the dayward flats.'},
  s_cohort:{name:'Cohort Plate',slot:'suit',tier:3,armor:18,hp:30,cold:12,heat:12,speed:-.04,look:'heavy',desc:'Mercenary battle armor. Slows you a little.'},
  s_reed:{name:'Reedwoven Coat',slot:'suit',tier:4,armor:12,hp:25,cold:16,heat:16,hpRegen:1.5,look:'explorer',desc:'Calder fiber that slowly knits your wounds.'},
  s_builder:{name:'Builder Shell',slot:'suit',tier:5,armor:24,hp:60,cold:30,heat:30,look:'vanguard',unique:true,desc:'Armor grown, not made. It fits like it was waiting for you.'},
  b_standard:{name:'Standard Boots',slot:'boots',tier:1,armor:1,speed:0,cold:2,heat:2,desc:'Mag-soled flight boots.'},
  b_grip:{name:'Grip Boots',slot:'boots',tier:1,armor:2,speed:.08,climb:.35,cold:3,heat:3,desc:'Climb steeper slopes, run a little faster.'},
  b_strider:{name:'Strider Boots',slot:'boots',tier:3,armor:3,speed:.18,climb:.5,cold:4,heat:4,desc:'Long-stride servos. Much faster on open ground.'},
  b_dune:{name:'Dunewalker Treads',slot:'boots',tier:2,armor:3,speed:.08,heat:10,cold:0,desc:'Ventilated soles for scorching sand.'},
  b_ice:{name:'Icebreaker Cleats',slot:'boots',tier:2,armor:3,speed:.05,cold:10,heat:0,desc:'Heated cleats that bite into ice.'},
  b_springer:{name:'Springer Boots',slot:'boots',tier:3,armor:3,speed:.1,jump:.35,cold:4,heat:4,desc:'Compressed-gas heels for higher jumps.'},
  p_basic:{name:'Survival Pack',slot:'pack',tier:1,en:0,cold:1,heat:1,look:'compact',desc:'Emergency air and a water bladder.'},
  p_battery:{name:'Battery Pack',slot:'pack',tier:2,en:30,regen:2,look:'tanks',desc:'Extra energy for your weapons.'},
  p_shield:{name:'Aegis Projector',slot:'pack',tier:3,shield:40,look:'rig',desc:'Projects a shield that absorbs damage, then recharges.'},
  p_medic:{name:'Field Medic Pack',slot:'pack',tier:2,hpRegen:2.2,look:'cargo',desc:'Slowly treats your wounds while you move.'},
  p_jump:{name:'Thruster Pack',slot:'pack',tier:3,jump:.55,speed:.04,look:'jets',desc:'Small thrusters for much higher jumps.'},
  p_choir:{name:'Resonance Reliquary',slot:'pack',tier:5,en:40,shield:40,regen:3,look:'rig',unique:true,desc:'A Choir reliquary that feeds on the signal itself.'},
};
const MODS={
  coil:{name:'Overclocked Coil',for:'weapon',desc:'+15% damage',dmg:.15},
  stabilizer:{name:'Stabilizer',for:'weapon',desc:'−35% spread, +15% range',spread:-.35,range:.15},
  capacitor:{name:'Efficient Capacitor',for:'weapon',desc:'−25% energy use',energy:-.25},
  scope:{name:'Smart Scope',for:'weapon',desc:'+12% critical chance',crit:.12},
  cryo:{name:'Cryo Core',for:'weapon',desc:'Hits can freeze',freeze:.12},
  thermite:{name:'Thermite Feed',for:'weapon',desc:'Hits can set targets on fire',burn:.15},
  arcrelay:{name:'Arc Relay',for:'weapon',desc:'Hits can chain to a nearby target',chain:1},
  rapid:{name:'Rapid Cycler',for:'weapon',desc:'+15% fire rate',rate:.15},
  insul:{name:'Insulation Weave',for:'gear',desc:'+12 cold protection',cold:12},
  heatsink:{name:'Heat Sink',for:'gear',desc:'+12 heat protection',heat:12},
  plating:{name:'Composite Plating',for:'gear',desc:'+6 armor',armor:6},
  servo:{name:'Servo Assist',for:'gear',desc:'+6% speed',speed:.06},
  cellmod:{name:'Cell Bank',for:'gear',desc:'+20 energy',en:20},
  mender:{name:'Nanite Mender',for:'gear',desc:'+1 health per second',hpRegen:1},
};
const ITEMS={
  // consumables
  medkit:{name:'Medkit',kind:'use',short:'MED',value:18,desc:'Restores 50 health.'},
  trauma:{name:'Trauma Kit',kind:'use',short:'TRAUMA',value:45,desc:'Restores 140 health.'},
  stim:{name:'Adrenal Stim',kind:'use',short:'STIM',value:24,desc:'30% faster movement for 20 seconds.'},
  heatpack:{name:'Heat Pack',kind:'use',short:'HEAT',value:16,desc:'+25 cold protection for 90 seconds. Also melts ice.'},
  coolant:{name:'Coolant Pack',kind:'use',short:'COOL',value:16,desc:'+25 heat protection for 90 seconds.'},
  cell:{name:'Energy Cell',kind:'use',short:'CELL',value:22,desc:'Refills energy and overcharges weapons for 12 seconds: free shots, 30% more damage.'},
  shieldcharge:{name:'Shield Charge',kind:'use',short:'SHLD',value:30,desc:'Projects a 60-point shield for 30 seconds.'},
  grenade:{name:'Arc Grenade',kind:'use',short:'NADE',value:20,desc:'Throws an arc grenade that bursts for 70 damage around the impact.'},
  flare:{name:'Flare',kind:'use',short:'FLARE',value:10,desc:'Creatures within 16 m panic and scatter for 8 seconds.'},
  beacon:{name:'Scanner Beacon',kind:'use',short:'SCAN',value:28,desc:'For 90 seconds, reveals resources, buried caches and hidden glyphs nearby.'},
  ration:{name:'Ration Pack',kind:'use',short:'FOOD',value:6,desc:'Restores 20 health over 10 seconds.'},
  // materials
  scrap:{name:'Scrap Metal',kind:'mat',value:2,desc:'Salvage from wrecks and machines. Used in almost every upgrade.'},
  alloy:{name:'Alloy Plate',kind:'mat',value:6,desc:'Refined structural alloy. Mid-tier upgrades.'},
  wiring:{name:'Wiring Bundle',kind:'mat',value:4,desc:'Salvaged circuitry and cable.'},
  powercell:{name:'Power Cell',kind:'mat',value:9,desc:'Dense energy storage. Used for weapon upgrades.'},
  shard:{name:'Crystal Shard',kind:'mat',value:8,desc:'Charge-holding crystal from Ossery b\'s spires.'},
  glowcap:{name:'Glowcap',kind:'mat',value:4,desc:'Medicinal bioluminescent fungus.'},
  chitin:{name:'Skitter Chitin',kind:'mat',value:5,desc:'Light, tough shell plate.'},
  frostchitin:{name:'Frost Chitin',kind:'mat',value:9,desc:'Pale shell from the nightward skitters. Excellent insulation.'},
  resin:{name:'Reed Resin',kind:'mat',value:7,desc:'Calder\'s amber sap. Hardens into tough composite.'},
  pearl:{name:'Lumen Pearl',kind:'mat',value:14,desc:'Glowing pearls from Calder\'s shallows. Prized by traders.'},
  slag:{name:'Volcanic Slag Ore',kind:'mat',value:11,desc:'Ashfall ore laced with rare metals.'},
  glass:{name:'Builder Glass',kind:'mat',value:30,desc:'Fragments of the Builders\' living glass. Top-tier upgrades.'},
  polymer:{name:'Polymer Sheet',kind:'mat',value:5,desc:'Flexible synthetic. Used for suit upgrades.'},
  datachip:{name:'Data Chip',kind:'mat',value:12,desc:'An encrypted override key. Opens locked caches, and workbenches use it to make mods. Ines in Meridian and Sable in Kiln Hollow sell them; robots, elites and strongboxes sometimes carry them.'},
  // junk, for selling
  j_datapad:{name:'Cracked Datapad',kind:'junk',value:14,desc:'Someone\'s diary, mostly corrupted.'},
  j_visor:{name:'Broken Visor',kind:'junk',value:9,desc:'A shattered helmet visor.'},
  j_ore:{name:'Ore Sample',kind:'junk',value:12,desc:'A labeled sample bag. The label is smudged.'},
  j_fossil:{name:'Fossil Shell',kind:'junk',value:22,desc:'A spiral shell from a sea that dried up a million years ago.'},
  j_figurine:{name:'Carved Figurine',kind:'junk',value:26,desc:'A tiny skitter carved from glowcap wood.'},
  j_medal:{name:'Service Medal',kind:'junk',value:30,desc:'Halcyon Lines, ten years of service.'},
  j_bottle:{name:'Vintage Bottle',kind:'junk',value:40,desc:'Something amber and very old. Bo would pay for this.'},
  j_cube:{name:'Music Cube',kind:'junk',value:18,desc:'Plays a song when warm. You don\'t recognize it.'},
  j_compass:{name:'Old Compass',kind:'junk',value:16,desc:'Points to a magnetic north that Ossery b doesn\'t have.'},
  j_lens:{name:'Optic Lens',kind:'junk',value:20,desc:'High-grade optical glass.'},
  j_toy:{name:'Wind-up Toy',kind:'junk',value:8,desc:'A little tin robot. It still walks.'},
  j_gem:{name:'Raw Gemstone',kind:'junk',value:55,desc:'Uncut, bright and valuable.'},
  j_idol:{name:'Builder Idol',kind:'junk',value:80,desc:'A small figure of black glass. Collectors pay a fortune.'},
  j_watch:{name:'Chronometer',kind:'junk',value:34,desc:'An expensive watch, stopped at 11:12.'},
  j_tin:{name:'Spice Tin',kind:'junk',value:12,desc:'Reedwater spices. Smells wonderful.'},
};
const KEYS={}; // quest items are registered by the quest files
const isStack=id=>!!ITEMS[id]||!!KEYS[id]||!!MODS[id];
function itemDef(it){const id=typeof it==='string'?it:it.id;return WEAPONS[id]||GEAR[id]||ITEMS[id]||KEYS[id]||(MODS[id]?Object.assign({kind:'mod',value:40},MODS[id]):null);}
function itemKind(it){const id=typeof it==='string'?it:it.id;if(WEAPONS[id])return 'weapon';if(GEAR[id])return 'gear';if(MODS[id])return 'mod';if(KEYS[id])return 'key';return (ITEMS[id]||{}).kind||'junk';}
let UID=Date.now()%100000;
function makeItem(id,o={}){const k=itemKind(id);const it={u:++UID,id};if(k==='weapon'||k==='gear'){const d=itemDef(id);it.r=o.r!==undefined?o.r:(d.unique?4:0);it.lv=o.lv||Math.max(1,(d.tier-1)*5+1);it.up=o.up||0;it.mods=o.mods||[];}else it.q=o.q||1;return it;}
function itemName(it){const d=itemDef(it);if(!d)return '?';return d.name+(it.up?` +${it.up}`:'');}
function rarOf(it){return RAR[it.r||0];}
// final stats after level, rarity, upgrades and mods
function weaponStats(it){const d=WEAPONS[it.id];if(!d)return null;const R=rarOf(it),lvM=1+(it.lv-1)*.085,upM=1+it.up*.1,M={dmg:0,rate:0,energy:0,spread:0,range:0,crit:0,freeze:0,burn:0,chain:0,shock:0};
  for(const m of it.mods||[]){const md=MODS[m];if(!md)continue;for(const k in M)if(md[k])M[k]+=md[k];}
  return {cls:d.cls,dmg:d.dmg*lvM*R.mult*upM*(1+M.dmg),rate:d.rate*(1+M.rate),energy:d.energy*(1+M.energy),range:d.range*(1+M.range),spread:(d.spread||0)*(1+M.spread),speed:d.speed||0,
    pellets:d.pellets||1,splash:d.splash||0,crit:.08+(d.crit||0)+M.crit+it.r*.01,freeze:(d.freeze||0)+M.freeze,burn:(d.burn||0)+M.burn,chain:(d.chain||0)+M.chain,shock:(d.shock||0)+M.shock,knock:d.knock||.6,auto:!!d.auto,col:d.col,two:d.cls!=='sidearm'&&d.cls!=='melee'};}
function gearStats(it){const d=GEAR[it.id];if(!d)return null;const R=rarOf(it),m=(1+(it.lv-1)*.07)*R.mult*(1+it.up*.12),S={};
  for(const k of ['armor','hp','en','regen','hpRegen','shield','scan'])if(d[k])S[k]=d[k]*m;
  S.cold=(d.cold||0)*(1+(it.r*.1))+it.up*3;S.heat=(d.heat||0)*(1+(it.r*.1))+it.up*3;S.speed=(d.speed||0)+(it.up*.005);S.jump=d.jump||0;S.climb=d.climb||0;
  for(const mm of it.mods||[]){const md=MODS[mm];if(!md)continue;for(const k of ['armor','en','hpRegen','cold','heat','speed'])if(md[k])S[k]=(S[k]||0)+md[k];}return S;}
function itemValue(it){const d=itemDef(it);const k=itemKind(it);if(k==='weapon'||k==='gear')return Math.round((25+d.tier*30+(it.lv||1)*6)*rarOf(it).mult*rarOf(it).mult*(1+(it.up||0)*.25));return d.value||5;}

/* ---------- loot ---------- */
const MAT_BY_ZONE={twilight:['scrap','wiring','glowcap','chitin','shard'],dayward:['scrap','alloy','wiring','powercell','polymer'],nightward:['scrap','alloy','frostchitin','shard','powercell'],
  anchorage:['scrap','alloy','wiring','powercell','polymer','datachip'],vesper:['scrap','wiring'],calder:['resin','pearl','alloy','polymer','powercell'],ashfall:['slag','glass','alloy','powercell','datachip']};
const JUNK=Object.keys(ITEMS).filter(k=>ITEMS[k].kind==='junk');
function rollRarity(bonus=0){let tot=0;for(const r of RAR)tot+=r.w*(r.id==='common'?Math.max(.2,1-bonus):1+bonus*3);let x=Math.random()*tot;for(let i=0;i<RAR.length;i++){x-=RAR[i].w*(RAR[i].id==='common'?Math.max(.2,1-bonus):1+bonus*3);if(x<=0)return i;}return 0;}
function rollEquipment(lvl,bonus=0,kind){const tier=clamp(Math.ceil(lvl/5),1,5);
  const pool=kind==='weapon'?Object.keys(WEAPONS):kind==='gear'?Object.keys(GEAR):[...Object.keys(WEAPONS),...Object.keys(GEAR)];
  const cands=pool.filter(id=>{const d=itemDef(id);return !d.unique&&d.tier<=tier&&d.tier>=tier-2&&id!=='vs9'&&id!=='h_scuffed'&&id!=='s_vesper'&&id!=='b_standard'&&id!=='p_basic';});
  if(!cands.length)return null;const id=pick(cands),r=rollRarity(bonus),it=makeItem(id,{r,lv:clamp(lvl+Math.floor(rf(-1,2)),1,30)});
  if(Math.random()<.25*RAR[r].slots){const m=Object.keys(MODS).filter(k=>MODS[k].for===(WEAPONS[id]?'weapon':'gear'));it.mods=[pick(m)];}return it;}
// returns {cr, items:[...]}
function rollLoot(kind,lvl,zone){const out={cr:0,items:[]};const mats=MAT_BY_ZONE[zone]||MAT_BY_ZONE.twilight;
  const add=(id,q=1)=>{const ex=out.items.find(x=>x.id===id&&x.q);if(ex)ex.q+=q;else out.items.push(makeItem(id,{q}));};
  if(kind==='enemy'){out.cr=Math.round(rf(1,4)*(1+lvl*.25));if(Math.random()<.55)add(pick(mats),1+(Math.random()<.3?1:0));if(Math.random()<.07+G.perkLoot)out.items.push(rollEquipment(lvl));if(Math.random()<.05)add(pick(JUNK));if(Math.random()<.04)add(pick(['medkit','cell','ration','grenade']));if(Math.random()<.03)add('datachip');}
  else if(kind==='elite'){out.cr=Math.round(rf(10,20)*(1+lvl*.3));add(pick(mats),2+Math.floor(Math.random()*3));out.items.push(rollEquipment(lvl,.25));if(Math.random()<.5)add(pick(['medkit','cell','shieldcharge','grenade']));if(Math.random()<.35)add('datachip');}
  else if(kind==='chest'){out.cr=Math.round(rf(8,24)*(1+lvl*.3));for(let i=0;i<2+Math.floor(Math.random()*2);i++)add(pick(mats),1+Math.floor(Math.random()*3));if(Math.random()<.45+G.perkLoot)out.items.push(rollEquipment(lvl,.1));if(Math.random()<.5)add(pick(JUNK));if(Math.random()<.45)add(pick(['medkit','cell','heatpack','coolant','flare','grenade','stim','ration']));if(Math.random()<.12)add('datachip');}
  else if(kind==='locked'){out.cr=Math.round(rf(30,60)*(1+lvl*.3));for(let i=0;i<3;i++)add(pick(mats),2+Math.floor(Math.random()*3));out.items.push(rollEquipment(lvl,.4));if(Math.random()<.6)out.items.push(rollEquipment(lvl,.3));add(pick(JUNK));add(pick(['trauma','cell','shieldcharge','beacon']));}
  else if(kind==='boss'){out.cr=Math.round(rf(120,200)*(1+lvl*.2));for(let i=0;i<4;i++)add(pick(mats),3+Math.floor(Math.random()*3));const it=rollEquipment(lvl+2,1);if(it){it.r=Math.max(it.r,3);out.items.push(it);}out.items.push(rollEquipment(lvl+1,.6));add('glass',lvl>15?2:0);add('datachip',1+(Math.random()<.5?1:0));}
  out.items=out.items.filter(x=>x&&!(x.q===0));return out;}

/* ---------- procedural weapon models (built barrel along +z, then pointed down the forearm) ---------- */
/* ---------- modelled weapons: pistol, rifle, shotgun and blade ---------- */
// Each model is turned so the barrel (or blade) runs along +z with +y up, scaled to length, and moved so the grip sits at the
// origin. Points are fractions of the turned model's bounds from its centre: grip, fore-grip (for the off hand) and muzzle.
const WFIT={sidearm:{id:'wpn_pistol',rot:[0,0,0],len:.32,grip:[0,-.12,-.35],muz:[0,.15,.5]},
  rifle:{id:'wpn_rifle',rot:[0,0,0],len:.95,grip:[0,-.14,.05],fore:[0,-.12,.28],muz:[0,.12,.5]},
  scatter:{id:'wpn_shotgun',rot:[0,-Math.PI/2,0],len:.92,grip:[0,-.3,-.25],fore:[0,-.15,.12],muz:[0,.12,.5]},
  melee:{id:'wpn_blade',rot:[Math.PI/2,0,0],len:.95,grip:[0,0,-.42],muz:[0,0,.5]},
  beam:{id:'wpn_beam',rot:[0,Math.PI,0],len:.3,grip:[0,-.15,-.38],muz:[0,.1,.5]},
  launcher:{id:'wpn_gl',rot:[0,Math.PI,0],len:.95,grip:[0,-.18,-.09],fore:[0,-.15,.22],muz:[0,-.05,.5]}};
const TWO_HANDED={rifle:1,scatter:1,launcher:1},WFITC={};
function wpnModel(cls,col,tint){const F=WFIT[cls],M=MODELS[F.id];
  if(!WFITC[cls]){const t=M.scene.clone(true),hold=new THREE.Group();hold.add(t);t.rotation.set(...F.rot);hold.updateMatrixWorld(true);const bx=new THREE.Box3().setFromObject(hold),sz=bx.getSize(new THREE.Vector3()),c=bx.getCenter(new THREE.Vector3());
    const pt=a=>new THREE.Vector3(c.x+a[0]*sz.x,c.y+a[1]*sz.y,c.z+a[2]*sz.z);WFITC[cls]={k:F.len/sz.z,grip:pt(F.grip),fore:F.fore?pt(F.fore):null,muz:pt(F.muz)};}
  const fc=WFITC[cls],outer=new THREE.Group(),g=new THREE.Group();outer.add(g);const m=M.scene.clone(true);m.rotation.set(...F.rot);const fit=new THREE.Group();fit.add(m);fit.scale.setScalar(fc.k);fit.position.copy(fc.grip).multiplyScalar(-fc.k);g.add(fit);
  m.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.frustumCulled=false;const mt=o.material=o.material.clone();mt.envMap=protaEnv();mt.envMapIntensity=1;if(tint)mt.color.lerp(tint,.22);if(cls==='beam'&&mt.emissive&&mt.emissive.r+mt.emissive.g+mt.emissive.b>.3){mt.emissive.set(col);mt.emissiveIntensity=Math.min(mt.emissiveIntensity||1,.9);}});
  const to=p=>p.clone().sub(fc.grip).multiplyScalar(fc.k),muzzle=new THREE.Object3D();muzzle.position.copy(to(fc.muz));g.add(muzzle);
  let fore=null;if(fc.fore){fore=new THREE.Object3D();fore.position.copy(to(fc.fore));g.add(fore);}
  // a thin ring behind the muzzle keeps each weapon's energy colour
  if(cls!=='melee'){const ring=new THREE.Mesh(tor(cls==='scatter'?.028:.016,.004,6,18),new THREE.MeshStandardMaterial({color:0x111111,emissive:col,emissiveIntensity:1.4}));ring.position.copy(muzzle.position).add(new THREE.Vector3(0,0,-.035));g.add(ring);}
  return {g:outer,muzzle,fore,cls,col,two:!!TWO_HANDED[cls]};}
function buildWeaponModel(base){const d=WEAPONS[base.id||base]||Object.assign({cls:base.cls,model:base.model,col:0x6ff2d6},base);
  const outer=new THREE.Group(),g=new THREE.Group();outer.add(g);const P=new Parts();/* barrel along +z, so lookAt aims it */const cls=d.cls,mdl=d.model||'service',col=d.col||0x6ff2d6;
  const body=std(TEX.armor,{color:{survival:0x5a6070,service:0xd8d4e0,hammer:0x6a5040,needler:0x3a2a50,carbine:0x4a5a52,cohort:0x2a2a30,longwatch:0x5a6a7a,tide:0x2a4a5a,lance:0x2a2440,breaker:0x6a6050,sweeper:0x7a4a32,riot:0x2a2a30,cutter:0x8a6a2a,lumen:0xd8d0e8,prism:0x1a1a2a,thumper:0x5a5a40,starfall:0x3a2a2a,baton:0x2a2a34,machete:0x3a3436,edge:0x1a1828}[mdl]||0x4a4858,metalness:.7,roughness:.4});
  const dark=MAT.gun,glow=new THREE.MeshStandardMaterial({color:0x111111,emissive:col,emissiveIntensity:1.3,roughness:.3}),glass=new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.6,transparent:true,opacity:.85,roughness:.05});
  if(WFIT[cls]&&MODELS[WFIT[cls].id])return wpnModel(cls,col,body.color);
  let L=.3;
  if(cls==='sidearm'){const heavy=mdl==='hammer';L=heavy?.34:.28;P.add(g,body,RB(.05,.065,L,.012,2),0,.03,L/2-.04);P.add(g,dark,RB(.046,.03,L-.06,.008,1),0,.07,L/2-.02);
    for(let i=0;i<4;i++)P.add(g,dark,RB(.052,.012,.018,.004,1),0,.06,.04+i*.04);P.add(g,dark,cyl(.016,.016,.06,14),0,.035,L-.02,Math.PI/2,0,0);P.add(g,glow,tor(.02,.005,6,16),0,.035,L-.04);
    P.add(g,dark,RB(.04,.12,.055,.012,1),0,-.05,-.005,-.25,0,0);P.add(g,glass,cyl(.012,.012,.07,10),.03,.03,.08,Math.PI/2,0,0);P.add(g,dark,RB(.008,.012,.012,.003,1),0,.09,L-.05);
    if(heavy){P.add(g,body,cyl(.035,.035,.06,16),0,.035,.1,Math.PI/2,0,0);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;P.add(g,dark,cyl(.008,.008,.062,8),Math.cos(a)*.024,.035+Math.sin(a)*.024,.1,Math.PI/2,0,0);}}
    if(mdl==='needler'){for(let i=0;i<3;i++)P.add(g,glass,crystalGeo(.008,.06,.3),0,.08,.04+i*.06,-Math.PI/2,0,0);}}
  else if(cls==='rifle'){L=mdl==='longwatch'?.82:mdl==='lance'?.78:.66;P.add(g,body,RB(.06,.085,.36,.015,2),0,.02,.1);P.add(g,dark,RB(.055,.05,.2,.012,1),0,.02,-.15);P.add(g,body,RB(.05,.09,.14,.015,1),0,-.01,-.29);
    P.add(g,dark,cyl(.018,.02,L-.2,14),0,.03,.28+(L-.66)/2+.1,Math.PI/2,0,0);for(let i=0;i<5;i++)P.add(g,body,tor(.026,.007,6,16),0,.03,.32+i*.06);P.add(g,glow,tor(.022,.005,6,16),0,.03,L-.05);
    P.add(g,dark,RB(.04,.11,.05,.012,1),0,-.07,.02,-.2,0,0);P.add(g,glass,RB(.035,.07,.07,.01,1),0,-.06,.13);P.add(g,dark,RB(.035,.04,.12,.01,1),0,-.03,.28);
    if(mdl==='longwatch'||mdl==='cohort'){P.add(g,dark,cyl(.022,.022,.16,14),0,.1,.08,Math.PI/2,0,0);P.add(g,glass,cyl(.02,.02,.005,14),0,.1,.16,Math.PI/2,0,0);}
    if(mdl==='lance'){for(let i=0;i<3;i++)P.add(g,glass,crystalGeo(.014,.12,.35),0,.08,.2+i*.12,-Math.PI/2,0,0);}if(mdl==='tide')P.add(g,glass,cyl(.02,.02,.12,12),.045,.02,.12,Math.PI/2,0,0);}
  else if(cls==='scatter'){L=.58;P.add(g,body,RB(.08,.1,.34,.02,2),0,.02,.08);for(const s of[-1,1])P.add(g,dark,cyl(.019,.019,.36,14),s*.022,.035,.38,Math.PI/2,0,0);P.add(g,glow,RB(.07,.03,.02,.008,1),0,.035,.56);
    P.add(g,dark,RB(.06,.05,.12,.015,1),0,-.02,.3);for(let i=0;i<4;i++)P.add(g,dark,RB(.09,.008,.04,.003,1),0,.08,.0+i*.05);P.add(g,body,RB(.05,.09,.16,.015,1),0,-.01,-.15);P.add(g,dark,RB(.045,.11,.05,.012,1),0,-.07,-.02,-.2,0,0);}
  else if(cls==='beam'){L=.55;P.add(g,body,RB(.07,.08,.3,.02,2),0,.02,.05);P.add(g,glass,cyl(.03,.03,.16,16),0,.1,.06,Math.PI/2,0,0);P.add(g,dark,cyl(.032,.032,.02,16),0,.1,-.03,Math.PI/2,0,0);P.add(g,dark,cyl(.032,.032,.02,16),0,.1,.15,Math.PI/2,0,0);
    for(let i=0;i<3;i++)P.add(g,glow,tor(.035,.008,6,20),0,.03,.24+i*.05);P.add(g,body,lathe([[.02,0],[.06,.08],[.065,.1],[.05,.1]],20),0,.03,.38,Math.PI/2,0,0);P.add(g,glass,cyl(.045,.045,.01,20),0,.03,.48,Math.PI/2,0,0);P.add(g,dark,RB(.045,.11,.05,.012,1),0,-.07,-.02,-.2,0,0);}
  else if(cls==='launcher'){L=.6;P.add(g,body,cyl(.06,.06,.5,20),0,.04,.2,Math.PI/2,0,0);P.add(g,dark,cyl(.065,.065,.04,20),0,.04,.45,Math.PI/2,0,0);P.add(g,glow,tor(.05,.008,6,20),0,.04,.47);
    P.add(g,dark,cyl(.07,.07,.12,8),0,.0,.0);P.add(g,dark,RB(.045,.11,.05,.012,1),0,-.08,-.06,-.2,0,0);P.add(g,dark,RB(.03,.05,.08,.01,1),0,.12,.05);}
  else if(cls==='melee'){if(mdl==='baton'){L=.55;P.add(g,dark,cyl(.018,.02,.16,12),0,0,-.02,Math.PI/2,0,0);P.add(g,body,cyl(.016,.016,.4,12),0,0,.26,Math.PI/2,0,0);P.add(g,glow,cyl(.018,.018,.08,12),0,0,.48,Math.PI/2,0,0);}
    else if(mdl==='machete'){L=.62;P.add(g,dark,cyl(.018,.02,.14,12),0,0,-.02,Math.PI/2,0,0);P.add(g,body,RB(.012,.07,.48,.004,1),0,.02,.3);P.add(g,glow,RB(.006,.012,.46,.002,1),0,-.015,.3);}
    else {L=.72;P.add(g,dark,cyl(.018,.02,.14,12),0,0,-.02,Math.PI/2,0,0);P.add(g,glass,crystalGeo(.03,.62,.25,4),0,0,.07,Math.PI/2,0,0);}}
  P.build();
  const muzzle=new THREE.Object3D();muzzle.position.set(0,.035,L);g.add(muzzle);
  const fore=TWO_HANDED[cls]?new THREE.Object3D():null;if(fore){fore.position.set(0,-.03,L*.55);g.add(fore);}
  return {g:outer,muzzle,fore,cls,col,two:!!TWO_HANDED[cls]};}

/* ---------- item icons ---------- */
const ICON={};
function iconURL(it){const id=typeof it==='string'?it:it.id,r=typeof it==='string'?-1:(it.r||0),k=id+'_'+r;return ICON[k]||(ICON[k]=drawIcon(id,r));}
function drawIcon(id,r){
  const c=mkCanvas(96),g=c.getContext('2d');g.translate(48,48);g.lineJoin='round';g.lineCap='round';
  const box=(x,y,w,h,rad)=>{g.beginPath();g.moveTo(x+rad,y);g.arcTo(x+w,y,x+w,y+h,rad);g.arcTo(x+w,y+h,x,y+h,rad);g.arcTo(x,y+h,x,y,rad);g.arcTo(x,y,x+w,y,rad);g.closePath();};
  const lin=(y0,y1,a,b)=>{const gr=g.createLinearGradient(0,y0,0,y1);gr.addColorStop(0,a);gr.addColorStop(1,b);return gr;};
  const glow=(col,b)=>{g.shadowColor=col;g.shadowBlur=b;},noglow=()=>{g.shadowBlur=0;};
  const W_=WEAPONS[id],Gd=GEAR[id],I=ITEMS[id]||KEYS[id];
  if(r>=0){const rc=hex6(RAR[r].col);const gr=g.createRadialGradient(0,0,4,0,0,52);gr.addColorStop(0,rc+'44');gr.addColorStop(1,rc+'00');g.fillStyle=gr;g.fillRect(-48,-48,96,96);}
  if(W_){const col=hex6(W_.col);g.save();g.rotate(-.35);g.fillStyle='#4a4658';g.strokeStyle='#8a86a0';g.lineWidth=2;
    if(W_.cls==='sidearm'){box(-30,-12,54,16,4);g.fill();box(-26,2,14,26,4);g.fill();glow(col,10);g.fillStyle=col;g.fillRect(18,-8,8,8);}
    else if(W_.cls==='rifle'){box(-40,-8,70,14,3);g.fill();box(-44,-6,16,22,4);g.fill();box(-10,4,10,18,3);g.fill();g.fillRect(28,-5,14,8);glow(col,10);g.fillStyle=col;g.fillRect(40,-4,6,6);g.fillRect(-4,-12,24,4);}
    else if(W_.cls==='scatter'){box(-36,-12,56,20,4);g.fill();g.fillRect(18,-10,22,7);g.fillRect(18,-1,22,7);box(-40,-6,14,22,4);g.fill();glow(col,10);g.fillStyle=col;g.fillRect(38,-10,4,16);}
    else if(W_.cls==='beam'){box(-34,-10,44,18,4);g.fill();g.beginPath();g.moveTo(10,-14);g.lineTo(34,-20);g.lineTo(34,16);g.lineTo(10,10);g.closePath();g.fill();glow(col,14);g.fillStyle=col;g.fillRect(-20,-18,26,7);g.beginPath();g.arc(36,-2,6,0,7);g.fill();}
    else if(W_.cls==='launcher'){box(-38,-14,72,24,10);g.fill();glow(col,10);g.strokeStyle=col;g.lineWidth=4;g.beginPath();g.arc(34,-2,10,0,7);g.stroke();}
    else{g.rotate(-.5);g.fillStyle='#2a2834';g.fillRect(-36,-5,22,10);glow(col,14);g.fillStyle=W_.model==='edge'?'#bfffee':col;if(W_.model==='baton')g.fillRect(-14,-4,52,8);else{g.beginPath();g.moveTo(-14,-7);g.lineTo(38,-3);g.lineTo(42,2);g.lineTo(-14,7);g.closePath();g.fill();}}
    g.restore();noglow();}
  else if(Gd){const col='#'+(0x6ff2d6).toString(16);g.fillStyle=lin(-30,30,'#9a96aa','#3a3448');
    if(Gd.slot==='helmet'){g.beginPath();g.arc(0,-2,28,0,7);g.fill();glow('#6ff2d6',10);g.fillStyle='#6ff2d6';box(-20,-10,40,12,6);g.fill();}
    else if(Gd.slot==='suit'){g.beginPath();g.moveTo(-14,-30);g.lineTo(14,-30);g.lineTo(28,-18);g.lineTo(22,0);g.lineTo(16,-6);g.lineTo(16,30);g.lineTo(-16,30);g.lineTo(-16,-6);g.lineTo(-22,0);g.lineTo(-28,-18);g.closePath();g.fill();g.fillStyle='#6ff2d6';g.fillRect(-8,-14,16,4);}
    else if(Gd.slot==='boots'){g.beginPath();g.moveTo(-16,-30);g.lineTo(6,-30);g.lineTo(6,6);g.lineTo(28,14);g.lineTo(28,24);g.lineTo(-16,24);g.closePath();g.fill();g.fillStyle='#1e1a28';g.fillRect(-18,22,48,7);}
    else{box(-22,-28,44,56,10);g.fill();glow('#6ff2d6',8);g.fillStyle='#6ff2d6';g.fillRect(-12,-18,24,5);g.fillRect(-12,10,24,5);}noglow();}
  else if(MODS[id]){g.fillStyle='#2a3a44';box(-24,-24,48,48,8);g.fill();glow('#ffc35a',10);g.strokeStyle='#ffc35a';g.lineWidth=3;for(let i=0;i<3;i++){g.beginPath();g.moveTo(-14,-12+i*12);g.lineTo(14,-12+i*12);g.stroke();}g.fillStyle='#ffc35a';for(let i=-1;i<=1;i++)g.fillRect(-28,i*12-2,6,4),g.fillRect(22,i*12-2,6,4);noglow();}
  else drawLegacyIcon(g,id,box,lin,glow,noglow,I);
  return c.toDataURL();}
function drawLegacyIcon(g,id,box,lin,glow,noglow,I){
  const colorFor={scrap:'#8a8698',alloy:'#b8c4d0',wiring:'#ff8a4c',powercell:'#6ff2d6',polymer:'#d8d0e8',datachip:'#5ab4ff',resin:'#ffb648',pearl:'#d8fbff',slag:'#ff6a3a',glass:'#8fffe0',frostchitin:'#cfe8ff'};
  if(id==='medkit'||id==='trauma'){box(-30,-22,60,46,9);g.fillStyle=lin(-22,24,'#f4f0fa','#b9b2c8');g.fill();g.fillStyle=id==='trauma'?'#ff9a3a':'#e8475c';glow('#ff5a6e',8);box(-6,-14,12,30,2);g.fill();box(-15,-5,30,12,2);g.fill();noglow();}
  else if(id==='heatpack'||id==='coolant'){box(-24,-30,48,60,12);g.fillStyle=id==='heatpack'?lin(-30,30,'#ffb36a','#c24e2a'):lin(-30,30,'#9fe8ff','#2a6a9a');g.fill();g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=3.5;for(let i=-1;i<=1;i++){g.beginPath();for(let y=-18;y<=18;y+=2){const x=i*12+Math.sin(y*.35)*4;y===-18?g.moveTo(x,y):g.lineTo(x,y);}g.stroke();}}
  else if(id==='flare'){g.rotate(.5);box(-7,-20,14,46,4);g.fillStyle='#d84a3a';g.fill();glow('#ffb04a',18);g.fillStyle='#ffe2a0';g.beginPath();g.arc(0,-27,8,0,7);g.fill();noglow();}
  else if(id==='cell'||id==='powercell'){box(-16,-26,32,56,6);g.fillStyle='#1e2a34';g.fill();g.strokeStyle='#6ff2d6';g.lineWidth=3;g.stroke();g.fillStyle='#6ff2d6';glow('#6ff2d6',12);for(let i=0;i<4;i++){box(-10,16-i*12,20,8,2);g.fill();}noglow();}
  else if(id==='beacon'){g.fillStyle='#3a3448';g.beginPath();g.moveTo(-18,30);g.lineTo(18,30);g.lineTo(6,4);g.lineTo(-6,4);g.closePath();g.fill();glow('#6ff2d6',10);g.strokeStyle='#6ff2d6';g.lineWidth=3;for(let i=1;i<=3;i++){g.beginPath();g.arc(0,-14,8+i*7,-2.4,-.74);g.stroke();}noglow();}
  else if(id==='glowcap'){glow('#6ff2d6',14);g.fillStyle=lin(-26,4,'#9ffff0','#2fb8a4');g.beginPath();g.ellipse(0,-2,30,22,0,Math.PI,0);g.closePath();g.fill();noglow();g.fillStyle='#e8e2f2';box(-6,-2,12,30,5);g.fill();}
  else if(id==='chitin'||id==='frostchitin'){g.fillStyle=id==='chitin'?lin(-28,28,'#b0506e','#4a1a2c'):lin(-28,28,'#e0f0ff','#6a8aa8');g.beginPath();g.moveTo(-26,-8);g.lineTo(-6,-28);g.lineTo(24,-16);g.lineTo(28,12);g.lineTo(4,28);g.lineTo(-24,18);g.closePath();g.fill();}
  else if(id==='shard'||id==='glass'){glow(id==='glass'?'#8fffe0':'#b98cff',16);g.fillStyle=id==='glass'?lin(-34,34,'#e0fff8','#2a8a7a'):lin(-34,34,'#e8dcff','#6a48d8');g.beginPath();g.moveTo(0,-36);g.lineTo(14,-14);g.lineTo(12,26);g.lineTo(0,34);g.lineTo(-12,26);g.lineTo(-14,-14);g.closePath();g.fill();noglow();}
  else if(id==='stim'){g.rotate(.6);box(-6,-30,12,48,4);g.fillStyle='#d8d0e8';g.fill();g.fillStyle='#a8ff5a';glow('#a8ff5a',10);box(-4,-26,8,30,3);g.fill();noglow();g.fillStyle='#8a86a0';g.fillRect(-1,18,2,14);}
  else if(id==='shieldcharge'){glow('#8fd8ff',14);g.strokeStyle='#8fd8ff';g.lineWidth=5;g.beginPath();g.moveTo(0,-30);g.lineTo(24,-18);g.lineTo(20,12);g.lineTo(0,30);g.lineTo(-20,12);g.lineTo(-24,-18);g.closePath();g.stroke();noglow();}
  else if(id==='grenade'){g.fillStyle=lin(-26,26,'#6a6680','#2a2838');g.beginPath();g.arc(0,4,24,0,7);g.fill();glow('#8fd8ff',10);g.strokeStyle='#8fd8ff';g.lineWidth=3;g.beginPath();g.arc(0,4,15,0,7);g.stroke();noglow();g.fillStyle='#8a86a0';g.fillRect(-6,-26,12,10);}
  else if(id==='ration'){box(-26,-18,52,36,6);g.fillStyle='#8a7a52';g.fill();g.fillStyle='#e8e2f2';g.fillRect(-18,-6,36,10);}
  else if(colorFor[id]){const c=colorFor[id];g.fillStyle=lin(-30,30,c,'#2a2438');if(id==='wiring'){g.strokeStyle=c;g.lineWidth=6;for(let i=0;i<3;i++){g.beginPath();g.moveTo(-28,-16+i*14);g.bezierCurveTo(-8,-30+i*14,8,0+i*14,28,-14+i*14);g.stroke();}}
    else if(id==='pearl'){glow(c,14);for(const [x,y,rr] of[[-10,6,12],[12,-6,10],[8,16,8]]){g.beginPath();g.arc(x,y,rr,0,7);g.fill();}noglow();}
    else{g.beginPath();g.moveTo(-28,-10);g.lineTo(-4,-28);g.lineTo(26,-18);g.lineTo(28,16);g.lineTo(-2,28);g.lineTo(-26,14);g.closePath();g.fill();g.strokeStyle='rgba(255,255,255,.3)';g.lineWidth=2;g.stroke();}}
  else if(I&&I.kind==='key'){glow('#ffc35a',10);g.fillStyle=lin(-24,24,'#ffd27a','#a8742a');box(-26,-20,52,40,8);g.fill();noglow();g.fillStyle='#2a2436';g.font='bold 30px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText((I.glyph||'★'),0,2);}
  else{g.fillStyle=lin(-26,26,'#c9b8a0','#5a4a3a');box(-22,-22,44,44,10);g.fill();g.fillStyle='#2a2436';g.font='bold 26px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('◆',0,2);}}

// ===== 11_player.js =====
/* ================= PLAYER STATE ================= */
const PERKS={
  marksman:{name:'Marksman',max:3,desc:'+8% weapon damage per rank'},
  steady:{name:'Steady Hands',max:3,desc:'+5% critical chance per rank'},
  tough:{name:'Toughness',max:3,desc:'+20 maximum health per rank'},
  skin:{name:'Thick Skin',max:3,desc:'+4 armor per rank'},
  battery:{name:'Deep Battery',max:3,desc:'+15 energy and faster recharge per rank'},
  fleet:{name:'Fleet-footed',max:3,desc:'+5% movement speed per rank'},
  spring:{name:'Springheel',max:2,desc:'+15% jump height per rank'},
  scavenger:{name:'Scavenger',max:3,desc:'More gear drops from enemies and caches'},
  haggler:{name:'Haggler',max:3,desc:'Buy 6% cheaper and sell 6% higher per rank'},
  tinker:{name:'Tinkerer',max:3,desc:'Upgrades cost 12% less per rank'},
  medic:{name:'Field Medic',max:3,desc:'Healing items restore 25% more per rank'},
  adapted:{name:'Climate Adapted',max:3,desc:'+6 cold and heat protection per rank'},
};
const xpNeed=l=>Math.round(100*Math.pow(l,1.35));
const MAX_LVL=30;
function freshState(){return {v:2,look:defaultLook(),zone:'twilight',entry:'crash',x:0,z:0,face:0,
  lvl:1,xp:0,hp:100,sh:0,en:100,cr:15,perkPts:0,perks:{},
  inv:[],equip:{w1:null,w2:null,helmet:null,suit:null,boots:null,pack:null},act:'w1',quick:'medkit',
  q:{},track:null,flags:{},zs:{},visited:{},logs:[],glyphs:[],mem:[],bounties:{},vendors:{},buffs:{},stats:{kills:0,bosses:0,quests:0,discovered:0},playTime:0,savedAt:0,perkLoot:0};}
let G=freshState();
// derived stats, recomputed whenever gear, level, perks or buffs change
const PS={maxHp:100,maxEn:100,enRegen:16,hpRegen:0,armor:0,shieldMax:0,cold:0,heat:0,speed:1,jump:1,climb:1.25,scan:0,dmgMul:1,crit:0,medMul:1,buyMul:1,sellMul:.4,upMul:1};
function perk(k){return G.perks[k]||0;}
function computeStats(){const S={armor:0,hp:0,en:0,regen:0,hpRegen:0,shield:0,cold:0,heat:0,speed:0,jump:0,climb:0,scan:0};
  for(const k of ['helmet','suit','boots','pack']){const it=G.equip[k];if(!it)continue;const s=gearStats(it);for(const x in s)S[x]=(S[x]||0)+s[x];}
  PS.maxHp=Math.round(100+(G.lvl-1)*12+S.hp+perk('tough')*20);PS.maxEn=Math.round(100+S.en+perk('battery')*15);PS.enRegen=16+S.regen*2+perk('battery')*2.5;
  PS.hpRegen=S.hpRegen;PS.armor=Math.round(S.armor+perk('skin')*4);PS.shieldMax=Math.round(S.shield+(buffOn('shield')?60:0));
  PS.cold=Math.round(S.cold+perk('adapted')*6+(buffOn('heat')?25:0));PS.heat=Math.round(S.heat+perk('adapted')*6+(buffOn('cool')?25:0));
  PS.speed=1+S.speed+perk('fleet')*.05+(buffOn('stim')?.3:0);PS.jump=1+S.jump+perk('spring')*.15;PS.climb=1.25+S.climb;PS.scan=S.scan;
  PS.dmgMul=(1+perk('marksman')*.08)*(buffOn('over')?1.3:1);PS.crit=perk('steady')*.05;PS.medMul=1+perk('medic')*.25;PS.buyMul=1-perk('haggler')*.06;PS.sellMul=.4*(1+perk('haggler')*.15);PS.upMul=1-perk('tinker')*.12;
  G.perkLoot=perk('scavenger')*.04;G.hp=Math.min(G.hp,PS.maxHp);G.en=Math.min(G.en,PS.maxEn);G.sh=Math.min(G.sh,PS.shieldMax);}
const armorReduce=()=>PS.armor/(PS.armor+60); // diminishing returns, ~50% at 60 armor
const safeRange=()=>[-8-PS.cold,40+PS.heat];
const buffOn=k=>(G.buffs[k]||0)>0;

/* ---------- inventory ---------- */
function countItem(id){let n=0;for(const it of G.inv)if(it.id===id)n+=it.q||1;return n;}
function addItem(it,silent){if(!it)return;const k=itemKind(it);
  if(it.q!==undefined&&k!=='weapon'&&k!=='gear'){const ex=G.inv.find(x=>x.id===it.id&&x.q!==undefined);if(ex)ex.q+=it.q;else G.inv.push(it);}else G.inv.push(it);
  if(!silent)lootToast(it);Bus.emit('item',it.id,countItem(it.id));}
function addItems(list,silent){for(const it of list)addItem(it,silent);}
function removeItem(id,q=1){for(let i=G.inv.length-1;i>=0&&q>0;i--){const it=G.inv[i];if(it.id!==id)continue;if(it.q!==undefined){const t=Math.min(q,it.q);it.q-=t;q-=t;if(it.q<=0)G.inv.splice(i,1);}else{G.inv.splice(i,1);q--;}}Bus.emit('item',id,countItem(id));}
function removeInst(u){const i=G.inv.findIndex(x=>x.u===u);if(i>=0)return G.inv.splice(i,1)[0];return null;}
function give(id,q=1,o={}){const k=itemKind(id);if(k==='weapon'||k==='gear'){for(let i=0;i<q;i++)addItem(makeItem(id,o));}else addItem(makeItem(id,{q}));}
function giveCr(n,silent){G.cr+=Math.round(n);if(!silent&&n>0)floatText('+'+Math.round(n)+' cr',player.x,player.y+2.3,player.z,'info');}
function gainXP(n,silent){if(G.lvl>=MAX_LVL)return;G.xp+=Math.round(n);if(!silent)floatText('+'+Math.round(n)+' XP',player.x,player.y+2.6,player.z,'xp');
  while(G.lvl<MAX_LVL&&G.xp>=xpNeed(G.lvl)){G.xp-=xpNeed(G.lvl);G.lvl++;G.perkPts++;computeStats();G.hp=PS.maxHp;toast(`Level ${G.lvl}! You have a perk point to spend (Menu → Character).`,'teal');sfx('level');showBanner('LEVEL UP','Level '+G.lvl);}}

/* ---------- equipment ---------- */
function slotFor(it){const k=itemKind(it);if(k==='weapon')return 'weapon';if(k==='gear')return GEAR[it.id].slot;return null;}
function equipItem(u,toSlot){const it=G.inv.find(x=>x.u===u);if(!it)return;const s=slotFor(it);if(!s)return;
  let slot=s;if(s==='weapon')slot=toSlot||(!G.equip.w1?'w1':!G.equip.w2?'w2':G.act);
  const old=G.equip[slot];removeInst(u);G.equip[slot]=it;if(old)G.inv.push(old);computeStats();refreshAvatarGear();sfx('craft');saveSoon();}
function unequip(slot){const it=G.equip[slot];if(!it)return;if(slot==='w1'&&!G.equip.w2){toast('Keep at least one weapon equipped.');return;}G.equip[slot]=null;G.inv.push(it);if(G.act===slot)G.act=G.equip.w1?'w1':'w2';computeStats();refreshAvatarGear();saveSoon();}
const activeWeapon=()=>G.equip[G.act]||G.equip.w1||G.equip.w2;
function swapWeapon(){const o=G.act==='w1'?'w2':'w1';if(!G.equip[o]){toast('No second weapon equipped. Equip one from your Pack.');return;}G.act=o;refreshAvatarGear();sfx('click');const w=activeWeapon();toast(itemName(w));}

/* ---------- runtime player body ---------- */
const player={x:0,z:0,y:0,face:0,vx:0,vz:0,vy:0,onGround:true,coyote:0,plat:null,lastSafe:{x:0,z:0},phase:0,cd:0,aimT:0,recoil:0,melee:0,dead:false,hurtT:0,speedAmt:0,sprint:false,act:newAct(),firing:false,beamOn:false,frozen:0};
// sitting in a seat: you stay in it until you move or jump; standing up puts you just in front of it
function sitDown(x,z,face,drop=.42){player.sit={x,z,face,drop,ox:x+Math.sin(face)*.95,oz:z+Math.cos(face)*.95};player.vx=player.vz=0;cam.yaw=wrapA(face+Math.PI);sfx('click');}
function standUp(){const s=player.sit;if(!s)return;player.sit=null;placePlayer(s.ox,s.oz,s.face);}
function placePlayer(x,z,face){if(player.sit&&!(Math.abs(player.sit.x-x)<.01&&Math.abs(player.sit.z-z)<.01))player.sit=null;player.x=x;player.z=z;player.face=face;player.vx=player.vz=player.vy=0;player.y=support(x,z,999).y;player.onGround=true;player.lastSafe={x,z};
  cam.yaw=wrapA(face+Math.PI);cam.tx=x;cam.tz=z;cam.ty=player.y+1.7;cam.cur=cam.dist;if(avatar){avatar.root.position.set(x,player.y,z);avatar.root.rotation.y=face;}}

// ===== 13_enemies.js =====
/* ================= ENEMIES: models ================= */
const SKT={};
function skitterTemplate(frost){
  const P=new Parts(),g=new THREE.Group(),bodyG=new THREE.Group();bodyG.name='bodyG';g.add(bodyG);
  const mat=std(TEX.carapace,{color:frost?0xb8cbeb:0x8a3a58,roughness:.3,metalness:.25});mat.name='shell';
  const legMat=std(TEX.carapace,{color:frost?0x71839f:0x4a2232,roughness:.45,metalness:.2});
  const belly=std(TEX.rubber,{color:frost?0x55627d:0x3a2030,roughness:.7});
  const eyeM=new THREE.MeshStandardMaterial({color:0x111111,emissive:frost?0x8ff7ff:0xffa040,emissiveIntensity:1.3,roughness:.05,metalness:.5});
  P.add(bodyG,mat,sph(1,40,24),0,.78,0,0,0,0,.82,.4,1.1);
  P.add(bodyG,belly,sph(1,32,16),0,.68,0,0,0,0,.74,.28,1);
  for(let i=0;i<4;i++)P.add(bodyG,mat,sph(1,40,12,0,Math.PI*2,0,1.15),0,.86-i*.02,.55-i*.4,-.3,0,0,.78-i*.07,.36,.34);
  P.add(bodyG,mat,sph(.42,36,22),0,.74,1.08,0,0,0,1,.78,1.05);
  for(const [x,y,z,r] of [[.17,.86,1.42,.085],[-.17,.86,1.42,.085],[.29,.8,1.3,.05],[-.29,.8,1.3,.05],[.09,.95,1.38,.035],[-.09,.95,1.38,.035]])P.add(bodyG,eyeM,sph(r,18,12),x,y,z);
  for(const s of[-1,1]){P.add(bodyG,legMat,cone(.05,.34,14),s*.15,.6,1.55,Math.PI/2+.2,s*.3,0);P.add(bodyG,legMat,cone(.03,.2,12),s*.07,.57,1.76,Math.PI/2,-s*.9,0);
    P.add(bodyG,legMat,cyl(.01,.02,.55,8),s*.16,1.09,1.51,.9,0,-s*.3);P.add(bodyG,legMat,sph(.025,8,6),s*.24,1.27,1.73);}
  for(let i=0;i<4;i++){P.add(bodyG,mat,cone(.075,.38,16),0,1.13,.5-i*.4,-.45,0,0);for(const s of[-1,1])P.add(bodyG,mat,cone(.045,.24,12),s*.6,.95,.45-i*.4,0,0,-s*.9);}
  for(let i=0;i<3;i++)for(const s of[-1,1]){const p=new THREE.Group();p.name='leg';p.position.set(s*.55,.76,(i-1)*.5);p.userData={s,i,by:-(i-1)*.4*s};g.add(p);
    const fem=new THREE.Group();fem.name='fem';fem.rotation.z=-s*.96;p.add(fem);
    P.add(fem,legMat,cyl(.055,.075,.75,14,2),0,.375,0);P.add(fem,legMat,sph(.078,16,10),0,.75,0);P.add(fem,mat,cone(.03,.16,10),0,.5,-.07,-.6,0,0);
    const knee=new THREE.Group();knee.position.y=.75;knee.rotation.z=-s*1.83;fem.add(knee);
    P.add(knee,legMat,cyl(.035,.058,1.05,14,2),0,.525,0);P.add(knee,legMat,cone(.035,.2,12),0,1.15,0);}
  P.build();
  const glow=glowSprite(frost?0x8ff7ff:0xffa040,1.2,.5);glow.position.set(0,.84,1.45);bodyG.add(glow);
  return {g,mat};
}
function makeSkitter(frost,tint){if(MODELS.alien)return makeAlien(frost,tint);
  const k=frost?'f':'n';if(!SKT[k])SKT[k]=skitterTemplate(frost);
  const g=SKT[k].g.clone(true),mat=SKT[k].mat.clone();if(tint)mat.color.set(tint);const legs=[];
  g.traverse(o=>{if(o.isMesh&&o.material===SKT[k].mat)o.material=mat;if(o.name==='leg')legs.push(o);});
  return {g,mat,legs,body:g.getObjectByName('bodyG')};
}
// Skitters use the rigged alien ("Alien" by DJMaesen, CC BY 4.0). Its own clip only breathes, so walking, the strike, flinches
// and the collapse are layered on its bones here, about axes in the creature's own frame (x left, y up, z forward).
let ALIEN_FIT=null;
function makeAlien(frost,tint){const M=MODELS.alien,g=new THREE.Group(),inner=new THREE.Group(),wrap=new THREE.Group();g.add(inner);inner.add(wrap);
  const body=THREE.SkeletonUtils.clone(M.scene);wrap.add(body);let mat=null;
  const tc=tint!=null?new THREE.Color(tint).lerp(new THREE.Color(0xffffff),.45):frost?new THREE.Color(0xbcd8ff):null;
  body.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.frustumCulled=false;mat=o.material=o.material.clone();mat.metalness=.1;mat.roughness=.55;if(tc)mat.color.copy(lin(tc.getHex()));
    mat.emissive=new THREE.Color(0);mat.emissiveIntensity=1;});
  const B={};body.traverse(o=>{if(o.isBone)B[o.name.replace(/_\d+$/,'')]=o;});
  const wp=o=>inner.worldToLocal(o.getWorldPosition(new THREE.Vector3()));g.updateMatrixWorld(true);
  // keep the model's own up (it walks on all fours), turn its head toward +z, set its size and put its lowest foot on the ground
  const u=new THREE.Vector3(0,1,0),f=wp(B.head).sub(wp(B.hips));f.y=0;f.normalize();const xa=new THREE.Vector3().crossVectors(u,f);
  wrap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa,u,f).transpose());g.updateMatrixWorld(true);
  const feet=['L_toes','R_toes','L_frontfingers','R_frontfingers'].filter(n=>B[n]);const low=()=>Math.min(...feet.map(n=>wp(B[n]).y));
  const k=1.55/wp(B.head).distanceTo(wp(B.L_toes));wrap.scale.setScalar(k);g.updateMatrixWorld(true);
  const hp=wp(B.hips),hd=wp(B.head);wrap.position.set(-(hp.x+hd.x)/2,-low(),-(hp.z+hd.z)/2);g.updateMatrixWorld(true);
  const mixer=new THREE.AnimationMixer(body),clip=M.animations[0];const tracked=new Set();if(clip){mixer.clipAction(clip).play();clip.tracks.forEach(t=>tracked.add(t.name.split('.')[0]));}
  mixer.update(Math.random()*2);
  const rest={};for(const n in B)rest[n]=B[n].quaternion.clone();
  const qi=new THREE.Quaternion(),qa=new THREE.Quaternion(),ax=new THREE.Vector3(),X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
  const rot=(n,axis,a)=>{const b=B[n];if(!b||!a)return;inner.getWorldQuaternion(qi);b.parent.getWorldQuaternion(qa);qa.premultiply(qi.invert());ax.copy(axis).applyQuaternion(qa.invert());b.quaternion.premultiply(qi.setFromAxisAngle(ax,a));b.updateMatrixWorld(true);};
  const used=['hips','spine','chest','neck','head','jaw','L_leg','R_leg','L_Knee','R_Knee','L_ankle','R_ankle','L_shoulder','R_shoulder','L_arm','R_arm','L_elbow','R_elbow','L_frontShoulder','R_frontShoulder','L_frontarm','R_frontarm','L_frontelbow','R_frontelbow'];
  const alien={update(e,dt,speed){if(e.frozen>0||Math.hypot(e.x-player.x,e.z-player.z)>70)return;mixer.update(dt);for(const n of used)if(B[n]&&!tracked.has(B[n].name))B[n].quaternion.copy(rest[n]);
      g.updateMatrixWorld(true);const mv=Math.min(1,speed/4),ph=e.phase*2,s=Math.sin(ph),c=Math.cos(ph);
      // gait: thighs swing, knees fold on the back-swing, a forward lean and counter-swinging arms
      // a trot: each hind leg moves with the opposite front leg, the back rolls, the clawed upper arms sway
      rot('hips',Z,s*.08*mv);rot('chest',Z,-s*.08*mv);rot('chest',Y,-s*.1*mv);
      for(const [side,sg] of[['L',1],['R',-1]]){const ls=s*sg;rot(side+'_leg',X,-ls*.6*mv);rot(side+'_Knee',X,Math.max(0,sg*c)*.8*mv);rot(side+'_ankle',X,-ls*.2*mv);
        rot(side+'_frontarm',X,ls*.6*mv);rot(side+'_frontelbow',X,-Math.max(0,-sg*c)*.7*mv);rot(side+'_arm',X,-ls*.25*mv);}
      inner.position.y=Math.abs(c)*.05*mv;
      // strike: rear back with all four arms raised and the jaw open, then rake forward on the lunge
      const wu=e.wind>0?1-Math.min(1,e.wind/.5):0,lu=e.lunge>0?Math.sin(Math.min(1,e.lunge/.25)*Math.PI):0;
      if(wu||lu){const up=wu*(1-lu),dn=lu;rot('spine',X,-.35*up+.45*dn);rot('neck',X,-.3*up);rot('jaw',X,.6*Math.max(up,dn));
        for(const [side,sg] of[['L',1],['R',-1]]){rot(side+'_arm',X,-2.2*up+.6*dn);rot(side+'_arm',Z,-sg*.4*up);rot(side+'_elbow',X,-.9*up);rot(side+'_frontarm',X,-1.8*up+.9*dn);rot(side+'_frontelbow',X,-.8*up);}}
      // flinch when hit
      if(e.flash>0)rot('chest',X,-e.flash*3);},
    die(u){inner.rotation.z=u*1.45;inner.position.y=u*.12;},reset(){inner.rotation.set(0,0,0);inner.position.set(0,0,0);}};
  return {g,mat,legs:[],body:inner,alien};}
function makeWarden(){
  const P=new Parts(),g=new THREE.Group();
  const mat=std(TEX.obsidian,{color:0xffffff,emissive:0x8fffe0,emissiveIntensity:.9,metalness:.6,roughness:.18,flatShading:true});
  const coreM=new THREE.MeshBasicMaterial({color:0x8fffe0});
  const body=new THREE.Group();g.add(body);
  P.add(body,mat,rockGeo(2,3.1,.28,2),0,3.4,0,0,0,0,1.6,2.3,1.15);
  P.add(body,mat,rockGeo(1,7.7,.3,2),0,1.7,0,0,0,0,.95,.75,.8);
  for(const s of[-1,1]){P.add(body,mat,crystalGeo(.4,1.8,.4),s*.6,1.6,0,Math.PI,0,s*.15);
    for(let k=0;k<3;k++)P.add(body,mat,crystalGeo(.28-k*.05,1.6-k*.3,.35),s*(1.2+k*.25),5+k*.1,(k-1)*.35,0,0,-s*(.5+k*.25));}
  P.add(body,mat,rockGeo(1,9.2,.25,2),0,6.3,0,0,0,0,.75,.75,.75);
  for(let k=0;k<5;k++){const a=k/5*6.28;P.add(body,mat,crystalGeo(.13,.8,.4),Math.cos(a)*.45,6.75,Math.sin(a)*.45,Math.sin(a)*.4,0,-Math.cos(a)*.4);}
  P.add(body,coreM,RB(.7,.12,.1,.04,1),0,6.4,.68);
  const arms=[-1,1].map(s=>{const a=new THREE.Group();a.position.set(s*2.1,4.6,0);body.add(a);
    P.add(a,mat,crystalGeo(.5,2,.3),0,0,0,Math.PI,0,0);P.add(a,mat,rockGeo(1,s*4+20,.3,2),0,-2.1,0,0,0,0,.45,.45,.45);P.add(a,mat,rockGeo(1,s*6+30,.35,2),0,-2.9,.1,0,0,0,.65,.7,.6);
    for(let k=0;k<3;k++)P.add(a,mat,crystalGeo(.12,.6,.4),(k-1)*.25,-3.4,.35,Math.PI*.8,0,0);
    return a;});
  P.build();
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),coreM);core.position.set(0,3.6,.98);body.add(core);
  const cg=glowSprite(0x8fffe0,4,.8);cg.position.copy(core.position);body.add(cg);
  const shards=[];for(let i=0;i<6;i++){const s=new THREE.Mesh(crystalGeo(.18,.9,.4),std(TEX.crystal,{color:0xb0fff0,emissive:0x2a8a80,emissiveIntensity:1,flatShading:true}));g.add(s);shards.push(s);}
  const tele=new THREE.Mesh(new THREE.RingGeometry(.1,1,64),new THREE.MeshBasicMaterial({color:0xff4a5e,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide}));tele.rotation.x=-Math.PI/2;tele.visible=false;
  return {g,mat,core,arms,shards,tele,body};
}


// ===== 14_enemies_ai.js =====
/* ================= ENEMIES: more models ================= */
function makeStalker(tint=0x5a7a3a){// Calder reed stalker: long-legged, low predator with a bony crest
  const P=new Parts(),g=new THREE.Group(),body=new THREE.Group();body.name='bodyG';g.add(body);
  const mat=std(TEX.carapace,{color:tint,roughness:.4,metalness:.15});const dark=std(TEX.rubber,{color:0x1e2418});const eye=new THREE.MeshStandardMaterial({color:0x111,emissive:0xd8ff5a,emissiveIntensity:1.3});
  P.add(body,mat,sph(1,32,18),0,1.15,0,0,0,0,.45,.42,1.2);P.add(body,mat,sph(.32,24,14),0,1.3,1.3,0,0,0,.9,.75,1.5);P.add(body,dark,cone(.08,.6,10),0,1.15,1.95,Math.PI/2,0,0);
  for(const s of[-1,1]){P.add(body,eye,sph(.05,10,8),s*.14,1.42,1.6);P.add(body,mat,cone(.05,.6,10),s*.12,1.6,.8,-.9,0,s*.2);}
  for(let i=0;i<5;i++)P.add(body,mat,cone(.06,.35,10),0,1.55,.5-i*.32,-.4,0,0);P.add(body,mat,cone(.12,1.4,12),0,1.15,-1.6,-Math.PI/2+.3,0,0);
  const legs=[];for(const [z,i] of[[.6,0],[-.5,1]])for(const s of[-1,1]){const p=new THREE.Group();p.name='leg';p.position.set(s*.35,1.1,z);p.userData={s,i,by:0};g.add(p);
    P.add(p,mat,cyl(.06,.08,.8,10),s*.1,-.35,0,0,0,s*.25);const k=new THREE.Group();k.position.set(s*.2,-.72,0);p.add(k);P.add(k,dark,cyl(.04,.06,.7,10),0,-.33,-.12,.35,0,0);legs.push(p);}
  P.build();return {g,mat,legs,body};}
function makeRay(tint=0x4a8aa8){// glider ray: a flying manta with glowing wing edges
  const g=new THREE.Group(),body=new THREE.Group();body.name='bodyG';g.add(body);const mat=std(TEX.membrane,{color:tint,emissive:0x2a6a8a,emissiveIntensity:.6,roughness:.3,side:THREE.DoubleSide});
  const wing=new THREE.Shape();wing.moveTo(0,1.2);wing.quadraticCurveTo(1.8,.6,2.4,-.2);wing.quadraticCurveTo(1.2,-.4,.4,-.9);wing.lineTo(0,-1.4);wing.lineTo(-.4,-.9);wing.quadraticCurveTo(-1.2,-.4,-2.4,-.2);wing.quadraticCurveTo(-1.8,.6,0,1.2);
  const wg=new THREE.ShapeGeometry(wing,16);wg.rotateX(-Math.PI/2);const wm=new THREE.Mesh(wg,mat);wm.castShadow=true;body.add(wm);
  const P=new Parts();P.add(body,mat,sph(.45,24,12),0,.05,.1,0,0,0,1,.4,2);P.add(body,mat,cyl(.03,.005,1.8,6),0,0,-1.9,Math.PI/2,0,0);P.add(body,new THREE.MeshStandardMaterial({color:0x111,emissive:0x8fffe0,emissiveIntensity:1.4}),sph(.06,10,8),.18,.12,.9);P.add(body,new THREE.MeshStandardMaterial({color:0x111,emissive:0x8fffe0,emissiveIntensity:1.4}),sph(.06,10,8),-.18,.12,.9);P.build();
  body.add(glowSprite(0x8fffe0,2.5,.35));return {g,mat,legs:[],body,wing:wm};}
function makeWisp(){const g=new THREE.Group(),body=new THREE.Group();body.name='bodyG';g.add(body);const mat=new THREE.MeshStandardMaterial({color:0x2a0a04,emissive:0xff6a1a,emissiveIntensity:1.6,roughness:.4,flatShading:true});
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.35,1),mat);body.add(core);const shards=[];for(let i=0;i<5;i++){const s=new THREE.Mesh(crystalGeo(.09,.5,.4),mat);body.add(s);shards.push(s);}
  body.add(glowSprite(0xff6a1a,3,.7));return {g,mat,legs:[],body,shards};}
function makeDrone(tint=0xc8c0b0){const P=new Parts(),g=new THREE.Group(),body=new THREE.Group();body.name='bodyG';g.add(body);const m=std(TEX.hull,{color:tint,metalness:.5,roughness:1});
  P.add(body,m,RB(.7,.32,.7,.1,2),0,0,0);P.add(body,MAT.gun,RB(.4,.12,.4,.04,1),0,.2,0);const eye=new THREE.MeshStandardMaterial({color:0x111,emissive:0xff3a2a,emissiveIntensity:1.5});P.add(body,eye,sph(.08,12,10),0,-.02,.37);
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.785;P.add(body,MAT.metal,RB(.75,.06,.08,.02,1),Math.cos(a)*.45,0,Math.sin(a)*.45,0,-a,0);P.add(body,MAT.gun,cyl(.26,.26,.015,24),Math.cos(a)*.82,.1,Math.sin(a)*.82);}
  P.add(body,MAT.gun,cyl(.03,.03,.3,8),0,-.2,.15,Math.PI/2,0,0);P.build();body.add(glowSprite(0xff3a2a,.9,.6));return {g,mat:m,legs:[],body};}
function makeGolem(tint=0x3a2a2a){const P=new Parts(),g=new THREE.Group(),body=new THREE.Group();g.add(body);const mat=std(TEX.lava,{color:0xffffff,emissive:0xff5a1a,emissiveIntensity:.9,roughness:.8,flatShading:true});
  P.add(body,mat,rockGeo(1,8.3,.3,2),0,1.9,0,0,0,0,1,1.3,.8);P.add(body,mat,rockGeo(1,2.1,.3,2),0,3.3,.1,0,0,0,.5,.45,.5);P.add(body,MAT.amber,RB(.4,.06,.05,.02,1),0,3.35,.45);
  const arms=[-1,1].map(s=>{const a=new THREE.Group();a.position.set(s*1.15,2.6,0);body.add(a);P.add(a,mat,rockGeo(1,s*3+5,.3,2),0,-.7,0,0,0,0,.42,.8,.42);P.add(a,mat,rockGeo(1,s*7+1,.35,2),0,-1.6,.1,0,0,0,.55,.55,.5);return a;});
  for(const s of[-1,1])P.add(body,mat,rockGeo(1,s*2+9,.3,2),s*.45,.7,0,0,0,0,.4,.7,.4);P.build();return {g,mat,legs:[],body,arms};}
function makeBorer(){// a burrowing sand worm: segmented, armored ring plates, glowing maw
  const g=new THREE.Group(),segs=[],mat=std(TEX.carapace,{color:0xb08a5a,roughness:.5,metalness:.2}),inner=new THREE.MeshStandardMaterial({color:0x200804,emissive:0xff7a2a,emissiveIntensity:1.2});
  for(let i=0;i<10;i++){const s=new THREE.Group();const r=1.4-i*.07;const P=new Parts();P.add(s,mat,sph(r,28,16),0,0,0,0,0,0,1,1,.8);P.add(s,mat,tor(r*.95,.14,8,28),0,0,0);for(let k=0;k<6;k++){const a=k/6*Math.PI*2;P.add(s,mat,cone(.16,.6,8),Math.cos(a)*r,Math.sin(a)*r,0,0,0,a-Math.PI/2);}
    if(i===0){P.add(s,inner,cyl(r*.7,r*.7,.1,24),0,0,.9,Math.PI/2,0,0);for(let k=0;k<8;k++){const a=k/8*Math.PI*2;P.add(s,MAT.white,cone(.1,.5,8),Math.cos(a)*r*.7,Math.sin(a)*r*.7,1.0,Math.PI/2,0,0);}}
    P.build();g.add(s);segs.push(s);}
  const tele=new THREE.Mesh(new THREE.RingGeometry(.1,1,64),new THREE.MeshBasicMaterial({color:0xffa94a,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide}));tele.rotation.x=-Math.PI/2;tele.visible=false;
  return {g,mat,legs:[],body:segs[0],segs,tele};}
// The Dune Borer: "Sand Worm" by chatholoboom7745289 (CC BY-NC 4.0). It swims under the sand, erupts where you stand, rears up
// and roars, spits at you while it's above ground, then dives again. Dying, it sinks back into the dunes.
function makeWormBorer(){const M=MODELS.borer;if(!M)return null;
  if(!M.animations.some(a=>a.name==='RoarUp')){const r=M.animations.find(a=>a.name==='Roar');if(r)M.animations.push(THREE.AnimationUtils.subclip(r,'RoarUp',156,246,30));}
  const c=makeClipCreature('borer',{height:5.5,root:/bone000/,idle:'Idle',runAt:99,walkRef:3,runRef:3,shoot:'RoarUp',hand:'bone101',ring:0xffa94a,
    paint:m=>{m.roughness=.75;m.metalness=.05;m.envMap=protaEnv();m.envMapIntensity=.9;m.color.setRGB(1.15,1.12,1.08);}});if(!c)return null;
  const body=c.body,baseY=body.position.y;let sink=-9,was='';const base=c.custom;
  c.custom=(e,dt,speed)=>{base(e,dt,speed);
    // face the way it swims underground, and turn on you once it's up
    const dx=player.x-e.x,dz=player.z-e.z;if(!e.sub||Math.hypot(dx,dz)>1)e.face+=wrapA(Math.atan2(dx,dz)-e.face)*Math.min(1,dt*(e.sub?2:3));
    const want=e.mode==='up'?0:e.mode==='rise'?-6:-9;sink+=(want-sink)*Math.min(1,dt*(want>sink?7:3));body.position.y=baseY+sink;
    if(e.mode==='up'&&was!=='up'&&c.onShoot)c.onShoot();was=e.mode;};
  c.onDie=()=>{was='dead';};c.dieUpdate=dt=>{sink=Math.max(-12,sink-dt*3.2);body.position.y=baseY+sink;};
  c.reset=(r=>()=>{r();sink=-9;was='';body.position.y=baseY+sink;})(c.reset);
  return c;}
function makeLeviathan(){const r=makeRay(0x8fffe0);r.g.scale.setScalar(4.2);r.mat.emissiveIntensity=1;return r;}
function makeHumanEnemy(spec){const p=buildPerson(spec);const mats=[];p.model.traverse(o=>{if(o.isMesh)mats.push(o.material);});return {g:p.root,mat:mats[0]||MAT.hull,mats,legs:[],body:p.model,anim:p.anim,B:p.B,human:true,person:p};}
function makeSentinel(tint=0x8a2a2a){const p=buildPerson({body:'robot',tint,tint2:0x2a2a30,scale:1.15,npcModel:{mdl:'npc_r3',hue:3.3,sat:1.2,val:.85}});const mats=[];p.model.traverse(o=>{if(o.isMesh)mats.push(o.material);});return {g:p.root,mat:mats[0]||MAT.hull,mats,legs:[],body:p.model,anim:p.anim,B:p.B,robot:true,rider:p.rider};}

// The Hollow Warden: "alien low poly" by vicente betoret ferrero (CC BY 4.0) on a Mixamo skeleton. A hidden copy of the
// player's rig plays the game's clips and the alien copies its pose, so it walks, swings, flinches and falls like a person.
function makeAlienWarden(o={}){return makeRiderEnemy('warden',MIXAMO_MAP,o);}
// any humanoid model on another skeleton, driven by a hidden copy of the player's rig
function makeRiderEnemy(id,map,o={}){if(!MODELS[id])return null;const root=new THREE.Group(),model=cloneParts('suit',['SpaceSuit_Body','SpaceSuit_Legs','SpaceSuit_Feet']);if(!model)return null;
  root.add(model);model.updateMatrixWorld(true);const anim=new Animator(model,'q');if(anim.a.idle)anim.a.idle.setEffectiveWeight(1);
  const rider=buildRiderBody(root,model,{id,map,paint:m=>{m.roughness=.6;m.metalness=.1;m.emissive=new THREE.Color(o.glow||0);m.emissiveIntensity=o.glow?.14:1;if(o.tint)m.color.copy(lin(o.tint));}});if(!rider)return null;
  model.traverse(x=>{if(x.isMesh)x.visible=false;});root.scale.setScalar(o.scale||2.6);
  const tele=new THREE.Mesh(new THREE.RingGeometry(.1,1,64),new THREE.MeshBasicMaterial({color:o.ring||0xff4a5e,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide}));tele.rotation.x=-Math.PI/2;tele.visible=false;
  return {g:root,mat:rider.mats[0],mats:rider.mats,legs:[],body:model,anim,B:anim.B,human:true,rider,tele};}

/* ---------- supplied models: the Maintenance Drone, the Ember Wisp and Vash ---------- */
// "Flying Bot" by colizey, "FireBall" by tamminen and "Nightmare Creature 1#" by Idk, all CC BY 4.0
const deq=A=>A.normalized?1/({1:A.array instanceof Uint8Array?255:127,2:A.array instanceof Uint16Array?65535:32767}[A.array.BYTES_PER_ELEMENT]||1):1;
// bounds of a rig from its bones, in the holder's space (the meshes are packed, so their raw numbers aren't metres)
function boneBox(o,holder){holder.updateMatrixWorld(true);const b=new THREE.Box3(),v=new THREE.Vector3();o.traverse(x=>{if(x.isBone)b.expandByPoint(holder.worldToLocal(x.getWorldPosition(v)));});return b;}
// bounds of a skinned model as posed, in the holder's space (packed positions and weights are unpacked first)
function skinBox(o,holder){holder.updateMatrixWorld(true);const b=new THREE.Box3(),v=new THREE.Vector3(),w=new THREE.Vector3(),q=new THREE.Vector3(),m=new THREE.Matrix4(),gc=(A,i,k)=>[A.getX,A.getY,A.getZ,A.getW][k].call(A,i);
  o.traverse(x=>{if(!x.isSkinnedMesh)return;const G=x.geometry.attributes,P=G.position,SI=G.skinIndex,SW=G.skinWeight,qp=deq(P),qw=deq(SW);
    for(let i=0;i<P.count;i+=3){v.set(P.getX(i),P.getY(i),P.getZ(i)).multiplyScalar(qp).applyMatrix4(x.bindMatrix);w.set(0,0,0);let ws=0;
      for(let k=0;k<4;k++){const wt=gc(SW,i,k)*qw;if(!wt)continue;const bi=gc(SI,i,k);m.multiplyMatrices(x.skeleton.bones[bi].matrixWorld,x.skeleton.boneInverses[bi]);w.addScaledVector(q.copy(v).applyMatrix4(m),wt);ws+=wt;}
      if(ws>0)b.expandByPoint(holder.worldToLocal(w.multiplyScalar(1/ws)));}});return b;}
function makeBotDrone(){const M=MODELS.drone;if(!M)return null;const g=new THREE.Group(),body=new THREE.Group(),fit=new THREE.Group();g.add(body);body.add(fit);
  const o=THREE.SkeletonUtils.clone(M.scene);fit.add(o);let mat=null;
  o.traverse(x=>{if(!x.isMesh)return;x.frustumCulled=false;x.castShadow=true;x.material=x.material.clone();if(/outline/i.test(x.material.name)){x.castShadow=false;}else{mat=x.material;mat.aoMap=null;mat.envMap=protaEnv();mat.envMapIntensity=1.4;mat.metalness=Math.min(mat.metalness,.6);mat.needsUpdate=true;}});
  const bb=skinBox(o,body),sz=bb.getSize(new THREE.Vector3()),k=1.1/Math.max(sz.x,sz.y,sz.z),c=bb.getCenter(new THREE.Vector3());fit.scale.setScalar(k);fit.position.copy(c).multiplyScalar(-k);
  const mixer=new THREE.AnimationMixer(o);if(M.animations[0])mixer.clipAction(M.animations[0]).play();mixer.update(Math.random()*4);
  const eye=glowSprite(0xff3a2a,.45,.5);body.add(eye);
  return {g,mat:mat||MAT.hull,legs:[],body,custom(e,dt,speed){mixer.update(dt);body.rotation.z=Math.sin(e.t*2)*.1;body.rotation.x=Math.min(.35,speed*.05);body.position.y=Math.sin(e.t*2.4)*.08;}};}
// The fireball is 192 small animated flames. They are fused into one mesh, each flame skinned to the node that animates it,
// so a wisp costs one draw instead of 192.
let WISP_T=null;
function wispTemplate(){if(WISP_T)return WISP_T;const M=MODELS.wisp;if(!M)return null;const sc=M.scene;sc.updateMatrixWorld(true);const ms=[];sc.traverse(x=>{if(x.isMesh)ms.push(x);});
  let n=0,ni=0;for(const m of ms){n+=m.geometry.attributes.position.count;ni+=m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count;}
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),si=new Uint16Array(n*4),sw=new Float32Array(n*4),idx=new Uint32Array(ni),v=new THREE.Vector3(),nm=new THREE.Matrix3();let o=0,io=0;
  ms.forEach((m,i)=>{const P=m.geometry.attributes.position,N=m.geometry.attributes.normal,qp=deq(P),qn=N?deq(N):1;nm.getNormalMatrix(m.matrixWorld);
    for(let k=0;k<P.count;k++){v.set(P.getX(k),P.getY(k),P.getZ(k)).multiplyScalar(qp).applyMatrix4(m.matrixWorld);pos[(o+k)*3]=v.x;pos[(o+k)*3+1]=v.y;pos[(o+k)*3+2]=v.z;
      if(N){v.set(N.getX(k),N.getY(k),N.getZ(k)).multiplyScalar(qn).applyMatrix3(nm).normalize();nor[(o+k)*3]=v.x;nor[(o+k)*3+1]=v.y;nor[(o+k)*3+2]=v.z;}si[(o+k)*4]=i;sw[(o+k)*4]=1;}
    const I=m.geometry.index;if(I)for(let k=0;k<I.count;k++)idx[io++]=I.getX(k)+o;else for(let k=0;k<P.count;k++)idx[io++]=o+k;o+=P.count;});
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeBoundingBox();
  return WISP_T={geo,inv:ms.map(m=>m.matrixWorld.clone().invert()),box:geo.boundingBox.clone()};}
function makeFireWisp(){const T=wispTemplate();if(!T)return null;const g=new THREE.Group(),body=new THREE.Group(),fit=new THREE.Group();g.add(body);body.add(fit);
  const sc=MODELS.wisp.scene.clone(true),bones=[];sc.traverse(x=>{if(x.isMesh){bones.push(x);x.visible=false;}});fit.add(sc);
  const mat=new THREE.MeshStandardMaterial({color:0xff4a10,emissive:0xff6a1a,emissiveIntensity:1.6,roughness:.5,skinning:true});
  const sk=new THREE.SkinnedMesh(T.geo,mat);sk.frustumCulled=false;fit.add(sk);sk.bind(new THREE.Skeleton(bones,T.inv),new THREE.Matrix4());
  const sz=T.box.getSize(new THREE.Vector3()),c=T.box.getCenter(new THREE.Vector3()),k=6/Math.max(sz.x,sz.y,sz.z);fit.scale.setScalar(k);fit.position.copy(c).multiplyScalar(-k);
  const mixer=new THREE.AnimationMixer(sc);if(MODELS.wisp.animations[0])mixer.clipAction(MODELS.wisp.animations[0]).play();mixer.update(Math.random()*1.2);
  {body.updateMatrixWorld(true);const c2=new THREE.Vector3(),v=new THREE.Vector3();bones.forEach(b=>c2.add(body.worldToLocal(b.getWorldPosition(v))));c2.multiplyScalar(1/bones.length);fit.position.sub(c2);}
  const gl=glowSprite(0xff6a1a,4,.75);body.add(gl);
  return {g,mat,legs:[],body,custom(e,dt){mixer.update(dt);body.position.y=Math.sin(e.t*1.8)*.18;body.rotation.y+=dt*.6;gl.scale.setScalar(4*(.9+Math.random()*.15));}};}
// Vash plays the creature's own clips: battle idle, walk and run by speed, a roar on first sight, attacks for the slam and the bolts, flinches and death
// A creature that plays its own clips: idle, walk and run by speed, attacks on the wind-up (melee) or the slam (bosses),
// a roar on first sight, flinches or dodges when hit, and its death clip (or a topple when it has none)
function makeClipCreature(id,c){const M=MODELS[id];if(!M)return null;const g=new THREE.Group(),fit=new THREE.Group();g.add(fit);const o=THREE.SkeletonUtils.clone(M.scene);fit.add(o);const mats=[];
  o.traverse(x=>{if(!x.isMesh)return;x.frustumCulled=false;x.castShadow=true;x.material=x.material.clone();if(c.paint)c.paint(x.material);mats.push(x.material);});
  const B={};o.traverse(x=>{if(x.isBone)B[x.name.replace(/_\d+$/,'')]=x;});
  const bb=boneBox(o,g),k=c.height/(bb.max.y-bb.min.y);fit.scale.setScalar(k);const ctr=bb.getCenter(new THREE.Vector3());fit.position.set(-ctr.x*k,-bb.min.y*k,-ctr.z*k);
  const mixer=new THREE.AnimationMixer(o),A={};for(const clip of M.animations){const nm=clip.name.split('|').pop();
    // movement comes from the game, so clips keep their root in place (deaths may still fall over)
    if(nm!==c.death)for(const t of clip.tracks)if(/\.position$/.test(t.name)&&c.root.test(t.name)){const v=t.values,x0=v[0],z0=v[2];for(let i=0;i<v.length;i+=3){v[i]=x0;v[i+2]=z0;}}
    A[nm]=mixer.clipAction(clip);}
  const base=[c.idle,c.walk,c.run].filter(n=>A[n]),bw={};base.forEach((n,i)=>{bw[n]=i?0:1;A[n].play();A[n].setEffectiveWeight(bw[n]);});
  let one=null,oneT=0,oneW=0,dead=false,fall=0;const pick=l=>Array.isArray(l)?l[Math.floor(Math.random()*l.length)]:l;
  const fire=l=>{const n=pick(l),a=A[n];if(!a||dead)return;if(one&&one!==a)one.stop();a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();one=a;oneT=a.getClip().duration;oneW=0;};
  const tele=c.ring?new THREE.Mesh(new THREE.RingGeometry(.1,1,64),new THREE.MeshBasicMaterial({color:c.ring,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide})):null;if(tele){tele.rotation.x=-Math.PI/2;tele.visible=false;}
  const step=dt=>{if(one){oneT-=dt;oneW=Math.min(1,oneW+dt*8);if(oneT<=.2)oneW=Math.min(oneW,Math.max(0,oneT/.2));one.setEffectiveWeight(oneW);if(oneT<=0){one.stop();one=null;oneW=0;}}
    for(const n of base)A[n].setEffectiveWeight(bw[n]*(1-oneW));mixer.update(dt);};
  // optional hand-made motion on top of the clips, about axes in the creature's frame (x left, y up, z forward)
  const tracked=new Set();for(const a of Object.values(A))a.getClip().tracks.forEach(t=>tracked.add(t.name.split('.')[0]));
  const rest={};for(const n in B)rest[n]=B[n].quaternion.clone();const qi=new THREE.Quaternion(),qa=new THREE.Quaternion(),ax=new THREE.Vector3();
  const rot=(n,axis,a)=>{const b=B[n];if(!b||!a)return;g.getWorldQuaternion(qi);b.parent.getWorldQuaternion(qa);qa.premultiply(qi.invert());ax.copy(axis).applyQuaternion(qa.invert());b.quaternion.premultiply(qi.setFromAxisAngle(ax,a));b.updateMatrixWorld(true);};
  const procRestore=()=>{for(const n of c.procBones||[])if(B[n]&&!tracked.has(B[n].name))B[n].quaternion.copy(rest[n]);g.updateMatrixWorld(true);};
  return {g,mat:mats[0],mats,legs:[],body:fit,tele,hand:B[c.hand]||null,
    custom(e,dt,speed){if(c.roar&&e.state==='chase'&&!e._roared){e._roared=1;fire(c.roar);}
      if(c.slam&&e.windup>0&&!e._wu){e._wu=1;fire(c.slam);}if(!(e.windup>0))e._wu=0;
      if(c.attack&&e.wind>0&&!e._wf){e._wf=1;fire(c.attack);}if(!(e.wind>0))e._wf=0;
      const tw={};tw[c.idle]=speed<.3?1:0;if(c.walk)tw[c.walk]=speed>=.3&&speed<c.runAt?1:0;if(c.run)tw[c.run]=speed>=c.runAt?1:0;if(!c.run&&c.walk)tw[c.walk]=speed>=.3?1:0;
      for(const n in bw)bw[n]+=((tw[n]||0)-bw[n])*Math.min(1,dt*6);
      if(A[c.walk])A[c.walk].timeScale=clamp(speed/c.walkRef,.6,1.6);if(A[c.run])A[c.run].timeScale=clamp(speed/c.runRef,.8,1.4);step(e.frozen>0?0:dt);if(c.proc&&e.frozen<=0){procRestore();c.proc(e,dt,speed,rot);}
      if(e.lunge>0){const q=Math.sin(e.lunge/.25*Math.PI);g.position.x+=Math.sin(e.face)*q*.6;g.position.z+=Math.cos(e.face)*q*.6;}},
    onShoot(){if(c.shoot&&!one)fire(c.shoot);},onHit(){if(c.hit&&!one&&Math.random()<(c.hitP||.25))fire(c.hit);},
    onDie(){mixer.stopAllAction();dead=true;one=null;fall=0;const a=A[c.death];if(!a)return;a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.setEffectiveWeight(1);a.play();},
    dieUpdate(dt){if(A[c.death])mixer.update(dt);else{fall=Math.min(1,fall+dt*2.2);fit.rotation.x=-fall*fall*1.45;}},
    reset(){dead=false;fall=0;fit.rotation.x=0;mixer.stopAllAction();for(const n of base)A[n].reset().play();base.forEach((n,i)=>bw[n]=i?0:1);}};}
// Ash Golem: "Golem Rigged" by FourthGreen (CC BY 4.0): its own idle, with a heavy stomp, an overhead two-fisted slam and a flinch layered on
const GX=new THREE.Vector3(1,0,0),GZ=new THREE.Vector3(0,0,1);
function makeRockGolem(){return makeClipCreature('golem',{height:3.2,root:/Root_M/,idle:'Take 001',runAt:99,walkRef:3,runRef:3,paint:m=>{m.roughness=.85;m.metalness=0;},
  procBones:['Root_M','Spine1_M','Hip_L','Hip_R','Knee_L','Knee_R','Shoulder_L','Shoulder_R','Elbow_L','Elbow_R'],
  proc(e,dt,speed,rot){const mv=Math.min(1,speed/2.5),ph=e.phase*2,s=Math.sin(ph);
    rot('Root_M',GZ,s*.07*mv);for(const [sd,sg] of[['L',1],['R',-1]]){rot('Hip_'+sd,GX,-s*sg*.45*mv);rot('Knee_'+sd,GX,Math.max(0,-s*sg)*.6*mv);rot('Shoulder_'+sd,GX,s*sg*.3*mv);}
    // the slam: both fists rise over the head through the wind-up, then come down hard
    const w=e.windup>0?e.windup:e.wind>0?e.wind:0;if(w>0){e._gup=Math.min(1,(e._gup||0)+dt*2.2);e._gdn=.35;}else{e._gup=Math.max(0,(e._gup||0)-dt*6);e._gdn=Math.max(0,(e._gdn||0)-dt);}
    const up=e._gup,dn=e._gdn>0?Math.sin((1-e._gdn/.35)*Math.PI):0;
    if(up||dn){rot('Spine1_M',GX,-.25*up+.5*dn);for(const sd of['L','R']){rot('Shoulder_'+sd,GX,-2.6*up+.4*dn);rot('Elbow_'+sd,GX,-.6*up);}}
    if(e.flash>0)rot('Spine1_M',GX,-e.flash*2.5);}});}
// Vash: "Nightmare Creature 1#"
function makeVash(){return makeClipCreature('vash',{height:5.6,root:/Base_bone|Hips_ctrl/,idle:'battle_idle',walk:'walk',run:'Run',runAt:4.6,walkRef:2.4,runRef:6,
  roar:'roar',slam:'attack_3',shoot:['attack_1','attack_2'],hit:'hit_1',death:'death_1',hand:'HandR',ring:0xb98cff});}
// Reed Stalker: "Alien Ninja Creature" by Jungle Jim (CC BY 4.0): stalks, strikes in combos and sidesteps when shot
function makeNinjaStalker(){return makeClipCreature('stalker',{height:1.95,root:/RL_BoneRoot|CC_Base_Hip/,idle:'A_idle',walk:'A_walk_F',run:'A_run_F',runAt:4,walkRef:1.8,runRef:6.4,
  attack:['A_atk_01','A_atk_02','A_combo_01_1'],hit:['A_avoid_L','A_avoid_R'],hitP:.2,paint:m=>{m.color.multiplyScalar(1.8);m.metalness=Math.min(m.metalness,.3);m.envMap=protaEnv();m.envMapIntensity=.8;}});}
// Glider Ray: "Manta Ray Birostris" by Violaine (CC BY-NC-SA 4.0): swims through the air and banks into its turns
function makeMantaRay(){const M=MODELS.ray;if(!M)return null;const g=new THREE.Group(),body=new THREE.Group(),fit=new THREE.Group();g.add(body);body.add(fit);
  const o=THREE.SkeletonUtils.clone(M.scene);fit.add(o);let mat=null;o.traverse(x=>{if(!x.isMesh)return;x.frustumCulled=false;x.castShadow=true;x.material=x.material.clone();x.material.side=THREE.DoubleSide;mat=x.material;});
  const bb=skinBox(o,body),sz=bb.getSize(new THREE.Vector3()),k=3.4/Math.max(sz.x,sz.z),c=bb.getCenter(new THREE.Vector3());fit.scale.setScalar(k);fit.position.copy(c).multiplyScalar(-k);
  const mixer=new THREE.AnimationMixer(o);if(M.animations[0]){const a=mixer.clipAction(M.animations[0]);a.timeScale=1.8;a.play();}mixer.update(Math.random()*7);let lf=null;
  return {g,mat,legs:[],body,custom(e,dt,speed){mixer.update(dt*(.7+Math.min(1,speed/7)*.6));const turn=lf===null?0:wrapA(e.face-lf)/Math.max(dt,1e-3);lf=e.face;
    body.rotation.z+=(clamp(-turn*.25,-.6,.6)-body.rotation.z)*Math.min(1,dt*3);body.rotation.x+=((e.lunge>0||e.wind>0?.45:0)-body.rotation.x)*Math.min(1,dt*4);body.position.y=Math.sin(e.t*1.3)*.25;}};}

/* ---------- enemy types ---------- */
const ETYPES={
  skitter:{name:'Skitter',hp:32,dmg:7,xp:14,speed:4.6,aggro:13,reach:1.9,cd:1.25,r:.9,ai:'melee',model:()=>makeSkitter(false)},
  sandSkitter:{name:'Dune Skitter',hp:40,dmg:9,xp:18,speed:5,aggro:14,reach:1.9,cd:1.2,r:.9,ai:'melee',model:()=>makeSkitter(false,0xb08a5a)},
  frost:{name:'Frost Skitter',hp:58,dmg:11,xp:24,speed:5,aggro:15,reach:2,cd:1.15,r:1,ai:'melee',model:()=>makeSkitter(true),scale:1.1,drop:'frostchitin'},
  brood:{name:'Brood Mother',hp:180,dmg:16,xp:90,speed:3.8,aggro:16,reach:2.6,cd:1.6,r:1.8,ai:'melee',elite:true,model:()=>makeSkitter(false,0x6a2a7a),scale:1.9},
  stalker:{name:'Reed Stalker',hp:70,dmg:13,xp:30,speed:6.4,aggro:18,reach:2.2,cd:1.1,r:1,ai:'melee',model:()=>makeNinjaStalker()||makeStalker()},
  glider:{name:'Glider Ray',hp:55,dmg:10,xp:28,speed:7,aggro:22,reach:2.2,cd:1.6,r:1.2,ai:'flyer',fly:5,model:()=>makeMantaRay()||makeRay()},
  wisp:{name:'Ember Wisp',hp:48,dmg:12,xp:30,speed:5,aggro:24,reach:2,cd:1.8,r:.7,ai:'flyer',fly:3.2,shoot:{dmg:11,col:0xff7a2a,rate:1.4,speed:24},model:()=>makeFireWisp()||makeWisp()},
  drone:{name:'Maintenance Drone',hp:40,dmg:8,xp:18,speed:5.5,aggro:20,reach:2,cd:1.4,r:.7,ai:'flyer',fly:2.4,shoot:{dmg:7,col:0xff3a2a,rate:1.1,speed:30},model:()=>makeBotDrone()||makeDrone()},
  sentinel:{name:'Rogue Sentinel',hp:90,dmg:15,xp:38,speed:3.6,aggro:16,reach:2.2,cd:1.5,r:.9,ai:'melee',model:()=>makeSentinel()},
  golem:{name:'Ash Golem',hp:140,dmg:20,xp:55,speed:3,aggro:16,reach:3,cd:2.2,r:1.4,ai:'melee',slam:true,model:()=>makeRockGolem()||makeGolem()},
  raider:{name:'Dust Jackal',hp:60,dmg:7,xp:26,speed:4.4,aggro:24,reach:2,cd:1.4,r:.6,ai:'ranged',keep:12,shoot:{dmg:7,col:0xffa94a,rate:1.3,speed:44},model:()=>makeHumanEnemy({qt:['m','Punk','Punk_Head'],tint:0xb08a6a,held:'rifle'}),human:true},
  raiderBrute:{name:'Jackal Bruiser',hp:120,dmg:14,xp:45,speed:4,aggro:20,reach:2.4,cd:1.3,r:.7,ai:'melee',model:()=>makeHumanEnemy({qt:['m','Worker','Swat_Head'],tint:0x8a6a4a,tintAmt:.5,scale:1.12}),human:true},
  merc:{name:'Gray Cohort Merc',hp:85,dmg:10,xp:40,speed:4.6,aggro:26,reach:2,cd:1.4,r:.6,ai:'ranged',keep:13,shoot:{dmg:10,col:0xff4a5e,rate:1.6,speed:52},model:()=>makeHumanEnemy({qt:['m','Worker','Swat_Head'],tint:0x5a5a62,tintAmt:.7,held:'rifle'}),human:true},
  breacher:{name:'Cohort Breacher',hp:150,dmg:18,xp:60,speed:4.2,aggro:22,reach:2.4,cd:1.4,r:.7,ai:'melee',model:()=>makeHumanEnemy({qt:['m','Suit','Swat_Head'],tint:0x3a3a42,tintAmt:.6,scale:1.14}),human:true},
  // bosses
  warden:{name:'Hollow Warden',hp:900,dmg:22,xp:600,speed:3.3,aggro:24,reach:3.6,cd:2.4,r:2,ai:'boss',boss:'warden',model:()=>makeAlienWarden()||makeWarden()},
  borer:{name:'The Dune Borer',hp:1300,dmg:26,xp:800,speed:7,aggro:40,reach:3.5,cd:2,r:2.6,ai:'boss',boss:'borer',dieT:2.4,model:()=>makeWormBorer()||makeBorer()},
  jackalBoss:{name:'Mara Voss, Jackal Chief',hp:700,dmg:12,xp:500,speed:4.8,aggro:30,reach:2.2,cd:1,r:.7,ai:'boss',boss:'gunner',shoot:{dmg:10,col:0xffa94a,rate:3,speed:50},model:()=>makeHumanEnemy({qt:['f','Punk','women:Soldier_Head'],tint:0xa0402a,held:'rifle',scale:1.08}),human:true},
  rusk:{name:'Commander Rusk',hp:1500,dmg:16,xp:900,speed:5,aggro:30,reach:2.4,cd:1,r:.8,ai:'boss',boss:'gunner',shoot:{dmg:14,col:0xff4a5e,rate:3.4,speed:56},model:()=>makeHumanEnemy({qt:['m','Suit','Swat_Head'],tint:0x2a2a32,tintAmt:.5,held:'rifle',scale:1.15}),human:true},
  leviathan:{name:'The Glass Leviathan',hp:2200,dmg:24,xp:1200,speed:7,aggro:50,reach:4,cd:2.2,r:4,ai:'boss',boss:'leviathan',fly:9,shoot:{dmg:16,col:0x8fffe0,rate:1.2,speed:30},model:()=>makeLeviathan()},
  keeper:{name:'Vash, in the Ark Shell',hp:3800,dmg:28,xp:2500,speed:3.6,aggro:60,reach:4,cd:2,r:2.3,ai:'boss',boss:'keeper',dieT:2.4,shoot:{dmg:18,col:0xb98cff,rate:2,speed:34},model:()=>makeVash()||makeAlienWarden({tint:0xc0a2e4,glow:0x6a2ab0,ring:0xb98cff,scale:3.3})||(w=>{w.g.scale.setScalar(1.25);w.mat.emissive.set(0xb98cff);return w;})(makeWarden())},
};

/* ---------- spawning ---------- */
function spawnEnemy(type,hx,hz,lvl,o={}){
  const T=ETYPES[type];if(!T)return null;const m=T.model();const sc=(T.scale||1)*(o.scale||1);if(!m.human&&!m.robot)m.g.scale.setScalar(sc);else m.g.scale.multiplyScalar(sc);
  W.group.add(m.g);const L=lvl||1,hpMul=1+(L-1)*.22,dmgMul=1+(L-1)*.15;
  const el=document.createElement('div');el.className='ehp'+(T.ai==='boss'?' boss':'');el.innerHTML=`<span class="n">${esc(o.name||T.name)} <small>LV ${L}</small></span><div class="bar"><i></i></div>`;el.hidden=true;$('#labels').appendChild(el);
  const e={type,T,m,el,bar:el.querySelector('i'),hx,hz,x:hx,z:hz,y:groundY(hx,hz),face:Math.random()*6.28,lvl:L,maxHp:Math.round(T.hp*hpMul*(o.hpMul||1)),dmg:T.dmg*dmgMul,hp:0,cd:0,state:'wander',wt:0,wx:hx,wz:hz,phase:0,flash:0,dead:false,dying:0,respawn:0,provoked:0,windup:0,lunge:0,wind:0,
    id:o.id,quest:o.quest,respawnT:o.respawn===undefined?(T.ai==='boss'?Infinity:55):o.respawn,leash:o.leash||(T.ai==='boss'?40:45),scaleBase:sc,burn:0,frozen:0,stun:0,fleeT:0,shootT:rf(.5,2),fly:T.fly||0,t:Math.random()*10,loot:o.loot,elite:T.elite||o.elite,
    baseEm:m.mat&&m.mat.emissive?m.mat.emissive.getHex():0,baseEi:m.mat?m.mat.emissiveIntensity:1};
  e.hp=e.maxHp;if(m.tele)W.group.add(m.tele);W.enemies.push(e);return e;}
function spawnGroup(type,cx,cz,r,n,lvl,o={}){const out=[];let k=0,t=0;while(k<n&&t<200){t++;const a=Math.random()*6.28,d=Math.sqrt(Math.random())*r,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;if(nearAny(x,z,W.safe||[]))continue;if(W.water&&groundY(x,z)<W.water.y-.4&&!ETYPES[type].fly)continue;out.push(spawnEnemy(type,x,z,lvl,o));k++;}return out;}

/* ---------- AI ---------- */
const _ev=new THREE.Vector3();
function updateEnemies(dt,paused){
  for(const e of W.enemies){const m=e.m,T=e.T;e.t+=dt;
    if(e.dead){if(e.dying>0){e.dying-=dt;const k=Math.max(0,e.dying/(T.dieT||.8));if(m.dieUpdate){m.dieUpdate(dt);}else if(m.human){if(!(m.anim&&m.anim.a.death)){m.g.rotation.x=-(1-k)*1.45;m.g.position.y=e.y-(1-k)*.2;}}else if(m.robot){}else if(m.alien){m.alien.die(1-k);}else{m.g.scale.setScalar(e.scaleBase*Math.max(.01,k));m.g.rotation.z=(1-k)*.8;}if(e.dying<=0)m.g.visible=false;}
      else if(isFinite(e.respawnT)){e.respawn-=dt;if(e.respawn<=0&&Math.hypot(player.x-e.hx,player.z-e.hz)>36)reviveEnemy(e);}if(m.anim){m.anim.update(dt,0);if(m.rider&&m.g.visible)m.rider.sync();}continue;}
    const dx=player.x-e.x,dz=player.z-e.z,d=Math.hypot(dx,dz);let tx=e.x,tz=e.z,speed=0;
    const frozen=e.frozen>0,stunned=e.stun>0;e.frozen=Math.max(0,e.frozen-dt);e.stun=Math.max(0,e.stun-dt);
    if(e.burn>0){e.burn-=dt;e.burnTick=(e.burnTick||0)-dt;if(e.burnTick<=0){e.burnTick=.5;damageEnemy(e,e.burnDps*.5,{silent:true,noKnock:true,col:'burn'});if(e.dead)continue;FX.burst(_ev.set(e.x,e.y+1,e.z),0xff7a2a,6,2,.4,.12);}}
    if(!paused&&!stunned){
      e.provoked=Math.max(0,e.provoked-dt);e.cd=Math.max(0,e.cd-dt);const home=Math.hypot(e.x-e.hx,e.z-e.hz);
      if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.lunge=.25;if(d<T.reach+.9&&!player.dead){if(player.onGround||T.fly)hurtPlayer(e.dmg,e);else floatText('Dodged',player.x,player.y+2.2,player.z,'xp');}}}
      if(e.fleeT>0){e.fleeT-=dt;const ax=e.x-e.fx,az=e.z-e.fz,ad=Math.hypot(ax,az)||1;tx=e.x+ax/ad*6;tz=e.z+az/ad*6;speed=T.speed*1.1;e.state='wander';}
      else if(T.ai==='boss'){tx=player.x;tz=player.z;speed=bossAI(e,dt,d,dx,dz);}// a boss that returns a speed walks at you
      else if(e.state==='return'){tx=e.hx;tz=e.hz;speed=T.speed;if(home<3){e.state='wander';e.hp=e.maxHp;}}
      else if((d<T.aggro*(PS.scan?1+PS.scan/100:1)||e.provoked>0)&&home<e.leash&&!player.dead){
        e.state='chase';
        if(T.ai==='ranged'){const keep=T.keep||12;if(d>keep+3){tx=player.x;tz=player.z;speed=T.speed;}else if(d<keep-4){tx=e.x-dx;tz=e.z-dz;speed=T.speed*.8;}else{const sx=-dz/d,sz=dx/d,sd=Math.sin(e.t*.7+e.hx)>0?1:-1;tx=e.x+sx*sd*3;tz=e.z+sz*sd*3;speed=T.speed*.55;}
          e.shootT-=dt;if(e.shootT<=0&&d<T.aggro+6&&!frozen){e.shootT=1/T.shoot.rate*rf(.8,1.3);enemyShoot(e);}
          if(d<T.reach&&e.cd<=0&&!frozen){e.wind=.3;e.cd=T.cd;}}
        else if(T.ai==='flyer'){const orbit=T.shoot?9:3.5,ang=Math.atan2(e.z-player.z,e.x-player.x)+dt*.8;if(T.shoot){tx=player.x+Math.cos(ang)*orbit;tz=player.z+Math.sin(ang)*orbit;speed=T.speed;e.shootT-=dt;if(e.shootT<=0&&!frozen){e.shootT=1/T.shoot.rate*rf(.8,1.3);enemyShoot(e);}}
          else{if(d>T.reach){tx=player.x;tz=player.z;speed=T.speed;}else if(e.cd<=0&&!frozen){e.wind=.25;e.cd=T.cd;}}}
        else{if(d>T.reach){tx=player.x;tz=player.z;speed=T.speed;}else if(e.cd<=0&&!(e.wind>0)&&!frozen){if(T.slam){e.windup=.8;e.cd=T.cd;}else{e.wind=.34;e.cd=T.cd;}}}
        if(T.slam&&e.windup>0){e.windup-=dt;if(e.windup<=0){sfx('slam');shockwave(e);}speed=0;}
        e.face+=wrapA(Math.atan2(dx,dz)-e.face)*clamp(dt*8,0,1);
      }else{
        if(e.state==='chase'){e.state=home>8?'return':'wander';e.windup=0;}
        if(e.state==='wander'){e.wt-=dt;if(e.wt<=0){e.wt=rf(2,5);const a=Math.random()*6.28,r=Math.random()*9;e.wx=e.hx+Math.cos(a)*r;e.wz=e.hz+Math.sin(a)*r;}if(Math.hypot(e.wx-e.x,e.wz-e.z)>.6){tx=e.wx;tz=e.wz;speed=T.speed*.32;}}}
      if(frozen)speed*=.35;
      if(speed>0){const ddx=tx-e.x,ddz=tz-e.z,dd=Math.hypot(ddx,ddz);if(dd>.01){const s=Math.min(dd,speed*dt);const p={x:e.x+ddx/dd*s,z:e.z+ddz/dd*s};if(!T.boss&&(!T.fly||W.interior)){collide(p,T.r*.6);platWalls(p,T.fly?W.floorY:e.y,T.r*.6);}// indoors, flyers keep to the rooms too
        if(W.safe)for(const sz of W.safe){const sd=Math.hypot(p.x-sz.x,p.z-sz.z);if(sd<sz.r&&e.state!=='return'){p.x=sz.x+(p.x-sz.x)/sd*sz.r;p.z=sz.z+(p.z-sz.z)/sd*sz.r;}}
        if(W.water&&!T.fly&&groundY(p.x,p.z)<W.water.y-.8){p.x=e.x;p.z=e.z;}
        e.x=p.x;e.z=p.z;if(e.state!=='chase')e.face+=wrapA(Math.atan2(ddx,ddz)-e.face)*clamp(dt*5,0,1);}}
      if(d<T.r+.5&&d>.01&&!T.fly){e.x-=dx/d*(T.r+.5-d);e.z-=dz/d*(T.r+.5-d);}}
    e.phase+=speed*dt*2.4;e.lunge=Math.max(0,e.lunge-dt);
    const gy=groundY(e.x,e.z);e.y=T.fly?lerp(e.y,gy+e.fly+Math.sin(e.t*1.7)*.4,clamp(dt*3,0,1)):gy;
    m.g.position.set(e.x,e.y+(e.air||0),e.z);m.g.rotation.y=e.face;
    e.animAcc=(e.animAcc||0)+dt;if(m.g.visible&&(e.T.ai==='boss'||inView(e.x,e.y+1,e.z,(e.T.r||1)+2.5))){animateEnemy(e,e.animAcc,speed);e.animAcc=0;}
    if(e.flash>0){e.flash-=dt;if(m.mat&&m.mat.emissive){m.mat.emissive.setHex(0xffffff);m.mat.emissiveIntensity=e.flash*5;}}else if(m.mat&&m.mat.emissive){m.mat.emissive.setHex(e.frozen>0?0x6fd8ff:e.baseEm);m.mat.emissiveIntensity=e.frozen>0?.6:e.baseEi;}
  }
}
function animateEnemy(e,dt,speed){const m=e.m;
  if(m.custom){m.custom(e,dt,speed);return;}
  if(m.alien){m.alien.update(e,dt,speed);if(e.lunge>0){const k=Math.sin(e.lunge/.25*Math.PI);m.g.position.x+=Math.sin(e.face)*k*.6;m.g.position.z+=Math.cos(e.face)*k*.6;}return;}
  if(m.anim){const aim=e.state==='chase'&&(e.T.ai==='ranged'||e.T.shoot)&&m.human?1:0;if(e.wind>0&&!e._wf){m.anim.oneShot(m.robot?'punch':'punch');e._wf=1;}if(e.wind<=0)e._wf=0;if(m.rider){if(e.windup>0&&!e._wu){m.anim.oneShot('slash');e._wu=1;}if(!(e.windup>0))e._wu=0;}
    m.anim.update(dt,speed>.3?speed:0,e.frozen>0,{aim,gun:!!(m.person&&m.person.held)});if(m.rider)m.rider.sync();if(m.person&&m.person.updateHeld)m.person.updateHeld(aim,e.face);return;}
  if(e.type==='warden'||e.type==='keeper'){m.g.position.y=e.y+Math.sin(e.t*1.6)*.25;m.arms.forEach((a,i)=>{a.rotation.x=e.windup>0?-2.4+(1-e.windup/.75)*.4:Math.sin(e.t*1.2+i*3)*.25+Math.sin(e.phase)*.3;a.rotation.z=(i?-1:1)*.15;});
    m.shards.forEach((s,i)=>{const a=e.t*1.4+i*1.047;s.position.set(Math.cos(a)*3.2,3.5+Math.sin(e.t*2+i)*.8,Math.sin(a)*3.2);s.rotation.set(e.t,e.t*2,0);});m.core.scale.setScalar(1+Math.sin(e.t*4)*.12);return;}
  if(m.arms&&e.type==='golem'){m.arms.forEach((a,i)=>{a.rotation.x=e.windup>0?-2.2:Math.sin(e.phase+i*Math.PI)*.4;});m.body.position.y=Math.abs(Math.sin(e.phase))*.08;return;}
  if(m.segs){m.segs.forEach((s,i)=>{const back=i*1.9;s.position.set(Math.sin(e.t*2-i*.6)*.6,(e.sub?-2.6:1.2)+Math.sin(e.t*3-i*.7)*.4*(e.sub?0:1)-i*.08,-back);s.rotation.z=e.t*(i%2?.5:-.5);});return;}
  if(m.wing){const f=Math.sin(e.t*4)*.25;m.wing.rotation.z=f*.3;m.body.rotation.z=Math.sin(e.t*1.3)*.2;m.body.position.y=Math.sin(e.t*2)*.15;return;}
  if(m.shards){m.shards.forEach((s,i)=>{const a=e.t*2+i*1.25;s.position.set(Math.cos(a)*.55,Math.sin(e.t*3+i)*.3,Math.sin(a)*.55);s.rotation.set(e.t*2,a,0);});return;}
  if(m.legs.length){m.body.position.y=Math.abs(Math.sin(e.phase*2))*.06-(e.wind>0?.2:0);m.legs.forEach(l=>{const u=l.userData;const ph=e.phase*2+u.i*2.1+(u.s>0?Math.PI:0);l.rotation.y=u.by+Math.sin(ph)*.35;l.rotation.z=Math.max(0,Math.cos(ph))*.18*u.s*(speed>0?1:0);if(e.type==='stalker'){l.rotation.x=Math.sin(ph)*.5;l.rotation.y=0;}});
    if(e.lunge>0){const k=Math.sin(e.lunge/.25*Math.PI);m.g.position.x+=Math.sin(e.face)*k*.6;m.g.position.z+=Math.cos(e.face)*k*.6;}}
  else if(m.body){m.body.rotation.z=Math.sin(e.t*2)*.08;}
}
function reviveEnemy(e){e.dead=false;if(e.m.reset)e.m.reset();if(e.m.alien)e.m.alien.reset();if(e.m.anim&&e.m.anim.revive)e.m.anim.revive();e.hp=e.maxHp;e.x=e.hx;e.z=e.hz;e.m.g.visible=true;e.m.g.rotation.set(0,0,0);if(!e.m.human&&!e.m.robot)e.m.g.scale.setScalar(e.scaleBase);e.state='wander';e.burn=e.frozen=e.stun=0;}
/* ---------- bosses ---------- */
const waves=[];
function shockwave(e,big){const m=new THREE.Mesh(new THREE.RingGeometry(.82,1,96),new THREE.MeshBasicMaterial({color:e.type==='keeper'?0xb98cff:0xff4a5e,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;W.group.add(m);
  waves.push({x:e.x,z:e.z,r:1.2,hit:false,dmg:e.dmg*(big?1.3:1),m,max:big?16:11});if(!G.flags.waveHint){G.flags.waveHint=true;vesta('That slam sends a shockwave along the ground. Jump over the ring.');}}
function updateWaves(dt){for(let i=waves.length-1;i>=0;i--){const w=waves[i];w.r+=9*dt;const k=w.r/w.max;w.m.position.set(w.x,groundY(w.x,w.z)+.25,w.z);w.m.scale.setScalar(w.r);w.m.material.opacity=.85*(1-k);
  if(Math.random()<.8){const a=Math.random()*6.28,x=w.x+Math.cos(a)*w.r,z=w.z+Math.sin(a)*w.r;FX.spawn(x,groundY(x,z)+.2,z,0,rf(1,3),0,{life:.4,size:.2,c0:0xff8a8a,c1:0x401018,drag:2,grav:4});}
  const d=Math.hypot(player.x-w.x,player.z-w.z);if(!w.hit&&Math.abs(d-w.r)<.8&&!player.dead){w.hit=true;if(player.onGround)hurtPlayer(w.dmg);else floatText('Dodged',player.x,player.y+2.2,player.z,'xp');}
  if(w.r>w.max){W.group.remove(w.m);w.m.geometry.dispose();waves.splice(i,1);}}}
function bossAI(e,dt,d,dx,dz){const T=e.T;if(d>T.aggro&&e.provoked<=0)return 0;e.state='chase';e.face+=wrapA(Math.atan2(dx,dz)-e.face)*clamp(dt*4,0,1);const phase2=e.hp<e.maxHp*.5;
  if(!e.announced){e.announced=true;bossBar(e);}
  if(T.boss==='warden'||T.boss==='keeper'){
    // mid-leap: an arc onto the spot you were standing, marked by a ring, then a crash and a shockwave
    if(e.leap){const L=e.leap;L.t+=dt;const k=Math.min(1,L.t/L.dur),t=e.m.tele;e.x=lerp(L.x0,L.x1,k);e.z=lerp(L.z0,L.z1,k);e.air=Math.sin(k*Math.PI)*L.h;
      if(t){t.visible=true;t.position.set(L.x1,groundY(L.x1,L.z1)+.15,L.z1);t.scale.setScalar(3.4);t.material.opacity=.3+k*.5;}
      if(k>=1){e.leap=null;e.air=0;if(t)t.visible=false;sfx('slam');cam.shake=.45;shockwave(e,phase2);if(Math.hypot(player.x-e.x,player.z-e.z)<3.4&&player.onGround)hurtPlayer(e.dmg,e);e.cd=T.cd*.6;e.best=d;e.stuck=0;}return 0;}
    // can't get at you (you're above him, or he's made no headway for a while): shard volleys, then a leap
    if(d<=T.reach||d<(e.best??1e9)-1.5){e.best=d;e.stuck=0;}else e.stuck=(e.stuck||0)+dt;
    const high=player.y-e.y>2.2;e.volT=(e.volT??2.5)-dt;e.leapCd=(e.leapCd??4)-dt;
    if(!(e.windup>0)&&d>T.reach&&(high||e.stuck>2)&&e.volT<=0){e.volT=phase2?1.8:2.8;sfx('zap');
      enemyShoot(Object.assign({},e,{T:Object.assign({},T,{shoot:{dmg:13,col:0xb98cff,rate:1,speed:19}})}),phase2?5:3);}
    if(!(e.windup>0)&&d>T.reach+1&&d<36&&(e.stuck>4||high&&e.stuck>1.5)&&e.leapCd<=0){e.leapCd=phase2?6:9;
      e.leap={t:0,dur:.9+d*.02,x0:e.x,z0:e.z,x1:player.x,z1:player.z,h:6+Math.max(0,player.y-e.y)};sfx('warp');return 0;}
    if(e.windup>0){e.windup-=dt;const k=1-e.windup/.75;const t=e.m.tele;if(t){t.visible=true;t.position.set(e.x,groundY(e.x,e.z)+.15,e.z);t.scale.setScalar(.5+k*3.8);t.material.opacity=.25+k*.45;}if(e.windup<=0){if(t)t.visible=false;sfx('slam');shockwave(e,phase2);if(phase2&&T.boss==='keeper')setTimeout(()=>shockwave(e,true),500);e.cd=T.cd*(phase2?.7:1);}return 0;}
    if(T.shoot){e.shootT-=dt;if(e.shootT<=0){e.shootT=phase2?.45:1/T.shoot.rate;enemyShoot(e,phase2?3:1);}}
    if(d>T.reach){return T.speed*(phase2?1.3:1);}if(e.cd<=0)e.windup=.75;return 0;}
  if(T.boss==='gunner'){e.shootT-=dt;if(e.shootT<=0){e.shootT=1/T.shoot.rate*(phase2?.7:1);enemyShoot(e,phase2?2:1);}
    if(phase2&&!e.called&&e.type==='rusk'){e.called=true;spawnGroup('merc',e.x,e.z,8,3,e.lvl-2,{respawn:Infinity});toast('Rusk calls in reinforcements!');}
    if(phase2&&!e.called&&e.type==='jackalBoss'){e.called=true;spawnGroup('raider',e.x,e.z,8,3,e.lvl-2,{respawn:Infinity});toast('Voss whistles. Jackals pour in!');}
    const keep=11;if(d>keep+3)return T.speed;if(d<keep-3){e.x-=dx/d*T.speed*dt;e.z-=dz/d*T.speed*dt;}else{const sx=-dz/d,sz=dx/d;e.x+=sx*Math.sin(e.t*.6)*T.speed*.6*dt;e.z+=sz*Math.sin(e.t*.6)*T.speed*.6*dt;}return 0;}
  if(T.boss==='borer'){// surfaces under the player, lunges, then dives back down
    e.bt=(e.bt||0)-dt;if(!e.mode){e.mode='under';e.bt=2;e.sub=true;}
    if(e.mode==='under'){e.sub=true;const sp=T.speed*(phase2?1.3:1);if(d>1){e.x+=dx/d*sp*dt;e.z+=dz/d*sp*dt;}if(Math.random()<.6)FX.spawn(e.x+rf(-1,1),groundY(e.x,e.z)+.2,e.z+rf(-1,1),rf(-1,1),rf(1,3),rf(-1,1),{life:.6,size:.3,c0:0xd8b088,c1:0x3a2a1a,drag:2,grav:6});
      if(e.bt<=0){e.mode='rise';e.bt=.9;e.m.tele.visible=true;}}
    else if(e.mode==='rise'){const t=e.m.tele;t.position.set(e.x,groundY(e.x,e.z)+.15,e.z);t.scale.setScalar(3.6);t.material.opacity=.3+Math.sin(e.t*20)*.2;if(e.bt<=0){e.mode='up';e.bt=phase2?2.2:3;e.sub=false;t.visible=false;sfx('boom');if(Math.hypot(player.x-e.x,player.z-e.z)<3.6&&player.onGround)hurtPlayer(e.dmg*1.4);FX.burst(_ev.set(e.x,groundY(e.x,e.z)+1,e.z),0xd8b088,60,8,1,.3);}}
    else if(e.mode==='up'){e.shootT-=dt;if(e.shootT<=0){e.shootT=.9;const s={dmg:12,col:0xffb648,rate:1,speed:22};enemyShoot(Object.assign({},e,{T:Object.assign({},T,{shoot:s}),y:groundY(e.x,e.z)+2}),phase2?5:3);}if(e.bt<=0){e.mode='under';e.bt=phase2?1.5:2.5;}}
    return 0;}
  if(T.boss==='leviathan'){const ang=e.t*.35;const tx=player.x+Math.cos(ang)*16,tz=player.z+Math.sin(ang)*16;e.x=lerp(e.x,tx,dt*.6);e.z=lerp(e.z,tz,dt*.6);
    e.shootT-=dt;if(e.shootT<=0){e.shootT=phase2?.6:1/T.shoot.rate;enemyShoot(e,phase2?4:2);}
    e.dive=(e.dive||8)-dt;if(e.dive<=0){e.dive=phase2?6:9;const s=spawnEnemy('glider',e.x,e.z,e.lvl-3,{respawn:Infinity});if(s)s.provoked=20;}return 0;}
  return 0;}
function enemyShoot(e,n=1){const T=e.T,s=T.shoot;if(!s)return;const o=_ev.set(e.x,e.y+(T.fly?0:1.3),e.z);const hd=e.m.hand||(e.m.rider&&e.m.rider.handR);if(hd){e.m.g.updateMatrixWorld(true);hd.getWorldPosition(o);}if(e.m.onShoot)e.m.onShoot();
  for(let i=0;i<n;i++){const lead=.25,px=player.x+player.vx*lead,pz=player.z+player.vz*lead,py=player.y+1.1;const dir=new THREE.Vector3(px-o.x,py-o.y,pz-o.z).normalize();
    if(n>1){const a=(i-(n-1)/2)*.22;const c=Math.cos(a),sn=Math.sin(a),x=dir.x*c-dir.z*sn,z=dir.x*sn+dir.z*c;dir.x=x;dir.z=z;}
    spawnProjectile({from:'enemy',pos:o.clone(),vel:dir.multiplyScalar(s.speed),dmg:s.dmg*(1+(e.lvl-1)*.15),col:s.col,r:.35,life:3,src:e});}
  if(e.m.anim)sfx('pulse');}
let bossEl=null;
function bossBar(e){if(bossEl)bossEl.remove();showBanner('WARNING',e.T.name);sfx('slam');}

// ===== 15_combat.js =====
/* ================= COMBAT: projectiles, weapons, damage, statuses, loot drops ================= */
const PROJ=[];
const boltGeo=new THREE.CylinderGeometry(.045,.045,1,8,1).rotateX(Math.PI/2),pelletGeo=new THREE.SphereGeometry(.07,8,6),grenadeGeo=new THREE.SphereGeometry(.16,14,10);
const projMats={};
function projMat(col){return projMats[col]||(projMats[col]=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));}
function spawnProjectile(p){const geo=p.kind==='pellet'?pelletGeo:p.kind==='grenade'?grenadeGeo:boltGeo;const m=new THREE.Mesh(geo,p.kind==='grenade'?MAT.gun:projMat(p.col));
  if(p.kind!=='pellet'&&p.kind!=='grenade')m.scale.set(1,1,p.from==='enemy'?.9:1.4);m.position.copy(p.pos);scene.add(m);const gl=glowSprite(p.col,p.from==='enemy'?.9:.7,.8);m.add(gl);
  p.m=m;p.life=p.life||2;PROJ.push(p);return p;}
function clearProjectiles(){for(const p of PROJ)scene.remove(p.m);PROJ.length=0;}
const _pv=new THREE.Vector3();
function updateProjectiles(dt){
  outer:for(let i=PROJ.length-1;i>=0;i--){const p=PROJ[i];p.life-=dt;
    // move in small steps so fast shots can't skip past a target between frames
    const n=Math.max(1,Math.ceil(p.vel.length()*dt/.45)),h=dt/n;
    for(let s=0;s<n;s++){if(p.grav)p.vel.y-=p.grav*h;p.pos.addScaledVector(p.vel,h);let hit=null;
      if(p.from==='player'){for(const e of W.enemies){if(e.dead)continue;const cy=e.y+(e.T.fly?0:e.T.ai==='boss'?3:.9),r=e.T.r+.25;if(Math.abs(p.pos.x-e.x)<r+1&&Math.abs(p.pos.z-e.z)<r+1&&Math.hypot(p.pos.x-e.x,p.pos.z-e.z)<r&&Math.abs(p.pos.y-cy)<r+1.1){hit=e;break;}}
        if(hit){if(p.splash)explode(p);else{damageEnemy(hit,p.dmg,p.fx);FX.impact(p.pos.clone(),p.col,.7);}removeProj(i);continue outer;}
        const nh=npcAt(p.pos.x,p.pos.y,p.pos.z);if(nh){if(p.splash)explode(p);else{hitNPC(nh,p.dmg);FX.impact(p.pos.clone(),p.col,.7);}removeProj(i);continue outer;}}
      else{if(!player.dead&&Math.hypot(p.pos.x-player.x,p.pos.z-player.z)<.7&&p.pos.y>player.y&&p.pos.y<player.y+2){hurtPlayer(p.dmg,p.src);FX.impact(p.pos.clone(),p.col,.5);removeProj(i);continue outer;}}
      const gy=groundY(p.pos.x,p.pos.z);if(p.pos.y<gy+.05||solidAt(p.pos.x,p.pos.y,p.pos.z)){if(p.splash)explode(p);else FX.impact(p.pos.clone(),p.col,.4);removeProj(i);continue outer;}}
    p.m.position.copy(p.pos);if(p.kind!=='pellet'&&p.kind!=='grenade')p.m.lookAt(_pv.copy(p.pos).add(p.vel));
    if(Math.random()<.5)FX.spawn(p.pos.x,p.pos.y,p.pos.z,rf(-.3,.3),rf(-.3,.3),rf(-.3,.3),{life:.18,size:.08,c0:p.col,c1:0x101010,drag:3});
    if(p.life<=0){if(p.splash)explode(p);removeProj(i);}}
}
function removeProj(i){const p=PROJ[i];scene.remove(p.m);PROJ.splice(i,1);}
function explode(p){FX.burst(p.pos.clone(),p.col,70,10,.8,.24);FX.ringAt(p.pos.clone(),'up',p.col,.5,p.splash*2.2,.5,null,0,.08);FX.ringAt(p.pos.clone(),'cam',p.col,.4,p.splash*1.4,.35,null,0,.12);sfx('boom');cam.shake=Math.max(cam.shake||0,.25);
  for(const e of W.enemies){if(e.dead)continue;const d=Math.hypot(e.x-p.pos.x,e.z-p.pos.z);if(d<p.splash+e.T.r)damageEnemy(e,p.dmg*(1-d/(p.splash+e.T.r)*.5),p.fx);}
  if(p.from==='player')for(const n of W.npcs){const d=Math.hypot(n.x-p.pos.x,n.z-p.pos.z);if(d<p.splash+.4)hitNPC(n,p.dmg*(1-d/(p.splash+.4)*.5));}
  if(p.from==='enemy'&&Math.hypot(player.x-p.pos.x,player.z-p.pos.z)<p.splash)hurtPlayer(p.dmg*.7);}

/* ---------- target lock ---------- */
let target=null;
// is there a clear line from the player's chest to a point (no ground or solid object in between)?
function losClear(x,y,z){const ax=player.x,ay=player.y+1.3,az=player.z,d=Math.hypot(x-ax,y-ay,z-az),n=Math.ceil(d/.5);
  for(let i=1;i<n;i++){const t=i/n,px=ax+(x-ax)*t,py=ay+(y-ay)*t,pz=az+(z-az)*t;if(py<groundY(px,pz)-.05||solidAt(px,py,pz))return false;}return true;}
// auto-aim only picks enemies in front of the character: inside a cone around the way it faces (about 35 degrees either side),
// on screen and in clear line of sight. Very close enemies get a wider cone. The enemy already locked on is kept while it stays
// in reach, so a burst doesn't wander from one target to the next.
function findTarget(range){let best=null,bs=1e9;const cfx=Math.sin(player.face),cfz=Math.cos(player.face);
  for(const e of W.enemies){if(e.dead||!e.m.g.visible)continue;const dx=e.x-player.x,dz=e.z-player.z,d=Math.hypot(dx,dz);if(d>range+e.T.r)continue;
    const ty=e.y+(e.T.fly?0:e.T.ai==='boss'?3:.9),dot=(dx*cfx+dz*cfz)/(d||1),cone=d<3.5?.45:.82;if(dot<cone&&!(e===target&&player.lockT>0&&dot>.6))continue;
    if(!inView(e.x,ty,e.z,.5)||!losClear(e.x,ty,e.z))continue;const score=d*(1.8-dot)*(e===target&&player.lockT>0?.6:1);if(score<bs){bs=score;best=e;}}target=best;return best;}
const _mz=new THREE.Vector3();
function muzzlePos(){if(avatar&&avatar.weapon){avatar.weapon.muzzle.getWorldPosition(_mz);return _mz.clone();}return new THREE.Vector3(player.x+Math.sin(player.face)*.5,player.y+1.35,player.z+Math.cos(player.face)*.5);}
/* ---------- first-person aim: what lies under the crosshair ---------- */
// casts the camera's center ray: the nearest enemy it passes close to (a little aim assist), otherwise where it meets the ground or a wall
const _ad=new THREE.Vector3(),_ao=new THREE.Vector3(),_aq=new THREE.Vector3();
function fpAim(range){camera.getWorldDirection(_ad);_ao.copy(camera.position);let tg=null,bt=range;
  for(const e of W.enemies){if(e.dead||!e.m.g.visible)continue;_aq.set(e.x,e.y+(e.T.fly?0:e.T.ai==='boss'?3:.9),e.z).sub(_ao);const t=_aq.dot(_ad);if(t<.5||t>bt+e.T.r)continue;
    const miss=Math.sqrt(Math.max(0,_aq.lengthSq()-t*t)),tol=e.T.r+.35+t*.02;if(miss<tol){bt=t;tg=e;}}
  let end=range;for(let t=.5;t<Math.min(range,tg?bt:range);t+=.4){_aq.copy(_ao).addScaledVector(_ad,t);if(_aq.y<groundY(_aq.x,_aq.z)||solidAt(_aq.x,_aq.y,_aq.z)){end=t;tg=null;break;}}
  const point=tg?new THREE.Vector3(tg.x,tg.y+(tg.T.fly?0:tg.T.ai==='boss'?3:.9),tg.z):_ao.clone().addScaledVector(_ad,tg?bt:end);return {tg,point};}
/* ---------- firing ---------- */
let beamFX=null,beamTick=0;
function fireWeapon(dt,held,pressed){
  const it=activeWeapon();if(!it||player.dead){if(beamFX)stopBeam();return;}const S=weaponStats(it),over=buffOn('over');
  if(S.cls==='beam'){if(!held){if(beamFX)stopBeam();return;}
    const cost=S.energy*dt;if(!over&&G.en<cost){if(beamFX)stopBeam();energyHint();return;}if(!over)G.en-=cost;
    const fa=cam.fp?fpAim(S.range):null;const tg=fa?fa.tg:findTarget(S.range);if(tg&&!fa){player.face=Math.atan2(tg.x-player.x,tg.z-player.z);player.lockT=.5;}player.aimT=.4;
    const o=muzzlePos(),end=fa?fa.point:tg?new THREE.Vector3(tg.x,tg.y+(tg.T.fly?0:tg.T.ai==='boss'?3:.9),tg.z):o.clone().add(new THREE.Vector3(Math.sin(player.face),0,Math.cos(player.face)).multiplyScalar(S.range));
    drawBeam(o,end,S.col);beamTick-=dt;if(beamTick<=0){beamTick=.1;if(!tg){const L=o.distanceTo(end);for(let t=.5;t<L;t+=.5){const q=o.clone().lerp(end,t/L),nh=npcAt(q.x,q.y,q.z);if(nh){hitNPC(nh,S.dmg*.1*PS.dmgMul);break;}}}if(tg){damageEnemy(tg,S.dmg*.1*PS.dmgMul,S,{silentSmall:true});FX.burst(end,S.col,6,3,.3,.1);
      if(S.chain){const n=nearestOther(tg,8);if(n){damageEnemy(n,S.dmg*.06*PS.dmgMul,S,{silentSmall:true});FX.bolt(end,new THREE.Vector3(n.x,n.y+.9,n.z),S.col,.12);}}}}
    beamHum(true,1);return;}
  if(beamFX)stopBeam();
  if(player.cd>0)return;if(!(pressed||(held&&(S.auto||S.cls==='melee'||S.cls==='sidearm'||S.cls==='scatter'||S.cls==='launcher'))))return;
  if(!over&&S.energy>0&&G.en<S.energy){energyHint();return;}
  player.cd=1/S.rate;if(!over)G.en-=S.energy;player.aimT=.6;player.recoil=1;
  const fa=cam.fp&&S.cls!=='melee'?fpAim(S.range):null;
  const tg=fa?fa.tg:findTarget(S.cls==='melee'?S.range+3:S.range);if(tg&&!fa){player.face=Math.atan2(tg.x-player.x,tg.z-player.z);player.lockT=.6;}// nothing to lock on to: fire the way the character faces
  if(S.cls==='melee'){player.melee=.001;weaponSound('melee');setTimeout(()=>meleeHit(S),140);return;}
  poseAvatarNow();const o=muzzlePos();
  const ty=fa?fa.point.y:tg?tg.y+(tg.T.fly?0:tg.T.ai==='boss'?3:.9):o.y;let dir;
  if(fa)dir=fa.point.clone().sub(o).normalize();else if(tg){dir=new THREE.Vector3(tg.x-o.x,ty-o.y,tg.z-o.z).normalize();}else dir=new THREE.Vector3(Math.sin(player.face),0,Math.cos(player.face));
  const col=over?new THREE.Color(S.col).lerp(new THREE.Color(0xffffff),.35).getHex():S.col;
  if(S.cls==='launcher'){const d=fa?Math.min(Math.hypot(fa.point.x-o.x,fa.point.z-o.z),S.speed*1.6):tg?Math.hypot(tg.x-o.x,tg.z-o.z):18,t=d/S.speed,vy=(ty-o.y)/t+ .5*18*t;
    spawnProjectile({from:'player',kind:'grenade',pos:o.clone(),vel:new THREE.Vector3(dir.x,0,dir.z).normalize().multiplyScalar(S.speed).setY(vy),grav:18,dmg:S.dmg*PS.dmgMul,col,splash:S.splash,fx:S,life:4});}
  else for(let i=0;i<S.pellets;i++){const v=dir.clone();if(S.spread){v.x+=rf(-1,1)*S.spread;v.y+=rf(-.6,.6)*S.spread;v.z+=rf(-1,1)*S.spread;v.normalize();}
    spawnProjectile({from:'player',kind:S.pellets>1?'pellet':'bolt',pos:o.clone(),vel:v.multiplyScalar(S.speed),dmg:S.dmg*PS.dmgMul,col,fx:S,life:S.range/S.speed+.1});}
  muzzleFX(o,dir,col,S.cls);weaponSound(S.cls,1);Bus.emit('fired');}
function energyHint(){if(performance.now()-(energyHint.t||0)>1500){energyHint.t=performance.now();toast('Weapon energy depleted. It recharges on its own; an Energy Cell refills it.');}}
function nearestOther(e,r){let b=null,bd=r;for(const o of W.enemies){if(o===e||o.dead)continue;const d=Math.hypot(o.x-e.x,o.z-e.z);if(d<bd){bd=d;b=o;}}return b;}
function meleeHit(S){const fx=Math.sin(player.face),fz=Math.cos(player.face);let n=0;
  for(const e of W.enemies){if(e.dead)continue;const dx=e.x-player.x,dz=e.z-player.z,d=Math.hypot(dx,dz);if(d-e.T.r>S.range)continue;if(d>1.2&&(dx*fx+dz*fz)/d<.2)continue;damageEnemy(e,S.dmg*PS.dmgMul,S);n++;}
  for(const p of W.npcs){if(p.ko||p.holo)continue;const dx=p.x-player.x,dz=p.z-player.z,d=Math.hypot(dx,dz);if(d>S.range+.4)continue;if(d>1.2&&(dx*fx+dz*fz)/d<.2)continue;if(hitNPC(p,S.dmg*PS.dmgMul))n++;}
  const o=new THREE.Vector3(player.x+fx*1.4,player.y+1.2,player.z+fz*1.4);FX.ringAt(o,new THREE.Vector3(fx,0,fz),S.col,.4,2.6,.25,null,0,.06);for(let i=0;i<24;i++){const a=rf(-1,1);FX.spawn(o.x+Math.cos(player.face+a)*1,o.y+rf(-.3,.3),o.z+Math.sin(player.face+a)*1,fx*rf(2,5),rf(-.5,1),fz*rf(2,5),{life:rf(.15,.3),size:rf(.06,.12),c0:0xffffff,c1:S.col,drag:5});}
  if(n)sfx('hit');}
function muzzleFX(o,dir,col,cls){const c=new THREE.Color(col);flash.position.copy(o).addScaledVector(dir,.1);flash.material.color.copy(c).lerp(new THREE.Color(0xffffff),.35);flash.material.rotation=Math.random()*6.28;
  const pw=cls==='scatter'?1.3:cls==='launcher'?1.2:cls==='rifle'?.7:.8;FX.add(.1,k=>{flash.visible=k<1;const s=k<.3?k/.3:1-(k-.3)/.7;flash.scale.setScalar(1.2*pw*s+.01);flash.material.opacity=s;});
  muzzleLight.color.copy(c);muzzleLight.position.copy(o);FX.add(.12,k=>{muzzleLight.intensity=k<1?2*pw*(1-k)*(1-k):0;});
  for(let i=0;i<Math.round(10*pw);i++){const v=dir.clone().multiplyScalar(rf(4,10)).add(new THREE.Vector3(rf(-1.5,1.5),rf(-.8,1.4),rf(-1.5,1.5)));FX.spawn(o.x,o.y,o.z,v.x,v.y,v.z,{life:rf(.08,.2),size:rf(.05,.1),size1:.01,c0:0xffffff,c1:col,drag:6});}
  if(cls==='scatter'||cls==='launcher')cam.shake=Math.max(cam.shake||0,.1);}
function drawBeam(a,b,col){if(!beamFX){const B=bolts[0];beamFX=B;}const B=beamFX;B.a.copy(a);B.b.copy(b);B.t=0;B.dur=.12;B.outer.material.color.set(col);if(Math.random()<.5)jitterBolt(B);B.outer.visible=B.core.visible=true;
  muzzleLight.color.set(col);muzzleLight.position.copy(a);muzzleLight.intensity=1.6;}
function stopBeam(){beamFX=null;beamHum(false);muzzleLight.intensity=0;}
/* ---------- damage ---------- */
function damageEnemy(e,dmg,S={},o={}){if(e.dead)return;if(e.m.human&&e.m.anim&&!o.silentSmall&&Math.random()<.35)e.m.anim.oneShot('hit');let crit=false;if(!o.silent&&Math.random()<(S.crit||0)+PS.crit){dmg*=1.8;crit=true;}
  if(e.T.ai==='boss'&&e.sub)dmg*=.3;e.hp-=dmg;e.flash=.12;e.provoked=8;if(e.m.onHit)e.m.onHit();
  if(!o.silent&&!(o.silentSmall&&dmg<8&&Math.random()<.7))floatText(Math.round(dmg)+(crit?'!':''),e.x,e.y+(e.T.ai==='boss'?6:e.T.fly?.8:2),e.z,crit?'crit':o.col==='burn'?'hurt':'');
  if(!o.noKnock&&e.T.ai!=='boss'&&!e.T.fly){const dx=e.x-player.x,dz=e.z-player.z,d=Math.hypot(dx,dz)||1,k=(S.knock||.6)*.9;e.x+=dx/d*k;e.z+=dz/d*k;}
  if(S.burn&&Math.random()<S.burn){e.burn=3;e.burnDps=Math.max(e.burnDps||0,dmg*.35);}
  if(S.freeze&&Math.random()<S.freeze){e.frozen=2.2;floatText('Frozen',e.x,e.y+2.6,e.z,'info');}
  if(S.shock&&Math.random()<S.shock){e.stun=.7;FX.burst(new THREE.Vector3(e.x,e.y+1,e.z),0x8fd8ff,18,4,.4,.1);}
  if(S.chain&&!o.chained){let from=e;for(let c=0;c<S.chain;c++){const n=nearestOther(from,7);if(!n||n.dead)break;FX.bolt(new THREE.Vector3(from.x,from.y+.9,from.z),new THREE.Vector3(n.x,n.y+.9,n.z),S.col||0xb98cff,.22);damageEnemy(n,dmg*.6,S,{chained:true});from=n;}}
  if(e.hp<=0)killEnemy(e);}
function killEnemy(e){e.dead=true;e.dying=e.T.dieT||.8;if(e.m.onDie)e.m.onDie();e.respawn=e.respawnT;e.el.hidden=true;if(e.m.anim&&e.m.anim.die)e.m.anim.die();
  if(e.m.tele)e.m.tele.visible=false;
  const xp=Math.round(e.T.xp*(1+(e.lvl-1)*.18)*(e.elite?1.6:1));gainXP(xp);G.stats.kills++;
  const L=rollLoot(e.T.ai==='boss'?'boss':e.elite?'elite':'enemy',e.lvl,W.id);if(e.T.drop&&Math.random()<.6)L.items.push(makeItem(e.T.drop,{q:1}));if(e.loot)L.items.push(...e.loot.map(id=>makeItem(id,{q:1})));
  dropLoot(e.x,e.z,L);
  if(e.T.ai==='boss'){G.stats.bosses++;sfx('quest');if(e.id)ctxState().killed[e.id]=true;showBanner('DEFEATED',e.T.name);}
  if(e.id)ctxState().killed[e.id]=true;
  Bus.emit('kill',e.type,e);}
const ctxState=()=>zoneState(W.id);
function hurtPlayer(n,src){if(player.dead||modal()||UI.loading)return;n=n*(1-armorReduce());
  if(G.sh>0){const a=Math.min(G.sh,n);G.sh-=a;n-=a;player.shieldT=.4;if(a>0)sfx('shield');}
  if(n<=0)return;G.hp-=n;player.hurtT=.35;floatText('−'+Math.round(n),player.x,player.y+2.3,player.z,'hurt');sfx('hurt');player.shieldDelay=4;if(G.hp<=0){G.hp=0;die();}}
function hurtPlayerSoft(n){if(player.dead)return;G.hp-=n;if(G.hp<=0){G.hp=0;die();}}
/* ---------- loot on the ground ---------- */
const lootGeo=new THREE.OctahedronGeometry(.22,0);
function dropLoot(x,z,L){if(!L||(!L.cr&&!L.items.length))return;const best=L.items.reduce((m,it)=>Math.max(m,it.r||0),0);const col=RAR[best].col;
  const g=new THREE.Group();g.position.set(x,groundY(x,z)+.5,z);const m=new THREE.Mesh(lootGeo,new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.8,flatShading:true}));g.add(m);g.add(glowSprite(col,best>=2?2.4:1.4,.8));
  if(best>=3){const beam=new THREE.Mesh(new THREE.CylinderGeometry(.08,.2,8,10,1,true),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.35,blending:THREE.AdditiveBlending,depthWrite:false}));beam.position.y=4;g.add(beam);}
  W.group.add(g);W.pickups.push({kind:'loot',g,x,z,L,life:180,temp:true});}
function collectLoot(p){if(p.L.cr)giveCr(p.L.cr);for(const it of p.L.items)addItem(it);if(p.L.items.some(it=>(it.r||0)>=2))sfx('rare');else sfx('loot');}
// respawning resource nodes (glowcaps, crystal shards, scrap piles, ore, pearls)
function resourceNode(ctx,kind,x,z,o={}){const g=new THREE.Group();g.position.set(x,(o.y!==undefined?o.y:groundY(x,z)),z);const P=new Parts();let col=0x6ff2d6;
  if(kind==='glowcap'){for(let k=0;k<3;k++){const ox=(k-1)*.28,oz=(k%2)*.22,s=1-k*.18;P.add(g,MAT.white,lathe([[.09,0],[.06,.15],[.05,.35],[.07,.5]],10),ox,0,oz,0,0,0,s,s,s);const tp=new THREE.Mesh(sph(.28,24,10,0,6.3,0,1.57),new THREE.MeshBasicMaterial({color:0x8dfce6,map:TEX.cap.map}));tp.position.set(ox,.5*s,oz);tp.scale.set(s,s*.6,s);g.add(tp);}}
  else if(kind==='shard'){col=0xb98cff;const m=new THREE.MeshStandardMaterial({color:0xd8c8ff,emissive:0x7a5ae0,emissiveIntensity:1,roughness:.1,flatShading:true});for(let k=0;k<4;k++){const c=new THREE.Mesh(crystalGeo(.07,.35+k*.06,.3),m);c.position.set((k-1.5)*.12,0,(k%2)*.1);c.rotation.set(rf(-.4,.4),rf(0,6),rf(-.4,.4));g.add(c);}}
  else if(kind==='scrap'){col=0xffc35a;for(let k=0;k<6;k++)P.add(g,k%2?MAT.metal:MAT.hullDark,RB(rf(.2,.6),rf(.05,.2),rf(.2,.5),.03,1),rf(-.5,.5),.08,rf(-.5,.5),rf(-.4,.4),rf(0,6),rf(-.4,.4));}
  else if(kind==='ore'){col=0xff8a4c;P.add(g,MAT.basalt,rockGeo(1,x+z,.4,.4),0,.3,0,0,0,0,.6,.45,.6);for(let k=0;k<4;k++)P.add(g,MAT.amberGlow,crystalGeo(.06,.25,.3),rf(-.3,.3),.45,rf(-.3,.3),rf(-.6,.6),0,rf(-.6,.6));}
  else if(kind==='pearl'){col=0xd8fbff;P.add(g,MAT.rock,sph(.35,16,10,0,6.3,0,1.6),0,0,0,0,0,0,1,.4,1);const pm=new THREE.Mesh(sph(.12,16,12),new THREE.MeshStandardMaterial({color:0xd8fbff,emissive:0x8fd8ff,emissiveIntensity:.8,roughness:.1}));pm.position.y=.12;g.add(pm);}
  else if(kind==='slag'){col=0xff6a3a;P.add(g,MAT.lava,rockGeo(1,x*z,.4,.4),0,.3,0,0,0,0,.55,.4,.55);}
  else if(kind==='resin'){col=0xffb648;P.add(g,MAT.bark,cyl(.12,.2,.8,10),0,.4,0);P.add(g,new THREE.MeshStandardMaterial({color:0xffb648,emissive:0xa06010,emissiveIntensity:.6,transparent:true,opacity:.85,roughness:.1}),sph(.12,12,10),.1,.5,.12);}
  else{col=0x8fd8ff;P.add(g,MAT.crateBlue,RB(.62,.36,.46,.05,1),0,.18,0,0,rf(0,3),0);P.add(g,MAT.tealGlow,RB(.64,.05,.48,.01,1),0,.3,0);}
  P.build();g.add(glowSprite(col,1.6,.7));ctx.g.add(g);const id=o.item||({glowcap:'glowcap',shard:'shard',scrap:'scrap',ore:'alloy',pearl:'pearl',slag:'slag',resin:'resin'}[kind])||kind;
  W.pickups.push({kind:'node',node:kind,item:id,q:o.q||1,g,x,z,active:true,respawn:0,respawnT:o.respawn||150});}
function updatePickups(dt){for(let i=W.pickups.length-1;i>=0;i--){const p=W.pickups[i];
  if(p.kind==='node'){if(!p.active){p.respawn-=dt;if(p.respawn<=0){p.active=true;p.g.visible=true;}continue;}}
  else{p.g.rotation.y+=dt*1.6;p.g.position.y=groundY(p.x,p.z)+.5+Math.sin(T*3+p.x)*.12;p.life-=dt;if(p.life<=0){W.group.remove(p.g);W.pickups.splice(i,1);continue;}}
  if(!player.dead&&!UI.title&&Math.hypot(p.x-player.x,p.z-player.z)<1.8&&Math.abs((p.g.position.y)-player.y)<2.5){
    if(p.kind==='node'){p.active=false;p.g.visible=false;p.respawn=p.respawnT;addItem(makeItem(p.item,{q:p.q+(Math.random()<.25?1:0)}));sfx('pick');}
    else{collectLoot(p);W.group.remove(p.g);W.pickups.splice(i,1);}}}}

/* ---------- consumables ---------- */
function useItem(id){if(player.dead)return false;if(!countItem(id)){toast(`You have no ${ITEMS[id]?ITEMS[id].name:'item'}s left.`);sfx('deny');return false;}
  const heal=n=>{if(G.hp>=PS.maxHp){toast('Health is already full.');return false;}G.hp=Math.min(PS.maxHp,G.hp+n*PS.medMul);floatText('+'+Math.round(n*PS.medMul),player.x,player.y+2.4,player.z,'xp');FX.heal();return true;};
  let ok=true;
  if(id==='medkit')ok=heal(50);else if(id==='trauma')ok=heal(140);
  else if(id==='ration'){G.buffs.ration=10;toast('Eating. +20 health over 10 seconds.');}
  else if(id==='stim'){G.buffs.stim=20;toast('Adrenal stim: 30% faster for 20 s.','teal');}
  else if(id==='heatpack'){G.buffs.heat=90;toast('Heat pack: +25 cold protection for 90 s.','teal');FX.heatGlow();}
  else if(id==='coolant'){G.buffs.cool=90;toast('Coolant pack: +25 heat protection for 90 s.','teal');}
  else if(id==='cell'){G.en=PS.maxEn;G.buffs.over=12;toast('Weapons overcharged for 12 s.','teal');FX.overcharge(muzzlePos(),0xb98cff);}
  else if(id==='shieldcharge'){G.buffs.shield=30;computeStats();G.sh=PS.shieldMax;toast('Shield projected for 30 s.','teal');sfx('shield');}
  else if(id==='grenade'){const fx=Math.sin(player.face),fz=Math.cos(player.face),tg=findTarget(22);const o=new THREE.Vector3(player.x,player.y+1.6,player.z);const tx=tg?tg.x:player.x+fx*12,tz=tg?tg.z:player.z+fz*12,d=Math.hypot(tx-o.x,tz-o.z),t=Math.max(.4,d/16);
    spawnProjectile({from:'player',kind:'grenade',pos:o,vel:new THREE.Vector3((tx-o.x)/t,(groundY(tx,tz)-o.y)/t+.5*18*t,(tz-o.z)/t),grav:18,dmg:70*(1+(G.lvl-1)*.08),col:0x8fd8ff,splash:4,fx:{shock:.5},life:4});}
  else if(id==='flare'){throwFlare();}
  else if(id==='beacon'){G.buffs.scan=90;toast('Scanner beacon running for 90 s.','teal');FX.scanPing();}
  else ok=false;
  if(ok){removeItem(id,1);computeStats();sfx(id==='flare'?'flare':'pick');saveSoon();}return ok;}
function useQuick(){if(modal())return;useItem(G.quick);}
const flares=[];
function throwFlare(){const fx=Math.sin(player.face),fz=Math.cos(player.face),tx=player.x+fx*6,tz=player.z+fz*6;const g=new THREE.Group();g.add(new THREE.Mesh(cyl(.045,.045,.32,10),new THREE.MeshStandardMaterial({color:0xd8403a,emissive:0x601010})));g.add(glowSprite(0xff6a3a,6,.9));W.group.add(g);
  flares.push({g,sx:player.x,sz:player.z,sy:player.y+1.4,x:tx,z:tz,t:0,life:10});for(const e of W.enemies){if(e.dead||e.T.ai==='boss'||e.m.human||e.m.robot)continue;if(Math.hypot(e.x-tx,e.z-tz)<16){e.fleeT=8;e.fx=tx;e.fz=tz;e.provoked=0;}}}
function updateFlares(dt){let lit=null;for(let i=flares.length-1;i>=0;i--){const f=flares[i];f.t+=dt;const k=Math.min(1,f.t/.5),gy=groundY(f.x,f.z);f.g.position.set(lerp(f.sx,f.x,k),lerp(f.sy,gy+.15,k)+Math.sin(k*Math.PI)*2.2,lerp(f.sz,f.z,k));
  if(k>=1&&Math.random()<.9)FX.spawn(f.x,gy+.3,f.z,rf(-1,1),rf(2,5),rf(-1,1),{life:rf(.4,.9),size:rf(.12,.25),c0:0xffe0a0,c1:0xff3a1a,drag:1.5,grav:3});lit=f;if(f.t>f.life){W.group.remove(f.g);flares.splice(i,1);}}
  if(lit){flareLight.position.set(lit.g.position.x,lit.g.position.y+.6,lit.g.position.z);flareLight.intensity=lerp(flareLight.intensity,2.2*Math.min(1,(lit.life-lit.t)/1.5),.5);}else flareLight.intensity=0;}

// ===== 16_npcs.js =====
/* ================= NPCs: spawning, routines, barks ================= */
const NPCS={}; // registered by the story files: id → definition
const CROWD_NAMES=['Ada','Bram','Cass','Devi','Eko','Fen','Gil','Hana','Ivo','Jas','Kai','Lio','Mae','Nico','Oti','Pia','Quin','Ravi','Sol','Tam','Uma','Vex','Wynn','Yara','Zed'];
function spawnNPC(id,x,z,o={}){const D=NPCS[id]||o.def;if(!D)return null;
  if(D.cond&&!D.cond())return null;
  const P=buildPerson(Object.assign({id:D.crowd?null:id},D.look||{body:'soldier'}));const y=W.interior?W.floorY:groundY(x,z);P.root.position.set(x,y,z);P.root.rotation.y=o.face||D.face||0;W.group.add(P.root);
  const el=document.createElement('div');el.className='nlab';el.innerHTML=`<div class="m"></div><div class="n">${esc(D.name)}</div><div class="r">${esc(D.role||'')}</div>`;$('#labels').appendChild(el);
  const bub=document.createElement('div');bub.className='bubble';bub.hidden=true;$('#labels').appendChild(bub);
  const beh=Object.assign({type:'stand'},D.beh||{},o.beh||{});
  const n={id,D,P,el,mark:el.querySelector('.m'),bub,x,z,y,face:o.face||D.face||0,homeFace:o.face||D.face||0,home:{x,z},beh,act:newAct(),look:0,speed:0,wait:rf(1,4),wp:0,tx:x,tz:z,barkT:rf(4,20),talking:false,bubT:0,talkAnim:0};
  if(beh.type==='route'&&beh.pts&&beh.pts.length){n.tx=beh.pts[0][0];n.tz=beh.pts[0][1];}
  if(beh.type==='stand')addCol(x,z,.5);
  W.npcs.push(n);
  if(D.look&&D.look.body==='xbot')n.holo=true;
  W.inter.push({pos:()=>n,r:3.2,label:()=>'Talk to '+D.name,ok:()=>!n.hidden&&!n.ko&&(!D.canTalk||D.canTalk()),act:()=>startTalk(n),npc:n});
  return n;}
function spawnCrowd(cx,cz,r,count,o={}){const bodies=['soldier','michelle'],tints=[0x8a7a6a,0x6a7a8a,0xa08a6a,0x7a6a8a,0x5a6a5a,0x9a8a7a,0x6a5a4a,0x8a8aa0,0x3a5a8a,0x8a3a3a,0x3a7a5a,0xc9a06a];
  const seats=o.seats||null;if(seats)count=seats.length;
  for(let i=0;i<count;i++){const name=pick(CROWD_NAMES)+' '+pick(['Ostrander','Achebe','Lund','Varga','Sato','Okoro','Reyes','Brandt','Halden','Mercer','Ng','Petrov','Dube','Kova']);
    const body=pick(bodies);const look={body,tint:pick(tints),tintAmt:rf(.15,.45),hair:Math.random()<.7?pick(HAIRS):null,scale:rf(.95,1.04),npcModel:npcCrowdLook(body==='michelle'?'f':'m')};
    const def={name,role:o.role||'',look,barks:o.barks||CROWD_BARKS,crowd:true,talk:'crowd'};const a=Math.random()*6.28,d=Math.sqrt(Math.random())*r,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;
    if(seats){let [sx,sz,sf,dr]=seats[i];sx+=Math.sin(sf)*.16;sz+=Math.cos(sf)*.16;// sat on the front of the seat, legs clear of its base
      const n=spawnNPC('crowd_s'+i+'_'+Math.round(cx)+'_'+Math.round(cz),sx,sz,{def,face:sf,beh:{type:'stand'}});if(n)n.seat={drop:dr||.42};continue;}
    const pts=o.pts||null;spawnNPC('crowd_'+i+'_'+Math.round(cx),x,z,{def,face:rf(0,6.28),beh:pts?{type:'route',pts:pts.slice().sort(()=>Math.random()-.5),pause:[2,7]}:{type:'wander',r:o.wander||r,pause:[3,9]}});}}
const CROWD_BARKS=['Another long dusk.','Have you seen the prices at the stores?','My boots are full of grit again.','Watch the ridge after dark. Not that it ever gets dark.','They say the spire hums at night.','I miss rain.','Morning. Or evening. Who can tell?','Ines is in a mood today.','Okafor\'s doubling the patrols.','You\'re the one from the crash, aren\'t you?'];
// a spot an NPC can stand on: not inside a collider, a wall or off the edge of the zone
function npcFree(x,z,y){const p={x,z};collide(p,.35);platWalls(p,y,.35);return Math.hypot(p.x-x,p.z-z)<.05;}
function npcPick(n,cx,cz,r,away){for(let k=0;k<10;k++){const a=away!==undefined?away+rf(-1.1,1.1):Math.random()*6.28,d=away!==undefined?rf(2.5,5):Math.random()*r,x=cx+Math.sin(a)*d,z=cz+Math.cos(a)*d;
    if(!npcFree(x,z,n.y))continue;// the first metres of the way must be open too
    const dx=x-n.x,dz=z-n.z,L=Math.hypot(dx,dz)||1;if(!npcFree(n.x+dx/L*Math.min(1.2,L),n.z+dz/L*Math.min(1.2,L),n.y))continue;n.tx=x;n.tz=z;return true;}return false;}
function updateNPCs(dt){const W_=W;for(const n of W_.npcs){const P=n.P,D=n.D;const dxp=player.x-n.x,dzp=player.z-n.z,dp=Math.hypot(dxp,dzp);
  if(n.ko){n.ko-=dt;if(P.anim)P.anim.update(dt,0);if(P.rider)P.rider.sync();if(n.bubT>0){n.bubT-=dt;if(n.bubT<=0)n.bub.hidden=true;}if(n.ko<=0)reviveNPC(n);continue;}
  let sp=0;
  if(n.seat){n.face=n.homeFace;if(n.talking)n.talkAnim+=dt;}else if(n.talking){n.face+=wrapA(Math.atan2(dxp,dzp)-n.face)*clamp(dt*5,0,1);n.talkAnim+=dt;}
  else if(n.beh.type==='stand'){const tgt=dp<6?Math.atan2(dxp,dzp):n.homeFace;n.face+=wrapA(tgt-n.face)*clamp(dt*(dp<6?3:1),0,1);}
  else{if(n.wait>0){n.wait-=dt;}else{const dx=n.tx-n.x,dz=n.tz-n.z,d=Math.hypot(dx,dz);
      if(d<.4){const pa=n.beh.pause||[2,6];n.wait=rf(pa[0],pa[1]);if(n.beh.type==='route'){n.wp=(n.wp+1)%n.beh.pts.length;n.tx=n.beh.pts[n.wp][0];n.tz=n.beh.pts[n.wp][1];}else if(!npcPick(n,n.home.x,n.home.z,n.beh.r||6)){n.tx=n.home.x;n.tz=n.home.z;}}
      else if(dp<1.3&&(dxp*dx+dzp*dz)>0){n.wait=.6;}
      else{sp=n.beh.speed||1.35;const p={x:n.x+dx/d*sp*dt,z:n.z+dz/d*sp*dt};collide(p,.35);platWalls(p,n.y,.35);
        // blocked: little progress toward the target (walking into a wall or sliding along a corner). Pause, then turn and head the other way
        const prog=((p.x-n.x)*dx+(p.z-n.z)*dz)/d;if(prog<sp*dt*.4){n.stuck=(n.stuck||0)+dt;if(n.stuck>.45){n.stuck=0;n.wait=rf(.4,1);n.blocks=(n.blocks||0)+1;
            if(n.beh.type==='route'&&n.blocks<3){n.wp=(n.wp+1)%n.beh.pts.length;n.tx=n.beh.pts[n.wp][0];n.tz=n.beh.pts[n.wp][1];}
            else if(!npcPick(n,n.x,n.z,4,Math.atan2(dx,dz)+Math.PI)){n.tx=n.home.x;n.tz=n.home.z;}
            n.turnTo=Math.atan2(n.tx-n.x,n.tz-n.z);}}else{n.stuck=Math.max(0,(n.stuck||0)-dt);if(prog>sp*dt*.8)n.blocks=0;}
        n.x=p.x;n.z=p.z;n.face+=wrapA(Math.atan2(dx,dz)-n.face)*clamp(dt*6,0,1);}}
    if(sp===0&&n.turnTo!==undefined&&n.wait>0)n.face+=wrapA(n.turnTo-n.face)*clamp(dt*5,0,1);else if(sp===0&&dp<5)n.face+=wrapA(Math.atan2(dxp,dzp)-n.face)*clamp(dt*2,0,1);if(sp>0)n.turnTo=undefined;}
  if(n.beh.type!=='stand'&&dp<.75&&dp>.01){player.x+=dxp/dp*(.75-dp);player.z+=dzp/dp*(.75-dp);}
  n.y=W.interior?W.floorY:support(n.x,n.z,n.y+.5).y;P.root.position.set(n.x,n.y-(n.seat?n.seat.drop*(P.root.scale.y||1):0),n.z);P.root.rotation.y=n.face;
  // head turns toward the player when nearby but not facing them
  const lim=n.seat?.45:1.1,rel=dp<12&&(!n.talking||n.seat)?clamp(wrapA(Math.atan2(dxp,dzp)-n.face),-lim,lim):0;n.look=lerp(n.look,rel,clamp(dt*3,0,1));
  tickIdle(n.act,dt,sp>0||n.talking,D.idle||['look','wrist','talk','stretch']);
  n.animAcc=(n.animAcc||0)+dt;const onScr=P.root.visible&&inView(n.x,n.y+1,n.z,1.6),far=dp>28;n.animTick=(n.animTick||0)+1;
  if(P.anim&&onScr&&(!far||n.animTick%2===0)){const adt=n.animAcc;n.animAcc=0;P.anim.update(adt,sp);const B=P.B;if(B&&B.Head){poseLayers(B,{look:n.look,act:n.talking?(n.talkAct=n.talkAct||{kind:'talk',w:.8,t:0}):(n.talkAct=null,n.act)},P.anim);if(n.seat){P.root.updateMatrixWorld(true);seatLegs(B,n.face);}}if(P.rider)P.rider.sync();if(n.seat&&P.rider){const R=P.rider;n._rb=n._rb||{UpperLegL:R.T('UpperLegL'),LowerLegL:R.T('LowerLegL'),FootL:R.T('FootL'),UpperLegR:R.T('UpperLegR'),LowerLegR:R.T('LowerLegR'),FootR:R.T('FootR')};P.root.updateMatrixWorld(true);seatLegs(n._rb,n.face);}if(P.updateHeld)P.updateHeld(0,n.face);}
  // barks
  n.barkT-=dt;if(n.bubT>0){n.bubT-=dt;if(n.bubT<=0)n.bub.hidden=true;}
  if(n.barkT<=0&&dp<8&&!n.talking&&!UI.dialog){n.barkT=rf(25,45);const lines=typeof D.barks==='function'?D.barks():D.barks;if(lines&&lines.length){n.bub.textContent=pick(lines);n.bub.hidden=false;n.bubT=4.5;}}}}
/* ---------- hitting people: they flinch, shout, and get knocked out for a few minutes ---------- */
const NPC_HP=60,KO_TIME=300;
const OUCH=['Hey! Watch it!','Ow! What is wrong with you?','Stop that!','Are you out of your mind?','Hey!','That hurt!'];
const GASP=['Somebody call a medic!','What did you do?!','Security!','Leave them alone!','Are they breathing?'];
const WAKE=['Ugh… what hit me?','My head…','Okay. Okay. I\'m up.','Never doing that again.'];
const say_=(n,t,d=3)=>{n.bub.textContent=t;n.bub.hidden=false;n.bubT=d;};
function npcAt(x,y,z,r=.45){for(const n of W.npcs){if(n.ko||n.holo||!n.P.root.visible)continue;if(Math.abs(x-n.x)<1&&Math.abs(z-n.z)<1&&Math.hypot(x-n.x,z-n.z)<r+.3&&y>n.y-.1&&y<n.y+2)return n;}return null;}
function hitNPC(n,dmg){if(!n||n.ko||n.holo)return false;n.hp=(n.hp??NPC_HP)-dmg;floatText('−'+Math.round(dmg),n.x,n.y+2.1,n.z,'');sfx('hit');
  if(n.talking)closeDialog();if(n.P.anim)n.P.anim.oneShot('hit');n.face=Math.atan2(player.x-n.x,player.z-n.z);n.wait=Math.max(n.wait||0,2);say_(n,pick(OUCH),2.5);
  if(n.hp>0)return true;
  n.ko=KO_TIME;n.hp=0;n.talking=false;if(n.P.anim)n.P.anim.die();n.el.querySelector('.r').textContent='KNOCKED OUT';n.bub.hidden=true;
  toast(`${esc(n.D.name)} is knocked out. They'll come to in about five minutes.`,'',5000);
  for(const o of W.npcs)if(o!==n&&!o.ko&&Math.hypot(o.x-n.x,o.z-n.z)<12)say_(o,pick(GASP),3);return true;}
function reviveNPC(n){n.ko=0;n.hp=NPC_HP;if(n.P.anim)n.P.anim.revive();n.el.querySelector('.r').textContent=n.D.role||'';say_(n,pick(WAKE),4);}
function startTalk(n){n.talking=true;n.bub.hidden=true;n.talkAnim=0;openNPCDialog(n);}
function endTalk(){for(const n of W.npcs)n.talking=false;}

// ===== 20_world.js =====
/* ================= WORLD: zones, terrain, colliders, platforms, interactables ================= */
const ZONES={};
const W={id:null,def:null,group:null,size:400,half:200,seg:200,step:2,N:201,H:null,interior:false,ceiling:Infinity,floorY:0,
  grid:new Map(),plats:[],hazards:[],inter:[],pickups:[],npcs:[],enemies:[],anims:[],travel:[],pois:[],lights:[],mapImg:null,keepout:[],water:null};
const STEP=.45,CELL=8;
function groundY(x,z){
  if(W.interior||!W.H)return W.floorY;
  const fx=clamp((x+W.half)/W.step,0,W.seg-.001),fz=clamp((z+W.half)/W.step,0,W.seg-.001);
  const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,N=W.N,H=W.H;
  const a=H[j*N+i],b=H[j*N+i+1],c=H[(j+1)*N+i],d=H[(j+1)*N+i+1];
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function addCol(x,z,r){const c={x,z,r};for(let i=Math.floor((x-r)/CELL);i<=Math.floor((x+r)/CELL);i++)for(let j=Math.floor((z-r)/CELL);j<=Math.floor((z+r)/CELL);j++){const k=i+','+j;if(!W.grid.has(k))W.grid.set(k,[]);W.grid.get(k).push(c);}return c;}
function collide(p,rad){const i=Math.floor(p.x/CELL),j=Math.floor(p.z/CELL);
  for(let a=i-1;a<=i+1;a++)for(let b=j-1;b<=j+1;b++){const L=W.grid.get(a+','+b);if(!L)continue;
    for(const c of L){const dx=p.x-c.x,dz=p.z-c.z,d=Math.hypot(dx,dz),m=c.r+rad;if(d<m&&d>1e-4){p.x=c.x+dx/d*m;p.z=c.z+dz/d*m;}}}
  const lim=W.half-4;p.x=clamp(p.x,-lim,lim);p.z=clamp(p.z,-lim,lim);}
const nearAny=(x,z,list)=>list.some(o=>Math.hypot(x-o.x,z-o.z)<o.r);
function onPlat(p,x,z,m){const dx=x-p.x,dz=z-p.z;if(p.r!==undefined)return dx*dx+dz*dz<=(p.r+m)*(p.r+m);const c=Math.cos(p.rot||0),s=Math.sin(p.rot||0),lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.abs(lx)<=p.hw+m&&Math.abs(lz)<=p.hd+m;}
function support(x,z,y){let sy=groundY(x,z),plat=null;for(const p of W.plats){if(Math.abs(x-p.x)>p.reach||Math.abs(z-p.z)>p.reach)continue;if(p.top>y+STEP||p.top<=sy||p.solidOnly)continue;if(onPlat(p,x,z,.18)){sy=p.top;plat=p;}}return {y:sy,plat};}
function platWalls(q,y,rad){for(const p of W.plats){if(Math.abs(q.x-p.x)>p.reach+1||Math.abs(q.z-p.z)>p.reach+1)continue;if(p.top<=y+STEP||p.bot>y+1.7)continue;
  if(p.r!==undefined){const dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz),m=p.r+rad;if(d<m&&d>1e-4){q.x=p.x+dx/d*m;q.z=p.z+dz/d*m;}}
  else{const c=Math.cos(p.rot||0),s=Math.sin(p.rot||0),dx=q.x-p.x,dz=q.z-p.z;let lx=dx*c-dz*s,lz=dx*s+dz*c;const ex=p.hw+rad-Math.abs(lx),ez=p.hd+rad-Math.abs(lz);
    if(ex>0&&ez>0){if(ex<ez)lx+=Math.sign(lx||1)*ex;else lz+=Math.sign(lz||1)*ez;q.x=p.x+lx*c+lz*s;q.z=p.z-lx*s+lz*c;}}}}
// camera and line-of-sight checks against solid shapes
function solidAt(x,y,z){const L=W.grid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL));if(L)for(const c of L){if(c.r>=1.2&&y-groundY(x,z)<c.r+3.5&&Math.hypot(x-c.x,z-c.z)<c.r+.2)return true;}
  for(const p of W.plats){if(p.nocam||Math.abs(x-p.x)>p.reach+1||Math.abs(z-p.z)>p.reach+1)continue;if(y<p.top+.1&&y>p.bot&&onPlat(p,x,z,.1))return true;}
  if(W.interior&&y>W.ceiling-.15)return true;return false;}

/* ---------- zone build context ---------- */
function makeCtx(def){
  const g=new THREE.Group();g.name='zone';
  const ctx={g,def,P:new Parts(),y:groundY,lights:[],
    col:(x,z,r)=>addCol(x,z,r),
    plat:p=>{p.reach=p.r!==undefined?p.r+1:Math.hypot(p.hw,p.hd)+1;if(p.bot===undefined)p.bot=p.top-3;W.plats.push(p);return p;},
    // a solid box: walkable on top if low enough, a wall otherwise
    box:(x,z,hw,hd,rot,top,bot)=>ctx.plat({x,z,hw,hd,rot,top,bot:bot===undefined?groundY(x,z)-1:bot}),
    hazard:h=>{W.hazards.push(h);return h;},
    inter:o=>{W.inter.push(o);return o;},
    anim:fn=>W.anims.push(fn),
    light:(x,y,z,color,i,d,flicker)=>{ctx.lights.push({x,y,z,color,i,d,flicker});},
    keep:(x,z,r)=>W.keepout.push({x,z,r}),
    add:o=>{g.add(o);return o;},
    state:()=>zoneState(def.id),
  };
  return ctx;
}
function zoneState(id){G.zs[id]=G.zs[id]||{opened:{},flags:{},killed:{},dug:{}};return G.zs[id];}

/* ---------- terrain ---------- */
function buildTerrain(def,ctx){
  const S=def.size,seg=isTouch?Math.min(200,def.seg||220):(def.seg||240);
  W.size=S;W.half=S/2;W.seg=seg;W.step=S/seg;W.N=seg+1;W.H=new Float32Array(W.N*W.N);
  for(let j=0;j<W.N;j++)for(let i=0;i<W.N;i++)W.H[j*W.N+i]=def.height(-W.half+i*W.step,-W.half+j*W.step);
  archFlatten(def);
  const tg=new THREE.PlaneGeometry(S,S,seg,seg);tg.rotateX(-Math.PI/2);
  const p=tg.attributes.position,cols=new Float32Array(p.count*3),c=new THREE.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=groundY(x,z);p.setY(i,y);
    const sl=clamp(Math.hypot(groundY(x+1.5,z)-groundY(x-1.5,z),groundY(x,z+1.5)-groundY(x,z-1.5))/3,0,1);
    def.color(x,z,y,sl,c);cols[i*3]=c.r;cols[i*3+1]=c.g;cols[i*3+2]=c.b;}
  tg.setAttribute('color',new THREE.BufferAttribute(cols,3));tg.computeVertexNormals();
  const D=TEX[def.detail||'ground'];
  const gm=new THREE.MeshStandardMaterial({vertexColors:true,map:D.map.clone(),normalMap:D.normal.clone(),normalScale:new THREE.Vector2(.8,.8),roughness:def.rough||.95,metalness:0});
  const rep=def.detailRepeat||S/2.4;for(const t of [gm.map,gm.normalMap]){t.repeat.set(rep,rep);t.needsUpdate=true;}
  gm.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
    vec4 t1=mapTexelToLinear(texture2D(map,vUv));vec4 t2=mapTexelToLinear(texture2D(map,vUv*0.071+vec2(.31,.67)));
    diffuseColor.rgb*=t1.rgb*t2.rgb*1.3;
  #endif`);};
  const t=new THREE.Mesh(tg,gm);t.receiveShadow=true;ctx.g.add(t);
  if(def.water){const wm=new THREE.MeshStandardMaterial({color:def.water.color,roughness:.08,metalness:.6,transparent:true,opacity:def.water.op||.82,normalMap:TEX.water.normal.clone(),normalScale:new THREE.Vector2(.3,.3),emissive:def.water.emissive||0x000000,emissiveIntensity:.4});
    wm.normalMap.repeat.set(S/14,S/14);wm.normalMap.needsUpdate=true;const w=new THREE.Mesh(new THREE.PlaneGeometry(S*1.6,S*1.6),wm);w.rotation.x=-Math.PI/2;w.position.y=def.water.y;ctx.g.add(w);W.water={y:def.water.y,mesh:w,mat:wm};
    ctx.anim(dt=>{wm.normalMap.offset.x+=dt*.004;wm.normalMap.offset.y+=dt*.0025;});}
  // minimap image
  const mi=mkCanvas(200);const mg=mi.getContext('2d'),id=mg.createImageData(200,200);
  for(let j=0;j<200;j++)for(let i=0;i<200;i++){const x=-W.half+(i+.5)*S/200,z=-W.half+(j+.5)*S/200,y=groundY(x,z);def.color(x,z,y,0,c);let sh=.75+clamp(y/30,-.3,.4);
    if(W.water&&y<W.water.y){c.setHex(def.water.color);sh=.9;}const k=(j*200+i)*4;id.data[k]=clamp(c.r*255*sh,0,255);id.data[k+1]=clamp(c.g*255*sh,0,255);id.data[k+2]=clamp(c.b*255*sh,0,255);id.data[k+3]=255;}
  mg.putImageData(id,0,0);W.mapImg=mi;
}
function buildInteriorMap(){const mi=mkCanvas(200),mg=mi.getContext('2d');mg.fillStyle='#0c0a14';mg.fillRect(0,0,200,200);mg.fillStyle='#2a2638';
  for(const p of W.plats){if(p.r!==undefined||p.top<W.floorY+1.2)continue;const k=200/W.size;mg.save();mg.translate((p.x+W.half)*k,(p.z+W.half)*k);mg.rotate(-(p.rot||0));mg.fillRect(-p.hw*k,-p.hd*k,p.hw*2*k,p.hd*2*k);mg.restore();}
  W.mapImg=mi;}

/* ---------- zone lifecycle ---------- */
function disposeZone(){
  if(W.group){scene.remove(W.group);const sks=new Set();W.group.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton)sks.add(o.skeleton);if(o.geometry)o.geometry.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{for(const k in m){const v=m[k];if(v&&v.isTexture)v.dispose();}m.dispose();});}});for(const sk of sks)sk.dispose();}
  for(const e of W.enemies){if(e.el)e.el.remove();if(e.m&&e.m.tele)scene.remove(e.m.tele);}
  for(const n of W.npcs){if(n.el)n.el.remove();if(n.bub)n.bub.remove();}
  W.arch=null;W.cullChunks=[];W.grid=new Map();W.plats=[];W.hazards=[];W.inter=[];W.pickups=[];W.npcs=[];W.enemies=[];W.anims=[];W.travel=[];W.pois=[];W.keepout=[];W.safe=[];W.qbosses=[];W.useIds=[];W.bossIds=[];W.water=null;W.H=null;W.group=null;W.flares&&(W.flares.length=0);
  clearProjectiles&&clearProjectiles();
}
// Loading can never leave the player stuck on the loading screen: each stage is named, a failure is reported on screen with
// the stage it happened in and the player is put into whatever was built, and a long wait says what it is waiting on.
const ZL={stage:'',id:''};
async function enterZone(id,entry,opts={}){ZL.stage='start';ZL.id=id;const t0=performance.now();
  const wd=setInterval(()=>{if(!UI.loading)return;if(performance.now()-t0>20000){const p=$('#ldP');if(p)p.textContent='Still loading… ('+ZL.stage+')';}},2000);
  try{await enterZoneRun(id,entry,opts);}
  catch(e){tlFail(e,'loading '+id+' · '+ZL.stage);
    try{if(W.group&&!W.group.parent)scene.add(W.group);const def=ZONES[id],en=(entry&&def.entries&&def.entries[entry])||def.spawn||{x:0,z:0,face:0};placePlayer(en.x,en.z,en.face||0);G.zone=id;G.entry=entry||null;}catch(_){}
    $('#loading').hidden=true;UI.loading=false;}
  finally{clearInterval(wd);}}
async function enterZoneRun(id,entry,opts={}){
  const def=ZONES[id];if(!def){toast('That destination is not available yet.');return;}
  const L=$('#loading');$('#ldK').textContent=opts.kicker||(def.world?def.world.toUpperCase():'TRAVELING');$('#ldT').textContent=def.name;$('#ldP').textContent=opts.text||def.blurb||'';L.hidden=false;
  UI.loading=true;await nextFrame();await nextFrame();
  ZL.stage='clearing the last area';disposeZone();rng=mulberry(def.seed||1);
  W.id=id;W.def=def;W.interior=def.kind==='interior';W.floorY=def.floorY||0;W.ceiling=def.ceiling||Infinity;
  ZL.stage='terrain';const ctx=makeCtx(def);W.group=ctx.g;
  if(W.interior){W.size=def.size||120;W.half=W.size/2;}
  else buildTerrain(def,ctx);
  await nextFrame();
  ZL.stage='sky';applySky(def);
  if(def.keep)for(const k of (typeof def.keep==='function'?def.keep():def.keep))W.keepout.push(k);
  if(def.flora)for(const f of def.flora){FLORA[f.type]&&FLORA[f.type](ctx,f);}
  await nextFrame();
  ZL.stage='building';kit(ctx);def.build(ctx);if(def.arch)archBuild(ctx,def.arch);
  ZL.stage='assembling';ctx.P.build();if(ctx.envB)ctx.envB.build(ctx.g);
  ZL.stage='map';if(W.interior)buildInteriorMap();
  ZL.stage='lights';scene.add(ctx.g);setLights(ctx.lights);W.lights=ctx.lights;postScan();postZone(def);
  // arrival
  const e=(entry&&def.entries&&def.entries[entry])||def.spawn||{x:0,z:0,face:0};
  ZL.stage='arrival';placePlayer(e.x,e.z,e.face||0);
  G.zone=id;G.entry=entry||null;zoneState(id);G.visited[id]=true;
  if(!opts.silent)Bus.emit('zone',id);
  ftSync();W.mapShot=null;requestMapShot();
  ZL.stage='first frame';await nextFrame();L.hidden=true;UI.loading=false;ZL.stage='done';
  if(!opts.quiet)showBanner(def.world||'',def.name);
  saveSoon();
}
function applySky(def){
  const s=def.sky||{};const u=skyMat.uniforms;
  u.cNight.value.set(s.night||0x07061a);u.cDusk.value.set(s.dusk||0x4c1c36);u.cSun.value.set(s.sun||0xfa6630);u.cHorizon.value.set(s.horizon||0x381420);
  u.stars.value=s.stars===undefined?1:s.stars;u.space.value=s.space||0;u.sunSize.value=s.sunSize||1;u.aurora.value=typeof s.aurora==='function'?s.aurora():(s.aurora||0);u.night.value=s.nightAmt||0;
  if(s.aur1)u.aurC1.value.set(s.aur1);if(s.aur2)u.aurC2.value.set(s.aur2);
  const el=(s.sunElev===undefined?9:s.sunElev)*Math.PI/180,az=s.sunAz===undefined?.22:s.sunAz;
  sunDir.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)).normalize();u.sunDir.value.copy(sunDir);
  const f=s.fog||[0x3a2238,50,330];scene.fog.color.set(f[0]);scene.fog.near=f[1];scene.fog.far=f[2];renderer.setClearColor(f[0]);
  const h=s.hemi||[0x9a80c8,0x1c1426,.62];hemi.color.set(h[0]);hemi.groundColor.set(h[1]);hemi.intensity=h[2];
  sun.color.set(s.sunColor||0xff9a66);sun.intensity=s.sunInt===undefined?1.15:s.sunInt;sun.castShadow=!W.interior;
  sky.visible=!W.interior||!!s.showSky;
  if(BODIES)BODIES.set(s.bodies||[]);
}

// ===== 21_prefabs.js =====
/* ================= MATERIALS + PREFABS ================= */
const MB=(c,o={})=>new THREE.MeshBasicMaterial(Object.assign({color:c},o));
const MAT={
  hull:std(TEX.hull,{color:0xb4adc6,metalness:.45,roughness:1}),
  hullWarm:std(TEX.hull,{color:0xbcae98,metalness:.45,roughness:1}),
  hullDark:std(TEX.hull,{color:0x5e5770,metalness:.5,roughness:1}),
  metal:std(TEX.armor,{color:0x48425a,metalness:.65,roughness:.55}),
  metalLight:std(TEX.armor,{color:0x9a96a8,metalness:.6,roughness:.45}),
  gun:std(TEX.armor,{color:0x34323a,metalness:.7,roughness:.45}),
  rubber:std(TEX.rubber,{color:0x2a2830,roughness:.85}),
  deck:std(TEX.deck,{color:0x9894a8,metalness:.55,roughness:.55}),
  crate:std(TEX.crate,{color:0x9a8a5e,roughness:.8}),
  crateBlue:std(TEX.crate,{color:0x5e7a9a,roughness:.8}),
  crateRed:std(TEX.crate,{color:0x9a5e52,roughness:.8}),
  rock:std(TEX.rock,{color:0xffffff,roughness:.92,flatShading:true}),
  basalt:std(TEX.rock,{color:0x5a5260,roughness:.9,flatShading:true}),
  sandstone:std(TEX.rock,{color:0xd8a878,roughness:.95,flatShading:true}),
  ice:new THREE.MeshStandardMaterial({color:0xcfeeff,emissive:0x3a6a8a,emissiveIntensity:.3,transparent:true,opacity:.72,roughness:.08,metalness:.1,flatShading:true,normalMap:TEX.crystal.normal}),
  iceSolid:std(TEX.ice,{color:0xe0f0ff,roughness:.25,metalness:.1}),
  glass:new THREE.MeshStandardMaterial({color:0x9ff0e0,transparent:true,opacity:.2,roughness:.04,metalness:.7,depthWrite:false}),
  glassDark:new THREE.MeshStandardMaterial({color:0x0a0d14,roughness:.06,metalness:.95}),
  win:new THREE.MeshStandardMaterial({color:0x2a1c08,emissive:0xffb648,emissiveIntensity:.9,roughness:.2,metalness:.4}),
  winCool:new THREE.MeshStandardMaterial({color:0x081a24,emissive:0x8fd8ff,emissiveIntensity:.8,roughness:.2,metalness:.4}),
  tealGlow:new THREE.MeshStandardMaterial({color:0x103a36,emissive:0x6ff2d6,emissiveIntensity:1,roughness:.3}),
  amberGlow:new THREE.MeshStandardMaterial({color:0x3a2a08,emissive:0xffc35a,emissiveIntensity:1,roughness:.3}),
  redGlow:new THREE.MeshStandardMaterial({color:0x300808,emissive:0xff3a2a,emissiveIntensity:1,roughness:.3}),
  teal:MB(0x6ff2d6),amber:MB(0xffc35a),red:MB(0xff4a4a),white:MB(0xffffff),
  fabric:std(TEX.fabric,{color:0xa4825c,roughness:.95,side:THREE.DoubleSide}),
  fabricTeal:std(TEX.fabric,{color:0x3a7a74,roughness:.95,side:THREE.DoubleSide}),
  fabricRed:std(TEX.fabric,{color:0x8a3a3a,roughness:.95,side:THREE.DoubleSide}),
  wall:std(TEX.wall,{color:0xd8d4e0,metalness:.3,roughness:.7}),
  wallDark:std(TEX.wall,{color:0x6a6680,metalness:.4,roughness:.7}),
  floor:std(TEX.tile,{color:0x9894a8,metalness:.3,roughness:1}),
  grate:std(TEX.grate,{color:0x8a8698,metalness:.6,roughness:.5}),
  reed:std(TEX.reed,{color:0xd8c8a8,roughness:.9}),
  bark:std(TEX.bark,{color:0xffffff,roughness:.9}),
  lava:std(TEX.lava,{color:0xffffff,emissive:0xff5a1a,emissiveIntensity:1.1,roughness:.85,flatShading:true}),
  runes:std(TEX.runes,{color:0xb0a4c8,emissive:0x8fffe0,emissiveIntensity:.3,metalness:.5,roughness:.4,flatShading:true}),
  sand:std(TEX.sand,{color:0xd8b088,roughness:.95}),
};
MAT.screens=TEX.screens.map(t=>new THREE.MeshBasicMaterial({map:t}));
const HAZ_TEX=new THREE.CanvasTexture((()=>{const c=mkCanvas(256,64),x=c.getContext('2d');x.fillStyle='#1a1614';x.fillRect(0,0,256,64);x.fillStyle='#ffb648';for(let i=-64;i<256;i+=32){x.beginPath();x.moveTo(i,64);x.lineTo(i+16,64);x.lineTo(i+80,0);x.lineTo(i+64,0);x.closePath();x.fill();}return c;})());
HAZ_TEX.wrapS=HAZ_TEX.wrapT=THREE.RepeatWrapping;MAT.hazard=new THREE.MeshStandardMaterial({map:HAZ_TEX,roughness:.7});
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
function grp(ctx,x,y,z,ry=0,parent){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=ry;(parent||ctx.g).add(g);return g;}
// local → world helper for a rotated prefab footprint
// floor height for furniture: the zone floor indoors, the ground (levelled under buildings) outside
const FY=(x,z)=>W.interior?W.floorY:groundY(x,z);
const toW=(x,z,ry,lx,lz)=>({x:x+lx*Math.cos(ry)+lz*Math.sin(ry),z:z-lx*Math.sin(ry)+lz*Math.cos(ry)});
const toL=(x,z,ry,wx,wz)=>{const dx=wx-x,dz=wz-z,c=Math.cos(ry),s=Math.sin(ry);return {x:dx*c-dz*s,z:dx*s+dz*c};};
function neon(text,w,h,color){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:decalTex(text,w,h,{fg:color,wear:false,size:.6}),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));return m;}
function glowAt(ctx,parent,x,y,z,color,size,op){const s=glowSprite(color,size,op);s.position.set(x,y,z);(parent||ctx.g).add(s);return s;}

/* ---------- settlement buildings ---------- */
const PF={};
PF.hab=(ctx,x,z,ry,len=10,name='',o={})=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P,M=o.mat||MAT.hull;
  P.add(g,MAT.metal,RB(len+.4,.5,4.6,.1,3),0,.25,0);
  for(let i=-len/2+.8;i<=len/2-.8;i+=len/3)for(const s of[-1,1])P.add(g,MAT.metal,cyl(.12,.16,.9,10),i,-.2,s*1.9);
  P.add(g,M,RB(len,3,4.2,.22,3),0,1.95,0);
  P.add(g,M,scaleUV(cyl(2.1,2.1,len,40,1,false,0,Math.PI),len/3,2),0,3.45,0,0,0,Math.PI/2);
  for(const s of[-1,1])P.add(g,MAT.metal,RB(.18,1.9,4.5,.06,1),s*(len/2-.05),3.4,0);
  for(let i=-len/2+1.4;i<len/2-1;i+=1.9)for(const s of[-1,1]){P.add(g,MAT.metal,RB(1.2,.78,.16,.06,1),i,2.3,s*2.1);P.add(g,o.cool?MAT.winCool:MAT.win,RB(1,.58,.06,.02,1),i,2.3,s*2.17);P.add(g,MAT.metal,RB(1.3,.08,.3,.02,1),i,2.75,s*2.2);}
  // door end
  P.add(g,MAT.metal,RB(.25,2.6,2,.06,1),len/2+.05,1.75,0);P.add(g,MAT.hullDark,RB(.08,2.2,1.4,.03,1),len/2+.16,1.6,0);P.add(g,MAT.tealGlow,RB(.04,.08,1.2,.01,1),len/2+.21,2.8,0);
  P.add(g,MAT.metal,RB(1,.15,1.8,.04,1),len/2+.6,.45,0);P.add(g,MAT.metal,RB(.6,.15,1.8,.04,1),len/2+1.1,.2,0);
  glowAt(ctx,g,len/2+.4,3.1,0,0xffd08a,1.8,.6);
  // roof gear
  for(let i=-len/2+1.6;i<len/2-1;i+=3.2){P.add(g,MAT.hullDark,RB(1,.55,1,.12,1),i,4.85,.4);P.add(g,MAT.metal,cyl(.32,.36,.14,18),i,5.2,.4);for(let k=0;k<4;k++)P.add(g,MAT.metal,RB(.7,.03,.06,.01,1),i,5.28,.4-.24+k*.16);}
  P.add(g,MAT.metal,cyl(.03,.03,2.2,6),-len/2+.8,5.6,-.8);glowAt(ctx,g,-len/2+.8,6.7,-.8,0xff3a3a,.9,.8);
  for(const s of[-1,1])P.add(g,MAT.metal,scaleUV(cyl(.1,.1,len*.92,10),1,len/2),0,.7,s*2.3,0,0,Math.PI/2);
  if(o.solar){for(let i=-len/2+1.5;i<len/2-1;i+=2.4){P.add(g,MAT.metal,cyl(.04,.04,.5,6),i,5.05,-1);P.add(g,new THREE.MeshStandardMaterial({color:0x1a2a4a,metalness:.8,roughness:.25}),RB(2,.05,1.2,.01,1),i,5.32,-1,.35,0,0);}}
  if(name)for(const s of[-1,1]){const d=decal([name,o.sub||'MERIDIAN STATION'],3.6,.9,{fg:'#2a2436'});d.position.set(-len/2+2.6,1.25,s*2.12);d.rotation.y=s>0?0:Math.PI;g.add(d);}
  for(let t=-len/2+2;t<=len/2-2;t+=3){const w=toW(x,z,ry,t,0);addCol(w.x,w.z,2.6);}const e1=toW(x,z,ry,len/2-1.5,0),e2=toW(x,z,ry,-len/2+1.5,0);addCol(e1.x,e1.z,2.4);addCol(e2.x,e2.z,2.4);
  return {g,door:toW(x,z,ry,len/2+1.8,0)};};
PF.dome=(ctx,x,z,r=8,name='',o={})=>{const y=groundY(x,z),g=grp(ctx,x,y,z,0),P=ctx.P;
  P.add(g,MAT.hull,scaleUV(sph(r,72,28,0,Math.PI*2,0,Math.PI/2),10,3),0,0,0);
  for(let i=0;i<6;i++)P.add(g,MAT.metal,tor(r+.06,.14,8,72,Math.PI),0,0,0,0,i*Math.PI/6,0);
  P.add(g,MAT.hullDark,scaleUV(cyl(r+.25,r+.45,.7,72),12,1),0,.35,0);
  P.add(g,MAT.tealGlow,tor(r*.95,.12,8,96),0,r*.32,0,Math.PI/2,0,0);P.add(g,MAT.tealGlow,tor(r*.68,.1,8,96),0,r*.68,0,Math.PI/2,0,0);
  P.add(g,MAT.hullDark,sph(r*.14,24,10,0,Math.PI*2,0,Math.PI/2),0,r*.99,0);
  const da=o.door===undefined?Math.PI/4:o.door,dx=Math.sin(da)*(r-.6),dz=Math.cos(da)*(r-.6);
  P.add(g,MAT.hullDark,RB(3.2,3.6,2.4,.3,1),dx,1.8,dz,0,da,0);P.add(g,MAT.metal,RB(2.6,3,.2,.08,1),dx+Math.sin(da)*1.2,1.6,dz+Math.cos(da)*1.2,0,da,0);
  P.add(g,MAT.tealGlow,RB(1.8,2.5,.08,.04,1),dx+Math.sin(da)*1.32,1.45,dz+Math.cos(da)*1.32,0,da,0);
  if(name){const d=decal(name,2.6,.5,{fg:'#e9e4f2'});d.position.set(dx+Math.sin(da)*1.43,3.35,dz+Math.cos(da)*1.43);d.rotation.y=da;g.add(d);}
  addCol(x,z,r+.4);addCol(x+dx,z+dz,1.6);return {door:{x:x+Math.sin(da)*(r+2),z:z+Math.cos(da)*(r+2)}};};
PF.tower=(ctx,x,z,h=16)=>{const y=groundY(x,z),tw=grp(ctx,x,y,z,0),P=ctx.P;
  const corner=(i,yy)=>{const a=i*Math.PI/2+Math.PI/4,r=1.4-yy*.05;return V3(Math.cos(a)*r,yy,Math.sin(a)*r);};
  for(let i=0;i<4;i++){P.beam(tw,MAT.metal,corner(i,0),corner(i,h),.09,10);for(let yy=0;yy<h-1;yy+=2.5){P.beam(tw,MAT.metal,corner(i,yy),corner((i+1)%4,yy+2.5),.035,6);P.beam(tw,MAT.metal,corner((i+1)%4,yy),corner(i,yy+2.5),.035,6);P.beam(tw,MAT.metal,corner(i,yy),corner((i+1)%4,yy),.04,6);}}
  P.add(tw,MAT.hull,RB(1.4,.5,1.4,.1,1),0,h,0);P.add(tw,MAT.hull,scaleUV(sph(2.1,40,16,0,Math.PI*2,0,1.1),4,1),0,h-.8,1.2,2.2,0,0);
  P.add(tw,MAT.metal,cyl(.05,.05,5,8),.4,h+2.5,0);const b=glowAt(ctx,tw,.4,h+5.1,0,0xff3a3a,3,.9);ctx.anim(()=>{b.visible=Math.sin(performance.now()*.0022)>-.2;});
  P.add(tw,MAT.hullDark,RB(2.4,1.2,1.6,.15,1),2,.6,0);addCol(x,z,1.9);};
PF.lamp=(ctx,x,z,color=0x6ff2d6)=>{const y=groundY(x,z),P=ctx.P,g=ctx.g;
  P.add(g,MAT.metal,lathe([[.22,0],[.18,.15],[.09,.25],[.07,3],[.12,3.1],[0,3.12]],14),x,y,z);P.add(g,MAT.hullDark,RB(.36,.14,.36,.05,1),x,y+3.15,z);
  P.add(g,color===0x6ff2d6?MAT.tealGlow:MAT.amberGlow,sph(.15,16,10),x,y+3.36,z);glowAt(ctx,null,x,y+3.38,z,color,2.6,.6);addCol(x,z,.3);};
PF.crates=(ctx,x,z,n=4,seed=1)=>{const r=mulberry(seed),P=ctx.P,mats=[MAT.crate,MAT.crateBlue,MAT.crateRed];
  for(let i=0;i<n;i++){const s=.7+r()*.6,ox=(r()-.5)*2.4,oz=(r()-.5)*2.4,stack=i>1&&r()<.4;P.add(ctx.g,mats[Math.floor(r()*3)],rbox(s,s,s,.04,2),x+ox,groundY(x+ox,z+oz)+s/2+(stack?.9:0),z+oz,0,r()*3,0);}addCol(x,z,1.6);};
PF.barrels=(ctx,x,z,n=3,seed=2)=>{const r=mulberry(seed),P=ctx.P;for(let i=0;i<n;i++){const ox=(r()-.5)*1.6,oz=(r()-.5)*1.6,yy=groundY(x+ox,z+oz),m=[MAT.metal,MAT.hullWarm,MAT.crateRed][i%3];
  P.add(ctx.g,m,scaleUV(cyl(.32,.32,.95,20),2,1),x+ox,yy+.48,z+oz);for(const k of[.15,.8])P.add(ctx.g,MAT.gun,tor(.325,.025,6,24),x+ox,yy+k,z+oz,Math.PI/2,0,0);P.add(ctx.g,MAT.hazard,cyl(.326,.326,.18,20,1,true),x+ox,yy+.5,z+oz);}addCol(x,z,1);};
PF.container=(ctx,x,z,ry,color=0x7a5a3a,label='HALCYON LINES')=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P,m=std(TEX.hull,{color,metalness:.5,roughness:1});
  P.add(g,m,RB(6,2.6,2.4,.05,1),0,1.3,0);for(let i=-2.8;i<=2.8;i+=.35)for(const s of[-1,1])P.add(g,m,RB(.12,2.4,.08,.02,1),i,1.3,s*1.22);
  for(const s of[-1,1])P.add(g,MAT.metal,RB(.1,2.6,2.5,.02,1),s*3.02,1.3,0);P.add(g,MAT.gun,RB(.06,2.2,.06,.02,1),3.08,1.3,.5);P.add(g,MAT.gun,RB(.06,2.2,.06,.02,1),3.08,1.3,-.5);
  const d=decal(label,3,.45,{fg:'#e9e4f2'});d.position.set(0,1.9,1.27);g.add(d);
  const a=toW(x,z,ry,-1.6,0),b=toW(x,z,ry,1.6,0);addCol(a.x,a.z,1.6);addCol(b.x,b.z,1.6);};
PF.tent=(ctx,x,z,ry,mat=MAT.fabric)=>{const y=groundY(x,z),P=ctx.P;const tm=tentModel();if(tm){tm.position.set(x,y,z);tm.rotation.y=ry;ctx.g.add(tm);addCol(x,z,2.4);return;}P.add(ctx.g,mat,scaleUV(new THREE.ConeGeometry(3,3.2,6,6,true),4,3),x,y+1.6,z,0,ry,0);
  P.add(ctx.g,MAT.metal,cyl(.05,.05,3.4,6),x,y+1.7,z);for(let i=0;i<6;i++){const a=ry+i*Math.PI/3;P.beam(ctx.g,MAT.metal,V3(x,y+3.1,z),V3(x+Math.sin(a)*4.4,y,z+Math.cos(a)*4.4),.012,4);}addCol(x,z,2.4);};
PF.solar=(ctx,x,z,ry,rows=3,cols=4)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P,pm=new THREE.MeshStandardMaterial({color:0x1a2a4a,metalness:.85,roughness:.2,emissive:0x0a1430,emissiveIntensity:.4});
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const lx=(c-(cols-1)/2)*2.6,lz=(r-(rows-1)/2)*3;P.add(g,MAT.metal,cyl(.06,.08,1.4,8),lx,.7,lz);P.add(g,pm,RB(2.4,.06,1.6,.02,1),lx,1.45,lz,-.45,0,0);P.add(g,MAT.metal,RB(2.5,.05,.05,.01,1),lx,1.48,lz+.75,-.45,0,0);}
  addCol(x,z,Math.max(rows,cols)*1.4);};
PF.pump=(ctx,x,z,ry)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P;P.add(g,MAT.hullWarm,scaleUV(cyl(1.2,1.2,2.6,28),3,1),0,1.3,0);P.add(g,MAT.metal,cyl(1.25,1.25,.15,28),0,2.65,0);
  P.add(g,MAT.metal,cyl(.25,.25,3,12),1.6,1.6,0);P.add(g,MAT.metal,cyl(.14,.14,2.2,10),.9,.6,0,0,0,Math.PI/2);P.add(g,MAT.gun,tor(.3,.06,8,20),1.6,3.1,0,Math.PI/2,0,0);P.add(g,MAT.hazard,cyl(1.21,1.21,.3,28,1,true),0,.5,0);addCol(x,z,1.8);};
PF.relay=(ctx,x,z,active)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,0),P=ctx.P;
  for(let i=0;i<3;i++){const a=i*2.094;P.beam(g,MAT.metal,V3(Math.cos(a)*1.6,0,Math.sin(a)*1.6),V3(0,9,0),.08,8);}
  P.add(g,MAT.hull,RB(1.4,1,1.4,.15,1),0,1,0);P.add(g,MAT.metal,cyl(.08,.08,4,8),0,10.5,0);P.add(g,MAT.hull,scaleUV(sph(1.4,32,12,0,Math.PI*2,0,1.1),3,1),0,9,.6,2.1,0,0);
  for(let k=0;k<3;k++)P.add(g,MAT.metal,RB(.9,.06,.06,.02,1),0,10.2+k*.6,0);
  const lamp=new THREE.Mesh(sph(.16,12,10),active?MAT.teal:MAT.red);lamp.position.set(0,12.6,0);g.add(lamp);const gl=glowAt(ctx,g,0,12.6,0,active?0x6ff2d6:0xff3a3a,2.4,.8);
  addCol(x,z,1.6);return {lamp,gl,set:on=>{lamp.material=on?MAT.teal:MAT.red;gl.material=glowSprite(on?0x6ff2d6:0xff3a3a,2.4,.8).material;}};};
PF.fence=(ctx,ax,az,bx,bz,h=2.2)=>{const P=ctx.P,L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(L/3));
  for(let i=0;i<=n;i++){const t=i/n,x=lerp(ax,bx,t),z=lerp(az,bz,t),y=groundY(x,z);P.add(ctx.g,MAT.metal,RB(.22,h+.3,.22,.05,1),x,y+h/2,z);addCol(x,z,.35);
    if(i<n){const x2=lerp(ax,bx,(i+1)/n),z2=lerp(az,bz,(i+1)/n),y2=groundY(x2,z2);for(const k of[.4,h*.55,h-.1])P.beam(ctx.g,MAT.metal,V3(x,y+k,z),V3(x2,y2+k,z2),.04,6);
      P.add(ctx.g,MAT.hazard,new THREE.PlaneGeometry(Math.hypot(x2-x,z2-z),.18),(x+x2)/2,(y+y2)/2+h*.55,(z+z2)/2,0,Math.atan2(z2-z,x2-x)*-1,0);
      for(let k=0;k<4;k++){const tt=(k+.5)/4;addCol(lerp(x,x2,tt),lerp(z,z2,tt),.45);}}}};
PF.gate=(ctx,x,z,ry,label,sub)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P;for(const s of[-1,1]){P.add(g,MAT.hullDark,RB(.9,6,.9,.12,1),s*4,3,0);P.add(g,MAT.amberGlow,RB(.06,4,.06,.02,1),s*4,3,.47);}
  P.add(g,MAT.hull,RB(9.2,1,1.2,.15,1),0,6.4,0);const d=decal([label,sub||''],7,1,{fg:'#2a2436'});d.position.set(0,6.4,.62);g.add(d);const d2=decal([label,sub||''],7,1,{fg:'#2a2436'});d2.position.set(0,6.4,-.62);d2.rotation.y=Math.PI;g.add(d2);
  for(const s of[-1,1]){const w=toW(x,z,ry,s*4,0);addCol(w.x,w.z,.8);}};
PF.stall=(ctx,x,z,ry,cloth=MAT.fabricTeal)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P;P.add(g,MAT.crate,RB(3,1,1.2,.06,1),0,.5,.6);
  for(const sx of[-1.5,1.5])for(const sz of[0,1.6])P.add(g,MAT.metal,cyl(.05,.05,2.6,8),sx,1.3,sz-.2);P.add(g,cloth,RB(3.4,.06,2.2,.02,1),0,2.62,.6,.12,0,0);
  for(let i=0;i<5;i++)P.add(g,[MAT.crateBlue,MAT.crate,MAT.crateRed][i%3],rbox(.35,.3,.35,.03,1),-1.1+i*.55,1.15,.6);const w=toW(x,z,ry,0,.6);addCol(w.x,w.z,1.6);};
PF.bench=(ctx,x,z,ry)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P;P.add(g,MAT.hullDark,RB(2.6,1,1.2,.12,1),0,.5,0);P.add(g,MAT.metalLight,RB(2.7,.12,1.3,.05,1),0,1.06,0);
  P.add(g,MAT.metal,RB(.5,1.6,.5,.08,1),-1.05,1.9,-.35);P.add(g,MAT.hull,RB(1.7,.9,.12,.06,1),.2,1.9,-.55,-.2,0,0);P.add(g,MAT.screens[1],new THREE.PlaneGeometry(1.5,.75),.2,1.92,-.48,-.2,0,0);
  P.add(g,MAT.gun,RB(.3,.25,.4,.04,1),.9,1.25,.2);P.add(g,MAT.metal,cyl(.03,.03,.6,8),-.4,1.2,.3,0,0,Math.PI/2);P.add(g,MAT.amber,RB(.3,.04,.02,.01,1),-.8,.75,.62);
  const a=V3(-1.05,2.6,-.35),b=V3(-.2,2.5,0),c=V3(.35,1.7,.05);P.beam(g,MAT.metal,a,b,.06,10);P.beam(g,MAT.metal,b,c,.045,10);
  glowAt(ctx,g,.35,1.3,.05,0x6ff2d6,1.2,.6);addCol(x,z,1.6);return {arm:c,g};};
PF.board=(ctx,x,z,ry,title='CONTRACTS')=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P;for(const s of[-1,1])P.add(g,MAT.metal,cyl(.08,.08,2.6,8),s*1.2,1.3,0);
  P.add(g,MAT.hullDark,RB(2.7,1.6,.12,.05,1),0,1.8,0);const r=mulberry(Math.round(x*7+z));for(let i=0;i<6;i++)P.add(g,i%2?MAT.white:MAT.amberGlow,new THREE.PlaneGeometry(.5,.36),-.9+(i%3)*.9,1.55+(i>2?.5:0),.07,0,0,(r()-.5)*.2);
  const d=decal(title,2.4,.36,{fg:'#ffc35a'});d.position.set(0,2.75,.08);g.add(d);addCol(x,z,1.4);};
PF.kiosk=(ctx,x,z,ry,label)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry),P=ctx.P;P.add(g,MAT.hullDark,RB(1,2.2,.7,.12,1),0,1.1,0);P.add(g,MAT.screens[(Math.abs(Math.round(x))%6)],new THREE.PlaneGeometry(.75,.5),0,1.55,.36);
  P.add(g,MAT.tealGlow,RB(1.02,.05,.72,.02,1),0,2.2,0);if(label){const n=neon(label,1.2,.3,'#6ff2d6');n.position.set(0,2.45,0);g.add(n);}addCol(x,z,.7);};

/* ---------- vehicles ---------- */
// A six-wheeled pressurized survey rover; "wreck" variant is tipped, burnt and missing a wheel.
// Six-wheeled survey rover: a sculpted hull, bubble cab, capsule cargo pod and balloon tires.
const ROVER_GEO={};
function roverGeos(){if(ROVER_GEO.hull)return ROVER_GEO;
  const hs=new THREE.Shape();hs.moveTo(-3.25,.78);hs.lineTo(2.85,.78);hs.quadraticCurveTo(3.6,.8,3.55,1.32);hs.quadraticCurveTo(3.45,1.72,2.9,1.86);hs.lineTo(.2,1.98);hs.lineTo(-2.9,1.92);hs.quadraticCurveTo(-3.45,1.85,-3.45,1.4);hs.quadraticCurveTo(-3.45,.86,-3.25,.78);
  const hull=new THREE.ExtrudeGeometry(hs,{depth:2.0,bevelEnabled:true,bevelThickness:.16,bevelSize:.14,bevelSegments:4,curveSegments:14});hull.translate(0,0,-1.0);ROVER_GEO.hull=projUV(hull,.5);
  const ss=new THREE.Shape();ss.moveTo(-3.3,0);ss.lineTo(3.3,0);ss.lineTo(3.1,.16);ss.lineTo(-3.1,.16);ss.lineTo(-3.3,0);
  const skirt=new THREE.ExtrudeGeometry(ss,{depth:.12,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:2});ROVER_GEO.skirt=skirt;
  ROVER_GEO.tire=lathe([[.28,-.26],[.42,-.27],[.53,-.22],[.6,-.12],[.62,0],[.6,.12],[.53,.22],[.42,.27],[.28,.26]],40);
  ROVER_GEO.pod=lathe([[0,-1.5],[.5,-1.42],[.82,-1.2],[.95,-.8],[.97,0],[.95,.8],[.82,1.2],[.5,1.42],[0,1.5]],36);
  return ROVER_GEO;}
PF.rover=(ctx,x,z,ry,o={})=>{{const rm=roverModel(ctx,x,z,ry,o);if(rm)return rm;}const wreck=!!o.wreck,y=groundY(x,z),g=grp(ctx,x,y,z,ry),body=new THREE.Group();g.add(body);const P=ctx.P,RG=roverGeos();
  if(wreck){g.rotation.set(.05,ry,.16);body.position.y=-.38;}
  const paint=std(TEX.lander,{color:wreck?0x5e4e46:(o.color||0xd8cdb8),metalness:.5,roughness:wreck?1:.85}),dark=wreck?std(TEX.armor,{color:0x221e20,metalness:.4,roughness:.95}):MAT.gun,trim=wreck?dark:MAT.metalLight;
  const glass=wreck?new THREE.MeshStandardMaterial({color:0x0a0806,roughness:.5,metalness:.6}):new THREE.MeshStandardMaterial({color:0x0c1824,roughness:.05,metalness:.9,emissive:0x0a2030,emissiveIntensity:.4});
  // sculpted lower hull with a skid skirt and hazard banding
  P.add(body,paint,RG.hull,0,0,0);for(const s of[-1,1])P.add(body,dark,RG.skirt,0,.66,s>0?1.08:-1.2);
  P.add(body,MAT.hazard,new THREE.PlaneGeometry(1.6,.14),3.0,1.12,1.17,0,.35,0);P.add(body,MAT.hazard,new THREE.PlaneGeometry(1.6,.14),3.0,1.12,-1.17,0,Math.PI-.35,0);
  // bubble cab: painted lower shell, tinted canopy above, frame ribs
  P.add(body,paint,sph(1,44,20,0,Math.PI*2,1.05,.55),1.35,2.0,0,0,0,0,1.5,1.05,1.14);
  if(!wreck)P.add(body,glass,sph(1,44,16,0,Math.PI*2,0,1.06),1.35,2.0,0,0,0,0,1.5,1.05,1.14);
  else{P.add(body,glass,sph(1,40,14,0,Math.PI*1.25,0,1.06),1.35,2.0,0,0,.6,0,1.5,1.05,1.14);for(let i=0;i<7;i++)P.add(ctx.g,glass,new THREE.TetrahedronGeometry(rf(.08,.22),0),x+rf(-2,3),y+.05,z+rf(-2.6,2.6),rf(0,3),rf(0,3),rf(0,3));}
  P.add(body,trim,tor(1,.045,8,64),1.35,2.55,0,Math.PI/2,0,0,1.5,1.14,1);P.add(body,trim,tor(1,.04,8,48,Math.PI),1.35,2.0,0,0,0,0,1.5,1.05,1);
  for(const s of[-1,1])P.add(body,trim,tor(1,.035,6,40,Math.PI*.5),1.35,2.0,0,0,s*.55,Math.PI/2,1.5,1.05,1.14);
  // capsule cargo pod with ribs, hatch and a roof rack
  P.add(body,paint,RG.pod,-1.75,2.32,0,0,0,Math.PI/2,1,1,.98);for(let i=-2;i<=2;i++)P.add(body,dark,tor(.97,.05,8,40),-1.75+i*.52,2.32,0,0,Math.PI/2,0);
  P.add(body,dark,RB(1.1,.9,.05,.04,1),-1.75,2.25,.97);P.add(body,wreck?MAT.redGlow:MAT.tealGlow,RB(.5,.06,.02,.01,1),-1.75,2.62,1.0);
  for(const s of[-1,1])P.add(body,MAT.metal,cyl(.035,.035,2.6,8),-1.75,3.34,s*.5,0,0,Math.PI/2);for(let i=0;i<5;i++)P.add(body,MAT.metal,cyl(.03,.03,1.05,6),-2.85+i*.55,3.34,0,Math.PI/2,0,0);
  if(!wreck){P.add(body,MAT.crate,rbox(.6,.45,.55,.04,1),-2.3,3.6,.15);P.add(body,MAT.crateBlue,rbox(.5,.4,.5,.04,1),-1.4,3.58,-.15);
    P.add(body,new THREE.MeshStandardMaterial({color:0x1a2a4a,metalness:.85,roughness:.25}),RB(1.3,.04,.8,.01,1),-.95,3.42,.0,0,0,.12);}
  // nose: winch, headlights, sensor bar
  P.add(body,dark,cyl(.22,.22,.7,16),3.55,1.05,0,Math.PI/2,0,0);P.add(body,MAT.metal,tor(.2,.04,6,16),3.85,1.05,0,0,Math.PI/2,0);
  for(const s of[-1,1]){P.add(body,dark,cyl(.14,.16,.12,16),3.5,1.5,s*.72,0,0,Math.PI/2);if(!wreck){P.add(body,MAT.white,sph(.1,12,8),3.56,1.5,s*.72);}}
  P.add(body,dark,RB(.5,.14,1.6,.06,1),1.8,3.08,0);for(let k=-2;k<=2;k++)P.add(body,wreck?MAT.glassDark:MAT.amber,sph(.05,8,6),2.02,3.1,k*.32);
  P.add(body,MAT.metal,cyl(.02,.02,1.6,6),-.6,3.9,-.8);P.add(body,MAT.metal,sph(.05,8,6),-.6,4.7,-.8);if(!wreck)glowAt(ctx,body,-.6,4.72,-.8,0xff3a2a,.6,.8);
  // six wheels: trailing arms, balloon tires with lugs, hubs and fender arches
  const tire=std(TEX.rubber,{color:0x1c1a20,roughness:.95}),hub=wreck?dark:MAT.metalLight;
  [[2.25,1],[0,1],[-2.25,1],[2.25,-1],[0,-1],[-2.25,-1]].forEach(([wx,s],i)=>{if(wreck&&i===3)return;const wy=.66,wz=s*1.48;
    P.add(body,MAT.metal,cyl(.07,.09,1.0,8),wx+.3,.95,s*1.15,.0,0,Math.PI/2-.5*s*0);P.beam(body,MAT.metal,V3(wx,wy,s*1.15),V3(wx+.6,1.05,s*1.02),.06,8);
    P.add(body,tire,RG.tire,wx,wy,wz,Math.PI/2,0,0);for(let k=0;k<14;k++){const a=k/14*Math.PI*2;P.add(body,tire,RB(.14,.1,.46,.03,1),wx+Math.cos(a)*.6,wy+Math.sin(a)*.6,wz,0,0,a);}
    P.add(body,hub,cyl(.3,.3,.5,24),wx,wy,wz,Math.PI/2,0,0);P.add(body,dark,cyl(.12,.12,.56,12),wx,wy,wz,Math.PI/2,0,0);for(let k=0;k<6;k++){const a=k/6*Math.PI*2;P.add(body,MAT.gun,cyl(.035,.035,.54,6),wx+Math.cos(a)*.2,wy+Math.sin(a)*.2,wz,Math.PI/2,0,0);}
    P.add(body,paint,tor(.8,.1,8,28,Math.PI),wx,wy,s*1.42,0,0,0,1,1,1.6);});
  if(wreck){// half-buried in a drift, a lost wheel, a torn panel, scorch and smoke
    const t=toW(x,z,ry,3.4,3.2);P.add(ctx.g,tire,RG.tire,t.x,groundY(t.x,t.z)+.27,t.z,.1,.6,0);P.add(ctx.g,dark,cyl(.3,.3,.5,24),t.x,groundY(t.x,t.z)+.27,t.z,Math.PI/2,.6,0);
    const sm=std(TEX.sand,{color:0xd0a070,roughness:.98});for(let i=0;i<5;i++){const w=toW(x,z,ry,-2.6+i*1.4,-1.9);P.add(ctx.g,sm,rockGeo(2,i*3.1+1,.25,.55),w.x,groundY(w.x,w.z)-.1,w.z,0,ry,0,1.4,.55,.9);}
    P.add(body,dark,RB(1.2,.06,.9,.02,1),.4,2.1,1.25,.6,0,.4);const sc=new THREE.Mesh(new THREE.CircleGeometry(4.2,32),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.35,depthWrite:false}));sc.rotation.x=-Math.PI/2;sc.position.set(x,y+.06,z);ctx.g.add(sc);
    body.updateMatrixWorld(true);const sp=V3(1.3,2.6,0).applyMatrix4(body.matrixWorld);
    ctx.anim(()=>{if(Math.random()<.35)FX.spawn(sp.x+rf(-.3,.3),sp.y,sp.z+rf(-.3,.3),rf(-.15,.15),rf(.6,1.3),rf(-.15,.15),{life:rf(1.6,2.6),size:rf(.35,.6),c0:0x3a3230,c1:0x8a8078,drag:.4,grav:-.15});
      if(Math.random()<.04)for(let i=0;i<8;i++)FX.spawn(sp.x,sp.y-.6,sp.z+1,rf(-1.5,1.5),rf(.5,2.5),rf(-1.5,1.5),{life:.4,size:.06,c0:0xffffff,c1:0xffa040,drag:1.2,grav:9});});}
  else{const d=decal(['MERIDIAN','HAULER 7'],1.4,.5,{fg:'#2a2436'});d.position.set(-1.75,2.32,1.0);body.add(d);}
  const c1=toW(x,z,ry,1.6,0),c2=toW(x,z,ry,-1.6,0);addCol(c1.x,c1.z,1.8);addCol(c2.x,c2.z,1.8);return {g,body};};
// small personal shuttle used at the station and as background traffic
PF.shuttle=(ctx,x,y,z,ry,s=1,color=0xc8c0b0)=>{{const sm=shuttleModel(ctx,x,y,z,ry,s,color);if(sm)return sm;}const g=grp(ctx,x,y,z,ry);g.scale.setScalar(s);const P=ctx.P,m=std(TEX.lander,{color,metalness:.5,roughness:1});
  P.add(g,m,lathe([[0,-3],[1,-2.8],[1.4,-1.8],[1.5,0],[1.3,1.6],[.8,2.8],[0,3.2]],40),0,1.4,0,Math.PI/2,0,0,1.2,1,.8);
  P.add(g,MAT.glassDark,sph(.9,24,10,0,Math.PI*2,0,1),0,2.2,1.6,-.4,0,0,1,.5,1.3);for(const sd of[-1,1]){P.add(g,m,RB(2.6,.16,1.6,.06,2),sd*2.2,1.1,-1,0,0,-sd*.1);P.add(g,MAT.metal,cyl(.4,.5,1.4,20),sd*1.3,1.3,-2.6,Math.PI/2,0,0);P.add(g,MAT.tealGlow,cyl(.36,.36,.04,20),sd*1.3,1.3,-3.31,Math.PI/2,0,0);}
  return g;};

/* ---------- Builder ruins ---------- */
PF.pillar=(ctx,x,z,h,r=.8,tilt=0)=>{if(ruinStone(ctx,x,z,h,r,tilt))return;const y=groundY(x,z);ctx.P.add(ctx.g,MAT.runes,scaleUV(cyl(r*.9,r,h,8),2,h/2),x,y+h/2-.1,z,tilt,0,tilt*.6);ctx.P.add(ctx.g,MAT.runes,cyl(r*1.15,r*1.05,.2,8),x,y+h-.1,z);addCol(x,z,r+.1);};
PF.glyphStone=(ctx,x,z,ry)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,ry);const rs=runeStoneMesh(2.4);if(rs){rs.position.y=-.1;g.add(rs);}else ctx.P.add(g,MAT.runes,lathe([[.8,0],[.7,1.6],[.5,2.3],[0,2.5]],6),0,0,0);const gl=glowAt(ctx,g,0,1.5,.7,0x8fffe0,1.6,.5);addCol(x,z,.9);return gl;};
PF.spire=(ctx,x,z,h=22)=>{const y=groundY(x,z),g=grp(ctx,x,y,z,0),P=ctx.P;
  P.add(g,MAT.runes,scaleUV(cyl(4,5,1,6),3,.3),0,.5,0);P.add(g,MAT.runes,scaleUV(cyl(3.2,4,.6,6),3,.2),0,1.3,0);
  P.add(g,MAT.runes,scaleUV(lathe([[2.3,0],[2.1,h*.27],[1.5,h*.63],[.9,h*.9],[.5,h]],6),2,5),0,1.5,0);
  for(let i=0;i<6;i++){const a=i/6*6.28+.52;P.add(g,MAT.runes,crystalGeo(.5,3.4,.3),Math.cos(a)*3.5,.9,Math.sin(a)*3.5,Math.sin(a)*.3,0,-Math.cos(a)*.3);}
  const tip=new THREE.Mesh(new THREE.OctahedronGeometry(1.1,1),new THREE.MeshStandardMaterial({color:0x8fffe0,emissive:0x2a6a60,emissiveIntensity:.6,flatShading:true,roughness:.1}));tip.position.y=h+2.6;g.add(tip);
  const rings=[];for(let i=0;i<3;i++){const r=new THREE.Mesh(scaleUV(tor(3.2-i*.7,.14,10,96),8,1),std(TEX.runes,{color:0x3a3450,emissive:0x8fffe0,emissiveIntensity:.08,metalness:.6,roughness:.3}));r.position.y=6+i*h*.25;r.rotation.x=Math.PI/2+(i-1)*.2;g.add(r);rings.push(r);}
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,400,16,1,true),new THREE.MeshBasicMaterial({color:0x8fffe0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));beam.position.y=224;g.add(beam);
  glowAt(ctx,g,0,h+2.6,0,0x8fffe0,8,.5);addCol(x,z,2.6);
  const S={g,tip,rings,beam,lit:0};ctx.anim(dt=>{const t=performance.now()/1000;tip.rotation.y=t*.6;rings.forEach((r,i)=>{r.rotation.z=t*(.2+i*.12)*(i%2?-1:1);r.material.emissiveIntensity=lerp(r.material.emissiveIntensity,S.lit?1.4:.1+Math.max(0,Math.sin(t*.56))*.35,dt*2);});beam.material.opacity=lerp(beam.material.opacity,S.lit*.32,dt);});return S;};

/* ---------- the Vesper's survival case, thrown clear in the crash ---------- */
// A battered hard case half dug into the ground at an angle: dented shell, hazard bands, a scorched patch around it and a
// blinking beacon. Its lid hangs ajar and swings open once looted (isOpen tells it when).
PF.survivalCase=(ctx,x,z,ry,isOpen)=>{const P=ctx.P,y=groundY(x,z),g=grp(ctx,x,y,z,ry);const tilt=new THREE.Group();tilt.position.y=-.12;tilt.rotation.set(.16,0,-.11);g.add(tilt);
  const shell=std(TEX.lander,{color:0xc8a070,metalness:.4,roughness:.8}),dark=MAT.hullDark;
  P.add(tilt,shell,RB(1.3,.5,.72,.08,2),0,.25,0);P.add(tilt,dark,RB(1.36,.07,.78,.03,1),0,.5,0);
  for(const sx of[-.5,.5])P.add(tilt,MAT.hazard,RB(.14,.52,.74,.02,1),sx,.25,0);
  P.add(tilt,dark,RB(.34,.06,.05,.02,1),0,.3,.38);for(const sx of[-.3,.3])P.add(tilt,MAT.metal,RB(.1,.12,.05,.02,1),sx,.42,.38);
  // dents and a torn corner
  P.add(tilt,dark,RB(.32,.22,.1,.05,1),-.48,.22,.33,.2,.3,.15);P.add(tilt,MAT.metal,RB(.2,.06,.3,.02,1),.62,.12,-.28,.4,.5,.6);
  // scorch and spilled debris
  P.add(g,new THREE.MeshBasicMaterial({color:0x080604,transparent:true,opacity:.6,depthWrite:false}),new THREE.CircleGeometry(1.6,24),0,.04,0,-Math.PI/2,0,0,1,.75,1);
  for(const [dx,dz,r] of[[1.1,.5,.4],[-.9,.8,1.3],[.4,-1,2.2],[-1.2,-.5,.7]])P.add(g,dark,RB(.22,.04,.14,.01,1),dx,.05,dz,.1,r,.2);
  P.add(g,MAT.crateRed,RB(.26,.14,.18,.03,1),.95,.08,-.55,0,.7,.3);
  // the lid on its hinge, ajar until opened
  const hinge=new THREE.Group();hinge.position.set(0,.52,-.36);tilt.add(hinge);const lid=new THREE.Mesh(RB(1.3,.1,.72,.05,2),shell);lid.position.set(0,.04,.36);lid.castShadow=true;hinge.add(lid);
  const band=new THREE.Mesh(RB(.6,.02,.3,.01,1),MAT.hazard);band.position.set(0,.1,.36);hinge.add(band);hinge.rotation.set(-.22,0,.06);
  const bl=glowAt(ctx,tilt,.52,.62,.3,0xff8a3a,.5,.9);const lamp=new THREE.Mesh(sph(.04,8,6),MAT.amberGlow);lamp.position.set(.52,.54,.3);tilt.add(lamp);
  ctx.anim(dt=>{const o=isOpen();const want=o?-1.9:-.22;hinge.rotation.x+=(want-hinge.rotation.x)*Math.min(1,dt*5);bl.visible=lamp.visible=!o&&Math.sin(performance.now()*.006)>0;});
  addCol(x,z,.8);return g;};

/* ---------- the Vesper (crashed or repaired) ---------- */
PF.vesper=(ctx,x,z,th,o={})=>{if(MODELS.vesper)return patriotShip(ctx,x,z,th,o);if(MODELS.sabre)return sabreShip(ctx,x,z,th,o);const crashed=!!o.crashed;const SH={x,z},fwd={x:Math.sin(th),z:Math.cos(th)},rgt={x:Math.cos(th),z:-Math.sin(th)};
  const Wp=(lx,lz)=>({x:SH.x+rgt.x*lx+fwd.x*lz,z:SH.z+rgt.z*lx+fwd.z*lz});
  const g=new THREE.Group();g.position.set(x,(o.y!==undefined?o.y:groundY(x,z))+(crashed?-.35:.9),z);g.rotation.y=th;ctx.g.add(g);
  const body=new THREE.Group();if(crashed)body.rotation.set(.1,0,.12);g.add(body);const P=new Parts();
  const hull=std(TEX.lander,{color:crashed?0xa89e8c:0xc4bca8,metalness:.45,roughness:1}),hullD=MAT.hullDark,gun=MAT.gun;
  const warm=new THREE.MeshStandardMaterial({color:0x2a1806,emissive:0xffa040,emissiveIntensity:.85,roughness:.5});
  const eng=new THREE.MeshStandardMaterial({color:0x101820,emissive:0x5ab8ff,emissiveIntensity:crashed?.5:1.2,roughness:.3});
  P.add(body,hull,scaleUV(lathe([[0,-7],[1.3,-6.8],[2.1,-6.1],[2.5,-4.4],[2.6,-1],[2.5,2],[2.2,4],[1.7,5.5],[1.05,6.5],[.45,7.05],[0,7.15]],56),1.6,3),0,1.9,0,Math.PI/2,0,0,1.25,1,.82);
  P.add(body,gun,tor(2.62,.07,8,64),0,1.9,1.2,0,0,0,1.25,.82,1);P.add(body,gun,tor(2.6,.07,8,64),0,1.9,-3.2,0,0,0,1.25,.82,1);
  P.add(body,MAT.glassDark,sph(1.15,40,16,0,Math.PI*2,0,1.2),0,3.2,4.4,-.25,0,0,1.05,.55,1.5);for(let i=-1;i<=1;i++)P.add(body,gun,RB(.06,.06,2.6,.02,1),i*.5,3.66,4.3,-.25,0,0);
  P.add(body,gun,RB(1,.35,.5,.1,1),0,1.95,6.9);for(const s of[-1,1])P.add(body,warm,sph(.08,10,8),s*.35,1.95,7.17);
  P.add(body,hullD,RB(1.3,.55,8.4,.16,2),0,4.1,-1.4);for(const s of[-1,1])P.add(body,gun,cyl(.07,.07,8,10),s*.55,4.32,-1.4,Math.PI/2,0,0);
  for(let i=0;i<5;i++){P.add(body,gun,RB(.9,.12,.5,.03,1),0,4.43,-4.6+i*1.6);P.add(body,hullD,RB(.7,.05,.34,.02,1),0,4.5,-4.6+i*1.6);}
  P.add(body,gun,cyl(.05,.07,2.4,10),.2,5.5,1.9);P.add(body,hull,sph(.6,24,10,0,Math.PI*2,0,1.1),.2,6.6,1.9,2.4,.3,0);
  P.add(body,hullD,RB(3.4,.8,6.4,.25,2),0,.45,-1);P.add(body,gun,RB(.25,1.9,2.1,.06,1),-3.2,1.75,.6);P.add(body,warm,RB(.06,1.5,1.6,.02,1),-3.12,1.7,.6);
  P.add(body,hullD,RB(1.9,.12,1.6,.04,1),-4.05,.7,.6,0,0,.5);
  for(const s of[-1,1])for(let i=0;i<5;i++)P.add(body,warm,RB(.05,.2,.42,.02,1),s*3.17,2.45,-2.6+i*1.15);
  for(const s of[-1,1]){P.add(body,gun,cyl(.06,.06,7,10),s*3.16,1.3,-.8,Math.PI/2,0,0);P.add(body,gun,cyl(.045,.045,5,8),s*3.06,1.12,-1.6,Math.PI/2,0,0);
    const r=mulberry(s>0?3:5);for(let i=0;i<14;i++){const zz=-5.4+i*.75+(r()-.5)*.3,h=.12+r()*.22,w=.25+r()*.3;P.add(body,i%3?hullD:gun,RB(.12,h,w,.03,1),s*3.21,1.6+r()*.55,zz);}
    P.add(body,hull,RB(2.4,.22,3,.08,2),s*3.7,1.6,-3.4,0,0,-s*.08);P.add(body,gun,RB(.5,.4,.8,.08,1),s*4.85,1.55,-3.4);P.add(body,eng,cyl(.12,.12,.04,16),s*4.85,1.55,-3.82,Math.PI/2,0,0);
    P.add(body,hull,RB(.18,1.9,2,.06,2),s*.95,4.5,-5.5,-.2,0,s*.35);}
  P.add(body,hullD,RB(.16,1.5,1.6,.05,2),0,4.6,-5.8,-.25,0,0);
  P.add(body,gun,lathe([[1.05,0],[1.45,-.6],[1.75,-1.35],[1.65,-1.35],[1.3,-.6],[.95,0]],40),0,1.9,-6.6,Math.PI/2,0,0);P.add(body,eng,cyl(1.0,1.0,.06,40),0,1.9,-6.7,Math.PI/2,0,0);
  const podGeo=lathe([[0,-2.6],[.6,-2.45],[.92,-2],[1,-.8],[1,1.2],[.9,1.8],[.72,2.15],[.78,2.4],[0,2.45]],36);
  P.add(body,hullD,RB(2.6,.36,.9,.1,1),4.3,2.5,-4.8);P.add(body,hull,podGeo,6,2.5,-4.8,-Math.PI/2,0,0);P.add(body,eng,tor(.78,.07,8,40),6,2.5,-7.25);P.add(body,eng,cyl(.72,.72,.04,32),6,2.5,-7.2,Math.PI/2,0,0);P.add(body,gun,tor(.95,.05,6,40),6,2.5,-1);
  if(crashed){P.add(body,hullD,RB(1.2,.36,.9,.1,1),-3.6,2.5,-4.8);P.add(body,MAT.basalt,rockGeo(1,4.4,.5,.6),-4.25,2.5,-4.8,0,0,0,.35,.4,.55);
    P.add(body,new THREE.MeshStandardMaterial({color:0x050304,roughness:.9}),RB(.12,.8,1.1,.05,1),3.22,2.1,2.6);P.add(body,MAT.redGlow,RB(.04,.5,.8,.02,1),3.26,2.1,2.6);}
  else{P.add(body,hullD,RB(2.6,.36,.9,.1,1),-4.3,2.5,-4.8);P.add(body,hull,podGeo,-6,2.5,-4.8,-Math.PI/2,0,0);P.add(body,eng,tor(.78,.07,8,40),-6,2.5,-7.25);P.add(body,eng,cyl(.72,.72,.04,32),-6,2.5,-7.2,Math.PI/2,0,0);P.add(body,gun,tor(.95,.05,6,40),-6,2.5,-1);
    for(const [lx,lz] of [[-2,4],[2,4],[-2.4,-4],[2.4,-4]]){P.add(body,MAT.metal,cyl(.12,.16,1.6,10),lx,-.1,lz);P.add(body,MAT.metal,cyl(.45,.5,.12,20),lx,-.9,lz);}}
  P.build();
  const haz=(w,h,px,py,pz,ry)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),MAT.hazard);m.position.set(px,py,pz);m.rotation.y=ry;body.add(m);};
  haz(2.1,.18,-3.34,2.6,.6,-Math.PI/2);haz(2.1,.18,-3.34,.9,.6,-Math.PI/2);
  for(const s of[-1,1]){const hd=new THREE.Group();hd.position.set(s*3.13,2.62,-2.2);hd.rotation.z=s*.28;body.add(hd);const d=decal(['ISV VESPER','HALCYON LINES · VS-117'],3,.6,{fg:'#2a2436'});d.rotation.y=s*Math.PI/2;hd.add(d);}
  const beacon=glowAt(ctx,body,.2,6.75,1.9,0xff3a3a,1.6,.8);
  for(const lz of [-6.2,-3.8,-1.4,1,3.4,5.8]){const q=Wp(0,lz);addCol(q.x,q.z,lz>5?1.9:2.7);}{const q=Wp(6,-4.8);addCol(q.x,q.z,1.3);}if(!crashed){const q=Wp(-6,-4.8);addCol(q.x,q.z,1.3);}
  body.updateMatrixWorld(true);const L=(a,b,c)=>V3(a,b,c).applyMatrix4(body.matrixWorld);
  const fx={warm,eng,beacon,fires:crashed?[L(3.3,2.1,2.6),L(-4.3,2.5,-4.8),L(0,1.9,-7.2)]:[],sparks:crashed?[L(-4.4,2.5,-4.8),L(3.3,2.4,2.4)]:[],hatch:Wp(-5,.6),g};
  fx.fires.forEach(v=>{const s=glowSprite(0xff7a2a,2.2,.8);s.position.copy(v);ctx.g.add(s);});
  ctx.anim(dt=>{const t=performance.now()/1000;beacon.visible=Math.sin(t*3.4)>.6;warm.emissiveIntensity=Math.random()<.04?.15:.75+Math.sin(t*23)*.08;eng.emissiveIntensity=crashed?.35+Math.max(0,Math.sin(t*1.7))*.3:1.1+Math.sin(t*2)*.15;
    for(const v of fx.fires)if(Math.random()<.5)FX.spawn(v.x+rf(-.3,.3),v.y,v.z+rf(-.3,.3),rf(-.3,.3),rf(1,2.4),rf(-.3,.3),{life:rf(.6,1.4),size:rf(.12,.26),c0:0xffc070,c1:0x601808,drag:.6,grav:-.4});
    if(fx.sparks.length&&Math.random()<.08){const v=pick(fx.sparks);for(let i=0;i<14;i++)FX.spawn(v.x,v.y,v.z,rf(-2.5,2.5),rf(.5,4),rf(-2.5,2.5),{life:rf(.3,.7),size:rf(.05,.1),c0:0xffffff,c1:0xffa040,drag:1.2,grav:9});}});
  return fx;};

// The Vesper: "Phantom Sabre jet". Parked, it stands level on its gear; crashed, it is scorched, nosed into a berm of
// ploughed earth at the end of a burned skid, its hull holed by a cannon strafe and laser gashes that still glow, with sparks,
// smoke and a burning engine. Strike marks are placed by casting rays at the hull, so they sit on its real surface.
let SABRE_ENV=null;const DTEX={};
function dmgTex(kind){if(DTEX[kind])return DTEX[kind];const c=mkCanvas(128),g=c.getContext('2d');
  if(kind==='scorch'){const gr=g.createRadialGradient(64,64,4,64,64,62);gr.addColorStop(0,'rgba(8,6,5,.92)');gr.addColorStop(.55,'rgba(20,14,10,.6)');gr.addColorStop(1,'rgba(20,14,10,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);
    for(let i=0;i<60;i++){g.fillStyle=`rgba(0,0,0,${Math.random()*.35})`;g.beginPath();g.arc(64+(Math.random()-.5)*90,64+(Math.random()-.5)*90,Math.random()*9,0,7);g.fill();}}
  else if(kind==='hole'){g.fillStyle='rgba(0,0,0,0)';g.fillRect(0,0,128,128);g.fillStyle='#050302';g.beginPath();for(let i=0;i<=18;i++){const a=i/18*6.28,r=24+Math.random()*9;i?g.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r):g.moveTo(64+Math.cos(a)*r,64+Math.sin(a)*r);}g.fill();}
  else if(kind==='rim'){const gr=g.createRadialGradient(64,64,20,64,64,52);gr.addColorStop(0,'rgba(255,190,90,0)');gr.addColorStop(.2,'rgba(255,170,60,1)');gr.addColorStop(.45,'rgba(255,90,20,.7)');gr.addColorStop(1,'rgba(120,20,0,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);}
  else if(kind==='gash'){const gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,80,10,0)');gr.addColorStop(.38,'rgba(255,110,30,.6)');gr.addColorStop(.5,'rgba(255,230,160,1)');gr.addColorStop(.62,'rgba(255,110,30,.6)');gr.addColorStop(1,'rgba(255,80,10,0)');
    g.fillStyle=gr;g.fillRect(0,0,128,128);const m=g.createLinearGradient(0,0,128,0);m.addColorStop(0,'rgba(0,0,0,1)');m.addColorStop(.15,'rgba(0,0,0,0)');m.addColorStop(.85,'rgba(0,0,0,0)');m.addColorStop(1,'rgba(0,0,0,1)');g.globalCompositeOperation='destination-out';g.fillStyle=m;g.fillRect(0,0,128,128);}
  return DTEX[kind]=new THREE.CanvasTexture(c);}
function sabreShip(ctx,x,z,th,o={}){const crashed=!!o.crashed,M=MODELS.sabre;if(!SABRE_ENV)SABRE_ENV=archEnv();
  const g=new THREE.Group();g.position.set(x,(o.y!==undefined?o.y:groundY(x,z)),z);g.rotation.y=th;ctx.g.add(g);const body=new THREE.Group();g.add(body);
  const m=M.scene.clone(true),fit=new THREE.Group();fit.add(m);m.rotation.y=-Math.PI/2;body.add(fit);fit.updateMatrixWorld(true);
  const bb=new THREE.Box3().setFromObject(fit),sz=bb.getSize(new THREE.Vector3()),k=16/sz.z,c=bb.getCenter(new THREE.Vector3());fit.scale.setScalar(k);fit.position.set(-c.x*k,-bb.min.y*k,-c.z*k);
  const meshes=[];m.traverse(q=>{if(!q.isMesh)return;q.castShadow=q.receiveShadow=true;const mt=q.material=q.material.clone();mt.envMap=SABRE_ENV;mt.envMapIntensity=1;
    if(crashed){mt.color.lerp(new THREE.Color(0x3a332c),.38);mt.roughness=Math.min(1,(mt.roughness||.5)+.25);}meshes.push(q);});
  const W2=sz.x*k,L=16,Wp=(lx,lz)=>toW(x,z,th,lx,lz);
  // the hull's collision follows the fuselage and the wing roots
  for(const lz of[-6,-3,0,3,6]){const q=Wp(0,lz);addCol(q.x,q.z,lz>5?1.5:2.3);}for(const sg of[-1,1]){const q=Wp(sg*W2*.3,-2.5);addCol(q.x,q.z,1.6);}
  const warm=new THREE.MeshStandardMaterial({color:0x2a1806,emissive:0xffa040,emissiveIntensity:.85,roughness:.5}),eng=new THREE.MeshStandardMaterial({color:0x101820,emissive:0x5ab8ff,emissiveIntensity:crashed?.5:1.2,roughness:.3});
  const beacon=glowAt(ctx,body,0,sz.y*k+.3,-1,0xff3a3a,1.6,.8);
  const fx={warm,eng,beacon,fires:[],sparks:[],smoke:[],hatch:Wp(-W2*.28-1.2,-1.5),g};
  if(crashed){// nose down and rolled, sunk into the ground
    body.rotation.set(.085,0,.15);body.position.y=-1.75;g.updateMatrixWorld(true);
    // burned skid behind, berm of ploughed earth and rock ahead and along the flanks, torn plates strewn about
    const P=ctx.P,sc=new THREE.MeshBasicMaterial({map:dmgTex('scorch'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    for(let i=0;i<9;i++){const q=Wp(rr(-1.5,1.5),-L/2-1-i*3.4),d=new THREE.Mesh(new THREE.PlaneGeometry(6-i*.25,5.5),sc);d.rotation.set(-Math.PI/2,0,th+rr(-.3,.3));d.position.set(q.x,groundY(q.x,q.z)+.06,q.z);ctx.g.add(d);}
    for(let i=0;i<14;i++){const a=rr(-1.2,1.2),q=Wp(Math.sin(a)*rr(3,6.5),L/2-1.5+Math.cos(a)*rr(1,3.5)),s=rr(.8,2.2);P.add(ctx.g,i%3?MAT.rock:MAT.basalt,rockGeo(1,i*3.7),q.x,groundY(q.x,q.z)+s*.15,q.z,rr(0,3),rr(0,3),rr(0,3),s*1.3,s*.55,s);}
    for(let i=0;i<10;i++){const q=Wp(rr(-9,9),rr(-L/2-12,L/2)),w=rr(.6,2.2);if(Math.hypot(q.x-x,q.z-z)<6)continue;P.add(ctx.g,i%2?MAT.hullDark:MAT.metal,RB(w,rr(.05,.25),rr(.4,1.4),.04,1),q.x,groundY(q.x,q.z)+.12,q.z,rr(-.6,.6),rr(0,6),rr(-.6,.6));}
    // strike marks on the hull: rays from outside find the surface
    const rc=new THREE.Raycaster(),hitAt=(lx,ly,lz,dx,dy,dz)=>{const org=new THREE.Vector3(lx,ly,lz).applyMatrix4(body.matrixWorld),dir=new THREE.Vector3(dx,dy,dz).transformDirection(body.matrixWorld).normalize();rc.set(org,dir);const h=rc.intersectObjects(meshes,false)[0];
      if(!h)return null;const n=h.face.normal.clone().transformDirection(h.object.matrixWorld);if(n.dot(dir)>0)n.negate();return {p:h.point,n};};
    const decalOn=(h,tex,w,hh,add,rot)=>{const mt=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
      const d=new THREE.Mesh(new THREE.PlaneGeometry(w,hh),mt);d.position.copy(h.p).addScaledVector(h.n,.04);d.lookAt(h.p.clone().add(h.n));d.rotateZ(rot===undefined?rr(0,6.28):rot);ctx.g.add(d);return d;};
    const top=sz.y*k+2,r=mulberry(77);
    for(let i=0;i<16;i++){const h=hitAt(rr(-W2/2,W2/2),top,rr(-L/2,L/2),0,-1,0)||hitAt(rr(-1,1)*W2,rr(.5,2.5),rr(-L/2,L/2),Math.sign(r()-.5),0,0);if(h)decalOn(h,dmgTex('scorch'),rr(1.4,3.2),rr(1.4,3.2));}
    // a cannon strafe: a line of burned-through holes with molten rims
    for(let i=0;i<6;i++){const h=hitAt(-1.4+i*.55,top,3.6-i*1.5,0,-1,0);if(!h)continue;const s=rr(.55,.8);decalOn(h,dmgTex('scorch'),s*2.6,s*2.6);decalOn(h,dmgTex('hole'),s,s);decalOn(h,dmgTex('rim'),s*1.6,s*1.6,true);if(i%2===0)fx.sparks.push(h.p.clone());if(i===1||i===4)fx.smoke.push(h.p.clone());}
    // laser gashes raked along the flanks
    for(const [lx,ly,lz,sg] of[[0,1.4,1.5,1],[0,2,-2,-1],[0,1.1,-4.5,1],[0,top,-1,0]]){const h=sg?hitAt(sg*W2,ly,lz,-sg,0,0):hitAt(1.8,ly,lz,0,-1,0);if(!h)continue;decalOn(h,dmgTex('scorch'),4,1.1,false,.25);decalOn(h,dmgTex('gash'),3.4,.4,true,.25);fx.sparks.push(h.p.clone());}
    // the port engine is burning
    {const h=hitAt(-W2*.18,top,-L/2+1.2,0,-1,0);if(h){fx.fires.push(h.p.clone());fx.smoke.push(h.p.clone());}}
    fx.fires.forEach(v=>{const s2=glowSprite(0xff7a2a,2.4,.8);s2.position.copy(v);ctx.g.add(s2);});}
  else{// parked: a few landing lights and the hatch light
    for(const sg of[-1,1]){const gl=glowSprite(0x6ff2ff,1.2,.7);gl.position.set(sg*W2*.3,.4,-2);body.add(gl);}}
  // drifting smoke (normal blending, so it darkens rather than glows)
  const smokeM=new THREE.SpriteMaterial({map:GLOW,color:0x2a2622,transparent:true,opacity:.35,depthWrite:false}),puffs=[];
  for(const v of fx.smoke)for(let i=0;i<6;i++){const sp=new THREE.Sprite(smokeM.clone());sp.userData={o:v,t:i/6};ctx.g.add(sp);puffs.push(sp);}
  ctx.anim(dt=>{const t=performance.now()/1000;beacon.visible=Math.sin(t*3.4)>.6;eng.emissiveIntensity=crashed?.3+Math.max(0,Math.sin(t*1.7))*.3:1.1+Math.sin(t*2)*.15;
    for(const sp of puffs){const u=sp.userData;u.t=(u.t+dt*.12)%1;sp.position.set(u.o.x+Math.sin(u.t*5+u.o.x)*.6*u.t,u.o.y+u.t*7,u.o.z+u.t*1.5);sp.scale.setScalar(1+u.t*5);sp.material.opacity=.38*(1-u.t)*Math.min(1,u.t*6);}
    for(const v of fx.fires)if(Math.random()<.6)FX.spawn(v.x+rf(-.4,.4),v.y,v.z+rf(-.4,.4),rf(-.3,.3),rf(1,2.6),rf(-.3,.3),{life:rf(.6,1.4),size:rf(.14,.3),c0:0xffc070,c1:0x601808,drag:.6,grav:-.4});
    if(fx.sparks.length&&Math.random()<.1){const v=pick(fx.sparks);for(let i=0;i<14;i++)FX.spawn(v.x,v.y,v.z,rf(-2.5,2.5),rf(.5,4),rf(-2.5,2.5),{life:rf(.3,.7),size:rf(.05,.1),c0:0xffffff,c1:0xffa040,drag:1.2,grav:9});}});
  return fx;}

// The Vesper: "Spaceship Patriot Type 1" by Kessler_Protus (CC BY 4.0), its flag emblem painted out, at 30 m long so the
// decks inside are believable. Parked, it stands on four landing struts with its belly hatch lowered as a boarding ramp;
// crashed, it lies nose-down and rolled, sunk into the ground, scorched, holed, burning and sparking, the ramp hanging open.
// Returns the same handles as the old hull (hatch = where you board, at the foot of the ramp).
const VESPER_LEN=30;
function patriotShip(ctx,x,z,th,o={}){const crashed=!!o.crashed,M=MODELS.vesper;if(!SABRE_ENV)SABRE_ENV=archEnv();
  const g=new THREE.Group();g.position.set(x,(o.y!==undefined?o.y:groundY(x,z)),z);g.rotation.y=th;ctx.g.add(g);const body=new THREE.Group();g.add(body);
  const m=M.scene.clone(true),fit=new THREE.Group();fit.add(m);m.rotation.y=-Math.PI/2;body.add(fit);fit.updateMatrixWorld(true);
  const bb=new THREE.Box3().setFromObject(fit),sz=bb.getSize(new THREE.Vector3()),k=VESPER_LEN/sz.z,c=bb.getCenter(new THREE.Vector3());fit.scale.setScalar(k);fit.position.set(-c.x*k,-bb.min.y*k,-c.z*k);
  const meshes=[];let hatch=null;m.traverse(q=>{if(!q.isMesh)return;q.castShadow=q.receiveShadow=true;const mt=q.material=q.material.clone();mt.envMap=SABRE_ENV;mt.envMapIntensity=1.3;
    // the hull's painted metal reads as near-black in dim light at full metalness: keep it lighter and satin
    if(!/Glass/.test(q.name)){mt.metalness=Math.min(mt.metalness??1,.35);mt.roughness=Math.max(mt.roughness??.5,.5);mt.color.multiplyScalar(1.25);}
    if(/Hatch/.test(q.name))hatch=q;if(crashed){mt.color.lerp(new THREE.Color(0x4a423a),.18);mt.roughness=Math.min(1,(mt.roughness||.5)+.2);}meshes.push(q);});
  const W2=sz.x*k,H2=sz.y*k,L=VESPER_LEN,Wp=(lx,lz)=>toW(x,z,th,lx,lz),P=ctx.P;
  const lift=crashed?-2.9:2.4;body.position.y=lift;if(crashed)body.rotation.set(.12,0,.16);g.updateMatrixWorld(true);
  // the belly hatch becomes the ramp: hinged at its forward edge, its lower end on the ground behind
  let rampFoot=Wp(0,-L*.2);if(hatch&&!crashed){hatch.visible=false;const hb=new THREE.Box3().setFromObject(hatch),hw=hb.max.x-hb.min.x,hc=hb.getCenter(new THREE.Vector3());
    const top=g.worldToLocal(new THREE.Vector3(hc.x,hb.max.y,hc.z)),fwd=g.worldToLocal(new THREE.Vector3(hc.x,hb.max.y,hb.max.z)),aft=g.worldToLocal(new THREE.Vector3(hc.x,hb.max.y,hb.min.z));
    const hingeZ=Math.max(fwd.z,aft.z),hingeY=top.y,len=Math.max(6,Math.hypot(hingeY+.2,6.5)),ang=Math.asin(Math.min(.95,(hingeY+.2)/len));
    const rg=new THREE.Group();rg.position.set(top.x,hingeY,hingeZ);rg.rotation.x=-ang;g.add(rg);
    const rm=std(TEX.deck||TEX.hull,{color:0x7a7e86,metalness:.6,roughness:.5});const ramp=new THREE.Mesh(RB(Math.min(hw,4.2),.28,len,.06,1),rm);ramp.position.set(0,-.14,-len/2);ramp.castShadow=ramp.receiveShadow=true;rg.add(ramp);
    for(const sd of[-1,1]){const rail=new THREE.Mesh(RB(.12,.5,len,.03,1),MAT.metal);rail.position.set(sd*Math.min(hw,4.2)/2,.15,-len/2);rg.add(rail);}
    for(let i=1;i<6;i++){const st=new THREE.Mesh(RB(Math.min(hw,4.2)*.9,.05,.12,.02,1),MAT.hazard);st.position.set(0,.02,-len*i/6);rg.add(st);}
    // light spilling out of the open hatch
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(hw,4.2),3),new THREE.MeshBasicMaterial({color:crashed?0xff5a3a:0xffd8a0,transparent:true,opacity:crashed?.5:.85}));glow.rotation.x=Math.PI/2;glow.position.set(top.x,hingeY+.02,hingeZ-1.5);g.add(glow);
    ctx.light(...(()=>{const w=g.localToWorld(new THREE.Vector3(top.x,hingeY-1.4,hingeZ-2));return [w.x,w.y,w.z];})(),crashed?0xff6a3a:0xffc890,crashed?1:1.4,14);
    const foot=g.localToWorld(new THREE.Vector3(top.x,0,hingeZ-Math.cos(ang)*len-1.2));rampFoot={x:foot.x,z:foot.z};}
  if(!crashed){// four landing struts with pads
    for(const [lx,lz] of[[-W2*.32,-L*.3],[W2*.32,-L*.3],[-W2*.28,L*.26],[W2*.28,L*.26]]){P.add(g,MAT.metal,cyl(.32,.42,lift+.6,12),lx,(lift+.6)/2,lz);P.add(g,MAT.hullDark,cyl(.9,1,.3,16),lx,.15,lz);P.add(g,MAT.hazard,cyl(.36,.36,.5,12,1,true),lx,lift*.55,lz);}}
  // the hull's collision follows the fuselage (the ramp stays walkable)
  // parked, she stands on her struts and you can walk underneath: only the struts are solid
  if(!crashed)for(const [lx,lz] of[[-W2*.32,-L*.3],[W2*.32,-L*.3],[-W2*.28,L*.26],[W2*.28,L*.26]]){const q=Wp(lx,lz);addCol(q.x,q.z,.75);}
  if(crashed)for(let lz=-L/2+3;lz<=L/2-3;lz+=3.2){if(lz<-L/2+6)continue;const q=Wp(0,lz);addCol(q.x,q.z,W2*.42);}
  const warm=new THREE.MeshStandardMaterial({color:0x2a1806,emissive:0xffa040,emissiveIntensity:.85,roughness:.5}),eng=new THREE.MeshStandardMaterial({color:0x101820,emissive:0x5ab8ff,emissiveIntensity:crashed?.5:1.2,roughness:.3});
  const beacon=glowAt(ctx,body,0,H2+lift*0+.3,-2,0xff3a3a,2.2,.8);
  const fx={warm,eng,beacon,fires:[],sparks:[],smoke:[],hatch:rampFoot,g};W.vesperRamp={x:rampFoot.x,z:rampFoot.z,face:th+Math.PI};
  if(crashed)crashDress(ctx,{g,body,fit,meshes,W2,H2,L,x,z,th,fx});
  else{for(const sg of[-1,1]){const gl=glowSprite(0x6ff2ff,1.4,.7);gl.position.set(sg*W2*.36,.6,-3);body.add(gl);}}
  const smokeM=new THREE.SpriteMaterial({map:GLOW,color:0x2a2622,transparent:true,opacity:.35,depthWrite:false}),puffs=[];
  for(const v of fx.smoke)for(let i=0;i<11;i++){const sp=new THREE.Sprite(smokeM.clone());sp.userData={o:v,t:i/11,k:rf(.8,1.25)};ctx.g.add(sp);puffs.push(sp);}
  for(const v of fx.dust||[])for(let i=0;i<6;i++){const sp=new THREE.Sprite(smokeM.clone());sp.material.color.set(0x5a4844);sp.userData={o:v,t:i/6,k:.7,dust:1};ctx.g.add(sp);puffs.push(sp);}
  ctx.anim(dt=>{const t=performance.now()/1000;beacon.visible=Math.sin(t*3.4)>.6;
    for(const sp of puffs){const u=sp.userData;u.t=(u.t+dt*(u.dust?.05:.075))%1;const H=u.dust?4:22;sp.position.set(u.o.x+Math.sin(u.t*4+u.o.x)*1.2*u.t+u.t*u.t*6,u.o.y+u.t*H,u.o.z+u.t*u.t*4);sp.scale.setScalar((u.dust?2:1.8)+u.t*(u.dust?6:13)*u.k);sp.material.opacity=(u.dust?.18:.55)*(1-u.t)*Math.min(1,u.t*5);}
    for(const v of fx.fires)if(Math.random()<.7)FX.spawn(v.x+rf(-.6,.6),v.y,v.z+rf(-.6,.6),rf(-.3,.3),rf(1.2,3),rf(-.3,.3),{life:rf(.6,1.4),size:rf(.16,.36),c0:0xffc070,c1:0x601808,drag:.6,grav:-.4});
    if(fx.sparks.length&&Math.random()<.04){const v=pick(fx.sparks);sparkSound(v.x,v.z,.5);for(let i=0;i<16;i++)FX.spawn(v.x,v.y,v.z,rf(-2.5,2.5),rf(.5,4),rf(-2.5,2.5),{life:rf(.3,.7),size:rf(.05,.1),c0:0xffffff,c1:0xffa040,drag:1.2,grav:9});}});
  return fx;}

/* ---------- interiors ---------- */
// A rectangular room: floor, four walls with optional doorway gaps, ceiling with light panels.
PF.room=(ctx,cx,cz,w,d,h=3.4,o={})=>{const P=ctx.P,g=ctx.g,y0=W.floorY,fm=o.floor||MAT.floor,wm=o.wall||MAT.wall;
  P.add(g,fm,scaleUV(new THREE.PlaneGeometry(w,d),w/3,d/3),cx,y0+.01,cz,-Math.PI/2,0,0);
  if(!o.noCeil){P.add(g,MAT.wallDark,scaleUV(new THREE.PlaneGeometry(w,d),w/3,d/3),cx,y0+h,cz,Math.PI/2,0,0);
    for(let i=-w/2+2;i<w/2-1;i+=4)for(let k=-d/2+2;k<d/2-1;k+=4)P.add(g,o.lightMat||MAT.winCool,RB(1.6,.06,.5,.02,1),cx+i,y0+h-.04,cz+k);}
  const gaps=o.gaps||{};// {n:[offset,width],s:..,e:..,w:..}
  const wallSeg=(ax,az,bx,bz)=>{const L=Math.hypot(bx-ax,bz-az);if(L<.05)return;const mx=(ax+bx)/2,mz=(az+bz)/2,ax_=Math.abs(bx-ax)>=Math.abs(bz-az),ry=ax_?0:Math.PI/2;
    P.add(g,wm,scaleUV(new THREE.BoxGeometry(L,h,.3),L/3,h/3),mx,y0+h/2,mz,0,ry,0);P.add(g,MAT.metal,RB(L,.2,.36,.04,1),mx,y0+.1,mz,0,ry,0);P.add(g,MAT.tealGlow,RB(L,.04,.34,.01,1),mx,y0+h*.72,mz,0,ry,0);
    ctx.plat({x:mx,z:mz,hw:ax_?L/2:.18,hd:ax_?.18:L/2,rot:0,top:y0+h,bot:y0-1});};
  const side=(ax,az,bx,bz,gap)=>{if(!gap){wallSeg(ax,az,bx,bz);return;}const L=Math.hypot(bx-ax,bz-az),ux=(bx-ax)/L,uz=(bz-az)/L,c=L/2+gap[0],hw=gap[1]/2;
    wallSeg(ax,az,ax+ux*(c-hw),az+uz*(c-hw));wallSeg(ax+ux*(c+hw),az+uz*(c+hw),bx,bz);
    const fx=ax+ux*c,fz=az+uz*c,ry=Math.abs(ux)>=Math.abs(uz)?0:Math.PI/2;P.add(g,MAT.metal,RB(gap[1]+.5,.35,.5,.06,1),fx,y0+2.75,fz,0,ry,0);P.add(g,MAT.amberGlow,RB(gap[1],.05,.52,.01,1),fx,y0+2.55,fz,0,ry,0);
    if(h>2.95)P.add(g,wm,new THREE.BoxGeometry(gap[1],h-2.9,.3),fx,y0+2.9+(h-2.9)/2,fz,0,ry,0);};
  const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2;
  side(x0,z0,x1,z0,gaps.n);side(x0,z1,x1,z1,gaps.s);side(x0,z0,x0,z1,gaps.w);side(x1,z0,x1,z1,gaps.e);
};
PF.console=(ctx,x,z,ry,scr=0)=>{const g=grp(ctx,x,FY(x,z),z,ry),P=ctx.P;P.add(g,MAT.hullDark,RB(1.6,1,.7,.12,1),0,.5,0);P.add(g,MAT.metal,RB(1.7,.1,.9,.04,1),0,1.02,.05,-.35,0,0);
  P.add(g,MAT.screens[scr%6],new THREE.PlaneGeometry(1.3,.62),0,1.08,.12,-Math.PI/2+.35+.0,0,0);P.add(g,MAT.screens[(scr+2)%6],new THREE.PlaneGeometry(.9,.55),0,1.62,-.28);P.add(g,MAT.metal,RB(1,.65,.06,.03,1),0,1.62,-.32);
  for(let i=0;i<6;i++)P.add(g,i%2?MAT.amber:MAT.teal,RB(.06,.02,.06,.01,1),-.5+i*.2,1.07,.38);const w=toW(x,z,ry,0,0);ctx.box(w.x,w.z,.8,.4,ry,FY(x,z)+1,FY(x,z)-1);};
PF.lockers=(ctx,x,z,ry,n=3)=>{const g=grp(ctx,x,W.interior?W.floorY:groundY(x,z),z,ry),P=ctx.P;for(let i=0;i<n;i++){const lx=(i-(n-1)/2)*.74;P.add(g,MAT.hull,RB(.7,2.1,.6,.06,1),lx,1.05,0);P.add(g,MAT.metal,RB(.5,.04,.02,.01,1),lx,1.5,.31);P.add(g,MAT.amber,RB(.06,.06,.02,.01,1),lx+.22,1.1,.31);for(let k=0;k<4;k++)P.add(g,MAT.gun,RB(.4,.02,.02,.005,1),lx,1.8+k*.05,.31);}
  ctx.box(x,z,n*.37,.32,ry,g.position.y+2.1);};
PF.bunk=(ctx,x,z,ry)=>{const g=grp(ctx,x,FY(x,z),z,ry),P=ctx.P;for(const yy of[.45,1.55]){P.add(g,MAT.metal,RB(2.1,.12,.95,.04,1),0,yy,0);P.add(g,MAT.fabricTeal,RB(1.95,.16,.85,.07,2),0,yy+.13,0);P.add(g,MAT.fabric,RB(.45,.12,.6,.06,2),-.75,yy+.27,0);}
  for(const sx of[-1,1])for(const sz of[-1,1])P.add(g,MAT.metal,cyl(.04,.04,2,6),sx*1.02,1,sz*.45);ctx.box(x,z,1.05,.5,ry,FY(x,z)+2);};
PF.table=(ctx,x,z,ry,w=1.8,d=.9,o={})=>{const g=grp(ctx,x,W.interior?W.floorY:groundY(x,z),z,ry),P=ctx.P;P.add(g,o.mat||MAT.metalLight,RB(w,.08,d,.03,1),0,.82,0);P.add(g,MAT.metal,cyl(.12,.2,.8,12),0,.4,0);P.add(g,MAT.metal,cyl(.4,.45,.05,18),0,.02,0);
  if(o.holo){const h=new THREE.Mesh(sph(.5,24,12),new THREE.MeshBasicMaterial({color:0x6ff2d6,wireframe:true,transparent:true,opacity:.35}));h.position.y=1.5;g.add(h);ctx.anim(dt=>{h.rotation.y+=dt*.4;});glowAt(ctx,g,0,1.5,0,0x6ff2d6,2.4,.35);}
  if(o.stools)for(let i=0;i<o.stools;i++){const a=i/o.stools*Math.PI*2;P.add(g,MAT.metal,cyl(.04,.06,.5,8),Math.cos(a)*(w*.6+.3),.25,Math.sin(a)*(d*.6+.3));P.add(g,MAT.fabricRed,cyl(.2,.2,.08,14),Math.cos(a)*(w*.6+.3),.52,Math.sin(a)*(d*.6+.3));}
  ctx.col(x,z,Math.max(w,d)*.5);};
PF.bar=(ctx,x,z,ry,len=6)=>{const g=grp(ctx,x,FY(x,z),z,ry),P=ctx.P;P.add(g,MAT.hullDark,RB(len,1.1,.8,.1,2),0,.55,0);P.add(g,MAT.metalLight,RB(len+.2,.08,1,.03,1),0,1.12,0);P.add(g,MAT.amberGlow,RB(len,.04,.04,.01,1),0,.95,.42);
  P.add(g,MAT.hull,RB(len,2.4,.4,.05,1),0,1.2,-1.6);for(let k=0;k<3;k++)P.add(g,MAT.metal,RB(len-.4,.05,.35,.01,1),0,1.0+k*.6,-1.4);
  const r=mulberry(len*13);for(let i=0;i<len*4;i++){const c=[0x6ff2d6,0xffc35a,0xff5ad8,0x8fd8ff][i%4];P.add(g,new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.5,transparent:true,opacity:.8}),cyl(.05,.06,.22+r()*.12,8),-len/2+.4+(i%(len*2))*.47,1.15+Math.floor(i/(len*2))*.6,-1.4);}
  for(let i=0;i<Math.floor(len/1.2);i++){P.add(g,MAT.metal,cyl(.04,.06,.7,8),-len/2+.6+i*1.2,.35,.9);P.add(g,MAT.fabricRed,cyl(.22,.22,.08,14),-len/2+.6+i*1.2,.72,.9);}
  ctx.box(x,z,len/2,.45,ry,FY(x,z)+1.15);};
PF.shelf=(ctx,x,z,ry,w=2.4)=>{const g=grp(ctx,x,W.interior?W.floorY:groundY(x,z),z,ry),P=ctx.P,r=mulberry(Math.round(x*3+z*5));for(let k=0;k<4;k++)P.add(g,MAT.metal,RB(w,.05,.5,.01,1),0,.3+k*.55,0);for(const s of[-1,1])P.add(g,MAT.metal,RB(.05,2.1,.5,.01,1),s*w/2,1.05,0);
  for(let k=0;k<4;k++)for(let i=0;i<5;i++)if(r()<.75)P.add(g,[MAT.crate,MAT.crateBlue,MAT.crateRed,MAT.hullWarm][Math.floor(r()*4)],rbox(.3,.3,.3,.03,1),-w/2+.3+i*(w-.6)/4,.48+k*.55,0);ctx.box(x,z,w/2,.26,ry,(W.interior?W.floorY:groundY(x,z))+2.1);};
PF.medbed=(ctx,x,z,ry)=>{const g=grp(ctx,x,FY(x,z),z,ry),P=ctx.P;P.add(g,MAT.metalLight,RB(2,.6,.9,.08,2),0,.3,0);P.add(g,MAT.fabric,RB(1.9,.12,.8,.05,2),0,.66,0);P.add(g,MAT.glass,cyl(.5,.5,1.9,24,1,true,0,Math.PI),0,.7,0,0,0,Math.PI/2);
  P.add(g,MAT.metal,cyl(.03,.03,1.6,6),1.1,.8,-.4);P.add(g,MAT.screens[4],new THREE.PlaneGeometry(.4,.3),1.1,1.55,-.36);ctx.box(x,z,1,.45,ry,FY(x,z)+.7);};
PF.plant=(ctx,x,z,color=0x52e8c8)=>{const y=W.interior?W.floorY:groundY(x,z);ctx.P.add(ctx.g,MAT.hullDark,cyl(.35,.28,.6,18),x,y+.3,z);const m=new THREE.MeshBasicMaterial({color,map:TEX.cap.map});for(let i=0;i<3;i++){const s=new THREE.Mesh(sph(.28+i*.04,18,8,0,6.3,0,1.57),m);s.scale.y=.6;s.position.set(x+(i-1)*.15,y+.9+i*.2,z+(i%2)*.1);ctx.g.add(s);}ctx.P.add(ctx.g,MAT.bark,cyl(.03,.04,.8,6),x,y+.9,z);ctx.col(x,z,.4);};
PF.window=(ctx,x,y,z,ry,w=4,h=2.2)=>{const g=grp(ctx,x,y,z,ry),P=ctx.P;const m=new THREE.MeshBasicMaterial({map:TEX.space});m.map.offset.x=Math.random();const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);g.add(p);
  P.add(g,MAT.metal,RB(w+.3,.2,.3,.05,1),0,h/2+.1,.05);P.add(g,MAT.metal,RB(w+.3,.2,.3,.05,1),0,-h/2-.1,.05);for(const s of[-1,1])P.add(g,MAT.metal,RB(.2,h+.4,.3,.05,1),s*(w/2+.1),0,.05);P.add(g,MAT.metal,RB(.08,h,.1,.02,1),0,0,.03);};
PF.hallway=(ctx,x,z,ry,len=14)=>{// the corridor model, scaled to a 4.2 m wide passage, tinted to the station palette
  const m=MODELS.hallway;if(!m){PF.room(ctx,x,z,4.2,len,3.4,{gaps:{n:[0,3],s:[0,3]}});return;}
  const o=m.scene.clone(true);o.traverse(c=>{if(c.isMesh){c.material=c.material.clone();const col=c.material.color;if(col){const l=(col.r+col.g+col.b)/3;c.material.color.setRGB(.55+l*.35,.56+l*.35,.62+l*.35);}c.material.metalness=.4;c.material.roughness=.55;c.receiveShadow=true;}});
  const s=len/29.16;o.scale.setScalar(s);o.rotation.y=ry;o.position.set(x,W.floorY,z);ctx.g.add(o);
  const hw=8.47*s/2;for(const sd of[-1,1]){const w=toW(x,z,ry,sd*(hw+.1),0);ctx.box(w.x,w.z,.2,len/2,ry,W.floorY+4,W.floorY-1);}
  ctx.light(x,W.floorY+2.6,z,0x9fd8ff,.8,14);};

/* ---------- flora (instanced per zone) ---------- */
const dummy=new THREE.Object3D();
function scatter(ctx,n,test,place,tries=40){let k=0,t=0;while(k<n&&t<n*tries){t++;const x=rr(-W.half+8,W.half-8),z=rr(-W.half+8,W.half-8);if(nearAny(x,z,W.keepout))continue;const y=groundY(x,z);if(W.water&&y<W.water.y+.2&&!test.water)continue;if(!test(x,z,y))continue;if(place(x,z,y,k)!==false)k++;}return k;}
const FLORA={};
FLORA.mushroom=(ctx,f)=>{const trunkGeo=scaleUV(lathe([[.5,0],[.36,.05],[.27,.15],[.23,.35],[.2,.6],[.22,.82],[.3,.94],[.42,1]],16),2,3);
  const capGeo=sph(1,44,16,0,Math.PI*2,0,Math.PI/2);{const p=capGeo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y<.3){const a=Math.atan2(z,x),k=1-y/.3;p.setY(i,y+Math.sin(a*9)*.07*k-.05*k);const s=1+Math.sin(a*5+1)*.03*k;p.setX(i,x*s);p.setZ(i,z*s);}}capGeo.computeVertexNormals();}
  const gillGeo=scaleUV(cyl(.97,.26,.22,48,1,true),3,1),N=f.count;
  const trunks=new THREE.InstancedMesh(trunkGeo,MAT.bark,N),caps=new THREE.InstancedMesh(capGeo,new THREE.MeshBasicMaterial({color:0xffffff,map:TEX.cap.map}),N),gills=new THREE.InstancedMesh(gillGeo,new THREE.MeshBasicMaterial({color:0xffffff,map:TEX.gill.map,side:THREE.DoubleSide}),N);
  trunks.castShadow=caps.castShadow=true;const pal=f.palette||[0x52e8c8,0x3fc9e6,0xd36cf0,0x8f7cff,0x6ff2d6];
  const n=scatter(ctx,N,f.where,(x,z,y,k)=>{const hgt=rr(3,7.5)*(f.scale||1),sz=rr(1.4,2.8)*(f.scale||1);
    dummy.position.set(x,y-.2,z);dummy.rotation.set(rr(-.08,.08),rr(0,6.3),rr(-.08,.08));dummy.scale.set(1+sz*.25,hgt,1+sz*.25);dummy.updateMatrix();trunks.setMatrixAt(k,dummy.matrix);
    dummy.position.set(x,y-.3+hgt,z);dummy.scale.set(sz,sz*.45,sz);dummy.updateMatrix();caps.setMatrixAt(k,dummy.matrix);dummy.position.y-=.02;dummy.scale.set(sz*.98,1,sz*.98);dummy.updateMatrix();gills.setMatrixAt(k,dummy.matrix);
    const col=new THREE.Color(pick(pal,rng));caps.setColorAt(k,col.clone().multiplyScalar(.95));gills.setColorAt(k,col.clone().multiplyScalar(.55));trunks.setColorAt(k,new THREE.Color().setHSL(rr(.74,.84),rr(.1,.25),rr(.65,.85)));
    if(k%2===0)glowAt(ctx,null,x,y+hgt-.6,z,col.getHex(),sz*3.4,.35);addCol(x,z,.55+sz*.12);});
  trunks.count=caps.count=gills.count=n;ctx.g.add(trunks,caps,gills);};
FLORA.crystal=(ctx,f)=>{if(crystalField(ctx,f))return;const N=f.count;const m=new THREE.InstancedMesh(crystalGeo(1,1),std(TEX.crystal,{color:0xffffff,emissive:f.emissive||0x5a3ad0,emissiveIntensity:.7,roughness:.15,metalness:.3,flatShading:true}),N);m.castShadow=true;let k=0;
  scatter(ctx,Math.ceil(N/3),f.where,(x,z,y)=>{const n=2+Math.floor(rng()*4),base=rr(.5,1.4)*(f.scale||1),hue=f.hue?rr(f.hue[0],f.hue[1]):rr(.7,.8);
    for(let c=0;c<n&&k<N;c++){const s=base*(c?rr(.35,.75):1),hh=rr(1.8,4.4)*s,ox=c?rr(-.8,.8)*base:0,oz=c?rr(-.8,.8)*base:0;dummy.position.set(x+ox,groundY(x+ox,z+oz)-.15,z+oz);dummy.rotation.set(rr(-.4,.4),rr(0,6.3),rr(-.4,.4));dummy.scale.set(s*.5,hh,s*.5);dummy.updateMatrix();m.setMatrixAt(k,dummy.matrix);m.setColorAt(k,new THREE.Color().setHSL(hue,.55,rr(.6,.8)));k++;}
    if(base>.8)addCol(x,z,base*.7);});m.count=k;ctx.g.add(m);};
FLORA.rock=(ctx,f)=>{if(rockField(ctx,f))return;const mat=f.mat?MAT[f.mat]:MAT.rock;const rocks=[0,1,2].map(i=>{const m=new THREE.InstancedMesh(rockGeo(isTouch?2:3,i*17.3+2+(f.seed||0)),mat,Math.ceil(f.count/3));m.castShadow=true;m.receiveShadow=true;m.userData.n=0;ctx.g.add(m);return m;});let n=0;
  scatter(ctx,f.count,f.where,(x,z,y)=>{const R=rocks[n%3];if(R.userData.n>=R.count)return false;const s=rr(.4,2.4)*(f.scale||1);dummy.position.set(x,y+s*.15,z);dummy.rotation.set(rr(-.3,.3),rr(0,6.3),rr(-.3,.3));dummy.scale.set(s*rr(.8,1.4),s*rr(.55,.95),s*rr(.8,1.3));dummy.updateMatrix();R.setMatrixAt(R.userData.n,dummy.matrix);
    const hs=f.hsl||[.75,.92,.12,.25,.62,.82];R.setColorAt(R.userData.n,new THREE.Color().setHSL(rr(hs[0],hs[1]),rr(hs[2],hs[3]),rr(hs[4],hs[5])));R.userData.n++;if(s>1)addCol(x,z,s*.85);n++;});
  rocks.forEach(R=>R.count=R.userData.n);};
FLORA.reeds=(ctx,f)=>{const N=isTouch?Math.round(f.count*.6):f.count,m=new THREE.InstancedMesh(new THREE.ConeGeometry(.06,1,5).translate(0,.5,0),new THREE.MeshLambertMaterial({color:0xffffff}),N);let k=0;
  scatter(ctx,N,f.where,(x,z,y)=>{dummy.position.set(x,y-.05,z);dummy.rotation.set(rr(-.25,.25),0,rr(-.25,.25));const s=rr(.5,1.6)*(f.scale||1);dummy.scale.set(s,s*rr(.7,1.5),s);dummy.updateMatrix();m.setMatrixAt(k,dummy.matrix);
    const h=f.hsl||[.78,.9,.3,.6,.3,.5];m.setColorAt(k,new THREE.Color().setHSL(rng()<.15&&f.accent?f.accent:rr(h[0],h[1]),rr(h[2],h[3]),rr(h[4],h[5])));k++;},8);m.count=k;ctx.g.add(m);};
FLORA.spinepod=(ctx,f)=>{// dayward succulents: segmented, ribbed, with glowing tips
  const geo=lathe([[0,0],[.42,.05],[.55,.3],[.5,.7],[.38,1.0],[.2,1.2],[0,1.25]],12),N=f.count;const m=new THREE.InstancedMesh(geo,std(TEX.bark,{color:0xffffff,roughness:.8}),N*2),tips=new THREE.InstancedMesh(sph(.08,8,6),new THREE.MeshBasicMaterial({color:0xffc35a}),N*2);m.castShadow=true;let k=0;
  scatter(ctx,N,f.where,(x,z,y)=>{const n=1+Math.floor(rng()*2);for(let c=0;c<n&&k<N*2;c++){const s=rr(.8,2.2),ox=c?rr(-.9,.9):0,oz=c?rr(-.9,.9):0;dummy.position.set(x+ox,groundY(x+ox,z+oz)-.05,z+oz);dummy.rotation.set(rr(-.15,.15),rr(0,6),rr(-.15,.15));dummy.scale.set(s*.7,s*1.3,s*.7);dummy.updateMatrix();m.setMatrixAt(k,dummy.matrix);
    m.setColorAt(k,new THREE.Color().setHSL(rr(.05,.12),rr(.3,.5),rr(.45,.6)));dummy.position.y+=s*1.62;dummy.scale.setScalar(s);dummy.updateMatrix();tips.setMatrixAt(k,dummy.matrix);k++;}addCol(x,z,.8);});m.count=tips.count=k;ctx.g.add(m,tips);};
FLORA.iceSpire=(ctx,f)=>{const N=f.count,m=new THREE.InstancedMesh(crystalGeo(1,1,.3,5),MAT.ice,N);m.castShadow=true;let k=0;
  scatter(ctx,N,f.where,(x,z,y)=>{const s=rr(.6,2.2),h=rr(2,7)*s;dummy.position.set(x,y-.3,z);dummy.rotation.set(rr(-.2,.2),rr(0,6),rr(-.2,.2));dummy.scale.set(s*.6,h,s*.6);dummy.updateMatrix();m.setMatrixAt(k++,dummy.matrix);if(s>1)addCol(x,z,s*.6);});m.count=k;ctx.g.add(m);};
FLORA.deadTree=(ctx,f)=>{// bare, twisted trees: trunk + three bent limbs merged per instance type
  const P=new Parts(),tmp=new THREE.Group();const geoParts=[];const trunk=lathe([[.35,0],[.28,.3],[.2,1.6],[.16,3],[.1,4.2],[0,4.4]],8);
  const N=f.count,m1=new THREE.InstancedMesh(trunk,std(TEX.bark,{color:f.color||0x8a8090}),N),limb=cyl(.05,.12,2,6).translate(0,1,0),m2=new THREE.InstancedMesh(limb,m1.material,N*3);m1.castShadow=m2.castShadow=true;let k=0,j=0;
  scatter(ctx,N,f.where,(x,z,y)=>{const s=rr(.7,1.4);dummy.position.set(x,y-.1,z);dummy.rotation.set(rr(-.1,.1),rr(0,6),rr(-.1,.1));dummy.scale.setScalar(s);dummy.updateMatrix();m1.setMatrixAt(k,dummy.matrix);
    for(let b=0;b<3;b++){const a=rr(0,6.28),hh=rr(1.8,3.6)*s;dummy.position.set(x,y+hh,z);dummy.rotation.set(rr(.6,1.1)*Math.cos(a),a,rr(.6,1.1)*Math.sin(a));dummy.scale.set(s,s*rr(.7,1.3),s);dummy.updateMatrix();m2.setMatrixAt(j++,dummy.matrix);}k++;addCol(x,z,.5);});m1.count=k;m2.count=j;ctx.g.add(m1,m2);};
FLORA.fern=(ctx,f)=>{// Calder fern-palms: curved trunk with a crown of broad fronds
  const trunk=lathe([[.4,0],[.3,.4],[.24,2],[.2,4],[.24,4.6],[0,4.7]],10),frond=new THREE.PlaneGeometry(1.1,3.6,1,6).translate(0,1.8,0);{const p=frond.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);p.setZ(i,-Math.pow(y/3.6,2)*1.4);}frond.computeVertexNormals();}
  const N=f.count,tm=new THREE.InstancedMesh(trunk,std(TEX.bark,{color:0xb8a890}),N),fm=new THREE.InstancedMesh(frond,new THREE.MeshStandardMaterial({color:0xffffff,map:TEX.leaf.map,side:THREE.DoubleSide,roughness:.8,alphaTest:.1}),N*7);tm.castShadow=fm.castShadow=true;let k=0,j=0;
  scatter(ctx,N,f.where,(x,z,y)=>{const s=rr(.8,1.6);dummy.position.set(x,y-.1,z);dummy.rotation.set(rr(-.12,.12),rr(0,6),rr(-.12,.12));dummy.scale.setScalar(s);dummy.updateMatrix();tm.setMatrixAt(k,dummy.matrix);const top=new THREE.Vector3(0,4.6,0).applyMatrix4(dummy.matrix);
    const col=new THREE.Color().setHSL(rr(f.hue?f.hue[0]:.3,f.hue?f.hue[1]:.42),rr(.4,.6),rr(.32,.45));for(let b=0;b<7;b++){const a=b/7*6.28+rr(-.2,.2);dummy.position.copy(top);dummy.rotation.set(0,a,0);dummy.rotateX(rr(.9,1.4));dummy.scale.setScalar(s*rr(.8,1.1));dummy.updateMatrix();fm.setMatrixAt(j,dummy.matrix);fm.setColorAt(j,col);j++;}
    k++;addCol(x,z,.45*s);});tm.count=k;fm.count=j;ctx.g.add(tm,fm);};
FLORA.lily=(ctx,f)=>{if(!W.water)return;const N=f.count,m=new THREE.InstancedMesh(new THREE.CircleGeometry(1,20,.3,5.9).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0xffffff,map:TEX.leaf.map,roughness:.6}),N),fl=new THREE.InstancedMesh(sph(.15,10,8),new THREE.MeshBasicMaterial({color:0xffffff}),N);let k=0;
  scatter(ctx,N,Object.assign((x,z,y)=>y<W.water.y-.3&&y>W.water.y-4,{water:true}),(x,z,y)=>{const s=rr(.4,1.3);dummy.position.set(x,W.water.y+.03,z);dummy.rotation.set(0,rr(0,6),0);dummy.scale.setScalar(s);dummy.updateMatrix();m.setMatrixAt(k,dummy.matrix);m.setColorAt(k,new THREE.Color().setHSL(rr(.3,.4),.5,rr(.3,.42)));
    dummy.position.y+=.1;dummy.scale.setScalar(rng()<.3?1:0.001);dummy.updateMatrix();fl.setMatrixAt(k,dummy.matrix);fl.setColorAt(k,new THREE.Color(pick([0xff8ad8,0xfff07a,0x8fd8ff],rng)));k++;});m.count=fl.count=k;ctx.g.add(m,fl);};
FLORA.basalt=(ctx,f)=>{const N=f.count,m=new THREE.InstancedMesh(lathe([[1,0],[1,1],[.92,1.02],[0,1.04]],6),MAT.basalt,N);m.castShadow=true;m.receiveShadow=true;let k=0;
  scatter(ctx,Math.ceil(N/5),f.where,(x,z,y)=>{const n=3+Math.floor(rng()*5);for(let c=0;c<n&&k<N;c++){const ox=rr(-2,2),oz=rr(-2,2),s=rr(.4,.9),h=rr(.6,4.5);dummy.position.set(x+ox,groundY(x+ox,z+oz)-.2,z+oz);dummy.rotation.set(0,rr(0,1),0);dummy.scale.set(s,h,s);dummy.updateMatrix();m.setMatrixAt(k++,dummy.matrix);}addCol(x,z,2);});m.count=k;ctx.g.add(m);};

/* ---------- sky bodies: gas giants, moons, distant stations ---------- */
const BODIES={list:[],group:new THREE.Group(),
  set(specs){scene.remove(this.group);this.group=new THREE.Group();scene.add(this.group);this.list=[];
    for(const b of specs){const g=new THREE.Group();let mesh;
      if(b.type==='giant'){mesh=new THREE.Mesh(new THREE.SphereGeometry(b.r||70,64,40),new THREE.MeshLambertMaterial({map:TEX.giant,color:b.color||0xffffff,fog:false}));g.add(mesh);
        if(b.ring!==false){const ring=new THREE.Mesh(new THREE.RingGeometry((b.r||70)*1.3,(b.r||70)*1.97,128,2),new THREE.MeshBasicMaterial({map:TEX.ring,color:b.ringColor||0xffffff,transparent:true,side:THREE.DoubleSide,fog:false,depthWrite:false}));ring.rotation.x=-1.25;ring.rotation.y=.3;g.add(ring);}g.rotation.z=b.tilt||.35;}
      else if(b.type==='moon'){mesh=new THREE.Mesh(new THREE.SphereGeometry(b.r||20,40,24),new THREE.MeshLambertMaterial({map:TEX.rock.map,color:b.color||0xb0a8c0,fog:false}));g.add(mesh);}
      else if(b.type==='station'){mesh=new THREE.Group();const m=new THREE.MeshBasicMaterial({color:0xd8d4e0,fog:false});mesh.add(new THREE.Mesh(new THREE.TorusGeometry(b.r||8,(b.r||8)*.12,8,48),m));mesh.add(new THREE.Mesh(new THREE.CylinderGeometry((b.r||8)*.18,(b.r||8)*.18,(b.r||8)*2.4,12),m));const gl=glowSprite(0xffffff,(b.r||8)*3,.5);mesh.add(gl);g.add(mesh);g.rotation.set(.8,.3,.4);}
      this.group.add(g);this.list.push({g,mesh,b});}},
  update(t){for(const o of this.list){const d=o.b.dir;o.g.position.set(camera.position.x+d[0],camera.position.y+d[1],camera.position.z+d[2]);if(o.mesh&&o.b.type!=='station')o.mesh.rotation.y=t*.004;else if(o.mesh)o.mesh.rotation.z=t*.05;}}};

// ===== 21c_crash.js =====
/* ================= THE VESPER'S CRASH SITE: the wreck itself ================= */
// The crashed Vesper ploughed in from behind: its tail section tore away and lies rolled over in the furrow, the hull is holed,
// soot-streaked and heat-tinted, the starboard flank is ripped open (the way in), hull plating and rock are strewn along the
// track, fires burn in the torn ends and smoke climbs off it. A hurt skitter that was sheltering in the wreck bolts as you come.
const CTEX={};
function crashTex(kind){if(CTEX[kind])return CTEX[kind];const c=mkCanvas(256),g=c.getContext('2d');g.clearRect(0,0,256,256);
  if(kind==='soot'){// a smoke stain climbing up from a hole: dense at the bottom, feathering out above
    for(let i=0;i<70;i++){const t=Math.random(),y=230-t*215,x=128+(Math.random()-.5)*(30+t*150),r=10+t*40;const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(10,8,8,${.16*(1-t*.6)})`);gr.addColorStop(1,'rgba(10,8,8,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}}
  else if(kind==='tear'){// a hole punched through: jagged black, with bright torn lips and a burned ring
    const pts=[];for(let i=0;i<22;i++){const a=i/22*Math.PI*2,r=46+Math.random()*26*(i%2?1:.45);pts.push([128+Math.cos(a)*r,128+Math.sin(a)*r]);}
    const br=g.createRadialGradient(128,128,40,128,128,124);br.addColorStop(0,'rgba(20,14,10,.95)');br.addColorStop(.5,'rgba(40,26,18,.55)');br.addColorStop(1,'rgba(30,20,15,0)');g.fillStyle=br;g.fillRect(0,0,256,256);
    g.fillStyle='#030202';g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fill();
    g.strokeStyle='rgba(190,185,180,.85)';g.lineWidth=3;g.stroke();g.strokeStyle='rgba(90,70,60,.8)';g.lineWidth=7;g.globalCompositeOperation='destination-over';g.stroke();g.globalCompositeOperation='source-over';}
  else if(kind==='heat'){// scorching: irregular overlapping smudges of soot and burned bronze, never a clean circle
    for(let i=0;i<34;i++){const x=128+(Math.random()-.5)*150,y=128+(Math.random()-.5)*150,r=14+Math.random()*44,d=Math.hypot(x-128,y-128)/128;const a=.22*(1-d);if(a<=0)continue;
      const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,Math.random()<.3?`rgba(70,46,26,${a})`:`rgba(12,9,8,${a*1.3})`);gr.addColorStop(1,'rgba(12,9,8,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}}
  const t=new THREE.CanvasTexture(c);return CTEX[kind]=t;}
// jagged plates torn outward around an opening: a ring of shards in the plane (t1,t2) about centre p, bent out along n
function crashPetals(parent,p,t1,t2,n,rx,ry,count,mat,bend=[.4,1.1]){const grp2=new THREE.Group();grp2.position.copy(p);grp2.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t1,t2,n));parent.add(grp2);
  for(let i=0;i<count;i++){const a=i/count*Math.PI*2+rf(-.15,.15),len=rf(.5,1.4),w=rf(.35,.8),s=new THREE.Shape();s.moveTo(0,-w/2);s.lineTo(len*rf(.4,.7),-w*rf(.1,.4));s.lineTo(len,rf(-.15,.15));s.lineTo(len*rf(.3,.6),w*rf(.1,.4));s.lineTo(0,w/2);s.lineTo(0,-w/2);
    const r=new THREE.Group();r.rotation.z=Math.atan2(Math.sin(a)*ry,Math.cos(a)*rx);r.position.set(Math.cos(a)*rx,Math.sin(a)*ry,0);grp2.add(r);const b=new THREE.Group();b.rotation.y=-rf(bend[0],bend[1]);r.add(b);
    const m=new THREE.Mesh(new THREE.ShapeGeometry(s),mat);m.castShadow=true;b.add(m);}
  return grp2;}
function crashTube(parent,pts,r,mat){const m=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),16,r,5),mat);parent.add(m);return m;}
// a torn end of the fuselage, seen from outside: a burned-out bulkhead set back inside, pipes and cables hanging out of it,
// and the plating around the edge peeled back. dir: +1 for the end of the ship facing aft, -1 for the tail piece facing forward
function crashTornEnd(parent,W2,H2,zc,dir,M){const V=vdMats(),cy=H2*.46,cap=new THREE.Mesh(new THREE.PlaneGeometry(W2*.58,H2*.56),V.burnt);cap.position.set(0,cy,zc+dir*.9);cap.rotation.y=dir>0?Math.PI:0;parent.add(cap);
  const inner=new THREE.Mesh(new THREE.PlaneGeometry(W2*.3,H2*.3),V.void);inner.position.set(rf(-1,1),cy+rf(-1,1),zc+dir*.85);inner.rotation.y=cap.rotation.y;parent.add(inner);
  for(let i=0;i<7;i++){const x=rf(-W2*.25,W2*.25),y=cy+rf(-H2*.22,H2*.22),l=rf(1,2.6),p=new THREE.Mesh(cyl(rf(.08,.22),rf(.08,.22),l,8),i%3?V.under:MAT.metal);p.rotation.x=Math.PI/2+rf(-.4,.4);p.rotation.z=rf(-.3,.3);p.position.set(x,y,zc+dir*(.9-l/2));parent.add(p);}
  for(let i=0;i<6;i++){const x=rf(-W2*.25,W2*.25),y=cy+rf(0,H2*.2),pts=[];for(let k=0;k<=6;k++){const u=k/6;pts.push(new THREE.Vector3(x+rf(-.1,.1),y-u*u*rf(2,4),zc+dir*(.8-u*rf(1.5,2.5))));}crashTube(parent,pts,rf(.03,.06),[V.rubber,V.wireR,V.wireY][i%3]);}
  const t1=new THREE.Vector3(1,0,0),t2=new THREE.Vector3(0,1,0),n=new THREE.Vector3(0,0,-dir);crashPetals(parent,new THREE.Vector3(0,cy,zc),t1,t2,n,W2*.36,H2*.4,18,M,[.2,.8]);}
function crashDress(ctx,S){const {g,body,fit,meshes,W2,H2,L,x,z,th,fx}=S,P=ctx.P,Wp=(lx,lz)=>toW(x,z,th,lx,lz),V=vdMats();renderer.localClippingEnabled=true;g.updateMatrixWorld(true);
  const ZC=-L/2+5.4,hullMesh=meshes.find(q=>/Hull/.test(q.name))||meshes[0],hullMat=hullMesh.material.clone();hullMat.side=THREE.DoubleSide;
  const debrisM=new THREE.MeshStandardMaterial({color:0x7a7e86,roughness:.45,metalness:.35,side:THREE.DoubleSide,envMap:SABRE_ENV,envMapIntensity:1.2}),plateM=new THREE.MeshStandardMaterial({color:0x4a4d55,roughness:.6,metalness:.55,side:THREE.DoubleSide}),burntPlate=new THREE.MeshStandardMaterial({color:0x4a423e,roughness:.85,metalness:.25,side:THREE.DoubleSide,envMap:SABRE_ENV,envMapIntensity:.6}),rockM=new THREE.MeshStandardMaterial({color:0x7a625c,roughness:.95,flatShading:true}),clodM=new THREE.MeshStandardMaterial({color:0x58423e,roughness:1,flatShading:true});
  /* the tail section is gone: the hull is cut off at ZC (everything aft of it is clipped away) */
  const keep=new THREE.Plane(new THREE.Vector3(0,0,1),-ZC).applyMatrix4(body.matrixWorld);for(const q of meshes){q.material.clippingPlanes=[keep];q.material.clipShadows=true;q.material.side=THREE.DoubleSide;}
  crashTornEnd(body,W2,H2,ZC,1,plateM);
  /* ...and lies rolled onto its side in the furrow behind, half buried */
  {const tail=new THREE.Group(),tb=new THREE.Group(),f2=fit.clone(true),tm=[];ctx.g.add(tail);tail.add(tb);tb.add(f2);
    f2.traverse(q=>{if(q.isMesh){q.material=q.material.clone();q.material.color.lerp(new THREE.Color(0x2a2420),.3);q.castShadow=q.receiveShadow=true;tm.push(q);}});
    const pc=new THREE.Vector3(0,H2*.42,(ZC-L/2)/2);tb.position.copy(pc).negate();const at=Wp(6,-L/2-13);tail.rotation.order='YXZ';tail.rotation.set(.3,th+2.3,1.15);tail.position.set(at.x,groundY(at.x,at.z)+2.2,at.z);tail.updateMatrixWorld(true);
    const kt=new THREE.Plane(new THREE.Vector3(0,0,-1),ZC).applyMatrix4(tb.matrixWorld);for(const q of tm){q.material.clippingPlanes=[kt];q.material.clipShadows=true;q.material.side=THREE.DoubleSide;}
    crashTornEnd(tb,W2,H2,ZC,-1,plateM);addCol(at.x,at.z,5.5);const b2=Wp(6,-L/2-9);addCol(b2.x,b2.z,4);
    const fp=new THREE.Vector3(0,H2*.5,ZC-1).applyMatrix4(tb.matrixWorld);fx.fires.push(fp);fx.smoke.push(fp.clone());fx.sparks.push(new THREE.Vector3(rf(-2,2),H2*.4,ZC-.5).applyMatrix4(tb.matrixWorld));
    // a gouge of torn ground where it came to rest
    for(let i=0;i<10;i++){const q=Wp(6+rf(-6,6),-L/2-13+rf(-7,7)),s2=rf(.8,2.2);P.add(ctx.g,i%3?rockM:clodM,rockGeo(1,i*5.1+2),q.x,groundY(q.x,q.z)+s2*.1,q.z,rr(0,3),rr(0,3),rr(0,3),s2*1.3,s2*.6,s2);}}
  {const e=new THREE.Vector3(0,H2*.5,ZC+1).applyMatrix4(body.matrixWorld),e2=new THREE.Vector3(-W2*.15,H2*.3,ZC+1.2).applyMatrix4(body.matrixWorld);fx.fires.push(e,e2);fx.smoke.push(e.clone());fx.sparks.push(new THREE.Vector3(W2*.2,H2*.55,ZC+.5).applyMatrix4(body.matrixWorld));
    ctx.light(e.x,e.y+1.5,e.z,0xff7a2a,1.3,20,true);}
  /* hits on the hull: raycast from outside to find the surface (nothing aft of the tear) */
  const rc=new THREE.Raycaster(),hitAt=(lx,ly,lz,dx,dy,dz)=>{const org=new THREE.Vector3(lx,ly,lz).applyMatrix4(body.matrixWorld),dir=new THREE.Vector3(dx,dy,dz).transformDirection(body.matrixWorld).normalize();rc.set(org,dir);
      const h=rc.intersectObjects(meshes,false).find(h=>body.worldToLocal(h.point.clone()).z>ZC+.4);if(!h)return null;const n=h.face.normal.clone().transformDirection(h.object.matrixWorld);if(n.dot(dir)>0)n.negate();return {p:h.point,n};};
  const decalOn=(h,tex,w,hh,o={})=>{const mt=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,opacity:o.op||1,clippingPlanes:[keep]});
    const d=new THREE.Mesh(new THREE.PlaneGeometry(w,hh),mt);d.position.copy(h.p).addScaledVector(h.n,.05);d.lookAt(h.p.clone().add(h.n));if(o.rot!==undefined)d.rotateZ(o.rot);else if(!o.up)d.rotateZ(rr(0,6.28));
    if(o.up){d.translateY(hh*.38);}ctx.g.add(d);return d;};
  const top=H2+3;
  // soot and heat across the top and flanks
  for(let i=0;i<18;i++){const h=hitAt(rr(-W2/2,W2/2),top,rr(ZC+1,L/2),0,-1,0);if(h)decalOn(h,crashTex('heat'),rr(2.5,5.5),rr(2.5,5.5),{op:.9});}
  for(let i=0;i<14;i++){const sg=i%2?1:-1,h=hitAt(sg*W2,rr(H2*.15,H2*.75),rr(ZC+1,L/2-2),-sg,0,0);if(h)decalOn(h,crashTex('soot'),rr(1.6,3.2),rr(3,6),{up:true});}
  // a line of cannon hits stitched along the port side and over the top, each with a soot trail above it
  for(let i=0;i<7;i++){const h=i<4?hitAt(-W2,H2*(.35+i*.08),6-i*3.2,1,0,0):hitAt(-2.5+i*.7,top,9-i*2.6,0,-1,0);if(!h)continue;const s2=rr(.7,1.15);decalOn(h,crashTex('tear'),s2,s2);decalOn(h,crashTex('soot'),s2*1.6,s2*3.4,{up:true});if(i%3===0)fx.sparks.push(h.p.clone());if(i===2)fx.smoke.push(h.p.clone());}
  /* the way in: the starboard flank ripped open, plates bent outward, cables spilling out of it */
  {let best=null;for(let ly=.6;ly<H2*.8;ly+=.3)for(const lz of[-3,-2,-1]){const h=hitAt(W2,ly,lz,-1,0,0);if(!h||Math.abs(h.n.y)>.38)continue;const o2=h.p.clone().addScaledVector(h.n,1.2),d=Math.abs(h.p.y-groundY(o2.x,o2.z)-1.3);if(!best||d<best.d)best={h,d};}
    if(best){const h=best.h,n=h.n,up=new THREE.Vector3(0,1,0),t1=new THREE.Vector3().crossVectors(up,n).normalize(),t2=new THREE.Vector3().crossVectors(n,t1).normalize();
      decalOn(h,crashTex('heat'),6,5,{rot:0,op:.85});decalOn(h,crashTex('soot'),4,7,{up:true});
      const hole=new THREE.Mesh(new THREE.CircleGeometry(1,20),V.void);hole.scale.set(1.35,1.15,1);hole.position.copy(h.p).addScaledVector(n,.03);hole.lookAt(h.p.clone().add(n));ctx.g.add(hole);
      crashPetals(ctx.g,h.p.clone().addScaledVector(n,.02),t1,t2,n,1.25,1.05,13,plateM,[.5,1.3]);
      for(let i=0;i<4;i++){const s0=h.p.clone().addScaledVector(t1,rf(-.8,.8)).addScaledVector(t2,rf(.1,.8)).addScaledVector(n,-.2),pts=[];for(let k=0;k<=6;k++){const u=k/6;pts.push(s0.clone().addScaledVector(n,u*rf(.8,1.4)).addScaledVector(up,-u*u*rf(.8,1.6)));}crashTube(ctx.g,pts,rf(.025,.05),[V.rubber,V.wireR,V.wireY,V.rubber][i]);}
      ctx.light(h.p.x-n.x*2,h.p.y+.4,h.p.z-n.z*2,0xff4a2a,.8,8,2);fx.sparks.push(h.p.clone().addScaledVector(t2,.6));fx.smoke.push(h.p.clone().addScaledVector(t2,1.2));
      const out=new THREE.Vector3(n.x,0,n.z).normalize();W.vesperBreach={p:h.p.toArray(),n:n.toArray()};fx.breach=h.p.clone();fx.breachOut=out;
      fx.hatch={x:h.p.x+out.x*2.6,z:h.p.z+out.z*2.6,face:Math.atan2(out.x,out.z)};}
    else{const q=Wp(W2*.5+3,-2);fx.hatch={x:q.x,z:q.z,face:th+Math.PI/2};}
    W.vesperRamp={x:fx.hatch.x,z:fx.hatch.z,face:fx.hatch.face};}
  /* along the furrow: torn hull plating (some still burning), and rock and spoil thrown up at the sides and around the nose */
  for(let i=0;i<24;i++){const u=rr(-L/2-55,L/2+4),side=Math.random()<.5?-1:1,v=side*rr(W2*.6,W2*.6+12),q=Wp(v,u);if(Math.abs(u+L/2+13)<8&&Math.abs(v-6)<8)continue;
    const r=rr(1.5,4),geo=new THREE.CylinderGeometry(r,r,rr(.8,2.4),10,1,true,rr(0,6),rr(.35,.8));const m=new THREE.Mesh(geo,i%3?debrisM:burntPlate);m.castShadow=m.receiveShadow=true;
    m.position.set(q.x,groundY(q.x,q.z)-r*.75,q.z);m.rotation.set(rr(-.5,.5),rr(0,6),rr(-.4,.4)+Math.PI/2*(i%2));m.updateMatrix();
    // sit it so its lowest edge is a little under the ground
    const bb=new THREE.Box3().setFromObject(m);m.position.y+=groundY(q.x,q.z)-.12-bb.min.y;ctx.g.add(m);if(i%6===0)fx.fires.push(new THREE.Vector3(q.x,groundY(q.x,q.z)+.4,q.z));}
  for(let i=0;i<22;i++){const nose=i<7,a=rr(-1.2,1.2),u=nose?L/2+rr(3,10):rr(-L/2-50,L/2),v=nose?Math.sin(a)*rr(5,12):(Math.random()<.5?-1:1)*rr(W2*.55+3,W2*.55+7),q=Wp(v,u),s2=nose?rr(.6,1.6):rr(.4,1.4);
    P.add(ctx.g,i%3?rockM:clodM,rockGeo(1,i*3.7+1),q.x,groundY(q.x,q.z)+s2*.12,q.z,rr(0,3),rr(0,3),rr(0,3),s2*1.3,s2*.6,s2);}
  for(let i=0;i<10;i++){const q=Wp(rr(-1,1)*W2*.4,-L/2-rr(4,70)),d=new THREE.Mesh(new THREE.PlaneGeometry(rr(5,8),rr(6,9)),new THREE.MeshBasicMaterial({map:dmgTex('scorch'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,opacity:.8}));d.rotation.set(-Math.PI/2,0,th+rr(-.3,.3));d.position.set(q.x,groundY(q.x,q.z)+.07,q.z);ctx.g.add(d);}
  // dust and smoke off the nose where it buried itself
  {const q=Wp(0,L/2+2);fx.dust=[new THREE.Vector3(q.x,groundY(q.x,q.z)+1.5,q.z)];}
  crashSkitter(ctx,fx);}
// The skitter: it was hiding in the wreck, it's hurt, and it wants nothing to do with you. Once, the first time you come near.
function crashSkitter(ctx,fx){if(G.flags.skitterFled||!fx.breach||!MODELS.alien)return;let run=null;const st={x:0,z:0,phase:0,frozen:0},drops=[];
  const bloodM=new THREE.MeshBasicMaterial({color:0x3ad6a0,transparent:true,opacity:.75,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3});
  ctx.anim(dt=>{if(G.flags.skitterFled&&!run)return;
    if(!run){if(INTRO.on||UI.custom||UI.loading)return;const d=Math.hypot(player.x-fx.hatch.x,player.z-fx.hatch.z);if(d>15)return;
      G.flags.skitterFled=true;const m=makeSkitter(false,0x8a7a90);const o=fx.breachOut,p0=fx.breach;st.x=p0.x+o.x*1.2;st.z=p0.z+o.z*1.2;
      // away from you, and away from the hull
      let ax=st.x-player.x,az=st.z-player.z;const al=Math.hypot(ax,az)||1;ax=ax/al+o.x*1.2;az=az/al+o.z*1.2;const l2=Math.hypot(ax,az);
      run={m,dx:ax/l2,dz:az/l2,t:0,dropT:0};m.g.position.set(st.x,groundY(st.x,st.z),st.z);ctx.g.add(m.g);
      noise(.5,.09,1700,'bandpass');setTimeout(()=>noise(.35,.06,2300,'bandpass'),180);
      setTimeout(()=>{if(!UI.dialog)vesta('Something was sheltering in the wreck. It\'s hurt, and it\'s scared of you. Let it go.');},1600);}
    const r=run;r.t+=dt;const limp=.55+.45*Math.max(0,Math.sin(r.t*7.5)),sp=(r.t<.4?2:6.2)*limp;
    // veer a little as it scrambles off
    const a=Math.sin(r.t*1.3)*.25,dx=r.dx*Math.cos(a)-r.dz*Math.sin(a),dz=r.dx*Math.sin(a)+r.dz*Math.cos(a);st.x+=dx*sp*dt;st.z+=dz*sp*dt;st.phase+=dt*sp*1.4;
    const gy=groundY(st.x,st.z);r.m.g.position.set(st.x,gy,st.z);r.m.g.rotation.set(0,Math.atan2(dx,dz),Math.sin(r.t*7.5)*.12);
    if(r.m.alien)r.m.alien.update(st,dt,sp);
    r.dropT-=dt;if(r.dropT<=0){r.dropT=rf(.18,.4);const d=new THREE.Mesh(new THREE.CircleGeometry(rf(.06,.16),8),bloodM);d.rotation.x=-Math.PI/2;d.position.set(st.x+rf(-.2,.2),gy+.03,st.z+rf(-.2,.2));ctx.g.add(d);drops.push(d);}
    if(r.t>9){r.m.g.parent&&r.m.g.parent.remove(r.m.g);run=null;}});}

// ===== 22_zonekit.js =====
/* ================= ZONE KIT: helpers zone files use to populate a region ================= */
const LOGS={};   // id → {title,text,zone}
const GLYPHS={}; // id → {zone}
function zoneLvl(){const d=W.def;return d&&d.lvl?Math.round(lerp(d.lvl[0],d.lvl[1],.5)):1;}
function kit(ctx){const st=zoneState(ctx.def.id);
  ctx.npc=(id,x,z,face,beh)=>spawnNPC(id,x,z,{face,beh});
  ctx.safe=(x,z,r)=>{(W.safe=W.safe||[]).push({x,z,r});ctx.keep(x,z,r);};
  ctx.enemies=(type,x,z,r,n,lvl,o={})=>spawnGroup(type,x,z,r,n,lvl||zoneLvl(),o);
  ctx.boss=(type,id,x,z,lvl,o={})=>{(W.bossIds=W.bossIds||[]).push(id);if(st.killed[id])return null;return spawnEnemy(type,x,z,lvl,Object.assign({id},o));};
  ctx.chest=(id,x,z,o={})=>{const kind=o.kind||'chest',y=o.y!==undefined?o.y:(W.interior?W.floorY:groundY(x,z)),g=grp(ctx,x,y,z,o.ry||0),P=ctx.P;
    const shell=kind==='locked'?MAT.hullDark:MAT.crate,lid=new THREE.Group();lid.position.set(0,.62,-.35);g.add(lid);
    P.add(g,shell,RB(1.1,.6,.7,.06,2),0,.3,0);P.add(g,MAT.metal,RB(1.15,.08,.75,.02,1),0,.05,0);P.add(lid,shell,RB(1.1,.14,.7,.05,2),0,.07,.35);
    const lamp=new THREE.Mesh(RB(.16,.06,.02,.01,1),kind==='locked'?MAT.redGlow:MAT.amberGlow);lamp.position.set(0,.4,.36);g.add(lamp);const gl=glowAt(ctx,g,0,.9,0,kind==='locked'?0xff5a5a:0xffc35a,1.4,.45);
    const opened=()=>!!st.opened[id];const sync=()=>{lid.rotation.x=opened()?-1.9:0;gl.visible=!opened();lamp.material=opened()?MAT.tealGlow:(kind==='locked'?MAT.redGlow:MAT.amberGlow);};sync();
    if(!W.interior)addCol(x,z,.7);else ctx.box(x,z,.55,.35,o.ry||0,y+.65);
    ctx.inter({pos:()=>({x,z}),r:2.4,y:y,label:()=>kind==='locked'?(countItem('datachip')||o.key&&countItem(o.key)?'Override the locked cache':'Examine the locked cache'):'Open the container',ok:()=>!opened(),act:()=>{
      if(kind==='locked'){const k=o.key&&countItem(o.key)?o.key:countItem('datachip')?'datachip':null;if(!k){say('Locked cache','SECURE STORAGE',o.lockText||'A sealed security cache. A Data Chip could override the lock, or you may find its key.',[bye('Step back.')]);return;}removeItem(k,1);}
      st.opened[id]=true;sync();sfx('open');const L=o.loot?{cr:o.loot.cr||0,items:(o.loot.items||[]).map(i=>makeItem(i.id,{q:i.q||1}))}:rollLoot(kind,zoneLvl(),ctx.def.id);if(L.cr)giveCr(L.cr);addItems(L.items);if(L.items.some(i=>(i.r||0)>=2))sfx('rare');saveSoon();if(o.onOpen)o.onOpen();}});};
  ctx.travel=(x,z,to,entry,label,o={})=>{const t={x,z,to,entry,label,r:o.r||5,auto:o.auto!==false,ok:o.ok||(()=>true),locked:o.locked,dests:o.dests};W.travel.push(t);
    (ZONE_GRAPH[ctx.def.id]=ZONE_GRAPH[ctx.def.id]||[]).includes(to)||ZONE_GRAPH[ctx.def.id].push(to);
    if(o.marker!==false&&!W.interior){const y=groundY(x,z);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.9,14,16,1,true),new THREE.MeshBasicMaterial({color:0xffc35a,transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));beam.position.set(x,y+7,z);ctx.g.add(beam);}
    ctx.inter({pos:()=>t,r:t.r,label:()=>label,ok:()=>true,act:()=>{if(!t.ok()){say(label,'',t.locked||'You can\'t go that way yet.',[bye('Okay.')]);return;}enterZone(to,entry);}});return t;};
  ctx.poi=(id,x,z,name,o={})=>{W.pois.push({id,x,z,name,r:o.r||22,ft:o.ft,icon:o.icon});};
  ctx.log=(id,x,z,title,text,o={})=>{LOGS[id]={title,text,zone:ctx.def.id};const y=o.y!==undefined?o.y:(W.interior?W.floorY:groundY(x,z)),g=grp(ctx,x,y,z,o.ry||Math.random()*6);
    if(!G.logs.includes(id)){ctx.P.add(g,MAT.metal,RB(.3,.04,.4,.01,1),0,.05,0,-.2,0,0);const s=new THREE.Mesh(new THREE.PlaneGeometry(.24,.32),MAT.screens[Math.abs(id.length)%6]);s.rotation.x=-Math.PI/2+.2;s.position.y=.08;g.add(s);const gl=glowAt(ctx,g,0,.3,0,0x8fd8ff,1.1,.6);
      ctx.inter({pos:()=>({x,z}),r:2,y,label:()=>'Read the data log: '+title,ok:()=>!G.logs.includes(id),act:()=>{G.logs.push(id);g.visible=false;gainXP(25);sfx('pick');say(title,'DATA LOG',text,[bye('Close the log.')]);saveSoon();}});}};
  ctx.glyph=(id,x,z,o={})=>{GLYPHS[id]={zone:ctx.def.id};const gl=PF.glyphStone(ctx,x,z,o.ry||0);if(G.glyphs.includes(id))gl.visible=false;
    ctx.inter({pos:()=>({x,z}),r:2.6,label:()=>'Touch the Builder glyph',ok:()=>!G.glyphs.includes(id),act:()=>{G.glyphs.push(id);gl.visible=false;gainXP(60);sfx('rare');FX.burst(new THREE.Vector3(x,groundY(x,z)+1.5,z),0x8fffe0,50,4,.8,.12);
      const n=G.glyphs.length,tot=Object.keys(GLYPHS).length||24;toast(`Builder glyph ${n} of 24`,'teal');if(n%6===0){G.perkPts++;toast('The glyphs resonate. You gained a perk point.','gold');}if(n===24){give('glass',5);toast('Every glyph found. The Builders\' alphabet is complete.','gold');}saveSoon();}});};
  ctx.node=(kind,x,z,o)=>resourceNode(ctx,kind,x,z,o);
  ctx.nodes=(kind,cx,cz,r,n,o)=>{for(let i=0;i<n;i++){const a=Math.random()*6.28,d=Math.sqrt(Math.random())*r,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;const p={x,z};collide(p,.5);if(W.water&&groundY(p.x,p.z)<W.water.y)continue;resourceNode(ctx,kind,p.x,p.z,o);}};
  ctx.use=(id,x,z,label,o={})=>{(W.useIds=W.useIds||[]).push(id);const done=()=>o.persist!==false&&st.flags['used_'+id];ctx.inter({pos:()=>({x,z}),r:o.r||2.8,y:o.y,label:()=>typeof label==='function'?label():label,ok:()=>!done()&&(o.ok?o.ok():true),act:()=>{if(o.check&&!o.check())return;if(o.persist!==false)st.flags['used_'+id]=true;Bus.emit('use',id);if(o.act)o.act();sfx('open');saveSoon();}});return {done};};
  ctx.bench=(x,z,ry)=>{const b=PF.bench(ctx,x,z,ry);ctx.inter({pos:()=>({x,z}),r:3,label:()=>'Use the workbench',ok:()=>true,act:()=>openWorkbench()});ctx.anim(()=>{if(Math.random()<.12){const v=b.arm.clone().applyMatrix4(b.g.matrixWorld);FX.spawn(v.x,v.y-.12,v.z,rf(-.6,.6),rf(-.2,.6),rf(-.6,.6),{life:rf(.2,.4),size:rf(.05,.09),c0:0xffffff,c1:0x6ff2d6,drag:2,grav:4});}});};
  ctx.board=(x,z,ry,pool,title)=>{PF.board(ctx,x,z,ry,'CONTRACTS');ctx.inter({pos:()=>({x,z}),r:2.8,label:()=>'Check the contract board',ok:()=>true,act:()=>openBoard(pool,ctx.def.id,title)});};
  ctx.locker=(x,z,ry)=>{PF.lockers(ctx,x,z,ry,3);ctx.inter({pos:()=>({x,z}),r:2.6,label:()=>'Change your look at the lockers',ok:()=>!qActive('m01_wake'),act:()=>openLooks(false)});};
  ctx.bed=(x,z,ry)=>{PF.bunk(ctx,x,z,ry);ctx.inter({pos:()=>({x,z}),r:2.4,label:()=>'Rest in the bunk',ok:()=>true,act:()=>{G.hp=PS.maxHp;G.en=PS.maxEn;$('#fade').style.opacity=1;setTimeout(()=>{$('#fade').style.opacity=0;toast('You rest for a while. Fully healed.','teal');saveSoon();},700);}});};
  ctx.heal=(x,z,label='Use the medical station')=>{ctx.inter({pos:()=>({x,z}),r:2.6,label:()=>label,ok:()=>true,act:()=>{G.hp=PS.maxHp;FX.heal();toast('Patched up. Fully healed.','teal');}});};
  return ctx;}

// ===== 23_arch.js =====
/* ================= ARCHITECTURE: modular industrial sci-fi buildings you can walk into ================= */
// Two halves, kept apart:
//  archGen(spec)    geometry generation. Pure data: a spec becomes parts on a module grid (shape, material, transform,
//                   layer), wall colliders, a door, lights and an interior plan. Nothing touches the scene.
//  archBuild(ctx,…) scene assembly. Parts become instanced meshes (one per shape and material, reusing a few unit
//                   primitives), walls become colliders, interiors get their props and people, and the cut-away is wired.
// Layers: 'solid' parts never fade (foundations, floors, the waist-high band of every wall) and are batched zone-wide;
// 'shell' parts (upper walls, ceilings, upper floors, the roof) belong to their building and fade when you walk in
// while playing in third person.
const ARCH={C:3.6,H0:4.2,H:3.4,LOW:1.1};

/* ---------- materials: PBR with distinct metal/rough splits, cyan and orange emissive accents ---------- */
let AM=null;
// a dim, cool environment for building metal: facades facing a bright horizon would otherwise flare white under bloom
function archEnv(){const c=mkCanvas(256),g=c.getContext('2d');c.height=128;const gr=g.createLinearGradient(0,0,0,128);
  gr.addColorStop(0,'#0e0f1a');gr.addColorStop(.42,'#2c2a3c');gr.addColorStop(.5,'#5a4c58');gr.addColorStop(.58,'#2a2630');gr.addColorStop(1,'#121016');g.fillStyle=gr;g.fillRect(0,0,256,128);
  const t=new THREE.CanvasTexture(c);t.mapping=THREE.EquirectangularReflectionMapping;t.encoding=THREE.sRGBEncoding;const pm=new THREE.PMREMGenerator(renderer),e=pm.fromEquirectangular(t).texture;pm.dispose();t.dispose();return e;}
function archMats(){if(AM)return AM;const env=archEnv();
  const pbr=(o,set,ei)=>{const m=set?std(set,o):new THREE.MeshStandardMaterial(o);m.envMap=env;m.envMapIntensity=ei!==undefined?ei:(o.metalness>.5?.9:.3);return m;};
  const glow=(c,i)=>new THREE.MeshStandardMaterial({color:0x0a0d10,emissive:c,emissiveIntensity:i,roughness:.4});
  // yellow and black hazard banding for the blast walls
  const hz=mkCanvas(128),g=hz.getContext('2d');g.fillStyle='#d8a020';g.fillRect(0,0,128,128);g.fillStyle='#1a1a1e';for(let i=-2;i<6;i++){g.beginPath();g.moveTo(i*32,128);g.lineTo(i*32+32,128);g.lineTo(i*32+96,0);g.lineTo(i*32+64,0);g.closePath();g.fill();}
  const ht=new THREE.CanvasTexture(hz);ht.wrapS=ht.wrapT=THREE.RepeatWrapping;ht.repeat.set(6,1);
  // bigger hull plates than the props use: a copy of the hull textures at half the repeat
  const big=t=>{const c=t.clone();c.wrapS=c.wrapT=THREE.RepeatWrapping;c.repeat.set(.5,.5);c.needsUpdate=true;return c;},HB={map:big(TEX.hull.map),normal:TEX.hull.normal?big(TEX.hull.normal):null};
  // lit windows show a room behind them: a warm or cool falloff, blinds, a ceiling lamp and a few silhouettes
  const win=(c1,c2)=>{const cv=mkCanvas(128),q=cv.getContext('2d');const gr=q.createRadialGradient(64,30,4,64,60,90);gr.addColorStop(0,c1);gr.addColorStop(1,c2);q.fillStyle=gr;q.fillRect(0,0,128,128);
    q.fillStyle='rgba(0,0,0,.55)';for(let i=0;i<3;i++){const x=10+i*40+Math.random()*12,h=30+Math.random()*30;q.fillRect(x,128-h,14+Math.random()*16,h);}
    q.fillStyle='rgba(0,0,0,.28)';for(let y=4;y<56;y+=7)q.fillRect(0,y,128,3);q.fillStyle='rgba(255,255,255,.5)';q.fillRect(44,8,40,4);const t=new THREE.CanvasTexture(cv);return t;};
  const lit=(c1,c2)=>{const t=win(c1,c2);return pbr({color:0x101010,map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.55,metalness:.4,roughness:.12},null,1.2);};
  AM={plate:pbr({color:0x6e757f,metalness:.5,roughness:.56},HB),plateWarm:pbr({color:0x86786a,metalness:.45,roughness:.6},HB),
    plateDark:pbr({color:0x3c4049,metalness:.6,roughness:.55},HB),blast:pbr({color:0x6c6862,metalness:.04,roughness:.93},HB),
    hazard:pbr({map:ht,metalness:.15,roughness:.75}),frame:pbr({color:0x22252c,metalness:.9,roughness:.28}),grille:pbr({color:0x1a1c21,metalness:.7,roughness:.62}),
    glass:pbr({color:0x0a1520,metalness:.95,roughness:.06,emissive:0x0c2230,emissiveIntensity:.3},null,1.7),
    glassLit:lit('#ffd9a0','#7a3a10'),glassCool:lit('#c8f0ff','#18405a'),
    copper:pbr({color:0xb06c38,metalness:.92,roughness:.3}),pipe:pbr({color:0x5a5e66,metalness:.88,roughness:.42}),
    dish:pbr({color:0xc8ccd2,metalness:.6,roughness:.35,side:THREE.DoubleSide}),
    cyan:glow(0x34f2ff,1.6),orange:glow(0xff8a2a,1.6),red:glow(0xff2a2a,2),panel:glow(0x9ad8ff,1.3),
    floor:MAT.floor,wallIn:MAT.wall};
  return AM;}

/* ---------- reused unit primitives ---------- */
let AG=null;
function archGeos(){if(AG)return AG;
  const flat=geo=>{const g=geo.toNonIndexed();g.computeVertexNormals();return g;};
  AG={box:new THREE.BoxGeometry(1,1,1),cyl:new THREE.CylinderGeometry(.5,.5,1,18),pipe:new THREE.CylinderGeometry(.5,.5,1,8),ball:new THREE.SphereGeometry(.5,12,8),
    // a square frustum one unit wide at the base, for the tapered roof structures
    frustum:flat(new THREE.CylinderGeometry(.7071*.58,.7071,1,4,1).rotateY(Math.PI/4).translate(0,.5,0)),
    // a hyperboloid cooling tower and a parabolic dish, both one unit across
    tower:lathe([[.5,0],[.44,.2],[.36,.55],[.35,.7],[.39,1],[.36,1],[.32,.7],[.33,.55],[.4,.2],[.46,0]],20),
    dish:lathe([[0,0],[.12,.01],[.25,.05],[.37,.11],[.5,.2]],22),
    // a triangular prism with one edge pointing +z (prow corners), and a gable roof one unit long, wide and high
    prism:flat(new THREE.CylinderGeometry(.5,.5,1,3,1)),
    gable:flat(new THREE.CylinderGeometry(.5,.5,1,3,1).rotateZ(Math.PI/2).rotateX(-Math.PI/2).translate(0,.25,0).scale(1,1/.75,1/.866))};
  return AG;}

/* ---------- geometry generation ---------- */
// spec: {id,x,z,face,w,d,floors,name,sub,kind,accent:'cyan'|'orange',hull,seed}
function archGen(s){const {C,H0,H,LOW}=ARCH,w=s.w||3,d=s.d||2,F=Math.max(2,s.floors||2),W=w*C,D=d*C,r=mulberry(s.seed||(s.id||'b').split('').reduce((a,c)=>a*31+c.charCodeAt(0),7)%99991);
  const acc=s.accent==='orange'?'orange':'cyan',acc2=acc==='cyan'?'orange':'cyan',hull=s.hull||'plate',P=[],walls=[],lights=[],blinks=[];
  const add=(g,m,x,y,z,sx,sy,sz,L='shell',rx=0,ry=0,rz=0)=>P.push({g,m,x,y,z,sx,sy,sz,L,rx,ry,rz});
  // variety, all above the ground floor so rooms stay clear: corner treatment (square, rounded towers or pointed prows),
  // roof form (tapered block, gable or sawtooth), a curved bay on one side, and the odd pod jutting from an upper floor
  const corners=s.corners||['square','round','prow'][Math.floor(r()*3)],roof=s.roof||['frustum','gable','saw'][Math.floor(r()*3)];
  const bayK=s.bay!==undefined?s.bay:(r()<.4?1+Math.floor(r()*3):-1),BR=1.9,maxPods=s.pods!==undefined?s.pods:1+Math.floor(r()*3);let pods=0;
  const CN=[[-1,1],[1,1],[1,-1],[-1,-1]],special=corners==='round'?(r()<.5?[0,2]:[1,3]):corners==='prow'?[0,1,2,3]:[];
  // a point on side k (0 front +z, 1 right +x, 2 back -z, 3 left -x): u runs along the face, o is distance out of it
  const len=k=>k%2?D:W,at=(k,u,o)=>k===0?[u,D/2+o,0]:k===1?[W/2+o,-u,Math.PI/2]:k===2?[-u,-D/2-o,Math.PI]:[-W/2-o,u,-Math.PI/2];
  const face=(k,g,m,u,y,o,sx,sy,sz,L,rx=0,rz=0)=>{const [x,z,ry]=at(k,u,o);add(g,m,x,y,z,sx,sy,sz,L,rx,ry,rz);};
  // wall pieces are split at waist height: the low band stays when the building opens, the rest fades
  const split=(k,m,u,y0,y1,o,sx,sz)=>{if(y0<LOW){const t=Math.min(y1,LOW);face(k,'box',m,u,(y0+t)/2,o,sx,t-y0,sz,'solid');}if(y1>LOW){const b=Math.max(y0,LOW);face(k,'box',m,u,(b+y1)/2,o,sx,y1-b,sz,'shell');}};
  const doorCell=Math.floor(w/2),DW=2.4,DH=2.9;
  // foundation skirt and the interior floor
  add('box','blast',0,-.42,0,W+1.3,.9,D+1.3,'solid');add('box','floor',0,.04,0,W-.7,.08,D-.7,'solid');
  for(let k=0;k<4;k++)face(k,'box','hazard',0,.05,.5,len(k)+1.1,.1,.3,'solid');
  /* ground floor: heavy pillars on every grid line, blast walls between them, a recessed door with a canopy */
  for(let k=0;k<4;k++){const n=k%2?d:w,L0=len(k);
    for(let i=0;i<n;i++){const u=-L0/2+C*(i+.5),cw=C-.95;
      if(k===0&&i===doorCell){const jw=(cw-DW)/2;for(const sg of[-1,1]){split(k,'blast',u+sg*(DW/2+jw/2),0,H0-.2,-.05,jw,.75);face(k,'box',acc,u+sg*(DW/2+.06),DH/2,.34,.08,DH,.06,'solid');}
        face(k,'box','blast',u,(DH+H0-.2)/2,-.05,cw,H0-.2-DH,.75,'shell');face(k,'box',acc,u,DH+.06,.34,DW+.2,.08,.06,'solid');
        face(k,'box','frame',u,3.25,.95,3.4,.16,1.9,'shell');face(k,'box',acc2,u,3.16,1.86,3.2,.05,.05,'shell');face(k,'box','panel',u,3.15,.95,2.4,.03,1.2,'shell');
        for(const sg of[-1,1])face(k,'box','frame',u+sg*1.55,3.55,1.4,.12,.75,.12,'shell',.9,0);
        lights.push({x:at(k,u,1.2)[0],y:3.0,z:at(k,u,1.2)[1],c:acc==='cyan'?0x6ff2ff:0xffb06a,sprite:2.6});continue;}
      split(k,'blast',u,0,LOW+.2,-.02,cw,.8);face(k,'box','hazard',u,LOW+.05,.4,cw,.16,.04,'solid');
      split(k,s.groundMat||'plateDark',u,LOW+.2,H0-.2,-.18,cw,.45);
      // slit windows on alternate cells, a cool strip under the ceiling line
      if((i+k)%2===0){face(k,'box','frame',u,2.62,.08,cw-.8,.62,.2,'shell');face(k,'box',r()<.5?'glassLit':'glass',u,2.62,.13,cw-1.05,.4,.06,'shell');}
      face(k,'box',acc,u,H0-.48,.07,cw-.6,.07,.05,'shell');
      split(k,'wallIn',u,.1,H0-.2,-.44,cw,.06);face(k,'box',acc,u,.2,-.5,cw-.4,.05,.04,'solid');}
    // pillars on the grid lines of this side (each side owns its start corner)
    for(let i=0;i<n;i++){const u=-L0/2+C*i;face(k,'box','blast',u,.3,.02,1.35,.6,1.35,'solid');split(k,'blast',u,0,H0,0,.95,.95);
      face(k,'box',hull,u,H0-.15,0,1.15,.3,1.15,'shell');face(k,'box',i%2?acc2:acc,u,2.1,.49,.12,1.4,.04,'shell');}}
  /* middle floors: a slab band per floor with light strips, then alternating recessed windows and protruding hull plates */
  const band=y=>{add('box',hull,0,y,0,W+.55,.42,D+.55);for(let k=0;k<4;k++)face(k,'box',(Math.round(y)%2)?acc:acc2,0,y,.28,len(k)+.3,.06,.04);};
  band(H0);
  // a pod: a cube cantilevered out of the facade with a window, side slits, an underglow and two braces
  const pod=(k,u,y0,y1,ym,h)=>{const PD=1.7,pw=C-.55,ph=h-.35,yb=ym-ph/2;
    face(k,'box',hull,u,ym,PD/2-.05,pw,ph,PD);face(k,'box','frame',u,ym,PD-.08,pw+.1,ph+.1,.12);
    face(k,'box',r()<.6?'glassLit':'glassCool',u,ym+.1,PD,pw-.6,ph-.75,.05);face(k,'box','frame',u,ym+.1,PD+.02,.07,ph-.75,.06);
    for(const sg of[-1,1]){face(k,'box','glass',u+sg*(pw/2+.01),ym+.25,PD*.55,.05,.45,PD-.6);face(k,'box','frame',u+sg*(pw/2-.35),yb-.5,PD*.42,.14,1.3,.14,'shell',.72);}
    face(k,'box',acc,u,yb-.03,PD*.55,pw-.4,.05,PD-.4);};
  // a rounded drum (corner tower or bay): hull rings per floor with a wraparound window band, rims and light rings at each floor line
  const drum=(cx,cz,R)=>{const gl='glass';
    for(let f=1;f<F;f++){const y0=H0+(f-1)*H+.21,y1=y0+H-.42,ym=(y0+y1)/2;add('cyl',hull,cx,ym,cz,2*R,y1-y0,2*R);add('cyl',gl,cx,ym+.1,cz,2*R+.06,1.25,2*R+.06);
      for(const dy of[-.55,.75])add('cyl','frame',cx,ym+dy,cz,2*R+.12,.09,2*R+.12);add('cyl',f%2?acc:acc2,cx,ym-.45,cz,2*R+.14,.035,2*R+.14);}
    for(let f=0;f<F;f++){const yb=H0+f*H;add('cyl',hull,cx,yb,cz,2*R+.35,.42,2*R+.35);add('cyl',f%2?acc2:acc,cx,yb,cz,2*R+.4,.06,2*R+.4);}
    add('frustum',hull,cx,H0+.1,cz,2*R*.95,1.1,2*R*.95,'shell',Math.PI,0,0);};
  for(let f=1;f<F;f++){const y0=H0+(f-1)*H+.21,y1=y0+H-.42,ym=(y0+y1)/2,h=y1-y0;
    add('box','plateDark',0,ym,0,W-1.1,h+.05,D-1.1);
    for(let k=0;k<4;k++){const n=k%2?d:w,L0=len(k);
      for(let i=0;i<n;i++){const u=-L0/2+C*(i+.5),pat=(i+f+k)%2;
        if(k===bayK&&Math.abs(u)<BR+.2)continue;// the curved bay covers this cell
        if(!((i===0||i===n-1)&&corners!=='square')&&pods<maxPods&&r()<.13){pods++;pod(k,u,y0,y1,ym,h);continue;}
        if(pat===0){// recessed window: frame at the facade, glass set back, a mullion and a sill
          face(k,'box','frame',u,y1-.16,-.1,C-.3,.32,.5);face(k,'box','frame',u,y0+.2,-.1,C-.3,.4,.5);for(const sg of[-1,1])face(k,'box','frame',u+sg*(C/2-.22),ym,-.1,.3,h,.5);
          face(k,'box',r()<.4?(r()<.5?'glassCool':'glassLit'):'glass',u,ym+.1,-.44,C-.7,h-.85,.06);face(k,'box','frame',u,ym+.1,-.4,.07,h-.85,.08);
          face(k,'box','plate',u,y0+.44,.06,C-.5,.06,.3);}
        else{// protruding paneling: layered hull plates, a vent grille and an indicator
          face(k,'box',hull,u,ym,.02,C-.35,h-.1,.42);face(k,'box',hull==='plate'?'plateWarm':'plate',u,ym+.18,.3,C-1.25,h-1.25,.18);
          face(k,'box','frame',u,ym+.18,.4,C-1.45,.04,.04);for(let v=0;v<4;v++)face(k,'box','grille',u,y0+.42+v*.13,.27,C-1.5,.06,.1);
          face(k,'box',r()<.5?acc:acc2,u+(C/2-.65),y1-.38,.3,.26,.07,.04);}}
      // edge columns keep the corners continuous
      face(k,'box',hull,-L0/2,ym,0,.85,h,.85);}
    band(H0+f*H);}
  const top=H0+(F-1)*H+.21;
  for(const ci of special){const [sx,sz]=CN[ci];
    if(corners==='round'){const R=1.55,cx=sx*(W/2-.1),cz=sz*(D/2-.1);drum(cx,cz,R);
      add('ball','frame',cx,top+.05,cz,2*R*.9,R*.9,2*R*.9);add('pipe','frame',cx,top+1.5,cz,.07,1.6,.07);add('ball','red',cx,top+2.35,cz,.16,.16,.16);blinks.push({x:cx,y:top+2.35,z:cz,ph:r()*6});}
    else{const a=Math.atan2(sx,sz),cx=sx*W/2,cz=sz*D/2,hh=top-H0+.2,ym=(H0+top)/2;
      add('prism',hull,cx,ym,cz,2.3,hh,2.3,'shell',0,a,0);add('box',acc,cx+Math.sin(a)*1.13,ym,cz+Math.cos(a)*1.13,.07,hh-.2,.07,'shell',0,a,0);
      add('prism','plateDark',cx,top+.3,cz,2.6,.6,2.6,'shell',0,a,0);add('prism','plateDark',cx,H0-.35,cz,1.9,.7,1.9,'shell',0,a,0);}}
  if(bayK>=0){const [bx,bz]=at(bayK,0,0);drum(bx,bz,BR);add('cyl','plateDark',bx,top+.3,bz,2*BR+.2,.6,2*BR+.2);add('cyl',acc,bx,top+.62,bz,2*BR+.1,.05,2*BR+.1);}
  /* exposed conduits: a few risers on one side, horizontal runs along the back under each band */
  const ck=1+Math.floor(r()*3),cl=len(ck);for(let p=0;p<2+Math.floor(r()*2);p++){const u=-cl/2+C*(1+p)-.7-p*.25,m=p===0?'copper':'pipe',rad=p===0?.22:.16;
    face(ck,'pipe',m,u,(.4+top)/2,.62+p*.06,rad,top-.4,rad,'shell');for(let y=1.4;y<top-.4;y+=2.3)face(ck,'box','frame',u,y,.5,.5,.12,.32,'shell');}
  for(let f=0;f<F-1;f++)face(2,'pipe','pipe',0,H0+f*H-.42,.58,.18,W-1.2,.18,'shell',0,Math.PI/2);
  /* roof: parapet, an asymmetric tapered structure on one half, gear clustered on the other */
  for(let k=0;k<4;k++)face(k,'box','plateDark',0,top+.35,-.15,len(k)+.3,.7,.3);
  const side=r()<.5?-1:1,tw=W*(.38+r()*.12),td=D*(.62+r()*.15),th=1.8+r()*1.2,tx=side*(W/2-tw/2-.6),tz=-D/2+td/2+.6;
  if(roof==='frustum'){add('frustum',hull,tx,top,tz,tw,th,td);add('box',acc,tx,top+.06,tz,tw+.08,.08,td+.08);add('box','frame',tx,top+th-.05,tz,tw*.58,.12,td*.58);
    add('box','grille',tx,top+th*.45,tz+td*.36,tw*.55,th*.35,.06,'shell',-.35);}
  else if(roof==='gable'){add('box','frame',tx,top+.08,tz,tw+.12,.16,td+.12);add('gable',hull,tx,top+.16,tz,tw,th*.9,td);add('box',acc,tx,top+.16+th*.9,tz,tw+.1,.06,.08);
    for(const sg of[-1,1])add('box','glassCool',tx,top+.16+th*.42,tz+sg*td*.27,tw*.6,.04,td*.42,'shell',sg*Math.atan2(th*.9,td/2),0,0);}
  else{// sawtooth: a row of small gables like a factory roof, each ridge lit
    const n=2+Math.floor(r()*2),seg=td/n;add('box','frame',tx,top+.08,tz,tw+.12,.16,td+.12);
    for(let i=0;i<n;i++){const z0=tz-td/2+seg*(i+.5);add('gable',i%2?'plateDark':hull,tx,top+.16,z0,tw,th*.6,seg);add('box',acc,tx,top+.16+th*.6,z0,tw+.06,.05,.06);}}
  const spots=[];for(let gx=-W/2+1.4;gx<=W/2-1.4;gx+=1.7)for(let gz=-D/2+1.4;gz<=D/2-1.4;gz+=1.7){if(Math.abs(gx-tx)<tw/2+1&&Math.abs(gz-tz)<td/2+1)continue;if(special.some(ci=>Math.hypot(gx-CN[ci][0]*W/2,gz-CN[ci][1]*D/2)<2.6))continue;if(bayK>=0){const [bx,bz]=at(bayK,0,0);if(Math.hypot(gx-bx,gz-bz)<BR+1)continue;}spots.push([gx,gz]);}
  for(let i=spots.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[spots[i],spots[j]]=[spots[j],spots[i]];}
  const kinds=['tower','dish','antenna','antenna','ac','tower','ac','antenna','dish','ac'];
  spots.slice(0,Math.min(spots.length,4+Math.floor(r()*3))).forEach(([gx,gz],i)=>{const k=kinds[i%kinds.length];
    if(k==='tower'){const s2=1.3+r()*.6;add('box','plateDark',gx,top+.2,gz,s2+.2,.4,s2+.2);add('tower','plate',gx,top+.4,gz,s2,s2*1.5,s2);add('cyl',acc,gx,top+.4+s2*1.48,gz,s2*.72,.06,s2*.72);}
    else if(k==='dish'){const ry=r()*6.28;add('pipe','frame',gx,top+.7,gz,.14,1.4,.14);add('dish','dish',gx,top+1.45,gz,1.7,1.7,1.7,'shell',-.75,ry,0);
      add('pipe','frame',gx+Math.sin(ry)*.35,top+1.75,gz+Math.cos(ry)*.35,.05,.9,.05,'shell',-.75,ry,0);}
    else if(k==='antenna'){const ah=2.2+r()*3.4;add('pipe','frame',gx,top+ah/2,gz,.1,ah,.1);for(let c=1;c<3;c++)add('box','frame',gx,top+ah*c/3,gz,.9-c*.25,.04,.04,'shell',0,r()*3,0);
      add('ball','red',gx,top+ah+.08,gz,.18,.18,.18);blinks.push({x:gx,y:top+ah+.08,z:gz,ph:r()*6});}
    else{add('box','plateDark',gx,top+.35,gz,1.3,.7,1.05);add('cyl','frame',gx,top+.73,gz,.85,.06,.85);add('box','grille',gx,top+.35,gz+.53,1.1,.45,.04);}});
  /* colliders: one solid box per wall run, the front split around the door */
  const T=1.3;walls.push({x:0,z:-D/2,hw:W/2+.5,hd:T/2},{x:W/2,z:0,hw:T/2,hd:D/2+.5},{x:-W/2,z:0,hw:T/2,hd:D/2+.5});
  const dx=-W/2+C*(doorCell+.5),lw=(dx-DW/2)-(-W/2-.5),rw=(W/2+.5)-(dx+DW/2);
  walls.push({x:-W/2-.5+lw/2,z:D/2,hw:lw/2,hd:T/2},{x:dx+DW/2+rw/2,z:D/2,hw:rw/2,hd:T/2});
  lights.push({x:0,y:H0-.7,z:0,c:s.light||0xffe2b8,point:true});
  return {parts:P,walls,lights,blinks,hw:W/2,hd:D/2,top,door:{x:dx,z:D/2,w:DW,h:DH},inner:{hw:W/2-.9,hd:D/2-.9}};}

/* ---------- terrain: each footprint is levelled before the ground mesh is built ---------- */
function archFlatten(def){if(!def.arch)return;const {C}=ARCH;
  for(const s of def.arch){const hw=(s.w||3)*C/2+1.4,hd=(s.d||2)*C/2+1.4,c=Math.cos(s.face||0),sn=Math.sin(s.face||0);let sum=0,n=0;
    for(let a=-1;a<=1;a+=.5)for(let b=-1;b<=1;b+=.5){const p=toW(s.x,s.z,s.face||0,a*hw,b*hd);sum+=def.height(p.x,p.z);n++;}const pad=sum/n,R=6;s._pad=pad;
    for(let j=0;j<W.N;j++)for(let i=0;i<W.N;i++){const x=-W.half+i*W.step,z=-W.half+j*W.step,dx=x-s.x,dz=z-s.z;if(Math.abs(dx)>hw+hd+R||Math.abs(dz)>hw+hd+R)continue;
      const lx=dx*c-dz*sn,lz=dx*sn+dz*c,e=Math.hypot(Math.max(0,Math.abs(lx)-hw),Math.max(0,Math.abs(lz)-hd));if(e>=R)continue;const t=1-smooth(0,R,e),k=j*W.N+i;W.H[k]+=(pad-W.H[k])*t;}}}

/* ---------- scene assembly ---------- */
const _arM=new THREE.Matrix4(),_arV=new THREE.Vector3(),_arQ=new THREE.Quaternion(),_arE=new THREE.Euler(),_arS=new THREE.Vector3();
function instance(geo,mat,list,shadow=true){const im=new THREE.InstancedMesh(geo,mat,list.length);list.forEach((m,i)=>im.setMatrixAt(i,m));im.instanceMatrix.needsUpdate=true;im.castShadow=shadow;im.receiveShadow=true;im.frustumCulled=false;return im;}
// world position of a point in a building spec's frame (for placing people and things inside)
const archAt=(s,lx,lz)=>toW(s.x,s.z,s.face||0,lx,lz);
function archBuild(ctx,list){const M=archMats(),G=archGeos(),solid=new Map();W.arch=[];
  for(const s of list){const o=archGen(s),y=groundY(s.x,s.z),rot=s.face||0,root=new THREE.Group();root.position.set(s.x,y,s.z);root.rotation.y=rot;ctx.g.add(root);root.updateMatrixWorld(true);
    const shell=new THREE.Group();root.add(shell);const mats=new Map(),groups=new Map();
    for(const p of o.parts){_arM.compose(_arV.set(p.x,p.y,p.z),_arQ.setFromEuler(_arE.set(p.rx,p.ry,p.rz,'YXZ')),_arS.set(p.sx,p.sy,p.sz));const key=p.g+'|'+p.m;
      if(p.L==='solid'){if(!solid.has(key))solid.set(key,[]);solid.get(key).push(root.matrixWorld.clone().multiply(_arM));}
      else{if(!groups.has(key))groups.set(key,[]);groups.get(key).push(_arM.clone());}}
    // the shell gets its own copies of the materials so it can fade without touching other buildings
    for(const [key,ms] of groups){const [g,m]=key.split('|');if(!mats.has(m))mats.set(m,M[m].clone());shell.add(instance(G[g],mats.get(m),ms));}
    // sliding door, sign and lights
    const doorL=new THREE.Group();doorL.position.set(o.door.x,0,o.door.z+.05);root.add(doorL);const halves=[-1,1].map(sg=>{const h=new THREE.Mesh(G.box,M.plateDark);h.scale.set(o.door.w/2,o.door.h,.12);h.position.set(sg*o.door.w/4,o.door.h/2,0);h.castShadow=true;doorL.add(h);
      const st=new THREE.Mesh(G.box,M[s.accent==='orange'?'orange':'cyan']);st.scale.set(.05,o.door.h-.6,.02);st.position.set(sg*o.door.w/4-sg*(o.door.w/4-.08),o.door.h/2,.07);doorL.add(st);return [h,st];});
    if(s.name){const sg=decal([s.name,s.sub||''].filter(Boolean),3.2,.8,{fg:'#f2ecff'});sg.position.set(o.door.x,3.7,o.hd+.56);shell.add(sg);
      if(s.neon){const n=neon(s.neon,4.2,.9,s.accent==='orange'?'#ffb070':'#7ff8ff');n.position.set(o.door.x,(o.top>8?7.2:5.3),o.hd+.82);shell.add(n);}}
    let lamp=null;for(const L of o.lights){const w=archAt(s,L.x,L.z);if(L.point){ctx.light(w.x,y+L.y,w.z,L.c,0,12);lamp=ctx.lights[ctx.lights.length-1];}if(L.sprite){const gs=glowSprite(L.c,L.sprite,.5);gs.position.set(L.x,L.y,L.z);shell.add(gs);}}
    const blinks=o.blinks.map(b=>{const gs=glowSprite(0xff3a2a,1.4,.8);gs.position.set(b.x,b.y,b.z);shell.add(gs);return [gs,b.ph];});
    // interior ceiling lights
    for(const lx of[-o.inner.hw/2,o.inner.hw/2]){const pl=new THREE.Mesh(G.box,M.panel);pl.scale.set(1.6,.05,.5);pl.position.set(lx,ARCH.H0-.25,0);shell.add(pl);}
    // colliders (the camera ignores the walls of the building you are standing in, see archUpdate)
    const plats=o.walls.map(c=>{const w=archAt(s,c.x,c.z);return ctx.box(w.x,w.z,c.hw,c.hd,rot,y+ARCH.H0+.2,y-1);});
    const b={s,lamp,x:s.x,z:s.z,y,rot,hw:o.hw,hd:o.hd,inner:o.inner,shell,mats:[...mats.values()],plats,f:0,halves,blinks,doorW:archAt(s,o.door.x,o.door.z+.6),cast:true};W.arch.push(b);
    archInterior(ctx,b);}
  for(const [key,ms] of solid){const [g,m]=key.split('|');ctx.g.add(instance(G[g],M[m],ms));}
  ctx.anim(archUpdate);}

/* ---------- interiors: furniture, people and finds per kind of building ---------- */
function archInterior(ctx,b){const s=b.s,ih=b.inner.hw,id=b.inner.hd,R=b.rot,at=(lx,lz)=>archAt(s,lx,lz),put=(fn,lx,lz,lr=0,...a)=>{const p=at(lx,lz);return fn(ctx,p.x,p.z,R+lr,...a);};
  const k=s.kind||'storage',chest=(lx,lz,o={})=>{const p=at(lx,lz);ctx.chest(s.id+'_'+(o.tag||'cache'),p.x,p.z,Object.assign({ry:R},o));};
  if(k==='cantina'){put(PF.bar,0,-id+1.5,0,Math.min(6,ih*1.3));put(PF.shelf,0,-id+.25,0,3.2);put(PF.table,-ih*.6,.9,0,1.3,1,{stools:3});put(PF.table,ih*.6,.9,.4,1.3,1,{stools:3});
    for(const sg of[-1,1]){const p=at(sg*(ih-.4),-id+.4);PF.plant(ctx,p.x,p.z,0xff9a5a);}}
  else if(k==='lab'){put(PF.console,-ih+.6,-id*.3,Math.PI/2);put(PF.console,-ih+.6,id*.45,Math.PI/2);put(PF.medbed,ih-1.1,-id*.2,0);put(PF.shelf,0,-id+.35,0,2.4);
    const p=at(ih-.5,id-.4);PF.plant(ctx,p.x,p.z);chest(ih-1,-id+.6,{tag:'samples'});}
  else if(k==='workshop'){put(PF.shelf,-ih*.4,-id+.35,0,2.6);{const p=at(ih-1.2,-id+1.2);PF.crates(ctx,p.x,p.z,4,7);const q=at(-ih+.9,id-.9);PF.barrels(ctx,q.x,q.z,3,4);}
    const p=at(ih*.2,-id*.1);ctx.bench(p.x,p.z,R);chest(ih-.8,id-.6,{tag:'parts'});}
  else if(k==='bunks'){for(const lx of[-ih+1.2,ih-1.2]){const p=at(lx,-id+.7);ctx.bed(p.x,p.z,R);}{const p=at(0,-id+.4);ctx.locker(p.x,p.z,R);}chest(-ih+.7,id-.7,{tag:'footlocker'});}
  else if(k==='clinic'){put(PF.medbed,-ih+1.2,-id+.6,0);put(PF.medbed,ih-1.2,-id+.6,0);put(PF.console,0,-id+.5,0);put(PF.shelf,-ih+.4,id*.2,Math.PI/2,2);
    const h=at(0,0);ctx.heal(h.x,h.z,s.healLabel||'Use the med-station');const p=at(ih-.5,id-.4);PF.plant(ctx,p.x,p.z);}
  else if(k==='admin'){put(PF.table,0,-id*.25,0,2.4,1);put(PF.console,-ih+.6,0,Math.PI/2);put(PF.shelf,ih-.4,-id*.2,-Math.PI/2,2.4);
    if(s.log){const p=at(.3,-id*.25);ctx.log(s.log[0],p.x,p.z,s.log[1],s.log[2],{y:groundY(p.x,p.z)+.86});}}
  else if(k==='security'){put(PF.lockers,-ih+.4,-id*.2,Math.PI/2,3);put(PF.console,0,-id+.6,0);chest(ih-.8,-id+.7,{tag:'arms',kind:'locked'});}
  else if(k==='commons'){put(PF.table,-ih*.5,-id*.3,0,1.6,.9,{stools:4});put(PF.table,ih*.5,-id*.3,.3,1.6,.9,{stools:4});put(PF.medbed,ih-1.1,id*.45,0);
    const h=at(ih-1.1,id*.45-1.2);ctx.heal(h.x,h.z,s.healLabel||'Use the med-station');for(const sg of[-1,1]){const p=at(sg*(ih-.4),-id+.4);PF.plant(ctx,p.x,p.z);}}
  else if(k==='greenhouse'){for(let i=0;i<4;i++)for(const sg of[-1,1]){const p=at(-ih+1+i*(ih*2-2)/3,sg*id*.55);PF.plant(ctx,p.x,p.z,[0x52e8c8,0x9a6aff,0xffb04a][i%3]);}
    for(const lx of[-ih*.4,ih*.4]){const p=at(lx,0);ctx.node('glowcap',p.x,p.z);}}
  else{{const p=at(-ih+1.2,-id+1.2);PF.crates(ctx,p.x,p.z,5,3);const q=at(ih-1,-id+.9);PF.barrels(ctx,q.x,q.z,4,9);}put(PF.shelf,0,-id+.35,0,2.6);chest(0,id*.1,{tag:'stores'});}
  if(s.extra)s.extra(ctx,b,at);}

/* ---------- runtime: doors, blinkers and the cut-away ---------- */
let lampsDirty=false;
function archUpdate(dt){if(!W.arch)return;const t=performance.now()/1000;
  for(const b of W.arch){const dx=player.x-b.x,dz=player.z-b.z,c=Math.cos(b.rot),s=Math.sin(b.rot),lx=dx*c-dz*s,lz=dx*s+dz*c;
    const inside=Math.abs(lx)<b.hw-.35&&Math.abs(lz)<b.hd-.35&&player.y<b.y+ARCH.H0-.5;
    const near=Math.hypot(player.x-b.doorW.x,player.z-b.doorW.z)<3.4||inside;b.open=(b.open||0)+((near?1:0)-(b.open||0))*Math.min(1,dt*6);
    b.halves.forEach(([h,st],i)=>{const sg=i?1:-1,off=sg*b.open*1.05;h.position.x=sg*.6+off;st.position.x=sg*.6-sg*.52+off;});
    for(const [gs,ph] of b.blinks)gs.visible=Math.sin(t*2.4+ph)>.2;
    if(b.lamp&&(b.lamp.i>0)!==inside){b.lamp.i=inside?1.25:0;lampsDirty=true;}
    // third person: the roof, ceilings and upper walls fade so you can see the room; first person keeps them
    const target=inside&&!cam.fp&&!UI.title?1:0;if(Math.abs(target-b.f)<.001&&(b.f===0||b.f===1))continue;
    b.f+=(target-b.f)*Math.min(1,dt*5);if(Math.abs(target-b.f)<.01)b.f=target;
    for(const m of b.mats){const tr=b.f>.001;if(m.transparent!==tr){m.transparent=tr;m.needsUpdate=true;}m.opacity=1-b.f;m.depthWrite=b.f<.3;}
    b.shell.visible=b.f<.99;for(const [h,st] of b.halves){h.visible=st.visible=b.f<.5;}const cast=b.f<.5;if(cast!==b.cast){b.cast=cast;b.shell.traverse(o=>{if(o.isMesh)o.castShadow=cast;});}
    for(const p of b.plats)p.nocam=b.f>.3;}
  if(lampsDirty){lampsDirty=false;updateLights();}}

// ===== 24_env.js =====
/* ================= ENVIRONMENT MODELS: crystals, rocks, ruin stones, jellies ================= */
// Supplied models are cut into variants (a whole model, or each of its meshes), baked upright with their base at y=0 and
// normalised to unit height (or unit width), then scattered as instances. Each zone gives a light tint so they match its palette.
// Credits: "Toon Style - Crystal", "Lowpoly textured ice Crystals", "Crystals", "Magical Glowing Crystals", "Magic Crystal IX",
// "Glowing Jelly Fish", "Stylized Rocks with Magic Rune", "Fantasy Ruin Rocks", "Small rocks", "Stylized Rocks" (all CC BY 4.0).
const ENVV={};
function envVariants(id,mode,norm){const key=id+mode+norm;if(ENVV[key])return ENVV[key];const M=MODELS[id];if(!M)return null;M.scene.updateMatrixWorld(true);
  const meshes=[];M.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});if(!meshes.length)return null;
  const groups=mode==='each'?meshes.map(m=>[m]):[meshes];
  return ENVV[key]=groups.map(ms=>{const parts=ms.map(o=>{const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);return {g,mat:o.material};});
    const b=new THREE.Box3();parts.forEach(p=>{p.g.computeBoundingBox();b.union(p.g.boundingBox);});const sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
    const k=1/(norm==='w'?Math.max(sz.x,sz.z):sz.y);parts.forEach(p=>{p.g.translate(-c.x,-b.min.y,-c.z);p.g.scale(k,k,k);p.g.computeBoundingSphere();});
    return {parts,w:Math.max(sz.x,sz.z)*k,h:sz.y*k};});}
// instances are gathered while a zone builds, then turned into one InstancedMesh per variant part
function envBatch(ctx){if(ctx.envB)return ctx.envB;const L=new Map();
  return ctx.envB={add(v,m,c,mats){const k=v;if(!L.has(k))L.set(k,{arr:[],mats});L.get(k).arr.push([m.clone(),c?c.clone():null]);},
    // instances are grouped in 48 m cells; each cell is shown only while it is in view and inside the fog (see viewCull)
    build(parent){const CS=48,cells=new Map();for(const [v,{arr,mats}] of L)for(const it of arr){const k=Math.floor(it[0].elements[12]/CS)+','+Math.floor(it[0].elements[14]/CS);
        if(!cells.has(k))cells.set(k,new Map());const cm=cells.get(k);if(!cm.has(v))cm.set(v,{arr:[],mats});cm.get(v).arr.push(it);}
      const far=(W.def&&W.def.fogFar||scene.fog&&scene.fog.far||330)+60;
      for(const [k,cm] of cells){const [i,j]=k.split(',').map(Number),ms=[];let top=0;
        for(const [v,{arr,mats}] of cm){for(const it of arr)top=Math.max(top,it[0].elements[13]+v.h*Math.max(it[0].elements[5],1));
          v.parts.forEach((p,pi)=>{const im=new THREE.InstancedMesh(p.g,mats?mats[pi]:p.mat,arr.length);
          arr.forEach(([m,c],n)=>{im.setMatrixAt(n,m);if(c)im.setColorAt(n,c);});im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
          im.castShadow=true;im.receiveShadow=true;im.frustumCulled=false;parent.add(im);ms.push(im);});}
        const c=new THREE.Vector3((i+.5)*CS,0,(j+.5)*CS);c.y=groundY(c.x,c.z);W.cullChunks.push({ms,c,s:new THREE.Sphere(c.clone().setY(c.y+Math.max(0,top-c.y)/2),CS*.75+Math.max(8,top-c.y)),far2:far*far,v:true});}
      L.clear();}};}
const _em=new THREE.Matrix4(),_eq=new THREE.Quaternion(),_ee=new THREE.Euler(),_ev3=new THREE.Vector3(),_es=new THREE.Vector3();
const envM=(x,y,z,rx,ry,rz,sx,sy,sz)=>_em.compose(_ev3.set(x,y,z),_eq.setFromEuler(_ee.set(rx,ry,rz)),_es.set(sx,sy,sz));
// a light tint: mostly white, a little of the zone colour
const lightTint=(c,k=.3)=>new THREE.Color(1,1,1).lerp(c,k);
// per-zone copies of a variant's materials, with the emissive glow nudged toward the zone's colour
function zoneMats(v,emi){return v.parts.map(p=>{const m=p.mat.clone();m.envMap=protaEnv();m.envMapIntensity=.6;
  if(m.emissive&&(m.emissive.r+m.emissive.g+m.emissive.b>.05||m.emissiveMap)){if(emi)m.emissive.lerp(new THREE.Color(emi),.45);m.emissiveIntensity=Math.min(m.emissiveIntensity||1,.5);}return m;});}

/* ---------- crystals ---------- */
function envCrystals(){const out=[];for(const [id,mode] of [['env_cr1','whole'],['env_cr2','whole'],['env_cr3','each'],['env_cr4','whole'],['env_cr5','whole']]){const v=envVariants(id,mode,'h');if(v)out.push(...v);}return out.length?out:null;}
function crystalField(ctx,f){const V=envCrystals();if(!V)return false;const B=envBatch(ctx),mats=V.map(v=>zoneMats(v,f.emissive));const N=f.count;let k=0;
  scatter(ctx,Math.ceil(N/3),f.where,(x,z,y)=>{const n=1+Math.floor(rng()*3),base=rr(.6,1.5)*(f.scale||1),hue=f.hue?rr(f.hue[0],f.hue[1]):rr(.7,.8);
    for(let c=0;c<n&&k<N;c++){const vi=Math.floor(rng()*V.length),v=V[vi],s=base*(c?rr(.45,.75):1),hh=rr(2,3.6)*s,ox=c?rr(-1.1,1.1)*base:0,oz=c?rr(-1.1,1.1)*base:0;
      B.add(v,envM(x+ox,groundY(x+ox,z+oz)-.1,z+oz,rr(-.2,.2),rr(0,6.3),rr(-.2,.2),hh,hh,hh),lightTint(new THREE.Color().setHSL(hue,.6,.6),.35),mats[vi]);k++;}
    if(base>.8)addCol(x,z,base*.7);});return true;}

/* ---------- rocks: the stylised boulder for big ones, the small rocks for the rest ---------- */
function rockField(ctx,f){const big=envVariants('env_boulder','whole','h'),small=envVariants('env_pebbles','each','w');if(!big||!small)return false;const B=envBatch(ctx),bm=big.map(v=>zoneMats(v)),sm=small.map(v=>zoneMats(v));
  const hs=f.hsl||[.75,.92,.12,.25,.62,.82];
  scatter(ctx,f.count,f.where,(x,z,y)=>{const s=rr(.4,2.4)*(f.scale||1),tint=lightTint(new THREE.Color().setHSL(rr(hs[0],hs[1]),Math.min(.6,rr(hs[2],hs[3])*2.5),.55),.28);
    if(s>1.3){const h=s*rr(1.1,1.6);B.add(big[0],envM(x,y-.15*h,z,rr(-.1,.1),rr(0,6.3),rr(-.1,.1),h*rr(.85,1.15),h,h*rr(.85,1.15)),tint,bm[0]);addCol(x,z,s*.7);}
    else{const vi=Math.floor(rng()*small.length),w=s*rr(1.5,2.2);B.add(small[vi],envM(x,y-.05*w,z,0,rr(0,6.3),0,w,w*rr(.8,1.3),w),tint,sm[vi]);if(s>1)addCol(x,z,s*.8);}});return true;}

/* ---------- ruin stones and glyph stones ---------- */
function ruinStone(ctx,x,z,h,r,tilt){const V=envVariants('env_ruins','each','h');if(!V)return false;const y=groundY(x,z),vi=Math.abs(Math.round(x*7+z*13))%V.length,v=V[vi],sxz=2*r/Math.max(.2,v.w);
  if(!ctx.ruinMats)ctx.ruinMats=V.map(q=>zoneMats(q,ctx.def.ruinGlow||0x8fffe0));
  envBatch(ctx).add(v,envM(x,y-.25,z,tilt,rr(0,6.3),tilt*.6,sxz,h+.25,sxz),lightTint(new THREE.Color(ctx.def.ruinTint||0xb0a4c8),.25),ctx.ruinMats[vi]);addCol(x,z,r+.1);return true;}
function runeStoneMesh(h=2.5){const V=envVariants('env_runes','each','h');if(!V)return null;const v=V.reduce((a,b)=>b.parts[0].g.attributes.position.count>a.parts[0].g.attributes.position.count?b:a),g=new THREE.Group();
  v.parts.forEach(p=>{const m=new THREE.Mesh(p.g,p.mat);m.scale.setScalar(h);m.castShadow=m.receiveShadow=true;g.add(m);});return g;}

/* ---------- campfire and tent ---------- */
// "Cozy Campfire": its ground disc, grass cards and far boulders are left out; the logs, the stone ring and the
// shape-keyed flames stay, the flames self-lit so they bloom. Returns the group and an updater for the flame animation.
let FIRE_T=null;
function campfireModel(){const M=MODELS.env_fire;if(!M)return null;const o=M.scene.clone(true);o.updateMatrixWorld(true);let fl=null;const drop=[];
  o.traverse(q=>{if(!q.isMesh)return;const n=q.material.name||'';if(/Ground|Grass/i.test(n))drop.push(q);else if(/Flames/i.test(n))fl=q;});drop.forEach(q=>q.parent.remove(q));
  const fc=new THREE.Vector3();if(fl){new THREE.Box3().setFromObject(fl).getCenter(fc);}
  // stones further than the fire's own ring are scenery from the original scene
  const far=[];o.traverse(q=>{if(q.isMesh&&/Stones/i.test(q.material.name||'')){const c=new THREE.Box3().setFromObject(q).getCenter(new THREE.Vector3());if(Math.hypot(c.x-fc.x,c.z-fc.z)>4)far.push(q);}});far.forEach(q=>q.parent.remove(q));
  o.traverse(q=>{if(!q.isMesh)return;q.castShadow=!/Flames/i.test(q.material.name||'');q.receiveShadow=true;q.frustumCulled=false;const m=q.material=q.material.clone();
    if(/Flames/i.test(m.name||'')){m.emissive=new THREE.Color(0xffa040);m.emissiveMap=m.map;m.emissiveIntensity=1.8;m.side=THREE.DoubleSide;m.depthWrite=false;}else{m.envMap=protaEnv();m.envMapIntensity=.3;}});
  const g=new THREE.Group(),fit=new THREE.Group();fit.add(o);g.add(fit);fit.updateMatrixWorld(true);const b=new THREE.Box3();o.traverse(q=>{if(q.isMesh&&!/Flames/i.test(q.material.name||''))b.expandByObject(q);});
  const sz=b.getSize(new THREE.Vector3()),k=1.9/Math.max(sz.x,sz.z);fit.scale.setScalar(k);fit.position.set(-fc.x*k,-b.min.y*k,-fc.z*k);
  const mixer=new THREE.AnimationMixer(o);if(M.animations[0]){const a=mixer.clipAction(M.animations[0]);a.play();a.time=Math.random()*a.getClip().duration;}
  return {g,update:dt=>mixer.update(dt)};}
function tentModel(){const M=MODELS.env_tent;if(!M)return null;const o=M.scene.clone(true),g=new THREE.Group(),fit=new THREE.Group();fit.add(o);g.add(fit);fit.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(fit),sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),k=5.6/Math.max(sz.x,sz.z);fit.scale.setScalar(k);fit.position.set(-c.x*k,-b.min.y*k-.08,-c.z*k);
  o.traverse(q=>{if(q.isMesh){q.castShadow=q.receiveShadow=true;q.material=q.material.clone();q.material.side=THREE.DoubleSide;}});return g;}

/* ---------- survey rover, the Lost Hauler wreck, and the shuttle ---------- */
// "Rover new" by M8ZA (CC BY 4.0): the showroom platform is left out; normals were stripped to let the 580k-vertex
// original simplify, so they are rebuilt here and the panels drawn flat-shaded. The wreck is the same rover with two wheels torn
// off (cut out of the wheel meshes, then strewn nearby), sunk and tilted into a dirt berm, scorched, blast-holed and sparking.
let ROVER_PREP=false;
function roverPrep(M){if(ROVER_PREP)return;ROVER_PREP=true;M.scene.traverse(o=>{if(o.isMesh){if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();}});}
function roverModel(ctx,x,z,ry,o={}){const M=MODELS.env_rover;if(!M)return null;roverPrep(M);const wreck=!!o.wreck,y=groundY(x,z);
  const g=grp(ctx,x,y,z,ry),body=new THREE.Group(),fit=new THREE.Group(),m=M.scene.clone(true);g.add(body);body.add(fit);fit.add(m);
  const drop=[];m.traverse(q=>{if(q.isMesh&&/Cylinder001_18/.test(q.parent.name))drop.push(q);});drop.forEach(q=>q.parent.remove(q));
  const tint=o.color!=null?new THREE.Color(o.color):null,meshes=[];
  m.traverse(q=>{if(!q.isMesh)return;q.castShadow=q.receiveShadow=true;const mt=q.material=q.material.clone();mt.flatShading=true;mt.envMap=protaEnv();mt.envMapIntensity=.5;
    
    if(tint&&/MainHull$/.test(mt.name))mt.color.lerp(lin(tint.getHex()),.45);if(wreck)mt.color.lerp(new THREE.Color(0x2a2420),.32);meshes.push(q);});
  m.rotation.y=-Math.PI/2;fit.updateMatrixWorld(true);let b=new THREE.Box3().setFromObject(fit);const sz=b.getSize(new THREE.Vector3()),k=6.4/sz.z,c=b.getCenter(new THREE.Vector3());
  fit.scale.setScalar(k);fit.position.set(-c.x*k,-b.min.y*k,-c.z*k);
  const L=6.4,Wd=sz.x*k;
  if(!wreck){addCol(x,z,2.2);const f=toW(x,z,ry,0,2.2),r=toW(x,z,ry,0,-2.2);addCol(f.x,f.z,1.6);addCol(r.x,r.z,1.6);return {g,body};}
  // ---- the wreck: tear off the two right-hand wheels at the front and middle
  g.updateMatrixWorld(true);const wheels=meshes.filter(q=>/Wheels_1/.test(q.parent.name));const wb=new THREE.Box3();wheels.forEach(q=>wb.expandByObject(q));
  const R=(wb.max.y-wb.min.y)/2,cy=(wb.max.y+wb.min.y)/2,cz=wb.max.z-R*.55,cxs=[wb.max.x-R,(wb.max.x+wb.min.x)/2];
  const centres=cxs.map(cx=>new THREE.Vector3(cx,cy,cz)),torn=centres.map(()=>[]),v=new THREE.Vector3(),inv=new THREE.Matrix4();
  for(const q of wheels){const G=q.geometry,P=G.attributes.position,I=G.index;if(!I)continue;const keep=[];
    for(let t=0;t<I.count;t+=3){v.set(0,0,0);for(let j=0;j<3;j++){const p=new THREE.Vector3().fromBufferAttribute(P,I.getX(t+j)).applyMatrix4(q.matrixWorld);v.add(p);}v.multiplyScalar(1/3);
      const hit=centres.findIndex(cc=>cc.distanceTo(v)<R*1.05);if(hit<0){keep.push(I.getX(t),I.getX(t+1),I.getX(t+2));}else for(let j=0;j<3;j++)torn[hit].push(new THREE.Vector3().fromBufferAttribute(P,I.getX(t+j)).applyMatrix4(q.matrixWorld));}
    const ng=G.clone();ng.setIndex(keep);q.geometry=ng;}
  // the torn wheels lie in the sand nearby
  torn.forEach((pts,i)=>{if(!pts.length)return;const cc=centres[i],arr=new Float32Array(pts.length*3);pts.forEach((p,j)=>{p.sub(cc);arr.set([p.x,p.y,p.z],j*3);});
    const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.BufferAttribute(arr,3));wg.computeVertexNormals();const wm=new THREE.Mesh(wg,new THREE.MeshStandardMaterial({color:0x2a2622,roughness:.9,flatShading:true}));
    wm.castShadow=wm.receiveShadow=true;const p=toW(x,z,ry,(i?-4.6:5.2),(i?3.8:-1.5));wm.position.set(p.x,groundY(p.x,p.z)+R*.35,p.z);wm.rotation.set(Math.PI/2+rr(-.2,.2),rr(0,6),rr(-.2,.2));ctx.g.add(wm);});
  // sunk and rolled onto the side that lost its wheels, nose down
  body.rotation.set(.1,0,-.2);body.position.y=-.55;g.updateMatrixWorld(true);
  const P=ctx.P;for(let i=0;i<16;i++){const a=rr(0,6.28),d=rr(2.2,4),p=toW(x,z,ry,Math.cos(a)*d*.8,Math.sin(a)*d),s=rr(.6,1.5);P.add(ctx.g,MAT.sandstone,rockGeo(1,i*5.3),p.x,groundY(p.x,p.z)+s*.05,p.z,rr(0,3),rr(0,3),rr(0,3),s*1.4,s*.4,s);}
  for(let i=0;i<12;i++){const p=toW(x,z,ry,rr(-9,9),rr(-9,9));if(Math.hypot(p.x-x,p.z-z)<3.5)continue;P.add(ctx.g,i%2?MAT.hullDark:MAT.metal,RB(rr(.4,1.6),rr(.05,.2),rr(.3,1),.03,1),p.x,groundY(p.x,p.z)+.1,p.z,rr(-.5,.5),rr(0,6),rr(-.5,.5));}
  const sc=new THREE.MeshBasicMaterial({map:dmgTex('scorch'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  for(let i=0;i<5;i++){const p=toW(x,z,ry,rr(-4,4),rr(-5,5)),d=new THREE.Mesh(new THREE.PlaneGeometry(rr(3,6),rr(3,6)),sc);d.rotation.set(-Math.PI/2,0,rr(0,6));d.position.set(p.x,groundY(p.x,p.z)+.05,p.z);ctx.g.add(d);}
  // blast marks on the hull: rays from above and the sides find its surface
  const rc=new THREE.Raycaster(),hitAt=(lx,ly,lz,dx,dy,dz)=>{const org=new THREE.Vector3(lx,ly,lz).applyMatrix4(body.matrixWorld),dir=new THREE.Vector3(dx,dy,dz).transformDirection(body.matrixWorld).normalize();rc.set(org,dir);const h=rc.intersectObjects(meshes,false)[0];
    if(!h)return null;const n=h.face.normal.clone().transformDirection(h.object.matrixWorld);if(n.dot(dir)>0)n.negate();return {p:h.point,n};};
  const decalOn=(h,tex,w,hh,add)=>{const d=new THREE.Mesh(new THREE.PlaneGeometry(w,hh),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,blending:add?THREE.AdditiveBlending:THREE.NormalBlending}));
    d.position.copy(h.p).addScaledVector(h.n,.03);d.lookAt(h.p.clone().add(h.n));d.rotateZ(rr(0,6.28));ctx.g.add(d);};
  const sparks=[],smoke=[];
  for(let i=0;i<10;i++){const h=hitAt(rr(-Wd/2,Wd/2),6,rr(-L/2,L/2),0,-1,0)||hitAt(Wd*Math.sign(rr(-1,1)),rr(.8,2.4),rr(-L/2,L/2),-Math.sign(rr(-1,1)),0,0);if(h)decalOn(h,dmgTex('scorch'),rr(1,2.2),rr(1,2.2));}
  for(const [lx,lz] of[[.5,1.6],[-.6,-.8],[.2,-2.2]]){const h=hitAt(lx,6,lz,0,-1,0);if(!h)continue;const s=rr(.45,.7);decalOn(h,dmgTex('scorch'),s*2.8,s*2.8);decalOn(h,dmgTex('hole'),s,s);decalOn(h,dmgTex('rim'),s*1.7,s*1.7,true);sparks.push(h.p.clone());smoke.push(h.p.clone());}
  for(const lz of[1.8,-.4]){const h=hitAt(Wd,1.4,lz,-1,0,0);if(h){decalOn(h,dmgTex('scorch'),1.6,1.6);sparks.push(h.p.clone());}}
  const smokeM=new THREE.SpriteMaterial({map:GLOW,color:0x2a2622,transparent:true,opacity:.3,depthWrite:false}),puffs=[];
  for(const s of smoke.slice(0,2))for(let i=0;i<5;i++){const sp=new THREE.Sprite(smokeM.clone());sp.userData={o:s,t:i/5};ctx.g.add(sp);puffs.push(sp);}
  ctx.anim(dt=>{for(const sp of puffs){const u=sp.userData;u.t=(u.t+(dt||.016)*.14)%1;sp.position.set(u.o.x+Math.sin(u.t*5)*.4*u.t,u.o.y+u.t*5,u.o.z+u.t);sp.scale.setScalar(.8+u.t*4);sp.material.opacity=.32*(1-u.t)*Math.min(1,u.t*6);}
    if(sparks.length&&Math.random()<.12){const sv=pick(sparks);for(let i=0;i<14;i++)FX.spawn(sv.x,sv.y,sv.z,rf(-2.5,2.5),rf(.5,4),rf(-2.5,2.5),{life:rf(.3,.7),size:rf(.05,.1),c0:0xffffff,c1:0xffa040,drag:1.2,grav:9});}});
  addCol(x,z,2.4);const f=toW(x,z,ry,0,2.2),r=toW(x,z,ry,0,-2.2);addCol(f.x,f.z,1.6);addCol(r.x,r.z,1.6);return {g,body};}
// "Standard civilan shuttle" by Sol (CC BY-NC-ND 4.0): shown unaltered, only placed, sized and lit; a crash adds scorch and smoke around it
function shuttleModel(ctx,x,y,z,ry,s,color){const M=MODELS.env_shuttle;if(!M)return null;const g=grp(ctx,x,y,z,ry);g.scale.setScalar(s);const fit=new THREE.Group(),m=M.scene.clone(true);fit.add(m);g.add(fit);
  m.rotation.y=-Math.PI/2;fit.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(fit),sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),k=6.6/sz.z;fit.scale.setScalar(k);fit.position.set(-c.x*k,-b.min.y*k+.2,-c.z*k);
  m.traverse(q=>{if(q.isMesh){q.castShadow=q.receiveShadow=true;q.material=q.material.clone();q.material.envMap=protaEnv();q.material.envMapIntensity=.7;}});
  const sc=new THREE.MeshBasicMaterial({map:dmgTex('scorch'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  for(let i=0;i<6;i++){const p=toW(x,z,ry,rr(-1,1)*2*s,rr(-3.5,3.5)*s),d=new THREE.Mesh(new THREE.PlaneGeometry(rr(2,3.5)*s,rr(2,3.5)*s),sc);d.rotation.set(-Math.PI/2,0,rr(0,6));d.position.set(p.x,groundY(p.x,p.z)+.06,p.z);ctx.g.add(d);}
  const smokeM=new THREE.SpriteMaterial({map:GLOW,color:0x2a2622,transparent:true,opacity:.3,depthWrite:false}),puffs=[],src=new THREE.Vector3(x,y+1.5*s,z);
  for(let i=0;i<6;i++){const sp=new THREE.Sprite(smokeM.clone());sp.userData={t:i/6};ctx.g.add(sp);puffs.push(sp);}
  ctx.anim(dt=>{for(const sp of puffs){const u=sp.userData;u.t=(u.t+(dt||.016)*.1)%1;sp.position.set(src.x+Math.sin(u.t*4)*.6*u.t*s,src.y+u.t*4*s,src.z+u.t*s);sp.scale.setScalar((1+u.t*4)*s*.6);sp.material.opacity=.3*(1-u.t)*Math.min(1,u.t*6);}});
  return g;}

/* ---------- textures on the generated rocks: the stylised rock texture, projected in world space ---------- */
function triplanar(m,tex,scale){const t=tex.clone();t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;m.map=t;m.customProgramCacheKey=()=>'tri';
  m.onBeforeCompile=sh=>{sh.uniforms.uTriS={value:scale};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTriP;varying vec3 vTriN;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 triW=vec4(transformed,1.);vec3 triN=normal;\n#ifdef USE_INSTANCING\ntriW=instanceMatrix*triW;triN=mat3(instanceMatrix)*triN;\n#endif\ntriW=modelMatrix*triW;vTriP=triW.xyz;vTriN=normalize(mat3(modelMatrix)*triN);');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTriP;varying vec3 vTriN;uniform float uTriS;')
      .replace('#include <map_fragment>','vec3 triB=pow(abs(normalize(vTriN)),vec3(4.));triB/=triB.x+triB.y+triB.z;vec4 triC=texture2D(map,vTriP.yz*uTriS)*triB.x+texture2D(map,vTriP.xz*uTriS)*triB.y+texture2D(map,vTriP.xy*uTriS)*triB.z;diffuseColor*=mapTexelToLinear(triC);');};
  m.needsUpdate=true;}
function envInit(){const M=MODELS.env_boulder;let tex=null;if(M)M.scene.traverse(o=>{if(o.isMesh&&o.material.map&&!tex)tex=o.material.map;});if(!tex)return;
  for(const [k,c] of [['rock',0xffffff],['basalt',0x7a7480],['sandstone',0xf0c8a0]]){if(MAT[k]){MAT[k].color.setHex(c);triplanar(MAT[k],tex,.33);}}}

// ===== 30_quests.js =====
/* ================= QUESTS ================= */
const QUESTS={};
const ZONE_GRAPH={}; // zone → [neighbor zones], filled from zone definitions' links
function Q(def){QUESTS[def.id]=def;def.stages.forEach(s=>s.obj=s.obj||[]);return def;}
const qState=id=>G.q[id];
const qActive=id=>G.q[id]&&G.q[id].st==='active';
const qDone=id=>G.q[id]&&G.q[id].st==='done';
const qStage=id=>G.q[id]?G.q[id].s:-1;
function qAvailable(id){const d=QUESTS[id];if(!d||G.q[id])return false;if(d.minLvl&&G.lvl<d.minLvl)return false;return d.req?!!d.req():true;}
function startQuest(id,quiet){const d=QUESTS[id];if(!d||G.q[id])return;G.q[id]={st:'active',s:0,p:[]};initStage(id);if(!G.track||d.type==='main')G.track=id;
  if(!quiet){toast((d.type==='main'?'Main story: ':'New task: ')+d.title,'gold');sfx('quest');}Bus.emit('qstart',id);renderTracker();checkObjectives();saveSoon();}
function initStage(id){const d=QUESTS[id],s=G.q[id];const st=d.stages[s.s];s.p=st.obj.map(()=>0);if(st.onStart)st.onStart();}
function objDone(o,p){if(o.k==='have')return countItem(o.item)>=o.n;if(o.k==='flag')return !!G.flags[o.flag];if(o.k==='kill')return p>=o.n;if(o.k==='level')return G.lvl>=o.n;return p>=1;}
function stageDone(id){const d=QUESTS[id],s=G.q[id];const st=d.stages[s.s];return st.obj.every((o,i)=>objDone(o,s.p[i]));}
function advance(id){const d=QUESTS[id],s=G.q[id];const st=d.stages[s.s];
  for(const o of st.obj)if(o.k==='have'&&o.take)removeItem(o.item,o.n);
  if(st.onDone)st.onDone();
  if(s.s+1<d.stages.length){s.s++;initStage(id);const nt=d.stages[s.s].text;if(nt)toast(nt,'gold');sfx('pick');Bus.emit('qstage',id,s.s);renderTracker();checkObjectives();}
  else completeQuest(id);saveSoon();}
function completeQuest(id){const d=QUESTS[id],s=G.q[id];if(!s||s.st==='done')return;s.st='done';G.stats.quests++;const R=d.reward||{};
  if(R.cr)giveCr(R.cr);if(R.xp)gainXP(R.xp);if(R.items)for(const r of R.items){if(r.gen){const it=rollEquipment(r.lvl||G.lvl,r.bonus||.5,r.gen);if(it){if(r.r!==undefined)it.r=Math.max(it.r,r.r);addItem(it);}}else give(r.id,r.q||1,r.o||{});}
  if(R.perk){G.perkPts+=R.perk;toast('You gained a perk point.','teal');}
  if(R.unlock)for(const u of R.unlock)G.flags['look_'+u]=true;
  toast((d.type==='main'?'Story complete: ':'Task complete: ')+d.title,'gold');sfx('quest');if(G.track===id)G.track=nextTrack();if(d.onComplete)d.onComplete();Bus.emit('qdone',id);renderTracker();
  // follow-on main story quests start on their own
  for(const k in QUESTS){const q=QUESTS[k];if(q.auto&&qAvailable(k))startQuest(k);}}
function nextTrack(){const act=Object.keys(G.q).filter(k=>G.q[k].st==='active');return act.find(k=>QUESTS[k].type==='main')||act[0]||null;}
function checkObjectives(){for(const id in G.q){const s=G.q[id];if(s.st!=='active')continue;const d=QUESTS[id];if(!d)continue;const st=d.stages[s.s];if(!st)continue;
  st.obj.forEach((o,i)=>{// a named enemy (a boss) you already beat before this step began still counts
    if(o.k==='killId'&&!s.p[i]&&o.id&&Object.values(G.zs||{}).some(z=>z&&z.killed&&z.killed[o.id])){s.p[i]=1;}
    if(o.k==='go'&&(!o.zone||o.zone===W.id)&&Math.hypot(player.x-o.x,player.z-o.z)<(o.r||6)&&!s.p[i]){s.p[i]=1;}});
  if(stageDone(id)&&!st.obj.some(o=>o.k==='talk'||o.k==='deliver'))advance(id);}}
Bus.on('kill',(type,e)=>{for(const id in G.q){const s=G.q[id];if(s.st!=='active')continue;const st=QUESTS[id].stages[s.s];st.obj.forEach((o,i)=>{if(o.k==='kill'&&((o.types||[o.type]).includes(type))&&(!o.zone||o.zone===W.id)){s.p[i]=Math.min(o.n,(s.p[i]||0)+1);if(s.p[i]<=o.n)toast(`${o.label||'Defeated'} · ${s.p[i]}/${o.n}`);}
  if(o.k==='killId'&&e.id===o.id)s.p[i]=1;});}checkObjectives();renderTracker();});
Bus.on('item',()=>{checkObjectives();renderTracker();});
Bus.on('use',useId=>{for(const id in G.q){const s=G.q[id];if(s.st!=='active')continue;const st=QUESTS[id].stages[s.s];st.obj.forEach((o,i)=>{if(o.k==='use'&&o.id===useId)s.p[i]=1;});}checkObjectives();renderTracker();});
Bus.on('flag',()=>{checkObjectives();renderTracker();});
function setFlag(f,v=true){G.flags[f]=v;Bus.emit('flag',f);}
function objText(o,p){if(o.k==='flag'&&o.item&&!G.flags[o.flag])return `${o.label} · ${Math.min(countItem(o.item),o.n)}/${o.n}`;if(o.k==='kill')return `${o.label} · ${Math.min(p||0,o.n)}/${o.n}`;if(o.k==='have')return `${o.label} · ${Math.min(countItem(o.item),o.n)}/${o.n}`;return o.label;}
function curObjectives(id){const s=G.q[id];if(!s||s.st!=='active')return [];const st=QUESTS[id].stages[s.s];return st.obj.map((o,i)=>({o,p:s.p[i],done:objDone(o,s.p[i])}));}
// where the tracker marker should point for the first unfinished objective
function questTarget(id){const list=curObjectives(id).filter(x=>!x.done);if(!list.length)return null;const o=list[0].o;
  const zoneOf=()=>o.zone||(o.npc&&NPCS[o.npc]&&NPCS[o.npc].zone)||null;const z=zoneOf();
  if(z&&z!==W.id)return routeMarker(z);
  if(o.k==='talk'||o.k==='deliver'){const n=W.npcs.find(n=>n.id===o.npc);if(n)return {x:n.x,z:n.z};}
  if(o.x!==undefined)return {x:o.x,z:o.z};if(o.at)return o.at;return null;}
function routeMarker(zone){// breadth-first search over the zone graph to find the next exit
  const prev={},q=[W.id],seen={[W.id]:1};while(q.length){const c=q.shift();if(c===zone)break;for(const n of (ZONE_GRAPH[c]||[]))if(!seen[n]){seen[n]=1;prev[n]=c;q.push(n);}}
  if(!seen[zone])return null;let step=zone;while(prev[step]&&prev[step]!==W.id)step=prev[step];const t=W.travel.find(t=>t.to===step||(t.dests&&t.dests.includes(step)));return t?{x:t.x,z:t.z,label:'To '+(ZONES[step]?ZONES[step].name:step)}:null;}

/* ================= DIALOGUE ================= */
let dlgOpts=[],dlgNpc=null,dlgGen=0;
// words fade in one after another; any reply key or tap during the reveal shows the rest at once
function revealWords(el,html){el.innerHTML=html;el.classList.remove('done');let i=0;const walk=n=>{for(const c of [...n.childNodes]){if(c.nodeType===3){const f=document.createDocumentFragment();for(const part of c.textContent.split(/(\s+)/)){if(!part)continue;if(/^\s+$/.test(part)){f.appendChild(document.createTextNode(part));continue;}const s=document.createElement('span');s.className='w';s.style.animationDelay=(i++*.028)+'s';s.textContent=part;f.appendChild(s);}c.replaceWith(f);}else walk(c);}};walk(el);
  revealWords.t0=performance.now();revealWords.dur=i*28;clearTimeout(revealWords.t);revealWords.t=setTimeout(()=>el.classList.add('done'),i*28+400);return i*28;}
// a press while most of the text is still appearing just shows it all; late in the reveal it chooses straight away
function dialogRevealing(){const el=$('#dText');if(el.classList.contains('done'))return false;el.classList.add('done');return performance.now()-revealWords.t0<revealWords.dur*.6;}
// while talking, the scene shifts so the speaker stands left of centre, beside the transmission panel (wide screens only)
function dlgView(on){const wide=innerWidth>760&&innerWidth>innerHeight;if(on&&wide&&!UI.custom&&!INTRO.on){camera.setViewOffset(innerWidth,innerHeight,innerWidth*.14,0,innerWidth,innerHeight);UI.dlgView=true;}
  else if(UI.dlgView){UI.dlgView=false;if(!UI.custom)camera.clearViewOffset();}}
function say(name,role,text,opts){dlgGen++;UI.dialog=true;const D=$('#dialog');D.hidden=false;D.style.animation='none';void D.offsetWidth;D.style.animation='';document.documentElement.classList.add('talking');
  $('#dTxT').textContent=(opts.some(o=>o.main)?'PRIORITY TRANSMISSION':'INCOMING TRANSMISSION')+' · CH '+String(10+(name.length*7)%89).padStart(2,'0');dlgView(true);
  $('#dName').textContent=name;$('#dRole').textContent=role||'';D.classList.toggle('mainq',opts.some(o=>o.main));const tms=revealWords($('#dText'),text);
  const box=$('#dOpts');box.innerHTML='';dlgOpts=opts;
  opts.forEach((o,i)=>{const b=document.createElement('button');b.type='button';b.className='opt'+(o.go?' go':'')+(o.main?' main':'')+(o.dim?' dim':'');b.style.animationDelay=(Math.min(tms,900)/1000+i*.05)+'s';b.innerHTML=`<span class="k">${pad.active||isTouch?'›':i+1}</span><span>${o.label}</span>`;b.onclick=()=>{if(dialogRevealing())return;b.blur();sfx('click');o.fn();};box.appendChild(b);});
  $('#dHint').textContent=pad.active?'D-pad to highlight · A to choose · B walks away':isTouch?'Tap a reply, or start moving to walk away.':(opts.length>1?`Press 1–${Math.min(9,opts.length)} to reply · Enter picks the first · Esc or any movement key walks away`:'Press 1 or Enter to reply · Esc or any movement key walks away');
  updateTouchVis();padFocus('#dOpts');}
function closeDialog(){dlgView(false);UI.dialog=false;UI.dlgLock=false;document.documentElement.classList.remove('talking');$('#dialog').hidden=true;dlgNpc=null;endTalk();updateTouchVis();}
const bye=(l='Goodbye.')=>({label:l,fn:closeDialog});
function vesta(msg,dur=7000){toast('VESTA · '+msg,'teal',dur);}
function openNPCDialog(n){const D=n.D;dlgNpc=n;
  if(D.crowd){say(D.name,'',pick(D.barks||CROWD_BARKS),[bye('See you around.')]);return;}
  const opts=[];
  // active quest objectives that involve this person
  for(const id in G.q){const s=G.q[id];if(s.st!=='active')continue;const d=QUESTS[id],st=d.stages[s.s];
    st.obj.forEach((o,i)=>{if((o.k==='talk'||o.k==='deliver')&&o.npc===n.id&&!s.p[i]){const can=o.k==='deliver'?countItem(o.item)>=o.n:st.obj.every((x,j)=>j===i||x.k==='talk'||x.k==='deliver'||objDone(x,s.p[j]));
      opts.push({label:(o.opt||o.label)+(can?'':' <span class="k">(not ready)</span>'),main:d.type==='main',go:d.type!=='main',fn:()=>{if(!can){say(D.name,D.role,o.notReady||'Come back when you\'ve finished what we talked about.',[{label:'Back',fn:()=>openNPCDialog(n)},bye()]);return;}
        if(o.k==='deliver'&&o.take!==false)removeItem(o.item,o.n);s.p[i]=1;const text=typeof o.text==='function'?o.text():o.text;const after=()=>{if(stageDone(id))advance(id);};
        if(text)say(D.name,D.role,text,o.replies?o.replies.map(r=>({label:r,fn:()=>{const g=dlgGen;after();if(g===dlgGen)openNPCDialog(n);}})):[{label:'Continue',go:true,fn:()=>{const g=dlgGen;after();if(g===dlgGen)openNPCDialog(n);}}]);else{const g=dlgGen;after();if(g===dlgGen)openNPCDialog(n);}}});}});}
  // quest offers
  for(const id in QUESTS){const d=QUESTS[id];if(d.giver!==n.id||!qAvailable(id))continue;
    opts.push({label:(d.type==='main'?'★ ':'')+(d.ask||('Ask about work: '+d.title)),main:d.type==='main',go:d.type!=='main',fn:()=>{const t=typeof d.offer==='function'?d.offer():d.offer;
      say(D.name,D.role,t,[{label:d.accept||'I\'ll do it.',go:true,main:d.type==='main',fn:()=>{const g=dlgGen;startQuest(id);if(g!==dlgGen)return;if(d.acceptText)say(D.name,D.role,typeof d.acceptText==='function'?d.acceptText():d.acceptText,[{label:'Got it.',fn:()=>openNPCDialog(n)},bye()]);else openNPCDialog(n);}},{label:'Not right now.',fn:()=>openNPCDialog(n)}]);}});}
  if(D.vendor)opts.push({label:D.vendor.label||'Let\'s trade.',fn:()=>{closeDialog();openShop(n.id);}});
  if(D.services)for(const sv of D.services){if(sv.cond&&!sv.cond())continue;opts.push({label:sv.label,fn:()=>{closeDialog();sv.fn();}});}
  for(const t of (D.topics||[])){if(t.cond&&!t.cond())continue;if(t.once&&G.flags['topic_'+n.id+'_'+t.label])continue;opts.push({label:t.label,dim:!!G.flags['topic_'+n.id+'_'+t.label],fn:()=>{G.flags['topic_'+n.id+'_'+t.label]=true;if(t.fn)t.fn();const text=typeof t.text==='function'?t.text():t.text;if(text)say(D.name,D.role,text,[{label:'Back',fn:()=>openNPCDialog(n)},bye()]);}});}
  opts.push(bye(D.bye||'Goodbye.'));
  const greet=typeof D.greet==='function'?D.greet():(D.greet||'Hello.');say(D.name,D.role,greet,opts);}
// quest markers over NPC heads: ★ main story, ! new task, ? ready to report
function npcMark(id){let m='',main=false;
  for(const q in G.q){const s=G.q[q];if(s.st!=='active')continue;const st=QUESTS[q].stages[s.s];if(st.obj.some((o,i)=>(o.k==='talk'||o.k==='deliver')&&o.npc===id&&!s.p[i])){m='?';main=main||QUESTS[q].type==='main';}}
  if(!m)for(const q in QUESTS){const d=QUESTS[q];if(d.giver===id&&qAvailable(q)){m='!';main=main||d.type==='main';}}
  return {m:main&&m?'★':m,main};}

/* ================= BOUNTY BOARDS (repeatable contracts) ================= */
const BOUNTY_POOLS={
  twilight:{kill:[['skitter','Skitters',8],['brood','Brood Mothers',1]],collect:[['glowcap',6],['chitin',6],['shard',5]],lvl:[2,6]},
  dayward:{kill:[['sandSkitter','Dune Skitters',8],['raider','Dust Jackals',6],['raiderBrute','Jackal Bruisers',2]],collect:[['alloy',5],['scrap',10],['polymer',4]],lvl:[5,11]},
  nightward:{kill:[['frost','Frost Skitters',8],['brood','Brood Mothers',1]],collect:[['frostchitin',6],['shard',8]],lvl:[8,14]},
  anchorage:{kill:[['drone','rogue drones',6],['sentinel','rogue Sentinels',3]],collect:[['wiring',8],['datachip',2]],lvl:[12,16]},
  calder:{kill:[['stalker','Reed Stalkers',6],['glider','Glider Rays',5]],collect:[['pearl',5],['resin',6]],lvl:[15,20]},
  ashfall:{kill:[['golem','Ash Golems',4],['wisp','Ember Wisps',6],['merc','Cohort mercs',6]],collect:[['slag',6],['glass',2]],lvl:[19,25]},
};
function genBounty(pool,zone){const P=BOUNTY_POOLS[pool];const L=Math.round(lerp(P.lvl[0],P.lvl[1],Math.random()));
  if(Math.random()<.6){const [t,label,n]=pick(P.kill);const N=Math.max(1,Math.round(n*rf(.8,1.3)));return {kind:'kill',type:t,label,n:N,p:0,zone,xp:Math.round(N*(20+L*6)*(t==='brood'||t==='raiderBrute'?2.4:1)),cr:Math.round(N*(6+L*2.4)*(t==='brood'?3:1))};}
  const [it,n]=pick(P.collect);const N=Math.round(n*rf(.8,1.3));return {kind:'collect',item:it,n:N,zone,xp:Math.round(N*(14+L*4)),cr:Math.round(N*(itemDef(it).value*1.6+L))};}
function bounties(pool,zone){if(!G.bounties[pool]||!G.bounties[pool].length)G.bounties[pool]=[genBounty(pool,zone),genBounty(pool,zone),genBounty(pool,zone)];return G.bounties[pool];}
Bus.on('kill',type=>{for(const k in G.bounties)for(const b of G.bounties[k]||[])if(b.accepted&&b.kind==='kill'&&b.type===type&&b.p<b.n){b.p++;if(b.p===b.n)toast(`Contract ready to turn in: ${b.label}`,'gold');}});
function bountyText(b){return b.kind==='kill'?`Defeat ${b.n} ${b.label}${b.accepted?` · ${Math.min(b.p,b.n)}/${b.n}`:''}`:`Deliver ${b.n} × ${itemDef(b.item).name}${b.accepted?` · have ${countItem(b.item)}`:''}`;}
function openBoard(pool,zone,title){const B=bounties(pool,zone);UI.panel=true;$('#panel').hidden=false;updateTouchVis();
  const b=$('#panelBody');b.className='sheet plate narrow';
  b.innerHTML=`<h2>${esc(title||'Contract Board')} <button class="x" type="button" id="xB">CLOSE · ESC</button></h2><p class="note">Contracts refresh when you finish them. Accepted contracts count kills anywhere.</p><div class="cards">${B.map((c,i)=>{const ready=c.accepted&&(c.kind==='kill'?c.p>=c.n:countItem(c.item)>=c.n);
    return `<div class="card"><div class="cd"><b>${bountyText(c)}</b><small>Reward: ${c.xp} XP · ${c.cr} cr</small><div class="cb">${!c.accepted?`<button class="buy" type="button" data-a="${i}">ACCEPT</button>`:ready?`<button class="buy" type="button" data-t="${i}">TURN IN</button>`:'<span class="lab">IN PROGRESS</span>'}<button class="buy alt" type="button" data-x="${i}">${c.accepted?'ABANDON':'SWAP'}</button></div></div></div>`;}).join('')}</div>`;
  b.querySelectorAll('[data-a]').forEach(e=>e.onclick=()=>{B[+e.dataset.a].accepted=true;sfx('click');openBoard(pool,zone,title);});
  b.querySelectorAll('[data-t]').forEach(e=>e.onclick=()=>{const c=B[+e.dataset.t];if(c.kind==='collect')removeItem(c.item,c.n);gainXP(c.xp);giveCr(c.cr);toast('Contract complete','gold');sfx('quest');B[+e.dataset.t]=genBounty(pool,zone);saveSoon();openBoard(pool,zone,title);});
  b.querySelectorAll('[data-x]').forEach(e=>e.onclick=()=>{B[+e.dataset.x]=genBounty(pool,zone);sfx('click');openBoard(pool,zone,title);});
  $('#xB').onclick=closePanel;padFocus(b,0);}

// ===== 40_people.js =====
/* ================= PEOPLE ================= */
// look: buildPerson spec · beh: stand / wander / route · vendor: shop tags · topics: extra conversation
function PPL(id,d){NPCS[id]=Object.assign({id},d);return NPCS[id];}
const nm=()=>G.look.name||'Surveyor';
/* ---- Meridian Station (Twilight Band) ---- */
PPL('okafor',{zone:'twilight',name:'Dele Okafor',role:'SECURITY CHIEF',look:{body:'soldier',tint:0x8a4a4a,visor:0xff6a4c,scale:1.06,belt:true},beh:{type:'stand'},
  greet:()=>qDone('m02_meridian')?`${nm()}. Keep your weapon charged and your eyes on the ridge.`:'Hold it right there.',
  barks:['Ridge patrol checks in every hour. Or it\'s supposed to.','Skitters are getting bolder.','Keep the lamp line lit and we\'ll be fine.'],
  topics:[{label:'What\'s the security situation?',text:'Skitters on the ridge, raiders on the dayward flats, and a signal nobody understands. Normal week.'},{label:'Tell me about Meridian.',text:'Two hundred and fourteen people in the only strip of this planet that won\'t kill you. We farm, we mine, we fix things. Halden runs the place. I keep it standing.'}]});
PPL('ines',{zone:'twilight',name:'Ines Marrow',role:'QUARTERMASTER',look:{body:'michelle',tint:0xc9a06a,apron:0x6a5a3a,accent:0xffc35a,belt:true},beh:{type:'stand'},
  vendor:{tags:['med','food','util','mat1','chip'],gear:[1,2],label:'Show me your stock.'},greet:'Meridian runs on what we can grow, dig up, or scrounge. What do you need?',
  barks:['Inventory doesn\'t count itself.','Glowcap extract is worth its weight in alloy right now.','If it\'s not nailed down, it\'s mine to sell.'],
  topics:[{label:'What is this place, exactly?',text:'Ossery b keeps one face to its star. Dayward the rock bakes past eighty degrees. Nightward, the air gets cold enough to snow out of the sky. We live in the strip between, where the sun sits on the horizon and never moves.'}]});
PPL('vey',{zone:'twilight',name:'Dr. Sela Vey',role:'XENOBIOLOGIST',look:{body:'michelle',tint:0xd8d4e4,coat:0xe9e6f0,accent:0x6ff2d6,held:'tablet',screen:4},beh:{type:'wander',r:4,pause:[4,9]},
  greet:'Every species out here evolved for a sky that never changes. Fascinating, isn\'t it?',barks:['The jellies are migrating early.','I need more samples. Always more samples.','The spire\'s signal is getting stronger. I\'ve plotted it.'],
  topics:[{label:'What do you know about the signal?',text:'It repeats every 11.2 days, which is this planet\'s orbit. It\'s structured, like a heartbeat with a message in it. I\'ve never found who sent it.'}]});
PPL('tamsin',{zone:'twilight',name:'Tamsin Reyes',role:'MECHANIC',look:{body:'soldier',tint:0xd88a4a,visor:0x8fd8ff,hat:'goggles',held:'tool',belt:true},beh:{type:'wander',r:3,pause:[3,7]},
  greet:()=>`Grease on your hands yet, ${nm()}? The workbench is yours if you need it.`,barks:['Who keeps parking rovers on my cables?','I can fix anything. Except Okafor\'s attitude.','That ship of yours. I\'d love to get my hands on her.'],
  services:[{label:'I need to use the workbench.',fn:()=>openWorkbench()}],topics:[{label:'How do upgrades work?',text:'Bring gear to any workbench. Every upgrade level makes it hit harder or protect better, up to plus five. Costs scrap and better materials the higher you go. Mods slot in for special tricks.'}]});
PPL('halden',{zone:'twilight',name:'Halden Roe',role:'ADMINISTRATOR',look:{body:'soldier',tint:0x5a6a8a,visor:0xffc35a,coat:0x3a4a6a},beh:{type:'route',pts:[[-16,-8],[-8,-16],[-4,-6]],pause:[6,12],speed:1.1},
  greet:'Meridian\'s administrator, for my sins. What can I do for you?',barks:['The water reclaimers need parts again.','Halcyon Lines owes us three supply runs.','We keep the lights on. That\'s the job.']});
PPL('bo',{zone:'twilight',name:'Bo Achebe',role:'THE LONG DUSK · CANTINA',look:{body:'soldier',tint:0x8a6a4a,visor:0xffa94a,apron:0x3a2a2a,scale:1.08},beh:{type:'stand'},vendor:{tags:['food','med','junkbuy'],label:'What\'s on the menu?'},
  greet:'Welcome to the Long Dusk. Best drinks in the twilight band. Only drinks in the twilight band.',barks:['Pull up a stool.','I\'ve heard every story twice.','Bring me something old and amber and I\'ll make it worth your while.']});
PPL('kit',{zone:'twilight',name:'Kit',role:'KID',look:{body:'michelle',tint:0x6a8aaa,scale:.74,hat:'cap'},beh:{type:'wander',r:10,pause:[2,5],speed:1.9},greet:'Are you really from space? Like, actually?',barks:['Wanna race?','I\'m gonna be a pilot!','My kite-drone flies higher than anyone\'s.']});
PPL('marisol',{zone:'twilight',name:'Marisol Dube',role:'GREENHOUSE KEEPER',look:{body:'michelle',tint:0x5a8a5a,apron:0x3a5a3a,hat:'wide'},beh:{type:'wander',r:3,pause:[4,8]},greet:'Mind the seedlings. Everything in here is someone\'s dinner.',barks:['The cap-trees are fruiting early.','Something\'s eating my lumen moss.']});
PPL('jory',{zone:'twilight',name:'Old Jory',role:'STORYTELLER',look:{body:'soldier',tint:0x8a8a8a,visor:0xa0a0a0,hat:'wide',scarf:0x6a3a3a},beh:{type:'stand'},greet:'Sit a while. I\'ve been here since before the lamps.',barks:['The old stones out there sing, if you listen.','I knew a pilot like you, once.','Nothing on this world is as new as it looks.']});
PPL('yusuf',{zone:'twilight',name:'Yusuf Lund',role:'GUARD',look:{body:'soldier',tint:0x6a6a7a,visor:0x6ff2d6,held:'rifle'},beh:{type:'route',pts:[[30,0],[0,32],[-30,0],[0,-32]],pause:[3,6],speed:1.4},greet:'Patrol\'s quiet. Mostly.',barks:['All clear on the south arc.','Lamp twelve is flickering again.','Eyes up.']});
PPL('lena',{zone:'twilight',name:'Lena Okoro',role:'MINER',look:{body:'michelle',tint:0x7a6a5a,hat:'goggles',pack:true,held:'tool'},beh:{type:'wander',r:6,pause:[3,8]},greet:'Ore doesn\'t dig itself.',barks:['My back hurts.','The good crystal is out past the ridge.']});
PPL('pell',{zone:'twilight',name:'Pell Ashgrove',role:'PROSPECTOR',look:{body:'soldier',tint:0x8a7a5a,visor:0xd9a55a,hat:'wide',scarf:0x6a3a2a},beh:{type:'stand'},vendor:{tags:['heat','util','mat1'],gear:[1,3],label:'Got anything to trade?'},
  greet:'Visitors! Don\'t get many out at the burn line.',barks:['Heat cracks the rock and brings the good ore up.','Mind your suit out on the flats.']});
/* ---- Kiln Hollow (Dayward Flats) ---- */
PPL('oduya',{zone:'dayward',name:'Grisha Oduya',role:'FOREMAN',look:{body:'soldier',tint:0xa0603a,visor:0xffa94a,hat:'goggles',belt:true,scale:1.1},beh:{type:'route',pts:[[-8,62],[10,70],[4,54]],pause:[5,10],speed:1.2},
  greet:'Kiln Hollow. We dig, we sweat, we don\'t complain. Much.',barks:['Pump three is down again.','Those Jackals cost me two haulers this month.','Water first, ore second, sleep never.']});
PPL('sable',{zone:'dayward',name:'Sable',role:'SCAVENGER TRADER',look:{body:'michelle',tint:0x4a3a3a,hat:'goggles',scarf:0xa0402a,pack:true},beh:{type:'stand'},vendor:{tags:['weapon','mod','chip'],gear:[2,3],label:'Show me the hardware.'},
  greet:'Everything here fell off a hauler. Honest.',barks:['Fresh salvage, barely bloodstained.','I buy anything that shoots.']});
PPL('amaru',{zone:'dayward',name:'Doc Amaru',role:'MEDIC',look:{body:'soldier',tint:0xd8d4e0,visor:0x6ff2d6,coat:0xe8e4ee},beh:{type:'wander',r:3,pause:[4,9]},vendor:{tags:['med','heat'],label:'I need supplies.'},greet:'Heatstroke, burns, Jackal bullets. I treat it all.',barks:['Drink water. All of it.','Next!'],
  services:[{label:'Patch me up, Doc.',fn:()=>{G.hp=PS.maxHp;FX.heal();toast('Doc Amaru patches you up.','teal');}}]});
PPL('nell',{zone:'dayward',name:'Nell Varo',role:'DEFECTOR',look:{body:'michelle',tint:0xb08a6a,scarf:0x8a5a3a,hat:'band'},beh:{type:'stand'},greet:'Don\'t look at me like that. I was a Jackal. Now I\'m not.',barks:['Voss doesn\'t forgive.','I know every trail in the flats.']});
PPL('vik',{zone:'dayward',name:'Vik Halloran',role:'PROSPECTOR',look:{body:'soldier',tint:0x8a7a6a,visor:0xffc35a,hat:'wide'},beh:{type:'wander',r:5,pause:[3,8]},greet:'You hear it too? Under the sand. Something big.',barks:['The Sink took my partner.','I\'ve got a map with an X on it.']});
PPL('clank',{zone:'dayward',name:'Clank',role:'MAINTENANCE DROID',look:{body:'robot',tint:0xc9a06a,tint2:0x5a4a3a},beh:{type:'wander',r:4,pause:[2,5]},greet:'GREETINGS. CLANK REPAIRS THINGS. CLANK ALSO TELLS JOKES. THEY ARE BAD.',barks:['BEEP. THAT WAS A JOKE.','SAND IN EVERY JOINT.'],services:[{label:'Can I use your workbench?',fn:()=>openWorkbench()}]});
/* ---- Cold Harbor (Nightward Expanse) ---- */
PPL('varga',{zone:'nightward',name:'Dr. Ilse Varga',role:'STATION LEAD',look:{body:'michelle',tint:0x5a7a9a,coat:0x3a5a7a,hat:'band',accent:0x8fd8ff},beh:{type:'wander',r:4,pause:[5,10]},greet:'Cold Harbor research station. We study the dark side, and it studies us back.',barks:['Our relay went silent three weeks ago.','Wear your liner. Always.']});
PPL('pavo',{zone:'nightward',name:'Pavo Kessler',role:'TECHNICIAN',look:{body:'soldier',tint:0x3a7a7a,visor:0x8fd8ff,held:'tool',belt:true},beh:{type:'wander',r:3,pause:[3,7]},greet:'Mind the heat lines. And the floor. And the cold.',barks:['The pipes are freezing again.','I could use more heat packs.'],services:[{label:'Can I use the workbench?',fn:()=>openWorkbench()}]});
PPL('siku',{zone:'nightward',name:'Siku',role:'RANGER',look:{body:'soldier',tint:0xd8e0e8,visor:0x8fd8ff,hat:'hood',coat:0xb8c8d8,held:'rifle'},beh:{type:'stand'},greet:'The Expanse doesn\'t care if you live. I do, a little.',barks:['Frost skitters hunt in packs.','My partner went north and didn\'t come back.']});
PPL('hale',{zone:'nightward',name:'Hale Brandt',role:'COOK',look:{body:'soldier',tint:0xb0a090,visor:0xffc35a,apron:0x8a7a6a},beh:{type:'stand'},vendor:{tags:['food','cold'],label:'What\'s cooking?'},greet:'Soup\'s hot. It\'s always hot. That\'s the point.',barks:['Frost-skitter stew, anyone?','Eat something. You look frozen.']});
PPL('index',{zone:'nightward',name:'Index',role:'ARCHIVIST DROID',look:{body:'robot',tint:0x5a8aba,tint2:0x2a3a4a},beh:{type:'wander',r:3,pause:[3,6]},greet:'Archive unit Index. My memory banks are... incomplete.',barks:['Recalibrating.','Data integrity: sixty-one percent.']});
/* ---- Anchorage Station ---- */
PPL('ostrander',{zone:'anchorage',name:'Kade Ostrander',role:'STATION MARSHAL',look:{body:'soldier',tint:0x2a3a5a,visor:0x8fd8ff,scale:1.08,belt:true},beh:{type:'stand'},greet:'Anchorage is a neutral port. I keep it that way.',barks:['Keep your weapon holstered on the promenade.','The Cohort has friends here. Too many.']});
PPL('sato',{zone:'anchorage',name:'Ama Sato',role:'DOCK CHIEF',look:{body:'michelle',tint:0xd8802a,hat:'cap',belt:true,held:'tablet',screen:5},beh:{type:'route',pts:[[-26,-48],[-14,-52],[-20,-40]],pause:[4,9],speed:1.3},greet:'Bay four is yours. Don\'t scratch my deck.',barks:['Who docked a hauler sideways?','Clearance codes, people.']});
PPL('arn',{zone:'anchorage',name:'Celeste Arn',role:'HALCYON LIAISON',look:{body:'michelle',tint:0xe8e0d0,coat:0xd8c8a0,accent:0xffd86a},beh:{type:'stand'},greet:'Halcyon Lines. How may I help you within the bounds of company policy?',barks:['The Director sends his regards.','Everything is above board. Documented, even.']});
PPL('dax',{zone:'anchorage',name:'Dax Mercer',role:'FIXER',look:{body:'soldier',tint:0x5a3a6a,visor:0xd36cf0,hat:'cap',scarf:0x2a1a3a},beh:{type:'stand'},vendor:{tags:['mod','weapon','util'],gear:[3,4],label:'What\'s for sale under the counter?'},greet:'You\'ve got the look of someone who needs a favor.',barks:['Everything has a price.','Information is my favorite currency.']});
PPL('oriel',{zone:'anchorage',name:'Sister Oriel',role:'THE CHOIR',look:{body:'michelle',tint:0x8a8a9a,coat:0x5a5a6a,halo:true,accent:0x8fffe0,hat:'hood'},beh:{type:'stand'},greet:'I knew you would come. You hear it too, don\'t you?',barks:['The song is louder in the dark.'],cond:()=>!qActive('m15_ashfall')&&!qDone('m14_drowned')});
PPL('vonn',{zone:'anchorage',name:'Vonn',role:'THE HALO · BARTENDER',look:{body:'robot',tint:0xd8b04a,tint2:0x2a2a30},beh:{type:'stand'},vendor:{tags:['food','med','junkbuy'],label:'One of everything, Vonn.'},greet:'WELCOME TO THE HALO. I HAVE BEEN TOLD I MIX A FINE NEBULA SOUR.',barks:['ANOTHER ROUND?','I HEAR EVERYTHING. I SAY NOTHING. MOSTLY.']});
PPL('prin',{zone:'anchorage',name:'Prin Halvorsen',role:'ARMORY',look:{body:'soldier',tint:0x7a7a82,visor:0xff6a5a},beh:{type:'stand'},vendor:{tags:['weapon'],gear:[3,4],label:'Show me your weapons.'},greet:'Licensed, registered and very, very effective.'});
PPL('hollis',{zone:'anchorage',name:'Hollis Kade',role:'OUTFITTER',look:{body:'michelle',tint:0x3a8a8a,coat:0x2a5a5a},beh:{type:'stand'},vendor:{tags:['gear','heat','cold'],gear:[3,4],label:'I need new gear.'},greet:'Suits, helmets, boots. Everything to keep space on the outside.'});
PPL('feng',{zone:'anchorage',name:'Dr. Mira Feng',role:'MEDBAY',look:{body:'michelle',tint:0xe8e8f0,coat:0xf0f0f8,accent:0x6ff2d6,held:'tablet',screen:4},beh:{type:'wander',r:3,pause:[4,8]},vendor:{tags:['med'],label:'I need medical supplies.'},greet:'Medbay. Sit, don\'t bleed on anything.',services:[{label:'Treat my wounds.',fn:()=>{G.hp=PS.maxHp;FX.heal();toast('Dr. Feng treats your wounds.','teal');}}]});
PPL('rook',{zone:'anchorage',name:'Rook Achterberg',role:'STATION ENGINEER',look:{body:'soldier',tint:0xd8702a,visor:0x8fd8ff,hat:'goggles',held:'tool'},beh:{type:'wander',r:5,pause:[3,7]},greet:'If it hums, I fixed it. If it sparks, I\'m about to.',services:[{label:'Can I use your workbench?',fn:()=>openWorkbench()}]});
PPL('pip',{zone:'anchorage',name:'Pip',role:'STATION KID',look:{body:'michelle',tint:0xd85a8a,scale:.72,hat:'band'},beh:{type:'wander',r:8,pause:[2,4],speed:1.9},greet:'Have you seen Biscuit? He\'s my cleaning droid and he runs away.'});
/* ---- Reedwater (Calder) ---- */
PPL('maru',{zone:'calder',name:'Elder Maru',role:'REEDWATER ELDER',look:{body:'michelle',tint:0x6a8a5a,coat:0x4a6a3a,hat:'wide',accent:0x8fffe0},beh:{type:'stand'},greet:'Welcome to Reedwater, star-traveler. Mind the planks; the lagoon is deep.',barks:['The tide sings tonight.','The old temple wakes when strangers come.']});
PPL('tavi',{zone:'calder',name:'Tavi',role:'FISHER',look:{body:'soldier',tint:0x3a7a6a,visor:0x8fffe0,hat:'band'},beh:{type:'wander',r:5,pause:[3,7]},greet:'Nets don\'t mend themselves. Neither do fishers.'});
PPL('ona',{zone:'calder',name:'Ona',role:'REED-WEAVER',look:{body:'michelle',tint:0xc9a04a,apron:0x8a6a2a},beh:{type:'stand'},vendor:{tags:['gear','food','mat3'],gear:[4,4],label:'Show me your weaving.'},greet:'Reedwoven cloth. Light, strong and it remembers its shape.'});
PPL('kesh',{zone:'calder',name:'Kesh',role:'HUNTER',look:{body:'soldier',tint:0x5a6a3a,visor:0xd8ff5a,hat:'hood',coat:0x4a5a2a,held:'rifle'},beh:{type:'stand'},greet:'The stalkers are hungry this season. So am I.'});
PPL('lumo',{zone:'calder',name:'Lumo',role:'TRADE DROID',look:{body:'robot',tint:0x3aa0a0,tint2:0x2a3a3a},beh:{type:'wander',r:3,pause:[3,6]},vendor:{tags:['weapon','mod','util'],gear:[4,5],label:'What do you have, Lumo?'},greet:'LUMO TRADES WITH EVERYONE. LUMO IS NEUTRAL. LUMO IS ALSO WATERPROOF.'});
/* ---- Ashfall ---- */
PPL('tem',{zone:'ashfall',name:'Brother Tem',role:'THE CHOIR',look:{body:'soldier',tint:0x6a6a7a,visor:0x8fffe0,coat:0x4a4a5a,halo:true},beh:{type:'stand'},greet:'You came. Oriel said you would. They took her into the camp.'});
PPL('ryn',{zone:'ashfall',name:'Ryn Castellan',role:'COHORT DESERTER',look:{body:'soldier',tint:0x5a5a62,visor:0xff4a5e,scarf:0xa0302a},beh:{type:'stand'},greet:'Put the gun down. I\'m done with the Cohort. Mostly.'});
PPL('oriel2',{zone:'ashfall',name:'Sister Oriel',role:'THE CHOIR',look:{body:'michelle',tint:0x8a8a9a,coat:0x5a5a6a,halo:true,accent:0x8fffe0,hat:'hood'},beh:{type:'stand'},greet:'The Ark is waking. I can feel it in my teeth.',cond:()=>!!G.flags.orielFree});
/* ---- the Vesper ---- */
// VESTA can only speak from her projector once it has a working emitter; until the Vesper flies, she talks about the repair
const VR_SYS=[['vr_hull','the hull breach'],['vr_coupling','the drive coupling'],['vr_coolant','the coolant line'],['vr_power','the power trunk'],['vr_nav','navigation']];
const vrLeft=()=>VR_SYS.filter(([f])=>!G.flags[f]).map(([,n])=>n);
const listAnd=a=>a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
PPL('vesta',{zone:'vesper',name:'VESTA',role:'SHIP INTELLIGENCE',look:{body:'xbot',tint:0x6ff2d6,tint2:0x1a4a44,scale:1.15},beh:{type:'stand'},
  canTalk:()=>!!(G.flags.vesperFixed||G.flags.vr_emitter),
  greet:()=>{if(G.flags.vesperFixed)return `Systems nominal, ${nm()}. Mostly. Where to?`;const l=vrLeft();
    if(l.length)return `It's good to see you properly, ${nm()}. The projector holds, but the ship doesn't yet: ${listAnd(l)} still need work. She isn't going anywhere until they're done.`;
    if(!G.flags.vr_reactor)return 'Every system is patched. The reactor is still cold, though. Restart it in engineering and we\'ll find out whether your welding holds.';
    return 'Reactor\'s up and everything is holding. Mostly. Let\'s not stay parked in a ditch.';},
  topics:[{label:'What still needs fixing?',cond:()=>!G.flags.vesperFixed,text:()=>{const l=vrLeft();return l.length?`Still broken: ${listAnd(l)}. Tamsin's list tells you where each part comes from, and the tracker has it too. Fit each part where the damage is and I'll check it.`:G.flags.vr_reactor?'Nothing aboard. Whatever is out there scratching at the hull, on the other hand…':'Nothing but the reactor itself. Engineering, the core housing. Gently.';}},
    {label:'How are you holding up?',text:()=>G.flags.vesperFixed?'Most of my memory is still missing, like yours. I\'m rebuilding it from the ship\'s logs, one sector at a time.':'The Kestrel\'s emitter is a strange fit, like wearing someone else\'s coat. And half my memory is still scattered across damaged storage. I\'ll manage.'},
    {label:'Can you plot us a course?',cond:()=>!G.flags.vesperFixed,text:()=>G.flags.vr_nav?'Navigation can see the stars now, but I won\'t plot a course for a ship that can\'t fly. Finish the repairs first.':'With what? The navigation core burned out in the crash. The star map is dark until it\'s replaced.'},
    {label:'Any advice?',text:()=>`You\'re level ${G.lvl}. Upgrade your gear at a workbench, keep your liner rated for where you\'re going, and spend your perk points. Also: jump over the shockwaves.`}],
  services:[{label:'Open the star map.',cond:()=>!!G.flags.vesperFixed,fn:()=>openStarMap()}]});

// ===== 41_main.js =====
/* ================= MAIN STORY: The Long Signal ================= */
const K=(id,name,desc,glyph)=>{KEYS[id]={name,kind:'key',desc,glyph};};
K('recorder','Vesper Flight Recorder','The black box from your ship. Its last hours are encrypted.','◉');
K('cutter','Plasma Cutter','Tamsin\'s cutter. Opens jammed hatches.','✂');
K('coupling','Flux Coupling','A rebuilt drive coupling from the Kiln Hollow foundry.','⚙');
K('navcore','Navigation Core','Salvaged from the wreck of the Kestrel Dawn.','✦');
K('sealant','Hull Sealant','Enough composite to seal the Vesper\'s hull breach.','▣');
K('spirekey','First Spire Key','A lens of Builder glass that pulses in time with the signal.','◈');
K('spirekey2','Second Spire Key','The drowned spire\'s key. Warm to the touch.','◈');
K('passcode','Records Passcode','Dax\'s stolen maintenance passcode for the records junction.','#');
const MEMS={
  crash:{title:'The fall',text:'Your hand closes on the pistol and something surfaces: a cockpit alarm, red light, and your own voice saying, “It\'s pulling us down. The signal is pulling us down.” Then it\'s gone.'},
  recorder:{title:'The contract',text:'A voice on the recorder, smooth and sure: “The Choir will pay double if you deliver the passenger to the spire alive.” The passenger, you realize, was you.'},
  ruins:{title:'The pattern',text:'The carvings match a pattern you know. You\'ve seen it before, etched into the hull of your own ship. You put it there yourself, copied from somewhere you can\'t remember.'},
  identity:{title:'The name',text:'Halcyon personnel file, sealed by order of Director Imre Vash: “Pilot of record, ISV Vesper. Resonant. Do not allow contact with Choir operatives. Disable vessel if necessary.” They disabled it. You were inside.'},
  drowned:{title:'The chorus',text:'Inside the drowned spire you hear it clearly for the first time: not a signal but a song, sung by many voices at once, and one of the voices is yours.'},
  reason:{title:'The reason',text:'You came to the Reach to find the Builders. They left a door open, and a key in your blood. The spires were never calling for help. They were calling for you.'},
};
function remember(id){if(G.mem.includes(id))return;G.mem.push(id);saveSoon();}
function showMemory(id,after){remember(id);say('Memory','FRAGMENT · '+MEMS[id].title.toUpperCase(),MEMS[id].text,[{label:'Hold on to it.',go:true,fn:()=>{closeDialog();after&&after();}}]);}

/* ---- Act I: Ossery b ---- */
Q({id:'m01_wake',type:'main',act:1,title:'Crash Site',zone:'twilight',summary:'You woke in the wreck of the Vesper with no memory. VESTA, your suit assistant, picked up a colony beacon dayward of the crash: a settlement called Meridian.',
  stages:[{text:'Salvage the survival case thrown from the wreck',obj:[{k:'use',id:'survival_locker',label:'Open the Vesper\'s survival case',zone:'twilight',x:-46.4,z:146}]},
    {text:'Head for the Meridian beacon',obj:[{k:'go',zone:'twilight',x:-30,z:84,r:20,label:'Cross the crevasse toward Meridian'}]},
    {text:'Reach Meridian Station',obj:[{k:'go',zone:'twilight',x:0,z:30,r:14,label:'Reach Meridian Station'}]}],
  reward:{xp:120}});
Q({id:'m02_meridian',type:'main',act:1,auto:true,req:()=>qDone('m01_wake'),title:'Strangers at Meridian',zone:'twilight',summary:'Meridian doesn\'t know who you are. Neither do you. Meet the people who run the station.',
  stages:[{text:'Talk to Security Chief Okafor',obj:[{k:'talk',npc:'okafor',label:'Talk to Dele Okafor',opt:'★ I walked out of that wreck.',text:()=>`You walked out of that wreck? We saw the fireball come down an hour ago. Your suit isn\'t in any registry, and you don\'t remember your own name? ${nm()}, then. Fine. Meridian takes in strays, as long as they pull their weight. Go see Halden Roe, our administrator, in the commons.`}]},
    {text:'Meet Administrator Halden Roe',obj:[{k:'talk',npc:'halden',label:'Talk to Halden Roe',opt:'★ Okafor sent me.',text:'So you\'re our mystery pilot. I\'ll be honest with you: we can\'t afford passengers. If you want a bunk and access to our workshop, earn it. Ines and Okafor both have work, and Tamsin always needs hands. Do a couple of jobs for the crew and we\'ll talk about your ship.'}]}],
  reward:{xp:80,cr:30,items:[{id:'medkit',q:2}]}});
Q({id:'m03_keep',type:'main',act:1,auto:true,req:()=>qDone('m02_meridian'),title:'Earning Your Keep',zone:'twilight',summary:'Halden wants proof you\'ll pull your weight. Finish two jobs for Meridian\'s crew. Look for people marked with an amber “!”.',
  stages:[{text:'Finish two jobs for the crew',obj:[{k:'flag',flag:'twoJobs',label:'Finish two jobs for Meridian\'s crew'}]},
    {text:'Report to Halden Roe',obj:[{k:'talk',npc:'halden',label:'Report to Halden Roe',opt:'★ I\'ve done my part.',text:'Word gets around. You\'re useful, and in a place like this that\'s as good as a birth certificate. The bunk in the commons is yours, and so is the workbench. Now, about that wreck: Tamsin thinks there\'s a flight recorder in it.'}]}],
  reward:{xp:150,cr:60,items:[{gen:'weapon',lvl:3,r:1}]}});
Bus.on('qdone',()=>{const jobs=['s_caps','s_skitters','s_jellies','s_scrap','s_patrol','s_supply','s_blight'].filter(qDone).length;if(jobs>=2&&!G.flags.twoJobs)setFlag('twoJobs');});
Q({id:'m04_recorder',type:'main',act:1,giver:'tamsin',req:()=>qDone('m03_keep'),title:'Ghost in the Machine',zone:'twilight',summary:'The Vesper\'s flight recorder might explain the crash. The cockpit hatch is jammed, so Tamsin lent you her plasma cutter.',
  ask:'Halden said you think my ship has a flight recorder.',offer:'Every ship that size carries one. Yours is behind a jammed cockpit hatch, from the look of the wreck. Take my plasma cutter. Cut the hatch, pull the recorder, and bring it to Dr. Vey. She\'s better with encryption than I am.',accept:'I\'ll cut it free.',
  stages:[{text:'Cut open the Vesper\'s cockpit',onStart:()=>give('cutter'),obj:[{k:'use',id:'cockpit_hatch',label:'Cut open the cockpit hatch',zone:'twilight',x:-71.9,z:156.1}]},
    {text:'Bring the recorder to Dr. Vey',obj:[{k:'deliver',npc:'vey',item:'recorder',n:1,label:'Bring the flight recorder to Dr. Vey',opt:'★ I found the flight recorder.',text:'Give it here. … Most of it\'s encrypted with a Choir cipher, of all things. But the navigation log is clean: you weren\'t flying to Meridian. You were flying to the Signal Spire, out on the nightward plain. And something pulled your ship down before you got there.'}]}],
  reward:{xp:240,cr:80},onComplete:()=>{showMemory('recorder');removeItem('cutter',1);}});
Q({id:'m05_relays',type:'main',act:1,giver:'vey',req:()=>qDone('m04_recorder'),title:'Triangulation',zone:'twilight',summary:'To find what pulled the Vesper down, Dr. Vey needs the signal triangulated. Three old survey relays have to come back online: one on the spinward ridge, one in Kiln Hollow on the Dayward Flats, and one at Cold Harbor on the Nightward Expanse.',
  ask:'How do we find what pulled my ship down?',offer:'Triangulation. Meridian put up three survey relays years ago. One on the ridge east of here, one at the Kiln Hollow mining town out on the Dayward Flats, one at the Cold Harbor research post on the Nightward Expanse. They\'ve all gone dark. Bring them back and I can pin the signal to a meter. You\'ll need good thermal gear for the flats and the Expanse.',accept:'I\'ll get the relays running.',
  stages:[{text:'Restart the ridge relay',obj:[{k:'use',id:'relay_ridge',label:'Restart the ridge relay',zone:'twilight',x:232,z:-70}]},
    {text:'Restart the Kiln Hollow and Cold Harbor relays',obj:[{k:'flag',flag:'relay_kiln',label:'Restart the Kiln Hollow relay (Dayward Flats)',zone:'dayward',at:{x:-205,z:-82}},{k:'flag',flag:'relay_cold',label:'Restart the Cold Harbor relay (Nightward Expanse)',zone:'nightward',at:{x:-190,z:40}}]},
    {text:'Report to Dr. Vey',obj:[{k:'talk',npc:'vey',label:'Report to Dr. Vey',opt:'★ All three relays are running.',text:'Look at this. The signal resolves to one point: the Signal Spire. But there\'s a second component, very faint, bouncing back from orbit. Something up there is answering it. First, though, the spire. Something guards it. A big one.'}]}],
  reward:{xp:400,cr:150,perk:1}});
Q({id:'m06_kiln',type:'main',act:1,auto:true,req:()=>qStage('m05_relays')>=1||qDone('m05_relays'),title:'Dust and Iron',zone:'dayward',summary:'The Kiln Hollow relay sits inside a Dust Jackal raider camp on the Dayward Flats. Foreman Oduya knows the way.',
  stages:[{text:'Travel to Kiln Hollow on the Dayward Flats',obj:[{k:'go',zone:'dayward',x:0,z:180,r:22,label:'Reach Kiln Hollow (south of Meridian)'}]},
    {text:'Talk to Foreman Oduya',obj:[{k:'talk',npc:'oduya',label:'Talk to Foreman Oduya',opt:'★ I need to reach your old survey relay.',text:'The relay? The Jackals built their whole camp around it. They use it to listen in on our haulers. Their chief, Mara Voss, sits right under it. You want it back, you go through her. Southwest of town, past the dunes. Bring heat gear.'}]},
    {text:'Defeat Mara Voss and retake the relay',obj:[{k:'killId',id:'voss',label:'Defeat Mara Voss, the Jackal chief',zone:'dayward',at:{x:-190,z:-70}}]},
    {text:'Restart the Kiln Hollow relay',obj:[{k:'use',id:'relay_kiln',label:'Restart the relay in the Jackal camp',zone:'dayward',x:-205,z:-82}]},
    {text:'Tell Oduya the Jackals are broken',obj:[{k:'talk',npc:'oduya',label:'Report to Foreman Oduya',opt:'★ Voss is finished.',text:'Voss is gone? Then my haulers run again tomorrow. Kiln Hollow owes you. If you ever need foundry work, that\'s a debt I\'ll pay.'}]}],
  reward:{xp:600,cr:250,items:[{gen:'weapon',lvl:8,r:2}]}});
Bus.on('use',id=>{if(id==='relay_kiln')setFlag('relay_kiln');if(id==='relay_cold')setFlag('relay_cold');});
Q({id:'m07_cold',type:'main',act:1,auto:true,req:()=>qStage('m05_relays')>=1||qDone('m05_relays'),title:'Cold Harbor',zone:'nightward',summary:'The Cold Harbor research station has gone quiet. Its relay is in the ice caves.',
  stages:[{text:'Travel to Cold Harbor on the Nightward Expanse',obj:[{k:'go',zone:'nightward',x:30,z:-190,r:22,label:'Reach Cold Harbor (north of Meridian)'}]},
    {text:'Talk to Dr. Ilse Varga',obj:[{k:'talk',npc:'varga',label:'Talk to Dr. Ilse Varga',opt:'★ Meridian sent me about your relay.',text:'Meridian remembered we exist? Our relay is in the ice caves to the west. A brood of frost skitters moved in around it. My people won\'t go near. You\'ll need a good cold liner, the caves drop past minus forty.'}]},
    {text:'Clear the ice caves',obj:[{k:'killId',id:'cavebrood',label:'Kill the Brood Mother in the ice caves',zone:'nightward',at:{x:-180,z:30}}]},
    {text:'Restart the cave relay',obj:[{k:'use',id:'relay_cold',label:'Restart the cave relay',zone:'nightward',x:-190,z:40}]},
    {text:'Report to Dr. Varga',obj:[{k:'talk',npc:'varga',label:'Report to Dr. Varga',opt:'★ Your relay is back.',text:'I can hear the station again. And something else, out north: the spire is louder than it\'s ever been. Whatever you did, it noticed.'}]}],
  reward:{xp:600,cr:250,items:[{gen:'gear',lvl:9,r:2}]}});
Q({id:'m08_spire',type:'main',act:1,giver:'vey',req:()=>qDone('m05_relays'),title:'The First Spire',zone:'nightward',summary:'The signal comes from the Signal Spire on the far Nightward Expanse. A guardian circles its base.',
  ask:'Where exactly is the spire?',offer:'Due north, past Cold Harbor, where the sun drops below the horizon. Whatever guards it is big, and it moves like it has been waiting a very long time. Take everything you\'ve got.',accept:'I\'m going to the spire.',
  stages:[{text:'Reach the Signal Spire',obj:[{k:'go',zone:'nightward',x:0,z:212,r:20,label:'Reach the Signal Spire'}]},
    {text:'Silence the Hollow Warden',obj:[{k:'killId',id:'warden',label:'Defeat the Hollow Warden',zone:'nightward',at:{x:0,z:200}}]},
    {text:'Activate the spire',obj:[{k:'use',id:'spire1',label:'Touch the Signal Spire',zone:'nightward',x:0,z:224}]},
    {text:'Tell Dr. Vey what you saw',obj:[{k:'talk',npc:'vey',label:'Tell Dr. Vey about the spire',opt:'★ The spire woke up.',text:'An aurora on the dark side, and the orbital echo just turned into a beacon. It\'s coming from Anchorage, the Halcyon station in orbit. Your ship was going there after the spire. If we want answers, someone has to fly up and ask. And that means the Vesper has to fly.'}]}],
  reward:{xp:900,cr:300,items:[{id:'spirekey'}],perk:1},onComplete:()=>{}});
// Grounded: the repair. Survey the wreck system by system, report to Tamsin, then gather and fit the parts for six systems
// yourself (each one visibly recovers aboard), restart the reactor, drive off what its noise brings, and lift her out of the furrow.
K('hullplate','Hull Plate','A torn plate of the Vesper\'s own hull, salvaged from the crash debris. Still good metal.','▤');
K('coolant','Cryo-coolant Cell','Dr. Varga\'s coolant, cold enough to frost the casing.','❄');
K('wiring','Superconductor Wiring','A spool of Builder-era superconductor from the ruins. Still flawless.','≋');
K('emitter','Holo Emitter','The Kestrel Dawn\'s projector emitter. VESTA should be able to use it.','◎');
const GR={ASSESS:0,REPORT:1,REPAIR:2,REACTOR:3,DEFEND:4,LIFT:5,FLY:6};
Q({id:'m09_grounded',type:'main',act:1,giver:'tamsin',req:()=>qDone('m08_spire'),title:'Grounded',zone:'twilight',summary:'The Vesper took a beating coming down. Find out exactly what is broken, gather parts from across the Reach, fit them yourself, and get her back in the air.',
  ask:'Can the Vesper fly again?',offer:'Maybe. She came down hard, and I won\'t guess what\'s broken from out here. Climb aboard and run diagnostics on everything: navigation, the drive core, the power trunk, the hull. You\'ll have to force a couple of doors. Come back and tell me what you find, and I\'ll work out a parts list.',accept:'I\'ll survey the damage.',
  stages:[{text:'Survey the damage aboard the Vesper',obj:[
      {k:'use',id:'vs_diag_nav',label:'Run diagnostics on the navigation terminal (bridge)',zone:'vesper',x:-.9,z:14.1},
      {k:'use',id:'vs_diag_core',label:'Inspect the drive core (engineering)',zone:'vesper',x:-1.7,z:-11.2},
      {k:'use',id:'vs_diag_power',label:'Trace the power fault (crew quarters)',zone:'vesper',x:4.1,z:6},
      {k:'use',id:'vs_diag_hull',label:'Inspect the hull breach (cargo bay)',zone:'vesper',x:4.1,z:-4}]},
    {text:'Tell Tamsin what the Vesper needs',obj:[{k:'talk',npc:'tamsin',label:'Report the damage to Tamsin',opt:'★ I surveyed the Vesper.',text:'That\'s a long list. All right. The hull: salvage plates from your own debris field and I\'ll mix sealant to weld them in. The drive coupling is cracked, so Oduya\'s foundry will have to cast a new one. The coolant line burst, and Dr. Varga at Cold Harbor keeps cryo-coolant. The power trunk is fried: the Builder ruins are full of superconductor wiring nobody\'s touched in a thousand years. Navigation needs the Kestrel Dawn\'s core, and pull her holo emitter while you\'re in there so VESTA has a face again. Fit each part as you get it. I\'ll talk you through it over comms.'}]},
    {text:'Repair the Vesper, system by system',obj:[
      {k:'flag',flag:'vr_hull',item:'hullplate',n:4,label:'Hull: salvage 4 plates from the crash debris, weld them in with Tamsin\'s sealant (cargo bay)',zone:'twilight',at:{x:-48,z:122}},
      {k:'flag',flag:'vr_coupling',item:'coupling',n:1,label:'Drive: fit a flux coupling from Oduya\'s foundry (Kiln Hollow)',zone:'dayward',at:{x:0,z:180}},
      {k:'flag',flag:'vr_coolant',item:'coolant',n:1,label:'Coolant: replace the burst line with Dr. Varga\'s cryo-coolant (Cold Harbor)',zone:'nightward',at:{x:30,z:-194}},
      {k:'flag',flag:'vr_power',item:'wiring',n:1,label:'Power: rewire the trunk with superconductor wiring (Builder Ruins)',zone:'twilight',at:{x:-256,z:-136}},
      {k:'flag',flag:'vr_nav',item:'navcore',n:1,label:'Navigation: install the Kestrel Dawn\'s core (Nightward Expanse)',zone:'nightward',at:{x:198,z:112}},
      {k:'flag',flag:'vr_emitter',item:'emitter',n:1,label:'VESTA: replace her projector\'s emitter (Kestrel Dawn wreck)',zone:'nightward',at:{x:183,z:116}}]},
    {text:'Restart the reactor',obj:[{k:'use',id:'vs_reactor',label:'Restart the Vesper\'s reactor (engineering)',zone:'vesper',x:-1.7,z:-11.2}]},
    {text:'Drive off the skitters drawn by the reactor',obj:[{k:'kill',type:'skitter',n:6,zone:'twilight',label:'Skitters driven off around the Vesper',at:{x:-46,z:138}}]},
    {text:'Lift off with VESTA',obj:[{k:'talk',npc:'vesta',label:'Tell VESTA to take her up (Vesper bridge)',opt:'★ Let\'s get her out of this ditch.',text:'Reactor stable. Hull holding. Navigation\'s found the stars again, and so have I. Hold on to something. … There. Meridian\'s pad is clear, and Tamsin is waving at us with both arms.'}]},
    {text:'Fly the Vesper to Anchorage',obj:[{k:'go',zone:'anchorage',x:0,z:-44,r:14,label:'Fly to Anchorage station (Vesper bridge, star map)'}]}],
  reward:{xp:1400,cr:300},onComplete:()=>{}});
Bus.on('qstart',id=>{if(id==='m09_grounded')G.q[id].v2=1;});
Bus.on('qstage',(id,s)=>{if(id==='m09_grounded'&&s===GR.FLY){setFlag('vesperFixed');G.shipAt='twilight';
  setTimeout(()=>{closeDialog();enterZone('twilight','ship',{kicker:'LIFT-OFF',text:'The Vesper tears free of the furrow, climbs over the crash site and settles on Meridian\'s landing pad.'});},500);}
  if(id==='m09_grounded'&&s===GR.DEFEND)setTimeout(()=>vesta('Reactor\'s live, and loud. Something outside heard it. Lots of somethings. Skitters, coming for the hull.'),900);});
// saves from before the longer repair: put an active repair back at the survey (parts already held still count), or at the flight if she already flies
function migrateGrounded(){const q=G.q.m09_grounded;if(!q||q.v2)return;q.v2=1;if(q.st!=='active')return;q.s=G.flags.vesperFixed?GR.FLY:GR.ASSESS;q.p=[];}
// side jobs that produce the repair parts
Q({id:'s_coupling',type:'side',giver:'oduya',req:()=>qActive('m09_grounded')&&!countItem('coupling')&&!G.flags.vr_coupling,title:'Foundry Debt',zone:'dayward',summary:'Oduya will cast a flux coupling if you bring the metal: 6 alloy plates and 3 power cells.',
  ask:'★ I need a flux coupling cast.',offer:'A flux coupling? For a starship? You want my foundry to do a starship part. … For you, fine. Bring me six alloy plates and three power cells and I\'ll pour it tonight.',accept:'I\'ll bring the metal.',
  stages:[{text:'Bring metal for the coupling',obj:[{k:'deliver',npc:'oduya',item:'alloy',n:6,label:'Bring 6 alloy plates to Oduya',opt:'Here\'s the alloy.',text:'Good plate.'},{k:'deliver',npc:'oduya',item:'powercell',n:3,label:'Bring 3 power cells to Oduya',opt:'Here are the power cells.',text:'Charged, too.'}]}],
  reward:{xp:150,items:[{id:'coupling'}]}});
Q({id:'s_sealant',type:'side',giver:'tamsin',req:()=>qActive('m09_grounded')&&!countItem('sealant')&&!G.flags.vr_hull,title:'Sealing the Breach',zone:'twilight',summary:'Tamsin can mix hull sealant from 6 polymer sheets and 6 skitter chitin.',
  ask:'★ About that hull sealant…',offer:'Six polymer sheets and six skitter chitin. The chitin is the secret. Light, flexible, nearly airtight once it sets.',accept:'I\'ll gather them.',
  stages:[{text:'Bring materials for the sealant',obj:[{k:'deliver',npc:'tamsin',item:'polymer',n:6,label:'Bring 6 polymer sheets',opt:'Here\'s the polymer.'},{k:'deliver',npc:'tamsin',item:'chitin',n:6,label:'Bring 6 skitter chitin',opt:'Here\'s the chitin.'}]}],
  reward:{xp:120,items:[{id:'sealant'}]}});

Q({id:'s_coolant',type:'side',giver:'varga',req:()=>qActive('m09_grounded')&&qStage('m09_grounded')>=GR.REPAIR&&!countItem('coolant')&&!G.flags.vr_coolant,title:'Cold Storage',zone:'nightward',summary:'Dr. Varga will part with a cryo-coolant cell if you clear the frost skitters chewing through Cold Harbor\'s coolant lines.',
  ask:'★ I need cryo-coolant for my ship.',offer:'Coolant I have. What I don\'t have is a working perimeter: frost skitters have been gnawing the lines out on the ice, and every cell I send out there comes back empty. Thin them out, five or so, and I\'ll fill you a cell myself.',accept:'I\'ll deal with the skitters.',
  stages:[{text:'Clear the frost skitters on the ice',obj:[{k:'kill',type:'frost',n:5,zone:'nightward',label:'Frost skitters cleared'}]},
    {text:'Collect the coolant from Dr. Varga',obj:[{k:'talk',npc:'varga',label:'Collect the coolant from Dr. Varga',opt:'★ Your lines are clear.',text:'So I see. One cryo-coolant cell, filled to the seal. Keep it upright and don\'t lick the casing.'}]}],
  reward:{xp:180,items:[{id:'coolant'}]}});

/* ---- Act II: Anchorage ---- */
Q({id:'m10_anchorage',type:'main',act:2,auto:true,req:()=>qDone('m09_grounded'),title:'Neutral Ground',zone:'anchorage',summary:'Anchorage security flagged the Vesper as stolen the moment you docked. Find out who filed the report.',
  stages:[{text:'Talk to Marshal Ostrander',obj:[{k:'talk',npc:'ostrander',label:'Talk to Marshal Ostrander',opt:'★ Why was my ship flagged?',text:'Because Halcyon Lines says the Vesper is stolen and its pilot is dead. You look healthy for a dead pilot. I don\'t like Halcyon telling me how to run my station, so I\'ll give you a day. Find out who filed the report and why. Start with the dock chief.'}]},
    {text:'Ask Dock Chief Sato about the report',obj:[{k:'talk',npc:'sato',label:'Talk to Dock Chief Ama Sato',opt:'★ Who flagged the Vesper?',text:'Celeste Arn, the Halcyon liaison, filed it herself. Same morning your ship went down, which is a neat trick: she reported it stolen before anyone knew it had crashed.'}]},
    {text:'Confront Celeste Arn',obj:[{k:'talk',npc:'arn',label:'Talk to Celeste Arn',opt:'★ You reported my ship stolen before it crashed.',text:'I\'m sure I don\'t know what you mean. All Halcyon personnel files are sealed by order of the Director. If you\'d like to request access, the form takes six to eight weeks. Have a lovely day.'}]},
    {text:'Find another way into the records',obj:[{k:'talk',npc:'dax',label:'Talk to Dax Mercer, the fixer',opt:'★ I need into Halcyon\'s sealed records.',text:'Sealed records. Expensive. Lucky for you, I hate Halcyon more than I like money. Here\'s a maintenance passcode. The records junction is deep in the maintenance tunnels behind the medbay. The tunnels are full of drones that went feral. Mind your head.'}]}],
  reward:{xp:600,cr:200,items:[{id:'passcode'}]}});
Q({id:'m11_records',type:'main',act:2,auto:true,req:()=>qDone('m10_anchorage'),title:'Sealed Records',zone:'anchorage',summary:'Dax\'s passcode opens the records junction in Anchorage\'s maintenance tunnels, behind the medbay.',
  stages:[{text:'Fight through the maintenance tunnels',obj:[{k:'kill',types:['drone','sentinel'],n:6,label:'Clear rogue machines in the tunnels',zone:'anchorage',at:{x:-62,z:-42}}]},
    {text:'Open your sealed file',obj:[{k:'use',id:'records_terminal',label:'Use the records junction terminal',zone:'anchorage',x:-72,z:-58}]},
    {text:'Tell Marshal Ostrander the truth',obj:[{k:'talk',npc:'ostrander',label:'Report to Marshal Ostrander',opt:'★ Halcyon disabled my ship on purpose.',text:'Vash. I should have known. Your flag is cleared, as of now, on my authority. But listen: the Gray Cohort has people on this station, and they work for whoever pays. If Vash wants you dead, they\'ll try. There\'s someone from the Choir in the hab ring asking about you. Talk to her before they do.'}]}],
  reward:{xp:800,cr:250,perk:1,items:[{gen:'gear',lvl:13,r:2}]},onComplete:()=>{}});
Bus.on('use',id=>{if(id==='records_terminal')showMemory('identity');});
Q({id:'m12_choir',type:'main',act:2,auto:true,req:()=>qDone('m11_records'),title:'The Choir',zone:'anchorage',summary:'A member of the Choir is waiting for you in Anchorage\'s hab ring.',
  stages:[{text:'Find the Choir contact in the hab ring',obj:[{k:'talk',npc:'oriel',label:'Talk to Sister Oriel in the hab ring',opt:'★ You were looking for me.',text:'You hear it too. The song. You carry what the Choir calls resonance; the spires answer to you. That\'s why we hired your ship, and why Vash wants you dead. He wants the Builders\' Ark for Halcyon. The second spire is on Calder, in the drowned temple. Before he finds it… Wait. Did you hear that?'}]},
    {text:'Survive the Cohort ambush',obj:[{k:'kill',types:['merc','breacher'],n:5,label:'Defeat the Gray Cohort ambush',zone:'anchorage',at:{x:0,z:82}}]},
    {text:'Talk to Sister Oriel',obj:[{k:'talk',npc:'oriel',label:'Talk to Sister Oriel',opt:'★ They\'re down. Are you all right?',text:'Thanks to you. I\'m adding Calder\'s coordinates to your ship\'s star map. Reedwater, the fishing village, will help you if you show them respect. I\'ll follow when I can.'}]}],
  reward:{xp:900,cr:300},onComplete:()=>{setFlag('mapCalder');toast('Calder added to the Vesper\'s star map.','gold');}});
Bus.on('qstage',(id,s)=>{if(id==='m12_choir'&&s===1&&W.id==='anchorage'){const e=spawnGroup('merc',0,84,7,4,15,{respawn:Infinity});spawnGroup('breacher',4,88,4,1,15,{respawn:Infinity});for(const x of e)x.provoked=20;}});

/* ---- Act III: Calder ---- */
Q({id:'m13_reedwater',type:'main',act:3,auto:true,req:()=>qDone('m12_choir'),title:'Reedwater',zone:'calder',summary:'Fly to Calder and ask the people of Reedwater for passage to the drowned temple.',
  stages:[{text:'Fly to Calder',obj:[{k:'go',zone:'calder',x:0,z:-30,r:20,label:'Fly to Calder (Vesper star map)'}]},
    {text:'Talk to Elder Maru',obj:[{k:'talk',npc:'maru',label:'Talk to Elder Maru',opt:'★ The Choir sent me. I need to reach the drowned temple.',text:'The temple is past the Shoal Path, and the stalkers have been hunting our nets. Drive them back from the eastern islands and I\'ll show you the path the old way: stone to stone, above the water.'}]},
    {text:'Drive off the reed stalkers',obj:[{k:'kill',type:'stalker',n:6,label:'Drive off reed stalkers',zone:'calder',at:{x:130,z:90}}]},
    {text:'Return to Elder Maru',obj:[{k:'talk',npc:'maru',label:'Return to Elder Maru',opt:'★ The stalkers won\'t bother your nets.',text:'Then the Shoal Path is yours. Follow the standing stones north, and jump where the water is deep. Light the three pylons in the temple and the spire will open.'}]}],
  reward:{xp:1000,cr:300,items:[{gen:'weapon',lvl:17,r:2}]}});
Q({id:'m14_drowned',type:'main',act:3,auto:true,req:()=>qDone('m13_reedwater'),title:'The Drowned Spire',zone:'calder',summary:'Cross the Shoal Path to the drowned temple, light its three pylons and open the second spire.',
  stages:[{text:'Cross the Shoal Path to the temple',obj:[{k:'go',zone:'calder',x:90,z:250,r:22,label:'Reach the drowned temple'}]},
    {text:'Light the three resonance pylons',obj:[{k:'use',id:'pylon1',label:'Light the west pylon',zone:'calder',x:62,z:262},{k:'use',id:'pylon2',label:'Light the east pylon',zone:'calder',x:118,z:262},{k:'use',id:'pylon3',label:'Light the north pylon',zone:'calder',x:90,z:292}]},
    {text:'Defeat the Glass Leviathan',obj:[{k:'killId',id:'leviathan',label:'Defeat the Glass Leviathan',zone:'calder',at:{x:90,z:265}}]},
    {text:'Open the drowned spire',obj:[{k:'use',id:'spire2',label:'Touch the drowned spire',zone:'calder',x:90,z:272}]},
    {text:'Return to Reedwater',obj:[{k:'talk',npc:'maru',label:'Tell Elder Maru what happened',opt:'★ The second spire is open.',text:'A Halcyon ship came while you were inside. Men in gray armor. They took the Choir woman, Oriel, who arrived this morning looking for you. They said to tell you: “Ashfall. Come alone.” I\'m sorry. I have marked the world on your star map.'}]}],
  reward:{xp:1400,cr:400,items:[{id:'spirekey2'}],perk:1},onComplete:()=>{setFlag('mapAshfall');toast('Ashfall added to the Vesper\'s star map.','gold');}});
Bus.on('use',id=>{if(id==='spire2')showMemory('drowned');});

/* ---- Act IV: Ashfall ---- */
Q({id:'m15_ashfall',type:'main',act:4,auto:true,req:()=>qDone('m14_drowned'),title:'Ashfall',zone:'ashfall',summary:'The Gray Cohort took Sister Oriel to Ashfall, where the Builders\' Ark lies half-buried in ash.',
  stages:[{text:'Fly to Ashfall',obj:[{k:'go',zone:'ashfall',x:0,z:-250,r:20,label:'Fly to Ashfall (Vesper star map)'}]},
    {text:'Find the Choir survivors',obj:[{k:'talk',npc:'tem',label:'Talk to Brother Tem',opt:'★ Where is Oriel?',text:'In the Cohort camp to the east, in a cargo cell. Commander Rusk holds the camp, and he is very good at his job. Kill him, and his people will scatter. Then the Ark. Vash is already inside, trying to wake it.'}]},
    {text:'Defeat Commander Rusk',obj:[{k:'killId',id:'rusk',label:'Defeat Commander Rusk',zone:'ashfall',at:{x:120,z:-40}}]},
    {text:'Free Sister Oriel',obj:[{k:'use',id:'oriel_cell',label:'Open the cargo cell',zone:'ashfall',x:132,z:-28}]}],
  reward:{xp:1600,cr:500,items:[{gen:'weapon',lvl:22,r:3}]},onComplete:()=>{}});
Bus.on('use',id=>{if(id==='oriel_cell'){setFlag('orielFree');say('Sister Oriel','THE CHOIR','You came. Vash went into the Ark an hour ago with both of the other keys\' readings. He can\'t wake it without you, but he can break it trying. I\'ll meet you at the Ark gate.',[bye('Let\'s finish this.')]);}});
Q({id:'m16_ark',type:'main',act:4,auto:true,req:()=>qDone('m15_ashfall'),title:'The Ark',zone:'ashfall',summary:'Imre Vash is inside the Builders\' Ark. Stop him, and decide what to do with what the Builders left behind.',
  stages:[{text:'Reach the Ark gate',obj:[{k:'go',zone:'ashfall',x:0,z:118,r:14,label:'Reach the Ark gate'}]},
    {text:'Open the Ark with the spire keys',obj:[{k:'use',id:'ark_gate',label:'Open the Ark gate with both spire keys',zone:'ashfall',x:0,z:124}]},
    {text:'Stop Imre Vash',obj:[{k:'killId',id:'vash',label:'Defeat Vash in the Ark Shell',zone:'ashfall',at:{x:0,z:200}}]},
    {text:'Decide the Ark\'s fate',obj:[{k:'use',id:'ark_heart',label:'Approach the Ark\'s heart',zone:'ashfall',x:0,z:214}]}],
  reward:{xp:3000,cr:1000,items:[{id:'edge'}],perk:2,unlock:['halo']}});
function arkChoice(){showMemory('reason',()=>say('The Heart of the Ark','THE BUILDERS','The heart opens like an eye. Inside is a door to somewhere else, and a choice. Wake the Ark and the Builders\' song spreads across the Reach, lighting every spire. Seal it and their knowledge sleeps until someone wiser comes.',[
  {label:'Wake the Ark.',go:true,fn:()=>{setFlag('arkWoke');ending(true);}},{label:'Seal the Ark.',fn:()=>{setFlag('arkSealed');ending(false);}}]));}
function ending(woke){G.flags.ended=true;skyMat.uniforms.aurora.value=1;sfx('warp');
  say('Epilogue','THE LONG SIGNAL',woke?`The spires sing. On Ossery b, Meridian wakes to an aurora that does not fade. On Calder the drowned temple rises from the lagoon. Anchorage goes quiet as every screen on the station fills with the same impossible map. Sister Oriel finds you on the Vesper\'s bridge and says nothing for a long time. Then: “They\'re coming back, aren\'t they?” Somewhere out past the Reach, something answers.`:`The heart closes. The spires dim one by one, and the song settles into a hum you will hear for the rest of your life. Vash\'s ambitions die with him in the ash. Oriel takes the keys to the Choir to guard. Halcyon Lines quietly writes off Ashfall as a loss. You fly the Vesper out of the Reach with your name, your memories and a door that someone, someday, will open again.`,
    [{label:'The end. (You can keep exploring, finishing side jobs and contracts.)',go:true,fn:()=>{closeDialog();showBanner('THE END','Thank you for playing Tidelock');saveSoon();}}]);}
Bus.on('use',id=>{if(id==='ark_heart')setTimeout(arkChoice,200);});

// ===== 42_side.js =====
/* ================= SIDE JOBS ================= */
// quest-only interaction points stay hidden until a task needs them
function needsUse(id){for(const q in G.q){const s=G.q[q];if(s.st!=='active')continue;const st=QUESTS[q].stages[s.s];if(st.obj.some((o,i)=>o.k==='use'&&o.id===id&&!s.p[i]))return true;}return false;}
K('package','Sealed Package','Dax\'s delivery for Sable. Do not shake it.','▣');
K('recipe','Bo\'s Recipe Card','“Long Dusk Stew.” Most of it is crossed out and rewritten.','✎');
K('satchel','Lena\'s Ore Satchel','Heavy, and full of very ordinary rocks. To Lena they are not ordinary.','◆');
K('sd7core','SD-7 Memory Core','The survey drone\'s memory, still warm.','◉');
K('medal','Varo Family Medal','A dented service medal engraved “J. Varo”.','✪');
K('kite','Kit\'s Kite','A hand-stitched kite of polymer and wire.','◇');
K('biscuit','Biscuit','A cleaning droid the size of a loaf of bread. It beeps when held.','●');
K('lastwords','Choir Memorial Stone','A small stone with a name carved for each of the Choir dead.','◈');
const S=(d)=>Q(Object.assign({type:'side'},d));
const gearR=(lvl,r=1,gen='gear')=>({gen,lvl,r});

/* ---- Twilight Band · Meridian ---- */
S({id:'s_caps',giver:'ines',zone:'twilight',title:'Glowcap Harvest',summary:'Ines needs glowcaps for Meridian\'s medkits. They grow in the shade under the mushroom groves.',
  ask:'Need anything gathered?',offer:'Glowcaps. The big blue mushrooms in the groves west of town. We grind them into the gel in every medkit we make. Eight should keep the clinic going for a week.',accept:'Eight glowcaps, coming up.',
  stages:[{text:'Gather glowcaps',obj:[{k:'deliver',npc:'ines',item:'glowcap',n:8,label:'Bring 8 glowcaps to Ines',opt:'Here are your glowcaps.',text:'Nice and fresh. Here, take some of the finished product.',at:{x:-150,z:-20},zone:'twilight'}]}],
  reward:{xp:120,cr:40,items:[{id:'medkit',q:3}]}});
S({id:'s_skitters',giver:'okafor',zone:'twilight',title:'Ridge Patrol',summary:'Skitters have been probing Meridian\'s east side. Okafor wants their numbers thinned.',
  ask:'Any security work?',offer:'Skitters are nesting along the spinward ridge east of town and getting braver every night. Thin them out. Eight should send the message.',accept:'I\'ll handle the skitters.',
  stages:[{text:'Thin the skitter packs',obj:[{k:'kill',type:'skitter',n:8,label:'Skitters defeated',zone:'twilight',at:{x:150,z:-30}}]},
    {text:'Report to Okafor',obj:[{k:'talk',npc:'okafor',label:'Report to Okafor',opt:'The ridge is quieter.',text:'I heard. Patrol says the ridge went quiet an hour ago. That\'s good work. Take this. It\'s better than what you walked in with.'}]}],
  reward:{xp:160,cr:50,items:[gearR(3,1)]}});
S({id:'s_jellies',giver:'vey',zone:'twilight',title:'Drifting Lights',summary:'Dr. Vey wants scans of the floating jelly colonies in the meadow west-spinward of the crash site.',
  ask:'Need help with your research?',offer:'The sky jellies in the western meadow are doing something new: clustering, pulsing in sync. I need close scans of three colonies. Get within arm\'s reach and let your suit do the rest. They\'re harmless. Mostly.',accept:'I\'ll scan them.',
  stages:[{text:'Scan three jelly colonies',obj:[{k:'use',id:'jelly1',label:'Scan the first jelly colony',zone:'twilight',x:-205,z:110},{k:'use',id:'jelly2',label:'Scan the second jelly colony',zone:'twilight',x:-225,z:140},{k:'use',id:'jelly3',label:'Scan the third jelly colony',zone:'twilight',x:-182,z:146}]},
    {text:'Bring the scans to Dr. Vey',obj:[{k:'talk',npc:'vey',label:'Bring the scans to Dr. Vey',opt:'I have your jelly scans.',text:'They\'re pulsing at the same frequency as the signal. All of them. Life on this planet has been listening to it far longer than we have. Here, I modified this for you. It should help in a fight.'}]}],
  reward:{xp:180,cr:40,items:[{id:'capacitor'}]}});
S({id:'s_scrap',giver:'tamsin',zone:'twilight',title:'Spare Parts',summary:'Tamsin\'s workshop is out of scrap and wiring. The wrecks around Meridian are full of both.',
  ask:'Need parts for the workshop?',offer:'Always. Scrap metal and wiring, as much as you can carry. Ten scrap and four bundles of wiring and I\'ll teach you how to make that pistol of yours hit harder.',accept:'I\'ll scavenge some.',
  stages:[{text:'Bring scrap and wiring',obj:[{k:'deliver',npc:'tamsin',item:'scrap',n:10,label:'Bring 10 scrap metal',opt:'Here\'s the scrap.',text:'Perfect.'},{k:'deliver',npc:'tamsin',item:'wiring',n:4,label:'Bring 4 wiring bundles',opt:'Here\'s the wiring.',text:'Thanks. Now pay attention: the workbench can rebuild any weapon or suit piece, one step at a time. Here\'s a coil I had lying around, and some plate to start you off.'}]}],
  reward:{xp:140,cr:30,items:[{id:'coil'},{id:'alloy',q:3}]}});
S({id:'s_patrol',giver:'yusuf',zone:'twilight',title:'Lamp Line',summary:'Three outer beacons light the safe paths into Meridian. Yusuf hasn\'t heard from any of them since the storm.',
  ask:'You look worried.',offer:'The outer beacons. Three of them, out on the approach roads. They light the safe path home for the haulers, and the storm knocked them out. I can\'t leave my post. Can you check them?',accept:'I\'ll relight them.',
  stages:[{text:'Restart the three outer beacons',obj:[{k:'use',id:'beacon_n',label:'Restart the antispinward beacon',zone:'twilight',x:-12,z:-110},{k:'use',id:'beacon_e',label:'Restart the spinward beacon',zone:'twilight',x:110,z:-8},{k:'use',id:'beacon_w',label:'Restart the western beacon',zone:'twilight',x:-110,z:20}]},
    {text:'Tell Yusuf',obj:[{k:'talk',npc:'yusuf',label:'Tell Yusuf the beacons are lit',opt:'All three beacons are lit.',text:'I can see them from here. You don\'t know what that means to the haulers. Here, it\'s not much.'}]}],
  reward:{xp:150,cr:60,items:[{id:'flare',q:4}]}});
S({id:'s_supply',giver:'lena',zone:'twilight',title:'The Satchel',summary:'Lena dropped her ore satchel onto the ledges of the crevasse south of Meridian.',
  ask:'Something wrong?',offer:'I dropped my satchel into the crevasse on the way back from the dig. It\'s on one of the ledges, I can see it from the rim, but my knee won\'t take the jumps anymore. Will you?',accept:'I\'ll jump down for it.',
  stages:[{text:'Recover the satchel from the crevasse ledges',obj:[{k:'use',id:'lena_satchel',label:'Pick up Lena\'s satchel',zone:'twilight',x:-48,z:94}]},
    {text:'Return the satchel',obj:[{k:'deliver',npc:'lena',item:'satchel',n:1,label:'Return the satchel to Lena',opt:'Here\'s your satchel.',text:'You actually went down there. Thank you. These are samples from my husband\'s last dig. Take these, they\'re the good ones.'}]}],
  reward:{xp:150,cr:30,items:[{id:'shard',q:4},{id:'j_gem'}]}});
Bus.on('use',id=>{if(id==='lena_satchel')give('satchel');});
S({id:'s_blight',giver:'marisol',zone:'twilight',title:'Greenhouse Blight',summary:'Something is poisoning Marisol\'s greenhouse. She traced the spores to a brood nest in the western grove.',
  ask:'Your plants look sick.',offer:'They are. Spores, from the grove to the west. A brood mother has nested there and her nest is throwing blight on the wind. Kill her and the blight stops. Bring me a few shards on your way back, too. The lamps need them.',accept:'I\'ll deal with the nest.',
  stages:[{text:'Kill the brood mother in the western grove',obj:[{k:'killId',id:'grovebrood',label:'Kill the grove brood mother',zone:'twilight',at:{x:-180,z:-30}},{k:'have',item:'shard',n:3,take:true,label:'Collect 3 crystal shards'}]},
    {text:'Tell Marisol',obj:[{k:'talk',npc:'marisol',label:'Tell Marisol the nest is gone',opt:'The nest is gone.',text:'The air already smells cleaner. Here. I grow these for the people I like.'}]}],
  reward:{xp:220,cr:60,items:[{id:'stim',q:2},{gen:'gear',lvl:4,r:1}]}});
S({id:'s_kite',giver:'kit',zone:'twilight',title:'Kite Season',minLvl:2,summary:'Kit\'s kite got caught on the top of a tall rock stack north of the commons.',
  ask:'Hey, kid. What\'s up?',offer:'My kite! The wind took it and it\'s stuck on top of the big rock pile out past the greenhouse. You can jump, right? Grown-ups can always jump.',accept:'I\'ll get your kite.',
  stages:[{text:'Climb the rock stack and free the kite',obj:[{k:'use',id:'kite',label:'Untangle Kit\'s kite',zone:'twilight',x:-70,z:52}]},
    {text:'Give the kite back',obj:[{k:'deliver',npc:'kit',item:'kite',n:1,label:'Give Kit the kite',opt:'Here\'s your kite.',text:'You got it! Here, I drew you a badge. It\'s a wing, because you can fly now. Sort of.'}]}],
  reward:{xp:100,unlock:['wing']},onComplete:()=>toast('Unlocked a new emblem: Wing (change it at any locker)','teal')});
Bus.on('use',id=>{if(id==='kite')give('kite');});
S({id:'s_stories',giver:'jory',zone:'twilight',title:'Old Jory\'s Stories',summary:'Old Jory wants to know if the places in his stories are still there: the Builder ruins, the glass crater and Pell\'s camp.',
  ask:'Tell me a story.',offer:'I know three stories. One about the ruins in the antispinward hills, where the Builders carved their names. One about the crater, where a star fell and turned the sand to glass. One about the prospector who lives alone in the far hills. Go see if they\'re still true, and I\'ll tell you the fourth.',accept:'I\'ll go and see.',
  stages:[{text:'Visit the places from Jory\'s stories',obj:[{k:'go',zone:'twilight',x:-250,z:-130,r:24,label:'Visit the Builder ruins'},{k:'go',zone:'twilight',x:100,z:150,r:24,label:'Visit the glass crater'},{k:'go',zone:'twilight',x:-110,z:-210,r:20,label:'Visit Pell\'s camp'}]},
    {text:'Tell Jory what you found',obj:[{k:'talk',npc:'jory',label:'Tell Jory what you found',opt:'Your stories are true.',text:'Of course they are. Here\'s the fourth: a long time ago, before Meridian, a ship fell out of the sky and someone walked out of it. Nobody remembers who. I always thought they\'d come back. Funny thing.'}]}],
  reward:{xp:260,cr:40,perk:1}});
S({id:'s_bottle',giver:'bo',zone:'twilight',title:'Something Old',summary:'Bo traded a bottle of Old Earth whiskey to Pell Ashgrove years ago, and wants it back for the cantina\'s anniversary.',
  ask:'What\'s good here?',offer:'Nothing, until the anniversary. Ten years of the Long Dusk. I want to open the bottle I traded to Pell Ashgrove back when I was broke. He lives out in the far antispinward hills. He won\'t give it up easy.',accept:'I\'ll talk to Pell.',
  stages:[{text:'Talk to Pell Ashgrove',obj:[{k:'talk',npc:'pell',label:'Ask Pell about Bo\'s bottle',opt:'Bo wants the bottle back.',text:'Bo wants it back, does he? Fine. I never drank it anyway. But you\'ll carry it careful. And tell him he still owes me a stew.',zone:'twilight'}]},
    {text:'Bring the bottle to Bo',obj:[{k:'deliver',npc:'bo',item:'j_bottle',n:1,label:'Bring the bottle to Bo',opt:'One bottle of Old Earth whiskey.',text:'Ten years. You\'re drinking free at the Long Dusk for life. Well, for a week. Here\'s something for the road.'}]}],
  reward:{xp:180,cr:120,items:[{id:'ration',q:4}]},onComplete:()=>{}});
Bus.on('qstage',(id,s)=>{if(id==='s_bottle'&&s===1)give('j_bottle');});
S({id:'s_drone',giver:'tamsin',zone:'twilight',req:()=>qDone('m03_keep'),title:'SD-7',summary:'Meridian\'s survey drone SD-7 went down in the glass crater spinward of the crash site.',
  ask:'Anything else need fixing?',offer:'SD-7. Our survey drone. It went down in the glass crater three weeks back and the skitters have been chewing on it since. Pull its memory core before they finish the job.',accept:'I\'ll get the core.',
  stages:[{text:'Recover SD-7\'s memory core',obj:[{k:'use',id:'sd7',label:'Pull the memory core from SD-7',zone:'twilight',x:112,z:143}]},
    {text:'Bring the core to Tamsin',obj:[{k:'deliver',npc:'tamsin',item:'sd7core',n:1,label:'Bring the core to Tamsin',opt:'Here\'s SD-7\'s memory core.',text:'Its last image is your ship coming down, on fire, with a beam of light under it. Something reached up and grabbed you. Anyway. Here, I built you a better battery.'}]}],
  reward:{xp:240,cr:80,items:[{id:'p_battery',o:{r:1,lv:5}}]}});
Bus.on('use',id=>{if(id==='sd7')give('sd7core');});
S({id:'s_prospect',giver:'pell',zone:'twilight',minLvl:4,title:'Claim Jumpers',summary:'A brood has moved into the Builder ruins and Pell can\'t work his claim.',
  ask:'How\'s the claim?',offer:'Overrun. Skitters, and a brood mother bigger than my shack, all over the ruins. I\'ve got a claim there and I\'d like to live long enough to work it. Clear them out.',accept:'I\'ll clear the ruins.',
  stages:[{text:'Clear the ruins',obj:[{k:'killId',id:'ruinbrood',label:'Kill the ruin brood mother',zone:'twilight',at:{x:-250,z:-130}},{k:'kill',type:'skitter',n:6,label:'Skitters in the ruins',zone:'twilight'}]},
    {text:'Tell Pell',obj:[{k:'talk',npc:'pell',label:'Tell Pell the ruins are clear',opt:'Your claim is clear.',text:'Hah! Look at that. Here, take a cut of the first dig. And this. Found it in the ruins, no use to me.'}]}],
  reward:{xp:300,cr:150,items:[gearR(6,2,'weapon')]}});

/* ---- Dayward Flats · Kiln Hollow ---- */
S({id:'s_pumps',giver:'oduya',zone:'dayward',req:()=>qDone('m06_kiln'),title:'Dry Wells',summary:'Three of Kiln Hollow\'s coolant pumps are down. Each needs new wiring.',
  ask:'What does Kiln Hollow need?',offer:'Coolant. Three pumps feed the foundry and all three are down. Bring two bundles of wiring per pump and splice them in. You\'ll find them south, east and west of town.',accept:'I\'ll fix the pumps.',
  stages:[{text:'Bring wiring for the pumps',obj:[{k:'have',item:'wiring',n:6,label:'Carry 6 wiring bundles'}]},
    {text:'Repair the three pumps',obj:[{k:'use',id:'pump1',label:'Repair the western pump',zone:'dayward',x:-60,z:140},{k:'use',id:'pump2',label:'Repair the eastern pump',zone:'dayward',x:70,z:150},{k:'use',id:'pump3',label:'Repair the southern pump',zone:'dayward',x:20,z:100}]},
    {text:'Report to Oduya',obj:[{k:'talk',npc:'oduya',label:'Report to Oduya',opt:'The pumps are running.',text:'I hear them. The foundry runs at full heat again tonight. Take these, and anything I cast for you from now on is at cost.'}]}],
  reward:{xp:400,cr:200,items:[{id:'heatsink'},{id:'alloy',q:4}]}});
Bus.on('use',id=>{if(/^pump[123]$/.test(id))removeItem('wiring',2);});
S({id:'s_wreck',giver:'vik',zone:'dayward',title:'The Long Haul',summary:'Vik\'s brother drove the hauler rover that went missing on the eastern flats. Vik wants to know what happened.',
  ask:'You look like you lost something.',offer:'My brother. Two months ago his rover went out east toward the canyons and never came back. If you find it, get the log. I need to know.',accept:'I\'ll find the rover.',
  stages:[{text:'Find the lost hauler rover',obj:[{k:'go',zone:'dayward',x:180,z:-160,r:18,label:'Find the rover on the eastern flats'}]},
    {text:'Clear the scavengers and pull the log',obj:[{k:'kill',type:'sandSkitter',n:6,label:'Dune skitters at the wreck',zone:'dayward'},{k:'use',id:'rover_log',label:'Download the rover\'s drive log',zone:'dayward',x:184,z:-156}]},
    {text:'Tell Vik',obj:[{k:'talk',npc:'vik',label:'Tell Vik what you found',opt:'I found your brother\'s rover.',text:'His last entry says he saw lights in the sky and drove toward them. Of course he did. He always chased lights. … Thank you. Take his rifle. He\'d want someone to use it.'}]}],
  reward:{xp:450,cr:150,items:[{id:'longwatch',o:{r:1,lv:8}}]}});
S({id:'s_cargo',giver:'sable',zone:'dayward',title:'Repossession',summary:'The Jackals took a crate from Sable\'s last shipment. It\'s at their dune outpost.',
  ask:'Business good?',offer:'Business would be good if the Jackals hadn\'t lifted my crate. It\'s at their dune outpost, southwest. Five of them guard it. Get it back and I\'ll make it worth your time. No questions about what\'s in it.',accept:'I\'ll get your crate.',
  stages:[{text:'Raid the Jackal dune outpost',obj:[{k:'kill',types:['raider','raiderBrute'],n:5,label:'Jackals at the outpost',zone:'dayward',at:{x:-100,z:-140}},{k:'use',id:'sable_cargo',label:'Tag Sable\'s crate for pickup',zone:'dayward',x:-104,z:-144}]},
    {text:'Tell Sable',obj:[{k:'talk',npc:'sable',label:'Tell Sable her crate is tagged',opt:'Your crate is ready for pickup.',text:'And it\'s still sealed. You\'re honest. That\'s rare and a little worrying. Here.'}]}],
  reward:{xp:420,cr:260,items:[{id:'scope'}]}});
S({id:'s_heatstroke',giver:'amaru',zone:'dayward',title:'Heatstroke',summary:'A hauler collapsed at the solar farm northwest of Kiln Hollow. Doc Amaru needs someone to reach him with coolant.',
  ask:'Busy day, Doc?',offer:'A hauler went down at the solar farm. Heatstroke, from the sound of his call. I can\'t leave the clinic. Take these coolant packs and get them in him. Fast.',accept:'On my way.',
  stages:[{text:'Reach the hauler at the solar farm',onStart:()=>give('coolant',2),obj:[{k:'use',id:'hauler',label:'Treat the collapsed hauler',zone:'dayward',x:-140,z:160}]},
    {text:'Tell Doc Amaru',obj:[{k:'talk',npc:'amaru',label:'Tell Doc Amaru',opt:'He\'s alive.',text:'Good. Good. You know your way around a crisis. Take these. And come to me first if you ever get hurt out there.'}]}],
  reward:{xp:320,cr:120,items:[{id:'trauma',q:2}]}});
Bus.on('use',id=>{if(id==='hauler'){removeItem('coolant',1);say('Hauler Brin','KILN HOLLOW HAULER','…Thanks. Thought I was done. Tell Doc I\'m walking home.',[bye('Take it easy.')]);}});
S({id:'s_defector',giver:'nell',zone:'dayward',req:()=>qDone('m06_kiln'),title:'Family Silver',summary:'Nell Varo ran from the Jackals. Her late sister\'s service medal is still in Voss\'s old camp.',
  ask:'You used to ride with the Jackals?',offer:'Rode with them, ran from them. With Voss gone I\'d go back for one thing: my sister\'s medal. It\'s in a footlocker in the camp. The stragglers there will shoot me on sight. You, they might just shoot at.',accept:'I\'ll get the medal.',
  stages:[{text:'Find the footlocker in the Jackal camp',obj:[{k:'use',id:'nell_locker',label:'Open the footlocker',zone:'dayward',x:-176,z:-52}]},
    {text:'Return the medal',obj:[{k:'deliver',npc:'nell',item:'medal',n:1,label:'Give Nell the medal',opt:'Here\'s your sister\'s medal.',text:'Jessa. … Thank you. Take my old sidearm. I\'m done with all of that now.'}]}],
  reward:{xp:420,cr:100,items:[{id:'service',o:{r:2,lv:9}}]}});
Bus.on('use',id=>{if(id==='nell_locker')give('medal');});
S({id:'s_borer',giver:'oduya',zone:'dayward',minLvl:9,req:()=>qDone('m06_kiln'),title:'The Sink',summary:'Something enormous lives under the sand at the Sink, south of Kiln Hollow. It swallowed a hauler last week.',
  ask:'What happened to your hauler?',offer:'The Sink took it. There\'s a thing under the sand down south, a borer longer than this town. It surfaces, it eats, it dives. Kill it and I\'ll pay you more than I make in a month. Watch the ground. When it shakes, jump.',accept:'I\'ll hunt the borer.',
  stages:[{text:'Kill the Dune Borer at the Sink',obj:[{k:'killId',id:'borer',label:'Kill the Dune Borer',zone:'dayward',at:{x:40,z:-200}}]},
    {text:'Tell Oduya',obj:[{k:'talk',npc:'oduya',label:'Tell Oduya',opt:'The borer is dead.',text:'You\'re joking. … You\'re not joking. Here. Every credit I promised, and a hammer from the foundry. I made it for myself. It\'s yours.'}]}],
  reward:{xp:900,cr:600,items:[{id:'hammer',o:{r:3,lv:12}}]}});
S({id:'s_clank',giver:'clank',zone:'dayward',title:'Lost Units',summary:'Clank\'s two maintenance units wandered off: one to the steam vents, one to the solar farm.',
  ask:'Hello, Clank.',offer:'GREETINGS. UNITS C-2 AND C-3 HAVE FAILED TO RETURN. LAST KNOWN POSITIONS: STEAM VENTS, EAST. SOLAR FARM, NORTHWEST. PLEASE REBOOT THEM. I WILL EXPRESS GRATITUDE.',accept:'I\'ll reboot them.',
  stages:[{text:'Reboot Clank\'s lost units',obj:[{k:'use',id:'clank2',label:'Reboot unit C-2 at the vents',zone:'dayward',x:150,z:40},{k:'use',id:'clank3',label:'Reboot unit C-3 at the solar farm',zone:'dayward',x:-134,z:150}]},
    {text:'Tell Clank',obj:[{k:'talk',npc:'clank',label:'Tell Clank',opt:'Both units are on their way home.',text:'UNITS DETECTED. EXPRESSING GRATITUDE. … THAT WAS GRATITUDE. PLEASE ACCEPT THIS SERVO ASSEMBLY.'}]}],
  reward:{xp:300,cr:80,items:[{id:'servo'}]}});

/* ---- Nightward Expanse · Cold Harbor ---- */
S({id:'s_pods',giver:'pavo',zone:'nightward',title:'Weather Eyes',summary:'Three of Cold Harbor\'s weather pods stopped reporting.',
  ask:'Need anything fixed?',offer:'Weather pods. We put out three to watch the ice storms coming off the dark side. All three went quiet. Get to each one and hit the reset. West, east and south of the station.',accept:'I\'ll reset the pods.',
  stages:[{text:'Reset the weather pods',obj:[{k:'use',id:'pod1',label:'Reset the western weather pod',zone:'nightward',x:-90,z:-80},{k:'use',id:'pod2',label:'Reset the eastern weather pod',zone:'nightward',x:120,z:-60},{k:'use',id:'pod3',label:'Reset the northern weather pod',zone:'nightward',x:60,z:60}]},
    {text:'Tell Pavo',obj:[{k:'talk',npc:'pavo',label:'Tell Pavo',opt:'Your pods are back.',text:'Data\'s flowing. There\'s a storm front coming in three days and now we\'ll see it. Here, I tuned this insulation for you.'}]}],
  reward:{xp:500,cr:180,items:[{id:'insul'}]}});
S({id:'s_thaw',giver:'hale',zone:'nightward',title:'Hot Soup',summary:'Hale needs frost chitin and glowcaps to cook the station\'s famous soup.',
  ask:'Something smells good.',offer:'It would if I had ingredients. Frost chitin, six pieces, for the broth. Four glowcaps for the flavor. Everyone at the station is sick of rations.',accept:'I\'ll find ingredients.',
  stages:[{text:'Bring soup ingredients',obj:[{k:'deliver',npc:'hale',item:'frostchitin',n:6,label:'Bring 6 frost chitin',opt:'Here\'s the chitin.'},{k:'deliver',npc:'hale',item:'glowcap',n:4,label:'Bring 4 glowcaps',opt:'Here are the glowcaps.'}]}],
  reward:{xp:360,cr:90,items:[{id:'heatpack',q:3},{id:'ration',q:4}]}});
S({id:'s_lost',giver:'siku',zone:'nightward',title:'Lost in White',summary:'Siku\'s partner went out to check snares and never came back. Her suit beacon is still pinging, far north.',
  ask:'You look like you haven\'t slept.',offer:'I haven\'t. My partner, Anik, went to check the snares north of the pods. Her beacon is still pinging but she won\'t answer. Frost skitters hunt out there. Please.',accept:'I\'ll find her.',
  stages:[{text:'Follow Anik\'s beacon',obj:[{k:'go',zone:'nightward',x:-60,z:150,r:16,label:'Follow the beacon north'}]},
    {text:'Drive off the skitters and reach Anik',obj:[{k:'kill',type:'frost',n:6,label:'Frost skitters near Anik',zone:'nightward'},{k:'use',id:'anik',label:'Help Anik',zone:'nightward',x:-60,z:150}]},
    {text:'Tell Siku',obj:[{k:'talk',npc:'siku',label:'Tell Siku',opt:'Anik is alive. She\'s walking back.',text:'… I don\'t have the words. Take my old poncho. It\'s kept me alive for ten winters.'}]}],
  reward:{xp:600,cr:120,items:[gearR(11,2)],unlock:['ranger']},onComplete:()=>toast('Unlocked a new outfit: Ranger poncho (change it at any locker)','teal')});
Bus.on('use',id=>{if(id==='anik')say('Anik','RANGER','You came for me? Siku sent you. Of course. My leg\'s broken but I can limp. Go, tell her I\'m coming.',[bye('Go slow.')]);});
S({id:'s_hunt',giver:'siku',zone:'nightward',req:()=>qDone('s_lost'),minLvl:11,title:'The White Alpha',summary:'A huge frost skitter alpha has been stalking the rangers near the frozen cache.',
  ask:'Anything else?',offer:'The thing that chased Anik. A white alpha, near the frozen cache in the far west. It learns. It waits. Rangers have tried to kill it for years. Want to try?',accept:'I\'ll hunt it.',
  stages:[{text:'Kill the white alpha',obj:[{k:'killId',id:'frostalpha',label:'Kill the white alpha',zone:'nightward',at:{x:-220,z:-120}}]},
    {text:'Tell Siku',obj:[{k:'talk',npc:'siku',label:'Tell Siku',opt:'The alpha is dead.',text:'Ten years. Ten years, and you did it in an afternoon. Take this. It\'s the best rifle I ever owned.'}]}],
  reward:{xp:800,cr:300,items:[{id:'longwatch',o:{r:3,lv:14}}]}});
S({id:'s_index',giver:'index',zone:'nightward',title:'Fragmented',summary:'Index, Cold Harbor\'s archivist droid, is missing three of its data shards. They\'re scattered across the Expanse.',
  ask:'Hello, Index.',offer:'ARCHIVE INCOMPLETE. THREE DATA SHARDS WERE LOST WHEN MY TRANSPORT CRASHED. I HAVE TRIANGULATED THEIR SIGNALS. RETRIEVE THEM, AND I WILL SHARE WHAT THEY CONTAIN.',accept:'I\'ll find your shards.',
  stages:[{text:'Recover the data shards',obj:[{k:'use',id:'ishard1',label:'Recover the first data shard',zone:'nightward',x:150,z:-150},{k:'use',id:'ishard2',label:'Recover the second data shard',zone:'nightward',x:-140,z:-200},{k:'use',id:'ishard3',label:'Recover the third data shard',zone:'nightward',x:100,z:180}]},
    {text:'Bring the shards to Index',obj:[{k:'talk',npc:'index',label:'Return to Index',opt:'Here are your shards.',text:'ARCHIVE RESTORED. CONTENT: SURVEY RECORDS, YEAR 31. A HALCYON SHIP SCANNED THE SPIRE AND LEFT. THE PILOT WAS FLAGGED AS “RESONANT”. … THAT IS AN UNUSUAL WORD. PLEASE ACCEPT THIS DATA CHIP.'}]}],
  reward:{xp:500,cr:100,items:[{id:'datachip',q:2},{id:'scope'}]}});

/* ---- Anchorage station ---- */
S({id:'s_spy',giver:'ostrander',zone:'anchorage',req:()=>qDone('m11_records'),title:'Leaks',summary:'Someone on Anchorage has been feeding Halcyon the marshal\'s patrol schedules.',
  ask:'Anything I can do for you, Marshal?',offer:'Someone on my station is leaking patrol schedules to Halcyon. Vonn hears everything at the Halo. Start there.',accept:'I\'ll find the leak.',
  stages:[{text:'Ask Vonn at the Halo',obj:[{k:'talk',npc:'vonn',label:'Ask Vonn about the leak',opt:'Who\'s been selling the marshal\'s schedules?',text:'I don\'t name names. But someone leaves a data drop under the third stool at the end of every shift. Look for yourself.'}]},
    {text:'Search the dead drop',obj:[{k:'use',id:'dead_drop',label:'Search under the third stool',zone:'anchorage',x:43,z:28.4}]},
    {text:'Report to Ostrander',obj:[{k:'talk',npc:'ostrander',label:'Report to Ostrander',opt:'The leak is coming from Arn\'s office.',text:'Arn. Of course it is. I can\'t touch a Halcyon liaison, but I can make sure she reads only what I want her to read. Thank you. Here\'s a commendation, and a pistol from the armory.'}]}],
  reward:{xp:700,cr:250,items:[gearR(14,2,'weapon')]}});
S({id:'s_breach',giver:'rook',zone:'anchorage',req:()=>qDone('m10_anchorage'),title:'Pressure Drop',summary:'Three micro-breaches are bleeding air in Anchorage\'s maintenance tunnels.',
  ask:'Need a hand, chief?',offer:'Air pressure in the maintenance tunnels is dropping. Three micro-breaches, and the drones down there won\'t let my crew near them. Patch them. Here, take these sealant kits.',accept:'I\'ll seal them.',
  stages:[{text:'Seal the three breaches',obj:[{k:'use',id:'breach1',label:'Seal the first breach',zone:'anchorage',x:-56,z:-34},{k:'use',id:'breach2',label:'Seal the second breach',zone:'anchorage',x:-80,z:-44},{k:'use',id:'breach3',label:'Seal the third breach',zone:'anchorage',x:-48,z:-66}]},
    {text:'Tell Rook',obj:[{k:'talk',npc:'rook',label:'Tell Rook',opt:'Breaches sealed.',text:'Pressure\'s holding. You\'d make a decent station tech. Take this, I built it from spare plating.'}]}],
  reward:{xp:600,cr:200,items:[{id:'plating'},{gen:'gear',lvl:14,r:2}]}});
S({id:'s_pet',giver:'pip',zone:'anchorage',title:'Biscuit',summary:'Pip\'s little cleaning droid, Biscuit, crawled into the vents on the hab ring.',
  ask:'Hi, Pip.',offer:'Biscuit is gone! He\'s my droid. He cleans. He went into the vent by the hab ring garden and he won\'t come out. Please?',accept:'I\'ll find Biscuit.',
  stages:[{text:'Find Biscuit in the hab ring vents',obj:[{k:'use',id:'biscuit',label:'Coax Biscuit out of the vent',zone:'anchorage',x:-24,z:70}]},
    {text:'Bring Biscuit home',obj:[{k:'deliver',npc:'pip',item:'biscuit',n:1,label:'Give Biscuit back to Pip',opt:'Here\'s Biscuit.',text:'BISCUIT! You found him! Here, you can have my best thing. It plays music.'}]}],
  reward:{xp:300,cr:20,items:[{id:'j_cube'}]}});
Bus.on('use',id=>{if(id==='biscuit')give('biscuit');});
S({id:'s_smuggle',giver:'dax',zone:'anchorage',req:()=>qDone('m10_anchorage'),title:'Special Delivery',summary:'Dax needs a sealed package delivered to Sable at Kiln Hollow, on the planet.',
  ask:'Got any work, Dax?',offer:'Always. This package goes to Sable in Kiln Hollow. Down the well, across the flats. Don\'t open it, don\'t scan it, don\'t drop it. You\'ve got a ship now. Be a courier.',accept:'I\'ll deliver it.',
  stages:[{text:'Deliver the package to Sable',onStart:()=>give('package'),obj:[{k:'deliver',npc:'sable',item:'package',n:1,label:'Deliver the package to Sable (Kiln Hollow)',opt:'A package from Dax.',text:'Ah. He remembered. You didn\'t open it? Good. Tell him we\'re square.'}]},
    {text:'Tell Dax',obj:[{k:'talk',npc:'dax',label:'Tell Dax it\'s delivered',opt:'Sable says you\'re square.',text:'Square. Ha. That\'s the nicest thing she\'s said in years. Here\'s your fee.'}]}],
  reward:{xp:700,cr:500}});
S({id:'s_recipe',giver:'vonn',zone:'anchorage',title:'Taste of Home',summary:'Vonn wants a real planet-side recipe for the Halo\'s menu. Bo at the Long Dusk cantina in Meridian has one.',
  ask:'What\'s on the menu?',offer:'Recycled protein and regret. I want real food. Someone told me a bartender in Meridian makes a stew people cry over. Get me the recipe.',accept:'I\'ll ask Bo.',
  stages:[{text:'Ask Bo for his recipe',obj:[{k:'talk',npc:'bo',label:'Ask Bo for the stew recipe (Meridian)',opt:'A bartender on Anchorage wants your stew recipe.',text:'Off-world fame! Fine, but tell them it\'s Bo\'s Long Dusk Stew. Here.'}]},
    {text:'Bring the recipe to Vonn',obj:[{k:'deliver',npc:'vonn',item:'recipe',n:1,label:'Bring the recipe to Vonn',opt:'Bo\'s Long Dusk Stew.',text:'Glowcap and chitin? … Fine. I trust you. Drinks are on me.'}]}],
  reward:{xp:600,cr:200,items:[{id:'stim',q:3}]}});
Bus.on('qstage',(id,s)=>{if(id==='s_recipe'&&s===1)give('recipe');});
S({id:'s_meds',giver:'feng',zone:'anchorage',title:'Short Supply',summary:'The medbay is low on medkits and Dr. Feng can\'t get Halcyon to ship more.',
  ask:'How\'s the medbay?',offer:'Running on fumes. Halcyon is sitting on our resupply. If you can spare four medkits, I can keep the dock crew patched up until the shipment clears.',accept:'I\'ll bring medkits.',
  stages:[{text:'Bring medkits to the medbay',obj:[{k:'deliver',npc:'feng',item:'medkit',n:4,label:'Bring 4 medkits to Dr. Feng',opt:'Here are four medkits.',text:'These are Meridian-made. Better than ours. Here, take this. It\'s a field pack I built for exactly this kind of person.'}]}],
  reward:{xp:500,cr:120,items:[{id:'p_medic',o:{r:2,lv:14}}]}});
S({id:'s_drones',giver:'prin',zone:'anchorage',req:()=>qDone('m10_anchorage'),title:'Pest Control',summary:'The feral maintenance drones keep shooting at Prin\'s supply runs.',
  ask:'Need anything from the armory side?',offer:'Need the drones in the tunnels to stop shooting my supply carts. Ten of them, and I\'ll let you pick something off the rack at a discount. Well, I\'ll give you something off the rack.',accept:'Ten drones.',
  stages:[{text:'Destroy feral drones in the tunnels',obj:[{k:'kill',type:'drone',n:10,label:'Feral drones destroyed',zone:'anchorage',at:{x:-60,z:-40}}]},
    {text:'Tell Prin',obj:[{k:'talk',npc:'prin',label:'Tell Prin',opt:'The tunnels are clear. For now.',text:'My carts got through without a scratch. Here. Top shelf.'}]}],
  reward:{xp:650,cr:200,items:[gearR(15,2,'weapon')]}});

/* ---- Calder · Reedwater ---- */
S({id:'s_nets',giver:'tavi',zone:'calder',title:'Torn Nets',summary:'Tavi\'s three fishing nets are torn, out on the stepping stones of the lagoon.',
  ask:'How\'s the catch?',offer:'Bad. Gliders tore my nets, and they\'re out on the stones where only a good jumper can reach. Patch them with resin and you\'ll eat with us tonight.',accept:'I\'ll mend the nets.',
  stages:[{text:'Mend the three nets',obj:[{k:'use',id:'net1',label:'Mend the first net',zone:'calder',x:-46,z:30},{k:'use',id:'net2',label:'Mend the second net',zone:'calder',x:-62,z:-8},{k:'use',id:'net3',label:'Mend the third net',zone:'calder',x:52,z:44}]},
    {text:'Tell Tavi',obj:[{k:'talk',npc:'tavi',label:'Tell Tavi',opt:'Your nets are mended.',text:'And you didn\'t even fall in. Much. Here, pearls from today\'s catch.'}]}],
  reward:{xp:700,cr:150,items:[{id:'pearl',q:4}]}});
S({id:'s_pearls',giver:'ona',zone:'calder',title:'Woven Light',summary:'Ona weaves lumen pearls into reed armor, and she\'s run out.',
  ask:'That weaving is beautiful.',offer:'It would be armor if I had pearls. Lumen pearls, from the shallows. Bring me six and I\'ll weave you a coat that turns a stalker\'s claw.',accept:'Six pearls.',
  stages:[{text:'Bring lumen pearls',obj:[{k:'deliver',npc:'ona',item:'pearl',n:6,label:'Bring 6 lumen pearls to Ona',opt:'Here are six pearls.',text:'They\'re perfect. Come back tomorrow. … It\'s tomorrow. Here.'}]}],
  reward:{xp:700,cr:100,items:[{id:'s_reed',o:{r:3,lv:18}}]}});
S({id:'s_alpha',giver:'kesh',zone:'calder',minLvl:16,title:'The Old One',summary:'A huge reed stalker, the Old One, hunts the western reed beds.',
  ask:'Good hunting?',offer:'Not since the Old One came back. A stalker twice the size of the others, in the reed beds to the west. It took two of our hunters. I\'ll hunt it with you, in spirit.',accept:'I\'ll hunt the Old One.',
  stages:[{text:'Kill the Old One',obj:[{k:'killId',id:'stalkeralpha',label:'Kill the Old One',zone:'calder',at:{x:-160,z:120}}]},
    {text:'Tell Kesh',obj:[{k:'talk',npc:'kesh',label:'Tell Kesh',opt:'The Old One is dead.',text:'Then the reeds are ours again. Take my spear-gun. The Old One deserved a better hunter than me.'}]}],
  reward:{xp:1100,cr:300,items:[{id:'tidecaller',o:{r:3,lv:19}}]}});
S({id:'s_shrines',giver:'maru',zone:'calder',req:()=>qDone('m13_reedwater'),title:'The Four Shrines',summary:'Elder Maru asks you to light the four lagoon shrines, as the Reedwater elders once did.',
  ask:'Tell me about the shrines.',offer:'Four shrines stand at the edges of the lagoon. When the elders were young, they lit them every year to honor the drowned spire. No one has been strong enough to reach them in a generation.',accept:'I\'ll light the shrines.',
  stages:[{text:'Light the four shrines',obj:[{k:'use',id:'shrine1',label:'Light the shrine of the reeds (west)',zone:'calder',x:-200,z:-40},{k:'use',id:'shrine2',label:'Light the shrine of the deep (east)',zone:'calder',x:210,z:20},{k:'use',id:'shrine3',label:'Light the shrine of the tide (south)',zone:'calder',x:-30,z:-220},{k:'use',id:'shrine4',label:'Light the shrine of the sky (north)',zone:'calder',x:-150,z:230}]},
    {text:'Tell Elder Maru',obj:[{k:'talk',npc:'maru',label:'Tell Elder Maru',opt:'All four shrines are lit.',text:'I saw them from my door, one by one. Like when I was a girl. This crest was carved by the first elders. Wear it.'}]}],
  reward:{xp:1200,cr:200,perk:1,unlock:['crest']},onComplete:()=>toast('Unlocked a new helmet: Ancient crest (change it at any locker)','teal')});
S({id:'s_lumo',giver:'lumo',zone:'calder',title:'Self-Repair',summary:'Lumo, Reedwater\'s trade droid, is rusting from the inside. It needs resin and wiring.',
  ask:'Hello, Lumo.',offer:'Greetings, valued customer! My seals are failing in the humidity. Five reed resin and three wiring bundles would allow me to continue trading for another century.',accept:'I\'ll bring the parts.',
  stages:[{text:'Bring Lumo repair parts',obj:[{k:'deliver',npc:'lumo',item:'resin',n:5,label:'Bring 5 reed resin',opt:'Here\'s the resin.'},{k:'deliver',npc:'lumo',item:'wiring',n:3,label:'Bring 3 wiring bundles',opt:'Here\'s the wiring.'}]}],
  reward:{xp:600,cr:250,items:[{id:'cellmod'}]}});

/* ---- Ashfall ---- */
S({id:'s_choirlogs',giver:'tem',zone:'ashfall',title:'The Choir\'s Road',summary:'Three Choir scouts died on the road to the Ark. Their logs record what they found.',
  ask:'What happened to the Choir here?',offer:'We came in three ships. The Cohort shot down two. Our scouts went ahead and didn\'t come back. Their logs will be with them. Find them, so we know.',accept:'I\'ll find their logs.',
  stages:[{text:'Find the scouts\' logs',obj:[{k:'use',id:'clog1',label:'Recover the first scout\'s log',zone:'ashfall',x:-150,z:-120},{k:'use',id:'clog2',label:'Recover the second scout\'s log',zone:'ashfall',x:-170,z:40},{k:'use',id:'clog3',label:'Recover the third scout\'s log',zone:'ashfall',x:160,z:90}]},
    {text:'Bring the logs to Brother Tem',obj:[{k:'talk',npc:'tem',label:'Bring the logs to Brother Tem',opt:'I found all three.',text:'They saw the Ark open its eye, just once, when the ash cleared. And they heard it sing. Thank you. Wear our sign, if you will.'}]}],
  reward:{xp:1300,cr:200,unlock:['choir']},onComplete:()=>toast('Unlocked a new emblem: Choir sigil (change it at any locker)','teal')});
S({id:'s_caches',giver:'ryn',zone:'ashfall',title:'Deserter\'s Pay',summary:'Ryn knows where the Cohort hid three supply caches. Raid them before Rusk\'s people do.',
  ask:'Why did you desert?',offer:'Because Vash pays in promises. The Cohort buried three supply caches around the camp. I know where. You raid them, you keep the gear, and I get to watch Rusk\'s quartermaster cry.',accept:'Show me the caches.',
  stages:[{text:'Raid the Cohort supply caches',obj:[{k:'use',id:'cache1',label:'Raid the north cache',zone:'ashfall',x:150,z:10},{k:'use',id:'cache2',label:'Raid the east cache',zone:'ashfall',x:190,z:-70},{k:'use',id:'cache3',label:'Raid the south cache',zone:'ashfall',x:90,z:-110}]},
    {text:'Tell Ryn',obj:[{k:'talk',npc:'ryn',label:'Tell Ryn',opt:'All three caches, raided.',text:'Ha! Here, my old Vanguard plate. I never want to see it again, and it looks better on you.'}]}],
  reward:{xp:1300,cr:400,unlock:['vanguard'],items:[{gen:'weapon',lvl:22,r:2}]},onComplete:()=>toast('Unlocked a new outfit: Vanguard (change it at any locker)','teal')});
Bus.on('use',id=>{if(/^cache[123]$/.test(id)){const L=rollLoot('locked',22,'ashfall');giveCr(L.cr);addItems(L.items);}});
S({id:'s_lastwords',giver:'oriel2',zone:'ashfall',req:()=>!!G.flags.orielFree,title:'Last Words',summary:'Sister Oriel asks you to lay a memorial stone at the Choir graves west of the shelter.',
  ask:'Are you all right, Oriel?',offer:'No. Eleven of us died for this. Brother Tem carved a stone for them. Will you lay it at the graves, west of the shelter? I can\'t look at them yet.',accept:'I\'ll lay the stone.',
  stages:[{text:'Lay the memorial stone',onStart:()=>give('lastwords'),obj:[{k:'use',id:'graves',label:'Lay the memorial stone at the graves',zone:'ashfall',x:-110,z:-180}]},
    {text:'Tell Oriel',obj:[{k:'talk',npc:'oriel2',label:'Tell Oriel',opt:'It\'s done.',text:'Thank you. When this is over, I want to be the one who sings for them.'}]}],
  reward:{xp:1000,cr:100,perk:1}});
Bus.on('use',id=>{if(id==='graves')removeItem('lastwords',1);});

// ===== 49_zhelp.js =====
/* ================= ZONE HELPERS shared by the region files ================= */
const flatTo=(h,x,z,cx,cz,r0,r1,v)=>{const f=smooth(r0,r1,Math.hypot(x-cx,z-cz));return h*f+v*(1-f);};
const bump=(x,z,cx,cz,r,h)=>{const d=Math.hypot(x-cx,z-cz)/r;return h*Math.exp(-d*d);};
// crevasses: long, narrow cuts in the ground. {x,z,dx,dz,len,w,depth}
function crevD(list,x,z){let d=0;for(const c of list){const ox=x-c.x,oz=z-c.z,u=Math.abs(ox*c.dx+oz*c.dz);if(u>c.len+4)continue;const v=Math.abs(-ox*c.dz+oz*c.dx),w=c.w*(1-smooth(c.len-6,c.len+4,u)*.95);if(v>w)continue;d=Math.max(d,(1-smooth(w*.4,w,v))*c.depth);}return d;}
function crevasses(ctx,list){
  ctx.hazard({kind:'pit',test:(x,z)=>crevD(list,x,z)>2.4});
  for(const c of list){const n={x:-c.dz,z:c.dx};for(const s of[-1,1])for(let t=-c.len;t<=c.len;t+=2.4){const off=c.w+.4+rr(0,.8),x=c.x+c.dx*t+n.x*s*off,z=c.z+c.dz*t+n.z*s*off,sz=rr(.4,1);
    ctx.P.add(ctx.g,MAT.rock,rockGeo(1,rr(0,99)),x,groundY(x,z)+sz*.2,z,rr(0,3),rr(0,3),rr(0,3),sz*1.4,sz*.6,sz);}
    for(let t=-c.len;t<=c.len;t+=4)ctx.keep(c.x+c.dx*t,c.z+c.dz*t,c.w+3);}}
// a rock or metal column you can stand on: [x,z,top above ground,radius]
function stones(ctx,pts,o={}){const out=[];for(const p of pts){const [x,z,dh,r=1.1]=p;const base=o.water?Math.min(groundY(x,z),W.water.y-3):groundY(x,z)-1.5;const top=(o.abs?dh:(o.from!==undefined?o.from:groundY(x,z))+dh);
    const h=top-base,mat=o.mat||MAT.basalt;ctx.P.add(ctx.g,mat,scaleUV(cyl(r*.92,r*1.08,h,7),1,h/2),x,base+h/2,z,0,rr(0,1),0);ctx.P.add(ctx.g,mat,cyl(r,r*.96,.25,7),x,top-.12,z,0,rr(0,1),0);
    if(o.glow)glowAt(ctx,null,x,top+.1,z,o.glow,r*2.4,.25);out.push(ctx.plat({x,z,r,top,bot:base}));}return out;}
// a box you can see and stand on
function slab(ctx,x,z,w,d,top,mat=MAT.metal,ry=0,h=.4){ctx.P.add(ctx.g,mat,RB(w,h,d,.06,1),x,top-h/2,z,0,ry,0);return ctx.plat({x,z,hw:w/2,hd:d/2,rot:ry,top,bot:top-h});}
function campfire(ctx,x,z,o={}){const y=groundY(x,z),P=ctx.P;const cm=campfireModel();
  if(cm){cm.g.position.set(x,y,z);cm.g.rotation.y=rr(0,6.3);ctx.g.add(cm.g);ctx.anim(dt=>cm.update(dt||.016));}
  else{for(let i=0;i<8;i++){const a=i/8*6.28;P.add(ctx.g,MAT.rock,rockGeo(1,i*7.1),x+Math.cos(a)*.7,y+.1,z+Math.sin(a)*.7,0,a,0,.28,.2,.25);}
  for(let i=0;i<4;i++)P.add(ctx.g,MAT.bark,cyl(.07,.08,1,6),x,y+.2,z,1.2,i*.8,0);}
  // warm light on everything around, a soft halo and an ember-lit pool on the ground
  const gl=glowAt(ctx,null,x,y+.7,z,0xff8a3a,3.4,.8),pool=glowAt(ctx,null,x,y+.15,z,0xff6a20,7,.35);ctx.light(x,y+1.3,z,0xff8a3a,2.4,18,true);ctx.col(x,z,.9);
  ctx.anim(()=>{const f=.88+Math.random()*.24;gl.scale.setScalar(3.4*f);pool.scale.setScalar(7*(.95+f*.05));if(Math.random()<.6)FX.spawn(x+rf(-.25,.25),y+.3,z+rf(-.25,.25),rf(-.2,.2),rf(.8,1.8),rf(-.2,.2),{life:rf(.5,1),size:rf(.1,.2),c0:0xffd080,c1:0x601808,drag:.5,grav:-.5});});}
// the repaired Vesper sits on a landing pad when it is parked in this zone
function vesperPad(ctx,x,z,th,o={}){const y=o.y!==undefined?o.y:groundY(x,z),P=ctx.P;
  P.add(ctx.g,MAT.deck,scaleUV(cyl(11,11.4,.3,48),6,1),x,y+.15,z);P.add(ctx.g,MAT.hazard,tor(10.6,.12,6,64),x,y+.31,z,Math.PI/2,0,0);ctx.plat({x,z,r:11.2,top:y+.3,bot:y-1});
  for(let i=0;i<8;i++){const a=i/8*6.28;const l=new THREE.Mesh(sph(.14,10,8),MAT.amber);l.position.set(x+Math.cos(a)*10.8,y+.4,z+Math.sin(a)*10.8);ctx.g.add(l);}
  ctx.light(x,y+5,z,0xffc35a,1,22);
  if(!(G.flags.vesperFixed&&G.shipAt===ctx.def.id))return null;
  const fx=PF.vesper(ctx,x,z,th,{y:y+.3});const h=fx.hatch;
  ctx.inter({pos:()=>h,r:3.4,label:()=>'Board the Vesper',ok:()=>true,act:()=>enterZone('vesper','ramp')});
  W.pois.push({id:'ship_'+ctx.def.id,x,z,name:'The Vesper',r:16,ft:true,icon:'ship'});return fx;}
function lampRing(ctx,cx,cz,r,n,color){for(let i=0;i<n;i++){const a=i/n*6.28+.2;PF.lamp(ctx,cx+Math.cos(a)*r,cz+Math.sin(a)*r,color);}}
function ruins(ctx,cx,cz,r,n,o={}){for(let i=0;i<n;i++){const a=rr(0,6.28),d=rr(r*.25,r),x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;PF.pillar(ctx,x,z,rr(2,o.tall||9),rr(.6,1.1),rr(-.18,.18));}
  for(let i=0;i<Math.ceil(n/2);i++){const a=rr(0,6.28),d=rr(r*.3,r*.9),x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d,y=groundY(x,z),w=rr(3,7),ry=rr(0,3);ctx.P.add(ctx.g,MAT.runes,RB(w,rr(.8,2.6),.9,.1,1),x,y+.6,z,rr(-.1,.1),ry,rr(-.08,.08));const c1=toW(x,z,ry,w/3,0),c2=toW(x,z,ry,-w/3,0);ctx.col(c1.x,c1.z,.9);ctx.col(c2.x,c2.z,.9);}}
// jellies drifting over the twilight meadow
function jelly(ctx,x,z,s=1){const y=groundY(x,z)+rr(2.5,5),g=grp(ctx,x,y,z,0);let bell;
  const M=MODELS.env_jelly;if(M){// "Glowing Jelly Fish": bell at the group origin, tentacles trailing below
    const o=M.scene.clone(true);bell=new THREE.Group();const fit=new THREE.Group();fit.add(o);bell.add(fit);g.add(bell);fit.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(fit),sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),k=2.6*s/sz.y;
    fit.scale.setScalar(k);fit.position.set(-c.x*k,-b.max.y*k+.5*s,-c.z*k);o.traverse(q=>{if(q.isMesh){q.material=q.material.clone();q.material.side=THREE.DoubleSide;q.frustumCulled=false;}});}
  else{const m=new THREE.MeshStandardMaterial({color:0xc8a8ff,emissive:0xa06cff,emissiveIntensity:.8,transparent:true,opacity:.55,roughness:.2,depthWrite:false,side:THREE.DoubleSide});
    bell=new THREE.Mesh(sph(.9*s,28,12,0,6.3,0,1.5),m);g.add(bell);for(let i=0;i<7;i++){const a=i/7*6.28,t=new THREE.Mesh(cyl(.02*s,.008*s,2.4*s,4),m);t.position.set(Math.cos(a)*.5*s,-1.2*s,Math.sin(a)*.5*s);g.add(t);}}
  glowAt(ctx,g,0,0,0,0x6fd8ff,3.4*s,.45);const ph=rr(0,6);ctx.anim(()=>{const t=performance.now()/1000+ph;g.position.y=y+Math.sin(t*.7)*.6;const p=Math.sin(t*2);bell.scale.set(1+p*.07,1-p*.06,1+p*.07);g.rotation.y=t*.2;});return g;}
// quest-only interaction with a pulsing marker while a task needs it
// is this spot named by a "use" step in any task? (a spot that only hands over an item a task asks you to have is not)
function questUses(id){for(const k in QUESTS)for(const st of QUESTS[k].stages)if(st.obj.some(o=>o.k==='use'&&o.id===id))return true;return false;}
function qUse(ctx,id,x,z,label,o={}){const tied=questUses(id),need=()=>tied?needsUse(id):true;const y=o.y!==undefined?o.y:(W.interior?W.floorY:groundY(x,z));const mk=glowAt(ctx,null,x,y+(o.h||1.6),z,0xffc35a,1.6,.8);mk.visible=false;
  ctx.anim(()=>{mk.visible=need()&&!(o.ok&&!o.ok());if(mk.visible)mk.scale.setScalar(1.4+Math.sin(performance.now()*.005)*.3);});
  return ctx.use(id,x,z,label,Object.assign({},o,{ok:()=>need()&&(o.ok?o.ok():true),y}));}
// bosses tied to a task appear once the task is active
function qBoss(ctx,qid,type,id,x,z,lvl,o={}){(W.bossIds=W.bossIds||[]).push(id);(W.qbosses=W.qbosses||[]).push({qid,type,id,x,z,lvl,o,spawned:false});}
function updateQBosses(){if(!W.qbosses)return;const st=zoneState(W.id);for(const b of W.qbosses){if(b.spawned||st.killed[b.id])continue;if(qActive(b.qid)&&(!b.o.cond||b.o.cond())){b.spawned=true;spawnEnemy(b.type,b.x,b.z,b.lvl,Object.assign({id:b.id},b.o));}}}
function restSpot(ctx,x,z,label='Rest in your bunk'){ctx.inter({pos:()=>({x,z}),r:2.6,label:()=>label,ok:()=>true,act:()=>{G.hp=PS.maxHp;G.en=PS.maxEn;G.sh=PS.shieldMax;$('#fade').style.opacity=1;setTimeout(()=>{$('#fade').style.opacity=0;toast('You rest for a while. Fully healed.','teal');saveSoon();},700);}});}
// simple wreckage scatter
function debris(ctx,cx,cz,r,n,mats=[MAT.hullDark,MAT.metal,MAT.hullWarm]){for(let i=0;i<n;i++){const a=rr(0,6.28),d=rr(1,r),x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;const w=rr(.4,2.2);ctx.P.add(ctx.g,pick(mats,rng),RB(w,rr(.05,.4),rr(.3,1.4),.04,1),x,groundY(x,z)+.1,z,rr(-.5,.5),rr(0,6),rr(-.5,.5));if(w>1.6)ctx.col(x,z,.6);}}
// a simple tall rock formation built from stacked boulders that blocks movement
function boulder(ctx,x,z,s,mat=MAT.rock){ctx.P.add(ctx.g,mat,rockGeo(2,rr(0,99)),x,groundY(x,z)+s*.3,z,rr(0,3),rr(0,3),rr(0,3),s*rr(.9,1.3),s*rr(.6,1),s*rr(.9,1.3));ctx.col(x,z,s*.9);}
// a beacon post that lights up once restarted
function beaconPost(ctx,x,z,lit){const y=groundY(x,z),P=ctx.P;P.add(ctx.g,MAT.metal,lathe([[.3,0],[.22,.2],[.1,.3],[.08,4],[0,4.05]],12),x,y,z);P.add(ctx.g,MAT.hullDark,RB(.5,.6,.5,.08,1),x,y+4.2,z);
  const l=new THREE.Mesh(sph(.2,12,10),lit()?MAT.teal:MAT.red);l.position.set(x,y+4.7,z);ctx.g.add(l);const gl=glowAt(ctx,null,x,y+4.7,z,0x6ff2d6,4,.8);ctx.col(x,z,.4);
  ctx.anim(()=>{const on=lit();l.material=on?MAT.teal:MAT.red;gl.visible=on&&Math.sin(performance.now()*.003)>-.4;});}
const zUsed=(ctx,id)=>()=>!!zoneState(ctx.def.id).flags['used_'+id];

// ===== 50_z_twilight.js =====
/* ================= ZONE: The Twilight Band (Ossery b) ================= */
const TW_CREVS=[{x:-37,z:98,dx:.94,dz:.35,len:40,w:4.6,depth:11},{x:150,z:62,dx:.3,dz:.954,len:30,w:4.2,depth:9},{x:-150,z:-120,dx:.8,dz:-.6,len:26,w:4,depth:9}];
function twRaw(x,z){let h=(fbm(x*.007+3,z*.007+7)-.5)*36+(fbm(x*.035,z*.035)-.5)*5+(fbm(x*.12,z*.12)-.5)*.8;
  h+=bump(x,z,205,-50,70,26)+bump(x,z,-262,-150,60,12)+bump(x,z,-130,-232,50,9)+bump(x,z,40,-200,45,10);
  let edge=Math.max(0,Math.max(Math.abs(x),Math.abs(z))-272)*1.4;if(z<-250)edge*=smooth(10,34,Math.abs(x));if(z>250)edge*=smooth(10,34,Math.abs(x-40));
  return h+edge;}
const TW_H={crash:twRaw(-60,150),relay:twRaw(232,-70),ruins:twRaw(-250,-130),camp:twRaw(-110,-210),meadow:twRaw(-205,128)};
// The Vesper's crash: a furrow ploughed in from behind, spoil heaped along both sides, and a wall of earth the nose drove into.
// u runs along the ship toward the nose, v across it (positive to starboard).
const CR={x:-60,z:150,th:-.5};CR.fx=Math.sin(CR.th);CR.fz=Math.cos(CR.th);
function crashScar(x,z){const dx=x-CR.x,dz=z-CR.z,u=dx*CR.fx+dz*CR.fz,v=dx*CR.fz-dz*CR.fx;if(u<-95||u>42||Math.abs(v)>32)return null;
  const hw=lerp(3.2,7.4,smooth(-85,-12,u)),tr=smooth(-92,-40,u)*(1-smooth(13,18,u)),p=Math.max(0,1-(v/hw)**2);
  const depth=lerp(.5,1.8,smooth(-70,-8,u))*tr*p;
  const rd=Math.abs(v)-hw-2,ridge=Math.exp(-(rd*rd)/3.4)*lerp(.4,1.7,smooth(-80,-6,u))*smooth(-94,-60,u)*(1-smooth(16,24,u));
  const nose=4.6*Math.exp(-(((u-18.5)/4.8)**2)-((v/(8+Math.max(0,u-18)*.35))**2));
  const k=Math.max(ridge/1.7,nose/4.6),lumps=(fbm(x*.22+3,z*.22-7)-.45)*1.6*k;
  // spoil heaped against the starboard flank, up to where it was torn open (the way in)
  const heap=1.5*Math.exp(-(((u+2)/3.4)**2)-(((v-7.6)/2.8)**2));
  return {dh:-depth+ridge+nose+lumps+heap,burn:p*tr*(1-smooth(10,16,u)),dirt:clamp(ridge/1.1+nose/2.6,0,1)};}
function twHeight(x,z){let h=twRaw(x,z);
  const dc=Math.hypot(x-100,z-150)/34;h+=-12*Math.max(0,1-dc*dc)+5*Math.exp(-((dc-1.1)**2)/.04);
  h=flatTo(h,x,z,0,0,52,82,0);h=flatTo(h,x,z,-60,150,14,26,TW_H.crash-.6);{const cs=crashScar(x,z);if(cs)h+=cs.dh;}h=flatTo(h,x,z,232,-70,6,14,TW_H.relay);
  h=flatTo(h,x,z,-250,-130,18,32,TW_H.ruins);h=flatTo(h,x,z,-110,-210,10,18,TW_H.camp);h=flatTo(h,x,z,-205,128,20,40,TW_H.meadow-1.5);
  // roads to the two passes
  if(z<-60)h=lerp(h,Math.min(h,twRaw(0,z)*.3),(1-smooth(6,16,Math.abs(x)))*smooth(-60,-90,z));
  return h-crevD(TW_CREVS,x,z);}
const TWC={moss:new THREE.Color(0x45355a),lichen:new THREE.Color(0x30505a),rock:new THREE.Color(0x6e4844),high:new THREE.Color(0x80605a),frost:new THREE.Color(0xc0cde8),scorch:new THREE.Color(0x9c6238),crater:new THREE.Color(0x2c2238),pave:new THREE.Color(0x3c3948),deep:new THREE.Color(0x120c18),road:new THREE.Color(0x4a3e48),meadow:new THREE.Color(0x3a5a62)};
// Meridian's buildings: modular blocks facing the plaza (see 23_arch.js)
const fcz=(x,z,cx=0,cz=0)=>Math.atan2(cx-x,cz-z);
const MERIDIAN_ARCH=[
  {id:'commons',corners:'round',roof:'frustum',x:-16,z:-16,face:fcz(-16,-16),w:3,d:3,floors:2,kind:'commons',accent:'cyan',name:'COMMONS',sub:'MERIDIAN STATION',neon:'COMMONS',healLabel:'Use the commons med-station'},
  {id:'greenhouse',corners:'square',roof:'saw',bay:-1,x:-28,z:16,face:fcz(-28,16),w:3,d:2,floors:2,kind:'greenhouse',accent:'cyan',hull:'plateWarm',name:'GREENHOUSE',light:0xc8ffd8},
  {id:'cantina',corners:'prow',roof:'gable',x:24,z:-14,face:fcz(24,-14),w:3,d:2,floors:3,kind:'cantina',accent:'orange',name:'THE LONG DUSK',sub:'CANTINA · ALWAYS OPEN',neon:'THE LONG DUSK',light:0xffb070},
  {id:'xeno',corners:'round',bay:1,roof:'gable',x:36,z:6,face:fcz(36,6),w:3,d:2,floors:3,kind:'lab',accent:'cyan',name:'XENOBIOLOGY',sub:'DR. S. VEY',light:0xc8f0ff},
  {id:'workshop',corners:'square',roof:'saw',pods:2,x:-34,z:-6,face:fcz(-34,-6),w:3,d:2,floors:2,kind:'workshop',accent:'orange',hull:'plateWarm',name:'WORKSHOP',sub:'T. REYES · REPAIRS'},
  {id:'bunkhouse',corners:'prow',pods:3,roof:'frustum',x:-6,z:34,face:fcz(-6,34),w:3,d:2,floors:4,kind:'bunks',accent:'cyan',name:'BUNKHOUSE',sub:'CREW QUARTERS'},
  {id:'admin',corners:'round',bay:3,roof:'saw',x:-14,z:-38,face:fcz(-14,-38),w:3,d:2,floors:4,kind:'admin',accent:'cyan',name:'ADMINISTRATION',sub:'H. ROE',
    log:['meridian_ledger','Station ledger, H. Roe','Water reclaim at 61%. Power from the solar fields holds if the dust stays down. Halcyon has not answered our last four reports. I have stopped logging the reasons I think of for that.']},
  {id:'security',corners:'prow',roof:'frustum',x:14,z:-40,face:fcz(14,-40),w:2,d:2,floors:3,kind:'security',accent:'orange',name:'SECURITY'}];
const MA=id=>MERIDIAN_ARCH.find(b=>b.id===id),MAt=(id,lx,lz)=>archAt(MA(id),lx,lz);
ZONES.twilight={arch:MERIDIAN_ARCH,id:'twilight',name:'The Twilight Band',world:'Ossery b',blurb:'The habitable strip between the planet\'s burning day side and its frozen night.',kind:'outdoor',size:640,seed:11,lvl:[1,6],
  detail:'ground',
  sky:{aurora:()=>G.flags.arkWoke?1:0,night:0x07061a,dusk:0x4c1c36,sun:0xfa6630,horizon:0x381420,stars:1,sunElev:7,sunAz:.1,fog:[0x3a2238,60,380],hemi:[0x9a80c8,0x1c1426,.62],sunColor:0xff9a66,sunInt:1.15,
    bodies:[{type:'giant',dir:[-700,330,-900],r:150,tilt:.4},{type:'moon',dir:[600,260,-700],r:24,color:0xc8b8d8},{type:'station',dir:[300,520,600],r:9}]},
  tempAt:(x,z)=>18-z*.12+(Math.hypot(x-100,z-150)<30?-4:0),
  height:twHeight,
  color:(x,z,y,sl,c)=>{const n=fbm(x*.06+11,z*.06-4);c.copy(TWC.moss).lerp(TWC.lichen,clamp(n*1.6-.4,0,1));c.lerp(TWC.rock,sl*.9);c.lerp(TWC.high,smooth(8,22,y)*.7);
    c.lerp(TWC.scorch,smooth(-90,-280,z)*(.6+.4*n));c.lerp(TWC.frost,smooth(120,270,z)*(.55+.45*n));c.lerp(TWC.crater,(1-smooth(.5,1,Math.hypot(x-100,z-150)/34))*.8);
    c.lerp(TWC.meadow,(1-smooth(20,42,Math.hypot(x+205,z-128)))*.6);c.lerp(TWC.pave,(1-smooth(26,40,Math.hypot(x,z)))*.75);
    if(z<-60)c.lerp(TWC.road,(1-smooth(3,7,Math.abs(x)))*.7);c.lerp(TWC.deep,smooth(.6,5,crevD(TW_CREVS,x,z)));const g=.9+n*.2;c.r*=g;c.g*=g;c.b*=g;},
  keep:()=>{const k=[{x:0,z:0,r:62},{x:-60,z:150,r:20},{x:232,z:-70,r:10},{x:-110,z:-210,r:14},{x:0,z:-300,r:16},{x:40,z:300,r:16}];for(const c of TW_CREVS)for(let t=-c.len;t<=c.len;t+=4)k.push({x:c.x+c.dx*t,z:c.z+c.dz*t,r:c.w+3});return k;},
  flora:[{type:'mushroom',count:70,where:(x,z,y)=>fbm(x*.01+40,z*.01)>.52&&z<170&&z>-200},
    {type:'mushroom',count:26,where:(x,z)=>Math.hypot(x+180,z+30)<55,scale:1.3},
    {type:'rock',count:230,where:(x,z,y)=>true},{type:'rock',count:60,where:(x,z,y)=>y>12,scale:1.6,seed:4},
    {type:'crystal',count:120,where:(x,z)=>Math.hypot(x-100,z-150)<40||Math.hypot(x+250,z+130)<40||fbm(x*.02,z*.02+9)>.68,hue:[.7,.82]},
    {type:'reeds',count:900,where:(x,z,y)=>Math.hypot(x+205,z-128)<46||fbm(x*.03+5,z*.03)>.6,hsl:[.75,.9,.25,.5,.3,.5],accent:.48},
    {type:'deadTree',count:40,where:(x,z)=>z<-120&&fbm(x*.02,z*.02)>.45,color:0x7a6a70},
    {type:'iceSpire',count:40,where:(x,z)=>z>230}],
  entries:{crash:{x:-50.2,z:150.8,face:1.49},fromDay:{x:0,z:-286,face:0},fromNight:{x:40,z:286,face:Math.PI},ship:{x:22,z:8,face:Math.PI},town:{x:0,z:16,face:Math.PI}},
  spawn:{x:0,z:16,face:Math.PI},
  build(ctx){const st=ctx.state(),P=ctx.P;
    /* ---- Meridian Station ---- */
    ctx.safe(0,0,62);ctx.poi('meridian',0,0,'Meridian Station',{r:40,ft:true,icon:'town'});
    PF.tower(ctx,4,-30,18);
    PF.solar(ctx,-44,-28,.3,3,4);PF.solar(ctx,-48,-14,.3,3,4);PF.pump(ctx,40,-24,0);PF.tower(ctx,-40,30,12);
    PF.stall(ctx,4,8,Math.PI);PF.stall(ctx,10,4,Math.PI*.8,MAT.fabricRed);PF.crates(ctx,-2,10,5,3);PF.barrels(ctx,14,10,4,7);PF.container(ctx,30,-30,.2);PF.container(ctx,-30,-26,1.4,0x3a5a7a);
    PF.rover(ctx,-22,-30,.6,{color:0xc8b898});PF.tent(ctx,-26,46,.4,MAT.fabricTeal);campfire(ctx,-20,48);
    lampRing(ctx,0,0,48,14,0x6ff2d6);for(const [x,z] of [[0,-60],[0,-80],[2,-104]])PF.lamp(ctx,x,z,0xffc35a);
    vesperPad(ctx,34,30,-Math.PI*.4);PF.gate(ctx,0,-52,0,'MERIDIAN','DAYWARD ROAD');
    ctx.board(6,14,Math.PI*1.1,'twilight','Meridian Contract Board');
    PF.table(ctx,18,-4,0,1.6,.9,{stools:4});PF.table(ctx,14,-8,.5,1.2,1.2,{stools:3});PF.kiosk(ctx,-4,-4,.6,'MERIDIAN');
    ctx.npc('okafor',10,-24,Math.PI);ctx.npc('ines',4,6,Math.PI);{const v=MAt('xeno',0,-1.4),t=MAt('workshop',-2.4,.4),b=MAt('cantina',0,-2.15);ctx.npc('vey',v.x,v.z,MA('xeno').face);ctx.npc('tamsin',t.x,t.z,MA('workshop').face);ctx.npc('bo',b.x,b.z,MA('cantina').face);}ctx.npc('halden',-10,-6,Math.PI*.2);
    ctx.npc('kit',-4,16,0,{type:'wander',r:12,pause:[1,4],speed:2});ctx.npc('marisol',-22,22,Math.PI*.7,{type:'route',pts:[[-20,26],[-34,30],[-40,6],[-18,4]],pause:[3,8]});ctx.npc('jory',12,12,Math.PI*1.2);
    ctx.npc('yusuf',0,-48,Math.PI,{type:'route',pts:[[0,-48],[34,-34],[46,0],[30,34],[0,46],[-34,34],[-46,0],[-34,-34]],pause:[2,5],speed:1.2});ctx.npc('lena',-14,36,Math.PI);
    spawnCrowd(0,0,30,9,{});
    /* ---- crash site ---- */
    ctx.poi('crash',-60,150,'Crash Site',{r:26,ft:true});
    if(!G.flags.vesperFixed){const fx=PF.vesper(ctx,-60,150,-.5,{crashed:true});ctx.light(-58,TW_H.crash+3,148,0xff7a2a,1.6,18,true);
      const slk=ctx.use('survival_locker',-46.4,146,'Open the survival case',{act:()=>{give('vs9',1,{lv:1});give('s_vesper',1);give('medkit',2);give('flare',3);equipBest();setTimeout(()=>showMemory('crash',()=>vesta('Meridian\'s beacon is dayward, past a crevasse. Follow the marker on your compass.')),300);}});PF.survivalCase(ctx,-46.4,146,.9,slk.done);
      // the crashed ship can be boarded: its ramp hangs open
      ctx.inter({pos:()=>fx.hatch,r:3.4,label:()=>'Climb into the Vesper',ok:()=>!INTRO.on,act:()=>enterZone('vesper','ramp')});
      // the repair: plates of your own hull to salvage along the furrow, and what the reactor's noise brings
      {const crW=(u,v)=>({x:CR.x+CR.fx*u+CR.fz*v,z:CR.z+CR.fz*u-CR.fx*v}),pm=new THREE.MeshStandardMaterial({color:0x8a8e96,roughness:.4,metalness:.45,side:THREE.DoubleSide,envMap:SABRE_ENV||null});
        [[-22,-10],[-40,11],[-49,-7],[-63,5],[-12,-13],[7,-13]].forEach(([u,v],i)=>{const q=crW(u,v),y=groundY(q.x,q.z),id='salv_'+i,st=ctx.state();
          const m=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,1.6,10,1,true,i,.7),pm);m.position.set(q.x,y+.5,q.z);m.rotation.set(.5,i*1.3,1.2);ctx.g.add(m);ctx.anim(()=>{m.visible=!st.flags['used_'+id];});
          qUse(ctx,id,q.x,q.z,'Pry loose a usable hull plate',{ok:()=>qStage('m09_grounded')>=GR.REPAIR&&!G.flags.vr_hull&&countItem('hullplate')<4,act:()=>{give('hullplate');sfx('pick');const n=countItem('hullplate');if(n>=4)vesta('That\'s four plates. Enough to close the breach once Tamsin\'s sealant is in hand.');}});});
        if(qStage('m09_grounded')===GR.DEFEND)ctx.enemies('skitter',-44,136,16,7);}
      qUse(ctx,'cockpit_hatch',-71.9,156.1,'Cut open the cockpit hatch',{ok:()=>countItem('cutter')>0,act:()=>{give('recorder');FX.burst(new THREE.Vector3(-71.9,TW_H.crash+2,156.1),0xffc35a,40,4,.6,.1);}});}
    else{debris(ctx,-60,150,12,26);ctx.P.add(ctx.g,MAT.basalt,rockGeo(2,3),-60,TW_H.crash-1,150,0,0,0,9,1.2,4);}
    debris(ctx,-70,160,30,40);debris(ctx,-40,130,16,12);ctx.nodes('scrap',-62,146,24,6);
    ctx.log('tw_flight',-48,138,'Vesper flight log, fragment','“Course locked for Ossery b, the spire. Passenger stable. VESTA, if this goes wrong, wipe the… ” The rest is static.');
    /* ---- crevasse crossing and Lena's satchel ---- */
    {const c=TW_CREVS[0],n={x:-c.dz,z:c.dx},rim=twRaw(c.x,c.z);
      stones(ctx,[-2.6,0,2.6].map(t=>[c.x+n.x*t,c.z+n.z*t,rim+.15,1.15]),{abs:true});
      const sx=c.x-c.dx*12,sz=c.z-c.dz*12;stones(ctx,[[sx+n.x*2.4,sz+n.z*2.4,rim-.5,1],[sx,sz,rim-1.1,1.2]],{abs:true});
      qUse(ctx,'lena_satchel',sx,sz,'Pick up Lena\'s satchel',{y:rim-1.1});}
    crevasses(ctx,TW_CREVS);
    /* ---- Kit's kite on the rock stack ---- */
    {const by=groundY(-70,52);boulder(ctx,-71,54,3.2);stones(ctx,[[-64,47,1.3,1.1],[-66.6,50.2,2.6,1],[-69.6,49.2,3.9,1],[-70.4,52.6,5.3,1.6]],{from:by,mat:MAT.rock});
      const kite=grp(ctx,-70.4,by+5.6,52.6,.4);ctx.P.add(kite,MAT.fabricRed,new THREE.CircleGeometry(.8,4),0,.6,0,-.4,0,0);ctx.anim(()=>{kite.visible=!st.flags.used_kite;kite.rotation.z=Math.sin(performance.now()*.002)*.2;});
      qUse(ctx,'kite',-70.4,52.6,'Untangle Kit\'s kite',{y:by+5.3});}
    /* ---- outer beacons ---- */
    for(const [id,x,z,name] of [['beacon_n',-12,-110,'antispinward'],['beacon_e',110,-8,'spinward'],['beacon_w',-110,20,'western']]){beaconPost(ctx,x,z,zUsed(ctx,id));qUse(ctx,id,x+1.2,z,'Restart the '+name+' beacon',{h:2});}
    /* ---- spinward ridge and relay ---- */
    ctx.poi('ridge',205,-50,'Spinward Ridge',{r:40});const relay=PF.relay(ctx,232,-70,!!st.flags.used_relay_ridge);
    qUse(ctx,'relay_ridge',234,-67,'Restart the survey relay',{act:()=>{relay.set(true);sfx('zap');}});
    ctx.enemies('skitter',150,-30,26,6,2);ctx.enemies('skitter',205,-55,22,5,3);ctx.enemies('skitter',120,60,24,4,2);
    ctx.chest('tw_ridge',226,-78,{ry:.4});ctx.glyph('g_tw1',190,-90);ctx.log('tw_relay',236,-62,'Survey relay R-1 maintenance tag','“Relay R-1, spinward ridge. Third bearing failure this year. Skitters chew the cables. Recommend fence. Request denied.” — L. Okoro');
    /* ---- glass crater and SD-7 ---- */
    ctx.poi('crater',100,150,'The Glass Crater',{r:34});ctx.enemies('skitter',100,150,22,6,4);ctx.nodes('shard',100,150,26,7);
    {const y=groundY(112,143),d=grp(ctx,112,y+.3,143,.8);P.add(d,MAT.hull,sph(.7,24,12),0,.4,0,0,0,0,1.2,.5,1.2);for(const s of[-1,1])P.add(d,MAT.metal,RB(1.6,.06,.4,.02,1),s*1,.4,0,0,0,s*.4);P.add(d,MAT.redGlow,sph(.12,10,8),0,.5,.75);
      qUse(ctx,'sd7',112,143,'Pull SD-7\'s memory core');}
    ctx.chest('tw_crater',88,166,{kind:'locked'});ctx.glyph('g_tw2',128,128);
    /* ---- jelly meadow ---- */
    ctx.poi('meadow',-205,128,'Jelly Meadow',{r:40});for(let i=0;i<14;i++)jelly(ctx,-205+rr(-34,34),128+rr(-30,30),rr(.7,1.3));
    for(const [id,x,z] of [['jelly1',-205,110],['jelly2',-225,140],['jelly3',-182,146]]){jelly(ctx,x,z,1.5);qUse(ctx,id,x,z,'Scan the jelly colony');}
    ctx.nodes('glowcap',-205,128,36,6);ctx.log('tw_jelly',-196,96,'Field notes, S. Vey','“Jellies drift toward the spire every 31 hours, then drift back. They are not migrating. They are listening.”');
    /* ---- mushroom grove ---- */
    ctx.poi('grove',-180,-30,'Glowcap Grove',{r:40});ctx.nodes('glowcap',-180,-30,40,10);ctx.nodes('glowcap',-120,40,30,5);
    qBoss(ctx,'s_blight','brood','grovebrood',-186,-36,4,{name:'Blight Mother'});ctx.enemies('skitter',-170,-40,20,4,3);ctx.chest('tw_grove',-200,-14);ctx.glyph('g_tw3',-156,-58);
    /* ---- Builder ruins ---- */
    ctx.poi('ruins',-250,-130,'Builder Ruins',{r:34});ruins(ctx,-250,-130,28,22);ctx.nodes('shard',-250,-130,24,5);ctx.enemies('skitter',-250,-130,20,5,5);
    qBoss(ctx,'s_prospect','brood','ruinbrood',-252,-128,6,{name:'Ruin Brood Mother',scale:1.15});ctx.chest('tw_ruins',-262,-120,{kind:'locked'});ctx.glyph('g_tw4',-238,-150);
    // a cable trunk of Builder superconductor, still flawless, in the collapsed gallery
    {const g=grp(ctx,-256,TW_H.ruins,-136,.4);ctx.P.add(g,MAT.basalt,RB(2.4,.5,1.2,.1,1),0,.25,0);for(let i=0;i<5;i++)ctx.P.add(g,i%2?MAT.tealGlow:MAT.metal,cyl(.07,.07,2.6,8),-.2+i*.1,.62,0,0,0,Math.PI/2);
      qUse(ctx,'ruin_wiring',-256,-136,'Strip the superconductor wiring',{ok:()=>qStage('m09_grounded')>=GR.REPAIR&&!G.flags.vr_power&&!countItem('wiring'),act:()=>{give('wiring');vesta('Superconductor, and not a fault in it. Whoever built this place built it to outlast them.');}});}
    ctx.use('ruin_wall',-246,-122,'Study the carvings',{act:()=>{if(!G.mem.includes('ruins'))showMemory('ruins');}});
    ctx.log('tw_ruins',-258,-142,'Prospector\'s scratch notes','“Twenty-four glyphs, scattered across the Reach. Touch them all, old Jory says, and you\'ll learn their alphabet. Jory says a lot of things.” — P.A.');
    /* ---- Pell's camp ---- */
    ctx.poi('pellcamp',-110,-210,'Pell\'s Camp',{r:20,ft:true});PF.tent(ctx,-114,-214,.6);campfire(ctx,-106,-206);PF.crates(ctx,-116,-204,4,11);PF.barrels(ctx,-104,-216,3,5);ctx.npc('pell',-108,-210,Math.PI*.3);ctx.safe(-110,-210,14);
    ctx.chest('tw_pell',-120,-218,{kind:'locked',lockText:'Pell\'s strongbox. He\'d notice.'});ctx.nodes('ore',-130,-232,20,4);
    /* ---- the open band ---- */
    ctx.enemies('skitter',-80,-90,30,5,3);ctx.enemies('skitter',60,-140,30,5,4);ctx.enemies('skitter',-120,200,30,4,4);ctx.enemies('brood',40,-200,10,1,6);ctx.enemies('skitter',40,-200,24,4,5);
    ctx.enemies('skitter',150,230,30,5,6);ctx.nodes('scrap',60,-140,30,4);ctx.nodes('glowcap',-60,-80,40,5);ctx.nodes('shard',150,230,30,4);
    ctx.chest('tw_hill',40,-206,{});ctx.chest('tw_north',150,236,{});ctx.glyph('g_tw5',-12,250);
    ctx.log('tw_patrol',58,-150,'Patrol report #88','“Brood mother nesting on the hill south of the road. Don\'t go alone. Don\'t go at all, honestly.” — Y. Lund');
    ctx.log('tw_kestrel',28,262,'Rescue beacon transcript','“…Kestrel Dawn, down on the night side, east of the research post. Navigation core intact. Crew…” The message loops.');
    /* ---- passes ---- */
    PF.gate(ctx,0,-292,0,'DAYWARD PASS','TO KILN HOLLOW');PF.gate(ctx,40,292,Math.PI,'NIGHTWARD PASS','TO COLD HARBOR');
    const passOk=()=>qDone('m03_keep')||G.lvl>=5,passMsg='Okafor\'s patrol stops you. “Nobody heads out past the passes until Halden says you\'re crew.”';
    ctx.travel(0,-304,'dayward','fromTwi','Travel to the Dayward Flats',{ok:passOk,locked:passMsg,r:6});ctx.travel(40,304,'nightward','fromTwi','Travel to the Nightward Expanse',{ok:passOk,locked:passMsg,r:6});
  }};

// the crash scar's colours: churned dark soil on the spoil, a scorched floor along the furrow
{const oc=ZONES.twilight.color,D=new THREE.Color(0x4a3430),B=new THREE.Color(0x1e1719);ZONES.twilight.color=(x,z,y,sl,c)=>{oc(x,z,y,sl,c);const s=crashScar(x,z);if(s){c.lerp(D,s.dirt*.75);c.lerp(B,s.burn*.8);}};}

// ===== 51_z_dayward.js =====
/* ================= ZONE: The Dayward Flats ================= */
function dwRaw(x,z){let h=(fbm(x*.006+21,z*.006-3)-.5)*30;
  // long wind-carved dunes
  const dn=Math.sin(x*.045+fbm(x*.01,z*.01)*6)*Math.cos(z*.012);h+=dn*2.6*(.5+fbm(x*.02+3,z*.02));
  // mesas
  const m=fbm(x*.009+7,z*.009+13);h+=smooth(.6,.66,m)*22*(z<120?1:.3);
  // eastern canyons
  h+=Math.max(0,x-150)*.18*(1-ridged(x*.012,z*.03)*.8);
  let edge=Math.max(0,Math.max(Math.abs(x),Math.abs(z))-272)*1.4;if(z>250)edge*=smooth(10,34,Math.abs(x));return h+edge;}
const DW_H={camp:dwRaw(-190,-60),out:dwRaw(-100,-140),rover:dwRaw(180,-160),vent:dwRaw(150,40),solar:dwRaw(-140,160)};
const DW_BRINE={x:80,z:-40,r:38,y:-3};
function dwHeight(x,z){let h=dwRaw(x,z);
  h=flatTo(h,x,z,0,180,46,72,4);h=flatTo(h,x,z,-190,-60,28,44,DW_H.camp);h=flatTo(h,x,z,-100,-140,14,24,DW_H.out);h=flatTo(h,x,z,180,-160,14,26,DW_H.rover);
  h=flatTo(h,x,z,150,40,18,30,DW_H.vent);h=flatTo(h,x,z,-140,160,24,38,DW_H.solar);
  // the Sink: a deep sand basin
  const ds=Math.hypot(x-40,z+200)/46;h=lerp(h,-14+ds*ds*8,1-smooth(.85,1.2,ds));
  // brine flats
  const db=Math.hypot(x-DW_BRINE.x,z-DW_BRINE.z)/DW_BRINE.r;h=lerp(h,-6+db*3+(fbm(x*.08,z*.08)-.5)*1.5,1-smooth(.8,1.15,db));
  // the road north to the pass
  if(z>200)h=lerp(h,4,(1-smooth(6,16,Math.abs(x)))*.8);
  return h;}
const DWC={sand:new THREE.Color(0xd8a878),dark:new THREE.Color(0xa86a48),rock:new THREE.Color(0x8a4a3a),mesa:new THREE.Color(0xc07a52),salt:new THREE.Color(0xe8ded0),crust:new THREE.Color(0x7a8a6a),pave:new THREE.Color(0x6a5a52),scorch:new THREE.Color(0x4a2a24)};
const fczK=(x,z,cx,cz)=>Math.atan2(cx-x,cz-z);
const KILN_ARCH=[
  {id:'clinic',x:18,z:166,face:fczK(18,166,0,180),w:3,d:2,floors:2,kind:'clinic',accent:'orange',name:'CLINIC',sub:'DOC AMARU',healLabel:'Use Doc Amaru\'s med-station',light:0xe8f4ff},
  {id:'haulers',x:24,z:196,face:fczK(24,196,0,180),w:3,d:2,floors:3,kind:'admin',accent:'orange',hull:'plateWarm',name:'HAULERS\' UNION',sub:'KILN HOLLOW',neon:'UNION HALL',
    log:['kiln_union','Union minutes','Motion to stop running ore past the Borer\'s track carried, eleven to two. The two were the shift bosses. Halcyon\'s quota letter is pinned to the wall with a knife.']},
  {id:'bunks',x:-24,z:200,face:fczK(-24,200,0,180),w:3,d:2,floors:3,kind:'bunks',accent:'cyan',hull:'plateWarm',name:'BUNKS',sub:'KILN HOLLOW'},
  {id:'assay',x:-38,z:184,face:fczK(-38,184,0,180),w:2,d:2,floors:2,kind:'lab',accent:'cyan',name:'ASSAY'},
  {id:'solar3',x:-120,z:176,face:0,w:2,d:2,floors:2,kind:'storage',accent:'orange',name:'SOLAR 3'}];
const KA=id=>KILN_ARCH.find(b=>b.id===id);
ZONES.dayward={arch:KILN_ARCH,bloom:{threshold:1.08,strength:.55},id:'dayward',name:'The Dayward Flats',world:'Ossery b',blurb:'Salt, dunes and furnace-heat under a sun that never sets. Miners, haulers and the Dust Jackals.',kind:'outdoor',size:640,seed:23,lvl:[5,11],
  detail:'sand',
  sky:{night:0x2a4a7a,dusk:0xd88a5a,sun:0xfff0c8,horizon:0xe8a868,stars:0,sunElev:34,sunAz:.05,sunSize:1.6,fog:[0xd8a070,90,460],hemi:[0xffe0b8,0x6a3a2a,.6],sunColor:0xfff0d0,sunInt:1.2,
    bodies:[{type:'giant',dir:[-800,420,-700],r:150,tilt:.4,color:0xffe0d0}]},
  tempAt:(x,z)=>46-z*.08+(Math.hypot(x-150,z-40)<28?8:0)+(Math.hypot(x-40,z+200)<46?6:0),
  height:dwHeight,
  color:(x,z,y,sl,c)=>{const n=fbm(x*.05,z*.05+7);c.copy(DWC.sand).lerp(DWC.dark,clamp(n*1.6-.5,0,1));c.lerp(DWC.rock,sl*.9);c.lerp(DWC.mesa,smooth(14,22,y)*.8);
    c.lerp(DWC.salt,(1-smooth(.75,1.1,Math.hypot(x-DW_BRINE.x,z-DW_BRINE.z)/DW_BRINE.r))*.85);c.lerp(DWC.crust,(1-smooth(20,32,Math.hypot(x-150,z-40)))*.5);
    c.lerp(DWC.pave,(1-smooth(30,48,Math.hypot(x,z-180)))*.6);if(z>200)c.lerp(DWC.pave,(1-smooth(3,7,Math.abs(x)))*.6);c.lerp(DWC.scorch,(1-smooth(20,40,Math.hypot(x+190,z+60)))*.4);const g=.92+n*.16;c.r*=g;c.g*=g;c.b*=g;},
  keep:[{x:0,z:180,r:56},{x:-190,z:-60,r:34},{x:-100,z:-140,r:18},{x:180,z:-160,r:16},{x:-140,z:160,r:30},{x:0,z:300,r:16},{x:80,z:-40,r:40}],
  flora:[{type:'spinepod',count:110,where:(x,z,y)=>y>-2&&fbm(x*.02,z*.02)>.45},{type:'rock',count:220,where:()=>true,mat:'sandstone',hsl:[.04,.08,.35,.55,.45,.65]},
    {type:'rock',count:60,where:(x,z,y)=>y>10,mat:'sandstone',scale:2,seed:9,hsl:[.03,.07,.4,.6,.4,.55]},{type:'deadTree',count:30,where:(x,z)=>fbm(x*.03,z*.03)>.55,color:0x9a7a6a},
    {type:'crystal',count:50,where:(x,z)=>x>160&&fbm(x*.03,z*.03)>.6,hue:[.02,.08],emissive:0xd05a2a}],
  entries:{fromTwi:{x:0,z:288,face:Math.PI},ship:{x:0,z:180,face:0},town:{x:0,z:170,face:0}},spawn:{x:0,z:200,face:Math.PI},
  build(ctx){const st=ctx.state(),P=ctx.P;
    /* ---- Kiln Hollow ---- */
    ctx.safe(0,180,56);ctx.poi('kiln',0,180,'Kiln Hollow',{r:40,ft:true,icon:'town'});
    {// the foundry: a long furnace hall with smokestacks and an open, glowing mouth
      const y=4,g=grp(ctx,-22,y,170,0);P.add(g,MAT.hullWarm,RB(16,7,10,.3,3),0,3.5,0);P.add(g,MAT.metal,RB(16.6,.6,10.6,.1,2),0,7.2,0);
      for(const sx of[-5,0,5]){P.add(g,MAT.hullDark,scaleUV(cyl(1,1.2,12,24),2,4),sx,13,-2.5);P.add(g,MAT.metal,tor(1.05,.12,8,24),sx,18.6,-2.5,Math.PI/2,0,0);glowAt(ctx,g,sx,19.6,-2.5,0xff7a2a,4,.4);}
      const mouth=new THREE.MeshStandardMaterial({color:0x200800,emissive:0xff6a1a,emissiveIntensity:1.4});P.add(g,mouth,RB(5,3.4,.2,.05,1),0,2,5.05);P.add(g,MAT.hazard,RB(5.6,.3,.3,.04,1),0,3.9,5.1);
      const d=decal(['KILN HOLLOW FOUNDRY','HALCYON MINING CONCERN · EST. 19'],8,1.2,{fg:'#2a2436'});d.position.set(0,5.8,5.08);g.add(d);ctx.light(-22,6,177,0xff6a1a,2,22,true);
      ctx.box(-22,170,8,5,0,y+7.2);ctx.anim(()=>{if(Math.random()<.4)FX.spawn(-22+rf(-2.4,2.4),y+1,175.4,rf(-.5,.5),rf(.5,2),rf(.3,1.2),{life:rf(.4,.9),size:rf(.06,.12),c0:0xffd080,c1:0xff3a0a,drag:.8,grav:-1});});}
    
    PF.tower(ctx,12,150,20);PF.solar(ctx,36,170,.2,3,5);PF.container(ctx,-6,150,.1,0x9a6a3a);PF.container(ctx,4,146,1.6,0x6a6a7a);PF.container(ctx,40,150,.6);
    PF.stall(ctx,6,186,Math.PI,MAT.fabricRed);PF.stall(ctx,-6,190,Math.PI*1.1);PF.crates(ctx,10,190,5,4);PF.barrels(ctx,-12,184,5,8);PF.rover(ctx,30,180,1.2,{color:0xd8a868});PF.rover(ctx,-34,160,.4,{color:0x8a9aa8});
    lampRing(ctx,0,180,46,12,0xffc35a);PF.gate(ctx,0,226,Math.PI,'KILN HOLLOW','NORTH ROAD');campfire(ctx,4,200);
    ctx.bench(-12,176,0);ctx.board(10,198,Math.PI,'dayward','Kiln Hollow Contract Board');
    ctx.npc('oduya',-18,178,0);ctx.npc('sable',6,183,Math.PI);ctx.npc('amaru',archAt(KA('clinic'),-2.2,-.6).x,archAt(KA('clinic'),-2.2,-.6).z,Math.PI/2);ctx.npc('nell',archAt(KA('haulers'),1.6,-1.2).x,archAt(KA('haulers'),1.6,-1.2).z,Math.PI*.8,{type:'wander',r:6});ctx.npc('vik',2,203,Math.PI*1.2);
    ctx.npc('clank',-8,160,0,{type:'route',pts:[[-8,160],[10,160],[16,180],[-4,186]],pause:[3,7],speed:1});
    spawnCrowd(0,180,30,8,{barks:['Foundry\'s running hot today.','Watch for Jackals on the south road.','Salt in everything. Salt in my soup.','The Sink took another hauler.','Oduya never sleeps.']});
    vesperPad(ctx,30,212,Math.PI*.3,{y:4});
    /* ---- coolant pumps ---- */
    for(const [id,x,z,n] of [['pump1',-60,140,'western'],['pump2',70,150,'eastern'],['pump3',20,100,'southern']]){PF.pump(ctx,x,z,rr(0,3));qUse(ctx,id,x+1.8,z,'Splice wiring into the '+n+' pump',{ok:()=>countItem('wiring')>=2});ctx.enemies('sandSkitter',x,z-14,10,2,6);}
    /* ---- Dust Jackal camp ---- */
    ctx.poi('jackals',-190,-60,'Dust Jackal Camp',{r:34});const relay=PF.relay(ctx,-205,-82,!!st.flags.used_relay_kiln);
    qUse(ctx,'relay_kiln',-203,-79,'Restart the Kiln Hollow relay',{ok:()=>!!st.killed.voss,act:()=>{relay.set(true);sfx('zap');}});
    PF.fence(ctx,-220,-30,-160,-30);PF.fence(ctx,-160,-30,-160,-90);PF.fence(ctx,-220,-90,-178,-90);
    for(const [x,z,r] of [[-180,-46,.4],[-200,-48,1.2],[-176,-76,2],[-210,-66,.9]])PF.tent(ctx,x,z,r,MAT.fabricRed);PF.container(ctx,-196,-36,.2,0x5a3a32,'PROPERTY OF D.J.');PF.container(ctx,-170,-60,1.5,0x4a4a3a,'KEEP OUT');
    campfire(ctx,-190,-58);PF.crates(ctx,-206,-54,6,12);PF.barrels(ctx,-172,-50,4,3);PF.tower(ctx,-216,-40,10);PF.rover(ctx,-182,-86,2.4,{color:0x7a4a3a});
    ctx.boss('jackalBoss','voss',-190,-70,9);ctx.enemies('raider',-190,-60,24,6,8,{leash:40});ctx.enemies('raiderBrute',-190,-60,20,2,8);
    qUse(ctx,'nell_locker',-176,-52,'Open the footlocker',{ok:()=>!!st.killed.voss||true});ctx.chest('dw_jackal',-212,-74,{kind:'locked',lockText:'Voss\'s strongbox. A Data Chip could open it.'});
    ctx.log('dw_voss',-194,-50,'Voss\'s orders','“The Choir woman pays in real credits. Keep the relay listening on the haulers and let me know when the Halcyon ship comes through.” Halcyon ship?');
    /* ---- Jackal dune outpost ---- */
    ctx.poi('outpost',-100,-140,'Jackal Dune Outpost',{r:20});PF.tent(ctx,-96,-136,.5,MAT.fabricRed);PF.container(ctx,-106,-146,.8,0x6a4a32);campfire(ctx,-100,-132);
    {const y=groundY(-104,-144),g=grp(ctx,-104,y,-144,.3);P.add(g,MAT.crateBlue,RB(1.4,1,1,.08,1),0,.5,0);P.add(g,MAT.hazard,RB(1.42,.12,1.02,.02,1),0,.85,0);ctx.col(-104,-144,.9);}
    qUse(ctx,'sable_cargo',-104,-142,'Tag Sable\'s crate');ctx.enemies('raider',-100,-140,14,4,7);ctx.enemies('raiderBrute',-100,-140,10,1,8);
    /* ---- the lost hauler ---- */
    ctx.poi('rover',180,-160,'Lost Hauler',{r:22});PF.rover(ctx,180,-160,.7,{wreck:true});debris(ctx,180,-160,14,18);ctx.enemies('sandSkitter',180,-160,18,6,9);
    qUse(ctx,'rover_log',184,-156,'Download the drive log',{ok:()=>qStage('s_wreck')>=1});ctx.chest('dw_rover',172,-150,{});
    ctx.log('dw_brother',190,-166,'Hauler drive log, last entry','“Lights in the sky over the canyons. Green, like the Twilight aurora but low. Going to take a look. Tell Vik not to wait up.”');
    /* ---- the Sink ---- */
    ctx.poi('sink',40,-200,'The Sink',{r:40});qBoss(ctx,'s_borer','borer','borer',40,-200,12);ctx.enemies('sandSkitter',60,-160,20,4,9);ctx.nodes('ore',40,-200,30,6);
    ctx.log('dw_sink',70,-172,'Survey marker','“Sand density anomaly. Something big moves under here. Do not drill.” Someone has added: “DO NOT DRILL” in red paint.');ctx.glyph('g_dw1',-4,-236);
    /* ---- brine flats: stepping stones over caustic brine to an island cache ---- */
    {const B=DW_BRINE;const m=new THREE.Mesh(new THREE.CircleGeometry(B.r*1.05,64),new THREE.MeshStandardMaterial({color:0x9ad8b0,emissive:0x2a6a4a,emissiveIntensity:.5,roughness:.15,metalness:.3,transparent:true,opacity:.85}));m.rotation.x=-Math.PI/2;m.position.set(B.x,B.y,B.z);ctx.g.add(m);
      ctx.anim(()=>{m.material.emissiveIntensity=.4+Math.sin(performance.now()*.0015)*.12;if(Math.random()<.1)FX.spawn(B.x+rf(-B.r,B.r)*.7,B.y+.1,B.z+rf(-B.r,B.r)*.7,0,rf(.3,.8),0,{life:1.2,size:.15,c0:0xc8ffd8,c1:0x2a6a4a,drag:1,grav:-.2});});
      ctx.hazard({kind:'brine',dps:22,test:(x,z,y)=>Math.hypot(x-B.x,z-B.z)<B.r*1.05&&y<B.y+.25,msg:'Caustic brine! Get out!'});
      const path=[];for(let i=0;i<9;i++){const t=i/8,a=-.4+t*1.1;path.push([B.x-B.r*.95+t*B.r*.95+Math.sin(i*1.3)*1.2,B.z+Math.sin(a)*7,B.y+.9+t*1.4+(i%2)*.3,1]);}
      stones(ctx,path,{abs:true,mat:MAT.sandstone});slab(ctx,B.x,B.z,7,7,B.y+2.6,MAT.sandstone);ctx.chest('dw_brine',B.x,B.z,{kind:'chest',y:B.y+2.6});ctx.glyph('g_dw2',B.x+2.4,B.z-2.4);
      ctx.poi('brine',B.x,B.z,'Brine Flats',{r:40});}
    /* ---- steam vents ---- */
    ctx.poi('vents',150,40,'Steam Vents',{r:30});
    {const vents=[];for(let i=0;i<9;i++){const a=i/9*6.28,d=i%2?9:16;vents.push({x:150+Math.cos(a)*d,z:40+Math.sin(a)*d,r:2.6,ph:i*.7});}vents.push({x:150,z:40,r:3.4,ph:0});
      for(const v of vents){const y=groundY(v.x,v.z);P.add(ctx.g,MAT.basalt,tor(v.r*.7,.4,6,16),v.x,y,v.z,Math.PI/2,0,0);v.y=y;}
      ctx.hazard({kind:'vent',dps:30,test:(x,z,y)=>{const t=performance.now()/1000;return vents.some(v=>Math.hypot(x-v.x,z-v.z)<v.r&&y<v.y+2.4&&((t*.5+v.ph)%3)<1.1);},msg:'Scalding steam!'});
      ctx.anim(()=>{const t=performance.now()/1000;for(const v of vents){if(((t*.5+v.ph)%3)<1.1&&Math.random()<.9)FX.spawn(v.x+rf(-.6,.6),v.y+.2,v.z+rf(-.6,.6),rf(-.4,.4),rf(5,9),rf(-.4,.4),{life:rf(.6,1.1),size:rf(.4,.8),c0:0xffffff,c1:0x8a7a6a,drag:1.4,grav:-1});else if(Math.random()<.05)FX.spawn(v.x,v.y+.2,v.z,0,1.4,0,{life:1,size:.4,c0:0xd8d0c8,c1:0x6a5a4a,drag:1,grav:-.5});}});
      stones(ctx,[[156,32,1.6],[143,47,1.6],[150,40,2.6,1.3]],{mat:MAT.basalt});qUse(ctx,'clank2',150,40,'Reboot maintenance unit C-2',{y:groundY(150,40)+2.6});
      ctx.nodes('powercell',150,40,26,4);ctx.chest('dw_vents',166,30,{kind:'locked'});}
    /* ---- solar farm ---- */
    ctx.poi('solar',-140,160,'Solar Farm',{r:34});for(let i=0;i<4;i++)for(let k=0;k<3;k++)PF.solar(ctx,-162+i*12,140+k*16,.1,2,4);
    qUse(ctx,'hauler',-140,160,'Treat the collapsed hauler');qUse(ctx,'clank3',-134,150,'Reboot maintenance unit C-3');ctx.enemies('sandSkitter',-150,180,16,4,7);ctx.nodes('wiring',-140,160,30,4);ctx.glyph('g_dw3',-190,190);
    /* ---- the open flats ---- */
    ctx.enemies('sandSkitter',-80,60,30,6,6);ctx.enemies('sandSkitter',90,80,30,5,7);ctx.enemies('raider',-40,-60,20,4,8);ctx.enemies('sandSkitter',220,0,30,6,10);ctx.enemies('raider',200,-260,16,4,11);ctx.enemies('raiderBrute',200,-260,10,1,11);
    ctx.enemies('brood',-240,120,10,1,9);ctx.enemies('sandSkitter',-240,120,20,4,8);
    ctx.nodes('scrap',-80,60,40,5);ctx.nodes('alloy',220,0,40,4);ctx.nodes('polymer',-40,-60,30,4);ctx.nodes('scrap',200,-260,20,3);
    ctx.chest('dw_mesa',-60,20,{});ctx.chest('dw_canyon',240,-60,{kind:'locked'});ctx.chest('dw_south',200,-266,{});ctx.glyph('g_dw4',250,-200);
    ctx.log('dw_haulers',60,110,'Hauler\'s Union notice','“As of today, any hauler crossing the south flats does so in convoy. No exceptions. No, not even you, Brin.”');
    ctx.log('dw_mesa',-56,26,'Geologist\'s note','“The mesas are capped with Builder glass. Somebody sealed them, a very long time ago.”');
    /* ---- back to the band ---- */
    PF.gate(ctx,0,292,Math.PI,'DAYWARD PASS','TO MERIDIAN');ctx.travel(0,304,'twilight','fromDay','Travel to the Twilight Band',{r:6});
  }};

// ===== 52_z_nightward.js =====
/* ================= ZONE: The Nightward Expanse ================= */
function nwRaw(x,z){let h=(fbm(x*.0065-11,z*.0065+5)-.5)*32+(fbm(x*.03,z*.03)-.5)*4;
  h+=ridged(x*.008+3,z*.008)*14*smooth(-100,100,z);// pressure ridges toward the dark
  h+=bump(x,z,-170,20,60,16);// the ice cave massif
  let edge=Math.max(0,Math.max(Math.abs(x),Math.abs(z))-272)*1.4;if(z<-250)edge*=smooth(10,34,Math.abs(x));return h+edge;}
const NW_H={harbor:nwRaw(30,-190),cave:nwRaw(-180,30),kestrel:nwRaw(190,120),cache:nwRaw(-220,-120),anik:nwRaw(-60,150)};
function nwHeight(x,z){let h=nwRaw(x,z);
  h=flatTo(h,x,z,30,-190,40,64,2);h=flatTo(h,x,z,0,215,30,52,3);h=flatTo(h,x,z,190,120,16,28,NW_H.kestrel);h=flatTo(h,x,z,-220,-120,14,24,NW_H.cache);h=flatTo(h,x,z,-60,150,10,18,NW_H.anik);
  // the ice cave: a bowl carved into the massif, reached by a narrow cut from the east
  const dc=Math.hypot(x+180,z-30);h=lerp(h,NW_H.cave-6,1-smooth(18,26,dc));const cut=Math.abs(z-30)<5&&x>-180&&x<-130;if(cut)h=lerp(h,NW_H.cave-6+(x+180)*.08,1-smooth(2.5,5,Math.abs(z-30)));
  // the frozen lake
  h=flatTo(h,x,z,-60,-20,26,40,-2);
  if(z<-210)h=lerp(h,2,(1-smooth(6,16,Math.abs(x)))*.8);
  return h;}
const NWC={snow:new THREE.Color(0xd8e0f0),blue:new THREE.Color(0x8aa0c8),rock:new THREE.Color(0x4a4a5e),dark:new THREE.Color(0x2a2a3e),ice:new THREE.Color(0x9ad0f0),pave:new THREE.Color(0x5a5a6a),glow:new THREE.Color(0x4a8a8a)};
const fczH=(x,z,cx,cz)=>Math.atan2(cx-x,cz-z);
const HARBOR_ARCH=[
  {id:'harbor',x:30,z:-206,face:fczH(30,-206,30,-190),w:3,d:3,floors:3,kind:'commons',accent:'cyan',name:'COLD HARBOR',sub:'RESEARCH STATION',neon:'COLD HARBOR',healLabel:'Use the station med-bay',light:0xd8f0ff},
  {id:'lab2',x:8,z:-182,face:fczH(8,-182,30,-190),w:2,d:2,floors:2,kind:'lab',accent:'cyan',name:'LAB 2',light:0xc8f0ff},
  {id:'galley',x:52,z:-180,face:fczH(52,-180,30,-190),w:3,d:2,floors:2,kind:'cantina',accent:'orange',name:'GALLEY',sub:'COLD HARBOR',neon:'GALLEY',light:0xffc890},
  {id:'quarters',x:10,z:-208,face:fczH(10,-208,30,-190),w:3,d:2,floors:3,kind:'bunks',accent:'cyan',name:'QUARTERS',sub:'COLD HARBOR'},
  {id:'archive',x:54,z:-206,face:fczH(54,-206,30,-190),w:2,d:2,floors:3,kind:'admin',accent:'cyan',name:'ARCHIVE',sub:'INDEX',
    log:['harbor_archive','Archive index, shelf 4','Spire readings, cross-referenced against the aurora log. Every time the Choir sings, the spire answers eleven seconds later. Index flagged this as coincidence. Index has never flagged anything as coincidence before.']}];
const HA=id=>HARBOR_ARCH.find(b=>b.id===id);
ZONES.nightward={arch:HARBOR_ARCH,bloom:{threshold:1.0,strength:1.1},id:'nightward',name:'The Nightward Expanse',world:'Ossery b',blurb:'Ice plains under a sun that never rises. The Signal Spire stands at the edge of the dark.',kind:'outdoor',size:640,seed:37,lvl:[8,14],
  detail:'ice',
  sky:{aurora:()=>zoneState('nightward').flags.used_spire1?1:.25,night:0x02030c,dusk:0x0a1a3a,sun:0x4a6aa8,horizon:0x1a2a4a,stars:1.4,sunElev:-3,sunAz:3.1,nightAmt:.6,aur1:0x5affb0,aur2:0x6a5aff,fog:[0x101830,50,360],hemi:[0x6a8ac8,0x0a0a1a,.75],sunColor:0x8aa8e8,sunInt:.45,
    bodies:[{type:'giant',dir:[-500,380,900],r:170,tilt:.5,color:0xb0c0ff},{type:'moon',dir:[700,300,400],r:30,color:0xd8e0ff}]},
  tempAt:(x,z)=>{const t=-14-(z+300)*.06-(Math.hypot(x+180,z-30)<30?10:0);return Math.hypot(x-30,z+190)<36?Math.max(t,4):t;},
  height:nwHeight,
  color:(x,z,y,sl,c)=>{const n=fbm(x*.05+3,z*.05);c.copy(NWC.snow).lerp(NWC.blue,clamp(n*1.5-.4,0,1));c.lerp(NWC.rock,smooth(.35,.8,sl));c.lerp(NWC.dark,smooth(.7,1,sl)*.6);
    c.lerp(NWC.ice,(1-smooth(22,40,Math.hypot(x+60,z+20)))*.85);c.lerp(NWC.pave,(1-smooth(30,46,Math.hypot(x-30,z+190)))*.6);c.lerp(NWC.glow,(1-smooth(10,34,Math.hypot(x,z-224)))*.5);const g=.92+n*.16;c.r*=g;c.g*=g;c.b*=g;},
  keep:[{x:30,z:-190,r:48},{x:0,z:215,r:34},{x:190,z:120,r:20},{x:-180,z:30,r:24},{x:0,z:-300,r:16},{x:-60,z:-20,r:36}],
  flora:[{type:'iceSpire',count:160,where:(x,z,y)=>fbm(x*.02,z*.02+4)>.5},{type:'iceSpire',count:60,where:(x,z)=>{const d=Math.hypot(x+180,z-30);return d>22&&d<44;}},
    {type:'rock',count:200,where:()=>true,mat:'basalt',hsl:[.6,.7,.08,.18,.35,.55]},{type:'crystal',count:80,where:(x,z)=>fbm(x*.025,z*.025)>.62||Math.hypot(x,z-224)<40,hue:[.45,.55],emissive:0x2a8aa0},
    {type:'deadTree',count:20,where:(x,z)=>z<-100&&fbm(x*.03,z*.03)>.55,color:0x6a7088}],
  entries:{fromTwi:{x:0,z:-288,face:0},ship:{x:30,z:-170,face:0},town:{x:30,z:-176,face:0}},spawn:{x:0,z:-280,face:0},
  build(ctx){const st=ctx.state(),P=ctx.P;
    if(st.flags.used_spire1)skyMat.uniforms.aurora.value=1;
    /* ---- Cold Harbor research station ---- */
    ctx.safe(30,-190,46);ctx.poi('harbor',30,-190,'Cold Harbor',{r:40,ft:true,icon:'town'});
    
    PF.tower(ctx,40,-224,22);PF.tower(ctx,-2,-200,14);PF.container(ctx,46,-164,.3,0x4a6a8a);PF.crates(ctx,14,-170,5,6);PF.barrels(ctx,50,-196,4,2);PF.rover(ctx,-4,-176,1,{color:0xb8c8d8});
    {const y=groundY(30,-160),g=grp(ctx,30,y,-160,0);P.add(g,MAT.metal,cyl(.25,.4,8,12),0,4,0);P.add(g,MAT.hull,sph(3,40,16,0,6.3,0,1.2),0,8.6,0,2.2,0,0);P.add(g,MAT.metal,cyl(.06,.06,3,8),0,10,1.6,.9,0,0);ctx.col(30,-160,1);}
    lampRing(ctx,30,-190,40,12,0x8fd8ff);PF.gate(ctx,30,-232,0,'COLD HARBOR','RESEARCH POST');campfire(ctx,22,-176);
    ctx.bench(46,-188,-Math.PI/2);ctx.board(18,-176,Math.PI*.8,'nightward','Cold Harbor Contract Board');
    ctx.npc('varga',30,-194,Math.PI);ctx.npc('pavo',12,-186,Math.PI/2,{type:'route',pts:[[12,-186],[30,-160],[46,-172],[24,-180]],pause:[4,9]});ctx.npc('siku',20,-172,Math.PI*.8);ctx.npc('hale',archAt(HA('galley'),0,-2.15).x,archAt(HA('galley'),0,-2.15).z,-Math.PI/2);ctx.npc('index',archAt(HA('archive'),0,-1.2).x,archAt(HA('archive'),0,-1.2).z,-Math.PI/2);
    spawnCrowd(30,-190,26,6,{barks:['Is it colder today? It\'s always colder today.','The aurora was beautiful last night.','The spire\'s been humming.','Don\'t go near the ice caves.','Hale\'s soup is the only reason I\'m still here.']});
    vesperPad(ctx,-8,-226,.4,{y:2});
    /* ---- weather pods ---- */
    for(const [id,x,z,n] of [['pod1',-90,-80,'western'],['pod2',120,-60,'eastern'],['pod3',60,60,'northern']]){const y=groundY(x,z),g=grp(ctx,x,y,z,rr(0,3));P.add(g,MAT.metal,cyl(.1,.14,3,8),0,1.5,0);P.add(g,MAT.hull,sph(.7,24,12),0,3.3,0);P.add(g,MAT.metal,RB(1.6,.06,.2,.02,1),0,3.6,0);
      const l=new THREE.Mesh(sph(.12,10,8),MAT.red);l.position.set(0,4.1,0);g.add(l);ctx.anim(()=>{l.material=st.flags['used_'+id]?MAT.teal:MAT.red;});ctx.col(x,z,.6);qUse(ctx,id,x+1.4,z,'Reset the '+n+' weather pod');ctx.enemies('frost',x,z,16,2,9);}
    /* ---- the ice caves ---- */
    ctx.poi('icecaves',-180,30,'Ice Caves',{r:28});
    {const cy=NW_H.cave-6;for(let i=0;i<10;i++){const a=i/10*6.28;if(Math.abs(wrapA(a))<.4)continue;const x=-180+Math.cos(a)*20,z=30+Math.sin(a)*20;P.add(ctx.g,MAT.ice,crystalGeo(1,1,.3,5),x,cy-1,z,Math.cos(a)*.5,a,Math.sin(a)*-.5,4,18,4);}
      for(let i=0;i<5;i++){const a=i/5*3.14+.3;P.add(ctx.g,MAT.iceSolid,tor(18,1.4,8,24,Math.PI*.7),-180,cy+6+i*.6,30,0,a,Math.PI/2);}
      ctx.light(-180,cy+5,30,0x8fd8ff,1.6,30);ctx.light(-140,groundY(-140,30)+3,30,0x8fd8ff,1,20);
      const relay=PF.relay(ctx,-190,40,!!st.flags.used_relay_cold);qUse(ctx,'relay_cold',-187,42,'Restart the cave relay',{ok:()=>!!st.killed.cavebrood,act:()=>{relay.set(true);sfx('zap');}});
      ctx.boss('brood','cavebrood',-180,30,11,{name:'Cave Brood Mother',scale:1.25,hpMul:1.8});ctx.enemies('frost',-176,30,14,5,10);ctx.enemies('frost',-145,30,8,3,9);ctx.nodes('shard',-180,30,14,4);ctx.chest('nw_cave',-194,22,{kind:'locked'});
      ctx.log('nw_cave',-170,20,'Cold Harbor tech, voice note','“Relay\'s down again. Something\'s nesting in the cave. I\'m not going back in there for any amount of hazard pay.” — P. Kessler');}
    /* ---- the Signal Spire ---- */
    ctx.poi('spire',0,224,'The Signal Spire',{r:40});const S=PF.spire(ctx,0,232,26);S.lit=st.flags.used_spire1?1:0;ruins(ctx,0,224,30,12,{tall:6});
    ctx.boss('warden','warden',0,200,13);qUse(ctx,'spire1',0,226,'Touch the Signal Spire',{ok:()=>!!st.killed.warden,act:()=>{S.lit=1;skyMat.uniforms.aurora.value=1;sfx('warp');FX.burst(new THREE.Vector3(0,groundY(0,226)+3,226),0x8fffe0,80,8,1,.18);}});
    ctx.glyph('g_nw1',-24,250);ctx.log('nw_spire',18,204,'Choir prayer card','“We sing so that the door remembers us.” Printed on cheap plastic. There are dozens of them, frozen into the ice.');
    /* ---- the Kestrel Dawn ---- */
    ctx.poi('kestrel',190,120,'Wreck of the Kestrel Dawn',{r:30});
    {const y=NW_H.kestrel,s=PF.shuttle(ctx,190,y-1.2,120,.8,3.4,0x9aa0b0);s.rotation.z=.3;s.rotation.x=.12;ctx.col(190,120,6);const a=toW(190,120,.8,0,9),b=toW(190,120,.8,0,-9);ctx.col(a.x,a.z,4);ctx.col(b.x,b.z,4);debris(ctx,190,120,22,30);
      const d=decal(['KESTREL DAWN','HALCYON LINES · KD-04'],6,1,{fg:'#2a2436'});d.position.set(194,y+4,124);d.rotation.y=.8+Math.PI/2;ctx.g.add(d);ctx.light(196,y+2,114,0xff3a2a,1,12,true);
      qUse(ctx,'kestrel_core',198,112,'Pull the Kestrel Dawn\'s navigation core',{persist:false,ok:()=>qStage('m09_grounded')>=GR.REPAIR&&!countItem('navcore')&&!G.flags.vr_nav&&!G.flags.vesperFixed,act:()=>{give('navcore');vesta('Navigation core recovered. Tamsin will want this.');}});
      qUse(ctx,'kestrel_emitter',183,116,'Pull the Kestrel Dawn\'s holo emitter',{persist:false,ok:()=>qStage('m09_grounded')>=GR.REPAIR&&!countItem('emitter')&&!G.flags.vr_emitter,act:()=>{give('emitter');vesta('Her emitter. The Kestrel\'s assistant used it for years. I\'ll try to make it mine.');}});
      ctx.enemies('frost',190,120,20,5,12);ctx.enemies('brood',204,140,6,1,13);ctx.chest('nw_kestrel',180,110,{kind:'locked',lockText:'The Kestrel\'s secure locker. It needs a Data Chip.'});
      ctx.log('nw_kestrel',184,128,'Kestrel Dawn captain\'s log','“Halcyon wants us to scan the spire and leave. No landing. Our passenger, the girl from the Choir, keeps humming. The navigator says the instruments hum back.”');}
    /* ---- Anik and the snares ---- */
    ctx.poi('snares',-60,150,'Ranger Snares',{r:20});{const y=NW_H.anik;PF.tent(ctx,-56,154,.3,MAT.fabricTeal);ctx.light(-60,y+2,150,0xffc35a,.8,10,true);}
    qUse(ctx,'anik',-60,148,'Help Anik',{ok:()=>qStage('s_lost')>=1});ctx.enemies('frost',-60,140,18,4,11);
    /* ---- frozen cache and the white alpha ---- */
    ctx.poi('cache',-220,-120,'Frozen Cache',{r:20});ctx.chest('nw_cache',-222,-118,{kind:'locked'});ctx.chest('nw_cache2',-214,-126,{});PF.crates(ctx,-226,-112,6,9);
    qBoss(ctx,'s_hunt','frost','frostalpha',-220,-120,14,{name:'The White Alpha',scale:1.9,hpMul:5,elite:true});ctx.enemies('frost',-220,-120,20,3,12);ctx.glyph('g_nw2',-250,-160);
    /* ---- Index's data shards ---- */
    for(const [id,x,z] of [['ishard1',150,-150],['ishard2',-140,-200],['ishard3',100,180]]){const y=groundY(x,z);debris(ctx,x,z,6,8);P.add(ctx.g,MAT.screens[2],new THREE.PlaneGeometry(.3,.4),x,y+.15,z,-Math.PI/2,0,0);qUse(ctx,id,x,z,'Recover the data shard');}
    /* ---- ice ridge climb ---- */
    {const bx=120,bz=-110,y=groundY(bx,bz);stones(ctx,[[bx,bz,1.4,1.2],[bx+2.6,bz+1.4,2.7,1],[bx+4.4,bz+3.8,4,1],[bx+3.2,bz+6.6,5.3,1],[bx+.6,bz+8,6.6,1.6]],{from:y,mat:MAT.iceSolid});
      ctx.chest('nw_ridge',bx+.6,bz+8,{y:y+6.6});ctx.glyph('g_nw3',bx-1.2,bz+9.4);boulder(ctx,bx+.6,bz+10,4,MAT.iceSolid);}
    /* ---- the frozen lake ---- */
    {const m=new THREE.Mesh(new THREE.CircleGeometry(30,48),new THREE.MeshStandardMaterial({color:0xb8e0ff,roughness:.05,metalness:.4,transparent:true,opacity:.6}));m.rotation.x=-Math.PI/2;m.position.set(-60,-1.9,-20);ctx.g.add(m);ctx.poi('lake',-60,-20,'The Glass Lake',{r:30});ctx.nodes('shard',-60,-20,24,4);}
    /* ---- the open expanse ---- */
    ctx.enemies('frost',-60,-120,30,5,9);ctx.enemies('frost',100,0,30,6,10);ctx.enemies('frost',-120,90,30,5,12);ctx.enemies('frost',90,200,30,5,13);ctx.enemies('brood',-240,200,10,1,14);ctx.enemies('frost',-240,200,20,4,13);ctx.enemies('frost',240,-200,24,4,11);
    ctx.nodes('scrap',190,120,24,4);ctx.nodes('powercell',30,-120,40,3);ctx.nodes('shard',-120,90,40,5);ctx.nodes('alloy',240,-200,30,3);
    ctx.chest('nw_north',-240,206,{kind:'locked'});ctx.chest('nw_east',246,-196,{});ctx.glyph('g_nw4',250,40);
    ctx.log('nw_varga',60,-120,'Research memo, Dr. I. Varga','“The frost skitters are not native to the night side. Their DNA is a twilight skitter\'s, edited. Someone made them for the cold. Long ago.”');
    ctx.log('nw_hale',-100,-150,'Hale\'s recipe scrawl','“Frost chitin broth: boil for six hours. Add glowcaps. Pray.”');
    PF.gate(ctx,0,-292,0,'NIGHTWARD PASS','TO MERIDIAN');ctx.travel(0,-304,'twilight','fromNight','Travel to the Twilight Band',{r:6});
  }};

// ===== 53_z_interiors.js =====
/* ================= INTERIORS: the Vesper and Anchorage station ================= */
const INT_SKY={showSky:false,fog:[0x0c0a14,40,170],hemi:[0xd0d4ec,0x3a3846,1.55],sunInt:.6,sunColor:0xd8e0ff,bodies:[]};
const shipName=id=>ZONES[id]?ZONES[id].name:id;
// the Vesper's decks are in 53b_vesper.js

/* Anchorage station is in 53d_anchorage.js */

// ===== 53b_vesper.js =====
/* ================= THE VESPER: inside the ship ================= */
// The decks are lined with pieces of "Spaceship Corridor" by ABSoln (CC BY-NC 4.0): wall, floor and ceiling-light strips cut
// from it (assets/shipkit.glb). One navigation terminal ("Free Terminal 2" by Inditrion Dradnon, CC BY 4.0) and two seats
// ("Spaceship_chair" by @blue.blender.print, CC BY 4.0) on the bridge.
// Deck plan (z runs aft to fore; the bridge is at +z):
//   engineering  z -15..-8   ·   cargo bay with the belly ramp  z -8..0
//   corridor z 0..9 between quarters (+x) and the med bay (-x)   ·   bridge  z 9..17, under the canopy
// Before the Vesper is repaired the same decks are dark and damaged: red emergency light, sparks, smoke, fallen panels.
const VK={H:3.1,TILE:4,FLOOR_W:2.33,DEPTH:.55};
// each piece comes wrapped: its own node carries the scale and offset that undo the file's compressed coordinates, so it must be
// left alone and the wrapper placed instead
const vkPiece=n=>{const M=MODELS.shipkit;if(!M)return null;const o=M.scene.getObjectByName(n);if(!o)return null;const c=o.clone(true);c.traverse(q=>{if(q.isMesh){q.castShadow=false;q.receiveShadow=true;}});const w=new THREE.Group();w.add(c);return w;};
// a wall from A to B whose panelled face looks into the room on the given side (nx,nz points out of the room)
function vkWall(ctx,ax,az,bx,bz,nx,nz,o={}){const y0=W.floorY;let ux=bx-ax,uz=bz-az;const L=Math.hypot(ux,uz);if(L<.1)return;ux/=L;uz/=L;
  if(uz*nx-ux*nz<0){[ax,bx,az,bz]=[bx,ax,bz,az];ux=-ux;uz=-uz;}// the piece's outer side is its +x: keep it on the room's outside
  const ry=Math.atan2(ux,uz),n=Math.max(1,Math.ceil(L/VK.TILE-.15)),sl=L/n;
  for(let i=0;i<n;i++){const p=vkPiece('wall');if(!p)break;const g=new THREE.Group();g.add(p);p.position.x=-1.63;g.scale.set(VK.DEPTH,1,sl/VK.TILE);
    g.position.set(ax+ux*i*sl,y0+1.55,az+uz*i*sl);g.rotation.y=ry;ctx.g.add(g);}
  // solid: a thin box along the panel face
  {const cx=(ax+bx)/2-nx*.24,cz=(az+bz)/2-nz*.24;ctx.P.add(ctx.g,MAT.hullDark,RB(Math.abs(ux)>.5?L:.48,.42,Math.abs(ux)>.5?.48:L,.04,1),cx,y0+2.93,cz);ctx.P.add(ctx.g,MAT.metal,RB(Math.abs(ux)>.5?L:.5,.06,Math.abs(ux)>.5?.5:L,.02,1),cx,y0+2.72,cz);}
  const mx=(ax+bx)/2-nx*.28,mz=(az+bz)/2-nz*.28;ctx.plat({x:mx,z:mz,hw:Math.abs(ux)>.5?L/2:.3,hd:Math.abs(ux)>.5?.3:L/2,rot:0,top:y0+VK.H,bot:y0-1});}// solid through the panel's whole depth
// a wall with doorways: gaps listed as [centre offset from A, width]
function vkWallGaps(ctx,ax,az,bx,bz,nx,nz,gaps=[]){const L=Math.hypot(bx-ax,bz-az),ux=(bx-ax)/L,uz=(bz-az)/L;let t=0;
  for(const [c,w] of [...gaps].sort((a,b)=>a[0]-b[0])){vkWall(ctx,ax+ux*t,az+uz*t,ax+ux*(c-w/2),az+uz*(c-w/2),nx,nz);t=c+w/2;}vkWall(ctx,ax+ux*t,az+uz*t,bx,bz,nx,nz);}
// both faces of a partition between two rooms
function vkPartition(ctx,ax,az,bx,bz,nx,nz,gaps){vkWallGaps(ctx,ax+nx*.02,az+nz*.02,bx+nx*.02,bz+nz*.02,nx,nz,gaps);vkWallGaps(ctx,ax-nx*.02,az-nz*.02,bx-nx*.02,bz-nz*.02,-nx,-nz,gaps);}
// floor and ceiling strips over a rectangle (skip: rectangles left open, such as the ramp well)
function vkDeck(ctx,x0,x1,z0,z1,o={}){const y0=W.floorY,nx=Math.ceil((x1-x0)/VK.FLOOR_W),nz=Math.ceil((z1-z0)/VK.TILE),sx=(x1-x0)/nx,sz=(z1-z0)/nz,skip=o.skip||[];
  for(let i=0;i<nx;i++)for(let k=0;k<nz;k++){const cx=x0+(i+.5)*sx,z=z0+k*sz;
    if(!skip.some(r=>cx>r[0]&&cx<r[1]&&z+sz/2>r[2]&&z+sz/2<r[3])){const f=vkPiece('floor');if(f){f.position.set(cx,y0+1.55,z);f.scale.set(sx/VK.FLOOR_W,1,sz/VK.TILE);ctx.g.add(f);}}
    const c=vkPiece('ceil');if(c){c.position.set(cx,y0+1.55,z);c.scale.set(sx/VK.FLOOR_W,1,sz/VK.TILE);ctx.g.add(c);}}
  ctx.P.add(ctx.g,MAT.hullDark,new THREE.PlaneGeometry(x1-x0,z1-z0),(x0+x1)/2,y0+VK.H+.04,(z0+z1)/2,Math.PI/2,0,0);
  ctx.P.add(ctx.g,MAT.hullDark,new THREE.PlaneGeometry(x1-x0,z1-z0),(x0+x1)/2,y0-.02,(z0+z1)/2,-Math.PI/2,0,0);}
// a framed doorway with two panels that slide apart when you come near
function vkDoor(ctx,x,z,along,w,o={}){const y0=W.floorY,g=grp(ctx,x,y0,z,along==='x'?0:Math.PI/2),P=ctx.P,h=2.5;
  for(const s of[-1,1]){P.add(g,MAT.metal,RB(.22,h+.3,.7,.04,1),s*(w/2+.11),(h+.3)/2,0);P.add(g,o.glow||MAT.tealGlow,RB(.04,h,.72,.01,1),s*(w/2+.02),h/2,0);}
  P.add(g,MAT.metal,RB(w+.66,.35,.7,.05,1),0,h+.18,0);
  // the frame is solid to the camera (you walk under the lintel; it only stops the camera settling inside it)
  {const ax=along==='x';ctx.plat({x,z,hw:ax?w/2+.35:.36,hd:ax?.36:w/2+.35,rot:0,top:y0+VK.H,bot:y0+h-.05,nocollide:true});}P.add(g,o.glow||MAT.amberGlow,RB(w*.6,.05,.72,.01,1),0,h+.02,0);
  const panels=[];for(const s of[-1,1]){const pm=new THREE.Mesh(RB(w/2,h,.12,.03,1),MAT.hullDark);pm.position.set(s*w/4,h/2,0);g.add(pm);const st=new THREE.Mesh(RB(.06,h*.8,.13,.01,1),o.glow||MAT.tealGlow);st.position.set(s*-.05,0,0);pm.add(st);panels.push({m:pm,s});}
  const set=v=>{for(const p of panels)p.m.position.x=p.s*(w/4+v*w*.5);};let open=0;
  // damaged doors: 'slow' ones grind open in fits and starts; 'force' ones are jammed shut until you lever them apart
  if(o.mode==='force'){const st=ctx.state(),key='door_'+o.id,ax=along==='x';
    const block=ctx.plat({x,z,hw:ax?w/2:.2,hd:ax?.2:w/2,rot:0,top:y0+h,bot:y0-1});
    const done=()=>{block.top=block.bot=-99;};if(st.flags[key]){open=.62;set(open);done();}
    let pry=-1;ctx.inter({pos:()=>({x,z}),r:2.2,label:()=>'Force the jammed door',ok:()=>!st.flags[key]&&pry<0,act:()=>{pry=0;sfx('thump');}});
    ctx.anim(dt=>{if(pry<0||pry>=1)return;pry=Math.min(1,pry+dt*.55);const k=Math.floor(pry*5),j=pry*5-k;
      const tgt=.62*Math.min(1,(k+smooth(.3,.7,j))/5);open+=(tgt-open)*Math.min(1,dt*9);set(open);
      if(Math.random()<.12){vkGrind(x,z);for(let i=0;i<8;i++)FX.spawn(x+rf(-.2,.2),y0+rf(.6,2),z+rf(-.2,.2),rf(-1.5,1.5),rf(0,2),rf(-1.5,1.5),{life:rf(.2,.5),size:rf(.03,.06),c0:0xffffff,c1:0xffa040,drag:1.2,grav:9});}
      if(pry>=1){st.flags[key]=true;done();sfx('thump');toast('The door gives way.','',2200);}});
    set(0);return;}
  if(o.mode==='slow'){let was=0;ctx.anim(dt=>{const want=Math.hypot(player.x-x,player.z-z)<3.4?.82:0,t=performance.now()/1000;
      if(Math.sin(t*5.3+x)>-.25){const step=dt*.32*(want>open?1:.6);open=want>open?Math.min(want,open+step):Math.max(want,open-step);}
      const moving=Math.abs(open-was)>1e-4;if(moving&&Math.random()<.02)vkGrind(x,z);was=open;set(open+Math.sin(t*40)*.004*(moving?1:0));});return;}
  ctx.anim(dt=>{const want=Math.hypot(player.x-x,player.z-z)<3.4?1:0;open+=(want-open)*Math.min(1,dt*5);set(open);});}
// a short metallic grind where something heavy is forced
// brightness of a failing light at time t (each fitting has its own seed): a buzzing sag, and short blackouts
function dmgFlick(t,seed){const h=v=>{const q=Math.sin(v*12.9898+seed*78.233)*43758.5453;return q-Math.floor(q);};const slot=Math.floor(t*7);
  if(h(slot)<.16)return h(slot+.5)*.08;return .7+.2*Math.sin(t*31+seed)*Math.sin(t*4.3+seed*2)+.1*h(Math.floor(t*30));}
function vkGrind(x,z){const d=Math.hypot(x-player.x,z-player.z);if(d>14)return;noise(.35,.07*(1-d/14),380,'lowpass');noise(.2,.03*(1-d/14),2600,'bandpass');}
// what the bridge canopy looks out on: wherever the ship is parked, or the sky above the crash site
function vkView(){const c=mkCanvas(1024);c.height=512;const g=c.getContext('2d');const at=G.flags.vesperFixed?(G.shipAt||'twilight'):'crash';
  const sky={crash:['#140a1a','#4a1e34','#b8603a'],twilight:['#120c22','#3a2048','#c8704a'],dayward:['#3a2010','#c06a2a','#ffc070'],nightward:['#02040c','#0c1a34','#2a5070'],calder:['#06141c','#145060','#5ab8b0'],ashfall:['#100406','#401010','#c03a1a'],anchorage:['#020208','#060814','#101828']}[at]||['#120c22','#3a2048','#c8704a'];
  const gr=g.createLinearGradient(0,0,0,512);gr.addColorStop(0,sky[0]);gr.addColorStop(.62,sky[1]);gr.addColorStop(1,sky[2]);g.fillStyle=gr;g.fillRect(0,0,1024,512);
  for(let i=0;i<500;i++){g.fillStyle=`rgba(255,255,255,${Math.random()*(at==='dayward'?.15:.8)})`;g.fillRect(Math.random()*1024,Math.random()*300,1,1);}
  {const sx=at==='crash'?260:700,sy=at==='dayward'?150:300,sg=g.createRadialGradient(sx,sy,4,sx,sy,120);sg.addColorStop(0,'rgba(255,240,220,.95)');sg.addColorStop(.15,'rgba(255,200,150,.5)');sg.addColorStop(1,'rgba(255,160,120,0)');g.fillStyle=sg;g.fillRect(0,0,1024,512);}
  if(at==='anchorage'){const pg=g.createRadialGradient(700,760,60,700,760,420);pg.addColorStop(0,'#c88a5a');pg.addColorStop(.6,'#6a3a48');pg.addColorStop(1,'rgba(20,10,30,0)');g.fillStyle=pg;g.beginPath();g.arc(700,780,420,0,7);g.fill();}
  else{g.fillStyle='rgba(10,6,12,.92)';g.beginPath();g.moveTo(0,512);let y=380;for(let x=0;x<=1024;x+=16){y+=(Math.random()-.5)*14;y=Math.max(330,Math.min(430,y));g.lineTo(x,at==='crash'?y+40-x*.06:y);}g.lineTo(1024,512);g.fill();}
  if(at==='crash'){vdCracks(g,330,190,330,18);vdCracks(g,780,300,200,11);g.fillStyle='rgba(10,8,10,.35)';g.fillRect(0,0,1024,512);}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;}
function exitVesper(){const fixed=!!G.flags.vesperFixed,to=fixed?(G.shipAt||'twilight'):'twilight';sfx('door');
  enterZone(to,fixed?'ship':'crash').then(()=>{const r=W.vesperRamp;if(r){placePlayer(r.x,r.z,r.face);cam.yaw=wrapA(r.face+Math.PI);}});}
ZONES.vesper={id:'vesper',name:'ISV Vesper',world:'Your ship',get blurb(){return G.flags.vesperFixed?'Patched, fueled and almost spaceworthy.':'Crash-damaged and running on emergency power.';},kind:'interior',size:80,floorY:0,ceiling:3,seed:5,lvl:[1,1],sky:{...INT_SKY,hemi:[0xc8cce0,0x2e2c38,1.05],sunInt:.35},bloom:{threshold:1.2,strength:.45},
  tempAt:()=>20,entries:{ramp:{x:0,z:-.6,face:0},bridge:{x:0,z:12,face:0}},spawn:{x:0,z:-.6,face:0},
  build(ctx){const P=ctx.P,broken=!G.flags.vesperFixed,y0=W.floorY,X=5.5;
    // the ceiling light strips glow, but softly enough that the panels around them can still be read
    if(MODELS.shipkit)MODELS.shipkit.scene.traverse(q=>{if(q.isMesh&&q.material.name==='metal'&&!q.material.userData._dim){q.material.userData._dim=true;q.material.color.multiplyScalar(.74);}
      if(q.isMesh&&q.material.emissive&&q.material.emissive.r>.5){const m=q.material,u=m.userData;if(u._pb)delete u._pb;m.emissiveIntensity=.22;if(!u._dim){u._dim=true;m.color.multiplyScalar(.5);m.emissive.setRGB(.85,.92,1);}}});
    if(!MODELS.shipkit){PF.room(ctx,0,0,11,32,3.2,{});}
    /* ---- shell: decks, outer hull walls, partitions with doorways ---- */
    const well=[-1.7,1.7,-6.6,-2.2];// the open belly hatch in the cargo deck
    vkDeck(ctx,-X,X,-15,17,{skip:[well]});
    vkWall(ctx,X,-15,X,17,1,0);vkWall(ctx,-X,-15,-X,17,-1,0);vkWall(ctx,-X,-15,X,-15,0,-1);
    vkPartition(ctx,-X,-8,X,-8,0,1,[[X,2.4]]);// engineering | cargo
    vkPartition(ctx,-X,0,X,0,0,1,[[X,3]]);// cargo | corridor, quarters, med bay
    vkPartition(ctx,1.6,0,1.6,9,1,0,[[4.5,1.8]]);vkPartition(ctx,-1.6,0,-1.6,9,-1,0,[[4.5,1.8]]);// corridor | quarters, med bay
    vkPartition(ctx,-X,9,X,9,0,1,[[X,3]]);// corridor | bridge
    const dm=m=>broken?m:null,dglow=broken?new THREE.MeshStandardMaterial({color:0x200806,emissive:0xff3a1a,emissiveIntensity:.32,roughness:.6}):null;
    vkDoor(ctx,0,-8,'x',2.4,{mode:dm('force'),id:'eng',glow:dglow});vkDoor(ctx,0,0,'x',3,{mode:dm('slow'),glow:dglow});vkDoor(ctx,1.6,4.5,'z',1.8,{mode:dm('force'),id:'qtr',glow:dglow});vkDoor(ctx,-1.6,4.5,'z',1.8,{mode:dm('slow'),glow:dglow||MAT.tealGlow});vkDoor(ctx,0,9,'x',3,{mode:dm('slow'),glow:dglow});
    /* ---- bridge: the canopy, one terminal, the pilot's seat at it and a second seat ---- */
    {const win=new THREE.Mesh(new THREE.PlaneGeometry(2*X,2.6),new THREE.MeshBasicMaterial({map:vkView()}));win.position.set(0,y0+1.75,16.95);win.rotation.y=Math.PI;ctx.g.add(win);
      for(const x of[-X*.5,X*.5])P.add(ctx.g,MAT.metal,RB(.14,2.7,.2,.04,1),x,y0+1.75,16.9);P.add(ctx.g,MAT.metal,RB(2*X,.22,.3,.05,1),0,y0+3.08,16.9);P.add(ctx.g,MAT.hullDark,RB(2*X,.45,.6,.06,1),0,y0+.22,16.75);
      ctx.plat({x:0,z:16.9,hw:X,hd:.25,rot:0,top:y0+VK.H,bot:y0-1});
      if(MODELS.sterm){const t=MODELS.sterm.scene.clone(true),fit=new THREE.Group();fit.add(t);const b=new THREE.Box3().setFromObject(fit),s=b.getSize(new THREE.Vector3()),k=2.6/s.x,cn=b.getCenter(new THREE.Vector3());
        fit.scale.setScalar(k);fit.position.set(-cn.x*k,-b.min.y*k,-cn.z*k);const g=grp(ctx,0,y0,15,Math.PI);g.add(fit);
        t.traverse(q=>{if(q.isMesh){q.material=q.material.clone();if(q.material.emissiveMap||q.material.emissive){q.material.emissiveIntensity=broken?.3:.85;}q.userData.term=true;}});
        if(broken){const scr=[];t.traverse(q=>{if(q.isMesh&&(q.material.emissiveMap||q.material.emissive&&q.material.emissive.r+q.material.emissive.g+q.material.emissive.b>.1)){q.material.emissiveIntensity=0;scr.push(q);}});
          // the main screen is smashed: a crack web laid over its face
          g.updateMatrixWorld(true);if(scr.length){const bb=new THREE.Box3();scr.forEach(q=>bb.expandByObject(q));const c=bb.getCenter(new THREE.Vector3()),sz2=bb.getSize(new THREE.Vector3());
            const ck=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.6,sz2.x*.9),Math.max(.4,sz2.y*.8)),new THREE.MeshBasicMaterial({map:vdCrackTex(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4}));
            ck.position.set(c.x,c.y,bb.min.z-.015);ck.rotation.y=Math.PI;ctx.g.add(ck);}
          let st=0;ctx.anim(dt=>{if(G.flags.vr_nav){scr.forEach(q=>{q.material.emissiveIntensity=.45;});return;}st-=dt;if(st<-rf(3,9))st=rf(.05,.18);const on=st>0;scr.forEach((q,i)=>{q.material.emissiveIntensity=on&&i===0?rf(.1,.5):0;});});}}
      ctx.box(0,15,1.7,.8,0,1.2);
      const seat=(x,z,ry,down)=>{if(!MODELS.schair)return;const c=MODELS.schair.scene.clone(true),fit=new THREE.Group();fit.add(c);const b=new THREE.Box3().setFromObject(fit),s=b.getSize(new THREE.Vector3()),k=1.35/s.y,cn=b.getCenter(new THREE.Vector3());
        fit.scale.setScalar(k);fit.position.set(-cn.x*k,-b.min.y*k,-cn.z*k);const g=grp(ctx,x,y0,z,ry);g.add(fit);c.traverse(q=>{if(q.isMesh)q.castShadow=true;});ctx.col(x,z,.45);
        if(down){g.rotation.set(0,ry,Math.PI/2);g.position.y=y0+.42;P.add(ctx.g,MAT.metal,cyl(.12,.16,.35,10),x+.9,y0+.18,z+.5);P.add(ctx.g,VDM.ok?VDM.copper:MAT.metal,cyl(.02,.02,.4,4),x+.9,y0+.45,z+.5,.4,0,.3);return;}
        ctx.inter({pos:()=>({x,z}),r:1.7,label:()=>'Sit down',ok:()=>!player.sit,act:()=>sitDown(x,z,ry-Math.PI,.4)});};
      if(broken){vdMats();seat(-.4,13.2,Math.PI*.6,true);seat(3.4,12.9,Math.PI-1.1);}else{seat(0,13.7,Math.PI);seat(3.2,13.2,Math.PI-.35);}
      // VESTA's projector
      // VESTA's projector: a stepped pedestal with a glowing emitter lens she is projected from
      P.add(ctx.g,MAT.hullDark,cyl(.85,.95,.12,40),-3.4,y0+.06,12.6);P.add(ctx.g,MAT.metal,cyl(.7,.8,.1,40),-3.4,y0+.17,12.6);P.add(ctx.g,MAT.tealGlow,tor(.74,.025,8,48),-3.4,y0+.22,12.6,Math.PI/2,0,0);
      for(let i=0;i<6;i++){const a=i/6*Math.PI*2;P.add(ctx.g,MAT.metal,RB(.12,.08,.3,.02,1),-3.4+Math.cos(a)*.62,y0+.25,12.6+Math.sin(a)*.62,0,-a,0);}
      const lens=new THREE.Mesh(cyl(.32,.32,.03,32),new THREE.MeshBasicMaterial({color:broken?0x2a6a62:0x8ffff0}));lens.position.set(-3.4,y0+.235,12.6);ctx.g.add(lens);
      // no beam column around her: just the figure standing on the lens
      ctx.anim(()=>{lens.material.color.setHex(broken&&Math.random()<.15?0x103030:broken?0x2a6a62:0x8ffff0);});
      {const vn=ctx.npc('vesta',-3.4,12.6,Math.PI/2);if(broken)vdGlitchHolo(ctx,vn,-3.4,12.6);}
      // while her projector is failing she can't speak from it, only through your suit
      if(broken)ctx.inter({pos:()=>({x:-3.4,z:12.6}),r:3,label:()=>'Check VESTA\'s projector',ok:()=>!G.flags.vr_emitter,act:()=>{sfx('deny');
        vesta(G.flags.vesperFixed?'':qStage('m09_grounded')>=GR.REPAIR?'That\'s my projector, or what\'s left of its emitter. The Kestrel Dawn\'s emitter should fit. Until then I\'m only in your suit.':'That\'s my projector. The emitter cracked when we hit. I can\'t hold a shape out there, so I\'m staying in your suit for now.',8000);}});
      ctx.use('starmap',0,13.9,()=>broken?'Check the navigation terminal':'Open the star map',{persist:false,act:()=>{if(broken){toast(G.flags.vr_nav?'Navigation core online, but the Vesper can\'t fly yet. No course to plot until the repairs are finished.':'Navigation offline. The core burned out in the crash and the display is smashed.','',4000);sfx('deny');return;}openStarMap();}});
      ctx.light(0,y0+2.8,12.5,broken?0xff3a2a:0xd8e6ff,broken?0.49:0.91,14);ctx.light(0,y0+1.3,15.4,0x5ae0ff,broken?0.21:0.7,6);}
    /* ---- quarters: bunk, locker, table and your note ---- */
    {ctx.bed(4.4,7.4,Math.PI/2);ctx.locker(4.9,1.4,-Math.PI/2);PF.table(ctx,3,4.2,0,1.1,.7,{stools:1});PF.shelf(ctx,4.9,4.3,-Math.PI/2,1.6);
      ctx.log('vs_note',3,4.2,'A note in your own handwriting','“If you\'re reading this, it worked, and you don\'t remember. Trust VESTA. Don\'t trust Halcyon. Find the second spire.” You don\'t remember writing it.',{y:.85});
      ctx.light(3.6,y0+2.7,4.5,broken?0xff3a2a:0xffd0a0,broken?0.35:0.7,9);}
    /* ---- med bay: the med pod ---- */
    {const g=grp(ctx,-3.9,y0,4.5,0);P.add(g,MAT.metal,RB(1.1,.7,2.3,.1,1),0,.35,0);P.add(g,broken?MAT.metal:MAT.white,RB(.9,.14,2,.06,1),0,.76,0);
      const lid=new THREE.Mesh(sph(.62,24,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0x9fe8ff,transparent:true,opacity:.22,roughness:.05,metalness:.3,depthWrite:false}));lid.scale.set(1,.6,1.8);lid.position.y=.8;if(!broken)g.add(lid);
      P.add(g,MAT.tealGlow,RB(1.12,.04,2.32,.01,1),0,.7,0);P.add(ctx.g,MAT.metal,RB(.9,1.6,.5,.06,1),-4.9,y0+.8,1.6);P.add(ctx.g,MAT.tealGlow,RB(.4,.12,.52,.01,1),-4.9,y0+1.3,1.6);P.add(ctx.g,MAT.tealGlow,RB(.12,.4,.52,.01,1),-4.9,y0+1.3,1.6);
      ctx.box(-3.9,4.5,.6,1.2,0,1);ctx.heal(-2.9,4.5,broken?'Use the med pod (emergency power)':'Use the med pod');ctx.light(-3.6,y0+2.6,4.5,broken?0xff3a2a:0xb8ffe8,broken?0.35:0.7,9);}
    /* ---- corridor ---- */
    for(const z of[2,6.5])ctx.light(0,y0+2.8,z,broken?0xff2a1a:0xffe2c0,broken?0.32:0.63,8);
    /* ---- cargo bay: crates, and the belly hatch down to the ground ---- */
    {PF.crates(ctx,-4,-5.5,4,8);PF.crates(ctx,4,-2.5,3,3);PF.barrels(ctx,4.2,-6.6,3,4);PF.shelf(ctx,-4.9,-1.6,Math.PI/2,2.4);
      const [wx0,wx1,wz0,wz1]=well,ww=wx1-wx0;
      const rg=grp(ctx,0,y0,wz1,0),rm=std(TEX.deck,{color:0x6a6e76,metalness:.6,roughness:.5});const ang=.42,len=(wz1-wz0)/Math.cos(ang)+1.2;
      const ramp=new THREE.Mesh(RB(ww-.2,.2,len,.05,1),rm);ramp.position.set(0,-Math.sin(ang)*len/2,-Math.cos(ang)*len/2);ramp.rotation.x=-ang;rg.add(ramp);
      for(const sd of[-1,1]){P.add(ctx.g,MAT.metal,RB(.1,1,wz1-wz0,.03,1),sd*(ww/2+.05),y0+.5,(wz0+wz1)/2);P.add(ctx.g,MAT.hazard,RB(.16,.1,wz1-wz0,.02,1),sd*(ww/2+.05),y0+.02,(wz0+wz1)/2);}
      P.add(ctx.g,MAT.hazard,RB(ww,.1,.2,.02,1),0,y0+.02,wz1);
      // daylight (or red emergency light) coming up through the hatch
      const glow=new THREE.Mesh(new THREE.PlaneGeometry(ww,wz1-wz0),new THREE.MeshBasicMaterial({color:broken?0xff8a5a:0xffe6b8,transparent:true,opacity:.9}));glow.rotation.x=-Math.PI/2;glow.position.set(0,y0-2.2,(wz0+wz1)/2);ctx.g.add(glow);
      ctx.light(0,y0+.4,(wz0+wz1)/2,broken?0xff7a4a:0xffe0b0,0.98,9);ctx.light(0,y0+2.8,-4,broken?0xff2a1a:0xffc890,broken?0.35:0.7,10);
      const label=()=>'Walk down the ramp to '+(G.flags.vesperFixed?shipName(G.shipAt||'twilight'):'the crash site');
      ctx.inter({pos:()=>({x:0,z:(wz0+wz1)/2+1.2}),r:2.4,label,ok:()=>true,act:exitVesper});
      // stepping onto the ramp takes you down it
      let gone=false;ctx.anim(()=>{if(!gone&&!UI.loading&&player.x>wx0+.2&&player.x<wx1-.2&&player.z>wz0&&player.z<wz1-.9){gone=true;exitVesper();}});}
    /* ---- engineering: the workbench and the drive core ---- */
    {ctx.bench(4.4,-12,-Math.PI/2);
      const g=grp(ctx,-3.2,y0,-12,0);P.add(g,MAT.metal,cyl(1,1,.3,24),0,.15,0);const core=new THREE.Mesh(cyl(.55,.55,2.4,24),new THREE.MeshStandardMaterial({color:0x103040,emissive:broken?0xff5a2a:0x5ab8ff,emissiveIntensity:1.4,transparent:true,opacity:.85}));core.position.y=1.5;g.add(core);
      for(let i=0;i<4;i++)P.add(g,MAT.metal,tor(.68,.06,8,24),0,.5+i*.65,0,Math.PI/2,0,0);P.add(g,MAT.metal,cyl(1,1,.3,24),0,2.85,0);ctx.box(-3.2,-12,1.1,1.1,0,3);
      ctx.light(-3.2,y0+1.8,-12,broken?0xff5a2a:0x5ab8ff,0.91,10);ctx.anim(()=>{if(broken&&G.flags.vr_coupling&&!core.userData.fixed){core.userData.fixed=1;core.material.emissive.setHex(0x5ab8ff);}core.material.emissiveIntensity=broken&&G.flags.vr_reactor?1+Math.sin(performance.now()*.004)*.2:broken&&G.flags.vr_coupling?.35:broken?.42*dmgFlick(performance.now()/1000,9):1.2+Math.sin(performance.now()*.004)*.25;});
      for(const x of[-1.5,1.5])P.add(ctx.g,MAT.metal,cyl(.12,.12,7,10),x,y0+2.7,-11.5,Math.PI/2,0,0);PF.crates(ctx,3.8,-14,3,6);}
    /* ---- before the repair: the decks took a beating ---- */
    if(broken){const smokes=[[-3,2.9,-11],[3,2.9,-4],[0,2.9,6]];
      // fallen ceiling strips and torn panels
      for(const [x,z,r] of[[-3.5,-3,.5],[2.2,6.5,-.4],[-2.4,11,.9],[3.5,-10,1.4]]){const c=vkPiece('ceil');if(c){const g=new THREE.Group();g.add(c);c.position.set(0,-1.45,-2);g.scale.set(.9,1,.6);g.position.set(x,y0+.25,z);g.rotation.set(.25,r,.5);ctx.g.add(g);}}
      const sc=new THREE.MeshBasicMaterial({map:dmgTex('scorch'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
      for(const [x,z,s] of[[-1,-4,3],[2,5,2.4],[-2.5,13,2.8],[1.5,-12,3]]){const d=new THREE.Mesh(new THREE.PlaneGeometry(s,s),sc);d.rotation.x=-Math.PI/2;d.position.set(x,y0+.06,z);ctx.g.add(d);}
      const smokeM=new THREE.SpriteMaterial({map:GLOW,color:0x3a3236,transparent:true,opacity:.3,depthWrite:false}),puffs=[];
      for(const v of smokes)for(let i=0;i<5;i++){const sp=new THREE.Sprite(smokeM.clone());sp.userData={o:v,t:i/5};ctx.g.add(sp);puffs.push(sp);}
            ctx.anim(dt=>{for(const sp of puffs){const u=sp.userData;u.t=(u.t+dt*.08)%1;sp.position.set(u.o[0]+u.t*1.5,y0+u.o[1]-u.t*.6,u.o[2]+Math.sin(u.t*4)*.5);sp.scale.setScalar(1+u.t*3);sp.material.opacity=.3*(1-u.t)*Math.min(1,u.t*5);}
      });
      ctx.log('vs_crashlog',-4.6,-1.4,'Flight recorder, last entry','“Hull breach, decks four through two. VESTA, take the helm. If I don\'t make it, get the core to the second spire.” Static.',{y:.9});
      vesperDamage(ctx,X);}
  }};

// ===== 53c_vesper_damage.js =====
/* ================= THE VESPER, CRASHED: the decks before the repair ================= */
// Everything that makes the first walk through the ship feel like it came down hard: failing lights, cables hanging out of the
// ceiling, panels torn loose, a buckled deck, debris in every room, sparks (with their own sound), a burst steam line,
// VESTA's projector glitching, a dead and cracked navigation terminal, a cracked canopy.
const VDM={};
function vdMats(){if(VDM.ok)return VDM;VDM.ok=true;
  VDM.rubber=new THREE.MeshStandardMaterial({color:0x16171b,roughness:.7,metalness:.1});
  VDM.wireR=new THREE.MeshStandardMaterial({color:0x7a1c14,roughness:.55});
  VDM.wireY=new THREE.MeshStandardMaterial({color:0x8a6c16,roughness:.55});
  VDM.copper=new THREE.MeshStandardMaterial({color:0xb87a4a,roughness:.35,metalness:.9});
  VDM.plate=new THREE.MeshStandardMaterial({color:0x4c5058,roughness:.55,metalness:.6,side:THREE.DoubleSide});
  VDM.under=new THREE.MeshStandardMaterial({color:0x24262b,roughness:.7,metalness:.5,side:THREE.DoubleSide});
  VDM.burnt=new THREE.MeshStandardMaterial({color:0x1b1715,roughness:.95,metalness:.25,side:THREE.DoubleSide});
  VDM.void=new THREE.MeshBasicMaterial({color:0x030304,side:THREE.DoubleSide});
  VDM.shard=new THREE.MeshStandardMaterial({color:0xbfefff,transparent:true,opacity:.42,roughness:.05,metalness:.4,side:THREE.DoubleSide,depthWrite:false});
  VDM.paper=new THREE.MeshStandardMaterial({color:0xc8c2b4,roughness:.9,side:THREE.DoubleSide});
  VDM.steam=new THREE.SpriteMaterial({map:GLOW,color:0x9aa0a8,transparent:true,opacity:.25,depthWrite:false});
  return VDM;}
// fine cracks spreading from an impact point, drawn onto a canvas (canopy glass, the terminal's screen)
function vdCracks(g,cx,cy,R,n=14,col='rgba(225,235,245,.75)'){g.save();g.strokeStyle=col;g.lineCap='round';
  for(let i=0;i<n;i++){let a=i/n*Math.PI*2+Math.random()*.4,x=cx,y=cy,len=R*(.45+Math.random()*.6);g.lineWidth=1.6;g.beginPath();g.moveTo(x,y);
    for(let s=0;s<9;s++){a+=(Math.random()-.5)*.6;const st=len/9;x+=Math.cos(a)*st;y+=Math.sin(a)*st;g.lineTo(x,y);
      if(Math.random()<.25){const b=a+(Math.random()<.5?-1:1)*rf(.5,1.1);g.moveTo(x,y);g.lineTo(x+Math.cos(b)*st*2,y+Math.sin(b)*st*2);g.moveTo(x,y);}}
    g.stroke();}
  // rings of the spider web
  for(let r=R*.12;r<R*.7;r+=R*rf(.1,.18)){g.lineWidth=1;g.beginPath();for(let i=0;i<=24;i++){const a=i/24*Math.PI*2,rr2=r*(.85+Math.random()*.3);i?g.lineTo(cx+Math.cos(a)*rr2,cy+Math.sin(a)*rr2):g.moveTo(cx+Math.cos(a)*rr2,cy+Math.sin(a)*rr2);}g.stroke();}
  const sp=g.createRadialGradient(cx,cy,0,cx,cy,R*.1);sp.addColorStop(0,'rgba(240,248,255,.85)');sp.addColorStop(1,'rgba(240,248,255,0)');g.fillStyle=sp;g.beginPath();g.arc(cx,cy,R*.1,0,7);g.fill();g.restore();}
function vdCrackTex(){const c=mkCanvas(512),g=c.getContext('2d');g.clearRect(0,0,512,512);vdCracks(g,300,220,330,16);vdCracks(g,120,380,140,8);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;}
// a bundle of cables hanging out of the ceiling, swaying a little; returns where the stripped ends are (they spark)
function vdCable(ctx,x,z,len,o={}){const M=vdMats(),top=W.floorY+3.04,piv=new THREE.Group();piv.position.set(x,top,z);ctx.g.add(piv);
  const n=o.n||2+Math.floor(Math.random()*2),kx=rf(-.35,.35),kz=rf(-.35,.35),mats=[M.rubber,M.wireR,M.wireY,M.rubber];
  for(let j=0;j<n;j++){const ox=rf(-.07,.07),oz=rf(-.07,.07),L=len*(j?rf(.7,1):1),pts=[];
    for(let i=0;i<=8;i++){const u=i/8;pts.push(new THREE.Vector3(ox+kx*u*u+Math.sin(u*4+j)*.04,-u*L,oz+kz*u*u+Math.cos(u*3+j)*.04));}
    piv.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),14,j?.016:.028,5),mats[j%4]));
    const tip=new THREE.Mesh(cyl(.008,.008,.07,4),M.copper);tip.position.copy(pts[8]);tip.position.y-=.03;piv.add(tip);}
  const ph=rf(0,6);ctx.anim(()=>{const t=performance.now()/1000;piv.rotation.x=Math.sin(t*.8+ph)*.05;piv.rotation.z=Math.sin(t*.63+ph*1.3)*.05;});
  return [x+kx,top-len,z+kz];}
// a cable slung loose between two points on the ceiling
function vdSag(ctx,ax,az,bx,bz,drop){const M=vdMats(),top=W.floorY+3.02,pts=[];for(let i=0;i<=10;i++){const u=i/10;pts.push(new THREE.Vector3(lerp(ax,bx,u),top-drop*4*u*(1-u),lerp(az,bz,u)));}
  ctx.g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),20,.03,5),M.rubber));}
// a ceiling panel torn loose, hanging by one edge over the dark hole it came out of
function vdHangPanel(ctx,x,z,ry,o={}){const M=vdMats(),top=W.floorY+3.0,w=o.w||1.3,d=o.d||1.1,piv=new THREE.Group();piv.position.set(x,top,z);piv.rotation.y=ry;ctx.g.add(piv);
  const hole=new THREE.Mesh(new THREE.PlaneGeometry(w,d),M.void);hole.rotation.x=Math.PI/2;hole.position.y=.02;piv.add(hole);
  for(const s of[-.25,.25]){const p=new THREE.Mesh(cyl(.05,.05,w+.2,8),M.under);p.rotation.z=Math.PI/2;p.position.set(0,-.02,s*d);piv.add(p);}
  const hinge=new THREE.Group();hinge.position.z=d/2;piv.add(hinge);const pl=new THREE.Mesh(RB(w,.05,d,.02,1),M.plate);pl.position.z=-d/2;hinge.add(pl);
  for(const s of[-1,1]){const rb=new THREE.Mesh(RB(.05,.07,d*.95,.01,1),M.under);rb.position.set(s*w*.4,.05,-d/2);hinge.add(rb);}
  const ph=rf(0,6),ang=o.ang||1.1;ctx.anim(()=>{const t=performance.now()/1000;hinge.rotation.x=ang+Math.sin(t*1.1+ph)*.035;});
  return vdCable(ctx,x+Math.sin(ry)*.2,z+Math.cos(ry)*.2,.9,{n:2});}
// a wall panel ripped off and leaning against the wall it came from, the conduit behind it exposed
function vdTornWall(ctx,x,z,side){const M=vdMats(),y0=W.floorY,g=grp(ctx,x,y0,z,side>0?0:Math.PI);
  const hole=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.4),M.void);hole.rotation.y=-Math.PI/2;hole.position.set(.05,1.55,0);g.add(hole);
  for(let i=0;i<3;i++){const p=new THREE.Mesh(cyl(.035,.035,1.4,6),i===1?M.wireR:M.rubber);p.position.set(.0,1.55,-.3+i*.3);g.add(p);}
  const pl=new THREE.Mesh(RB(.04,1.6,1.05,.01,1),M.plate);pl.position.set(-.55,.78,.25);pl.rotation.set(.12,.35,-.32);g.add(pl);
  return toW(x,z,side>0?0:Math.PI,0,0);}
// a deck plate buckled up out of the floor
function vdBuckle(ctx,x,z,ry){const M=vdMats(),g=grp(ctx,x,W.floorY,z,ry),rm=std(TEX.deck,{color:0x5a5e66,metalness:.6,roughness:.5});
  const hole=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.1),M.void);hole.rotation.x=-Math.PI/2;hole.position.y=.025;g.add(hole);
  const a=new THREE.Mesh(RB(1.5,.05,.6,.01,1),rm);a.position.set(0,.13,-.28);a.rotation.x=-.42;g.add(a);const b=new THREE.Mesh(RB(1.5,.05,.6,.01,1),rm);b.position.set(0,.1,.3);b.rotation.x=.3;g.add(b);}
// loose bits on the floor: bolts, plates, ration packs, papers, a cracked datapad
function vdDebris(ctx,x0,x1,z0,z1,n){const M=vdMats(),P=ctx.P,y0=W.floorY,mats=[M.plate,M.burnt,MAT.hullDark,MAT.metal];
  for(let i=0;i<n;i++){const x=rf(x0,x1),z=rf(z0,z1),k=Math.random();
    if(k<.35)P.add(ctx.g,pick(mats),RB(rf(.2,.7),.03,rf(.15,.5),.01,1),x,y0+.03,z,rf(-.1,.1),rf(0,6),rf(-.1,.1));
    else if(k<.55)P.add(ctx.g,M.paper,new THREE.PlaneGeometry(.21,.29),x,y0+.02,z,-Math.PI/2,0,rf(0,6));
    else if(k<.75)P.add(ctx.g,pick([MAT.crate,MAT.crateBlue,MAT.crateRed]),RB(.3,.18,.22,.02,1),x,y0+.09,z,0,rf(0,6),rf(-.3,.3));
    else P.add(ctx.g,MAT.metal,cyl(.03,.03,rf(.2,.6),6),x,y0+.03,z,Math.PI/2,0,rf(0,6));}}
// broken glass lying on a surface
function vdShards(ctx,x,y,z,r,n){const M=vdMats();for(let i=0;i<n;i++){const s=new THREE.Shape(),a=rf(.04,.16);s.moveTo(0,0);s.lineTo(a,rf(-.03,.03));s.lineTo(rf(0,a),rf(.03,.12));s.lineTo(0,0);
  const m=new THREE.Mesh(new THREE.ShapeGeometry(s),M.shard);const q=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*r;m.position.set(x+Math.cos(q)*d,y+.01,z+Math.sin(q)*d);m.rotation.set(-Math.PI/2+rf(-.15,.15),0,rf(0,6));ctx.g.add(m);}}
// the ceiling light strips: some dead, the rest buzzing and cutting out
function vdStrips(ctx){const dead=[],fl=[];ctx.g.traverse(q=>{if(!q.isMesh||!q.material||q.material.name!=='Material.004')return;
    const r=Math.random();if(r<.4){if(!dead[0]){const m=q.material.clone();m.emissiveIntensity=0;m.color.setRGB(.12,.12,.13);dead[0]=m;}q.material=dead[0];}
    else{const k=Math.floor(Math.random()*3);if(!fl[k]){const m=q.material.clone();m.emissive.setRGB(1,.55,.45);m.userData.seed=k*5.3+1;fl[k]=m;}q.material=fl[k];}});
  ctx.anim(()=>{const t=performance.now()/1000,pw=G.flags.vr_power;for(const m of fl)if(m){m.emissiveIntensity=pw?.3:.34*dmgFlick(t,m.userData.seed);if(pw)m.emissive.setRGB(.85,.92,1);}});}
// sparks spitting from torn conduits, each on its own irregular beat, with the recorded spark sound nearby
function vdSparks(ctx,sites){const y0=W.floorY,next=sites.map(()=>rf(.5,4));
  ctx.anim(dt=>{for(let i=0;i<sites.length;i++){next[i]-=dt;if(next[i]>0)continue;const v=sites[i],big=Math.random()<.3;next[i]=big?rf(2.5,6):rf(.9,3.5);if(G.flags.vr_power&&Math.random()<.75)continue;
      const n=big?26:12;for(let j=0;j<n;j++)FX.spawn(v[0],v[1],v[2],rf(-1.8,1.8),rf(-.6,big?2.6:1.6),rf(-1.8,1.8),{life:rf(.25,.75),size:rf(.03,.08),c0:0xffffff,c1:0xffa040,drag:1.1,grav:9});
      sparkSound(v[0],v[2],big?.55:.32);}});}
// a burst coolant line venting steam, with a hiss when you're close
function vdSteam(ctx,x,y,z,dx,dz){const M=vdMats(),puffs=[];for(let i=0;i<14;i++){const s=new THREE.Sprite(M.steam.clone());s.userData.t=i/14;ctx.g.add(s);puffs.push(s);}let hiss=0;
  ctx.anim(dt=>{if(G.flags.vr_coolant){for(const s of puffs)s.visible=false;return;}const t=performance.now()/1000,gust=.6+.4*Math.max(0,Math.sin(t*1.7));for(const s of puffs){const u=s.userData;u.t=(u.t+dt*.6)%1;s.position.set(x+dx*u.t*2.2,y-u.t*.6+u.t*u.t*.9,z+dz*u.t*2.2);s.scale.setScalar(.25+u.t*1.6);s.material.opacity=.32*gust*(1-u.t)*Math.min(1,u.t*8);}
    hiss-=dt;if(hiss<=0){hiss=rf(1.2,2.4);const d=Math.hypot(x-player.x,z-player.z);if(d<10)noise(1.1,.035*(1-d/10)*gust,5200,'highpass');}});}
// VESTA's projector is failing: her figure tears into bands, jumps and cuts out, and a cloud of error voxels flickers around it
function vdGlitchHolo(ctx,n,x,z){if(!n)return;let uG=null;n.P.root.traverse(o=>{if(o.material&&o.material.userData&&o.material.userData.uG)uG=o.material.userData.uG;});
  const y0=W.floorY,kids=n.P.root.children.slice(),N=70,cm=new THREE.MeshBasicMaterial({color:0xff6a4a,transparent:true,opacity:.75,depthWrite:false}),cubes=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.07,.07),cm,N);cubes.visible=false;ctx.g.add(cubes);
  const tag=(()=>{const c=mkCanvas(256);c.height=64;const g=c.getContext('2d');g.fillStyle='rgba(255,90,60,.95)';g.font='bold 22px monospace';g.textAlign='center';g.fillText('PROJECTION FAULT',128,28);g.font='16px monospace';g.fillText('ERR 0x5E · SIGNAL LOST',128,52);
    const t=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));s.scale.set(1.3,.33,1);s.position.set(x,y0+2.35,z);ctx.g.add(s);return s;})();
  const m4=new THREE.Matrix4();let burst=0,gap=1;
  ctx.anim(dt=>{if(G.flags.vr_emitter){if(uG)uG.value=0;for(const c of kids){c.position.set(0,0,0);c.scale.set(1,1,1);}cubes.visible=false;tag.visible=false;return;}const t=performance.now()/1000;burst-=dt;if(burst<-gap){burst=rf(.06,.45);gap=rf(.3,2.2);}const on=burst>0,out=on&&Math.random()<.25;
    if(uG)uG.value=on?1:.6;
    for(const c of kids){if(out){c.scale.setScalar(.0001);continue;}c.position.set(on?rf(-.14,.14):Math.sin(t*23)*.01,on?rf(-.05,.05):0,on?rf(-.08,.08):0);c.scale.set(on?rf(.75,1.5):1,on?rf(.8,1.08):1,1);}
    cubes.visible=on||Math.random()<.03;if(cubes.visible){for(let i=0;i<N;i++){const h=rf(.1,2.05),r=(.12+.2*Math.sin(h*2.1))*rf(.4,1.3),a=rf(0,6.3);m4.makeTranslation(x+Math.cos(a)*r+rf(-.08,.08),y0+.25+h,z+Math.sin(a)*r);cubes.setMatrixAt(i,m4);}cubes.instanceMatrix.needsUpdate=true;}
    tag.visible=Math.sin(t*2.2)>-.3&&!(on&&Math.random()<.5);tag.material.opacity=.6+Math.random()*.4;});}
// the decks, room by room
function vesperDamage(ctx,X){const P=ctx.P,y0=W.floorY,sp=[];
  /* bridge */
  sp.push(vdCable(ctx,1.6,11.2,1.5),vdCable(ctx,-1.4,14.4,1.1),vdCable(ctx,4.4,15.6,1.3));vdSag(ctx,-4.5,10.2,-.5,12.2,.7);
  sp.push(vdHangPanel(ctx,2.4,10.6,Math.PI/2));vdBuckle(ctx,-1.6,10.5,.3);vdDebris(ctx,-4.8,4.8,9.6,16.2,26);vdShards(ctx,0,y0,15.9,1.6,30);
  sp.push([1.45,y0+1.1,15.2],[-1.5,y0+.9,15.3]);
  /* corridor */
  sp.push(vdCable(ctx,.5,2.8,1.4),vdCable(ctx,-.4,7.6,.9));sp.push(vdHangPanel(ctx,0,5.4,0,{w:1.2,d:1.2,ang:1.2}));vdDebris(ctx,-1,1,.6,8.6,12);vdBuckle(ctx,.2,7.5,0);
  /* quarters */
  {sp.push(vdCable(ctx,3.3,2.2,1.2));const t=vdTornWall(ctx,X-.7,6,1);sp.push([t.x-.1,y0+1.6,t.z]);vdDebris(ctx,2.2,5,.6,8.6,16);
    P.add(ctx.g,MAT.fabricTeal,RB(1.9,.16,.85,.07,2),3.3,y0+.09,7.7,0,Math.PI/2+.3,.06);P.add(ctx.g,MAT.fabric,RB(.45,.12,.6,.06,2),2.6,y0+.07,6.6,0,.9,0);// the mattress thrown off the bunk
    const lg=grp(ctx,3.4,y0,2.4,.4);P.add(lg,MAT.hull,RB(.7,.6,2.1,.06,1),0,.3,0);P.add(lg,MAT.metal,RB(.5,.02,.04,.01,1),.15,.61,.5);ctx.box(3.4,2.4,.4,1.05,.4,y0+.6);// a locker torn off its mounts
    for(const [x,z] of[[2.3,4.9],[3.8,3.3]])P.add(ctx.g,MAT.metal,cyl(.04,.06,.5,8),x,y0+.06,z,Math.PI/2,0,rf(0,6));}
  /* med bay */
  {sp.push(vdCable(ctx,-3.1,7.2,1.2));const t=vdTornWall(ctx,-X+.7,2.6,-1);sp.push([t.x+.1,y0+1.6,t.z]);vdShards(ctx,-3.9,y0+.83,4.5,.6,18);vdShards(ctx,-3,y0,4.4,1.2,20);vdDebris(ctx,-5,-2.2,.6,8.6,14);}
  /* cargo bay */
  {sp.push(vdCable(ctx,-2.6,-3.2,1.7),vdCable(ctx,2.9,-6.9,1.1));sp.push(vdHangPanel(ctx,3.2,-1.6,.4));vdSag(ctx,-5,-7.5,-1.8,-5.5,.9);
    for(const [x,z,r,m] of[[-2.6,-1.2,.5,MAT.crate],[-3.4,-7.2,1.1,MAT.crateBlue],[2.5,-4.4,.25,MAT.crateRed]]){P.add(ctx.g,m,RB(1,1,1,.04,1),x,y0+.42,z,0,r,.42);ctx.box(x,z,.55,.55,r,y0+.9);}
    for(const [x,z,r] of[[3.3,-3.6,.4],[2.4,-7.2,1.7]]){P.add(ctx.g,MAT.metal,cyl(.38,.38,1.1,14),x,y0+.38,z,0,r,Math.PI/2);P.add(ctx.g,MAT.hazard,cyl(.39,.39,.16,14,1,true),x,y0+.38,z,0,r,Math.PI/2);ctx.box(x,z,.55,.4,r,y0+.76);}
    vdDebris(ctx,-5,5,-7.8,-.4,22);}
  /* engineering */
  {sp.push(vdCable(ctx,.6,-10.2,1.7),vdCable(ctx,3,-13.6,1.2),vdCable(ctx,-1.2,-14.2,1));sp.push(vdHangPanel(ctx,-.8,-9.4,Math.PI));vdSag(ctx,1,-14.6,4.8,-12.5,.8);
    P.add(ctx.g,MAT.metal,cyl(.12,.12,2.4,10),1.6,y0+.12,-9.6,0,.6,Math.PI/2);// a pipe shaken down off its brackets
    vdSteam(ctx,1.5,y0+2.65,-10.6,.35,.15);vdDebris(ctx,-5,5,-14.8,-8.4,20);sp.push([-1.5,y0+2.7,-12.6]);}
  vdSparks(ctx,sp);vdStrips(ctx);vesperRepairs(ctx,X);
  // the lights: failing until the power trunk is rewired, red emergency light until the reactor is back
  ctx.anim(()=>{const pw=!!G.flags.vr_power,rx=!!G.flags.vr_reactor;for(const d of ctx.lights){d.flicker=pw?0:2;if(rx&&!d._warm){d._warm=1;d.color=0xffe0c0;d.i=Math.max(d.i,.6);}}});}
// The repair, done aboard: a diagnostic point for each system while you survey, then a place to fit each part, then the reactor.
function vesperRepairs(ctx,X){const y0=W.floorY,stg=()=>qStage('m09_grounded');
  const diag=(id,x,z,label,line)=>qUse(ctx,id,x,z,label,{ok:()=>stg()===GR.ASSESS,act:()=>{vesta(line,9000);FX.burst(new THREE.Vector3(x,y0+1.2,z),0x6ff2d6,14,2,.4,.05);}});
  diag('vs_diag_nav',-.9,14.1,'Run diagnostics on the navigation terminal','Navigation is dead. The core burned out on impact and the display is smashed. Without a core we can\'t find our way off a parking pad, let alone to orbit.');
  diag('vs_diag_core',-1.7,-11.2,'Inspect the drive core','The drive core is intact, but its flux coupling cracked, and the coolant line beside it has burst. Restart the reactor like this and it melts.');
  diag('vs_diag_power',X-1.4,6,'Trace the power fault','Found it: the main power trunk behind this panel. Fused solid. Everything aboard is running on emergency cells, which is why the lights won\'t hold.');
  diag('vs_diag_hull',X-1.4,-4,'Inspect the hull breach','The breach goes right through both hull layers. We need plating to close it and sealant to make it hold. She won\'t keep air in orbit like this.');
  // fitting the parts: each one changes the ship as it goes in
  const fit=(x,z,label,flag,need,done)=>ctx.inter({pos:()=>({x,z}),r:2.2,label:()=>label,ok:()=>stg()>=GR.REPAIR&&!G.flags[flag]&&need.every(([k,n])=>countItem(k)>=n),
    act:()=>{for(const [k,n] of need)removeItem(k,n);setFlag(flag);sfx('thump');FX.burst(new THREE.Vector3(x,y0+1.3,z),0xffc35a,36,3.5,.6,.08);sparkSound(x,z,.55);done&&done();checkObjectives();renderTracker();saveSoon();
      const left=['vr_hull','vr_coupling','vr_coolant','vr_power','vr_nav','vr_emitter'].filter(f=>!G.flags[f]).length;if(!left)setTimeout(()=>vesta('That\'s every system. All that\'s left is to wake the reactor. Engineering.'),4200);}});
  fit(X-1.4,-4,'Weld the hull plates over the breach and seal them','vr_hull',[['hullplate',4],['sealant',1]],()=>vesta('Plates welded, sealant curing. She\'ll hold air again.'));
  fit(-1.7,-11.2,'Fit the new flux coupling','vr_coupling',[['coupling',1]],()=>vesta('Coupling seated. The core\'s field is stable, for now.'));
  fit(1.5,-10.1,'Replace the burst coolant line','vr_coolant',[['coolant',1]],()=>vesta('New line, full charge of coolant. That should stop the steam.'));
  fit(X-1.4,6,'Rewire the power trunk','vr_power',[['wiring',1]],()=>vesta('Power trunk rewired. Main power is back on the lights, at least.'));
  fit(.9,14.2,'Install the navigation core','vr_nav',[['navcore',1]],()=>vesta('Navigation core installed. The screen\'s still cracked, but I can see the stars on it.'));
  fit(-2.5,12.1,'Fit the holo emitter into VESTA\'s projector','vr_emitter',[['emitter',1]],()=>vesta('Oh. That\'s better. I can see myself again. Thank you.'));
  qUse(ctx,'vs_reactor',-1.7,-11.2,'Restart the reactor',{ok:()=>stg()===GR.REACTOR,act:()=>{setFlag('vr_reactor');sfx('scan');for(let i=0;i<4;i++)setTimeout(()=>{FX.burst(new THREE.Vector3(-3.2,y0+1.5,-12),0x8fd8ff,40,4,.7,.1);sfx('thump');},i*450);}});
  // the breach in the cargo bay's starboard wall: the dusk outside showing through torn plating, until it is welded shut
  {const V=vdMats(),c=mkCanvas(256),g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#2a1830');gr.addColorStop(.7,'#8a4038');gr.addColorStop(1,'#c8704a');g.fillStyle=gr;g.fillRect(0,0,256,256);
    const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;const sky=new THREE.Mesh(new THREE.CircleGeometry(1,20),new THREE.MeshBasicMaterial({map:t}));sky.scale.set(.9,1.05,1);sky.position.set(X-.6,y0+1.5,-4);sky.rotation.y=-Math.PI/2;ctx.g.add(sky);
    const pet=crashPetals(ctx.g,new THREE.Vector3(X-.62,y0+1.5,-4),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0),new THREE.Vector3(-1,0,0),.85,1,11,V.plate,[.4,1]);
    const patch=new THREE.Group();patch.position.set(X-.66,y0+1.5,-4);ctx.g.add(patch);const pm=new THREE.MeshStandardMaterial({color:0x7a7e86,roughness:.45,metalness:.5});
    [[0,.35,1.3,.75],[0,-.4,1.2,.8],[.05,0,.6,1.9]].forEach(([dz,dy,w,h],i)=>{const m=new THREE.Mesh(RB(.05,h,w,.01,1),pm);m.position.set(-.02*i,dy,dz);m.rotation.x=(i-1)*.08;patch.add(m);});
    const seam=new THREE.Mesh(tor(.95,.025,6,32),new THREE.MeshStandardMaterial({color:0x3a3a3c,roughness:.8,metalness:.6}));seam.rotation.y=Math.PI/2;seam.scale.set(1,1.05,.9);patch.add(seam);
    ctx.light(X-1.2,y0+1.5,-4,0xff9a6a,.5,5);
    ctx.anim(()=>{const f=!!G.flags.vr_hull;sky.visible=pet.visible=!f;patch.visible=f;});}}

// ===== 53d_anchorage.js =====
/* ================= ANCHORAGE STATION ================= */
// Halcyon's orbital waystation, in the style of a clean white orbital (after "Space station Scene Wip 7" by 3DHaupt):
// white seamed panels over a gunmetal dado with a blue-grey band, dark structural pillars on octagonal bases with hazard
// bands, steel deck plates, lit coves. Every window looks out on one shared sky (stars, the sun, and Ossery b below with its
// scorched day side, twilight band and frozen night side), seen from wherever you stand, so the views agree with each other.
// Layout (z grows toward the hab ring): docking bay 3 (0,-60) · long gallery north to the atrium (0,22), a two-storey round hub
// with the Halo cantina east and the medbay west · hab ring (0,62) · observation deck (0,90). Maintenance tunnels off the dock.
const STX={};
function stTex(kind){if(STX[kind])return STX[kind];const c=mkCanvas(512),g=c.getContext('2d'),R=Math.random;
  const noise=(n,a)=>{for(let i=0;i<n;i++){g.fillStyle=`rgba(${R()<.5?0:255},${R()<.5?0:255},${R()<.5?0:255},${R()*a})`;g.fillRect(R()*512,R()*512,R()*3+1,R()*3+1);}};
  const seam=(x,y,w,h,dark,lite)=>{g.fillStyle=dark;g.fillRect(x,y,w,h);g.fillStyle=lite;if(w>h)g.fillRect(x,y+h,w,1);else g.fillRect(x+w,y,1,h);};
  const bolt=(x,y,c)=>{g.fillStyle=c;g.beginPath();g.arc(x,y,3,0,7);g.fill();};
  if(kind==='panel'){// two white panels a metre wide, with a horizontal seam, a vent on one and fixings at the corners
    g.fillStyle='#d8dbe3';g.fillRect(0,0,512,512);const gr=g.createLinearGradient(0,0,0,512);gr.addColorStop(0,'rgba(255,255,255,.18)');gr.addColorStop(1,'rgba(90,96,120,.12)');g.fillStyle=gr;g.fillRect(0,0,512,512);noise(1400,.035);
    for(const x of[0,256])seam(x,0,3,512,'#8e94a4','#f6f8fc');for(const y of[0,330])seam(0,y,512,3,'#8e94a4','#f6f8fc');
    g.fillStyle='#bfc4d0';g.fillRect(300,380,170,90);g.fillStyle='#9aa0b0';for(let i=0;i<7;i++)g.fillRect(312,390+i*11,146,4);
    g.fillStyle='rgba(120,128,150,.35)';g.fillRect(36,40,180,6);for(const [x,y] of[[14,14],[242,14],[270,14],[498,14],[14,316],[242,316],[270,346],[498,346]])bolt(x,y,'#a8adba');}
  else if(kind==='dark'){// gunmetal with ribs and rivets
    g.fillStyle='#3c4049';g.fillRect(0,0,512,512);noise(1800,.05);for(let y=0;y<512;y+=64){seam(0,y,512,4,'#22252b','#565b66');}
    for(const x of[0,256])seam(x,0,4,512,'#22252b','#565b66');for(let y=32;y<512;y+=64)for(const x of[20,236,276,492])bolt(x,y,'#5c616c');
    g.fillStyle='rgba(210,170,40,.55)';g.fillRect(300,140,90,10);}
  else if(kind==='floor'){// a two-metre deck plate: brushed steel, dark seams, corner fixings, a worn walking line
    g.fillStyle='#8e929a';g.fillRect(0,0,512,512);for(let i=0;i<500;i++){g.fillStyle=`rgba(255,255,255,${R()*.05})`;g.fillRect(0,R()*512,512,1);}noise(2500,.04);
    g.fillStyle='rgba(40,42,48,.04)';g.fillRect(150,0,212,512);seam(0,0,512,5,'#2c2f35','#b4b8c0');seam(0,0,5,512,'#2c2f35','#b4b8c0');seam(254,0,3,512,'#4a4e56','#a8acb4');
    for(const [x,y] of[[18,18],[494,18],[18,494],[494,494],[238,18],[274,18],[238,494],[274,494]])bolt(x,y,'#5a5e66');}
  else if(kind==='pad'){// landing pad markings, transparent
    g.clearRect(0,0,512,512);g.strokeStyle='rgba(255,200,40,.85)';g.lineWidth=10;g.beginPath();g.arc(256,256,236,0,7);g.stroke();g.setLineDash([30,22]);g.lineWidth=6;g.beginPath();g.arc(256,256,200,0,7);g.stroke();g.setLineDash([]);
    g.fillStyle='rgba(255,200,40,.8)';for(let i=0;i<4;i++){g.save();g.translate(256,256);g.rotate(i*Math.PI/2);g.fillRect(-6,-236,12,60);g.restore();}g.font='bold 120px sans-serif';g.textAlign='center';g.fillStyle='rgba(255,255,255,.55)';g.fillText('3',256,300);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;t.anisotropy=4;return STX[kind]=t;}
let STM=null;
function stM(){if(STM)return STM;const S=(o)=>new THREE.MeshStandardMaterial(o);
  STM={wall:S({map:stTex('panel'),roughness:.6,metalness:.1}),dark:S({map:stTex('dark'),roughness:.5,metalness:.55}),floor:S({map:stTex('floor'),roughness:.66,metalness:.28}),
    ceil:S({map:stTex('dark'),color:0x9096a2,roughness:.7,metalness:.35}),band:S({color:0x7a84a8,roughness:.4,metalness:.2}),trim:S({color:0x2e3138,roughness:.42,metalness:.65}),
    white:S({color:0xc4c8d0,roughness:.6,metalness:.08}),rail:S({color:0xf0f2f6,roughness:.3,metalness:.35}),
    strip:S({color:0x1a1c22,emissive:0xe2ecff,emissiveIntensity:.42,roughness:.5}),warm:S({color:0x1a1612,emissive:0xffd6a0,emissiveIntensity:.5,roughness:.5}),
    teal:S({color:0x0a1a18,emissive:0x6ff2d6,emissiveIntensity:.55,roughness:.5}),pink:S({color:0x1a0a18,emissive:0xff5ad8,emissiveIntensity:.5,roughness:.5}),
    amber:S({color:0x1a1206,emissive:0xffa040,emissiveIntensity:.5,roughness:.5}),halo:S({map:stTex('dark'),color:0x7a5a86,roughness:.45,metalness:.5}),
    pad:new THREE.MeshBasicMaterial({map:stTex('pad'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})};
  return STM;}
// the view out of every window
let ST_SKY=null;
function stSkyMat(){if(ST_SKY)return ST_SKY;const c=mkCanvas(2048);c.height=1024;const g=c.getContext('2d'),R=Math.random;g.fillStyle='#010207';g.fillRect(0,0,2048,1024);
  for(let i=0;i<1100;i++){const x=R()*2048,y=520+Math.sin(x/2048*Math.PI*2)*230+(R()-.5)*180*R(),r=8+R()*46,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(${140+R()*80|0},${120+R()*70|0},${190+R()*60|0},${.02+R()*.03})`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}
  for(let i=0;i<6500;i++){const b=R();g.fillStyle=`rgba(${215+R()*40|0},${215+R()*40|0},255,${b*b*.9+.08})`;const s=b>.992?2:1;g.fillRect(R()*2048,R()*1024,s,s);}
  const t=new THREE.CanvasTexture(c);t.wrapS=THREE.RepeatWrapping;
  ST_SKY=new THREE.ShaderMaterial({uniforms:{map:{value:t},pDir:{value:new THREE.Vector3(.12,-.5,1).normalize()},sDir:{value:new THREE.Vector3(-.75,.3,.55).normalize()}},
    vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`uniform sampler2D map;uniform vec3 pDir;uniform vec3 sDir;varying vec3 vW;
      void main(){vec3 d=normalize(vW-cameraPosition);vec2 uv=vec2(atan(d.z,d.x)/6.28318+.5,asin(clamp(d.y,-1.,1.))/3.14159+.5);vec3 col=texture2D(map,uv).rgb*1.1;
        float sd=max(dot(d,sDir),0.);col+=vec3(1.,.86,.66)*(pow(sd,1400.)*8.+pow(sd,60.)*.35+pow(sd,8.)*.07);
        vec3 C=pDir*10.;float Rr=10.*sin(.6),b=dot(d,C),h=b*b-dot(C,C)+Rr*Rr;
        if(h>0.){float t=b-sqrt(h);vec3 n=normalize(d*t-C);float l=dot(n,sDir);
          float nz=sin(n.x*9.+n.y*5.)*.5+sin(n.z*13.-n.x*7.)*.3+sin(n.y*23.+n.z*4.)*.2;
          vec3 day=mix(vec3(.86,.5,.26),vec3(.6,.3,.17),nz*.5+.5),band=mix(vec3(.34,.26,.44),vec3(.22,.38,.4),nz*.5+.5),night=mix(vec3(.62,.72,.86),vec3(.4,.5,.66),nz*.5+.5);
          vec3 surf=l>.2?mix(band,day,smoothstep(.2,.6,l)):mix(night,band,smoothstep(-.35,.2,l));
          vec3 pc=surf*(.035+clamp(l*1.2+.18,0.,1.)*1.05);float rim=pow(1.-max(dot(n,-d),0.),3.);pc+=vec3(.95,.55,.42)*rim*.55*clamp(l+.5,0.,1.)+vec3(.3,.45,.85)*rim*.22;col=pc;}
        else{float a=acos(clamp(dot(d,pDir),-1.,1.));col+=vec3(.75,.48,.55)*exp(-(a-.6)*38.)*.4;}
        gl_FragColor=vec4(col,1.);}`});ST_SKY.userData.noGlow=true;return ST_SKY;}
// a framed window onto the sky, facing +z of its group
function stWindow(ctx,x,y,z,ry,w,h,o={}){const g=grp(ctx,x,y,z,ry),P=ctx.P,F=stM().trim;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),stGlass());g.add(m);
  P.add(g,F,RB(w+.5,.28,.3,.05,1),0,h/2+.14,.05);P.add(g,F,RB(w+.5,.28,.3,.05,1),0,-h/2-.14,.05);for(const s of[-1,1])P.add(g,F,RB(.28,h+.3,.3,.05,1),s*(w/2+.14),0,.05);
  const n=o.mull!==undefined?o.mull:Math.max(0,Math.round(w/3.2)-1);for(let i=1;i<=n;i++)P.add(g,F,RB(.1,h,.14,.03,1),-w/2+i*w/(n+1),0,.04);
  if(o.sill!==false)P.add(g,stM().strip,new THREE.BoxGeometry(w,.04,.2),0,-h/2+.02,.12);return g;}
// a straight wall from A to B, finished on both faces, with doorway gaps [[distance from A to the gap's centre, width]]
function stWall(ctx,ax,az,bx,bz,h,o={}){const M=stM(),P=ctx.P,dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz);if(L<.05)return;const ux=dx/L,uz=dz/L,ry=-Math.atan2(uz,ux),y0=W.floorY,wm=o.mat||M.wall;
  const seg=(t0,t1)=>{const l=t1-t0;if(l<.05)return;const cx=ax+ux*(t0+t1)/2,cz=az+uz*(t0+t1)/2;
    P.add(ctx.g,wm,scaleUV(new THREE.BoxGeometry(l,h,.4),l/2,h/2),cx,y0+h/2,cz,0,ry,0);P.add(ctx.g,o.dado||M.dark,scaleUV(new THREE.BoxGeometry(l,.95,.48),l/2,.47),cx,y0+.47,cz,0,ry,0);
    if(o.band!==false)P.add(ctx.g,M.band,new THREE.BoxGeometry(l,.22,.46),cx,y0+(o.band||2.7),cz,0,ry,0);P.add(ctx.g,M.trim,new THREE.BoxGeometry(l,.16,.5),cx,y0+h-.08,cz,0,ry,0);
    if(o.cove!==false&&h>3.4)P.add(ctx.g,o.cove||M.strip,new THREE.BoxGeometry(l,.05,.44),cx,y0+h-.34,cz,0,ry,0);
    ctx.plat({x:cx,z:cz,hw:l/2,hd:.24,rot:ry,top:y0+h,bot:y0-1});};
  let t=0;for(const [c,w] of [...(o.gaps||[])].sort((a,b)=>a[0]-b[0])){seg(t,c-w/2);stDoor(ctx,ax+ux*c,az+uz*c,ry,w,h,o);t=c+w/2;}seg(t,L);}
// a doorway: dark posts with hazard bands, a lit header, the wall carried over the top
function stDoor(ctx,x,z,ry,w,h,o={}){const M=stM(),P=ctx.P,y0=W.floorY,dh=Math.min(3.2,h),g=grp(ctx,x,y0,z,ry);
  for(const s of[-1,1]){P.add(g,M.dark,RB(.34,dh,.62,.06,1),s*(w/2+.17),dh/2,0);P.add(g,MAT.hazard,new THREE.BoxGeometry(.36,.8,.64),s*(w/2+.17),.5,0);}
  P.add(g,M.dark,RB(w+.68,.36,.62,.06,1),0,dh+.18,0);P.add(g,o.sign||M.teal,new THREE.BoxGeometry(w*.5,.07,.64),0,dh+.02,0);
  if(h>dh+.4){P.add(g,o.mat||M.wall,scaleUV(new THREE.BoxGeometry(w,h-dh-.36,.4),w/2,(h-dh)/2),0,dh+.36+(h-dh-.36)/2,0);
    if(o.band!==false&&(o.band||2.7)>dh+.36)P.add(g,M.band,new THREE.BoxGeometry(w,.22,.46),0,o.band||2.7,0);P.add(g,M.trim,new THREE.BoxGeometry(w,.16,.5),0,h-.08,0);}
  ctx.plat({x,z,hw:w/2+.4,hd:.34,rot:ry,top:y0+h,bot:y0+dh-.05,solidOnly:true});}
// a rectangular room: deck plate floor, panelled ceiling with light strips, four walls; sides: n (-z), s (+z), w (-x), e (+x).
// gaps per side: [[offset from the side's centre, width]]; a side listed in open is left out (another room supplies it)
function stRoom(ctx,cx,cz,w,d,h,o={}){const M=stM(),P=ctx.P,y0=W.floorY,x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2,gp=o.gaps||{},open=o.open||[];
  P.add(ctx.g,o.floor||M.floor,scaleUV(new THREE.PlaneGeometry(w,d),w/2,d/2),cx,y0+.005,cz,-Math.PI/2,0,0);
  if(!o.noCeil){// ceiling and roof, leaving out a skylight opening if there is one
    const rects=o.hole?(([hx0,hx1,hz0,hz1])=>[[x0,x1,z0,hz0],[x0,x1,hz1,z1],[x0,hx0,hz0,hz1],[hx1,x1,hz0,hz1]])(o.hole):[[x0,x1,z0,z1]];
    for(const [a0,a1,b0,b1] of rects){const rw=a1-a0,rd=b1-b0;if(rw<.05||rd<.05)continue;const mx=(a0+a1)/2,mz=(b0+b1)/2;P.add(ctx.g,M.ceil,scaleUV(new THREE.PlaneGeometry(rw,rd),rw/4,rd/4),mx,y0+h,mz,Math.PI/2,0,0);P.add(ctx.g,M.ceil,scaleUV(new THREE.PlaneGeometry(rw,rd),rw/4,rd/4),mx,y0+h+.3,mz,-Math.PI/2,0,0);}
    if(o.hole){const [hx0,hx1,hz0,hz1]=o.hole,gl=new THREE.Mesh(new THREE.PlaneGeometry(hx1-hx0,hz1-hz0),stGlass());gl.rotation.x=Math.PI/2;gl.position.set((hx0+hx1)/2,y0+h+.15,(hz0+hz1)/2);ctx.g.add(gl);}
    ctx.plat({x:cx,z:cz,hw:w/2,hd:d/2,top:y0+h+1,bot:y0+h-.05,solidOnly:true});
    if(o.strips!==false){const along=w>=d,n=Math.max(1,Math.floor((along?d:w)/4)),L=(along?w:d)-2;for(let i=0;i<n;i++){const t=-((along?d:w)/2)+((along?d:w)/n)*(i+.5);
      P.add(ctx.g,o.stripMat||M.strip,new THREE.BoxGeometry(along?L:.32,.06,along?.32:L),along?cx:cx+t,y0+h-.04,along?cz+t:cz);P.add(ctx.g,M.trim,new THREE.BoxGeometry(along?L+.2:.5,.1,along?.5:L+.2),along?cx:cx+t,y0+h-.01,along?cz+t:cz);}}}
  const side=(k,ax,az,bx,bz,len)=>{if(open.includes(k))return;stWall(ctx,ax,az,bx,bz,h,Object.assign({},o.wall||{},{gaps:(gp[k]||[]).map(([c,wd])=>[len/2+c,wd])}));};
  side('n',x0,z0,x1,z0,w);side('s',x0,z1,x1,z1,w);side('w',x0,z0,x0,z1,d);side('e',x1,z0,x1,z1,d);}
// a dark structural pillar on an octagonal base
function stPillar(ctx,x,z,h,o={}){const M=stM(),P=ctx.P,y0=W.floorY;P.add(ctx.g,M.dark,cyl(1.25,1.45,.55,8),x,y0+.27,z,0,Math.PI/8,0);P.add(ctx.g,M.trim,cyl(.98,1.1,.45,8),x,y0+.77,z,0,Math.PI/8,0);
  P.add(ctx.g,M.dark,cyl(.55,.55,h-1,8),x,y0+1+(h-1)/2,z,0,Math.PI/8,0);P.add(ctx.g,MAT.hazard,cyl(.58,.58,.5,8,1,true),x,y0+1.5,z,0,Math.PI/8,0);
  for(let y=2.6;y<h-.4;y+=1.7)P.add(ctx.g,M.trim,cyl(.66,.66,.18,8),x,y0+y,z,0,Math.PI/8,0);if(o.lamp)P.add(ctx.g,M.strip,new THREE.BoxGeometry(.08,1.6,.08),x,y0+3.4,z+.58);ctx.col(x,z,1.25);}
// a short run of railing between two points
function stRail(ctx,ax,az,bx,bz,y,o={}){const M=stM(),P=ctx.P,L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(L/1.6));
  for(let i=0;i<=n;i++){const x=lerp(ax,bx,i/n),z=lerp(az,bz,i/n);P.add(ctx.g,M.rail,cyl(.035,.035,1.05,6),x,y+.52,z);}
  for(const hy of[1.05,.55])P.beam(ctx.g,M.rail,new THREE.Vector3(ax,y+hy,az),new THREE.Vector3(bx,y+hy,bz),hy>1?.045:.025,6);}
function stBench(ctx,x,z,ry){const M=stM(),g=grp(ctx,x,W.floorY,z,ry),P=ctx.P;P.add(g,M.white,RB(2.4,.12,.7,.05,1),0,.46,0);P.add(g,M.white,RB(2.4,.5,.12,.05,1),0,.78,-.3);for(const s of[-1,1])P.add(g,M.dark,RB(.12,.42,.6,.03,1),s*1,.21,0);
  const w=toW(x,z,ry,0,0);ctx.box(w.x,w.z,1.2,.4,ry,W.floorY+.55);}
function stSign(ctx,text,x,y,z,ry,color='#8fd8ff',w=5){const s=neon(text,w,.9,color);s.position.set(x,y,z);s.rotation.y=ry;ctx.g.add(s);return s;}

ZONES.anchorage={id:'anchorage',name:'Anchorage Station',world:'Orbit of Ossery b',blurb:'Halcyon\'s orbital waystation: docks, an atrium, a cantina and too many secrets.',kind:'interior',size:240,floorY:0,ceiling:18,seed:41,lvl:[12,16],
  sky:Object.assign({},INT_SKY,{fog:[0x0a0b12,400,2400],hemi:[0xe8ecf6,0x50525e,1.4],sunInt:.5}),tempAt:()=>19,bloom:{threshold:1.05,strength:.5},
  entries:{ship:{x:0,z:-46,face:0},dock:{x:0,z:-46,face:0}},spawn:{x:0,z:-46,face:0},
  build(ctx){const P=ctx.P,st=ctx.state(),M=stM(),y0=W.floorY,PI=Math.PI;
    stSkyDome(ctx);
    /* ---- docking bay 3: a long hangar whose far end stands open to space behind a force field; ships berth nose-out ---- */
    stRoom(ctx,0,-70,56,50,18,{open:['n'],gaps:{s:[[0,7]],w:[[20,3.2]]},wall:{band:6,cove:M.strip},strips:false});ctx.poi('dock',0,-66,'Docking Bay 3',{r:24,ft:true});
    {// the bay door: wall stubs either side, a deep lintel, the door leaves slid back into the walls, a hazard frame and the field
      for(const s2 of[-1,1]){stWall(ctx,s2*28,-95,s2*22,-95,18,{band:6});P.add(ctx.g,M.dark,RB(1.2,16.5,3,.1,1),s2*22.6,8.25,-95.6);for(let k=0;k<4;k++)P.add(ctx.g,M.trim,RB(.5,16,.4,.05,1),s2*(23.4+k*1.1),8,-95.3);
        for(let y=1;y<16;y+=1.6)P.add(ctx.g,MAT.hazard,new THREE.BoxGeometry(.3,.8,3.05),s2*22,y,-95.6);}
      P.add(ctx.g,M.dark,RB(46,1.6,3,.1,1),0,17.2,-95.6);P.add(ctx.g,MAT.hazard,new THREE.BoxGeometry(44,.3,3.05),0,16.3,-95.6);P.add(ctx.g,M.strip,new THREE.BoxGeometry(44,.08,.3),0,16.05,-94.2);
      ctx.plat({x:0,z:-95.6,hw:23,hd:1.5,top:18,bot:16.4,solidOnly:true});ctx.plat({x:0,z:-96.2,hw:22,hd:.3,top:16.4,bot:-1});// the field keeps people in
      const ff=new THREE.Mesh(new THREE.PlaneGeometry(44,16.4),new THREE.MeshBasicMaterial({color:0x5ab8ff,transparent:true,opacity:.07,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));ff.position.set(0,8.2,-96);ctx.g.add(ff);
      ctx.anim(()=>{ff.material.opacity=.05+Math.sin(performance.now()*.0013)*.02;});for(let i=-10;i<=10;i++)P.add(ctx.g,MAT.hazard,new THREE.BoxGeometry(2,.03,.6),i*2.2,.02,-93.8);
      stSign(ctx,'BAY 3 · FIELD ACTIVE',0,14.8,-94,0,'#8fd8ff',8);}
    for(let k=0;k<6;k++){const z=-91+k*8.6;for(const s2 of[-1,1])stPillar(ctx,s2*26.6,z,18);P.add(ctx.g,M.dark,RB(56,.9,.7,.08,1),0,16.4,z);P.add(ctx.g,M.strip,new THREE.BoxGeometry(50,.06,.3),0,15.92,z);}
    for(const s2 of[-1,1])P.add(ctx.g,M.dark,RB(.5,.5,48,.06,1),s2*12,15.6,-70);// crane rails
    for(const [x,z] of[[-12,-73],[12,-73]]){const pad=new THREE.Mesh(new THREE.PlaneGeometry(24,24),M.pad);pad.rotation.x=-PI/2;pad.position.set(x,.02,z);ctx.g.add(pad);}
    P.add(ctx.g,M.dark,new THREE.BoxGeometry(2,.02,48),0,.012,-70);for(const s2 of[-1,1])P.add(ctx.g,M.teal,new THREE.BoxGeometry(.06,.025,48),s2*1.02,.014,-70);// the centre track, as in the reference station
    for(const [x,z] of[[-14,-82],[14,-82],[-14,-60],[14,-60]])ctx.light(x,13,z,0xdfe6ff,1.15,30);
    // berths: the Vesper (if she's here) on pad one, a visiting courier on pad two; both nose-out to the bay door
    if(G.shipAt==='anchorage'){const fx=PF.vesper(ctx,-12,-71,PI,{y:0});ctx.inter({pos:()=>fx.hatch,r:3.4,label:()=>'Board the Vesper',ok:()=>true,act:()=>enterZone('vesper','ramp')});}
    {const v=stModel('sabre',17,{axis:'x',shadow:true});if(v){v.position.set(12,2.2,-75);v.rotation.y=PI/2;ctx.g.add(v);for(const [lx,lz] of[[-3,-4],[3,-4],[0,5]]){P.add(ctx.g,M.dark,cyl(.25,.3,2.4,10),12+lx,1.2,-75+lz);P.add(ctx.g,MAT.hazard,cyl(.6,.7,.15,12),12+lx,.08,-75+lz);ctx.col(12+lx,-75+lz,.45);}
      stSign(ctx,'CS KESTREL MOTH · COURIER',12,1,-62.5,0,'#ffc35a',5);}}
    PF.container(ctx,-23,-63,PI/2,0x4a6a8a);PF.container(ctx,24,-88,0,0x8a5a3a);PF.crates(ctx,22,-50,6,4);PF.crates(ctx,-24,-88,5,5);PF.barrels(ctx,25,-60,4,3);
    PF.console(ctx,6,-48,0,1);ctx.npc('sato',8,-50,-PI/2);ctx.npc('rook',-12,-48,PI/2);ctx.bench(-20,-47,PI/2);
    stSign(ctx,'DOCKING BAY 3',0,4.2,-45.3,PI,'#ffc35a',6);stSign(ctx,'MAINTENANCE',-27.7,3.9,-50,PI/2,'#ffa040',4);
    spawnCrowd(0,-62,14,4,{role:'DOCK CREW',pts:[[-4,-56],[-4,-86],[4,-86],[4,-56],[20,-66],[-22,-66]],barks:['Bay three\'s backed up again.','Watch the loader!','Halcyon freighter due at shift change.']});
    /* ---- the gallery: dock to atrium; the Exchange off its west side, Station Operations off its east side ---- */
    stRoom(ctx,0,-22.5,7,45,4.4,{open:['n','s'],gaps:{w:[[-2.5,5]],e:[[-2.5,4]]}});
    for(const z of[-35,-15])stWindow(ctx,3.27,2.3,z,-PI/2,6,2.4);stWindow(ctx,3.27,2.3,-4,-PI/2,6,2.4);
    P.add(ctx.g,M.dark,new THREE.BoxGeometry(1.4,.02,45),0,.012,-22.5);for(const s2 of[-1,1])P.add(ctx.g,M.teal,new THREE.BoxGeometry(.05,.025,45),s2*.72,.015,-22.5);
    for(const z of[-40,-10])stBench(ctx,-2.6,z,PI/2);for(const z of[-35,-24,-13,-3])ctx.light(0,3.8,z,0xe8eeff,.8,12);
    {const k=decal(['ANCHORAGE','HALCYON LINES'],5,1.4,{fg:'#2a2e3a'});k.position.set(-3.27,2.4,-35);k.rotation.y=PI/2;ctx.g.add(k);}
    stSign(ctx,'EXCHANGE',-3.3,3.7,-25,PI/2,'#ffc35a',3.2);stSign(ctx,'STATION OPS',3.3,3.7,-25,-PI/2,'#8fd8ff',3.6);
    /* ---- the Exchange: Halvorsen's armory and Kade's outfitters ---- */
    stRoom(ctx,-11.75,-25,16.5,24,4.4,{open:['e']});ctx.poi('exchange',-11.75,-25,'The Exchange',{r:10});
    {// armory counter and weapon racks along the north end
      P.add(ctx.g,M.dark,RB(7,1.05,.9,.05,1),-12,.52,-33.6);P.add(ctx.g,M.white,RB(7.2,.06,1,.02,1),-12,1.07,-33.6);ctx.box(-12,-33.6,3.6,.5,0,1.1);ctx.npc('prin',-12,-35,0);
      for(let i=0;i<5;i++){const x=-17+i*2.5;P.add(ctx.g,M.trim,RB(2,2.4,.2,.03,1),x,1.8,-36.85);const w=stModel(['wpn_rifle','wpn_shotgun','wpn_gl','wpn_rifle','wpn_beam'][i],i===4?.5:1.1,{axis:'z'});if(w){w.position.set(x,1.5+(i%2)*.6,-36.6);w.rotation.y=PI/2;ctx.g.add(w);}}
      stSign(ctx,'HALVORSEN ARMORY',-12,3.6,-36.6,0,'#ff6a5a',5);
      // outfitter: rails of suits and a fitting mirror along the west wall
      P.add(ctx.g,M.dark,RB(.9,1.05,6,.05,1),-17.4,.52,-22);P.add(ctx.g,M.white,RB(1,.06,6.2,.02,1),-17.4,1.07,-22);ctx.box(-17.4,-22,.5,3.1,0,1.1);ctx.npc('hollis',-19,-22,PI/2);
      for(const z of[-30,-14]){P.add(ctx.g,M.rail,cyl(.03,.03,4,8),-17,1.7,z,PI/2,0,0);for(let k=0;k<7;k++)P.add(ctx.g,[MAT.fabricTeal,MAT.fabricRed,MAT.fabric][k%3],RB(.5,1,.12,.04,1),-17,1.1,z-1.6+k*.53);P.add(ctx.g,M.dark,cyl(.03,.03,1.7,6),-17,.85,z-2);P.add(ctx.g,M.dark,cyl(.03,.03,1.7,6),-17,.85,z+2);}
      stSign(ctx,'KADE OUTFITTERS',-19.7,3.6,-22,PI/2,'#6ff2d6',4.6);for(const [x,z] of[[-8,-18],[-8,-28]])PF.crates(ctx,x,z,3,x*z);stPlant(ctx,-5,-15,3,1.1);stPlant(ctx,-5,-35,7,1.2);
      ctx.light(-12,3.8,-30,0xfff0dc,.8,14);ctx.light(-14,3.8,-18,0xfff0dc,.7,12);
      spawnCrowd(-11,-24,5,3,{role:'SHOPPER',barks:['Halcyon prices. Halcyon wages. Funny how that works.','Do they have this in a size that fits?']});}
    /* ---- Station Operations: the command deck ---- */
    stRoom(ctx,11.75,-23,16.5,30,4.8,{open:['w'],stripMat:M.strip});ctx.poi('ops',11.75,-23,'Station Operations',{r:12});
    {stWindow(ctx,19.73,2.6,-23,-PI/2,14,3.2);// the view out over the docking arm
      // a raised ring of consoles round the station plot, a wall of screens, the marshal's desk
      P.add(ctx.g,M.dark,cyl(6.6,6.8,.18,40,1,false,0,PI),12,.09,-23);
      for(let k=0;k<5;k++){const a=PI/2+(k-2)*.5,x=12+Math.sin(a)*5,z=-23+Math.cos(a)*5;PF.console(ctx,x,z,a+PI,k);}
      const holo=grp(ctx,12,0,-23,0);P.add(holo,M.dark,cyl(1.6,1.8,.9,24),0,.45,0);P.add(holo,M.teal,tor(1.6,.04,6,40),0,.92,0,PI/2,0,0);
      const plot=new THREE.Group();plot.position.y=1.9;holo.add(plot);const hm=new THREE.MeshBasicMaterial({color:0x6ff2d6,wireframe:true,transparent:true,opacity:.45});
      plot.add(new THREE.Mesh(tor(.9,.08,6,24),hm));plot.add(new THREE.Mesh(cyl(.35,.35,.8,12,1,true),hm));const arm=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,1.6),hm);arm.position.z=-1.1;plot.add(arm);const dot=new THREE.Mesh(sph(.08,8,6),new THREE.MeshBasicMaterial({color:0xffc35a}));dot.position.set(.6,0,-1.5);plot.add(dot);
      ctx.anim(dt=>{plot.rotation.y+=dt*.25;dot.position.z=-1.2-Math.abs(Math.sin(performance.now()*.0004))*1.2;});glowAt(ctx,holo,0,1.9,0,0x6ff2d6,4,.25);ctx.col(12,-23,1.9);
      for(let k=0;k<6;k++){const z=-34+k*2.2;P.add(ctx.g,MAT.screens[k%6],new THREE.PlaneGeometry(2,1.2),4.05,2.6,z,0,PI/2,0);P.add(ctx.g,M.trim,RB(.08,1.35,2.15,.02,1),3.98,2.6,z);}
      P.add(ctx.g,M.dark,RB(2.4,.8,1.1,.05,1),16,.4,-12);P.add(ctx.g,M.white,RB(2.5,.05,1.2,.02,1),16,.82,-12);ctx.box(16,-12,1.2,.55,0,.85);ctx.npc('ostrander',16,-13.2,PI);
      stSign(ctx,'STATION OPERATIONS',12,4,-37.6,0,'#8fd8ff',6);ctx.light(12,4,-23,0xd8f0ff,.9,16);ctx.light(12,3.6,-12,0xfff0dc,.6,10);
      // the duty crew at their consoles
      spawnCrowd(12,-23,4,5,{role:'OPERATOR',seats:[0,1,2,3,4].map(k=>{const a=PI/2+(k-2)*.5;return [12+Math.sin(a)*5.9,-23+Math.cos(a)*5.9,a+PI,.43];}),barks:['Bay three, you are cleared.','Traffic\'s heavy on the dayward lane.','Freighter Halden is late again.']});
      for(let k=0;k<5;k++){const a=PI/2+(k-2)*.5;stChair(ctx,'a',12+Math.sin(a)*5.9,-23+Math.cos(a)*5.9,a+PI);}}
    /* ---- maintenance tunnels ---- */
    const dk={mat:M.dark,dado:M.trim,band:false,cove:M.amber};
    stRoom(ctx,-33,-50,10,5,3.4,{open:['e','w'],floor:MAT.grate,wall:dk,stripMat:M.amber});
    stRoom(ctx,-60,-50,44,40,4.4,{gaps:{e:[[0,3.4]]},floor:MAT.grate,wall:dk,stripMat:M.amber});ctx.poi('maint',-60,-50,'Maintenance Tunnels',{r:22});
    for(let i=0;i<10;i++){const x=rr(-78,-42),z=rr(-66,-34);if(Math.hypot(x+72,z+58)<4)continue;if(i%3)PF.crates(ctx,x,z,3,i);else PF.barrels(ctx,x,z,3,i);}
    for(const [x,z,w,d] of [[-50,-42,8,1],[-70,-40,1,10],[-64,-62,10,1],[-48,-60,1,8]])slab(ctx,x,z,w,d,2.6,M.dark);
    for(let z=-68;z<-30;z+=6)P.add(ctx.g,M.trim,cyl(.15,.15,44,10),-60,3.9,z,0,0,PI/2);for(const x of[-70,-50])P.add(ctx.g,MAT.metal,cyl(.25,.25,40,10),x,3.6,-50,PI/2,0,0);
    ctx.light(-60,3.6,-50,0xffd8a0,1.6,28,true);ctx.light(-74,3.6,-60,0xff7a5a,1.1,16,true);ctx.light(-46,3.6,-40,0xffe0b0,1.3,18);ctx.light(-34,3,-50,0xffe8c8,1,10);
    ctx.enemies('drone',-60,-50,14,6,13,{respawn:70});ctx.enemies('sentinel',-66,-56,8,2,14);ctx.enemies('drone',-44,-60,4,2,12);
    PF.console(ctx,-72,-60,0,4);qUse(ctx,'records_terminal',-72,-58,'Enter Dax\'s passcode at the records junction',{ok:()=>countItem('passcode')>0});
    for(const [id,x,z] of [['breach1',-56,-34],['breach2',-80,-44],['breach3',-48,-66]]){qUse(ctx,id,x,z,'Seal the hull breach',{h:1.2});ctx.anim(()=>{if(!st.flags['used_'+id]&&Math.random()<.4)FX.spawn(x,1.2,z,rf(-1,1),rf(0,1),rf(-1,1),{life:.5,size:.14,c0:0xffffff,c1:0x8fd8ff,drag:2,grav:0});});}
    ctx.chest('an_maint',-80,-66,{kind:'locked'});ctx.chest('an_maint2',-44,-36,{});ctx.glyph('g_an1',-80,-34);
    ctx.log('an_maint',-52,-48,'Maintenance work order #4471','“Drone swarm in tunnel C went feral after the Halcyon firmware push. Engineering requests rollback. Request denied by Liaison Arn.”');
    /* ---- the atrium: a two-storey round hub under a skylight ---- */
    {const cx=0,cz=22,R=22,H=13,N=36;ctx.poi('promenade',cx,cz,'The Atrium',{r:22,ft:true});ctx.safe(cx,cz,24);
      const pt=(a,r)=>[cx+Math.cos(a)*r,cz+Math.sin(a)*r],door=i=>[8,9,17,18,26,27,35,0].includes(i);// the four doorways straddle the compass points
      P.add(ctx.g,M.floor,scaleUV(new THREE.CircleGeometry(R,64),R,R),cx,.005,cz,-PI/2,0,0);
      for(let i=0;i<N;i++){const a0=i/N*PI*2,a1=(i+1)/N*PI*2;if(door(i))continue;const [ax,az]=pt(a0,R),[bx,bz]=pt(a1,R);stWall(ctx,ax,az,bx,bz,H,{band:2.7});
        // upper storey: tall windows between the balcony and the roof
        if(i%2===1){const am=(a0+a1)/2,[wx,wz]=pt(am,R-.24);stWindow(ctx,wx,9.6,wz,-am-PI/2,3.2,4.6,{mull:0});}}
      for(const a of[0,PI/2,PI,PI*1.5]){const [x,z]=pt(a,R);stDoor(ctx,x,z,-a-PI/2,R*2*Math.sin(PI/N),H);}
      ctx.plat({x:cx,z:cz,r:R+.5,top:H+1,bot:H-.05,solidOnly:true});
      // the balcony ring and its railing
      P.add(ctx.g,M.floor,scaleUV(new THREE.RingGeometry(18.4,R-.2,64,1),R,R),cx,6,cz,-PI/2,0,0);P.add(ctx.g,M.ceil,new THREE.RingGeometry(18.4,R-.2,64,1),cx,5.65,cz,PI/2,0,0);
      P.add(ctx.g,M.white,cyl(18.4,18.4,.45,64,1,true),cx,5.82,cz);P.add(ctx.g,M.strip,tor(18.35,.05,4,96),cx,5.56,cz,PI/2,0,0);
      for(let i=0;i<48;i++){const a=i/48*PI*2,[x,z]=pt(a,18.6);P.add(ctx.g,M.rail,cyl(.035,.035,1.05,6),x,6.52,z);}P.add(ctx.g,M.rail,tor(18.6,.045,6,96),cx,7.05,cz,PI/2,0,0);P.add(ctx.g,M.rail,tor(18.6,.025,6,96),cx,6.55,cz,PI/2,0,0);
      // pillars, the roof ring, spokes to a central hub, and the skylight
      for(let k=0;k<8;k++){const a=PI/8+k*PI/4,[x,z]=pt(a,17.2);stPillar(ctx,x,z,H,{lamp:true});P.beam(ctx.g,M.dark,new THREE.Vector3(x,H-.6,z),new THREE.Vector3(cx+Math.cos(a)*5.2,H-.35,cz+Math.sin(a)*5.2),.22,6);}
      P.add(ctx.g,M.dark,tor(17.2,.32,8,64),cx,H-.6,cz,PI/2,0,0);P.add(ctx.g,M.dark,cyl(5.2,5.2,.7,32,1,true),cx,H-.35,cz);P.add(ctx.g,M.strip,tor(5.1,.07,6,64),cx,H-.72,cz,PI/2,0,0);
      P.add(ctx.g,M.ceil,new THREE.RingGeometry(16.4,R,64,1),cx,H,cz,PI/2,0,0);{const sky=new THREE.Mesh(new THREE.CircleGeometry(16.4,64),stGlass());sky.rotation.x=PI/2;sky.position.set(cx,H+.02,cz);ctx.g.add(sky);P.add(ctx.g,M.ceil,new THREE.RingGeometry(16.4,R,64,1),cx,H+.3,cz,-PI/2,0,0);for(let k=0;k<8;k++){const a=k*PI/4;P.beam(ctx.g,M.trim,new THREE.Vector3(cx,H+.05,cz),new THREE.Vector3(cx+Math.cos(a)*16.4,H+.05,cz+Math.sin(a)*16.4),.08,6);}}
      // the central dais with the holo of Ossery b
      P.add(ctx.g,M.white,cyl(5,5.3,.3,48),cx,.15,cz);P.add(ctx.g,M.dark,cyl(3.6,3.8,.3,48),cx,.45,cz);P.add(ctx.g,M.teal,tor(3.62,.05,6,64),cx,.61,cz,PI/2,0,0);ctx.col(cx,cz,3.9);
      {const g=grp(ctx,cx,0,cz,0);const h=new THREE.Mesh(sph(1.6,32,16),new THREE.MeshBasicMaterial({map:TEX.giant,transparent:true,opacity:.85}));h.position.y=3.4;g.add(h);const ring=new THREE.Mesh(tor(2.4,.02,4,64),M.teal);ring.position.y=3.4;ring.rotation.x=1.3;g.add(ring);
        glowAt(ctx,g,0,3.4,0,0x8fd8ff,6,.3);ctx.anim(dt=>{h.rotation.y+=dt*.2;ring.rotation.z+=dt*.1;});}
      for(let k=0;k<6;k++){const a=k/6*PI*2+PI/6,[x,z]=pt(a,7.4);stBench(ctx,x,z,-a+PI/2);}
      for(let k=0;k<8;k++){const a=k*PI/4,[x,z]=pt(a,12.5);stPlant(ctx,x,z,[0,4,9,12,2,6,10,13][k],1.3);}
      // shops and services under the balcony, between the pillars
      const at=(deg,r)=>pt(deg*PI/180,r),face=deg=>-(deg*PI/180)-PI/2;
      // café corners under the balcony where people sit and talk
      {const seats=[];for(const deg of[225,315]){const [x,z]=at(deg,18.6);seats.push(...stCluster(ctx,x,z,4,'a',2,{rot:deg*PI/180}));const [x2,z2]=at(deg+22,16.2);seats.push(...stCluster(ctx,x2,z2,3,'a',1,{rot:.4}));}
        const [kx,kz]=at(270,19.4);P.add(ctx.g,M.dark,RB(4,1.05,1,.05,1),kx,.52,kz+0,0,0,0);P.add(ctx.g,M.white,RB(4.2,.06,1.1,.02,1),kx,1.07,kz);ctx.box(kx,kz,2.1,.55,0,1.1);stSign(ctx,'ORBIT CAFÉ',kx,3.2,kz-.4,0,'#ffc35a',3.6);
        spawnCrowd(cx,cz,4,0,{role:'VISITOR',seats,barks:['This coffee came up on the last freighter. You can tell.','Shift change in ten.','Have you seen the view from the obs deck?']});}
      {const [x,z]=at(135,20.2);ctx.board(x,z,face(135)+PI,'anchorage','Station Security Contracts');}
      {const [x,z]=at(45,20.2);PF.kiosk(ctx,x,z,face(45)+PI,'ANCHORAGE');}
      {const [x,z]=at(68,16);ctx.npc('dax',x,z,face(68));}
      stSign(ctx,'DOCKS',0,3.9,.8,0,'#ffc35a',3.6);stSign(ctx,'HAB RING',0,3.9,43.2,PI,'#8fd8ff',4.2);stSign(ctx,'THE HALO',21.2,3.9,22,-PI/2,'#ff5ad8',4.2);stSign(ctx,'MEDBAY',-21.2,3.9,22,PI/2,'#6ff2d6',4);
      ctx.light(cx,10,cz,0xe6ecff,1.25,40);for(const [x,z] of[[12,22],[-12,22],[0,10],[0,34]])ctx.light(x,4.6,z,0xfff0dc,.75,16);
      spawnCrowd(cx,cz,16,10,{pts:[[-12,12],[12,12],[13,32],[-13,32],[-8,22],[8,22],[0,10],[0,34]],barks:['Did you see the freighter come in?','Halcyon raised the docking fees again.','The Halo has a new cocktail. It\'s awful.','I heard the marshal and the liaison had words.','Look up. You can see the terminator line from here.']});}
    /* ---- the Halo: a lounge looking out on the stars, and the Drome, its back bar, built into the north-east corner ---- */
    stRoom(ctx,26,22,8.4,7.6,4,{open:['w','e']});
    stRoom(ctx,42,22,24,20,4.6,{gaps:{w:[[0,6]]},wall:{mat:M.halo,cove:M.pink,band:false},stripMat:M.pink});ctx.poi('halo',42,22,'The Halo',{r:12});
    for(const z of[24.5,29.5])stWindow(ctx,53.75,2.3,z,-PI/2,4.2,2.2);for(const x of[36,44])stWindow(ctx,x,2.3,31.75,PI,5,2.2);
    {const s2=neon('THE HALO',5,1.2,'#ff5ad8');s2.position.set(30.3,3.4,26.5);s2.rotation.y=PI/2;ctx.g.add(s2);}
    {const D=stDrome(ctx,49.6,17,PI,1.3);
      if(D){ctx.npc('vonn',D.keep.x,D.keep.z,0);stSign(ctx,'THE DROME',D.door.x,4.6,D.door.z-.05,0,'#8f7aff',3.4);qUse(ctx,'dead_drop',D.stool.x,D.stool.z,'Search under the third stool',{h:.8});}
      else{PF.bar(ctx,44,30,PI,10);ctx.npc('vonn',44,31.6,PI);qUse(ctx,'dead_drop',43,28.4,'Search under the third stool',{h:.8});}}
    // the lounge: egg chairs round low tables by the windows, a booth corner, plants
    {const seats=[];seats.push(...stCluster(ctx,48,27.5,4,'b',3,{r:.5,h:.45,d:1.35,rot:.3}));seats.push(...stCluster(ctx,39,28,4,'b',2,{r:.5,h:.45,d:1.35}));seats.push(...stCluster(ctx,36,16,3,'a',2,{rot:.5}));seats.push(...stCluster(ctx,41,21,3,'a',1,{rot:1.2}));
      spawnCrowd(42,22,4,0,{role:'PATRON',seats,barks:['Another round!','Don\'t tell my supervisor.','Vonn mixes a mean drink, for a robot.','The Drome\'s better than it looks.']});
      for(const [x,z,k] of[[31.5,13,1],[31.5,31,5],[53,31,8],[44,13,11]])stPlant(ctx,x,z,k,1.2);}
    ctx.light(40,3.8,24,0xff7ae0,.85,16);ctx.light(46,3.4,28,0xffc890,.6,10);
    spawnCrowd(40,22,4,2,{role:'PATRON',barks:['Is the Drome open? It\'s always open.','I\'m waiting for someone. Probably.']});
    /* ---- medbay ---- */
    stRoom(ctx,-26,22,8.4,7.6,4,{open:['w','e']});
    stRoom(ctx,-42,22,24,20,4.4,{gaps:{e:[[0,6]]},wall:{cove:M.teal},stripMat:M.strip});ctx.poi('medbay',-42,22,'Medbay',{r:12});
    PF.medbed(ctx,-50,16,0);PF.medbed(ctx,-50,22,0);PF.medbed(ctx,-50,28,0);PF.console(ctx,-36,30,PI,4);PF.shelf(ctx,-44,31.4,PI,3);ctx.heal(-46,18,'Use a medbay bed');
    {// at each bed: a monitor on an arm, an IV stand; an overhead surgical lamp over the middle bed
      for(const z of[16,22,28]){P.add(ctx.g,M.dark,cyl(.04,.04,1.6,8),-51.6,.8,z-1.2);P.add(ctx.g,M.dark,RB(.5,.06,.06,.02,1),-51.4,1.6,z-1.2);P.add(ctx.g,MAT.screens[(z/6|0)%6],new THREE.PlaneGeometry(.5,.34),-51.15,1.75,z-1.2,0,PI/2,0);P.add(ctx.g,M.trim,RB(.04,.4,.56,.02,1),-51.2,1.75,z-1.2);
        P.add(ctx.g,M.rail,cyl(.02,.02,1.9,6),-48.6,.95,z+1.1);P.add(ctx.g,M.rail,cyl(.25,.25,.02,10),-48.6,.02,z+1.1);P.add(ctx.g,MAT.glass,RB(.16,.24,.06,.02,1),-48.6,1.7,z+1.1);P.add(ctx.g,M.rail,new THREE.BoxGeometry(.3,.02,.02),-48.6,1.86,z+1.1);}
      P.add(ctx.g,M.dark,cyl(.05,.05,1.2,8),-50,3.8,22);P.add(ctx.g,M.white,cyl(.55,.7,.18,24),-50,3.15,22);P.add(ctx.g,M.strip,cyl(.5,.5,.02,24),-50,3.05,22);
      // a body scanner arch, a cryo pod, cabinets with the cross
      {const g=grp(ctx,-46.5,0,13.4,0);for(const s2 of[-1,1])P.add(g,M.white,RB(.3,2.4,.5,.06,1),s2*1.1,1.2,0);P.add(g,M.white,RB(2.5,.3,.5,.06,1),0,2.4,0);P.add(g,M.teal,new THREE.BoxGeometry(2,.05,.52),0,2.22,0);P.add(g,M.dark,RB(2.6,.1,1.4,.03,1),0,.05,0);ctx.box(-47.6,13.4,.2,.3,0,2.5);ctx.box(-45.4,13.4,.2,.3,0,2.5);}
      {const g=grp(ctx,-36,0,13.5,0);P.add(g,M.white,RB(2.2,.6,1,.1,1),0,.3,0);const lid=new THREE.Mesh(cyl(.48,.48,2.1,24,1,true,0,PI),MAT.glass);lid.rotation.z=PI/2;lid.position.y=.62;g.add(lid);P.add(g,M.teal,new THREE.BoxGeometry(2.1,.04,.04),0,.6,.5);ctx.box(-36,13.5,1.1,.5,0,.95);}
      for(const x of[-46.5,-42.5,-38.5]){P.add(ctx.g,M.white,RB(1.6,2,.5,.05,1),x,1,31.6);P.add(ctx.g,M.trim,new THREE.BoxGeometry(.02,1.9,.52),x,1,31.6);P.add(ctx.g,MAT.redGlow,new THREE.BoxGeometry(.3,.08,.52),x-.4,1.6,31.6);P.add(ctx.g,MAT.redGlow,new THREE.BoxGeometry(.08,.3,.52),x-.4,1.6,31.6);}
      // the pharmacy counter, where Dr. Feng sells supplies
      P.add(ctx.g,M.white,RB(4,1.05,.9,.05,1),-40.5,.52,14.6);P.add(ctx.g,M.teal,new THREE.BoxGeometry(4,.05,.92),-40.5,.9,14.6);P.add(ctx.g,M.white,RB(4.2,.06,1,.02,1),-40.5,1.07,14.6);ctx.box(-40.5,14.6,2,.5,0,1.1);
      for(let k=0;k<3;k++)P.add(ctx.g,M.trim,RB(3,.05,.3,.02,1),-40.5,1.4+k*.5,12.35);ctx.npc('feng',-40.5,13.3,0);stSign(ctx,'PHARMACY',-40.5,3,12.3,0,'#6ff2d6',3);
      spawnCrowd(-45,22,3,0,{role:'PATIENT',seats:[[-48,24.8,PI/2,.43]],barks:['It\'s just a scratch. Mostly.']});stChair(ctx,'a',-48,24.8,PI/2);}
    stWindow(ctx,-53.75,2.4,22,PI/2,6,2.2);for(const z of[19,25])P.add(ctx.g,MAT.glass,new THREE.BoxGeometry(2.6,2.2,.05),-50,1.1,z);ctx.light(-42,3.8,22,0xe0f6ff,1,16);
    /* ---- to the hab ring ---- */
    stRoom(ctx,0,46.6,7.6,5.2,4.4,{open:['n','s']});
    /* ---- hab ring: a residential street of cabins under a long skylight ---- */
    stRoom(ctx,0,62,70,26,6,{gaps:{n:[[0,7.6]],s:[[0,5]]},strips:false,hole:[-30,30,60,64]});ctx.poi('habring',0,62,'Hab Ring',{r:24,ft:true});
    {for(const s of[-1,1])P.add(ctx.g,M.trim,new THREE.BoxGeometry(60.6,.25,.3),0,5.85,62+s*2.1);for(const x of[-30,-20,-10,0,10,20,30])P.add(ctx.g,M.trim,new THREE.BoxGeometry(.25,.25,4.4),x,5.85,62);
      for(const s of[-1,1])P.add(ctx.g,M.strip,new THREE.BoxGeometry(60,.06,.3),0,5.7,62+s*2.5);}
    // cabin doors set into both long walls, each with its number, a lit window and a light over the door
    {let no=31;const cab=(x,z,face)=>{const g=grp(ctx,x,0,z,face);P.add(g,M.dark,RB(1.7,2.6,.12,.03,1),0,1.3,0);P.add(g,M.trim,RB(1.95,2.85,.06,.02,1),0,1.4,-.03);P.add(g,M.teal,new THREE.BoxGeometry(.6,.08,.14),0,2.95,0);
        P.add(g,M.warm,new THREE.BoxGeometry(1.6,1,.06),2.1,1.7,0);for(let k=0;k<5;k++)P.add(g,M.trim,new THREE.BoxGeometry(1.6,.04,.08),2.1,1.3+k*.2,.02);const n=decal(['CABIN '+(no++)],1.2,.35,{fg:'#2a2e3a'});n.position.set(0,3.25,.05);g.add(n);};
      for(const x of[-31,-23,-15,-7,8,16,24])cab(x,74.76,PI);for(const x of[-30,-22,-14,8,16,24])cab(x,49.24,0);}
    for(const [x,z,k] of [[-30,54,0],[-22,58,3],[-26,66,6],[22,56,9],[30,62,12],[-6,58,14],[6,66,2]])stPlant(ctx,x,z,k,1.2);
    {const seats=[...stCluster(ctx,-12,58,4,'a',2),...stCluster(ctx,12,58,4,'a',3,{rot:.6})];spawnCrowd(0,60,4,0,{role:'RESIDENT',seats,barks:['Rent went up again.','My cabin heater\'s still broken.','Did you hear the Choir woman sing last night?']});}ctx.locker(32,52,-PI/2);restSpot(ctx,28,68,'Rest in a rented bunk');stBench(ctx,-14,66,0);stBench(ctx,16,66,0);
    ctx.npc('oriel',-6,66,PI);ctx.npc('pip',-20,60,0,{type:'wander',r:10,pause:[1,4],speed:1.9});ctx.npc('arn',-30,64,PI/2);
    {const g=grp(ctx,-19.2,0,74.7,0);P.add(g,MAT.grate,RB(1.4,.9,.1,.03,1),0,.5,0);}qUse(ctx,'biscuit',-19.2,73.6,'Coax Biscuit out of the vent',{h:1});
    for(const [x,z] of[[-22,62],[0,62],[22,62]])ctx.light(x,5,z,0xfff0e0,.85,18);
    spawnCrowd(0,62,10,6,{role:'RESIDENT',pts:[[-30,56],[30,56],[30,68],[-30,68],[0,60]]});
    ctx.chest('an_hab',34,72,{});ctx.glyph('g_an2',-34,72);
    ctx.log('an_arn',-32,58,'Liaison Arn\'s discarded memo','“Director Vash wants the pilot alive. If the Vesper turns up, flag it stolen and hold the pilot. Do not let the Choir woman near them.”',{y:.9});
    /* ---- observation deck: the planet, close enough to touch ---- */
    stRoom(ctx,0,78,6,6,4,{open:['n','s']});stRoom(ctx,0,90,30,18,6,{gaps:{n:[[0,5]]},strips:false,hole:[-13,13,83,97]});ctx.poi('obs',0,90,'Observation Deck',{r:14});
    stWindow(ctx,0,3.2,98.74,PI,27,5.2);for(const s of[-1,1])stWindow(ctx,s*14.74,3,90,s>0?-PI/2:PI/2,14,4.2);
    for(let i=-2;i<=2;i++){const g=grp(ctx,i*5,0,93,PI);P.add(g,MAT.fabricTeal,RB(3,.4,.9,.1,1),0,.45,0);P.add(g,M.dark,RB(3.1,.2,1,.05,1),0,.12,0);ctx.box(i*5,93,1.5,.45,0,.65);}
    stRail(ctx,-13.5,97.2,13.5,97.2,0);ctx.light(0,5,88,0xb8d8ff,.8,20);
    {const seats=[];for(const x of[-11,11]){stChair(ctx,'b',x,95.4,0);stChair(ctx,'b',x+(x<0?2:-2),95.4,0);}seats.push([-11,95.4,0,.45],[9,95.4,0,.45]);stPlant(ctx,-13.5,83,4,1.3);stPlant(ctx,13.5,83,10,1.3);
      spawnCrowd(0,90,3,0,{role:'VISITOR',seats,barks:['You can see the twilight band from here.','I come up here every shift.']});}
    stBots(ctx,[[[-7,15],[7,15],[7,29],[-7,29]],[[0,-42],[0,-4]],[[-3,-50],[-3,-90],[3,-90],[3,-50]],[[-26,53],[26,53],[26,70],[-26,70]],[[-10,-30],[-14,-20],[-8,-18]]]);
    stDrones(ctx,3,[[-15.6,28.6,5,'repair'],[15.6,15.4,5,'repair'],[8.8,22,0,'clean'],[-8.8,22,0,'clean'],[0,22,3.4,'scan'],[12,31,0,'scan']]);
    stDrones(ctx,3,[[-12,-71,3,'scan'],[12,-75,2.6,'scan'],[-20,-60,0,'clean'],[20,-82,0,'repair'],[0,-92,0,'scan']]);
    stDrones(ctx,2,[[-23,74,2.2,'scan'],[16,49.5,2.2,'repair'],[0,62,0,'clean'],[-12,58,.75,'clean']]);
    stDrones(ctx,1,[[0,-38,2.3,'clean'],[0,-12,2.3,'clean'],[0,-25,0,'clean']]);
    stTraffic(ctx);
    ctx.glyph('g_an3',10,84);ctx.log('an_obs',-10,86,'Plaque','“From this deck, the first Halcyon survey team saw the spires light for the first time. The lights have not been seen since.”',{y:.9});
  }};

// ===== 53e_station_life.js =====
/* ================= ANCHORAGE: furniture, people at rest, robots, drones and the traffic outside ================= */
// Models: "The Drome Bar v3.1" by tl0615 (the Halo's back bar), "Sci-Fi Chair | Web 3D • AR • Metaverse" by Md Mahmudur
// Rahman Bappy, "Chair sci-fi mk1" by Cartesian_SOLV3D and "Optimized Potted Plants" by Nicholas-3D, all CC BY 4.0.
// The service robots and the little saucer drones follow the ones in "Space station Scene Wip 7" by 3DHaupt.
const SMF={};
// a model (or one of its meshes, by index) fitted to a size along an axis; the group's origin is the model's bottom centre
function stModel(id,size,o={}){const M=MODELS[id];if(!M)return null;const key=id+'|'+(o.mesh===undefined?'':o.mesh);let src=SMF[key];
  if(!src){let s=M.scene;if(o.mesh!==undefined){M.scene.updateMatrixWorld(true);const ms=[];M.scene.traverse(q=>{if(q.isMesh)ms.push(q);});const m=ms[o.mesh%ms.length];
      s=new THREE.Group();const c=m.clone();c.matrixAutoUpdate=false;c.matrix.copy(m.matrixWorld);s.add(c);}
    s.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(s);src=SMF[key]={s,bb,size:bb.getSize(new THREE.Vector3()),c:bb.getCenter(new THREE.Vector3())};}
  const g=new THREE.Group(),inner=src.s.clone(true),k=size/src.size[o.axis||'y'];inner.scale.setScalar(k);inner.position.set(-src.c.x*k,-src.bb.min.y*k,-src.c.z*k);g.add(inner);
  inner.traverse(q=>{if(q.isMesh){q.castShadow=!!o.shadow;q.receiveShadow=true;}});return g;}
const PLANT_N=15;
function stPlant(ctx,x,z,k,h=1.1,ry=0){const g=stModel('plants',h,{mesh:k});if(!g){PF.plant(ctx,x,z);return;}g.position.set(x,W.floorY,z);g.rotation.y=ry;ctx.g.add(g);ctx.col(x,z,.3);}
// the two chair models face +z once turned by these
const CHAIR={a:{id:'chair_a',h:.92,turn:0},b:{id:'chair_b',h:1.3,turn:Math.PI}};
function stChair(ctx,kind,x,z,face){const C=CHAIR[kind],g=stModel(C.id,C.h);if(!g)return;g.position.set(x,W.floorY,z);g.rotation.y=face+C.turn;ctx.g.add(g);}
function stTable(ctx,x,z,r=.55,h=.72){const M=stM(),P=ctx.P;P.add(ctx.g,M.white,cyl(r,r,.05,24),x,W.floorY+h,z);P.add(ctx.g,M.dark,cyl(.06,.08,h,10),x,W.floorY+h/2,z);P.add(ctx.g,M.dark,cyl(.32,.36,.04,18),x,W.floorY+.02,z);ctx.col(x,z,r*.8);}
// a cluster: a table with chairs round it; some seats taken (the people sit facing the table)
function stCluster(ctx,x,z,n,kind,taken,o={}){stTable(ctx,x,z,o.r||.55,o.h||.72);const seats=[];
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2+(o.rot||0),d=o.d||1.05,sx=x+Math.cos(a)*d,sz=z+Math.sin(a)*d,face=Math.atan2(x-sx,z-sz);stChair(ctx,kind,sx,sz,face);if(i<taken)seats.push([sx,sz,face,kind==='b'?.45:.43]);}
  return seats;}
/* ---- the Halo's back bar: the Drome, its two open sides closed in its own brick, its doorway opening onto the lounge ---- */
function stDrome(ctx,cx,cz,ry,S){const M=MODELS.halobar;if(!M)return null;const src=M.scene.clone(true);let brick=null,bar=null;
  src.traverse(q=>{if(!q.isMesh)return;if(['Object_13','Object_19','Object_6'].includes(q.name)){q.visible=false;return;}q.material=q.material.clone();q.material.side=THREE.DoubleSide;q.receiveShadow=true;
    // a dive bar lit mostly by its own neon and signs: every surface glows faintly with its own colours
    const mt=q.material;if(mt.map&&!mt.emissiveMap){mt.emissiveMap=mt.map;mt.emissive=new THREE.Color(0x8a8aa0);mt.emissiveIntensity=1;}if(q.name==='Object_4'||q.name==='Object_15'){mt.emissive=new THREE.Color(0xffffff);mt.emissiveIntensity=.9;}
    if(q.name==='Object_21')brick=q.material;if(q.name==='Object_8')bar=q;});
  src.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(src),c=bb.getCenter(new THREE.Vector3()),sz=bb.getSize(new THREE.Vector3());
  const outer=grp(ctx,cx,W.floorY,cz,ry);src.scale.setScalar(S);src.position.set(-c.x*S,-bb.min.y*S,-c.z*S);outer.add(src);
  const hx=sz.x*S/2,hz=sz.z*S/2,H=sz.y*S,dx=(1.79)*S,dw=1.25*S;
  if(brick){const bm=brick.clone();bm.map=brick.map.clone();bm.map.needsUpdate=true;bm.map.wrapS=bm.map.wrapT=THREE.RepeatWrapping;bm.map.repeat.set(2.6,1.2);
    const w1=new THREE.Mesh(new THREE.BoxGeometry(.18,H,hz*2),bm);w1.position.set(hx,H/2,0);outer.add(w1);const w2=new THREE.Mesh(new THREE.BoxGeometry(hx*2,H,.18),bm);w2.position.set(0,H/2,hz);outer.add(w2);}
  // walls are solid, but the doorway
  const wall=(lx,lz,hw,hd)=>{const w=toW(cx,cz,ry,lx,lz);ctx.plat({x:w.x,z:w.z,hw,hd,rot:ry,top:W.floorY+H,bot:W.floorY-1});};
  wall(-hx,0,.2,hz);wall(hx,0,.2,hz);wall(0,hz,hx,.2);const l0=-hx,l1=dx-dw/2,r0=dx+dw/2,r1=hx;wall((l0+l1)/2,-hz,(l1-l0)/2,.2);wall((r0+r1)/2,-hz,(r1-r0)/2,.2);
  {const w=toW(cx,cz,ry,dx,-hz);ctx.plat({x:w.x,z:w.z,hw:dw/2+.2,hd:.25,rot:ry,top:W.floorY+H,bot:W.floorY+2.4*S/1.3,solidOnly:true});}
  outer.updateMatrixWorld(true);if(bar){const b=new THREE.Box3().setFromObject(bar),bc=b.getCenter(new THREE.Vector3()),bs=b.getSize(new THREE.Vector3());ctx.box(bc.x,bc.z,bs.x/2,bs.z/2,0,W.floorY+bs.y+.05);}
  ctx.light(cx,W.floorY+H-.6,cz,0xb09aff,1.5,14);{const w=toW(cx,cz,ry,-hx*.5,0);ctx.light(w.x,W.floorY+2.2,w.z,0x5a8aff,.7,7);}
  return {door:toW(cx,cz,ry,dx,-hz-.8),inside:toW(cx,cz,ry,dx,-hz+1.2),keep:toW(cx,cz,ry,-hx+.55,-.6),stool:toW(cx,cz,ry,-.2,-1.9),hx,hz,H};}
/* ---- the sky outside every window: one dome round the camera ---- */
function stSkyDome(ctx){const m=stSkyMat().clone();m.side=THREE.BackSide;m.depthWrite=false;m.uniforms=stSkyMat().uniforms;const d=new THREE.Mesh(new THREE.SphereGeometry(1500,48,24),m);
  d.renderOrder=-10;d.frustumCulled=false;ctx.g.add(d);ctx.anim(()=>{d.position.copy(camera.position);});return d;}
let ST_GLASS=null;const stGlass=()=>ST_GLASS||(ST_GLASS=new THREE.MeshStandardMaterial({color:0xa8ccff,transparent:true,opacity:.1,roughness:.05,metalness:.3,depthWrite:false}));
/* ---- service robots: glossy cylinders gliding on set rounds, a message band scrolling round their heads ---- */
let BOT_TEX=null;
function botTex(){if(BOT_TEX)return BOT_TEX;const c=mkCanvas(2048);c.height=128;const g=c.getContext('2d');g.fillStyle='#04080a';g.fillRect(0,0,2048,128);g.font='bold 92px "Arial Narrow",Arial,sans-serif';g.textBaseline='middle';
  let x=20;for(const [t,col] of [['WELCOME TO ANCHORAGE','#9ffff0'],['  ◆  ','#ffc35a'],['BAY 3 OPEN','#ffffff'],['  ◆  ','#ffc35a'],['MIND THE LOADERS','#9ffff0'],['  ◆  ','#ffc35a']]){g.fillStyle=col;g.fillText(t,x,66);x+=g.measureText(t).width;}const t=new THREE.CanvasTexture(c);t.wrapS=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;return BOT_TEX=t;}
function stBots(ctx,routes){const body=new THREE.MeshStandardMaterial({color:0x0e0f12,roughness:.18,metalness:.55}),grey=new THREE.MeshStandardMaterial({color:0x5a5e66,roughness:.4,metalness:.5}),
    band=new THREE.MeshStandardMaterial({color:0x000000,emissive:0xffffff,emissiveMap:botTex(),emissiveIntensity:.9,map:botTex()}),glow=stM().teal,bots=[];
  for(const pts of routes){const g=new THREE.Group();ctx.g.add(g);
    // the robot from the reference station itself, stood 1.6 m tall, its screen turned to face the way it travels
    const real=stModel('stbot',1.75,{shadow:true});if(real){real.rotation.y=-Math.PI/2;g.add(real);real.updateMatrixWorld(true);
      real.traverse(q=>{if(!q.isMesh)return;q.material=q.material.clone();
        // the static screen captions go; the screen panel itself carries the scrolling message, wrapped round it
        if(/Warning|Under_Attack|Station|Text/.test(q.name)){q.visible=false;return;}
        if(q.name==='Circle_1'){const pos=q.geometry.attributes.position,m=q.matrixWorld.clone().premultiply(real.matrixWorld.clone().invert()),v=new THREE.Vector3(),pts=[];
          for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(m);pts.push(v.clone());}
          const bb=new THREE.Box3().setFromPoints(pts),c=bb.getCenter(new THREE.Vector3()),body=new THREE.Box3().setFromObject(real),bc=body.getCenter(new THREE.Vector3()),uv=new Float32Array(pos.count*2);
          pts.forEach((p,i)=>{uv[i*2]=-Math.atan2(p.z-bc.z,p.x-bc.x)/(Math.PI*2)*.55;uv[i*2+1]=(p.y-bb.min.y)/Math.max(1e-6,bb.max.y-bb.min.y);});
          q.geometry=q.geometry.clone();q.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
          q.material=new THREE.MeshStandardMaterial({color:0x000000,map:botTex(),emissive:0xffffff,emissiveMap:botTex(),emissiveIntensity:1.5,roughness:.35});q.material.userData.noGlow=true;}});
      const bot={g,pts,i:0,x:pts[0][0],z:pts[0][1],face:0,wait:rf(0,3),ph:rf(0,6),b:null};g.position.set(bot.x,W.floorY,bot.z);bots.push(bot);continue;}
    // one straight-sided column in three solid sections (no overlapping shells): body, the message band, the upper body and cap
    g.add(new THREE.Mesh(cyl(.3,.3,.62,32),body)).position.y=.45;
    const b=new THREE.Mesh(cyl(.3,.3,.2,32),[band,body,body]);b.position.y=.86;g.add(b);
    g.add(new THREE.Mesh(cyl(.3,.3,.11,32),body)).position.y=1.015;const cap=new THREE.Mesh(sph(.3,32,10,0,Math.PI*2,0,Math.PI/2),body);cap.scale.y=.45;cap.position.y=1.07;g.add(cap);
    g.add(new THREE.Mesh(cyl(.305,.305,.03,32),grey)).position.y=.745;g.add(new THREE.Mesh(cyl(.305,.305,.03,32),grey)).position.y=.975;
    g.add(new THREE.Mesh(cyl(.34,.36,.12,24),grey)).position.y=.08;const ring=new THREE.Mesh(tor(.33,.02,6,32),glow);ring.rotation.x=Math.PI/2;ring.position.y=.03;g.add(ring);
    const bot={g,pts,i:0,x:pts[0][0],z:pts[0][1],face:0,wait:rf(0,3),ph:rf(0,6),b};g.position.set(bot.x,W.floorY,bot.z);bots.push(bot);}
  ctx.anim(dt=>{botTex().offset.x-=dt*.035;for(const r of bots){const t=r.pts[(r.i+1)%r.pts.length],dx=t[0]-r.x,dz=t[1]-r.z,d=Math.hypot(dx,dz);
      if(r.wait>0){r.wait-=dt;continue;}const pd=Math.hypot(player.x-r.x,player.z-r.z),ahead=(player.x-r.x)*dx+(player.z-r.z)*dz>0;if(pd<1.6&&ahead)continue;// someone in the way: wait
      const want=Math.atan2(dx,dz);let df=wrapA(want-r.face);r.face+=clamp(df,-dt*2.5,dt*2.5);
      if(Math.abs(df)<.3){const s=Math.min(d,dt*1.15);r.x+=dx/d*s;r.z+=dz/d*s;}if(d<.05){r.i=(r.i+1)%r.pts.length;r.wait=rf(1.5,4);}
      r.g.position.set(r.x,W.floorY+Math.sin(performance.now()*.004+r.ph)*.01,r.z);r.g.rotation.y=r.face;}});(window.__st=window.__st||{}).bots=bots;return bots;}
/* ---- saucer drones: fly from job to job, scanning, repairing or cleaning ---- */
function stDrones(ctx,n,jobs){const ringM=new THREE.MeshStandardMaterial({color:0x2a2c32,roughness:.35,metalness:.7}),dish=new THREE.MeshStandardMaterial({color:0xb8bcc6,roughness:.35,metalness:.5}),
    core=new THREE.MeshStandardMaterial({color:0x301004,emissive:0xff7a2a,emissiveIntensity:1.1,roughness:.4}),beamM=new THREE.MeshBasicMaterial({color:0x6ff2d6,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),list=[];
  for(let i=0;i<n;i++){const g=new THREE.Group();ctx.g.add(g);const r=new THREE.Mesh(cyl(.26,.2,.07,10,1,true),ringM);g.add(r);g.add(new THREE.Mesh(cyl(.19,.13,.05,10),dish)).position.y=-.01;
    const dome=new THREE.Mesh(sph(.09,12,6,0,Math.PI*2,0,Math.PI/2),core);dome.position.y=.02;g.add(dome);
    const beam=new THREE.Mesh(new THREE.ConeGeometry(.5,1,16,1,true),beamM.clone());beam.visible=false;g.add(beam);
    const j=pick(jobs),d={g,beam,x:j[0]+rf(-3,3),y:3.5,z:j[1]+rf(-3,3),job:null,t:0,ph:rf(0,6)};g.position.set(d.x,d.y,d.z);list.push(d);}
  ctx.anim(dt=>{const now=performance.now()/1000;for(const d of list){
    if(!d.job){d.job=pick(jobs);d.t=0;d.kind=d.job[3]||pick(['scan','repair','clean']);}
    const [jx,jz,jy]=d.job,hy=(jy||0)+1.6,dx=jx-d.x,dz=jz-d.z,dy=hy-d.y,dd=Math.hypot(dx,dz);
    if(dd>.15||Math.abs(dy)>.1){const s=Math.min(1,dt*2.4/Math.max(.001,Math.hypot(dd,dy)));d.x+=dx*s;d.z+=dz*s;d.y+=dy*s;d.beam.visible=false;}
    else{d.t+=dt;const b=d.beam;b.visible=true;const len=hy-(jy||0)-.05;b.scale.set(d.kind==='scan'?.6:.18,len,d.kind==='scan'?.6:.18);b.position.y=-len/2-.03;
      b.material.color.set(d.kind==='scan'?0x6ff2d6:d.kind==='repair'?0xffa040:0xcfe8ff);b.material.opacity=d.kind==='scan'?.12+Math.sin(now*9)*.05:.22;b.rotation.y+=dt*3;
      if(d.kind==='repair'&&Math.random()<.35)for(let k=0;k<3;k++)FX.spawn(jx+rf(-.08,.08),(jy||0)+.05,jz+rf(-.08,.08),rf(-1,1),rf(.5,1.6),rf(-1,1),{life:rf(.2,.5),size:rf(.02,.05),c0:0xffffff,c1:0xffa040,drag:1.2,grav:8});
      if(d.kind==='clean'&&Math.random()<.3)FX.spawn(jx+rf(-.3,.3),(jy||0)+.15,jz+rf(-.3,.3),rf(-.3,.3),rf(.1,.4),rf(-.3,.3),{life:rf(.5,1),size:rf(.05,.1),c0:0xe8f4ff,c1:0x8fa0b0,drag:2,grav:-.2});
      if(d.t>rf(3.5,6)){d.job=null;}}
    d.g.position.set(d.x,d.y+Math.sin(now*2.3+d.ph)*.06,d.z);d.g.rotation.y+=dt*.8;}});const st=(window.__st=window.__st||{});st.drones=(st.drones||[]).concat(list);return list;}
/* ---- traffic outside: freighters, shuttles and a liner crossing beyond the bay doors ---- */
function stTraffic(ctx){const ships=[],navR=new THREE.MeshBasicMaterial({color:0xff3a2a}),navG=new THREE.MeshBasicMaterial({color:0x3aff6a}),navW=new THREE.MeshBasicMaterial({color:0xffffff});
  const mk=(id,len)=>{const g=stModel(id,len,{axis:'x'});if(!g)return null;g.traverse(q=>{if(q.isMesh){q.castShadow=false;}});const n=new THREE.Group();n.add(g);
    for(const [m,z] of[[navR,-len*.12],[navG,len*.12]]){const s=new THREE.Mesh(sph(.35,8,6),m);s.position.set(0,len*.12,z);n.add(s);}const w=new THREE.Mesh(sph(.3,8,6),navW);w.position.set(-len*.45,len*.2,0);n.add(w);n.userData.blink=w;ctx.g.add(n);return n;};
  // a freighter tied up at a docking arm off to starboard of the bay
  {const arm=grp(ctx,52,8,-150,0),M=stM();ctx.P.add(arm,M.dark,RB(4,3,90,.2,1),0,0,45);for(let i=0;i<8;i++)ctx.P.add(arm,M.strip,new THREE.BoxGeometry(4.2,.2,.4),0,1.6,i*11);
    const f=mk('sabre',46);if(f){f.position.set(40,6,-150);f.rotation.y=.1;ships.push({g:f,still:true});}}
  // ships crossing on lanes, and a shuttle that comes in towards the bay and turns away
  const lanes=[['sabre',26,-260,40,-.6,26],['env_shuttle',12,-190,18,.9,32],['sabre',30,-420,90,.35,18],['env_shuttle',10,-150,-6,-1.2,24]];
  for(const [id,len,z,y,dir,sp] of lanes){const g=mk(id,len);if(!g)continue;ships.push({g,z,y,dir:Math.sign(dir),sp,t:rf(0,1),span:900});}
  ctx.anim(dt=>{const now=performance.now()/1000;for(const s of ships){if(s.g.userData.blink)s.g.userData.blink.visible=Math.sin(now*3+s.g.id)>.5;if(s.still)continue;
    s.t=(s.t+dt*s.sp/s.span)%1;const x=(s.t-.5)*s.span*s.dir;s.g.position.set(x,s.y+Math.sin(now*.3+s.z)*1.5,s.z);s.g.rotation.y=s.dir>0?0:Math.PI;}});
  return ships;}

// ===== 54_z_calder.js =====
/* ================= ZONE: Calder (a lagoon world) ================= */
const CA_ISLES=[[0,-34,34,3.2],[90,262,30,2.6],[-160,120,46,.9],[130,90,32,3],[-120,206,40,3.4],[-30,-210,22,2.2],[-200,-40,10,2],[210,20,10,2.2],[-150,232,8,2],[200,-170,26,2.6],[-240,-180,24,2.8],[230,220,20,2.4]];
const CA_BARS=[[0,-6,-130,100,7],[30,-20,130,80,6],[-150,150,-120,190,6],[-30,-60,-30,-190,6],[130,90,200,-150,5]];
function caHeight(x,z){let h=-3.4+(fbm(x*.02,z*.02)-.5)*1.6;
  for(const [cx,cz,r,ih] of CA_ISLES){const d=Math.hypot(x-cx,z-cz)/r;if(d<1.3)h=Math.max(h,-3.4+(ih+3.4)*(1-smooth(.55,1.25,d))+(fbm(x*.06,z*.06)-.5)*1.2*(1-smooth(.4,1,d)));}
  for(const [ax,az,bx,bz,w] of CA_BARS){const L=Math.hypot(bx-ax,bz-az),ux=(bx-ax)/L,uz=(bz-az)/L,t=clamp((x-ax)*ux+(z-az)*uz,0,L),px=ax+ux*t,pz=az+uz*t,d=Math.hypot(x-px,z-pz);if(d<w*1.6)h=Math.max(h,-.55-smooth(w*.5,w*1.6,d)*2.8+Math.sin(t*.2)*.15);}
  let edge=Math.max(0,Math.max(Math.abs(x),Math.abs(z))-262)*.6;return h+edge;}
const CAC={sand:new THREE.Color(0xd8c8a0),grass:new THREE.Color(0x3a8a5a),moss:new THREE.Color(0x2a6a5a),deep:new THREE.Color(0x1a4a5a),mud:new THREE.Color(0x6a5a3a),rock:new THREE.Color(0x5a6a6a)};
ZONES.calder={id:'calder',name:'Calder',world:'Calder · Lagoon moon',blurb:'A warm lagoon moon of reed islands, stilt villages and a temple half-drowned in the tide.',kind:'outdoor',size:600,seed:53,lvl:[15,20],
  detail:'ground',water:{y:0,color:0x2a8a8a,op:.78,emissive:0x0a3a3a},
  sky:{night:0x0a2a4a,dusk:0x4a8ab0,sun:0xfff4d0,horizon:0x8ac8c8,stars:.3,sunElev:22,sunAz:-.6,fog:[0x6aa8b0,70,420],hemi:[0xb8f0e8,0x2a4a3a,.85],sunColor:0xfff0d8,sunInt:1.4,
    bodies:[{type:'giant',dir:[600,300,-900],r:200,tilt:.2,color:0x9ad8ff},{type:'moon',dir:[-700,420,-400],r:22,color:0xd8d0c0}]},
  tempAt:()=>26,height:caHeight,
  color:(x,z,y,sl,c)=>{const n=fbm(x*.05,z*.05+3);if(y<-.4)c.copy(CAC.deep).lerp(CAC.mud,clamp((y+3)/2.6,0,1));else{c.copy(CAC.sand).lerp(CAC.grass,smooth(.2,1.2,y)*(.6+n*.5));c.lerp(CAC.moss,clamp(n*1.5-.5,0,1)*smooth(.5,1.5,y));c.lerp(CAC.rock,sl*.8);}const g=.9+n*.2;c.r*=g;c.g*=g;c.b*=g;},
  keep:[{x:0,z:-34,r:26},{x:0,z:14,r:24},{x:90,z:262,r:22}],
  flora:[{type:'fern',count:160,where:(x,z,y)=>y>.8&&fbm(x*.03,z*.03)>.4},{type:'reeds',count:2400,where:(x,z,y)=>y>-.9&&y<.9,hsl:[.2,.32,.4,.6,.35,.55],accent:.08},
    {type:'lily',count:300},{type:'rock',count:120,where:(x,z,y)=>y>-1,hsl:[.45,.55,.05,.15,.4,.6]},{type:'mushroom',count:30,where:(x,z,y)=>y>1.5&&Math.hypot(x+120,z-206)<40,palette:[0xffc35a,0xff8a5a,0xd36cf0]}],
  entries:{ship:{x:6,z:-30,face:0},town:{x:0,z:-8,face:0}},spawn:{x:6,z:-30,face:0},
  build(ctx){const P=ctx.P,st=ctx.state();
    vesperPad(ctx,0,-44,Math.PI*.1);ctx.safe(0,-10,40);
    /* ---- Reedwater, on stilts over the lagoon ---- */
    ctx.poi('reedwater',0,10,'Reedwater',{r:30,ft:true,icon:'town'});const DY=1.9,deck=std(TEX.reed,{color:0xc8a878,roughness:.9}),thatch=std(TEX.reed,{color:0xb89a58,roughness:.95,side:THREE.DoubleSide});
    const decks=[[0,12,14,14],[-17,14,9,9],[17,16,9,9],[0,31,10,9],[-14,30,7,7],[16,32,7,7]],walks=[[0,-10,0,5,3],[-7,13,-12.5,13,2.4],[7,14,12.5,15,2.4],[0,19,0,26.5,2.4],[-5,31,-10.5,30,2],[5,31,12.5,32,2],[-17,18.5,-15,26.5,2],[17,20.5,16,28.5,2]];
    for(const [x,z,w,d] of decks){slab(ctx,x,z,w,d,DY,deck);for(const sx of[-1,1])for(const sz of[-1,1])P.add(ctx.g,MAT.bark,cyl(.18,.24,DY+3.6,8),x+sx*(w/2-.4),DY-2.2,z+sz*(d/2-.4));}
    for(const [ax,az,bx,bz,w] of walks){const L=Math.hypot(bx-ax,bz-az),ry=Math.atan2(bx-ax,bz-az);const mx=(ax+bx)/2,mz=(az+bz)/2;slab(ctx,mx,mz,w,L,DY-.05,deck,ry,.25);for(let t=0;t<=L;t+=3){const px=ax+(bx-ax)*t/L,pz=az+(bz-az)*t/L;for(const s of[-1,1])P.add(ctx.g,MAT.bark,cyl(.1,.1,1,6),px+Math.cos(ry)*s*w/2,DY+.5,pz-Math.sin(ry)*s*w/2);}}
    // huts: reed walls under a conical thatch roof
    for(const [x,z,r,name] of [[-17,14,3.2,'MARU'],[17,16,3.2,'ONA'],[0,33,3.6,'LONGHOUSE'],[-14,30,2.4,''],[16,32,2.4,'']]){const g=grp(ctx,x,DY,z,0);P.add(g,thatch,scaleUV(cyl(r,r,2.6,18,1,true,.5,5.6),4,1),0,1.3,0);P.add(g,thatch,scaleUV(new THREE.ConeGeometry(r*1.35,2.4,18,1,true),5,1),0,3.8,0);
      P.add(g,MAT.bark,cyl(.12,.12,3,8),0,1.5,0);ctx.light(x,DY+2.2,z,0xffc35a,.8,8,true);if(name){const d=decal(name,1.6,.4,{fg:'#3a2a1a'});d.position.set(Math.sin(.5)*r*1.01,2.4,Math.cos(.5)*r*1.01);d.rotation.y=.5;g.add(d);}
      for(let i=0;i<14;i++){const a=i/14*6.28;if(a>.2&&a<.8)continue;ctx.col(x+Math.cos(a)*r,z+Math.sin(a)*r,.45);}}
    for(let i=0;i<10;i++){const a=i/10*6.28;PF.lamp(ctx,Math.cos(a)*22,12+Math.sin(a)*22,0xffc35a);}
    campfire(ctx,4,8);PF.crates(ctx,-4,16,3,2);ctx.bench(-4,6,0);ctx.board(4,18,Math.PI,'calder','Reedwater Hunts');ctx.locker(-2,34,Math.PI);restSpot(ctx,2,34,'Rest in the longhouse');ctx.heal(-17,16,'Ask for a healer\'s poultice');
    ctx.npc('maru',-15,12,Math.PI/2);ctx.npc('tavi',-4,-2,Math.PI,{type:'route',pts:[[-4,-2],[0,4],[6,10],[-2,14]],pause:[3,7]});ctx.npc('ona',15,14,-Math.PI/2);ctx.npc('kesh',2,28,Math.PI);ctx.npc('lumo',6,14,Math.PI);
    spawnCrowd(0,12,8,6,{barks:['Fair tide today.','The gliders are hungry this season.','Mind the planks, they bite.','Elder Maru says the temple is waking.','Fish again tonight. Always fish.']});
    /* ---- fishing nets out on the stones ---- */
    for(const [id,x,z,path] of [['net1',-46,30,[[-26,22],[-31,24],[-36,26.5],[-41,28.5]]],['net2',-62,-8,[[-24,-14],[-30,-12],[-36,-11],[-42,-10],[-48,-9],[-54,-8.6]]],['net3',52,44,[[24,36],[30,38],[36,40],[42,41],[47,43]]]]){
      stones(ctx,path.map(([px,pz])=>[px,pz,.9,1.1]),{abs:true,water:true,mat:MAT.basalt});stones(ctx,[[x,z,.9,1.8]],{abs:true,water:true,mat:MAT.basalt});
      const g=grp(ctx,x,.9,z,rr(0,3));for(const s of[-1,1])P.add(g,MAT.bark,cyl(.08,.08,2.4,6),s*1.2,1.2,0);P.add(g,MAT.fabric,new THREE.PlaneGeometry(2.4,1.6,4,3),0,1.3,0);qUse(ctx,id,x,z,'Mend the net',{y:.9});}
    /* ---- reed beds and the Old One ---- */
    ctx.poi('reeds',-160,120,'Western Reed Beds',{r:46});ctx.enemies('stalker',-160,120,36,6,16);qBoss(ctx,'s_alpha','stalker','stalkeralpha',-170,130,19,{name:'The Old One',scale:1.8,hpMul:5,elite:true});ctx.nodes('resin',-160,120,40,8);
    ctx.chest('ca_reeds',-180,100,{});ctx.glyph('g_ca1',-140,150);ctx.log('ca_hunter',-150,96,'A hunter\'s tally stick','Notches for every stalker taken. The last six are crossed out, and someone has carved an eye.');
    /* ---- east island ---- */
    ctx.poi('eastisle',130,90,'Stalker Isle',{r:30});ctx.enemies('stalker',130,90,24,6,17);ctx.nodes('resin',130,90,26,5);ctx.chest('ca_east',140,100,{kind:'locked'});ctx.glyph('g_ca2',112,74);
    /* ---- the north forest isle ---- */
    ctx.poi('northisle',-120,206,'Fernwood Isle',{r:36});ctx.enemies('stalker',-120,206,26,4,18);ctx.nodes('resin',-120,206,30,4);ctx.chest('ca_fern',-108,220,{});
    ctx.log('ca_temple',-130,190,'Carving on a fallen trunk','“When the four lights burn, the drowned one wakes.” Below it, in newer letters: “Please don\'t.”');
    /* ---- the far isles ---- */
    ctx.enemies('stalker',200,-170,20,4,18);ctx.chest('ca_se',206,-176,{kind:'locked'});ctx.enemies('stalker',-240,-180,18,4,19);ctx.chest('ca_sw',-236,-188,{});ctx.glyph('g_ca3',-250,-170);ctx.enemies('stalker',230,220,16,3,20);ctx.chest('ca_ne',226,214,{});
    ctx.enemies('glider',60,-80,40,4,16);ctx.enemies('glider',-60,100,40,4,17);ctx.enemies('glider',160,0,40,3,18);ctx.enemies('glider',0,180,40,4,19);
    ctx.nodes('pearl',0,60,80,10);ctx.nodes('pearl',-100,-80,60,6);ctx.nodes('pearl',120,160,60,6);
    /* ---- the four shrines ---- */
    for(const [id,x,z,path] of [['shrine1',-200,-40,[]],['shrine2',210,20,[]],['shrine3',-30,-220,[]],['shrine4',-150,232,[[-150,218,1.4],[-146,222,2.4],[-149,226,3.4]]]]){
      const y=groundY(x,z),g=grp(ctx,x,y,z,rr(0,3));P.add(g,MAT.runes,lathe([[1.2,0],[1,1],[.6,1.6],[.7,2.4],[0,2.6]],8),0,0,0);const fl=new THREE.Mesh(sph(.35,16,12),MAT.amber);fl.position.y=2.9;g.add(fl);const gl=glowAt(ctx,g,0,2.9,0,0xffc35a,4,.8);
      ctx.anim(()=>{const on=!!st.flags['used_'+id];fl.visible=gl.visible=on;});ctx.col(x,z,1.3);if(path.length)stones(ctx,path.map(([a,b,h])=>[a,b,y+h,1]),{abs:true,water:true});qUse(ctx,id,x+1.6,z,'Light the shrine',{h:2});}
    /* ---- the Shoal Path and the drowned temple ---- */
    ctx.poi('shoal',60,140,'The Shoal Path',{r:20});
    {const pts=[];for(let i=0;i<16;i++){const t=i/15,x=lerp(60,86,t)+Math.sin(i*1.4)*4,z=lerp(140,232,t);pts.push([x,z,.9+Math.sin(i*.9)*.3+(i%4===3?.8:0),1.1]);}stones(ctx,pts,{abs:true,water:true,mat:MAT.runes,glow:0x8fffe0});}
    ctx.poi('temple',90,262,'The Drowned Temple',{r:30});const T=PF.spire(ctx,90,276,20);T.lit=st.flags.used_spire2?1:0;ruins(ctx,90,262,26,16,{tall:7});
    for(const [id,x,z] of [['pylon1',62,262],['pylon2',118,262],['pylon3',90,292]]){const y=groundY(x,z),g=grp(ctx,x,y,z,0);P.add(g,MAT.runes,scaleUV(cyl(.7,.9,5,6),1,2),0,2.5,0);const c=new THREE.Mesh(new THREE.OctahedronGeometry(.6,0),new THREE.MeshStandardMaterial({color:0x8fffe0,emissive:0x2a6a60,emissiveIntensity:.3,flatShading:true}));c.position.y=5.8;g.add(c);
      ctx.anim(dt=>{c.rotation.y+=dt;c.material.emissiveIntensity=st.flags['used_'+id]?1.6:.3;});ctx.col(x,z,1);qUse(ctx,id,x+1.4,z,'Wake the pylon',{h:2});}
    qBoss(ctx,'m14_drowned','leviathan','leviathan',90,240,20,{cond:()=>['pylon1','pylon2','pylon3'].every(p=>st.flags['used_'+p])});
    qUse(ctx,'spire2',90,272,'Touch the drowned spire',{ok:()=>!!st.killed.leviathan,act:()=>{T.lit=1;sfx('warp');FX.burst(new THREE.Vector3(90,groundY(90,272)+3,272),0x8fffe0,80,8,1,.18);}});
    ctx.chest('ca_temple',104,250,{kind:'locked'});ctx.glyph('g_ca4',70,284);
    ctx.log('ca_choir',80,248,'Choir pilgrim\'s journal','“The second spire sleeps under the tide. Three pylons hold its breath. Wake them and the guardian wakes too.”');
    // deep water: too deep to wade, the current pushes you back
    ctx.hazard({kind:'deep',test:(x,z,y)=>groundY(x,z)<-1.5&&y<.2,msg:'Too deep to wade. The current drags you back.'});
  }};

// ===== 55_z_ashfall.js =====
/* ================= ZONE: Ashfall (a volcanic world and the Builders' Ark) ================= */
const AF_RIVERS=[{w:7,pts:[[-320,60],[-220,40],[-130,56],[-60,34],[0,46],[70,30],[150,50],[230,24],[320,40]]},{w:6,pts:[[-140,-320],[-128,-220],[-150,-130],[-120,-40],[-130,48]]},{w:5,pts:[[320,-120],[240,-150],[200,-210],[150,-320]]}];
const AF_BRIDGES=[{x:0,z:46,r:16},{x:-133,z:-200,r:14},{x:230,z:24,r:14}];
const afBridge=(x,z)=>AF_BRIDGES.some(b=>Math.hypot(x-b.x,z-b.z)<b.r*.75);
const AF_LAVA=-2.4;
function afRiverD(x,z){let best=1e9;for(const R of AF_RIVERS){const p=R.pts;for(let i=0;i<p.length-1;i++){const [ax,az]=p[i],[bx,bz]=p[i+1],L=Math.hypot(bx-ax,bz-az),ux=(bx-ax)/L,uz=(bz-az)/L,t=clamp((x-ax)*ux+(z-az)*uz,0,L),d=Math.hypot(x-ax-ux*t,z-az-uz*t)/R.w;if(d<best)best=d;}}return best;}
function afRaw(x,z){let h=(fbm(x*.007+5,z*.007-9)-.5)*26+(ridged(x*.02,z*.02)-.5)*6;
  const dv=Math.hypot(x+210,z-170)/60;h+=40*Math.max(0,1-dv)*(dv<.25?.4+dv*2.4:1);const dv2=Math.hypot(x-220,z-190)/52;h+=34*Math.max(0,1-dv2)*(dv2<.25?.4+dv2*2.4:1);
  let edge=Math.max(0,Math.max(Math.abs(x),Math.abs(z))-272)*1.3;return h+edge;}
const AF_H={land:afRaw(0,-260),shelter:afRaw(-60,-200),camp:afRaw(120,-40)};
function afHeight(x,z){let h=afRaw(x,z);
  h=flatTo(h,x,z,0,-260,18,32,AF_H.land);h=flatTo(h,x,z,-60,-200,16,28,AF_H.shelter);h=flatTo(h,x,z,120,-40,30,46,AF_H.camp);h=flatTo(h,x,z,0,180,62,90,3);h=flatTo(h,x,z,-110,-180,8,14,afRaw(-110,-180));
  let carve=1-smooth(.7,1.6,afRiverD(x,z));for(const b of AF_BRIDGES)carve*=smooth(b.r*.6,b.r,Math.hypot(x-b.x,z-b.z));
  return lerp(h,AF_LAVA-1.2,carve);}
const AFC={ash:new THREE.Color(0x3a3034),dark:new THREE.Color(0x221c20),rock:new THREE.Color(0x4a3a3a),glow:new THREE.Color(0xa0401a),rune:new THREE.Color(0x3a3a50),sulfur:new THREE.Color(0x8a7a3a)};
const COHORT_ARCH=[{id:'command',x:120,z:-66,face:0,w:3,d:2,floors:3,kind:'security',accent:'orange',hull:'plateDark',groundMat:'blast',name:'COMMAND',sub:'GRAY COHORT',light:0xffb890,
  extra:(ctx,b,at)=>{const p=at(-1.5,-.6);ctx.log('cohort_orders',p.x,p.z,'Standing orders, Gray Cohort','Hold the camp. Hold the prisoner. Halcyon pays on delivery, not on intent. Anyone who wanders into the Ashfall without a Cohort tag is a salvage claim.',{y:groundY(p.x,p.z)+.05});}}];
ZONES.ashfall={arch:COHORT_ARCH,id:'ashfall',name:'Ashfall',world:'Ashfall · Volcanic world',blurb:'Ash, fire and the Builders\' Ark, half-buried and humming.',kind:'outdoor',size:640,seed:67,lvl:[19,25],
  detail:'ground',
  sky:{night:0x1a0606,dusk:0x6a2a14,sun:0xff8a3a,horizon:0x5a1a0a,stars:.2,sunElev:12,sunAz:2.4,sunSize:1.3,fog:[0x4a2418,60,340],hemi:[0xe0a080,0x3a1a12,.95],sunColor:0xffb070,sunInt:1.35,
    bodies:[{type:'moon',dir:[-600,380,-700],r:40,color:0x8a6a5a}]},
  tempAt:(x,z)=>34+(1-smooth(1,3,afRiverD(x,z)))*22+(z>120&&Math.abs(x)<44?-8:0),
  height:afHeight,
  color:(x,z,y,sl,c)=>{const n=fbm(x*.05+9,z*.05);c.copy(AFC.ash).lerp(AFC.dark,clamp(n*1.5-.4,0,1));c.lerp(AFC.rock,sl*.8);c.lerp(AFC.glow,(1-smooth(.9,2.2,afRiverD(x,z)))*.8);
    c.lerp(AFC.sulfur,smooth(.62,.7,fbm(x*.03+2,z*.03))*.4);c.lerp(AFC.rune,(1-smooth(40,70,Math.hypot(x,z-180)))*.6);const g=.9+n*.2;c.r*=g;c.g*=g;c.b*=g;},
  keep:[{x:0,z:-260,r:24},{x:-60,z:-200,r:20},{x:120,z:-40,r:32},{x:0,z:180,r:66}],
  flora:[{type:'basalt',count:300,where:(x,z,y)=>afRiverD(x,z)>2.2},{type:'rock',count:200,where:(x,z,y)=>afRiverD(x,z)>2,mat:'basalt',hsl:[.0,.05,.05,.15,.25,.45]},
    {type:'deadTree',count:50,where:(x,z)=>fbm(x*.03,z*.03)>.5&&afRiverD(x,z)>3,color:0x3a3036},{type:'crystal',count:60,where:(x,z)=>afRiverD(x,z)>2&&fbm(x*.04,z*.04+3)>.64,hue:[.02,.06],emissive:0xff5a1a}],
  entries:{ship:{x:8,z:-250,face:0},shelter:{x:-60,z:-190,face:0}},spawn:{x:8,z:-250,face:0},
  build(ctx){const P=ctx.P,st=ctx.state();
    vesperPad(ctx,0,-264,0);ctx.poi('landing',0,-260,'Landing Ridge',{r:20,ft:true});
    /* ---- lava rivers ---- */
    {const lavaMat=new THREE.MeshStandardMaterial({map:TEX.lava.map,emissiveMap:TEX.lava.emis,emissive:0xff6a1a,emissiveIntensity:1.6,normalMap:TEX.lava.normal,roughness:.8});lavaMat.map.wrapS=lavaMat.map.wrapT=THREE.RepeatWrapping;
      for(const R of AF_RIVERS){const pos=[],uv=[],idx=[];let acc=0;const p=R.pts;for(let i=0;i<p.length;i++){const a=p[Math.max(0,i-1)],b=p[Math.min(p.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),nx=-dz/L,nz=dx/L,w=R.w*1.7;if(i)acc+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);
          pos.push(p[i][0]+nx*w,AF_LAVA,p[i][1]+nz*w,p[i][0]-nx*w,AF_LAVA,p[i][1]-nz*w);uv.push(0,acc/12,1,acc/12);if(i){const k=i*2;idx.push(k-2,k-1,k,k-1,k+1,k);}}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,lavaMat);ctx.g.add(m);}
      ctx.anim(dt=>{lavaMat.map.offset.y-=dt*.05;lavaMat.emissiveIntensity=1.4+Math.sin(performance.now()*.002)*.25;if(Math.random()<.5){const R=pick(AF_RIVERS),i=Math.floor(Math.random()*(R.pts.length-1)),t=Math.random(),a=R.pts[i],b=R.pts[i+1];const x=lerp(a[0],b[0],t),z=lerp(a[1],b[1],t);if(Math.hypot(x-player.x,z-player.z)<80)FX.spawn(x+rf(-3,3),AF_LAVA+.3,z+rf(-3,3),rf(-.5,.5),rf(1,3),rf(-.5,.5),{life:rf(.6,1.2),size:rf(.08,.16),c0:0xffd080,c1:0xff3a0a,drag:.5,grav:2});}});
      ctx.hazard({kind:'lava',dps:60,test:(x,z,y)=>y<AF_LAVA+1.2&&afRiverD(x,z)<1.2&&!afBridge(x,z),msg:'Lava!'});}
    // a stone crossing over the western river, and over the eastern one
    for(const [cx,cz,nx,nz] of [[-168,49.2,-.175,.985],[94,36,-.243,.97]])stones(ctx,[-7.5,-5,-2.5,0,2.5,5,7.5].map((t,i)=>[cx+nx*t,cz+nz*t,AF_LAVA+2.3+(i%2)*.25,1.05]),{abs:true,mat:MAT.basalt});
    /* ---- the Choir shelter ---- */
    ctx.safe(-60,-200,22);ctx.poi('shelter',-60,-200,'Choir Shelter',{r:20,ft:true,icon:'town'});
    for(const [x,z,r] of [[-66,-192,.3],[-50,-208,1.4],[-70,-210,2.2]])PF.tent(ctx,x,z,r,MAT.fabric);campfire(ctx,-60,-200);PF.crates(ctx,-48,-196,4,7);PF.shuttle(ctx,-80,groundY(-80,-220)-.6,-220,.6,1.8,0x8a8a9a).rotation.z=.25;debris(ctx,-80,-220,10,12);
    ctx.bench(-46,-202,Math.PI/2);restSpot(ctx,-66,-196,'Rest by the fire');ctx.heal(-54,-194,'Ask the Choir medic for help');ctx.board(-44,-190,Math.PI/2,'ashfall','Choir Requests');ctx.locker(-72,-198,Math.PI/2);
    ctx.npc('tem',-58,-196,Math.PI);ctx.npc('ryn',-66,-206,Math.PI*.3);ctx.npc('oriel2',-52,-204,Math.PI*1.3);
    spawnCrowd(-60,-200,10,4,{role:'THE CHOIR',barks:['We sing for the ones we lost.','The Ark hums louder at dusk.','The Cohort patrols the eastern ridge.','Drink. The ash gets in your throat.']});
    /* ---- graves ---- */
    {const y=groundY(-110,-180);for(let i=0;i<11;i++){const a=i/11*3.14-1.57,x=-110+Math.cos(a)*5,z=-180+Math.sin(a)*5;P.add(ctx.g,MAT.basalt,RB(.5,1.2,.2,.05,1),x,groundY(x,z)+.5,z,0,a,0);}
      const stone=new THREE.Mesh(RB(.8,1.4,.3,.05,1),MAT.runes);stone.position.set(-110,y+.7,-180);ctx.g.add(stone);ctx.anim(()=>{stone.visible=!!st.flags.used_graves;});qUse(ctx,'graves',-108,-180,'Lay the memorial stone');ctx.poi('graves',-110,-180,'Choir Graves',{r:12});}
    /* ---- the Cohort camp ---- */
    ctx.poi('cohort',120,-40,'Gray Cohort Camp',{r:34});
    PF.fence(ctx,84,-80,156,-80);PF.fence(ctx,156,-80,156,0);PF.fence(ctx,84,0,104,0);PF.fence(ctx,136,0,156,0);PF.fence(ctx,84,-80,84,0);
    for(const [x,z,r,c] of [[100,-60,.2,0x4a4a52],[140,-60,1.6,0x5a5a5a],[100,-20,1.4,0x3a3a42]])PF.container(ctx,x,z,r,c,'GRAY COHORT');PF.tower(ctx,90,-74,14);PF.tower(ctx,150,-6,14);PF.crates(ctx,112,-30,6,13);PF.barrels(ctx,140,-40,5,6);
    {const y=groundY(132,-28),g=grp(ctx,132,y,-28,0);P.add(g,MAT.hullDark,RB(4,3,4,.1,1),0,1.5,0);for(let i=-3;i<=3;i++)P.add(g,MAT.metal,cyl(.05,.05,2.6,6),i*.5,1.4,2.05);P.add(g,MAT.redGlow,RB(.3,.3,.05,.02,1),1.6,2.4,2.06);ctx.box(132,-28,2,2,0,y+3);}
    ctx.boss('rusk','rusk',120,-44,23);ctx.enemies('merc',120,-40,26,6,21);ctx.enemies('breacher',120,-40,20,2,22);
    qUse(ctx,'oriel_cell',132,-25.4,'Open the cargo cell',{ok:()=>!!st.killed.rusk});
    for(const [id,x,z] of [['cache1',150,10],['cache2',190,-70],['cache3',90,-110]]){const y=groundY(x,z);P.add(ctx.g,MAT.hullDark,RB(1.4,.8,1,.08,1),x,y+.3,z,0,rr(0,3),0);P.add(ctx.g,MAT.hazard,RB(1.42,.1,1.02,.02,1),x,y+.55,z);ctx.col(x,z,.8);qUse(ctx,id,x+1.2,z,'Raid the supply cache');ctx.enemies('merc',x,z,10,2,21);}
    ctx.chest('af_camp',146,-70,{kind:'locked',lockText:'A Cohort strongbox. A Data Chip or a quartermaster\'s key would open it.'});
    ctx.log('af_rusk',116,-56,'Commander Rusk\'s field orders','“Hold the Choir woman until the Director is inside. If the pilot arrives, do not engage. Vash wants them at the heart.”');
    /* ---- Choir scouts ---- */
    for(const [id,x,z] of [['clog1',-150,-120],['clog2',-170,40],['clog3',160,90]]){debris(ctx,x,z,5,6,[MAT.fabric,MAT.metal]);qUse(ctx,id,x,z,'Recover the scout\'s log');}
    /* ---- the Builders' Ark ---- */
    ctx.poi('ark',0,180,'The Builders\' Ark',{r:60});
    {const y=3,H=16,wallM=MAT.runes;const W2=(x,z,w,d)=>{P.add(ctx.g,wallM,scaleUV(RB(w,H,d,.3,1),w/4,H/4),x,y+H/2,z);ctx.box(x,z,w/2,d/2,0,y+H,y-2);};
      W2(-25,124,38,3);W2(25,124,38,3);W2(-45,182,3,118);W2(45,182,3,118);W2(0,241,93,3);
      for(const s of[-1,1]){P.add(ctx.g,wallM,scaleUV(cyl(2.4,2.8,H+8,8),2,6),s*7,y+(H+8)/2,124);ctx.col(s*7,124,2.6);}
      P.add(ctx.g,wallM,tor(9,1.1,10,48,Math.PI),0,y+H+2,124,0,0,0);glowAt(ctx,null,0,y+H+8,124,0x8fffe0,10,.4);
      const door=new THREE.Group();door.position.set(0,y,124);ctx.g.add(door);for(const s of[-1,1])P.add(door,MAT.hullDark,RB(4.6,12,1.4,.2,1),s*2.3,6,0);P.add(door,MAT.tealGlow,RB(.2,11,1.5,.02,1),0,6,0);
      let doorPlat=null;if(!st.flags.used_ark_gate)doorPlat=ctx.box(0,124,4.6,.8,0,y+12,y-2);else door.position.y=y-11.5;
      qUse(ctx,'ark_gate',0,120.6,'Open the Ark gate with both spire keys',{ok:()=>countItem('spirekey')>0&&countItem('spirekey2')>0,act:()=>{sfx('door');const i=W.plats.indexOf(doorPlat);if(i>=0)W.plats.splice(i,1);let t=0;ctx.anim(dt=>{if(t<1){t+=dt*.4;door.position.y=y-11.5*smooth(0,1,t);}});}});
      for(let i=0;i<8;i++){const a=i/8*6.28;PF.pillar(ctx,Math.cos(a)*24,200+Math.sin(a)*24,rr(6,12),1.1);}
      const heart=grp(ctx,0,y,214,0);P.add(heart,wallM,lathe([[6,0],[5,1],[3.4,4],[1.6,7],[0,8]],4),0,0,0,0,Math.PI/4,0);const eye=new THREE.Mesh(sph(1.2,32,16),new THREE.MeshStandardMaterial({color:0x8fffe0,emissive:0x8fffe0,emissiveIntensity:1.2}));eye.position.set(0,5.4,-2.6);heart.add(eye);
      glowAt(ctx,heart,0,5.4,-2.6,0x8fffe0,8,.5);ctx.anim(()=>{eye.scale.setScalar(1+Math.sin(performance.now()*.002)*.1);});ctx.col(0,214,5);ctx.light(0,y+6,210,0x8fffe0,2,40);
      qBoss(ctx,'m16_ark','keeper','vash',0,196,26,{cond:()=>!!st.flags.used_ark_gate});
      qUse(ctx,'ark_heart',0,208.2,'Approach the Ark\'s heart',{ok:()=>!!st.killed.vash});ctx.glyph('g_af1',-36,236);ctx.chest('af_ark',36,232,{kind:'chest'});
      ctx.log('af_ark',-30,140,'Builder inscription (translated by your suit)','“We leave the door open for those who can hear. We leave the key in their blood. Forgive us for the waiting.”');}
    ctx.enemies('golem',0,100,20,2,23);ctx.enemies('wisp',-40,90,20,3,22);ctx.enemies('wisp',50,80,20,3,22);
    /* ---- the wider ash plains ---- */
    ctx.enemies('golem',-180,-60,26,3,20);ctx.enemies('wisp',-200,-160,30,4,19);ctx.enemies('golem',200,-200,24,2,21);ctx.enemies('wisp',220,100,30,4,23);ctx.enemies('golem',-220,120,24,3,24);ctx.enemies('merc',40,-140,20,3,20);ctx.enemies('wisp',-80,0,30,3,21);
    ctx.nodes('slag',-180,-60,40,6);ctx.nodes('slag',200,-200,40,5);ctx.nodes('slag',-220,120,40,5);ctx.nodes('alloy',40,-140,30,3);ctx.nodes('ore',100,140,40,4);
    ctx.chest('af_west',-230,-60,{});ctx.chest('af_volcano',-210,170,{kind:'locked',y:groundY(-210,160)});ctx.chest('af_east',236,-200,{});ctx.chest('af_north',210,110,{kind:'locked'});
    ctx.glyph('g_af2',-200,-150);ctx.glyph('g_af3',220,-120);ctx.glyph('g_af4',-260,40);
    ctx.log('af_choir',-150,-110,'Choir scout, final entry','“Cohort patrols every hour. The Ark gate needs two keys and a voice. Oriel has the voice. We are trying to find the keys.”');
    ctx.log('af_vash',60,120,'Halcyon dispatch','“Director Vash will personally supervise the Ark recovery. All Cohort assets are to prioritize recovery of the resonant pilot.”');
  }};

// ===== 60_ui.js =====
/* ================= UI: state, toasts, HUD, tracker, minimap ================= */
const UI={dialog:false,panel:false,title:true,loading:false,custom:false,customFirst:false,lookYaw:0,lookSpin:false,tab:'pack'};
const modal=()=>UI.dialog||UI.panel||UI.loading||INTRO.on;
const pad={on:false,active:false,blocked:!!(document.featurePolicy&&document.featurePolicy.allowsFeature&&!document.featurePolicy.allowsFeature('gamepad')),lx:0,ly:0,rx:0,ry:0,prev:[],fire:false,navT:0,navHeld:false,zoom:1};
function setPadActive(v){if(pad.active===v)return;pad.active=v;document.documentElement.classList.toggle('pad',v);updateTouchVis();}
function padButtons(root){const r=typeof root==='string'?$(root):root;return r?[...r.querySelectorAll('button,input[type=color]')].filter(b=>!b.hidden&&!b.disabled&&b.getClientRects().length>0):[];}
function padMark(L,i){L.forEach((b,k)=>b.classList.toggle('psel',k===i));const b=L[i];if(b){try{b.focus({preventScroll:true});}catch(e){}b.scrollIntoView({block:'nearest'});}}
function padFocus(root,i=0){if(!pad.active)return;const L=padButtons(root);if(L.length)padMark(L,clamp(i,0,L.length-1));}
function updateTouchVis(){$('#touch').hidden=!(isTouch&&!pad.active&&!modal()&&!player.dead&&!UI.title);$('#prompt').hidden=true;}
function toast(msg,cls='',dur=4200){const t=document.createElement('div');t.className='toast '+cls;t.innerHTML=msg;const box=$('#toasts');box.appendChild(t);while(box.children.length>5)box.firstChild.remove();setTimeout(()=>{t.style.opacity=0;setTimeout(()=>t.remove(),400);},dur);}
function lootToast(it){const d=itemDef(it);if(!d)return;const r=it.r!==undefined&&(itemKind(it)==='weapon'||itemKind(it)==='gear')?RAR[it.r||0]:null;
  toast(`<img src="${iconURL(it)}" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:6px">${r?`<span class="rc-${r.id}">${esc(itemName(it))}</span> <small>LV ${it.lv}</small>`:esc(d.name)+(it.q>1?' ×'+it.q:'')}`,'loot',3200);}
const floaters=[];
function floatText(text,x,y,z,cls=''){const el=document.createElement('div');el.className='dmg '+cls;el.textContent=text;$('#labels').appendChild(el);floaters.push({el,x,y,z,t:0});if(floaters.length>40){const f=floaters.shift();f.el.remove();}}
function showBanner(k,t){const b=$('#banner');b.innerHTML=`<div class="k">${esc(k)}</div><div class="t">${esc(t)}</div>`;b.classList.remove('show');void b.offsetWidth;b.classList.add('show');}
// HUD preference for first person: helmet (minimal), full, or off
const HUDPREF={fp:'helmet'};try{Object.assign(HUDPREF,JSON.parse(localStorage.getItem('tidelock-hud')||'{}'));}catch(e){}
function setHudPref(k,v){HUDPREF[k]=v;try{localStorage.setItem('tidelock-hud',JSON.stringify(HUDPREF));}catch(e){}applyHudPref();}
function applyHudPref(){const r=document.documentElement;r.classList.toggle('fp',!!cam.fp);r.classList.toggle('hud-helmet',HUDPREF.fp==='helmet');r.classList.toggle('hud-off',HUDPREF.fp==='off');}
const hudChoice=(id)=>`<div class="cb" id="${id}">${[['helmet','HELMET (MINIMAL)'],['full','FULL'],['off','OFF']].map(([v,l])=>`<button class="buy${HUDPREF.fp===v?'':' alt'}" type="button" data-hud="${v}">${l}</button>`).join('')}</div>`;
function bindHudChoice(root,rerender){root.querySelectorAll('[data-hud]').forEach(b=>b.onclick=()=>{setHudPref('fp',b.dataset.hud);sfx('click');rerender();});}
let saveTimer=0;function saveSoon(){saveTimer=Math.max(saveTimer,.01);if(saveTimer>1.5)saveTimer=1.5;}

/* ---------- quest tracker ---------- */
function renderTracker(){const act=Object.keys(G.q).filter(k=>G.q[k].st==='active'&&QUESTS[k]);if(G.track&&!act.includes(G.track))G.track=null;if(!G.track)G.track=nextTrack();
  act.sort((a,b)=>(a===G.track?-1:0)-(b===G.track?-1:0)||(QUESTS[a].type==='main'?-1:1)-(QUESTS[b].type==='main'?-1:1));
  $('#tracker').innerHTML=act.slice(0,3).map(k=>{const d=QUESTS[k],ob=curObjectives(k);return `<button class="trk${k===G.track?' on':''}" type="button" data-q="${k}"><span class="t">${d.type==='main'?'★ ':''}${esc(d.title.toUpperCase())}</span>${ob.map(x=>`<span class="g"${x.done?' style="opacity:.5;text-decoration:line-through"':''}>${esc(objText(x.o,x.p))}</span>`).join('')}</button>`;}).join('')+(act.length>3?`<div class="trk"><span class="g">+${act.length-3} more in the Journal (J)</span></div>`:'');
  $('#tracker').querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{G.track=b.dataset.q;sfx('click');renderTracker();});}

/* ---------- compass and minimap ---------- */
const cmp=$('#compass'),cmpMarks=[];
[['N',0],['NE',Math.PI/4],['E',Math.PI/2],['SE',Math.PI*.75],['S',Math.PI],['SW',-Math.PI*.75],['W',-Math.PI/2],['NW',-Math.PI/4]].forEach(([l,a])=>{const e=document.createElement('div');e.className='c'+(l.length===1?' major':'');e.textContent=l;cmp.appendChild(e);cmpMarks.push({e,a:a+Math.PI});});
const cmpQ=document.createElement('div');cmpQ.className='q';cmp.appendChild(cmpQ);
const mapCv=$('#minimap'),mapCtx=mapCv.getContext('2d');
function sizeMap(){const r=mapCv.getBoundingClientRect();const d=Math.min(devicePixelRatio,2);const w=Math.max(80,Math.round((r.width||132)*d));mapCv.width=mapCv.height=w;}
const v3=new THREE.Vector3();
let lastHud='',lastBuffs='',lastWeap='',curInter=null;
function updateHUD(dt){if(UI.title)return;const Wd=innerWidth,Hd=innerHeight;
  $('#hpBar i').style.width=clamp(G.hp/PS.maxHp*100,0,100)+'%';$('#enBar i').style.width=clamp(G.en/PS.maxEn*100,0,100)+'%';$('#xpBar i').style.width=(G.lvl>=MAX_LVL?100:G.xp/xpNeed(G.lvl)*100)+'%';
  if(cam.fp&&HUDPREF.fp==='helmet'){const f=clamp(G.hp/PS.maxHp,0,1),e=clamp(G.en/PS.maxEn,0,1);$('#hHpArc').style.strokeDashoffset=126*(1-f);$('#hEnArc').style.strokeDashoffset=126*(1-e);$('#hShArc').style.strokeDashoffset=PS.shieldMax>0?148*(1-G.sh/PS.shieldMax):148;
    const hh=Math.ceil(G.hp)+'',he=Math.floor(G.en)+'';if($('#hHp').textContent!==hh)$('#hHp').textContent=hh;if($('#hEn').textContent!==he)$('#hEn').textContent=he;
    const tt=W.def&&W.def.tempAt?W.def.tempAt(player.x,player.z):18,rd=`LV ${G.lvl} · ${Math.round(tt)} °C · ${G.cr} CR`;if($('#hRead').textContent!==rd)$('#hRead').textContent=rd;}
  const sb=$('#shBar');sb.hidden=PS.shieldMax<=0;if(PS.shieldMax>0)sb.querySelector('i').style.width=(G.sh/PS.shieldMax*100)+'%';
  const hs=`${Math.ceil(G.hp)}|${PS.maxHp}|${Math.floor(G.en)}|${G.lvl}|${G.cr}|${G.look.name}|${G.quick}|${countItem(G.quick)}|${PS.cold}|${PS.heat}`;
  if(hs!==lastHud){lastHud=hs;$('#hpNum').textContent=Math.ceil(G.hp)+'/'+PS.maxHp;$('#enNum').textContent=Math.floor(G.en);$('#lvl').textContent='LV '+G.lvl;$('#whoName').textContent=G.look.name||'Surveyor';$('#crVal').textContent=G.cr;
    const q=ITEMS[G.quick];$('#bMed').innerHTML=(q?q.short:'—')+'<br>'+countItem(G.quick);const r=safeRange();$('#suitVal').textContent=`${r[0]}…${r[1]} °C`;}
  const names={heat:'HEAT',cool:'COOL',over:'OVERCHARGE',scan:'SCAN',stim:'STIM',shield:'SHIELD',ration:'FED'};
  const bs=Object.keys(G.buffs).filter(k=>G.buffs[k]>0&&names[k]).map(k=>`<span class="chip ${k}">${names[k]} ${Math.ceil(G.buffs[k])}s</span>`).join('');if(bs!==lastBuffs){lastBuffs=bs;$('#buffs').innerHTML=bs;}
  const temp=W.def&&W.def.tempAt?W.def.tempAt(player.x,player.z):18,te=$('#tempVal');te.textContent=(temp<0?'−':'')+Math.abs(Math.round(temp))+' °C';const sr=safeRange();te.className=temp>sr[1]?'hot':temp<sr[0]?'cold':'';
  // weapon readout
  const w=activeWeapon();const ws=w?`${G.act}|${w.u}|${w.up}`:'none';if(ws!==lastWeap){lastWeap=ws;const o=G.act==='w1'?'w2':'w1',ow=G.equip[o];
    $('#weaponHud').innerHTML=w?`<img src="${iconURL(w)}" alt=""><div><div class="wn rc-${RAR[w.r||0].id}">${esc(itemName(w))}</div><div class="ws">${CLS[WEAPONS[w.id].cls].toUpperCase()} · LV ${w.lv}${ow?' · '+(isTouch?'SWAP':'R')+': '+esc(itemDef(ow).name):''}</div></div>`:'';}
  // compass
  const cw=cmp.clientWidth,half=cw/2,k=half/(Math.PI*.5),fwdA=Math.atan2(-Math.sin(cam.yaw),-Math.cos(cam.yaw));
  for(const c of cmpMarks){const rel=wrapA(c.a-fwdA);c.e.style.left=(half-rel*k)+'px';c.e.style.opacity=Math.abs(rel)>Math.PI*.6?0:1;}
  const tq=G.track?questTarget(G.track):null;
  if(tq){const rel=wrapA(Math.atan2(tq.x-player.x,tq.z-player.z)-fwdA);cmpQ.hidden=false;cmpQ.style.left=(half-clamp(rel,-Math.PI*.55,Math.PI*.55)*k)+'px';cmpQ.textContent=(tq.label?tq.label+' · ':'')+Math.round(Math.hypot(tq.x-player.x,tq.z-player.z))+' m';}else cmpQ.hidden=true;
  // labels over NPCs
  for(const n of W.npcs){const d=Math.hypot(player.x-n.x,player.z-n.z);v3.set(n.x,n.y+(n.D.look&&n.D.look.body==='robot'?2.1:2.25)*(n.D.look&&n.D.look.scale||1),n.z).project(camera);
    if(d>(n.D.crowd?6:32)||v3.z>1){if(n.el.style.display!=='none')n.el.style.display='none';n.bub.style.display='none';continue;}
    n.el.style.display='';const sx=(v3.x*.5+.5)*Wd,sy=(-v3.y*.5+.5)*Hd;n.el.style.transform=`translate(-50%,-100%) translate(${sx}px,${sy}px)`;n.el.style.opacity=d>20?.6:1;
    if(!n.D.crowd){const mk=npcMark(n.id);if(n.mark.textContent!==mk.m){n.mark.textContent=mk.m;n.mark.className='m'+(mk.main?' main':'');}}
    if(!n.bub.hidden){n.bub.style.display='';n.bub.style.transform=`translate(-50%,-100%) translate(${sx}px,${sy-34}px)`;}}
  // enemy health bars
  for(const e of W.enemies){if(e.dead){if(!e.el.hidden)e.el.hidden=true;continue;}const d=Math.hypot(player.x-e.x,player.z-e.z),boss=e.T.ai==='boss';
    const show=d<(boss?40:24)&&(e.hp<e.maxHp||e.state==='chase'||boss&&d<30);if(!show){if(!e.el.hidden)e.el.hidden=true;continue;}
    const hgt=boss?(e.type==='leviathan'?8:e.type==='borer'?5:7):e.T.fly?(e.fly||2)+.9:e.m.human?2.2:1.9*(e.scaleBase||1);v3.set(e.x,e.y+hgt,e.z).project(camera);if(v3.z>1){e.el.hidden=true;continue;}
    e.el.hidden=false;e.el.style.transform=`translate(-50%,-100%) translate(${(v3.x*.5+.5)*Wd}px,${(-v3.y*.5+.5)*Hd}px)`;e.bar.style.width=clamp(e.hp/e.maxHp*100,0,100)+'%';}
  for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.t+=dt;if(f.t>1.1){f.el.remove();floaters.splice(i,1);continue;}v3.set(f.x,f.y+f.t*1.4,f.z).project(camera);if(v3.z>1){f.el.style.opacity=0;continue;}
    f.el.style.opacity=1-Math.max(0,f.t-.6)*2;f.el.style.transform=`translate(-50%,-50%) translate(${(v3.x*.5+.5)*Wd}px,${(-v3.y*.5+.5)*Hd}px)`;}
  // interaction prompt
  curInter=(!modal()&&!player.dead)?findInteract():null;const pr=$('#prompt'),bu=$('#bUse');
  if(curInter){const lab=curInter.label();if(!isTouch||pad.active){bu.hidden=true;pr.hidden=false;const m=/^(Talk to|Read the data log:|Board the|Travel to the|Travel to|[^ ]+)\s*(.*)$/.exec(lab)||[0,lab,''];const verb=m[1].replace(/[:]$/,'').replace(/^Read the data log$/,'Read log').replace(/^Travel to( the)?$/,'Travel').replace(/^Board the$/,'Board').replace(/^Talk to$/,'Talk');const h=`<kbd>${pad.active?'A':'E'}</kbd><span class="pv">${esc(verb.toUpperCase())}</span><span class="pt">${esc(m[2]||'')}</span>`;if(pr.innerHTML!==h)pr.innerHTML=h;}else{pr.hidden=true;bu.hidden=false;const s=(lab.split(' ')[0]||'USE').toUpperCase().slice(0,7);if(bu.textContent!==s)bu.textContent=s;}}
  else{pr.hidden=true;bu.hidden=true;}
  drawMinimap(tq);}
function findInteract(){let best=null,bd=1e9;for(const it of W.inter){if(!it.ok())continue;const p=it.pos();const d=Math.hypot(p.x-player.x,p.z-player.z);if(d>=it.r||d>=bd)continue;if(it.y!==undefined&&Math.abs(player.y-it.y)>2.2)continue;bd=d;best=it;}return best;}
function drawMinimap(tq){const c=mapCtx,Wm=mapCv.width,cx=Wm/2,R=W.interior?45:80,s=Wm/(2*R);if(!W.mapImg)return;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,Wm,Wm);c.save();c.beginPath();c.arc(cx,cx,cx-1,0,Math.PI*2);c.clip();c.fillStyle='#120d1c';c.fillRect(0,0,Wm,Wm);
  const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
  const a=rx*s,cc=rz*s,b=-fx*s,d=-fz*s,e=cx-(a*player.x+cc*player.z),f=cx-(b*player.x+d*player.z);
  c.setTransform(a,b,cc,d,e,f);c.imageSmoothingEnabled=true;c.drawImage(W.mapShot||W.mapImg,-W.half,-W.half,W.size,W.size);c.setTransform(1,0,0,1,0,0);
  const P=(x,z)=>[a*x+cc*z+e,b*x+d*z+f],dpr=Wm/132;const dot=(x,z,col,r)=>{const[p,q]=P(x,z);c.fillStyle=col;c.beginPath();c.arc(p,q,r*dpr,0,Math.PI*2);c.fill();};
  for(const en of W.enemies)if(!en.dead&&Math.hypot(en.x-player.x,en.z-player.z)<R)dot(en.x,en.z,en.T.ai==='boss'?'#ff4a6e':'#ff6a7a',en.T.ai==='boss'?4:2);
  if(buffOn('scan'))for(const p of W.pickups)if(p.active&&Math.hypot(p.x-player.x,p.z-player.z)<R)dot(p.x,p.z,'#c9a8ff',1.8);
  for(const t of W.travel)dot(t.x,t.z,'#ffc35a',3);
  for(const n of W.npcs){if(n.D.crowd){dot(n.x,n.z,'rgba(111,242,214,.45)',1.6);continue;}dot(n.x,n.z,'#6ff2d6',2.6);const mk=npcMark(n.id).m;if(mk){const[p,q]=P(n.x,n.z);c.fillStyle='#ffc35a';c.font=`bold ${11*dpr}px sans-serif`;c.textAlign='center';c.fillText(mk,p,q-4*dpr);}}
  if(tq){let[p,q]=P(tq.x,tq.z);const dx=p-cx,dy=q-cx,dd=Math.hypot(dx,dy),mx=cx-9*dpr;if(dd>mx){p=cx+dx/dd*mx;q=cx+dy/dd*mx;}c.save();c.translate(p,q);c.rotate(Math.PI/4);c.fillStyle='#ffc35a';c.strokeStyle='#1a1329';c.lineWidth=1.5*dpr;c.fillRect(-4*dpr,-4*dpr,8*dpr,8*dpr);c.strokeRect(-4*dpr,-4*dpr,8*dpr,8*dpr);c.restore();}
  const sx=Math.sin(player.face),sz=Math.cos(player.face);let ax=a*sx+cc*sz,ay=b*sx+d*sz;const al=Math.hypot(ax,ay)||1;ax/=al;ay/=al;
  c.save();c.translate(cx,cx);c.rotate(Math.atan2(ay,ax)+Math.PI/2);c.fillStyle='#fff';c.beginPath();c.moveTo(0,-7*dpr);c.lineTo(5*dpr,5*dpr);c.lineTo(0,2.5*dpr);c.lineTo(-5*dpr,5*dpr);c.closePath();c.fill();c.restore();c.restore();}

/* ================= PANELS ================= */
function openPanel(side){if(UI.holo)hideHolo(true);UI.panel=true;$('#panel').hidden=false;$('#panel').classList.toggle('side',!!side);updateTouchVis();if(UI.dialog)closeDialog();}
function closePanel(){if(UI.custom)finishLooks();if(UI.holo)hideHolo(false);UI.panel=false;$('#panel').hidden=true;$('#panel').classList.remove('side');updateTouchVis();lastHud='';lastWeap='';}
const sheet=(cls='')=>{const b=$('#panelBody');b.className='sheet plate '+cls;b.scrollTop=0;return b;};
const head=(title,id='xP',extra='')=>`<h2>${title}<span class="hdr-btns">${extra}<button class="x" type="button" id="${id}">CLOSE · ESC</button></span></h2>`;
const tabsHtml=(list,cur,attr='tab')=>`<div class="tabs">${list.map(([id,l])=>`<button class="tab${cur===id?' on':''}" type="button" data-${attr}="${id}">${l}</button>`).join('')}</div>`;
const fmt=v=>Math.abs(v)>=100?Math.round(v):Math.abs(v)>=10?v.toFixed(0):v.toFixed(1);
function statLines(it){const k=itemKind(it);
  if(k==='weapon'){const S=weaponStats(it);const L=[['DAMAGE',S.dmg*S.pellets],['RATE / S',S.rate],['DPS',S.cls==='beam'?S.dmg:S.dmg*S.pellets*S.rate],['ENERGY',S.energy,true],['RANGE M',S.range],['CRIT %',S.crit*100]];
    if(S.burn)L.push(['BURN %',S.burn*100]);if(S.freeze)L.push(['FREEZE %',S.freeze*100]);if(S.chain)L.push(['CHAIN',S.chain]);if(S.shock)L.push(['SHOCK %',S.shock*100]);if(S.splash)L.push(['BLAST M',S.splash]);return L;}
  if(k==='gear'){const S=gearStats(it),L=[];for(const [key,lab,mul] of [['armor','ARMOR',1],['hp','HEALTH',1],['en','ENERGY',1],['shield','SHIELD',1],['hpRegen','REGEN / S',1],['regen','EN REGEN',1],['cold','COLD PROT',1],['heat','HEAT PROT',1],['speed','SPEED %',100],['jump','JUMP %',100],['climb','CLIMB',1],['scan','SCAN',1]])if(S[key])L.push([lab,S[key]*mul]);return L;}return [];}
function compareTo(it){const s=slotFor(it);if(s==='weapon')return activeWeapon();if(s)return G.equip[s];return null;}
function statTable(it,cmp){const L=statLines(it),C=cmp&&cmp!==it?statLines(cmp):null;return `<div class="st">${L.map(([lab,v,lowGood])=>{let delta='';if(C){const o=(C.find(x=>x[0]===lab)||[0,0])[1],dv=v-o;if(Math.abs(dv)>.05)delta=`<span class="${(dv>0)!==!!lowGood?'up':'dn'}">${dv>0?'+':'−'}${fmt(Math.abs(dv))}</span>`;}return `<span class="k">${lab}</span><b>${fmt(v)}</b>${delta||'<span></span>'}`;}).join('')}</div>`;}
function itemDesc(it){const d=itemDef(it),k=itemKind(it);let s='';
  if(k==='weapon')s=`${CLS[d.cls]} · ${d.desc||''}`;else if(k==='gear')s=`${({helmet:'Helmet',suit:'Suit',boots:'Boots',pack:'Pack'})[d.slot]} · ${d.desc||''}`;else s=d.desc||'';
  if((k==='weapon'||k==='gear')&&it.mods&&it.mods.length)s+=`<br><span class="lab" style="margin-top:6px">MODS</span>${it.mods.map(m=>esc(MODS[m].name)+' · '+MODS[m].desc).join('<br>')}`;
  if((k==='weapon'||k==='gear')&&RAR[it.r||0].slots>(it.mods||[]).length)s+=`<br><small class="dim">${RAR[it.r||0].slots-(it.mods||[]).length} free mod slot(s). Install mods at a workbench.</small>`;return s;}
function kindLabel(it){const k=itemKind(it);return {weapon:'WEAPON',gear:'GEAR',use:'CONSUMABLE',mat:'MATERIAL',mod:'MOD',junk:'VALUABLE',key:'KEY ITEM'}[k]||k.toUpperCase();}
function slotBtn(it,sel,equipped){const k=itemKind(it),r=(k==='weapon'||k==='gear')?RAR[it.r||0].id:'common';return `<button class="slot ${r}${sel?' sel':''}" type="button" data-u="${it.u}" title="${esc(itemName(it))}"><img src="${iconURL(it)}" alt="">${it.q>1?`<span class="q">${it.q}</span>`:''}${it.up?`<span class="u">+${it.up}</span>`:''}${equipped?'<span class="e">ON</span>':''}</button>`;}

/* ---------- main menu: pack, character, journal, map, system ---------- */
let jTab='quests';
/* ---------- the wrist terminal: a hologram projected off the left wrist ---------- */
const HOLO_TABS=[['pack','PACK'],['char','CHARACTER'],['journal','JOURNAL'],['map','MAP'],['system','SYSTEM']];
const _hv=new THREE.Vector3();
function wristScreen(){const Wd=innerWidth,Hd=innerHeight;
  if(cam.fp)return {x:Wd*.24,y:Hd*.8};
  if(avatar&&avatar.B&&avatar.B.WristL){avatar.root.updateMatrixWorld(true);avatar.B.WristL.getWorldPosition(_hv).project(camera);if(_hv.z<1&&Math.abs(_hv.x)<.98&&Math.abs(_hv.y)<.98)return {x:(_hv.x*.5+.5)*Wd,y:(-_hv.y*.5+.5)*Hd};}
  return {x:Wd*.2,y:Hd*.86};}
function openMenu(tab){if(UI.title)return;UI.tab=tab||UI.tab||'pack';if(UI.dialog)closeDialog();
  if(!UI.holo){UI.panel=true;UI.holo=true;const H=$('#holo'),P=$('#holoPanel');H.hidden=false;H.classList.remove('off','on');
    const w=wristScreen(),r=P.getBoundingClientRect();$('#holoEmit').style.left=w.x+'px';$('#holoEmit').style.top=w.y+'px';
    P.style.transformOrigin=`${w.x-r.left}px ${w.y-r.top}px`;$('#holoCone').setAttribute('points',`${w.x-4},${w.y} ${w.x+4},${w.y} ${r.right-30},${r.bottom} ${r.left+30},${r.bottom}`);
    void P.offsetWidth;H.classList.add('on');sfx('scan');updateTouchVis();}
  renderMenu();}
function hideHolo(instant){UI.holo=false;const H=$('#holo');if(instant){H.hidden=true;H.classList.remove('on','off');return;}H.classList.remove('on');H.classList.add('off');sfx('click');
  setTimeout(()=>{if(!UI.holo){H.hidden=true;H.classList.remove('off');}},300);}
// ZL and ZR flip through the categories inside a section (Pack categories, Journal pages)
function subTab(d){const T=[...document.querySelectorAll('#menuBody .tab')];if(!T.length)return;const i=Math.max(0,T.findIndex(t=>t.classList.contains('on')));T[(i+d+T.length)%T.length].click();menuFocusFirst();}
// where the highlight lands on a fresh page: the first item, else the first thing to press, else the page's own tab
function menuFocusFirst(){const L=padButtons('#holoBody'),inBody=b=>b.closest&&b.closest('#menuBody');let i=L.findIndex(b=>b.classList.contains('pk-main'));
  if(i<0)i=L.findIndex(b=>inBody(b)&&!b.classList.contains('tab'));if(i<0)i=L.findIndex(b=>inBody(b)&&b.classList.contains('tab')&&b.classList.contains('on'));
  if(i<0)i=L.findIndex(b=>b.dataset&&b.dataset.tab===UI.tab);padFocus('#holoBody',i<0?1:i);}
function holoTab(d){const i=HOLO_TABS.findIndex(t=>t[0]===UI.tab);UI.tab=HOLO_TABS[(i+d+HOLO_TABS.length)%HOLO_TABS.length][0];sfx('click');renderMenu();}
function renderMenu(){const b=$('#holoBody');b.scrollTop=0;const t=UI.tab;
  b.innerHTML=`<h2><span>VESTA · WRIST TERMINAL <span class="sub">${esc(W.def?W.def.name.toUpperCase():'')} · LV ${G.lvl} · ${G.cr} CR</span></span><button class="x" type="button" id="xM">CLOSE · ${pad.active?'B':'ESC'}</button></h2>`+tabsHtml(HOLO_TABS.map(([id,l])=>[id,l]),t)+`<p class="note" style="margin:-4px 0 0">${pad.active?'L / R: sections'+(t==='pack'||t==='journal'?' · ZL / ZR: '+(t==='pack'?'item categories':'pages'):'')+' · D-pad: move · A: choose · right stick: scroll':isTouch?'Tap a section to switch':'Q and E (or click) switch sections'}</p><div id="menuBody"></div>`;
  b.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>{UI.tab=e.dataset.tab;sfx('click');renderMenu();});$('#xM').onclick=closePanel;
  ({pack:renderPack,char:renderChar,journal:renderJournal,map:renderMap,system:renderSystem})[t]();menuFocusFirst();}
/* ---------- the Pack: what you're wearing, then everything you carry, sorted into plain categories ---------- */
const PACK_CATS=[
  ['weapon','WEAPONS',k=>k==='weapon','Guns and melee weapons. You carry two: EQUIP puts one in a weapon slot. Swap between them with R, Y or the SWAP button.'],
  ['gear','ARMOR',k=>k==='gear','Helmets, suits, boots and packs. Each one adds armor and keeps you safe from heat and cold. EQUIP to wear it.'],
  ['use','SUPPLIES',k=>k==='use','Things you use up: healing, boosts, flares and grenades. USE one now, or set it as your QUICK item to use it any time with Q, ZL or the quick button.'],
  ['mod','MODS',k=>k==='mod','Upgrade chips. Install them into weapons or armor with free mod slots at any workbench.'],
  ['mat','MATERIALS',k=>k==='mat','Crafting materials. Workbenches use them to upgrade your gear and make supplies. Some people ask for them in jobs.'],
  ['junk','VALUABLES',k=>k==='junk','Salvage worth credits. Sell them to any trader. Cantinas pay the most.'],
  ['key','KEY ITEMS',k=>k==='key','Story items. They are used automatically when needed and can\'t be dropped.']];
const SLOT_NAMES={w1:'WEAPON 1',w2:'WEAPON 2',helmet:'HELMET',suit:'SUIT',boots:'BOOTS',pack:'PACK'};
let packCat='weapon',packSel=null,packSlot=null;
function sortInv(){const ord={key:0,weapon:1,gear:2,use:3,mod:4,mat:5,junk:6};G.inv.sort((a,b)=>(ord[itemKind(a)]-ord[itemKind(b)])||((b.r||0)-(a.r||0))||((b.lv||0)-(a.lv||0))||itemDef(a).name.localeCompare(itemDef(b).name));}
function isEquipped(it){return Object.values(G.equip).includes(it);}
function keyStat(it){const k=itemKind(it);if(k==='weapon'){const S=weaponStats(it);return `${CLS[S.cls]} · ${fmt(S.cls==='beam'?S.dmg:S.dmg*S.pellets*S.rate)} damage per second`;}
  if(k==='gear'){const S=gearStats(it),b=[];if(S.armor)b.push(`${fmt(S.armor)} armor`);if(S.cold||S.heat)b.push(`cold ${fmt(S.cold||0)} · heat ${fmt(S.heat||0)}`);if(S.shield)b.push(`${fmt(S.shield)} shield`);if(S.en)b.push(`+${fmt(S.en)} energy`);return b.join(' · ')||itemDef(it).desc||'';}
  if(k==='use')return itemDef(it).desc;if(k==='mat')return 'Used at workbenches for upgrades and crafting';if(k==='junk')return `Sell to traders · about ${Math.round(itemValue(it)*PS.sellMul*2)} cr each`;
  if(k==='mod')return `For ${MODS[it.id].for==='weapon'?'weapons':'armor'} · ${MODS[it.id].desc}`;return itemDef(it).desc||'';}
// how an item compares with what's already in its slot, in one short phrase
function compareBadge(it){const k=itemKind(it);if(isEquipped(it))return '<span class="pk-eq">EQUIPPED</span>';const c=compareTo(it);if(!c)return k==='weapon'||k==='gear'?'<span class="pk-up">▲ NEW SLOT</span>':'';
  let dv;if(k==='weapon'){const a=weaponStats(it),b=weaponStats(c);dv=(a.cls==='beam'?a.dmg:a.dmg*a.pellets*a.rate)-(b.cls==='beam'?b.dmg:b.dmg*b.pellets*b.rate);return Math.abs(dv)<.5?'<span class="pk-eq">≈ SAME DPS</span>':`<span class="${dv>0?'pk-up':'pk-dn'}">${dv>0?'▲':'▼'} ${fmt(Math.abs(dv))} DPS</span>`;}
  const a=gearStats(it),b=gearStats(c);dv=(a.armor||0)-(b.armor||0);const dt=((a.cold||0)+(a.heat||0))-((b.cold||0)+(b.heat||0));
  return `<span class="${dv>=0?'pk-up':'pk-dn'}">${dv>=0?'▲':'▼'} ${fmt(Math.abs(dv))} ARMOR</span>${Math.abs(dt)>=1?` <span class="${dt>0?'pk-up':'pk-dn'}">${dt>0?'▲':'▼'} ${fmt(Math.abs(dt))} TEMP</span>`:''}`;}
function primaryActs(it){const k=itemKind(it);
  if(k==='weapon')return isEquipped(it)?(G.equip[G.act]===it?'<span class="pk-eq">IN HAND</span>':'<button class="buy" type="button" data-act="hand">HOLD</button>'):'<button class="buy" type="button" data-act="w1">EQUIP · SLOT 1</button><button class="buy" type="button" data-act="w2">SLOT 2</button>';
  if(k==='gear')return isEquipped(it)?'<button class="buy alt" type="button" data-act="uneq">TAKE OFF</button>':'<button class="buy" type="button" data-act="eq">EQUIP</button>';
  if(k==='use')return `<button class="buy" type="button" data-act="use">USE</button><button class="buy ${G.quick===it.id?'':'alt'}" type="button" data-act="quick">${G.quick===it.id?'★ QUICK ITEM':'☆ SET AS QUICK'}</button>`;return '';}
function renderPack(){sortInv();const box=$('#menuBody');
  const wearing=['w1','w2','helmet','suit','boots','pack'].map(s=>{const it=G.equip[s];return `<button class="pk-slot${packSlot===s?' on':''}" type="button" data-slot="${s}">${it?`<img src="${iconURL(it)}" alt="">`:'<span class="pk-empty">+</span>'}<span class="d"><small>${SLOT_NAMES[s]}${s===G.act&&it?' · IN HAND':''}</small><b class="${it?'rc-'+RAR[it.r||0].id:'dim'}">${it?esc(itemName(it)):'Empty: choose one'}</b><small>${it?esc(keyStat(it)):''}</small></span></button>`;}).join('');
  const q=ITEMS[G.quick];
  let list,title,help;
  if(packSlot){const want=packSlot.startsWith('w')?'weapon':packSlot;list=G.inv.filter(it=>want==='weapon'?itemKind(it)==='weapon':itemKind(it)==='gear'&&GEAR[it.id].slot===want);const cur=G.equip[packSlot];if(cur)list.unshift(cur);
    title=`Choose ${packSlot.startsWith('w')?'a weapon for '+SLOT_NAMES[packSlot].toLowerCase():'your '+SLOT_NAMES[packSlot].toLowerCase()}`;help='Pick an item to wear it here. Green arrows mean it\'s better than what you have on.';}
  else{const C=PACK_CATS.find(c=>c[0]===packCat)||PACK_CATS[0];list=G.inv.filter(it=>C[2](itemKind(it)));title=C[1];help=C[3];}
  const cats=PACK_CATS.map(([id,l,f])=>{const n=G.inv.filter(it=>f(itemKind(it))).reduce((a,it)=>a+(it.q||1),0);return `<button class="tab${!packSlot&&packCat===id?' on':''}" type="button" data-cat="${id}">${l} <span class="cnt">${n}</span></button>`;}).join('');
  const rows=list.map(it=>{const k=itemKind(it),r=RAR[it.r||0],eqd=isEquipped(it),open=packSel===it.u;
    return `<div class="pk-row${open?' open':''}${eqd?' eqd':''}"><button class="pk-main" type="button" data-u="${it.u}"><img src="${iconURL(it)}" alt=""><span class="d"><b class="${k==='weapon'||k==='gear'?'rc-'+r.id:''}">${esc(itemName(it))}${it.q>1?` <span class="cnt">×${it.q}</span>`:''}</b><small>${k==='weapon'||k==='gear'?`${r.name} · level ${it.lv} · `:''}${esc(keyStat(it))}</small></span><span class="pk-cmp">${compareBadge(it)}</span></button><span class="pk-acts">${primaryActs(it)}</span>
      ${open?`<div class="pk-det">${(k==='weapon'||k==='gear')?statTable(it,eqd?null:compareTo(it)):''}<p class="note">${itemDesc(it)}</p><div class="cb"><small class="dim">Worth ${itemValue(it)} cr</small>${!eqd&&k!=='key'?`<button class="buy danger" type="button" data-act="drop" data-u2="${it.u}">DISCARD</button>`:''}</div></div>`:''}</div>`;}).join('');
  box.innerHTML=`<div class="pk"><div class="pk-left"><h3>Wearing</h3><div class="pk-slots">${wearing}</div>
      <button class="pk-quick" type="button" id="pkQuick"><small>QUICK ITEM · ${isTouch?'quick button':pad.active?'ZL':'Q'}</small><b>${q?`${esc(q.name)} ×${countItem(G.quick)}`:'None set'}</b><small>Change it in Supplies</small></button>
      <div class="stats"><div class="stat"><span>ARMOR</span><b>${PS.armor}</b></div><div class="stat"><span>SAFE TEMP</span><b>${safeRange()[0]}…${safeRange()[1]}°</b></div><div class="stat"><span>CREDITS</span><b>${G.cr}</b></div></div></div>
    <div class="pk-right"><div class="tabs">${cats}</div><h3>${title} ${packSlot?'<button class="buy alt" type="button" id="pkBack">BACK TO ALL ITEMS</button>':''}</h3><p class="note">${help}</p><div class="pk-list">${rows||'<p class="note">Nothing here yet.</p>'}</div></div></div>`;
  box.querySelectorAll('[data-slot]').forEach(e=>e.onclick=()=>{packSlot=packSlot===e.dataset.slot?null:e.dataset.slot;packSel=null;sfx('click');renderPack();});
  box.querySelectorAll('[data-cat]').forEach(e=>e.onclick=()=>{packCat=e.dataset.cat;packSlot=null;packSel=null;sfx('click');renderPack();});
  const back=$('#pkBack');if(back)back.onclick=()=>{packSlot=null;renderPack();};$('#pkQuick').onclick=()=>{packCat='use';packSlot=null;renderPack();};
  box.querySelectorAll('[data-u]').forEach(e=>e.onclick=()=>{const u=+e.dataset.u;packSel=packSel===u?null:u;sfx('click');renderPack();});
  box.querySelectorAll('.pk-row').forEach(row=>{const u=+row.querySelector('[data-u]').dataset.u;const it=[...G.inv,...Object.values(G.equip).filter(Boolean)].find(x=>x.u===u);
    row.querySelectorAll('[data-act]').forEach(e=>e.onclick=ev=>{ev.stopPropagation();const a=e.dataset.act;sfx('click');
      if(a==='w1'||a==='w2'){equipItem(it.u,packSlot&&packSlot.startsWith('w')?packSlot:a);toast(`${esc(itemName(it))} equipped.`,'teal',2200);}
      else if(a==='eq'){equipItem(it.u);toast(`Now wearing ${esc(itemName(it))}.`,'teal',2200);}else if(a==='uneq'){const s=Object.keys(G.equip).find(s=>G.equip[s]===it);unequip(s);}
      else if(a==='hand'){G.act=Object.keys(G.equip).find(s=>G.equip[s]===it);refreshAvatarGear();}
      else if(a==='use'){useItem(it.id);if(!countItem(it.id))packSel=null;}else if(a==='quick'){G.quick=it.id;lastHud='';toast(`${esc(itemDef(it).name)} is your quick item.`,'teal',2200);}
      else if(a==='drop'){if(!e.dataset.ok){e.dataset.ok=1;e.textContent='TAP AGAIN TO DISCARD';return;}removeInst(it.u);packSel=null;Bus.emit('item',it.id,countItem(it.id));}
      if(packSlot&&(a==='w1'||a==='w2'||a==='eq'))packSlot=null;saveSoon();renderPack();});});}
function renderChar(){const box=$('#menuBody');const tp=Math.floor(G.playTime/60);
  box.innerHTML=`<div class="stats"><div class="stat"><span>LEVEL</span><b>${G.lvl}${G.lvl<MAX_LVL?` <small class="dim">${G.xp}/${xpNeed(G.lvl)} XP</small>`:' (MAX)'}</b></div><div class="stat"><span>PERK POINTS</span><b>${G.perkPts}</b></div><div class="stat"><span>WEAPON DAMAGE</span><b>×${PS.dmgMul.toFixed(2)}</b></div><div class="stat"><span>CRIT BONUS</span><b>+${Math.round(PS.crit*100)}%</b></div>
    <div class="stat"><span>SPEED</span><b>${Math.round(PS.speed*100)}%</b></div><div class="stat"><span>JUMP</span><b>${Math.round(PS.jump*100)}%</b></div><div class="stat"><span>COLD / HEAT</span><b>${PS.cold} / ${PS.heat}</b></div><div class="stat"><span>REGEN</span><b>${PS.hpRegen.toFixed(1)} HP/s</b></div>
    <div class="stat"><span>PLAY TIME</span><b>${Math.floor(tp/60)}h ${tp%60}m</b></div><div class="stat"><span>DEFEATED</span><b>${G.stats.kills} · ${G.stats.bosses} bosses</b></div><div class="stat"><span>TASKS DONE</span><b>${Object.values(G.q).filter(q=>q.st==='done').length} / ${Object.keys(QUESTS).length}</b></div><div class="stat"><span>GLYPHS</span><b>${G.glyphs.length} / 24</b></div></div>
    <h3>Perks</h3><p class="note">You earn a perk point every level, from some tasks, and from every six Builder glyphs.</p><div class="cards">${Object.entries(PERKS).map(([k,p])=>{const r=perk(k);return `<div class="perk"><div class="cd"><b>${p.name} <span class="pips">${'●'.repeat(r)}${'○'.repeat(p.max-r)}</span></b><small>${p.desc}</small></div><button class="buy" type="button" data-p="${k}"${G.perkPts<1||r>=p.max?' disabled':''}>${r>=p.max?'MAXED':'LEARN'}</button></div>`;}).join('')}</div>`;
  box.querySelectorAll('[data-p]').forEach(e=>e.onclick=()=>{const k=e.dataset.p;if(G.perkPts<1||perk(k)>=PERKS[k].max)return;G.perkPts--;G.perks[k]=perk(k)+1;computeStats();sfx('level');saveSoon();renderChar();padFocus('#menuBody');});}
function renderJournal(){const box=$('#menuBody');const act=Object.keys(G.q).filter(k=>G.q[k].st==='active'&&QUESTS[k]),done=Object.keys(G.q).filter(k=>G.q[k].st==='done'&&QUESTS[k]);
  const qhtml=k=>{const d=QUESTS[k],s=G.q[k];const ob=s.st==='active'?curObjectives(k):[];return `<div class="qe${d.type==='main'?' main':''}${s.st==='done'?' done':''}"><span class="s">${d.type==='main'?'MAIN STORY · ACT '+(d.act||1):'SIDE JOB'} · ${(ZONES[d.zone]||{}).name||''}</span><span class="t">${esc(d.title)}</span><p>${esc(d.summary||'')}</p>${ob.map(x=>`<p style="color:${x.done?'var(--dim)':'var(--text)'}">${x.done?'✓':'▸'} ${esc(objText(x.o,x.p))}</p>`).join('')}${s.st==='active'?`<div class="cb"><button class="buy alt" type="button" data-t="${k}"${G.track===k?' disabled':''}>${G.track===k?'TRACKING':'TRACK'}</button></div>`:''}</div>`;};
  let inner='';
  if(jTab==='quests')inner=(act.length?act.sort((a,b)=>(QUESTS[a].type==='main'?-1:1)-(QUESTS[b].type==='main'?-1:1)).map(qhtml).join(''):'<p class="note">No active tasks. Look for people with an amber “!”.</p>')+(done.length?`<h3>Completed <span class="cnt">${done.length}</span></h3>`+done.slice(-30).reverse().map(qhtml).join(''):'');
  if(jTab==='logs')inner=G.logs.length?G.logs.map(id=>LOGS[id]?`<div class="qe"><span class="s">${esc((ZONES[LOGS[id].zone]||{}).name||'')}</span><span class="t">${esc(LOGS[id].title)}</span><p>${LOGS[id].text}</p></div>`:'').join(''):'<p class="note">Data logs you find out in the world are kept here.</p>';
  if(jTab==='mem')inner=G.mem.length?G.mem.map(id=>`<div class="qe main"><span class="t">${esc(MEMS[id].title)}</span><p>${MEMS[id].text}</p></div>`).join(''):'<p class="note">Your memories will come back here as you remember them.</p>';
  box.innerHTML=tabsHtml([['quests','TASKS'],['logs',`DATA LOGS (${G.logs.length})`],['mem',`MEMORIES (${G.mem.length}/6)`]],jTab,'j')+inner;
  box.querySelectorAll('[data-j]').forEach(e=>e.onclick=()=>{jTab=e.dataset.j;sfx('click');renderJournal();});box.querySelectorAll('[data-t]').forEach(e=>e.onclick=()=>{G.track=e.dataset.t;renderTracker();renderJournal();});}
function renderSystem(){const box=$('#menuBody');
  box.innerHTML=`<div class="cards"><div class="slotrow cur"><span class="lab">PLAYING · SLOT ${saveSlot+1}</span><b>${esc(G.look.name||'Surveyor')}, LV ${G.lvl}</b><small>Progress saves automatically every few seconds and whenever something important happens.</small>
    <div class="cb"><button class="buy" type="button" id="sSave">SAVE NOW</button><button class="buy alt" type="button" id="sQuit">SAVE AND QUIT TO TITLE</button></div></div></div>
    <h3>Save code</h3><p class="note">A save code is your whole expedition as text. Copy it somewhere safe (like Notes) to keep a backup or move it to another device.</p>
    <div class="cb"><button class="buy" type="button" id="sCopy">COPY SAVE CODE</button><button class="buy alt" type="button" id="sLoad">LOAD A CODE…</button></div>
    <textarea id="codeOut" class="codein" rows="3" readonly hidden></textarea><textarea id="codeIn" class="codein" rows="3" placeholder="Paste a TIDELOCK-… code here" spellcheck="false" autocomplete="off" hidden></textarea><div id="codeMsg" class="note"></div>
    <h3>First-person HUD</h3><p class="note">How much of the HUD shows when you zoom all the way in.</p>${hudChoice('sHud')}
    <h3>Audio</h3><div class="cb"><button class="buy alt" type="button" id="sSnd">${muted?'SOUND: OFF':'SOUND: ON'}</button><button class="buy alt" type="button" id="sMus">${musicOn?'MUSIC: ON':'MUSIC: OFF'}</button><button class="buy alt" type="button" id="sGlow">${POST.on?'GLOW: ON':'GLOW: OFF'}</button><button class="buy alt" type="button" id="sDrs">${DRS.on?'RES: AUTO':'RES: FULL'}</button></div>
    <h3>Controls</h3><div class="cb"><button class="buy alt" type="button" id="sHelp">HOW TO PLAY</button></div>
    <h3>Credits</h3><p class="note">Design, code, textures and most models: generated for this game. Character models: Mixamo characters from the three.js examples (X Bot, Soldier, Michelle). Robot: “RobotExpressive” by Tomás Laulhé (Quaternius), CC0. Ship corridor: “Space ship hallway” by yeeyeeman, CC-BY 4.0. Engine: three.js (MIT).</p>`;
  const msg=h=>{$('#codeMsg').innerHTML=h;};
  $('#sSave').onclick=()=>{saveNow();msg('<span class="ok">Saved.</span>');};$('#sQuit').onclick=quitToTitle;$('#sHelp').onclick=openHelp;
  bindHudChoice(box,renderSystem);$('#sSnd').onclick=()=>{setMuted(!muted);renderSystem();};$('#sMus').onclick=()=>{setMusic(!musicOn);renderSystem();};$('#sGlow').onclick=()=>{setBloom(!POST.on);renderSystem();};$('#sDrs').onclick=()=>{setDrs(!DRS.on);renderSystem();};
  $('#sCopy').onclick=()=>{saveNow();const code=makeCode(G),out=$('#codeOut');out.hidden=false;out.value=code;const sel=()=>{try{out.focus();out.select();out.setSelectionRange(0,code.length);}catch(e){}};
    try{navigator.clipboard.writeText(code).then(()=>msg('<span class="ok">Copied. Paste it somewhere safe.</span>'),()=>{sel();msg('Copying was blocked here. The code is selected below; copy it yourself.');});}catch(e){sel();msg('Copying was blocked here. The code is selected below; copy it yourself.');}};
  $('#sLoad').onclick=()=>{const ci=$('#codeIn');if(ci.hidden){ci.hidden=false;ci.focus();$('#sLoad').textContent='LOAD THIS CODE';return;}const r=readCode(ci.value);if(r.err)return msg('<span class="bad">'+r.err+'</span>');
    msg(`<b>Replace Slot ${saveSlot+1} with this save (${esc((r.d.look&&r.d.look.name)||'Surveyor')}, LV ${r.d.lvl||1})?</b><div class="cb"><button class="buy danger" type="button" id="cYes">YES, LOAD IT</button><button class="buy alt" type="button" id="cNo">CANCEL</button></div>`);
    $('#cYes').onclick=()=>{closePanel();loadGame(r.d);toast('Save code loaded','gold');};$('#cNo').onclick=()=>msg('');};}

/* ---------- workbench: upgrade, mods, craft, recycle ---------- */
const UP_MATS=[[['scrap',4]],[['scrap',4],['alloy',2]],[['alloy',4],['wiring',3]],[['alloy',5],['powercell',2],['shard',4]],[['alloy',6],['powercell',3],['glass',2]]];
const upCost=it=>({cr:Math.round((30+it.lv*14)*(it.up+1)*(1+(it.r||0)*.25)*PS.upMul),mats:UP_MATS[it.up].map(([id,n])=>[id,Math.max(1,Math.round(n*(1+(it.lv>15?.5:0))*PS.upMul))])});
const RECIPES=[['medkit',1,[['glowcap',2],['chitin',1]]],['trauma',1,[['glowcap',3],['resin',1],['pearl',1]]],['stim',1,[['glowcap',2],['shard',1]]],['ration',2,[['glowcap',1]]],['heatpack',1,[['scrap',2],['shard',1]]],['coolant',1,[['frostchitin',1],['wiring',1]]],
  ['cell',1,[['powercell',1],['shard',2]]],['shieldcharge',1,[['powercell',1],['alloy',1],['shard',1]]],['grenade',1,[['scrap',3],['powercell',1]]],['flare',2,[['scrap',1],['glowcap',1]]],['beacon',1,[['wiring',2],['shard',2]]],['alloy',1,[['scrap',5]]],
  ['coil',1,[['powercell',2],['alloy',3],['shard',3]]],['capacitor',1,[['wiring',3],['powercell',1],['shard',2]]],['stabilizer',1,[['alloy',3],['polymer',2]]],['rapid',1,[['wiring',3],['alloy',2],['powercell',1]]],['scope',1,[['shard',4],['datachip',1]]],
  ['insul',1,[['frostchitin',4],['polymer',2]]],['heatsink',1,[['alloy',3],['slag',2]]],['plating',1,[['alloy',4],['chitin',3]]],['cryo',1,[['frostchitin',4],['powercell',2],['shard',2]]],['thermite',1,[['slag',4],['powercell',1]]],['arcrelay',1,[['wiring',4],['pearl',2],['powercell',1]]],['mender',1,[['resin',4],['glowcap',4],['pearl',2]]]];
const hasMats=m=>m.every(([id,n])=>countItem(id)>=n),takeMats=m=>m.forEach(([id,n])=>removeItem(id,n));
const needHtml=m=>m.map(([id,n])=>`<span class="need${countItem(id)<n?' short':''}"><img src="${iconURL(id)}" alt="">${countItem(id)}/${n} ${esc(itemDef(id).name)}</span>`).join('');
let wbTab='up',wbSel=null;
function openWorkbench(tab){if(tab)wbTab=tab;openPanel();renderWorkbench();}
function renderWorkbench(){const b=sheet();const eqs=[...['w1','w2','helmet','suit','boots','pack'].map(s=>G.equip[s]).filter(Boolean),...G.inv.filter(it=>{const k=itemKind(it);return k==='weapon'||k==='gear';})];
  let inner='';const sel=eqs.find(x=>x.u===wbSel)||eqs[0];
  if(wbTab==='up'||wbTab==='mods')inner=`<div class="inv"><div class="grid">${eqs.map(it=>slotBtn(it,sel&&it.u===sel.u,isEquipped(it))).join('')}</div><div class="detail" id="wbd"></div></div>`;
  if(wbTab==='craft')inner=`<div class="cards">${RECIPES.filter(([id])=>itemDef(id)).map(([id,n,m],i)=>`<div class="card"><img class="ico" src="${iconURL(id)}" alt=""><div class="cd"><b>${esc(itemDef(id).name)}${n>1?' ×'+n:''} <span class="cnt">have ${countItem(id)}</span></b><small>${esc(itemDef(id).desc||MODS[id]&&MODS[id].desc||'')}</small><div class="chips">${needHtml(m)}</div></div><button class="buy" type="button" data-c="${i}"${hasMats(m)?'':' disabled'}>MAKE</button></div>`).join('')}</div>`;
  if(wbTab==='rec'){const L=G.inv.filter(it=>{const k=itemKind(it);return k==='weapon'||k==='gear';});inner=`<p class="note">Break down equipment you don't need into materials. Higher rarity and upgrades return more.</p><div class="cards">${L.map(it=>{const y=recycleYield(it);return `<div class="card"><img class="ico" src="${iconURL(it)}" alt=""><div class="cd"><b class="rc-${RAR[it.r||0].id}">${esc(itemName(it))} <small class="dim">LV ${it.lv}</small></b><div class="chips">${y.map(([id,n])=>`<span class="need"><img src="${iconURL(id)}" alt="">+${n} ${esc(itemDef(id).name)}</span>`).join('')}</div></div><button class="buy alt" type="button" data-r="${it.u}">RECYCLE</button></div>`;}).join('')||'<p class="note">No spare equipment in your pack.</p>'}</div>`;}
  b.innerHTML=head('Workbench','xW')+'<p class="note">Upgrade any weapon or suit piece up to +5, install mods into free slots, craft supplies and mods, or recycle spare gear.</p>'+tabsHtml([['up','UPGRADE'],['mods','MODS'],['craft','CRAFT'],['rec','RECYCLE']],wbTab)+inner;
  b.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>{wbTab=e.dataset.tab;sfx('click');renderWorkbench();});$('#xW').onclick=closePanel;
  b.querySelectorAll('[data-u]').forEach(e=>e.onclick=()=>{wbSel=+e.dataset.u;sfx('click');renderWorkbench();padFocus('#wbd');});
  b.querySelectorAll('[data-c]').forEach(e=>e.onclick=()=>{const [id,n,m]=RECIPES[+e.dataset.c];if(!hasMats(m))return;takeMats(m);give(id,n);sfx('craft');FX.craft&&FX.craft(new THREE.Vector3(player.x,player.y+1.2,player.z));saveSoon();renderWorkbench();});
  b.querySelectorAll('[data-r]').forEach(e=>e.onclick=()=>{if(!e.dataset.ok){e.dataset.ok=1;e.textContent='CONFIRM';return;}const it=removeInst(+e.dataset.r);if(it){for(const [id,n] of recycleYield(it))give(id,n);(it.mods||[]).forEach(m=>give(m));sfx('craft');saveSoon();}renderWorkbench();});
  if(sel&&$('#wbd')){const box=$('#wbd');const k=itemKind(sel),r=RAR[sel.r||0];
    if(wbTab==='up'){if(sel.up>=5)box.innerHTML=`<div class="nm rc-${r.id}">${esc(itemName(sel))}</div>${statTable(sel)}<p class="note">Fully upgraded.</p>`;
      else{const c=upCost(sel),nx=Object.assign({},sel,{up:sel.up+1}),ok=hasMats(c.mats)&&G.cr>=c.cr;box.innerHTML=`<div class="ty">UPGRADE +${sel.up} → +${sel.up+1}</div><div class="nm rc-${r.id}">${esc(itemName(sel))}</div>${statTable(nx,sel)}<div class="chips">${needHtml(c.mats)}<span class="need${G.cr<c.cr?' short':''}">${G.cr}/${c.cr} cr</span></div><div class="cb"><button class="buy" type="button" id="doUp"${ok?'':' disabled'}>UPGRADE</button></div>`;
        $('#doUp').onclick=()=>{if(!(hasMats(c.mats)&&G.cr>=c.cr))return;takeMats(c.mats);G.cr-=c.cr;sel.up++;computeStats();refreshAvatarGear();sfx('craft');FX.craft&&FX.craft(new THREE.Vector3(player.x,player.y+1.2,player.z));toast(`${esc(itemName(sel))} upgraded.`,'gold');saveSoon();renderWorkbench();padFocus('#wbd');};}}
    else{const slots=r.slots,mods=sel.mods||[],avail=G.inv.filter(it=>itemKind(it)==='mod'&&MODS[it.id].for===(k==='weapon'?'weapon':'gear')&&!mods.includes(it.id));
      box.innerHTML=`<div class="ty">${r.name.toUpperCase()} · ${slots} MOD SLOT${slots===1?'':'S'}</div><div class="nm rc-${r.id}">${esc(itemName(sel))}</div>${slots?'':'<p class="note">Common gear has no mod slots. Uncommon and rare items have one, epic and legendary have two.</p>'}
        ${mods.map((m,i)=>`<div class="row"><div class="d"><b>${esc(MODS[m].name)}</b><small>${MODS[m].desc}</small></div><button class="buy alt" type="button" data-rm="${i}">REMOVE</button></div>`).join('')}
        ${mods.length<slots?(avail.length?avail.map(it=>`<div class="row"><div class="d"><b>${esc(MODS[it.id].name)} <span class="cnt">×${it.q||1}</span></b><small>${MODS[it.id].desc}</small></div><button class="buy" type="button" data-in="${it.id}">INSTALL</button></div>`).join(''):`<p class="note">You have no ${k==='weapon'?'weapon':'gear'} mods. Craft them here, buy them, or find them in caches.</p>`):''}`;
      box.querySelectorAll('[data-in]').forEach(e=>e.onclick=()=>{sel.mods=sel.mods||[];if(sel.mods.length>=slots)return;removeItem(e.dataset.in,1);sel.mods.push(e.dataset.in);computeStats();sfx('craft');saveSoon();renderWorkbench();});
      box.querySelectorAll('[data-rm]').forEach(e=>e.onclick=()=>{const m=sel.mods.splice(+e.dataset.rm,1)[0];give(m);computeStats();sfx('click');saveSoon();renderWorkbench();});}}
  padFocus(b,4);}
function recycleYield(it){const d=itemDef(it),t=d.tier||1,m=1+(it.r||0)*.5+(it.up||0)*.3;const out=[['scrap',Math.round((2+t)*m)]];if(t>=2)out.push(['alloy',Math.round(t*m*.6)]);if(t>=3||it.r>=2)out.push(['wiring',Math.round((1+t*.4)*m)]);if(t>=4||it.r>=3)out.push(['powercell',Math.max(1,Math.round(m*.7))]);if(it.r>=4||t>=5)out.push(['glass',1]);return out;}

/* ---------- shops ---------- */
const SHOP_TAGS={med:['medkit','medkit','trauma','stim'],food:['ration','ration'],util:['flare','beacon','grenade','cell','shieldcharge'],mat1:['scrap','wiring','chitin','polymer'],mat3:['alloy','powercell','resin','pearl','datachip'],chip:['datachip'],cold:['heatpack','insul'],heat:['coolant','heatsink']};
function shopStock(id){const D=NPCS[id].vendor,V=G.vendors[id];if(V&&G.playTime-V.t<1200)return V.items;
  const items=[],lvl=Math.max(G.lvl,(ZONES[NPCS[id].zone]||{lvl:[1]}).lvl[0]);const seen=new Set();
  for(const t of D.tags){for(const iid of SHOP_TAGS[t]||[]){if(seen.has(iid)||!itemDef(iid))continue;seen.add(iid);const k=itemKind(iid);items.push(makeItem(iid,{q:iid==='datachip'?3:k==='mod'?1:k==='mat'?10:5}));}}
  const [a,b]=D.gear||[1,2],gl=()=>clamp(lvl+Math.floor(rf(-1,3)),(a-1)*5+1,b*5+2);
  if(D.tags.includes('weapon'))for(let i=0;i<4;i++){const it=rollEquipment(gl(),.6,'weapon');if(it)items.push(it);}
  if(D.tags.includes('gear')||D.tags.includes('heat')||D.tags.includes('cold'))for(let i=0;i<4;i++){const it=rollEquipment(gl(),.6,'gear');if(it)items.push(it);}
  if(D.gear&&!D.tags.includes('weapon')&&!D.tags.includes('gear'))for(let i=0;i<2;i++){const it=rollEquipment(gl(),.4);if(it)items.push(it);}
  if(D.tags.includes('mod'))for(let i=0;i<3;i++){const ids=Object.keys(MODS);items.push(makeItem(pick(ids),{q:1}));}
  G.vendors[id]={t:G.playTime,items};return items;}
const buyPrice=it=>Math.max(1,Math.round(itemValue(it)*(itemKind(it)==='weapon'||itemKind(it)==='gear'?1.25:1.6)*PS.buyMul));
const sellPrice=(it,id)=>Math.max(1,Math.round(itemValue(it)*PS.sellMul*(itemKind(it)==='junk'?(NPCS[id].vendor.tags.includes('junkbuy')?2.6:2):1)));
let shopId=null,shopTab='buy',shopSel=null;
function openShop(id){shopId=id;shopTab='buy';shopSel=null;openPanel();renderShop();}
function renderShop(){const b=sheet(),D=NPCS[shopId];const stock=shopStock(shopId);const list=shopTab==='buy'?stock:G.inv.filter(it=>itemKind(it)!=='key');
  const sel=list.find(x=>x.u===shopSel)||null;
  b.innerHTML=head(esc(D.name)+' <span class="cnt">'+esc(D.role)+'</span>','xS')+`<p class="note">You have <b>${G.cr}</b> cr.${shopTab==='buy'?' Stock changes every 20 minutes of play.':' Valuables sell for more, especially to cantinas.'}</p>`+tabsHtml([['buy','BUY'],['sell','SELL']],shopTab)+
    `<div class="inv"><div class="grid">${list.map(it=>slotBtn(it,it.u===shopSel)).join('')||'<p class="note">Nothing to show.</p>'}</div><div class="detail" id="det">${sel?shopDetail(sel):'<p class="note">Select an item.</p>'}</div></div>`;
  b.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>{shopTab=e.dataset.tab;shopSel=null;sfx('click');renderShop();});$('#xS').onclick=closePanel;
  b.querySelectorAll('[data-u]').forEach(e=>e.onclick=()=>{shopSel=+e.dataset.u;sfx('click');renderShop();padFocus('#det');});
  const bt=$('#det').querySelector('[data-buy]');if(bt)bt.onclick=()=>{const n=+bt.dataset.buy,price=buyPrice(sel)*n;if(G.cr<price){sfx('deny');return;}G.cr-=price;
    if(sel.q!==undefined&&itemKind(sel)!=='weapon'&&itemKind(sel)!=='gear'){give(sel.id,n);sel.q-=n;if(sel.q<=0)stock.splice(stock.indexOf(sel),1),shopSel=null;}else{stock.splice(stock.indexOf(sel),1);addItem(sel);shopSel=null;}sfx('loot');saveSoon();renderShop();};
  $('#det').querySelectorAll('[data-sell]').forEach(sb=>sb.onclick=()=>{const n=Math.min(+sb.dataset.sell,sel.q||1);G.cr+=sellPrice(sel,shopId)*n;if(sel.q!==undefined&&sel.q>n)sel.q-=n;else{removeInst(sel.u);shopSel=null;}Bus.emit('item',sel.id,countItem(sel.id));sfx('loot');saveSoon();renderShop();});
  padFocus(b,2);}
function shopDetail(it){const k=itemKind(it),r=RAR[it.r||0],eq=k==='weapon'||k==='gear';
  const base=`<div class="ty">${kindLabel(it)}${eq?` · <span class="rc-${r.id}">${r.name.toUpperCase()}</span> · LV ${it.lv}`:''}</div><div class="nm ${eq?'rc-'+r.id:''}">${esc(itemName(it))}</div>${eq?statTable(it,compareTo(it)):''}<p class="note" style="margin:0">${itemDesc(it)}</p>`;
  if(shopTab==='buy'){const p=buyPrice(it);return base+`<div class="cb"><button class="buy" type="button" data-buy="1"${G.cr<p?' disabled':''}>BUY · ${p} cr</button></div>${!eq&&it.q>1?`<small class="dim">${it.q} in stock · you have ${countItem(it.id)}</small>`:''}`;}
  const p=sellPrice(it,shopId);return base+`<div class="cb"><button class="buy" type="button" data-sell="1">SELL · ${p} cr</button>${it.q>1?`<button class="buy alt" type="button" data-sell="${it.q}">SELL ALL ${it.q} · ${p*it.q} cr</button>`:''}</div>`;}

/* ---------- the Vesper's star map ---------- */
const DESTS=[['twilight','Meridian Station','Ossery b · Twilight Band',()=>true],['dayward','Kiln Hollow','Ossery b · Dayward Flats',()=>G.visited.dayward],['nightward','Cold Harbor','Ossery b · Nightward Expanse',()=>G.visited.nightward],
  ['anchorage','Anchorage Station','Orbit of Ossery b',()=>!!G.flags.vesperFixed],['calder','Reedwater','Calder · Lagoon moon',()=>!!G.flags.mapCalder],['ashfall','Landing Ridge','Ashfall · Volcanic world',()=>!!G.flags.mapAshfall]];
function openStarMap(){openPanel();const b=sheet('narrow');const here=G.shipAt||'twilight';
  b.innerHTML=head('Star Map','xSM')+`<p class="note">The Vesper is ${here==='anchorage'?'docked at':'parked at'} <b>${esc(ZONES[here].name)}</b>. Choose a destination. New coordinates appear here as you learn them.</p><div class="cards">${DESTS.map(([id,n,w,ok])=>{const can=ok(),cur=id===here;return `<div class="card"><div class="cd"><b>${can?esc(n):'Unknown coordinates'}</b><small>${can?esc(w)+' · '+esc(ZONES[id].blurb):'Keep following the signal.'}</small><small class="dim">${can?`Recommended level ${ZONES[id].lvl[0]}–${ZONES[id].lvl[1]}`:''}</small></div><button class="buy" type="button" data-d="${id}"${!can||cur?' disabled':''}>${cur?'HERE':'SET COURSE'}</button></div>`;}).join('')}</div>`;
  $('#xSM').onclick=closePanel;b.querySelectorAll('[data-d]').forEach(e=>e.onclick=()=>{const d=e.dataset.d;closePanel();flyTo(d);});padFocus(b,1);}
function flyTo(d){sfx('warp');$('#fade').style.opacity=1;cam.shake=.8;setTimeout(()=>{G.shipAt=d;$('#fade').style.opacity=0;showBanner(d==='anchorage'?'DOCKED':'LANDED',ZONES[d].name);vesta(d==='anchorage'?'Docking clamps engaged. The cargo ramp opens onto Bay 3.':'We\'re down. The cargo ramp is open whenever you\'re ready.');saveSoon();},1400);}

/* ---------- character look and turntable ---------- */
let lookTab='you',lookRaf=0;
const NAMES=['Rho','Ash','Wren','Mira Sato','Jun Okoro','Ezra Lune','Noor Halden','Ilya Brandt','Kestrel','Sable Vance','Juno','Tavish','Ren Achebe','Orrin','Vale','Ione Kade'];
function openLooks(first){lookTab='you';UI.custom=true;UI.customFirst=!!first;UI.lookYaw=0;openPanel(true);setLookView();renderLooks();}
function setLookView(){if(!UI.custom){camera.clearViewOffset();return;}const Wd=innerWidth,Hd=innerHeight;if(Wd>720)camera.setViewOffset(Wd,Hd,-Wd*.2,0,Wd,Hd);else camera.setViewOffset(Wd,Hd,0,Hd*.22,Wd,Hd);}
const lockedOK=u=>typeof u!=='string'||!!G.flags['look_'+u];
// the special models: unlocked once per device with a password, then any townsperson or humanoid robot can be worn
const SPECIAL_PW='tideunlock';let specialPw='',specialMsg='';
const specialOn=()=>{try{return localStorage.getItem('tidelock-special')==='1';}catch(e){return false;}};
function specialList(){const names={};for(const id in NPC_LOOKS){const n=NPC_LOOKS[id];if(n.hue===undefined&&NPCS[id])(names[n.mdl]=names[n.mdl]||[]).push(NPCS[id].name);}
  const lab={npc_r1:'Rusty robot',npc_r3:'Mech robot'};const out=[];
  NPC_F.forEach((m,i)=>out.push([m,'Woman '+(i+1)+(names[m]?' · '+names[m][0]:'')]));NPC_M.filter(m=>m!=='npc_m6').forEach((m,i)=>out.push([m,'Man '+(i+1)+(names[m]?' · '+names[m][0]:'')]));
  for(const m of['npc_r1','npc_r3'])out.push([m,lab[m]+(names[m]?' · '+names[m][0]:'')]);return out;}
function trySpecial(v){if((v||'').trim().toLowerCase()===SPECIAL_PW){try{localStorage.setItem('tidelock-special','1');}catch(e){}specialMsg='';sfx('quest');toast('Special models unlocked.','gold');}else{specialMsg='That password didn\'t work.';sfx('error');}specialPw='';renderLooks();}
function renderLooks(){const b=sheet(),L=G.look,first=UI.customFirst,fi=padButtons(b).indexOf(document.activeElement),C=lookColors(L);
  const sw=(k,c,on)=>`<button class="sw${on?' on':''}" type="button" data-k="${k}" data-c="${c}" style="background:${hex6(c)}" aria-label="Color"></button>`;
  const auto=(k,lab)=>`<button class="chipbtn${L[k]==null?' on':''}" type="button" data-k="${k}" data-c="auto">${lab}</button>`;
  const cpick=k=>`<button class="sw custom" type="button" data-cpk="${k}" title="Pick any color" aria-label="Pick any color"></button>`;
  const chips=(k,list)=>list.map(([id,lab,u])=>lockedOK(u)?`<button class="chipbtn${L[k]===id?' on':''}" type="button" data-k="${k}" data-v="${id}">${lab.toUpperCase()}</button>`:`<button class="chipbtn" type="button" disabled title="Found somewhere in the Reach">🔒 ???</button>`).join('');
  const row=(t,h)=>`<div><h3>${t}</h3><div class="opts">${h}</div></div>`;let inner='';
  if(lookTab==='you')inner=`<div><h3>Name</h3><div class="opts"><input id="lookName" class="namein" maxlength="18" value="${esc(L.name)}" placeholder="Type a name" autocomplete="off" spellcheck="false"><button class="buy" type="button" id="lookKb">⌨ TYPE</button><button class="buy alt" type="button" id="lookRand">RANDOM</button></div></div>`+row('Character',chips('body',LOOK.body.filter(x=>x[0]!=='npc')))+row('Build',chips('build',LOOK.build))+row('Height',chips('height',LOOK.height));
  if(lookTab==='colors')inner=row('Under-suit',PAL.map(c=>sw('suit',c,L.suit===c)).join('')+cpick('suit',L.suit))+row('Armor plates',auto('armor','AUTO')+PAL.map(c=>sw('armor',c,L.armor===c)).join('')+cpick('armor',C.armor))+row('Trim and joints',auto('trim','AUTO')+PAL.map(c=>sw('trim',c,L.trim===c)).join('')+cpick('trim',C.trim))
    +row('Glow lines',GLOWS.map(c=>sw('accent',c,L.accent===c)).join('')+cpick('accent',L.accent))+row('Visor',auto('visor','MATCH GLOW')+GLOWS.map(c=>sw('visor',c,L.visor===c)).join('')+cpick('visor',C.visor))+'<p class="note">The rainbow circle at the end of each row picks any color.</p>';
  if(lookTab==='suit')inner=row('Outfit',chips('outfit',LOOK.outfit))+row('Suit pattern',chips('pattern',LOOK.pattern))+row('Shoulders',chips('shoulders',LOOK.shoulders))+row('Finish',chips('finish',LOOK.finish))+row('Chest emblem',chips('emblem',LOOK.emblem));
  if(lookTab==='head')inner=row('Helmet',chips('helmet',LOOK.helmet))+(L.helmet==='none'?row('Face',chips('face',LOOK.face))+row('Hair style',chips('hairstyle',LOOK.hairstyle))+row('Skin tone',auto('skin','DEFAULT')+SKINS.map(c=>sw('skin',c,L.skin===c)).join('')+cpick('skin',L.skin??SKINS[1]))+row('Hair',auto('hair','DEFAULT')+HAIRS.map(c=>sw('hair',c,L.hair===c)).join('')+cpick('hair',L.hair??HAIRS[1])):'<p class="note">Choose “No helmet” to pick a face, hair style, skin tone and hair color.</p>');
  if(lookTab==='back')inner=row('Backpack',chips('pack',LOOK.pack))+'<p class="note">Use BACK below to see it.</p>';
  if(lookTab==='special'){
    if(!specialOn())inner=`<div><h3>Special models</h3><p class="note">Enter the password to wear any of the townspeople or robots and change their colours.</p><div class="opts"><input id="spPw" class="namein" maxlength="24" type="password" value="${esc(specialPw)}" placeholder="Password" autocomplete="off" spellcheck="false"><button class="buy" type="button" id="spKb">⌨ TYPE</button><button class="buy" type="button" id="spGo">UNLOCK</button></div>${specialMsg?`<p class="note" style="color:#ff8a7a">${specialMsg}</p>`:''}</div>`;
    else{const cur=L.body==='npc'?L.npc:null,step=(k,d,lab,val)=>`<button class="buy alt" type="button" data-sp="${k}" data-d="${-d}">◀</button><span class="chipbtn on" style="min-width:7em;text-align:center">${lab}: ${val}</span><button class="buy alt" type="button" data-sp="${k}" data-d="${d}">▶</button>`;
      inner=row('Model',`<button class="chipbtn${cur?'':' on'}" type="button" data-spm="">USE MY SUIT</button>`+specialList().map(([m,l])=>`<button class="chipbtn${cur===m?' on':''}" type="button" data-spm="${m}">${esc(l).toUpperCase()}</button>`).join(''))
        +(cur?row('Colours',step('npcHue',30,'Colour shift',(L.npcHue||0)+'°')+step('npcSat',.1,'Vividness',Math.round((L.npcSat??1)*100)+'%')+step('npcVal',.05,'Brightness',Math.round((L.npcVal??1)*100)+'%')+'<button class="buy alt" type="button" id="spReset">RESET</button>')
          +'<p class="note">Colour shift turns the clothes, hair and paint round the colour wheel; skin stays natural. Outfit, helmet and backpack apply to the Spacesuit only.</p>':'');}}
  if(L.body!=='suit'&&(lookTab==='suit'||lookTab==='head'||lookTab==='back'))inner='<p class="note">'+(L.body==='prota'?'The Sci-fi operative':L.body==='npc'?'A special model':'The Sci-fi soldier')+' comes fully suited, so outfit, helmet and backpack choices apply to the Spacesuit only. '+(L.body==='npc'?'':'On the COLORS tab, Under-suit, Armor plates, Trim and joints and Glow lines each recolour that part of it.')+'</p>';
  const nLocked=['outfit','helmet','emblem'].reduce((n,k)=>n+LOOK[k].filter(x=>!lockedOK(x[2])).length,0);
  b.innerHTML=`<h2>${first?'Your Reflection':'Locker'} <button class="x" type="button" id="xLook">${first?'DONE':'CLOSE · ESC'}</button></h2>
    <p class="note">${first?'Your visor is cracked, but your reflection is clear enough. The name on your collar has been scratched off. Who are you?':'Change how you look. Drag the view, or use the buttons, to turn around.'}</p>
    <div class="turn"><button class="buy alt" type="button" data-turn="-1">⟲ TURN</button><button class="buy alt" type="button" data-view="0">FRONT</button><button class="buy alt" type="button" data-view="${Math.PI/2}">SIDE</button><button class="buy alt" type="button" data-view="${Math.PI}">BACK</button><button class="buy alt" type="button" data-turn="1">TURN ⟳</button><button class="buy alt${UI.lookSpin?' on':''}" type="button" id="lookSpin">${UI.lookSpin?'STOP':'SPIN'}</button></div>
    ${tabsHtml([['you','YOU'],['colors','COLORS'],['suit','SUIT'],['head','HELMET'],['back','BACK'],['special',specialOn()?'★ SPECIAL':'🔒 SPECIAL']],lookTab)}${inner}${nLocked?`<p class="note">${nLocked} more style${nLocked>1?'s are':' is'} hidden out in the Reach, as rewards from people you help.</p>`:''}
    <button class="cta" type="button" id="lookDone">${first?'THIS IS ME':'DONE'}</button>`;
  const apply=()=>{refreshAvatar();saveSoon();};
  b.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>{lookTab=e.dataset.tab;if(lookTab==='back')UI.lookYaw=Math.PI;sfx('click');renderLooks();});
  b.querySelectorAll('[data-k][data-c]').forEach(e=>e.onclick=()=>{L[e.dataset.k]=e.dataset.c==='auto'?null:+e.dataset.c;sfx('click');apply();renderLooks();});
  b.querySelectorAll('[data-k][data-v]').forEach(e=>e.onclick=()=>{L[e.dataset.k]=e.dataset.v;sfx('click');apply();renderLooks();});
  b.querySelectorAll('[data-cpk]').forEach(e=>e.onclick=()=>{sfx('click');openCPK(e.dataset.cpk);});
  b.querySelectorAll('[data-turn]').forEach(e=>e.onclick=()=>{UI.lookYaw+=(+e.dataset.turn)*Math.PI/4;UI.lookSpin=false;});b.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>{UI.lookYaw=+e.dataset.view;UI.lookSpin=false;});
  $('#lookSpin').onclick=()=>{UI.lookSpin=!UI.lookSpin;renderLooks();};
  const inp=$('#lookName');if(inp){inp.oninput=()=>{G.look.name=inp.value.trim();lastHud='';};$('#lookRand').onclick=()=>{G.look.name=pick(NAMES);renderLooks();};$('#lookKb').onclick=()=>openOSK(G.look.name,18,v=>{G.look.name=v;lastHud='';renderLooks();padFocus('#panelBody',padButtons('#panelBody').indexOf($('#lookKb')));},'Your name');}
  const sp=$('#spPw');if(sp){sp.oninput=()=>{specialPw=sp.value;};sp.onkeydown=e=>{if(e.key==='Enter')trySpecial(sp.value);};$('#spGo').onclick=()=>trySpecial(sp.value);
    $('#spKb').onclick=()=>openOSK('',24,v=>{trySpecial(v);},'Password');}
  b.querySelectorAll('[data-spm]').forEach(e=>e.onclick=()=>{const m=e.dataset.spm;if(m){L.body='npc';L.npc=m;}else L.body='suit';sfx('click');apply();renderLooks();});
  b.querySelectorAll('[data-sp]').forEach(e=>e.onclick=()=>{const k=e.dataset.sp,d=+e.dataset.d;if(k==='npcHue')L.npcHue=(((L.npcHue||0)+d)%360+360)%360;
    else if(k==='npcSat')L.npcSat=+clamp((L.npcSat??1)+d,0,2).toFixed(2);else L.npcVal=+clamp((L.npcVal??1)+d,.5,1.5).toFixed(2);sfx('click');apply();renderLooks();});
  const rs=$('#spReset');if(rs)rs.onclick=()=>{L.npcHue=0;L.npcSat=1;L.npcVal=1;sfx('click');apply();renderLooks();};
  $('#xLook').onclick=closePanel;$('#lookDone').onclick=closePanel;if(fi>=0)padFocus(b,fi);}
function finishLooks(){if(!G.look.name)G.look.name=pick(NAMES);const first=UI.customFirst;if(first)breathing(false);UI.custom=false;UI.customFirst=false;UI.lookSpin=false;$('#panel').classList.remove('side');setLookView();lastHud='';saveSoon();if(first)setTimeout(afterFirstLooks,60);}

/* ---------- on-screen keyboard for controllers ---------- */
const OSK_ROWS=['1234567890','QWERTYUIOP','ASDFGHJKL\'','ZXCVBNM-.'];
let osk=null;
function openOSK(value,max,onDone,title='Name'){osk={v:value||'',max,onDone,title,shift:!value};UI.osk=true;let el=$('#osk');if(!el){el=document.createElement('div');el.id='osk';document.body.appendChild(el);}el.hidden=false;renderOSK();
  const L=padButtons('#oskKeys');if(L.length)padMark(L,10);}
function renderOSK(){const el=$('#osk');const up=osk.shift;const sel=padButtons('#oskKeys').findIndex(b=>b.classList.contains('psel'));
  el.innerHTML=`<div class="op"><div class="oh"><span class="ot">${esc(osk.title)}</span><span class="ov">${esc(osk.v)}<i class="caret"></i></span><small>${osk.v.length}/${osk.max}</small></div><div id="oskKeys">${OSK_ROWS.map(r=>`<div class="or">${[...r].map(c=>{const ch=/[A-Z]/.test(c)?(up?c:c.toLowerCase()):c;return `<button type="button" class="ok" data-k="${esc(ch)}">${esc(ch)}</button>`;}).join('')}</div>`).join('')}
    <div class="or"><button type="button" class="ok w2${up?' on':''}" data-k="shift">⇧ SHIFT</button><button type="button" class="ok w4" data-k=" ">SPACE</button><button type="button" class="ok w2" data-k="del">⌫ DELETE</button><button type="button" class="ok w2 done" data-k="done">✓ DONE</button></div></div>
    <div class="ohint">${pad.active?'D-pad: move · A: type · X: delete · Y: space · B or +: done':'Tap the keys, or type on a keyboard · Enter when done'}</div></div>`;
  el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>oskKey(b.dataset.k));const L=padButtons('#oskKeys');if(sel>=0&&L[sel])padMark(L,sel);}
function oskKey(k){if(!osk)return;sfx('click');if(k==='done')return oskDone();if(k==='shift'){osk.shift=!osk.shift;return renderOSK();}
  if(k==='del')osk.v=osk.v.slice(0,-1);else if(osk.v.length<osk.max)osk.v+=k;osk.shift=!osk.v||osk.v.endsWith(' ');renderOSK();}
function oskDone(){if(!osk)return;const o=osk;osk=null;UI.osk=false;$('#osk').hidden=true;sfx('click');o.onDone(o.v.trim());}
/* ---------- colour picker (works with a controller, touch, mouse or keyboard) ---------- */
// Three sliders (hue, saturation, brightness) with a live preview on the character. Controller: D-pad or left stick up and down
// picks a slider, left and right moves it (hold to keep going); A keeps the colour, B puts the old one back.
let cpk=null;
const hsv2hex=(h,s,v)=>{const f=n=>{const k=(n+h/60)%6;return v-v*s*Math.max(0,Math.min(k,4-k,1));};return (Math.round(f(5)*255)<<16)|(Math.round(f(3)*255)<<8)|Math.round(f(1)*255);};
function hex2hsv(x){const r=(x>>16&255)/255,g=(x>>8&255)/255,b=(x&255)/255,mx=Math.max(r,g,b),d=mx-Math.min(r,g,b);
  let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}return {h,s:mx?d/mx:0,v:mx};}
const CPK_ROWS=[['h','HUE',360],['s','SATURATION',1],['v','BRIGHTNESS',1]];
function openCPK(k){const L=G.look,cur=lookColors(L)[k]??L[k]??0xffffff;cpk={k,orig:L[k],...hex2hsv(cur),row:0,btn:1};UI.cpk=true;
  let el=$('#cpk');if(!el){el=document.createElement('div');el.id='cpk';document.body.appendChild(el);}el.hidden=false;renderCPK();}
function cpkHex(){return hsv2hex(cpk.h,cpk.s,cpk.v);}
function cpkApply(){G.look[cpk.k]=cpkHex();if(!lookRaf)lookRaf=requestAnimationFrame(()=>{lookRaf=0;refreshAvatar();});}
function cpkPaint(){const el=$('#cpk');if(!el||!cpk)return;const hx=hex6(cpkHex()),pure=hex6(hsv2hex(cpk.h,1,1)),grey=hex6(hsv2hex(cpk.h,0,cpk.v)),full=hex6(hsv2hex(cpk.h,cpk.s,1));
  el.querySelector('.cpv').style.background=hx;el.querySelector('.cpx').textContent=hx.toUpperCase();
  const bars={h:'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',s:`linear-gradient(90deg,${grey},${hex6(hsv2hex(cpk.h,1,cpk.v))})`,v:`linear-gradient(90deg,#000,${full})`};
  CPK_ROWS.forEach(([key,,mx],i)=>{const r=el.querySelector(`[data-row="${i}"]`);r.classList.toggle('on',cpk.row===i);r.querySelector('.cpb').style.background=bars[key];r.querySelector('.cpm').style.left=(cpk[key]/mx*100)+'%';
    r.querySelector('.cpn').textContent=key==='h'?Math.round(cpk.h)+'°':Math.round(cpk[key]*100)+'%';});
  el.querySelectorAll('[data-cb]').forEach((b,i)=>b.classList.toggle('psel',cpk.row===3&&cpk.btn===i));void pure;}
function renderCPK(){const el=$('#cpk'),name={suit:'Under-suit',armor:'Armor plates',trim:'Trim and joints',accent:'Glow lines',visor:'Visor',skin:'Skin tone',hair:'Hair'}[cpk.k]||'Color';
  el.innerHTML=`<div class="cpp"><div class="cph"><span class="cpt">${esc(name)}</span><span class="cpv"></span><span class="cpx"></span></div>
    ${CPK_ROWS.map(([key,lab],i)=>`<div class="cpr" data-row="${i}"><span class="cpl">${lab}</span><button type="button" class="cpa" data-step="${i},-1">◀</button><div class="cpb" data-bar="${i}"><i class="cpm"></i></div><button type="button" class="cpa" data-step="${i},1">▶</button><span class="cpn"></span></div>`).join('')}
    <div class="cpbtns"><button type="button" class="ok" data-cb="0">CANCEL</button><button type="button" class="ok done" data-cb="1">✓ USE THIS COLOR</button></div>
    <div class="ohint">${pad.active?'D-pad up/down: pick a slider · left/right: adjust (hold to sweep) · A: use · B: cancel':'Drag a slider or tap the arrows · Enter to use · Esc to cancel'}</div></div>`;
  el.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const [i,d]=b.dataset.step.split(',').map(Number);cpk.row=i;cpkNudge(d*(i===0?6:.04));});
  el.querySelectorAll('[data-bar]').forEach(bar=>{const i=+bar.dataset.bar,set=e=>{const r=bar.getBoundingClientRect(),t=clamp((e.clientX-r.left)/r.width,0,1),[key,,mx]=CPK_ROWS[i];cpk.row=i;cpk[key]=t*mx;cpkApply();cpkPaint();};
    bar.onpointerdown=e=>{bar.setPointerCapture(e.pointerId);set(e);bar.onpointermove=set;};bar.onpointerup=bar.onpointercancel=()=>{bar.onpointermove=null;};});
  el.querySelectorAll('[data-cb]').forEach(b=>b.onclick=()=>cpkClose(b.dataset.cb==='1'));cpkPaint();}
function cpkNudge(d){if(!cpk||cpk.row>2)return;const [key,,mx]=CPK_ROWS[cpk.row];cpk[key]=key==='h'?((cpk.h+d)%360+360)%360:clamp(cpk[key]+d,0,1);cpkApply();cpkPaint();}
function cpkMove(dy){if(!cpk)return;cpk.row=clamp(cpk.row+dy,0,3);sfx('click');cpkPaint();}
function cpkClose(keep){if(!cpk)return;const k=cpk.k;if(keep)G.look[k]=cpkHex();else G.look[k]=cpk.orig;cpk=null;UI.cpk=false;$('#cpk').hidden=true;sfx('click');refreshAvatar();saveSoon();renderLooks();
  const L=padButtons('#panelBody'),i=L.indexOf($(`#panelBody [data-cpk="${k}"]`));if(i>=0)padFocus('#panelBody',i);}
// held input sweeps the active slider; speed builds up the longer it is held
function cpkHold(x,dt){if(!cpk)return;if(!x){cpk.hold=0;return;}if(cpk.row===3){if(!cpk.hold){cpk.btn=x>0?1:0;cpkPaint();}cpk.hold=1;return;}
  cpk.hold=(cpk.hold||0)+dt;const sp=cpk.row===0?60+Math.min(cpk.hold,1.5)*120:.18+Math.min(cpk.hold,1.5)*.35;cpkNudge(x*sp*dt);}

/* ---------- help ---------- */
function openHelp(){openPanel();const b=sheet();
  const rows=[['Move','W A S D or arrow keys','Drag on the left half of the screen','Left stick'],['Sprint','Hold Shift','SPRINT button (toggle)','Click the left stick (toggle)'],['Look around','Drag with the mouse','Drag on the right half of the screen','Right stick'],['Zoom (all the way in for first person)','Scroll wheel or + and −; V switches first and third person','Pinch with two fingers','D-pad up and down; click the right stick to switch first and third person'],['Jump','Space','JUMP button','B'],
    ['Fire','F (hold for automatic weapons and beams) or click','FIRE button (hold)','ZR or R (hold)'],['Talk, pick up, use','E','USE button (appears when something is in reach)','A'],['Swap weapons','R, or 1 and 2','SWAP button','Y'],['Quick item','Q','Bottom-right quick button','ZL or L'],['Reply in a conversation','1–9, or Enter for the first reply','Tap a reply','D-pad, then A'],
    ['Leave a conversation','Esc or any movement key','Start moving','B'],['Menu: pack, character, journal, map, system','I or Tab (pack), C (character), J (journal), M (map)','MENU and MAP buttons','+'],['Recenter the camera','','','X'],['This help','H or F1','HELP button','−'],['Close a menu','Esc','CLOSE button','B, + or −']];
  b.innerHTML=head('How to Play','xH')+`<div class="help"><h3>The story</h3><p>You wake in the wreck of your ship, the <b>Vesper</b>, on <b>Ossery b</b>, a planet that always keeps one face to its star. You don't remember your name. A signal pulled your ship out of the sky, and it is still calling. Follow it from the colony at <b>Meridian</b>, across a burning dayside and a frozen nightside, up to the orbital station <b>Anchorage</b>, to the lagoon moon <b>Calder</b> and finally to <b>Ashfall</b>, where the Builders left something waiting.</p></div>
    <div class="help"><h3>How it works</h3><ul>
    <li><b>Main story and side jobs.</b> A gold <b>★</b> over someone's head is the main story. An amber <b>!</b> is a side job, and <b>?</b> means you can report back. The tracker on the left shows your tasks; tap one to follow it. The amber diamond on the compass and minimap points the way, even to other regions.</li>
    <li><b>Weapons.</b> Sidearms, rifles, scatterguns, beams, launchers and melee weapons all handle differently. You carry two; swap between them any time. Shots use energy (EN), which recharges.</li>
    <li><b>Loot and rarity.</b> Gear drops in five rarities: <span class="rc-common">common</span>, <span class="rc-uncommon">uncommon</span>, <span class="rc-rare">rare</span>, <span class="rc-epic">epic</span> and <span class="rc-legendary">legendary</span>. Rarer items are stronger and have mod slots. In your Pack, green numbers show what an item improves over what you're wearing.</li>
    <li><b>Upgrade everything.</b> At any workbench you can upgrade each weapon and suit piece up to +5, install mods, craft supplies and recycle spare gear into materials.</li>
    <li><b>Temperature.</b> Every helmet, suit, boots and pack adds to both your cold and heat protection, and upgrades add more. The readout under your bars shows the range your suit handles. Outside it, your suit drains energy and then health. Heat packs and coolant give a temporary boost. Towns are always safe.</li>
    <li><b>Level up and spend perks.</b> Each level adds health and gives a perk point (Menu → Character).</li>
    <li><b>Jump.</b> Crevasses, stepping stones over brine, lava and deep water, steam vents and rock stacks all need a hop. In fights, jump over shockwaves.</li>
    <li><b>Find things.</b> 24 Builder glyphs, dozens of data logs and many locked caches are hidden across the worlds. Data Chips open locked caches.</li>
    <li><b>Change your look</b> at any locker. Rewards from people you help unlock new outfits, helmets and emblems.</li>
    <li><b>Travel.</b> Walk between regions on Ossery b through the passes. Once the Vesper flies, use the star map on its bridge. Discovered landmarks marked ◆ allow fast travel from the map.</li>
    <li><b>If you go down</b>, you wake at the last safe place you visited, minus a few credits.</li>
    <li><b>Saving.</b> Progress saves automatically to your slot. Menu → System lets you copy a save code as a backup or paste one in.</li></ul></div>
    <div><h3>Controls</h3><div class="ktw"><table class="kt"><thead><tr><th>ACTION</th><th>KEYBOARD / MOUSE</th><th>TOUCH</th><th>CONTROLLER</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]||'—'}</td><td>${r[2]||'—'}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table></div>
    <p class="help" style="margin-top:8px"><small>${pad.blocked?'This view blocks controller access. Open the downloaded HTML file in Safari, Chrome or Edge to use a controller.':pad.on?'Controller connected.':'Using a controller: pair it over Bluetooth, then press any button while the game is open. Button names follow the Switch layout.'}</small></p></div>
    <div class="help"><h3>Controller check</h3><p>Press buttons and move the sticks. This shows exactly what your browser reports, live.</p><div id="padDiag" class="diag"></div></div>`;
  $('#xH').onclick=closePanel;padFocus(b);padDiagT=0;}
$('#bHelp').onclick=()=>{if(UI.dialog)return;UI.panel?closePanel():openHelp();};
$('#bMenu').onclick=()=>{if(UI.dialog)closeDialog();UI.panel?closePanel():openMenu();};
$('#bMap').onclick=()=>{if(UI.dialog)closeDialog();UI.panel?closePanel():openMenu('map');};
$('#panel').addEventListener('pointerdown',e=>{if(e.target.id==='panel'&&!UI.custom)closePanel();});

/* ---------- title screen save slots ---------- */
let slotConfirm=null,slotMode='manage',pendingCode='';
function slotSummary(d){const name=(d.look&&d.look.name)||'Surveyor',m=Object.keys(d.q||{}).filter(k=>QUESTS[k]&&QUESTS[k].type==='main'&&d.q[k].st==='done').length,s=Object.keys(d.q||{}).filter(k=>QUESTS[k]&&QUESTS[k].type!=='main'&&d.q[k].st==='done').length;
  return {name,lvl:d.lvl||1,line:`LV ${d.lvl||1} · story ${m}/16 · ${s} side jobs · ${(ZONES[d.zone]||{name:'?'}).name}`,ago:d.savedAt?timeAgo(d.savedAt):''};}
function timeAgo(t){const s=(Date.now()-t)/1000;if(s<90)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';return Math.round(s/86400)+' days ago';}
function openSlots(mode){slotMode=mode;slotConfirm=null;pendingCode='';openPanel();renderSlots();}
function renderSlots(){const b=sheet('narrow');
  const rows=[0,1,2].map(i=>{const d=readSlot(i),m=d&&slotSummary(d),cur=i===saveSlot&&d;
    if(slotConfirm&&slotConfirm.i===i)return `<div class="slotrow warn"><span class="lab">SLOT ${i+1}</span><b>${slotConfirm.text}</b><div class="cb"><button class="buy danger" type="button" id="slotYes">${slotConfirm.yes}</button><button class="buy alt" type="button" id="slotNo">CANCEL</button></div></div>`;
    return `<div class="slotrow${cur?' cur':''}"><span class="lab">SLOT ${i+1}${cur?' · LAST PLAYED':''}</span>${d?`<b>${esc(m.name)}</b><small>${m.line}${m.ago?' · saved '+m.ago:''}</small>`:'<b class="dim">Empty</b><small>No expedition saved here.</small>'}
      <div class="cb">${d?`<button class="buy" type="button" data-play="${i}">PLAY</button>`:''}<button class="buy${d?' alt':''}" type="button" data-new="${i}">${d?'START OVER HERE':'START NEW HERE'}</button>${d?`<button class="buy alt" type="button" data-del="${i}">DELETE</button>`:''}</div></div>`;});
  b.innerHTML=head(slotMode==='new'?'Choose a Slot':'Save Slots','xSl')+`<p class="note">${slotMode==='new'?'Pick where your new expedition is saved. Starting over in a used slot erases it, and you\'ll be asked first.':'Each slot is a separate expedition. Progress saves automatically to the slot you\'re playing.'}</p><div class="cards">${rows.join('')}</div>
    <div><h3>Load a save code</h3><p class="note">Paste a code you copied from Menu → System, then choose a slot for it.</p><textarea id="codeIn" class="codein" rows="3" placeholder="TIDELOCK-…" spellcheck="false" autocomplete="off"></textarea>
    <div class="cb">${[0,1,2].map(i=>`<button class="buy alt" type="button" data-code="${i}">LOAD INTO SLOT ${i+1}</button>`).join('')}</div><div id="codeMsg" class="note"></div></div>`;
  const ci=$('#codeIn');ci.value=pendingCode;ci.oninput=()=>{pendingCode=ci.value;};const ask=(i,text,yes,act)=>{const L=padButtons(b);slotConfirm={i,text,yes,act,from:Math.max(0,L.findIndex(x=>x.classList.contains('psel')))};renderSlots();};
  b.querySelectorAll('[data-play]').forEach(el=>el.onclick=()=>{const i=+el.dataset.play,d=readSlot(i);if(!d)return;saveSlot=i;storeSlotIndex();closePanel();loadGame(d);});
  b.querySelectorAll('[data-new]').forEach(el=>el.onclick=()=>{const i=+el.dataset.new,d=readSlot(i);const go=()=>{closePanel();saveSlot=i;storeSlotIndex();newGame();};if(!d)return go();const m=slotSummary(d);ask(i,`Erase Slot ${i+1} (${esc(m.name)}, LV ${m.lvl}) and start a new expedition?`,'YES, ERASE AND START',go);});
  b.querySelectorAll('[data-del]').forEach(el=>el.onclick=()=>{const i=+el.dataset.del,m=slotSummary(readSlot(i));ask(i,`Delete Slot ${i+1} (${esc(m.name)}, LV ${m.lvl})? This can't be undone.`,'YES, DELETE',()=>{try{localStorage.removeItem(SLOT_KEYS[i]);}catch(e){}slotConfirm=null;renderSlots();refreshTitle();});});
  b.querySelectorAll('[data-code]').forEach(el=>el.onclick=()=>{const i=+el.dataset.code,r=readCode(pendingCode);if(r.err){$('#codeMsg').innerHTML='<span class="bad">'+r.err+'</span>';return;}
    const go=()=>{closePanel();saveSlot=i;storeSlotIndex();loadGame(r.d);toast('Save code loaded into Slot '+(i+1),'gold');},cur=readSlot(i),n=slotSummary(r.d);if(!cur)return go();const m=slotSummary(cur);ask(i,`Replace Slot ${i+1} (${esc(m.name)}, LV ${m.lvl}) with the pasted save (${esc(n.name)}, LV ${n.lvl})?`,'YES, REPLACE IT',go);});
  if(slotConfirm){$('#slotYes').onclick=()=>{const a=slotConfirm.act;slotConfirm=null;a();};$('#slotNo').onclick=cancelSlotConfirm;}
  $('#xSl').onclick=closePanel;
  // with a question showing, the controller highlight sits on YES; afterwards it returns to the button you used
  if(slotConfirm)padFocus(b,padButtons(b).indexOf($('#slotYes')));else padFocus(b,renderSlots.back||0);renderSlots.back=0;}
function cancelSlotConfirm(){const f=slotConfirm?slotConfirm.from:0;slotConfirm=null;renderSlots.back=f;renderSlots();}

/* ---------- controller diagnostics shown in Help ---------- */
let padDiagT=0;
function padDiag(dt){const el=document.getElementById('padDiag');if(!el||!UI.panel)return;padDiagT-=dt;if(padDiagT>0)return;padDiagT=.1;let h='';
  if(!navigator.getGamepads)h='<span class="bad">This browser has no controller support.</span> Try Safari, Chrome or Edge.';
  else if(pad.blocked)h='<span class="bad">This view blocks controller access.</span>\nThe claude.ai page embeds the game in a frame that isn\'t allowed to read controllers. Download the HTML file and open it directly in Safari, Chrome or Edge.';
  else{const L=padList();if(!L.length)h='<span class="bad">No controller detected yet.</span>\nPress any button on the controller now. Browsers hide controllers until you press one while the page is open.';
    else{const act=readPad();h=L.map(g=>{const st=padState(g),nm=['A','B','X','Y','L','R','ZL','ZR','−','+','L-stick','R-stick','Up','Down','Left','Right','Home'];const raw=g.buttons.map((b,i)=>b&&(b.pressed||b.value>.5)?i:-1).filter(i=>i>=0);const mapped=st.now.map((v,i)=>v?nm[i]:null).filter(Boolean);
      const on=act&&g.index===act.index;return `<span class="${on?'ok':''}">${on?'▶ IN USE':'  idle'} · #${g.index} ${esc(g.id)}</span>\nlayout: ${g.mapping||'raw (not standard)'} · ${g.buttons.length} buttons · ${g.axes.length} axes\nraw buttons held: ${raw.join(', ')||'none'}\ngame reads: ${mapped.join(', ')||'nothing'}\nraw axes: ${g.axes.map(a=>a.toFixed(2)).join('  ')}`;}).join('\n\n');}}
  if(el.innerHTML!==h)el.innerHTML=h;}

// ===== 62_title.js =====
/* ================= TITLE SCREEN: splash, cinematic camera, menu ================= */
// The menu keeps its own selection index instead of relying on DOM focus, which iOS Safari doesn't
// grant to buttons reliably; controller, keyboard, touch and mouse all drive the same index.
const TT={splash:true,sel:0,shot:-1,t:0,fadeT:0,wave:0};
const TITLE_SHOTS=[
  {k:'OSSERY B · TWILIGHT BAND',t:'MERIDIAN STATION',dur:15,cam:u=>{const a=.6+u*.55,r=62-u*8;return [[Math.sin(a)*r,20-u*5,Math.cos(a)*r],[0,4,0]];}},
  {k:'OSSERY B · TWILIGHT BAND',t:'THE CRASH SITE',dur:13,cam:u=>{const h=TW_H.crash;return [[lerp(-36,-45,u),h+lerp(3.6,2.4,u),lerp(126,133,u)],[-56,h+1.7,146]];}},
  {k:'OSSERY B · TWILIGHT BAND',t:'JELLY MEADOW',dur:12,cam:u=>{const h=TW_H.meadow;return [[lerp(-172,-186,u),h+lerp(3,7,u),lerp(98,106,u)],[-206,h+5,130]];}},
  {k:'OSSERY B · TWILIGHT BAND',t:'THE BUILDER RUINS',dur:12,cam:u=>{const h=TW_H.ruins;return [[lerp(-221,-233,u),h+lerp(5,3.8,u),lerp(-103,-113,u)],[-252,h+4,-132]];}},
  {k:'OSSERY B · TWILIGHT BAND',t:'MERIDIAN · MAIN STREET',dur:12,cam:u=>[[lerp(30,14,u),lerp(2.6,2.1,u),lerp(32,20,u)],[lerp(-6,-14,u),2.6,lerp(-4,-14,u)]]},
];
const _tc=new THREE.Vector3(),_tl=new THREE.Vector3();
// film grain: one small noise tile, moved in steps by CSS
{const c=mkCanvas(128),g=c.getContext('2d'),d=g.createImageData(128,128);for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=Math.random()<.5?255:0;}g.putImageData(d,0,0);$('#title .tgrain').style.backgroundImage=`url(${c.toDataURL()})`;}
function titleItems(){return [...document.querySelectorAll('#tmenu .tm')].filter(b=>!b.hidden);}
function titleSelect(i){const L=titleItems();if(!L.length)return;TT.sel=(i+L.length)%L.length;L.forEach((b,k)=>b.classList.toggle('sel',k===TT.sel));}
function titleMove(d){const L=titleItems();if(!L.length)return;let i=TT.sel;for(let k=0;k<L.length;k++){i=(i+d+L.length)%L.length;if(!L[i].disabled)break;}titleSelect(i);sfx('click');}
function titleActivate(){const L=titleItems(),b=L[TT.sel];if(b&&!b.disabled){sfx('click');b.click();}}
function titleDismissSplash(){if(!TT.splash)return;TT.splash=false;initAudio();$('#tsplash').hidden=true;$('#title').classList.add('menu');const m=$('#tmenu');m.hidden=false;
  titleItems().forEach((b,i)=>{b.style.animationDelay=(.08*i)+'s';});const L=titleItems();TT.sel=Math.max(0,L.findIndex(b=>!b.disabled));titleSelect(TT.sel);}
function titleInput(kind){// kind: up, down, ok, back, any
  if(UI.panel)return false;if(TT.splash){titleDismissSplash();return true;}
  if(kind==='up')titleMove(-1);else if(kind==='down')titleMove(1);else if(kind==='ok')titleActivate();return true;}
function showTitle(){UI.title=true;TT.splash=true;$('#title').classList.remove('menu');TT.shot=-1;TT.t=0;$('#title').hidden=false;$('#tsplash').hidden=false;$('#tmenu').hidden=true;
  if(avatar){const h=TW_H.crash;avatar.root.visible=false;avatar.root.position.set(-53,groundY(-53,141),141);avatar.root.rotation.y=Math.atan2(-60+53,150-141);}refreshTitle();}
// a live readout of what the browser reports, so a controller that isn't reaching the page is obvious
function titlePadStatus(){const el=$('#padStatus');if(!el)return;let t;
  if(!navigator.getGamepads)t='This browser has no controller support';else if(pad.blocked)t='This view blocks controllers. Open the downloaded file in Safari';
  else{const g=readPad();t=g?`<b class="ok">●</b> Controller connected: ${esc(g.id.slice(0,40))}`:(isTouch?'<b>○</b> No controller yet. On iPad, Safari connects it after you tap the screen once':'<b>○</b> Waiting for a controller. Press any button on it');}
  if(el.innerHTML!==t)el.innerHTML=t;}
function titleUpdate(dt){TT.t+=dt;
  // cinematic shots with a dip to black between them
  if(TT.shot<0||TT.t>TITLE_SHOTS[TT.shot].dur){TT.shot=(TT.shot+1)%TITLE_SHOTS.length;TT.t=0;const S=TITLE_SHOTS[TT.shot];$('#tlocK').textContent=S.k;$('#tlocT').textContent=S.t;
    const L=$('#tloc');L.classList.remove('on');setTimeout(()=>L.classList.add('on'),900);const [c,l]=S.cam(0);player.x=l[0];player.z=l[2];updateLights();}
  const S=TITLE_SHOTS[TT.shot],u=smooth(0,1,TT.t/S.dur),[c,l]=S.cam(u);
  _tc.set(c[0],Math.max(c[1],groundY(c[0],c[2])+1.2),c[2]);_tl.set(l[0],l[1],l[2]);camera.position.lerp(_tc,TT.t<.05?1:clamp(dt*3,0,1));camera.lookAt(_tl);
  $('#tfade').style.opacity=(TT.t<.6||TT.t>S.dur-.7)?.95:0;
  sun.position.set(l[0]+sunDir.x*160,l[1]+sunDir.y*160+5,l[2]+sunDir.z*160);sun.target.position.set(l[0],l[1],l[2]);sun.target.updateMatrixWorld();
  if(avatar&&avatar.anim){avatar.anim.update(dt,0);poseLayers(avatar.B,{look:0,act:player.act},avatar.anim);avatar.sync();tickIdle(player.act,dt,false,['look','neutral','look']);}
  // the signal waveform under the logo
  TT.wave+=dt;const w=(k,amp,f,ph)=>{let d='';for(let i=0;i<=64;i++){const x=i/64*260,e=Math.sin(i/64*Math.PI);const y=14+Math.sin(i*f+TT.wave*k+ph)*amp*e*(.6+.4*Math.sin(TT.wave*1.7+i*.3))+(Math.random()-.5)*1.2*e;d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);}return d;};
  $('#waveA').setAttribute('d',w(3.2,9,.42,0));$('#waveB').setAttribute('d',w(-2.1,6,.27,1.3));
  titlePadStatus();}
function openOptions(){openPanel();const b=sheet('narrow');
  b.innerHTML=head('Options','xO')+`<div class="cards"><div class="slotrow"><span class="lab">AUDIO</span><div class="cb"><button class="buy alt" type="button" id="oSnd">${muted?'SOUND: OFF':'SOUND: ON'}</button><button class="buy alt" type="button" id="oMus">${musicOn?'MUSIC: ON':'MUSIC: OFF'}</button></div></div>
    <div class="slotrow"><span class="lab">GRAPHICS</span><small>Glow makes lights, signs and emissive panels bloom. Auto resolution lowers the render resolution slightly only when the game would stutter. Turn either off or on to suit your device.</small><div class="cb"><button class="buy alt" type="button" id="oGlow">${POST.on?'GLOW: ON':'GLOW: OFF'}</button><button class="buy alt" type="button" id="oDrs">${DRS.on?'RESOLUTION: AUTO':'RESOLUTION: FULL'}</button></div></div>
    <div class="slotrow"><span class="lab">FIRST-PERSON HUD</span><small>Zoom all the way in to play in first person. Choose how much of the HUD stays on screen.</small>${hudChoice('oHud')}</div>
    <div class="slotrow"><span class="lab">CONTROLLER</span><small>Shows exactly what your browser reports, live.</small><div id="padDiag" class="diag"></div></div></div>`;
  $('#xO').onclick=closePanel;bindHudChoice(b,openOptions);$('#oSnd').onclick=()=>{setMuted(!muted);openOptions();};$('#oMus').onclick=()=>{setMusic(!musicOn);openOptions();};$('#oGlow').onclick=()=>{setBloom(!POST.on);openOptions();};$('#oDrs').onclick=()=>{setDrs(!DRS.on);openOptions();};padDiagT=0;padFocus(b,0);}
function openCredits(){openPanel();const b=sheet('narrow');
  b.innerHTML=head('Credits','xCr')+`<div class="help"><p><b>Tidelock</b> was designed, written and built for this project: the worlds, story, characters, code, textures, effects and most of the 3D models.</p>
    <ul><li><b>Spacesuit and townspeople:</b> Quaternius (Ultimate Modular Men, Women and Space Kit), CC0</li><li><b>Spark sound:</b> “Electronic Element Burn Spark” by FxProSound (Pixabay), Pixabay Content License</li><li><b>The Halo's back bar:</b> “The Drome Bar v3.1” by tl0615 (sketchfab.com/tl0615), CC BY 4.0</li><li><b>Station chairs:</b> “Sci-Fi Chair | Web 3D • AR • Metaverse” by Md Mahmudur Rahman Bappy (sketchfab.com/bappybd007) and “Chair sci-fi mk1” by Cartesian_SOLV3D (sketchfab.com/cartesiansolv3d), CC BY 4.0</li><li><b>Plants:</b> “Optimized Potted Plants” by Nicholas-3D (sketchfab.com/Nicholas01), CC BY 4.0</li><li><b>Station robots and drones:</b> after “Space station Scene Wip 7 (Test)” by 3DHaupt (sketchfab.com/dennish2010)</li><li><b>The Vesper:</b> “Spaceship Patriot Type 1” by Kessler_Protus (sketchfab.com/Kessler_Protus), CC BY 4.0 (emblem removed)</li><li><b>Vesper decks:</b> “Spaceship Corridor” by ABSoln (sketchfab.com/ABSoln), CC BY-NC 4.0, cut into wall, floor and ceiling pieces</li><li><b>Navigation terminal:</b> “Free Terminal 2” by Inditrion Dradnon (sketchfab.com/dradnon), CC BY 4.0</li><li><b>Bridge seats:</b> “Spaceship_chair” by @blue.blender.print (sketchfab.com/Moonshroomek), CC BY 4.0</li><li><b>Dune Borer:</b> “Sand Worm” by chatholoboom7745289 (sketchfab.com/chabsfabo86), CC BY-NC 4.0</li><li><b>Robots:</b> “RobotExpressive” by Tomás Laulhé (Quaternius), CC0</li><li><b>Sci-fi soldier:</b> “Stylized Sci-Fi Soldier (animated)” by Jungle Jim, CC BY 4.0</li><li><b>Sci-fi operative:</b> “Sci-Fi Male Character” by Xavi Pujadas, CC BY-NC-ND 4.0 (personal, non-commercial use)</li><li><b>The Vesper:</b> “Phantom Sabre jet” by #3D $Resource$, CC BY 4.0</li><li><b>Pistol:</b> “Scifi Gun” by Slav92, CC BY 4.0</li><li><b>Rifle:</b> “SciFi Rifle” by DJMaesen, CC BY-NC 4.0</li><li><b>Shotgun:</b> “Shotgun” by Alex Sanches, CC BY-NC 4.0</li><li><b>Beam weapons:</b> “Low Poly Laser Pistol 1” by sidedvirus, CC BY 4.0</li><li><b>Grenade launchers:</b> “Grenade Launcher (Death Stranding fan art)” by mnshkv, CC BY 4.0</li><li><b>Blade:</b> “Scifi Heavy Blade (LowPoly)” by Wang Sh D, CC BY 4.0</li><li><b>Ash Golem:</b> “Golem Rigged” by FourthGreen, CC BY 4.0</li><li><b>Reed Stalker:</b> “Alien Ninja Creature with 45 animations” by Jungle Jim, CC BY 4.0</li><li><b>Glider Ray:</b> “Manta Ray Birostris (animated)” by Violaine, CC BY-NC-SA 4.0</li><li><b>Vash:</b> “Nightmare Creature 1#” by Idk, CC BY 4.0</li><li><b>Maintenance Drone:</b> “Flying Bot” by colizey, CC BY 4.0</li><li><b>Ember Wisp:</b> “FireBall” by tamminen, CC BY 4.0</li><li><b>Hollow Warden:</b> “alien low poly” by vicente betoret ferrero, CC BY 4.0</li><li><b>Skitters:</b> “Alien” by DJMaesen, CC BY 4.0</li><li><b>Crystals, rocks, ruin stones and jellyfish:</b> “Toon Style - Crystal”, “Lowpoly textured ice Crystals”, “Crystals”, “Magical Glowing Crystals”, “Magic Crystal IX”, “Glowing Jelly Fish”, “Stylized Rocks with Magic Rune”, “Fantasy Ruin Rocks”, “Small rocks”, “Stylized Rocks”, “Cozy Campfire - Shape Key Animation”, “Tent”, all CC BY 4.0, from Sketchfab</li><li><b>Survey rover:</b> “Rover new” by M8ZA, CC BY 4.0</li><li><b>Shuttle:</b> “Standard civilan shuttle” by Sol, CC BY-NC-ND 4.0</li><li><b>Ship corridor:</b> “Space ship hallway” by yeeyeeman, CC BY 4.0</li><li><b>Engine:</b> three.js, MIT</li><li><b>Music and laser sound:</b> supplied by the player</li></ul></div>`;
  $('#xCr').onclick=closePanel;padFocus(b,0);}
$('#bOpts').onclick=()=>{initAudio();openOptions();};
// iOS Safari hides controllers from a page until it has been touched once, so on touch devices the splash asks for a tap
if(isTouch){$('#pressTxt').textContent='TAP TO BEGIN';$('#pressSub').textContent='Then use your controller from here on. Safari connects it after the first tap.';}
try{window.focus();}catch(e){}$('#bCred').onclick=()=>openCredits();
$('#title').addEventListener('pointerdown',e=>{if(UI.panel)return;if(TT.splash){titleDismissSplash();e.preventDefault();}});
document.querySelectorAll('#tmenu .tm').forEach(b=>b.addEventListener('pointerenter',()=>{const i=titleItems().indexOf(b);if(i>=0&&i!==TT.sel)titleSelect(i);}));

// ===== 63_intro.js =====
/* ================= OPENING: waking up in the wreck ================= */
// A new game opens locked in first person. You come to on your back, eyes fluttering, sit up, get to your feet and look
// around through a concussed blur. VESTA then talks to you through the helmet HUD, and the view pulls out of the helmet to
// third person for the first look at yourself (character creation). A or Enter skips ahead to VESTA.
const INTRO={on:false,t:0,phase:'',beat:0,pullT:0};
const WAKE_END=14.5;
function wakeEl(){let el=$('#wake');if(el)return el;el=document.createElement('div');el.id='wake';el.hidden=true;
  el.innerHTML=`<div class="wvig"></div><div class="wvisor"></div>
    <svg class="wcrack" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true"><path d="M318 0 L300 40 L322 72 L296 118 L310 150 M300 40 L262 52 L240 86 M322 72 L358 96 L392 92 M296 118 L270 134 M310 150 L330 190 L318 214"/></svg>
    <div class="whud tl"><b>SUIT REBOOT</b><span data-l="0">CORE ▸ OK</span><span data-l="1">INTEGRITY ▸ <em class="warn">61%</em></span><span data-l="2">O₂ RESERVE ▸ 94%</span><span data-l="3">HEART RATE ▸ <em class="hr">128</em></span></div>
    <div class="whud tr"><span data-l="1">VISOR ▸ <em class="warn">CRACKED</em></span><span data-l="2">COMMS ▸ LOCAL</span><span data-l="3">NAV ▸ NO SIGNAL</span></div>
    <div class="wlink"><span class="dot"></span><span class="wlt">VESTA LINK ▸ ESTABLISHING</span></div>
    <div class="wlid top"></div><div class="wlid bot"></div><div class="wskip"></div>`;
  document.body.appendChild(el);return el;}
function startIntro(){breathing(true);const el=wakeEl();el.hidden=false;el.classList.remove('hudon','linked');INTRO.on=true;INTRO.t=0;INTRO.phase='wake';INTRO.beat=0;INTRO.face=player.face;
  // look toward the burning wreck at one point
  INTRO.wreck=Math.atan2(-60-player.x,150-player.z);
  cam.prevDist=7;cam.dist=1;cam.fp=true;if(avatar)avatar.root.visible=false;cam.pitch=.32;player.act.kind=null;player.act.w=0;$('#hud').hidden=true;$('#hint').style.opacity=0;updateTouchVis();
  el.querySelector('.wskip').textContent=pad.active?'A · skip ahead':isTouch?'Tap to skip ahead':'Enter · skip ahead';
  el.onpointerdown=()=>{if(INTRO.phase==='wake')introSkip();};}
function introSkip(){if(INTRO.phase!=='wake')return;INTRO.t=Math.max(INTRO.t,WAKE_END);}
const _iL=new THREE.Vector3();
function ease(a,b,t0,t1,t){return lerp(a,b,smooth(t0,t1,t));}
// the view for each moment of waking: eye height, where it looks (yaw, pitch), head roll, blur and how open the eyes are
function wakePose(t){const F=INTRO.face,dW=wrapA(INTRO.wreck-F);
  let h=.3,pitch=1.25,yaw=F+Math.sin(t*.4)*.05,roll=.32,blur=9,open=0;
  // eyelids: flutter open, close, open again
  open=t<.6?0:t<1.4?smooth(.6,1.4,t)*.45:t<2?.45-smooth(1.4,2,t)*.4:t<3?.05+smooth(2,3,t)*.95:1;
  blur=lerp(9,4,smooth(0,3.5,t));
  // sit up
  h=ease(h,.92,3.4,6,t);pitch=ease(pitch,-.2,3.4,6,t);roll=ease(roll,.08,3.4,6,t);
  // stand, with a wobble
  h=ease(h,1.62,6.2,8.4,t)+(t>6.2&&t<8.6?Math.sin(t*7)*.02:0);pitch=ease(pitch,.02,6.2,8.4,t);roll=ease(roll,-.06,6.2,8.4,t);blur=ease(blur,2.5,6,8.5,t);
  // look around: the wreck, then the other way, then ahead
  yaw+=ease(0,dW,8.6,10.4,t);yaw+=ease(0,-dW-.9,11.6,13.1,t);yaw+=ease(0,.9,13.2,14.4,t);
  // disoriented: sway, and one dizzy spell where things swim and the eyes half close
  const dz=Math.exp(-Math.pow((t-12.3)/.5,2));roll+=Math.sin(t*1.3)*.05*(t>6?1:0);blur+=(Math.sin(t*2.1)*.5+.5)*1.2*(t>8?1:0)+dz*4;open-=dz*.35;pitch-=dz*.12;
  blur=Math.max(0,blur*(1-smooth(13.6,WAKE_END,t)));
  return {h,pitch,yaw,roll,blur,open:clamp(open,0,1)};}
function setIntroView(o){const eye=player.y+o.h,cp=Math.cos(o.pitch);camera.position.set(player.x,eye,player.z);
  _iL.set(player.x+Math.sin(o.yaw)*cp,eye+Math.sin(o.pitch),player.z+Math.cos(o.yaw)*cp);camera.up.set(0,1,0);camera.lookAt(_iL);camera.rotateZ(o.roll);
  cam.yaw=wrapA(o.yaw-Math.PI);}
// Safari (and every iOS browser) handles a CSS filter on the WebGL canvas badly: it reads the whole frame back every frame.
// There the dazed blur becomes a dimming of the view instead, which costs nothing.
const WEBKIT_BLUR=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||(/AppleWebKit/.test(navigator.userAgent)&&!/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(navigator.userAgent));
function introRes(blur){renderer.domElement.style.opacity=blur>.05?(1-Math.min(blur,9)*.055).toFixed(2):'';}
function setIntroFx(blur,open,vig){const el=$('#wake');if(WEBKIT_BLUR){renderer.domElement.style.filter='';introRes(blur);}else renderer.domElement.style.filter=blur>.05?`blur(${blur.toFixed(2)}px) saturate(${(1-Math.min(blur,8)*.06).toFixed(2)})`:'';
  el.querySelector('.wlid.top').style.transform=`translateY(${(-open*100).toFixed(1)}%)`;el.querySelector('.wlid.bot').style.transform=`translateY(${(open*100).toFixed(1)}%)`;
  el.querySelector('.wvig').style.opacity=vig.toFixed(2);}
function introTick(dt){if(!INTRO.on)return;INTRO.t+=dt;const t=INTRO.t,el=$('#wake');
  if(INTRO.phase==='wake'){const o=wakePose(Math.min(t,WAKE_END));setIntroView(o);setIntroFx(o.blur,o.open,.85-smooth(6,WAKE_END,t)*.45+Math.sin(t*5.5)*.06);
    // heartbeat, a thump on sitting up and landing on the feet
    if(t>INTRO.beat&&t<WAKE_END){INTRO.beat=t+lerp(.75,1.1,smooth(0,12,t));sfx('thump');}
    if(t>3.5&&!INTRO.sat){INTRO.sat=true;sfx('land');}if(t>7.8&&!INTRO.stood){INTRO.stood=true;sfx('land');}
    // the suit's HUD boots line by line as the eyes clear
    if(t>2.2)el.classList.add('hudon');el.querySelectorAll('[data-l]').forEach(s=>s.classList.toggle('on',t>2.4+(+s.dataset.l)*.9));
    el.querySelector('.hr').textContent=Math.round(lerp(132,96,smooth(2,WAKE_END,t))+Math.sin(t*3)*2);
    if(t>=WAKE_END){INTRO.phase='talk';el.classList.add('linked');el.querySelector('.wlt').textContent='VESTA LINK ▸ ONLINE';el.querySelector('.wskip').textContent='';INTRO.talkT=t;sfx('scan');setTimeout(introTalk,700);}
    return;}
  if(INTRO.phase==='talk'){const o=wakePose(WAKE_END),k=t-INTRO.talkT;o.yaw+=Math.sin(k*.35)*.05;o.pitch+=Math.sin(k*.5)*.02;o.roll=-.06+Math.sin(k*.6)*.015;setIntroView(o);setIntroFx(0,1,.35);return;}
  if(INTRO.phase==='pull'){// out of the helmet to a third-person view facing you, where the look screen picks up
    INTRO.pullT+=dt;const u=smooth(0,1,INTRO.pullT/2.2),o=wakePose(WAKE_END),eye=_iA.set(player.x,player.y+o.h,player.z),a=player.face,d=W.interior?2.8:3.4;
    _iB.set(player.x+Math.sin(a)*d,player.y+1.45,player.z+Math.cos(a)*d);
    // swing around the side rather than through the head
    const mid=_iC.copy(eye).lerp(_iB,u);mid.addScaledVector(_iD.set(Math.cos(a),0,-Math.sin(a)),Math.sin(u*Math.PI)*1.4);mid.y+=Math.sin(u*Math.PI)*.35;
    camera.position.copy(mid);camera.up.set(0,1,0);_iL.set(player.x+Math.sin(a)*(1-u)*3,player.y+lerp(o.h,1.05,u),player.z+Math.cos(a)*(1-u)*3);camera.lookAt(_iL);
    el.style.opacity=(1-u).toFixed(2);if(INTRO.pullT>=2.2)endIntro();}}
const _iA=new THREE.Vector3(),_iB=new THREE.Vector3(),_iC=new THREE.Vector3(),_iD=new THREE.Vector3();
// VESTA speaks through the helmet: the conversation fills the visor
function introTalk(){document.documentElement.classList.add('helmetDlg');UI.dlgLock=false;
  const v=(text,opts)=>{say('VESTA','SUIT ASSISTANT · '+(opts.role||'ONLINE'),text,opts.list);UI.dlgLock=true;};
  v('…Suit integrity sixty-one percent. Pilot vitals stable. Hello? Can you hear me?',{role:'REBOOTING',list:[{label:'I… hear you.',fn:()=>{
    v('Good. Don\'t move too fast. The Vesper came down hard, and you hit your head very hard. Do you remember your name?',{list:[{label:'I… don\'t know.',fn:()=>{
      v('Memory loss is common after a blow like that. It should come back. Let\'s start with something simple: the wreck\'s hull plating is polished enough to see yourself in. Take a look.',{list:[{label:'Look at my reflection',go:true,fn:introPull}]});}}]});}}]});}
function introPull(){UI.dlgLock=false;closeDialog();document.documentElement.classList.remove('helmetDlg');INTRO.phase='pull';INTRO.pullT=0;cam.dist=cam.prevDist||7;renderer.domElement.style.filter='';introRes(0);}
function endIntro(){INTRO.on=false;INTRO.phase='';const el=$('#wake');el.hidden=true;el.style.opacity='';renderer.domElement.style.filter='';introRes(0);$('#hud').hidden=false;openLooks(true);updateTouchVis();}

// ===== 64_map.js =====
/* ================= MAP: a real top-down chart of each zone, and fast travel ================= */
// Once per zone visit the zone is rendered straight down with an orthographic camera into the game canvas and copied out
// (inside the frame, before the normal render, so nothing flickers). Sky, effects and the player are hidden, light comes
// from overhead, and indoors a clipping plane takes the ceilings off. The full map and the HUD minimap both draw from it.
const MAPSHOT={req:false,cb:[]};
function requestMapShot(cb){if(cb)MAPSHOT.cb.push(cb);MAPSHOT.req=true;}
const _mapCam=new THREE.OrthographicCamera(-1,1,1,-1,1,4000);
function takeMapShot(){MAPSHOT.req=false;if(!W.group||!W.def){MAPSHOT.cb.length=0;return;}
  const gl=renderer.getContext(),cw=gl.drawingBufferWidth,ch=gl.drawingBufferHeight,N=Math.min(cw,ch,1400),pr=renderer.getPixelRatio();
  const h=W.half;Object.assign(_mapCam,{left:-h,right:h,top:h,bottom:-h});_mapCam.position.set(0,1600,0);_mapCam.up.set(0,0,-1);_mapCam.lookAt(0,0,0);_mapCam.updateProjectionMatrix();
  // hide everything but the zone itself and the lights
  const hid=[];for(const o of scene.children)if(o!==W.group&&!o.isLight&&o.visible){hid.push(o);o.visible=false;}
  const chunks=W.cullChunks||[];for(const c of chunks){for(const m of c.ms)m.visible=true;c.v=undefined;}
  // neutral overhead light, so the chart shows the ground's own colours rather than each zone's tinted sun
  const fog=scene.fog,hi=hemi.intensity,hc=hemi.color.clone(),hg=hemi.groundColor.clone(),si=sun.intensity,scol=sun.color.clone(),sp=sun.position.clone(),st=sun.target.position.clone(),sc=sun.castShadow;
  scene.fog=null;hemi.color.set(0xffffff);hemi.groundColor.set(0x8a8a90);sun.color.set(0xffffff);sun.position.set(60,600,120);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld();sun.castShadow=false;
  if(W.interior)renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,-1,0),W.floorY+2.6)];
  const vp=new THREE.Vector4();renderer.getViewport(vp);renderer.setRenderTarget(null);renderer.setViewport(0,0,N/pr,N/pr);renderer.setScissor(0,0,N/pr,N/pr);renderer.setScissorTest(true);
  const cv=mkCanvas(N);cv.height=N;const cx=cv.getContext('2d');
  // expose: render, measure the ground's brightness, and render again with the light scaled to land it mid-range
  const shot=e=>{hemi.intensity=(W.interior?1.1:.8)*e;sun.intensity=(W.interior?.3:.6)*e;renderer.setClearColor(0x0a0812,1);renderer.clear();renderer.render(scene,_mapCam);
    cx.clearRect(0,0,N,N);cx.drawImage(renderer.domElement,0,ch-N,N,N,0,0,N,N);};
  let e=1;shot(e);for(let pass=0;pass<2;pass++){const m=mapMeter(cv);if(!m)break;let f=clamp(118/Math.max(8,m.mean),.3,3);if(m.clip>.04)f=Math.min(f,.7);if(Math.abs(f-1)<.12)break;e*=f;shot(e);}
  // put everything back
  renderer.setScissorTest(false);renderer.setViewport(vp);renderer.clippingPlanes=[];
  for(const o of hid)o.visible=true;scene.fog=fog;if(fog)renderer.setClearColor(fog.color);hemi.intensity=hi;hemi.color.copy(hc);hemi.groundColor.copy(hg);sun.intensity=si;sun.color.copy(scol);sun.position.copy(sp);sun.target.position.copy(st);sun.target.updateMatrixWorld();sun.castShadow=sc;
  mapLevels(cv);W.mapShot=cv;const cbs=MAPSHOT.cb.splice(0);for(const f of cbs)f();}
// average brightness of the lit ground, and how much of it is blown out to white
function mapMeter(cv){const N=cv.width,c=cv.getContext('2d');let d;try{d=c.getImageData(0,0,N,N).data;}catch(e){return null;}let s=0,n=0,cl=0;
  for(let i=0;i<d.length;i+=4*37){const l=(d[i]*2+d[i+1]*5+d[i+2])>>3;if(d[i]+d[i+1]+d[i+2]<9)continue;s+=l;n++;if(Math.max(d[i],d[i+1],d[i+2])>247)cl++;}return n?{mean:s/n,clip:cl/n}:null;}
// a gentle final stretch of each chart's brightness range
function mapLevels(cv){const c=cv.getContext('2d'),N=cv.width;let D;try{D=c.getImageData(0,0,N,N);}catch(e){return;}const d=D.data,H=new Uint32Array(256);
  for(let i=0;i<d.length;i+=16){const l=(d[i]*2+d[i+1]*5+d[i+2])>>3;if(l>2)H[l]++;}let tot=0;for(const v of H)tot+=v;if(!tot)return;
  const pct=q=>{let a=0;for(let i=0;i<256;i++){a+=H[i];if(a>=tot*q)return i;}return 255;};const lo=pct(.02),hi=Math.max(lo+40,pct(.99));
  const oLo=Math.min(lo,14),oHi=Math.max(hi,215),k=(oHi-oLo)/(hi-lo);if(Math.abs(k-1)<.05)return;
  for(let i=0;i<d.length;i+=4){if(d[i]+d[i+1]+d[i+2]<6)continue;for(let j=0;j<3;j++)d[i+j]=Math.max(0,Math.min(255,(d[i+j]-lo)*k+oLo));}
  c.putImageData(D,0,0);}

/* ---------- fast travel ---------- */
// every place marked ◆ that you've found, in every region and world you've been to, plus each visited region's town
const FT_TOWNS={twilight:['meridian','Meridian Station',0,0],dayward:['kiln','Kiln Hollow',0,180],nightward:['harbor','Cold Harbor',30,-190],anchorage:['promenade','The Promenade',0,22],calder:['reedwater','Reedwater',0,10],ashfall:['shelter','Choir Shelter',-60,-200]};
const FT_ORDER=['twilight','dayward','nightward','anchorage','calder','ashfall'];
const worldOf=id=>['twilight','dayward','nightward'].includes(id)?'twilight':id;// Ossery b's three regions are one world, its landing pad at Meridian
function ftRecord(zone,p){if(!p.ft||String(p.id).startsWith('ship_'))return;G.ft=G.ft||{};(G.ft[zone]=G.ft[zone]||{})[p.id]={n:p.name,x:p.x,z:p.z};}
function ftSync(){if(!W.def)return;for(const p of W.pois)if(G.flags['poi_'+W.id+'_'+p.id])ftRecord(W.id,p);}
function ftList(){const out=[];for(const z of FT_ORDER){if(!G.visited[z]||!ZONES[z])continue;const pts=Object.assign({},G.ft&&G.ft[z]),t=FT_TOWNS[z];
    if(t&&!pts[t[0]])pts[t[0]]={n:t[1],x:t[2],z:t[3]};const L=Object.entries(pts).map(([id,v])=>({id,...v}));if(t)L.sort((a,b)=>(b.id===t[0])-(a.id===t[0]));out.push({zone:z,pts:L});}return out;}
function ftBlocked(){if(W.enemies.some(en=>!en.dead&&en.state==='chase'&&Math.hypot(en.x-player.x,en.z-player.z)<30))return 'You can\'t fast travel while something is hunting you.';
  if(INTRO.on)return 'Not yet.';return '';}
async function fastTravel(zone,id){const why=ftBlocked();if(why){toast(why,'',3000);sfx('deny');return;}
  const pt=(ftList().find(g=>g.zone===zone)||{pts:[]}).pts.find(p=>p.id===id);if(!pt)return;closePanel();sfx('warp');
  const land=()=>{const a=rf(0,6.28);placePlayer(pt.x+Math.cos(a)*6,pt.z+Math.sin(a)*6,a);cam.yaw=wrapA(a+Math.PI);};
  if(zone===W.id){$('#fade').style.opacity=1;setTimeout(()=>{land();$('#fade').style.opacity=0;},450);return;}
  // another world: the Vesper carries you, and stays parked where you land
  const flight=worldOf(zone)!==worldOf(W.id==='vesper'?(G.shipAt||'twilight'):W.id);if(flight&&G.flags.vesperFixed)G.shipAt=worldOf(zone);
  await enterZone(zone,null,{kicker:flight?'THE VESPER · FAST TRAVEL':'FAST TRAVEL',text:pt.n});land();saveSoon();
  if(flight)vesta('Course plotted and flown. The Vesper is parked at '+esc(ZONES[worldOf(zone)].name)+' whenever you need her.',5000);}

/* ---------- drawing the map ---------- */
function pill(c,x,y,text,o={}){c.font=`${o.bold?'600 ':''}${o.size||22}px "Rajdhani","Barlow",Arial,sans-serif`;const w=c.measureText(text).width+20,h=(o.size||22)+10;
  c.fillStyle=o.bg||'rgba(8,10,18,.78)';c.strokeStyle=o.line||'rgba(111,242,214,.45)';c.lineWidth=1.5;const rx=x-w/2,ry=y-h/2,r=h/2;
  c.beginPath();c.moveTo(rx+r,ry);c.arcTo(rx+w,ry,rx+w,ry+h,r);c.arcTo(rx+w,ry+h,rx,ry+h,r);c.arcTo(rx,ry+h,rx,ry,r);c.arcTo(rx,ry,rx+w,ry,r);c.closePath();c.fill();c.stroke();
  c.fillStyle=o.col||'#eafffb';c.textAlign='center';c.textBaseline='middle';c.fillText(text,x,y+1);}
function drawZoneMap(cv){const c=cv.getContext('2d'),S=cv.width,k=S/W.size,P=(x,z)=>[(x+W.half)*k,(z+W.half)*k];
  c.fillStyle='#0a0812';c.fillRect(0,0,S,S);
  if(W.mapShot){c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(W.mapShot,0,0,S,S);}else if(W.mapImg){c.drawImage(W.mapImg,0,0,S,S);}
  // a light chart grade: cool tint, grid every 50 m, darkened edge
  c.fillStyle='rgba(20,40,60,.12)';c.fillRect(0,0,S,S);
  c.strokeStyle='rgba(143,255,240,.10)';c.lineWidth=1;const step=50*k;for(let v=((W.half%50)*k);v<S;v+=step){c.beginPath();c.moveTo(v,0);c.lineTo(v,S);c.stroke();c.beginPath();c.moveTo(0,v);c.lineTo(S,v);c.stroke();}
  const vg=c.createRadialGradient(S/2,S/2,S*.35,S/2,S/2,S*.72);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(4,2,10,.55)');c.fillStyle=vg;c.fillRect(0,0,S,S);
  // exits to other regions
  for(const t of W.travel){const[a,b]=P(t.x,t.z),cx=clamp(a,60,S-60),cy=clamp(b,30,S-30);c.save();c.translate(a,b);c.rotate(Math.atan2(b-S/2,a-S/2));c.fillStyle='#ffc35a';c.shadowColor='#ffc35a';c.shadowBlur=12;
      c.beginPath();c.moveTo(14,0);c.lineTo(-8,-11);c.lineTo(-3,0);c.lineTo(-8,11);c.closePath();c.fill();c.restore();
    pill(c,cx,cy+(cy<S/2?30:-30),'→ '+(ZONES[t.to]?ZONES[t.to].name:''),{col:'#ffd98a',line:'rgba(255,195,90,.6)',size:19});}
  // landmarks you've found
  const disc=W.pois.filter(p=>G.flags['poi_'+W.id+'_'+p.id]);
  for(const p of disc){const[a,b]=P(p.x,p.z),town=p.icon==='town';c.save();c.translate(a,b);c.shadowColor=p.ft?'#6ff2d6':'#ffffff';c.shadowBlur=14;
    if(p.ft){c.rotate(Math.PI/4);c.fillStyle='#6ff2d6';const s=town?13:9;c.fillRect(-s,-s,s*2,s*2);c.strokeStyle='#05302a';c.lineWidth=3;c.strokeRect(-s,-s,s*2,s*2);}
    else{c.fillStyle='#e8e2f4';c.beginPath();c.arc(0,0,7,0,7);c.fill();c.strokeStyle='#1a1329';c.lineWidth=3;c.stroke();}
    c.restore();pill(c,a,b+(town?38:30),p.name,{bold:town,size:town?24:19,col:p.ft?'#c8fff6':'#f0ecf8',line:p.ft?'rgba(111,242,214,.55)':'rgba(220,210,240,.35)'});}
  // people with work for you
  c.textAlign='center';c.textBaseline='middle';for(const n of W.npcs)if(!n.D.crowd&&npcMark(n.id).m){const[a,b]=P(n.x,n.z);c.font='bold 30px sans-serif';c.lineWidth=5;c.strokeStyle='#120c1e';c.strokeText(npcMark(n.id).m,a,b);c.fillStyle='#ffc35a';c.fillText(npcMark(n.id).m,a,b);}
  // tracked task
  const tq=G.track?questTarget(G.track):null;if(tq&&(!tq.zone||tq.zone===W.id)){const[a,b]=P(tq.x,tq.z);c.save();c.translate(a,b);c.rotate(Math.PI/4);c.shadowColor='#ffc35a';c.shadowBlur=18;c.fillStyle='#ffc35a';c.strokeStyle='#1a1329';c.lineWidth=3;c.fillRect(-11,-11,22,22);c.strokeRect(-11,-11,22,22);c.restore();}
  // you
  {const[a,b]=P(player.x,player.z);c.save();c.translate(a,b);const g=c.createRadialGradient(0,0,0,0,0,34);g.addColorStop(0,'rgba(143,255,240,.45)');g.addColorStop(1,'rgba(143,255,240,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,34,0,7);c.fill();
    c.rotate(-player.face+Math.PI);c.fillStyle='#ffffff';c.strokeStyle='#0a2a28';c.lineWidth=3;c.beginPath();c.moveTo(0,-17);c.lineTo(12,12);c.lineTo(0,5);c.lineTo(-12,12);c.closePath();c.fill();c.stroke();c.restore();}
  // compass and scale
  {c.save();c.translate(S-46,46);c.fillStyle='rgba(8,10,18,.7)';c.strokeStyle='rgba(111,242,214,.5)';c.lineWidth=1.5;c.beginPath();c.arc(0,0,30,0,7);c.fill();c.stroke();
    c.fillStyle='#ff8a6a';c.beginPath();c.moveTo(0,-22);c.lineTo(7,0);c.lineTo(-7,0);c.closePath();c.fill();c.fillStyle='#d8e8f0';c.beginPath();c.moveTo(0,22);c.lineTo(7,0);c.lineTo(-7,0);c.closePath();c.fill();
    c.font='600 15px sans-serif';c.fillStyle='#fff';c.textAlign='center';c.fillText('N',0,-36+4);c.restore();}
  {const m=W.size>300?100:W.size>120?50:20,len=m*k;c.fillStyle='rgba(8,10,18,.7)';c.fillRect(20,S-50,len+70,32);c.fillStyle='#c8fff6';c.fillRect(30,S-30,len,4);c.fillRect(30,S-38,2,12);c.fillRect(30+len-2,S-38,2,12);
    c.font='600 16px sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText(m+' m',38+len,S-30);}
  c.strokeStyle='rgba(111,242,214,.35)';c.lineWidth=2;c.strokeRect(1,1,S-2,S-2);}
// travel between regions and worlds is the Vesper's job (her star map); the map only jumps between ◆ points in the region you're in
function renderMap(){ftSync();const box=$('#menuBody');const here=W.id,L=ftList().filter(g=>g.zone===here);
  const groups=L.map(g=>`<div class="ftg${g.zone===here?' here':''}"><div class="ftz"><b>${esc(ZONES[g.zone].name)}</b><small>${esc(ZONES[g.zone].world||'')}${g.zone===here?' · YOU ARE HERE':''}</small></div>${g.pts.map(p=>`<button class="ftb" type="button" data-ft="${g.zone}|${esc(p.id)}"><span class="fd">◆</span>${esc(p.n)}</button>`).join('')}</div>`).join('');
  box.innerHTML=`<div class="mapwrap"><div class="mapc"><canvas id="mapCanvas" width="1024" height="1024"></canvas>
      <p class="note">${esc(W.def.name)} · ${esc(W.def.world||'')}${W.mapShot?'':' · charting…'} <span class="mkey"><i class="k1"></i> fast travel <i class="k2"></i> landmark <i class="k3"></i> your task</span></p></div>
    <div class="ftl"><h3>Fast travel</h3><p class="note">Jump between the ◆ points you've found in this region. To reach other regions and worlds, fly the Vesper.</p>${groups||'<p class="note">Explore to find places marked ◆.</p>'}</div></div>`;
  const cv=$('#mapCanvas');drawZoneMap(cv);if(!W.mapShot)requestMapShot(()=>{if(UI.holo&&UI.tab==='map'&&$('#mapCanvas'))renderMap();});
  box.querySelectorAll('[data-ft]').forEach(e=>e.onclick=()=>{const [z,id]=e.dataset.ft.split('|');fastTravel(z,id);});}

// ===== 70_input.js =====
/* ================= INPUT: keyboard, mouse, touch, controller ================= */
const keys=new Set();
const cam={yaw:0,pitch:.32,dist:9,tx:0,ty:0,tz:0,cur:9,shake:0};
const inp={fireHeld:false,firePressed:false,jumpReq:0,sprintToggle:false};
// zooming all the way in switches to first person; zooming out again returns to third person
const FP_DIST=1.25;
function zoomBy(d){if(UI.custom||UI.title)return;let n=cam.dist+d;if(cam.dist<=FP_DIST&&d>0)n=Math.max(n,2.6);else if(n<2.4&&d<0)n=1;cam.dist=clamp(n,1,20);}
function toggleFP(){if(UI.custom||UI.title)return;if(cam.dist<=FP_DIST)cam.dist=cam.prevDist||7;else{cam.prevDist=cam.dist;cam.dist=1;}}
const MOVE_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',()=>setPadActive(false),true);
addEventListener('keydown',e=>{
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')){if(e.code==='Enter'||e.code==='Escape')e.target.blur();return;}
  const k=e.code;
  if(UI.loading){e.preventDefault();return;}
  if(UI.cpk){if(k==='ArrowUp'||k==='KeyW')cpkMove(-1);else if(k==='ArrowDown'||k==='KeyS')cpkMove(1);else if(k==='ArrowLeft'||k==='KeyA')cpk.row===3?(cpk.btn=0,cpkPaint()):cpkNudge(cpk.row===0?-4:-.03);else if(k==='ArrowRight'||k==='KeyD')cpk.row===3?(cpk.btn=1,cpkPaint()):cpkNudge(cpk.row===0?4:.03);
    else if(k==='Enter'||k==='NumpadEnter')cpkClose(cpk.row===3?cpk.btn===1:true);else if(k==='Escape')cpkClose(false);e.preventDefault();return;}
  if(UI.osk){if(k==='Enter'||k==='Escape')oskDone();else if(k==='Backspace')oskKey('del');else if(e.key.length===1)oskKey(e.key);e.preventDefault();return;}
  if(UI.panel){if(UI.holo&&(k==='KeyQ'||k==='BracketLeft')){holoTab(-1);e.preventDefault();return;}if(UI.holo&&(k==='KeyE'||k==='BracketRight')){holoTab(1);e.preventDefault();return;}
    if(k==='Escape'&&slotConfirm){cancelSlotConfirm();e.preventDefault();return;}
    if(['Escape','KeyI','Tab','KeyH','F1','KeyJ','KeyM','KeyC'].includes(k)){closePanel();e.preventDefault();}return;}
  if(UI.title){if(k==='KeyH'||k==='F1'){openHelp();e.preventDefault();return;}
    if(k==='ArrowUp'||k==='KeyW')titleInput('up');else if(k==='ArrowDown'||k==='KeyS')titleInput('down');else if(k==='Enter'||k==='NumpadEnter'||k==='Space')titleInput('ok');else titleInput('any');e.preventDefault();return;}
  if(UI.dialog){const n=parseInt(e.key,10);
    if((n>=1&&n<=dlgOpts.length||k==='Enter'||k==='NumpadEnter'||k==='Space')&&dialogRevealing()){e.preventDefault();return;}
    if(n>=1&&n<=dlgOpts.length){sfx('click');dlgOpts[n-1].fn();e.preventDefault();}
    else if(k==='Enter'||k==='NumpadEnter'){sfx('click');dlgOpts[0]&&dlgOpts[0].fn();e.preventDefault();}
    else if(k==='Escape'&&!UI.dlgLock)closeDialog();
    else if(MOVE_KEYS.has(k)&&!UI.dlgLock){closeDialog();keys.add(k);e.preventDefault();}
    return;}
  if(INTRO.on){if(k==='Enter'||k==='NumpadEnter'||k==='Space')introSkip();e.preventDefault();return;}
  keys.add(k);
  if(k==='KeyH'||k==='F1'){openHelp();e.preventDefault();return;}
  if(k==='Space'){inp.jumpReq=.15;e.preventDefault();}
  if(k==='KeyF'&&!e.repeat)inp.firePressed=true;
  if(k==='KeyE'&&!e.repeat)interact();
  if(k==='KeyQ'&&!e.repeat)useQuick();
  if((k==='KeyR'||k==='Digit1'&&G.act!=='w1'||k==='Digit2'&&G.act!=='w2')&&!e.repeat)swapWeapon();
  if(k==='Tab'){openMenu();e.preventDefault();}if(k==='KeyI'){openMenu('pack');e.preventDefault();}
  if(k==='KeyC'){openMenu('char');e.preventDefault();}
  if(k==='KeyJ'){openMenu('journal');e.preventDefault();}
  if(k==='KeyM'){openMenu('map');e.preventDefault();}
  if(k==='KeyV'&&!e.repeat)toggleFP();
  if(k==='Equal'||k==='NumpadAdd')zoomBy(-1);if(k==='Minus'||k==='NumpadSubtract')zoomBy(1);
  if(k==='Escape'){openMenu('system');e.preventDefault();}
  if(k.startsWith('Arrow'))e.preventDefault();
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();inp.fireHeld=false;if(!UI.title&&!isTouch)$('#focusMsg').hidden=false;});
addEventListener('focus',()=>{$('#focusMsg').hidden=true;});
document.addEventListener('pointerdown',e=>{try{window.focus();}catch(err){}$('#focusMsg').hidden=true;if(e.pointerType==='touch')setPadActive(false);},true);
const cvs=renderer.domElement;
const joy={id:null,ox:0,oy:0,x:0,y:0};let drag=null;const looks=new Map();let pinch=0;
cvs.addEventListener('pointerdown',e=>{
  if(UI.title)return;
  if(UI.custom){drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),type:e.pointerType,look:true};cvs.setPointerCapture&&cvs.setPointerCapture(e.pointerId);return;}
  if(UI.dialog&&!UI.dlgLock&&e.pointerType==='touch'&&e.clientX<innerWidth*.45)closeDialog();
  if(e.pointerType==='touch'&&e.clientX<innerWidth*.45&&joy.id===null&&!modal()){
    joy.id=e.pointerId;joy.ox=e.clientX;joy.oy=e.clientY;joy.x=joy.y=0;const b=$('#joyBase');b.hidden=false;b.style.left=e.clientX+'px';b.style.top=e.clientY+'px';$('#joyKnob').style.transform='';$('#joyHint').hidden=true;
  }else{looks.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!drag)drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),type:e.pointerType};
    if(e.pointerType==='mouse'&&e.button===0&&!modal())inp.mouseDown=true;
    if(looks.size===2){const [a,b]=[...looks.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}}
  cvs.setPointerCapture&&cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove',e=>{
  if(drag&&drag.look&&e.pointerId===drag.id){UI.lookYaw-=(e.clientX-drag.x)*.012;UI.lookSpin=false;drag.x=e.clientX;drag.y=e.clientY;return;}
  if(e.pointerId===joy.id){let dx=e.clientX-joy.ox,dy=e.clientY-joy.oy;const d=Math.hypot(dx,dy),R=50;if(d>R){dx*=R/d;dy*=R/d;}joy.x=dx/R;joy.y=dy/R;$('#joyKnob').style.transform=`translate(${dx}px,${dy}px)`;return;}
  if(looks.has(e.pointerId))looks.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(looks.size===2){const [a,b]=[...looks.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0){const want=cam.dist*pinch/d;if(Math.abs(want-cam.dist)>.01)zoomBy(want-cam.dist);}pinch=d;return;}
  if(drag&&e.pointerId===drag.id){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;const s=drag.type==='touch'?.008:.005;cam.yaw-=dx*s;cam.pitch=clamp(cam.pitch+dy*s*.7,-.15,1.25);
    if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>8)inp.mouseDrag=true;}
});
const endPtr=e=>{
  looks.delete(e.pointerId);if(looks.size<2)pinch=0;
  if(e.pointerId===joy.id){joy.id=null;joy.x=joy.y=0;$('#joyBase').hidden=true;}
  else if(drag&&e.pointerId===drag.id){if(drag.type==='mouse'&&!drag.look&&e.button===0&&!inp.mouseDrag&&performance.now()-drag.t<260&&!modal())inp.firePressed=true;drag=null;
    if(looks.size){const [id,p]=[...looks.entries()][0];drag={id,x:p.x,y:p.y,sx:p.x,sy:p.y,t:performance.now(),type:'touch'};}}
  if(e.pointerType==='mouse'){inp.mouseDown=false;inp.mouseDrag=false;}};
cvs.addEventListener('pointerup',endPtr);cvs.addEventListener('pointercancel',endPtr);
cvs.addEventListener('wheel',e=>{if(UI.custom)return;zoomBy(e.deltaY*.01);e.preventDefault();},{passive:false});
cvs.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('gesturestart',e=>e.preventDefault());
const bAtk=$('#bAtk');
bAtk.addEventListener('pointerdown',e=>{inp.touchFire=true;inp.firePressed=true;e.preventDefault();});
['pointerup','pointercancel','pointerleave'].forEach(t=>bAtk.addEventListener(t,()=>inp.touchFire=false));
$('#bUse').addEventListener('pointerdown',e=>{e.preventDefault();interact();});
$('#bJump').addEventListener('pointerdown',e=>{e.preventDefault();inp.jumpReq=.15;});
$('#bMed').addEventListener('pointerdown',e=>{e.preventDefault();useQuick();});
$('#bSwap').addEventListener('pointerdown',e=>{e.preventDefault();swapWeapon();});
$('#bSprint').addEventListener('pointerdown',e=>{e.preventDefault();inp.sprintToggle=!inp.sprintToggle;$('#bSprint').classList.toggle('on',inp.sprintToggle);});
function interact(){if(modal()||player.dead||UI.title)return;if(curInter){sfx('click');curInter.act();}}

/* ---------- controllers ---------- */
const padSeen={};
function padList(){try{return navigator.getGamepads?[...navigator.getGamepads()].filter(g=>g&&g.connected):[];}catch(e){pad.blocked=true;return [];}}
function padLive(g){return g.buttons.some(b=>b&&(b.pressed||b.value>.5))||g.axes.some((a,i)=>Math.abs(a)>.5&&Math.abs(a)<=1.01&&!(g.mapping!=='standard'&&i===9));}
// Prefer the controller touched most recently, so phantom or virtual devices listed first are ignored.
function readPad(){let best=null,bt=-1;for(const g of padList()){if(padLive(g))padSeen[g.index]=performance.now();const t=padSeen[g.index]||0;if(t>bt){bt=t;best=g;}}return best;}
// Turn any controller into the standard layout: 0-3 face, 4/5 L/R, 6/7 ZL/ZR, 8/9 minus/plus, 10/11 sticks, 12-15 D-pad.
function padState(g){const now=[];for(let i=0;i<17;i++){const b=g.buttons[i];now[i]=!!(b&&(b.pressed||b.value>.5));}
  let ax=[g.axes[0]||0,g.axes[1]||0,g.axes[2]||0,g.axes[3]||0];
  if(g.mapping!=='standard'){
    for(let i=12;i<17;i++)now[i]=false;
    const hi=g.axes.length>9?9:-1;const hv=hi>=0?g.axes[hi]:2;
    if(hv>=-1.01&&hv<=1.01){const d=Math.round((hv+1)/(2/7))%8;now[12]=d===7||d===0||d===1;now[15]=d>=1&&d<=3;now[13]=d>=3&&d<=5;now[14]=d>=5&&d<=7;}
    if(g.buttons.length>=18&&!(hv>=-1.01&&hv<=1.01)){for(let i=0;i<4;i++){const b=g.buttons[14+i];now[12+i]=!!(b&&b.pressed);}}
    if(g.axes.length>=6&&Math.abs(ax[2])<.05&&Math.abs(ax[3])<.05&&(Math.abs(g.axes[5])>.2||Math.abs(g.axes[4])>.2))ax=[ax[0],ax[1],g.axes[3]||0,g.axes[5]||0];}
  return {now,ax};}
function dead(x,y){const m=Math.hypot(x,y);if(m<.18)return [0,0];const k=Math.min(1,(m-.18)/.82)/m;return [x*k,y*k];}
// a highlight we track ourselves (.psel), since iOS Safari doesn't reliably focus buttons from script
// D-pad and stick move to the nearest button in that direction, so grids and rows navigate the way they look
// what identifies a button across a redraw: its data attributes or id, else its label
function padSig(b){if(!b)return '';const a=[...b.attributes].filter(x=>x.name.startsWith('data-')||x.name==='id').map(x=>x.name+'='+x.value).join('&');return a||b.textContent.trim().slice(0,40);}
// menus redraw themselves when you choose something; put the highlight back on the same button (or the one now in its place)
function padRestore(root,L){const k=pad.keep;if(!k||k.root!==root)return -1;let i=L.findIndex(b=>padSig(b)===k.sig);if(i<0)i=Math.min(k.i,L.length-1);if(i>=0)padMark(L,i);return i;}
function padMenu(root,nav,confirm){let L=padButtons(root);if(!L.length)return;let i=L.findIndex(b=>b.classList.contains('psel'));if(i<0)i=L.indexOf(document.activeElement);if(i<0)i=padRestore(root,L);
  if(nav){if(i<0)i=0;else{const r0=L[i].getBoundingClientRect(),cx=r0.left+r0.width/2,cy=r0.top+r0.height/2;let best=-1,bs=1e9;
      const C=[];L.forEach((b,k)=>{if(k===i)return;const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
        if(nav.y?(nav.y>0?r.top<r0.bottom-4:r.bottom>r0.top+4):(nav.x>0?r.left<r0.right-4:r.right>r0.left+4))return;
        C.push({k,along:nav.x?(x-cx)*nav.x:(y-cy)*nav.y,perp:nav.x?Math.abs(y-cy):Math.abs(x-cx),same:nav.x?(r.top<r0.bottom&&r.bottom>r0.top):true});});
      if(C.length){if(nav.y){// the nearest row first, then the button in it closest to where you are
          const m=Math.min(...C.map(c=>c.along));for(const c of C)if(c.along<=m+18&&c.perp<bs){bs=c.perp;best=c.k;}}
        else{const row=C.filter(c=>c.same),P=row.length?row:C;for(const c of P){const sc=c.along+(row.length?0:c.perp*3);if(sc<bs){bs=sc;best=c.k;}}}}
      if(best>=0)i=best;}
    padMark(L,i);sfx('click');}
  if(i>=0)pad.keep={root,sig:padSig(L[i]),i};
  if(confirm){if(i<0){i=0;padMark(L,0);}L[i].click();L=padButtons(root);if(!L.some(b=>b.classList.contains('psel')))padRestore(root,L);}}
function pollPad(dt){padDiag(dt);
  const g=readPad();pad.fire=false;
  if(!g){pad.on=false;pad.lx=pad.ly=pad.rx=pad.ry=0;pad.prev=[];return;}
  pad.on=true;const st=padState(g),now=st.now;pad.id=g.id;
  const prev=pad.prev,down=i=>now[i]&&!prev[i];pad.prev=now;
  [pad.lx,pad.ly]=dead(st.ax[0],st.ax[1]);[pad.rx,pad.ry]=dead(st.ax[2],st.ax[3]);
  if(now.some(Boolean)||pad.lx||pad.ly||pad.rx||pad.ry)setPadActive(true);
  if(!pad.active)return;
  const dx=(now[15]?1:0)-(now[14]?1:0),dy=(now[13]?1:0)-(now[12]?1:0);pad.dx=dx;pad.dy=dy;
  // menu direction: D-pad first, then whichever stick axis is pushed further
  let vx=dx,vy=dy;if(!vx&&!vy){const sx=Math.abs(pad.lx)>.6?Math.sign(pad.lx):0,sy=Math.abs(pad.ly)>.6?Math.sign(pad.ly):(UI.title&&Math.abs(pad.ry)>.6?Math.sign(pad.ry):0);if(sx&&sy){if(Math.abs(pad.lx)>Math.abs(pad.ly))vx=sx;else vy=sy;}else{vx=sx;vy=sy;}}
  if(vx&&vy)vx=0;const key=vx+','+vy;let nav=null;
  if(vx||vy){if(pad.navT<=0||key!==pad.navKey){nav={x:vx,y:vy};pad.navT=pad.navHeld&&key===pad.navKey?.15:.4;pad.navHeld=true;pad.navKey=key;}else pad.navT-=dt;}else{pad.navT=0;pad.navHeld=false;pad.navKey='';}
  const ok=down(0),back=down(1);
  if(UI.loading)return;
  if(UI.cpk){if(nav&&nav.y)cpkMove(nav.y);const hx=pad.dx||(Math.abs(pad.lx)>.3?pad.lx:0);cpkHold(hx,dt);if(ok){if(cpk.row===3)cpkClose(cpk.btn===1);else cpkClose(true);}else if(back)cpkClose(false);return;}
  if(UI.osk){padMenu('#oskKeys',nav,ok);if(back)oskDone();else if(down(2))oskKey('del');else if(down(3))oskKey(' ');else if(down(9))oskDone();return;}
  if(UI.panel){const root=UI.holo?'#holoBody':'#panelBody';if(UI.holo){if(down(4)){holoTab(-1);return;}if(down(5)){holoTab(1);return;}if(down(6)||down(7)){subTab(down(7)?1:-1);return;}}padMenu(root,nav,ok);if(back&&slotConfirm){cancelSlotConfirm();return;}if(back||down(8)||down(9))closePanel();if(pad.ry)$(root).scrollTop+=pad.ry*dt*800;if(UI.custom&&pad.rx)UI.lookYaw-=pad.rx*dt*2.5;return;}
  if(UI.title){const any=now.some((v,i)=>v&&!prev[i])||Math.abs(pad.lx)>.5||Math.abs(pad.ly)>.5||Math.abs(pad.rx)>.5||Math.abs(pad.ry)>.5;
    if(TT.splash){if(any)titleInput('any');return;}
    if(nav&&nav.y)titleInput(nav.y<0?'up':'down');if(ok)titleInput('ok');if(down(8))openHelp();return;}
  if(UI.dialog){padMenu('#dOpts',nav,ok);if(back&&!UI.dlgLock)closeDialog();return;}
  if(INTRO.on){if(ok)introSkip();return;}
  if(player.dead)return;
  cam.yaw-=pad.rx*dt*2.8;cam.pitch=clamp(cam.pitch+pad.ry*dt*1.8,-.15,1.25);
  pad.fire=now[5]||now[7];if(down(5)||down(7))inp.firePressed=true;
  // buttons follow their printed labels: A (0) uses, B (1) jumps, X (2) recenters, Y (3) swaps
  if(down(1))inp.jumpReq=.15;
  if(down(0)&&curInter)interact();
  if(down(4)||down(6))useQuick();
  if(down(3))swapWeapon();
  if(down(2))cam.yaw=wrapA(player.face+Math.PI);
  if(down(10)){inp.sprintToggle=!inp.sprintToggle;}
  if(now[12])zoomBy(-dt*9);if(now[13])zoomBy(dt*9);
  if(down(11))toggleFP();
  if(down(9))openMenu();if(down(8))openHelp();}
addEventListener('gamepadconnected',e=>{if(e.gamepad&&e.gamepad.mapping!=='standard'&&!UI.title)toast('Controller uses a non-standard layout. Check HELP → Controller check if buttons feel wrong.');if(!UI.title)toast('Controller connected','teal');});
addEventListener('gamepaddisconnected',()=>{if(!readPad()){setPadActive(false);if(!UI.title)toast('Controller disconnected');}});

// ===== 80_main.js =====
/* ================= MAIN: avatar, game loop, saving, boot ================= */
let avatar=null,T=0;
function refreshAvatar(){const pos=avatar?avatar.root.position.clone():new THREE.Vector3(player.x,player.y,player.z),ry=avatar?avatar.root.rotation.y:player.face;
  if(avatar){scene.remove(avatar.root);avatar.dispose&&avatar.dispose();avatar.root.traverse(o=>{if(o.isMesh&&o.material&&o.material.userData&&o.material.userData.own)o.material.dispose();});}
  avatar=buildAvatar(G.look);avatar.root.position.copy(pos);avatar.root.rotation.y=ry;avatar.root.traverse(o=>{if(o.isMesh){o.castShadow=true;}});scene.add(avatar.root);refreshAvatarGear();}
function refreshAvatarGear(){computeStats();if(!avatar)return;const w=activeWeapon();avatar.setWeapon(w?w.id:null);if(avatar.weapon)avatar.weapon.g.traverse(o=>{if(o.isMesh)o.castShadow=true;});lastWeap='';}
function poseAvatarNow(){if(avatar)avatar.root.updateMatrixWorld(true);}
function equipBest(){const take=(slot,pred)=>{if(G.equip[slot])return;const it=G.inv.find(pred);if(it){removeInst(it.u);G.equip[slot]=it;}};
  take('w1',it=>itemKind(it)==='weapon');for(const s of ['helmet','suit','boots','pack'])take(s,it=>itemKind(it)==='gear'&&GEAR[it.id].slot===s);if(!G.equip[G.act])G.act='w1';refreshAvatarGear();}

/* ---------- death ---------- */
function die(){if(player.dead)return;player.dead=true;stopBeam&&stopBeam();updateTouchVis();$('#fade').style.opacity=1;sfx('hurt');
  setTimeout(()=>{const lost=Math.min(200,Math.floor(G.cr*.1));G.cr-=lost;G.hp=PS.maxHp;G.en=PS.maxEn;G.sh=PS.shieldMax;player.dead=false;
    for(const e of W.enemies)if(!e.dead){e.state='wander';e.hp=e.maxHp;e.x=e.hx;e.z=e.hz;}
    const d=W.def,e=(d.entries&&(d.entries.town||d.entries.ship))||d.spawn;placePlayer(e.x,e.z,e.face||0);$('#fade').style.opacity=0;updateTouchVis();
    toast(`You came to at ${d.name}. Medical fees: ${lost} cr.`,'',5000);saveNow();},1800);}

/* ---------- saving ---------- */
const SLOT_KEYS=['tidelock-v2-slot1','tidelock-v2-slot2','tidelock-v2-slot3'];
let saveSlot=0;try{saveSlot=clamp(parseInt(localStorage.getItem('tidelock-v2-slot')||'0',10)||0,0,2);}catch(e){}
function storeSlotIndex(){try{localStorage.setItem('tidelock-v2-slot',String(saveSlot));}catch(e){}}
function readSlot(i){try{const s=localStorage.getItem(SLOT_KEYS[i]);if(!s)return null;const d=JSON.parse(s);return d&&d.v===2?d:null;}catch(e){return null;}}
let playing=false;
function saveNow(){if(!playing||UI.title)return;G.x=player.x;G.z=player.z;G.face=player.face;G.savedAt=Date.now();try{localStorage.setItem(SLOT_KEYS[saveSlot],JSON.stringify(G));}catch(e){}}
function codeHash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function makeCode(d){const b=btoa(unescape(encodeURIComponent(JSON.stringify(d))));return 'TIDELOCK-'+codeHash(b)+'-'+b;}
function readCode(txt){const t=(txt||'').replace(/\s+/g,'');if(!t)return {err:'Paste a save code first.'};
  const m=/^TIDELOCK-([0-9a-z]+)-([A-Za-z0-9+\/=]+)$/.exec(t);if(!m)return {err:'That doesn\'t look like a Tidelock save code. Codes start with TIDELOCK-.'};
  if(codeHash(m[2])!==m[1])return {err:'This code is incomplete or was changed. Copy the whole code and try again.'};
  try{const d=JSON.parse(decodeURIComponent(escape(atob(m[2]))));if(!d||typeof d!=='object'||!d.q||!d.inv)throw 0;if(d.v!==2)return {err:'This code is from an older version of Tidelock and can\'t be loaded into this one.'};return {d};}catch(e){return {err:'This code couldn\'t be read. Copy the whole code and try again.'};}}
function applySave(d){const f=freshState();G=Object.assign(f,d);for(const k of ['equip','flags','zs','visited','buffs','stats','perks','bounties','vendors'])G[k]=Object.assign({},f[k],d[k]||{});G.look=Object.assign(defaultLook(),d.look||{});
  let mx=0;const all=[...G.inv,...Object.values(G.equip).filter(Boolean)];for(const it of all)mx=Math.max(mx,it.u||0);UID=Math.max(UID,mx+1);
  for(const id in G.q)if(!QUESTS[id])delete G.q[id];computeStats();}
function refreshTitle(){const d=readSlot(saveSlot);$('#bCont').hidden=!d;if(d){const m=slotSummary(d);$('#bCont').querySelector('.tl').textContent='CONTINUE';$('#contSub').textContent=`${m.name} · level ${m.lvl} · ${(ZONES[d.zone]||{name:''}).name}${m.ago?' · saved '+m.ago:''}`;}$('#bSlots').hidden=![0,1,2].some(i=>readSlot(i));
  let old=false;try{old=!!(localStorage.getItem('tidelock-save-v1')||localStorage.getItem('tidelock-save-v1-slot2')||localStorage.getItem('tidelock-save-v1-slot3'));}catch(e){}
  if(old&&![0,1,2].some(i=>readSlot(i))&&!$('#ctrlText').innerHTML.includes('rebuilt'))$('#ctrlText').innerHTML+='<br>Tidelock has been rebuilt as a much bigger game, so saves from the earlier version start fresh.';}
async function beginPlay(){cam.dist=Math.max(cam.dist,2.6);initAudio();UI.title=false;$('#title').hidden=true;$('#hud').hidden=false;sizeMap();updateTouchVis();playing=true;lastHud='';lastBuffs='-';lastWeap='';renderTracker();
  $('#hint').style.opacity=1;$('#hint').textContent=isTouch?'Left side: move · Right side: look · Pinch: zoom':'WASD move · Shift sprint · Space jump · Drag to look · F or click: fire · E use · R swap · Q quick item · I pack · J journal · M map';setTimeout(()=>$('#hint').style.opacity=0,14000);}
async function loadGame(d){startSting();breathing(false);applySave(d);refreshAvatar();await enterZone(G.zone,G.entry,{quiet:true});// inside the Vesper, always start on the bridge: saves from older versions of the ship hold positions outside today's decks
  const ok=W.id!=='vesper'&&Number.isFinite(d.x)&&Math.abs(d.x)<W.half&&Math.abs(d.z)<W.half;if(ok)placePlayer(d.x,d.z,d.face||0);else if(W.id==='vesper'){const e=W.def.entries.bridge;placePlayer(e.x,e.z,e.face);}
  migrateGrounded();
  for(const id in G.q)if(G.q[id].st==='active'&&!(G.q[id].p||[]).length)initStage(id);beginPlay();showBanner(W.def.world||'',W.def.name);saveNow();}
async function newGame(){startSting();G=freshState();computeStats();refreshAvatar();playing=false;await enterZone('twilight','crash',{quiet:true,kicker:'OSSERY B',text:'Somewhere on the twilight band…'});
  playing=true;startQuest('m01_wake',true);G.track='m01_wake';beginPlay();const f=$('#fade');f.style.transition='none';f.style.opacity=1;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{f.style.transition='opacity 2.6s';f.style.opacity=0;setTimeout(()=>f.style.transition='',2800);}));
  startIntro();saveNow();}
function afterFirstLooks(){vesta(`Good to meet you, ${nm()}. The Vesper\'s survival case was thrown clear in the crash. It should still be intact. Look for the amber marker.`,9000);renderTracker();saveNow();}
async function quitToTitle(){saveNow();if(UI.dialog)closeDialog();if(UI.panel)closePanel();keys.clear();playing=false;$('#hud').hidden=true;$('#touch').hidden=true;$('#warn').hidden=true;warnState='';
  G=freshState();computeStats();refreshAvatar();await enterZone('twilight','town',{quiet:true,silent:true,kicker:'TIDELOCK',text:'Returning to the title screen…'});showTitle();}

/* ---------- the game loop ---------- */
const _dlgP=new THREE.Vector3(),_dlgL=new THREE.Vector3(),_fpTilt=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.35,.25,-.55)),_fpF=new THREE.Vector3(),_fpV=new THREE.Vector3(),_fpFlip=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
let warnState='',lightT=0,slowT=0,lastBuffKey='',hazT=0,travelArmed=new WeakSet(),autoSaveT=0;
const lightPool=[];
function updateLights(){const L=W.lights||[];if(L.length<=6){if(lightPool!==L){setLights(L);}return;}const ps=player;const s=L.slice().sort((a,b)=>Math.hypot(a.x-ps.x,a.z-ps.z)-Math.hypot(b.x-ps.x,b.z-ps.z));setLights(s.slice(0,6));}
// far-away people and creatures are hidden; skinned models are never frustum-culled by three.js
const meshesOf=o=>o.__meshes||(o.__meshes=(()=>{const L=[];o.traverse(c=>{if(c.isMesh)L.push(c);});return L;})());
function setShadow(o,on){if(o.__sh===on)return;o.__sh=on;for(const m of meshesOf(o))m.castShadow=on;}
function cullFar(){const R=W.interior?80:120;for(const n of W.npcs){const d=Math.hypot(n.x-player.x,n.z-player.z);n.P.root.visible=d<(n.D.crowd?R*.55:R);setShadow(n.P.root,d<28);}
  for(const e of W.enemies){if(e.dead)continue;const d=Math.hypot(e.x-player.x,e.z-player.z),far=d>R+(e.T.ai==='boss'?60:0);if(e.m.g.visible===far)e.m.g.visible=!far;setShadow(e.m.g,d<40||e.T.ai==='boss');}}
function zoneTemp(){if(!W.def||!W.def.tempAt)return 18;if(nearAny(player.x,player.z,W.safe||[]))return clamp(W.def.tempAt(player.x,player.z),2,30);return W.def.tempAt(player.x,player.z);}
const VIEWF=new THREE.Frustum(),_vfM=new THREE.Matrix4(),_vfS=new THREE.Sphere();
function inView(x,y,z,r){_vfS.center.set(x,y,z);_vfS.radius=r;return VIEWF.intersectsSphere(_vfS);}
function viewCull(){camera.updateMatrixWorld();VIEWF.setFromProjectionMatrix(_vfM.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const L=W.cullChunks;if(L)for(const c of L){const v=c.c.distanceToSquared(camera.position)<c.far2&&VIEWF.intersectsSphere(c.s);if(v!==c.v){c.v=v;for(const m of c.ms)m.visible=v;}}}
// inside a town's safe ground (towns are the safe zones), with a little margin so the music doesn't flicker at the edge
function inTown(){const S=W.safe;if(!S||!S.length)return false;const m=MUS.cur==='city'?8:0;return S.some(z=>z.r>=20&&Math.hypot(player.x-z.x,player.z-z.z)<z.r+m);}
function update(dt){viewCull();T+=dt;SFX_TIME.value=T;pollPad(dt);skyMat.uniforms.time.value=T;
  if(UI.title){musicTick(dt,'menu');if(W.id==='twilight'&&!UI.loading)titleUpdate(dt);sky.position.copy(camera.position);BODIES.update(T);FX.update(dt);for(const fn of W.anims)fn(dt);updateNPCs(dt);return;}
  if(UI.loading)return;
  {let fight=false;if(!player.dead&&!W.safeHere)for(const e of W.enemies){if(!e.dead&&e.state==='chase'&&Math.abs(e.x-player.x)<45&&Math.abs(e.z-player.z)<45){fight=true;break;}}musicTick(dt,fight?'fight':inTown()?'city':'world');}
  G.playTime+=dt;const busy=modal();
  if(!player.dead){
    let ix=0,iy=0;
    if(!busy){if(keys.has('KeyW')||keys.has('ArrowUp'))iy+=1;if(keys.has('KeyS')||keys.has('ArrowDown'))iy-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))ix+=1;if(keys.has('KeyA')||keys.has('ArrowLeft'))ix-=1;
      if(joy.id!==null){ix+=joy.x;iy-=joy.y;}if(pad.active){ix+=pad.lx;iy-=pad.ly;}}
    let mag=Math.hypot(ix,iy);if(mag>1){ix/=mag;iy/=mag;mag=1;}
    // seated: any move or jump gets you up; otherwise you stay put
    if(player.sit){if(mag>.35||inp.jumpReq>0){standUp();inp.jumpReq=0;}else{ix=iy=0;mag=0;}}
    const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);const mx=fx*iy+rx*ix,mz=fz*iy+rz*ix;
    const sprint=(keys.has('ShiftLeft')||keys.has('ShiftRight')||inp.sprintToggle)&&mag>.5;const wade=W.water&&player.y<W.water.y-.2;
    const sp=(sprint?8.4:5.4)*PS.speed*(wade?.6:1)*(mag>.05?mag:0)*(player.aimT>0&&!sprint?.85:1);
    player.vx=lerp(player.vx,mx*sp,clamp(dt*10,0,1));player.vz=lerp(player.vz,mz*sp,clamp(dt*10,0,1));
    const p={x:player.x+player.vx*dt,z:player.z+player.vz*dt},st=Math.hypot(p.x-player.x,p.z-player.z);
    if(st>0){const sn=support(p.x,p.z,player.y),rise=sn.y-player.y;if(player.onGround){if(rise>.05&&!(sn.plat&&rise<=STEP)&&rise/st>PS.climb*1.4){p.x=player.x;p.z=player.z;}}else if(rise>.3){p.x=player.x;p.z=player.z;}}
    collide(p,.42);platWalls(p,player.y,.42);player.x=p.x;player.z=p.z;
    inp.jumpReq=Math.max(0,inp.jumpReq-dt);
    if(inp.jumpReq>0&&player.coyote>0&&!busy){player.vy=8.4*Math.sqrt(PS.jump);player.onGround=false;player.coyote=0;inp.jumpReq=0;sfx('jump');}
    const sup=support(player.x,player.z,player.y);
    if(player.onGround&&player.vy<=0&&player.y-sup.y<.6)player.y=sup.y;else{player.vy-=24*dt;player.y+=player.vy*dt;}
    if(W.interior&&player.y>W.ceiling-1.9){player.y=W.ceiling-1.9;player.vy=Math.min(0,player.vy);}
    if(player.y<=sup.y){if(!player.onGround&&player.vy<-7)sfx('land');player.y=sup.y;player.vy=0;player.onGround=true;player.coyote=.12;player.plat=sup.plat;}else{player.onGround=false;player.coyote-=dt;player.plat=null;}
    const spd=Math.hypot(player.vx,player.vz);player.speedAmt=spd;
    player.aimT=Math.max(0,player.aimT-dt);player.lockT=Math.max(0,(player.lockT||0)-dt);player.recoil=Math.max(0,player.recoil-dt*6);player.cd=Math.max(0,player.cd-dt);
    if(player.melee>0){player.melee+=dt*3.6;if(player.melee>=1)player.melee=0;}
    cam.fp=cam.dist<=FP_DIST&&!UI.custom;if(cam.fp!==cam.wasFp){cam.wasFp=cam.fp;$('#reticle').hidden=!cam.fp;applyHudPref();}
    if(cam.fp)player.face=wrapA(cam.yaw+Math.PI);else if(spd>.4&&!(player.lockT>0))player.face+=wrapA(Math.atan2(player.vx,player.vz)-player.face)*clamp(dt*12,0,1);
    // firing
    const mouseHeld=inp.mouseDown&&!inp.mouseDrag&&drag&&performance.now()-drag.t>220;const held=!busy&&(keys.has('KeyF')||mouseHeld||inp.touchFire||pad.fire);
    fireWeapon(dt,held,!busy&&inp.firePressed);inp.firePressed=false;
    // energy, health, shields
    const temp=zoneTemp(),[lo,hi]=safeRange(),over=Math.max(lo-temp,temp-hi);let w='';
    if(over>0&&!busy){G.en-=dt*(5+over*.5);if(G.en<=0){G.en=0;hurtPlayerSoft(dt*(2+over*.18));}w=(temp<lo?'TOO COLD':'TOO HOT')+` · ${Math.round(temp)} °C · SUIT HANDLES ${lo}…${hi} °C · `+(G.en>0?'DRAINING ENERGY':'TAKING DAMAGE')+` · ${temp<lo?'HEAT PACK OR WARMER GEAR':'COOLANT OR COOLER GEAR'}`;}
    else{G.en=Math.min(PS.maxEn,G.en+dt*PS.enRegen*(player.aimT>0?.6:1));if(over>-5&&!nearAny(player.x,player.z,W.safe||[]))w=temp<lo+5?'APPROACHING YOUR SUIT\'S COLD LIMIT':'APPROACHING YOUR SUIT\'S HEAT LIMIT';}
    if(PS.hpRegen)G.hp=Math.min(PS.maxHp,G.hp+PS.hpRegen*dt);if(buffOn('ration'))G.hp=Math.min(PS.maxHp,G.hp+2*dt);
    player.shieldDelay=Math.max(0,(player.shieldDelay||0)-dt);if(PS.shieldMax>0&&player.shieldDelay<=0)G.sh=Math.min(PS.shieldMax,G.sh+PS.shieldMax*.18*dt);
    if(nearAny(player.x,player.z,W.safe||[])&&!W.enemies.some(e=>!e.dead&&e.state==='chase'))G.hp=Math.min(PS.maxHp,G.hp+3*dt);
    // hazards
    let hz=null;if(!busy)for(const h of W.hazards){if(h.test(player.x,player.z,player.y)){if(h.kind==='pit'&&(player.plat||!player.onGround))continue;hz=h;break;}}
    if(hz){if(hz.kind==='pit'||hz.kind==='deep'){if(!player.falling){player.falling=true;if(hz.kind==='pit')hurtPlayerSoft(10);toast(hz.msg||'You fell into the crevasse.');$('#fade').style.opacity=1;setTimeout(()=>{placePlayer(player.lastSafe.x,player.lastSafe.z,player.face);$('#fade').style.opacity=0;player.falling=false;},450);}}
      else{hurtPlayerSoft(dt*hz.dps*(1-armorReduce()*.5));w=hz.msg||'HAZARD';hazT+=dt;if(hz.kind==='lava'&&hazT>.7&&!player.falling){hazT=0;player.falling=true;$('#fade').style.opacity=.7;setTimeout(()=>{placePlayer(player.lastSafe.x,player.lastSafe.z,player.face);$('#fade').style.opacity=0;player.falling=false;},300);}}}
    else{hazT=0;slowT+=dt;if(player.onGround&&slowT>.4){slowT=0;player.lastSafe={x:player.x,z:player.z};}}
    if(w!==warnState){warnState=w;$('#warn').hidden=!w;$('#warn').textContent=w;}
    // buffs
    for(const k in G.buffs){if(G.buffs[k]>0){G.buffs[k]-=dt;if(G.buffs[k]<=0)delete G.buffs[k];}}const bk=Object.keys(G.buffs).filter(k=>['shield','heat','cool','stim','over'].includes(k)).join();if(bk!==lastBuffKey){lastBuffKey=bk;computeStats();}
    // travel triggers and discovery
    for(const t of W.travel){const d=Math.hypot(player.x-t.x,player.z-t.z);if(d>t.r*1.6){travelArmed.add(t);continue;}if(!t.auto||d>t.r||!travelArmed.has(t)||busy)continue;travelArmed.delete(t);
      if(t.ok())enterZone(t.to,t.entry);else{say(t.label,'',t.locked||'You can\'t go that way yet.',[bye('Okay.')]);const a=Math.atan2(player.x-t.x,player.z-t.z);placePlayer(t.x+Math.sin(a)*(t.r*1.8),t.z+Math.cos(a)*(t.r*1.8),a);}}
    for(const p of W.pois){const key='poi_'+W.id+'_'+p.id;if(G.flags[key])continue;if(Math.hypot(player.x-p.x,player.z-p.z)<p.r){G.flags[key]=true;ftRecord(W.id,p);G.stats.discovered++;gainXP(20);toast('Discovered: '+esc(p.name)+(p.ft?' · fast travel point':''),'teal');sfx('scan');saveSoon();}}
  }
  // avatar
  if(player.sit){const s=player.sit;player.x=s.x;player.z=s.z;player.face=s.face;player.vx=player.vz=0;}
  if(avatar){avatar.root.position.set(player.x,player.y-(player.sit?player.sit.drop*avatar.root.scale.y:0),player.z);avatar.root.rotation.y=player.face;avatar.root.visible=!(cam.fp&&!UI.custom);
    const moving=player.speedAmt>.3;tickIdle(player.act,dt,moving||player.aimT>0||!player.onGround||player.dead||(busy&&!UI.custom&&!UI.dialog),['look','neutral','look']);
    if(avatar.anim){const w=activeWeapon(),S=w?WEAPONS[w.id]:null;player.aimW=lerp(player.aimW||0,player.aimT>0&&S&&S.cls!=='melee'?1:0,clamp(dt*12,0,1));
      if(player.melee>0&&!player.meleeFired){player.meleeFired=true;avatar.anim.oneShot(S&&/machete|edge/.test(w.id)?'slash':'punch');}if(player.melee<=0)player.meleeFired=false;
      avatar.anim.update(dt,player.speedAmt,false,{aim:player.aimW,gun:!!(S&&S.cls!=='sidearm'&&S.cls!=='melee')});poseLayers(avatar.B,{look:0,act:player.act},avatar.anim);avatar.holdPose(player.aimW,player.face);if(avatar.gripOne)avatar.gripOne();if(player.sit&&avatar.sitPose)avatar.sitPose(player.face);avatar.sync();avatar.updateWeapon(player.aimW,player.face);}}
  // world
  const paused=busy||player.dead;
  updateNPCs(dt);updateEnemies(dt,paused);if(!paused){updateProjectiles(dt);updateWaves(dt);updatePickups(dt);updateFlares(dt);}
  for(const fn of W.anims)fn(dt);FX.update(dt);
  lightT-=dt;if(lightT<=0){lightT=.5;updateLights();updateQBosses();checkObjectives();cullFar();}
  {const t=performance.now()/1000;LIGHTS.forEach((l,i)=>{const f=l.userData.flicker;if(!f)return;
    // 2: a damaged fitting that buzzes, sags and cuts out for a moment now and then
    if(f===2)l.intensity=l.userData.base*dmgFlick(t,i*3.7+l.position.x);else l.intensity=l.userData.base*(.82+Math.random()*.3);});}
  // sun and sky follow the player
  sun.position.set(player.x+sunDir.x*160,player.y+sunDir.y*160+5,player.z+sunDir.z*160);sun.target.position.set(player.x,player.y,player.z);sun.target.updateMatrixWorld();
  // camera
  cam.dk=lerp(cam.dk||0,UI.dialog&&dlgNpc?1:0,clamp(dt*4,0,1));
  if(UI.custom){if(UI.lookSpin)UI.lookYaw+=dt*.6;const a=player.face+UI.lookYaw,o=window.__lookCam;const d=o?o.d:W.interior?2.8:3.4;camera.position.set(player.x+Math.sin(a)*d,player.y+(o?o.h:1.45),player.z+Math.cos(a)*d);camera.lookAt(player.x,player.y+(o?o.t:1.05),player.z);}
  else if(cam.fp){// first person: the camera sits in the helmet, the weapon is held in view
    const eye=1.62*(avatar?avatar.root.scale.y:1),fp=clamp(cam.pitch-.32,-1.25,1.25),f=_fpF.set(-Math.sin(cam.yaw)*Math.cos(fp),-Math.sin(fp),-Math.cos(cam.yaw)*Math.cos(fp));
    cam.tx=player.x;cam.ty=player.y+1.7;cam.tz=player.z;cam.cur=cam.dist;
    let cx=player.x-Math.sin(cam.yaw)*.12,cy=player.y+eye,cz=player.z-Math.cos(cam.yaw)*.12;if(W.interior)cy=Math.min(cy,W.ceiling-.2);
    if(cam.shake>0){cam.shake-=dt;const k=cam.shake*.3;cx+=(Math.random()-.5)*k;cy+=(Math.random()-.5)*k;cz+=(Math.random()-.5)*k;}
    const bob=player.onGround?Math.sin(T*9)*Math.min(player.speedAmt,6)*.006:0;camera.position.set(cx,cy+bob,cz);camera.lookAt(cx+f.x,cy+bob+f.y,cz+f.z);
    if(cam.dk>.002&&dlgNpc){const n=dlgNpc,fh=n.y+(n.D.look&&n.D.look.body==='robot'?1.05:1.55)*((n.D.look&&n.D.look.scale)||1),k=smooth(0,1,cam.dk);_dlgL.set(lerp(cx+f.x,n.x,k),lerp(cy+f.y,fh,k),lerp(cz+f.z,n.z,k));camera.lookAt(_dlgL);}
    if(avatar&&avatar.weaponG){const wg=avatar.weaponG,q=camera.quaternion;wg.visible=!!avatar.weapon;_fpV.set((avatar.weapon&&avatar.weapon.two?.19:.21)+Math.sin(T*4.5)*Math.min(player.speedAmt,6)*.002,(avatar.weapon&&avatar.weapon.two?-.24:-.2)+bob*.6,(avatar.weapon&&avatar.weapon.two?-.6:-.44)+player.recoil*.07).applyQuaternion(q);
      wg.position.copy(camera.position).add(_fpV);wg.quaternion.copy(q).multiply(_fpFlip);wg.scale.setScalar(1);if(player.melee>0)wg.rotateX(-Math.sin(player.melee*Math.PI)*.9);if(avatar.sleeve)avatar.sleeve.visible=true;}
    if(avatar&&avatar.fpLeft){const L=avatar.fpLeft;cam.holoT=lerp(cam.holoT||0,UI.holo?1:0,clamp(dt*7,0,1));L.visible=cam.holoT>.02;if(L.visible){const k=smooth(0,1,cam.holoT);_fpV.set(-.2,lerp(-.75,-.22,k),-.46).applyQuaternion(camera.quaternion);L.position.copy(camera.position).add(_fpV);L.quaternion.copy(camera.quaternion).multiply(_fpTilt);}}}
  else{if(avatar&&avatar.sleeve)avatar.sleeve.visible=false;if(avatar&&avatar.fpLeft)avatar.fpLeft.visible=false;cam.tx=lerp(cam.tx,player.x,clamp(dt*10,0,1));cam.ty=lerp(cam.ty,player.y+1.7,clamp(dt*8,0,1));cam.tz=lerp(cam.tz,player.z,clamp(dt*10,0,1));
    const cp=Math.cos(cam.pitch),dist=W.interior?Math.min(cam.dist,6.5):cam.dist;let dist2=dist;
    // probe in small steps (thin interior walls) and stop a little short of anything solid
    const N=W.interior?40:16;for(let i=1;i<=N;i++){const t=dist*i/N;const x=cam.tx+Math.sin(cam.yaw)*cp*t,z=cam.tz+Math.cos(cam.yaw)*cp*t,y=cam.ty+Math.sin(cam.pitch)*t;if(solidAt(x,y,z)){dist2=Math.max(1.2,t-(W.interior?.45:dist/12));break;}}
    cam.cur=lerp(cam.cur,dist2,clamp(dt*(dist2<cam.cur?14:3),0,1));
    let cx=cam.tx+Math.sin(cam.yaw)*cp*cam.cur,cz=cam.tz+Math.cos(cam.yaw)*cp*cam.cur,cy=cam.ty+Math.sin(cam.pitch)*cam.cur;
    cy=Math.max(cy,(W.interior?W.floorY:groundY(cx,cz))+.6);if(W.water)cy=Math.max(cy,W.water.y+.4);if(W.interior)cy=Math.min(cy,W.ceiling-.25);
    if(cam.shake>0){cam.shake-=dt;const k=cam.shake*.5;cx+=(Math.random()-.5)*k;cy+=(Math.random()-.5)*k;cz+=(Math.random()-.5)*k;}
    camera.position.set(cx,cy,cz);camera.lookAt(cam.tx,cam.ty,cam.tz);
    // conversations frame the speaker over your shoulder
    if(cam.dk>.002&&dlgNpc){const n=dlgNpc,fh=n.y+(n.D.look&&n.D.look.body==='robot'?1.05:1.55)*((n.D.look&&n.D.look.scale)||1),dx=n.x-player.x,dz=n.z-player.z,d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d,k=smooth(0,1,cam.dk);
      _dlgP.set(player.x-ux*2.3+uz*1.3,player.y+1.8,player.z-uz*2.3-ux*1.3);if(!W.interior||!solidAt(_dlgP.x,_dlgP.y,_dlgP.z))camera.position.lerp(_dlgP,k);_dlgL.set(lerp(cam.tx,n.x,k),lerp(cam.ty,fh,k),lerp(cam.tz,n.z,k));camera.lookAt(_dlgL);}}
  sky.position.copy(camera.position);BODIES.update(T);
  // saving
  if(saveTimer>0){saveTimer-=dt;if(saveTimer<=0){saveTimer=0;saveNow();}}autoSaveT+=dt;if(autoSaveT>10){autoSaveT=0;saveNow();}
}

/* ---------- boot ---------- */
const clock=new THREE.Clock();
// one failing part must never stop the loop: the next frame is booked first, and every stage is guarded on its own
function tlFail(e,where){console.error(where,e);if(!window.__tlErr){window.__tlErr=e;try{toast('Something went wrong ('+where+'): '+String(e&&e.message||e).slice(0,140).replace(/</g,'&lt;'),'',9000);}catch(_){}}}
addEventListener('error',e=>{if(e.error)tlFail(e.error,'script');});addEventListener('unhandledrejection',e=>tlFail(e.reason,'task'));
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();tlFail(new Error('the graphics context was lost (memory)'),'gpu');});
function frame(){requestAnimationFrame(frame);const raw=clock.getDelta(),dt=Math.min(raw,.1)*(window.__tlTimeScale||1);
  try{drsTick(raw);}catch(e){tlFail(e,'resolution');DRS.on=false;}
  try{update(dt);updateHUD(dt);if(MAPSHOT.req)takeMapShot();}catch(e){tlFail(e,'update');}
  // the opening runs on its own clock (real time, so a slow device doesn't stretch it) and keeps going even if something else fails
  if(INTRO.on)try{introTick(Math.min(raw,.25)*(window.__tlTimeScale||1));}catch(e){tlFail(e,'intro');if(INTRO.phase==='wake')INTRO.t=WAKE_END;else if(INTRO.phase==='pull')endIntro();}
  try{renderFrame(dt);}catch(e){tlFail(e,'render');if(POST.composer){POST.composer=null;try{boostAll(false);}catch(_){}}}}
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);resizePost();camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();sizeMap();FX.resize&&FX.resize();if(UI.custom)setLookView();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveNow();});
addEventListener('pagehide',saveNow);
$('#bCont').onclick=()=>{const d=readSlot(saveSlot);if(d)loadGame(d);};
$('#bNew').onclick=()=>{initAudio();if(![0,1,2].some(i=>readSlot(i))){saveSlot=0;storeSlotIndex();newGame();}else openSlots('new');};
$('#bSlots').onclick=()=>{initAudio();openSlots('manage');};
$('#bHelpT').onclick=()=>{initAudio();openHelp();};
$('#ctrlText').innerHTML=(isTouch?'Tap to choose':'<kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> select')+' · Controller: D-pad or stick to choose<span class="pb">A</span>select<span class="pb">B</span>back';
// the build number, small in the bottom corner (title screen and in play), so it's clear which version is running
{const v=document.createElement('div');v.id='buildTag';v.textContent='Tidelock build '+TL_BUILD;Object.assign(v.style,{position:'fixed',left:'50%',transform:'translateX(-50%)',bottom:'calc(env(safe-area-inset-bottom,0px) + 3px)',zIndex:60,font:'600 11px/1 ui-monospace,Menlo,monospace',letterSpacing:'.06em',color:'rgba(220,230,245,.55)',pointerEvents:'none',textShadow:'0 1px 2px #000'});document.body.appendChild(v);}
async function boot(){try{await loadAllModels();envInit();}catch(e){console.error(e);}
  computeStats();refreshAvatar();frame();
  await enterZone('twilight','town',{quiet:true,silent:true,kicker:'TIDELOCK',text:'Loading the Reach…'});
  showTitle();$('#bNew').disabled=false;$('#bNew').querySelector('.tl').textContent='NEW EXPEDITION';window.__tlBooted=true;
  }
if(isTouch)document.documentElement.classList.add('touch');
window.__tidelock={build:TL_BUILD,collide,platWalls,audioState:()=>({ac:!!AC&&AC.state,breath:!!breathSrc,sfx:Object.keys(SFXB).join(",")}),PROJ,MUS,musTracks:()=>Object.fromEntries(Object.entries(TR).map(([k,t])=>[k,{on:t.on,el:!!t.el,g:+t.g.gain.value.toFixed(3),ct:t.el?+t.el.currentTime.toFixed(1):null}])),packState:()=>({packCat,packSel,packSlot}),INTRO,lookTabN:()=>lookTab,cpkS:()=>cpk,padFocus,padButtons,skinBox,envVariants,buildPerson,buildWeaponModel,WEAPONS,W,POST,setBloom,MODELS,spawnProjectile,setHudPref,TT,refreshAvatar,renderer,scene,G:()=>G,W,player,cam,UI,pad,enterZone,placePlayer,startTalk,Bus,checkObjectives,spawnEnemy,fireWeapon,qActive,qDone,countItem,PS,openMenu,openWorkbench,openShop,openStarMap,openLooks,useItem,FX,QUESTS,startQuest,give,newGame,loadGame,saveNow,avatar:()=>avatar,setFlag,completeQuest};
boot();

})();
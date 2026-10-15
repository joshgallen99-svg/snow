import fs from 'fs';
import { encodePNG } from './png.mjs';
const src = ['00_util.js','01_config.js','02_terrain_gen.js'].map(f=>fs.readFileSync('src/'+f,'utf8')).join('\n');
const fn = new Function(src + '\nreturn {generateTerrain, WORLD, RUNS, LIFTS, DIFF, KICKER_SIZES};');
const M = fn();
let t0=Date.now();
const g = M.generateTerrain();
for (const [i,s] of g.steps.entries()) { const a=Date.now(); s(); console.log('step',i,Date.now()-a,'ms'); }
const T = g.finish();
console.log('total', Date.now()-t0, 'ms');
const N=M.WORLD.N, H=T.H;
let mn=1e9,mx=-1e9; for(const v of H){mn=Math.min(mn,v);mx=Math.max(mx,v);} console.log('h range',mn.toFixed(1),mx.toFixed(1));
// run stats
for (const rd of T.runData){
  const {run,path,prof}=rd; let maxG=0, sumG=0, maxCut=0,maxFill=0, steep=[];
  let prev=null;
  for(let i=0;i<path.n;i++){ const [x,z]=path.pts[i]; const y=T.sample(x,z); const nat=prof.nat[i];
    maxCut=Math.max(maxCut,nat-prof.y[i]); maxFill=Math.max(maxFill,prof.y[i]-nat);
    if(prev!==null){const g=(prev-y)/(path.s[i]-path.s[i-1]); if(g>maxG)maxG=g; if(g< -0.02) steep.push(Math.round(path.s[i]));}
    prev=y;}
  const drop=T.sample(...path.pts[0])-T.sample(...path.pts[path.n-1]);
  console.log(run.id.padEnd(12), 'len',path.len.toFixed(0).padStart(5),'drop',drop.toFixed(0).padStart(4),'avg',(drop/path.len*100).toFixed(0)+'%','max',(maxG*100).toFixed(0)+'%','cut',maxCut.toFixed(0),'fill',maxFill.toFixed(0), steep.length? 'UPHILL@'+steep.slice(0,6).join(','):'');
}
// hillshade
const W=768, img=new Uint8Array(W*W*3), sc=(N-1)/W;
for(let y=0;y<W;y++)for(let x=0;x<W;x++){
  const i=Math.floor(x*sc), j=Math.floor(y*sc), k=j*N+i;
  const hx=(H[k+1]-H[k-1>0?k-1:k])/4, hz=(H[k+N<N*N?k+N:k]-H[k-N>0?k-N:k])/4;
  const nx=-hx,ny=1,nz=-hz,l=Math.hypot(nx,ny,nz);
  let sh=Math.max(0,(nx*-0.5+ny*0.7+nz*-0.5)/l/0.95);
  const slope=1-ny/l;
  let c=[235,240,248];
  if(slope>0.3) c=[110,105,100];
  const h=H[k]; if(h<800 && T.runId[k]===255){ c=[c[0]*0.85,c[1]*0.92,c[2]*0.88]; }
  if(T.runId[k]!==255){ const d=M.RUNS[T.runId[k]].diff; const col={green:[60,180,90],red:[220,50,40],black:[30,30,30],double:[30,30,30],park:[255,140,30]}[d]; c=c.map((v,q)=>v*0.85+col[q]*0.15);}
  // contour
  if (Math.floor(h/50)!==Math.floor(H[k+1]/50)) c=c.map(v=>v*0.7);
  const o=(y*W+x)*3; img[o]=Math.min(255,c[0]*(0.35+0.75*sh)); img[o+1]=Math.min(255,c[1]*(0.35+0.75*sh)); img[o+2]=Math.min(255,c[2]*(0.35+0.75*sh));
}
for(const rd of T.runData){ const col={green:[40,160,70],red:[210,40,30],black:[20,20,20],double:[20,20,20],park:[255,140,30]}[rd.run.diff];
  for(const p of rd.path.pts){ const px=Math.round((p[0]+1536)/3072*W), py=Math.round((p[1]+1536)/3072*W); const o=(py*W+px)*3; img[o]=col[0];img[o+1]=col[1];img[o+2]=col[2]; } }
// lifts
for(const L of M.LIFTS){ for(let t=0;t<=1;t+=0.002){ const x=L.a[0]+(L.b[0]-L.a[0])*t, z=L.a[1]+(L.b[1]-L.a[1])*t; const px=Math.round((x+1536)/3072*W), py=Math.round((z+1536)/3072*W); const o=(py*W+px)*3; img[o]=0;img[o+1]=0;img[o+2]=0; } }
fs.writeFileSync('tools/map.png', encodePNG(W,W,img));

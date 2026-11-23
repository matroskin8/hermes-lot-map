// Shared route generation and worker source; embedded before the overlay engine.
const LotMapRouteGenerator = (() => {
'use strict';
const stations=[['you','Вы'],['model','Модель'],['memory','Память'],['files','Файлы'],['shell','Терминал'],['web','Веб'],['browser','Браузер'],['agents','Агенты'],['skills','Навыки'],['hooks','Хуки']];
const locations=[['hermes','HERMES'],...stations];
const point=i=>({x:230+176*Math.sin(i*2*Math.PI/10),y:212-164*Math.cos(i*2*Math.PI/10)});
const position=id=>id==='hermes'?{x:230,y:212}:point(stations.findIndex(x=>x[0]===id));
const obstacles=locations.flatMap(([id,name])=>{const p=position(id);if(id==='hermes')return [{id,type:'circle',x:p.x,y:p.y,r:55}];return [{id,type:'circle',x:p.x,y:p.y,r:36},{id,type:'rect',x:p.x-Math.max(20,name.length*4.2)-4,y:p.y+27,w:2*(Math.max(20,name.length*4.2)+4),h:28}];});
function blocked(p,origin,dest){if(p.x<5||p.x>455||p.y<5||p.y>425)return true;return obstacles.some(o=>o.id!==origin&&o.id!==dest&&(o.type==='circle'?Math.hypot(p.x-o.x,p.y-o.y)<=o.r+2:p.x>=o.x-2&&p.x<=o.x+o.w+2&&p.y>=o.y-2&&p.y<=o.y+o.h+2));}
function clearSegment(a,b,origin,dest){
 if(a.x<5||a.x>455||a.y<5||a.y>425||b.x<5||b.x>455||b.y<5||b.y>425)return false;
 const dx=b.x-a.x,dy=b.y-a.y;
 for(const o of obstacles){if(o.id===origin||o.id===dest)continue;
  if(o.type==='circle'){const t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(a.x+t*dx-o.x,a.y+t*dy-o.y)<=o.r+2)return false;}
  else{let lo=0,hi=1;for(const [v,d,min,max] of [[a.x,dx,o.x-2,o.x+o.w+2],[a.y,dy,o.y-2,o.y+o.h+2]]){if(!d){if(v<min||v>max){lo=1;hi=0;break}}else{let t1=(min-v)/d,t2=(max-v)/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)break}}if(lo<=hi)return false;}
 }return true;
}
// A* generates deterministic alternative candidates; string-pulling and rounded
// quadratic corners are accepted only after collision testing the actual curve.
function route(origin,dest,lane=0){const A=position(origin),B=position(dest),step=5,cols=93,rows=87;const idx=(x,y)=>y*cols+x,xy=k=>({x:(k%cols)*step,y:Math.floor(k/cols)*step});const start=idx(Math.round(A.x/step),Math.round(A.y/step)),goal=idx(Math.round(B.x/step),Math.round(B.y/step));const dist=new Float64Array(cols*rows);dist.fill(Infinity);dist[start]=0;const prev=new Int32Array(cols*rows);prev.fill(-1);let open=[start],closed=new Uint8Array(cols*rows);const side=lane===0?0:(lane%2?1:-1)*Math.ceil(lane/2);const score=k=>{let p=xy(k);return dist[k]+Math.hypot(p.x-B.x,p.y-B.y)};while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(score(open[i])<score(open[bi]))bi=i;const k=open.splice(bi,1)[0];if(closed[k])continue;if(k===goal)break;closed[k]=1;const p=xy(k);for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]){let x=k%cols+dx,y=Math.floor(k/cols)+dy;if(x<1||x>=cols-1||y<1||y>=rows-1)continue;let n=idx(x,y),q=xy(n);if(closed[n]||!clearSegment(p,q,origin,dest))continue;const cross=((q.x-A.x)*(B.y-A.y)-(q.y-A.y)*(B.x-A.x))/(Math.hypot(B.x-A.x,B.y-A.y)||1);const desired=side*28;const bias=Math.min(1,Math.abs(cross-desired)/150)*.65;const center=Math.hypot(q.x-230,q.y-212)/240;const g=dist[k]+Math.hypot(dx,dy)*step*(1+bias+center*.12);if(g<dist[n]){dist[n]=g;prev[n]=k;open.push(n)}}}if(start!==goal&&prev[goal]<0)return null;let points=[B];for(let k=goal;k!==start;k=prev[k])points.push(xy(k));points.push(A);points.reverse();let reduced=[points[0]];for(let i=0;i<points.length-1;){let j=i+1;while(j+1<points.length&&Math.hypot(points[j+1].x-points[i].x,points[j+1].y-points[i].y)<46&&clearSegment(points[i],points[j+1],origin,dest))j++;reduced.push(points[j]);i=j;}
// Trim the endpoints to their visible rims, without changing their stations.
function trim(ps,r){const a=ps[0];while(ps.length>2&&Math.hypot(ps[1].x-a.x,ps[1].y-a.y)<r)ps.splice(1,1);const b=ps[1],d=Math.hypot(b.x-a.x,b.y-a.y);ps[0]={x:a.x+(b.x-a.x)*r/d,y:a.y+(b.y-a.y)*r/d};}trim(reduced,origin==='hermes'?43:26);reduced.reverse();trim(reduced,dest==='hermes'?43:26);reduced.reverse();
// Keep the A* detour as straight segments rather than smoothing its bends.
for(let i=1;i<reduced.length;i++)if(!clearSegment(reduced[i-1],reduced[i],origin,dest))return null;
return `M${reduced[0].x} ${reduced[0].y}`+reduced.slice(1).map(p=>` L${p.x} ${p.y}`).join('');}

// Vary the sampled guide with irregular offsets; only the tested line segments are rendered.
function pathSamples(d){const nums=d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),vertices=[];for(let i=0;i<nums.length;i+=2)vertices.push({x:nums[i],y:nums[i+1]});const lengths=[],total=vertices.slice(1).reduce((n,p,i)=>{const len=Math.hypot(p.x-vertices[i].x,p.y-vertices[i].y);lengths.push(len);return n+len},0);return Array.from({length:21},(_,i)=>{let distance=total*i/20,j=0;while(j<lengths.length-1&&distance>lengths[j])distance-=lengths[j++];const t=lengths[j]?distance/lengths[j]:0,a=vertices[j],b=vertices[j+1];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}});}

// Symmetric nearest-point distance compares geometry, not SVG command strings.
function different(a,b){const directed=(x,y)=>Math.max(...x.map(p=>Math.min(...y.map(q=>Math.hypot(p.x-q.x,p.y-q.y)))));return Math.max(directed(a,b),directed(b,a))>=8;}
function curved(origin,dest,offset){
  const a=position(origin),z=position(dest),dx=z.x-a.x,dy=z.y-a.y,dist=Math.hypot(dx,dy),nx=-dy/dist,ny=dx/dist;
  const b={x:a.x+dx/3+nx*offset,y:a.y+dy/3+ny*offset},c={x:a.x+2*dx/3+nx*offset,y:a.y+2*dy/3+ny*offset};
  const rim=(p,q,r)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);return {x:p.x+(q.x-p.x)*r/d,y:p.y+(q.y-p.y)*r/d}};
  const start=rim(a,b,origin==='hermes'?43:26),end=rim(z,c,dest==='hermes'?43:26);
  const sample=t=>{const u=1-t;return {x:u*u*u*start.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*end.x,y:u*u*u*start.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*end.y}};
  // Use a visibly broken polyline; test the actual straight segments, not a curve.
  const vertices=Array.from({length:8},(_,i)=>{const t=i/7,p=sample(t);if(i===0||i===7)return p;const jitter=Math.sin(i*7.31+offset*.19)*Math.min(13,dist*.055)*Math.sin(Math.PI*t);return {x:p.x+nx*jitter,y:p.y+ny*jitter}});
  // A zero offset would be straight; skip it in favour of bent alternatives.
  if(!offset)return null;
  for(let i=1;i<vertices.length;i++)if(!clearSegment(vertices[i-1],vertices[i],origin,dest))return null;
  const d=`M${vertices[0].x} ${vertices[0].y}`+vertices.slice(1).map(p=>` L${p.x} ${p.y}`).join('');
  return {d,samples:pathSamples(d)};
}

// Bounded, irregular S-shaped alternatives around an unobstructed chord.
// Only actual rendered edges are admitted; blocked chords use existing detours.
function crossing(origin,dest,seed){
 const a=position(origin),b=position(dest),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
 if(len<100||!clearSegment(a,b,origin,dest))return null;
 const nx=-dy/len,ny=dx/len, sign=seed%2?1:-1;
 // Different, deliberately asymmetric zeroes avoid a shared midpoint. Some
 // guides change side twice; one-sided curved alternatives remain available.
 const roots=[[.29],[.39],[.57],[.69],[.30,.68],[.40,.74],[.25,.58],[.47,.76]][Math.floor(seed/2)%8];
 const points=[];
 for(let i=0;i<=16;i++){
  const t=i/16, wave=roots.reduce((v,r)=>v*Math.sin(Math.PI*(t-r)),1);
  const offset=i===0||i===16?0:sign*48*Math.sin(Math.PI*t)*wave*(.9+.1*Math.sin(i*1.7+seed));
  points.push({x:a.x+dx*t+nx*offset,y:a.y+dy*t+ny*offset});
 }
 const rim=(p,q,r)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);return {x:p.x+(q.x-p.x)*r/d,y:p.y+(q.y-p.y)*r/d}};
 // Discard points inside endpoint rims before trimming.
 while(points.length>2&&Math.hypot(points[1].x-a.x,points[1].y-a.y)<(origin==='hermes'?43:26))points.splice(1,1);
 while(points.length>2&&Math.hypot(points.at(-2).x-b.x,points.at(-2).y-b.y)<(dest==='hermes'?43:26))points.splice(-2,1);
 points[0]=rim(a,points[1],origin==='hermes'?43:26);points[points.length-1]=rim(b,points[points.length-2],dest==='hermes'?43:26);
 if(!points.slice(1).every((p,i)=>clearSegment(points[i],p,origin,dest)))return null;
 const d=`M${points[0].x} ${points[0].y}`+points.slice(1).map(p=>` L${p.x} ${p.y}`).join('');
 return {d,samples:pathSamples(d),lane:'cross'+seed};
}

// Independent visibility-graph routes through the central annulus. Nodes are
// real waypoints, never perturbations of production routes. Each edge (and the
// final rim-trimmed edge) is checked analytically against expanded obstacles.
function experimental(origin,destination,variant){
 const A=position(origin), B=position(destination), nodes=[A,B];
 for(const r of [68,100,135,165])for(let i=0;i<16;i++){
  const angle=i*Math.PI/8, p={x:230+r*Math.cos(angle),y:212+r*Math.sin(angle)};
  if(!blocked(p,origin,destination))nodes.push(p);
 }
 const edges=nodes.map(()=>[]);
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],len=Math.hypot(b.x-a.x,b.y-a.y);
  if(len>115||!clearSegment(a,b,origin,destination))continue;
  edges[i].push([j,len]);edges[j].push([i,len]);
 }
 const results=[];
 // Force independent routes through different central anchors rather than merely
 // adjusting costs: small cost changes often select the same straight spoke.
 const anchors=nodes.map((p,i)=>({p,i})).filter(({p,i})=>i>1&&Math.hypot(p.x-230,p.y-212)<145&&Math.hypot(p.x-A.x,p.y-A.y)>30&&Math.hypot(p.x-B.x,p.y-B.y)>30);
 for(let seed=0;seed<Math.min(anchors.length,12);seed++){
  const anchor=anchors[Math.floor(seed*anchors.length/Math.min(anchors.length,12))];
  const n=nodes.length,dist=new Float64Array(n*2);dist.fill(Infinity);dist[0]=0;
  const prev=new Int32Array(n*2);prev.fill(-1);const done=new Uint8Array(n*2);
  // State bit requires this seed's central anchor, not just any waypoint.
  for(let iter=0;iter<n*2;iter++){
   let k=-1;for(let i=0;i<n*2;i++)if(!done[i]&&(k<0||dist[i]<dist[k]))k=i;
   if(k<0||!Number.isFinite(dist[k])||k===n+1)break;
   done[k]=1;const from=k%n,a=nodes[from];
   for(const [to,len] of edges[from]){
    const b=nodes[to],central=to===anchor.i;
    const next=to+((k>=n||central)?n:0);if(done[next])continue;
    const angle=Math.atan2(b.y-a.y,b.x-a.x),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    // Three distinct global objectives: radial spokes, orthogonal switchbacks,
    // and a seeded diagonal lattice. All prefer the central cross to the rim.
    const radial=Math.atan2(mid.y-212,mid.x-230);
    const preference=variant==='shards'?Math.abs(Math.sin(angle-radial))*0.8:
      variant==='switchback'?Math.abs(Math.sin(2*angle))*1.5:
      Math.abs(Math.sin(2*(angle-Math.PI/4)))*1.3;
    const phase=seed*Math.PI/4, side=(mid.x-230)*Math.cos(phase)+(mid.y-212)*Math.sin(phase);
    const center=Math.hypot(mid.x-230,mid.y-212)/165;
    const cost=len*(1+preference+center*.7+Math.max(0,-side/165)*.8);
    if(dist[k]+cost<dist[next]){dist[next]=dist[k]+cost;prev[next]=k}
   }
  }
  let k=n+1;if(!Number.isFinite(dist[k]))continue;const points=[];
  while(k!==-1){points.push(nodes[k%n]);k=prev[k]}points.reverse();
  if(points.length<3)continue;
  const rim=(p,q,r)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);return {x:p.x+(q.x-p.x)*r/d,y:p.y+(q.y-p.y)*r/d}};
  // Drop waypoints within the visible rim before trimming.
  const r1=origin==='hermes'?43:26,r2=destination==='hermes'?43:26;
  while(points.length>2&&Math.hypot(points[1].x-A.x,points[1].y-A.y)<=r1)points.splice(1,1);
  while(points.length>2&&Math.hypot(points[points.length-2].x-B.x,points[points.length-2].y-B.y)<=r2)points.splice(points.length-2,1);
  points[0]=rim(A,points[1],r1);points[points.length-1]=rim(B,points[points.length-2],r2);
  if(!points.slice(1).every((p,i)=>clearSegment(points[i],p,origin,destination)))continue;
  const first=points[0],last=points[points.length-1],dx=last.x-first.x,dy=last.y-first.y,chord=Math.hypot(dx,dy);
  if(!chord||!points.some(p=>Math.abs(dx*(p.y-first.y)-dy*(p.x-first.x))/chord>=1))continue;
  // A visible lightning bend must change direction by at least 30 degrees.
  if(variant==='lightning'&&!points.slice(1,-1).some((p,i)=>{
   const a=points[i],b=points[i+2],ux=p.x-a.x,uy=p.y-a.y,vx=b.x-p.x,vy=b.y-p.y;
   return Math.hypot(ux,uy)>=5&&Math.hypot(vx,vy)>=5&&Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy))>=Math.PI/6;
  }))continue;
  const d=`M${points[0].x} ${points[0].y}`+points.slice(1).map(p=>` L${p.x} ${p.y}`).join(''),samples=pathSamples(d);
  if(results.every(p=>different(samples,p.samples)))results.push({d,samples,lane:variant+seed});
 }
 return results;
}
// Fragment collision-free guide edges into asymmetric angular teeth. Check the
// actual rendered lines, not just the guide, against the expanded obstacles.
function lightning(origin,destination){
 const guides=experimental(origin,destination,'lightning'), results=[];
 for(let seed=0;seed<guides.length;seed++){
  const nums=guides[seed].d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),base=[];
  for(let i=0;i<nums.length;i+=2)base.push({x:nums[i],y:nums[i+1]});
  const points=[base[0]];
  for(let j=1;j<base.length;j++){
   const a=base[j-1],b=base[j],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
   if(len<8){points.push(b);continue}
   let tooth=null;
   for(const side of [1,-1]){
    for(const scale of [1,.7,.45,.25,.12,.06]){
     const count=Math.max(3,Math.ceil(len/17)), candidate=[a];
     for(let k=1;k<count;k++){
      const t=k/count, irregular=.7+((seed*13+j*7+k*11)%9)/20;
      const offset=side*(k%2?1:-1)*Math.min(10,len/count*.8)*irregular*scale;
      candidate.push({x:a.x+dx*t-dy/len*offset,y:a.y+dy*t+dx/len*offset});
     }
     candidate.push(b);
     if(candidate.slice(1).every((p,i)=>clearSegment(candidate[i],p,origin,destination))){tooth=candidate.slice(1);break}
    }
    if(tooth)break;
   }
   points.push(...(tooth||[b]));
  }
  const d=`M${points[0].x} ${points[0].y}`+points.slice(1).map(p=>` L${p.x} ${p.y}`).join(''),samples=pathSamples(d);
  if(results.every(p=>different(samples,p.samples)))results.push({d,samples,lane:'lightning'+seed});
 }
 return results;
}
// Each directed pair keeps its own trail in the worker. A small bias toward the
// preceding path is combined with a rotating lateral preference; a hard length
// cap prevents the trail from turning a short trip into a large detour.
function antRoute(origin,destination,previous,iteration){
 const A=position(origin),B=position(destination),nodes=[A,B],step=20;
 for(let y=10;y<=410;y+=step)for(let x=10;x<=450;x+=step){const p={x,y};if(!blocked(p,origin,destination))nodes.push(p)}
 const edges=nodes.map(()=>[]);
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],len=Math.hypot(a.x-b.x,a.y-b.y);
  if((i>1&&len>29)||(i<2&&j>1&&len>38))continue;
  if(!clearSegment(a,b,origin,destination))continue;
  edges[i].push([j,len]);edges[j].push([i,len]);
 }
 function solve(biased){
  const n=nodes.length,dist=new Float64Array(n),prev=new Int32Array(n),done=new Uint8Array(n);dist.fill(Infinity);prev.fill(-1);dist[0]=0;
  for(let t=0;t<n;t++){
   let k=-1;for(let i=0;i<n;i++)if(!done[i]&&(k<0||dist[i]<dist[k]))k=i;
   if(k<0||!Number.isFinite(dist[k])||k===1)break;done[k]=1;
   for(const [j,len] of edges[k]){if(done[j])continue;const p=nodes[j];
    const near=previous?Math.min(...previous.map(q=>Math.hypot(q.x-p.x,q.y-p.y))):100;
    const phase=iteration*2.399963, wave=Math.sin(p.x*.045+phase)*Math.cos(p.y*.04-phase);
    const factor=biased?1+.12*Math.min(near/55,1)+.10*(wave+1):1;
    const v=dist[k]+len*factor;if(v<dist[j]){dist[j]=v;prev[j]=k}
   }
  }
  if(!Number.isFinite(dist[1]))return null;let k=1,points=[];while(k!==-1){points.push(nodes[k]);k=prev[k]}return points.reverse();
 }
 const length=ps=>ps.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-ps[i].x,p.y-ps[i].y),0);
 const best=solve(false),alternative=solve(true);if(!best)return null;
 let points=alternative&&length(alternative)<=length(best)*1.2?alternative:best;
 // String pulling never cuts through an expanded obstacle.
 const reduced=[points[0]];for(let i=0;i<points.length-1;){let j=points.length-1;while(j>i+1&&!clearSegment(points[i],points[j],origin,destination))j--;reduced.push(points[j]);i=j}points=reduced;
 const rim=(a,b,r)=>{const d=Math.hypot(b.x-a.x,b.y-a.y);return {x:a.x+(b.x-a.x)*r/d,y:a.y+(b.y-a.y)*r/d}};
 const r1=origin==='hermes'?43:26,r2=destination==='hermes'?43:26;
 while(points.length>2&&Math.hypot(points[1].x-A.x,points[1].y-A.y)<r1)points.splice(1,1);
 while(points.length>2&&Math.hypot(points[points.length-2].x-B.x,points[points.length-2].y-B.y)<r2)points.splice(points.length-2,1);
 points[0]=rim(A,points[1],r1);points[points.length-1]=rim(B,points[points.length-2],r2);
 if(!points.slice(1).every((p,i)=>clearSegment(points[i],p,origin,destination)))return null;
 // Build a locally wandering trail around the preceding ant, but constrain its
 // visible length relative to this pair's shortest grid route. The old greedy
 // string-pull erased virtually all of the search's lateral variation.
 const encode=ps=>`M${ps[0].x} ${ps[0].y}`+ps.slice(1).map(p=>` L${p.x} ${p.y}`).join('');
 const limit=length(points)*1.22, base=pathSamples(encode(points));
 const guide=previous&&length(previous)<=limit&&previous.slice(1).every((p,i)=>clearSegment(previous[i],p,origin,destination))?previous:base;
 for(const amplitude of [13,9,5,2]){
  const count=guide.length, candidate=guide.map((p,i)=>{
   if(i===0||i===count-1)return p;
   const before=guide[i-1],after=guide[i+1],dx=after.x-before.x,dy=after.y-before.y,n=Math.hypot(dx,dy)||1;
   const t=i/(count-1),phase=iteration*2.399963;
   const offset=amplitude*Math.sin(Math.PI*t)*(0.65*Math.sin(t*12+phase)+0.35*Math.sin(t*23-phase*1.7));
   return {x:p.x-dy/n*offset,y:p.y+dx/n*offset};
  });
  if(length(candidate)<=limit&&candidate.slice(1).every((p,i)=>clearSegment(candidate[i],p,origin,destination))){points=candidate;break}
 }
 const d=encode(points);
 return {d,samples:pathSamples(d),lane:'ants'+iteration};
}
function moths(origin,destination){
 const guides=experimental(origin,destination,'shards'),results=[];
 for(const guide of guides){
  const nums=guide.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),points=[];
  for(let i=0;i<nums.length;i+=2)points.push({x:nums[i],y:nums[i+1]});
  let accepted=false;
  for(let i=0;i<points.length-1&&!accepted;i++){
   const a=points[i],b=points[i+1],length=Math.hypot(b.x-a.x,b.y-a.y);
   if(length<18)continue;
   const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
   for(const radius of [14,10,7])for(const side of [1,-1]){
    if(accepted)continue;
    const span=8, start=(length-span)/2, loop=[];
    for(let j=0;j<=48;j++){
     const t=j/48,angle=2*Math.PI*t,forward=start+span*t+radius*Math.sin(angle),normal=side*radius*(1-Math.cos(angle));
     loop.push({x:a.x+ux*forward-uy*normal,y:a.y+uy*forward+ux*normal});
    }
    const vertices=[...points.slice(0,i+1),...loop,...points.slice(i+1)];
    if(!vertices.slice(1).every((p,k)=>clearSegment(vertices[k],p,origin,destination)))continue;
    const d=`M${vertices[0].x} ${vertices[0].y}`+vertices.slice(1).map(p=>` L${p.x} ${p.y}`).join(''),samples=pathSamples(d);
    if(results.every(p=>different(samples,p.samples))){results.push({d,samples,lane:'moths'+results.length});accepted=true}
   }
  }
 }
 return results;
}

function lizards(origin,destination){
 const bases=[];
 for(const offset of [55,-55,28,-28,80,-80,110,-110,165,-165]){const p=curved(origin,destination,offset);if(p)bases.push(p.d)}
 if(bases.length<4)for(let lane=0;lane<5;lane++){const d=route(origin,destination,lane);if(d)bases.push(d)}
 const results=[];
 for(let seed=0;seed<bases.length;seed++){
  const n=bases[seed].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),base=[];
  for(let i=0;i<n.length;i+=2)base.push({x:n[i],y:n[i+1]});
  for(const scale of [1,.65,.35]){
   const pts=[base[0]];
   for(let j=1;j<base.length;j++){
    const a=base[j-1],b=base[j],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),count=Math.ceil(len/17);
    for(let k=1;k<count;k++){
     const t=k/count,phase=(j*17+k*13+seed*7),spike=(phase%11===0?11:0),offset=scale*(Math.sin(phase*2.37)*3.5+spike*(phase%2?1:-1));
     pts.push({x:a.x+dx*t-dy/len*offset,y:a.y+dy*t+dx/len*offset});
    }
    pts.push(b);
   }
   if(!pts.slice(1).every((p,i)=>clearSegment(pts[i],p,origin,destination)))continue;
   const d=`M${pts[0].x} ${pts[0].y}`+pts.slice(1).map(p=>` L${p.x} ${p.y}`).join(''),samples=pathSamples(d);
   if(results.every(p=>different(samples,p.samples)))results.push({d,samples,lane:'lizards'+seed});
   break;
  }
 }
 return results;
}

function streams(origin,destination){
 const guides=experimental(origin,destination,'shards');
 for(const guide of guides){
  const nums=guide.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),base=[];
  for(let i=0;i<nums.length;i+=2)base.push({x:nums[i],y:nums[i+1]});
  // Resample uniformly along the guide, so offsets decay to a shared trunk.
  const lengths=base.slice(1).map((p,i)=>Math.hypot(p.x-base[i].x,p.y-base[i].y)),total=lengths.reduce((a,b)=>a+b,0);
  if(!total)continue;
  const count=Math.max(12,Math.ceil(total/5)),raw=[];
  for(let i=0;i<=count;i++){let d=total*i/count,j=0;while(j<lengths.length-1&&d>lengths[j])d-=lengths[j++];const a=base[j],b=base[j+1],t=lengths[j]?d/lengths[j]:0;raw.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})}
  const output=[];
  for(const offset of [0,5,10,15,-5,-10,-15,20,-20]){
   const pts=raw.map((p,i)=>{const a=raw[Math.max(0,i-1)],b=raw[Math.min(count,i+1)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,t=i/count;
    const wave=t<.72?Math.sin(Math.PI*t/.72):0;return {x:p.x-(b.y-a.y)/len*offset*wave,y:p.y+(b.x-a.x)/len*offset*wave}});
   // Chaikin refinement rounds corners without SVG curves (flatten consumers
   // accept only M/L). Reject the whole candidate if any resulting edge clips.
   let smooth=pts;
   for(let pass=0;pass<2;pass++){const next=[smooth[0]];for(let i=1;i<smooth.length;i++){const a=smooth[i-1],b=smooth[i];next.push({x:.75*a.x+.25*b.x,y:.75*a.y+.25*b.y},{x:.25*a.x+.75*b.x,y:.25*a.y+.75*b.y})}next.push(smooth.at(-1));smooth=next}
   if(!smooth.slice(1).every((p,i)=>clearSegment(smooth[i],p,origin,destination)))continue;
   const d=`M${smooth[0].x} ${smooth[0].y}`+smooth.slice(1).map(p=>` L${p.x} ${p.y}`).join(''),samples=pathSamples(d);
   if(output.every(p=>different(samples,p.samples)))output.push({d,samples,lane:'streams'+offset});
  }
  if(output.length>=2)return output;
 }
 return [];
}

function swarm(origin,destination){
 const guide=route(origin,destination,0);if(!guide)return [];
 const nums=guide.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),vertices=[];
 for(let i=0;i<nums.length;i+=2){const p={x:nums[i],y:nums[i+1]},last=vertices[vertices.length-1];if(!last||Math.hypot(p.x-last.x,p.y-last.y)>1e-8)vertices.push(p)}
 const lengths=vertices.slice(1).map((p,i)=>Math.hypot(p.x-vertices[i].x,p.y-vertices[i].y)),total=lengths.reduce((a,b)=>a+b,0);
 const results=[{d:guide,lane:'swarm0'}];
 for(let lane=1;lane<=8;lane++){
  for(const amplitude of [12,8,5,3,1.5]){
   let distance=0,points=[vertices[0]];
   for(let i=0;i<lengths.length;i++){
    const a=vertices[i],b=vertices[i+1],len=lengths[i],parts=Math.max(1,Math.ceil(len/8));
    for(let j=1;j<=parts;j++){
     const t=j/parts,progress=(distance+len*t)/total;
     // Opposite phases guarantee crossings; envelope joins the guide at both rims.
     const offset=amplitude*(lane%2?1:-1)*Math.sin(Math.PI*progress)*Math.sin(2*Math.PI*progress+(Math.floor((lane-1)/2)*.35));
     points.push({x:a.x+(b.x-a.x)*t-(b.y-a.y)/len*offset,y:a.y+(b.y-a.y)*t+(b.x-a.x)/len*offset});
    }distance+=len;
   }
   if(points.slice(1).every((p,i)=>clearSegment(points[i],p,origin,destination))){
    const d=`M${points[0].x} ${points[0].y}`+points.slice(1).map(p=>` L${p.x} ${p.y}`).join('');
    results.push({d,lane:'swarm'+lane});break;
   }
  }
 }
 return results;
}
const workerSource=`'use strict';const stations=${JSON.stringify(stations)},locations=${JSON.stringify(locations)},obstacles=${JSON.stringify(obstacles)};const point=${point.toString()},position=${position.toString()},blocked=${blocked.toString()},clearSegment=${clearSegment.toString()},route=${route.toString()},curved=${curved.toString()},crossing=${crossing.toString()},pathSamples=${pathSamples.toString()},different=${different.toString()},experimental=${experimental.toString()},lightning=${lightning.toString()},antRoute=${antRoute.toString()},moths=${moths.toString()},lizards=${lizards.toString()},streams=${streams.toString()},swarm=${swarm.toString()},trails=new Map();onmessage=e=>{const {key,requestId,origin,destination,variant='production'}=e.data;try{if(variant==='ants'){const trailKey=origin+'→'+destination,trail=trails.get(trailKey),p=antRoute(origin,destination,trail?.samples,trail?.iteration||0);if(p)trails.set(trailKey,{samples:p.samples,iteration:(trail?.iteration||0)+1});postMessage({key,requestId,paths:p?[p]:[]});return}if(variant!=='production'){const generator={moths,lizards,streams,swarm,lightning}[variant];const paths=generator?generator(origin,destination):experimental(origin,destination,variant);postMessage({key,requestId,paths});return}let paths=[];for(let seed=0;seed<16;seed++){const p=crossing(origin,destination,seed);if(p&&paths.every(q=>different(p.samples,q.samples)))paths.push(p)}for(const offset of [0,55,-55,28,-28,80,-80,110,-110,165,-165]){const p=curved(origin,destination,offset);if(p&&!paths.some(q=>q.samples&&Math.max(...p.samples.map((v,i)=>Math.hypot(v.x-q.samples[i].x,v.y-q.samples[i].y)))<8))paths.push({...p,lane:offset})}if(paths.length<4)for(let lane=0;lane<5;lane++){const d=route(origin,destination,lane);if(d){const samples=pathSamples(d);if(paths.every(p=>different(samples,p.samples)))paths.push({d,lane:'astar'+lane,samples})}}postMessage({key,requestId,paths})}catch(error){postMessage({key,requestId,error:String(error)})}}`;
return {clearSegment, workerSource};
})();

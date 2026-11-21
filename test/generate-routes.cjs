// Build-time reference copied from debug/map-debug.html. Usage: node test/generate-routes.cjs <output.json>
const stations=[['you','You'],['model','Model'],['memory','Memory'],['files','Files'],['shell','Terminal'],['web','Web'],['browser','Browser'],['agents','Agents'],['skills','Skills'],['hooks','Hooks']];
let shift=0; const point=i=>({x:230+176*Math.sin((i+shift)*2*Math.PI/10),y:212-164*Math.cos((i+shift)*2*Math.PI/10)});const position=id=>id==='hermes'?{x:230,y:212}:point(stations.findIndex(x=>x[0]===id)); let obstacles;
function blocked(p,origin,dest){if(p.x<5||p.x>455||p.y<5||p.y>425)return true;return obstacles.some(o=>o.id!==origin&&o.id!==dest&&(o.type==='circle'?Math.hypot(p.x-o.x,p.y-o.y)<=o.r+2:p.x>=o.x-2&&p.x<=o.x+o.w+2&&p.y>=o.y-2&&p.y<=o.y+o.h+2));}
function clearSegment(a,b,origin,dest){const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/1.5);for(let i=0;i<=n;i++)if(blocked({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},origin,dest))return false;return true;}
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

const output={}; for(shift of [0,5]){obstacles=[['hermes','HERMES'],...stations].flatMap(([id,name])=>{const p=position(id);return id==='hermes'?[{id,type:'circle',x:p.x,y:p.y,r:55}]:[{id,type:'circle',x:p.x,y:p.y,r:36},{id,type:'rect',x:p.x-45,y:p.y+27,w:90,h:28}]});for(const origin of ['hermes','agents'])for(const [destination] of stations){if(origin===destination)continue;const paths=[];for(const off of [55,-55,28,-28,80,-80,110,-110,165,-165]){const p=curved(origin,destination,off);if(p&&paths.every(q=>different(p.samples,q.samples)))paths.push(p)}if(paths.length<2)for(let lane=0;lane<5;lane++){const d=route(origin,destination,lane);if(d){const samples=pathSamples(d);if(paths.every(p=>different(samples,p.samples)))paths.push({d,samples})}if(paths.length>=2)break}output[shift+':'+origin+':'+destination]=paths.slice(0,4).map(p=>p.d);console.error(shift,origin,destination,paths.length)}} require('fs').writeFileSync(process.argv[2],JSON.stringify(output));

import {Random,type Box,type Truck,type Vec} from './model';
import {interval} from './packing';
/** 평평한 지지면의 최대 빈 사각형을 유지한다. 후보 영역은 겹칠 수 있지만 실제 상자는 겹치지 않는다.
 * 점유 영역을 네 방향으로 빼고 포함된 후보만 제거하므로 L자 빈 공간의 두 배치 가능성을 보존한다.
 * 상자 윗면만 새 지지면으로 추가하며 고정 배치가 없는 전량 복구에서 사용한다. */
export function supportSurfacePack(boxes:Box[],truck:Truck,rng:Random,mode=0){
 type Surface={x:number;y:number;z:number;w:number;d:number};let spaces:Surface[]=[{x:0,y:0,z:0,w:truck.width,d:truck.depth}];const coords:Vec[]=boxes.map(()=>[-1,-1,-1]),order:number[]=[];
 const sorted=boxes.map((b,i)=>({i,key:[b.size[0]*b.size[1],b.size[0]*b.size[1]*b.size[2],b.size[1],b.size[0]][mode%4]*(.98+rng.next()*.04)})).sort((a,b)=>b.key-a.key);
 for(const {i} of sorted){const [w,d,h]=boxes[i].size;let best=Infinity,chosen=-1;
  for(let j=0;j<spaces.length;j++){const s=spaces[j];if(w>s.w||d>s.d||s.z+h>truck.height)continue;
   const score=mode<4?Math.min(s.w-w,s.d-d)*1e8+Math.max(s.w-w,s.d-d)*1e4+s.z:mode<8?s.w*s.d-w*d+s.z*.01:s.z*1e9+s.w*s.d;
   if(score<best){best=score;chosen=j;}}
  if(chosen<0)continue;const slot=spaces[chosen],x=slot.x,y=slot.y+slot.d-d,z=slot.z;coords[i]=[x,y,z];order.push(boxes[i].id);
  const next:Surface[]=[];
  for(const s of spaces){const left=Math.max(s.x,x),right=Math.min(s.x+s.w,x+w),front=Math.max(s.y,y),back=Math.min(s.y+s.d,y+d);
   if(s.z>=z+h||left>=right||front>=back){next.push(s);continue;}
   if(left>s.x)next.push({...s,w:left-s.x});if(right<s.x+s.w)next.push({...s,x:right,w:s.x+s.w-right});if(front>s.y)next.push({...s,d:front-s.y});if(back<s.y+s.d)next.push({...s,y:back,d:s.y+s.d-back});
  }
  if(z+h<truck.height)next.push({x,y,z:z+h,w,d});
  spaces=next.filter((a,j)=>!next.some((b,k)=>j!==k&&a.z===b.z&&b.x<=a.x&&b.y<=a.y&&b.x+b.w>=a.x+a.w&&b.y+b.d>=a.y+a.d&&(k<j||b.w*b.d>a.w*a.d)));
 }
 return {coords,repaired:true,loadOrder:dependencyLoadingOrder(boxes,coords)??order};
}

/** 받침은 먼저, 입구를 막을 상자는 나중에 싣는 의존 그래프를 위상 정렬한다.
 * 순환이면 이 모델의 무재이동 상차 순서를 만들 수 없으므로 null을 반환한다. 경계/지지는 평가기가 재검사한다. */
export function dependencyLoadingOrder(boxes:Box[],coords:Vec[]):number[]|null {
 const n=boxes.length;if(coords.length!==n||coords.some(p=>p[0]<0))return null;
 const incoming=new Int32Array(n),next:number[][]=Array.from({length:n},()=>[]);
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  if(i===j)continue;const a=coords[i],b=coords[j],as=boxes[i].size,bs=boxes[j].size;
  const supports=a[2]+as[2]===b[2]&&interval(a[0],as[0],b[0],bs[0])&&interval(a[1],as[1],b[1],bs[1]);
  const blocks=b[1]<a[1]&&interval(a[0],as[0],b[0],bs[0])&&interval(a[2],as[2],b[2],bs[2]);
  if(supports||blocks){next[i].push(j);incoming[j]++;}
 }
 const available=boxes.map((_,i)=>i).filter(i=>!incoming[i]),order:number[]=[];
 while(available.length){available.sort((a,b)=>coords[a][1]-coords[b][1]||boxes[b].id-boxes[a].id);const i=available.pop()!;order.push(boxes[i].id);for(const j of next[i])if(!--incoming[j])available.push(j);}
 return order.length===n?order:null;
}

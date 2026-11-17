import {Random,type Box,type Vec,type Truck,type Evaluation,type MoveEvent} from '../domain/model';
import {validateLayout,interval,supported,partitionPack,type Placed} from '../domain/packing';
import {priorityOrder} from '../domain/priority';import {freeRegions,occupy,type Region} from '../domain/spaces';

/** 하차 동안 현재 위치의 관계만 갱신한다. 활성 비트로 임시 이동을 표현해 전 배열 복제를 줄인다. */
export function* priorityUnloadSteps(boxes:Box[],coords:Vec[],truck:Truck,trace=true):Generator<void,Evaluation,void>{
 const reason=validateLayout(boxes,coords,truck),result:Evaluation={valid:!reason,reason:reason??'',moves:0,mass:0,delivered:0,events:[]};if(reason)return result;
 if(new Set(boxes.map(b=>b.id)).size!==boxes.length||boxes.some(b=>!Number.isFinite(b.priority)||b.priority<1||b.priority>5)){result.valid=false;result.reason='상자 ID 또는 우선도(1–5)가 올바르지 않습니다.';return result;}
 const n=boxes.length,index=new Map(boxes.map((b,i)=>[b.id,i])),active=new Uint8Array(n).fill(1),delivered=new Uint8Array(n),block=new Uint8Array(n*n),support=new Uint8Array(n*n),full=new Uint8Array(n*n);
 let pos=coords.map(p=>[...p] as Vec),stamp=boxes.map((_,i)=>i),serial=n,activeCount=n;
 const heights=new Map<number,number>();
 const height=(i:number,delta:number)=>{const z=pos[i][2]+boxes[i].size[2],count=(heights.get(z)??0)+delta;if(count)heights.set(z,count);else heights.delete(z);};
 const relation=(i:number,j:number)=>{
  const a=pos[i],b=pos[j],as=boxes[i].size,bs=boxes[j].size,xy=interval(a[0],as[0],b[0],bs[0])&&interval(a[1],as[1],b[1],bs[1]),at=i*n+j;
  block[at]=+(i!==j&&b[1]<a[1]&&interval(a[0],as[0],b[0],bs[0])&&interval(a[2],as[2],b[2],bs[2]));
  support[at]=+(i!==j&&a[2]===b[2]+bs[2]&&xy);full[at]=+(!!support[at]&&b[0]<=a[0]&&b[0]+bs[0]>=a[0]+as[0]&&b[1]<=a[1]&&b[1]+bs[1]>=a[1]+as[1]);
 };
 const rebuild=()=>{heights.clear();activeCount=0;for(let i=0;i<n;i++){if(active[i]){height(i,1);activeCount++;}for(let j=0;j<n;j++)relation(i,j);}};rebuild();
 const object=(i:number):Placed=>({box:boxes[i],pos:pos[i]});
 const isSupported=(i:number,ignore=-1)=>{if(pos[i][2]===0)return true;const parts:Placed[]=[];for(let j=0;j<n;j++)if(j!==ignore&&active[j]&&support[i*n+j]){if(full[i*n+j])return true;parts.push(object(j));}return parts.length>1&&supported(object(i),parts);};
 const canInsert=(i:number,p:Vec)=>{
  const size=boxes[i].size;if(p[0]<0||p[1]<0||p[2]<0||p[0]+size[0]>truck.width||p[1]+size[1]>truck.depth||p[2]+size[2]>truck.height)return false;
  let supportedWhole=p[2]===0;const parts:Placed[]=[];
  for(let j=0;j<n;j++)if(active[j]){
   const b=pos[j],bs=boxes[j].size,overlapX=interval(p[0],size[0],b[0],bs[0]);
   if(overlapX&&interval(p[2],size[2],b[2],bs[2])&&(b[1]<p[1]||interval(p[1],size[1],b[1],bs[1])))return false;
   if(!supportedWhole&&b[2]+bs[2]===p[2]&&overlapX&&interval(p[1],size[1],b[1],bs[1])){if(b[0]<=p[0]&&b[0]+bs[0]>=p[0]+size[0]&&b[1]<=p[1]&&b[1]+bs[1]>=p[1]+size[1])supportedWhole=true;else parts.push(object(j));}
  }
  return supportedWhole||(parts.length>1&&supported({box:boxes[i],pos:p},parts));
 };
 const record=(kind:MoveEvent['kind'],i:number,to:Vec|null)=>{if(kind!=='deliver'){result.moves++;result.mass=Math.round((result.mass+boxes[i].weight)*10)/10;}if(trace)result.events.push({kind,boxId:boxes[i].id,from:kind==='return'?null:[...pos[i]],to:to?[...to]:null,moves:result.moves,mass:result.mass});};
 const activate=(i:number,p:Vec)=>{if(p.some((v,k)=>v!==pos[i][k])){pos[i]=[...p];for(let j=0;j<n;j++){relation(i,j);relation(j,i);}}active[i]=1;activeCount++;stamp[i]=serial++;height(i,1);};
 const activeObjects=()=>boxes.map((_,i)=>i).filter(i=>active[i]).sort((a,b)=>stamp[a]-stamp[b]).map(object);
 for(const target of priorityOrder(boxes)){
  const targetIndex=index.get(target.id)!,pending:number[]=[],visiting=new Uint8Array(n);
  const extract=(i:number,delivery:boolean):boolean=>{
   if(!active[i]||visiting[i])return false;visiting[i]=1;
   try{while(true){let dep=-1,obstruction=-1;
    for(let j=0;j<n;j++)if(j!==i&&active[j]){
     if(support[j*n+i]&&(dep<0||boxes[j].id<boxes[dep].id)&&!isSupported(j,i))dep=j;
     if(block[i*n+j]&&(obstruction<0||pos[j][1]<pos[obstruction][1]||pos[j][1]===pos[obstruction][1]&&(pos[j][2]>pos[obstruction][2]||pos[j][2]===pos[obstruction][2]&&boxes[j].id<boxes[obstruction].id)))obstruction=j;
    }
    const next=dep>=0?dep:obstruction;if(next<0)break;if(!extract(next,false))return false;
   }
   height(i,-1);active[i]=0;activeCount--;record(delivery?'deliver':'out',i,null);if(delivery){delivered[i]=1;result.delivered++;}else pending.push(i);return true;
   }finally{visiting[i]=0;}
  };
  if(!extract(targetIndex,true)){result.valid=false;result.reason='직선 인출·지지 의존 순환으로 하차할 수 없습니다.';return result;}
  const snapshot={pos:[...pos],active:active.slice(),stamp:[...stamp],serial,pending:[...pending],events:result.events.length,moves:result.moves,mass:result.mass};
  pending.sort((a,b)=>pos[b][1]+boxes[b].size[1]-pos[a][1]-boxes[a].size[1]||pos[a][2]-pos[b][2]);
  let regions:Region[]|null=null,failed=false;
  const replacement=(i:number):Vec|null=>{
   if(canInsert(i,pos[i]))return pos[i];
   for(const z of [...new Set([0,...heights.keys()])].filter(z=>z<pos[i][2]).sort((a,b)=>a-b)){const p:Vec=[pos[i][0],pos[i][1],z];if(canInsert(i,p))return p;}
   if(!regions)regions=freeRegions(activeObjects(),truck);
   for(const r of regions.slice().sort((a,b)=>a.z-b.z||b.y+b.d-a.y-a.d||a.x-b.x)){
    const size=boxes[i].size;if(size[0]>r.w||size[1]>r.d||size[2]>r.h)continue;
    for(const x of [r.x,r.x+r.w-size[0]])for(const y of [r.y+r.d-size[1],r.y]){const p:Vec=[x,y,r.z];if(canInsert(i,p))return p;}
   }return null;
  };
  while(pending.length){let found=false;for(let j=0;j<pending.length;j++){const i=pending[j],p=replacement(i);if(!p)continue;record('return',i,p);activate(i,p);if(regions)regions=occupy(regions,object(i));pending.splice(j,1);found=true;break;}if(!found){failed=true;break;}}
  if(failed){
   pos=snapshot.pos;active.set(snapshot.active);stamp=snapshot.stamp;serial=snapshot.serial;pending.splice(0,pending.length,...snapshot.pending);result.events.length=snapshot.events;result.moves=snapshot.moves;result.mass=snapshot.mass;rebuild();
   const waiting=boxes.filter((_,i)=>!delivered[i]),planner=new Random(Math.imul(target.id,2654435761)>>>0);let plan:ReturnType<typeof partitionPack>|null=null;
   for(let attempt=0;attempt<32;attempt++){const candidate=partitionPack(waiting,truck,planner);if(candidate.coords.every(p=>p[0]>=0)){plan=candidate;break;}}
   if(plan){while(activeCount){let first=-1;for(let i=0;i<n;i++)if(active[i]&&(first<0||pos[i][2]>pos[first][2]||pos[i][2]===pos[first][2]&&(pos[i][1]<pos[first][1]||pos[i][1]===pos[first][1]&&boxes[i].id<boxes[first].id)))first=i;if(!extract(first,false))break;}
    if(!activeCount){failed=false;const places=new Map(waiting.map((b,i)=>[b.id,plan!.coords[i]]));for(const id of plan.loadOrder){const i=index.get(id)!,p=places.get(id)!;if(active[i]||!canInsert(i,p)){failed=true;break;}record('return',i,p);activate(i,p);}}
   }
   if(failed){result.valid=false;result.reason='임시 이동 상자의 안전한 복귀 위치가 없습니다.';return result;}
  }
  yield;
 }
 // 모든 고유 상자의 배송 완료와 짐칸 내부 잔여0을 확인한다. 임시 이동은 배송으로 세지 않는다.
 if(result.delivered!==n||activeCount!==0||delivered.some(value=>!value)){result.valid=false;result.reason='모든 상자의 우선순 하차가 완료되지 않았습니다.';}
 return result;
}

# SW_Browser_Unloading_001 — 하차평가

> 2026-11-17 01:37:10 (KST) 최신 웹 기준: 전량적재를통과한뒤우선도순하차의재이동비용을최적화한다.사용자승인‘ㅇㅇ’.이하과거상차복원기록은당시기준이며현재목적은 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md` 참조.


> 2026-11-16 21:20:39 (KST) 현재 기준: 현재 앱에서 호출하지 않는 첫 배포의 참조 하차 모듈이다. 이후 기능 설명은 당시 기록일 수 있으며 최신 기준은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`.

- 버전: v0.0.1
- 최초 작성: 2026-11-16 20:53:14 (KST)
- 지시자: 이종인 / 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Unloading_001
- 실행환경: Browser. 기술환경은 Info/기술환경.md 참조.

### `src/simulation/unload.ts`

```tsx
import {type Box,type Vec,type Truck,type Evaluation,type MoveEvent,type Weights,Random} from '../domain/model';
import {type Placed,validateLayout,blockers,supported,fits,interval,randomPosition} from '../domain/packing';
import {priorityOrder} from '../domain/priority';
import {priorityUnloadSteps} from './priorityUnload';

/** 고정된 우선도 순 하차. 상자 사이에 yield하여 큰 입력도 중단 명령을 처리한다.
 * recover=true는 복귀 실패 시 추가 적재물을 꺼내 안전하게 다시 싣고 그 비용도 기록한다. */
export function* simulateSteps(boxes:Box[],coords:Vec[],truck:Truck,trace=true,recover=false):Generator<void,Evaluation,void> {
 if(recover)return yield* priorityUnloadSteps(boxes,coords,truck,trace);
 const reason=validateLayout(boxes,coords,truck),result:Evaluation={valid:!reason,reason:reason??'',moves:0,mass:0,delivered:0,events:[]};
 if(reason)return result;
 let remaining:Placed[]=boxes.map((box,i)=>({box,pos:[...coords[i]]}));const delivered=new Set<number>(),rng=new Random(0);
 const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null)=>{
  if(kind!=='deliver'){result.moves++;result.mass=Math.round((result.mass+p.box.weight)*10)/10;}
  if(trace)result.events.push({kind,boxId:p.box.id,from:kind==='return'?null:[...p.pos],to:to?[...to]:null,moves:result.moves,mass:result.mass});
 };
 for(const target of priorityOrder(boxes)){
  const pending:Placed[]=[];
  const extract=(id:number,delivery:boolean,stack:Set<number>):boolean=>{
   if(stack.has(id))return false;const p=remaining.find(b=>b.box.id===id);if(!p)return false;stack.add(id);
   try{
    while(true){
     const without=remaining.filter(b=>b.box.id!==id);
     // 제거 직전 배치는 유효하다. 지지를 잃을 수 있는 것은 이 상자 윗면에 닿는 적재물뿐이다.
     let dependent:Placed|undefined;
     for(const b of without)if(b.pos[2]===p.pos[2]+p.box.size[2]&&interval(p.pos[0],p.box.size[0],b.pos[0],b.box.size[0])&&interval(p.pos[1],p.box.size[1],b.pos[1],b.box.size[1])&&(!dependent||b.box.id<dependent.box.id)&&!supported(b,without))dependent=b;
     const obstruction=dependent?undefined:blockers(p,remaining).sort((a,b)=>a.pos[1]-b.pos[1]||b.pos[2]-a.pos[2]||a.box.id-b.box.id)[0];
     const first=dependent??obstruction;if(!first)break;if(!extract(first.box.id,false,stack))return false;
    }
    remaining=remaining.filter(b=>b.box.id!==id);record(delivery?'deliver':'out',p,null);
    if(delivery){result.delivered++;delivered.add(id);}else pending.push(p);return true;
   }finally{stack.delete(id);}
  };
  if(!extract(target.id,true,new Set())){result.valid=false;result.reason='직선 인출·지지 의존 순환으로 하차할 수 없습니다.';return result;}
  pending.sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]);
  let restoreFailed=false;
  while(pending.length){
   let found=false;
   for(let i=0;i<pending.length;i++){
    const p=pending[i],pos=fits(p.box,p.pos,remaining,truck)&&!blockers(p,remaining).length?p.pos:randomPosition(p.box,remaining,truck,rng,true,true);
    if(!pos)continue;record('return',p,pos);remaining.push({box:p.box,pos});pending.splice(i,1);found=true;break;
   }
   if(!found){restoreFailed=true;break;}
  }
  if(restoreFailed){result.valid=false;result.reason='임시 이동 상자의 안전한 복귀 위치가 없습니다.';return result;}
  yield;
 }
 return result;
}
/** 동기 테스트·화면 재생은 동일한 하차 생성기를 끝까지 실행한다. */
export function simulate(boxes:Box[],coords:Vec[],truck:Truck,trace=true,recover=false):Evaluation {
 const it=simulateSteps(boxes,coords,truck,trace,recover);let r=it.next();while(!r.done)r=it.next();return r.value;
}
/** PPT 기준 100 - 10×횟수 - 1×중량. 무효 배치는 선택할 수 없다. */
export function fitness(e:Pick<Evaluation,'valid'|'moves'|'mass'>,weights:Weights):number{return e.valid?Math.round((weights.base-weights.moves*e.moves-weights.mass*e.mass)*100)/100:-Infinity;}
```

## 2026-11-16 20:53:14 (KST) 현재 목적·입출력·호출·검증

하차 우선순위는 고정하고 방해 상자의 이동 횟수와 이동 중량을 최소화하는 배치를 탐색한다. 상부 하중은 별도 안정성 항목이다. 소스 타입·함수 주석과 실제 분기가 입력·단위·반환값·예외의 기준이며 구현 코드 전체를 위에 보존했다. Engine.evaluate→실제 상차→simulateLoaded 및 evaluateStackLoad→unloadingFitness, Worker와 비교 실험에서 호출한다. App은 동일 하차 평가기를3D 재생에 사용한다. 실제 적재물만 하차하고 미적재는 별도 표시한다.

총51개 검사·빌드 성공 및 소형27조건 비교 실험 예산 일치를 확인했다. 직접 브라우저 조작 미확인, 하중은 kg 상당의 사용자 정의 근사 규칙이다. 상세 계산·전후 변경·실측값·한계·관련기능은 `Info/plan/2026-11-16/205314_우선순위하차최적화와상부하중평가_plan.md`. 이전 상차 목적·하차 보류 기록은 당시 기록이며 이번 확정으로 대체한다.

## 2026-11-16 21:20:39 (KST) 첫 배포 복원

사용자가 첫 배포 상차 버전으로 복원하고 상자 할당 입력만 유지하도록 명시했다. 위 코드 스냅샷은 현재 복원본이다.24개 테스트·빌드 성공. 상세 복원 범위·초기값·제한·관련 기록은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`. 이전 구현·검증·보류·재승인은 당시 기록으로 보존하고 현재 동작 주장으로 사용하지 않는다.


### `src/simulation/priorityUnload.ts`

```tsx
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
 return result;
}
```


### `src/simulation/objective.ts`

```tsx
import type {LoadingEvaluation,Evaluation,Weights} from '../domain/model';
/** 전량 적재 보상·공간 집중도를 유지하고 우선순 하차의 재이동 비용을 감점한다. */
export function priorityFitness(loading:Pick<LoadingEvaluation,'valid'|'coverage'|'compactness'>,unloading:Pick<Evaluation,'valid'|'moves'|'mass'>,w:Weights):number {
 return loading.valid&&unloading.valid?Math.round((w.base*loading.coverage+(w.space??20)*loading.compactness-w.moves*unloading.moves-w.mass*unloading.mass)*100)/100:-Infinity;
}
```


## 2026-11-17 01:37:10 (KST) 상자별 우선도 실평가 연결

입력/우선순하차/GA점수/재생/내보내기연동.66개검사·빌드통과.작동순서·함수별역할·정책변경·단위·제약·검증은 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md`.위전체소스는현재구현이다.


## 2026-11-17 01:51:14 (KST) 최종 확인

67개 검사와 타입검사·빌드 통과. 공개 브라우저 6개 우선도 수정/배송순서/PNG·ZIP, 100·220개 집단50·3세대와 일시정지·재개 확인. Pages 성공. 상세 조건·시간·가정·증거는 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md` 최종 기록. 현재 전체 소스 스냅샷 동기화 완료.

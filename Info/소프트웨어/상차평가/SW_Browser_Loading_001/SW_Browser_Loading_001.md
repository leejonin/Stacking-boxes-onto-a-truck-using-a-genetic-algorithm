# SW_Browser_Loading_001 — 상차평가

- 버전: v0.0.1
- 최초 작성·수정 일시: 2026-11-16 12:49:10 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Loading_001
- 분류: 소프트웨어 / 상차평가 (영문 식별자 Loading)
- 실행환경: Browser. 기술 버전은 프로젝트 루트 기준 `Info/기술환경.md`.
- 관련 ID: 001 및 `Info/기능_ID_목록.md`의 관련 기능.
- 상태: 구현 코드 확인·수치/빌드 검증. 브라우저 직접 조작은 미확인.

## 목적·목표와 역할

상차 순서·목표 좌표를 실제로 실행하여 실린 개수·부피·집중도·재배치 횟수·중량과 이벤트를 만든다.

목표는 사용자 승인된 상차 적재량 개선과 재배치 감소를 실제 상차 계산·화면에 일치시키는 것이다.

## 호출·입력·출력·처리 순서

simulateLoading(boxes,coords,truck,order,fixed,trace)는 전체 목표 배치 검사 → 고정 적재 초기화 → 순열대로 지지·경로 검사 → 새 적재물 임시 꺼냄 → 최초 투입 → 복귀 → 실패 시 시도 롤백 → 최종 검사·원자료 계산 순서다. 기존 확정 적재는 이동하지 않는다. trace=false일 때 이벤트 생성만 생략하며 계산 결과는 같다.

Engine.evaluate, 비교 실험, App의 재생이 호출한다. loadingFitness는 기본 100×coverage+20×compactness−10×moves−1×mass를 적용한다. coverage는 개수·부피 비율 평균이며 utilization은 별도 적재함 부피 활용률이다. 필수 위반은 valid=false이고 미적재와 구별된다.

소스의 타입 정의는 필수 매개변수·단위·반환값의 실제 근거다. 위치는 정수 cm, 중량은 kg, 비율은 0~1이다. 예외·실패 분기는 아래 실제 코드와 같다. Loading 평가의 valid=false, 위치 생성 실패의 null, UI/Worker 예외 메시지를 서로 구별한다.

## 수정 전후·확인 범위

이전 전체 실행은 하차 비용을 평가했다. 이번에는 상차 순서·위치와 실제 적재량을 평가하며 하차 모듈은 앱·GA·실험에서 호출하지 않는다. 기존 하차 소스와 해당 회귀 테스트는 삭제하지 않고 보존했다. 테스트 18개·빌드 통과. 대표 실행과 비교 결과는 `Info/report/2026-11-16/124910_상차전환검증_report.md`.

## 실제 코드와 함수별 설명

아래는 작성 시점의 파일 전체다. 함수별 주석·시그니처와 분기·타입을 보존하며, 구현되지 않은 의사 코드가 아니다.

### `src/simulation/loading.ts`

```tsx
import type {Box,Vec,Truck,Weights,LoadingEvaluation,MoveEvent} from '../domain/model';
import {type Placed,validateLayout,fits,blockers,supported} from '../domain/packing';

/** 상차 순서와 목표 위치를 실행한다. 처음 싣는 동작과 재배치를 구별한다. SW_Browser_Loading_001 */
export function simulateLoading(boxes:Box[],coords:Vec[],truck:Truck,order:number[],fixed:Record<number,Vec>={},trace=true,reference?:{count:number;volume:number}):LoadingEvaluation {
  const result:LoadingEvaluation={valid:true,reason:'',moves:0,mass:0,loaded:0,loadedVolume:0,totalVolume:boxes.reduce((n,b)=>n+b.size[0]*b.size[1]*b.size[2],0),coverage:0,utilization:0,compactness:0,unloadedIds:[],events:[],finalCoords:boxes.map(()=>[-1,-1,-1])};
  const fail=(reason:string)=>{result.valid=false;result.reason=reason;return result;};
  if(coords.length!==boxes.length||order.length!==boxes.length||new Set(order).size!==boxes.length||order.some(id=>!boxes.some(b=>b.id===id)))return fail('상차 순서에는 각 상자 ID가 정확히 한 번 필요합니다.');
  if(coords.some(p=>!p||p.length!==3||p.some(x=>!Number.isFinite(x)))||coords.some(p=>p.some(x=>x<0)&&!p.every(x=>x===-1)))return fail('미배치 좌표는 (-1,-1,-1)이어야 합니다.');
  const targets=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
  const layoutReason=validateLayout(targets.map(p=>p.box),targets.map(p=>p.pos),truck,fixed);
  if(layoutReason)return fail(layoutReason);
  if(Object.entries(fixed).some(([id,p])=>{const i=boxes.findIndex(b=>b.id===+id);return i<0||p.some((v,k)=>coords[i][k]!==v);}))return fail('이미 상차한 상자의 고정 좌표를 변경할 수 없습니다.');
  let loaded:Placed[]=targets.filter(p=>fixed[p.box.id]).map(p=>({box:p.box,pos:[...p.pos]}));
  if(validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck))return fail('기존 적재 상태가 유효하지 않습니다.');
  /** 최초 상차에는 재배치 감점을 매기지 않는다. 임시 꺼냄·복귀 각각 1회다. */
  const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null)=>{
    if(kind==='out'||kind==='return'){result.moves++;result.mass=Math.round((result.mass+p.box.weight)*10)/10;}
    if(trace)result.events.push({kind,boxId:p.box.id,from:kind==='out'?[...p.pos]:null,to:to?[...to]:null,moves:result.moves,mass:result.mass});
  };
  for(const id of order) {
    if(fixed[id])continue;
    const target=targets.find(p=>p.box.id===id);if(!target)continue;
    // 지지 상자를 먼저 싣는 순서도 GA가 찾아야 한다. 평가기가 몰래 순서를 바꾸지 않는다.
    if(!supported(target,loaded))continue;
    const snapshot=loaded.map(p=>({box:p.box,pos:[...p.pos] as Vec})),eventCount=result.events.length,oldMoves=result.moves,oldMass=result.mass,temporary:Placed[]=[];
    /** 방해 상자와 그 상자에 의존하는 새 적재물만 꺼낸다. 기존 확정 적재물은 이동하지 않는다. */
    const remove=(p:Placed,seen:Set<number>):boolean=>{
      if(fixed[p.box.id]||seen.has(p.box.id))return false;
      seen.add(p.box.id);
      while(true){
        const rest=loaded.filter(a=>a.box.id!==p.box.id);
        const dependent=rest.filter(a=>!supported(a,rest)).sort((a,b)=>b.pos[2]-a.pos[2]||a.box.id-b.box.id)[0];
        const obstruction=blockers(p,loaded).sort((a,b)=>a.pos[1]-b.pos[1]||a.box.id-b.box.id)[0];
        const next=dependent??obstruction;if(!next)break;
        if(!remove(next,new Set(seen)))return false;
      }
      loaded=loaded.filter(a=>a.box.id!==p.box.id);temporary.push(p);record('out',p,null);return true;
    };
    let possible=true;
    for(const p of blockers(target,loaded).sort((a,b)=>a.pos[1]-b.pos[1])) {
      if(loaded.some(a=>a.box.id===p.box.id)&&!remove(p,new Set())){possible=false;break;}
    }
    if(possible&&fits(target.box,target.pos,loaded,truck)&&!blockers(target,loaded).length){
      loaded.push({box:target.box,pos:[...target.pos]});record('load',target,target.pos);
      while(temporary.length){
        temporary.sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]);
        const i=temporary.findIndex(p=>fits(p.box,p.pos,loaded,truck)&&!blockers(p,loaded).length);
        if(i<0){possible=false;break;}const [p]=temporary.splice(i,1);loaded.push(p);record('return',p,p.pos);
      }
    }else possible=false;
    // 실패한 시도는 확정된 동작이 아니다. 성공한 상태·이벤트만 점수와 3D에 사용한다.
    if(!possible){loaded=snapshot;result.events.length=eventCount;result.moves=oldMoves;result.mass=oldMass;}
  }
  const invalid=validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck,fixed);if(invalid)return fail(invalid);
  for(const p of loaded) {const i=boxes.findIndex(b=>b.id===p.box.id);result.finalCoords[i]=[...p.pos];result.loadedVolume+=p.box.size[0]*p.box.size[1]*p.box.size[2];}
  result.loaded=loaded.length;result.unloadedIds=boxes.filter(b=>!loaded.some(p=>p.box.id===b.id)).map(b=>b.id);
  // 개수와 부피를 함께 보상하므로 작은 상자만 골라 점수를 높이는 편향을 줄인다.
  // 자동 공급은 최초 입력을 기준으로 고정하여 공급만으로 기존 배치의 점수가 하락하지 않는다.
  result.coverage=boxes.length?.5*(result.loaded/(reference?.count??boxes.length)+result.loadedVolume/(reference?.volume??result.totalVolume)):0;
  result.utilization=result.loadedVolume/(truck.width*truck.depth*truck.height);
  if(loaded.length){const min=Math.min(...loaded.map(p=>p.pos[1])),max=Math.max(...loaded.map(p=>p.pos[1]+p.box.size[1]));result.compactness=result.loadedVolume/(truck.width*truck.height*(max-min));}
  return result;
}
/** 적재 개수·부피·공간 집중도 및 짐칸 활용률 보상(기본 최대50점)에서 상차 재배치 비용을 뺀다. */
export function loadingFitness(e:Pick<LoadingEvaluation,'valid'|'coverage'|'compactness'|'utilization'|'moves'|'mass'>,w:Weights):number {
  return e.valid?Math.round((w.base*e.coverage+(w.space??20)*e.compactness+(w.fill??50)*e.utilization-w.moves*e.moves-w.mass*e.mass)*100)/100:-Infinity;
}
```

함수·구성요소 역할(실제 문서화 주석):
- `export function simulateLoading(boxes:Box[],coords:Vec[],truck:Truck,order:number[],fixed:Record<number,Vec>=`: 상차 순서와 목표 위치를 실행한다. 처음 싣는 동작과 재배치를 구별한다. SW_Browser_Loading_001
- `export function loadingFitness(e:Pick<LoadingEvaluation,'valid'|'coverage'|'compactness'|'moves'|'mass'>,w:Weights):number`: 최초 상차에는 재배치 감점을 매기지 않는다. 임시 꺼냄·복귀 각각 1회다. */   const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null)=>{     if(kind==='out'||kind==='return'){result.moves++;result.mass=Math.round((result.mass+p.box.weight)*10)/10;}     if(trace)result.events.push({kind,boxId:p.box.id,from:kind==='out'?[...p.pos]:null,to:to?[...to]:null,moves:result.moves,mass:result.mass});   };   for(const id of order) {     if(fixed[id])continue;     const target=targets.find(p=>p.box.id===id);if(!target)continue;     // 지지 상자를 먼저 싣는 순서도 GA가 찾아야 한다. 평가기가 몰래 순서를 바꾸지 않는다.     if(!supported(target,loaded))continue;     const snapshot=loaded.map(p=>({box:p.box,pos:[...p.pos] as Vec})),eventCount=result.events.length,oldMoves=result.moves,oldMass=result.mass,temporary:Placed[]=[];     /** 방해 상자와 그 상자에 의존하는 새 적재물만 꺼낸다. 기존 확정 적재물은 이동하지 않는다. */     const remove=(p:Placed,seen:Set<number>):boolean=>{       if(fixed[p.box.id]||seen.has(p.box.id))return false;       seen.add(p.box.id);       while(true){         const rest=loaded.filter(a=>a.box.id!==p.box.id);         const dependent=rest.filter(a=>!supported(a,rest)).sort((a,b)=>b.pos[2]-a.pos[2]||a.box.id-b.box.id)[0];         const obstruction=blockers(p,loaded).sort((a,b)=>a.pos[1]-b.pos[1]||a.box.id-b.box.id)[0];         const next=dependent??obstruction;if(!next)break;         if(!remove(next,new Set(seen)))return false;       }       loaded=loaded.filter(a=>a.box.id!==p.box.id);temporary.push(p);record('out',p,null);return true;     };     let possible=true;     for(const p of blockers(target,loaded).sort((a,b)=>a.pos[1]-b.pos[1])) {       if(loaded.some(a=>a.box.id===p.box.id)&&!remove(p,new Set())){possible=false;break;}     }     if(possible&&fits(target.box,target.pos,loaded,truck)&&!blockers(target,loaded).length){       loaded.push({box:target.box,pos:[...target.pos]});record('load',target,target.pos);       while(temporary.length){         temporary.sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]);         const i=temporary.findIndex(p=>fits(p.box,p.pos,loaded,truck)&&!blockers(p,loaded).length);         if(i<0){possible=false;break;}const [p]=temporary.splice(i,1);loaded.push(p);record('return',p,p.pos);       }     }else possible=false;     // 실패한 시도는 확정된 동작이 아니다. 성공한 상태·이벤트만 점수와 3D에 사용한다.     if(!possible){loaded=snapshot;result.events.length=eventCount;result.moves=oldMoves;result.mass=oldMass;}   }   const invalid=validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck,fixed);if(invalid)return fail(invalid);   for(const p of loaded) {const i=boxes.findIndex(b=>b.id===p.box.id);result.finalCoords[i]=[...p.pos];result.loadedVolume+=p.box.size[0]*p.box.size[1]*p.box.size[2];}   result.loaded=loaded.length;result.unloadedIds=boxes.filter(b=>!loaded.some(p=>p.box.id===b.id)).map(b=>b.id);   // 개수와 부피를 함께 보상하므로 작은 상자만 골라 점수를 높이는 편향을 줄인다.   result.coverage=boxes.length?.5*(result.loaded/boxes.length+result.loadedVolume/result.totalVolume):0;   result.utilization=result.loadedVolume/(truck.width*truck.depth*truck.height);   if(loaded.length){const min=Math.min(...loaded.map(p=>p.pos[1])),max=Math.max(...loaded.map(p=>p.pos[1]+p.box.size[1]));result.compactness=result.loadedVolume/(truck.width*truck.height*(max-min));}   return result; } /** 적재 개수·부피 보상과 공간 집중도 보상에서 상차 재배치 비용을 뺀다.

## 2026-11-16 19:23:49 (KST) 자동 공급 경계 수정

현재 동작·검증은 `Info/plan/2026-11-16/192349_자동공급세대계승수정_plan.md` 및 같은 기능의 최신 day에 기록했다. 이전 검증 기록은 당시 결과이며 현재 코드 스냅샷은 위에 갱신했다.

### `src/simulation/accumulated.ts`

```tsx
import type {Box,Vec,Truck,LoadingSnapshot,LoadingEvaluation,MoveEvent} from '../domain/model';
import {type Placed,validateLayout,fits,blockers,supported} from '../domain/packing';
import {simulateLoading} from './loading';

/** 이전 공급의 적재물에서 출발한다. 기존 상자 유실을 거부하고 이번 재배치 상자마다 한 번만 비용을 더한다. */
export function simulateAccumulatedLoading(boxes:Box[],coords:Vec[],truck:Truck,order:number[],snapshot:LoadingSnapshot,fixed:Record<number,Vec>={},trace=true,reference?:{count:number;volume:number}):LoadingEvaluation {
  // 공통 입력·목표 배치 검증과 보상 계산을 재사용한다. 아래 실행 결과로 개수·비용·이벤트를 교체한다.
  const result=simulateLoading(boxes,coords,truck,order,fixed,false,reference);
  const fail=(reason:string)=>({...result,valid:false,reason});
  if(!result.valid)return result;
  const targets=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
  let loaded:Placed[]=boxes.flatMap(box=>snapshot.positions[box.id]?[{box,pos:[...snapshot.positions[box.id]] as Vec}]:[]);
  if(validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck,fixed))return fail('누적 상차 시작 배치가 유효하지 않습니다.');
  if(Object.keys(snapshot.positions).some(id=>!targets.some(p=>p.box.id===+id)))return fail('이미 상차한 상자를 미적재로 되돌릴 수 없습니다.');
  const moved=new Set<number>(),events:MoveEvent[]=[];
  let moves=snapshot.moves,mass=snapshot.mass;
  /** 꺼냄과 복귀를 합쳐 상자당 재이동 한 번으로 계산한다. 최초 상차에는 감점하지 않는다. */
  const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null)=>{
    if(kind==='out'&&!moved.has(p.box.id)){moved.add(p.box.id);moves++;mass=Math.round((mass+p.box.weight)*10)/10;}
    if(trace)events.push({kind,boxId:p.box.id,from:kind==='out'?[...p.pos]:null,to:to?[...to]:null,moves,mass});
  };
  /** 지지 의존 상자와 출입 경로 방해물을 먼저 임시로 꺼낸다. 고정 적재는 이동하지 않는다. */
  const remove=(p:Placed,seen=new Set<number>()):boolean=>{
    if(fixed[p.box.id]||seen.has(p.box.id))return false;seen.add(p.box.id);
    while(true){
      const rest=loaded.filter(a=>a.box.id!==p.box.id);
      const next=rest.find(a=>!supported(a,rest))??blockers(p,loaded)[0];
      if(!next)break;if(!remove(next,new Set(seen)))return false;
    }
    loaded=loaded.filter(a=>a.box.id!==p.box.id);record('out',p,null);return true;
  };
  // 목표 좌표가 달라진 기존 상자만 이동한다. 움직이지 않은 상자는 시작부터 화면과 적재함에 남는다.
  for(const p of [...loaded].sort((a,b)=>b.pos[2]-a.pos[2])){
    const target=targets.find(a=>a.box.id===p.box.id)!;
    if(loaded.some(a=>a.box.id===p.box.id)&&p.pos.some((v,k)=>v!==target.pos[k])&&!remove(p))return fail('기존 상자의 이동 경로를 확보하지 못했습니다.');
  }
  for(const id of order){
    const target=targets.find(p=>p.box.id===id);if(!target||loaded.some(p=>p.box.id===id)||!supported(target,loaded))continue;
    const before=loaded.map(p=>({box:p.box,pos:[...p.pos] as Vec})),oldMoved=new Set(moved),oldMoves=moves,oldMass=mass,oldEvents=events.length;
    let possible=true;
    for(const p of blockers(target,loaded))if(loaded.some(a=>a.box.id===p.box.id)&&!remove(p)){possible=false;break;}
    if(possible&&fits(target.box,target.pos,loaded,truck)&&!blockers(target,loaded).length){
      loaded.push({box:target.box,pos:[...target.pos]});record(snapshot.positions[id]||moved.has(id)?'return':'load',target,target.pos);
    }else{loaded=before;moved.clear();oldMoved.forEach(id=>moved.add(id));moves=oldMoves;mass=oldMass;events.length=oldEvents;}
  }
  // 임시로 꺼낸 상자는 지지와 경로가 가능한 순서로 목표 위치에 복귀시킨다.
  let restored=true;
  while(restored){restored=false;for(const id of moved){
    const p=targets.find(a=>a.box.id===id);if(!p||loaded.some(a=>a.box.id===id))continue;
    if(fits(p.box,p.pos,loaded,truck)&&!blockers(p,loaded).length){loaded.push({box:p.box,pos:[...p.pos]});record('return',p,p.pos);restored=true;}
  }}
  if(Object.keys(snapshot.positions).some(id=>!loaded.some(p=>p.box.id===+id))||[...moved].some(id=>!loaded.some(p=>p.box.id===id)))return fail('재배치 후 기존 상자를 모두 복귀시키지 못했습니다.');
  const finalCoords:Vec[]=boxes.map(box=>loaded.find(p=>p.box.id===box.id)?.pos??[-1,-1,-1]);
  const invalid=validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck,fixed);
  if(invalid)return fail(invalid);
  // 실제 남은 배치를 지지 순서로 계산하여 보상과 유효성을 얻는다. 실행 이벤트와 누적 비용은 위 결과를 쓴다.
  const finalOrder=[...loaded].sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]).map(p=>p.box.id);
  const summary=simulateLoading(boxes,finalCoords,truck,[...finalOrder,...boxes.filter(b=>!finalOrder.includes(b.id)).map(b=>b.id)],fixed,false,reference);
  return {...summary,moves,mass,events};
}
```

## 2026-11-16 19:40:12 (KST) 누적 상차 유지

최신 누적 처리와 함수 호출·검증·한계는 `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md`에 기록했다. 자동 공급에서는 기존 상자 ID를 보존하면서 좌표 이동을 허용하며, 이번 회차에서 움직인 상자당 1회·해당 중량을 기존 누적 비용에 더한다. 함수 입력·반환값과 실제 처리 순서는 위 코드의 주석·자료형을 따른다.

- 2026-11-16 19:42:17 (KST) 최종 완료 조건: 자동 공급은 적재 부피100%일 때만 즉시 완료하며 가득 찬 개체를 표시한다. 작은 틈·세대 예산·공급량 소진으로 완료하지 않는다. 전체33개 테스트와 빌드 성공. 기준과 한계: `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md`.

- 2026-11-16 20:00:45 (KST) 3세대 정체 수정·ID 중복과 공간 겹침 금지: 기존 선호 좌표 우선, 실제 적재 상태에서 추가 상차 변이, 일부 자식 순서 유전자 복구, 최종 적재 검증을 적용했다.41개 테스트·빌드 성공. 실제 Worker3세대 최고점수 개체28개 적재. 상세: `Info/plan/2026-11-16/200045_3세대상차정체와중복겹침금지_plan.md`.

## 2026-11-16 20:16:09 (KST) 짐칸 활용률 보상과 세대 상차 완료

기본 최대50점의 실제 짐칸 부피 활용률 보상과 입력·재적용을 추가했다. 추가 적재 공간 없음은 세대 상차 완료이며 다음 세대로 진화한다. 전체 완료는 설정 부피 목표(기본100%, 남은0%)에서 수행한다. 이전 공간 없음 즉시 전체 완료 동작은 이번 사용자 확정으로 대체한다.43개 테스트·빌드 성공. 자세한 입력·호출·검증·한계는 `Info/plan/2026-11-16/201609_짐칸활용률보상과세대상차완료_plan.md`.

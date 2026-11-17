# SW_Browser_Evolution_001 — 진화계산

> 2026-11-17 02:00:56 KST 최신 입력 범위는 최초·누적1~400개. 과거 총량 무제한 설명은 당시 기록이다. 최신 동작은 `Info/plan/2026-11-17/015406_입력반영과누적400제한_plan.md`.


> 2026-11-17 01:37:10 (KST) 최신 웹 기준: 전량적재를통과한뒤우선도순하차의재이동비용을최적화한다.사용자승인‘ㅇㅇ’.이하과거상차복원기록은당시기준이며현재목적은 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md` 참조.


> 2026-11-16 21:20:39 (KST) 현재 기준: 현재 실행은 첫 배포 상차 기준이며 상자 할당 입력만 유지한다. 이후 기능 설명은 당시 기록일 수 있으며 최신 기준은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`.

- 버전: v0.0.2
- 최초 작성·수정 일시: 2026-11-16 12:49:10 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Evolution_001
- 분류: 소프트웨어 / 진화계산 (영문 식별자 Evolution)
- 실행환경: Browser. 기술 버전은 프로젝트 루트 기준 `Info/기술환경.md`.
- 관련 ID: 001 및 `Info/기능_ID_목록.md`의 관련 기능.
- 상태: 구현 코드 확인·수치/빌드 검증. 브라우저 직접 조작은 미확인.

## 목적·목표와 역할

좌표·상차 순서 집단을 진화시키고 가중치 적용·일시정지·평가 예산 비교를 담당한다.

목표는 사용자 승인된 상차 적재량 개선과 재배치 감소를 실제 상차 계산·화면에 일치시키는 것이다.

## 호출·입력·출력·처리 순서

Engine은 상자·적재함·설정·가중치·고정 좌표를 받는다. select는 토너먼트, offspring은 좌표 교차·위치 변이·순열 교차·순열 교환을 수행한다. evaluate는 Loading만 호출한다. next 생성기는 한 후보 시도마다 yield하고 완성 세대의 집단·평균·최고·평가횟수를 반환한다. reweight는 현재 집단만 새 버전으로 복사 재채점한다.

Worker start/pause/resume/stop/weights는 실행 ID로 분리된다. 약 12ms 묶음 tick으로 메시지 처리 기회를 주며 세대 완료 시 generation을 보낸다. 가중치 변경은 부분 세대를 폐기한다. runExperiments는 9조건×3seed를 실행하고 동일 평가 횟수의 무작위 상차 순서·배치와 비교한다. finishGeneration은 Node 수치 검증용 동기 실행기다.

소스의 타입 정의는 필수 매개변수·단위·반환값의 실제 근거다. 위치는 정수 cm, 중량은 kg, 비율은 0~1이다. 예외·실패 분기는 아래 실제 코드와 같다. Loading 평가의 valid=false, 위치 생성 실패의 null, UI/Worker 예외 메시지를 서로 구별한다.

## 수정 전후·확인 범위

이전 전체 실행은 하차 비용을 평가했다. 이번에는 상차 순서·위치와 실제 적재량을 평가하며 하차 모듈은 앱·GA·실험에서 호출하지 않는다. 기존 하차 소스와 해당 회귀 테스트는 삭제하지 않고 보존했다. 테스트 18개·빌드 통과. 대표 실행과 비교 결과는 `Info/report/2026-11-16/124910_상차전환검증_report.md`.

## 실제 코드와 함수별 설명

아래는 작성 시점의 파일 전체다. 함수별 주석·시그니처와 분기·타입을 보존하며, 구현되지 않은 의사 코드가 아니다.

### `src/ga/engine.ts`

```tsx
import {effectiveCrossover} from '../domain/ranges';
import {supportSurfacePack,dependencyLoadingOrder} from '../domain/supportPacking';
import {priorityOrder} from '../domain/priority';
import {simulateSteps} from '../simulation/unload';
import {priorityFitness} from '../simulation/objective';
import { Random,validateConfig,type Box,type Vec,type Truck,type Weights,type Settings,type Individual,type Generation } from '../domain/model';
import { pack,packSteps,randomPosition,loadingOrder,partitionPack,validateLayout } from '../domain/packing';
import { simulateLoading,loadingFitness,completeSupportOrder } from '../simulation/loading';

/** 좌표 기반 GA의 집단·난수·평가 예산을 관리한다. SW_Browser_Evolution_001 */
export class Engine {
  rng:Random; generation=0; population:Individual[]=[]; evaluations=0; version=1;
  private serial=0;
  private partitionMode=false;
  private diverseFailures=0;
  seedLayout:Vec[]|undefined;
  requireFullAllocation=false;
  priorityUnloading=false;
  allocationProgress={ready:0,attempts:0,mostLoaded:0};
  constructor(public boxes:Box[],public truck:Truck,public settings:Settings,public weights:Weights,public fixed:Record<number,Vec>={},public requireLoading=false) {
    validateConfig(boxes,truck,settings,weights); this.rng=new Random(settings.seed);
  }
  /** 주어진 부모 풀(생략하면 현재 집단)에서 토너먼트로 선택한다. 음수 점수도 그대로 비교한다. */
  select(pool=this.population):Individual {
    let best=pool[this.rng.int(0,pool.length-1)];
    for(let k=1;k<this.settings.tournament;k++) {const p=pool[this.rng.int(0,pool.length-1)];if(p.score>best.score)best=p;}
    return best;
  }
  /** 지정한 완료 부모 풀의 좌표를 1점 교차·변이하고 물리 조건을 복구한다. */
  offspring(pool=this.population): {coords:Vec[];loadOrder:number[];repairOrder?:number[];parents:string[];operation:string;repaired:boolean}|null {
    const useRepair=this.partitionMode||this.priorityUnloading;
    const a=this.select(pool),b=this.select(pool);const cross=this.rng.next()<effectiveCrossover(this.settings.crossover) && this.boxes.length>1;
    const cut=cross?this.rng.int(1,this.boxes.length-1):this.boxes.length;
    const coords=this.boxes.map((_,i)=>[...(i<cut?a.coords[i]:b.coords[i])] as Vec);let mutated=false;
    for(let i=0;i<coords.length;i++) {
      if(this.fixed[this.boxes[i].id] || this.rng.next()>=this.settings.mutation)continue;
      // 우선도 하차 또는 구획 복구에서는 변이율1도 전수 위치 탐색 대신 공통 복구기로 충돌·지지를 검사한다.
      if(useRepair){const size=this.boxes[i].size;coords[i]=[this.rng.int(0,this.truck.width-size[0]),this.rng.int(0,this.truck.depth-size[1]),this.rng.int(0,this.truck.height-size[2])];mutated=true;continue;}
      // 위 지지 관계까지 고정하는 대신 변이 후 pack에서 후속 검사를 수행한다.
      const placed=this.boxes.flatMap((box,j)=>j===i||coords[j][0]<0?[]:[{box,pos:coords[j]}]);
      const p=randomPosition(this.boxes[i],placed,this.truck,this.rng);
      if(p&&p.some((v,k)=>v!==coords[i][k])) {coords[i]=p;mutated=true;}
      else {
        // 빈 공간이 없는 배치도 탐색하도록 두 미고정 상자의 좌표를 교환한 뒤 유효성을 복구한다.
        const alternatives=coords.map((_,j)=>j).filter(j=>j!==i&&!this.fixed[this.boxes[j].id]);
        if(alternatives.length){const j=alternatives[this.rng.int(0,alternatives.length-1)];[coords[i],coords[j]]=[coords[j],coords[i]];mutated=true;}
      }
    }
    const prefix=a.loadOrder.slice(0,cut);
    const loadOrder=cross?[...prefix,...b.loadOrder.filter(id=>!prefix.includes(id))]:[...a.loadOrder];
    if(loadOrder.length>1&&this.rng.next()<this.settings.mutation){const i=this.rng.int(0,loadOrder.length-1),j=this.rng.int(0,loadOrder.length-1);[loadOrder[i],loadOrder[j]]=[loadOrder[j],loadOrder[i]];mutated=true;}
    // 유효한 복제·교차 좌표는 그대로 보존한다. 복구가 필요한 자식만 다시 구획화한다.
    const result=useRepair?(validateLayout(this.boxes,coords,this.truck)?this.rescuePack(coords):{coords,repaired:false,loadOrder:this.boxes.map((b,i)=>({id:b.id,back:coords[i][1]+b.size[1],z:coords[i][2]})).sort((a,b)=>b.back-a.back||a.z-b.z).map(b=>b.id)}):pack(this.boxes,this.truck,this.rng,coords,this.fixed,true,this.requireFullAllocation);
    if(!result)return null;
    return {...result,loadOrder,...(useRepair?{repairOrder:result.loadOrder}:{}),parents:cross?[a.id,b.id]:[a.id],operation:(cross?(mutated?'교차·변이':'교차'):(mutated?'변이':'선택 복제'))+(useRepair&&result.repaired?'·구획 복구':'')};
  }
  /** 기존 구획 후보가 부분 배치이면 최대 지지면 전략으로 복구한다. 성공 경로의 난수·후보는 보존한다. */
  private rescuePack(preferred?:Vec[]):ReturnType<typeof partitionPack> {
    const original=partitionPack(this.boxes,this.truck,this.rng,preferred);
    if(!this.priorityUnloading||original.coords.every(p=>p[0]>=0))return original;
    // 새 전략도 성공을 보장하지 않는다. 같은 실패에 수천 번 비싼 재계산을 하지 않는다.
    if(++this.diverseFailures>32)throw Error('다양한 전량 배치 전략으로 유효 집단을 생성하지 못했습니다. 전량 배치 가능성이 확인된 것은 아닙니다. 입력·짐칸·seed를 확인하세요. 현재 세대는 유지됩니다.');
    const alternative=supportSurfacePack(this.boxes,this.truck,this.rng,this.diverseFailures%2?0:4);
    if(alternative.coords.filter(p=>p[0]>=0).length>original.coords.filter(p=>p[0]>=0).length){return alternative;}return original;
  }
  /** 전량 상차를 검증한 뒤 웹 목적에서는 고정 우선도 순 하차 비용으로 평가한다. */
  *evaluateSteps(coords:Vec[],parents:string[],operation:string,repaired:boolean,loadOrder=this.boxes.map(b=>b.id)):Generator<void,Individual|null,void> {
    this.evaluations++;
    if((this.requireFullAllocation||this.priorityUnloading)&&!completeSupportOrder(this.boxes,coords,loadOrder,this.fixed))return null;
    const {events:_,...evaluation}=simulateLoading(this.boxes,coords,this.truck,loadOrder,this.fixed,false);
    if(!evaluation.valid)return null;
    this.allocationProgress.mostLoaded=Math.max(this.allocationProgress.mostLoaded,evaluation.loaded);
    if((this.requireFullAllocation||this.priorityUnloading)&&evaluation.loaded!==this.boxes.length)return null;
    const extra=this.priorityUnloading?yield* simulateSteps(this.boxes,evaluation.finalCoords,this.truck,false,true):null;
    if(extra&&(!extra.valid||extra.delivered!==this.boxes.length))return null;
    const unloading=extra?{valid:extra.valid,reason:extra.reason,moves:extra.moves,mass:extra.mass,delivered:extra.delivered}:undefined;
    return {...(unloading?{unloading,unloadOrder:priorityOrder(this.boxes).map(b=>b.id)}:{}),id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents,operation,repaired,coords,loadOrder,evaluation,score:unloading?priorityFitness(evaluation,unloading,this.weights):loadingFitness(evaluation,this.weights),version:this.version};
  }
  /** 독립 동기 호출도 동일 평가 경로를 사용한다. */
  evaluate(coords:Vec[],parents:string[],operation:string,repaired:boolean,loadOrder=this.boxes.map(b=>b.id)):Individual|null {const it=this.evaluateSteps(coords,parents,operation,repaired,loadOrder);let r=it.next();while(!r.done)r=it.next();return r.value;}
  /** 현재 할당의 전량 상차·우선순 전량 하차를 마친 개체만 세대와 부모 풀에 허용한다. */
  private completedUnloading(p:Individual,order:number[]):boolean {
    return p.evaluation.valid&&p.evaluation.loaded===order.length&&p.evaluation.unloadedIds.length===0&&!!p.unloading?.valid&&p.unloading.delivered===order.length&&p.unloadOrder?.length===order.length&&order.every((id,i)=>p.unloadOrder![i]===id);
  }
  /** 개체 한 번 시도마다 양보하여 Worker가 정지·취소 메시지를 처리하게 한다. */
  *next():Generator<void,Generation,void> {
    const start=performance.now(),next:Individual[]=[],mustLoad=this.requireFullAllocation||this.priorityUnloading,order=this.priorityUnloading?priorityOrder(this.boxes).map(b=>b.id):[];let attempts=0,accepted=0,rescueInitial=false;
    this.allocationProgress={ready:0,attempts:0,mostLoaded:0};
    if(mustLoad){
      if(this.boxes.some(b=>b.size.some((v,i)=>v>[this.truck.width,this.truck.depth,this.truck.height][i])))throw Error('할당 상자 중 짐칸 치수를 넘는 상자가 있어 전부 배치할 수 없습니다. 초기화 후 입력을 조정하세요.');
      if(this.boxes.reduce((n,b)=>n+b.size[0]*b.size[1]*b.size[2],0)>this.truck.width*this.truck.depth*this.truck.height)throw Error('할당 상자의 총부피가 짐칸보다 큽니다. 다음 세대로 넘어가지 않습니다. 초기화 후 할당 개수를 줄이세요.');
    }
    const eligible=this.priorityUnloading?this.population.filter(p=>this.completedUnloading(p,order)):this.requireFullAllocation?this.population.filter(p=>p.evaluation.loaded===this.boxes.length):this.population;
    const parents=this.priorityUnloading?eligible:this.population,hasParents=parents.length>0;
    rescueInitial=this.priorityUnloading&&!!this.seedLayout&&!hasParents&&!Object.keys(this.fixed).length;
    if(eligible.length) {
      const best=eligible.reduce((a,b)=>a.score>=b.score?a:b);
      next.push({...best,id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents:[best.id],operation:'엘리트',coords:best.coords.map(p=>[...p] as Vec)});
      this.allocationProgress.ready=next.length;this.allocationProgress.mostLoaded=best.evaluation.loaded;
    }
    while(next.length<this.settings.population) {
      if(++attempts>this.settings.population*120) throw Error(`${this.priorityUnloading?'전량 상차·우선순 전량 하차':'할당'} 조건을 만족하는 유효 집단을 생성하지 못했습니다 (${next.length}/${this.settings.population}). 현재 세대는 유지됩니다. 초기화 후 입력·적재함·고정 배치를 확인하세요.`);
      this.allocationProgress.attempts=attempts;
      const child=hasParents?this.offspring(parents):null;
      // 최초 시도가 실패해 완전 후보가 하나도 없을 때만 초기화 전략을 전환한다.
      // 기존 초기 집단이 바로 생성되는 입력은 후보·난수 순서를 그대로 유지한다.
      rescueInitial ||= !hasParents&&mustLoad&&attempts>1&&!next.length&&!Object.keys(this.fixed).length;
      const rescue=rescueInitial;
      if(rescue)this.partitionMode=true;
      const candidate=hasParents?child:rescue?this.rescuePack():(yield* packSteps(this.boxes,this.truck,this.rng,attempts===1?this.seedLayout:undefined,this.fixed,true,mustLoad,mustLoad));
      if(candidate) {
        this.allocationProgress.mostLoaded=Math.max(this.allocationProgress.mostLoaded,candidate.coords.filter(p=>p[0]>=0).length);
        let p=yield* this.evaluateSteps(candidate.coords,child?.parents??[],child?.operation??(rescue?'초기 구획 배치':'초기 무작위'),candidate.repaired,child?.loadOrder??candidate.loadOrder??this.rng.shuffle(this.boxes.map(b=>b.id)));
        // 완전 적재가 가능한 좌표라면 순서 유전자 복구도 시도한다. 평가기는 주어진 순서를 그대로 실행한다.
        if(!p&&mustLoad&&candidate.coords.every(v=>v[0]>=0)){
          const order=child?.repairOrder??loadingOrder(this.boxes,candidate.coords,this.truck,this.fixed)??(this.priorityUnloading&&!Object.keys(this.fixed).length?dependencyLoadingOrder(this.boxes,candidate.coords):null);
          if(order)p=yield* this.evaluateSteps(candidate.coords,child?.parents??[],`${child?.operation??'초기 무작위'}·상차순서 복구`,candidate.repaired,[...this.boxes.filter(b=>this.fixed[b.id]).map(b=>b.id),...order]);
        }
        if(p&&(!this.priorityUnloading||this.completedUnloading(p,order))) {this.diverseFailures=0;next.push(p);accepted++;this.allocationProgress.ready=next.length;}
      }
      yield;
    }
    // 모든 후보 수집 후에도 전량 하차 조건을 재검사한 다음에만 집단·세대 번호를 함께 확정한다.
    if(this.priorityUnloading&&!next.every(p=>this.completedUnloading(p,order)))throw Error('전량 하차를 완료하지 못한 개체가 있어 다음 세대를 확정할 수 없습니다.');
    this.population=next;this.generation++;
    return {...(this.priorityUnloading?{objective:'priority-unload' as const}:{}),number:this.generation,individuals:next,best:Math.max(...next.map(p=>p.score)),mean:next.reduce((a,b)=>a+b.score,0)/next.length,version:this.version,attempts,accepted,evaluations:this.evaluations,elapsed:performance.now()-start};
  }
  /** 현재 집단만 새 가중치로 평가한다. 이전 세대 스냅샷은 수정하지 않는다. */
  reweight(weights:Weights):Individual[] {
    validateConfig(this.boxes,this.truck,this.settings,weights);this.weights={...weights};this.version++;
    this.population=this.population.map(p=>({...p,score:this.priorityUnloading&&p.unloading?priorityFitness(p.evaluation,p.unloading,weights):loadingFitness(p.evaluation,weights),version:this.version}));return this.population;
  }
}
/** 동기 테스트·실험에서 세대 생성기를 끝까지 진행한다. */
export function finishGeneration(engine:Engine):Generation { const iter=engine.next();let r=iter.next();while(!r.done)r=iter.next();return r.value; }
```

함수·구성요소 역할(실제 문서화 주석):
- `export class Engine`: 좌표 기반 GA의 집단·난수·평가 예산을 관리한다. SW_Browser_Evolution_001
- `select():Individual`: 같은 상태에서 토너먼트로 부모를 선택한다. 음수 점수도 그대로 비교한다.
- `offspring():`: 상자별 좌표 묶음 1점 교차와 유효 위치 변이, 최소 배치 수정을 수행한다.
- `evaluate(coords:Vec[],parents:string[],operation:string,repaired:boolean,loadOrder=this.boxes.map(b=>b.id)):Individual|null`: 상차 순서를 실제 실행하고 적재량·공간 활용·상차 재배치로 후보를 평가한다.
- `*next():Generator<void,Generation,void>`: 개체 한 번 시도마다 양보하여 Worker가 정지·취소 메시지를 처리하게 한다.
- `reweight(weights:Weights):Individual[]`: 현재 집단만 새 가중치로 평가한다. 이전 세대 스냅샷은 수정하지 않는다.
- `export function finishGeneration(engine:Engine):Generation`: 동기 테스트·실험에서 세대 생성기를 끝까지 진행한다.

### `src/ga/experiments.ts`

```tsx
import { Engine } from './engine';
import { Random,type Box,type Truck,type Settings,type Weights } from '../domain/model';
import { pack } from '../domain/packing';
export interface ExperimentRow { condition:string;seed:number;gaScore:number;randomScore:number;gaMoves:number;randomMoves:number;gaMass:number;randomMass:number;gaLoaded:number;randomLoaded:number;gaVolume:number;randomVolume:number;budget:number;randomEvaluations:number;validRatio:number }
/** 동일 후보 평가 예산·상자 목록으로 3개 seed와 계획서의 9개 조건을 비교한다. */
export async function runExperiments(boxes:Box[],truck:Truck,settings:Settings,weights:Weights,cancel:()=>boolean,progress:(s:string)=>void,priorityUnloading=false):Promise<ExperimentRow[]> {
  const result:ExperimentRow[]=[];
  const conditions=[...[(priorityUnloading ? .1 : 0),.6,.9].map(c=>({name:`교차 ${c}`,patch:{crossover:c}})),...[2,3,5].map(k=>({name:`선택 k=${k}`,patch:{tournament:k}})),...[(priorityUnloading ? .01 : 0),.05,.2].map(m=>({name:`변이 ${m}`,patch:{mutation:m}}))];
  for(const c of conditions)for(const seed of [11,29,47]) {
    if(cancel())return result;
    progress(`${c.name} · seed ${seed}`);
    const e=new Engine(boxes,truck,{...settings,crossover:.9,mutation:.05,tournament:3,...c.patch,seed},weights);
    e.requireFullAllocation=true;e.priorityUnloading=priorityUnloading;
    let attempts=0,accepted=0;
    for(let g=0;g<settings.generations;g++) {
      const iter=e.next();let step=iter.next(),chunk=performance.now();
      while(!step.done) {if(cancel())return result;step=iter.next();if(performance.now()-chunk>16){await new Promise(r=>setTimeout(r,0));chunk=performance.now();}}
      attempts+=step.value.attempts;accepted+=step.value.accepted;
    }
    const ga=e.population.reduce((a,b)=>a.score>=b.score?a:b),rng=new Random(seed);
    const compare=new Engine(boxes,truck,settings,weights);compare.requireFullAllocation=true;compare.priorityUnloading=priorityUnloading;
    let best:{score:number;moves:number;mass:number;loaded:number;volume:number}|null=null,used=0,tries=0;
    while(used<e.evaluations) {
      if(cancel())return result;
      if(++tries>e.evaluations*120)throw Error('무작위 비교군의 유효 배치 생성 한도 초과');
      const p=pack(boxes,truck,rng,undefined,{},true);if(!p)continue;
      const individual=compare.evaluate(p.coords,[],'무작위 비교',p.repaired,rng.shuffle(boxes.map(b=>b.id)));used++;
      if(individual){const ev=individual.evaluation,cost=individual.unloading??ev,score=individual.score;if(!best||score>best.score)best={score,moves:cost.moves,mass:cost.mass,loaded:ev.loaded,volume:ev.loadedVolume};}
      if(used%10===0)await new Promise(r=>setTimeout(r,0));
    }
    if(!best)throw Error('무작위 비교군에서 유효 상차 해답이 없습니다.');
    result.push({condition:c.name,seed,gaScore:ga.score,randomScore:best.score,gaMoves:(ga.unloading??ga.evaluation).moves,randomMoves:best.moves,gaMass:(ga.unloading??ga.evaluation).mass,randomMass:best.mass,gaLoaded:ga.evaluation.loaded,randomLoaded:best.loaded,gaVolume:ga.evaluation.loadedVolume,randomVolume:best.volume,budget:e.evaluations,randomEvaluations:used,validRatio:accepted/attempts});
    await new Promise(r=>setTimeout(r,0));
  }
  return result;
}
```

함수·구성요소 역할(실제 문서화 주석):
- `export async function runExperiments(boxes:Box[],truck:Truck,settings:Settings,weights:Weights,cancel:()=>boolean,progress:(s:string)=>void):Promise<ExperimentRow[]>`: 동일 후보 평가 예산·상자 목록으로 3개 seed와 계획서의 9개 조건을 비교한다.

### `src/workers/evolution.ts`

```tsx
import {validateWebConfig} from '../domain/ranges';
/// <reference lib="webworker" />
import { Engine } from '../ga/engine';
import {MAX_BOXES} from '../domain/model';
import type { Box,Truck,Settings,Weights,Vec,Generation } from '../domain/model';
import { runExperiments } from '../ga/experiments';
import {AutomaticSupply} from '../simulation/supply';
export type Command = {type:'start';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights;fixed:Record<number,Vec>;arrival:boolean;automatic?:boolean;inputSeed?:number;requireFullAllocation?:boolean;priorityUnloading?:boolean;batchGenerations?:boolean}|{type:'pause'|'resume'|'stop';run:number}|{type:'weights';run:number;weights:Weights}|{type:'experiment';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights;priorityUnloading?:boolean};
let engine:Engine|null=null,run=0,paused=false,stopped=false,iterator:Generator<void,Generation,void>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
let lastProgressAt=0;
let batchGenerations=false;
let supply:AutomaticSupply|null=null,generationOffset=0,evaluationOffset=0;
/** 공급 회차마다 다른 입력·ID를 구별해 과거 개체와 계보를 보존한다. */
function displayIndividuals(individuals:import('../domain/model').Individual[]) {
  const prefix=supply?`r${supply.round}-`:'';
  return individuals.map(p=>({...p,id:prefix+p.id,parents:p.parents.map(id=>prefix+id),generation:p.generation+generationOffset}));
}
/** Worker의 최신 실행만 알린다. 메시지마다 실행 ID를 포함한다. */
function send(type:string,data:object={}) {postMessage({type,run,...data});}
/** 짧은 묶음으로 GA를 진행하고 완성된 세대만 보낸다. */
function tick() {
  timer=undefined;if(!engine||paused||stopped)return;
  const completed:Generation[]=[];
  /** 완성 세대를 빠짐없이 묶어 보내고 공급·완료 알림 전에 확정한다. */
  const flush=()=>{if(completed.length){send('generations',{generations:completed.splice(0)});}};
  try {
    if(!iterator)iterator=engine.next();
    const until=performance.now()+12;
    do {
      const result=iterator.next();
      if(result.done) {
        iterator=null;const g=result.value;
        const generation={...g,number:g.number+generationOffset,evaluations:g.evaluations+evaluationOffset,individuals:displayIndividuals(g.individuals),boxes:engine.boxes,fixed:engine.fixed,round:supply?.round??1,weights:{...engine.weights},settings:{...engine.settings}};
        if(batchGenerations)completed.push(generation);else send('generation',{generation});
        if(stopped||paused){flush();return;}
        if(engine.generation>=engine.settings.generations) {
          if(supply){
            const best=engine.population.reduce((a,b)=>a.score>=b.score?a:b),expanded=supply.expand(best,engine.truck);
            if(expanded){
              flush();
              generationOffset+=engine.generation;evaluationOffset+=engine.evaluations;
              const next=new Engine(expanded,engine.truck,{...engine.settings,seed:(engine.settings.seed+1)>>>0},engine.weights,engine.fixed);
              next.requireFullAllocation=engine.requireFullAllocation;next.priorityUnloading=engine.priorityUnloading;
              next.seedLayout=expanded.map((_,i)=>best.evaluation.finalCoords[i]??[-1,-1,-1]);next.version=engine.version;engine=next;
              send('supply',{boxes:expanded,round:supply.round});break;
            }
            flush();send('capacity',{message:engine.boxes.length>=MAX_BOXES?'누적 상자 한도 400개에 도달했습니다.':'현재 배치에서 최소 규격 상자를 넣을 추가 공간·상차 경로를 찾지 못했습니다.'});
          }
          flush();paused=true;send('state',{state:'완료'});return;
        }
        if(performance.now()>=until)break;
        iterator=engine.next();
      }
    } while(performance.now()<until);
    flush();
    if(engine.requireFullAllocation&&iterator&&performance.now()-lastProgressAt>250){lastProgressAt=performance.now();send('allocationProgress',{generation:engine.generation+1+generationOffset,boxes:engine.boxes.length,population:engine.settings.population,...engine.allocationProgress});}
    timer=setTimeout(tick,0);
  } catch(e) {flush();stopped=true;send('error',{message:e instanceof Error?e.message:String(e)});}
}
/** 예약된 반복이 중복되지 않게 실행한다. */
function schedule() {if(timer===undefined)timer=setTimeout(tick,0);}
self.onmessage=async(event:MessageEvent<Command>)=>{
  const c=event.data;
  try {
    if(c.type==='start') {
      if(timer!==undefined)clearTimeout(timer);timer=undefined;run=c.run;engine=null;iterator=null;stopped=true;
      if(c.priorityUnloading)validateWebConfig(c.boxes,c.truck,c.settings,c.weights);
      engine=new Engine(c.boxes,c.truck,c.settings,c.weights,c.fixed,c.arrival);engine.requireFullAllocation=!!c.requireFullAllocation;engine.priorityUnloading=!!c.priorityUnloading;batchGenerations=!!c.batchGenerations;lastProgressAt=0;iterator=null;paused=false;stopped=false;send('state',{state:'실행'});schedule();
      supply=c.automatic?new AutomaticSupply(c.boxes,c.inputSeed??c.settings.seed,c.boxes.length):null;generationOffset=0;evaluationOffset=0;
    } else if(c.type==='experiment') {
      run=c.run;stopped=false;if(c.priorityUnloading)validateWebConfig(c.boxes,c.truck,c.settings,c.weights);
      const result=await runExperiments(c.boxes,c.truck,c.settings,c.weights,()=>stopped,(progress)=>send('experimentProgress',{progress}),!!c.priorityUnloading);
      if(!stopped)send('experiments',{result});
    } else if(c.run===run) {
      if(c.type==='pause') {paused=true;send('state',{state:'일시정지'});}
      if(c.type==='stop') {stopped=true;iterator=null;send('state',{state:'정지'});}
      if(c.type==='resume'&&engine&&!stopped&&engine.generation<engine.settings.generations) {paused=false;send('state',{state:'실행'});schedule();}
      if(c.type==='weights'&&engine) {
        if(engine.priorityUnloading)validateWebConfig(engine.boxes,engine.truck,engine.settings,c.weights);
        paused=true;
        // 부분 세대의 혼합 점수를 방지한다. 미완성 세대만 버리고 기존 집단·난수는 유지한다.
        iterator=null;const individuals=engine.reweight(c.weights);send('reweighted',{individuals:displayIndividuals(individuals),version:engine.version,weights:{...engine.weights}});send('state',{state:'일시정지'});
      }
    }
  }catch(e){send('error',{message:e instanceof Error?e.message:String(e)});}
};
```

함수·구성요소 역할(실제 문서화 주석):
- `function send(type:string,data:object=`: Worker의 최신 실행만 알린다. 메시지마다 실행 ID를 포함한다.
- `function tick()`: 짧은 묶음으로 GA를 진행하고 완성된 세대만 보낸다.
- `function schedule()`: 예약된 반복이 중복되지 않게 실행한다.

- 추가 수정 일시: 2026-11-16 13:13:21 (KST)

## 2026-11-16 13:13:21 (KST) — 자동공급연속진화

공급 회차의 세대 예산이 끝나면 새 상자를 생성해 다음 입력의 Engine을 자동 실행한다. 전체 세대 번호·평가 횟수는 누적하고 개체 ID와 부모 연결은 공급 회차 접두사로 구분한다. 이전 실제 배치 좌표를 새 초기 후보의 선호 좌표로 넘긴다.

총량 상한은 두지 않으며 최초 18개·추가 8개는 처리 묶음이다. 테스트 23개와 빌드가 통과했다. 브라우저 직접 검증은 미확인이다.
## 2026-11-16 19:23:49 (KST) 자동 공급 경계 수정

현재 동작·검증은 `Info/plan/2026-11-16/192349_자동공급세대계승수정_plan.md` 및 같은 기능의 최신 day에 기록했다. 이전 검증 기록은 당시 결과이며 현재 코드 스냅샷은 위에 갱신했다.

## 2026-11-16 19:27:59 (KST) 공급량 설정과 즉시 공급

최신 동작과 검증은 `Info/plan/2026-11-16/192759_공급량설정과소진즉시공급_plan.md`에 기록했다. 초기·추가 공급은 기본 20개이며 사용자가 양의 정수로 설정한다. 모든 상자를 실은 후보가 나오면 즉시 다음 회차로 연결한다. 세대의 localNumber로 조기 전환 시 누적 세대와 회차 내 세대를 구별한다.

## 2026-11-16 19:40:12 (KST) 누적 상차 유지

최신 누적 처리와 함수 호출·검증·한계는 `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md`에 기록했다. 자동 공급에서는 기존 상자 ID를 보존하면서 좌표 이동을 허용하며, 이번 회차에서 움직인 상자당 1회·해당 중량을 기존 누적 비용에 더한다. 함수 입력·반환값과 실제 처리 순서는 위 코드의 주석·자료형을 따른다.

- 2026-11-16 19:42:17 (KST) 최종 완료 조건: 자동 공급은 적재 부피100%일 때만 즉시 완료하며 가득 찬 개체를 표시한다. 작은 틈·세대 예산·공급량 소진으로 완료하지 않는다. 전체33개 테스트와 빌드 성공. 기준과 한계: `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md`.

- 2026-11-16 19:44:49 (KST) 최종 조건 보완: 매 세대 한 개체라도100% 또는 최소 상자 추가 공간이 없으면 즉시 완료하며 해당 개체를 표시한다. 단순 입구 차단 제외.35개 테스트·빌드 성공. 앞선100% 단독 조건은 `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md` 최종 절로 대체한다.

- 2026-11-16 19:48:40 (KST) 완료 적재율 입력: 기본100%, 자동 공급에서1~100% 설정. Worker 전달·검증과 부피 비율 이상 완료를 적용하며 추가 불가 조건 유지.37개 테스트·빌드 성공. 계획: `Info/plan/2026-11-16/194840_완료적재율입력설정_plan.md`.

- 2026-11-16 20:00:45 (KST) 3세대 정체 수정·ID 중복과 공간 겹침 금지: 기존 선호 좌표 우선, 실제 적재 상태에서 추가 상차 변이, 일부 자식 순서 유전자 복구, 최종 적재 검증을 적용했다.41개 테스트·빌드 성공. 실제 Worker3세대 최고점수 개체28개 적재. 상세: `Info/plan/2026-11-16/200045_3세대상차정체와중복겹침금지_plan.md`.

## 2026-11-16 20:04:38 (KST) 상자 ID 최종 기준

서로 다른 상자는 전체 입력·추가 공급에서 고유 ID를 사용하고 같은 상자는 세대·재배치 후에도 ID를 유지한다. 앞선 한 배치라는 표현으로 요구를 한정하지 않는다. 기존 구현은 이 기준을 유지한다. 확인 근거·강화한 검사: `Info/plan/2026-11-16/200438_상자ID전체공급고유성기준확정_plan.md`.

- 2026-11-16 20:05:01 (KST) 검증 완료: 공급 회귀 검사1개 통과.6회 추가 공급 전체66개 ID 유일성, 매 회차 이전 상자의 ID·데이터 보존, 신규 ID와 전체 기존 ID 비중복, seed재현성 확인. 실행 소스 변경 없음. 기존41개 전체 검사 결과를 새로 실행한 것으로 주장하지 않는다. 문서·검사 변경만 Public main에 반영한다.

## 2026-11-16 20:16:09 (KST) 짐칸 활용률 보상과 세대 상차 완료

기본 최대50점의 실제 짐칸 부피 활용률 보상과 입력·재적용을 추가했다. 추가 적재 공간 없음은 세대 상차 완료이며 다음 세대로 진화한다. 전체 완료는 설정 부피 목표(기본100%, 남은0%)에서 수행한다. 이전 공간 없음 즉시 전체 완료 동작은 이번 사용자 확정으로 대체한다.43개 테스트·빌드 성공. 자세한 입력·호출·검증·한계는 `Info/plan/2026-11-16/201609_짐칸활용률보상과세대상차완료_plan.md`.

## 2026-11-16 20:53:14 (KST) 현재 목적·입출력·호출·검증

하차 우선순위는 고정하고 방해 상자의 이동 횟수와 이동 중량을 최소화하는 배치를 탐색한다. 상부 하중은 별도 안정성 항목이다. 소스 타입·함수 주석과 실제 분기가 입력·단위·반환값·예외의 기준이며 구현 코드 전체를 위에 보존했다. Engine.evaluate→실제 상차→simulateLoaded 및 evaluateStackLoad→unloadingFitness, Worker와 비교 실험에서 호출한다. App은 동일 하차 평가기를3D 재생에 사용한다. 실제 적재물만 하차하고 미적재는 별도 표시한다.

총51개 검사·빌드 성공 및 소형27조건 비교 실험 예산 일치를 확인했다. 직접 브라우저 조작 미확인, 하중은 kg 상당의 사용자 정의 근사 규칙이다. 상세 계산·전후 변경·실측값·한계·관련기능은 `Info/plan/2026-11-16/205314_우선순위하차최적화와상부하중평가_plan.md`. 이전 상차 목적·하차 보류 기록은 당시 기록이며 이번 확정으로 대체한다.

## 2026-11-16 21:20:39 (KST) 첫 배포 복원

사용자가 첫 배포 상차 버전으로 복원하고 상자 할당 입력만 유지하도록 명시했다. 위 코드 스냅샷은 현재 복원본이다.24개 테스트·빌드 성공. 상세 복원 범위·초기값·제한·관련 기록은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`. 이전 구현·검증·보류·재승인은 당시 기록으로 보존하고 현재 동작 주장으로 사용하지 않는다.

## 2026-11-16 23:16:42 (KST) 전체 할당 조건 추가

현재 웹·비교 실험은 할당된 상자를 전부 실제 적재한 개체로만 세대를 구성한다. 유효 집단이 완성되기 전에는 세대를 올리지 않는다. 짐칸100% 조건과 다르며 상차 목적·기존 재이동 정의는 유지한다.30개 테스트·빌드 및 기본20개/3세대 전체 적재 확인. 상세 입력·복구·진행률·실패·호환 경로·재이동 정의: `Info/plan/2026-11-16/231642_할당상자전부배치세대조건과재이동정의_plan.md`.


## 2026-11-16 23:55:04 (KST) 첫 세대 지연 수정

전체 코드 스냅샷을 현재 소스와 맞췄다. 비기본35개 지연 재현·compact 배치 보완·준비 진행률과 시도 표시. 목적·세대 완료 조건·재이동 정의 유지. 상세 결과와 한계: `Info/plan/2026-11-16/235504_1세대지연과비기본설정검증_plan.md`.34개 테스트·빌드 통과.


## 2026-11-17 00:10:50 (KST) 완료 시점 내보내기 연결

계획 `Info/plan/2026-11-17/001050_완료시점결과이미지다운로드_plan.md`. 완료 확정·3D 캡처·실제 가중치 스냅샷 사용처를 연결했다. 주목적·상차 점수 유지. 실제코드 전체갱신.41개검사·빌드통과,브라우저최종결과는계획참조.


## 2026-11-17 00:18:02 (KST) 직접 다운로드 검증 완료

완료전잠금·23개완성세대확정·PNG/SVG/ZIP31파일·완료후다른개체선택시같은3D해시·초기화/새실행재잠금·수동완료구분을확인했다.최종회차별seed메타데이터와실제코드스냅샷갱신.상세근거·한계·배포는`Info/plan/2026-11-17/001050_완료시점결과이미지다운로드_plan.md` 참조.


## 2026-11-17 00:35:18 (KST) 결과 보존 성능 측정 도구

계획 `Info/plan/2026-11-17/002502_시뮬레이션계산과3D성능최적화_plan.md`.Engine자체는수정하지않고기존설정의3세대시간과시간제외전체Generation해시를출력한다.목적·점수식유지.측정환경에따라시간은달라지며대조결과는계획참조.

### `scripts/benchmark.ts`

```tsx
import {createHash} from 'node:crypto';
import {Engine,finishGeneration} from '../src/ga/engine';import {generateBoxes,DEFAULT_SETTINGS,DEFAULT_TRUCK,DEFAULT_WEIGHTS} from '../src/domain/model';
const generationCount=Number(process.argv.find(v=>v.startsWith('--generations='))?.split('=')[1]??3);
if(!Number.isInteger(generationCount)||generationCount<1||generationCount>300)throw Error('세대 수는 1–300 정수여야 합니다.');
const configs=process.argv.includes('--large')?[100,220].map(count=>({count,inputSeed:2026,truck:DEFAULT_TRUCK,...DEFAULT_SETTINGS,weights:DEFAULT_WEIGHTS})):[{count:35,inputSeed:731,truck:{width:180,depth:400,height:180},population:24,seed:913,crossover:.7,mutation:.2,tournament:4,weights:{base:135,moves:4,mass:.5,space:35}},{count:48,inputSeed:416,truck:{width:240,depth:600,height:240},population:6,seed:51,crossover:1,mutation:.1,tournament:5,weights:{base:60,moves:0,mass:0,space:75}}];
/** 같은 seed의 세대 전체(시간 제외)를 해시하여 성능 비교 시 결과 변경을 구분한다. */
const reports=[];
for(const c of configs){const e=new Engine(generateBoxes(c.count,c.inputSeed),c.truck,{...DEFAULT_SETTINGS,...c,generations:generationCount},c.weights);e.requireFullAllocation=true;e.priorityUnloading=process.argv.includes('--priority');const times=[],hashes=[],attempts=[],loadedRanges:number[][]=[],bestScores:number[]=[];
 for(let i=0;i<generationCount;i++){const g=finishGeneration(e);times.push(g.elapsed);attempts.push(g.attempts);loadedRanges.push([Math.min(...g.individuals.map(p=>p.evaluation.loaded)),Math.max(...g.individuals.map(p=>p.evaluation.loaded))]);bestScores.push(g.best);hashes.push(createHash('sha256').update(JSON.stringify({...g,elapsed:0})).digest('hex'));}
 const report={objective:e.priorityUnloading?'priority-unload':'loading-compat',configuration:{...c,generations:generationCount},count:c.count,ms:times.map(n=>Math.round(n)),total:Math.round(times.reduce((a,b)=>a+b,0)),hashes,attempts,loadedRanges,bestScores};reports.push(report);console.log(JSON.stringify(report));}
console.log(JSON.stringify({note:'ms는 현재 환경의 계산 시간이며 브라우저 표시 시간과 다를 수 있습니다.',reports},null,2));
```


## 2026-11-17 01:01:28 (KST) 100개·220개 정체 추가 최적화

목적/점수/물리제약/전체할당/완료시다운로드유지.기존정체초기집단에구획복구,필요조건빠른거부,상자사이협력실행을추가했다.52개검사·빌드·기본각100세대계측/브라우저확인.동작변화와설정·시간·한계: `Info/plan/2026-11-17/004153_100개220개대규모입력추가최적화_plan.md`.위실제코드전체갱신.


## 2026-11-17 01:37:10 (KST) 상자별 우선도 실평가 연결

입력/우선순하차/GA점수/재생/내보내기연동.66개검사·빌드통과.작동순서·함수별역할·정책변경·단위·제약·검증은 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md`.위전체소스는현재구현이다.


## 2026-11-17 01:51:14 (KST) 최종 확인

67개 검사와 타입검사·빌드 통과. 공개 브라우저 6개 우선도 수정/배송순서/PNG·ZIP, 100·220개 집단50·3세대와 일시정지·재개 확인. Pages 성공. 상세 조건·시간·가정·증거는 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md` 최종 기록. 현재 전체 소스 스냅샷 동기화 완료.


## 2026-11-17 02:00:56 KST 입력 반영·누적400 제한

수량은1~400 정수로 보정한다. 초과는 편집 중 즉시400, 빈값/0/음수/소수는 편집 완료 시1 또는 정수로 보정하고 경고를 표시한다. generateBoxes/validateConfig도 범위를 검사해 UI 우회를 거부한다. 자동 공급 마지막 묶음은 min(회당 개수,400−누적)만 추가하고 누적400이면 더 만들지 않는다. 고유 ID/기존 우선도를 보존한다.

고정·자동 일반 입력은 resolveBoxInput으로 최신 수량/seed를 실행 직전에 실제 목록에 반영한다. 동일 수량/seed는 편집한 우선도를 보존한다. 비교실험에도 같은 목록 해석을 적용한다. 순차 도착 이후 수량/seed 변경은 재생성 안내 후 거부해 기존 도착/고정 배치를 조용히 버리지 않는다.

가중치 적용은 첫 세대 전에도 Worker로 전달한다. Worker 확인 응답 후 적용식을 갱신하고 현재 집단 최고 점수와 선택 개체 점수를 즉시 갱신한다. 과거 세대의 당시 점수/그래프는 보존하며 현재 재평가 수치는 ‘새 가중치’로 구분한다. 새 실행과 초기화에서 현재 재평가 최고값을 지운다. 집단·세대·교차/변이·k·GA seed·짐칸은 초기화 후 다음 실행에 적용하고 실행 중에는 잠근다.

세대 조건은 기존 Engine.requireFullAllocation/priorityUnloading을 유지한다. 모든 개체가 전체 할당 상자를 경계/비겹침/지지/유효 상차·우선순 하차 조건으로 평가받아야 완성 세대가 된다. 불가능한 부피/치수 또는 유한 탐색 실패에서는 세대를 올리지 않고 원인을 표시한다. 누적400 한도는 적재 가능성을 보장하는 조건이 아니다.

검사: 총75개 통과/실패0, production 타입검사·빌드 통과. 100/256/360/400개 각각 비기본 입력seed731, GAseed913, 집단6, 2세대, 교차.65/변이.17/k4, 짐칸320×700×300, 가중치137/3/.3/31로 실제 Worker를 실행했다. 첫 세대 전 가중치 적용 뒤 모든 세대·개체의 실제 상자수/배송수/점수식/설정/버전2를 검사했다. 390→400 자동 공급 뒤 한도 사유로 완료하는 실제 Worker도 검사했다.

측정: 위 조건의 세대 시간(ms)은100개814/22756, 256개1336/398, 360개2007/956, 400개2117/1018이었다. 테스트 병렬 실행 환경의 측정이며 순수 계산 벤치마크가 아니다. 100개 두 번째 세대는 유효 후보 복구/탐색이 오래 걸렸지만 완성됐다. 입력에 따라 시간은 달라지며 일정 속도/매 세대 점수 개선을 보장하지 않는다.

브라우저: 10000 입력→400 경고/보정, 0/빈값→1 확인. 자동 공급을 끈 고정 입력에서256을 입력하고 다시 생성 버튼 없이 시작→실제256개 전량 적재/하차, 집단6·2세대·비기본 설정 반영 확인. 최종 소스에서400개도 재생성 없이 시작, 첫 세대 준비 중 가중치 변경→일시정지→재개→400개 전량 적재/하차/2세대 v2 완료. 그 뒤 moves3→7 재평가로 -102556.79→-190700.79, 22036회×4=88144 감점 차이 일치. 과거 세대 점수는 기록값으로 유지, 현재최고/선택점수/적용식은 새 값 표시. 개발 중 HMR로 이전 Worker가 정리된 뒤 남은 화면에는 응답이 없었으므로 최종 확인은 새로고침한 최종 코드로 수행했다.

공개 배포: gh-pages5a26e2605da61d619af417fcfd990f2dc928d5b7, Pages Actions43913323612 success. UI index-DBxvyf4a.js, Worker evolution-BRu2GaIS.js. 공개 브라우저에서도1000→400 경고·보정과 에셋 표시를 확인했다. 콘솔 오류/경고0. 실제 화면 증거 docs/images/input-limit-warning.jpg 및 docs/images/input-400.jpg. 로컬 임시 테스트 로그는 artifacts/input-limit에 보관(공개 대상 제외).

상세 계획·승인·환경·함수 및 검사 기록: `Info/plan/2026-11-17/015406_입력반영과누적400제한_plan.md`. 위 전체 코드는 현재 구현이다.


## 2026-11-17 02:27:16 KST 기본짐칸 전량 후보 생성 복구

원인인 고정 구획 분절을 보완하는 supportSurfacePack을 추가했다. 기존 partitionPack이 전량 후보를 만들면 그대로 사용한다. 부분 후보이면 새 웹의 우선순 하차 모드에서만 추가 전략을 실행한다. 실패 감점5점/입력창은 사용자가 철회했으므로 구현하지 않았고 점수식·가중치는 그대로다.

새 전략은 각 지지면의 비어 있는 최대 사각형 후보를 겹치는 형태로 보관한다. 실제 상자를 놓으면 점유 영역을 네 방향으로 빼고 같은 높이에서 다른 후보에 포함된 사각형을 제거한다. 서로 겹치는 후보는 선택 가능 영역 표현이며 실제 상자 중복 배치가 아니다. 상자 윗면만 새 지지면으로 추가하고 상한 높이를 검사하므로 하부 전체 지지를 유지한다. footprint 면적 순서에 작은 seed 난수를 적용하고 짧은 잔여 변 우선/잔여 면적 우선 두 선택법을 번갈아 시도한다.

dependencyLoadingOrder는 지지하는 아래 상자→윗상자, 안쪽 상자→그 경로를 막을 앞 상자의 간선을 만들어 위상 정렬한다. 순환이면 null이다. 좌표가 있어도 상차 순서를 잘못 정하면 적재 실패가 생기므로 단순 생성 순서 대신 이 순서를 평가기에 전달한다. 경계/겹침/지지/전체 할당과 실제 상차·우선도 하차는 기존 평가기가 다시 검사한다. 입력 상자의 크기·방향·ID·우선도를 바꾸지 않는다.

Engine.rescuePack은 기존 후보와 새 후보의 배치 개수를 비교해 더 많이 놓인 후보를 반환한다. 유효 개체를 완성하기 전 추가 전략은 최대32회이며 성공하면 카운터를 초기화한다. 해결 불가이면 실제 수용 불가를 확정하지 않는 안내와 함께 현재 세대를 유지한다. 완료하지 못한 후보의 배치 개수도 진행 상황에 표시하며 미완성 집단은 세대 승인하지 않는다. 고정 좌표가 있는 경로는 기존 생성기로 보존한다.

자동 공급 다음 회차의 seedLayout은 예전 조밀한 좌표 뒤에서 새 위치를 전수 탐색하다 오래 걸릴 수 있었다. 우선도 하차 모드·고정 좌표 없음·이전 입력 좌표가 있는 새 Engine은 처음부터 복구 전략을 사용한다. 기존 상자의 ID/우선도는 공급기가 보존하고 좌표 재배치는 허용한다. 상자 누적1~400과 공급 규칙은 그대로다. 기존 legacy 상차 API에서는 새 복구/순서 확장 분기를 실행하지 않아35/48개 전체 세대 해시도 유지했다.

검사: 총82개 통과/실패0, 약58.9초(여러 파일 병렬 실행). production 타입검사/빌드 통과, 기존500kB 번들 경고 유지. 기본짐칸220×520×220, 입력/GAseed2026, 집단50, 2세대에서256/360/400개 모두 모든50개체의 실제 적재/배송 개수·최종 배치 유효성·원래 점수식·엘리트 최고점 비감소를 확인했다. 새 후보8조건(seed11/731/913/2026×두전략)의 배치된 상자 부분집합도 경계/겹침/지지 검사를 통과했다. 높이10의100×100평면에60×60상자2개처럼 부피만으로는 거르지 못하는 불가능 입력은 부분 후보를 승인하지 않고 제한된 복구 뒤 원인을 알렸다.

실제 Worker의 세대별 elapsed(ms):256개4454/3952,360개10398/10230,400개14012/13776. 테스트 병렬 실행 환경의 측정이며 브라우저 일정 속도 보장이 아니다. 최고점은256개-178817.9→-171223.7,360개-352030.6 유지,400개-450776.38 유지. 매 세대 점수 개선을 보장하지 않는다. 기존6000회/0개체 오류가 난 기본 조건과 같은 짐칸으로 재검증했다. 더 큰 짐칸의 기존100/256/360/400 비기본 가중치 검사도 통과했다.

중간 회귀에서390→400 자동 공급 검사가30초 안에 끝나지 않는 문제가 드러나 이전 seedLayout 전수 탐색을 위의 직접 복구 경로로 수정했다. 단독 실제 Worker 검사 약2.4초에 완료했고 최종 전체 검사도 통과했다. 초기에 구 하차 호환 경로까지 새 순서 복구가 적용되어35/48 해시가 바뀐 것은 priorityUnloading 조건으로 적용 범위를 제한해 해결했다. 원래 성공 경로·기존 하차 trace 해시 검사는 모두 유지됐다.

로컬 브라우저는 최종 코드 새로고침 후 기본짐칸·집단50·256개/2세대,400개/2세대를 각각 실행해 완료를 확인했다. 미적재0,우선순하차400개,선택개체적재400개가 표시되고 alert/콘솔error·warn0이었다. 자동 공급400개도 한도 안내 후2세대 완료했다. 실제 증거는 docs/images/default-truck-400-fixed.jpg. 장면 밖의 기존 택배 팔레트 소품은 실제 배치 좌표/상자 개수에 포함하지 않는다.

한계: 이 수정은 일반3D포장 최적해/모든 seed 입력의 성공을 보장하지 않는다. 물리적으로 불가능하거나 유한 탐색에서 전량 집단을 못 찾으면 세대를 올리지 않는다. 실패 후보를 점수 감점으로 받아들이거나 상자 크기를 줄이거나 겹침을 허용하지 않는다. 별도 실패 감점 요청은 철회되어 관련 상태·점수·입력 필드를 추가하지 않았다.

승인/목표/환경·작동/검증·한계는 `Info/plan/2026-11-17/021302_기본짐칸전량후보생성수정_plan.md`. 위 전체 소스는 현재 코드다.


### `scripts/range-sweep.ts`

```tsx
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Engine,finishGeneration} from '../src/ga/engine';
import {CONFIG_RANGES,rangeSteps,validateWebConfig,effectiveCrossover} from '../src/domain/ranges';
import {DEFAULT_SETTINGS,DEFAULT_WEIGHTS,DEFAULT_TRUCK,type Box,type Vec,type Settings,type Weights,type Individual} from '../src/domain/model';
import {simulate} from '../src/simulation/unload';
import {priorityFitness} from '../src/simulation/objective';
import {priorityOrder} from '../src/domain/priority';
import {validateLayout,blockers,fits,type Placed} from '../src/domain/packing';
const boxes:Box[]=[{id:1,size:[20,20,20],weight:2,priority:5,grade:0},{id:2,size:[20,20,20],weight:3,priority:1,grade:1}];
/** 실제 하차 재생의 모든 전이를 검사한다. 겹침·지지·입구 경로·중복 배송·횟수/중량을 확인한다. */
export function checkReplay(input:Box[],p:Individual,truck=DEFAULT_TRUCK):number {
 const ev=simulate(input,p.evaluation.finalCoords,truck,true,true);assert.equal(ev.valid,true,ev.reason);
 const byId=new Map(input.map(b=>[b.id,b])),inside=new Map(input.map((b,i)=>[b.id,[...p.evaluation.finalCoords[i]] as Vec])),outside=new Set<number>(),delivered:number[]=[];
 let moves=0,mass=0;
 for(const event of ev.events){const b=byId.get(event.boxId)!;assert.ok(b);const rest:Placed[]=[...inside].filter(([id])=>id!==b.id).map(([id,pos])=>({box:byId.get(id)!,pos}));
  if(event.kind==='return'){assert.ok(outside.has(b.id));assert.ok(!inside.has(b.id));assert.ok(event.to);assert.ok(fits(b,event.to,rest,truck));assert.equal(blockers({box:b,pos:event.to},rest).length,0);outside.delete(b.id);inside.set(b.id,event.to);}
  else {assert.ok(inside.has(b.id));assert.deepEqual(event.from,inside.get(b.id));assert.equal(blockers({box:b,pos:event.from!},rest).length,0);inside.delete(b.id);if(event.kind==='deliver'){assert.ok(!delivered.includes(b.id));delivered.push(b.id);}else outside.add(b.id);}
  if(event.kind==='out'||event.kind==='return'){moves++;mass=Math.round((mass+b.weight)*10)/10;}
  assert.equal(event.moves,moves);assert.equal(event.mass,mass);assert.equal(validateLayout([...inside.keys()].map(id=>byId.get(id)!),[...inside.values()],truck),null);
 }
 assert.deepEqual(delivered,priorityOrder(input).map(b=>b.id));assert.equal(inside.size,0);assert.equal(outside.size,0);assert.equal(ev.moves,p.unloading!.moves);assert.equal(ev.mass,p.unloading!.mass);return ev.events.length;
}
/** 다른 항목은 고정하고 각 범위11단계를 실제 실행한다. 세대 항목은 지정한 수까지 각각 완주한다. */
export function runRangeSweep(){
 const rows:unknown[]=[];let totalGenerations=0,totalEvents=0;
 const cases=[...(['base','moves','mass','space'] as const).map(key=>({group:'weights',key,range:CONFIG_RANGES.weight})),...(['population','generations','crossover','mutation','tournament'] as const).map(key=>({group:'settings',key,range:CONFIG_RANGES[key]}))];
 for(const entry of cases)for(const [stage,value] of rangeSteps(entry.range).entries()){
  const settings:Settings={...DEFAULT_SETTINGS,population:2,generations:3},weights:Weights={...DEFAULT_WEIGHTS};if(entry.group==='weights')(weights as any)[entry.key]=value;else(settings as any)[entry.key]=value;
  if(settings.population===0){assert.throws(()=>validateWebConfig(boxes,DEFAULT_TRUCK,settings,weights),/집단을 1 이상/);rows.push({field:entry.key,stage,percent:stage*10,value,status:'실행 없이 안내 확인'});continue;}
  validateWebConfig(boxes,DEFAULT_TRUCK,settings,weights);const e=new Engine(boxes,DEFAULT_TRUCK,settings,weights);e.requireFullAllocation=true;e.priorityUnloading=true;const start=performance.now();let last!:ReturnType<typeof finishGeneration>;
  for(let g=1;g<=settings.generations;g++){last=finishGeneration(e);assert.equal(last.number,g);assert.equal(last.individuals.length,settings.population);for(const p of last.individuals){assert.equal(p.evaluation.loaded,boxes.length);assert.equal(p.unloading!.delivered,boxes.length);assert.equal(p.score,priorityFitness(p.evaluation,p.unloading!,weights));}totalGenerations++;}
  const probeTruck={width:20,depth:40,height:20},probeEngine=new Engine(boxes,probeTruck,settings,weights);probeEngine.priorityUnloading=true;probeEngine.requireFullAllocation=true;
  const probe=probeEngine.evaluate([[0,20,0],[0,0,0]],[],'가중치 실제 반영 검사',false,[1,2])!;assert.ok(probe);assert.equal(probe.unloading!.moves,2);assert.equal(probe.unloading!.mass,6);assert.equal(probe.score,Math.round((weights.base+(weights.space??20)-2*weights.moves-6*weights.mass)*100)/100);const probeEvents=checkReplay(boxes,probe,probeTruck);totalEvents+=probeEvents;
  const best=last.individuals.reduce((a,b)=>a.score>=b.score?a:b),events=checkReplay(boxes,best);totalEvents+=events;
  rows.push({field:entry.key,stage,percent:stage*10,value,status:'완주·재생 통과',generations:last.number,population:last.individuals.length,settings,weights,effectiveCrossover:effectiveCrossover(settings.crossover),best:best.score,moves:best.unloading!.moves,mass:best.unloading!.mass,replayEvents:events,probe:{truck:probeTruck,score:probe.score,moves:2,mass:6,replayEvents:probeEvents},ms:Math.round(performance.now()-start)});
 }
 assert.equal(rows.length,99);return {schema:1,createdAt:new Date().toISOString(),fixture:{boxes,truck:DEFAULT_TRUCK},note:'항목별11단계, 타항목 고정. 전체 설정 직교곱이 아님. 집단0은 안내만 확인. 계산시간은 해당 환경 측정.',cases:rows.length,executed:98,blockedAsDesigned:1,totalGenerations,totalEvents,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=runRangeSweep();mkdirSync('artifacts/range-sweep',{recursive:true});writeFileSync('artifacts/range-sweep/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({cases:report.cases,executed:report.executed,blocked:report.blockedAsDesigned,generations:report.totalGenerations,replayEvents:report.totalEvents}));}
```


## 2026-11-17 03:34:49 KST 최종 설정 범위·전구간검증

최종사용자범위는가중치전체1~501/집단0~101/세대1~10001/교차.1~1.1/변이.01~1/k1~6. 집단0은실행안내만,1부터실행한다. 교차입력1.1을보관하되실제확률은1이상100%이며화면·다운로드에입력과실제값을구별한다. 짐칸기본220×520×220과상자누적1~400은유지한다. 실패감점추가없음.

model.CONFIG_RANGES를UI속성·Worker웹검증·11단계검사의단일범위정의로사용한다. normalizeNumber는빈값/무한대/범위밖/정수항목을편집완료에보정하며범위안의소수는그대로보존한다. Field는별도보정안내와안정적인aria-label을사용한다. 집단0안내는Worker생성이전에발생하며Worker도우회명령을재검증한다. 난수값은상자생성과진화계산의재현용임을화면에설명했다. k는복원추출로집단보다클수있다. 일반독립API는과거0가중치/0교차·변이실험을호환하되웹은validateWebConfig로새최소/최대범위를적용한다. 웹비교실험의0교차/0변이조건은.1/.01로바꾸고독립구상차비교조건은유지한다.

범위검사에서상자100/집단101/변이1의2세대가90초내완료되지않아우선순하차offspring도구획·지지면복구경로를사용하도록수정했다. 개별위치전수탐색대신좌표변이후물리복구를수행하며전체상차·하차평가는그대로다. 구상차API는기존분기로유지해35/48전체세대해시를보존했다. 최종전체검사에서이조합은약26.1초에2세대완료했다.

10001세대의세대당setTimeout예약과메시지/화면갱신대기가누적되어전체병렬검사에서는90초에8658세대까지만끝난사례가있었다. tick의12ms예산안에서작은완료세대여러개를계산하고웹명령의batchGenerations=true일때완성된세대를배열로전달한다. App은배열을한번에history에추가하고마지막선택을갱신한다. 세대를생략하지않으며공급/완료/오류알림전에묶음을flush한다. 기존단일메시지명령도호환하고정지/일시정지의동기테스트콜백도존중한다. 작은집단1의10001세대는최종Worker검사48ms,묶음10001세대는2메시지로확인했다. 이는작은입력의측정이며일반속도배수로주장하지않는다.

검사:90개통과/실패0,전체약61.4초. 항목별11단계99조건중0집단안내1건과실제완주98건,총55,272세대/588재생전이검사. 실제재이동2회/6kg의고정배치검사로비용가중치도계산에연결됐음을검사했다. 전체값·상태·수치는 `Info/report/2026-11-17/2026-11-17_033449_설정범위11단계검사_report.md`. 재현명령npm run range-test,새패키지없음. 타입검사/production빌드성공,기존큰번들경고유지.

로컬3상자/집단2/10001세대·최대교차/변이/가중치/k의완주·개체선택·하차재생·확정,6상자/집단101/3세대상차·하차재생을확인했다. 공개100상자/집단101/2세대최대설정완료/재생도확인했다. 최종실행이후콘솔오류0. UI수치영역넘침없음. 실제증거docs/images/ranges-10001-complete.jpg,ranges-max-settings.jpg,ranges-public-max.jpg. 이전실행의반복갱신경고로그는최종실행시각으로구별했다.

배포: gh-pages85e42214ccd315e46749eb64ea4f5691eb7dad31,Pages43929516607 success,UI index-CmmI9d1A.js/Worker evolution-BxiEfROi.js. 기존Public전체프로젝트승인으로소스·문서push예정. 남은확인범위내문제없음. 모든seed/실수값/최대입력전체직교곱의성공·일정시간을보장하지않는다.

상세목표·승인·환경·작동및검증은 `Info/plan/2026-11-17/031259_설정범위와10퍼센트단계검증_plan.md`. 위전체소스는현재코드다.


## 2026-11-17 14:33:01 KST 우선순 전량 하차 최종 조건

사용자 승인: 높은우선도상자를빨간차목표,낮은우선도방해상자를이동비용의대상으로보는비유에동의하고전량하차를다음세대전환의최종조건으로명시했다. 기존모듈의높은우선도→동점ID하차,방해물out/return각1회·해당kg감점,목표배송deliver감점제외는유지했다. 새실패5점감점·새이동물리·우선도별가중치배수는추가하지않았다.

변경전Engine.evaluateSteps는하차valid를확인했지만delivered의할당수일치명시검사는없었다. 세대엘리트는상차loaded수만검사했고부모선택은원래집단을사용했다. 현재정상하차모듈은원래모두배송하고valid를반환했으며,과거실제부분하차유효결과가발생했다는증거는없다. 이번변경은추가된최종조건을코드의명시적인승인규칙으로강화한것이다.

변경후completedUnloading은현재할당의전량상차valid/loaded=n/unloadedIds빈목록,하차valid/delivered=n,현재입력의우선순ID열과동일한unloadOrder를요구한다. 이조건을엘리트와부모풀필터·새후보수집·최종세대확정에같이사용한다. select/offspring의pool인수는생략시기존집단이며우선순하차모드에서는완료부모풀만전달한다. 미완료고득점캐시가있어도엘리트/부모로선택하지않는다.

평가기는하차valid여도delivered가할당수와다르면후보를거부한다. priorityUnloadSteps의마지막에서는delivered=n/activeCount=0/모든고유상자배송비트완료를검사한다. 임시꺼냄은배송완료로집계하지않는다. next는전체설정집단수의유효개체를모은뒤다시전원완료를검사하고그때에만population과generation을확정한다. 실패후보는제외하고새후보를재시도하며유한탐색안에완료집단을못만들면이전세대번호/집단을유지한다. 단독priorityUnloading=true도전량상차의물리사전검사·복구조건을사용한다. 구상차호환모드의선택/해시동작은유지했다.

UI준비진행은‘상차·하차완료N/집단수’로표시하고입력설정에도전원전량하차후다음세대조건을명시했다. 완료는하차시뮬레이션계산의완료이며3D재생은계산된기록의확인이다. 모든개체의애니메이션재생이끝날때까지GA를대기시키는동작은추가하지않았다.

검사:97개통과/실패0,전체약62.5초. 새7개는실제P5목표뒤/P1방해물앞의out2→deliver1→return2→deliver2와2회/6kg·26점감점(같은보상120→94),동점ID,미완료/실패/잘못된순서/기록없는고득점엘리트·부모제외,부분후보수집거부,실패시이전세대유지,수집중메타데이터손상시최종확정거부,실제생성기중간yield시세대번호0유지를검사한다. 테스트전용부분결과·캐시손상은회귀검사장치이며운영코드에오류를넣거나실제발생버그라고기록하지않는다.

97개전체검사에는기본짐칸256/360/400개·집단50·2세대전량적재/배송,10001세대와묶음메시지/부모연결,100/220일시정지·재개,기존35/48상차호환해시와하차이벤트해시·모든이벤트안전/ID/비용·내보내기등이포함된다. 별도npm run range-test도99조건(실행98/집단0안내1),55,272세대/588재생전이를다시통과했다. 타입검사/production빌드통과. 기존큰번들경고유지.

로컬기본설정에서자동공급을끄고100상자·집단50·2세대를실행했다. 준비화면‘상차·하차완료0/50’,2세대완료,미적재0/우선순하차100개를확인했다. 선택개체g2-i73의마지막배송#59/P1에서누적1484회/7283.4kg이선택평가와일치했고짐칸안이비었다. 콘솔오류·경고0. 실제증거docs/images/unloading-all-complete.jpg,짐칸밖기존팔레트소품은입력상자가아니다.

공개배포도20상자·집단8·3세대를실행해완료와마지막배송#8/P1·22회/44.4kg재생을확인했다. 새UI index-BQ36xy56.js/Worker evolution-CS94fxQO.js,gh-pages f0affab2e847b16b55cbecacea26c2fe597ddaea,Pages44024324653 success. 공개콘솔오류·경고0. 기존Public전체프로젝트승인으로이번소스·문서를반영한다.

검사범위내새독립문제없음. 모든입력의물리적포장가능성/최적해/일정완료시간을보장하지않고,전량하차실패후보를점수만으로통과시키지않는다. 임시대기공간·직선인출·전체밑면지지등기존모델가정은유지한다. 환경Info/기술환경.md,새의존성없음.

계획·승인·처리·검증·한계는 `Info/plan/2026-11-17/142042_우선순전량하차세대완료조건_plan.md`. 위전체코드는현재구현이다.

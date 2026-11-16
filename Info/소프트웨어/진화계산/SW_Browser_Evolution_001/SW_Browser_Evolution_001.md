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
  /** 같은 상태에서 토너먼트로 부모를 선택한다. 음수 점수도 그대로 비교한다. */
  select():Individual {
    let best=this.population[this.rng.int(0,this.population.length-1)];
    for(let k=1;k<this.settings.tournament;k++) {const p=this.population[this.rng.int(0,this.population.length-1)];if(p.score>best.score)best=p;}
    return best;
  }
  /** 상자별 좌표 묶음 1점 교차와 유효 위치 변이, 최소 배치 수정을 수행한다. */
  offspring(): {coords:Vec[];loadOrder:number[];repairOrder?:number[];parents:string[];operation:string;repaired:boolean}|null {
    const a=this.select(),b=this.select();const cross=this.rng.next()<this.settings.crossover && this.boxes.length>1;
    const cut=cross?this.rng.int(1,this.boxes.length-1):this.boxes.length;
    const coords=this.boxes.map((_,i)=>[...(i<cut?a.coords[i]:b.coords[i])] as Vec);let mutated=false;
    for(let i=0;i<coords.length;i++) {
      if(this.fixed[this.boxes[i].id] || this.rng.next()>=this.settings.mutation)continue;
      // 구획 복구 모드에서는 좌표 유전자를 변이한 뒤 공통 복구기로 충돌·지지를 보장한다.
      if(this.partitionMode){const size=this.boxes[i].size;coords[i]=[this.rng.int(0,this.truck.width-size[0]),this.rng.int(0,this.truck.depth-size[1]),this.rng.int(0,this.truck.height-size[2])];mutated=true;continue;}
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
    const result=this.partitionMode?(validateLayout(this.boxes,coords,this.truck)?this.rescuePack(coords):{coords,repaired:false,loadOrder:this.boxes.map((b,i)=>({id:b.id,back:coords[i][1]+b.size[1],z:coords[i][2]})).sort((a,b)=>b.back-a.back||a.z-b.z).map(b=>b.id)}):pack(this.boxes,this.truck,this.rng,coords,this.fixed,true,this.requireFullAllocation);
    if(!result)return null;
    return {...result,loadOrder,...(this.partitionMode?{repairOrder:result.loadOrder}:{}),parents:cross?[a.id,b.id]:[a.id],operation:(cross?(mutated?'교차·변이':'교차'):(mutated?'변이':'선택 복제'))+(this.partitionMode&&result.repaired?'·구획 복구':'')};
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
    if(extra&&!extra.valid)return null;
    const unloading=extra?{valid:extra.valid,reason:extra.reason,moves:extra.moves,mass:extra.mass,delivered:extra.delivered}:undefined;
    return {...(unloading?{unloading,unloadOrder:priorityOrder(this.boxes).map(b=>b.id)}:{}),id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents,operation,repaired,coords,loadOrder,evaluation,score:unloading?priorityFitness(evaluation,unloading,this.weights):loadingFitness(evaluation,this.weights),version:this.version};
  }
  /** 독립 동기 호출도 동일 평가 경로를 사용한다. */
  evaluate(coords:Vec[],parents:string[],operation:string,repaired:boolean,loadOrder=this.boxes.map(b=>b.id)):Individual|null {const it=this.evaluateSteps(coords,parents,operation,repaired,loadOrder);let r=it.next();while(!r.done)r=it.next();return r.value;}
  /** 개체 한 번 시도마다 양보하여 Worker가 정지·취소 메시지를 처리하게 한다. */
  *next():Generator<void,Generation,void> {
    const start=performance.now(),next:Individual[]=[];let attempts=0,accepted=0,rescueInitial=this.priorityUnloading&&!!this.seedLayout&&!this.population.length&&!Object.keys(this.fixed).length;
    this.allocationProgress={ready:0,attempts:0,mostLoaded:0};
    if(this.requireFullAllocation){
      if(this.boxes.some(b=>b.size.some((v,i)=>v>[this.truck.width,this.truck.depth,this.truck.height][i])))throw Error('할당 상자 중 짐칸 치수를 넘는 상자가 있어 전부 배치할 수 없습니다. 초기화 후 입력을 조정하세요.');
      if(this.boxes.reduce((n,b)=>n+b.size[0]*b.size[1]*b.size[2],0)>this.truck.width*this.truck.depth*this.truck.height)throw Error('할당 상자의 총부피가 짐칸보다 큽니다. 다음 세대로 넘어가지 않습니다. 초기화 후 할당 개수를 줄이세요.');
    }
    const eligible=this.requireFullAllocation?this.population.filter(p=>p.evaluation.loaded===this.boxes.length):this.population;
    if(eligible.length) {
      const best=eligible.reduce((a,b)=>a.score>=b.score?a:b);
      next.push({...best,id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents:[best.id],operation:'엘리트',coords:best.coords.map(p=>[...p] as Vec)});
      this.allocationProgress.ready=next.length;this.allocationProgress.mostLoaded=best.evaluation.loaded;
    }
    while(next.length<this.settings.population) {
      if(++attempts>this.settings.population*120) throw Error(`할당 조건을 만족하는 유효 집단을 생성하지 못했습니다 (${next.length}/${this.settings.population}). 현재 세대는 유지됩니다. 초기화 후 입력·적재함·고정 배치를 확인하세요.`);
      this.allocationProgress.attempts=attempts;
      const child=this.population.length?this.offspring():null;
      // 최초 시도가 실패해 완전 후보가 하나도 없을 때만 초기화 전략을 전환한다.
      // 기존 초기 집단이 바로 생성되는 입력은 후보·난수 순서를 그대로 유지한다.
      rescueInitial ||= !this.population.length&&this.requireFullAllocation&&attempts>1&&!next.length&&!Object.keys(this.fixed).length;
      const rescue=rescueInitial;
      if(rescue)this.partitionMode=true;
      const candidate=this.population.length?child:rescue?this.rescuePack():(yield* packSteps(this.boxes,this.truck,this.rng,attempts===1?this.seedLayout:undefined,this.fixed,true,this.requireFullAllocation,this.requireFullAllocation));
      if(candidate) {
        this.allocationProgress.mostLoaded=Math.max(this.allocationProgress.mostLoaded,candidate.coords.filter(p=>p[0]>=0).length);
        let p=yield* this.evaluateSteps(candidate.coords,child?.parents??[],child?.operation??(rescue?'초기 구획 배치':'초기 무작위'),candidate.repaired,child?.loadOrder??candidate.loadOrder??this.rng.shuffle(this.boxes.map(b=>b.id)));
        // 완전 적재가 가능한 좌표라면 순서 유전자 복구도 시도한다. 평가기는 주어진 순서를 그대로 실행한다.
        if(!p&&this.requireFullAllocation&&candidate.coords.every(v=>v[0]>=0)){
          const order=child?.repairOrder??loadingOrder(this.boxes,candidate.coords,this.truck,this.fixed)??(this.priorityUnloading&&!Object.keys(this.fixed).length?dependencyLoadingOrder(this.boxes,candidate.coords):null);
          if(order)p=yield* this.evaluateSteps(candidate.coords,child?.parents??[],`${child?.operation??'초기 무작위'}·상차순서 복구`,candidate.repaired,[...this.boxes.filter(b=>this.fixed[b.id]).map(b=>b.id),...order]);
        }
        if(p) {this.diverseFailures=0;next.push(p);accepted++;this.allocationProgress.ready=next.length;}
      }
      yield;
    }
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
  const conditions=[...[0,.6,.9].map(c=>({name:`교차 ${c}`,patch:{crossover:c}})),...[2,3,5].map(k=>({name:`선택 k=${k}`,patch:{tournament:k}})),...[0,.05,.2].map(m=>({name:`변이 ${m}`,patch:{mutation:m}}))];
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
/// <reference lib="webworker" />
import { Engine } from '../ga/engine';
import {MAX_BOXES} from '../domain/model';
import type { Box,Truck,Settings,Weights,Vec,Generation } from '../domain/model';
import { runExperiments } from '../ga/experiments';
import {AutomaticSupply} from '../simulation/supply';
export type Command = {type:'start';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights;fixed:Record<number,Vec>;arrival:boolean;automatic?:boolean;inputSeed?:number;requireFullAllocation?:boolean;priorityUnloading?:boolean}|{type:'pause'|'resume'|'stop';run:number}|{type:'weights';run:number;weights:Weights}|{type:'experiment';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights;priorityUnloading?:boolean};
let engine:Engine|null=null,run=0,paused=false,stopped=false,iterator:Generator<void,Generation,void>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
let lastProgressAt=0;
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
  try {
    if(!iterator)iterator=engine.next();
    const until=performance.now()+12;
    do {
      const result=iterator.next();
      if(result.done) {
        iterator=null;const g=result.value;
        send('generation',{generation:{...g,number:g.number+generationOffset,evaluations:g.evaluations+evaluationOffset,individuals:displayIndividuals(g.individuals),boxes:engine.boxes,fixed:engine.fixed,round:supply?.round??1,weights:{...engine.weights},settings:{...engine.settings}}});
        if(engine.generation>=engine.settings.generations) {
          if(supply){
            const best=engine.population.reduce((a,b)=>a.score>=b.score?a:b),expanded=supply.expand(best,engine.truck);
            if(expanded){
              generationOffset+=engine.generation;evaluationOffset+=engine.evaluations;
              const next=new Engine(expanded,engine.truck,{...engine.settings,seed:(engine.settings.seed+1)>>>0},engine.weights,engine.fixed);
              next.requireFullAllocation=engine.requireFullAllocation;next.priorityUnloading=engine.priorityUnloading;
              next.seedLayout=expanded.map((_,i)=>best.evaluation.finalCoords[i]??[-1,-1,-1]);next.version=engine.version;engine=next;
              send('supply',{boxes:expanded,round:supply.round});break;
            }
            send('capacity',{message:engine.boxes.length>=MAX_BOXES?'누적 상자 한도 400개에 도달했습니다.':'현재 배치에서 최소 규격 상자를 넣을 추가 공간·상차 경로를 찾지 못했습니다.'});
          }
          paused=true;send('state',{state:'완료'});return;
        }
        break;
      }
    } while(performance.now()<until);
    if(engine.requireFullAllocation&&iterator&&performance.now()-lastProgressAt>250){lastProgressAt=performance.now();send('allocationProgress',{generation:engine.generation+1+generationOffset,boxes:engine.boxes.length,population:engine.settings.population,...engine.allocationProgress});}
    timer=setTimeout(tick,0);
  } catch(e) {stopped=true;send('error',{message:e instanceof Error?e.message:String(e)});}
}
/** 예약된 반복이 중복되지 않게 실행한다. */
function schedule() {if(timer===undefined)timer=setTimeout(tick,0);}
self.onmessage=async(event:MessageEvent<Command>)=>{
  const c=event.data;
  try {
    if(c.type==='start') {
      if(timer!==undefined)clearTimeout(timer);timer=undefined;run=c.run;
      engine=new Engine(c.boxes,c.truck,c.settings,c.weights,c.fixed,c.arrival);engine.requireFullAllocation=!!c.requireFullAllocation;engine.priorityUnloading=!!c.priorityUnloading;lastProgressAt=0;iterator=null;paused=false;stopped=false;send('state',{state:'실행'});schedule();
      supply=c.automatic?new AutomaticSupply(c.boxes,c.inputSeed??c.settings.seed,c.boxes.length):null;generationOffset=0;evaluationOffset=0;
    } else if(c.type==='experiment') {
      run=c.run;stopped=false;
      const result=await runExperiments(c.boxes,c.truck,c.settings,c.weights,()=>stopped,(progress)=>send('experimentProgress',{progress}),!!c.priorityUnloading);
      if(!stopped)send('experiments',{result});
    } else if(c.run===run) {
      if(c.type==='pause') {paused=true;send('state',{state:'일시정지'});}
      if(c.type==='stop') {stopped=true;iterator=null;send('state',{state:'정지'});}
      if(c.type==='resume'&&engine&&!stopped&&engine.generation<engine.settings.generations) {paused=false;send('state',{state:'실행'});schedule();}
      if(c.type==='weights'&&engine) {
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

# SW_Browser_Evolution_001 — 진화계산

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
import { Random,validateConfig,type Box,type Vec,type Truck,type Weights,type Settings,type Individual,type Generation } from '../domain/model';
import { pack,randomPosition } from '../domain/packing';
import { simulateLoading,loadingFitness } from '../simulation/loading';

/** 좌표 기반 GA의 집단·난수·평가 예산을 관리한다. SW_Browser_Evolution_001 */
export class Engine {
  rng:Random; generation=0; population:Individual[]=[]; evaluations=0; version=1;
  private serial=0;
  seedLayout:Vec[]|undefined;
  reference:{count:number;volume:number};
  constructor(public boxes:Box[],public truck:Truck,public settings:Settings,public weights:Weights,public fixed:Record<number,Vec>={},public requireLoading=false) {
    validateConfig(boxes,truck,settings,weights); this.rng=new Random(settings.seed);
    this.reference={count:boxes.length,volume:boxes.reduce((n,b)=>n+b.size[0]*b.size[1]*b.size[2],0)};
  }
  /** 공급 전 집단의 좌표·상차 순서·부모 ID와 최초 점수 기준을 다음 회차에 계승한다. */
  inherit(previous:Engine,prefix:string):void {
    this.reference={...previous.reference};this.version=previous.version;
    const added=this.boxes.slice(previous.boxes.length).map(b=>b.id);
    this.population=previous.population.map(p=>{
      const coords=this.boxes.map((_,i)=>[...(p.coords[i]??[-1,-1,-1])] as Vec);
      const migrant=this.evaluate(coords,[],p.operation,p.repaired,[...p.loadOrder,...added]);
      if(!migrant)throw Error('공급 전 집단을 계승하지 못했습니다.');
      return {...migrant,id:prefix+p.id,generation:0};
    });
  }
  /** 같은 상태에서 토너먼트로 부모를 선택한다. 음수 점수도 그대로 비교한다. */
  select():Individual {
    let best=this.population[this.rng.int(0,this.population.length-1)];
    for(let k=1;k<this.settings.tournament;k++) {const p=this.population[this.rng.int(0,this.population.length-1)];if(p.score>best.score)best=p;}
    return best;
  }
  /** 상자별 좌표 묶음 1점 교차와 유효 위치 변이, 최소 배치 수정을 수행한다. */
  offspring(): {coords:Vec[];loadOrder:number[];parents:string[];operation:string;repaired:boolean}|null {
    const a=this.select(),b=this.select();const cross=this.rng.next()<this.settings.crossover && this.boxes.length>1;
    const cut=cross?this.rng.int(1,this.boxes.length-1):this.boxes.length;
    const coords=this.boxes.map((_,i)=>[...(i<cut?a.coords[i]:b.coords[i])] as Vec);let mutated=false;
    for(let i=0;i<coords.length;i++) {
      if(this.fixed[this.boxes[i].id] || this.rng.next()>=this.settings.mutation)continue;
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
    const result=pack(this.boxes,this.truck,this.rng,coords,this.fixed,true);
    if(!result)return null;
    return {...result,loadOrder,parents:cross?[a.id,b.id]:[a.id],operation:cross?(mutated?'교차·변이':'교차'):(mutated?'변이':'선택 복제')};
  }
  /** 상차 순서를 실제 실행하고 적재량·공간 활용·상차 재배치로 후보를 평가한다. */
  evaluate(coords:Vec[],parents:string[],operation:string,repaired:boolean,loadOrder=this.boxes.map(b=>b.id)):Individual|null {
    this.evaluations++;
    const {events:_,...evaluation}=simulateLoading(this.boxes,coords,this.truck,loadOrder,this.fixed,false,this.reference);
    if(!evaluation.valid)return null;
    return {id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents,operation,repaired,coords,loadOrder,evaluation,score:loadingFitness(evaluation,this.weights),version:this.version};
  }
  /** 개체 한 번 시도마다 양보하여 Worker가 정지·취소 메시지를 처리하게 한다. */
  *next():Generator<void,Generation,void> {
    const start=performance.now(),next:Individual[]=[];let attempts=0,accepted=0;
    if(this.population.length) {
      const best=this.population.reduce((a,b)=>a.score>=b.score?a:b);
      next.push({...best,id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents:[best.id],operation:'엘리트',coords:best.coords.map(p=>[...p] as Vec)});
    }
    while(next.length<this.settings.population) {
      if(++attempts>this.settings.population*120) throw Error(`유효 집단을 생성하지 못했습니다 (${next.length}/${this.settings.population}). 상자 수·적재함·고정 배치를 확인하세요.`);
      const child=this.population.length?this.offspring():null;
      const candidate=this.population.length?child:pack(this.boxes,this.truck,this.rng,attempts===1?this.seedLayout:undefined,this.fixed,true);
      if(candidate) {
        const p=this.evaluate(candidate.coords,child?.parents??[],child?.operation??'초기 무작위',candidate.repaired,child?.loadOrder??this.rng.shuffle(this.boxes.map(b=>b.id)));
        if(p) {next.push(p);accepted++;}
      }
      yield;
    }
    this.population=next;this.generation++;
    return {number:this.generation,individuals:next,best:Math.max(...next.map(p=>p.score)),mean:next.reduce((a,b)=>a+b.score,0)/next.length,version:this.version,attempts,accepted,evaluations:this.evaluations,elapsed:performance.now()-start};
  }
  /** 현재 집단만 새 가중치로 평가한다. 이전 세대 스냅샷은 수정하지 않는다. */
  reweight(weights:Weights):Individual[] {
    validateConfig(this.boxes,this.truck,this.settings,weights);this.weights={...weights};this.version++;
    this.population=this.population.map(p=>({...p,score:loadingFitness(p.evaluation,weights),version:this.version}));return this.population;
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
import { simulateLoading,loadingFitness } from '../simulation/loading';
export interface ExperimentRow { condition:string;seed:number;gaScore:number;randomScore:number;gaMoves:number;randomMoves:number;gaMass:number;randomMass:number;gaLoaded:number;randomLoaded:number;gaVolume:number;randomVolume:number;budget:number;randomEvaluations:number;validRatio:number }
/** 동일 후보 평가 예산·상자 목록으로 3개 seed와 계획서의 9개 조건을 비교한다. */
export async function runExperiments(boxes:Box[],truck:Truck,settings:Settings,weights:Weights,cancel:()=>boolean,progress:(s:string)=>void):Promise<ExperimentRow[]> {
  const result:ExperimentRow[]=[];
  const conditions=[...[0,.6,.9].map(c=>({name:`교차 ${c}`,patch:{crossover:c}})),...[2,3,5].map(k=>({name:`선택 k=${k}`,patch:{tournament:k}})),...[0,.05,.2].map(m=>({name:`변이 ${m}`,patch:{mutation:m}}))];
  for(const c of conditions)for(const seed of [11,29,47]) {
    if(cancel())return result;
    progress(`${c.name} · seed ${seed}`);
    const e=new Engine(boxes,truck,{...settings,crossover:.9,mutation:.05,tournament:3,...c.patch,seed},weights);
    let attempts=0,accepted=0;
    for(let g=0;g<settings.generations;g++) {
      const iter=e.next();let step=iter.next(),chunk=performance.now();
      while(!step.done) {if(cancel())return result;step=iter.next();if(performance.now()-chunk>16){await new Promise(r=>setTimeout(r,0));chunk=performance.now();}}
      attempts+=step.value.attempts;accepted+=step.value.accepted;
    }
    const ga=e.population.reduce((a,b)=>a.score>=b.score?a:b),rng=new Random(seed);
    let best:{score:number;moves:number;mass:number;loaded:number;volume:number}|null=null,used=0,tries=0;
    while(used<e.evaluations) {
      if(cancel())return result;
      if(++tries>e.evaluations*120)throw Error('무작위 비교군의 유효 배치 생성 한도 초과');
      const p=pack(boxes,truck,rng,undefined,{},true);if(!p)continue;
      const ev=simulateLoading(boxes,p.coords,truck,rng.shuffle(boxes.map(b=>b.id)),{},false);used++;
      if(ev.valid) {const score=loadingFitness(ev,weights);if(!best||score>best.score)best={score,moves:ev.moves,mass:ev.mass,loaded:ev.loaded,volume:ev.loadedVolume};}
      if(used%10===0)await new Promise(r=>setTimeout(r,0));
    }
    if(!best)throw Error('무작위 비교군에서 유효 상차 해답이 없습니다.');
    result.push({condition:c.name,seed,gaScore:ga.score,randomScore:best.score,gaMoves:ga.evaluation.moves,randomMoves:best.moves,gaMass:ga.evaluation.mass,randomMass:best.mass,gaLoaded:ga.evaluation.loaded,randomLoaded:best.loaded,gaVolume:ga.evaluation.loadedVolume,randomVolume:best.volume,budget:e.evaluations,randomEvaluations:used,validRatio:accepted/attempts});
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
import type { Box,Truck,Settings,Weights,Vec,Generation } from '../domain/model';
import { runExperiments } from '../ga/experiments';
import {AutomaticSupply} from '../simulation/supply';
export type Command = {type:'start';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights;fixed:Record<number,Vec>;arrival:boolean;automatic?:boolean;inputSeed?:number}|{type:'pause'|'resume'|'stop';run:number}|{type:'weights';run:number;weights:Weights}|{type:'experiment';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights};
let engine:Engine|null=null,run=0,paused=false,stopped=false,iterator:Generator<void,Generation,void>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
let supply:AutomaticSupply|null=null,generationOffset=0,evaluationOffset=0;
/** 공급 회차마다 다른 입력·ID를 구별해 과거 개체와 계보를 보존한다. */
function displayIndividuals(individuals:import('../domain/model').Individual[]) {
  const prefix=supply?`r${supply.round}-`:'';
  return individuals.map(p=>({...p,id:prefix+p.id,parents:p.parents.map(id=>id.startsWith('r')?id:prefix+id),generation:p.generation+generationOffset}));
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
        send('generation',{generation:{...g,number:g.number+generationOffset,evaluations:g.evaluations+evaluationOffset,individuals:displayIndividuals(g.individuals),boxes:engine.boxes,fixed:engine.fixed,round:supply?.round??1}});
        if(engine.generation>=engine.settings.generations) {
          if(supply){
            const best=engine.population.reduce((a,b)=>a.score>=b.score?a:b),previousRound=supply.round,expanded=supply.expand(best,engine.truck);
            if(expanded){
              generationOffset+=engine.generation;evaluationOffset+=engine.evaluations;
              const next=new Engine(expanded,engine.truck,{...engine.settings,seed:(engine.settings.seed+1)>>>0},engine.weights,engine.fixed);
              next.inherit(engine,`r${previousRound}-`);engine=next;
              send('supply',{boxes:expanded,round:supply.round});break;
            }
            send('capacity',{message:'남은 적재 부피가 최소 생성 상자(10×10×10cm)보다 작습니다.'});
          }
          paused=true;send('state',{state:'완료'});return;
        }
        break;
      }
    } while(performance.now()<until);
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
      engine=new Engine(c.boxes,c.truck,c.settings,c.weights,c.fixed,c.arrival);iterator=null;paused=false;stopped=false;send('state',{state:'실행'});schedule();
      supply=c.automatic?new AutomaticSupply(c.boxes,c.inputSeed??c.settings.seed):null;generationOffset=0;evaluationOffset=0;
    } else if(c.type==='experiment') {
      run=c.run;stopped=false;
      const result=await runExperiments(c.boxes,c.truck,c.settings,c.weights,()=>stopped,(progress)=>send('experimentProgress',{progress}));
      if(!stopped)send('experiments',{result});
    } else if(c.run===run) {
      if(c.type==='pause') {paused=true;send('state',{state:'일시정지'});}
      if(c.type==='stop') {stopped=true;iterator=null;send('state',{state:'정지'});}
      if(c.type==='resume'&&engine&&!stopped&&engine.generation<engine.settings.generations) {paused=false;send('state',{state:'실행'});schedule();}
      if(c.type==='weights'&&engine) {
        paused=true;
        // 부분 세대의 혼합 점수를 방지한다. 미완성 세대만 버리고 기존 집단·난수는 유지한다.
        iterator=null;const individuals=engine.reweight(c.weights);send('reweighted',{individuals:displayIndividuals(individuals),version:engine.version});send('state',{state:'일시정지'});
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

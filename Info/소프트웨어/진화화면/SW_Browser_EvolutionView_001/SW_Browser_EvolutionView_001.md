# SW_Browser_EvolutionView_001 — 진화화면

> 2026-11-17 02:00:56 KST 최신 입력 범위는 최초·누적1~400개. 과거 총량 무제한 설명은 당시 기록이다. 최신 동작은 `Info/plan/2026-11-17/015406_입력반영과누적400제한_plan.md`.


> 2026-11-17 01:37:10 (KST) 최신 웹 기준: 전량적재를통과한뒤우선도순하차의재이동비용을최적화한다.사용자승인‘ㅇㅇ’.이하과거상차복원기록은당시기준이며현재목적은 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md` 참조.


> 2026-11-16 21:20:39 (KST) 현재 기준: 현재 실행은 첫 배포 상차 기준이며 상자 할당 입력만 유지한다. 이후 기능 설명은 당시 기록일 수 있으며 최신 기준은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`.

- 버전: v0.0.3
- 최초 작성 일시: 2026-11-16 12:49:10 (KST)
- 수정 일시: 2026-11-16 13:13:21 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_EvolutionView_001
- 분류: 소프트웨어 / 진화화면 (영문 식별자 EvolutionView)
- 실행환경: Browser. 기술 버전은 프로젝트 루트 기준 `Info/기술환경.md`.
- 관련 ID: 001 및 `Info/기능_ID_목록.md`의 관련 기능.
- 상태: 구현 코드 확인·수치/빌드 검증. 브라우저 직접 조작은 미확인.

## 목적·목표와 역할

실제 GA 상태·가중치·세대 계보·개체 선택·상차 재생·도착·비교 실험을 사용자에게 제공한다.

목표는 사용자 승인된 상차 적재량 개선과 재배치 감소를 실제 상차 계산·화면에 일치시키는 것이다.

## 호출·입력·출력·처리 순서

App의 start는 validateConfig 후 새 Worker와 실행 ID를 만든다. clear는 실행·재생을 비우며 입력은 유지한다. generate는 목록을 다시 만들고 순차 모드면 Arrival을 초기화한다. apply는 현재 가중치를 검사해 재평가 메시지를 보낸다. receive·commit은 순차 도착 상태를 갱신한다. experiment는 독립 Worker를 만들고 결과·입력 스냅샷을 JSON으로 저장할 수 있게 한다.

GenerationTree는 최신 세대부터 역순 배치해 최초 세대가 아래에 오게 하며, 스크롤 영역 주변 행만 그린다. 부모 ID는 이전 세대 실제 ID에서 찾는다. 선택과 과거 탐색은 자동 따라가기를 해제한다. App은 선택 후보를 simulateLoading으로 다시 실행해 원자료와 동일한 3D 이벤트를 전달한다. 입력 잠금·종료 상태·오류·재평가 버전을 구분한다.

소스의 타입 정의는 필수 매개변수·단위·반환값의 실제 근거다. 위치는 정수 cm, 중량은 kg, 비율은 0~1이다. 예외·실패 분기는 아래 실제 코드와 같다. Loading 평가의 valid=false, 위치 생성 실패의 null, UI/Worker 예외 메시지를 서로 구별한다.

## 수정 전후·확인 범위

이전 전체 실행은 하차 비용을 평가했다. 이번에는 상차 순서·위치와 실제 적재량을 평가하며 하차 모듈은 앱·GA·실험에서 호출하지 않는다. 기존 하차 소스와 해당 회귀 테스트는 삭제하지 않고 보존했다. 테스트 20개·빌드 통과. 대표 실행과 비교 결과는 `Info/report/2026-11-16/124910_상차전환검증_report.md`.

## 실제 코드와 함수별 설명

아래는 작성 시점의 파일 전체다. 함수별 주석·시그니처와 분기·타입을 보존하며, 구현되지 않은 의사 코드가 아니다.

### `src/ui/App.tsx`

```tsx
import {CONFIG_RANGES as R,normalizeNumber,validateWebConfig,effectiveCrossover} from '../domain/ranges';
import { useEffect,useMemo,useRef,useState } from 'react';
import { MIN_BOXES,MAX_BOXES,normalizeBoxCount,resolveBoxInput,DEFAULT_SETTINGS,DEFAULT_TRUCK,DEFAULT_WEIGHTS,GRADES,generateBoxes,type Box,type Vec,type Truck,type Settings,type Weights,type Individual,type Generation } from '../domain/model';
import {priorityOrder,priorityColor} from '../domain/priority';
import {simulate as simulateUnloading} from '../simulation/unload';
import { simulateLoading } from '../simulation/loading';
import { Arrival } from '../simulation/arrival';
import {ResultExport} from './ResultExport';
import {finalizeResult,type ResultSnapshot} from '../export/report';
import type {SceneCapture} from '../scene/TruckView';
import { TruckView } from '../scene/TruckView';
import { GenerationTree } from './GenerationTree';
import type { Command } from '../workers/evolution';
import type { ExperimentRow } from '../ga/experiments';

/** 읽기 쉬운 소수점 표시. */
function number(n:number) {return n.toLocaleString('ko-KR',{maximumFractionDigits:1});}
/** 실험 결과·입력·실행 설정을 사용자의 파일로 보관한다. */
function saveJson(data:unknown) {const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='loadlab-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
/** 숫자 입력에 단위와 범위를 표시한다. */
function Field({label,value,onChange,onBlur,min,max,step=1,disabled=false}:{label:string;value:number;onChange:(v:number)=>void;onBlur?:()=>void;min?:number;max?:number;step?:number|'any';disabled?:boolean}) {
 const [warning,setWarning]=useState('');
 /** 편집 중에는 입력을 유지하고 포커스를 옮길 때 범위·정수 조건을 적용한다. */
 function commit(){if(onBlur){onBlur();return;}if(min===undefined||max===undefined)return;const next=normalizeNumber(value,{min,max,integer:step===1});if(!Object.is(value,next)){onChange(next);setWarning(`${label}: ${min}~${max} 범위로 ${next}을 적용했습니다.`);}}
 return <label className="field"><span>{label}</span><input aria-label={label} type="number" value={Number.isNaN(value)?'':value} min={min} max={max} step={step} disabled={disabled} onBlur={commit} onChange={e=>{setWarning('');onChange(e.target.value===''?NaN:Number(e.target.value));}}/>{warning&&<small role="alert" className="field-warning">{warning}</small>}</label>;
}
/** GA의 계산·세대 선택·3D 재생과 설정 적용을 연결하는 로컬 웹 진입점. */
export function App() {
  const [count,setCount]=useState(20),[countWarning,setCountWarning]=useState(''),[inputSeed,setInputSeed]=useState(2026),[boxes,setBoxes]=useState<Box[]>(()=>generateBoxes(20,2026));
  const [truck,setTruck]=useState<Truck>({...DEFAULT_TRUCK}),[settings,setSettings]=useState<Settings>({...DEFAULT_SETTINGS}),[weights,setWeights]=useState<Weights>({...DEFAULT_WEIGHTS});
  const [applied,setApplied]=useState<Weights>({...DEFAULT_WEIGHTS}),[state,setState]=useState('준비'),[history,setHistory]=useState<Generation[]>([]),[selected,setSelected]=useState<Individual|null>(null),[follow,setFollow]=useState(true),[message,setMessage]=useState('');
  const [liveBest,setLiveBest]=useState<number|null>(null);
  const [allocationProgress,setAllocationProgress]=useState<{generation:number;boxes:number;population:number;ready:number;mostLoaded:number;attempts:number}|null>(null);
  const [replayMode,setReplayMode]=useState<'loading'|'unloading'>('unloading');
  const initialInput=useRef<{count:number;seed:number;boxes:Box[]}|null>(null);if(!initialInput.current)initialInput.current={count:20,seed:2026,boxes};
  const [step,setStep]=useState(0),[playing,setPlaying]=useState(false),[boxList,setBoxList]=useState(false);
  const [automatic,setAutomatic]=useState(true),[supplyRound,setSupplyRound]=useState(1);
  const [sequential,setSequential]=useState(false),[arrival,setArrival]=useState<Arrival|null>(null),[arrivalTick,setArrivalTick]=useState(0);
  const [experimentState,setExperimentState]=useState(''),[results,setResults]=useState<ExperimentRow[]>([]);
  const [snapshot,setSnapshot]=useState<ResultSnapshot|null>(null);
  const captureRef=useRef<SceneCapture|null>(null),weightVersions=useRef<Record<number,Weights>>({1:{...DEFAULT_WEIGHTS}});
  const worker=useRef<Worker|null>(null),experimentWorker=useRef<Worker|null>(null),run=useRef(0),followRef=useRef(follow),configRef=useRef({boxes,truck,settings,applied});
  followRef.current=follow;configRef.current={boxes,truck,settings,applied};
  const busy=state==='실행',locked=history.length>0||busy||state==='일시정지';
  const activeBoxes=useMemo(()=>sequential&&arrival?[...arrival.loaded,...arrival.waiting].sort((a,b)=>a.id-b.id):boxes,[boxes,sequential,arrival,arrivalTick]);
  const fixed=arrival?.fixed??{};
  const selectionGeneration=selected?history.find(g=>g.number===selected.generation):undefined;
  const viewBoxes=selectionGeneration?.boxes??activeBoxes,viewFixed=selectionGeneration?.fixed??fixed;
  const loadingReplay=useMemo(()=>selected&&replayMode==='loading'?simulateLoading(viewBoxes,selected.coords,truck,selected.loadOrder,viewFixed,true):null,[selected,viewBoxes,truck,arrivalTick,replayMode]);
  const unloadingReplay=useMemo(()=>selected&&replayMode==='unloading'?simulateUnloading(viewBoxes,selected.evaluation.finalCoords,truck,true,true):null,[selected,viewBoxes,truck,replayMode]);
  const events=(replayMode==='unloading'?unloadingReplay?.events:loadingReplay?.events)??[];
  const initialCoords=replayMode==='unloading'?selected?.evaluation.finalCoords:undefined;
  const priorityStale=initialInput.current.count!==count||initialInput.current.seed!==inputSeed;
  const priorityLocked=locked||priorityStale||!!(sequential&&arrival?.cursor);
  const ranks=useMemo(()=>new Map(priorityOrder(boxes).map((b,i)=>[b.id,i+1])),[boxes]);
  const currentEvent=step?events[step-1]:null;
  const latest=history.at(-1),roundHistory=history.filter(g=>(g.round??1)===(latest?.round??1)),first=roundHistory[0];
  /** 새 Worker를 만들고 이전 실행의 응답은 무시한다. */
  function createWorker() {
    worker.current?.terminate();const w=new Worker(new URL('../workers/evolution.ts',import.meta.url),{type:'module'});worker.current=w;const id=++run.current;
    w.onmessage=e=>{
      const m=e.data;if(m.run!==run.current)return;
      if(m.type==='state')setState(m.state);
      if(m.type==='supply'){setBoxes(m.boxes);setSupplyRound(m.round);}
      if(m.type==='allocationProgress')setAllocationProgress(m);
      if(m.type==='capacity')setMessage(m.message);
      if(m.type==='error'){setMessage(m.message);setState('오류');}
      if(m.type==='generation'||m.type==='generations') {const incoming:Generation[]=m.type==='generation'?[m.generation]:m.generations;if(incoming.length){setLiveBest(null);setAllocationProgress(null);setHistory(h=>[...h,...incoming]);const g=incoming.at(-1)!;if(followRef.current)setSelected(g.individuals.reduce((a,b)=>a.score>=b.score?a:b));}}
      if(m.type==='reweighted') {setApplied({...m.weights});setLiveBest(m.individuals.length?Math.max(...m.individuals.map((p:Individual)=>p.score)):null);weightVersions.current[m.version]={...m.weights};setSelected(s=>s?m.individuals.find((p:Individual)=>p.id===s.id)??s:null);setMessage(`가중치 v${m.version} 적용 · 현재 집단 재평가 완료. 이어서 실행할 수 있습니다.`);}
    };
    w.onerror=e=>{setMessage(e.message||'계산 Worker를 실행할 수 없습니다.');setState('오류');};
    return {w,id};
  }
  /** 현재 입력으로 실행 이력과 난수 상태를 새로 만든다. */
  function start() {
    try {
      const normalized=normalizeBoxCount(count);setCount(normalized.value);if(normalized.warning)setCountWarning(normalized.warning);
      if(sequential&&priorityStale)throw Error('수량·seed를 변경했습니다. 상자를 다시 생성한 후 도착시키세요.');
      const input=sequential?activeBoxes:resolveBoxInput(normalized.value,inputSeed,initialInput.current!);
      if(!sequential)initialInput.current={count:normalized.value,seed:inputSeed,boxes:input};
      validateWebConfig(input,truck,settings,weights);
      if(!automatic&&Object.keys(fixed).length===activeBoxes.length&&sequential)throw Error('모든 도착 상자가 적재되었습니다. 다음 상자를 도착시키세요.');
      const {w,id}=createWorker();setLiveBest(null);setSnapshot(null);weightVersions.current={1:{...weights}};setHistory([]);setSelected(null);setAllocationProgress({generation:1,boxes:input.length,population:settings.population,ready:0,mostLoaded:0,attempts:0});setStep(0);setPlaying(false);setMessage('');setFollow(true);setApplied({...weights});setState('실행');
      if(!sequential){setBoxes(input);setSupplyRound(1);}
      w.postMessage({type:'start',run:id,boxes:input,truck,settings,weights,fixed:automatic?{}:fixed,arrival:sequential,automatic,inputSeed,requireFullAllocation:true,priorityUnloading:true,batchGenerations:true} satisfies Command);
    }catch(e){setMessage((e as Error).message);}
  }
  /** 완료 시점의 결과·카메라·재생 단계를 확정하고 늦은 Worker 응답을 차단한다. */
  function complete() {
    if(!history.length||snapshot)return;
    let image:string|null=null,assetStatus='',captureError='',priorityColors=true;
    try{if(!captureRef.current)throw Error('3D 캡처를 사용할 수 없습니다.');const c=captureRef.current();image=c.image;assetStatus=c.assetStatus;priorityColors=c.priorityColors;}catch(e){captureError=(e as Error).message;}
    const final=finalizeResult({schema:1,objective:'priority-unload',completedAt:new Date().toISOString(),history,selected,truck,settings,inputSeed,batchCount:count,automatic,
      weights:{...weightVersions.current,...Object.fromEntries(history.filter(g=>g.weights).map(g=>[g.version,g.weights]))},
      scene:{image,mode:replayMode,priorityColors,initialCoords,step,totalSteps:events.length,events,boxes:viewBoxes,fixed:viewFixed,assetStatus,error:captureError}} satisfies ResultSnapshot);
    worker.current?.terminate();worker.current=null;run.current++;setPlaying(false);setAllocationProgress(null);setState('결과 확정');setSnapshot(final);
    setMessage(`완료 시점의 ${history.length}개 세대를 확정했습니다. 준비 중 세대는 제외하며 다운로드가 가능합니다.${captureError?' 3D 캡처 제외: '+captureError:''}`);
  }
  /** 입력은 유지하고 계산·선택·재생 기록을 비운다. */
  function clear() {setLiveBest(null);if(!sequential&&initialInput.current)setBoxes(initialInput.current.boxes);setSnapshot(null);worker.current?.terminate();worker.current=null;run.current++;setHistory([]);setSelected(null);setAllocationProgress(null);setStep(0);setPlaying(false);setState('준비');setSupplyRound(1);setMessage('');}
  /** 입력 목록을 동일 seed로 재생성한다. 순차 모드는 도착도 처음부터 시작한다. */
  function generate(mode=sequential) {
    try {const n=normalizeBoxCount(count);setCount(n.value);if(n.warning)setCountWarning(n.warning);const b=generateBoxes(n.value,inputSeed);clear();initialInput.current={count:n.value,seed:inputSeed,boxes:b};setBoxes(b);setResults([]);setArrival(mode?new Arrival(b,inputSeed^0xA771):null);setArrivalTick(t=>t+1);}catch(e){setMessage((e as Error).message);}
  }
  /** 상한 초과는 즉시, 빈 값·하한·소수는 편집 완료 시 경고하며 보정한다. */
  function changeCount(value:number,commit=false){if(value>MAX_BOXES||commit){const n=normalizeBoxCount(value);setCount(n.value);if(n.warning)setCountWarning(n.warning);}else{setCount(value);setCountWarning('');}}
  /** 우선도는 실행/도착 전에만 바꾸고 같은 입력의 재시작에도 보존한다. */
  function changePriority(id:number,value:number){if(priorityLocked)return;const next=boxes.map(b=>b.id===id?{...b,priority:value}:b);setBoxes(next);initialInput.current={count,seed:inputSeed,boxes:next};if(sequential)setArrival(new Arrival(next,inputSeed^0xA771));}
  /** 가중치만 현재 집단에 적용하고 세대별 당시 점수는 보존한다. */
  function apply() {
    if(snapshot){setMessage('완료 결과는 확정되어 있습니다. 새 실행에서 가중치를 변경하세요.');return;}
    try {validateWebConfig(activeBoxes.length?activeBoxes:boxes,truck,settings,weights);if(worker.current){worker.current.postMessage({type:'weights',run:run.current,weights} satisfies Command);setMessage('현재 계산에 가중치를 적용하는 중입니다.');}else {setApplied({...weights});setMessage('다음 실행의 기본 평가에 반영했습니다.');}}
    catch(e){setMessage((e as Error).message);}
  }
  /** 순차 도착을 한 건 진행한다. 진행 중 실행은 변경하지 않는다. */
  function receive() {if(!arrival)return;if(!arrival.receive()){setMessage(arrival.waiting.length>=40?'대기 공간 40개가 찼습니다. 먼저 상차하세요.':'모든 상자가 도착했습니다.');return;}clear();setArrivalTick(t=>t+1);}
  /** 검증된 배치의 실제 상차 순서를 확정해 다음 탐색에서 고정한다. */
  function commit() {if(!arrival||!selected)return;try {const order=arrival.commit(activeBoxes,selected.evaluation.finalCoords,truck);clear();setArrivalTick(t=>t+1);setMessage(`상차 완료: ${order.map(i=>'#'+i).join(' → ')} · 기존 좌표 고정`);}catch(e){setMessage((e as Error).message);}}
  /** 계획서의 3개 seed와 9개 조건을 별도 Worker에서 비교한다. */
  function experiment() {
    try {
      const n=normalizeBoxCount(count);setCount(n.value);if(n.warning)setCountWarning(n.warning);const input=resolveBoxInput(n.value,inputSeed,initialInput.current!);validateWebConfig(input,truck,settings,weights);setBoxes(input);initialInput.current={count:n.value,seed:inputSeed,boxes:input};
      experimentWorker.current?.terminate();const w=new Worker(new URL('../workers/evolution.ts',import.meta.url),{type:'module'});experimentWorker.current=w;
      setResults([]);setExperimentState('실험 준비 중');const snapshot={boxes:input,truck,settings,weights,objective:'priority-unload'};
      w.onmessage=e=>{const m=e.data;if(m.type==='experimentProgress')setExperimentState(m.progress);if(m.type==='experiments'){setResults(m.result);setExperimentState('실험 완료');w.terminate();}if(m.type==='error'){setExperimentState('실험 오류: '+m.message);w.terminate();}};
      w.onerror=e=>setExperimentState('실험 오류: '+e.message);
      (w as Worker&{snapshot?:unknown}).snapshot=snapshot;
      w.postMessage({type:'experiment',run:1,boxes:input,truck,settings,weights,priorityUnloading:true} satisfies Command);
    }catch(e){setMessage((e as Error).message);}
  }
  useEffect(()=>()=>{worker.current?.terminate();experimentWorker.current?.terminate();},[]);
  useEffect(()=>{if(boxList)document.getElementById('priority-boxes')?.scrollIntoView({block:'start',behavior:'smooth'});},[boxList]);
  useEffect(()=>{setStep(replayMode==='unloading'?0:events.length);setPlaying(false);},[selected?.id,replayMode]);
  useEffect(()=>{if(!playing)return;const t=setInterval(()=>setStep(s=>{if(s>=events.length){setPlaying(false);return s;}return s+1;}),650);return()=>clearInterval(t);},[playing,events.length]);
  const versionMatch=liveBest===null&&first&&latest&&first.version===latest.version;
  const summaries=useMemo(()=>[...new Set(results.map(r=>r.condition))].map(condition=>{const rows=results.filter(r=>r.condition===condition);const avg=(k:'gaScore'|'randomScore'|'gaMoves'|'randomMoves'|'gaMass'|'randomMass')=>rows.reduce((a,b)=>a+b[k],0)/rows.length;return {condition,ga:avg('gaScore'),random:avg('randomScore'),moves:avg('gaMoves'),mass:avg('gaMass'),loaded:rows.reduce((n,r)=>n+r.gaLoaded,0)/rows.length};}),[results]);
  return <div className="app">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">▥</span> LOADLAB<span className="brand-sub">적재 진화 실험실</span></a><div className="header-meta"><span className="local-dot"/>로컬 시뮬레이션<span className="separator"/>GENETIC ALGORITHM</div></header>
    <div className="page-heading"><div><div className="eyebrow">TRUCK LOADING / EVOLUTION LAB</div><h1>우선도대로, 덜 옮기며 내리다<span>.</span></h1><p>상자를 전부 적재하고, 우선도 순 하차의 재이동 횟수와 중량을 줄이는 배치를 찾습니다.</p></div><div className={`status status-${state}`} role="status"><i/>{state}<span>{allocationProgress&&busy?`${allocationProgress.generation}세대 준비 · 상차·하차 완료 ${allocationProgress.ready}/${allocationProgress.population}개체 · 상자 ${allocationProgress.mostLoaded}/${allocationProgress.boxes}개 · ${allocationProgress.attempts}회 시도`:latest?automatic?`공급 ${latest.round??1}회차 · ${((latest.number-1)%settings.generations)+1}/${settings.generations}세대`:`${latest.number} / ${settings.generations} 세대`:'실행 대기'}</span></div></div>
    <section className="metrics" aria-label="진화 요약"><div><small>{liveBest!==null?'현재 집단 최고 · 새 가중치':'현재 최고 적합도'}</small><strong>{liveBest!==null?number(liveBest):latest?number(latest.best):'—'}<span>점</span></strong></div><div><small>이번 공급 초기 대비</small><strong className="green">{versionMatch?`${latest!.best-first!.best>=0?'+':''}${number(latest!.best-first!.best)}`:'—'}<span>{versionMatch?'점':'동일 가중치 기준'}</span></strong></div><div><small>검토한 배치</small><strong>{latest?number(latest.evaluations):'0'}<span>개</span></strong></div><div className="metric-spark"><small>세대별 최고 점수</small><svg viewBox="0 0 230 45" aria-label="세대별 최고 적합도 추이">{roundHistory.length>1&&(()=>{const min=Math.min(...roundHistory.map(g=>g.best)),max=Math.max(...roundHistory.map(g=>g.best));return <polyline points={roundHistory.map((g,i)=>`${i/(roundHistory.length-1)*230},${40-(g.best-min)/Math.max(1,max-min)*34}`).join(' ')} fill="none" stroke="#198160" strokeWidth="2"/>;})()}</svg></div></section>
    <main className="workspace">
      <div className="left-column">
        <section className="panel viewer-panel"><div className="panel-heading"><div><span className="section-index">01</span><h2>배치 살펴보기</h2></div><span className="tag">{selected?`${selected.generation}세대 · ${selected.id}`:'개체를 선택하세요'}</span></div>
          <TruckView initialCoords={initialCoords} captureRef={captureRef} boxes={viewBoxes} coords={selected?.coords??[]} truck={truck} events={events} step={step} fixed={viewFixed}/>
          <div className="individual-stats"><div><small>선택 개체 점수</small><b>{selected?number(selected.score):'—'}<em>점</em></b></div><div><small>하차 재이동</small><b>{selected?.unloading?.moves??'—'}<em>회</em></b></div><div><small>하차 재이동 중량</small><b>{selected?.unloading?number(selected.unloading.mass):'—'}<em>kg</em></b></div><div><small>누적 상차 개수</small><b>{selected?selected.evaluation.loaded:'—'}<em>개</em></b></div></div>
          <div className="loading-summary">{selected?`적재함 부피 활용 ${(selected.evaluation.utilization*100).toFixed(1)}% · 미적재 ${selected.evaluation.unloadedIds.length}개 · 우선순 하차 완료 ${selected.unloading?.delivered??0}개`:'우선도 5가 먼저, 1이 나중입니다. 동점은 상자 ID순으로 하차합니다.'}<details><summary>우선도·하차 순서와 상차 비용 확인</summary><p>하차 순서: {(selected?.unloadOrder??[]).map(id=>`#${id}(P${viewBoxes.find(b=>b.id===id)?.priority})`).join(' → ')||'—'}</p><p>상차 순서: {selected?.loadOrder.map(id=>`#${id}`).join(' → ')||'—'}</p><p>별도 상차 재배치: {selected?.evaluation.moves??0}회 / {selected?number(selected.evaluation.mass):0}kg (GA 감점은 하차 비용 기준)</p></details></div>
          <div className="replay"><div className="replay-mode" role="group" aria-label="재생 모드"><button aria-pressed={replayMode==='unloading'} onClick={()=>setReplayMode('unloading')}>우선도 하차</button><button aria-pressed={replayMode==='loading'} onClick={()=>setReplayMode('loading')}>상차 확인</button></div><div className="replay-controls"><button disabled={!selected} onClick={()=>{setFollow(false);setPlaying(p=>!p);if(step===events.length)setStep(0);}}>{playing?'Ⅱ 재생 정지':`▷ ${replayMode==='unloading'?'하차':'상차'} 재생`}</button><input aria-label="배치 재생 단계" type="range" min="0" max={events.length} value={Math.min(step,events.length)} onChange={e=>{setPlaying(false);setStep(+e.target.value);}} disabled={!selected}/><span>{step}/{events.length}</span></div><p>{currentEvent?`#${currentEvent.boxId} · 우선도 ${viewBoxes.find(b=>b.id===currentEvent.boxId)?.priority} · ${currentEvent.kind==='deliver'?'배송 하차':currentEvent.kind==='load'?'최초 상차':currentEvent.kind==='out'?'방해 상자 임시 이동':'임시 이동 상자 복귀'} · 누적 ${currentEvent.moves}회 / ${number(currentEvent.mass)}kg`:replayMode==='unloading'?'적재 완료 상태에서 시작 · 높은 우선도부터 하차 · 최초 배송 하차는 재이동 제외':'빈 적재함에서 시작 · 최초 상차는 재이동 제외'}</p></div>

        </section>
        <section className="panel weights-panel"><div className="panel-heading"><div><span className="section-index">02</span><h2>평가 가중치</h2></div><span className="tag green-tag">우선도 하차 평가</span></div><p className="panel-description">모든 가중치는 1~501입니다. 적재·공간 집중도 보상에서 우선순 하차의 재이동 횟수·중량을 감점합니다. 점수는 음수일 수 있습니다.</p><div className="weight-fields"><Field disabled={!!snapshot} label="적재량 보상" value={weights.base} min={R.weight.min} max={R.weight.max} step="any" onChange={v=>setWeights(w=>({...w,base:v}))}/><Field disabled={!!snapshot} label="하차 재이동 1회 감점" value={weights.moves} min={R.weight.min} max={R.weight.max} step="any" onChange={v=>setWeights(w=>({...w,moves:v}))}/><Field disabled={!!snapshot} label="공간 집중도 보상" value={weights.space??20} min={R.weight.min} max={R.weight.max} step="any" onChange={v=>setWeights(w=>({...w,space:v}))}/><Field disabled={!!snapshot} label="하차 재이동 1kg 감점" value={weights.mass} min={R.weight.min} max={R.weight.max} step="any" onChange={v=>setWeights(w=>({...w,mass:v}))}/></div><div className="formula">{applied.base} × 적재율 + {applied.space??20} × 공간집중도 − {applied.moves} × 하차재이동횟수 − {applied.mass} × 하차재이동kg</div><div className="weight-footer"><button onClick={()=>setBoxList(b=>!b)}>상자별 우선도 설정</button><span>적재율 = (개수 비율 + 부피 비율) ÷ 2</span><button className="apply" onClick={apply}>가중치 적용 ↗</button></div></section>
        <section className="panel input-panel"><details><summary><span className="section-index">03</span> 입력과 탐색 설정 <span>펼치기 ＋</span></summary><div className="details-content"><h3>택배 입력</h3><label className="checkbox"><input type="checkbox" checked={automatic} disabled={locked} onChange={e=>{setAutomatic(e.target.checked);if(e.target.checked){setSequential(false);setArrival(null);}}}/>상자 자동 공급 · 누적 최대 400개</label><p className="help">탐색이 끝나도 다음 상자를 자동 생성합니다. 상자 할당 개수는 최초 입력과 다음 공급 묶음에 동일하게 적용합니다. 집단의 모든 개체가 할당 상자를 전부 적재하고 우선도 순서로 모두 하차한 뒤에만 다음 세대로 진행합니다. 방해 상자의 재이동 횟수·중량은 감점합니다. 누적 최대 400개 또는 추가 상차 공간·경로가 없거나 정지할 때까지 진행합니다.</p><div className="fields"><Field label={automatic?"상자 할당 개수 (회당)":"실험용 고정 상자 수"} value={count} min={MIN_BOXES} max={MAX_BOXES} disabled={locked} onChange={v=>changeCount(v)} onBlur={()=>changeCount(count,true)}/><Field label="상자 생성 난수값 (입력 seed)" value={inputSeed} min={0} max={4294967295} disabled={locked} onChange={setInputSeed}/></div>{countWarning&&<p role="alert" className="input-warning">{countWarning}</p>}<p className="help">입력 범위 1~400개 · 누적 할당 {boxes.length}/400개 · 수량·seed 변경은 시작 시 실제 목록에 반영됩니다.</p><div className="grade-legend">{GRADES.map((g,i)=><span key={g.name}><i style={{background:['#d4aa74','#94bb9b','#c4ae82','#8babb0','#c28a65'][i]}}/>{g.name} {boxes.filter(b=>b.grade===i).length}</span>)}</div><p className="help">5등급 각 20% 추첨 · 최대 160cm / 20kg · 최장변 100cm</p><div className="inline"><button disabled={locked} onClick={()=>generate()}>상자 다시 생성</button><button onClick={()=>setBoxList(b=>!b)}>{boxList?'목록 닫기':'상자 목록'}</button></div>
          <label className="checkbox"><input type="checkbox" checked={sequential} disabled={locked||automatic} onChange={e=>{setSequential(e.target.checked);generate(e.target.checked);}}/>순차 도착 모드 · 대기 공간 40개</label>
          {sequential&&arrival&&<div className="arrival"><p>도착 {arrival.cursor}/{boxes.length} · 대기 {arrival.waiting.length}/40 · 적재 {arrival.loaded.length}</p><div className="inline"><button disabled={busy||state==='일시정지'} onClick={receive}>다음 상자 도착</button><button disabled={!selected||busy||state==='일시정지'||!arrival.waiting.length} onClick={commit}>선택 배치 상차</button></div><p className="help">도착 → GA 실행 → 정지/완료 → 배치 선택 → 상차 확정. 기존 적재 좌표는 고정됩니다.</p><ol className="arrival-log">{arrival.log.slice(-5).map((s,i)=><li key={i}>{s}</li>)}</ol></div>}
          <p className="help">입력 seed는 상자 생성, GA seed는 진화 계산의 난수값입니다. 같은 난수값과 설정은 같은 결과를 재현합니다.</p><h3>가상 적재함 내부 치수 (cm)</h3><p className="help">실험용 입력 치수이며 차량 실측값이 아닙니다. 출입구는 깊이 0 방향입니다.</p><div className="fields three">{(['width','depth','height'] as const).map((k,i)=><Field key={k} label={['폭','깊이','높이'][i]} value={truck[k]} min={10} max={2000} disabled={locked} onChange={v=>setTruck(t=>({...t,[k]:v}))}/>)}</div>
          <h3>유전 알고리즘</h3><p className="help">집단 0~101 · 세대 1~10,001 · 교차율 0.1~1.1 · 변이율 0.01~1 · k 1~6. 교차율 입력 {Number.isFinite(settings.crossover)?settings.crossover:'—'} → 실제 {Number.isFinite(settings.crossover)?Number((effectiveCrossover(settings.crossover)*100).toFixed(6)):'—'}%. 1 이상이면 항상 교차합니다.</p><div className="fields"><Field label="집단 크기" value={settings.population} min={R.population.min} max={R.population.max} disabled={locked} onChange={v=>setSettings(s=>({...s,population:v}))}/><Field label={automatic?"공급 회차당 탐색 세대":"총 세대"} value={settings.generations} min={R.generations.min} max={R.generations.max} disabled={locked} onChange={v=>setSettings(s=>({...s,generations:v}))}/><Field label="교차율" value={settings.crossover} min={R.crossover.min} max={R.crossover.max} step="any" disabled={locked} onChange={v=>setSettings(s=>({...s,crossover:v}))}/><Field label="상자별 변이율" value={settings.mutation} min={R.mutation.min} max={R.mutation.max} step="any" disabled={locked} onChange={v=>setSettings(s=>({...s,mutation:v}))}/><Field label="토너먼트 k" value={settings.tournament} min={R.tournament.min} max={R.tournament.max} disabled={locked} onChange={v=>setSettings(s=>({...s,tournament:v}))}/><Field label="진화 난수값 (GA seed)" value={settings.seed} min={0} max={4294967295} disabled={locked} onChange={v=>setSettings(s=>({...s,seed:v}))}/></div><p className="help">집단 0은 실행하지 않고 안내합니다. 토너먼트는 복원 추출이므로 집단보다 k가 커도 사용할 수 있습니다. 엘리트 1개 보존 · 설정 변경 전 초기화하세요.</p></div></details></section>
      </div>
      <section className="panel tree-panel"><div className="panel-heading"><div><span className="section-index">04</span><h2>세대별 진화 로드맵</h2></div><span className="tag">{latest?`${latest.number*settings.population} 개체`:'1세대부터 시작'}</span></div><div className="tree-intro"><p>아래에서 시작해, 더 나은 배치로 올라갑니다.</p><label className="checkbox"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>최신 세대 따라가기</label></div><div className="tree-legend"><span><i className="legend-normal"/>배치 후보</span><span><i className="legend-best"/>세대 최고</span><span><i className="legend-selected"/>선택 개체</span><span className="tree-direction">진화 방향 ↑</span></div>
        <GenerationTree history={history} selected={selected?.id??''} onSelect={p=>{setSelected(p);setFollow(false);}} follow={follow} setFollow={setFollow}/>
        <div className="tree-footer"><span>{selected?`${selected.operation}${selected.repaired?' · 유효 배치 수정':''} · 평가 v${selected.version}`:'개체를 클릭하면 왼쪽에 실제 배치를 표시합니다.'}</span><span>드래그 대신 스크롤로 계보 탐색 ↔</span></div>
      </section>
    </main>
    <section className="control-dock"><div className="dock-label"><span className="pulse"/><div><b>진화 실행</b><small>{automatic?`자동 공급 ${supplyRound}회차 · 할당 ${count}개 · 누적 ${boxes.length}/400개`:`입력 ${activeBoxes.length}개`} · 집단 {settings.population}</small></div></div><div className="controls"><button className="primary" disabled={busy} onClick={start}>▶ 처음부터 시작</button><button disabled={!busy} onClick={()=>worker.current?.postMessage({type:'pause',run:run.current})}>Ⅱ 일시정지</button><button disabled={state!=='일시정지'} onClick={()=>worker.current?.postMessage({type:'resume',run:run.current})}>▷ 이어서 실행</button><button disabled={!busy&&state!=='일시정지'} onClick={()=>worker.current?.postMessage({type:'stop',run:run.current})}>■ 정지</button><button className="complete" disabled={!history.length||!!snapshot} onClick={complete}>✓ 완료 · 결과 확정</button><button className="reset" onClick={clear}>↺ 초기화</button></div></section>
    <ResultExport key={snapshot?.completedAt??'pending'} snapshot={snapshot}/>
    {message&&<div className="notice" role="alert">{message}<button aria-label="알림 닫기" onClick={()=>setMessage('')}>×</button></div>}
    {boxList&&<section id="priority-boxes" className="panel box-list"><div className="panel-heading"><h2>상자별 하차 우선도</h2><span>5가 먼저 · 1이 나중 · 동점은 ID순</span></div><p className="panel-description">같은 세대의 모든 개체는 동일한 상자 ID·우선도를 사용합니다. 실행 또는 순차 도착 전에 수정하세요. {priorityStale?'수량·seed가 바뀌었습니다. 상자를 다시 생성한 후 수정하세요.':priorityLocked?'현재 입력은 잠겨 있습니다. 초기화 후 수정할 수 있습니다.':'수정한 우선도는 같은 입력의 처음부터 시작에도 유지됩니다.'}</p><div className="table-scroll priority-table"><table><thead><tr><th>ID</th><th>등급</th><th>크기 (cm)</th><th>무게 (kg)</th><th>하차 우선도</th><th>하차 순위</th></tr></thead><tbody>{boxes.map(b=><tr key={b.id}><td>#{b.id}</td><td>{GRADES[b.grade].name}</td><td>{b.size.join(' × ')}</td><td>{b.weight}</td><td><input aria-label={`상자 #${b.id} 하차 우선도`} type="number" min="1" max="5" step="0.1" value={Number.isFinite(b.priority)?b.priority:''} disabled={priorityLocked} style={{borderLeft:`5px solid ${priorityColor(b.priority)}`}} onChange={e=>changePriority(b.id,e.target.value===''?NaN:Number(e.target.value))}/></td><td>{ranks.get(b.id)}번째</td></tr>)}</tbody></table></div></section>}

    <section className="panel experiment-panel"><details><summary>무작위 배치와 비교 실험<span>동일 입력 · 동일 평가 예산 · 3개 seed</span></summary><div className="details-content"><p>교차율 0/0.6/0.9, 선택 k=2/3/5, 변이율 0/0.05/0.2를 각각 비교합니다. 현재 집단·총 세대 설정으로 27회 실행하므로 시간이 걸릴 수 있습니다. 현재 GA와 독립적으로 계산합니다.</p><div className="inline"><button className="apply" disabled={busy||!!(experimentState&&!experimentState.includes('완료')&&!experimentState.includes('취소')&&!experimentState.includes('오류'))} onClick={experiment}>비교 실험 시작</button><button onClick={()=>{experimentWorker.current?.terminate();setExperimentState('실험 취소');}}>실험 취소</button><button disabled={!results.length} onClick={()=>saveJson({input:(experimentWorker.current as Worker&{snapshot?:unknown})?.snapshot,results,summaries})}>결과 JSON 저장</button><span role="status">{experimentState}</span></div>{summaries.length>0&&<div className="table-scroll"><table><thead><tr><th>조건</th><th>GA 평균 점수</th><th>무작위 최고 평균</th><th>GA 평균 적재 개수</th><th>GA 평균 하차 재이동</th><th>GA 평균 하차 중량</th></tr></thead><tbody>{summaries.map(s=><tr key={s.condition}><td>{s.condition}</td><td>{number(s.ga)}</td><td>{number(s.random)}</td><td>{number(s.loaded)}개</td><td>{number(s.moves)}회</td><td>{number(s.mass)}kg</td></tr>)}</tbody></table><p className="help">각 조건의 seed 11·29·47 평균. 개선되지 않은 결과도 그대로 표시합니다. JSON에 각 실행의 평가 예산과 원자료를 포함합니다.</p></div>}</div></details></section>
    <footer className="page-footer"><span>LOADLAB / 우선순 하차 배치 개선 유전 알고리즘</span><span>좌표 기반 인코딩 · 토너먼트 선택 · 1점 교차 · 위치 변이</span></footer>
  </div>;
}
```

함수·구성요소 역할(실제 문서화 주석):
- `function number(n:number)`: 읽기 쉬운 소수점 표시.
- `function saveJson(data:unknown)`: 실험 결과·입력·실행 설정을 사용자의 파일로 보관한다.
- `function Field(`: 숫자 입력에 단위와 범위를 표시한다.
- `export function App()`: GA의 계산·세대 선택·3D 재생과 설정 적용을 연결하는 로컬 웹 진입점.
- `function createWorker()`: 새 Worker를 만들고 이전 실행의 응답은 무시한다.
- `function start()`: 현재 입력으로 실행 이력과 난수 상태를 새로 만든다.
- `function clear()`: 입력은 유지하고 계산·선택·재생 기록을 비운다.
- `function generate(mode=sequential)`: 입력 목록을 동일 seed로 재생성한다. 순차 모드는 도착도 처음부터 시작한다.
- `function apply()`: 가중치만 현재 집단에 적용하고 세대별 당시 점수는 보존한다.
- `function receive()`: 순차 도착을 한 건 진행한다. 진행 중 실행은 변경하지 않는다.
- `function commit()`: 검증된 배치의 실제 상차 순서를 확정해 다음 탐색에서 고정한다.
- `function experiment()`: 계획서의 3개 seed와 9개 조건을 별도 Worker에서 비교한다.

### `src/ui/GenerationTree.tsx`

```tsx
import { useEffect,useRef,useState } from 'react';
import type { Generation,Individual } from '../domain/model';
const ROW=132,CELL=92,LEFT=96;
/** 화면에 보이는 세대 행만 그리되 실제 부모 ID의 연결을 표시한다. SW_Browser_EvolutionView_001 */
export function GenerationTree({history,selected,onSelect,follow,setFollow}:{history:Generation[];selected:string;onSelect:(p:Individual)=>void;follow:boolean;setFollow:(b:boolean)=>void}) {
  const host=useRef<HTMLDivElement>(null),[top,setTop]=useState(0),[height,setHeight]=useState(600);
  useEffect(()=>{if(follow&&host.current)host.current.scrollTop=0;},[history.length,follow]);
  useEffect(()=>{const o=new ResizeObserver(()=>setHeight(host.current?.clientHeight??600));if(host.current)o.observe(host.current);return()=>o.disconnect();},[]);
  const reversed=[...history].reverse(),start=Math.max(0,Math.floor(top/ROW)-1),end=Math.min(reversed.length,Math.ceil((top+height)/ROW)+1);
  const count=history[0]?.individuals.length??0,width=Math.max(780,LEFT+count*CELL+20);
  return <div className="tree-scroll" ref={host} onScroll={e=>{setTop(e.currentTarget.scrollTop);if(e.currentTarget.scrollTop>20&&follow)setFollow(false);}}>
    {!history.length?<div className="tree-empty"><div className="empty-orbit">↟</div><h3>첫 세대가 기다리고 있습니다</h3><p>시작하면 실제 배치 후보가 아래에서부터 자랍니다.</p><div className="ghost-nodes"><b/><b/><b/><b/><b/></div></div>:
    <div style={{height:history.length*ROW+30,width,position:'relative'}}>
      <svg width={width} height={history.length*ROW+30} className="tree-lines" aria-label="부모와 자식의 실제 연결">
        {reversed.slice(start,end).flatMap((g,offset)=>{const row=start+offset,parent=reversed[row+1];if(!parent)return [];
          const indices=new Map(parent.individuals.map((p,i)=>[p.id,i]));
          return g.individuals.flatMap((p,i)=>p.parents.map((id,k)=>{const j=indices.get(id);if(j===undefined)return null;const hot=p.id===selected||id===selected;return <path key={p.id+id+k} d={`M ${LEFT+i*CELL+34} ${row*ROW+83} C ${LEFT+i*CELL+34} ${row*ROW+112}, ${LEFT+j*CELL+34} ${row*ROW+112}, ${LEFT+j*CELL+34} ${(row+1)*ROW+32}`} stroke={hot?'#147957':'#d3dcd3'} strokeWidth={hot?2:1} opacity={hot?1:.45}/>;}));})}
      </svg>
      {reversed.slice(start,end).map((g,offset)=>{const row=start+offset;return <section className="generation-row" key={g.number} style={{top:row*ROW,width}} aria-label={`${g.number}세대`}>
        <div className="generation-label"><b>{String(g.number).padStart(2,'0')}</b><span>세대</span><small>v{g.version}</small></div>
        <div className="individuals">{g.individuals.map((p,i)=><button key={p.id} className={`individual ${selected===p.id?'selected':''} ${p.score===g.best?'best':''}`} onClick={()=>onSelect(p)} title={`${p.id} · ${p.operation}${p.repaired?' · 배치 수정':''} · 부모 ${p.parents.join(', ')||'없음'}`} aria-label={`${g.number}세대 개체 ${i+1}, 점수 ${p.score}`}><span className="node-symbol">{p.operation==='엘리트'?'◆':'▥'}</span><b>{p.score.toFixed(1)}</b><small>#{i+1}{p.score===g.best?' · BEST':''}</small></button>)}</div>
      </section>;})}
    </div>}
  </div>;
}
```

함수·구성요소 역할(실제 문서화 주석):
- `export function GenerationTree(`: 화면에 보이는 세대 행만 그리되 실제 부모 ID의 연결을 표시한다. SW_Browser_EvolutionView_001

### `src/main.tsx`

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './style.css';
createRoot(document.getElementById('root')!).render(<App/>);

```

## 2026-11-16 13:00:16 (KST) 추가 수정

상자 수 Field의 max=120을 제거했다. 최소 1·정수 검사는 유지하고 실행 중 입력 잠금 동작은 보존했다.

## 2026-11-16 13:13:21 (KST) — 18개기본종료제거

자동 공급을 기본 선택으로 설정하고 18/18개 표시를 실제 상차 개수로 변경했다. 고정 개수 입력은 수동 실험 모드에만 표시한다. 과거 선택은 당시 상자·고정 좌표 스냅샷으로 재생하며 점수 추세는 동일 입력 회차 안에서 비교한다.

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


## 2026-11-17 01:37:10 (KST) 상자별 우선도 실평가 연결

입력/우선순하차/GA점수/재생/내보내기연동.66개검사·빌드통과.작동순서·함수별역할·정책변경·단위·제약·검증은 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md`.위전체소스는현재구현이다.


## 2026-11-17 01:51:14 (KST) 최종 확인

67개 검사와 타입검사·빌드 통과. 공개 브라우저 6개 우선도 수정/배송순서/PNG·ZIP, 100·220개 집단50·3세대와 일시정지·재개 확인. Pages 성공. 상세 조건·시간·가정·증거는 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md` 최종 기록. 현재 전체 소스 스냅샷 동기화 완료.


### `src/style.css`

```css
:root{font-family:'Segoe UI','Malgun Gothic',sans-serif;color:#23382c;background:#f3f4ef;font-synthesis:none;font-weight:400;font-size:14px;--green:#147957;--line:#dce2d8;--muted:#788579}*{box-sizing:border-box}body{margin:0}button,input{font:inherit}button{cursor:pointer;border:1px solid #d6dfd3;background:#fff;color:#304b3c;border-radius:6px;padding:9px 12px;transition:background .15s,border-color .15s}button:hover:not(:disabled){background:#edf4e9;border-color:#76a18a}button:disabled{cursor:default;opacity:.4}button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #9dbd65;outline-offset:2px}a{color:inherit}input[type=number]{width:100%;min-width:0;border:1px solid var(--line);border-radius:5px;padding:10px 12px;background:#fbfcf8;color:#23382c;font-variant-numeric:tabular-nums}input:disabled{background:#f0f2ec}h1,h2,h3,p{margin:0}.app{max-width:1800px;margin:auto;padding:0 36px}.topbar{height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand{text-decoration:none;font-size:23px;font-weight:750;letter-spacing:1px;display:flex;align-items:center;gap:10px}.brand-mark{display:inline-grid;place-items:center;background:#174c36;color:#d5eb8b;width:33px;height:36px;border-radius:5px;font-size:24px}.brand-sub{font-size:12px;font-weight:400;letter-spacing:0;color:var(--muted);border-left:1px solid #d3dbcf;padding-left:14px;margin-left:7px}.header-meta{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:11px;letter-spacing:.7px}.local-dot,.scene-caption i{width:6px;height:6px;border-radius:50%;background:#599867;display:inline-block}.separator{height:12px;border-left:1px solid var(--line);margin:0 12px}.page-heading{padding:32px 0 26px;display:flex;align-items:center;justify-content:space-between}.eyebrow{font-size:10px;letter-spacing:2px;color:#768476;margin-bottom:12px}h1{font-weight:600;font-size:29px;letter-spacing:-1.1px}h1>span{color:#7d9b38;margin-left:2px}.page-heading p{color:var(--muted);font-size:12px;margin-top:10px}.status{display:flex;gap:7px;align-items:center;font-size:13px}.status i{width:7px;height:7px;border-radius:50%;background:#899685}.status-실행 i{background:#21855c;box-shadow:0 0 0 4px #dfecd6}.status-오류 i{background:#c77850}.status span{color:var(--muted);border-left:1px solid var(--line);padding-left:14px;margin-left:8px;font-size:12px}.metrics{border:1px solid var(--line);border-radius:9px;display:grid;grid-template-columns:1fr 1fr 1fr 1.2fr;background:#fafbf7;margin-bottom:23px;padding:20px 0}.metrics>div{padding:0 26px;border-right:1px solid var(--line)}.metrics>div:last-child{border:0}.metrics small{font-size:11px;color:var(--muted);display:block;margin-bottom:9px}.metrics strong{font-size:28px;font-weight:500;letter-spacing:-.9px;font-variant-numeric:tabular-nums}.metrics strong span{font-size:11px;font-weight:400;color:#859080;margin-left:8px;letter-spacing:0}.green{color:var(--green)}.metric-spark svg{height:39px;width:100%;max-width:230px}.workspace{display:grid;grid-template-columns:minmax(460px, .93fr) minmax(0,1.07fr);gap:22px;align-items:start}.left-column{display:flex;flex-direction:column;gap:17px}.panel{background:#fff;border:1px solid var(--line);border-radius:9px;overflow:hidden}.panel-heading{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;gap:10px}.panel-heading>div{display:flex;align-items:center;gap:10px}.section-index{font-family:monospace;font-size:11px;color:#91a08d;font-weight:400;margin-right:2px}h2{font-size:14px;font-weight:600}.tag{background:#f1f4ed;border:1px solid #e7ebe2;color:#7b8875;font-size:10px;border-radius:4px;padding:5px 8px;white-space:nowrap}.green-tag{color:#43805a;background:#eef6e9;border-color:#dfecd5}.scene-wrap{position:relative;height:350px;background:#e9eee7;margin:0 12px;border-radius:6px;overflow:hidden}.scene{height:100%;width:100%}.scene canvas{display:block;width:100%;height:100%}.scene-toolbar{position:absolute;top:12px;left:12px;display:flex;gap:5px}.scene-toolbar button{background:#ffffffd9;font-size:10px;border-color:#d7dfd2;padding:6px 9px}.scene-caption{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;gap:5px;background:#e9eee7cc;padding:9px 12px;font-size:9px;color:#788471;pointer-events:none}.scene-caption i{margin-right:3px}.scene-error{position:absolute;left:20px;top:45%;right:20px;color:#8f4b26;background:#fff;padding:20px}.individual-stats{display:grid;grid-template-columns:repeat(4,1fr);padding:20px 12px 16px}.individual-stats>div{padding-left:14px;border-right:1px solid #e9ede5}.individual-stats>div:last-child{border:0}.individual-stats small{font-size:9px;display:block;color:var(--muted);margin-bottom:7px}.individual-stats b{font-weight:500;font-size:22px;font-variant-numeric:tabular-nums}.individual-stats em{font-size:10px;font-style:normal;font-weight:400;color:#82907b;margin-left:4px}.replay{border-top:1px solid #edf0e8;padding:12px 20px}.replay-controls{display:flex;align-items:center;gap:12px}.replay button{font-size:10px;padding:6px 8px;white-space:nowrap}.replay input{min-width:0;flex:1;accent-color:var(--green)}.replay-controls>span{font-size:10px;color:#85917d;min-width:30px}.replay p{font-size:10px;color:var(--muted);margin-top:10px}.weights-panel .panel-heading{padding-bottom:10px}.panel-description{padding:0 20px;font-size:11px;color:var(--muted)}.weight-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;padding:18px 20px 15px}.field{display:block;min-width:0}.field>span{display:block;font-size:10px;color:#73836f;margin-bottom:7px}.weight-fields input{font-size:21px;font-weight:500;background:#f7faf3;border-color:#dbe6d2}.formula{background:#f5f7f0;border:1px dashed #d8e0ce;margin:0 20px;padding:11px;text-align:center;font-size:12px;color:#77866c;border-radius:5px}.formula b{color:#326440;font-weight:500}.weight-footer{display:flex;align-items:center;justify-content:space-between;padding:14px 20px}.weight-footer>span{font-size:9px;color:#8a9584}.apply{color:#fff;background:#216746;border-color:#216746;font-size:11px}.apply:hover:not(:disabled){color:#fff;background:#174f34}.input-panel summary,.experiment-panel summary{padding:17px 20px;cursor:pointer;list-style:none;font-size:12px;font-weight:500}.input-panel summary>span:last-child{float:right;color:#8d9985;font-size:10px}.details-content{padding:4px 20px 20px}.details-content h3{font-weight:500;font-size:12px;margin:15px 0 12px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.fields.three{grid-template-columns:repeat(3,1fr)}.help{font-size:10px;color:#88947f;line-height:1.8;margin:8px 0}.inline{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0;font-size:11px}.inline button{font-size:11px}.grade-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:10px;color:#7c8875;margin:14px 0 8px}.grade-legend i{width:7px;height:7px;display:inline-block;border-radius:2px;margin-right:4px}.checkbox{display:flex;align-items:center;gap:5px;color:#7a8870;font-size:10px;white-space:nowrap}.checkbox input{accent-color:#277b50;width:13px;height:13px}.details-content>.checkbox{margin-top:17px}.arrival{background:#f5f7ef;border:1px solid #e4eadb;padding:12px;margin-top:10px;font-size:11px}.arrival-log{padding-left:15px;color:#78836c;font-size:10px;line-height:1.8}.tree-panel{display:flex;flex-direction:column;position:sticky;top:15px;min-height:742px}.tree-panel>.panel-heading{padding-bottom:12px}.tree-intro{padding:0 20px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.tree-intro p{font-size:11px;color:var(--muted)}.tree-legend{border-top:1px solid #edf0e9;border-bottom:1px solid #edf0e9;padding:12px 20px;display:flex;align-items:center;gap:16px;font-size:9px;color:#8a9581}.tree-legend i{display:inline-block;width:7px;height:7px;border:1px solid #9aa78d;border-radius:2px;margin-right:5px}.tree-legend .legend-best{background:#b6ce82;border-color:#a0bb64}.tree-legend .legend-selected{background:#276e48;border-color:#276e48}.tree-direction{margin-left:auto;color:#54915c}.tree-scroll{overflow:auto;height:570px;position:relative;background-color:#fbfcf8;background-image:radial-gradient(#dce3d4 .65px,transparent .65px);background-size:17px 17px;scroll-behavior:auto;overscroll-behavior:contain}.tree-empty{min-width:380px;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;color:#9ba68d}.empty-orbit{font-size:42px;line-height:1;margin-bottom:15px;color:#92aa71}.tree-empty h3{font-size:14px;font-weight:400;color:#6c7f5c}.tree-empty p{font-size:11px;margin-top:10px}.ghost-nodes{display:flex;gap:18px;margin-top:45px}.ghost-nodes b{width:42px;height:35px;border:1px dashed #c9d6b8;border-radius:5px;background:#f0f5e9}.tree-lines{position:absolute;inset:0;pointer-events:none;fill:none}.generation-row{position:absolute;left:0;height:132px;display:flex;align-items:flex-start}.generation-label{position:sticky;left:0;z-index:2;background:#f7faf1e8;padding:24px 12px;width:84px;min-width:84px;display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:4px;border-right:1px solid #e5ecdc;height:100%}.generation-label b{font-size:26px;font-weight:400;color:#5b7450}.generation-label span,.generation-label small{font-size:9px;color:#96a28b}.generation-label small{grid-column:1/-1;align-self:start}.individuals{display:flex;gap:24px;padding:21px 12px}.individual{width:68px;min-width:68px;height:72px;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px;background:#fff;border:1px solid #d8e2cc;box-shadow:0 2px 1px #e4ebdc33;color:#66805a}.individual .node-symbol{font-size:14px;color:#a6b78b;line-height:1}.individual b{font-size:12px;font-weight:500;margin:4px 0;font-variant-numeric:tabular-nums}.individual small{font-size:7px;color:#92a180;white-space:nowrap}.individual.best{border-color:#aec780;background:#f0f6e7}.individual.selected{background:#245d40;border-color:#245d40;color:#fff;box-shadow:0 0 0 3px #b7cf92}.individual.selected small,.individual.selected .node-symbol{color:#d6e4c3}.tree-footer{padding:15px 20px;display:flex;justify-content:space-between;font-size:9px;color:#8c9981;gap:15px;line-height:1.7}.control-dock{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#142b20;color:#d7e5c9;border-radius:9px;margin:24px 0 18px;padding:18px 24px}.dock-label{display:flex;gap:12px;align-items:center}.pulse{width:8px;height:8px;border-radius:50%;background:#b6d379;box-shadow:0 0 0 5px #243e28}.dock-label b{font-size:12px;font-weight:500;display:block}.dock-label small{font-size:9px;color:#98af91;display:block;margin-top:6px}.controls{display:flex;gap:7px;flex-wrap:wrap}.controls button{background:#233d2d;color:#c5d4b9;border-color:#34503a;font-size:11px;padding:11px 15px}.controls button:hover:not(:disabled){background:#355238}.controls .primary{background:#d4e8a1;border-color:#d4e8a1;color:#254329;font-weight:600}.controls .primary:hover:not(:disabled){background:#c5dc8a}.controls .reset{background:transparent;border-color:transparent;color:#b3c4a4}.notice{display:flex;align-items:center;justify-content:space-between;background:#fff7df;border:1px solid #e5d7ac;border-radius:6px;padding:12px 18px;font-size:12px;color:#7e6631;margin-bottom:18px}.notice button{background:transparent;border:0;padding:0 3px;color:#917b47;font-size:20px}.experiment-panel{margin-bottom:20px;background:#fafbf7}.experiment-panel summary{display:flex;justify-content:space-between}.experiment-panel summary>span{font-size:10px;color:var(--muted);font-weight:400}.experiment-panel .details-content>p{font-size:11px;line-height:1.9;color:#7b8871}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;text-align:left;font-size:11px;white-space:nowrap}th,td{padding:10px 15px;border-bottom:1px solid var(--line)}th{background:#f1f5ea;font-size:10px;font-weight:500;color:#627455}.box-list{margin-bottom:18px}.page-footer{display:flex;justify-content:space-between;padding:7px 0 22px;color:#8f9a85;font-size:9px;gap:15px}@media(min-width:1500px){.scene-wrap{height:410px}.tree-scroll{height:630px}}@media(max-width:1100px){.app{padding:0 22px}.workspace{grid-template-columns:minmax(400px,1fr) minmax(0,1fr);gap:16px}.tree-intro{align-items:flex-start;flex-direction:column;gap:7px}.tree-scroll{height:585px}.control-dock{align-items:flex-start;flex-direction:column}.brand-sub{display:none}.tree-footer>span:last-child{display:none}.scene-caption>span:last-child{display:none}}@media(max-width:850px){.workspace{grid-template-columns:1fr}.tree-panel{position:static;min-height:500px}.tree-scroll{height:450px}.scene-wrap{height:380px}.header-meta{font-size:9px}.header-meta .separator,.header-meta .separator~*{display:none}.metrics{grid-template-columns:repeat(3,1fr)}.metrics .metric-spark{display:none}.page-heading{gap:20px;align-items:flex-start}.status{flex-wrap:wrap;min-width:100px;justify-content:flex-end}.status span{border:0;padding:0;margin:0}h1{font-size:24px}.page-heading p{line-height:1.7}.metrics>div{padding:0 16px}.metrics>div:nth-child(3){border:0}.control-dock{position:static}.controls{width:100%}.controls button{flex:1;white-space:nowrap;padding:11px 8px}.experiment-panel summary{gap:10px;flex-wrap:wrap}}@media(max-width:480px){.app{padding:0 12px}.topbar{height:65px}.header-meta{font-size:8px;letter-spacing:0}.brand{font-size:19px}.page-heading{padding:25px 0 22px}.eyebrow{font-size:8px;letter-spacing:1px}h1{font-size:20px;letter-spacing:-.7px}.page-heading p{font-size:10px}.metrics{padding:15px 0}.metrics>div{padding:0 11px}.metrics strong{font-size:22px}.metrics strong span{font-size:8px;margin-left:4px}.metrics small{font-size:9px}.panel-heading{padding:16px 14px}.tag{font-size:9px}.scene-wrap{height:290px;margin:0 8px}.individual-stats>div{padding-left:6px}.individual-stats small{font-size:8px}.individual-stats b{font-size:18px}.individual-stats em{font-size:8px}.weight-fields{gap:8px;padding:16px 14px}.weight-fields input{font-size:18px;padding:8px}.field>span{font-size:9px}.weight-footer{padding:12px 14px;gap:7px}.weight-footer>span{font-size:8px}.formula{margin:0 14px}.tree-legend{gap:10px;padding:12px 14px}.control-dock{padding:18px 16px}.controls button{font-size:10px}.page-footer{font-size:8px}.page-footer>span:last-child{display:none}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}

.loading-summary{padding:0 20px 14px;font-size:10px;color:#70846a;line-height:1.8}.loading-summary details{margin-top:8px}.loading-summary summary{cursor:pointer}.loading-summary p{overflow-wrap:anywhere;margin-top:6px}.weight-fields{grid-template-columns:repeat(2,1fr)}.weight-footer>span{max-width:60%;line-height:1.7}

/* 확정 결과 내보내기: SW_Browser_ResultExport_001 */
.result-export{margin:24px auto;max-width:1544px;padding-bottom:24px;scroll-margin-bottom:140px}
.result-export fieldset{border:0;padding:0 24px;margin:0;min-width:0}
.result-export legend{font-size:13px;color:#526866;margin-bottom:14px}
.result-export fieldset:disabled{opacity:.55}
.result-export .export-options{grid-template-columns:1fr 1fr 1.5fr}
.result-export select{width:100%;padding:15px;border:1px solid #dbe4df;border-radius:7px;background:#f6f8f2;color:#183c3d;font:inherit}
.export-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0}
.export-card{border:1px solid #dbe4df;border-radius:9px;padding:18px;display:flex;flex-direction:column;gap:12px;align-items:flex-start;background:#fafbf8}
.export-card small{color:#526866;font-size:12px;line-height:1.6}.export-card .inline{flex-wrap:wrap}
.result-export>p[role=status],.result-export>button{margin:12px 24px}.complete{border-color:#147957;color:#147957;font-weight:700}
.control-dock .controls{flex-wrap:wrap}
@media(max-width:1000px){.export-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.result-export{margin:20px 28px}.result-export .export-options{grid-template-columns:1fr 1fr}}
@media(max-width:600px){.export-grid{grid-template-columns:1fr}.result-export{margin:16px}.result-export .export-options{grid-template-columns:1fr}.result-export fieldset{padding:0 16px}}

/* 우선도 입력·하차 재생 */
.priority-table{max-height:420px;overflow:auto}.priority-table th{position:sticky;top:0;background:#f5f8f3;z-index:1}
.priority-table input{width:90px;padding:8px;border:1px solid #cddbcf;border-radius:5px;font:inherit;color:#183c3d;background:#fff}.priority-table input:disabled{background:#f1f4ef;color:#526866}
.replay-mode{display:flex;gap:7px;margin-bottom:12px}.replay-mode [aria-pressed=true]{background:#147957;color:#fff}
.priority-legend{position:absolute;left:16px;bottom:36px;display:flex;gap:6px;align-items:center;background:#ffffffd9;padding:5px 8px;border-radius:5px;font-size:10px;color:#183c3d}.priority-legend[hidden]{display:none}.priority-legend i{width:90px;height:8px;border-radius:8px;background:linear-gradient(90deg,hsl(220,68%,50%),hsl(110,68%,50%),hsl(0,68%,50%))}
.weight-footer{flex-wrap:wrap}.individual-stats b{font-size:clamp(16px,1.5vw,24px);overflow-wrap:anywhere}.box-list{scroll-margin-top:24px}
@media(max-width:600px){.scene-toolbar{gap:4px;flex-wrap:wrap}.scene-toolbar button{font-size:9px;padding:6px}.individual-stats b{font-size:16px}}

.input-warning{color:#9a4319;background:#fff4df;border:1px solid #e7bb74;border-radius:8px;padding:10px 12px;font-size:13px;}

.field-warning{color:#97521d;font-size:12px;line-height:1.5;}
```


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

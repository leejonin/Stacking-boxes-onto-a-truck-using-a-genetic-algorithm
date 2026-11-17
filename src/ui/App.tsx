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

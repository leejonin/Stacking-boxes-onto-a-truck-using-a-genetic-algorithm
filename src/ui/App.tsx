import { useEffect,useMemo,useRef,useState } from 'react';
import { DEFAULT_SETTINGS,DEFAULT_TRUCK,DEFAULT_WEIGHTS,GRADES,generateBoxes,validateConfig,type Box,type Vec,type Truck,type Settings,type Weights,type Individual,type Generation } from '../domain/model';
import { simulateLoading } from '../simulation/loading';
import {simulateLoaded} from '../simulation/unload';
import {simulateAccumulatedLoading} from '../simulation/accumulated';
import {validateCompletionPercent} from '../simulation/supply';
import { Arrival } from '../simulation/arrival';
import { TruckView } from '../scene/TruckView';
import { GenerationTree } from './GenerationTree';
import type { Command } from '../workers/evolution';
import type { ExperimentRow } from '../ga/experiments';

/** 읽기 쉬운 소수점 표시. */
function number(n:number) {return n.toLocaleString('ko-KR',{maximumFractionDigits:1});}
/** 실험 결과·입력·실행 설정을 사용자의 파일로 보관한다. */
function saveJson(data:unknown) {const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='loadlab-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
/** 숫자 입력에 단위와 범위를 표시한다. */
function Field({label,value,onChange,min,max,step=1,disabled=false}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number;disabled?:boolean}) {return <label className="field"><span>{label}</span><input type="number" value={Number.isNaN(value)?'':value} min={min} max={max} step={step} disabled={disabled} onChange={e=>onChange(e.target.value===''?NaN:Number(e.target.value))}/></label>;}
/** GA의 계산·세대 선택·3D 재생과 설정 적용을 연결하는 로컬 웹 진입점. */
export function App() {
  const [count,setCount]=useState(20),[inputSeed,setInputSeed]=useState(2026),[boxes,setBoxes]=useState<Box[]>(()=>generateBoxes(20,2026));
  const [truck,setTruck]=useState<Truck>({...DEFAULT_TRUCK}),[settings,setSettings]=useState<Settings>({...DEFAULT_SETTINGS}),[weights,setWeights]=useState<Weights>({...DEFAULT_WEIGHTS});
  const [applied,setApplied]=useState<Weights>({...DEFAULT_WEIGHTS}),[state,setState]=useState('준비'),[history,setHistory]=useState<Generation[]>([]),[selected,setSelected]=useState<Individual|null>(null),[follow,setFollow]=useState(true),[message,setMessage]=useState('');
  const [viewMode,setViewMode]=useState<'loading'|'unloading'>('unloading');
  const [step,setStep]=useState(0),[playing,setPlaying]=useState(false),[boxList,setBoxList]=useState(false);
  const [automatic,setAutomatic]=useState(true),[supplyRound,setSupplyRound]=useState(1),[completionPercent,setCompletionPercent]=useState(100);
  const [sequential,setSequential]=useState(false),[arrival,setArrival]=useState<Arrival|null>(null),[arrivalTick,setArrivalTick]=useState(0);
  const [experimentState,setExperimentState]=useState(''),[results,setResults]=useState<ExperimentRow[]>([]);
  const worker=useRef<Worker|null>(null),experimentWorker=useRef<Worker|null>(null),run=useRef(0),followRef=useRef(follow),configRef=useRef({boxes,truck,settings,applied});
  followRef.current=follow;configRef.current={boxes,truck,settings,applied};
  const busy=state==='실행',locked=history.length>0||busy||state==='일시정지';
  const activeBoxes=useMemo(()=>sequential&&arrival?[...arrival.loaded,...arrival.waiting].sort((a,b)=>a.id-b.id):boxes,[boxes,sequential,arrival,arrivalTick]);
  const fixed=arrival?.fixed??{};
  const selectionGeneration=selected?history.find(g=>g.number===selected.generation):undefined;
  const viewBoxes=selectionGeneration?.boxes??activeBoxes,viewFixed=selectionGeneration?.fixed??fixed;
  const accumulated=selectionGeneration?.accumulated;
  const loadingReplay=useMemo(()=>selected?(accumulated?simulateAccumulatedLoading(viewBoxes,selected.coords,truck,selected.loadOrder,accumulated,viewFixed,true):simulateLoading(viewBoxes,selected.coords,truck,selected.loadOrder,viewFixed,true)):null,[selected,viewBoxes,truck,arrivalTick,accumulated]);
  const replay=useMemo(()=>selected&&viewMode==='unloading'?simulateLoaded(viewBoxes,selected.evaluation.finalCoords,truck,true):loadingReplay,[selected,viewMode,viewBoxes,truck,loadingReplay]);
  const sceneInitial=useMemo(()=>viewMode==='unloading'&&selected?Object.fromEntries(viewBoxes.flatMap((b,i)=>selected.evaluation.finalCoords[i]?.[0]>=0?[[b.id,selected.evaluation.finalCoords[i]]]:[])):accumulated?.positions??viewFixed,[selected,viewMode,viewBoxes,accumulated,viewFixed]);
  const shownCosts=viewMode==='unloading'?selected?.unloading:selected?.evaluation;
  const events=replay?.events??[];
  const currentEvent=step?events[step-1]:null;
  const latest=history.at(-1),roundHistory=history,first=roundHistory[0];
  /** 새 Worker를 만들고 이전 실행의 응답은 무시한다. */
  function createWorker() {
    worker.current?.terminate();const w=new Worker(new URL('../workers/evolution.ts',import.meta.url),{type:'module'});worker.current=w;const id=++run.current;
    w.onmessage=e=>{
      const m=e.data;if(m.run!==run.current)return;
      if(m.type==='state')setState(m.state);
      if(m.type==='supply'){setBoxes(m.boxes);setSupplyRound(m.round);}
      if(m.type==='generationCapacity')setMessage(m.message);
      if(m.type==='capacity'){setMessage(m.message);if(m.individual)setSelected(m.individual);}
      if(m.type==='error'){setMessage(m.message);setState('오류');}
      if(m.type==='generation') {const g=m.generation as Generation;setHistory(h=>[...h,g]);if(followRef.current)setSelected(g.individuals.reduce((a,b)=>a.score>=b.score?a:b));}
      if(m.type==='reweighted') {setSelected(s=>s?m.individuals.find((p:Individual)=>p.id===s.id)??s:null);setMessage(`가중치 v${m.version} 적용 · 현재 집단 재평가 완료. 이어서 실행할 수 있습니다.`);}
    };
    w.onerror=e=>{setMessage(e.message||'계산 Worker를 실행할 수 없습니다.');setState('오류');};
    return {w,id};
  }
  /** 현재 입력으로 실행 이력과 난수 상태를 새로 만든다. */
  function start() {
    try {
      if(automatic)validateCompletionPercent(completionPercent);
      const input=automatic?generateBoxes(count,inputSeed):activeBoxes;
      validateConfig(input,truck,settings,weights);
      if(!automatic&&Object.keys(fixed).length===activeBoxes.length&&sequential)throw Error('모든 도착 상자가 적재되었습니다. 다음 상자를 도착시키세요.');
      const {w,id}=createWorker();setHistory([]);setSelected(null);setStep(0);setPlaying(false);setMessage('');setFollow(true);setApplied({...weights});setState('실행');
      if(automatic){setBoxes(input);setSupplyRound(1);}
      w.postMessage({type:'start',run:id,boxes:input,truck,settings,weights,fixed:automatic?{}:fixed,arrival:sequential,automatic,inputSeed,completionPercent} satisfies Command);
    }catch(e){setMessage((e as Error).message);}
  }
  /** 입력은 유지하고 계산·선택·재생 기록을 비운다. */
  function clear() {worker.current?.terminate();worker.current=null;run.current++;setHistory([]);setSelected(null);setStep(0);setPlaying(false);setState('준비');setSupplyRound(1);setMessage('');}
  /** 입력 목록을 동일 seed로 재생성한다. 순차 모드는 도착도 처음부터 시작한다. */
  function generate(mode=sequential) {
    try {const b=generateBoxes(count,inputSeed);clear();setBoxes(b);setResults([]);setArrival(mode?new Arrival(b,inputSeed^0xA771):null);setArrivalTick(t=>t+1);}catch(e){setMessage((e as Error).message);}
  }
  /** 가중치만 현재 집단에 적용하고 세대별 당시 점수는 보존한다. */
  function apply() {
    try {validateConfig(activeBoxes.length?activeBoxes:boxes,truck,settings,weights);setApplied({...weights});if(worker.current&&history.length){worker.current.postMessage({type:'weights',run:run.current,weights} satisfies Command);}else setMessage('다음 실행의 기본 평가에 반영했습니다.');}
    catch(e){setMessage((e as Error).message);}
  }
  /** 순차 도착을 한 건 진행한다. 진행 중 실행은 변경하지 않는다. */
  function receive() {if(!arrival)return;if(!arrival.receive()){setMessage(arrival.waiting.length>=40?'대기 공간 40개가 찼습니다. 먼저 상차하세요.':'모든 상자가 도착했습니다.');return;}clear();setArrivalTick(t=>t+1);}
  /** 검증된 배치의 실제 상차 순서를 확정해 다음 탐색에서 고정한다. */
  function commit() {if(!arrival||!selected)return;try {const order=arrival.commit(activeBoxes,loadingReplay!.finalCoords,truck);clear();setArrivalTick(t=>t+1);setMessage(`상차 완료: ${order.map(i=>'#'+i).join(' → ')} · 기존 좌표 고정`);}catch(e){setMessage((e as Error).message);}}
  /** 계획서의 3개 seed와 9개 조건을 별도 Worker에서 비교한다. */
  function experiment() {
    try {
      validateConfig(boxes,truck,settings,weights);if(settings.population<5)throw Error('k=5 실험을 위해 집단 수를 5 이상으로 설정하세요.');
      experimentWorker.current?.terminate();const w=new Worker(new URL('../workers/evolution.ts',import.meta.url),{type:'module'});experimentWorker.current=w;
      setResults([]);setExperimentState('실험 준비 중');const snapshot={boxes,truck,settings,weights};
      w.onmessage=e=>{const m=e.data;if(m.type==='experimentProgress')setExperimentState(m.progress);if(m.type==='experiments'){setResults(m.result);setExperimentState('실험 완료');w.terminate();}if(m.type==='error'){setExperimentState('실험 오류: '+m.message);w.terminate();}};
      w.onerror=e=>setExperimentState('실험 오류: '+e.message);
      (w as Worker&{snapshot?:unknown}).snapshot=snapshot;
      w.postMessage({type:'experiment',run:1,boxes,truck,settings,weights} satisfies Command);
    }catch(e){setMessage((e as Error).message);}
  }
  useEffect(()=>()=>{worker.current?.terminate();experimentWorker.current?.terminate();},[]);
  useEffect(()=>{setStep(viewMode==='unloading'?0:events.length);setPlaying(false);},[selected?.id,viewMode]);
  useEffect(()=>{if(!playing)return;const t=setInterval(()=>setStep(s=>{if(s>=events.length){setPlaying(false);return s;}return s+1;}),650);return()=>clearInterval(t);},[playing,events.length]);
  const versionMatch=first&&latest&&first.version===latest.version;
  const summaries=useMemo(()=>[...new Set(results.map(r=>r.condition))].map(condition=>{const rows=results.filter(r=>r.condition===condition);const avg=(k:'gaScore'|'randomScore'|'gaMoves'|'randomMoves'|'gaMass'|'randomMass')=>rows.reduce((a,b)=>a+b[k],0)/rows.length;return {condition,ga:avg('gaScore'),random:avg('randomScore'),moves:avg('gaMoves'),mass:avg('gaMass'),loaded:rows.reduce((n,r)=>n+r.gaLoaded,0)/rows.length,excess:rows.reduce((n,r)=>n+r.gaExcess,0)/rows.length};}),[results]);
  return <div className="app">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">▥</span> LOADLAB<span className="brand-sub">적재 진화 실험실</span></a><div className="header-meta"><span className="local-dot"/>로컬 시뮬레이션<span className="separator"/>GENETIC ALGORITHM</div></header>
    <div className="page-heading"><div><div className="eyebrow">TRUCK LOADING / EVOLUTION LAB</div><h1>덜 옮기며 꺼내는 적재 배치<span>.</span></h1><p>하차 우선순위는 유지하면서 방해 상자의 재이동 횟수와 이동 중량이 적은 적재 배치를 진화시킵니다.</p></div><div className={`status status-${state}`} role="status"><i/>{state}<span>{latest?automatic?`누적 ${latest.number}세대 · 공급 ${latest.round??1}회차 (${latest.localNumber??((latest.number-1)%settings.generations)+1}/${settings.generations})`:`${latest.number} / ${settings.generations} 세대`:'실행 대기'}</span></div></div>
    <section className="metrics" aria-label="진화 요약"><div><small>현재 최고 적합도</small><strong>{latest?number(latest.best):'—'}<span>점</span></strong></div><div><small>첫 세대 대비</small><strong className="green">{versionMatch?`${latest!.best-first!.best>=0?'+':''}${number(latest!.best-first!.best)}`:'—'}<span>{versionMatch?'점':'동일 가중치 기준'}</span></strong></div><div><small>검토한 배치</small><strong>{latest?number(latest.evaluations):'0'}<span>개</span></strong></div><div className="metric-spark"><small>세대별 최고 점수</small><svg viewBox="0 0 230 45" aria-label="세대별 최고 적합도 추이">{roundHistory.length>1&&(()=>{const min=Math.min(...roundHistory.map(g=>g.best)),max=Math.max(...roundHistory.map(g=>g.best));return <polyline points={roundHistory.map((g,i)=>`${i/(roundHistory.length-1)*230},${40-(g.best-min)/Math.max(1,max-min)*34}`).join(' ')} fill="none" stroke="#198160" strokeWidth="2"/>;})()}</svg></div></section>
    <main className="workspace">
      <div className="left-column">
        <section className="panel viewer-panel"><div className="panel-heading"><div><span className="section-index">01</span><h2>배치 살펴보기</h2></div><span className="tag">{selected?`${selected.generation}세대 · ${selected.id}`:'개체를 선택하세요'}</span></div>
          <TruckView boxes={viewBoxes} coords={selected?.coords??[]} truck={truck} events={events} step={step} fixed={sceneInitial}/>
          <div className="individual-stats"><div><small>선택 개체 점수</small><b>{selected?number(selected.score):'—'}<em>점</em></b></div><div><small>{viewMode==='unloading'?'하차 재이동':'상차 재이동'}</small><b>{shownCosts?.moves??'—'}<em>회</em></b></div><div><small>하차 재이동 중량</small><b>{selected?number(selected.unloading?.mass??0):'—'}<em>kg</em></b></div><div><small>누적 상차 개수</small><b>{selected?selected.evaluation.loaded:'—'}<em>개</em></b></div></div>
          <div className="loading-summary">{selected?`공급 후보 ${viewBoxes.length}개 · 상부 초과 하중 ${number(selected.bearing?.excessMass??0)}kg · 적재함 부피 활용 ${(selected.evaluation.utilization*100).toFixed(1)}% · 공간 집중도 ${(selected.evaluation.compactness*100).toFixed(1)}% · 미적재 ${selected.evaluation.unloadedIds.length}개`:"상자 겹침·공중부양 없이 실제로 실린 양을 평가합니다."}<details><summary>상·하차 순서와 미적재 확인</summary><p>시도 순서: {selected?.loadOrder.map(id=>`#${id}`).join(" → ")||"—"}</p><p>실제 상차: {loadingReplay?.events.filter(e=>e.kind==='load').map(e=>`#${e.boxId}`).join(" → ")||"—"}</p><p>하차 우선순위: {[...viewBoxes].filter((_,i)=>(selected?.evaluation.finalCoords[i]?.[0]??-1)>=0).sort((a,b)=>b.priority-a.priority||a.id-b.id).map(b=>`#${b.id}(${b.priority})`).join(' → ')||'—'}</p><p>미적재: {selected?.evaluation.unloadedIds.map(id=>`#${id}`).join(", ")||"없음"}</p></details><details><summary>상자별 상부 하중</summary><ul>{selected?.bearing?.loads.map(load=><li key={load.boxId}>#{load.boxId}: 상부 {number(load.aboveMass)}kg / 자기 무게 {viewBoxes.find(b=>b.id===load.boxId)?.weight}kg / 초과 {number(load.excessMass)}kg</li>)}</ul></details></div><div className="replay"><div className="replay-controls"><button onClick={()=>{setFollow(false);setViewMode(m=>m==='unloading'?'loading':'unloading');}}>{viewMode==='unloading'?'상차 보기':'하차 보기'}</button><button disabled={!selected} onClick={()=>{setFollow(false);setPlaying(p=>!p);if(step===events.length)setStep(0);}}>{playing?'Ⅱ 재생 정지':viewMode==='unloading'?'▷ 하차 재생':'▷ 상차 재생'}</button><input aria-label={viewMode==='unloading'?'하차 재생 단계':'상차 재생 단계'} type="range" min="0" max={events.length} value={Math.min(step,events.length)} onChange={e=>{setPlaying(false);setStep(+e.target.value);}} disabled={!selected}/><span>{step}/{events.length}</span></div><p>{currentEvent?`#${currentEvent.boxId} ${currentEvent.kind==='deliver'?'우선순위 하차':currentEvent.kind==='load'?'최초 상차':currentEvent.kind==='out'?'임시 꺼냄':'임시 상자 복귀'} · 누적 ${currentEvent.moves}회 · 이동 중량 ${number(currentEvent.mass)}kg`:viewMode==='unloading'?`적재된 ${selected?.evaluation.loaded??0}개에서 하차 시작 · 높은 우선순위부터 하차`:accumulated&&Object.keys(accumulated.positions).length?`기존 ${Object.keys(accumulated.positions).length}개 상차 유지 · 누적 재이동 ${accumulated.moves}회 / ${number(accumulated.mass)}kg`:'빈 적재함에서 시작 · 최초 상차는 재배치에서 제외'}</p></div>
        </section>
        <section className="panel weights-panel"><div className="panel-heading"><div><span className="section-index">02</span><h2>평가 가중치</h2></div><span className="tag green-tag">하차 평가 + 상부 하중</span></div><p className="panel-description">하차 우선순위를 유지하며 재이동 횟수와 옮기는 중량을 감점합니다. 별도 적재 안정성 감점은 각 상자의 상부 총하중 중 자기 무게 초과분입니다. 여러 받침은 접촉 면적 비율로 분담하며, 적재량·짐칸 활용 보상도 유지합니다.</p><div className="weight-fields"><Field label="기본 점수" value={weights.base} onChange={v=>setWeights(w=>({...w,base:v}))}/><Field label="적재량 보상" value={weights.amount??100} min={0} onChange={v=>setWeights(w=>({...w,amount:v}))}/><Field label="하차 재이동 1회 감점" value={weights.moves} min={0} onChange={v=>setWeights(w=>({...w,moves:v}))}/><Field label="짐칸 적재율 보상 (100% 기준)" value={weights.fill??50} min={0} step={1} onChange={v=>setWeights(w=>({...w,fill:v}))}/><Field label="공간 집중도 보상" value={weights.space??20} min={0} onChange={v=>setWeights(w=>({...w,space:v}))}/><Field label="하차 재이동 중량 1kg 감점" value={weights.travelMass??1} min={0} step={.1} onChange={v=>setWeights(w=>({...w,travelMass:v}))}/><Field label="상부 하중 초과 1kg 감점" value={weights.mass} min={0} step={.1} onChange={v=>setWeights(w=>({...w,mass:v}))}/></div><div className="formula">{applied.base} + {applied.amount??100} × 적재율 + {applied.space??20} × 공간집중도 + {applied.fill??50} × 짐칸부피활용률 − {applied.moves} × 하차재이동횟수 − {applied.travelMass??1} × 하차재이동kg − {applied.mass} × 초과하중kg</div><div className="weight-footer"><span>적재율 = (개수 비율 + 부피 비율) ÷ 2</span><button className="apply" onClick={apply}>가중치 적용 ↗</button></div></section>
        <section className="panel input-panel"><details><summary><span className="section-index">03</span> 입력과 탐색 설정 <span>펼치기 ＋</span></summary><div className="details-content"><h3>택배 입력</h3><label className="checkbox"><input type="checkbox" checked={automatic} disabled={locked} onChange={e=>{setAutomatic(e.target.checked);if(e.target.checked){setSequential(false);setArrival(null);}}}/>상자 자동 공급 · 총 개수 제한 없음</label><p className="help">탐색이 끝나도 다음 상자를 자동 생성합니다. 현재 후보를 모두 실으면 즉시 다음 묶음을 공급합니다. 미적재가 남으면 회차당 탐색 세대 종료 후 추가 공급합니다. 추가 적재 공간이 없으면 해당 세대의 상차 완료를 표시하고 다음 세대로 진화합니다. 한 개체라도 짐칸 부피 {completionPercent}% 이상이면 전체 완료합니다. 기본100%는 남은 공간0%입니다.</p><div className="fields"><Field label={automatic?"한 번에 공급할 상자 수":"실험용 고정 상자 수"} value={count} min={1} disabled={locked} onChange={setCount}/>{automatic&&<Field label="완료 적재율 (%)" value={completionPercent} min={1} max={100} step={0.1} disabled={locked} onChange={setCompletionPercent}/>}<Field label="입력 seed" value={inputSeed} min={0} max={4294967295} disabled={locked} onChange={setInputSeed}/></div><div className="grade-legend">{GRADES.map((g,i)=><span key={g.name}><i style={{background:['#d4aa74','#94bb9b','#c4ae82','#8babb0','#c28a65'][i]}}/>{g.name} {boxes.filter(b=>b.grade===i).length}</span>)}</div><p className="help">5등급 각 20% 추첨 · 최대 160cm / 20kg · 최장변 100cm</p><div className="inline"><button disabled={locked} onClick={()=>generate()}>상자 다시 생성</button><button onClick={()=>setBoxList(b=>!b)}>{boxList?'목록 닫기':'상자 목록'}</button></div>
          <label className="checkbox"><input type="checkbox" checked={sequential} disabled={locked||automatic} onChange={e=>{setSequential(e.target.checked);generate(e.target.checked);}}/>순차 도착 모드 · 대기 공간 40개</label>
          {sequential&&arrival&&<div className="arrival"><p>도착 {arrival.cursor}/{boxes.length} · 대기 {arrival.waiting.length}/40 · 적재 {arrival.loaded.length}</p><div className="inline"><button disabled={busy||state==='일시정지'} onClick={receive}>다음 상자 도착</button><button disabled={!selected||busy||state==='일시정지'||!arrival.waiting.length} onClick={commit}>선택 배치 상차</button></div><p className="help">도착 → GA 실행 → 정지/완료 → 배치 선택 → 상차 확정. 기존 적재 좌표는 고정됩니다.</p><ol className="arrival-log">{arrival.log.slice(-5).map((s,i)=><li key={i}>{s}</li>)}</ol></div>}
          <h3>가상 적재함 내부 치수 (cm)</h3><p className="help">실험용 입력 치수이며 차량 실측값이 아닙니다. 출입구는 깊이 0 방향입니다.</p><div className="fields three">{(['width','depth','height'] as const).map((k,i)=><Field key={k} label={['폭','깊이','높이'][i]} value={truck[k]} min={10} max={2000} disabled={locked} onChange={v=>setTruck(t=>({...t,[k]:v}))}/>)}</div>
          <h3>유전 알고리즘</h3><div className="fields"><Field label="집단 크기" value={settings.population} min={2} max={100} disabled={locked} onChange={v=>setSettings(s=>({...s,population:v}))}/><Field label={automatic?"공급 회차당 탐색 세대":"총 세대"} value={settings.generations} min={1} max={300} disabled={locked} onChange={v=>setSettings(s=>({...s,generations:v}))}/><Field label="교차율" value={settings.crossover} min={0} max={1} step={.05} disabled={locked} onChange={v=>setSettings(s=>({...s,crossover:v}))}/><Field label="상자별 변이율" value={settings.mutation} min={0} max={1} step={.01} disabled={locked} onChange={v=>setSettings(s=>({...s,mutation:v}))}/><Field label="토너먼트 k" value={settings.tournament} min={2} max={settings.population} disabled={locked} onChange={v=>setSettings(s=>({...s,tournament:v}))}/><Field label="GA seed" value={settings.seed} min={0} max={4294967295} disabled={locked} onChange={v=>setSettings(s=>({...s,seed:v}))}/></div><p className="help">엘리트 1개 보존 · 설정을 바꾸려면 실행을 초기화하세요.</p></div></details></section>
      </div>
      <section className="panel tree-panel"><div className="panel-heading"><div><span className="section-index">04</span><h2>세대별 진화 로드맵</h2></div><span className="tag">{latest?`${latest.number*settings.population} 개체`:'1세대부터 시작'}</span></div><div className="tree-intro"><p>아래에서 시작해, 더 나은 배치로 올라갑니다.</p><label className="checkbox"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>최신 세대 따라가기</label></div><div className="tree-legend"><span><i className="legend-normal"/>배치 후보</span><span><i className="legend-best"/>세대 최고</span><span><i className="legend-selected"/>선택 개체</span><span className="tree-direction">진화 방향 ↑</span></div>
        <GenerationTree history={history} selected={selected?.id??''} onSelect={p=>{setSelected(p);setFollow(false);}} follow={follow} setFollow={setFollow}/>
        <div className="tree-footer"><span>{selected?`${selected.operation}${selected.repaired?' · 유효 배치 수정':''} · 평가 v${selected.version}`:'개체를 클릭하면 왼쪽에 실제 배치를 표시합니다.'}</span><span>드래그 대신 스크롤로 계보 탐색 ↔</span></div>
      </section>
    </main>
    <section className="control-dock"><div className="dock-label"><span className="pulse"/><div><b>진화 실행</b><small>{automatic?`자동 공급 ${supplyRound}회차 · 묶음 ${count}개 · 목표 ${completionPercent}% · 총량 제한 없음`:`입력 ${activeBoxes.length}개`} · 집단 {settings.population}</small></div></div><div className="controls"><button className="primary" disabled={busy} onClick={start}>▶ 처음부터 시작</button><button disabled={!busy} onClick={()=>worker.current?.postMessage({type:'pause',run:run.current})}>Ⅱ 일시정지</button><button disabled={state!=='일시정지'} onClick={()=>worker.current?.postMessage({type:'resume',run:run.current})}>▷ 이어서 실행</button><button disabled={!busy&&state!=='일시정지'} onClick={()=>worker.current?.postMessage({type:'stop',run:run.current})}>■ 정지</button><button className="reset" onClick={clear}>↺ 초기화</button></div></section>
    {message&&<div className="notice" role="alert">{message}<button aria-label="알림 닫기" onClick={()=>setMessage('')}>×</button></div>}
    {boxList&&<section className="panel box-list"><div className="panel-heading"><h2>생성된 상자 목록</h2><span>모든 개체가 같은 입력을 공유합니다.</span></div><div className="table-scroll"><table><thead><tr><th>ID</th><th>등급</th><th>가로 × 세로 × 높이 (cm)</th><th>무게 (kg)</th><th>하차 우선순위</th><th>도착 상태</th></tr></thead><tbody>{boxes.map(b=><tr key={b.id}><td>#{b.id}</td><td>{GRADES[b.grade].name}</td><td>{b.size.join(' × ')}</td><td>{b.weight}</td><td>{b.priority}</td><td>{automatic?'자동 공급 후보':!sequential?'전체 입력':fixed[b.id]?'적재 고정':activeBoxes.some(a=>a.id===b.id)?'대기':'미도착'}</td></tr>)}</tbody></table></div></section>}
    <section className="panel experiment-panel"><details><summary>무작위 배치와 비교 실험<span>동일 입력 · 동일 평가 예산 · 3개 seed</span></summary><div className="details-content"><p>교차율 0/0.6/0.9, 선택 k=2/3/5, 변이율 0/0.05/0.2를 각각 비교합니다. 현재 집단·총 세대 설정으로 27회 실행하므로 시간이 걸릴 수 있습니다. 현재 GA와 독립적으로 계산합니다.</p><div className="inline"><button className="apply" disabled={busy||!!(experimentState&&!experimentState.includes('완료')&&!experimentState.includes('취소')&&!experimentState.includes('오류'))} onClick={experiment}>비교 실험 시작</button><button onClick={()=>{experimentWorker.current?.terminate();setExperimentState('실험 취소');}}>실험 취소</button><button disabled={!results.length} onClick={()=>saveJson({input:(experimentWorker.current as Worker&{snapshot?:unknown})?.snapshot,results,summaries})}>결과 JSON 저장</button><span role="status">{experimentState}</span></div>{summaries.length>0&&<div className="table-scroll"><table><thead><tr><th>조건</th><th>GA 평균 점수</th><th>무작위 최고 평균</th><th>GA 평균 적재 개수</th><th>GA 평균 하차 재이동</th><th>GA 평균 이동 중량</th><th>GA 평균 초과 하중</th></tr></thead><tbody>{summaries.map(s=><tr key={s.condition}><td>{s.condition}</td><td>{number(s.ga)}</td><td>{number(s.random)}</td><td>{number(s.loaded)}개</td><td>{number(s.moves)}회</td><td>{number(s.mass)}kg</td><td>{number(s.excess)}kg</td></tr>)}</tbody></table><p className="help">각 조건의 seed 11·29·47 평균. 개선되지 않은 결과도 그대로 표시합니다. JSON에 각 실행의 평가 예산과 원자료를 포함합니다.</p></div>}</div></details></section>
    <footer className="page-footer"><span>LOADLAB / 상자 배치 개선을 위한 유전 알고리즘</span><span>좌표 기반 인코딩 · 토너먼트 선택 · 1점 교차 · 위치 변이</span></footer>
  </div>;
}

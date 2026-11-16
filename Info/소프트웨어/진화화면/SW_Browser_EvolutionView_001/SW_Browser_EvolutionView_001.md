# SW_Browser_EvolutionView_001 — 진화화면

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
import { useEffect,useMemo,useRef,useState } from 'react';
import { DEFAULT_SETTINGS,DEFAULT_TRUCK,DEFAULT_WEIGHTS,GRADES,generateBoxes,validateConfig,type Box,type Vec,type Truck,type Settings,type Weights,type Individual,type Generation } from '../domain/model';
import { simulateLoading } from '../simulation/loading';
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
  const [allocationProgress,setAllocationProgress]=useState<{generation:number;boxes:number;population:number;ready:number;mostLoaded:number}|null>(null);
  const [step,setStep]=useState(0),[playing,setPlaying]=useState(false),[boxList,setBoxList]=useState(false);
  const [automatic,setAutomatic]=useState(true),[supplyRound,setSupplyRound]=useState(1);
  const [sequential,setSequential]=useState(false),[arrival,setArrival]=useState<Arrival|null>(null),[arrivalTick,setArrivalTick]=useState(0);
  const [experimentState,setExperimentState]=useState(''),[results,setResults]=useState<ExperimentRow[]>([]);
  const worker=useRef<Worker|null>(null),experimentWorker=useRef<Worker|null>(null),run=useRef(0),followRef=useRef(follow),configRef=useRef({boxes,truck,settings,applied});
  followRef.current=follow;configRef.current={boxes,truck,settings,applied};
  const busy=state==='실행',locked=history.length>0||busy||state==='일시정지';
  const activeBoxes=useMemo(()=>sequential&&arrival?[...arrival.loaded,...arrival.waiting].sort((a,b)=>a.id-b.id):boxes,[boxes,sequential,arrival,arrivalTick]);
  const fixed=arrival?.fixed??{};
  const selectionGeneration=selected?history.find(g=>g.number===selected.generation):undefined;
  const viewBoxes=selectionGeneration?.boxes??activeBoxes,viewFixed=selectionGeneration?.fixed??fixed;
  const replay=useMemo(()=>selected?simulateLoading(viewBoxes,selected.coords,truck,selected.loadOrder,viewFixed,true):null,[selected,viewBoxes,truck,arrivalTick]);
  const events=replay?.events??[];
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
      if(m.type==='generation') {setAllocationProgress(null);const g=m.generation as Generation;setHistory(h=>[...h,g]);if(followRef.current)setSelected(g.individuals.reduce((a,b)=>a.score>=b.score?a:b));}
      if(m.type==='reweighted') {setSelected(s=>s?m.individuals.find((p:Individual)=>p.id===s.id)??s:null);setMessage(`가중치 v${m.version} 적용 · 현재 집단 재평가 완료. 이어서 실행할 수 있습니다.`);}
    };
    w.onerror=e=>{setMessage(e.message||'계산 Worker를 실행할 수 없습니다.');setState('오류');};
    return {w,id};
  }
  /** 현재 입력으로 실행 이력과 난수 상태를 새로 만든다. */
  function start() {
    try {
      const input=automatic?generateBoxes(count,inputSeed):activeBoxes;
      validateConfig(input,truck,settings,weights);
      if(!automatic&&Object.keys(fixed).length===activeBoxes.length&&sequential)throw Error('모든 도착 상자가 적재되었습니다. 다음 상자를 도착시키세요.');
      const {w,id}=createWorker();setHistory([]);setSelected(null);setAllocationProgress(null);setStep(0);setPlaying(false);setMessage('');setFollow(true);setApplied({...weights});setState('실행');
      if(automatic){setBoxes(input);setSupplyRound(1);}
      w.postMessage({type:'start',run:id,boxes:input,truck,settings,weights,fixed:automatic?{}:fixed,arrival:sequential,automatic,inputSeed,requireFullAllocation:true} satisfies Command);
    }catch(e){setMessage((e as Error).message);}
  }
  /** 입력은 유지하고 계산·선택·재생 기록을 비운다. */
  function clear() {worker.current?.terminate();worker.current=null;run.current++;setHistory([]);setSelected(null);setAllocationProgress(null);setStep(0);setPlaying(false);setState('준비');setSupplyRound(1);setMessage('');}
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
  function commit() {if(!arrival||!selected)return;try {const order=arrival.commit(activeBoxes,replay!.finalCoords,truck);clear();setArrivalTick(t=>t+1);setMessage(`상차 완료: ${order.map(i=>'#'+i).join(' → ')} · 기존 좌표 고정`);}catch(e){setMessage((e as Error).message);}}
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
  useEffect(()=>{setStep(events.length);setPlaying(false);},[selected?.id]);
  useEffect(()=>{if(!playing)return;const t=setInterval(()=>setStep(s=>{if(s>=events.length){setPlaying(false);return s;}return s+1;}),650);return()=>clearInterval(t);},[playing,events.length]);
  const versionMatch=first&&latest&&first.version===latest.version;
  const summaries=useMemo(()=>[...new Set(results.map(r=>r.condition))].map(condition=>{const rows=results.filter(r=>r.condition===condition);const avg=(k:'gaScore'|'randomScore'|'gaMoves'|'randomMoves'|'gaMass'|'randomMass')=>rows.reduce((a,b)=>a+b[k],0)/rows.length;return {condition,ga:avg('gaScore'),random:avg('randomScore'),moves:avg('gaMoves'),mass:avg('gaMass'),loaded:rows.reduce((n,r)=>n+r.gaLoaded,0)/rows.length};}),[results]);
  return <div className="app">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">▥</span> LOADLAB<span className="brand-sub">적재 진화 실험실</span></a><div className="header-meta"><span className="local-dot"/>로컬 시뮬레이션<span className="separator"/>GENETIC ALGORITHM</div></header>
    <div className="page-heading"><div><div className="eyebrow">TRUCK LOADING / EVOLUTION LAB</div><h1>더 많이, 덜 옮기며 싣다<span>.</span></h1><p>상차 순서와 위치를 진화시켜 적재량을 높이고 재배치를 줄입니다.</p></div><div className={`status status-${state}`} role="status"><i/>{state}<span>{allocationProgress&&busy?`${allocationProgress.generation}세대 준비 · 할당 완료 ${allocationProgress.ready}/${allocationProgress.population}개체 · 상자 ${allocationProgress.mostLoaded}/${allocationProgress.boxes}개`:latest?automatic?`공급 ${latest.round??1}회차 · ${((latest.number-1)%settings.generations)+1}/${settings.generations}세대`:`${latest.number} / ${settings.generations} 세대`:'실행 대기'}</span></div></div>
    <section className="metrics" aria-label="진화 요약"><div><small>현재 최고 적합도</small><strong>{latest?number(latest.best):'—'}<span>점</span></strong></div><div><small>이번 공급 초기 대비</small><strong className="green">{versionMatch?`${latest!.best-first!.best>=0?'+':''}${number(latest!.best-first!.best)}`:'—'}<span>{versionMatch?'점':'동일 가중치 기준'}</span></strong></div><div><small>검토한 배치</small><strong>{latest?number(latest.evaluations):'0'}<span>개</span></strong></div><div className="metric-spark"><small>세대별 최고 점수</small><svg viewBox="0 0 230 45" aria-label="세대별 최고 적합도 추이">{roundHistory.length>1&&(()=>{const min=Math.min(...roundHistory.map(g=>g.best)),max=Math.max(...roundHistory.map(g=>g.best));return <polyline points={roundHistory.map((g,i)=>`${i/(roundHistory.length-1)*230},${40-(g.best-min)/Math.max(1,max-min)*34}`).join(' ')} fill="none" stroke="#198160" strokeWidth="2"/>;})()}</svg></div></section>
    <main className="workspace">
      <div className="left-column">
        <section className="panel viewer-panel"><div className="panel-heading"><div><span className="section-index">01</span><h2>배치 살펴보기</h2></div><span className="tag">{selected?`${selected.generation}세대 · ${selected.id}`:'개체를 선택하세요'}</span></div>
          <TruckView boxes={viewBoxes} coords={selected?.coords??[]} truck={truck} events={events} step={step} fixed={viewFixed}/>
          <div className="individual-stats"><div><small>선택 개체 점수</small><b>{selected?number(selected.score):'—'}<em>점</em></b></div><div><small>상차 재배치</small><b>{selected?.evaluation.moves??'—'}<em>회</em></b></div><div><small>재배치 중량</small><b>{selected?number(selected.evaluation.mass):'—'}<em>kg</em></b></div><div><small>누적 상차 개수</small><b>{selected?selected.evaluation.loaded:'—'}<em>개</em></b></div></div>
          <div className="loading-summary">{selected?`적재함 부피 활용 ${(selected.evaluation.utilization*100).toFixed(1)}% · 공간 집중도 ${(selected.evaluation.compactness*100).toFixed(1)}% · 미적재 ${selected.evaluation.unloadedIds.length}개`:"상자 겹침·공중부양 없이 실제로 실린 양을 평가합니다."}<details><summary>상차 순서와 미적재 확인</summary><p>시도 순서: {selected?.loadOrder.map(id=>`#${id}`).join(" → ")||"—"}</p><p>실제 상차: {events.filter(e=>e.kind==='load').map(e=>`#${e.boxId}`).join(" → ")||"—"}</p><p>미적재: {selected?.evaluation.unloadedIds.map(id=>`#${id}`).join(", ")||"없음"}</p></details></div><div className="replay"><div className="replay-controls"><button disabled={!selected} onClick={()=>{setFollow(false);setPlaying(p=>!p);if(step===events.length)setStep(0);}}>{playing?'Ⅱ 재생 정지':'▷ 상차 재생'}</button><input aria-label="상차 재생 단계" type="range" min="0" max={events.length} value={Math.min(step,events.length)} onChange={e=>{setPlaying(false);setStep(+e.target.value);}} disabled={!selected}/><span>{step}/{events.length}</span></div><p>{currentEvent?`#${currentEvent.boxId} ${currentEvent.kind==='load'?'최초 상차':currentEvent.kind==='out'?'상차 방해물 재배치':'재배치 상자 복귀'} · 누적 ${currentEvent.moves}회 / ${number(currentEvent.mass)}kg`:'빈 적재함에서 시작 · 입구로 상자 투입 · 최초 상차는 재배치에서 제외'}</p></div>
        </section>
        <section className="panel weights-panel"><div className="panel-heading"><div><span className="section-index">02</span><h2>평가 가중치</h2></div><span className="tag green-tag">상차 평가</span></div><p className="panel-description">적재 개수·부피와 공간 집중도를 보상하고, 상차 재배치를 감점합니다.</p><div className="weight-fields"><Field label="적재량 보상" value={weights.base} onChange={v=>setWeights(w=>({...w,base:v}))}/><Field label="재이동 1회 감점" value={weights.moves} min={0} onChange={v=>setWeights(w=>({...w,moves:v}))}/><Field label="공간 집중도 보상" value={weights.space??20} min={0} onChange={v=>setWeights(w=>({...w,space:v}))}/><Field label="중량 1kg 감점" value={weights.mass} min={0} step={.1} onChange={v=>setWeights(w=>({...w,mass:v}))}/></div><div className="formula">{applied.base} × 적재율 + {applied.space??20} × 공간집중도 − {applied.moves} × 재배치횟수 − {applied.mass} × 재배치kg</div><div className="weight-footer"><span>적재율 = (개수 비율 + 부피 비율) ÷ 2</span><button className="apply" onClick={apply}>가중치 적용 ↗</button></div></section>
        <section className="panel input-panel"><details><summary><span className="section-index">03</span> 입력과 탐색 설정 <span>펼치기 ＋</span></summary><div className="details-content"><h3>택배 입력</h3><label className="checkbox"><input type="checkbox" checked={automatic} disabled={locked} onChange={e=>{setAutomatic(e.target.checked);if(e.target.checked){setSequential(false);setArrival(null);}}}/>상자 자동 공급 · 총 개수 제한 없음</label><p className="help">탐색이 끝나도 다음 상자를 자동 생성합니다. 상자 할당 개수는 최초 입력과 다음 공급 묶음에 동일하게 적용합니다. 할당된 상자를 모두 실제 적재한 개체만 다음 세대에 포함하며, 유효 집단이 완성되기 전에는 세대를 올리지 않습니다. 현재 배치에서 추가 상차 공간·경로가 없거나 정지할 때까지 계속합니다.</p><div className="fields"><Field label={automatic?"상자 할당 개수 (회당)":"실험용 고정 상자 수"} value={count} min={1} disabled={locked} onChange={setCount}/><Field label="입력 seed" value={inputSeed} min={0} max={4294967295} disabled={locked} onChange={setInputSeed}/></div><div className="grade-legend">{GRADES.map((g,i)=><span key={g.name}><i style={{background:['#d4aa74','#94bb9b','#c4ae82','#8babb0','#c28a65'][i]}}/>{g.name} {boxes.filter(b=>b.grade===i).length}</span>)}</div><p className="help">5등급 각 20% 추첨 · 최대 160cm / 20kg · 최장변 100cm</p><div className="inline"><button disabled={locked} onClick={()=>generate()}>상자 다시 생성</button><button onClick={()=>setBoxList(b=>!b)}>{boxList?'목록 닫기':'상자 목록'}</button></div>
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
    <section className="control-dock"><div className="dock-label"><span className="pulse"/><div><b>진화 실행</b><small>{automatic?`자동 공급 ${supplyRound}회차 · 할당 ${count}개 · 총량 제한 없음`:`입력 ${activeBoxes.length}개`} · 집단 {settings.population}</small></div></div><div className="controls"><button className="primary" disabled={busy} onClick={start}>▶ 처음부터 시작</button><button disabled={!busy} onClick={()=>worker.current?.postMessage({type:'pause',run:run.current})}>Ⅱ 일시정지</button><button disabled={state!=='일시정지'} onClick={()=>worker.current?.postMessage({type:'resume',run:run.current})}>▷ 이어서 실행</button><button disabled={!busy&&state!=='일시정지'} onClick={()=>worker.current?.postMessage({type:'stop',run:run.current})}>■ 정지</button><button className="reset" onClick={clear}>↺ 초기화</button></div></section>
    {message&&<div className="notice" role="alert">{message}<button aria-label="알림 닫기" onClick={()=>setMessage('')}>×</button></div>}
    {boxList&&<section className="panel box-list"><div className="panel-heading"><h2>생성된 상자 목록</h2><span>모든 개체가 같은 입력을 공유합니다.</span></div><div className="table-scroll"><table><thead><tr><th>ID</th><th>등급</th><th>가로 × 세로 × 높이 (cm)</th><th>무게 (kg)</th><th>참고 우선도</th><th>도착 상태</th></tr></thead><tbody>{boxes.map(b=><tr key={b.id}><td>#{b.id}</td><td>{GRADES[b.grade].name}</td><td>{b.size.join(' × ')}</td><td>{b.weight}</td><td>{b.priority}</td><td>{automatic?'자동 공급 후보':!sequential?'전체 입력':fixed[b.id]?'적재 고정':activeBoxes.some(a=>a.id===b.id)?'대기':'미도착'}</td></tr>)}</tbody></table></div></section>}
    <section className="panel experiment-panel"><details><summary>무작위 배치와 비교 실험<span>동일 입력 · 동일 평가 예산 · 3개 seed</span></summary><div className="details-content"><p>교차율 0/0.6/0.9, 선택 k=2/3/5, 변이율 0/0.05/0.2를 각각 비교합니다. 현재 집단·총 세대 설정으로 27회 실행하므로 시간이 걸릴 수 있습니다. 현재 GA와 독립적으로 계산합니다.</p><div className="inline"><button className="apply" disabled={busy||!!(experimentState&&!experimentState.includes('완료')&&!experimentState.includes('취소')&&!experimentState.includes('오류'))} onClick={experiment}>비교 실험 시작</button><button onClick={()=>{experimentWorker.current?.terminate();setExperimentState('실험 취소');}}>실험 취소</button><button disabled={!results.length} onClick={()=>saveJson({input:(experimentWorker.current as Worker&{snapshot?:unknown})?.snapshot,results,summaries})}>결과 JSON 저장</button><span role="status">{experimentState}</span></div>{summaries.length>0&&<div className="table-scroll"><table><thead><tr><th>조건</th><th>GA 평균 점수</th><th>무작위 최고 평균</th><th>GA 평균 적재 개수</th><th>GA 평균 재배치</th><th>GA 평균 중량</th></tr></thead><tbody>{summaries.map(s=><tr key={s.condition}><td>{s.condition}</td><td>{number(s.ga)}</td><td>{number(s.random)}</td><td>{number(s.loaded)}개</td><td>{number(s.moves)}회</td><td>{number(s.mass)}kg</td></tr>)}</tbody></table><p className="help">각 조건의 seed 11·29·47 평균. 개선되지 않은 결과도 그대로 표시합니다. JSON에 각 실행의 평가 예산과 원자료를 포함합니다.</p></div>}</div></details></section>
    <footer className="page-footer"><span>LOADLAB / 상자 배치 개선을 위한 유전 알고리즘</span><span>좌표 기반 인코딩 · 토너먼트 선택 · 1점 교차 · 위치 변이</span></footer>
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

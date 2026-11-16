import {useEffect,useRef,useState} from 'react';
import {graphics,rangeHistory,sceneGraphic,LABELS,type ResultSnapshot,type GraphicKind,type Graphic} from '../export/report';
import {bytes,download,png,svgBlob,zipStore} from '../export/files';
const kinds=Object.keys(LABELS) as GraphicKind[];
/** 완료 시 불변 결과에만 접근한다. 미완성 실행 상태를 직접 읽지 않는다. */
export function ResultExport({snapshot}:{snapshot:ResultSnapshot|null}) {
 const [from,setFrom]=useState(1),[to,setTo]=useState(''),[format,setFormat]=useState('svg'),[progress,setProgress]=useState(''),[working,setWorking]=useState(false);
 const cancel=useRef(false),job=useRef(false);
 useEffect(()=>()=>{cancel.current=true;},[]);
 async function save(kind:GraphicKind|'scene'|'all',selectedFormat:string){
  if(!snapshot||job.current)return;const s=snapshot;cancel.current=false;job.current=true;setWorking(true);
  try{
   const gs=rangeHistory(s,from,to===''?s.history.at(-1)!.number:Number(to));
   const reports:Graphic[]=[];
   for(const k of kind==='all'?kinds:kind==='scene'?[]:[kind])reports.push(...graphics(s,gs,k));
   const scene=kind==='scene'||kind==='all'&&s.scene.image?sceneGraphic(s):null;
   const files:{name:string;bytes:Uint8Array}[]=[];let i=0;
   const prefix=`loadlab-G${gs[0].number}-${gs.at(-1)!.number}-${s.completedAt.replace(/[:.]/g,'-')}`;
   const add=async(g:Graphic,extension:'png'|'svg')=>{
    if(cancel.current)throw Error('다운로드 생성을 취소했습니다. 확정 결과는 유지됩니다.');
    setProgress(`${++i}개 파일 생성 중 · ${g.name} (${extension.toUpperCase()})`);
    await new Promise(resolve=>setTimeout(resolve,0));
    const blob=extension==='png'?await png(g):svgBlob(g);files.push({name:`${String(i).padStart(3,'0')}_${g.name}.${extension}`,bytes:new Uint8Array(await blob.arrayBuffer())});
   };
   for(const g of reports){if(selectedFormat!=='png')await add(g,'svg');if(selectedFormat!=='svg')await add(g,'png');}
   if(scene)await add(scene,'png');
   if(cancel.current)throw Error('다운로드 생성을 취소했습니다. 확정 결과는 유지됩니다.');
   if(files.length===1&&kind!=='all'){
    const file=files[0];download(new Blob([file.bytes as BlobPart],{type:file.name.endsWith('.png')?'image/png':'image/svg+xml'}),`${prefix}_${file.name}`);
   }else{
    // 데이터는 생략·축약하지 않는다. 선택 범위와 완료 시 선택 상태를 함께 명시한다.
    files.push({name:'result.json',bytes:bytes(JSON.stringify({...s,history:gs,scene:{...s.scene,image:undefined},exportRange:{from:gs[0].number,to:gs.at(-1)!.number}},null,2))});
    files.push({name:'안내.txt',bytes:bytes(`LOADLAB 확정 결과\n완료(UTC): ${s.completedAt}\n세대 범위: ${gs[0].number}–${gs.at(-1)!.number}\n각 이미지의 메타데이터·축·범례를 확인하세요. 공급 회차와 가중치 버전 사이에서는 추세선을 끊습니다.\n로드맵은 전체 개체를 분할하며 페이지 밖 부모 ID도 표기합니다.\n재배치·적재 추이는 각 세대 최고 점수 개체 기준입니다.\n3D는 완료 당시 선택 개체의 재생 단계와 카메라 시점이며 범위 선택에 따라 바뀌지 않습니다.\n3D 캡처: ${s.scene.image?'포함':s.scene.error||'없음'}\nresult.json에는 실제 상자·좌표·부모·순서·설정·완료 시각·선택 단계가 포함됩니다.\n`)});
    setProgress(`${files.length}개 파일 ZIP 구성 중`);await new Promise(resolve=>setTimeout(resolve,0));download(new Blob([zipStore(files) as BlobPart],{type:'application/zip'}),`${prefix}.zip`);
   }
   setProgress('다운로드 파일을 생성했습니다. 브라우저 다운로드 목록을 확인하세요.');
  }catch(e){setProgress(e instanceof Error?e.message:String(e));}finally{setWorking(false);job.current=false;}
 }
 return <section className="panel result-export" aria-label="확정 결과 다운로드"><div className="panel-heading"><div><span className="section-index">05</span><h2>결과 이미지 다운로드</h2></div><span className="tag">{snapshot?'완료 결과 확정':'완료 후 다운로드 가능'}</span></div>
  <p className="panel-description">{snapshot?`${new Date(snapshot.completedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST 기준 · ${snapshot.history.length}개 완성 세대 · 선택 ${snapshot.selected?.id??'없음'}`:'실행 제어의 ‘완료 · 결과 확정’을 눌러야 다운로드할 수 있습니다. 준비 중인 세대는 포함하지 않습니다.'}</p>
  <fieldset disabled={!snapshot||working}><legend>다운로드 범위와 형식</legend><div className="fields export-options"><label className="field"><span>시작 세대</span><input type="number" min="1" max={snapshot?.history.at(-1)?.number??1} value={from} onChange={e=>setFrom(Number(e.target.value))}/></label><label className="field"><span>끝 세대 (빈칸은 마지막)</span><input type="number" min="1" max={snapshot?.history.at(-1)?.number??1} placeholder={String(snapshot?.history.at(-1)?.number??'')} value={to} onChange={e=>setTo(e.target.value)}/></label><label className="field"><span>전체 묶음 이미지 형식</span><select value={format} onChange={e=>setFormat(e.target.value)}><option value="svg">SVG · 확대 가능한 그래프</option><option value="png">PNG · 이미지</option><option value="both">PNG + SVG</option></select></label></div>
  <div className="export-grid">{kinds.map(kind=><div className="export-card" key={kind}><b>{LABELS[kind]}</b><small>{kind==='roadmap'?'화면 밖 전체 개체 포함 · 6세대×10개체로 분할':kind==='movement'||kind==='loading'?'서로 다른 단위의 그래프를 분리해 저장':kind==='summary'?'세대별 상세 수치 · 최대 30세대씩 분할':'최고·평균 · 회차/가중치 경계 구분'}</small><div className="inline"><button onClick={()=>save(kind,'png')}>PNG 다운로드</button><button onClick={()=>save(kind,'svg')}>SVG 다운로드</button></div></div>)}
   <div className="export-card"><b>선택 개체 3D 배치</b><small>완료 당시 시점·재생 단계 · 개체 점수와 단위 포함</small><button disabled={!snapshot?.scene.image} onClick={()=>save('scene','png')}>3D PNG 다운로드</button>{snapshot?.scene.error&&<small>{snapshot.scene.error}</small>}</div></div>
  <button className="apply" onClick={()=>save('all',format)}>전체 결과 ZIP 다운로드</button><p className="help">여러 장인 항목은 ZIP으로 저장합니다. 전체 ZIP에는 그래프·로드맵·3D PNG·실행 요약·JSON 원자료를 함께 넣습니다. 많은 세대의 PNG는 시간이 걸릴 수 있습니다.</p></fieldset>
  {working&&<button onClick={()=>{cancel.current=true;}}>파일 생성 취소</button>}<p role="status" aria-live="polite">{progress}</p>
 </section>;
}

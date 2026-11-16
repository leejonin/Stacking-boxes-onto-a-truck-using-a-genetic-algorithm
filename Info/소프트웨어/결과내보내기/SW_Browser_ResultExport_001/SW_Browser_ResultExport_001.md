# SW_Browser_ResultExport_001 — 결과 내보내기

- 최초 생성 일시: 2026-11-17 00:10:50 (KST)
- 수정 일시: 2026-11-17 00:10:50 (KST)
- 지시자: 이종인 / 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_ResultExport_001
- 기술 환경: `Info/기술환경.md` (기존 React/TypeScript/Three.js·브라우저 SVG/Canvas/Blob API, 새 외부 의존성 없음).

- 버전: v0.0.1
- 분류: 소프트웨어 / 결과내보내기 (ResultExport), 실행환경 Browser.
- 계획: `Info/plan/2026-11-17/001050_완료시점결과이미지다운로드_plan.md`.

## 목적

시뮬레이션 사용자의 실행 결과 보관·공유 문제를 해결하여 해석 가능한 이미지와 원자료를 제공한다.

## 목표

완료 버튼 시점의 불변 결과에만 다운로드를 허용하고 로드맵·그래프·3D·요약을 PNG/SVG/ZIP으로 생성한다.

## 역할·호출·입출력

App.complete → finalizeResult가 모든 완료 세대·선택·가중치·입력·재생정보를 structuredClone한다. ResultExport는 snapshot이 null이면 fieldset과 전체 다운로드를 잠근다. rangeHistory는 입력범위를 검증, graphics는 선택항목별 Graphic[]를 생성한다. Graphic은 이름·SVG문자열·폭/높이px다. sceneGraphic은 저장된이미지/선택이 없으면 실패한다.

segments는 공급회차·평가버전·연속세대가 같을 때만 묶는다. 각그래프는 SVG벡터로생성하고 XML문자열을 이스케이프한다. roadmaps는 전체 집단을6세대/10개체페이지로 출력하며 실제 부모ID를 보존한다. summary는30세대페이지. chart는 단위/음수축/최초·최종수치·메타데이터를 포함한다.

png는 document.fonts.ready 뒤 Blob URL→Image→Canvas.toBlob으로만 변환한다. Blob URL은 finally 해제한다. zipStore는UTF-8파일명·CRC32·로컬헤더·중앙디렉터리를 만들고 한도 초과를 거부한다. download는 임시a.download를 클릭하고 URL을60초뒤 해제한다. 여러파일은JSON/안내와ZIP,단일파일은직접다운로드다. 비동기생성은 파일마다 진행알림·취소검사를 하며 언마운트 시도 취소한다.

## 변경 전후·검증·제한

이전에는 비교실험 JSON 저장만 있고 실행결과 이미지/완료확정은 없었다. 이번기능은 GA점수·상차·재이동 정의를 바꾸지 않는다.41개검사·빌드 통과. 브라우저 최종 결과와 사용제한은계획의 후속 기록을 참조한다. ZIP은비압축이며PNG대량생성메모리,폰트환경,새로고침손실이 제한이다.

## 실제 전체 코드

### `src/export/report.ts`

```tsx
import type {Generation,Individual,Settings,Truck,Weights,MoveEvent,Box,Vec} from '../domain/model';

/** 완료 버튼 시점에만 생성하는 불변 내보내기 자료. SW_Browser_ResultExport_001 */
export interface ResultSnapshot {
 schema:1; completedAt:string; history:Generation[]; selected:Individual|null;
 truck:Truck; settings:Settings; inputSeed:number; batchCount:number; automatic:boolean;
 weights:Record<number,Weights>; scene:{image:string|null;step:number;totalSteps:number;events:MoveEvent[];boxes:Box[];fixed:Record<number,Vec>;assetStatus:string;error:string};
}
export interface Graphic {name:string;svg:string;width:number;height:number}
/** 라이브 실행 객체와 참조를 끊고 미완성 세대가 없는 완료 자료만 확정한다. */
export function finalizeResult(input:ResultSnapshot):ResultSnapshot {
 if(!input.history.length)throw Error('완료된 세대가 있어야 결과를 확정할 수 있습니다.');
 if(input.selected&&!input.history.some(g=>g.individuals.some(p=>p.id===input.selected!.id)))throw Error('선택 개체가 완료 세대에 없습니다.');
 return structuredClone(input);
}
export type GraphicKind='roadmap'|'scores'|'movement'|'loading'|'summary';
export const LABELS:Record<GraphicKind,string>={roadmap:'세대별 진화 로드맵',scores:'세대별 최고·평균 점수',movement:'재배치 횟수·중량 추이',loading:'적재 개수·부피 활용 추이',summary:'실행 결과 요약'};
const C={ink:'#183c3d',muted:'#526866',green:'#137b60',blue:'#316eb5',orange:'#bb6426',line:'#dbe4df',bg:'#f4f7f2'};
export const escapeXml=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString('ko-KR',{maximumFractionDigits:2}):'—';
const text=(x:number,y:number,s:unknown,size=16,color=C.ink,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${escapeXml(s)}</text>`;
const line=(x1:number,y1:number,x2:number,y2:number,color=C.line,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
const date=(s:ResultSnapshot)=>new Date(s.completedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
function metadata(s:ResultSnapshot,gs:Generation[]):string[] {
 const versions=[...new Set(gs.map(g=>g.version))],seeds=[...new Set(gs.filter(g=>g.settings).map(g=>`R${g.round??1}: ${g.settings!.seed}`))];
 const seedLines:string[]=[];for(let i=0;i<seeds.length;i+=6)seedLines.push('범위 내 회차별 GA seed | '+seeds.slice(i,i+6).join(' · '));
 return [`완료 ${date(s)} | 세대 ${gs[0]?.number??0}–${gs.at(-1)?.number??0} | 공급 회차 ${[...new Set(gs.map(g=>g.round??1))].join(', ')}`,
 `짐칸 ${s.truck.width}×${s.truck.depth}×${s.truck.height} cm | 회당 할당 ${s.batchCount}개 | ${s.automatic?'자동 공급':'고정 입력'} | 입력 seed ${s.inputSeed}`,
 `집단 ${s.settings.population} | 교차 ${s.settings.crossover} | 변이 ${s.settings.mutation} | k=${s.settings.tournament} | 최초 GA seed ${s.settings.seed} | 회차당 ${s.settings.generations}세대`,
 ...seedLines,...versions.map(v=>{const w=s.weights[v];return w?`가중치 v${v}: ${w.base}×적재율 + ${w.space??20}×공간집중도 − ${w.moves}×재배치횟수 − ${w.mass}×재배치kg`:`가중치 v${v}: 기록 없음 (추정하지 않음)`;})];
}
function frame(s:ResultSnapshot,gs:Generation[],title:string,width:number,bodyHeight:number,body:(top:number)=>string,notes:string[]=[]):Graphic {
 const meta=metadata(s,gs),top=100+meta.length*25,height=top+bodyHeight+90+notes.length*23;
 let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeXml(title)}</title><desc>${escapeXml([...meta,...notes].join('\n'))}</desc><rect width="100%" height="100%" fill="${C.bg}"/><g font-family="'Noto Sans KR','Malgun Gothic',Arial,sans-serif">`;
 out+=text(40,38,'LOADLAB / 확정 실행 결과',16,C.green)+text(40,76,title,28);
 meta.forEach((m,i)=>{out+=text(40,108+i*25,m,15,C.muted);});out+=body(top);
 notes.forEach((n,i)=>{out+=text(40,top+bodyHeight+34+i*23,n,14,C.muted);});
 out+=text(40,height-24,'완료 시점의 기록 | 최초 상차 제외 · 임시 꺼냄/복귀 각각 1회·해당 상자 중량 | 점수는 음수 가능',13,C.muted)+'</g></svg>';
 return {name:title,svg:out,width,height};
}
export function rangeHistory(s:ResultSnapshot,from:number,to:number):Generation[] {
 if(!Number.isInteger(from)||!Number.isInteger(to)||from>to)throw Error('시작·끝 세대를 올바르게 입력하세요.');
 const gs=s.history.filter(g=>g.number>=from&&g.number<=to);if(!gs.length)throw Error('선택 범위에 완료된 세대가 없습니다.');return gs;
}
/** 회차/가중치가 달라지면 선을 끊어 같은 기준의 개선처럼 표현하지 않는다. */
export function segments(gs:Generation[]):Generation[][] {
 const out:Generation[][]=[];
 for(const g of gs){const last=out.at(-1)?.at(-1);if(!last||last.round!==g.round||last.version!==g.version||g.number!==last.number+1)out.push([]);out.at(-1)!.push(g);}return out;
}
const best=(g:Generation)=>g.individuals.reduce((a,b)=>a.score>=b.score?a:b);
type Series={label:string;color:string;value:(g:Generation)=>number};
function chart(s:ResultSnapshot,gs:Generation[],kind:GraphicKind,title:string,unit:string,series:Series[],notes:string[]):Graphic {
 const width=1600,plotH=340,x0=110,x1=1530;
 return frame(s,gs,title,width,plotH+170,top=>{
  const y0=top+55,y1=y0+plotH,values=gs.flatMap(g=>series.map(t=>t.value(g))),lo=Math.min(0,...values),hi=Math.max(1,...values),pad=(hi-lo)*.06,min=lo<0?lo-pad:0,max=hi+pad;
  const x=(g:Generation)=>gs.length===1?(x0+x1)/2:x0+(g.number-gs[0].number)/Math.max(1,gs.at(-1)!.number-gs[0].number)*(x1-x0),y=(v:number)=>y1-(v-min)/(max-min)*plotH;
  let out=text(x0,y0-25,unit,15);
  series.forEach((a,i)=>{out+=line(260+i*360,y0-30,295+i*360,y0-30,a.color,'stroke-width="3"')+text(305+i*360,y0-25,a.label,16,a.color);});
  for(let i=0;i<=5;i++){const v=min+(max-min)*i/5,py=y(v);out+=line(x0,py,x1,py)+text(x0-15,py+5,fmt(v),14,C.muted,'text-anchor="end"');}
  out+=line(x0,y1,x1,y1,C.ink);
  const step=Math.max(1,Math.ceil(gs.length/12));gs.forEach((g,i)=>{if(i%step===0||i===gs.length-1)out+=text(x(g),y1+27,g.number,14,C.muted,'text-anchor="middle"');});
  out+=text(x1,y1+54,'세대',15,C.muted,'text-anchor="end"');
  for(const chunk of segments(gs)){
   const first=chunk[0];out+=line(x(first),y0,x(first),y1,'#9aaea6','stroke-dasharray="5 5"')+text(x(first)+5,y0+17,`R${first.round??1} / v${first.version}`,12,C.muted);
   for(const t of series){out+=`<polyline points="${chunk.map(g=>`${x(g)},${y(t.value(g))}`).join(' ')}" fill="none" stroke="${t.color}" stroke-width="3"/>`;if(gs.length<=60)for(const g of chunk)out+=`<circle cx="${x(g)}" cy="${y(t.value(g))}" r="3" fill="${t.color}"/>`;}
  }
  out+=text(x0,y1+89,series.map(t=>`${t.label}: 최초 ${fmt(t.value(gs[0]))} → 마지막 ${fmt(t.value(gs.at(-1)!))} ${unit}`).join('    |    '),16);
  return out;
 },['세로축: '+unit+' / 가로축: 완료된 세대 번호. 공급 회차·평가 버전 경계에서는 선을 끊습니다.',...notes]);
}
export function charts(s:ResultSnapshot,gs:Generation[],kind:GraphicKind):Graphic[] {
 if(kind==='scores')return [chart(s,gs,kind,LABELS[kind],'점',[{label:'세대 최고 점수',color:C.green,value:g=>g.best},{label:'세대 평균 점수',color:C.blue,value:g=>g.mean}],['각 세대 당시 점수를 보존합니다. 다른 공급 회차·가중치의 점수를 직접 개선량으로 비교하지 마세요.'])];
 if(kind==='movement')return [chart(s,gs,kind,'최고 점수 개체의 재배치 횟수','회',[{label:'재배치 횟수',color:C.orange,value:g=>best(g).evaluation.moves}],['각 세대 최고 점수 개체를 비교하며 동점이면 집단 순서상 첫 개체를 사용합니다.']),chart(s,gs,kind,'최고 점수 개체의 재배치 중량','kg',[{label:'재배치 중량',color:C.blue,value:g=>best(g).evaluation.mass}],['동일 상자를 꺼내고 복귀하면 중량을 각각 합산합니다.'])];
 if(kind==='loading')return [chart(s,gs,kind,'최고 점수 개체의 적재 개수','개',[{label:'실제 적재',color:C.green,value:g=>best(g).evaluation.loaded},{label:'할당 상자',color:C.blue,value:g=>g.boxes?.length??best(g).coords.length}],['실제 상차 평가 결과입니다. 미완성 준비 세대는 포함하지 않습니다.']),chart(s,gs,kind,'최고 점수 개체의 부피 활용·공간 집중도','%',[{label:'짐칸 부피 활용',color:C.green,value:g=>best(g).evaluation.utilization*100},{label:'공간 집중도',color:C.orange,value:g=>best(g).evaluation.compactness*100}],['부피 활용=적재 부피/짐칸 부피. 공간 집중도는 적재물이 차지하는 깊이 구간을 기준으로 합니다.'])];
 if(kind==='summary')return [summary(s,gs)];return [];
}
function summary(s:ResultSnapshot,gs:Generation[]):Graphic {
 return frame(s,gs,LABELS.summary,1600,150+gs.length*38,top=>{
  let out=text(40,top+30,`완성 ${gs.length}세대 · 선택 개체 ${s.selected?.id??'없음'} · 공급·가중치 경계 ${segments(gs).length}구간`,20);
  const cols=[40,145,275,450,610,795,970,1140,1300,1430],headers=['세대','회차/v','최고 점수','평균 점수','최고 개체 적재','부피 활용 %','재배치 회','중량 kg','평가 누적','시간 ms'];
  headers.forEach((h,i)=>out+=text(cols[i],top+80,h,15,C.muted));
  gs.forEach((g,i)=>{const b=best(g),py=top+119+i*38;out+=line(40,py+10,1560,py+10);[g.number,`${g.round??1}/v${g.version}`,fmt(g.best),fmt(g.mean),`${b.evaluation.loaded}/${g.boxes?.length??b.coords.length}`,fmt(b.evaluation.utilization*100),fmt(b.evaluation.moves),fmt(b.evaluation.mass),fmt(g.evaluations),fmt(g.elapsed)].forEach((v,j)=>out+=text(cols[j],py,v,15));});return out;
 },['재배치·적재·활용률 열은 각 세대 최고 점수 개체의 수치입니다. 시간은 Worker 세대 생성 경과 시간입니다.']);
}
/** 화면 가상화와 독립적으로 전체 집단을 페이지별 출력한다. 부모가 페이지 밖이면 실제 ID를 남긴다. */
export function roadmaps(s:ResultSnapshot,gs:Generation[]):Graphic[] {
 const out:Graphic[]=[],rows=6,cols=10,maxPop=Math.max(...gs.map(g=>g.individuals.length));
 for(let r=0;r<gs.length;r+=rows)for(let c=0;c<maxPop;c+=cols){
  const chunk=gs.slice(r,r+rows).reverse(),width=1800,nodeW=154,cell=160,rowH=180;
  const title=`진화 로드맵 G${gs[r].number}–${gs[Math.min(r+rows,gs.length)-1].number} 개체${c+1}–${Math.min(c+cols,maxPop)}`;
  out.push(frame(s,chunk.slice().reverse(),title,width,chunk.length*rowH+70,top=>{
   const loc=new Map<string,{x:number;y:number}>();chunk.forEach((g,i)=>g.individuals.slice(c,c+cols).forEach((p,j)=>loc.set(p.id,{x:175+j*cell,y:top+40+i*rowH})));
   let edges='',nodes='';
   chunk.forEach((g,i)=>{const y=top+40+i*rowH;nodes+=text(40,y+30,`${g.number}세대`,20)+text(40,y+55,`R${g.round??1} / v${g.version}`,13,C.muted);
    g.individuals.slice(c,c+cols).forEach((p,j)=>{const x=175+j*cell,isBest=p.score===g.best,isSelected=p.id===s.selected?.id;
     for(const parent of p.parents){const a=loc.get(parent);if(a)edges+=`<path d="M${x+nodeW/2},${y+126} C${x+nodeW/2},${y+160} ${a.x+nodeW/2},${a.y-24} ${a.x+nodeW/2},${a.y}" fill="none" stroke="#9aafa4" stroke-width="1.5"/>`;}
     nodes+=`<g><title>${escapeXml(JSON.stringify({id:p.id,parents:p.parents,score:p.score,operation:p.operation}))}</title><rect x="${x}" y="${y}" width="${nodeW}" height="126" rx="9" fill="${isBest?'#deefe2':'white'}" stroke="${isSelected?C.orange:isBest?C.green:C.line}" stroke-width="${isSelected?3:1.5}"/>`;
     nodes+=text(x+8,y+20,`#${c+j+1} ${isBest?'BEST':''}`,13,C.green)+text(x+8,y+43,fmt(p.score)+'점',20)+text(x+8,y+63,p.id,10)+text(x+8,y+80,`${p.evaluation.loaded}개 / ${p.evaluation.moves}회 / ${fmt(p.evaluation.mass)}kg`,11)+text(x+8,y+96,p.operation.slice(0,19),10,C.muted);
     p.parents.slice(0,2).forEach((id,k)=>nodes+=text(x+8,y+109+k*11,`← ${id}`,9,C.muted));nodes+='</g>';
    });});return edges+nodes+text(40,top+chunk.length*rowH+30,'↑ 진화 방향 · 녹색=세대 최고 · 주황 테두리=완료 시 선택 개체 · 부모 ID는 페이지 밖 연결도 표시',16);
  },['각 노드: 점수·고유 개체 ID·적재 개수·재배치 회/중량·생성 방식·실제 부모 ID. 모든 개체를 분할 출력합니다.','선은 같은 페이지 안 부모 연결만 그립니다. 공급 경계에 원래 기록되지 않은 부모는 만들지 않습니다.']));
 }
 return out;
}
/** 선택 범위와 무관하게 완료 시 선택 개체/재생 단계의 캡처임을 명시한다. */
export function sceneGraphic(s:ResultSnapshot):Graphic {
 if(!s.scene.image||!s.selected)throw Error(s.scene.error||'완료 시 저장된 3D 이미지가 없습니다.');
 const p=s.selected,g=s.history.find(g=>g.number===p.generation)!,w=1600;
 return frame(s,[{...g,version:p.version}],'완료 시점의 선택 개체 3D 배치',w,1000,top=>{
  let out=text(40,top+30,`${p.id} | ${p.generation}세대 | 점수 ${fmt(p.score)} | 최종 적재 ${p.evaluation.loaded}개 | ${p.evaluation.moves}회 / ${fmt(p.evaluation.mass)}kg`,19);
  out+=text(40,top+62,`현재 재생 단계 ${s.scene.step}/${s.scene.totalSteps} · 위 수치는 개체 최종 평가, 아래 이미지는 현재 단계`,16,C.muted);
  out+=text(40,top+90,s.scene.assetStatus,15,C.muted);
  out+=`<image href="${s.scene.image}" x="40" y="${top+115}" width="1520" height="850" preserveAspectRatio="xMidYMid meet"/>`;return out;
 },['상자 ID·치수·좌표·순서·이벤트와 현재 단계는 함께 제공되는 JSON 원자료를 확인하세요.']);
}
/** 요약이 길어져도 한 이미지의 브라우저 크기 한도를 넘지 않도록 나눈다. */
export function graphics(s:ResultSnapshot,gs:Generation[],kind:GraphicKind):Graphic[] {
 if(kind==='roadmap')return roadmaps(s,gs);
 if(kind==='summary'){const out:Graphic[]=[];for(let i=0;i<gs.length;i+=30)out.push(...charts(s,gs.slice(i,i+30),kind));return out;}
 return charts(s,gs,kind);
}
```

### `src/export/files.ts`

```tsx
import type {Graphic} from './report';
/** 의존성 없이 저장 방식 ZIP을 작성한다. UTF-8 이름·CRC32·중앙 디렉터리를 포함한다. */
const encoder=new TextEncoder();
export function crc32(bytes:Uint8Array):number {let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipStore(files:{name:string;bytes:Uint8Array}[]):Uint8Array {
 if(files.length>65535)throw Error('ZIP 파일 수 한도를 넘었습니다. 세대 범위를 나눠 주세요.');
 const parts:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0,dirSize=0;
 for(const file of files){const name=encoder.encode(file.name),crc=crc32(file.bytes),head=new Uint8Array(30+name.length),h=new DataView(head.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,file.bytes.length,true);h.setUint32(22,file.bytes.length,true);h.setUint16(26,name.length,true);head.set(name,30);
  const entry=new Uint8Array(46+name.length),d=new DataView(entry.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,file.bytes.length,true);d.setUint32(24,file.bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);entry.set(name,46);
  parts.push(head,file.bytes);directory.push(entry);offset+=head.length+file.bytes.length;dirSize+=entry.length;
  if(offset+dirSize+22>0xffffffff)throw Error('ZIP 크기 한도를 넘었습니다. 세대 범위를 나눠 주세요.');
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,dirSize,true);e.setUint32(16,offset,true);
 const out=new Uint8Array(offset+dirSize+22);let at=0;for(const p of [...parts,...directory,end]){out.set(p,at);at+=p.length;}return out;
}
export async function png(g:Graphic):Promise<Blob> {
 await document.fonts.ready;
 // SVG 자체를 렌더링하므로 스크롤 밖 데이터·한글·범례도 그대로 포함한다.
 const url=URL.createObjectURL(new Blob([g.svg],{type:'image/svg+xml;charset=utf-8'}));
 try {const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('이미지를 생성하지 못했습니다. SVG로 저장하거나 범위를 줄여 주세요.'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=g.width;canvas.height=g.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지 캔버스를 사용할 수 없습니다.');ctx.drawImage(image,0,0);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG 크기 한도를 초과했습니다. 범위를 줄여 주세요.')),'image/png'));
 } finally{URL.revokeObjectURL(url);}
}
export function download(blob:Blob,name:string):void {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export const svgBlob=(g:Graphic)=>new Blob([g.svg],{type:'image/svg+xml;charset=utf-8'});
export const bytes=(s:string)=>encoder.encode(s);
```

### `src/ui/ResultExport.tsx`

```tsx
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
```


## 2026-11-17 00:18:02 (KST) 직접 다운로드 검증 완료

완료전잠금·23개완성세대확정·PNG/SVG/ZIP31파일·완료후다른개체선택시같은3D해시·초기화/새실행재잠금·수동완료구분을확인했다.최종회차별seed메타데이터와실제코드스냅샷갱신.상세근거·한계·배포는`Info/plan/2026-11-17/001050_완료시점결과이미지다운로드_plan.md` 참조.

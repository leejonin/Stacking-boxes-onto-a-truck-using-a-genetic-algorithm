import {priorityOrder,priorityColor} from '../domain/priority';
import type {Generation,Individual,Settings,Truck,Weights,MoveEvent,Box,Vec} from '../domain/model';

/** 완료 버튼 시점에만 생성하는 불변 내보내기 자료. SW_Browser_ResultExport_001 */
export interface ResultSnapshot {
 schema:1; objective?:'priority-unload'; completedAt:string; history:Generation[]; selected:Individual|null;
 truck:Truck; settings:Settings; inputSeed:number; batchCount:number; automatic:boolean;
 weights:Record<number,Weights>; scene:{mode?:'loading'|'unloading';priorityColors?:boolean;initialCoords?:Vec[];image:string|null;step:number;totalSteps:number;events:MoveEvent[];boxes:Box[];fixed:Record<number,Vec>;assetStatus:string;error:string};
}
export interface Graphic {name:string;svg:string;width:number;height:number}
/** 라이브 실행 객체와 참조를 끊고 미완성 세대가 없는 완료 자료만 확정한다. */
export function finalizeResult(input:ResultSnapshot):ResultSnapshot {
 if(!input.history.length)throw Error('완료된 세대가 있어야 결과를 확정할 수 있습니다.');
 if(input.selected&&!input.history.some(g=>g.individuals.some(p=>p.id===input.selected!.id)))throw Error('선택 개체가 완료 세대에 없습니다.');
 return structuredClone(input);
}
export type GraphicKind='roadmap'|'scores'|'movement'|'loading'|'summary'|'priorities';
export const LABELS:Record<GraphicKind,string>={roadmap:'세대별 진화 로드맵',scores:'세대별 최고·평균 점수',movement:'재이동 횟수·중량 추이',loading:'적재 개수·부피 활용 추이',summary:'실행 결과 요약',priorities:'선택 개체 상자별 우선도'};
const C={ink:'#183c3d',muted:'#526866',green:'#137b60',blue:'#316eb5',orange:'#bb6426',line:'#dbe4df',bg:'#f4f7f2'};
export const escapeXml=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString('ko-KR',{maximumFractionDigits:2}):'—';
const text=(x:number,y:number,s:unknown,size=16,color=C.ink,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${escapeXml(s)}</text>`;
const line=(x1:number,y1:number,x2:number,y2:number,color=C.line,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
const date=(s:ResultSnapshot)=>new Date(s.completedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
const cost=(p:Individual)=>p.unloading??p.evaluation;
const priorityResult=(s:ResultSnapshot)=>s.objective==='priority-unload'||!!s.selected?.unloading;
function metadata(s:ResultSnapshot,gs:Generation[]):string[] {
 const costLabel=priorityResult(s)?'하차재이동':'재배치';
 const versions=[...new Set(gs.map(g=>g.version))],seeds=[...new Set(gs.filter(g=>g.settings).map(g=>`R${g.round??1}: ${g.settings!.seed}`))];
 const seedLines:string[]=[];for(let i=0;i<seeds.length;i+=6)seedLines.push('범위 내 회차별 GA seed | '+seeds.slice(i,i+6).join(' · '));
 return [...(priorityResult(s)?['목적: 우선도 순 하차 재이동 최소화 | 5 먼저 → 1 나중 | 동점: ID 오름차순']:[]),`완료 ${date(s)} | 세대 ${gs[0]?.number??0}–${gs.at(-1)?.number??0} | 공급 회차 ${[...new Set(gs.map(g=>g.round??1))].join(', ')}`,
 `짐칸 ${s.truck.width}×${s.truck.depth}×${s.truck.height} cm | 회당 할당 ${s.batchCount}개 | ${s.automatic?'자동 공급':'고정 입력'} | 입력 seed ${s.inputSeed}`,
 `집단 ${s.settings.population} | 교차 ${s.settings.crossover} | 변이 ${s.settings.mutation} | k=${s.settings.tournament} | 최초 GA seed ${s.settings.seed} | 회차당 ${s.settings.generations}세대`,
 ...seedLines,...versions.map(v=>{const w=s.weights[v];return w?`가중치 v${v}: ${w.base}×적재율 + ${w.space??20}×공간집중도 − ${w.moves}×${costLabel}횟수 − ${w.mass}×${costLabel}kg`:`가중치 v${v}: 기록 없음 (추정하지 않음)`;})];
}
function frame(s:ResultSnapshot,gs:Generation[],title:string,width:number,bodyHeight:number,body:(top:number)=>string,notes:string[]=[]):Graphic {
 const meta=metadata(s,gs),top=100+meta.length*25,height=top+bodyHeight+90+notes.length*23;
 let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeXml(title)}</title><desc>${escapeXml([...meta,...notes].join('\n'))}</desc><rect width="100%" height="100%" fill="${C.bg}"/><g font-family="'Noto Sans KR','Malgun Gothic',Arial,sans-serif">`;
 out+=text(40,38,'LOADLAB / 확정 실행 결과',16,C.green)+text(40,76,title,28);
 meta.forEach((m,i)=>{out+=text(40,108+i*25,m,15,C.muted);});out+=body(top);
 notes.forEach((n,i)=>{out+=text(40,top+bodyHeight+34+i*23,n,14,C.muted);});
 out+=text(40,height-24,priorityResult(s)?'완료 기록 | 배송 하차 제외 · 임시 꺼냄/복귀 각각 1회·해당 중량 | 복귀를 위한 추가 정리도 감점 | 음수 점수 가능':'완료 시점의 기록 | 최초 상차 제외 · 임시 꺼냄/복귀 각각 1회·해당 상자 중량 | 점수는 음수 가능',13,C.muted)+'</g></svg>';
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
 if(kind==='movement')return [chart(s,gs,kind,priorityResult(s)?'최고 점수 개체의 하차 재이동 횟수':'최고 점수 개체의 재배치 횟수','회',[{label:priorityResult(s)?'하차 재이동 횟수':'재배치 횟수',color:C.orange,value:g=>cost(best(g)).moves}],['각 세대 최고 점수 개체를 비교하며 동점이면 집단 순서상 첫 개체를 사용합니다.']),chart(s,gs,kind,priorityResult(s)?'최고 점수 개체의 하차 재이동 중량':'최고 점수 개체의 재배치 중량','kg',[{label:priorityResult(s)?'하차 재이동 중량':'재배치 중량',color:C.blue,value:g=>cost(best(g)).mass}],['동일 상자를 꺼내고 복귀하면 중량을 각각 합산합니다.'])];
 if(kind==='loading')return [chart(s,gs,kind,'최고 점수 개체의 적재 개수','개',[{label:'실제 적재',color:C.green,value:g=>best(g).evaluation.loaded},{label:'할당 상자',color:C.blue,value:g=>g.boxes?.length??best(g).coords.length}],['실제 상차 평가 결과입니다. 미완성 준비 세대는 포함하지 않습니다.']),chart(s,gs,kind,'최고 점수 개체의 부피 활용·공간 집중도','%',[{label:'짐칸 부피 활용',color:C.green,value:g=>best(g).evaluation.utilization*100},{label:'공간 집중도',color:C.orange,value:g=>best(g).evaluation.compactness*100}],['부피 활용=적재 부피/짐칸 부피. 공간 집중도는 적재물이 차지하는 깊이 구간을 기준으로 합니다.'])];
 if(kind==='summary')return [summary(s,gs)];return [];
}
function summary(s:ResultSnapshot,gs:Generation[]):Graphic {
 return frame(s,gs,LABELS.summary,1600,150+gs.length*38,top=>{
  let out=text(40,top+30,`완성 ${gs.length}세대 · 선택 개체 ${s.selected?.id??'없음'} · 공급·가중치 경계 ${segments(gs).length}구간`,20);
  const cols=[40,145,275,450,610,795,970,1140,1300,1430],headers=['세대','회차/v','최고 점수','평균 점수','최고 개체 적재','부피 활용 %',priorityResult(s)?'하차 재이동 회':'재배치 회',priorityResult(s)?'하차 중량 kg':'중량 kg','평가 누적','시간 ms'];
  headers.forEach((h,i)=>out+=text(cols[i],top+80,h,15,C.muted));
  gs.forEach((g,i)=>{const b=best(g),py=top+119+i*38;out+=line(40,py+10,1560,py+10);[g.number,`${g.round??1}/v${g.version}`,fmt(g.best),fmt(g.mean),`${b.evaluation.loaded}/${g.boxes?.length??b.coords.length}`,fmt(b.evaluation.utilization*100),fmt(cost(b).moves),fmt(cost(b).mass),fmt(g.evaluations),fmt(g.elapsed)].forEach((v,j)=>out+=text(cols[j],py,v,15));});return out;
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
     nodes+=text(x+8,y+20,`#${c+j+1} ${isBest?'BEST':''}`,13,C.green)+text(x+8,y+43,fmt(p.score)+'점',20)+text(x+8,y+63,p.id,10)+text(x+8,y+80,`${p.evaluation.loaded}개 / ${cost(p).moves}회 / ${fmt(cost(p).mass)}kg`,11)+text(x+8,y+96,p.operation.slice(0,19),10,C.muted);
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
  let out=text(40,top+30,`${p.id} | ${p.generation}세대 | 점수 ${fmt(p.score)} | 최종 적재 ${p.evaluation.loaded}개 | ${priorityResult(s)?'하차 재이동':'상차 재배치'} ${cost(p).moves}회 / ${fmt(cost(p).mass)}kg`,19);
  out+=text(40,top+62,`${s.scene.mode==='unloading'?'우선도 하차':'상차'} 재생 단계 ${s.scene.step}/${s.scene.totalSteps} · 위 수치는 개체 최종 평가, 아래 이미지는 현재 단계`,16,C.muted);
  out+=text(40,top+90,s.scene.assetStatus+(s.scene.priorityColors?' | 색상: 우선도 1 파랑 → 5 빨강':''),15,C.muted);
  if(s.scene.priorityColors)out+=`<defs><linearGradient id="priority-scale"><stop offset="0" stop-color="${priorityColor(1)}"/><stop offset="50%" stop-color="${priorityColor(3)}"/><stop offset="100%" stop-color="${priorityColor(5)}"/></linearGradient></defs><rect x="1160" y="${top+78}" width="280" height="12" rx="6" fill="url(#priority-scale)"/>`+text(1100,top+89,'1 나중',13,C.muted)+text(1450,top+89,'5 먼저',13,C.muted);
  out+=`<image href="${s.scene.image}" x="40" y="${top+115}" width="1520" height="850" preserveAspectRatio="xMidYMid meet"/>`;return out;
 },['상자 ID·치수·좌표·순서·이벤트와 현재 단계는 함께 제공되는 JSON 원자료를 확인하세요.']);
}
/** 요약이 길어져도 한 이미지의 브라우저 크기 한도를 넘지 않도록 나눈다. */
export function graphics(s:ResultSnapshot,gs:Generation[],kind:GraphicKind):Graphic[] {
 if(kind==='priorities')return priorityTables(s);
 if(kind==='roadmap')return roadmaps(s,gs);
 if(kind==='summary'){const out:Graphic[]=[];for(let i=0;i<gs.length;i+=30)out.push(...charts(s,gs.slice(i,i+30),kind));return out;}
 return charts(s,gs,kind);
}

/** 완료 당시 선택 개체의 실제 상자 입력과 배송 순위를 분할 출력한다. */
function priorityTables(s:ResultSnapshot):Graphic[]{
 if(!s.selected)throw Error('선택 개체가 없습니다.');
 const selected=s.selected,g=s.history.find(g=>g.number===selected.generation)!,boxes=g.boxes??s.scene.boxes,ordered=priorityOrder(boxes),pages:Graphic[]=[];
 for(let offset=0;offset<ordered.length;offset+=30){const chunk=ordered.slice(offset,offset+30);pages.push(frame(s,[{...g,version:selected.version}],`상자별 우선도·하차 순위 ${offset+1}–${offset+chunk.length}`,1600,110+chunk.length*36,top=>{
  let out=text(40,top+30,`${selected.id} | ${selected.generation}세대 | 큰 우선도 먼저 · 동점 ID순 | 좌표는 하차 시작 전 적재 완료 위치 (cm)`,18);
  const xs=[40,170,340,510,900,1130];['하차 순위','상자 ID','우선도','크기 (cm)','중량 (kg)','적재 완료 좌표'].forEach((v,i)=>out+=text(xs[i],top+75,v,16,C.muted));
  chunk.forEach((b,k)=>{const index=boxes.findIndex(a=>a.id===b.id),values=[offset+k+1,'#'+b.id,b.priority,b.size.join(' × '),b.weight,selected.evaluation.finalCoords[index]?.join(', ')??'미적재'],y=top+112+k*36;out+=line(40,y+10,1560,y+10)+`<rect x="320" y="${y-14}" width="8" height="18" fill="${priorityColor(b.priority)}"/>`;values.forEach((v,i)=>out+=text(xs[i],y,v,16));});return out;
 },['세대 범위 선택과 무관하게 완료 당시 선택 개체의 상자 명세를 출력합니다. 원자료와 실제 하차 이벤트는 JSON에 포함됩니다.']));}return pages;
}

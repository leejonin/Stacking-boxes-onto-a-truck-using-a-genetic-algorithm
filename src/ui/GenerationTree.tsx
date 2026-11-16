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

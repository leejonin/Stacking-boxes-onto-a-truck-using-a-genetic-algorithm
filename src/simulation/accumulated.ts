import type {Box,Vec,Truck,LoadingSnapshot,LoadingEvaluation,MoveEvent} from '../domain/model';
import {type Placed,validateLayout,fits,blockers,supported} from '../domain/packing';
import {simulateLoading} from './loading';

/** 이전 공급의 적재물에서 출발한다. 기존 상자 유실을 거부하고 이번 재배치 상자마다 한 번만 비용을 더한다. */
export function simulateAccumulatedLoading(boxes:Box[],coords:Vec[],truck:Truck,order:number[],snapshot:LoadingSnapshot,fixed:Record<number,Vec>={},trace=true,reference?:{count:number;volume:number}):LoadingEvaluation {
  // 공통 입력·목표 배치 검증과 보상 계산을 재사용한다. 아래 실행 결과로 개수·비용·이벤트를 교체한다.
  const result=simulateLoading(boxes,coords,truck,order,fixed,false,reference);
  const fail=(reason:string)=>({...result,valid:false,reason});
  if(!result.valid)return result;
  const targets=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
  let loaded:Placed[]=boxes.flatMap(box=>snapshot.positions[box.id]?[{box,pos:[...snapshot.positions[box.id]] as Vec}]:[]);
  if(validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck,fixed))return fail('누적 상차 시작 배치가 유효하지 않습니다.');
  if(Object.keys(snapshot.positions).some(id=>!targets.some(p=>p.box.id===+id)))return fail('이미 상차한 상자를 미적재로 되돌릴 수 없습니다.');
  const moved=new Set<number>(),events:MoveEvent[]=[];
  let moves=snapshot.moves,mass=snapshot.mass;
  /** 꺼냄과 복귀를 합쳐 상자당 재이동 한 번으로 계산한다. 최초 상차에는 감점하지 않는다. */
  const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null)=>{
    if(kind==='out'&&!moved.has(p.box.id)){moved.add(p.box.id);moves++;mass=Math.round((mass+p.box.weight)*10)/10;}
    if(trace)events.push({kind,boxId:p.box.id,from:kind==='out'?[...p.pos]:null,to:to?[...to]:null,moves,mass});
  };
  /** 지지 의존 상자와 출입 경로 방해물을 먼저 임시로 꺼낸다. 고정 적재는 이동하지 않는다. */
  const remove=(p:Placed,seen=new Set<number>()):boolean=>{
    if(fixed[p.box.id]||seen.has(p.box.id))return false;seen.add(p.box.id);
    while(true){
      const rest=loaded.filter(a=>a.box.id!==p.box.id);
      const next=rest.find(a=>!supported(a,rest))??blockers(p,loaded)[0];
      if(!next)break;if(!remove(next,new Set(seen)))return false;
    }
    loaded=loaded.filter(a=>a.box.id!==p.box.id);record('out',p,null);return true;
  };
  // 목표 좌표가 달라진 기존 상자만 이동한다. 움직이지 않은 상자는 시작부터 화면과 적재함에 남는다.
  for(const p of [...loaded].sort((a,b)=>b.pos[2]-a.pos[2])){
    const target=targets.find(a=>a.box.id===p.box.id)!;
    if(loaded.some(a=>a.box.id===p.box.id)&&p.pos.some((v,k)=>v!==target.pos[k])&&!remove(p))return fail('기존 상자의 이동 경로를 확보하지 못했습니다.');
  }
  for(const id of order){
    const target=targets.find(p=>p.box.id===id);if(!target||loaded.some(p=>p.box.id===id)||!supported(target,loaded))continue;
    const before=loaded.map(p=>({box:p.box,pos:[...p.pos] as Vec})),oldMoved=new Set(moved),oldMoves=moves,oldMass=mass,oldEvents=events.length;
    let possible=true;
    for(const p of blockers(target,loaded))if(loaded.some(a=>a.box.id===p.box.id)&&!remove(p)){possible=false;break;}
    if(possible&&fits(target.box,target.pos,loaded,truck)&&!blockers(target,loaded).length){
      loaded.push({box:target.box,pos:[...target.pos]});record(snapshot.positions[id]||moved.has(id)?'return':'load',target,target.pos);
    }else{loaded=before;moved.clear();oldMoved.forEach(id=>moved.add(id));moves=oldMoves;mass=oldMass;events.length=oldEvents;}
  }
  // 임시로 꺼낸 상자는 지지와 경로가 가능한 순서로 목표 위치에 복귀시킨다.
  let restored=true;
  while(restored){restored=false;for(const id of moved){
    const p=targets.find(a=>a.box.id===id);if(!p||loaded.some(a=>a.box.id===id))continue;
    if(fits(p.box,p.pos,loaded,truck)&&!blockers(p,loaded).length){loaded.push({box:p.box,pos:[...p.pos]});record('return',p,p.pos);restored=true;}
  }}
  if(Object.keys(snapshot.positions).some(id=>!loaded.some(p=>p.box.id===+id))||[...moved].some(id=>!loaded.some(p=>p.box.id===id)))return fail('재배치 후 기존 상자를 모두 복귀시키지 못했습니다.');
  const finalCoords:Vec[]=boxes.map(box=>loaded.find(p=>p.box.id===box.id)?.pos??[-1,-1,-1]);
  // 실제 남은 배치를 지지 순서로 계산하여 보상과 유효성을 얻는다. 실행 이벤트와 누적 비용은 위 결과를 쓴다.
  const finalOrder=[...loaded].sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]).map(p=>p.box.id);
  const summary=simulateLoading(boxes,finalCoords,truck,[...finalOrder,...boxes.filter(b=>!finalOrder.includes(b.id)).map(b=>b.id)],fixed,false,reference);
  return {...summary,moves,mass,events};
}

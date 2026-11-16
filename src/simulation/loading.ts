import type {Box,Vec,Truck,Weights,LoadingEvaluation,MoveEvent} from '../domain/model';
import {type Placed,validateLayout,fits,blockers,supported} from '../domain/packing';

/** 상차 순서와 목표 위치를 실행한다. 처음 싣는 동작과 재배치를 구별한다. SW_Browser_Loading_001 */
export function simulateLoading(boxes:Box[],coords:Vec[],truck:Truck,order:number[],fixed:Record<number,Vec>={},trace=true):LoadingEvaluation {
  const result:LoadingEvaluation={valid:true,reason:'',moves:0,mass:0,loaded:0,loadedVolume:0,totalVolume:boxes.reduce((n,b)=>n+b.size[0]*b.size[1]*b.size[2],0),coverage:0,utilization:0,compactness:0,unloadedIds:[],events:[],finalCoords:boxes.map(()=>[-1,-1,-1])};
  const fail=(reason:string)=>{result.valid=false;result.reason=reason;return result;};
  if(coords.length!==boxes.length||order.length!==boxes.length||new Set(order).size!==boxes.length||order.some(id=>!boxes.some(b=>b.id===id)))return fail('상차 순서에는 각 상자 ID가 정확히 한 번 필요합니다.');
  if(coords.some(p=>!p||p.length!==3||p.some(x=>!Number.isFinite(x)))||coords.some(p=>p.some(x=>x<0)&&!p.every(x=>x===-1)))return fail('미배치 좌표는 (-1,-1,-1)이어야 합니다.');
  const targets=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
  const layoutReason=validateLayout(targets.map(p=>p.box),targets.map(p=>p.pos),truck,fixed);
  if(layoutReason)return fail(layoutReason);
  if(Object.entries(fixed).some(([id,p])=>{const i=boxes.findIndex(b=>b.id===+id);return i<0||p.some((v,k)=>coords[i][k]!==v);}))return fail('이미 상차한 상자의 고정 좌표를 변경할 수 없습니다.');
  let loaded:Placed[]=targets.filter(p=>fixed[p.box.id]).map(p=>({box:p.box,pos:[...p.pos]}));
  if(validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck))return fail('기존 적재 상태가 유효하지 않습니다.');
  /** 최초 상차에는 재배치 감점을 매기지 않는다. 임시 꺼냄·복귀 각각 1회다. */
  const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null)=>{
    if(kind==='out'||kind==='return'){result.moves++;result.mass=Math.round((result.mass+p.box.weight)*10)/10;}
    if(trace)result.events.push({kind,boxId:p.box.id,from:kind==='out'?[...p.pos]:null,to:to?[...to]:null,moves:result.moves,mass:result.mass});
  };
  for(const id of order) {
    if(fixed[id])continue;
    const target=targets.find(p=>p.box.id===id);if(!target)continue;
    // 지지 상자를 먼저 싣는 순서도 GA가 찾아야 한다. 평가기가 몰래 순서를 바꾸지 않는다.
    if(!supported(target,loaded))continue;
    const snapshot=loaded.map(p=>({box:p.box,pos:[...p.pos] as Vec})),eventCount=result.events.length,oldMoves=result.moves,oldMass=result.mass,temporary:Placed[]=[];
    /** 방해 상자와 그 상자에 의존하는 새 적재물만 꺼낸다. 기존 확정 적재물은 이동하지 않는다. */
    const remove=(p:Placed,seen:Set<number>):boolean=>{
      if(fixed[p.box.id]||seen.has(p.box.id))return false;
      seen.add(p.box.id);
      while(true){
        const rest=loaded.filter(a=>a.box.id!==p.box.id);
        const dependent=rest.filter(a=>!supported(a,rest)).sort((a,b)=>b.pos[2]-a.pos[2]||a.box.id-b.box.id)[0];
        const obstruction=blockers(p,loaded).sort((a,b)=>a.pos[1]-b.pos[1]||a.box.id-b.box.id)[0];
        const next=dependent??obstruction;if(!next)break;
        if(!remove(next,new Set(seen)))return false;
      }
      loaded=loaded.filter(a=>a.box.id!==p.box.id);temporary.push(p);record('out',p,null);return true;
    };
    let possible=true;
    for(const p of blockers(target,loaded).sort((a,b)=>a.pos[1]-b.pos[1])) {
      if(loaded.some(a=>a.box.id===p.box.id)&&!remove(p,new Set())){possible=false;break;}
    }
    if(possible&&fits(target.box,target.pos,loaded,truck)&&!blockers(target,loaded).length){
      loaded.push({box:target.box,pos:[...target.pos]});record('load',target,target.pos);
      while(temporary.length){
        temporary.sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]);
        const i=temporary.findIndex(p=>fits(p.box,p.pos,loaded,truck)&&!blockers(p,loaded).length);
        if(i<0){possible=false;break;}const [p]=temporary.splice(i,1);loaded.push(p);record('return',p,p.pos);
      }
    }else possible=false;
    // 실패한 시도는 확정된 동작이 아니다. 성공한 상태·이벤트만 점수와 3D에 사용한다.
    if(!possible){loaded=snapshot;result.events.length=eventCount;result.moves=oldMoves;result.mass=oldMass;}
  }
  const invalid=validateLayout(loaded.map(p=>p.box),loaded.map(p=>p.pos),truck,fixed);if(invalid)return fail(invalid);
  for(const p of loaded) {const i=boxes.findIndex(b=>b.id===p.box.id);result.finalCoords[i]=[...p.pos];result.loadedVolume+=p.box.size[0]*p.box.size[1]*p.box.size[2];}
  result.loaded=loaded.length;result.unloadedIds=boxes.filter(b=>!loaded.some(p=>p.box.id===b.id)).map(b=>b.id);
  // 개수와 부피를 함께 보상하므로 작은 상자만 골라 점수를 높이는 편향을 줄인다.
  result.coverage=boxes.length?.5*(result.loaded/boxes.length+result.loadedVolume/result.totalVolume):0;
  result.utilization=result.loadedVolume/(truck.width*truck.depth*truck.height);
  if(loaded.length){const min=Math.min(...loaded.map(p=>p.pos[1])),max=Math.max(...loaded.map(p=>p.pos[1]+p.box.size[1]));result.compactness=result.loadedVolume/(truck.width*truck.height*(max-min));}
  return result;
}
/** 적재 개수·부피 보상과 공간 집중도 보상에서 상차 재배치 비용을 뺀다. */
export function loadingFitness(e:Pick<LoadingEvaluation,'valid'|'coverage'|'compactness'|'moves'|'mass'>,w:Weights):number {
  return e.valid?Math.round((w.base*e.coverage+(w.space??20)*e.compactness-w.moves*e.moves-w.mass*e.mass)*100)/100:-Infinity;
}

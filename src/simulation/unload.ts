import {type Box,type Vec,type Truck,type Evaluation,type MoveEvent,type Weights,Random} from '../domain/model';
import {type Placed,validateLayout,blockers,supported,fits,interval,randomPosition} from '../domain/packing';
import {priorityOrder} from '../domain/priority';
import {priorityUnloadSteps} from './priorityUnload';

/** 고정된 우선도 순 하차. 상자 사이에 yield하여 큰 입력도 중단 명령을 처리한다.
 * recover=true는 복귀 실패 시 추가 적재물을 꺼내 안전하게 다시 싣고 그 비용도 기록한다. */
export function* simulateSteps(boxes:Box[],coords:Vec[],truck:Truck,trace=true,recover=false):Generator<void,Evaluation,void> {
 if(recover)return yield* priorityUnloadSteps(boxes,coords,truck,trace);
 const reason=validateLayout(boxes,coords,truck),result:Evaluation={valid:!reason,reason:reason??'',moves:0,mass:0,delivered:0,events:[]};
 if(reason)return result;
 let remaining:Placed[]=boxes.map((box,i)=>({box,pos:[...coords[i]]}));const delivered=new Set<number>(),rng=new Random(0);
 const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null)=>{
  if(kind!=='deliver'){result.moves++;result.mass=Math.round((result.mass+p.box.weight)*10)/10;}
  if(trace)result.events.push({kind,boxId:p.box.id,from:kind==='return'?null:[...p.pos],to:to?[...to]:null,moves:result.moves,mass:result.mass});
 };
 for(const target of priorityOrder(boxes)){
  const pending:Placed[]=[];
  const extract=(id:number,delivery:boolean,stack:Set<number>):boolean=>{
   if(stack.has(id))return false;const p=remaining.find(b=>b.box.id===id);if(!p)return false;stack.add(id);
   try{
    while(true){
     const without=remaining.filter(b=>b.box.id!==id);
     // 제거 직전 배치는 유효하다. 지지를 잃을 수 있는 것은 이 상자 윗면에 닿는 적재물뿐이다.
     let dependent:Placed|undefined;
     for(const b of without)if(b.pos[2]===p.pos[2]+p.box.size[2]&&interval(p.pos[0],p.box.size[0],b.pos[0],b.box.size[0])&&interval(p.pos[1],p.box.size[1],b.pos[1],b.box.size[1])&&(!dependent||b.box.id<dependent.box.id)&&!supported(b,without))dependent=b;
     const obstruction=dependent?undefined:blockers(p,remaining).sort((a,b)=>a.pos[1]-b.pos[1]||b.pos[2]-a.pos[2]||a.box.id-b.box.id)[0];
     const first=dependent??obstruction;if(!first)break;if(!extract(first.box.id,false,stack))return false;
    }
    remaining=remaining.filter(b=>b.box.id!==id);record(delivery?'deliver':'out',p,null);
    if(delivery){result.delivered++;delivered.add(id);}else pending.push(p);return true;
   }finally{stack.delete(id);}
  };
  if(!extract(target.id,true,new Set())){result.valid=false;result.reason='직선 인출·지지 의존 순환으로 하차할 수 없습니다.';return result;}
  pending.sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]);
  let restoreFailed=false;
  while(pending.length){
   let found=false;
   for(let i=0;i<pending.length;i++){
    const p=pending[i],pos=fits(p.box,p.pos,remaining,truck)&&!blockers(p,remaining).length?p.pos:randomPosition(p.box,remaining,truck,rng,true,true);
    if(!pos)continue;record('return',p,pos);remaining.push({box:p.box,pos});pending.splice(i,1);found=true;break;
   }
   if(!found){restoreFailed=true;break;}
  }
  if(restoreFailed){result.valid=false;result.reason='임시 이동 상자의 안전한 복귀 위치가 없습니다.';return result;}
  yield;
 }
 return result;
}
/** 동기 테스트·화면 재생은 동일한 하차 생성기를 끝까지 실행한다. */
export function simulate(boxes:Box[],coords:Vec[],truck:Truck,trace=true,recover=false):Evaluation {
 const it=simulateSteps(boxes,coords,truck,trace,recover);let r=it.next();while(!r.done)r=it.next();return r.value;
}
/** PPT 기준 100 - 10×횟수 - 1×중량. 무효 배치는 선택할 수 없다. */
export function fitness(e:Pick<Evaluation,'valid'|'moves'|'mass'>,weights:Weights):number{return e.valid?Math.round((weights.base-weights.moves*e.moves-weights.mass*e.mass)*100)/100:-Infinity;}

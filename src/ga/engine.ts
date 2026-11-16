import {effectiveCrossover} from '../domain/ranges';
import {supportSurfacePack,dependencyLoadingOrder} from '../domain/supportPacking';
import {priorityOrder} from '../domain/priority';
import {simulateSteps} from '../simulation/unload';
import {priorityFitness} from '../simulation/objective';
import { Random,validateConfig,type Box,type Vec,type Truck,type Weights,type Settings,type Individual,type Generation } from '../domain/model';
import { pack,packSteps,randomPosition,loadingOrder,partitionPack,validateLayout } from '../domain/packing';
import { simulateLoading,loadingFitness,completeSupportOrder } from '../simulation/loading';

/** 좌표 기반 GA의 집단·난수·평가 예산을 관리한다. SW_Browser_Evolution_001 */
export class Engine {
  rng:Random; generation=0; population:Individual[]=[]; evaluations=0; version=1;
  private serial=0;
  private partitionMode=false;
  private diverseFailures=0;
  seedLayout:Vec[]|undefined;
  requireFullAllocation=false;
  priorityUnloading=false;
  allocationProgress={ready:0,attempts:0,mostLoaded:0};
  constructor(public boxes:Box[],public truck:Truck,public settings:Settings,public weights:Weights,public fixed:Record<number,Vec>={},public requireLoading=false) {
    validateConfig(boxes,truck,settings,weights); this.rng=new Random(settings.seed);
  }
  /** 같은 상태에서 토너먼트로 부모를 선택한다. 음수 점수도 그대로 비교한다. */
  select():Individual {
    let best=this.population[this.rng.int(0,this.population.length-1)];
    for(let k=1;k<this.settings.tournament;k++) {const p=this.population[this.rng.int(0,this.population.length-1)];if(p.score>best.score)best=p;}
    return best;
  }
  /** 상자별 좌표 묶음 1점 교차와 유효 위치 변이, 최소 배치 수정을 수행한다. */
  offspring(): {coords:Vec[];loadOrder:number[];repairOrder?:number[];parents:string[];operation:string;repaired:boolean}|null {
    const useRepair=this.partitionMode||this.priorityUnloading;
    const a=this.select(),b=this.select();const cross=this.rng.next()<effectiveCrossover(this.settings.crossover) && this.boxes.length>1;
    const cut=cross?this.rng.int(1,this.boxes.length-1):this.boxes.length;
    const coords=this.boxes.map((_,i)=>[...(i<cut?a.coords[i]:b.coords[i])] as Vec);let mutated=false;
    for(let i=0;i<coords.length;i++) {
      if(this.fixed[this.boxes[i].id] || this.rng.next()>=this.settings.mutation)continue;
      // 우선도 하차 또는 구획 복구에서는 변이율1도 전수 위치 탐색 대신 공통 복구기로 충돌·지지를 검사한다.
      if(useRepair){const size=this.boxes[i].size;coords[i]=[this.rng.int(0,this.truck.width-size[0]),this.rng.int(0,this.truck.depth-size[1]),this.rng.int(0,this.truck.height-size[2])];mutated=true;continue;}
      // 위 지지 관계까지 고정하는 대신 변이 후 pack에서 후속 검사를 수행한다.
      const placed=this.boxes.flatMap((box,j)=>j===i||coords[j][0]<0?[]:[{box,pos:coords[j]}]);
      const p=randomPosition(this.boxes[i],placed,this.truck,this.rng);
      if(p&&p.some((v,k)=>v!==coords[i][k])) {coords[i]=p;mutated=true;}
      else {
        // 빈 공간이 없는 배치도 탐색하도록 두 미고정 상자의 좌표를 교환한 뒤 유효성을 복구한다.
        const alternatives=coords.map((_,j)=>j).filter(j=>j!==i&&!this.fixed[this.boxes[j].id]);
        if(alternatives.length){const j=alternatives[this.rng.int(0,alternatives.length-1)];[coords[i],coords[j]]=[coords[j],coords[i]];mutated=true;}
      }
    }
    const prefix=a.loadOrder.slice(0,cut);
    const loadOrder=cross?[...prefix,...b.loadOrder.filter(id=>!prefix.includes(id))]:[...a.loadOrder];
    if(loadOrder.length>1&&this.rng.next()<this.settings.mutation){const i=this.rng.int(0,loadOrder.length-1),j=this.rng.int(0,loadOrder.length-1);[loadOrder[i],loadOrder[j]]=[loadOrder[j],loadOrder[i]];mutated=true;}
    // 유효한 복제·교차 좌표는 그대로 보존한다. 복구가 필요한 자식만 다시 구획화한다.
    const result=useRepair?(validateLayout(this.boxes,coords,this.truck)?this.rescuePack(coords):{coords,repaired:false,loadOrder:this.boxes.map((b,i)=>({id:b.id,back:coords[i][1]+b.size[1],z:coords[i][2]})).sort((a,b)=>b.back-a.back||a.z-b.z).map(b=>b.id)}):pack(this.boxes,this.truck,this.rng,coords,this.fixed,true,this.requireFullAllocation);
    if(!result)return null;
    return {...result,loadOrder,...(useRepair?{repairOrder:result.loadOrder}:{}),parents:cross?[a.id,b.id]:[a.id],operation:(cross?(mutated?'교차·변이':'교차'):(mutated?'변이':'선택 복제'))+(useRepair&&result.repaired?'·구획 복구':'')};
  }
  /** 기존 구획 후보가 부분 배치이면 최대 지지면 전략으로 복구한다. 성공 경로의 난수·후보는 보존한다. */
  private rescuePack(preferred?:Vec[]):ReturnType<typeof partitionPack> {
    const original=partitionPack(this.boxes,this.truck,this.rng,preferred);
    if(!this.priorityUnloading||original.coords.every(p=>p[0]>=0))return original;
    // 새 전략도 성공을 보장하지 않는다. 같은 실패에 수천 번 비싼 재계산을 하지 않는다.
    if(++this.diverseFailures>32)throw Error('다양한 전량 배치 전략으로 유효 집단을 생성하지 못했습니다. 전량 배치 가능성이 확인된 것은 아닙니다. 입력·짐칸·seed를 확인하세요. 현재 세대는 유지됩니다.');
    const alternative=supportSurfacePack(this.boxes,this.truck,this.rng,this.diverseFailures%2?0:4);
    if(alternative.coords.filter(p=>p[0]>=0).length>original.coords.filter(p=>p[0]>=0).length){return alternative;}return original;
  }
  /** 전량 상차를 검증한 뒤 웹 목적에서는 고정 우선도 순 하차 비용으로 평가한다. */
  *evaluateSteps(coords:Vec[],parents:string[],operation:string,repaired:boolean,loadOrder=this.boxes.map(b=>b.id)):Generator<void,Individual|null,void> {
    this.evaluations++;
    if((this.requireFullAllocation||this.priorityUnloading)&&!completeSupportOrder(this.boxes,coords,loadOrder,this.fixed))return null;
    const {events:_,...evaluation}=simulateLoading(this.boxes,coords,this.truck,loadOrder,this.fixed,false);
    if(!evaluation.valid)return null;
    this.allocationProgress.mostLoaded=Math.max(this.allocationProgress.mostLoaded,evaluation.loaded);
    if((this.requireFullAllocation||this.priorityUnloading)&&evaluation.loaded!==this.boxes.length)return null;
    const extra=this.priorityUnloading?yield* simulateSteps(this.boxes,evaluation.finalCoords,this.truck,false,true):null;
    if(extra&&!extra.valid)return null;
    const unloading=extra?{valid:extra.valid,reason:extra.reason,moves:extra.moves,mass:extra.mass,delivered:extra.delivered}:undefined;
    return {...(unloading?{unloading,unloadOrder:priorityOrder(this.boxes).map(b=>b.id)}:{}),id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents,operation,repaired,coords,loadOrder,evaluation,score:unloading?priorityFitness(evaluation,unloading,this.weights):loadingFitness(evaluation,this.weights),version:this.version};
  }
  /** 독립 동기 호출도 동일 평가 경로를 사용한다. */
  evaluate(coords:Vec[],parents:string[],operation:string,repaired:boolean,loadOrder=this.boxes.map(b=>b.id)):Individual|null {const it=this.evaluateSteps(coords,parents,operation,repaired,loadOrder);let r=it.next();while(!r.done)r=it.next();return r.value;}
  /** 개체 한 번 시도마다 양보하여 Worker가 정지·취소 메시지를 처리하게 한다. */
  *next():Generator<void,Generation,void> {
    const start=performance.now(),next:Individual[]=[];let attempts=0,accepted=0,rescueInitial=this.priorityUnloading&&!!this.seedLayout&&!this.population.length&&!Object.keys(this.fixed).length;
    this.allocationProgress={ready:0,attempts:0,mostLoaded:0};
    if(this.requireFullAllocation){
      if(this.boxes.some(b=>b.size.some((v,i)=>v>[this.truck.width,this.truck.depth,this.truck.height][i])))throw Error('할당 상자 중 짐칸 치수를 넘는 상자가 있어 전부 배치할 수 없습니다. 초기화 후 입력을 조정하세요.');
      if(this.boxes.reduce((n,b)=>n+b.size[0]*b.size[1]*b.size[2],0)>this.truck.width*this.truck.depth*this.truck.height)throw Error('할당 상자의 총부피가 짐칸보다 큽니다. 다음 세대로 넘어가지 않습니다. 초기화 후 할당 개수를 줄이세요.');
    }
    const eligible=this.requireFullAllocation?this.population.filter(p=>p.evaluation.loaded===this.boxes.length):this.population;
    if(eligible.length) {
      const best=eligible.reduce((a,b)=>a.score>=b.score?a:b);
      next.push({...best,id:`g${this.generation+1}-i${++this.serial}`,generation:this.generation+1,parents:[best.id],operation:'엘리트',coords:best.coords.map(p=>[...p] as Vec)});
      this.allocationProgress.ready=next.length;this.allocationProgress.mostLoaded=best.evaluation.loaded;
    }
    while(next.length<this.settings.population) {
      if(++attempts>this.settings.population*120) throw Error(`할당 조건을 만족하는 유효 집단을 생성하지 못했습니다 (${next.length}/${this.settings.population}). 현재 세대는 유지됩니다. 초기화 후 입력·적재함·고정 배치를 확인하세요.`);
      this.allocationProgress.attempts=attempts;
      const child=this.population.length?this.offspring():null;
      // 최초 시도가 실패해 완전 후보가 하나도 없을 때만 초기화 전략을 전환한다.
      // 기존 초기 집단이 바로 생성되는 입력은 후보·난수 순서를 그대로 유지한다.
      rescueInitial ||= !this.population.length&&this.requireFullAllocation&&attempts>1&&!next.length&&!Object.keys(this.fixed).length;
      const rescue=rescueInitial;
      if(rescue)this.partitionMode=true;
      const candidate=this.population.length?child:rescue?this.rescuePack():(yield* packSteps(this.boxes,this.truck,this.rng,attempts===1?this.seedLayout:undefined,this.fixed,true,this.requireFullAllocation,this.requireFullAllocation));
      if(candidate) {
        this.allocationProgress.mostLoaded=Math.max(this.allocationProgress.mostLoaded,candidate.coords.filter(p=>p[0]>=0).length);
        let p=yield* this.evaluateSteps(candidate.coords,child?.parents??[],child?.operation??(rescue?'초기 구획 배치':'초기 무작위'),candidate.repaired,child?.loadOrder??candidate.loadOrder??this.rng.shuffle(this.boxes.map(b=>b.id)));
        // 완전 적재가 가능한 좌표라면 순서 유전자 복구도 시도한다. 평가기는 주어진 순서를 그대로 실행한다.
        if(!p&&this.requireFullAllocation&&candidate.coords.every(v=>v[0]>=0)){
          const order=child?.repairOrder??loadingOrder(this.boxes,candidate.coords,this.truck,this.fixed)??(this.priorityUnloading&&!Object.keys(this.fixed).length?dependencyLoadingOrder(this.boxes,candidate.coords):null);
          if(order)p=yield* this.evaluateSteps(candidate.coords,child?.parents??[],`${child?.operation??'초기 무작위'}·상차순서 복구`,candidate.repaired,[...this.boxes.filter(b=>this.fixed[b.id]).map(b=>b.id),...order]);
        }
        if(p) {this.diverseFailures=0;next.push(p);accepted++;this.allocationProgress.ready=next.length;}
      }
      yield;
    }
    this.population=next;this.generation++;
    return {...(this.priorityUnloading?{objective:'priority-unload' as const}:{}),number:this.generation,individuals:next,best:Math.max(...next.map(p=>p.score)),mean:next.reduce((a,b)=>a+b.score,0)/next.length,version:this.version,attempts,accepted,evaluations:this.evaluations,elapsed:performance.now()-start};
  }
  /** 현재 집단만 새 가중치로 평가한다. 이전 세대 스냅샷은 수정하지 않는다. */
  reweight(weights:Weights):Individual[] {
    validateConfig(this.boxes,this.truck,this.settings,weights);this.weights={...weights};this.version++;
    this.population=this.population.map(p=>({...p,score:this.priorityUnloading&&p.unloading?priorityFitness(p.evaluation,p.unloading,weights):loadingFitness(p.evaluation,weights),version:this.version}));return this.population;
  }
}
/** 동기 테스트·실험에서 세대 생성기를 끝까지 진행한다. */
export function finishGeneration(engine:Engine):Generation { const iter=engine.next();let r=iter.next();while(!r.done)r=iter.next();return r.value; }

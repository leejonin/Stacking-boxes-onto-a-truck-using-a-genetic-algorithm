import {generateBoxes,Random,type Box,type Vec,type Truck,type Individual} from '../domain/model';
import {type Placed,fits,blockers} from '../domain/packing';

/** 현재 배치에서 최소 규격 상자가 들어갈 위치를 면 좌표의 조합으로 지연 탐색한다. */
export function availableLoadingSlot(boxes:Box[],coords:Vec[],truck:Truck,requireAccessible=true):Vec|null {
  const placed:Placed[]=boxes.flatMap((box,i)=>coords[i]?.[0]>=0?[{box,pos:coords[i]}]:[]);
  const probe:Box={id:-1,size:[10,10,10],weight:.1,priority:1,grade:0};
  const xs=new Set([0,truck.width-10]),ys=new Set([0,truck.depth-10]),zs=new Set([0]);
  for(const p of placed){xs.add(p.pos[0]);xs.add(p.pos[0]+p.box.size[0]);xs.add(p.pos[0]-10);ys.add(p.pos[1]);ys.add(p.pos[1]+p.box.size[1]);ys.add(p.pos[1]-10);zs.add(p.pos[2]+p.box.size[2]);}
  // 전체 좌표 조합 배열을 만들지 않고 첫 유효 위치에서 반환한다.
  for(const z of [...zs].sort((a,b)=>a-b))for(const y of ys)for(const x of xs){
    const pos:Vec=[x,y,z];if(fits(probe,pos,placed,truck)&&(!requireAccessible||!blockers({box:probe,pos},placed).length))return pos;
  }
  return null;
}

/** 현재 개체에 최소 생성 규격도 추가할 수 없는지 검사한다. 기존 상자는 이동 가능하므로 입구 막힘만으로 완료하지 않는다. */
export function loadingComplete(boxes:Box[],individual:Individual,truck:Truck):boolean {
  return individual.evaluation.loadedVolume>=truck.width*truck.depth*truck.height||availableLoadingSlot(boxes,individual.evaluation.finalCoords,truck,false)===null;
}

/** 총 공급 개수를 정하지 않고 다음 탐색용 택배를 계속 생성한다. SW_Browser_Arrival_001 */
export class AutomaticSupply {
  round=1;private rng:Random;private nextId:number;
  constructor(public boxes:Box[],seed:number,public batchSize=20){
    if(!Number.isInteger(batchSize)||batchSize<1)throw Error('공급량은 1 이상의 정수여야 합니다.');
    this.rng=new Random(seed^0x51A771);this.nextId=boxes.reduce((max,b)=>Math.max(max,b.id),0)+1;
  }
  /** 실제 적재 부피가 짐칸 전체를 채운 경우만 종료한다. 세대·공급량·작은 틈은 완료 조건이 아니다. */
  expand(best:Individual,truck:Truck):Box[]|null {
    if(best.evaluation.loadedVolume>=truck.width*truck.depth*truck.height)return null;
    const incoming=generateBoxes(this.batchSize,this.rng.int(0,4294967295)).map(b=>({...b,id:this.nextId++}));
    this.boxes=[...this.boxes,...incoming];this.round++;return this.boxes;
  }
}

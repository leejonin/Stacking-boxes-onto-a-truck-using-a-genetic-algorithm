import { Random,type Box,type Vec,type Truck } from '../domain/model';
import { loadingOrder } from '../domain/packing';
/** 무작위 도착·40개 대기·확정 적재 좌표를 관리한다. SW_Browser_Arrival_001 */
export class Arrival {
  order:Box[];cursor=0;waiting:Box[]=[];loaded:Box[]=[];fixed:Record<number,Vec>={};log:string[]=[];
  constructor(boxes:Box[],seed:number) {this.order=new Random(seed).shuffle(boxes);}
  /** 한 상자를 도착시킨다. 공간이 가득 찼으면 원본 순서를 보존하며 보류한다. */
  receive():boolean {
    if(this.cursor>=this.order.length||this.waiting.length>=40)return false;
    const box=this.order[this.cursor++];this.waiting.push(box);this.log.push(`도착 ${this.cursor} · 상자 #${box.id}`);return true;
  }
  /** 선택 해답을 실제 상차 가능한 순서로 확정하고 기존 적재 좌표를 보존한다. */
  commit(boxes:Box[],coords:Vec[],truck:Truck):number[] {
    const expected=[...this.loaded,...this.waiting].map(b=>b.id).sort((a,b)=>a-b);
    if(expected.join(',')!==boxes.map(b=>b.id).sort((a,b)=>a-b).join(','))throw Error('현재 도착 목록과 선택 배치가 일치하지 않습니다.');
    const placed=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
    if(Object.keys(this.fixed).some(id=>!placed.some(p=>p.box.id===+id)))throw Error('기존 적재물을 누락할 수 없습니다.');
    const sequence=loadingOrder(placed.map(p=>p.box),placed.map(p=>p.pos),truck,this.fixed);
    if(!sequence)throw Error('기존 적재물을 움직이지 않는 직선 상차 경로가 없습니다.');
    placed.forEach(p=>{this.fixed[p.box.id]=[...p.pos];});
    this.loaded=placed.map(p=>p.box);this.waiting=boxes.filter(b=>!this.fixed[b.id]);this.log.push(`상차 확정 · ${sequence.map(id=>'#'+id).join(' → ')} · 잔여 ${this.waiting.length}개`);return sequence;
  }
}

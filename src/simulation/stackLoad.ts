import type {Box,Vec,Truck,StackLoadEvaluation} from '../domain/model';
import {validateLayout} from '../domain/packing';

/** 정적 상부 하중을 위에서 아래로 전달한다. 접촉 면적 비율로 분담하며 자기 무게 초과분을 kg 단위로 합산한다. */
export function evaluateStackLoad(boxes:Box[],coords:Vec[],truck:Truck):StackLoadEvaluation {
  const fail=(reason:string):StackLoadEvaluation=>({valid:false,reason,loads:[],excessMass:0});
  if(coords.length!==boxes.length||coords.some(p=>!p||p.length!==3||p.some(x=>!Number.isFinite(x))||p.some(x=>x<0)&&!p.every(x=>x===-1)))return fail('상자별 실제 적재 좌표가 올바르지 않습니다.');
  const placed=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
  const reason=validateLayout(placed.map(p=>p.box),placed.map(p=>p.pos),truck);if(reason)return fail(reason);
  const above=new Map(placed.map(p=>[p.box.id,0]));
  for(const upper of [...placed].sort((a,b)=>b.pos[2]-a.pos[2])){
    if(upper.pos[2]===0)continue;
    const contacts=placed.flatMap(lower=>{
      if(lower.pos[2]+lower.box.size[2]!==upper.pos[2])return [];
      const width=Math.max(0,Math.min(upper.pos[0]+upper.box.size[0],lower.pos[0]+lower.box.size[0])-Math.max(upper.pos[0],lower.pos[0]));
      const depth=Math.max(0,Math.min(upper.pos[1]+upper.box.size[1],lower.pos[1]+lower.box.size[1])-Math.max(upper.pos[1],lower.pos[1]));
      return width*depth>0?[{id:lower.box.id,area:width*depth}]:[];
    });
    const area=contacts.reduce((n,p)=>n+p.area,0),mass=upper.box.weight+above.get(upper.box.id)!;
    if(area===0)return fail('상부 하중을 지지할 접촉면이 없습니다.');
    for(const contact of contacts)above.set(contact.id,above.get(contact.id)!+mass*contact.area/area);
  }
  const loads=placed.map(p=>({boxId:p.box.id,aboveMass:above.get(p.box.id)!,excessMass:Math.max(0,above.get(p.box.id)!-p.box.weight)}));
  return {valid:true,reason:'',loads,excessMass:loads.reduce((n,p)=>n+p.excessMass,0)};
}

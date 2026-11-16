import { type Box, type Vec, type Truck, Random } from './model';
export type Placed = { box: Box; pos: Vec };
/** 열린 구간의 겹침: 면 접촉은 충돌이 아니다. */
export function interval(a: number, size: number, b: number, other: number): boolean { return a < b+other && b < a+size; }
/** 두 직육면체의 부피 겹침을 검사한다. */
export function collides(a: Placed,b: Placed): boolean {
  return interval(a.pos[0],a.box.size[0],b.pos[0],b.box.size[0])&&interval(a.pos[1],a.box.size[1],b.pos[1],b.box.size[1])&&interval(a.pos[2],a.box.size[2],b.pos[2],b.box.size[2]);
}
/** 밑면 전체가 같은 높이 지지면의 합집합에 포함되는지 검사한다. SW_Browser_Packing_001 */
export function supported(a: Placed, others: Placed[]): boolean {
  if(a.pos[2]===0) return true;
  const [x,y,z]=a.pos,[w,d]=a.box.size;
  const supports=others.filter(b=>b.box.id!==a.box.id && b.pos[2]+b.box.size[2]===z && interval(x,w,b.pos[0],b.box.size[0]) && interval(y,d,b.pos[1],b.box.size[1]));
  // 한 받침이 밑면 전체를 포함하면 합집합 분할을 만들 필요가 없다.
  if(supports.some(b=>b.pos[0]<=x&&b.pos[0]+b.box.size[0]>=x+w&&b.pos[1]<=y&&b.pos[1]+b.box.size[1]>=y+d))return true;
  if(supports.length===1&&w>0&&d>0)return false;
  if(!supports.length&&w>0&&d>0)return false;
  const xs=[...new Set([x,x+w,...supports.flatMap(b=>[Math.max(x,b.pos[0]),Math.min(x+w,b.pos[0]+b.box.size[0])])])].sort((a,b)=>a-b);
  for(let i=0;i<xs.length-1;i++) {
    const spans=supports.filter(b=>b.pos[0]<=xs[i] && b.pos[0]+b.box.size[0]>=xs[i+1]).map(b=>[Math.max(y,b.pos[1]),Math.min(y+d,b.pos[1]+b.box.size[1])]).sort((a,b)=>a[0]-b[0]);
    let end=y; for(const [start,stop] of spans) { if(start>end) return false; end=Math.max(end,stop); }
    if(end<y+d) return false;
  }
  return true;
}
/** 단일 후보의 경계·충돌·지지를 확인한다. */
export function fits(box: Box, pos: Vec, placed: Placed[], truck: Truck, supportLayer=placed): boolean {
  const [x,y,z]=pos;
  if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||x<0||y<0||z<0||x+box.size[0]>truck.width||y+box.size[1]>truck.depth||z+box.size[2]>truck.height)return false;
  const a={box,pos};
  if(!supported(a,supportLayer))return false;
  for(const b of placed)if(collides(a,b))return false;
  return true;
}
/** 전체 후보를 검사하고 고정된 좌표의 변경도 거부한다. */
export function validateLayout(boxes: Box[], coords: Vec[], truck: Truck, fixed: Record<number,Vec> = {}): string | null {
  if(coords.length!==boxes.length) return '모든 상자의 좌표가 필요합니다.';
  const all=boxes.map((box,i)=>({box,pos:coords[i]}));
  for(const a of all) {
    if(!a.pos || !fits(a.box,a.pos,all.filter(b=>b!==a),truck)) return `상자 ${a.box.id}: 경계·겹침·지지 위반`;
    if(fixed[a.box.id] && fixed[a.box.id].some((x,i)=>x!==a.pos[i])) return `상자 ${a.box.id}: 고정 좌표 변경`;
  }
  return null;
}
/** 출입구(y=0)까지의 직선 이동 경로를 막는 상자들을 반환한다. */
export function blockers(a: Placed, others: Placed[]): Placed[] {
  return others.filter(b=>b.box.id!==a.box.id && b.pos[1]<a.pos[1] && interval(a.pos[0],a.box.size[0],b.pos[0],b.box.size[0]) && interval(a.pos[2],a.box.size[2],b.pos[2],b.box.size[2]));
}
/** 직교곱 대신 각 축만 보관한다. 기존 후보의 순서와 범위는 그대로다. */
function candidateAxes(box:Box,placed:Placed[],truck:Truck):[number[],number[],number[]] {
  const xs=new Set([0,truck.width-box.size[0]]),ys=new Set([0,truck.depth-box.size[1]]),zs=new Set([0]);
  for(const b of placed) {
    xs.add(b.pos[0]);xs.add(b.pos[0]+b.box.size[0]);xs.add(b.pos[0]-box.size[0]);
    ys.add(b.pos[1]);ys.add(b.pos[1]+b.box.size[1]);ys.add(b.pos[1]-box.size[1]);zs.add(b.pos[2]+b.box.size[2]);
  }
  return [[...xs].filter(x=>x>=0&&x+box.size[0]<=truck.width),[...ys].filter(y=>y>=0&&y+box.size[1]<=truck.depth),[...zs].filter(z=>z+box.size[2]<=truck.height).sort((a,b)=>a-b)];
}
/** 전체 후보가 필요한 검사·호환 호출에만 좌표 배열을 만든다. */
export function candidates(box: Box, placed: Placed[], truck: Truck): Vec[] {
  const [xs,ys,zs]=candidateAxes(box,placed,truck),out:Vec[]=[];
  for(const z of zs)for(const y of ys)for(const x of xs)out.push([x,y,z]);
  return out;
}
/** 무작위 유효 위치를 선택하고 원본 배열은 보존한다. */
export function randomPosition(box: Box, placed: Placed[], truck: Truck, rng: Random, accessible = false, compact = false): Vec | null {
  const [xs,ys,zs]=candidateAxes(box,placed,truck);
  // 한 위치 탐색 동안 적재물은 고정이다. 같은 높이의 받침 목록을 반복 필터링하지 않는다.
  const layers=new Map<number,Placed[]>();
  for(const p of placed){const top=p.pos[2]+p.box.size[2],layer=layers.get(top);if(layer)layer.push(p);else layers.set(top,[p]);}
  const supportLayers=zs.map(z=>layers.get(z)??[]);
  // z→y→x의 기존 정렬은 각 축 정렬과 같다. 거대한 좌표 배열은 만들지 않는다.
  if(compact){xs.sort((a,b)=>a-b);ys.sort((a,b)=>b-a);}
  const plane=xs.length*ys.length,total=plane*zs.length,start=!compact&&total?rng.int(0,total-1):0,pos:Vec=[0,0,0];
  for(let k=0;k<total;k++) {
    const index=(start+k)%total;pos[0]=xs[index%xs.length];pos[1]=ys[Math.floor(index/xs.length)%ys.length];pos[2]=zs[Math.floor(index/plane)];
    if(fits(box,pos,placed,truck,supportLayers[Math.floor(index/plane)])&&(!accessible||!blockers({box,pos},placed).length))return pos;
  }
  return null;
}
/** 좌표 유전자를 우선 배치하고 무효 부분만 재배치한다. 고정 상자는 보존한다. */
export function pack(boxes: Box[], truck: Truck, rng: Random, preferred?: Vec[], fixed: Record<number,Vec> = {}, allowPartial=false, compact=false): {coords:Vec[];repaired:boolean} | null {
  const placed:Placed[]=[], coords:Vec[]=new Array(boxes.length); let repaired=false;
  const fixedIndices=boxes.map((_,i)=>i).filter(i=>fixed[boxes[i].id]);
  for(const i of fixedIndices) { coords[i]=[...fixed[boxes[i].id]];placed.push({box:boxes[i],pos:coords[i]}); }
  if(validateLayout(placed.map(p=>p.box),placed.map(p=>p.pos),truck)) return null;
  const indices=rng.shuffle(boxes.map((_,i)=>i).filter(i=>!fixed[boxes[i].id]));
  // 부모의 낮은 상자부터 놓아 지지면을 우선 보존한다.
  if(preferred) indices.sort((a,b)=>(preferred[a]?.[2]??0)-(preferred[b]?.[2]??0));
  for(const i of indices) {
    const wish=preferred?.[i]; let pos:Vec|null=wish&&fits(boxes[i],wish,placed,truck)?[...wish]:null;
    if(!pos) {pos=randomPosition(boxes[i],placed,truck,rng,false,compact);if(wish) repaired=true;}
    if(!pos) {if(allowPartial){coords[i]=[-1,-1,-1];repaired=true;continue;}return null;}
    coords[i]=pos;placed.push({box:boxes[i],pos});
  }
  return {coords,repaired};
}
/** 기존 적재물을 움직이지 않고 입구에서 넣을 수 있는 상차 순서를 구한다. */
export function loadingOrder(boxes: Box[], coords: Vec[], truck: Truck, fixed: Record<number,Vec> = {}): number[] | null {
  if(validateLayout(boxes,coords,truck,fixed)) return null;
  const placed=boxes.flatMap((box,i)=>fixed[box.id]?[{box,pos:coords[i]}]:[]);
  const waiting=boxes.map((box,i)=>({box,pos:coords[i]})).filter(p=>!fixed[p.box.id]).sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]||a.box.id-b.box.id); const order:number[]=[];
  while(waiting.length) {
    const i=waiting.findIndex(p=>fits(p.box,p.pos,placed,truck)&&!blockers(p,placed).length);
    if(i<0) return null;
    const [p]=waiting.splice(i,1);placed.push(p);order.push(p.box.id);
  }
  return order;
}

import { type Box, type Vec, type Truck, Random } from './model';
export type Placed = { box: Box; pos: Vec };
/** 열린 구간의 겹침: 면 접촉은 충돌이 아니다. */
export function interval(a: number, size: number, b: number, other: number): boolean { return a < b+other && b < a+size; }
/** 두 직육면체의 부피 겹침을 검사한다. */
export function collides(a: Placed,b: Placed): boolean { return a.pos.every((v,i)=>interval(v,a.box.size[i],b.pos[i],b.box.size[i])); }
/** 밑면 전체가 같은 높이 지지면의 합집합에 포함되는지 검사한다. SW_Browser_Packing_001 */
export function supported(a: Placed, others: Placed[]): boolean {
  if(a.pos[2]===0) return true;
  const [x,y,z]=a.pos,[w,d]=a.box.size;
  const supports=others.filter(b=>b.box.id!==a.box.id && b.pos[2]+b.box.size[2]===z && interval(x,w,b.pos[0],b.box.size[0]) && interval(y,d,b.pos[1],b.box.size[1]));
  const xs=[...new Set([x,x+w,...supports.flatMap(b=>[Math.max(x,b.pos[0]),Math.min(x+w,b.pos[0]+b.box.size[0])])])].sort((a,b)=>a-b);
  for(let i=0;i<xs.length-1;i++) {
    const spans=supports.filter(b=>b.pos[0]<=xs[i] && b.pos[0]+b.box.size[0]>=xs[i+1]).map(b=>[Math.max(y,b.pos[1]),Math.min(y+d,b.pos[1]+b.box.size[1])]).sort((a,b)=>a[0]-b[0]);
    let end=y; for(const [start,stop] of spans) { if(start>end) return false; end=Math.max(end,stop); }
    if(end<y+d) return false;
  }
  return true;
}
/** 단일 후보의 경계·충돌·지지를 확인한다. */
export function fits(box: Box, pos: Vec, placed: Placed[], truck: Truck): boolean {
  if(pos.some((v,i)=>!Number.isInteger(v)||v<0||v+box.size[i]>[truck.width,truck.depth,truck.height][i])) return false;
  const a={box,pos}; return !placed.some(b=>collides(a,b))&&supported(a,placed);
}
/** 전체 후보를 검사하고 고정된 좌표의 변경도 거부한다. */
export function validateLayout(boxes: Box[], coords: Vec[], truck: Truck, fixed: Record<number,Vec> = {}): string | null {
  if(coords.length!==boxes.length) return '모든 상자의 좌표가 필요합니다.';
  if(new Set(boxes.map(b=>b.id)).size!==boxes.length)return '동일한 상자 ID를 중복 배치할 수 없습니다.';
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
/** 현재 면 좌표와 벽을 기준으로 정수 후보 위치를 만든다. */
export function candidates(box: Box, placed: Placed[], truck: Truck): Vec[] {
  const xs=new Set([0,truck.width-box.size[0]]),ys=new Set([0,truck.depth-box.size[1]]),zs=new Set([0]);
  for(const b of placed) {
    xs.add(b.pos[0]);xs.add(b.pos[0]+b.box.size[0]);xs.add(b.pos[0]-box.size[0]);
    ys.add(b.pos[1]);ys.add(b.pos[1]+b.box.size[1]);ys.add(b.pos[1]-box.size[1]);zs.add(b.pos[2]+b.box.size[2]);
  }
  const out: Vec[]=[];
  for(const z of [...zs].sort((a,b)=>a-b)) for(const y of ys) for(const x of xs) {
    if(x>=0 && y>=0 && x+box.size[0]<=truck.width && y+box.size[1]<=truck.depth && z+box.size[2]<=truck.height) out.push([x,y,z]);
  }
  return out;
}
/** 무작위 유효 위치를 선택하고 원본 배열은 보존한다. */
export function randomPosition(box: Box, placed: Placed[], truck: Truck, rng: Random, accessible = false): Vec | null {
  const options=candidates(box,placed,truck), start=options.length?rng.int(0,options.length-1):0;
  for(let k=0;k<options.length;k++) { const pos=options[(start+k)%options.length]; if(fits(box,pos,placed,truck) && (!accessible||!blockers({box,pos},placed).length)) return pos; }
  return null;
}
/** 좌표 유전자를 우선 배치하고 무효 부분만 재배치한다. 고정 상자는 보존한다. */
export function pack(boxes: Box[], truck: Truck, rng: Random, preferred?: Vec[], fixed: Record<number,Vec> = {}, allowPartial=false): {coords:Vec[];repaired:boolean} | null {
  const placed:Placed[]=[], coords:Vec[]=new Array(boxes.length); let repaired=false;
  const fixedIndices=boxes.map((_,i)=>i).filter(i=>fixed[boxes[i].id]);
  for(const i of fixedIndices) { coords[i]=[...fixed[boxes[i].id]];placed.push({box:boxes[i],pos:coords[i]}); }
  if(validateLayout(placed.map(p=>p.box),placed.map(p=>p.pos),truck)) return null;
  const indices=rng.shuffle(boxes.map((_,i)=>i).filter(i=>!fixed[boxes[i].id]));
  // 부모의 낮은 상자부터 놓아 지지면을 우선 보존한다.
  if(preferred) indices.sort((a,b)=>(preferred[a]?.[0]>=0?preferred[a][2]:Infinity)-(preferred[b]?.[0]>=0?preferred[b][2]:Infinity));
  for(const i of indices) {
    const wish=preferred?.[i]; let pos:Vec|null=wish&&fits(boxes[i],wish,placed,truck)?[...wish]:null;
    if(!pos) {pos=randomPosition(boxes[i],placed,truck,rng);if(wish) repaired=true;}
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

# SW_Browser_Packing_001 — 배치검사

> 2026-11-16 21:20:39 (KST) 현재 기준: 현재 실행은 첫 배포 상차 기준이며 상자 할당 입력만 유지한다. 이후 기능 설명은 당시 기록일 수 있으며 최신 기준은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`.

- 버전: v0.0.3
- 최초 작성 일시: 2026-11-16 12:49:10 (KST)
- 수정 일시: 2026-11-16 13:13:21 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Packing_001
- 분류: 소프트웨어 / 배치검사 (영문 식별자 Packing)
- 실행환경: Browser. 기술 버전은 프로젝트 루트 기준 `Info/기술환경.md`.
- 관련 ID: 001 및 `Info/기능_ID_목록.md`의 관련 기능.
- 상태: 구현 코드 확인·수치/빌드 검증. 브라우저 직접 조작은 미확인.

## 목적·목표와 역할

Box·Vec·Truck 등 공통 입력과 5등급 상자 생성, 경계·겹침·밑면 합집합 지지 검사, 고정 배치 보존, 후보 위치 생성과 부분 배치를 담당한다.

목표는 사용자 승인된 상차 적재량 개선과 재배치 감소를 실제 상차 계산·화면에 일치시키는 것이다.

## 호출·입력·출력·처리 순서

generateBoxes(count,seed)는 1 이상의 정수 개수 입력과 uint32 seed로 목록을 만들고 validateConfig가 UI·Engine 진입 입력을 검사한다. fits와 supported는 단일 배치, validateLayout은 전체 좌표, pack은 선호 좌표 보존 후 재배치 결과 또는 null을 반환한다. allowPartial=true면 공간이 없는 상자를 (-1,-1,-1)로 남긴다.

Loading·Evolution·Arrival에서 같은 검사기를 재사용한다. loadingOrder는 고정 적재를 보존하는 실행 가능한 순서를 구해 상차 확정에 사용한다.

소스의 타입 정의는 필수 매개변수·단위·반환값의 실제 근거다. 위치는 정수 cm, 중량은 kg, 비율은 0~1이다. 예외·실패 분기는 아래 실제 코드와 같다. Loading 평가의 valid=false, 위치 생성 실패의 null, UI/Worker 예외 메시지를 서로 구별한다.

## 수정 전후·확인 범위

이전 전체 실행은 하차 비용을 평가했다. 이번에는 상차 순서·위치와 실제 적재량을 평가하며 하차 모듈은 앱·GA·실험에서 호출하지 않는다. 기존 하차 소스와 해당 회귀 테스트는 삭제하지 않고 보존했다. 테스트 20개·빌드 통과. 대표 실행과 비교 결과는 `Info/report/2026-11-16/124910_상차전환검증_report.md`.

## 실제 코드와 함수별 설명

아래는 작성 시점의 파일 전체다. 함수별 주석·시그니처와 분기·타입을 보존하며, 구현되지 않은 의사 코드가 아니다.

### `src/domain/model.ts`

```tsx
/** 배치 계산 공통 자료형. SW_Browser_Packing_001 */
export type Vec = [number, number, number];
export interface Box { id: number; size: Vec; weight: number; priority: number; grade: number }
export interface Truck { width: number; depth: number; height: number }
export interface Weights { base: number; moves: number; mass: number; space?: number }
export interface Settings { population: number; generations: number; crossover: number; mutation: number; tournament: number; seed: number }
export interface MoveEvent { kind: 'out' | 'return' | 'deliver' | 'load'; boxId: number; from: Vec | null; to: Vec | null; moves: number; mass: number }
export interface Evaluation { valid: boolean; reason: string; moves: number; mass: number; delivered: number; events: MoveEvent[] }
export interface LoadingEvaluation {valid:boolean;reason:string;moves:number;mass:number;loaded:number;loadedVolume:number;totalVolume:number;coverage:number;utilization:number;compactness:number;unloadedIds:number[];events:MoveEvent[];finalCoords:Vec[]}
export interface Individual { id: string; generation: number; parents: string[]; operation: string; repaired: boolean; coords: Vec[]; loadOrder:number[]; evaluation: Omit<LoadingEvaluation, 'events'>; score: number; version: number }
export interface Generation { number: number; individuals: Individual[]; best: number; mean: number; version: number; attempts: number; accepted: number; evaluations: number; elapsed: number; boxes?:Box[];fixed?:Record<number,Vec>;round?:number }
export const GRADES = [{name:'극소형', sum:80, mass:2}, {name:'소형', sum:100, mass:5}, {name:'중형', sum:120, mass:10}, {name:'대형', sum:140, mass:15}, {name:'특대형', sum:160, mass:20}];
export const DEFAULT_WEIGHTS: Weights = { base: 100, moves: 10, mass: 1, space:20 };
export const DEFAULT_SETTINGS: Settings = { population: 50, generations: 100, crossover: .9, mutation: .05, tournament: 3, seed: 2026 };
export const DEFAULT_TRUCK: Truck = { width: 220, depth: 520, height: 220 };

/** 재현 가능한 난수와 순열을 생성한다. 내부 상태는 일시정지 중 유지한다. */
export class Random {
  constructor(public state: number) { this.state >>>= 0; }
  /** 0 이상 1 미만의 난수를 반환한다. */
  next(): number { let t = this.state += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  /** 양 끝을 포함한 정수를 반환한다. */
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  /** 원본을 바꾸지 않고 배열의 순서를 섞는다. */
  shuffle<T>(items: T[]): T[] { const a = [...items]; for (let i=a.length-1;i>0;i--) { const j=this.int(0,i); [a[i],a[j]]=[a[j],a[i]]; } return a; }
}
/** 크기와 중량을 모두 수용하는 최소 등급을 반환한다. -1은 규격 초과다. */
export function gradeOf(size: Vec, weight: number): number {
  if (size.some(x => !Number.isInteger(x) || x <= 0 || x > 100) || !Number.isFinite(weight) || weight <= 0) return -1;
  return GRADES.findIndex(g => size.reduce((a,b)=>a+b,0) <= g.sum && weight <= g.mass);
}
/** 상자별 등급을 균등 추첨하고 해당 최종 등급과 일치하는 치수·중량을 생성한다. */
export function generateBoxes(count: number, seed: number): Box[] {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw Error('상자 수는 1 이상의 정수, seed는 0~4294967295 정수여야 합니다.');
  const rng = new Random(seed);
  return Array.from({length: count}, (_,i) => {
    const grade = rng.int(0,4), limit = GRADES[grade];
    for (let attempt=0;attempt<10000;attempt++) {
      const size: Vec = [rng.int(10,100),rng.int(10,100),rng.int(10,100)];
      if (size.reduce((a,b)=>a+b,0) > limit.sum) continue;
      const weight = rng.int(1,limit.mass*10)/10;
      if (gradeOf(size,weight) === grade) return {id:i+1,size,weight,grade,priority:rng.int(10,50)/10};
    }
    throw Error('규격 내 상자 생성 재시도 한도를 초과했습니다.');
  });
}
/** 사용자 설정의 경계와 유한성을 확인한다. */
export function validateConfig(boxes: Box[], truck: Truck, settings: Settings, weights: Weights): void {
  if (!boxes.length || new Set(boxes.map(b=>b.id)).size !== boxes.length) throw Error('상자 목록이 비어 있거나 ID가 중복됩니다.');
  if ([truck.width,truck.depth,truck.height].some(n=>!Number.isInteger(n)||n<10||n>2000)) throw Error('적재함 치수는 10~2000cm 정수여야 합니다.');
  if (boxes.some(b=>gradeOf(b.size,b.weight)<0 || !Number.isFinite(b.priority) || b.priority<1 || b.priority>5)) throw Error('상자 규격 또는 우선도가 올바르지 않습니다.');
  if (!Number.isInteger(settings.population)||settings.population<2||settings.population>100 || !Number.isInteger(settings.generations)||settings.generations<1||settings.generations>300 || !Number.isInteger(settings.tournament)||settings.tournament<2||settings.tournament>settings.population || [settings.crossover,settings.mutation].some(n=>!Number.isFinite(n)||n<0||n>1) || !Number.isInteger(settings.seed) || settings.seed<0 || settings.seed>4294967295) throw Error('집단 2~100, 세대 1~300, k 2~집단 수, 교차·변이율 0~1, seed 범위를 확인하세요.');
  if (Object.values(weights).some(n=>!Number.isFinite(n))||weights.base<0||weights.moves<0||weights.mass<0||(weights.space??0)<0) throw Error('가중치는 유한한 0 이상의 숫자여야 합니다.');
}
```

함수·구성요소 역할(실제 문서화 주석):
- `export class Random`: 배치 계산 공통 자료형. SW_Browser_Packing_001 */ export type Vec = [number, number, number]; export interface Box { id: number; size: Vec; weight: number; priority: number; grade: number } export interface Truck { width: number; depth: number; height: number } export interface Weights { base: number; moves: number; mass: number; space?: number } export interface Settings { population: number; generations: number; crossover: number; mutation: number; tournament: number; seed: number } export interface MoveEvent { kind: 'out' | 'return' | 'deliver' | 'load'; boxId: number; from: Vec | null; to: Vec | null; moves: number; mass: number } export interface Evaluation { valid: boolean; reason: string; moves: number; mass: number; delivered: number; events: MoveEvent[] } export interface LoadingEvaluation {valid:boolean;reason:string;moves:number;mass:number;loaded:number;loadedVolume:number;totalVolume:number;coverage:number;utilization:number;compactness:number;unloadedIds:number[];events:MoveEvent[];finalCoords:Vec[]} export interface Individual { id: string; generation: number; parents: string[]; operation: string; repaired: boolean; coords: Vec[]; loadOrder:number[]; evaluation: Omit<LoadingEvaluation, 'events'>; score: number; version: number } export interface Generation { number: number; individuals: Individual[]; best: number; mean: number; version: number; attempts: number; accepted: number; evaluations: number; elapsed: number } export const GRADES = [{name:'극소형', sum:80, mass:2}, {name:'소형', sum:100, mass:5}, {name:'중형', sum:120, mass:10}, {name:'대형', sum:140, mass:15}, {name:'특대형', sum:160, mass:20}]; export const DEFAULT_WEIGHTS: Weights = { base: 100, moves: 10, mass: 1, space:20 }; export const DEFAULT_SETTINGS: Settings = { population: 50, generations: 100, crossover: .9, mutation: .05, tournament: 3, seed: 2026 }; export const DEFAULT_TRUCK: Truck = { width: 220, depth: 520, height: 220 };  /** 재현 가능한 난수와 순열을 생성한다. 내부 상태는 일시정지 중 유지한다.
- `next(): number`: 0 이상 1 미만의 난수를 반환한다.
- `int(min: number, max: number): number`: 양 끝을 포함한 정수를 반환한다.
- `export function gradeOf(size: Vec, weight: number): number`: 원본을 바꾸지 않고 배열의 순서를 섞는다. */   shuffle<T>(items: T[]): T[] { const a = [...items]; for (let i=a.length-1;i>0;i--) { const j=this.int(0,i); [a[i],a[j]]=[a[j],a[i]]; } return a; } } /** 크기와 중량을 모두 수용하는 최소 등급을 반환한다. -1은 규격 초과다.
- `export function generateBoxes(count: number, seed: number): Box[]`: 상자별 등급을 균등 추첨하고 해당 최종 등급과 일치하는 치수·중량을 생성한다.
- `export function validateConfig(boxes: Box[], truck: Truck, settings: Settings, weights: Weights): void`: 사용자 설정의 경계와 유한성을 확인한다.

### `src/domain/packing.ts`

```tsx
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
export function randomPosition(box: Box, placed: Placed[], truck: Truck, rng: Random, accessible = false, compact = false): Vec | null {
  const options=candidates(box,placed,truck);
  // 완전 할당 후보는 바닥·안쪽부터 채워 무작위 산재로 생기는 자투리 공간을 줄인다.
  if(compact)options.sort((a,b)=>a[2]-b[2]||b[1]-a[1]||a[0]-b[0]);
  const start=!compact&&options.length?rng.int(0,options.length-1):0;
  for(let k=0;k<options.length;k++) { const pos=options[(start+k)%options.length]; if(fits(box,pos,placed,truck) && (!accessible||!blockers({box,pos},placed).length)) return pos; }
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
```

함수·구성요소 역할(실제 문서화 주석):
- `export function interval(a: number, size: number, b: number, other: number): boolean`: 열린 구간의 겹침: 면 접촉은 충돌이 아니다.
- `export function collides(a: Placed,b: Placed): boolean`: 두 직육면체의 부피 겹침을 검사한다.
- `export function supported(a: Placed, others: Placed[]): boolean`: 밑면 전체가 같은 높이 지지면의 합집합에 포함되는지 검사한다. SW_Browser_Packing_001
- `export function fits(box: Box, pos: Vec, placed: Placed[], truck: Truck): boolean`: 단일 후보의 경계·충돌·지지를 확인한다.
- `export function validateLayout(boxes: Box[], coords: Vec[], truck: Truck, fixed: Record<number,Vec> =`: 전체 후보를 검사하고 고정된 좌표의 변경도 거부한다.
- `export function blockers(a: Placed, others: Placed[]): Placed[]`: 출입구(y=0)까지의 직선 이동 경로를 막는 상자들을 반환한다.
- `export function candidates(box: Box, placed: Placed[], truck: Truck): Vec[]`: 현재 면 좌표와 벽을 기준으로 정수 후보 위치를 만든다.
- `export function randomPosition(box: Box, placed: Placed[], truck: Truck, rng: Random, accessible = false): Vec | null`: 무작위 유효 위치를 선택하고 원본 배열은 보존한다.
- `export function pack(boxes: Box[], truck: Truck, rng: Random, preferred?: Vec[], fixed: Record<number,Vec> =`: 좌표 유전자를 우선 배치하고 무효 부분만 재배치한다. 고정 상자는 보존한다.
- `export function loadingOrder(boxes: Box[], coords: Vec[], truck: Truck, fixed: Record<number,Vec> =`: 기존 적재물을 움직이지 않고 입구에서 넣을 수 있는 상차 순서를 구한다.

## 2026-11-16 13:00:16 (KST) 추가 수정

generateBoxes의 120개 상한을 제거하고 양의 정수만 검사한다. 240개 생성에서 길이·마지막 ID·등급·동일 seed 재현을 확인했다.

## 2026-11-16 13:13:21 (KST) — 공급회차별세대자료형

세대 스냅샷에 공급 회차·당시 상자 목록·고정 좌표를 추가했다.

총량 상한은 두지 않으며 최초 18개·추가 8개는 처리 묶음이다. 테스트 23개와 빌드가 통과했다. 브라우저 직접 검증은 미확인이다.
## 2026-11-16 19:27:59 (KST) 공급량 설정과 즉시 공급

최신 동작과 검증은 `Info/plan/2026-11-16/192759_공급량설정과소진즉시공급_plan.md`에 기록했다. 초기·추가 공급은 기본 20개이며 사용자가 양의 정수로 설정한다. 모든 상자를 실은 후보가 나오면 즉시 다음 회차로 연결한다. 세대의 localNumber로 조기 전환 시 누적 세대와 회차 내 세대를 구별한다.

## 2026-11-16 19:40:12 (KST) 누적 상차 유지

최신 누적 처리와 함수 호출·검증·한계는 `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md`에 기록했다. 자동 공급에서는 기존 상자 ID를 보존하면서 좌표 이동을 허용하며, 이번 회차에서 움직인 상자당 1회·해당 중량을 기존 누적 비용에 더한다. 함수 입력·반환값과 실제 처리 순서는 위 코드의 주석·자료형을 따른다.

- 2026-11-16 19:42:17 (KST) 최종 완료 조건: 자동 공급은 적재 부피100%일 때만 즉시 완료하며 가득 찬 개체를 표시한다. 작은 틈·세대 예산·공급량 소진으로 완료하지 않는다. 전체33개 테스트와 빌드 성공. 기준과 한계: `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md`.

- 2026-11-16 20:00:45 (KST) 3세대 정체 수정·ID 중복과 공간 겹침 금지: 기존 선호 좌표 우선, 실제 적재 상태에서 추가 상차 변이, 일부 자식 순서 유전자 복구, 최종 적재 검증을 적용했다.41개 테스트·빌드 성공. 실제 Worker3세대 최고점수 개체28개 적재. 상세: `Info/plan/2026-11-16/200045_3세대상차정체와중복겹침금지_plan.md`.

## 2026-11-16 20:04:38 (KST) 상자 ID 최종 기준

서로 다른 상자는 전체 입력·추가 공급에서 고유 ID를 사용하고 같은 상자는 세대·재배치 후에도 ID를 유지한다. 앞선 한 배치라는 표현으로 요구를 한정하지 않는다. 기존 구현은 이 기준을 유지한다. 확인 근거·강화한 검사: `Info/plan/2026-11-16/200438_상자ID전체공급고유성기준확정_plan.md`.

- 2026-11-16 20:05:01 (KST) 검증 완료: 공급 회귀 검사1개 통과.6회 추가 공급 전체66개 ID 유일성, 매 회차 이전 상자의 ID·데이터 보존, 신규 ID와 전체 기존 ID 비중복, seed재현성 확인. 실행 소스 변경 없음. 기존41개 전체 검사 결과를 새로 실행한 것으로 주장하지 않는다. 문서·검사 변경만 Public main에 반영한다.

## 2026-11-16 20:16:09 (KST) 짐칸 활용률 보상과 세대 상차 완료

기본 최대50점의 실제 짐칸 부피 활용률 보상과 입력·재적용을 추가했다. 추가 적재 공간 없음은 세대 상차 완료이며 다음 세대로 진화한다. 전체 완료는 설정 부피 목표(기본100%, 남은0%)에서 수행한다. 이전 공간 없음 즉시 전체 완료 동작은 이번 사용자 확정으로 대체한다.43개 테스트·빌드 성공. 자세한 입력·호출·검증·한계는 `Info/plan/2026-11-16/201609_짐칸활용률보상과세대상차완료_plan.md`.

## 2026-11-16 20:53:14 (KST) 현재 목적·입출력·호출·검증

하차 우선순위는 고정하고 방해 상자의 이동 횟수와 이동 중량을 최소화하는 배치를 탐색한다. 상부 하중은 별도 안정성 항목이다. 소스 타입·함수 주석과 실제 분기가 입력·단위·반환값·예외의 기준이며 구현 코드 전체를 위에 보존했다. Engine.evaluate→실제 상차→simulateLoaded 및 evaluateStackLoad→unloadingFitness, Worker와 비교 실험에서 호출한다. App은 동일 하차 평가기를3D 재생에 사용한다. 실제 적재물만 하차하고 미적재는 별도 표시한다.

총51개 검사·빌드 성공 및 소형27조건 비교 실험 예산 일치를 확인했다. 직접 브라우저 조작 미확인, 하중은 kg 상당의 사용자 정의 근사 규칙이다. 상세 계산·전후 변경·실측값·한계·관련기능은 `Info/plan/2026-11-16/205314_우선순위하차최적화와상부하중평가_plan.md`. 이전 상차 목적·하차 보류 기록은 당시 기록이며 이번 확정으로 대체한다.

## 2026-11-16 21:20:39 (KST) 첫 배포 복원

사용자가 첫 배포 상차 버전으로 복원하고 상자 할당 입력만 유지하도록 명시했다. 위 코드 스냅샷은 현재 복원본이다.24개 테스트·빌드 성공. 상세 복원 범위·초기값·제한·관련 기록은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`. 이전 구현·검증·보류·재승인은 당시 기록으로 보존하고 현재 동작 주장으로 사용하지 않는다.


## 2026-11-16 23:55:04 (KST) 첫 세대 지연 수정

전체 코드 스냅샷을 현재 소스와 맞췄다. 비기본35개 지연 재현·compact 배치 보완·준비 진행률과 시도 표시. 목적·세대 완료 조건·재이동 정의 유지. 상세 결과와 한계: `Info/plan/2026-11-16/235504_1세대지연과비기본설정검증_plan.md`.34개 테스트·빌드 통과.

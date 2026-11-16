/** 배치 계산 공통 자료형. SW_Browser_Packing_001 */
export type Vec = [number, number, number];
export interface Box { id: number; size: Vec; weight: number; priority: number; grade: number }
export interface Truck { width: number; depth: number; height: number }
export interface Weights { base: number; moves: number; mass: number; space?: number }
export interface Settings { population: number; generations: number; crossover: number; mutation: number; tournament: number; seed: number }
export interface MoveEvent { kind: 'out' | 'return' | 'deliver' | 'load'; boxId: number; from: Vec | null; to: Vec | null; moves: number; mass: number }
export interface Evaluation { valid: boolean; reason: string; moves: number; mass: number; delivered: number; events: MoveEvent[] }
export interface LoadingEvaluation {valid:boolean;reason:string;moves:number;mass:number;loaded:number;loadedVolume:number;totalVolume:number;coverage:number;utilization:number;compactness:number;unloadedIds:number[];events:MoveEvent[];finalCoords:Vec[]}
export interface Individual { id: string; generation: number; parents: string[]; operation: string; repaired: boolean; coords: Vec[]; loadOrder:number[]; unloadOrder?:number[]; unloading?:Omit<Evaluation,'events'>; evaluation: Omit<LoadingEvaluation, 'events'>; score: number; version: number }
export interface Generation { number: number; individuals: Individual[]; best: number; mean: number; version: number; attempts: number; accepted: number; evaluations: number; elapsed: number; boxes?:Box[];fixed?:Record<number,Vec>;round?:number;weights?:Weights;settings?:Settings;objective?:'priority-unload' }
export const GRADES = [{name:'극소형', sum:80, mass:2}, {name:'소형', sum:100, mass:5}, {name:'중형', sum:120, mass:10}, {name:'대형', sum:140, mass:15}, {name:'특대형', sum:160, mass:20}];
export const DEFAULT_WEIGHTS: Weights = { base: 100, moves: 10, mass: 1, space:20 };
export const DEFAULT_SETTINGS: Settings = { population: 50, generations: 100, crossover: .9, mutation: .05, tournament: 3, seed: 2026 };
export const DEFAULT_TRUCK: Truck = { width: 220, depth: 520, height: 220 };

export interface NumericRange {min:number;max:number;integer?:boolean}
/** 화면·Worker·단계 검사에서 공유하는 현재 허용 범위. */
export const CONFIG_RANGES={weight:{min:1,max:501},population:{min:0,max:101,integer:true},generations:{min:1,max:10001,integer:true},crossover:{min:.1,max:1.1},mutation:{min:.01,max:1},tournament:{min:1,max:6,integer:true}} satisfies Record<string,NumericRange>;

/** 한 실행의 최초 입력·자동 공급을 합친 상자 범위. */
export const MIN_BOXES=1,MAX_BOXES=400;
/** 입력 편집 후 확정할 정수 개수와 사용자 경고를 반환한다. */
export function normalizeBoxCount(value:number):{value:number;warning:string} {
 const count=Number.isFinite(value)?Math.max(MIN_BOXES,Math.min(MAX_BOXES,Math.trunc(value))):MIN_BOXES;
 return {value:count,warning:count===value?'':`상자 수는 ${MIN_BOXES}~${MAX_BOXES}개 정수입니다. ${count}개로 변경했습니다.`};
}
/** 수량·seed가 바뀌면 실제 목록을 새로 만들고, 같으면 편집한 우선도를 보존한다. */
export function resolveBoxInput(count:number,seed:number,previous:{count:number;seed:number;boxes:Box[]}):Box[] {
 return previous.count===count&&previous.seed===seed?previous.boxes:generateBoxes(count,seed);
}

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
  if (!Number.isInteger(count) || count < MIN_BOXES || count > MAX_BOXES || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw Error('상자 수는 1~400 정수, seed는 0~4294967295 정수여야 합니다.');
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
  if (boxes.length<MIN_BOXES||boxes.length>MAX_BOXES)throw Error('상자 수는 누적 1~400개여야 합니다.');
  if (!boxes.length || new Set(boxes.map(b=>b.id)).size !== boxes.length) throw Error('상자 목록이 비어 있거나 ID가 중복됩니다.');
  if ([truck.width,truck.depth,truck.height].some(n=>!Number.isInteger(n)||n<10||n>2000)) throw Error('적재함 치수는 10~2000cm 정수여야 합니다.');
  if (boxes.some(b=>gradeOf(b.size,b.weight)<0 || !Number.isFinite(b.priority) || b.priority<1 || b.priority>5)) throw Error('상자 규격 또는 우선도가 올바르지 않습니다.');
  if (!Number.isInteger(settings.population)||settings.population<1||settings.population>CONFIG_RANGES.population.max || !Number.isInteger(settings.generations)||settings.generations<1||settings.generations>CONFIG_RANGES.generations.max || !Number.isInteger(settings.tournament)||settings.tournament<CONFIG_RANGES.tournament.min||settings.tournament>CONFIG_RANGES.tournament.max || (!Number.isFinite(settings.crossover)||settings.crossover<0||settings.crossover>CONFIG_RANGES.crossover.max)||(!Number.isFinite(settings.mutation)||settings.mutation<0||settings.mutation>1) || !Number.isInteger(settings.seed) || settings.seed<0 || settings.seed>4294967295) throw Error('실행 집단 1~101, 세대 1~10001, k 1~6, 교차율 0~1.1, 변이율 0~1, 난수값 범위를 확인하세요.');
  if (Object.values(weights).some(n=>!Number.isFinite(n))||weights.base<0||weights.moves<0||weights.mass<0||(weights.space??0)<0) throw Error('가중치는 유한한 0 이상의 숫자여야 합니다.');
}

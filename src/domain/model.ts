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
export interface Generation { number: number; localNumber?:number; individuals: Individual[]; best: number; mean: number; version: number; attempts: number; accepted: number; evaluations: number; elapsed: number; boxes?:Box[];fixed?:Record<number,Vec>;round?:number }
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

import type {LoadingEvaluation,Evaluation,Weights} from '../domain/model';
/** 전량 적재 보상·공간 집중도를 유지하고 우선순 하차의 재이동 비용을 감점한다. */
export function priorityFitness(loading:Pick<LoadingEvaluation,'valid'|'coverage'|'compactness'>,unloading:Pick<Evaluation,'valid'|'moves'|'mass'>,w:Weights):number {
 return loading.valid&&unloading.valid?Math.round((w.base*loading.coverage+(w.space??20)*loading.compactness-w.moves*unloading.moves-w.mass*unloading.mass)*100)/100:-Infinity;
}

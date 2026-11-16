import {validateConfig,type Box,type Truck,type Settings,type Weights} from './model';
import {CONFIG_RANGES,type NumericRange} from './model';
export {CONFIG_RANGES,type NumericRange} from './model';
/** 빈값·무한대·범위 밖 값은 편집 완료 시 보정한다. 유효한 소수는 그대로 보존한다. */
export function normalizeNumber(value:number,range:NumericRange):number {
 const finite=Number.isNaN(value)?range.min:value,rounded=range.integer?Math.round(finite):finite;
 return Math.max(range.min,Math.min(range.max,rounded));
}
/** 입력은1.1까지 보관하되 실제 교차 확률은 최대100%다. */
export function effectiveCrossover(value:number):number {return Math.max(0,Math.min(1,value));}
/** 범위 양끝을 포함한11단계. 정수 항목은 반올림하며 중복 단계도 검사 기록에 남긴다. */
export function rangeSteps(range:NumericRange):number[]{return Array.from({length:11},(_,i)=>{const value=range.min+(range.max-range.min)*i/10;return range.integer?Math.round(value):Number(value.toFixed(8));});}
/** 웹 실행의 범위를 Worker에서도 재검증한다. 기존 독립 상차 API의0가중치 실험은 별도로 유지한다. */
export function validateWebConfig(boxes:Box[],truck:Truck,settings:Settings,weights:Weights):void {
 if(settings.population===0)throw Error('집단을 1 이상 지정하세요. 집단 0에서는 실행하지 않습니다.');
 validateConfig(boxes,truck,settings,weights);
 if(settings.crossover<CONFIG_RANGES.crossover.min||settings.mutation<CONFIG_RANGES.mutation.min)throw Error('교차율은 0.1~1.1, 상자별 변이율은 0.01~1이어야 합니다.');
 if([weights.base,weights.moves,weights.mass,weights.space??20].some(v=>!Number.isFinite(v)||v<1||v>501))throw Error('평가 가중치는 모두 1~501 범위여야 합니다.');
}

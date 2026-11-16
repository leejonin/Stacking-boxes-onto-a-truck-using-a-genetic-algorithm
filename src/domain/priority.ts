import type {Box} from './model';
/** 우선도는 배송 입력이다. GA가 바꾸지 않으며 큰 수치가 먼저, 동점은 ID순이다. */
export function priorityOrder(boxes:Box[]):Box[]{return [...boxes].sort((a,b)=>b.priority-a.priority||a.id-b.id);}
/** 1(파랑)→5(빨강)의 고정 우선도 범례. 등급 색상과 구별한다. */
export function priorityColor(priority:number):string {return `hsl(${Math.round(220*(5-Math.max(1,Math.min(5,priority)))/4)}, 68%, 50%)`;}

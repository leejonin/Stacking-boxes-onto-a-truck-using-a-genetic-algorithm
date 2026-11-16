# SW_Browser_Unloading_001 — 하차평가

- 버전: v0.0.1
- 최초 작성: 2026-11-16 20:53:14 (KST)
- 지시자: 이종인 / 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Unloading_001
- 실행환경: Browser. 기술환경은 Info/기술환경.md 참조.

### `src/simulation/unload.ts`

```tsx
import { type Box,type Vec,type Truck,type Evaluation,type MoveEvent,type Weights,type LoadingEvaluation,type StackLoadEvaluation } from '../domain/model';
import { type Placed,validateLayout,blockers,supported,candidates,fits } from '../domain/packing';
/** 우선순위대로 실제 방해 상자를 임시 이동·복귀시키며 하차 비용을 계산한다. SW_Browser_Unloading_001 */
export function simulate(boxes: Box[], coords: Vec[], truck: Truck, trace = true): Evaluation {
  const reason=validateLayout(boxes,coords,truck);
  const result:Evaluation={valid:!reason,reason:reason??'',moves:0,mass:0,delivered:0,events:[]};
  if(reason) return result;
  let remaining:Placed[]=boxes.map((box,i)=>({box,pos:[...coords[i]]}));
  const priority=[...boxes].sort((a,b)=>b.priority-a.priority||a.id-b.id);
  /** 변경된 한 상자를 이벤트와 비용에 반영한다. */
  const record=(kind:MoveEvent['kind'],p:Placed,to:Vec|null) => {
    if(kind!=='deliver') {result.moves++;result.mass=Math.round((result.mass+p.box.weight)*10)/10;}
    if(trace) result.events.push({kind,boxId:p.box.id,from:kind==='return'?null:[...p.pos],to:to?[...to]:null,moves:result.moves,mass:result.mass});
  };
  for(const target of priority) {
    const pending:Placed[]=[];
    /** 지지 의존과 직선 경로 방해를 먼저 제거한 뒤 상자를 꺼낸다. */
    const extract=(id:number,delivery:boolean,stack:Set<number>):boolean=>{
      if(stack.has(id)) return false;
      const p=remaining.find(b=>b.box.id===id);if(!p)return false;
      stack.add(id);
      while(true) {
        const without=remaining.filter(b=>b.box.id!==id);
        const depend=without.filter(b=>!supported(b,without)).sort((a,b)=>b.pos[2]-a.pos[2]||a.box.id-b.box.id);
        const obstruction=blockers(p,remaining).sort((a,b)=>a.pos[1]-b.pos[1]||b.pos[2]-a.pos[2]||a.box.id-b.box.id);
        const first=depend[0]??obstruction[0];
        if(!first)break;
        if(!extract(first.box.id,false,new Set(stack)))return false;
      }
      remaining=remaining.filter(b=>b.box.id!==id); record(delivery?'deliver':'out',p,null);
      if(delivery)result.delivered++;else pending.push(p);
      return true;
    };
    if(!extract(target.id,true,new Set())) {result.valid=false;result.reason='직선 인출·지지 의존 순환으로 하차할 수 없습니다.';return result;}
    // 원래 위치가 없어졌다면 바닥·남은 지지면의 유효 위치로 복귀한다.
    while(pending.length) {
      pending.sort((a,b)=>a.pos[2]-b.pos[2]||b.pos[1]-a.pos[1]||a.box.id-b.box.id);
      let found=false;
      for(let i=0;i<pending.length;i++) {
        const p=pending[i];const options=[p.pos,...candidates(p.box,remaining,truck).sort((a,b)=>a[2]-b[2]||b[1]-a[1]||a[0]-b[0])];
        const pos=options.find(pos=>fits(p.box,pos,remaining,truck)&&!blockers({box:p.box,pos},remaining).length);
        if(!pos)continue;
        record('return',p,pos);remaining.push({box:p.box,pos});pending.splice(i,1);found=true;break;
      }
      if(!found) {result.valid=false;result.reason='임시 이동 상자의 안전한 복귀 위치가 없습니다.';return result;}
    }
  }
  return result;
}
/** PPT 기준 100 - 10×횟수 - 1×중량. 무효 배치는 선택할 수 없다. */
export function fitness(e: Pick<Evaluation,'valid'|'moves'|'mass'>, weights:Weights):number { return e.valid?Math.round((weights.base-weights.moves*e.moves-weights.mass*e.mass)*100)/100:-Infinity; }

/** 실제 실린 상자만 높은 우선순위부터 하차한다. 미적재 sentinel은 하차 대상에서 제외한다. */
export function simulateLoaded(boxes:Box[],coords:Vec[],truck:Truck,trace=true):Evaluation {
  if(coords.length!==boxes.length||coords.some(p=>!p||p.length!==3||p.some(x=>!Number.isFinite(x))||p.some(x=>x<0)&&!p.every(x=>x===-1)))return {valid:false,reason:'실제 적재 좌표가 올바르지 않습니다.',moves:0,mass:0,delivered:0,events:[]};
  const indices=boxes.map((_,i)=>i).filter(i=>coords[i][0]>=0);
  return simulate(indices.map(i=>boxes[i]),indices.map(i=>coords[i]),truck,trace);
}
/** 고정 우선순위 하차의 재이동 횟수·이동 중량과 별도의 상부 하중을 감점하고 적재량·활용률을 보상한다. */
export function unloadingFitness(e:Pick<Evaluation,'valid'|'moves'|'mass'>,loading:Pick<LoadingEvaluation,'valid'|'coverage'|'compactness'|'utilization'>,bearing:Pick<StackLoadEvaluation,'valid'|'excessMass'>,w:Weights):number {
  return e.valid&&loading.valid&&bearing.valid?Math.round((w.base+(w.amount??100)*loading.coverage+(w.space??20)*loading.compactness+(w.fill??50)*loading.utilization-w.moves*e.moves-(w.travelMass??1)*e.mass-w.mass*bearing.excessMass)*100)/100:-Infinity;
}
```

## 2026-11-16 20:53:14 (KST) 현재 목적·입출력·호출·검증

하차 우선순위는 고정하고 방해 상자의 이동 횟수와 이동 중량을 최소화하는 배치를 탐색한다. 상부 하중은 별도 안정성 항목이다. 소스 타입·함수 주석과 실제 분기가 입력·단위·반환값·예외의 기준이며 구현 코드 전체를 위에 보존했다. Engine.evaluate→실제 상차→simulateLoaded 및 evaluateStackLoad→unloadingFitness, Worker와 비교 실험에서 호출한다. App은 동일 하차 평가기를3D 재생에 사용한다. 실제 적재물만 하차하고 미적재는 별도 표시한다.

총51개 검사·빌드 성공 및 소형27조건 비교 실험 예산 일치를 확인했다. 직접 브라우저 조작 미확인, 하중은 kg 상당의 사용자 정의 근사 규칙이다. 상세 계산·전후 변경·실측값·한계·관련기능은 `Info/plan/2026-11-16/205314_우선순위하차최적화와상부하중평가_plan.md`. 이전 상차 목적·하차 보류 기록은 당시 기록이며 이번 확정으로 대체한다.

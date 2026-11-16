# SW_Browser_Unloading_001 — 하차평가

> 2026-11-16 21:20:39 (KST) 현재 기준: 현재 앱에서 호출하지 않는 첫 배포의 참조 하차 모듈이다. 이후 기능 설명은 당시 기록일 수 있으며 최신 기준은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`.

- 버전: v0.0.1
- 최초 작성: 2026-11-16 20:53:14 (KST)
- 지시자: 이종인 / 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Unloading_001
- 실행환경: Browser. 기술환경은 Info/기술환경.md 참조.

### `src/simulation/unload.ts`

```tsx
import { type Box,type Vec,type Truck,type Evaluation,type MoveEvent,type Weights } from '../domain/model';
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
```

## 2026-11-16 20:53:14 (KST) 현재 목적·입출력·호출·검증

하차 우선순위는 고정하고 방해 상자의 이동 횟수와 이동 중량을 최소화하는 배치를 탐색한다. 상부 하중은 별도 안정성 항목이다. 소스 타입·함수 주석과 실제 분기가 입력·단위·반환값·예외의 기준이며 구현 코드 전체를 위에 보존했다. Engine.evaluate→실제 상차→simulateLoaded 및 evaluateStackLoad→unloadingFitness, Worker와 비교 실험에서 호출한다. App은 동일 하차 평가기를3D 재생에 사용한다. 실제 적재물만 하차하고 미적재는 별도 표시한다.

총51개 검사·빌드 성공 및 소형27조건 비교 실험 예산 일치를 확인했다. 직접 브라우저 조작 미확인, 하중은 kg 상당의 사용자 정의 근사 규칙이다. 상세 계산·전후 변경·실측값·한계·관련기능은 `Info/plan/2026-11-16/205314_우선순위하차최적화와상부하중평가_plan.md`. 이전 상차 목적·하차 보류 기록은 당시 기록이며 이번 확정으로 대체한다.

## 2026-11-16 21:20:39 (KST) 첫 배포 복원

사용자가 첫 배포 상차 버전으로 복원하고 상자 할당 입력만 유지하도록 명시했다. 위 코드 스냅샷은 현재 복원본이다.24개 테스트·빌드 성공. 상세 복원 범위·초기값·제한·관련 기록은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`. 이전 구현·검증·보류·재승인은 당시 기록으로 보존하고 현재 동작 주장으로 사용하지 않는다.

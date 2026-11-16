# SW_Browser_StackLoad_001 — 하중평가

> 2026-11-16 21:20:39 (KST) 비활성·역사 기록: 첫 배포 복원에 따라 하중평가 실행 모듈과 전용 검사를 제거했다. 아래 코드는 과거 구현 기록이며 현재 실행 코드가 아니다. 기준: `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`.

- 버전: v0.0.1
- 최초 작성: 2026-11-16 20:53:14 (KST)
- 지시자: 이종인 / 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_StackLoad_001
- 실행환경: Browser. 기술환경은 Info/기술환경.md 참조.

### `src/simulation/stackLoad.ts`

```tsx
import type {Box,Vec,Truck,StackLoadEvaluation} from '../domain/model';
import {validateLayout} from '../domain/packing';

/** 정적 상부 하중을 위에서 아래로 전달한다. 접촉 면적 비율로 분담하며 자기 무게 초과분을 kg 단위로 합산한다. */
export function evaluateStackLoad(boxes:Box[],coords:Vec[],truck:Truck):StackLoadEvaluation {
  const fail=(reason:string):StackLoadEvaluation=>({valid:false,reason,loads:[],excessMass:0});
  if(coords.length!==boxes.length||coords.some(p=>!p||p.length!==3||p.some(x=>!Number.isFinite(x))||p.some(x=>x<0)&&!p.every(x=>x===-1)))return fail('상자별 실제 적재 좌표가 올바르지 않습니다.');
  const placed=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
  const reason=validateLayout(placed.map(p=>p.box),placed.map(p=>p.pos),truck);if(reason)return fail(reason);
  const above=new Map(placed.map(p=>[p.box.id,0]));
  for(const upper of [...placed].sort((a,b)=>b.pos[2]-a.pos[2])){
    if(upper.pos[2]===0)continue;
    const contacts=placed.flatMap(lower=>{
      if(lower.pos[2]+lower.box.size[2]!==upper.pos[2])return [];
      const width=Math.max(0,Math.min(upper.pos[0]+upper.box.size[0],lower.pos[0]+lower.box.size[0])-Math.max(upper.pos[0],lower.pos[0]));
      const depth=Math.max(0,Math.min(upper.pos[1]+upper.box.size[1],lower.pos[1]+lower.box.size[1])-Math.max(upper.pos[1],lower.pos[1]));
      return width*depth>0?[{id:lower.box.id,area:width*depth}]:[];
    });
    const area=contacts.reduce((n,p)=>n+p.area,0),mass=upper.box.weight+above.get(upper.box.id)!;
    if(area===0)return fail('상부 하중을 지지할 접촉면이 없습니다.');
    for(const contact of contacts)above.set(contact.id,above.get(contact.id)!+mass*contact.area/area);
  }
  const loads=placed.map(p=>({boxId:p.box.id,aboveMass:above.get(p.box.id)!,excessMass:Math.max(0,above.get(p.box.id)!-p.box.weight)}));
  return {valid:true,reason:'',loads,excessMass:loads.reduce((n,p)=>n+p.excessMass,0)};
}
```

## 2026-11-16 20:53:14 (KST) 현재 목적·입출력·호출·검증

하차 우선순위는 고정하고 방해 상자의 이동 횟수와 이동 중량을 최소화하는 배치를 탐색한다. 상부 하중은 별도 안정성 항목이다. 소스 타입·함수 주석과 실제 분기가 입력·단위·반환값·예외의 기준이며 구현 코드 전체를 위에 보존했다. Engine.evaluate→실제 상차→simulateLoaded 및 evaluateStackLoad→unloadingFitness, Worker와 비교 실험에서 호출한다. App은 동일 하차 평가기를3D 재생에 사용한다. 실제 적재물만 하차하고 미적재는 별도 표시한다.

총51개 검사·빌드 성공 및 소형27조건 비교 실험 예산 일치를 확인했다. 직접 브라우저 조작 미확인, 하중은 kg 상당의 사용자 정의 근사 규칙이다. 상세 계산·전후 변경·실측값·한계·관련기능은 `Info/plan/2026-11-16/205314_우선순위하차최적화와상부하중평가_plan.md`. 이전 상차 목적·하차 보류 기록은 당시 기록이며 이번 확정으로 대체한다.

# SW_Browser_Arrival_001 — 택배도착

- 버전: v0.0.2
- 최초 작성·수정 일시: 2026-11-16 12:49:10 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Arrival_001
- 분류: 소프트웨어 / 택배도착 (영문 식별자 Arrival)
- 실행환경: Browser. 기술 버전은 프로젝트 루트 기준 `Info/기술환경.md`.
- 관련 ID: 001 및 `Info/기능_ID_목록.md`의 관련 기능.
- 상태: 구현 코드 확인·수치/빌드 검증. 브라우저 직접 조작은 미확인.

## 목적·목표와 역할

별도 도착 seed의 상자 순서, 최대 40개 대기, 확정 적재 좌표와 미적재 대기를 보존한다.

목표는 사용자 승인된 상차 적재량 개선과 재배치 감소를 실제 상차 계산·화면에 일치시키는 것이다.

## 호출·입력·출력·처리 순서

Arrival(boxes,seed)로 초기화한다. receive는 40개에 도달하거나 모든 상자가 도착하면 false이며 cursor를 잘못 증가시키지 않는다. commit(boxes,finalCoords,truck)은 현재 도착 목록과 후보 목록 일치 → 실제 실린 부분집합 → 고정 상자 누락 검사 → 상차 경로 검사 후 loaded·waiting·fixed를 갱신한다.

App 순차 도착 모드가 호출한다. commit 이후 미적재 상자는 waiting에 남는다. 기존 fixed는 이후 Engine과 Loading에서 변경 금지다. 도착 시점은 GA 세대와 다르며 arrival.log에 별도 기록한다.

소스의 타입 정의는 필수 매개변수·단위·반환값의 실제 근거다. 위치는 정수 cm, 중량은 kg, 비율은 0~1이다. 예외·실패 분기는 아래 실제 코드와 같다. Loading 평가의 valid=false, 위치 생성 실패의 null, UI/Worker 예외 메시지를 서로 구별한다.

## 수정 전후·확인 범위

이전 전체 실행은 하차 비용을 평가했다. 이번에는 상차 순서·위치와 실제 적재량을 평가하며 하차 모듈은 앱·GA·실험에서 호출하지 않는다. 기존 하차 소스와 해당 회귀 테스트는 삭제하지 않고 보존했다. 테스트 18개·빌드 통과. 대표 실행과 비교 결과는 `Info/report/2026-11-16/124910_상차전환검증_report.md`.

## 실제 코드와 함수별 설명

아래는 작성 시점의 파일 전체다. 함수별 주석·시그니처와 분기·타입을 보존하며, 구현되지 않은 의사 코드가 아니다.

### `src/simulation/arrival.ts`

```tsx
import { Random,type Box,type Vec,type Truck } from '../domain/model';
import { loadingOrder } from '../domain/packing';
/** 무작위 도착·40개 대기·확정 적재 좌표를 관리한다. SW_Browser_Arrival_001 */
export class Arrival {
  order:Box[];cursor=0;waiting:Box[]=[];loaded:Box[]=[];fixed:Record<number,Vec>={};log:string[]=[];
  constructor(boxes:Box[],seed:number) {this.order=new Random(seed).shuffle(boxes);}
  /** 한 상자를 도착시킨다. 공간이 가득 찼으면 원본 순서를 보존하며 보류한다. */
  receive():boolean {
    if(this.cursor>=this.order.length||this.waiting.length>=40)return false;
    const box=this.order[this.cursor++];this.waiting.push(box);this.log.push(`도착 ${this.cursor} · 상자 #${box.id}`);return true;
  }
  /** 선택 해답을 실제 상차 가능한 순서로 확정하고 기존 적재 좌표를 보존한다. */
  commit(boxes:Box[],coords:Vec[],truck:Truck):number[] {
    const expected=[...this.loaded,...this.waiting].map(b=>b.id).sort((a,b)=>a-b);
    if(expected.join(',')!==boxes.map(b=>b.id).sort((a,b)=>a-b).join(','))throw Error('현재 도착 목록과 선택 배치가 일치하지 않습니다.');
    const placed=boxes.flatMap((box,i)=>coords[i][0]>=0?[{box,pos:coords[i]}]:[]);
    if(Object.keys(this.fixed).some(id=>!placed.some(p=>p.box.id===+id)))throw Error('기존 적재물을 누락할 수 없습니다.');
    const sequence=loadingOrder(placed.map(p=>p.box),placed.map(p=>p.pos),truck,this.fixed);
    if(!sequence)throw Error('기존 적재물을 움직이지 않는 직선 상차 경로가 없습니다.');
    placed.forEach(p=>{this.fixed[p.box.id]=[...p.pos];});
    this.loaded=placed.map(p=>p.box);this.waiting=boxes.filter(b=>!this.fixed[b.id]);this.log.push(`상차 확정 · ${sequence.map(id=>'#'+id).join(' → ')} · 잔여 ${this.waiting.length}개`);return sequence;
  }
}

```

함수·구성요소 역할(실제 문서화 주석):
- `export class Arrival`: 무작위 도착·40개 대기·확정 적재 좌표를 관리한다. SW_Browser_Arrival_001
- `receive():boolean`: 한 상자를 도착시킨다. 공간이 가득 찼으면 원본 순서를 보존하며 보류한다.
- `commit(boxes:Box[],coords:Vec[],truck:Truck):number[]`: 선택 해답을 실제 상차 가능한 순서로 확정하고 기존 적재 좌표를 보존한다.

- 추가 수정 일시: 2026-11-16 13:13:21 (KST)

### `src/simulation/supply.ts`

```tsx
import {generateBoxes,Random,type Box,type Vec,type Truck,type Individual} from '../domain/model';
import {type Placed,fits,blockers} from '../domain/packing';

/** 현재 배치에서 최소 규격 상자가 들어갈 위치를 면 좌표의 조합으로 지연 탐색한다. */
export function availableLoadingSlot(boxes:Box[],coords:Vec[],truck:Truck):Vec|null {
  const placed:Placed[]=boxes.flatMap((box,i)=>coords[i]?.[0]>=0?[{box,pos:coords[i]}]:[]);
  const probe:Box={id:-1,size:[10,10,10],weight:.1,priority:1,grade:0};
  const xs=new Set([0,truck.width-10]),ys=new Set([0,truck.depth-10]),zs=new Set([0]);
  for(const p of placed){xs.add(p.pos[0]);xs.add(p.pos[0]+p.box.size[0]);xs.add(p.pos[0]-10);ys.add(p.pos[1]);ys.add(p.pos[1]+p.box.size[1]);ys.add(p.pos[1]-10);zs.add(p.pos[2]+p.box.size[2]);}
  // 전체 좌표 조합 배열을 만들지 않고 첫 유효 위치에서 반환한다.
  for(const z of [...zs].sort((a,b)=>a-b))for(const y of ys)for(const x of xs){
    const pos:Vec=[x,y,z];if(fits(probe,pos,placed,truck)&&!blockers({box:probe,pos},placed).length)return pos;
  }
  return null;
}

/** 총 공급 개수를 정하지 않고 다음 탐색용 택배를 계속 생성한다. SW_Browser_Arrival_001 */
export class AutomaticSupply {
  round=1;private rng:Random;private nextId:number;
  constructor(public boxes:Box[],seed:number,public batchSize=20){
    if(!Number.isInteger(batchSize)||batchSize<1)throw Error('공급량은 1 이상의 정수여야 합니다.');
    this.rng=new Random(seed^0x51A771);this.nextId=boxes.reduce((max,b)=>Math.max(max,b.id),0)+1;
  }
  /** 실제 적재 부피가 짐칸 전체를 채운 경우만 종료한다. 세대·공급량·작은 틈은 완료 조건이 아니다. */
  expand(best:Individual,truck:Truck):Box[]|null {
    if(best.evaluation.loadedVolume>=truck.width*truck.depth*truck.height)return null;
    const incoming=generateBoxes(this.batchSize,this.rng.int(0,4294967295)).map(b=>({...b,id:this.nextId++}));
    this.boxes=[...this.boxes,...incoming];this.round++;return this.boxes;
  }
}
```

## 2026-11-16 13:13:21 (KST) — 총량제한없는자동공급

AutomaticSupply가 첫 입력 소진 후에도 처리 묶음별 새 상자를 계속 생성한다. availableLoadingSlot은 실제 경계·지지·입구 경로를 검사하며 임의 총 공급 개수로 종료하지 않는다. 기존 수동 Arrival 모드와 별도로 작동한다.

총량 상한은 두지 않으며 최초 18개·추가 8개는 처리 묶음이다. 테스트 23개와 빌드가 통과했다. 브라우저 직접 검증은 미확인이다.
## 2026-11-16 19:23:49 (KST) 자동 공급 경계 수정

현재 동작·검증은 `Info/plan/2026-11-16/192349_자동공급세대계승수정_plan.md` 및 같은 기능의 최신 day에 기록했다. 이전 검증 기록은 당시 결과이며 현재 코드 스냅샷은 위에 갱신했다.

## 2026-11-16 19:27:59 (KST) 공급량 설정과 즉시 공급

최신 동작과 검증은 `Info/plan/2026-11-16/192759_공급량설정과소진즉시공급_plan.md`에 기록했다. 초기·추가 공급은 기본 20개이며 사용자가 양의 정수로 설정한다. 모든 상자를 실은 후보가 나오면 즉시 다음 회차로 연결한다. 세대의 localNumber로 조기 전환 시 누적 세대와 회차 내 세대를 구별한다.

- 2026-11-16 19:42:17 (KST) 최종 완료 조건: 자동 공급은 적재 부피100%일 때만 즉시 완료하며 가득 찬 개체를 표시한다. 작은 틈·세대 예산·공급량 소진으로 완료하지 않는다. 전체33개 테스트와 빌드 성공. 기준과 한계: `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md`.

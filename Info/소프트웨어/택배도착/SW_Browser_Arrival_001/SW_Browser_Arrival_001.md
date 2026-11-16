# SW_Browser_Arrival_001 — 택배도착

> 2026-11-17 02:00:56 KST 최신 입력 범위는 최초·누적1~400개. 과거 총량 무제한 설명은 당시 기록이다. 최신 동작은 `Info/plan/2026-11-17/015406_입력반영과누적400제한_plan.md`.


> 2026-11-16 21:20:39 (KST) 현재 기준: 현재 실행은 첫 배포 상차 기준이며 상자 할당 입력만 유지한다. 이후 기능 설명은 당시 기록일 수 있으며 최신 기준은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`.

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
import {generateBoxes,MAX_BOXES,Random,type Box,type Vec,type Truck,type Individual} from '../domain/model';
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

/** 누적 최대400개까지 다음 탐색용 택배를 계속 생성한다. SW_Browser_Arrival_001 */
export class AutomaticSupply {
  round=1;private rng:Random;private nextId:number;
  constructor(public boxes:Box[],seed:number,public batchSize=20){if(!Number.isInteger(batchSize)||batchSize<1||batchSize>MAX_BOXES||boxes.length>MAX_BOXES)throw Error('상자 할당·누적 개수는 1~400개 범위여야 합니다.');this.rng=new Random(seed^0x51A771);this.nextId=boxes.reduce((max,b)=>Math.max(max,b.id),0)+1;}
  /** 물리적으로 더 실을 후보 공간이 있으면 입력을 확장한다. 남은 누적 한도만큼만 마지막 묶음을 공급한다. */
  expand(best:Individual,truck:Truck):Box[]|null {
    if(this.boxes.length>=MAX_BOXES)return null;
    if(!availableLoadingSlot(this.boxes,best.evaluation.finalCoords,truck))return null;
    const incoming=generateBoxes(Math.min(this.batchSize,MAX_BOXES-this.boxes.length),this.rng.int(0,4294967295)).map(b=>({...b,id:this.nextId++}));
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

- 2026-11-16 19:44:49 (KST) 최종 조건 보완: 매 세대 한 개체라도100% 또는 최소 상자 추가 공간이 없으면 즉시 완료하며 해당 개체를 표시한다. 단순 입구 차단 제외.35개 테스트·빌드 성공. 앞선100% 단독 조건은 `Info/plan/2026-11-16/194012_누적상차유지와상자당재이동비용_plan.md` 최종 절로 대체한다.

- 2026-11-16 19:48:40 (KST) 완료 적재율 입력: 기본100%, 자동 공급에서1~100% 설정. Worker 전달·검증과 부피 비율 이상 완료를 적용하며 추가 불가 조건 유지.37개 테스트·빌드 성공. 계획: `Info/plan/2026-11-16/194840_완료적재율입력설정_plan.md`.

## 2026-11-16 20:04:38 (KST) 상자 ID 최종 기준

서로 다른 상자는 전체 입력·추가 공급에서 고유 ID를 사용하고 같은 상자는 세대·재배치 후에도 ID를 유지한다. 앞선 한 배치라는 표현으로 요구를 한정하지 않는다. 기존 구현은 이 기준을 유지한다. 확인 근거·강화한 검사: `Info/plan/2026-11-16/200438_상자ID전체공급고유성기준확정_plan.md`.

- 2026-11-16 20:05:01 (KST) 검증 완료: 공급 회귀 검사1개 통과.6회 추가 공급 전체66개 ID 유일성, 매 회차 이전 상자의 ID·데이터 보존, 신규 ID와 전체 기존 ID 비중복, seed재현성 확인. 실행 소스 변경 없음. 기존41개 전체 검사 결과를 새로 실행한 것으로 주장하지 않는다. 문서·검사 변경만 Public main에 반영한다.

## 2026-11-16 21:20:39 (KST) 첫 배포 복원

사용자가 첫 배포 상차 버전으로 복원하고 상자 할당 입력만 유지하도록 명시했다. 위 코드 스냅샷은 현재 복원본이다.24개 테스트·빌드 성공. 상세 복원 범위·초기값·제한·관련 기록은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`. 이전 구현·검증·보류·재승인은 당시 기록으로 보존하고 현재 동작 주장으로 사용하지 않는다.


## 2026-11-17 02:00:56 KST 입력 반영·누적400 제한

수량은1~400 정수로 보정한다. 초과는 편집 중 즉시400, 빈값/0/음수/소수는 편집 완료 시1 또는 정수로 보정하고 경고를 표시한다. generateBoxes/validateConfig도 범위를 검사해 UI 우회를 거부한다. 자동 공급 마지막 묶음은 min(회당 개수,400−누적)만 추가하고 누적400이면 더 만들지 않는다. 고유 ID/기존 우선도를 보존한다.

고정·자동 일반 입력은 resolveBoxInput으로 최신 수량/seed를 실행 직전에 실제 목록에 반영한다. 동일 수량/seed는 편집한 우선도를 보존한다. 비교실험에도 같은 목록 해석을 적용한다. 순차 도착 이후 수량/seed 변경은 재생성 안내 후 거부해 기존 도착/고정 배치를 조용히 버리지 않는다.

가중치 적용은 첫 세대 전에도 Worker로 전달한다. Worker 확인 응답 후 적용식을 갱신하고 현재 집단 최고 점수와 선택 개체 점수를 즉시 갱신한다. 과거 세대의 당시 점수/그래프는 보존하며 현재 재평가 수치는 ‘새 가중치’로 구분한다. 새 실행과 초기화에서 현재 재평가 최고값을 지운다. 집단·세대·교차/변이·k·GA seed·짐칸은 초기화 후 다음 실행에 적용하고 실행 중에는 잠근다.

세대 조건은 기존 Engine.requireFullAllocation/priorityUnloading을 유지한다. 모든 개체가 전체 할당 상자를 경계/비겹침/지지/유효 상차·우선순 하차 조건으로 평가받아야 완성 세대가 된다. 불가능한 부피/치수 또는 유한 탐색 실패에서는 세대를 올리지 않고 원인을 표시한다. 누적400 한도는 적재 가능성을 보장하는 조건이 아니다.

검사: 총75개 통과/실패0, production 타입검사·빌드 통과. 100/256/360/400개 각각 비기본 입력seed731, GAseed913, 집단6, 2세대, 교차.65/변이.17/k4, 짐칸320×700×300, 가중치137/3/.3/31로 실제 Worker를 실행했다. 첫 세대 전 가중치 적용 뒤 모든 세대·개체의 실제 상자수/배송수/점수식/설정/버전2를 검사했다. 390→400 자동 공급 뒤 한도 사유로 완료하는 실제 Worker도 검사했다.

측정: 위 조건의 세대 시간(ms)은100개814/22756, 256개1336/398, 360개2007/956, 400개2117/1018이었다. 테스트 병렬 실행 환경의 측정이며 순수 계산 벤치마크가 아니다. 100개 두 번째 세대는 유효 후보 복구/탐색이 오래 걸렸지만 완성됐다. 입력에 따라 시간은 달라지며 일정 속도/매 세대 점수 개선을 보장하지 않는다.

브라우저: 10000 입력→400 경고/보정, 0/빈값→1 확인. 자동 공급을 끈 고정 입력에서256을 입력하고 다시 생성 버튼 없이 시작→실제256개 전량 적재/하차, 집단6·2세대·비기본 설정 반영 확인. 최종 소스에서400개도 재생성 없이 시작, 첫 세대 준비 중 가중치 변경→일시정지→재개→400개 전량 적재/하차/2세대 v2 완료. 그 뒤 moves3→7 재평가로 -102556.79→-190700.79, 22036회×4=88144 감점 차이 일치. 과거 세대 점수는 기록값으로 유지, 현재최고/선택점수/적용식은 새 값 표시. 개발 중 HMR로 이전 Worker가 정리된 뒤 남은 화면에는 응답이 없었으므로 최종 확인은 새로고침한 최종 코드로 수행했다.

공개 배포: gh-pages5a26e2605da61d619af417fcfd990f2dc928d5b7, Pages Actions43913323612 success. UI index-DBxvyf4a.js, Worker evolution-BRu2GaIS.js. 공개 브라우저에서도1000→400 경고·보정과 에셋 표시를 확인했다. 콘솔 오류/경고0. 실제 화면 증거 docs/images/input-limit-warning.jpg 및 docs/images/input-400.jpg. 로컬 임시 테스트 로그는 artifacts/input-limit에 보관(공개 대상 제외).

상세 계획·승인·환경·함수 및 검사 기록: `Info/plan/2026-11-17/015406_입력반영과누적400제한_plan.md`. 위 전체 코드는 현재 구현이다.

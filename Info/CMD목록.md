# CMD 목록 — 탑차 상자 배치 유전 알고리즘

- 버전: v0.0.2
- 최초 작성·수정 일시: 2026-11-17 14:01:02 (KST)
- 최근 수정 일시: 2026-11-17 14:33:01 KST
- 지시자: 이종인
- 작업자: GPT-6 (Codex) — 명령·구현 대조 및 문서 작성
- 독자: 이 프로젝트를 직접 실행·검사·배포하는 개발자
- 목적: 실제 명령어와 실행 조건, 가동·상태·정지·종료 방법을 한곳에서 찾는다.
- 관련 기능: 001(전체 구조), SW_Browser_Packing_001(입력·배치), SW_Browser_Loading_001(상차 평가), SW_Browser_Unloading_001(하차 평가), SW_Browser_Evolution_001(진화 계산), SW_Browser_Arrival_001(공급·도착), SW_Browser_EvolutionView_001(웹 화면), SW_Browser_Scene_001(3D), SW_Browser_ResultExport_001(결과 내보내기).
- 환경: [기술 환경](기술환경.md). Windows PowerShell 기준, Node.js24/npm11. 배포에는 Git·GitHub CLI 및 지정 저장소 쓰기 권한이 추가로 필요하다.

## 공통 실행 위치와 확인

모든 명령은 **package.json이 있는 프로젝트 루트**에서 실행한다. Info 폴더 안에서 실행하지 않는다. 이 문서의 npm 명령은 PowerShell과 CMD에서 동일하게 사용할 수 있다.

```powershell
node --version
npm --version
npm run
```

유한 작업은 실행 중인 터미널의 콘솔로 상태를 확인한다. 끝난 직후 종료 코드를 확인한다. 0은 성공, 그 외 값은 실패이며 실제 원인은 바로 앞 출력에서 확인한다.

```powershell
$LASTEXITCODE
```

Windows CMD를 사용하는 경우 위 명령 대신 다음을 사용한다.

```bat
echo %ERRORLEVEL%
```

**Ctrl+C는 실행 중인 터미널에서 누르는 키 조합**이다. `npm stop`/`npm run status`는 등록되어 있지 않으므로 사용하지 않는다. 아래에서 ‘해당 없음’은 기능을 새로 구현했다는 뜻이 아니라 현재 별도 명령이 없다는 뜻이다.

## 1. 의존성 설치 — 001

### 시작

선행 조건: Node/npm 설치, 루트에 package.json과 package-lock.json 존재. 처음 받았거나 잠금 파일 기준으로 다시 설치할 때 사용한다.

```powershell
npm ci
```

### 가동

시작과 같은 `npm ci`이며, 완료될 때까지 설치 출력을 확인한다. 가동을 위해 같은 명령을 중복 실행하지 않는다.

### 상태

완료 후 설치된 직접 의존성을 확인한다. 진행 중 별도 상태 조회 명령은 없다.

```powershell
npm ls --depth=0
```

### 정지

실행한 터미널에서 Ctrl+C. 별도 설치 일시정지·재개 명령은 없다.

### 종료

설치 프로세스가 자동 종료하고 프롬프트로 돌아온다. 공통 종료 코드를 확인한다. 설치만으로 개발 서버는 시작되지 않는다.

## 2. 개발 서버 — 001 / EvolutionView / Scene

이 절의 영문 약칭은 위 메타 정보에 나열한 기존 `SW_Browser_*_001` 기능 ID를 뜻한다.

### 시작

선행 조건: `npm ci` 완료.

```powershell
npm run dev
```

### 가동

시작과 같은 명령이며 터미널을 유지한다. 브라우저에서 터미널에 출력된 Local 주소를 연다. 기본 주소는 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)이며 포트가 사용 중이면 Vite가 표시하는 실제 주소를 따른다.

### 상태

터미널의 Vite 준비 메시지와 브라우저의 페이지 표시를 확인한다. 이 명령은 서버만 시작하며 GA 실행은 아래 웹 버튼으로 시작한다. 서버 상태를 조회하는 별도 npm 명령은 없다.

### 정지

개발 서버 터미널에서 Ctrl+C. 웹의 ‘정지’ 버튼은 계산 정지이며 개발 서버를 종료하지 않는다.

### 종료

Ctrl+C 후 프롬프트로 돌아오면 서버 프로세스가 종료된 것이다. 브라우저 탭은 별도로 닫는다.

## 3. 시뮬레이션·3D·결과 다운로드 — Evolution / Packing / Loading / Unloading / Arrival / EvolutionView / Scene / ResultExport

### 시작

별도 시뮬레이션 제어 CMD/API는 없다. 개발 서버 페이지 또는 [배포 페이지](https://leejonin.github.io/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm/)를 연다.

### 가동

웹에서 수량·설정·상자 우선도를 지정하고 **‘처음부터 시작’**을 누른다. 집단의 모든 개체가 할당 상자를 전부 적재하고 우선순으로 모두 하차해야 다음 세대가 확정된다. 3D 재생은 이 계산 기록을 확인하는 기능이다. ‘일시정지’/‘이어서 실행’으로 계산을 제어하며, 개체 선택 후 ‘우선도 하차’/‘상차 확인’과 재생 슬라이더를 사용한다. ‘가중치 적용’은 현재 집단을 재평가하고 일시정지한다.

### 상태

웹 상단의 준비·실행·세대 진행·오류 안내와 선택 개체의 실제 적재/하차 수치를 확인한다. GUI 상태를 조회하는 별도 CMD는 없다. 집단0은 안내만 표시하고 실행하지 않는다.

### 정지

웹 **‘정지’**는 계산 중단, **‘재생 정지’**는 화면 재생만 중단한다. **‘완료 · 결과 확정’**은 완성 세대·선택 개체·시점을 확정하고 다운로드를 연다. 세대 예산이 끝난 상태라도 결과 다운로드에는 이 확정 버튼이 필요하다.

### 종료

필요한 PNG/SVG/ZIP을 다운로드한 뒤 탭을 닫는다. **‘초기화’**는 실행 기록과 확정 결과를 비우고 다운로드를 다시 잠근다. 결과는 페이지 메모리에 있으므로 탭 종료/새로고침 전에 저장한다. 로컬 서버 종료는 2절과 별도다.

## 4. 전체 회귀 검사 — Browser 기능 전체 / 001

### 시작

```powershell
npm test
```

### 가동

시작과 같은 명령이며 `tests/*.test.ts`를 실행한다. 별도 watch 명령은 등록되어 있지 않다.

### 상태

콘솔의 검사 결과와 마지막 tests/pass/fail 요약, 공통 종료 코드를 확인한다. 고정된 검사 수를 성공 조건으로 삼지 말고 실패0과 실제 출력 내용을 확인한다.

### 정지

검사 터미널에서 Ctrl+C. 별도 재개 명령은 없다.

### 종료

검사가 모두 끝나면 자동 종료한다. 최근 전량 하차 완료 조건 검증에서97개 검사를 통과했다. 검증 시점·조건은 아래 기록을 참조한다.

## 5. 설정 범위11단계 검사 — Packing / Evolution / EvolutionView

### 시작

```powershell
npm run range-test
```

### 가동

시작과 같은 명령이다. 가중치4항목과 집단·세대·교차·변이·k를 각각 최소~최대의10% 간격11단계로 검사한다. 전체 설정 직교곱 검사는 아니다. 집단0은 실행 없이 안내되는지 검사한다.

### 상태

콘솔 요약과 다음 원자료를 확인한다. 파일의 생성 일시도 함께 확인해 이전 결과와 구분한다.

```powershell
Get-Content artifacts/range-sweep/report.json
```

실제 실행 기록·점수·재생 전이와 고정 재이동 배치 검사를 포함한다. 현재 구현 기준99조건 중 실제 실행98건/집단0 안내1건이며, 결과를 예상 숫자만으로 판정하지 않는다.

### 정지

검사 터미널에서 Ctrl+C. 중간 결과 체크포인트·재개는 해당 없음이다.

### 종료

검사 후 JSON을 저장하고 자동 종료한다. 실패 시 Node assertion/오류 출력과 종료 코드를 확인한다. 루트의 `artifacts/`는 Git 제외 대상이다.

## 6. 성능 벤치마크 — Packing / Evolution / Loading / Unloading

### 시작

현재 웹의 우선순 하차 목적과 같은 평가를 측정하려면 다음을 사용한다.

```powershell
npm run benchmark -- --large --priority --generations=3
```

### 가동

시작과 같은 명령이다. `--large`는100개·220개 입력, `--priority`는 우선도 하차 평가를 사용한다. `--generations=3`의3은 측정할 세대 수로 **이 벤치마크 스크립트에서는1~300**이다. 웹의 최대10,001세대와 별도 제한이다.

구 상차 호환35개·48개 조건을 측정하는 명령도 존재한다.

```powershell
npm run benchmark
```

`--priority`를 생략한 결과는 `loading-compat`이며 현재 웹의 하차 성능 수치로 해석하지 않는다.

### 상태

콘솔의 objective/configuration/ms/total/loadedRanges/bestScores/전체 세대 해시를 확인한다. 콘솔 출력용이며 결과 파일을 자동 생성하지 않는다. 브라우저 표시 시간과 계산 시간은 다르다.

### 정지

벤치마크 터미널에서 Ctrl+C. 중단 시 이미 출력된 기록은 남을 수 있으며 완주 결과와 구분한다.

### 종료

지정된 모든 조건·세대 계산 후 자동 종료한다. 공통 종료 코드를 확인한다.

## 7. 무작위 비교 실험 — Evolution

### 시작

현재 CLI 스크립트는 **과거 상차 호환 평가**를 실행한다.

```powershell
npm run experiment
```

### 가동

시작과 같은 명령이다. 현재 스크립트의 고정 설정은10상자/집단12/10세대,9조건×3seed의27회 비교다. 이 CLI에는 우선순 하차로 전환하는 인수가 구현되어 있지 않다. 현재 웹의 우선도 하차 비교는 웹 ‘무작위 배치와 비교 실험’ → ‘비교 실험 시작’을 사용한다.

### 상태

CLI 진행 조건과 마지막 GA/무작위 점수·평가 예산 요약을 확인한다. 저장 결과는 다음과 같다.

```powershell
Get-Content artifacts/experiment.json
```

웹 실험은 화면의 진행 문구를 확인하고 완료 후 ‘결과 JSON 저장’을 사용한다.

### 정지

CLI는 터미널에서 Ctrl+C, 웹 비교 실험은 ‘실험 취소’ 버튼이다. 이들은 메인 진화 계산의 정지 버튼과 별개다.

### 종료

CLI는 JSON 저장 후 자동 종료한다. 웹 실험은 완료/취소/오류 후 계산 Worker를 종료한다. 이번 문서 작성에서는 비교 실험을 재실행하지 않았고 CLI 조건·저장 경로·종료는 코드 대조로 확인했다.

## 8. 타입 검사·배포용 빌드 — 001

### 시작

```powershell
npm run build
```

### 가동

시작과 같은 명령이며 `tsc --noEmit` 성공 후 Vite가 `dist/`를 생성한다. 타입 검사만 실행하려면 다음을 사용한다.

```powershell
npx tsc --noEmit
```

### 상태

TypeScript 오류와 Vite 빌드 요약, 공통 종료 코드를 확인한다. 빌드 완료만으로 서버가 시작되거나 배포되지는 않는다.

### 정지

빌드 터미널에서 Ctrl+C. 별도 일시정지·재개는 해당 없음이다.

### 종료

검사·빌드가 끝나면 자동 종료한다. 현재 package.json에는 별도 preview 스크립트가 없다.

## 9. GitHub Pages 배포 — 001

### 시작

선행 조건: 의존성 설치, Git/GitHub CLI 사용 가능, Git 사용자 이름·이메일 설정, 지정 원격에 쓰기 가능한 기존 GitHub CLI 인증.

```powershell
git remote -v
gh auth status
```

원격이 이 프로젝트의 지정 GitHub 저장소인지 확인한 뒤 배포한다.

```powershell
npm run deploy
```

### 가동

시작의 배포 명령과 같다. `scripts/deploy-pages.mjs`가 Pages 하위 경로로 빌드하고 임시 작업 폴더에서 `dist/`를 `gh-pages`에 커밋·push한다. **main 소스 push는 이 명령에 포함되지 않는다.** 새로 인증하는 명령은 이 목록 작성 중 자동 실행하지 않는다.

### 상태

터미널의 ‘gh-pages 게시 완료’와 GitHub Pages 작업을 구분해 확인한다.

```powershell
gh run list --limit 5
```

게시 후 [배포 페이지](https://leejonin.github.io/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm/)의 실제 동작도 확인한다. 기존 페이지가 열려 있으면 필요한 결과 저장 후 새로고침한다.

### 정지

배포 프로세스는 터미널에서 Ctrl+C로 중단할 수 있지만 이미 push한 내용을 되돌리지는 않는다. 게시된 Pages 서비스를 정지하는 명령은 이 프로젝트 스크립트에 없다.

### 종료

push 후 스크립트가 자동 종료한다. Pages 작업 성공과 실제 페이지 확인까지가 배포 확인이며, 배포 프로세스 종료 후에도 Pages는 계속 서비스한다.

## 확인 근거와 문서 관리

- 명령 정의: 루트 `package.json`, `scripts/range-sweep.ts`, `scripts/benchmark.ts`, `scripts/experiment.ts`, `scripts/deploy-pages.mjs`, `vite.config.ts`.
- GUI 제어: `src/ui/App.tsx`, `src/ui/ResultExport.tsx`, `src/workers/evolution.ts`.
- 최초 CMD 목록 작성 시 직접 실행 확인: `node --version` → v24.18.0, `npm --version` →11.16.0, `npm run` → 등록된7개 스크립트 대조. 최초 목록 작성만을 위해 설치·서버·검사·빌드·배포를 재실행하지 않았다.
- 직전 실행 검증: [설정 범위11단계 실제 검사 보고서](report/2026-11-17/2026-11-17_033449_설정범위11단계검사_report.md). 전체90개 검사·범위 검사·로컬/Pages 실행·빌드 결과는 해당 시점·조건의 기록이다.
- 명령·조건이 바뀌면 본문, 최근 수정 일시와 버전을 함께 갱신한다. 새 명령을 추가한 것처럼 문서만 작성하지 않는다.

- 2026-11-17 14:33:01 KST 전량하차조건보강검증:97개검사/별도99조건범위검사/빌드·로컬/Pages확인. 명령자체변경없음,GUI세대확정조건설명갱신. `Info/plan/2026-11-17/142042_우선순전량하차세대완료조건_plan.md`.

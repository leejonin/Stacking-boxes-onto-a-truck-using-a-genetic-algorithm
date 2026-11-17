# 기능 ID 목록

- 버전: v0.0.2
- 최초 작성 일시: 2026-11-10 16:41:51 (KST)
- 수정 일시: 2026-11-16 12:49:10 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)

## 001 — 메인 프로젝트 전체 구조

- 분류: 메인프로젝트 / 전체구조. 메인 숫자 ID 체계 유지.
- 책임: 탑차 상차 적재량 개선·재배치 최소화라는 목적과 통합 흐름.
- 상태: 구현 중. 계산·UI 코드와 수치·빌드 검증 완료, 브라우저 시각·조작 미확인.
- 이전 ID: 해당 없음.
- 계획: `Info/plan/2026-11-10/164151_탑차상자배치_GA구현_plan.md`.

## SW_Browser_Packing_001 — 배치검사

- 영역 / 실행환경 / 영문중분류: SW / Browser / Packing.
- 대분류 / 중분류: 소프트웨어 / 배치검사.
- 책임: Box·Vec·Truck 등 공통 입력과 5등급 상자 생성, 경계·겹침·밑면 합집합 지지 검사, 고정 배치 보존, 후보 위치 생성과 부분 배치를 담당한다.
- 코드 경로(프로젝트 루트 기준): `src/domain/model.ts`, `src/domain/packing.ts`.
- 문서 경로: `Info/소프트웨어/배치검사/SW_Browser_Packing_001/SW_Browser_Packing_001.md`.
- 관련 ID: 001. 호출·의존 관계는 상세 문서에 기록.
- 상태: 구현 코드 및 수치·빌드 확인. 화면 조작은 미확인.
- 이전 ID: 해당 없음.

## SW_Browser_Loading_001 — 상차평가

- 영역 / 실행환경 / 영문중분류: SW / Browser / Loading.
- 대분류 / 중분류: 소프트웨어 / 상차평가.
- 책임: 상차 순서·목표 좌표를 실제로 실행하여 실린 개수·부피·집중도·재배치 횟수·중량과 이벤트를 만든다.
- 코드 경로(프로젝트 루트 기준): `src/simulation/loading.ts`.
- 문서 경로: `Info/소프트웨어/상차평가/SW_Browser_Loading_001/SW_Browser_Loading_001.md`.
- 관련 ID: 001. 호출·의존 관계는 상세 문서에 기록.
- 상태: 구현 코드 및 수치·빌드 확인. 화면 조작은 미확인.
- 이전 ID: 해당 없음.

## SW_Browser_Evolution_001 — 진화계산

- 영역 / 실행환경 / 영문중분류: SW / Browser / Evolution.
- 대분류 / 중분류: 소프트웨어 / 진화계산.
- 책임: 좌표·상차 순서 집단을 진화시키고 가중치 적용·일시정지·평가 예산 비교를 담당한다.
- 코드 경로(프로젝트 루트 기준): `src/ga/engine.ts`, `src/ga/experiments.ts`, `src/workers/evolution.ts`.
- 문서 경로: `Info/소프트웨어/진화계산/SW_Browser_Evolution_001/SW_Browser_Evolution_001.md`.
- 관련 ID: 001. 호출·의존 관계는 상세 문서에 기록.
- 상태: 구현 코드 및 수치·빌드 확인. 화면 조작은 미확인.
- 이전 ID: 해당 없음.

## SW_Browser_Arrival_001 — 택배도착

- 영역 / 실행환경 / 영문중분류: SW / Browser / Arrival.
- 대분류 / 중분류: 소프트웨어 / 택배도착.
- 책임: 별도 도착 seed의 상자 순서, 최대 40개 대기, 확정 적재 좌표와 미적재 대기를 보존한다.
- 코드 경로(프로젝트 루트 기준): `src/simulation/arrival.ts`, `src/simulation/supply.ts`.
- 문서 경로: `Info/소프트웨어/택배도착/SW_Browser_Arrival_001/SW_Browser_Arrival_001.md`.
- 관련 ID: 001. 호출·의존 관계는 상세 문서에 기록.
- 상태: 구현 코드 및 수치·빌드 확인. 화면 조작은 미확인.
- 이전 ID: 해당 없음.

## SW_Browser_Scene_001 — 배치3D

- 영역 / 실행환경 / 영문중분류: SW / Browser / Scene.
- 대분류 / 중분류: 소프트웨어 / 배치3D.
- 책임: 원본 탑차 GLB와 상자 재질을 로딩하고 실제 상차 이벤트의 각 시점만 3D로 표시한다.
- 코드 경로(프로젝트 루트 기준): `src/scene/TruckView.tsx`, `src/scene/truckFrame.ts`.
- 문서 경로: `Info/소프트웨어/배치3D/SW_Browser_Scene_001/SW_Browser_Scene_001.md`.
- 관련 ID: 001. 호출·의존 관계는 상세 문서에 기록.
- 상태: 구현 코드 및 수치·빌드 확인. 화면 조작은 미확인.
- 이전 ID: 해당 없음.

## SW_Browser_EvolutionView_001 — 진화화면

- 영역 / 실행환경 / 영문중분류: SW / Browser / EvolutionView.
- 대분류 / 중분류: 소프트웨어 / 진화화면.
- 책임: 실제 GA 상태·가중치·세대 계보·개체 선택·상차 재생·도착·비교 실험을 사용자에게 제공한다.
- 코드 경로(프로젝트 루트 기준): `src/ui/App.tsx`, `src/ui/GenerationTree.tsx`, `src/main.tsx`.
- 문서 경로: `Info/소프트웨어/진화화면/SW_Browser_EvolutionView_001/SW_Browser_EvolutionView_001.md`.
- 관련 ID: 001. 호출·의존 관계는 상세 문서에 기록.
- 상태: 구현 코드 및 수치·빌드 확인. 화면 조작은 미확인.
- 이전 ID: 해당 없음.


## SV_GitHubActions_Deployment_001 — 정적웹배포

- 영역 / 실행환경 / 중분류: SV / GitHubActions / Deployment.
- 대분류 / 중분류: 배포 / 정적웹배포.
- 책임: GitHub Pages 빌드·테스트·배포와 프로젝트 전체 공개 저장소 보관.
- 관련 ID: 001, SW_Browser 기능 전체.
- 코드 경로: `scripts/deploy-pages.mjs`, `.github/pages-actions-reference.yml`, `vite.config.ts`.
- 문서: `Info/배포/정적웹배포/SV_GitHubActions_Deployment_001/SV_GitHubActions_Deployment_001.md`.
- 상태: 전체 소스 원격 push·Pages 배포 성공, 공개 페이지와 3D·Worker 정적 파일 HTTP 200 확인.
- 이전 ID: 해당 없음.

## SW_Browser_Unloading_001 — 하차평가

- 영역/실행환경: SW/Browser.
- 분류: 소프트웨어/하차평가.
- 책임: 고정 우선순위 하차·재이동 횟수/중량 및 적재 보상 점수.
- 문서: `Info/소프트웨어/하차평가/SW_Browser_Unloading_001/SW_Browser_Unloading_001.md`.
- 관련 ID: SW_Browser_Evolution_001, SW_Browser_Packing_001, SW_Browser_EvolutionView_001.
- 상태: 코드·수치·빌드 검증. 직접 브라우저 조작 미확인.

## SW_Browser_StackLoad_001 — 하중평가

- 영역/실행환경: SW/Browser.
- 분류: 소프트웨어/하중평가.
- 책임: 정적 상부 하중 전달·면적별 분담·자기 무게 초과분 계산.
- 문서: `Info/소프트웨어/하중평가/SW_Browser_StackLoad_001/SW_Browser_StackLoad_001.md`.
- 관련 ID: SW_Browser_Evolution_001, SW_Browser_Packing_001, SW_Browser_EvolutionView_001.
- 상태: 코드·수치·빌드 검증. 직접 브라우저 조작 미확인.

## 2026-11-16 21:20:39 (KST) 현재 기준 — 첫 배포 상차 복원

사용자의 최종 명시적 선택에 따라0db2361의 상차 버전으로 복원하고 상자 할당 입력(기본20)만 유지한다. 현재 상세 기준은 `Info/plan/2026-11-16/212039_첫배포상차복원과상자할당입력유지_plan.md`. 하차평가 확장·하중평가·50점 보상·추가 세대 조건은 현재 실행에서 제외되며 관련 과거 문서와 ID는 역사 기록으로 보존한다. 기존 Unloading 참조 소스는 첫 배포대로 남지만 앱 경로에서 호출하지 않는다.


## SW_Browser_ResultExport_001 — 결과내보내기

- 영역/실행환경: SW/Browser.
- 분류: 소프트웨어/결과내보내기.
- 책임: 완료시점자료확정·전체로드맵·그래프·3D·요약PNG/SVG/ZIP저장.
- 문서: `Info/소프트웨어/결과내보내기/SW_Browser_ResultExport_001/SW_Browser_ResultExport_001.md`.
- 관련ID: SW_Browser_EvolutionView_001, SW_Browser_Scene_001, SW_Browser_Evolution_001.
- 상태:41개검사·빌드통과,최종브라우저상태는 `Info/plan/2026-11-17/001050_완료시점결과이미지다운로드_plan.md`.


## 2026-11-17 01:37:10 (KST) 현재 우선도 하차 목표

현재웹은전량상차가능성통과후상자별높은우선도순하차비용을최적화한다.동점ID순.관련기능ID는기존Packing/Unloading/Evolution/EvolutionView/Scene/ResultExport를재사용.사용자승인/함수/검증/정책/한계는 `Info/plan/2026-11-17/011248_상자별우선도하차최적화연결_plan.md`.기존상차복원기록은과거시점기록이다.


## 2026-11-17 02:00:56 KST 입력 반영·누적400 제한

Packing/EvolutionView/Evolution/Arrival 기존 ID 사용. 최신 입력 범위1~400, 고정 수량·seed와 첫 세대 전 가중치 실제 전달 확인. 75개 검사·빌드·브라우저 완료. `Info/plan/2026-11-17/015406_입력반영과누적400제한_plan.md` 참조.


## 2026-11-17 02:27:16 KST 기본짐칸 전량 후보 복구

기존Packing/Evolution ID 재사용. SW_Browser_Packing_Bug_001 해결. 최대 지지면·상차 순서 복구,82개 검사/빌드·로컬기본짐칸256/400 확인. 실패 감점 미구현(사용자철회). `Info/plan/2026-11-17/021302_기본짐칸전량후보생성수정_plan.md` 참조.


## 2026-11-17 03:34:49 KST 설정 범위와11단계 검증

Packing/Evolution/EvolutionView/ResultExport기존ID재사용. 최종공통범위와0집단안내·1.1교차실효100%,변이전수탐색/장기세대대기수정.90개검사/99조건/10001완주·재생확인. `Info/plan/2026-11-17/031259_설정범위와10퍼센트단계검증_plan.md`, `Info/report/2026-11-17/2026-11-17_033449_설정범위11단계검사_report.md`.


## 2026-11-17 14:33:01 KST 우선순 전량 하차 최종 조건

Unloading/Evolution/EvolutionView기존ID재사용. 전개체전량하차를엘리트/부모/후보/세대확정에서강제검사.97개검사·99조건범위검사·로컬/Pages재생통과. 새독립문제없음. `Info/plan/2026-11-17/142042_우선순전량하차세대완료조건_plan.md`.

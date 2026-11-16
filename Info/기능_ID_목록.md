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
- 상태: 준비·검증 완료, 원격 전송과 배포 최종 결과 확인 중.
- 이전 ID: 해당 없음.

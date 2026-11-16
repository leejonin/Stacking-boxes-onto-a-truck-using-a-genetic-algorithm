# 하차 전환 보류와 README 상의 표시

- 작업 일시: 2026-11-16 20:34:46 (KST)
- 지시자: 이종인 / 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Evolution_001. 관련: SW_Browser_Loading_001, SW_Browser_EvolutionView_001.
- 최종 사용자 지시: 기존 배포 기준 유지. README에 하차 부분은 상의 필요라고 기록하고 push.
- 처리: 이번 미배포 하차 복원 변경8개 파일(src/domain/model.ts, src/ga/engine.ts, src/ga/experiments.ts, src/simulation/unload.ts, src/ui/App.tsx, src/workers/evolution.ts, tests/domain.test.ts, tests/supply.test.ts)을 작업 시작 시점HEAD로 복구했다. 기존 원격 소스와 배포본은 하차로 전환되지 않았다. 동일 작업에서 새 파일은 생성되지 않았다.
- 검증: src·tests가 HEAD와 차이 없음을 git diff --exit-code로 확인. 복구 후 빌드 성공. 기존 큰 번들 경고 유지. 새 전체 테스트는 복구 후 재실행하지 않았으며 이전 배포본의43개 검사 결과와 구별한다. 브라우저 직접 조작 검증은 수행하지 않았다.
- README: 하차 최적화 부분은 상의 필요라고 명시하고, 하차 우선순위·평가식 적용 여부는 협의 후 결정하며 현재 상차 기준을 유지한다고 기록했다.
- 목적·목표: 현재 배포된 상차 개선 기준 유지. 하차 전환은 미확정·보류이며 완료로 주장하지 않는다.
- 문제: 새로운 기술 문제 기록 대상 없음. 계획 변경은 작업 중 사용자의 기존 배포 유지 지시로 취소됨. 기존 계획·day·problem은 보존한다.
- Git: 사용자 요청에 따라 README와 이 작업 기록만 Public main에 반영한다. 실행 소스 변경과 사이트 재배포는 없다.

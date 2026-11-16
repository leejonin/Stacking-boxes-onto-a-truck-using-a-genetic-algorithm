# Public 저장소와 GitHub Pages 배포

- 버전: v0.0.1
- 최초 작성·수정 일시: 2026-11-16 19:07:19 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SV_GitHubActions_Deployment_001
- 목적·목표: 프로젝트 전체를 공개 저장소에 보관하고 Pages 주소에서 실행한다.

## 실제 작업과 확인

README를 실행·사용법·자동 공급·적합도·검증·구조·배포 안내로 정리했다. 검증용 화면을 docs/images에 포함했다. 에셋 출처와 GLB의 CC0-1.0 선언을 기록하고 기존 MIT-0 안내를 보존했다.

https://github.com/leejonin/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm 저장소를 Public으로 생성했고 GitHub 메타데이터로 공개 설정을 확인했다. Pages를 workflow 방식으로 활성화했다. API의 반환 주소: https://leejonin.github.io/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm/

테스트 23개와 Pages base 경로 빌드가 통과했다. 원본 PPTX를 포함한 공개 파일의 비밀값·절대 로컬 경로 검사를 통과했다. 원본 위치에 있던 로컬 사용자 경로 1곳은 외부 원본 폴더 설명으로 바꿨다. Git을 main으로 초기화하고 원격을 생성한 저장소로 설정했다. author는 GitHub noreply 주소를 로컬 저장소에만 설정했다.

사용자가 Public·프로젝트 전체 push를 명시했으므로 소스·에셋·원본 PPTX·개발 문서·의존성 잠금·배포 워크플로를 전송한다. 생성 파일·의존성·캐시·로컬 결과는 제외한다. 실제 전송 전 staged·커밋·공개 범위를 최종 확인한다.

상세 코드·입출력·실패 처리: 동일 ID 상세 문서. 자료·버전: Info/기술환경.md. 전송·CI·사이트 접속의 최종 결과는 확인 후 이 문서에 이어 기록한다. 준비 단계에서 추가로 확인된 미해결 문제 없음.

전송 단계 추가 기록: 현재 CLI의 workflow 권한 부족으로 첫 push가 거부됐다. 프로젝트 권한 확대 없이 main 전체 소스와 gh-pages 정적 배포로 전환하며, Actions 파일은 .github/pages-actions-reference.yml로 참고 보존한다. 일반 브랜치 push만 사용하며 강제 push·이력 재작성은 하지 않는다.

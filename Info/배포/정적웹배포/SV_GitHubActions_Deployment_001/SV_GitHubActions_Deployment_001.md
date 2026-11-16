# GitHub Pages 정적 웹 배포

- 버전: v0.0.1
- 최초 작성·수정 일시: 2026-11-16 19:07:19 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SV_GitHubActions_Deployment_001
- 관련 ID: 001 및 SW_Browser 전체 기능.
- 목적: 로컬 전용 상차 실험실을 공개 주소에서 실행하고 프로젝트 전체를 GitHub에 보관한다.
- 목표: README·Public 저장소·전체 소스 push·Pages 배포와 실제 주소 접속을 확인한다.
- 사용 환경: GitHub Actions ubuntu-latest·Node 24·Vite 7.2.2, 버전 잠금은 package-lock.json.

## 요청 범위와 상태

사용자가 저장소 생성·전체 push·GitHub Pages를 요청하고 후속 입력으로 Public·프로젝트 전체 push를 명시했다. 이 지시는 이전의 저장소 제공 전 push 보류를 이번 작업 범위에서 대체한다.

저장소는 https://github.com/leejonin/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm, 브랜치는 main이다. GitHub 메타데이터에서 PUBLIC을 확인했다. Pages는 workflow 방식으로 활성화되었고 API가 반환한 주소는 https://leejonin.github.io/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm/다. 현재 이 문서를 작성하는 시점에는 전송·Actions·접속 최종 검증 전이다.

## 입력·처리·출력

main의 소스·에셋·테스트·빌드 설정 변경 또는 workflow_dispatch가 진입점이다. 코드·문서 전체를 저장소에 보관하되 node_modules·캐시·로컬 실험 결과·dist는 제외한다. README와 에셋 안내를 갱신하고 공개 파일의 비밀값·로컬 절대 경로를 검사했다. 원본 PPTX 내부 XML도 검사했다.

워크플로는 checkout → Node 24 → npm ci → npm test → npm run build → Pages 설정 → dist artifact 업로드 → OIDC 토큰 기반 배포 순서다. 실패하면 뒤 단계는 수행하지 않으며 Actions 로그에서 확인한다. contents:read, pages:write, id-token:write만 선언한다. 개인 토큰을 워크플로에 저장하지 않는다.

Vite는 GITHUB_ACTIONS=true이고 GITHUB_REPOSITORY가 있을 때 저장소 이름을 base 경로로 사용한다. 로컬은 / 경로다. Pages용 빌드에서 index.html의 JS·CSS 경로와 실파일을 확인했다. 소스 변경이 없는 문서만의 후속 push는 경로 필터로 재배포를 생략한다.

## 실제 구현

### `.github/workflows/deploy-pages.yml`

```yaml
name: GitHub Pages 배포

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'Asset/**'
      - 'tests/**'
      - 'scripts/**'
      - 'package.json'
      - 'package-lock.json'
      - 'tsconfig.json'
      - 'vite.config.ts'
      - 'index.html'
      - '.github/workflows/deploy-pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: 소스 가져오기
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Node 준비
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7
        with:
          node-version: '24'
          cache: npm
      - name: 의존성 설치
        run: npm ci
      - name: 수치·회귀 테스트
        run: npm test
      - name: Pages 경로로 빌드
        run: npm run build
      - name: Pages 설정
        uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6
      - name: 배포 파일 업로드
        uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5
        with:
          path: dist
      - name: GitHub Pages 배포
        id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5

```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// GitHub Pages의 저장소 하위 경로와 로컬 개발 루트 경로를 구분한다.
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' && repository ? `/${repository}/` : '/',
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
});

```

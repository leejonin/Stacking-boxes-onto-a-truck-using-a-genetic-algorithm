# GitHub Pages 정적 웹 배포

- 버전: v0.0.2
- 최초 작성 일시: 2026-11-16 19:07:19 (KST)
- 수정 일시: 2026-11-16 19:11:46 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SV_GitHubActions_Deployment_001
- 관련 ID: 001 및 SW_Browser 전체 기능.
- 목적: 상차 실험실을 공개 주소에서 실행하고 전체 프로젝트를 GitHub에 보관한다.
- 목표: README·Public 저장소·전체 소스 push·Pages 배포와 접속을 확인한다.
- 사용 환경: Node 24, npm, GitHub CLI 2.93.0, Git 2.54.0, Vite 7.2.2. 의존성 버전은 package-lock.json.

## 현재 방식과 원격

소스는 https://github.com/leejonin/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm의 main, 실행 파일은 gh-pages 브랜치에 게시한다. 저장소 공개 설정은 PUBLIC으로 확인했다. Pages는 build_type=legacy, source=gh-pages, path=/로 설정했다. API의 주소는 https://leejonin.github.io/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm/다.

사용자가 Public·프로젝트 전체 push를 명시했으므로 이전 push 보류 지시는 이 요청 범위에서 대체했다. 소스·에셋·원본 계획서·개발 문서·잠금 파일·README와 검증용 화면을 포함한다. node_modules·캐시·dist·로컬 임시 실험 결과는 main에서 제외한다. 공개 파일과 PPTX 내부 XML의 절대 경로·비밀값을 검사했다.

## 진입·입력·출력·실제 처리

명령은 npm run deploy이며 npm_execpath로 npm 실행 위치를 받는다. Git 원격은 검증된 이 프로젝트 HTTPS URL만 허용한다. 토큰을 읽어 출력하거나 파일에 저장하지 않고 GitHub CLI 인증 helper를 실행 시점에만 사용한다. 전역 Git 인증 설정은 변경하지 않는다.

처리: GitHub Pages 하위 경로 환경으로 빌드 → 고유 임시 폴더의 Git 저장소 생성 → 기존 gh-pages가 있으면 fetch·checkout → dist와 .nojekyll 복사 → 정확한 최상위 산출물 경로만 stage → 변경 시 커밋 → 일반 push. 강제 push나 기존 사용자 파일 삭제를 하지 않는다. GH Pages 서비스가 브랜치를 읽어 공개한다. main 소스 push는 별도로 수행한다.

Vite는 GITHUB_ACTIONS=true 및 GITHUB_REPOSITORY가 있을 때 저장소 이름을 base로 삼는다. 로컬은 / 경로다. 빌드 결과의 HTML JS·CSS 경로와 파일 존재를 검사했다. Worker·GLB도 같은 base에 맞춰 번들링된다.

실패 시 execFileSync 예외로 배포를 중단한다. 빌드·Git 실패를 성공으로 표시하지 않는다. GitHub Pages 원격 게시 상태는 API 및 실제 URL로 별도 확인한다. 빌드 성공과 배포 성공은 다르다.

## 방식 변경의 근거

첫 설계는 custom Actions workflow였다. 하지만 현재 CLI OAuth 인증에 workflow 권한이 없어 첫 push가 원격에서 거부됐다. 권한을 확대하지 않고 브랜치 게시 방식으로 전환했다. 초기 커밋을 강제 재작성하지 않고 다음 커밋에서 워크플로를 참고 경로로 옮겨 보존한 후 main push에 성공했다.

`.github/pages-actions-reference.yml`은 참고용이며 실행되는 워크플로가 아니다. 실제 배포 코드는 아래 deploy-pages.mjs다. 기능 ID는 같은 정적 배포 책임을 계속 추적하기 위해 유지한다.

## 확인 결과와 상태

테스트 23개·Pages용 빌드 통과. main의 a008ead 커밋까지 원격 push 성공. 배포 브랜치 SHA는 78593c400d46c5d1ef6c20aae485b1fbd13b1efd다. 최초 Pages 빌드 built와 원격 실행 success를 확인했다. 사이트 및 JS·CSS·Worker·탑차 GLB·상자 GLB HTTP 200을 확인했다. 배포 실행: https://github.com/leejonin/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm/actions/runs/43846535948.

## 실제 구현 코드

### `scripts/deploy-pages.mjs`

```js
import {execFileSync} from 'node:child_process';
import {cpSync,writeFileSync,mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=resolve(fileURLToPath(new URL('..',import.meta.url)));
/** 토큰을 출력·저장하지 않고 GitHub CLI의 기존 인증으로 git을 실행한다. */
function git(args,cwd=project){return execFileSync('git',['-c','credential.helper=','-c','credential.helper=!gh auth git-credential',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
const remote=git(['remote','get-url','origin']);
if(!/^https:\/\/github\.com\/leejonin\/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm(?:\.git)?$/.test(remote))throw Error('검증된 프로젝트 원격만 배포할 수 있습니다.');
const npmCli=process.env.npm_execpath;
if(!npmCli)throw Error('npm run deploy로 실행하세요.');
execFileSync(process.execPath,[npmCli,'run','build'],{cwd:project,stdio:'inherit',env:{...process.env,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'leejonin/Stacking-boxes-onto-a-truck-using-a-genetic-algorithm'}});
const target=mkdtempSync(join(tmpdir(),'loadlab-pages-'));
git(['init','-b','gh-pages'],target);
git(['config','user.name',git(['config','user.name'])],target);
git(['config','user.email',git(['config','user.email'])],target);
git(['remote','add','origin',remote],target);
const existing=git(['ls-remote','--heads','origin','gh-pages'],target);
if(existing){git(['fetch','origin','gh-pages'],target);git(['checkout','-B','gh-pages','FETCH_HEAD'],target);}
cpSync(join(project,'dist'),target,{recursive:true});
writeFileSync(join(target,'.nojekyll'),'');
git(['add','--',...readdirSync(target).filter(name=>name!=='.git')],target);
if(git(['diff','--cached','--name-only'],target))git(['commit','-m',`GitHub Pages 배포 (${git(['rev-parse','--short','HEAD'])})`],target);
console.log(git(['push','origin','gh-pages'],target));
console.log('gh-pages 게시 완료');

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

### `.github/pages-actions-reference.yml`

```yaml
# 참고용 Actions 설정. 현재 배포는 npm run deploy로 gh-pages 브랜치에 게시한다.
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

최종 확인 일시: 2026-11-16 19:12:59 (KST). 배포 상태와 URL·정적 의존 파일까지 확인했으며 공개 서비스의 전체 버튼 조작·모든 기기 검증을 의미하지 않는다.

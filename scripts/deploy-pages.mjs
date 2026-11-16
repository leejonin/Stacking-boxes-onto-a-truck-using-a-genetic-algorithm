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

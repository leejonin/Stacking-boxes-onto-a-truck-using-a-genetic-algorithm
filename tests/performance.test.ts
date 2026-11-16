import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {Engine,finishGeneration} from '../src/ga/engine';import {Random,generateBoxes,DEFAULT_SETTINGS,type Box,type Vec} from '../src/domain/model';import {randomPosition,candidates,fits,blockers,type Placed} from '../src/domain/packing';
/** 이전 배포 20896c8에서 수집한 전체 세대 해시(시간만 제외). 확률·순서·평가의 변경을 검출한다. */
for(const c of [
 {count:35,inputSeed:731,truck:{width:180,depth:400,height:180},population:24,seed:913,crossover:.7,mutation:.2,tournament:4,weights:{base:135,moves:4,mass:.5,space:35},hashes:['85276173e30ea7f839d95abe5ff0b192da7f4396f7a91016e4347c0386fd7c13','9e2fd0a3340ca43504bddf3998bd06f78224fa087aad741cfd96796c5d0541ee','4f6e2913a09fd31e790b06f5ad6fac49f825e076b7ba5d1bfef507f79eabb57e']},
 {count:48,inputSeed:416,truck:{width:240,depth:600,height:240},population:6,seed:51,crossover:1,mutation:.1,tournament:5,weights:{base:60,moves:0,mass:0,space:75},hashes:['d58a4cb5a8c69b62dd1350bd8d359d9e080a8caa5873532e449743a1267edee0','b4cd13f30cb7d4c13e729d111f20f67b3394d329523944920e537b9db64c025c','f1df7fb82ed502fef4d820217cddcd013d31c9792e389e8dbd52488ca41f9dfa']}
])test(`${c.count}상자 최적화 후 전 집단·좌표·순서·부모·점수·비용·평가횟수는 이전 배포와 동일`,()=>{
 const {hashes,...config}=c,e=new Engine(generateBoxes(c.count,c.inputSeed),c.truck,{...DEFAULT_SETTINGS,...config},c.weights);e.requireFullAllocation=true;
 for(const expected of hashes){const g=finishGeneration(e);assert.equal(createHash('sha256').update(JSON.stringify({...g,elapsed:0})).digest('hex'),expected);}
});
test('지연 좌표 탐색은 유한 후보의 기존 정렬·순환 시작과 난수 소비를 보존한다',()=>{
 const box=(id:number,size:Vec):Box=>({id,size,weight:2,grade:0,priority:1}),target=box(9,[10,10,10]),truck={width:50,depth:50,height:50};
 const placed:Placed[]=[{box:box(1,[20,20,10]),pos:[0,20,0]},{box:box(2,[20,20,10]),pos:[20,20,0]},{box:box(3,[10,10,10]),pos:[0,20,10]}];
 for(const scene of [[],placed])for(const compact of [true,false])for(const accessible of [true,false])for(let seed=0;seed<40;seed++){
  const a=new Random(seed),b=new Random(seed),options=candidates(target,scene,truck);if(compact)options.sort((a,b)=>a[2]-b[2]||b[1]-a[1]||a[0]-b[0]);const start=!compact&&options.length?a.int(0,options.length-1):0;
  let expected:Vec|null=null;for(let k=0;k<options.length;k++){const pos=options[(start+k)%options.length];if(fits(target,pos,scene,truck)&&(!accessible||!blockers({box:target,pos},scene).length)){expected=pos;break;}}
  assert.deepEqual(randomPosition(target,scene,truck,b,accessible,compact),expected);assert.equal(a.next(),b.next());
 }
 const huge=box(10,[60,60,60]),a=new Random(7),b=new Random(7);assert.equal(randomPosition(huge,placed,truck,a),null);assert.equal(a.next(),b.next());
});

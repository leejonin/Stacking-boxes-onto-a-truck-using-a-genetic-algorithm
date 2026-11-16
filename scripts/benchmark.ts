import {createHash} from 'node:crypto';
import {Engine,finishGeneration} from '../src/ga/engine';import {generateBoxes,DEFAULT_SETTINGS} from '../src/domain/model';
const configs=[{count:35,inputSeed:731,truck:{width:180,depth:400,height:180},population:24,seed:913,crossover:.7,mutation:.2,tournament:4,weights:{base:135,moves:4,mass:.5,space:35}},{count:48,inputSeed:416,truck:{width:240,depth:600,height:240},population:6,seed:51,crossover:1,mutation:.1,tournament:5,weights:{base:60,moves:0,mass:0,space:75}}];
/** 같은 seed의 세대 전체(시간 제외)를 해시하여 성능 비교 시 결과 변경을 구분한다. */
const reports=[];
for(const c of configs){const e=new Engine(generateBoxes(c.count,c.inputSeed),c.truck,{...DEFAULT_SETTINGS,...c},c.weights);e.requireFullAllocation=true;const times=[],hashes=[],attempts=[];
 for(let i=0;i<3;i++){const g=finishGeneration(e);times.push(g.elapsed);attempts.push(g.attempts);hashes.push(createHash('sha256').update(JSON.stringify({...g,elapsed:0})).digest('hex'));}
 const report={configuration:c,count:c.count,ms:times.map(n=>Math.round(n)),total:Math.round(times.reduce((a,b)=>a+b,0)),hashes,attempts};reports.push(report);console.log(JSON.stringify(report));}
console.log(JSON.stringify({note:'ms는 현재 환경의 계산 시간이며 브라우저 표시 시간과 다를 수 있습니다.',reports},null,2));

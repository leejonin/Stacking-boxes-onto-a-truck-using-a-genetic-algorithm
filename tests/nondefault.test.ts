import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine,finishGeneration} from '../src/ga/engine';
import {generateBoxes,DEFAULT_SETTINGS} from '../src/domain/model';
import {validateLayout} from '../src/domain/packing';
import {loadingFitness} from '../src/simulation/loading';

for(const config of [
 {count:12,inputSeed:89,truck:{width:140,depth:300,height:150},population:8,seed:17,crossover:.4,mutation:.3,tournament:2,weights:{base:80,moves:25,mass:2.5,space:0}},
 {count:35,inputSeed:731,truck:{width:180,depth:400,height:180},population:24,seed:913,crossover:.7,mutation:.2,tournament:4,weights:{base:135,moves:4,mass:.5,space:35}},
 {count:48,inputSeed:416,truck:{width:240,depth:600,height:240},population:6,seed:51,crossover:1,mutation:.1,tournament:5,weights:{base:60,moves:0,mass:0,space:75}},
])test(`비기본 설정 ${config.count}개: 완전 할당 첫 집단 생성과 후속 진화`,()=>{
 const boxes=generateBoxes(config.count,config.inputSeed);
 const e=new Engine(boxes,config.truck,{...DEFAULT_SETTINGS,...config},config.weights);e.requireFullAllocation=true;
 for(let i=0;i<3;i++){
  const g=finishGeneration(e);
  assert.equal(g.number,i+1);assert.equal(g.individuals.length,config.population);
  // 확률적 대량 재시도로 지연되던 첫 세대 회귀를 시도 횟수로 검사한다.
  assert.ok(g.attempts<=config.population*5,`후보 생성 지연: ${g.attempts}`);
  for(const p of g.individuals){assert.equal(p.evaluation.loaded,config.count);assert.equal(p.evaluation.unloadedIds.length,0);assert.equal(validateLayout(boxes,p.coords,config.truck),null);assert.equal(p.score,loadingFitness(p.evaluation,config.weights));}
  console.log(JSON.stringify({boxes:config.count,generation:g.number,attempts:g.attempts,ms:Math.round(g.elapsed),score:g.best}));
 }
});

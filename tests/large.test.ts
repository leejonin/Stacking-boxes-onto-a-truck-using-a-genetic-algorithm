import {test} from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,DEFAULT_TRUCK,DEFAULT_WEIGHTS,generateBoxes,type Generation} from '../src/domain/model';import {validateLayout,partitionPack,packSteps} from '../src/domain/packing';import {Engine,finishGeneration} from '../src/ga/engine';import {completeSupportOrder,simulateLoading,loadingFitness} from '../src/simulation/loading';import {Random} from '../src/domain/model';

for(const c of [{count:100,inputSeed:2026,settings:DEFAULT_SETTINGS,weights:DEFAULT_WEIGHTS},{count:220,inputSeed:2026,settings:DEFAULT_SETTINGS,weights:DEFAULT_WEIGHTS},{count:100,inputSeed:731,settings:{...DEFAULT_SETTINGS,population:12,seed:913,crossover:.7,mutation:.2,tournament:4},weights:{base:135,moves:4,mass:.5,space:35}},{count:220,inputSeed:731,settings:{...DEFAULT_SETTINGS,population:12,seed:913,crossover:.7,mutation:.2,tournament:4},weights:{base:135,moves:4,mass:.5,space:35}}])test(`${c.count}개/입력seed${c.inputSeed}: 3세대 완전 적재·다양성·부모·점수·겹침 검증`,()=>{
 const boxes=generateBoxes(c.count,c.inputSeed),e=new Engine(boxes,DEFAULT_TRUCK,c.settings,c.weights);e.requireFullAllocation=true;let parents=new Set<string>();const start=performance.now();
 assert.equal(new Set(boxes.map(b=>b.id)).size,c.count);
 for(let i=0;i<3;i++){const g=finishGeneration(e);assert.equal(g.number,i+1);assert.equal(g.individuals.length,c.settings.population);assert.ok(new Set(g.individuals.map(p=>JSON.stringify(p.coords))).size>1,'좌표 다양성 없음');
  for(const p of g.individuals){assert.equal(p.evaluation.loaded,c.count);assert.equal(p.evaluation.unloadedIds.length,0);assert.equal(validateLayout(boxes,p.evaluation.finalCoords,DEFAULT_TRUCK),null);assert.equal(p.score,loadingFitness(p.evaluation,c.weights));assert.equal(new Set(p.loadOrder).size,c.count);assert.ok(p.parents.every(id=>parents.has(id)));}
  const best=g.individuals.reduce((a,b)=>a.score>=b.score?a:b),replay=simulateLoading(boxes,best.coords,DEFAULT_TRUCK,best.loadOrder);assert.equal(replay.loaded,c.count);assert.equal(replay.events.filter(e=>e.kind==='load').length,c.count);parents=new Set(g.individuals.map(p=>p.id));
 }
 console.log(JSON.stringify({large:c.count,seed:c.inputSeed,population:c.settings.population,totalMs:Math.round(performance.now()-start)}));
});

test('구획 초기화는 같은seed로 재현하고 물리 제약 평가를 통과한 후보만 사용한다',()=>{
 const boxes=generateBoxes(220,2026),a=partitionPack(boxes,DEFAULT_TRUCK,new Random(2026)),b=partitionPack(boxes,DEFAULT_TRUCK,new Random(2026));assert.deepEqual(a,b);assert.equal(validateLayout(boxes,a.coords,DEFAULT_TRUCK),null);assert.ok(completeSupportOrder(boxes,a.coords,a.loadOrder));assert.equal(simulateLoading(boxes,a.coords,DEFAULT_TRUCK,a.loadOrder).loaded,220);
 const bad=a.loadOrder.slice().reverse();assert.equal(completeSupportOrder(boxes,a.coords,bad),false);
 const generator=packSteps(boxes,DEFAULT_TRUCK,new Random(2026),undefined,{},true,true,true);assert.equal(generator.next().done,false);
});

const scope=globalThis as any;scope.self={onmessage:()=>{}};scope.postMessage=()=>{};
await import('../src/workers/evolution');
for(const count of [100,220])test(`${count}개 실제 Worker: 첫 세대 전 일시정지·재개·정지 응답`,async()=>{
 let resolve!:()=>void;const done=new Promise<void>(r=>{resolve=r;});const messages:any[]=[];let pauseRequested=0,pauseLatency=0,resumed=false,error='',receivedAt=0;
 const run=600+count,start=performance.now();
 scope.postMessage=(m:any)=>{if(m.run!==run)return;messages.push(m);if(m.type==='error'){error=m.message;resolve();}if(m.type==='state'&&m.state==='일시정지'){pauseLatency=performance.now()-pauseRequested;setTimeout(()=>{assert.equal(messages.filter(m=>m.type==='generation').length,0);resumed=true;scope.self.onmessage({data:{type:'resume',run}});},25);}if(m.type==='generation'){receivedAt=performance.now();scope.self.onmessage({data:{type:'stop',run}});resolve();}};
 scope.self.onmessage({data:{type:'start',run,boxes:generateBoxes(count,2026),truck:DEFAULT_TRUCK,settings:{...DEFAULT_SETTINGS,generations:3},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:false,requireFullAllocation:true}});
 const pauseDue=performance.now()+1;setTimeout(()=>{pauseRequested=pauseDue;scope.self.onmessage({data:{type:'pause',run}});},1);
 const timeout=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});resolve();},15000);await done;clearTimeout(timeout);
 assert.equal(error,'');assert.ok(resumed);assert.ok(pauseLatency<1000,`일시정지 지연 ${pauseLatency}`);const g=messages.find(m=>m.type==='generation')?.generation as Generation;assert.ok(g);assert.equal(g.number,1);assert.ok(g.individuals.every(p=>p.evaluation.loaded===count));assert.ok(messages.some(m=>m.type==='state'&&m.state==='정지'));
 const reference=new Engine(generateBoxes(count,2026),DEFAULT_TRUCK,{...DEFAULT_SETTINGS,generations:3},DEFAULT_WEIGHTS);reference.requireFullAllocation=true;assert.deepEqual(g.individuals,finishGeneration(reference).individuals);
 console.log(JSON.stringify({workerBoxes:count,pauseMs:Math.round(pauseLatency),firstGenerationMs:Math.round(receivedAt-start)}));
});

test('대규모 구획 초기화 후에도 교차0·변이0의 유효 부모 좌표를 그대로 복제한다',()=>{
 const e=new Engine(generateBoxes(100,2026),DEFAULT_TRUCK,{...DEFAULT_SETTINGS,population:12},DEFAULT_WEIGHTS);e.requireFullAllocation=true;const first=finishGeneration(e),layouts=new Set(first.individuals.map(p=>JSON.stringify(p.coords)));
 e.settings={...e.settings,crossover:0,mutation:0};const next=finishGeneration(e);assert.ok(next.individuals.every(p=>layouts.has(JSON.stringify(p.coords))));
});

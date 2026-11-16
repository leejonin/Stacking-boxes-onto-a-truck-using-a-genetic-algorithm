import {test} from 'node:test';import assert from 'node:assert/strict';
import {CONFIG_RANGES,normalizeNumber,rangeSteps,validateWebConfig,effectiveCrossover} from '../src/domain/ranges';
import {DEFAULT_SETTINGS,DEFAULT_TRUCK,DEFAULT_WEIGHTS,generateBoxes,type Settings,type Weights} from '../src/domain/model';
import {Engine,finishGeneration} from '../src/ga/engine';import {checkReplay} from '../scripts/range-sweep';
const boxes=generateBoxes(3,2026);
test('전 항목11단계는 정확한 양끝과 범위 안에 있고 빈값/초과/소수 보정 기준을 공유한다',()=>{
 for(const range of Object.values(CONFIG_RANGES)){const steps=rangeSteps(range);assert.equal(steps.length,11);assert.equal(steps[0],range.min);assert.equal(steps[10],range.max);assert.ok(steps.every(v=>v>=range.min&&v<=range.max));assert.equal(normalizeNumber(NaN,range),range.min);assert.equal(normalizeNumber(-Infinity,range),range.min);assert.equal(normalizeNumber(Infinity,range),range.max);}
 assert.equal(normalizeNumber(1.123,CONFIG_RANGES.weight),1.123);assert.equal(normalizeNumber(50.5,CONFIG_RANGES.population),51);
 assert.deepEqual(rangeSteps(CONFIG_RANGES.population),[0,10,20,30,40,51,61,71,81,91,101]);assert.deepEqual(rangeSteps(CONFIG_RANGES.generations),[1,1001,2001,3001,4001,5001,6001,7001,8001,9001,10001]);
});
test('웹 실행은 새 경계를 재검사하고 집단0을 계산 없이 안내하며 집단1·k6을 허용한다',()=>{
 for(const population of [1,101])validateWebConfig(boxes,DEFAULT_TRUCK,{...DEFAULT_SETTINGS,population,generations:10001,tournament:6,crossover:1.1,mutation:1},{base:501,moves:501,mass:501,space:501});
 assert.throws(()=>validateWebConfig(boxes,DEFAULT_TRUCK,{...DEFAULT_SETTINGS,population:0},DEFAULT_WEIGHTS),/집단을 1 이상/);
 for(const patch of [{population:102},{generations:10002},{crossover:.099},{crossover:1.101},{mutation:.009},{mutation:1.01},{tournament:0},{tournament:7}])assert.throws(()=>validateWebConfig(boxes,DEFAULT_TRUCK,{...DEFAULT_SETTINGS,...patch},DEFAULT_WEIGHTS));
 for(const key of ['base','moves','mass','space'])for(const value of [0,502,NaN])assert.throws(()=>validateWebConfig(boxes,DEFAULT_TRUCK,DEFAULT_SETTINGS,{...DEFAULT_WEIGHTS,[key]:value}));
});
test('교차율1.1은 입력을 보존하며 실제1과 같은 교차·난수·개체 결과를 만든다',()=>{
 const make=(crossover:number)=>{const e=new Engine(boxes,DEFAULT_TRUCK,{...DEFAULT_SETTINGS,population:8,crossover,mutation:1,tournament:6},DEFAULT_WEIGHTS);e.priorityUnloading=true;e.requireFullAllocation=true;return e;};const a=make(1),b=make(1.1);
 assert.equal(effectiveCrossover(1.1),1);for(let i=0;i<4;i++){const ag=finishGeneration(a),bg=finishGeneration(b);assert.deepEqual({...ag,elapsed:0},{...bg,elapsed:0});}assert.equal(b.settings.crossover,1.1);
});
test('난수값 양끝도 유효하며 같은 입력을 재현한다',()=>{for(const seed of [0,4294967295]){const input=generateBoxes(10,seed);assert.deepEqual(input,generateBoxes(10,seed));validateWebConfig(input,DEFAULT_TRUCK,{...DEFAULT_SETTINGS,seed},DEFAULT_WEIGHTS);}});
const scope=globalThis as any;scope.self={onmessage:()=>{}};scope.postMessage=()=>{};await import('../src/workers/evolution');
test('실제 Worker도 집단0 또는 범위 밖 가중치에서는 세대를 생성하지 않는다',async()=>{
 for(const [run,patch,weights] of [[14000,{population:0},DEFAULT_WEIGHTS],[14001,{}, {...DEFAULT_WEIGHTS,mass:0}]] as const){const messages:any[]=[];scope.postMessage=(m:any)=>messages.push(m);await scope.self.onmessage({data:{type:'start',run,boxes,truck:DEFAULT_TRUCK,settings:{...DEFAULT_SETTINGS,...patch},weights,fixed:{},arrival:false,requireFullAllocation:true,priorityUnloading:true}});assert.ok(messages.some(m=>m.type==='error'));assert.ok(!messages.some(m=>m.type==='generation'||m.type==='allocationProgress'));}
});
/** 실제 Worker 반복 예약까지 포함해 완료·입력전달·재생을 확인한다. */
async function runWorker(run:number,count:number,settings:Settings,weights:Weights){
 const input=generateBoxes(count,2026);let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});let last:any,error='',seen=0;
 scope.postMessage=(m:any)=>{if(m.run!==run)return;if(m.type==='error'){error=m.message;finish();}if(m.type==='generation'){assert.equal(m.generation.number,++seen);last=m.generation;}if(m.type==='state'&&m.state==='완료')finish();};
 const start=performance.now();scope.self.onmessage({data:{type:'start',run,boxes:input,truck:DEFAULT_TRUCK,settings,weights,fixed:{},arrival:false,requireFullAllocation:true,priorityUnloading:true}});
 const timer=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});finish();},90000);await done;clearTimeout(timer);assert.equal(error,'');assert.equal(seen,settings.generations);assert.ok(last);assert.deepEqual(last.settings,settings);assert.deepEqual(last.weights,weights);assert.equal(last.individuals.length,settings.population);for(const p of last.individuals){assert.equal(p.evaluation.loaded,count);assert.equal(p.unloading.delivered,count);}checkReplay(input,last.individuals[0]);console.log(JSON.stringify({rangeWorker:{count,settings,weights,generations:seen,ms:Math.round(performance.now()-start)}}));
}
test('집단1·k6·10001세대가 실제 Worker에서 끝까지 완료되고 마지막 개체가 재생된다',()=>runWorker(15000,3,{...DEFAULT_SETTINGS,population:1,generations:10001,tournament:6,crossover:.1,mutation:.01},{base:1,moves:1,mass:1,space:1}));
test('상자100개·집단101·k6·최대교차/변이/가중치 조합도 실제 두 세대를 생성한다',()=>runWorker(15001,100,{...DEFAULT_SETTINGS,population:101,generations:2,tournament:6,crossover:1.1,mutation:1},{base:501,moves:501,mass:501,space:501}));

test('묶음 전달도10001세대·개체·부모 기록을 빠짐없이 완료 알림 전에 보낸다',async()=>{
 const run=16000;let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});let seen=0,batches=0,last:any,error='';const settings={...DEFAULT_SETTINGS,population:1,generations:10001,tournament:6};
 scope.postMessage=(m:any)=>{if(m.run!==run)return;if(m.type==='error'){error=m.message;finish();}if(m.type==='generation')assert.fail('묶음 명령은 묶음으로 전달해야 합니다.');if(m.type==='generations'){batches++;for(const g of m.generations){assert.equal(g.number,++seen);assert.equal(g.individuals.length,1);if(last)assert.deepEqual(g.individuals[0].parents,[last.individuals[0].id]);last=g;}}if(m.type==='state'&&m.state==='완료'){assert.equal(seen,10001);finish();}};
 scope.self.onmessage({data:{type:'start',run,boxes,truck:DEFAULT_TRUCK,settings,weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,requireFullAllocation:true,priorityUnloading:true,batchGenerations:true}});
 const timer=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});finish();},30000);await done;clearTimeout(timer);assert.equal(error,'');assert.equal(seen,10001);assert.ok(batches<seen);checkReplay(boxes,last.individuals[0]);console.log(JSON.stringify({batchedGenerations:seen,messages:batches}));
});

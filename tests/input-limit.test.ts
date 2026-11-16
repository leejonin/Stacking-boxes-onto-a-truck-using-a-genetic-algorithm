import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBoxCount,resolveBoxInput,generateBoxes,validateConfig,DEFAULT_SETTINGS,DEFAULT_WEIGHTS,DEFAULT_TRUCK,type Box} from '../src/domain/model';
import {AutomaticSupply} from '../src/simulation/supply';
import {Engine} from '../src/ga/engine';
import {priorityFitness} from '../src/simulation/objective';

test('1000/10000은400, 빈값/음수/0은1, 소수는정수로 보정하고 유효값은 보존한다',()=>{
 for(const n of [1000,10000,401])assert.deepEqual(normalizeBoxCount(n),{value:400,warning:'상자 수는 1~400개 정수입니다. 400개로 변경했습니다.'});
 for(const n of [NaN,-5,0])assert.equal(normalizeBoxCount(n).value,1);
 for(const n of [1,100,256,360,400])assert.deepEqual(normalizeBoxCount(n),{value:n,warning:''});
 assert.equal(normalizeBoxCount(256.7).value,256);assert.throws(()=>generateBoxes(401,1));assert.throws(()=>validateConfig(Array(401).fill(generateBoxes(1,1)[0]),DEFAULT_TRUCK,DEFAULT_SETTINGS,DEFAULT_WEIGHTS));
});
test('수정한 수량·seed를 실제 실행 목록에 반영하고 동일 입력의 편집 우선도는 유지한다',()=>{
 const boxes=generateBoxes(20,2026);boxes[0].priority=5;const previous={count:20,seed:2026,boxes};assert.equal(resolveBoxInput(20,2026,previous),boxes);
 for(const n of [100,256,360,400])assert.deepEqual(resolveBoxInput(n,913,previous),generateBoxes(n,913));
 assert.notDeepEqual(resolveBoxInput(20,913,previous),boxes);
});
test('자동 공급 마지막 묶음은 남은 한도만 채우고 누적400에서 멈추며 ID·우선도를 유지한다',()=>{
 const boxes:Box[]=Array.from({length:390},(_,i)=>({id:i+1,size:[10,10,10],weight:1,grade:0,priority:5}));
 const e=new Engine(boxes,{width:100,depth:100,height:100},DEFAULT_SETTINGS,DEFAULT_WEIGHTS);
 const best={evaluation:{finalCoords:boxes.map((_,i)=>[(i%10)*10,Math.floor(i/10)%10*10,Math.floor(i/100)*10])}} as any;
 const supply=new AutomaticSupply(boxes,913,256);const expanded=supply.expand(best,e.truck)!;assert.equal(expanded.length,400);assert.deepEqual(expanded.slice(0,390),boxes);assert.equal(new Set(expanded.map(b=>b.id)).size,400);assert.equal(supply.expand(best,e.truck),null);assert.throws(()=>new AutomaticSupply(boxes,1,401));
});
const scope=globalThis as any;scope.self={onmessage:()=>{}};scope.postMessage=()=>{};await import('../src/workers/evolution');
for(const count of [100,256,360,400])test(`${count}개 비기본 설정과 첫 세대 전 가중치 변경이 실제 Worker의 두 세대에 반영된다`,async()=>{
 const run=5000+count,settings={...DEFAULT_SETTINGS,population:6,generations:2,crossover:.65,mutation:.17,tournament:4,seed:913},truck={width:320,depth:700,height:300},weights={base:137,moves:3,mass:.3,space:31};
 let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});const generations:any[]=[];let error='',version=0;
 scope.postMessage=(m:any)=>{if(m.run!==run)return;if(m.type==='error'){error=m.message;finish();}if(m.type==='reweighted'){version=m.version;scope.self.onmessage({data:{type:'resume',run}});}if(m.type==='generation'){generations.push(m.generation);if(generations.length===2){scope.self.onmessage({data:{type:'stop',run}});finish();}}};
 scope.self.onmessage({data:{type:'start',run,boxes:generateBoxes(count,731),truck,settings,weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,requireFullAllocation:true,priorityUnloading:true}});
 scope.self.onmessage({data:{type:'weights',run,weights}});
 const timer=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});finish();},45000);await done;clearTimeout(timer);assert.equal(error,'');assert.equal(version,2);assert.equal(generations.length,2);
 for(const g of generations){assert.deepEqual(g.settings,settings);assert.deepEqual(g.weights,weights);assert.equal(g.boxes.length,count);assert.equal(g.individuals.length,6);for(const p of g.individuals){assert.equal(p.evaluation.loaded,count);assert.equal(p.unloading.delivered,count);assert.equal(p.score,priorityFitness(p.evaluation,p.unloading,weights));assert.equal(p.version,2);}}
 console.log(JSON.stringify({count,settings,weights,ms:generations.map(g=>Math.round(g.elapsed)),best:generations.map(g=>g.best)}));
});

test('실제 Worker 자동공급은 390→400개만 추가한 뒤 한도 사유로 완료한다',async()=>{
 const run=6000;let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});let error='',message='',completed=false;const counts:number[]=[];
 scope.postMessage=(m:any)=>{if(m.run!==run)return;if(m.type==='error'){error=m.message;finish();}if(m.type==='generation')counts.push(m.generation.boxes.length);if(m.type==='capacity')message=m.message;if(m.type==='state'&&m.state==='완료'){completed=true;finish();}};
 scope.self.onmessage({data:{type:'start',run,boxes:generateBoxes(390,731),truck:{width:320,depth:700,height:300},settings:{...DEFAULT_SETTINGS,population:2,tournament:2,generations:1},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:731,requireFullAllocation:true,priorityUnloading:true}});
 const timer=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});finish();},30000);await done;clearTimeout(timer);assert.equal(error,'');assert.equal(completed,true);assert.deepEqual(counts,[390,400]);assert.match(message,/400개/);
});

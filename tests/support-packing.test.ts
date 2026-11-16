import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supportSurfacePack,dependencyLoadingOrder} from '../src/domain/supportPacking';
import {partitionPack,validateLayout} from '../src/domain/packing';
import {generateBoxes,Random,DEFAULT_TRUCK,DEFAULT_SETTINGS,DEFAULT_WEIGHTS,type Box} from '../src/domain/model';
import {simulateLoading} from '../src/simulation/loading';
import {Engine,finishGeneration} from '../src/ga/engine';
import {priorityFitness} from '../src/simulation/objective';

test('빈 공간을 최대 지지면 후보로 유지해 기본 짐칸400개를 실제 전량 상차한다',()=>{
 const boxes=generateBoxes(400,2026),old=partitionPack(boxes,DEFAULT_TRUCK,new Random(2026));assert.ok(old.coords.some(p=>p[0]<0));
 const plan=supportSurfacePack(boxes,DEFAULT_TRUCK,new Random(2026));assert.ok(plan.coords.every(p=>p[0]>=0));assert.equal(validateLayout(boxes,plan.coords,DEFAULT_TRUCK),null);
 const loading=simulateLoading(boxes,plan.coords,DEFAULT_TRUCK,plan.loadOrder,{},true);assert.equal(loading.valid,true);assert.equal(loading.loaded,400);assert.equal(loading.moves,0);assert.equal(new Set(loading.events.map(e=>e.boxId)).size,400);
});
test('지지면 후보가 겹쳐도 실제 상자는 여러 seed에서 겹치거나 뜨지 않는다',()=>{
 for(const seed of [11,731,913,2026])for(const mode of [0,4]){const boxes=generateBoxes(400,seed),plan=supportSurfacePack(boxes,DEFAULT_TRUCK,new Random(seed),mode),indices=plan.coords.map((p,i)=>p[0]>=0?i:-1).filter(i=>i>=0);assert.equal(validateLayout(indices.map(i=>boxes[i]),indices.map(i=>plan.coords[i]),DEFAULT_TRUCK),null);}
});
test('받침·입구 경로의 선후관계가 있어야 상차 순서를 반환한다',()=>{
 const boxes:Box[]=[{id:1,size:[20,20,20],weight:1,priority:5,grade:0},{id:2,size:[20,20,20],weight:1,priority:1,grade:0},{id:3,size:[20,20,20],weight:1,priority:2,grade:0}];
 assert.deepEqual(dependencyLoadingOrder(boxes,[[0,20,0],[0,20,20],[0,0,0]]),[1,2,3]);assert.equal(dependencyLoadingOrder(boxes,[[0,20,0],[-1,-1,-1],[0,0,0]]),null);
});
test('물리적으로 불가능한 입력은 부분 배치를 세대로 승인하지 않고 제한된 복구 후 원인을 알린다',()=>{
 const boxes:Box[]=[1,2].map(id=>({id,size:[60,60,10],weight:1,priority:id,grade:3}));
 const e=new Engine(boxes,{width:100,depth:100,height:10},{...DEFAULT_SETTINGS,population:6},DEFAULT_WEIGHTS);e.requireFullAllocation=true;e.priorityUnloading=true;
 assert.throws(()=>finishGeneration(e),/다양한 전량 배치 전략/);assert.equal(e.generation,0);assert.equal(e.population.length,0);assert.equal(e.allocationProgress.mostLoaded,1);
});
const scope=globalThis as any;scope.self={onmessage:()=>{}};scope.postMessage=()=>{};await import('../src/workers/evolution');
for(const count of [256,360,400])test(`기본 짐칸 ${count}개·집단50의 실제 Worker가 완전한 두 세대를 생성한다`,async()=>{
 const run=9000+count;let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});const generations:any[]=[];let error='';
 scope.postMessage=(m:any)=>{if(m.run!==run)return;if(m.type==='error'){error=m.message;finish();}if(m.type==='generation'){generations.push(m.generation);if(generations.length===2){scope.self.onmessage({data:{type:'stop',run}});finish();}}};
 scope.self.onmessage({data:{type:'start',run,boxes:generateBoxes(count,2026),truck:DEFAULT_TRUCK,settings:{...DEFAULT_SETTINGS,generations:2},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,requireFullAllocation:true,priorityUnloading:true}});
 const timer=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});finish();},120000);await done;clearTimeout(timer);assert.equal(error,'');assert.equal(generations.length,2);
 for(const [i,g] of generations.entries()){assert.equal(g.number,i+1);assert.equal(g.individuals.length,50);for(const p of g.individuals){assert.equal(p.evaluation.loaded,count);assert.equal(p.unloading.delivered,count);assert.equal(validateLayout(g.boxes,p.evaluation.finalCoords,DEFAULT_TRUCK),null);assert.equal(p.score,priorityFitness(p.evaluation,p.unloading,DEFAULT_WEIGHTS));}}
 assert.ok(generations[1].best>=generations[0].best);console.log(JSON.stringify({defaultTruckBoxes:count,population:50,ms:generations.map(g=>Math.round(g.elapsed)),best:generations.map(g=>g.best)}));
});

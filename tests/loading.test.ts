import {test} from 'node:test';
import assert from 'node:assert/strict';
import {type Box,type Vec,DEFAULT_WEIGHTS,DEFAULT_SETTINGS} from '../src/domain/model';
import {simulateLoading,loadingFitness} from '../src/simulation/loading';
import {pack,validateLayout} from '../src/domain/packing';
import {Random} from '../src/domain/model';
import {Engine,finishGeneration} from '../src/ga/engine';
import {Arrival} from '../src/simulation/arrival';
/** 상차 순서의 손계산에 사용하는 같은 크기의 상자. */
const box=(id:number):Box=>({id,size:[20,20,20],weight:2,priority:1,grade:0});
const truck={width:20,depth:60,height:20},weights={base:100,moves:10,mass:1,space:0,fill:0};
test('최초 상차는 무료, 앞 상자를 먼저 넣으면 뒤 상자 상차에 2회·4kg 재배치',()=>{
 const boxes=[box(1),box(2)],coords:Vec[]=[[0,0,0],[0,40,0]];
 const bad=simulateLoading(boxes,coords,truck,[1,2]);
 assert.equal(bad.valid,true,bad.reason);assert.equal(bad.loaded,2);assert.equal(bad.moves,2);assert.equal(bad.mass,4);assert.equal(loadingFitness(bad,weights),76);
 assert.deepEqual(bad.events.map(e=>`${e.kind}:${e.boxId}`),['load:1','out:1','load:2','return:1']);
 const good=simulateLoading(boxes,coords,truck,[2,1]);assert.equal(good.moves,0);assert.equal(good.loaded,2);assert.equal(loadingFitness(good,weights),100);
 assert.equal(good.events.filter(e=>e.kind==='deliver').length,0);
});
test('미적재를 허용하여 적재량 차이를 점수로 반영하고 부피 활용을 실측한다',()=>{
 const boxes=[box(1),box(2)],small={width:20,depth:20,height:20};
 const p=pack(boxes,small,new Random(1),undefined,{},true)!;assert.ok(p);
 const result=simulateLoading(boxes,p.coords,small,[1,2]);assert.ok(result.valid);assert.equal(result.loaded,1);assert.equal(result.loadedVolume,8000);assert.equal(result.utilization,1);assert.equal(result.coverage,.5);assert.equal(loadingFitness(result,weights),50);
 assert.equal(result.unloadedIds.length,1);
});
test('지지 상자를 나중에 싣는 순서는 자동 정렬로 숨기지 않고 미적재로 처리한다',()=>{
 const boxes=[box(1),box(2)],t={width:20,depth:20,height:40},coords:Vec[]=[[0,0,0],[0,0,20]];
 const wrong=simulateLoading(boxes,coords,t,[2,1]),right=simulateLoading(boxes,coords,t,[1,2]);
 assert.equal(wrong.loaded,1);assert.deepEqual(wrong.unloadedIds,[2]);assert.equal(right.loaded,2);assert.equal(right.moves,0);
 assert.ok(loadingFitness(right,weights)>loadingFitness(wrong,weights));
});
test('기존 확정 적재는 움직이지 않고, 경로가 막힌 신규 상자는 미적재로 남긴다',()=>{
 const boxes=[box(1),box(2)],coords:Vec[]=[[0,0,0],[0,40,0]],fixed={1:[0,0,0] as Vec};
 const e=simulateLoading(boxes,coords,truck,[2,1],fixed);assert.ok(e.valid);assert.equal(e.loaded,1);assert.equal(e.moves,0);assert.deepEqual(e.finalCoords[0],fixed[1]);assert.deepEqual(e.unloadedIds,[2]);
 assert.equal(simulateLoading(boxes,[[0,20,0],[0,40,0]],truck,[1,2],fixed).valid,false);
});
test('상차 이벤트를 단계별 적용하면 모든 중간 적재 상태가 경계·겹침·지지를 지킨다',()=>{
 const boxes=[box(1),box(2),box(3)],coords:Vec[]=[[0,0,0],[0,40,0],[0,0,20]],t={...truck,height:40};
 const e=simulateLoading(boxes,coords,t,[1,3,2]);assert.ok(e.valid,e.reason);const positions=new Map<number,Vec>();
 for(const event of e.events){if(event.to)positions.set(event.boxId,event.to);else positions.delete(event.boxId);const present=boxes.filter(b=>positions.has(b.id));assert.equal(validateLayout(present,present.map(b=>positions.get(b.id)!),t),null);}
 assert.equal(positions.size,e.loaded);assert.deepEqual(e.finalCoords,coords);
});
test('같은 적재량이면 조밀한 배치가 공간 보상을 더 받는다',()=>{
 const boxes=[box(1),box(2)],t={width:20,depth:100,height:20};
 const compact=simulateLoading(boxes,[[0,0,0],[0,20,0]],t,[2,1]);
 const spread=simulateLoading(boxes,[[0,0,0],[0,80,0]],t,[2,1]);
 assert.equal(compact.loaded,spread.loaded);assert.equal(compact.moves,spread.moves);assert.ok(loadingFitness(compact,DEFAULT_WEIGHTS)>loadingFitness(spread,DEFAULT_WEIGHTS));
});
test('용량 초과 입력도 GA가 유효한 부분 상차를 비교하며 순서 유전자는 순열을 유지한다',()=>{
 const boxes=[box(1),box(2),box(3)],t={width:20,depth:40,height:20},e=new Engine(boxes,t,{...DEFAULT_SETTINGS,population:8,mutation:.5},DEFAULT_WEIGHTS);
 let previous=-Infinity;
 for(let k=0;k<5;k++){const g=finishGeneration(e);assert.ok(g.best>=previous);previous=g.best;for(const p of g.individuals){assert.ok(p.evaluation.loaded<=2);assert.deepEqual([...p.loadOrder].sort(),[1,2,3]);}}
});
test('일부만 상차 확정해도 미적재 상자는 대기 공간에 남고 도착 데이터가 사라지지 않는다',()=>{
 const a=new Arrival([box(1),box(2)],7);a.receive();a.receive();const b=[...a.waiting].sort((a,b)=>a.id-b.id);
 a.commit(b,[[0,0,0],[-1,-1,-1]],truck);assert.equal(a.loaded.length,1);assert.equal(a.waiting.length,1);assert.equal(a.waiting[0].id,2);assert.equal(a.cursor,2);
});


test('짐칸 부피 활용률 보상은 기본 최대50점이며 사용자 입력에 비례한다',()=>{
 const e={valid:true,coverage:0,compactness:0,moves:0,mass:0,utilization:.8},w={base:0,moves:0,mass:0,space:0};
 assert.equal(DEFAULT_WEIGHTS.fill,50);
 assert.equal(loadingFitness(e,w),40);assert.equal(loadingFitness({...e,utilization:.9},w),45);
 assert.equal(loadingFitness({...e,utilization:1},w),50);assert.equal(loadingFitness(e,{...w,fill:100}),80);
 assert.equal(loadingFitness(e,{...w,fill:0}),0);
});

test('짐칸 활용률 보상 변경을 현재 집단에 재적용하며 좌표와 누적 비용을 유지한다',()=>{
 const engine=new Engine([box(1)],truck,{...DEFAULT_SETTINGS,population:3},DEFAULT_WEIGHTS);finishGeneration(engine);
 const before=structuredClone(engine.population);engine.reweight({...DEFAULT_WEIGHTS,fill:100});
 for(let i=0;i<before.length;i++){assert.ok(Math.abs(engine.population[i].score-before[i].score-50*before[i].evaluation.utilization)<=.011);assert.deepEqual(engine.population[i].coords,before[i].coords);assert.deepEqual(engine.population[i].evaluation,before[i].evaluation);}
 assert.throws(()=>engine.reweight({...DEFAULT_WEIGHTS,fill:-1}));
});

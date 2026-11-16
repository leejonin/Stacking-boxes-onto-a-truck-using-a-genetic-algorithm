import {test} from 'node:test';
import assert from 'node:assert/strict';
import {type Box,type Vec,DEFAULT_SETTINGS,DEFAULT_WEIGHTS} from '../src/domain/model';
import {evaluateStackLoad} from '../src/simulation/stackLoad';
import {simulateLoaded,unloadingFitness} from '../src/simulation/unload';
import {Engine} from '../src/ga/engine';
const box=(id:number,weight:number,size:Vec=[20,20,20],priority=1):Box=>({id,weight,size,priority,grade:0});
const truck={width:80,depth:80,height:100};

test('가벼운 아래 상자가 받는 상부 총중량 중 자기 무게 초과분만 감점 원자료로 계산한다',()=>{
 const result=evaluateStackLoad([box(1,1),box(2,5)],[[0,0,0],[0,0,20]],truck);
 assert.ok(result.valid);assert.equal(result.excessMass,4);assert.deepEqual(result.loads,[{boxId:1,aboveMass:5,excessMass:4},{boxId:2,aboveMass:0,excessMass:0}]);
 assert.equal(evaluateStackLoad([box(1,5),box(2,1)],[[0,0,0],[0,0,20]],truck).excessMass,0);
});
test('상부 여러 층의 무게가 중간 상자를 거쳐 맨 아래까지 전달된다',()=>{
 const result=evaluateStackLoad([box(1,1),box(2,2),box(3,3)],[[0,0,0],[0,0,20],[0,0,40]],truck);
 assert.ok(result.valid);assert.equal(result.loads[0].aboveMass,5);assert.equal(result.loads[1].aboveMass,3);assert.equal(result.excessMass,5);
});
test('한 상자를 여러 상자가 받치면 접촉 면적 비율로 하중을 분담한다',()=>{
 const result=evaluateStackLoad([box(1,1,[10,20,20]),box(2,4,[30,20,20]),box(3,8,[40,20,20])],[[0,0,0],[10,0,0],[0,0,20]],truck);
 assert.ok(result.valid);assert.equal(result.loads[0].aboveMass,2);assert.equal(result.loads[1].aboveMass,6);assert.equal(result.excessMass,3);
});
test('미적재는 하중·하차 대상에서 제외하고 겹침·공중부양·중복 ID는 거부한다',()=>{
 const boxes=[box(1,2),box(2,2)];
 assert.equal(evaluateStackLoad(boxes,[[0,0,0],[-1,-1,-1]],truck).excessMass,0);
 assert.equal(simulateLoaded(boxes,[[0,0,0],[-1,-1,-1]],truck).delivered,1);
 for(const coords of [[[0,0,0],[0,0,0]],[[0,0,0],[0,0,21]]] as Vec[][])assert.equal(evaluateStackLoad(boxes,coords,truck).valid,false);
 assert.equal(evaluateStackLoad([box(1,2),box(1,2)],[[0,0,0],[20,0,0]],truck).valid,false);
});
test('상부 하중 감점은 재이동 중량 항목과 별개이며 각각의 가중치·보상 입력을 반영한다',()=>{
 const u={valid:true,moves:2,mass:999},loading={valid:true,coverage:1,compactness:0,utilization:.8},bearing={valid:true,excessMass:4};
 assert.equal(unloadingFitness(u,loading,bearing,{base:100,moves:10,mass:1,amount:0,space:0,fill:0,travelMass:0}),76);
 assert.equal(unloadingFitness({...u,mass:0},loading,bearing,{base:100,moves:10,mass:2,amount:100,space:0,fill:50,travelMass:0}),212);
});
test('하차 GA는 상차 비용 대신 하차 우선순위를 평가하고 재채점해도 실제 배치를 보존한다',()=>{
 const boxes=[box(1,2,[20,20,20],1),box(2,2,[20,20,20],5)],small={width:20,depth:60,height:20};
 const weights={...DEFAULT_WEIGHTS,amount:100,space:0,fill:50};
 const e=new Engine(boxes,small,DEFAULT_SETTINGS,weights);e.objective='unloading';
 const bad=e.evaluate([[0,0,0],[0,40,0]],[],'방해 배치',false,[2,1])!,good=e.evaluate([[0,40,0],[0,0,0]],[],'우선순위 배치',false,[1,2])!;
 assert.equal(bad.evaluation.moves,0);assert.equal(bad.unloading!.moves,2);assert.equal(bad.bearing!.excessMass,0);assert.equal(bad.score,209.33);assert.equal(good.score,233.33);
 assert.deepEqual(simulateLoaded(boxes,good.evaluation.finalCoords,small).events.filter(e=>e.kind==='deliver').map(e=>e.boxId),[2,1]);
 e.population=[good];const before=structuredClone(good);e.reweight({...weights,fill:0});assert.equal(e.population[0].score,200);assert.deepEqual(e.population[0].coords,before.coords);assert.deepEqual(e.population[0].bearing,before.bearing);
});


test('같은 하차 우선순위와 재이동 횟수에서 가벼운 상자를 옮기는 배치가 높은 점수를 받는다',()=>{
 const loading={valid:true,coverage:1,compactness:0,utilization:1},bearing={valid:true,excessMass:0},w={base:100,moves:10,mass:1,travelMass:1,amount:0,space:0,fill:0};
 assert.equal(unloadingFitness({valid:true,moves:2,mass:4},loading,bearing,w),76);
 assert.equal(unloadingFitness({valid:true,moves:2,mass:10},loading,bearing,w),70);
});

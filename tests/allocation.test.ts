import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine,finishGeneration} from '../src/ga/engine';
import {DEFAULT_SETTINGS,DEFAULT_WEIGHTS,type Box} from '../src/domain/model';
const boxes:Box[]=[1,2,3].map(id=>({id,size:[20,20,20],weight:2,priority:id,grade:0}));
const truck={width:40,depth:60,height:40};
test('할당된 상자 중 하나라도 미적재이면 다음 세대 후보로 인정하지 않는다',()=>{
 const e=new Engine(boxes.slice(0,2),truck,DEFAULT_SETTINGS,DEFAULT_WEIGHTS);e.requireFullAllocation=true;
 assert.equal(e.evaluate([[0,0,0],[-1,-1,-1]],[],'미적재',false,[1,2]),null);
 assert.equal(e.evaluate([[0,0,0],[0,0,20]],[],'지지 순서 미완료',false,[2,1]),null);
 assert.equal(e.evaluate([[0,0,0],[0,0,20]],[],'전체 상차',false,[1,2])!.evaluation.loaded,2);
});
test('유효한 완전 적재 집단이 전부 준비된 뒤에만 세대 번호를 올린다',()=>{
 const e=new Engine(boxes,truck,{...DEFAULT_SETTINGS,population:8},DEFAULT_WEIGHTS);e.requireFullAllocation=true;
 const iter=e.next();let result=iter.next();while(!result.done){assert.equal(e.generation,0);result=iter.next();}
 assert.equal(e.generation,1);assert.equal(result.value.individuals.length,8);assert.ok(result.value.individuals.every(p=>p.evaluation.loaded===3&&p.evaluation.unloadedIds.length===0));
 const second=finishGeneration(e);assert.equal(second.number,2);assert.ok(second.individuals.every(p=>p.evaluation.loaded===3));
});
test('전체 할당이 물리적으로 불가능하면 일부만 싣고 세대를 올리지 않는다',()=>{
 const e=new Engine(boxes.slice(0,2),{width:20,depth:20,height:20},DEFAULT_SETTINGS,DEFAULT_WEIGHTS);e.requireFullAllocation=true;
 assert.throws(()=>finishGeneration(e),/총부피/);assert.equal(e.generation,0);assert.equal(e.population.length,0);
 const large=new Engine([{...boxes[0],size:[30,20,20]}],{width:20,depth:20,height:20},DEFAULT_SETTINGS,DEFAULT_WEIGHTS);large.requireFullAllocation=true;
 assert.throws(()=>finishGeneration(large),/치수/);assert.equal(large.generation,0);
});


test('고정 적재물이 있는 순차 모드도 순서 복구 시 전체 할당 ID를 보존한다',()=>{
 const e=new Engine(boxes,{width:20,depth:20,height:60},{...DEFAULT_SETTINGS,population:2,tournament:2},DEFAULT_WEIGHTS,{1:[0,0,0]});
 e.requireFullAllocation=true;e.seedLayout=[[0,0,0],[0,0,20],[0,0,40]];e.rng.shuffle=<T>(items:T[])=>[...items].reverse();
 const g=finishGeneration(e);assert.ok(g.individuals.some(p=>p.operation.includes('상차순서 복구')));
 for(const p of g.individuals){assert.equal(p.evaluation.loaded,3);assert.deepEqual([...p.loadOrder].sort(),[1,2,3]);assert.deepEqual(p.coords[0],[0,0,0]);}
});

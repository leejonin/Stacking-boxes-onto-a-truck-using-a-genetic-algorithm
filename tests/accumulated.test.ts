import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateAccumulatedLoading} from '../src/simulation/accumulated';
import {type Box,type Vec,DEFAULT_SETTINGS,DEFAULT_WEIGHTS} from '../src/domain/model';
import {Engine,finishGeneration} from '../src/ga/engine';
import {validateLayout} from '../src/domain/packing';
const box=(id:number):Box=>({id,size:[20,20,20],weight:2,priority:1,grade:0});
const truck={width:60,depth:100,height:40};

test('기존 상자를 그대로 유지하면 추가 공급에도 비용이 늘지 않는다',()=>{
 const e=simulateAccumulatedLoading([box(1),box(2)],[[0,0,0],[20,0,0]],truck,[1,2],{positions:{1:[0,0,0]},moves:3,mass:6});
 assert.ok(e.valid,e.reason);assert.equal(e.loaded,2);assert.equal(e.moves,3);assert.equal(e.mass,6);assert.deepEqual(e.events.map(e=>e.kind),['load']);
});
test('기존 상자의 좌표 이동은 꺼냄·복귀를 합쳐 한 번 감점하며 이전 비용을 유지한다',()=>{
 const e=simulateAccumulatedLoading([box(1),box(2)],[[20,0,0],[40,0,0]],truck,[1,2],{positions:{1:[0,0,0]},moves:3,mass:6});
 assert.ok(e.valid,e.reason);assert.equal(e.loaded,2);assert.equal(e.moves,4);assert.equal(e.mass,8);
 assert.deepEqual(e.events.map(e=>e.kind),['out','return','load']);assert.deepEqual(e.finalCoords[0],[20,0,0]);
});
test('최종 좌표가 같아도 신규 상차를 막아 임시 이동한 기존 상자는 한 번 감점한다',()=>{
 const boxes=[box(1),box(2),box(3)],coords:Vec[]=[[0,0,0],[0,40,0],[0,70,0]],snapshot={positions:{1:[0,0,0] as Vec},moves:0,mass:0};
 const e=simulateAccumulatedLoading(boxes,coords,truck,[3,2,1],snapshot);
 assert.ok(e.valid,e.reason);assert.equal(e.loaded,3);assert.equal(e.moves,1);assert.equal(e.mass,2);
 const positions=new Map<number,Vec>([[1,[0,0,0]]]);
 for(const event of e.events){if(event.to)positions.set(event.boxId,event.to);else positions.delete(event.boxId);const present=boxes.filter(b=>positions.has(b.id));assert.equal(validateLayout(present,present.map(b=>positions.get(b.id)!),truck),null);}
 assert.deepEqual(e.finalCoords,coords);
});
test('이미 상차한 상자를 미적재로 바꾸는 후보를 거부한다',()=>{
 const e=simulateAccumulatedLoading([box(1),box(2)],[[-1,-1,-1],[20,0,0]],truck,[1,2],{positions:{1:[0,0,0]},moves:0,mass:0});
 assert.equal(e.valid,false);assert.match(e.reason,/미적재/);
});
test('누적 공급 이후 모든 후손은 이전 상자 ID를 유지하며 재이동 비용은 초기화되지 않는다',()=>{
 const settings={...DEFAULT_SETTINGS,population:6,mutation:.3};
 const old=new Engine([box(1)],truck,settings,DEFAULT_WEIGHTS);old.accumulated={positions:{1:[0,0,0]},moves:2,mass:4};
 const committed=old.evaluate([[0,0,0]],[],'검증',false,[1])!;old.population=[committed];
 const next=new Engine([box(1),box(2)],truck,settings,DEFAULT_WEIGHTS);next.inherit(old,'r1-',committed);
 assert.equal(next.population[0].score,committed.score);
 for(let i=0;i<8;i++){
  const g=finishGeneration(next);
  for(const p of g.individuals){assert.ok(p.evaluation.finalCoords[0][0]>=0);assert.ok(p.evaluation.moves>=2);assert.ok(p.evaluation.mass>=4);}
 }
 assert.equal(next.evaluate([[-1,-1,-1],[20,0,0]],[],'유실',false,[1,2]),null);
});

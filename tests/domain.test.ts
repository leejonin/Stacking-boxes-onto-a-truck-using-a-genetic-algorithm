import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoxes,gradeOf,Random,DEFAULT_SETTINGS,DEFAULT_WEIGHTS,type Box,type Vec } from '../src/domain/model';
import { validateLayout,supported,loadingOrder } from '../src/domain/packing';
import { simulate,fitness } from '../src/simulation/unload';
import { Arrival } from '../src/simulation/arrival';
import { Engine,finishGeneration } from '../src/ga/engine';
/** 손계산용 20cm 정육면체 상자를 만든다. */
const box=(id:number,priority:number,weight=2,size:Vec=[20,20,20]):Box=>({id,size,weight,priority,grade:0});
const truck={width:20,depth:80,height:60};
test('5등급 무작위 생성은 공식 상한과 선택 등급을 지키고 seed를 재현한다',()=>{
 const boxes=generateBoxes(240,2026);assert.deepEqual(boxes,generateBoxes(240,2026));assert.equal(boxes.length,240);assert.equal(boxes.at(-1)?.id,240);assert.equal(new Set(boxes.map(b=>b.grade)).size,5);
 for(const b of boxes){assert.equal(gradeOf(b.size,b.weight),b.grade);assert.ok(Math.max(...b.size)<=100);assert.ok(b.size.every(n=>n>=10));}
 assert.equal(gradeOf([20,20,40],2),0);assert.equal(gradeOf([20,20,41],2),1);assert.equal(gradeOf([20,20,40],2.1),1);
 assert.equal(gradeOf([40,40,40],10),2);assert.equal(gradeOf([40,40,40],10.1),3);assert.equal(gradeOf([20,40,100],20),4);
 assert.equal(gradeOf([20,39,101],1),-1);assert.equal(gradeOf([20,40,100],20.1),-1);
 assert.throws(()=>generateBoxes(0,1));
});
test('면 접촉·경계는 허용, 겹침·공중부양·공간 초과·고정 좌표 변경은 거부',()=>{
 const b=[box(1,1),box(2,2)];assert.equal(validateLayout(b,[[0,0,0],[0,20,0]],truck),null);
 assert.ok(validateLayout(b,[[0,0,0],[0,19,0]],truck));assert.ok(validateLayout(b,[[0,0,0],[0,20,1]],truck));
 assert.ok(validateLayout(b,[[0,0,0],[1,20,0]],truck));assert.ok(validateLayout(b,[[0,0,0],[0,20,0]],truck,{1:[0,1,0]}));
});
test('밑면 합집합 지지: 두 받침은 허용, 가운데 빈틈은 거부',()=>{
 const top={box:box(3,1,2,[40,20,20]),pos:[0,0,20] as Vec};
 assert.ok(supported(top,[{box:box(1,1),pos:[0,0,0]},{box:box(2,1),pos:[20,0,0]}]));
 assert.equal(supported(top,[{box:box(1,1,2,[19,20,20]),pos:[0,0,0]},{box:box(2,1,2,[19,20,20]),pos:[21,0,0]}]),false);
});
test('직선 하차의 손계산: 방해 2kg 상자 왕복=2회·4kg·76점',()=>{
 const b=[box(1,1),box(2,5,3)],e=simulate(b,[[0,0,0],[0,40,0]],truck);
 assert.ok(e.valid,e.reason);assert.equal(e.moves,2);assert.equal(e.mass,4);assert.equal(fitness(e,DEFAULT_WEIGHTS),76);assert.equal(e.delivered,2);
 assert.deepEqual(e.events.map(x=>x.kind),['out','deliver','return','deliver']);
 const good=simulate(b,[[0,40,0],[0,0,0]],truck);assert.equal(good.moves,0);assert.equal(fitness(good,DEFAULT_WEIGHTS),100);
 assert.equal(fitness(e,{base:100,moves:100,mass:10}),-140);
});
test('위에 있는 상자는 먼저 내려놓고 바닥 상자 배송 뒤 유효 위치로 복귀',()=>{
 const b=[box(1,5),box(2,1,4)],e=simulate(b,[[0,0,0],[0,0,20]],truck);
 assert.ok(e.valid,e.reason);assert.equal(e.moves,2);assert.equal(e.mass,8);assert.equal(e.events[0].boxId,2);assert.equal(e.events[2].to?.[2],0);
});
test('동일 우선도는 ID 순서로 최종 배송하며 원본 좌표를 변경하지 않는다',()=>{
 const b=[box(2,2),box(1,2)],c:Vec[]=[[0,40,0],[0,0,0]],copy=structuredClone(c),e=simulate(b,c,truck);
 assert.deepEqual(e.events.filter(x=>x.kind==='deliver').map(x=>x.boxId),[1,2]);assert.deepEqual(c,copy);
});
test('안전한 상차 순서와 이미 적재된 상자의 경로 방해를 구분한다',()=>{
 const b=[box(1,1),box(2,2)],c:Vec[]=[[0,0,0],[0,40,0]];
 assert.deepEqual(loadingOrder(b,c,truck),[2,1]);assert.equal(loadingOrder(b,c,truck,{1:[0,0,0]}),null);
});
test('도착 40개 한도·동일 도착 seed·상차 후 대기 해제·기존 좌표 보존',()=>{
 const all=generateBoxes(45,4),a=new Arrival(all,3),b=new Arrival(all,3);
 for(let i=0;i<40;i++){assert.ok(a.receive());b.receive();}assert.equal(a.receive(),false);assert.equal(a.cursor,40);assert.deepEqual(a.waiting,b.waiting);
 const t=new Arrival([box(1,1),box(2,2)],3);t.receive();const first=t.waiting[0];t.commit([first],[[0,40,0]],truck);assert.equal(t.waiting.length,0);assert.deepEqual(t.fixed[first.id],[0,40,0]);t.receive();assert.equal(t.waiting.length,1);
});
test('상차 GA는 불리한 초기 상차 순서를 실제 개선하며 엘리트·계보·seed를 보존한다',()=>{
 const boxes=[box(1,5),box(2,3),box(3,1)],config={...DEFAULT_SETTINGS,population:12,generations:12,mutation:.6,seed:29};
 const e=new Engine(boxes,{width:20,depth:60,height:20},config,DEFAULT_WEIGHTS);
 const bad:Vec[]=[[0,40,0],[0,20,0],[0,0,0]];
 e.population=Array.from({length:12},()=>e.evaluate(bad,[],'검증 초기',false,[3,2,1])!);e.generation=1;
 const initial=e.population[0].score;let previous=initial;
 for(let i=0;i<12;i++){const parentIds=new Set(e.population.map(p=>p.id));const g=finishGeneration(e);assert.ok(g.best>=previous);previous=g.best;for(const p of g.individuals){assert.equal(validateLayout(boxes,p.coords,e.truck),null);assert.ok(p.parents.every(id=>parentIds.has(id)));}}
 assert.ok(previous>initial,`${initial} → ${previous}`);
 const a=new Engine(boxes,e.truck,config,DEFAULT_WEIGHTS),b=new Engine(boxes,e.truck,config,DEFAULT_WEIGHTS);assert.deepEqual(finishGeneration(a).individuals,finishGeneration(b).individuals);
 const snapshot=structuredClone(a.population);a.reweight({base:100,moves:2,mass:3});assert.equal(snapshot[0].version,1);assert.equal(a.population[0].version,2);
});
test('고정 상자는 GA 교차·변이 후에도 정확히 같은 좌표를 유지한다',()=>{
 const boxes=[box(1,1),box(2,5)],fixed={1:[0,60,0] as Vec},e=new Engine(boxes,truck,{...DEFAULT_SETTINGS,population:8,mutation:1},DEFAULT_WEIGHTS,fixed,true);
 for(let i=0;i<4;i++)for(const p of finishGeneration(e).individuals)assert.deepEqual(p.coords[0],fixed[1]);
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {Engine,finishGeneration} from '../src/ga/engine';
import {DEFAULT_SETTINGS,DEFAULT_WEIGHTS,type Box,type Individual,type Vec} from '../src/domain/model';
import {simulate} from '../src/simulation/unload';
const input:Box[]=[{id:1,size:[20,20,20],weight:2,priority:5,grade:0},{id:2,size:[20,20,20],weight:3,priority:1,grade:1}],truck={width:20,depth:40,height:20},blocked:Vec[]=[[0,20,0],[0,0,0]];
function engine(){const e=new Engine(structuredClone(input),truck,{...DEFAULT_SETTINGS,population:3,tournament:3,mutation:.3},DEFAULT_WEIGHTS);e.priorityUnloading=true;return e;}
function completed(p:Individual){assert.equal(p.evaluation.loaded,2);assert.equal(p.evaluation.unloadedIds.length,0);assert.equal(p.unloading!.valid,true);assert.equal(p.unloading!.delivered,2);assert.deepEqual(p.unloadOrder,[1,2]);}
test('빨간차 목표처럼 P5 경로를 막은 P1의 임시 이동·복귀만2회6kg 감점하고 전량하차한다',()=>{
 const e=engine(),p=e.evaluate(blocked,[],'방해 배치',false,[1,2])!;completed(p);assert.equal(p.evaluation.moves,0);assert.equal(p.unloading!.moves,2);assert.equal(p.unloading!.mass,6);assert.equal(p.score,94);
 const replay=simulate(input,p.evaluation.finalCoords,truck,true,true);assert.deepEqual(replay.events.map(x=>[x.kind,x.boxId]),[['out',2],['deliver',1],['return',2],['deliver',2]]);assert.equal(replay.delivered,2);assert.equal(replay.events[1].moves,1);assert.equal(replay.events[3].moves,2);
 const good=e.evaluate([[0,0,0],[0,20,0]],[],'자유 경로',false,[2,1])!;assert.equal(good.unloading!.moves,0);assert.equal(good.score,120);
});
test('같은 우선도는ID순으로 모두 배송하고 마지막까지 완료해야유효하다',()=>{
 const same=input.map(b=>({...b,priority:5})),ev=simulate(same,blocked,truck,true,true);assert.equal(ev.valid,true);assert.equal(ev.delivered,2);assert.deepEqual(ev.events.filter(x=>x.kind==='deliver').map(x=>x.boxId),[1,2]);
});
test('미하차·잘못된순서·실패·기록없는 고득점개체는 엘리트와부모풀에서제외한다',()=>{
 const e=engine(),good=e.evaluate(blocked,[],'기준',false,[1,2])!;
 const bad=[{...good,id:'partial',score:1e9,unloading:{...good.unloading!,delivered:1}},{...good,id:'wrong-order',score:1e9,unloadOrder:[2,1]},{...good,id:'invalid',score:1e9,unloading:{...good.unloading!,valid:false}},{...good,id:'missing',score:1e9,unloading:undefined}];
 e.population=[...bad,good];e.generation=1;const g=finishGeneration(e);assert.equal(g.number,2);assert.deepEqual(g.individuals[0].parents,[good.id]);for(const p of g.individuals){completed(p);assert.ok(p.parents.every(id=>!bad.some(b=>b.id===id)));}
});
/** 평가기 결함·오래된 캐시를 흉내내어 valid만 true인 부분 하차 결과를 주입한다. */
class PartialEngine extends Engine {
 partial=false;once=false;captured:Individual[]=[];
 *evaluateSteps(...args:Parameters<Engine['evaluateSteps']>):Generator<void,Individual|null,void>{const p=yield*super.evaluateSteps(...args);if(!p)return p;if(this.partial||this.once){this.once=false;return {...p,unloading:{...p.unloading!,delivered:1}};}this.captured.push(p);return p;}
}
function partialEngine(){const e=new PartialEngine(structuredClone(input),truck,{...DEFAULT_SETTINGS,population:3,tournament:3},DEFAULT_WEIGHTS);e.priorityUnloading=true;return e;}
test('valid가true여도부분하차후보는완료개체수에더하지않고재시도한다',()=>{
 const e=partialEngine();e.once=true;const iter=e.next();let r=iter.next(),sawRejected=false;
 while(!r.done){assert.equal(e.generation,0);if(!e.once&&e.captured.length===0){assert.equal(e.allocationProgress.ready,0);sawRejected=true;}r=iter.next();}
 assert.ok(sawRejected);assert.equal(r.value.individuals.length,3);for(const p of r.value.individuals)completed(p);
});
test('나머지후보가모두부분하차하면이전세대와집단을유지하고다음세대를발행하지않는다',()=>{
 const e=partialEngine();finishGeneration(e);const snapshot=structuredClone(e.population);e.partial=true;assert.throws(()=>finishGeneration(e),/전량 하차.*유효 집단/);assert.equal(e.generation,1);assert.deepEqual(e.population,snapshot);
});
test('수집중완료기록이깨져도최종세대확정전에다시검사한다',()=>{
 const e=partialEngine(),iter=e.next();let r=iter.next();while(!r.done&&e.allocationProgress.ready<1)r=iter.next();assert.equal(e.allocationProgress.ready,1);assert.equal(e.generation,0);e.captured[0].unloading!.delivered=1;
 assert.throws(()=>{while(!r.done)r=iter.next();},/전량 하차를 완료하지 못한 개체/);assert.equal(e.generation,0);assert.equal(e.population.length,0);
});
test('실제하차생성기를진행해도모든개체완료후마지막확정에서만세대번호가증가한다',()=>{
 const e=engine(),iter=e.next(),ready=new Set<number>();let r=iter.next();while(!r.done){ready.add(e.allocationProgress.ready);assert.equal(e.generation,0);assert.equal(e.population.length,0);r=iter.next();}assert.ok(ready.has(0)&&ready.has(1)&&ready.has(2)&&ready.has(3));assert.equal(e.generation,1);assert.equal(e.population.length,3);for(const p of r.value.individuals)completed(p);
});

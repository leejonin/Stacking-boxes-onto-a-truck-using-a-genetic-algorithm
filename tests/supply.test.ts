import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutomaticSupply,availableLoadingSlot} from '../src/simulation/supply';
import {Engine,finishGeneration} from '../src/ga/engine';
import {DEFAULT_WEIGHTS,DEFAULT_SETTINGS,DEFAULT_TRUCK,generateBoxes,type Box,type Vec} from '../src/domain/model';
/** 이미 상차된 작은 상자 목록을 만들어 공급 총량과 물리 공간을 분리해 검사한다. */
function initial() {
 const boxes:Box[]=Array.from({length:18},(_,i)=>({id:i+1,size:[20,20,20],weight:1,priority:1,grade:0}));
 const coords:Vec[]=boxes.map((_,i)=>[0,i*20,0]);const truck={width:100,depth:1000,height:100};
 const e=new Engine(boxes,truck,DEFAULT_SETTINGS,DEFAULT_WEIGHTS),best=e.evaluate(coords,[],'검증',false,boxes.map(b=>b.id).reverse())!;
 return {boxes,coords,truck,best};
}
test('18개를 모두 실어도 공급이 끝나지 않으며 여러 회차의 ID·규격·seed를 보존한다',()=>{
 const {boxes,truck,best}=initial(),a=new AutomaticSupply(boxes,2026,8),b=new AutomaticSupply(boxes,2026,8);
 for(let i=0;i<6;i++){assert.ok(a.expand(best,truck));b.expand(best,truck);}
 assert.ok(a.boxes.length>18);assert.equal(a.boxes.length,66);assert.equal(new Set(a.boxes.map(b=>b.id)).size,66);assert.deepEqual(a.boxes,b.boxes);assert.equal(a.round,7);
});
test('입력 개수와 무관하게 최소 규격을 넣을 실제 공간·입구 경로를 확인한다',()=>{
 const {boxes,coords,truck}=initial();assert.ok(availableLoadingSlot(boxes,coords,truck));
 assert.equal(availableLoadingSlot([boxes[0]],[[0,0,0]],{width:20,depth:20,height:20}),null);
});

test('100→101세대에 실제 부모·상차 순서·점수를 계승하고 18개를 넘겨 적재한다',()=>{
 const settings={...DEFAULT_SETTINGS,population:6};
 const engine=new Engine(generateBoxes(18,2026),DEFAULT_TRUCK,settings,DEFAULT_WEIGHTS);
 let last=finishGeneration(engine);for(let i=1;i<100;i++)last=finishGeneration(engine);
 const supply=new AutomaticSupply(engine.boxes,2026,8),best=engine.population.reduce((a,b)=>a.score>=b.score?a:b);
 const expanded=supply.expand(best,DEFAULT_TRUCK)!;assert.equal(expanded.length,26);
 const next=new Engine(expanded,DEFAULT_TRUCK,settings,DEFAULT_WEIGHTS);next.inherit(engine,'r1-');
 assert.equal(next.population.find(p=>p.id===`r1-${best.id}`)!.score,best.score);
 assert.deepEqual(next.population[0].loadOrder.slice(0,18),engine.population[0].loadOrder);
 const transition=finishGeneration(next);assert.ok(transition.best>=last.best);
 const parents=new Set(engine.population.map(p=>'r1-'+p.id));
 assert.ok(transition.individuals.every(p=>p.parents.length>0&&p.parents.every(id=>parents.has(id))));
 for(let i=1;i<20;i++)finishGeneration(next);
 assert.ok(Math.max(...next.population.map(p=>p.evaluation.loaded))>18);
});

test('입구가 막힌 현재 배치만으로 재배치 가능한 추가 공급을 종료하지 않는다',()=>{
 const b:Box={id:1,size:[20,10,20],weight:1,priority:1,grade:0},truck={width:20,depth:100,height:20};
 const engine=new Engine([b],truck,DEFAULT_SETTINGS,DEFAULT_WEIGHTS),best=engine.evaluate([[0,0,0]],[],'검증',false,[1])!;
 assert.equal(availableLoadingSlot([b],[[0,0,0]],truck),null);
 assert.equal(new AutomaticSupply([b],1).expand(best,truck)!.length,21);
});
test('기본 공급량은 20개이고 사용자 공급량에는 임의 최대값이 없다',()=>{
 const {boxes,truck,best}=initial();
 assert.equal(new AutomaticSupply(boxes,1).expand(best,truck)!.length,38);
 assert.equal(new AutomaticSupply(boxes,1,137).expand(best,truck)!.length,155);
 assert.throws(()=>new AutomaticSupply(boxes,1,0));
});
test('실제 Worker는 공급량 소진 시 세대 예산을 기다리지 않고 지정 묶음을 즉시 공급한다',async()=>{
 const {boxes,truck}=initial();const input=boxes.slice(0,1);
 const scope=globalThis as unknown as {self:{onmessage:(e:{data:unknown})=>void};postMessage:(m:any)=>void};
 let finish!:(v:void)=>void;const complete=new Promise<void>(resolve=>{finish=resolve;});let rounds=0,completed=false,lastGeneration=0,firstSupplyGeneration=0;
 scope.self={onmessage:()=>{}};
 scope.postMessage=(m:any)=>{
  if(m.type==='generation')lastGeneration=m.generation.number;
  if(m.type==='supply'){rounds++;assert.equal(m.boxes.length,1+rounds);if(rounds===1)firstSupplyGeneration=lastGeneration;if(rounds===2){scope.self.onmessage({data:{type:'stop',run:99}});finish();}}
  if(m.type==='state'&&m.state==='완료')completed=true;
  if(m.type==='error')throw Error(m.message);
 };
 await import('../src/workers/evolution');
 scope.self.onmessage({data:{type:'start',run:99,boxes:input,truck,settings:{...DEFAULT_SETTINGS,population:3,generations:100},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026}});
 const timeout=setTimeout(()=>finish(),10000);await complete;clearTimeout(timeout);
 assert.equal(rounds,2);assert.equal(completed,false);assert.equal(firstSupplyGeneration,1);
});

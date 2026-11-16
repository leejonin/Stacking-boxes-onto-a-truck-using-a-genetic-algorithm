import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutomaticSupply,availableLoadingSlot,loadingComplete,validateCompletionPercent} from '../src/simulation/supply';
import {validateLayout} from '../src/domain/packing';
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
 for(let i=0;i<6;i++){const previous=[...a.boxes],existingIds=new Set(previous.map(b=>b.id));assert.ok(a.expand(best,truck));b.expand(best,truck);assert.deepEqual(a.boxes.slice(0,previous.length),previous);for(const box of a.boxes.slice(previous.length))assert.equal(existingIds.has(box.id),false);}
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
test('공급 생성기는 완료 판정과 별도로 적재 부피 100%이면 종료한다',()=>{
 const {boxes,best}=initial(),truck={width:20,depth:20,height:20};
 const supply=new AutomaticSupply(boxes,1);
 assert.ok(supply.expand({...best,evaluation:{...best.evaluation,loadedVolume:7500}},truck));
 assert.equal(supply.expand({...best,evaluation:{...best.evaluation,loadedVolume:8000}},truck),null);
});
test('완료는 현재 개체의 최소 상자 공간으로 판정하며 단순 입구 막힘은 제외한다',()=>{
 const {boxes}=initial(),b=boxes.slice(0,1),small={width:25,depth:20,height:20};
 const engine=new Engine(b,small,DEFAULT_SETTINGS,DEFAULT_WEIGHTS),best=engine.evaluate([[0,0,0]],[],'검사',false,[1])!;
 assert.equal(best.evaluation.utilization,.8);assert.equal(loadingComplete(b,best,small),true);
 const large={width:20,depth:100,height:20};
 assert.equal(availableLoadingSlot(b,[[0,0,0]],large),null);
 assert.equal(loadingComplete(b,best,large),false);
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

test('실제 Worker는 미적재 입력이 남아도 짐칸이 꽉 차면 세대 예산 전에 완료하고 가득 찬 개체를 전달한다',async()=>{
 const scope=globalThis as any;let lastGeneration=0,completed=false,full:any,supplied=false;
 let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});
 scope.postMessage=(m:any)=>{if(m.type==='generation')lastGeneration=m.generation.number;if(m.type==='capacity')full=m.individual;if(m.type==='supply')supplied=true;if(m.type==='state'&&m.state==='완료'){completed=true;finish();}if(m.type==='error'){finish();throw Error(m.message);}};
 const {boxes}=initial();
 scope.self.onmessage({data:{type:'start',run:100,boxes:boxes.slice(0,2),truck:{width:20,depth:20,height:20},settings:{...DEFAULT_SETTINGS,population:3,generations:100},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026}});
 const timeout=setTimeout(finish,2000);await done;clearTimeout(timeout);
 assert.equal(completed,true);assert.equal(lastGeneration,1);assert.equal(supplied,false);assert.equal(full.evaluation.utilization,1);assert.equal(full.evaluation.loaded,1);
});

test('실제 Worker는 한 개체에 추가 공간이 없으면 100% 미만이어도 즉시 완료한다',async()=>{
 const scope=globalThis as any;let full:any,completed=false;
 let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});
 scope.postMessage=(m:any)=>{if(m.type==='capacity')full=m.individual;if(m.type==='state'&&m.state==='완료'){completed=true;finish();}if(m.type==='error'){finish();throw Error(m.message);}};
 const {boxes}=initial();
 scope.self.onmessage({data:{type:'start',run:101,boxes:boxes.slice(0,2),truck:{width:25,depth:20,height:20},settings:{...DEFAULT_SETTINGS,population:3,generations:100},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026}});
 const timeout=setTimeout(finish,2000);await done;clearTimeout(timeout);
 assert.equal(completed,true);assert.equal(full.generation,1);assert.equal(full.evaluation.utilization,.8);
});


test('완료 적재율 기본100%와 변경값의 이상 경계 및 입력 범위를 검사한다',()=>{
 const {boxes}=initial(),input=boxes.slice(0,1),truck={width:100,depth:20,height:20};
 const engine=new Engine(input,truck,DEFAULT_SETTINGS,DEFAULT_WEIGHTS),p=engine.evaluate([[0,0,0]],[],'검사',false,[1])!;
 assert.equal(loadingComplete(input,p,truck),false);
 assert.equal(loadingComplete(input,p,truck,20),true);
 assert.equal(loadingComplete(input,p,truck,20.1),false);
 for(const value of [0,100.1,NaN,Infinity])assert.throws(()=>validateCompletionPercent(value));
 for(const value of [1,90.5,100])assert.doesNotThrow(()=>validateCompletionPercent(value));
});

test('실제 Worker가 사용자 지정 완료 적재율을 적용한다',async()=>{
 const scope=globalThis as any;let full:any,completed=false,message='';
 let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});
 scope.postMessage=(m:any)=>{if(m.type==='capacity'){full=m.individual;message=m.message;}if(m.type==='state'&&m.state==='완료'){completed=true;finish();}if(m.type==='error'){finish();throw Error(m.message);}};
 const {boxes}=initial();
 scope.self.onmessage({data:{type:'start',run:102,boxes:boxes.slice(0,1),truck:{width:100,depth:20,height:20},settings:{...DEFAULT_SETTINGS,population:3,generations:100},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026,completionPercent:20}});
 const timeout=setTimeout(finish,2000);await done;clearTimeout(timeout);
 assert.equal(completed,true);assert.equal(full.generation,1);assert.equal(full.evaluation.utilization,.2);assert.match(message,/목표 적재율 20% 도달/);
});


test('기본 Worker는3세대의 공급2회차에서 기존20개를 보존하며 실제 상차 개수를 늘린다',async()=>{
 const scope=globalThis as any;let third:any,error='';let finish!:()=>void;
 const done=new Promise<void>(resolve=>{finish=resolve;});
 scope.postMessage=(m:any)=>{if(m.type==='generation'&&m.generation.number===3){third=m.generation;scope.self.onmessage({data:{type:'stop',run:103}});finish();}if(m.type==='error'){error=m.message;finish();}};
 scope.self.onmessage({data:{type:'start',run:103,boxes:generateBoxes(20,2026),truck:DEFAULT_TRUCK,settings:DEFAULT_SETTINGS,weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026,completionPercent:100}});
 const timeout=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run:103}});finish();},60000);await done;clearTimeout(timeout);
 assert.equal(error,'');assert.ok(third);assert.equal(third.round,2);assert.equal(third.boxes.length,40);assert.equal(new Set(third.boxes.map((b:any)=>b.id)).size,40);
 const best=third.individuals.reduce((a:any,b:any)=>a.score>=b.score?a:b);
 assert.ok(best.evaluation.loaded>20);assert.ok(third.individuals.some((p:any)=>p.operation==='추가 상차 변이'));
 for(const p of third.individuals){const indices=third.boxes.map((_:any,i:number)=>i).filter((i:number)=>p.evaluation.finalCoords[i][0]>=0);assert.equal(validateLayout(indices.map((i:number)=>third.boxes[i]),indices.map((i:number)=>p.evaluation.finalCoords[i]),DEFAULT_TRUCK),null);}
 for(const p of third.individuals)for(const id of Object.keys(third.accumulated.positions)){const i=third.boxes.findIndex((b:any)=>b.id===+id);assert.ok(p.evaluation.finalCoords[i][0]>=0);}
});

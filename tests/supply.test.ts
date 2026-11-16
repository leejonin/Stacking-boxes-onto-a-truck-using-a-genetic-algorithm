import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutomaticSupply,availableLoadingSlot} from '../src/simulation/supply';
import {Engine} from '../src/ga/engine';
import {DEFAULT_WEIGHTS,DEFAULT_SETTINGS,type Box,type Vec} from '../src/domain/model';
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
test('실제 Worker가 세대 예산이 끝나면 완료 대신 다음 공급 회차를 자동 진행한다',async()=>{
 const {boxes,truck}=initial();
 const scope=globalThis as unknown as {self:{onmessage:(e:{data:unknown})=>void};postMessage:(m:any)=>void};
 let finish!:(v:void)=>void;const complete=new Promise<void>(resolve=>{finish=resolve;});let rounds=0,completed=false;
 scope.self={onmessage:()=>{}};
 scope.postMessage=(m:any)=>{
  if(m.type==='supply'){rounds++;assert.equal(m.boxes.length,boxes.length*(rounds+1));if(rounds===2){scope.self.onmessage({data:{type:'stop',run:99}});finish();}}
  if(m.type==='state'&&m.state==='완료')completed=true;
  if(m.type==='error')throw Error(m.message);
 };
 await import('../src/workers/evolution');
 scope.self.onmessage({data:{type:'start',run:99,boxes,truck,settings:{...DEFAULT_SETTINGS,population:3,generations:1},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026}});
 const timeout=setTimeout(()=>finish(),10000);await complete;clearTimeout(timeout);
 assert.equal(rounds,2);assert.equal(completed,false);
});


test('상자 할당 입력은 기본20개이며 최초 입력과 추가 묶음에 지정 개수를 적용한다',()=>{
 const {boxes,truck,best}=initial();assert.equal(new AutomaticSupply(boxes,1).expand(best,truck)!.length,boxes.length+20);
 const supply=new AutomaticSupply(boxes,1,37);assert.equal(supply.expand(best,truck)!.length,boxes.length+37);assert.equal(supply.expand(best,truck)!.length,boxes.length+74);
 assert.throws(()=>new AutomaticSupply(boxes,1,0));assert.throws(()=>new AutomaticSupply(boxes,1,NaN));
});


test('실제 Worker는 할당 상자를 모두 실은50개체가 있어야 첫 세대를 전달한다',async()=>{
 const scope=globalThis as any;let result:any,error='';let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});
 scope.postMessage=(m:any)=>{if(m.type==='generation'){result=m.generation;scope.self.onmessage({data:{type:'stop',run:107}});finish();}if(m.type==='error'){error=m.message;finish();}};
 const {boxes}=initial();scope.self.onmessage({data:{type:'start',run:107,boxes:boxes.slice(0,3),truck:{width:40,depth:60,height:40},settings:{...DEFAULT_SETTINGS,population:50,generations:2},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:false,requireFullAllocation:true}});
 const timeout=setTimeout(finish,5000);await done;clearTimeout(timeout);assert.equal(error,'');assert.ok(result);assert.equal(result.number,1);assert.equal(result.individuals.length,50);assert.ok(result.individuals.every((p:any)=>p.evaluation.loaded===3&&p.evaluation.unloadedIds.length===0));
});

test('Worker는 불가능한 전체 할당에서 다음 세대를 보내지 않고 원인을 알린다',async()=>{
 const scope=globalThis as any;let generations=0,error='';let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});
 scope.postMessage=(m:any)=>{if(m.type==='generation')generations++;if(m.type==='error'){error=m.message;finish();}};
 const {boxes}=initial();scope.self.onmessage({data:{type:'start',run:108,boxes:boxes.slice(0,2),truck:{width:20,depth:20,height:20},settings:{...DEFAULT_SETTINGS,population:3,generations:2},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:false,requireFullAllocation:true}});
 const timeout=setTimeout(finish,2000);await done;clearTimeout(timeout);assert.equal(generations,0);assert.match(error,/총부피/);
});

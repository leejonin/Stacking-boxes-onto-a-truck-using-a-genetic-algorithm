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
 const {boxes,truck,best}=initial(),a=new AutomaticSupply(boxes,2026),b=new AutomaticSupply(boxes,2026);
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
  if(m.type==='supply'){rounds++;if(rounds===2){scope.self.onmessage({data:{type:'stop',run:99}});finish();}}
  if(m.type==='state'&&m.state==='완료')completed=true;
  if(m.type==='error')throw Error(m.message);
 };
 await import('../src/workers/evolution');
 scope.self.onmessage({data:{type:'start',run:99,boxes,truck,settings:{...DEFAULT_SETTINGS,population:3,generations:1},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026}});
 const timeout=setTimeout(()=>finish(),10000);await complete;clearTimeout(timeout);
 assert.equal(rounds,2);assert.equal(completed,false);
});

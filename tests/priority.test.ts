import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {type Box,type Vec,DEFAULT_SETTINGS,DEFAULT_WEIGHTS,DEFAULT_TRUCK,generateBoxes,Random} from '../src/domain/model';
import {priorityOrder,priorityColor} from '../src/domain/priority';import {Engine,finishGeneration} from '../src/ga/engine';import {simulate} from '../src/simulation/unload';import {priorityFitness} from '../src/simulation/objective';import {partitionPack,fits,supported,blockers,interval} from '../src/domain/packing';import {freeRegions} from '../src/domain/spaces';import {graphics,finalizeResult,type ResultSnapshot} from '../src/export/report';import {runExperiments} from '../src/ga/experiments';
const box=(id:number,priority:number):Box=>({id,size:[20,20,20],weight:2,grade:0,priority}),truck={width:20,depth:60,height:20},weights={base:100,moves:10,mass:1,space:0};
function engine(boxes:Box[]){const e=new Engine(boxes,truck,{...DEFAULT_SETTINGS,population:8,mutation:.4,seed:11},weights);e.requireFullAllocation=true;e.priorityUnloading=true;return e;}

test('우선도는 높은 값 먼저·동점 ID순이며 입력 배열을 바꾸지 않는다',()=>{
 const boxes=[box(3,2),box(2,5),box(1,5)],ordered=priorityOrder(boxes);assert.deepEqual(ordered.map(b=>b.id),[1,2,3]);assert.deepEqual(boxes.map(b=>b.id),[3,2,1]);assert.notEqual(priorityColor(1),priorityColor(5));
});
test('우선도 하차 비용은 상차 비용과 구분되고 우선도를 바꾸면 같은 좌표의 점수가 바뀐다',()=>{
 const a=engine([box(1,5),box(2,1)]),coords:Vec[]=[[0,0,0],[0,40,0]],good=a.evaluate(coords,[],'시험',false,[1,2])!;
 assert.equal(good.evaluation.moves,2);assert.equal(good.unloading!.moves,0);assert.equal(good.score,100);assert.deepEqual(good.unloadOrder,[1,2]);
 const b=engine([box(1,1),box(2,5)]),bad=b.evaluate(coords,[],'시험',false,[2,1])!;assert.equal(bad.evaluation.moves,0);assert.equal(bad.unloading!.moves,2);assert.equal(bad.unloading!.mass,4);assert.equal(bad.score,76);assert.deepEqual(bad.unloadOrder,[2,1]);
 b.population=[bad];const updated=b.reweight({...weights,moves:3,mass:.5});assert.equal(updated[0].score,92);
});
test('잘못된 우선도·중복 ID는 하차 평가에서 거부한다',()=>{for(const value of [0,6,NaN])assert.equal(simulate([box(1,value)],[[0,0,0]],truck,false,true).valid,false);assert.equal(simulate([box(1,1),box(1,2)],[[0,0,0],[0,40,0]],truck,false,true).valid,false);});
test('GA는 우선도가 높은 뒤쪽 상자를 덜 재이동하는 배치를 실제 선택한다',()=>{
 const e=engine([box(1,5),box(2,1)]);e.population=Array.from({length:8},()=>e.evaluate([[0,40,0],[0,0,0]],[],'불리한 시작',false,[1,2])!);e.generation=1;const first=e.population[0].score;let last=first;
 for(let i=0;i<12;i++){const g=finishGeneration(e);assert.ok(g.best>=last);last=g.best;assert.ok(g.individuals.every(p=>p.unloading?.delivered===2&&p.evaluation.loaded===2));}assert.ok(last>first);assert.equal(last,100);
});
for(const [count,hash] of [[6,'86894a49d9105582efb10b2387c928a746d520825415ccfbb2edc4d62d91d661'],[20,'fe514996e16c6503c4efc2c1afab7c10b26afd8213d367ba9d9132588a4da9c2'],[100,'eb06666f5a69449e79939e1dda141e527cc4c0a75db160dc4eeec66a24437036'],[220,'1f5b6eb4e12d56fb989623aa816297cb75be0bfe58d997363b47352b492e974d']] as const)test(`${count}개 하차 인덱스 최적화는 같은 복귀 정책의 원본 이벤트·비용 해시와 일치`,()=>{
 const boxes=generateBoxes(count,2026),p=partitionPack(boxes,DEFAULT_TRUCK,new Random(2026)),ev=simulate(boxes,p.coords,DEFAULT_TRUCK,true,true);assert.equal(createHash('sha256').update(JSON.stringify(ev)).digest('hex'),hash);
});
test('220개 하차의 모든 이벤트는 경계·비겹침·지지·인출경로·ID·우선도·비용을 보존한다',()=>{
 const boxes=generateBoxes(220,2026),p=partitionPack(boxes,DEFAULT_TRUCK,new Random(2026)),ev=simulate(boxes,p.coords,DEFAULT_TRUCK,true,true),byId=new Map(boxes.map(b=>[b.id,b])),inside=new Map(boxes.map((box,i)=>[box.id,{box,pos:p.coords[i]}])),outside=new Set<number>(),delivered:number[]=[];let moves=0,mass=0;
 for(const event of ev.events){const b=byId.get(event.boxId)!;
  if(event.kind==='return'){assert.ok(outside.has(b.id));assert.ok(!inside.has(b.id));assert.ok(fits(b,event.to!,[...inside.values()],DEFAULT_TRUCK));assert.equal(blockers({box:b,pos:event.to!},[...inside.values()]).length,0);inside.set(b.id,{box:b,pos:event.to!});outside.delete(b.id);}
  else {const removed=inside.get(b.id)!;assert.ok(removed);const rest=[...inside.values()].filter(a=>a.box.id!==b.id);assert.equal(blockers(removed,rest).length,0);inside.delete(b.id);for(const a of rest)if(a.pos[2]===removed.pos[2]+removed.box.size[2]&&interval(a.pos[0],a.box.size[0],removed.pos[0],removed.box.size[0])&&interval(a.pos[1],a.box.size[1],removed.pos[1],removed.box.size[1]))assert.ok(supported(a,rest));if(event.kind==='deliver')delivered.push(b.id);else outside.add(b.id);}
  if(event.kind==='out'||event.kind==='return'){moves++;mass=Math.round((mass+b.weight)*10)/10;}assert.equal(event.moves,moves);assert.equal(event.mass,mass);
 }
 assert.deepEqual(delivered,priorityOrder(boxes).map(b=>b.id));assert.equal(inside.size,0);assert.equal(outside.size,0);assert.equal(moves,ev.moves);assert.equal(mass,ev.mass);
});
test('빈 구획 분할은 부피·경계·비겹침을 보존한다',()=>{
 const t={width:60,depth:60,height:60},occupied=[{box:box(1,1),pos:[0,0,0] as Vec},{box:box(2,2),pos:[40,40,0] as Vec}],regions=freeRegions(occupied,t);
 assert.equal(regions.reduce((sum,r)=>sum+r.w*r.d*r.h,0),60**3-2*20**3);for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){const a=regions[i],b=regions[j];assert.ok(!interval(a.x,a.w,b.x,b.w)||!interval(a.y,a.d,b.y,b.d)||!interval(a.z,a.h,b.z,b.h));}
});
test('다운로드는 우선도·배송 순위·하차 목적과 비용을 포함하고 완료 자료를 복제한다',()=>{
 const boxes=[box(1,5),box(2,1)],e=engine(boxes),g=finishGeneration(e);g.boxes=boxes;g.weights=weights;const s:ResultSnapshot={schema:1,objective:'priority-unload',completedAt:'2026-11-16T16:00:00Z',history:[g],selected:g.individuals[0],truck,settings:e.settings,inputSeed:11,batchCount:2,automatic:false,weights:{1:weights},scene:{mode:'unloading',image:null,step:0,totalSteps:0,events:[],boxes,fixed:{},assetStatus:'시험',error:''}};
 const frozen=finalizeResult(s);boxes[0].priority=1;assert.equal(frozen.scene.boxes[0].priority,5);const svg=graphics(frozen,frozen.history,'priorities')[0].svg;assert.ok(svg.includes('동점: ID'));assert.ok(svg.indexOf('#1')<svg.indexOf('#2'));assert.ok(graphics(frozen,frozen.history,'movement')[0].svg.includes('하차 재이동'));assert.ok(graphics(frozen,frozen.history,'summary')[0].svg.includes('하차 중량'));
});
test('무작위 비교군도 같은 우선도 하차 점수와 평가 예산으로 비교한다',async()=>{
 const rows=await runExperiments([box(1,5),box(2,1)],truck,{...DEFAULT_SETTINGS,population:5,generations:1},weights,()=>false,()=>{},true);assert.equal(rows.length,27);assert.ok(rows.every(r=>r.budget===r.randomEvaluations&&r.gaLoaded===2&&r.randomLoaded===2));
});

const scope=globalThis as any;scope.self={onmessage:()=>{}};scope.postMessage=()=>{};await import('../src/workers/evolution');
for(const count of [100,220])test(`${count}개 우선도 Worker는 일시정지/재개 후 전량 적재·우선순 하차 점수를 전달한다`,async()=>{
 let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});let generation:any,error='',paused=false;const run=2200+count;
 scope.postMessage=(m:any)=>{if(m.run!==run)return;if(m.type==='error'){error=m.message;finish();}if(m.type==='state'&&m.state==='일시정지'){paused=true;setTimeout(()=>scope.self.onmessage({data:{type:'resume',run}}),10);}if(m.type==='generation'){generation=m.generation;scope.self.onmessage({data:{type:'stop',run}});finish();}};
 scope.self.onmessage({data:{type:'start',run,boxes:generateBoxes(count,2026),truck:DEFAULT_TRUCK,settings:{...DEFAULT_SETTINGS,generations:3},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:false,requireFullAllocation:true,priorityUnloading:true}});setTimeout(()=>scope.self.onmessage({data:{type:'pause',run}}),50);const timer=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});finish();},20000);await done;clearTimeout(timer);
 assert.equal(error,'');assert.ok(paused);assert.ok(generation);assert.equal(generation.objective,'priority-unload');assert.equal(generation.individuals.length,50);for(const p of generation.individuals){assert.equal(p.evaluation.loaded,count);assert.equal(p.unloading.delivered,count);assert.equal(p.score,priorityFitness(p.evaluation,p.unloading,DEFAULT_WEIGHTS));}const reference=new Engine(generateBoxes(count,2026),DEFAULT_TRUCK,{...DEFAULT_SETTINGS,generations:3},DEFAULT_WEIGHTS);reference.requireFullAllocation=true;reference.priorityUnloading=true;assert.deepEqual(generation.individuals,finishGeneration(reference).individuals);console.log(JSON.stringify({priorityWorkerBoxes:count,ms:Math.round(generation.elapsed),best:generation.best}));
});


test('자동 다음 공급에도 수정 우선도·고유 ID·우선도 하차 목적을 계승한다',async()=>{
 let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});let result:any,error='';const run=3301,initial=[box(1,5),box(2,5),box(3,2)];
 scope.postMessage=(m:any)=>{if(m.run!==run)return;if(m.type==='error'){error=m.message;finish();}if(m.type==='generation'&&m.generation.round===2){result=m.generation;scope.self.onmessage({data:{type:'stop',run}});finish();}};
 scope.self.onmessage({data:{type:'start',run,boxes:initial,truck:DEFAULT_TRUCK,settings:{...DEFAULT_SETTINGS,population:6,generations:1},weights:DEFAULT_WEIGHTS,fixed:{},arrival:false,automatic:true,inputSeed:2026,requireFullAllocation:true,priorityUnloading:true}});
 const timer=setTimeout(()=>{scope.self.onmessage({data:{type:'stop',run}});finish();},10000);await done;clearTimeout(timer);assert.equal(error,'');assert.ok(result);assert.equal(result.objective,'priority-unload');assert.deepEqual(result.boxes.slice(0,3).map((b:Box)=>b.priority),[5,5,2]);assert.equal(new Set(result.boxes.map((b:Box)=>b.id)).size,6);assert.ok(result.individuals.every((p:any)=>p.evaluation.loaded===6&&p.unloading.delivered===6&&p.unloadOrder[0]===1&&p.unloadOrder[1]===2));
});

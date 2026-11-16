import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Engine,finishGeneration} from '../src/ga/engine';
import {CONFIG_RANGES,rangeSteps,validateWebConfig,effectiveCrossover} from '../src/domain/ranges';
import {DEFAULT_SETTINGS,DEFAULT_WEIGHTS,DEFAULT_TRUCK,type Box,type Vec,type Settings,type Weights,type Individual} from '../src/domain/model';
import {simulate} from '../src/simulation/unload';
import {priorityFitness} from '../src/simulation/objective';
import {priorityOrder} from '../src/domain/priority';
import {validateLayout,blockers,fits,type Placed} from '../src/domain/packing';
const boxes:Box[]=[{id:1,size:[20,20,20],weight:2,priority:5,grade:0},{id:2,size:[20,20,20],weight:3,priority:1,grade:1}];
/** 실제 하차 재생의 모든 전이를 검사한다. 겹침·지지·입구 경로·중복 배송·횟수/중량을 확인한다. */
export function checkReplay(input:Box[],p:Individual,truck=DEFAULT_TRUCK):number {
 const ev=simulate(input,p.evaluation.finalCoords,truck,true,true);assert.equal(ev.valid,true,ev.reason);
 const byId=new Map(input.map(b=>[b.id,b])),inside=new Map(input.map((b,i)=>[b.id,[...p.evaluation.finalCoords[i]] as Vec])),outside=new Set<number>(),delivered:number[]=[];
 let moves=0,mass=0;
 for(const event of ev.events){const b=byId.get(event.boxId)!;assert.ok(b);const rest:Placed[]=[...inside].filter(([id])=>id!==b.id).map(([id,pos])=>({box:byId.get(id)!,pos}));
  if(event.kind==='return'){assert.ok(outside.has(b.id));assert.ok(!inside.has(b.id));assert.ok(event.to);assert.ok(fits(b,event.to,rest,truck));assert.equal(blockers({box:b,pos:event.to},rest).length,0);outside.delete(b.id);inside.set(b.id,event.to);}
  else {assert.ok(inside.has(b.id));assert.deepEqual(event.from,inside.get(b.id));assert.equal(blockers({box:b,pos:event.from!},rest).length,0);inside.delete(b.id);if(event.kind==='deliver'){assert.ok(!delivered.includes(b.id));delivered.push(b.id);}else outside.add(b.id);}
  if(event.kind==='out'||event.kind==='return'){moves++;mass=Math.round((mass+b.weight)*10)/10;}
  assert.equal(event.moves,moves);assert.equal(event.mass,mass);assert.equal(validateLayout([...inside.keys()].map(id=>byId.get(id)!),[...inside.values()],truck),null);
 }
 assert.deepEqual(delivered,priorityOrder(input).map(b=>b.id));assert.equal(inside.size,0);assert.equal(outside.size,0);assert.equal(ev.moves,p.unloading!.moves);assert.equal(ev.mass,p.unloading!.mass);return ev.events.length;
}
/** 다른 항목은 고정하고 각 범위11단계를 실제 실행한다. 세대 항목은 지정한 수까지 각각 완주한다. */
export function runRangeSweep(){
 const rows:unknown[]=[];let totalGenerations=0,totalEvents=0;
 const cases=[...(['base','moves','mass','space'] as const).map(key=>({group:'weights',key,range:CONFIG_RANGES.weight})),...(['population','generations','crossover','mutation','tournament'] as const).map(key=>({group:'settings',key,range:CONFIG_RANGES[key]}))];
 for(const entry of cases)for(const [stage,value] of rangeSteps(entry.range).entries()){
  const settings:Settings={...DEFAULT_SETTINGS,population:2,generations:3},weights:Weights={...DEFAULT_WEIGHTS};if(entry.group==='weights')(weights as any)[entry.key]=value;else(settings as any)[entry.key]=value;
  if(settings.population===0){assert.throws(()=>validateWebConfig(boxes,DEFAULT_TRUCK,settings,weights),/집단을 1 이상/);rows.push({field:entry.key,stage,percent:stage*10,value,status:'실행 없이 안내 확인'});continue;}
  validateWebConfig(boxes,DEFAULT_TRUCK,settings,weights);const e=new Engine(boxes,DEFAULT_TRUCK,settings,weights);e.requireFullAllocation=true;e.priorityUnloading=true;const start=performance.now();let last!:ReturnType<typeof finishGeneration>;
  for(let g=1;g<=settings.generations;g++){last=finishGeneration(e);assert.equal(last.number,g);assert.equal(last.individuals.length,settings.population);for(const p of last.individuals){assert.equal(p.evaluation.loaded,boxes.length);assert.equal(p.unloading!.delivered,boxes.length);assert.equal(p.score,priorityFitness(p.evaluation,p.unloading!,weights));}totalGenerations++;}
  const probeTruck={width:20,depth:40,height:20},probeEngine=new Engine(boxes,probeTruck,settings,weights);probeEngine.priorityUnloading=true;probeEngine.requireFullAllocation=true;
  const probe=probeEngine.evaluate([[0,20,0],[0,0,0]],[],'가중치 실제 반영 검사',false,[1,2])!;assert.ok(probe);assert.equal(probe.unloading!.moves,2);assert.equal(probe.unloading!.mass,6);assert.equal(probe.score,Math.round((weights.base+(weights.space??20)-2*weights.moves-6*weights.mass)*100)/100);const probeEvents=checkReplay(boxes,probe,probeTruck);totalEvents+=probeEvents;
  const best=last.individuals.reduce((a,b)=>a.score>=b.score?a:b),events=checkReplay(boxes,best);totalEvents+=events;
  rows.push({field:entry.key,stage,percent:stage*10,value,status:'완주·재생 통과',generations:last.number,population:last.individuals.length,settings,weights,effectiveCrossover:effectiveCrossover(settings.crossover),best:best.score,moves:best.unloading!.moves,mass:best.unloading!.mass,replayEvents:events,probe:{truck:probeTruck,score:probe.score,moves:2,mass:6,replayEvents:probeEvents},ms:Math.round(performance.now()-start)});
 }
 assert.equal(rows.length,99);return {schema:1,createdAt:new Date().toISOString(),fixture:{boxes,truck:DEFAULT_TRUCK},note:'항목별11단계, 타항목 고정. 전체 설정 직교곱이 아님. 집단0은 안내만 확인. 계산시간은 해당 환경 측정.',cases:rows.length,executed:98,blockedAsDesigned:1,totalGenerations,totalEvents,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=runRangeSweep();mkdirSync('artifacts/range-sweep',{recursive:true});writeFileSync('artifacts/range-sweep/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({cases:report.cases,executed:report.executed,blocked:report.blockedAsDesigned,generations:report.totalGenerations,replayEvents:report.totalEvents}));}

/// <reference lib="webworker" />
import { Engine } from '../ga/engine';
import type { Box,Truck,Settings,Weights,Vec,Generation } from '../domain/model';
import { runExperiments } from '../ga/experiments';
import {AutomaticSupply,loadingComplete,validateCompletionPercent} from '../simulation/supply';
export type Command = {type:'start';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights;fixed:Record<number,Vec>;arrival:boolean;automatic?:boolean;inputSeed?:number;completionPercent?:number}|{type:'pause'|'resume'|'stop';run:number}|{type:'weights';run:number;weights:Weights}|{type:'experiment';run:number;boxes:Box[];truck:Truck;settings:Settings;weights:Weights};
let engine:Engine|null=null,run=0,paused=false,stopped=false,iterator:Generator<void,Generation,void>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
let supply:AutomaticSupply|null=null,generationOffset=0,evaluationOffset=0,completionPercent=100;
/** 공급 회차마다 다른 입력·ID를 구별해 과거 개체와 계보를 보존한다. */
function displayIndividuals(individuals:import('../domain/model').Individual[]) {
  const prefix=supply?`r${supply.round}-`:'';
  return individuals.map(p=>({...p,id:prefix+p.id,parents:p.parents.map(id=>id.startsWith('r')?id:prefix+id),generation:p.generation+generationOffset}));
}
/** Worker의 최신 실행만 알린다. 메시지마다 실행 ID를 포함한다. */
function send(type:string,data:object={}) {postMessage({type,run,...data});}
/** 짧은 묶음으로 GA를 진행하고 완성된 세대만 보낸다. */
function tick() {
  timer=undefined;if(!engine||paused||stopped)return;
  try {
    if(!iterator)iterator=engine.next();
    const until=performance.now()+12;
    do {
      const result=iterator.next();
      if(result.done) {
        iterator=null;const g=result.value;
        // 공간 소진은 해당 세대의 상차 완료다. 전체 실행은 목표 부피 활용률(기본100%, 남은0%)에서만 완료한다.
        const capacityReached=!!supply&&engine.population.some(p=>loadingComplete(engine!.boxes,p,engine!.truck,100));
        const completeCandidates=supply?engine.population.filter(p=>p.evaluation.loadedVolume*100>=engine!.truck.width*engine!.truck.depth*engine!.truck.height*completionPercent):[];
        const filled=completeCandidates.length>0;
        send('generation',{generation:{...g,capacityReached,localNumber:g.number,number:g.number+generationOffset,evaluations:g.evaluations+evaluationOffset,individuals:displayIndividuals(g.individuals),boxes:engine.boxes,fixed:engine.fixed,accumulated:engine.accumulated,round:supply?.round??1}});
        if(capacityReached&&!filled)send('generationCapacity',{message:`${g.number+generationOffset}세대 상차 완료 · 추가 적재 공간 없음 · 다음 세대에서 재배치 탐색을 계속합니다.`});
        const exhausted=supply&&engine.population.some(p=>p.evaluation.loaded===engine!.boxes.length);
        if(filled||exhausted||engine.generation>=engine.settings.generations) {
          if(supply){
            const completed=filled?completeCandidates:engine.population.filter(p=>p.evaluation.loaded===engine!.boxes.length);
            const best=(completed.length?completed:engine.population).reduce((a,b)=>a.score>=b.score?a:b),previousRound=supply.round,expanded=filled?null:supply.expand(best,engine.truck);
            if(expanded){
              generationOffset+=engine.generation;evaluationOffset+=engine.evaluations;
              const next=new Engine(expanded,engine.truck,{...engine.settings,seed:(engine.settings.seed+1)>>>0},engine.weights,engine.fixed);
              next.inherit(engine,`r${previousRound}-`,best);engine=next;
              send('supply',{boxes:expanded,round:supply.round});break;
            }
            send('capacity',{message:best.evaluation.loadedVolume*100>=engine.truck.width*engine.truck.depth*engine.truck.height*completionPercent?`목표 적재율 ${completionPercent}% 도달 · 현재 ${(best.evaluation.utilization*100).toFixed(1)}% · 상차 완료`:'선택 개체에 최소 규격 상자(10×10×10cm)를 추가할 공간이 없습니다 · 상차 완료',individual:displayIndividuals([best])[0]});
          }
          paused=true;send('state',{state:'완료'});return;
        }
        break;
      }
    } while(performance.now()<until);
    timer=setTimeout(tick,0);
  } catch(e) {stopped=true;send('error',{message:e instanceof Error?e.message:String(e)});}
}
/** 예약된 반복이 중복되지 않게 실행한다. */
function schedule() {if(timer===undefined)timer=setTimeout(tick,0);}
self.onmessage=async(event:MessageEvent<Command>)=>{
  const c=event.data;
  try {
    if(c.type==='start') {
      const target=c.completionPercent??100;validateCompletionPercent(target);completionPercent=target;
      if(timer!==undefined)clearTimeout(timer);timer=undefined;run=c.run;
      engine=new Engine(c.boxes,c.truck,c.settings,c.weights,c.fixed,c.arrival);iterator=null;paused=false;stopped=false;send('state',{state:'실행'});schedule();
      if(c.automatic)engine.accumulated={positions:{...c.fixed},moves:0,mass:0};
      supply=c.automatic?new AutomaticSupply(c.boxes,c.inputSeed??c.settings.seed,c.boxes.length):null;generationOffset=0;evaluationOffset=0;
    } else if(c.type==='experiment') {
      run=c.run;stopped=false;
      const result=await runExperiments(c.boxes,c.truck,c.settings,c.weights,()=>stopped,(progress)=>send('experimentProgress',{progress}));
      if(!stopped)send('experiments',{result});
    } else if(c.run===run) {
      if(c.type==='pause') {paused=true;send('state',{state:'일시정지'});}
      if(c.type==='stop') {stopped=true;iterator=null;send('state',{state:'정지'});}
      if(c.type==='resume'&&engine&&!stopped&&engine.generation<engine.settings.generations) {paused=false;send('state',{state:'실행'});schedule();}
      if(c.type==='weights'&&engine) {
        paused=true;
        // 부분 세대의 혼합 점수를 방지한다. 미완성 세대만 버리고 기존 집단·난수는 유지한다.
        iterator=null;const individuals=engine.reweight(c.weights);send('reweighted',{individuals:displayIndividuals(individuals),version:engine.version});send('state',{state:'일시정지'});
      }
    }
  }catch(e){send('error',{message:e instanceof Error?e.message:String(e)});}
};

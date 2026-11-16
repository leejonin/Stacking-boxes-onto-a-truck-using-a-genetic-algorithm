import {writeFileSync,mkdirSync} from 'node:fs';
import {generateBoxes,DEFAULT_TRUCK,DEFAULT_SETTINGS,DEFAULT_WEIGHTS} from '../src/domain/model';
import {Engine,finishGeneration} from '../src/ga/engine';
const start=performance.now(),engine=new Engine(generateBoxes(18,2026),DEFAULT_TRUCK,DEFAULT_SETTINGS,DEFAULT_WEIGHTS);
const generations:{generation:number;best:number;mean:number;attempts:number;evaluations:number;elapsed:number}[]=[];
for(let i=0;i<100;i++){const g=finishGeneration(engine);generations.push({generation:g.number,best:g.best,mean:g.mean,attempts:g.attempts,evaluations:g.evaluations,elapsed:g.elapsed});}
const best=engine.population.reduce((a,b)=>a.score>=b.score?a:b);
const result={runtime:process.version,seconds:(performance.now()-start)/1000,heapMB:process.memoryUsage().heapUsed/1024/1024,boxes:18,population:50,generations:100,firstBest:generations[0].best,lastBest:best.score,loaded:best.evaluation.loaded,moves:best.evaluation.moves,mass:best.evaluation.mass,monotonic:generations.every((g,i)=>i===0||g.best>=generations[i-1].best),progress:generations};
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/loading-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,progress:undefined},null,2));

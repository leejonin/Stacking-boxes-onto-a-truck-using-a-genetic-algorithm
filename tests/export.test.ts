import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine,finishGeneration} from '../src/ga/engine';
import {DEFAULT_SETTINGS,DEFAULT_WEIGHTS,DEFAULT_TRUCK,generateBoxes} from '../src/domain/model';
import {finalizeResult,graphics,rangeHistory,segments,sceneGraphic,type ResultSnapshot} from '../src/export/report';
import {crc32,zipStore,bytes} from '../src/export/files';
function fixture():ResultSnapshot {
 const boxes=generateBoxes(3,41),settings={...DEFAULT_SETTINGS,population:4};const e=new Engine(boxes,DEFAULT_TRUCK,settings,DEFAULT_WEIGHTS);e.requireFullAllocation=true;
 const g=finishGeneration(e);g.boxes=boxes;g.weights={...DEFAULT_WEIGHTS};g.round=1;g.settings={...settings};
 return {schema:1,completedAt:'2026-11-16T15:10:00.000Z',history:[g],selected:g.individuals[0],truck:DEFAULT_TRUCK,settings,inputSeed:41,batchCount:3,automatic:true,weights:{1:{...DEFAULT_WEIGHTS}},scene:{image:null,step:0,totalSteps:3,events:[],boxes,fixed:{},assetStatus:'테스트',error:''}};
}
test('완료 자료는 실행과 참조를 끊으며 미완성 실행·선택 개체를 확정하지 않는다',()=>{
 const live=fixture(),s=finalizeResult(live);live.history[0].individuals[0].coords[0][0]=777;live.history.push({...live.history[0],number:2});live.weights[1].moves=500;
 assert.equal(s.history.length,1);assert.notEqual(s.selected!.coords[0][0],777);assert.equal(s.weights[1].moves,10);
 assert.throws(()=>finalizeResult({...s,history:[]}),/완료된 세대/);assert.throws(()=>finalizeResult({...s,selected:{...s.selected!,id:'없는ID'}}),/선택 개체/);
});
test('그래프는 부호·단위·완료시각·실제 가중치와 설정을 포함한다',()=>{
 const s=fixture();s.history[0].best=-2.5;s.history[0].mean=-20;
 const score=graphics(s,s.history,'scores')[0];assert.ok(score.svg.includes('-20'));assert.ok(score.svg.includes('점'));assert.ok(score.svg.includes('KST'));assert.ok(score.svg.includes('입력 seed 41'));assert.ok(score.svg.includes('10×재배치횟수'));assert.ok(score.svg.includes('R1: 2026'));
 const movement=graphics(s,s.history,'movement');assert.equal(movement.length,2);assert.ok(movement[0].svg.includes('횟수'));assert.ok(movement[1].svg.includes('kg'));
 const loading=graphics(s,s.history,'loading');assert.equal(loading.length,2);assert.ok(loading[1].svg.includes('%'));
});
test('공급·가중치 경계는 추세선을 분리하고 원자료를 재평가하지 않는다',()=>{
 const s=fixture(),g=s.history[0],gs=[g,{...g,number:2},{...g,number:3,round:2},{...g,number:4,round:2,version:2}];
 assert.deepEqual(segments(gs).map(a=>a.length),[2,1,1]);assert.deepEqual(rangeHistory({...s,history:gs},2,3).map(g=>g.number),[2,3]);assert.throws(()=>rangeHistory(s,2,1));assert.throws(()=>rangeHistory(s,99,100));
});
test('가상화 밖 전체 로드맵 개체와 페이지 밖 부모 ID를 보존한다',()=>{
 const s=fixture(),g=s.history[0];s.history=Array.from({length:7},(_,i)=>({...g,number:i+1,individuals:Array.from({length:23},(_,j)=>({...g.individuals[0],id:`g${i+1}-i${j+1}`,generation:i+1,parents:i?[`g${i}-i23`]:[]}))}));
 const pages=graphics(s,s.history,'roadmap');assert.equal(pages.length,6);
 const svg=pages.map(g=>g.svg).join('');for(const g of s.history)for(const p of g.individuals)assert.ok(svg.includes(p.id));assert.ok(svg.includes('← g6-i23'));assert.ok(!svg.includes('NaN'));
});
test('긴 요약을 분할하고 SVG의 사용자 문자열을 이스케이프한다',()=>{
 const s=fixture(),g=s.history[0];s.history=Array.from({length:31},(_,i)=>({...g,number:i+1}));s.selected!.id='<script>&"';g.individuals[0].id=s.selected!.id;
 assert.equal(graphics(s,s.history,'summary').length,2);const svg=graphics(s,[g],'roadmap')[0].svg;assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
});
test('3D 설명은 완료 선택 개체·재생 단계와 해당 평가 버전 가중치를 사용한다',()=>{
 const s=fixture();assert.throws(()=>sceneGraphic(s),/3D/);s.scene.image='data:image/png;base64,AA==';s.scene.step=2;s.selected={...s.selected!,version:2};s.weights[2]={...DEFAULT_WEIGHTS,moves:7};
 const svg=sceneGraphic(s).svg;assert.ok(svg.includes('2/3'));assert.ok(svg.includes('7×재배치횟수'));assert.ok(svg.includes('data:image/png;base64,AA=='));
});
test('UTF-8 ZIP은 CRC32·실제 바이트 길이·중앙 디렉터리 오프셋을 보존한다',()=>{
 assert.equal(crc32(bytes('123456789')),0xcbf43926);const file=bytes('한글 SVG 데이터'),name='결과.svg',zip=zipStore([{name,bytes:file}]),d=new DataView(zip.buffer),n=bytes(name).length;
 assert.equal(d.getUint32(0,true),0x04034b50);assert.equal(d.getUint16(6,true),0x800);assert.equal(d.getUint32(14,true),crc32(file));assert.equal(d.getUint32(18,true),file.length);assert.equal(d.getUint16(26,true),n);assert.deepEqual(zip.slice(30+n,30+n+file.length),file);
 const end=zip.length-22;assert.equal(d.getUint32(end,true),0x06054b50);assert.equal(d.getUint16(end+10,true),1);const central=d.getUint32(end+16,true);assert.equal(d.getUint32(central,true),0x02014b50);assert.equal(d.getUint32(central+42,true),0);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {truckFrame,boxScenePosition} from '../src/scene/truckFrame';

/** 원본 GLB의 지정 메시 위치 경계를 읽는다. 측정값을 테스트용 가짜 상자로 대체하지 않는다. */
function originalBounds(name:string):{min:number[];max:number[]} {
  const bytes=readFileSync(new URL('../Asset/7-5-t-class-box-truck-with-roll-up-door.glb',import.meta.url));
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const node=json.nodes.find((n:{name:string})=>n.name===name);assert.ok(node,`원본 메시 누락: ${name}`);
  const accessor=json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
  const root=json.nodes[json.scenes[json.scene??0].nodes[0]],offset=node.translation??[0,0,0],parent=root.translation??[0,0,0];
  return {min:accessor.min.map((v:number,i:number)=>v+offset[i]+parent[i]),max:accessor.max.map((v:number,i:number)=>v+offset[i]+parent[i])};
}
test('원본 운전석과 적재함이 기본·변경 치수에서 겹치지 않는다',()=>{
 const cab=originalBounds('Forward-control truck hollow 12-station cab');
 const shell=originalBounds('Separate hollow 12-station ruled dry freight box');
 for(const depth of [100,520,1200])for(const width of [100,220,400])for(const height of [100,220,400]){
  const f=truckFrame({width,depth,height});
  assert.ok(f.front>cab.max[0]*f.scale[0],`운전석 침범: 깊이 ${depth}`);
  assert.ok(f.front>shell.min[0]*f.scale[0]);assert.ok(f.rear<shell.max[0]*f.scale[0]);
  assert.ok(f.floor>shell.min[1]*f.scale[1]);assert.ok(f.floor+f.height<shell.max[1]*f.scale[1]);
  assert.ok(-f.width/2>shell.min[2]*f.scale[2]);assert.ok(f.width/2<shell.max[2]*f.scale[2]);
 }
 // 수정 전 front=-1.75m가 실제 운전석 후면(-1.032m)을 침범하던 사례를 확인한다.
 assert.ok(3.45-5.2<cab.max[0]);
});
test('최대 크기 계산용 적재함도 상자 변환 후 같은 바닥·앞뒤·폭 경계를 갖는다',()=>{
 const t={width:220,depth:520,height:220},f=truckFrame(t),center=boxScenePosition(f,[0,0,0],[220,520,220]);
 assert.ok(Math.abs(center[0]-t.depth/200-f.front)<1e-10);
 assert.ok(Math.abs(center[0]+t.depth/200-f.rear)<1e-10);
 assert.ok(Math.abs(center[1]-t.height/200-f.floor)<1e-10);
 assert.equal(center[2],0);
});

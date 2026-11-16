# SW_Browser_Scene_001 — 배치3D

- 버전: v0.0.2
- 최초 작성 일시: 2026-11-16 12:49:10 (KST)
- 수정 일시: 2026-11-16 13:00:16 (KST)
- 지시자: 이종인
- 작업자: GPT-6 (Codex)
- 기능 ID: SW_Browser_Scene_001
- 분류: 소프트웨어 / 배치3D (영문 식별자 Scene)
- 실행환경: Browser. 기술 버전은 프로젝트 루트 기준 `Info/기술환경.md`.
- 관련 ID: 001 및 `Info/기능_ID_목록.md`의 관련 기능.
- 상태: 구현 코드 확인·수치/빌드 검증. 브라우저 직접 조작은 미확인.

## 목적·목표와 역할

원본 탑차 GLB와 상자 재질을 로딩하고 실제 상차 이벤트의 각 시점만 3D로 표시한다.

목표는 사용자 승인된 상차 적재량 개선과 재배치 감소를 실제 상차 계산·화면에 일치시키는 것이다.

## 호출·입력·출력·처리 순서

TruckView의 props는 boxes·coords·truck·events·step·fixed다. 초기 positions에는 fixed만 포함한다. 이후 step까지 load·out·return 이벤트를 적용해 상자가 들어오고 임시로 사라지고 복귀하는 상태를 표시한다. 계산 좌표를 cm→m 및 높이축으로 변환한다.

App이 선택한 실제 Loading 결과를 전달한다. GLTFLoader 실패와 WebGL 실패는 화면 문구로 알린다. resize observer·OrbitControls·렌더 루프를 관리하며 언마운트 때 geometry·material·texture와 renderer를 dispose한다. 차량 내부 치수는 사용자 지정 가상 부피이므로 실측차량 정합을 보장하지 않는다.

소스의 타입 정의는 필수 매개변수·단위·반환값의 실제 근거다. 위치는 정수 cm, 중량은 kg, 비율은 0~1이다. 예외·실패 분기는 아래 실제 코드와 같다. Loading 평가의 valid=false, 위치 생성 실패의 null, UI/Worker 예외 메시지를 서로 구별한다.

## 수정 전후·확인 범위

이전 전체 실행은 하차 비용을 평가했다. 이번에는 상차 순서·위치와 실제 적재량을 평가하며 하차 모듈은 앱·GA·실험에서 호출하지 않는다. 기존 하차 소스와 해당 회귀 테스트는 삭제하지 않고 보존했다. 테스트 20개·빌드 통과. 대표 실행과 비교 결과는 `Info/report/2026-11-16/124910_상차전환검증_report.md`.

## 실제 코드와 함수별 설명

아래는 작성 시점의 파일 전체다. 함수별 주석·시그니처와 분기·타입을 보존하며, 구현되지 않은 의사 코드가 아니다.

### `src/scene/TruckView.tsx`

```tsx
import { useEffect,useRef,useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Box,Vec,Truck,MoveEvent } from '../domain/model';
import { truckFrame,boxScenePosition,TRUCK_FRAME } from './truckFrame';
import truckUrl from '../../Asset/7-5-t-class-box-truck-with-roll-up-door.glb?url';
import palletUrl from '../../Asset/aws-warehouse/ClutteringC_01.glb?url';
const COLORS=['#d4aa74','#94bb9b','#c4ae82','#8babb0','#c28a65'];
interface Props {boxes:Box[];coords:Vec[];truck:Truck;events:MoveEvent[];step:number;fixed:Record<number,Vec>}
/** 빈 적재함 또는 고정 적재 상태에서 실제 상차 이벤트를 차례로 렌더링한다. SW_Browser_Scene_001 */
export function TruckView({boxes,coords,truck,events,step,fixed}:Props) {
  const host=useRef<HTMLDivElement>(null),api=useRef<{update:()=>void;home:()=>void}|null>(null);
  const current=useRef({boxes,coords,truck,events,step,fixed,exterior:false});
  const [exterior,setExterior]=useState(false),[assetStatus,setAssetStatus]=useState('탑차 에셋 로딩 중'),[error,setError]=useState('');
  current.current={boxes,coords,truck,events,step,fixed,exterior};
  useEffect(()=>{
    const el=host.current!;let alive=true;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError('WebGL을 사용할 수 없습니다. 브라우저의 하드웨어 가속을 확인하세요.');return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#e9eee7');renderer.outputColorSpace=THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','선택 개체의 탑차 적재 배치 3D');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,100);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxDistance=24;controls.minDistance=3;controls.maxPolarAngle=Math.PI*.49;
    /** 화면 크기와 관계없이 적재함 중심으로 카메라를 복원한다. */
    const home=()=>{camera.position.set(9,8,9);controls.target.set(.2,1.5,0);controls.update();};home();
    scene.add(new THREE.HemisphereLight(0xffffff,0x6b776d,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,8,4);scene.add(light);
    const grid=new THREE.GridHelper(24,48,0xc5cec3,0xdce2d8);grid.position.y=-.015;scene.add(grid);
    const cargo=new THREE.Group(),vehicle=new THREE.Group();scene.add(cargo,vehicle);
    let model:THREE.Group|null=null,boxTexture:THREE.Texture|null=null;
    const resources=new Set<THREE.Material|THREE.BufferGeometry|THREE.Texture>();
    /** 지오메트리·재질·텍스처를 수집해 언마운트 시 해제한다. */
    const retain=(o:THREE.Object3D)=>{o.traverse(n=>{if(n instanceof THREE.Mesh){resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material]){resources.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)resources.add(v);}}});};
    const cube=new THREE.BoxGeometry(1,1,1),edges=new THREE.EdgesGeometry(cube);resources.add(cube);resources.add(edges);
    const baseMaterials=COLORS.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.9}));baseMaterials.forEach(m=>resources.add(m));
    // 적재함 바닥은 상자 재질과 분리한 단색 큐브다. 팔레트 텍스처를 적용하지 않는다.
    const floorMaterial=new THREE.MeshStandardMaterial({color:0x818c85,roughness:.95});resources.add(floorMaterial);
    const lineMat=new THREE.LineBasicMaterial({color:0x4c574a,transparent:true,opacity:.4});resources.add(lineMat);
    /** 좌표 변경만 반영하며 GLB를 다시 다운로드하지 않는다. */
    const update=()=>{
      cargo.clear();const c=current.current,frame=truckFrame(c.truck),{width:w,depth:d,height:h}=frame;
      // 기존 5.2m 가정은 앞단이 운전석까지 침범했다. 실제 내부 4.26m를 기준으로 모두 변환한다.
      if(model){model.scale.set(...frame.scale);model.traverse(n=>{if(n instanceof THREE.Mesh){const center=n.userData.originalCenter as THREE.Vector3|undefined;n.visible=c.exterior||!center||!(center.x>TRUCK_FRAME.front-.08&&center.y>TRUCK_FRAME.floor+.08);}});}
      const floor=new THREE.Mesh(cube,floorMaterial);floor.scale.set(d,.07,w);floor.position.set((frame.front+frame.rear)/2,frame.floor-.035,0);cargo.add(floor);
      const outline=new THREE.LineSegments(edges,lineMat);outline.scale.set(d,h,w);outline.position.set((frame.front+frame.rear)/2,frame.floor+h/2,0);cargo.add(outline);
      const positions=new Map<number,Vec|null>(c.boxes.map(b=>[b.id,c.fixed[b.id]??null]));
      for(const e of c.events.slice(0,c.step))positions.set(e.boxId,e.to);
      const active=c.events[c.step-1]?.boxId;
      for(const b of c.boxes){
        const pos=positions.get(b.id);if(!pos)continue;
        const group=new THREE.Group();group.scale.set(b.size[1]/100,b.size[2]/100,b.size[0]/100);
        group.position.set(...boxScenePosition(frame,pos,b.size));
        group.add(new THREE.Mesh(cube,baseMaterials[b.grade]),new THREE.LineSegments(edges,lineMat));
        if(active===b.id||c.fixed[b.id]){const frame=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:active===b.id?0xe36e32:0x147c59}));resources.add(frame.material);frame.scale.setScalar(1.02);group.add(frame);}
        cargo.add(group);
      }
    };
    api.current={update,home};update();
    new GLTFLoader().load(truckUrl,g=>{
      retain(g.scene);if(!alive){for(const r of resources)r.dispose();return;}
      model=g.scene;model.updateMatrixWorld(true);model.traverse(n=>{if(n instanceof THREE.Mesh)n.userData.originalCenter=new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3());});vehicle.add(model);update();setAssetStatus('탑차 에셋 적용됨');
    },undefined,()=>{if(alive)setAssetStatus('탑차 에셋 로딩 실패 · 계산용 적재함 표시');});
    new GLTFLoader().load(palletUrl,g=>{
      retain(g.scene);if(!alive){for(const r of resources)r.dispose();return;}
      g.scene.traverse(n=>{if(n instanceof THREE.Mesh&&!boxTexture){const materials=Array.isArray(n.material)?n.material:[n.material];boxTexture=materials.find(m=>m instanceof THREE.MeshStandardMaterial&&m.map)?.map??null;}});
      if(boxTexture)baseMaterials.forEach(m=>{m.map=boxTexture;m.needsUpdate=true;});
      const bounds=new THREE.Box3().setFromObject(g.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const factor=1.1/Math.max(size.x,size.z);g.scene.scale.setScalar(factor);g.scene.position.set(4.9-center.x*factor,-bounds.min.y*factor,-2.5-center.z*factor);scene.add(g.scene);update();
    },undefined,()=>{if(alive)setAssetStatus(s=>s+' · 상자 재질 로딩 실패');});
    const resize=new ResizeObserver(()=>{const width=el.clientWidth,height=el.clientHeight;renderer.setSize(width,height);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();});resize.observe(el);
    renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
    return()=>{alive=false;api.current=null;resize.disconnect();controls.dispose();renderer.setAnimationLoop(null);for(const r of resources)r.dispose();renderer.dispose();renderer.domElement.remove();};
  },[]);
  useEffect(()=>{api.current?.update();},[boxes,coords,truck,events,step,fixed,exterior]);
  return <div className="scene-wrap"><div ref={host} className="scene"/>{error&&<p className="scene-error">{error}</p>}<div className="scene-toolbar"><button onClick={()=>api.current?.home()}>시점 복원</button><button aria-pressed={exterior} onClick={()=>setExterior(x=>!x)}>{exterior?'외벽 숨기기':'외벽 보기'}</button></div><div className="scene-caption"><span><i/> {assetStatus}</span><span>드래그로 회전 · 휠로 확대</span></div></div>;
}

```

함수·구성요소 역할(실제 문서화 주석):
- `export function TruckView(`: 빈 적재함 또는 고정 적재 상태에서 실제 상차 이벤트를 차례로 렌더링한다. SW_Browser_Scene_001

### `src/scene/truckFrame.ts`

```tsx
import type {Truck,Vec} from '../domain/model';

/** 원본 GLB의 적재함 내부 기준(m). 외벽 x=-0.88..3.55, 운전석 후면 x≈-1.032를 직접 확인했다. */
export const TRUCK_FRAME={front:-.82,rear:3.44,floor:1.15,ceiling:3.25,halfWidth:1.1} as const;
export interface SceneFrame {scale:Vec;front:number;rear:number;floor:number;width:number;depth:number;height:number}

/** 실제 에셋 내부 길이를 기준으로 모델·바닥·상자의 공통 좌표계를 만든다. SW_Browser_Scene_001 */
export function truckFrame(truck:Truck):SceneFrame {
  const width=truck.width/100,depth=truck.depth/100,height=truck.height/100;
  const scale:Vec=[depth/(TRUCK_FRAME.rear-TRUCK_FRAME.front),height/(TRUCK_FRAME.ceiling-TRUCK_FRAME.floor),width/(TRUCK_FRAME.halfWidth*2)];
  return {scale,front:TRUCK_FRAME.front*scale[0],rear:TRUCK_FRAME.rear*scale[0],floor:TRUCK_FRAME.floor*scale[1],width,depth,height};
}

/** 계산 x=폭,y=입구부터 깊이,z=높이를 3D x=차체길이,y=높이,z=폭 중심 좌표로 바꾼다. */
export function boxScenePosition(frame:SceneFrame,pos:Vec,size:Vec):Vec {
  return [frame.rear-(pos[1]+size[1]/2)/100,frame.floor+(pos[2]+size[2]/2)/100,-frame.width/2+(pos[0]+size[0]/2)/100];
}

```

## 2026-11-16 13:00:16 (KST) 추가 수정

원본 GLB의 실제 운전석·적재함 경계를 기준으로 모델·바닥·상자 좌표를 통일했다. 바닥은 단색 일반 큐브이며 상자용 텍스처 재질과 분리했다. tests/truck-frame.test.ts에서 실제 원본 GLB를 읽어 변경 치수 27조합의 비침범·내부 경계와 바닥 일치를 검증했다.

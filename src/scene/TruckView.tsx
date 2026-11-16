import { useEffect,useRef,useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Box,Vec,Truck,MoveEvent } from '../domain/model';
import { truckFrame,boxScenePosition,TRUCK_FRAME } from './truckFrame';
import truckUrl from '../../Asset/7-5-t-class-box-truck-with-roll-up-door.glb?url';
import palletUrl from '../../Asset/aws-warehouse/ClutteringC_01.glb?url';
const COLORS=['#d4aa74','#94bb9b','#c4ae82','#8babb0','#c28a65'];
export type SceneCapture=()=>{image:string;assetStatus:string};
interface Props {captureRef?:{current:SceneCapture|null};boxes:Box[];coords:Vec[];truck:Truck;events:MoveEvent[];step:number;fixed:Record<number,Vec>}
/** 빈 적재함 또는 고정 적재 상태에서 실제 상차 이벤트를 차례로 렌더링한다. SW_Browser_Scene_001 */
export function TruckView({boxes,coords,truck,events,step,fixed,captureRef}:Props) {
  const host=useRef<HTMLDivElement>(null),api=useRef<{update:()=>void;home:()=>void}|null>(null);
  const current=useRef({boxes,coords,truck,events,step,fixed,exterior:false});
  const assetRef=useRef('탑차 에셋 로딩 중');
  const [exterior,setExterior]=useState(false),[assetStatus,setAssetStatus]=useState('탑차 에셋 로딩 중'),[error,setError]=useState('');
  current.current={boxes,coords,truck,events,step,fixed,exterior};assetRef.current=assetStatus;
  useEffect(()=>{
    const el=host.current!;let alive=true;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError('WebGL을 사용할 수 없습니다. 브라우저의 하드웨어 가속을 확인하세요.');return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#e9eee7');renderer.outputColorSpace=THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','선택 개체의 탑차 적재 배치 3D');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,100);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxDistance=24;controls.minDistance=3;controls.maxPolarAngle=Math.PI*.49;
    // 조작·데이터 변경 시에만 그린다. 감쇠 중 change 이벤트는 다음 프레임을 예약한다.
    let pendingFrame:number|null=null;
    function renderFrame(){pendingFrame=null;if(!alive)return;controls.update();renderer.render(scene,camera);}
    const invalidate=()=>{if(alive&&pendingFrame===null)pendingFrame=requestAnimationFrame(renderFrame);};
    controls.addEventListener('change',invalidate);
    /** 화면 크기와 관계없이 적재함 중심으로 카메라를 복원한다. */
    const home=()=>{camera.position.set(9,8,9);controls.target.set(.2,1.5,0);controls.update();invalidate();};home();
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
    const activeMaterial=new THREE.LineBasicMaterial({color:0xe36e32}),fixedMaterial=new THREE.LineBasicMaterial({color:0x147c59});resources.add(activeMaterial);resources.add(fixedMaterial);
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
        if(active===b.id||c.fixed[b.id]){const frame=new THREE.LineSegments(edges,active===b.id?activeMaterial:fixedMaterial);frame.scale.setScalar(1.02);group.add(frame);}
        cargo.add(group);
      }
      invalidate();
    };
    api.current={update,home};update();
    if(captureRef)captureRef.current=()=>{update();controls.update();renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');if(image==='data:,')throw Error('3D 캡처 크기를 확인하세요.');return {image,assetStatus:assetRef.current};};
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
    const resize=new ResizeObserver(()=>{const width=el.clientWidth,height=el.clientHeight;renderer.setSize(width,height);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();invalidate();});resize.observe(el);
    return()=>{alive=false;api.current=null;if(captureRef)captureRef.current=null;if(pendingFrame!==null)cancelAnimationFrame(pendingFrame);resize.disconnect();controls.removeEventListener('change',invalidate);controls.dispose();for(const r of resources)r.dispose();renderer.dispose();renderer.domElement.remove();};
  },[]);
  useEffect(()=>{api.current?.update();},[boxes,coords,truck,events,step,fixed,exterior]);
  return <div className="scene-wrap"><div ref={host} className="scene"/>{error&&<p className="scene-error">{error}</p>}<div className="scene-toolbar"><button onClick={()=>api.current?.home()}>시점 복원</button><button aria-pressed={exterior} onClick={()=>setExterior(x=>!x)}>{exterior?'외벽 숨기기':'외벽 보기'}</button></div><div className="scene-caption"><span><i/> {assetStatus}</span><span>드래그로 회전 · 휠로 확대</span></div></div>;
}

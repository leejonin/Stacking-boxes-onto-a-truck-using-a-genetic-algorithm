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

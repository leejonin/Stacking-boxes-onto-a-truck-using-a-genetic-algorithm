import type {Truck} from './model';import type {Placed} from './packing';
export interface Region{x:number;y:number;z:number;w:number;d:number;h:number}
/** 점유 상자를 빼고 서로 겹치지 않는 여섯 슬라브로 나눈다. */
export function occupy(regions:Region[],p:Placed):Region[]{
 const out:Region[]=[];for(const r of regions){const x=Math.max(r.x,p.pos[0]),y=Math.max(r.y,p.pos[1]),z=Math.max(r.z,p.pos[2]),xx=Math.min(r.x+r.w,p.pos[0]+p.box.size[0]),yy=Math.min(r.y+r.d,p.pos[1]+p.box.size[1]),zz=Math.min(r.z+r.h,p.pos[2]+p.box.size[2]);if(x>=xx||y>=yy||z>=zz){out.push(r);continue;}
 out.push(...[{x:r.x,y:r.y,z:r.z,w:x-r.x,d:r.d,h:r.h},{x:xx,y:r.y,z:r.z,w:r.x+r.w-xx,d:r.d,h:r.h},{x,y:r.y,z:r.z,w:xx-x,d:y-r.y,h:r.h},{x,y:yy,z:r.z,w:xx-x,d:r.y+r.d-yy,h:r.h},{x,y,z:r.z,w:xx-x,d:yy-y,h:z-r.z},{x,y,z:zz,w:xx-x,d:yy-y,h:r.z+r.h-zz}].filter(r=>r.w>0&&r.d>0&&r.h>0));}return out;
}
/** 현재 적재물과 겹치지 않는 빈 구획을 만든다. 실제 배치에는 별도 지지·경로 검사가 필요하다. */
export function freeRegions(placed:Placed[],truck:Truck):Region[]{let regions:Region[]=[{x:0,y:0,z:0,w:truck.width,d:truck.depth,h:truck.height}];for(const p of placed)regions=occupy(regions,p);return regions;}

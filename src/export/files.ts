import type {Graphic} from './report';
/** 의존성 없이 저장 방식 ZIP을 작성한다. UTF-8 이름·CRC32·중앙 디렉터리를 포함한다. */
const encoder=new TextEncoder();
export function crc32(bytes:Uint8Array):number {let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipStore(files:{name:string;bytes:Uint8Array}[]):Uint8Array {
 if(files.length>65535)throw Error('ZIP 파일 수 한도를 넘었습니다. 세대 범위를 나눠 주세요.');
 const parts:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0,dirSize=0;
 for(const file of files){const name=encoder.encode(file.name),crc=crc32(file.bytes),head=new Uint8Array(30+name.length),h=new DataView(head.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,file.bytes.length,true);h.setUint32(22,file.bytes.length,true);h.setUint16(26,name.length,true);head.set(name,30);
  const entry=new Uint8Array(46+name.length),d=new DataView(entry.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,file.bytes.length,true);d.setUint32(24,file.bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);entry.set(name,46);
  parts.push(head,file.bytes);directory.push(entry);offset+=head.length+file.bytes.length;dirSize+=entry.length;
  if(offset+dirSize+22>0xffffffff)throw Error('ZIP 크기 한도를 넘었습니다. 세대 범위를 나눠 주세요.');
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,dirSize,true);e.setUint32(16,offset,true);
 const out=new Uint8Array(offset+dirSize+22);let at=0;for(const p of [...parts,...directory,end]){out.set(p,at);at+=p.length;}return out;
}
export async function png(g:Graphic):Promise<Blob> {
 await document.fonts.ready;
 // SVG 자체를 렌더링하므로 스크롤 밖 데이터·한글·범례도 그대로 포함한다.
 const url=URL.createObjectURL(new Blob([g.svg],{type:'image/svg+xml;charset=utf-8'}));
 try {const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('이미지를 생성하지 못했습니다. SVG로 저장하거나 범위를 줄여 주세요.'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=g.width;canvas.height=g.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지 캔버스를 사용할 수 없습니다.');ctx.drawImage(image,0,0);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG 크기 한도를 초과했습니다. 범위를 줄여 주세요.')),'image/png'));
 } finally{URL.revokeObjectURL(url);}
}
export function download(blob:Blob,name:string):void {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export const svgBlob=(g:Graphic)=>new Blob([g.svg],{type:'image/svg+xml;charset=utf-8'});
export const bytes=(s:string)=>encoder.encode(s);

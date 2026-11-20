export const MAX_IMAGE_FILE=20*1024*1024;
export const MAX_EMBEDDED_IMAGE=750*1024;
export function imageKind(bytes){
 const starts=signature=>signature.every((value,index)=>bytes[index]===value);
 if(starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return 'png';
 if(starts([0xff,0xd8,0xff]))return 'jpeg';
 const word=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(['GIF87a','GIF89a'].includes(word(0,6)))return 'gif';
 if(word(0,4)==='RIFF'&&word(8,12)==='WEBP')return 'webp';
 if(word(4,8)==='ftyp'&&['heic','heix','hevc','hevx','mif1','msf1'].includes(word(8,12)))return 'heic';
 return null;
}
export function imageFitsNotebook(notebookBytes,imageCharacters){return notebookBytes+imageCharacters<11*1024*1024;}
export function imageURL(value){try{const url=new URL(value.trim());return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export async function prepareImage(file){
 if(file.size>MAX_IMAGE_FILE)throw new Error('20MB以下の画像を選んでください。');
 const kind=imageKind(new Uint8Array(await file.slice(0,32).arrayBuffer()));
 if(!kind)throw new Error('JPEG・PNG・WebP・GIF形式の画像を選んでください。');
 if(kind==='gif'&&file.size>MAX_EMBEDDED_IMAGE)throw new Error('アニメーションを保つため、750KB以下のGIFを選ぶか画像のURLを使用してください。');
 if(kind==='gif'){return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('画像を読み込めませんでした。'));reader.readAsDataURL(file);});}
 const temporary=URL.createObjectURL(file),image=new Image();
 try{
  image.src=temporary;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>80000000)throw new Error('画像のサイズを確認できませんでした。');
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('画像を読み込めませんでした。');
  for(let attempt=0;attempt<5;attempt++){
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const result=canvas.toDataURL('image/webp',Math.max(.55,.86-attempt*.07));
   if(result.length*3/4<=MAX_EMBEDDED_IMAGE)return result;
   canvas.width=Math.max(1,Math.round(canvas.width*.8));canvas.height=Math.max(1,Math.round(canvas.height*.8));
  }
  throw new Error('画像が大きいため挿入できません。小さい画像か、画像のURLを使用してください。');
 }catch(error){if(kind==='heic')throw new Error('この端末でHEIC画像を開けませんでした。写真をJPEG形式で書き出して選択してください。');throw error;}
 finally{URL.revokeObjectURL(temporary);}
}

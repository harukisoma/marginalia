export function applyExactPatch(source,before,after){
 if(typeof before!=='string'||!before.length)throw new Error('変更対象が空です。');
 const start=source.indexOf(before);
 if(start<0||source.indexOf(before,start+1)>=0)throw new Error('変更対象が更新されたか、同じ文章が複数あります。再提案してください。');
 return source.slice(0,start)+after+source.slice(start+before.length);
}

export function applyExactPatch(source,before,after){
 if(typeof before!=='string'||!before.length)throw new Error('変更対象が空です。');
 const start=source.indexOf(before);
 if(start<0||source.indexOf(before,start+1)>=0)throw new Error('変更対象が更新されたか、同じ文章が複数あります。再提案してください。');
 return source.slice(0,start)+after+source.slice(start+before.length);
}
// Validate against one snapshot before any change. Independent proposals may
// share a paragraph, but may not overlap or make later targets ambiguous.
export function planExactPatches(source,edits){
 const ranges=edits.map((edit,index)=>{applyExactPatch(source,edit.before,edit.after);const start=source.indexOf(edit.before);return {...edit,index,start,end:start+edit.before.length};}).sort((a,b)=>b.start-a.start);
 for(let i=1;i<ranges.length;i++)if(ranges[i].end>ranges[i-1].start)throw new Error('変更案の対象が重複しています。個別に確認するか再提案してください。');
 let result=source;for(const edit of ranges)result=applyExactPatch(result,edit.before,edit.after);
 return ranges;
}

import {leafClassifications,matchesClassification} from './taxonomy.mjs';
/** @type {Record<string,string>} */
export const leafStatuses={unread:'未着手',reading:'進行中',done:'完了'};
export const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g,' ').trim();
export function uniqueTags(values){
 const seen=new Set();return values.filter(value=>typeof value==='string'&&value.trim()).filter(value=>{const key=normalize(value);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
}
export function filterLeaves(pages,{query='',tag='',untagged=false,status='',kind=''}={},body=(_id)=> ''){
 const words=normalize(query).split(' ').filter(Boolean);
 return pages.filter(page=>{
  if(kind&&page.kind!==kind||status&&page.status!==status)return false;
  const tags=leafClassifications(page).map(item=>item.name);
  if(untagged&&tags.length||tag&&!matchesClassification(page,tag))return false;
  if(!words.length)return true;
  const metadata=normalize([page.title,page.author,...tags].join(' '));
  // Load the cached body only if the metadata cannot already answer the query.
  if(words.every(word=>metadata.includes(word)))return true;
  const haystack=metadata+' '+normalize(body(page.id));
  return words.every(word=>haystack.includes(word));
 });
}
export function sortLeaves(pages,sort='updated'){
 return [...pages].sort((a,b)=>{
  const result=sort==='title'?String(a.title).localeCompare(String(b.title),'ja',{numeric:true}):sort==='created'?b.created-a.created:sort==='oldest'?a.updated-b.updated:b.updated-a.updated;
  return result||String(a.id).localeCompare(String(b.id));
 });
}
/** @param {any[]} pages @param {string} [group] @param {(id:string)=>any} [lookup] */
export function groupLeaves(pages,group='none',lookup=(_id)=>undefined){
 const groups=new Map();
 for(const page of pages){
  const key=group==='kind'?page.kind:group==='status'?page.status:group==='parent'?(page.parent&&lookup(page.parent)&&!lookup(page.parent).deleted?page.parent:'none'):'all';
  if(!groups.has(key))groups.set(key,{key,label:group==='kind'?({book:'本',paper:'論文',note:'ノート',journal:'日記'}[key]||key):group==='status'?(leafStatuses[key]||key):group==='parent'?(lookup(key)?.title||'親リーフなし'):'すべてのリーフ',pages:[]});
  groups.get(key).pages.push(page);
 }
 if(group==='status')return [...groups.values()].sort((a,b)=>['reading','unread','done'].indexOf(a.key)-['reading','unread','done'].indexOf(b.key));
 if(group==='kind')return [...groups.values()].sort((a,b)=>['book','paper','note','journal'].indexOf(a.key)-['book','paper','note','journal'].indexOf(b.key));
 return [...groups.values()];
}
export function pageWindow(pages,page,size=30){
 const count=Math.max(1,Math.ceil(pages.length/size)),current=Math.max(1,Math.min(page,count));
 return {items:pages.slice((current-1)*size,current*size),current,count,total:pages.length,start:pages.length?(current-1)*size+1:0,end:Math.min(current*size,pages.length)};
}
export function searchExcerpt(text,query='',length=125){
 const clean=String(text||'').replace(/\s+/g,' ').trim();
 const word=normalize(query).split(' ').find(Boolean)||'';
 const index=word?normalize(clean).indexOf(word):-1,start=index>32?index-28:0;
 return (start?'…':'')+clean.slice(start,start+length)+(clean.length>start+length?'…':'');
}
export function textFromBlocks(node){
 if(!node||typeof node!=='object')return '';
 if(node.type==='text')return node.text||'';
 if(node.type==='image')return node.attrs?.alt||'';
 if(node.type==='mathBlock'||node.type==='inlineMath')return node.attrs?.source||'';
 if(node.type==='markdownExtra'||node.type==='footnoteReference')return String(node.attrs?.source||'').replace(/<[^>]*>/g,' ');
 return (node.content||[]).map(textFromBlocks).join(node.type==='paragraph'||node.type==='heading'||node.type==='text'?'':' ');
}

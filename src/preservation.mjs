import * as Y from 'yjs';

const pageKinds=new Set(['note','paper','book','journal']);
const emptyContainers=new Set(['paragraph','heading','blockquote','bulletlist','orderedlist','listitem','tasklist','taskitem','codeblock']);
const rollingReasons=new Set(['自動保存','アプリを開いた時']);

export function isProtectedSnapshot(snapshot){
 return snapshot.protected===true||!rollingReasons.has(snapshot.reason);
}

export function expiredRollingSnapshots(snapshots,limit=30){
 return snapshots.filter(snapshot=>!isProtectedSnapshot(snapshot))
  .sort((a,b)=>b.created-a.created).slice(limit).map(snapshot=>snapshot.id);
}

function hasContent(node){
 if(node instanceof Y.XmlText)return node.length>0;
 return !(node instanceof Y.XmlElement)||!emptyContainers.has(node.nodeName.toLowerCase())||node.toArray().some(hasContent);
}

function hasLeafBody(notebook,id){
 const body=notebook.getXmlFragment('page:'+id);
 if(body.length)return body.toArray().some(hasContent);
 return Boolean(notebook.getMap('seeds').get(id));
}

function metadata(value){
 return value instanceof Y.Map?value.toJSON():value;
}

// Inspect a merged copy. A remote notebook can legitimately omit local-only
// records, so compare the merged result with the current notebook.
export function inspectNotebookUpdate(notebook,currentState,incoming){
 const staged=new Y.Doc();
 try{
  Y.applyUpdate(staged,currentState);
  Y.applyUpdate(staged,incoming);
  const after=staged.getMap('pages');
  let archive=false;
  for(const [id,value] of notebook.getMap('pages')){
   const before=metadata(value),next=metadata(after.get(id));
   if(!after.has(id)||typeof before?.id==='string'&&next?.id!==before.id||
     pageKinds.has(before?.kind)&&!pageKinds.has(next?.kind))return 'block';
   if(!before?.deleted&&next?.deleted||before?.kind==='journal'&&next?.kind!=='journal'||
     hasLeafBody(notebook,id)&&!hasLeafBody(staged,id))archive=true;
  }
  return archive?'archive':'merge';
 }finally{
  staged.destroy();
 }
}

export function copyLeafBody(from,to,sourceId,destinationId){
 const seed=from.getMap('seeds').get(sourceId);
 const blocks=from.getXmlFragment('page:'+sourceId).toArray();
 if(typeof seed==='string')to.getMap('seeds').set(destinationId,seed);
 if(blocks.length)to.getXmlFragment('page:'+destinationId).insert(0,blocks.map(block=>block.clone()));
}

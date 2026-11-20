import * as Y from 'yjs';
import {doc,pages,persistence,createPage,updatePage,download,type Page} from './data';
import {RECOVERY_DATABASE,BACKUP_FORMAT,backupStateFromText} from './storage.mjs';
import {copyLeafBody,expiredRollingSnapshots,isProtectedSnapshot} from './preservation.mjs';

export type RecoveryInfo={id:string;created:number;reason:string;count:number;protected?:boolean};
export type Recovery=RecoveryInfo&{state:Uint8Array};

let database:Promise<IDBDatabase>|undefined,queue:Promise<unknown>=Promise.resolve();

function open(){
 return database??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(RECOVERY_DATABASE,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots',{keyPath:'id'});};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=undefined;};resolve(db);};
  request.onerror=()=>reject(request.error);
 }).catch(()=>{
  database=undefined;
  throw new Error('復元用バックアップを開けませんでした。空き容量とブラウザの保存設定を確認してください。');
 });
}

function snapshotInfo(snapshot:Recovery):RecoveryInfo{
 const {id,created,reason,count}=snapshot;
 return {id,created,reason,count,protected:isProtectedSnapshot(snapshot)};
}

function readMetadata(store:IDBObjectStore,done:(items:RecoveryInfo[])=>void){
 const items:RecoveryInfo[]=[];
 const request=store.openCursor();
 request.onsuccess=()=>{
  const cursor=request.result;
  if(!cursor){done(items);return;}
  items.push(snapshotInfo(cursor.value));
  cursor.continue();
 };
}

export async function listRecovery():Promise<RecoveryInfo[]>{
 const db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('snapshots');
  readMetadata(tx.objectStore('snapshots'),items=>resolve(items.sort((a,b)=>b.created-a.created)));
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error);
 });
}

export async function readRecovery(id:string):Promise<Recovery>{
 const db=await open();
 return new Promise((resolve,reject)=>{
  const request=db.transaction('snapshots').objectStore('snapshots').get(id);
  request.onsuccess=()=>request.result?resolve(request.result):reject(new Error('バックアップが見つかりません。'));
  request.onerror=()=>reject(request.error);
 });
}

async function saveSnapshot(snapshot:Recovery){
 const db=await open();
 await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');
  if(isProtectedSnapshot(snapshot)){
   const existing=store.getKey(snapshot.id);
   existing.onsuccess=()=>{if(existing.result===undefined)store.add(snapshot);};
  }else{
   store.add(snapshot);
   readMetadata(store,items=>{
    for(const id of expiredRollingSnapshots(items))store.delete(id);
   });
  }
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(new Error('復元用バックアップを保存できませんでした。空き容量を確認し、全リーフを書き出してください。'));
  tx.onabort=()=>reject(new Error('復元用バックアップの保存が中断されました。'));
 });
}

export function checkpoint(reason:string):Promise<void>{
 const job=queue.catch(()=>{}).then(async()=>{
  await persistence.whenSynced;
  if(!pages.size)return;
  const state=Y.encodeStateAsUpdate(doc),count=pages.size;
  const protectedCopy=isProtectedSnapshot({reason});
  let id=crypto.randomUUID() as string;
  if(protectedCopy){
   const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(state));
   id='protected-'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  await saveSnapshot({id,created:Date.now(),reason,count,state,protected:protectedCopy});
 });
 queue=job;
 return job;
}

export async function protectBeforeRelease(release:string){
 const key='marginalia-protected-release';
 if(!release||localStorage.getItem(key)===release||!pages.size)return;
 await checkpoint('更新後の初回起動時');
 localStorage.setItem(key,release);
}
export function decodeRecovery(snapshot:Recovery){const copy=new Y.Doc();try{Y.applyUpdate(copy,snapshot.state);return copy;}catch(error){copy.destroy();throw error;}}
export function recoveryPages(copy:Y.Doc):Page[]{return [...copy.getMap<Y.Map<unknown>|Page>('pages').values()].map(value=>value instanceof Y.Map?value.toJSON() as Page:value).filter(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&['note','paper','book','journal'].includes(p.kind)).map(p=>({...p,tags:Array.isArray(p.tags)?p.tags.filter(t=>typeof t==='string'):[],author:typeof p.author==='string'?p.author:'',url:typeof p.url==='string'?p.url:'',parent:typeof p.parent==='string'?p.parent:'',status:['unread','reading','done'].includes(p.status)?p.status:'unread' as Page['status']})).sort((a,b)=>b.updated-a.updated);}
export async function importBackupForRecovery(text:string){const snapshot:Recovery={id:crypto.randomUUID(),created:Date.now(),reason:'ファイルから読み込んだバックアップ',count:0,state:backupStateFromText(text)};const copy=decodeRecovery(snapshot);try{snapshot.count=recoveryPages(copy).length;}finally{copy.destroy();}const job=queue.catch(()=>{}).then(()=>saveSnapshot(snapshot));queue=job;await job;return snapshot.id;}
export async function downloadRecovery(id:string){const snapshot=await readRecovery(id);download('marginalia-'+new Date(snapshot.created).toISOString().slice(0,19).replaceAll(':','-')+'.json',JSON.stringify({format:BACKUP_FORMAT,state:Array.from(snapshot.state)}),'application/json');}
export async function restoreLeafCopy(original:Page,source:Y.Doc){
 await checkpoint('リーフの復元前');
 return doc.transact(()=>{
  const copy=createPage(original.kind);
  const parent=original.parent?pages.get(original.parent):null;
  updatePage(copy.id,{...Object.fromEntries(['bookGenres','paperMajor','paperMiddle','paperMinor','noteTypes'].filter(key=>key in original).map(key=>[key,original[key as keyof Page]])),title:original.title+'（復元）',tags:[...original.tags],author:original.author,
   url:original.url,status:original.status,parent:parent&&!parent.deleted?parent.id:'',
   created:Number.isFinite(original.created)?original.created:copy.created});
  copyLeafBody(source,doc,original.id,copy.id);
  return copy;
 });
}
export function startAutoRecovery(onError:(message:string)=>void){let dirty=false,busy=false,last=0;const changed=()=>{dirty=true;};const save=async(reason:string)=>{if(busy||(!dirty&&last))return;busy=true;dirty=false;try{await checkpoint(reason);last=Date.now();}catch(error){dirty=true;onError((error as Error).message);}finally{busy=false;}};doc.on('update',changed);void listRecovery().then(items=>{if(!items.length||Date.now()-items[0].created>3600000)void save('アプリを開いた時');else last=items[0].created;}).catch(error=>onError(error.message));const timer=setInterval(()=>{if(Date.now()-last>=300000)void save('自動保存');},60000);return()=>{clearInterval(timer);doc.off('update',changed);};}

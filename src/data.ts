import * as Y from 'yjs';
import {IndexeddbPersistence} from 'y-indexeddb';
import {NOTEBOOK_DATABASE,BACKUP_FORMAT,backupStateFromText} from './storage.mjs';
export type Page={id:string;title:string;kind:'note'|'paper'|'book'|'journal';tags:string[];status:'unread'|'reading'|'done';author:string;url:string;parent:string;created:number;updated:number;deleted?:boolean};
export const doc=new Y.Doc();
const pageMap=doc.getMap<Y.Map<unknown>|Page>('pages');
export const pages={
 get size(){return pageMap.size;},
 get(id:string):Page|undefined{const value=pageMap.get(id);return value instanceof Y.Map?value.toJSON() as Page:value;},
 *values():IterableIterator<Page>{for(const value of pageMap.values())yield value instanceof Y.Map?value.toJSON() as Page:value;},
 set(id:string,page:Page){doc.transact(()=>{let value=pageMap.get(id);if(!(value instanceof Y.Map)){const next=new Y.Map<unknown>();for(const [key,item]of Object.entries(value||{}))next.set(key,item);pageMap.set(id,next);value=next;}const map=value as Y.Map<unknown>;for(const[key,item]of Object.entries(page)){if(JSON.stringify(map.get(key))!==JSON.stringify(item))map.set(key,item);}});}
};
export const persistence=new IndexeddbPersistence(NOTEBOOK_DATABASE,doc);
export const labels={note:'ノート',paper:'論文',book:'本',journal:'日記'};
export function createPage(kind:Page['kind']='note',parent=''){
 const page:Page={id:crypto.randomUUID(),title:kind==='journal'?new Intl.DateTimeFormat('ja-JP',{dateStyle:'long'}).format(new Date()):'無題の'+labels[kind],kind,tags:[],status:'unread',author:'',url:'',parent,created:Date.now(),updated:Date.now()};
 pages.set(page.id,page);return page;
}
export function updatePage(id:string,change:Partial<Page>){const page=pages.get(id);if(page)pages.set(id,{...page,...change,id,updated:Date.now()});}
export function allPages(){return [...pages.values()].filter(p=>!p.deleted).sort((a,b)=>b.updated-a.updated);}
export function safeURL(value:string){try{const url=new URL(value);return /^https?:$/.test(url.protocol)?url.href:'';}catch{return '';}}
export function download(name:string,body:string,type='text/plain'){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function backup(){download('marginalia-backup.json',JSON.stringify({format:BACKUP_FORMAT,state:Array.from(Y.encodeStateAsUpdate(doc))}),'application/json');}
export function restore(text:string){Y.applyUpdate(doc,backupStateFromText(text),'restore');}

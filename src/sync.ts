import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import * as Y from 'yjs';
import {doc} from './data';
import {inspectNotebookUpdate} from './preservation.mjs';

export type SyncConfig={url:string;key:string};
export type SyncStatus='local'|'offline'|'syncing'|'synced'|'error';

function toBase64(bytes:Uint8Array){
 let result='';
 for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(result);
}

export class CloudSync{
 client:SupabaseClient;
 authSubscription?:{unsubscribe:()=>void};
 closed=false;
 email='';
 timer?:ReturnType<typeof setInterval>;
 private owner='';
 private dirty=true;
 private epoch=0;
 private pending?:ReturnType<typeof setTimeout>;
 private channel?:ReturnType<SupabaseClient['channel']>;
 private request?:AbortController;
 private flight?:{epoch:number;done:Promise<void>};

 constructor(config:SyncConfig,private report:(state:SyncStatus,error?:string)=>void,private protect:(reason:string)=>Promise<void>){
  this.client=createClient(config.url,config.key);
 }

 private update=(_update:Uint8Array,origin:unknown)=>{
  if(origin==='cloud'||!this.owner)return;
  this.dirty=true;
  this.report(navigator.onLine?'syncing':'offline');
  clearTimeout(this.pending);
  this.pending=setTimeout(this.refresh,350);
 };
 private refresh=()=>void this.flush();
 private offline=()=>this.report('offline');

 pause(){
  this.epoch++;
  this.owner='';
  this.email='';
  this.request?.abort();
  doc.off('update',this.update);
  window.removeEventListener('online',this.refresh);
  window.removeEventListener('offline',this.offline);
  window.removeEventListener('focus',this.refresh);
  window.removeEventListener('pageshow',this.refresh);
  document.removeEventListener('visibilitychange',this.refresh);
  clearInterval(this.timer);
  clearTimeout(this.pending);
  this.timer=undefined;
  if(this.channel)void this.client.removeChannel(this.channel);
  this.channel=undefined;
 }

 async start(){
  if(this.closed)return false;
  const epoch=this.epoch;
  const {data:{session},error}=await this.client.auth.getSession();
  if(this.closed||epoch!==this.epoch)return false;
  if(error)throw error;
  if(!session){this.pause();this.report('local');return false;}

  const owner=session.user.id;
  const bound=localStorage.getItem('marginalia-sync-owner');
  if(bound&&bound!==owner){
   this.pause();
   this.email=session.user.email||'';
   throw new Error('この端末は別のアカウントと同期しています。ログアウトして、Macで使っているアカウントでログインし直してください。');
  }
  if(this.owner===owner)return true;
  this.email=session.user.email||'';
  if(!bound)await this.protect('初回同期前');
  if(this.closed||epoch!==this.epoch)return false;
  if(this.owner===owner)return true;
  localStorage.setItem('marginalia-sync-owner',owner);
  this.owner=owner;
  doc.on('update',this.update);
  window.addEventListener('online',this.refresh);
  window.addEventListener('offline',this.offline);
  window.addEventListener('focus',this.refresh);
  window.addEventListener('pageshow',this.refresh);
  document.addEventListener('visibilitychange',this.refresh);
  this.timer=setInterval(this.refresh,15000);
  this.channel=this.client.channel('notebook:'+owner+':'+this.epoch)
   .on('postgres_changes',{event:'*',schema:'public',table:'notebooks',filter:'owner=eq.'+owner},this.refresh)
   .subscribe();
  await this.flush();
  return this.owner===owner;
 }

 async flush(){
  if(this.closed||!this.owner)return;
  if(!navigator.onLine){this.offline();return;}
  if(this.flight?.epoch===this.epoch)return this.flight.done;
  const epoch=this.epoch;
  const controller=new AbortController();
  this.request=controller;
  const done=this.exchange(this.owner,controller).finally(()=>{
   if(this.flight?.epoch===epoch)this.flight=undefined;
  });
  this.flight={epoch,done};
  return done;
 }

 private async exchange(owner:string,controller:AbortController){
  const {signal}=controller;
  this.report('syncing');
  try{
   const {data:{session},error:authError}=await this.client.auth.getSession();
   if(signal.aborted)return;
   if(authError)throw authError;
   if(!session||session.user.id!==owner)return;
   // Both operations must use the session that owns this notebook, even if a
   // different tab changes the active Supabase session before the request.
   const authorization='Bearer '+session.access_token;
   for(let attempts=0;attempts<8;attempts++){
    const {data,error}=await this.client.from('notebooks').select('state,revision').eq('owner',owner)
     .setHeader('Authorization',authorization).abortSignal(AbortSignal.any([signal,AbortSignal.timeout(12000)])).maybeSingle();
    if(signal.aborted)return;
    if(error)throw error;
    const current=Y.encodeStateAsUpdate(doc);
    const currentEncoded=toBase64(current);
    let encoded=currentEncoded;
    if(data?.state&&data.state!==currentEncoded){
     const incoming=Uint8Array.from(atob(data.state),c=>c.charCodeAt(0));
     const protection=inspectNotebookUpdate(doc,current,incoming);
     if(protection==='block'){
      throw new Error('記録を丸ごと削除する変更を検出したため、同期を停止しました。この端末のリーフはそのままです。');
     }
     if(protection==='archive'){
      await this.protect('同期でリーフや本文が見えなくなる前');
      if(signal.aborted)return;
      if(toBase64(Y.encodeStateAsUpdate(doc))!==currentEncoded)continue;
     }
     Y.applyUpdate(doc,incoming,'cloud');
     encoded=toBase64(Y.encodeStateAsUpdate(doc));
    }
    this.dirty=false;
    if(data?.state===encoded){this.report('synced');return;}
    const saved=await this.client.rpc('save_notebook',{expected_revision:data?.revision??0,new_state:encoded})
     .setHeader('Authorization',authorization).abortSignal(AbortSignal.any([signal,AbortSignal.timeout(12000)]));
    if(signal.aborted)return;
    if(saved.error){
     if(saved.error.code==='40001')continue;
     throw saved.error;
    }
    if(!this.dirty){this.report('synced');return;}
   }
   throw new Error('同時編集を同期しています。少し待ってから、もう一度お試しください。');
  }catch(error){
   if(signal.aborted)return;
   if(!navigator.onLine){this.offline();return;}
   const message=error instanceof Error?error.message:String((error as {message?:string}).message||error);
   this.report('error',message);
  }
 }

 stop(){
  this.closed=true;
  this.pause();
  this.authSubscription?.unsubscribe();
  this.client.auth.stopAutoRefresh();
 }
}

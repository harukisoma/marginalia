import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import * as Y from 'yjs';
import {doc} from './data';
export type SyncConfig={url:string;key:string};
export type SyncStatus='local'|'offline'|'syncing'|'synced'|'error';
const toBase64=(bytes:Uint8Array)=>{let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);};
const fromBase64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export class CloudSync{
 client:SupabaseClient;authSubscription?:{unsubscribe:()=>void};closed=false;epoch=0;busy=false;dirty=true;stopped=false;timer?:ReturnType<typeof setInterval>;pending?:ReturnType<typeof setTimeout>;email='';channel?:ReturnType<SupabaseClient['channel']>;owner='';lastError='';
 constructor(config:SyncConfig,public report:(state:SyncStatus,error?:string)=>void){this.client=createClient(config.url,config.key);}
 update=(_update:Uint8Array,origin:unknown)=>{if(origin!=='cloud'&&!this.stopped){this.dirty=true;this.report(navigator.onLine?'syncing':'offline');if(this.pending)clearTimeout(this.pending);this.pending=setTimeout(()=>void this.flush(),600);}};
 online=()=>void this.flush();
 visible=()=>{if(document.visibilityState==='visible')void this.flush();};
 pause(){this.epoch++;this.stopped=true;this.owner='';this.email='';doc.off('update',this.update);window.removeEventListener('online',this.online);window.removeEventListener('focus',this.online);document.removeEventListener('visibilitychange',this.visible);if(this.timer)clearInterval(this.timer);this.timer=undefined;if(this.pending)clearTimeout(this.pending);if(this.channel)void this.client.removeChannel(this.channel);this.channel=undefined;}
 async start(){if(this.closed)return false;const epoch=this.epoch;const {data:{session},error}=await this.client.auth.getSession();if(this.closed||epoch!==this.epoch)return false;if(error)throw error;if(!session){this.pause();this.report('local');return false;}const bound=localStorage.getItem('marginalia-sync-owner');if(bound&&bound!==session.user.id){this.pause();throw new Error('別アカウントへリーフを送信しないため、同期を停止しました。現在のアカウントでログインしてください。');}localStorage.setItem('marginalia-sync-owner',session.user.id);if(this.timer&&!this.stopped)return true;this.owner=session.user.id;this.email=session.user.email||'';this.stopped=false;doc.on('update',this.update);window.addEventListener('online',this.online);window.addEventListener('focus',this.online);document.addEventListener('visibilitychange',this.visible);this.timer=setInterval(()=>void this.flush(),15000);this.channel=this.client.channel('notebook:'+this.owner).on('postgres_changes',{event:'*',schema:'public',table:'notebooks',filter:'owner=eq.'+this.owner},()=>void this.flush()).subscribe();await this.flush();return true;}
 async flush(){if(this.closed||this.stopped||this.busy||!this.owner)return;if(!navigator.onLine){this.report('offline');return;}this.busy=true;const epoch=this.epoch;this.report('syncing');
 try{for(let attempts=0;attempts<8;attempts++){
   const {data,error}=await this.client.from('notebooks').select('state,revision').eq('owner',this.owner).abortSignal(AbortSignal.timeout(20000)).maybeSingle();if(this.closed||this.stopped||epoch!==this.epoch)return;if(error)throw error;
   if(data?.state)Y.applyUpdate(doc,fromBase64(data.state),'cloud');
   const local=Y.encodeStateAsUpdate(doc),encoded=toBase64(local);
   if(data?.state===encoded){this.dirty=false;this.report('synced');return;}
   this.dirty=false;
   const saved=await this.client.rpc('save_notebook',{expected_revision:data?.revision??0,new_state:encoded}).abortSignal(AbortSignal.timeout(20000));
   if(this.closed||this.stopped||epoch!==this.epoch)return;
   if(saved.error){if(saved.error.code==='40001'){this.dirty=true;continue;}throw saved.error;}
   if(!this.dirty){this.report('synced');return;}
 }throw new Error('同時編集の同期を再試行しています。');
 }catch(error){if(this.closed||this.stopped||epoch!==this.epoch)return;this.dirty=true;this.lastError=error instanceof Error?error.message:String((error as {message?:string}).message||error);this.report('error',this.lastError);}finally{this.busy=false;}}
 stop(){this.closed=true;this.pause();this.authSubscription?.unsubscribe();this.client.auth.stopAutoRefresh();}
}

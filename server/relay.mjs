import {createClient} from '@supabase/supabase-js';
import {withAbort} from '../src/ai-request.mjs';
function databaseQuery(query){const signal=AbortSignal.timeout(15000);return withAbort(()=>query.abortSignal?query.abortSignal(signal):query,signal);}
export class AIRelay{
 constructor({hostId,read,save,inference,models,connected}){Object.assign(this,{hostId,read,save,inference,models,connected});this.client=null;this.busy=false;}
 async connect(config,tokens){
  const url=new URL(config.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||!String(config.key).startsWith('sb_publishable_'))throw new Error('Supabaseの公開接続情報を確認してください。');
  this.stop();const store=await this.read('cloud-auth.json')||{};
  const storage={getItem:async k=>store[k]??null,setItem:async(k,v)=>{store[k]=v;await this.save('cloud-auth.json',store);},removeItem:async k=>{delete store[k];await this.save('cloud-auth.json',store);}};
  const client=createClient(config.url,config.key,{auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  if(tokens){const {error}=await withAbort(()=>client.auth.setSession(tokens),AbortSignal.timeout(20000));if(error)throw new Error('クラウドのログイン情報を確認できませんでした。');}
  const {data:{user},error}=await withAbort(()=>client.auth.getUser(),AbortSignal.timeout(20000));if(error||!user)throw new Error('先にアプリのクラウド同期へログインしてください。');
  this.client=client;this.owner=user.id;this.authSubscription=client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')setTimeout(()=>{if(this.client===client)this.stop();},0);}).data.subscription;await this.save('cloud-config.json',config);await this.beat();
  this.timer=setInterval(()=>{void this.beat().catch(()=>{});},30000);this.jobs=setInterval(()=>{void this.tick().catch(()=>{});},10000);
  this.channel=client.channel('ai-queue:'+this.hostId).on('postgres_changes',{event:'INSERT',schema:'public',table:'ai_requests',filter:'owner=eq.'+this.owner},()=>void this.tick().catch(()=>{})).subscribe();void this.tick().catch(()=>{});
 }
 stop(){this.authSubscription?.unsubscribe();this.authSubscription=null;if(this.timer)clearInterval(this.timer);if(this.jobs)clearInterval(this.jobs);if(this.channel&&this.client)void this.client.removeChannel(this.channel);this.client?.auth.stopAutoRefresh();this.active?.abort();this.client=null;}
 async beat(){if(!this.client)return;const ready=this.connected();const catalog=ready?await this.models():[];const {error}=await databaseQuery(this.client.from('ai_hosts').upsert({owner:this.owner,host_id:this.hostId,connected:ready,models:catalog,updated_at:new Date().toISOString()}));if(error)throw new Error('AI中継テーブルを設定してください。');}
 async tick(){const client=this.client,owner=this.owner;if(!client||this.busy||!this.connected())return;this.busy=true;
  let monitor,controller;
  try{
   const now=new Date().toISOString();
   await databaseQuery(client.from('ai_requests').update({status:'failed',error:'Macの処理が中断されました。もう一度送信してください。',updated_at:now}).eq('owner',owner).eq('status','running').lt('updated_at',new Date(Date.now()-105000).toISOString()));
   await databaseQuery(client.from('ai_requests').update({status:'failed',error:'待機時間が長くなったため中止しました。もう一度送信してください。',updated_at:now}).eq('owner',owner).eq('status','queued').lt('created_at',new Date(Date.now()-600000).toISOString()));
   const {data,error}=await databaseQuery(client.from('ai_requests').select('id,payload').eq('owner',owner).eq('status','queued').order('created_at').limit(1));if(error||!data?.length)return;
   const job=data[0];const claim=await databaseQuery(client.from('ai_requests').update({status:'running',updated_at:now}).eq('id',job.id).eq('owner',owner).eq('status','queued').select('id'));if(claim.error||!claim.data?.length)return;
   controller=new AbortController();this.active=controller;let progress='ChatGPTが回答を準備しています',monitoring=false,lastBeat=0;
   // Cancellation uses existing terminal states; no schema reset or notebook migration.
   monitor=setInterval(async()=>{
    if(monitoring)return;monitoring=true;
    try{
     const {data,error}=await databaseQuery(client.from('ai_requests').select('status').eq('id',job.id).eq('owner',owner).single());
     if(!error&&data?.status!=='running'){controller.abort();return;}
     if(Date.now()-lastBeat>4500){lastBeat=Date.now();await databaseQuery(client.from('ai_requests').update({result:{progress},updated_at:new Date().toISOString()}).eq('id',job.id).eq('owner',owner).eq('status','running'));}
    }catch{}finally{monitoring=false;}
   },1000);
   try{
    const result=await this.inference(job.payload,{signal:controller.signal,onProgress:message=>{progress=message;}});
    if(!controller.signal.aborted)await databaseQuery(client.from('ai_requests').update({status:'completed',result,updated_at:new Date().toISOString()}).eq('id',job.id).eq('owner',owner).eq('status','running'));
   }catch(error){await databaseQuery(client.from('ai_requests').update({status:'failed',error:controller.signal.aborted?'中断しました。':error.message,updated_at:new Date().toISOString()}).eq('id',job.id).eq('owner',owner).eq('status','running'));}
  }finally{clearInterval(monitor);if(this.active===controller)this.active=null;this.busy=false;if(controller&&this.client===client)queueMicrotask(()=>void this.tick().catch(()=>{}));}
 }
}

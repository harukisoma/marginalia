import {createClient} from '@supabase/supabase-js';
export class AIRelay{
 constructor({hostId,read,save,inference,models,connected}){Object.assign(this,{hostId,read,save,inference,models,connected});this.client=null;this.busy=false;}
 async connect(config,tokens){
  const url=new URL(config.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||!String(config.key).startsWith('sb_publishable_'))throw new Error('Supabaseの公開接続情報を確認してください。');
  this.stop();const store=await this.read('cloud-auth.json')||{};
  const storage={getItem:async k=>store[k]??null,setItem:async(k,v)=>{store[k]=v;await this.save('cloud-auth.json',store);},removeItem:async k=>{delete store[k];await this.save('cloud-auth.json',store);}};
  const client=createClient(config.url,config.key,{auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  if(tokens){const {error}=await client.auth.setSession(tokens);if(error)throw new Error('クラウドのログイン情報を確認できませんでした。');}
  const {data:{user},error}=await client.auth.getUser();if(error||!user)throw new Error('先にアプリのクラウド同期へログインしてください。');
  this.client=client;this.owner=user.id;await this.save('cloud-config.json',config);await this.beat();
  this.timer=setInterval(()=>{void this.beat().catch(()=>{});},30000);this.jobs=setInterval(()=>{void this.tick().catch(()=>{});},10000);
  this.channel=client.channel('ai-queue:'+this.hostId).on('postgres_changes',{event:'INSERT',schema:'public',table:'ai_requests',filter:'owner=eq.'+this.owner},()=>void this.tick().catch(()=>{})).subscribe();void this.tick().catch(()=>{});
 }
 stop(){if(this.timer)clearInterval(this.timer);if(this.jobs)clearInterval(this.jobs);if(this.channel&&this.client)void this.client.removeChannel(this.channel);this.client?.auth.stopAutoRefresh();this.client=null;}
 async beat(){if(!this.client)return;const ready=this.connected();const catalog=ready?await this.models():[];const {error}=await this.client.from('ai_hosts').upsert({owner:this.owner,host_id:this.hostId,connected:ready,models:catalog,updated_at:new Date().toISOString()});if(error)throw new Error('AI中継テーブルを設定してください。');}
 async tick(){const client=this.client;if(!client||this.busy||!this.connected())return;this.busy=true;
  try{const {data,error}=await client.from('ai_requests').select('id,payload').eq('owner',this.owner).eq('status','queued').order('created_at').limit(1);if(error||!data?.length)return;const job=data[0];const claim=await client.from('ai_requests').update({status:'running',updated_at:new Date().toISOString()}).eq('id',job.id).eq('owner',this.owner).eq('status','queued').select('id');if(claim.error||!claim.data?.length)return;
   try{const result=await this.inference(job.payload);await client.from('ai_requests').update({status:'completed',result,updated_at:new Date().toISOString()}).eq('id',job.id).eq('owner',this.owner);}catch(error){await client.from('ai_requests').update({status:'failed',error:error.message,updated_at:new Date().toISOString()}).eq('id',job.id).eq('owner',this.owner);}
  }finally{this.busy=false;}
 }
}

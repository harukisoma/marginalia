export const AI_IDLE_MS=90000,AI_MAX_MS=600000;
export function prepareAIInput(body){
 const {prompt,context,history,model}=body;
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>30000||!Array.isArray(context)||!context.length||typeof model!=='string')throw new Error('送信内容を確認してください。');
 if(context.some(page=>typeof page.id!=='string'||typeof page.markdown!=='string'))throw new Error('参照リーフの形式が不正です。');
 // Embedded pictures remain in the notebook, but their megabytes of binary data
 // are not useful to this text editor. Markers must never appear in an edit.
 const pages=context.map(page=>({id:page.id,title:page.title,markdown:page.markdown.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g,'marginalia-embedded-image')}));
 if(pages.reduce((sum,page)=>sum+page.markdown.length,0)>180000)throw new Error('参照する本文が長すぎます。「開いているリーフ」に絞るか、リーフを分けて依頼してください。');
 const messages=[];let length=0;
 for(const item of (Array.isArray(history)?history:[]).slice(-8).reverse()){
  if(!['user','assistant'].includes(item.role)||typeof item.content!=='string')continue;
  if(length+item.content.length>16000)break;
  messages.unshift({role:item.role,content:item.content});length+=item.content.length;
 }
 return {prompt,context:pages,history:messages,model,effort:body.effort==='medium'?'medium':'low'};
}
export const abortError=()=>new DOMException('中断しました。','AbortError');
export function abortableDelay(ms,signal){return new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(signal.reason||abortError());
 const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
 const cancel=()=>{done();reject(signal.reason||abortError());};
 const timer=setTimeout(()=>{done();resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});
});}
export async function readChatStream(response,onProgress=()=>{}){
 const reader=response.body?.getReader();if(!reader)throw new Error('AIの応答を読み取れませんでした。');
 const decoder=new TextDecoder();let buffer='';
 try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const event=JSON.parse(line);if(event.type==='progress')onProgress(event.message);if(event.type==='error')throw new Error(event.message);if(event.type==='result')return event.result;}if(done)break;}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 throw new Error('AIとの通信が途中で切れました。もう一度送信できます。');
}
async function relayQuery(query,signal){const deadline=AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])]);return withAbort(()=>query.abortSignal?query.abortSignal(deadline):query,deadline);}
/** @param {any} client @param {any} payload @param {{signal?:AbortSignal,onProgress?:(message:string)=>void,pollMs?:number,maxMs?:number,now?:()=>number,delay?:(ms:number,signal?:AbortSignal)=>Promise<any>}} [options] */
export async function requestRelay(client,payload,{signal,onProgress=()=>{},pollMs=1200,maxMs=AI_MAX_MS+60000,now=Date.now,delay=abortableDelay}={}){
 if(!client)throw new Error('クラウド同期へログインしてください。');
 const {data:{session}}=await withAbort(()=>client.auth.getSession(),AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])]));if(!session)throw new Error('クラウド同期へログインしてください。');
 signal?.throwIfAborted();const id=crypto.randomUUID(),owner=session.user.id;
 const start=now();let lastActive=start,lastStamp='',lastStatus='';
 try{
  const {error}=await relayQuery(client.from('ai_requests').insert({id,owner,payload}),signal);if(error)throw new Error('AIへ送信できませんでした。通信を確認して再送信してください。');
  while(true){
  signal?.throwIfAborted();
  const {data,error}=await relayQuery(client.from('ai_requests').select('status,result,error,updated_at').eq('id',id).eq('owner',owner).single(),signal);
  if(error)throw new Error('AIの応答を確認できません。通信を確認して再送信してください。');
  if(data.status==='completed')return data.result;
  if(data.status==='failed')throw new Error(data.error||'AI応答に失敗しました。');
  if(data.updated_at!==lastStamp||data.status!==lastStatus){lastActive=now();lastStamp=data.updated_at;lastStatus=data.status;}
  if(now()-start>=maxMs)throw new Error('AIの処理時間が長くなっています。依頼を分けて再送信してください。');
  onProgress(data.status==='queued'?'Macでの処理開始を待っています':data.result?.progress||'ChatGPTが回答を準備しています');
  if(now()-lastActive>AI_IDLE_MS+15000)throw new Error(data.status==='queued'?'Macで処理が始まりません。Macが起動しているか確認して再送信してください。':'Macからの通信が途切れました。Macの接続を確認して再送信してください。');
  await delay(pollMs,signal);
 }
 }catch(error){
  // CAS prevents a completed response or another terminal state being overwritten.
  await relayQuery(client.from('ai_requests').update({status:'failed',error:signal?.aborted?'中断しました。':error.message,updated_at:new Date().toISOString()}).eq('id',id).eq('owner',owner).in('status',['queued','running'])).catch(()=>{});
  throw error;
 }
}
// Bound the whole operation, including work before fetch and response decoding.
// Some transports do not reject promptly after an AbortSignal fires.
export function withAbort(work,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const cancel=()=>reject(signal.reason);signal.addEventListener('abort',cancel,{once:true});
  Promise.resolve().then(()=>{signal.throwIfAborted();return work();}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));
 });
}

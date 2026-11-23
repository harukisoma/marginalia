export function syncIssue(error){
 const code=String(error?.code||''),text=String(error?.message||error||'');
 if(code==='PT409'||code==='40001')return {retryable:true,message:'ほかの端末の変更を取り込んでいます。記録を保存したまま自動で再試行します。'};
 if(/^PGRST00[0-3]$/.test(code)||/503|504|schema cache/i.test(text))return {retryable:true,message:'同期サーバーが一時的に応答できません。この端末の記録は保存されています。自動で再接続します。'};
 if(/timeout|timed out|abort|fetch|network|load failed/i.test(text))return {retryable:true,message:'同期の通信が途切れました。この端末の記録を保存したまま、自動で再試行します。'};
 if(code==='PGRST301'||code==='PGRST303'||/jwt.*expired|invalid.*jwt/i.test(text))return {retryable:false,message:'同期のログインを確認できません。端末の記録を保持しています。再ログインしてください。'};
 return {retryable:false,message:text||'同期できませんでした。端末の記録は保存されています。'};
}
export const syncRetryDelay=failures=>Math.min(120000,5000*2**Math.min(Math.max(0,failures-1),5));
/** @template T @param {(signal:AbortSignal)=>PromiseLike<T>|T} work @param {AbortSignal} signal @param {number} [timeout] @returns {Promise<T>} */
export function boundedSync(work,signal,timeout=30000){
 const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]);
 let cancel;
 const timer=setTimeout(()=>controller.abort(new DOMException('Sync request timed out','TimeoutError')),timeout);
 /** @type {Promise<never>} */
 const aborted=new Promise((_resolve,reject)=>{cancel=()=>reject(combined.reason);combined.addEventListener('abort',cancel,{once:true});});
 return Promise.race([aborted,Promise.resolve().then(()=>{combined.throwIfAborted();return work(combined);})]).finally(()=>{clearTimeout(timer);combined.removeEventListener('abort',cancel);});
}

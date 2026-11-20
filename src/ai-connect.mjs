import {readChatStream,AI_MAX_MS} from './ai-request.mjs';
export function connectionSetup(bridge,origin){
 let url;try{url=new URL(bridge);}catch{throw new Error('Macの接続先を確認してください。');}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw new Error('このMacでの自動接続には http://127.0.0.1:4318 を使用してください。');
 const state=crypto.randomUUID();
 const target=new URL('/auth/setup',url);target.search=new URLSearchParams({origin,state}).toString();
 return {url:target.href,origin:url.origin,state,created:Date.now()};
}

export function connectionReply(event,pending,now=Date.now()){
 if(!pending||now-pending.created>600000||event.source!==pending.popup||event.origin!==pending.origin)return null;
 const data=event.data;
 return data?.type==='marginalia-companion-ready'&&data.state===pending.state&&typeof data.pairing==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(data.pairing)?data.pairing:null;
}

export async function requestCompanion(bridge,pairing,path,body,request=fetch,options={}){
 let parsed;try{parsed=new URL(bridge);}catch{throw new Error('Macの接続先URLを確認してください。');}
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||(!['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.protocol!=='https:'))throw new Error('Macの接続先URLを確認してください。');
 if(!pairing)throw new Error('このMacとの初回接続が必要です。「MacでChatGPTに接続」を押してください。');
 let response;
 try{response=await request(new URL('/api/'+path,parsed),{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+pairing,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(path==='chat'?AI_MAX_MS+30000:path==='models'?35000:path==='cloud-connect'?75000:10000),...(options.signal?[options.signal]:[])])});}
 catch(error){if(options.signal?.aborted)throw options.signal.reason;if(error.name==='TimeoutError')throw new Error('Macからの応答が途切れました。接続を確認して再送信してください。');throw new Error('Macに接続できません。Macが起動していることを確認してください。このMacの場合は「接続アプリを起動」を押してください。ブラウザのローカルネットワーク接続も許可してください。');}
 if(response.status===401)throw new Error('このMacとの接続を更新する必要があります。「MacでChatGPTに接続」を押してください。');
 if(response.ok&&response.headers.get('content-type')?.includes('application/x-ndjson'))return readChatStream(response,options.onProgress);
 let data;try{data=await response.json();}catch{throw new Error('Macから正しい応答を確認できません。接続アプリを起動し直してください。');}
 if(!response.ok)throw new Error(data.error||'MacのAI接続でエラーが発生しました。もう一度接続を確認してください。');
 return data;
}

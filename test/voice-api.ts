// An authenticated service diagnostic. Deliberately imports no notebook modules.
import {createClient} from '@supabase/supabase-js';
import {defaultCloud} from '../src/cloud-default';
import {startLiveVoice,type VoiceAuthorize,type LiveVoice} from '../src/voice-live';
import sampleURL from './fixtures/voice-mixed.wav?url';
const client=createClient(defaultCloud.url,defaultCloud.key);
const button=document.querySelector<HTMLButtonElement>('#run')!;
const status=document.querySelector<HTMLElement>('#status')!,output=document.querySelector<HTMLElement>('#output')!;
const authorize:VoiceAuthorize=async(action,signal)=>{
 const {data:{session}}=await client.auth.getSession();
 if(!session)throw new Error('Marginaliaの雲ボタンからログインしてください。');
 const response=await fetch(defaultCloud.url+'/functions/v1/voice-session',{
  method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:defaultCloud.key,'Content-Type':'application/json'},
  body:JSON.stringify({action}),signal,
 });
 const data=await response.json();if(!response.ok)throw new Error(data.error||'接続に失敗しました。');return data;
};
button.onclick=async()=>{
 button.disabled=true;output.textContent='';status.textContent='接続しています…';
 const controller=new AbortController(),context=new AudioContext();
 await context.resume();
 let active:LiveVoice|undefined,source:AudioBufferSourceNode|undefined;
 const cancel=()=>{controller.abort();active?.cancel();try{source?.stop();}catch{}void context.close().catch(()=>{});};
 window.addEventListener('pagehide',cancel,{once:true});
 try{
  const buffer=await context.decodeAudioData(await (await fetch(sampleURL)).arrayBuffer());
  const destination=context.createMediaStreamDestination();
  source=context.createBufferSource();source.buffer=buffer;source.connect(destination);
  let rejectFailure:(error:Error)=>void=()=>{};
  const failure=new Promise<never>((_,reject)=>{rejectFailure=reject;});void failure.catch(()=>{});
  active=await startLiveVoice({authorize,signal:controller.signal,capture:async()=>destination.stream,
   onText:text=>{output.textContent=text;},onFailure:(text,error)=>{output.textContent=text;rejectFailure(new Error(error));},
  });
  status.textContent='合成音声を送信しています…';
  await Promise.race([new Promise<void>(resolve=>{source!.onended=()=>resolve();source!.start();}),failure]);
  status.textContent='最後の文章を確定しています…';
  const result=await active.stop();output.textContent=result.text;
  if(result.incomplete)throw new Error('最後までの確定を確認できませんでした。');
  status.textContent='完了：GPT-Live-Transcribeで文字起こしできました。';
 }catch(error){status.textContent='エラー：'+(error as Error).message;}
 finally{cancel();window.removeEventListener('pagehide',cancel);button.disabled=false;}
};

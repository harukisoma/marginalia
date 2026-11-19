import {VoiceTranscript} from './voice-transcript.mjs';

export type VoiceAuthorize=(action:'status'|'create',signal:AbortSignal)=>Promise<{value?:string;ready?:boolean}>;
export type LiveVoice={stop:()=>Promise<{text:string;incomplete:boolean}>;cancel:()=>void};

type Options={authorize:VoiceAuthorize;signal:AbortSignal;onText:(text:string)=>void;onFailure:(text:string,message:string)=>void;capture?:()=>Promise<MediaStream>};

export async function startLiveVoice({authorize,signal,onText,onFailure,capture}:Options):Promise<LiveVoice>{
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){
  throw new Error('音声入力に対応したSafari・Chromeの最新版で開いてください。');
 }
 const transcript=new VoiceTranscript();
 let stream:MediaStream|undefined,peer:RTCPeerConnection|undefined,channel:RTCDataChannel|undefined;
 let interval:ReturnType<typeof setInterval>|undefined,timeout:ReturnType<typeof setTimeout>|undefined,commitDelay:ReturnType<typeof setTimeout>|undefined;
 let stopping=false,closed=false,started=false,finalAcknowledged=false;
 const commits:boolean[]=[];
 let resolveReady:()=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};
 let resolveStop:(result:{text:string;incomplete:boolean})=>void=()=>{};
 let stopped:Promise<{text:string;incomplete:boolean}>|undefined;
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 void ready.catch(()=>{});
 function check(){
  signal.throwIfAborted();
  if(closed)throw new Error('音声入力との接続が終了しました。');
  if(typeof document!=='undefined'&&document.visibilityState==='hidden')throw new Error('画面が非表示になったため音声入力を終了しました。画面を開いて、もう一度開始してください。');
 }
 function cleanup(){
  closed=true;
  clearInterval(interval);clearTimeout(timeout);clearTimeout(commitDelay);
  stream?.getTracks().forEach(track=>track.stop());
  channel?.close();peer?.close();
  signal.removeEventListener('abort',cancel);
 }
 function cancel(){cleanup();rejectReady(new Error('音声入力を終了しました。'));resolveStop({text:transcript.text(),incomplete:true});}
 function fail(message:string){
  if(closed)return;
  cleanup();
  if(started)onFailure(transcript.text(),message);
  else rejectReady(new Error(message));
  resolveStop({text:transcript.text(),incomplete:true});
 }
 function finishIfReady(){
  if(!stopping||!finalAcknowledged||!transcript.complete())return;
  const text=transcript.text();cleanup();resolveStop({text,incomplete:false});
 }
 function commit(final:boolean){
  if(closed||channel?.readyState!=='open')return;
  commits.push(final);
  channel.send(JSON.stringify({type:'input_audio_buffer.commit'}));
 }
 signal.addEventListener('abort',cancel,{once:true});
 try{
  check();
  await authorize('status',signal);
  check();
  stream=await (capture?capture():navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}}));
  check();
  // Capture is muted until the transcription session has actually connected.
  stream.getAudioTracks().forEach(track=>{track.enabled=false;});
  timeout=setTimeout(()=>fail('音声入力への接続がタイムアウトしました。通信状態を確認してください。'),40000);
  const credential=await authorize('create',signal);
  check();
  if(!credential.value)throw new Error('音声入力の一時認証を取得できませんでした。');
  peer=new RTCPeerConnection();
  for(const track of stream.getTracks())peer.addTrack(track,stream);
  channel=peer.createDataChannel('oai-events');
  channel.onmessage=({data})=>{
   if(closed)return;
   let event;try{event=JSON.parse(data);}catch{return;}
   if(event.type==='session.created'||event.type==='transcription_session.created'){
    const session=event.session;
    const model=session?.audio?.input?.transcription?.model||session?.input_audio_transcription?.model;
    if(model!=='gpt-live-transcribe'){
     fail('指定した音声モデルへの接続を確認できませんでした。API設定を確認してください。');return;
    }
    resolveReady();
   }else if(event.type==='error'){
    if(event.error?.code==='input_audio_buffer_commit_empty'&&commits.length){
     if(commits.shift())finalAcknowledged=true;
     finishIfReady();return;
    }
    fail(event.error?.code==='insufficient_quota'?'OpenAI APIの残高・支払い設定を確認してください。':
     '文字起こしを続けられませんでした。取得済みの文章を確認・コピーできます。');
   }else if(event.type==='conversation.item.input_audio_transcription.failed'){
    fail('一部の音声を文字起こしできませんでした。取得済みの文章を確認・コピーできます。');
   }else{
    transcript.receive(event);
    if(event.type==='input_audio_buffer.committed'&&commits.shift())finalAcknowledged=true;
    onText(transcript.text());
    finishIfReady();
   }
  };
  channel.onclose=()=>{if(!closed)fail('音声入力との接続が切れました。取得済みの文章を確認・コピーできます。');};
  channel.onerror=()=>fail('音声入力の通信に失敗しました。取得済みの文章を確認・コピーできます。');
  peer.onconnectionstatechange=()=>{if(peer?.connectionState==='failed')fail('音声入力へ接続できませんでした。通信状態を確認してください。');};
  stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>fail('マイクとの接続が切れました。取得済みの文章を確認・コピーできます。'),{once:true}));
  const offer=await peer.createOffer();
  check();
  await peer.setLocalDescription(offer);
  check();
  const response=await fetch('https://api.openai.com/v1/realtime/calls',{
   method:'POST',headers:{Authorization:'Bearer '+credential.value,'Content-Type':'application/sdp'},
   body:offer.sdp,signal:AbortSignal.any([signal,AbortSignal.timeout(25000)]),
  });
  if(!response.ok)throw new Error(response.status===429?'OpenAI APIの利用上限・残高を確認してください。':
   'OpenAIの音声入力へ接続できませんでした。API設定と通信状態を確認してください。');
  check();
  await peer.setRemoteDescription({type:'answer',sdp:await response.text()});
  await ready;
  check();
  clearTimeout(timeout);
  started=true;
  stream.getAudioTracks().forEach(track=>{track.enabled=true;});
  // Bound the audio buffer and reconcile each final turn independently.
  interval=setInterval(()=>{if(!stopping&&!commits.length)commit(false);},30000);
  return {
   cancel,
   stop(){
    if(stopped)return stopped;
    if(closed)return Promise.resolve({text:transcript.text(),incomplete:true});
    stopped=new Promise(resolve=>{resolveStop=resolve;});
    stopping=true;clearInterval(interval);
    stream?.getTracks().forEach(track=>{track.enabled=false;});
    // Let the final RTP packets reach the server before the data-channel commit.
    commitDelay=setTimeout(()=>{stream?.getTracks().forEach(track=>track.stop());commit(true);},500);
    timeout=setTimeout(()=>{
     const text=transcript.text();cleanup();resolveStop({text,incomplete:true});
    },20000);
    return stopped;
   },
  };
 }catch(error){cleanup();throw error;}
}

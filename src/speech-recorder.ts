import {MAX_RECORDING_SECONDS,SPEECH_SAMPLE_RATE} from './speech.mjs';

export type VoiceRecording={
 stop:()=>Promise<Float32Array>;
 cancel:()=>void;
};

export async function startVoiceRecording(onEnded:()=>void):Promise<VoiceRecording>{
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
  throw new Error('このブラウザは録音に対応していません。SafariまたはChromeの最新版で開いてください。');
 }
 // iOS requires resume() during the button's user gesture, before the async
 // microphone permission prompt consumes that activation.
 const context=new AudioContext();
 const resumed=context.resume();
 void resumed.catch(()=>{});
 let stream:MediaStream|undefined;
 try{
  stream=await navigator.mediaDevices.getUserMedia({
   audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},
  });
  await resumed;
  const capture=stream;
  const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
  const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
  const chunks:BlobPart[]=[];
  let cancelled=false,stopping=false;
  const audioContext=context;
  const closed=new Promise<Blob>((resolve,reject)=>{
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onerror=()=>reject(new Error('録音を続けられませんでした。もう一度お試しください。'));
   recorder.onstop=()=>{
    capture.getTracks().forEach(track=>track.stop());
    if(!stopping)onEnded();
    resolve(new Blob(chunks,{type:recorder.mimeType}));
   };
  });
  // Handle errors even if the browser ends a recording before Stop is pressed.
  void closed.catch(()=>{capture.getTracks().forEach(track=>track.stop());onEnded();});
  recorder.start(1000);
  capture.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{
   if(recorder.state!=='inactive')recorder.stop();
  },{once:true}));
  return {
   cancel(){
    cancelled=true;
    stopping=true;
    if(recorder.state!=='inactive')recorder.stop();
    capture.getTracks().forEach(track=>track.stop());
    if(audioContext.state!=='closed')void audioContext.close().catch(()=>{});
   },
   async stop(){
    stopping=true;
    try{
     if(recorder.state!=='inactive')recorder.stop();
     const blob=await closed;
     if(cancelled)return new Float32Array();
     const decoded=await audioContext.decodeAudioData(await blob.arrayBuffer());
     if(decoded.duration>MAX_RECORDING_SECONDS+2)throw new Error('録音が長すぎます。5分以内に区切って録音してください。');
     const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*SPEECH_SAMPLE_RATE),SPEECH_SAMPLE_RATE);
     const source=offline.createBufferSource();
     source.buffer=decoded;
     source.connect(offline.destination);
     source.start();
     const resampled=await offline.startRendering();
     return resampled.getChannelData(0).slice();
    }finally{
     capture.getTracks().forEach(track=>track.stop());
     if(audioContext.state!=='closed')void audioContext.close().catch(()=>{});
    }
   },
  };
 }catch(error){
  stream?.getTracks().forEach(track=>track.stop());
  if(context.state!=='closed')void context.close().catch(()=>{});
  throw error;
 }
}

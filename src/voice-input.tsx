import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Check,X} from 'lucide-react';

type VoicePayload={kind:'transcribe';audio:string};
type Props={
 transcribe:(payload:VoicePayload)=>Promise<{text:string}>;
 onText:(text:string)=>void;
 disabled?:boolean;
 compact?:boolean;
 label?:string;
};
const MAX_DURATION_MS=70000;
const SAMPLE_RATE=16000;

// iOS MediaRecorder typically returns MP4/AAC, while Whisper receives 16kHz mono PCM WAV.
// Convert in the browser so no ffmpeg or audio upload endpoint is needed on the Mac.
async function toWavBase64(blob:Blob){
 const context=new AudioContext();
 try{
  const decoded=await context.decodeAudioData(await blob.arrayBuffer());
  if(decoded.duration<0.15||decoded.duration>75)throw new Error('音声は75秒以内で録音してください。');
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*SAMPLE_RATE),SAMPLE_RATE);
  const source=offline.createBufferSource();
  source.buffer=decoded;source.connect(offline.destination);source.start();
  const samples=(await offline.startRendering()).getChannelData(0);
  const data=new ArrayBuffer(44+samples.length*2),view=new DataView(data);
  const tag=(position:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(position+i,value.charCodeAt(i));};
  tag(0,'RIFF');view.setUint32(4,36+samples.length*2,true);tag(8,'WAVE');
  tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,1,true);view.setUint32(24,SAMPLE_RATE,true);
  view.setUint32(28,SAMPLE_RATE*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  tag(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){
   const sample=Math.max(-1,Math.min(1,samples[i]));
   view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);
  }
  const dataBytes=new Uint8Array(data);
  const parts:string[]=[];
  for(let i=0;i<dataBytes.length;i+=8192)parts.push(String.fromCharCode(...dataBytes.subarray(i,i+8192)));
  return btoa(parts.join(''));
 }finally{await context.close();}
}

export function VoiceInput({transcribe,onText,disabled=false,compact=false,label='音声入力'}:Props){
 const [stage,setStage]=useState<'idle'|'recording'|'processing'|'review'>('idle');
 const [draft,setDraft]=useState(''),[error,setError]=useState('');
 const recorderRef=useRef<MediaRecorder|null>(null),streamRef=useRef<MediaStream|null>(null),timerRef=useRef<number|null>(null);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{
  mounted.current=false;
  if(timerRef.current!==null)clearTimeout(timerRef.current);
  if(recorderRef.current?.state==='recording')recorderRef.current.stop();
  streamRef.current?.getTracks().forEach(track=>track.stop());
 };},[]);
 const stop=()=>{
  if(timerRef.current!==null){clearTimeout(timerRef.current);timerRef.current=null;}
  if(recorderRef.current?.state==='recording')recorderRef.current.stop();
 };
 async function start(){
  setError('');
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('このブラウザではマイク録音が利用できません。');
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}
   streamRef.current=stream;
   const recorder=new MediaRecorder(stream),chunks:Blob[]=[];
   recorderRef.current=recorder;
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onstop=async()=>{
    stream.getTracks().forEach(t=>t.stop());streamRef.current=null;
    if(!mounted.current)return;
    setStage('processing');
    try{
     if(!chunks.length)throw new Error('録音データが空でした。');
     const audio=await toWavBase64(new Blob(chunks,{type:recorder.mimeType||chunks[0].type}));
     const result=await transcribe({kind:'transcribe',audio});
     if(!result?.text?.trim())throw new Error('音声を認識できませんでした。もう一度試してください。');
     if(mounted.current){setDraft(result.text.trim());setStage('review');}
    }catch(cause){if(mounted.current){setError(cause instanceof Error?cause.message:'文字起こしに失敗しました。');setStage('idle');}}
   };
   recorder.start();
   setStage('recording');
   timerRef.current=window.setTimeout(stop,MAX_DURATION_MS);
  }catch(cause){streamRef.current?.getTracks().forEach(t=>t.stop());if(mounted.current){setError(cause instanceof Error?cause.message:'マイクを利用できません。');setStage('idle');}}
 }
 return <div className={'voice-widget'+(compact?' voice-compact':'')}>
  <button type="button" className={stage==='recording'?'voice-active':''}
   disabled={disabled||stage==='processing'||stage==='review'}
   aria-label={stage==='recording'?'録音を終了':label}
   onClick={()=>stage==='recording'?stop():void start()}>
   {stage==='recording'?<Square size={14}/>:<Mic size={14}/>}
   {!compact&&(stage==='recording'?'録音終了':stage==='processing'?'文字起こし中':label)}
  </button>
  {stage==='recording'&&<small role="status">録音中（最大70秒）</small>}
  {stage==='processing'&&<small role="status">Whisperで文字起こし中…</small>}
  {error&&<small className="voice-error" role="alert">{error}</small>}
  {stage==='review'&&<div className="voice-review">
   <label>認識結果を確認・修正<textarea aria-label="認識結果" value={draft} onChange={e=>setDraft(e.target.value)} rows={5}/></label>
   <div>
    <button type="button" onClick={()=>{setDraft('');setStage('idle');}}><X size={13}/>破棄</button>
    <button type="button" className="primary" disabled={!draft.trim()} onClick={()=>{onText(draft.trim());setDraft('');setStage('idle');}}><Check size={13}/>入力欄に追加</button>
   </div>
  </div>}
 </div>;
}

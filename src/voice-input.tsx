import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Download,Check,RotateCcw,LoaderCircle,Copy} from 'lucide-react';
import type {Editor} from '@tiptap/core';
import {Dialog} from './dialog';
import {checkpoint} from './recovery';
import {pages} from './data';
import {startVoiceRecording,type VoiceRecording} from './speech-recorder';
import {MAX_RECORDING_SECONDS,transcriptContent} from './speech.mjs';

type Phase='idle'|'loading'|'ready'|'permission'|'recording'|'decoding'|'transcribing'|'review'|'inserting'|'error';
type DownloadProgress={loaded:number;total:number};

export function VoiceInput({editor,pageId}:{editor:Editor|null;pageId:string}){
 const [open,setOpen]=useState(false);
 return <>
  <div className="voice-entry"><button className="voice-trigger" disabled={!editor} onMouseDown={event=>event.preventDefault()} onClick={()=>setOpen(true)}><Mic size={18}/><span>音声入力</span></button></div>
  {open&&editor&&<VoiceDialog editor={editor} pageId={pageId} onClose={()=>setOpen(false)}/>}
 </>;
}

function VoiceDialog({editor,pageId,onClose}:{editor:Editor;pageId:string;onClose:()=>void}){
 const [phase,setPhase]=useState<Phase>('idle');
 const [progress,setProgress]=useState({loaded:0,total:0});
 const [elapsed,setElapsed]=useState(0);
 const [text,setText]=useState('');
 const [error,setError]=useState('');
 const [segment,setSegment]=useState({completed:0,total:1});
 const [confirmClose,setConfirmClose]=useState(false);
 const [copied,setCopied]=useState(false);
 const worker=useRef<Worker|null>(null);
 const files=useRef(new Map<string,DownloadProgress>());
 const recorder=useRef<VoiceRecording|null>(null);
 const alive=useRef(true),recordingStarted=useRef(0);
 const stopRef=useRef<()=>void>(()=>{});
 const modelReady=useRef(false);
 const pendingAudio=useRef<Float32Array|null>(null);
 const target=useRef(editor.state.selection.$to.pos);
 const inserting=useRef(false);

 function requestClose(){
  if(inserting.current)return;
  if(text.trim()||pendingAudio.current||['permission','recording','decoding','transcribing'].includes(phase)){setConfirmClose(true);return;}
  onClose();
 }

 function fail(message:string){
  setError(message);
  setPhase('error');
 }

 useEffect(()=>{
  alive.current=true;
  // Keep the insertion point attached to the same text while remote edits arrive.
  const track=({transaction}:{transaction:Editor['state']['tr']})=>{
   target.current=transaction.mapping.map(target.current,1);
  };
  editor.on('transaction',track);
  return()=>{
   alive.current=false;
   recorder.current?.cancel();
   recorder.current=null;
   worker.current?.terminate();
   worker.current=null;
   pendingAudio.current=null;
   editor.off('transaction',track);
  };
 },[editor]);

 useEffect(()=>{
  if(phase!=='recording')return;
  const update=()=>{
   const seconds=Math.floor((Date.now()-recordingStarted.current)/1000);
   setElapsed(seconds);
   if(seconds>=MAX_RECORDING_SECONDS)stopRef.current();
  };
  const background=()=>{if(document.visibilityState==='hidden')stopRef.current();};
  const timer=setInterval(update,250);
  document.addEventListener('visibilitychange',background);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',background);};
 },[phase]);

 function transcribe(active:Worker){
  if(!pendingAudio.current)return;
  // Keep the recording in memory until success so a worker failure is retryable.
  const audio=pendingAudio.current.slice();
  setText('');
  setSegment({completed:0,total:1});
  setPhase('transcribing');
  active.postMessage({type:'transcribe',audio},[audio.buffer]);
 }

 function prepare(){
  setError('');
  setText('');
  setCopied(false);
  setPhase('loading');
  modelReady.current=false;
  files.current.clear();
  setProgress({loaded:0,total:0});
  worker.current?.terminate();
  const active=new Worker(new URL('./speech.worker.mjs',import.meta.url),{type:'module'});
  worker.current=active;
  active.onerror=()=>{
   if(!alive.current||worker.current!==active)return;
   active.terminate();
   modelReady.current=false;
   fail('音声モデルを起動できませんでした。もう一度準備するか、Safari・Chromeの最新版でお試しください。');
  };
  active.onmessage=({data})=>{
   if(!alive.current||worker.current!==active)return;
   if(data.type==='download'){
    const before=files.current.get(data.file);
    files.current.set(data.file,{
     loaded:data.status==='done'?(before?.total||before?.loaded||0):Math.max(before?.loaded||0,data.loaded),
     total:Math.max(before?.total||0,data.total),
    });
    const entries=[...files.current.values()];
    setProgress({loaded:entries.reduce((sum,file)=>sum+file.loaded,0),total:entries.reduce((sum,file)=>sum+file.total,0)});
   }else if(data.type==='ready'){
    modelReady.current=true;
    if(pendingAudio.current)transcribe(active);
    else setPhase('ready');
   }else if(data.type==='transcribing'||data.type==='partial'){
    setSegment({completed:data.completed,total:data.total});
    setText(data.text);
    setPhase('transcribing');
   }else if(data.type==='result'){
    pendingAudio.current=null;
    setText(data.text.trim());
    setPhase('review');
    if(!data.text.trim())setError('声を聞き取れませんでした。マイクに近づいて、もう一度録音してください。');
   }else if(data.type==='error'){
    modelReady.current=false;
    active.terminate();
    fail(pendingAudio.current?'文字起こしを完了できませんでした。録音はこの画面に保持しています。ほかのアプリを閉じてから再試行してください。':
     '音声モデルを準備できませんでした。ネットワークと端末の空きメモリを確認して、もう一度お試しください。');
   }
  };
  active.postMessage({type:'prepare'});
 }

 async function start(){
  if(recorder.current)return;
  setError('');
  setCopied(false);
  setElapsed(0);
  setPhase('permission');
  try{
   const recording=await startVoiceRecording(()=>stopRef.current());
   if(!alive.current){recording.cancel();return;}
   recorder.current=recording;
   recordingStarted.current=Date.now();
   setPhase('recording');
  }catch(cause){
   if(!alive.current)return;
   const issue=cause as Error;
   setError(issue.name==='NotAllowedError'?'マイクの使用を許可してください。Safari・Chromeのサイト設定から変更できます。':
    issue.name==='NotFoundError'?'マイクが見つかりません。接続を確認してください。':
    issue.message||'録音を開始できませんでした。');
   setPhase('ready');
  }
 }

 async function stop(){
  const active=recorder.current;
  if(!active)return;
  recorder.current=null;
  setPhase('decoding');
  try{
   const audio=await active.stop();
   if(!alive.current)return;
   if(!audio.length){setError('音声を録音できませんでした。もう一度お試しください。');setPhase('ready');return;}
   pendingAudio.current=audio;
   if(!worker.current)throw new Error('音声モデルを確認できません。画面を閉じずに再試行してください。');
   transcribe(worker.current);
  }catch(cause){
   if(alive.current){setError((cause as Error).message);setPhase(pendingAudio.current?'error':'ready');}
  }
 }
 stopRef.current=()=>void stop();

 async function insert(){
  if(inserting.current||!text.trim())return;
  inserting.current=true;
  setPhase('inserting');
  setError('');
  try{
   await checkpoint('音声入力を挿入する前');
   const page=pages.get(pageId);
   if(!alive.current||editor.isDestroyed||!page||page.deleted)throw new Error('挿入先のリーフを確認できません。文字起こしをコピーしてください。');
   const position=Math.min(Math.max(0,target.current),editor.state.doc.content.size);
   const content=transcriptContent(text.trim());
   // Insert after the recorded caret. Selected existing text is always preserved.
   const inserted=editor.chain().focus().insertContentAt(position,content).run();
   if(!inserted)throw new Error('挿入できませんでした。文字起こしをコピーして、本文に貼り付けてください。');
   onClose();
  }catch(cause){
   if(alive.current){setError((cause as Error).message);setPhase('review');}
  }finally{inserting.current=false;}
 }

 const busy=['loading','permission','decoding','transcribing','inserting'].includes(phase);
 const processing=phase==='decoding'||phase==='transcribing';
 const minutes=Math.floor(elapsed/60).toString().padStart(2,'0');
 const seconds=(elapsed%60).toString().padStart(2,'0');
 const canRecord=modelReady.current&&['ready','review'].includes(phase)&&!text.trim();

 return <Dialog title="音声入力" className="voice-dialog" onClose={requestClose}>
  {confirmClose?<div className="voice-exit">
   <p>この音声入力を終了しますか？ 録音中の音声と挿入前の文字起こしは、この画面を閉じると破棄されます。</p>
   <div className="settings-actions"><button className="primary" onClick={()=>setConfirmClose(false)}>音声入力に戻る</button><button onClick={onClose}>終了する</button></div>
  </div>:<>
   <p className="voice-description">日本語・英語を自動判定。Whisper-smallがこの端末で文字起こしします。</p>
   {(phase==='idle'||phase==='loading'||phase==='error')&&<div className="voice-prepare">
    <span className="voice-icon"><Download size={24}/></span>
    <strong>{phase==='loading'?'音声モデルを準備しています':'音声モデルの準備'}</strong>
    <p>初回は約300MBをダウンロードします。次回以降はブラウザ内のキャッシュを使います。</p>
    {phase==='loading'?<>
     <progress aria-label="音声モデルの準備" max={progress.total||undefined} value={progress.total?Math.min(progress.loaded,progress.total):undefined}/>
     <small role="status">{progress.loaded?Math.round(progress.loaded/1000000)+' MB 読み込み済み':'準備しています…'}</small>
    </>:<button className="primary" onClick={prepare}><Download size={17}/>{pendingAudio.current?'文字起こしを再試行':phase==='error'?'もう一度準備する':'音声入力を準備する'}</button>}
   </div>}
   {canRecord&&<div className="voice-ready">
    <button className="voice-record" onClick={()=>void start()}><Mic size={23}/>録音を開始</button>
    <small>1回5分まで。画面を離れると録音を終了します。</small>
   </div>}
   {phase==='recording'&&<div className="voice-recording">
    <span className="voice-recording-dot"/><strong role="status">録音中</strong><time>{minutes}:{seconds}</time>
    <button className="voice-stop" onClick={()=>void stop()}><Square size={16} fill="currentColor"/>停止して文字起こし</button>
   </div>}
   {busy&&phase!=='loading'&&<p className="voice-status" role="status"><LoaderCircle size={17}/>{phase==='permission'?'マイクを確認しています…':phase==='decoding'?'録音した音声を準備しています…':phase==='transcribing'?'文字起こし中 · '+(segment.completed+1)+' / '+segment.total: '本文に挿入しています…'}</p>}
   {processing&&<p className="voice-processing-hint">端末によっては、録音時間より長くかかります。この画面を開いたままお待ちください。</p>}
   {(processing||phase==='review'||phase==='inserting')&&<>
    <label className="voice-result">文字起こし<textarea aria-label="音声入力の文字起こし" value={text} readOnly={phase!=='review'} onChange={event=>{setText(event.target.value);setCopied(false);}} placeholder={processing?'聞き取った文章がここに表示されます…':'文字起こしがありません。'} spellCheck={false}/></label>
    {phase==='review'&&<div className="voice-actions">
     <button className="primary" disabled={!text.trim()} onClick={()=>void insert()}><Check size={17}/>本文に挿入</button>
     <button disabled={!text.trim()} onClick={()=>void navigator.clipboard.writeText(text).then(()=>setCopied(true)).catch(()=>setError('コピーできませんでした。文章を選択してコピーしてください。'))}><Copy size={16}/>{copied?'コピー済み':'コピー'}</button>
     <button onClick={()=>{setText('');setError('');setPhase(modelReady.current?'ready':'idle');}}><RotateCcw size={16}/>録り直す</button>
    </div>}
   </>}
   {error&&<p className="voice-error" role="alert">{error}</p>}
   <p className="voice-privacy">録音と文字起こしは端末内で処理します。本文への挿入後は、通常のリーフとして保存・同期されます。</p>
  </>}
 </Dialog>;
}

import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Check,RotateCcw,LoaderCircle,Copy} from 'lucide-react';
import type {Editor} from '@tiptap/core';
import {Dialog} from './dialog';
import {checkpoint} from './recovery';
import {pages} from './data';
import {startLiveVoice,type LiveVoice,type VoiceAuthorize} from './voice-live';
import {MAX_RECORDING_SECONDS,transcriptContent} from './voice-transcript.mjs';

type Phase='idle'|'connecting'|'recording'|'finishing'|'review'|'inserting';
const unavailable:VoiceAuthorize=async()=>{throw new Error('先に上部の雲ボタンからクラウド同期へログインしてください。');};

export function VoiceInput({editor,pageId,authorize=unavailable}:{editor:Editor|null;pageId:string;authorize?:VoiceAuthorize}){
 const [open,setOpen]=useState(false);
 return <>
  <div className="voice-entry"><button className="voice-trigger" disabled={!editor} onMouseDown={event=>event.preventDefault()} onClick={()=>setOpen(true)}><Mic size={18}/><span>音声入力</span></button></div>
  {open&&editor&&<VoiceDialog editor={editor} pageId={pageId} authorize={authorize} onClose={()=>setOpen(false)}/>}
 </>;
}

function VoiceDialog({editor,pageId,authorize,onClose}:{editor:Editor;pageId:string;authorize:VoiceAuthorize;onClose:()=>void}){
 const [phase,setPhase]=useState<Phase>('idle'),[elapsed,setElapsed]=useState(0);
 const [text,setText]=useState(''),[error,setError]=useState(''),[confirmClose,setConfirmClose]=useState(false),[copied,setCopied]=useState(false);
 const [checking,setChecking]=useState(false),[connectionMessage,setConnectionMessage]=useState('');
 const session=useRef<LiveVoice|null>(null),request=useRef<AbortController|null>(null);
 const alive=useRef(true),started=useRef(0),stopRef=useRef<()=>void>(()=>{}),inserting=useRef(false);
 const target=useRef(editor.state.selection.$to.pos);
 function requestClose(){
  if(inserting.current)return;
  if(text.trim()||['connecting','recording','finishing'].includes(phase)){setConfirmClose(true);return;}
  onClose();
 }
 useEffect(()=>{
  alive.current=true;
  const track=({transaction}:{transaction:Editor['state']['tr']})=>{target.current=transaction.mapping.map(target.current,1);};
  editor.on('transaction',track);
  return()=>{alive.current=false;request.current?.abort();session.current?.cancel();editor.off('transaction',track);};
 },[editor]);
 useEffect(()=>{
  if(phase!=='recording')return;
  const update=()=>{const seconds=Math.floor((Date.now()-started.current)/1000);setElapsed(seconds);if(seconds>=MAX_RECORDING_SECONDS)stopRef.current();};
  const background=()=>{if(document.visibilityState==='hidden')stopRef.current();};
  const timer=setInterval(update,250);
  document.addEventListener('visibilitychange',background);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',background);};
 },[phase]);
 async function checkConnection(){
  if(checking)return;
  const controller=new AbortController();request.current=controller;
  setChecking(true);setError('');setConnectionMessage('');
  try{
   const result=await authorize('create',controller.signal);
   if(!result.value)throw new Error('一時認証を確認できませんでした。');
   if(alive.current)setConnectionMessage('APIへの接続を確認できました。音声入力を開始できます。');
  }catch(cause){if(alive.current)setError((cause as Error).message);}
  finally{if(alive.current)setChecking(false);}
 }
 async function start(){
  if(session.current||phase==='connecting'||checking)return;
  setError('');setConnectionMessage('');setText('');setCopied(false);setElapsed(0);setPhase('connecting');
  const controller=new AbortController();request.current=controller;
  try{
   const active=await startLiveVoice({authorize,signal:controller.signal,
    onText:value=>{if(alive.current)setText(value);},
    onFailure:(value,message)=>{if(alive.current){session.current=null;setText(value);setError(message);setPhase('review');}},
   });
   if(!alive.current){active.cancel();return;}
   session.current=active;started.current=Date.now();setPhase('recording');
  }catch(cause){
   if(!alive.current)return;
   const issue=cause as Error;
   setError(issue.name==='NotAllowedError'?'マイクの使用を許可してください。Safari・Chromeのサイト設定から変更できます。':
    issue.name==='NotFoundError'?'マイクが見つかりません。接続を確認してください。':issue.message||'音声入力を開始できませんでした。');
   setPhase('idle');
  }
 }
 async function stop(){
  const active=session.current;if(!active)return;
  session.current=null;setPhase('finishing');
  const result=await active.stop();
  if(!alive.current)return;
  setText(result.text);setPhase('review');
  if(result.incomplete)setError('最後までの確定を確認できませんでした。取得済みの文章を確認してから挿入してください。');
  else if(!result.text.trim())setError('声を聞き取れませんでした。マイクに近づいて、もう一度お試しください。');
 }
 stopRef.current=()=>void stop();
 async function insert(){
  if(inserting.current||!text.trim())return;
  inserting.current=true;setPhase('inserting');setError('');
  try{
   await checkpoint('音声入力を挿入する前');
   const page=pages.get(pageId);
   if(!alive.current||editor.isDestroyed||!page||page.deleted)throw new Error('挿入先のリーフを確認できません。文字起こしをコピーしてください。');
   const position=Math.min(Math.max(0,target.current),editor.state.doc.content.size);
   if(!editor.chain().focus().insertContentAt(position,transcriptContent(text.trim())).run())throw new Error('挿入できませんでした。文章をコピーして本文に貼り付けてください。');
   onClose();
  }catch(cause){if(alive.current){setError((cause as Error).message);setPhase('review');}}
  finally{inserting.current=false;}
 }
 const recording=phase==='recording',busy=['connecting','finishing','inserting'].includes(phase);
 const time=Math.floor(elapsed/60).toString().padStart(2,'0')+':'+(elapsed%60).toString().padStart(2,'0');
 return <Dialog title="音声入力" className="voice-dialog" onClose={requestClose}>
  {confirmClose?<div className="voice-exit"><p>音声入力を終了しますか？ 挿入前の文字起こしは、この画面を閉じると破棄されます。</p><div className="settings-actions"><button className="primary" onClick={()=>setConfirmClose(false)}>音声入力に戻る</button><button onClick={onClose}>終了する</button></div></div>:<>
   <p className="voice-description">GPT-Live-Transcribeで日本語・英語を自動認識。話した内容がここに表示されます。</p>
   {phase==='idle'&&<div className="voice-ready"><button className="voice-record" disabled={checking} onClick={()=>void start()}><Mic size={23}/>音声入力を開始</button><small>1回5分まで。画面を離れると録音を終了します。</small><button disabled={checking} onClick={()=>void checkConnection()}>{checking?'API設定を確認しています…':'APIへの接続を確認'}</button></div>}
   {recording&&<div className="voice-recording"><span className="voice-recording-dot"/><strong role="status">音声入力中</strong><time>{time}</time><button className="voice-stop" onClick={()=>void stop()}><Square size={16} fill="currentColor"/>停止して確認</button></div>}
   {busy&&<p className="voice-status" role="status"><LoaderCircle size={17}/>{phase==='connecting'?'マイクと音声入力に接続しています…':phase==='finishing'?'最後の文章を確定しています…':'本文に挿入しています…'}</p>}
   {(recording||phase==='finishing'||phase==='review'||phase==='inserting')&&<>
    <label className="voice-result">{recording?'文字起こし（認識中）':'文字起こし'}<textarea aria-label="音声入力の文字起こし" value={text} readOnly={phase!=='review'} onChange={event=>{setText(event.target.value);setCopied(false);}} placeholder="話した内容がここに表示されます…" spellCheck={false}/></label>
    {phase==='review'&&<div className="voice-actions">
     <button className="primary" disabled={!text.trim()} onClick={()=>void insert()}><Check size={17}/>本文に挿入</button>
     <button disabled={!text.trim()} onClick={()=>void navigator.clipboard.writeText(text).then(()=>setCopied(true)).catch(()=>setError('文章を選択してコピーしてください。'))}><Copy size={16}/>{copied?'コピー済み':'コピー'}</button>
     <button onClick={()=>{setText('');setError('');setPhase('idle');}}><RotateCcw size={16}/>録り直す</button>
    </div>}
   </>}
   {error&&<p className="voice-error" role="alert">{error}</p>}
   {connectionMessage&&<p className="voice-connection-message" role="status">{connectionMessage}</p>}
   <p className="voice-privacy">音声はOpenAIへ送信して文字起こしします。API従量課金（目安 $0.017／分）。本文は「本文に挿入」を押すまで変更しません。</p>
  </>}
 </Dialog>;
}

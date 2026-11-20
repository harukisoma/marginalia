import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ImagePlus,Upload,Link,LoaderCircle,Check} from 'lucide-react';
import type {Editor} from '@tiptap/core';
import * as Y from 'yjs';
import {Dialog} from './dialog';
import {checkpoint} from './recovery';
import {doc,pages} from './data';
import {prepareImage,imageURL,imageFitsNotebook} from './images.mjs';

export type ImageRequest=(file?:File,position?:number)=>void;
export function ImageControl({editor,pageId,bind}:{editor:Editor|null;pageId:string;bind:(request:ImageRequest)=>void}){
 const[open,setOpen]=useState(false),[initialFile,setInitialFile]=useState<File|undefined>();
 const target=useRef({position:0,valid:true}),scroll=useRef({top:0,left:0});
 const request:ImageRequest=(file,position)=>{
  if(!editor||editor.isDestroyed)return;
  target.current={position:position??editor.state.selection.to,valid:true};
  const main=editor.view.dom.closest('main');scroll.current={top:main?.scrollTop||0,left:main?.scrollLeft||0};
  setInitialFile(file);setOpen(true);
 };
 useEffect(()=>{bind(request);return()=>bind(()=>{});},[editor]);
 useEffect(()=>{
  if(!open||!editor)return;
  const track=({transaction}:{transaction:Editor['state']['tr']})=>{const mapped=transaction.mapping.mapResult(target.current.position,1);target.current={position:mapped.pos,valid:target.current.valid&&!mapped.deletedAcross};};
  editor.on('transaction',track);return()=>{editor.off('transaction',track);};
 },[editor,open]);
 function close(inserted=false){
  setOpen(false);setInitialFile(undefined);
  requestAnimationFrame(()=>{if(!editor||editor.isDestroyed||!editor.view.dom.isConnected)return;editor.view.focus();const main=editor.view.dom.closest('main');if(main){main.scrollTop=scroll.current.top;main.scrollLeft=scroll.current.left;}if(inserted)editor.commands.scrollIntoView();});
 }
 return <><button className="insert-image" aria-label="画像を挿入" title="画像を挿入" onPointerDown={event=>event.preventDefault()} onClick={()=>request()}><ImagePlus size={17}/></button>{open&&editor&&<ImageDialog editor={editor} pageId={pageId} initialFile={initialFile} target={target} onClose={close}/>}</>;
}
function ImageDialog({editor,pageId,initialFile,target,onClose}:{editor:Editor;pageId:string;initialFile?:File;target:{current:{position:number;valid:boolean}};onClose:(inserted?:boolean)=>void}){
 const[keyboardInset,setKeyboardInset]=useState(0);
 useEffect(()=>{const update=()=>setKeyboardInset(Math.max(0,innerHeight-(window.visualViewport?.offsetTop||0)-(window.visualViewport?.height||innerHeight)));update();window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);return()=>{window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};},[]);
 const[mode,setMode]=useState<'file'|'url'>('file'),[source,setSource]=useState(''),[url,setURL]=useState(''),[alt,setAlt]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[inserting,setInserting]=useState(false),[name,setName]=useState('');
 const file=useRef<HTMLInputElement>(null),alive=useRef(true),sequence=useRef(0),saving=useRef(false);
 useEffect(()=>{alive.current=true;if(initialFile)void read(initialFile);return()=>{alive.current=false;sequence.current++;};},[]);
 async function read(image:File){
  const id=++sequence.current;setBusy(true);setError('');setSource('');
  try{const result=await prepareImage(image);if(alive.current&&id===sequence.current){setSource(String(result));setName(image.name);}}
  catch(cause){if(alive.current&&id===sequence.current)setError((cause as Error).message);}
  finally{if(alive.current&&id===sequence.current)setBusy(false);}
 }
 async function insert(){
  if(saving.current||busy)return;
  const src=mode==='file'?source:imageURL(url);
  if(!src){setError(mode==='url'?'https:// で始まる画像のURLを入力してください。':'画像を選択してください。');return;}
  saving.current=true;setInserting(true);setError('');
  try{
   if(mode==='file'&&!imageFitsNotebook(Y.encodeStateAsUpdate(doc).byteLength,src.length))throw new Error('同期できるサイズを超えるため画像を追加できません。画像のURLから挿入してください。');
   await checkpoint('画像を挿入する前');
   const page=pages.get(pageId);
   if(!alive.current||editor.isDestroyed||!page||page.deleted||!target.current.valid)throw new Error('挿入先が変更されました。画面を閉じて、本文の挿入位置を選び直してください。');
   if(!editor.commands.insertContentAt(target.current.position,{type:'image',attrs:{src,alt:alt.trim(),title:null}}))throw new Error('画像を挿入できませんでした。');
   onClose(true);
  }catch(cause){if(alive.current)setError((cause as Error).message);}
  finally{saving.current=false;if(alive.current)setInserting(false);}
 }
 return <div style={{'--image-keyboard-inset':keyboardInset+'px'} as CSSProperties}><Dialog title="画像を挿入" className="image-dialog" onClose={()=>{if(!saving.current)onClose();}}>
  <p className="image-insert-hint">本文で選択した位置の後ろに追加します。既存の文章は残ります。</p>
  <div className="image-source-tabs" role="group" aria-label="画像の挿入方法"><button aria-pressed={mode==='file'} onClick={()=>{setMode('file');setError('');}}><Upload size={16}/>写真・ファイル</button><button aria-pressed={mode==='url'} onClick={()=>{setMode('url');setError('');}}><Link size={16}/>画像のURL</button></div>
  {mode==='file'?<><input ref={file} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" aria-label="挿入する画像ファイル" onChange={event=>{const image=event.target.files?.[0];if(image)void read(image);event.target.value='';}}/><button className={'image-drop-zone '+(busy?'busy':'')} disabled={busy||inserting} onClick={()=>file.current?.click()} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const image=event.dataTransfer.files[0];if(image)void read(image);}}>{busy?<LoaderCircle className="spin" size={26}/>:source?<img src={source} alt="挿入する画像のプレビュー"/>:<ImagePlus size={32}/>}<strong>{busy?'画像を準備しています…':source?'別の画像を選ぶ':'写真・画像を選択'}</strong><span>{name||'ここに画像をドラッグすることもできます'}</span></button><small className="image-file-note">JPEG・PNG・WebP・GIF。画像は表示に適したサイズで本文に保存し、他の端末にも同期します。</small></>:<label className="image-url-field">画像のURL<input type="url" inputMode="url" autoCapitalize="none" placeholder="https://example.com/image.png" value={url} onChange={event=>setURL(event.target.value)}/></label>}
  <label className="image-alt-field">画像の説明（任意）<input aria-label="画像の説明" placeholder="画像に写っているものや、図の内容" value={alt} maxLength={300} onChange={event=>setAlt(event.target.value)}/></label>
  {error&&<p className="image-error" role="alert">{error}</p>}
  <div className="image-actions"><button className="secondary-button" disabled={inserting} onClick={()=>onClose()}>キャンセル</button><button className="primary" disabled={busy||inserting||(mode==='file'?!source:!url.trim())} onClick={()=>void insert()}>{inserting?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}この位置に挿入</button></div>
 </Dialog></div>;
}

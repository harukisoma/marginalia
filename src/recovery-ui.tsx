import {useEffect,useRef,useState} from 'react';
import type * as Y from 'yjs';
import {Download,Undo2,ChevronLeft} from 'lucide-react';
import {Dialog} from './dialog';
import {listRecovery,readRecovery,decodeRecovery,recoveryPages,downloadRecovery,restoreLeafCopy,type RecoveryInfo} from './recovery';
import {getPageHTML} from './editor';
import type {Page} from './data';

export function RecoveryDialog({journalOnly,allowRestore,onClose,onRestore,onNotice}:{
 journalOnly:boolean;
 allowRestore:boolean;
 onClose:()=>void;
 onRestore:(id:string)=>void;
 onNotice:(message:string)=>void;
}){
 const [items,setItems]=useState<RecoveryInfo[]>([]);
 const [selected,setSelected]=useState<RecoveryInfo|null>(null);
 const [leaves,setLeaves]=useState<Page[]>([]);
 const [leaf,setLeaf]=useState<Page|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const copy=useRef<Y.Doc|null>(null),mounted=useRef(true);

 useEffect(()=>{
  mounted.current=true;
  void listRecovery().then(items=>{if(mounted.current)setItems(items);})
   .catch(e=>{if(mounted.current)setError(e.message);});
  return()=>{mounted.current=false;copy.current?.destroy();};
 },[]);

 async function select(item:RecoveryInfo){
  setBusy(true);
  setError('');
  try{
   const snapshot=await readRecovery(item.id);
   if(!mounted.current)return;
   copy.current?.destroy();
   copy.current=decodeRecovery(snapshot);
   setLeaves(recoveryPages(copy.current).filter(page=>!journalOnly||page.kind==='journal'));
   setSelected(item);
   setLeaf(null);
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function restore(){
  if(!allowRestore||!leaf||!copy.current)return;
  setBusy(true);
  setError('');
  try{
   const restored=await restoreLeafCopy(leaf,copy.current);
   onRestore(restored.id);
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 const preview=leaf&&copy.current?getPageHTML(leaf.id,false,copy.current):'';
 return <Dialog title={journalOnly?'バックアップから日記を探す':'自動バックアップと復元'} className="recovery-modal" onClose={onClose}>
  <p className="recovery-intro">この端末に定期保存した直近30件と、更新や削除の前などに保護したバックアップを確認できます。復元すると別のリーフを作成します。</p>
  {error&&<p className="recovery-error" role="alert">{error}</p>}
  {busy&&<p role="status">バックアップを処理しています…</p>}
  {selected?<>
   <div className="recovery-navigation">
    <button disabled={busy} onClick={()=>{setSelected(null);setLeaf(null);}}><ChevronLeft size={15}/>バックアップ一覧</button>
    <span>{new Date(selected.created).toLocaleString('ja-JP')} · {selected.reason}</span>
   </div>
   {leaves.length?<div className="recovery-browser">
    <div className="recovery-leaves">{leaves.map(page=><button key={page.id} disabled={busy} className={leaf?.id===page.id?'active':''} onClick={()=>setLeaf(page)}>{page.title}{page.deleted?'（ゴミ箱）':''}</button>)}</div>
    <div className="recovery-preview">{leaf?<>
     <div className="recovery-preview-heading"><h3>{leaf.title}</h3><button className="primary" disabled={!allowRestore||busy} onClick={()=>void restore()}><Undo2 size={14}/>別リーフとして復元</button></div>
     <div className="prose" dangerouslySetInnerHTML={{__html:preview}}/>
    </>:<p>{journalOnly?'確認したい日記を選んでください。':'復元したいリーフを選んでください。'}</p>}</div>
   </div>:<p>{journalOnly?'このバックアップに日記はありません。':'このバックアップにリーフはありません。'}</p>}
  </>:<div className="recovery-list">
   {items.map(item=><div key={item.id}>
    <button className="recovery-open" disabled={busy} onClick={()=>void select(item)}>
     <strong>{new Date(item.created).toLocaleString('ja-JP')}</strong>
     <small>{item.reason} · {item.count}リーフ{item.protected?' · 長期保護':''}</small>
    </button>
    <button aria-label={new Date(item.created).toLocaleString('ja-JP')+'のバックアップを保存'} title="ファイルとして保存" onClick={()=>void downloadRecovery(item.id).catch(e=>onNotice(e.message))}><Download size={16}/></button>
   </div>)}
   {!items.length&&!error&&<p>この端末にはバックアップがありません。</p>}
  </div>}
 </Dialog>;
}

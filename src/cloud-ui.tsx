import {useState} from 'react';
import {Cloud,CloudOff,RefreshCw} from 'lucide-react';
import {Dialog} from './dialog';
import type {SyncConfig,SyncStatus} from './sync';

export function SyncDialog({config,onConfig,account,status,error,lastSync,busy,online,sentTo,onSend,onVerify,onVerifyCode,onRefresh,onSignOut,onClose}:{
 config:SyncConfig;
 onConfig:(config:SyncConfig)=>void;
 account:string;
 status:SyncStatus;
 error:string;
 lastSync:number|null;
 busy:boolean;
 online:boolean;
 sentTo:string;
 onSend:(email:string)=>void;
 onVerify:(link:string)=>Promise<boolean>;
 onVerifyCode:(email:string,code:string)=>Promise<boolean>;
 onRefresh:()=>void;
 onSignOut:()=>void;
 onClose:()=>void;
}){
 const [email,setEmail]=useState(sentTo);
 const [link,setLink]=useState('');
 const [code,setCode]=useState('');
 const canConnect=online&&!busy&&Boolean(config.url&&config.key);
 const Icon=status==='offline'||status==='error'?CloudOff:Cloud;
 return <Dialog title="クラウド同期" className="sync-dialog" onClose={onClose}>
  <div className="sync-summary" role="status">
   <Icon size={21}/>
   <div><strong>{syncLabels[status]}</strong>
    {account&&<small>{account}</small>}
    {lastSync&&<small>最終同期 {new Date(lastSync).toLocaleString('ja-JP',{dateStyle:'short',timeStyle:'short'})}</small>}
   </div>
  </div>
  {error&&<p role="alert" className="sync-error">{error}</p>}
  {account?<div className="settings-actions">
   <button className="primary" disabled={!canConnect} onClick={onRefresh}><RefreshCw size={16}/>今すぐ同期</button>
   <button disabled={busy} onClick={onSignOut}>ログアウト</button>
  </div>:<>
   <p>MacとiPhoneで同じメールアドレスを使うと、各端末で日記やリーフの続きを書けます。</p>
   <form onSubmit={e=>{e.preventDefault();if(canConnect&&email.trim())onSend(email.trim());}}>
    <label>同期するメールアドレス<input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
    <div className="settings-actions"><button className="primary" disabled={!canConnect||!email.trim()}>{sentTo?'認証メールを再送':'認証メールを送る'}</button></div>
   </form>
   {sentTo&&<p className="sync-email-sent" role="status"><strong>{sentTo} に送信しました。</strong> メールに認証コードがある場合は以下に入力してください。リンクのみの場合は従来の方法も利用できます。</p>}
   <form onSubmit={e=>{e.preventDefault();if(canConnect&&email.trim()&&/^[0-9]{6,8}$/.test(code.trim()))void onVerifyCode(email.trim(),code.trim()).then(valid=>{if(valid)setCode('');});}}>
    <label>メールの認証コード<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="6桁のコード"/></label>
    <div className="settings-actions"><button className="primary" disabled={!canConnect||!/^[0-9]{6,8}$/.test(code.trim())||!email.trim()}>コードでログインして同期</button></div>
   </form>
   <details className="sync-link">
    <summary>メールのリンクをここで使う</summary>
    <p>ホーム画面から使っている場合は、メール内のログインリンクを長押しでコピーし、ここにペーストしてください。</p>
    <form onSubmit={e=>{e.preventDefault();if(canConnect&&link.trim())void onVerify(link.trim()).then(valid=>{if(valid)setLink('');});}}>
     <label>ログインリンク<input type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…"/></label>
     <div className="settings-actions"><button className="primary" disabled={!canConnect||!link.trim()}>ログインして同期</button></div>
    </form>
   </details>
   <details>
    <summary>接続先の詳細</summary>
    <label>Supabase Project URL<input type="url" value={config.url} autoCapitalize="none" spellCheck={false} onChange={e=>onConfig({...config,url:e.target.value})}/></label>
    <label>Publishable key<input value={config.key} autoCapitalize="none" spellCheck={false} onChange={e=>onConfig({...config,key:e.target.value})}/></label>
   </details>
  </>}
 </Dialog>;
}

export const syncLabels={
 local:'端末に保存',
 offline:'オフライン · 端末に保存',
 syncing:'同期中',
 synced:'同期済み',
 error:'同期できませんでした',
};

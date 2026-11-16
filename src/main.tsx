import React,{useEffect,useRef,useState,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import type {Editor} from '@tiptap/core';
import {registerSW} from 'virtual:pwa-register';
import {BookOpen,FileText,NotebookPen,CalendarDays,Search,Plus,Settings,Library,Sparkles,ArrowUpRight,ArrowUp,Cloud,Check,WifiOff,Menu,X,Download,Upload,Trash2,Sun,Moon,ChevronRight,ChevronDown,Code2,Undo2,ExternalLink,PanelRightClose,LayoutGrid,List,Leaf,ArrowLeft,ArrowRight} from 'lucide-react';
import {doc,pages,persistence,allPages,createPage,updatePage,labels,backup,download,safeURL,type Page} from './data';
import {RichEditor,cleanHTML,getPageMarkdown,htmlToMarkdown,mathSVG,applyPagePatch,displayMarkdown,type InlineReview} from './editor';
import {CloudSync,type SyncConfig,type SyncStatus} from './sync';
import {applyExactPatch} from './patch.mjs';
import {defaultCloud} from './cloud-default';
import {Dialog} from './dialog';
import {SyncDialog,syncLabels} from './cloud-ui';
import {emailLinkCredentials} from './cloud-auth.mjs';
import {collections,NewLeafMenu,LeafMenu} from './workspace-ui';
import {WorkspaceHistory,readRoute,hasAuthCallback} from './navigation.mjs';
import {AIWorking} from './ai-ui';
import {checkpoint,startAutoRecovery,importBackupForRecovery} from './recovery';
import {RecoveryDialog} from './recovery-ui';
import './style.css';
import 'highlight.js/styles/github-dark.css';
type Proposal={pageId:string;before:string;after:string;reason:string;status?:'accepted'|'rejected'};
type Chat={id:string;pageId:string;role:'user'|'assistant';content:string;time:number;references?:string[];edits?:Proposal[]};
const chats=doc.getMap<Chat>('chats');
const icons={note:FileText,paper:NotebookPen,book:BookOpen,journal:CalendarDays};
type NavRoute={view:string;pageId:string|null;query:string};
const initialRoute=readRoute(location.hash);
const statuses={unread:'未読',reading:'読書中',done:'読了'};
const authCallback=hasAuthCallback(location);
const authParams=new URLSearchParams(location.hash.slice(1));
const authLinkFailed=authCallback&&(authParams.has('error')||new URLSearchParams(location.search).has('error'));
function App(){
 const[ready,setReady]=useState(false),[version,setVersion]=useState(0),[view,setView]=useState(initialRoute.view),[selected,setSelected]=useState<string|null>(initialRoute.pageId||localStorage.getItem('marginalia-selected')),[query,setQuery]=useState(initialRoute.query),[layout,setLayout]=useState(localStorage.getItem('marginalia-layout')==='gallery'?'gallery':'pages'),[aiOpen,setAiOpen]=useState(window.innerWidth>820),[sidebarOpen,setSidebarOpen]=useState(false),[settings,setSettings]=useState(false),[theme,setTheme]=useState(localStorage.getItem('marginalia-theme')||'light'),[notice,setNotice]=useState(''),[online,setOnline]=useState(navigator.onLine),[syncStatus,setSyncStatus]=useState<SyncStatus>('local'),[syncError,setSyncError]=useState(''),[tabs,setTabs]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('marginalia-tabs')||'[]');return Array.isArray(saved)?[...new Set(saved.filter((id):id is string=>typeof id==='string'))]:[];}catch{return [];}}),[sourceMode,setSourceMode]=useState(false),[source,setSource]=useState(''),[sourceBase,setSourceBase]=useState(''),[sourceDirty,setSourceDirty]=useState(false);
 const mainSurface=useRef<HTMLElement>(null),menuTrigger=useRef<HTMLButtonElement>(null),menuClose=useRef<HTMLButtonElement>(null);
 const navigation=useRef<WorkspaceHistory|null>(null),cloudInitialization=useRef<Promise<void>|null>(null);
 const[historyControls,setHistoryControls]=useState({back:false,forward:false,ready:false});
 const applyRouteRef=useRef<(route:NavRoute,controls:typeof historyControls)=>void>(()=>{});
 const[recoveryOpen,setRecoveryOpen]=useState(false),[focusedReview,setFocusedReview]=useState<string|null>(null),[editorEpoch,setEditorEpoch]=useState(0);
 const activeEditorPage=useRef<string|null>(null),reviewBusy=useRef(false),operationRef=useRef({selected,sourceDirty,source,sourceBase});operationRef.current={selected,sourceDirty,source,sourceBase};
 const[undoDelete,setUndoDelete]=useState<string|null>(null);
 const editor=useRef<Editor|null>(null),cloud=useRef<CloudSync|null>(null),file=useRef<HTMLInputElement>(null),backupInput=useRef<HTMLInputElement>(null);
 const[updateAvailable,setUpdateAvailable]=useState(false);const swUpdate=useRef<((reloadPage?:boolean)=>Promise<void>)|null>(null);
 const [config,setConfig]=useState<SyncConfig>(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem('marginalia-cloud')||'null');
   if(typeof saved?.url==='string'&&typeof saved?.key==='string')return saved;
  }catch{}
  return defaultCloud;
 });
 const [cloudSignedIn,setCloudSignedIn]=useState(false),[cloudBusy,setCloudBusy]=useState(false);
 const [cloudEmail,setCloudEmail]=useState(''),[syncOpen,setSyncOpen]=useState(false),[sentTo,setSentTo]=useState('');
 const [lastSync,setLastSync]=useState<number|null>(null),[authError,setAuthError]=useState('');
 const cloudAction=useRef(false);
 const[aiStartedAt,setAiStartedAt]=useState(0);
 const[aiRoute,setAiRoute]=useState<'local'|'relay'|null>(null),[relayEnabled,setRelayEnabled]=useState(false);
 const[bridge,setBridge]=useState(localStorage.getItem('marginalia-bridge')||'http://127.0.0.1:4318'),[pairing,setPairing]=useState(document.querySelector<HTMLMetaElement>('meta[name="companion-token"]')?.content||localStorage.getItem('marginalia-pairing')||''),[aiStatus,setAiStatus]=useState<{connected:boolean;email?:string;planEnabled?:boolean}>({connected:false}),[models,setModels]=useState<{id:string;name:string}[]>([]),[model,setModel]=useState(''),[prompt,setPrompt]=useState(''),[aiBusy,setAiBusy]=useState(false),[scope,setScope]=useState('current');
 function notify(text:string){setNotice(text);setUndoDelete(null);}
 useEffect(()=>{if(ready)return startAutoRecovery(notify);},[ready]);
 useEffect(()=>{if(!focusedReview||view!=='editor'||sourceMode)return;const frame=requestAnimationFrame(()=>{const target=document.querySelector<HTMLElement>('[data-review-key="'+CSS.escape(focusedReview)+'"]');if(target){target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target.classList.add('review-focused');setFocusedReview(null);}});return()=>cancelAnimationFrame(frame);},[focusedReview,selected,view,sourceMode,editorEpoch,version]);
 async function updateApp(){if(sourceDirty)return notify('原文の変更を先に反映してください。');try{await checkpoint('アプリ更新前');await swUpdate.current?.(true);}catch(error){notify((error as Error).message);}}
 useEffect(()=>{mainSurface.current?.scrollTo({top:0});},[view,view==='editor'?selected:null]);
 useEffect(()=>{
  if(!sidebarOpen||!matchMedia('(max-width: 820px)').matches)return;
  if(!(document.activeElement instanceof HTMLInputElement&&document.activeElement.closest('.sidebar')))menuClose.current?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSidebarOpen(false);menuTrigger.current?.focus();}};
  window.addEventListener('keydown',escape);
  return()=>window.removeEventListener('keydown',escape);
 },[sidebarOpen]);
 useEffect(()=>{localStorage.setItem('marginalia-tabs',JSON.stringify(tabs));},[tabs]);
 useEffect(()=>{localStorage.setItem('marginalia-layout',layout);},[layout]);
 useEffect(()=>{if(!ready)return;setTabs(old=>{const valid=old.filter(id=>pages.get(id)&&!pages.get(id)?.deleted);return valid.length===old.length?old:valid;});if(selected&&(!pages.get(selected)||pages.get(selected)?.deleted)){setSelected(null);localStorage.removeItem('marginalia-selected');setSourceDirty(false);setSourceMode(false);if(view==='editor')navigation.current?.navigate({view:'library',pageId:null,query:''},true);}},[ready,version,selected,view]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('marginalia-theme',theme);},[theme]);
 useEffect(()=>{const update=()=>setVersion(n=>n+1);doc.on('update',update);void persistence.whenSynced.then(()=>setReady(true));const network=()=>setOnline(navigator.onLine);window.addEventListener('online',network);window.addEventListener('offline',network);const opening=(e:Event)=>openPageRef.current((e as CustomEvent).detail);window.addEventListener('open-page',opening);swUpdate.current=registerSW({onNeedRefresh:()=>{setUpdateAvailable(true);notify('更新があります。上部の「更新」で適用できます。');},onOfflineReady:()=>notify('オフラインでもリーフを編集できます。')});return()=>{doc.off('update',update);window.removeEventListener('online',network);window.removeEventListener('offline',network);window.removeEventListener('open-page',opening);cloud.current?.stop();};},[]);
 useEffect(()=>{if(config.url&&config.key&&ready)cloudInitialization.current=connectCloud().then(()=>{});},[ready]);
 useEffect(()=>{if(!ready)return;let stopped=false;const start=()=>{if(stopped)return;const history=new WorkspaceHistory(window,(route:NavRoute,controls:typeof historyControls)=>applyRouteRef.current(route,controls));navigation.current=history;history.start();};const requested=readRoute(location.hash);if((authCallback||(requested.pageId&&!pages.get(requested.pageId)))&&cloudInitialization.current){
  void cloudInitialization.current.finally(()=>{
   start();
   if(!stopped&&authCallback){
    if(authLinkFailed||!cloud.current?.email)setAuthError('ログインリンクを確認できませんでした。新しいリンクを送るか、メール内のリンクをコピーしてください。');
    setSyncOpen(true);
   }
  });
 }else start();return()=>{stopped=true;navigation.current?.stop();navigation.current=null;};},[ready]);
 useEffect(()=>{if(!pairing&&location.hostname==='127.0.0.1'&&location.port==='4318')void fetch('/bootstrap').then(r=>r.ok?r.json():null).then(data=>{if(data?.token)setPairing(data.token);}).catch(()=>{});},[]);
 useEffect(()=>{void checkAI();const timer=setInterval(()=>void checkAI(),30000);return()=>clearInterval(timer);},[pairing,bridge,cloudSignedIn]);
 useEffect(()=>{const hotkey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSidebarOpen(true);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('input[aria-label="リーフを検索"]')?.focus());}};window.addEventListener('keydown',hotkey);return()=>window.removeEventListener('keydown',hotkey);},[]);
 const list=allPages(),page=selected?pages.get(selected):undefined;
 const treeItems=list;const treeRows:{p:Page;depth:number}[]=[];const treeSeen=new Set<string>();
 function walkTree(p:Page,depth:number){if(treeSeen.has(p.id))return;treeSeen.add(p.id);treeRows.push({p,depth});for(const child of treeItems.filter(c=>c.parent===p.id))walkTree(child,depth+1);}
 for(const root of treeItems.filter(p=>!p.parent||!treeItems.some(parent=>parent.id===p.parent)))walkTree(root,0);for(const orphan of treeItems)if(!treeSeen.has(orphan.id))walkTree(orphan,0);
 function applyRoute(route:NavRoute,controls:typeof historyControls){
  const target=route.pageId?pages.get(route.pageId):undefined;
  if(route.view==='editor'&&(!target||target.deleted)){navigation.current?.navigate({view:'library',pageId:null,query:''},true);notify('移動先のリーフが見つからないため、ライブラリを表示しました。');return;}
  const leavingDocument=route.view!=='editor'||route.pageId!==selected;
  if(leavingDocument){if(sourceDirty&&selected){localStorage.setItem('marginalia-draft:'+selected,JSON.stringify({source,base:sourceBase}));notify('Markdown原文の下書きを保存しました。元のリーフで「Markdown原文」を開くと編集を続けられます。');}setSourceDirty(false);setSourceMode(false);editor.current=null;}
  setView(route.view);setQuery(route.query);setSettings(false);setSyncOpen(false);setHistoryControls(controls);
  if(!document.activeElement?.matches('input[aria-label="リーフを検索"]'))setSidebarOpen(false);
  if(matchMedia('(max-width: 820px)').matches&&leavingDocument)setAiOpen(false);
  if(target){setSelected(target.id);localStorage.setItem('marginalia-selected',target.id);setTabs(old=>old.includes(target.id)?old:[...old,target.id]);}
 }
 applyRouteRef.current=applyRoute;
 function openPage(id:string){if(sourceDirty){notify('Markdown原文の変更を反映するか、キャンセルしてからリーフを移動してください。');return;}const target=pages.get(id);if(!target||target.deleted)return;navigation.current?.navigate({view:'editor',pageId:id,query:''});setSidebarOpen(false);}
 const openPageRef=useRef(openPage);openPageRef.current=openPage;
 function newPage(kind:Page['kind']='note',parent=''){if(!navigation.current)return;if(sourceDirty){notify('原文の変更を先に反映してください。');return;}const p=createPage(kind,parent);openPage(p.id);}
 function openCollection(next:string){if(sourceDirty){notify('Markdown原文の変更を先に反映するか、キャンセルしてください。');return;}navigation.current?.navigate({view:next,pageId:null,query:''});setSidebarOpen(false);}
 function closeTab(id:string){if(id===selected&&sourceDirty){notify('Markdown原文の変更を先に反映するか、キャンセルしてからタブを閉じてください。');return;}const index=tabs.indexOf(id),remaining=tabs.filter(tab=>tab!==id&&pages.get(tab)&&!pages.get(tab)?.deleted);setTabs(remaining);if(id===selected){const next=remaining[Math.min(Math.max(index,0),remaining.length-1)];setSourceMode(false);editor.current=null;if(next){setSelected(next);localStorage.setItem('marginalia-selected',next);if(view==='editor')navigation.current?.navigate({view:'editor',pageId:next,query:''},true);}else{setSelected(null);localStorage.removeItem('marginalia-selected');if(view==='editor')navigation.current?.navigate({view:'library',pageId:null,query:''},true);}}}
 const closeTabRef=useRef(closeTab);closeTabRef.current=closeTab;
 async function deleteLeaf(id:string){if(id===selected&&sourceDirty){notify('Markdown原文の変更を先に反映するか、キャンセルしてください。');return;}const target=pages.get(id);if(!target||target.deleted)return;try{await checkpoint('リーフをゴミ箱へ移す前');if(operationRef.current.selected===id&&operationRef.current.sourceDirty)return notify('原文の変更を先に反映してください。');closeTabRef.current(id);updatePage(id,{deleted:true});notify('「'+target.title+'」をゴミ箱へ移しました。');setUndoDelete(id);}catch(error){notify((error as Error).message);}}

 function restoreLeaf(id:string){updatePage(id,{deleted:false});notify('リーフを復元しました。');}
 function leafActions(p:Page,withOpen=false){return view==='trash'?[{label:'復元する',icon:<Undo2 size={15}/>,run:()=>restoreLeaf(p.id)}]:[...(withOpen?[{label:'開く',icon:<ArrowUpRight size={15}/>,run:()=>openPage(p.id)}]:[]),{label:'子リーフを作成',icon:<Plus size={15}/>,run:()=>newPage('note',p.id)},{label:'Markdownで保存',icon:<Download size={15}/>,run:()=>download(p.title+'.md',currentMarkdown(p.id))},{label:'ゴミ箱へ移す',icon:<Trash2 size={15}/>,run:()=>deleteLeaf(p.id),danger:true,separator:true}];}
 function currentMarkdown(id:string){return id===selected&&editor.current?htmlToMarkdown(editor.current.getHTML()):getPageMarkdown(id);}
 async function bridgeRequest(path:string,body?:unknown){const parsed=new URL(bridge);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('AI補助サーバーのURLを確認してください。');if(!['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.protocol!=='https:')throw new Error('外部のAI補助サーバーにはHTTPSが必要です。');const response=await fetch(bridge.replace(/\/$/,'')+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+pairing,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path==='chat'?130000:10000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'AIサーバーに接続できませんでした。');return data;}
 async function checkAI(){
  const client=cloud.current?.client;if(client){try{const {data:{session}}=await client.auth.getSession();if(session){const {data,error}=await client.from('ai_hosts').select('models,updated_at').eq('owner',session.user.id).eq('connected',true).gte('updated_at',new Date(Date.now()-90000).toISOString()).order('updated_at',{ascending:false}).limit(1);if(!error&&data?.length){const catalog=data[0].models||[];const status={connected:true,planEnabled:true};setAiStatus(status);setModels(catalog);setModel(old=>catalog.some((m:{id:string})=>m.id===old)?old:catalog[0]?.id||'');setAiRoute('relay');return status;}}}catch{}}
  if(pairing){try{const status=await bridgeRequest('status');if(status.connected&&status.planEnabled){const data=await bridgeRequest('models');setAiStatus(status);setModels(data.models);setModel(old=>data.models.some((m:{id:string})=>m.id===old)?old:data.models[0]?.id||'');setAiRoute('local');return status;}}catch{}}
  setAiStatus({connected:false});setAiRoute(null);return null;
 }
 async function relayChat(payload:unknown){const client=cloud.current?.client;if(!client)throw new Error('クラウド同期へログインしてください。');const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('クラウド同期へログインしてください。');const id=crypto.randomUUID();const {error}=await client.from('ai_requests').insert({id,owner:session.user.id,payload});if(error)throw new Error(error.message);const end=Date.now()+150000;while(Date.now()<end){await new Promise(resolve=>setTimeout(resolve,1200));const {data,error}=await client.from('ai_requests').select('status,result,error').eq('id',id).eq('owner',session.user.id).single();if(error)throw new Error(error.message);if(data.status==='completed')return data.result;if(data.status==='failed')throw new Error(data.error||'AI応答に失敗しました。');}throw new Error('Macからの応答を確認できませんでした。MacとAI補助サーバーが動いているか確認してください。');}
 async function enableRelay(){try{const {data:{session}}=await cloud.current!.client.auth.getSession();if(!session)throw new Error('先にクラウド同期へログインしてください。');const destination=new URL(bridge);if(!['http:','https:'].includes(destination.protocol)||destination.username||destination.password||!['127.0.0.1','localhost'].includes(destination.hostname))throw new Error('Macの補助サーバーURLを指定してください。');destination.pathname='/connect-cloud';destination.search='';destination.hash='';const form=document.createElement('form');form.method='POST';form.action=destination.href;form.target='_blank';for(const [name,value]of Object.entries({...config,pairing,access_token:session.access_token,refresh_token:session.refresh_token})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}document.body.append(form);form.submit();form.remove();setRelayEnabled(true);notify('開いたMacの設定画面が成功したら、公開アプリの「接続を確認」を押してください。');}catch(error){notify((error as Error).message);}}
 async function signInAI(){const popup=window.open('about:blank','marginalia-chatgpt');try{localStorage.setItem('marginalia-bridge',bridge);localStorage.setItem('marginalia-pairing',pairing);const data=await bridgeRequest('sign-in',{});if(popup)popup.location.href=data.url;else window.location.href=data.url;notify('ChatGPTの画面で認証した後、「接続を確認」を押してください。');}catch(error){popup?.close();notify(error instanceof Error?error.message:'AIサーバーを起動して、接続コードを設定してください。');}}
 async function resumeCloud(sync:CloudSync,refresh=false){
  try{
   const signedIn=await sync.start();
   if(sync.closed)return;
   setCloudSignedIn(signedIn);
   if(signedIn){
    setSentTo('');
    if(refresh)await sync.flush();
   }
  }finally{
   if(!sync.closed)setCloudEmail(sync.email);
  }
 }
 async function connectCloud(action?:{email:string}|{link:string},refresh=false){
  if(cloudAction.current)return false;
  cloudAction.current=true;
  setCloudBusy(true);
  setAuthError('');
  try{
   const next={url:config.url.trim(),key:config.key.trim()};
   const url=new URL(next.url);
   if(url.protocol!=='https:'||url.username||url.password||!next.key)throw new Error('同期先のHTTPS URLと公開キーを確認してください。');
   const saved=localStorage.getItem('marginalia-cloud');
   const credentials=action&&'link' in action?emailLinkCredentials(action.link,next.url):null;
   let sync=cloud.current;
   if(!sync||sync.closed||saved!==JSON.stringify(next)){
    sync?.stop();
    setCloudSignedIn(false);
    setCloudEmail('');
    setLastSync(null);
    sync=new CloudSync(next,(state,error)=>{
     setSyncStatus(state);
     setSyncError(error||'');
     if(state==='synced')setLastSync(Date.now());
    });
    cloud.current=sync;
    localStorage.setItem('marginalia-cloud',JSON.stringify(next));
    const active=sync;
    sync.authSubscription=sync.client.auth.onAuthStateChange(event=>{
     if(event==='SIGNED_OUT'){
      active.pause();
      setCloudSignedIn(false);
      setCloudEmail('');
      setLastSync(null);
      setSyncError('');
      setSyncStatus('local');
     }else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'){
      // Supabase holds its auth lock while dispatching this callback.
      setTimeout(()=>{
       if(active.closed||cloudAction.current)return;
       void resumeCloud(active).catch(error=>{
        if(active.closed)return;
        setCloudSignedIn(false);
        setSyncStatus('error');
        setSyncError(error.message);
       });
      },0);
     }
    }).data.subscription;
   }
   if(action&&'email' in action){
    const {error}=await sync.client.auth.signInWithOtp({email:action.email,options:{emailRedirectTo:location.origin+location.pathname}});
    if(error)throw error;
    setSentTo(action.email);
    return true;
   }
   if(credentials){
    const {error}=await sync.client.auth.verifyOtp(credentials);
    if(error)throw error;
   }
   await resumeCloud(sync,refresh);
   return true;
  }catch(error){
   const issue=error as {message?:string;code?:string};
   const message=issue.code==='otp_expired'?'ログインリンクの有効期限が切れたか、すでに使用されています。新しいリンクを送ってください。':
    issue.code==='over_email_send_rate_limit'||issue.code==='over_request_rate_limit'?'少し待ってから、ログインリンクを再送してください。':
    issue.message||'同期先に接続できませんでした。';
   if(action)setAuthError(message);
   else{setCloudSignedIn(false);setSyncStatus('error');setSyncError(message);}
   return false;
  }finally{
   cloudAction.current=false;
   setCloudBusy(false);
  }
 }
 async function signOutCloud(){
  if(cloudAction.current||!cloud.current)return;
  cloudAction.current=true;
  setCloudBusy(true);
  try{
   const {error}=await cloud.current.client.auth.signOut({scope:'local'});
   if(error)throw error;
   setSentTo('');
   setAuthError('');
  }catch(error){setAuthError((error as Error).message);}
  finally{cloudAction.current=false;setCloudBusy(false);}
 }
 function openSync(){setSettings(false);setSyncOpen(true);}

 async function sendAI(){if(!prompt.trim()||aiBusy||!model)return;if(sourceDirty){notify('原文の変更を先に反映してください。');return;}const context=list.filter(p=>scope==='current'?p.id===selected:p.kind!=='journal').map(p=>({id:p.id,title:p.title,markdown:currentMarkdown(p.id)}));if(!context.length){notify('参照するリーフを開いてください。');return;}const user:Chat={id:crypto.randomUUID(),pageId:selected||'library',role:'user',content:prompt,time:Date.now()};chats.set(user.id,user);setPrompt('');setAiStartedAt(Date.now());setAiBusy(true);try{const history=[...chats.values()].filter(c=>c.pageId===user.pageId&&c.id!==user.id).sort((a,b)=>a.time-b.time).map(c=>({role:c.role,content:c.content}));const payload={prompt:user.content,context,history,model};const result=aiRoute==='relay'?await relayChat(payload):await bridgeRequest('chat',payload);const reply:Chat={id:crypto.randomUUID(),pageId:user.pageId,role:'assistant',content:result.answer,time:Date.now(),references:result.references,edits:result.edits};chats.set(reply.id,reply);}catch(error){notify(error instanceof Error?error.message:'AIに接続できませんでした。');}finally{setAiBusy(false);}}
 async function proposalAction(chat:Chat,index:number,accept:boolean){if(reviewBusy.current)return;const latest=chats.get(chat.id),edit=latest?.edits?.[index];if(!latest||!edit||edit.status)return;if(accept){if(sourceDirty){notify('原文の変更を先に反映してください。');return;}reviewBusy.current=true;try{await checkpoint('AIの変更を採用する前');if(operationRef.current.sourceDirty)throw new Error('原文の変更を先に反映してください。');if(chats.get(chat.id)?.edits?.[index]?.status)return;applyPagePatch(edit.pageId,edit.before,edit.after,activeEditorPage.current===edit.pageId?editor.current:null);}catch(error){notify((error as Error).message);return;}finally{reviewBusy.current=false;}}const current=chats.get(chat.id)!;chats.set(chat.id,{...current,edits:current.edits!.map((e,i)=>i===index?{...e,status:accept?'accepted':'rejected'}:e)});}
 function reviewAction(key:string,accept:boolean){const [id,value]=key.split(':');const chat=chats.get(id);if(chat)void proposalAction(chat,Number(value),accept);}
 function openReview(edit:Proposal,key:string){if(sourceDirty){notify('原文の変更を先に反映してください。');return;}openPage(edit.pageId);setSourceMode(false);setFocusedReview(key);if(window.innerWidth<=820)setAiOpen(false);}
 const inlineReviews=useMemo<InlineReview[]>(()=>[...chats.values()].flatMap(chat=>(chat.edits||[]).flatMap((edit,index)=>edit.pageId===selected&&!edit.status?[{key:chat.id+':'+index,before:edit.before,after:edit.after,reason:edit.reason}]:[])),[version,selected]);

 async function importMarkdown(event:React.ChangeEvent<HTMLInputElement>){
  const input=event.currentTarget;
  const file=input.files?.[0];
  input.value='';
  if(!file)return;
  if(sourceDirty){notify('原文の変更を先に反映してください。');return;}
  try{
   const markdown=await file.text();
   const kind=collections.find(collection=>collection.kind===view)?.kind||'note';
   const page=doc.transact(()=>{
    const leaf=createPage(kind);
    updatePage(leaf.id,{title:file.name.replace(/\.(md|markdown|txt)$/i,'')});
    doc.getMap<string>('seeds').set(leaf.id,markdown);
    return leaf;
   });
   openPageRef.current(page.id);
  }catch{notify('ファイルを読み込めませんでした。');}
 }
 function enterSource(){if(!selected)return;const text=currentMarkdown(selected);let draft:{source:string;base:string}|null=null;try{draft=JSON.parse(localStorage.getItem('marginalia-draft:'+selected)||'null');}catch{}setSource(draft?.source??text);setSourceBase(draft?.base??text);setSourceDirty(!!draft&&draft.source!==text);setSourceMode(true);if(draft)notify('保存していた原文の下書きを復元しました。');}
 async function applySource(){if(!editor.current||!selected)return;const id=selected;try{await checkpoint('Markdown原文を反映する前');const current=operationRef.current;if(current.selected!==id||!editor.current)throw new Error('原文の下書きは保存されています。元のリーフで変更を反映してください。');if(currentMarkdown(id)!==current.sourceBase){const p=createPage();updatePage(p.id,{title:(pages.get(id)?.title||'リーフ')+'（原文の変更）'});doc.getMap<string>('seeds').set(p.id,current.source);localStorage.removeItem('marginalia-draft:'+id);setSourceDirty(false);setSourceMode(false);notify('他の端末の変更を上書きしないよう、原文の変更を別リーフに保存しました。');return;}editor.current.commands.setContent(cleanHTML(current.source));localStorage.removeItem('marginalia-draft:'+id);setSourceDirty(false);setSourceMode(false);}catch(error){notify((error as Error).message);}}

 const collection=collections.find(c=>c.kind===view);
 const shown=(view==='trash'?[...pages.values()].filter(p=>p.deleted).sort((a,b)=>b.updated-a.updated):list).filter(p=>(!collection||p.kind===collection.kind)&&(p.title+' '+p.tags.join(' ')+' '+p.author).toLowerCase().includes(query.toLowerCase()));
 const pagePreview=(p:Page)=>p.author||(getPageMarkdown(p.id).replace(/<[^>]*>/g,'').replace(/[#*$`>\[\]_~=]/g,'').replace(/\s+/g,' ').slice(0,92))||'まだ書かれていない、思考の余白。';
 const thread=[...chats.values()].filter(c=>c.pageId===(selected||'library')).sort((a,b)=>a.time-b.time);
 const displayedSync=online?syncStatus:'offline';
 return <div className={'app '+(!aiOpen?'ai-hidden ':'')+(sidebarOpen?'sidebar-open':'')}>
 {sidebarOpen&&<button className="drawer-backdrop" aria-label="メニューを閉じる" onClick={()=>{setSidebarOpen(false);menuTrigger.current?.focus();}}/>}
 <aside className="sidebar" id="workspace-menu">
  <div className="brand"><span className="brand-mark">m</span><div>Marginalia<small>思考の余白</small></div><button className="mobile-only" aria-label="メニューを閉じる" ref={menuClose} onClick={()=>{setSidebarOpen(false);menuTrigger.current?.focus();}}><X size={20}/></button></div>
  <label className="search"><Search size={15}/><input aria-label="リーフを検索" placeholder="リーフを探す" value={query} onChange={e=>{if(sourceDirty)return notify('原文の変更を先に反映してください。');navigation.current?.navigate({view:'library',pageId:null,query:e.target.value},view==='library');}}/><kbd>⌘ K</kbd></label>
  <nav aria-label="リーフの区分"><button className={view==='library'?'nav-active':''} onClick={()=>openCollection('library')}><Library size={17}/>ライブラリ<span>{list.length}</span></button><div className="nav-divider"/>{collections.map(({kind,label,icon:Icon})=><button key={kind} className={view===kind?'nav-active':''} onClick={()=>openCollection(kind)}><Icon size={17}/>{label}<span>{list.filter(p=>p.kind===kind).length}</span></button>)}<NewLeafMenu label="新しいリーフ" onCreate={newPage}/></nav>
  <div className="sidebar-label">すべてのリーフ<NewLeafMenu label="リーフを追加" compact onCreate={newPage}/></div>
  <div className="page-tree">{treeRows.map(({p,depth})=>{const Icon=icons[p.kind];return <div key={p.id} className={'tree-row '+(selected===p.id&&view==='editor'?'selected-page':'')}><button className="tree-open" style={{paddingLeft:12+Math.min(depth,4)*14}} onClick={()=>openPage(p.id)}><Icon size={15}/><span>{p.title}</span></button><LeafMenu title={p.title} actions={leafActions(p,true)}/></div>;})}</div>
  <div className="sidebar-footer"><button className={view==='trash'?'nav-active':''} onClick={()=>openCollection('trash')}><Trash2 size={15}/>ゴミ箱</button><button onClick={()=>setSettings(true)}><Settings size={15}/>設定と接続</button><button onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<><Moon size={15}/>ダークモード</>:<><Sun size={15}/>ライトモード</>}</button></div>
 </aside>
 <main ref={mainSurface}>
  <header className="topbar"><div className="breadcrumbs"><div className="history-actions" role="group" aria-label="閲覧履歴"><button aria-label="戻る" title="戻る" disabled={!historyControls.back} onClick={()=>navigation.current?.back()}><ArrowLeft size={16}/></button><button aria-label="進む" title="進む" disabled={!historyControls.forward} onClick={()=>navigation.current?.forward()}><ArrowRight size={16}/></button></div><button ref={menuTrigger} className="mobile-only" aria-label="メニューを開く" aria-controls="workspace-menu" aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(true)}><Menu size={22}/></button><span className="mobile-screen-title">{view==='editor'?page?.title:collection?.label||(view==='trash'?'ゴミ箱':'Marginalia')}</span><button className="breadcrumb-library" onClick={()=>openCollection('library')}>ライブラリ</button>{view!=='library'&&<><ChevronRight size={14}/><strong>{view==='editor'?page?.title:collection?.label||'ゴミ箱'}</strong></>}</div><div className="top-actions">{updateAvailable&&<button onClick={()=>void updateApp()}>更新</button>}<button className="save-state" onClick={openSync} aria-label={'クラウド同期 · '+syncLabels[displayedSync]} title={syncLabels[displayedSync]}>{displayedSync==='offline'?<WifiOff size={19}/>:<Cloud size={19}/>}<span>{syncLabels[displayedSync]}</span>{displayedSync==='error'&&<i aria-hidden="true"/>}</button><button className={aiOpen?'active':''} aria-label="AIパネル" aria-expanded={aiOpen} onClick={()=>setAiOpen(!aiOpen)}><Sparkles size={16}/><span>AI</span></button></div></header>
  {ready&&tabs.length>0&&<div className="tabs" aria-label="開いているリーフ">{tabs.filter(id=>pages.get(id)&&!pages.get(id)?.deleted).map(id=>{const tab=pages.get(id)!,Icon=icons[tab.kind];return <div key={id} className={'leaf-tab '+(id===selected&&view==='editor'?'active':'')}><button className="tab-open" onClick={()=>openPage(id)}><Icon size={13}/><span>{tab.title}</span></button><button className="tab-close" aria-label={'「'+tab.title+'」のタブを閉じる'} title="タブを閉じる" onClick={()=>closeTab(id)}><X size={13}/></button></div>;})}<NewLeafMenu compact label="新しいリーフをタブで開く" onCreate={newPage}/></div>}
  {!ready||!historyControls.ready?<div className="loading">リーフを開いています…</div>:view!=='editor'?<section className="library">
   <div className="library-heading"><div><h1>{collection?.label||(view==='trash'?'ゴミ箱':'ライブラリ')}</h1><p>{collection?.description||(view==='trash'?'ゴミ箱へ移したリーフを、いつでも復元できます。':'本・論文・ノート・日記。すべてのリーフを見渡す場所。')}</p></div>{view!=='trash'&&(collection?<button className="primary" onClick={()=>newPage(collection.kind)}><Plus size={18}/>{collection.kind==='journal'?'日記を書く':collection.label+'を作成'}</button>:<NewLeafMenu onCreate={newPage}/>)}</div>
   {view!=='trash'&&displayedSync==='error'&&<div className="sync-prompt"><Cloud size={17}/><span>同期を確認してください</span><button onClick={openSync}>同期の状態</button></div>}
   {view!=='trash'&&displayedSync==='local'&&!cloudBusy&&<div className="sync-prompt"><Cloud size={17}/><span>この端末に保存中</span><button onClick={openSync}>端末間で同期</button></div>}
   {view==='library'&&<><div className="collection-overview" aria-label="4つの区分">{collections.map(({kind,label,description,icon:Icon})=><button key={kind} className={'collection-card kind-'+kind} onClick={()=>openCollection(kind)}><span className="collection-icon"><Icon size={19}/></span><span className="collection-count">{list.filter(p=>p.kind===kind).length}</span><strong>{label}</strong><small>{description}</small><ChevronRight className="collection-arrow" size={14}/></button>)}</div></>}
   <label className="search collection-search"><Search size={18}/><input type="search" aria-label="この一覧を検索" placeholder={collection?collection.label+'を検索':'リーフを検索'} value={query} onChange={e=>navigation.current?.navigate({view,pageId:null,query:e.target.value},true)}/></label>
   <div className="library-controls"><div className="view-switch" role="group" aria-label="一覧の表示形式"><button className={layout==='pages'?'active':''} aria-pressed={layout==='pages'} onClick={()=>setLayout('pages')}><List size={14}/>ページビュー</button><button className={layout==='gallery'?'active':''} aria-pressed={layout==='gallery'} onClick={()=>setLayout('gallery')}><LayoutGrid size={14}/>ギャラリー</button></div>{view!=='trash'&&<button className="quiet" onClick={()=>file.current?.click()}><Upload size={14}/>Markdownを読み込む</button>}</div>
   <div className="section-title"><h2>{query?'検索結果':view==='trash'?'削除したリーフ':collection?collection.label+'のリーフ':'最近のリーフ'}</h2><span>{shown.length}件 · 更新順</span></div>
   {!shown.length&&<div className="collection-empty"><Leaf size={28}/><p>{query?'一致するリーフがありません。':view==='trash'?'ゴミ箱は空です。':'最初の'+(collection?.label||'リーフ')+'を作成してみましょう。'}</p></div>}
   <div className={layout==='gallery'?'note-grid':'leaf-list'} aria-label={layout==='gallery'?'リーフのギャラリー':'リーフのページ一覧'}>{shown.map(p=>{const Icon=icons[p.kind];return layout==='gallery'?<article className={'note-card kind-'+p.kind} key={p.id}><div className="card-menu"><LeafMenu title={p.title} actions={leafActions(p,true)}/></div><button className="card-open" onClick={()=>view==='trash'?restoreLeaf(p.id):openPage(p.id)}><div className="card-top"><span className="kind-label"><Icon size={14}/>{labels[p.kind]}</span></div><h3>{p.title}</h3><p>{pagePreview(p)}</p><div className="card-tags">{p.tags.map(tag=><span key={tag}>{tag}</span>)}</div><div className="card-bottom"><span className={'status-dot '+p.status}>{view==='trash'?'クリックして復元':['paper','book'].includes(p.kind)?statuses[p.status]:labels[p.kind]}</span><time>{new Date(p.updated).toLocaleDateString('ja-JP',{month:'short',day:'numeric'})}</time></div></button></article>:<article className={'leaf-list-row kind-'+p.kind} key={p.id}><button className="leaf-list-open" onClick={()=>view==='trash'?restoreLeaf(p.id):openPage(p.id)}><span className="list-leaf-icon"><Icon size={19}/></span><span className="list-leaf-body"><strong>{p.title}</strong><span className="list-leaf-preview">{pagePreview(p)}</span><span className="list-leaf-tags">{p.tags.map(tag=><span key={tag}>{tag}</span>)}</span></span><span className="list-leaf-meta"><span>{view==='trash'?'復元する':labels[p.kind]}</span><time>{new Date(p.updated).toLocaleDateString('ja-JP',{month:'short',day:'numeric'})}</time></span></button><LeafMenu title={p.title} actions={leafActions(p,true)}/></article>;})}</div>
  </section>:page&&!page.deleted?<section className="document">
  <button className="mobile-only document-back" onClick={()=>openCollection(page.kind)}><ArrowLeft size={17}/>{labels[page.kind]}の一覧へ</button>
  <div className="document-meta"><select aria-label="リーフの区分" value={page.kind} onChange={e=>updatePage(page.id,{kind:e.target.value as Page['kind']})}>{collections.map(({kind,label})=><option key={kind} value={kind}>{label}</option>)}</select><span>最終更新 {new Date(page.updated).toLocaleDateString('ja-JP')}</span><div className="document-actions"><LeafMenu title={page.title} actions={leafActions(page)}/></div></div><input className="page-title" aria-label="リーフのタイトル" value={page.title} onChange={e=>updatePage(page.id,{title:e.target.value})}/><div className="page-properties"><label>タグ<input aria-label="タグ" placeholder="研究, 読書" value={page.tags.join(', ')} onChange={e=>updatePage(page.id,{tags:e.target.value.split(',').map(t=>t.trim()).filter(Boolean)})}/></label>{['paper','book'].includes(page.kind)&&<><label>著者<input aria-label="著者" placeholder="著者名" value={page.author} onChange={e=>updatePage(page.id,{author:e.target.value})}/></label><label>状況<select aria-label="読書状況" value={page.status} onChange={e=>updatePage(page.id,{status:e.target.value as Page['status']})}>{Object.entries(statuses).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label>資料URL<input aria-label="資料URL" placeholder="https://…" value={page.url} onChange={e=>updatePage(page.id,{url:e.target.value})}/>{safeURL(page.url)&&<a href={safeURL(page.url)} target="_blank" rel="noreferrer"><ExternalLink size={14}/></a>}</label></>}</div>{aiBusy&&<AIWorking compact startedAt={aiStartedAt}/>}<div className="editor-mode"><button className={!sourceMode?'active':''} onClick={()=>{if(sourceDirty)return notify('変更を反映するかキャンセルしてください。');setSourceMode(false);}}>文書</button><button className={sourceMode?'active':''} onClick={enterSource}><Code2 size={13}/>Markdown原文</button>{sourceMode&&<><button onClick={applySource}><Check size={13}/>変更を反映</button><button onClick={()=>{localStorage.removeItem('marginalia-draft:'+selected);setSourceDirty(false);setSourceMode(false);}}>キャンセル</button></>}</div><div hidden={sourceMode}>{inlineReviews.length>0&&<div className="review-page-bar"><Sparkles size={15}/><span>AIの変更案 {inlineReviews.length}件<small>本文は採用するまで変更されません</small></span><button onClick={()=>setFocusedReview(inlineReviews[0].key)}>最初の変更案へ</button></div>}<RichEditor key={page.id} pageId={page.id} reviews={inlineReviews} onReviewAction={reviewAction} onReady={e=>{if(e){editor.current=e;activeEditorPage.current=page.id;}else if(activeEditorPage.current===page.id){editor.current=null;activeEditorPage.current=null;}setEditorEpoch(n=>n+1);}} onChange={()=>{}}/></div>{sourceMode&&<textarea className="source-editor" aria-label="Markdown原文" spellCheck={false} value={source} onChange={e=>{setSource(e.target.value);setSourceDirty(e.target.value!==sourceBase);localStorage.setItem('marginalia-draft:'+selected,JSON.stringify({source:e.target.value,base:sourceBase}));}}/>}</section>:<div className="empty">リーフを選択してください。</div>}
 </main>
 {ready&&view!=='editor'&&<nav className="mobile-navigation" aria-label="コレクション">
  <button aria-current={view==='library'?'page':undefined} onClick={()=>openCollection('library')}><Library size={20}/>ライブラリ</button>
  {collections.map(({kind,label,icon:Icon})=><button key={kind} aria-current={view===kind?'page':undefined} onClick={()=>openCollection(kind)}><Icon size={20}/>{label}</button>)}
 </nav>}
 {aiOpen&&<aside className="ai-panel"><div className="ai-header"><span className="ai-symbol"><Sparkles size={17}/></span><div><strong>思考のパートナー</strong><small>ChatGPTとリーフを育てる</small></div><button aria-label="AIを閉じる" onClick={()=>setAiOpen(false)}><PanelRightClose size={17}/></button></div><div className="ai-context"><span>参照するリーフ</span><select aria-label="AIの参照範囲" value={scope} onChange={e=>setScope(e.target.value)}><option value="current">開いているリーフ</option><option value="all">全リーフ（日記を除く）</option></select></div><div className="conversation">{!thread.length&&<div className="ai-welcome"><div className="welcome-orbit"><Sparkles size={27}/></div><h3>考えを、もう一歩先へ。</h3><p>文章を整理したり、数式を整えたり。リーフをつなげて、新しい理解を見つけましょう。</p>{['このリーフの要点を整理して','数式とコードの表記を整えて','関連するリーフとつなげて説明して'].map(text=><button className="suggestion" key={text} onClick={()=>setPrompt(text)}>{text}<ArrowUpRight size={14}/></button>)}<div className="approval-note"><Check size={14}/><span>変更は一つずつ確認してから反映</span></div></div>}{thread.map(chat=><div key={chat.id} className={'message '+chat.role}><small>{chat.role==='user'?'あなた':'ChatGPT'}</small><div className="prose" dangerouslySetInnerHTML={{__html:displayMarkdown(chat.content)}}/>{chat.references?.map(id=><button className="reference" key={id} onClick={()=>openPage(id)}>↳ {pages.get(id)?.title||id}</button>)}{chat.edits?.map((edit,index)=><div className={'chat-review-summary '+(edit.status||'pending')} key={index}><span className="review-summary-icon"><FileText size={15}/></span><div><strong>{pages.get(edit.pageId)?.title||'リーフ'}</strong><small>{edit.status==='accepted'?'✓ 採用済み':edit.status==='rejected'?'却下済み':'ページ本文に変更案があります'}</small></div><button onClick={()=>edit.status?openPage(edit.pageId):openReview(edit,chat.id+':'+index)}>{edit.status?'開く':'ページで確認'}<ArrowUpRight size={13}/></button></div>)}</div>)}{aiBusy&&<AIWorking startedAt={aiStartedAt}/>}</div><div className="ai-compose">{!aiStatus.connected?<button className="connect-ai" onClick={()=>setSettings(true)}><Sparkles size={15}/>Continue with ChatGPT</button>:<div className="model-row"><select aria-label="AIモデル" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">利用状況 ↗</a></div>}<div className="prompt-box"><textarea aria-label="AIへのメッセージ" placeholder="リーフについて相談する…" value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();void sendAI();}}}/><button aria-label="AIへ送信" className="send" disabled={aiBusy||!aiStatus.planEnabled||!model||!prompt.trim()||!online} onClick={()=>void sendAI()}><ArrowUp size={17}/></button></div><small>{aiStatus.planEnabled?'ChatGPTの契約枠を使用 · ⌘ Enterで送信':'APIキー不要 · 接続後に利用できます'}</small></div></aside>}
 <input hidden ref={file} type="file" accept=".md,.markdown,.txt" onChange={importMarkdown}/><input hidden ref={backupInput} type="file" accept=".json" onChange={async e=>{const f=e.target.files?.[0];if(f){try{await checkpoint('バックアップを読み込む前');await importBackupForRecovery(await f.text());setSettings(false);setRecoveryOpen(true);notify('現在の本文を変更せず、復元用のバックアップを読み込みました。');}catch(error){notify((error as Error).message);}}e.target.value='';}}/>
 {notice&&<div className="toast" role="status"><span>{notice}</span>{undoDelete&&<button className="undo-delete" onClick={()=>restoreLeaf(undoDelete)}><Undo2 size={14}/>元に戻す</button>}<button aria-label="通知を閉じる" onClick={()=>setNotice('')}><X size={16}/></button></div>}
 {syncOpen&&<SyncDialog config={config} onConfig={setConfig} account={cloudEmail}
  status={displayedSync} error={authError||syncError} lastSync={lastSync} busy={cloudBusy} online={online} sentTo={sentTo}
  onSend={email=>void connectCloud({email})} onVerify={link=>connectCloud({link})} onRefresh={()=>void connectCloud(undefined,true)}
  onSignOut={()=>void signOutCloud()} onClose={()=>setSyncOpen(false)}/>}
 {settings&&<Dialog title="設定と接続" onClose={()=>setSettings(false)}>
  <section><h3><Cloud size={17}/>クラウド同期</h3><button onClick={openSync}>{syncLabels[displayedSync]} · 同期を開く</button></section><section><h3><Sparkles size={17}/>ChatGPT</h3><p>契約枠でAIを利用します。MacでAI補助サーバーを起動し、接続してください。GitHub PagesだけではAI認証を実行できません。iPhoneでは、クラウド経由でこのMacに依頼します。Macで補助サーバーが動いている必要があります。</p><label>AI補助サーバーURL<input value={bridge} onChange={e=>setBridge(e.target.value)} placeholder="http://127.0.0.1:4318"/></label><label>接続コード<input type="password" autoComplete="off" value={pairing} onChange={e=>setPairing(e.target.value)} placeholder="補助サーバー起動時に表示されるコード"/></label><div className="settings-actions"><button className="primary" onClick={signInAI}>Continue with ChatGPT</button><button onClick={async()=>{localStorage.setItem('marginalia-bridge',bridge);localStorage.setItem('marginalia-pairing',pairing);const result=await checkAI();notify(result?.planEnabled?'ChatGPTの契約枠に接続できました。':'接続を確認できません。補助サーバーと認証を確認してください。');}}>接続を確認</button></div>{aiStatus.connected&&<p>{aiStatus.email} · {aiStatus.planEnabled?'契約枠を使用':'契約枠の許可が必要'} <button onClick={async()=>{try{const result=await bridgeRequest('sign-out',{});setAiStatus({connected:false});notify(result.revoked?'ChatGPTから切断しました。':'端末から切断しました。ChatGPTの設定からも接続を解除してください。');}catch(error){notify((error as Error).message);}}}>切断</button></p>}<a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">ChatGPTの利用上限と接続を管理 ↗</a><div className="settings-actions"><button disabled={!cloudSignedIn||pairing.length<20} onClick={enableRelay}>このMacをiPhone用のAI接続端末にする</button></div>{relayEnabled&&<p>別画面でMacとの連携結果を確認してください。</p>}</section><section><h3><Download size={17}/>バックアップ</h3><p>数式、リーフの構造、AIの変更案を含めて保存します。</p><div className="settings-actions"><button onClick={backup}>全リーフを保存</button><button onClick={()=>{setSettings(false);setRecoveryOpen(true);}}>自動バックアップから復元</button><button onClick={()=>backupInput.current?.click()}>バックアップを読み込む</button></div></section><section><h3>表示</h3><button onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?'ダークモードにする':'ライトモードにする'}</button></section></Dialog>}
 {recoveryOpen&&<RecoveryDialog onClose={()=>setRecoveryOpen(false)} onNotice={notify} onRestore={id=>{setRecoveryOpen(false);setSettings(false);navigation.current?.navigate({view:'editor',pageId:id,query:''});notify('現在の本文を残したまま、別のリーフとして復元しました。');}}/>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);

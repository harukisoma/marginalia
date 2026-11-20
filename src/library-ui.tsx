import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {BookOpen,NotebookPen,FileText,CalendarDays,Search,X,CheckCircle2,Circle,CircleDot,ChevronLeft,ChevronRight,LayoutGrid,List,Upload,Eye,SlidersHorizontal,FolderOpen} from 'lucide-react';
import type {Page} from './data';
import {labels} from './data';
import {NewLeafMenu,LeafMenu} from './workspace-ui';
import {TagBadge,availableTags} from './tags';
import {filterLeaves,sortLeaves,groupLeaves,pageWindow,searchExcerpt,leafStatuses} from './library.mjs';

const icons={book:BookOpen,paper:NotebookPen,note:FileText,journal:CalendarDays};
type Preferences={tag:string;untagged:boolean;status:string;sort:string;group:string;preview:boolean};
const defaults:Preferences={tag:'',untagged:false,status:'',sort:'updated',group:'none',preview:false};
function loadPreferences(key:string):Preferences{try{const saved=JSON.parse(localStorage.getItem(key)||'{}');return{tag:typeof saved.tag==='string'?saved.tag:'',untagged:saved.untagged===true,status:['unread','reading','done'].includes(saved.status)?saved.status:'',sort:['updated','created','oldest','title'].includes(saved.sort)?saved.sort:'updated',group:['none','kind','status','parent'].includes(saved.group)?saved.group:'none',preview:saved.preview===true};}catch{return defaults;}}
export function StatusIcon({status}:{status:string}){const Icon=status==='done'?CheckCircle2:status==='reading'?CircleDot:Circle;return <Icon size={17} className={'leaf-status-icon status-'+status} aria-hidden="true"/>;}
type Action={label:string;icon:ReactNode;run:()=>void;danger?:boolean;separator?:boolean};
type Props={scope:string;title:string;description:string;pages:Page[];allPages:Page[];query:string;onQuery:(query:string)=>void;onOpen:(id:string)=>void;onCreate:(kind:Page['kind'])=>void;onImport:()=>void;body:(id:string)=>string;actions:(page:Page)=>Action[];layout:'pages'|'gallery';onLayout:(layout:'pages'|'gallery')=>void;syncPrompt?:ReactNode;emptyActions?:ReactNode;};

export function LeafBrowser({scope,title,description,pages,allPages,query,onQuery,onOpen,onCreate,onImport,body,actions,layout,onLayout,syncPrompt,emptyActions}:Props){
 const preferenceKey='marginalia-list-view:'+scope;
 const[prefs,setPrefs]=useState(()=>loadPreferences(preferenceKey)),[viewOptions,setViewOptions]=useState(false);
 const signature=JSON.stringify([query,prefs.tag,prefs.untagged,prefs.status,prefs.sort,prefs.group]);
 const positionKey='marginalia-list-position:'+scope;
 const initial=useRef<{signature:string;page:number;top:number}|null>(null);
 if(initial.current===null){try{const saved=JSON.parse(sessionStorage.getItem(positionKey)||'null');initial.current=saved?.signature===signature&&Number.isInteger(saved.page)&&saved.page>0&&Number.isFinite(saved.top)?saved:{signature,page:1,top:0};}catch{initial.current={signature,page:1,top:0};}}
 const[page,setPage]=useState(initial.current!.page),previousSignature=useRef(signature),surface=useRef<HTMLElement>(null);
 useEffect(()=>{const top=initial.current?.top||0;const frame=requestAnimationFrame(()=>{const main=surface.current?.closest('main');if(main)main.scrollTop=top;});return()=>cancelAnimationFrame(frame);},[]);
 useEffect(()=>{try{localStorage.setItem(preferenceKey,JSON.stringify(prefs));}catch{}},[prefs,preferenceKey]);
 useEffect(()=>{if(previousSignature.current!==signature){setPage(1);previousSignature.current=signature;}},[signature]);
 const lookup=useMemo(()=>new Map(allPages.map(page=>[page.id,page])),[allPages]);
 const catalog=availableTags();
 const matches:Page[]=filterLeaves(pages,{query,tag:prefs.tag,untagged:prefs.untagged,status:prefs.status},body);
 const groups=groupLeaves(sortLeaves(matches,prefs.sort),prefs.group,id=>lookup.get(id)) as {key:string;label:string;pages:Page[]}[];
 const ordered=groups.flatMap(group=>group.pages),windowed=pageWindow(ordered,page,30);
 const visibleGroups=groupLeaves(windowed.items,prefs.group,id=>lookup.get(id)) as {key:string;label:string;pages:Page[]}[];
 const hasFilters=!!(query||prefs.tag||prefs.untagged||prefs.status),reset=()=>{onQuery('');setPrefs(old=>({...old,tag:'',untagged:false,status:''}));};
 const set=(change:Partial<Preferences>)=>setPrefs(old=>({...old,...change}));
 const isTrash=scope==='trash';
 function open(id:string){try{sessionStorage.setItem(positionKey,JSON.stringify({signature,page:windowed.current,top:surface.current?.closest('main')?.scrollTop||0}));}catch{}onOpen(id);}
 function move(next:number){setPage(next);document.querySelector('.leaf-browser')?.scrollIntoView({block:'start',behavior:'instant'});}
 return <section className="leaf-browser" ref={surface}>
  <div className="leaf-browser-heading"><div><h1>{scope==='library'?<><span className="desktop-leaf-heading">{title}</span><span className="mobile-leaf-heading">リーフ</span></>:title}<span className="count-badge">{pages.length}</span></h1><p>{description}</p></div>{!isTrash&&<div className="leaf-create-actions"><button className="import-leaf" aria-label="Markdownを読み込む" title="Markdownを読み込む" onClick={onImport}><Upload size={16}/><span>読み込む</span></button><NewLeafMenu onCreate={onCreate}/></div>}</div>
  {syncPrompt}
  <label className="leaf-search"><Search size={18}/><input type="search" aria-label="タイトル・本文を検索" placeholder="タイトル・本文・タグを検索…" value={query} onChange={event=>onQuery(event.target.value)}/>{query&&<button aria-label="検索をクリア" onClick={()=>onQuery('')}><X size={16}/></button>}<kbd>/</kbd></label>
  <div className={'leaf-filters '+(viewOptions?'view-options-open':'')} aria-label="リーフの絞り込みと並べ替え">
   <div className="filter-fields"><SlidersHorizontal size={16} className="filter-symbol"/><label><span>タグ</span><select aria-label="タグで絞り込み" value={prefs.untagged?'none':prefs.tag?'tag:'+prefs.tag:'all'} onChange={event=>set({tag:event.target.value.startsWith('tag:')?event.target.value.slice(4):'',untagged:event.target.value==='none'})}><option value="all">すべてのタグ</option><option value="none">タグなし</option>{catalog.map(tag=><option key={tag} value={'tag:'+tag}>{tag}</option>)}</select></label><label><span>ステータス</span><select aria-label="ステータスで絞り込み" value={prefs.status} onChange={event=>set({status:event.target.value})}><option value="">すべてのステータス</option>{Object.entries(leafStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
   <div className="view-fields"><label className="sort-control"><span>並べ替え</span><select aria-label="リーフの並べ替え" value={prefs.sort} onChange={event=>set({sort:event.target.value})}><option value="updated">更新が新しい順</option><option value="oldest">更新が古い順</option><option value="created">作成が新しい順</option><option value="title">タイトル順</option></select></label><label className="group-control"><span>グループ</span><select aria-label="リーフのグループ表示" value={prefs.group} onChange={event=>set({group:event.target.value})}><option value="none">グループなし</option><option value="kind">区分ごと</option><option value="status">ステータスごと</option><option value="parent">親リーフごと</option></select></label></div>
  </div>
  {hasFilters&&<div className="active-filters"><span>{matches.length}件が一致</span>{(prefs.tag||prefs.untagged)&&<button onClick={()=>set({tag:'',untagged:false})}>タグ：{prefs.untagged?'タグなし':prefs.tag}<X size={12}/></button>}{prefs.status&&<button onClick={()=>set({status:''})}>{leafStatuses[prefs.status]}<X size={12}/></button>}<button className="clear-filters" onClick={reset}>条件をクリア</button></div>}
  <div className="leaf-results">
   <div className="leaf-results-header"><strong><FileText size={16}/>{matches.length}件のリーフ</strong><div className="leaf-display-controls"><button className="view-options-toggle" aria-label="並べ替え・グループ設定" aria-expanded={viewOptions} onClick={()=>setViewOptions(!viewOptions)}><SlidersHorizontal size={16}/><span>表示</span></button><button aria-label="本文のプレビューを表示" title="本文のプレビューを表示" aria-pressed={prefs.preview} onClick={()=>set({preview:!prefs.preview})}><Eye size={16}/><span>プレビュー</span></button><div className="segmented-control" role="group" aria-label="一覧の表示形式"><button aria-label="リスト表示" aria-pressed={layout==='pages'} onClick={()=>onLayout('pages')}><List size={17}/></button><button aria-label="ギャラリー表示" aria-pressed={layout==='gallery'} onClick={()=>onLayout('gallery')}><LayoutGrid size={17}/></button></div></div></div>
   {!matches.length?<div className="leaf-empty"><Search size={30}/><h2>{hasFilters?'一致するリーフがありません':isTrash?'ゴミ箱は空です':'まだリーフがありません'}</h2><p>{hasFilters?'別のキーワードや条件で検索してください。':'本・論文・ノート・日記を、ここから整理していきましょう。'}</p>{hasFilters?<button className="secondary-button" onClick={reset}>条件をクリア</button>:emptyActions}</div>:<div className={layout==='gallery'?'organized-gallery':'organized-list'} aria-label={layout==='gallery'?'リーフのギャラリー':'リーフの一覧'}>
    {visibleGroups.map(group=><div className="leaf-group" key={group.key}>{prefs.group!=='none'&&<h2 className="leaf-group-heading"><FolderOpen size={15}/>{group.label}<span className="count-badge">{groups.find(item=>item.key===group.key)?.pages.length||group.pages.length}</span></h2>}<div className="leaf-group-items">{group.pages.map(leaf=>{
     const Icon=icons[leaf.kind],parent=lookup.get(leaf.parent),snippet=(prefs.preview||query||layout==='gallery')?searchExcerpt(body(leaf.id),query):'';
     return <article key={leaf.id} className={'organized-leaf '+(isTrash?'deleted-leaf':'')}>
      <div className="leaf-row-state"><StatusIcon status={leaf.status}/></div>
      <div className="leaf-row-content"><div className="leaf-title-line"><button className="leaf-title-link" onClick={()=>open(leaf.id)}>{leaf.title||'無題のリーフ'}</button><div className="leaf-row-labels">{(leaf.tags||[]).map(tag=><TagBadge name={tag} key={tag} onClick={()=>set({tag,untagged:false})}/>)}</div></div>
       {snippet&&<p className="leaf-excerpt">{snippet}</p>}
       <div className="leaf-row-details"><span><Icon size={13}/>{labels[leaf.kind]}</span><span className="row-status">{leafStatuses[leaf.status]||leafStatuses.unread}</span>{parent&&!parent.deleted&&<button className="parent-leaf-link" onClick={()=>open(parent.id)}><FolderOpen size={13}/>{parent.title}</button>}<time dateTime={new Date(leaf.updated).toISOString()}>{new Date(leaf.updated).toLocaleDateString('ja-JP',{year:new Date(leaf.updated).getFullYear()===new Date().getFullYear()?undefined:'numeric',month:'numeric',day:'numeric'})} 更新</time>{isTrash&&<span>クリックして復元</span>}</div>
      </div><LeafMenu title={leaf.title} actions={actions(leaf).map(action=>action.label==='開く'?{...action,run:()=>open(leaf.id)}:action)}/>
     </article>;
    })}</div></div>)}
   </div>}
  </div>
  {!!matches.length&&<nav className="leaf-pagination" aria-label="リーフ一覧のページ移動"><span>{windowed.total}件中 {windowed.start}–{windowed.end}件</span><div><button aria-label="前のページ" disabled={windowed.current<=1} onClick={()=>move(windowed.current-1)}><ChevronLeft size={16}/>前へ</button><span>{windowed.current} / {windowed.count}</span><button aria-label="次のページ" disabled={windowed.current>=windowed.count} onClick={()=>move(windowed.current+1)}>次へ<ChevronRight size={16}/></button></div></nav>}
 </section>;
}

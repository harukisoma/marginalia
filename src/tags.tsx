import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,Plus,Search,Tag,X} from 'lucide-react';
import {doc,pages,updatePage,type Page} from './data';
import {taxonomyFields,taxonomySuggestions,taxonomyScope,taxonomyParent,taxonomyValues,changeTaxonomy,leafClassifications} from './taxonomy.mjs';
import {normalize,uniqueTags} from './library.mjs';

const definitions=doc.getMap<{name:string;scope?:string}>('taxonomy-labels');
export function availableFilters(kind=''){const entries=new Map<string,{value:string;label:string}>();for(const page of pages.values())if(!page.deleted&&(!kind||page.kind===kind))for(const item of leafClassifications(page))entries.set(item.key,{value:item.key,label:({book:'本',paper:'論文',note:'ノート',journal:''}[page.kind]||'')+' · '+item.label+' · '+item.name});return [...entries.values()].sort((a,b)=>a.label.localeCompare(b.label,'ja'));}
export function availableTags(scope:string,defaults:string[]=[]):string[]{return uniqueTags([...defaults,...[...definitions.values()].filter(item=>item.scope===scope).map(item=>item.name),...[...pages.values()].flatMap(page=>Object.keys(taxonomyFields).filter(field=>taxonomyScope(page,field)===scope).flatMap(field=>taxonomyValues(page,field)))]);}
export function LeafClassification({page}:{page:Page}){
 if(page.kind==='journal')return null;
 return <><div className="leaf-classification-fields">{Object.entries(taxonomyFields).filter(([,definition])=>definition.kind===page.kind).map(([field,definition])=>{
 const parents=taxonomyParent(page,field),disabled=parents.some(value=>!value);
 return <div className="property-field" key={field}><span>{definition.label}</span><TagPicker scope={taxonomyScope(page,field)} label={definition.label} defaults={taxonomySuggestions(page,field)} multiple={'multiple' in definition&&definition.multiple===true} disabled={disabled} value={taxonomyValues(page,field)} onChange={values=>updatePage(page.id,changeTaxonomy(page,field,values))}/></div>;
 })}</div>{!!page.tags?.length&&<details className="legacy-tags"><summary>以前のタグ（{page.tags.length}）</summary><p>以前の記録として保持しています。必要なものを上の分類から選び直せます。</p><div className="selected-labels">{page.tags.map(name=><TagBadge key={name} name={name}/>)}</div></details>}</>;
}
export function tagTone(name:string){let hash=0;for(const letter of normalize(name))hash=(hash*31+letter.codePointAt(0)!)>>>0;return ['blue','purple','green','amber','gray'][hash%5];}
export function TagBadge({name,onClick}:{name:string;onClick?:()=>void}){return onClick?<button className={'label-badge tone-'+tagTone(name)} onClick={onClick} title={'「'+name+'」で絞り込む'}>{name}</button>:<span className={'label-badge tone-'+tagTone(name)}>{name}</span>;}

export function TagPicker({value,onChange,scope,label='タグ',defaults=[],multiple=true,disabled=false}:{value:string[];onChange:(tags:string[])=>void;scope:string;label?:string;defaults?:string[];multiple?:boolean;disabled?:boolean}){
 const[open,setOpen]=useState(false),[query,setQuery]=useState(''),[position,setPosition]=useState({left:0,top:0,width:300,maxHeight:340});
 const[,refresh]=useState(0),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const catalog:string[]=uniqueTags([...availableTags(scope,defaults),...value]),matches=catalog.filter(name=>normalize(name).includes(normalize(query)));
 const create=!!normalize(query)&&!catalog.some(name=>normalize(name)===normalize(query));
 useEffect(()=>{const update=()=>refresh(n=>n+1);definitions.observe(update);return()=>definitions.unobserve(update);},[]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{
   const box=trigger.current?.getBoundingClientRect();if(!box)return;
   const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
   const panelWidth=Math.min(320,width-24),below=top+height-box.bottom-12,above=box.top-top-12;
   const flipped=below<200&&above>below,maxHeight=Math.max(120,Math.min(340,flipped?above:below));
   setPosition({left:Math.max(left+12,Math.min(box.left,left+width-panelWidth-12)),top:flipped?box.top-maxHeight-6:box.bottom+6,width:panelWidth,maxHeight});
  };
  place();input.current?.focus();window.visualViewport?.addEventListener('resize',place);window.addEventListener('resize',place);
  const outside=(event:Event)=>{if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',outside);document.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);};
 },[open]);
 function toggle(name:string){const selected=value.some(tag=>normalize(tag)===normalize(name));onChange(selected?value.filter(tag=>normalize(tag)!==normalize(name)):multiple?[...value,name]:[name]);if(!multiple)setOpen(false);}
 function add(){const name=query.trim().replace(/\s+/g,' ').slice(0,50);if(!name)return;definitions.set(JSON.stringify([scope,normalize(name)]),{name,scope});if(!value.some(tag=>normalize(tag)===normalize(name)))onChange(multiple?[...value,name]:[name]);setQuery('');if(!multiple)setOpen(false);}
 return <div className="tag-picker">
  <div className="selected-labels">{value.map(name=><span className={'label-badge removable-label tone-'+tagTone(name)} key={name}><span>{name}</span><button aria-label={'「'+name+'」タグを外す'} onClick={()=>onChange(value.filter(tag=>tag!==name))}><X size={12}/></button></span>)}</div>
  <button className="tag-picker-trigger" disabled={disabled} title={disabled?'先に上位のカテゴリを選んでください':undefined} ref={trigger} aria-label={label+'を選択・追加'} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setQuery('');setOpen(!open);}}><Tag size={14}/>{disabled?'先に上位を選択':value.length?'編集':label+'を追加'}<Plus size={13}/></button>
  {open&&createPortal(<div ref={panel} className="tag-popover" role="dialog" aria-label={label+'を選択・追加'} style={position} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}}}>
   <header><strong>{label}を選択</strong><button aria-label="タグ選択を閉じる" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={16}/></button></header>
   <label className="tag-search"><Search size={15}/><input ref={input} aria-label={label+'を検索または作成'} placeholder="検索、または新しいタグを入力" maxLength={50} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(create)add();else if(matches[0])toggle(matches[0]);}}}/></label>
   <div className="tag-options">{matches.map(name=><button key={name} role="checkbox" aria-checked={value.some(tag=>normalize(tag)===normalize(name))} onClick={()=>toggle(name)}><span className="tag-check">{value.some(tag=>normalize(tag)===normalize(name))&&<Check size={15}/>}</span><TagBadge name={name}/></button>)}{!matches.length&&!create&&<p>タグがありません。</p>}{create&&<button className="tag-create" onClick={add}><Plus size={16}/><span>「{query.trim()}」を作成</span></button>}</div>
   <footer>{multiple?'複数選択できます。':'1つ選択できます。'}新しい項目は同じ区分・分類で使えます。</footer>
  </div>,document.body)}
 </div>;
}

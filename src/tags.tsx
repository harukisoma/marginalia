import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,Plus,Search,Tag,X} from 'lucide-react';
import {doc,pages} from './data';
import {normalize,uniqueTags} from './library.mjs';

const definitions=doc.getMap<{name:string}>('labels');
const suggestions=['アイデア','あとで読む','重要','学習','参考資料'];
export function availableTags():string[]{return uniqueTags([...suggestions,...[...definitions.values()].map(item=>item.name),...[...pages.values()].flatMap(page=>page.tags||[])]);}
export function tagTone(name:string){let hash=0;for(const letter of normalize(name))hash=(hash*31+letter.codePointAt(0)!)>>>0;return ['blue','purple','green','amber','gray'][hash%5];}
export function TagBadge({name,onClick}:{name:string;onClick?:()=>void}){return onClick?<button className={'label-badge tone-'+tagTone(name)} onClick={onClick} title={'「'+name+'」で絞り込む'}>{name}</button>:<span className={'label-badge tone-'+tagTone(name)}>{name}</span>;}

export function TagPicker({value,onChange}:{value:string[];onChange:(tags:string[])=>void}){
 const[open,setOpen]=useState(false),[query,setQuery]=useState(''),[position,setPosition]=useState({left:0,top:0,width:300,maxHeight:340});
 const[,refresh]=useState(0),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const catalog=availableTags(),matches=catalog.filter(name=>normalize(name).includes(normalize(query)));
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
 function toggle(name:string){const selected=value.some(tag=>normalize(tag)===normalize(name));onChange(selected?value.filter(tag=>normalize(tag)!==normalize(name)):[...value,name]);}
 function add(){const name=query.trim().replace(/\s+/g,' ').slice(0,50);if(!name)return;definitions.set(normalize(name),{name});if(!value.some(tag=>normalize(tag)===normalize(name)))onChange([...value,name]);setQuery('');}
 return <div className="tag-picker">
  <div className="selected-labels">{value.map(name=><span className={'label-badge removable-label tone-'+tagTone(name)} key={name}><span>{name}</span><button aria-label={'「'+name+'」タグを外す'} onClick={()=>onChange(value.filter(tag=>tag!==name))}><X size={12}/></button></span>)}</div>
  <button className="tag-picker-trigger" ref={trigger} aria-label="タグを選択・追加" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setQuery('');setOpen(!open);}}><Tag size={14}/>{value.length?'編集':'タグを追加'}<Plus size={13}/></button>
  {open&&createPortal(<div ref={panel} className="tag-popover" role="dialog" aria-label="タグを選択・追加" style={position} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}}}>
   <header><strong>タグを選択</strong><button aria-label="タグ選択を閉じる" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={16}/></button></header>
   <label className="tag-search"><Search size={15}/><input ref={input} aria-label="タグを検索または作成" placeholder="検索、または新しいタグを入力" maxLength={50} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(create)add();else if(matches[0])toggle(matches[0]);}}}/></label>
   <div className="tag-options">{matches.map(name=><button key={name} role="checkbox" aria-checked={value.some(tag=>normalize(tag)===normalize(name))} onClick={()=>toggle(name)}><span className="tag-check">{value.some(tag=>normalize(tag)===normalize(name))&&<Check size={15}/>}</span><TagBadge name={name}/></button>)}{!matches.length&&!create&&<p>タグがありません。</p>}{create&&<button className="tag-create" onClick={add}><Plus size={16}/><span>「{query.trim()}」を作成</span></button>}</div>
   <footer>複数選択できます。新しいタグは他のリーフでも使えます。</footer>
  </div>,document.body)}
 </div>;
}

import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {BookOpen,NotebookPen,FileText,CalendarDays,Plus,MoreHorizontal} from 'lucide-react';
import type {Page} from './data';

export const collections=[
 {kind:'book',label:'本',description:'本の読書記録と、読んで考えたこと。',icon:BookOpen},
 {kind:'paper',label:'論文',description:'論文の要点、数式、研究の手がかり。',icon:NotebookPen},
 {kind:'note',label:'ノート',description:'動画からの学びや、自分の考えをまとめる場所。',icon:FileText},
 {kind:'journal',label:'日記',description:'日々の出来事、気づき、振り返り。',icon:CalendarDays},
] as const;
type Action={label:string;icon:ReactNode;run:()=>void;description?:string;danger?:boolean;separator?:boolean};

export function ActionMenu({label,children,actions,className=''}:{label:string;children:ReactNode;actions:Action[];className?:string}){
 const element=useRef<HTMLDetailsElement>(null),summary=useRef<HTMLElement>(null),popover=useRef<HTMLDivElement>(null);
 const[open,setOpen]=useState(false);
 const[position,setPosition]=useState({left:0,top:0});
 function close(){if(element.current)element.current.open=false;}
 useLayoutEffect(()=>{if(!open||!summary.current||!popover.current)return;const anchor=summary.current.getBoundingClientRect(),menu=popover.current.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(anchor.right-menu.width,window.innerWidth-menu.width-8)),top:Math.max(8,Math.min(anchor.bottom+5,window.innerHeight-menu.height-8))});},[open]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!element.current?.contains(event.target as Node))close();};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 return <details className={'action-menu '+className} ref={element} onToggle={e=>setOpen(e.currentTarget.open)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();summary.current?.focus();}}} onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node))close();}}>
  <summary ref={summary} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}>{children}</summary>
  <div ref={popover} style={position} className="action-popover" role="menu" aria-label={label}>{actions.map(action=><button key={action.label} role="menuitem" className={(action.danger?'danger ':'')+(action.separator?'menu-separator':'')} onClick={()=>{close();action.run();}}>{action.icon}<span>{action.label}{action.description&&<small>{action.description}</small>}</span></button>)}</div>
 </details>;
}

export function NewLeafMenu({onCreate,label='リーフを作成',compact=false}:{onCreate:(kind:Page['kind'])=>void;label?:string;compact?:boolean}){
 return <ActionMenu label={label} className={compact?'new-leaf-menu compact':'new-leaf-menu'} actions={collections.map(({kind,label,description,icon:Icon})=>({label:label+'を作成',icon:<Icon size={16}/>,description,run:()=>onCreate(kind)}))}><Plus size={16}/>{!compact&&<span>{label}</span>}</ActionMenu>;
}

export function LeafMenu({title,actions,className=''}:{title:string;actions:Action[];className?:string}){
 return <ActionMenu label={title+'のメニュー'} actions={actions} className={'leaf-menu '+className}><MoreHorizontal size={17}/></ActionMenu>;
}

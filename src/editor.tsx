import React,{useEffect,useState} from 'react';
import {EditorContent, useEditor, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps} from '@tiptap/react';
import {Node,generateHTML,mergeAttributes,Editor as CoreEditor, type Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import {common,createLowlight} from 'lowlight';
import {yXmlFragmentToProsemirrorJSON,ySyncPluginKey} from 'y-prosemirror';
import Turndown from 'turndown';
import {gfm} from 'turndown-plugin-gfm';
import DOMPurify from 'dompurify';
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';
import {ArrowUpRight,Code2,Copy,Plus,Check,ChevronUp,ChevronDown} from 'lucide-react';
import {applyExactPatch} from './patch.mjs';
import {markdownHTML} from './markdown.mjs';
import {doc,pages,updatePage} from './data';
const lowlight=createLowlight(common);
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const mathDocument=mathjax.document('',{InputJax:new TeX({packages:AllPackages.filter(p=>!['require','autoload'].includes(p)),maxBuffer:50000,maxMacros:1000}),OutputJax:new SVG({fontCache:'none'})});
export function mathSVG(source:string,display=true){try{return DOMPurify.sanitize(adaptor.outerHTML(mathDocument.convert(source,{display})),{ADD_TAGS:['mjx-container']});}catch{return '<span class="math-error">数式を表示できません。元のTeXを確認してください。</span>';}}
export function cleanHTML(source:string){return DOMPurify.sanitize(markdownHTML(source),{ADD_ATTR:['data-math','data-source','data-page-embed','data-type','data-checked','data-footnote-source','data-markdown-extra']});}
export function displayMarkdown(source:string){const container=document.createElement('div');container.innerHTML=cleanHTML(source);container.querySelectorAll('[data-math]').forEach(el=>el.innerHTML=mathSVG(el.getAttribute('data-source')||'',el.getAttribute('data-math')==='block'));return container.innerHTML;}
function MathView({node,updateAttributes,selected}:NodeViewProps){const[editing,setEditing]=useState(false);const inline=node.type.name==='inlineMath';return <NodeViewWrapper as={inline?'span':'div'} className={'math-node '+(selected?'selected':'')} contentEditable={false}>
 <span role="button" tabIndex={0} title="クリックしてTeXを編集" onClick={()=>setEditing(!editing)} onKeyDown={e=>{if(e.key==='Enter')setEditing(!editing);}} dangerouslySetInnerHTML={{__html:mathSVG(node.attrs.source,!inline)}}/>
 {editing&&<span className="math-edit"><textarea aria-label="TeXソース" value={node.attrs.source} onChange={e=>updateAttributes({source:e.target.value})}/><button onClick={()=>setEditing(false)}>完了</button></span>}
 </NodeViewWrapper>;}
function equation(name:string,inline:boolean){return Node.create({name,group:inline?'inline':'block',inline,atom:true,draggable:!inline,addAttributes(){return{source:{default:'',parseHTML:el=>el.getAttribute('data-source')}};},parseHTML(){return[{tag:`${inline?'span':'div'}[data-math="${inline?'inline':'block'}"]`}]},renderHTML({HTMLAttributes}){return[inline?'span':'div',mergeAttributes({'data-math':inline?'inline':'block','data-source':HTMLAttributes.source}),HTMLAttributes.source];},addNodeView(){return ReactNodeViewRenderer(MathView);}});}
function EmbedView({node}:NodeViewProps){const[,rerender]=useState(0);useEffect(()=>{const fn=()=>rerender(n=>n+1);doc.on('update',fn);return()=>doc.off('update',fn);},[]);const page=pages.get(node.attrs.pageId);let content='';if(page&&!page.deleted){try{content=getPageHTML(page.id,false);}catch{content='';}}
 return <NodeViewWrapper className="page-embed" contentEditable={false}><button className="embed-title" onClick={()=>window.dispatchEvent(new CustomEvent('open-page',{detail:node.attrs.pageId}))}><span>↳ {page&&!page.deleted?page.title:'ページが見つかりません'}</span><ArrowUpRight size={16}/></button>{content&&<div className="embed-preview prose" dangerouslySetInnerHTML={{__html:content}}/>}</NodeViewWrapper>;
}
const PageEmbed=Node.create({name:'pageEmbed',group:'block',atom:true,draggable:true,addAttributes(){return{pageId:{default:'',parseHTML:el=>el.getAttribute('data-page-embed')}};},parseHTML(){return[{tag:'div[data-page-embed]'}]},renderHTML({HTMLAttributes}){return['div',{'data-page-embed':HTMLAttributes.pageId},HTMLAttributes.pageId];},addNodeView(){return ReactNodeViewRenderer(EmbedView);}});
const extraHTML=Node.create({name:'markdownExtra',group:'block',atom:true,draggable:true,addAttributes(){return{source:{default:'',parseHTML:el=>el.getAttribute('data-markdown-extra')}};},parseHTML(){return[{tag:'div[data-markdown-extra]'}]},renderHTML({HTMLAttributes}){return['div',{'data-markdown-extra':HTMLAttributes.source},HTMLAttributes.source];},addNodeView(){return ReactNodeViewRenderer(({node,updateAttributes}:NodeViewProps)=><NodeViewWrapper className="raw-block" contentEditable={false}><small>Markdown拡張</small><textarea aria-label="Markdown拡張の原文" value={node.attrs.source} onChange={e=>updateAttributes({source:e.target.value})}/><div dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(node.attrs.source.trim().startsWith('<')?node.attrs.source:markdownHTML(node.attrs.source.replace(/^\[\^[^\]]+\]:\s*/,'')))}}/></NodeViewWrapper>);}});
const FootnoteReference=Node.create({name:'footnoteReference',priority:1000,inline:true,group:'inline',atom:true,addAttributes(){return{source:{default:'[^note]',parseHTML:el=>el.getAttribute('data-footnote-source')}};},parseHTML(){return[{tag:'span[data-footnote-source]'}];},renderHTML({HTMLAttributes}){return['span',{'data-footnote-source':HTMLAttributes.source,class:'footnote-reference'},HTMLAttributes.source];}});
export function baseExtensions(){return[StarterKit.configure({history:false,codeBlock:false}),Link.configure({openOnClick:false,protocols:['https','http','mailto'],autolink:true}),Image.configure({allowBase64:true}),Highlight.configure({multicolor:true}),Underline,TextStyle,Color,Table.configure({resizable:true}),TableRow,TableCell,TableHeader,TaskList,TaskItem.configure({nested:true}),CodeBlockLowlight.configure({lowlight}),Subscript,Superscript,equation('mathBlock',false),equation('inlineMath',true),PageEmbed,extraHTML,FootnoteReference];}
const td=new Turndown({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});td.use(gfm);
td.addRule('footnote',{filter:node=>node.hasAttribute('data-footnote-source'),replacement:(_c,node)=>(node as HTMLElement).dataset.footnoteSource||''});
td.addRule('equation',{filter:node=>node.hasAttribute('data-math'),replacement:(_c,node)=>{const el=node as HTMLElement;return el.dataset.math==='inline'?`$${el.dataset.source||''}$`:`\n\n$$\n${el.dataset.source||''}\n$$\n\n`;}});
td.addRule('embed',{filter:node=>node.hasAttribute('data-page-embed'),replacement:(_c,node)=>`\n\n![[${(node as HTMLElement).dataset.pageEmbed}]]\n\n`});
td.addRule('extra',{filter:node=>node.hasAttribute('data-markdown-extra'),replacement:(_c,node)=>`\n\n${(node as HTMLElement).dataset.markdownExtra}\n\n`});
td.addRule('strike',{filter:node=>['S','DEL','STRIKE'].includes(node.nodeName),replacement:content=>`~~${content}~~`});
td.addRule('simpleTable',{filter:node=>node.nodeName==='TABLE'&&Array.from(node.querySelectorAll('td,th')).every(cell=>Number(cell.getAttribute('colspan')||1)===1&&Number(cell.getAttribute('rowspan')||1)===1),replacement:(_content,node)=>{const rows=Array.from((node as HTMLElement).querySelectorAll('tr')).map(row=>Array.from(row.children).map(cell=>td.turndown(cell.innerHTML).trim().replaceAll('|','\\|').replaceAll('\n','<br>')));if(!rows.length)return '';const head=(node as HTMLElement).querySelector('tr th');if(!head)rows.unshift(rows[0].map(()=>''));const divider=rows[0].map(()=> '---');return '\n\n'+[rows[0],divider,...rows.slice(1)].map(row=>'| '+row.join(' | ')+' |').join('\n')+'\n\n';}});
td.addRule('color',{filter:node=>node.nodeName==='SPAN'&&!!(node as HTMLElement).style.color,replacement:(content,node)=>`<span style="color:${(node as HTMLElement).style.color}">${content}</span>`});
td.addRule('mark',{filter:'mark',replacement:content=>`==${content}==`});
td.addRule('sub',{filter:'sub',replacement:content=>`~${content}~`});td.addRule('sup',{filter:'sup',replacement:content=>`^${content}^`});
td.addRule('underline',{filter:'u',replacement:content=>`<u>${content}</u>`});
td.addRule('tasks',{filter:node=>node.nodeName==='LI'&&node.hasAttribute('data-checked'),replacement:(content,node)=>`\n- [${(node as HTMLElement).dataset.checked==='true'?'x':' '}] ${content.trim()}\n`});
td.addRule('code',{filter:node=>node.nodeName==='PRE',replacement:(_c,node)=>{const code=node.firstChild as HTMLElement;const lang=code?.getAttribute('class')?.match(/language-([\w+-]+)/)?.[1]||'';const text=code?.textContent||node.textContent||'';const fence='`'.repeat(Math.max(3,...(text.match(/`+/g)||[]).map(v=>v.length+1)));return`\n\n${fence}${lang}\n${text.replace(/\n$/,'')}\n${fence}\n\n`;}});
export function htmlToMarkdown(html:string){return td.turndown(html);}
export function getPageHTML(id:string,preview=true){const fragment=doc.getXmlFragment('page:'+id);if(!fragment.length)return cleanHTML(doc.getMap<string>('seeds').get(id)||'');let html=generateHTML(yXmlFragmentToProsemirrorJSON(fragment),baseExtensions());if(!preview){const container=document.createElement('div');container.innerHTML=html;container.querySelectorAll('[data-page-embed]').forEach(el=>el.replaceWith(document.createTextNode('↳ 関連ページ')));container.querySelectorAll('[data-math]').forEach(el=>el.innerHTML=mathSVG(el.getAttribute('data-source')||'',el.getAttribute('data-math')==='block'));html=container.innerHTML;}return DOMPurify.sanitize(html,{ADD_ATTR:['data-math','data-source','data-page-embed','data-type','data-checked','data-markdown-extra']});}
export function getPageMarkdown(id:string){return htmlToMarkdown(getPageHTML(id));}
export function applyPagePatch(id:string,before:string,after:string,live:Editor|null=null){
 const target=pages.get(id);if(!target||target.deleted)throw new Error('対象のページが見つかりません。');
 const temporary=!live;const editor=live||new CoreEditor({element:document.createElement('div'),extensions:[...baseExtensions(),Collaboration.configure({document:doc,fragment:doc.getXmlFragment('page:'+id)})]});
 try{if(!doc.getXmlFragment('page:'+id).length){const seed=doc.getMap<string>('seeds').get(id);if(seed)editor.commands.setContent(cleanHTML(seed));}
  const full=htmlToMarkdown(editor.getHTML());applyExactPatch(full,before,after);const begin=full.indexOf(before),end=begin+before.length;
  let cursor=0,first=-1,last=-1,from=-1,to=-1;
  editor.state.doc.forEach((node,offset)=>{const md=htmlToMarkdown(generateHTML({type:'doc',content:[node.toJSON()]},baseExtensions()));if(!md)return;const start=full.indexOf(md,cursor);if(start<0)return;const finish=start+md.length;cursor=finish;if(finish>begin&&start<end){if(first<0){first=start;from=offset;}last=finish;to=offset+node.nodeSize;}});
  if(first<0||last<end)throw new Error('変更対象のブロックを確認できませんでした。再提案してください。');
  const replacement=applyExactPatch(full.slice(first,last),before,after);
  if(replacement.trim())editor.commands.insertContentAt({from,to},cleanHTML(replacement));else editor.commands.deleteRange({from,to});
  updatePage(id,{});
 }finally{if(temporary)editor.destroy();}
}
export function RichEditor({pageId,onReady,onChange}:{pageId:string;onReady:(editor:Editor|null)=>void;onChange:()=>void}){
 const[slash,setSlash]=useState(false);const[embedMenu,setEmbedMenu]=useState(false);
 const editor=useEditor({extensions:[...baseExtensions(),Placeholder.configure({placeholder:'ここから書き始める。 / でブロックを追加'}),Collaboration.configure({document:doc,fragment:doc.getXmlFragment('page:'+pageId)})],editorProps:{attributes:{class:'prose','aria-label':'ノート本文'},handlePaste:(_view,event)=>{const text=event.clipboardData?.getData('text/plain');const html=event.clipboardData?.getData('text/html');if(text&&((!html&&/\n/.test(text))||/(^#{1,6}\s|\$|```|\[\[|\*\*|^- \[)/m.test(text))){event.preventDefault();editor?.commands.insertContent(cleanHTML(text));return true;}return false;},handleKeyDown:(_view,event)=>{if(event.key==='/'&&!event.metaKey&&!event.ctrlKey){setSlash(true);}if(event.key==='Escape'){setSlash(false);setEmbedMenu(false);}return false;}},onCreate:({editor})=>{if(!doc.getXmlFragment('page:'+pageId).length){const seed=doc.getMap<string>('seeds').get(pageId);if(seed)editor.commands.setContent(cleanHTML(seed));}onReady(editor);},onUpdate:({transaction})=>{if(!transaction.getMeta(ySyncPluginKey)?.isChangeOrigin)updatePage(pageId,{});onChange();}},[pageId]);
 useEffect(()=>()=>onReady(null),[pageId]);
 const run=(action:()=>void)=>{if(slash&&editor){const {from}=editor.state.selection;if(editor.state.doc.textBetween(Math.max(0,from-1),from)==='/')editor.commands.deleteRange({from:from-1,to:from});}action();setSlash(false);};
 const items=[['見出し1',()=>editor?.chain().focus().toggleHeading({level:1}).run()],['見出し2',()=>editor?.chain().focus().toggleHeading({level:2}).run()],['見出し3',()=>editor?.chain().focus().toggleHeading({level:3}).run()],['チェックリスト',()=>editor?.chain().focus().toggleTaskList().run()],['引用',()=>editor?.chain().focus().toggleBlockquote().run()],['コード',()=>editor?.chain().focus().toggleCodeBlock().run()],['数式',()=>editor?.chain().focus().insertContent({type:'mathBlock',attrs:{source:'\\sum_{k=0}^{n} \\binom{n}{k} x^k'}}).run()],['段落',()=>editor?.chain().focus().setParagraph().run()],['区切り線',()=>editor?.chain().focus().setHorizontalRule().run()],['画像',()=>{const url=window.prompt('画像のURL（https://…）');if(url&&/^https:\/\//.test(url))editor?.chain().focus().setImage({src:url}).run();}],['上付き文字',()=>editor?.chain().focus().toggleSuperscript().run()],['下付き文字',()=>editor?.chain().focus().toggleSubscript().run()],['脚注',()=>editor?.chain().focus().insertContent([{type:'footnoteReference',attrs:{source:'[^note]'}},{type:'markdownExtra',attrs:{source:'[^note]: 注釈を書く'}}]).run()],['表',()=>editor?.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()],['ページ埋め込み',()=>setEmbedMenu(true)]] as const;
 function moveBlock(direction:-1|1){if(!editor)return;const {$from}=editor.state.selection;if($from.depth<1)return;const start=$from.before(1),index=$from.index(0),node=editor.state.doc.child(index);const otherIndex=index+direction;if(otherIndex<0||otherIndex>=editor.state.doc.childCount)return;const other=editor.state.doc.child(otherIndex);const otherStart=direction===-1?start-other.nodeSize:start+node.nodeSize;const tr=editor.state.tr;if(direction===-1)tr.replaceWith(otherStart,start+node.nodeSize,[node,other]);else tr.replaceWith(start,otherStart+other.nodeSize,[other,node]);editor.view.dispatch(tr);editor.commands.focus();}
 return <><div className="toolbar" aria-label="文書の装飾">{[1,2,3].map(level=><button key={level} className={editor?.isActive('heading',{level})?'active':''} onClick={()=>editor?.chain().focus().toggleHeading({level:level as 1|2|3}).run()}>H{level}</button>)}{editor?.isActive('table')&&<><button title="行を追加" onClick={()=>editor.chain().focus().addRowAfter().run()}>行＋</button><button title="列を追加" onClick={()=>editor.chain().focus().addColumnAfter().run()}>列＋</button><button title="行を削除" onClick={()=>editor.chain().focus().deleteRow().run()}>行−</button><button title="列を削除" onClick={()=>editor.chain().focus().deleteColumn().run()}>列−</button></>}<span className="separator"/>{[['B','太字','bold'],['I','斜体','italic'],['U','下線','underline'],['S','取り消し線','strike']] .map(([text,title,name])=><button key={name} title={title} aria-label={title} className={editor?.isActive(name)?'active':''} onClick={()=>editor?.chain().focus().toggleMark(name).run()}>{text}</button>)}<button title="ハイライト" aria-label="ハイライト" onClick={()=>editor?.chain().focus().toggleHighlight({color:'#f4dc8f'}).run()}><mark>A</mark></button><label title="文字色" className="color-picker">A<input aria-label="文字色" type="color" defaultValue="#bd704b" onChange={e=>editor?.chain().focus().setColor(e.target.value).run()}/></label><button title="リンク" onClick={()=>{const url=window.prompt('リンク先URL');if(url&&/^https?:\/\//.test(url))editor?.chain().focus().setLink({href:url}).run();}}>↗</button><button title="箇条書き" onClick={()=>editor?.chain().focus().toggleBulletList().run()}>•</button><button title="番号付きリスト" onClick={()=>editor?.chain().focus().toggleOrderedList().run()}>1.</button><button title="コード" onClick={()=>editor?.chain().focus().toggleCodeBlock().run()}><Code2 size={15}/></button><button title="ブロックを上へ移動" onClick={()=>moveBlock(-1)}><ChevronUp size={16}/></button><button title="ブロックを下へ移動" onClick={()=>moveBlock(1)}><ChevronDown size={16}/></button><button title="ブロックを追加" aria-label="ブロックを追加" onClick={()=>setSlash(!slash)}><Plus size={17}/></button></div>
 {slash&&<div className="block-menu">{items.map(([name,action])=><button key={name} onClick={()=>run(action)}>{name}</button>)}</div>}
 {embedMenu&&<div className="block-menu">{[...pages.values()].filter(p=>p.id!==pageId&&!p.deleted).map(p=><button key={p.id} onClick={()=>{editor?.chain().focus().insertContent({type:'pageEmbed',attrs:{pageId:p.id}}).run();setEmbedMenu(false);}}>{p.title}</button>)}<button onClick={()=>setEmbedMenu(false)}>閉じる</button></div>}
 <EditorContent editor={editor}/><div className="editor-hint">/ ブロック追加 <span>⌘ Z 元に戻す</span><button onClick={()=>{if(editor)void navigator.clipboard.writeText(htmlToMarkdown(editor.getHTML()));}}><Copy size={12}/> Markdownをコピー</button></div></>;
}

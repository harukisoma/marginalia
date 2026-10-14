import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import tasks from 'markdown-it-task-lists';
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const markdown = new MarkdownIt({html:true,linkify:true,breaks:false}).use(footnote).use(mark).use(sub).use(sup).use(tasks,{enabled:true});
markdown.inline.ruler.before('escape','math', (state,silent)=>{
  const start=state.pos;
  const bracket=state.src.startsWith('\\(',start);
  if(!bracket && (state.src[start]!=='$' || state.src[start+1]==='$')) return false;
  const open=bracket?'\\(':'$', close=bracket?'\\)':'$';
  let end=state.src.indexOf(close,start+open.length);
  while(end>=0 && state.src[end-1]==='\\' && !bracket)end=state.src.indexOf(close,end+1);
  if(end<0 || (!bracket && /\s/.test(state.src[start+1]||'')))return false;
  if(!silent){const token=state.push('math_inline','span',0);token.content=state.src.slice(start+open.length,end);}
  state.pos=end+close.length;return true;
});
markdown.renderer.rules.math_inline=(tokens,i)=>`<span data-math="inline" data-source="${escape(tokens[i].content)}">${escape(tokens[i].content)}</span>`;
markdown.block.ruler.before('fence','math_block',(state,start,end,silent)=>{
  const pos=state.bMarks[start]+state.tShift[start];
  const opener=state.src.startsWith('$$',pos)?'$$':state.src.startsWith('\\[',pos)?'\\[':null;
  if(!opener)return false;
  const closer=opener==='$$'?'$$':'\\]'; const close=state.src.indexOf(closer,pos+2);
  if(close<0)return false;
  let last=start;while(last<end && state.eMarks[last]<close+2)last++;
  if(last>=end)return false;
  if(state.src.slice(close+2,state.eMarks[last]).trim())return false;
  if(!silent){const token=state.push('math_block','div',0);token.block=true;token.content=state.src.slice(pos+2,close).trim();token.map=[start,last+1];}
  state.line=last+1;return true;
});
markdown.renderer.rules.math_block=(tokens,i)=>`<div data-math="block" data-source="${escape(tokens[i].content)}">${escape(tokens[i].content)}</div>`;
markdown.block.ruler.before('paragraph','page_embed',(state,start,_end,silent)=>{
 const line=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]);
 const match=line.match(/^!?\[\[([\w-]+)\]\]$/);if(!match)return false;
 if(!silent){const token=state.push('page_embed','div',0);token.content=match[1];token.block=true;}
 state.line=start+1;return true;
});
markdown.renderer.rules.page_embed=(tokens,i)=>`<div data-page-embed="${escape(tokens[i].content)}">${escape(tokens[i].content)}</div>`;
markdown.renderer.rules.footnote_ref=(tokens,i)=>`<span data-footnote-source="${escape(tokens[i].meta.label ? '[^'+tokens[i].meta.label+']' : '^['+(tokens[i].content||'')+']')}">[${escape(tokens[i].meta.label||tokens[i].meta.id+1)}]</span>`;
markdown.renderer.rules.html_block=(tokens,i)=>{const raw=tokens[i].content.trim();if(/^<(?:span|mark|u|sub|sup|strong|em|s|del)(?=[ >])/i.test(raw))return markdown.render('\u2060'+raw).replace('\u2060','');return `<div data-markdown-extra="${escape(tokens[i].content)}">${escape(tokens[i].content)}</div>`;};
export function markdownHTML(source){
 const definitions=source.match(/^\[\^[^\]]+\]:[^\n]*(?:\n[ \t]{2,}[^\n]*)*/gm)||[];
 let rendered=markdown.render(source);
 if(definitions.length)rendered=rendered.replace(/<hr class="footnotes-sep">\s*<section class="footnotes">[\s\S]*?<\/section>/,definitions.map(def=>`<div data-markdown-extra="${escape(def)}">${escape(def)}</div>`).join(''));
 return rendered.replace(/<li class="task-list-item[^>]*>\s*<input([^>]+)>/g,(_m,attrs)=>`<li data-type="taskItem" data-checked="${attrs.includes('checked')}">`).replace(/<ul class="contains-task-list">/g,'<ul data-type="taskList">');
}

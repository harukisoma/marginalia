import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterLeaves,sortLeaves,groupLeaves,pageWindow,textFromBlocks,uniqueTags,searchExcerpt} from '../src/library.mjs';
import {markdownSearchText} from '../src/markdown.mjs';
import {imageKind,imageURL,imageFitsNotebook} from '../src/images.mjs';
const pages=[
 {id:'a',title:'設計メモ',kind:'note',status:'reading',tags:['研究','UI'],author:'',created:1,updated:4,parent:''},
 {id:'b',title:'読書の記録',kind:'book',status:'done',tags:['研究'],author:'Sample Author',created:2,updated:3,parent:'a'},
 {id:'c',title:'まだタグのない日記',kind:'journal',status:'unread',tags:[],author:'',created:3,updated:2,parent:''},
];
const body=id=>({a:'本文にだけある検索語と日本語 English mixed notes',b:'Reading and design',c:'振り返り'}[id]);
test('search finds body-only words, mixed languages and full-width queries together with filters',()=>{
 assert.deepEqual(filterLeaves(pages,{query:'本文にだけある ＥＮＧＬＩＳＨ',tag:'研究',status:'reading'},body).map(p=>p.id),['a']);
 assert.deepEqual(filterLeaves(pages,{query:'sample reading'},body).map(p=>p.id),['b']);
 assert.deepEqual(filterLeaves(pages,{untagged:true},body).map(p=>p.id),['c']);
 assert.deepEqual(filterLeaves(pages,{query:'検索語',status:'done'},body),[]);
 assert.deepEqual(filterLeaves(pages,{tag:'ui',kind:'note'},body).map(p=>p.id),['a']);
});
test('metadata searches do not needlessly read every body and viewing never mutates stored records',()=>{
 const baseline=JSON.stringify(pages);let reads=0;
 assert.equal(filterLeaves(pages,{},()=>{reads++;return '';}).length,3);assert.equal(reads,0);
 filterLeaves(pages,{query:'研究'},()=>{reads++;return '';});assert.equal(reads,1);
 sortLeaves(pages,'title');groupLeaves(pages,'status');pageWindow(pages,7,2);
 assert.equal(JSON.stringify(pages),baseline);
});
test('large libraries are stably ordered, grouped and paginated without losing or duplicating leaves',()=>{
 const many=Array.from({length:1003},(_,index)=>({...pages[index%3],id:String(index).padStart(4,'0'),updated:index}));
 const ordered=groupLeaves(sortLeaves(many),'status').flatMap(group=>group.pages);
 const collected=[];for(let page=1;page<=34;page++)collected.push(...pageWindow(ordered,page,30).items);
 assert.equal(collected.length,1003);assert.equal(new Set(collected.map(p=>p.id)).size,1003);
 assert.equal(pageWindow(ordered,999).current,34);assert.equal(pageWindow([],9).current,1);
 assert.deepEqual(groupLeaves(pages,'parent',id=>pages.find(p=>p.id===id)).map(group=>group.label),['親リーフなし','設計メモ']);
});
test('search indexes retain meaningful image descriptions, code and math without base64 image payloads',()=>{
 const text=textFromBlocks({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Read me'}]},{type:'image',attrs:{src:'data:image/png;base64,private-image-bytes',alt:'図の説明'}},{type:'mathBlock',attrs:{source:'x^2'}},{type:'codeBlock',content:[{type:'text',text:'const answer = 42'}]}]});
 assert.match(text,/Read me.*図の説明.*x\^2.*const answer = 42/);assert.doesNotMatch(text,/base64|private-image/);
 assert.deepEqual(uniqueTags(['研究','研究','ＵＩ','ui','']),['ＵＩ','研究']);
 assert.match(searchExcerpt('前'.repeat(100)+'見つけたい語'+'後'.repeat(100),'見つけたい語'),/見つけたい語/);
});
test('image validation rejects executable formats and unsafe URLs and protects the notebook size limit',()=>{
 assert.equal(imageKind(new Uint8Array([137,80,78,71,13,10,26,10])),'png');
 assert.equal(imageKind(new Uint8Array([255,216,255])),'jpeg');
 assert.equal(imageKind(new TextEncoder().encode('GIF89a')),'gif');
 assert.equal(imageKind(new TextEncoder().encode('<svg onload="bad()">')),null);
 assert.equal(imageURL('https://images.example/test.png'),'https://images.example/test.png');
 for(const value of ['javascript:bad()','data:image/png;base64,anything','http://example.com/image.png','https://name:password@example.com/image.png'])assert.equal(imageURL(value),'');
 assert.equal(imageFitsNotebook(1024,1024),true);assert.equal(imageFitsNotebook(11*1024*1024,1),false);
});

test('imported Markdown search extracts words without image URLs, base64 data or executable markup',()=>{
 const text=markdownSearchText('# 見出し\n\n本文 **重要** ![図の説明](https://images.example/private.png)\n\n![別の図](data:image/png;base64,private-bytes)\n\n```js\nconst answer = 42\n```\n\n$x^2$');
 assert.match(text,/見出し.*本文.*重要.*図の説明.*別の図.*const answer = 42.*x\^2/);
 assert.doesNotMatch(text,/images\.example|base64|private-bytes/);
});

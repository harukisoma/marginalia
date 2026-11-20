import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {taxonomyScope,leafClassifications,classificationKey,changeTaxonomy} from '../src/taxonomy.mjs';
import {filterLeaves} from '../src/library.mjs';
const book={id:'b',kind:'book',tags:['古い共通タグ'],bookGenres:['金融','SF']};
const paper={id:'p',kind:'paper',tags:['古い共通タグ'],paperMajor:'社会科学',paperMiddle:'経済学',paperMinor:'金融'};
const note={id:'n',kind:'note',tags:[],noteTypes:['Podcast','自分のアウトプット']};
const journal={id:'j',kind:'journal',tags:['消してはいけない過去のタグ']};
test('each category has its own taxonomy; journals hide old tags without mutating them',()=>{
 const pages=[book,paper,note,journal],before=JSON.stringify(pages);
 assert.deepEqual(leafClassifications(journal),[]);
 assert.deepEqual(filterLeaves(pages,{tag:classificationKey('book','bookGenres','金融')}).map(p=>p.id),['b']);
 assert.deepEqual(filterLeaves(pages,{query:'Podcast アウトプット'}).map(p=>p.id),['n']);
 assert.deepEqual(filterLeaves(pages,{tag:classificationKey('paper','paperMinor','金融',['社会科学','経済学'])}).map(p=>p.id),['p']);
 assert.equal(JSON.stringify(pages),before);
});
test('paper definitions and filters belong to their parent path; changing parents clears only dependent choices',()=>{
 assert.notEqual(taxonomyScope(paper,'paperMiddle'),taxonomyScope({...paper,paperMajor:'自然科学'},'paperMiddle'));
 assert.notEqual(taxonomyScope(paper,'paperMinor'),taxonomyScope({...paper,paperMiddle:'政治学'},'paperMinor'));
 assert.deepEqual(changeTaxonomy(paper,'paperMajor',['自然科学']),{paperMajor:'自然科学',paperMiddle:'',paperMinor:''});
 assert.deepEqual(changeTaxonomy(paper,'paperMiddle',['政治学']),{paperMiddle:'政治学',paperMinor:''});
 assert.deepEqual(changeTaxonomy(book,'bookGenres',['SF','回顧録']),{bookGenres:['SF','回顧録']});
 assert.throws(()=>changeTaxonomy(journal,'bookGenres',['金融']));assert.deepEqual(paper.tags,['古い共通タグ']);
});
test('old backup metadata and all category fields survive Yjs serialization and device merging additively',()=>{
 const a=new Y.Doc();for(const page of [book,paper,note,journal])a.getMap('pages').set(page.id,new Y.Map(Object.entries(page)));
 const bytes=Y.encodeStateAsUpdate(a),b=new Y.Doc();Y.applyUpdate(b,bytes);
 b.getMap('pages').get('b').set('bookGenres',['金融','回顧録']);a.getMap('pages').get('b').set('title','既存のタイトル');
 Y.applyUpdate(a,Y.encodeStateAsUpdate(b));Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
 assert.deepEqual(a.getMap('pages').get('b').toJSON(),{...book,bookGenres:['金融','回顧録'],title:'既存のタイトル'});
 assert.deepEqual(b.getMap('pages').get('j').toJSON(),journal);
 assert.deepEqual(b.getMap('pages').get('p').toJSON(),paper);
});

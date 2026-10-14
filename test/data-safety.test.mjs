import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as Y from 'yjs';
import {NOTEBOOK_DATABASE,RECOVERY_DATABASE,BACKUP_FORMAT,backupStateFromText} from '../src/storage.mjs';

test('releases keep the original persisted database and exported backup identity',()=>{
 assert.equal(NOTEBOOK_DATABASE,'marginalia-notebook-v1');assert.equal(BACKUP_FORMAT,'marginalia-yjs-v1');assert.notEqual(RECOVERY_DATABASE,NOTEBOOK_DATABASE);
 assert.match(readFileSync('src/data.ts','utf8'),/IndexeddbPersistence\(NOTEBOOK_DATABASE,\s*doc\)/);
 assert.match(readFileSync('src/data.ts','utf8'),/getMap[^\n]+\('pages'\)/);
 const source=readdirSync('src').filter(name=>/\.(tsx?|mjs)$/.test(name)).map(name=>readFileSync('src/'+name,'utf8')).join('\n');
 assert.doesNotMatch(source,/indexedDB\.deleteDatabase|localStorage\.clear\s*\(|sessionStorage\.clear\s*\(|pages\.clear\s*\(/);
 assert.doesNotMatch(readFileSync('supabase/schema.sql','utf8'),/drop\s+table|truncate\s+(?:table\s+)?(?:public\.)?notebooks|delete\s+from\s+(?:public\.)?notebooks/i);
});
test('an independent checkpoint retains old content and metadata after live edits and deletion',()=>{
 const current=new Y.Doc(),pages=current.getMap('pages'),page=new Y.Map();for(const[key,value]of Object.entries({id:'retained-id',title:'読書録',kind:'paper',tags:['研究'],deleted:false}))page.set(key,value);pages.set('retained-id',page);const block=new Y.XmlElement('paragraph'),text=new Y.XmlText();text.insert(0,'保存済みの数式 $x^2$ とコード');block.insert(0,[text]);current.getXmlFragment('page:retained-id').insert(0,[block]);
 const state=backupStateFromText(JSON.stringify({format:'marginalia-yjs-v1',state:Array.from(Y.encodeStateAsUpdate(current))}));text.delete(0,text.length);text.insert(0,'変更後');page.set('deleted',true);
 const recovery=new Y.Doc();Y.applyUpdate(recovery,state);assert.equal(recovery.getMap('pages').get('retained-id').get('deleted'),false);assert.equal(recovery.getMap('pages').get('retained-id').get('title'),'読書録');assert.match(recovery.getXmlFragment('page:retained-id').toString(),/保存済みの数式/);assert.match(current.getXmlFragment('page:retained-id').toString(),/変更後/);
 current.destroy();recovery.destroy();
});
test('invalid backup bytes are rejected before any current document is touched',()=>{for(const state of [[256],[-1],[1.5],['1'],null])assert.throws(()=>backupStateFromText(JSON.stringify({format:BACKUP_FORMAT,state})));assert.throws(()=>backupStateFromText(JSON.stringify({format:'unknown',state:[]})));});
test('a frozen v1 fixture keeps legacy IDs, metadata, TeX, code and color attributes',()=>{const old=new Y.Doc();Y.applyUpdate(old,backupStateFromText(readFileSync('test/fixtures/notebook-v1.json','utf8')));assert.equal(old.getMap('pages').get('legacy-paper-v1').title,'旧形式の読書録');const nodes=old.getXmlFragment('page:legacy-paper-v1').toArray();assert.equal(nodes[1].get(0).toDelta()[0].attributes.textStyle.color,'rgb(165, 94, 70)');assert.match(nodes[2].getAttribute('source'),/\\begin\{pmatrix\}/);assert.match(nodes[3].toString(),/return x \*\* 2/);old.destroy();});

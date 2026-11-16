import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as Y from 'yjs';
import {copyLeafBody,expiredRollingSnapshots,inspectNotebookUpdate} from '../src/preservation.mjs';
import {NOTEBOOK_DATABASE,RECOVERY_DATABASE,BACKUP_FORMAT,backupStateFromText} from '../src/storage.mjs';

test('releases keep the original persisted database and exported backup identity',()=>{
 assert.equal(NOTEBOOK_DATABASE,'marginalia-notebook-v1');assert.equal(BACKUP_FORMAT,'marginalia-yjs-v1');assert.notEqual(RECOVERY_DATABASE,NOTEBOOK_DATABASE);
 assert.match(readFileSync('src/data.ts','utf8'),/IndexeddbPersistence\(NOTEBOOK_DATABASE,\s*doc\)/);
 assert.match(readFileSync('src/data.ts','utf8'),/getMap[^\n]+\('pages'\)/);
 const source=readdirSync('src').filter(name=>/\.(tsx?|mjs)$/.test(name)).map(name=>readFileSync('src/'+name,'utf8')).join('\n');
 assert.doesNotMatch(source,/(?:pageMap|pages)\s*\.\s*delete\s*\(/);
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


test('rolling retention keeps pre-update, pre-sync and legacy safety copies',()=>{
 const fixed=[
  {id:'old-update',created:0,reason:'アプリ更新前'},
  {id:'first-sync',created:1,reason:'初回同期前',protected:true},
  {id:'old-trash',created:2,reason:'リーフをゴミ箱へ移す前'},
 ];
 const rolling=Array.from({length:33},(_,index)=>({id:'rolling-'+index,created:10+index,reason:'自動保存'}));
 assert.deepEqual(expiredRollingSnapshots([...fixed,...rolling]),['rolling-2','rolling-1','rolling-0']);
});

test('recovery copies structured content and keeps the original record intact',()=>{
 const source=new Y.Doc(),destination=new Y.Doc();
 const state=backupStateFromText(readFileSync('test/fixtures/notebook-v1.json','utf8'));
 Y.applyUpdate(source,state);
 Y.applyUpdate(destination,state);
 copyLeafBody(source,destination,'legacy-paper-v1','restored-leaf');
 const before=source.getXmlFragment('page:legacy-paper-v1').toJSON();
 const restored=destination.getXmlFragment('page:restored-leaf');
 assert.equal(restored.toJSON(),before);
 assert.deepEqual(restored.toArray()[1].get(0).toDelta(),source.getXmlFragment('page:legacy-paper-v1').toArray()[1].get(0).toDelta());
 restored.delete(0,1);
 assert.equal(destination.getXmlFragment('page:legacy-paper-v1').toJSON(),before);
 source.destroy();
 destination.destroy();
});

test('legacy metadata and populated journal bodies survive a staged sync inspection',()=>{
 const local=new Y.Doc(),remote=new Y.Doc();
 local.getMap('pages').set('journal-v1',{id:'journal-v1',kind:'journal',title:'旧形式の日記'});
 const fragment=local.getXmlFragment('page:journal-v1');
 const paragraph=new Y.XmlElement('paragraph');
 const text=new Y.XmlText();
 text.insert(0,'昨日の記録');
 paragraph.insert(0,[text]);
 fragment.insert(0,[paragraph]);
 const current=Y.encodeStateAsUpdate(local);
 Y.applyUpdate(remote,current);
 const remoteBody=remote.getXmlFragment('page:journal-v1');
 remoteBody.delete(0,1);
 remoteBody.insert(0,[new Y.XmlElement('paragraph')]);
 assert.equal(inspectNotebookUpdate(local,current,Y.encodeStateAsUpdate(remote)),'archive');
 assert.match(fragment.toString(),/昨日の記録/);
 remote.getMap('pages').delete('journal-v1');
 assert.equal(inspectNotebookUpdate(local,current,Y.encodeStateAsUpdate(remote)),'block');
 assert.equal(local.getMap('pages').get('journal-v1').kind,'journal');
 local.destroy();
 remote.destroy();
});

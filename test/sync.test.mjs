import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as Y from 'yjs';
import {emailLinkCredentials} from '../src/cloud-auth.mjs';

// Execute the actual TypeScript sync class with synthetic documents and a
// compare-and-swap server. No production auth, storage or notebook is accessed.
const source=ts.transpileModule(readFileSync('src/sync.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 .replace(/import .* from '@supabase\/supabase-js';/, 'const createClient=()=>globalThis.syncFixture.client;')
 .replace(/import \* as Y from 'yjs';/, `import * as Y from '${import.meta.resolve('yjs')}';`)
 .replace(/import \{ doc \} from '.\/data';/, 'const doc=globalThis.syncFixture.doc;')
 .replace('./preservation.mjs',import.meta.resolve('../src/preservation.mjs'))
 .replace('./sync-network.mjs',import.meta.resolve('../src/sync-network.mjs'));
let counter=0;
function fixture(server={state:null,revision:0}){
 const doc=new Y.Doc(),states=[];let session={access_token:'synthetic-access',user:{id:'synthetic-owner',email:'synthetic@example.invalid'}},readHook=null,saveHook=null,protectHook=null,sessionHook=null;
 const events=new EventTarget(),storage=new Map();globalThis.window=events;globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 const client={auth:{getSession:async()=>{if(sessionHook)await sessionHook();return {data:{session}};},stopAutoRefresh(){}},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:async()=>{},from:()=>({select(){return this;},eq(){return this;},setHeader(){return this;},retry(){return this;},abortSignal(){return this;},async maybeSingle(){if(readHook)await readHook();return {data:server.state?{...server}:null};}}),rpc:(_name,args)=>({setHeader(){return this;},retry(){return this;},abortSignal:async()=>{if(saveHook)await saveHook();if(args.expected_revision!==server.revision)return {error:{code:server.conflictCode||'40001'}};server.state=args.new_state;server.revision++;return {};}})};
 globalThis.syncFixture={client,doc};
 return {doc,states,storage,server,setSession:value=>session=value,setSessionHook:value=>sessionHook=value,setReadHook:value=>readHook=value,setSaveHook:value=>saveHook=value,setProtectHook:value=>protectHook=value,async create(){const {CloudSync}=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// '+counter++).toString('base64'));return new CloudSync({url:'',key:''},(state,error)=>states.push({state,error}),async reason=>{if(protectHook)await protectHook(reason);});}};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('two devices merge offline changes through the cloud without losing either leaf',async()=>{
 const server={state:null,revision:0},a=fixture(server);a.doc.getMap('pages').set('a','device A');const first=await a.create();await first.start();first.stop();
 const b=fixture(server);b.doc.getMap('pages').set('b','device B');const second=await b.create();await second.start();assert.equal(b.doc.getMap('pages').size,2);second.stop();
 const c=fixture(server),third=await c.create();await third.start();assert.equal(c.doc.getMap('pages').get('a'),'device A');assert.equal(c.doc.getMap('pages').get('b'),'device B');assert.equal(c.states.at(-1).state,'synced');third.stop();
});
test('stopping during an outstanding cloud read cannot save or report success',async()=>{const f=fixture(),sync=await f.create(),gate=deferred();f.setReadHook(()=>gate.promise);const starting=sync.start();await new Promise(r=>setImmediate(r));sync.stop();gate.resolve();await starting;assert.equal(f.server.revision,0);assert.equal(sync.timer,undefined);assert.equal(f.states.some(s=>s.state==='synced'),false);});
test('pause stops cloud writes, and the same signed-in client can resume',async()=>{const f=fixture(),sync=await f.create();await sync.start();sync.pause();f.doc.getMap('pages').set('offline','kept');const revision=f.server.revision;await sync.flush();assert.equal(f.server.revision,revision);await sync.start();assert.equal(f.server.revision,revision+1);sync.stop();});
test('account mismatch is rejected before sending notebook data',async()=>{const f=fixture(),sync=await f.create();f.storage.set('marginalia-sync-owner','another-account');await assert.rejects(sync.start(),/別のアカウント/);assert.equal(f.server.revision,0);assert.equal(sync.timer,undefined);sync.stop();});
test('returning to the app downloads remote changes without an edit',async()=>{const f=fixture(),sync=await f.create();await sync.start();const remote=new Y.Doc();Y.applyUpdate(remote,Uint8Array.from(atob(f.server.state),c=>c.charCodeAt(0)));remote.getMap('pages').set('remote','new');f.server.state=Buffer.from(Y.encodeStateAsUpdate(remote)).toString('base64');f.server.revision++;window.dispatchEvent(new Event('focus'));await new Promise(r=>setImmediate(r));assert.equal(f.doc.getMap('pages').get('remote'),'new');sync.stop();});
test('temporary server error preserves local edits and retries',async()=>{const f=fixture(),sync=await f.create();f.doc.getMap('pages').set('local','preserved');f.setReadHook(()=>{throw new Error('network unavailable');});await sync.start();assert.equal(f.states.at(-1).state,'error');assert.equal(f.doc.getMap('pages').get('local'),'preserved');f.setReadHook(null);await sync.flush();assert.equal(f.states.at(-1).state,'synced');sync.stop();});
test('revision conflict reloads and merges before retrying',async()=>{const f=fixture(),sync=await f.create();f.doc.getMap('pages').set('local','kept');let once=true;f.setSaveHook(()=>{if(!once)return;once=false;const remote=new Y.Doc();remote.getMap('pages').set('remote','kept');f.server.state=Buffer.from(Y.encodeStateAsUpdate(remote)).toString('base64');f.server.revision++;});await sync.start();assert.equal(f.doc.getMap('pages').size,2);assert.equal(f.states.at(-1).state,'synced');sync.stop();});


test('signing back in starts syncing even while the signed-out request is still winding down',async()=>{
 const f=fixture(),sync=await f.create();
 const gate=deferred();
 f.setReadHook(()=>gate.promise);
 const first=sync.start();
 await new Promise(r=>setImmediate(r));
 sync.pause();
 f.setReadHook(null);
 f.doc.getMap('pages').set('after','still here');
 await sync.start();
 assert.equal(f.server.revision,1);
 gate.resolve();
 await first;
 assert.equal(f.server.revision,1);
 assert.equal(f.states.at(-1).state,'synced');
 sync.stop();
});

test('manual refresh waits for an in-progress sync',async()=>{
 const f=fixture(),sync=await f.create();
 await sync.start();
 const gate=deferred();
 f.setReadHook(()=>gate.promise);
 let finished=false;
 const background=sync.flush();
 const manual=sync.flush().then(()=>{finished=true;});
 await new Promise(r=>setImmediate(r));
 assert.equal(finished,false);
 gate.resolve();
 await Promise.all([background,manual]);
 assert.equal(finished,true);
 sync.stop();
});

test('email links redeem only against the configured auth endpoint',()=>{
 const project='https://notebook.example.invalid';
 const link=project+'/auth/v1/verify?token=synthetic&type=magiclink';
 assert.deepEqual(emailLinkCredentials(link,project),{token_hash:'synthetic',type:'email'});
 assert.throws(()=>emailLinkCredentials(link,'https://another.example.invalid'));
 assert.throws(()=>emailLinkCredentials(link.replace('/verify','/other'),project));
 assert.throws(()=>emailLinkCredentials(link.replace('magiclink','recovery'),project));
});


test('sync never writes the notebook under a newly active account',async()=>{
 const f=fixture(),sync=await f.create();
 await sync.start();
 const revision=f.server.revision;
 f.setSession({access_token:'other-access',user:{id:'other-owner',email:'other@example.invalid'}});
 f.doc.getMap('pages').set('private','stays local');
 await sync.flush();
 assert.equal(f.server.revision,revision);
 sync.stop();
});


test('the first sync awaits a durable backup of unsynced journal entries',async()=>{
 const f=fixture(),sync=await f.create(),saved=deferred();
 const journal={id:'local',title:'端末の日記',kind:'journal'};
 f.doc.getMap('pages').set(journal.id,journal);
 f.setProtectHook(reason=>{assert.equal(reason,'初回同期前');return saved.promise;});
 const starting=sync.start();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.server.revision,0);
 assert.equal(f.storage.has('marginalia-sync-owner'),false);
 saved.resolve();
 await starting;
 assert.equal(f.server.revision,1);
 sync.stop();
});

test('failed backup prevents the first sync from uploading or mutating records',async()=>{
 const f=fixture(),sync=await f.create();
 f.doc.getMap('pages').set('local',{id:'local',kind:'journal'});
 f.setProtectHook(()=>{throw new Error('storage full');});
 await assert.rejects(sync.start(),/storage full/);
 assert.equal(f.server.revision,0);
 assert.equal(f.doc.getMap('pages').get('local').kind,'journal');
 sync.stop();
});

test('an incoming hard deletion cannot reach the notebook or be written back',async()=>{
 const f=fixture(),sync=await f.create();
 f.doc.getMap('pages').set('journal',{id:'journal',kind:'journal'});
 await sync.start();
 const remote=new Y.Doc();
 Y.applyUpdate(remote,Buffer.from(f.server.state,'base64'));
 remote.getMap('pages').delete('journal');
 f.server.state=Buffer.from(Y.encodeStateAsUpdate(remote)).toString('base64');
 const revision=++f.server.revision;
 await sync.flush();
 assert.equal(f.states.at(-1).state,'error');
 assert.equal(f.doc.getMap('pages').get('journal').kind,'journal');
 assert.equal(f.server.revision,revision);
 remote.destroy();
 sync.stop();
});

test('sync waits for archival before applying a recoverable trash operation',async()=>{
 const f=fixture(),sync=await f.create();
 const journal=new Y.Map(Object.entries({id:'journal',kind:'journal'}));
 f.doc.getMap('pages').set('journal',journal);
 await sync.start();
 const remote=new Y.Doc();
 Y.applyUpdate(remote,Buffer.from(f.server.state,'base64'));
 remote.getMap('pages').get('journal').set('deleted',true);
 f.server.state=Buffer.from(Y.encodeStateAsUpdate(remote)).toString('base64');
 f.server.revision++;
 const archived=deferred();
 f.setProtectHook(()=>archived.promise);
 const syncing=sync.flush();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(journal.get('deleted'),undefined);
 archived.resolve();
 await syncing;
 assert.equal(journal.get('deleted'),true);
 remote.destroy();
 sync.stop();
});


test('HTTP 409 conflicts merge the newer cloud revision without any notebook loss',async()=>{
 const server={state:null,revision:0,conflictCode:'PT409'},f=fixture(server),sync=await f.create();
 f.doc.getMap('pages').set('phone','unsynced phone entry');let first=true;
 f.setSaveHook(()=>{if(!first)return;first=false;const remote=new Y.Doc();remote.getMap('pages').set('mac','unsynced Mac entry');server.state=Buffer.from(Y.encodeStateAsUpdate(remote)).toString('base64');server.revision++;remote.destroy();});
 await sync.start();assert.equal(f.states.at(-1).state,'synced');assert.equal(f.doc.getMap('pages').get('phone'),'unsynced phone entry');assert.equal(f.doc.getMap('pages').get('mac'),'unsynced Mac entry');sync.stop();
});
test('a server outage backs off automatic polling while manual retry recovers the same signed-in session',async()=>{
 const f=fixture(),sync=await f.create();let reads=0;
 f.doc.getMap('pages').set('phone','saved locally');
 f.setReadHook(()=>{reads++;throw Object.assign(new Error('Could not query database for schema cache'),{code:'PGRST002'});});
 await sync.start();assert.equal(reads,1);assert.equal(f.server.revision,0);assert.match(f.states.at(-1).error,/この端末の記録は保存/);
 await sync.flush(false);assert.equal(reads,1);assert.equal(sync.failures,1);assert.ok(sync.nextAttempt>Date.now());
 f.setReadHook(()=>{reads++;});await sync.flush();assert.equal(reads,2);assert.equal(f.states.at(-1).state,'synced');assert.equal(f.doc.getMap('pages').get('phone'),'saved locally');assert.equal(sync.failures,0);sync.stop();
});
test('a lost save response is recovered by rereading the committed notebook before another write',async()=>{
 const f=fixture(),sync=await f.create();let writes=0;
 f.doc.getMap('pages').set('phone','must survive a timeout');
 f.setSaveHook(()=>{writes++;f.server.state=Buffer.from(Y.encodeStateAsUpdate(f.doc)).toString('base64');f.server.revision++;throw new DOMException('The operation timed out.','TimeoutError');});
 await sync.start();assert.match(f.states.at(-1).error,/自動で再試行/);assert.equal(writes,1);
 await sync.flush();assert.equal(f.states.at(-1).state,'synced');assert.equal(writes,1);assert.equal(f.server.revision,1);sync.stop();
});
test('stopping during a stuck auth operation releases the start attempt and prevents late writes',async()=>{
 const f=fixture(),sync=await f.create(),gate=deferred();f.setSessionHook(()=>gate.promise);
 const starting=sync.start();await new Promise(resolve=>setImmediate(resolve));sync.stop();assert.equal(await starting,false);gate.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.server.revision,0);assert.equal(f.states.some(s=>s.state==='synced'),false);
});
test('edits made while a previous version is uploading are included before reporting synced',async()=>{
 const f=fixture(),sync=await f.create(),gate=deferred();f.doc.getMap('pages').set('first','kept');let once=true;
 f.setSaveHook(()=>{if(once){once=false;return gate.promise;}});const starting=sync.start();await new Promise(resolve=>setImmediate(resolve));f.doc.getMap('pages').set('during-upload','also kept');gate.resolve();await starting;
 const remote=new Y.Doc();Y.applyUpdate(remote,Buffer.from(f.server.state,'base64'));assert.equal(remote.getMap('pages').get('first'),'kept');assert.equal(remote.getMap('pages').get('during-upload'),'also kept');assert.equal(f.states.at(-1).state,'synced');remote.destroy();sync.stop();
});


test('coming online bypasses outage backoff and resumes without logging out',async()=>{
 const f=fixture(),sync=await f.create();f.doc.getMap('pages').set('phone','offline note');
 f.setReadHook(()=>{throw new Error('network unavailable');});await sync.start();assert.ok(sync.nextAttempt>Date.now());
 f.setReadHook(null);window.dispatchEvent(new Event('online'));await sync.flush();assert.equal(f.states.at(-1).state,'synced');assert.equal(f.doc.getMap('pages').get('phone'),'offline note');sync.stop();
});

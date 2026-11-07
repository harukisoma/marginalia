import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as Y from 'yjs';

// Execute the actual TypeScript sync class with synthetic documents and a
// compare-and-swap server. No production auth, storage or notebook is accessed.
const source=ts.transpileModule(readFileSync('src/sync.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 .replace(/import .* from '@supabase\/supabase-js';/, 'const createClient=()=>globalThis.syncFixture.client;')
 .replace(/import \* as Y from 'yjs';/, `import * as Y from '${import.meta.resolve('yjs')}';`)
 .replace(/import \{ doc \} from '.\/data';/, 'const doc=globalThis.syncFixture.doc;');
let counter=0;
function fixture(server={state:null,revision:0}){
 const doc=new Y.Doc(),states=[];let session={user:{id:'synthetic-owner',email:'synthetic@example.invalid'}},readHook=null,saveHook=null;
 const events=new EventTarget(),storage=new Map();globalThis.window=events;globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 const client={auth:{getSession:async()=>({data:{session}}),stopAutoRefresh(){}},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:async()=>{},from:()=>({select(){return this;},eq(){return this;},abortSignal(){return this;},async maybeSingle(){if(readHook)await readHook();return {data:server.state?{...server}:null};}}),rpc:(_name,args)=>({abortSignal:async()=>{if(saveHook)await saveHook();if(args.expected_revision!==server.revision)return {error:{code:'40001'}};server.state=args.new_state;server.revision++;return {};}})};
 globalThis.syncFixture={client,doc};
 return {doc,states,storage,server,setSession:value=>session=value,setReadHook:value=>readHook=value,setSaveHook:value=>saveHook=value,async create(){const {CloudSync}=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// '+counter++).toString('base64'));return new CloudSync({url:'',key:''},(state,error)=>states.push({state,error}));}};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('two devices merge offline changes through the cloud without losing either leaf',async()=>{
 const server={state:null,revision:0},a=fixture(server);a.doc.getMap('pages').set('a','device A');const first=await a.create();await first.start();first.stop();
 const b=fixture(server);b.doc.getMap('pages').set('b','device B');const second=await b.create();await second.start();assert.equal(b.doc.getMap('pages').size,2);second.stop();
 const c=fixture(server),third=await c.create();await third.start();assert.equal(c.doc.getMap('pages').get('a'),'device A');assert.equal(c.doc.getMap('pages').get('b'),'device B');assert.equal(c.states.at(-1).state,'synced');third.stop();
});
test('stopping during an outstanding cloud read cannot save or report success',async()=>{const f=fixture(),sync=await f.create(),gate=deferred();f.setReadHook(()=>gate.promise);const starting=sync.start();await new Promise(r=>setImmediate(r));sync.stop();gate.resolve();await starting;assert.equal(f.server.revision,0);assert.equal(sync.timer,undefined);assert.equal(f.states.some(s=>s.state==='synced'),false);});
test('pause stops cloud writes, and the same signed-in client can resume',async()=>{const f=fixture(),sync=await f.create();await sync.start();sync.pause();f.doc.getMap('pages').set('offline','kept');const revision=f.server.revision;await sync.flush();assert.equal(f.server.revision,revision);await sync.start();assert.equal(f.server.revision,revision+1);sync.stop();});
test('account mismatch is rejected before sending notebook data',async()=>{const f=fixture(),sync=await f.create();f.storage.set('marginalia-sync-owner','another-account');await assert.rejects(sync.start(),/別アカウント/);assert.equal(f.server.revision,0);assert.equal(sync.timer,undefined);sync.stop();});
test('returning to the app downloads remote changes without an edit',async()=>{const f=fixture(),sync=await f.create();await sync.start();const remote=new Y.Doc();Y.applyUpdate(remote,Uint8Array.from(atob(f.server.state),c=>c.charCodeAt(0)));remote.getMap('pages').set('remote','new');f.server.state=Buffer.from(Y.encodeStateAsUpdate(remote)).toString('base64');f.server.revision++;window.dispatchEvent(new Event('focus'));await new Promise(r=>setImmediate(r));assert.equal(f.doc.getMap('pages').get('remote'),'new');sync.stop();});
test('temporary server error preserves local edits and retries',async()=>{const f=fixture(),sync=await f.create();f.doc.getMap('pages').set('local','preserved');f.setReadHook(()=>{throw new Error('network unavailable');});await sync.start();assert.equal(f.states.at(-1).state,'error');assert.equal(f.doc.getMap('pages').get('local'),'preserved');f.setReadHook(null);await sync.flush();assert.equal(f.states.at(-1).state,'synced');sync.stop();});
test('revision conflict reloads and merges before retrying',async()=>{const f=fixture(),sync=await f.create();f.doc.getMap('pages').set('local','kept');let once=true;f.setSaveHook(()=>{if(!once)return;once=false;const remote=new Y.Doc();remote.getMap('pages').set('remote','kept');f.server.state=Buffer.from(Y.encodeStateAsUpdate(remote)).toString('base64');f.server.revision++;});await sync.start();assert.equal(f.doc.getMap('pages').size,2);assert.equal(f.states.at(-1).state,'synced');sync.stop();});

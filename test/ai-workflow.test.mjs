import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInference} from '../server/inference.mjs';
import {prepareAIInput,requestRelay,abortableDelay,readChatStream} from '../src/ai-request.mjs';
import {requestCompanion} from '../src/ai-connect.mjs';
import {planExactPatches} from '../src/patch.mjs';
const input={prompt:'誤字だけを直してください',context:[{id:'synthetic',title:'Synthetic',markdown:'読みずらい文章\n\n変更しない段落'}],history:[],model:'gpt-6.2-sol'};
const result={answer:'修正案です',references:['synthetic'],edits:[{pageId:'synthetic',before:'読みずらい',after:'読みづらい',reason:'誤字'}]};
const frame=event=>new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n');
test('small tasks request low reasoning, bounded history and text context without embedded binary',async()=>{
 let sent;
 const inference=createInference({accessToken:async()=>'synthetic-token',request:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,body:(async function*(){yield frame({type:'response.output_text.delta',delta:JSON.stringify(result)});yield frame({type:'response.completed'});})()};}});
 assert.deepEqual(await inference({...input,context:[{...input.context[0],markdown:input.context[0].markdown+'\n![picture](data:image/png;base64,'+'a'.repeat(2000000)+')'}],history:Array.from({length:30},()=>({role:'user',content:'x'.repeat(4000)}))}),result);
 assert.equal(sent.reasoning.effort,'low');assert.equal(sent.store,false);assert.equal(sent.stream,true);assert.ok(JSON.stringify(sent).length<20000);assert.match(sent.input.at(-1).content,/marginalia-embedded-image/);
 assert.throws(()=>prepareAIInput({...input,context:[{...input.context[0],markdown:'x'.repeat(180001)}]}),/参照する本文/);
});
test('an active stream can run past the idle limit; a silent or canceled stream stops upstream',async()=>{
 const make=(active)=>createInference({accessToken:async()=>'synthetic',idleMs:500,maxMs:5000,request:async(_url,{signal})=>({ok:true,body:(async function*(){for(let i=0;i<6;i++){await abortableDelay(active?150:5000,signal);yield frame({type:'response.in_progress'});}yield frame({type:'response.output_text.delta',delta:JSON.stringify(result)});yield frame({type:'response.completed'});})()})});
 assert.deepEqual(await make(true)(input),result);
 await assert.rejects(()=>make(false)(input),error=>error.name==='TimeoutError');
 const controller=new AbortController();setTimeout(()=>controller.abort(),10);
 await assert.rejects(()=>make(false)(input,{signal:controller.signal}),error=>error.name==='AbortError');
});
test('local streaming reports progress and returns only a complete result; abort is not disguised as login failure',async()=>{
 const updates=[];const ndjson=[{type:'progress',message:'受信中'},{type:'result',result}].map(e=>JSON.stringify(e)+'\n').join('');
 const response=new Response(ndjson,{headers:{'content-type':'application/x-ndjson'}});
 assert.deepEqual(await readChatStream(response,message=>updates.push(message)),result);assert.deepEqual(updates,['受信中']);
 await assert.rejects(()=>readChatStream(new Response('{"type":"progress","message":"wait"}\n')),/途中で切れ/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>requestCompanion('http://127.0.0.1:4318','synthetic','chat',input,async()=>{throw controller.signal.reason;},{signal:controller.signal}),error=>error.name==='AbortError');
});
function fakeRelay(initial){
 const row={status:'queued',updated_at:'initial',...initial};const writes=[];
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'synthetic'}}}})},from(){const filters=[];return {insert:async data=>{Object.assign(row,data);return {};},select(){return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},in(k,values){filters.push(r=>values.includes(r[k]));return this;},update(data){this.write=data;return this;},async single(){return {data:{...row}};},then(resolve){if(this.write&&filters.every(f=>f(row))){writes.push(this.write);Object.assign(row,this.write);}resolve({data:[row],error:null});}};}};
 return {client,row,writes};
}
test('relay cancellation terminates queued/running jobs and cannot overwrite a completed result',async()=>{
 for(const status of ['queued','running','completed']){
  const {client,row,writes}=fakeRelay({status});const controller=new AbortController();
  const promise=requestRelay(client,input,{signal:controller.signal,delay:async()=>{controller.abort();throw controller.signal.reason;}});
  if(status==='completed'){assert.equal(await promise,undefined);assert.equal(writes.length,0);}
  else{await assert.rejects(()=>promise,error=>error.name==='AbortError');assert.equal(row.status,'failed');assert.equal(row.error,'中断しました。');}
 }
});
test('relay keeps waiting while heartbeat advances, but fails a stalled Mac with a retryable message',async()=>{
 const {client,row}=fakeRelay({status:'running'});let clock=0,iterations=0;
 assert.deepEqual(await requestRelay(client,input,{now:()=>clock,maxMs:700000,delay:async()=>{clock+=40000;row.updated_at=String(clock);if(++iterations===6)Object.assign(row,{status:'completed',result});}}),result);
 const stalled=fakeRelay({status:'running'});clock=0;
 await assert.rejects(()=>requestRelay(stalled.client,input,{now:()=>clock,delay:async()=>{clock+=50000;}}),/通信が途切れ/);assert.equal(stalled.row.status,'failed');
});
test('bulk patch planning rejects stale, ambiguous, overlapping and mutually destructive proposals before writing',()=>{
 const source='Alpha and Beta\n\nGamma';
 assert.deepEqual(planExactPatches(source,[{before:'Alpha',after:'A'},{before:'Beta',after:'B'}]).map(e=>e.before),['Beta','Alpha']);
 for(const edits of [[{before:'missing',after:'x'}],[{before:'Alpha and',after:'x'},{before:'and Beta',after:'y'}],[{before:'Alpha',after:'A'},{before:'Beta',after:'Alpha'}]])assert.throws(()=>planExactPatches(source,edits));
 assert.throws(()=>planExactPatches('duplicate duplicate',[{before:'duplicate',after:'x'}]));
});
test('a transport that ignores abort cannot leave inference waiting forever before generation',async()=>{
 const inference=createInference({accessToken:()=>new Promise(()=>{}),idleMs:20,maxMs:100,request:()=>{throw new Error('must not start');}});
 await assert.rejects(()=>inference(input),error=>error.name==='TimeoutError');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('src/voice-live.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('./voice-transcript.mjs',import.meta.resolve('../src/voice-transcript.mjs'));
const {startLiveVoice}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(){
 const original={window:globalThis.window,navigator:globalThis.navigator,fetch:globalThis.fetch,rtc:globalThis.RTCPeerConnection};
 const track=Object.assign(new EventTarget(),{enabled:true,stopped:false,stop(){this.stopped=true;}});
 const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 let peer,permission=Promise.resolve(stream),authorizing=Promise.resolve({value:'ek_fixture'}),model='gpt-live-transcribe';
 const texts=[],failures=[],requests=[];
 class Peer{
  constructor(){peer=this;this.connectionState='new';this.closed=false;this.sent=[];this.channel={readyState:'open',send:value=>{this.sent.push(JSON.parse(value));},close:()=>{this.channel.readyState='closed';this.channel.onclose?.();}};}
  addTrack(){} createDataChannel(){return this.channel;} async createOffer(){return {sdp:'synthetic-offer'};}
  async setLocalDescription(){} async setRemoteDescription(){this.emit({type:'session.created',session:{audio:{input:{transcription:{model}}}}});}
  emit(event){this.channel.onmessage?.({data:JSON.stringify(event)});} close(){this.closed=true;}
 }
 globalThis.window={RTCPeerConnection:Peer};globalThis.RTCPeerConnection=Peer;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>permission}}});
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response('synthetic-answer');};
 const controller=new AbortController();
 const start=()=>startLiveVoice({signal:controller.signal,authorize:async action=>action==='status'?{ready:true}:authorizing,onText:text=>texts.push(text),onFailure:(text,error)=>failures.push({text,error})});
 return {start,track,texts,failures,requests,controller,get peer(){return peer;},setPermission:value=>permission=value,setAuthorization:value=>authorizing=value,setModel:value=>model=value,restore(){globalThis.window=original.window;Object.defineProperty(globalThis,'navigator',{value:original.navigator,configurable:true});globalThis.fetch=original.fetch;globalThis.RTCPeerConnection=original.rtc;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('stopping waits for the final transcript and closes the microphone and peer',async()=>{
 const f=fixture();try{
  const session=await f.start();assert.equal(f.track.enabled,true);
  f.peer.emit({type:'conversation.item.input_audio_transcription.delta',item_id:'last',delta:'途中'});
  assert.equal(f.texts.at(-1),'途中');
  const stopping=session.stop();assert.equal(f.track.enabled,false);
  await new Promise(resolve=>setTimeout(resolve,550));
  assert.equal(f.peer.sent.at(-1).type,'input_audio_buffer.commit');
  f.peer.emit({type:'input_audio_buffer.committed',item_id:'last',previous_item_id:null});
  f.peer.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'last',transcript:'最後までの日本語と English。'});
  assert.deepEqual(await stopping,{text:'最後までの日本語と English。',incomplete:false});
  assert.equal(f.track.stopped,true);assert.equal(f.peer.closed,true);
  assert.equal(f.requests[0].options.headers.Authorization,'Bearer ek_fixture');
 }finally{f.restore();}
});
test('a failed stream preserves received text and releases the microphone',async()=>{
 const f=fixture();try{
  await f.start();f.peer.emit({type:'conversation.item.input_audio_transcription.delta',item_id:'a',delta:'残しておく文章'});
  f.peer.channel.onclose();assert.equal(f.failures[0].text,'残しておく文章');
  assert.equal(f.track.stopped,true);assert.equal(f.peer.closed,true);
 }finally{f.restore();}
});
test('closing during microphone permission also stops a stream granted later',async()=>{
 const f=fixture();try{
  let grant;f.setPermission(new Promise(resolve=>grant=resolve));const starting=f.start();await tick();f.controller.abort();grant({getTracks:()=>[f.track],getAudioTracks:()=>[f.track]});
  await assert.rejects(starting);assert.equal(f.track.stopped,true);assert.equal(f.requests.length,0);
 }finally{f.restore();}
});
test('an unrequested model is rejected before microphone audio is enabled',async()=>{
 const f=fixture();try{f.setModel('another-model');await assert.rejects(f.start(),/指定した音声モデル/);assert.equal(f.track.enabled,false);assert.equal(f.track.stopped,true);assert.equal(f.peer.closed,true);}finally{f.restore();}
});
test('a connection that becomes hidden while waiting never starts streaming microphone audio',async()=>{
 const f=fixture(),original=globalThis.document;try{
  let grant;f.setPermission(new Promise(resolve=>grant=resolve));globalThis.document={visibilityState:'visible'};
  const starting=f.start();await tick();globalThis.document.visibilityState='hidden';grant({getTracks:()=>[f.track],getAudioTracks:()=>[f.track]});
  await assert.rejects(starting,/画面が非表示/);assert.equal(f.track.stopped,true);assert.equal(f.requests.length,0);
 }finally{globalThis.document=original;f.restore();}
});

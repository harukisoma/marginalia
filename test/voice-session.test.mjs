import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('supabase/functions/voice-session/index.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {createVoiceSessionHandler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(overrides={}){
 const values={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',VOICE_ALLOWED_USER_IDS:'allowed-user',OPENAI_API_KEY:'synthetic-server-secret',...overrides};
 const calls=[];let user={id:'allowed-user'},authStatus=200,upstreamStatus=200,upstream={value:'ek_synthetic',expires_at:123};
 const handler=createVoiceSessionHandler({env:key=>values[key],fetch:async(url,options)=>{
  calls.push({url,options});
  return new Response(JSON.stringify(url.endsWith('/auth/v1/user')?user:upstream),{status:url.endsWith('/auth/v1/user')?authStatus:upstreamStatus});
 }});
 const send=(body={action:'create'},headers={})=>handler(new Request('https://synthetic.supabase.co/functions/v1/voice-session',{method:'POST',headers:{Origin:'https://harukisoma.github.io',Authorization:'Bearer synthetic-user-token','Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
 return {handler,send,calls,setUser:value=>user=value,setAuthStatus:value=>authStatus=value,setUpstream:(status,body)=>{upstreamStatus=status;upstream=body;}};
}
test('voice credentials require an allowed origin, a verified user, and the explicit account allowlist',async()=>{
 const f=fixture();
 assert.equal((await f.send({}, {Origin:'https://untrusted.invalid'})).status,403);
 assert.equal((await f.send({}, {Authorization:''})).status,401);
 assert.equal(f.calls.length,0);
 f.setAuthStatus(401);assert.equal((await f.send()).status,401);
 f.setAuthStatus(200);f.setUser({id:'other-user'});assert.equal((await f.send()).status,403);
 assert.ok(f.calls.every(call=>call.url.endsWith('/auth/v1/user')));
});
test('the server pins GPT-Live-Transcribe, both languages, high accuracy delay and a 30-second credential',async()=>{
 const f=fixture();const response=await f.send({action:'create',model:'unrequested-model',api_key:'untrusted-key'});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{value:'ek_synthetic',expires_at:123,model:'gpt-live-transcribe'});
 const call=f.calls.at(-1),body=JSON.parse(call.options.body);
 assert.equal(call.options.headers.Authorization,'Bearer synthetic-server-secret');
 assert.equal(body.expires_after.seconds,30);
 assert.equal(body.session.type,'transcription');
 assert.deepEqual(body.session.audio.input.transcription.languages,['ja','en']);
 assert.equal(body.session.audio.input.transcription.model,'gpt-live-transcribe');
 assert.equal(body.session.audio.input.transcription.delay,'high');
 assert.equal(body.session.audio.input.turn_detection,null);
});
test('missing API configuration fails closed while the readiness check never bills OpenAI',async()=>{
 const missing=fixture({OPENAI_API_KEY:undefined});assert.equal((await missing.send()).status,503);
 assert.equal(missing.calls.length,1);
 const f=fixture();const response=await f.send({action:'status'});assert.equal(response.status,200);
 assert.equal(f.calls.length,1);
 assert.equal((await fixture({VOICE_ALLOWED_USER_IDS:''}).send()).status,503);
});
test('quota failures are actionable and upstream credential details never reach the browser',async()=>{
 const f=fixture();f.setUpstream(429,{error:{code:'insufficient_quota',message:'sensitive provider details'}});
 const response=await f.send();assert.equal(response.status,429);
 const body=await response.text();assert.match(body,/billing_required/);assert.doesNotMatch(body,/sensitive|synthetic-server-secret/);
});
test('a burst of token requests is limited without blocking the free configuration check',async()=>{
 const f=fixture();for(let i=0;i<6;i++)assert.equal((await f.send()).status,200);
 assert.equal((await f.send()).status,429);
 assert.equal((await f.send({action:'status'})).status,200);
 assert.equal(f.calls.filter(call=>call.url.includes('openai.com')).length,6);
});

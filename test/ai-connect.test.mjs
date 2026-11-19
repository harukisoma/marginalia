import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionSetup,connectionReply,requestCompanion} from '../src/ai-connect.mjs';
import {setupReturn,createAttempt} from '../server/protocol.mjs';
import {companionPlist} from '../scripts/install-companion.mjs';
import {chatGPTFailure,terminalRefreshCodes} from '../server/connection-errors.mjs';
test('automatic pairing accepts only the expected loopback window, origin, nonce and expiry',()=>{
 const pending={...connectionSetup('http://127.0.0.1:4318','https://harukisoma.github.io'),popup:{}};
 const event={source:pending.popup,origin:pending.origin,data:{type:'marginalia-companion-ready',state:pending.state,pairing:'synthetic-pairing-code-'.repeat(3)}};
 assert.equal(connectionReply(event,pending),event.data.pairing);
 for(const change of [{source:{}},{origin:'https://unrelated.example'},{data:{...event.data,state:'different'}},{data:{...event.data,pairing:'short'}}])assert.equal(connectionReply({...event,...change},pending),null);
 assert.equal(connectionReply(event,pending,pending.created+600001),null);
 assert.throws(()=>connectionSetup('https://unrelated.example','https://harukisoma.github.io'));
 assert.throws(()=>connectionSetup('http://user:secret@127.0.0.1:4318','https://harukisoma.github.io'));
});
test('setup can return only to a registered app origin and never an arbitrary redirect',()=>{
 const allowed=new Set(['https://harukisoma.github.io']),input={origin:'https://harukisoma.github.io',state:'n'.repeat(36)};
 assert.deepEqual(setupReturn(input,allowed),input);
 for(const change of [{origin:'https://evil.example'},{origin:'https://harukisoma.github.io/evil'},{state:'short'},{state:['n'.repeat(36)]}])assert.throws(()=>setupReturn({...input,...change},allowed));
 assert.equal(setupReturn({},allowed),null);
 const attempt=createAttempt('host',4318,{client_id:'saved'},{setup:input,consent:true});
 assert.deepEqual(attempt.setup,input);assert.equal(new URL(attempt.url).searchParams.get('prompt'),'consent');
 assert.equal(new URL(createAttempt('host',4318,{client_id:'saved'}).url).searchParams.has('prompt'),false);
});
test('failed setup has actionable persistent errors without revealing credentials',async()=>{
 await assert.rejects(()=>requestCompanion('http://127.0.0.1:4318','','status',undefined,()=>{throw new Error('must not fetch');}),/初回接続/);
 await assert.rejects(()=>requestCompanion('http://127.0.0.1:4318','test','status',undefined,async()=>{throw new Error('network diagnostic with secret');}),error=>/Macに接続できません/.test(error.message)&&!error.message.includes('secret'));
 await assert.rejects(()=>requestCompanion('http://127.0.0.1:4318','test','status',undefined,async()=>new Response('{}',{status:401})),/接続を更新/);
 await assert.rejects(()=>requestCompanion('http://127.0.0.1:4318','test','status',undefined,async()=>new Response('<html>wrong server</html>')),/正しい応答/);
});
test('automatic startup keeps the stable runtime and suppresses connection codes in logs',()=>{
 const plist=companionPlist('/test/Marginalia & Notes','/test/node');
 assert.match(plist,/Marginalia &amp; Notes/);assert.match(plist,/<key>KeepAlive<\/key><true\/>/);
 assert.match(plist,/<key>QUIET_PAIRING<\/key><string>1<\/string>/);
 assert.match(plist,/\.runtime\/companion\.log/);assert.doesNotMatch(plist,/access_token|refresh_token|marginalia-pairing/);
});
test('expired credentials, declined eligibility, limits and temporary outages have distinct recovery paths',()=>{
 assert.match(chatGPTFailure(401,'invalid_grant'),/ログインし直して/);
 assert.match(chatGPTFailure(403,'subscription_sharing_user_not_eligible'),/ワークスペース/);
 assert.match(chatGPTFailure(429,'subscription_sharing_usage_limit_exceeded'),/利用上限/);
 assert.match(chatGPTFailure(503,'subscription_sharing_user_unavailable'),/認証情報は保持/);
 assert.equal(terminalRefreshCodes.has('invalid_grant'),true);
 assert.equal(terminalRefreshCodes.has('subscription_sharing_user_unavailable'),false);
});

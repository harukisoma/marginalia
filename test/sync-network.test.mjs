import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {boundedSync,syncIssue,syncRetryDelay} from '../src/sync-network.mjs';
test('sync failures identify service outages, timeouts and login errors without exposing opaque transport text',()=>{
 for(const error of [{code:'PGRST002',message:'unavailable'},new DOMException('The operation timed out.','TimeoutError'),{message:'TimeoutError: The operation timed out.'}]){const issue=syncIssue(error);assert.equal(issue.retryable,true);assert.match(issue.message,/記録/);assert.doesNotMatch(issue.message,/TimeoutError|schema cache/);}
 assert.equal(syncIssue({code:'PT409'}).retryable,true);assert.equal(syncIssue({code:'40001'}).retryable,true);assert.equal(syncIssue({code:'PGRST301'}).retryable,false);
 assert.deepEqual([1,2,3,4,5,10].map(syncRetryDelay),[5000,10000,20000,40000,80000,120000]);
});
test('bounded requests release on timeout even if the underlying transport ignores cancellation',async()=>{
 const controller=new AbortController();let passed;
 await assert.rejects(()=>boundedSync(signal=>{passed=signal;return new Promise(()=>{});},controller.signal,20),error=>error.name==='TimeoutError');assert.equal(passed.aborted,true);
 const active=new AbortController();const result=boundedSync(()=>new Promise(()=>{}),active.signal,10000);active.abort();await assert.rejects(()=>result,error=>error.name==='AbortError');
 assert.equal(await boundedSync(async()=>42,new AbortController().signal,1000),42);
});
test('save_notebook uses an application HTTP conflict instead of PostgREST serialization retry',()=>{
 const schema=readFileSync('supabase/schema.sql','utf8'),migration=readFileSync('supabase/migrations/20261123_safe_sync_conflicts.sql','utf8');
 assert.match(schema,/Concurrent update; merge and retry' using errcode='PT409'/);assert.doesNotMatch(schema,/errcode='40001'/);
 assert.match(migration,/notebooks_before_sync_fix_20261123/);assert.match(migration,/enable row level security/);assert.doesNotMatch(migration,/drop\s+(table|schema)|truncate|delete\s+from/i);
 assert.ok(migration.indexOf('as select owner,state,revision')<migration.indexOf('execute replace'));
});

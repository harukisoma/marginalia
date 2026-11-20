import {test} from 'node:test';import assert from 'node:assert/strict';
import {AIRelay} from '../server/relay.mjs';
import {abortableDelay} from '../src/ai-request.mjs';
function database(rows){return {auth:{stopAutoRefresh(){}},from(table){assert.equal(table,'ai_requests');let fields,change;const filters=[];
 return {select(value){fields=value;return this;},update(value){change=value;return this;},eq(k,v){filters.push(row=>row[k]===v);return this;},lt(k,v){filters.push(row=>row[k]<v);return this;},order(){return this;},limit(){return this;},single(){this.one=true;return this;},then(resolve){let found=rows.filter(row=>filters.every(check=>check(row)));if(change)for(const row of found)Object.assign(row,change);if(fields==='id,payload')found=found.slice(0,1);resolve({data:this.one?found[0]:found.map(row=>({...row})),error:null});}};}};}
test('Mac cancels running inference, never overwrites cancellation, and immediately starts the next queued request',async()=>{
 const rows=[{id:'cancel',owner:'owner',status:'queued',payload:{id:'cancel'},created_at:new Date().toISOString(),updated_at:new Date().toISOString()},{id:'next',owner:'owner',status:'queued',payload:{id:'next'},created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];
 const called=[];let canceled=false;
 const relay=new AIRelay({hostId:'synthetic',connected:()=>true,inference:async(payload,{signal})=>{called.push(payload.id);if(payload.id==='cancel'){rows[0].status='failed';rows[0].error='中断しました。';try{await abortableDelay(10000,signal);}catch{canceled=signal.aborted;throw signal.reason;}}return {answer:'next finished',edits:[]};}});
 relay.client=database(rows);relay.owner='owner';
 await relay.tick();
 for(let i=0;i<30&&rows[1].status!=='completed';i++)await abortableDelay(10);
 assert.equal(canceled,true);assert.deepEqual(called,['cancel','next']);assert.equal(rows[0].status,'failed');assert.equal(rows[0].error,'中断しました。');assert.equal(rows[1].status,'completed');
 relay.stop();
});
test('stale running requests fail safely instead of leaving every later task blocked',async()=>{
 const old=new Date(Date.now()-200000).toISOString(),now=new Date().toISOString();
 const rows=[{id:'stale',owner:'owner',status:'running',created_at:old,updated_at:old},{id:'fresh',owner:'owner',status:'queued',created_at:now,updated_at:now,payload:{}}];
 const relay=new AIRelay({hostId:'synthetic',connected:()=>true,inference:async()=>({answer:'ok',edits:[]})});relay.client=database(rows);relay.owner='owner';await relay.tick();assert.equal(rows[0].status,'failed');assert.equal(rows[1].status,'completed');relay.stop();
});

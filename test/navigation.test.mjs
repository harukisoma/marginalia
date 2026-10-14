import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceHistory,readRoute,routeHash,hasAuthCallback} from '../src/navigation.mjs';

function browserFixture(hash='#/library'){
 const listeners=new Map(),storage=new Map(),entries=[{url:new URL('https://example.test/marginalia/'+hash),state:null}];let cursor=0;
 const browser={get location(){return entries[cursor].url;},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)};
 const move=delta=>{if(cursor+delta<0||cursor+delta>=entries.length)return;cursor+=delta;for(const name of ['popstate','hashchange'])for(const fn of listeners.get(name)||[])fn();};
 browser.history={get state(){return entries[cursor].state;},replaceState:(state,_,hash)=>{entries[cursor]={state,url:new URL(hash,entries[cursor].url)};},pushState:(state,_,hash)=>{entries.splice(cursor+1);entries.push({state,url:new URL(hash,entries[cursor].url)});cursor++;},back:()=>move(-1),forward:()=>move(1)};
 return browser;
}
const route=(view,pageId=null,query='')=>({view,pageId,query});
test('native Back and Forward restore leaf, collection and query without duplicate history events',()=>{
 const browser=browserFixture(),visits=[];let controls;
 const navigation=new WorkspaceHistory(browser,(value,state)=>{visits.push(value);controls=state;});navigation.start();
 navigation.navigate(route('book'));navigation.navigate(route('editor','leaf-A'));navigation.navigate(route('library',null,'数式とコード'));
 browser.history.back();assert.deepEqual(visits.at(-1),route('editor','leaf-A'));assert.equal(controls.forward,true);
 browser.history.back();assert.deepEqual(visits.at(-1),route('book'));
 browser.history.forward();assert.deepEqual(visits.at(-1),route('editor','leaf-A'));
 browser.history.forward();assert.deepEqual(visits.at(-1),route('library',null,'数式とコード'));
 assert.equal(controls.forward,false);assert.equal(visits.length,8);
 navigation.stop();
});
test('search replacement and reload keep forward navigation while a new visit discards it',()=>{
 const browser=browserFixture();let last,controls;
 let navigation=new WorkspaceHistory(browser,(value,state)=>{last=value;controls=state;});navigation.start();
 navigation.navigate(route('book'));navigation.navigate(route('editor','leaf-A'));navigation.back();
 navigation.navigate(route('book',null,'updated search'),true);assert.equal(controls.forward,true);
 navigation.stop();navigation=new WorkspaceHistory(browser,(value,state)=>{last=value;controls=state;});navigation.start();assert.equal(controls.forward,true);
 navigation.forward();assert.deepEqual(last,route('editor','leaf-A'));navigation.back();navigation.navigate(route('journal'));assert.equal(controls.forward,false);
 navigation.back();assert.deepEqual(last,route('book',null,'updated search'));navigation.stop();
});
test('deep links decode safely and authentication callbacks remain distinguishable',()=>{
 for(const value of [route('library'),route('paper'),route('editor','leaf with spaces'),route('library',null,'本 & 論文?')])assert.deepEqual(readRoute(routeHash(value)),value);
 for(const hash of ['#/%broken','#/leaf/%ZZ','#/leaf/','#/leaf/a/b'])assert.deepEqual(readRoute(hash),route('library'));
 assert.equal(hasAuthCallback({hash:'#access_token=example&refresh_token=example',search:''}),true);
 assert.equal(hasAuthCallback({hash:'',search:'?code=example'}),true);
 assert.equal(hasAuthCallback({hash:'#/library?q=code',search:''}),false);
});

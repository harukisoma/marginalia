const collections=new Set(['library','book','paper','note','journal','trash']);
const storageKey='marginalia-navigation';
/** @typedef {{view:string,pageId:string|null,query:string}} Route */
/** @returns {Route} */
export function readRoute(hash){
 const fallback={view:'library',pageId:null,query:''};
 if(!hash.startsWith('#/'))return fallback;
 const value=hash.slice(2),separator=value.indexOf('?'),path=separator<0?value:value.slice(0,separator),search=separator<0?'':value.slice(separator+1),query=new URLSearchParams(search).get('q')||'';
 if(collections.has(path))return{view:path,pageId:null,query};
 if(path.startsWith('leaf/')){try{const id=decodeURIComponent(path.slice(5));if(id&&id.length<=200&&!id.includes('/'))return{view:'editor',pageId:id,query:''};}catch{}}
 return fallback;
}
/** @param {Route} route */
export function routeHash(route){
 if(route.view==='editor'&&route.pageId)return '#/leaf/'+encodeURIComponent(route.pageId);
 const view=collections.has(route.view)?route.view:'library';
 const search=new URLSearchParams();if(route.query)search.set('q',route.query);
 return '#/'+view+(search.size?'?'+search:'');
}
export function hasAuthCallback(location){
 if(location.hash.startsWith('#/'))return false;
 const hash=new URLSearchParams(location.hash.slice(1)),search=new URLSearchParams(location.search);
 return ['access_token','refresh_token','error','error_description'].some(key=>hash.has(key))||search.has('code');
}

// Each entry gets an index in this tab's app history. Browser traversal always
// reads the URL; replaceState preserves forward history when editing a search.
export class WorkspaceHistory{
 constructor(browser,onChange){this.browser=browser;this.onChange=onChange;this.current=readRoute(browser.location.hash);this.index=0;this.max=0;this.epoch='';this.last='';}
 stamp(){return{epoch:this.epoch,index:this.index};}
 remember(){try{this.browser.sessionStorage.setItem(storageKey,JSON.stringify({epoch:this.epoch,max:this.max}));}catch{}}
 replace(route){const state={...this.browser.history.state,marginaliaNavigation:this.stamp()};this.browser.history.replaceState(state,'',routeHash(route));}
 emit(route){this.current=route;this.last=this.browser.location.hash+'@'+this.epoch+':'+this.index;this.onChange(route,{back:this.index>0,forward:this.index<this.max,ready:true});}
 start(){
  const stamp=this.browser.history.state?.marginaliaNavigation;let stored;try{stored=JSON.parse(this.browser.sessionStorage.getItem(storageKey)||'null');}catch{}
  if(stamp&&typeof stamp.epoch==='string'&&Number.isInteger(stamp.index)&&stamp.index>=0){this.epoch=stamp.epoch;this.index=stamp.index;this.max=stored?.epoch===this.epoch&&Number.isInteger(stored.max)?Math.max(this.index,stored.max):this.index;}else{this.epoch=crypto.randomUUID();}
  this.replace(this.current);this.remember();this.emit(this.current);
  this.pop=()=>{const route=readRoute(this.browser.location.hash),entry=this.browser.history.state?.marginaliaNavigation;if(entry?.epoch===this.epoch&&Number.isInteger(entry.index)&&entry.index>=0){this.index=entry.index;}else{this.epoch=crypto.randomUUID();this.index=this.max=0;this.replace(route);this.remember();}const signature=this.browser.location.hash+'@'+this.epoch+':'+this.index;if(signature!==this.last)this.emit(route);};
  this.browser.addEventListener('popstate',this.pop);this.browser.addEventListener('hashchange',this.pop);
 }
 /** @param {Route} route */
 navigate(route,replace=false){const hash=routeHash(route);if(hash===routeHash(this.current))return;if(replace){this.replace(route);}else{this.index++;this.max=this.index;this.browser.history.pushState({...this.browser.history.state,marginaliaNavigation:this.stamp()},'',hash);}this.remember();this.emit(readRoute(hash));}
 back(){if(this.index>0)this.browser.history.back();}
 forward(){if(this.index<this.max)this.browser.history.forward();}
 stop(){this.browser.removeEventListener('popstate',this.pop);this.browser.removeEventListener('hashchange',this.pop);}
}

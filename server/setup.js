// Runs only on the loopback setup page. No notebook is loaded here.
const pairing=document.querySelector('meta[name="companion-token"]').content;
const query=new URLSearchParams(location.search),origin=query.get('origin'),state=query.get('state');
const status=document.querySelector('#status'),error=document.querySelector('#error'),connect=document.querySelector('#connect'),finish=document.querySelector('#finish');
async function api(path,body){const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+pairing,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'接続を確認できませんでした。');return result;}
function complete(){
 if(window.opener&&origin&&state){window.opener.postMessage({type:'marginalia-companion-ready',state,pairing},origin);status.textContent='Marginaliaへ接続しています…';}
 else{status.textContent='ChatGPTへの接続が完了しました。';document.querySelector('#done').hidden=false;}
}
async function check(){
 try{const result=await api('status');
  if(!result.connected){status.textContent='ChatGPTにログインしてください。';connect.hidden=false;return;}
  if(!result.planEnabled){status.textContent='ログイン済みです。ChatGPT契約枠を使う許可が必要です。';connect.textContent='ChatGPT契約枠の利用を許可する';connect.dataset.consent='true';connect.hidden=false;return;}
  status.textContent='ChatGPTの利用を確認しています…';await api('models');
  connect.hidden=true;finish.hidden=false;status.textContent='ChatGPTに接続できました。';
  if(query.get('authorized')==='1')complete();
 }catch(cause){status.textContent='接続を確認できませんでした。';error.textContent=cause.message;connect.hidden=false;}
}
connect.addEventListener('click',async()=>{connect.disabled=true;error.textContent='';try{const result=await api('sign-in',{consent:connect.dataset.consent==='true',setup:{origin,state}});location.assign(result.url);}catch(cause){error.textContent=cause.message;connect.disabled=false;}});
finish.addEventListener('click',complete);
window.addEventListener('message',event=>{if(event.source===window.opener&&event.origin===origin&&event.data?.type==='marginalia-companion-accepted'&&event.data.state===state){status.textContent='接続が完了しました。';document.querySelector('#done').hidden=false;finish.hidden=true;}});
document.querySelector('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(pairing);document.querySelector('#copy').textContent='コピーしました';}catch{error.textContent='コピーできませんでした。Marginaliaからこの画面を開き直してください。';}});
// Pair the app before OAuth; an identity provider may sever window.opener.
if(window.opener&&origin&&state)window.opener.postMessage({type:'marginalia-companion-ready',state,pairing},origin);
void check();

// Deploy as voice-session. The browser receives only a short-lived credential.
// This function never receives microphone audio or notebook contents.
type Options={env:(name:string)=>string|undefined;fetch?:typeof fetch;now?:()=>number};
export function createVoiceSessionHandler(options:Options){
 const env=options.env,request=options.fetch||fetch,now=options.now||Date.now;
 const recent=new Map<string,number[]>();
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('Origin')||'';
  const allowed=(env('VOICE_ALLOWED_ORIGINS')||'https://harukisoma.github.io').split(',').map(x=>x.trim());
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
   'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'https://harukisoma.github.io',
   'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
   'Access-Control-Allow-Methods':'POST,OPTIONS'};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(!allowed.includes(origin))return reply(403,{code:'origin_denied',error:'この画面からは音声入力へ接続できません。'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  const authorization=req.headers.get('Authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return reply(401,{code:'sign_in_required',error:'先に上部の雲ボタンからクラウド同期へログインしてください。'});
  const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY');
  const owners=(env('VOICE_ALLOWED_USER_IDS')||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!url||!anon||!owners.length)return reply(503,{code:'setup_required',error:'音声入力のサーバー設定がまだ完了していません。'});
  try{
   const auth=await request(url+'/auth/v1/user',{headers:{Authorization:authorization,apikey:anon},signal:AbortSignal.timeout(10000)});
   if(!auth.ok)return reply(401,{code:'sign_in_required',error:'ログインの有効期限を確認できません。雲ボタンからログインし直してください。'});
   const user=await auth.json();
   if(!user.id||!owners.includes(user.id))return reply(403,{code:'account_denied',error:'このアカウントは音声入力の利用を許可されていません。'});
   if(Number(req.headers.get('Content-Length')||0)>4096)return reply(413,{error:'Request too large'});
   const raw=await req.text();
   if(raw.length>4096)return reply(413,{error:'Request too large'});
   let body;try{body=JSON.parse(raw||'{}');}catch{return reply(400,{error:'Invalid JSON'});}
   const key=env('OPENAI_API_KEY');
   if(!key)return reply(503,{code:'setup_required',error:'OpenAI APIキーの設定がまだ完了していません。'});
   if(body.action==='status')return reply(200,{ready:true,model:'gpt-live-transcribe'});
   if(body.action!=='create')return reply(400,{error:'Invalid action'});
   // A best-effort burst limit in addition to the explicit account allowlist.
   const history=(recent.get(user.id)||[]).filter(time=>now()-time<60000);
   if(history.length>=6)return reply(429,{code:'rate_limit',error:'接続が続いています。1分ほど待ってからお試しください。'});
   history.push(now());recent.set(user.id,history);
   const upstream=await request('https://api.openai.com/v1/realtime/client_secrets',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({expires_after:{anchor:'created_at',seconds:30},session:{type:'transcription',audio:{input:{
     transcription:{model:'gpt-live-transcribe',languages:['ja','en'],delay:'high',
      prompt:'Personal notes and journal entries, sometimes mixing Japanese and English.',keywords:['Marginalia']},
     noise_reduction:{type:'near_field'},turn_detection:null,
    }}}}),signal:AbortSignal.timeout(20000),
   });
   const data=await upstream.json();
   if(!upstream.ok){
    const quota=data.error?.code==='insufficient_quota';
    return reply(upstream.status===429?429:502,{code:quota?'billing_required':upstream.status===401?'api_key_invalid':'upstream_error',
     error:quota?'OpenAI APIの残高・支払い設定を確認してください。':upstream.status===401?'OpenAI APIキーを確認してください。':
      upstream.status===429?'OpenAI APIの利用上限に達しました。少し待ってからお試しください。':'OpenAIの音声入力へ接続できません。モデルの利用権限とAPI設定を確認してください。'});
   }
   const value=data.value||data.client_secret?.value;
   if(typeof value!=='string'||!value.startsWith('ek_'))return reply(502,{error:'音声入力の一時認証を取得できませんでした。'});
   return reply(200,{value,expires_at:data.expires_at||data.client_secret?.expires_at,model:'gpt-live-transcribe'});
  }catch{
   return reply(502,{code:'connection_failed',error:'音声入力サーバーへ接続できませんでした。通信状態を確認してください。'});
  }
 };
}

// Supabase Auth is verified above, including with the project's new signing keys.
// No credentials, audio, or transcript text are written to logs.
if(typeof Deno!=='undefined')Deno.serve(createVoiceSessionHandler({env:name=>Deno.env.get(name)}));

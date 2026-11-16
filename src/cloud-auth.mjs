// Supabase's standard email links include a one-use token hash. Redeeming it
// in the current app keeps the session in the Safari or Home Screen instance
// where the user's notebook is stored.
/** @returns {{token_hash:string,type:"email"}} */
export function emailLinkCredentials(link,projectUrl){
 let url, endpoint;
 try{
  url=new URL(link);
  endpoint=new URL('auth/v1/verify',projectUrl.replace(/\/+$/,'')+'/');
 }catch{
  throw new Error('メール内のログインリンクをコピーしてください。');
 }
 const token_hash=url.searchParams.get('token');
 const type=url.searchParams.get('type');
 if(url.protocol!=='https:'||url.origin!==endpoint.origin||url.pathname!==endpoint.pathname||
    url.username||url.password||!token_hash||!['email','magiclink','signup'].includes(type||'')){
  throw new Error('この同期先から届いたログインリンクをコピーしてください。');
 }
 return {token_hash,type:'email'};
}

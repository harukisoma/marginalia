export const terminalRefreshCodes=new Set(['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused']);
export function chatGPTFailure(status,code){
 if(terminalRefreshCodes.has(code)||status===401)return 'ChatGPTの認証期限が切れたか、接続が解除されました。「MacでChatGPTに接続」からログインし直してください。';
 if(code==='subscription_sharing_user_not_eligible')return 'このChatGPTアカウントまたはワークスペースでは契約枠の共有を利用できません。ChatGPTの契約・利用条件を確認してください。';
 if(status===429)return 'ChatGPTの利用上限に達しました。ChatGPTの「利用状況」を確認し、時間をおいてお試しください。';
 if(status===503||status>=500)return 'ChatGPT側で一時的に接続できません。認証情報は保持しています。時間をおいて接続を再確認してください。';
 if(status===403)return 'ChatGPTから利用が許可されませんでした。選択したアカウント・ワークスペースと契約枠の利用許可を確認してください。';
 return 'ChatGPTへの接続に失敗しました（HTTP '+status+'）。接続を再確認してください。';
}

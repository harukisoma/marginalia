import {mkdir,writeFile,chmod,cp,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
export const companionLabel='io.github.harukisoma.marginalia.companion';
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function companionPlist(root,node){
 return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${companionLabel}</string><key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(join(root,'server/index.mjs'))}</string></array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict><key>QUIET_PAIRING</key><string>1</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${xml(join(root,'.runtime/companion.log'))}</string><key>StandardErrorPath</key><string>${xml(join(root,'.runtime/companion-error.log'))}</string></dict></plist>`;
}
export async function installCompanion(){
 if(process.platform!=='darwin')throw new Error('このインストーラーはMac専用です。');
 const source=resolve(fileURLToPath(new URL('..',import.meta.url)));
 const root=join(homedir(),'Library/Application Support/Marginalia Companion'),runtime=join(root,'.runtime');
 const agentDirectory=join(homedir(),'Library/LaunchAgents'),agent=join(agentDirectory,companionLabel+'.plist');
 const bundle=join(root,'Marginalia Connect.app'),contents=join(bundle,'Contents');
 if(!process.argv.includes('--install')){console.log('自動起動の設定先: '+agent);console.log('接続アプリ: '+bundle);console.log('適用するには --install を指定します。');return;}
 await mkdir(root,{recursive:true,mode:0o700});
 // Copy executable files, never the notebook or browser storage. Credentials in
 // the installed runtime survive source edits, releases and repository moves.
 for(const directory of ['server','dist','node_modules'])await cp(join(source,directory),join(root,directory),{recursive:true,force:true,verbatimSymlinks:true});
 await mkdir(join(root,'src'),{recursive:true});await cp(join(source,'src/patch.mjs'),join(root,'src/patch.mjs'));await cp(join(source,'package.json'),join(root,'package.json'));
 await mkdir(runtime,{recursive:true,mode:0o700});await chmod(runtime,0o700);
 for(const file of ['host.json','registration.json','chatgpt.json','cloud-config.json','cloud-auth.json']){
  try{await access(join(runtime,file));}catch{try{await cp(join(source,'.runtime',file),join(runtime,file),{force:false,errorOnExist:true});await chmod(join(runtime,file),0o600);}catch(error){if(error.code!=='ENOENT'&&error.code!=='ERR_FS_CP_EEXIST')throw error;}}
 }
 await mkdir(agentDirectory,{recursive:true});await mkdir(join(contents,'MacOS'),{recursive:true});
 await writeFile(agent,companionPlist(root,process.execPath),{mode:0o600});
 const launcher=`#!/bin/zsh\n/bin/launchctl kickstart gui/$(/usr/bin/id -u)/${companionLabel}\nexit 0\n`;
 await writeFile(join(contents,'MacOS/launcher'),launcher,{mode:0o755});await chmod(join(contents,'MacOS/launcher'),0o755);
 await writeFile(join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleName</key><string>Marginalia Connect</string><key>CFBundleIdentifier</key><string>${companionLabel}.launcher</string><key>CFBundleExecutable</key><string>launcher</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Marginalia connection</string><key>CFBundleURLSchemes</key><array><string>marginalia-connect</string></array></dict></array></dict></plist>`);
 for(const name of ['companion.log','companion-error.log'])await writeFile(join(runtime,name),'',{flag:'a',mode:0o600});
 const domain='gui/'+process.getuid();
 try{execFileSync('/bin/launchctl',['bootout',domain+'/'+companionLabel],{stdio:'ignore'});}catch{}
 // launchd removes a stopped job asynchronously; wait before re-registering.
 for(let attempt=0;attempt<100;attempt++){
  try{execFileSync('/bin/launchctl',['print',domain+'/'+companionLabel],{stdio:'ignore'});}catch{break;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 execFileSync('/bin/launchctl',['bootstrap',domain,agent],{stdio:'pipe'});
 execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',bundle],{stdio:'pipe'});
 console.log('Macのログイン時に自動起動し、停止した場合は再起動するよう設定しました。');
 console.log('接続アプリの登録が完了しました。認証情報はMacのApplication Support内に保持します。');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await installCompanion();

import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function containsSecret(text){
 if(/\bsk-[A-Za-z0-9_-]{24,}/.test(text)||/\bsb_secret_[A-Za-z0-9_-]{20,}/.test(text))return true;
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))return true;
 for(const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){
  try{if(JSON.parse(Buffer.from(match[1],'base64url').toString()).role==='service_role')return true;}catch{}
 }
 return false;
}
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64000000});
const privatePath=path=>/(^|\/)\.env(?:\.|$)/.test(path)&&!path.endsWith('.env.example')||/(^|\/)\.runtime\//.test(path);
function check(text,path){
 if(privatePath(path)||containsSecret(text)){
  // Never print the matching value, even in a failing CI or git hook.
  console.error('Secret protection blocked this file: '+path);return false;
 }
 return true;
}
function scanTracked(){
 let valid=true;
 for(const path of git(['ls-files','-z']).split('\0').filter(Boolean)){
  let bytes;try{bytes=readFileSync(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!check(bytes.toString('utf8'),path))valid=false;
 }
 return valid;
}
function scanDirectory(directory){
 let valid=true;
 for(const item of readdirSync(directory,{withFileTypes:true})){
  const path=join(directory,item.name);
  if(item.isDirectory()){if(!scanDirectory(path))valid=false;}
  else if(item.isFile()&&!check(readFileSync(path).toString('utf8'),path))valid=false;
 }
 return valid;
}
function scanPushHistory(input){
 let valid=true;
 for(const line of input.trim().split('\n').filter(Boolean)){
  const [,local,,remote]=line.split(/\s+/);
  if(!local||/^0+$/.test(local))continue;
  const range=remote&&!/^0+$/.test(remote)?[remote+'..'+local]:[local,'--not','--remotes'];
  // Inspect outgoing blobs, including a secret removed again in a later commit.
  const objects=git(['rev-list','--objects',...range]).split('\n').filter(Boolean);
  for(const object of objects){
   const [sha,...parts]=object.split(' '),path=parts.join(' ');
   if(!path||git(['cat-file','-t',sha]).trim()!=='blob')continue;
   if(!check(git(['cat-file','blob',sha]),path))valid=false;
  }
 }
 return valid;
}
export function runScan(argument){
 let valid=argument&&argument!=='--pre-push'?scanDirectory(argument):scanTracked();
 if(argument==='--pre-push'&&!scanPushHistory(readFileSync(0,'utf8')))valid=false;
 if(valid)console.log('Secret protection passed.');
 return valid;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(!runScan(process.argv[2]))process.exitCode=1;}
 catch{console.error('Secret protection could not complete; build or push blocked.');process.exitCode=1;}
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {containsSecret} from '../scripts/check-secrets.mjs';

test('secret protection rejects long-lived keys while permitting public and short-lived credentials',()=>{
 assert.equal(containsSecret('sk-'+'a'.repeat(45)),true);
 assert.equal(containsSecret('sk-proj-'+'b'.repeat(60)),true);
 assert.equal(containsSecret('sb_secret_'+'c'.repeat(40)),true);
 assert.equal(containsSecret('-----BEGIN '+'PRIVATE KEY-----'),true);
 assert.equal(containsSecret('sb_publishable_'+'d'.repeat(40)),false);
 assert.equal(containsSecret('ek_'+'e'.repeat(40)),false);
 const token=role=>[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({role})).toString('base64url'),'signature'].join('.');
 // JWTs begin with a JSON object containing a header, as issued by Supabase.
 const jwt=role=>[Buffer.from('{"alg":"HS256"}').toString('base64url'),token(role).split('.')[1],'signature'].join('.');
 assert.equal(containsSecret(jwt('service_role')),true);
 assert.equal(containsSecret(jwt('anon')),false);
});

test('pre-push rejects a secret that was committed and later deleted without printing its value',async()=>{
 const {mkdtempSync,writeFileSync,unlinkSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const scanner=resolve('scripts/check-secrets.mjs'),directory=mkdtempSync(join(tmpdir(),'marginalia-secret-'));
 const command=args=>execFileSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd:directory,encoding:'utf8',stdio:['pipe','pipe','pipe']});
 try{
  command(['init']);command(['config','user.name','Synthetic Test']);command(['config','user.email','test@example.invalid']);
  writeFileSync(join(directory,'safe.txt'),'safe');command(['add','.']);command(['commit','-m','base']);const base=command(['rev-parse','HEAD']).trim();
  const secret='sk-'+'z'.repeat(40);writeFileSync(join(directory,'accidental.txt'),secret);command(['add','.']);command(['commit','-m','synthetic fixture']);
  unlinkSync(join(directory,'accidental.txt'));command(['add','-u']);command(['commit','-m','remove fixture']);const head=command(['rev-parse','HEAD']).trim();
  let failure;try{execFileSync(process.execPath,[scanner,'--pre-push'],{cwd:directory,encoding:'utf8',input:`refs/heads/main ${head} refs/heads/main ${base}\n`,stdio:['pipe','pipe','pipe']});}catch(error){failure=error;}
  assert.equal(failure?.status,1);assert.match(failure.stderr,/accidental.txt/);assert.equal(failure.stderr.includes(secret),false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

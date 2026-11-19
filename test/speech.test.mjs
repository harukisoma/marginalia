import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whisperPrefixToken,speechRanges,appendTranscript,transcriptContent,SPEECH_SAMPLE_RATE} from '../src/speech.mjs';

test('Whisper language prediction follows the audio instead of an English default',()=>{
 const config={lang_to_id:{'<|en|>':1,'<|ja|>':2},task_to_id:{transcribe:3,translate:4},no_timestamps_token_id:5};
 assert.equal(whisperPrefixToken(1,new Float32Array([-100,1,8,0,0,0]),config),2);
 assert.equal(whisperPrefixToken(1,new Float32Array([-100,9,1,0,0,0]),config),1);
 assert.equal(whisperPrefixToken(2,new Float32Array(6),config),3);
 assert.equal(whisperPrefixToken(3,new Float32Array(6),config),5);
 assert.equal(whisperPrefixToken(4,new Float32Array(6),config),null);
});
test('silent audio is skipped while long speech is chunked within Whisper capacity',()=>{
 assert.deepEqual(speechRanges(new Float32Array(SPEECH_SAMPLE_RATE)),[]);
 const sound=new Float32Array(SPEECH_SAMPLE_RATE*65);
 for(let i=SPEECH_SAMPLE_RATE;i<sound.length-SPEECH_SAMPLE_RATE;i++)sound[i]=Math.sin(i*.05)*.1;
 const ranges=speechRanges(sound);
 assert.ok(ranges.length>=3);
 for(const [start,end] of ranges){
  assert.ok(end>start);
  assert.ok(end-start<=SPEECH_SAMPLE_RATE*30);
 }
 for(let index=1;index<ranges.length;index++)assert.ok(ranges[index][0]<ranges[index-1][1]);
 assert.ok(ranges[0][0]>0);
});
test('overlapping transcript segments merge without repeating their shared words',()=>{
 assert.equal(appendTranscript('今日は音声入力を','音声入力を試します。'),'今日は音声入力を試します。');
 assert.equal(appendTranscript('I am testing voice input','voice input in the browser.'),'I am testing voice input in the browser.');
 assert.equal(appendTranscript('This is a','a test'),'This is a a test');
 assert.equal(appendTranscript('繰り返します。','繰り返します。',false),'繰り返します。繰り返します。');
});
test('pauses split bilingual recordings so each utterance gets its own language prediction',()=>{
 const audio=new Float32Array(SPEECH_SAMPLE_RATE*9);
 for(const [from,to] of [[.2,3.5],[4.6,8.7]]){
  for(let i=Math.round(from*SPEECH_SAMPLE_RATE);i<to*SPEECH_SAMPLE_RATE;i++)audio[i]=Math.sin(i*.05)*.1;
 }
 const ranges=speechRanges(audio);
 assert.equal(ranges.length,2);
 assert.ok(ranges[0][0]<=.2*SPEECH_SAMPLE_RATE);
 assert.ok(ranges[0][1]>=3.5*SPEECH_SAMPLE_RATE);
 assert.ok(ranges[0][1]<ranges[1][0]);
 assert.ok(ranges[1][0]<=4.6*SPEECH_SAMPLE_RATE);
 assert.ok(ranges[1][1]>=8.7*SPEECH_SAMPLE_RATE);
});
test('dictation inserts literal text rather than interpreting HTML or Markdown commands',()=>{
 const text='<img src=x onerror=alert(1)>\n**written words**';
 assert.deepEqual(transcriptContent(text),[
  {type:'paragraph',content:[{type:'text',text:'<img src=x onerror=alert(1)>'}]},
  {type:'paragraph',content:[{type:'text',text:'**written words**'}]},
 ]);
 assert.deepEqual(transcriptContent('**spoken words**'),[{type:'text',text:'**spoken words**'}]);
});

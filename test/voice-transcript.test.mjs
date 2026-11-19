import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VoiceTranscript,transcriptContent} from '../src/voice-transcript.mjs';

test('late transcription finals remain in audio order and replace partial text',()=>{
 const text=new VoiceTranscript();
 text.receive({type:'input_audio_buffer.committed',item_id:'a',previous_item_id:null});
 text.receive({type:'input_audio_buffer.committed',item_id:'b',previous_item_id:'a'});
 text.receive({type:'conversation.item.input_audio_transcription.delta',item_id:'a',delta:'誤認識'});
 text.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'This is English.'});
 assert.equal(text.complete(),false);
 text.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'日本語の文章です。'});
 text.receive({type:'conversation.item.input_audio_transcription.delta',item_id:'a',delta:'duplicate'});
 assert.equal(text.text(),'日本語の文章です。\nThis is English.');assert.equal(text.complete(),true);
});
test('repeated spoken sentences are preserved and transcription is always inserted as literal text',()=>{
 const text=new VoiceTranscript();
 for(const id of ['a','b']){text.receive({type:'input_audio_buffer.committed',item_id:id,previous_item_id:id==='a'?null:'a'});text.receive({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:'繰り返します。'});}
 assert.equal(text.text(),'繰り返します。\n繰り返します。');
 assert.deepEqual(transcriptContent('<img src=x onerror=alert(1)>'),[{type:'text',text:'<img src=x onerror=alert(1)>'}]);
 assert.deepEqual(transcriptContent('**plain**\nsecond line'),[{type:'paragraph',content:[{type:'text',text:'**plain**'}]},{type:'paragraph',content:[{type:'text',text:'second line'}]}]);
});

test('legacy cache cleanup deletes only the pinned Whisper download, preserving every user-data location',async()=>{
 const {removeLegacyVoiceModelCache}=await import('../src/voice-cache.mjs');
 const prefix='https://huggingface.co/onnx-community/whisper-small/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732/';
 const requests=[{url:prefix+'onnx/encoder_model_quantized.onnx'},{url:'https://example.invalid/user-notebook'},{url:'https://huggingface.co/another/model/resolve/main/model.onnx'}];
 const removed=[];const opened=[];
 await removeLegacyVoiceModelCache({keys:async()=>['transformers-cache','user-backups'],open:async name=>{opened.push(name);return {keys:async()=>requests,delete:async request=>removed.push(request.url)};}});
 assert.deepEqual(opened,['transformers-cache']);assert.deepEqual(removed,[requests[0].url]);
});

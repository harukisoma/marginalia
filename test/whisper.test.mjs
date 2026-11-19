import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWavPayload} from '../server/whisper.mjs';

function sampleWav(){
 const pcm=Buffer.alloc(16000*2);
 const wav=Buffer.alloc(44+pcm.length);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
 wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
 wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);
 wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
 wav.write('data',36);wav.writeUInt32LE(pcm.length,40);
 return wav;
}
test('accepts 16kHz mono PCM WAV',()=>{const wav=sampleWav();assert.deepEqual(parseWavPayload({kind:'transcribe',audio:wav.toString('base64')}),wav);});
test('rejects incompatible or malformed audio',()=>{
 const wav=sampleWav();
 assert.throws(()=>parseWavPayload({kind:'transcribe',audio:'not base64'}));
 const stereo=Buffer.from(wav);stereo.writeUInt16LE(2,22);
 assert.throws(()=>parseWavPayload({kind:'transcribe',audio:stereo.toString('base64')}));
 const sr=Buffer.from(wav);sr.writeUInt32LE(44100,24);
 assert.throws(()=>parseWavPayload({kind:'transcribe',audio:sr.toString('base64')}));
});

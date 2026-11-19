// Whisper runs locally on the user's Mac (whisper.cpp). No paid speech API is used.
const MAX_WAV_BYTES=44+75*16000*2;
export function parseWavPayload(payload){
 if(payload?.kind!=='transcribe'||typeof payload.audio!=='string'||!payload.audio.length||payload.audio.length>4200000||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.audio))throw new Error('音声データの形式が不正です。');
 const wav=Buffer.from(payload.audio,'base64');
 if(wav.length<44||wav.length>MAX_WAV_BYTES||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE'||wav.toString('ascii',12,16)!=='fmt '||wav.toString('ascii',36,40)!=='data'||wav.readUInt32LE(16)!==16||wav.readUInt16LE(20)!==1||wav.readUInt16LE(22)!==1||wav.readUInt32LE(24)!==16000||wav.readUInt16LE(34)!==16||wav.readUInt32LE(40)!==wav.length-44)throw new Error('16kHz・モノラルPCM WAVのみ受け付けます。');
 return wav;
}
export async function transcribeWhisper(payload){
 const wav=parseWavPayload(payload);
 const form=new FormData();
 form.append('file',new Blob([wav],{type:'audio/wav'}),'dictation.wav');
 form.append('language','auto');
 form.append('task','transcribe');
 form.append('response_format','json');
 form.append('temperature','0.0');
 let response;
 try{response=await fetch('http://127.0.0.1:8080/inference',{method:'POST',body:form,signal:AbortSignal.timeout(240000)});}
 catch(error){throw new Error(error?.name==='TimeoutError'?'Whisperの処理がタイムアウトしました。':'MacでWhisperサーバーを起動してください（npm run whisper）。');}
 if(!response.ok)throw new Error('Whisperの文字起こしに失敗しました（'+response.status+'）。');
 const result=await response.json();
 if(typeof result?.text!=='string')throw new Error('Whisperの応答形式を確認できませんでした。');
 return {text:result.text.trim()};
}

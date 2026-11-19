export const SPEECH_SAMPLE_RATE=16000;
export const MAX_RECORDING_SECONDS=300;

// Whisper predicts the language immediately after <|startoftranscript|>.
// Transformers.js currently substitutes English when no language is provided.
// Keep the model's language prediction and force only the transcription task.
export function whisperPrefixToken(inputLength,logits,config){
 if(inputLength===1){
  const candidates=Object.values(config.lang_to_id||{});
  if(!candidates.length)throw new Error('音声モデルの言語設定を読み込めませんでした。');
  let best=candidates[0];
  for(const token of candidates)if(logits[token]>logits[best])best=token;
  return best;
 }
 if(inputLength===2)return config.task_to_id.transcribe;
 if(inputLength===3)return config.no_timestamps_token_id;
 return null;
}

export function speechRanges(audio,sampleRate=SPEECH_SAMPLE_RATE){
 const frame=Math.round(sampleRate*.02);
 const energies=[];
 let peak=0;
 for(let start=0;start<audio.length;start+=frame){
  let energy=0;
  const end=Math.min(start+frame,audio.length);
  for(let i=start;i<end;i++)energy+=audio[i]*audio[i];
  const rms=Math.sqrt(energy/(end-start));
  energies.push(rms);
  peak=Math.max(peak,rms);
 }
 if(peak<.0015)return [];
 const threshold=Math.max(.001,peak*.025);
 const first=energies.findIndex(energy=>energy>threshold);
 let last=energies.length-1;
 while(last>first&&energies[last]<=threshold)last--;
 // Re-detect language after a pause: one language prefix for a long bilingual
 // recording can otherwise cause Whisper to omit the other language.
 const utterances=[];
 let utterance=first,quiet=-1;
 for(let index=first;index<=last;index++){
  if(energies[index]<=threshold){if(quiet<0)quiet=index;}
  else{
   if(quiet>=0&&(index-quiet)*frame>=sampleRate*.7&&(quiet-utterance)*frame>=sampleRate){
    utterances.push([utterance,quiet]);
    utterance=index;
   }
   quiet=-1;
  }
 }
 utterances.push([utterance,last+1]);
 const ranges=[];
 for(const [from,to] of utterances){
  let start=Math.max(0,from*frame-Math.round(sampleRate*.2));
  const ending=Math.min(audio.length,to*frame+Math.round(sampleRate*.3));
  while(ending-start>sampleRate*26){
   const target=start+sampleRate*22;
   let boundary=target;
   let quietest=Infinity;
   for(let at=target-sampleRate*4;at<=target+sampleRate*2;at+=frame){
    const energy=energies[Math.floor(at/frame)]??Infinity;
    if(energy<quietest){quietest=energy;boundary=at;}
   }
   ranges.push([start,Math.min(ending,boundary+sampleRate*.35)]);
   start=Math.max(start+sampleRate,boundary-sampleRate*.35);
  }
  ranges.push([start,ending]);
 }
 return ranges;
}

export function appendTranscript(previous,next,deduplicate=true){
 const left=previous.trim(),right=next.trim();
 if(!left)return right;
 if(!right)return left;
 const minimum=/[\u3040-\u30ff\u3400-\u9fff]/.test(right)?2:5;
 let overlap=0;
 for(let length=minimum;deduplicate&&length<=Math.min(left.length,right.length,100);length++){
  if(left.slice(-length)===right.slice(0,length))overlap=length;
 }
 const remainder=right.slice(overlap).trimStart();
 if(!remainder)return left;
 const separator=/[\u3040-\u30ff\u3400-\u9fff、。！？]$/.test(left)&&/^[\u3040-\u30ff\u3400-\u9fff、。！？]/.test(remainder)?'':' ';
 return left+separator+remainder;
}

export function transcriptContent(text){
 const lines=text.replaceAll('\r\n','\n').split('\n');
 if(lines.length===1)return lines[0]?[{type:'text',text:lines[0]}]:[];
 return lines.map(line=>({
  type:'paragraph',
  content:line?[{type:'text',text:line}]:[],
 }));
}

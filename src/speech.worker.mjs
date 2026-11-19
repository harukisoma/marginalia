import {pipeline,env,LogitsProcessor,LogitsProcessorList,TextStreamer} from '@huggingface/transformers';
import wasmURL from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import runtimeURL from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import {speechRanges,whisperPrefixToken,appendTranscript} from './speech.mjs';

env.allowLocalModels=false;
env.useBrowserCache=true;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
env.backends.onnx.wasm.wasmPaths={wasm:wasmURL,mjs:runtimeURL};

let transcriber;
let busy=false;
const send=message=>self.postMessage(message);

class AutomaticLanguagePrefix extends LogitsProcessor{
 constructor(config){super();this.config=config;}
 _call(inputIds,logits){
  const token=whisperPrefixToken(inputIds[0].length,logits.data,this.config);
  if(token!==null){logits.data.fill(-Infinity);logits.data[token]=0;}
  return logits;
 }
}

async function prepare(){
 if(transcriber)return;
 send({type:'loading'});
 transcriber=await pipeline('automatic-speech-recognition','onnx-community/whisper-small',{
  device:'wasm',dtype:'q8',revision:'36050c46d777d46dc4b5f43f6d90574fc38f8732',
  progress_callback:progress=>{
   if(['initiate','download','progress','done'].includes(progress.status)){
    send({type:'download',file:progress.file,status:progress.status,
     loaded:progress.loaded||0,total:progress.total||0});
   }
  },
 });
}

async function transcribe(audio){
 const ranges=speechRanges(audio);
 if(!ranges.length){send({type:'result',text:''});return;}
 let text='';
 const config=transcriber.model.generation_config;
 for(let index=0;index<ranges.length;index++){
  const [start,end]=ranges[index];
  const overlaps=index>0&&start<ranges[index-1][1];
  send({type:'transcribing',completed:index,total:ranges.length,text});
  const features=await transcriber.processor(audio.subarray(start,end));
  const processors=new LogitsProcessorList();
  processors.push(new AutomaticLanguagePrefix(config));
  let partial='';
  const streamer=new TextStreamer(transcriber.tokenizer,{
   skip_prompt:true,skip_special_tokens:true,
   callback_function:piece=>{
    partial+=piece;
    send({type:'partial',text:appendTranscript(text,partial,overlaps),completed:index,total:ranges.length});
   },
  });
  const tokens=await transcriber.model.generate({
   inputs:features.input_features,
   decoder_input_ids:[config.decoder_start_token_id],
   logits_processor:processors,
   max_new_tokens:440,
   do_sample:false,
   return_timestamps:false,
   streamer,
  });
  const segment=transcriber.tokenizer.batch_decode(tokens,{skip_special_tokens:true})[0];
  text=appendTranscript(text,segment,overlaps);
 }
 send({type:'result',text});
}

self.onmessage=async({data})=>{
 if(busy)return;
 busy=true;
 try{
  await prepare();
  if(data.type==='prepare')send({type:'ready'});
  else if(data.type==='transcribe')await transcribe(data.audio);
 }catch(error){
  send({type:'error',message:error instanceof Error?error.message:String(error)});
 }finally{busy=false;}
};

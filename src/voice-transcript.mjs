export const MAX_RECORDING_SECONDS=300;

// Keep committed turns in audio order even when final transcripts arrive late.
export class VoiceTranscript{
 constructor(){this.turns=new Map();this.sequence=0;}
 receive(event){
  const id=event.item_id;
  if(!id)return;
  const turn=this.turns.get(id)||{id,text:'',done:false,order:this.sequence++};
  if(event.type==='input_audio_buffer.committed'){
   turn.previous=event.previous_item_id??null;
   turn.committed=true;
  }else if(event.type==='conversation.item.input_audio_transcription.delta'){
   if(!turn.done)turn.text+=event.delta||'';
  }else if(event.type==='conversation.item.input_audio_transcription.completed'){
   turn.text=event.transcript||'';
   turn.done=true;
  }else if(event.type==='conversation.item.input_audio_transcription.failed'){
   turn.failed=true;
  }else return;
  this.turns.set(id,turn);
 }
 ordered(){
  const remaining=[...this.turns.values()].sort((a,b)=>a.order-b.order),result=[];
  while(remaining.length){
   const index=remaining.findIndex(turn=>turn.previous===null||turn.previous===undefined||!remaining.some(other=>other.id===turn.previous));
   result.push(...remaining.splice(index<0?0:index,1));
  }
  return result;
 }
 text(){return this.ordered().map(turn=>turn.text.trim()).filter(Boolean).join('\n');}
 complete(){return [...this.turns.values()].filter(turn=>turn.committed).every(turn=>turn.done);}
}

export function transcriptContent(text){
 const lines=text.replaceAll('\r\n','\n').split('\n');
 if(lines.length===1)return lines[0]?[{type:'text',text:lines[0]}]:[];
 return lines.map(line=>({type:'paragraph',content:line?[{type:'text',text:line}]:[]}));
}

import {Extension} from '@tiptap/core';
import {Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import type {Node as DocumentNode} from '@tiptap/pm/model';

export type VoiceAnchor={position:number;valid:boolean};
export const voiceAnchorKey=new PluginKey<VoiceAnchor|null>('voiceInsertionAnchor');
export function createVoiceAnchorPlugin(){
 return new Plugin<VoiceAnchor|null>({
  key:voiceAnchorKey,
  state:{
   init:()=>null,
   apply(transaction,anchor){
    const change=transaction.getMeta(voiceAnchorKey);
    if(change!==undefined)return change;
    if(!anchor)return null;
    const mapped=transaction.mapping.mapResult(anchor.position,1);
    return {position:mapped.pos,valid:anchor.valid&&!mapped.deletedAcross};
   },
  },
  props:{decorations(state){
   const anchor=voiceAnchorKey.getState(state);
   if(!anchor?.valid||anchor.position<0||anchor.position>state.doc.content.size)return null;
   if(!state.doc.resolve(anchor.position).parent.inlineContent)return null;
   return DecorationSet.create(state.doc,[Decoration.widget(anchor.position,()=>{
    const marker=document.createElement('span');
    marker.className='voice-insertion-marker';
    marker.contentEditable='false';
    marker.setAttribute('aria-label','音声の挿入位置');
    marker.setAttribute('data-voice-insertion','');
    return marker;
   },{key:'voice-insertion',side:1,ignoreSelection:true})]);
  }},
 });
}
export const VoiceInsertionAnchor=Extension.create({name:'voiceInsertionAnchor',addProseMirrorPlugins(){return [createVoiceAnchorPlugin()];}});

export function voicePlacementContext(doc:DocumentNode,position:number){
 const point=doc.resolve(Math.max(0,Math.min(position,doc.content.size)));
 const before=point.parent.textBetween(Math.max(0,point.parentOffset-120),point.parentOffset,' ',' ').replace(/\s+/g,' ');
 const after=point.parent.textBetween(point.parentOffset,Math.min(point.parent.content.size,point.parentOffset+120),' ',' ').replace(/\s+/g,' ');
 return {before:Array.from(before).slice(-24).join(''),after:Array.from(after).slice(0,24).join(''),emptyLabel:point.parent.inlineContent?'空の段落':'ブロックの間'};
}

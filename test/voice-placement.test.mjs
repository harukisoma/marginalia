import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {Schema} from '@tiptap/pm/model';
import {EditorState} from '@tiptap/pm/state';
const source=ts.transpileModule(readFileSync('src/voice-placement.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 .replaceAll("'@tiptap/core'",JSON.stringify(import.meta.resolve('@tiptap/core')))
 .replaceAll("'@tiptap/pm/state'",JSON.stringify(import.meta.resolve('@tiptap/pm/state')))
 .replaceAll("'@tiptap/pm/view'",JSON.stringify(import.meta.resolve('@tiptap/pm/view')));
const {createVoiceAnchorPlugin,voiceAnchorKey,voicePlacementContext}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*',group:'block'},text:{group:'inline'}}});
const create=()=>EditorState.create({doc:schema.node('doc',null,[schema.node('paragraph',null,schema.text('前の文章。ここから後ろの文章。')),schema.node('paragraph',null,schema.text('別の段落は保持します。'))]),plugins:[createVoiceAnchorPlugin()]});

test('voice insertion marker is view state and cannot alter the document or its saved content',()=>{
 let state=create();const baseline=state.doc.toJSON();
 state=state.apply(state.tr.setMeta(voiceAnchorKey,{position:6,valid:true}));
 assert.deepEqual(state.doc.toJSON(),baseline);
 assert.deepEqual(voiceAnchorKey.getState(state),{position:6,valid:true});
 state=state.apply(state.tr.setMeta(voiceAnchorKey,null));
 assert.equal(voiceAnchorKey.getState(state),null);assert.deepEqual(state.doc.toJSON(),baseline);
});
test('the insertion point follows edits before it and becomes invalid if its text is removed',()=>{
 let state=create();state=state.apply(state.tr.setMeta(voiceAnchorKey,{position:6,valid:true}));
 state=state.apply(state.tr.insertText('追加',1));assert.deepEqual(voiceAnchorKey.getState(state),{position:8,valid:true});
 state=state.apply(state.tr.delete(5,10));assert.equal(voiceAnchorKey.getState(state).valid,false);
});
test('inserting at a selected range end keeps the selected words and surrounding paragraphs',()=>{
 let state=create();const original=state.doc.textContent;
 state=state.apply(state.tr.setMeta(voiceAnchorKey,{position:9,valid:true}));
 state=state.apply(state.tr.insertText('音声の文章',voiceAnchorKey.getState(state).position));
 assert.equal(state.doc.textContent,original.slice(0,8)+'音声の文章'+original.slice(8));
 assert.equal(state.doc.child(1).textContent,'別の段落は保持します。');
});
test('the placement preview distinguishes the middle, beginning, and empty paragraph without changing text',()=>{
 const state=create();assert.deepEqual(voicePlacementContext(state.doc,6),{before:'前の文章。',after:'ここから後ろの文章。',emptyLabel:'空の段落'});
 assert.equal(voicePlacementContext(state.doc,1).before,'');
 assert.deepEqual(voicePlacementContext(schema.node('doc',null,[schema.node('paragraph')]),1),{before:'',after:'',emptyLabel:'空の段落'});
});

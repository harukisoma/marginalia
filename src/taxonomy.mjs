const norm=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g,' ').trim();
export const taxonomyFields={
 bookGenres:{kind:'book',label:'ジャンル',multiple:true,defaults:['金融','経済','回顧録','政治','歴史','哲学','科学','ビジネス','文学','SF']},
 paperMajor:{kind:'paper',label:'大カテゴリ',defaults:['人文科学','社会科学','自然科学','工学','医学・生命科学','学際研究']},
 paperMiddle:{kind:'paper',label:'中カテゴリ',defaults:[]},
 paperMinor:{kind:'paper',label:'小カテゴリ',defaults:[]},
 noteTypes:{kind:'note',label:'インプット・アウトプット',multiple:true,defaults:['Podcast','記事','動画','講義','会話','その他のインプット','自分のアウトプット']},
};
export function taxonomyValues(page,field){const value=page[field];return Array.isArray(value)?value.filter(v=>typeof v==='string'):typeof value==='string'&&value?[value]:[];}
export function taxonomyParent(page,field){return field==='paperMiddle'?[page.paperMajor||'']:field==='paperMinor'?[page.paperMajor||'',page.paperMiddle||'']:[];}
export function taxonomyScope(page,field){return JSON.stringify([page.kind,field,...taxonomyParent(page,field)]);}
export function classificationKey(kind,field,name,parents=[]){return JSON.stringify([kind,field,...parents.map(norm),norm(name)]);}
export function leafClassifications(page){
 if(page.kind==='journal')return [];
 const entries=[];
 for(const [field,definition] of Object.entries(taxonomyFields))if(definition.kind===page.kind)for(const name of taxonomyValues(page,field))entries.push({key:classificationKey(page.kind,field,name,taxonomyParent(page,field)),name,label:[definition.label,...taxonomyParent(page,field)].join(' › '),kind:page.kind});
 for(const name of page.tags||[])if(typeof name==='string')entries.push({key:classificationKey(page.kind,'legacy',name),name,label:'以前のタグ',kind:page.kind});
 return entries;
}
export function matchesClassification(page,key){return leafClassifications(page).some(item=>item.key===key||(!key.startsWith('[')&&norm(item.name)===norm(key)));}
export function changeTaxonomy(page,field,values){
 const definition=taxonomyFields[field];if(!definition||definition.kind!==page.kind)throw new Error('この区分では使用できない分類です。');
 const change={[field]:definition.multiple?values:values[0]||''};
 if(field==='paperMajor'&&change[field]!==page[field])Object.assign(change,{paperMiddle:'',paperMinor:''});
 if(field==='paperMiddle'&&change[field]!==page[field])change.paperMinor='';
 return change;
}

const paperSuggestions={
 '人文科学':['哲学','歴史学','文学','言語学'], '社会科学':['経済学','政治学','社会学','心理学','法学'], '自然科学':['数学','物理学','化学','地球科学'], '工学':['情報科学','機械工学','電気電子工学','建築学'], '医学・生命科学':['生物学','医学','神経科学','公衆衛生'],
 '社会科学/経済学':['金融','マクロ経済','ミクロ経済','行動経済'], '社会科学/政治学':['国際政治','比較政治','政治思想'], '工学/情報科学':['機械学習','自然言語処理','分散システム'], '自然科学/物理学':['量子力学','統計力学','宇宙物理'],
};
export function taxonomySuggestions(page,field){return field==='paperMiddle'?paperSuggestions[page.paperMajor]||[]:field==='paperMinor'?paperSuggestions[[page.paperMajor,page.paperMiddle].join('/')]||[]:taxonomyFields[field]?.defaults||[];}

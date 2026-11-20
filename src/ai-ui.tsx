import {useEffect,useState} from 'react';
import {Sparkles,Square} from 'lucide-react';
export function AIWorking({compact=false,startedAt,progress,onStop}:{compact?:boolean;startedAt:number;progress?:string;onStop?:()=>void}){
 const[elapsed,setElapsed]=useState(0);useEffect(()=>{setElapsed(0);const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-startedAt)/1000)),1000);return()=>clearInterval(timer);},[startedAt]);
 return <div className={'ai-working '+(compact?'compact':'')} role="status"><span className="working-orbit" aria-hidden="true"><Sparkles size={16}/></span><div><strong>ChatGPTが作業中</strong><small>{progress||'回答と変更案を準備しています'}</small></div><time aria-hidden="true">{Math.floor(elapsed/60).toString().padStart(2,'0')}:{(elapsed%60).toString().padStart(2,'0')}</time>{onStop&&<button className="ai-stop" aria-label="AIの処理を中断" onClick={onStop}><Square size={12}/>中断</button>}</div>;
}

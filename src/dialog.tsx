import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

export function Dialog({title,onClose,children,className=''}:{
 title:string;
 onClose:()=>void;
 children:ReactNode;
 className?:string;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const element=dialog.current;
  element?.showModal();
  return()=>element?.close();
 },[]);
 return <dialog ref={dialog} className={'settings-modal app-dialog '+className}
  aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}
  onClick={e=>{
   if(e.target!==e.currentTarget)return;
   const box=e.currentTarget.getBoundingClientRect();
   if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)onClose();
  }}>
  <div className="modal-header"><h2>{title}</h2><button aria-label={title+'を閉じる'} onClick={onClose}><X size={20}/></button></div>
  {children}
 </dialog>;
}

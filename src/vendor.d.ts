declare module 'markdown-it-footnote';
declare module 'markdown-it-mark';
declare module 'markdown-it-sub';
declare module 'markdown-it-sup';
declare module 'markdown-it-task-lists';
declare module 'turndown-plugin-gfm';
declare module 'virtual:pwa-register' { export function registerSW(options?:{onNeedRefresh?:()=>void; onOfflineReady?:()=>void}): (reloadPage?:boolean)=>Promise<void>; }

// Remove only the obsolete, reproducible voice-model download. Never touch
// IndexedDB, localStorage, notebook backups, or another model's cache entries.
export async function removeLegacyVoiceModelCache(storage=globalThis.caches){
 if(!storage||(await storage.keys()).includes('transformers-cache')===false)return;
 const cache=await storage.open('transformers-cache');
 const prefix='https://huggingface.co/onnx-community/whisper-small/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732/';
 for(const request of await cache.keys())if(request.url.startsWith(prefix))await cache.delete(request);
}

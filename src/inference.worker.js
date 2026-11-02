import { buildNPCMessages, extractNPCReply } from './dialogue.js';
// Runs Transformers.js in a separate thread; no keys or hosted inference API.
const MODEL='onnx-community/SmolLM2-135M-Instruct-ONNX-GQA';
let generator=null,loadPromise=null,currentBackend=null;
const send=(type,extra={})=>self.postMessage({type,...extra});
async function load(backend){
 if(generator&&currentBackend===backend)return;
 if(loadPromise)return loadPromise;
 currentBackend=backend;
 loadPromise=(async()=>{
  const {pipeline,env}=await import('@huggingface/transformers');
  // Browser Cache Storage persists ONNX downloads between visits when allowed.
  env.useBrowserCache=true;
  // GitHub Pages serves models from the deployment artifact, NOT Git LFS.
  // Vite's dev server still uses Hugging Face for local development.
  if(import.meta.env.PROD){
   env.allowLocalModels=true;
   env.allowRemoteModels=false;
   env.localModelPath=new URL(`${import.meta.env.BASE_URL}models/v1/`,self.location.origin).href;
  }
  generator=await pipeline('text-generation',MODEL,{
   device:backend==='webgpu'?'webgpu':'wasm',
   dtype:backend==='webgpu'?'q4f16':'q8',
   progress_callback:p=>{
    if(p.status==='progress')send('progress',{file:p.file,progress:Math.round(p.progress??0)});
    if(p.status==='ready')send('progress',{progress:100});
   }
  });
  send('ready',{model:MODEL,backend});
 })();
 try{await loadPromise;}catch(err){generator=null;currentBackend=null;send('error',{message:String(err?.message||err)});throw err;}finally{loadPromise=null;}
}
self.onmessage=async({data})=>{
 if(data.type==='load'){try{await load(data.backend);}catch{}return;}
 if(data.type==='generate'){
  try{
   if(!generator)throw Error('Carregue primeiro o modelo.');
   // The 135M model can echo the player's turn. Validate the answer; retry only once.
   let reply=null, lastError=null;
   for(let attempt=0;attempt<2;attempt++){
    try{
     const messages=buildNPCMessages(data.context,attempt>0);
     const result=await generator(messages,{
      max_new_tokens:attempt?90:80,
      do_sample:true,temperature:attempt?0.85:0.7,top_p:0.9,
      repetition_penalty:attempt?1.2:1.12,
      return_full_text:false
     });
     reply=extractNPCReply(result,data.context.question);
     break;
    }catch(err){lastError=err;}
   }
   if(!reply)throw lastError||Error('A IA não gerou uma resposta válida.');
   send('response',{id:data.id,reply});
  }catch(err){send('generation_error',{id:data.id,message:String(err?.message||err)});}
 }
};
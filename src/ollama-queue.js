/**
 * A single local Ollama queue: keeps the dialogue responsive on small CPUs.
 * Foreground player messages are selected before pending background reviews.
 * No work survives a closed browser tab.
 */
const foreground=[];
const background=[];
let active=false;
function runNext(){
 if(active)return;
 const job=foreground.shift()||background.shift();
 if(!job)return;
 if(job.signal?.aborted){
   job.reject(new DOMException('Cancelado.','AbortError'));
   queueMicrotask(runNext);
   return;
 }
 active=true;
 Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{
   active=false;
   queueMicrotask(runNext);
 });
}
export function scheduleOllama(run,{priority='foreground',signal}={}){
 if(typeof run!=='function')throw new TypeError('Tarefa inválida');
 return new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(new DOMException('Cancelado.','AbortError'));return;}
   const queue=priority==='background'?background:foreground;
   queue.push({run,resolve,reject,signal});
   runNext();
 });
}
export function queueState(){
 return {active,foreground:foreground.length,background:background.length};
}

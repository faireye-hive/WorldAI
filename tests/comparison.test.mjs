import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installedModels, getMetrics, testModel, compareModels, EXAMPLE_QUESTIONS
} from '../src/comparison-core.js';

const ctx={
  name:'Marcus',role:'smith',biography:'Trabalhador, reservado',
  hour:'10:00',relationship:3,history:[],memories:[],
  question:'O que você faz na vila?'
};
const response=(payload,status=200)=>({
  ok:status>=200&&status<300,status,
  json:async()=>payload,
  text:async()=>JSON.stringify(payload)
});

test('lista somente tags instaladas, únicas e ordenadas', async()=>{
 const models=await installedModels({fetchImpl:async (url)=>{
  assert.equal(url,'/api/ollama/tags');
  return response({models:[{name:'lfm3:latest'},{name:'qwen3.5:0.8b'},{name:'lfm3:latest'}]});
 }});
 assert.deepEqual(models,['lfm3:latest','qwen3.5:0.8b']);
});

test('métricas em nanossegundos convertem para ms e tokens/s',()=>{
 const m=getMetrics({
  total_duration:1600000000,load_duration:200000000,
  eval_duration:500000000,eval_count:50,prompt_eval_count:87
 },1800);
 assert.deepEqual(m,{
  elapsedMs:1800,serverTotalMs:1600,loadMs:200,
  promptTokens:87,generatedTokens:50,generationMs:500,tokensPerSecond:100
 });
 assert.equal(getMetrics({},100).tokensPerSecond,null);
});

test('executa os modelos sequencialmente, sempre com o MESMO contexto e parâmetros',async()=>{
 const calls=[],progress=[],clock=()=>1000;
 const results=await compareModels(ctx,'qwen3.5:0.8b','lfm3:latest',{
  now:clock,
  onUpdate:p=>progress.push(p.phase+':'+p.model),
  fetchImpl:async (_url,opts)=>{
   const body=JSON.parse(opts.body);calls.push(body);
   assert.equal(calls.length,calls.length===1?1:2);
   return response({message:{content:'Sou ferreiro em Aurora.'},eval_count:20,eval_duration:1000000000});
  }
 });
 assert.deepEqual(calls.map(c=>c.model),['qwen3.5:0.8b','lfm3:latest']);
 const strip=c=>({...c,model:'same'});
 assert.deepEqual(strip(calls[0]),strip(calls[1]));
 assert.deepEqual(progress,[
  'running:qwen3.5:0.8b','result:qwen3.5:0.8b',
  'running:lfm3:latest','result:lfm3:latest'
 ]);
 assert.equal(results[0].metrics.tokensPerSecond,20);
 assert.equal(results[1].answer,'Sou ferreiro em Aurora.');
 assert.equal(results[1].echoed,false);
});

test('exibe o eco REAL, sem substituir por diálogo pronto nem repetir geração',async()=>{
 let requests=0;
 const result=await testModel(ctx,'lfm3:latest',{fetchImpl:async()=>{
  requests++;return response({message:{content:ctx.question}});
 }});
 assert.equal(requests,1);
 assert.equal(result.status,'ok');
 assert.equal(result.echoed,true);
 assert.equal(result.answer,ctx.question);
});

test('falha de um modelo não oculta resposta do outro',async()=>{
 const results=await compareModels(ctx,'qwen3.5:0.8b','lfm3:latest',{
  fetchImpl:async (_url,opts)=>{
   const {model}=JSON.parse(opts.body);
   return model==='qwen3.5:0.8b'?response({error:'model not found'},404):
     response({message:{content:'Forjo espadas para os moradores.'}});
  }
 });
 assert.equal(results[0].status,'error');
 assert.match(results[0].error,/404/);
 assert.equal(results[1].status,'ok');
});

test('evita testar dois nomes iguais ou pergunta vazia',async()=>{
 await assert.rejects(compareModels(ctx,'lfm3','lfm3'),/diferentes/);
 await assert.rejects(testModel({...ctx,question:' '},'lfm3'),/pergunta/);
 assert.equal(EXAMPLE_QUESTIONS.length,4);
});

test('cancelamento interrompe a comparação antes do segundo modelo',async()=>{
 const abort=new AbortController(),calls=[];
 await assert.rejects(compareModels(ctx,'qwen3.5:0.8b','lfm3:latest',{
  signal:abort.signal,
  fetchImpl:async (_url,opts)=>{
   calls.push(JSON.parse(opts.body).model);
   abort.abort();
   return response({message:{content:'Minha forja é importante.'}});
  }
 }),err=>err.name==='AbortError');
 assert.deepEqual(calls,['qwen3.5:0.8b']);
});

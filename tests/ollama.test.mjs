import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODEL, checkOllama, makeOllamaRequest, askOllama } from '../src/ollama.js';

const npc={name:'Lina',role:'merchant',biography:'Comerciante falante',hour:'12:00',
  relationship:5,memories:[],history:[],question:'Onde fica a praça?'};
const respond=(body,status=200)=>({
  ok:status>=200&&status<300,status,
  json:async()=>body,
  text:async()=>JSON.stringify(body)
});

test('usa o modelo 0.8B e desativa thinking e streaming',()=>{
  const request=makeOllamaRequest(npc);
  assert.equal(DEFAULT_MODEL,'qwen3.5:0.8b');
  assert.equal(request.model,DEFAULT_MODEL);
  assert.equal(request.stream,false);
  assert.equal(request.think,false);
  assert.equal(request.options.num_ctx,2048);
  assert.equal(request.messages.at(-1).content,npc.question);
});

test('confere Ollama em /api/tags usando proxy local',async()=>{
  let path;
  const result=await checkOllama({fetchImpl:async(url)=>{
    path=url;return respond({models:[{name:'qwen3.5:0.8b'},{name:'qwen2.5:1.5b'}]});
  }});
  assert.equal(path,'/api/ollama/tags');
  assert.equal(result.model,'qwen3.5:0.8b');
});

test('erro amigável quando modelo não instalado',async()=>{
  await assert.rejects(checkOllama({fetchImpl:async()=>respond({models:[]})}),/ollama pull qwen3.5:0.8b/);
});

test('envia prompt do NPC e recebe texto da API chat',async()=>{
  const payloads=[];let endpoint;
  const reply=await askOllama(npc,{fetchImpl:async(path,opts)=>{
    endpoint=path;payloads.push(JSON.parse(opts.body));
    return respond({message:{role:'assistant',content:'A praça fica perto do mercado, viajante.'}});
  }});
  assert.equal(endpoint,'/api/ollama/chat');
  assert.equal(payloads[0].model,'qwen3.5:0.8b');
  assert.equal(payloads[0].messages[0].role,'system');
  assert.equal(reply,'A praça fica perto do mercado, viajante.');
});

test('repete a geração uma vez quando modelo apenas ecoa jogador',async()=>{
 let count=0;
 const reply=await askOllama(npc,{fetchImpl:async()=>{
  count++;
  return respond({message:{content:count===1?npc.question:'A praça está no centro da vila.'}});
 }});
 assert.equal(count,2);
 assert.equal(reply,'A praça está no centro da vila.');
});

test('não repete erro HTTP 500',async()=>{
 let count=0;
 await assert.rejects(askOllama(npc,{fetchImpl:async()=>{
  count++;return respond({error:'falha'},500);
 }}),/HTTP 500/);
 assert.equal(count,1);
});

test('erro honesto quando Ollama não pode ser acessado',async()=>{
 await assert.rejects(checkOllama({fetchImpl:async()=>{throw new TypeError('Network error');}}),/inacessível/);
});

test('não exibe texto vazio ou thinking sem content',async()=>{
 await assert.rejects(askOllama(npc,{fetchImpl:async()=>
   respond({message:{thinking:'thinking text',content:''}})
 }),/não retornou texto/);
});

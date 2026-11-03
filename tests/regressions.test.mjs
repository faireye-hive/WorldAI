import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldAIEngine} from '../src/world.js';
import {RPGWorld} from '../src/rpg.js';
import {detectIntent,decideNPCAction,completePendingIntent} from '../src/npc-actions.js';
import {reviewDialogue,reflectOnConversation} from '../src/dialogue-lab.js';
import {scheduleOllama} from '../src/ollama-queue.js';

const makeWorld=()=>{
 const world=new WorldAIEngine();
 const rpg=new RPGWorld(world);
 return {world,rpg,npc:world.actors.get('lina')};
};
const ctx={name:'Lina',role:'merchant',biography:'Comerciante gentil',
 description:'Vende pão na vila',question:'Onde fica o mercado?',
 history:[],memories:[],allowedActions:['buy','sell','guide']};
const response=(content,status=200)=>({
 ok:status>=200&&status<300,status,
 json:async()=>({message:{content}}),text:async()=>String(content)
});

test('Me vende um: pede qual item, sem chamar modelo nem gastar ouro',async()=>{
 const {rpg,npc}=makeWorld();
 let calls=0;
 const intent=detectIntent('Me vende um');
 assert.equal(intent.action,'buy');
 assert.equal(intent.item,null);
 const result=await decideNPCAction('Me vende um',npc,rpg,{
  fetchImpl:async()=>{calls++;return response('{"action":"sell","item":"ferro","place":"forja"}');}
 });
 assert.equal(result.mode,'clarify');
 assert.equal(result.proposal,null);
 assert.match(result.message,/Qual item você quer comprar/);
 assert.match(result.message,/Pão/);
 assert.equal(calls,0);
 assert.equal(rpg.gold,60);
 assert.equal(rpg.profile(npc.id).stock.pao,8);
});

test('resposta curta "um pão" completa compra após esclarecimento',async()=>{
 const {rpg,npc}=makeWorld();
 const pending={actorId:npc.id,action:'buy',expiresAt:Date.now()+90000};
 const action=completePendingIntent('um pão',pending,npc.id);
 assert.equal(action.action,'buy');assert.equal(action.item,'pao');
 assert.equal(action.quantity,1);
 const planned=await decideNPCAction('um pão',npc,rpg,{
  intentOverride:action,fetchImpl:async()=>{throw Error('Não chamar a IA')}
 });
 assert.equal(planned.proposal.item,'pao');
 const done=rpg.perform(npc.id,planned.proposal);
 assert.equal(done.ok,true);assert.equal(rpg.gold,55);
 assert.equal(rpg.bag.pao,1);
 assert.equal(rpg.profile(npc.id).stock.pao,7);
});

test('pedido curto não permite agir em outro NPC',()=>{
 const pending={actorId:'lina',action:'buy'};
 assert.equal(completePendingIntent('um pão',pending,'marcus'),null);
 assert.deepEqual(completePendingIntent('cancelar',pending,'lina'),{cancelled:true});
});

test('LFM3 não pode inverter intenção ou inventar lugar quando pedido é vago',async()=>{
 const {rpg,npc}=makeWorld();
 let requests=0;
 const result=await decideNPCAction('Me guie até um lugar seguro',npc,rpg,{
  fetchImpl:async()=>{
   requests++;
   return response('{"action":"sell","place":"forja","item":"ferro","quantity":1}');
  }
 });
 assert.equal(requests,1);
 assert.equal(result.mode,'clarify');
 assert.equal(result.proposal,null);
 assert.match(result.message,/Para onde deseja ir/);
 assert.equal(rpg.escort,null);
});
test('pão e poções são identificados sem forçar interpretação criativa',()=>{
 assert.equal(detectIntent('Me vende um pão').item,'pao');
 assert.equal(detectIntent('Quero comprar duas poções de vida').quantity,2);
 assert.equal(detectIntent('Quero comprar duas poções de vida').item,'pocao');
 assert.equal(detectIntent('Me dê uma maçã').item,'maca');
 assert.equal(detectIntent('Quero vender ferro').action,'sell');
});

test('review usa schema e aceita segunda resposta JSON depois de conteúdo inválido',async()=>{
 let calls=0,formats=[];
 const value=await reviewDialogue(ctx,'O mercado fica na praça.',{
  model:'lfm3:latest',
  fetchImpl:async(_,options)=>{
   const body=JSON.parse(options.body);formats.push(body.format);
   calls++;
   return response(calls===1?'não consegui criar json':
     JSON.stringify({adequate:true,score:4,reason:'Respondeu',improvement:''}));
  }
 });
 assert.equal(calls,2);
 assert.equal(formats[0].type,'object');
 assert.equal(formats[1],'json');
 assert.equal(value.adequate,true);
 assert.equal(value.score,4);
});

test('erro HTTP 500 é detalhado e uma única nova tentativa é feita',async()=>{
 let calls=0;
 const review=await reviewDialogue(ctx,'O mercado fica na praça.',{
  model:'lfm3:latest',fetchImpl:async()=>{
   calls++;
   return calls===1?response('{"error":"temporary failure"}',500):
     response(JSON.stringify({adequate:true,score:5,reason:'Tudo certo',improvement:''}));
  }
 });
 assert.equal(calls,2);assert.equal(review.adequate,true);
});

test('reflection tem schema adequado e mais tokens, sem expor raciocínio oculto',async()=>{
 let body;
 const result=await reflectOnConversation(ctx,'A loja está na praça.',{
  model:'lfm3:latest',fetchImpl:async(_,options)=>{
   body=JSON.parse(options.body);
   return response(JSON.stringify({
     opinion:'O visitante procura o mercado',insight:'Perguntou onde fica a loja',
     feeling:'curioso',trustChange:0,opennessChange:1,patienceChange:0
   }));
  }
 });
 assert.equal(body.format.type,'object');
 assert.ok(body.options.num_predict>=300);
 assert.equal(result.feeling,'curioso');
 assert.equal(result.trustChange,0);
});

test('fila prioriza o jogador antes de revisões aguardando',async()=>{
 const order=[];
 let release;
 const first=scheduleOllama(()=>new Promise(done=>{release=done;order.push('primeiro');}));
 await Promise.resolve();
 const background=scheduleOllama(()=>{order.push('background');},{priority:'background'});
 const foreground=scheduleOllama(()=>{order.push('foreground');},{priority:'foreground'});
 release();
 await Promise.all([first,background,foreground]);
 assert.deepEqual(order,['primeiro','foreground','background']);
});

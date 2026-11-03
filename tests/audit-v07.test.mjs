import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldAIEngine,WORLD_MINUTES_PER_SECOND} from '../src/world.js';
import {RPGWorld} from '../src/rpg.js';
import {buildNPCMessages} from '../src/dialogue.js';
import {sanitizeReview,sanitizeReflection} from '../src/dialogue-lab.js';
import {objectiveDialogueIssues} from '../src/quality.js';
import {unavailableGoods,unavailableItemReply,decideNPCAction,clarificationFor} from '../src/npc-actions.js';

const fixture=()=>{
 const world=new WorldAIEngine();
 const rpg=new RPGWorld(world);
 return {world,rpg,lina:world.actors.get('lina'),marcus:world.actors.get('marcus')};
};

test('catálogo real acompanha o contexto e não promete armaduras',()=>{
 const {world,rpg,lina}=fixture();
 const c=world.getConversationContext(lina);
 assert.equal(c.inventory.find(x=>x.id==='pao').stock,8);
 assert.equal(c.catalog.some(x=>x.name==='Armadura'),false);
 assert.ok(c.vendors.find(x=>x.name==='Marcus').items.includes('Minério de Ferro'));
 const prompt=buildNPCMessages({...c,question:'Você conhece uma loja?'}).at(0).content;
 assert.match(prompt,/WEAPONS AND ARMOR/);
 assert.match(prompt,/Marcus/);
 assert.match(prompt,/Pão/);
 assert.match(prompt,/moedas/);
});

test('prompt conserva três pares de diálogo em vez de uma única memória',()=>{
 const {world,lina}=fixture();
 for(const [q,a] of [
  ['Quero uma armadura','Não tenho armadura cadastrada.'],
  ['Você conhece a forja?','A forja existe ao sul da vila.'],
  ['Pode me mostrar a forja?','Sim, posso mostrar o caminho no mapa.'],
  ['Obrigado','De nada, viajante.']
 ])world.interact(lina,q,a,'ollama');
 const messages=buildNPCMessages({...world.getConversationContext(lina),question:'Você lembra o que eu queria?'});
 const history=messages.slice(1);
 assert.equal(history.filter(x=>x.role==='assistant').length,3);
 assert.equal(history[0].content,'Você conhece a forja?');
 assert.equal(history.at(-1).content,'Você lembra o que eu queria?');
 assert.equal(history[history.length-2].content,'De nada, viajante.');
});

test('identifica produtos ausentes mas não confunde com produtos existentes',async()=>{
 const {rpg,lina,marcus}=fixture();
 assert.deepEqual(unavailableGoods('Quero comprar uma armadura e uma espada'),['armaduras e escudos','armas']);
 assert.deepEqual(unavailableGoods('Preciso de pão e uma poção'),[]);
 const answer=unavailableItemReply(marcus,rpg,'uma armadura');
 assert.match(answer,/não existem.*armaduras/i);
 assert.match(answer,/Minério de Ferro/);
 assert.doesNotMatch(answer,/Pão \(/);
 const result=await decideNPCAction('Quero comprar uma armadura',lina,rpg,{
  fetchImpl:async()=>{throw Error('Não deveria chamar Ollama')}
 });
 assert.equal(result.mode,'unavailable');
 assert.equal(result.proposal,null);
 assert.equal(rpg.gold,60);
});

test('esclarecimento do Marcus usa o produto do estoque dele, não pão',()=>{
 const {rpg,marcus}=fixture();
 const message=clarificationFor(marcus,rpg,{action:'buy'});
 assert.match(message,/Minério de Ferro/);
 assert.doesNotMatch(message,/por exemplo: "um pão"/);
});

test('auditoria não aceita venda de armadura inventada mesmo com nota LFM3 4/5',()=>{
 const answer='Claro! Na Forja aí perto, a gente tem armaduras e armas.';
 const context={question:'Você me ajuda a encontrar uma?',
  inventory:[{name:'Pão',stock:8}],catalog:[{name:'Pão'}]};
 const problems=objectiveDialogueIssues(context,answer);
 assert.equal(problems.length,1);
 const validated=sanitizeReview({adequate:true,score:4,reason:'Resposta simpática'},context.question,answer,context);
 assert.equal(validated.adequate,false);
 assert.equal(validated.score,2);
 assert.match(validated.reason,/armaduras/);
});

test('auditoria permite negar itens inexistentes e desconfia de tarefas não confirmadas',()=>{
 const context={question:'Quero comprar armadura'};
 assert.deepEqual(objectiveDialogueIssues(context,'Desculpe, não tenho armaduras ou armas disponíveis.'),[]);
 assert.equal(objectiveDialogueIssues(context,'Já preparei uma poção para você.').length,1);
 assert.deepEqual(objectiveDialogueIssues({...context,confirmedAction:true},'Já preparei uma poção para você.'),[]);
});

test('reflexão rejeita confusão de NPC e visitante documentada nos logs',()=>{
 const ctx={name:'Lina',species:'human',question:'Oi, Lina, você é linda'};
 const reflected=sanitizeReflection({
  opinion:'Linda parece genuinamente feliz em conhecer alguém novo e se apresenta como comerciante',
  insight:'Ela respondeu com entusiasmo',feeling:'curioso',
  trustChange:1,opennessChange:2,patienceChange:1
 },ctx);
 assert.match(reflected.opinion,/O visitante disse/);
 assert.equal(reflected.trustChange,0);
 assert.equal(reflected.opennessChange,0);
});

test('pergunta neutra não cria confiança ou desconfiança automaticamente',()=>{
 const r=sanitizeReflection({
  opinion:'O visitante perguntou se Soren é guarda.',insight:'Perguntou pela profissão',
  feeling:'curioso',trustChange:-3,opennessChange:1,patienceChange:1
 },{name:'Soren',species:'human',question:'Oi, você é guarda da vila?'});
 assert.equal(r.trustChange,0);
});

test('criaturas são silenciosas por padrão mas podem ser mágicas no editor',()=>{
 const {rpg,world}=fixture();
 assert.equal(rpg.profile('wolf2').canSpeak,false);
 assert.equal(rpg.profile('lina').canSpeak,true);
 assert.equal(rpg.setProfile('wolf2',{canSpeak:true}),true);
 assert.equal(world.getConversationContext(world.actors.get('wolf2')).canSpeak,true);
 const restored=new RPGWorld(new WorldAIEngine());
 assert.equal(restored.import(rpg.export()),true);
 assert.equal(restored.profile('wolf2').canSpeak,true);
});

test('relógio caminha em ritmo de jogo e neutralidade não gera amizade',()=>{
 const w=new WorldAIEngine();
 assert.equal(WORLD_MINUTES_PER_SECOND,0.25);
 const original=w.time;
 for(let i=0;i<100;i++)w.tick(0.08);
 assert.ok(Math.abs((w.time-original)-2)<0.05);
 const actor=w.actors.get('soren');
 w.interact(actor,'Oi','Bom dia','ollama');
 assert.equal(actor.relationship,0);
});

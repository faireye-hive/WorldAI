import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldAIEngine} from '../src/world.js';
import {RPGWorld, ITEMS,PLACES} from '../src/rpg.js';
import {detectIntent, decideNPCAction} from '../src/npc-actions.js';

const create=()=>{const world=new WorldAIEngine();const rpg=new RPGWorld(world);return {world,rpg};};
test('NPCs recebem permissões e estoques separados por profissão',()=>{
 const {rpg}=create();
 assert.deepEqual(rpg.profile('lina').actions,['guide','buy','sell']);
 assert.equal(rpg.profile('lina').stock.pocao,5);
 assert.equal(rpg.profile('soren').actions.includes('buy'),false);
 assert.equal(rpg.profile('iris').stock.erva,7);
});
test('comprar troca moedas e estoque, sem criar itens',()=>{
 const {world,rpg}=create();
 const before=rpg.gold;
 const r=rpg.perform('lina',{action:'buy',item:'pocao',quantity:2});
 assert.equal(r.ok,true);
 assert.equal(rpg.gold,before-2*15);
 assert.equal(rpg.bag.pocao,2);
 assert.equal(rpg.profile('lina').stock.pocao,3);
 assert.equal(world.actors.get('lina').memories.at(-1).type,'trade');
});
test('venda requer item na bolsa e respeita dinheiro do NPC',()=>{
 const {rpg}=create();
 assert.equal(rpg.perform('lina',{action:'sell',item:'pocao',quantity:1}).ok,false);
 const old=rpg.gold;
 assert.equal(rpg.perform('lina',{action:'sell',item:'erva',quantity:1}).ok,true);
 assert.equal(rpg.bag.erva,1);
 assert.equal(rpg.gold,old+4);
 rpg.profile('lina').gold=0;
 assert.equal(rpg.perform('lina',{action:'sell',item:'erva',quantity:1}).ok,false);
});
test('doação só existe quando permitida e com estoque real',()=>{
 const {world,rpg}=create();
 world.player.x=world.actors.get('iris').x;world.player.y=world.actors.get('iris').y;
 assert.equal(rpg.perform('lina',{action:'give',item:'pocao'}).ok,false);
 const stock=rpg.profile('iris').stock.erva;
 assert.equal(rpg.perform('iris',{action:'give',item:'erva',quantity:1}).ok,true);
 assert.equal(rpg.profile('iris').stock.erva,stock-1);
 assert.equal(rpg.perform('iris',{action:'give',item:'erva',quantity:10}).ok,false);
});
test('validadores bloqueiam personagem distante, ações sem permissão e item falso',()=>{
 const {world,rpg}=create();
 world.player.x=40;world.player.y=40;
 assert.equal(rpg.perform('lina',{action:'buy',item:'pocao'}).ok,false);
 world.player.x=418;world.player.y=259;
 assert.equal(rpg.perform('lina',{action:'buy',item:'diamantes'}).ok,false);
 assert.equal(rpg.perform('lina',{action:'buy',item:'pocao',quantity:200}).ok,false);
 assert.equal(rpg.perform('lina',{action:'teleport'}).ok,false);
 assert.equal(rpg.perform('lina',{action:'buy',item:'pocao',quantity:9}).ok,false);
});
test('guia controla NPC e jogador em direção ao ponto válido',()=>{
 const {world,rpg}=create();
 const npc=world.actors.get('lina');
 const out=rpg.perform('lina',{action:'guide',place:'ponte'});
 assert.equal(out.ok,true);assert.equal(rpg.escort.placeId,'ponte');
 const old=npc.x;
 for(let i=0;i<30;i++){world.tick(.08);rpg.tick(.08);}
 assert.ok(npc.x>old);
 assert.equal(npc.state,'guiding');
 assert.ok(world.player.target);
 assert.deepEqual(PLACES.find(p=>p.id==='ponte').x,575);
});
test('edita personagem e contexto do modelo muda imediatamente',()=>{
 const {world,rpg}=create();
 assert.equal(rpg.setProfile('marcus',{
  name:'Arlen',role:'merchant',description:'Vende poções perto da praça',
  biography:'Alegre',actions:['guide','buy'],stock:{pocao:3},gold:80
 }),true);
 const actor=world.actors.get('marcus'),c=world.getConversationContext(actor);
 assert.equal(actor.name,'Arlen');
 assert.equal(c.role,'merchant');
 assert.match(c.description,/poções/);
 assert.equal(c.inventory[0].id,'pocao');
 assert.deepEqual(c.allowedActions,['guide','buy']);
});
test('cria NPC novo e restaura perfil e identidade em outra instância',()=>{
 const {world,rpg}=create();
 const result=rpg.createNPC({name:'Mia',role:'merchant',title:'Mercadora de frutas',
 biography:'Simpática',stock:{maca:5},actions:['buy','guide'],gold:60,x:500,y:330});
 assert.equal(result.ok,true);
 assert.equal(world.actors.size,11);
 world.select(result.actor.id);
 const saved=rpg.export();
 const other=create();
 assert.equal(other.rpg.import(saved),true);
 assert.equal(other.world.actors.size,11);
 assert.equal(other.world.actors.get(result.actor.id).name,'Mia');
 assert.equal(other.rpg.profile(result.actor.id).stock.maca,5);
 assert.deepEqual(other.rpg.profile(result.actor.id).actions,['guide','buy']);
});
test('detecta comandos explícitos em português sem agir em conversa normal',()=>{
 assert.deepEqual(detectIntent('Me leve até a ponte'),{action:'guide',place:'ponte',item:null,quantity:1});
 assert.deepEqual(detectIntent('Quero comprar 2 poções de vida'),{action:'buy',place:null,item:'pocao',quantity:2});
 assert.deepEqual(detectIntent('Me dê uma erva medicinal'),{action:'give',place:null,item:'erva',quantity:1});
 assert.equal(detectIntent('Você conhece a floresta?'),null);
});
test('quando alvo da ação é ambíguo, LLM pode sugerir local permitido',async()=>{
 const {world,rpg}=create();
 const input='Me guie até um lugar seguro';
 let calls=0;
 const planned=await decideNPCAction(input,world.actors.get('lina'),rpg,{
  fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({message:{content:'{"action":"guide","place":"estalagem","item":null,"quantity":1}'}})};}
 });
 assert.equal(calls,1);
 assert.equal(planned.proposal.place,'estalagem');
 assert.equal(rpg.perform('lina',planned.proposal).ok,true);
});
test('comando não pede avaliação de IA quando tipo e alvo já são claros',async()=>{
 const {world,rpg}=create();
 const result=await decideNPCAction('Me venda uma poção',world.actors.get('lina'),rpg,{
  fetchImpl:async()=>{throw Error('não deveria chamar modelo')}
 });
 assert.equal(result.mode,'rules');assert.equal(result.proposal.action,'buy');
});

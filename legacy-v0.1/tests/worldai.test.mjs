import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldAI,SeededRandom,findPath,createDemoWorld,candidateActions,contextFor} from '../src/index.js';

test('cenário inicia com 10 personagens, recursos e obstáculos',()=>{
 const world=createDemoWorld();
 assert.equal(world.actors.size,10);assert.equal(world.resources.length,5);assert.equal(world.obstacles.length,5);
 assert.ok([...world.actors.values()].every(a=>world.isWalkable(a.position)));
});
test('simulação produz decisões reais sem depender de modelo externo',()=>{
 const world=createDemoWorld();let decisions=0;
 world.on('decision',()=>decisions++);
 for(let i=0;i<1100;i++)world.step(.05);
 assert.ok(decisions>10,`Apenas ${decisions} decisões`);
 assert.ok([...world.actors.values()].some(a=>a.memory.length>0));
 assert.ok([...world.actors.values()].every(a=>world.isWalkable(a.position)), 'nenhum agente pode atravessar obstáculos');
});
test('resultado é determinístico para mesma semente',()=>{
 const a=createDemoWorld(12),b=createDemoWorld(12);
 for(let i=0;i<190;i++){a.step(.05);b.step(.05);}
 assert.deepEqual(a.serialize(),b.serialize());
});
test('pathfinding A* contorna obstáculos',()=>{
 const path=findPath({x:10,y:50},{x:190,y:50},{width:200,height:140},[{x:80,y:20,w:40,h:65}],10);
 assert.ok(path.length>0);
 assert.ok(path.some(p=>p.y>90));
});
test('fome, descanso e memória evoluem; interação lembra do jogador',()=>{
 const w=createDemoWorld();const a=w.actors.get('marcus');const hunger=a.needs.hunger;
 w.interact('marcus',{kind:'help',text:'Trouxe ferro.'});
 assert.ok(a.relations.player>=12);
 assert.equal(a.memory.at(-1).type,'player_interaction');
 w.step(.1);assert.ok(a.needs.hunger>hunger);
});
test('fuga é sugerida quando existe predador por perto',()=>{
 const w=createDemoWorld();const a=w.actors.get('deer_1'),pred=w.actors.get('wolf_1');
 pred.position={x:a.position.x+18,y:a.position.y};
 const options=candidateActions(w,a,contextFor(w,a));
 assert.ok(options.some(o=>o.action==='flee'&&o.targetId===pred.id));
});
test('save/load mantém estado e continua simulação',()=>{
 const w=createDemoWorld();for(let i=0;i<100;i++)w.step(.05);
 const copy=WorldAI.fromJSON(JSON.stringify(w.serialize()));
 assert.deepEqual(copy.serialize(),w.serialize());
 for(let i=0;i<70;i++){w.step(.05);copy.step(.05);}
 assert.deepEqual(copy.serialize(),w.serialize());
});
test('modelo só pode solicitar ações da whitelist',async()=>{
 const w=new WorldAI({width:300,height:220});
 const a=w.addActor({id:'n1',name:'N1',kind:'npc',position:{x:100,y:100}});
 let rejected=0,approved=0;
 w.on('ai_rejected',()=>rejected++);w.on('decision',e=>{if(e.origin==='model')approved++;});
 w.setDecisionProvider(async()=>({action:'rm -rf /'}),{interval:2,maxConcurrent:1});
 a.nextAICallAt=0;
 w.step(.6);await new Promise(r=>setTimeout(r,10));
 assert.equal(rejected,1);assert.equal(approved,0);
 w.setDecisionProvider(async()=>({action:'rest'}),{interval:2,maxConcurrent:1});
 a.nextDecisionAt=w.time;a.nextAICallAt=0;
 w.step(.1);await new Promise(r=>setTimeout(r,10));
 assert.equal(approved,1);
});
test('diálogo retorna fallback offline e grava resposta',async()=>{
 const w=createDemoWorld();const answer=await w.talk('marcus','Qual é o seu nome?');
 assert.match(answer,/Marcus/);assert.ok(w.actors.get('marcus').memory.some(m=>m.type==='dialogue'));
});
test('RNG produz sequência reproduzível',()=>{
 const a=new SeededRandom(45),b=new SeededRandom(45);
 assert.deepEqual(Array.from({length:10},()=>a.next()),Array.from({length:10},()=>b.next()));
});

test('ferreiro consegue terminar trabalho no cenário real',()=>{
 const w=createDemoWorld();let worked=0;
 w.on('worked',()=>worked++);
 for(let i=0;i<2600;i++)w.step(.05);
 assert.ok(worked>0,'esperava ao menos uma tarefa de NPC concluída');
});

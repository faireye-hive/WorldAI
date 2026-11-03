import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldAIEngine } from '../src/world.js';

test('inicia dez personagens e cinco moradores',()=>{const w=new WorldAIEngine();assert.equal(w.actors.size,10);assert.equal([...w.actors.values()].filter(x=>x.species==='human').length,5);});
test('cada personagem mantém conversa e memória individuais',()=>{const w=new WorldAIEngine();const lina=w.select('lina');const marcus=w.actors.get('marcus');w.interact(lina,'Olá','Seja bem-vindo!','script');assert.equal(lina.history.length,2);assert.equal(lina.memories.length,1);assert.equal(marcus.memories.length,0);});
test('diálogo de roteiro não inventa recompensas',()=>{const w=new WorldAIEngine();const a=w.select('marcus');assert.match(w.scriptedReply(a,'Você precisa de ajuda?'),/minério/i);});
test('salvar e restaurar mantém memória e relacionamento',()=>{const w=new WorldAIEngine();const a=w.select('iris');w.interact(a,'Olá','Oi','script');assert.equal(a.relationship,0);a.relationship=7;const next=new WorldAIEngine();assert.equal(next.import(w.export()),true);assert.equal(next.actors.get('iris').history.length,2);assert.equal(next.actors.get('iris').relationship,7);});
test('rejeita save incompatível',()=>{const w=new WorldAIEngine();assert.equal(w.import({version:999,actors:[]}),false);});
test('animais reagem ao perigo sem modelo externo',()=>{const w=new WorldAIEngine();const deer=w.actors.get('deer1'),wolf=w.actors.get('wolf1');wolf.x=deer.x+15;wolf.y=deer.y+15;w.decide(deer);assert.equal(deer.state,'fleeing');});
test('movimentação não fica fora do mapa',()=>{const w=new WorldAIEngine();w.movePlayer(20000,-500);assert.deepEqual(w.player.target,{x:980,y:20});});
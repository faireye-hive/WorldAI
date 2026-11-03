import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {
  DialogueRecorder,makeLogEvent,createLogExport,formatTranscript
} from '../src/dialogue-recorder.js';

let serial=0;
const create=(sessionId='session-1',dbName='test-worldai-'+(++serial))=>
  new DialogueRecorder({indexedDBImpl:indexedDB,sessionId,dbName});

test('evento mantém idioma, caracteres especiais e copia os detalhes no ato',()=>{
  const details={context:{npc:'Lina',inventory:[{item:'pão'}]}};
  const event=makeLogEvent({
    type:'user_message',actorId:'lina',actorName:'Lina',
    turnId:'t1',model:'lfm3:latest',text:'Me vende um pão?',details
  },'my-session',()=> '2026-11-03T12:00:00.000Z');
  details.context.inventory[0].item='alterado';
  assert.equal(event.at,'2026-11-03T12:00:00.000Z');
  assert.equal(event.sessionId,'my-session');
  assert.equal(event.text,'Me vende um pão?');
  assert.equal(event.details.context.inventory[0].item,'pão');
});

test('grava todos os turnos sem limite antigo de 10 mensagens',async()=>{
  const recorder=create();
  const jobs=[];
  for(let i=0;i<40;i++){
    jobs.push(recorder.record({type:i%2?'npc_message':'user_message',
      actorId:'lina',actorName:'Lina',turnId:'t'+Math.floor(i/2),
      text:'fala '+i}));
  }
  await Promise.all(jobs);
  const events=await recorder.list();
  assert.equal(events.length,40);
  assert.equal(await recorder.count(),40);
  assert.equal(events[0].text,'fala 0');
  assert.equal(events.at(-1).text,'fala 39');
});

test('sessões e NPCs diferentes persistem após reabrir o mesmo IndexedDB',async()=>{
  const dbName='test-worldai-'+(++serial);
  const first=create('sessao-A',dbName);
  await first.record({type:'user_message',actorId:'lina',text:'Onde fica a praça?'});
  await first.record({type:'npc_message',actorId:'lina',text:'No centro da vila.'});
  const otherTab=create('sessao-B',dbName);
  await otherTab.record({type:'user_message',actorId:'marcus',text:'Bom dia'});
  const afterReload=create('sessao-A',dbName);
  assert.equal((await afterReload.list()).length,3);
  assert.equal((await afterReload.list({sessionId:'sessao-A'})).length,2);
  assert.equal((await afterReload.list({actorId:'marcus'})).length,1);
  assert.deepEqual((await afterReload.list({newest:true,limit:2})).map(e=>e.text),
    ['Bom dia','No centro da vila.']);
});

test('exporta JSON completo e TXT legível com falha, modelo e resposta revista',async()=>{
  const recorder=create();
  await recorder.record({type:'user_message',actorName:'Lina',actorId:'lina',
    turnId:'t1',text:'Me vende um pão?'});
  await recorder.record({type:'npc_message',actorName:'Lina',actorId:'lina',
    turnId:'t1',model:'lfm3:latest',text:'Qual item você quer comprar?'});
  await recorder.record({type:'model_attempt',actorName:'Lina',actorId:'lina',
    turnId:'t1',model:'lfm3:latest',text:'{malformed'});
  await recorder.record({type:'reflection_error',actorName:'Lina',actorId:'lina',
    turnId:'t1',text:'A IA retornou um formato inválido.'});
  await recorder.record({type:'rewrite',actorName:'Lina',actorId:'lina',
    turnId:'t1',text:'O pão custa 5 moedas.'});
  const payload=createLogExport(await recorder.list());
  const roundTrip=JSON.parse(JSON.stringify(payload));
  assert.equal(roundTrip.totalEvents,5);
  assert.equal(roundTrip.events[2].text,'{malformed');
  assert.equal(roundTrip.events.at(-1).type,'rewrite');
  const readable=formatTranscript(roundTrip.events);
  assert.match(readable,/Me vende um pão/);
  assert.match(readable,/LFM3|lfm3:latest/);
  assert.match(readable,/ERRO DE REFLEXÃO/);
  assert.match(readable,/O pão custa 5 moedas/);
});

test('limpeza manual apaga arquivo, mas não altera estado de outras instâncias',async()=>{
  const dbName='test-worldai-'+(++serial);
  const recorder=create('session-1',dbName);
  await recorder.record({type:'user_message',text:'olá'});
  assert.equal(await recorder.count(),1);
  await recorder.clear();
  assert.equal((await recorder.list()).length,0);
  const again=create('session-2',dbName);
  assert.equal(await again.count(),0);
  await again.record({type:'npc_message',text:'novo começo'});
  assert.equal(await recorder.count(),1);
});

test('falha de armazenamento é explícita e não bloqueia gravações futuras',async()=>{
  const recorder=new DialogueRecorder({indexedDBImpl:null,sessionId:'off'});
  await assert.rejects(recorder.record({type:'user_message',text:'fala'}),/indisponível/);
  await assert.rejects(recorder.list(),/indisponível/);
  assert.equal(recorder.failed,1);
  assert.ok(recorder.lastError);
});

test('texto importado não pode executar HTML, pois exportador preserva apenas dados',()=>{
  const event=makeLogEvent({type:'user_message',
    text:'<img src=x onerror=alert(1)>'},'test');
  assert.equal(event.text,'<img src=x onerror=alert(1)>');
  assert.equal(createLogExport([event]).events[0].type,'user_message');
});

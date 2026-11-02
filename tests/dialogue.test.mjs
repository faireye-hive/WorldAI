import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNPCMessages, extractNPCReply, isEcho } from '../src/dialogue.js';

const actor = {
  name:'Marcus',role:'smith',biography:'Trabalhador e desconfiado',
  hour:'09:00',question:'Como você se chama?',
  history:[],memories:[]
};

test('aceita resposta gerada como string simples', () => {
  assert.equal(extractNPCReply([{generated_text:'Sou Marcus, o ferreiro desta vila.'}],actor.question),
    'Sou Marcus, o ferreiro desta vila.');
});

test('aceita última fala assistant do formato chat', () => {
  const output=[{generated_text:[
    {role:'system',content:'instruções'},
    {role:'user',content:actor.question},
    {role:'assistant',content:'Meu nome é Marcus. Trabalho na forja.'}
  ]}];
  assert.equal(extractNPCReply(output,actor.question),'Meu nome é Marcus. Trabalho na forja.');
});

test('não interpreta a última fala do usuário como resposta do NPC', () => {
  const output=[{generated_text:[
    {role:'assistant',content:'Olá!'},
    {role:'user',content:actor.question}
  ]}];
  assert.throws(()=>extractNPCReply(output,actor.question),/não gerou/);
});

test('rejeita repetição exata e repetição da pergunta com texto mínimo', () => {
  assert.equal(isEcho('Como você se chama?',actor.question),true);
  assert.equal(isEcho('Como você se chama? Como você se chama?',actor.question),true);
  assert.throws(()=>extractNPCReply([{generated_text:'Como você se chama?'}],actor.question),/repetiu/);
});

test('preserva resposta útil mesmo quando modelo imprime primeiro a pergunta', () => {
  const result=[{generated_text:'Como você se chama? Meu nome é Marcus, sou ferreiro.'}];
  assert.equal(extractNPCReply(result,actor.question),'Meu nome é Marcus, sou ferreiro.');
});

test('aceita saudação válida, mas não eco exato', () => {
  assert.equal(isEcho('Olá, viajante! Posso ajudar?','Olá'),false);
  assert.equal(isEcho('Olá!','Olá'),true);
});

test('não reaproveita exemplos de eco salvo no histórico nem na memória', () => {
 const msgs=buildNPCMessages({
  ...actor,
  history:[
   {role:'user',content:'Onde fica a loja?'},
   {role:'assistant',content:'Onde fica a loja?'}
  ],
  memories:[{type:'conversation',data:'Onde fica a loja? → Onde fica a loja?'}]
 });
 assert.deepEqual(msgs.map(m=>m.role),['system','user']);
 assert.ok(!msgs[0].content.includes('Onde fica a loja?'));
 assert.match(msgs[0].content,/Marcus/);
 assert.match(msgs[0].content,/Brazilian Portuguese/);
});

test('preserva apenas último par de diálogo válido', () => {
 const msgs=buildNPCMessages({
  ...actor,
  history:[
   {role:'user',content:'Onde fica a praça?'},
   {role:'assistant',content:'Fica perto da forja.'},
   {role:'user',content:'Quanto custa?'},
   {role:'assistant',content:'Quanto custa?'}
  ]
 });
 assert.deepEqual(msgs.map(m=>m.role),['system','user','assistant','user']);
 assert.equal(msgs[1].content,'Onde fica a praça?');
 assert.equal(msgs[2].content,'Fica perto da forja.');
});

test('também extrai conteúdo do tipo array de textos',()=>{
 const result=[{generated_text:[{role:'assistant',content:[{type:'text',text:'Trabalho na forja.'}]}]}];
 assert.equal(extractNPCReply(result,'O que você faz?'),'Trabalho na forja.');
});

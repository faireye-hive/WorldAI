import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldAIEngine} from '../src/world.js';
import {RPGWorld} from '../src/rpg.js';
import {SocialMemory} from '../src/social.js';
import {buildNPCMessages} from '../src/dialogue.js';
import {
  sanitizeReview,sanitizeReflection,reviewDialogue,rewriteDialogue,reflectOnConversation,parseJSONObject
} from '../src/dialogue-lab.js';

const context={
  name:'Lina',role:'merchant',biography:'Comerciante falante',
  description:'Vende comida perto do mercado',question:'Onde fica a praça?',
  history:[],memories:[],allowedActions:['buy','guide'],
  social:{opinion:'Ainda não conheço o visitante.',trust:50,openness:50,patience:50,feeling:'neutro'}
};
const okay=data=>({ok:true,json:async()=>({message:{content:typeof data==='string'?data:JSON.stringify(data)}})});
const fixture=()=>{
 const world=new WorldAIEngine();const rpg=new RPGWorld(world);
 const social=new SocialMemory(world);return {world,rpg,social};
};

test('inicia cada NPC com estado social independente e neutro',()=>{
 const {world,social}=fixture();
 assert.equal(social.get('lina').trust,50);
 assert.equal(social.get('marcus').familiarity,0);
 social.markConversation('lina');
 assert.equal(social.get('lina').familiarity,1);
 assert.equal(social.get('marcus').familiarity,0);
 assert.equal(world.getConversationContext(world.actors.get('lina')).social.familiarity,1);
});
test('reflexão precisa de opinião + evidência e limita alterações gradualmente',()=>{
 const {social}=fixture();
 assert.equal(social.applyReflection('lina',{opinion:'',insight:''},'Olá'),false);
 const changed=social.applyReflection('lina',{
  opinion:'O visitante parece interessado na vila',
  insight:'Perguntou sobre o mercado',
  feeling:'curioso',trustChange:99,opennessChange:25,patienceChange:-25
 },'Onde fica o mercado?');
 assert.equal(changed,true);
 assert.equal(social.get('lina').trust,53);
 assert.equal(social.get('lina').openness,52);
 assert.equal(social.get('lina').patience,48);
 assert.equal(social.get('lina').history.length,1);
 assert.equal(social.get('lina').feeling,'curioso');
});
test('socialização persiste em salvar e restaurar, sem tocar em ouro e inventário',()=>{
 const a=fixture();
 a.social.markConversation('lina');
 a.social.applyReflection('lina',{opinion:'O visitante conhece a feira',insight:'Perguntou sobre ervas',trustChange:1},'Ervas?');
 const state=a.social.export();
 const b=fixture();
 assert.equal(b.social.import(state),true);
 assert.equal(b.social.get('lina').opinion,'O visitante conhece a feira');
 assert.equal(b.social.get('lina').trust,51);
 assert.equal(b.rpg.gold,60);
 assert.equal(b.social.get('marcus').trust,50);
 assert.equal(b.social.reset('lina'),true);
 assert.equal(b.social.get('lina').trust,50);
});
test('sanitiza dados malformados e IDs desconhecidos no save social',()=>{
 const {social}=fixture();
 assert.equal(social.import({version:2,states:[]}),false);
 assert.equal(social.import({version:1,states:[
  {id:'ghost',trust:1000,opinion:'ignored'},
  {id:'lina',trust:1000,openness:-99,patience:'bad',history:[],feeling:'inventado'}
 ]}),true);
 assert.equal(social.get('ghost').familiarity,0);
 assert.equal(social.get('lina').trust,100);
 assert.equal(social.get('lina').openness,0);
 assert.equal(social.get('lina').patience,50);
 assert.equal(social.get('lina').feeling,'neutro');
});
test('o prompt do diálogo seguinte inclui opinião e traços sociais',()=>{
 const {world,social}=fixture();
 const npc=world.actors.get('lina');
 social.applyReflection(npc.id,{
  opinion:'O visitante procura a praça',insight:'Perguntou onde fica',feeling:'cauteloso',
  trustChange:-1
 },'Onde fica?');
 const ctx={...world.getConversationContext(npc),question:'Como vai?'};
 const p=buildNPCMessages(ctx)[0].content;
 assert.match(p,/visitante procura a praça/);
 assert.match(p,/cauteloso/);
 assert.match(p,/Trust: 49/);
});
test('avaliação válida, eco prevalece sobre parecer do juiz',()=>{
 assert.deepEqual(sanitizeReview({adequate:true,score:5,reason:'ok'},'Olá','Olá'),
  {adequate:false,score:5,reason:'ok',improvement:''});
 assert.throws(()=>sanitizeReview({adequate:'sim'},'A','B'),/Veredito/);
 assert.deepEqual(parseJSONObject('{"adequate":true}'),{adequate:true});
});
test('avaliador usa contexto, identifica erro e devolve nota',async()=>{
 let body;
 const result=await reviewDialogue(context,'Sou Lina, bem-vindo ao mercado!',{
  model:'lfm3:latest',fetchImpl:async(_,options)=>{
   body=JSON.parse(options.body);
   return okay({adequate:true,score:4,reason:'Respondeu com o NPC',improvement:''});
  }
 });
 assert.equal(body.format,'json');
 assert.equal(body.stream,false);
 assert.equal(body.think,false);
 assert.equal(result.adequate,true);
 assert.equal(result.score,4);
});
test('reflexão usa JSON limitado e não altera mundo diretamente',async()=>{
 const {world,rpg,social}=fixture();
 let calls=0;
 const insight=await reflectOnConversation(context,'A praça fica ao centro.',{
  model:'lfm3:latest',fetchImpl:async()=>{
   calls++;return okay({opinion:'É um viajante curioso',insight:'Perguntou sobre a praça',
    feeling:'curioso',trustChange:12,opennessChange:4,patienceChange:-3});
  }
 });
 assert.equal(calls,1);
 assert.equal(insight.trustChange,3);
 assert.equal(insight.opennessChange,2);
 assert.equal(insight.patienceChange,-2);
 assert.equal(social.applyReflection('lina',insight,context.question),true);
 assert.equal(rpg.gold,60);
 assert.deepEqual(rpg.bag,{erva:2,ferro:1});
 assert.equal(world.actors.get('lina').name,'Lina');
});
test('reescrita mantém dados do mesmo personagem e uma única geração',async()=>{
 let body;
 const answer=await rewriteDialogue(context,'Onde fica a praça?',{
  reason:'Ecoou a pergunta',improvement:'Diga onde está a praça'
 },{
  model:'lfm3:latest',fetchImpl:async(_,options)=>{
   body=JSON.parse(options.body);
   return okay('A praça fica no centro, perto da fonte.');
  }
 });
 assert.equal(body.model,'lfm3:latest');
 assert.match(body.messages[0].content,/Lina/);
 assert.match(body.messages[0].content,/Ecoou/);
 assert.equal(answer,'A praça fica no centro, perto da fonte.');
});

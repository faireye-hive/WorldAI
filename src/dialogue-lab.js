import {objectiveDialogueIssues} from './quality.js';
import {scheduleOllama} from './ollama-queue.js';
import {makeOllamaRequest} from './ollama.js';
import {extractNPCReply, isEcho} from './dialogue.js';

const bound=(v,max)=>String(v??'').trim().slice(0,max);
const finite=(v,lo,hi,defaultValue)=>Number.isFinite(Number(v))
  ?Math.max(lo,Math.min(hi,Math.round(Number(v)))):defaultValue;
export const REVIEW_TIMEOUT_MS=45000;

export function parseJSONObject(raw){
  if(typeof raw!=='string')throw Error('A avaliação não retornou JSON.');
  let value;
  try{value=JSON.parse(raw.trim());}
  catch{
    const match=raw.match(/\{[\s\S]*\}/);
    if(!match)throw Error('A IA retornou um formato inválido.');
    value=JSON.parse(match[0]);
  }
  if(!value||Array.isArray(value)||typeof value!=='object')throw Error('JSON inválido.');
  return value;
}

const REVIEW_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    adequate:{type:'boolean'},score:{type:'integer',minimum:0,maximum:5},
    reason:{type:'string'},improvement:{type:'string'}
  },required:['adequate','score','reason','improvement']
};
const REFLECTION_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    opinion:{type:'string'},insight:{type:'string'},
    feeling:{type:'string',enum:['neutro','curioso','confiante','cauteloso','respeitoso','desconfiado']},
    trustChange:{type:'integer',minimum:-3,maximum:3},
    opennessChange:{type:'integer',minimum:-2,maximum:2},
    patienceChange:{type:'integer',minimum:-2,maximum:2}
  },required:['opinion','insight','feeling','trustChange','opennessChange','patienceChange']
};
const sleep=ms=>new Promise(done=>setTimeout(done,ms));

async function ollamaJSON(messages,{model,fetchImpl=fetch,timeoutMs=REVIEW_TIMEOUT_MS,schema=REVIEW_SCHEMA,onTrace=()=>{}}={}){
  let lastError;
  // First attempt: constrained JSON schema. Second attempt: plain JSON for
  // compatibility with small/older Ollama builds, plus a larger token budget.
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await scheduleOllama(()=>fetchImpl('/api/ollama/chat',{
        method:'POST',headers:{'Content-Type':'application/json'},
        signal:controller.signal,
        body:JSON.stringify({
          model,stream:false,think:false,format:attempt===0?schema:'json',
          keep_alive:'10m',messages,
          options:{temperature:0,num_predict:attempt===0?320:420,num_ctx:3072}
        })
      }),{priority:'background',signal:controller.signal});
      if(!response.ok){
        let details='';
        try{details=String(await response.text()).slice(0,500);}catch{}
        try{onTrace({type:'http_error',attempt:attempt+1,status:response.status,raw:details});}catch{}
        const msg='HTTP '+response.status+(details?': '+details:'');
        const error=new Error(msg);
        // 400 often means constrained format is unsupported; retry using JSON.
        // 500/502/503 could be temporary inference errors; at most one retry.
        if(attempt===0 && [400,429,500,502,503,504].includes(response.status)){
          lastError=error;await sleep(350);continue;
        }
        throw error;
      }
      const json=await response.json();
      const raw=json?.message?.content;
      try{onTrace({type:'response',attempt:attempt+1,status:response.status,
        raw:typeof raw==='string'?raw.slice(0,12000):String(raw)});}catch{}
      try{
        return parseJSONObject(raw);
      }catch(error){
        lastError=new Error('A resposta da IA não continha JSON completo. '+error.message);
        if(attempt===0){await sleep(150);continue;}
        throw lastError;
      }
    }catch(err){
      if(err.name==='AbortError')throw Error('Ollama excedeu '+Math.round(timeoutMs/1000)+'s nesta análise.');
      // Network errors do not improve by repeatedly submitting heavy jobs.
      throw err;
    }finally{clearTimeout(timeout);}
  }
  throw lastError||Error('Ollama não retornou dados válidos.');
}

export function sanitizeReview(data,question,answer,context={}){
  if(typeof data?.adequate!=='boolean')throw Error('Veredito ausente.');
  const reason=bound(data.reason,180);
  if(!reason)throw Error('Motivo ausente.');
  const issues=objectiveDialogueIssues(context,answer);
  // An LLM can approve a fabricated offer with 4/5: hard world facts win.
  return {
    adequate:data.adequate&&!isEcho(answer,question)&&issues.length===0,
    score:issues.length?Math.min(2,finite(data.score,0,5,2)):finite(data.score,0,5,2),
    reason:issues.length?bound(reason+' | '+issues.join(' '),180):reason,
    improvement:issues.length?
      'Responda sem inventar produtos, promessas ou ações concluídas. Use somente o catálogo existente.':
      bound(data.improvement,180)
  };
}

export async function reviewDialogue(context,answer,opts={}){
  const question=bound(context.question,240);
  const result=await ollamaJSON([
    {role:'system',content:
      'Você é um avaliador de DIÁLOGOS DE JOGO, não o personagem. '+
      'Julgue a resposta pelas informações fornecidas, não tente adivinhar o que a pessoa realmente pensa. '+
      'Verifique se responde ao pedido, respeita personagem, evita inventar fatos ou ações realizadas e não repete a pergunta. '+
      'Retorne APENAS JSON: {"adequate":true|false,"score":0-5,"reason":"curto","improvement":"orientação curta"}. '+
      'NÃO aprove uma fala que prometa itens não cadastrados, invente estoque, afirme que uma ação foi concluída sem confirmação ou confunda a identidade. '+
      'Aplique o critério: 5 excelente e fiel aos fatos; 4 relevante e correto; 3 parcialmente útil, mas incompleto; 2 ou menos falha importante. '+
      'Para pedidos de produto inexistente, é CORRETO dizer que não existe no catálogo e oferecer alternativas reais. '+
      'Se houver contradição de inventário ou promessa impossível, adequate=false mesmo que a frase seja simpática.'},
    {role:'user',content:JSON.stringify({
      npc:context.name,species:context.species,
      personality:context.biography,profession:context.role,
      knownFacts:context.description,allowedActions:context.allowedActions,
      inventory:context.inventory||[],catalog:context.catalog||[],
      vendorDirectory:context.vendors||[],
      shopPolicy:'Armas e armaduras não estão implementadas; não podem estar à venda nesta versão.',
      previousTalks:Array.isArray(context.history)?context.history.slice(-4):[],
      playerQuestion:question,npcAnswer:bound(answer,450)
    })}
  ],{...opts,schema:REVIEW_SCHEMA});
  return sanitizeReview(result,question,answer,context);
}

export async function rewriteDialogue(context,previous,review,{
  model,fetchImpl=fetch,timeoutMs=30000,onTrace=()=>{}
}={}){
  const base=makeOllamaRequest(context,model,true);
  // Keep exact same NPC facts. User question remains last, with guidance in system.
  const messages=base.messages.map((entry,index)=>{
    if(index===0)return {...entry,content:entry.content+
      ' Sua primeira resposta foi inadequada. Responda de novo, sem fingir que executou ações ou transações. '+
      'Não repita a pergunta, não crie novos lugares ou itens. '+
      'Feedback: '+bound(review.reason,140)+'. Ajuste: '+bound(review.improvement,140)+
      '. Resposta anterior: '+bound(previous,220)};
    return entry;
  });
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await scheduleOllama(()=>fetchImpl('/api/ollama/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({...base,messages,options:{
        ...base.options,temperature:0.55,num_predict:130
      }})
    }),{priority:'background',signal:controller.signal});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    try{onTrace({type:'response',status:response.status,
      raw:String(data?.message?.content??'').slice(0,12000)});}catch{}
    return extractNPCReply([{generated_text:data?.message?.content}],context.question);
  }finally{clearTimeout(timeout);}
}

export function sanitizeReflection(value,context=null){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Reflexão inválida.');
  let opinion=bound(value.opinion,180),insight=bound(value.insight,180);
  if(!opinion||!insight)throw Error('A IA não forneceu uma percepção válida.');
  let trustChange=finite(value.trustChange,-3,3,0);
  let opennessChange=finite(value.opennessChange,-2,2,0);
  let patienceChange=finite(value.patienceChange,-2,2,0);
  let feeling=['neutro','curioso','confiante','cauteloso','respeitoso','desconfiado']
      .includes(value.feeling)?value.feeling:'neutro';
  if(context){
    const name=String(context.name||'').trim().toLocaleLowerCase('pt-BR');
    const lower=opinion.toLocaleLowerCase('pt-BR');
    const focusesNpc=name.length>1&&(lower.startsWith(name+' ')||lower.startsWith('o '+name+' ')||lower.startsWith('a '+name+' '));
    const focusedAnimal=context.species!=='human' && /^(o lobo|a corca|o cervo|o javali)\b/i.test(lower);
    const original=bound(context.question,125);
    const playerEvidence=original?'O visitante disse: "'+original+'".':'O visitante conversou com este NPC.';
    if(focusesNpc||focusedAnimal){
      // Small models often describe what the NPC said or did, instead of
      // what the NPC thinks of the PLAYER. Do not persist that confusion.
      opinion=bound(playerEvidence,180);
      insight=bound('Interação observada: '+original,180);
      trustChange=0;opennessChange=0;patienceChange=0;feeling='neutro';
    }else{
      const neutralGreeting=/^(oi|ola|bom dia|boa tarde|boa noite|quem e|voce e|qual|onde|tchau)\b/i.test(
        original.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
      // Neutral questions are NOT evidence of trust or distrust.
      if(neutralGreeting)trustChange=0;
    }
  }
  return {opinion,insight,feeling,trustChange,opennessChange,patienceChange};
}

export async function reflectOnConversation(context,answer,{model,fetchImpl=fetch,timeoutMs=REVIEW_TIMEOUT_MS,onTrace=()=>{}}={}){
  const data=await ollamaJSON([
    {role:'system',content:
      'Você atualiza um estado SOCIAL FICTÍCIO de um NPC de RPG. '+
      'O NPC é o OBSERVADOR. O JOGADOR é uma pessoa DIFERENTE. '+
      'O campo opinion deve começar com "O visitante..." e descrever SOMENTE como o NPC interpreta o JOGADOR. '+
      'Não descreva a própria personalidade, fala ou sentimentos do NPC como opinião sobre o jogador. '+
      'O campo insight deve conter evidência da mensagem do JOGADOR, não da resposta do NPC. '+
      'Não exponha cadeia de pensamento nem raciocínio interno. Produza resumos narrativos curtos. '+
      'Não infira dados sensíveis da pessoa real ou fatos ausentes do diálogo. '+
      'Agradecimentos ou atos explícitos podem afetar confiança levemente; perguntas neutras recebem trustChange=0. '+
      'Mudanças pequenas: trustChange -3 a 3; opennessChange e patienceChange -2 a 2. '+
      'JSON EXATO: {"opinion":"opinião curta sobre o visitante",'+
      '"insight":"fato ou impressão da conversa com evidência",'+
      '"feeling":"neutro|curioso|confiante|cauteloso|respeitoso|desconfiado",'+
      '"trustChange":0,"opennessChange":0,"patienceChange":0}.'},
    {role:'user',content:JSON.stringify({
      observerNPC:context.name,
      npcSpecies:context.species||'human',
      observerPersonality:context.biography,
      observerBackground:context.description,
      previousOpinionABOUT_PLAYER:context.social?.opinion,
      playerSaid:bound(context.question,240),
      npcReplied:bound(answer,450)
    })}
  ],{model,fetchImpl,timeoutMs,schema:REFLECTION_SCHEMA,onTrace});
  return sanitizeReflection(data,context);
}

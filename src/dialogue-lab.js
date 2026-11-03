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

async function ollamaJSON(messages,{model,fetchImpl=fetch,timeoutMs=REVIEW_TIMEOUT_MS,schema=REVIEW_SCHEMA}={}){
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
        try{details=String(await response.text()).slice(0,180);}catch{}
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

export function sanitizeReview(data,question,answer){
  if(typeof data?.adequate!=='boolean')throw Error('Veredito ausente.');
  const reason=bound(data.reason,180);
  if(!reason)throw Error('Motivo ausente.');
  // Cheap deterministic check overrules the model on clear echo.
  return {adequate:data.adequate&&!isEcho(answer,question),
    score:finite(data.score,0,5,2),reason,improvement:bound(data.improvement,180)};
}

export async function reviewDialogue(context,answer,opts={}){
  const question=bound(context.question,240);
  const result=await ollamaJSON([
    {role:'system',content:
      'Você é um avaliador de DIÁLOGOS DE JOGO, não o personagem. '+
      'Julgue a resposta pelas informações fornecidas, não tente adivinhar o que a pessoa realmente pensa. '+
      'Verifique se responde ao pedido, respeita personagem, evita inventar fatos ou ações realizadas e não repete a pergunta. '+
      'Retorne APENAS JSON: {"adequate":true|false,"score":0-5,"reason":"curto","improvement":"orientação curta"}. '+
      'Considere adequada uma resposta simples e coerente, mesmo que não seja perfeita.'},
    {role:'user',content:JSON.stringify({
      npc:context.name,personality:context.biography,profession:context.role,
      knownFacts:context.description,allowedActions:context.allowedActions,
      playerQuestion:question,npcAnswer:bound(answer,450)
    })}
  ],{...opts,schema:REVIEW_SCHEMA});
  return sanitizeReview(result,question,answer);
}

export async function rewriteDialogue(context,previous,review,{
  model,fetchImpl=fetch,timeoutMs=30000
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
    return extractNPCReply([{generated_text:data?.message?.content}],context.question);
  }finally{clearTimeout(timeout);}
}

export function sanitizeReflection(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Reflexão inválida.');
  const opinion=bound(value.opinion,180),insight=bound(value.insight,180);
  if(!opinion||!insight)throw Error('A IA não forneceu uma percepção válida.');
  return {
    opinion,insight,
    feeling:['neutro','curioso','confiante','cauteloso','respeitoso','desconfiado']
      .includes(value.feeling)?value.feeling:'neutro',
    trustChange:finite(value.trustChange,-3,3,0),
    opennessChange:finite(value.opennessChange,-2,2,0),
    patienceChange:finite(value.patienceChange,-2,2,0)
  };
}

export async function reflectOnConversation(context,answer,{model,fetchImpl=fetch,timeoutMs=REVIEW_TIMEOUT_MS}={}){
  const data=await ollamaJSON([
    {role:'system',content:
      'Você é um motor de estado SOCIAL FICTÍCIO para personagens de RPG. '+
      'Não exponha cadeia de pensamento nem raciocínio interno. Escreva apenas um RESUMO NARRATIVO de como o NPC poderia interpretar a conversa. '+
      'Não infira atributos sensíveis, vida pessoal real, saúde, crenças ou intimidade do jogador. '+
      'Não alegue fatos não expressos pelo jogador. '+
      'Modifique os traços com moderação: trustChange de -3 a 3; opennessChange e patienceChange de -2 a 2. '+
      'Perguntas neutras normalmente não alteram confiança (0). Evite aumentar confiança automaticamente. '+
      'JSON EXATO: {"opinion":"opinião curta sobre o visitante",'+
      '"insight":"fato ou impressão da conversa com evidência",'+
      '"feeling":"neutro|curioso|confiante|cauteloso|respeitoso|desconfiado",'+
      '"trustChange":0,"opennessChange":0,"patienceChange":0}.'},
    {role:'user',content:JSON.stringify({
      npc:context.name,personality:context.biography,
      description:context.description,previousOpinion:context.social?.opinion,
      currentFeeling:context.social?.feeling,playerSaid:bound(context.question,240),
      npcReplied:bound(answer,450)
    })}
  ],{model,fetchImpl,timeoutMs,schema:REFLECTION_SCHEMA});
  return sanitizeReflection(data);
}

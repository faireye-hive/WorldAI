/**
 * Adapter opcional: recebe contexto e só retorna uma ação permitida.
 * Use endpoint relativo '/api/ollama' com o servidor de demonstração.
 * Não concede acesso ao sistema operacional ao modelo.
 */
export function createOllamaDecisionProvider({endpoint='/api/ollama',model='lfm3',timeoutMs=9000}={}) {
  return async snapshot => {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const actions=snapshot.candidates.map(c=>c.action);
      const reply=await fetch(endpoint,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({model, messages:[
          {role:'system',content:'Você é o módulo de decisão de um NPC em um jogo de fantasia. Escolha exatamente UMA ação da lista permitida. Responda somente JSON: {"action":"nome_da_acao"}. Não invente nomes.'},
          {role:'user',content:JSON.stringify({npc:snapshot.actor,time:snapshot.hour,options:snapshot.candidates})}
        ],format:'json',stream:false,options:{temperature:0,num_predict:48}})
      });
      if(!reply.ok)throw Error(`Ollama HTTP ${reply.status}`);
      const data=await reply.json();
      const raw=data.message?.content||data.response||'{}';
      const parsed=JSON.parse(raw);
      if(!actions.includes(parsed.action))throw Error('IA retornou ação fora da lista');
      return {action:parsed.action};
    }finally{clearTimeout(timeout);}
  };
}

/** Diálogo livre sem poderes de modificar o mundo. */
export function createOllamaDialogueProvider({endpoint='/api/ollama',model='lfm3',timeoutMs=15000}={}) {
  return async ({actor,question,hour,memories})=>{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetch(endpoint,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({model,stream:false,format:'json',options:{temperature:.65,num_predict:140},messages:[
          {role:'system',content:`Você interpreta um personagem fictício em um RPG. Responda em português com uma frase ou duas, SOMENTE JSON: {"reply":"seu diálogo"}. Não invente missões, descontos ou itens confirmados. Respeite o mundo e personalidade especificados. Seu nome é ${actor.name}. Profissão: ${actor.role}. História: ${actor.biography}.`},
          {role:'user',content:JSON.stringify({playerMessage:question,hour,needs:actor.needs,relationship:actor.relationship,memories})}
        ]})
      });
      if(!response.ok)throw Error(`Ollama HTTP ${response.status}`);
      const data=await response.json();
      const parsed=JSON.parse(data.message?.content||'{}');
      if(typeof parsed.reply!=='string')throw Error('Resposta inválida do modelo');
      return parsed.reply;
    }finally{clearTimeout(timeout);}
  };
}

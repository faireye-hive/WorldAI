import {reviewDialogue,rewriteDialogue,reflectOnConversation} from './dialogue-lab.js';

const $=id=>document.getElementById(id);
const asText=v=>String(v??'');
const defaultOpts={review:true,rewrite:true,reflect:true};
export function initCognition({world,social,modelName,isConnected,save}){
  const status=$('cognition-status'),last=$('cognition-feedback');
  const switches={review:$('lab-auto-review'),rewrite:$('lab-auto-rewrite'),reflect:$('lab-reflect')};
  let options=defaultOpts;
  try{
    const saved=JSON.parse(localStorage.getItem('worldai-cognition-options')||'null');
    if(saved && typeof saved==='object'){
      options=Object.fromEntries(Object.keys(defaultOpts).map(key=>[key,saved[key]!==false]));
    }
  }catch{}
  for(const [key,node] of Object.entries(switches)){
    node.checked=options[key];
    node.addEventListener('change',()=>{
      options[key]=node.checked;
      if(key==='review'&&!node.checked){switches.rewrite.checked=false;options.rewrite=false;}
      if(key==='rewrite'&&node.checked){switches.review.checked=true;options.review=true;}
      localStorage.setItem('worldai-cognition-options',JSON.stringify(options));
    });
  }

  let queue=Promise.resolve(),jobs=0;
  function report(message){status.textContent=message;}
  function render(id=world.selectedId){
    const actor=world.actors.get(id);if(!actor)return;
    const s=social.get(id);
    $('social-name').textContent=actor.name;
    $('social-feeling').textContent=s.feeling[0].toUpperCase()+s.feeling.slice(1);
    $('social-familiarity').textContent=s.familiarity+' conversa(s)';
    $('social-opinion').textContent=s.opinion;
    $('social-insight').textContent=s.insight;
    for(const [tag,value] of [['trust',s.trust],['open',s.openness],['patience',s.patience]]){
      $('social-'+tag).value=value;
      $('social-'+tag+'-text').textContent=value;
    }
    $('social-history').textContent=s.history.length+' percepções recentes · evolução '+s.revision;
  }
  $('social-reset').addEventListener('click',()=>{
    if(!confirm('Limpar a opinião e os traços sociais deste NPC? As conversas permanecem.'))return;
    social.reset(world.selectedId);render();save();
    report('Percepção social de '+world.selected.name+' reiniciada.');
  });

  async function runDialogueLab({actor,question,reply,mode,context,speechNode,responseEntry,memoryEntry}){
    if(!isConnected()||mode!=='ollama'||(!options.review&&!options.reflect))return;
    // Captured at send time: changes to toggles affect subsequent dialogue, not this one.
    const planned={...options};
    if(jobs>=3){
      report('Fila de análises cheia; esta conversa foi mantida sem avaliação extra.');
      return;
    }
    jobs++;
    queue=queue.catch(()=>{}).then(async()=>{
      const model=modelName();
      let current=reply;
      try{
        if(planned.review){
          report('Avaliando resposta de '+actor.name+'… ('+jobs+' na fila)');
          const verdict=await reviewDialogue(context,current,{model});
          const desc='Nota de adequação '+verdict.score+'/5: '+verdict.reason;
          last.textContent=desc;
          if(!verdict.adequate && planned.rewrite){
            report('Tentando melhorar resposta de '+actor.name+'…');
            try{
              const improved=await rewriteDialogue(context,current,verdict,{model});
              if(improved&&responseEntry?.content===current&&actor.history.includes(responseEntry)){
                responseEntry.content=improved;
                if(memoryEntry&&actor.memories.includes(memoryEntry)){
                  memoryEntry.data=(question+' → '+improved).slice(0,160);
                }
                if(speechNode?.isConnected){
                  const body=speechNode.querySelector('div');
                  if(body)body.textContent=improved;
                  speechNode.classList.add('npc-revised');
                }
                current=improved;
                last.textContent=desc+' · Revisão aplicada: '+improved.slice(0,150);
                save();
              }
            }catch(err){
              last.textContent=desc+' · A tentativa de revisão falhou: '+asText(err.message).slice(0,90);
            }
          }
        }
        if(planned.reflect){
          report('Atualizando a percepção de '+actor.name+' sobre o jogador…');
          try{
            const reflection=await reflectOnConversation(context,current,{model});
            if(social.applyReflection(actor.id,reflection,question)){
              if(world.selectedId===actor.id)render(actor.id);
              save();
              const info=last.textContent;
              last.textContent=info+' · Percepção: '+reflection.feeling+
                ' ('+reflection.trustChange+' confiança).';
            }
          }catch(err){
            last.textContent=last.textContent+' · Reflexão não disponível: '+
              asText(err.message).slice(0,100);
          }
        }
        report('Análise desta conversa concluída. Pode continuar jogando normalmente.');
      }catch(err){
        report('Avaliação indisponível: '+asText(err.message).slice(0,120));
      }finally{jobs--;}
    });
    // Queue runs in this browser tab only. Nothing continues after closing it.
  }

  render();
  return {render,afterDialogue:runDialogueLab,mark:actor=>{social.markConversation(actor.id);render(actor.id);}};
}

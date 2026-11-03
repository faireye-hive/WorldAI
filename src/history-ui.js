import {createLogExport,formatTranscript} from './dialogue-recorder.js';

const $=id=>document.getElementById(id);
const fileStamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
function downloadText(text,filename,mime){
  const blob=new Blob([text],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}

export function initHistoryUI({recorder,world}){
  const status=$('history-status'),countEl=$('history-count'),
    filter=$('history-actor'),preview=$('history-preview'),
    sessionOnly=$('history-session-only'),
    exportJSON=$('history-export-json'),exportTXT=$('history-export-txt'),
    clear=$('history-clear'),refreshButton=$('history-refresh');
  let scheduled=false;
  function currentFilters(){
    return {
      sessionId:sessionOnly.checked?recorder.sessionId:null,
      actorId:filter.value||null
    };
  }
  function listActors(){
    const value=filter.value;
    filter.replaceChildren(new Option('Todos os NPCs',''));
    for(const actor of world.actors.values())
      filter.add(new Option(actor.name+' · '+actor.title,actor.id));
    filter.value=value;
  }
  function error(message){
    status.textContent='⚠ '+message;
    status.dataset.health='error';
  }
  async function refresh(){
    listActors();
    try{
      const [total,events]=await Promise.all([
        recorder.count(),recorder.list({...currentFilters(),limit:15,newest:true})
      ]);
      countEl.textContent=total.toLocaleString('pt-BR');
      status.textContent='✓ Histórico em IndexedDB · '+total+
        ' eventos arquivados. Nenhuma conversa antiga será cortada automaticamente.';
      status.dataset.health='ok';
      preview.replaceChildren();
      for(const event of events){
        const row=document.createElement('div');
        row.className='history-entry';
        const head=document.createElement('small');
        const at=event.at?new Date(event.at).toLocaleString('pt-BR'):'';
        head.textContent=at+' · '+(event.actorName||'WorldAI')+
          ' · '+event.type+(event.model?' · '+event.model:'');
        const body=document.createElement('p');
        const detailText=event.text||
          (event.details?JSON.stringify(event.details):'');
        body.textContent=detailText.slice(0,350)||'Registro sem conteúdo de texto.';
        row.append(head,body);preview.appendChild(row);
      }
      if(!events.length)preview.textContent='Ainda não há eventos com este filtro.';
      exportJSON.disabled=total===0;exportTXT.disabled=total===0;
    }catch(err){error(err.message||'Não foi possível acessar IndexedDB.');}
  }
  function refreshSoon(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(()=>{scheduled=false;refresh();},600);
  }
  async function exportFile(format){
    const button=format==='json'?exportJSON:exportTXT;
    button.disabled=true;
    status.textContent='Preparando arquivo de diagnóstico...';
    try{
      const events=await recorder.list(currentFilters());
      if(!events.length){status.textContent='Nenhuma conversa para exportar com este filtro.';return;}
      const name='worldai-dialogos-'+fileStamp();
      const output=format==='json'
        ?JSON.stringify(createLogExport(events,{
          scope:sessionOnly.checked?'session':'all',
          sessionId:sessionOnly.checked?recorder.sessionId:null
        }),null,2)
        :formatTranscript(events);
      downloadText(output,name+'.'+format,
        format==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8');
      status.textContent='✓ Exportados '+events.length+' eventos. Revise o arquivo antes de compartilhar.';
    }catch(err){error('Falha na exportação: '+err.message);}
    finally{button.disabled=false;}
  }
  exportJSON.addEventListener('click',()=>exportFile('json'));
  exportTXT.addEventListener('click',()=>exportFile('txt'));
  refreshButton.addEventListener('click',refresh);
  sessionOnly.addEventListener('change',refresh);
  filter.addEventListener('change',refresh);
  clear.addEventListener('click',async()=>{
    if(!confirm('Apagar TODO o arquivo de diálogos e erros deste navegador? Isso não pode ser desfeito. Exporte antes, se quiser guardar os dados.'))return;
    clear.disabled=true;
    try{
      await recorder.clear();status.textContent='Histórico apagado neste navegador.';
      await refresh();
    }catch(err){error(err.message);}
    finally{clear.disabled=false;}
  });
  recorder.onStatus=err=>{
    if(err)error('Falha ao arquivar um evento: '+err.message+
      '. Exporte o que estiver disponível e verifique espaço/permissões do navegador.');
    else refreshSoon();
  };
  refresh();
  return {refresh,refreshSoon};
}

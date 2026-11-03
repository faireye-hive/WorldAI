import {compareModels, installedModels, EXAMPLE_QUESTIONS} from './comparison-core.js';

const DEFAULT_A = 'qwen3.5:0.8b';
const DEFAULT_B = 'lfm3:latest';
const byId = id => document.getElementById(id);
const fmt = (value, unit='') => value === null || value === undefined || !Number.isFinite(value)
  ? '—' : Number(value).toLocaleString('pt-BR',{maximumFractionDigits:1}) + unit;
const HISTORY_MAX = 20;

export function initComparator(world,{onCompared=()=>{}}={}) {
  const root = byId('compare-panel');
  if (!root) return;
  const modelA=byId('cmp-model-a'),modelB=byId('cmp-model-b'),character=byId('cmp-character');
  const prompt=byId('cmp-question'),status=byId('cmp-status'),run=byId('cmp-run');
  const cancel=byId('cmp-cancel'),refresh=byId('cmp-refresh'),exportButton=byId('cmp-export');
  const historyBox=byId('cmp-history');
  const voteA=byId('cmp-vote-a'),voteB=byId('cmp-vote-b');
  const histories=[];
  let running=false, controller=null, installed=[];
  let currentRecord=null;

  function tell(message){status.textContent=message;}
  function updateButtons(){
    const selectedA=modelA.value, selectedB=modelB.value;
    const valid=installed.includes(selectedA)&&installed.includes(selectedB)&&selectedA!==selectedB;
    run.disabled=running || !valid || import.meta.env.PROD;
    cancel.disabled=!running;
    refresh.disabled=running || import.meta.env.PROD;
    modelA.disabled=running || import.meta.env.PROD;modelB.disabled=running || import.meta.env.PROD;
    character.disabled=running || import.meta.env.PROD;prompt.disabled=running || import.meta.env.PROD;
    voteA.disabled=running||!currentRecord||currentRecord.results.length<2;
    voteB.disabled=voteA.disabled;
    byId('cmp-fill-selected').disabled=running || import.meta.env.PROD;
    exportButton.disabled=histories.length===0;
  }
  const actorChoices=[...world.actors.values()];
  for(const actor of actorChoices){
    const option=new Option(actor.name+' · '+actor.title,actor.id);
    character.add(option);
  }
  character.value=world.selectedId;
  for(const question of EXAMPLE_QUESTIONS){
    const button=document.createElement('button');
    button.type='button';button.className='cmp-question-chip';
    button.textContent=question;button.addEventListener('click',()=>{prompt.value=question;prompt.focus();});
    byId('cmp-examples').appendChild(button);
  }
  prompt.value=EXAMPLE_QUESTIONS[0];

  function optionize(select,names,target) {
    select.replaceChildren();
    for(const name of names)select.add(new Option(name,name));
    const initial=names.includes(target)?target:names.find(x=>x!==target)||names[0]||'';
    select.value=initial;
  }
  async function updateModels() {
    tell('Consultando os modelos instalados no Ollama...');
    try {
      const available=await installedModels();
      installed=available;
      const oldA=modelA.value||DEFAULT_A,oldB=modelB.value||DEFAULT_B;
      optionize(modelA,available,oldA);
      optionize(modelB,available,oldB);
      // On first load prefer requested Qwen / LFM3, or nearest installed variant.
      if(!oldA||oldA===DEFAULT_A){
        modelA.value=available.includes(DEFAULT_A)?DEFAULT_A:
          available.find(x=>x.startsWith('qwen3.5:'))||modelA.value;
      }
      if(!oldB||oldB===DEFAULT_B){
        modelB.value=available.includes(DEFAULT_B)?DEFAULT_B:
          available.find(x=>x.startsWith('lfm3:'))||available.find(x=>x!==modelA.value)||modelB.value;
      }
      if(modelA.value===modelB.value){
        modelB.value=available.find(x=>x!==modelA.value)||modelB.value;
      }
      if(available.length<2){
        tell('Encontrei '+available.length+' modelo(s). Instale os dois pelo terminal: ollama pull qwen3.5:0.8b && ollama pull lfm3');
      }else {
        tell('Encontrados '+available.length+' modelos. Selecione dois e faça a mesma pergunta a ambos.');
      }
    }catch(error) {
      installed=[];
      modelA.replaceChildren();modelB.replaceChildren();
      tell('Ollama não respondeu. Execute npm run dev e confira 127.0.0.1:11434. '+error.message);
    }
    updateButtons();
  }
  const metricNames=[
    ['elapsedMs','Tempo no navegador',' ms'],
    ['serverTotalMs','Tempo no Ollama',' ms'],
    ['loadMs','Carregamento',' ms'],
    ['generatedTokens','Tokens gerados',''],
    ['tokensPerSecond','Velocidade',' tokens/s'],
    ['promptTokens','Tokens de entrada','']
  ];
  function renderResult(which,result){
    const text=byId('cmp-answer-'+which),title=byId('cmp-title-'+which);
    const metrics=byId('cmp-metrics-'+which),badge=byId('cmp-flag-'+which);
    if(!result){
      title.textContent=which==='a' ? (modelA.value||'Modelo A'):(modelB.value||'Modelo B');
      text.textContent='Aguardando comparação...';badge.textContent='—';metrics.replaceChildren();return;
    }
    title.textContent=result.model;
    text.textContent=result.status==='ok' ? result.answer : result.error;
    badge.textContent=result.status==='error'?'ERRO':result.echoed?'REPETIU A PERGUNTA':'RESPOSTA GERADA';
    badge.className='cmp-flag '+(result.status==='error'||result.echoed?'warning':'ok');
    metrics.replaceChildren();
    for(const [key,label,unit] of metricNames){
      const row=document.createElement('div'),lab=document.createElement('span'),value=document.createElement('strong');
      lab.textContent=label;value.textContent=fmt(result.metrics?.[key],unit);
      row.append(lab,value);metrics.appendChild(row);
    }
  }
  function renderHistory(){
    historyBox.replaceChildren();
    if(!histories.length){historyBox.textContent='Nenhum teste nesta sessão.';return;}
    for(const record of histories){
      const box=document.createElement('div');
      box.className='cmp-history-entry';
      const left=document.createElement('span'),right=document.createElement('small');
      left.textContent=record.character+' · '+record.question;
      right.textContent=record.winner?'Sua escolha: '+record.winner:'Sem avaliação';
      box.append(left,right);historyBox.appendChild(box);
    }
  }
  function vote(which){
    if(!currentRecord||!currentRecord.results[which==='a'?0:1])return;
    currentRecord.winner=currentRecord.results[which==='a'?0:1].model;
    onCompared({...currentRecord,kind:'vote'});
    tell('Você escolheu '+currentRecord.winner+' como melhor resposta deste teste (avaliação manual).');
    voteA.classList.toggle('picked',which==='a');
    voteB.classList.toggle('picked',which==='b');
    renderHistory();
  }
  async function runComparison(){
    if(running)return;
    const selectedA=modelA.value,selectedB=modelB.value;
    if(import.meta.env.PROD||!installed.includes(selectedA)||!installed.includes(selectedB)||selectedA===selectedB){
      tell('Escolha dois modelos diferentes e instalados.');return;
    }
    const question=prompt.value.trim().slice(0,240);
    if(!question){tell('Digite uma pergunta para o NPC.');prompt.focus();return;}
    const actor=world.actors.get(character.value);
    if(!actor){tell('Escolha um personagem.');return;}

    // Snapshot taken ONCE. Running models must never modify character memory or the world.
    const context=structuredClone({...world.getConversationContext(actor),question});
    const record={at:new Date().toISOString(),character:actor.name,characterId:actor.id,question,
      models:[selectedA,selectedB],context,results:[],winner:null};
    currentRecord=record;
    controller=new AbortController();running=true;
    voteA.classList.remove('picked');voteB.classList.remove('picked');
    renderResult('a',null);renderResult('b',null);updateButtons();
    try{
      record.results=await compareModels(context,selectedA,selectedB,{
        signal:controller.signal,
        onUpdate:({phase,model,results})=>{
          if(phase==='running')tell('Gerando com '+model+'… teste sequencial, sem disputar a CPU.');
          record.results=results;
          renderResult('a',results[0]||null);renderResult('b',results[1]||null);
        }
      });
      histories.unshift(record);histories.splice(HISTORY_MAX);
      onCompared({...record,kind:'completed'});
      const errors=record.results.filter(r=>r.status==='error').length;
      const echoes=record.results.filter(r=>r.echoed).length;
      tell('Comparação concluída.'+(errors?' '+errors+' erro(s).':'')+(echoes?' '+echoes+' eco(s) detectado(s).':'')+
        ' Avalie qual resposta foi melhor.');
    }catch(error){
      if(error.name==='AbortError'){
        tell('Comparação cancelada. Resultados parciais preservados nesta tela.');
        if(record.results.length) {
          histories.unshift(record);histories.splice(HISTORY_MAX);
        }
      }else{tell('Falha ao comparar: '+error.message);}
    }finally{
      running=false;controller=null;
      renderHistory();updateButtons();
    }
  }

  document.addEventListener('worldai:actor-added',({detail})=>{
    const actor=world.actors.get(detail?.id);
    if(actor && ![...character.options].some(o=>o.value===actor.id)){
      character.add(new Option(actor.name+' · '+actor.title,actor.id));
    }
  });
  refresh.addEventListener('click',updateModels);
  modelA.addEventListener('change',updateButtons);
  modelB.addEventListener('change',updateButtons);
  run.addEventListener('click',runComparison);
  cancel.addEventListener('click',()=>controller?.abort());
  voteA.addEventListener('click',()=>vote('a'));
  voteB.addEventListener('click',()=>vote('b'));
  byId('cmp-fill-selected').addEventListener('click',()=>{
    character.value=world.selectedId;
    tell('Personagem da comparação: '+world.selected.name+'.');
  });
  exportButton.addEventListener('click',()=>{
    if(!histories.length)return;
    const file=new Blob([JSON.stringify({version:1,source:'WorldAI Ollama comparator',
      method:'sequential, same NPC context, no automatic retry, same model options',
      results:histories},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download='worldai-comparacao-'+new Date().toISOString().slice(0,10)+'.json';
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  if(import.meta.env.PROD){
    tell('Comparador disponível somente em localhost, com Vite + Ollama. GitHub Pages não tem proxy local.');
    refresh.disabled=true;
    updateButtons();
  }else updateModels();
  renderResult('a',null);renderResult('b',null);renderHistory();updateButtons();
}

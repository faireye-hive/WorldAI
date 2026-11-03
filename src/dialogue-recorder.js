/**
 * Histórico de depuração do WorldAI — IndexedDB.
 * Append-only: nunca apaga as falas antigas ao cortar o contexto do modelo.
 * Armazena somente dados do jogo, não credenciais nem o tráfego HTTP bruto.
 */
export const LOG_DB_NAME='WorldAI-Diagnostics';
export const LOG_DB_VERSION=1;
export const LOG_STORE='events';
export const LOG_FORMAT_VERSION=1;
const str=(value,max=10000)=>String(value??'').slice(0,max);

export function makeLogEvent(input,sessionId,now=()=>new Date().toISOString()){
  if(!input||typeof input!=='object'||!input.type)
    throw new TypeError('Evento de diagnóstico inválido.');
  const fields=['type','actorId','actorName','turnId','model','mode','text','level'];
  const out={sessionId:str(sessionId,100),at:now()};
  for(const key of fields){
    if(input[key]!==undefined&&input[key]!==null)
      out[key]=str(input[key],key==='text'?12000:180);
  }
  if(input.details!==undefined){
    // Keep structured context and diagnostic payloads without live references.
    // Credentials should NEVER be put into details by callers.
    out.details=JSON.parse(JSON.stringify(input.details));
  }
  return out;
}

export function formatTranscript(events){
  const names={
    session_started:'SESSÃO',user_message:'JOGADOR',npc_message:'NPC',
    model_attempt:'MODELO',model_error:'ERRO DO MODELO',action:'AÇÃO',
    review:'AVALIAÇÃO',review_error:'ERRO DE AVALIAÇÃO',
    rewrite:'RESPOSTA REVISADA',rewrite_error:'ERRO DE REVISÃO',
    reflection:'REFLEXÃO',reflection_error:'ERRO DE REFLEXÃO',
    analysis_skipped:'ANÁLISE IGNORADA',compare:'COMPARAÇÃO'
  };
  const lines=['WORLD AI — HISTÓRICO DE DIÁLOGOS E DIAGNÓSTICO',
    'Gerado: '+new Date().toISOString(),''];
  for(const e of events){
    const head='['+(e.at||'')+'] '+(names[e.type]||str(e.type,60))+
      (e.actorName?' — '+e.actorName:'')+(e.model?' ('+e.model+')':'')+
      (e.turnId?' ['+e.turnId+']':'');
    lines.push(head);
    if(e.text)lines.push('  '+str(e.text,12000));
    if(e.details)lines.push('  Detalhes: '+JSON.stringify(e.details));
    lines.push('');
  }
  return lines.join('\n');
}

export function createLogExport(events,{scope='all',sessionId=null,appVersion='0.7'}={}){
  return {
    format:'worldai-diagnostic-log',version:LOG_FORMAT_VERSION,appVersion,
    exportedAt:new Date().toISOString(),scope,sessionId,
    totalEvents:events.length,
    events
  };
}

function promiseRequest(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Falha IndexedDB.'));
  });
}
export class DialogueRecorder{
  constructor({indexedDBImpl=globalThis.indexedDB,dbName=LOG_DB_NAME,sessionId,onStatus=()=>{}}={}){
    this.indexedDBImpl=indexedDBImpl;
    this.dbName=dbName;
    this.sessionId=sessionId||('session-'+Date.now()+'-'+Math.random().toString(36).slice(2,9));
    this.onStatus=onStatus;this._dbPromise=null;this._queue=Promise.resolve();
    this.saved=0;this.failed=0;this.lastError=null;
  }
  async open(){
    if(!this.indexedDBImpl)throw Error('IndexedDB indisponível neste navegador.');
    if(this._dbPromise)return this._dbPromise;
    this._dbPromise=new Promise((resolve,reject)=>{
      const req=this.indexedDBImpl.open(this.dbName,LOG_DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(LOG_STORE)){
          const store=db.createObjectStore(LOG_STORE,{keyPath:'id',autoIncrement:true});
          store.createIndex('by_session','sessionId',{unique:false});
          store.createIndex('by_actor','actorId',{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Não foi possível abrir IndexedDB.'));
      req.onblocked=()=>reject(Error('Histórico bloqueado por outra aba aberta.'));
    });
    try{return await this._dbPromise;}
    catch(err){this._dbPromise=null;this.lastError=err;this.onStatus(err);throw err;}
  }
  async _write(event){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(LOG_STORE,'readwrite');
      const req=tx.objectStore(LOG_STORE).add(event);
      let id;
      req.onsuccess=()=>{id=req.result;};
      tx.oncomplete=()=>resolve(id);
      tx.onerror=()=>reject(tx.error||Error('Falha ao salvar diálogo.'));
      tx.onabort=()=>reject(tx.error||Error('Gravação cancelada.'));
    });
  }
  record(input){
    const event=makeLogEvent(input,this.sessionId);
    // Serialize writes, and never allow a failed write to poison the queue.
    const pending=this._queue.catch(()=>{}).then(()=>this._write(event));
    this._queue=pending;
    pending.then(()=>{
      this.saved++;this.lastError=null;this.onStatus(null);
    },err=>{
      this.failed++;this.lastError=err;this.onStatus(err);
    });
    return pending;
  }
  async flush(){await this._queue.catch(()=>{});}
  async list({sessionId=null,actorId=null,limit=null,newest=false}={}){
    await this.flush();
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const results=[];
      const tx=db.transaction(LOG_STORE,'readonly');
      const req=tx.objectStore(LOG_STORE).openCursor(null,newest?'prev':'next');
      req.onsuccess=()=>{
        const cursor=req.result;
        if(!cursor)return;
        const e=cursor.value;
        if((!sessionId||e.sessionId===sessionId)&&(!actorId||e.actorId===actorId)){
          results.push(e);
          if(Number.isInteger(limit)&&limit>0&&results.length>=limit)return;
        }
        cursor.continue();
      };
      tx.oncomplete=()=>resolve(results);
      tx.onerror=()=>reject(tx.error||Error('Não foi possível ler histórico.'));
    });
  }
  async count(){
    await this.flush();
    const db=await this.open();
    const tx=db.transaction(LOG_STORE,'readonly');
    return promiseRequest(tx.objectStore(LOG_STORE).count());
  }
  async clear(){
    await this.flush();
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(LOG_STORE,'readwrite');
      tx.objectStore(LOG_STORE).clear();
      tx.oncomplete=()=>{this.onStatus(null);resolve();};
      tx.onerror=()=>reject(tx.error||Error('Falha ao limpar histórico.'));
    });
  }
}

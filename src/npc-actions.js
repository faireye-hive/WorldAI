import {scheduleOllama} from './ollama-queue.js';
import {makeOllamaRequest} from './ollama.js';
import {PLACES,ITEMS} from './rpg.js';

const norm=text=>String(text??'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase();
const normalized=text=>norm(text).replace(/[^a-z0-9]+/g,' ').trim();
const token=(hay,needle)=>(' '+hay+' ').includes(' '+needle+' ');
const ITEM_ALIASES={
  pocao:['pocao','pocoes','pocao de vida','pocoes de vida'],
  pao:['pao','paes'],
  erva:['erva','ervas','erva medicinal','ervas medicinais'],
  ferro:['ferro','minerio','minerio de ferro'],
  madeira:['madeira','madeiras'],
  maca:['maca','macas']
};
const PLACE_ALIASES={
  praca:['praca','praca central'],
  forja:['forja','ferreiro'],
  mercado:['mercado'],
  estalagem:['estalagem','pousada'],
  ponte:['ponte'],
  floresta:['floresta','mata','bosque'],
  guarda:['posto da guarda','guarda']
};

export function findRequestedItem(text){
  const s=normalized(text);
  return ITEMS.find(item=>(ITEM_ALIASES[item.id]||[item.id]).some(alias=>token(s,normalized(alias))))?.id||null;
}
export function findRequestedPlace(text){
  const s=normalized(text);
  return PLACES.find(place=>(PLACE_ALIASES[place.id]||[place.id]).some(alias=>token(s,normalized(alias))))?.id||null;
}
function quantityFrom(text){
  const s=normalized(text);
  const number=s.match(/\b(\d{1,2})\b/);
  if(number)return Number(number[1]);
  const names={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,
    seis:6,sete:7,oito:8,nove:9,dez:10};
  const words=s.match(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/);
  return words?names[words[1]]:1;
}
export function detectIntent(text){
  const s=normalized(text);
  let action=null;
  if(/\b(me leve|me leva|leve me|me mostre|me mostra|me guie|me guia|acompanhe me|guie me|me acompanhe|me conduza|vamos ate|ir ate|caminho para)\b/.test(s))action='guide';
  else if(/\b(quero comprar|posso comprar|me venda|me vende|comprar|compro|gostaria de comprar)\b/.test(s))action='buy';
  else if(/\b(quero vender|posso vender|te vendo|gostaria de vender)\b/.test(s))action='sell';
  else if(/\b(me de|me da|me entregue|me oferece|ganhar um|doe para mim)\b/.test(s))action='give';
  if(!action)return null;
  return {action,place:findRequestedPlace(text),item:findRequestedItem(text),
    quantity:quantityFrom(text)};
}

/** Reply to an NPC's request for clarification: "um pão" is enough, but only
 * when the player had already asked this same NPC to buy something.
 */
export function completePendingIntent(text,pending,actorId){
  if(!pending||pending.actorId!==actorId)return null;
  if(/^\s*(n[aã]o|cancelar|deixa|esquece|n[aã]o quero)/i.test(text))
    return {cancelled:true};
  const fresh=detectIntent(text);
  if(fresh)return fresh;
  const proposal={action:pending.action,item:findRequestedItem(text),
    place:findRequestedPlace(text),quantity:quantityFrom(text)};
  const required=pending.action==='guide'?'place':'item';
  return proposal[required]?proposal:null;
}
export function clarificationFor(actor,rpg,intent){
  const cfg=rpg.profile(actor.id);
  if(!cfg?.actions?.includes(intent.action))
    return actor.name+' não pode realizar essa ação.';
  if(intent.action==='guide')
    return 'Para onde deseja ir? Posso indicar: '+PLACES.map(p=>p.name).join(', ')+'.';
  const items=ITEMS.filter(item=>
    intent.action==='sell'?(rpg.bag[item.id]||0)>0:(cfg.stock[item.id]||0)>0);
  const choices=items.map(item=>item.name+
    (intent.action==='sell'?' (você tem '+(rpg.bag[item.id]||0)+')':
      ' ('+item.price+' moedas, estoque '+cfg.stock[item.id]+')')).join('; ');
  const subject=intent.action==='sell'?'vender':intent.action==='give'?'receber':'comprar';
  return 'Qual item você quer '+subject+'? '+(choices||'Não há itens disponíveis no momento.')+
    '. Diga, por exemplo: "um pão".';
}
export async function decideNPCAction(text,actor,rpg,{
  fetchImpl=fetch,model='lfm3:latest',timeoutMs=25000,intentOverride=null
}={}){
  const intent=intentOverride||detectIntent(text);
  if(!intent)return {intent:null,proposal:null,mode:'chat'};
  const cfg=rpg.profile(actor.id);
  if(!cfg?.actions?.includes(intent.action))
    return {intent,proposal:intent,mode:'rules'}; // engine refuses unauthorized actions
  // Missing purchase item is NEVER guessed by an LLM: a short "me vende um"
  // must ask the player to name the item, not invent a sale.
  if(intent.action!=='guide'&&!intent.item)
    return {intent,proposal:null,mode:'clarify',
      message:clarificationFor(actor,rpg,intent)};
  if(intent.action==='guide'&&!intent.place){
    const s=normalized(text);
    // Only consult an LLM for an explicit but semantically mappable destination,
    // e.g. "um lugar seguro"; naked "me leve" just asks for clarification.
    if(!/\b(lugar seguro|local seguro|abrigo|lugar tranquilo)\b/.test(s))
      return {intent,proposal:null,mode:'clarify',
        message:clarificationFor(actor,rpg,intent)};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const base=makeOllamaRequest({...rpg.world.getConversationContext(actor),question:text},model);
      const response=await scheduleOllama(()=>fetchImpl('/api/ollama/chat',{
        method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...base,format:'json',messages:[
          {role:'system',content:'NPC de RPG. O jogador pediu para ser GUIADO. '+
            'Você deve escolher um lugar real e seguro do catálogo, sem inventar itens nem novas ações. '+
            'Devolva somente JSON {"action":"guide","place":"id"}. '+
            'Destinos: '+JSON.stringify(PLACES.map(p=>({id:p.id,name:p.name})))},
          {role:'user',content:String(text).slice(0,240)}
        ],options:{...base.options,num_predict:80,temperature:0}})
      }),{priority:'foreground',signal:controller.signal});
      if(response.ok){
        const data=await response.json();
        const parsed=JSON.parse(data?.message?.content||'{}');
        // Never accept LLM actions/places that were not authorized or named in catalog.
        if(parsed?.action==='guide'&&PLACES.some(p=>p.id===parsed.place))
          return {intent,proposal:{...intent,place:parsed.place},mode:'model'};
      }
    }catch{/* Invalid/failed model response: ask the player instead. */}
    finally{clearTimeout(timer);}
    return {intent,proposal:null,mode:'clarify',
      message:clarificationFor(actor,rpg,intent)};
  }
  return {intent,proposal:intent,mode:'rules'};
}

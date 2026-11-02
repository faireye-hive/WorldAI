import {makeOllamaRequest} from './ollama.js';
import {PLACES,ITEMS} from './rpg.js';

const norm=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function detectIntent(text){
 const s=norm(text);
 let action=null;
 if(/\b(me leve|me leva|leve-me|me mostre|me mostra|me guie|me guia|acompanhe-me|guie-me|me acompanhe|me conduza|vamos ate|ir ate|caminho para)\b/.test(s))action='guide';
 else if(/\b(quero comprar|posso comprar|me venda|me vende|comprar|compro)\b/.test(s))action='buy';
 else if(/\b(quero vender|posso vender|te vendo|vender)\b/.test(s))action='sell';
 else if(/\b(me de|me da|me entregue|me oferece|ganhar um|doe para mim)\b/.test(s))action='give';
 if(!action)return null;
 const place=PLACES.find(p=>s.includes(norm(p.name))||s.includes(norm(p.id)));
 const item=ITEMS.find(i=>s.includes(norm(i.name))||s.includes(norm(i.id)));
 const quantity=Number(s.match(/\b(\d{1,2})\b/)?.[1]||1);
 return {action,place:place?.id??null,item:item?.id??null,quantity};
}

export async function decideNPCAction(text,actor,rpg,{
  fetchImpl=fetch,model='lfm3:latest',timeoutMs=25000
}={}){
 const intent=detectIntent(text);
 if(!intent)return {intent:null,proposal:null,mode:'chat'};
 // For unambiguous exact commands the deterministic proposal is already sufficient.
 if((intent.action==='guide'&&intent.place)||
   (intent.action!=='guide'&&intent.item))return {intent,proposal:intent,mode:'rules'};
 const cfg=rpg.profile(actor.id);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const context={...rpg.world.getConversationContext(actor),question:text};
  const base=makeOllamaRequest(context,model);
  const response=await fetchImpl('/api/ollama/chat',{
   method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
   body:JSON.stringify({...base,format:'json',messages:[
    {role:'system',content:
     'Você decide ações de NPCs de um jogo. Responda SOMENTE JSON válido, sem markdown: '+
     '{"action":"guide|buy|sell|give|none","place":"id ou null","item":"id ou null","quantity":1}. '+
     'Somente ações permitidas: '+JSON.stringify(cfg.actions)+'. Locais: '+JSON.stringify(PLACES.map(p=>({id:p.id,name:p.name})))+
     '. Itens: '+JSON.stringify(ITEMS.map(i=>({id:i.id,name:i.name})))+
     '. Estoque do NPC: '+JSON.stringify(cfg.stock)+'. Se a intenção não for clara, action=none.'},
    {role:'user',content:String(text).slice(0,240)}
   ],options:{...base.options,num_predict:110,temperature:0.1}})
  });
  if(!response.ok)throw Error('Ollama HTTP '+response.status);
  const data=await response.json();
  const parsed=JSON.parse(data.message?.content||'{}');
  if(parsed.action===intent.action){
   return {intent,proposal:{
    action:intent.action,
    place:intent.place||String(parsed.place||''),
    item:intent.item||String(parsed.item||''),
    quantity:intent.quantity
   },mode:'model'};
  }
 }catch { /* fall back to conservative local intent parser */ }
 finally{clearTimeout(timer);}
 return {intent,proposal:intent,mode:'rules'};
}

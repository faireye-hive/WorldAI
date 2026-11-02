// WorldAI RPG sandbox: trades and navigation are controlled by game rules, never by LLM text.
export const PLACES = Object.freeze([
  {id:'praca',name:'Praça Central',x:397,y:359},
  {id:'forja',name:'Forja',x:292,y:302},
  {id:'mercado',name:'Mercado',x:423,y:278},
  {id:'estalagem',name:'Estalagem',x:214,y:187},
  {id:'ponte',name:'Ponte',x:575,y:321},
  {id:'floresta',name:'Floresta',x:821,y:330},
  {id:'guarda',name:'Posto da Guarda',x:469,y:487}
]);
export const ITEMS = Object.freeze([
  {id:'pocao',name:'Poção de Vida',price:15},
  {id:'pao',name:'Pão',price:5},
  {id:'erva',name:'Erva Medicinal',price:8},
  {id:'ferro',name:'Minério de Ferro',price:12},
  {id:'madeira',name:'Madeira',price:6},
  {id:'maca',name:'Maçã',price:3}
]);
const itemMap=new Map(ITEMS.map(i=>[i.id,i]));
const placeMap=new Map(PLACES.map(p=>[p.id,p]));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const amount=n=>Number.isInteger(Number(n))&&Number(n)>=0&&Number(n)<=999?Number(n):null;
const clean=(s,max=180)=>String(s??'').trim().slice(0,max);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const VALID=['guide','buy','sell','give'];
const TYPE=['human','wolf','deer','boar'];
const profession=['smith','merchant','herbalist','guard','innkeeper','villager','other'];
const DEFAULT_ACTIONS=['guide'];
const DEFAULT_CATALOG={lina:{pocao:5,pao:8,maca:6},marcus:{ferro:4,madeira:3},iris:{erva:7,pocao:2},nora:{pao:7,maca:8},soren:{pao:2}};
const DEFAULT_ROLES={
  lina:['guide','buy','sell'],marcus:['guide','buy','sell'],iris:['guide','buy','sell','give'],
  nora:['guide','buy','sell'],soren:['guide','give']
};
function sanitizeStock(source){
 const out={};
 for(const item of ITEMS){const v=amount(source?.[item.id]);out[item.id]=v===null?0:v;}
 return out;
}
export function normalizeProfile(source={}){
 const species=TYPE.includes(source.species)?source.species:'human';
 const role=profession.includes(source.role)?source.role:(species==='human'?'villager':species);
 const actions=Array.isArray(source.actions)?VALID.filter(x=>source.actions.includes(x)):DEFAULT_ACTIONS;
 return {
   name:clean(source.name,42)||'Morador',role,species,
   title:clean(source.title,60)||role,
   biography:clean(source.biography,180)||'Curioso e reservado',
   description:clean(source.description,380)||'Conhece a Vila Aurora.',
   emoji:clean(source.emoji,4)||(species==='human'?'🧑':'🐾'),
   actions,stock:sanitizeStock(source.stock),gold:amount(source.gold)??60
 };
}

export class RPGWorld {
 constructor(world){
  this.world=world;this.gold=60;this.bag={erva:2,ferro:1};
  this.escort=null;this.lastEvent='';
  this.profiles=new Map();
  for(const actor of world.actors.values()){
   const cfg=normalizeProfile({...actor,
    description: actor.species==='human'?'Mora na Vila Aurora e conhece a região.':'Criatura selvagem da floresta.',
    actions:DEFAULT_ROLES[actor.id]||[],
    stock:DEFAULT_CATALOG[actor.id]||{},gold:120});
   this.profiles.set(actor.id,cfg);
  }
  const originalDecide=world.decide.bind(world);
  world.decide=(actor)=>{
   if(this.escort?.actorId===actor.id)return;
   return originalDecide(actor);
  };
  const originalContext=world.getConversationContext.bind(world);
  world.getConversationContext=actor=>({
   ...originalContext(actor),
   role:this.profile(actor.id).role,
   name:actor.name,
   biography:actor.biography,
   description:this.profile(actor.id).description,
   allowedActions:this.profile(actor.id).actions,
   knownPlaces:PLACES.map(p=>({id:p.id,name:p.name})),
   inventory:Object.entries(this.profile(actor.id).stock).filter(([,n])=>n>0).map(([id,stock])=>({
     id,name:itemMap.get(id).name,stock,price:itemMap.get(id).price
   })),
   playerGold:this.gold
  });
 }
 profile(id){return this.profiles.get(id);}
 setProfile(id,source){
  const actor=this.world.actors.get(id);if(!actor)return false;
  const current=this.profile(id);
  const cfg=normalizeProfile({...current,...source});
  actor.name=cfg.name;actor.title=cfg.title;actor.role=cfg.role;actor.species=cfg.species;
  actor.biography=cfg.biography;actor.emoji=cfg.emoji;
  this.profiles.set(id,cfg);return true;
 }
 createNPC(source){
  const profile=normalizeProfile(source);
  if(this.world.actors.size>=80)return {ok:false,message:'Limite de 80 personagens atingido.'};
  const id='custom-'+Math.random().toString(36).slice(2,10);
  const x=clamp(Number(source.x)||490,30,955),y=clamp(Number(source.y)||317,30,580);
  const actor={
   id,name:profile.name,title:profile.title,role:profile.role,species:profile.species,
   emoji:profile.emoji,color:'#b9afe1',biography:profile.biography,
   home:{x,y},x,y,target:{x,y},traits:{courage:30,social:60},
   hunger:15,energy:85,mood:70,relationship:0,memories:[],history:[],
   state:'idle',thinkAt:0,walkSpeed:25,phase:0
  };
  this.world.actors.set(id,actor);this.profiles.set(id,profile);
  return {ok:true,actor};
 }
 getInventory(){return ITEMS.map(i=>({...i,owned:this.bag[i.id]||0}));}
 near(actor){return distance(this.world.player,actor)<=165;}
 findPlace(query){
  const text=clean(query,100).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return PLACES.find(p=>text===p.id||text===p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())||null;
 }
 findItem(query){
  const text=clean(query,90).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return ITEMS.find(i=>text===i.id||text===i.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())||null;
 }
 perform(actorId,proposal){
  const actor=this.world.actors.get(actorId),cfg=this.profile(actorId);
  if(!actor||!cfg)return {ok:false,message:'Personagem inexistente.'};
  const action=proposal?.action;
  if(!VALID.includes(action))return {ok:false,message:'Ação desconhecida.'};
  if(!cfg.actions.includes(action))return {ok:false,message:actor.name+' não está autorizado a realizar essa ação.'};
  if(!this.near(actor))return {ok:false,message:'Aproxime-se de '+actor.name+' antes de interagir.'};
  if(action==='guide'){
   const place=this.findPlace(proposal.place);
   if(!place)return {ok:false,message:'Destino desconhecido. Locais: '+PLACES.map(p=>p.name).join(', ')+'.'};
   this.escort={actorId:actor.id,placeId:place.id};
   actor.state='guiding';actor.target={x:place.x,y:place.y};
   return {ok:true,message:actor.name+' está guiando você até '+place.name+'. Siga o personagem.'};
  }
  const item=this.findItem(proposal.item);
  if(!item)return {ok:false,message:'Item desconhecido. Veja o catálogo de itens no painel.'};
  const quantity=Number(proposal.quantity??1);
  if(!Number.isInteger(quantity)||quantity<1||quantity>10)return {ok:false,message:'Quantidade deve ser de 1 a 10.'};
  const stock=cfg.stock[item.id]||0;
  const balance=this.bag[item.id]||0;
  if(action==='give'||action==='buy'){
   if(stock<quantity)return {ok:false,message:actor.name+' não tem '+quantity+'x '+item.name+' em estoque.'};
   const cost=action==='buy'?item.price*quantity:0;
   if(this.gold<cost)return {ok:false,message:'Você não tem moedas suficientes. Necessário: '+cost+'.'};
   this.gold-=cost;this.bag[item.id]=balance+quantity;cfg.stock[item.id]=stock-quantity;
   if(cost)cfg.gold+=cost;
   this.world.remember(actor,'trade',action+': '+quantity+'x '+item.name);
   return {ok:true,message:actor.name+(action==='give'?' entregou ':' vendeu ')+quantity+'x '+item.name+(cost?' por '+cost+' moedas.':'.')};
  }
  // Selling requires actual player-owned items and NPC spending funds.
  if(balance<quantity)return {ok:false,message:'Você não possui '+quantity+'x '+item.name+'.'};
  const payment=Math.max(1,Math.floor(item.price*0.6))*quantity;
  if(cfg.gold<payment)return {ok:false,message:actor.name+' não tem moedas suficientes para comprar.'};
  cfg.gold-=payment;this.gold+=payment;this.bag[item.id]=balance-quantity;
  cfg.stock[item.id]=stock+quantity;
  this.world.remember(actor,'trade','sell: '+quantity+'x '+item.name);
  return {ok:true,message:'Você vendeu '+quantity+'x '+item.name+' para '+actor.name+' por '+payment+' moedas.'};
 }
 tick(dt){
  if(!this.escort)return;
  const actor=this.world.actors.get(this.escort.actorId);
  const place=placeMap.get(this.escort.placeId);
  if(!actor||!place){this.escort=null;return;}
  actor.state='guiding';actor.target={x:place.x,y:place.y};
  const d=distance(actor,place);
  if(d<20){
   this.world.player.target={x:place.x,y:place.y};
   this.lastEvent=actor.name+' chegou a '+place.name+'.';
   this.escort=null;actor.state='idle';return;
  }
  // Player follows behind guide automatically; NPC continues moving through world.tick.
  this.world.player.target={x:actor.x,y:actor.y};
 }
 export(){
  return {version:1,gold:this.gold,bag:this.bag,escort:this.escort,
   profiles:[...this.profiles].map(([id,p])=>({id,...p,
    custom:id.startsWith('custom-')?(()=>{
      const a=this.world.actors.get(id);return {x:a.x,y:a.y};})():null
   }))};
 }
 import(data){
  if(data?.version!==1||!Array.isArray(data.profiles))return false;
  for(const p of data.profiles.slice(0,80)){
   if(p.custom&&!this.world.actors.has(p.id)){
    const created=this.createNPC({...p,...p.custom});
    if(!created.ok)continue;
    // custom IDs are kept stable across saved sessions
    this.world.actors.delete(created.actor.id);this.profiles.delete(created.actor.id);
    created.actor.id=p.id;this.world.actors.set(p.id,created.actor);
   }
   if(this.world.actors.has(p.id))this.setProfile(p.id,p);
  }
  this.gold=amount(data.gold)??60;
  this.bag=sanitizeStock(data.bag);
  // Escort is not resumed automatically after reloading.
  this.escort=null;return true;
 }
}

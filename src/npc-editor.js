import {ITEMS, PLACES} from './rpg.js';

const $=id=>document.getElementById(id);
const ACTIONS=[
 ['guide','Guiar até locais'],['buy','Vender ao jogador'],
 ['sell','Comprar do jogador'],['give','Entregar itens do estoque']
];
const TYPES=[['human','Humano'],['wolf','Lobo'],['deer','Cervo'],['boar','Javali']];
const ROLES=[
 ['villager','Morador'],['merchant','Comerciante'],['smith','Ferreiro'],
 ['herbalist','Herborista'],['guard','Guarda'],['innkeeper','Estalajadeiro'],
 ['other','Outro'],['wolf','Lobo'],['deer','Cervo'],['boar','Javali']
];
function option(select,value,label){select.add(new Option(label,value));}
function setMsg(text){$('npc-edit-status').textContent=text;}

export function initNPCEditor(world,rpg,{onChanged=()=>{},onAdded=()=>{},onAction=()=>{}}={}){
 const select=$('npc-edit-select'),form=$('npc-edit-form');
 const field={name:$('npc-name'),title:$('npc-title'),role:$('npc-role'),
  species:$('npc-species'),biography:$('npc-personality'),
  description:$('npc-background'),gold:$('npc-gold'),emoji:$('npc-emoji')};
 const speaking=$('npc-can-speak');
 const stockBox=$('npc-stock-grid'),bag=$('npc-player-bag');
 const active=$('npc-actions-grid');
 const place=$('npc-place'),item=$('npc-item'),qty=$('npc-qty');
 const actions=new Map(),stocks=new Map();
 let creating=false;
 for(const [id,label] of ROLES)option(field.role,id,label);
 for(const [id,label] of TYPES)option(field.species,id,label);
 field.species.addEventListener('change',()=>{speaking.checked=field.species.value==='human';});
 for(const p of PLACES)option(place,p.id,p.name);
 for(const i of ITEMS)option(item,i.id,i.name+' · '+i.price+' moedas');
 for(const [id,label] of ACTIONS){
  const container=document.createElement('label');
  const input=document.createElement('input');input.type='checkbox';input.value=id;
  container.append(input,document.createTextNode(' '+label));
  active.append(container);actions.set(id,input);
 }
 for(const i of ITEMS){
  const label=document.createElement('label');label.textContent=i.name+' (x)';
  const input=document.createElement('input');input.type='number';input.min='0';input.max='999';input.step='1';input.value='0';
  label.append(input);stockBox.append(label);stocks.set(i.id,input);
 }
 function refreshActors(selectId){
  select.replaceChildren();
  for(const a of world.actors.values())option(select,a.id,a.name+' · '+a.title);
  select.value=selectId||world.selectedId;
 }
 function fill(id){
  const a=world.actors.get(id),cfg=rpg.profile(id);if(!a||!cfg)return;
  creating=false;$('npc-edit-save').textContent='Salvar NPC';$('npc-edit-new').textContent='+ Criar novo NPC';
  select.value=id;
  for(const k of Object.keys(field))field[k].value=cfg[k]??'';
  speaking.checked=cfg.canSpeak;
  for(const [id,input] of actions)input.checked=cfg.actions.includes(id);
  for(const [id,input] of stocks)input.value=cfg.stock[id]??0;
  setMsg('Editando '+a.name+'. As alterações entram no prompt da IA e são salvas no navegador.');
 }
 function clearNew(){
  creating=true;select.value='';
  field.name.value='Novo Morador';field.title.value='Aventureiro';
  field.role.value='villager';field.species.value='human';
  field.biography.value='Curioso e prestativo';
  field.description.value='Vive na Vila Aurora e conhece seus moradores.';
  field.gold.value=60;field.emoji.value='🧑';
  speaking.checked=true;
  for(const [key,input] of actions)input.checked=key==='guide';
  for(const input of stocks.values())input.value=0;
  $('npc-edit-save').textContent='Adicionar ao mundo';
  $('npc-edit-new').textContent='Cancelar novo NPC';
  setMsg('Novo personagem: defina identidade, personalidade, permissões e estoque.');
 }
 function inputNumber(input,min,max){
  const n=Number(input.value);
  return Number.isInteger(n)&&n>=min&&n<=max?n:null;
 }
 function collect(){
  const gold=inputNumber(field.gold,0,999);
  if(gold===null)throw Error('Moedas do NPC devem estar entre 0 e 999.');
  const stock={};
  for(const [id,input] of stocks){
   const value=inputNumber(input,0,999);
   if(value===null)throw Error('Estoque inválido em '+id+' (0 a 999).');
   stock[id]=value;
  }
  return {
   canSpeak:speaking.checked,
   name:field.name.value.trim(),title:field.title.value.trim(),
   role:field.role.value,species:field.species.value,
   biography:field.biography.value.trim(),description:field.description.value.trim(),
   emoji:field.emoji.value.trim(),gold,
   actions:[...actions].filter(([,input])=>input.checked).map(([id])=>id),stock
  };
 }
 function displayBag(){
  bag.replaceChildren();
  const gold=document.createElement('strong');gold.textContent='🪙 '+rpg.gold+' moedas';
  bag.append(gold);
  for(const i of rpg.getInventory()){
   const span=document.createElement('span');span.textContent=i.name+': '+i.owned;
   bag.append(span);
  }
  const selected=world.actors.get(select.value),p=selected&&rpg.profile(selected.id);
  const near=selected?rpg.near(selected):false;
  $('npc-current-state').textContent=selected?'Decisão atual: '+selected.state+(rpg.escort?.actorId===selected.id?' · Guiando até '+rpg.escort.placeId:''):'Nenhum NPC selecionado';
  $('npc-distance').textContent=selected
   ?(near?'✔ Perto de '+selected.name+' — ações liberadas.':'⚠ '+selected.name+' está longe. Clique perto dele no mapa para se aproximar.')
   :'Selecione um personagem.';
  for(const button of $('npc-execute-actions').querySelectorAll('[data-action]')){
   button.disabled=!p||!p.actions.includes(button.dataset.action)||!near;
  }
 }
 form.addEventListener('submit',e=>{
  e.preventDefault();
  try{
   const profile=collect();
   if(!profile.name)throw Error('Informe um nome.');
   if(creating){
    const result=rpg.createNPC({...profile,x:world.player.x+42,y:world.player.y+24});
    if(!result.ok)throw Error(result.message);
    world.select(result.actor.id);
    onAdded(result.actor);
    document.dispatchEvent(new CustomEvent('worldai:actor-added',{detail:{id:result.actor.id}}));
    refreshActors(result.actor.id);fill(result.actor.id);
    setMsg('NPC criado: '+result.actor.name+'. Ele já aparece no mundo!');
   }else{
    if(!rpg.setProfile(select.value,profile))throw Error('NPC não encontrado.');
    onChanged();refreshActors(select.value);
    setMsg('Dados e permissões atualizados. O próximo chat usará esta personalidade.');
   }
   displayBag();
  }catch(err){setMsg('Erro: '+err.message);}
 });
 select.addEventListener('change',()=>{
  if(!world.actors.has(select.value))return;
  fill(select.value);world.select(select.value);onChanged();displayBag();
 });
 $('npc-edit-new').addEventListener('click',()=>{
  if(creating)fill(world.selectedId);else clearNew();
 });
 $('npc-export').addEventListener('click',()=>{
  const out={version:1,source:'WorldAI RPG demo',rpg:rpg.export()};
  const url=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='worldai-npcs.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setMsg('Configurações e estoque exportados em worldai-npcs.json.');
 });
 $('npc-edit-selected').addEventListener('click',()=>{
  refreshActors(world.selectedId);fill(world.selectedId);displayBag();
 });
 $('npc-execute-actions').addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  const proposal={actorId:select.value,action,place:place.value,
    item:item.value,quantity:Number(qty.value)};
  const result=rpg.perform(proposal.actorId,proposal);
  setMsg(result.message);
  onAction(result,proposal);
  displayBag();onChanged();
 });
 function refresh(){refreshActors(world.selectedId);fill(world.selectedId);displayBag();}
 refresh();
 return {refresh,displayBag,showMessage:setMsg};
}

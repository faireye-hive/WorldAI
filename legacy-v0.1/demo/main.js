import { createDemoWorld, WorldAI } from '../src/index.js';
import { createOllamaDecisionProvider, createOllamaDialogueProvider } from '../src/adapters/ollama.js';
const $=s=>document.querySelector(s);
const canvas=$('#map'),ctx=canvas.getContext('2d');
let world=createDemoWorld(), selectedId='marcus', paused=false,speed=1,decisions=0,filter='all',logs=[],lastFrame=performance.now(),uiElapsed=0;
const icons={wolf:'🐺',deer:'🦌',boar:'🐗',human:'🧑'};
const palettes={npc:'#71e7c7',monster:'#f0a776',animal:'#a8caff'};
const names={wander:'Explorando',forage:'Procurando alimento',hunt:'Caçando',flee:'Recuando',rest:'Descansando',socialize:'Socializando',work:'Trabalhando',patrol:'Patrulhando',investigate:'Investigando',return_home:'Voltando para casa',idle:'Parado'};
function labelKind(a){return a.kind==='npc'?'NPC':a.kind==='monster'?'MONSTRO':'ANIMAL';}
const fmtTime=t=>{const h=((t/world.dayLength*24)+7)%24;return `${String(Math.floor(h)).padStart(2,'0')}:${String(Math.floor((h%1)*60)).padStart(2,'0')}`;};
function log(e){
 const actor=world.actors.get(e.actorId)?.name||e.name||'Mundo';
 const target=world.actors.get(e.targetId)?.name||'';
 const entries={
   decision:`${actor}: ${names[e.action]||e.action} (${e.origin==='model'?'modelo local':'Utility AI'}).`,
   spawn:`${e.name} entrou no mundo.`,remove:`${actor} saiu do mundo.`,
   socialized:`${actor} conversou com ${target}.`,foraged:`${actor} encontrou alimento.`,
   encounter:`${actor} encontrou ${target}; a corça tentou escapar.`,
   worked:`${actor} concluiu uma tarefa.`,
   interaction:`${actor} interagiu com o jogador.`,
   noise:`Um ruído chamou a atenção de ${e.heard} criaturas.`,
   ai_error:`IA local indisponível para ${actor}: ${e.error}. Decisões convencionais continuam.`,
   ai_rejected:`Ação solicitada pela IA foi rejeitada para ${actor}.`
 };
 if(!entries[e.type])return;
 if(e.type==='decision')decisions++;
 logs.unshift({type:e.type,time:fmtTime(e.time),message:entries[e.type]});
 logs=logs.slice(0,80);
 const box=$('#log');box.replaceChildren();
 for(const l of logs.slice(0,28)){
  const row=document.createElement('div');row.className=`log-entry ${l.type}`;
  const stamp=document.createElement('span');stamp.className='stamp';stamp.textContent=l.time;
  const tag=document.createElement('span');tag.className='tag';tag.textContent=l.type==='decision'?'DECISÃO':l.type==='ai_error'?'IA LOCAL':l.type==='encounter'?'ENCONTRO':'EVENTO';
  const message=document.createElement('span');message.textContent=l.message;
  row.append(stamp,tag,message);box.append(row);
 }
}
function bindWorld(w){world=w;world.on('*',log);selectedId=world.actors.has(selectedId)?selectedId:world.actors.keys().next().value;refreshControls();}
bindWorld(world);

// Mapa pintado em Canvas; NENHUMA regra do motor depende desta renderização.
function terrain(){
 const w=canvas.width,h=canvas.height;
 ctx.fillStyle='#243f31';ctx.fillRect(0,0,w,h);
 ctx.lineWidth=.7;
 for(let x=0;x<w;x+=28)for(let y=0;y<h;y+=28){
   const v=Math.sin(x*13.31+y*7.83)*2901, f=(v-Math.floor(v));
   if(f>.50){ctx.fillStyle=f>.85?'#31543a':'#2a4936';ctx.fillRect(x+7+f*8,y+2,2,7);}
 }
 ctx.strokeStyle='#43684c';ctx.globalAlpha=.22;ctx.beginPath();for(let x=0;x<w;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let y=0;y<h;y+=40){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();ctx.globalAlpha=1;
 // Estradas e vila.
 ctx.lineCap='round';ctx.strokeStyle='#7b7152';ctx.lineWidth=27;
 ctx.beginPath();ctx.moveTo(0,271);ctx.bezierCurveTo(170,284,311,266,404,287);ctx.bezierCurveTo(545,375,693,364,980,360);ctx.stroke();
 ctx.strokeStyle='#a69b6c';ctx.lineWidth=3;ctx.setLineDash([7,16]);ctx.stroke();ctx.setLineDash([]);
 // Lago.
 ctx.fillStyle='#2e6675';roundRect(419,222,151,119,35);ctx.fill();ctx.strokeStyle='#66a7a0';ctx.lineWidth=2;ctx.stroke();
 ctx.strokeStyle='#8fd2c6';ctx.globalAlpha=.22;
 for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(485,278,27+i*12,9+i*7,0,0,6.28);ctx.stroke();}ctx.globalAlpha=1;
 // Casas e torre.
 drawBuilding(65,62,100,65,'FERREIRO');drawBuilding(177,63,100,65,'MERCADO');drawBuilding(71,146,100,60,'POUSADA');
 ctx.fillStyle='#5b6056';roundRect(723,390,67,52,9);ctx.fill();ctx.strokeStyle='#a3b4a0';ctx.stroke();
 // Bosque.
 for(const [x,y,r] of [[601,77,21],[680,60,19],[780,63,24],[896,235,18],[780,280,25],[634,374,21],[547,542,19],[445,559,27],[895,562,21],[790,556,22],[585,176,17],[372,67,21],[30,440,19],[61,528,26],[135,469,17]])drawTree(x,y,r);
 // Recursos.
 for(const r of world.resources){ctx.fillStyle='#afd06f';ctx.shadowColor='#83b752';ctx.shadowBlur=7;ctx.beginPath();ctx.arc(r.position.x,r.position.y,5,0,7);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#90ba67';ctx.lineWidth=1.1;ctx.beginPath();ctx.arc(r.position.x,r.position.y,10,0,7);ctx.stroke();}
 // Áreas e legenda no mapa.
 ctx.textAlign='center';ctx.font='700 11px system-ui';ctx.fillStyle='#d7d4b1';ctx.fillText('VILA DA CLAREIRA',198,38);ctx.fillStyle='#a3d4b7';ctx.fillText('FLORESTA SOMBRIA',815,33);
 const darkness=world.isNight()? .31:.02;ctx.fillStyle=`rgba(7,18,36,${darkness})`;ctx.fillRect(0,0,w,h);
}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawBuilding(x,y,w,h,title){ctx.fillStyle='#665947';ctx.fillRect(x+4,y+7,w,h);ctx.strokeStyle='#b19a72';ctx.lineWidth=2;ctx.strokeRect(x+4,y+7,w,h);ctx.fillStyle='#997352';ctx.beginPath();ctx.moveTo(x-8,y+15);ctx.lineTo(x+50,y-10);ctx.lineTo(x+w+12,y+15);ctx.closePath();ctx.fill();ctx.fillStyle='#ddc6a2';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.fillText(title,x+w/2+4,y+44);}
function drawTree(x,y,r){ctx.fillStyle='#112f2b';ctx.beginPath();ctx.arc(x+4,y+7,r+4,0,7);ctx.fill();ctx.fillStyle='#326444';ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.fillStyle='#448256';ctx.beginPath();ctx.arc(x-6,y-7,r*.64,0,7);ctx.fill();}
function draw(){
 terrain();
 const selected=world.actors.get(selectedId);
 if(selected){
   ctx.strokeStyle='#8af5d45c';ctx.fillStyle='#6be4c20b';ctx.lineWidth=1;ctx.beginPath();ctx.arc(selected.position.x,selected.position.y,selected.vision,0,7);ctx.fill();ctx.stroke();
   if(selected.route.length){ctx.setLineDash([5,8]);ctx.strokeStyle='#e9e48b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(selected.position.x,selected.position.y);for(const p of selected.route)ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);}
 }
 for(const a of world.actors.values()){
   const color=palettes[a.kind],p=a.position,s=a.id===selectedId;
   ctx.beginPath();ctx.arc(p.x,p.y,s?13:10,0,7);ctx.fillStyle='#102323';ctx.fill();ctx.lineWidth=s?3:2;ctx.strokeStyle=s?'#fff5bc':color;ctx.stroke();
   ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,s?7:5,0,7);ctx.fill();
   ctx.textAlign='center';ctx.fillStyle='#e6f4ed';ctx.font=`${s?'700 ':''}11px system-ui`;
   if(s||a.kind==='npc')ctx.fillText(a.name,p.x,p.y-16);
   if(s){ctx.fillStyle='#d8eac4';ctx.font='10px system-ui';ctx.fillText(names[a.action.type]||a.action.type,p.x,p.y+27);}
 }
 const p=world.player;
 ctx.strokeStyle='#e9d27a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,12,0,7);ctx.stroke();ctx.fillStyle='#f6e7ad';ctx.beginPath();ctx.arc(p.x,p.y,4,0,7);ctx.fill();
 ctx.fillStyle='#e5d8ac';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.fillText('JOGADOR',p.x,p.y-20);
}
function actorRow(a){const b=document.createElement('button');b.className=`actor-item ${a.id===selectedId?'selected':''}`;
 const icon=document.createElement('span');icon.className='actor-ico';icon.textContent=icons[a.species]||'◉';
 const desc=document.createElement('span');const strong=document.createElement('strong');strong.textContent=a.name;const small=document.createElement('small');small.textContent=`${labelKind(a)} · ${names[a.action.type]}`;desc.append(strong,small);b.append(icon,desc);b.addEventListener('click',()=>{selectedId=a.id;refreshControls();});return b;
}
function refreshControls(){
 $('#actorList').replaceChildren(...[...world.actors.values()].filter(a=>filter==='all'||a.kind===filter).map(actorRow));
 const a=world.actors.get(selectedId);const inspector=$('#inspector');inspector.replaceChildren();if(!a)return;
 $('#inspectorBadge').textContent=labelKind(a);
 const wrapper=document.createElement('div');wrapper.className='inspector-body';
 const title=document.createElement('div');title.className='inspector-title';
 const icon=document.createElement('div');icon.className='inspector-symbol';icon.textContent=icons[a.species]||'◉';
 const desc=document.createElement('div');const strong=document.createElement('strong');strong.textContent=a.name;const small=document.createElement('small');small.textContent=`${a.role||a.species} · ${a.id}`;desc.append(strong,small);title.append(icon,desc);wrapper.append(title);
 const metric=(name,value,cl='')=>{
  const label=document.createElement('div');label.className='metric-label';const left=document.createElement('span');left.textContent=name;const right=document.createElement('span');right.textContent=`${Math.round(value)}%`;label.append(left,right);
  const bar=document.createElement('div');bar.className=`meter ${cl}`;const fill=document.createElement('i');fill.style.width=`${value}%`;bar.append(fill);wrapper.append(label,bar);
 };
 metric('Saúde',a.health);metric('Fome',a.needs.hunger,'amber');metric('Cansaço',a.needs.fatigue,'blue');metric('Social',a.needs.social);
 const line=(label,value)=>{const d=document.createElement('div');d.className='info-line';const l=document.createElement('span');l.textContent=label;const v=document.createElement('b');v.textContent=value;d.append(l,v);wrapper.append(d);};
 line('Ação atual',names[a.action.type]||a.action.type);line('Motivo',a.action.reason);line('Origem',a.action.origin==='model'?'IA local':'Utility AI');line('Caráter',`Coragem ${a.traits.courage} · Curiosidade ${a.traits.curiosity}`);
 const memory=document.createElement('div');memory.className='recent-memory';memory.textContent=a.memory.length?`◉ Última memória: ${a.memory.at(-1).type} (${a.memory.length} registros)`:'◉ Ainda não possui memórias.';wrapper.append(memory);
 const buttons=document.createElement('div');buttons.className='inspector-actions';
 const greet=document.createElement('button');greet.textContent='◌ Conversar';greet.onclick=()=>openDialogue(a.id);
 const help=document.createElement('button');help.textContent='✦ Ajudar';help.onclick=()=>{world.interact(a.id,{kind:'help',text:'Ajudei este personagem.'});refreshControls();};buttons.append(greet,help);wrapper.append(buttons);
 inspector.append(wrapper);
}
function stats(){
 $('#agentsCount').textContent=world.actors.size;$('#decisionsCount').textContent=decisions.toLocaleString('pt-BR');$('#timeDisplay').textContent=fmtTime(world.time);
 $('#dayState').textContent=world.isNight()?'Noite':'Dia';
}
function loop(now){let dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
 if(!paused)world.step(dt*speed);
 uiElapsed+=dt;if(uiElapsed>.45){uiElapsed=0;stats();refreshControls();}
 draw();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'▶ Continuar':'Ⅱ Pausar';};
$('#reset').onclick=()=>{bindWorld(createDemoWorld());decisions=0;logs=[];$('#log').replaceChildren();setAIMode();stats();};
$('#speed').oninput=e=>{speed=Number(e.target.value);$('#speedDisplay').textContent=`${speed}×`;};
for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{filter=button.dataset.filter;for(const other of document.querySelectorAll('[data-filter]'))other.classList.toggle('selected',other===button);refreshControls();};
canvas.addEventListener('click',e=>{const rect=canvas.getBoundingClientRect();const p={x:(e.clientX-rect.left)*980/rect.width,y:(e.clientY-rect.top)*620/rect.height};
 const a=[...world.actors.values()].find(a=>Math.hypot(a.position.x-p.x,a.position.y-p.y)<17);
 if(a){selectedId=a.id;refreshControls();}else if(world.isWalkable(p)){world.setPlayer(p);}});
const create=(kind)=>{
 const seed=world.actors.size+Math.floor(world.time);const x=kind==='npc'?300:kind==='monster'?805:645,y=kind==='npc'?380:kind==='monster'?235:505;
 const a=world.addActor({name:kind==='npc'?`Viajante ${seed}`:kind==='monster'?`Lobo ${seed}`:`Cervo ${seed}`,kind,species:kind==='npc'?'human':kind==='monster'?'wolf':'deer',faction:kind==='npc'?'village':kind==='monster'?'pack':'herd',role:kind==='npc'?'traveler':'',position:{x:x+(seed%5)*12,y:y+(seed%3)*13},home:{x,y},speed:kind==='animal'?70:kind==='monster'?50:38,vision:175,needs:{hunger:60,fatigue:20,social:22}});
 selectedId=a.id;refreshControls();};
$('#addNpc').onclick=()=>create('npc');$('#addWolf').onclick=()=>create('monster');$('#addDeer').onclick=()=>create('animal');
$('#noise').onclick=()=>world.makeNoise(world.player,1.5);
$('#clearLog').onclick=()=>{logs=[];$('#log').replaceChildren();};
$('#save').onclick=()=>{const data=JSON.stringify(world.serialize(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='worldai-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);};
$('#load').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>10_000_000)throw Error('Arquivo maior que 10 MB');bindWorld(WorldAI.fromJSON(await file.text()));decisions=0;logs=[];$('#log').replaceChildren();setAIMode();stats();}catch(error){alert(`Não foi possível importar: ${error.message}`);}e.target.value='';};
let dialogActorId=null;
function addBubble(who,text,isYou=false){const bubble=document.createElement('div');bubble.className=`bubble ${isYou?'you':''}`;const top=document.createElement('small');top.textContent=who;const msg=document.createElement('div');msg.textContent=text;bubble.append(top,msg);$('#dialogueMessages').append(bubble);$('#dialogueMessages').scrollTop=999999;return bubble;}
function openDialogue(id){const a=world.actors.get(id);if(!a)return;dialogActorId=id;$('#dialogueName').textContent=a.name;$('#dialogueMessages').replaceChildren();addBubble(a.name,`Olá, viajante! Sou ${a.name}. O que deseja saber?`);$('#dialogueModal').hidden=false;$('#dialogueInput').focus();}
$('#dialogueClose').onclick=()=>{$('#dialogueModal').hidden=true;dialogActorId=null;};
$('#dialogueModal').onclick=e=>{if(e.target===$('#dialogueModal'))$('#dialogueClose').click();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#dialogueModal').hidden)$('#dialogueClose').click();});
$('#dialogueForm').onsubmit=async e=>{
 e.preventDefault();const text=$('#dialogueInput').value.trim();const id=dialogActorId;if(!text||!id)return;
 $('#dialogueInput').value='';addBubble('Você',text,true);const a=world.actors.get(id);if(!a)return;
 const bubble=addBubble(a.name,'Pensando...');const enabled=$('#aiToggle').checked;
 const provider=enabled?createOllamaDialogueProvider({model:$('#model').value.trim()||'lfm3',endpoint:'/api/ollama'}):null;
 const answer=await world.talk(id,text,{provider});bubble.querySelector('div').textContent=answer;refreshControls();
};
function setAIMode(){
 const active=$('#aiToggle').checked,model=$('#model').value.trim()||'lfm3';
 world.setDecisionProvider(active?createOllamaDecisionProvider({model,endpoint:'/api/ollama',timeoutMs:8000}):null,{interval:15,maxConcurrent:1});
 $('#aiStatus').textContent=active?'ON':'OFF';$('#aiStatus').style.color=active?'#75e7be':'';
 $('#aiSubtitle').textContent=active?`Ollama: ${model}`:'Comportamento local';
}
$('#aiToggle').onchange=setAIMode;$('#model').onchange=setAIMode;
refreshControls();stats();

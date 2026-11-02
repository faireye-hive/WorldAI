import {WorldAIEngine} from './world.js';
import {DEFAULT_MODEL,checkOllama,askOllama} from './ollama.js';
import {initComparator} from './comparator.js';
const $=id=>document.getElementById(id);
const world=new WorldAIEngine();const canvas=$('world'),ctx=canvas.getContext('2d');
const state={ready:false,loading:false,busy:false,decisions:0,lastSelected:null,toastUntil:0};
const hints=['Olá, tudo bem?','Como você se chama?','Você precisa de ajuda?','Conhece algum segredo?'];
const emojiColors={smith:'#d09e71',merchant:'#b5a2e4',herbalist:'#9dcdb5',guard:'#91b2db',innkeeper:'#dbb69a',wolf:'#a8bccc',deer:'#d2b58f',boar:'#c1a48e'};
const mapTrees=Array.from({length:43},(_,i)=>{const rnd=n=>((Math.sin(i*127.1+n*51.3)*43758.5453)%1+1)%1;return {x:615+rnd(1)*350,y:55+rnd(2)*520,s:13+rnd(3)*15}});
function save(){try{localStorage.setItem('worldai-story-save',JSON.stringify(world.export()));}catch{} }
try{const data=JSON.parse(localStorage.getItem('worldai-story-save')||'null');if(data)world.import(data);}catch{}
const all=[...world.actors.values()];
world.onEvent=e=>{if(e.type==='decision')state.decisions++;};
function renderActors(){const list=$('actor-list');list.replaceChildren();for(const a of all){const b=document.createElement('button');b.className='actor-item'+(a.id===world.selectedId?' selected':'');b.type='button';b.dataset.actorId=a.id;b.innerHTML=`<span class="avatar"></span><span class="copy"><strong></strong><small></small></span><span class="status">●</span>`;b.querySelector('.avatar').textContent=a.emoji;b.querySelector('strong').textContent=a.name;b.querySelector('small').textContent=a.role==='wolf'||a.role==='deer'||a.role==='boar'?'Criatura do bosque':a.role.toUpperCase();b.addEventListener('click',()=>selectActor(a.id));list.appendChild(b);}}
function makeMessage(type,from,text){const article=document.createElement('div');article.className='message '+type;const by=document.createElement('small');by.textContent=from;const content=document.createElement('div');content.textContent=text;article.append(by,content);return article;}
function appendMessage(type,from,text){const area=$('speech-log');const el=makeMessage(type,from,text);area.appendChild(el);area.scrollTop=area.scrollHeight;return el;}
function renderConversation(){const a=world.selected;if(!a)return;$('character-name').textContent=a.name;$('character-class').textContent=a.role==='wolf'||a.role==='deer'||a.role==='boar'?'FAUNA LOCAL':a.role.toUpperCase();$('character-mood').textContent='✦ '+a.biography;$('portrait-figure').textContent=a.emoji;$('portrait-area').style.background=`radial-gradient(ellipse at 50% 115%,${emojiColors[a.role]}66,transparent 70%),linear-gradient(120deg,#242a4b,#32304d)`;
 const area=$('speech-log');area.replaceChildren();if(a.history.length===0){appendMessage('npc',a.name,a.species==='human'?'Ah, um novo visitante! Fale comigo para conhecer minha história.':'A criatura olha em sua direção, observando seus movimentos.');}else{for(const item of a.history)appendMessage(item.role==='user'?'user':'npc',item.role==='user'?'VOCÊ':a.name,item.content);}
 $('story-counter').textContent='MEMÓRIA: '+a.memories.length;$('suggestions').replaceChildren();for(const h of hints){const btn=document.createElement('button');btn.type='button';btn.textContent=h;btn.disabled=state.busy;btn.addEventListener('click',()=>sendMessage(h));$('suggestions').appendChild(btn);} $('chat-input').placeholder=`Conversar com ${a.name}...`;}
function selectActor(id){world.select(id);state.lastSelected=id;renderActors();renderConversation();save();}
function setAIStatus(text,kind='off',details=''){$('model-badge').textContent=text;$('model-badge').className='pill '+kind;if(details)$('model-state').textContent=details;$('dialog-source').textContent=state.ready?'✳ Respostas por Ollama local ('+($('model-name').value.trim()||DEFAULT_MODEL)+')':'◆ Diálogos offline de demonstração';}
async function connectOllama(){
 if(state.ready||state.loading)return;
 if(import.meta.env.PROD){
  setAIStatus('APENAS LOCAL','off','Abra o repositório no computador com Ollama e execute npm run dev. O GitHub Pages não executa o proxy local.');
  return;
 }
 const model=$('model-name').value.trim()||DEFAULT_MODEL;
 state.loading=true;
 $('load-model').disabled=true;
 setAIStatus('CONECTANDO','loading','Consultando 127.0.0.1:11434 pelo proxy local do Vite...');
 try{
  await checkOllama({model});
  state.ready=true;
  $('model-name').disabled=true;
  $('load-model').textContent='✓ Ollama conectado';
  setAIStatus('OLLAMA CONECTADO','on',model+' disponível. A primeira mensagem pode demorar até o modelo carregar na memória.');
 }catch(error){
  state.ready=false;
  $('load-model').textContent='↻ Tentar novamente';
  setAIStatus('OLLAMA OFFLINE','off',error.message);
 }finally{
  state.loading=false;
  $('load-model').disabled=false;
 }
}
$('load-model').addEventListener('click',connectOllama);
if(import.meta.env.PROD){
 $('load-model').disabled=true;
 $('load-model').textContent='Disponível na versão local';
 setAIStatus('MODO ROTEIRO','off','Para conversar usando o seu Ollama, execute este projeto via npm run dev no computador com o modelo instalado.');
}
async function requestAI(actor,question){
 const context={...world.getConversationContext(actor),question};
 return askOllama(context,{model:$('model-name').value.trim()||DEFAULT_MODEL});
}
async function sendMessage(text){text=String(text).trim();if(!text||state.busy)return;const a=world.selected;if(!a)return;state.busy=true;$('chat-submit').disabled=true;$('chat-input').disabled=true;for(const b of $('suggestions').querySelectorAll('button'))b.disabled=true;$('chat-input').value='';const userMsg=appendMessage('user','VOCÊ',text);const busy=appendMessage('npc',a.name,'Pensando...');busy.classList.add('pending');let reply,mode='script';try{if(state.ready){mode='ollama';try{reply=await requestAI(a,text);}catch(err){reply=world.scriptedReply(a,text);mode='fallback';$('dialog-feedback').textContent='Ollama: '+String(err.message).slice(0,170)+' — diálogo de roteiro.';}}else reply=world.scriptedReply(a,text);world.interact(a,text,reply,mode);busy.remove();appendMessage('npc',a.name,reply);if(world.selectedId===a.id)$('story-counter').textContent='MEMÓRIA: '+a.memories.length;save();}finally{state.busy=false;$('chat-submit').disabled=false;$('chat-input').disabled=false;for(const b of $('suggestions').querySelectorAll('button'))b.disabled=false;$('chat-input').focus();}}
$('chat-form').addEventListener('submit',e=>{e.preventDefault();sendMessage($('chat-input').value);});$('pause').addEventListener('click',()=>{world.paused=!world.paused;$('pause').textContent=world.paused?'▶':'Ⅱ';});$('reset').addEventListener('click',()=>{if(!confirm('Reiniciar o mundo e apagar conversas salvas?'))return;localStorage.removeItem('worldai-story-save');location.reload();});$('save-world').addEventListener('click',()=>{save();$('save-world').textContent='✓ Salvo';setTimeout(()=>$('save-world').textContent='↓ Salvar progresso',1600);});
function polygon(points,fill){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
function rounded(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function line(x,y,x2,y2,width,color){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();}
function tree(x,y,size){ctx.fillStyle='#172f34aa';ctx.beginPath();ctx.ellipse(x+5,y+10,size*.86,size*.45,-.3,0,Math.PI*2);ctx.fill();line(x,y,x+2,y+size*.2,size*.2,'#755e46');for(const [dx,dy,s,color] of [[-8,2,.7,'#265847'],[9,-5,.6,'#2c6a53'],[0,-11,.83,'#39735b']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x+dx*size/23,y+dy*size/23,size*s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff07';ctx.beginPath();ctx.arc(x+dx*size/23-4,y+dy*size/23-6,size*s*.42,0,Math.PI*2);ctx.fill();}}
function house(x,y,w,h,label,roof='#b47c70'){rounded(x+6,y+22,w,h-10,8,'#6f6153');rounded(x+13,y+32,w-26,h-27,3,'#b9a389');polygon([[x-7,y+27],[x+w/2,y-10],[x+w+7,y+27]],roof);line(x,y+27,x+w,y+27,3,'#6d4950');rounded(x+w*.42,y+h*.55,w*.18,h*.33,3,'#504343');rounded(x+15,y+40,18,19,2,'#a2c3bb');rounded(x+w-34,y+40,18,19,2,'#a2c3bb');ctx.textAlign='center';ctx.font='bold 10px DM Sans, sans-serif';ctx.fillStyle='#fdf2d6';ctx.fillText(label,x+w/2,y+h+14);}
function drawBackground(){const W=1000,H=620;const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#507b65');bg.addColorStop(1,'#6e9468');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#8ca97824';for(let i=0;i<150;i++){const x=(i*137+72)%W,y=(i*89+103)%H;ctx.fillRect(x,y,4,2);}
 ctx.beginPath();ctx.moveTo(0,352);ctx.bezierCurveTo(230,327,460,308,1000,360);ctx.lineWidth=94;ctx.strokeStyle='#bca77d';ctx.stroke();ctx.lineWidth=74;ctx.strokeStyle='#d4c098';ctx.stroke();ctx.beginPath();ctx.moveTo(490,620);ctx.bezierCurveTo(489,440,484,260,342,0);ctx.lineWidth=59;ctx.strokeStyle='#c6b38c';ctx.stroke();ctx.lineWidth=47;ctx.strokeStyle='#dac6a0';ctx.stroke();
 ctx.beginPath();ctx.moveTo(584,0);ctx.bezierCurveTo(548,90,592,174,568,258);ctx.bezierCurveTo(533,315,593,390,578,470);ctx.bezierCurveTo(565,535,587,590,600,620);ctx.lineWidth=38;ctx.strokeStyle='#305f78';ctx.stroke();ctx.lineWidth=25;ctx.strokeStyle='#73b4bd';ctx.stroke();line(533,329,613,329,15,'#654938');line(533,319,613,319,10,'#a77c57');for(let i=0;i<8;i++)line(540+i*9,313,540+i*9,335,2,'#5d483c');
 for(const t of mapTrees)tree(t.x,t.y,t.s);house(135,68,130,103,'ESTALAGEM','#a67f8c');house(242,205,124,104,'FORJA','#a97761');house(366,130,110,93,'MERCADO','#9077a3');house(405,438,125,93,'GUARDA','#81879b');
 rounded(658,312,100,65,7,'#6e986f');for(let i=0;i<6;i++){const x=675+i*12;ctx.fillStyle=i%2?'#e8c6a3':'#eadbaa';ctx.beginPath();ctx.arc(x,340+(i%3)*10,3,0,Math.PI*2);ctx.fill();}
 ctx.fillStyle='#e2b661';ctx.beginPath();ctx.ellipse(397,360,37,30,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#958162';ctx.beginPath();ctx.ellipse(397,360,29,22,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d2b77c';ctx.beginPath();ctx.arc(397,359,11,0,Math.PI*2);ctx.fill();ctx.font='24px serif';ctx.fillText('✦',389,369);
 if(world.isNight){ctx.fillStyle='#071b3b7b';ctx.fillRect(0,0,W,H);for(const [x,y] of [[202,151],[294,285],[427,212],[455,505]]){const glow=ctx.createRadialGradient(x,y,1,x,y,80);glow.addColorStop(0,'#f9d39460');glow.addColorStop(1,'#f9d39400');ctx.fillStyle=glow;ctx.fillRect(x-80,y-80,160,160);}}
}
function drawActor(a){const x=a.x,y=a.y,selected=a.id===world.selectedId;ctx.fillStyle='#182c3180';ctx.beginPath();ctx.ellipse(x,y+15,15,5,0,0,Math.PI*2);ctx.fill();if(selected){ctx.strokeStyle='#f3e5a1';ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(x,y+14,20,7,0,0,Math.PI*2);ctx.stroke();}
 const bounce=Math.sin(a.phase)*1.6;ctx.save();ctx.translate(x,y+bounce);if(a.species==='human'){ctx.fillStyle=a.color;rounded(-9,-4,18,21,6,a.color);ctx.fillStyle='#293047';rounded(-7,11,5,7,2,'#293047');rounded(2,11,5,7,2,'#293047');ctx.fillStyle='#f1c8a6';ctx.beginPath();ctx.arc(0,-10,10,0,Math.PI*2);ctx.fill();ctx.fillStyle=a.id==='marcus'?'#654836':a.id==='soren'?'#495876':'#644b46';ctx.beginPath();ctx.arc(0,-14,10,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle='#273244';ctx.fillRect(-4,-11,2,2);ctx.fillRect(3,-11,2,2);}else{ctx.font='25px serif';ctx.textAlign='center';ctx.fillText(a.emoji,0,4);}ctx.restore();if(selected||a.species==='human'){rounded(x-35,y-46,70,16,5,'#0c2038cc');ctx.font='bold 10px DM Sans, sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff5e6';ctx.fillText(a.name,x,y-35);}}
function drawPlayer(){const p=world.player;ctx.fillStyle='#153b4350';ctx.beginPath();ctx.ellipse(p.x,p.y+16,14,6,0,0,Math.PI*2);ctx.fill();rounded(p.x-10,p.y-4,20,22,5,'#4165a8');ctx.fillStyle='#f7cda9';ctx.beginPath();ctx.arc(p.x,p.y-11,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3b3342';ctx.beginPath();ctx.arc(p.x,p.y-13,10,Math.PI,Math.PI*2);ctx.fill();ctx.font='bold 10px DM Sans,sans-serif';ctx.textAlign='center';ctx.fillStyle='white';ctx.fillText('VOCÊ',p.x,p.y-34);ctx.strokeStyle='#c6e0ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y+17,17,6,0,0,Math.PI*2);ctx.stroke();}
function draw(){ctx.clearRect(0,0,1000,620);drawBackground();for(const a of [...all].sort((a,b)=>a.y-b.y))drawActor(a);drawPlayer();$('world-clock').textContent=world.clock;$('day-label').textContent=world.isNight?'NOITE':'DIA';$('world-decisions').textContent=state.decisions;}
canvas.addEventListener('click',e=>{const rect=canvas.getBoundingClientRect();const p={x:(e.clientX-rect.left)/rect.width*1000,y:(e.clientY-rect.top)/rect.height*620};let nearest=null;let nearDist=31;for(const a of all){const d=Math.hypot(a.x-p.x,a.y-p.y);if(d<nearDist){nearest=a;nearDist=d;}}if(nearest){selectActor(nearest.id);if(window.innerWidth<=1030)$('chat-input').scrollIntoView({block:'nearest',behavior:'smooth'});}else{world.movePlayer(p.x,p.y);}});
let previous=performance.now();function frame(now){world.tick((now-previous)/1000);previous=now;draw();requestAnimationFrame(frame);}renderActors();renderConversation();initComparator(world);requestAnimationFrame(frame);setInterval(save,20000);addEventListener('beforeunload',save);
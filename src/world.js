/** WorldAI core: does not depend on Canvas, Three.js or model inference. */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DIALOGUES={
  marcus:{intro:'A forja está quente hoje. Precisa de alguma coisa?',name:'Sou Marcus, ferreiro da Vila Aurora. Trabalho metal desde criança.',town:'A praça fica ao centro. A floresta começa além do riacho.',work:'Procuro minério de ferro. Minhas ferramentas não se consertam sozinhas.',secret:'Dizem que há ruínas antigas depois da ponte... mas nunca fui até lá.'},
  lina:{intro:'Bem-vindo à minha barraca! Está procurando algum tesouro?',name:'Lina, comerciante e viajante. Conheço quase todas as rotas daqui.',town:'A estalagem fica ao norte e a forja perto da praça.',work:'Preciso de ervas frescas para levar aos clientes.',secret:'O guarda Soren já foi um aventureiro. Pergunte a ele!'},
  iris:{intro:'Shhh... escute o vento nas árvores. O bosque tem histórias.',name:'Me chamo Iris. Estudo plantas e cuido dos animais feridos.',town:'A floresta a leste é bonita, mas respeite os animais.',work:'Quero descobrir por que os cervos estão se aproximando da vila.',secret:'Encontrei flores luminosas perto do lago, depois do anoitecer.'},
  soren:{intro:'Alto! Ah, apenas um viajante. Seja bem-vindo.',name:'Soren. Sou responsável pela segurança desta vila.',town:'A ponte é o único caminho seguro para a mata.',work:'Faço rondas. Recentemente vi lobos próximos das árvores.',secret:'Quando era jovem, explorei as ruínas. Ainda tenho o mapa.'},
  nora:{intro:'Uma boa história merece uma cadeira e uma xícara de chá.',name:'Sou Nora, responsável pela estalagem.',town:'A nossa vila é pequena, mas recebe pessoas de todos os lugares.',work:'Tenho quartos para arrumar e muitas histórias para ouvir.',secret:'Já ouvi uma melodia estranha vinda do lago durante a noite.'}
};
const ACTORS=[
  ['marcus','Marcus','Ferreiro','smith','🛠️',286,298,'#f5ac67','Às vezes ríspido, porém generoso',34,24],
  ['lina','Lina','Comerciante','merchant','🧺',418,259,'#e2a7e8','Bem-humorada, curiosa e falante',22,78],
  ['iris','Iris','Herborista','herbalist','🌿',734,348,'#99dcc1','Calma, observadora e apaixonada pela natureza',12,62],
  ['soren','Soren','Guarda','guard','🛡️',516,406,'#b1c8f7','Disciplinado, protetor e prudente',55,32],
  ['nora','Nora','Estalajadeira','innkeeper','🍵',237,166,'#f2c6a9','Gentil e cheia de histórias',18,88],
  ['wolf1','Lobo cinzento','Lobo','wolf','🐺',834,139,'#b4c5d5','Cauteloso e territorial',72,15],
  ['wolf2','Lobo jovem','Lobo','wolf','🐺',900,218,'#a5bdd1','Curioso, mas evita a vila',38,40],
  ['deer1','Cervo da clareira','Cervo','deer','🦌',704,477,'#dcb887','Muito sensível a barulhos',5,35],
  ['deer2','Corça','Cervo','deer','🦌',846,510,'#ddc6a4','Foge quando percebe lobos',4,55],
  ['boar','Javali','Javali','boar','🐗',939,397,'#bc9f87','Protege seu território',58,12]
];
export class WorldAIEngine{
  constructor(){this.time=8*60;this.player={x:490,y:317,target:null};this.actors=new Map();this.onEvent=()=>{};this.paused=false;for(const [id,name,role,species,emoji,x,y,color,biography,courage,social] of ACTORS){this.actors.set(id,{id,name,title:role,role:species,species:['smith','merchant','herbalist','guard','innkeeper'].includes(species)?'human':species,emoji,color,biography,home:{x,y},x,y,target:{x,y},traits:{courage,social},hunger:15+Math.random()*24,energy:75+Math.random()*20,mood:70,relationship:0,memories:[],history:[],state:'idle',thinkAt:Math.random()*5,walkSpeed:role==='wolf'?37:role==='deer'?42:role==='boar'?24:25,phase:Math.random()*6});}this.selectedId='lina';}
  get selected(){return this.actors.get(this.selectedId)||null;}
  get hour(){return Math.floor(this.time/60)%24;}
  get clock(){const h=Math.floor(this.time/60)%24,m=Math.floor(this.time%60);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
  get isNight(){return this.hour>=20||this.hour<6;}
  select(id){if(!this.actors.has(id))return null;this.selectedId=id;return this.selected;}
  movePlayer(x,y){this.player.target={x:clamp(x,20,980),y:clamp(y,20,600)};}
  remember(actor,type,data){actor.memories.push({type,data:String(data).slice(0,160),time:this.clock});actor.memories=actor.memories.slice(-16);this.onEvent({type,actorId:actor.id});}
  interact(actor,input,response,mode){const question=String(input).trim().slice(0,240);const reply=String(response).trim().slice(0,450);if(!reply)return;actor.history.push({role:'user',content:question},{role:'assistant',content:reply});actor.history=actor.history.slice(-10);actor.relationship=clamp(actor.relationship+2,-100,100);actor.mood=clamp(actor.mood+1,0,100);this.remember(actor,'conversation',`${question} → ${reply}`);this.onEvent({type:'dialogue',actorId:actor.id,mode});}
  getConversationContext(actor){return {name:actor.name,role:actor.role,biography:actor.biography,species:actor.species, mood:Math.round(actor.mood),relationship:actor.relationship,hour:this.clock,memories:actor.memories.slice(-3),history:actor.history.slice(-6)};}
  scriptedReply(actor,question){const q=question.toLocaleLowerCase('pt-BR');const d=DIALOGUES[actor.id];if(!d){return actor.species==='wolf'?'O lobo observa você com atenção e recua alguns passos.':actor.species==='deer'?'O animal ergue as orelhas e permanece atento.':'O javali fareja o ar e segue seu caminho.';}
    if(/nome|quem|chama/.test(q))return d.name;if(/onde|cidade|vila|lugar|mapa/.test(q))return d.town;if(/trabal|ajud|miss[aã]o|precisa/.test(q))return d.work;if(/segredo|rumor|hist[oó]ria|mist[eé]rio/.test(q))return d.secret;if(/oi|ol[aá]|bom dia|boa noite|tudo bem/.test(q))return `${d.intro} ${actor.relationship>6?'É bom falar com alguém conhecido.':''}`;return `${d.intro} ${actor.mood<40?'Andei tendo um dia difícil.':'O que mais você gostaria de saber sobre a vila?'}`;}
  tick(dt){if(this.paused)return;dt=clamp(dt,0,0.08);this.time+=dt*2.9;const p=this.player;if(p.target){let d=dist(p,p.target);if(d<2)p.target=null;else{let s=Math.min(d,dt*128);p.x+=(p.target.x-p.x)/d*s;p.y+=(p.target.y-p.y)/d*s;}}
    for(const a of this.actors.values()){a.phase+=dt*3;a.hunger=clamp(a.hunger+dt*.25,0,100);a.energy=clamp(a.energy-dt*.08,0,100);a.thinkAt-=dt;if(a.thinkAt<=0){this.decide(a);a.thinkAt=2.5+Math.random()*4;}const d=dist(a,a.target);if(d>2){const s=Math.min(d,a.walkSpeed*dt);a.x+=(a.target.x-a.x)/d*s;a.y+=(a.target.y-a.y)/d*s;}else if(a.state==='walking')a.state='idle';}
  }
  decide(a){const fear=[...this.actors.values()].some(b=>b.species==='wolf'&&a.species==='deer'&&dist(a,b)<135);const night=this.isNight;const old=a.state;
    if(fear){a.state='fleeing';a.target={x:clamp(a.x+(a.x-820)*.3,600,966),y:clamp(a.y+85,80,575)};}
    else if(a.hunger>65){a.state='foraging';a.hunger=clamp(a.hunger-22,0,100);a.target={x:clamp(a.home.x+Math.random()*100-50,90,960),y:clamp(a.home.y+Math.random()*100-50,90,580)};}
    else if(night&&a.species==='human'){a.state='resting';a.target={...a.home};a.energy=clamp(a.energy+5,0,100);}
    else{const r=Math.random();a.state=r<.25?'observing':r<.56?'walking':r<.77?'socializing':'patrolling';const radius=a.species==='human'?75:110;a.target={x:clamp(a.home.x+(Math.random()-.5)*radius*2,60,965),y:clamp(a.home.y+(Math.random()-.5)*radius*2,90,555)};}
    if(old!==a.state)this.onEvent({type:'decision',actorId:a.id,state:a.state});}
  export(){return {version:1,time:this.time,player:this.player,selectedId:this.selectedId,actors:[...this.actors.values()].map(a=>({id:a.id,x:a.x,y:a.y,relationship:a.relationship,mood:a.mood,memories:a.memories,history:a.history}))};}
  import(data){if(!data||data.version!==1||!Array.isArray(data.actors))return false;this.time=Number.isFinite(data.time)?data.time:480;this.player={x:clamp(Number(data.player?.x)||490,0,980),y:clamp(Number(data.player?.y)||317,0,600),target:null};for(const s of data.actors){const a=this.actors.get(s.id);if(!a)continue;a.x=clamp(Number(s.x)||a.home.x,0,980);a.y=clamp(Number(s.y)||a.home.y,0,600);a.target={x:a.x,y:a.y};a.relationship=clamp(Number(s.relationship)||0,-100,100);a.mood=clamp(Number(s.mood)||70,0,100);a.memories=Array.isArray(s.memories)?s.memories.slice(-16):[];a.history=Array.isArray(s.history)?s.history.slice(-10):[];}if(this.actors.has(data.selectedId))this.selectedId=data.selectedId;return true;}
}
import { SeededRandom } from '../utils/rng.js';
import { clamp, clone, distance, distSq, finite, towards } from '../utils/math.js';
import { findPath } from './pathfinding.js';
import { ACTIONS, contextFor, candidateActions, destinationFor } from './behavior.js';

const normalizeTraits = t => Object.fromEntries(['aggression','courage','curiosity','sociability'].map(k=>[k,clamp(finite(t?.[k],50),0,100)]));
const normalizeNeeds = n => Object.fromEntries(['hunger','fatigue','social'].map(k=>[k,clamp(finite(n?.[k],25),0,100)]));
const validPoint = (p,fallback) => ({x:finite(p?.x,fallback.x),y:finite(p?.y,fallback.y)});
const compactMemory = (m) => ({type:String(m.type).slice(0,35), at:finite(m.at,0), who:String(m.who ?? '').slice(0,64), data:clone(m.data||{})});

/** Núcleo de simulação independente de Three.js, canvas e modelos de IA. */
export class WorldAI {
  constructor({width=980,height=620,seed=2026,dayLength=240,cell=20}={}) {
    if (!(width>=100&&height>=100)) throw Error('Dimensões inválidas');
    this.width=width;this.height=height;this.dayLength=dayLength;this.cell=cell;
    this.time=0; this.rng=new SeededRandom(seed);
    this.actors=new Map();this.resources=[];this.obstacles=[];
    this.player={x:width*.47,y:height*.60};
    this._listeners=new Map();this._serial=0;
    this._brain=null;this._brainOptions={interval:10,maxConcurrent:1};this._brainRunning=0;
  }
  on(name,callback) {
    if (!this._listeners.has(name)) this._listeners.set(name,new Set());
    this._listeners.get(name).add(callback);
    return ()=>this._listeners.get(name)?.delete(callback);
  }
  emit(type,payload={}) {
    const event={type,time:this.time,...payload};
    for (const cb of this._listeners.get(type)||[]) { try{cb(event);}catch(e){console.error('WorldAI event listener:',e);} }
    for (const cb of this._listeners.get('*')||[]) { try{cb(event);}catch(e){console.error('WorldAI event listener:',e);} }
    return event;
  }
  setPlayer(position){this.player=this.boundPoint(position);this.emit('player_moved',{position:{...this.player}});}
  isNight() {const hour=((this.time/this.dayLength)*24 + 7)%24;return hour>=20||hour<6;}
  getHour(){return ((this.time/this.dayLength)*24+7)%24;}
  boundPoint(p){return {x:clamp(finite(p.x,10),10,this.width-10),y:clamp(finite(p.y,10),10,this.height-10)};}
  isWalkable(p){return p.x>=10&&p.y>=10&&p.x<=this.width-10&&p.y<=this.height-10 && !this.obstacles.some(o=>p.x>o.x-5&&p.x<o.x+o.w+5&&p.y>o.y-5&&p.y<o.y+o.h+5);}
  addObstacle(o){const obstacle={x:finite(o.x),y:finite(o.y),w:Math.max(1,finite(o.w,1)),h:Math.max(1,finite(o.h,1))};this.obstacles.push(obstacle);return obstacle;}
  addResource(data){const r={id:String(data.id||`res_${++this._serial}`),name:data.name||'Alimento',type:data.type||'food',position:this.boundPoint(data.position),stock:clamp(finite(data.stock,8),0,100),maxStock:Math.max(1,finite(data.maxStock,8)),regrowth:Math.max(0,finite(data.regrowth,.016))};this.resources.push(r);return r;}
  addActor(data){
    const id=String(data.id||`actor_${++this._serial}`);
    if(this.actors.has(id)) throw Error(`Ator duplicado: ${id}`);
    const position=this.boundPoint(validPoint(data.position,{x:this.width/2,y:this.height/2}));
    if(!this.isWalkable(position))throw Error(`Posição inicial bloqueada: ${id}`);
    const actor={
      id,name:String(data.name||id),biography:String(data.biography||'').slice(0,450),kind:['npc','monster','animal'].includes(data.kind)?data.kind:'animal',
      species:String(data.species||'human'),role:String(data.role||''),faction:String(data.faction||data.species||'neutral'),
      position,home:this.boundPoint(validPoint(data.home,position)),workplace:data.workplace?this.boundPoint(data.workplace):null,
      speed:clamp(finite(data.speed,35),3,150),vision:clamp(finite(data.vision,145),15,450),
      health:clamp(finite(data.health,100),0,100),traits:normalizeTraits(data.traits), needs:normalizeNeeds(data.needs),
      inventory:{...(data.inventory||{})},relations:clone(data.relations||{}),memory:(data.memory||[]).slice(-25).map(compactMemory),
      action:{type:'idle',until:0,reason:'aguardando',targetId:null,point:null,origin:'utility',performed:false,since:0},
      route:[],nextDecisionAt:this.time+this.rng.range(.15,2),nextAICallAt:this.time+this.rng.range(1,4),
      tags:Array.isArray(data.tags)?data.tags.slice(0,12):[], brainEnabled:data.brainEnabled!==false
    };
    this.actors.set(id,actor);this.emit('spawn',{actorId:id,name:actor.name,species:actor.species});return actor;
  }
  removeActor(id){const a=this.actors.get(id);if(a){this.actors.delete(id);this.emit('remove',{actorId:id});}return !!a;}
  nearby(position,radius){const r2=radius**2;return [...this.actors.values()].filter(a=>distSq(a.position,position)<=r2);}
  areFriends(a,b){return (a.faction===b.faction || (a.kind==='npc'&&b.kind==='npc')) && a.id!==b.id;}
  isThreat(a,b){
    if(a.id===b.id)return false;
    if(a.species==='deer')return b.species==='wolf';
    if(a.kind==='npc')return b.species==='wolf' && a.role!=='guard';
    if(a.species==='wolf')return b.role==='guard' && a.health<55;
    return false;
  }
  isPrey(a,b){return a.species==='wolf' && b.species==='deer';}
  remember(a,type,who='',data={}){
    if(typeof a==='string')a=this.actors.get(a);
    if(!a)return;
    a.memory.push(compactMemory({type,at:this.time,who,data}));
    if(a.memory.length>25)a.memory.shift();
    this.emit('memory',{actorId:a.id,memoryType:type,who});
  }
  interact(actorId,{kind='greet',text=''}={}) {
    const a=this.actors.get(actorId);if(!a) return null;
    const message=String(text).slice(0,180);
    this.remember(a,'player_interaction','player',{kind,text:message});
    a.relations.player=clamp((a.relations.player||0)+(kind==='help'?12:kind==='greet'?3:-3),-100,100);
    this.emit('interaction',{actorId,kind});return {name:a.name,relationship:a.relations.player,memoryCount:a.memory.length};
  }
  /** Diálogos com fallback offline; modelos só geram texto, sem alterar estado ou executar comandos. */
  async talk(actorId,input,{provider=null}={}) {
    const a=this.actors.get(actorId);if(!a)throw Error('Personagem não encontrado');
    const question=String(input||'').trim().slice(0,240);
    if(!question)throw Error('Mensagem vazia');
    this.interact(actorId,{kind:'greet',text:question});
    let answer='';
    if(provider){
      try {
        const snapshot={
          actor:{id:a.id,name:a.name,role:a.role,species:a.species,biography:a.biography,traits:clone(a.traits),health:a.health,needs:clone(a.needs),relationship:a.relations.player||0},
          question, hour:this.getHour(), memories:a.memory.slice(-6).map(clone)
        };
        answer=String(await provider(snapshot)||'').trim().slice(0,400);
      }catch(error){this.emit('ai_error',{actorId:a.id,error:String(error.message||error).slice(0,160)});}
    }
    if(!answer){
      const msg=question.toLowerCase();
      if(/nome|quem (é|e) voc[eê]/.test(msg)) answer=`Sou ${a.name}. ${a.biography||'Vivo por aqui e conheço estas terras.'}`;
      else if(/miss[aã]o|ajuda|trabalho/.test(msg))answer=a.role==='smith'?'Preciso organizar a forja e reunir materiais. Volte mais tarde para saber das encomendas.':a.role==='guard'?'A vila precisa de olhos atentos. Se ouvir algo estranho, avise a guarda.':'Há sempre algo a fazer na vila. Converse com os moradores.';
      else if(/onde|cidade|vila/.test(msg))answer='A vila fica a oeste do lago. A floresta se estende para leste.';
      else if(a.needs.hunger>75)answer=`Olá! Sou ${a.name}. Estou com fome e procurando algo para comer.`;
      else answer=`Olá, viajante! Eu sou ${a.name}. ${a.biography||'Este lugar tem sempre alguma surpresa.'}`;
    }
    this.remember(a,'dialogue','player',{question,response:answer});
    this.emit('dialogue',{actorId:a.id,model:!!provider,answer});
    return answer;
  }
  makeNoise(position,strength=1){
    const p=this.boundPoint(position);let heard=0;
    for(const a of this.actors.values()) {
      if(distance(a.position,p)>a.vision*clamp(strength,.1,3))continue;
      this.remember(a,'noise','world',{position:p});heard++;
      if(a.role==='guard')a.nextDecisionAt=this.time;
    }
    this.emit('noise',{position:p,heard});return heard;
  }
  /** Permite uma IA externa SOMENTE para escolher entre ações já permitidas. Nunca executa código da IA. */
  setDecisionProvider(provider=null,{interval=12,maxConcurrent=1}={}){
    if(provider!==null&&typeof provider!=='function')throw Error('Provider deve ser uma função');
    this._brain=provider;this._brainOptions={interval:Math.max(2,interval),maxConcurrent:clamp(maxConcurrent,1,4)};
    this.emit('brain_changed',{enabled:!!provider});
  }
  _applyAction(a,option,origin='utility'){
    if(!ACTIONS.includes(option.action))return false;
    const same=a.action.type===option.action&&a.action.targetId===(option.targetId||null)&&this.time<a.action.until && (a.route.length>0 || (!a.action.performed && ['work','rest','patrol','return_home'].includes(a.action.type)));
    if(same)return false;
    let point=destinationFor(this,a,option);
    if(!this.isWalkable(point))point={...a.position};
    let route=[];
    if(distance(a.position,point)>11 && option.action!=='rest' && option.action!=='idle')route=findPath(a.position,point,{width:this.width,height:this.height},this.obstacles,this.cell);
    a.action={type:option.action,reason:option.reason||option.action,targetId:option.targetId||null,
      point,until:this.time+([ 'work','patrol','rest','return_home'].includes(option.action)?8:5),
      origin,since:this.time,performed:false};
    a.route=route;
    this.emit('decision',{actorId:a.id,name:a.name,action:option.action,reason:a.action.reason,origin});
    return true;
  }
  _decide(a){
    const ctx=contextFor(this,a),choices=candidateActions(this,a,ctx);
    const highest=choices[0];
    if(highest)this._applyAction(a,highest);
    a.nextDecisionAt=this.time+this.rng.range(1.6,3.4);
    if(this._brain && this.time>=a.nextAICallAt && this._brainRunning<this._brainOptions.maxConcurrent){
      a.nextAICallAt=this.time+this._brainOptions.interval;
      this._brainRunning++;
      // Snapshot pequeno; o provider recebe apenas dados, não recebe objetos mutáveis do motor.
      const snapshot={time:this.time,hour:this.getHour(),actor:{id:a.id,name:a.name,kind:a.kind,species:a.species,role:a.role,health:a.health,traits:clone(a.traits),needs:clone(a.needs),memory:a.memory.slice(-3).map(clone)},
        candidates:choices.slice(0,6).map(o=>({...o,point:o.point?{...o.point}:undefined}))};
      const epoch=this.time;
      const provider=this._brain;
      Promise.resolve().then(()=>provider(snapshot)).then(result=>{
        if(this._brain!==provider || this.actors.get(a.id)!==a || this.time-epoch>this._brainOptions.interval*2 || !result)return;
        const requested=typeof result==='string'?result:result.action;
        const allowed=snapshot.candidates.find(c=>c.action===requested);
        // A decisão nunca pula a checagem de opções e é revalidada no estado atual.
        const current=candidateActions(this,a,contextFor(this,a)).find(c=>c.action===requested);
        if(allowed&&current)this._applyAction(a,current,'model');
        else this.emit('ai_rejected',{actorId:a.id,requested});
      }).catch(err=>this.emit('ai_error',{actorId:a.id,error:String(err?.message||err).slice(0,160)}))
        .finally(()=>{this._brainRunning--;});
    }
  }
  _onArrive(a){
    const ac=a.action;
    if(ac.performed)return;
    if(ac.type==='forage'){
      const food=this.resources.find(r=>r.id===ac.targetId);
      if(food&&distance(a.position,food.position)<24&&food.stock>=1){food.stock-=1;a.needs.hunger=clamp(a.needs.hunger-34,0,100);ac.performed=true;this.remember(a,'ate',food.id,{name:food.name});this.emit('foraged',{actorId:a.id,resourceId:food.id});}
    }else if(ac.type==='hunt'){
      const target=this.actors.get(ac.targetId);
      if(target && distance(a.position,target.position)<24){
        ac.performed=true; a.needs.hunger=clamp(a.needs.hunger-28,0,100);
        this.remember(a,'hunt_encounter',target.id);
        this.remember(target,'escaped_wolf',a.id);
        target.nextDecisionAt=this.time;
        this._applyAction(target,{action:'flee',targetId:a.id,reason:'fugir do predador'});
        this.emit('encounter',{actorId:a.id,targetId:target.id});
      }
    }else if(ac.type==='socialize'){
      const friend=this.actors.get(ac.targetId);
      if(friend&&distance(a.position,friend.position)<28){ac.performed=true;a.needs.social=clamp(a.needs.social-38,0,100);friend.needs.social=clamp(friend.needs.social-18,0,100);a.relations[friend.id]=clamp((a.relations[friend.id]||0)+2,-100,100);this.remember(a,'met_friend',friend.id);this.emit('socialized',{actorId:a.id,targetId:friend.id});}
    }
    if(ac.performed)ac.until=this.time;
  }
  _updateActor(a,dt){
    a.needs.hunger=clamp(a.needs.hunger+dt*.19,0,100);
    a.needs.fatigue=clamp(a.needs.fatigue+dt*(a.action.type==='rest'?-4.8:.16),0,100);
    a.needs.social=clamp(a.needs.social+dt*.09,0,100);
    if(a.route.length){
      const next=a.route[0],before=a.position;
      const speed=a.speed * (a.needs.fatigue>85?.72:1);
      const after=towards(before,next,speed*dt);
      if(this.isWalkable(after))a.position=after;
      if(distance(a.position,next)<2.5) {a.route.shift();if(!a.route.length)this._onArrive(a);}
      if(a.action.type==='hunt' && a.action.targetId){
        const prey=this.actors.get(a.action.targetId);
        if(prey && distance(prey.position,a.action.point)>24 && this.time - a.action.since>.5){
          a.action.point={...prey.position};a.route=findPath(a.position,prey.position,{width:this.width,height:this.height},this.obstacles,this.cell);
        }
        if(prey && distance(a.position,prey.position)<22)this._onArrive(a);
      }
    } else this._onArrive(a);
    if(a.action.type==='work' && !a.route.length && this.time-a.action.since>=4 && !a.action.performed){
      a.inventory.coins=(a.inventory.coins||0)+1;
      a.action.performed=true;a.action.until=this.time;
      this.emit('worked',{actorId:a.id,role:a.role});
    }
    if(a.brainEnabled&&this.time>=a.nextDecisionAt)this._decide(a);
  }
  /** Atualize pelo delta do jogo (segundos). Tempo simulado máximo por chamada: 1s. */
  step(deltaSeconds){
    let remaining=clamp(finite(deltaSeconds,0),0,1);
    while(remaining>1e-7){
      const dt=Math.min(remaining,.05);remaining-=dt;this.time+=dt;
      for(const a of this.actors.values())this._updateActor(a,dt);
      for(const r of this.resources)r.stock=clamp(r.stock+r.regrowth*dt,0,r.maxStock);
    }
  }
  serialize(){return clone({version:1,width:this.width,height:this.height,dayLength:this.dayLength,cell:this.cell,time:this.time,seedState:this.rng.state,
    serial:this._serial,player:this.player,obstacles:this.obstacles,resources:this.resources,actors:[...this.actors.values()]});}
  static fromJSON(json){
    const s=typeof json==='string'?JSON.parse(json):json;
    if(s?.version!==1 || !Array.isArray(s.actors)||s.actors.length>20000||!Array.isArray(s.obstacles)||!Array.isArray(s.resources))throw Error('Save incompatível');
    const w=new WorldAI({width:s.width,height:s.height,dayLength:s.dayLength,cell:s.cell});
    w.time=finite(s.time);w.rng.state=s.seedState>>>0||1;w._serial=finite(s.serial);
    w.obstacles=clone(s.obstacles);w.resources=clone(s.resources);w.player=w.boundPoint(s.player);
    for(const d of s.actors){const a=w.addActor(d);a.action=clone(d.action);a.route=clone(d.route);a.nextDecisionAt=finite(d.nextDecisionAt,w.time+1);a.nextAICallAt=finite(d.nextAICallAt,w.time+3);}
    // addActor consome RNG apenas na criação: restaurar estado EXATAMENTE salvo.
    w.rng.state=s.seedState>>>0||1;
    return w;
  }
}

/**
 * WorldAI: memória social fictícia, construída a partir das falas do jogador.
 * "Pensamentos" aqui são resumos narrativos para o jogo, NÃO raciocínio
 * interno do LLM nem inferências confiáveis sobre a pessoa real.
 */
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const short=(v,n)=>String(v??'').trim().slice(0,n);
const numeric=(v,lo,hi)=>Number.isFinite(Number(v))?clamp(Math.round(Number(v)),lo,hi):0;
const feeling=new Set(['neutro','curioso','confiante','cauteloso','respeitoso','desconfiado']);
const baseline=()=>({
  familiarity:0,trust:50,openness:50,patience:50,feeling:'neutro',
  opinion:'Ainda não tenho uma opinião formada sobre o visitante.',
  insight:'Nenhuma interação analisada.',history:[],revision:0
});
export class SocialMemory {
  constructor(world) {
    this.world=world;
    this.states=new Map();
    for(const a of world.actors.values())this.ensure(a.id);
    const old=world.getConversationContext.bind(world);
    world.getConversationContext=actor=>({...old(actor),social:this.context(actor.id)});
    // Express small social changes in ambient NPC behavior, without overriding
    // combat, navigation, escort, or any actual game permission.
    const oldDecide=world.decide.bind(world);
    world.decide=actor=>{
      oldDecide(actor);
      if(actor.species!=='human'||actor.state==='guiding')return;
      const mood=this.get(actor.id);
      if(mood.openness>=60 && actor.state==='observing')actor.state='socializing';
      if(mood.openness<=40 && actor.state==='socializing')actor.state='observing';
    };
  }
  ensure(id){
    if(!this.states.has(id))this.states.set(id,baseline());
    return this.states.get(id);
  }
  get(id){return this.ensure(id);}
  context(id){
    const s=this.ensure(id);
    return {familiarity:s.familiarity,trust:s.trust,openness:s.openness,
      patience:s.patience,feeling:s.feeling,opinion:s.opinion,
      recentInsight:s.insight};
  }
  markConversation(id){
    const s=this.ensure(id);s.familiarity=clamp(s.familiarity+1,0,999);
  }
  applyReflection(id,payload,question){
    const s=this.ensure(id);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
    const opinion=short(payload.opinion,180);
    const insight=short(payload.insight,180);
    if(!opinion||!insight)return false;
    const changeTrust=numeric(payload.trustChange,-3,3);
    const changeOpen=numeric(payload.opennessChange,-2,2);
    const changePatience=numeric(payload.patienceChange,-2,2);
    s.trust=clamp(s.trust+changeTrust,0,100);
    s.openness=clamp(s.openness+changeOpen,0,100);
    s.patience=clamp(s.patience+changePatience,0,100);
    const actor=this.world.actors.get(id);
    if(actor)actor.relationship=clamp((s.trust-50)*2,-100,100);
    s.feeling=feeling.has(payload.feeling)?payload.feeling:'neutro';
    s.opinion=opinion;s.insight=insight;s.revision++;
    s.history.push({
      question:short(question,100),insight,
      feeling:s.feeling,trustChange:changeTrust,
      opennessChange:changeOpen,patienceChange:changePatience
    });
    s.history=s.history.slice(-8);
    return true;
  }
  reset(id){
    const actor=this.world.actors.get(id);
    if(!actor)return false;
    this.states.set(id,baseline());
    actor.relationship=0;
    return true;
  }
  export(){
    return {version:1,states:[...this.states].filter(([id])=>this.world.actors.has(id))
      .map(([id,s])=>({id,...s,history:s.history.slice(-8)}))};
  }
  import(data){
    if(data?.version!==1||!Array.isArray(data.states))return false;
    for(const obj of data.states.slice(0,80)){
      if(!this.world.actors.has(obj?.id))continue;
      const s=baseline();
      s.familiarity=numeric(obj.familiarity,0,999);
      for(const k of ['trust','openness','patience']){
        const n=Number(obj[k]);s[k]=Number.isFinite(n)?clamp(Math.round(n),0,100):50;
      }
      s.feeling=feeling.has(obj.feeling)?obj.feeling:'neutro';
      s.opinion=short(obj.opinion,180)||s.opinion;
      s.insight=short(obj.insight,180)||s.insight;
      s.revision=numeric(obj.revision,0,10000);
      s.history=Array.isArray(obj.history)?obj.history.slice(-8).map(e=>({
        question:short(e.question,100),insight:short(e.insight,180),
        feeling:feeling.has(e.feeling)?e.feeling:'neutro',
        trustChange:numeric(e.trustChange,-3,3),
        opennessChange:numeric(e.opennessChange,-2,2),
        patienceChange:numeric(e.patienceChange,-2,2)
      })):[];
      this.states.set(obj.id,s);
      const actor=this.world.actors.get(obj.id);
      if(actor)actor.relationship=clamp((s.trust-50)*2,-100,100);
    }
    return true;
  }
}

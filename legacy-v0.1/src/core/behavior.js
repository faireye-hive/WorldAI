import { clamp, distance } from '../utils/math.js';

export const ACTIONS = Object.freeze(['idle','wander','forage','hunt','flee','rest','socialize','work','patrol','investigate','return_home']);
const isWild = a => a.kind !== 'npc';

export function contextFor(world, a) {
  const visible = world.nearby(a.position, a.vision).filter(b => b.id !== a.id);
  const threats = visible.filter(b => world.isThreat(a,b)).sort((x,y) => distance(a.position,x.position)-distance(a.position,y.position));
  const prey = visible.filter(b => world.isPrey(a,b)).sort((x,y) => distance(a.position,x.position)-distance(a.position,y.position));
  const friends = visible.filter(b => world.areFriends(a,b)).sort((x,y) => distance(a.position,x.position)-distance(a.position,y.position));
  const food = world.resources.filter(r => r.type === 'food' && r.stock >= 1).sort((x,y) => distance(a.position,x.position)-distance(a.position,y.position));
  const notices = a.memory.filter(m => world.time-m.at <= 16 && m.type === 'noise');
  return { threats, prey, friends, food, notices, night: world.isNight(), player: world.player };
}

export function candidateActions(world, a, c) {
  const N = a.needs, T = a.traits;
  const danger = c.threats[0];
  const dangerDist = danger ? distance(a.position,danger.position) : Infinity;
  const options = [
    { action:'wander', score:14 + T.curiosity*.12, reason:'explorar o ambiente' },
    { action:'rest', score: N.fatigue*.85 + (c.night ? 22 : 0), reason:'recuperar energia' },
    { action:'return_home', score:c.night && a.kind === 'npc' ? 45 : 2, reason:'voltar ao lar' }
  ];
  if (danger) {
    const urgency = clamp((a.vision-dangerDist)/a.vision,0,1);
    const risk = (100-T.courage)*.60 + (100-a.health)*.35;
    options.push({ action:'flee', score: 32+urgency*65+risk*.55, reason:`evitar ${danger.name}`, targetId:danger.id });
  }
  if (c.food.length && N.hunger > 15) {
    const nearest = c.food[0];
    options.push({ action:'forage', score:N.hunger*.85 + (isWild(a)?12:4) - Math.min(distance(a.position,nearest.position)/20,16), reason:'procurar alimento', targetId:nearest.id });
  }
  if (a.species === 'wolf' && c.prey.length && N.hunger > 20) {
    const nearest = c.prey[0];
    options.push({action:'hunt',score: N.hunger*.85 + T.aggression*.45 - Math.min(distance(a.position,nearest.position)/15,16),reason:`seguir ${nearest.name}`,targetId:nearest.id});
  }
  if (c.friends.length && N.social > 20) {
    options.push({ action:'socialize', score:N.social*.73 + T.sociability*.4, reason:`socializar com ${c.friends[0].name}`, targetId:c.friends[0].id });
  }
  if (a.kind === 'npc') {
    if (a.role === 'guard') options.push({action:'patrol',score:c.night?55:48,reason:'vigiar a região'});
    else options.push({action:'work',score:c.night?8:55 + a.needs.hunger*.08,reason:'exercer sua profissão'});
  }
  if (c.notices.length && a.role === 'guard') {
    const n = c.notices.at(-1);
    options.push({action:'investigate',score:92,reason:'investigar ruído',point:n.data.position});
  }
  if (world.time < a.action.until && a.action.type !== 'idle') {
    options.push({action:a.action.type,score:25,reason:a.action.reason, targetId:a.action.targetId, point:a.action.point});
  }
  return options.filter(o => Number.isFinite(o.score)).sort((x,y) => y.score-x.score);
}

export function destinationFor(world,a,option) {
  const rand = world.rng;
  const nearbyRandom = (radius=75) => {
    for (let i=0;i<15;i++) {
      const p={x:clamp(a.position.x+rand.range(-radius,radius),12,world.width-12), y:clamp(a.position.y+rand.range(-radius,radius),12,world.height-12)};
      if (world.isWalkable(p)) return p;
    }
    return { ...a.position };
  };
  const target = world.actors.get(option.targetId) || world.resources.find(r=>r.id===option.targetId);
  switch(option.action) {
    case 'flee': {
      if (!target) return nearbyRandom(120);
      const dx = a.position.x-target.position.x, dy=a.position.y-target.position.y;
      const d=Math.hypot(dx,dy)||1;
      const p={x:clamp(a.position.x+dx/d*120,12,world.width-12),y:clamp(a.position.y+dy/d*120,12,world.height-12)};
      return world.isWalkable(p) ? p : nearbyRandom(95);
    }
    case 'forage': case 'hunt':case 'socialize': return target ? {...target.position}:nearbyRandom();
    case 'return_home':return {...a.home};
    case 'investigate': return option.point || nearbyRandom();
    case 'work':return a.workplace ? {...a.workplace}:a.home;
    case 'patrol': return nearbyRandom(110);
    case 'wander':return nearbyRandom(a.kind==='npc'?70:110);
    default:return {...a.position};
  }
}

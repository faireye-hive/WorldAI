import { WorldAI } from '../core/WorldAI.js';

export function createDemoWorld(seed=2026){
  const w=new WorldAI({width:980,height:620,seed,dayLength:280,cell:20});
  // Lago, construções e rochas: obstáculos reais para o A*.
  w.addObstacle({x:420,y:224,w:148,h:116});
  w.addObstacle({x:65,y:62,w:100,h:65});
  w.addObstacle({x:177,y:63,w:100,h:65});
  w.addObstacle({x:71,y:146,w:100,h:60});
  w.addObstacle({x:723,y:390,w:67,h:52});
  const food=[
    ['berries_1','Frutos da clareira',350,150,13],
    ['berries_2','Arbustos silvestres',646,147,13],
    ['berries_3','Raízes na mata',805,530,14],
    ['berries_4','Pomar da vila',284,300,14],
    ['berries_5','Frutos do sul',385,492,14]
  ];
  for(const [id,name,x,y,stock] of food)w.addResource({id,name,position:{x,y},stock,maxStock:stock,regrowth:.030});
  const npc=(id,name,role,x,y,wx,wy,traits,biography)=>w.addActor({id,name,biography,kind:'npc',species:'human',faction:'village',role,position:{x,y},home:{x:225,y:230},workplace:{x:wx,y:wy},speed:38,vision:160,traits,needs:{hunger:22,fatigue:26,social:25}});
  npc('marcus','Marcus','smith',220,242,232,212,{aggression:18,courage:68,curiosity:30,sociability:38},'Sou ferreiro e cuido das ferramentas da vila.');
  npc('lina','Lina','merchant',306,234,315,250,{aggression:12,courage:48,curiosity:56,sociability:86},'Comerciante, conheço os viajantes que passam por aqui.');
  npc('soren','Soren','guard',340,355,345,345,{aggression:48,courage:94,curiosity:55,sociability:35},'Sou guarda e protejo as estradas da vila.');
  npc('iris','Iris','herbalist',283,400,305,376,{aggression:10,courage:42,curiosity:91,sociability:72},'Estudo as ervas e os animais desta floresta.');
  const wolf=(id,name,x,y,traits)=>w.addActor({id,name,kind:'monster',species:'wolf',faction:'pack',position:{x,y},home:{x:840,y:110},speed:52,vision:205,traits,needs:{hunger:65,fatigue:14,social:21}});
  wolf('wolf_1','Lobo Alfa',820,135,{aggression:75,courage:82,curiosity:66,sociability:77});
  wolf('wolf_2','Lobo Jovem',855,192,{aggression:48,courage:45,curiosity:80,sociability:86});
  wolf('wolf_3','Lobo Solitário',910,95,{aggression:85,courage:72,curiosity:36,sociability:10});
  const deer=(id,name,x,y)=>w.addActor({id,name,kind:'animal',species:'deer',faction:'herd',position:{x,y},home:{x:605,y:455},speed:70,vision:240,traits:{aggression:0,courage:18,curiosity:62,sociability:72},needs:{hunger:48,fatigue:10,social:28}});
  deer('deer_1','Corça',690,500);
  deer('deer_2','Cervo',585,470);
  w.addActor({id:'boar_1',name:'Javali',kind:'animal',species:'boar',faction:'boars',position:{x:895,y:459},home:{x:890,y:480},speed:32,vision:145,traits:{aggression:50,courage:55,curiosity:28,sociability:15},needs:{hunger:60,fatigue:20,social:12}});
  w.setPlayer({x:478,y:423});
  return w;
}

// EXEMPLO de integração. Este arquivo supõe que você já possui uma cena Three.js.
// Não requer Three.js no núcleo do WorldAI.
import { WorldAI } from '../src/index.js';

export function connectWorldAI({ scene, THREE, npcMeshes, npcData, mapWidth=980, mapHeight=620 }) {
  const brain=new WorldAI({width:mapWidth,height:mapHeight,seed:42});
  for(const d of npcData)brain.addActor({id:d.id,name:d.name,kind:d.kind||'npc',species:d.species||'human',role:d.role||'',position:{x:d.worldX,y:d.worldZ},speed:d.speed||35});
  const unsub=brain.on('decision',event=>{
    // Aqui você pode trocar animação (idle/walk/alert) ou registrar telemetria.
    console.debug('[WorldAI]',event.name,event.action);
  });
  function update(deltaSeconds){
    brain.step(deltaSeconds);
    for(const actor of brain.actors.values()){
      const mesh=npcMeshes.get(actor.id);
      if(!mesh)continue;
      // Adapte a escala e os offsets à transformação do mapa Tales of Pirates.
      mesh.position.x=actor.position.x;
      mesh.position.z=actor.position.y;
      // A altura Y deve vir do sistema de terreno do jogo original.
    }
  }
  function dispose(){unsub();}
  return { brain,update,dispose };
}

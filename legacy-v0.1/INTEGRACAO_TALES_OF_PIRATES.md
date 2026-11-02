# Integração futura com Tales of Pirates (Three.js)

O WorldAI foi mantido independente da engine e dos assets históricos para evitar acoplamento prematuro ao cliente. Nenhum arquivo do seu projeto atual foi alterado.

## Plano de integração, por fases

### 1 — Posicionamento

No mapa do Tales of Pirates, obtenha as coordenadas de cada NPC/monstro já carregado do cliente. Registre um ator no `world.addActor` usando ID único, posição, `kind` e `species`. NÃO recrie os NPCs visuais: associe seus meshes existentes a `actor.id`. Importe `WorldAI` por ES modules no projeto ou copie a biblioteca para uma pasta acessível ao bundler.

### 2 — Tique da simulação

Chame `world.step(deltaSeconds)` **uma única vez por frame** no loop principal; em seguida faça o movimento dos objetos 3D para as posições dos atores. Não consulte um modelo de IA a cada frame. Converta (x,y) da lógica 2D em (x,z) do Three.js e obtenha a altura real (eixo y) do terreno usando a função de terreno já existente.

### 3 — Navegação do Garner

Substitua o `findPath` simples em grade pela navegação/colisão que o cliente do jogo já usa. O mapa atual de demonstração contém obstáculos inventados; **não representa Garner**. Considere bloqueios, navmesh, altura, portais e limites de mapas históricos.

### 4 — Ações e animações

Associe os eventos `decision` com a máquina de estados/animações que já existe no cliente (idle, walk, run, alert, etc.). O `WorldAI` atualmente define apenas alvos e deslocamento lógico. Preserve os códigos históricos de animação em um adaptador separado; não renomeie assets.

### 5 — Regras históricas, quests e combate

O Tales of Pirates deve continuar sendo a autoridade para dano, missões, inventário, movimentação válida e drops. O WorldAI só sugere objetivos e diálogos. Nunca permita que texto de LLM aplique recompensas, ataque real ou dê itens diretamente.

### 6 — Diálogos com LFM e experimentos com modelos em MB

O `world.talk` funciona offline e pode receber `createOllamaDialogueProvider`. `setDecisionProvider` já aceita outros providers que retornem `{ action: 'nome' }`. Para um modelo pequeno como Needle, implemente outro provider que retorne somente uma ação da lista `snapshot.candidates`. Primeiro compare resultados e latência em hardware real; não assuma que um modelo mínimo será melhor que Utility AI.

## Exemplo de ponte

Veja `examples/threejs-integration.js`, que contém as funções `connectWorldAI`, `update` e `dispose`. Trata-se de **um exemplo de API**, não de um patch para o seu projeto atual.

## Próxima etapa para integração real

Será necessário o código atual que controla o spawn de NPCs/monstros, o loop de atualização, o terreno e as animações. Assim será possível escrever um adaptador específico para o cliente e preservar o comportamento original sem quebrar missões e efeitos.

# WorldAI v0.1 — Motor de inteligência para mundos vivos

**Um protótipo executável, independente de Three.js, para NPCs e monstros autônomos.** JavaScript ES Modules, zero bibliotecas obrigatórias, sem modelos de IA externos para funcionar.

## Começar em 2 comandos

Requisitos: **Node.js 20 ou mais recente**. Na pasta `WorldAI`:

```bash
npm run demo
```

Acesse **http://127.0.0.1:4173/** no navegador.

Para executar os testes:

```bash
npm test
```

Não é necessário instalar pacotes do npm (`npm install` não é obrigatório).

## O que funciona

- 10 personagens de demonstração: **4 NPCs, 3 lobos, 2 cervídeos e 1 javali**.
- Decisões contextuais por **Utility AI**: explorar, procurar alimentos, fugir, perseguir, descansar, socializar, trabalhar, patrulhar, investigar e voltar ao lar.
- Necessidades individuais: fome, cansaço, socialização; personalidade: agressividade, coragem, curiosidade e sociabilidade.
- Memória individual limitada, relações com jogador e outras criaturas e eventos de mundo.
- Rotina aproximada de dia/noite; ciclo de tempo acelerado.
- Navegação A* com grade, estruturas bloqueadas e rotas visíveis no mapa.
- Lógica do mundo desacoplada do Canvas de demonstração e de qualquer motor gráfico.
- Save/load em JSON, eventos, contagem de decisões, simulação pausável e velocidade ajustável.
- Diálogo offline por regras simples **ou diálogo gerado com um modelo Ollama**.
- Adapter opcional de decisões por Ollama: **somente ações previamente permitidas**, nunca executa comandos da IA.
- Limites de chamadas ao modelo e fallback automático às regras quando Ollama não está disponível.

**Nota:** os comportamentos já são funcionais, mas o diálogo sem LLM é básico. O pacote não inclui modelo Needle, LFM ou pesos treinados. A integração com LFM/Ollama é opcional; modelos de poucas centenas de MB podem gerar escolhas e textos inconsistentes.

## Como ativar Ollama (opcional)

O servidor local de demonstração encaminha os pedidos HTTP do navegador ao Ollama em `http://127.0.0.1:11435` (a porta que você já usava). Se o Ollama estiver na porta padrão:

```bash
OLLAMA_URL=http://127.0.0.1:11434 npm run demo
```

Se estiver usando `11435`, basta `npm run demo`.

Instale um modelo compatível com o seu Ollama (por exemplo, `lfm3`) e marque **Modelo local** na interface; informe a tag instalada no campo Modelo. As decisões do modelo não são solicitadas a cada frame e as inferências podem ser lentas na CPU. O mesmo modelo também pode ser utilizado no diálogo com personagens.

Não exponha o servidor de demonstração publicamente; ele está limitado a `127.0.0.1` e foi concebido para desenvolvimento local.

## Arquitetura

```text
src/
  core/WorldAI.js         estado do mundo, simulação, memória, ações, eventos
  core/behavior.js        geração e pontuação de comportamentos
  core/pathfinding.js     A* e obstáculos
  adapters/ollama.js      providers para decisões e diálogos
  presets/createDemoWorld.js  cenário com 10 agentes
  utils/                   RNG determinístico e utilitários
  index.js                 API pública
demo/                       interface HTML/CSS/Canvas (nenhuma dependência)
scripts/dev-server.mjs       servidor Node HTTP + proxy Ollama localhost
tests/                      testes automatizados
examples/                   contrato simples de integração com Three.js
```

## API mínima

```js
import { WorldAI } from './src/index.js';
const world=new WorldAI({width:2000,height:2000,seed:123});
world.addActor({id:'npc_001',name:'Marcus',kind:'npc',species:'human',role:'smith',position:{x:200,y:200}});
world.addActor({id:'wolf_001',name:'Lobo',kind:'monster',species:'wolf',position:{x:800,y:750}});
const unsubscribe=world.on('decision',({actorId,action})=>console.log(actorId,action));
// Chamar no update do jogo: deltaTime em SEGUNDOS.
world.step(1/60);
const save=world.serialize();
const loaded=WorldAI.fromJSON(save);
unsubscribe();
```

Falar com um NPC:

```js
const response=await world.talk('npc_001','Qual é o seu nome?');
console.log(response);
```

Ligar decisão por LLM:

```js
import { createOllamaDecisionProvider } from './src/adapters/ollama.js';
world.setDecisionProvider(createOllamaDecisionProvider({endpoint:'/api/ollama',model:'lfm3'}),{interval:15,maxConcurrent:1});
// Sem provider (desliga LLM): world.setDecisionProvider(null);
```

Integração inicial com Three.js: veja [examples/threejs-integration.js](examples/threejs-integration.js) e [INTEGRACAO_TALES_OF_PIRATES.md](INTEGRACAO_TALES_OF_PIRATES.md).

## Limites desta primeira versão

- Mundo 2D lógico (x,y), **não** um mapa `.map` do Tales of Pirates. Para o Three.js a posição Y lógica vira Z visual.
- A* trabalha com retângulos simples, não com uma malha de navegação completa do jogo.
- Movimento simples sem direção da animação, física, sistema de missões ou combate real do Tales of Pirates.
- A caça é uma **interação abstrata**: o cervo foge, sem dano de batalha implementado.
- A IA pequena pode falhar, demorar e produzir respostas não conformes; decisão tradicional permanece como fallback.
- Save/load cobre o estado do motor, não o estado do cenário visual da demonstração nem os resultados de tarefas de IA ainda em andamento.
- Pensado para dezenas ou centenas de atores; escalar para milhares exigirá indexação espacial e LOD mais avançados.

## Segurança e distribuição

O servidor HTTP local não recebe comandos arbitrários, restringe-se a arquivos estáticos e encaminha unicamente `/api/chat` ao Ollama local. O output da IA externa é filtrado por uma lista de ações atuais válidas. A biblioteca **não dá acesso a terminal, arquivos, rede ou execução de código a um modelo**.

Para distribuir o jogo a outras pessoas, será necessário decidir se a inferência será feita no servidor do jogo ou no navegador (WebGPU/WASM). O proxy Node incluído é apenas para testes locais.

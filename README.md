# WorldAI — Living Stories v0.6 (memória social e revisão automática)

Laboratório de NPCs para futura integração com **Tales of Pirates / Three.js**. Inclui vila 2D, **cinco habitantes com conversas**, cinco criaturas com decisões por regras, relações, memória e salvamento. O chat agora usa o **Ollama + LFM3 ou Qwen3.5**, executado no **seu próprio computador**. Não é necessário baixar modelos no navegador, nem configurar CORS.

## 🧠 Memória social, revisão de respostas e personalidade dinâmica (v0.6)

No painel de conversa há uma nova seção **“O que [NPC] pensa de você”**. Ela apresenta **interpretações narrativas fictícias** produzidas pelo Ollama, não pensamentos ocultos reais nem fatos sobre a pessoa que joga. Por personagem:

- **Opinião atual** e impressão mais recente sobre o visitante.
- **Confiança**, **abertura** e **paciência** em uma escala de 0 a 100.
- **Familiaridade** (quantas conversas já tiveram) e histórico das quatro interpretações mais recentes.
- **Limpar opinião deste NPC**, sem apagar o histórico do chat. Os estados sociais são separados e persistidos em `localStorage`.

O motor envia a opinião e os traços atuais como parte do contexto nos próximos turnos. O NPC pode responder de forma mais cautelosa ou aberta; a abertura também influencia discretamente sua escolha entre observar e socializar durante o passeio. A profissão, permissões de comércio, inventário e economia continuam sob controle do motor.

Em **Ollama local**, há três opções independentes para experimentos:

1. **Avaliar respostas após enviá-las**: depois que o NPC fala, uma chamada JSON separada tenta avaliar relevância, fidelidade à personagem e repetição. O resultado mostra nota estimada (0–5) e motivo. Não é uma medida objetiva do que o jogador realmente queria.
2. **Corrigir resposta inadequada**: se a avaliação marcar problema, há **no máximo uma nova geração**. O texto exibido é atualizado, marcado visualmente, e a mensagem correspondente na memória de conversa também é corrigida.
3. **Atualizar opinião e personalidade**: uma chamada separada pede um resumo narrativo da interação, com opinião, impressão e ajustes de confiança (máximo ±3), abertura e paciência (máximo ±2). Conversas neutras normalmente não devem aumentar a confiança.

As análises **rodam em uma fila assíncrona no navegador, enquanto a aba estiver aberta**: não travam o envio da próxima mensagem e limitam quantas conversas ficam aguardando para evitar saturar o processador. Se o avaliador falhar, o diálogo permanece, e a reflexão pode continuar independentemente. **Ações de comércio e guia não são reescritas nem reavaliadas**: a confirmação dessas ações vem somente do motor.

**Custo e limitações:** com as três opções ativadas, cada diálogo com Ollama pode fazer até **três requisições** (gerar, avaliar e refletir), ou **quatro quando há revisão**. Modelos pequenos podem avaliar erroneamente a qualidade ou inventar interpretações; use os controles para comparar o resultado com e sem revisão. Não é treinamento dos pesos e não envolve cadeia interna de raciocínio do modelo. Nada roda depois que o navegador fecha. O GitHub Pages continua em modo roteiro, sem Ollama.

Arquivos: `src/social.js` (memória social persistente), `src/dialogue-lab.js` (juiz/revisão/reflexão), `src/cognition-ui.js` (painel, fila e opções), além dos testes em `tests/dialogue-lab.test.mjs`.

## 🧑‍🌾 Editor de NPCs e decisões (v0.5)

A demonstração agora inclui **✦ Editar NPCs**, antes do comparador, com um editor totalmente local. Você pode:

- Criar até 80 personagens no mundo 2D ou editar os habitantes existentes, com **nome, título, profissão, espécie, personalidade, história/conhecimento e ícone**.
- Escolher exatamente quais ações são permitidas: **guiar**, **vender ao jogador**, **comprar do jogador** e **dar itens do próprio estoque**.
- Editar as **moedas e o estoque** de cada NPC para os seis itens de exemplo; conferir as moedas e o inventário do jogador.
- Executar ações com botões ou pedir pelo chat: **“Me leve até a ponte”**, **“Me venda uma poção”**, **“Quero vender ferro”** e **“Me dê uma erva”**.
- Consultar o estado e as decisões do NPC, acompanhar visualmente a rota guiada e exportar **`worldai-npcs.json`**.
- Manter perfis, customizações e a bolsa do jogador entre sessões pelo `localStorage`.

### Como a decisão funciona

O WorldAI identifica comandos explícitos de ações. Se o local ou item estiver ambíguo, ele pode perguntar ao modelo **Ollama selecionado** por uma proposta JSON dentre ações e destinos conhecidos. Se o modelo não estiver disponível ou gerar uma resposta inválida, permanecem as regras conservadoras do jogo. As **decisões só são executadas pelo motor RPG**, que verifica permissões do NPC, distância, local conhecido, item existente, quantidades, moedas, itens possuídos e estoque finito. O modelo não cria itens ou modifica diretamente o dinheiro. Para ações conhecidas e claras, as regras locais podem dispensar uma chamada ao LLM e responder imediatamente.

**Esta versão é um sandbox, não o sistema definitivo de missões/comércio do Tales of Pirates.** O guia segue uma linha reta dentro do mapa 2D de demonstração, sem desviar de edifícios. Para integrar ao Three.js, conectaremos o comando de guia ao sistema de pathfinding, e todas as ações econômicas deverão ser validadas pela lógica real de inventário e comércio do jogo (ou pelo servidor em ambiente multiplayer).

O modelo padrão sugerido na interface passou a ser `lfm3:latest`, mas você pode escolher `qwen3.5:0.8b` ou outro instalado. O comparador continua separado e inalterado.

## ⚖ Comparador Qwen vs. LFM3 (v0.4)

Agora o WorldAI tem um **comparador de modelos na mesma página do jogo**. Ele usa o Ollama local, sem Transformers.js.

```bash
ollama pull qwen3.5:0.8b
ollama pull lfm3:latest
git pull
npm install
npm run dev
```

Abra `http://127.0.0.1:5173/` e clique em **⚖ Comparar IA**, no topo. Em seguida:

1. **Atualizar modelos** consulta `/api/tags` e lista apenas modelos instalados. Selecione A = `qwen3.5:0.8b` e B = `lfm3:latest`, ou quaisquer dois modelos distintos.
2. Escolha **um NPC** e digite a pergunta, ou use uma das quatro sugestões.
3. Clique **Comparar respostas**. O WorldAI congela uma cópia do contexto do personagem e envia a mesma pergunta e os mesmos parâmetros de geração a cada modelo **sequencialmente**, para não disputarem a CPU.
4. As respostas aparecem lado a lado, junto com tempo no navegador, tempo do servidor Ollama, tempo de carregamento, tokens gerados, velocidade em tokens/s e tokens de entrada.
5. Marque manualmente a resposta preferida. Os últimos 20 testes desta sessão podem ser **exportados em JSON** para análise posterior.

O comparador **não altera as memórias nem as relações dos NPCs** e não usa respostas de roteiro quando um modelo falha. Se um modelo repetir a pergunta, você verá a resposta real marcada como **REPETIU A PERGUNTA**, sem tentativas automáticas. Se o outro falhar, a primeira resposta continua disponível. O botão **Cancelar teste** interrompe as consultas pendentes. Não existe pontuação automática de qualidade; cabe a você avaliar.

**Interpretação:** o tempo no navegador inclui espera, inferência e eventual carregamento. Tokens/s utiliza `eval_count / eval_duration` retornados pelo Ollama (não é uma medição independente). A primeira consulta a um modelo pode ser mais lenta pela carga em memória; repita testes e compare as métricas por separado. Comparar modelos com contagens de parâmetros muito diferentes não é uma comparação de eficiência por parâmetro. O contexto é o mesmo **dentro de cada teste**, mas os NPCs continuam tendo memória evolutiva no chat principal.

O comparador funciona somente com `npm run dev` no computador com Ollama; **GitHub Pages é demonstração offline**, pois não tem o proxy Vite. O histórico de comparações fica em memória da página até você sair; exporte antes de fechar. O arquivo JSON contém as perguntas, as respostas e o contexto dos NPCs.

## Testar localmente — Linux

Pré-requisitos: Node.js >=20, Ollama em execução em `127.0.0.1:11434` e um modelo de chat instalado, como `lfm3:latest` ou `qwen3.5:0.8b`.

```bash
# Verificar instalação local
ollama list
curl http://127.0.0.1:11434/api/tags

# Se ainda não possuir o modelo:
ollama pull qwen3.5:0.8b

# Primeira vez:
git clone https://github.com/faireye-hive/WorldAI.git
cd WorldAI
npm install
npm run dev
```

Abra **http://127.0.0.1:5173/**. Na interface, clique **Conectar ao Ollama** e escolha um habitante para conversar. O modelo começa a ser carregado na memória pelo Ollama quando receber a primeira mensagem.

Se o projeto já estiver clonado, basta executar `git pull`, `npm install` e `npm run dev`. Para mudar o modelo, edite o campo **Modelo instalado**, por exemplo `qwen3.5:0.8b`.

O projeto usa um **proxy apenas no servidor Vite local**: o navegador envia a solicitação para `/api/ollama/chat` na mesma origem e o Vite encaminha ao endpoint `http://127.0.0.1:11434/api/chat`. Assim não é necessário habilitar CORS no Ollama, usar extensões, desativar segurança do navegador ou expor a API na rede.

Caso sua instalação do Ollama use outra porta, configure a variável de ambiente antes de iniciar o Vite:

```bash
WORLDAI_OLLAMA_URL=http://127.0.0.1:11435 npm run dev
```

O painel verifica `/api/tags` para confirmar que o modelo está instalado. Se houver erro, o jogo mantém os diálogos offline e mostra uma mensagem.

## Hospedagem

O **GitHub Pages** continua publicando a **demonstração com diálogos de roteiro** em https://faireye-hive.github.io/WorldAI/. A conexão com Ollama é disponibilizada somente na versão local iniciada pelo Vite, porque Pages é um site estático e não tem proxy capaz de acessar seu processo local.

**Não há download de ONNX / Transformers.js:** os pesos não são publicados nem obtidos pelo navegador. O código de inferência antigo ficou preservado no histórico Git.

## Arquitetura

| Arquivo | Função |
| --- | --- |
| `src/world.js` | Estados de NPCs, animais, rotina, relações, memória, decisões e persistência |
| `src/app.js` | Interface, renderização Canvas 2D e conversa |
| `src/ollama.js` | Conexão `/api/chat`, validação do modelo, contexto e tratamento de falhas |
| `src/dialogue.js` | Personalidade, histórico e bloqueio de respostas que repetem a fala do jogador |
| `src/comparison-core.js` | Benchmark sequencial, métricas do Ollama e comparação sem respostas inventadas |
| `src/comparator.js` | Interface lado a lado, seleção de modelos, avaliações e exportação JSON |
| `src/rpg.js` | Catálogo fixo de itens e lugares, NPCs customizáveis, validação de estoque, comércio e navegação guiada |
| `src/npc-editor.js` | Interface para criar/editar NPCs, conceder permissões e exportar JSON |
| `src/npc-actions.js` | Identificação de intenção e proposta JSON do Ollama para ações ambíguas |
| `vite.config.js` | Proxy local para o Ollama — somente em desenvolvimento |
| `tests/` | Testes automatizados do mundo, dos diálogos e do conector Ollama |

Cada NPC mantém sua personalidade, histórico e memória. **O mesmo modelo atende a todos os NPCs.** Conversar com uma criatura gera texto, mas as decisões de navegação e rotina são independentes do LLM nesta etapa. Ações do mundo (economia, inventário, missões) não são modificadas pelo texto gerado.

O motor original de WorldAI com navegação A*, adaptador antigo e integrações está preservado em [`legacy-v0.1/`](./legacy-v0.1/). A demo atual usa um núcleo simplificado; a fusão com o motor original e Tales of Pirates fica para uma etapa futura.

## Verificações

```bash
npm test
npm run build
```

Os testes do conector usam respostas simuladas da API. **Não substituem um teste real do Qwen rodando na máquina do usuário.**

## Privacidade e execução

As mensagens para IA são encaminhadas apenas ao servidor **Ollama local** configurado no Vite; não são enviadas a serviços hospedados de inferência. O histórico curto é salvo em `localStorage` na origem do jogo. O Vite usa `127.0.0.1` por padrão para não expor o servidor a dispositivos da rede.

O Qwen3.5:0.8B pode produzir textos incoerentes, especialmente em conversas complexas. O cliente desativa o modo thinking quando suportado, limita o tamanho de cada resposta e descarta ecos detectados, mas não consegue garantir qualidade.

Licença: MIT.

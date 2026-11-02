# WorldAI — Living Stories v0.4 (Ollama local + comparador)

Laboratório de NPCs para futura integração com **Tales of Pirates / Three.js**. Inclui vila 2D, **cinco habitantes com conversas**, cinco criaturas com decisões por regras, relações, memória e salvamento. O chat agora usa o **Ollama + Qwen3.5:0.8B**, executado no **seu próprio computador**. Não é necessário baixar modelos no navegador, nem configurar CORS.

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

Pré-requisitos: Node.js >=20, Ollama em execução em `127.0.0.1:11434` e o modelo `qwen3.5:0.8b` instalado.

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

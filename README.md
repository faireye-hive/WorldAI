# WorldAI — Living Stories v0.3 (Ollama local)

Laboratório de NPCs para futura integração com **Tales of Pirates / Three.js**. Inclui vila 2D, **cinco habitantes com conversas**, cinco criaturas com decisões por regras, relações, memória e salvamento. O chat agora usa o **Ollama + Qwen3.5:0.8B**, executado no **seu próprio computador**. Não é necessário baixar modelos no navegador, nem configurar CORS.

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

**Não há mais download de ONNX / Transformers.js:** os pesos não são publicados nem obtidos pelo navegador. O arquivo `src/inference.worker.js` ficou no histórico Git da demonstração anterior, mas não é utilizado nesta versão.

## Arquitetura

| Arquivo | Função |
| --- | --- |
| `src/world.js` | Estados de NPCs, animais, rotina, relações, memória, decisões e persistência |
| `src/app.js` | Interface, renderização Canvas 2D e conversa |
| `src/ollama.js` | Conexão `/api/chat`, validação do modelo, contexto e tratamento de falhas |
| `src/dialogue.js` | Personalidade, histórico e bloqueio de respostas que repetem a fala do jogador |
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

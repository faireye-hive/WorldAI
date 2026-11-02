# WorldAI — Living Stories (v0.2)

Protótipo de RPG 2D com **cinco habitantes conversáveis**, **cinco criaturas autônomas**, memória por personagem e **IA real no navegador via Transformers.js** (opcional). Criado como laboratório para futura integração com Tales of Pirates / Three.js.

## Executar

```bash
npm install
npm run dev
```

Acesse o endereço indicado pelo Vite (normalmente `http://127.0.0.1:5173`). Para testar lógica sem baixar dependências: `node --test tests/*.test.mjs`.

## Diálogos com IA local

Por padrão, as falas são de um **roteiro offline** — não são geradas por modelo. Para experimentar IA de verdade:

1. Abra o jogo no navegador e selecione um habitante.
2. Escolha **CPU / WebAssembly (q8)** ou **GPU / WebGPU (q4f16)**.
3. Clique em **Carregar IA no navegador**. O primeiro carregamento baixa os arquivos ONNX pela internet.
4. O modelo [`onnx-community/SmolLM2-135M-Instruct-ONNX-GQA`](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-GQA) roda **dentro de um Web Worker**, sem servidor de inferência e sem Ollama.
5. Converse normalmente. Se a geração falhar, o sistema informa e usa o diálogo de roteiro.

A versão de 135 milhões de parâmetros é pequena. Em português pode cometer erros, repetir frases ou ignorar instruções. Os prompts são curtos e as respostas são limitadas. Não trate respostas geradas como fatos do mundo do jogo. Este é um teste de conversação, não uma IA treinada para Tales of Pirates.

**Privacidade:** o texto é processado no navegador; bibliotecas e modelo são baixados de fornecedores externos no primeiro carregamento. O jogo não contém uma API para enviar mensagens a um servidor nosso. Os dados de personagem são guardados em `localStorage`; use o botão de reiniciar para eliminá-los.

## Arquitetura

| Arquivo | Finalidade |
| --- | --- |
| `src/world.js` | Entidades, atributos, necessidades, decisões simples, relógio, conversas, memória e persistência; **sem DOM nem IA** |
| `src/app.js` | Renderização Canvas 2D, interface, seleção de personagens e fila de solicitações de IA |
| `src/inference.worker.js` | Transformers.js, carregamento ONNX, WebGPU/WebAssembly e geração em segundo thread |
| `src/style.css` | Estilo de visual novel e UI responsiva |
| `tests/world.test.mjs` | Testes de lógica independentes de navegador |

A **mesma instância de modelo** atende a todos os NPCs; cada um possui histórico e memórias separados. A movimentação e as decisões simples são feitas em JavaScript sem consultar LLM a cada frame. Criaturas atualmente escolhem comportamentos por regras, não por IA generativa.

### Adaptar ao Tales of Pirates

Importe `WorldAIEngine` e mantenha os objetos 3D vinculados aos IDs dos atores. Chame `world.tick(deltaSeconds)` no laço de atualização do Three.js, atualize `mesh.position` pelos valores `actor.x/y` e encaminhe os eventos/interações para a UI. Na integração real, crie um mapeamento de posições 2D do protótipo para coordenadas do mapa, substitua a navegação de demonstração pelo pathfinding do jogo e não permita que diálogos alterem missões, inventário ou economia sem validação do motor.

## Publicação no GitHub Pages

O projeto inclui `.github/workflows/pages.yml`. No GitHub, abra **Settings → Pages → Build and deployment** e selecione **GitHub Actions** (se ainda não estiver). Um push na branch `main` executa o build do Vite usando base `/WorldAI/`. URL esperada, após deploy bem-sucedido: `https://faireye-hive.github.io/WorldAI/`.

**Aviso:** não armazenamos os arquivos do modelo (mais de 100 MB) no repositório. O download é sob demanda do Hugging Face. O desempenho depende do hardware e do navegador. WebGPU requer navegador compatível e ambiente seguro (HTTPS ou localhost).

## Testes

```bash
npm test
npm run build
```

MIT.
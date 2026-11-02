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

**Modelo no Pages + cache do navegador:** no deploy, o GitHub Actions baixa automaticamente os arquivos ONNX Q8 (CPU) e Q4F16 (WebGPU) do Hugging Face para `dist/models/v1/` e os inclui no site estático. **Os pesos não são commitados no Git**, pois excedem 100 MB cada. O navegador baixa a variante escolhida do próprio GitHub Pages na primeira utilização e o Transformers.js utiliza Cache Storage nos acessos seguintes, se o navegador permitir e não eliminar o cache. A opção de CPU e a de WebGPU possuem pesos diferentes e podem exigir downloads separados. O modelo ainda precisa ser carregado na RAM a cada abertura.

No modo de desenvolvimento (`npm run dev`), o modelo continua sendo carregado do Hugging Face e também pode ser armazenado em cache, separadamente da versão publicada. O download/espelhamento para o Pages ocorre somente na execução do workflow. Quem quiser testar os arquivos localmente pode usar `bash scripts/fetch-browser-model.sh public/models/v1`, mas evite adicionar pesos ao histórico do Git. O desempenho depende do dispositivo. WebGPU exige navegador compatível e HTTPS/localhost.

## Testes

```bash
npm test
npm run build
```

MIT.
## Motor anterior preservado

O motor original **WorldAI v0.1** foi preservado em [`legacy-v0.1/`](./legacy-v0.1/), incluindo navegação A*, eventos, memória, persistência, adaptador Ollama, testes e a demonstração anterior. O experimento **Living Stories v0.2** usa o núcleo simplificado em `src/world.js`; os dois ainda não foram fundidos. A integração com Tales of Pirates é uma etapa futura.


## Futuro: fine-tuning para NPCs

O SmolLM2-135M-Instruct é um ponto de partida experimental, mas foi treinado principalmente para inglês. Para aprimorar português e diálogos de RPG, o caminho é montar um conjunto de exemplos em JSONL, separar treino/validação, ajustar os pesos com PyTorch e Hugging Face Transformers/TRL e, se necessário, LoRA/PEFT. **Não se treina diretamente o arquivo ONNX quantizado**. Depois do treinamento, exportar e quantizar para ONNX, testar CPU/WebGPU e substituir os arquivos publicados. Os resultados precisam ser avaliados no jogo; mesmo ajustado, um modelo 135M pode ser inconsistente. Evite usar diálogos gerados para mudar o estado econômico ou persistente do jogo sem validação.

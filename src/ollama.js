import { buildNPCMessages, extractNPCReply } from './dialogue.js';

export const DEFAULT_MODEL = 'qwen3.5:0.8b';
const ROOT = '/api/ollama';
const TEXT_LIMIT = 450;

function endpoint(path) { return ROOT + path; }

export async function checkOllama({ fetchImpl = fetch, model = DEFAULT_MODEL } = {}) {
  let response;
  try {
    response = await fetchImpl(endpoint('/tags'), { cache: 'no-store' });
  } catch {
    throw new Error('Ollama inacessível em 127.0.0.1:11434. Verifique se ele está em execução e use npm run dev.');
  }
  if (!response.ok) throw new Error('Não foi possível consultar o Ollama (HTTP ' + response.status + ').');
  const data = await response.json();
  const available = (data.models || []).map(x => x.name || x.model).filter(Boolean);
  const found = available.includes(model) || available.some(x => x.split(':')[0] === model && !model.includes(':'));
  if (!found) {
    throw new Error('Modelo ' + model + ' não encontrado. Execute no terminal: ollama pull ' + model);
  }
  return { model, available };
}

export function makeOllamaRequest(context, model = DEFAULT_MODEL, retry = false) {
  const messages = buildNPCMessages(context, retry);
  return {
    model,
    messages,
    stream: false,
    think: false,
    keep_alive: '10m',
    options: {
      temperature: retry ? 0.8 : 0.65,
      num_predict: 120,
      num_ctx: 2048,
      repeat_penalty: retry ? 1.18 : 1.1
    }
  };
}

export async function askOllama(context, { fetchImpl = fetch, model = DEFAULT_MODEL, timeoutMs = 90000 } = {}) {
  const question = String(context?.question || '').trim();
  if (!question) throw new Error('Pergunta vazia.');
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint('/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(makeOllamaRequest(context, model, attempt > 0))
      });
      if (!response.ok) {
        const raw = await response.text();
        throw new Error('Ollama HTTP ' + response.status + ': ' + raw.slice(0, 160));
      }
      const data = await response.json();
      const content = data?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('O modelo não retornou texto. Verifique a configuração de thinking.');
      }
      const reply = extractNPCReply([{ generated_text: content }], question);
      return reply.slice(0, TEXT_LIMIT);
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') throw new Error('Ollama demorou demais para responder.');
      if (err instanceof TypeError) {
        throw new Error('Erro de conexão com Ollama. Confirme a porta 11434 e o proxy local do Vite.');
      }
      // Retry only if the model generated unusable text; server errors won't improve.
      if (!/(repetiu|inválida|não gerou)/i.test(String(err.message))) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Sem resposta do Ollama.');
}

import { makeOllamaRequest } from './ollama.js';
import { extractNPCReply, isEcho } from './dialogue.js';

const API = '/api/ollama';
const nsToMs = value => Number.isFinite(value) && value >= 0 ? value / 1e6 : null;
const finite = value => Number.isFinite(value) && value >= 0 ? value : null;

export const EXAMPLE_QUESTIONS = [
  'Qual é seu nome e o que faz nesta vila?',
  'Você conhece alguma história sobre a floresta?',
  'Vi um lobo perto da entrada da vila. O que você faria?',
  'Preciso de ajuda para encontrar um lugar seguro.'
];

export function getMetrics(result, elapsedMs) {
  const generatedTokens = finite(result.eval_count);
  const durationMs = nsToMs(result.eval_duration);
  return {
    elapsedMs: Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : null,
    serverTotalMs: nsToMs(result.total_duration),
    loadMs: nsToMs(result.load_duration),
    promptTokens: finite(result.prompt_eval_count),
    generatedTokens,
    generationMs: durationMs,
    tokensPerSecond: generatedTokens !== null && durationMs > 0
      ? Math.round(generatedTokens * 1000 / durationMs * 10) / 10 : null
  };
}

export async function installedModels({ fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(API + '/tags', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Falha na consulta de modelos: HTTP ' + response.status);
  const data = await response.json();
  return [...new Set((data.models || []).map(m => m.name || m.model)
    .filter(name => typeof name === 'string' && name.trim()))].sort();
}

export async function testModel(context, model, {
  fetchImpl = fetch, signal, timeoutMs = 120000, now = () => performance.now()
} = {}) {
  if (!String(context?.question || '').trim()) throw new Error('Digite uma pergunta.');
  if (!String(model || '').trim()) throw new Error('Escolha um modelo.');

  const started = now();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', cancel, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeOllamaRequest(context, model)),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error('Ollama HTTP ' + response.status + ': ' + text.slice(0, 160));
    }
    const data = await response.json();
    const raw = data?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new Error('O modelo não devolveu texto (possível incompatibilidade com think:false).');
    }
    let answer = raw.trim().slice(0, 1000);
    let echoed = isEcho(answer, context.question);
    try {
      answer = extractNPCReply([{generated_text:raw}], context.question);
      echoed = false;
    } catch (error) {
      // Unlike the chat view, benchmark mode does not hide a failed model
      // behind scripted responses or retries. Show the real raw output.
      if (!echoed && !/repetiu|não gerou/i.test(String(error.message))) {
        throw error;
      }
      echoed = true;
    }
    return {
      model, status: 'ok', answer, echoed, metrics: getMetrics(data, now() - started)
    };
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Comparação cancelada.', 'AbortError');
    return {
      model, status: 'error',
      error: controller.signal.aborted ? 'Tempo limite excedido.' : String(err.message || err),
      metrics: { elapsedMs: Math.round(now() - started) }
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

/** The same context snapshot and identical inference options are used for both runs.
 * Deliberately sequential so two small CPU models don't compete for resources.
 */
export async function compareModels(context, left, right, {
  onUpdate = () => {}, signal, fetchImpl = fetch, now, timeoutMs
} = {}) {
  if (!left || !right || left === right) throw new Error('Escolha dois modelos diferentes.');
  const options = { signal, fetchImpl, now, timeoutMs };
  const results = [];
  for (const model of [left, right]) {
    if (signal?.aborted) throw new DOMException('Comparação cancelada.', 'AbortError');
    onUpdate({phase: 'running', model, results: [...results]});
    results.push(await testModel(context, model, options));
    onUpdate({phase: 'result', model, results: [...results]});
  }
  return results;
}

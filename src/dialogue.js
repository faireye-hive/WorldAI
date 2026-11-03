/**
 * WorldAI dialogue guard. Pure JS, independent of DOM, inference engine and Three.js.
 * Small LLMs sometimes return a user turn instead of a new NPC answer.
 */
const short = (value, limit) => String(value ?? "").trim().slice(0, limit);

const jobs = {
  smith: "ferreiro", merchant: "comerciante", herbalist: "herborista",
  guard: "guarda", innkeeper: "estalajadeira"
};

export function normalizedSpeech(value) {
  return short(value, 2000)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isEcho(reply, question) {
  const answer = normalizedSpeech(reply);
  const asked = normalizedSpeech(question);
  if (!answer || answer.length < 3) return true;
  if (!asked) return false;
  if (answer === asked) return true;
  // Detect the prompt printed back with little or no actual response.
  if (asked.length >= 10 && answer.startsWith(asked)) return true;
  if (asked.length >= 16 && answer.includes(asked) && answer.length <= asked.length * 2 + 12) return true;
  return false;
}

export function buildNPCMessages(data, retry = false) {
  const name = short(data.name, 40) || "Morador";
  const job = jobs[data.role] || short(data.role, 40) || "morador";
  const personality = short(data.biography, 120) || "gentil";
  const time = short(data.hour, 10);
  const memories = (Array.isArray(data.memories) ? data.memories : [])
    .filter(item => item && item.type !== "conversation")
    .slice(-2).map(item => short(item.data, 90));
  const stock=Array.isArray(data.inventory)?data.inventory:[];
  const vendors=Array.isArray(data.vendors)?data.vendors:[];
  const knownCatalog=Array.isArray(data.catalog)?data.catalog:[];
  const species=data.species||'human';
  const system = [
    "You are " + name + ", a " + job + " in Vila Aurora, a fantasy village.",
    "Your personality: " + personality + ".",
    "Species: " + species + ". You must stay consistent with your identity and profession.",
    "The PLAYER is a different character from you. Never confuse the player with " + name + ".",
    "Answer as this character in natural Brazilian Portuguese, using one or two short sentences.",
    "Respond to what the player said; do not repeat or quote their question.",
    "Never invent items, rewards, money, completed quests or changes to game state.",
    "Keep continuity with the player's previous messages. Answer the CURRENT request first.",
    "If asked for an unavailable product, say it is NOT in stock; do not imply any shop has it.",
    "Do not claim that you have already helped, delivered, crafted, escorted or prepared something unless confirmed in the game.",
    "Do not put prices in Brazilian reais: use game moedas only.",
    "A character's promises or guesses do not create world facts.",
    "Time: " + time + ".",
    data.social ? "NPC simulated opinion of visitor: " + short(data.social.opinion,140) +
      ". Emotional stance: " + short(data.social.feeling,20) +
      ". Trust: " + data.social.trust + "/100. Openness: " + data.social.openness +
      "/100. Patience: " + data.social.patience +
      "/100. Respond with more caution if distrustful, warmth if friendly, " +
      "but do not invent past events or claim real feelings." : "",
    "Character background: " + short(data.description, 260) + ".",
    "World facts: Vila Aurora contains " + (Array.isArray(data.knownPlaces) ? data.knownPlaces.map(p=>p.name).slice(0,8).join(", ") : "a small village") + ".",
    "Allowed interactions: " + (Array.isArray(data.allowedActions) ? data.allowedActions.join(", ") : "none") + ".",
    "YOUR CURRENT STOCK: " + (stock.length ? stock.map(i=>i.name+" x"+i.stock+" ("+i.price+" moedas)").join(", ") : "nothing available") + ".",
    "Existing item catalog: " + (knownCatalog.length?knownCatalog.map(i=>i.name).join(", "):"use only real items in your own inventory") + ".",
    "Shop directory: " + (vendors.length?vendors.map(v=>v.name+" ("+v.role+"): "+v.items.join(", ")).join("; ").slice(0,360):"unknown") + ".",
    "WEAPONS AND ARMOR: not present in the current catalog, do not claim they are available anywhere.",
    "Only the game engine can move, trade, give items or change money; never claim an action completed unless confirmed.",
    memories.length ? "Known events: " + memories.join("; ") + "." : "",
    retry ? "IMPORTANT: Do not echo the player. Add a relevant new fact from your profession or the village." : ""
  ].filter(Boolean).join(" ");

  const turns = [{ role: "system", content: system }];
  // Preserve the last three valid exchanges in chronological order; a
  // single exchange loses antecedents such as "uma armadura" -> "uma".
  // Reject echoed assistant messages so they don't contaminate the prompt.
  const history = Array.isArray(data.history) ? data.history.slice(-10) : [];
  const pairs=[];
  for (let i = 0; i < history.length - 1; i++) {
    const user = history[i], assistant = history[i+1];
    if (user?.role === "user" && assistant?.role === "assistant" &&
        !isEcho(assistant.content, user.content)) {
      pairs.push([
        { role: "user", content: short(user.content, 190) },
        { role: "assistant", content: short(assistant.content, 240) }
      ]);
      i++;
    }
  }
  for(const pair of pairs.slice(-3))turns.push(...pair);
  turns.push({ role: "user", content: short(data.question, 240) });
  return turns;
}

export function extractNPCReply(result, question) {
  let raw = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
  if (Array.isArray(raw)) {
    // Some APIs return the whole chat; NEVER take the last user message.
    // The final turn MUST be the new assistant message. An older assistant turn
    // from chat history is not a response to the latest player question.
    const assistant = raw.at(-1);
    if (assistant?.role !== "assistant") throw new Error("A IA não gerou uma mensagem de NPC.");
    raw = assistant.content;
  }
  if (Array.isArray(raw)) {
    raw = raw.filter(part => part && (part.type === "text" || typeof part.text === "string"))
      .map(part => part.text ?? "").join(" ");
  }
  if (typeof raw !== "string") throw new Error("A IA devolveu uma resposta inválida.");

  let reply = raw.replace(/<\|[^>]*\|>/g, "")
    .replace(/^\s*(?:(?:assistant|assistente|npc|personagem|resposta)\s*:\s*)+/i, "")
    .split(/\n\s*(?:jogador|usu[aá]rio|user)\s*:/i)[0]
    .trim();
  const original = short(question, 240);
  // In some models the user question is prefixed to a genuine answer.
  if (original.length >= 8 &&
      reply.slice(0, original.length).toLowerCase() === original.toLowerCase()) {
    reply = reply.slice(original.length).replace(/^[\s,:;.!?—-]+/, "").trim();
  }
  reply = reply.slice(0, 450).trim();
  if (isEcho(reply, original)) throw new Error("A IA repetiu a pergunta em vez de responder.");
  return reply;
}

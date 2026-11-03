/**
 * Grounded, deterministic checks for obvious game-world contradictions.
 * This supplements (does not replace) the LLM reviewer.
 */
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const unsupported=/\b(armadura|armaduras|espada|espadas|arma|armas|escudo|escudos)\b/i;
const availability=/\b(tem|temos|possui|possuo|vendemos|vende|vendo|vendem|disponivel|disponiveis|encontr[a-z]*|comprar|oferecemos)\b/i;
const negative=/\b(nao|nunca|sem|nenhum[ao]s?|indisponiveis?|esgotad[ao]s?)\b/i;

export function objectiveDialogueIssues(context={},answer=''){
  const issues=[];
  const phrases=norm(answer).split(/[.!?\n]+/).map(s=>s.trim()).filter(Boolean);
  for(const sentence of phrases){
    // Game catalog does not implement weapons/armor. "Não tenho armadura"
    // is allowed; "na Forja temos armaduras" is a world-state contradiction.
    const hasUnavailable=unsupported.test(sentence);
    if(hasUnavailable&&availability.test(sentence)&&!negative.test(sentence)){
      issues.push('Promete armas ou armaduras não cadastradas nesta demonstração.');
      break;
    }
  }
  for(const sentence of phrases){
    if(/\b(ja preparei|ja entreguei|te entreguei|acabei de entregar|te vendi|ja lhe dei)\b/.test(sentence) &&
      !context.confirmedAction){
      issues.push('Afirma ter concluído uma ação que o motor não confirmou.');
      break;
    }
  }
  return issues;
}

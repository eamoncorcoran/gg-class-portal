// Pronunciation scoring, ported 1:1 from the HeyRua app's practice feature
// (practice_controller.dart): same normalization, phonetic skeleton, aliases,
// similarity thresholds (>=0.85 correct, >=0.58 goodEffort) and final verdict.

export function normalize(str) {
  let s = String(str).toLowerCase();
  s = s.replaceAll('dhuit', 'duit');
  s = s
    .replace(/[áàâ]/g, 'a')
    .replace(/[éèê]/g, 'e')
    .replace(/[íìî]/g, 'i')
    .replace(/[óòô]/g, 'o')
    .replace(/[úùû]/g, 'u');
  return s.replace(/[^\w\s]/g, '').trim();
}

function toPhoneticSkeleton(word) {
  let s = word;
  s = s.replace(/(bh|mh|v|w|f)/g, 'F');
  s = s.replace(/(ch|gh|dh|th|h)/g, 'H');
  s = s.replace(/(sh|s)/g, 'S');
  s = s.replace(/[td]/g, 'T');
  s = s.replace(/[cgkq]/g, 'K');
  s = s.replace(/[pb]/g, 'P');
  s = s.replace(/[lmnr]/g, 'N');
  return s;
}

function levenshtein(s1, s2) {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;
  let v0 = Array.from({ length: s2.length + 1 }, (_, i) => i);
  let v1 = new Array(s2.length + 1).fill(0);
  for (let i = 0; i < s1.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    v0 = v1.slice();
  }
  return v1[s2.length];
}

const phoneticAliases = {
  eirinn: ['erin', 'aarron', 'eireann', 'irinn', 'eirrin', 'aaron', 'erinn'],
  se: ['shay', 'shea', 'say', 'she', 'se', 'sé', 'shae'],
  'an-ghnothach': ['angnotach', 'unnotach', 'angnooch', 'anghnotach', 'an gnotach', 'angnotoc']
};

export function phoneticSimilarity(target, spoken) {
  if (target === spoken) return 1.0;
  if (target.length >= 4 && spoken.length <= target.length + 3 && spoken.includes(target)) {
    return 1.0;
  }
  if (phoneticAliases[target] &&
      phoneticAliases[target].some(a => spoken === a || spoken.includes(a))) {
    return 1.0;
  }
  const tp = toPhoneticSkeleton(target);
  const sp = toPhoneticSkeleton(spoken);
  if (tp === sp) return 1.0;
  const dist = levenshtein(tp, sp);
  const maxLen = Math.max(tp.length, sp.length);
  if (maxLen === 0) return 0.0;
  return (maxLen - dist) / maxLen;
}

function replaceDigitsWithWords(text) {
  let res = String(text);
  const symbolMap = { '€': ' euro ', $: ' dollar ', '%': ' faoin gcéad ', '&': ' agus ', '+': ' móide ' };
  for (const [sym, word] of Object.entries(symbolMap)) res = res.replaceAll(sym, word);
  const numMap = { 0: 'náid', 1: 'aon', 2: 'dó', 3: 'trí', 4: 'ceathair', 5: 'cúig', 6: 'sé', 7: 'seacht', 8: 'ocht', 9: 'naoi' };
  res = res.replace(/\b10\b/g, ' deich ');
  for (const [k, v] of Object.entries(numMap)) res = res.replace(new RegExp(`\\b${k}\\b`, 'g'), ` ${v} `);
  return res.replace(/\s+/g, ' ').trim();
}

// Grade a transcript against the target phrase. Final mode fills unmatched
// words as 'wrong' and produces a verdict, matching the app's final scoring.
// Partial mode (opts.partial) leaves unmatched words null, matching how the
// app grades Azure partials while the mic is still open.
export function scoreAttempt(targetPhrase, transcript, opts = {}) {
  const targetWords = String(targetPhrase).trim().split(/\s+/).filter(Boolean);
  const matched = new Array(targetWords.length).fill(null);

  let fullText = replaceDigitsWithWords(transcript);
  let spokenWords = fullText.trim().split(/\s+/);
  const targetHasShortWord = targetWords.some(w => normalize(w).length < 2);
  spokenWords = spokenWords.filter(
    w => w && !(!targetHasShortWord && normalize(w).length < 2)
  );

  const available = [...spokenWords];
  for (let i = 0; i < targetWords.length; i++) {
    const target = normalize(targetWords[i]);
    let bestSim = 0.0, bestJ = -1, bestConsumed = 1;
    for (let j = 0; j < available.length; j++) {
      const spoken = normalize(available[j]);
      let sim = phoneticSimilarity(target, spoken);
      let consumed = 1;
      if (j < available.length - 1) {
        const combined = normalize(available[j] + available[j + 1]);
        const combinedSim = phoneticSimilarity(target, combined);
        if (combinedSim > sim) { sim = combinedSim; consumed = 2; }
      }
      if (sim > bestSim) { bestSim = sim; bestJ = j; bestConsumed = consumed; }
    }
    if (bestSim >= 0.58) {
      matched[i] = bestSim >= 0.85 ? 'correct' : 'goodEffort';
      if (bestJ !== -1) {
        available.splice(bestJ, 1);
        if (bestConsumed === 2 && bestJ < available.length) available.splice(bestJ, 1);
      }
    }
  }

  if (opts.partial) {
    return { words: targetWords, statuses: matched, verdict: null, partial: true };
  }

  return finalizeScore(targetWords, matched);
}

// The app's _evaluatePartialSpeech, 1:1: called every time new recognized text
// arrives while listening. Already-locked words are skipped (their spoken words
// are not re-consumed), new grades lock in at first sight.
export function evaluatePartial(targetWords, locked, fullText) {
  let text = replaceDigitsWithWords(fullText);
  let spokenWords = text.trim().split(/\s+/);
  const targetHasShortWord = targetWords.some(w => normalize(w).length < 2);
  spokenWords = spokenWords.filter(
    w => w && !(!targetHasShortWord && normalize(w).length < 2)
  );

  const available = [...spokenWords];
  const updated = [...locked];
  const changed = [];

  for (let i = 0; i < targetWords.length; i++) {
    if (updated[i] != null) continue;
    const target = normalize(targetWords[i]);
    let bestSim = 0.0, bestJ = -1, bestConsumed = 1;
    for (let j = 0; j < available.length; j++) {
      const spoken = normalize(available[j]);
      let sim = phoneticSimilarity(target, spoken);
      let consumed = 1;
      if (j < available.length - 1) {
        const combined = normalize(available[j] + available[j + 1]);
        const combinedSim = phoneticSimilarity(target, combined);
        if (combinedSim > sim) { sim = combinedSim; consumed = 2; }
      }
      if (sim > bestSim) { bestSim = sim; bestJ = j; bestConsumed = consumed; }
    }
    if (bestSim >= 0.58) {
      updated[i] = bestSim >= 0.85 ? 'correct' : 'goodEffort';
      changed.push(i);
      if (bestJ !== -1) {
        available.splice(bestJ, 1);
        if (bestConsumed === 2 && bestJ < available.length) available.splice(bestJ, 1);
      }
    }
  }
  return { locked: updated, changed };
}

// The app's _evaluateFinalScore fill: unmatched words become wrong.
export function finalizeScore(targetWords, matched) {

  let hasWrong = false, hasGoodEffort = false;
  const statuses = matched.map(m => {
    if (m === null || m === 'wrong') { hasWrong = true; return 'wrong'; }
    if (m === 'goodEffort') hasGoodEffort = true;
    return m;
  });

  const verdict = hasWrong ? 'incorrect' : hasGoodEffort ? 'goodEffort' : 'correct';
  return { words: targetWords, statuses, verdict };
}

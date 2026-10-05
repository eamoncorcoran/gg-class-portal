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

/* Keyed by the normalised form of the target word, since that is what is
   looked up: 'an-ghnothach' never matched anything because normalising had
   already made it 'anghnothach'. */
const phoneticAliases = {
  eirinn: ['erin', 'aarron', 'eireann', 'irinn', 'eirrin', 'aaron', 'erinn'],
  se: ['shay', 'shea', 'say', 'she', 'se', 'sé', 'shae'],
  anghnothach: ['angnotach', 'unnotach', 'angnooch', 'anghnotach', 'angnotach', 'angnotoc']
};

/* Short words get a little more room. A two-letter word with one letter
   wrong scores 0.5 and could never match, so "tú" heard as "ta" was a fail
   for the whole phrase. */
export function matchGrade(target, sim) {
  const short = target.length <= 3;
  if (sim >= 0.85) return 'correct';
  if (sim >= 0.58 || (short && sim >= 0.5)) return 'goodEffort';
  return null;
}

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
  /* Azure writes numbers as digits. The ones a class says out loud. */
  const numMap = {
    100: 'céad', 90: 'nócha', 80: 'ochtó', 70: 'seachtó', 60: 'seasca', 50: 'caoga', 40: 'daichead', 30: 'tríocha', 20: 'fiche',
    19: 'naoi déag', 18: 'ocht déag', 17: 'seacht déag', 16: 'sé déag', 15: 'cúig déag', 14: 'ceathair déag', 13: 'trí déag', 12: 'dó dhéag', 11: 'aon déag', 10: 'deich',
    9: 'naoi', 8: 'ocht', 7: 'seacht', 6: 'sé', 5: 'cúig', 4: 'ceathair', 3: 'trí', 2: 'dó', 1: 'aon', 0: 'náid',
  };
  for (const k of Object.keys(numMap).sort((a, b) => Number(b) - Number(a))) res = res.replace(new RegExp(`\\b${k}\\b`, 'g'), ` ${numMap[k]} `);
  // A hyphen is a space to the ear: "an-mhaith" and "an mhaith" are the same thing said.
  return res.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
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
    const grade = matchGrade(target, bestSim);
    if (grade) {
      matched[i] = grade;
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

// The app's _evaluatePartialSpeech: called every time new recognized text
// arrives while listening. A word graded correct stays correct. A word graded
// fair is looked at again on later text, because Azure's first guess at a word
// is often rough and its final one right: "math" became "maith" a moment later
// and the old rule had already locked the phrase as Fair. A grade only ever
// goes up. A target that is nothing but punctuation (a dash between two
// halves) is counted as said, since nobody can pronounce a dash.
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
    if (updated[i] === 'correct') continue;
    const target = normalize(targetWords[i]);
    if (!target) { if (updated[i] !== 'correct') { updated[i] = 'correct'; changed.push(i); } continue; }
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
    const grade = matchGrade(target, bestSim);
    if (grade && (updated[i] == null || grade === 'correct')) {
      if (updated[i] !== grade) { updated[i] = grade; changed.push(i); }
      if (bestJ !== -1) {
        available.splice(bestJ, 1);
        if (bestConsumed === 2 && bestJ < available.length) available.splice(bestJ, 1);
      }
    } else if (updated[i] != null && bestJ !== -1) {
      // Still fair: its word is still spoken for, so the next target cannot take it.
      available.splice(bestJ, 1);
      if (bestConsumed === 2 && bestJ < available.length) available.splice(bestJ, 1);
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

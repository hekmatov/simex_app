import { normalizeText, tokenize } from "./chartSearchIndex.js";

const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 12;
const MINIMUM_SCORE = 1.2;
const DEFAULT_MAX_TOKEN_FREQUENCY_RATIO = 0.16;
const MIN_TOKEN_LENGTH = 3;

const COMMON_WORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "also",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "chart",
  "charts",
  "could",
  "current",
  "currently",
  "dashboard",
  "data",
  "de",
  "der",
  "dit",
  "do",
  "does",
  "een",
  "en",
  "for",
  "from",
  "gaan",
  "go",
  "had",
  "has",
  "have",
  "he",
  "het",
  "hier",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "just",
  "let",
  "lets",
  "look",
  "looking",
  "maybe",
  "met",
  "naar",
  "need",
  "needs",
  "niet",
  "now",
  "of",
  "on",
  "or",
  "our",
  "over",
  "panel",
  "panels",
  "recent",
  "recently",
  "section",
  "see",
  "show",
  "should",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "today",
  "to",
  "topic",
  "topics",
  "talk",
  "talking",
  "tell",
  "use",
  "using",
  "van",
  "voor",
  "was",
  "wat",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "with",
  "wordt",
  "would",
  "zijn",
]);

export function rankChartMatches(transcript, chartIndex, feedbackRecords = [], options = {}) {
  const limit = Math.min(Math.max(Number(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const queryText = normalizeText(transcript);
  const tokenFrequency = chartTokenFrequency(chartIndex);
  const queryTokens = uncommonQueryTokens(tokenize(queryText), chartIndex, tokenFrequency, options);
  if (queryTokens.length === 0) {
    return [];
  }

  return chartIndex
    .map((record) => scoreRecord(record, queryText, queryTokens, feedbackRecords, tokenFrequency, options))
    .filter((match) => match.score >= (options.minimumScore ?? MINIMUM_SCORE))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit)
    .map((match, index, matches) => ({
      ...match,
      confidence: confidenceFromScore(match.score, matches[0]?.score ?? match.score),
    }));
}

function scoreRecord(record, queryText, queryTokens, feedbackRecords, tokenFrequency, options) {
  const matchedTerms = [];
  let score = 0;

  for (const token of queryTokens) {
    if (record.tokens.includes(token)) {
      matchedTerms.push(token);
      score += token.length >= 6 ? 1.35 : 1.05;
    }
  }

  for (const phrase of [...record.aliases, ...record.keywords]) {
    const normalizedPhrase = normalizeText(phrase);
    const phraseTokens = uncommonQueryTokens(
      tokenize(normalizedPhrase),
      [record],
      tokenFrequency,
      options,
    );
    if (phraseTokens.length > 0 && normalizedPhrase.length > 2 && queryText.includes(normalizedPhrase)) {
      matchedTerms.push(normalizedPhrase);
      score += normalizedPhrase.includes(" ") ? 2.5 : 1.2;
    }
  }

  score += feedbackAdjustment(record.panelId, queryTokens, feedbackRecords);

  const uniqueTerms = [...new Set(matchedTerms)].slice(0, 5);
  return {
    panelId: record.panelId,
    title: record.title,
    pageLabel: record.pageLabel,
    sectionTitle: record.sectionTitle,
    score: Number(score.toFixed(3)),
    matchedTerms: uniqueTerms,
    reason: uniqueTerms.length
      ? `Matched ${uniqueTerms.join(", ")}`
      : `Matched ${record.sectionTitle}`,
  };
}

function feedbackAdjustment(panelId, queryTokens, feedbackRecords) {
  let adjustment = 0;
  for (const feedback of feedbackRecords ?? []) {
    if (feedback.panelId !== panelId) {
      continue;
    }
    const feedbackTokens = tokenize(feedback.transcriptSnippet ?? "");
    const overlap = queryTokens.filter((token) => feedbackTokens.includes(token)).length;
    if (overlap === 0) {
      continue;
    }
    const weight = Math.min(overlap, 5) * 0.28;
    adjustment += feedback.vote === "up" ? weight : -weight;
  }
  return adjustment;
}

function uncommonQueryTokens(tokens, chartIndex, tokenFrequency, options = {}) {
  const maxFrequency = maxAllowedTokenFrequency(chartIndex, options);
  return tokens.filter((token) => isUsefulToken(token, tokenFrequency, maxFrequency));
}

export function isCommonVoiceWord(token) {
  return COMMON_WORDS.has(token);
}

function isUsefulToken(token, tokenFrequency, maxFrequency) {
  if (token.length < MIN_TOKEN_LENGTH || COMMON_WORDS.has(token)) {
    return false;
  }
  return (tokenFrequency.get(token) ?? 0) <= maxFrequency;
}

function chartTokenFrequency(chartIndex) {
  const tokenFrequency = new Map();
  for (const record of chartIndex ?? []) {
    for (const token of record.tokens ?? []) {
      tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
    }
  }
  return tokenFrequency;
}

function maxAllowedTokenFrequency(chartIndex, options) {
  const configuredFrequency = Number(options.maxTokenFrequency);
  if (Number.isFinite(configuredFrequency) && configuredFrequency > 0) {
    return configuredFrequency;
  }
  const ratio = Number(options.maxTokenFrequencyRatio ?? DEFAULT_MAX_TOKEN_FREQUENCY_RATIO);
  return Math.max(2, Math.ceil((chartIndex?.length ?? 0) * ratio));
}

function confidenceFromScore(score, topScore) {
  if (topScore <= 0) {
    return "low";
  }
  const ratio = score / topScore;
  if (score >= 5 && ratio >= 0.72) {
    return "high";
  }
  if (score >= 2.5 && ratio >= 0.45) {
    return "medium";
  }
  return "low";
}

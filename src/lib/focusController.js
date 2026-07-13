import { normalizeText, tokenize } from "./chartSearchIndex.js";
import { isCommonVoiceWord, rankChartMatches } from "./conversationMatcher.js";

const MAX_SEGMENTS = 24;
const MAX_SUMMARY_TERMS = 14;
const DEFAULT_MAX_FOCUS_PANELS = 2;
const MAX_FOCUS_PANELS = 4;
const INTERNAL_CANDIDATE_LIMIT = 8;
const DEFAULT_MINIMUM_FOCUS_SCORE = 1;
const MINIMUM_FOCUS_SCORE_LIMIT = 0.2;
const MAXIMUM_FOCUS_SCORE_LIMIT = 10;
const MIN_ADDITIONAL_PANEL_SCORE = 2.2;
const ADDITIONAL_PANEL_SCORE_RATIO = 0.64;
const SWITCH_MARGIN = 1.18;
const MIN_SWITCH_SECONDS = 28;

export function createFocusState() {
  return {
    segments: [],
    summary: "",
    topicTerms: [],
    selectedPanelIds: [],
    selectedSince: 0,
    pendingSignature: "",
    pendingCount: 0,
  };
}

export function updateSemanticFocusState(previousState, transcriptSegment, chartIndex, feedbackRecords = [], now = Date.now(), options = {}) {
  const maxPanels = clampFocusPanelLimit(options.maxPanels);
  const minimumScore = clampMinimumFocusScore(options.minimumScore);
  const cleanSegment = String(transcriptSegment ?? "").trim();
  const segments = cleanSegment
    ? [...previousState.segments, { text: cleanSegment, at: now }].slice(-MAX_SEGMENTS)
    : previousState.segments;
  const recentText = segments.slice(-5).map((segment) => segment.text).join(" ");
  const fullText = segments.map((segment) => segment.text).join(" ");
  const topicTerms = topicTermsFromText(fullText, chartIndex);
  const summary = topicSummary(topicTerms, recentText);
  const contextText = [
    topicTerms.join(" "),
    topicTerms.join(" "),
    segments.slice(-10).map((segment) => segment.text).join(" "),
    recentText,
  ].join(" ");
  const candidates = rankChartMatches(contextText, chartIndex, feedbackRecords, {
    limit: INTERNAL_CANDIDATE_LIMIT,
    minimumScore,
  });
  const focusCandidates = selectFocusCandidates(candidates, maxPanels);
  const decision = stableDecision(previousState, focusCandidates, now, maxPanels);

  return {
    state: {
      ...previousState,
      segments,
      summary,
      topicTerms,
      selectedPanelIds: decision.panelIds,
      selectedSince: decision.selectedSince,
      pendingSignature: decision.pendingSignature,
      pendingCount: decision.pendingCount,
    },
    matches: focusCandidates,
    candidates,
    decision,
    embedding: {
      model: "local-topic-vector",
      terms: topicTerms.slice(0, MAX_SUMMARY_TERMS),
      candidateScores: candidates.map((candidate) => ({
        panelId: candidate.panelId,
        title: candidate.title,
        score: candidate.score,
        matchedTerms: candidate.matchedTerms,
      })),
    },
  };
}

export function normalizeJudgeDecision(result, fallbackMatches, previousPanelIds = [], options = {}) {
  const maxPanels = clampFocusPanelLimit(options.maxPanels);
  const fallbackIds = selectFocusCandidates(fallbackMatches, maxPanels).map((match) => match.panelId);
  const panelIds = Array.isArray(result?.selectedPanelIds)
    ? result.selectedPanelIds.map(String).filter(Boolean).slice(0, maxPanels)
    : fallbackIds;
  return {
    panelIds: panelIds.length ? panelIds : previousPanelIds.slice(0, maxPanels),
    action: result?.action ?? (sameSignature(panelIds, previousPanelIds, maxPanels) ? "keep" : "update"),
    confidence: Number(result?.confidence ?? fallbackMatches[0]?.score ?? 0),
    reason: result?.reason ?? "Used fallback semantic candidates.",
  };
}

export function clampFocusPanelLimit(value) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? Math.round(number) : DEFAULT_MAX_FOCUS_PANELS, 1), MAX_FOCUS_PANELS);
}

export function clampMinimumFocusScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_MINIMUM_FOCUS_SCORE;
  }
  return Number(Math.min(Math.max(number, MINIMUM_FOCUS_SCORE_LIMIT), MAXIMUM_FOCUS_SCORE_LIMIT).toFixed(1));
}

function selectFocusCandidates(candidates, maxPanels) {
  const limit = clampFocusPanelLimit(maxPanels);
  const [topCandidate, ...rest] = candidates;
  if (!topCandidate) {
    return [];
  }
  const selected = [topCandidate];
  for (const candidate of rest) {
    if (selected.length >= limit) {
      break;
    }
    const strongEnough = candidate.score >= MIN_ADDITIONAL_PANEL_SCORE;
    const closeEnough = candidate.score >= topCandidate.score * ADDITIONAL_PANEL_SCORE_RATIO;
    if (strongEnough && closeEnough) {
      selected.push(candidate);
    }
  }
  return selected;
}

function stableDecision(previousState, candidates, now, maxPanels) {
  const previousPanelIds = previousState.selectedPanelIds.slice(0, maxPanels);
  const candidateIds = candidates.map((candidate) => candidate.panelId);
  if (candidateIds.length === 0) {
    return {
      action: "keep",
      panelIds: previousPanelIds,
      selectedSince: previousState.selectedSince,
      pendingSignature: "",
      pendingCount: 0,
      reason: "No strong chart candidates yet.",
    };
  }

  if (previousPanelIds.length === 0) {
    return {
      action: "initial",
      panelIds: candidateIds,
      selectedSince: now,
      pendingSignature: signature(candidateIds, maxPanels),
      pendingCount: 0,
      reason: "Initial focus from rolling discussion context.",
    };
  }

  const currentSignature = signature(previousPanelIds, maxPanels);
  const nextSignature = signature(candidateIds, maxPanels);
  if (currentSignature === nextSignature) {
    return {
      action: "keep",
      panelIds: previousPanelIds,
      selectedSince: previousState.selectedSince,
      pendingSignature: "",
      pendingCount: 0,
      reason: "Current charts still match the rolling discussion.",
    };
  }

  const topScore = candidates[0]?.score ?? 0;
  const currentScore = candidates
    .filter((candidate) => previousPanelIds.includes(candidate.panelId))
    .reduce((total, candidate) => total + candidate.score, 0);
  const enoughMargin = topScore >= Math.max(1.4, currentScore * SWITCH_MARGIN);
  const enoughTime = now - previousState.selectedSince >= MIN_SWITCH_SECONDS * 1000;
  const pendingCount = previousState.pendingSignature === nextSignature ? previousState.pendingCount + 1 : 1;

  if (enoughMargin && (enoughTime || pendingCount >= 2)) {
    return {
      action: "switch",
      panelIds: candidateIds,
      selectedSince: now,
      pendingSignature: "",
      pendingCount: 0,
      reason: pendingCount >= 2
        ? "Two consecutive updates supported a topic shift."
        : "New topic evidence is stronger than the current focus.",
    };
  }

  return {
    action: "hold",
    panelIds: previousPanelIds,
    selectedSince: previousState.selectedSince,
    pendingSignature: nextSignature,
    pendingCount,
    reason: "Possible topic shift detected, waiting for more evidence.",
  };
}

function topicTermsFromText(text, chartIndex) {
  const phraseTerms = topicPhrasesFromText(text, chartIndex);
  const chartFrequency = chartTokenFrequency(chartIndex);
  const counts = new Map();
  for (const token of tokenize(text)) {
    if (token.length < 3 || isCommonVoiceWord(token)) {
      continue;
    }
    const chartCount = chartFrequency.get(token) ?? 0;
    if (chartCount === 0 || chartCount > Math.max(3, chartIndex.length * 0.24)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1 + 1 / chartCount);
  }
  const tokenTerms = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token);
  const phraseTokens = new Set(phraseTerms.flatMap((phrase) => tokenize(phrase)));
  const backfillTokens = tokenTerms.filter((token) => !phraseTokens.has(token));
  return [...phraseTerms, ...backfillTokens].slice(0, MAX_SUMMARY_TERMS);
}

function topicPhrasesFromText(text, chartIndex) {
  const normalizedText = ` ${normalizeText(text)} `;
  const phraseCounts = new Map();
  const phrasePanelCounts = new Map();
  for (const record of chartIndex ?? []) {
    for (const phrase of chartPhrases(record)) {
      phrasePanelCounts.set(phrase, (phrasePanelCounts.get(phrase) ?? 0) + 1);
      if (normalizedText.includes(` ${phrase} `)) {
        phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
      }
    }
  }
  return [...phraseCounts.entries()]
    .map(([phrase, count]) => {
      const tokenCount = tokenize(phrase).length;
      const panelCount = phrasePanelCounts.get(phrase) ?? 1;
      return [
        phrase,
        count + tokenCount * 0.6 + 1 / panelCount,
      ];
    })
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, Math.max(4, Math.floor(MAX_SUMMARY_TERMS * 0.7)))
    .map(([phrase]) => phrase);
}

function chartPhrases(record) {
  const fragments = [
    record.title,
    record.sectionTitle,
    ...(record.aliases ?? []),
    ...(record.keywords ?? []),
  ];
  return [...new Set(
    fragments
      .map((fragment) => normalizeText(fragment))
      .filter((phrase) => {
        const tokens = tokenize(phrase);
        return tokens.length >= 2
          && tokens.length <= 6
          && tokens.some((token) => !isCommonVoiceWord(token));
      }),
  )];
}

function topicSummary(topicTerms, recentText) {
  if (topicTerms.length === 0) {
    return "Waiting for a stable discussion topic.";
  }
  const compactRecent = normalizeText(recentText).slice(0, 180);
  return `Current discussion appears centered on ${topicTerms.slice(0, 6).join(", ")}.${compactRecent ? ` Recent context: ${compactRecent}` : ""}`;
}

function chartTokenFrequency(chartIndex) {
  const frequency = new Map();
  for (const record of chartIndex ?? []) {
    for (const token of record.tokens ?? []) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  return frequency;
}

function signature(panelIds, maxPanels = MAX_FOCUS_PANELS) {
  return panelIds.slice(0, maxPanels).join("|");
}

function sameSignature(left, right, maxPanels = MAX_FOCUS_PANELS) {
  return signature(left, maxPanels) === signature(right, maxPanels);
}

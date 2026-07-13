const STORAGE_KEY = "simex-dashboard-v2-voice-feedback";
const MAX_RECORDS = 300;

export function readVoiceFeedback() {
  if (!storageAvailable()) {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addVoiceFeedback(record) {
  const records = [
    {
      panelId: record.panelId,
      vote: record.vote === "down" ? "down" : "up",
      transcriptSnippet: String(record.transcriptSnippet ?? "").slice(-1000),
      score: Number(record.score ?? 0),
      reason: String(record.reason ?? ""),
      createdAt: new Date().toISOString(),
    },
    ...readVoiceFeedback(),
  ].slice(0, MAX_RECORDS);
  writeVoiceFeedback(records);
  return records;
}

export function clearVoiceFeedback() {
  if (storageAvailable()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function writeVoiceFeedback(records) {
  if (storageAvailable()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }
}

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

const MAX_VISIBLE_LOG_ENTRIES = 18;

export function createVoiceFocusSession(mode) {
  const startedAt = new Date().toISOString();
  return {
    id: `voice-focus-${startedAt.replace(/[:.]/g, "-")}`,
    mode,
    startedAt,
  };
}

export function createLogEntry(type, payload = {}) {
  return {
    type,
    at: new Date().toISOString(),
    ...payload,
  };
}

export function visibleLogEntries(entries) {
  return entries.slice(-MAX_VISIBLE_LOG_ENTRIES);
}

export async function saveVoiceFocusLog(serviceUrl, session, entries, readableEntries = []) {
  if (!session || entries.length === 0) {
    return null;
  }
  const response = await fetch(`${serviceUrl}/voice-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session,
      stoppedAt: new Date().toISOString(),
      entries,
      readableEntries,
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

import React from "react";

import { buildChartSearchIndex } from "../lib/chartSearchIndex.js";
import {
  clampFocusPanelLimit,
  clampMinimumFocusScore,
  createFocusState,
  normalizeJudgeDecision,
  updateSemanticFocusState,
} from "../lib/focusController.js";
import { rankChartMatches } from "../lib/conversationMatcher.js";
import {
  addChartKeywords,
  applyChartKeywordOverrides,
  clearChartKeywordOverrides,
  panelKeywordView,
  readChartKeywordOverrides,
  removeChartKeyword,
  restoreChartKeyword,
} from "../lib/chartKeywordOverrides.js";
import {
  addVoiceFeedback,
  clearVoiceFeedback,
  readVoiceFeedback,
} from "../lib/voiceFeedbackStore.js";
import {
  createLogEntry,
  createVoiceFocusSession,
  saveVoiceFocusLog,
  visibleLogEntries,
} from "../lib/voiceFocusLogStore.js";

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8766";
const TRANSCRIPT_WINDOW_SIZE = 8;
const SEGMENT_DURATION_MS = 12000;
const DEFAULT_MAX_FOCUS_PANELS = "2";
const DEFAULT_MINIMUM_FOCUS_SCORE = "1.0";
const DEFAULT_CAPTURE_SETTINGS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: "1",
  sampleRate: "48000",
  audioBitsPerSecond: "128000",
  segmentSeconds: "12",
};

export default function VoiceFocusControl({ dashboard, onOpenFocus }) {
  const serviceUrl = import.meta.env.VITE_SIMEX_VOICE_SERVICE_URL || DEFAULT_SERVICE_URL;
  const [serviceState, setServiceState] = React.useState("checking");
  const [recording, setRecording] = React.useState(false);
  const [autoFocus, setAutoFocus] = React.useState(true);
  const [aliases, setAliases] = React.useState({});
  const [keywordOverrides, setKeywordOverrides] = React.useState(() => readChartKeywordOverrides());
  const [selectedKeywordPanelId, setSelectedKeywordPanelId] = React.useState("");
  const [keywordDraft, setKeywordDraft] = React.useState("");
  const [transcriptionBackend, setTranscriptionBackend] = React.useState("whisper");
  const [focusMode, setFocusMode] = React.useState("semantic");
  const [maxFocusPanels, setMaxFocusPanels] = React.useState(DEFAULT_MAX_FOCUS_PANELS);
  const [minimumFocusScore, setMinimumFocusScore] = React.useState(DEFAULT_MINIMUM_FOCUS_SCORE);
  const [audioDevices, setAudioDevices] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [captureSettings, setCaptureSettings] = React.useState(DEFAULT_CAPTURE_SETTINGS);
  const [transcriptParts, setTranscriptParts] = React.useState([]);
  const [matches, setMatches] = React.useState([]);
  const [feedbackRecords, setFeedbackRecords] = React.useState(() => readVoiceFeedback());
  const [statusMessage, setStatusMessage] = React.useState("Checking local voice service.");
  const [segmentState, setSegmentState] = React.useState("idle");
  const [segmentStats, setSegmentStats] = React.useState({
    recorded: 0,
    sent: 0,
    completed: 0,
    failed: 0,
  });
  const [lastAudioUrl, setLastAudioUrl] = React.useState("");
  const [lastAudioMeta, setLastAudioMeta] = React.useState(null);
  const [replayFile, setReplayFile] = React.useState(null);
  const [replayActive, setReplayActive] = React.useState(false);
  const [topicSummary, setTopicSummary] = React.useState("Waiting for a stable discussion topic.");
  const [focusDecision, setFocusDecision] = React.useState(null);
  const [focusLogEntries, setFocusLogEntries] = React.useState([]);
  const [logSaveMessage, setLogSaveMessage] = React.useState("");
  const recorderRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const segmentTimerRef = React.useRef(null);
  const recordingRequestedRef = React.useRef(false);
  const audioSourceLabelRef = React.useRef("Browser default microphone");
  const segmentSequenceRef = React.useRef(0);
  const lastAudioUrlRef = React.useRef("");
  const replayAudioRef = React.useRef(null);
  const replayAudioUrlRef = React.useRef("");
  const lastFocusedSignatureRef = React.useRef("");
  const focusStateRef = React.useRef(createFocusState());
  const focusLogRef = React.useRef([]);
  const focusModeRef = React.useRef(focusMode);
  const maxFocusPanelsRef = React.useRef(DEFAULT_MAX_FOCUS_PANELS);
  const minimumFocusScoreRef = React.useRef(DEFAULT_MINIMUM_FOCUS_SCORE);
  const activeSessionRef = React.useRef(null);
  const pendingTranscriptionsRef = React.useRef(0);

  const chartAliasConfig = React.useMemo(
    () => applyChartKeywordOverrides(aliases, keywordOverrides),
    [aliases, keywordOverrides],
  );
  const chartIndex = React.useMemo(
    () => buildChartSearchIndex(dashboard, chartAliasConfig),
    [dashboard, chartAliasConfig],
  );
  const transcriptText = transcriptParts.join(" ");
  const activeSegmentCount = Math.max(0, segmentStats.sent - segmentStats.completed - segmentStats.failed);
  const maxFocusPanelCount = clampFocusPanelLimit(maxFocusPanels);
  const minimumFocusScoreValue = clampMinimumFocusScore(minimumFocusScore);
  const selectedKeywordPanel = selectedKeywordPanelId
    ? chartIndex.find((record) => record.panelId === selectedKeywordPanelId)
    : chartIndex[0];
  const selectedKeywordPanelView = selectedKeywordPanel
    ? panelKeywordView(selectedKeywordPanel.panelId, aliases, keywordOverrides)
    : null;
  const groupedFocusLog = React.useMemo(
    () => groupFocusLogEntries(focusLogEntries, 12),
    [focusLogEntries],
  );

  React.useEffect(() => {
    let cancelled = false;
    let timer = null;

    function updateHealth() {
      checkServiceHealth(serviceUrl)
      .then((health) => {
        if (cancelled) {
          return;
        }
        const warmupState = health?.warmup?.state;
        if (warmupState === "warming" || warmupState === "pending") {
          setServiceState("warming");
          setStatusMessage("Voice service is warming up the transcription model.");
          timer = window.setTimeout(updateHealth, 1500);
          return;
        }
        if (warmupState === "error") {
          setServiceState("available");
          setStatusMessage(`Voice focus ready, but warm-up failed: ${health?.warmup?.error}`);
          return;
        }
        setServiceState("available");
        setStatusMessage("Voice focus ready.");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setServiceState("unavailable");
        setStatusMessage("Local voice service is not running.");
      });
    }

    updateHealth();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [serviceUrl]);

  React.useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}config/chart-aliases.json`)
      .then((response) => (response.ok ? response.json() : {}))
      .then((loadedAliases) => setAliases(loadedAliases ?? {}))
      .catch(() => setAliases({}));
  }, []);

  React.useEffect(() => {
    refreshAudioDevices();
  }, []);

  React.useEffect(() => {
    focusModeRef.current = focusMode;
  }, [focusMode]);

  React.useEffect(() => {
    maxFocusPanelsRef.current = maxFocusPanels;
  }, [maxFocusPanels]);

  React.useEffect(() => {
    minimumFocusScoreRef.current = minimumFocusScore;
  }, [minimumFocusScore]);

  React.useEffect(() => {
    if (!selectedKeywordPanelId && chartIndex.length > 0) {
      setSelectedKeywordPanelId(chartIndex[0].panelId);
    }
  }, [chartIndex, selectedKeywordPanelId]);

  React.useEffect(() => () => {
    stopRecording();
    revokeLastAudioUrl();
  }, []);

  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    if (serviceState !== "available") {
      setStatusMessage(serviceState === "warming" ? "Wait for the voice service warm-up to finish." : "Start the local voice service before using the mic.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatusMessage("This browser does not support live mic recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(selectedDeviceId, captureSettings),
      });
      streamRef.current = stream;
      recordingRequestedRef.current = true;
      audioSourceLabelRef.current = selectedMicLabel(audioDevices, selectedDeviceId);
      startVoiceFocusSession();
      refreshAudioDevices();
      startRecordingSegment(stream);
      setRecording(true);
      setSegmentState("recording");
      setStatusMessage("Listening for discussion topics.");
    } catch (error) {
      setStatusMessage(`Microphone unavailable: ${error.message}`);
    }
  }

  function stopRecording() {
    const wasReplayActive = replayActive || Boolean(replayAudioRef.current);
    recordingRequestedRef.current = false;
    window.clearTimeout(segmentTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    cleanupReplayAudio();
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setSegmentState("idle");
    queueVoiceFocusSessionFinish();
    setStatusMessage(wasReplayActive ? "Audio replay stopped." : serviceState === "available" ? "Voice focus ready." : "Local voice service is not running.");
  }

  async function startReplay() {
    if (!replayFile) {
      setStatusMessage("Choose a session recording file first.");
      return;
    }
    if (serviceState !== "available") {
      setStatusMessage(serviceState === "warming" ? "Wait for the voice service warm-up to finish." : "Start the local voice service before replay testing.");
      return;
    }
    if (!window.MediaRecorder) {
      setStatusMessage("This browser does not support audio segment recording.");
      return;
    }

    if (recording) {
      stopRecording();
    }
    cleanupReplayAudio();

    const audio = new Audio();
    const captureStream = audio.captureStream?.bind(audio) ?? audio.mozCaptureStream?.bind(audio);
    if (!captureStream) {
      setStatusMessage("This browser cannot capture audio file playback. Use Chrome or route system audio to a virtual microphone.");
      return;
    }

    const replayUrl = URL.createObjectURL(replayFile);
    replayAudioUrlRef.current = replayUrl;
    replayAudioRef.current = audio;
    audio.src = replayUrl;
    audio.preload = "auto";
    audio.volume = 1;
    audioSourceLabelRef.current = `Replay: ${replayFile.name}`;
    audio.onended = () => {
      setStatusMessage("Replay ended; finishing voice focus session.");
      stopRecording();
    };
    audio.onerror = () => {
      setStatusMessage("Replay audio could not be played by the browser.");
      stopRecording();
    };

    try {
      await audio.play();
      const stream = captureStream();
      if (stream.getAudioTracks().length === 0) {
        throw new Error("Replay produced no audio track.");
      }
      streamRef.current = stream;
      recordingRequestedRef.current = true;
      startVoiceFocusSession("replay");
      appendLog("replay-start", {
        fileName: replayFile.name,
        fileSizeKb: Math.round(replayFile.size / 1024),
        fileType: replayFile.type || "unknown",
      });
      startRecordingSegment(stream);
      setRecording(true);
      setReplayActive(true);
      setSegmentState("recording");
      setStatusMessage(`Replaying ${replayFile.name} through voice focus.`);
    } catch (error) {
      cleanupReplayAudio();
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
      streamRef.current = null;
      recordingRequestedRef.current = false;
      setRecording(false);
      setSegmentState("idle");
      setStatusMessage(`Replay unavailable: ${error.message}`);
    }
  }

  function cleanupReplayAudio() {
    const audio = replayAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    replayAudioRef.current = null;
    if (replayAudioUrlRef.current) {
      URL.revokeObjectURL(replayAudioUrlRef.current);
      replayAudioUrlRef.current = "";
    }
    setReplayActive(false);
  }

  function startRecordingSegment(stream) {
    if (!recordingRequestedRef.current || stream.getAudioTracks().every((track) => track.readyState === "ended")) {
      return;
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, recorderOptions(captureSettings));
    recorderRef.current = recorder;
    setSegmentState("recording");
    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      if (chunks.length > 0) {
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const segmentContext = {
          segmentId: `segment-${segmentSequenceRef.current + 1}`,
          recordedAt: new Date().toISOString(),
          source: audioSourceLabelRef.current || selectedMicLabel(audioDevices, selectedDeviceId),
          durationSeconds: Math.round(segmentDurationMs(captureSettings) / 1000),
          sizeKb: Math.round(audioBlob.size / 1024),
          mimeType: audioBlob.type,
        };
        segmentSequenceRef.current += 1;
        rememberLastAudio(audioBlob);
        setSegmentStats((current) => ({
          ...current,
          recorded: current.recorded + 1,
        }));
        transcribeAudioChunk(audioBlob, segmentContext);
      }
      if (recordingRequestedRef.current) {
        window.setTimeout(() => startRecordingSegment(stream), 50);
        return;
      }
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
    };
    recorder.start();
    segmentTimerRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") {
        setSegmentState("sending");
        recorder.stop();
      }
    }, segmentDurationMs(captureSettings));
  }

  async function transcribeAudioChunk(blob, segmentContext) {
    const formData = new FormData();
    formData.append("audio", blob, `voice-focus-${Date.now()}.webm`);
    formData.append("backend", transcriptionBackend);
    setSegmentState("transcribing");
    appendLog("transcribe-request", {
      segmentId: segmentContext?.segmentId,
      segment: segmentContext,
      transcriptionBackend,
      mimeType: blob.type,
      sizeKb: Math.round(blob.size / 1024),
    });
    pendingTranscriptionsRef.current += 1;
    setSegmentStats((current) => ({
      ...current,
      sent: current.sent + 1,
    }));
    try {
      const response = await fetch(`${serviceUrl}/transcribe`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const result = await response.json();
      appendLog("transcribe-response", {
        segmentId: segmentContext?.segmentId,
        textLength: String(result.text ?? "").trim().length,
        textPreview: String(result.text ?? "").trim().slice(0, 240),
      });
      appendTranscript(result.text, segmentContext);
      setSegmentStats((current) => ({
        ...current,
        completed: current.completed + 1,
      }));
      setSegmentState(recordingRequestedRef.current ? "recording" : "idle");
    } catch (error) {
      setSegmentStats((current) => ({
        ...current,
        failed: current.failed + 1,
      }));
      setSegmentState(recordingRequestedRef.current ? "recording" : "idle");
      appendLog("transcribe-error", {
        segmentId: segmentContext?.segmentId,
        message: error.message,
      });
      setStatusMessage(`Transcription paused: ${error.message}`);
    } finally {
      pendingTranscriptionsRef.current = Math.max(0, pendingTranscriptionsRef.current - 1);
      queueVoiceFocusSessionFinish();
    }
  }

  function rememberLastAudio(blob) {
    revokeLastAudioUrl();
    const nextUrl = URL.createObjectURL(blob);
    lastAudioUrlRef.current = nextUrl;
    setLastAudioUrl(nextUrl);
    setLastAudioMeta({
      sizeKb: Math.round(blob.size / 1024),
      recordedAt: new Date().toLocaleTimeString(),
      durationSeconds: Math.round(segmentDurationMs(captureSettings) / 1000),
      bitrateKbps: Math.round(Number(captureSettings.audioBitsPerSecond) / 1000),
      micLabel: audioSourceLabelRef.current || selectedMicLabel(audioDevices, selectedDeviceId),
    });
  }

  function revokeLastAudioUrl() {
    if (lastAudioUrlRef.current) {
      URL.revokeObjectURL(lastAudioUrlRef.current);
      lastAudioUrlRef.current = "";
    }
  }

  function appendTranscript(text, segmentContext = null) {
    const cleanText = String(text ?? "").trim();
    if (!cleanText) {
      appendLog("empty-transcript", {
        segmentId: segmentContext?.segmentId,
        message: "The transcription service returned no text for this segment.",
      });
      setStatusMessage("Transcription returned no text for the last segment.");
      return;
    }
    setStatusMessage("Transcript received; updating chart focus.");
    setTranscriptParts((current) => {
      const nextParts = [...current, cleanText].slice(-TRANSCRIPT_WINDOW_SIZE);
      processFocusSegment(cleanText, nextParts, segmentContext);
      return nextParts;
    });
  }

  async function processFocusSegment(cleanText, nextParts, segmentContext = null) {
    const nextTranscript = nextParts.join(" ");
    const maxPanelCount = clampFocusPanelLimit(maxFocusPanelsRef.current);
    const minimumScore = clampMinimumFocusScore(minimumFocusScoreRef.current);
    appendLog("transcript", {
      segmentId: segmentContext?.segmentId,
      recordedAt: segmentContext?.recordedAt,
      text: cleanText,
      rollingTranscript: nextTranscript,
      transcriptionBackend,
    });

    const semanticUpdate = updateSemanticFocusState(
      focusStateRef.current,
      cleanText,
      chartIndex,
      feedbackRecords,
      Date.now(),
      { maxPanels: maxPanelCount, minimumScore },
    );
    focusStateRef.current = semanticUpdate.state;
    setTopicSummary(semanticUpdate.state.summary);
    setMatches(semanticUpdate.matches);
    appendLog("topic", {
      segmentId: segmentContext?.segmentId,
      summary: semanticUpdate.state.summary,
      topicTerms: semanticUpdate.state.topicTerms,
    });
    appendLog("embedding", {
      segmentId: segmentContext?.segmentId,
      ...semanticUpdate.embedding,
    });
    appendLog("candidates", {
      segmentId: segmentContext?.segmentId,
      candidates: semanticUpdate.candidates.map((candidate) => ({
        panelId: candidate.panelId,
        title: candidate.title,
        pageLabel: candidate.pageLabel,
        sectionTitle: candidate.sectionTitle,
        score: candidate.score,
        confidence: candidate.confidence,
        matchedTerms: candidate.matchedTerms,
        reason: candidate.reason,
      })),
    });

    let decision = semanticUpdate.decision;
    if (focusModeRef.current === "llm" && semanticUpdate.candidates.length > 0) {
      appendLog("llm-request", {
        segmentId: segmentContext?.segmentId,
        candidatePanelIds: semanticUpdate.candidates.map((match) => match.panelId),
        maxSelectedCharts: maxPanelCount,
      });
      try {
        const judgeResult = await requestFocusJudge(semanticUpdate, nextTranscript, maxPanelCount);
        decision = normalizeJudgeDecision(
          judgeResult,
          semanticUpdate.matches,
          focusStateRef.current.selectedPanelIds,
          { maxPanels: maxPanelCount },
        );
        focusStateRef.current = {
          ...focusStateRef.current,
          selectedPanelIds: decision.panelIds,
          selectedSince: Date.now(),
          pendingSignature: "",
          pendingCount: 0,
        };
        appendLog("llm-response", {
          segmentId: segmentContext?.segmentId,
          ...judgeResult,
        });
      } catch (error) {
        decision = {
          ...semanticUpdate.decision,
          reason: `${semanticUpdate.decision.reason} LLM judge unavailable: ${error.message}`,
        };
        appendLog("llm-error", {
          segmentId: segmentContext?.segmentId,
          message: error.message,
        });
      }
    }

    setFocusDecision(decision);
    appendLog("decision", {
      segmentId: segmentContext?.segmentId,
      ...decision,
    });
    maybeOpenFocus(decision, semanticUpdate.matches, nextTranscript, semanticUpdate.state.summary);
  }

  function maybeOpenFocus(decision, nextMatches, nextTranscript, summary) {
    if (!autoFocus || !decision?.panelIds?.length) {
      return;
    }
    if (decision.action === "hold") {
      return;
    }
    const signature = decision.panelIds.join("|");
    if (signature === lastFocusedSignatureRef.current) {
      return;
    }
    lastFocusedSignatureRef.current = signature;
    onOpenFocus(
      decision.panelIds,
      focusReason(nextMatches, nextTranscript, decision, summary),
    );
  }

  function focusCurrentMatches() {
    if (matches.length === 0) {
      return;
    }
    const visibleMatches = matches.slice(0, maxFocusPanelCount);
    onOpenFocus(
      visibleMatches.map((match) => match.panelId),
      focusReason(visibleMatches, transcriptText, focusDecision, topicSummary),
    );
  }

  function submitFeedback(match, vote) {
    const nextRecords = addVoiceFeedback({
      panelId: match.panelId,
      vote,
      transcriptSnippet: transcriptText,
      score: match.score,
      reason: match.reason,
    });
    setFeedbackRecords(nextRecords);
    setMatches(rankChartMatches(transcriptText, chartIndex, nextRecords, { limit: maxFocusPanelCount, minimumScore: minimumFocusScoreValue }));
  }

  function resetFeedback() {
    clearVoiceFeedback();
    setFeedbackRecords([]);
    setMatches(rankChartMatches(transcriptText, chartIndex, [], { limit: maxFocusPanelCount, minimumScore: minimumFocusScoreValue }));
  }

  function clearTranscript() {
    setTranscriptParts([]);
    setMatches([]);
    segmentSequenceRef.current = 0;
    lastFocusedSignatureRef.current = "";
  }

  function addKeywordsToSelectedPanel() {
    if (!selectedKeywordPanel?.panelId || !keywordDraft.trim()) {
      return;
    }
    setKeywordOverrides(addChartKeywords(keywordOverrides, selectedKeywordPanel.panelId, keywordDraft));
    setKeywordDraft("");
  }

  function removeKeywordFromSelectedPanel(keyword, isDefaultKeyword) {
    if (!selectedKeywordPanel?.panelId) {
      return;
    }
    setKeywordOverrides(removeChartKeyword(keywordOverrides, selectedKeywordPanel.panelId, keyword, isDefaultKeyword));
  }

  function restoreKeywordToSelectedPanel(keyword) {
    if (!selectedKeywordPanel?.panelId) {
      return;
    }
    setKeywordOverrides(restoreChartKeyword(keywordOverrides, selectedKeywordPanel.panelId, keyword));
  }

  function resetKeywordOverrides() {
    setKeywordOverrides(clearChartKeywordOverrides());
  }

  async function refreshAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((device) => device.kind === "audioinput"));
    } catch {
      setAudioDevices([]);
    }
  }

  function updateCaptureSetting(key, value) {
    setCaptureSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function startVoiceFocusSession(source = "microphone") {
    const session = createVoiceFocusSession(focusModeRef.current);
    activeSessionRef.current = session;
    focusStateRef.current = createFocusState();
    focusLogRef.current = [
      createLogEntry("session-start", {
        sessionId: session.id,
        source,
        focusMode: focusModeRef.current,
        maxFocusPanels: clampFocusPanelLimit(maxFocusPanelsRef.current),
        minimumFocusScore: clampMinimumFocusScore(minimumFocusScoreRef.current),
        transcriptionBackend,
      }),
    ];
    setFocusLogEntries(focusLogRef.current);
    setLogSaveMessage("");
    setTranscriptParts([]);
    setMatches([]);
    segmentSequenceRef.current = 0;
    setTopicSummary("Waiting for a stable discussion topic.");
    setFocusDecision(null);
    lastFocusedSignatureRef.current = "";
  }

  function queueVoiceFocusSessionFinish() {
    if (recordingRequestedRef.current || !activeSessionRef.current) {
      return;
    }
    window.setTimeout(() => {
      if (!recordingRequestedRef.current && pendingTranscriptionsRef.current === 0) {
        finishVoiceFocusSession();
      } else {
        queueVoiceFocusSessionFinish();
      }
    }, 600);
  }

  function finishVoiceFocusSession() {
    const session = activeSessionRef.current;
    if (!session) {
      return;
    }
    appendLog("session-stop", {
      sessionId: session.id,
      focusMode: focusModeRef.current,
    });
    const entries = [...focusLogRef.current];
    const readableEntries = groupFocusLogEntries(entries);
    activeSessionRef.current = null;
    saveVoiceFocusLog(serviceUrl, session, entries, readableEntries)
      .then((result) => {
        setLogSaveMessage(result?.readablePath ? `Saved readable log: ${result.readablePath}` : result?.path ? `Saved log: ${result.path}` : "Saved voice focus log.");
      })
      .catch((error) => {
        setLogSaveMessage(`Log save failed: ${error.message}`);
      });
  }

  function appendLog(type, payload) {
    const entry = createLogEntry(type, payload);
    focusLogRef.current = [...focusLogRef.current, entry];
    setFocusLogEntries(visibleLogEntries(focusLogRef.current));
  }

  async function requestFocusJudge(semanticUpdate, nextTranscript, maxPanelCount) {
    const response = await fetch(`${serviceUrl}/focus-decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationSummary: semanticUpdate.state.summary,
        recentTranscript: nextTranscript,
        currentPanelIds: focusStateRef.current.selectedPanelIds,
        maxSelectedCharts: maxPanelCount,
        candidateCharts: semanticUpdate.candidates.map((match) => ({
          panelId: match.panelId,
          title: match.title,
          pageLabel: match.pageLabel,
          sectionTitle: match.sectionTitle,
          score: match.score,
          reason: match.reason,
          matchedTerms: match.matchedTerms,
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  }

  return (
    <section className={`voice-focus-control voice-focus-${serviceState}`} aria-label="Voice-guided chart focus">
      <div className="voice-focus-main">
        <div>
          <p className="eyebrow">Voice focus</p>
          <h2>Discussion-guided charts</h2>
          <p>{statusMessage}</p>
        </div>
        <div className="voice-focus-actions">
          <button type="button" onClick={toggleRecording} disabled={serviceState !== "available"}>
            {recording ? (replayActive ? "Stop replay" : "Stop mic") : "Start mic"}
          </button>
          <label className="voice-focus-toggle">
            <input
              type="checkbox"
              checked={autoFocus}
              onChange={(event) => setAutoFocus(event.target.checked)}
            />
            Auto focus
          </label>
          <button type="button" className="secondary" disabled={matches.length === 0} onClick={focusCurrentMatches}>
            Focus charts
          </button>
          <button type="button" className="secondary" disabled={transcriptParts.length === 0} onClick={clearTranscript}>
            Clear
          </button>
        </div>
      </div>
      <div className="voice-focus-details">
        <details className="voice-capture-settings">
          <summary>Audio capture settings</summary>
          <div className="voice-capture-grid">
            <label className="voice-capture-field">
              Transcription
              <select
                value={transcriptionBackend}
                onChange={(event) => setTranscriptionBackend(event.target.value)}
              >
                <option value="whisper">Local Whisper</option>
                <option value="gemini">Gemini online</option>
              </select>
            </label>
            <label className="voice-capture-field">
              Focus mode
              <select
                value={focusMode}
                onChange={(event) => setFocusMode(event.target.value)}
                disabled={recording}
              >
                <option value="semantic">Semantic controller</option>
                <option value="llm">LLM chart judge</option>
              </select>
            </label>
            <label className="voice-capture-field">
              Max focus charts
              <select
                value={maxFocusPanels}
                onChange={(event) => setMaxFocusPanels(event.target.value)}
              >
                <option value="1">1 chart</option>
                <option value="2">2 charts</option>
                <option value="3">3 charts</option>
                <option value="4">4 charts</option>
              </select>
            </label>
            <label className="voice-capture-field">
              Selection threshold
              <input
                type="number"
                min="0.2"
                max="10"
                step="0.1"
                value={minimumFocusScore}
                onChange={(event) => setMinimumFocusScore(event.target.value)}
                onBlur={(event) => setMinimumFocusScore(String(clampMinimumFocusScore(event.target.value).toFixed(1)))}
              />
            </label>
            <label className="voice-capture-field voice-capture-device">
              Microphone
              <span>
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  disabled={recording}
                >
                  <option value="">Browser default</option>
                  {audioDevices.map((device, index) => (
                    <option key={device.deviceId || index} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
                <button type="button" className="secondary" onClick={refreshAudioDevices} disabled={recording}>
                  Refresh
                </button>
              </span>
            </label>
            <label className="voice-capture-toggle">
              <input
                type="checkbox"
                checked={captureSettings.echoCancellation}
                onChange={(event) => updateCaptureSetting("echoCancellation", event.target.checked)}
                disabled={recording}
              />
              Echo cancellation
            </label>
            <label className="voice-capture-toggle">
              <input
                type="checkbox"
                checked={captureSettings.noiseSuppression}
                onChange={(event) => updateCaptureSetting("noiseSuppression", event.target.checked)}
                disabled={recording}
              />
              Noise suppression
            </label>
            <label className="voice-capture-toggle">
              <input
                type="checkbox"
                checked={captureSettings.autoGainControl}
                onChange={(event) => updateCaptureSetting("autoGainControl", event.target.checked)}
                disabled={recording}
              />
              Auto gain
            </label>
            <label className="voice-capture-field">
              Bitrate
              <select
                value={captureSettings.audioBitsPerSecond}
                onChange={(event) => updateCaptureSetting("audioBitsPerSecond", event.target.value)}
              >
                <option value="64000">64 kbps</option>
                <option value="96000">96 kbps</option>
                <option value="128000">128 kbps</option>
                <option value="192000">192 kbps</option>
              </select>
            </label>
            <label className="voice-capture-field">
              Segment length
              <select
                value={captureSettings.segmentSeconds}
                onChange={(event) => updateCaptureSetting("segmentSeconds", event.target.value)}
              >
                <option value="5">5 seconds</option>
                <option value="8">8 seconds</option>
                <option value="12">12 seconds</option>
                <option value="16">16 seconds</option>
              </select>
            </label>
            <label className="voice-capture-field">
              Sample rate hint
              <select
                value={captureSettings.sampleRate}
                onChange={(event) => updateCaptureSetting("sampleRate", event.target.value)}
                disabled={recording}
              >
                <option value="">Browser default</option>
                <option value="16000">16 kHz</option>
                <option value="44100">44.1 kHz</option>
                <option value="48000">48 kHz</option>
              </select>
            </label>
            <label className="voice-capture-field">
              Channels
              <select
                value={captureSettings.channelCount}
                onChange={(event) => updateCaptureSetting("channelCount", event.target.value)}
                disabled={recording}
              >
                <option value="">Browser default</option>
                <option value="1">Mono</option>
                <option value="2">Stereo</option>
              </select>
            </label>
          </div>
          <p className="voice-capture-note">
            Microphone, processing, sample rate, and channel changes apply after restarting the mic. Bitrate, segment length, and transcription backend apply to the next segment.
            Gemini sends audio segments to Google through the local voice service and requires GEMINI_API_KEY.
          </p>
        </details>
        <details className="voice-replay-settings">
          <summary>Test with recording</summary>
          <div className="voice-replay-grid">
            <label className="voice-capture-field voice-replay-file">
              Session recording
              <input
                type="file"
                accept="audio/*,video/*"
                disabled={recording}
                onChange={(event) => setReplayFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={startReplay}
              disabled={!replayFile || recording || serviceState !== "available"}
            >
              Start replay
            </button>
            <button type="button" className="secondary" onClick={stopRecording} disabled={!replayActive}>
              Stop replay
            </button>
          </div>
          <p className="voice-capture-note">
            Replays a local recording through the same segmenting, transcription, matching, logging, and focus overlay path as the microphone. Current segment length, backend, and focus mode settings apply.
            {replayFile ? ` Selected: ${replayFile.name}` : ""}
          </p>
        </details>
        <div className="voice-segment-debug" aria-label="Voice segment diagnostics">
          <div className={`voice-segment-indicator segment-${segmentState}`}>
            <span />
            {segmentStatusText(segmentState)}
          </div>
          <div className="voice-segment-counts">
            <span>Recorded {segmentStats.recorded}</span>
            <span>Sent {segmentStats.sent}</span>
            <span>Active {activeSegmentCount}</span>
            <span>Done {segmentStats.completed}</span>
            <span>Failed {segmentStats.failed}</span>
          </div>
          <div className="voice-audio-playback">
            {lastAudioUrl ? (
              <>
                <audio controls src={lastAudioUrl} />
                <small>
                  Last segment: {lastAudioMeta?.durationSeconds}s, {lastAudioMeta?.sizeKb} KB, {lastAudioMeta?.bitrateKbps} kbps, {lastAudioMeta?.recordedAt}
                  {lastAudioMeta?.micLabel ? `, ${lastAudioMeta.micLabel}` : ""}
                </small>
              </>
            ) : (
              <small>No audio segment recorded yet.</small>
            )}
          </div>
        </div>
        <p className="voice-transcript-preview">
          {transcriptText || "Transcript preview will appear here while the mic is active."}
        </p>
        <div className="voice-topic-state">
          <div>
            <strong>Topic summary</strong>
            <span>{topicSummary}</span>
          </div>
          <div>
            <strong>Last decision</strong>
            <span>
              {focusDecision
                ? `${focusDecision.action}: ${focusDecision.reason}`
                : "No chart focus decision yet."}
            </span>
          </div>
        </div>
        <div className="voice-match-list">
          {matches.length === 0 ? (
            <span>No chart matches yet.</span>
          ) : (
            matches.map((match) => (
              <article className="voice-match-card" key={match.panelId}>
                <div>
                  <strong>{match.title}</strong>
                  <small>{match.pageLabel} / {match.sectionTitle} / {match.confidence}</small>
                  <span>{match.reason}</span>
                </div>
                <div className="voice-feedback-actions">
                  <button type="button" className="secondary" onClick={() => submitFeedback(match, "up")}>Up</button>
                  <button type="button" className="secondary" onClick={() => submitFeedback(match, "down")}>Down</button>
                </div>
              </article>
            ))
          )}
        </div>
        <button type="button" className="secondary voice-reset-button" onClick={resetFeedback} disabled={feedbackRecords.length === 0}>
          Reset voice learning
        </button>
        <details className="voice-keyword-editor">
          <summary>Chart matching keywords</summary>
          <div className="voice-keyword-editor-grid">
            <label className="voice-capture-field">
              Chart or panel
              <select
                value={selectedKeywordPanel?.panelId ?? ""}
                onChange={(event) => setSelectedKeywordPanelId(event.target.value)}
              >
                {chartIndex.map((record) => (
                  <option key={record.panelId} value={record.panelId}>
                    {record.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="voice-capture-field voice-keyword-input">
              Add keyword or phrase
              <span>
                <input
                  type="text"
                  value={keywordDraft}
                  onChange={(event) => setKeywordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addKeywordsToSelectedPanel();
                    }
                  }}
                  placeholder="e.g. intensive care pressure"
                />
                <button type="button" className="secondary" onClick={addKeywordsToSelectedPanel} disabled={!keywordDraft.trim()}>
                  Add
                </button>
              </span>
            </label>
          </div>
          {selectedKeywordPanel ? (
            <div className="voice-keyword-panel">
              <div>
                <strong>{selectedKeywordPanel.title}</strong>
                <small>{selectedKeywordPanel.pageLabel} / {selectedKeywordPanel.sectionTitle}</small>
              </div>
              <KeywordList
                title="Active default keywords"
                keywords={selectedKeywordPanelView?.defaultKeywords}
                emptyText="No default keywords."
                onRemove={(keyword) => removeKeywordFromSelectedPanel(keyword, true)}
              />
              <KeywordList
                title="Added test keywords"
                keywords={selectedKeywordPanelView?.addedKeywords}
                emptyText="No local keywords added."
                onRemove={(keyword) => removeKeywordFromSelectedPanel(keyword, false)}
              />
              <KeywordList
                title="Removed default keywords"
                keywords={selectedKeywordPanelView?.removedKeywords}
                emptyText="No default keywords removed."
                actionLabel="Restore"
                onRemove={restoreKeywordToSelectedPanel}
              />
            </div>
          ) : (
            <p className="voice-capture-note">No selectable charts found.</p>
          )}
          <div className="voice-keyword-footer">
            <p className="voice-capture-note">
              Keyword edits are stored in this browser and immediately affect voice matching. They do not change the dashboard config file.
            </p>
            <button type="button" className="secondary" onClick={resetKeywordOverrides} disabled={Object.keys(keywordOverrides).length === 0}>
              Reset keyword edits
            </button>
          </div>
        </details>
        <details className="voice-focus-log" open>
          <summary>Focus log</summary>
          <div>
            {focusLogEntries.length === 0 ? (
              <span>No focus log entries yet.</span>
            ) : (
              groupedFocusLog.map((group) => (
                group.kind === "segment"
                  ? <SegmentLogCard key={group.segmentId} group={group} />
                  : <SessionLogCard key={`${group.at}-${group.type}`} entry={group} />
              ))
            )}
          </div>
          {logSaveMessage ? <p>{logSaveMessage}</p> : null}
        </details>
      </div>
    </section>
  );
}

function KeywordList({ title, keywords = [], emptyText, actionLabel = "Remove", onRemove }) {
  return (
    <div className="voice-keyword-list">
      <strong>{title}</strong>
      {keywords.length === 0 ? (
        <span>{emptyText}</span>
      ) : (
        <div>
          {keywords.map((keyword) => (
            <button type="button" className="voice-keyword-chip" key={keyword} onClick={() => onRemove(keyword)}>
              <span>{keyword}</span>
              <small>{actionLabel}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SegmentLogCard({ group }) {
  const segment = group.segment ?? {};
  const transcript = group.transcript?.text ?? group.response?.textPreview ?? "";
  const topicTerms = group.topic?.topicTerms ?? group.embedding?.terms ?? [];
  const candidates = group.candidates?.candidates ?? group.embedding?.candidateScores ?? [];
  const decision = group.decision;
  return (
    <article className="voice-log-segment">
      <header>
        <div>
          <strong>{segmentLabel(group.segmentId)}</strong>
          <small>{formatLocalTime(segment.recordedAt ?? group.at)}{segment.source ? ` / ${segment.source}` : ""}</small>
        </div>
        <span>{group.error ? "Transcription error" : decision?.action ?? "Processing"}</span>
      </header>
      <dl className="voice-log-metadata">
        <div>
          <dt>Backend</dt>
          <dd>{group.request?.transcriptionBackend ?? group.transcript?.transcriptionBackend ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{segment.durationSeconds ?? "-"}s / {segment.sizeKb ?? group.request?.sizeKb ?? "-"} KB</dd>
        </div>
        <div>
          <dt>Focus action</dt>
          <dd>{decision?.action ?? "No decision yet"}</dd>
        </div>
      </dl>
      <section>
        <h3>Transcript</h3>
        <p>{transcript || group.error?.message || "No transcript yet."}</p>
      </section>
      <section>
        <h3>Topic summary</h3>
        <p>{group.topic?.summary ?? "No topic update yet."}</p>
        <ChipRow values={topicTerms} emptyText="No topic terms yet." />
      </section>
      <section>
        <h3>Embedding</h3>
        <p>{group.embedding?.model ?? "No embedding update yet."}</p>
        <ChipRow values={group.embedding?.terms} emptyText="No embedding terms yet." />
      </section>
      <section>
        <h3>Potential matches</h3>
        <PanelCandidateList candidates={candidates} />
      </section>
      <section>
        <h3>Decision</h3>
        {decision ? (
          <>
            <p>{decision.reason}</p>
            <ChipRow values={decision.panelIds} emptyText="No panels selected." />
          </>
        ) : (
          <p>No chart focus decision yet.</p>
        )}
      </section>
      {group.llmRequest || group.llmResponse || group.llmError ? (
        <section>
          <h3>LLM judge</h3>
          <p>{group.llmError?.message ?? group.llmResponse?.reason ?? "Request sent to chart judge."}</p>
          <ChipRow values={group.llmRequest?.candidatePanelIds ?? group.llmResponse?.selectedPanelIds} emptyText="No LLM panel list recorded." />
        </section>
      ) : null}
      <details>
        <summary>Raw events</summary>
        <pre>{JSON.stringify(group.entries.map(logEntryPreview), null, 2)}</pre>
      </details>
    </article>
  );
}

function SessionLogCard({ entry }) {
  return (
    <article className="voice-log-session">
      <strong>{entry.type}</strong>
      <small>{formatLocalTime(entry.at)}</small>
      <span>{sessionLogSummary(entry)}</span>
    </article>
  );
}

function ChipRow({ values = [], emptyText }) {
  const cleanValues = [...new Set((values ?? []).map(String).filter(Boolean))];
  if (cleanValues.length === 0) {
    return <span className="voice-log-empty">{emptyText}</span>;
  }
  return (
    <div className="voice-log-chips">
      {cleanValues.map((value) => <span key={value}>{value}</span>)}
    </div>
  );
}

function PanelCandidateList({ candidates = [] }) {
  if (!candidates.length) {
    return <span className="voice-log-empty">No candidate panels yet.</span>;
  }
  return (
    <div className="voice-log-candidates">
      {candidates.slice(0, 8).map((candidate) => (
        <div key={candidate.panelId}>
          <strong>{candidate.title ?? candidate.panelId}</strong>
          <small>
            {candidate.panelId} / score {candidate.score ?? "-"}{candidate.confidence ? ` / ${candidate.confidence}` : ""}
          </small>
          <span>{candidate.reason ?? formatMatchedTerms(candidate.matchedTerms)}</span>
        </div>
      ))}
    </div>
  );
}

function recorderOptions(captureSettings) {
  const mimeType = "audio/webm;codecs=opus";
  const options = {
    audioBitsPerSecond: Number(captureSettings.audioBitsPerSecond) || 128000,
  };
  if (MediaRecorder.isTypeSupported?.(mimeType)) {
    options.mimeType = mimeType;
  }
  return options;
}

function audioConstraints(deviceId, captureSettings) {
  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: captureSettings.echoCancellation,
    noiseSuppression: captureSettings.noiseSuppression,
    autoGainControl: captureSettings.autoGainControl,
    channelCount: numberConstraint(captureSettings.channelCount),
    sampleRate: numberConstraint(captureSettings.sampleRate),
  };
}

function numberConstraint(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? { ideal: number } : undefined;
}

function segmentDurationMs(captureSettings) {
  const seconds = Number(captureSettings.segmentSeconds);
  return Math.max(3, Math.min(30, Number.isFinite(seconds) ? seconds : SEGMENT_DURATION_MS / 1000)) * 1000;
}

function selectedMicLabel(audioDevices, selectedDeviceId) {
  if (!selectedDeviceId) {
    return "Browser default microphone";
  }
  const device = audioDevices.find((candidate) => candidate.deviceId === selectedDeviceId);
  return device?.label ?? "Selected microphone";
}

function segmentStatusText(segmentState) {
  if (segmentState === "recording") {
    return "Recording segment";
  }
  if (segmentState === "sending") {
    return "Sending segment";
  }
  if (segmentState === "transcribing") {
    return "Transcribing segment";
  }
  return "Idle";
}

function focusReason(matches, transcriptText, decision, topicSummary) {
  const terms = matches.flatMap((match) => match.matchedTerms).slice(0, 5);
  return {
    title: "Voice focus",
    detail: decision?.reason
      ?? (terms.length ? `Matched discussion terms: ${[...new Set(terms)].join(", ")}` : "Matched the recent discussion."),
    transcriptSnippet: transcriptText.slice(-280),
    topicSummary,
  };
}

function groupFocusLogEntries(entries, limit = 0) {
  const grouped = [];
  const segmentGroups = new Map();
  for (const entry of entries ?? []) {
    if (!entry.segmentId) {
      grouped.push({ kind: "session", ...entry });
      continue;
    }
    let group = segmentGroups.get(entry.segmentId);
    if (!group) {
      group = {
        kind: "segment",
        segmentId: entry.segmentId,
        at: entry.at,
        entries: [],
      };
      segmentGroups.set(entry.segmentId, group);
      grouped.push(group);
    }
    group.entries.push(entry);
    group.at = group.at ?? entry.at;
    if (entry.segment) {
      group.segment = entry.segment;
    }
    if (entry.type === "transcribe-request") {
      group.request = entry;
    }
    if (entry.type === "transcribe-response") {
      group.response = entry;
    }
    if (entry.type === "transcribe-error" || entry.type === "empty-transcript") {
      group.error = entry;
    }
    if (entry.type === "transcript") {
      group.transcript = entry;
    }
    if (entry.type === "topic") {
      group.topic = entry;
    }
    if (entry.type === "embedding") {
      group.embedding = entry;
    }
    if (entry.type === "candidates") {
      group.candidates = entry;
    }
    if (entry.type === "decision") {
      group.decision = entry;
    }
    if (entry.type === "llm-request") {
      group.llmRequest = entry;
    }
    if (entry.type === "llm-response") {
      group.llmResponse = entry;
    }
    if (entry.type === "llm-error") {
      group.llmError = entry;
    }
  }
  return limit > 0 ? grouped.slice(-limit) : grouped;
}

function segmentLabel(segmentId) {
  const number = String(segmentId ?? "").match(/\d+/)?.[0];
  return number ? `Audio segment ${number}` : "Audio segment";
}

function formatLocalTime(value) {
  if (!value) {
    return "Time not recorded";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString();
}

function formatMatchedTerms(terms = []) {
  return terms.length ? `Matched ${terms.join(", ")}` : "No matched terms recorded.";
}

function sessionLogSummary(entry) {
  if (entry.type === "session-start") {
    return `Session started in ${entry.focusMode ?? entry.mode ?? "unknown"} mode with ${entry.maxFocusPanels ?? "-"} max focus charts.`;
  }
  if (entry.type === "session-stop") {
    return "Session stopped; log save will run after pending transcriptions finish.";
  }
  if (entry.type === "replay-start") {
    return `Replay file: ${entry.fileName ?? "unknown file"}.`;
  }
  return JSON.stringify(logEntryPreview(entry));
}

function logEntryPreview(entry) {
  const { at, ...preview } = entry;
  if (preview.rollingTranscript && preview.rollingTranscript.length > 260) {
    preview.rollingTranscript = `${preview.rollingTranscript.slice(-260)}`;
  }
  if (preview.text && preview.text.length > 260) {
    preview.text = `${preview.text.slice(0, 260)}...`;
  }
  if (preview.rawText && preview.rawText.length > 320) {
    preview.rawText = `${preview.rawText.slice(0, 320)}...`;
  }
  return preview;
}

async function checkServiceHealth(serviceUrl) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Voice service is not healthy.");
    }
    return response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

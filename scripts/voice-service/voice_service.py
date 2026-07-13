from __future__ import annotations

import base64
import json
import os
import threading
import tempfile
import urllib.error
import urllib.request
import wave
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.getenv("SIMEX_VOICE_HOST", "127.0.0.1")
PORT = int(os.getenv("SIMEX_VOICE_PORT", "8766"))
TRANSCRIPTION_BACKEND = os.getenv("SIMEX_TRANSCRIPTION_BACKEND", "whisper").strip().lower()
VOICE_WARMUP = os.getenv("SIMEX_VOICE_WARMUP", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}
MODEL_NAME = os.getenv("SIMEX_WHISPER_MODEL", "small")
LANGUAGE = os.getenv("SIMEX_WHISPER_LANGUAGE", "")
BEAM_SIZE = int(os.getenv("SIMEX_WHISPER_BEAM_SIZE", "5"))
VAD_FILTER = os.getenv("SIMEX_WHISPER_VAD_FILTER", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}
DOMAIN_PROMPT = os.getenv(
    "SIMEX_WHISPER_INITIAL_PROMPT",
    (
        "SimEx dashboard discussion about HeV-A26. Terms include ICU, hospital "
        "occupancy, test positivity, R-value, wastewater surveillance, "
        "vaccination, mortality, geographic spread, public trust, risk "
        "perception, adherence, wellbeing, loneliness, resilience, business "
        "closures, unemployment, absenteeism, ziekenhuisbezetting, "
        "positiviteitspercentage, rioolwater, vaccinatiegraad, vertrouwen, "
        "risicoperceptie, naleving, welzijn, eenzaamheid, veerkracht, "
        "werkloosheid, schoolverzuim, zorgverzuim."
    ),
)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("SIMEX_GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_ENDPOINT = os.getenv(
    "SIMEX_GEMINI_ENDPOINT",
    "https://generativelanguage.googleapis.com/v1beta/interactions",
)
GEMINI_PROMPT = os.getenv(
    "SIMEX_GEMINI_PROMPT",
    (
        "Generate a clean transcript of the speech in this short dashboard "
        "discussion audio segment. Keep biomedical, public health, economic, "
        "and Dutch terms as spoken. Return only the transcript text."
    ),
)
DEFAULT_VOICE_LOG_DIR = Path(__file__).resolve().parents[2] / "voice-logs"
VOICE_LOG_DIR = Path(os.getenv("SIMEX_VOICE_LOG_DIR", str(DEFAULT_VOICE_LOG_DIR)))
VOICE_READABLE_LOG_DIR = Path(
    os.getenv("SIMEX_VOICE_READABLE_LOG_DIR", str(VOICE_LOG_DIR / "readable"))
)
FOCUS_JUDGE_PROMPT = os.getenv(
    "SIMEX_FOCUS_JUDGE_PROMPT",
    (
        "You are choosing dashboard charts for a live SimEx simulation exercise. "
        "Use the rolling conversation summary and recent transcript. Prefer keeping "
        "current charts unless the topic has clearly shifted. Return only JSON."
    ),
)

_backend = None
_warmup_status = {
    "enabled": VOICE_WARMUP,
    "state": "pending" if VOICE_WARMUP else "disabled",
    "error": "",
}


class VoiceRequestHandler(BaseHTTPRequestHandler):
    server_version = "SimExVoiceService/0.1"

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(
                {
                    "ok": True,
                    "defaultBackend": TRANSCRIPTION_BACKEND,
                    "model": MODEL_NAME,
                    "beamSize": BEAM_SIZE,
                    "vadFilter": VAD_FILTER,
                    "geminiModel": GEMINI_MODEL,
                    "geminiConfigured": bool(GEMINI_API_KEY),
                    "voiceLogDir": str(VOICE_LOG_DIR),
                    "warmup": _warmup_status,
                }
            )
            return
        self._send_json({"error": "Not found"}, status=404)

    def do_POST(self) -> None:
        if self.path == "/transcribe":
            self._handle_transcribe()
            return
        if self.path == "/focus-decision":
            self._handle_focus_decision()
            return
        if self.path == "/voice-log":
            self._handle_voice_log()
            return
        self._send_json({"error": "Not found"}, status=404)

    def _handle_transcribe(self) -> None:
        try:
            audio_bytes, mime_type, requested_backend = self._read_audio_upload()
            text = transcribe_audio(audio_bytes, mime_type, requested_backend)
        except Exception as error:
            self._send_json({"error": str(error)}, status=503)
            return

        self._send_json({"text": text})

    def _handle_focus_decision(self) -> None:
        try:
            payload = self._read_json_body()
            decision = judge_focus_with_gemini(payload)
        except Exception as error:
            self._send_json({"error": str(error)}, status=503)
            return

        self._send_json(decision)

    def _handle_voice_log(self) -> None:
        try:
            payload = self._read_json_body()
            saved_path, readable_path = save_voice_log(payload)
        except Exception as error:
            self._send_json({"error": str(error)}, status=503)
            return

        self._send_json({"ok": True, "path": str(saved_path), "readablePath": str(readable_path)})

    def _read_json_body(self) -> dict:
        content_type = self.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            raise ValueError("Expected application/json request body.")
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        if not body:
            raise ValueError("Request body was empty.")
        return json.loads(body.decode("utf-8"))

    def log_message(self, format: str, *args) -> None:
        if os.getenv("SIMEX_VOICE_LOG", "0") == "1":
            super().log_message(format, *args)

    def _read_audio_upload(self) -> tuple[bytes, str, str | None]:
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        if content_type.startswith("audio/"):
            audio_bytes = body
            mime_type = content_type.split(";")[0]
            requested_backend = None
        else:
            audio_bytes, mime_type, fields = extract_multipart_upload(body, content_type)
            requested_backend = fields.get("backend")
        if not audio_bytes:
            raise ValueError("The uploaded audio chunk was empty.")
        return audio_bytes, mime_type or "audio/webm", requested_backend

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._send_common_headers()
        self.end_headers()

    def _send_common_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm", requested_backend: str | None = None) -> str:
    backend_name = normalize_backend_name(requested_backend or TRANSCRIPTION_BACKEND)
    if backend_name == "gemini":
        return transcribe_with_gemini(audio_bytes, mime_type).strip()

    backend = whisper_backend()
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as audio_file:
        audio_file.write(audio_bytes)
        audio_path = audio_file.name
    try:
        return backend(audio_path).strip()
    finally:
        try:
            os.remove(audio_path)
        except OSError:
            pass


def warmup_voice_backend() -> None:
    if not VOICE_WARMUP:
        return
    if normalize_backend_name(TRANSCRIPTION_BACKEND) != "whisper":
        _warmup_status.update({"state": "skipped", "error": ""})
        print("Voice warm-up skipped for non-Whisper default backend.")
        return

    _warmup_status.update({"state": "warming", "error": ""})
    print("Loading Whisper backend and running warm-up transcription...")
    try:
        backend = whisper_backend()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
            audio_path = audio_file.name
        write_silent_wav(audio_path)
        try:
            backend(audio_path)
        finally:
            try:
                os.remove(audio_path)
            except OSError:
                pass
        _warmup_status.update({"state": "ready", "error": ""})
        print("Voice service warmed up.")
    except Exception as error:
        _warmup_status.update({"state": "error", "error": str(error)})
        print(f"Voice warm-up failed: {error}")


def write_silent_wav(path: str, sample_rate: int = 16000, duration_seconds: float = 0.4) -> None:
    frame_count = int(sample_rate * duration_seconds)
    with wave.open(path, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00\x00" * frame_count)


def transcribe_with_gemini(audio_bytes: bytes, mime_type: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("Set GEMINI_API_KEY before using the Gemini transcription backend.")

    payload = {
        "model": GEMINI_MODEL,
        "input": [
            {"type": "text", "text": GEMINI_PROMPT},
            {
                "type": "audio",
                "data": base64.b64encode(audio_bytes).decode("ascii"),
                "mime_type": mime_type or "audio/webm",
            },
        ],
    }
    request = urllib.request.Request(
        GEMINI_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini transcription failed: {detail}") from error
    return extract_gemini_text(result)


def judge_focus_with_gemini(payload: dict) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("Set GEMINI_API_KEY before using the LLM chart judge.")

    max_selected_charts = clamp_int(payload.get("maxSelectedCharts", 2), 1, 4)
    prompt = {
        "instructions": FOCUS_JUDGE_PROMPT,
        "conversationSummary": payload.get("conversationSummary", ""),
        "recentTranscript": payload.get("recentTranscript", ""),
        "currentPanelIds": payload.get("currentPanelIds", []),
        "maxSelectedCharts": max_selected_charts,
        "candidateCharts": payload.get("candidateCharts", []),
        "responseShape": {
            "selectedPanelIds": ["chart-id", "chart-id"],
            "action": "keep | switch | replace_one | hold",
            "confidence": 0.0,
            "reason": "short explanation",
        },
    }
    result_text = call_gemini_text(
        f"Choose 1-{max_selected_charts} most relevant charts. Return only valid JSON.\n"
        + json.dumps(prompt, ensure_ascii=False)
    )
    decision = extract_json_object(result_text)
    panel_ids = decision.get("selectedPanelIds", [])
    if not isinstance(panel_ids, list):
        panel_ids = []
    return {
        "selectedPanelIds": [str(panel_id) for panel_id in panel_ids[:max_selected_charts]],
        "action": str(decision.get("action", "switch")),
        "confidence": float(decision.get("confidence", 0)),
        "reason": str(decision.get("reason", "Gemini selected charts from rolling context.")),
        "rawText": result_text,
    }


def clamp_int(value: object, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = minimum
    return max(minimum, min(maximum, number))


def call_gemini_text(prompt: str) -> str:
    payload = {
        "model": GEMINI_MODEL,
        "input": [
            {"type": "text", "text": prompt},
        ],
    }
    request = urllib.request.Request(
        GEMINI_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini focus judge failed: {detail}") from error
    return extract_gemini_text(result)


def extract_json_object(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError("LLM chart judge did not return a JSON object.")
    return json.loads(text[start : end + 1])


def save_voice_log(payload: dict) -> tuple[Path, Path]:
    session = payload.get("session") or {}
    session_id = safe_filename(str(session.get("id") or "voice-focus-log"))
    VOICE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    VOICE_READABLE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    saved_path = VOICE_LOG_DIR / f"{session_id}.json"
    readable_path = VOICE_READABLE_LOG_DIR / f"{session_id}.md"
    saved_payload = {
        "session": session,
        "stoppedAt": payload.get("stoppedAt"),
        "entries": payload.get("entries", []),
        "readableEntries": payload.get("readableEntries", []),
    }
    saved_path.write_text(json.dumps(saved_payload, indent=2, ensure_ascii=False), encoding="utf-8")
    readable_path.write_text(render_readable_voice_log(saved_payload), encoding="utf-8")
    return saved_path, readable_path


def render_readable_voice_log(payload: dict) -> str:
    session = payload.get("session") or {}
    readable_entries = payload.get("readableEntries") or []
    lines = [
        f"# Voice Focus Log: {session.get('id', 'unknown session')}",
        "",
        f"- Started: {session.get('startedAt', 'unknown')}",
        f"- Stopped: {payload.get('stoppedAt', 'unknown')}",
        f"- Mode: {session.get('mode', 'unknown')}",
        "",
    ]
    for entry in readable_entries:
        if entry.get("kind") == "segment":
            lines.extend(render_segment_log(entry))
        else:
            lines.extend(render_session_log(entry))
    return "\n".join(lines).rstrip() + "\n"


def render_segment_log(group: dict) -> list[str]:
    segment = group.get("segment") or {}
    transcript = (group.get("transcript") or {}).get("text") or (group.get("response") or {}).get("textPreview") or ""
    topic = group.get("topic") or {}
    embedding = group.get("embedding") or {}
    candidates = (group.get("candidates") or {}).get("candidates") or embedding.get("candidateScores") or []
    decision = group.get("decision") or {}
    error = group.get("error") or {}
    lines = [
        f"## {segment_label(group.get('segmentId'))}",
        "",
        f"- Recorded: {segment.get('recordedAt') or group.get('at') or 'unknown'}",
        f"- Source: {segment.get('source', 'unknown')}",
        f"- Audio: {segment.get('durationSeconds', '-')}s, {segment.get('sizeKb', '-')} KB, {segment.get('mimeType', 'unknown type')}",
        f"- Backend: {(group.get('request') or group.get('transcript') or {}).get('transcriptionBackend', 'unknown')}",
        f"- Focus action: {decision.get('action', 'none')}",
        "",
        "### Transcript",
        "",
        transcript or error.get("message") or "No transcript was recorded.",
        "",
        "### Topic Summary",
        "",
        topic.get("summary") or "No topic update was recorded.",
        "",
        f"- Topic terms: {join_list(topic.get('topicTerms') or embedding.get('terms'))}",
        "",
        "### Embedding",
        "",
        f"- Model: {embedding.get('model', 'not recorded')}",
        f"- Terms: {join_list(embedding.get('terms'))}",
        "",
        "### Potential Panel Matches",
        "",
    ]
    if candidates:
        for candidate in candidates[:8]:
            lines.append(
                f"- {candidate.get('title') or candidate.get('panelId', 'unknown panel')} "
                f"({candidate.get('panelId', 'no id')}): score {candidate.get('score', '-')}; "
                f"matched {join_list(candidate.get('matchedTerms'))}"
            )
    else:
        lines.append("- No candidate panels recorded.")
    lines.extend([
        "",
        "### Decision",
        "",
        f"- Selected panels: {join_list(decision.get('panelIds'))}",
        f"- Reason: {decision.get('reason', 'No decision recorded.')}",
        "",
    ])
    if group.get("llmRequest") or group.get("llmResponse") or group.get("llmError"):
        llm_response = group.get("llmResponse") or {}
        llm_error = group.get("llmError") or {}
        lines.extend([
            "### LLM Judge",
            "",
            f"- Candidate panels: {join_list((group.get('llmRequest') or {}).get('candidatePanelIds'))}",
            f"- Selected panels: {join_list(llm_response.get('selectedPanelIds'))}",
            f"- Result: {llm_error.get('message') or llm_response.get('reason') or 'Request sent.'}",
            "",
        ])
    return lines


def render_session_log(entry: dict) -> list[str]:
    return [
        f"## {entry.get('type', 'session-event')}",
        "",
        f"- Time: {entry.get('at', 'unknown')}",
        f"- Details: {json.dumps({k: v for k, v in entry.items() if k not in {'kind', 'at'}}, ensure_ascii=False)}",
        "",
    ]


def segment_label(segment_id: object) -> str:
    text = str(segment_id or "Audio segment")
    digits = "".join(character for character in text if character.isdigit())
    return f"Audio segment {digits}" if digits else "Audio segment"


def join_list(values: object) -> str:
    if not isinstance(values, list) or not values:
        return "none"
    return ", ".join(str(value) for value in values if value)


def safe_filename(value: str) -> str:
    safe = "".join(character if character.isalnum() or character in {"-", "_"} else "-" for character in value)
    return safe.strip("-") or "voice-focus-log"


def extract_gemini_text(result: dict) -> str:
    output_text = result.get("output_text")
    if isinstance(output_text, str):
        return output_text

    output = result.get("output")
    if isinstance(output, list):
        fragments = []
        for item in output:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    fragments.append(text)
        if fragments:
            return " ".join(fragments)

    candidates = result.get("candidates")
    if isinstance(candidates, list):
        fragments = []
        for candidate in candidates:
            parts = candidate.get("content", {}).get("parts", []) if isinstance(candidate, dict) else []
            for part in parts:
                text = part.get("text") if isinstance(part, dict) else None
                if isinstance(text, str):
                    fragments.append(text)
        if fragments:
            return " ".join(fragments)

    raise RuntimeError("Gemini response did not include transcript text.")


def normalize_backend_name(value: str) -> str:
    backend_name = value.strip().lower().replace("-", "_")
    if backend_name in {"gemini", "online", "online_llm"}:
        return "gemini"
    return "whisper"


def extract_multipart_upload(body: bytes, content_type: str) -> tuple[bytes, str, dict[str, str]]:
    boundary = multipart_boundary(content_type)
    if not boundary:
        raise ValueError("Multipart audio upload is missing a boundary.")

    fields = {}
    audio_bytes = b""
    mime_type = "audio/webm"
    marker = b"--" + boundary
    for part in body.split(marker):
        headers_blob, separator, payload = part.partition(b"\r\n\r\n")
        if not separator:
            continue
        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        headers = headers_blob.decode("utf-8", errors="replace").splitlines()
        disposition = next((header for header in headers if header.lower().startswith("content-disposition:")), "")
        name = multipart_header_value(disposition, "name")
        if not name:
            continue
        if name == "audio":
            audio_bytes = payload
            content_type_header = next(
                (header for header in headers if header.lower().startswith("content-type:")),
                "",
            )
            if ":" in content_type_header:
                mime_type = content_type_header.split(":", 1)[1].strip().split(";")[0]
        else:
            fields[name] = payload.decode("utf-8", errors="replace").strip()
    if not audio_bytes:
        raise ValueError("No audio upload named 'audio' was provided.")
    return audio_bytes, mime_type, fields


def multipart_header_value(header: str, key: str) -> str | None:
    needle = f'{key}="'
    if needle not in header:
        return None
    return header.split(needle, 1)[1].split('"', 1)[0]


def multipart_boundary(content_type: str) -> bytes | None:
    for item in content_type.split(";"):
        item = item.strip()
        if item.startswith("boundary="):
            boundary = item.removeprefix("boundary=").strip('"')
            return boundary.encode("utf-8")
    return None


def whisper_backend():
    global _backend
    if _backend is not None:
        return _backend

    try:
        from faster_whisper import WhisperModel

        device = os.getenv("SIMEX_WHISPER_DEVICE", "cpu")
        compute_type = os.getenv("SIMEX_WHISPER_COMPUTE_TYPE", "int8")
        model = WhisperModel(MODEL_NAME, device=device, compute_type=compute_type)

        def transcribe(path: str) -> str:
            segments, _ = model.transcribe(
                path,
                language=LANGUAGE or None,
                beam_size=BEAM_SIZE,
                vad_filter=VAD_FILTER,
                initial_prompt=DOMAIN_PROMPT,
            )
            return " ".join(segment.text for segment in segments)

        _backend = transcribe
        return _backend
    except ImportError:
        pass

    try:
        import whisper

        model = whisper.load_model(MODEL_NAME)

        def transcribe(path: str) -> str:
            result = model.transcribe(
                path,
                language=LANGUAGE or None,
                beam_size=BEAM_SIZE,
                initial_prompt=DOMAIN_PROMPT,
            )
            return str(result.get("text", ""))

        _backend = transcribe
        return _backend
    except ImportError as error:
        raise RuntimeError(
            "Install faster-whisper or openai-whisper in the Python environment "
            "used for the SimEx voice service."
        ) from error


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), VoiceRequestHandler)
    print(f"SimEx voice service listening on http://{HOST}:{PORT}")
    print(f"Whisper model: {MODEL_NAME}")
    print(f"Warm-up: {'enabled' if VOICE_WARMUP else 'disabled'}")
    print(f"Voice logs: {VOICE_LOG_DIR}")
    threading.Thread(target=warmup_voice_backend, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()

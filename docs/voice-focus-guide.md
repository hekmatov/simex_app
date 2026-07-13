# Voice Focus Guide

Voice Focus adds a browser microphone assistant to SimEx Dashboard V2. It records short audio segments, transcribes them through the localhost voice service, tracks the rolling discussion topic, and can automatically open the most relevant 1-4 charts in the existing fullscreen focus overlay.

## Feature Summary

- Browser microphone capture with explicit start and stop.
- Optional local Whisper transcription through `scripts/voice-service/voice_service.py`.
- Optional Gemini transcription and LLM chart judge modes through the same local service.
- Rolling semantic focus controller that keeps conversation memory and avoids switching charts on a single weak segment.
- Feedback buttons for chart picks.
- Human-readable live focus log in the dashboard, grouped by audio segment.
- Automatic raw JSON and readable Markdown session log saving when the mic is stopped.
- Configurable model warm-up so the first real transcription is not delayed by model loading.

## Dashboard Controls

The Voice Focus panel is hidden by default. Open it with the microphone button in the dashboard header, next to the edit-mode button.

Inside the panel:

- `Start mic`: starts recording audio segments.
- `Stop mic`: stops recording and saves the current voice focus log.
- `Auto focus`: automatically opens the chart focus overlay when the controller chooses charts.
- `Focus charts`: manually opens the currently selected chart matches.
- `Transcription`: chooses `Local Whisper` or `Gemini online`.
- `Focus mode`: chooses `Semantic controller` or `LLM chart judge`.
- `Selection threshold`: sets the minimum chart-match score needed before a chart can be selected. Raise it when weak matches are selected; lower it when expected charts are missed.
- `Audio capture settings`: controls browser-side audio capture.
- `Focus log`: shows each audio segment with its transcript, topic summary, embedding terms, candidate chart scores, decisions, and errors.
- `Chart matching keywords`: adds or removes browser-local keywords for panel matching tests.

## Recommended Local Launch

From a new PowerShell window:

```powershell
cd "C:\Users\hekma\Documents\SimEx Dashboard\simex-dashboard-v2"
.\.voice-venv\Scripts\Activate.ps1

$env:SIMEX_WHISPER_MODEL="small"
$env:SIMEX_WHISPER_DEVICE="cuda"
$env:SIMEX_WHISPER_COMPUTE_TYPE="float16"
$env:SIMEX_WHISPER_BEAM_SIZE="1"
$env:SIMEX_WHISPER_VAD_FILTER="0"
$env:SIMEX_VOICE_WARMUP="1"

python scripts/voice-service/voice_service.py
```

Use this first for low-latency live testing. If it works well, try `medium` and beam size `3`.

## Stable CPU Fallback

Use this when CUDA is not working or when `float16` gives a backend error:

```powershell
cd "C:\Users\hekma\Documents\SimEx Dashboard\simex-dashboard-v2"
.\.voice-venv\Scripts\Activate.ps1

$env:SIMEX_WHISPER_MODEL="small"
$env:SIMEX_WHISPER_DEVICE="cpu"
$env:SIMEX_WHISPER_COMPUTE_TYPE="int8"
$env:SIMEX_WHISPER_BEAM_SIZE="5"
$env:SIMEX_WHISPER_VAD_FILTER="1"
$env:SIMEX_VOICE_WARMUP="1"

python scripts/voice-service/voice_service.py
```

CPU is usually much slower than CUDA, especially for `medium` and `large-v3`.

## Higher Quality Local Preset

Use this when quality matters more than latency:

```powershell
$env:SIMEX_WHISPER_MODEL="medium"
$env:SIMEX_WHISPER_DEVICE="cuda"
$env:SIMEX_WHISPER_COMPUTE_TYPE="float16"
$env:SIMEX_WHISPER_BEAM_SIZE="3"
$env:SIMEX_WHISPER_VAD_FILTER="1"
```

Avoid `large-v3` with high beam sizes for live discussion unless your GPU can keep up comfortably.

## Warm-Up

The voice service warms up Whisper by default:

```powershell
$env:SIMEX_VOICE_WARMUP="1"
```

Warm-up loads the Whisper backend and runs one tiny silent transcription when the service starts. This shifts the slow first transcription from the first real mic segment to the service startup period.

Disable warm-up:

```powershell
$env:SIMEX_VOICE_WARMUP="0"
```

The service prints warm-up status in PowerShell:

```text
Warm-up: enabled
Loading Whisper backend and running warm-up transcription...
Voice service warmed up.
```

The `/health` endpoint also exposes warm-up status, and the dashboard shows a warming-up message while the model is still loading.

## Focus Modes

### Semantic Controller

This is the recommended default. It runs locally in the browser after transcription.

The controller:

- Keeps recent transcript segments.
- Extracts chart-aware phrases from the rolling discussion first, such as `risk perception`, then backfills with uncommon single-word terms.
- Scores chart metadata, aliases, and fields.
- Applies feedback boosts or penalties.
- Holds the current focus unless a new topic is clearly stronger.

Use this mode when privacy and responsiveness matter most.

### LLM Chart Judge

This mode still uses the semantic controller first, but then asks Gemini to choose the final 1-4 charts from a compact candidate list.

Use this mode when you want more context-aware chart choices and sending the transcript context to Gemini is acceptable.

Required:

```powershell
$env:GEMINI_API_KEY="your-api-key"
$env:SIMEX_GEMINI_MODEL="gemini-3.5-flash"
```

## Transcription Modes

### Local Whisper

Audio stays on the machine and is transcribed by faster-whisper or openai-whisper.

### Gemini Online

Audio segments are sent from the localhost service to Google Gemini for transcription. The browser still only talks to `127.0.0.1`, but the service sends audio online.

Required:

```powershell
$env:GEMINI_API_KEY="your-api-key"
```

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIMEX_VOICE_HOST` | `127.0.0.1` | Voice service host |
| `SIMEX_VOICE_PORT` | `8766` | Voice service port |
| `SIMEX_VOICE_WARMUP` | `1` | Warm up Whisper at service launch |
| `SIMEX_VOICE_LOG_DIR` | `voice-logs` in the project folder | Saved voice focus logs |
| `SIMEX_VOICE_READABLE_LOG_DIR` | `voice-logs/readable` | Saved human-readable Markdown logs |
| `SIMEX_TRANSCRIPTION_BACKEND` | `whisper` | Default transcription backend |
| `SIMEX_WHISPER_MODEL` | `small` | Whisper model size/name |
| `SIMEX_WHISPER_DEVICE` | `cpu` | `cpu` or `cuda` |
| `SIMEX_WHISPER_COMPUTE_TYPE` | `int8` | `int8`, `float16`, or other faster-whisper compute type |
| `SIMEX_WHISPER_BEAM_SIZE` | `5` | Beam search width |
| `SIMEX_WHISPER_VAD_FILTER` | `1` | Enable faster-whisper voice activity detection |
| `SIMEX_WHISPER_LANGUAGE` | empty | Optional language hint such as `en` or `nl` |
| `SIMEX_WHISPER_INITIAL_PROMPT` | dashboard vocabulary prompt | Domain prompt for Whisper |
| `GEMINI_API_KEY` | empty | Gemini API key |
| `SIMEX_GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model for online transcription and chart judging |
| `SIMEX_GEMINI_PROMPT` | transcription prompt | Prompt for Gemini transcription |
| `SIMEX_FOCUS_JUDGE_PROMPT` | chart judge prompt | Prompt for Gemini chart selection |
| `VITE_SIMEX_VOICE_SERVICE_URL` | `http://127.0.0.1:8766` | Dashboard-side service URL override |

## Logs

When the mic starts, the dashboard creates a fresh voice session log. When the mic stops, the log is saved by the voice service in two forms.

Default raw JSON folder:

```text
C:\Users\hekma\Documents\SimEx Dashboard\simex-dashboard-v2\voice-logs
```

Default readable Markdown folder:

```text
C:\Users\hekma\Documents\SimEx Dashboard\simex-dashboard-v2\voice-logs\readable
```

The readable log groups information by audio segment and includes:

- Session start and stop.
- Segment recording time, source, duration, and backend.
- Exact transcript text.
- Empty transcript warnings.
- Topic summary updates.
- Embedding terms and candidate chart scores.
- LLM chart judge requests and responses.
- Final focus decisions.

## Troubleshooting

If the first transcription is slow but later ones are fast, keep warm-up enabled.

If you see:

```text
Requested float16 compute type, but the target device or backend do not support efficient float16 computation.
```

Use CPU with `int8`, or fix CUDA and run with:

```powershell
$env:SIMEX_WHISPER_DEVICE="cuda"
$env:SIMEX_WHISPER_COMPUTE_TYPE="float16"
```

If the dashboard records audio but shows no transcript, open the Focus log. Look for:

- `transcribe-response` with `textLength: 0`: the transcription backend returned no text.
- `transcribe-error`: the service returned an error.
- no `transcribe-request`: the browser did not send the segment.

The Hugging Face unauthenticated warning mainly affects downloads and cache access. If every transcription after the first one is fast, the warning is not the main latency issue.

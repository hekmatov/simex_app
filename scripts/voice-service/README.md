# SimEx Voice Service

Optional localhost service for the dashboard voice focus feature.

## Install Whisper backend

Use one of these in the Python environment that will run the service:

```powershell
pip install faster-whisper
```

or:

```powershell
pip install openai-whisper
```

`faster-whisper` is the recommended first choice.

## Run

From the V2 project folder:

```powershell
python scripts/voice-service/voice_service.py
```

The dashboard expects the service at:

```text
http://127.0.0.1:8766
```

Optional environment variables:

- `SIMEX_VOICE_PORT`: service port, default `8766`
- `SIMEX_VOICE_WARMUP`: warm up Whisper on service launch, default `1`
- `SIMEX_VOICE_LOG_DIR`: folder for saved voice focus logs, default `voice-logs` in the V2 project folder
- `SIMEX_VOICE_READABLE_LOG_DIR`: folder for human-readable Markdown logs, default `voice-logs/readable`
- `SIMEX_TRANSCRIPTION_BACKEND`: default backend, `whisper` or `gemini`; default `whisper`
- `SIMEX_WHISPER_MODEL`: Whisper model, default `small`
- `SIMEX_WHISPER_LANGUAGE`: optional language hint, for example `en` or `nl`
- `SIMEX_WHISPER_DEVICE`: Whisper device, default `cpu`
- `SIMEX_WHISPER_COMPUTE_TYPE`: faster-whisper compute type, default `int8`
- `SIMEX_WHISPER_BEAM_SIZE`: beam search width, default `5`
- `SIMEX_WHISPER_VAD_FILTER`: faster-whisper voice activity detection, default `1`
- `SIMEX_WHISPER_INITIAL_PROMPT`: domain vocabulary hint for Whisper
- `GEMINI_API_KEY`: required when using the Gemini backend
- `SIMEX_GEMINI_MODEL`: Gemini audio model, default `gemini-3.5-flash`
- `SIMEX_GEMINI_PROMPT`: prompt used when asking Gemini for a transcript
- `SIMEX_FOCUS_JUDGE_PROMPT`: prompt used by the LLM chart judge
- `VITE_SIMEX_VOICE_SERVICE_URL`: dashboard-side service URL override

The dashboard remains usable when this service is not running; only live mic
transcription is disabled.

## Gemini online backend

Gemini mode is useful for comparing local Whisper against an online audio model.
The dashboard still sends audio only to this localhost service, but the service
then sends each selected segment to Google. Do not use this mode for private
workshop audio unless that is acceptable for the session.

From the V2 project folder:

```powershell
$env:GEMINI_API_KEY="your-api-key"
$env:SIMEX_TRANSCRIPTION_BACKEND="gemini"
$env:SIMEX_GEMINI_MODEL="gemini-3.5-flash"
python scripts/voice-service/voice_service.py
```

You can also leave the service default on local Whisper and switch individual
segments from the dashboard's `Transcription` selector.

## Focus modes and logs

The dashboard has two focus modes:

- `Semantic controller`: local rolling topic memory, semantic-style chart
  scoring, and switch-stability rules. This is the recommended default.
- `LLM chart judge`: uses the semantic controller to produce candidates, then
  asks Gemini to choose 1-4 charts from the rolling topic summary and recent
  transcript. This requires `GEMINI_API_KEY`.

Each time the mic is started, the dashboard creates a fresh focus log session.
When the mic is stopped, the browser sends that log to the localhost service.
The service saves raw JSON under `SIMEX_VOICE_LOG_DIR` and grouped Markdown
reports under `SIMEX_VOICE_READABLE_LOG_DIR`.

For the full launch guide, tuning presets, focus modes, and troubleshooting
notes, see `docs/voice-focus-guide.md`.

## Transcription tuning

Beam search asks Whisper to keep several candidate transcripts alive while it
decodes. Higher values can improve difficult audio, but each segment takes
longer. Start with `5`; try `1` for speed or `8` for harder room audio.

The initial prompt gives Whisper vocabulary that is likely to appear in the
meeting. The default prompt includes English and Dutch dashboard terms such as
`ICU`, `R-value`, `test positivity`, `wastewater`, `vertrouwen`, and
`schoolverzuim`.

Example:

```powershell
$env:SIMEX_WHISPER_MODEL="medium"
$env:SIMEX_WHISPER_LANGUAGE="en"
$env:SIMEX_WHISPER_BEAM_SIZE="5"
$env:SIMEX_WHISPER_VAD_FILTER="1"
python scripts/voice-service/voice_service.py
```

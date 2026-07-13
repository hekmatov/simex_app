import React from "react";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const COLOR_GROUPS = [
  {
    label: "PDPC",
    colors: ["#08224A", "#043BCB", "#36BDEB", "#2BAA7B", "#F1A1AD"],
  },
  {
    label: "Status",
    colors: ["#15803D", "#84A82D", "#F59E0B", "#EA580C", "#DC2626"],
  },
  {
    label: "Neutrals",
    colors: ["#111827", "#374151", "#6B7280", "#D8E2EC", "#F5F8FB", "#FFFFFF"],
  },
];
const GRADIENT_MAPS = [
  { label: "Red to green", colors: ["#D71920", "#Fdae61", "#FFFFBF", "#A6D96A", "#1A9641"] },
  { label: "Green to red", colors: ["#1A9641", "#A6D96A", "#FFFFBF", "#Fdae61", "#D71920"] },
  { label: "Blue to yellow", colors: ["#2C7BB6", "#ABD9E9", "#FFFFBF", "#FDAE61", "#D7191C"] },
  { label: "Yellow to blue", colors: ["#D7191C", "#FDAE61", "#FFFFBF", "#ABD9E9", "#2C7BB6"] },
  { label: "Likert", colors: ["#3BA64A", "#A7B734", "#F6A21A", "#F47B20", "#DF1F2D"] },
  { label: "PDPC", colors: ["#08224A", "#043BCB", "#36BDEB", "#2BAA7B", "#F1A1AD"] },
];

export default function ColorField({ label, value, fallback = "#043BCB", onChange, showPresets = true }) {
  const normalizedValue = normalizeHexColor(value, fallback);
  const [draft, setDraft] = React.useState(normalizedValue);
  const [message, setMessage] = React.useState("");
  const pickerActiveRef = React.useRef(false);

  React.useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  function commitColor(nextColor) {
    const normalized = normalizeHexColor(nextColor, "");
    setDraft(nextColor);
    if (!normalized) {
      setMessage("Use #RRGGBB.");
      return;
    }
    setMessage("");
    onChange(normalized);
  }

  function startPicking() {
    if (pickerActiveRef.current) {
      setMessage("A picker window is already open.");
      return;
    }
    if (typeof window === "undefined" || !("EyeDropper" in window)) {
      setMessage("Native picker is unavailable in this browser.");
      return;
    }
    const requestId = makePickerRequestId();
    const pickerWindow = window.open("", `simex-color-picker-${requestId}`, "popup,width=320,height=210,left=120,top=120");
    if (!pickerWindow) {
      setMessage("Popup blocked. Allow popups or type the hex color.");
      return;
    }

    pickerActiveRef.current = true;
    setMessage("Picker window opened. Use it to start the native picker.");

    function cleanup() {
      window.removeEventListener("message", handlePickerMessage);
      clearInterval(closeCheck);
      pickerActiveRef.current = false;
    }

    function handlePickerMessage(event) {
      if (event.origin !== window.location.origin || event.data?.type !== "simex-color-picked" || event.data.requestId !== requestId) {
        return;
      }
      if (event.data.color) {
        commitColor(event.data.color);
      } else if (event.data.error) {
        setMessage(event.data.error);
      }
      cleanup();
    }

    const closeCheck = setInterval(() => {
      if (pickerWindow.closed) {
        cleanup();
      }
    }, 500);

    window.addEventListener("message", handlePickerMessage);
    pickerWindow.document.open();
    pickerWindow.document.write(pickerWindowHtml(requestId, window.location.origin));
    pickerWindow.document.close();
    pickerWindow.focus();
  }

  return (
    <div className="settings-color-field">
      <span>{label}</span>
      <div className="settings-color-row">
        <label className="settings-color-swatch" style={{ backgroundColor: normalizedValue }} title="Open color picker">
          <input
            aria-label={`Pick ${label}`}
            type="color"
            value={normalizedValue}
            onChange={(event) => commitColor(event.target.value)}
          />
        </label>
        <input
          aria-label={label}
          value={draft}
          onChange={(event) => commitColor(event.target.value)}
          onBlur={(event) => setDraft(normalizeHexColor(event.target.value, normalizedValue))}
          spellCheck="false"
        />
        <button
          type="button"
          className="secondary settings-pipette-button"
          onClick={startPicking}
          aria-label={`Pick ${String(label).toLowerCase()} from dashboard`}
          title="Pick color from screen"
        >
          <PipetteIcon />
        </button>
      </div>
      {showPresets ? (
        <>
          <div className="settings-color-palette" aria-label={`${label} color presets`}>
            {COLOR_GROUPS.map((group) => (
              <div className="settings-color-palette-group" key={group.label}>
                <small>{group.label}</small>
                <div className="settings-color-preset-grid">
                  {group.colors.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={color.toUpperCase() === normalizedValue ? "active" : ""}
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={`Use ${color} for ${label}`}
                      onClick={() => commitColor(color)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="settings-gradient-grid" aria-label={`${label} gradient maps`}>
            {GRADIENT_MAPS.map((map) => (
              <button
                type="button"
                key={map.label}
                title={`${map.label}: use middle color`}
                aria-label={`${map.label} gradient map`}
                onClick={() => commitColor(map.colors[Math.floor(map.colors.length / 2)])}
              >
                <span style={{ background: `linear-gradient(90deg, ${map.colors.join(", ")})` }} />
                <small>{map.label}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}
      {message ? <small>{message}</small> : null}
    </div>
  );
}

function PipetteIcon() {
  return (
    <svg className="settings-pipette-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 4.5 19.5 9.5" />
      <path d="M8 16 4.5 19.5" />
      <path d="M6.5 17.5 16.5 7.5" />
      <path d="M14 5 19 10 16 13 11 8z" />
      <path d="M5 20h5" />
    </svg>
  );
}

function makePickerRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pickerWindowHtml(requestId, origin) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Pick color</title>
    <style>
      body {
        align-items: center;
        background: #f5f8fb;
        color: #08224a;
        display: grid;
        font-family: Inter, Arial, sans-serif;
        gap: 12px;
        justify-items: center;
        margin: 0;
        min-height: 100vh;
        padding: 18px;
        text-align: center;
      }
      button {
        background: #043bcb;
        border: 0;
        border-radius: 7px;
        color: white;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 10px 14px;
      }
      p {
        font-size: 13px;
        line-height: 1.35;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <button id="pick" type="button" autofocus>Start native picker</button>
    <p>Click a screen pixel to apply it. Press Esc or close this window to cancel.</p>
    <script>
      const requestId = ${JSON.stringify(requestId)};
      const origin = ${JSON.stringify(origin)};
      const send = (payload) => window.opener?.postMessage({ type: "simex-color-picked", requestId, ...payload }, origin);
      document.getElementById("pick").addEventListener("click", async () => {
        if (!("EyeDropper" in window)) {
          send({ error: "Native picker is unavailable in this browser." });
          window.close();
          return;
        }
        try {
          const result = await new EyeDropper().open();
          send({ color: result?.sRGBHex });
          window.close();
        } catch (error) {
          send({ error: error?.name === "AbortError" ? "Picker cancelled." : error?.message || "Native picker could not start." });
          window.close();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          send({ error: "Picker cancelled." });
          window.close();
        }
      });
    </script>
  </body>
</html>`;
}

function normalizeHexColor(value, fallback) {
  const color = String(value ?? "").trim();
  return HEX_COLOR_PATTERN.test(color) ? color.toUpperCase() : fallback;
}

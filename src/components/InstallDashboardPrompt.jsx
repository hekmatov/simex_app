import React from "react";

export default function InstallDashboardPrompt() {
  const [installPrompt, setInstallPrompt] = React.useState(null);
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = isAppleMobile && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone;

  React.useEffect(() => {
    function captureInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function clearInstallPrompt() {
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  if (isStandalone) return null;

  if (isAppleMobile) {
    return (
      <details className="install-dashboard-prompt">
        <summary>Install dashboard app</summary>
        <p>
          {isSafari
            ? <>Tap <strong>Share</strong>, scroll to <strong>Add to Home Screen</strong>, turn on <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</>
            : <>Open this page in <strong>Safari</strong>, then tap <strong>Share</strong> → <strong>Add to Home Screen</strong> → <strong>Add</strong>.</>}
        </p>
      </details>
    );
  }

  if (!installPrompt) return null;

  return (
    <button type="button" className="install-dashboard-button" onClick={installApp}>
      Install dashboard app
    </button>
  );
}

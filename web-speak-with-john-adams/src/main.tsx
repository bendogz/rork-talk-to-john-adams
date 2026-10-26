import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";

/**
 * After a new version is published, a page left open still points at the old
 * code pieces, which no longer exist on the server. When one fails to load,
 * reload once to pick up the current version (guarded so it can never loop).
 */
const RELOAD_KEY = "speak-with-adams.chunk-reload";

function reloadForNewVersion(): void {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Date.now() - last < 30000) return;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage refused: reload anyway, once per page life.
  }
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForNewVersion();
});

window.addEventListener("unhandledrejection", (event) => {
  const reason: unknown = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(message)) {
    event.preventDefault();
    reloadForNewVersion();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

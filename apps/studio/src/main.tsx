import "@fontsource/syne/latin-400.css";
import "@fontsource/syne/latin-600.css";
import "@fontsource/syne/latin-700.css";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles/tokens.css";
import "./styles/studio.css";
import { App } from "./App.tsx";
import { Remote } from "./components/Remote.tsx";

const isRemote = new URLSearchParams(location.search).has("remote");

createRoot(document.getElementById("root")!).render(isRemote ? <Remote /> : <App />);

function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;

  if (isRemote) {
    splash.remove();
    return;
  }

  const SPLASH_MIN_MS = 1000;
  const FADE_MS = 380;

  window.setTimeout(() => {
    splash.classList.add("is-gone");
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, Math.max(0, SPLASH_MIN_MS - performance.now()));
}

dismissSplash();

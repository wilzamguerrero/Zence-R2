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

createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("remote") ? <Remote /> : <App />);

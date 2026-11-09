// Racine : langue, routes, barre du haut et pied de page.
import { Footer, SeasonBand, SkipLink, TopBar } from "./components/Chrome";
import { LangProvider } from "./i18n";
import { isMock } from "./lib/api";
import { usePath } from "./lib/router";
import { parseLogin } from "./lib/util";
import { CardPage } from "./pages/CardPage";
import { DirectCard } from "./pages/DirectCard";
import { Home } from "./pages/Home";
import { NotFound, Privacy } from "./pages/Privacy";

/** Mode démo uniquement : aperçu du site dans des cadres de téléphone (360 et 390 px). */
function Devices() {
  const src = new URLSearchParams(window.location.search).get("src") ?? "/";
  const url = src + (src.includes("?") ? "&" : "?") + "mock=1";
  return (
    <div style={{ display: "flex", gap: 20, padding: 12, background: "#1a1f27", minHeight: "100vh" }}>
      {[390, 360].map((w) => (
        <iframe key={w} title={`${w}px`} src={url} style={{ width: w, height: 760, border: "1px solid #223040", borderRadius: 18, background: "#0a0f16" }} />
      ))}
    </div>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Premiers segments réservés : jamais pris pour un pseudo GitHub. */
const RESERVED = new Set(["api", "og", "c", "auth", "avatar", "assets", "privacy", "confidentialite"]);

function Routes() {
  const path = usePath();
  const card = /^\/c\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (card) return <CardPage key={card[1]} id={card[1]} />;
  if (path === "/" || path === "") return <Home />;
  if (/^\/(confidentialite|privacy)\/?$/.test(path)) return <Privacy />;
  // /{pseudo} : la carte sans champ (§6.1).
  const direct = /^\/([^/]+)\/?$/.exec(path);
  const login = direct && !RESERVED.has(direct[1].toLowerCase()) ? parseLogin(safeDecode(direct[1])) : null;
  if (login) return <DirectCard key={login} login={login} />;
  return <NotFound />;
}

export function App() {
  const path = usePath();
  if (window.location.pathname === "/__devices" && isMock()) return <Devices />;
  return (
    <LangProvider>
      <SkipLink />
      <div className="shell">
        {(path === "/" || path === "") && <SeasonBand />}
        <TopBar />
        <Routes />
        <Footer />
      </div>
    </LangProvider>
  );
}

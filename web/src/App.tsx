// Racine : langue, routes, barre du haut et pied de page.
import { useEffect } from "react";
import { Footer, SeasonBand, SkipLink, TopBar } from "./components/Chrome";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LangProvider } from "./i18n";
import { isMock } from "./lib/api";
import { navigate, routeOf, usePath } from "./lib/router";
import { BandPage, Bands } from "./pages/Bands";
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

/** Page à venir (§18.27) : l'adresse devient l'accueil, query gardée (?mock=1). */
function BackHome() {
  useEffect(() => navigate("/", { replace: true }), []);
  return null;
}

function Routes() {
  const route = routeOf(usePath());
  switch (route.kind) {
    case "card":
      return <CardPage key={route.id} id={route.id} />;
    case "home":
      return <Home />;
    case "privacy":
      return <Privacy />;
    case "bands":
      return <Bands />;
    case "band":
      return <BandPage key={`${route.type}/${route.id}`} type={route.type} id={route.id} />;
    case "direct":
      return <DirectCard key={route.login} login={route.login} />;
    case "upcoming":
      return <BackHome />;
    default:
      return <NotFound />;
  }
}

export function App() {
  const path = usePath();
  if (window.location.pathname === "/__devices" && isMock()) return <Devices />;
  return (
    <LangProvider>
      <ErrorBoundary>
        <SkipLink />
        <div className="shell">
          {(path === "/" || path === "") && <SeasonBand />}
          <TopBar />
          <Routes />
          <Footer />
        </div>
      </ErrorBoundary>
    </LangProvider>
  );
}

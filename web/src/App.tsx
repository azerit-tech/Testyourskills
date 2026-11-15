// Racine : langue, routes, barre du haut et pied de page.
import { lazy, Suspense, useEffect, useState } from "react";
import { Footer, SeasonBand, SkipLink, TopBar } from "./components/Chrome";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotFound } from "./components/ErrorPage";
import { LangProvider } from "./i18n";
import { isMock } from "./lib/api";
import { navigate, routeOf, usePath } from "./lib/router";
import { DirectCard } from "./pages/DirectCard";
import { loadCardPage, loadedCardPage } from "./pages/cardPageLoader";

// Chaque page est chargée à la demande : l'accueil ne paie pas la page d'une fiche, ni l'inverse.
// Le serveur précharge celle de l'adresse demandée (server/src/assets.ts), sans attendre ce paquet.
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const CardPageLazy = lazy(() => loadCardPage().then((m) => ({ default: m.CardPage })));
/** Préchargée par le formulaire, la page d'une fiche se rend sans repli vide entre l'accueil et l'attente. */
function CardPage({ id }: { id: string }) {
  const [mod] = useState(loadedCardPage);
  return mod ? <mod.CardPage id={id} /> : <CardPageLazy id={id} />;
}
const Bands = lazy(() => import("./pages/Bands").then((m) => ({ default: m.Bands })));
const BandPage = lazy(() => import("./pages/Bands").then((m) => ({ default: m.BandPage })));
const PrimesList = lazy(() => import("./pages/Primes").then((m) => ({ default: m.PrimesList })));
const PrimePage = lazy(() => import("./pages/Primes").then((m) => ({ default: m.PrimePage })));
const Rules = lazy(() => import("./pages/Rules").then((m) => ({ default: m.Rules })));
const Privacy = lazy(() => import("./pages/Privacy").then((m) => ({ default: m.Privacy })));
const Credits = lazy(() => import("./pages/Credits").then((m) => ({ default: m.Credits })));

/** Les téléphones de l'aperçu : le plus courant, le plus étroit. */
const DEVICES = [
  { w: 390, h: 844 },
  { w: 360, h: 740 },
];

/** Mode démo uniquement : aperçu du site dans des cadres de téléphone, aux couleurs du site, chacun avec sa taille. */
function Devices() {
  const src = new URLSearchParams(window.location.search).get("src") ?? "/";
  const url = src + (src.includes("?") ? "&" : "?") + "mock=1";
  return (
    <div className="devices">
      {DEVICES.map(({ w, h }) => (
        <figure key={w} className="device">
          <figcaption className="label">
            {w} × {h}
          </figcaption>
          <iframe title={`${w} × ${h}`} src={url} width={w} height={h} />
        </figure>
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
    case "credits":
      return <Credits />;
    case "bands":
      return <Bands />;
    case "band":
      return <BandPage key={`${route.type}/${route.id}`} type={route.type} id={route.id} />;
    // Les primes et le règlement lisent eux-mêmes le serveur : une saison sans prime ramène
    // à l'accueil, une prime inconnue ou un règlement non publié le disent, une panne aussi.
    case "primes":
      return <PrimesList />;
    case "prime":
      return <PrimePage key={route.id} id={route.id} />;
    case "rules":
      return <Rules />;
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
          {/* Le pied attend la page : il ne saute pas du bas de l'écran vers le bas de la page. */}
          <Suspense fallback={<main className="page" id="main" aria-busy />}>
            <Routes />
            <Footer />
          </Suspense>
        </div>
      </ErrorBoundary>
    </LangProvider>
  );
}

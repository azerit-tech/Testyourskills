// Le filet (§18.27) : un morceau du site qui ne se charge pas (réseau coupé,
// déploiement entre deux pages) ne laisse plus un écran blanc.
// Sans `fallback`, l'écran « Recharger » (la mise en page d'erreur commune) ; avec, ce repli (ex. `null` pour la
// scène 3D, dont l'échec fait sortir la fiche sans révélation via `onError`).
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useT } from "../i18n";
import { Brand } from "./Brand";
import { ErrorPanel, useTabTitle } from "./ErrorPage";

/** Un morceau du site introuvable : le site a été mis à jour pendant la visite (ou le réseau a coupé). */
export function isChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(msg);
}

const RELOADED = "tys_reloaded";
/** Le garde-fou : une seule tentative par minute et par onglet, jamais une boucle de rechargements. */
const RELOAD_GAP_MS = 60_000;

/** Recharger la page d'elle-même, une fois : vrai si c'est parti. */
export function reloadOnce(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED) ?? 0);
    if (last && now - last < RELOAD_GAP_MS) return false;
    sessionStorage.setItem(RELOADED, String(now));
  } catch {
    // Sans stockage, pas de garde-fou : on ne prend pas le risque de boucler.
    return false;
  }
  window.location.reload();
  return true;
}

interface Props {
  children: ReactNode;
  /** Ce qu'on montre à la place. Absent : l'écran d'erreur du site. */
  fallback?: ReactNode;
  /** Appelé une fois l'erreur attrapée. */
  onError?: (error: unknown) => void;
}

interface State {
  failed: boolean;
  /** Un morceau introuvable, la page se recharge d'elle-même : rien à montrer entre-temps. */
  reloading?: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[tys] morceau du site en échec", error, info.componentStack);
    this.props.onError?.(error);
    // Le filet du site (sans repli donné) : après un déploiement, l'onglet resté ouvert
    // demande un morceau qui n'existe plus. Une fois, la page se recharge d'elle-même ;
    // au second échec, l'écran « Recharger ».
    if (this.props.fallback === undefined && isChunkError(error) && reloadOnce()) this.setState({ reloading: true });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return this.state.reloading ? null : <Crash />;
  }
}

/**
 * L'écran de repli : la marque en haut (un vrai lien, la page repart de zéro), la mise en
 * page d'erreur du site, tampon « Interrompu », « Recharger », et le retour à l'accueil.
 */
export function Crash() {
  const { t } = useT();
  useTabTitle(t.pages.error.tab.crash);
  return (
    <div className="crash">
      <header className="topbar">
        <a href="/" className="topbar-brand" aria-label={t.chrome.home}>
          <Brand />
        </a>
      </header>
      <main className="page page-error" id="main">
        <ErrorPanel stamp="crash" title={t.crash.title} text={t.crash.text} action={{ label: t.crash.reload, onClick: () => window.location.reload() }} alt={{ label: t.pages.error.down.home, href: "/", hard: true }} />
      </main>
    </div>
  );
}

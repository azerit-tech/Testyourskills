// Le filet (§18.27) : un morceau du site qui ne se charge pas (réseau coupé,
// déploiement entre deux pages) ne laisse plus un écran blanc.
// Sans `fallback`, l'écran « Recharger » ; avec, ce repli (ex. `null` pour la
// scène 3D, dont l'échec fait sortir la fiche sans révélation via `onError`).
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useT } from "../i18n";

interface Props {
  children: ReactNode;
  /** Ce qu'on montre à la place. Absent : l'écran d'erreur du site. */
  fallback?: ReactNode;
  /** Appelé une fois l'erreur attrapée. */
  onError?: (error: unknown) => void;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[tys] morceau du site en échec", error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback !== undefined ? this.props.fallback : <Crash />;
  }
}

/** L'écran de repli : une phrase et « Recharger ». */
export function Crash() {
  const { t } = useT();
  return (
    <main className="page crash" id="main">
      <div className="panel-center">
        <h1>{t.crash.title}</h1>
        <p>{t.crash.text}</p>
        <button type="button" className="pill" onClick={() => window.location.reload()}>
          {t.crash.reload}
        </button>
      </div>
    </main>
  );
}

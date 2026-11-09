// Route /{pseudo} : la carte sans champ. On lance la génération puis on
// remplace l'URL par /c/:id. En cas d'erreur, retour à l'entrée avec le pseudo
// prérempli et le message. Les robots n'exécutent pas ce code : aucun coût sur un crawl.
import { useEffect, useRef } from "react";
import { isReservedSegment } from "../../../shared/routes";
import { useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { errorFact } from "../lib/errors";
import { navigate } from "../lib/router";
import { markFresh, rememberInput, setPrefill } from "../lib/session";

export function DirectCard({ login }: { login: string }) {
  const { t, lang } = useT();
  const once = useRef(false);

  useEffect(() => {
    // Un seul départ, même quand StrictMode rejoue l'effet en dev.
    if (once.current) return;
    once.current = true;
    // Un mot réservé (« primes ») n'est jamais un pseudo : aucune fiche, retour à l'accueil.
    if (isReservedSegment(login)) {
      navigate("/", { replace: true });
      return;
    }
    document.title = t.meta.title;
    api.createCard({ login, lang }).then(
      (res) => {
        if (res.deleteToken) tokens.set(res.id, res.deleteToken);
        rememberInput({ login });
        markFresh(res.id, login);
        navigate(`/c/${res.id}`, { replace: true });
      },
      (err: unknown) => {
        setPrefill({ login, error: errorFact(err, t.errors.closed, t.home.errNetwork) });
        navigate("/", { replace: true });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login]);

  return (
    <main className="page page-card" id="main">
      <div className="stage-slot loading-slot" aria-busy="true">
        <span className="sr-only">{t.common.loading}</span>
      </div>
    </main>
  );
}

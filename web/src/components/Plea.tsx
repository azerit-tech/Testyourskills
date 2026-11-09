// Le pari (§18.27) : « Tu plaides combien d'étoiles ? ». Pendant l'attente, six
// étoiles à toucher ; le choix fait, le bloc se réduit à une ligne. Sous la
// fiche, le verdict : le pari, les étoiles obtenues, et un mot fixe selon
// l'écart. C'est la thèse en un geste : ce qu'on déclare contre ce que le code
// prouve. Le pari reste dans le navigateur (lib/plea.ts) ; seul l'événement
// `plea` part, une fois, quand le verdict s'affiche.
import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { getPlea, setPlea } from "../lib/plea";
import { firstVerdict, pleaVerdict } from "../lib/pleaVerdict";

const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";
const SIX = [1, 2, 3, 4, 5, 6] as const;

/** Le pari vient d'être fait : le verdict, déjà monté sous l'attente, le relit. */
const listeners = new Set<() => void>();

/** Six étoiles en ligne : les n premières allumées, blanches et mates ; les autres pleines et sombres. */
function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span className="plea-row" role="img" aria-label={label}>
      {SIX.map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={i <= n ? "on" : undefined} aria-hidden>
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

/** Pendant l'attente : la question et six étoiles, puis une ligne. Le pari ne se reprend pas. */
export function PleaPrompt({ cardId }: { cardId: string }) {
  const { t } = useT();
  const p = t.plea;
  const [stars, setStars] = useState<number | null>(() => getPlea(cardId));

  if (stars) {
    return (
      <p className="plea plea-line">
        {p.pleading} <Stars n={stars} label={p.count(stars)} />
      </p>
    );
  }
  const choose = (n: number) => {
    setPlea(cardId, n);
    setStars(n);
    listeners.forEach((f) => f());
  };
  return (
    <div className="plea" role="group" aria-labelledby="plea-ask">
      <p className="plea-ask" id="plea-ask">
        {p.ask}
      </p>
      <div className="plea-stars">
        {SIX.map((n) => (
          <button key={n} type="button" className="plea-star" aria-label={p.star(n)} onClick={() => choose(n)}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={STAR} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

interface PleaVerdictProps {
  cardId: string;
  /** La note de la fiche : ses étoiles sont le verdict. */
  overall: number;
  /** La fiche est posée et le bloc à l'écran : c'est là que l'événement part. */
  shown: boolean;
}

/** Sous la fiche : « Tu plaidais ★★★★★☆ », « Verdict : ★★★★☆☆ » (sans point après les étoiles) et le mot de l'écart. Rien sans pari. */
export function PleaVerdict({ cardId, overall, shown }: PleaVerdictProps) {
  const { t } = useT();
  const p = t.plea;
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const on = () => setVersion((v) => v + 1);
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pleaded = useMemo(() => getPlea(cardId), [cardId, version]);
  const v = pleaded ? pleaVerdict(pleaded, overall) : null;

  useEffect(() => {
    if (!shown || !v) return;
    if (firstVerdict(cardId)) api.track("plea", cardId, { stars: v.pleaded, gap: v.diff });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, cardId, v?.pleaded, v?.diff]);

  if (!v) return null;
  return (
    <section className="plea-verdict" aria-label={p.verdict.replace(/\s*:$/, "")}>
      <p className="plea-said">
        <span>
          {p.pleaded} <Stars n={v.pleaded} label={p.count(v.pleaded)} />
        </span>{" "}
        <span>
          {p.verdict} <Stars n={v.actual} label={p.count(v.actual)} />
        </span>
      </p>
      <p className="plea-word">{p.gap[v.gap]}</p>
    </section>
  );
}

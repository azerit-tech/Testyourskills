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
import { Stars, StarShape } from "./Stars";

const SIX = [1, 2, 3, 4, 5, 6] as const;

/** Le pari vient d'être fait : le verdict, déjà monté sous l'attente, le relit. */
const listeners = new Set<() => void>();

/** Pendant l'attente : la question et six étoiles, puis une ligne. Le pari ne se reprend pas. */
export function PleaPrompt({ cardId }: { cardId: string }) {
  const { t } = useT();
  const p = t.plea;
  const [stars, setStars] = useState<number | null>(() => getPlea(cardId));

  if (stars) {
    return (
      <div className="plea">
        <p className="plea-line">
          {p.pleading} <Stars n={stars} size={14} label={p.count(stars)} />
        </p>
        <p className="plea-noted">{p.noted}</p>
      </div>
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
            <StarShape />
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

/**
 * Sous la fiche : un tableau de deux lignes, « Tu plaidais ★★★★★☆ » puis « Verdict ★★★★☆☆ », libellés
 * sans deux-points alignés à droite, étoiles sur la même verticale ; puis le mot de l'écart. Rien sans pari.
 */
/**
 * Au retour du film, sur téléphone (§18.52) : le verdict du pari en une ligne au-dessus de la fiche,
 * dans le premier écran même à 390 × 664. Sa place est tenue dès le début (la fiche se taille
 * dessous) ; il ne paraît qu'une fois la fiche posée. Le bloc du verdict, plus bas, ne le répète pas.
 */
export function PleaStrip({ cardId, overall, shown }: PleaVerdictProps) {
  const { t } = useT();
  const p = t.plea;
  const pleaded = getPlea(cardId);
  const v = pleaded ? pleaVerdict(pleaded, overall) : null;
  if (!v) return null;
  return (
    <p className={`plea-strip${shown ? " is-on" : ""}`} aria-hidden={shown ? undefined : true}>
      <b>{p.gap[v.gap]}.</b> {p.strip(v.pleaded, v.actual)}
    </p>
  );
}

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
    <section className="plea-verdict" aria-label={p.verdict}>
      <dl className="plea-said">
        <dt>{p.pleaded}</dt>
        <dd>
          <Stars n={v.pleaded} size={22} label={p.count(v.pleaded)} />
        </dd>
        <dt>{p.verdict}</dt>
        <dd>
          <Stars n={v.actual} size={22} label={p.count(v.actual)} />
        </dd>
      </dl>
      <p className="plea-word">{p.gap[v.gap]}</p>
    </section>
  );
}

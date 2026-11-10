// Comparaison (§6.5) : CV contre GitHub. Côte à côte sur desktop avec les deltas
// entre les deux ; sur mobile, cartes en carrousel (swipe) et deltas en grille.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ComparisonData, StatCode } from "../../../shared/types";
import { declaredOf, STAT_CODES } from "../../../shared/types";
import { theirHeadline } from "../../../shared/compareText";
import { pick, useT } from "../i18n";
import { useMediaQuery } from "../lib/util";
import { RevealCard } from "./Reveal";
import type { Phase } from "./Reveal";

type Tone = "up" | "down" | "flat";

/** Vert si le code vaut plus, orange si le CV gonfle. BUZZ : plus bas vaut mieux. */
function toneOf(code: StatCode | "overall", d: number): Tone {
  if (d === 0) return "flat";
  if (code === "BUZZ") return d < 0 ? "down" : "flat";
  return d > 0 ? "up" : "down";
}

const fmt = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0");

function DeltaPill({ code, d, index, label }: { code: StatCode | "overall"; d: number; index: number; label: string }) {
  const tone = toneOf(code, d);
  return (
    <li className={`delta delta-${tone}${code === "overall" ? " delta-overall" : ""}`} style={{ ["--i" as string]: index } as CSSProperties}>
      <span className="delta-code">{label}</span>
      <span className="delta-val">{fmt(d)}</span>
    </li>
  );
}

function Deltas({ cmp, className = "" }: { cmp: ComparisonData; className?: string }) {
  const { t } = useT();
  const overall = cmp.github.overall - cmp.cv.overall;
  return (
    <div className={`deltas ${className}`}>
      <p className="deltas-title">{t.compare.deltaTitle}</p>
      <ol className="deltas-list">
        <DeltaPill code="overall" d={overall} index={0} label={t.compare.overall} />
        {STAT_CODES.map((c, i) => (
          <DeltaPill key={c} code={c} d={cmp.deltas[c]} index={i + 1} label={c} />
        ))}
      </ol>
      <p className="deltas-legend">
        <span className="lg lg-up">{t.compare.legendUp}</span>
        <span className="lg lg-down">{declaredOf(cmp) === "linkedin" ? t.compare.legendDownLi : t.compare.legendDown}</span>
      </p>
      <p className="deltas-buzz">{t.compare.buzzHint}</p>
    </div>
  );
}

/**
 * Le chiffre du titre ressort en couleur ; le reste du titre reste blanc. `who` (le @login) reste
 * tel quel, même s'il porte des chiffres. Un h1 pour qui a fait la fiche ; un h2 pour le
 * visiteur, dont la page a déjà son h1 (« Avis de recherche : @x »).
 */
function Headline({ text, tone, who }: { text: string; tone: Tone; who: string | null }) {
  const chunks = who ? text.split(who).flatMap((c, i) => (i === 0 ? [c] : [who, c])) : [text];
  const Tag = who ? "h2" : "h1";
  let k = 0;
  return (
    <Tag className={`cmp-headline tone-${tone}`}>
      {chunks.map((c, j) =>
        who && j % 2 === 1 ? (
          <span key={k++}>{c}</span>
        ) : (
          c.split(/(\d+)/).map((p) => (/^\d+$/.test(p) ? <em key={k++}>{p}</em> : p ? <span key={k++}>{p}</span> : null))
        ),
      )}
    </Tag>
  );
}

/** Le titre de l'écart : celui du serveur, qui tutoie ; pour un visiteur, à la troisième personne. */
function headlineText(cmp: ComparisonData, who: string | null, lang: ReturnType<typeof useT>["lang"]): string {
  // À égalité, le titre ne s'adresse à personne : on garde celui du serveur. Même phrase que l'aperçu de lien.
  return (who && theirHeadline(cmp, lang, who)) || pick(cmp.headline, lang);
}

interface StageProps {
  cmp: ComparisonData;
  phase: Phase;
  /** Vue par un visiteur : « @login », à la troisième personne. Absent : qui a fait la fiche, tutoyé. */
  who?: string | null;
}

export function ComparisonStage({ cmp, phase, who = null }: StageProps) {
  const { t, lang } = useT();
  const desktop = useMediaQuery("(min-width: 980px)");
  const [active, setActive] = useState<0 | 1>(1);
  const track = useRef<HTMLDivElement>(null);
  const overall = cmp.github.overall - cmp.cv.overall;
  const headTone = toneOf("overall", overall);
  const settled = phase === "done";

  // Carrousel mobile : la position de défilement pilote le sélecteur.
  useEffect(() => {
    const el = track.current;
    if (!el || desktop) return;
    const on = () => setActive(el.scrollLeft > el.clientWidth / 2 ? 1 : 0);
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [desktop]);

  // Sur mobile on ouvre sur la carte GitHub : c'est elle qui « prouve ».
  useEffect(() => {
    const el = track.current;
    if (!el || desktop) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "auto" });
  }, [desktop]);

  const goTo = (i: 0 | 1) => {
    setActive(i);
    const el = track.current;
    if (el) el.scrollTo({ left: i === 0 ? 0 : el.scrollWidth, behavior: "smooth" });
  };

  const labels = who ? t.compare.them : t.compare;
  const cards = [
    declaredOf(cmp) === "linkedin"
      ? { card: cmp.cv, label: labels.liLabel, short: t.compare.liShort, prefix: "cmp-cv", anchor: false }
      : { card: cmp.cv, label: labels.cvLabel, short: t.compare.cvShort, prefix: "cmp-cv", anchor: false },
    { card: cmp.github, label: labels.ghLabel, short: t.compare.ghShort, prefix: "cmp-gh", anchor: true },
  ];

  return (
    <div className={`cmp phase-${phase}${settled ? " is-settled" : ""}`}>
      <div className="cmp-head">
        <p className="cmp-loot">{t.compare.loot}</p>
        <Headline text={headlineText(cmp, who, lang)} tone={headTone} who={who} />
      </div>

      {!desktop && (
        <div className="seg cmp-switch" role="tablist" aria-label={t.compare.switchLabel}>
          <span className="seg-thumb" data-pos={active} aria-hidden />
          {cards.map((c, i) => (
            <button key={c.prefix} type="button" role="tab" aria-selected={active === i} onClick={() => goTo(i as 0 | 1)}>
              {c.short} <b>{c.card.overall}</b>
            </button>
          ))}
        </div>
      )}

      <div className="cmp-stage">
        <div className="cmp-track" ref={track}>
          {cards.map((c, i) => (
            <figure key={c.prefix} className={`cmp-card cmp-card-${i === 0 ? "cv" : "gh"}`} aria-label={c.label}>
              <figcaption>
                <span className="cmp-src">{c.short}</span>
                {c.label}
              </figcaption>
              <RevealCard card={c.card} lang={lang} phase={phase} idPrefix={c.prefix} primary={false} anchor={c.anchor} />
            </figure>
          ))}
        </div>
        {desktop && <Deltas cmp={cmp} className="deltas-col" />}
      </div>

      {!desktop && <Deltas cmp={cmp} className="deltas-row" />}
    </div>
  );
}

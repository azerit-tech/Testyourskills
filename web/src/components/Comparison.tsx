// Comparaison (§6.5) : CV contre GitHub. Côte à côte sur desktop avec les deltas
// entre les deux ; sur mobile, cartes en carrousel (swipe) et deltas en grille.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { starsLine } from "../../../shared/stars";
import type { ComparisonData, StatCode } from "../../../shared/types";
import { declaredOf, STAT_CODES, starsFor } from "../../../shared/types";
import { ownHeadline, theirHeadline } from "../../../shared/compareText";
import { usableGrid } from "../../../shared/gridText";
import { useT } from "../i18n";
import { useMediaQuery } from "../lib/util";
import { RevealCard } from "./Reveal";
import type { Phase } from "./Reveal";

/** neutral : face à un GitHub « dossier vide », rien ne se compare (§18.37) : ni gain, ni perte. */
type Tone = "up" | "down" | "flat" | "neutral";

/** Vert si le code vaut plus, orange si le CV gonfle. BUZZ : plus bas vaut mieux. */
function toneOf(code: StatCode | "overall", d: number): Tone {
  if (d === 0) return "flat";
  if (code === "BUZZ") return d < 0 ? "down" : "flat";
  return d > 0 ? "up" : "down";
}

const fmt = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0");

/** `d` null : non comparable, « n/c », lu en entier par un lecteur d'écran. */
function DeltaPill({ code, d, index, label }: { code: StatCode | "overall"; d: number | null; index: number; label: string }) {
  const { t } = useT();
  const tone: Tone = d === null ? "neutral" : toneOf(code, d);
  return (
    <li className={`delta delta-${tone}${code === "overall" ? " delta-overall" : ""}`} style={{ ["--i" as string]: index } as CSSProperties}>
      <span className="delta-code">{label}</span>
      {d === null ? (
        <span className="delta-val">
          <span aria-hidden>{t.compare.nc}</span>
          <span className="sr-only">{t.compare.ncLong}</span>
        </span>
      ) : (
        <span className="delta-val">{fmt(d)}</span>
      )}
    </li>
  );
}

/** Le code n'est pas prouvé : un GitHub « dossier vide » ne se compare pas à ce que le CV ou LinkedIn déclare (§18.37). */
export const unprovenCode = (cmp: Pick<ComparisonData, "github">) => cmp.github.grid?.rule === "empty_file";

export function Deltas({ cmp, className = "" }: { cmp: ComparisonData; className?: string }) {
  const { t } = useT();
  const overall = cmp.github.overall - cmp.cv.overall;
  // Face à un GitHub vide : ni écart global, ni barre chiffrée, ni légende gain / perte.
  const nc = unprovenCode(cmp);
  return (
    <div className={`deltas ${className}${nc ? " is-nc" : ""}`}>
      <p className="deltas-title">{t.compare.deltaTitle}</p>
      <ol className="deltas-list">
        {!nc && <DeltaPill code="overall" d={overall} index={0} label={t.compare.overall} />}
        {STAT_CODES.map((c, i) => (
          <DeltaPill key={c} code={c} d={nc ? null : cmp.deltas[c]} index={i + 1} label={c} />
        ))}
      </ol>
      {nc ? (
        <p className="deltas-nc">{declaredOf(cmp) === "linkedin" ? t.compare.ncLegendLi : t.compare.ncLegend}</p>
      ) : (
        <>
          <p className="deltas-legend">
            <span className="lg lg-up">{t.compare.legendUp}</span>
            <span className="lg lg-down">{declaredOf(cmp) === "linkedin" ? t.compare.legendDownLi : t.compare.legendDown}</span>
          </p>
          <p className="deltas-buzz">{t.compare.buzzHint}</p>
        </>
      )}
    </div>
  );
}

/**
 * Comparaison notée par le barème de recrutement (§18.37) : la note du dossier
 * en tête, avec ses étoiles, au-dessus de la phrase (rapport du recruteur, §5).
 */
function CaseTop({ overall }: { overall: number }) {
  const { t } = useT();
  const n = starsFor(overall);
  return (
    <p className="cmp-case">
      <span className="cmp-case-stars" aria-hidden>
        {starsLine(n)}
      </span>
      <b className="cmp-case-v" aria-hidden>
        {overall}
      </b>
      <span className="sr-only">{t.compare.caseSr(overall, n)}</span>
    </p>
  );
}

/** Sous les deux pièces : d'où vient la note du dossier, et le lien vers la lecture du recruteur. */
function CaseRating({ unproven, className = "" }: { unproven: boolean; className?: string }) {
  const { t } = useT();
  return (
    <a className={`case-rating ${className}`} href="#grille">
      <span className="case-rating-hint">{unproven ? t.compare.caseHintNc : t.compare.caseHint}</span>
      <span className="case-rating-link">
        {t.compare.caseLink}
        <span aria-hidden> ↓</span>
      </span>
    </a>
  );
}

/**
 * Le chiffre du titre ressort en couleur ; le reste du titre reste blanc. `who` (le @login) reste
 * tel quel, même s'il porte des chiffres. Un h1 pour qui a fait la fiche ; un h2 pour le
 * visiteur, dont la page a déjà son h1 (« Avis de recherche : @x »).
 */
function Headline({ text, tone, who, sub = false }: { text: string; tone: Tone; who: string | null; sub?: boolean }) {
  const chunks = who ? text.split(who).flatMap((c, i) => (i === 0 ? [c] : [who, c])) : [text];
  const Tag = who ? "h2" : "h1";
  let k = 0;
  return (
    <Tag className={`cmp-headline tone-${tone}${sub ? " is-sub" : ""}`}>
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

/** Le titre de l'écart (shared/compareText.ts) : tutoyé pour qui a fait la fiche ; pour un visiteur, à la troisième personne, comme l'aperçu de lien. */
function headlineText(cmp: ComparisonData, who: string | null, lang: ReturnType<typeof useT>["lang"]): string {
  return who ? theirHeadline(cmp, lang, who) : ownHeadline(cmp, lang);
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
  // GitHub vide : le titre ne dit ni gain ni perte, le code n'est pas prouvé.
  const headTone: Tone = unprovenCode(cmp) ? "neutral" : toneOf("overall", overall);
  const settled = phase === "done";
  const graded = usableGrid(cmp.grid);

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
        {/* Notée : la note du dossier d'abord, la phrase dessous. */}
        {graded && <CaseTop overall={cmp.grid!.overall} />}
        <Headline text={headlineText(cmp, who, lang)} tone={headTone} who={who} sub={graded} />
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
                {graded ? `${t.compare.exhibit(i + 1)} · ${c.label}` : c.label}
              </figcaption>
              <RevealCard card={c.card} lang={lang} phase={phase} idPrefix={c.prefix} primary={false} anchor={c.anchor} />
            </figure>
          ))}
        </div>
        {desktop && (graded ? <CaseRating unproven={unprovenCode(cmp)} className="deltas-col" /> : <Deltas cmp={cmp} className="deltas-col" />)}
      </div>

      {!desktop && (graded ? <CaseRating unproven={unprovenCode(cmp)} className="deltas-row" /> : <Deltas cmp={cmp} className="deltas-row" />)}
    </div>
  );
}

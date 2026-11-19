// Les critères, un seul pli fermé sous la fiche, « Comment c'est noté » (SPEC §18.37, §18.48, §18.76) : ce qu'un
// recruteur dit en cinq secondes, écrit par gabarit (shared/recruiterLine.ts),
// puis les huit critères en tuiles, deux colonnes à 390 px : nom court, note
// sur 10, mini-jauge. L'ordre du recruteur ; les critères sans note en bas,
// sous « Pas encore au dossier », en une seule ligne dès qu'ils sont plus de
// deux (jamais un mur de cases vides). Une tuile touchée prend un contour crème
// et montre sa pièce juste sous sa rangée ; le détail entier se déplie dans le pli
// (RecruiterGrid). L'école ne dit jamais de chiffre : « comptée » ou « hors moyenne » (§18.52).
// Un dossier à deux pièces (§18.36) : chaque tuile notée dit sous son nom où la
// note a été lue (« LinkedIn », « GitHub », « LinkedIn et GitHub ») ; une fiche
// seule n'en dit rien, la provenance y serait partout la même.
// Matte : aucun effet, aucune animation.
import { useEffect, useId, useRef, useState } from "react";
import { fileOf, pieceLabel } from "../../../shared/caseFile";
import { schoolState, usableGrid } from "../../../shared/gridText";
import { publicGrid } from "../../../shared/publicView";
import { recruiterRead, tileOrder } from "../../../shared/recruiterLine";
import type { CriterionCode, Grid, GridCriterion } from "../../../shared/types";
import { declaredOf } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { keptFrom, levelLabel, rowText } from "../lib/grid";
import { useAppConfig } from "../lib/season";
import { useReducedMotion } from "../lib/util";
import { Fold, type Shareable } from "./After";
import { RecruiterGrid } from "./RecruiterGrid";

/** Au-delà, les critères sans note tiennent en une ligne. */
const PENDING_TILES = 2;

/** Dix segments, lus par la tuile elle-même : la jauge est décorative. */
function MiniGauge({ c }: { c: GridCriterion }) {
  const n = c.score ?? 0;
  return (
    <span className={`rr-gauge is-${c.score === null ? "none" : c.state}`} aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < n ? "on" : undefined} />
      ))}
    </span>
  );
}

interface Props {
  item: Shareable;
  /** Vue par quelqu'un d'autre que la personne fichée : la grille publique. */
  shared: boolean;
  /** Le nom de la personne fichée (« @pseudo ») : plus dit depuis que le bloc est un pli (§18.76). */
  who?: string;
}

export function RecruiterRead({ item, shared }: Props) {
  const { t, lang } = useT();
  const [open, setOpen] = useState<CriterionCode | null>(null);
  const panel = useId();
  const cfg = useAppConfig();
  const reduced = useReducedMotion();
  const shown = useRef<HTMLLIElement>(null);
  // La pièce sort de l'écran : la page défile juste assez pour la montrer.
  useEffect(() => {
    if (open) shown.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [open, reduced]);
  const raw = item.kind === "card" ? item.card.grid : item.comparison.grid;
  if (!usableGrid(raw)) return null;
  const grid: Grid = shared ? publicGrid(raw) : raw;
  const R = t.read;
  // Le métier et le langage viennent de la fiche du dossier (shared/caseFile.ts), la grille aussi.
  const card = item.kind === "card" ? item.card : fileOf(item.comparison);
  const read = recruiterRead(card, grid, lang);
  // L'expérience (0.5.0) ne se note plus : pas de tuile, une ligne courte qui dit le niveau.
  const level = levelLabel(grid, lang);
  const order = tileOrder(grid);
  const scored = level ? order.scored.filter((c) => c.code !== "XP") : order.scored;
  const pending = level ? order.pending.filter((c) => c.code !== "XP") : order.pending;
  const declared = item.kind === "card" && item.card.source === "github" ? "linkedin" : declaredOf(item.kind === "card" ? item.card : item.comparison);
  const chosen = open ? grid.criteria.find((c) => c.code === open) : undefined;
  const detail = chosen ? rowText(chosen, { g: t.grid, pick: (f) => pick(f, lang), declared, shared }).line : "";

  const isCase = item.kind === "comparison";
  const src = pieceLabel(declared, lang);
  /** La provenance d'une tuile notée d'un dossier, null sinon. */
  const fromOf = (c: GridCriterion): string | null =>
    !isCase || c.private || c.score === null ? null : c.source === "both" ? R.fromBoth(src) : c.source === "github" ? pieceLabel("github") : src;

  const tile = (c: GridCriterion) => {
    const name = R.short[c.code];
    const from = fromOf(c);
    // L'école (§18.52) : « comptée » ou « hors moyenne », pareil pour la personne fichée et le visiteur.
    const school = schoolState(c);
    const kept = school !== null;
    const label = school === "counted"
      ? R.tileCounted(name)
      : school === "out" || c.private
        ? R.tileKept(name)
        : c.score === null
          ? R.tileNone(name)
          : from
            ? R.tileFrom(name, c.score, keptFrom(c, t.grid, declared))
            : R.tile(name, c.score);
    const tileLi = (
      <li key={c.code}>
        <button
          type="button"
          className={`rr-tile is-${kept ? "counted" : c.private ? "private" : c.score === null ? "none" : c.state}${from ? " has-from" : ""}`}
          aria-expanded={open === c.code}
          aria-controls={panel}
          aria-label={label}
          onClick={() => setOpen((o) => (o === c.code ? null : c.code))}
        >
          <span className="rr-name">{name}</span>
          {from && (
            <span className="rr-from" aria-hidden>
              {from}
            </span>
          )}
          {/* L'école : ni note ni jauge, sa note compte dans la moyenne sans se dire. */}
          {kept ? (
            <span className="rr-score rr-counted">{school === "counted" ? R.counted : R.out}</span>
          ) : (
            <span className="rr-score">
              {c.score ?? R.none}
              {c.score !== null && <small>/10</small>}
            </span>
          )}
          {!kept && <MiniGauge c={c} />}
        </button>
      </li>
    );
    if (open !== c.code) return tileLi;
    // La pièce juste sous la rangée de la tuile touchée : pleine largeur, la tuile voisine remonte (grille dense).
    return [
      tileLi,
      <li key={`${c.code}-piece`} className="rr-piece" ref={shown}>
        <p id={panel} aria-live="polite">
          <b>{t.grid.names[c.code]}</b> {detail.replace(/`/g, "")}
        </p>
      </li>,
    ];
  };

  // Un seul pli, fermé pour tout le monde (§18.76) : la ligne du recruteur, les tuiles, le détail replié, la mention du jeu.
  return (
    <Fold name="rr" title={t.grid.title}>
      {read && <p className="rr-line">{read.text}</p>}
      {level && <p className="rr-pending-line rr-level">{R.level(level)}</p>}
      {scored.length > 0 && (
        <ul className="rr-tiles" aria-label={t.grid.criteriaLabel}>
          {scored.map(tile)}
        </ul>
      )}
      {pending.length > PENDING_TILES ? (
        <p className="rr-pending-line">{R.pendingLine(pending.map((c) => R.short[c.code]).join(", "))}</p>
      ) : (
        pending.length > 0 && (
          <>
            <p className="rr-pending">{R.pending}</p>
            <ul className="rr-tiles" aria-label={R.pending}>
              {pending.map(tile)}
            </ul>
          </>
        )
      )}
      {/* Le calcul, critère par critère : un pli dans le pli, fermé (§18.76). */}
      <RecruiterGrid item={item} shared={shared} />
      {/* Une prime ouverte : la note ne décide rien, seules les primes mènent à un entretien. */}
      <p className="rr-game">{cfg?.primesOpen ? t.grid.gamePrimes : t.grid.game}</p>
    </Fold>
  );
}

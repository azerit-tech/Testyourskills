// Les critères, un seul bloc sous la fiche (SPEC §18.37, §18.48) : ce qu'un
// recruteur dit en cinq secondes, écrit par gabarit (shared/recruiterLine.ts),
// puis les huit critères en tuiles, deux colonnes à 390 px : nom court, note
// sur 10, mini-jauge. L'ordre du recruteur ; les critères sans note en bas,
// sous « Pas encore au dossier », en une seule ligne dès qu'ils sont plus de
// deux (jamais un mur de cases vides). Une tuile touchée prend un contour crème
// et montre sa pièce juste sous sa rangée ; le détail entier se déplie sur place
// (RecruiterGrid). L'école comptée ne dit jamais son niveau : « comptée au dossier ».
// Un dossier à deux pièces (§18.36) : chaque tuile notée dit sous son nom où la
// note a été lue (« LinkedIn », « GitHub », « LinkedIn et GitHub ») ; une fiche
// seule n'en dit rien, la provenance y serait partout la même.
// Matte : aucun effet, aucune animation.
import { useEffect, useId, useRef, useState } from "react";
import { fileOf, pieceLabel } from "../../../shared/caseFile";
import { usableGrid } from "../../../shared/gridText";
import { publicGrid } from "../../../shared/publicView";
import { recruiterRead, tileOrder } from "../../../shared/recruiterLine";
import type { CriterionCode, Grid, GridCriterion } from "../../../shared/types";
import { declaredOf } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { keptFrom, rowText, schoolKept } from "../lib/grid";
import { useAppConfig } from "../lib/season";
import { useReducedMotion } from "../lib/util";
import type { Shareable } from "./After";
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
  /** Vue par quelqu'un d'autre que la personne fichée : la grille publique, le titre à la troisième personne. */
  shared: boolean;
  who: string;
}

export function RecruiterRead({ item, shared, who }: Props) {
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
  const { scored, pending } = tileOrder(grid);
  const declared = item.kind === "card" && item.card.source === "github" ? "linkedin" : declaredOf(item.kind === "card" ? item.card : item.comparison);
  const chosen = open ? grid.criteria.find((c) => c.code === open) : undefined;
  const detail = chosen ? rowText(chosen, { g: t.grid, pick: (f) => pick(f, lang), declared, shared }).line : "";

  const isCase = item.kind === "comparison";
  const src = pieceLabel(declared);
  /** La provenance d'une tuile notée d'un dossier, null sinon. */
  const fromOf = (c: GridCriterion): string | null =>
    !isCase || c.private || c.score === null ? null : c.source === "both" ? R.fromBoth(src) : c.source === "github" ? pieceLabel("github") : src;

  const tile = (c: GridCriterion) => {
    const name = R.short[c.code];
    const from = fromOf(c);
    const kept = schoolKept(c);
    const label = c.private
      ? R.tileKept(name)
      : kept
        ? R.tileCounted(name)
        : c.score === null
          ? R.tileNone(name)
          : from
            ? R.tileFrom(name, c.score, keptFrom(c, t.grid, declared))
            : R.tile(name, c.score);
    const tileLi = (
      <li key={c.code}>
        <button
          type="button"
          className={`rr-tile is-${c.private ? "private" : c.score === null ? "none" : kept ? "counted" : c.state}${from ? " has-from" : ""}`}
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
            <span className="rr-score rr-counted">{R.counted}</span>
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

  return (
    <section className="after-block rr" id="grille" aria-labelledby="rr-title">
      <h2 id="rr-title">{shared ? t.grid.titleThem(who) : t.grid.title}</h2>
      {read && <p className="rr-line">{read.text}</p>}
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
      {/* Rien de touché : l'invitation, sous les tuiles. */}
      {!chosen && scored.length + (pending.length > PENDING_TILES ? 0 : pending.length) > 0 && (
        <p id={panel} className="rr-detail" aria-live="polite">
          {R.hint}
        </p>
      )}
      {/* Le détail, critère par critère : replié pour tout le monde, déplié sur place. */}
      <RecruiterGrid item={item} shared={shared} />
      {/* Une prime ouverte : la note ne décide rien, seules les primes mènent à un entretien. */}
      <p className="rr-game">{cfg?.primesOpen ? t.grid.gamePrimes : t.grid.game}</p>
    </section>
  );
}

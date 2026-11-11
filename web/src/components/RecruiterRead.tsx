// Sous la fiche, avant le pari (rapport « jugé comme par un recruteur », §3 ;
// SPEC §18.37) : ce qu'un recruteur dit en cinq secondes, écrit par gabarit
// (shared/recruiterLine.ts), puis les huit critères en tuiles, deux colonnes à
// 390 px : nom court, note sur 10, mini-jauge. L'ordre du recruteur ; les
// critères sans note en bas, sous « Pas encore au dossier ». Une tuile touchée
// montre sa pièce dessous ; le détail entier reste dans la grille (#grille).
// Matte : aucun effet, aucune animation.
import { useId, useState } from "react";
import { fileOf } from "../../../shared/caseFile";
import { usableGrid } from "../../../shared/gridText";
import { publicGrid } from "../../../shared/publicView";
import { recruiterRead, tileOrder } from "../../../shared/recruiterLine";
import type { CriterionCode, Grid, GridCriterion } from "../../../shared/types";
import { declaredOf } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { rowText } from "../lib/grid";
import type { Shareable } from "./After";

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

  const tile = (c: GridCriterion) => {
    const name = R.short[c.code];
    const label = c.private ? R.tileKept(name) : c.score === null ? R.tileNone(name) : R.tile(name, c.score);
    return (
      <li key={c.code}>
        <button
          type="button"
          className={`rr-tile is-${c.private ? "private" : c.score === null ? "none" : c.state}`}
          aria-expanded={open === c.code}
          aria-controls={panel}
          aria-label={label}
          onClick={() => setOpen((o) => (o === c.code ? null : c.code))}
        >
          <span className="rr-name">{name}</span>
          <span className="rr-score">
            {c.score ?? R.none}
            {c.score !== null && <small>/10</small>}
          </span>
          <MiniGauge c={c} />
        </button>
      </li>
    );
  };

  return (
    <section className="after-block rr" aria-labelledby="rr-title">
      <h2 id="rr-title">{shared ? R.titleThem(who) : R.title}</h2>
      {read && <p className="rr-line">{read.text}</p>}
      <ul className="rr-tiles" aria-label={t.grid.criteriaLabel}>
        {scored.map(tile)}
      </ul>
      {pending.length > 0 && (
        <>
          <p className="rr-pending">{R.pending}</p>
          <ul className="rr-tiles" aria-label={R.pending}>
            {pending.map(tile)}
          </ul>
        </>
      )}
      <p id={panel} className="rr-detail" aria-live="polite">
        {chosen ? (
          <>
            <b>{t.grid.names[chosen.code]}</b> {detail.replace(/`/g, "")}
          </>
        ) : (
          R.hint
        )}
      </p>
      <a className="rr-more" href="#grille">
        {R.more}
        <span aria-hidden> ↓</span>
      </a>
    </section>
  );
}

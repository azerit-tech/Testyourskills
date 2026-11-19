// Une bande sur une ligne (§18.38), sur le modèle du top de la semaine
// (WeekBoard) : rang, nom et dossiers, score en étoiles. En formation (§18.85) :
// ni rang ni étoiles, ce qu'il lui manque et ses trois emplacements.
import type { BandStanding } from "../../../shared/bands";
import { bandPath } from "../../../shared/bands";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";
import { BandSlots } from "./BandSlots";
import "./bands.css";

export function BandRow({ b }: { b: BandStanding }) {
  const { t } = useT();
  const tb = t.bands.board;
  const href = bandPath(b);
  if (b.rank === null) {
    return (
      <li>
        <a className="board-row band-row is-forming" href={href} onClick={(e) => onLinkClick(e, href)} aria-label={tb.formingLabel(b.label, b.members)}>
          <span className="band-name">
            <span className="board-login">{b.label}</span>
            <span className="band-count">{tb.missing(b.missing)}</span>
          </span>
          <BandSlots members={b.members} mini />
        </a>
      </li>
    );
  }
  return (
    <li>
      <a className="board-row band-row" href={href} onClick={(e) => onLinkClick(e, href)} aria-label={tb.rowLabel(b.rank, b.label, b.score, b.members)}>
        <span className="board-rank">{b.rank}</span>
        <span className="band-name">
          <span className="board-login">{b.label}</span>
          <span className="band-count">{t.bands.dossiers(b.members)}</span>
        </span>
        {/* l'unité est dans l'en-tête du tableau (« Étoiles ») : la ligne porte le nombre seul */}
        <span className="band-score">{b.score}</span>
      </a>
    </li>
  );
}

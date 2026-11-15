// Une bande sur une ligne (§18.38), sur le modèle du top de la semaine
// (WeekBoard) : rang, nom et dossiers, score en étoiles.
import type { BandStanding } from "../../../shared/bands";
import { bandPath } from "../../../shared/bands";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";
import "./bands.css";

export function BandRow({ b }: { b: BandStanding }) {
  const { t } = useT();
  const href = bandPath(b);
  return (
    <li>
      <a className="board-row band-row" href={href} onClick={(e) => onLinkClick(e, href)} aria-label={t.bands.board.rowLabel(b.rank, b.label, b.score, b.members)}>
        <span className="board-rank">{b.rank ?? ""}</span>
        <span className="band-name">
          <span className="board-login">{b.label}</span>
          <span className="band-count">{b.rank ? t.bands.dossiers(b.members) : `${t.bands.forming}, ${t.bands.dossiers(b.members)}`}</span>
        </span>
        {/* l'unité est dans l'en-tête du tableau (« Étoiles ») : la ligne porte le nombre seul */}
        <span className="band-score">{b.score}</span>
      </a>
    </li>
  );
}

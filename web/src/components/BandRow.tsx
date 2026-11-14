// Une bande sur une ligne (§18.38), sur le modèle du top de la semaine
// (WeekBoard) : rang, nom et dossiers, score en étoiles.
import type { BandStanding } from "../../../shared/bands";
import { bandPath } from "../../../shared/bands";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";
import "./bands.css";

const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

export const Star = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d={STAR} />
  </svg>
);

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
        <span className="band-score">
          <Star />
          {b.score}
        </span>
      </a>
    </li>
  );
}

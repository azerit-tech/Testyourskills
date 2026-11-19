// Une bande sur une ligne (§18.38), sur le modèle du top de la semaine
// (WeekBoard) : rang, nom et dossiers, score en étoiles. En formation (§18.85) :
// ni rang ni étoiles, ce qu'il lui manque et ses trois emplacements. La bande de
// la page où l'on est (§18.87) : sa ligne est marquée et ne mène nulle part.
import type { BandStanding } from "../../../shared/bands";
import { bandPath } from "../../../shared/bands";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";
import { BandSlots } from "./BandSlots";
import "./bands.css";

export function BandRow({ b, current = false }: { b: BandStanding; current?: boolean }) {
  const { t } = useT();
  const tb = t.bands.board;
  const href = bandPath(b);
  const forming = b.rank === null;
  const label = b.rank === null ? tb.formingLabel(b.label, b.members) : tb.rowLabel(b.rank, b.label, b.score, b.members);
  const cls = `board-row band-row${forming ? " is-forming" : ""}${current ? " is-current" : ""}`;
  const cells = (
    <>
      {!forming && <span className="board-rank">{b.rank}</span>}
      <span className="band-name">
        <span className="board-login">{b.label}</span>
        <span className="band-count">{forming ? tb.missing(b.missing) : t.bands.dossiers(b.members)}</span>
      </span>
      {/* l'unité est dans l'en-tête du tableau (« Étoiles ») : la ligne porte le nombre seul */}
      {forming ? <BandSlots members={b.members} mini /> : <span className="band-score">{b.score}</span>}
    </>
  );
  if (current) {
    return (
      <li aria-current="page">
        {/* pas un lien vers la page où l'on est : la phrase pour un lecteur d'écran, les cases pour l'œil */}
        <span className="sr-only">{label}</span>
        <div className={cls} aria-hidden>
          {cells}
        </div>
      </li>
    );
  }
  return (
    <li>
      <a className={cls} href={href} onClick={(e) => onLinkClick(e, href)} aria-label={label}>
        {cells}
      </a>
    </li>
  );
}

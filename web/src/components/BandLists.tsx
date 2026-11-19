// Les listes d'une ligue (§18.85, §18.87), les mêmes sur /bandes et sur la page
// d'une bande : « Au tableau » (rang, nom, fiches, étoiles), une bande classée
// plus bas sous sa propre étiquette, puis « En formation » (sans étoiles).
import type { BandStanding } from "../../../shared/bands";
import { useT } from "../i18n";
import { BandRow } from "./BandRow";
import "./bands.css";

interface Props {
  /** Les bandes au tableau, dans l'ordre. */
  entries: BandStanding[];
  /** Une bande classée plus bas que les lignes montrées, sous son étiquette (« Ta bande », « Cette bande »). */
  lower?: { tag: string; band: BandStanding } | null;
  /** Les bandes en formation. */
  forming: BandStanding[];
  /** La bande de la page où l'on est : sa ligne est marquée, sans lien vers elle-même. */
  current?: string;
  /** Sa propre bande, sur l'accueil (§18.89) : sa ligne est mise en évidence, et mène à sa page. */
  mine?: string;
}

export function BandLists({ entries, lower = null, forming, current, mine }: Props) {
  const { t } = useT();
  const tb = t.bands.board;
  const row = (b: BandStanding) => <BandRow key={b.id} b={b} current={b.id === current} me={b.id === mine} />;
  return (
    <>
      {entries.length > 0 && (
        <div className="board-top">
          <p className="board-tag">{tb.ranked}</p>
          <span className="board-scale" aria-hidden>
            {tb.scale}
          </span>
          <ol className="board-list is-top">{entries.map(row)}</ol>
        </div>
      )}
      {lower && (
        <div className="board-top bands-yours">
          <p className="board-tag">{lower.tag}</p>
          <span className="board-scale" aria-hidden>
            {tb.scale}
          </span>
          <ol className="board-list is-top">{row(lower.band)}</ol>
        </div>
      )}
      {forming.length > 0 && (
        <div className="board-top bands-forming">
          <p className="board-tag">{t.bands.forming}</p>
          <ul className="board-list is-top">{forming.map(row)}</ul>
        </div>
      )}
    </>
  );
}

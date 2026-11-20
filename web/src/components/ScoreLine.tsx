// Ce que dit la note, en toutes lettres (§18.122) : « Ton profil a un score de 82 % » au-dessus de la
// fiche, le nombre en grand ; « Son profil… » pour le visiteur. Sa place est tenue pendant le film
// (la fiche se taille dessous), la phrase paraît quand la fiche est posée : le film ne la dévoile pas.
import { useT } from "../i18n";

export function ScoreLine({ overall, own, shown }: { overall: number; own: boolean; shown: boolean }) {
  const { t } = useT();
  const s = t.result.score;
  return (
    <p className={`score-line${shown ? " is-on" : ""}`} aria-hidden={shown ? undefined : true}>
      <span className="score-say">
        {own ? s.own : s.their} <b className="score-pct">{s.pct(overall)}</b>
      </span>
      <span className="score-means">{s.means}</span>
    </p>
  );
}

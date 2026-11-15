// « Revoir ma poursuite » / « Voir ma poursuite » / « Voir la poursuite » (§18.48) :
// un lien discret dans la tête de la fiche, qui relance le film depuis le début.
// « Voir ma poursuite » tant que le film n'a pas joué ici (replié faute de réseau,
// ou jamais proposé en mouvement réduit : il ne joue alors que sur ce geste). Autonome, pour
// changer de place sans rien emporter : la page lui passe ce qui relance.
// Rien du film ne se télécharge avant le toucher ; le toucher est un geste, il
// débloque les deux balises vidéo et le son, comme l'envoi du formulaire et la
// pilule de l'attente. Dans le paquet de l'accueil : quelques lignes, le film
// lui-même se charge à part.
import { useT } from "../i18n";
import { unlockAudio } from "../lib/audio";
import { filmTrace } from "./trace";
import { unlockFilm } from "./unlock";
import "./chaseLink.css";

interface Props {
  /** La fiche de la personne qui la regarde : « Revoir ma poursuite » ; sinon « Voir la poursuite ». */
  mine: boolean;
  /** Le film a déjà joué dans ce navigateur ; sinon, pour sa fiche, « Voir ma poursuite ». */
  seen?: boolean;
  onPlay: () => void;
}

export function ChaseLink({ mine, seen = true, onPlay }: Props) {
  const { t } = useT();
  const play = () => {
    filmTrace(mine ? "revoir" : "voir");
    unlockAudio();
    unlockFilm();
    onPlay();
  };
  return (
    <button type="button" className="chase-link" onClick={play}>
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M3 1.6v8.8l7.4-4.4z" fill="currentColor" />
      </svg>
      <span>{!mine ? t.reveal.watch : seen ? t.reveal.replay : t.reveal.watchMine}</span>
    </button>
  );
}

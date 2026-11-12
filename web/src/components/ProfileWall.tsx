// Le mur des 13 profils sur l'accueil (§18.28) : chaque profil criminel sur son
// décor peint (`default` pour un profil sans décor à l'affiche, shared/scenes.ts), le nom et la phrase en bas à gauche. Téléphone : un rail aimanté
// qui déborde à droite ; ordinateur : une grille pleine. La dernière tuile,
// « Et toi ? », ramène au champ du pseudo. Textes lus dans data/profiles.json
// (déjà dans le paquet de l'accueil par les fixtures), sans appel au serveur.
import profilesJson from "../../../data/profiles.json";
import type { CardProfile } from "../../../shared/types";
import { sceneOf } from "../../../shared/scenes";
import { pick, useT } from "../i18n";

/** Les plus parlants d'abord ; un profil absent de la liste passe à la fin. */
export const WALL_ORDER = [
  "arsonist",
  "night_owl",
  "repeat_offender",
  "forger",
  "delivery_machine",
  "mastermind",
  "kingpin",
  "chameleon",
  "hoarder",
  "ghost",
  "fresh_blood",
  "old_school",
  "sleeper_agent",
];

const rank = (id: string) => {
  const i = WALL_ORDER.indexOf(id);
  return i < 0 ? WALL_ORDER.length : i;
};

/** Les profils du mur, dans l'ordre, réduits à ce qui s'affiche. */
export const WALL_PROFILES: CardProfile[] = profilesJson.profiles
  .map(({ id, label, tagline }) => ({ id, label, tagline }))
  .sort((a, b) => rank(a.id) - rank(b.id));

export function ProfileWall({ onPlay }: { onPlay: () => void }) {
  const { t, lang } = useT();
  const w = t.home.wall;
  return (
    <section className="wall" aria-labelledby="wall-title">
      <h2 id="wall-title">{w.title}</h2>
      {/* Focusable : au clavier, les flèches font défiler le rail. role="list" :
       * sans puces, Safari ne lirait plus une liste. */}
      <ul className="wall-list" role="list" aria-labelledby="wall-title" tabIndex={0}>
        {WALL_PROFILES.map((p) => (
          <li key={p.id} className="wall-tile">
            <img className="wall-img" src={`/profiles/${sceneOf(p.id)}-s.jpg`} alt="" width={576} height={384} loading="lazy" decoding="async" />
            <div className="wall-text">
              <h3 className="wall-name">{pick(p.label, lang)}</h3>
              <p className="wall-tagline">{pick(p.tagline, lang)}</p>
            </div>
          </li>
        ))}
        <li className="wall-tile wall-cta">
          <h3 className="wall-name">{w.you}</h3>
          <button type="button" className="pill" onClick={onPlay}>
            {w.cta}
          </button>
        </li>
      </ul>
    </section>
  );
}
